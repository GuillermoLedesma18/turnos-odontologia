# Reglas de Negocio

Cada regla tiene un código `RN-{DOMINIO}-{NN}` para trazabilidad con el resto de
la KB.

## Autenticación y acceso — RN-AUT

- **RN-AUT-01** — El único usuario autenticado es el odontólogo. El paciente
  **no** crea cuenta.
- **RN-AUT-02** — El paciente accede a su turno por un **token no adivinable**
  (≥ 128 bits, URL-safe), único por turno. No hay credenciales de paciente.
- **RN-AUT-03** — El token de turno es de solo lectura salvo para la acción de
  **confirmar**.
- **RN-AUT-04** — La sesión del odontólogo usa cookie `httpOnly` + `SameSite` y
  expira por inactividad.

## Agenda — RN-AGE

- **RN-AGE-01** — Un odontólogo **no puede** tener dos turnos superpuestos.
  Garantizado por *exclusion constraint* en la base, no solo en código.
- **RN-AGE-02** — Todo turno debe caer dentro de un `AvailabilityBlock` activo y
  no solaparse con un `BlockedSlot`.
- **RN-AGE-03** — La duración del turno = `durationMinutes` del `TreatmentType`
  elegido.
- **RN-AGE-04** — Los slots disponibles se **calculan** dinámicamente; no se
  persisten slots vacíos.
- **RN-AGE-05** — Un turno no puede crearse en el pasado.

## Reserva — RN-RES

- **RN-RES-01** — El paciente reserva sin login con **nombre y teléfono
  obligatorios**; el email es opcional.
- **RN-RES-02** — El **teléfono es el canal principal** de recordatorio. Se
  normaliza a formato E.164.
- **RN-RES-03** — Al reservar, el turno nace en estado `PENDING_CONFIRMATION`.
- **RN-RES-04** — El endpoint público de reserva está **rate-limited** y
  protegido contra abuso (límite por IP y/o teléfono).
- **RN-RES-05** — Si el teléfono ya existe, se **reutiliza la ficha** del
  paciente (no se duplica).

## Confirmación y recordatorios — RN-CON

- **RN-CON-01** — Se envía recordatorio por **WhatsApp** (canal principal).
- **RN-CON-02** — Si el paciente dejó email, se envía además por **email**
  (canal de respaldo).
- **RN-CON-03** — Confirmar desde el enlace pasa el turno a `CONFIRMED` y
  registra `confirmedAt`.
- **RN-CON-04** — Un turno que sigue en `PENDING_CONFIRMATION` **24 h antes**
  de su inicio se **libera automáticamente** (`RELEASED`).
- **RN-CON-05** — Si el recordatorio **no pudo entregarse por ningún canal**, el
  turno se **autoconfirma** y queda **marcado** para el odontólogo. No se libera
  un turno que el paciente no pudo ver.
- **RN-CON-06** — Todo envío y su resultado se registran en `NotificationLog`.

## Cancelación y reprogramación — RN-CAN

- **RN-CAN-01** — **Solo el odontólogo** cancela o reprograma. El paciente no
  cancela en el sistema.
- **RN-CAN-02** — No existe anticipación mínima para cancelar: el odontólogo
  administra su propia agenda.
- **RN-CAN-03** — Reprogramar crea un turno nuevo y marca el original como
  `CANCELLED`, vinculados por `rescheduledFromId`.
- **RN-CAN-04** — Al cancelar o reprogramar se notifica al paciente por WhatsApp
  (*best effort*) y se registra el intento.

## Catálogo de tratamientos — RN-CAT

- **RN-CAT-01** — El catálogo es **configurable por el odontólogo**, con una base
  precargada (ver seed en `04_modelo_de_datos.md`).
- **RN-CAT-02** — Un `TreatmentType` con turnos asociados **no se elimina**: se
  **desactiva** (`active = false`).
- **RN-CAT-03** — Solo los tratamientos activos son visibles y reservables.

## Paciente — RN-PAC

- **RN-PAC-01** — La ficha se identifica por **teléfono único**: una persona =
  una ficha.
- **RN-PAC-02** — La ficha es **básica** en v1 (nombre, teléfono, email, notas).
  No contiene datos clínicos.
- **RN-PAC-03** — El odontólogo puede ver el historial de turnos de un paciente.

## Datos y cumplimiento — RN-DAT

- **RN-DAT-01** — Todo acceso a datos de paciente se registra en `AuditLog`
  (Ley 25.326).
- **RN-DAT-02** — `AuditLog` es **append-only** (sin `UPDATE` ni `DELETE`).
- **RN-DAT-03** — Los datos viajan y se almacenan cifrados (TLS en tránsito;
  cifrado en reposo del proveedor).
- **RN-DAT-04** — Principio de **mínimo dato**: no se recolecta más de lo
  necesario para gestionar el turno.

## Excepciones globales — RN-SIS

- **RN-SIS-01** — El sistema es **single-tenant**: no hay aislamiento por
  organización.
- **RN-SIS-02** — El sistema **coexiste** con la planilla del odontólogo al
  inicio; es fuente de verdad solo para los **turnos nuevos**.
- **RN-SIS-03** — Las fechas se almacenan en **UTC** y se muestran en la zona
  horaria local del consultorio (`America/Argentina/*`).

## Matriz de trazabilidad (regla → historia)

| Regla | Historias relacionadas |
|---|---|
| RN-AUT-01/02/03 | US-003, US-009, US-015 |
| RN-AUT-04 | US-015 |
| RN-AGE-01/02/03/04 | US-002, US-005, US-006 |
| RN-AGE-05 | US-001 |
| RN-RES-01…05 | US-001, US-002 |
| RN-CON-01…06 | US-008, US-009, US-010 |
| RN-CAN-01…04 | US-011, US-012 |
| RN-CAT-01…03 | US-007 |
| RN-PAC-01…03 | US-013, US-014 |
| RN-DAT-01…04 | US-016 |
