# Recordatorios y Mensajería

> Archivo complementario. El recordatorio y la confirmación son el corazón
> operativo del sistema: es lo que le saca al odontólogo el trabajo de confirmar
> turno por turno.

## Canales

| Canal | Rol | Cuándo se usa |
|---|---|---|
| **WhatsApp** (Business Cloud API) | **Principal** | Siempre, en el recordatorio inicial y en avisos de cancelación/reprogramación |
| **Email** | Respaldo opcional | Solo si el paciente dejó un email |

Reglas: `RN-CON-01`, `RN-CON-02`.

## Por qué WhatsApp

- Es el canal que el paciente argentino ya usa a diario; no requiere instalar ni
  aprender nada.
- El hallazgo de mercado reencuadró el riesgo de adopción: no es "hacer que el
  paciente use un portal", es **llevar el recordatorio a la app donde ya vive**
  (`DD-02`).
- El **teléfono es obligatorio** en la reserva (`RN-RES-02`) porque es la llave
  del canal principal.

## Tipos de mensaje (`NotificationKind`)

| Kind | Disparador | Contenido |
|---|---|---|
| `REMINDER` | Job programado, con antelación al turno | Tratamiento, fecha/hora, enlace para confirmar |
| `CONFIRMATION` | El paciente confirma | Acuse de confirmación |
| `CANCELLATION` | El odontólogo cancela/reprograma | Aviso del cambio (`RN-CAN-04`) |
| `RELEASE_NOTICE` | Job de auto-liberación | Aviso de que el turno no confirmado se liberó |

> Los mensajes se envían como **plantillas aprobadas** en la Cloud API (política
> de Meta para mensajes iniciados por el negocio).

## Estados de entrega (`NotificationStatus`)

```
QUEUED ──▶ SENT ──▶ DELIVERED ──▶ READ
              │
              └──▶ FAILED
```

- El resultado se actualiza vía **webhook** de WhatsApp (`/api/webhooks/whatsapp`).
- Cada envío y cada cambio de estado se registran en `NotificationLog`
  (`RN-CON-06`).

## Flujo de reintento (propuesta, sujeta a `PA-02`)

1. Primer intento: al momento del recordatorio programado.
2. Si `FAILED`, reintento con espaciado (p. ej. 2 intentos más).
3. Si el mensaje **nunca** se entrega por ningún canal, aplica `RN-CON-05`: el
   turno se **autoconfirma** y queda **marcado** para el odontólogo (no se
   libera un turno que el paciente no pudo ver).

## Costo

- La **Cloud API de Meta** cobra por conversación (con ventana de 24 h).
- El costo lo absorbe el consultorio (`SU-03`).
- Implicación de diseño: minimizar mensajes innecesarios; agrupar
  recordatorio + enlace de confirmación en un mismo mensaje.

## Consentimiento y opt-in

- El paciente deja su teléfono al reservar: eso habilita el envío del
  recordatorio de **ese** turno.
- El número del consultorio debe estar dado de alta como **WhatsApp Business**.
- La información enviada se limita al turno (`RN-DAT-04`, mínimo dato): no se
  incluyen datos clínicos por WhatsApp.

## Elección de proveedor

| Opción | Pros | Contras |
|---|---|---|
| **Meta Cloud API directo** | Menor costo, control total | Más trabajo de integración y alta |
| **BSP** (Twilio, 360dialog, etc.) | Onboarding más simple, herramientas | Costo por encima de Meta |

> Decisión pendiente de cerrar al implementar (`PA-02` / decisión de
> infraestructura).
