import { z } from 'zod';

export const JUDGMENT_OUTCOMES = [
  'ALLOWED',
  'DISMISSED',
  'CONVICTED',
  'ACQUITTED',
  'SETTLED',
  'DISPOSED',
];

export const reserveJudgmentSchema = z.object({
  note: z
    .string()
    .trim()
    .min(5, { message: 'Reserve note must be at least 5 characters' })
    .max(500, { message: 'Reserve note cannot exceed 500 characters' })
    .optional()
    .nullable(),
});

export const deliverJudgmentSchema = z.object({
  outcome: z.enum(JUDGMENT_OUTCOMES, {
    errorMap: () => ({
      message: `Invalid judgment outcome. Allowed: ${JUDGMENT_OUTCOMES.join(', ')}`,
    }),
  }),
  summary: z
    .string()
    .trim()
    .min(20, { message: 'Judgment summary must be at least 20 characters' })
    .max(4000, { message: 'Judgment summary cannot exceed 4000 characters' }),
  judgmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Judgment date must be in YYYY-MM-DD format' })
    .optional(),
});
