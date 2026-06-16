# Shared Tool Rules

These rules apply whenever a backend skill needs to inspect, navigate, or change a codebase with OMO or Opencode tools.

## Default Investigation Toolkit

1. **`glob`** — map directory structure and find manifests, routes, models, migrations, configs, and tests.
2. **`read`** — inspect manifests, configs, README files, memory files, and representative source files.
3. **`grep`** — locate endpoints, auth patterns, ORM usage, validators, error classes, env vars, and changed markers.
4. **`lsp_*` tools** (`lsp_symbols`, `lsp_find_references`, `lsp_goto_definition`, `lsp_diagnostics`) — trace definitions, references, symbols, and type/compile errors in supported languages.
5. **`bash`** — run tests, lint, audits, builds, migrations, and the application itself.
6. **Agent delegation** — for parallel searches, use OMO's `call_omo_agent` or Opencode's `task()`. Use explore agents for codebase search and librarian/research agents for external framework or library research.

## How to Use Them

- Start with `glob` and `read` to build context before proposing changes.
- Use `grep` to find patterns across files; confirm findings with `read`.
- Use `lsp_*` tools to trace architectural boundaries and catch errors after edits.
- Use `bash` for dynamic checks that produce observable evidence (exit codes, output, line numbers).
- Delegate broad or cross-cutting searches to the platform agent call (OMO: `call_omo_agent`, Opencode: `task()`) with explore/research parameters.
