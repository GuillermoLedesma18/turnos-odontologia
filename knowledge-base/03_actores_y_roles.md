# Actores y Roles

## Actores del sistema

| Actor | Descripción | Cómo interactúa |
|---|---|---|
| **Odontólogo** | Profesional único dueño del consultorio; es el único usuario autenticado | Login; configura disponibilidad y catálogo; ve y gestiona la agenda; cancela/reprograma; mantiene fichas |
| **Paciente** | Persona que reserva un turno; **no tiene cuenta** | Entra a `/reservar`, elige tratamiento y horario, deja nombre + teléfono; luego accede a su turno por un enlace con token |
| **Sistema** | Jobs y webhooks | Envía recordatorios, procesa estados de entrega, libera turnos no confirmados |

## RBAC — Matriz de permisos

| Recurso | Odontólogo | Paciente (por token) | Público |
|---|---|---|---|
| Disponibilidad (bloques/bloqueos) | CRUD | — | — |
| Catálogo de tratamientos | CRUD | R (solo activos) | R (solo activos) |
| Slots disponibles | R | R | R |
| Turno propio | CRUD | R + confirmar | — |
| Turnos (todos, del consultorio) | R | — | — |
| Ficha de paciente | CRUD | R (la propia) | — |
| Historial de turnos | R | R (el propio) | — |
| Log de notificaciones | R | — | — |
| Auditoría de accesos | R | — | — |

> En la v1 hay **un solo rol autenticado** (el odontólogo). El "paciente" no es un
> rol autenticado: actúa con un **token de turno** (`RN-AUT-02`).

## Rutas públicas

Accesibles sin autenticación:

- `/` — landing / redirección a reserva.
- `/reservar` — elegir tratamiento, ver slots y confirmar la reserva.
- `/reservar/confirmacion` — pantalla de éxito con el enlace del turno.
- `/turno/[token]` — ver el turno propio y confirmarlo (token no adivinable).
- `/api/slots` — consulta de disponibilidad (rate-limited).
- `/api/appointments` (POST) — crear reserva (rate-limited + validación anti-abuso).
- `/api/webhooks/whatsapp` — verificado por firma del proveedor.

## Rutas protegidas

Requieren sesión activa del odontólogo:

`/login` · `/agenda` · `/agenda/semana` · `/agenda/disponibilidad` ·
`/tratamientos` · `/pacientes` · `/pacientes/[id]` · `/api/jobs/release-stale`
