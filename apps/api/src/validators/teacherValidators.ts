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

export const updateTeacherSelfSchema = z
  .object({
    displayName: optionalText(255),
    phoneNumber: optionalPhoneNumber(),
    address: optionalText(500),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type UpdateTeacherSelfInput = z.infer<typeof updateTeacherSelfSchema>;
