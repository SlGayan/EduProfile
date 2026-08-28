import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { uploadMaterialFile } from './materials.upload.js';
import { createMaterial, listMaterials, deleteMaterial, downloadMaterial, serveLocalBlob } from './materials.controller.js';

const router = Router();

// Dev-only: backs the local-disk fallback in materials.blob.ts for
// environments without a working `az login` session. serveLocalBlob itself
// 404s if NODE_ENV is production, so this route is inert in production.
router.get('/local-blob/:key', verifyToken, serveLocalBlob);

// Upload restricted to TEACHER: StudyMaterial.uploadedById is a required FK
// to Teacher, and ADMINISTRATOR accounts don't necessarily have a Teacher
// profile to attribute an upload to (see Story 9.2 Open Question 3 — resolved
// during code review: admins manage/delete materials but don't upload directly).
router.post('/', verifyToken, requireRole(['TEACHER']), uploadMaterialFile, createMaterial);

router.get('/', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), listMaterials);

router.get('/:id/download', verifyToken, requireRole(['STUDENT', 'TEACHER', 'ADMINISTRATOR']), downloadMaterial);

router.delete('/:id', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), deleteMaterial);

export default router;
