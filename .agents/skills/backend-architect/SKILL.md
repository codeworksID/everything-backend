---
name: backend-architect
description: Designs backend architecture for new and existing systems, including architecture pattern (monolith, modular monolith, microservices, serverless), tech stack, module boundaries, consistency rules and non-functional targets, then records the result as docs/architecture/overview.md, numbered ADR files in docs/adr/ and project memory. Use when the user says "design the architecture", "plan the backend", "how should I structure this", "what tech stack should I use", "should we split into microservices", "write an ADR", "redesign this system", or is starting a new project or a major feature. Hands diagrams to backend-visualize and detailed schema and API work to backend-db-design and backend-api-design.
---

# Backend Architect

Turns a problem statement (greenfield) or an existing codebase (brownfield) into a written architecture: an overview document, one ADR per significant decision, and updated project memory that downstream skills read.

## When to Use

- New project or major feature that needs a structure, stack, or pattern choice.
- "What tech stack should I use?", "monolith or microservices?", "write an ADR".
- Redesign of an existing system (often routed from backend-refactor).

Not this skill: diagrams only (backend-visualize), table design (backend-db-design), endpoint contracts (backend-api-design), threat modeling and security review (backend-security), code changes (backend-implement, backend-refactor).

## Before You Start

1. Resolve the shared docs folder (`<shared>`): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints), `<shared>/principles.md` (all sections: Database, Code/Architecture, API, System, Security) and `<shared>/memory-schema.md` (decisions.md and project-overview.md formats). Read `<shared>/host-tools.md` if the action names below don't match your host's tools.
3. Load project memory per `<shared>/context-loading.md`: project-overview.md, tech-stack.md and decisions.md always; db-schema.md and api-patterns.md when they exist. Then pick the branch:
   - **Greenfield** (no manifest and no source directories): do not stop and do not run backend-scan. Proceed with requirements; this skill's output bootstraps memory.
   - **Brownfield** with missing or stale memory: run backend-scan (mode=auto) first, or ask the user to run it. Do not design an existing system from guesses.
4. If the detected or chosen stack matches a file in `<shared>/stacks/`, read it.

## Ownership

This skill owns the architecture pattern, the tech stack, the primary database engine and the API protocol. It records each as an ADR plus a decisions.md entry. backend-db-design, backend-api-design and backend-implement honor Accepted decisions and propose a new ADR (through this skill) instead of silently changing them.

## Workflow

### Step 1: Gather requirements

Collect these inputs. In mode=auto, infer what you can from the request and memory, then ask **one batched question** for anything blocking (problem statement, scale class, hard constraints). In mode=interactive, ask iteratively and confirm a summary.

1. Problem and key features (CRUD, real-time, file upload, jobs, integrations).
2. Load and data: users/day, peak requests/sec, data volume and growth.
3. Targets: latency (p95/p99), availability (SLO), RPO/RTO, data residency, compliance.
4. Tenancy: single-tenant, shared multi-tenant, or isolated per tenant.
5. Constraints: team size and skills, timeline, budget, existing tech and hosting.

Done when: a non-empty problem statement exists and every input is either answered or written down as an explicit assumption. Without a problem statement, stop and ask.

### Step 2: Assess the current state (brownfield only)

Document what exists before proposing anything new. Read references/brownfield.md for the procedure. In short: derive modules, dependencies, data ownership, integrations and pain points from scan memory and code (find files, search file contents, check LSP references if available), and record them as "Current State" in the overview.

Done when: the current architecture, its pain points and the evidence for each are written down.

### Step 3: Choose the pattern

Apply the precedence order in references/patterns-and-stacks.md. The default is a monolith or modular monolith. Choose microservices only when team independence and stable module boundaries require it, not for scale alone: scale stateless instances, caching and read replicas first. Serverless fits event-driven or spiky load with a cost focus.

Done when: one pattern is chosen, with the deciding criteria and at least one rejected alternative.

### Step 4: Choose the stack

Use the criteria table in references/patterns-and-stacks.md. Team familiarity outranks raw performance unless a stated target requires otherwise. Choose the language/framework, primary database, API protocol, and only the cache, queue or broker that a requirement justifies. Name versions as "current LTS/stable" unless the project already pins one.

Done when: every chosen component maps to a requirement, and every optional component left out is noted as "not needed yet".

### Step 5: Define the design

Fill the overview template in references/overview-template.md:

- Module boundaries: responsibility, inbound interfaces, outbound ports, forbidden dependencies. Split by business capability, not by technical layer.
- Data ownership: one owner per table or collection; no shared database across services.
- Transaction and consistency rules: ACID use cases, eventual-consistency flows with compensation, idempotency for retries and async work.
- Security boundaries: authn/authz model, tenant isolation, audit trail for money or critical workflows. Hand threat modeling to backend-security and auth design to backend-auth.
- Operational rules: observability, health checks, resilience and backup/DR targets (handed to backend-ops), deploy shape (handed to backend-deploy).

For brownfield work, add a target state and a phased migration plan with exit criteria per phase (references/brownfield.md).

Done when: every module has an owner and boundaries, and every critical write flow has a transaction or consistency rule.

### Step 6: Confirm

Present a short summary: pattern, stack, modules, key trade-offs, open risks.

- mode=interactive: wait for approval; ADRs are written as **Accepted**.
- mode=auto: do not block. Write ADRs as **Proposed** and list them in the report for acceptance. Pause only for conflicting decisions or missing critical inputs.

Done when: the user approved the design, or (mode=auto) the design is written as Proposed.

### Step 7: Persist the output

Writing these files is this skill's stated output, so it runs without asking in mode=auto. Wholesale replacement of an existing overview or ADR is not; update it in place or ask first.

Start a checkpoint before the first edit:

```bash
node <shared>/scripts/checkpoint.js start --skill backend-architect --feature <slug> --steps "overview,adrs,decisions,memory"
```

Use a slug such as `architecture` or the decision topic (e.g. `split-billing`). If it exits with code 3, an open checkpoint exists: offer to resume or restart (`--restart`). Record each file you create or edit (`checkpoint.js record --created ... --modified ... --memory ...`), run `checkpoint.js snapshot` after each step, and `checkpoint.js close` when done. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

Write, in order:

1. **docs/architecture/overview.md** from references/overview-template.md. If the file exists, update the changed sections and add a dated Revision History line.
2. **One ADR per significant decision** (pattern, stack, database, protocol, tenancy, each brownfield phase boundary) at `docs/adr/NNNN-<slug>.md` from references/adr-template.md. NNNN is the next free number: list `docs/adr/`, take the highest four-digit prefix and add 1 (start at 0001). If the project already keeps ADRs elsewhere (e.g. `doc/adr/`, `docs/decisions/`), follow that location and numbering instead. When an ADR replaces an older one, set the old ADR's status to "Superseded by ADR-NNNN" and link both ways.
3. **decisions.md**: append one summary entry per ADR in the memory-schema format (references/adr-template.md -> decisions.md Summary). The ADR file is the full record; the decisions.md entry is the summary and points to it. Apply the supersede rule from memory-schema.md to the old entry.
4. **project-overview.md**: append a timestamped entry with Type (the chosen pattern), Structure (planned or current directories) and Module Boundaries, and update `## Last Updated`.
5. **tech-stack.md** (greenfield, or when the stack changes): append the chosen stack, marked "Planned (backend-architect)" until code exists, and update `## Last Updated`.

Done when: all files above exist, each ADR has a matching decisions.md entry, and the checkpoint is closed.

### Step 8: Hand off

- Diagrams: hand the module and data-flow description to backend-visualize (architecture diagram; current vs target for brownfield) and link its output from the overview's Diagrams section. If backend-visualize is unavailable, put a minimal Mermaid `flowchart` sketch in the overview.
- Next skills, in order: backend-db-design -> backend-auth -> backend-api-design -> backend-implement. Add backend-security (threat model), backend-ops (resilience, backup/DR) and backend-deploy (targets, release strategy) when the overview names them.
- Brownfield phases go to backend-refactor (behavior-preserving moves) or backend-implement (new modules).

## Done When

- [ ] Requirements and assumptions are written in the overview.
- [ ] Brownfield: current state is documented before the target state.
- [ ] docs/architecture/overview.md exists and is current.
- [ ] Every significant decision has an ADR in docs/adr/ with status Accepted (approved) or Proposed (mode=auto).
- [ ] decisions.md has one summary entry per ADR, pointing to the ADR file.
- [ ] project-overview.md (and tech-stack.md when the stack was chosen or changed) is updated.
- [ ] The checkpoint is closed and the report lists files written, open risks and the next skill.

## Edge Cases

- **User doesn't know what they need**: recommend from the requirements and explain the trade-offs.
- **Conflicting requirements**: rank them (correctness and security first, then the stated targets, then cost and speed) and state the trade-off in the ADR.
- **Team has no experience with the best-fit stack**: factor in the learning curve; usually prefer the familiar stack.
- **Large framework or pattern temptation**: prefer the simplest architecture that keeps boundaries and testability.
- **Microservice enthusiasm without clear boundaries**: recommend a modular monolith and write the extraction triggers into the ADR (references/brownfield.md).
- **Budget limits**: prefer managed services and pay-per-use; record the cost assumption.
- **Accepted decision conflicts with the new design**: do not overwrite it. Write a new ADR that supersedes it and explain why.

## References

- references/patterns-and-stacks.md: read in Steps 3 and 4 when choosing the pattern or stack, or when a requirement (real-time, scale, data-heavy, compliance) triggers a decision tree.
- references/overview-template.md: read in Step 5 and Step 7 when writing or updating docs/architecture/overview.md.
- references/adr-template.md: read in Step 7 when writing an ADR, numbering it, superseding one, or adding the decisions.md summary.
- references/brownfield.md: read when the system already exists, for current-state assessment, phased migration and service extraction triggers.
