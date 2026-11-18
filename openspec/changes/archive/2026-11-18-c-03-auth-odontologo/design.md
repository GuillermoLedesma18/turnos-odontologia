# Design

## Context

C-02 quedó archivado con el modelo de datos completo, la Migración 001, el seed idempotente y una suite de integración contra PostgreSQL real aislada por `TEST_DATABASE_URL`. El punto de partida verificable para C-03 es:

- `prisma/schema.prisma` declara `Dentist` (con `email` único y `passwordHash`) y `AuditLog` (con `AuditAction`), entre otras entidades.
- `prisma/seed.ts` crea el odontólogo de desarrollo `odontologo@example.com` con un hash Argon2id de `dev-only-password` (memoria 19456 KiB, tiempo 2, paralelismo 1, salida 32 bytes). El hash se genera solo al crear; no se regenera.
- `src/lib/env.ts` valida el entorno con Zod; `src/lib/prisma.ts` expone el singleton con `PrismaPg`. No hay autenticación, sesiones, middleware ni páginas privadas.
- `tests/setup.ts` es el único `setupFiles`, valida la separación real entre `DATABASE_URL` y `TEST_DATABASE_URL`, y reemplaza la primera por la segunda antes de importar código de aplicación. `vitest.config.mts` serializa los archivos (`fileParallelism: false`).
- No hay Auth.js, JWT, biblioteca de sesiones ni React Testing Library. Las dependencias relevantes ya instaladas son Next.js `14.2.35`, Prisma `7.10.1`, Zod `^3.25.76` y `@node-rs/argon2` `2.2.2`.
- C-02 está archivado y versionado en el repositorio. C-03 no modifica su archivo ni su código.

Restricciones que moldean el diseño:

- **Regla dura A4**: la autorización no puede depender solo del middleware ni del layout; cada Route Handler y cada Server Action debe verificar la sesión por su cuenta.
- **Regla dura B6**: todo input de usuario se valida con Zod en el borde.
- **Regla dura C9**: las migraciones se generan con Prisma; no se escriben a mano. C-03 no necesita SQL manual.
- **Regla dura C12**: toda FK debe tener índice en la columna referenciante.
- **Regla dura C13**: instantes en `timestamptz`; nada de `timestamp` sin zona.
- **Regla dura E17**: no se registran datos personales ni secretos en logs.
- **`RN-AUT-01`**: el único usuario autenticado es el odontólogo. **`RN-AUT-04`**: cookie `httpOnly` + `SameSite` y expiración por inactividad. **`RN-AUT-02/03`** (token de turno del paciente) no se tocan en C-03.
- **Entorno de tests**: la suite no debe operar sobre la base de desarrollo. Los tests de C-03 usan la infraestructura de C-02 sin relajarla.

### Contradicciones y erratas detectadas

| Fuente | Problema | Resolución para C-03 |
|---|---|---|
| `knowledge-base/03_actores_y_roles.md` §Rutas protegidas | Lista `/login` como ruta que “requiere sesión activa”. Un login protegido es un ciclo imposible. | Se interpreta como errata: `/login` es **pública**; si hay sesión válida, redirige a `/agenda`. Se propone corregir la KB en un change documental, fuera de C-03. |
| `knowledge-base/08_arquitectura_propuesta.md` §Estructura | Propone una única `api/auth/route.ts`. | `CHANGES.md` C-03 especifica `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/auth/me`. Se sigue el roadmap, que es el contrato operativo. |
| `knowledge-base/08_arquitectura_propuesta.md` §Variables | Describe `SESSION_SECRET` como “firma de la cookie de sesión”. | Con una sesión persistida y un token opaco, la cookie no se firma: se valida contra la base. `SESSION_SECRET` no se consume en C-03 (D15). |
| `CHANGES.md` C-03 | Incluye “Hash de la credencial del `Dentist` del seed”. | Ya quedó implementado en C-02. C-03 **reutiliza** ese hash; no lo regenera ni cambia parámetros. |
| `knowledge-base/10_preguntas_abiertas.md` | No hay valor definido para la expiración por inactividad de `RN-AUT-04`. | Quedan confirmados 30 minutos de inactividad y 12 horas de tope absoluto (D3). |

### Decisiones confirmadas en la revisión humana

| # | Decisión | Sección |
|---|---|---|
| 1 | Sesión persistida en PostgreSQL con token opaco y hash SHA-256, no cookie firmada ni JWT | D1, D2 |
| 2 | Modelo `DentistSession` con `tokenHash` único, `createdAt`, `lastUsedAt`, `expiresAt` y `revokedAt` | D2 |
| 3 | Expiración por inactividad de 30 min y tope absoluto de 12 h; renovación deslizante con escritura acotada cada 5 min | D3 |
| 4 | Cookie `turnos_session` `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` en producción, `Max-Age` de 12 h | D4 |
| 5 | `AuditAction` suma `LOGIN`, `LOGIN_FAILED` y `LOGOUT` | D8 |
| 6 | `LOGIN_FAILED` se audita solo cuando el email corresponde a una cuenta existente; los intentos con email inexistente no se auditan | D8 |
| 7 | Rate limit de 5 fallos por IP cada 15 min, en memoria y por instancia, con limpieza de entradas expiradas y máximo de entradas | D9 |
| 8 | `/agenda` se crea como placeholder protegido; C-10 lo reemplaza | D13 |
| 9 | Se permiten varias sesiones simultáneas del mismo odontólogo; el logout revoca solo la actual | D3 |
| 10 | `/api/auth/me` devuelve `id`, `fullName` y `email`; no incluye `phone` | D7 |
| 11 | Un fallo de auditoría no impide el logout si la sesión ya fue revocada | D8 |
| 12 | Los `400` por payload inválido no cuentan para el rate limit; solo los fallos de credenciales | D9 |
| 13 | No se agregan dependencias ni variables de entorno | D14, D15 |

## Goals / Non-Goals

**Goals:**

- Un login real contra el hash Argon2id existente, con respuestas que no permitan enumerar cuentas.
- Una sesión revocable, persistida y con expiración por inactividad verificada en el servidor.
- Una cookie que no sea legible por JavaScript y que no se envíe en POST cross-site.
- Una frontera de autorización clara: middleware optimista, guarda de layout y verificación independiente en cada endpoint privado.
- Un ciclo completo login → área privada → logout → sesión revocada, cubierto por tests contra PostgreSQL real.
- Eventos de autenticación auditados sin PII y con un punto de integración limpio para el append-only de C-04.

**Non-Goals:**

- Registro público, autenticación de pacientes, OTP, MFA, login social, cambio o recuperación de contraseña.
- Gestión de dispositivos, listado/cierre de todas las sesiones desde la UI, “recordarme” o sesiones de larga duración.
- Rate limiting distribuido, WAF, CAPTCHA, bloqueo de cuenta o protección contra ataques coordinados desde muchas IPs.
- Headers de seguridad, CSP, HSTS, `__Host-` y endurecimiento de compliance: C-16.
- Append-only de `AuditLog`, revocación de privilegios o triggers: C-04.
- La agenda funcional, el catálogo, la disponibilidad y cualquier dato de paciente: C-05, C-06, C-10.
- Cambiar los parámetros Argon2id de C-02 o agregar un flujo de rehash.

## Decisions

### D1. Sesión persistida en PostgreSQL, no cookie firmada ni JWT

Se evaluaron tres estrategias:

| Estrategia | Revocación inmediata | Expiración por inactividad | Complejidad | Veredicto |
|---|---|---|---|---|
| Sesión persistida + token opaco | Sí: `revokedAt` | Sí: `expiresAt` validado en cada request | Media: una tabla y una consulta por request | **Elegida** |
| Cookie firmada con estado | No: una copia robada sigue siendo válida hasta su expiración | Difícil: habría que reemitir la cookie en cada request, y un RSC no puede escribir cookies | Baja, pero no cumple el requisito | Descartada |
| JWT / cookie con claims | No sin una lista de revocación, que vuelve a introducir estado | Solo con expiración fija o lógica adicional | Media-alta | Descartada |

La sesión persistida es la única que cumple a la vez `RN-AUT-04` (expiración por inactividad) y la invalidación real del logout. El costo es una consulta indexada por request autenticada; en un sistema de un solo odontólogo es despreciable.

**No se usa Auth.js** en C-03: agrega una dependencia, configuración de providers y su propio modelo de sesión; el provider de credenciales seguiría necesitando una sesión con revocación e inactividad. Para un único usuario, el costo de integración supera el beneficio. Queda como alternativa si en el futuro se suma OAuth o multi-usuario.

### D2. Modelo `DentistSession` y token opaco

Se agrega una entidad de infraestructura de autenticación, no una entidad de dominio clínica:

```prisma
model DentistSession {
  id         String    @id @default(uuid()) @db.Uuid
  dentistId  String    @db.Uuid
  tokenHash  String    @unique @db.VarChar(64)
  createdAt  DateTime  @default(now()) @db.Timestamptz(3)
  lastUsedAt DateTime  @default(now()) @db.Timestamptz(3)
  expiresAt  DateTime  @db.Timestamptz(3)
  revokedAt  DateTime? @db.Timestamptz(3)

  dentist Dentist @relation(fields: [dentistId], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@index([dentistId])
  @@index([expiresAt])
}
```

- **Token**: 32 bytes generados con `crypto.randomBytes(32)` y codificados en `base64url` (43 caracteres, 256 bits de entropía). No se deriva de datos del usuario ni se reutiliza entre sesiones.
- **Almacenamiento**: solo `SHA-256(token)` en hexadecimal (64 caracteres). No se guarda el token en claro. Para un secreto de 256 bits, SHA-256 es suficiente; Argon2 se reserva para contraseñas de baja entropía. No hace falta cifrar el hash: no es reversible y no se usa para reconstruir el token.
- **Búsqueda**: `findUnique({ where: { tokenHash } })`, cubierta por el índice único. No se compara el token en la aplicación ni se recorre la tabla.
- **Relación**: un `Dentist` puede tener varias sesiones (varias pestañas o dispositivos); una sesión pertenece a un solo odontólogo. La FK usa `Cascade` porque, si se elimina el odontólogo en una baja excepcional, sus sesiones no deben sobrevivir. `Dentist` ya está protegido por `Restrict` cuando tiene turnos.
- **Índices**: `tokenHash` único para la validación; `dentistId` para cubrir la FK y limpiar por odontólogo; `expiresAt` para la limpieza oportunista.
- **Sin `CHECK`**: `expiresAt > createdAt` se garantiza en el servicio; agregar un `CHECK` obligaría a editar la migración generada (excepción a C9) sin proteger una invariante que el código ya controla. Si en el futuro se escribe por SQL directo, se evalúa una migración nueva.
- **Sin `ip` ni `userAgent`**: la IP del login queda en `AuditLog`; guardar user-agent agrega datos personales y no aporta a la revocación. La sesión se identifica por su token y su id.

`Dentist` suma `sessions DentistSession[]`; no se altera ningún otro campo ni relación.

### D3. Expiración: inactividad, tope absoluto y limpieza

Constantes del servicio (no variables de entorno, para no fragmentar la configuración de un único consultorio):

| Parámetro | Valor | Motivo |
|---|---|---|
| `SESSION_IDLE_TIMEOUT_MS` | 30 minutos | Un dispositivo desatendido en un consultorio no debe quedar con acceso a datos de pacientes. |
| `SESSION_ABSOLUTE_TIMEOUT_MS` | 12 horas | Cubre una jornada laboral larga; acota el daño de un token robado aunque se use. |
| `SESSION_TOUCH_INTERVAL_MS` | 5 minutos | Evita una escritura por request; la expiración se recalcula solo si pasó el intervalo. |
| `SESSION_CLEANUP_AFTER_MS` | 7 días | Conserva sesiones expiradas/revocadas el tiempo suficiente para diagnosticar y auditar, y luego las elimina. |

Al crear una sesión:

```
expiresAt = now + SESSION_IDLE_TIMEOUT_MS
```

Al validar una sesión:

1. Si `revokedAt` no es nulo → inválida.
2. Si `now >= expiresAt` → inválida.
3. Si `now >= createdAt + SESSION_ABSOLUTE_TIMEOUT_MS` → inválida (defensa adicional; `expiresAt` nunca debería superar ese tope).
4. Si `now - lastUsedAt >= SESSION_TOUCH_INTERVAL_MS`, actualizar:
   - `lastUsedAt = now`;
   - `expiresAt = min(now + SESSION_IDLE_TIMEOUT_MS, createdAt + SESSION_ABSOLUTE_TIMEOUT_MS)`.
   - No se achica una expiración existente: se usa el máximo entre el valor actual y el calculado.

La cookie tiene `Max-Age` de 12 horas, que es el tope absoluto. La expiración fina por inactividad la decide la base; la cookie es solo el continente. No se puede renovar el `Max-Age` desde un Server Component (Next.js solo permite escribir cookies en Route Handlers y Server Actions), y por eso no se intenta: la sesión de la base expira antes y la próxima request autenticada la rechaza.

**Sesiones expiradas:** se rechazan en la validación y se eliminan de forma oportunista en el próximo login exitoso del mismo odontólogo, junto con las revocadas hace más de 7 días. No se agrega un cron en C-03; si el volumen creciera, C-16 o un job posterior puede programar la limpieza. La eliminación es best-effort y no altera el resultado del login.

**Errores de base durante la validación:** si la consulta falla (base caída, timeout), la sesión **no** se considera inválida y no se redirige al login por un fallo transitorio. El error se propaga como 500 genérico en un endpoint o como error de servidor en un RSC; no se borra la cookie. Esto evita “desloguear” a todos los usuarios durante una caída.

**Múltiples sesiones (decisión confirmada):** cada login crea una sesión nueva y no revoca las anteriores. El odontólogo puede usar teléfono y escritorio; el logout revoca solo la sesión actual. La rotación relevante es la del token al autenticarse: no se emite ninguna sesión antes del login y el token se genera después de verificar la contraseña. No se hace rotación periódica porque un RSC no puede reescribir la cookie y el tope absoluto ya acota la vida del token.

### D4. Cookie, CSRF, fijación y robo de token

Cookie de sesión:

| Atributo | Valor | Motivo |
|---|---|---|
| Nombre | `turnos_session` | Nombre estable y específico; el prefijo `__Host-` queda para C-16 porque en local no hay HTTPS. |
| Valor | token opaco de 43 caracteres | No contiene datos del usuario ni estado legible. |
| `HttpOnly` | `true` | JavaScript no puede leerla; mitiga XSS de sesión. |
| `Secure` | `true` en producción | En desarrollo local se usa HTTP; se decide con `NODE_ENV` (misma excepción documentada por C-01). |
| `SameSite` | `Lax` | Bloquea cookies en POST cross-site; permite navegación top-level normal. |
| `Path` | `/` | La sesión aplica a toda la aplicación. |
| `Domain` | ausente | Cookie host-only; no se comparte con subdominios. |
| `Max-Age` | 12 horas | Tope absoluto; la inactividad se controla en la base. |

Al cerrar sesión o al detectar una cookie inválida en `/api/auth/me`, se emite la misma cookie con valor vacío, `Max-Age=0` y `Expires` en el pasado.

**CSRF:** `SameSite=Lax` es la primera barrera. Además, `POST /api/auth/login` y `POST /api/auth/logout` exigen `Origin` (o, si el navegador no lo envía, `Referer`) y lo comparan contra `APP_BASE_URL` si está configurada, o contra el origen de la request como fallback. El login exige además `Content-Type: application/json`, lo que impide un POST de formulario cross-site simple. No se implementa double-submit token: agrega estado y no aporta sobre `SameSite=Lax` + `Origin` para una API same-origin. Si en el futuro se necesita un cliente cross-site, se revisa.

**Fijación de sesión:** no existe una sesión pre-autenticación. El token se genera recién después de verificar la contraseña, es aleatorio y se entrega en una cookie `HttpOnly`; un atacante no puede fijar un valor en el navegador de la víctima sin ya controlar el dominio o el navegador. No se reutiliza el token de una sesión anterior.

**Robo o reutilización:** `HttpOnly` + `Secure` + `SameSite`, hash en la base, expiración por inactividad, tope absoluto y revocación en logout. No se ata la sesión a IP ni a user-agent: rompería el uso legítimo en redes móviles y no impediría a un atacante con el token. Un token robado sigue siendo válido hasta que se revoque o expire; por eso el tope es acotado. La detección de reutilización concurrente y el cierre de todas las sesiones quedan fuera de C-03.

### D5. Verificación de contraseña y no enumeración

Se usa `verify(hash, password)` de `@node-rs/argon2@2.2.2`:

- La función `verifyPassword(hash, password): Promise<boolean>` envuelve la llamada en `try/catch` y devuelve `false` ante cualquier error, incluido `InvalidArg` por un hash mal formado. Nunca propaga el hash ni la contraseña.
- Un hash corrupto en la base se trata como credencial inválida (401 genérico), no como 500. Se registra, como máximo, el id del odontólogo y el código de error, nunca el hash.
- **Verificación también para email inexistente:** se compara contra un hash ficticio Argon2id válido, con los mismos parámetros de C-02, mantenido como constante no secreta. Así el camino “no existe” ejecuta un `verify` real, igual que el camino “existe pero la contraseña es incorrecta”. El hash ficticio no es una credencial y no se usa para autenticar. **No se exige ni se promete igualdad exacta de tiempos de respuesta**: no es una garantía determinista. La garantía verificable es mismo estado HTTP, mismo cuerpo genérico y ejecución de una verificación Argon2id en ambos caminos; los tests lo comprueban con un verificador inyectable.
- **Normalización:** el email se normaliza con `trim` + minúsculas antes de buscar (decisión 10 de C-02); la contraseña **no** se recorta ni se transforma.
- **Mensajes:** email inexistente y contraseña incorrecta devuelven el mismo `401` con el mismo cuerpo (`Email o contraseña incorrectos.`). Un email con formato inválido o un cuerpo mal formado devuelve `400` genérico; eso no revela si una cuenta existe. Los tests comparan explícitamente el estado y el cuerpo de ambos caminos.
- **Sin rehash ni cambio de parámetros:** C-03 no modifica el hash del seed ni los parámetros Argon2id. Un flujo de cambio de contraseña o de rehash no está en el roadmap y queda como deuda explícita.
- **Sin secretos en logs:** no se registran email, contraseña, hash, token, cookie ni el cuerpo de la request. Los errores inesperados se registran con un mensaje fijo y, como mucho, un código; nunca con el objeto de error completo si puede contener valores.

### D6. Protección de rutas en Next.js App Router

Next.js 14 recomienda usar el middleware para una verificación **optimista** y concentrar la autorización real en la capa que accede a los datos. Se sigue esa recomendación:

1. **Middleware (`src/middleware.ts`)**: solo mira si existe la cookie. Si falta y la ruta es privada, redirige a `/login?next=<ruta>`. No consulta la base (corre en Edge y Prisma no está disponible allí) y **no** redirige `/login` para evitar un ciclo con una cookie vencida. Matcher explícito:
   - `/agenda/:path*`
   - `/tratamientos/:path*`
   - `/pacientes/:path*`
2. **Layout del grupo privado (`src/app/(app)/layout.tsx`)**: lee la cookie con `cookies()` y llama a `requireDentistPageSession(token)`. Si no hay sesión válida, `redirect('/login')`; si la base falla, el error se propaga (no se redirige). Este layout cubre las páginas nuevas que se agreguen al grupo.
3. **Route Handlers privados**: cada handler llama a `getDentistFromRequest(request)` al inicio y responde `401` si no hay sesión. No se apoya en el middleware. Los endpoints de auth son la excepción: login es público; logout y me validan su propia cookie.
4. **Server Actions**: C-03 no agrega ninguna. El contrato para los changes posteriores es que toda acción que lea o escriba datos privados invoque la guarda de sesión al inicio; el layout y el middleware no cuentan como autorización. Se documenta en `README.md`.
5. **Páginas públicas**: `/`, `/reservar`, `/reservar/confirmacion`, `/turno/[token]` y `/api/health`, `/api/slots`, `POST /api/appointments`, `/api/webhooks/whatsapp` quedan fuera del matcher y no se bloquean.

**Por qué no se valida la sesión en el middleware:** en Next.js 14 el middleware corre en Edge Runtime por defecto y no puede usar Prisma/`pg`; habilitar Node.js en middleware es experimental en esta versión. Una consulta a la base en el middleware sería frágil y agregaría un costo a cada asset. La combinación middleware + layout + handler cumple la regla A4: el middleware mejora la experiencia, el layout protege la página y el handler protege los datos.

**Redirección de un usuario autenticado en `/login`:** la página es un RSC; lee la cookie, llama a `resolveLoginPage(token)` y, si hay sesión válida, `redirect('/agenda')`. Si no, renderiza el formulario. Esto no puede hacerlo el middleware sin consultar la base y sin arriesgar un ciclo.

**Destino posterior al login:** el parámetro `next` se sanea con `sanitizeNextPath`: solo se aceptan rutas relativas que empiecen con `/`, no `//`, no contengan `\` ni caracteres de control; cualquier otro valor cae en `/agenda`. Así se evita una redirección abierta.

### D7. Contrato de los endpoints de autenticación

| Endpoint | Entrada | Éxito | Errores | Efectos |
|---|---|---|---|---|
| `POST /api/auth/login` | JSON `{ email, password }`, `Content-Type: application/json`, `Origin` same-origin, cuerpo ≤ 4 KB | `200 { dentist: { id, fullName, email } }` + `Set-Cookie` | `400` cuerpo/validación; `401` credenciales; `403` origen; `413` cuerpo grande; `415` content-type; `429` rate limit; `500` inesperado | Crea `DentistSession`, escribe `AuditLog` `LOGIN` y fija la cookie. La sesión y la auditoría de éxito son atómicas. |
| `POST /api/auth/logout` | Cookie; `Origin` same-origin | `204` sin cuerpo + cookie borrada | `403` origen; `500` inesperado | Revoca la sesión actual (`revokedAt`) y escribe `AuditLog` `LOGOUT`. Es idempotente: sin cookie o con token inválido también responde `204` y borra la cookie. |
| `GET /api/auth/me` | Cookie | `200 { dentist: { id, fullName, email } }` (sin `phone`) | `401` sin sesión; `500` inesperado | Valida y renueva la sesión; si es inválida, borra la cookie. No escribe auditoría (no es acceso a datos de paciente). |

- Todas las respuestas de auth llevan `Cache-Control: no-store`.
- No se devuelve `passwordHash`, `createdAt`, `updatedAt`, token, id de sesión ni datos de paciente. `/api/auth/me` se limita a `id`, `fullName` y `email`; `phone` no forma parte del contrato de C-03.
- El login no distingue “email inexistente” de “contraseña incorrecta” en estado, cuerpo ni headers.
- El logout no revela si la cookie correspondía a una sesión existente.
- `request.json()` se envuelve en `try/catch`; un JSON inválido es `400`, no una excepción no controlada.
- El límite de 4 KB se controla con `Content-Length` cuando está presente; no sustituye la validación Zod de longitudes máximas (email ≤ 254, contraseña ≤ 256).
- Los handlers usan `NextRequest`/`NextResponse` y `request.cookies` (no `cookies()` de `next/headers`), para poder probarlos sin un servidor Next en ejecución.
- El login con una cookie de sesión válida no se rechaza: autentica de nuevo y emite una sesión nueva. La página `/login` normalmente redirige antes; el endpoint queda preparado para clientes directos.

### D8. Auditoría de autenticación y handoff a C-04

Se agregan tres valores a `AuditAction`: `LOGIN`, `LOGIN_FAILED` y `LOGOUT`.

- **Por qué `LOGIN` y `LOGOUT`:** no son `CREATE`/`DELETE` de una entidad de dominio; usar `UPDATE` sobre `Dentist` sería engañoso. Un valor propio permite filtrar eventos de seguridad sin ambigüedad.
- **Por qué `LOGIN_FAILED`:** distingue un intento fallido de un acceso exitoso. Es el evento que hace útil la auditoría de autenticación ante fuerza bruta.
- **Por qué no `SESSION_REVOKED`:** el logout ya expresa la revocación; una revocación administrativa no existe en C-03. Se puede agregar en C-16 si aparece esa operación.

Filas que escribe C-03:

| Evento | `actorType` | `actorRef` | `action` | `entity` | `entityId` | `ip` |
|---|---|---|---|---|---|---|
| Login exitoso | `DENTIST` | `dentist.id` | `LOGIN` | `DentistSession` | `session.id` | IP del request o `null` |
| Login fallido de cuenta existente | `DENTIST` | `dentist.id` | `LOGIN_FAILED` | `Dentist` | `dentist.id` | IP del request o `null` |
| Logout | `DENTIST` | `dentist.id` | `LOGOUT` | `DentistSession` | `session.id` | IP del request o `null` |

**Email inexistente:** no se escribe una fila de auditoría. No hay una entidad real a la que referenciar y no se guarda el email intentado porque es un dato personal. El intento cuenta para el rate limit por IP y no se registra en logs. Esta decisión evita inventar un `entityId` ficticio o almacenar PII y quedó confirmada en la revisión humana.

**Datos prohibidos:** contraseña, hash, token, cookie, email, nombre, teléfono, motivo de consulta y cualquier dato clínico. `AuditLog` guarda IDs, acción, entidad, IP y timestamp. La IP es un dato personal necesario para la seguridad; su retención sigue `PA-06`.

**IP:** se toma el primer valor de `x-forwarded-for`, luego `x-real-ip`, se valida con `net.isIP` y se guarda como `inet`; si no hay un valor válido, `null`. `X-Forwarded-For` y `X-Real-IP` **solo son confiables cuando un proxy controlado por la infraestructura los establece o los sobrescribe**. El sistema no confía en valores arbitrarios enviados por un cliente y no usa la IP para autorizar; la usa solo para auditoría y para el rate limit. Si el despliegue no garantiza un proxy controlado, el rate limit por IP y la IP auditada no son garantías: se documenta como dependencia de infraestructura y C-16 debe definir la configuración de proxy confiable.

**Fallo de auditoría:**
- Login exitoso: la creación de `DentistSession` y el `INSERT` de `LOGIN` van en la misma transacción. Si la auditoría falla, no se crea la sesión y el login responde `500` genérico. No debe existir una sesión sin su evento de login.
- Login fallido: el `INSERT` de `LOGIN_FAILED` es best-effort. Si falla, se registra un error genérico sin PII y se devuelve igualmente `401`.
- Logout: primero se revoca la sesión y luego se intenta auditar. Si la auditoría falla, la revocación **prevalece** y se responde `204`; se registra un error genérico. La seguridad de cerrar el acceso no depende de que la auditoría esté disponible. Esta prioridad quedó confirmada en la revisión humana.

**Handoff a C-04:** C-03 solo hace `INSERT` a través de `recordAuthAudit`. No implementa revocación de privilegios, triggers ni pruebas de inmutabilidad. C-04 deberá:
- impedir `UPDATE`/`DELETE` sobre `AuditLog` a nivel de base;
- garantizar que el servicio de auditoría solo inserte;
- probar que un `UPDATE` y un `DELETE` fallan y que la fila original queda intacta;
- documentar los límites del mecanismo (por ejemplo, un superusuario puede saltarlo).

C-03 no se presenta como compliance de auditoría completo.

### D9. Rate limit y fuerza bruta

Se implementa un limitador de ventana fija en memoria:

- Clave: IP del request (o `unknown` si no se puede determinar). No se usa el email como clave: evita almacenar PII y evita revelar si una cuenta existe. La IP se obtiene de los headers de proxy solo bajo la premisa de que un proxy controlado los sobrescribe (D8); un valor arbitrario de cliente no se usa para autorizar y no convierte el rate limit en una garantía.
- Límite: **5 fallos por IP cada 15 minutos**.
- Un login exitoso limpia el contador de esa IP.
- Al superar el límite, `429` con `Retry-After` en segundos y cuerpo genérico. No se ejecuta `verify` ni se consulta la base para credenciales cuando ya está limitado, para no gastar CPU.
- El contador se guarda en un `Map` sobre `globalThis` para sobrevivir al hot reload de desarrollo. Se expone `reset()` solo para tests.
- **Limpieza de entradas expiradas:** las entradas con `resetAt <= now` se eliminan en un barrido oportunista como máximo una vez por minuto y también cuando el mapa alcanza su capacidad. El barrido no recorre el mapa en cada request.
- **Máximo de entradas:** `LOGIN_RATE_LIMIT_MAX_ENTRIES = 10_000`. Si después del barrido hay que insertar una IP nueva y el mapa está lleno, se elimina la entrada con el `resetAt` más próximo (la que antes iba a expirar) antes de insertar. El `Map` nunca supera ese máximo.
- **Trade-off de la cota:** la evicción acota la memoria, pero un atacante con muchas IPs puede desplazar contadores de otras IPs. El límite sigue siendo por IP y por instancia; no es una defensa distribuida. Un limitador durable (base, Redis o el proveedor) es C-16.
- **Límite honesto:** es una defensa en profundidad por instancia. En un despliegue serverless o multi-instancia, cada proceso tiene su propio contador y un atacante puede distribuir intentos. No se agrega una tabla de intentos en C-03.
- **Sin bloqueo de cuenta:** bloquear la única cuenta permitiría un DoS trivial. El límite es por IP, no por email.
- Los `400` por cuerpo/validación **no** cuentan como fallo de credenciales; los `401` sí. El `429` no se audita para no amplificar el volumen. Esta distinción quedó confirmada en la revisión humana.

### D10. Protecciones adicionales: qué entra y qué queda para después

| Amenaza | C-03 | Etapa posterior |
|---|---|---|
| Fuerza bruta | Argon2id, hash ficticio, 5 fallos/IP/15 min, limpieza y cota de memoria, respuestas genéricas | Rate limit distribuido, CAPTCHA/WAF (C-16) |
| Enumeración de usuarios | Mismo estado/cuerpo, verificación Argon2id en ambos caminos, rate limit por IP; sin promesa de tiempos idénticos | Monitoreo de intentos (C-16) |
| IP de headers falsificada | No se usa para autorizar; solo es confiable con un proxy controlado que sobrescriba los headers | Configuración explícita de proxy confiable (C-16) |
| Fijación de sesión | Sin sesión pre-auth, token nuevo post-verificación, cookie `HttpOnly` | — |
| Robo de token | `HttpOnly`/`Secure`/`SameSite`, hash en base, inactividad + tope, logout | Rotación periódica, binding a dispositivo (fuera de alcance) |
| Reutilización de token | `revokedAt` en logout, validación en cada request | Detección de uso concurrente (futuro) |
| CSRF | `SameSite=Lax` + `Origin` + JSON en login | Double-submit token si aparece un cliente cross-site |
| Acceso directo a endpoints | Guarda en cada Route Handler, no solo middleware | Pruebas de contrato por endpoint en cada change |
| Redirección abierta | `next` saneado a rutas relativas | — |
| Fuga por logs | Sin PII ni secretos; errores genéricos | Revisión de logging en C-16 |
| Clickjacking / XSS / headers | Fuera de C-03 | CSP, HSTS, X-Frame-Options en C-16 |

### D11. Migración y cambios de enum (sin excepción a C9)

Secuencia:

1. Declarar `DentistSession`, la relación en `Dentist` y los tres valores de `AuditAction` en `prisma/schema.prisma`.
2. `npx prisma migrate dev --name auth_sessions --create-only`.
3. Revisar el DDL: `CREATE TYPE`/`ALTER TYPE` del enum, `CREATE TABLE`, FK con `Cascade`, unique de `tokenHash`, índices `dentistId` y `expiresAt`.
4. Aplicar con `npx prisma migrate dev`, ejecutar `prisma generate` y verificar `prisma migrate status` sin drift.
5. Verificar `npx prisma migrate deploy` desde una base vacía (base de tests o una base nueva; no `migrate reset` sin consentimiento).

No se escribe SQL a mano: Prisma 7.10.1 expresa la tabla, la FK, el unique y los índices. Los valores nuevos de un enum se agregan con `ALTER TYPE ... ADD VALUE`, que PostgreSQL 15 acepta dentro de la transacción de la migración; la migración no usa esos valores en la misma transacción (no inserta filas), así que no hay conflicto. Si una versión futura de Prisma genera el `ALTER TYPE` de otra forma, se revisa el DDL antes de aplicar.

**Compatibilidad:** `AuditAction` solo crece; las filas existentes y los tests de C-02 siguen válidos. `DentistSession` es una tabla nueva; no hay datos que migrar. La Migración 001 y el archivo de C-02 no se tocan.

### D12. Estrategia de tests y costuras de testabilidad

La suite usa PostgreSQL real y la base aislada de C-02. No se mockea la base. Se mockean solo dependencias puras: el reloj, el almacén/capacidad del rate limiter y el verificador inyectable de `authenticateDentist`.

**Unitarios:**

- `auth-token`: longitud/formato base64url, 43 caracteres, hash SHA-256 de 64 hex, determinismo, tokens distintos.
- `auth-password`: `verifyPassword` verdadero/falso, hash mal formado → `false`, hash ficticio con los parámetros de C-02 (`parseOptions`).
- `auth-expiry`: cálculo de expiración inicial, renovación deslizante, tope absoluto, no achicar, sesión revocada/expirada.
- `auth-rate-limit`: 5 fallos → bloqueo, `Retry-After`, reset por éxito, ventana vencida, IPs independientes, limpieza de entradas expiradas, cota de `10_000` entradas y evicción de la entrada con `resetAt` más próximo.
- `auth-redirect`: `next` válido, `//evil`, URL absoluta, barra invertida, vacío.
- `auth-cookie`: opciones `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age`, `Secure` según entorno, borrado.

**Integración (base de tests):**

- Login exitoso: 200, cookie, fila `DentistSession`, `tokenHash` distinto del token, `AuditLog` `LOGIN`.
- Contraseña incorrecta y email inexistente: mismo 401 y mismo cuerpo; no se crea sesión; `LOGIN_FAILED` solo para la cuenta existente. Un verificador inyectado comprueba que se ejecuta Argon2id en ambos caminos (hash real en el primero, hash ficticio en el segundo). No se asserta igualdad exacta de tiempos.
- Credenciales vacías, JSON inválido, content-type incorrecto, cuerpo grande: 400/413/415; no se crea sesión y no consumen el contador de fallos de credenciales.
- Rate limit: 5 fallos → 429; el éxito limpia el contador; un `400` no lo incrementa; la limpieza y la cota de memoria se prueban con reloj y capacidad inyectados.
- `GET /api/auth/me`: sin cookie 401; con cookie válida 200 con `id`, `fullName` y `email`; sin `phone`, `passwordHash` ni datos de sesión.
- Cookie manipulada, sesión expirada, sesión revocada: 401 y sin acceso.
- Renovación deslizante: `lastUsedAt` viejo y `expiresAt` futuro → se extiende; tope absoluto no se supera.
- Logout: 204, cookie borrada, `revokedAt`, `AuditLog` `LOGOUT`; reutilizar el token → 401; logout sin cookie → 204.
- Protección de página: `requireDentistPageSession(undefined)` redirige a `/login`; con token válido devuelve el odontólogo; con token vencido/revocado redirige.
- Middleware: ruta privada sin cookie → redirect con `next`; con cookie → `next()`; `/login` no se redirige.
- Login con sesión válida: `resolveLoginPage(token)` devuelve `/agenda`; sin sesión devuelve `null`.
- Auditoría: filas con actor/acción/entidad/IP; sin email, contraseña, hash ni token; `LOGIN_FAILED` de email inexistente no deja fila; un header de IP arbitrario no autentica ni reemplaza la sesión.
- Limpieza: una sesión expirada hace más de 7 días se elimina en el próximo login; una revocada reciente se conserva.
- Aislamiento: todos los tests usan `TEST_DATABASE_URL`; el helper `cleanupAll` borra sesiones antes del odontólogo.

**Costuras:**

- `createSession`, `validateSessionToken`, `computeSessionExpiry` reciben `now?: Date`.
- `createLoginRateLimiter({ now, maxEntries, sweepIntervalMs })` devuelve una instancia con `check`, `recordFailure`, `reset` y acceso de solo lectura al tamaño para tests; el handler usa un singleton sobre `globalThis`.
- `authenticateDentist({ email, password, verify })` aísla la búsqueda y la verificación; `verify` es inyectable con `verifyPassword` por defecto, para que los tests comprueben que se ejecuta Argon2id tanto con una cuenta existente como con un email inexistente sin depender de tiempos.
- `requireDentistPageSession(token)` recibe el token; el layout pasa el valor de `cookies()`. Así se prueba la guarda sin un servidor Next.
- `resolveLoginPage(token)` recibe el token; la página pasa el valor de `cookies()`.
- Los Route Handlers se prueban importando `POST`/`GET` y construyendo `NextRequest`; no se levanta Next.
- No se agrega React Testing Library: la UI se verifica con `npm run build` y un smoke manual (login, redirect, logout) sobre `npm run dev`.

**CI:** no requiere variables nuevas. El paso existente `npm run db:test:migrate` aplica la Migración 002 a `turnos_test`; `npm test` corre la suite. `npm run build` compila las páginas nuevas. Si el build ejecutara código de sesión en prerender, las páginas usan `cookies()` y quedan dinámicas.

### D13. UI, placeholder de agenda y flujo de navegación

- `/login` es un RSC mobile-first con una tarjeta centrada, labels visibles, `autoComplete="username"`/`"current-password"`, `inputMode="email"`, estado de envío y un mensaje de error genérico. El formulario es un Client Component que hace `fetch` al endpoint y, en éxito, navega a `next` (saneado) o `/agenda` con `window.location.assign`, para que la próxima request incluya la cookie y el RSC vuelva a resolver la sesión.
- `(app)/layout.tsx` muestra un encabezado mínimo con el nombre del consultorio y un botón de logout. El botón es un Client Component que hace `POST /api/auth/logout`; si falla, muestra un error y **no** navega (si navegara a `/login` con la cookie todavía válida, el login redirigiría de vuelta a `/agenda`).
- `(app)/agenda/page.tsx` es un placeholder explícito (“La agenda llega en C-10”) para que el ciclo login → área privada → logout sea verificable. C-10 reemplaza el contenido; la ruta y las guardas quedan. La creación del placeholder quedó confirmada en la revisión humana.
- No se inventan rutas de negocio nuevas. Las rutas privadas futuras (`/agenda/semana`, `/agenda/disponibilidad`, `/tratamientos`, `/pacientes`, `/pacientes/[id]`) se agregarán dentro del grupo `(app)` y su layout las protegerá; el matcher del middleware se amplía cuando existan.
- La UI no decide autorización: solo muestra u oculta controles. Un usuario que conozca la URL sigue pasando por el layout y por el handler.

### D14. Alternativas descartadas

- **Auth.js / NextAuth:** dependencia y configuración extra; su provider de credenciales no resuelve por sí solo la revocación inmediata y la inactividad con el modelo de datos actual. Se puede reconsiderar si se agrega OAuth o multi-usuario.
- **JWT en cookie:** stateless y fácil de escalar, pero no revocable sin lista negra; la lista negra reintroduce la tabla de sesiones. No cumple el logout real.
- **Cookie firmada con datos del usuario:** no permite invalidar una copia robada y no puede renovarse desde un RSC. Descartada.
- **`localStorage`/`sessionStorage`:** expone el token a XSS y no cumple `HttpOnly`. Prohibido.
- **Guardar el token en claro:** un backup o una lectura de la base permitiría suplantar la sesión. Se guarda solo el hash.
- **Argon2 para el token de sesión:** el token ya tiene 256 bits de entropía; Argon2 está pensado para secretos de baja entropía y agregaría costo por request. SHA-256 es adecuado.
- **Rate limit en base de datos:** requeriría una tabla y limpieza; para un solo consultorio, el limitador en memoria es proporcional. C-16 decide si hace falta algo durable.
- **Bloquear la cuenta tras N fallos:** un atacante podría dejar fuera al único odontólogo. Se prefiere limitar por IP.

### D15. `SESSION_SECRET` no se usa en C-03

La cookie contiene un token opaco; su integridad se garantiza buscando el hash en la base, no verificando una firma. Un `SESSION_SECRET` no aporta seguridad adicional: un atacante con acceso a la base no puede reconstruir un token de 256 bits a partir de su SHA-256, y un atacante sin acceso a la base no puede fabricar una sesión válida. Mantener la firma solo agregaría una rotación de secreto que invalidaría sesiones sin beneficio.

Por eso C-03 **no** hace `SESSION_SECRET` requerido ni lo consume. Queda como variable opcional heredada de la KB. En C-16 se decide si se elimina de `.env.example`/`src/lib/env.ts` o se reutiliza para otra función (por ejemplo, firma de enlaces de un job). No se cambia ahora para no romper la configuración ni los tests existentes de `env.ts`.

### D16. Credencial de producción y advertencia de despliegue

`dev-only-password` es una credencial **exclusivamente de desarrollo**, pública en el repositorio y generada por el seed de C-02. El seed no es un mecanismo de aprovisionamiento y **no se puede desplegar el sistema con la credencial del seed**.

C-03 no implementa cambio ni recuperación de contraseña, ni un script de alta de la credencial de producción; ambos quedan fuera de alcance y se registran como deuda de roadmap. Antes de un despliegue real hace falta un mecanismo separado, fuera de C-03, que establezca un hash Argon2id de una contraseña fuerte y única sin dejar la credencial en el repositorio ni en los logs. El `README.md` de C-03 debe incluir esta advertencia de forma explícita; no alcanza con que la contraseña sea “de ejemplo”.

## Risks / Trade-offs

- **[Expiración de 30 min / 12 h confirmada]** → Son los valores aprobados para el consultorio; `RN-AUT-04` no fija números y se mantienen como constantes. Si el contexto de uso cambia, se ajustan sin alterar el modelo.
- **[Rate limit en memoria]** → No es una garantía en serverless/multi-instancia. Se documenta como defensa en profundidad y C-16 debe evaluar un limitador durable. La cota de `10_000` entradas evita crecimiento ilimitado, pero la evicción permite que muchas IPs desplacen contadores; no se presenta como protección completa.
- **[Enumeración de usuarios]** → Se igualan estado y cuerpo y se ejecuta Argon2id en ambos caminos, pero **no se garantiza igualdad exacta de tiempos**. Los tests no deben fallar por microdiferencias de medición; la garantía es funcional y de verificación, no temporal.
- **[Email inexistente no se audita]** → Decisión confirmada: se evita PII y entidades ficticias, pero se pierde el registro de intentos con emails aleatorios. El rate limit por IP y los logs de infraestructura cubren parcialmente; el riesgo residual se acepta para C-03.
- **[`SESSION_SECRET` queda sin uso]** → Es una variable heredada que puede confundir. Se documenta y se resuelve en C-16. No se elimina ahora para no tocar configuración existente.
- **[Placeholder `/agenda`]** → Decisión confirmada: C-03 crea una página que pertenece conceptualmente a C-10. Es un solapamiento mínimo y explícito para poder probar el ciclo; C-10 la reemplaza.
- **[Sin cambio/recuperación de contraseña ni credencial de producción]** → `dev-only-password` es solo de desarrollo y **el sistema no se puede desplegar con la credencial del seed**. No hay flujo de alta ni rotación en C-03; es un hueco real del roadmap y se registra como deuda. Antes de producción hace falta un mecanismo separado de aprovisionamiento seguro.
- **[Sesión no atada a IP/dispositivo]** → Un token robado sigue siendo válido hasta expirar o revocarse. Se mitiga con `HttpOnly`, tope absoluto, inactividad y logout; el binding a dispositivo queda fuera de alcance.
- **[Cookie `Max-Age` no se renueva en RSC]** → La cookie dura 12 h aunque la sesión de la base expire por inactividad a los 30 min. Es intencional: la base es la autoridad y la cookie es solo el transporte. Una cookie vencida se sobrescribe en el próximo login.
- **[Error de base durante la guarda]** → No se redirige al login para no desloguear por una caída transitoria; el usuario ve un error 500. Es preferible a invalidar sesiones masivamente, pero la experiencia debe revisarse en C-16.
- **[Auditoría antes de C-04]** → Las filas de auth se escriben sin la garantía append-only. C-04 debe implementarla y probarla; hasta entonces C-03 no declara compliance completo.
- **[IP de `x-forwarded-for`/`x-real-ip`]** → Solo son confiables si un proxy controlado por la infraestructura los establece o sobrescribe. Un cliente puede enviar valores arbitrarios; por eso la IP no autoriza, solo audita y alimenta el rate limit. Si no hay proxy controlado, el rate limit por IP no es una garantía y la IP auditada puede no ser la real.
- **[Enum `AuditAction` y migración]** → `ALTER TYPE ... ADD VALUE` es compatible con PG15, pero se revisa el DDL generado antes de aplicar. No hay datos que migrar.
- **[Tests con reloj real]** → La expiración deslizante se prueba con fechas relativas a `new Date()`; para evitar flakiness se usan márgenes amplios o las funciones puras con reloj inyectado. Los tests de integración no duermen.
- **[Limpieza de sesiones en login]** → Agrega una escritura al login; si falla, se ignora (best-effort) y no impide autenticar. Las sesiones expiradas se rechazan igual aunque la limpieza no corra.
- **[UI sin tests de componente]** → No se agrega una dependencia de testing de React; se compensa con build + smoke manual. Si la UI crece en C-10, se evalúa incorporar una herramienta.
- **[Open redirect]** → Se sanea `next`; si se agrega otro parámetro de retorno, debe pasar por la misma función.
- **[Contradicción `/login` en la KB]** → Se resuelve en el diseño, pero la KB sigue diciendo lo contrario. Se recomienda corregirla en un change documental para que futuros agentes no la reintroduzcan.

## Migration Plan

1. Declarar `DentistSession`, `Dentist.sessions` y los valores de `AuditAction` en `prisma/schema.prisma`; `prisma validate` y `prisma format`.
2. `npx prisma migrate dev --name auth_sessions --create-only`; revisar el DDL generado.
3. Aplicar la migración, `prisma generate` y verificar `migrate status` sin drift.
4. Verificar `npx prisma migrate deploy` desde una base vacía (base de tests o una base nueva) y comprobar la tabla, la FK, el unique y los índices.
5. Actualizar `tests/helpers/fixtures.ts` (`createDentistSession`, `cleanupAll`) y agregar los helpers de contraseña/hash para tests.
6. Implementar los módulos de `src/server/auth/` con tests unitarios primero (token, contraseña, expiración, rate limit, redirect, cookie).
7. Implementar los Route Handlers y sus tests de integración.
8. Implementar middleware, layout, página de login, placeholder de agenda y botón de logout; verificar build y smoke manual.
9. Actualizar `README.md` (credencial, login/logout, cookie, expiración, rate limit, rutas protegidas, límites y deudas).
10. Correr `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run format:check`.

**Rollback:** en desarrollo, revertir el commit y recrear la base (con consentimiento); no hay datos de producción ni migración `down`. No se ejecutan comandos destructivos sin consentimiento explícito (regla C10).

## Open Questions

- ¿Se elimina `SESSION_SECRET` en C-16 o se le da otro uso?
- ¿Dónde se provisiona la credencial de producción y qué change implementa cambio/recuperación? Hoy el roadmap no lo cubre; el seed es solo de desarrollo y no se puede usar en producción.
- ¿Qué proxy controlado por la infraestructura se usará para que `X-Forwarded-For`/`X-Real-IP` sean confiables? C-16 debe dejarlo explícito.
- ¿Se adopta el prefijo `__Host-` para la cookie en C-16, cuando haya HTTPS obligatorio?
- ¿Se reemplaza el rate limit en memoria por uno durable en C-16?
