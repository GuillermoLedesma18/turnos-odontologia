# Discovery — Turnos Odontología

**Fecha**: 2026-10-16
**Fuentes investigadas**: ninguna en esta fase. No hubo scraping: el usuario no
aportó URLs de competidores ni docs propios. El estado actual del dominio y los
supuestos se relevaron por Q&A sobre los 11 puntos del checklist. Aparte se sumó
una investigación de mercado externa (ver §4 y §12).

## 1. Problema que resuelve

Un consultorio odontológico de un solo profesional coordina sus turnos por
WhatsApp/papel apoyado en una planilla de Excel. Eso genera dobles reservas,
turnos olvidados y tiempo perdido confirmando cada turno a mano.

El problema es para el **odontólogo dueño del consultorio** (que hoy es su
propia recepcionista) y de rebote para el **paciente**, que depende de escribir
o llamar para conseguir un horario.

## 2. Usuarios / roles

- **Paciente**: reserva un turno online sin crear cuenta (nombre + teléfono) y
  consulta la información de su turno. No opera cancelaciones en el sistema.
- **Odontólogo**: configura su disponibilidad, gestiona su agenda del día y
  cancela/reprograma turnos.

## 3. Casos de uso

1. Como paciente, quiero ver los horarios libres del odontólogo para reservar
   sin tener que escribir ni llamar.
2. Como odontólogo, quiero ver mi agenda del día para saber cuántos turnos tengo
   y a qué hora.
3. Como odontólogo, quiero cancelar o reprogramar un turno cuando surge un
   imprevisto.
4. Como odontólogo, quiero dar de alta y mantener la ficha básica del paciente.
5. Como sistema, quiero recordar y confirmar el turno por WhatsApp (el canal que
   el paciente ya usa), con email como respaldo, y liberarlo si el paciente no
   confirma.

> Corrección respecto de la primera ronda: el caso de uso "el paciente
> cancela/reprograma" se reasignó al odontólogo, porque el paciente no opera el
> sistema más allá de reservar.

## 4. Competidores / soluciones existentes

No hay scraping ni competidor formal en el radar. El statu quo a vencer es la
combinación **planilla de Excel/Sheets + WhatsApp**, que hoy resuelve el
problema a medias y sin control de superposiciones.

> Ampliación (2026-10-16): se sumó una investigación de mercado completa en
> `docs/discovery/mercado-software-odontologico-ar.md` (26 sistemas, matriz de
> puntuación y análisis competitivo). Deja esta sección desactualizada; sus
> hallazgos se aplicaron al MVP y quedan registrados en §12.

## 5. Funcionalidades necesarias

- Configurar disponibilidad/bloques de atención del odontólogo (días, horarios,
  duración de turno).
- Reserva online del paciente, sin login obligatorio (nombre + teléfono).
- Panel de agenda del odontólogo (vista diaria/semanal) con cancelación y
  reprogramación.
- Ficha básica de paciente (datos + historial de turnos).
- Catálogo de tipos de tratamiento con su duración, configurable por el
  odontólogo, con una base precargada de ejemplo.
- Recordatorio y confirmación por WhatsApp (canal principal), con email de
  respaldo, y auto-liberación 24 h antes del turno si el paciente no confirma.
  Si el recordatorio no pudo entregarse por ningún canal, el turno se
  autoconfirma y no se libera.

## 6. Funcionalidades opcionales

- Pagos / seña online.
- Historial clínico / odontograma.
- Multi-odontólogo / multi-sede.
- Reportes y métricas (ocupación, ausentismo).
- Obras sociales (tarifario, copago y liquidación) y facturación electrónica
  ARCA.
- Asistente IA sobre WhatsApp que atienda y agende conversando.

## 7. Reglas de negocio

- No hay anticipación mínima para cancelar: en el sistema solo cancela o
  reprograma el odontólogo, que administra su propia agenda.
- Un odontólogo no puede tener dos turnos superpuestos.
- Los turnos solo pueden caer dentro de los bloques de atención habilitados.
- Un turno no confirmado se libera automáticamente 24 horas antes del turno.
- El recordatorio va por WhatsApp (canal principal) con email de respaldo. Si no
  pudo entregarse por ningún canal, el turno se autoconfirma (no se libera) y
  queda marcado en la agenda del odontólogo.
- La duración del turno depende del tipo de tratamiento, tomado de un catálogo
  configurable por el odontólogo (ej. control 30min, endodoncia 90min).
- Alcance del MVP: un solo odontólogo y una sola sede.

## 8. Integraciones

- **WhatsApp (API de WhatsApp Business)** para el recordatorio y la confirmación
  del turno — canal principal de la v1. El teléfono es obligatorio en la reserva.
- **Email transaccional** como canal de respaldo, opcional para el paciente.
- Futuro (backlog): pagos/seña online, obras sociales y facturación ARCA,
  asistente IA sobre WhatsApp.

## 9. Restricciones

- **Mobile-first obligatorio**: los pacientes reservan desde el celular.
- **Compliance de datos de salud**: la ficha del paciente es dato sensible
  (Ley 25.326 de Protección de Datos Personales, Argentina) — hay que cuidar
  accesos y almacenamiento.
- Descartadas explícitamente (no son restricciones reales): stack obligatorio,
  presupuesto acotado, plazo fijo.

## 10. Riesgos

- **Riesgo de adopción (reencuadrado)**: el riesgo no es que el paciente
  autoservicio, sino forzarlo a un canal nuevo. La tendencia del mercado es el
  asistente IA que atiende el WhatsApp que el paciente ya usa; el MVP baja el
  riesgo corriendo el recordatorio/confirmación por WhatsApp en vez de depender
  de que el paciente adopte un portal.
- El odontólogo no mantiene su disponibilidad actualizada → el sistema muestra
  horarios que en realidad no están libres (turnos fantasma).
- El tratamiento de seguridad de los datos clínicos todavía no está definido.
- Scope y costo difusos: el alcance del MVP no quedó cerrado del todo.

## 11. Decisiones cerradas (cierre de preguntas, 2026-10-16)

- **Anticipación mínima para cancelar:** se elimina como regla propia. Su única
  función es el cutoff de auto-liberación del turno no confirmado.
- **Ventana de auto-liberación:** 24 horas antes del turno.
- **Alcance del MVP:** un odontólogo y una sede. Multi-odontólogo y multi-sede
  quedan como backlog.
- **Catálogo de tratamientos y duraciones:** configurable por el odontólogo, con
  una base precargada de ejemplo.
- **Paciente sin email:** se permite reservar igual; el turno se autoconfirma
  (no se libera) y queda marcado en la agenda del odontólogo. *Actualizado por
  §12: con WhatsApp como canal principal, el respaldo ya no depende del email.*
- **¿Reemplaza la planilla?:** no desde el día 1. Coexiste: el sistema es la
  fuente de verdad para los turnos nuevos y el odontólogo migra suavemente.

## 12. Hallazgos de mercado aplicados al MVP (2026-10-16)

Del informe `docs/discovery/mercado-software-odontologico-ar.md`:

1. **Canal de recordatorio:** WhatsApp pasa a ser el canal principal y el email
   queda como respaldo (el mercado ya lo da por estándar).
2. **Obras sociales + ARCA:** se incorporan al backlog/roadmap como el
   diferenciador más fuerte del segmento cloud argentino.
3. **Riesgo de adopción:** reencuadrado de "portal del paciente" a "IA sobre el
   WhatsApp que el paciente ya usa"; el MVP ya lo refleja moviendo el recordatorio
   a WhatsApp.

Ya no quedan preguntas abiertas del Discovery.
