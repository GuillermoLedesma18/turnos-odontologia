# Flujos Principales

## F1 — Reserva online (paciente anónimo)

**Actor:** Paciente. **Rutas:** `/reservar` → `/reservar/confirmacion`.

1. El paciente abre `/reservar` (mobile-first).
2. Selecciona un **tratamiento** del catálogo activo (`RN-CAT-03`).
3. El sistema calcula los **slots** disponibles para la duración elegida
   (`RN-AGE-03`, `RN-AGE-04`).
4. El paciente elige fecha y horario.
5. Completa **nombre + teléfono** (obligatorios) y email (opcional)
   (`RN-RES-01`).
6. Al enviar:
   - Se normaliza el teléfono a E.164 (`RN-RES-02`).
   - Se busca/crea la `Patient` por teléfono (`RN-RES-05`).
   - Se crea el `Appointment` en `PENDING_CONFIRMATION` con un
     `confirmationToken` único (`RN-RES-03`).
   - El *exclusion constraint* protege contra solapamientos (`RN-AGE-01`).
7. Se muestra la pantalla de éxito con el **enlace del turno** (`/turno/[token]`).

**Errores / bordes**
- El slot se ocupó entre el paso 3 y el 6 → la operación falla limpio y se
  recalcula la disponibilidad.
- Turno en el pasado → rechazado (`RN-AGE-05`).
- Abuso desde la misma IP → *rate limit* (`RN-RES-04`).

---

## F2 — Recordatorio → confirmación → auto-liberación

**Actor:** Sistema (+ Paciente). **Trigger:** cron periódico.

1. El job identifica los turnos que requieren recordatorio y envía por
   **WhatsApp** (`RN-CON-01`); si hay email, también por **email** (`RN-CON-02`).
2. Cada envío se registra en `NotificationLog` con su estado
   (`RN-CON-06`).
3. El **webhook** de WhatsApp actualiza el estado (`SENT` → `DELIVERED` /
   `READ` / `FAILED`).
4. El paciente abre `/turno/[token]` y **confirma** → `CONFIRMED` +
   `confirmedAt` (`RN-CON-03`).
5. Si **24 h antes** del inicio el turno sigue `PENDING_CONFIRMATION`:
   - **Entregable por algún canal** → se libera: `RELEASED`
     (`RN-CON-04`).
   - **No entregable por ningún canal** → se **autoconfirma** y queda
     **marcado** para el odontólogo (`RN-CON-05`).

```
cron ──▶ enviar recordatorio ──▶ NotificationLog
              │                        ▲
              ▼                        │
     webhook WhatsApp ─────────────────┘
              │
   ┌──────────┴───────────┐
   │                      │
 entrega OK            no entrega
   │                      │
 24 h sin conf.        autoconfirma (marca)
   ▼
 RELEASED
```

---

## F3 — Cancelación / reprogramación (odontólogo)

**Actor:** Odontólogo. **Rutas:** `/agenda`, `/agenda/semana`.

1. El odontólogo abre un turno en la agenda.
2. **Cancelar** → `CANCELLED` + `cancelledAt` + motivo (`RN-CAN-01`).
3. **Reprogramar** → crea un turno nuevo, marca el original `CANCELLED` y los
   vincula por `rescheduledFromId` (`RN-CAN-03`).
4. En ambos casos se intenta notificar al paciente por WhatsApp (*best effort*) y
   se registra el intento (`RN-CAN-04`).
5. La franja liberada vuelve a ofrecerse automáticamente (el constraint deja de
   aplicar al estado `CANCELLED`, `RN-AGE-01`).

---

## F4 — Cálculo de disponibilidad (slots)

**Actor:** Sistema. **Trigger:** `GET /api/slots`.

1. Tomar los `AvailabilityBlock` activos del día solicitado.
2. Restar los `BlockedSlot` que se solapen.
3. Restar los `Appointment` en estado vivo (`PENDING_CONFIRMATION`,
   `CONFIRMED`).
4. Segmentar en slots según `durationMinutes` del tratamiento elegido
   (`RN-AGE-03`).
5. Devolver solo los slots que quepan completos dentro de un bloque y no se
   solapen (`RN-AGE-02`, `RN-AGE-04`).

> No se persisten slots vacíos: son siempre un cálculo.

---

## F5 — Login del odontólogo

**Actor:** Odontólogo. **Ruta:** `/login`.

1. Ingresa email + contraseña.
2. Se verifica el hash (argon2).
3. Se crea la sesión (cookie `httpOnly` + `SameSite`, expiración por
   inactividad; `RN-AUT-04`).
4. Acceso a las rutas protegidas. Sin sesión → redirección a `/login`.

---

## F6 — Acceso del paciente a su turno

**Actor:** Paciente. **Ruta:** `/turno/[token]`.

1. El paciente abre el enlace recibido por WhatsApp.
2. El sistema valida el token (no adivinable, `RN-AUT-02`).
3. Se muestra el turno (tratamiento, fecha/hora, datos del consultorio) en modo
   lectura (`RN-AUT-03`).
4. Puede **confirmar** (`US-009`) — única acción de escritura habilitada.
5. Token inválido/vencido → página neutra sin datos.
