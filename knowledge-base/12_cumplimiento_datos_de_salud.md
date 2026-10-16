# Cumplimiento de Datos de Salud

> Archivo complementario. El sistema maneja **datos personales sensibles**
> (datos de salud) y por lo tanto cae bajo el régimen de protección de datos
> personales de la **Ley 25.326** (Argentina) y, en lo relativo a la historia
> clínica, la **Ley 26.529** de derechos del paciente.

## Marco aplicable

| Norma | Qué regula | Cómo aplica acá |
|---|---|---|
| **Ley 25.326** | Protección de datos personales; datos sensibles | Telefóno, email y cualquier dato asociado al turno son datos personales; los de salud son sensibles |
| **Ley 26.529** | Derechos del paciente / historia clínica | Aplica cuando se incorpore la historia clínica (backlog); confidencialidad ya rige para la ficha |

## Principios aplicados

- **Mínimo dato** (`RN-DAT-04`) — solo se recolecta lo necesario para gestionar
  el turno: nombre, teléfono, email opcional.
- **Consentimiento** — el paciente aporta sus datos al reservar, para la gestión
  de ese turno.
- **Finalidad** — los datos se usan para la agenda y el recordatorio, nada más.
- **Confidencialidad** — acceso restringido al odontólogo autenticado
  (`RN-AUT-01`).

## Medidas técnicas

| Medida | Implementación |
|---|---|
| Cifrado en tránsito | HTTPS/TLS (`RN-DAT-03`) |
| Cifrado en reposo | A cargo del Postgres gestionado (proveedor con DPA — `DD-08`) |
| Control de acceso | Un rol autenticado; el paciente solo ve su turno por token |
| Tokens no adivinables | ≥ 128 bits (`RN-AUT-02`) |
| Auditoría | `AuditLog` append-only en cada acceso a datos de paciente (`RN-DAT-01/02`) |
| Backups | Respaldos gestionados por el proveedor |

## Encargado de tratamiento / DPA

- El proveedor de hosting y de base de datos actúa como **encargado de
  tratamiento**: debe firmarse un **DPA** (`DD-08`).
- La mensajería (WhatsApp/email) también procesa datos de contacto: verificar
  términos y DPA de los proveedores.
- **Regla de diseño:** no se envían **datos clínicos** por WhatsApp ni por email;
  solo datos del turno (`11_recordatorios_y_mensajeria.md`).

## Derechos del titular

| Derecho | Cómo se atiende en v1 |
|---|---|
| **Acceso** | El odontólogo puede exportar/mostrar la ficha del paciente |
| **Rectificación** | Edición de la ficha (US-013) |
| **Supresión** | Baja de la ficha a pedido (proceso manual asistido) |
| **Información** | Se informa la finalidad al reservar |

> La v1 no incluye autoservicio del titular: los pedidos se atienden a través
> del odontólogo como responsable del tratamiento.

## Retención

- Pendiente de definir la política concreta (`PA-06`). Recomendación inicial:
  conservar los datos mientras exista relación con el paciente y por el plazo
  de prescripción aplicable, y luego anonimizar o eliminar.

## Brechas (features de compliance fuera de la v1)

- Historia clínica / odontograma (Ley 26.529 con más profundidad).
- Portal de autoservicio del titular para ejercer derechos.
- Registro de consentimiento explícito y versionado.
- Reporte de incidentes de seguridad.

Estas brechas quedan documentadas para el roadmap, no bloquean la v1 porque el
sistema todavía no aloja historia clínica.
