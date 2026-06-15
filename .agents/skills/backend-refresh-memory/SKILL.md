---
name: backend-refresh-memory
description: "Compare current project state with memory files and update them. Detects changes in API routes, database schema, dependencies, and structure. Use this skill when the user says 'refresh memory', 'update memory', 'sync memory', or after major code changes."
---

# Backend Refresh Memory

## When to Activate

- User says "refresh memory", "update memory", "sync memory"
- After major code changes have been made
- Before starting new backend work
- When memory might be stale
- Periodically to keep memory current

## Refresh Process

### Step 0.5: Tool Usage Rules (MANDATORY)

Use OpenCode tools explicitly while refreshing memory:

1. **`glob`** to find manifests, route files, models, migrations, configs, and tests
2. **`read`** to inspect current memory files and changed source files
3. **`grep`** to detect new routes, dependencies, schema objects, env vars, and architectural markers
4. **`ast_grep_search`** to confirm structural code changes when text matching is ambiguous
5. **`lsp_symbols` / `lsp_find_references`** to verify renamed or relocated symbols in supported languages
6. **`task` with `subagent_type="explore"`** for parallel scanning when the project is large

### Step 0.6: Principles to Track

When updating memory, record not just file changes but also principle-level changes:

- New or removed normalization/denormalization decisions, foreign keys, indexes, and transaction boundaries
- New or changed layering rules, dependency boundaries, service/repository splits, or module responsibilities
- New API conventions for validation, pagination, versioning, auth/authz, rate limiting, and error shape
- New system behaviors such as caching, queue processing, observability, scaling assumptions, or event-driven flows
- New security controls such as RBAC, audit logging, encryption, or least-privilege boundaries

### Step 1: Load Current Memory

Read all files in `.opencode/everything-backend-memory/`:

- `project-overview.md` - Current project type and structure
- `tech-stack.md` - Current technologies
- `api-patterns.md` - Current API conventions
- `db-schema.md` - Current database schema
- `decisions.md` - Past architecture decisions
- `issues.md` - Known issues and TODOs

Parse and create an in-memory representation of the current state.

### Step 2: Project Scan

Use `explore` agents to traverse the project:

- **Glob patterns** to find all relevant files
- **Read key files** to understand current state
- **Compare** with memory timestamps
- **Identify** new, modified, and deleted files

Key files to scan:
- `package.json` / `requirements.txt` / `go.mod` / `pom.xml`
- Route definitions (all files in `routes/`, `api/`, `controllers/`)
- Database schemas (Prisma, SQLAlchemy, GORM, etc.)
- Migration files
- Configuration files

### Step 3: Change Detection

#### New Files Detected
- New API routes → Update `api-patterns.md`
- New database models → Update `db-schema.md`
- New dependencies → Update `tech-stack.md`
- New configurations → Update `project-overview.md`

#### Modified Files Detected
- Changed API routes → Update `api-patterns.md`
- Changed database schema → Update `db-schema.md`
- Changed dependencies → Update `tech-stack.md`
- Changed architecture → Update `project-overview.md`

#### Deleted Files Detected
- Removed API routes → Mark as deprecated in `api-patterns.md`
- Removed database models → Mark as deprecated in `db-schema.md`
- Removed dependencies → Mark as removed in `tech-stack.md`

### Step 4: Diff Generation

Generate a change summary:

```markdown
# Memory Refresh Summary

## Changes Detected
- [NEW] src/routes/users.ts → New API route module
- [MODIFIED] prisma/schema.prisma → Added User table
- [DELETED] src/routes/old-route.ts → Removed endpoint

## Updates to Apply
- `api-patterns.md`: Add /users endpoint
- `db-schema.md`: Add User table
- `tech-stack.md`: Add zod dependency

## Conflicts
- None / [List any conflicts detected]
```

### Step 5: User Confirmation

Present the change summary and ask:

- "Should I update memory with these changes?"
- "Any changes to ignore?"
- "Any conflicts to resolve?"

**NEVER** apply changes without explicit user confirmation.

### Step 6: Memory Update

After approval, update affected files:

1. Preserve existing content
2. Add new discoveries with timestamps
3. Mark deprecated items clearly
4. Update the "Last Updated" timestamp
5. Add entry to `decisions.md` if major changes

Update format for additions:
```markdown
## [2026-06-13] New Finding
- Added: [What was added]
- Source: [File path]
```

## Decision Trees

### If API routes changed:
- Detect new endpoints by scanning route files
- Check for changed request/response schemas
- Check for new middleware
- Check for new authentication methods
- Update `api-patterns.md` accordingly

### If database schema changed:
- Detect new tables/collections
- Detect changed columns/fields
- Detect new relationships
- Detect new indexes
- Update `db-schema.md` accordingly

### If dependencies changed:
- Detect new packages in manifest files
- Detect version updates
- Detect removed packages
- Update `tech-stack.md` accordingly

### If configuration changed:
- Detect new environment variables
- Detect new config files
- Detect changed settings
- Update `project-overview.md` accordingly

## Templates

### Change Summary Template
```markdown
# Memory Refresh Summary

**Date**: [ISO timestamp]
**Project**: [Project name]

## Changes Detected

### Added
- [NEW] file1.ts → [Description]
- [NEW] file2.py → [Description]

### Modified
- [MODIFIED] schema.prisma → [What changed]
- [MODIFIED] routes/users.ts → [What changed]

### Deleted
- [DELETED] old-route.ts → [What was removed]

## Updates to Apply

- `api-patterns.md`: [List of updates]
- `db-schema.md`: [List of updates]
- `tech-stack.md`: [List of updates]
- `project-overview.md`: [List of updates]

## Conflicts
- [None / List conflicts]

## Recommended Action
[Update all / Update specific files / Resolve conflicts first]
```

### Memory Update Entry Template
```markdown
## [YYYY-MM-DD HH:MM] Refresh Update

### Changes Applied
- [What was updated]

### Files Modified
- [Which memory files were updated]

### Source
- [What triggered the refresh]
```

## Edge Cases

- **No memory files exist**: Suggest running `backend-discovery` first
- **Memory files corrupted**: Ask user to confirm before rebuilding
- **Conflicting changes detected**: Present conflicts to user, do not auto-resolve
- **Large number of changes**: Batch updates by file, confirm each batch
- **No changes detected**: Report "Memory is up to date"
- **Deleted memory items**: Mark as deprecated, do not remove without confirmation
