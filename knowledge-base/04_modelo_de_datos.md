# Modelo de Datos

## Dominios

| Dominio | Descripción |
|---|---|
| Identidad | Quién opera el sistema (el odontólogo) |
| Configuración | Disponibilidad, bloqueos y catálogo de tratamientos |
| Personas | Pacientes |
| Turnos | Citas y su ciclo de vida |
| Mensajería | Registro de notificaciones enviadas |
| Auditoría | Trazabilidad de accesos a datos sensibles |

## ERD

```
Dentist 1─────N AvailabilityBlock
Dentist 1─────N BlockedSlot
Dentist 1─────N Appointment
Patient 1─────N Appointment
TreatmentType 1──N Appointment
Appointment 1───N NotificationLog
Appointment 0───1 Appointment   (rescheduledFrom, auto-referencia)
AuditLog                        (independiente; referencia entidad + id)
```

## Entidades

### `Dentist`
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `email` | text | UNIQUE, NOT NULL |
| `passwordHash` | text | NOT NULL (argon2) |
| `fullName` | text | NOT NULL |
| `phone` | text | NULL |
| `createdAt` / `updatedAt` | timestamptz | NOT NULL |

Relaciones: N `AvailabilityBlock`, N `BlockedSlot`, N `Appointment`.
> En la v1 existe **una sola fila** (single-tenant), pero se modela como tabla
> para no cerrar la puerta a la evolución multi-odontólogo (`RN-SIS-01`).

### `AvailabilityBlock` — disponibilidad semanal recurrente
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `dentistId` | uuid | FK → `Dentist` |
| `dayOfWeek` | smallint | 0=domingo … 6=sábado |
| `startTime` / `endTime` | time | `startTime < endTime` |
| `validFrom` / `validTo` | date | NULL (vigencia opcional) |
| `active` | boolean | default true |

Índice: `(dentistId, dayOfWeek)`.

### `BlockedSlot` — bloqueos puntuales / licencias / imprevistos
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `dentistId` | uuid | FK → `Dentist` |
| `startsAt` / `endsAt` | timestamptz | `startsAt < endsAt` |
| `reason` | text | NULL |

Índice: `(dentistId, startsAt, endsAt)`.

### `TreatmentType` — catálogo de tratamientos
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | NOT NULL |
| `durationMinutes` | integer | NOT NULL, CHECK (> 0) |
| `description` | text | NULL |
| `price` | numeric(12,2) | NULL (reservado para pagos futuros; no se usa en v1) |
| `active` | boolean | default true (soft delete, `RN-CAT-02`) |

Índice: `(active)`.

### `Patient` — ficha básica
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `fullName` | text | NOT NULL |
| `phone` | text | NOT NULL, UNIQUE (normalizado E.164; `RN-PAC-01`) |
| `email` | text | NULL |
| `notes` | text | NULL |
| `createdAt` / `updatedAt` | timestamptz | NOT NULL |

### `Appointment` — turno
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `dentistId` | uuid | FK → `Dentist` |
| `patientId` | uuid | FK → `Patient` |
| `treatmentTypeId` | uuid | FK → `TreatmentType` |
| `startsAt` / `endsAt` | timestamptz | NOT NULL |
| `status` | `AppointmentStatus` | NOT NULL, default `PENDING_CONFIRMATION` |
| `confirmationToken` | text | UNIQUE, NOT NULL (`RN-AUT-02`) |
| `confirmedAt` / `cancelledAt` / `releasedAt` | timestamptz | NULL |
| `cancelReason` | text | NULL |
| `rescheduledFromId` | uuid | NULL, FK → `Appointment(id)` |
| `createdAt` / `updatedAt` | timestamptz | NOT NULL |

Índices: `(dentistId, startsAt)`, `(patientId, startsAt)`, `(status)`.

**Constraint clave — anti-solapamiento (`RN-AGE-01`):**

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Appointment" ADD CONSTRAINT no_overlap
EXCLUDE USING gist (
  "dentistId" WITH =,
  tstzrange("startsAt", "endsAt") WITH &&
) WHERE (status IN ('PENDING_CONFIRMATION', 'CONFIRMED'));
```

> Solo los estados "vivos" participan del constraint: un turno cancelado o
> liberado deja libre su franja.

### `NotificationLog`
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | uuid | PK |
| `appointmentId` | uuid | FK → `Appointment` |
| `channel` | `NotificationChannel` | NOT NULL |
| `kind` | `NotificationKind` | NOT NULL |
| `status` | `NotificationStatus` | NOT NULL |
| `providerMessageId` | text | NULL |
| `attempt` | smallint | default 1 |
| `error` | text | NULL |
| `sentAt` / `createdAt` | timestamptz | NULL / NOT NULL |

Índice: `(appointmentId, createdAt)`.

### `AuditLog` — trazabilidad (`RN-DAT-01`, `RN-DAT-02`)
| Campo | Tipo | Restricciones |
|---|---|---|
| `id` | bigserial | PK |
| `actorType` | enum(`DENTIST`/`PATIENT_TOKEN`/`SYSTEM`) | NOT NULL |
| `actorRef` | text | dentistId o hash del token |
| `action` | text | READ / CREATE / UPDATE / DELETE / EXPORT |
| `entity` / `entityId` | text | entidad afectada |
| `ip` | inet | NULL |
| `at` | timestamptz | default now() |

> **Append-only**: sin `UPDATE` ni `DELETE`.

## Enums

```
AppointmentStatus    = PENDING_CONFIRMATION | CONFIRMED | CANCELLED | RELEASED | COMPLETED | NO_SHOW
NotificationChannel  = WHATSAPP | EMAIL
NotificationKind     = REMINDER | CONFIRMATION | CANCELLATION | RELEASE_NOTICE
NotificationStatus   = QUEUED | SENT | DELIVERED | READ | FAILED
```

## Diagrama de estados del turno

```
                 (reserva)
                     │
                     ▼
        ┌──────────────────────┐   confirma    ┌────────────┐
        │ PENDING_CONFIRMATION │──────────────▶│ CONFIRMED  │
        └───────┬──────┬───────┘               └─────┬──────┘
                │      │                             │
      (24 h sin │      │ (no entregable             │ (se atiende)
       confirmar)│     │  por ningún canal)          ▼
                │      │                        ┌────────────┐
                ▼      ▼                        │ COMPLETED  │
          ┌──────────┐ ┌──────────────────┐     └────────────┘
          │ RELEASED │ │ CONFIRMED (marca)│     ┌────────────┐
          └──────────┘ └──────────────────┘     │  NO_SHOW   │
                                                └────────────┘
   Cualquier estado vivo ──(el odontólogo cancela/reprograma)──▶ CANCELLED
```

## Seed inicial

**1 `Dentist`** (cuenta del odontólogo).

**Catálogo base de `TreatmentType`** (editable):

| Tratamiento | Duración |
|---|---|
| Consulta / control | 30 min |
| Limpieza (destartraje) | 45 min |
| Obturación (resina) | 45 min |
| Endodoncia | 90 min |
| Extracción simple | 30 min |
| Corona / prótesis | 60 min |

**`AvailabilityBlock` de ejemplo** (editable): lunes a viernes 09:00–13:00 y
15:00–19:00.
