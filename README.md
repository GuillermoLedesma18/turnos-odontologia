# Turnos Odontología

Sistema de turnos para un consultorio odontológico (un odontólogo, una sede):
reserva online sin registro, agenda del odontólogo y recordatorios con
auto-liberación.

**Estado:** fundación (`C-01 foundation-setup`). El repositorio instala,
compila, levanta su base y pasa el CI, pero todavía no tiene funcionalidad de
negocio: el único endpoint es `GET /api/health`. La reserva, la agenda y la
mensajería llegan en los changes siguientes (ver `CHANGES.md`).

El dominio está documentado en `knowledge-base/` y las reglas de trabajo para
agentes en `AGENTS.md`.

## Requisitos

- **Node.js 24 LTS** (`>=22.12`). La versión está fijada en `.nvmrc`.
- **npm** (el lockfile es de npm: `package-lock.json`).
- **Docker** para el Postgres local. Si no tenés Docker, ver
  [Alternativa sin Docker](#alternativa-sin-docker).

## Puesta en marcha

```bash
npm install
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm run db:up             # Postgres 15 en localhost:5432
npm run dev               # http://localhost:3000
```

`npm run dev` y `npm run build` generan el cliente de Prisma por su cuenta. Si
lo necesitás suelto, `npx prisma generate`.

### Verificar que el sistema está sano

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","database":"up"}
```

El endpoint responde `200` cuando el proceso está vivo **y** la base responde, y
`503` con `{"status":"degraded","database":"down"}` cuando la base no responde.
Es público a propósito (lo consumen el deploy, el monitoreo y los tests de
humo) y no expone secretos, credenciales ni trazas.

Para ver el estado degradado sin tocar la base: `npm run db:down`, volver a
consultar (debería dar `503`) y levantar de nuevo con `npm run db:up`.

## Scripts

| Script                    | Qué hace                                                         |
| ------------------------- | ---------------------------------------------------------------- |
| `npm run dev`             | Servidor de desarrollo con hot-reload en `http://localhost:3000` |
| `npm run build`           | Genera el cliente de Prisma y compila para producción            |
| `npm start`               | Sirve el build de producción                                     |
| `npm run lint`            | ESLint (`next lint`) sobre `src/` y `tests/`                     |
| `npm run format`          | Prettier sobre el código (`--write`)                             |
| `npm run format:check`    | Prettier en modo verificación (no escribe)                       |
| `npm run typecheck`       | TypeScript en modo estricto, sin emitir                          |
| `npm test`                | Suite completa de Vitest (requiere la base levantada)            |
| `npm run test:watch`      | Vitest en modo watch                                             |
| `npm run db:up`           | Levanta el contenedor de Postgres                                |
| `npm run db:down`         | Detiene el contenedor de Postgres                                |
| `npm run db:logs`         | Sigue los logs del contenedor                                    |
| `npm run prisma:generate` | Genera el cliente de Prisma                                      |
| `npm run prisma:validate` | Valida el schema de Prisma                                       |

La suite está partida en dos: `tests/unit` corre sin base de datos y
`tests/integration` necesita un Postgres real y alcanzable (no se mockea la
base: la integridad crítica del sistema vive ahí).

## Variables de entorno

`npm install` no configura nada por vos: copiá `.env.example` a `.env` (que
está ignorado por git) y ajustá los valores.

| Variable                | Requerida | Uso                                          |
| ----------------------- | --------- | -------------------------------------------- |
| `DATABASE_URL`          | **sí**    | Conexión a PostgreSQL                        |
| `SESSION_SECRET`        | no        | Firma de la cookie de sesión (C-03)          |
| `APP_BASE_URL`          | no        | Generación de los enlaces del turno (C-08)   |
| `TZ_CONSULTORIO`        | no        | Zona horaria del consultorio (C-05)          |
| `WHATSAPP_TOKEN`        | no        | Token de la WhatsApp Cloud API (C-13)        |
| `WHATSAPP_PHONE_ID`     | no        | Número emisor (C-13)                         |
| `WHATSAPP_VERIFY_TOKEN` | no        | Verificación del webhook (C-13)              |
| `WHATSAPP_APP_SECRET`   | no        | Validación de firma de WhatsApp (C-13)       |
| `EMAIL_API_KEY`         | no        | Proveedor de email de respaldo (C-14)        |
| `EMAIL_FROM`            | no        | Remitente del email de respaldo (C-14)       |
| `CRON_SECRET`           | no        | Protección del job de auto-liberación (C-15) |

Las opcionales pasan a requeridas cuando entra en vigor la funcionalidad que las
usa. "Opcional" significa que la variable puede faltar, **no** que su valor pueda
ser inválido: una variable opcional presente y mal formada también impide el
arranque. Si falta una requerida o hay un formato inválido, el proceso no
arranca y el error nombra la variable y el motivo, sin imprimir su valor.

`.env.example` incluye además un bloque de **infraestructura local** con
`POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB`. No son configuración de la
aplicación (no las valida `src/lib/env.ts`): las consume `docker-compose.yml` y
deben ser consistentes con el usuario y la base de `DATABASE_URL`.

`NODE_ENV` es la otra excepción y tampoco se declara acá: lo fijan `next dev`,
`next build` y Vitest, no la configuración de la aplicación (ver design D5).

## Alternativa sin Docker

La CLI de Prisma 7 puede levantar su propio Postgres local, sin Docker:

```bash
npx prisma dev --name turnos-odontologia --detach
```

Imprime una URL TCP (por ejemplo
`postgres://postgres:postgres@localhost:51214/template1?sslmode=disable`).
Apuntá `DATABASE_URL` a esa instancia y listo. Para pararla:
`npx prisma dev stop turnos-odontologia`.

Es una instancia PostgreSQL-compatible (17.5) sobre WebAssembly, cómoda para
verificar conectividad y correr la suite. Dos límites a tener presentes: ignora
la base de la URL (acepta cualquier nombre), así que no reproduce los casos de
credenciales o base inválidas; y no ejercita el healthcheck del contenedor.

El camino canónico del proyecto sigue siendo `docker-compose.yml` con
`postgres:15`, que es el mismo motor que usa el CI.

## Integración continua

`.github/workflows/ci.yml` corre, en cada push y en cada pull request, la misma
cadena que se espera en local: `npm ci` → `prisma generate` → `lint` →
`typecheck` → `test` → `build`, con `postgres:15` levantado como servicio.
