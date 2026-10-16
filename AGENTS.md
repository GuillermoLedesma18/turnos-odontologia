# Turnos Odontología — Instrucciones para Agentes

> Este archivo (y su copia `CLAUDE.md`) es lo PRIMERO que todo agente lee al entrar al repo.
> Generado a partir de `knowledge-base/` y `CHANGES.md`. No editar a mano sin re-sincronizar ambos archivos.

---

## Stack Tecnológico

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

Detalle completo: [knowledge-base/02_descripcion_general.md](knowledge-base/02_descripcion_general.md)

---

## Base de Conocimiento

La fuente de verdad del dominio vive en `knowledge-base/`. **Leé el archivo relevante ANTES de implementar.**

| Archivo | Cuándo leerlo |
|---------|---------------|
| [README.md](knowledge-base/README.md) | Índice, resumen ejecutivo y convenciones de códigos |
| [01_vision_y_objetivos.md](knowledge-base/01_vision_y_objetivos.md) | Alcance v1, objetivos por actor y métricas |
| [02_descripcion_general.md](knowledge-base/02_descripcion_general.md) | Stack, arquitectura general, superficie interna |
| [03_actores_y_roles.md](knowledge-base/03_actores_y_roles.md) | Odontólogo/Paciente, RBAC, rutas públicas y protegidas |
| [04_modelo_de_datos.md](knowledge-base/04_modelo_de_datos.md) | Entidades, ERD, enums, constraint anti-solapamiento, seed |
| [05_reglas_de_negocio.md](knowledge-base/05_reglas_de_negocio.md) | Reglas codificadas `RN-*` y trazabilidad con historias |
| [06_funcionalidades.md](knowledge-base/06_funcionalidades.md) | 7 épicas y 16 historias `US-NNN` con criterios de aceptación |
| [07_flujos_principales.md](knowledge-base/07_flujos_principales.md) | Flujos E2E `F1..F6` (reserva, confirmación, auto-liberación) |
| [08_arquitectura_propuesta.md](knowledge-base/08_arquitectura_propuesta.md) | Estructura de directorios, seguridad, variables de entorno |
| [09_decisiones_y_supuestos.md](knowledge-base/09_decisiones_y_supuestos.md) | Decisiones `DD-01..10` y supuestos `SU-01..05` |
| [10_preguntas_abiertas.md](knowledge-base/10_preguntas_abiertas.md) | ⚠️ Inconsistencias `IN-*` y preguntas abiertas `PA-*` |
| [11_recordatorios_y_mensajeria.md](knowledge-base/11_recordatorios_y_mensajeria.md) | WhatsApp Cloud API, plantillas, estados, reintentos, costo |
| [12_cumplimiento_datos_de_salud.md](knowledge-base/12_cumplimiento_datos_de_salud.md) | Ley 25.326 / 26.529, cifrado, auditoría, retención, DPA |

> ⚠️ **`PA-01` (prioridad alta) está abierta**: no hay anticipación mínima para reservar. Cerrala antes de implementar la épica de reserva (`C-08`). Las `PA-02..PA-08` pueden resolverse durante el desarrollo, documentando la respuesta en `10_preguntas_abiertas.md`.

---

## Skills Disponibles

Fuente de verdad: [`.atl/skill-registry.md`](.atl/skill-registry.md) (generado por `skill-registry`). Esta tabla solo mapea skill → rol.

| Agente | Rol | Skills que carga |
|--------|-----|------------------|
| **Núcleo / Datos** | Modelos Prisma, migraciones, integridad y tuning de Postgres | `prisma-cli`, `prisma-client-api`, `supabase-postgres-best-practices` |
| **Infra de datos** | Provisionar/conectar la base y configurar variables de entorno | `prisma-postgres-setup` |
| **Frontend** | UI Next.js/React mobile-first (RSC, server actions, performance) | `vercel-react-best-practices` |
| **Integraciones** | WhatsApp, email, webhooks y jobs dentro del monolito Next.js | `vercel-react-best-practices`, `supabase-postgres-best-practices` |

Cargá la skill correspondiente al contexto ANTES de escribir código.

> Los compact rules de cada skill los resuelve el orquestador desde `.atl/skill-registry.md` (generado por `skill-registry`; no versionado — no está en el repo). Esta tabla solo mapea skill → rol.

---

## Roadmap de Changes

El plan de implementación completo está en [CHANGES.md](CHANGES.md). Resumen:

- **Total**: 16 changes en 7 fases (`C-01..C-16`).
- **Camino crítico** (9 changes): `C-01 → C-02 → C-03 → C-05 → C-07 → C-08 → C-13 → C-14 → C-15`.
- **Primer change**: `C-01 foundation-setup` (governance BAJO) — scaffolding del monolito, Prisma contra Postgres 15, `lib/env.ts` con Zod, `GET /api/health`, ESLint + Prettier + CI.
- **Gates**: 10 puntos de sincronización; el primer fork es `GATE 3` (`C-04` / `C-05` / `C-06` en paralelo).
- **Cuello de botella**: pasos 5–6 del plan de 3 agentes (`C-07` y `C-08` son secuenciales y no desbloquean paralelismo hasta `GATE 6`).

**Antes de cualquier `/opsx:propose`**: leé [CHANGES.md](CHANGES.md), identificá las dependencias del change y sus archivos de "Leer antes".

---

## Reglas Duras

> No hay instrucciones globales de proyecto en este entorno (`~/.claude/CLAUDE.md` no existe). La única herencia global es la orquestación/delegación de OpenCode (agente `sdd-orchestrator`, en `~/.config/opencode/opencode.json`), que no se repite acá. Todo lo demás —incluidas las reglas universales— vive en este archivo.

Son contrato: romperlas es un defecto. Formato `NUNCA X → hacer Y`.

### A. TypeScript / Next.js (App Router)

1. NUNCA `any` ni `as any` → `tsconfig` con `strict` y tipos explícitos.
2. NUNCA poner lógica de dominio en componentes/RSC → vive en `src/server/` (agenda, reservas, slots).
3. NUNCA llamar Prisma desde un Client Component → solo desde RSC, server actions o route handlers.
4. NUNCA autorizar solo por middleware/layout → verificar la sesión DENTRO de cada server action y route handler.
5. NUNCA pasar al cliente más campos de los que la UI usa → evitar sobre-serialización y sobre-fetch.

### B. Validación y entorno

6. NUNCA procesar input de usuario ni webhooks sin parsear con Zod → validar en cada borde (action, route, webhook).
7. NUNCA leer variables de entorno sin validar → `lib/env.ts` con Zod; `.env` git-ignored; `.env.example` completo.
8. NUNCA exponer secretos al cliente → `DATABASE_URL`, tokens de WhatsApp y credenciales solo en server.

### C. Prisma / PostgreSQL

9. NUNCA escribir migraciones a mano → `prisma migrate dev --name <x>`; en CI/producción `prisma migrate deploy`.
10. NUNCA correr comandos destructivos (`migrate reset`, `db push --force-reset`, `db push --accept-data-loss`) sin consentimiento explícito del usuario en el momento.
11. NUNCA confiar solo en el código para la no-superposición de turnos → garantizarla en la base (`EXCLUDE USING gist` + `btree_gist` sobre `tstzrange`, solo estados vivos).
12. NUNCA crear una FK sin índice en la columna referenciante → Postgres no indexa las FKs automáticamente.
13. NUNCA `timestamp` sin zona → `timestamptz`; dinero en `numeric`; PKs `bigint` o uuid.

### D. Testing

14. NUNCA mockear la base de datos en tests de integración → Postgres real (Docker Compose): la integridad crítica vive en la DB.
15. NUNCA mergear con `lint`, `typecheck` o `test` en rojo → los scripts de `C-01` son la puerta.
16. TDD obligatorio en la lógica de dominio → cubrir `C-07` (slot-engine), `C-15` (auto-liberación) y las transiciones de estado de `C-11`.

### E. Datos de salud (Ley 25.326)

17. NUNCA loggear PII ni datos de paciente → logs y errores sin nombre, teléfono ni motivo de consulta.
18. NUNCA guardar datos clínicos → la ficha es básica (`RN-PAC-02`); la historia clínica está fuera de alcance.
19. NUNCA enviar datos de salud por WhatsApp o email → solo lo mínimo del turno (nombre, fecha/hora, tratamiento genérico).

### F. Proceso

20. NUNCA commitear ni buildear sin que el usuario lo pida.
21. NUNCA agregar co-autoría IA en los commits → conventional commits sin `Co-Authored-By`.
22. NUNCA commitear secretos, `.env` ni credenciales.

---

## Flujo de Trabajo

```
1. Leer la KB relevante (knowledge-base/)        → entender el dominio
2. Identificar el change en CHANGES.md           → respetar dependencias y gates
3. /opsx:propose C-NN-nombre                     → proposal + design + specs + tasks
4. Implementar las tasks (cargando skills)       → respetando las reglas duras
5. /opsx:archive C-NN-nombre + marcar [x]        → cerrar el change
```

Aplicar TODAS las reglas duras en cada paso. Ante conflicto entre la KB y este archivo, las reglas duras prevalecen.
