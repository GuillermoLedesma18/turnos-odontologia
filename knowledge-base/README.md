# Knowledge Base — Turnos Odontología

Base de conocimiento canónica del proyecto **turnos-odontologia**: un sistema de
reserva de turnos y gestión de agenda para un **consultorio odontológico
unipersonal**.

> **Cómo navegar:** este README es el índice. Cada archivo es autocontenido; los
> códigos (`RN-`, `US-`, `DD-`, `SU-`, `IN-`, `PA-`) son las referencias cruzadas
> entre archivos.

## Resumen ejecutivo

El odontólogo de un consultorio unipersonal administra sus turnos con WhatsApp,
papel y Excel, lo que produce **dobles reservas, turnos olvidados y tiempo
perdido confirmando a mano**. El sistema digitaliza la **reserva online sin
login**, la **agenda del odontólogo** y los **recordatorios por WhatsApp** con
**auto-liberación** del turno no confirmado 24 h antes.

- **Alcance v1 (MVP):** 1 odontólogo, 1 sede · reserva online sin login · panel
  de agenda · ficha básica · recordatorio/confirmación por WhatsApp con email de
  respaldo · catálogo configurable de tratamientos · mobile-first · datos de
  salud bajo Ley 25.326.
- **Stack:** Next.js (App Router) + TypeScript + PostgreSQL + Prisma + Tailwind.
- **Fuera de alcance:** multi-odontólogo/multi-sede, historia clínica, pagos,
  obras sociales + ARCA, IA sobre WhatsApp, app nativa.

## Índice de la KB

| # | Archivo | Contenido |
|---|---|---|
| — | `README.md` | Este índice + resumen ejecutivo |
| 01 | [`01_vision_y_objetivos.md`](01_vision_y_objetivos.md) | Propósito, objetivos por actor, alcance y fuera de alcance, métricas |
| 02 | [`02_descripcion_general.md`](02_descripcion_general.md) | Stack, arquitectura general, integraciones, superficie interna |
| 03 | [`03_actores_y_roles.md`](03_actores_y_roles.md) | Odontólogo y Paciente, matriz RBAC, rutas públicas/protegidas |
| 04 | [`04_modelo_de_datos.md`](04_modelo_de_datos.md) | Entidades, ERD, enums, constraint anti-solapamiento, seed |
| 05 | [`05_reglas_de_negocio.md`](05_reglas_de_negocio.md) | Reglas `RN-*` y matriz de trazabilidad con historias |
| 06 | [`06_funcionalidades.md`](06_funcionalidades.md) | 7 épicas y 16 historias `US-NNN` con criterios de aceptación |
| 07 | [`07_flujos_principales.md`](07_flujos_principales.md) | Reserva, recordatorio→confirmación→liberación, cancelación, slots, login |
| 08 | [`08_arquitectura_propuesta.md`](08_arquitectura_propuesta.md) | Monolito Next.js, estructura de directorios, seguridad, env vars |
| 09 | [`09_decisiones_y_supuestos.md`](09_decisiones_y_supuestos.md) | Decisiones `DD-01..10` y supuestos `SU-01..05` |
| 10 | [`10_preguntas_abiertas.md`](10_preguntas_abiertas.md) | Inconsistencias `IN-*` y preguntas abiertas `PA-*` |
| 11 | [`11_recordatorios_y_mensajeria.md`](11_recordatorios_y_mensajeria.md) | WhatsApp Cloud API, plantillas, estados, reintentos, costo |
| 12 | [`12_cumplimiento_datos_de_salud.md`](12_cumplimiento_datos_de_salud.md) | Ley 25.326 / 26.529, cifrado, auditoría, retención, DPA |

## Quick start (lectura)

1. **¿Qué construimos?** → `01` (visión y alcance).
2. **¿Con qué?** → `02` (stack) y `08` (arquitectura).
3. **¿Para quién?** → `03` (actores y roles).
4. **¿Qué datos?** → `04` (modelo de datos).
5. **¿Qué reglas?** → `05` (reglas de negocio).
6. **¿Qué features?** → `06` (funcionalidades).
7. **¿Cómo funciona el flujo?** → `07` (flujos).
8. **¿Por qué así?** → `09` (decisiones y supuestos).
9. **¿Qué falta?** → `10` (preguntas abiertas).
10. **Mensajería y compliance** → `11` y `12`.

## Convenciones de la KB

| Prefijo | Significado | Archivo canónico |
|---|---|---|
| `RN-{DOM}-{NN}` | Regla de negocio | `05_reglas_de_negocio.md` |
| `US-NNN` | Historia de usuario | `06_funcionalidades.md` |
| `DD-NN` | Decisión de diseño | `09_decisiones_y_supuestos.md` |
| `SU-NN` | Supuesto | `09_decisiones_y_supuestos.md` |
| `IN-NN` | Inconsistencia detectada | `10_preguntas_abiertas.md` |
| `PA-NN` | Pregunta abierta | `10_preguntas_abiertas.md` |
| `F1..F6` | Flujo principal | `07_flujos_principales.md` |

## Origen de esta KB

Generada en modo interactivo (Mode B) por la skill `kb-creator`, a partir de:

- `docs/discovery/discovery.md` — Discovery completo del producto.
- `docs/discovery/mercado-software-odontologico-ar.md` — Informe de mercado (26
  sistemas) con los hallazgos aplicados al MVP.
- `.active-orchestrator-state.json` — sección `discovery` (problema, usuarios,
  integraciones, decisiones cerradas).

## Lectura de acompañamiento

- **Dobles reservas:** eliminadas por diseño (constraint `RN-AGE-01`).
- **Auto-liberación:** 24 h antes, y **no** libera si el recordatorio no se pudo
  entregar (`RN-CON-05`).
- **El paciente no cancela:** la cancelación/reprogramación es del odontólogo
  (`RN-CAN-01`).
