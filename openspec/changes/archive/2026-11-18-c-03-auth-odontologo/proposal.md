# Proposal

## Why

C-02 dejó el modelo de datos, la migración, el seed y una base de tests aislada, pero **no existe ninguna forma de autenticar al odontólogo**. Hoy todas las rutas de la aplicación son públicas por omisión: no hay login, no hay sesión, no hay guardas en páginas ni en Route Handlers y no hay registro de eventos de autenticación. Sin C-03, los changes que dependen de un área privada —`C-04 audit-log`, `C-05 treatment-catalog`, `C-06 availability-management`, `C-10 dentist-agenda`, `C-12 patient-record`— no pueden proteger sus datos ni cumplir `RN-AUT-01`/`RN-AUT-04`.

C-03 es el segundo change del camino crítico de `CHANGES.md` y cierra `GATE 2`. Su valor no es solo “agregar un formulario de login”: es fijar de una vez **cómo se representa y se invalida una sesión**, **dónde se verifica** (servidor, nunca solo en la UI) y **qué queda auditado**, para que los changes posteriores hereden un contrato único en lugar de inventar guardas incompatibles. También resuelve la deuda que C-02 dejó abierta: evaluar `AuditAction.LOGIN` y decidir cómo se integra la auditoría de autenticación con el append-only que implementará C-04.

## What Changes

- **Sesión persistida en PostgreSQL**: nuevo modelo `DentistSession` con token opaco de 256 bits; en la base se guarda **solo el hash SHA-256** del token, nunca el token en claro. La sesión se valida contra la base en cada request autenticada, expira a los 30 minutos de inactividad, tiene un tope absoluto de 12 horas y se revoca al cerrar sesión. Se permiten varias sesiones simultáneas del mismo odontólogo; el logout revoca solo la sesión presentada.
- **Migración 002 generada por Prisma**: tabla `DentistSession`, FK a `Dentist` con `Cascade`, índice de la FK e índice para la limpieza por expiración; y los nuevos valores `LOGIN`, `LOGIN_FAILED` y `LOGOUT` del enum `AuditAction`. Sin SQL manual y sin comandos destructivos (regla C9).
- **Verificación de contraseña con Argon2id**: se reutiliza `@node-rs/argon2@2.2.2` y el hash generado por el seed de C-02. No se cambian parámetros ni se agrega otra biblioteca de hashing. Un hash inválido se trata como credencial inválida, sin romper el endpoint ni filtrar el hash.
- **Login, logout y consulta de sesión**: `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/me`, con validación Zod en el borde, respuestas genéricas que no revelan si el email existe, y cookies `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en producción y expiración acorde a la sesión. `/api/auth/me` devuelve solo `id`, `fullName` y `email`; no incluye `phone` ni datos de sesión.
- **Protección de páginas y endpoints**: middleware **optimista** que solo redirige cuando falta la cookie; guarda de sesión en el layout del grupo privado y verificación independiente al inicio de cada Route Handler privado. Ocultar un botón o confiar solo en el middleware **no** se considera autorización.
- **Página `/login` mobile-first** y un área privada mínima en `/agenda` para completar el ciclo login → área privada → logout. La agenda funcional sigue siendo de C-10; C-03 solo deja el placeholder protegido y el botón de logout.
- **Auditoría de autenticación**: `LOGIN` al crear una sesión, `LOGIN_FAILED` cuando falla una credencial de una cuenta existente y `LOGOUT` al revocar. Se registran actor, acción, entidad, identificador e IP; nunca contraseña, hash, token, cookie, email ni nombre. C-03 solo hace `INSERT`: el append-only sigue siendo de C-04.
- **Protecciones mínimas**: misma respuesta de credenciales inválidas y verificación Argon2id también para emails inexistentes mediante un hash ficticio (sin prometer igualdad exacta de tiempos), límite de 5 fallos por IP cada 15 minutos en memoria (defensa en profundidad, no garantía distribuida) con limpieza de entradas expiradas y un máximo de entradas para acotar la memoria, verificación de `Origin` y `Content-Type` en los endpoints que cambian estado, token nuevo en cada login, `next` saneado contra redirecciones abiertas y limpieza oportunista de sesiones expiradas. Los headers de IP solo se consideran confiables cuando los establece un proxy controlado por la infraestructura; no se usan para autorizar.
- **Tests sobre la base aislada de C-02**: unitarios de token, contraseña, expiración, rate limit (incluida la limpieza de entradas y el límite de capacidad) y redirecciones; integración de login, logout, `/me`, cookie, sesión expirada/revocada/manipulada, protección de página y endpoint, y auditoría. Los tests de enumeración comparan mismo estado y mismo cuerpo genérico, y comprueban que se ejecuta una verificación Argon2id en ambos caminos; no exigen igualdad exacta de tiempos. Sin mocks de base y sin tocar la base de desarrollo.
- **Sin dependencias nuevas**: se usan Next.js 14, Prisma 7, Zod, `@node-rs/argon2` y `node:crypto`, ya presentes. No se agrega Auth.js, JWT ni una biblioteca de sesiones.

## Capabilities

### New Capabilities

- `dentist-auth`: el contrato observable de autenticación del único usuario — verificación de credenciales, creación y persistencia de sesión, expiración por inactividad y tope absoluto, cookie segura, logout, revocación, rotación de token y resistencia básica a fuerza bruta y enumeración de usuarios.
- `auth-route-protection`: el contrato de acceso a la superficie privada — qué páginas y endpoints exigen sesión, cómo se redirige al login, cómo se evita el acceso por navegación directa y por qué el middleware es solo una optimización y no la frontera de autorización.
- `auth-audit`: el contrato de trazabilidad de los eventos de autenticación — qué se registra, con qué actor/acción/entidad/IP, qué datos están prohibidos y cómo se integra con el append-only de `AuditLog` que implementará C-04.

### Modified Capabilities

- `data-model`: se agrega la entidad de persistencia `DentistSession` (con su migración, FK, unicidad e índices) y se amplía `AuditAction` con `LOGIN`, `LOGIN_FAILED` y `LOGOUT`. Los ocho modelos de dominio de C-02 no cambian de forma.

## Impact

- **Esquema y datos**: `prisma/schema.prisma` (modelo `DentistSession`, relación `Dentist.sessions`, valores de `AuditAction`) y una migración nueva `prisma/migrations/<timestamp>_auth_sessions/migration.sql`. No se modifica la Migración 001 ni el change archivado C-02.
- **Código nuevo**: `src/server/auth/` (token, contraseña, sesión, guardas, rate limit, auditoría, validación), `src/app/api/auth/{login,logout,me}/route.ts`, `src/app/(auth)/login/page.tsx` + formulario cliente, `src/app/(app)/layout.tsx`, `src/app/(app)/agenda/page.tsx` (placeholder), `src/components/auth/` y `src/middleware.ts`.
- **Configuración**: no se agregan variables de entorno. `SESSION_SECRET` **no se consume** en C-03 porque la cookie es un token opaco validado contra la base, no una cookie firmada; se documenta como deuda a resolver en C-16 (eliminarla o darle otro uso). `NODE_ENV` se usa solo para decidir `Secure`, con la misma excepción ya documentada por C-01.
- **Superficie expuesta**: tres endpoints de autenticación y la página `/login`. Las rutas privadas existentes y futuras quedan detrás de la guarda; las rutas públicas de `03_actores_y_roles.md` (`/`, `/reservar`, `/turno/[token]`, `/api/health`, `/api/slots`, `POST /api/appointments`, `/api/webhooks/whatsapp`) no se bloquean.
- **Tests**: nuevos archivos unitarios e de integración sobre `TEST_DATABASE_URL`; se actualiza el helper de limpieza para borrar sesiones antes del odontólogo. La suite sigue serializada y sin mocks de base.
- **Documentación**: `README.md` (credencial de desarrollo, login/logout, política de cookie y expiración, rate limit, rutas protegidas, límites y deuda de C-04/C-16). `CHANGES.md` se actualiza recién al archivar C-03, no en esta etapa de planificación.
- **Advertencia de despliegue**: `dev-only-password` es una credencial exclusivamente de desarrollo y el seed no es un mecanismo de aprovisionamiento. **No se puede desplegar el sistema con la credencial del seed.** El aprovisionamiento seguro de la credencial de producción y el cambio/recuperación de contraseña quedan fuera de C-03 y se registran como deuda de roadmap.
- **Dependencias**: ninguna nueva. No se actualiza Next.js, Prisma, Argon2 ni Zod.
- **Desviaciones explícitas de la KB**:
  - `03_actores_y_roles.md` lista `/login` entre las “rutas protegidas”. Se interpreta como errata: el login es público por definición y, si hay sesión válida, redirige a `/agenda`. Se documenta en `design.md` y se propone corregir la KB en un change documental.
  - `08_arquitectura_propuesta.md` propone una única `api/auth/route.ts`; `CHANGES.md` C-03 especifica `login`, `logout` y `me`. Se sigue `CHANGES.md`, que es el contrato operativo del roadmap.
  - `08_arquitectura_propuesta.md` describe `SESSION_SECRET` como “firma de la cookie de sesión”; con sesión persistida y token opaco no hay firma que verificar. Se documenta la decisión y no se inventa un uso.
- **Fuera de alcance**: registro público, autenticación de pacientes, cambio/recuperación de contraseña, aprovisionamiento de la credencial de producción, MFA, gestión de dispositivos o cierre de todas las sesiones desde la UI, rate limiting distribuido, `__Host-` y headers de seguridad (C-16), append-only de `AuditLog` (C-04), y la agenda funcional (C-10).
- **Impacto en el roadmap**: al completarse y archivarse, cierra `GATE 2` y habilita en paralelo `C-04 audit-log`, `C-05 treatment-catalog` y `C-06 availability-management`.
