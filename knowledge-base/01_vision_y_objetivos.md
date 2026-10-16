# Visión y Objetivos

## Propósito del sistema

**Un consultorio odontológico unipersonal deja de coordinar sus turnos a mano.**

Hoy el odontólogo —que es también su propia recepcionista— administra la agenda
con WhatsApp, papel y una planilla de Excel. Eso produce dobles reservas, turnos
olvidados y tiempo perdido confirmando cada turno uno por uno. El sistema
digitaliza la reserva y la agenda, envía y registra los recordatorios, y libera
solo el turno que el paciente no confirmó.

## Objetivos por actor

| Actor | Objetivo principal | Objetivos secundarios |
|---|---|---|
| Odontólogo | Gestionar su agenda sin trabajo administrativo manual | Ver el día de un vistazo; cancelar/reprogramar; mantener la ficha del paciente; configurar su disponibilidad |
| Paciente | Reservar un turno cuando le conviene, sin llamar ni escribir | Ver horarios reales; recibir recordatorio; confirmar con un toque; consultar los datos de su turno |
| Sistema (no humano) | Recordar, confirmar y liberar turnos de forma automática | Mantener la fuente de verdad de la agenda; dejar trazabilidad |

## Alcance v1.0 (MVP)

- Un **solo odontólogo** y una **sola sede**.
- Configuración de disponibilidad por bloques (días, franjas) con duración por
  tipo de tratamiento.
- Catálogo **configurable** de tipos de tratamiento con duración (base
  precargada).
- **Reserva online sin login** (nombre + teléfono obligatorios; email opcional).
- **Panel de agenda** del odontólogo (vista diaria/semanal) con cancelación y
  reprogramación.
- **Ficha básica** del paciente (datos + historial de turnos).
- **Recordatorio y confirmación por WhatsApp** (canal principal) con email de
  respaldo.
- **Auto-liberación** del turno no confirmado 24 h antes del turno.
- **Mobile-first**, 100 % web.
- Tratamiento de **datos sensibles de salud** conforme a la Ley 25.326.

## Fuera de alcance (v1.0)

- Multi-odontólogo y multi-sede.
- Historia clínica / odontograma clínico.
- Pagos / seña online.
- Obras sociales y facturación electrónica (ARCA).
- Asistente IA conversacional sobre WhatsApp.
- App móvil nativa.
- Reportes y métricas avanzadas.
- Autoservicio del paciente para cancelar o reprogramar.
- Recordatorios por SMS o llamada.

## Métricas de éxito

| Métrica | Objetivo (v1.0) |
|---|---|
| Dobles reservas | 0 (imposibles por constraint a nivel de datos) |
| Tiempo del odontólogo confirmando turnos | Reducción drástica (recordatorio + confirmación automáticos) |
| Turnos olvidados | Reducción medible vía no-shows |
| "Turnos fantasma" | Bajo: la agenda refleja la disponibilidad real |
| Trazabilidad de datos sensibles | 100 % de accesos registrados en `AuditLog` |
