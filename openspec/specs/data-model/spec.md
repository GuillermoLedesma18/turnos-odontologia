# data-model Specification

## Purpose
Define el contrato de persistencia del dominio: las entidades, enums, relaciones, tipos de columna, restricciones e índices sobre los que se apoyan la reserva, la agenda y la auditoría del sistema.

## Requirements

### Requirement: Entidades de dominio persistidas

El sistema SHALL persistir las entidades `Dentist`, `AvailabilityBlock`, `BlockedSlot`, `TreatmentType`, `Patient`, `Appointment`, `NotificationLog` y `AuditLog`, con las relaciones, campos obligatorios y nulabilidad del modelo de datos del proyecto. Ninguna entidad de dominio SHALL quedar sin tabla ni sin clave primaria.

#### Scenario: Las ocho entidades existen en el esquema

- **WHEN** se inspecciona el esquema de la base después de aplicar las migraciones
- **THEN** existen las ocho tablas con sus claves primarias y columnas declaradas
- **AND** no existe una tabla de dominio adicional fuera del modelo aprobado

#### Scenario: Las relaciones respetan la cardinalidad del modelo

- **WHEN** se crea un turno con odontólogo, paciente y tratamiento
- **THEN** el turno referencia exactamente una fila de cada entidad
- **AND** un odontólogo, un paciente o un tratamiento pueden tener varios turnos
- **AND** un turno puede tener varias notificaciones y un turno reprogramado puede referenciar al original

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

El sistema SHALL usar enums de base de datos para `AuditActorType` (`DENTIST`, `PATIENT_TOKEN`, `SYSTEM`) y `AuditAction` (`READ`, `CREATE`, `UPDATE`, `DELETE`, `EXPORT`). Un valor fuera de esos conjuntos SHALL ser rechazado.

#### Scenario: Una acción de auditoría inválida es rechazada

- **WHEN** se intenta registrar una auditoría con una acción fuera de `AuditAction`
- **THEN** la base rechaza la escritura
- **AND** no se crea una fila de auditoría con un valor arbitrario

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
