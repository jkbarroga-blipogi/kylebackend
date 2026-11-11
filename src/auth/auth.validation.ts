import { z } from 'zod';
import { parseBody } from '../common/validation/request-validation';

const username = z.string().trim().min(1).max(255);
export const passwordSchema = z
  .string()
  .min(8, 'Password must use at least 8 characters')
  .refine(value => value.trim().length > 0, 'Password is required')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must use at most 72 UTF-8 bytes');

const loginSchema = z.object({ username, password: z.string().min(1) }).strict();
const registrationSchema = z
  .object({
    username,
    email: z.string().trim().toLowerCase().email().max(255).optional(),
    password: passwordSchema,
  })
  .strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();

export const parseLogin = (input: unknown) => parseBody(loginSchema, input);
export const parseRegistration = (input: unknown) => parseBody(registrationSchema, input);
export const parseRefresh = (input: unknown) => parseBody(refreshSchema, input);
