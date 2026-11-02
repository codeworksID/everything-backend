# Backup, Restore and Disaster Recovery

A backup that has never been restored is not a backup. This reference covers targets, backup types, storage, retention, restore drills and the DR runbook.

## Safety Rules

- **Restore is Always Ask First against any non-local target** (see `<shared>/tool-rules.md` -> Always Ask First and Production Targets). Show the exact command, the resolved target host and database, and the expected effect, then wait.
- Never restore over the source database. Restore into a new instance or a new database, verify it, then cut over.
- Running `pg_dump`, `mysqldump` or `mongodump` against a non-local database also asks first: it loads the server and copies production data off it.
- Changing backup settings in IaC or a cloud console (retention, PITR, deletion protection) is IaC apply or an account setting: ask first. Generating the config file is fine.
- Never put connection strings, passwords or encryption keys in runbooks, memory or reports. Reference the secret manager entry by name.

## 1. Set RPO and RTO

- **RPO** (recovery point objective): how much data, measured in time, the business can lose.
- **RTO** (recovery time objective): how long the service can be down before it is restored.

Ask the user for both per datastore. If they do not know, propose tiers:

| Tier | Typical data | RPO | RTO | Usual mechanism |
|---|---|---|---|---|
| 1 | orders, payments, accounts | 5 min or less | 1 h | continuous WAL/binlog archiving (PITR) plus a standby or managed HA |
| 2 | internal tools, content | 1 h to 24 h | 4 to 8 h | PITR or frequent snapshots |
| 3 | caches, derived data, search indexes | rebuild | rebuild time | no backup; documented rebuild procedure |

Record the targets in `decisions.md` and in the DR runbook.

## 2. Backup Types

| Type | What it is | Good for | Limits |
|---|---|---|---|
| Logical dump | `pg_dump -Fc`, `mysqldump --single-transaction`, `mongodump` | small DBs, migration between versions, single-table restore | slow for large DBs; RPO = dump interval |
| Physical base backup | `pg_basebackup`, pgBackRest, WAL-G, Barman, XtraBackup | large DBs, fast full restore | same major version only |
| Continuous archiving (PITR) | base backup plus archived WAL (Postgres) or binlog (MySQL) | restore to any second inside the window | archiving must be monitored |
| Storage snapshot | cloud volume or managed-DB snapshots | quick full copies | crash-consistent only unless the DB is quiesced or the provider coordinates it |
| Managed service PITR | RDS/Aurora automated backups, Cloud SQL PITR, Azure Database flexible server backups | most teams on managed DBs | check retention limits and cross-region options |

Postgres PITR essentials:
- `wal_level = replica` (or higher), `archive_mode = on`, and an `archive_command` or archive library that copies WAL to durable storage. Prefer a maintained tool (pgBackRest, WAL-G, Barman) over a hand-written `archive_command`.
- Set `archive_timeout` (for example `60s`) at or below the RPO. WAL is archived per 16 MB segment, so on a quiet database a partly filled segment can sit unarchived for hours and the real RPO is unbounded. Managed services handle this themselves.
- A recent base backup is required; PITR replays WAL forward from it. Schedule full or incremental base backups so replay time fits the RTO.
- Restore sets `restore_command` and a target (`recovery_target_time`, `recovery_target_lsn` or `recovery_target_name`) and creates `recovery.signal`.
- Check `pg_verifybackup` (for `pg_basebackup` output) or the tool's own verify command after each backup.

Back up more than the database: object storage (enable versioning), secrets and config (in the secret manager, with its own recovery), IaC state, and message broker state if it holds data not reproducible from the DB.

## 3. Encryption and Off-Site Copies

- Encrypt backups at rest. Keep the keys in a KMS or secret manager, separate from the backup storage account, and back up the key access path too: a backup you cannot decrypt is lost.
- Follow 3-2-1: three copies, two storage types, one off-site. In the cloud, "off-site" means another region and preferably another account or project, so one compromised credential cannot delete everything.
- Make at least one copy immutable for the retention period (object lock or the provider's backup vault lock) to survive ransomware and accidental deletion.
- Restrict delete permissions on backups to a break-glass role.

## 4. Retention

- A common baseline: PITR window of 7 to 35 days, daily backups for 30 days, monthly backups for 12 months. Adjust to business and legal needs.
- Check legal holds and privacy rules: data that must be erased (for example on a GDPR erasure request) may survive in backups. Document how long it can persist and that restores must re-apply erasures.
- Expire old backups automatically; an unbounded bucket is a cost and a liability.

## 5. Monitoring

Alert on:
- a backup job that failed or did not run on schedule;
- WAL archiving falling behind or failing. In Postgres: `SELECT archived_count, failed_count, last_archived_time, last_failed_time FROM pg_stat_archiver;` Alert when `now() - last_archived_time` exceeds the RPO (an idle database writes no WAL and archives nothing, so write a small heartbeat row every few minutes or suppress the alert when no WAL was generated) or `failed_count` increases;
- backup size changing sharply between runs (truncated or runaway data);
- the last successful restore drill being older than the drill interval.

## 6. Restore Drills

Run a drill at least quarterly for tier 1 and after any change to the backup setup. Automate it where possible (scheduled CI job or cron in the backup account).

1. Pick a target time (for PITR) or the latest backup.
2. Provision a disposable, isolated instance: no production network access, no app traffic, deleted after the drill. Creating it in a cloud account (CLI, console or IaC apply) is Always Ask First; a local container started by this run is not.
3. Restore. Record start and end times; the elapsed time is the measured restore part of RTO.
4. Run verification queries (below). Compare against counts captured from the source at a known time.
5. Run an application smoke test against the restored DB in read-only mode (health endpoint, a few key reads).
6. Record the results in the DR runbook's drill log: date, backup used, restore duration, data age at target, verification results, problems found.
7. Destroy the drill instance. If anything failed, log it in `issues.md` as High (Critical for tier 1 data with no successful restore).

Verification queries (Postgres; adapt table names):

```sql
-- Schema present and migrations at the expected version
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 1;  -- or the tool's own table

-- Row counts on key tables, compared with counts captured from the source
SELECT 'orders' AS t, count(*) FROM orders
UNION ALL SELECT 'users', count(*) FROM users;

-- Achieved recovery point: newest write versus the requested target time
SELECT max(created_at) AS newest_row FROM orders;

-- Integrity spot checks
SELECT count(*) FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL;  -- expect 0
```

`pg_stat_user_tables.n_live_tup` is an estimate and is reset on a restored instance; use `count(*)` for verification. For logical dumps, `pg_restore --list backup.dump` confirms the archive is readable before a full restore.

## 7. DR Runbook

Write the runbook to `docs/runbooks/disaster-recovery.md`. Create it if missing; if it exists, edit only the sections this run changes and keep the drill log. Template:

```markdown
# Disaster Recovery Runbook: <service>

Last reviewed: YYYY-MM-DD    Owner: <team or role>

## Targets
| Datastore | Tier | RPO | RTO | Backup mechanism | Retention | Off-site copy |
|---|---|---|---|---|---|---|

## Scenarios
- Accidental data change or deletion (restore to a point in time, copy rows back)
- Database instance lost (restore or promote standby)
- Region or account lost (restore from the off-site copy)
- Compromised credentials or ransomware (restore from immutable copy, rotate secrets)

## Decision and Communication
- Who declares a disaster and who approves a restore:
- Status page and stakeholder channel:
- Pause writes or put the app in maintenance mode by:

## Restore Procedure (per datastore)
1. Identify the target time or backup. Record it.
2. Provision a new instance (never restore over the source).
3. Restore command (reference secrets by name only):
4. Verify with the queries in "Verification".
5. Cut over: update the connection secret or DNS, restart or roll the app, confirm health.
6. Re-apply erasure requests made after the backup time.
7. Keep the old instance read-only until the incident review is done.

## Verification
<the queries and smoke checks from the last successful drill>

## Dependencies
Secrets, object storage, queues, DNS, IaC state, third parties: where each is restored from.

## Drill Log
| Date | Backup used | Restore time | Data age at target | Result | Notes |
|---|---|---|---|---|---|
```

## Exit Criteria

- RPO and RTO are recorded for every production datastore.
- Backups are encrypted, copied off-site, and at least one copy is immutable.
- Backup and archiving failures alert someone.
- A restore drill has succeeded within the drill interval and is in the drill log.
- `docs/runbooks/disaster-recovery.md` exists and names an owner.
