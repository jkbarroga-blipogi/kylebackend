# Barroga shelter workspace

A responsive dark interface for the existing NestJS API. Native HTML, CSS, JavaScript modules, forms, selects, dialogs, and `fetch` provide the UI without runtime dependencies.

## Local preview

From `Backend`:

```bash
npm run preview -- --port=4174
```

Open <http://127.0.0.1:4174/>. The preview server serves modules and assets with their correct MIME types. Open the site through HTTP, rather than opening `index.html` as a file. The default port without an argument is 4173.

Sign in with an existing account or create an adopter account. The preview uses the configured API and its real records. Automated tests use a separate, isolated local API with sample records.

To use the new local backend, first run `npm run build` and `npm start` in one terminal. In a second terminal, run:

```bash
npm run preview -- --port=4174 --api=http://127.0.0.1:3000
```

The backend reads the configured database environment. The local API uses the same database as that configuration. The preview override changes the served HTML only. It accepts an HTTPS origin or HTTP on localhost.

## Screens

- Overview: fetched animal count, plus latest arrivals.
- Animals, medical records, adopters, applications, and adoptions.
- Species and breeds.
- Staff and users.
- Adopter accounts: Available animals, My applications, and My details.

Categories is removed entirely at the owner's request (frontend on 2026-11-08, backend on 2026-11-09).

Record screens include search, details, creation, editing, deletion confirmation, loading, empty results, errors, and retry actions. Reference selectors show names and identifiers. A failed write preserves the draft. An uncertain write response requires reloading records before resubmission.

## API and sessions

The `api-base` meta tag in [index.html](index.html) sets the API origin automatically to `https://kylebackend.onrender.com` (Render). There is no connection settings UI. Local preview overrides the origin with `npm run preview -- --api=<origin>`, which the preview server injects into the served HTML.

Access tokens stay in memory. Reloading requires sign-in. The client removes legacy session keys from local storage and never stores passwords or tokens there. A 401 returns to sign-in and keeps the non-password draft in the tab. The draft resumes only for the same account, API origin, and role. Logout or account changes clear it. Explicit re-login replaces the defective backend refresh flow.

Users sign up on the login panel as user accounts through `POST /auth/register` with username, email, and password. Sign in accepts the username or the email. New passwords use at least 8 characters. Roles stay read-only. New accounts receive the backend's `user` role, displayed as Adopter. Staff, volunteer, and administrator roles require operator provisioning outside this interface. Registration rejects supplied roles.

Frontend navigation follows the approved roles:

| Role | Frontend access |
| --- | --- |
| `admin` | All listed screens and supported mutations |
| `staff` | Operational screens, species and breeds, Staff relationship reads |
| `volunteer` | Animal overview, animal list, and details |
| `user` | Eligible animals, own contact details, own applications |
| Unknown | Account provisioning message |

Backend guards enforce these permissions on direct API requests. JWT validation reloads the current account and role for each protected request. Ownership filters limit adopter reads and writes to the signed-in account.

## Adopter self-service

1. Select Create user account, register with username, email, and password, and sign in.
2. Choose an animal under Available animals.
3. Save My details. Each account creates its own linked profile.
4. Confirm the selected animal and submit the application.
5. Open My applications and use Reload status to see staff updates.

The server supplies the adopter identity, date, Pending status, and unassigned reviewer. Staff assigns a reviewer through the existing application editor. Duplicate open applications return a conflict. An uncertain submission disables resubmission until current applications reload. See [the API and migration contract](../docs/adopter-self-service.md).

## Adoption sequence

1. Create a nonfinal application.
2. Select the application when creating an adoption. The form derives the animal and adopter.
3. Save the adoption.
4. Use the explicit follow-up action to mark the application Adopted. This rejects other open applications for the animal.

If step 4 fails, the UI reports the saved adoption separately and retries only the application update. It never repeats adoption creation automatically.

## Files

| File | Responsibility |
| --- | --- |
| `app.js` | Navigation, page loading, session recovery, adoption follow-up |
| `js/resources.js` | Reused resource registry, field contracts, visible permissions |
| `js/api.js` | Requests, response errors, in-memory sessions |
| `js/auth.js` | Registration, sign-in, connection settings, sign-out |
| `js/adopter.js` | Eligible animal selection, application submission and tracking |
| `js/adopter-profile.js` | Owned contact form and draft recovery |
| `js/adopter-data.js` | Adopter response validation and display allowlists |
| `js/records.js` | Payload validation, date-only handling, response allowlists |
| `js/editor.js` | Details, accessible forms, draft handling |
| `js/references.js` | Relationship loading, eligibility, adoption matching |
| `js/views.js` | Overview and record tables |
| `js/deletion.js` | Native deletion dialog and response contracts |
| `js/ui.js` | Local outline icons, escaped markup, announcements |
| `styles.css` | Design tokens, component states, responsive layouts |

## Verification

Run from `Backend`:

```bash
npm run test:frontend -- --reporter=dot
npm test -- --reporter=dot
npx tsc --noEmit --pretty false
npm run build
```

The frontend suite uses Vitest and an installed Chrome/Chromium browser through its debugging protocol. Set `BROWSER_PATH` to select an executable. Browser tests skip explicitly when no supported executable is found. They never send fixture writes to Render.

Coverage includes login response validation, bearer headers, direct-request permissions, public registration, owned profiles/applications, nullable fields, date and ID validation, private-field filtering, adoption eligibility, expired-session drafts, reference failures, partial saves, deletion conflicts, stale follow-up results, staff reviewer assignment, keyboard navigation, and page reflow at 320, 360, 768, and 1440 CSS pixels.

Chrome browser checks run locally. Edge exits during the local automation startup, before page checks. Firefox, Safari, physical devices, screen-reader announcements, and full WCAG conformance remain unverified.

Optional screenshots use `FRONTEND_SCREENSHOTS` as an output directory. Screenshots use sample records from the isolated test API.

## Hosting

For Vercel, use `frontend` as the project root, the Other framework preset, and static output with no application build step. The site keeps resource navigation in query parameters, so it needs no SPA rewrite. The Vercel project and production URL still require configuration.

Backend Render settings remain separate: build with `npm ci && npm run build`, then start with `npm start`. Configure backend environment variables in Render using the names in [`.env.example`](../.env.example). Never copy database credentials or JWT secrets into frontend files.

Apply `npm run migrate:adopters -- --apply` to the target database before deploying self-service. This migration is already applied and verified on the configured database. `npm run migrate:adopters` inspects its state without changing it. After pushing the backend, use Render's `kylebackend` service, then Manual Deploy, then Deploy latest commit. A successful root health response alone does not confirm the deployed revision.
