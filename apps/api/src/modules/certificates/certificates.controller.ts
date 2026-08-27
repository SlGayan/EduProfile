import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import PDFDocument from 'pdfkit';
import { issueCertificateSchema } from '../../validators/certificateValidators.js';

const prisma = new PrismaClient();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SINHALA_FONT_PATH = path.join(__dirname, '../../assets/fonts/NotoSansSinhala.ttf');
const SCHOOL_NAME_SINHALA = 'කෑ/ධර්මසිරි සේනානායක මධ්‍ය මහා විද්‍යාලය';

const CHARACTER_GRADE_LABELS: Record<string, string> = {
  GOOD: 'good',
  VERY_GOOD: 'very good',
  EXCELLENT: 'excellent',
};

// count() + create() is not atomic; two concurrent issuances in the same
// year can compute the same sequence number and collide on the id primary
// key. Retrying on that specific collision keeps issuance correct without
// needing an advisory lock.
async function createCertificateWithRetry(
  data: Omit<Prisma.CharacterCertificateCreateInput, 'id'>,
  maxAttempts = 5
) {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const count = await prisma.characterCertificate.count({
      where: { id: { startsWith: `DSCTH/CC/${year}/` } },
    });
    const sequence = (count + 1 + attempt).toString().padStart(4, '0');
    const certificateId = `DSCTH/CC/${year}/${sequence}`;

    try {
      return await prisma.characterCertificate.create({
        data: { id: certificateId, ...data },
      });
    } catch (err) {
      const isUniqueCollision =
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!isUniqueCollision || attempt === maxAttempts - 1) throw err;
    }
  }
  throw new Error('Failed to generate a unique certificate reference number');
}

export const issueCertificate = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = issueCertificateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }
    const {
      studentId,
      selectedActivities,
      reasonForLeaving,
      characterGrade,
      studentAttributes,
      academicSummary,
    } = parsed.data;

    const principalId = req.user!.id;

    const student = await prisma.student.findUnique({
      where: { id: studentId, user: { deletedAt: null } },
      include: {
        termMarks: { include: { subject: true } },
        activities: { where: { id: { in: selectedActivities }, status: 'APPROVED' } },
      },
    });

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    // The full printed content lives in this snapshot, including the
    // principal's remarks — not just separate mutable columns — so the
    // certificate stays an immutable record even if those columns are
    // later edited directly in the database.
    const contentSnapshot = {
      fullName: student.fullName,
      admissionNumber: student.admissionNumber,
      dateOfBirth: student.dateOfBirth,
      dateOfAdmission: student.dateOfAdmission,
      admissionGrade: student.admissionGrade,
      attendancePercentage: student.attendancePercentage,
      activities: student.activities,
      termMarks: student.termMarks,
      reasonForLeaving: reasonForLeaving ?? null,
      characterGrade,
      studentAttributes: studentAttributes ?? null,
      academicSummary: academicSummary ?? null,
    };

    const certificate = await createCertificateWithRetry({
      student: { connect: { id: studentId } },
      principal: { connect: { id: principalId } },
      selectedActivities: selectedActivities.map(String),
      reasonForLeaving: reasonForLeaving ?? null,
      characterGrade,
      studentAttributes: studentAttributes ?? null,
      academicSummary: academicSummary ?? null,
      contentSnapshot: contentSnapshot as any,
    });

    return res.status(201).json(certificate);
  } catch (error) {
    console.error('Error issuing certificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Looks up a certificate by its (URL-encoded) id param. Shared by the
 * principal-facing and student-facing PDF routes so ownership checks can be
 * layered on by each caller before streaming the PDF.
 */
export async function findCertificateByIdParam(rawId: string) {
  const decodedId = decodeURIComponent(rawId);
  return prisma.characterCertificate.findUnique({ where: { id: decodedId } });
}

type CharacterCertificateRecord = NonNullable<
  Awaited<ReturnType<typeof findCertificateByIdParam>>
>;

/**
 * Streams the certificate PDF onto `res`. Extracted from getCertificatePdf so
 * the student-facing "download my own certificate" route (students.ts) can
 * reuse the exact same rendering after its own ownership check, instead of
 * duplicating this ~100-line PDFKit layout.
 */
export function streamCertificatePdf(certificate: CharacterCertificateRecord, res: Response) {
  try {
    const decodedId = certificate.id;
    const snapshot = certificate.contentSnapshot as any;

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Character_Certificate_${decodedId.replace(/\//g, '_')}.pdf`
    );

    doc.pipe(res);

    doc.registerFont('Sinhala', SINHALA_FONT_PATH);

    // Header
    doc.font('Helvetica-Bold').fontSize(16).text('KG/DHARMASIRI SENANAYAKE CENTRAL COLLEGE', { align: 'center' });
    doc.font('Sinhala').fontSize(14).text(SCHOOL_NAME_SINHALA, { align: 'center' });
    doc.font('Helvetica').fontSize(14).text('THULHIRIYA', { align: 'center' });
    doc.fontSize(12).text('Principal TP : 035-3228094      e-mail : dscthulhiriya@gmail.com', { align: 'center' });
    doc.text('TP /FAX : 037-2053088', { align: 'center' });
    doc.moveDown(2);

    // Reference & Date
    doc.fontSize(11).text(`Ref No: ${certificate.id}`, { continued: true });
    doc.text(`Date: ${certificate.issuedAt.toLocaleDateString()}`, { align: 'right' });
    doc.moveDown(2);

    // Title
    doc.fontSize(14).font('Helvetica-Bold').text('TO WHOM IT MAY CONCERN', { align: 'center' });
    doc.moveDown(2);

    // Body
    doc.fontSize(12).font('Helvetica');

    const admDate = snapshot.dateOfAdmission ? new Date(snapshot.dateOfAdmission).toLocaleDateString() : 'N/A';

    doc.text(`This is to certify that ${snapshot.fullName} (Admission No: ${snapshot.admissionNumber || 'N/A'}) was a bona fide student of KG/Dharmasiri Senanayake Central College, Thulhiriya from ${admDate} to ${certificate.issuedAt.toLocaleDateString()}.`);
    doc.moveDown();

    doc.text('According to our school records, his/her particulars are as follows:');
    doc.moveDown();

    const dob = snapshot.dateOfBirth ? new Date(snapshot.dateOfBirth).toLocaleDateString() : 'N/A';
    doc.text(`Date of Birth: ${dob}`);
    doc.text(`Grade on Admission: Grade ${snapshot.admissionGrade || 'N/A'}`);
    doc.text(`Academic Performance: ${snapshot.academicSummary || 'N/A'}`);
    doc.moveDown();

    doc.text('Extracurricular Activities & Achievements:');
    if (snapshot.activities && snapshot.activities.length > 0) {
      snapshot.activities.forEach((act: any) => {
        doc.text(`- ${act.activityName} (${act.activityType}): ${act.achievements || act.description || ''}`, { indent: 20 });
      });
    } else {
      doc.text('None recorded.', { indent: 20 });
    }
    doc.moveDown();

    doc.text(`Overall Attendance: ${snapshot.attendancePercentage ?? 'N/A'}%`);
    if (snapshot.reasonForLeaving) {
      doc.text(`Reason for Leaving: ${snapshot.reasonForLeaving}`);
    }
    doc.moveDown();

    const gradeLabel = CHARACTER_GRADE_LABELS[snapshot.characterGrade] ?? snapshot.characterGrade;
    doc.text('Character and Conduct:');
    doc.text(`Based on the disciplinary records and teachers' evaluations during his/her tenure at the school, he/she has displayed a ${gradeLabel} moral character. He/She is a ${snapshot.studentAttributes || 'well-behaved'} student who maintained exemplary discipline and cooperated well with the school community.`);
    doc.moveDown(2);

    doc.text('We wish him/her all the best in his/her future endeavors.');
    doc.moveDown(4);

    const signatureY = doc.y;
    doc.text('...........................................................');
    doc.text('Principal');
    doc.text('KG/Dharmasiri Senanayake Central College');
    doc.text('Thulhiriya.');

    // Seal placeholder — a dedicated space for the physical school seal,
    // separate from the signature line, per the certificate template.
    doc
      .rect(doc.page.width - 200, signatureY, 120, 90)
      .stroke();
    doc
      .fontSize(9)
      .text('Official Seal', doc.page.width - 200, signatureY + 40, { width: 120, align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export const getCertificatePdf = async (req: Request, res: Response) => {
  try {
    const certificate = await findCertificateByIdParam(req.params.id as string);

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    streamCertificatePdf(certificate, res);
  } catch (error) {
    console.error('Error fetching certificate:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/certificates/eligible-count — principal dashboard scorecard.
 *
 * A character certificate is issued directly with no request/approval step,
 * so "pending" here means "ready to issue": an active student with at least
 * one approved activity or approved self-added certificate on record who has
 * never had a character certificate issued at all. Re-issuing for a student
 * who already has one is a deliberate principal action from the search flow,
 * not something this count should keep nudging about.
 */
export const getEligibleForCertificateCount = async (_req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.student.count({
      where: {
        user: { deletedAt: null },
        certificates: { none: {} },
        OR: [
          { activities: { some: { status: 'APPROVED' } } },
          { studentCertificates: { some: { status: 'APPROVED' } } },
        ],
      },
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error('Error counting certificate-eligible students:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const certificates = await prisma.characterCertificate.findMany({
      include: { student: true },
      orderBy: { issuedAt: 'desc' },
    });

    return res.status(200).json(certificates);
  } catch (error) {
    console.error('Error listing certificates:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/students/me/certificates — the caller's own record, role STUDENT.
 * Mirrors listMyActivities/listMyMaterials: identity comes from the verified
 * token, so there is no cross-student authorization check to perform.
 *
 * MUST be registered above `/:id/...` in routes/students.ts — otherwise
 * `/me/certificates` matches a param route with id="me" first.
 */
export const listMyCertificates = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const certificates = await prisma.characterCertificate.findMany({
      where: { studentId: student.id },
      select: { id: true, issuedAt: true, characterGrade: true },
      orderBy: { issuedAt: 'desc' },
    });

    // Empty is `200 []`, never 404 — matches listMyActivities/listMyMaterials
    // so the page's empty state depends on the same contract.
    return res.status(200).json(certificates);
  } catch (error) {
    console.error('Error listing own certificates:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/students/me/certificates/:id/pdf — download the caller's own
 * certificate. Ownership is checked here (student.id must match the
 * certificate's studentId) rather than relying on a route-level guard, since
 * the principal-facing getCertificatePdf above intentionally has no such
 * restriction.
 */
export const getMyCertificatePdf = async (req: AuthRequest, res: Response) => {
  try {
    const student = await prisma.student.findUnique({
      where: { userId: req.user!.id, user: { deletedAt: null } },
      select: { id: true },
    });
    if (!student) {
      return res.status(404).json({ error: 'Student profile not found' });
    }

    const certificate = await findCertificateByIdParam(req.params.id as string);
    if (!certificate || certificate.studentId !== student.id) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    streamCertificatePdf(certificate, res);
  } catch (error) {
    console.error('Error fetching own certificate PDF:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
