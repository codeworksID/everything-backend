# Phase Plan (hand-off to deploy)

The phase plan tells backend-deploy (and the user) which migration runs when, and tracks a multi-release change across sessions. Write it in two places:

1. `.opencode/everything-backend-memory/deployment.md`, section `## Migration Phases`: one entry per change. backend-deploy owns this file; append or update only this section. If the file does not exist, create it with just this section and a `## Last Updated` timestamp.
2. `docs/runbooks/migration-<slug>.md`: the full runbook with commands, timeouts, checks and rollback.

Also add a short entry to `decisions.md` when the change starts (status Proposed or Accepted) and update its status when the contract finishes or is abandoned.

## Labels

Every migration file gets three labels, in a comment at the top of the file and in the phase plan:

- Kind: `expand` (adds or relaxes; old and new code both work) or `contract` (removes or tightens; only new code works). Data-only backfills are `backfill`.
- Timing:
  - `pre-deploy`: runs before the new app version rolls out. All expand migrations.
  - `post-deploy`: runs only after every instance runs the new code and the old version is gone from all pools (including canary and rollback targets). All contract migrations.
  - `job`: long backfills run as a separate job, not inside the deploy step.
- Reversibility: `reversible` or `ONE-WAY` (see [rollback-and-verification.md](rollback-and-verification.md)). One-way steps need the backup gate.

A migration that is both (for example, a drop bundled with an add) must be split.

## Entry Template

Each change is one `###` entry under the `## Migration Phases` section. Keep closed entries (contracted or abandoned) for history.

```markdown
## Migration Phases

### [YYYY-MM-DD] users.email -> contact_email (slug: rename-user-email)

#### Status
planned | expand-applied | dual-write-live | backfilled | reads-switched | old-writes-stopped | contract-ready | contracted | abandoned

#### Phases
| # | Migration / release | Kind | Timing | Reversible | Applied to (env, date, migration ID) |
|---|---------------------|------|--------|------------|--------------------------------------|
| 1 | 20261102_add_contact_email | expand | pre-deploy | yes | staging 2026-11-03 |
| 2 | 20261102_contact_email_unique_idx (no transaction) | expand | pre-deploy | yes | |
| 3 | app release: dual-write | app | deploy | yes | |
| 4 | backfill job contact_email | backfill | job | yes | |
| 5 | 20261110_contact_email_not_null (C1-C3) | expand | pre-deploy | yes | |
| 6 | app release: read new, still dual-write | app | deploy | yes | |
| 7 | 20261120_users_email_drop_not_null | expand | pre-deploy | yes | |
| 8 | app release: write new only | app | deploy | yes | |
| 9 | 20261201_drop_users_email | contract | post-deploy | ONE-WAY | |

#### Gates
- Parity check result: (count, date)
- Contract Gate: references clear / release soak / backup or PITR time / user confirmation

#### Runbook
docs/runbooks/migration-rename-user-email.md
```

## Rules for backend-deploy

- Run `pre-deploy` migrations as one gated pipeline step before the app rollout, from a single runner (CI job, Kubernetes Job or Helm pre-upgrade hook) that holds the tool's migration lock. Never run migrations from every replica at startup.
- Run `job` backfills separately, after dual-write is live on every instance.
- Never auto-run a `contract` migration in the same pipeline run as the app deploy. Run it in a later release, only after the Contract Gate is recorded as passed.
- Most tools apply every pending file in the migrations directory and cannot filter by label. Merge a contract migration file into the deployed branch only in the release where it is meant to run (after the Contract Gate), or keep it outside the tool's path, or pin the job to an explicit target version. Otherwise the next automatic `pre-deploy` step applies it early.
- If the app rollout fails after an expand migration, roll back the app only; expand migrations are designed to stay.
- Authoring or changing migrations is backend-migrate's job; deploy hands back if a migration is missing a label.

## Resuming Across Sessions

At the start of every run, read `## Migration Phases` in deployment.md. For an open entry, report the current status and the next phase, and check that its gate is met before doing anything else. Update the status and the "Applied to" column after each approved apply.
