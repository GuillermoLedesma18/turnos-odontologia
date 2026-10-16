# Spec Delta

## Purpose

Expone un contrato operativo mínimo para verificar, sin autenticación, que el monolito está vivo y que puede alcanzar su base de datos — de modo que el host, el CI y los tests de humo de todos los changes posteriores tengan un punto único de comprobación, sin revelar información interna.

## ADDED Requirements

### Requirement: Endpoint de salud consultable sin autenticación

El sistema SHALL exponer un endpoint de salud en `GET /api/health`, accesible sin autenticación y sin cookie de sesión. La respuesta SHALL ser JSON e incluir un campo que indique el estado global. El endpoint no SHALL revelar secretos, credenciales, cadenas de conexión, versiones internas ni trazas de error.

#### Scenario: Proceso vivo con base alcanzable

- **WHEN** un cliente hace `GET /api/health` y la base de datos responde
- **THEN** el sistema responde `200` con estado global saludable

#### Scenario: Consulta sin credenciales

- **WHEN** un cliente hace `GET /api/health` sin cookie de sesión ni header de autorización
- **THEN** el sistema responde `200`, no `401` ni `403`: el endpoint es público por diseño

#### Scenario: La respuesta no filtra información interna

- **WHEN** se inspeccionan el cuerpo y los headers de la respuesta
- **THEN** no aparecen secretos, credenciales, cadenas de conexión ni trazas de error

### Requirement: El health check distingue el estado de la base

El sistema SHALL comprobar la alcanzabilidad de la base de datos como parte del health check y SHALL distinguir un proceso vivo con base alcanzable de uno vivo con base inalcanzable. Cuando la base no sea alcanzable, SHALL responder con un código de servicio no disponible y un indicador de base no disponible, en lugar de una excepción no controlada.

#### Scenario: Base inalcanzable

- **WHEN** la base de datos no responde (por ejemplo, contenedor detenido o credenciales inválidas)
- **THEN** el sistema responde `503` con un estado que indica degradación y un indicador de base no disponible
- **AND** no propaga una excepción no controlada con stack trace al cliente

#### Scenario: Una base lenta no cuelga el endpoint

- **WHEN** la comprobación de la base no responde dentro del tiempo acotado previsto
- **THEN** el endpoint responde igualmente con el estado degradado, en lugar de quedar pendiente

### Requirement: El health check no produce efectos secundarios

El sistema SHALL limitar el health check a operaciones de lectura: no SHALL escribir ni modificar datos, ni emitir mensajes por canales externos (WhatsApp, email), ni encolar trabajo. Invocarlo repetidamente SHALL devolver el mismo resultado sin alterar el estado del sistema.

#### Scenario: Invocación repetida no muta estado

- **WHEN** el endpoint se invoca varias veces seguidas con la base alcanzable
- **THEN** no se crean ni modifican filas y no se emite ningún mensaje externo
