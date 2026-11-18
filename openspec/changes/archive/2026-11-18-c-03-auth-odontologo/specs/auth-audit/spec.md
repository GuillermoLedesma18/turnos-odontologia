# Spec Delta

## Purpose

Define la trazabilidad de los eventos de autenticación: qué se registra en `AuditLog`, con qué actor, acción, entidad e IP, qué datos están prohibidos y cómo se integra C-03 con la vigencia append-only que implementará C-04.

## ADDED Requirements

### Requirement: Eventos de autenticación auditados

El sistema SHALL registrar en `AuditLog` los eventos de autenticación que correspondan: `LOGIN` al crear una sesión, `LOGIN_FAILED` cuando falla la credencial de una cuenta existente y `LOGOUT` al revocar una sesión. Cada fila SHALL incluir `actorType`, `actorRef`, `action`, `entity`, `entityId`, `ip` y `at`. El login exitoso y su auditoría SHALL ser atómicos: no SHALL existir una sesión creada sin su fila `LOGIN`.

#### Scenario: Login exitoso auditado

- **WHEN** el odontólogo inicia sesión correctamente
- **THEN** se escribe una fila con `actorType = DENTIST`, `actorRef = dentist.id`, `action = LOGIN`, `entity = DentistSession` y `entityId = session.id`
- **AND** la fila incluye la IP del request o `null`
- **AND** la sesión y la fila de auditoría se confirman en la misma transacción

#### Scenario: Login fallido de una cuenta existente

- **WHEN** se intenta iniciar sesión con un email existente y una contraseña incorrecta
- **THEN** se escribe una fila con `action = LOGIN_FAILED`, `entity = Dentist` y `entityId = dentist.id`
- **AND** no se crea una sesión
- **AND** la fila no contiene el email, la contraseña ni el hash

#### Scenario: Login fallido con email inexistente

- **WHEN** se intenta iniciar sesión con un email que no corresponde a ninguna cuenta
- **THEN** no se escribe una fila de `AuditLog`
- **AND** el intento cuenta para el limitador por IP
- **AND** no se almacena el email intentado

#### Scenario: Logout auditado

- **WHEN** el odontólogo cierra una sesión válida
- **THEN** se escribe una fila con `action = LOGOUT`, `entity = DentistSession` y `entityId = session.id`
- **AND** la sesión queda revocada
- **AND** la fila no contiene el token ni la cookie

#### Scenario: Fallo de auditoría en el login

- **WHEN** la escritura de `LOGIN` falla durante un login con credenciales válidas
- **THEN** no se crea la sesión
- **AND** el sistema responde con un error genérico
- **AND** no se emite una cookie de sesión

#### Scenario: Fallo de auditoría en el logout

- **WHEN** la escritura de `LOGOUT` falla después de revocar la sesión
- **THEN** la revocación prevalece
- **AND** el sistema responde `204` y borra la cookie
- **AND** no vuelve a habilitar la sesión

### Requirement: Datos prohibidos en la auditoría y en los logs

`AuditLog` y los logs del sistema no SHALL contener contraseñas, hashes de contraseña, tokens de sesión, cookies, emails, nombres, teléfonos, motivos de consulta ni datos clínicos. La auditoría de autenticación SHALL limitarse a identificadores, acción, entidad, IP y momento. Los errores inesperados SHALL registrarse sin el cuerpo del request ni valores de credenciales.

#### Scenario: La fila de auditoría no contiene PII

- **WHEN** se inspeccionan las filas de `AuditLog` creadas por login, login fallido y logout
- **THEN** no aparece el email, la contraseña, el hash, el token ni la cookie
- **AND** los campos se limitan a actor, acción, entidad, identificador, IP y timestamp

#### Scenario: Los logs no filtran secretos

- **WHEN** se capturan los logs de un login exitoso y de uno fallido
- **THEN** no aparece la contraseña, el hash, el token ni el email
- **AND** los errores inesperados no incluyen el cuerpo de la request

### Requirement: IP de origen validada

El sistema SHALL obtener la IP del request desde el primer valor de `x-forwarded-for` o, en su defecto, desde `x-real-ip`. SHALL validarla como IPv4 o IPv6 antes de guardarla en la columna `inet`. Si no hay un valor válido, SHALL guardar `null`.

#### Scenario: IP válida en la auditoría

- **WHEN** el request incluye una IP válida en el header de un proxy controlado
- **THEN** la fila de auditoría la guarda en `ip` como `inet`
- **AND** la IP no reemplaza al actor ni al token de sesión

#### Scenario: IP ausente o inválida

- **WHEN** el request no trae headers de IP o trae un valor inválido
- **THEN** la fila de auditoría guarda `ip = null`
- **AND** el login no falla por ese motivo

### Requirement: Confianza limitada en headers de proxy

`X-Forwarded-For` y `X-Real-IP` SHALL considerarse confiables solo cuando un proxy controlado por la infraestructura los establece o sobrescribe. El sistema no SHALL confiar en valores arbitrarios enviados por un cliente. La IP no SHALL usarse como prueba de identidad ni para autorizar.

#### Scenario: La IP no autoriza

- **WHEN** un request sin sesión incluye un valor arbitrario en `x-forwarded-for` o `x-real-ip`
- **THEN** el request sigue sin autenticación y no accede a datos privados
- **AND** la IP solo se usa para auditoría y rate limit, nunca como credencial

#### Scenario: Un header de cliente no reemplaza la sesión

- **WHEN** un request autenticado incluye un header de IP distinto al de la sesión
- **THEN** la autorización sigue dependiendo de la cookie y la sesión válida
- **AND** el header solo afecta la IP registrada, no el acceso

### Requirement: Integración con el append-only de C-04

C-03 SHALL limitarse a insertar filas en `AuditLog` mediante un helper de auditoría de autenticación. C-03 no SHALL implementar revocación de privilegios, triggers ni pruebas de inmutabilidad, y no SHALL declarar compliance completo de auditoría. El helper SHALL quedar preparado para que C-04 lo reemplace o lo haga delegar en el servicio append-only sin cambiar el contrato de los eventos.

#### Scenario: C-03 solo inserta

- **WHEN** se revisan las operaciones de auditoría de C-03
- **THEN** solo se ejecutan inserciones
- **AND** no se actualizan ni se eliminan filas de `AuditLog` desde el código de autenticación

#### Scenario: Handoff verificable a C-04

- **WHEN** C-04 implemente el append-only
- **THEN** los eventos `LOGIN`, `LOGIN_FAILED` y `LOGOUT` siguen escribiéndose con el mismo contrato
- **AND** C-04 puede agregar la garantía de inmutabilidad sin que C-03 tenga que cambiar sus llamadas
