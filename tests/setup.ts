// Carga `.env` antes de cualquier test. Es la misma decisión que en
// `prisma.config.ts`: la configuración se carga explícitamente, no por magia
// del framework.
import 'dotenv/config';
