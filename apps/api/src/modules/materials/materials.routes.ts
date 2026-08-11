import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import { uploadMaterialFile } from './materials.upload.js';
import { createMaterial, listMaterials, deleteMaterial } from './materials.controller.js';

const router = Router();

// Upload restricted to TEACHER: StudyMaterial.uploadedById is a required FK
// to Teacher, and ADMINISTRATOR accounts don't necessarily have a Teacher
// profile to attribute an upload to (see Story 9.2 Open Question 3 — resolved
// during code review: admins manage/delete materials but don't upload directly).
router.post('/', verifyToken, requireRole(['TEACHER']), uploadMaterialFile, createMaterial);

router.get('/', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), listMaterials);

router.delete('/:id', verifyToken, requireRole(['TEACHER', 'ADMINISTRATOR']), deleteMaterial);

export default router;
