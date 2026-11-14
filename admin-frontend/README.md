# Barroga admin frontend

Separate Next.js admin app. Uses the live backend and the original shelter's dark indigo theme. The login uses one centered card with no public sign-up link. Create User stays inside the dashboard.

## Run

```
npm install
npm run dev
```

Open http://localhost:3000 and sign in with an admin account.

The backend base URL lives in `.env.local`:

```
NEXT_PUBLIC_API_URL=https://kylebackend.onrender.com
```

## Connection map

Every button maps to one function in `lib/users.ts`, which maps to one endpoint.

| Dashboard action | Function | Endpoint |
| --- | --- | --- |
| Sign in | `login` in `lib/auth.tsx` | `POST /auth/login` |
| Read / Refresh | `listUsers` | `GET /users` |
| Read (row) | `getUser` | `GET /users/:id` |
| Create User | `createUser` | `POST /auth/register` |
| Update | `updateUser` | `PUT /users/:id` |
| Role select | `updateUserRole` | `PUT /users/:id/role` |
| Delete | `deleteUser` | `DELETE /users/:id` |
| Logout | `logout` in `lib/auth.tsx` | `POST /auth/logout` |

## Structure

```
app/
  globals.css          Dark shelter tokens, responsive layouts, component states
  layout.tsx           AuthProvider wrapper
  page.tsx             Login screen
  dashboard/
    page.tsx           Dashboard state and CRUD handlers
    users-table.tsx    Desktop table, mobile account cards, role badges
    modals.tsx         Read, Create, Update forms (no API calls here)
components/
  brand.tsx            Original shelter logo and wordmark
  modal.tsx            Native dialog with Escape and focus restoration
  password-field.tsx   Password input with visibility toggle
  workspace-shell.tsx  Navigation, topbar, sign-out confirmation
lib/
  api.ts               requestJson: fetch wrapper, Bearer token, error handling
  auth.tsx             Session context: localStorage tokens, refresh on 401
  users.ts             One function per endpoint
  messages.ts          Friendly UI errors, never raw backend diagnostics
  display.ts           Readable account dates
```

## Design

- Colors reuse the shelter's canvas `#0a0d13`, panels `#12161e`, indigo `#4f46e5`, and sky focus ring `#38bdf8`.
- Segoe UI and system fonts require no font downloads.
- Users appear in a table on desktop and labeled account cards on phones.
- Create, Read, Update, and Sign out use native dialogs with keyboard support.
- Delete retains the browser confirmation from the original implementation.
- Loading skeletons stop animating under reduced-motion settings.

## Checks

Requires Node.js 24 for the dependency-free TypeScript unit tests.

```
npm run test:unit
npm run typecheck
npm run build
```

Browser checks require a running app and an installed Chromium browser. They intercept all backend requests, use test accounts, and never modify live records. The default URL is `http://localhost:3000`. Set `TEST_BASE_URL` for another port and `BROWSER_PATH` for another Chromium executable.

```
npm run test:browser
```

Tokens still persist in localStorage through the existing session provider. The redesign does not change authentication. Use an HttpOnly-cookie session design before production deployment.
