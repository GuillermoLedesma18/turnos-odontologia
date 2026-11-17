# Design

## Context

Ver `proposal.md` para la motivación. El punto de partida es C-01, ya archivado:

- Monolito Next.js 14 (App Router) + TypeScript estricto, Prisma **7.10.1** pineado y PostgreSQL 15 como motor canónico (CI con `postgres:15`).
- `prisma/schema.prisma` solo declara `generator` y `datasource`; **no hay modelos ni migraciones**. La Migración 001 es de este change.
- `src/lib/prisma.ts` ya expone el singleton con `PrismaPg` y `DATABASE_TIMEOUT_MS`; `src/lib/env.ts` valida el entorno con Zod y solo exige `DATABASE_URL`.
- `prisma.config.ts` declara `schema` y `migrations.path`, pero **no** `migrations.seed`; no existe `prisma/seed.ts` ni el script `db:seed`.
- El CI corre `prisma generate`, lint, typecheck, test y build, pero **no aplica migraciones** porque todavía no hay ninguna.
- La suite usa Vitest contra un PostgreSQL real (`tests/setup.ts` carga `.env`); no hay mocks de base. Hoy el setup no distingue una base de tests de la base de desarrollo: C-02 agrega ese aislamiento (D8).

Restricciones que moldean el diseño:

- **Regla dura C9**: no escribir migraciones a mano. Este change la cumple con una **excepción explícita** para el SQL que Prisma no expresa (D1).
- **Regla dura C11**: la no-superposición se garantiza en la base, no solo en código (D2).
- **Regla dura C12**: toda FK debe tener índice en la columna referenciante (D4).
- **Regla dura C13**: `timestamptz` para instantes, `numeric` para dinero, PKs uuid/bigint (D5).
- **DD-01** (single-tenant), **DD-05** (slots calculados, no persistidos) y **DD-10** (coexistencia con la planilla): C-02 no crea tablas de slots ni migra datos existentes.
- **Entorno local**: no hay Docker ni Postgres nativo; la verificación local usa `npx prisma dev` (PostgreSQL 17.5/WASM). La primera evidencia sobre PostgreSQL 15 será el CI. No se debe afirmar que PG15 quedó verificado localmente.

Decisiones aprobadas por el usuario y su ubicación en este documento:

| # | Decisión | Sección |
|---|---|---|
| 1 | Migración generada + SQL manual para `btree_gist`, `no_overlap` y CHECKs, con excepción a C9 documentada | D1, D2 |
| 2 | Seed con hash Argon2id de `dev-only-password` | D7 |
| 3 | CHECK constraints incluidos en C-02 | D2, D5 |
| 4 | `AuditActorType` y `AuditAction` como enums | D3 |
| 5 | `NotificationLog` con una fila por intento | D3 |
| 6 | Índices faltantes de claves foráneas | D4 |
| 7 | Índices de `AuditLog` por fecha y entidad | D4 |
| 8 | `TreatmentType.name` no unique | D4, D7 |
| 9 | `rescheduledFromId` con `Restrict` | D6 |
| 10 | Normalización de email/teléfono en la aplicación | D9 |

## Goals / Non-Goals

**Goals:**

- Una Migración 001 que cree el esquema completo y la garantía anti-superposición desde una base vacía, sin pasos manuales posteriores.
- Acciones referenciales e índices explícitos, verificables por catálogo.
- Un seed idempotente, reproducible y sin secretos reales, que sirva de base para la demo y para C-03.
- Tests de integración que prueben la integridad en PostgreSQL, no en la aplicación.
- Aislar los tests en una base exclusiva y abortar antes de cualquier escritura si no se puede garantizar que sea distinta de `DATABASE_URL`.

**Non-Goals:**

- Autenticación, endpoints, UI, motor de slots, mensajería y jobs: son changes posteriores.
- Vigencia append-only de `AuditLog` (revocación de permisos, triggers o servicio de auditoría): se implementa y **prueba** en C-04. C-02 solo crea la tabla, los enums y los índices; no declara compliance de auditoría (D11).
- Normalización de datos a nivel base (triggers): decisión 10, la hace la aplicación.
- Migración de pacientes o turnos desde la planilla (`DD-10`).
- Multi-tenant (`DD-01`) y persistencia de slots (`DD-05`).
- Despliegue a producción: C-02 valida local + CI.

## Decisions

### D1. Migración generada por Prisma, completada con un bloque SQL delimitado (excepción a C9)

Secuencia de trabajo:

1. Declarar el esquema completo en `prisma/schema.prisma`.
2. `npx prisma migrate dev --name core_models --create-only` para generar el DDL de tablas, enums, índices y FKs **sin aplicarlo**.
3. Agregar al final del archivo generado un bloque delimitado con:
   - `CREATE EXTENSION IF NOT EXISTS btree_gist;`
   - el constraint `no_overlap` (`EXCLUDE USING gist` + predicado parcial);
   - los `CHECK` de tabla que Prisma no expresa.
4. Aplicar con `npx prisma migrate dev` (o `migrate deploy` en CI), ejecutar `prisma generate` y `prisma db seed`.

**Por qué es una excepción a C9 y cómo se acota:** Prisma 7.10.1 no expresa en PSL `CREATE EXTENSION`, `EXCLUDE USING gist`, predicados parciales de exclusión ni `CHECK` de tabla (`@@check` no está confirmado en esta versión). Escribir todo el DDL a mano violaría C9 en mayor grado y perdería la generación de tablas, enums e índices. La excepción se limita a **agregar** un bloque al archivo generado, nunca a reescribir el DDL de Prisma. El bloque lleva un comentario de cabecera que cita C-02, la regla C9 y el motivo.

**Reglas de la excepción:**

- El bloque se agrega **antes** de aplicar la migración. Una vez aplicada, el archivo no se edita: cualquier cambio va en una migración nueva.
- No se usan comandos destructivos (`migrate reset`, `db push --force-reset`, `db push --accept-data-loss`) sin consentimiento explícito.
- La verificación incluye `prisma migrate status` sin drift y un `migrate deploy` desde una base vacía.
- Prisma no modela `CHECK` ni constraints de exclusión: no se espera que los intente borrar, pero si una versión futura los detecta como drift, se resuelve con una migración nueva y se documenta; no se borra el constraint para "limpiar" el drift.

**Alternativas descartadas:**

- *Segunda migración solo para el constraint*: funcionaría, pero deja una ventana en la que la tabla existe sin la invariante y agrega un archivo extra para un objeto que nace con la tabla. Se prefiere una migración atómica.
- *Script posterior a `migrate deploy`* (`db execute`): no queda ordenado con el esquema, el CI necesitaría un paso extra y se rompe la reproducibilidad desde una base vacía.
- *Confiar en `@@check`*: no está confirmado en 7.10.1; usarlo sería una apuesta no verificada.

### D2. Anti-superposición con `EXCLUDE USING gist` sobre `tstzrange`

SQL del bloque manual:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment"
  ADD CONSTRAINT "no_overlap"
  EXCLUDE USING gist (
    "dentistId" WITH =,
    tstzrange("startsAt", "endsAt") WITH &&
  ) WHERE ("status" IN ('PENDING_CONFIRMATION', 'CONFIRMED'));

ALTER TABLE "Appointment"
  ADD CONSTRAINT "appointment_time_range_check"
  CHECK ("endsAt" > "startsAt");

ALTER TABLE "TreatmentType"
  ADD CONSTRAINT "treatment_duration_check"
  CHECK ("durationMinutes" > 0);

ALTER TABLE "AvailabilityBlock"
  ADD CONSTRAINT "availability_time_check"
  CHECK ("startTime" < "endTime");

ALTER TABLE "BlockedSlot"
  ADD CONSTRAINT "blocked_slot_time_check"
  CHECK ("startsAt" < "endsAt");
```

- **`btree_gist`**: GiST no soporta `=` sobre `uuid` por defecto; la extensión aporta la clase de operador. En PostgreSQL 15 es una extensión *trusted*, instalable por el dueño de la base; en el CI el usuario es superusuario.
- **`tstzrange(startsAt, endsAt)`**: usa límites `[)` por defecto. Dos turnos contiguos (09:00–09:30 y 09:30–10:00) **no** se superponen; es el comportamiento deseado y está cubierto por un escenario del spec.
- **Predicado parcial**: solo `PENDING_CONFIRMATION` y `CONFIRMED` participan. `CANCELLED`, `RELEASED`, `COMPLETED` y `NO_SHOW` liberan la franja. La comparación de un enum contra constantes es inmutable, así que es válida en el predicado de una constraint de exclusión.
- **`CHECK` de rango**: `tstzrange` rechaza un rango invertido, pero el `CHECK` da un error claro y cubre el caso de rango vacío (`startsAt = endsAt`), que no debe existir como turno. No se agrega un `CHECK` sobre `status`: el enum ya rechaza valores fuera del catálogo y duplicarlo obligaría a mantener dos listas.
- **Por qué no `tsrange`**: el proyecto almacena instantes en UTC (`RN-SIS-03`) y `timestamptz` es el tipo canónico (C13). `tsrange` perdería la zona.
- **Por qué no solo aplicación**: regla C11; dos requests concurrentes pueden pasar la validación de la aplicación y escribir a la vez. La constraint resuelve la carrera en la base.
- **Alternativa descartada**: transacción `SERIALIZABLE` + chequeo aplicativo. Es más cara, más difícil de razonar y no deja la invariante en el esquema.

### D3. Enums y forma de `AuditLog` / `NotificationLog`

Se definen seis enums: `AppointmentStatus`, `NotificationChannel`, `NotificationKind`, `NotificationStatus`, `AuditActorType` y `AuditAction`.

- **`AuditActorType`** (`DENTIST`, `PATIENT_TOKEN`, `SYSTEM`) nombra el enum que la KB muestra inline.
- **`AuditAction`** (`READ`, `CREATE`, `UPDATE`, `DELETE`, `EXPORT`) reemplaza el `text` de la KB. **Desviación explícita**: tipar el valor evita errores de tipeo, permite indexar y hace que la base rechace acciones fuera del catálogo. Los valores son exactamente los de la KB; no se agregan acciones nuevas en C-02 (`LOGIN` se evaluará en C-03).
- **`NotificationLog` = una fila por intento** (decisión 5): `attempt` es `smallint` con default 1; `status` default `QUEUED`; `sentAt`, `error` y `providerMessageId` son nulables; `createdAt` es obligatorio. El índice `(appointmentId, createdAt)` permite reconstruir la secuencia de intentos.
  - **Retención**: los turnos se cancelan y conservan; no se eliminan en los flujos normales de la aplicación. La acción `Cascade` de `Appointment` → `NotificationLog` (D6) es una red de seguridad para bajas excepcionales (por ejemplo, retención administrativa), no un camino operativo. Cancelar un turno no borra sus notificaciones.
  - **No se agrega un unique** sobre `(appointmentId, kind, channel, attempt)`: varios ciclos de recordatorio (por ejemplo, 48 h y 24 h antes) pueden reiniciar la numeración de intentos, y un unique los bloquearía. La idempotencia de los envíos es responsabilidad del job (C-15), no de una constraint.
- **`AuditLog`**:
  - `id` es `BigInt @id @default(autoincrement())` → `bigserial`, según la KB. Esto implica que futuros endpoints no podrán serializarlo directo a JSON sin convertirlo; se resolverá en C-04, no acá.
  - `actorRef` es nulable: `SYSTEM` puede no tener un actor concreto.
  - `ip` es `String? @db.Inet` (tipo nativo `inet`).
  - `entity` y `entityId` son `text` obligatorios; `at` es `timestamptz` con default `now()`.
  - **Sin FK**: la referencia es polimórfica (`entity` + `entityId`) y la KB lo define así; una FK no es posible sin una tabla por entidad.
  - **Append-only no se implementa en C-02**: la tabla nace sin `UPDATE`/`DELETE` revocados y sin servicio de auditoría. C-02 no debe declarar compliance de auditoría completo. El handoff explícito a C-04 está en D11.

### D4. Índices: claves foráneas, consultas y auditoría

| Tabla | Índice | Motivo |
|---|---|---|
| `Appointment` | `(dentistId, startsAt)` | Agenda por odontólogo y rango; cubre la FK `dentistId`. |
| `Appointment` | `(patientId, startsAt)` | Historial del paciente; cubre la FK `patientId`. |
| `Appointment` | `(status)` | Filtro por estado (agenda y jobs). |
| `Appointment` | `(treatmentTypeId)` | FK sin índice (decisión 6). |
| `Appointment` | `(rescheduledFromId)` | FK sin índice (decisión 6). |
| `AvailabilityBlock` | `(dentistId, dayOfWeek)` | Cálculo de slots; cubre la FK `dentistId`. |
| `BlockedSlot` | `(dentistId, startsAt, endsAt)` | Cálculo de slots; cubre la FK `dentistId`. |
| `NotificationLog` | `(appointmentId, createdAt)` | Reconstruir intentos; cubre la FK `appointmentId`. |
| `TreatmentType` | `(active)` | Listado público de activos. |
| `AuditLog` | `(at)` | Consulta por fecha (decisión 7). |
| `AuditLog` | `(entity, entityId)` | Consulta por entidad afectada (decisión 7). |
| `Dentist` | `email` UNIQUE | Login y unicidad. |
| `Patient` | `phone` UNIQUE | Identificación por teléfono (`RN-PAC-01`). |
| `Appointment` | `confirmationToken` UNIQUE | Acceso por token (`RN-AUT-02`). |

- Postgres **no indexa las FKs automáticamente**; por eso se declaran explícitamente. Un índice compuesto cuyo primer campo es la FK alcanza para cubrirla y evita índices redundantes.
- **`TreatmentType.name` no es UNIQUE** (decisión 8): el catálogo admite nombres repetidos o cambiantes; la identidad es el `id`. Esto condiciona el seed (D7): no se puede hacer `upsert` por nombre.
- Los índices se crean desde PSL cuando son expresables (`@@index`) y desde el bloque manual solo si Prisma no los genera; se verifica el catálogo para no duplicarlos.

### D5. Tipos de columna, precisión y semántica temporal

- **PKs**: `String @id @default(uuid()) @db.Uuid` para las entidades de dominio; `BigInt @id @default(autoincrement())` para `AuditLog`. El uuid se genera en el cliente Prisma, así que las inserciones por SQL directo deben aportar el `id`; es aceptable y simplifica el seed y los tests.
- **Instantes**: `DateTime @db.Timestamptz(3)` (milisegundos). Todos los `createdAt` usan `@default(now())`; los `updatedAt` usan `@updatedAt`.
  - `@updatedAt` lo mantiene Prisma Client, **no** un trigger de base. Una actualización por SQL directo no lo refresca. Se acepta porque las escrituras de dominio pasan por Prisma; se documenta para no confundirlo con una garantía de base.
- **Fechas de vigencia**: `DateTime @db.Date` para `validFrom`/`validTo`.
- **Horarios recurrentes**: `DateTime @db.Time(0)` para `AvailabilityBlock.startTime`/`endTime`.
  - **Excepción documentada a C13**: C13 prohíbe `timestamp` sin zona porque un instante sin zona es ambiguo. `time` no es un instante: es una hora de pared recurrente ("los lunes de 09:00 a 13:00"), y por eso el tipo correcto es `time` sin zona. Se documenta explícitamente para que no se lea como violación.
  - El seed construye esos valores con una fecha base UTC (`Date.UTC(1970, 0, 1, h, m)`) porque Prisma representa `@db.Time` como `DateTime`; PostgreSQL ignora la fecha y conserva la hora.
- **Dinero**: `Decimal @db.Decimal(12, 2)` para `TreatmentType.price`.
- **`dayOfWeek` / `attempt`**: `Int @db.SmallInt`.
- **`ip`**: `String? @db.Inet`. El tipo nativo fue verificado con `prisma validate` sobre Prisma 7.10.1, igual que `@db.Time(0)`, `@db.Timestamptz(3)`, `@db.Date` y `@db.Decimal(12,2)`.
- **`confirmationToken`**: `String @unique` (texto). La generación de ≥128 bits es de C-08; C-02 solo declara la columna y la unicidad.
- **`passwordHash`**: texto; el hash Argon2id se genera en el seed (D7).

### D6. Acciones referenciales

| Relación | Acción | Motivo |
|---|---|---|
| `Dentist` → `AvailabilityBlock` | `Cascade` | Configuración dependiente del odontólogo. |
| `Dentist` → `BlockedSlot` | `Cascade` | Ídem. |
| `Dentist` → `Appointment` | `Restrict` | No se borra un odontólogo con turnos. |
| `Patient` → `Appointment` | `Restrict` | Protege el historial; la baja de ficha es un proceso manual (`PA-06`). |
| `TreatmentType` → `Appointment` | `Restrict` | Un tratamiento con turnos se desactiva, no se borra (`RN-CAT-02`). |
| `Appointment` → `NotificationLog` | `Cascade` | El log de intentos pertenece al turno. |
| `Appointment.rescheduledFromId` → `Appointment` | `Restrict` | Decisión 9: no se borra el turno original de una reprogramación. |
| `AuditLog` → cualquier entidad | Sin FK | Referencia polimórfica; debe sobrevivir a la entidad. |

- Se usa `Restrict` y no `NoAction` porque la intención es explícita y el error es inmediato.
- **Alternativa descartada** para `rescheduledFromId`: `SetNull`. Perdería la trazabilidad de la reprogramación, que es justamente el dato que se quiere conservar.
- Los turnos no se borran en la v1: se **cancelan y conservan** (o se cierran). Las acciones `Restrict` son una red de seguridad, no un flujo de negocio. La cascada `Appointment` → `NotificationLog` solo se ejerce en una baja excepcional, no en la cancelación: cancelar un turno no elimina sus notificaciones.

### D7. Seed idempotente con credencial pública de desarrollo

- **Ubicación y ejecución**: `prisma/seed.ts`, configurado en `prisma.config.ts` como `migrations.seed = 'tsx prisma/seed.ts'`, con script `db:seed`. Se agregan `tsx` (dev) y `@node-rs/argon2@2.2.2` (runtime), cuya `.d.ts` expone `salt?: Uint8Array` y `parseOptions()`.
- **Estructura testeable**: `prisma/seed.ts` exporta `seed(prisma: PrismaClient)` y solo crea un cliente y ejecuta `seed()` cuando se lo invoca como script. El guard es compatible con CJS y ESM: `tsx` ejecuta el seed como CommonJS (el `package.json` no declara `"type": "module"`), así que usa `__filename`; Vitest lo importa como ESM y cae en `import.meta.url`. La ejecución va en una función `runAsScript()` invocada sin top-level await, porque la salida CJS de `tsx` no lo soporta. Así los tests pueden llamar `seed()` varias veces con el cliente de la suite y verificar idempotencia sin lanzar un proceso. El test parte de las tablas del seed vacías y limpia al final, para que los conteos globales sean deterministas.
- **Odontólogo**: búsqueda por `email` (único). Email ficticio `odontologo@example.com` (dominio reservado por RFC 2606). La contraseña pública es `dev-only-password`; se hashea con Argon2id usando parámetros **explícitos**, sin depender de los defaults de la librería. Si el odontólogo no existe, se genera la sal y el hash y se crea. Si ya existe, **no se genera el hash ni se actualiza `passwordHash`**: se preserva la contraseña que el usuario haya cambiado y no se toca `updatedAt`.
- **Idempotencia del hash**: no se usa un `upsert` que incluya `passwordHash` en `update`, porque el hash cambia en cada generación por la sal aleatoria. La estrategia es *find-or-create*: el hash se calcula **solo en la rama de creación**. Un test captura el `passwordHash` después de la primera ejecución y verifica que la segunda lo deje **byte a byte idéntico** (y que `updatedAt` no cambie). El mismo test cambia el `passwordHash` a un valor centinela y ejecuta una tercera vez para verificar que el seed no lo pisa.
- **Concurrencia del seed**: *find-or-create* no es atómico; dos ejecuciones simultáneas pueden competir. La unique de `email` rechaza una creación duplicada del odontólogo, pero los chequeos por conteo de tratamientos y bloques no son atómicos y podrían duplicarlos. El seed es una herramienta de desarrollo y no está pensado para correr en paralelo; no se ejecuta en CI de forma concurrente.
- **Parámetros Argon2id** (constantes del seed, verificadas por test):

  | Parámetro | Valor | Nota |
  |---|---|---|
  | Algoritmo | `argon2id` (valor `2`) | `Algorithm.Argon2id` de `@node-rs/argon2`. |
  | Versión | `19` / `0x13` (valor `1`) | `Version.V0x13`. |
  | Memoria | `19456` KiB (19 MiB) | Base OWASP para Argon2id. |
  | Costo de tiempo | `2` | Iteraciones. |
  | Paralelismo | `1` | Un solo hilo. |
  | Longitud de salida | `32` bytes | Hash de 256 bits. |
  | Sal | `randomBytes(16)` | Generada explícitamente y pasada en `salt`; no se fija. |

  El seed genera una sal aleatoria de 16 bytes con `crypto.randomBytes(16)` y la pasa en `salt`; no depende del default de la librería. El hash se guarda como string PHC (`$argon2id$v=19$m=19456,t=2,p=1$...`). `Algorithm` y `Version` son `const enum` y `isolatedModules: true` impide importarlos como valores: el seed usa constantes locales (`ARGON2ID = 2 as Algorithm`, `VERSION_0X13 = 1 as Version`) con `import type` y un test verifica con `parseOptions()` que el hash resultante tenga esos valores. El seed no llama a `hash()` sin opciones. C-03 reutiliza `@node-rs/argon2` para verificar; no reimplementa el algoritmo.
- **Tratamientos**: si `TreatmentType.count() === 0`, se crean los 6 de la KB con sus duraciones; si no, se omite el bloque. **No se usa `upsert` por nombre** porque `name` no es único (decisión 8) y un `upsert` por nombre sería ambiguo. El seed no pisa un catálogo ya configurado.
- **Disponibilidad**: si el odontólogo no tiene bloques, se crean 10 filas (lunes a viernes, 09:00–13:00 y 15:00–19:00). Si ya tiene, se omite. Los horarios se construyen con `Date.UTC(1970, 0, 1, h, m)`.
- **Sin datos personales**: no crea pacientes, turnos ni notificaciones. No llama a WhatsApp ni email.
- **Sin secretos en logs**: imprime un resumen de conteos; nunca la contraseña ni el hash.
- **Alternativa descartada**: hash Argon2 precalculado como constante. Se descarta porque agrega un valor mágico y no evita la dependencia (C-03 la necesita igual). Calcularlo en el seed mantiene `dev-only-password` como única fuente de verdad y la sal cambia solo en la primera creación.
- **Alternativa descartada**: `ts-node`. Se prefiere `tsx` porque es el comando documentado por la skill de Prisma 7 y evita configuración extra de módulos.

### D8. Aislamiento de tests con `TEST_DATABASE_URL`

**Regla:** los tests de integridad nunca operan sobre la base apuntada por la `DATABASE_URL` original. La suite usa una base exclusiva (`TEST_DATABASE_URL`) y aborta antes de cualquier escritura si no puede demostrar que es distinta. Una vez verificado, el setup reemplaza `DATABASE_URL` por `TEST_DATABASE_URL` para que cualquier import accidental de la app también use la base de tests.

**Configuración:**

- `TEST_DATABASE_URL` es una variable **solo de tests**, no forma parte de `src/lib/env.ts` (igual que las variables de Compose). Se documenta en `.env.example` y en el README.
- `tests/setup.ts` es el `setupFiles` de Vitest (`vitest.config.mts`): se ejecuta antes de importar cada archivo de test. Allí vive el guard de aislamiento.
- `prisma.test.config.ts` reutiliza la estructura de `prisma.config.ts` y usa `TEST_DATABASE_URL` como datasource. `npm run db:test:migrate` ejecuta `prisma migrate deploy --config prisma.test.config.ts` (`--config` está soportado por `migrate deploy` en Prisma 7.10.1).
- El setup lee `process.env.TEST_DATABASE_URL` y `process.env.DATABASE_URL` en `tests/test-database.ts` y los valida con un schema Zod mínimo antes de usarlos. Es una excepción acotada a la regla B7 por orden de carga: si importara `src/lib/env.ts` primero, el módulo quedaría cacheado con la `DATABASE_URL` de desarrollo y el override posterior no tendría efecto. La lectura no queda sin validar; el borde de tests usa Zod. La excepción se documenta en el propio archivo, como C-01 hizo con `NODE_ENV` y las variables de Compose.
- **Orden de carga**: `tests/setup.ts` solo importa `dotenv/config`, Zod, `PrismaClient`/`PrismaPg` y `tests/test-database.ts`. **No importa** `src/lib/env.ts`, `src/lib/prisma.ts` ni ningún módulo de aplicación antes del override. El guard corre en el top level del setup (top-level await), y Vitest ejecuta los `setupFiles` antes de importar el archivo de test; por eso, cuando el test importa el singleton, `DATABASE_URL` ya apunta a la base de tests. Un test de orden de carga lo verifica con un import estático de `src/lib/prisma.ts`.
- **Un solo setup**: `tests/setup.ts` es el único `setupFiles` de Vitest. Si en el futuro se agrega otro, debe ejecutarse después del guard y no puede importar módulos de aplicación antes del override.
- **Errores sin secretos**: los mensajes del guard nombran la variable y el motivo, pero no imprimen las URLs completas (pueden contener credenciales).
- La suite corre con `fileParallelism: false` en `vitest.config.mts`: los archivos comparten la misma base de tests y el test de idempotencia del seed cuenta filas globales. La serialización evita carreras; los tests siguen usando valores únicos y limpieza.

**Guard (antes de cualquier test):**

1. Si falta `TEST_DATABASE_URL` → lanzar error y abortar la suite.
2. Si `DATABASE_URL` también falta → no hay base de desarrollo que proteger; se usa `TEST_DATABASE_URL` como `DATABASE_URL` y se continúa.
3. Si las URLs son iguales (normalizadas) → abortar.
4. Si son distintas, abrir dos clientes Prisma (sin importar `src/lib/prisma.ts`) y comparar la identidad real de cada base con `SELECT current_database(), inet_server_addr(), inet_server_port()`.
   - Si `current_database()` y el servidor/puerto coinciden → es la misma base física (por ejemplo, `prisma dev` ignora el pathname) → abortar.
   - Si alguna conexión falla → abortar: no se puede garantizar la separación.
5. Verificar que la base de tests está migrada (`_prisma_migrations` existe y tiene al menos una migración aplicada). Si no → abortar con el mensaje `ejecutá npm run db:test:migrate`. La comprobación de migraciones pendientes la hace `db:test:migrate` en CI, no el guard.
6. Recién entonces, asignar `process.env.DATABASE_URL = TEST_DATABASE_URL`. A partir de acá, cualquier import de `src/lib/env.ts` o `src/lib/prisma.ts` apunta a la base de tests. Esto convierte el aislamiento en una garantía, no en una convención: incluso un test que importe el singleton por error escribe en la base de tests.

**Lógica testeable:** el guard se extrae a `tests/test-database.ts` como una función pura que recibe `{ databaseUrl, testDatabaseUrl, probe }` y devuelve la URL efectiva o lanza. La decisión (faltante, igual, misma identidad, distinta) se prueba sin base; el `probe` real se prueba en integración. Así el guard no es código no testeado.

**Local:**

- **Docker**: `npm run db:up` crea la base de desarrollo. La base de tests se crea una vez con `docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" turnos_test'` (el shell del contenedor expande el usuario de `.env`; en el ejemplo, `turnos`) o con un script de init para volúmenes nuevos. Luego `npm run db:test:migrate`.
- **`prisma dev`**: la CLI ignora el pathname de la URL, así que dos URLs con distinto nombre pueden apuntar a la misma base. El guard lo detecta y aborta. Para tests de integración se levanta una **segunda instancia** con nombre y puerto propios:
  - `npx prisma dev --name turnos-dev --db-port 51214 --port 5555 --detach`
  - `npx prisma dev --name turnos-test --db-port 51215 --port 5556 --detach`
  (elegí puertos libres; los valores son ilustrativos) y se apuntan `DATABASE_URL` y `TEST_DATABASE_URL` a `localhost:51214` y `localhost:51215`, respectivamente. El guard compara `current_database()` y `inet_server_port()`; si la instancia no expone el puerto y no puede demostrar la separación, aborta. En ese caso se usa Docker o el CI; no se acepta correr los tests contra la base de desarrollo.
- El README documenta ambos caminos y el error esperado si la separación no se puede garantizar.

**CI:**

- El servicio sigue siendo `postgres:15` con la base `turnos`.
- Un paso crea `turnos_test` (`PGPASSWORD=... psql -h localhost -U turnos -d turnos -c 'CREATE DATABASE turnos_test;'`).
- Variables: `DATABASE_URL=.../turnos` y `TEST_DATABASE_URL=.../turnos_test`.
- Pasos: `npx prisma migrate deploy` (smoke de la migración sobre la base de la aplicación) → `npm run db:test:migrate` (base de tests) → `npm test`.
- `tests/setup.ts` sobrescribe `DATABASE_URL` con la base de tests para el proceso de test; la base de la aplicación no se toca durante la suite.

**Casos cubiertos** (trazables a los specs):

- solapamiento mismo odontólogo → rechazo; SQL directo → rechazo;
- contiguos `[)` → aceptación; un minuto de solapamiento → rechazo;
- `CANCELLED`, `RELEASED`, `COMPLETED`, `NO_SHOW` → liberan;
- dos odontólogos → aceptación;
- `CHECK` de duración, hora de disponibilidad y rango de turno;
- `UNIQUE` de email, teléfono y token;
- `Restrict` de tratamiento/paciente/odontólogo con turnos y del turno original de reprogramación;
- `Cascade` de disponibilidad/bloqueos y de notificaciones (baja excepcional);
- presencia de índices en el catálogo;
- `seed()` dos veces → conteos estables y `passwordHash` idéntico;
- orden de carga: un test que importa `src/lib/prisma.ts` estáticamente reporta la base de tests;
- guard: sin `TEST_DATABASE_URL`, con la misma URL o con la misma base física → la suite aborta antes de escribir.

**Aserción del constraint:** se intenta la escritura superpuesta y se acepta como evidencia el SQLSTATE `23P01` o el nombre `no_overlap` en el mensaje de error. Prisma puede envolver el error; no se hardcodea un `PrismaClientKnownRequestError` code sin verificarlo. Si hiciera falta el código crudo, se usa `$executeRawUnsafe` o `$queryRaw` para provocar la violación.

**Seed en CI:** no corre; los tests no dependen de él. La base de tests se migra y se limpia con fixtures.

### D9. Normalización de email y teléfono en la aplicación

- Decisión 10: la aplicación normaliza antes de escribir (email `trim` + minúsculas; teléfono E.164) y la base almacena el valor normalizado. Las constraints `UNIQUE` comparan ese valor.
- **No se implementa un trigger** de normalización: E.164 depende de una librería y de la región, y duplicar la lógica en SQL es más frágil que centralizarla en la aplicación (C-08).
- **Riesgo aceptado**: una escritura por SQL directo o un seed futuro pueden saltarse la normalización. Se mitiga con la convención documentada y con tests que usan valores ya normalizados; no se promete una garantía de base que no existe.
- C-02 solo declara la columna y la unicidad; el normalizador es de C-08. No se inventa un formato de teléfono en el seed porque el seed no crea pacientes.

### D10. CI, runbook local y documentación

- **CI**: crear `turnos_test`, ejecutar `npx prisma migrate deploy` (base de la aplicación) y `npm run db:test:migrate` (base de tests) después de `prisma generate` y antes de `npm test`, según D8. El servicio `postgres:15` ya existe; el usuario es superusuario, así que `CREATE EXTENSION btree_gist` funciona.
- **Local con Docker**: `npm run db:up` → `npx prisma migrate dev` → crear `turnos_test` y migrarla con `npm run db:test:migrate` (D8) → `npx prisma db seed` → `npm test`.
- **Local sin Docker**: `npx prisma dev --name turnos-odontologia --detach` (PostgreSQL 17.5/WASM, alternativa ya documentada por C-01), apuntar `DATABASE_URL` a esa instancia y repetir la secuencia. `prisma dev` no garantiza una base de tests separada; para integración se usa Docker o una segunda instancia (D8). No es evidencia sobre PG15; el CI sí.
- **README**: documentar migración, seed, credencial `dev-only-password`, parámetros Argon2id, `TEST_DATABASE_URL` (local y CI), retención de turnos y la excepción C9. No se versiona ningún secreto real.

### D11. Handoff a C-04: append-only de `AuditLog`

C-02 crea `AuditLog` con enums e índices, pero **no** implementa ni prueba la vigencia append-only. Queda como deuda explícita para C-04, que deberá:

- impedir `UPDATE` y `DELETE` sobre `AuditLog` a nivel de base (revocar privilegios al rol de la aplicación, trigger que rechace la operación, o ambos);
- garantizar que el servicio de auditoría solo haga `INSERT`;
- probar que un `UPDATE` y un `DELETE` fallan, y que la fila original permanece;
- documentar el mecanismo y sus límites (por ejemplo, un usuario superusuario puede saltarlo).

C-02 no debe presentarse como compliance de auditoría completo. Este handoff se refleja en `CHANGES.md` al proponer C-04.

## Risks / Trade-offs

- **[`btree_gist` requiere privilegios]** → En CI y en la imagen oficial `postgres:15` el usuario es superusuario. En un Postgres gestionado podría requerir intervención del proveedor; si no se permite, se resuelve en C-16. C-02 no asume que cualquier host lo permita.
- **[El SQL agregado a mano puede generar drift]** → Se agrega solo antes de aplicar; `migrate status` y un `migrate deploy` desde base vacía lo verifican. Prisma no modela `CHECK` ni exclusiones; si una versión futura las marca como drift, se corrige con una migración nueva, nunca borrando el constraint.
- **[La migración local corre sobre PG17.5, no PG15]** → No se afirma compatibilidad total: la primera evidencia real sobre PG15 es el CI. La sintaxis usada (`btree_gist`, `EXCLUDE`, `tstzrange`) es estable en 15, pero se verifica en el pipeline.
- **[`migrate dev` necesita shadow database]** → Con Docker, el usuario debe poder crear bases; con `prisma dev`, la CLI la maneja. Si falla, se configura `shadowDatabaseUrl` o se usa `migrate deploy` para la verificación.
- **[Argon2 nativo en Windows]** → Se usa `@node-rs/argon2`, con binarios precompilados, en lugar de `argon2` (node-gyp). Si fallara, el fallback es generar el hash una vez con una herramienta externa y documentarlo; no se cambia a un hash débil.
- **[`tsx` ejecuta el seed como CommonJS]** → `package.json` no declara `"type": "module"`, así que `tsx` transforma `prisma/seed.ts` a CJS y no admite top-level await. El seed usa `runAsScript()` invocado desde el guard y detecta CJS con `__filename`; Vitest, que lo importa como ESM, cae en `import.meta.url`. No se cambia el tipo de módulo del proyecto.
- **[Idempotencia del seed basada en conteos]** → Si el odontólogo borra todo el catálogo, el seed lo vuelve a crear en la próxima ejecución. Es aceptable en desarrollo y no pisa datos existentes; se documenta.
- **[Aislamiento de tests en una base compartida]** → Se elimina la recomendación y se vuelve una garantía: `TEST_DATABASE_URL` exclusiva, guard de identidad real y override de `DATABASE_URL` antes de importar la app. Si el guard no puede demostrar la separación, la suite aborta. El costo es que `npm test` local exige una segunda base migrada.
- **[`prisma dev` ignora el pathname]** → `TEST_DATABASE_URL` y `DATABASE_URL` pueden resolver a la misma base física. El guard compara `current_database()`/servidor y aborta; para integración se usa Docker o una segunda instancia.
- **[`prisma dev` no expone el puerto]** → Si `inet_server_port()` es null, el guard no puede demostrar que dos instancias de `prisma dev` son distintas y aborta. La suite local sin Docker requiere un probe que exponga el puerto; si no, se usa CI/Docker. No se relaja el guard.
- **[Seed find-or-create no atómico]** → Dos ejecuciones concurrentes pueden competir. La unique de `email` rechaza una creación duplicada del odontólogo, pero los chequeos por conteo de tratamientos y bloques podrían duplicarlos. El seed es una herramienta de desarrollo, no un job concurrente; no se corre en paralelo.
- **[Parámetros Argon2id explícitos]** → Se fijan en constantes y se verifica el PHC; si OWASP cambia la recomendación, se actualiza el seed y se regenera el hash de desarrollo. No hay hashes productivos en C-02.
- **[`const enum` y `isolatedModules`]** → `@node-rs/argon2` declara `Algorithm` y `Version` como `const enum`, que TypeScript no permite usar como valores con `isolatedModules`. El seed usa constantes locales (`2 as Algorithm` y `1 as Version`) con `import type` y verifica con `parseOptions()`; no se cambia `tsconfig`.
- **[Tipos nativos y Prisma]** → `@db.Inet`, `@db.Time(0)`, `@db.Timestamptz(3)`, `@db.Date` y `@db.Decimal(12,2)` fueron verificados con `prisma validate` en 7.10.1. El riesgo residual es la representación de `time` en el cliente, que se cubre con un test de round-trip del seed.
- **[`@db.Time` y la representación `DateTime` de Prisma]** → El seed usa una fecha base UTC y se verifica el round-trip; PostgreSQL ignora la fecha. Si Prisma cambiara la representación, se ajusta el seed, no el esquema.
- **[`updatedAt` no es un trigger]** → Las escrituras por Prisma lo actualizan; las escrituras raw no. Se documenta y se usan escrituras Prisma en el dominio.
- **[`AuditLog.id` BigInt]** → Futuros endpoints deben convertir a string; se resuelve en C-04. No afecta C-02.
- **[Append-only no implementado]** → C-02 no debe presentarse como compliance de auditoría completo; la garantía llega en C-04.
- **[Sin migración `down`]** → Prisma no genera rollback automático. En desarrollo, revertir el commit y recrear la base (con consentimiento); no hay datos de producción.

## Migration Plan

1. Declarar los 8 modelos y los 6 enums en `prisma/schema.prisma`; `prisma validate` y `prisma format`.
2. `prisma migrate dev --name core_models --create-only` y revisar el DDL generado.
3. Agregar el bloque manual (extensión, `no_overlap`, `CHECK`) con el comentario de excepción C9.
4. Aplicar la migración (`migrate dev`), `prisma generate` y verificar `migrate status` sin drift.
5. Configurar `prisma.test.config.ts` y `tests/setup.ts`; crear `turnos_test` y migrarla con `npm run db:test:migrate`.
6. Configurar `migrations.seed`, implementar `prisma/seed.ts` y ejecutarlo dos veces.
7. Implementar los tests de integración (incluido el guard de aislamiento) y correr la suite contra la base de tests.
8. Actualizar el CI (crear `turnos_test`, `migrate deploy`, `db:test:migrate`) y el README.
9. Verificar la cadena completa: `lint`, `typecheck`, `test`, `build`, y un `migrate deploy` + seed desde una base vacía.

**Rollback:** en desarrollo, revertir el commit y recrear la base; no hay datos de producción ni migración `down`. Cualquier comando destructivo requiere consentimiento explícito del usuario en el momento (regla C10).

## Open Questions

- ¿Se agrega `AuditAction.LOGIN` en C-03? C-02 no lo necesita; se decide cuando exista login.
- ¿`NotificationLog.status` debe nacer en `QUEUED` o exigir un valor explícito? Se elige `QUEUED`; se revisa en C-13 cuando exista el envío real.
- ¿C-04 implementará append-only con revocación de privilegios, trigger o ambos? C-02 solo deja el requisito y el test pendiente (D11).
