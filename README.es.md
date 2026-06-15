# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **¡Abierto a contribuciones!** Issues, pull requests y traducciones son bienvenidos. Visita las pestañas de [Issues](../../issues) y [Pull Requests](../../pulls) para comenzar.

Skills de backend de Opencode reutilizables que cubren descubrimiento de proyectos, arquitectura, diseño de bases de datos, diseño de API, implementación, pruebas, autenticación, operaciones, despliegue, migraciones, visualización, chequeos de salud y actualización de memoria.

## Skills incluidos

- `backend-orchestrator` — enruta las peticiones al skill de backend correcto
- `backend-scan` — explora un proyecto existente y mantiene sincronizados los archivos de memoria
- `backend-architect` — planifica la arquitectura del backend y la selección del stack tecnológico
- `backend-db-design` — diseña esquemas de bases de datos y migraciones
- `backend-visualize` — genera hermosos diagramas Mermaid (ERD, clases, actores, flujo, secuencia, arquitectura)
- `backend-api-design` — diseña endpoints de API y sus contratos
- `backend-implement` — genera o modifica código de backend
- `backend-test` — diseña pruebas, fixtures, mocks y cobertura
- `backend-auth` — diseña e implementa autenticación y autorización
- `backend-ops` — logging, metrics, tracing, caching, mensajería asíncrona y configuración
- `backend-deploy` — contenedores, docker-compose, CI/CD y health probes
- `backend-migrate` — evolución de esquemas, backfills y migraciones zero-downtime
- `backend-doctor` — ejecuta chequeos de salud y revisiones basadas en ejecución

Los archivos de referencia compartidos están en `.agents/skills/_shared/` y se incluyen en la instalación.

## Por dónde empezar

Si eres nuevo en estos skills, pruébalos en este orden:

1. **`backend-orchestrator`** — ¿No estás seguro de qué skill se ajusta a tu petición? Empieza aquí y te enrutará al correcto.
2. **`backend-scan`** — Apúntalo a un repositorio backend existente para descubrir estructura, stack y convenciones.
3. **`backend-architect`** — Úsalo cuando estés planificando un nuevo servicio o reestructurando uno existente.
4. **`backend-db-design`** — Diseña tablas, relaciones, índices y migraciones antes de escribir código.
5. **`backend-api-design`** — Define endpoints, esquemas de request/response y contratos de error.
6. **`backend-implement`** — Convierte diseños en código funcional, o evoluciona código existente.
7. **`backend-test`** — Añade pruebas, fixtures, mocks y cobertura a continuación.

Después de lo básico, toma los skills especializados según los necesites:

- **`backend-auth`** — para login, signup, JWT, RBAC y permisos.
- **`backend-ops`** — para logging, metrics, tracing, caching y mensajería asíncrona.
- **`backend-deploy`** — para Docker, CI/CD y configuración de infraestructura.
- **`backend-migrate`** — para evolución de esquemas y migraciones zero-downtime.
- **`backend-doctor`** — para chequeos de salud, linting, type checks y revisión de código.
- **`backend-visualize`** — para diagramas ERD, de arquitectura y de flujo.

## Instalación

Ejecuta el instalador usando `npx`:

```bash
npx everything-backend
```

El instalador se ejecutará de forma interactiva y te pedirá elegir:

1. **Global** — Instala los skills como plugin global del IDE/aplicación. Se te preguntará a qué aplicación apuntar:
   - **Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills-cursor`
   - **Opencode / generic** — `~/.agents/skills`
2. **Per-project** — Pide la ruta del directorio de tu proyecto e instala los skills localmente dentro de `<project-path>/.agents/skills/`.

### Instalación alternativa / manual

Si prefieres clonar e instalar localmente:

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### Opciones avanzadas

Puedes saltarte los prompts interactivos especificando una ruta `--target`:

```bash
npx everything-backend --target /path/to/project/.agents/skills
```

#### Flags disponibles

- `--dry-run` — muestra lo que se copiaría sin escribir archivos
- `--force` — sobrescribe los skills ya instalados
- `--target <path>` — ruta de destino personalizada (omite el prompt interactivo)

#### Ejemplos

```bash
node scripts/install.js --dry-run
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.agents/skills"
```

## Qué se instala

El instalador copia cada carpeta de `.agents/skills/` en tu directorio global de skills de Opencode. Cada skill se instala como:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## Uso en Opencode

Después de la instalación, los skills están disponibles por nombre. Ejemplos:

- `backend-orchestrator` — enruta las peticiones de backend al sub-skill correcto
- `backend-scan` — inspecciona un codebase de backend existente y mantiene la memoria actualizada
- `backend-api-design` — diseña endpoints y esquemas
- `backend-visualize` — dibuja ERDs, diagramas de clases, diagramas de arquitectura y más
- `backend-implement` — convierte diseños en código
- `backend-test` — añade o expande pruebas
- `backend-auth` — añade autenticación y autorización
- `backend-doctor` — ejecuta un chequeo de salud del backend

## Desarrollo

Para probar el instalador sin tocar tu directorio global real:

```bash
node scripts/install.js --dry-run
node scripts/install.js --target ./tmp-skills --force
```

## Layout del repositorio

```text
.agents/skills/        Skill definitions
scripts/install.js     NPX/local installer
.opencode/             Project-local Opencode metadata
```
