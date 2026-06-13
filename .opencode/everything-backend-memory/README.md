# Everything Backend Memory

This directory contains project memory for the everything-backend skill system.

## Files

- `project-overview.md` - Project type, purpose, and structure
- `tech-stack.md` - Languages, frameworks, and databases
- `api-patterns.md` - API conventions and endpoints
- `db-schema.md` - Database tables and relationships
- `decisions.md` - Architecture decision records
- `issues.md` - Known issues and TODOs

## Usage

The backend-discovery skill reads and updates these files when exploring a project.
The backend-refresh-memory skill compares project state with these files and updates them.
Other skills (backend-architect, backend-db-design, etc.) read these files for context.

## Maintenance

Memory files should be updated:
- When starting a new project (run backend-discovery)
- After major code changes (run backend-refresh-memory)
- Before starting new backend work (run backend-refresh-memory)
