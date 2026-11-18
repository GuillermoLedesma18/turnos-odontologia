# Traceability — C-03 auth-odontologo

| Capability | Escenario principal | Cobertura |
|---|---|---|
| data-model | `DentistSession` y `AuditAction` ampliado | `tests/integration/migration.test.ts`, `tests/integration/data-model.test.ts` |
| dentist-auth | Login exitoso, contraseña incorrecta, email inexistente | `tests/integration/auth-login.test.ts` |
| dentist-auth | Cookie segura y borrado | `tests/unit/auth-cookie.test.ts` |
| dentist-auth | Expiración, tope absoluto y renovación | `tests/unit/auth-expiry.test.ts`, `tests/integration/auth-session.test.ts` |
| dentist-auth | Token opaco y hash SHA-256 | `tests/unit/auth-token.test.ts` |
| dentist-auth | Verificación Argon2id | `tests/unit/auth-password.test.ts` |
| dentist-auth | Rate limit, limpieza y capacidad | `tests/unit/auth-rate-limit.test.ts`, `tests/integration/auth-login.test.ts` |
| dentist-auth | Redirección saneada | `tests/unit/auth-redirect.test.ts` |
| dentist-auth | IP y origen | `tests/unit/auth-request.test.ts` |
| auth-route-protection | Middleware y guardas | `tests/integration/auth-protection.test.ts` |
| auth-route-protection | `/me` con y sin sesión | `tests/integration/auth-session.test.ts` |
| auth-audit | `LOGIN`, `LOGIN_FAILED`, `LOGOUT` | `tests/integration/auth-audit.test.ts` |
| auth-audit | Datos prohibidos e IP | `tests/integration/auth-audit.test.ts` |
