import { z } from 'zod';

// Mirrors apps/web/lib/certificateTemplates.ts's BoundFieldKey. Kept as a
// plain literal list (not imported) since the API and web apps don't share
// a types package; if a bound field is ever added there, add it here too.
const boundFieldKeySchema = z.enum([
  'STUDENT_NAME',
  'ADMISSION_NUMBER',
  'DATE_OF_ADMISSION',
  'ATTENDANCE_PERCENTAGE',
  'CHARACTER_GRADE',
  'STUDENT_ATTRIBUTES',
  'REASON_FOR_LEAVING',
  'ACADEMIC_SUMMARY',
  'CERTIFICATE_ID',
  'ISSUED_DATE',
]);

// Mirrors apps/web/lib/certificateTemplates.ts's TemplateField. All sizing/
// styling props are optional there (defaulted client-side), so they stay
// optional here too — this schema exists to reject garbage shapes, not to
// force every optional prop to be present.
const templateFieldSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['bound', 'text']),
    boundField: boundFieldKeySchema.optional(),
    text: z.string().optional(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    fontSize: z.number().finite().positive().max(200).optional(),
    fontWeight: z.enum(['normal', 'bold']).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
  })
  .refine((f) => f.kind !== 'bound' || f.boundField !== undefined, {
    message: 'boundField is required when kind is "bound"',
  });

const templateLayoutDataSchema = z.object({
  canvasWidth: z.number().finite().positive(),
  canvasHeight: z.number().finite().positive(),
  fields: z.array(templateFieldSchema).max(200),
});

const nameSchema = z.string().trim().min(1, 'name is required').max(200, 'name must be 200 characters or fewer');

export const createCertificateTemplateSchema = z.object({
  name: nameSchema,
  layoutData: templateLayoutDataSchema,
});

export const updateCertificateTemplateSchema = z
  .object({
    name: nameSchema.optional(),
    layoutData: templateLayoutDataSchema.optional(),
  })
  .refine((data) => data.name !== undefined || data.layoutData !== undefined, {
    message: 'At least one of name or layoutData must be provided',
  });

export type CreateCertificateTemplateInput = z.infer<typeof createCertificateTemplateSchema>;
export type UpdateCertificateTemplateInput = z.infer<typeof updateCertificateTemplateSchema>;
