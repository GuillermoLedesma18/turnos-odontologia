# Proposal

## Why

C-01 dejó un monolito que compila, arranca y pasa su CI, pero **sin ninguna entidad de dominio**: `prisma/schema.prisma` solo declara el generador y el datasource, y no existe la Migración 001. Sin un modelo persistente no puede implementarse ninguna funcionalidad del producto: ni catálogo, ni disponibilidad, ni reserva, ni agenda.

C-02 es el primer change de la Fase 1 de `CHANGES.md` y la dependencia directa de `C-03..C-16`. Su valor no es solo "crear tablas": es fijar en PostgreSQL la garantía que el producto no puede delegar al código —**un odontólogo no puede tener dos turnos superpuestos** (`RN-AGE-01`, regla dura C11)— y resolver de una vez las ambigüedades de forma del modelo (auditoría, notificaciones, índices y acciones referenciales) antes de que otros changes las hereden por accidente.

## What Changes

- **Modelo Prisma completo** con las 8 entidades de `04_modelo_de_datos.md`: `Dentist`, `AvailabilityBlock`, `BlockedSlot`, `TreatmentType`, `Patient`, `Appointment`, `NotificationLog` y `AuditLog`; más 6 enums: `AppointmentStatus`, `NotificationChannel`, `NotificationKind`, `NotificationStatus`, `AuditActorType` y `AuditAction`. La tabla `AuditLog` se crea con enums e índices, pero su vigencia **append-only** (impedir `UPDATE`/`DELETE`) se implementa y prueba en **C-04**.
- **Migración 001** generada por Prisma y completada a mano con el SQL que Prisma no expresa: `CREATE EXTENSION btree_gist`, constraint `no_overlap` (`EXCLUDE USING gist` sobre `tstzrange`, activo solo en estados vivos) y los `CHECK` de duración, franjas horarias y rango temporal. La edición del archivo generado es una **excepción explícita y documentada a la regla dura C9** (ver `design.md` D1).
- **Índices**: los de la KB más los que faltaban para las claves foráneas (`Appointment.treatmentTypeId`, `Appointment.rescheduledFromId`) y los de auditoría por fecha (`at`) y por entidad (`entity`, `entityId`), según las decisiones aprobadas.
- **Acciones referenciales explícitas**: `rescheduledFromId` con `Restrict`; el resto definido por dominio para proteger el historial de turnos. Los turnos se **cancelan y conservan**: la eliminación física no es un flujo normal de la aplicación y la cascada hacia `NotificationLog` es una red de seguridad para bajas excepcionales.
- **Seed idempotente** (`prisma/seed.ts`): 1 `Dentist` con hash Argon2id de la contraseña pública de desarrollo `dev-only-password`, generado con parámetros explícitos (memoria 19456 KiB, costo de tiempo 2, paralelismo 1, salida 32 bytes), los 6 tratamientos base y los 10 bloques de disponibilidad lun–vie 09–13 / 15–19. El hash se genera **solo al crear** el odontólogo: las ejecuciones posteriores no lo regeneran ni actualizan `passwordHash`.
- **Tests de integración contra PostgreSQL real** (sin mocks) sobre una base **exclusiva de tests** (`TEST_DATABASE_URL`): rechazo de solapamiento, aceptación de franjas contiguas, liberación por estados no vivos, independencia entre odontólogos, `CHECK`, `UNIQUE`, `FK Restrict`, presencia de índices e idempotencia del seed. La suite **aborta antes de escribir** si falta `TEST_DATABASE_URL` o si no puede garantizar que sea una base distinta de `DATABASE_URL`.
- **Aislamiento de tests**: `tests/setup.ts` compara las bases reales (no solo las URLs), redirige `DATABASE_URL` a la base de tests antes de importar código de aplicación y `prisma.test.config.ts` migra esa base. La configuración local y de CI queda documentada.
- **CI**: crea `turnos_test`, aplica `prisma migrate deploy` a la base de la aplicación y `db:test:migrate` a la base de tests antes de la suite, para que los tests corran sobre el esquema versionado sin tocar la base de desarrollo.
- Sin cambios **BREAKING**: no existe comportamiento de dominio previo que romper.

## Capabilities

### New Capabilities

- `data-model`: el contrato de persistencia del dominio — entidades, enums, tipos de columna, relaciones, acciones referenciales, `CHECK`, `UNIQUE`, índices y migración reproducible. Es la base que consumen todos los changes de dominio.
- `appointment-integrity`: la garantía de no-superposición de turnos por odontólogo, impuesta por un exclusion constraint de PostgreSQL sobre los estados vivos, con independencia de lo que haga la aplicación.
- `seed-data`: la provisión idempotente de los datos mínimos para operar y demostrar el sistema (odontólogo de desarrollo, catálogo base y disponibilidad inicial), sin secretos reales.

### Modified Capabilities

- Ninguna. `openspec/specs/` contiene solo `platform-health` y `environment-config`; C-02 no cambia sus requisitos.

## Impact

- **Código y datos nuevos**: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_core_models/migration.sql`, `prisma/seed.ts`, `prisma.config.ts` (configuración de `migrations.seed`), `prisma.test.config.ts` (migración de la base de tests), `tests/setup.ts` (guard de aislamiento), `.env.example` (`TEST_DATABASE_URL`), `package.json` (scripts `db:seed` y `db:test:migrate`, dependencias de seed), `.github/workflows/ci.yml` (base de tests, `migrate deploy` y `db:test:migrate`), `README.md` (migración, seed, credencial, base de tests y retención de turnos) y los tests de integración de esquema y seed.
- **Superficie expuesta**: ninguna nueva. C-02 no agrega endpoints, páginas, autenticación ni jobs; solo esquema, migración, seed y tests.
- **Dependencias nuevas**: `tsx` (ejecutar el seed en TypeScript) y `@node-rs/argon2@2.2.2` (hash de la credencial de desarrollo, pineado para que `salt` y `parseOptions` estén disponibles). C-03 reutiliza Argon2 para verificar el login.
- **Desviaciones de la KB, explícitas y acotadas**: `AuditLog.action` pasa de `text` a un enum tipado; `AuditLog.ip` se modela con el tipo nativo `inet` de PostgreSQL. La vigencia **append-only** de `AuditLog` queda fuera de C-02: **C-04 deberá implementar y probar** las restricciones que impidan `UPDATE` y `DELETE` sobre la tabla de auditoría. Se documenta en `design.md` D3 y D11.
- **Fuera de alcance**: autenticación (`C-03`), endpoints y UI (`C-05..C-12`), motor de slots (`C-07`), mensajería (`C-13..C-15`), endurecimiento de compliance (`C-16`), la vigencia append-only de `AuditLog` (`C-04`) y cualquier migración de datos existentes (la planilla no se importa, `DD-10`).
- **Impacto en el roadmap**: al completarse y archivarse, cierra `GATE 1` y habilita `C-03 auth-odontologo`.
