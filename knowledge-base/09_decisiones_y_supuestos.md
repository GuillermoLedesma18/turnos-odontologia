# Decisiones y Supuestos

## Decisiones de diseño (DD)

| ID | Decisión | Motivo | Alternativas descartadas |
|---|---|---|---|
| **DD-01** | Sistema **single-tenant** (un consultorio, un odontólogo, una sede). | Es el alcance del MVP; evita complejidad de tenancy. | Multi-tenant desde el día 1. |
| **DD-02** | **WhatsApp** es el canal principal de recordatorio/confirmación; el email es respaldo opcional. | Es el canal que el paciente argentino ya usa; el hallazgo de mercado reencuadró el riesgo de adopción alrededor de WhatsApp. | Portal del paciente con login; SMS. |
| **DD-03** | **Monolito Next.js + Postgres + Prisma**, un solo deploy. | La prioridad es velocidad de entrega (`DD-08`); un solo lenguaje y una sola unidad de deploy. | Backend separado + SPA; BaaS (Supabase). |
| **DD-04** | El paciente **no se autentica**: accede a su turno por **token no adivinable**. | Elimina la fricción de registro, que era el mayor riesgo de adopción de la reserva online. | Cuenta de paciente con login; OTP. |
| **DD-05** | Los **slots se calculan**, no se persisten. | Evita estados inconsistentes ("slots fantasma") cuando cambia la disponibilidad. | Tabla de slots materializados. |
| **DD-06** | **Auto-liberación a las 24 h** del turno no confirmado **si el recordatorio fue entregable**; si no fue entregable por ningún canal, el turno se **autoconfirma** y queda marcado. | Protege al paciente de perder el turno por una falla técnica de mensajería. | Liberar siempre a las 24 h; no liberar nunca. |
| **DD-07** | Obras sociales y facturación ARCA quedan **fuera del MVP** (al roadmap). | Complejidad alta; hoy solo lo cubren sistemas legacy/institucionales. Es el mayor hueco del segmento, pero no es MVP. | Incluirlos en v1. |
| **DD-08** | **Cloud con DPA + cifrado** (proveedor gestionado). | Datos sensibles de salud (Ley 25.326); velocidad de entrega. | VPS propio en Argentina. |
| **DD-09** | La **cancelación/reprogramación la hace solo el odontólogo**. El paciente no cancela en el sistema. | Simplifica el MVP y coincide con el flujo real del consultorio. | Autoservicio del paciente. |
| **DD-10** | El sistema **coexiste con la planilla** al inicio; es fuente de verdad solo para turnos nuevos. | Adopción gradual, sin migración total de entrada. | Migración completa obligatoria. |

## Supuestos (SU)

| ID | Supuesto | Impacto si es falso |
|---|---|---|
| **SU-01** | El odontólogo es un usuario único; no hay rol "recepción" en la v1. | Aparecería un modelo de roles y multi-usuario antes de lo previsto. |
| **SU-02** | El paciente accede a internet y a WhatsApp de forma habitual. | Bajaría la efectividad de los recordatorios; habría que sumar llamadas/SMS. |
| **SU-03** | El costo de mensajería de WhatsApp lo absorbe el consultorio. | El modelo de precios del producto cambiaría. |
| **SU-04** | El catálogo base de tratamientos y duraciones es suficiente como punto de partida. | Habría que asistir la carga inicial del catálogo. |
| **SU-05** | Las bases precargadas de disponibilidad (lun–vie, doble turno) representan la operación típica. | Habría que revisar la configuración inicial con el odontólogo. |

## Trazabilidad con el Discovery

- `DD-01` ↔ alcance MVP (1 odontólogo, 1 sede).
- `DD-02`, `DD-06` ↔ hallazgos de mercado aplicados al MVP
  (`docs/discovery/mercado-software-odontologico-ar.md`, §E).
- `DD-07` ↔ hallazgo "obras sociales + ARCA = mayor hueco del segmento cloud
  argentino".
- `DD-10` ↔ decisión de coexistencia con la planilla.
- Las seis preguntas abiertas del Discovery quedaron cerradas y se reflejan en
  `05_reglas_de_negocio.md` (`RN-CON-04`, `RN-CON-05`, `RN-CAN-02`,
  `RN-CAT-01`, `RN-SIS-02`).
