import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.issues.map(issue => `${issue.path.join('.') || 'Request'}: ${issue.message}`));
  }
  return parsed.data;
}
