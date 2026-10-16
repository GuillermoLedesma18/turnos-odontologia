# Proposal

## Why

El proyecto no tiene todavía ningún artefacto ejecutable: no hay `package.json`, ni configuración de TypeScript, ni base de datos, ni pipeline de integración. `C-01` es el primer change del camino crítico de `CHANGES.md` y prerequisito de los 15 restantes (`C-02..C-16`): sin un proyecto que compile, arranque y tenga una base contra la cual migrar, ningún otro change puede empezar.

Resolverlo como change propio —y no de forma implícita dentro de `C-02`— es lo que permite que la integridad crítica de la agenda (`RN-AGE-01`, anti-solapamiento) nazca sobre un entorno reproducible: PostgreSQL 15 local vía Docker Compose, variables de entorno validadas al arrancar, y un CI que corre lint + typecheck + build + test en cada push. Es además el change de menor riesgo del roadmap (governance BAJO) y el único sin dependencias, así que fija convenciones (estructura de carpetas, scripts, runner de tests) antes de que haya código que las herede por accidente.

## What Changes

- Scaffolding de un **monolito Next.js 14 (App Router) + TypeScript + Tailwind CSS**, con la estructura de directorios de `08_arquitectura_propuesta.md`: `src/app`, `src/server` (dominio), `src/lib`, `src/components` y `prisma/`.
- **Prisma 7** inicializado contra **PostgreSQL 15**, con `prisma.config.ts` (la configuración del CLI en Prisma 7, reemplazo del bloque de config en `schema.prisma`) y **Docker Compose** para el Postgres local. El schema queda **sin modelos**: el modelo de datos es el objeto de `C-02` (ver design D2).
- `src/lib/env.ts`: validación con **Zod** de las variables de entorno de `08_arquitectura_propuesta.md §Variables de entorno`, con fallo temprano y mensaje accionable en lugar de un `undefined` silencioso.
- `GET /api/health`: endpoint de humo que reporta el estado del proceso y la conectividad a la base.
- Toolchain de calidad: **ESLint + Prettier**, `tsconfig` en modo estricto, y scripts `dev`, `build`, `lint`, `typecheck` y `test`.
- **CI de GitHub Actions** que corre lint + typecheck + build + test (la regla dura 15 hace de `test` parte de la puerta), con PostgreSQL 15 levantado como servicio.
- Runner de tests **Vitest**, con tests de humo del health check y del arranque de Prisma.
- Sin cambios **BREAKING**: no existe comportamiento previo que romper.

## Capabilities

### New Capabilities

- `platform-health`: comportamiento de observabilidad operativa del monolito — un endpoint de salud consultable sin autenticación que distingue "proceso vivo" de "proceso vivo con base alcanzable", para que el host (cron, deploy, monitoreo) y los tests de humo puedan verificar que el sistema está operativo.
- `environment-config`: comportamiento de arranque respecto de la configuración — el proceso carga y valida sus variables de entorno de forma tipada antes de atender tráfico, y falla temprano con un mensaje que nombra la variable faltante o inválida, en vez de propagar valores vacíos hacia la lógica de dominio o hacia los clientes externos (WhatsApp, email).

### Modified Capabilities

- Ninguna. `openspec/specs/` está vacío: este change no modifica requisitos existentes.

## Impact

- **Código nuevo (todo el repo)**: `package.json`, `tsconfig.json`, `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `.eslintrc`/`eslint.config.*`, `.prettierrc`, `.nvmrc`, `.gitignore`, `README.md`, `.env.example`, `docker-compose.yml`, `vitest.config.*`, `prisma/schema.prisma`, `prisma.config.ts`, `src/lib/prisma.ts`, `src/app/api/health/route.ts`, `src/lib/env.ts`, `src/app/layout.tsx`, `src/app/page.tsx`, `.github/workflows/ci.yml` y los tests de humo.
- **Superficie expuesta**: `GET /api/health` es el único endpoint; pasa a ser el contrato operativo que consumen el CI, el deploy y los tests de humo de todos los changes posteriores.
- **Config local**: `.env.example` versiona las variables de la app (requeridas y opcionales) más un bloque de credenciales del Postgres local que consume `docker-compose.yml`; `DATABASE_URL` queda consistente con ese usuario.
- **Dependencias**: Next.js 14, React 18, TypeScript 5.4, Tailwind 3.4, Zod 3.23, Prisma 7 (+ adaptador Postgres), Vitest, ESLint, Prettier. Toolchain: **npm + Node 24 LTS** (fijado en `.nvmrc` y `engines`), runner de tests **Vitest** — decisiones no cubiertas por la KB, confirmadas con el usuario. Node 20 se descartó al implementar: entró en EOL en abril de 2026 y Vitest 5 exige ≥ 22.12.
- **Naming**: el change se registra como `c-01-foundation-setup` (ID del roadmap `C-01` + slug `foundation-setup` de `CHANGES.md`), para que `openspec list` y el archivo de changes queden trazables contra el roadmap.
- **Fuera de alcance** (van en changes posteriores): cualquier modelo de dominio real (`C-02`), autenticación (`C-03`), catálogo de tratamientos (`C-05`), auditoría (`C-04`), y por supuesto reserva, agenda y mensajería.
- **Impacto en el roadmap**: al completarse y archivarse, habilita `C-02 core-models` (cierra `GATE 0` → `GATE 1`).
