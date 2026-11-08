import { z } from 'zod';
import { parseBody } from '../request-validation';

const username = z.string().trim().min(1).max(255);
const loginSchema = z.object({ username, password: z.string().min(1) }).strict();
const registrationSchema = z.object({ username, password: z.string().refine(value => value.trim().length > 0, 'Password is required')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must use at most 72 UTF-8 bytes') }).strict();
const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();

export const parseLogin = (input: unknown) => parseBody(loginSchema, input);
export const parseRegistration = (input: unknown) => parseBody(registrationSchema, input);
export const parseRefresh = (input: unknown) => parseBody(refreshSchema, input);
