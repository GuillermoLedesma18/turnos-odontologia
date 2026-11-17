# Trazabilidad de C-02

Tabla escenario → test/comprobación para las tres capabilities del change. Los
nombres de archivo son relativos a la raíz del repositorio.

## `data-model`

| # | Escenario | Test / comprobación | Evidencia |
| --- | --- | --- | --- |
| DM-01 | Las ocho entidades existen en el esquema | `tests/integration/migration.test.ts` → «crea las ocho tablas de dominio y la extensión btree_gist» | El catálogo de `turnos_deploy_test` devuelve las ocho tablas, `_prisma_migrations` y `btree_gist`. |
| DM-02 | Las relaciones respetan la cardinalidad del modelo | `tests/integration/data-model.test.ts` → «un turno referencia una fila de cada entidad, admite varias notificaciones y una reprogramación» | Dos turnos del mismo odontólogo/paciente/tratamiento, dos notificaciones y `rescheduledFromId`. |
| DM-03 | Un valor de enum inválido es rechazado | `tests/integration/data-model.test.ts` → «rechaza valores de enum inválidos en turnos y auditoría» | `UPDATE` con `'INVALID_STATUS'` falla con `22P02`; el turno conserva `CONFIRMED`. |
| DM-04 | Los enums se consultan y filtran por valor | `tests/integration/data-model.test.ts` → «filtra turnos por estado y notificaciones por canal con valores tipados» | `findMany` con `AppointmentStatus.CONFIRMED` y `NotificationChannel.WHATSAPP`. |
| DM-05 | Una acción de auditoría inválida es rechazada | `tests/integration/data-model.test.ts` → «rechaza valores de enum inválidos en turnos y auditoría» | `INSERT` con `'INVALID_ACTION'::"AuditAction"` falla; la fila válida previa permanece. |
| DM-06 | Duración de tratamiento inválida | `tests/integration/data-model.test.ts` → «rechaza duración de tratamiento <= 0 y conserva el valor original» | `treatment_duration_check` en creación y actualización; el valor original sigue en 30. |
| DM-07 | Franja horaria inválida | `tests/integration/data-model.test.ts` → «rechaza horarios de disponibilidad y bloqueos con inicio >= fin» | `availability_time_check` y `blocked_slot_time_check`; no quedan filas. |
| DM-08 | Turno con rango temporal inválido | `tests/integration/data-model.test.ts` → «rechaza turnos con startsAt >= endsAt» | `appointment_time_range_check`; no queda turno. |
| DM-09 | Unicidad de email, teléfono y token | `tests/integration/data-model.test.ts` → «rechaza email de odontólogo, teléfono de paciente y token repetidos» | `23505` en `Dentist_email_key`, `Patient_phone_key` y `Appointment_confirmationToken_key`; originales intactos. |
| DM-10 | No se elimina un tratamiento con turnos | `tests/integration/data-model.test.ts` → «Restrict impide borrar tratamiento, paciente u odontólogo con turnos» | Tres `DELETE` fallan con FK; tratamiento, paciente, odontólogo y turno siguen existiendo. |
| DM-11 | El turno original de una reprogramación está protegido | `tests/integration/data-model.test.ts` → «Restrict protege el turno original de una reprogramación» | El `DELETE` del original falla; original y reprogramado permanecen. |
| DM-12 | Los hijos de un odontólogo o de un turno se eliminan en cascada | `tests/integration/data-model.test.ts` → «Cascade elimina disponibilidad y bloqueos junto con el odontólogo» y «Cascade elimina notificaciones en una baja excepcional del turno» | Conteos de hijos en 0; no quedan huérfanos. |
| DM-13 | Cancelar un turno conserva el turno y sus notificaciones | `tests/integration/data-model.test.ts` → «cancelar un turno conserva el turno y sus notificaciones» | Estado `CANCELLED` y `NotificationLog` siguen existiendo. |
| DM-14 | La auditoría no depende de una clave foránea | `tests/integration/data-model.test.ts` → «AuditLog sobrevive al borrado de la entidad referenciada» | La fila de auditoría conserva `entity` y `entityId` tras borrar el odontólogo. |
| DM-15 | Las claves foráneas tienen índice | `tests/integration/data-model.test.ts` → «el catálogo contiene todos los índices esperados y cada FK tiene índice» | Consulta a `pg_constraint`/`pg_index`; las 7 FKs tienen índice con prefijo. |
| DM-16 | Un índice compuesto cubre la clave foránea | Misma comprobación de DM-15 | `pg_index.indkey[0]` se compara con `pg_constraint.conkey[1]`; los compuestos cuentan. |
| DM-17 | Las consultas de agenda y auditoría usan índices | `tests/integration/data-model.test.ts` → «los planes de agenda y auditoría pueden apoyarse en los índices declarados» | `EXPLAIN` con `enable_seqscan=off` usa `Appointment_dentistId_startsAt_idx` y `AuditLog_entity_entityId_idx`. |
| DM-18 | Base vacía migrada con `migrate deploy` | `npx prisma migrate deploy` sobre `turnos_deploy_test` | «All migrations have been successfully applied»; catálogo con 8 tablas, 5 constraints y `btree_gist`. |
| DM-19 | No hay drift después de migrar | `npx prisma migrate status` sobre `turnos` y `turnos_test` | Ambas bases: «Database schema is up to date!». |
| DM-20 | La migración es idempotente a nivel de despliegue | Segundo `npx prisma migrate deploy` sobre `turnos_deploy_test` | «No pending migrations to apply.» y `migrate status` sin pendientes. |
| DM-21 | Los instantes conservan zona horaria | `tests/integration/data-model.test.ts` → «usa timestamptz, date, time, numeric(12,2) e inet y hace round-trip» | `startsAt` conserva el mismo `toISOString()` UTC; columna `timestamp with time zone` con precisión 3. |
| DM-22 | Los horarios de disponibilidad son hora de pared | Mismo test de round-trip | `timeAt(9, 0)` vuelve como `1970-01-01T09:00:00.000Z`; columna `time without time zone`. |
| DM-23 | El dinero y la IP usan tipos nativos | Mismo test de round-trip | `price` `numeric(12,2)` conserva `1234.56`; `AuditLog.ip` es `inet` y conserva `203.0.113.10`. |

## `appointment-integrity`

| # | Escenario | Test / comprobación | Evidencia |
| --- | --- | --- | --- |
| AI-01 | Dos turnos vivos se superponen | `tests/integration/appointment-integrity.test.ts` → «rechaza un solapamiento por Prisma y por SQL directo, y conserva el original» | Error con `no_overlap`/`23P01`; el turno original sigue `PENDING_CONFIRMATION`. |
| AI-02 | La escritura directa también es rechazada | Mismo test | `$executeRawUnsafe` con `INSERT` superpuesto falla con la exclusión. |
| AI-03 | Dos turnos del mismo odontólogo no se superponen | `tests/integration/appointment-integrity.test.ts` → «acepta turnos contiguos [startsAt, endsAt) y rechaza un minuto de solapamiento» | 09:00–09:30 y 09:30–10:00 se aceptan; el conteo queda en 2. |
| AI-04 | Un turno cancelado no bloquea la franja | `tests/integration/appointment-integrity.test.ts` → «los estados CANCELLED, RELEASED, COMPLETED y NO_SHOW liberan la franja» | Se crea un reemplazo en la misma franja; el turno cerrado conserva `CANCELLED`. |
| AI-05 | Un turno liberado no bloquea la franja | Mismo test | El estado cerrado conserva `RELEASED` y el reemplazo se acepta. |
| AI-06 | Un turno completado o ausente no bloquea una franja futura | Mismo test | `COMPLETED` y `NO_SHOW` se cubren; el turno cerrado no se modifica. |
| AI-07 | Turnos consecutivos sin solapamiento | `tests/integration/appointment-integrity.test.ts` → «acepta turnos contiguos [startsAt, endsAt)…» | Se aceptan ambos turnos y el límite compartido no se cuenta dos veces. |
| AI-08 | Un turno que empieza un minuto antes sí se superpone | Mismo test | 09:29–09:59 sobre 09:30–10:00 falla con la exclusión; el conteo no cambia. |
| AI-09 | Dos odontólogos atienden a la misma hora | `tests/integration/appointment-integrity.test.ts` → «dos odontólogos pueden tener turnos en la misma franja» | Dos filas aceptadas, cada una con su `dentistId`. |
| AI-10 | El constraint existe después de migrar | `tests/integration/appointment-integrity.test.ts` → «el constraint no_overlap existe con el predicado de estados vivos» | `pg_get_constraintdef` devuelve `EXCLUDE USING gist`, solo `PENDING_CONFIRMATION` y `CONFIRMED`, sin `CANCELLED`. |
| AI-11 | La violación identifica el constraint | Test de AI-01 y su helper | El mensaje coincide con `no_overlap`/`23P01` y no con `23505`/`23503`. |

## `seed-data`

| # | Escenario | Test / comprobación | Evidencia |
| --- | --- | --- | --- |
| SD-01 | Primera ejecución crea los datos base | `tests/integration/seed.test.ts` → «crea los datos base, usa Argon2id y no filtra la credencial» | `seed()` devuelve 1 odontólogo, 6 tratamientos y 10 bloques; `npm run db:seed` termina sin errores. |
| SD-02 | Segunda ejecución no duplica | `tests/integration/seed.test.ts` → «es idempotente: no duplica…» | Segunda ejecución: `dentistCreated=false`, `treatmentsCreated=0`, `availabilityBlocksCreated=0`; conteos iguales. |
| SD-03 | La segunda ejecución conserva el hash de la credencial | Mismo test de idempotencia | `passwordHash` byte a byte idéntico y `updatedAt` sin cambios; el centinela persiste tras la tercera. |
| SD-04 | El seed no destruye datos existentes | `tests/integration/seed.test.ts` → «no destruye pacientes ni turnos existentes» | Paciente y turno previos siguen existiendo tras una segunda ejecución. |
| SD-05 | El odontólogo existe con hash, no con texto plano | Test de SD-01 | El campo contiene `$argon2id$…` y no contiene `dev-only-password`. |
| SD-06 | El seed no filtra la credencial en los logs | Test de SD-01 | La salida capturada no contiene la contraseña ni el hash; solo el resumen de conteos. |
| SD-07 | El hash declara los parámetros acordados | Test de SD-01 | `parseOptions` devuelve `algorithm=2`, `version=1`, `memoryCost=19456`, `timeCost=2`, `parallelism=1`, `outputLen=32`, `saltLen=16`. |
| SD-08 | El seed no usa defaults implícitos | Revisión de `prisma/seed.ts` (`ARGON2_OPTIONS` explícito) + test de SD-07 | Algoritmo, versión, memoria, tiempo, paralelismo, salida y sal se pasan explícitamente. |
| SD-09 | El catálogo base queda disponible | Test de SD-01 | Los seis nombres, duraciones y `active=true` coinciden con la spec. |
| SD-10 | Un catálogo ya configurado no se pisa | `tests/integration/seed.test.ts` → «no pisa un catálogo ni una disponibilidad ya modificados» | La duración modificada (99) se conserva, el conteo sigue en 6 y no hay duplicados. |
| SD-11 | La semana laboral queda configurada | Test de SD-01 | Diez bloques, dos por día de lunes a viernes, con 09:00–13:00 y 15:00–19:00, `active=true`. |
| SD-12 | La disponibilidad ya configurada no duplica | Test de SD-10 | El horario modificado (08:00) se conserva y el conteo sigue en 10. |
| SD-13 | El seed no crea pacientes ni turnos | Test de SD-01 | `Patient` y `Appointment` quedan en 0; tampoco crea `NotificationLog`. |
| SD-14 | El seed funciona sin servicios externos | `tests/integration/seed.test.ts` → «funciona sin variables de mensajería y no llama a servicios externos» | Se ejecuta con las variables de WhatsApp/email ausentes y no falla. |

## Comprobaciones de cierre

- **Cadena completa:** `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build` y `npm run format:check` terminan con código 0.
- **Base de tests:** `tests/test-database.test.ts` cubre los negativos del guard
  (sin variable, misma URL, misma base física) y el positivo; el test de orden
  de carga importa `src/lib/prisma.ts` estáticamente y comprueba que el
  singleton reporta `turnos_test`.
- **Aislamiento E2E:** la suite pasa con `TEST_DATABASE_URL` correcta; con
  `TEST_DATABASE_URL` igual a `DATABASE_URL` aborta antes de escribir y los
  conteos de la base de desarrollo no cambian.
- **Smoke manual:** sobre `turnos` (migrada y sembrada) se consultaron el
  catálogo y la disponibilidad; el segundo turno superpuesto fue rechazado por
  `no_overlap` dentro de una transacción revertida.
