import type { NextFunction, Request, Response } from 'express';

const HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"],
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
];

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  for (const [name, value] of HEADERS) {
    res.setHeader(name, value);
  }
  next();
}
