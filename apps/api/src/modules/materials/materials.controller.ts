import fs from 'fs';
import path from 'path';
import { Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { createMaterialSchema, materialListQuerySchema, POSTGRES_INT4_MAX } from '../../validators/materialValidators.js';

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

function unlinkQuiet(filePath: string) {
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.error('Failed to remove uploaded file:', err);
    }
  });
}

export const createMaterial = async (req: AuthRequest, res: Response) => {
  const uploadedFilePath = req.file?.path;

  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ error: 'No file uploaded, or file type not allowed (PDF, DOC, image only)' });
    }

    const parsed = createMaterialSchema.safeParse(req.body);
    if (!parsed.success) {
      unlinkQuiet(uploadedFilePath!);
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { title, description, classId, subjectId } = parsed.data;

    if (classId !== undefined) {
      const classExists = await prisma.class.findUnique({ where: { id: classId } });
      if (!classExists) {
        unlinkQuiet(uploadedFilePath!);
        return res.status(404).json({ error: 'Class not found' });
      }
    }

    if (subjectId !== undefined) {
      const subjectExists = await prisma.subject.findUnique({ where: { id: subjectId } });
      if (!subjectExists) {
        unlinkQuiet(uploadedFilePath!);
        return res.status(404).json({ error: 'Subject not found' });
      }
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
    });

    if (!teacher) {
      unlinkQuiet(uploadedFilePath!);
      return res.status(403).json({ error: 'Teacher profile not found' });
    }

    const fileUrl = `/uploads/study-materials/${req.file.filename}`;

    const material = await prisma.studyMaterial.create({
      data: {
        title,
        description: description ?? null,
        fileUrl,
        fileType: req.file.mimetype,
        uploadedById: teacher.id,
        classId: classId ?? null,
        subjectId: subjectId ?? null,
      },
      include: { uploadedBy: { select: { id: true } } },
    });

    return res.status(201).json(serializeMaterial(material));
  } catch (err) {
    console.error('Error creating material:', err);
    if (uploadedFilePath) {
      unlinkQuiet(uploadedFilePath);
    }
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

    const filePath = path.join(
      process.cwd(),
      'uploads',
      'study-materials',
      path.basename(material.fileUrl)
    );
    unlinkQuiet(filePath);

    return res.status(200).json({ message: 'Material deleted' });
  } catch (err) {
    console.error('Error deleting material:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
