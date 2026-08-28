import { z } from 'zod';

/**
 * Free-text fields that may legitimately be absent. Empty and whitespace-only
 * input collapses to `undefined` so it is stored as NULL rather than `""`,
 * matching `optionalText` in activityValidators.ts.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val));
}

/** Local phone numbers only — no country code, no separators. */
const PHONE_DIGITS = /^\d{10}$/;

function optionalPhoneNumber() {
  return z
    .string()
    .trim()
    .optional()
    .transform((val) => (val === undefined || val === '' ? undefined : val))
    .refine((val) => val === undefined || PHONE_DIGITS.test(val), 'Phone number must be exactly 10 digits');
}

export const submitProfileRequestSchema = z
  .object({
    phoneNumber: optionalPhoneNumber(),
    address: optionalText(500),
  })
  .strict()
  .refine((data) => data.phoneNumber !== undefined || data.address !== undefined, {
    message: 'At least one of phoneNumber or address must be provided',
  });

export const reviewProfileRequestSchema = z
  .object({
    status: z.enum(['APPROVED', 'REJECTED']),
    teacherNote: optionalText(2000),
  })
  .strict()
  .refine((data) => data.status !== 'REJECTED' || data.teacherNote !== undefined, {
    message: 'teacherNote is required when rejecting a request',
    path: ['teacherNote'],
  });

export type SubmitProfileRequestInput = z.infer<typeof submitProfileRequestSchema>;
export type ReviewProfileRequestInput = z.infer<typeof reviewProfileRequestSchema>;
