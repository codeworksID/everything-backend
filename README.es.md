# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **¡Abierto a contribuciones!** Issues, pull requests y traducciones son bienvenidos. Visita las pestañas de [Issues](../../issues) y [Pull Requests](../../pulls) para comenzar.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Skills de ingeniería backend para agentes de programación con IA: descubrimiento de proyectos, arquitectura, diseño de bases de datos, migraciones, diseño de API, autenticación, implementación, refactorización, pruebas, depuración, revisión de seguridad, chequeos de salud, operaciones, despliegue y diagramas. Funcionan en **Claude Code**, **Claude.ai**, **OpenCode / OMO**, **Cursor** y **Antigravity**.

## Skills incluidos

- `backend-orchestrator`: enruta las peticiones al skill de backend correcto y ejecuta flujos de trabajo de varios pasos
- `backend-scan`: explora un proyecto existente y mantiene sincronizados los archivos de memoria
- `backend-architect`: planifica la arquitectura y el stack tecnológico, y escribe `docs/architecture/overview.md` y los ADR
- `backend-db-design`: diseña esquemas de bases de datos y planes de migración
- `backend-visualize`: genera diagramas Mermaid con tema (ERD, clases, actores, flujo, secuencia, arquitectura)
- `backend-api-design`: diseña endpoints de API y sus contratos
- `backend-implement`: construye nuevas funcionalidades y evoluciona código existente
- `backend-refactor`: refactorización que preserva el comportamiento, como dividir controladores o servicios sobrecargados, extraer módulos, reducir el acoplamiento, strangler fig y modernizar código legacy
- `backend-debug`: corrige bugs reproduciendo el bug, escribiendo una prueba que falla, encontrando la causa raíz, aplicando una corrección mínima y añadiendo una prueba de regresión
- `backend-test`: diseña pruebas, fixtures, mocks y cobertura
- `backend-auth`: diseña e implementa autenticación y autorización
- `backend-security`: revisión de seguridad que cubre modelado de amenazas, el OWASP API Top 10, escaneo de secretos, SAST y verificaciones de la cadena de suministro
- `backend-ops`: logging, metrics, tracing, caching, mensajería asíncrona, configuración, patrones de resiliencia y backup/restore/DR
- `backend-deploy`: contenedores, CI/CD, Kubernetes, estrategia de release, rollback y pasos de migración con aprobación
- `backend-migrate`: evolución de esquemas, backfills y migraciones zero-downtime (expand/contract)
- `backend-doctor`: chequeos de salud basados en ejecución y revisiones limitadas al diff

El material compartido está en `.agents/skills/_shared/`:

- las reglas que sigue cada skill (`tool-rules.md`, `context-loading.md`, `memory-schema.md`, `principles.md`)
- un mapa de nombres de herramientas para cada host (`host-tools.md`)
- referencias de stacks (`stacks/postgres.md`, `stacks/node-typescript.md`, `stacks/python-fastapi.md`)
- los scripts de control (`scripts/checkpoint.js`, `scripts/guard.js`)

Cada skill mantiene un `SKILL.md` breve y carga sus plantillas y checklists detalladas desde su propia carpeta `references/` solo cuando las necesita.

## Por dónde empezar

1. **`backend-orchestrator`**: empieza aquí si no estás seguro de qué skill se ajusta a tu petición. Te enrutará al correcto.
2. **`backend-scan`**: apúntalo a un repositorio backend existente para descubrir su estructura, stack y convenciones.
3. **`backend-architect`**: úsalo cuando estés planificando un nuevo servicio o reestructurando uno existente.
4. **`backend-db-design`**, luego **`backend-migrate`**: diseña primero el esquema y después escribe y aplica las migraciones de forma segura.
5. **`backend-api-design`**, luego **`backend-implement`**, luego **`backend-test`**: define el contrato, constrúyelo y pruébalo.

Después, usa los skills especializados según los necesites:

- **`backend-debug`** cuando algo está roto.
- **`backend-security`** antes de un lanzamiento.
- **`backend-auth`** para login y permisos.
- **`backend-ops`** para operar en producción.
- **`backend-deploy`** para desplegar.
- **`backend-refactor`** para limpiar código sin cambiar su comportamiento.
- **`backend-doctor`** para chequeos de salud.
- **`backend-visualize`** para diagramas.

## Instalación

### Claude Code (recomendado: plugin con guard hook)

Dentro de Claude Code:

```text
/plugin marketplace add codeworksID/everything-backend
/plugin install everything-backend@codeworks
```

El plugin instala todos los skills más un guard hook `PreToolUse`. El hook hace que Claude pregunte antes de ejecutar cualquiera de estos:

- comandos git destructivos (`reset --hard`, `clean -f`, `checkout -- <path>`, force push)
- comandos para aplicar, resetear o eliminar migraciones
- SQL destructivo
- comandos de despliegue e infraestructura (`kubectl apply`, `helm upgrade`, `terraform apply`, `docker push`)
- borrados recursivos
- ediciones a archivos de secretos (`.env`, claves)

Para controlar el hook:

- Define `EVERYTHING_BACKEND_GUARD=off` para desactivarlo.
- Define `EVERYTHING_BACKEND_GUARD=strict` para que también pregunte antes de commits, pushes e instalaciones de dependencias.

También puedes instalar los skills como skills normales de Claude Code, sin el hook:

```bash
npx everything-backend --host claude
```

Eso los copia a `~/.claude/skills`. Para un solo proyecto, ejecuta `npx everything-backend`, elige **Per-project** y selecciona el layout `.claude/skills`.

### Claude.ai

Genera un zip autocontenido por skill (cada zip incluye su propia copia de `_shared/`):

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
npm run build:claude
```

Después sube cada `dist/claude-skills/<skill>.zip` en **Settings > Capabilities > Skills**. La ejecución de código debe estar habilitada para que los scripts funcionen.

### OpenCode, Cursor, Antigravity

```bash
npx everything-backend
```

El instalador te pide elegir:

1. **Global**: instala para una aplicación.
   - **Claude Code**: `~/.claude/skills`
   - **Antigravity (Gemini IDE)**: `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor**: `~/.cursor/skills`
   - **OpenCode / generic**: `~/.agents/skills`
2. **Per-project**: pide la ruta de tu proyecto y un layout. El layout es `<project>/.agents/skills/` (OpenCode, Cursor, genérico) o `<project>/.claude/skills/` (Claude Code).

Para aplicar las reglas de "preguntar primero" en OpenCode, consulta el fragmento de permisos de `opencode.json` en `_shared/host-tools.md`.

### Instalación manual

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

#### Flags

- `--host <claude|antigravity|cursor|opencode>`: instalación global para un host, sin prompts
- `--target <path>`: destino personalizado; omite los prompts y tiene prioridad sobre `--host`
- `--dry-run`: muestra lo que se copiaría sin escribir archivos
- `--force`: sobrescribe los skills ya instalados

```bash
node scripts/install.js --dry-run --host claude
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.claude\skills"
```

## Qué se instala

El instalador copia cada carpeta de skill de `.agents/skills/` junto con la carpeta compartida `_shared/` en el destino. Los skills buscan `_shared/` primero dentro de su propia carpeta y luego junto a ella, así que las carpetas deben permanecer juntas.

| Destino | Los skills se instalan como | Archivos extra |
|---|---|---|
| Plugin de Claude Code | gestionados por `/plugin` | guard hook (`hooks/hooks.json`) |
| Skills de Claude Code | `~/.claude/skills/<skill-name>/SKILL.md` | ninguno |
| Claude.ai | un zip subido por skill, con `_shared/` dentro | ninguno |
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | ninguno |
| OpenCode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | ninguno |
| Per-project | `<project>/.agents/skills/` o `<project>/.claude/skills/` | ninguno |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | ninguno |

El instalador omite las carpetas de skills que ya existen salvo que uses `--force`.

## Qué hacen los skills en tu proyecto

- **Archivos de memoria.** Los skills escriben la memoria del proyecto (resumen, stack tecnológico, decisiones, issues abiertos, estrategia de pruebas, plan de despliegue) en `.opencode/everything-backend-memory/`. La carpeta mantiene ese nombre en todos los hosts, por compatibilidad. Los checkpoints y parches van a `.opencode/everything-backend-memory/.checkpoints/`. Añade la carpeta `.checkpoints/` a `.gitignore`, o toda la carpeta de memoria si no quieres hacer commit de la memoria.
- **Entregables.** Algunos skills escriben documentos en tu proyecto:
  - documentos de arquitectura y ADR (`docs/architecture/`, `docs/adr/`)
  - revisiones de seguridad (`docs/security/`)
  - runbooks (`docs/runbooks/`)
- **Checkpoints y deshacer.** Los skills que editan código registran cada ejecución con `_shared/scripts/checkpoint.js`. Puedes deshacer una ejecución aplicando en reversa su propio parche. El rollback nunca usa `git checkout --`, `reset --hard` ni `clean`, así que tus propias ediciones se conservan.
- **El modo auto es el predeterminado.** El agente lee código y ejecuta comandos locales y herméticos sin preguntar. Eso incluye lint, type-check, build, pruebas unitarias y auditorías de dependencias de solo lectura.
- **Siempre pregunta antes** de cualquiera de estos:
  - aplicar migraciones o modificar una base de datos
  - git commit, cambio de rama, reset, clean, stash, rebase, merge o push
  - borrar o sobrescribir archivos que no creó
  - instalar, actualizar o eliminar dependencias
  - deploys, push de imágenes, IaC apply, rotación de secretos o llamadas a APIs externas de pago
  - editar archivos de CI/CD o de secretos
  - ejecutar pruebas o la aplicación contra cualquier base de datos, cola o servicio que no sea demostrablemente local
- **Nunca omite ni debilita una prueba que falla** para que pase.
- **Modo interactivo.** Di "ask me before each step" para aprobar tú mismo cada paso.

## Desarrollo

```bash
npm run check          # package, frontmatter, references, fences, plugin manifest
npm test               # guard.js and checkpoint.js tests
npm run build:claude   # Claude.ai zips in dist/claude-skills/
node scripts/install.js --dry-run --target ./tmp-skills
```

`npm run check` y `npm test` se ejecutan ambos en `prepublishOnly`. `npm run check` verifica lo siguiente:

- existen las rutas de `bin`/`files`
- el frontmatter es válido para Claude: el nombre coincide con la carpeta y la descripción tiene como máximo 1024 caracteres, sin corchetes angulares
- cada skill aparece en este README y en `backend-orchestrator`
- existe cada archivo `_shared/` y `references/` referenciado
- los bloques de código (fences) están balanceados
- la versión del manifiesto del plugin coincide con `package.json`

## Estructura del repositorio

```text
.agents/skills/<skill>/SKILL.md      Skill entry points (one folder per skill)
.agents/skills/<skill>/references/   Detail loaded on demand
.agents/skills/_shared/              Shared rules, host tool map, stack references
.agents/skills/_shared/scripts/      checkpoint.js and guard.js
.claude-plugin/                      Claude Code plugin manifest and marketplace
hooks/                               Claude Code guard hook
scripts/install.js                   NPX/local installer
scripts/build-claude-skills.js       Claude.ai zip builder
scripts/check-package.js             Consistency check (npm run check)
scripts/test-scripts.js              Script tests (npm test)
docs/                                Audit reports
.github/                             Issue and pull request templates
```

`.opencode/` no forma parte de este repositorio: los skills crean `.opencode/everything-backend-memory/` dentro de tu proyecto en tiempo de ejecución.
