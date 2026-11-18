# data-model Specification

## Purpose
Define el contrato de persistencia del dominio: las entidades, enums, relaciones, tipos de columna, restricciones e índices sobre los que se apoyan la reserva, la agenda y la auditoría del sistema.

## Requirements

### Requirement: Entidades de dominio persistidas

El sistema SHALL persistir las entidades de dominio del proyecto, incluida `DentistSession`, con las relaciones, campos obligatorios y nulabilidad del modelo de datos. Ninguna entidad persistida SHALL quedar sin tabla ni clave primaria, y `DentistSession` SHALL almacenar únicamente el hash del token de sesión, sin datos clínicos ni de paciente.

#### Scenario: Las ocho entidades existen en el esquema

- **WHEN** se inspecciona el esquema de la base después de aplicar todas las migraciones
- **THEN** existen las ocho tablas de dominio con sus claves primarias y columnas declaradas
- **AND** no existe una tabla de dominio adicional fuera del modelo aprobado

#### Scenario: La tabla de sesiones de autenticación existe

- **WHEN** se inspecciona el esquema de la base después de aplicar todas las migraciones
- **THEN** existe la tabla `DentistSession` con sus claves primarias y columnas declaradas
- **AND** es la única tabla de infraestructura de autenticación agregada por C-03

#### Scenario: Las relaciones respetan la cardinalidad del modelo

- **WHEN** se crea un turno con odontólogo, paciente y tratamiento
- **THEN** el turno referencia exactamente una fila de cada entidad
- **AND** un odontólogo, un paciente o un tratamiento pueden tener varios turnos
- **AND** un turno puede tener varias notificaciones y un turno reprogramado puede referenciar al original
- **AND** un odontólogo puede tener varias sesiones y cada sesión pertenece a un solo odontólogo

#### Scenario: La sesión no es una entidad clínica

- **WHEN** se inspeccionan las columnas de `DentistSession`
- **THEN** solo contiene identidad de sesión, relación con el odontólogo, marcas temporales y estado de revocación
- **AND** no contiene nombre, teléfono, email, motivo de consulta ni ningún dato clínico

### Requirement: Enums de turnos y notificaciones

El sistema SHALL usar enums de base de datos para `AppointmentStatus` (`PENDING_CONFIRMATION`, `CONFIRMED`, `CANCELLED`, `RELEASED`, `COMPLETED`, `NO_SHOW`), `NotificationChannel` (`WHATSAPP`, `EMAIL`), `NotificationKind` (`REMINDER`, `CONFIRMATION`, `CANCELLATION`, `RELEASE_NOTICE`) y `NotificationStatus` (`QUEUED`, `SENT`, `DELIVERED`, `READ`, `FAILED`). Un valor fuera de esos conjuntos SHALL ser rechazado.

#### Scenario: Un valor de enum inválido es rechazado

- **WHEN** se intenta escribir un turno con un estado que no pertenece a `AppointmentStatus`
- **THEN** la base rechaza la escritura
- **AND** el valor válido previamente almacenado no se altera

#### Scenario: Los enums se consultan y filtran por valor

- **WHEN** se consultan turnos por estado o notificaciones por canal
- **THEN** el filtro usa el valor tipado del enum
- **AND** no se aceptan comparaciones contra cadenas arbitrarias

### Requirement: Enums de auditoría

El sistema SHALL usar enums de base de datos para `AuditActorType` (`DENTIST`, `PATIENT_TOKEN`, `SYSTEM`) y `AuditAction` (`READ`, `CREATE`, `UPDATE`, `DELETE`, `EXPORT`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`). Un valor fuera de esos conjuntos SHALL ser rechazado.

#### Scenario: Una acción de auditoría inválida es rechazada

- **WHEN** se intenta registrar una auditoría con una acción fuera de `AuditAction`
- **THEN** la base rechaza la escritura
- **AND** no se crea una fila de auditoría con un valor arbitrario

#### Scenario: Las acciones de autenticación se aceptan

- **WHEN** se registra una auditoría con `LOGIN`, `LOGIN_FAILED` o `LOGOUT`
- **THEN** la base acepta la fila
- **AND** las filas existentes con las acciones anteriores conservan su valor

### Requirement: Integridad de columnas en la base

El sistema SHALL rechazar en la base los valores que violen la integridad declarada: duración de tratamiento mayor que cero, hora de inicio anterior a la de fin en disponibilidad y bloqueos, inicio anterior a fin en turnos, y unicidad de email del odontólogo, teléfono del paciente y token de confirmación. La aplicación SHALL normalizar email y teléfono antes de escribir; la base SHALL almacenar y comparar el valor normalizado.

#### Scenario: Duración de tratamiento inválida

- **WHEN** se intenta crear o actualizar un tratamiento con `durationMinutes` menor o igual a cero
- **THEN** la base rechaza la operación
- **AND** el tratamiento existente no se modifica

#### Scenario: Franja horaria inválida

- **WHEN** se intenta crear un bloque de disponibilidad o un bloqueo con hora de inicio mayor o igual que la de fin
- **THEN** la base rechaza la operación

#### Scenario: Turno con rango temporal inválido

- **WHEN** se intenta crear un turno con `startsAt` mayor o igual que `endsAt`
- **THEN** la base rechaza la operación

#### Scenario: Unicidad de email, teléfono y token

- **WHEN** se intenta duplicar el email de un odontólogo, el teléfono de un paciente o el token de confirmación de un turno
- **THEN** la base rechaza la operación
- **AND** el registro original permanece intacto

### Requirement: Acciones referenciales explícitas

El sistema SHALL definir una acción referencial para cada clave foránea. `Appointment.rescheduledFromId` SHALL usar `Restrict`. Un odontólogo, un paciente o un tratamiento con turnos asociados no SHALL poder eliminarse, y un turno referenciado por `rescheduledFromId` tampoco. Los bloques de disponibilidad y los bloqueos SHALL eliminarse junto con su odontólogo; las notificaciones SHALL eliminarse junto con su turno. `AuditLog` no SHALL tener clave foránea.

#### Scenario: No se elimina un tratamiento con turnos

- **WHEN** se intenta eliminar un tratamiento que tiene al menos un turno asociado
- **THEN** la base rechaza la eliminación
- **AND** el tratamiento y sus turnos siguen existiendo

#### Scenario: El turno original de una reprogramación está protegido

- **WHEN** se intenta eliminar un turno referenciado por `rescheduledFromId`
- **THEN** la base rechaza la eliminación

#### Scenario: Los hijos de un odontólogo o de un turno se eliminan en cascada

- **WHEN** se elimina un odontólogo sin turnos o, en una baja excepcional, un turno sin valor histórico
- **THEN** sus bloques de disponibilidad, bloqueos o notificaciones se eliminan con él
- **AND** no quedan filas huérfanas

#### Scenario: Cancelar un turno conserva el turno y sus notificaciones

- **WHEN** un turno con notificaciones pasa a `CANCELLED`
- **THEN** la fila del turno permanece con su estado e historial
- **AND** sus filas de `NotificationLog` no se eliminan

#### Scenario: La auditoría no depende de una clave foránea

- **WHEN** se elimina la entidad referenciada por una fila de auditoría
- **THEN** la fila de auditoría permanece
- **AND** conserva el tipo e identificador de la entidad afectada

### Requirement: Índices de claves foráneas

El sistema SHALL mantener un índice en la columna referenciante de cada clave foránea, incluidos `Appointment.treatmentTypeId` y `Appointment.rescheduledFromId`. Un índice compuesto cuyo primer campo es la columna referenciante SHALL contar como cobertura.

#### Scenario: Las claves foráneas tienen índice

- **WHEN** se consulta el catálogo de índices de PostgreSQL
- **THEN** cada columna referenciante de una clave foránea tiene un índice cuyo prefijo la incluye
- **AND** no se depende de un índice implícito inexistente

#### Scenario: Un índice compuesto cubre la clave foránea

- **WHEN** una clave foránea participa de un índice compuesto como primer campo
- **THEN** no se exige un índice adicional de una sola columna
- **AND** la consulta por esa clave foránea puede usar el índice compuesto

### Requirement: Índices de consultas y auditoría

El sistema SHALL mantener índices para las consultas previstas: `Appointment(dentistId, startsAt)`, `Appointment(patientId, startsAt)`, `Appointment(status)`, `AvailabilityBlock(dentistId, dayOfWeek)`, `BlockedSlot(dentistId, startsAt, endsAt)`, `NotificationLog(appointmentId, createdAt)`, `TreatmentType(active)`, `AuditLog(at)` y `AuditLog(entity, entityId)`.

#### Scenario: Las consultas de agenda y auditoría usan índices

- **WHEN** se consultan turnos por odontólogo y rango de fechas, o auditoría por fecha o por entidad
- **THEN** el plan de ejecución puede apoyarse en los índices declarados
- **AND** no se requiere un recorrido secuencial de la tabla para esas consultas

### Requirement: Migración reproducible desde una base vacía

El sistema SHALL poder crear su esquema completo desde una base vacía aplicando las migraciones versionadas, sin pasos manuales posteriores y sin drift. La migración SHALL incluir la extensión `btree_gist`, el constraint de no-superposición y los `CHECK` que Prisma no expresa. `prisma migrate deploy` SHALL dejar el esquema listo para operar.

#### Scenario: Base vacía migrada con `migrate deploy`

- **WHEN** se aplica `prisma migrate deploy` sobre una base sin tablas
- **THEN** todas las tablas, enums, índices, claves foráneas, `CHECK` y el constraint de no-superposición quedan creados
- **AND** el comando termina sin errores

#### Scenario: No hay drift después de migrar

- **WHEN** se ejecuta `prisma migrate status` sobre una base ya migrada
- **THEN** no se detectan migraciones pendientes ni diferencias de esquema

#### Scenario: La migración es idempotente a nivel de despliegue

- **WHEN** se vuelve a ejecutar `prisma migrate deploy` sobre una base ya migrada
- **THEN** no se reaplican migraciones ni se duplican objetos
- **AND** el esquema sigue siendo el mismo

### Requirement: Sesiones del odontólogo persistidas

El sistema SHALL persistir cada sesión del odontólogo en `DentistSession` con un identificador uuid, la referencia al odontólogo, el hash del token, la fecha de creación, la última utilización, la expiración y la revocación. La relación con `Dentist` SHALL usar `ON DELETE CASCADE`.

#### Scenario: La sesión pertenece a un odontólogo y se elimina en cascada

- **WHEN** se crea una sesión para un odontólogo
- **THEN** la fila referencia exactamente un `Dentist`
- **AND** si el odontólogo se elimina en una baja excepcional, sus sesiones se eliminan con él
- **AND** no quedan sesiones huérfanas

#### Scenario: La sesión no contiene datos clínicos

- **WHEN** se inspeccionan las columnas de `DentistSession`
- **THEN** solo contiene identidad de sesión, relación con el odontólogo, marcas temporales y estado de revocación
- **AND** no contiene nombre, teléfono, email, motivo de consulta ni ningún dato clínico

### Requirement: Hash del token de sesión

El sistema SHALL almacenar únicamente el hash SHA-256 del token de sesión en una columna de 64 caracteres y única. El token en claro no SHALL almacenarse en ninguna columna.

#### Scenario: El token en claro no se persiste

- **WHEN** se crea una sesión y se inspecciona la fila en la base
- **THEN** la columna `tokenHash` contiene un hash SHA-256 de 64 caracteres hexadecimales
- **AND** ninguna columna contiene el token entregado al cliente
- **AND** el hash no es igual al token

#### Scenario: El hash del token es único

- **WHEN** se intenta crear una segunda sesión con el mismo `tokenHash`
- **THEN** la base rechaza la operación
- **AND** la sesión original permanece intacta

### Requirement: Índices y tipos de la sesión

El sistema SHALL mantener un índice sobre `dentistId` para cubrir la clave foránea y un índice sobre `expiresAt` para la limpieza. Las marcas temporales de la sesión SHALL usar `timestamptz`.

#### Scenario: Los índices de sesión cubren las consultas previstas

- **WHEN** se consulta el catálogo de índices de PostgreSQL
- **THEN** existe un índice único sobre `tokenHash`
- **AND** existe un índice sobre `dentistId`
- **AND** existe un índice sobre `expiresAt`

#### Scenario: La sesión usa instantes con zona

- **WHEN** se inspeccionan los tipos de columna de `DentistSession`
- **THEN** `createdAt`, `lastUsedAt`, `expiresAt` y `revokedAt` son `timestamptz`
- **AND** no se usa `timestamp` sin zona

### Requirement: Migración de autenticación reproducible

El sistema SHALL crear `DentistSession` y los nuevos valores de `AuditAction` mediante una migración versionada generada por Prisma, aplicable desde una base vacía con `prisma migrate deploy` y sin pasos manuales posteriores. La migración SHALL ser compatible con las filas y los objetos creados por la Migración 001.

#### Scenario: Base vacía migrada con las dos migraciones

- **WHEN** se aplica `prisma migrate deploy` sobre una base sin tablas
- **THEN** se crean las tablas de C-02 y `DentistSession`
- **AND** el enum `AuditAction` contiene los ocho valores
- **AND** el comando termina sin errores

#### Scenario: Los valores existentes de auditoría siguen siendo válidos

- **WHEN** se leen filas de `AuditLog` creadas antes de la migración de autenticación
- **THEN** conservan su acción original (`READ`, `CREATE`, `UPDATE`, `DELETE` o `EXPORT`)
- **AND** la migración no requiere reescribir datos existentes

#### Scenario: No hay drift después de la migración

- **WHEN** se ejecuta `prisma migrate status` sobre una base migrada
- **THEN** no se detectan migraciones pendientes ni diferencias de esquema

### Requirement: Tipos de columna adecuados al dominio

El sistema SHALL almacenar los instantes en `timestamptz`, las fechas de vigencia en `date`, los horarios recurrentes de disponibilidad en `time` sin zona, el dinero en `numeric(12,2)` y las direcciones IP de auditoría en `inet`. Los timestamps de creación y actualización SHALL registrarse en UTC.

#### Scenario: Los instantes conservan zona horaria

- **WHEN** se guarda un turno con un instante en la zona del consultorio
- **THEN** la base lo almacena como `timestamptz`
- **AND** al leerlo se obtiene el mismo instante en UTC

#### Scenario: Los horarios de disponibilidad son hora de pared

- **WHEN** se guarda un bloque de disponibilidad de 09:00 a 13:00
- **THEN** la base lo almacena como `time` sin zona
- **AND** el valor no se desplaza por cambios de zona horaria

#### Scenario: El dinero y la IP usan tipos nativos

- **WHEN** se guarda un precio o una dirección IP de auditoría
- **THEN** el precio se almacena como `numeric(12,2)` y la IP como `inet`
- **AND** no se pierde precisión ni formato
