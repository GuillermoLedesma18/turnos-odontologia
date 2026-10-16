# Funcionalidades

Organizadas por **épica** y luego por **historia** (`US-NNN`). Cada historia
lleva criterios de aceptación (CA) y las reglas de negocio que la gobiernan.

---

## Épica 1 — Reserva online del paciente

### US-001 — Reservar un turno sin crear cuenta
**Como** paciente **quiero** reservar un turno eligiendo tratamiento y horario
**para** no tener que llamar ni escribir.

**CA**
- [ ] El formulario pide **nombre** y **teléfono** (obligatorios); email opcional.
- [ ] No se pide contraseña ni registro.
- [ ] Al confirmar, se crea el `Appointment` en `PENDING_CONFIRMATION`.
- [ ] Se muestra una pantalla de éxito con el enlace del turno.
- [ ] Si el teléfono ya existe, se reutiliza la ficha.

**Reglas:** `RN-RES-01`, `RN-RES-03`, `RN-RES-05`, `RN-AGE-05`

### US-002 — Ver solo horarios realmente libres
**Como** paciente **quiero** ver únicamente horarios disponibles **para** no
perder tiempo con turnos que no existen.

**CA**
- [ ] Los slots se calculan desde la disponibilidad menos turnos y bloqueos.
- [ ] No se ofrecen horarios superpuestos.
- [ ] Si no hay disponibilidad, se muestra un mensaje claro.

**Reglas:** `RN-AGE-02`, `RN-AGE-04`

### US-003 — Consultar mi turno
**Como** paciente **quiero** abrir un enlace y ver los datos de mi turno **para**
confirmarlo sin recordar detalles.

**CA**
- [ ] El acceso es por token, sin login.
- [ ] Muestra tratamiento, fecha/hora y datos del consultorio.
- [ ] Un token inválido o vencido no revela información.

**Reglas:** `RN-AUT-02`, `RN-AUT-03`

---

## Épica 2 — Agenda del odontólogo

### US-004 — Ver la agenda del día / semana
**Como** odontólogo **quiero** ver mis turnos por día y por semana **para**
ordenar mi jornada de un vistazo.

**CA**
- [ ] Vista diaria y semanal, mobile-first.
- [ ] Cada turno muestra paciente, tratamiento y estado.
- [ ] Los estados se distinguen visualmente.

### US-005 — Configurar disponibilidad por bloques
**Como** odontólogo **quiero** definir mis bloques de atención **para** que el
paciente solo vea horarios reales.

**CA**
- [ ] Alta/edición/baja de bloques por día de la semana y franja horaria.
- [ ] Validación `startTime < endTime`.
- [ ] Los turnos ya existentes no se ven afectados retroactivamente.

**Reglas:** `RN-AGE-02`, `RN-AGE-04`

### US-006 — Bloquear franjas o días
**Como** odontólogo **quiero** bloquear franjas puntuales **para** reservar
espacios ante licencias o imprevistos.

**CA**
- [ ] Alta/edición/baja de `BlockedSlot` con motivo opcional.
- [ ] Un slot bloqueado deja de ofrecerse al paciente.

**Reglas:** `RN-AGE-02`

---

## Épica 3 — Catálogo de tratamientos

### US-007 — Gestionar tipos de tratamiento y sus duraciones
**Como** odontólogo **quiero** administrar mi catálogo de tratamientos **para**
que la duración del turno sea correcta.

**CA**
- [ ] CRUD de `TreatmentType` (nombre, duración, descripción, precio opcional).
- [ ] Un tratamiento con turnos asociados se **desactiva**, no se borra.
- [ ] Solo los activos aparecen en la reserva.

**Reglas:** `RN-CAT-01`, `RN-CAT-02`, `RN-CAT-03`, `RN-AGE-03`

---

## Épica 4 — Recordatorios y confirmación

### US-008 — Recibir el recordatorio por WhatsApp
**Como** paciente **quiero** recibir un recordatorio en WhatsApp **para** no
olvidarme del turno.

**CA**
- [ ] El recordatorio sale por WhatsApp (principal).
- [ ] Si hay email, se envía además por email (respaldo).
- [ ] Todo envío queda en `NotificationLog` con su estado.

**Reglas:** `RN-CON-01`, `RN-CON-02`, `RN-CON-06`, `RN-RES-02`

### US-009 — Confirmar el turno con un toque
**Como** paciente **quiero** confirmar mi turno desde el recordatorio **para**
asegurar mi lugar sin escribir.

**CA**
- [ ] El enlace abre `/turno/[token]` con un botón de confirmar.
- [ ] Al confirmar, el turno pasa a `CONFIRMED` y registra `confirmedAt`.
- [ ] Confirmar dos veces es idempotente.

**Reglas:** `RN-CON-03`, `RN-AUT-02`, `RN-AUT-03`

### US-010 — Liberar el turno no confirmado
**Como** odontólogo **quiero** que un turno no confirmado se libere solo **para**
poder ofrecer esa franja a otro paciente.

**CA**
- [ ] Un turno en `PENDING_CONFIRMATION` 24 h antes de su inicio pasa a
  `RELEASED`.
- [ ] Si el recordatorio no se pudo entregar por **ningún** canal, el turno se
  **autoconfirma** y queda **marcado** (no se libera).
- [ ] La liberación deja rastro en `NotificationLog`.

**Reglas:** `RN-CON-04`, `RN-CON-05`, `RN-CON-06`

---

## Épica 5 — Cancelación y reprogramación

### US-011 — Cancelar un turno
**Como** odontólogo **quiero** cancelar un turno **para** liberar la franja.

**CA**
- [ ] Solo el odontólogo puede cancelar.
- [ ] El turno pasa a `CANCELLED` y registra `cancelledAt` + motivo.
- [ ] Se intenta notificar al paciente (best effort) y se registra el intento.

**Reglas:** `RN-CAN-01`, `RN-CAN-04`

### US-012 — Reprogramar un turno
**Como** odontólogo **quiero** mover un turno a otro horario **para** resolver
un cambio sin perder el seguimiento.

**CA**
- [ ] Se crea un turno nuevo y el original pasa a `CANCELLED`.
- [ ] Quedan vinculados por `rescheduledFromId`.
- [ ] El nuevo turno respeta el anti-solapamiento y los bloques.

**Reglas:** `RN-CAN-03`, `RN-AGE-01`, `RN-AGE-02`

---

## Épica 6 — Ficha del paciente

### US-013 — Alta y edición de la ficha
**Como** odontólogo **quiero** ver y editar los datos básicos del paciente
**para** tener su contacto a mano.

**CA**
- [ ] Datos: nombre, teléfono, email, notas.
- [ ] El teléfono es único (una persona = una ficha).
- [ ] La ficha es básica: sin datos clínicos en v1.

**Reglas:** `RN-PAC-01`, `RN-PAC-02`

### US-014 — Ver el historial de turnos
**Como** odontólogo **quiero** ver los turnos de un paciente **para** entender su
historial con el consultorio.

**CA**
- [ ] Lista de turnos del paciente, ordenada por fecha descendente.
- [ ] Muestra tratamiento y estado de cada turno.

**Reglas:** `RN-PAC-03`

---

## Épica 7 — Acceso y cumplimiento

### US-015 — Iniciar sesión
**Como** odontólogo **quiero** iniciar sesión de forma segura **para** que solo yo
acceda a la agenda y a los datos de pacientes.

**CA**
- [ ] Credenciales con hash (argon2).
- [ ] Sesión en cookie `httpOnly` + `SameSite`, con expiración por inactividad.
- [ ] Sin sesión, las rutas protegidas redirigen a `/login`.

**Reglas:** `RN-AUT-01`, `RN-AUT-04`

### US-016 — Auditoría de accesos
**Como** responsable del tratamiento **quiero** un registro de accesos a datos
sensibles **para** cumplir con la Ley 25.326.

**CA**
- [ ] Cada acceso a datos de paciente escribe en `AuditLog`.
- [ ] `AuditLog` es append-only.
- [ ] El log incluye actor, acción, entidad y momento.

**Reglas:** `RN-DAT-01`, `RN-DAT-02`
