# Design

## Context

Ver `proposal.md` para la motivación. El estado actual es un repo sin código: solo existen la KB, `CHANGES.md`, `AGENTS.md`/`CLAUDE.md`, el andamiaje de OpenSpec y las skills del proyecto. Las restricciones que moldean este diseño son:

- **`DD-03`** fija un monolito Next.js (App Router) + Postgres + Prisma, un solo deploy.
- **`DD-05`** (slots calculados, no persistidos) implica que C-01 no persiste nada de dominio: su única relación con la base es *poder alcanzarla*.
- **Prisma 7.x** — la KB se corrigió de 5.x a 7.x (ver `AGENTS.md` §Stack). Prisma 7 mueve la configuración del CLI fuera de `schema.prisma` (a `prisma.config.ts`) y construye el cliente con un *driver adapter*.
- **Reglas duras del proyecto** (`AGENTS.md`): TypeScript estricto sin `any`, dominio en `src/server/`, Zod en los bordes, secretos solo en servidor, y tests de integración contra Postgres real (sin mocks de base).
- **Toolchain confirmada con el usuario**: npm + Node 24 LTS (`.nvmrc` = 24, `engines.node` ≥ 22.12), runner de tests Vitest. Ni la KB ni `CHANGES.md` los fijaban. Node 20, la primera opción, se descartó durante la implementación: entró en EOL en abril de 2026 y Vitest 5 exige ≥ 22.12; `package.json`, el lockfile y el CI quedan alineados a 24.

## Goals / Non-Goals

**Goals:**

- Un repo que instala, compila, levanta su base y pasa el CI, con un comando por paso.
- Fijar las convenciones que heredan `C-02..C-16`: estructura de carpetas, scripts, `tsconfig`, runner de tests y lugar del cliente Prisma.
- Que el arranque falle temprano y con un mensaje accionable ante configuración inválida.
- Un health check que funcione a la vez como smoke test y como contrato operativo del deploy.

**Non-Goals:**

- Ningún modelo de dominio real ni migración de negocio; eso es `C-02`.
- Autenticación, sesiones y middleware de rutas protegidas: en C-01 no hay superficie protegida (`C-03`).
- Rate limiting, verificación de firma de webhooks y cifrado aplicativo (`C-08`, `C-13`).
- Observabilidad más allá de logs estructurados básicos; sin APM ni métricas.
- Entornos staging/producción reales: C-01 entrega desarrollo local + CI.

## Decisions

### D1. Prisma 7 con `prisma.config.ts` y driver adapter `@prisma/adapter-pg`

Se usa la forma de Prisma 7: `prisma.config.ts` para el CLI, un schema sin bloque de config, y un singleton del cliente en `src/lib/prisma.ts` construido con el adapter de Postgres.

*Alternativa descartada:* quedarse en Prisma 5.x para no tocar la KB. Se descarta porque las skills instaladas (`prisma-cli`, `prisma-client-api`) documentan exclusivamente Prisma 7 y su uso de `prisma.config.ts`/adapter.

*Implicancia:* el cliente Prisma vive en `src/lib/` porque es infraestructura, no dominio; `src/server/` lo consume.

### D2. `schema.prisma` sin modelos; el smoke test verifica conectividad, no tablas

C-01 no define entidades: el modelo de datos es el objeto de `C-02`, que declara explícitamente la **Migración 001** (tablas + `btree_gist` + constraint `no_overlap`). Por eso C-01 **no** crea ninguna migración: agregar un modelo placeholder generaría una migración baseline descartable y desplazaría la numeración que el roadmap promete.

El smoke de "arranque de Prisma" se implementa como conexión + `SELECT 1` a través del cliente, que es exactamente lo que el health check necesita.

*Alternativa descartada:* modelo placeholder con migración inicial. Se descarta por la colisión de numeración con `C-02` y porque obligaría a una migración de borrado en el change siguiente.

### D3. El health route debe ser dinámico (`force-dynamic`)

En Next.js 14 un route handler `GET` sin funciones dinámicas es candidato a *prerender* en `next build`. Si el health route quedara estático, el build dispararía la consulta a la base contra valores dummy de CI y fallaría, y el endpoint dejaría de reflejar el estado real en runtime.

Se marca `export const dynamic = 'force-dynamic'` (equivalente a `revalidate = 0`) para que se evalúe por request. Esto es lo que hace verificable el escenario "la base lenta no cuelga el endpoint".

### D4. Comprobación de base acotada en dos capas: timeout de conexión y deadline del chequeo

La cota vive en una única constante exportada, `DATABASE_TIMEOUT_MS` (`src/lib/prisma.ts`), con dos usos complementarios:

- **Timeout de conexión del pool** (`connectionTimeoutMillis` del adapter `pg`): sin él, `pg` no acota el intento de conexión. Contra una base colgada la promesa queda pendiente indefinidamente y retiene un slot del pool por cada request, que es una fuga silenciosa. Con la cota, el intento se corta, el error se propaga y el cliente vuelve al pool.
- **Deadline del chequeo** (`Promise.race` en el route handler): cota total del health check. Cubre lo que el timeout de conexión no cubre —que la conexión se establezca y la consulta no vuelva— y garantiza que la request responda.

Una base lenta produce `503` degradado en vez de una request colgada. El valor (~2 s) es un detalle de implementación: ajustarlo no cambia el spec, que solo exige que el endpoint no quede pendiente y que la base inalcanzable se reporte como degradada. El test de integración verifica las dos capas: que el intento contra un servidor que acepta y nunca responde rechaza por sí solo, y que el endpoint igual responde `503` dentro de la cota.

### D5. Validación de entorno al importar, con `src/lib/env.ts` como único punto

`src/lib/env.ts` parsea `process.env` con Zod y exporta un objeto tipado. Los módulos de servidor importan de ahí y nunca leen `process.env` directo (regla dura B7).

*Trade-off aceptado:* la validación corre al importar el módulo, así que `next build` en CI necesita valores válidos (dummy). Es preferible a un arranque que falle recién en la primera request: el escenario "variable requerida ausente → el proceso no arranca" es más simple de garantizar así. El CI provee dummies de `.env.example` y ningún secreto real.

Qué es *requerido* y qué es *opcional* es una decisión de este diseño, no del spec. En C-01 **la única variable requerida es `DATABASE_URL`**, que es la única que el arranque y el health check consumen realmente. El resto entra al esquema como opcional y pasa a requerida junto con la funcionalidad que la usa: `SESSION_SECRET` en `C-03`; `APP_BASE_URL` y `TZ_CONSULTORIO` en `C-05`/`C-07`; las de mensajería y `CRON_SECRET` en `C-13..C-15`. Exigirlas todas desde C-01 obligaría a inventar un token de WhatsApp y una API key de email solo para levantar el proyecto. Ojo con la semántica: *opcional* significa que la variable puede faltar, **no** que su valor pueda ser inválido — una variable opcional presente y mal formada también debe hacer fallar el arranque.

`NODE_ENV` es la única excepción y no entra al esquema, aunque `src/lib/prisma.ts` lo lea para decidir si cuelga el singleton de `globalThis`. No es configuración de la aplicación sino un flag del runtime que fijan las herramientas (`next dev`, `next build`, Vitest) y que no se declara en `.env`. Incluirlo en el esquema y en la plantilla invitaría a fijarlo a mano, y como `tests/setup.ts` carga `.env`, un `NODE_ENV` escrito ahí pisaría el `test` de Vitest. La regla dura B7 se mantiene donde importa: toda la configuración del sistema pasa por el esquema, y el módulo documenta por qué esta lectura queda fuera.

### D6. Postgres 15 local por Docker Compose

`docker-compose.yml` con `postgres:15`, healthcheck propio, volumen nombrado y credenciales interpoladas desde `.env` (nunca hardcodeadas). Como `§Variables de entorno` de la KB define solo `DATABASE_URL` y Compose no puede descomponer esa URL, `.env.example` suma un bloque de **infraestructura local** con `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`; `DATABASE_URL` debe ser consistente con ese usuario y esa base. Estas tres no son configuración de la aplicación y no entran al esquema de `src/lib/env.ts`. Scripts `db:up` / `db:down` / `db:logs` para que levantar la base sea un comando.

*Alternativa descartada:* `prisma dev` (Postgres local administrado por la CLI). Se descarta porque la KB pidió explícitamente "PostgreSQL 15 (Docker Compose local)" y porque conviene que el Postgres local sea el mismo artefacto que el de CI (imagen oficial), dado que `C-02` depende de `btree_gist` y de un exclusion constraint real.

*Excepción documentada:* la máquina donde se implementó y verificó C-01 no tiene Docker, Podman, Postgres ni WSL, así que la verificación corrió contra el Postgres local de la CLI de Prisma (`npx prisma dev --name turnos-odontologia --detach`): PostgreSQL 17.5 sobre WebAssembly en `localhost:51214`, que el README documenta como *alternativa sin Docker*. La decisión canónica no cambia —Compose sigue siendo el camino del proyecto y el motor del CI—, pero la alternativa queda reconocida, con su evidencia: en esa instancia `btree_gist` está disponible, así que el riesgo de la extensión para `C-02` no depende de qué Postgres se use en local. Dos límites de esa instancia, para no confundir lo verificado con lo asumido: ignora la base de la URL (acepta cualquier `pathname`, así que no reproduce el caso "credenciales o base inválidas") y su versión no es la 15 del proyecto.

La tarea 2.1 (healthcheck del contenedor y `db:up`/`db:down`/`db:logs`) se cierra como **excepción documentada**, decidida por el usuario: el archivo y los scripts existen y Compose los parsea, pero ejercitarlos requiere una máquina con Docker. Se verifican en la primera que la tenga —o en el CI, donde el servicio `postgres:15` ya corre la cadena completa en cada push.

### D7. El CI corre lint + typecheck + build + test, con Postgres 15 como servicio

`CHANGES.md` pide lint + typecheck + build; la regla dura D15 hace de `test` parte de la puerta. El CI corre los cuatro, con `postgres:15` como *service* y `prisma generate` antes del build. `next build` recibe las variables dummy.

### D8. `.gitignore` en C-01 (no existe todavía)

Al no existir `.gitignore`, este change lo crea. Ignora `node_modules/`, `.next/`, `coverage/`, `*.tsbuildinfo`, `.env*` (salvo `.env.example`) y **`.atl/`** (el skill-registry es artefacto local, no versionado). No ignora `.agents/` ni `skills-lock.json`: las skills del proyecto se versionan para que el resto del equipo y los agentes las tengan.

### D9. Layout de carpetas según `08_arquitectura_propuesta.md`

`prisma/` en la raíz; `src/app` (UI + route handlers), `src/server` (dominio), `src/lib` (utilidades: env, prisma, zod, fechas, teléfono) y `src/components`. C-01 solo crea las carpetas y los archivos de infraestructura; el contenido de `src/server` llega con `C-02`.

La KB no define dónde viven los tests; C-01 lo fija como convención para los changes siguientes: `tests/unit` (sin base de datos) y `tests/integration` (contra un Postgres real, sin mocks — regla dura 14: la integridad crítica vive en la base). El runner es Vitest, con la configuración en `vitest.config.mts` (la extensión `.mts` hace que el archivo se cargue como módulo ES sin depender de `type` en `package.json`), el alias `@/*` y `tests/setup.ts` cargando `dotenv`. `npm test` corre las dos mitades y requiere la base alcanzable.

## Risks / Trade-offs

- **[Prisma 7 es reciente; su API de adapter/config puede moverse entre minors]** → fijar versión exacta (sin `^`) para `prisma`, `@prisma/client` y `@prisma/adapter-pg`; `AGENTS.md` ya documenta el contrato de Prisma 7 para los agentes.
- **[Un health route estático se prerenderiza y rompe el build o miente en runtime]** → `force-dynamic` explícito (D3) y un test que verifica la respuesta en runtime.
- **[Los tests de integración necesitan Postgres levantado; sin Docker fallan]** → `npm run db:up` documentado en el README; el CI siempre lo tiene como servicio.
- **[Compose no se ejercitó en la máquina donde se implementó C-01]** → `db:up`/`db:down`/`db:logs` y el healthcheck del contenedor quedaron verificados solo por parseo de Compose y por consistencia con `.env.example` (tarea 2.1, cerrada como excepción documentada). Se comprueban en la primera máquina con Docker o en el CI, que levanta `postgres:15` como servicio.
- **[El `.env.example` incompleto se descubre tarde, cuando `C-13`/`C-14` necesitan WhatsApp y email]** → la plantilla incluye las 11 variables de `08_arquitectura_propuesta.md` desde C-01, aunque las de mensajería todavía no se consuman.
- **[`btree_gist` requiere privilegios elevados]** → C-01 no la crea; se deja anotado que `C-02` la declara sobre la imagen oficial de Postgres 15, donde el rol por defecto es superusuario. Verificado como disponible en el Postgres local de `npx prisma dev` (D6); sobre la imagen oficial `postgres:15` no se pudo comprobar en esta máquina. Si el entorno gestionado no lo permitiera, hay que resolverlo en `C-16`.
- **[Filas de versión de Next/React/Tailwind elegidas por "mínima" en la KB]** → se instalan las últimas de la línea indicada (Next 14, React 18, Tailwind 3.4) y se congelan en el lockfile; subir de línea mayor es un change propio.

## Migration Plan

No hay datos, usuarios ni esquema previo: el "deploy" de C-01 es dejar el repo ejecutable.

1. Crear scaffolding, configuración y toolchain (sin base de datos).
2. `npm install` → `npm run db:up` → `npx prisma generate` → `npm run dev` y verificar `GET /api/health` en local.
3. `npm run lint && npm run typecheck && npm test && npm run build` en verde, y el mismo resultado en el CI.

**Rollback:** revertir el commit. Al no existir código ni esquema previo, no hay estado que migrar ni datos que preservar; no aplica rollback de esquema (la primera migración del proyecto es la de `C-02`).

## Open Questions

- Versión exacta de Prisma 7 y del adapter a congelar: se resuelve al instalar; no altera el diseño.
- ¿Conviene que el health check devuelva latencia de la base? Es útil para diagnosticar y el spec no lo exige; se puede sumar después.
- ¿El CI debería correr los tests de integración contra un Postgres efímero por PR en vez de un servicio fijo? Hoy el servicio alcanza; se revisa si crece el tiempo de pipeline.
