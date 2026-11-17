# Turnos Odontología

Sistema de turnos para un consultorio odontológico (un odontólogo, una sede):
reserva online sin registro, agenda del odontólogo y recordatorios con
auto-liberación.

**Estado:** núcleo de datos (`C-02 core-models`). El repositorio ya tiene el
esquema Prisma completo, la Migración 001 con la garantía anti-superposición en
PostgreSQL, el seed de desarrollo y los tests de integridad. Todavía no hay
funcionalidad de negocio: el único endpoint es `GET /api/health`. La reserva, la
agenda y la mensajería llegan en los changes siguientes (ver `CHANGES.md`).

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
npx prisma migrate dev    # aplica la Migración 001
```

Creá una vez la base exclusiva de tests y migrala:

```bash
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" turnos_test'
npm run db:test:migrate
```

Sembrá los datos de desarrollo y levantá la aplicación:

```bash
npm run db:seed
npm run dev               # http://localhost:3000
```

Para correr la suite completa:

```bash
npm test
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

## Modelo de datos y Migración 001

El esquema tiene ocho entidades (`Dentist`, `AvailabilityBlock`, `BlockedSlot`,
`TreatmentType`, `Patient`, `Appointment`, `NotificationLog` y `AuditLog`) y seis
enums (`AppointmentStatus`, `NotificationChannel`, `NotificationKind`,
`NotificationStatus`, `AuditActorType` y `AuditAction`).

La migración se genera con Prisma y se completa con un **bloque SQL manual
delimitado** para lo que PSL no expresa:

- `CREATE EXTENSION IF NOT EXISTS btree_gist`;
- el constraint de exclusión `no_overlap` sobre
  `tstzrange("startsAt", "endsAt")` y `"dentistId"`, limitado a los estados
  `PENDING_CONFIRMATION` y `CONFIRMED`;
- los `CHECK` de rango de turno, duración de tratamiento, horario de
  disponibilidad y bloqueo.

Ese bloque es una **excepción explícita y acotada a la regla dura C9** (no
escribir migraciones a mano): se agrega una sola vez al archivo generado, antes
de aplicar la migración, y no se reescribe después. Cualquier cambio posterior
va en una migración nueva. Prisma no modela `CHECK` ni exclusiones; si una
versión futura las marca como drift, se corrige con una migración nueva, nunca
borrando el constraint para “limpiar” el drift.

La garantía anti-superposición se evalúa en la base, no solo en la aplicación:
un turno que se superpone con otro turno vivo del mismo odontólogo se rechaza
incluso si la escritura se hace con SQL directo. Los rangos son semiabiertos
`[startsAt, endsAt)`, así que dos turnos contiguos (09:00–09:30 y
09:30–10:00) se aceptan. Los estados `CANCELLED`, `RELEASED`, `COMPLETED` y
`NO_SHOW` liberan la franja.

### Aplicar migraciones

- **Desarrollo:** `npx prisma migrate dev`. Genera y aplica migraciones nuevas;
  si solo querés generar el archivo, usá `--create-only`.
- **CI y producción:** `npx prisma migrate deploy`. Aplica las migraciones
  versionadas sin generar cambios nuevos.
- **Verificar drift:** `npx prisma migrate status`.

Los turnos **se cancelan y conservan**; no se eliminan en los flujos normales de
la aplicación. La cascada de `Appointment` a `NotificationLog` es una red de
seguridad para bajas excepcionales, no el camino de una cancelación: cancelar un
turno no borra sus notificaciones. No se ejecutan comandos destructivos
(`migrate reset`, `db push --force-reset`, `db push --accept-data-loss`) sin
consentimiento explícito en el momento.

## Base de tests aislada

`TEST_DATABASE_URL` es una variable **solo de tests**: no forma parte de
`src/lib/env.ts` ni de la configuración de la aplicación. La suite la exige.

`tests/setup.ts` es el único `setupFiles` de Vitest y ejecuta el guard en top
level, antes de importar cualquier módulo de aplicación:

1. valida `TEST_DATABASE_URL` (y `DATABASE_URL` si está) con Zod;
2. aborta si faltan, si son la misma URL normalizada o si las dos resuelven a la
   misma base física (`current_database()`, `inet_server_addr()` e
   `inet_server_port()`);
3. verifica que la base de tests tenga al menos una migración aplicada;
4. recién entonces reemplaza `DATABASE_URL` por `TEST_DATABASE_URL`.

Después del override, incluso un test que importe por error el singleton de
`src/lib/prisma.ts` escribe en la base de tests. Los mensajes del guard nombran
la variable y el motivo, pero nunca imprimen la URL completa. La suite corre con
`fileParallelism: false` porque los tests comparten la base y el test del seed
cuenta filas globales.

Pasos para correrla en local:

```bash
npm run db:up
npx prisma migrate dev
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" turnos_test'
npm run db:test:migrate
npm test
```

Si `TEST_DATABASE_URL` falta, apunta a la base de desarrollo o no se puede
demostrar que es una base distinta y migrada, la suite **aborta antes de
cualquier escritura**. No se acepta correr los tests contra la base de
desarrollo.

## Seed de desarrollo

```bash
npm run db:seed
```

El seed es idempotente y crea, si faltan:

- un odontólogo ficticio `odontologo@example.com`;
- seis tratamientos base (consulta, limpieza, obturación, endodoncia, extracción
  simple y corona);
- diez bloques de disponibilidad (lunes a viernes, 09:00–13:00 y 15:00–19:00).

La contraseña pública es **`dev-only-password`** y está pensada **exclusivamente
para desarrollo**. No se usa en producción ni se comparte fuera del entorno
local. Se almacena como hash Argon2id con parámetros explícitos: `v=19`,
`m=19456`, `t=2`, `p=1`, salida de 32 bytes y sal aleatoria de 16 bytes.

La estrategia es _find-or-create_: si el odontólogo ya existe, el seed no
regenera el hash ni actualiza `passwordHash`/`updatedAt`; si el catálogo o la
disponibilidad ya tienen filas, no los pisa. No crea pacientes, turnos ni
notificaciones y no llama a WhatsApp, email ni a ningún servicio externo. El
seed no se ejecuta en CI; los tests no dependen de él.

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
| `npm test`                | Suite completa de Vitest contra la base de tests                 |
| `npm run test:watch`      | Vitest en modo watch                                             |
| `npm run db:up`           | Levanta el contenedor de Postgres                                |
| `npm run db:down`         | Detiene el contenedor de Postgres                                |
| `npm run db:logs`         | Sigue los logs del contenedor                                    |
| `npm run db:test:migrate` | Aplica las migraciones a la base de tests                        |
| `npm run db:seed`         | Ejecuta el seed de desarrollo                                    |
| `npm run prisma:generate` | Genera el cliente de Prisma                                      |
| `npm run prisma:validate` | Valida el schema de Prisma                                       |

La suite está partida en dos: `tests/unit` corre sin base de datos y
`tests/integration` necesita un Postgres real y alcanzable (no se mockea la
base: la integridad crítica del sistema vive ahí).

## Variables de entorno

`npm install` no configura nada por vos: copiá `.env.example` a `.env` (que
está ignorado por git) y ajustá los valores.

| Variable                | Requerida        | Uso                                          |
| ----------------------- | ---------------- | -------------------------------------------- |
| `DATABASE_URL`          | **sí**           | Conexión a PostgreSQL                        |
| `TEST_DATABASE_URL`     | **sí, en tests** | Base exclusiva de la suite; no es de runtime |
| `SESSION_SECRET`        | no               | Firma de la cookie de sesión (C-03)          |
| `APP_BASE_URL`          | no               | Generación de los enlaces del turno (C-08)   |
| `TZ_CONSULTORIO`        | no               | Zona horaria del consultorio (C-05)          |
| `WHATSAPP_TOKEN`        | no               | Token de la WhatsApp Cloud API (C-13)        |
| `WHATSAPP_PHONE_ID`     | no               | Número emisor (C-13)                         |
| `WHATSAPP_VERIFY_TOKEN` | no               | Verificación del webhook (C-13)              |
| `WHATSAPP_APP_SECRET`   | no               | Validación de firma de WhatsApp (C-13)       |
| `EMAIL_API_KEY`         | no               | Proveedor de email de respaldo (C-14)        |
| `EMAIL_FROM`            | no               | Remitente del email de respaldo (C-14)       |
| `CRON_SECRET`           | no               | Protección del job de auto-liberación (C-15) |

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
Apuntá `DATABASE_URL` a esa instancia y ejecutá `npx prisma migrate dev` y
`npm run db:seed`. Para pararla:
`npx prisma dev stop turnos-odontologia`.

Es una instancia PostgreSQL-compatible (17.5) sobre WebAssembly, cómoda para
verificar conectividad, migrar y sembrar. Dos límites a tener presentes: ignora
la base de la URL (acepta cualquier nombre), así que no reproduce los casos de
credenciales o base inválidas; y no garantiza una base de tests separada. Si el
guard no puede demostrar que `TEST_DATABASE_URL` es otra base física, **aborta**;
en ese caso usá Docker, un PostgreSQL nativo o el CI. El camino canónico del
proyecto sigue siendo `docker-compose.yml` con `postgres:15`, que es el mismo
motor que usa el CI.

## Integración continua

`.github/workflows/ci.yml` corre, en cada push y en cada pull request, con
`postgres:15` levantado como servicio:

1. `npm ci` y `npx prisma generate`;
2. crea la base `turnos_test` y aplica `npx prisma migrate deploy` a la base de
   la aplicación;
3. aplica `npm run db:test:migrate` a la base de tests;
4. `lint`, `typecheck`, `test` y `build`.

La primera evidencia real sobre PostgreSQL 15 se produce en el CI. La suite
local puede correr sobre Docker, un PostgreSQL nativo o `prisma dev` cuando el
guard puede verificar la separación de la base de tests.
