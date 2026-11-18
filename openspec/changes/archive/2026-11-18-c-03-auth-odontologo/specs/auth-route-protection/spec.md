# Spec Delta

## Purpose

Define la frontera de acceso a la superficie privada del sistema: qué páginas y endpoints exigen una sesión válida del odontólogo, cómo se redirige al login, por qué el middleware es solo una optimización y cómo se preserva el destino sin abrir redirecciones.

## ADDED Requirements

### Requirement: Páginas privadas protegidas en el servidor

El sistema SHALL exigir una sesión válida del odontólogo para renderizar las páginas privadas. En v1 las rutas privadas son `/agenda`, `/agenda/semana`, `/agenda/disponibilidad`, `/tratamientos`, `/pacientes` y `/pacientes/[id]`. Un request sin cookie, con token inválido, con sesión expirada o con sesión revocada SHALL ser redirigido a `/login` antes de renderizar datos privados. Un request con sesión válida SHALL renderizar la página.

#### Scenario: Página privada sin sesión

- **WHEN** un visitante sin cookie solicita `/agenda` o cualquier otra página privada
- **THEN** el sistema responde con una redirección a `/login`
- **AND** no renderiza datos privados ni el contenido de la página protegida

#### Scenario: Página privada con sesión válida

- **WHEN** un odontólogo con una sesión válida solicita una página privada
- **THEN** el sistema renderiza la página
- **AND** la sesión se valida en el servidor antes de acceder a los datos

#### Scenario: Página privada con sesión expirada o revocada

- **WHEN** el request trae una cookie cuya sesión expiró o fue revocada
- **THEN** el sistema redirige a `/login`
- **AND** no concede acceso a la página

#### Scenario: Ocultar la navegación no es autorización

- **WHEN** un visitante sin sesión conoce la URL directa de una página privada
- **THEN** el sistema aplica la misma guarda que si hubiera navegado desde un enlace
- **AND** no depende de que el enlace esté oculto en la interfaz

### Requirement: Route Handlers privados protegidos de forma independiente

Cada Route Handler que lea o escriba datos privados SHALL validar la sesión al inicio del handler, con independencia del middleware y del layout. Sin sesión válida SHALL responder `401` con JSON genérico; nunca SHALL redirigir a `/login` ni ejecutar la lógica de negocio. Con sesión válida SHALL ejecutar la lógica y devolver solo los datos necesarios.

#### Scenario: Endpoint privado sin autenticación

- **WHEN** se invoca un Route Handler privado sin cookie de sesión
- **THEN** el sistema responde `401` con un cuerpo JSON genérico
- **AND** no ejecuta consultas ni escrituras de datos privados
- **AND** no devuelve una redirección HTML

#### Scenario: Endpoint privado con autenticación

- **WHEN** se invoca un Route Handler privado con una sesión válida
- **THEN** el sistema ejecuta la lógica del endpoint
- **AND** la respuesta solo contiene los campos que el cliente necesita

#### Scenario: Endpoint privado con sesión inválida

- **WHEN** se invoca un Route Handler privado con un token manipulado, expirado o revocado
- **THEN** el sistema responde `401`
- **AND** no ejecuta la lógica de negocio

#### Scenario: El middleware no es la única defensa

- **WHEN** un request privado omite el middleware o lo atraviesa con una cookie inválida
- **THEN** el Route Handler vuelve a validar la sesión
- **AND** el acceso se deniega igualmente

### Requirement: Middleware optimista, no autorización

El sistema SHALL usar el middleware solo para redirigir cuando falta la cookie en una ruta privada. El middleware no SHALL consultar la base ni SHALL ser la única verificación de autorización. Si la cookie está presente pero es inválida, el request SHALL continuar hasta la guarda del servidor, que lo rechaza.

#### Scenario: Middleware redirige solo por ausencia de cookie

- **WHEN** un request a una ruta privada no trae la cookie de sesión
- **THEN** el middleware redirige a `/login`
- **AND** agrega el destino original como parámetro `next`

#### Scenario: Cookie presente pero inválida

- **WHEN** un request a una ruta privada trae una cookie con un token inválido
- **THEN** el middleware no concede acceso por sí mismo
- **AND** la guarda del servidor rechaza el request y redirige o responde `401` según el tipo de acceso

#### Scenario: Middleware no ejecuta consultas de base

- **WHEN** se revisa el código del middleware
- **THEN** solo lee la presencia de la cookie y construye la redirección
- **AND** no importa Prisma ni abre conexiones a la base

### Requirement: Redirección al login y destino seguro

Cuando falta una sesión, el sistema SHALL redirigir a `/login` y SHALL preservar la ruta privada solicitada en el parámetro `next`. El parámetro SHALL aceptarse solo si es una ruta relativa que empieza con `/`, no empieza con `//`, no contiene barra invertida ni caracteres de control. Un valor inválido SHALL caer en `/agenda`. El sistema no SHALL redirigir a un origen externo.

#### Scenario: Se preserva el destino privado

- **WHEN** un visitante sin sesión solicita `/agenda/semana?fecha=2026-11-20`
- **THEN** el sistema redirige a `/login` con un `next` que representa esa ruta
- **AND** después de un login exitoso el usuario vuelve a esa ruta

#### Scenario: Se rechaza una redirección abierta

- **WHEN** el parámetro `next` es una URL absoluta, empieza con `//` o contiene una barra invertida
- **THEN** el sistema ignora el valor y redirige a `/agenda`
- **AND** no abandona el origen de la aplicación

#### Scenario: Destino por defecto

- **WHEN** no hay `next` o el valor está vacío
- **THEN** después del login el sistema navega a `/agenda`

### Requirement: Las rutas públicas siguen siendo públicas

El sistema no SHALL bloquear las rutas públicas del producto: `/`, `/reservar`, `/reservar/confirmacion`, `/turno/[token]`, `GET /api/health`, `GET /api/slots`, `POST /api/appointments` y el webhook de WhatsApp. La protección de C-03 SHALL limitarse a la superficie privada del odontólogo.

#### Scenario: Las rutas públicas no exigen sesión

- **WHEN** un visitante sin cookie solicita una ruta pública
- **THEN** el sistema la atiende sin redirigir al login
- **AND** no aplica la guarda del área privada

#### Scenario: El login es público

- **WHEN** un visitante sin cookie solicita `/login`
- **THEN** el sistema muestra el formulario
- **AND** no lo redirige a otra ruta por falta de sesión

### Requirement: Contrato de autorización para Server Actions privadas

C-03 no SHALL agregar Server Actions. Cualquier Server Action que se agregue en un change posterior y lea o escriba datos privados SHALL invocar la guarda de sesión al inicio, del mismo modo que un Route Handler. El layout y el middleware no SHALL contar como autorización de la acción.

#### Scenario: Revisión de una Server Action privada

- **WHEN** se revisa una Server Action que accede a datos privados
- **THEN** invoca la guarda de sesión antes de la lógica de negocio
- **AND** una acción que no la invoca se considera un defecto de seguridad, aunque la página que la contiene esté protegida
