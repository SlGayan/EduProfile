import { Router } from 'express';
import { verifyToken, requireRole } from '../../middleware/authMiddleware.js';
import {
  createCertificateTemplate,
  listCertificateTemplates,
  getCertificateTemplate,
  updateCertificateTemplate,
  deleteCertificateTemplate,
} from './certificateTemplates.controller.js';

const router = Router();

// Story 12.8: certificate letterhead template canvas is Admin/Principal-only,
// same RBAC boundary as teacher-subject-assignments.
router.use(verifyToken, requireRole(['ADMINISTRATOR', 'PRINCIPAL']));

router.post('/', createCertificateTemplate);
router.get('/', listCertificateTemplates);
router.get('/:id', getCertificateTemplate);
router.patch('/:id', updateCertificateTemplate);
router.delete('/:id', deleteCertificateTemplate);

export default router;
