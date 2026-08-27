import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { createCertificateTemplateSchema, updateCertificateTemplateSchema } from '../../validators/certificateTemplateValidators.js';

const prisma = new PrismaClient();

const CREATOR_SELECT = { createdBy: { select: { email: true } } } as const;

// parseInt("12abc", 10) === 12, so a bare parseInt would let a
// partially-numeric id slip through as a valid lookup. Require the whole
// param to be digits first.
function parseTemplateId(rawId: unknown): number | null {
  if (typeof rawId !== 'string' || !/^\d+$/.test(rawId)) return null;
  return parseInt(rawId, 10);
}

// POST /api/certificate-templates
export const createCertificateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createCertificateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const { name, layoutData } = parsed.data;

    const template = await prisma.certificateTemplate.create({
      data: {
        name,
        layoutData: layoutData as object,
        createdById: req.user!.id,
      },
      include: CREATOR_SELECT,
    });

    return res.status(201).json({ template });
  } catch (err) {
    console.error('Error creating certificate template:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/certificate-templates
export const listCertificateTemplates = async (_req: AuthRequest, res: Response) => {
  try {
    const templates = await prisma.certificateTemplate.findMany({
      include: CREATOR_SELECT,
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({ templates });
  } catch (err) {
    console.error('Error listing certificate templates:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// GET /api/certificate-templates/:id
export const getCertificateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseTemplateId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid template ID' });

    const template = await prisma.certificateTemplate.findUnique({
      where: { id },
      include: CREATOR_SELECT,
    });
    if (!template) return res.status(404).json({ error: 'Certificate template not found' });

    return res.status(200).json({ template });
  } catch (err) {
    console.error('Error fetching certificate template:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// PATCH /api/certificate-templates/:id
export const updateCertificateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseTemplateId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid template ID' });

    const parsed = updateCertificateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const existing = await prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Certificate template not found' });

    const { name, layoutData } = parsed.data;
    const template = await prisma.certificateTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(layoutData !== undefined ? { layoutData: layoutData as object } : {}),
      },
      include: CREATOR_SELECT,
    });

    return res.status(200).json({ template });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Certificate template not found' });
    }
    console.error('Error updating certificate template:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// DELETE /api/certificate-templates/:id
export const deleteCertificateTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseTemplateId(req.params.id);
    if (id === null) return res.status(400).json({ error: 'Invalid template ID' });

    const existing = await prisma.certificateTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Certificate template not found' });

    await prisma.certificateTemplate.delete({ where: { id } });

    return res.status(200).json({ message: 'Certificate template successfully deleted' });
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2025') {
      return res.status(404).json({ error: 'Certificate template not found' });
    }
    console.error('Error deleting certificate template:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
