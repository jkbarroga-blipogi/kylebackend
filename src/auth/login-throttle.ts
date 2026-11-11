import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export type ThrottleOptions = {
  maxFailures?: number;
  windowMs?: number;
  maxEntries?: number;
};

type Bucket = { count: number; resetAt: number };

const DEFAULT_MAX_FAILURES = 8;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 5000;

@Injectable()
export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(options: ThrottleOptions = {}, now: () => number = Date.now) {
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = now;
  }

  private normalize(key: string): string {
    return key.trim().toLowerCase();
  }

  private prune(currentTime: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= currentTime) {
        this.buckets.delete(key);
      }
    }
    while (this.buckets.size >= this.maxEntries) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }

  assertAllowed(key: string): void {
    const normalized = this.normalize(key);
    const currentTime = this.now();
    const bucket = this.buckets.get(normalized);
    if (!bucket) return;
    if (bucket.resetAt <= currentTime) {
      this.buckets.delete(normalized);
      return;
    }
    if (bucket.count >= this.maxFailures) {
      throw new HttpException(
        'Too many sign-in attempts. Please wait before trying again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(key: string): void {
    const normalized = this.normalize(key);
    const currentTime = this.now();
    const existing = this.buckets.get(normalized);
    if (existing && existing.resetAt > currentTime) {
      existing.count += 1;
      return;
    }
    this.prune(currentTime);
    this.buckets.set(normalized, { count: 1, resetAt: currentTime + this.windowMs });
  }

  clear(key: string): void {
    this.buckets.delete(this.normalize(key));
  }
}
