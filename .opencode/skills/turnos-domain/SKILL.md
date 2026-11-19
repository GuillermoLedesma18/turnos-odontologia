---
name: turnos-domain
description: Use this skill for project-specific work in Turnos Odontología: domain rules, data model, implemented vs planned behavior, architecture, conventions, testing, and where to find documentation. Trigger when the task involves this repository's business logic, Prisma schema, auth, appointments, availability, patients, treatments, messaging, compliance, or roadmap.
---

# Turnos Odontología — Domain Skill

## Purpose and scope

Turnos Odontología is a mobile-first web system for a **single-dentist, single-site dental clinic**. It digitizes online appointment booking without patient login, the dentist agenda, basic patient records, and WhatsApp reminders with automatic release of unconfirmed appointments.

Implemented so far: foundation (`C-01`), core data model (`C-02`), and dentist authentication (`C-03`). The following are planned or partially planned, not implemented: booking (`C-08`), complete dentist agenda (`C-10`), patient records (`C-12`), notifications (`C-13`), email fallback (`C-14`), reminders and auto-release (`C-15`), and compliance hardening (`C-16`). See `CHANGES.md` before proposing or implementing a change.

Out of scope for v1: multi-dentist/multi-site, clinical history, payments, insurance/billing, native app, AI over WhatsApp.

## Stack and architecture

- Next.js 14 App Router + TypeScript, React 18, Tailwind CSS 3.4.
- PostgreSQL 15 + Prisma 7.10.1.
- Zod for boundary validation.
- Argon2id for dentist passwords.
- Selected messaging stack, not implemented yet: WhatsApp Business Cloud API as primary channel, email as fallback, host cron for scheduled release (`C-13` to `C-15`).

Architecture is a modular monolith. Domain logic lives in `src/server/`; HTTP transport in `src/app/api/`; UI in `src/app/`. Middleware is optimistic only; every private Route Handler validates the session independently.

Important files:
- `AGENTS.md` / `CLAUDE.md`: hard rules and workflow.
- `knowledge-base/`: canonical domain documentation.
- `CHANGES.md`: implementation roadmap and dependencies.
- `prisma/schema.prisma`: persistence model.
- `prisma/migrations/`: versioned migrations.
- `src/lib/env.ts`, `src/lib/prisma.ts`: environment and database access.
- `src/server/auth/`: authentication domain.
- `tests/setup.ts`, `tests/helpers/fixtures.ts`: test isolation and fixtures.

## Data model and relationships

Core entities: `Dentist`, `AvailabilityBlock`, `BlockedSlot`, `TreatmentType`, `Patient`, `Appointment`, `NotificationLog`, `AuditLog`.

C-03 adds `DentistSession`: uuid id, `dentistId`, unique `tokenHash` (64 hex chars), `createdAt`, `lastUsedAt`, `expiresAt`, `revokedAt`, FK to `Dentist` with cascade, indexes on `dentistId` and `expiresAt`.

Key integrity rules:
- Appointment anti-overlap is enforced in PostgreSQL with `btree_gist` and an `EXCLUDE USING gist` constraint over `tstzrange(startsAt, endsAt)` for live statuses only.
- `Appointment.rescheduledFromId` uses `Restrict`.
- Availability blocks and blocked slots cascade with their dentist.
- Notifications cascade with their appointment.
- `AuditLog` has no foreign keys and is append-only by contract; full append-only enforcement is C-04.

## Business rules

### Implemented now

- `RN-AUT-01`: only the dentist authenticates; patients do not create accounts.
- `RN-AUT-04`: dentist session uses `httpOnly` + `SameSite` cookie and expires by inactivity.
- `RN-AGE-01`: a dentist cannot have overlapping appointments (enforced in PostgreSQL).
- `RN-DAT-01`/`RN-DAT-02`: authentication events are audited in `AuditLog`; full data-access auditing remains planned (`C-04`).

### Documented for future changes

- `RN-AUT-02`/`RN-AUT-03`: patient access through an unguessable per-appointment token, read-only except confirmation.
- `RN-AGE-02`/`RN-AGE-05`: appointments must fall inside an active availability block and cannot be created in the past.
- `RN-CAN-01`: only the dentist cancels or reschedules.
- `RN-CON-04`: unconfirmed appointments are released 24 hours before start, only if a reminder was delivered.
- `RN-PAC-01`/`RN-PAC-02`: patients are identified by unique phone and have a basic record.
- `RN-DAT-03`/`RN-DAT-04`: encryption and minimum-data principles.

If a rule's implementation status cannot be verified, consult `CHANGES.md` and the relevant knowledge-base file before assuming it exists.

Full rules and traceability: `knowledge-base/05_reglas_de_negocio.md`.

## Appointment states

```text
PENDING_CONFIRMATION -> CONFIRMED -> COMPLETED
PENDING_CONFIRMATION -> CONFIRMED -> NO_SHOW
PENDING_CONFIRMATION -> RELEASED
Any live state -> CANCELLED
```

Release only happens for unconfirmed appointments near start time and only when delivery succeeded.

## Authentication and authorization

- Only the dentist has credentials; patients use appointment tokens.
- Passwords use Argon2id.
- Sessions are database-persisted opaque tokens; only SHA-256 hashes are stored.
- Cookie: `turnos_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, 12-hour max age.
- Idle timeout: 30 minutes; absolute timeout: 12 hours.
- Logout revokes only the current session; multiple sessions are allowed.
- Login has a basic in-memory rate limit: 5 failures per IP per 15 minutes.
- `/api/auth/me` returns only `id`, `fullName`, and `email`.
- Middleware only redirects when the cookie is missing; it is not the authorization boundary.

## Data protection

- Never log PII or patient data.
- No clinical history; patient records are basic only.
- Health data is handled under Ley 25.326 / 26.529.
- WhatsApp/email contains only appointment minimums, never health data.
- Authentication auditing is implemented in `C-03` (`LOGIN`, `LOGIN_FAILED`, `LOGOUT`). Full data-access auditing remains planned in `C-04`.
- `AuditLog` stores identifiers, action, entity, IP, and timestamp; never passwords, hashes, tokens, cookies, emails, names, phones, or clinical data.

## Conventions

- TypeScript strict; no `any`.
- Domain logic in `src/server/`, never in components or RSC.
- No Prisma calls from Client Components.
- Authorize inside every server action and Route Handler.
- Validate every boundary with Zod.
- Read environment only through `src/lib/env.ts`.
- Generate migrations with Prisma. SQL exceptions require justification and approval, as occurred with PostgreSQL-specific constraints in `C-02`.
- Never run destructive database commands without explicit consent.
- Integration tests use a real PostgreSQL test database, never mocks.
- TDD is required for domain logic.

## External documentation and context recovery

- Use Context7 for library/framework/API documentation when exact syntax, configuration, migration, or version behavior matters. Resolve the library first, then query the specific topic.
- Use Engram to recover prior project context: call `mem_context` at session start, `mem_search` for decisions or past work, and `mem_save` after meaningful decisions or discoveries.
- Before implementing, read the relevant KB file and the change entry in `CHANGES.md`.
- Do not expose secrets, credentials, or personal data in prompts, logs, or documentation.