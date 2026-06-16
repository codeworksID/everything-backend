# Context Loading Prerequisites

Shared prerequisites for every backend skill. Skills reference this document instead of duplicating checks.

All examples use OpenCode-native tools first (`glob`, `read`), then platform-specific shell commands. Pick the approach that matches your environment.

## Standard Prerequisites

Run these checks before any skill does real work. Skills may add domain-specific prerequisites on top.

### 1. Project Root Confirmation

Verify a backend project exists at the working path.

**OpenCode-native (cross-platform):**

```
glob **/{package.json,pyproject.toml,go.mod,pom.xml,build.gradle,Cargo.toml,Gemfile}
```

If no manifest is found, also check for source directories:

```
glob {src,app,internal,lib,cmd}/**
```

If both return empty, stop and ask the user for the correct project path.

**PowerShell:**

```powershell
Test-Path -Path "src","app","internal","lib" -PathType Container
```

**Bash:**

```bash
test -d src || test -d app || test -d internal || test -d lib
```

### 2. Manifest Detection

Identify the project's language, package manager, and framework entry points.

**OpenCode-native (cross-platform):**

```
glob **/{package.json,pyproject.toml,go.mod,pom.xml,build.gradle,Cargo.toml,Gemfile,requirements.txt,Pipfile,setup.py}
```

Then `read` the first match to extract language, framework, test runner, and database info.

**PowerShell:**

```powershell
Get-ChildItem -Path . -Filter "*.json","*.toml","*.mod","*.xml","*.gradle" -Name | Select-Object -First 5
# More targeted:
@("package.json","pyproject.toml","go.mod","pom.xml","build.gradle","Cargo.toml","Gemfile") |
  Where-Object { Test-Path $_ } |
  Select-Object -First 1
```

**Bash:**

```bash
ls package.json pyproject.toml go.mod pom.xml build.gradle Cargo.toml Gemfile 2>/dev/null | head -1
```

### 3. Shared File Presence

Check that the `_shared/` reference files exist alongside the skill.

**OpenCode-native (cross-platform):**

```
glob .agents/skills/_shared/*.md
```

Expected results: `principles.md`, `tool-rules.md`, `memory-schema.md`, `context-loading.md`. If any are missing, note it in the output but do not block execution.

### 4. Memory Directory and Memory File Fallback

Backend skills persist project context in `.opencode/everything-backend-memory/`.

**Check if the directory exists and has files:**

**OpenCode-native (cross-platform):**

```
glob .opencode/everything-backend-memory/*.md
```

If the result is empty, the memory directory either does not exist or has no memory files. In that case:

1. If the skill supports `mode=initial` (e.g., `backend-scan`), run it to create memory files.
2. Otherwise, suggest the user run `backend-scan` first, or proceed with manifest-only context if the user confirms.

**PowerShell:**

```powershell
# Directory exists?
Test-Path -Path ".opencode\everything-backend-memory" -PathType Container
# Has memory files?
Get-ChildItem -Path ".opencode\everything-backend-memory" -Filter "*.md" -Name
```

**Bash:**

```bash
# Directory exists?
test -d .opencode/everything-backend-memory
# Has memory files?
ls .opencode/everything-backend-memory/*.md 2>/dev/null
```

**Fallback rule:** If a specific memory file is missing but others exist, proceed with available context and note the gap. If all memory files are missing, run `backend-scan` with `mode=auto` before continuing.

### 5. Staleness Check

Before trusting memory files as ground truth, check whether the source code has changed since the last memory update.

**OpenCode-native:**

```
read .opencode/everything-backend-memory/project-overview.md
```

Look for `## Last Updated` timestamp. Then:

**PowerShell:**

```powershell
git log -1 --format=%ct -- src/
```

**Bash:**

```bash
git log -1 --format=%ct -- src/
```

Compare the git timestamp against the memory file's `## Last Updated`. If the git commit is newer, the memory file is stale. Run `backend-scan` with `mode=sync` to refresh.

If `git` is unavailable, proceed with the memory files as-is and note that staleness was not verified.

## Cross-Platform Command Reference

Skills should prefer OpenCode-native tools (`glob`, `read`, `grep`, `bash`) for portability. When shell commands are unavoidable, use the platform-appropriate form.

| Task | OpenCode-native | PowerShell | Bash |
|---|---|---|---|
| Check directory exists | `glob <dir>/**` | `Test-Path -Path <dir> -PathType Container` | `test -d <dir>` |
| Find manifest files | `glob **/{package.json,...}` | `@("package.json",...) \| Where-Object { Test-Path $_ }` | `ls package.json ... 2>/dev/null` |
| List memory files | `glob .opencode/everything-backend-memory/*.md` | `Get-ChildItem .opencode\everything-backend-memory\*.md` | `ls .opencode/everything-backend-memory/*.md` |
| Read a file | `read <path>` | `Get-Content <path>` | `cat <path>` |
| Search file contents | `grep <pattern>` | `Select-String -Pattern <pattern>` | `grep <pattern>` |
| Git last commit time | `bash` tool: `git log -1 --format=%ct -- <path>` | `git log -1 --format=%ct -- <path>` | `git log -1 --format=%ct -- <path>` |

## Standard Required Context Priority List

When loading memory files, read them in this order unless the skill defines a domain-specific override. Earlier files have higher priority.

| Priority | Memory File | Contents | When to Load |
|---|---|---|---|
| 1 | `project-overview.md` | Project type, purpose, structure, module boundaries | Always |
| 2 | `tech-stack.md` | Languages, frameworks, databases, ORMs, auth, testing, infrastructure | Always |
| 3 | `db-schema.md` | Database type, tables/collections, relationships, indexes, invariants | When working with data, models, migrations, or queries |
| 4 | `api-patterns.md` | Protocol, base path, auth method, conventions, endpoint inventory | When working with endpoints, routes, controllers, or contracts |
| 5 | `decisions.md` | Architecture decisions with context, consequences, and status | When architecture or cross-cutting design questions arise |
| 6 | `test-strategy.md` | Test runners, fixtures, mocking conventions, coverage targets | When writing, running, or reviewing tests |
| 7 | `deployment.md` | Deployment targets, CI/CD pipelines, container config, environment variables | When working with infrastructure, containers, or CI/CD |

**Loading rules:**

- Load priorities 1 and 2 on every invocation.
- Load 3 and 4 when the task touches relevant code (data access, endpoints).
- Load 5 lazily: only when the implementation raises an architecture question.
- Load 6 when the task involves testing.
- Load 7 when the task involves deployment, infrastructure, or CI/CD.

**If a file is missing from the list:** note the gap in output, proceed with available context, and suggest running `backend-scan` to populate the missing file.

**If memory is empty entirely:** run `backend-scan` with `mode=auto` before proceeding. If that is not possible (e.g., `backend-scan` is the skill being run), proceed with manifest-only context.

**Supplementary file:** `issues.md` (known issues, TODOs, technical debt) is not in the priority list but should be loaded when the task involves code review, health checks, or debt tracking. See `_shared/memory-schema.md` for its schema.

## How Skills Reference This Document

Each backend skill includes a short section like this:

```markdown
## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, memory file presence, fallback rules, and context priority list).

Add any skill-specific prerequisites below:
- REQUIRED: [skill-specific condition]
```

This replaces the per-skill copy-paste of bash-based checks, manifest detection, memory fallback logic, and priority lists.
