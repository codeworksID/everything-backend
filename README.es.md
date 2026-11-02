# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **¡Abierto a contribuciones!** Issues, pull requests y traducciones son bienvenidos. Visita las pestañas de [Issues](../../issues) y [Pull Requests](../../pulls) para comenzar.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Skills de backend de Opencode reutilizables que cubren descubrimiento de proyectos, arquitectura, diseño de bases de datos, diseño de API, implementación, pruebas, autenticación, operaciones, despliegue, migraciones, visualización, chequeos de salud y actualización de memoria.

## Skills incluidos

- `backend-orchestrator` — enruta las peticiones al skill de backend correcto
- `backend-scan` — explora un proyecto existente y mantiene sincronizados los archivos de memoria
- `backend-architect` — planifica la arquitectura del backend y la selección del stack tecnológico
- `backend-db-design` — diseña esquemas de bases de datos y planes de migración
- `backend-visualize` — genera hermosos diagramas Mermaid (ERD, clases, actores, flujo, secuencia, arquitectura)
- `backend-api-design` — diseña endpoints de API y sus contratos
- `backend-implement` — genera o modifica código de backend
- `backend-refactor` — refactorización que preserva el comportamiento: divide controladores/servicios sobrecargados, extrae módulos, reduce el acoplamiento, strangler fig, moderniza código legacy
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
4. **`backend-db-design`** — Diseña tablas, relaciones, índices y un plan de migración antes de escribir código (`backend-migrate` escribe y aplica los archivos de migración).
5. **`backend-api-design`** — Define endpoints, esquemas de request/response y contratos de error.
6. **`backend-implement`** — Convierte diseños en código funcional, o evoluciona código existente.
7. **`backend-test`** — Añade pruebas, fixtures, mocks y cobertura a continuación.

Después de lo básico, toma los skills especializados según los necesites:

- **`backend-auth`** — para login, signup, JWT, RBAC y permisos.
- **`backend-ops`** — para logging, metrics, tracing, caching y mensajería asíncrona.
- **`backend-deploy`** — para Docker, CI/CD y configuración de infraestructura.
- **`backend-migrate`** — para evolución de esquemas y migraciones zero-downtime.
- **`backend-refactor`** — para dividir controladores y servicios sobrecargados, extraer módulos, reducir el acoplamiento y modernizar código legacy sin cambiar su comportamiento.
- **`backend-doctor`** — para chequeos de salud, linting, type checks y revisión de código.
- **`backend-visualize`** — para diagramas ERD, de arquitectura y de flujo.

## Instalación

Ejecuta el instalador usando `npx`:

```bash
npx everything-backend
```

El instalador se ejecutará de forma interactiva y te pedirá elegir:

1. **Global** — Instala los skills como plugin global del IDE/aplicación. Se te preguntará a qué aplicación apuntar:
   - **Antigravity (Gemini IDE)** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills`
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

El instalador copia cada carpeta de skill de `.agents/skills/` junto con la carpeta compartida `_shared/` en el destino que elijas. Los skills buscan `_shared/` junto a su propia carpeta, así que ambas siempre van juntas.

| Destino | Los skills se instalan como | Archivos extra |
|---|---|---|
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | — |
| Opencode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | — |
| Per-project | `<project-path>/.agents/skills/<skill-name>/SKILL.md` | — |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | — |

`_shared/` siempre queda junto a las carpetas de los skills (por ejemplo `~/.agents/skills/_shared/`). Las carpetas de skills que ya existen se omiten salvo que uses `--force`.

## Uso en Opencode

Después de la instalación, los skills están disponibles por nombre. Ejemplos:

- `backend-orchestrator` — enruta las peticiones de backend al sub-skill correcto
- `backend-scan` — inspecciona un codebase de backend existente y mantiene la memoria actualizada
- `backend-api-design` — diseña endpoints y esquemas
- `backend-visualize` — dibuja ERDs, diagramas de clases, diagramas de arquitectura y más
- `backend-implement` — convierte diseños en código
- `backend-refactor` — reestructura código existente sin cambiar su comportamiento
- `backend-test` — añade o expande pruebas
- `backend-auth` — añade autenticación y autorización
- `backend-doctor` — ejecuta un chequeo de salud del backend

## Qué hacen los skills en tu proyecto

- **Archivos de memoria**: los skills escriben la memoria del proyecto (resumen, stack, decisiones, issues abiertos) en `.opencode/everything-backend-memory/` dentro de tu proyecto, y los checkpoints y parches de cada ejecución en `.opencode/everything-backend-memory/.checkpoints/`. Añade la carpeta de checkpoints a `.gitignore`.
- **El modo auto es el predeterminado**: el agente lee código y ejecuta comandos locales y herméticos (lint, type-check, build, pruebas unitarias, auditorías de dependencias de solo lectura) sin preguntar.
- **Siempre pregunta antes** de aplicar migraciones o modificar una base de datos; hacer git commit, cambiar de rama, reset, clean, stash, rebase, merge o push; borrar o sobrescribir archivos que no creó; instalar, actualizar o eliminar dependencias; deploys, push de imágenes, IaC apply, rotación de secretos o llamadas a APIs externas de pago; editar archivos de CI/CD o de secretos; y ejecutar pruebas o la aplicación contra cualquier base de datos, cola o servicio que no sea demostrablemente local. Nunca omite ni debilita una prueba que falla para que pase.
- **Modo interactivo**: di "ask me before each step" para aprobar tú mismo cada paso.

## Desarrollo

Para probar el instalador sin tocar tu directorio global real:

```bash
node scripts/install.js --dry-run --target ./tmp-skills
node scripts/install.js --target ./tmp-skills --force
rm -rf ./tmp-skills   # borra la instalación de prueba; no la subas al repositorio
npm run check
```

`npm run check` (también se ejecuta en `prepublishOnly`) verifica que existan las rutas de `bin` y `files`, que cada skill tenga un frontmatter válido, que cada skill aparezca en `README.md` y en `backend-orchestrator`, y que exista cada archivo `_shared/` referenciado.

## Layout del repositorio

```text
.agents/skills/            Definiciones de skills (una carpeta por skill)
.agents/skills/_shared/    Documentos de referencia compartidos por todos los skills
scripts/install.js         Instalador NPX/local
scripts/check-package.js   Verificación de consistencia del paquete y los skills (npm run check)
docs/                      Informes de auditoría
.github/                   Plantillas de issues y pull requests
```

`.opencode/` no forma parte de este repositorio: los skills crean `.opencode/everything-backend-memory/` dentro de tu proyecto en tiempo de ejecución.
