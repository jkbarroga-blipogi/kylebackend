# Adopter self-service

Approved on 2026-11-08: regular `user` accounts browse eligible animals, choose an animal, submit an application, and track their own applications. New applications wait unassigned for staff review. This replaces the earlier staff-assisted-only scope for these actions.

## Data and migration

The configured MySQL schema confirms signed `INT` identifiers, a unique `users.username`, and required `Adoption_Application.staff_id`. Adopter contact limits are 50 characters per name, 20 for phone, 100 for email, and 255 for address.

- Add nullable `Adopter.user_id`, a unique key, and a foreign key to `users.id` with restricted deletion. Existing adopters remain unlinked. No matching by name or email takes place.
- Allow null `Adoption_Application.staff_id`. Existing assignments retain their values.
- Account deletion respects the ownership foreign key. Staff assigns a reviewer through the existing application editor.
- Migration runs before backend deployment. Rollback disables self-service code and retains the additive schema and submitted records.

The owner approves applying these schema changes to the configured database. No record deletion or backfill is part of the migration.

## API contract

All `/adopter/*` routes require a valid JWT and a current database role of `user`. Identity comes from the verified account, never from the request body.

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /adopter/animals` | None | Eligible animals with ID, name, sex, color, date-only birth/arrival dates, breed and species names, and status |
| `GET /adopter/profile` | None | Own contact profile, or null before setup |
| `PUT /adopter/profile` | `first_name`, `last_name`, `phone`, `address`, optional nullable `email` | Own saved contact profile |
| `GET /adopter/applications` | None | Own applications with application ID, animal ID/name, application date, status, and reviewer-assigned flag |
| `GET /adopter/applications/:id` | Positive integer ID | Own application, or 404 for absent or other-account records |
| `POST /adopter/applications` | `{ "animal_id": positive integer }` | Saved application, HTTP 201 |

Profile input uses verified column limits and email syntax validation. Strict Zod objects reject identity, reviewer, date, status, and other unknown fields. The server inserts the account-linked adopter ID, null staff ID, `UTC_DATE()`, and `Pending`.

Eligibility requires animal status `Available`, no adoption row, and no final application. The write rechecks under the existing animal-row transaction lock. Duplicate open applications from the same adopter produce 409. A contact profile is required before submission. A declined or cancelled application permits a later application if the animal remains eligible.

## Access boundaries

- Administrators retain management access.
- Staff manage operational records and read Staff references. Staff directory writes and Users/Categories directories require an administrator.
- Volunteers read animal records only.
- Adopter users use the ownership-scoped routes. They cannot call management routes or submit review decisions.
- Existing self-or-admin username/password updates remain available.
- JWT validation reloads the current account, so deleted accounts and role changes affect the next request.

## Frontend

Regular users see Available animals, My applications, and My details. They save their own contact details, select an existing animal, confirm submission, and see status updates after reload. Public registration creates an adopter account. Admin and staff interfaces keep their operational workflow.

The client uses explicit response allowlists, preserves non-password drafts on failed requests, and distinguishes a lost write response from a definite rejection. It never retries application creation automatically.

## Verification

Tests cover ownership scoping, forged IDs/statuses, duplicate and unavailable animals, transaction rollback, direct management-route denial, profile validation, and the browser registration/profile/application journey. Real database verification checks schema metadata. Automated fixtures never write to Render.
