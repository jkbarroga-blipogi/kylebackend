import { z } from 'zod';

const contactText = (length: number) => z.string().trim().min(1).max(length);
export const profileSchema = z.object({
  first_name: contactText(50),
  last_name: contactText(50),
  phone: contactText(20),
  address: contactText(255),
  email: z.union([z.string().trim().max(100).email(), z.literal(''), z.null()]).optional().transform(value => value || null),
}).strict();
export const applicationSchema = z.object({ animal_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();
