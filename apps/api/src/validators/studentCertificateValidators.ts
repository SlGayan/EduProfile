import { z } from 'zod';

export const ALLOWED_CERTIFICATE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors isCalendarDate in activityValidators.ts: anchors the format and
// round-trips through Date.UTC so an impossible calendar day (2026-02-30) is
// rejected instead of silently rolled over to a different real date.
function isCalendarDate(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val));
}

// Fields arrive as multipart/form-data text fields (the request also carries
// an optional file), so every value here is a plain string from req.body,
// same as createMaterialSchema in materialValidators.ts.
const certificateFields = {
  title: z.string().trim().min(1, 'title is required').max(255, 'Must be 255 characters or fewer'),
  issuingOrganization: z
    .string()
    .trim()
    .min(1, 'issuingOrganization is required')
    .max(255, 'Must be 255 characters or fewer'),
  // Free text, mirroring activityType in activityValidators.ts: no fixed enum
  // exists for certificate categories, and inventing one here would create a
  // contract the UI has nothing to build against.
  category: z.string().trim().min(1, 'category is required').max(100, 'Must be 100 characters or fewer'),
  issueDate: z
    .string()
    .trim()
    .refine(isCalendarDate, 'issueDate must be a valid date in YYYY-MM-DD format'),
  description: optionalText(2000),
  evidenceUrl: optionalText(2000).refine(
    (val) => val === undefined || /^https?:\/\//i.test(val),
    'evidenceUrl must be a valid http(s) URL'
  ),
};

export const createStudentCertificateSchema = z.object(certificateFields).strict();

export const updateStudentCertificateSchema = z
  .object(certificateFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateStudentCertificateInput = z.infer<typeof createStudentCertificateSchema>;
export type UpdateStudentCertificateInput = z.infer<typeof updateStudentCertificateSchema>;
