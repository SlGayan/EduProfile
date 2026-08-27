import { randomUUID } from 'crypto';
import path from 'path';
import { Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { createMaterialSchema, materialListQuerySchema, POSTGRES_INT4_MAX } from '../../validators/materialValidators.js';
import { uploadBlob, deleteBlob, blobExists, getDownloadSasUrl, getLocalBlobAbsolutePath } from './materials.blob.js';

const prisma = new PrismaClient();

function serializeMaterial(material: {
  id: number;
  title: string;
  description: string | null;
  fileUrl: string;
  fileType: string;
  classId: number | null;
  subjectId: number | null;
  uploadedBy: { id: number };
  createdAt: Date;
}) {
  return {
    id: String(material.id),
    title: material.title,
    description: material.description,
    fileUrl: material.fileUrl,
    fileType: material.fileType,
    classId: material.classId !== null ? String(material.classId) : null,
    subjectId: material.subjectId !== null ? String(material.subjectId) : null,
    uploadedBy: { id: String(material.uploadedBy.id), name: null as string | null },
    createdAt: material.createdAt.toISOString(),
  };
}

export const createMaterial = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No file uploaded, or file type not allowed (PDF, DOC, image only)' });
    }

    const parsed = createMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { title, description, classId, subjectId } = parsed.data;

    if (classId !== undefined) {
      const classExists = await prisma.class.findUnique({ where: { id: classId } });
      if (!classExists) {
        return res.status(404).json({ error: 'Class not found' });
      }
    }

    if (subjectId !== undefined) {
      const subjectExists = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subjectExists) {
        return res.status(404).json({ error: 'Subject not found' });
      }
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
    });

    if (!teacher) {
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    // AD-4: blob write first, DB insert second. A failed insert after a
    // successful blob write is compensated by deleting the just-written blob
    // (below) — the reverse ordering would risk a row pointing at nothing.
    const blobKey = `${randomUUID()}${path.extname(req.file.originalname)}`;
    await uploadBlob(blobKey, req.file.buffer, req.file.mimetype);

    try {
      const material = await prisma.studyMaterial.create({
        data: {
          title,
          description: description ?? null,
          fileUrl: blobKey,
          fileType: req.file.mimetype,
          uploadedById: teacher.id,
          classId: classId ?? null,
          subjectId: subjectId ?? null,
        },
        include: { uploadedBy: { select: { id: true } } },
      });

      return res.status(201).json(serializeMaterial(material));
    } catch (err) {
      await deleteBlob(blobKey).catch((cleanupErr) =>
        console.error('Failed to compensate blob after DB insert failure:', cleanupErr)
      );
      throw err;
    }
  } catch (err) {
    console.error('Error creating material:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listMaterials = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = materialListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { classId, subjectId } = parsed.data;

    const where: Prisma.StudyMaterialWhereInput =
      classId !== undefined ? { classId } : { subjectId: subjectId! };

    const materials = await prisma.studyMaterial.findMany({
      where,
      include: { uploadedBy: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(materials.map(serializeMaterial));
  } catch (err) {
    console.error('Error listing materials:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * A Student has no direct relation to Subject — only via TermMark. Derives
 * the student's implicit "my subjects" list from distinct subjectIds across
 * their TermMark rows, alongside their directly-related classes. Shared by
 * listMyMaterials and downloadMaterial's STUDENT entitlement check so the
 * derivation logic lives in exactly one place.
 */
async function getStudentMaterialScope(studentId: number): Promise<{ classIds: number[]; subjectIds: number[] }> {
  const [student, termMarks] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { classes: { select: { id: true } } } }),
    prisma.termMark.findMany({ where: { studentId }, select: { subjectId: true }, distinct: ['subjectId'] }),
  ]);

  return {
    classIds: student?.classes.map((c) => c.id) ?? [],
    subjectIds: termMarks.map((t) => t.subjectId),
  };
}

/**
 * MUST be registered above `/:id/activities`-style routes in students.ts —
 * same reasoning as Story 8.4's `listMyActivities`: registered below a
 * `:id`-shaped route, `/me/materials` would match with id="me" and be
 * rejected by that route's role guard before reaching this handler.
 */
export const listMyMaterials = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const { classIds, subjectIds } = await getStudentMaterialScope(student.id);

    if (classIds.length === 0 && subjectIds.length === 0) {
      // Empty is 200 [], never 404 — the page's empty state depends on it.
      return res.status(200).json([]);
    }

    const materials = await prisma.studyMaterial.findMany({
      where: {
        OR: [
          ...(classIds.length > 0 ? [{ classId: { in: classIds } }] : []),
          ...(subjectIds.length > 0 ? [{ subjectId: { in: subjectIds } }] : []),
        ],
      },
      include: { uploadedBy: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json(materials.map(serializeMaterial));
  } catch (err) {
    console.error('Error listing own materials:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function sanitizeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'download';
}

export const downloadMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const rawId = req.params.id as string;
    if (!/^\d+$/.test(rawId) || parseInt(rawId, 10) > POSTGRES_INT4_MAX) {
      return res.status(400).json({ error: 'Invalid material ID' });
    }
    const id = parseInt(rawId, 10);

    const material = await prisma.studyMaterial.findUnique({ where: { id } });

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const normalizedRole = req.user!.role === 'admin' ? 'ADMINISTRATOR' : req.user!.role.toUpperCase();

    if (normalizedRole === 'STUDENT') {
      const student = await prisma.student.findUnique({
        where: { userId: req.user!.id, user: { deletedAt: null } },
        select: { id: true },
      });
      if (!student) {
        return res.status(403).json({ error: 'You do not have access to this material' });
      }
      const { classIds, subjectIds } = await getStudentMaterialScope(student.id);
      const entitled =
        (material.classId !== null && classIds.includes(material.classId)) ||
        (material.subjectId !== null && subjectIds.includes(material.subjectId));
      if (!entitled) {
        return res.status(403).json({ error: 'You do not have access to this material' });
      }
    }
    // TEACHER/ADMINISTRATOR: unrestricted, matching listMaterials's access
    // model (any teacher/admin can see and now download any material).
    // Note this is intentionally more permissive than deleteMaterial, which
    // restricts non-admin teachers to materials they personally uploaded —
    // downloading is lower-risk than deleting, and teachers already see
    // every material via the list endpoint regardless of who uploaded it.

    // AD-5: check existence before minting a SAS, so a missing blob (e.g. an
    // orphaned row) returns this app's JSON error envelope rather than
    // letting the redirected browser hit a raw Azure error page.
    const blobKey = path.basename(material.fileUrl);
    if (!(await blobExists(blobKey))) {
      return res.status(404).json({ error: 'File not found in storage' });
    }

    const downloadFilename = `${sanitizeFilename(material.title)}${path.extname(material.fileUrl)}`;
    const sasUrl = await getDownloadSasUrl(blobKey, downloadFilename);
    return res.redirect(302, sasUrl);
  } catch (err) {
    console.error('Error downloading material:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Dev-only counterpart to materials.blob's local-disk fallback: streams a
 * blob straight off disk when Azure isn't reachable locally. The real
 * entitlement check already ran in downloadMaterial before it redirected
 * here; this route just needs a valid session and never runs in production
 * (materials.blob only ever hands out a /local-blob URL when
 * NODE_ENV !== 'production').
 */
export const serveLocalBlob = async (req: AuthRequest, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const key = req.params.key as string;
  if (!/^[A-Za-z0-9_.-]+$/.test(key)) {
    return res.status(400).json({ error: 'Invalid key' });
  }

  const filename = typeof req.query.filename === 'string' ? req.query.filename : key;
  return res.download(getLocalBlobAbsolutePath(key), filename, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ error: 'File not found in local storage' });
    }
  });
};

export const deleteMaterial = async (req: AuthRequest, res: Response) => {
  try {
    const rawId = req.params.id as string;
    if (!/^\d+$/.test(rawId) || parseInt(rawId, 10) > POSTGRES_INT4_MAX) {
      return res.status(400).json({ error: 'Invalid material ID' });
    }
    const id = parseInt(rawId, 10);

    const material = await prisma.studyMaterial.findUnique({
      where: { id },
      include: { uploadedBy: { select: { userId: true } } },
    });

    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const normalizedRole = req.user!.role === 'admin' ? 'ADMINISTRATOR' : req.user!.role.toUpperCase();
    if (normalizedRole !== 'ADMINISTRATOR' && material.uploadedBy.userId !== req.user!.id) {
      return res.status(403).json({ error: 'You can only delete materials you uploaded' });
    }

    try {
      await prisma.studyMaterial.delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        return res.status(404).json({ error: 'Material not found' });
      }
      throw err;
    }

    // AD-4: DB row deleted first (above), blob second — unchanged ordering
    // from before. A failure here leaves an orphaned blob (wasted storage,
    // harmless) rather than a row pointing at nothing.
    await deleteBlob(path.basename(material.fileUrl)).catch((err) =>
      console.error('Failed to delete blob after material row deletion:', err)
    );

    return res.status(200).json({ message: 'Material deleted' });
  } catch (err) {
    console.error('Error deleting material:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
