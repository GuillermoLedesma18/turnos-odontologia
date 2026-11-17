# appointment-integrity Specification

## Purpose
Garantiza que un odontólogo nunca tenga dos turnos superpuestos, con la restricción impuesta por PostgreSQL y no solo por el código de aplicación, de modo que la integridad de la agenda sobreviva a errores, reintentos y escrituras concurrentes.

## Requirements

### Requirement: No-superposición por odontólogo en estados vivos

El sistema SHALL rechazar en la base cualquier turno que se superponga con otro turno del mismo odontólogo cuando ambos estén en estado `PENDING_CONFIRMATION` o `CONFIRMED`. La superposición SHALL evaluarse sobre el rango `[startsAt, endsAt)` del turno. La garantía SHALL aplicar a toda escritura, incluida la que no pase por la aplicación.

#### Scenario: Dos turnos vivos se superponen

- **WHEN** se intenta crear un turno de 09:30 a 10:00 para un odontólogo que ya tiene uno de 09:00 a 09:45 en estado vivo
- **THEN** la base rechaza la escritura
- **AND** el turno original permanece intacto

#### Scenario: La escritura directa también es rechazada

- **WHEN** se intenta insertar el turno superpuesto con SQL directo, sin pasar por la aplicación
- **THEN** la base rechaza la escritura con la violación del constraint de exclusión

#### Scenario: Dos turnos del mismo odontólogo no se superponen

- **WHEN** se crean turnos consecutivos o separados en el tiempo para el mismo odontólogo
- **THEN** la base acepta ambas escrituras

### Requirement: Los estados no vivos liberan la franja

El sistema SHALL excluir del constraint de no-superposición los turnos en estado `CANCELLED`, `RELEASED`, `COMPLETED` y `NO_SHOW`. Un turno nuevo SHALL poder ocupar la franja de un turno que ya no está vivo.

#### Scenario: Un turno cancelado no bloquea la franja

- **WHEN** un turno vivo se cancela y luego se intenta crear otro turno que ocupa la misma franja
- **THEN** la base acepta el turno nuevo
- **AND** el turno cancelado conserva su estado y su historial

#### Scenario: Un turno liberado no bloquea la franja

- **WHEN** un turno en `PENDING_CONFIRMATION` pasa a `RELEASED` y luego se intenta reservar la misma franja
- **THEN** la base acepta la nueva reserva

#### Scenario: Un turno completado o ausente no bloquea una franja futura

- **WHEN** un turno en `COMPLETED` o `NO_SHOW` coexiste con un turno nuevo que se superpone en el tiempo
- **THEN** la base acepta el turno nuevo
- **AND** el turno cerrado no se modifica

### Requirement: Las franjas contiguas se aceptan

El sistema SHALL tratar los turnos como intervalos semiabiertos `[startsAt, endsAt)`, de modo que un turno que termina exactamente cuando empieza otro no se considere superpuesto.

#### Scenario: Turnos consecutivos sin solapamiento

- **WHEN** se crea un turno de 09:00 a 09:30 y otro de 09:30 a 10:00 para el mismo odontólogo
- **THEN** la base acepta ambos turnos
- **AND** el límite compartido no se cuenta dos veces

#### Scenario: Un turno que empieza un minuto antes sí se superpone

- **WHEN** se intenta crear un turno de 09:29 a 09:59 sobre uno existente de 09:30 a 10:00
- **THEN** la base rechaza la escritura

### Requirement: Odontólogos distintos son independientes

El sistema SHALL evaluar la no-superposición por odontólogo, no de forma global. Dos odontólogos SHALL poder tener turnos en la misma franja horaria.

#### Scenario: Dos odontólogos atienden a la misma hora

- **WHEN** se crean turnos en la misma franja para dos odontólogos distintos
- **THEN** la base acepta ambas escrituras
- **AND** cada turno queda asociado a su odontólogo

### Requirement: La garantía es verificable en la base

El sistema SHALL exponer la garantía como un constraint de exclusión de PostgreSQL sobre `tstzrange(startsAt, endsAt)` y `dentistId`, con un predicado parcial limitado a los estados vivos. La existencia y el comportamiento del constraint SHALL poder verificarse sin depender de la capa de aplicación.

#### Scenario: El constraint existe después de migrar

- **WHEN** se inspecciona el catálogo de constraints de PostgreSQL después de aplicar las migraciones
- **THEN** existe el constraint de exclusión sobre `Appointment`
- **AND** su predicado incluye únicamente los estados vivos

#### Scenario: La violación identifica el constraint

- **WHEN** una escritura superpuesta es rechazada
- **THEN** el error permite identificar la violación de exclusión
- **AND** no se confunde con una violación de unicidad o de clave foránea
