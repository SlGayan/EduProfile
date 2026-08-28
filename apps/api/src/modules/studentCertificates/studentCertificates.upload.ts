import multer from 'multer';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { ALLOWED_CERTIFICATE_MIME_TYPES } from '../../validators/studentCertificateValidators.js';

const parsedMaxMb = parseInt(process.env.MAX_CERTIFICATE_UPLOAD_MB || '', 10);
export const MAX_CERTIFICATE_UPLOAD_MB = Number.isNaN(parsedMaxMb) || parsedMaxMb <= 0 ? 10 : parsedMaxMb;
const MAX_CERTIFICATE_UPLOAD_BYTES = MAX_CERTIFICATE_UPLOAD_MB * 1024 * 1024;

// The evidence file is optional (a student may submit just a URL, just a
// file, or both), so this stays a plain multer instance rather than a
// `.single()` that rejects a request with no file — the controller decides
// whether at least one form of evidence was actually supplied.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERTIFICATE_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!(ALLOWED_CERTIFICATE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      return cb(null, false);
    }
    cb(null, true);
  },
});

/**
 * Mirrors uploadMaterialFile in materials.upload.ts: this app registers no
 * Express error-handling middleware, so a multer error thrown synchronously
 * must be converted to the app's JSON error envelope here rather than
 * falling through to Express's default HTML error page.
 */
export function uploadCertificateFile(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(400)
          .json({ error: `File exceeds the maximum allowed size of ${MAX_CERTIFICATE_UPLOAD_MB}MB` });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      console.error('Certificate upload error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    next();
  });
}
