import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/authMiddleware.js';
import {
  issueCertificate,
  getCertificatePdf,
  listCertificates,
  getEligibleForCertificateCount,
} from '../modules/certificates/certificates.controller.js';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['PRINCIPAL']));

router.get('/eligible-count', getEligibleForCertificateCount);
router.get('/:id/pdf', getCertificatePdf);
router.get('/', listCertificates);
router.post('/', issueCertificate);

export default router;
