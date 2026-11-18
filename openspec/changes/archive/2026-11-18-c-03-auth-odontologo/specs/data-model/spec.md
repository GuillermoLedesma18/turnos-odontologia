# Spec Delta

## Purpose

Extiende el contrato de persistencia de C-02 con la entidad de sesiones del odontólogo y los valores de auditoría necesarios para registrar autenticación, sin alterar las entidades de dominio existentes.

## MODIFIED Requirements

### Requirement: Entidades de dominio persistidas

El sistema SHALL persistir las entidades de dominio `Dentist`, `AvailabilityBlock`, `BlockedSlot`, `TreatmentType`, `Patient`, `Appointment`, `NotificationLog` y `AuditLog`, más la entidad de infraestructura de autenticación `DentistSession`, con las relaciones, campos obligatorios y nulabilidad del modelo de datos del proyecto. Ninguna entidad persistida SHALL quedar sin tabla ni sin clave primaria. `DentistSession` SHALL almacenar únicamente el hash del token de sesión y no SHALL contener datos clínicos ni datos de paciente.

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

## ADDED Requirements

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
