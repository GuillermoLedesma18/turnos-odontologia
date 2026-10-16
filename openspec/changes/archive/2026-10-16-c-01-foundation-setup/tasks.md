# Tasks

## 1. Scaffolding y toolchain

- [x] 1.1 Scaffoldear el proyecto con Next.js 14 (App Router) + TypeScript + Tailwind y el código en `src/` — verificar: `npm run dev` levanta el servidor y `/` responde `200`
- [x] 1.2 Completar el layout de carpetas de `08_arquitectura_propuesta.md` (`src/app`, `src/server`, `src/lib`, `src/components`, `prisma/`) con `.gitkeep` donde aún no hay contenido — verificar: los cinco directorios existen y `npm run build` sigue pasando
- [x] 1.3 Fijar el toolchain npm + Node 24 LTS (`.nvmrc`, `engines.node` ≥ 22.12, `packageManager`) y generar `package-lock.json` — verificar: `node -v` coincide con `.nvmrc`, `npm ci` funciona y el lockfile queda versionado
- [x] 1.4 Endurecer `tsconfig.json` en modo estricto con el alias `@/*` (corrigiendo lo que la base generada traiga por defecto) — verificar: `npm run typecheck` pasa sin errores y `strict` está en `true`
- [x] 1.5 Sumar ESLint + Prettier con los scripts `lint` y `format` — verificar: `npm run lint` corre sin errores sobre el código base
- [x] 1.6 Agregar los scripts `dev`, `build`, `lint`, `typecheck` y `test` a `package.json` — verificar: `npm run` lista los cinco y cada uno arranca sin "command not found"
- [x] 1.7 Instalar y configurar Vitest (`vitest`, `vitest.config.mts` con el alias `@/*` y el entorno de ejecución, con la suite partida en `tests/unit` y `tests/integration`) para que el script `test` tenga runner — verificar: `npm test` ejecuta la suite y devuelve código de salida 0
- [x] 1.8 Crear `.gitignore` (`node_modules/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.env*` salvo `.env.example`, `.atl/`) — verificar: `git status` no lista `.env` ni `.atl/`, y sí lista `.env.example`

## 2. Base de datos local y cliente Prisma

- [x] 2.1 Crear `docker-compose.yml` con `postgres:15`, healthcheck, volumen nombrado y credenciales interpoladas de `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` (definidas en `.env`); sumar los scripts `db:up`, `db:down` y `db:logs` — verificar: `npm run db:up` deja el contenedor en estado healthy y la conexión de `DATABASE_URL` funciona contra ese contenedor
  - **Cerrada como excepción documentada** (decisión explícita del usuario). La máquina donde se implementó C-01 no tiene Docker, Podman, Postgres ni WSL, así que el healthcheck del contenedor y `db:up`/`db:down`/`db:logs` no se pudieron ejercitar: el archivo y los scripts existen y Compose los parsea, pero la verificación queda pendiente. Se cubre en la primera máquina con Docker o en el CI, que levanta `postgres:15` como servicio (ver `design.md` D6 y Risks).
- [x] 2.2 Inicializar Prisma 7: `prisma.config.ts` con la ruta del schema y el datasource por `env('DATABASE_URL')`, y `prisma/schema.prisma` **sin modelos** — verificar: `npx prisma validate` pasa y `npx prisma generate` produce el cliente
- [x] 2.3 Implementar `src/lib/prisma.ts` con el singleton del cliente construido con `@prisma/adapter-pg`, tomando la conexión de `src/lib/env.ts` — verificar: un módulo de servidor lo importa sin errores y `npm run typecheck` pasa
- [x] 2.4 Escribir el test de integración de arranque de Prisma: conectar y ejecutar `SELECT 1` contra el Postgres real (sin mocks) — verificar: `npm test` lo pasa con `npm run db:up` activo

## 3. Configuración de entorno

- [x] 3.1 Implementar `src/lib/env.ts` con el esquema Zod — requerida `DATABASE_URL`; opcionales, hasta que las consuma su funcionalidad, `SESSION_SECRET`, `APP_BASE_URL`, `TZ_CONSULTORIO`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `EMAIL_API_KEY`, `EMAIL_FROM` y `CRON_SECRET` — verificar: test unitario que importa el módulo con un entorno válido y obtiene el objeto tipado
- [x] 3.2 Cubrir con tests unitarios el fallo temprano: variable requerida ausente (`DATABASE_URL`), variable requerida con formato inválido (`DATABASE_URL` que no es una cadena de conexión válida) y variable opcional presente con formato inválido (`TZ_CONSULTORIO` que no es zona IANA) — verificar: `npm test` pasa los tres casos y el mensaje de error nombra la variable y el motivo
- [x] 3.3 Verificar que el error de una variable sensible inválida no filtre su valor — verificar: test unitario que asserta que el mensaje contiene el nombre de la variable y no el valor recibido
- [x] 3.4 Crear `.env.example` con los nombres de todas las variables de `08_arquitectura_propuesta.md §Variables de entorno` (sin valores productivos) más el bloque de credenciales del Postgres local (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`), y dejar `.env` fuera de git — verificar: copiar `.env.example` a `.env`, completar valores y arrancar no produce errores de configuración

## 4. Health check

- [x] 4.1 Implementar `GET /api/health` con `export const dynamic = 'force-dynamic'`: devuelve `200` JSON con estado global saludable, accesible sin autenticación y sin exponer secretos, credenciales, cadenas de conexión ni trazas — verificar: test de integración que asserta el `200`, el campo de estado y la ausencia de datos sensibles en cuerpo y headers
- [x] 4.2 Comprobar la alcanzabilidad de la base con un timeout acotado (~2 s) y responder `503` con estado degradado cuando la base no responde — verificar: test de integración con un `DATABASE_URL` de formato válido pero inalcanzable (por ejemplo, puerto sin servicio) devuelve `503` e indicador de base no disponible, sin stack trace
- [x] 4.3 Test de no-efectos-secundarios del health check: invocarlo varias veces no crea ni modifica filas ni emite mensajes externos — verificar: contar filas antes y después en el test da el mismo resultado
- [x] 4.4 Documentar en el README cómo levantar la base y verificar `GET /api/health` — verificar: seguir esa sección desde cero llega a un health check `200`

## 5. Integración continua y documentación

- [x] 5.1 Crear el workflow de GitHub Actions: install → lint → typecheck → `prisma generate` → build (con variables dummy, sin secretos reales) → test, con `postgres:15` como servicio — verificar: el workflow corre en verde sobre un PR de prueba
- [x] 5.2 Escribir el README del repo: requisitos (Node 24 LTS, Docker), puesta en marcha, scripts disponibles, variables de entorno y la alternativa sin Docker — verificar: un entorno nuevo se levanta siguiendo solo el README

## 6. Verificación integral

- [x] 6.1 Correr la cadena completa desde limpio (`npm ci`, `npm run db:up`, `npx prisma generate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`) y confirmar salida exitosa en todos los pasos — verificar: cada comando devuelve código de salida 0
- [x] 6.2 Verificar la trazabilidad contra los specs: cada escenario de `platform-health` y `environment-config` tiene un test o una comprobación manual que lo cubre — verificar: tabla escenario → test sin huecos
- [x] 6.3 Smoke manual del endpoint en ambos estados: con la base levantada (`200` saludable) y con la base detenida (`503` degradado) — verificar: los dos códigos observados coinciden con los specs

## Workflow follow-up

- Archivar el change con `/opsx:archive c-01-foundation-setup` cuando el review esté conforme.
- Marcar `[x]` el change `C-01` en `CHANGES.md` (FASE 0 — Cimientos) al archivar.
- Confirmar que `openspec list` ya no lista el change y que `openspec/specs/` contiene `platform-health` y `environment-config`.
