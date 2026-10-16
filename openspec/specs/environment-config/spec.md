# environment-config Specification

## Purpose
Define cómo el monolito carga y valida su configuración de entorno: un esquema tipado, validado al arrancar, que falla temprano y con precisión cuando falta o es inválida una variable, en lugar de propagar valores vacíos hacia la lógica de dominio o hacia los servicios externos.

## Requirements

### Requirement: Validación tipada de la configuración al arrancar

El sistema SHALL declarar su configuración de entorno como un esquema validado y tipado, y SHALL validarlo al arrancar el proceso. Las variables requeridas SHALL estar presentes y con formato válido. El sistema no SHALL arrancar con una variable requerida ausente, vacía o inválida, ni sustituirla por un valor por defecto silencioso. Una variable opcional presente SHALL cumplir su formato: ser opcional significa que puede faltar, no que su valor pueda ser inválido.

#### Scenario: Arranque con configuración válida

- **WHEN** el proceso arranca con todas las variables requeridas presentes y con formato válido
- **THEN** arranca normalmente y expone la configuración ya validada y tipada al resto del código

#### Scenario: Variable requerida ausente

- **WHEN** falta una variable requerida (por ejemplo, `DATABASE_URL`)
- **THEN** el proceso no arranca
- **AND** el error nombra la variable faltante

#### Scenario: Variable requerida con formato inválido

- **WHEN** una variable requerida presente tiene formato inválido (por ejemplo, `DATABASE_URL` que no es una cadena de conexión válida)
- **THEN** el proceso no arranca
- **AND** el error nombra la variable y el motivo del rechazo

#### Scenario: Variable opcional presente con formato inválido

- **WHEN** una variable opcional está presente pero mal formada (por ejemplo, `TZ_CONSULTORIO` que no es una zona horaria válida)
- **THEN** el proceso no arranca: que pueda faltar no autoriza un valor inválido
- **AND** el error nombra la variable y el motivo del rechazo

### Requirement: Los secretos se usan solo del lado del servidor

El sistema SHALL usar las variables sensibles (`DATABASE_URL`, `SESSION_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `CRON_SECRET`, `EMAIL_API_KEY`) únicamente en código de servidor. Ningún valor sensible SHALL incluirse en el bundle del cliente, en respuestas HTTP ni en logs.

#### Scenario: Secreto fuera del bundle del cliente

- **WHEN** se inspecciona el bundle servido al navegador y las respuestas HTTP
- **THEN** ninguno de los valores sensibles aparece

#### Scenario: Secreto ausente de los logs

- **WHEN** el proceso arranca y atiende peticiones
- **THEN** los valores sensibles no se escriben en los logs

### Requirement: El error de configuración no filtra el valor del secreto

El sistema SHALL reportar el nombre de la variable sensible inválida y el motivo del rechazo, y no SHALL imprimir el valor recibido.

#### Scenario: Variable sensible inválida

- **WHEN** una variable sensible tiene formato inválido
- **THEN** el mensaje de error nombra la variable y el motivo
- **AND** no incluye el valor recibido

### Requirement: Existe una plantilla de configuración versionada

El repositorio SHALL incluir una plantilla `.env.example` con los nombres de todas las variables de configuración del sistema —requeridas y opcionales— y de las credenciales del Postgres local, sin valores productivos, para que un entorno nuevo pueda configurarse sin leer el código. El archivo `.env` real no SHALL versionarse.

#### Scenario: Entorno nuevo configurable desde la plantilla

- **WHEN** un desarrollador copia `.env.example` a `.env` y completa los valores
- **THEN** el proceso arranca sin errores de configuración

#### Scenario: El .env real no se versiona

- **WHEN** se inspecciona el control de versiones
- **THEN** `.env` está ignorado y `.env.example` está versionado
