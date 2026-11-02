# Host Tools

Skills describe actions ("find files", "search file contents", "run a shell command"), not tool names. This file maps each action to the tool names of each supported host, says what to do when a capability is missing, and explains how command enforcement works per host.

Tool names change between host versions. If a name below does not match your host, pick the tool whose description matches the action.

## Action Map

| Action | OpenCode / OMO | Claude Code | Claude.ai (code execution) | Cursor | Antigravity / Gemini |
|---|---|---|---|---|---|
| Find files by pattern | `glob` | `Glob` | shell: `find`, `ls`, `rg --files` | file search (glob) | `glob` |
| Search file contents | `grep` | `Grep` | shell: `rg` or `grep -rn` | `grep`, codebase search | `search_file_content` (grep) |
| Read a file | `read` | `Read` | file view tool, or shell `cat`/`sed -n` | read file | `read_file`, `read_many_files` |
| Create or edit a file | `edit`, `write` | `Edit`, `Write` (`MultiEdit` on older builds) | file create / string-replace tools | edit file, search-replace | `replace`, `write_file` |
| Run a shell command | `bash` | `Bash` (plus `PowerShell` on Windows) | `bash` (sandboxed Linux) | run terminal command | `run_shell_command` |
| LSP diagnostics | `lsp_diagnostics` | LSP tool when a language-server plugin is installed | not available | read lints | not built in |
| LSP references / definition / symbols | `lsp_find_references`, `lsp_goto_definition`, `lsp_symbols` | LSP tool when available | not available | go to definition / references via codebase search | not built in |
| Delegate to a subagent | `call_omo_agent` (OMO), `task()` (OpenCode) | `Task` / Agent tool | not available | subagent or background agent, if enabled | not built in in most versions |
| Ask the user | ask in chat (question tool if present) | `AskUserQuestion`, or ask in chat | ask in chat | ask in chat | ask in chat |
| Web or docs research | `webfetch`, OMO librarian agent, docs MCP servers | `WebFetch`, `WebSearch` | web search, if enabled | web search | `google_web_search`, `web_fetch` |

## When a Capability Is Missing

- **No LSP**: run the project's type-checker or compiler instead (`tsc --noEmit`, `mypy`, `pyright`, `go vet`, `cargo check`, `dotnet build`). For references, search file contents for the symbol name and confirm each hit by reading it. State in the output that LSP was not available.
- **No subagents**: do the work sequentially in the main session. Keep searches narrow (one module or pattern at a time) so context stays small.
- **No shell** (rare): do read-only analysis only. Do not claim tests, builds or audits passed. Report every check that needs a shell as "did not run" and give the user the exact commands.
- **No file-search or content-search tool**: use the shell (`rg`, `grep -rn`, `find`; on Windows PowerShell `Get-ChildItem -Recurse -Include`, `Select-String`).
- **No web access**: rely on the project's lockfile, installed packages and local docs. Say which facts were not checked against current upstream docs.
- **No Node.js**: the enforcement scripts in `<shared>/scripts/` cannot run. Follow the manual procedures in `tool-rules.md` (checkpoints by hand, Always Ask First judged by reading the command).
- **Claude.ai sandbox**: there is no access to the user's machine, databases or cloud accounts. Work on uploaded files only; everything outside the sandbox is a step for the user to run.

## Enforcement per Host

The `mode=auto` contract in `tool-rules.md` is the rule. These tools help enforce it; none of them widens it.

### Claude Code: plugin hook

Installed as a plugin, the pack ships `hooks/guard-hook.js` as a `PreToolUse` hook. It reads the hook JSON from stdin and:

- for `Bash` and `PowerShell` calls, classifies `tool_input.command` with `guard.js`; on "ask" it returns `permissionDecision: "ask"` with the reason `everything-backend guard: <reason>`, so Claude Code shows a confirmation prompt;
- for `Write`, `Edit` and `MultiEdit`, asks before touching secret files: `.env`, `.env.*` (except `.env.example`, `.env.sample`, `.env.template`), `*.pem`, `*.key`, `id_rsa*`, `credentials*.json`;
- prints nothing (no objection) for everything else, and never crashes the session: on an internal error it exits 0 silently.

Control it with the environment variable `EVERYTHING_BACKEND_GUARD`:

- unset: default mode;
- `strict`: also asks for any git ref write, dependency install/upgrade/remove, and `curl | sh` pipes;
- `off`: disables the hook.

Plain skill installs (`~/.claude/skills`, `<project>/.claude/skills`) do not include the hook. Use the manual check below, or add the hook to your settings yourself.

### Other hosts: run guard.js manually

On a host without the hook, before a non-read-only shell command in `mode=auto`, classify it:

```bash
node <shared>/scripts/guard.js -- "<command>"
node <shared>/scripts/guard.js --shell powershell -- "<command>"
node <shared>/scripts/guard.js --strict -- "<command>"
```

It prints JSON (`decision`, `category`, `reason`). Exit 0 means "allow" (guard has no objection; the contract and host permissions still apply). Exit 10 means "ask": treat the command as Always Ask First. Compound commands (`&&`, `||`, `;`, `|`, newlines) are checked part by part.

The `category` field is one of these ids (`node <shared>/scripts/guard.js --list-categories` prints the current list):

| Category | Mode | Asks for |
|---|---|---|
| `git-history` | default | reset --hard, clean -f, checkout -- path / checkout ., restore (not --staged), push --force, branch -D, checkout -B / switch -C, stash drop/clear |
| `migration` | default | applying, reverting or resetting migrations, or pushing a schema to a database |
| `destructive-sql` | default | SQL clients running DROP, TRUNCATE, ALTER, DELETE/UPDATE without WHERE, or SQL from a file; dropdb, mysqladmin drop, pg_restore --clean |
| `deploy-infra` | default | kubectl, helm, terraform/tofu, pulumi, docker push, compose down -v, fly, vercel --prod, cloud CLI deploys and deletes |
| `recursive-delete` | default | rm -rf / Remove-Item -Recurse outside obvious build, cache and temp folders |
| `git-write` | strict | any git ref write (commit, push, merge, rebase, switch/checkout of a ref, stash, tag) |
| `dependency-change` | strict | installing, upgrading or removing dependencies |
| `remote-script` | strict | piping a downloaded script into a shell (curl \| sh) |

Guard "allow" never overrides the contract. If guard allows a command that the contract puts under Always Ask First (for example a test run against a non-local database), ask.

### OpenCode: permission config

OpenCode can ask before matching shell commands. This `opencode.json` snippet mirrors the guard's default categories. Patterns are globs matched against the command; keep the host's default for everything else.

```json
{
  "permission": {
    "bash": {
      "git reset --hard*": "ask",
      "git clean -f*": "ask",
      "git checkout -- *": "ask",
      "git checkout .*": "ask",
      "git restore *": "ask",
      "git push* --force*": "ask",
      "git push* -f*": "ask",
      "git branch -D *": "ask",
      "git stash drop*": "ask",
      "git stash clear*": "ask",
      "*prisma migrate deploy*": "ask",
      "*prisma migrate reset*": "ask",
      "*prisma db push*": "ask",
      "*drizzle-kit push*": "ask",
      "*drizzle-kit migrate*": "ask",
      "*knex migrate*": "ask",
      "*sequelize db:migrate*": "ask",
      "*typeorm migration:run*": "ask",
      "*mikro-orm migration:*": "ask",
      "alembic upgrade*": "ask",
      "alembic downgrade*": "ask",
      "*manage.py migrate*": "ask",
      "*manage.py flush*": "ask",
      "*rails db:*": "ask",
      "flyway migrate*": "ask",
      "flyway clean*": "ask",
      "liquibase update*": "ask",
      "migrate *": "ask",
      "goose *": "ask",
      "atlas migrate apply*": "ask",
      "atlas schema apply*": "ask",
      "dotnet ef database *": "ask",
      "sqlx migrate run*": "ask",
      "psql *": "ask",
      "mysql *": "ask",
      "sqlite3 *": "ask",
      "mongosh *": "ask",
      "kubectl apply*": "ask",
      "kubectl delete*": "ask",
      "kubectl rollout*": "ask",
      "kubectl scale*": "ask",
      "helm install*": "ask",
      "helm upgrade*": "ask",
      "helm uninstall*": "ask",
      "helm rollback*": "ask",
      "terraform apply*": "ask",
      "terraform destroy*": "ask",
      "tofu apply*": "ask",
      "tofu destroy*": "ask",
      "pulumi up*": "ask",
      "pulumi destroy*": "ask",
      "docker push*": "ask",
      "docker compose down -v*": "ask",
      "fly deploy*": "ask",
      "vercel --prod*": "ask",
      "gcloud * deploy*": "ask",
      "aws * delete*": "ask",
      "aws * deploy*": "ask",
      "serverless deploy*": "ask",
      "rm -rf *": "ask",
      "Remove-Item * -Recurse*": "ask"
    }
  }
}
```

Glob patterns are coarser than `guard.js`: `psql *` asks for every psql call (guard only asks for destructive SQL), `git restore *` also asks for `git restore --staged`, `rm -rf *` misses `rm -fr`, and a command hidden after `&&` may not match a prefix pattern. Running `guard.js` remains the more precise check.

### Cursor and Antigravity

Neither runs the guard automatically. Run `guard.js` manually as above, and keep the host's own command-approval setting on (do not enable "run everything" / auto-run for shell commands while using these skills).

## Where Skills Install

Each skill is a folder with `SKILL.md`, optional `references/`, and access to `_shared/` (either bundled inside the skill folder or as a sibling folder). See `context-loading.md` -> Resolving `_shared/` Files.

| Host | Location | `_shared/` |
|---|---|---|
| Claude Code (plugin) | installed through the plugin system; ships the skills plus `hooks/guard-hook.js` | sibling folder inside the plugin |
| Claude Code (personal) | `~/.claude/skills/<skill>/` | `~/.claude/skills/_shared/` |
| Claude Code (project) | `<project>/.claude/skills/<skill>/` | `<project>/.claude/skills/_shared/` |
| Claude.ai | upload each skill as a zip (Settings -> Capabilities -> Skills; code execution must be enabled). `node scripts/build-claude-skills.js` builds the zips | bundled: copy `_shared/` into each skill folder before zipping |
| OpenCode / OMO, generic agents | `~/.agents/skills/<skill>/` or `<project>/.agents/skills/<skill>/` | sibling `_shared/` |
| Cursor | `~/.cursor/skills/<skill>/` | sibling `_shared/` |
| Antigravity | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill>/` | sibling `_shared/` |

Memory always lives in `<project>/.opencode/everything-backend-memory/`, whatever the host. The path is kept for compatibility.
