import multer from 'multer';
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middleware/authMiddleware.js';
import { ALLOWED_MATERIAL_MIME_TYPES } from '../../validators/materialValidators.js';

const parsedMaxMb = parseInt(process.env.MAX_MATERIAL_UPLOAD_MB || '', 10);
export const MAX_MATERIAL_UPLOAD_MB = Number.isNaN(parsedMaxMb) || parsedMaxMb <= 0 ? 10 : parsedMaxMb;
const MAX_MATERIAL_UPLOAD_BYTES = MAX_MATERIAL_UPLOAD_MB * 1024 * 1024;

// Buffers in memory rather than writing to local disk -- the file's final
// destination is Azure Blob Storage (materials.blob.ts), written directly
// from req.file.buffer in the controller. 10MB cap keeps this cheap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MATERIAL_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!(ALLOWED_MATERIAL_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      return cb(null, false);
    }
    cb(null, true);
  },
});

/**
 * This app registers no Express error-handling middleware anywhere, so a
 * multer error thrown synchronously (oversized file) would otherwise bypass
 * every handler's own try/catch and fall through to Express's default HTML
 * error page. Wrapping the callback form keeps the JSON error contract every
 * other endpoint in this app honors.
 */
export function uploadMaterialFile(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(400)
          .json({ error: `File exceeds the maximum allowed size of ${MAX_MATERIAL_UPLOAD_MB}MB` });
      }
      // Any other Multer error (e.g. LIMIT_UNEXPECTED_FILE for a wrong field
      // name) is still caller-caused invalid input, not a server fault.
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    next();
  });
}
