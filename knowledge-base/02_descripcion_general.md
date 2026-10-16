# Descripción General

## Stack tecnológico

| Capa | Tecnología | Versión mínima | Rol |
|---|---|---|---|
| Lenguaje | TypeScript | 5.4 | Todo el proyecto |
| Framework | Next.js (App Router) | 14 | Frontend + backend (route handlers / server actions) |
| UI | React + Tailwind CSS | 18 / 3.4 | Interfaz mobile-first |
| Validación | Zod | 3.23 | Validación de input de punta a punta |
| ORM | Prisma | 7.x | Acceso a datos y migraciones |
| Base de datos | PostgreSQL | 15 | Datos transaccionales e integridad (exclusion constraints) |
| Autenticación | Sesión con cookie httpOnly (Auth.js o implementación propia con argon2) | — | Solo odontólogo |
| Mensajería | WhatsApp Business Cloud API (Meta) | v20+ | Recordatorios/confirmaciones (canal principal) |
| Email | Proveedor transaccional (Resend / SendGrid / SMTP) | — | Canal de respaldo |
| Job programado | Cron del host (p. ej. Vercel Cron) | — | Auto-liberación de turnos |
| Hosting | Cloud con DPA (p. ej. Vercel + Postgres gestionado) | — | Ver `12_cumplimiento_datos_de_salud.md` |

## Arquitectura general

Monolito full-stack Next.js. Un solo deploy: el frontend (Server Components +
Client Components) y el backend (route handlers / server actions) viven en el
mismo proyecto. La lógica de dominio se aísla en `server/` para no mezclarla con
las vistas.

```
┌───────────────────────────────────────────────┐
│            Navegador (mobile-first)            │
│  /reservar  /turno/[token]  /agenda  /login    │
└───────────────┬───────────────────────────────┘
                │ HTTPS
┌───────────────▼───────────────────────────────┐
│              Next.js (App Router)              │
│  ┌────────────┐   ┌──────────────────────────┐ │
│  │  UI / RSC  │   │ Server Actions / Routes  │ │
│  └────────────┘   └───────────┬──────────────┘ │
│                    ┌──────────▼──────────┐     │
│                    │   Dominio (server/) │     │
│                    │ agenda · reservas   │     │
│                    └──────────┬──────────┘     │
└───────────────────────────────┼────────────────┘
                                │ Prisma
        ┌───────────────────────▼───────────────────────┐
        │                  PostgreSQL                    │
        │ Dentist · AvailabilityBlock · BlockedSlot      │
        │ TreatmentType · Patient · Appointment          │
        │ NotificationLog · AuditLog                     │
        └───────────────────────────────────────────────┘
        ┌──────────────┐         ┌────────────────────┐
        │ WhatsApp API │         │ Email transaccional│
        └──────────────┘         └────────────────────┘
```

**Decisiones de alto nivel:**
- **Un solo deploy** — la prioridad es velocidad de entrega (ver `DD-03`).
- **Slots calculados, no persistidos** — la disponibilidad se deriva al vuelo
  desde los bloques menos los turnos y bloqueos (ver `DD-05`).
- **Integridad en la base** — la no-superposición de turnos se garantiza con un
  *exclusion constraint* de Postgres, no solo con código de aplicación.

## Integraciones externas

| Servicio | Propósito | Tipo | Rol |
|---|---|---|---|
| WhatsApp Business Cloud API | Recordatorio y confirmación al paciente | REST + webhook | Principal |
| Proveedor de email | Recordatorio de respaldo | REST / SMTP | Secundario |
| Cron del host | Disparar la auto-liberación de turnos | Scheduler | Interno |

## Superficie interna (route handlers / server actions)

No hay API pública documentada en la v1.

| Recurso | Operaciones |
|---|---|
| `/api/auth` | login, logout, sesión |
| `/api/availability` | leer / crear / editar bloques y bloqueos |
| `/api/treatment-types` | CRUD del catálogo (soft delete) |
| `/api/slots` | consulta pública de disponibilidad |
| `/api/appointments` | crear (público, rate-limited), confirmar (por token), cancelar, reprogramar |
| `/api/patients` | alta / edición de ficha, historial |
| `/api/webhooks/whatsapp` | estados de entrega/lectura y respuestas entrantes |
| `/api/jobs/release-stale` | dispara la auto-liberación (endpoint protegido) |
