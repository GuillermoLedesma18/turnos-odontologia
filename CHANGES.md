# CHANGES — Secuencia de Implementación

> Índice canónico de todos los changes del proyecto **Turnos Odontología**.
> Cada change es atómico: un agente puede implementarlo en una sesión (~4-6 horas).
> **Leer este archivo antes de ejecutar cualquier `/opsx:propose`.**

---

## Cómo usar este documento

1. Identificar el change a implementar (verificar que sus dependencias están en `openspec/changes/archive/`).
2. Leer los docs de la knowledge-base indicados en "Leer antes".
3. Ejecutar `/opsx:propose <nombre-del-change>`.
4. Al terminar el change, archivarlo con `/opsx:archive <nombre-del-change>`.
5. Marcar el checkbox `[x]` en este archivo.

---

## Árbol de dependencias

```
C-01 foundation-setup
  └── C-02 core-models
        └── C-03 auth-odontologo
              ├── C-04 audit-log ─────────────────────┐  (transversal)
              ├── C-05 treatment-catalog              │
              │     └──┐                              │
              └── C-06 availability-management        │
                    └──┤                              │
                       └── C-07 slot-engine           │
                             └── C-08 public-booking ◄─┘
                                   │
                                   ├── C-09 appointment-token-view
                                   │
                                   ├── C-10 dentist-agenda
                                   │     └── C-11 appointment-lifecycle
                                   │
                                   ├── C-12 patient-record ──► C-16 compliance-hardening ◄── C-04
                                   │
                                   └── C-13 whatsapp-messaging
                                         └── C-14 email-fallback
                                               └── C-15 reminder-and-release-jobs
```

### Paralelismo por fase

> Cada "gate" es un punto de sincronización. Los changes dentro de un grupo pueden ejecutarse en paralelo.

```
GATE 0: ninguna
  → C-01 foundation-setup            (solo)

GATE 1: C-01 ✓
  → C-02 core-models                 (solo)

GATE 2: C-02 ✓
  → C-03 auth-odontologo             (solo)

GATE 3: C-03 ✓                       ← PRIMER FORK (3 paralelos)
  → C-04 audit-log                   [Agente A]
  → C-05 treatment-catalog           [Agente B]
  → C-06 availability-management     [Agente C]

GATE 4: C-05 ✓ + C-06 ✓
  → C-07 slot-engine                 [Agente A]

GATE 5: C-07 ✓ (y C-04 ✓)
  → C-08 public-booking              [Agente A]

GATE 6: C-08 ✓                       ← FORK (4 paralelos)
  → C-09 appointment-token-view      [Agente C]
  → C-10 dentist-agenda              [Agente C — si C-09 ✓]
  → C-12 patient-record              [Agente A]
  → C-13 whatsapp-messaging          [Agente B]

GATE 7: C-10 ✓
  → C-11 appointment-lifecycle       [Agente C]

GATE 8: C-13 ✓
  → C-14 email-fallback              [Agente B]

GATE 9: C-13 ✓ + C-14 ✓
  → C-15 reminder-and-release-jobs   [Agente B]

GATE 10: C-04 ✓ + C-12 ✓
  → C-16 compliance-hardening        [Agente A]
```

### Camino crítico (9 changes — mínimo irreducible)

```
C-01 → C-02 → C-03 → C-05 → C-07 → C-08 → C-13 → C-14 → C-15
```

> Ramas alternativas de cierre: `C-08 → C-10 → C-11` (ciclo de vida del turno) y
> `C-08 → C-12 → C-16` (cumplimiento). Ninguna es indispensable para tener
> reserva + recordatorios + auto-liberación en producción; sí lo son para
> "producto completo".

### Plan óptimo con 3 agentes

```
Paso │ Agente A (Núcleo/Datos)    │ Agente B (Integraciones)   │ Agente C (Interfaz)
─────┼───────────────────────────┼────────────────────────────┼──────────────────────────
  1  │ C-01 foundation-setup     │            —               │            —
  2  │ C-02 core-models          │            —               │            —
  3  │ C-03 auth-odontologo      │            —               │            —
  4  │ C-04 audit-log            │ C-05 treatment-catalog     │ C-06 availability-management
  5  │ C-07 slot-engine          │            —               │            —
  6  │ C-08 public-booking       │            —               │            —
  7  │ C-12 patient-record       │ C-13 whatsapp-messaging    │ C-10 dentist-agenda
  8  │           —               │ C-14 email-fallback        │ C-11 appointment-lifecycle
  9  │ C-16 compliance-hardening │ C-15 reminder-and-release-jobs │        —
```

> Los pasos 5 y 6 son el cuello de botella real: `C-07` y `C-08` son secuenciales
> y no desbloquean trabajo paralelo hasta `GATE 6`. Los pasos 8-9 rebalancean la
> carga hacia B y C.

---

## FASE 0 — Cimientos

### [C-01] `foundation-setup`
- **Estado**: `[ ]` pendiente
- **Scope**: Scaffolding del monolito + infraestructura base
  - Next.js 14 (App Router) + TypeScript + Tailwind; estructura `src/app`, `src/server`, `src/components`, `src/lib`, `prisma/`
  - Prisma inicializado contra PostgreSQL 15 (Docker Compose local)
  - `lib/env.ts` con validación Zod de variables de entorno; `.env.example` con todas las de `08_arquitectura_propuesta.md §Variables de entorno`
  - `GET /api/health` (smoke)
  - ESLint + Prettier + scripts (`dev`, `build`, `lint`, `typecheck`, `test`)
  - CI GitHub Actions: lint + typecheck + build
  - Tests: smoke del health check y del arranque de Prisma
- **Dependencias**: ninguna
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/01_vision_y_objetivos.md` §Alcance v1.0
  - `knowledge-base/02_descripcion_general.md` §Stack tecnológico
  - `knowledge-base/08_arquitectura_propuesta.md` §Estructura de directorios
  - `knowledge-base/09_decisiones_y_supuestos.md` §DD-03

---

## FASE 1 — Núcleo de datos y acceso

### [C-02] `core-models`
- **Estado**: `[ ]` pendiente
- **Scope**: Modelo de datos completo + migración inicial + seed
  - Modelos Prisma: `Dentist`, `AvailabilityBlock`, `BlockedSlot`, `TreatmentType`, `Patient`, `Appointment`, `NotificationLog`, `AuditLog`
  - Enums: `AppointmentStatus`, `NotificationChannel`, `NotificationKind`, `NotificationStatus`
  - Migración 001: tablas + `CREATE EXTENSION btree_gist` + constraint `no_overlap` (`EXCLUDE USING gist` sobre `tstzrange`, activo solo en estados vivos)
  - Índices de `04_modelo_de_datos.md`: `(dentistId, startsAt)`, `(patientId, startsAt)`, `(status)`, `(dentistId, dayOfWeek)`
  - `seed.ts`: 1 `Dentist`, catálogo base (6 tratamientos), bloques lun-vie 09-13/15-19
  - Tests: el constraint rechaza solapamiento; acepta franjas contiguas; ignora `CANCELLED`/`RELEASED`
- **Dependencias**: C-01
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Entidades
  - `knowledge-base/04_modelo_de_datos.md` §Constraint clave
  - `knowledge-base/05_reglas_de_negocio.md` §RN-AGE
  - `knowledge-base/09_decisiones_y_supuestos.md` §DD-01

### [C-03] `auth-odontologo`
- **Estado**: `[ ]` pendiente
- **Scope**: Autenticación del único usuario (odontólogo)
  - `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
  - Hash **argon2**; sesión en cookie `httpOnly` + `SameSite` con expiración por inactividad (`RN-AUT-04`)
  - Middleware de rutas protegidas → redirect a `/login`
  - Página `/login` (mobile-first)
  - Hash de la credencial del `Dentist` del seed
  - Tests: login OK, credenciales inválidas, sesión expirada, denegación sin sesión
- **Dependencias**: C-02
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/03_actores_y_roles.md` §RBAC — Matriz de permisos
  - `knowledge-base/03_actores_y_roles.md` §Rutas protegidas
  - `knowledge-base/05_reglas_de_negocio.md` §RN-AUT
  - `knowledge-base/07_flujos_principales.md` §F5 — Login del odontólogo

### [C-04] `audit-log`
- **Estado**: `[ ]` pendiente
- **Scope**: Trazabilidad de accesos a datos sensibles (Ley 25.326)
  - Servicio `server/audit` append-only; helper `audit(actorType, actorRef, action, entity, entityId, ip)`
  - Instrumentar lecturas/escrituras de datos de paciente (actores `DENTIST`, `PATIENT_TOKEN`, `SYSTEM`)
  - `AuditLog` sin `UPDATE`/`DELETE` (revocar permisos a nivel DB)
  - Tests: cada acceso escribe una fila; el log no admite modificación ni borrado
- **Dependencias**: C-02, C-03
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §AuditLog
  - `knowledge-base/05_reglas_de_negocio.md` §RN-DAT
  - `knowledge-base/12_cumplimiento_datos_de_salud.md` §Medidas técnicas
  - `knowledge-base/06_funcionalidades.md` §US-016

---

## FASE 2 — Configuración del consultorio

### [C-05] `treatment-catalog`
- **Estado**: `[ ]` pendiente
- **Scope**: Catálogo de tratamientos configurable
  - CRUD `TreatmentType` — `/api/treatment-types` (protegido) + `GET /api/treatment-types?active=true` (público)
  - **Soft delete** (`active=false`); no se elimina un tratamiento con turnos asociados (`RN-CAT-02`)
  - Validación Zod (`durationMinutes > 0`, nombre no vacío)
  - Página `/tratamientos` (alta/edición/desactivación, mobile-first)
  - Tests: CRUD, soft delete, listado público solo activos, duración inválida rechazada
- **Dependencias**: C-02, C-03
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §TreatmentType
  - `knowledge-base/05_reglas_de_negocio.md` §RN-CAT
  - `knowledge-base/06_funcionalidades.md` §US-007
  - `knowledge-base/04_modelo_de_datos.md` §Seed inicial

### [C-06] `availability-management`
- **Estado**: `[ ]` pendiente
- **Scope**: Disponibilidad y bloqueos del odontólogo
  - CRUD `AvailabilityBlock` (día de semana + franja) y `BlockedSlot` (bloqueos puntuales con motivo)
  - Validaciones: `startTime < endTime`; sin solapamiento de bloques del mismo día
  - Endpoints `/api/availability` (protegidos)
  - Página `/agenda/disponibilidad` (grilla semanal editable, mobile-first)
  - Tests: alta/edición/baja, validaciones, los turnos existentes no se ven afectados retroactivamente
- **Dependencias**: C-02, C-03
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §AvailabilityBlock / §BlockedSlot
  - `knowledge-base/05_reglas_de_negocio.md` §RN-AGE-02
  - `knowledge-base/06_funcionalidades.md` §US-005 / §US-006
  - `knowledge-base/07_flujos_principales.md` §F4 — Cálculo de disponibilidad

### [C-07] `slot-engine`
- **Estado**: `[ ]` pendiente
- **Scope**: Motor de cálculo de disponibilidad
  - Servicio `server/slots`: `AvailabilityBlock` − `BlockedSlot` − turnos vivos, segmentado por `durationMinutes`
  - `GET /api/slots?date=&treatmentTypeId=` (público, rate-limited)
  - Reglas `RN-AGE-02/03/04`: solo slots que caben completos dentro de un bloque y sin solapamiento
  - Manejo de zona horaria UTC ↔ `TZ_CONSULTORIO`
  - Tests de borde: inicio/fin de bloque, bloqueo parcial, turno en el medio, cambio de duración
- **Dependencias**: C-05, C-06
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §F4 — Cálculo de disponibilidad
  - `knowledge-base/05_reglas_de_negocio.md` §RN-AGE
  - `knowledge-base/04_modelo_de_datos.md` §Appointment / §AvailabilityBlock
  - `knowledge-base/06_funcionalidades.md` §US-002

---

## FASE 3 — Reserva y agenda

### [C-08] `public-booking`
- **Estado**: `[ ]` pendiente
- **Scope**: Reserva online del paciente (sin login)
  - `POST /api/appointments` público con validación Zod + **rate limit** (`RN-RES-04`)
  - Normalización de teléfono a E.164; alta/reutilización de `Patient` por teléfono (`RN-RES-05`)
  - Generación de `confirmationToken` (≥128 bits, URL-safe) y estado `PENDING_CONFIRMATION` (`RN-RES-03`)
  - Manejo del error de exclusión (slot ocupado entre consulta y confirmación) → recálculo limpio
  - Páginas `/reservar` y `/reservar/confirmacion` (mobile-first)
  - Auditoría del alta de paciente (C-04)
  - Tests: reserva OK, teléfono repetido reutiliza ficha, slot ocupado, rate limit, fecha pasada rechazada
- **Dependencias**: C-04, C-05, C-07
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §F1 — Reserva online
  - `knowledge-base/05_reglas_de_negocio.md` §RN-RES / §RN-AGE
  - `knowledge-base/04_modelo_de_datos.md` §Patient / §Appointment
  - `knowledge-base/03_actores_y_roles.md` §Rutas públicas

### [C-09] `appointment-token-view`
- **Estado**: `[ ]` pendiente
- **Scope**: Acceso del paciente a su turno por token
  - Página `/turno/[token]` (solo lectura) con botón de confirmar
  - `POST /api/appointments/[token]/confirm` **idempotente** → `CONFIRMED` + `confirmedAt` (`RN-CON-03`)
  - Token inválido/vencido → página neutra sin revelar datos
  - Auditoría con `actorType = PATIENT_TOKEN`
  - Tests: lectura, confirmación, doble confirmación (idempotencia), token inválido
- **Dependencias**: C-04, C-08
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §F6 — Acceso del paciente
  - `knowledge-base/05_reglas_de_negocio.md` §RN-AUT / §RN-CON
  - `knowledge-base/06_funcionalidades.md` §US-003 / §US-009
  - `knowledge-base/04_modelo_de_datos.md` §Appointment

### [C-10] `dentist-agenda`
- **Estado**: `[ ]` pendiente
- **Scope**: Panel de agenda del odontólogo
  - Páginas `/agenda` (día) y `/agenda/semana` (mobile-first)
  - `GET /api/appointments?from=&to=`
  - Cada turno muestra paciente, tratamiento y estado con badge de color
  - Filtro por estado y navegación de fechas
  - Tests: render por día/semana, orden cronológico, distintivo de estados
- **Dependencias**: C-03, C-08
- **Governance**: BAJO
- **Leer antes**:
  - `knowledge-base/06_funcionalidades.md` §US-004
  - `knowledge-base/04_modelo_de_datos.md` §Diagrama de estados del turno
  - `knowledge-base/07_flujos_principales.md` §F3 — Cancelación / reprogramación
  - `knowledge-base/03_actores_y_roles.md` §Rutas protegidas

---

## FASE 4 — Ciclo de vida del turno

### [C-11] `appointment-lifecycle`
- **Estado**: `[ ]` pendiente
- **Scope**: Cancelación, reprogramación y cierre de turnos
  - `POST /api/appointments/[id]/cancel` → `CANCELLED` + `cancelledAt` + motivo (`RN-CAN-01`)
  - `POST /api/appointments/[id]/reschedule` → turno nuevo + `CANCELLED` del original + `rescheduledFromId` (`RN-CAN-03`)
  - Marcar `COMPLETED` / `NO_SHOW` desde la agenda
  - Validación de transiciones de estado permitidas (máquina de estados)
  - Registra `NotificationLog` `QUEUED` (kind `CANCELLATION`); la entrega efectiva la hace C-13
  - Tests: cancelar, reprogramar respetando anti-solapamiento, transiciones inválidas rechazadas
- **Dependencias**: C-10
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/05_reglas_de_negocio.md` §RN-CAN
  - `knowledge-base/04_modelo_de_datos.md` §Diagrama de estados del turno
  - `knowledge-base/07_flujos_principales.md` §F3
  - `knowledge-base/06_funcionalidades.md` §US-011 / §US-012

### [C-12] `patient-record`
- **Estado**: `[ ]` pendiente
- **Scope**: Ficha básica del paciente
  - Páginas `/pacientes` y `/pacientes/[id]` (alta/edición + historial de turnos)
  - Endpoints `/api/patients` (protegidos)
  - Teléfono único (`RN-PAC-01`); **sin datos clínicos** (`RN-PAC-02`)
  - Exportación/visualización de la ficha (soporte al derecho de acceso del titular)
  - Auditoría en cada acceso (C-04)
  - Tests: alta, edición, teléfono duplicado, historial ordenado descendente
- **Dependencias**: C-04, C-08
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/04_modelo_de_datos.md` §Patient
  - `knowledge-base/05_reglas_de_negocio.md` §RN-PAC
  - `knowledge-base/06_funcionalidades.md` §US-013 / §US-014
  - `knowledge-base/12_cumplimiento_datos_de_salud.md` §Derechos del titular

---

## FASE 5 — Mensajería y automatización

### [C-13] `whatsapp-messaging`
- **Estado**: `[ ]` pendiente
- **Scope**: Canal principal de recordatorio y confirmación
  - Cliente WhatsApp Business Cloud API; plantillas `REMINDER`, `CONFIRMATION`, `CANCELLATION`, `RELEASE_NOTICE`
  - Servicio `server/messaging` con **interfaz de canal** (abstracción reutilizable por C-14)
  - `POST /api/webhooks/whatsapp` con verificación de firma → actualiza `NotificationLog` (`SENT`/`DELIVERED`/`READ`/`FAILED`)
  - Enlace del turno (`/turno/[token]`) dentro de la plantilla
  - Reintentos básicos con política configurable (`PA-02`)
  - Tests: envío, webhook de estados, fallo → `FAILED`, firma inválida rechazada
- **Dependencias**: C-08
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/11_recordatorios_y_mensajeria.md`
  - `knowledge-base/05_reglas_de_negocio.md` §RN-CON
  - `knowledge-base/08_arquitectura_propuesta.md` §Integración con WhatsApp
  - `knowledge-base/04_modelo_de_datos.md` §NotificationLog

### [C-14] `email-fallback`
- **Estado**: `[ ]` pendiente
- **Scope**: Canal de respaldo por email
  - Canal email sobre la abstracción de `server/messaging` (`RN-CON-02`)
  - Envío **solo si** el paciente dejó email; registra `NotificationLog` con `channel=EMAIL`
  - Plantillas de respaldo
  - Tests: envío con/sin email, registro correcto, proveedor caído → `FAILED`
- **Dependencias**: C-13
- **Governance**: MEDIO
- **Leer antes**:
  - `knowledge-base/11_recordatorios_y_mensajeria.md` §Canales
  - `knowledge-base/05_reglas_de_negocio.md` §RN-CON-02
  - `knowledge-base/04_modelo_de_datos.md` §NotificationLog

### [C-15] `reminder-and-release-jobs`
- **Estado**: `[ ]` pendiente
- **Scope**: Automatización de recordatorios y auto-liberación
  - Job de recordatorios (dispara `REMINDER` con la antelación configurable)
  - Job de auto-liberación: `PENDING_CONFIRMATION` a ≤ 24 h → `RELEASED`; si el recordatorio **no se entregó por ningún canal** → `CONFIRMED` + marca al odontólogo (`RN-CON-04` / `RN-CON-05`)
  - Endpoint protegido `POST /api/jobs/release-stale` + cron (`CRON_SECRET`)
  - **Idempotencia** de ambos jobs
  - Registro de `RELEASE_NOTICE`
  - Tests: libera, no libera si no fue entregable, idempotencia, respeto del margen de 24 h
- **Dependencias**: C-13, C-14
- **Governance**: ALTO
- **Leer antes**:
  - `knowledge-base/07_flujos_principales.md` §F2 — Recordatorio → confirmación → auto-liberación
  - `knowledge-base/05_reglas_de_negocio.md` §RN-CON-04 / §RN-CON-05
  - `knowledge-base/08_arquitectura_propuesta.md` §Job de auto-liberación
  - `knowledge-base/11_recordatorios_y_mensajeria.md` §Estados de entrega

---

## FASE 6 — Cumplimiento y cierre

### [C-16] `compliance-hardening`
- **Estado**: `[ ]` pendiente
- **Scope**: Endurecimiento de seguridad y cumplimiento (Ley 25.326 / 26.529)
  - Rate limiting endurecido en endpoints públicos; headers de seguridad (HSTS, CSP, X-Frame-Options)
  - Revisión de cifrado en tránsito/reposo + alta de **DPA** con proveedores (`DD-08`)
  - Política de retención y borrado/anonimización de ficha (`PA-06`)
  - Exportación de datos del titular
  - Verificación de que **no** se envían datos clínicos por WhatsApp/email
  - Checklist de cumplimiento documentado
  - Tests: headers presentes, rate limit efectivo, exportación completa, sin PII en logs
- **Dependencias**: C-04, C-12
- **Governance**: CRITICO
- **Leer antes**:
  - `knowledge-base/12_cumplimiento_datos_de_salud.md`
  - `knowledge-base/05_reglas_de_negocio.md` §RN-DAT
  - `knowledge-base/08_arquitectura_propuesta.md` §Seguridad
  - `knowledge-base/10_preguntas_abiertas.md` §PA-06
