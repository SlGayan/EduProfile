import { z } from 'zod';

export const issueCertificateSchema = z.object({
  studentId: z.number().int().positive(),
  selectedActivities: z.array(z.number().int().positive()).optional().default([]),
  reasonForLeaving: z.string().trim().max(500).optional(),
  characterGrade: z.enum(['GOOD', 'VERY_GOOD', 'EXCELLENT']),
  studentAttributes: z.string().trim().max(500).optional(),
  academicSummary: z.string().trim().max(2000).optional(),
  templateId: z.number().int().positive().nullable().optional(),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
