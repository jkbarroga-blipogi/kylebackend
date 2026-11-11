type EnvSource = Record<string, string | undefined>;

const TTL_MULTIPLIERS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
};

function requiredSecret(env: EnvSource, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function accessTokenSecret(env: EnvSource = process.env): string {
  return requiredSecret(env, 'JWT_ACCESS_TOKEN_SECRET');
}

export function refreshTokenSecret(env: EnvSource = process.env): string {
  return requiredSecret(env, 'JWT_REFRESH_TOKEN_SECRET');
}

export function parseTtlSeconds(raw: string): number {
  const match = /^(\d+)([smhdw]?)$/.exec(raw.trim());
  if (!match) {
    throw new Error('Invalid token lifetime');
  }
  const amount = Number(match[1]);
  const unit = match[2] || 's';
  const multiplier = TTL_MULTIPLIERS[unit];
  if (!Number.isSafeInteger(amount) || amount <= 0 || !multiplier) {
    throw new Error('Invalid token lifetime');
  }
  return amount * multiplier;
}

export function accessTokenTtlSeconds(env: EnvSource = process.env): number {
  return parseTtlSeconds(env.ACCESS_TOKEN_EXPIRES_IN || '3600s');
}

export function refreshTokenTtlSeconds(env: EnvSource = process.env): number {
  return parseTtlSeconds(env.REFRESH_TOKEN_EXPIRES_IN || '7d');
}

export type DatabaseConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: { rejectUnauthorized: true } | undefined;
};

export function databaseConfig(env: EnvSource = process.env): DatabaseConfig {
  const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) {
    throw new Error(`Missing database environment variables: ${missing.join(', ')}`);
  }
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer from 1 to 65535');
  }
  const sslEnabled = ['1', 'true', 'required'].includes((env.DB_SSL || '').trim().toLowerCase());
  return {
    host: env.DB_HOST!.trim(),
    port,
    user: env.DB_USER!.trim(),
    password: env.DB_PASSWORD!,
    database: env.DB_NAME!.trim(),
    ssl: sslEnabled ? { rejectUnauthorized: true } : undefined,
  };
}

export function corsOrigins(env: EnvSource = process.env): string[] | null {
  const raw = env.CORS_ORIGINS?.trim();
  if (!raw) return null;
  const origins = raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      let parsed: URL;
      try {
        parsed = new URL(entry);
      } catch {
        throw new Error('CORS_ORIGINS entries must be valid http(s) origins');
      }
      if (
        (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
        parsed.username ||
        parsed.password ||
        parsed.pathname !== '/' ||
        parsed.search ||
        parsed.hash
      ) {
        throw new Error('CORS_ORIGINS entries must be bare http(s) origins without paths or credentials');
      }
      return parsed.origin;
    });
  return origins.length ? origins : null;
}

export function validateEnvironment(
  env: EnvSource = process.env,
  warn: (message: string) => void = message => console.warn(message),
): void {
  const access = accessTokenSecret(env);
  const refresh = refreshTokenSecret(env);
  accessTokenTtlSeconds(env);
  refreshTokenTtlSeconds(env);
  databaseConfig(env);
  const origins = corsOrigins(env);

  if (access === refresh) {
    warn('[security] JWT_ACCESS_TOKEN_SECRET and JWT_REFRESH_TOKEN_SECRET are identical; use distinct secrets');
  }
  if (access.length < 32 || refresh.length < 32) {
    warn('[security] JWT secrets shorter than 32 characters weaken HMAC signing; use 32+ random bytes');
  }
  if (!origins) {
    warn('[security] CORS_ORIGINS is not set; all origins are currently permitted');
  }
}
