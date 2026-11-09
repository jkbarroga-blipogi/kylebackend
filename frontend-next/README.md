# Barroga Next.js Frontend

Next.js App Router frontend for the Barroga shelter workspace. The NestJS API stays in the repository root. This folder is the Next.js application.

## Local development

```bash
npm install
npm run dev -- --port 3000
```

Open http://localhost:3000. The development server runs from this folder. The vanilla frontend in `../frontend` is a separate static application and is not served by this server.

## API and authentication

- Data requests go directly to the NestJS API at `NEXT_PUBLIC_API_URL`, default `https://kylebackend.onrender.com`.
- Authentication uses a Next.js BFF. Login, register, refresh, and logout go through `/api/auth/*` routes in this application.
- The BFF forwards to the NestJS API at `NEST_API_URL`, defaulting to `NEXT_PUBLIC_API_URL` or the Render URL above.
- The refresh token is stored only in an `httpOnly`, `SameSite=Lax` cookie named `barroga_refresh`. JavaScript never receives it.
- The access token stays in memory and in `sessionStorage` for instant reload in the same tab. It is renewed silently through the refresh cookie.
- Registration creates a `user` account with username, email, and a password of at least 8 characters. Login accepts the username or the email.
- There is no connection settings UI. The API origin is automatic. For local backend testing, set `NEST_API_URL=http://localhost:3001` and run the backend on port 3001, then restart the Next.js server.

## Pages

- Login and sign up on the side panel. Sign up is for user accounts only. Staff and administrator roles are provisioned outside the interface.
- Dashboard shows the Total animals count and Latest arrivals.
- Animal page has three tabs: Animals, Species, and Breeds. An administrator or staff member can upload an animal photo on the Animal form. Photos are compressed in the browser, stored as data URLs in the `image_url` column, and shown on animal cards, tables, and the dashboard.
- Adopter pages: Available animals (eligible only, with species filter), All animals (adopted and available, with adopter name for adopted animals), My applications, and My details.
- Management pages: Adopters, Applications, Adoptions, Medical Records, Staff, and Users.

## Verification

```bash
npx tsc --noEmit
npm run build
npx vitest run
```

## Production deployment

Deploy this folder as a separate Render web service:

- Root Directory: `frontend-next`
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Environment Variables: `NEXT_PUBLIC_API_URL=https://kylebackend.onrender.com` and `NEST_API_URL=https://kylebackend.onrender.com`

Apply database migrations before deploying new backend code:

```bash
node scripts/apply-email-migration.mjs --apply
node scripts/apply-photo-migration.mjs --apply
```

Run each script from the repository root. The scripts read the database from the backend `.env` file and never print credentials. The email migration adds `users.email`. The photo migration adds `Animal.image_url` as `LONGTEXT`.
