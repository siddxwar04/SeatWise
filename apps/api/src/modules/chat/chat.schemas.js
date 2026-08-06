import { z } from 'zod';

export const chatBodySchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Type a question for the concierge')
    .max(1000, 'Keep your question under 1000 characters'),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .max(12)
    .optional()
    .default([]),
});
