# seed-data Specification

## Purpose
Provee los datos mínimos y ficticios para operar y demostrar el sistema en desarrollo —odontólogo, catálogo de tratamientos y disponibilidad inicial— de forma idempotente y sin secretos reales.

## Requirements

### Requirement: Seed idempotente y repetible

El sistema SHALL ofrecer un seed de desarrollo que pueda ejecutarse varias veces sin duplicar filas ni alterar datos existentes. Una segunda ejecución SHALL dejar la base en el mismo estado que la primera.

#### Scenario: Primera ejecución crea los datos base

- **WHEN** se ejecuta el seed sobre una base migrada y vacía
- **THEN** se crean el odontólogo de desarrollo, los tratamientos base y los bloques de disponibilidad
- **AND** el comando termina sin errores

#### Scenario: Segunda ejecución no duplica

- **WHEN** se vuelve a ejecutar el seed sobre la misma base
- **THEN** la cantidad de odontólogos, tratamientos y bloques de disponibilidad no cambia
- **AND** no se sobrescriben cambios hechos por el odontólogo

#### Scenario: La segunda ejecución conserva el hash de la credencial

- **WHEN** se ejecuta el seed dos veces sobre la misma base
- **THEN** el `passwordHash` del odontólogo es idéntico al de la primera ejecución
- **AND** no se regenera la sal en ejecuciones posteriores ni se actualiza el odontólogo

#### Scenario: El seed no destruye datos existentes

- **WHEN** el seed corre sobre una base con turnos y pacientes creados
- **THEN** los turnos y pacientes permanecen intactos
- **AND** el seed no agrega ni modifica tratamientos ni bloques que ya existan

### Requirement: Credencial de desarrollo pública y no secreta

El sistema SHALL crear un único odontólogo de desarrollo con un email ficticio y un hash Argon2id de la contraseña pública `dev-only-password`. El seed no SHALL almacenar la contraseña en texto plano, no SHALL registrar la contraseña ni el hash en los logs, y no SHALL usar credenciales reales ni secretos de producción.

#### Scenario: El odontólogo existe con hash, no con texto plano

- **WHEN** se inspecciona la fila del odontólogo creada por el seed
- **THEN** el campo de contraseña contiene un hash Argon2id
- **AND** no contiene la cadena `dev-only-password`

#### Scenario: El seed no filtra la credencial en los logs

- **WHEN** se ejecuta el seed y se inspecciona su salida
- **THEN** no aparece la contraseña ni el hash
- **AND** la salida se limita a un resumen de lo creado o actualizado

### Requirement: Parámetros explícitos de Argon2id

El sistema SHALL generar el hash de la credencial de desarrollo con Argon2id y parámetros explícitos: versión 19, memoria 19456 KiB, costo de tiempo 2, paralelismo 1 y longitud de salida 32 bytes. El seed no SHALL depender de los valores por defecto para esos parámetros. La sal SHALL ser aleatoria de 16 bytes, generada explícitamente y pasada al hash; no SHALL fijarse en el código.

#### Scenario: El hash declara los parámetros acordados

- **WHEN** se inspecciona el hash Argon2id almacenado por el seed
- **THEN** el string PHC declara `argon2id`, `v=19`, `m=19456`, `t=2` y `p=1`
- **AND** incluye una sal de 16 bytes y un hash de 32 bytes

#### Scenario: El seed no usa defaults implícitos

- **WHEN** se revisa la llamada de hash del seed
- **THEN** todos los parámetros de algoritmo, versión, costo y sal se pasan explícitamente
- **AND** un cambio de los defaults de la librería no altera los parámetros con los que se genera el hash

### Requirement: Catálogo base de tratamientos

El sistema SHALL crear, si el catálogo está vacío, los seis tratamientos base con sus duraciones: Consulta / control (30 min), Limpieza (destartraje) (45 min), Obturación (resina) (45 min), Endodoncia (90 min), Extracción simple (30 min) y Corona / prótesis (60 min). Los tratamientos SHALL quedar activos y ser editables.

#### Scenario: El catálogo base queda disponible

- **WHEN** se ejecuta el seed sobre una base sin tratamientos
- **THEN** existen los seis tratamientos con sus nombres y duraciones
- **AND** todos quedan con `active = true`

#### Scenario: Un catálogo ya configurado no se pisa

- **WHEN** el odontólogo ya modificó o amplió el catálogo y se vuelve a ejecutar el seed
- **THEN** el seed no agrega duplicados ni revierte los cambios
- **AND** los tratamientos existentes conservan sus valores

### Requirement: Disponibilidad inicial de ejemplo

El sistema SHALL crear, si el odontólogo no tiene bloques de disponibilidad, diez bloques correspondientes a lunes a viernes de 09:00 a 13:00 y de 15:00 a 19:00. Los bloques SHALL quedar activos y ser editables.

#### Scenario: La semana laboral queda configurada

- **WHEN** se ejecuta el seed sobre un odontólogo sin disponibilidad
- **THEN** existen dos bloques por cada día de lunes a viernes
- **AND** los horarios son 09:00–13:00 y 15:00–19:00

#### Scenario: La disponibilidad ya configurada no se duplica

- **WHEN** el odontólogo ya tiene bloques de disponibilidad y se vuelve a ejecutar el seed
- **THEN** la cantidad de bloques no aumenta
- **AND** los bloques existentes conservan sus horarios

### Requirement: Seed sin datos personales reales

El sistema SHALL limitar el seed a datos ficticios de configuración y credenciales de desarrollo. El seed no SHALL crear pacientes, turnos ni datos personales reales, y no SHALL requerir conexión a servicios externos.

#### Scenario: El seed no crea pacientes ni turnos

- **WHEN** se ejecuta el seed sobre una base vacía
- **THEN** la tabla de pacientes y la de turnos quedan vacías
- **AND** no se realizan llamadas a WhatsApp, email ni otros servicios externos

#### Scenario: El seed funciona sin servicios externos

- **WHEN** se ejecuta el seed en un entorno de desarrollo sin credenciales de mensajería
- **THEN** el seed completa los datos base
- **AND** no falla por variables de entorno opcionales ausentes
