# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

> Paths are relative to the project root (`turnos-odontologia`).

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| React/Next.js components, pages, data fetching, bundle size, performance | vercel-react-best-practices | `.agents/skills/vercel-react-best-practices/SKILL.md` |
| Prisma CLI commands (`init`, `generate`, `migrate`, `db`, `dev`, `studio`, `mcp`) | prisma-cli | `.agents/skills/prisma-cli/SKILL.md` |
| Prisma Client queries, CRUD, filters, relations, transactions | prisma-client-api | `.agents/skills/prisma-client-api/SKILL.md` |
| Needs a database / set up or connect Postgres (incl. `create-db`) | prisma-postgres-setup | `.agents/skills/prisma-postgres-setup/SKILL.md` |
| Any Postgres schema, migration, index, RLS, query or performance work | supabase-postgres-best-practices | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |

**Skipped as workflow/meta skills** (not injected into implementation sub-agents): `.opencode/skills/openspec-*` (OpenSpec SDD workflow), `~/.config/opencode/skills/{active-orchestrator,discovery-research,kb-creator,roadmap-generator,find-skill,agent-instruction,web-scraper,skill-creator}`.

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### vercel-react-best-practices
- Eliminate waterfalls: start independent async work immediately and `Promise.all` independent awaits; move `await` into the branch that actually uses it.
- Authenticate **inside** every Server Action — `"use server"` functions are public endpoints. Validate input, then authenticate, then authorize.
- Never keep request/user data in module-level mutable state: concurrent server renders leak one request's data into another.
- Avoid barrel imports; rely on Next.js `optimizePackageImports`; lazy-load heavy components with `next/dynamic` (`{ ssr: false }` for client-only).
- Pass only the fields the client uses across the RSC boundary; never send derived copies (`arr.toSorted()`, `{...obj}`) as extra props — new references re-serialize.
- `React.cache()` for per-request dedup (DB, auth); LRU cache for cross-request reuse (effective on Fluid Compute).
- Use `after()` from `next/server` for non-blocking post-response work (analytics, notifications, audit logs).
- Derive state during render instead of state + effect; run interaction side effects in event handlers, not effects.
- Functional `setState(prev => ...)`, lazy initializers (`useState(() => ...)`) for expensive init, `.toSorted()` instead of `.sort()`.
- Hoist static JSX, regexes and I/O to module level; use CSS `content-visibility: auto` for long lists.
- Never define a component inside another component; extract memoized components to enable early returns.

### prisma-cli
- These commands are **Prisma ORM 7 only**. Use the project's version-matched CLI (`npx prisma`); never install a floating `prisma@latest`.
- Do not confuse the ORM CLI (`prisma`) with the beta Platform CLI (`@prisma/cli`, binary `prisma-cli`).
- Configuration lives in `prisma.config.ts` (`defineConfig`, `env('DATABASE_URL')`, `import 'dotenv/config'`).
- Dev migrations: `prisma migrate dev --name <x>`; production/CI: `prisma migrate deploy`. Never run `migrate dev` in production.
- Schema sync without migrations: `prisma db push`; introspect an existing DB: `prisma db pull`; raw SQL: `prisma db execute --file ...`.
- Run `prisma generate` explicitly after `migrate dev` / `db push`; run `prisma db seed` explicitly after migrating.
- Local dev database: `prisma dev` (Prisma Postgres) with `dev ls | stop | rm`.
- Destructive commands (`migrate reset`, `db push --force-reset`, `db push --accept-data-loss`) are blocked for AI agents until explicit user consent. Ask each time, never infer consent from earlier messages, never invent the consent text.
- Read `references/agent-safety.md` before any destructive Prisma command.

### prisma-client-api
- Instantiate once and reuse: `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })`; import the client from the generated path.
- Model methods: `findUnique(OrThrow)`, `findFirst(OrThrow)`, `findMany`, `create`, `createMany(AndReturn)`, `update(Many)(AndReturn)`, `upsert`, `delete(Many)`, `count`, `aggregate`, `groupBy`.
- Shape queries with `select` / `include` / `omit`; paginate with `take` + `skip` or `cursor`, always with a deterministic `orderBy`.
- Select only needed fields/relations — over-fetching causes N+1 and payload bloat.
- Transactions: array form `prisma.$transaction([...])`, or interactive `$transaction(async tx => ...)` when later steps depend on earlier results.
- Raw SQL only via `$queryRaw` (read) / `$executeRaw` (write) with parameters — never interpolate user input into SQL strings.
- Filters: `equals/not/in/notIn/lt/lte/gt/gte/contains/startsWith/endsWith` and `mode: 'insensitive'`; relation filters `some/every/none/is/isNot`.
- Lifecycle/extensions: `$connect`, `$disconnect`, `$on`, `$extends`.

### prisma-postgres-setup
- Reuse an existing connection or integration first; inspect the requested ORM/driver, installed packages and env files — check secret presence without printing values.
- Never hardcode the connection string in source, docs or chat. Store it in the project's secret env config and keep local secret files git-ignored.
- App processes and CLI commands may load different env files (e.g. `.env.development.local` vs a plain shell). A variable missing from the shell does NOT mean the database is missing — never provision a second database for that reason.
- No database and none named: offer `npx create-db@latest` (temporary, deleted after 24 h unless claimed) or persistent provisioning; ask which when unstated.
- Resolve workspace/project/region before creating; if provisioning is blocked by quota or permissions, report the blocker — never delete other resources or switch workspaces to work around it.
- ORM configuration is a handoff: use the installed `prisma-orm-setup` skill. Do not restart setup for an already-configured app.
- Verify with a read-only query through the app's chosen ORM/driver and report what connected, the ORM version and the result (no secrets). If a step is blocked or untested, say so instead of claiming success.

### supabase-postgres-best-practices
- Applies to **any** Postgres, not only Supabase. Load before creating/altering tables, writing migrations or DDL, indexing, RLS/privileges, triggers, functions, queues/cron, or tuning queries.
- Index every column used in `WHERE` and `JOIN`. Postgres does **not** auto-index foreign keys — always index the referencing column.
- Prefer composite / covering / partial indexes over scattering single-column ones; confirm with `EXPLAIN ANALYZE` instead of guessing.
- Types: `bigint generated always as identity` for PKs, `text` instead of `varchar(n)`, `timestamptz` instead of `timestamp`, `numeric` for money, `boolean` instead of string flags.
- Connections are expensive: pool them (PgBouncer, transaction mode) — never one connection per request; size the pool around `(cores * 2) + spindles`.
- For tenant/user-scoped data, enable and **force** Row Level Security so isolation is enforced by the database, not only by application code.
- Avoid N+1: batch with `= any($1::bigint[])` or JOINs, and batch inserts; paginate with keyset/cursor rather than large `OFFSET`.
- Keep transactions short, use `SKIP LOCKED` for queue-like access, and acquire locks in a consistent order to avoid deadlocks; create indexes on large tables without blocking writes (`concurrently`).
- Diagnose with `pg_stat_statements` and `EXPLAIN ANALYZE`; keep `VACUUM`/`ANALYZE` hygiene in mind.

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | `AGENTS.md` | **Index** — instrucciones para agentes: stack, KB, skills por rol, roadmap y 22 reglas duras |
| CLAUDE.md | `CLAUDE.md` | Copia idéntica de `AGENTS.md` (mismo contenido, distinto harness) |
| knowledge-base/README.md | `knowledge-base/README.md` | Índice de la KB + resumen ejecutivo y convenciones de códigos |
| knowledge-base/04_modelo_de_datos.md | `knowledge-base/04_modelo_de_datos.md` | Entidades, `EXCLUDE USING gist` anti-overlap, appointment states |
| knowledge-base/05_reglas_de_negocio.md | `knowledge-base/05_reglas_de_negocio.md` | Business rules `RN-{DOM}-{NN}` — hard constraints |
| knowledge-base/06_funcionalidades.md | `knowledge-base/06_funcionalidades.md` | `US-NNN` stories and `F1..F6` scope |
| knowledge-base/08_arquitectura_propuesta.md | `knowledge-base/08_arquitectura_propuesta.md` | Stack: Next.js App Router + TypeScript + PostgreSQL + Prisma + Tailwind |
| knowledge-base/09_decisiones_y_supuestos.md | `knowledge-base/09_decisiones_y_supuestos.md` | `DD-NN` decisions, `SU-NN` assumptions |
| knowledge-base/11_recordatorios_y_mensajeria.md | `knowledge-base/11_recordatorios_y_mensajeria.md` | WhatsApp-first reminders, email fallback, auto-release |
| knowledge-base/12_cumplimiento_datos_de_salud.md | `knowledge-base/12_cumplimiento_datos_de_salud.md` | Health-data compliance (Ley 25.326 AR) |
| CHANGES.md | `CHANGES.md` | Roadmap: 16 OpenSpec changes (C-01..C-16), 7 phases, critical path, gates |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
