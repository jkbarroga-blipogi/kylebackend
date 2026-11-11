# Barroga Shelter Backend

NestJS + MySQL (`mysql2/promise`) REST API for the Barroga shelter system.

## Directory Layout

```text
Backend/
├── src/
│   ├── main.ts                                # Bootstrap, security headers, CORS, body limits
│   ├── app.module.ts                          # Root NestJS module
│   ├── config/
│   │   └── env.ts                             # Fail-fast environment & secret validation
│   ├── common/
│   │   ├── http/security-headers.ts           # Hardened HTTP response headers
│   │   └── validation/request-validation.ts   # Shared Zod & integer ID guards
│   ├── database/
│   │   ├── database.module.ts
│   │   ├── database.service.ts                # MySQL connection pool (optional TLS)
│   │   ├── sql-errors.ts                      # Driver error -> HTTP exception translator
│   │   └── tx.ts                              # Dedicated-connection transaction wrapper
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts                    # SHA-256 refresh token hashing & rotation
│   │   ├── auth.validation.ts
│   │   ├── jwt-auth.guard.ts
│   │   ├── jwt-strategy.ts
│   │   ├── login-throttle.ts                  # Bounded in-memory brute-force limiter
│   │   └── roles.guard.ts
│   ├── users/
│   ├── animal/
│   ├── shelter/
│   └── adopter/
├── migrations/                                # SQL schema migrations (001..003)
├── scripts/
│   └── migrate.mjs                            # Unified migration runner (--apply)
├── test/                                      # Vitest unit & HTTP boundary suite
├── Dockerfile                                 # Multi-stage Alpine container image
└── .env.example
```

## Commands

```bash
npm run start:dev       # Local watch mode
npm run build           # Compile TypeScript -> dist/main.js
npm run start           # Start production build (node dist/main.js)
npm run test:backend    # Run backend unit & HTTP boundary tests
npm run migrate         # Dry-run all pending SQL migrations
npm run migrate -- --apply
```
