# Arquitectura Propuesta

## Estilo arquitectónico

**Monolito full-stack modular** en Next.js (App Router). Un solo artefacto de
deploy; la lógica de dominio se aísla del transporte y de la vista. No hay
microservicios ni capa de API pública en la v1 (ver `DD-03`).

```
┌──────────────────────────────────────────────────────┐
│                     Next.js (un deploy)               │
│                                                       │
│  app/                    UI (RSC + Client Components) │
│   ├─ (public)/reservar/                               │
│   ├─ (public)/turno/[token]/                          │
│   ├─ (auth)/login/                                    │
│   └─ (app)/agenda/ · /tratamientos · /pacientes ·     │
│                                                       │
│  app/api/…               Route handlers (transporte)   │
│  server/                 Dominio (reglas de negocio)   │
│   ├─ availability/  slots/                            │
│   ├─ appointments/  (reservar, confirmar, cancelar…)  │
│   ├─ patients/  treatment-types/                      │
│   ├─ messaging/  (whatsapp, email)                    │
│   └─ audit/                                           │
│  lib/                    Utilidades (zod, fechas, tel) │
│  prisma/                 schema + migraciones         │
└──────────────────────────────────────────────────────┘
```

**Principios**
- **El dominio no conoce HTTP.** Los route handlers / server actions traducen y
  delegan en `server/`.
- **Validación en los bordes con Zod**, tipada de punta a punta.
- **La integridad crítica vive en la base** (`RN-AGE-01`), no solo en el código.

## Estructura de directorios (propuesta)

```
prisma/
  schema.prisma
  migrations/
  seed.ts
src/
  app/
    (public)/reservar/page.tsx
    (public)/reservar/confirmacion/page.tsx
    (public)/turno/[token]/page.tsx
    (auth)/login/page.tsx
    (app)/agenda/page.tsx
    (app)/agenda/semana/page.tsx
    (app)/agenda/disponibilidad/page.tsx
    (app)/tratamientos/page.tsx
    (app)/pacientes/page.tsx
    (app)/pacientes/[id]/page.tsx
    api/
      auth/route.ts
      availability/route.ts
      treatment-types/route.ts
      slots/route.ts
      appointments/route.ts
      patients/route.ts
      webhooks/whatsapp/route.ts
      jobs/release-stale/route.ts
  server/
    availability/  slots/  appointments/  patients/
    treatment-types/  messaging/  audit/
  lib/
    auth.ts  validation.ts  datetime.ts  phone.ts  tokens.ts
  components/
    ui/  agenda/  reserva/
```

## Seguridad

| Aspecto | Decisión |
|---|---|
| Autenticación (odontólogo) | Sesión en cookie `httpOnly` + `SameSite`; hash **argon2** (`RN-AUT-04`) |
| Autenticación (paciente) | **Token de turno** no adivinable (≥128 bits); sin credenciales (`RN-AUT-02`) |
| Autorización | Un rol autenticado; el token habilita lectura + confirmar (`RN-AUT-03`) |
| Validación de entrada | Zod en cada borde |
| Anti-abuso | *rate limit* en `/api/slots` y `POST /api/appointments` (`RN-RES-04`) |
| Webhooks | Verificación de firma de WhatsApp antes de procesar |
| Secretos | Variables de entorno; nunca en el repo |
| Transporte | HTTPS/TLS (`RN-DAT-03`) |
| Cifrado en reposo | A cargo del Postgres gestionado (`RN-DAT-03`) |
| Auditoría | `AuditLog` append-only en cada acceso a datos de paciente (`RN-DAT-01/02`) |

## Integración con WhatsApp

- **WhatsApp Business Cloud API (Meta)** como canal principal (`RN-CON-01`).
- Envíos vía *message templates* aprobadas (recordatorio, confirmación,
  cancelación).
- **Webhook** para estados de entrega/lectura y respuestas entrantes
  (`NotificationStatus`).
- Detalle operativo (plantillas, reintentos, costos) en
  `11_recordatorios_y_mensajeria.md`.

## Job de auto-liberación

- Endpoint protegido `/api/jobs/release-stale`, disparado por el **cron del
  host**.
- Selecciona turnos `PENDING_CONFIRMATION` a ≤ 24 h de su inicio y aplica
  `RN-CON-04` / `RN-CON-05`.
- **Idempotente**: ejecutarlo dos veces no produce efectos duplicados.

## Variables de entorno (referencia)

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `SESSION_SECRET` | Firma de la cookie de sesión |
| `APP_BASE_URL` | Generación de enlaces del turno |
| `WHATSAPP_TOKEN` | Token de la Cloud API |
| `WHATSAPP_PHONE_ID` | Número emisor |
| `WHATSAPP_VERIFY_TOKEN` | Verificación del webhook |
| `WHATSAPP_APP_SECRET` | Validación de firma |
| `EMAIL_API_KEY` / `EMAIL_FROM` | Proveedor de email (respaldo) |
| `CRON_SECRET` | Protección del job de liberación |
| `TZ_CONSULTORIO` | Zona horaria local (`America/Argentina/*`) |

## Entornos

| Entorno | Propósito |
|---|---|
| Local | Desarrollo; Postgres local; mensajería en modo *sandbox* |
| Staging | Validación con datos de prueba |
| Producción | Consultorio real |

## Observabilidad (mínima)

- Logs estructurados de errores y de envíos de mensajería.
- `NotificationLog` como fuente operativa para diagnosticar entregas.
- Sin APM ni métricas avanzadas en la v1.
