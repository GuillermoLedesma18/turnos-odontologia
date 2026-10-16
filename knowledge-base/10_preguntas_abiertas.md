# Preguntas Abiertas

## Inconsistencias detectadas (IN)

| ID | Descripción | Impacto | Estado |
|---|---|---|---|
| **IN-01** | El contrato de estado registra `scale = single_user`, pero el sistema tiene tráfico **público anónimo** de pacientes (sin autenticar). | Bajo — es una imprecisión de clasificación, no un problema de diseño. | Abierta |
| **IN-02** | El Discovery menciona la "ficha básica" y a la vez la historia clínica como backlog: no está escrito explícitamente que la ficha **no** es un dato clínico. | Bajo — se aclaró en `RN-PAC-02` (la ficha es básica, sin datos clínicos). | Resuelta por la KB |

## Preguntas priorizadas (PA)

### Prioridad alta
- **PA-01** — ¿Hay una **anticipación mínima para reservar** (distinta de la de
  cancelar, que no existe)? Hoy un paciente podría reservar un turno para dentro
  de 5 minutos si el slot está libre.
  *Decide:* `RN-RES`, configuración de reserva.

### Prioridad media
- **PA-02** — ¿Cuál es la **política de reintentos** si un envío de WhatsApp
  falla (cuántos intentos, con qué espaciado)? Afecta `RN-CON-06` y el costo.
- **PA-03** — ¿A qué **hora del día** corre el job de auto-liberación y con qué
  frecuencia? Afecta la precisión del margen de 24 h (`RN-CON-04`).
- **PA-04** — ¿Se permite que un paciente **reserve para otra persona**
  (un familiar) sin cambiar el teléfono? Afecta el modelo de `Patient`.
- **PA-05** — ¿Hay política de **no-show** (límite de ausencias, bloqueo de
  pacientes reincidentes)? Relacionado con el estado `NO_SHOW`.

### Prioridad baja
- **PA-06** — ¿Cuál es la **política de retención** de datos (cuánto tiempo se
  guardan) según Ley 25.326?
- **PA-07** — ¿Se migrarán los pacientes existentes de la planilla, o el sistema
  arranca vacío y los turnos nuevos crean las fichas (`DD-10`)?
- **PA-08** — ¿El consultorio tiene un **nombre/dirección** que deba mostrarse al
  paciente en la reserva y en el recordatorio?

## Cómo se resuelven

Las preguntas de prioridad alta deberían cerrarse **antes** de implementar la
épica correspondiente. Las de prioridad media y baja pueden resolverse durante el
desarrollo, documentando la respuesta en este archivo y, si cambia una regla, en
`05_reglas_de_negocio.md`.
