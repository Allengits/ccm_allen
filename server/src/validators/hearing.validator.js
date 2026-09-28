import { z } from 'zod';

export const scheduleHearingSchema = z.object({
  caseId: z.string().uuid({ message: 'Valid caseId is required' }),
  courtroomId: z.string().uuid({ message: 'Valid courtroomId is required' }),
  scheduledAt: z.string().min(1, { message: 'scheduledAt date-time string is required' }),
  durationMins: z.coerce.number().int().positive().optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  judgeId: z.string().uuid().optional().nullable(),
  purpose: z
    .string()
    .trim()
    .min(3, { message: 'Purpose must be at least 3 characters' })
    .max(200)
    .optional()
    .default('Regular Hearing'),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const rescheduleHearingSchema = z.object({
  scheduledAt: z.string().min(1, { message: 'New scheduledAt date-time is required' }),
  courtroomId: z.string().uuid().optional().nullable(),
  durationMins: z.coerce.number().int().positive().optional(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Reschedule reason must be at least 5 characters' })
    .max(500),
});

export const cancelHearingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Cancellation reason must be at least 5 characters' })
    .max(500),
});

export const completeHearingSchema = z.object({
  outcomeNotes: z
    .string()
    .trim()
    .min(5, { message: 'Outcome notes must be at least 5 characters' })
    .max(2000),
});

export const adjournHearingSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, { message: 'Adjournment reason must be at least 5 characters' })
    .max(500),
  nextHearing: z
    .object({
      scheduledAt: z.string().min(1, { message: 'Next scheduledAt date-time is required' }),
      courtroomId: z.string().uuid().optional().nullable(),
      durationMins: z.coerce.number().int().positive().optional(),
      durationMinutes: z.coerce.number().int().positive().optional(),
      purpose: z.string().trim().min(3).max(200).optional(),
    })
    .optional()
    .nullable(),
});
