# dentist-auth Specification

## Purpose
Define el comportamiento observable de la autenticación del único usuario del sistema, el odontólogo: verificación de credenciales, creación y persistencia de la sesión, cookie segura, expiración por inactividad, logout, revocación y resistencia básica a fuerza bruta y enumeración de cuentas.

## Requirements

### Requirement: Login con email y contraseña

El sistema SHALL autenticar al odontólogo con `POST /api/auth/login` recibiendo un email y una contraseña. El sistema SHALL normalizar el email con `trim` y minúsculas antes de buscar la cuenta y SHALL verificar la contraseña contra el hash Argon2id almacenado en `Dentist.passwordHash`. Un login exitoso SHALL crear una sesión y devolver una cookie de sesión.

#### Scenario: Login exitoso

- **WHEN** el odontólogo envía un email existente y la contraseña correcta
- **THEN** el sistema responde `200` con los datos mínimos del odontólogo (`id`, `fullName`, `email`)
- **AND** la respuesta incluye una cookie de sesión
- **AND** se crea una fila en `DentistSession` asociada al odontólogo
- **AND** no se devuelve `passwordHash` ni ningún otro dato sensible

#### Scenario: Credenciales vacías o payload inválido

- **WHEN** el cuerpo no es JSON, falta el email o la contraseña, el email tiene formato inválido o la contraseña está vacía
- **THEN** el sistema responde `400` con un mensaje genérico de solicitud inválida
- **AND** no consulta credenciales ni crea una sesión
- **AND** el mensaje no revela si el email existe

### Requirement: Respuestas de credenciales inválidas sin enumeración

El sistema SHALL producir la misma respuesta de credenciales inválidas cuando el email no existe y cuando la contraseña es incorrecta. El sistema no SHALL revelar en estado, cuerpo ni headers si el email existe. SHALL ejecutar una verificación Argon2id tanto para una cuenta existente como para un email inexistente, usando el hash ficticio en este último caso. El sistema no SHALL exigir ni prometer igualdad exacta de tiempos de respuesta.

#### Scenario: Contraseña incorrecta

- **WHEN** el odontólogo envía un email existente y una contraseña incorrecta
- **THEN** el sistema responde `401` con un mensaje genérico de credenciales inválidas
- **AND** no se crea una sesión ni se emite una cookie de sesión
- **AND** la respuesta no indica que el email existe
- **AND** se ejecuta una verificación Argon2id contra el hash real del odontólogo

#### Scenario: Email inexistente

- **WHEN** se envía un email que no corresponde a ningún odontólogo
- **THEN** el sistema responde `401` con el mismo estado y el mismo cuerpo genérico que una contraseña incorrecta
- **AND** no se crea una sesión ni se emite una cookie
- **AND** se ejecuta una verificación Argon2id contra el hash ficticio
- **AND** no se exige igualdad exacta de tiempos de respuesta entre ambos caminos

### Requirement: Verificación Argon2id sin cambios de parámetros

El sistema SHALL verificar la contraseña con `@node-rs/argon2` y el hash Argon2id existente. El sistema no SHALL regenerar el hash del seed, cambiar sus parámetros ni almacenar la contraseña en texto plano. Un hash inválido o un error de la biblioteca SHALL tratarse como verificación fallida.

#### Scenario: La contraseña del seed sigue siendo válida

- **WHEN** se autentica al odontólogo creado por el seed con la contraseña de desarrollo
- **THEN** la verificación Argon2id devuelve verdadero
- **AND** el `passwordHash` almacenado no cambia después del login

#### Scenario: Un error de verificación no rompe el endpoint

- **WHEN** la verificación lanza un error por un hash inválido
- **THEN** el sistema responde como credencial inválida
- **AND** no expone el error, el hash ni la contraseña al cliente ni en logs

#### Scenario: Hash almacenado mal formado

- **WHEN** el odontólogo existe pero su `passwordHash` no es un hash Argon2id válido
- **THEN** el sistema trata la credencial como inválida y responde `401` genérico
- **AND** no propaga una excepción no controlada ni registra el hash en logs

### Requirement: Sesión persistida con token opaco

El sistema SHALL crear una sesión con un token aleatorio de al menos 128 bits y SHALL almacenar únicamente su hash en `DentistSession`. La cookie SHALL transportar el token opaco y el servidor SHALL validarlo contra la base en cada request autenticada. Un token ausente, manipulado, desconocido, expirado o revocado SHALL ser rechazado. La sesión SHALL expirar por inactividad y SHALL tener un tope absoluto.

#### Scenario: La sesión válida se resuelve contra la base

- **WHEN** se presenta la cookie de una sesión activa
- **THEN** el sistema encuentra la sesión por el hash del token
- **AND** devuelve el odontólogo asociado
- **AND** actualiza la última utilización cuando corresponde

#### Scenario: El token en claro no se guarda

- **WHEN** se inspecciona la fila de `DentistSession` después de un login
- **THEN** `tokenHash` es el SHA-256 hexadecimal del token entregado
- **AND** el token en claro no aparece en ninguna columna de la base

#### Scenario: Token manipulado o desconocido

- **WHEN** se envía una cookie con un token alterado o que no corresponde a ninguna sesión
- **THEN** el sistema responde `401` o redirige al login según el tipo de acceso
- **AND** no se concede acceso a datos privados
- **AND** no se crea una sesión nueva

#### Scenario: Sesión expirada

- **WHEN** se presenta una sesión cuyo `expiresAt` ya pasó
- **THEN** el sistema la rechaza
- **AND** no la renueva
- **AND** el acceso privado queda denegado

#### Scenario: Sesión revocada

- **WHEN** se presenta una sesión cuyo `revokedAt` no es nulo
- **THEN** el sistema la rechaza
- **AND** el token no vuelve a ser válido

#### Scenario: Renovación por actividad

- **WHEN** se usa una sesión activa después del intervalo de renovación y antes de su expiración
- **THEN** el sistema actualiza `lastUsedAt`
- **AND** extiende `expiresAt` sin superar el tope absoluto de la sesión

#### Scenario: El tope absoluto no se supera

- **WHEN** una sesión se usa repetidamente durante un período mayor al tope absoluto
- **THEN** el sistema la rechaza al alcanzar el tope
- **AND** no extiende su expiración más allá de ese límite

### Requirement: Cookie de sesión segura

La cookie de sesión SHALL llamarse `turnos_session`, SHALL ser `HttpOnly`, SHALL usar `SameSite=Lax`, SHALL tener `Path=/` y SHALL usar `Secure` en producción. La cookie no SHALL ser accesible desde JavaScript ni almacenarse en `localStorage` o `sessionStorage`. Al cerrar sesión o detectar una sesión inválida, el sistema SHALL borrarla con los mismos atributos de seguridad.

#### Scenario: Atributos de la cookie

- **WHEN** se inspecciona la cookie emitida por un login exitoso
- **THEN** incluye `HttpOnly`, `SameSite=Lax`, `Path=/` y un `Max-Age` acorde al tope absoluto
- **AND** no incluye `Domain`
- **AND** en producción incluye `Secure`

#### Scenario: La cookie no se expone al cliente

- **WHEN** se inspecciona el código del cliente y el almacenamiento del navegador
- **THEN** el token de sesión no se guarda en `localStorage` ni en `sessionStorage`
- **AND** no se lee desde JavaScript

#### Scenario: Borrado de la cookie

- **WHEN** se cierra sesión o se detecta una cookie inválida en `/api/auth/me`
- **THEN** la respuesta emite la cookie con valor vacío y expiración en el pasado
- **AND** conserva `HttpOnly`, `SameSite`, `Path` y `Secure` en producción

### Requirement: Consulta de la sesión actual

El sistema SHALL exponer `GET /api/auth/me` para que el cliente consulte la sesión activa. Con una sesión válida SHALL responder `200` con `dentist.id`, `dentist.fullName` y `dentist.email`, sin `phone`, `passwordHash` ni datos internos de la sesión. Sin cookie, con token inválido, con sesión expirada o con sesión revocada SHALL responder `401` y borrar la cookie. La respuesta no SHALL cachearse.

#### Scenario: Consulta con sesión válida

- **WHEN** se solicita `GET /api/auth/me` con una cookie de sesión válida
- **THEN** el sistema responde `200` con `id`, `fullName` y `email` del odontólogo
- **AND** la respuesta no incluye `phone`, `passwordHash`, token ni id de sesión
- **AND** la respuesta usa `Cache-Control: no-store`

#### Scenario: Consulta sin sesión o con sesión inválida

- **WHEN** se solicita `GET /api/auth/me` sin cookie o con un token manipulado, expirado o revocado
- **THEN** el sistema responde `401`
- **AND** no devuelve datos del odontólogo
- **AND** borra la cookie de sesión

### Requirement: Logout e invalidación de la sesión

El sistema SHALL exponer `POST /api/auth/logout` para revocar la sesión actual. El logout SHALL marcar `revokedAt`, borrar la cookie y responder de forma idempotente aunque no haya cookie o el token ya no exista. Reutilizar el token después del logout SHALL ser rechazado. El logout SHALL revocar solo la sesión presentada y no SHALL afectar otras sesiones válidas del mismo odontólogo.

#### Scenario: Logout exitoso

- **WHEN** el odontólogo envía su cookie de sesión válida a `POST /api/auth/logout`
- **THEN** el sistema responde `204`
- **AND** la sesión queda con `revokedAt`
- **AND** la respuesta borra la cookie
- **AND** se registra el evento de logout en la auditoría

#### Scenario: Reutilización después del logout

- **WHEN** se vuelve a presentar el token de una sesión cerrada
- **THEN** el sistema lo rechaza y no concede acceso
- **AND** no reactiva la sesión

#### Scenario: Logout idempotente

- **WHEN** se llama a logout sin cookie o con un token desconocido
- **THEN** el sistema responde `204` y borra la cookie
- **AND** no revela si la sesión existía

#### Scenario: Otras sesiones no se revocan

- **WHEN** el odontólogo tiene dos sesiones activas y cierra una
- **THEN** la sesión cerrada queda revocada
- **AND** la otra sesión sigue siendo válida

### Requirement: Redirección del usuario autenticado en `/login`

La página `/login` SHALL ser pública. Si el request trae una sesión válida, la página SHALL redirigir a `/agenda`; si no hay sesión o es inválida, SHALL mostrar el formulario. La página no SHALL revelar datos privados antes de validar la sesión.

#### Scenario: Usuario con sesión válida entra a `/login`

- **WHEN** un odontólogo con una sesión válida solicita `/login`
- **THEN** el sistema lo redirige a `/agenda`
- **AND** no muestra el formulario de login

#### Scenario: Usuario sin sesión entra a `/login`

- **WHEN** un visitante sin cookie o con una cookie inválida solicita `/login`
- **THEN** el sistema muestra el formulario de login
- **AND** no redirige en círculos ni revela datos privados

### Requirement: Protección mínima contra fuerza bruta

El sistema SHALL limitar los fallos de credenciales (`401`) por IP. Al superar el límite, SHALL responder `429` con `Retry-After` y un mensaje genérico, sin ejecutar la verificación de credenciales. Un login exitoso SHALL limpiar el contador de esa IP. El límite no SHALL bloquear la cuenta del odontólogo ni revelar si un email existe. Los `400` por payload inválido no SHALL contar como fallo de credenciales.

#### Scenario: Límite de intentos alcanzado

- **WHEN** una misma IP acumula la cantidad máxima de fallos permitida en la ventana
- **THEN** el siguiente intento responde `429` con `Retry-After`
- **AND** no se consulta ni se verifica la credencial
- **AND** el cuerpo no revela si el email existe

#### Scenario: La ventana se reinicia

- **WHEN** transcurre la ventana de tiempo del limitador
- **THEN** la IP puede volver a intentar
- **AND** el contador anterior no se aplica

#### Scenario: Un login exitoso limpia el contador

- **WHEN** una IP con fallos previos inicia sesión correctamente
- **THEN** su contador de fallos se reinicia
- **AND** no queda bloqueada para intentos posteriores

#### Scenario: Un payload inválido no consume el límite

- **WHEN** se envían credenciales vacías, un JSON inválido o un email con formato inválido y el sistema responde `400`
- **THEN** el contador de fallos de esa IP no se incrementa
- **AND** un intento de credenciales posterior sigue sujeto al mismo límite

### Requirement: Cotas de memoria del limitador

El limitador SHALL eliminar las entradas expiradas y SHALL tener un máximo de entradas para no crecer sin límite. Las entradas con `resetAt <= now` SHALL eliminarse en un barrido oportunista como máximo una vez por minuto y también cuando el mapa alcanza su capacidad. El máximo SHALL ser de `10_000` entradas; si después del barrido hay que insertar una IP nueva y el mapa está lleno, SHALL eliminar la entrada con el `resetAt` más próximo antes de insertar. El `Map` no SHALL superar ese máximo.

#### Scenario: Las entradas expiradas se limpian

- **WHEN** el reloj avanza más allá de la ventana de una entrada y se ejecuta el barrido
- **THEN** la entrada expirada se elimina del mapa
- **AND** su IP puede volver a intentar sin arrastrar el contador anterior

#### Scenario: El limitador respeta la capacidad máxima

- **WHEN** se registran más IPs distintas que el máximo de entradas
- **THEN** el tamaño del mapa nunca supera `10_000`
- **AND** se elimina la entrada con el `resetAt` más próximo para hacer lugar a la nueva

### Requirement: Protección CSRF y fijación de sesión

Los endpoints de autenticación que cambian estado SHALL exigir que el request provenga del mismo origen y SHALL rechazar un `Content-Type` que no sea JSON en el login. El sistema no SHALL emitir una sesión antes de verificar las credenciales y SHALL generar un token nuevo en cada login.

#### Scenario: POST cross-origin rechazado

- **WHEN** un request de login o logout llega con un `Origin` de otro sitio
- **THEN** el sistema responde `403`
- **AND** no crea, renueva ni revoca la sesión

#### Scenario: Content-Type incorrecto en login

- **WHEN** el login llega con un `Content-Type` que no es `application/json`
- **THEN** el sistema responde `415`
- **AND** no procesa las credenciales

#### Scenario: Token nuevo en cada login

- **WHEN** el odontólogo inicia sesión dos veces
- **THEN** cada login emite un token distinto
- **AND** ninguna sesión se crea antes de verificar la contraseña

### Requirement: Errores sin filtración de información

El sistema SHALL devolver errores genéricos para credenciales inválidas y errores inesperados. Las respuestas no SHALL incluir trazas, mensajes de la base, nombres de columnas, hashes, tokens, cookies, emails ni contraseñas. Los logs no SHALL registrar esos datos.

#### Scenario: Error inesperado en login

- **WHEN** ocurre un fallo no controlado durante el login
- **THEN** el sistema responde `500` con un mensaje genérico
- **AND** no incluye stack trace, detalles de la base ni secretos
- **AND** no registra la contraseña, el hash ni el token

#### Scenario: Fallo de base durante la validación de sesión

- **WHEN** la base no responde al validar una sesión existente
- **THEN** el sistema no trata la sesión como revocada ni borra la cookie por ese fallo
- **AND** responde con un error de servidor genérico
