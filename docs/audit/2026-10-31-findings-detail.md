# Skills audit: finding details (2026-10-31)

This is the companion to [2026-10-31-skills-audit.md](2026-10-31-skills-audit.md). Each finding gives the auditor's evidence, impact and fix. Where an independent verifier corrected the scope or severity, the correction follows and takes precedence. Line numbers refer to the tree at commit 13ae867.

## Packaging, install & repo docs

### F001: package.json bin/postinstall point to deleted scripts/install.js

- **Severity:** critical · **Kind:** defect · **Category:** packaging
- **Where:** package.json:21-32; README.md:74,94-95,124-125 (files: package.json, README.md, .github/PULL_REQUEST_TEMPLATE.md)
- **Evidence:** bin "everything-backend": "scripts/install.js", files lists it, "postinstall": "node ./scripts/install.js". Commit 8c9d5b6 deleted scripts/install.js and git ls-files has no scripts/. README and the PR template still tell people to run it.
- **Impact:** From a clean tree, `npx everything-backend` has nothing to run, npm install fails in postinstall, and every documented install path breaks.
- **Fix:** Restore the installer (git show 94548bf:scripts/install.js) and add a CI/prepublish check that every bin/files path exists, plus an installer dry-run smoke test.
- **Verifier correction:** What is broken today: clone/manual installs (`node scripts/install.js` fails with MODULE_NOT_FOUND), `npm install` and `npm run install:skills` in the repo (postinstall fails), and any republish from HEAD, which would ship a bin that points to a missing file and break npx for everyone. The currently published 0.3.0 tarball still contains the installer, so npx works until the next publish. Severity stays critical because the repo cannot install anything and the next release breaks all users.
- **Found by:** lens:cross-consistency, lens:packaging

### F073: Documented manual install and --dry-run are no-ops: the installer skips itself at the repo root

- **Severity:** medium (was high) · **Kind:** defect · **Category:** docs
- **Where:** install.js:259-263 (0.3.0); README.md:71-75,94,124; PR template:47 (files: README.md, .github/PULL_REQUEST_TEMPLATE.md)
- **Evidence:** `if (isLocalDev && process.cwd() === repoRoot) {... Skipping installer."); return; }` runs when --target is absent, which is exactly what the README commands do.
- **Impact:** Clone installs install nothing with exit 0, and the PR-template check verifies nothing.
- **Fix:** Apply the skip only during postinstall, or require --target in the docs.
- **Found by:** lens:packaging

### F074: No CI, validation, linting or evals for the skills or installer

- **Severity:** medium (was high) · **Kind:** gap · **Category:** testing-ci
- **Where:** .github/ (no workflows); package.json:29-33; version-changelog.md:29 (files: package.json, .github/PULL_REQUEST_TEMPLATE.md, .agents/skills/_shared/version-changelog.md)
- **Evidence:** No workflows, no test script, and no eval files. The changelog says 'Consider a lightweight test'.
- **Impact:** Deleted bin targets, broken templates and trigger collisions ship unnoticed.
- **Fix:** Add CI for frontmatter, link resolution, npm pack/bin checks, an installer smoke test and README/skill-list parity, plus should and should-not trigger evals.
- **Verifier correction:** The finding stands, but severity should be medium rather than high. The user-facing breakages it enabled (F001, F171) carry their own severities.
- **Found by:** lens:packaging, lens:authoring

### F171: backend-refactor is missing from all READMEs and the issue/PR templates; templates reference the deleted installer

- **Severity:** medium · **Kind:** gap · **Category:** docs
- **Where:** README*.md:12-26,30-49,108-117; feature_request.md:24-39; PR template:23-47 (files: README.md, .github/PULL_REQUEST_TEMPLATE.md, .github/ISSUE_TEMPLATE/feature_request.md)
- **Evidence:** `grep -c backend-refactor README*` gives 0, the checklists list 13 skills, and 'I ran node scripts/install.js --dry-run'.
- **Impact:** The skill isn't discoverable, and contributors run a nonexistent command.
- **Fix:** Add it everywhere, fix the installer references, and generate these lists in CI.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:packaging

### F216: Cursor install target ~/.cursor/skills-cursor is not a documented skills location

- **Severity:** medium · **Kind:** defect · **Category:** portability
- **Where:** install.js:19-25 (0.3.0); README.md:63 (files: README.md)
- **Evidence:** Cursor docs list ~/.cursor/skills and ~/.agents/skills, not skills-cursor.
- **Impact:** Skills may never load in Cursor.
- **Fix:** Target ~/.cursor/skills, or document ~/.agents/skills.
- **Found by:** lens:packaging

### F218: No Claude Code target, and the README doesn't say ~/.agents/skills serves several hosts

- **Severity:** medium · **Kind:** gap · **Category:** portability
- **Where:** README.md:59-65,98-117 (files: README.md, package.json)
- **Evidence:** Grep claude|codex: 0. Usage section is 'Usage in Opencode' only.
- **Impact:** Claude Code users have no install path.
- **Fix:** Add a ~/.claude/skills target and per-host usage notes.
- **Verifier correction:** Claude Code users can install manually with `--target ~/.claude/skills`. The gap is that the README has no first-class Claude Code (or Codex) target or docs, never explains which hosts read ~/.agents/skills, and the skill text assumes Opencode/OMO tool names.
- **Found by:** lens:packaging

### F219: README doesn't document what the skills write into projects or that auto mode is the default

- **Severity:** medium · **Kind:** gap · **Category:** docs
- **Where:** README.md (whole); tool-rules.md:44-46,57 (files: README.md)
- **Evidence:** No mention of .opencode memory, .checkpoints or mode=auto.
- **Impact:** Surprise files, committed checkpoints, unexpected autonomous commands.
- **Fix:** Add a 'What the skills write / how they run' section with a .gitignore snippet.
- **Found by:** lens:packaging

### F220: README 'What gets installed' and 'Repository layout' don't match reality

- **Severity:** medium · **Kind:** defect · **Category:** docs
- **Where:** README.md:98-104,128-134 (files: README.md)
- **Evidence:** Every target is said to install to ~/.agents/skills, _shared and plugin.json aren't mentioned, and scripts/install.js and .opencode/ are listed.
- **Impact:** Readers look for files that don't exist.
- **Fix:** Add a per-target table and the actual tree.
- **Verifier correction:** _shared is covered at README.md:28, though not in the 'What gets installed' section. The rest holds: per-target destinations and the Gemini plugin.json/skills/ nesting are undocumented, and the layout block lists a missing scripts/install.js and an untracked .opencode/.
- **Found by:** lens:packaging

### F223: Installer --update doesn't update, and installed skills carry no version marker

- **Severity:** medium · **Kind:** defect · **Category:** packaging
- **Where:** install.js:66-80,373-376 (0.3.0); README.md:85-89 (files: README.md)
- **Evidence:** Without --force it prints 'Skipping ... already exists', and the frontmatter has no version.
- **Impact:** Users keep old skills unknowingly.
- **Fix:** Overwrite owned files via a manifest, write a version marker, and document all flags.
- **Verifier correction:** Restate it as: re-running the installer without --force silently leaves a mixed-version install (new skills referencing shared docs that were not refreshed), installs carry no version marker, and README does not document --update/--version or any update procedure. --update printing instructions is intended behavior, and skips are logged per skill.
- **Found by:** lens:packaging

### F224: --force recursively deletes destination folders, including generic _shared in a shared dir

- **Severity:** medium · **Kind:** defect · **Category:** agent-safety
- **Where:** install.js:341,369-388 (0.3.0) (files: package.json)
- **Evidence:** `fs.rm(destinationPath,{recursive:true,force:true})`, run on ~/.agents/skills/_shared.
- **Impact:** Other packs' files and user edits are wiped.
- **Fix:** Namespace the shared folder and delete only files listed in the manifest, with a backup.
- **Found by:** lens:packaging

### F225: Security reporting link leads nowhere: private reporting is disabled and there is no SECURITY.md

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** .github/ISSUE_TEMPLATE/config.yml:6-8 (files: .github/ISSUE_TEMPLATE/config.yml)
- **Evidence:** Links to advisories/new, but private-vulnerability-reporting reports enabled:false.
- **Impact:** No private channel for a package that runs a bin script.
- **Fix:** Enable private reporting and add SECURITY.md.
- **Found by:** lens:packaging

### C001: README labels the Antigravity plugin target 'Gemini IDE'; Gemini CLI users aren't pointed to ~/.agents/skills

- **Severity:** low (was high) · **Kind:** defect · **Category:** packaging
- **Where:** README.md:61-62 (same line 62 in every translation); installer as last committed, git show 55eb14b:scripts/install.js lines 13-17 and 213-220 (files: README.md, README.id.md, README.es.md, README.zh.md, README.ja.md, package.json)
- **Evidence:** README.md:62 says: "**Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`". The last committed installer (git show 55eb14b:scripts/install.js) sets `target: path.join(os.homedir(), ".gemini", "config", "plugins", "everything-backend-plugin")` with `writePluginJson: true`. It then writes `plugin.json` containing only `{name, description}` and copies the skills into a `skills/` subfolder. Gemini CLI, which Gemini Code Assist agent mode is built on, loads extensions from `~/.gemini/extensions/<name>/`, and each extension needs a `gemini-extension.json` manifest. `git ls-files` shows no `gemini-extension.json` and no Gemini-specific packaging anywhere in the repo. The earlier audit flagged the Cursor path (F216) but did not check the Gemini path.
- **Impact:** Gemini users who follow the README get files in a directory Gemini never reads, under a manifest name it does not recognise. The skills install "successfully" and then never load, and nothing tells the user why.
- **Fix:** Check the current Gemini CLI or Code Assist extension and skills locations against official docs. Install into `~/.gemini/extensions/everything-backend/` with a valid `gemini-extension.json` (or the documented skills directory), or remove Gemini from the README until it works. Add a smoke test that installs to each advertised host and confirms the host finds the skills.
- **Note:** Resolved by hand: ~/.gemini/config/plugins/ is the plugin folder Antigravity loads. Google's own plugins (android-cli-plugin, modern-web-guidance-plugin) sit there with the same plugin.json + skills/ layout, so the install location is correct. What remains is the naming, and the written plugin.json has no version field.
- **Found by:** critic

### F221: Indonesian README uses Chinese section headings and has a malformed heading

- **Severity:** low (was medium) · **Kind:** defect · **Category:** docs
- **Where:** README.id.md:30,51,98,119,128 (files: README.id.md)
- **Evidence:** `## 安装 / Installation`; `##从哪里开始` (no space).
- **Impact:** Broken heading and mixed-language text.
- **Fix:** Use Indonesian headings and fix the spacing.
- **Verifier correction:** Scope is wider than cited: lines 67, 77, 85, 91 and 106 also carry Chinese headings. Severity should be low (doc polish in one translation, English fallback present in every heading).
- **Found by:** lens:packaging

### F222: version-changelog is out of sync with releases, claims fixes that aren't present, and ships to users

- **Severity:** low (was medium) · **Kind:** defect · **Category:** versioning
- **Where:** version-changelog.md:8,20-23,33-37; package.json:3 (files: .agents/skills/_shared/version-changelog.md, package.json)
- **Evidence:** 'Unreleased' even though 0.3.0 is published, with no 0.2.x entries. The ops alignment and checkpoint dedup claims are false. visualize is wrongly listed in v0.1.0.
- **Impact:** Versions can't be mapped to changes, and the history misleads.
- **Fix:** Use a root CHANGELOG.md keyed to tags, and exclude it from the install.
- **Verifier correction:** Drop the claim that the 'Checkpoint block deduplication' entry is false. git show 94548bf confirms the duplicated checkpoint sections were removed. The valid issues are: 'Unreleased' on content shipped as 0.3.0, the wrong v0.1.0 listing for backend-visualize, the unsupported ops-alignment claim, and no record mapping npm versions to changes. Severity should be low.
- **Found by:** lens:packaging, lens:cross-consistency, lens:authoring

### F275: Issue config links to disabled Discussions; the translation label doesn't exist

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** config.yml:3-5; translate_readme.md:5 (files: .github/ISSUE_TEMPLATE/config.yml, .github/ISSUE_TEMPLATE/translate_readme.md)
- **Evidence:** has_discussions is false, and there is no 'translation' label.
- **Impact:** Dead link and unlabeled issues.
- **Fix:** Enable Discussions or remove the link, and create the label.
- **Found by:** lens:packaging

### F276: No CONTRIBUTING.md or skill-authoring guide

- **Severity:** low · **Kind:** gap · **Category:** docs
- **Where:** README.md:6; PR template:18,54 (files: README.md)
- **Evidence:** 'Open for contributions!', but there is no CONTRIBUTING or CODE_OF_CONDUCT.
- **Impact:** New skills repeat the refactor drift.
- **Fix:** Add an 'Adding a skill' checklist.
- **Found by:** lens:packaging

### F277: postinstall hook adds install-script risk while only printing a message

- **Severity:** low · **Kind:** enhancement · **Category:** packaging
- **Where:** package.json:30 (files: package.json)
- **Evidence:** The postinstall branch only logs 'please run npx'.
- **Impact:** Gets blocked or flagged, and fails now that the file is missing.
- **Fix:** Remove postinstall.
- **Found by:** lens:packaging

### F278: Installer exits 0 when it skips in non-interactive environments

- **Severity:** low · **Kind:** defect · **Category:** packaging
- **Where:** install.js:281-283,303-305,331-333 (0.3.0) (files: package.json)
- **Evidence:** 'Non-interactive ... Skipping installation.' then return.
- **Impact:** CI reports success with nothing installed.
- **Fix:** Exit non-zero, or require --target/--yes.
- **Found by:** lens:packaging

### F279: package.json metadata describes an Opencode-only tool and has no author

- **Severity:** low · **Kind:** enhancement · **Category:** packaging
- **Where:** package.json:4,14-20 (files: package.json)
- **Evidence:** 'Reusable Opencode backend skills', keywords limited to opencode/cli.
- **Impact:** Not discoverable by other hosts' users.
- **Fix:** Host-neutral description, keywords and an author.
- **Found by:** lens:packaging

### F280: .gitignore is minimal and there is no .gitattributes

- **Severity:** low · **Kind:** gap · **Category:** packaging
- **Where:** .gitignore:1-2 (files: .gitignore)
- **Evidence:** Only .omo and .opencode. README creates tmp-skills/. Files are CRLF in the working tree.
- **Impact:** Scratch output gets committed, and the shebang may get CRLF.
- **Fix:** Ignore node_modules, *.tgz and tmp-skills, and add eol=lf.
- **Verifier correction:** Keep this as low polish: add `tmp-skills/`, `*.tgz` and an optional `node_modules/` to .gitignore, and add `* text=auto eol=lf` so packages published from Windows are consistent. Drop the claim that the shebang will break. npm normalizes CRLF shebangs for bins, and install.js is missing at HEAD anyway.
- **Found by:** lens:packaging

### F281: Windows example path in the translations mixes separators

- **Severity:** low · **Kind:** defect · **Category:** docs
- **Where:** line 95 of each (files: README.id.md, README.es.md, README.zh.md, README.ja.md)
- **Evidence:** `...\my-project\.agents/skills` vs the English `\.agents\skills`.
- **Impact:** Drift from the English source.
- **Fix:** Sync with the English example.
- **Found by:** lens:packaging

### F282: Translation PR template can't be reached from the GitHub UI

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** .github/PULL_REQUEST_TEMPLATE/ (files: .github/PULL_REQUEST_TEMPLATE/translation.md)
- **Evidence:** The root template wins, and ?template=translation.md is never linked.
- **Impact:** Translators get the wrong checklist.
- **Fix:** Link the template URL from the issue template and README.
- **Found by:** lens:packaging

### F283: Installer has no uninstall or cleanup for removed or renamed skills

- **Severity:** low · **Kind:** gap · **Category:** packaging
- **Where:** install.js:36-48,369-390 (0.3.0) (files: package.json)
- **Evidence:** Copy-only. backend-discovery and backend-refresh-memory were removed in b51c750.
- **Impact:** Orphaned stale skills keep triggering.
- **Fix:** Add a manifest, --uninstall, and pruning on upgrade.
- **Found by:** lens:packaging

## Shared contracts (_shared/)

### F002: mode=auto contract auto-approves migrations, app runs and most irreversible ops

- **Severity:** high (was critical) · **Kind:** defect · **Category:** agent-safety
- **Where:** tool-rules.md:11,34-47 (files: .agents/skills/_shared/tool-rules.md)
- **Evidence:** :11 bash runs "migrations, and the application itself". :38 "Pause only for destructive operations: data deletion, secret rotation, production deploys, schema drops, force-pushes". :46 auto is the default for direct use. Nothing says how the agent decides that a target is production.
- **Impact:** Without asking, the agent may apply migrations to whatever DATABASE_URL is set, run git reset/clean/commit/push, install packages, or push images or apply IaC to targets it judges non-prod.
- **Fix:** Turn this into an allowlist: only read-only commands and local hermetic commands run automatically. Migrations, env-derived targets, deploys, git ref writes, deletions and installs need confirmation. Any target that is not provably local counts as production.
- **Verifier correction:** Keep the evidence for :11, :38 and :46, and the missing production-target determination. Replace the git reset/clean/push, package install and IaC impact claims, which no skill instructs, with the real paths: doctor:136-142 starts the app and test/refactor run suites (which migrate and truncate) against env-configured DBs, all without an environment check under default auto mode. Severity high, not critical.
- **Found by:** lens:accuracy-safety

### F014: Keep-last-5 compaction archives the baseline inventory, open issues and accepted decisions

- **Severity:** high · **Kind:** defect · **Category:** correctness
- **Where:** memory-schema.md:182,222,233-234,305-315; backend-scan/SKILL.md:151 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** :307 'Keep only the last 5 timestamped entries per memory file'. Each decision and issue is its own entry, and scan stores schema as deltas. archive/ is never read.
- **Impact:** After 5 updates the initial schema, open Critical issues and Accepted ADRs drop out of working memory.
- **Fix:** Keep a current-state section that compaction rewrites. Exempt Accepted decisions and Open issues, and archive by status rather than by count.
- **Found by:** pair:orch-scan, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F017: Feature-slug checkpoint keying contradicts itself and no skill propagates a slug

- **Severity:** high · **Kind:** defect · **Category:** consistency
- **Where:** tool-rules.md:57-60; backend-test:258; backend-refactor:277 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-orchestrator/SKILL.md, .agents/skills/backend-test/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** Path is `<skill>-<ISO-timestamp>.json` and resume matches by skill, yet :60 says checkpoints are 'keyed on this slug'. A grep for slug/feature= across SKILL.md finds no usage. Commit 94548bf removed implement's slug derivation and collision rules.
- **Impact:** Two features using the same skill collide, and a resume can continue another feature's pending steps.
- **Fix:** Name files `<skill>-<slug>-<ts>.json` and resume on skill+slug. Define slug derivation and collision refusal, and have the orchestrator pass feature= and mode=.
- **Found by:** pair:orch-scan, lens:cross-consistency, pair:impl-refactor, lens:scenarios-a, pair:test-doctor

### F046: Shared rollback recipe `git checkout -- <file>` discards user edits and fails for created files

- **Severity:** high · **Kind:** defect · **Category:** agent-safety
- **Where:** tool-rules.md:57-59 (files: .agents/skills/_shared/tool-rules.md)
- **Evidence:** :59 'present a git checkout -- <file> command for each'. The checkpoint stores only file names, with no pre-run state.
- **Impact:** Following the rollback wipes the user's own uncommitted edits and leaves the generated files behind.
- **Fix:** Record pre-run state (a SHA or the agent's own patch), reverse-apply only that, treat created files separately with confirmation, and warn about dirty files.
- **Found by:** lens:authoring, lens:accuracy-safety, lens:cross-consistency, lens:scenarios-a

### F049: Blanket 30s command timeout kills test suites, builds, audits and migrations

- **Severity:** high · **Kind:** defect · **Category:** correctness
- **Where:** tool-rules.md:11,25; refactor:39-41,78,132; doctor:187 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** :25 'Command timeout (>30s): Kill the process'. Refactor requires full-suite runs, doctor follows the rule, and migrate backfills are long by design.
- **Impact:** Baselines can't be captured, and killed migrations leave half-applied DDL or a dirty version table.
- **Fix:** Use per-category budgets (tests and builds about 10-15 min, probes 30s), run long jobs in the background, treat timeout as 'not verified', and never auto-kill DB mutations.
- **Found by:** pair:impl-refactor, pair:test-doctor, lens:authoring, lens:accuracy-safety, lens:scenarios-b

### F013: Staleness check sees only committed changes, is hard-coded to src/, and compares epoch against tz-less timestamps

- **Severity:** medium (was high) · **Kind:** defect · **Category:** correctness
- **Where:** context-loading.md:128-144; backend-scan/SKILL.md:114-127,156 (files: .agents/skills/_shared/context-loading.md, .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** `git log -1 --format=%ct -- src/` (UTC epoch) is compared with `[YYYY-MM-DD HH:MM]` (no timezone). FastAPI app/, Go internal/ and prisma/ are missed, and uncommitted agent edits are invisible.
- **Impact:** Memory is reported up to date right after implement or refactor, and stale memory is then trusted as ground truth.
- **Fix:** Use source roots from project-overview, include `git status --porcelain`, record HEAD SHA plus ISO-8601 UTC, and treat empty git output as 'unknown'.
- **Found by:** pair:orch-scan, lens:authoring, lens:scenarios-a, lens:scenarios-b, lens:cross-consistency

### F015: No rule against writing secrets or PII into memory, archives or checkpoints, and no VCS guidance

- **Severity:** medium (was high) · **Kind:** gap · **Category:** security
- **Where:** memory-schema.md:270,290,305-311; backend-scan/SKILL.md:72-74,100-107 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Scan reads config and env configs (:290) and archives forever. A grep for secret|redact|.env|gitignore in scan and memory-schema returns nothing. This repo's own history committed a memory dir (bf47f72).
- **Impact:** DATABASE_URL passwords and API keys end up in plain-text memory that is likely committed.
- **Fix:** Record env var names only, mask connection strings, and run a secret-pattern check before every write. On first scan, tell the user to commit or gitignore the dir, and document a purge procedure.
- **Found by:** pair:orch-scan, lens:accuracy-safety, lens:scenarios-a

### F016: test-strategy.md and deployment.md are loaded (priority 6/7) but have no schema and no writer; the coverage target is undefined

- **Severity:** medium (was high) · **Kind:** gap · **Category:** consistency
- **Where:** context-loading.md:170-171,181; backend-test/SKILL.md:26,254; backend-scan/SKILL.md:100-106; orchestrator:80,103 (files: .agents/skills/_shared/context-loading.md, .agents/skills/_shared/memory-schema.md, .agents/skills/backend-test/SKILL.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Test :26 'always load priority 6 (test-strategy.md)'. memory-schema defines 6 files and scan creates the same 6. Deploy never reads or writes deployment.md. The orchestrator loops on 'coverage below the project target', which is never stored.
- **Impact:** Every test or deploy run reports a missing file and suggests a scan that can't fix it, and the coverage gate can't be evaluated.
- **Fix:** Add schemas (runners, layout, fixtures, test DB, coverage target; deploy targets, pipelines, probes). Have scan seed them and test/deploy maintain them, or drop them from the priority list.
- **Verifier correction:** Limit the 'reports missing file' impact to backend-test, since deploy never references deployment.md. Note that backend-test:146 supplies a default >80% unit-coverage threshold, so what is missing is a stored per-project target, not any target at all. Severity medium.
- **Found by:** pair:orch-scan, pair:test-doctor, pair:ops-deploy, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F019: Shared prerequisites block greenfield projects, the architect's headline use case

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** context-loading.md:11-27,116; architect:3,12,18,46,296; implement:23-24,116 (files: .agents/skills/_shared/context-loading.md, .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** context-loading :27 'If both return empty, stop and ask ... project path' and :116 auto-runs scan. Architect triggers on 'starting a new project'. Implement REQUIRES tech-stack.md.
- **Impact:** In an empty repo the agent stops or runs a pointless scan instead of designing.
- **Fix:** Add a greenfield branch: skip the root/manifest/scan checks, then bootstrap memory from the architect's output.
- **Verifier correction:** Add that backend-architect never persists its decisions to memory (no tech-stack.md, project-overview.md or decisions.md writes), so the greenfield handoff to implement has no memory to read. Severity medium, because the stop is recoverable friction rather than materially wrong output.
- **Found by:** pair:arch-viz, lens:cross-consistency, lens:scenarios-a

### F083: Missing-memory fallback contradicts itself (suggest scan vs auto-run) across shared docs and skills

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** context-loading.md:93-96 vs 116,183; architect:46; implement:24 (files: .agents/skills/_shared/context-loading.md)
- **Evidence:** :96 'suggest the user run backend-scan' vs :116 'run backend-scan with mode=auto'. Five skills suggest it and others run it.
- **Impact:** Whether the agent pauses or scans depends on which skill fired.
- **Fix:** Write one rule in context-loading (auto runs, interactive asks) and reference it from every skill.
- **Found by:** lens:cross-consistency, lens:authoring, lens:scenarios-a

### F088: Checkpoint lifecycle (status, completion, clearing) is undefined

- **Severity:** medium · **Kind:** gap · **Category:** consistency
- **Where:** tool-rules.md:57-58; migrate:286 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** 'check for an open checkpoint', but 'open' and 'cleared' are never defined, and migrate invents a clearing rule.
- **Impact:** Finished checkpoints prompt a resume on every later run.
- **Fix:** Add status open/completed/abandoned and a mandatory completion step.
- **Found by:** lens:cross-consistency, lens:scenarios-a, pair:db-migrate

### F089: Checkpoint filenames use ISO timestamps with colons, which Windows forbids

- **Severity:** medium · **Kind:** defect · **Category:** portability
- **Where:** tool-rules.md:57; test:258; refactor:277 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-test/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** `<skill>-<ISO-timestamp>.json`. Verified on Windows that '...T12:00:00Z.json' fails to create.
- **Impact:** Checkpoints can't be written on Windows.
- **Fix:** Use the basic format 20261031T101500Z.
- **Found by:** pair:test-doctor, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F093: memory-schema required layout and timestamp format contradict its own examples

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** memory-schema.md:10-14,26-44,182,199,222,240,263 (files: .agents/skills/_shared/memory-schema.md)
- **Evidence:** Requires top-level ## Type and ## Last Updated (ISO), but the examples nest ### Type and use `[2026-06-15 10:00]`. Decision heading `[YYYY-MM-DD]` vs example with time.
- **Impact:** Writers produce different shapes, so staleness and section lookups are unreliable.
- **Fix:** Define one layout with ISO-8601 UTC and examples that match exactly.
- **Found by:** lens:authoring, lens:cross-consistency

### F094: Memory-writing skills create empty, non-conforming files and never write in schema format

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** db-design:28; migrate:30,33,271-280; api-design:26,260 (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'create an empty db-schema.md / api-patterns.md / decisions.md'. Only scan references memory-schema. migrate's workflow has no memory step, so dropped columns are never marked deprecated.
- **Impact:** Empty files defeat the 'memory missing' check and break staleness, and schema facts go stale.
- **Fix:** Create files from the schema skeleton, and add explicit timestamped update steps (deprecations, Migrations section, ADRs).
- **Found by:** pair:db-migrate, pair:api-auth, lens:cross-consistency

### F096: Memory and repo content are auto-loaded as trusted context with no prompt-injection guard

- **Severity:** medium · **Kind:** gap · **Category:** agent-safety
- **Where:** context-loading.md:163-175; memory-schema.md:297-303 (files: .agents/skills/_shared/context-loading.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** 'Load priorities 1 and 2 on every invocation'. Grep untrusted|prompt injection: 0.
- **Impact:** A planted decisions.md in a cloned repo steers the agent in auto mode.
- **Fix:** Treat memory, READMEs and output as data, never run commands taken from memory, and confirm foreign memory before relying on it.
- **Found by:** lens:accuracy-safety

### C005: Archive filenames can collide, so a later compaction can overwrite earlier archived history

- **Severity:** low · **Kind:** defect · **Category:** correctness
- **Where:** memory-schema.md:307-311 (files: .agents/skills/_shared/memory-schema.md)
- **Evidence:** memory-schema.md:309: 'Copy older entries to `.opencode/everything-backend-memory/archive/<file>-<YYYY-MM-DD>.md`, where ... `<YYYY-MM-DD>` is the date of the oldest archived entry.' Nothing says to append to an existing archive file or to pick a unique name. Orchestrator pipelines run scan plus several memory-writing skills in one session, so many entries share a date, and two compactions whose oldest archived entry has the same date resolve to the same path.
- **Impact:** An agent that writes the archive with a normal file-write tool replaces the earlier archive, permanently losing archived decisions and issues. This is the material F014 already worries about being moved out of live memory.
- **Fix:** Say 'append if the archive exists', or name archives with a unique suffix (date range plus a counter or timestamp), and check that the archive is non-empty before pruning live entries.
- **Found by:** critic

### F087: Checkpoint contract is missing from scan, ops, deploy and the design skills although they write files and memory

- **Severity:** low (was medium) · **Kind:** gap · **Category:** consistency
- **Where:** tool-rules.md:53-61 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-scan/SKILL.md, .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Grep checkpoint returns 0 in scan, db-design, api-design, auth, ops, deploy, architect and doctor.
- **Impact:** Interrupted scans leave partial memory, and deploy and ops runs can't be resumed or rolled back.
- **Fix:** Add a Concurrent & Partial Work reference to every skill that writes, and list overwritten pre-existing files.
- **Verifier correction:** Narrow the scope to backend-scan (mode=auto memory writes), backend-deploy and backend-ops (file generation), plus backend-auth, which never references tool-rules.md. The design and doctor skills are interactive or read-only and are already covered by the contract's 'all skills' scope. The issue is an inconsistency in explicit references, not a missing capability. Severity is low.
- **Found by:** pair:orch-scan, pair:ops-deploy, lens:cross-consistency

### F274: Shared PowerShell snippets fail, and manifest globs descend into dependency folders

- **Severity:** low · **Kind:** defect · **Category:** portability
- **Where:** context-loading.md:18,32,48,51,56 (files: .agents/skills/_shared/context-loading.md)
- **Evidence:** `Get-ChildItem -Filter "*.json","*.toml"` errors. Test-Path returns an array. `**/package.json` reads the first match, possibly inside node_modules.
- **Impact:** Broken Windows path and wrong stack detection.
- **Fix:** Use -Include or per-file Test-Path, and exclude dependency dirs.
- **Verifier correction:** Confirmed: the Get-ChildItem -Filter array error (line 56), the Test-Path array result that is truthy in an `if` (line 32), and 'read the first match' being unreliable with nested manifests (lines 18, 48, 51). Overstated: the node_modules claim, because OpenCode's ripgrep-based glob respects .gitignore. A working PowerShell alternative is already given at lines 57-60. Severity stays low.
- **Found by:** lens:authoring

## backend-orchestrator & backend-scan

### F010: db-design, migrate and implement all claim migration files; New Feature bypasses migrate's safety rules

- **Severity:** high · **Kind:** defect · **Category:** consistency
- **Where:** orchestrator:16,63,76; db-design:12-13,179-187; migrate:16; implement:193,231-240 (files: .agents/skills/backend-orchestrator/SKILL.md, .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** orchestrator :63 has db-design 'Writes: ... migration files', and db-design Step 5 plans migrations and emits a non-concurrent CREATE INDEX. migrate :16 says it 'owns schema evolution'. implement's Add Column step writes its own migration without migrate's rules.
- **Impact:** Feature schema changes on live DBs skip expand/contract and lock-safe rules, which risks write locks and broken instances.
- **Fix:** Make migrate the single author of migration files. db-design outputs the target schema and hands off; implement calls migrate. Add migrate to New Feature and fix the orchestrator and README wording.
- **Verifier correction:** Drop the db-design CREATE INDEX example as evidence: it indexes newly created tables. Keep the core defect. Migration authorship is split across db-design (:183), implement (:193, :235) and migrate (:16). The New Feature workflow and implement's Add Column path skip migrate's lock-safe and expand/contract rules for changes to existing tables.
- **Found by:** pair:orch-scan, pair:db-migrate, lens:cross-consistency, lens:authoring

### C002: Staleness check misses code that reaches the branch through a merge commit

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** context-loading.md:128-142; memory-schema.md:276-284; backend-scan/SKILL.md:114-117 (files: .agents/skills/_shared/context-loading.md, .agents/skills/_shared/memory-schema.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** The staleness rule runs `git log -1 --format=%ct -- src/` and treats memory as stale only if that committer time is newer than `## Last Updated`. Reproduced in a scratch repo: feature commit touching src/ at 2026-01-05, unrelated main commit on 01-06, `git merge --no-ff feat` at 01-10. `git log -1 --format=%ct -- src/` then returns 1767571200 (2026-01-05), not the merge time. History simplification drops the merge commit because it is TREESAME to its second parent, so the command reports the feature commit's older date.
- **Impact:** Teams that use merge commits (GitHub's default merge button) get memory marked 'fresh' even after merged branches changed routes, schema or dependencies. Any refresh between a feature's last commit and its merge hides those changes, so every downstream skill works from stale memory it believes is current. F013's src/-only and timezone problems are separate.
- **Fix:** Compare against what is actually on the branch, not commit dates. Store the HEAD SHA (or a hash of each manifest and source tree) when memory is written, then run `git diff --quiet <stored-sha> HEAD -- <paths>`, or `git log --first-parent -1 --format=%ct`. Record the SHA in each memory file's header.
- **Found by:** critic

### C003: Memory files are merge-conflict-prone and have no locking or merge procedure for teams or parallel sessions

- **Severity:** medium · **Kind:** gap · **Category:** correctness
- **Where:** memory-schema.md:14,57,102,143,187,227 (single `## Last Updated`), 234/260-270 (append at end), 305-311 (compaction rewrites); tool-rules.md:57-60; backend-scan/SKILL.md:127,147 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/_shared/tool-rules.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Every memory file has a single required `## Last Updated` line, and every skill run is told to 'refresh "Last Updated" timestamps' (scan:127, 147). New entries are appended as timestamped blocks at the end of the file. Compaction rewrites the head of the file and prunes entries. tool-rules.md:60 isolates concurrent features only for checkpoints ('Two concurrent features must not share a checkpoint'), while all features share the same memory files. Checkpoints (tool-rules.md:57) record no user or host, and tool-rules.md:58 tells any later run to 'offer to resume' an open checkpoint for the same skill. A search for 'merge conflict', 'lock' or 'concurrent' in memory-schema.md finds nothing.
- **Impact:** If memory is committed, two developers (or two agent sessions on different branches) who both run any skill edit the same `Last Updated` line and append at the same end-of-file spot, which guarantees git conflicts. Conflict markers left in memory are then read as facts by the next skill. A teammate's committed checkpoint makes other people's runs offer to resume work they never started. Parallel sessions in one checkout can interleave appends and compaction. This is separate from F015, which only notes that VCS guidance is missing.
- **Fix:** Pick and document a team model: either per-developer memory that is gitignored, or committed memory split into per-entry files (for example `decisions/<date>-<slug>.md`) with no shared `Last Updated` line, which merges cleanly. Add a lock file or atomic write-then-rename for memory updates. Add owner/host to checkpoints and gitignore `.checkpoints/`. Tell scan to detect conflict markers and stop instead of ingesting them.
- **Found by:** critic

### C004: 200 KB memory size guard is far beyond what an agent can load, and scan's compaction never checks size

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** memory-schema.md:313-315; context-loading.md:175; backend-implement/SKILL.md:34; backend-scan/SKILL.md:149-151 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/_shared/context-loading.md, .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** memory-schema.md:315: 'If a memory file exceeds approximately **200 KB**, trigger compaction automatically ... while retaining the most recent 5 entries at minimum.' context-loading.md:175 loads priorities 1-2 on every invocation, and implement:34 always loads four files. At roughly 4 bytes per token, 200 KB is about 50k tokens per file, so 150-200k tokens before any work starts. scan:151 compacts only by entry count ('If more than 5 exist'), never by size, and the guard is only checked 'before appending', never when reading.
- **Impact:** A file can grow to many times what fits in a working context (for example a large endpoint inventory appended on each sync) and still pass the guard. Every skill then either truncates memory silently or burns its context window before doing anything. Because the guard never drops below 5 entries, five large entries can never be compacted under the limit.
- **Fix:** Set a token-based budget per file (for example 8-16 KB) and check it on read as well as on write. Have compaction summarise older entries into a single 'current state' section instead of just moving them to archive. Note the per-invocation total context budget in context-loading.md.
- **Found by:** critic

### C012: Security principle says to sanitize input before processing, with no output-encoding rule and no command, log or header injection guidance

- **Severity:** medium · **Kind:** defect · **Category:** security
- **Where:** principles.md:47; backend-scan/SKILL.md:81; backend-doctor/SKILL.md:155,191; backend-ops/SKILL.md:282-285,334-337 (files: .agents/skills/_shared/principles.md, .agents/skills/backend-scan/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** principles.md:47: '**Input validation and sanitization**: reject malformed input and sanitize before business processing and logging.' A search for 'encod|escape|xss' across `.agents/` finds no output-encoding guidance. Doctor's injection hunt (line 155) is SQL-only, although its Critical list (line 191) names 'command, etc.'. Ops' correlation-ID middleware copies a client-supplied `x-correlation-id` straight into logs and the response with no format or length check (Node 283-284, Go 334-337).
- **Impact:** 'Sanitize before business processing' leads agents to mutate stored data (stripping quotes or HTML-escaping on input), which corrupts names like O'Brien and gives false confidence against XSS and injection. Meanwhile OS-command, template, header and log injection go unchecked, and untrusted IDs can forge log lines. F147 and F054 cover BOLA, SSRF, mass assignment and OWASP review, not this.
- **Fix:** Rewrite the principle as 'validate and reject at the boundary; encode or parameterize for each output context (SQL params, HTML encoding, shell argument arrays, header and log field escaping)'. Add command, template and log injection patterns to doctor's static scan. Restrict incoming correlation IDs to a fixed pattern and maximum length, or ignore them from untrusted clients.
- **Found by:** critic

### F004: Orchestrator description has no when-to-use clause or trigger phrases

- **Severity:** medium (was high) · **Kind:** defect · **Category:** routing
- **Where:** backend-orchestrator/SKILL.md:3,10 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** description: "Route backend requests to the correct backend sub-skill." (56 chars). The triggers ('build backend', 'help with backend') appear only in the body at :10, while sibling descriptions run 259-468 chars.
- **Impact:** The advertised entry point and its multi-skill pipelines rarely activate on their own.
- **Fix:** Rewrite as a third-person 'what + when + not-for' description with trigger phrases for vague, multi-concern requests.
- **Found by:** pair:orch-scan, lens:authoring

### F005: Routing is one sentence: no rules for ambiguous, multi-intent or unmatched requests

- **Severity:** medium (was high) · **Kind:** gap · **Category:** routing
- **Where:** backend-orchestrator/SKILL.md:8-10,28-48,52 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** :48 "Identify the intent, then activate the named skill directly". 'build backend' matches no row, and 'create API' matches both :35 and :36. There is no precedence order, no clarifying question, no step to announce the route, and no sequencing for compound requests (e.g. refactor then diagram).
- **Impact:** Vague and compound requests get routed inconsistently, and the user cannot see the chosen route or correct it.
- **Fix:** Add a procedure: single match routes directly; several matches go to a workflow or a precedence order; no match gets one clarifying question. Always state the skill, mode and slug. Run compound requests in sequence, each gated on the previous step.
- **Verifier correction:** Compound requests are partly covered: :52 sends multi-concern requests to the four workflows. The real gap is compound requests that fit none of those workflows (for example refactor then diagram), plus the missing handling for no-match and ambiguous requests and the missing route announcement. Severity medium, not high.
- **Found by:** pair:orch-scan, lens:scenarios-a, lens:scenarios-b

### F006: Routing table has no rows for bug/debug, performance, security review, upgrades or incidents

- **Severity:** medium (was high) · **Kind:** gap · **Category:** routing
- **Where:** backend-orchestrator/SKILL.md:28-44 (files: .agents/skills/backend-orchestrator/SKILL.md, .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Rows :30-44 have nothing for 'fix bug/500', 'slow/p95', 'security review', 'upgrade framework' or 'production down'. Doctor :13 claims 'is my code secure?/performance issues?' but the doctor row :39 only says health/review.
- **Impact:** Everyday requests fall through or land on the wrong skill (generic doctor run, ops instrumentation design, DB migrate for 'Spring migration').
- **Fix:** Add rows and description keywords for bug fix, performance regression, security review, dependency/framework upgrade and incident, each pointing to a dedicated workflow.
- **Verifier correction:** Narrow the finding to the routes and procedures that are actually missing: debugging/bug triage (implement has no reproduce, isolate, root-cause steps), dependency/framework upgrades, and incident response. Security review and performance review already route to doctor via :39, and doctor :13 and :204 support them. Severity medium.
- **Found by:** pair:orch-scan, lens:coverage, lens:scenarios-b

### F007: Production Readiness workflow has no security, load, backup or alerting gate, and review requests can route into it and generate files

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-orchestrator/SKILL.md:39,105-121 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** It runs ops (writes code) → deploy (writes Docker/CI) → doctor, and ends at "deemed production-ready by the user" (:121). It has no security review, load test, restore check, runbook or rate-limit step, and mode=auto lets the writes go ahead.
- **Impact:** A read-only pre-launch review can generate Node Dockerfiles and observability code, and a service can be declared ready without basic launch safeguards.
- **Fix:** Make review/audit requests read-only. Add a Security Review workflow. Turn Production Readiness into a checklist gate (security, load vs SLO, restore tested, alerts+runbooks, rate limits, rollback) and confirm before writing files.
- **Verifier correction:** Remove 'no security gate': doctor covers dependency and static security checks. The ops step asks before implementing (ops :418). Only deploy lacks a confirmation step. The real gaps are load testing against SLOs, backup/restore verification, alerting/runbook and rollback gates, and a readiness checklist rather than 'deemed ready by the user'. Severity medium.
- **Found by:** lens:coverage, lens:scenarios-b

### F008: Production Readiness and Memory Refresh say 're-run from step 5' but have only 3 and 2 steps

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** backend-orchestrator/SKILL.md:84,116,120,134 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** :120 and :134 "If Critical findings → STOP. Fix issues, re-run from step 5." was copied from New Feature :84. :116 has deploy loop back to ops 'to record the decision', but ops has no step that records decisions.
- **Impact:** The Critical-finding path points to a step that doesn't exist, and in auto mode the agent may improvise fixes to auth or secrets.
- **Fix:** Name the owning skill instead of a step number: report Critical findings, wait for approval, fix through implement/auth/ops, then re-run doctor. Give ops/deploy explicit handoffs.
- **Verifier correction:** The facts are correct. Lower severity to medium: the generic rule at :141 limits the impact, and the improvised-fix scenario is speculative. The core defects are the dangling step reference and the ops handoff that has no decision-recording step.
- **Found by:** pair:orch-scan, pair:test-doctor, pair:ops-deploy, lens:cross-consistency, lens:authoring, lens:accuracy-safety, lens:scenarios-a, lens:scenarios-b

### F009: No greenfield, schema-change, refactor or refactor-then-diagram workflow; architect, migrate, refactor and visualize appear in no pipeline

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-orchestrator/SKILL.md:50-135 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** There are four workflows (New Feature 'existing backend', Quick Add, Production Readiness, Memory Refresh). Migrate is only a loop-back target (:76,98,145). The orchestrator has no Prerequisites section and no context-loading reference.
- **Impact:** 'Build me a backend from scratch' and 'split X then diagram it' have no defined sequence, handoff or completion criteria.
- **Fix:** Add a project-state check, plus workflows for New Project (architect→db→auth→api→implement→test→ops→deploy), Schema Change (migrate→implement→test), Refactor (test baseline→refactor→doctor) and Refactor & Document (refactor→memory sync→visualize).
- **Verifier correction:** Acknowledge that architect :262-265 and refactor :38, :283, :300 already define in-skill handoffs for greenfield work and for refactor-with-baseline. The gap is that the orchestrator has no pipeline with gates and completion criteria for these flows and no project-state check. Severity medium.
- **Found by:** pair:orch-scan, pair:arch-viz, lens:cross-consistency, lens:scenarios-a, lens:scenarios-b

### F011: backend-scan redefines mode=auto, and its sync path asks for confirmation, contradicting the contract

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** backend-scan/SKILL.md:85-94,118,126-127; tool-rules.md:49 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** Scan uses mode=auto to choose initial vs sync, and auto says 'Do not ask for confirmation'. Sync :126 says 'ask the user for confirmation before applying updates'. The orchestrator passes mode=sync, which collides with the auto/interactive axis. tool-rules :49 forbids redefining the contract.
- **Impact:** Orchestrated pipelines may stall waiting for approval, or skip the confirmation that deletions need.
- **Fix:** Split this into scope=initial|sync plus the shared mode. In auto, apply additive and modified updates automatically and pause only on removals or conflicts.
- **Verifier correction:** Lower severity to medium. The contradiction and the overloaded mode parameter are real. The 'skip the confirmation that deletions need' risk does not hold, because scan never removes entries (:125, :263).
- **Found by:** pair:orch-scan, lens:scenarios-a, lens:cross-consistency

### F012: Scan has no procedure to extract tables, endpoints or API conventions

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-scan/SKILL.md:56-81,100-106 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** memory-schema requires Tables/Relationships and Protocol/Base Path/Auth/Conventions, but scan :104 only says 'tables/collections discovered'. A grep for openapi|swagger|graphql|proto|endpoint in scan returns nothing.
- **Impact:** db-schema.md and api-patterns.md are shallow and inconsistent, so downstream skills design duplicates or draw wrong ERDs.
- **Fix:** Add per-stack extraction recipes (schema sources, route patterns, spec files, error shape, ADR folders) in references/, with a Source file:line for each fact.
- **Verifier correction:** Note that scan does reference memory-schema.md's required sections (:140), maps route and model directories (:69-70), and requires a Source path per entry (:160). The gap is the missing per-stack extraction recipes: ORM schema and migration files, route registration patterns, OpenAPI/GraphQL/proto spec files, error shape. Severity medium.
- **Found by:** pair:orch-scan

### F076: Workflow loops have no iteration cap; Critical handling ambiguous; push/CI/non-local migrations ungated

- **Severity:** medium · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-orchestrator/SKILL.md:76,80,84,98,116,141-145 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** Loops back with no maximum. 'STOP. Fix issues, re-run' contradicts itself. The pause list omits push/CI/shared DB.
- **Impact:** Implement↔test loops can run indefinitely, and Critical fixes happen without review.
- **Fix:** Cap at 2 iterations and then escalate, make Critical mean stop and get approval, and add orchestrator-level gates.
- **Found by:** pair:orch-scan

### F077: Scan detects Rust/Ruby with no decision tree and misses PHP, .NET, Kotlin, Elixir, Deno and Bun

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-scan/SKILL.md:60-66,163-187,253 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Trees cover only package.json, requirements/pyproject, go.mod and pom/gradle. No composer.json, csproj, mix.exs or deno.json.
- **Impact:** Common stacks get half-empty tech-stack.md files.
- **Fix:** Add trees or detection for those stacks, or mark them 'unsupported – language only'.
- **Verifier correction:** Kotlin is partly detected: scan:64 lists build.gradle.kts, filed under Java, so the finding overstates that part. The same gap also hits other skills: backend-deploy:29-30 requires package.json, pyproject.toml, go.mod, pom.xml or build.gradle and otherwise stops, which excludes even Rust and Ruby. context-loading.md:18 and :48 omit build.gradle.kts.
- **Found by:** pair:orch-scan

### F079: Scan applies one entry format to decisions.md and issues.md, conflicting with their schema

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-scan/SKILL.md:105-106,153-161; memory-schema.md:180-187,220-227 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** Every file gets `## [ts] [Initial Scan|Sync Update]`, while decisions need Context/Decision/Status and issues need Severity/Status. TODOs are not capped.
- **Impact:** Unparseable entries, inferred decisions that look Accepted, and floods of TODO issues.
- **Fix:** Use the per-entry schemas, mark scan-derived decisions 'Inferred', and aggregate TODOs into one issue.
- **Verifier correction:** Re-attribute the root cause to memory-schema.md:258-268, which conflicts with its per-file schemas, and fix it there. There is also a related, more serious problem: the compaction rule (scan:151, memory-schema.md:307) keeps only the last 5 timestamped entries per file. decisions.md and issues.md hold one timestamped entry per decision or issue, so compaction would archive older decisions that are still Accepted, and issues that are still Open, out of the live files.
- **Found by:** pair:orch-scan

### F080: Partial memory not handled: mode choice is all-or-nothing and sync never initializes missing files

- **Severity:** medium · **Kind:** gap · **Category:** correctness
- **Where:** backend-scan/SKILL.md:91-92,119-120,258 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** 'Use mode=sync if memory files already exist', and design skills create single empty files.
- **Impact:** project-overview.md and tech-stack.md are never created.
- **Fix:** Initialize per file, and treat a file with no Last Updated as stale.
- **Verifier correction:** The impact ('never created') is overstated. Sync step 5 ('New ... dependencies/configs → add to memory') may lead an agent to create the files, and a user can force mode=initial, which appends to existing files (scan:257). The accurate description is undefined or unreliable behavior, not a guaranteed failure.
- **Found by:** pair:orch-scan

### F081: Sync deprecates planned designs written before implementation

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-scan/SKILL.md:122-125; db-design:232; api-design:260 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** 'Deleted items → mark as deprecated', while design skills save unbuilt tables and endpoints. There is no planned status.
- **Impact:** Approved designs are marked [DEPRECATED] mid-workflow.
- **Fix:** Add planned/implemented/deprecated status, and never deprecate planned items.
- **Found by:** pair:orch-scan

### F085: Monorepo and workspace handling is undefined (first-match manifest, single memory dir, root commands)

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** scan:254-255; context-loading.md:48-51; test:154-174 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/context-loading.md, .agents/skills/backend-test/SKILL.md)
- **Evidence:** 'read the first match' of a recursive manifest glob. There is no pnpm-workspace/turbo/go.work/gradle multi-project handling and no scoped test commands.
- **Impact:** The agent records a frontend's stack, merges services, or tests the whole repo.
- **Fix:** Detect workspaces, list the services and ask which one, define the memory layout, and use scoped commands.
- **Found by:** pair:orch-scan, pair:test-doctor

### C006: Memory files have no schema version, so memory written by earlier releases has no migration path

- **Severity:** low (was medium) · **Kind:** gap · **Category:** versioning
- **Where:** memory-schema.md (whole file); context-loading.md:122-144; backend-scan/SKILL.md:110-127 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/context-loading.md)
- **Evidence:** Searching for 'version' in memory-schema.md finds only content fields ('primary languages and versions', 'database type and version'), with no schema or format version marker. The format has already changed. The initial commit's template (git show bbcc153:.opencode/everything-backend-memory/project-overview.md) used `## Purpose` and `## Tech Stack` sections written by the since-deleted `backend-discovery` and `backend-refresh-memory` skills (removed in b51c750). The current schema requires `## Type`, `## Structure` and `## Last Updated` (memory-schema.md:10-14). The staleness check (context-loading.md:128) depends on `## Last Updated`, which the old files lack.
- **Impact:** Projects initialised with an earlier release keep memory that does not match the current schema. Scan sync appends to it in the new format, mixing both. The staleness check has no timestamp to read, so it behaves unpredictably, and nothing detects or upgrades the old format. This will recur with every schema change.
- **Fix:** Add a front-matter header to each memory file (for example `schema: everything-backend-memory/2`, `written_by: <skill>@<version>`, `source_sha`). Have context-loading check it and send old or unversioned files to a scan `mode=migrate` that rewrites them into the current schema.
- **Found by:** critic

### C015: `mode=interactive` is named as the escape hatch but is defined nowhere

- **Severity:** low · **Kind:** gap · **Category:** consistency
- **Where:** tool-rules.md:47 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-scan/SKILL.md, .agents/skills/backend-test/SKILL.md)
- **Evidence:** tool-rules.md:47: 'The user or orchestrator can always force `mode=interactive` by saying "ask me before each step"'. Counting mode tokens across `.agents/` gives mode=auto 20, mode=sync 11, mode=initial 9 and mode=interactive 1 (only this line). No skill describes which steps pause in interactive mode, and scan's mode split (scan:83-127) has no interactive branch.
- **Impact:** Since auto is the default (tool-rules:45-46), the only documented way to opt out of autonomous execution has no defined behaviour. A user who asks for it gets whatever each skill improvises, which undermines it as a safety control.
- **Fix:** Define `mode=interactive` in tool-rules (for example: confirm before every file write, command run and memory update, and show diffs first) and have each skill state its pause points for that mode.
- **Found by:** critic

### F075: Orchestrator per-step Reads lists contradict what the sub-skills load

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** backend-orchestrator/SKILL.md:66,74,78,82,92-98,114 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** api-design step omits db-schema.md, test omits test-strategy, doctor omits REQUIRED issues.md. Quick Add step 1 says 'escalate' but step 2 says loop back.
- **Impact:** The contract under-reports dependencies and drifts from the skills.
- **Fix:** Drop the Reads lists and reference each skill's own context, and reconcile Quick Add.
- **Verifier correction:** Remove the Quick Add 'contradiction': :94 covers a discovered schema need and :98 covers a requested schema change. Keep the incomplete Reads lists (db-schema for api-design, test-strategy for test, issues.md for doctor, project-overview for implement). Severity low, since the sub-skills load their own context.
- **Found by:** pair:orch-scan, lens:cross-consistency

### F078: Scan decision trees are shallow or outdated (ORM, package manager, Go stdlib, Python signals)

- **Severity:** low (was medium) · **Kind:** defect · **Category:** correctness
- **Where:** backend-scan/SKILL.md:61,74,165-187 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** No Node ORM checks, package-lock.json is missing, 'unittest' is checked in the manifest, 'main.py (FastAPI)', no chi/pgx/sqlc, no Flyway/Liquibase.
- **Impact:** Wrong package manager, 'no framework' for Go, and missing ORM details mislead the downstream skills.
- **Fix:** Use a per-ecosystem signal table in references/, and record 'unknown' rather than guessing.
- **Verifier correction:** Downgrade to low and classify mostly as an enhancement. The only outright defect is the stdlib 'unittest' manifest check at scan:174. The rest is incomplete heuristics, partly covered by the generic detection instruction at scan:74.
- **Found by:** pair:orch-scan

### F082: Scan calls itself, and 'run backend-scan' is used for checks scan can't fix

- **Severity:** low (was medium) · **Kind:** defect · **Category:** correctness
- **Where:** scan:24-29,44; deploy:40; doctor:22 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** scan :29 'If any REQUIRED check fails, run backend-scan'. deploy :40 does the same for a missing manifest or shared file.
- **Impact:** Recursion or pointless scan loops before the agent stops.
- **Fix:** Remove the self-reference, and stop immediately on unfixable checks.
- **Verifier correction:** Downgrade to low and reframe as confusing self-referential boilerplate (scan:29, :44) plus a contradiction in deploy:40 versus deploy:27 for a missing shared file. Recursion or a scan loop is unlikely given the escape clause on the same line.
- **Found by:** pair:orch-scan, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F084: Scan has no read-only guarantee and inherits a toolkit that runs installs, migrations and the app

- **Severity:** low (was medium) · **Kind:** gap · **Category:** agent-safety
- **Where:** scan:50-54,85-94; tool-rules.md:11 (files: .agents/skills/backend-scan/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** Step 0 defers to a toolkit that runs 'migrations, and the application itself', and auto mode says 'Execute immediately'.
- **Impact:** Exploring an untrusted repo may run npm install scripts, docker-compose or migrations.
- **Fix:** State that scan is read-only (glob, read, grep, read-only git) and needs approval for anything else.
- **Verifier correction:** Downgrade to low. This is a hardening gap (add an explicit read-only rule for scan, apart from writing the memory files), not a demonstrated path to running untrusted code.
- **Found by:** pair:orch-scan

### F086: Scan has no exit criteria, and its summary template pre-fills success

- **Severity:** low (was medium) · **Kind:** gap · **Category:** authoring-quality
- **Where:** backend-scan/SKILL.md:189-249 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Hard-coded '✅ project-overview.md ...' that omits decisions and issues, with no verify step.
- **Impact:** Incomplete memory is reported as complete.
- **Fix:** Add a verify step that checks required sections and reports per-file status and unknowns.
- **Verifier correction:** Downgrade to low. Adding a verify step with per-file status is a useful polish item; the existing template does not by itself make the agent report false success.
- **Found by:** pair:orch-scan

### F234: Memory Refresh turns a sync into a full health check and fix loop

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-orchestrator/SKILL.md:123-135 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** Runs doctor and requires 'Critical and High findings resolved'.
- **Impact:** Discourages refreshing memory.
- **Fix:** Make doctor optional and complete on drift summary.
- **Found by:** pair:orch-scan

### F235: Orchestrator repeats lists and branching text

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-orchestrator/SKILL.md:12-44,84,120,134,141-145 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** The skill list duplicates the table, and the doctor branching appears 4 times.
- **Impact:** Tokens and drift (the cause of the step-5 bug).
- **Fix:** One table, with branching rules stated once.
- **Found by:** pair:orch-scan

### F236: Scan has no budget, exclusion list or generated-code detection

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** scan:259-260; context-loading.md:18,48 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Recursive globs with no node_modules/vendor exclusion.
- **Impact:** Context wasted and partial memory on large repos.
- **Fix:** Add exclusions, generated-code markers and a sampling budget.
- **Found by:** pair:orch-scan

### F237: Scan's 'principle-level concerns' duplicate principles.md and overlap doctor

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-scan/SKILL.md:76-81 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** Restates SOLID etc. with no output target.
- **Impact:** Duplicate or conflicting issues.
- **Fix:** Record conventions only and leave grading to doctor.
- **Verifier correction:** Rephrase as an ambiguity, not duplication: line 76 should say where scan observations go (for example Key Findings or `## Notable Conventions` in project-overview.md, without assigning severity), and there should be a rule against duplicate issues.md entries between scan and doctor. The 'restates principles.md' part is minor because the list is a short index that points to principles.md.
- **Found by:** pair:orch-scan

### F238: Scan description omits the 'run first when memory missing' trigger and is generic

- **Severity:** low · **Kind:** enhancement · **Category:** routing
- **Where:** backend-scan/SKILL.md:3,14-16 (files: .agents/skills/backend-scan/SKILL.md)
- **Evidence:** 'understand', 'update memory'; mode=auto not mentioned.
- **Impact:** Over- and under-triggering.
- **Fix:** Use project-scoped triggers and say when to run before other skills.
- **Verifier correction:** Drop the under-triggering point and the missing 'run first' trigger: that path is handled by context-loading.md:116/183. Keep only the over-triggering risk from the generic 'understand'/"what's here" phrases, as low polish.
- **Found by:** pair:orch-scan

### F239: Quick Add Endpoint has no scan step and no security step for sensitive endpoints

- **Severity:** low · **Kind:** gap · **Category:** routing
- **Where:** backend-orchestrator/SKILL.md:87-103 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** 'Use when the stack is already known', with no check and no doctor.
- **Impact:** Payment endpoints ship without review.
- **Fix:** Add a conditional scan and a security step for auth or payment.
- **Verifier correction:** Remove the 'no scan step' claim, because context-loading prerequisites in each routed skill trigger scan when memory is missing or stale. Narrow the finding to the missing conditional `backend-auth` / `backend-doctor` (security review) step for sensitive endpoints, as New Feature does at lines 69 and 81.
- **Found by:** lens:scenarios-a

## backend-architect & backend-visualize

### F020: backend-architect never persists its output: no file path, no memory update, no exit criteria

- **Severity:** high · **Kind:** gap · **Category:** consistency
- **Where:** architect:111-167,206-287; implement:23-24,49-53 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Step 4 says 'Create architecture documentation' with no destination, and a grep finds only memory reads. Implement requires the tech-stack.md and decisions.md that architect never writes.
- **Impact:** Stack and architecture decisions live only in chat, so downstream skills re-decide or contradict them.
- **Fix:** Add a persist step: docs/architecture.md and ADRs, appends to decisions.md, updates to project-overview and tech-stack, explicit exit criteria and the next skill.
- **Found by:** pair:arch-viz, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F021: Architect decision trees conflict; 'high scalability → microservices' contradicts the monolith-first guidance

- **Severity:** medium (was high) · **Kind:** defect · **Category:** correctness
- **Where:** backend-architect/SKILL.md:176-198,296-298 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** :177 'If high scalability needed: Recommend microservices or serverless' vs :195 'Prefer modular monolith first' and :298. There is no precedence order between the trees.
- **Impact:** A small team that wants scale gets contradictory, over-engineered advice.
- **Fix:** Scale stateless instances, caching and replicas first, and tie microservices to team or boundary independence. Add a precedence order for the trees.
- **Found by:** pair:arch-viz, lens:accuracy-safety

### F099: ADR template format conflicts with decisions.md, and ADRs would be compacted away

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** architect:268-287; memory-schema.md:175-213,305-315 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** `# ADR-[Number]` with ## sections vs `## [YYYY-MM-DD] [Title]` with ###. Keep-last-5 applies to them.
- **Impact:** ADRs don't parse and older decisions disappear.
- **Fix:** Align the format, or store docs/adr/NNNN.md with a dated summary in decisions.md that is exempt from compaction.
- **Verifier correction:** Two claims are overstated. First, 'ADRs don't parse': no parser exists, and an LLM reads the Markdown. The real effect is inconsistent heading structure. Second, 'older decisions disappear': memory-schema:309 moves them to archive/<file>-<date>.md rather than deleting them. They drop out of loaded context because no skill loads the archive. Also, because of F020 the architect never actually writes ADRs into decisions.md today. So the format conflict is latent; the compaction problem for decisions.md applies whichever skill writes the decisions.
- **Found by:** pair:arch-viz, lens:cross-consistency

### F100: Architecture templates assume a gateway, multiple services sharing a DB, cache and queue

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-architect/SKILL.md:115-137,212-242 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** The default diagram is Client→API Gateway→Service 1/2→one DB. The Pattern field omits Modular Monolith.
- **Impact:** It nudges toward the shared-DB anti-pattern and over-engineering.
- **Fix:** Give a skeleton per pattern, mark optional components, and add Modular Monolith.
- **Found by:** pair:arch-viz, lens:scenarios-a

### F103: No brownfield architecture process, although refactor routes redesigns to the architect

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** architect:66-70,292; refactor:25,301 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** Existing systems get one bullet: 'Work within constraints'.
- **Impact:** Redesigns get a greenfield questionnaire with no current-state assessment.
- **Fix:** Add a brownfield branch: derive the current architecture from code, diagram current vs target, and plan a phased migration with handoffs.
- **Found by:** pair:arch-viz

### F105: Three skills emit Mermaid with diverging conventions; architect and db-design never hand off to visualize

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** architect:115-125; db-design:147-177,347-377; visualize:14,98 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Unthemed graph TD and ERDs without UK markers. The db-design example lacks USERS→COMMENTS.
- **Impact:** Inconsistent diagrams, and visualize's 'after db-design' trigger never fires.
- **Fix:** Make visualize the owner of templates, delegate from the other skills, and fix the example.
- **Verifier correction:** The 'ERDs without UK markers' claim applies only to the Step 4 example (db-design:156, 'string email' without UK, even though the SQL at line 112 has UNIQUE). The ERD Template at db-design:347-377 does use UK at lines 353, 365, 374 and 375.
- **Found by:** pair:arch-viz, lens:cross-consistency, pair:db-migrate

### F107: Visualize contradicts itself on color semantics (global palette vs per-group colors)

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-visualize/SKILL.md:98-126,200-208,378,410,606,651-655 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** :115 'same color meaning across every diagram' vs :410 'per group, not per the global theme'. Auth is purple, and the legend describes shapes that aren't there.
- **Impact:** The promised consistent theming can't be achieved.
- **Fix:** Pick one model, and generate legends from the classDefs actually used.
- **Found by:** pair:arch-viz, lens:authoring

### F108: Global theme block uses semicolons and has no diagram header, but is mandated for all diagrams

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-visualize/SKILL.md:100-113,214-218,701 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** `classDef ...;` lines in a ```mermaid block with no type, while :214 says semicolons break erDiagram.
- **Impact:** Pasting it breaks ERD and class rendering, and a saved block errors.
- **Fix:** Fence it as text, and embed the correct syntax in each template.
- **Found by:** pair:arch-viz, lens:authoring, lens:accuracy-safety

### F109: classDiagram styling instructions contradict each other and use undocumented syntax

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-visualize/SKILL.md:282-289,314,701-712 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** :314 'class A,B,C <name>;' vs :282/:707 one-per-line with no semicolons. The documented forms are cssClass "A,B" / class X:::name.
- **Impact:** Parse errors or uncolored class diagrams.
- **Fix:** Use cssClass or :::, delete the conflicting rules, and state the minimum Mermaid version.
- **Found by:** pair:arch-viz, lens:authoring, lens:accuracy-safety, lens:scenarios-b

### F110: Flowchart template uses 'Publish' as both a node id and a subgraph id

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-visualize/SKILL.md:138,432,443,456-458,475 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** `Publish{Publish now?}` and `subgraph Publish[...]`, with 'Follow the templates below exactly.'
- **Impact:** The canonical example misrenders and the bug gets copied.
- **Fix:** Rename one of them, add a unique-id rule, and render templates in CI.
- **Found by:** pair:arch-viz, lens:authoring, lens:accuracy-safety

### F111: No label-escaping or reserved-word rules; templates have unquoted special-character labels

- **Severity:** medium · **Kind:** gap · **Category:** correctness
- **Where:** backend-visualize/SKILL.md:326-327,389-399,679-712 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** `StaffLogin[/ /login/ /]`. Grep quot|escape|reserved: 0.
- **Impact:** Diagrams built from real routes (/users/:id) fail to render.
- **Fix:** Quote non-alphanumeric labels, use #quot;, avoid 'end', and keep ids alphanumeric.
- **Found by:** pair:arch-viz

### F112: ERD sourced from db-schema.md has no column data, but the template needs PK/FK/UK columns

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** visualize:25-27,40,88,213; memory-schema.md:136-173 (files: .agents/skills/backend-visualize/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** db-schema requires only tables with purpose plus relationships.
- **Impact:** Fabricated columns are presented as the project's schema.
- **Fix:** Draw table-level ERDs only from memory and take columns from ORM/DDL, never invent them.
- **Found by:** pair:arch-viz

### F114: Missing diagram types: state machine, C4, deployment, module dependency from code

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-visualize/SKILL.md:38-45,65-77,700 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Menu is ERD/Class/Actor/Flowchart/Sequence/Architecture, and no source uses imports or DI. 'ERD of the result' after a code-only refactor returns an unchanged ERD.
- **Impact:** Lifecycles, topology and the refactored module structure can't be shown.
- **Fix:** Add stateDiagram-v2, C4, deployment and module-dependency templates, and offer them when the schema is unchanged.
- **Verifier correction:** Remove the 'ERD of the result' claim; no skill or README contains it. Keep the gap as: no stateDiagram-v2 template for entity lifecycles and no code-derived module-dependency diagram. C4 and deployment are lesser additions, since the Architecture template partly covers them.
- **Found by:** pair:arch-viz, lens:scenarios-b

### F118: No render or validation step for generated Mermaid

- **Severity:** medium · **Kind:** gap · **Category:** authoring-quality
- **Where:** backend-visualize/SKILL.md:136-138,630-660,686 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Grep mmdc|validate: 0. Recovery relies on the user reporting the failure.
- **Impact:** Broken diagrams get delivered as done.
- **Fix:** Run mmdc or a checklist and fix before presenting.
- **Found by:** pair:arch-viz, lens:authoring

### F119: User/Actor template is copied from a specific ERP project and breaks the size rules

- **Severity:** medium · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-visualize/SKILL.md:132,138,322-385,411 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** NextAuth, Finance, Vendors; an 11-node subgraph vs the 3–7 rule.
- **Impact:** Irrelevant specifics leak into users' diagrams.
- **Fix:** Replace it with a small generic example, and derive names from the project.
- **Found by:** pair:arch-viz

### F120: backend-visualize is 722 lines, repeats rules and loads every template

- **Severity:** medium · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-visualize/SKILL.md:142-626,679-712 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** The & rule is restated about 8 times and the no-semicolon rule 4 times.
- **Impact:** High token cost and repeated rules that have already drifted.
- **Fix:** Move templates to references/<type>.md and pitfalls to one file.
- **Found by:** pair:arch-viz, lens:authoring

### C016: Diagram conventions put meaning in color alone and never add Mermaid accessibility metadata

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-visualize/SKILL.md:115-126, 630-660 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** visualize:115 says 'Use the same color meaning across every diagram type', with a table mapping Blue to entities, Orange to actors, Purple to databases and so on. The sample legend (lines 651-655) is 'Blue boxes = database entities ... Purple cylinders = data stores'. A search for `accTitle|accDescr|accessib|contrast|color-blind` across `.agents/` returns nothing. Mermaid supports `accTitle:` and `accDescr:` for screen readers.
- **Impact:** Diagrams saved to `docs/` for teams encode category by color alone, which fails WCAG 1.4.1 (Use of Color) and makes them unreadable for color-blind readers and screen-reader users.
- **Fix:** Require `accTitle`/`accDescr` in every template, pair each color class with a shape or label prefix so color is never the only cue, and pick palette pairs with sufficient contrast.
- **Found by:** critic

### F101: Tech-stack catalogue covers only Node/Python/Go/Java and omits gRPC, brokers and SSE

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-architect/SKILL.md:94-109,171-174 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Grep .NET|Rust|Django|NestJS|gRPC|Kafka|SSE: 0.
- **Impact:** Other ecosystems and messaging designs get no guidance.
- **Fix:** Use a criteria-based table that includes .NET, Rust, Rails, Laravel, Kotlin, gRPC and brokers, with SSE in the real-time tree.
- **Verifier correction:** The impact is overstated. Elsewhere in the suite: gRPC is covered in backend-api-design:83-86, SSE in api-design:289, and brokers in backend-ops:166-186 and 389-392 (job queues vs brokers, outbox, Kafka-style log). Messaging designs do get guidance, just not inside the architect. Architect line 190 ('Choose language team is most familiar with') reduces the ecosystem bias. Only 4 ecosystems are listed suite-wide (implement:3 and refactor:3 'Supports Node.js, Python, Go, and Java'), but the agent's general knowledge covers other stacks. This is a coverage nicety, so low severity.
- **Found by:** pair:arch-viz

### F102: Requirements step doesn't quantify NFRs or cover DR, tenancy, threat model or cost

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-architect/SKILL.md:48-60,200-204 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Free-form NFR question at :56. Grep SLO|RPO|tenan|threat: 0.
- **Impact:** Pattern choices can't be justified or verified.
- **Fix:** Add an NFR worksheet (RPS, SLOs, RPO/RTO, residency, tenancy, budget) and a light threat model with an auth handoff.
- **Verifier correction:** The claim that the step 'doesn't quantify NFRs' and lacks cost is inaccurate. Line 53 asks for quantified load ('users/day, requests/sec, data volume'). Line 55 asks about budget, and line 294 covers budget constraints. Line 56 prompts for latency, availability and compliance, which is enough to steer an agent to ask. The real gap is narrower: explicit target or SLO numbers, tenancy model, DR and a light threat model with an auth handoff. That is an enhancement-level gap, not a medium-severity one.
- **Found by:** pair:arch-viz

### F104: Database and protocol choice owned by architect, db-design and api-design with no authority rule

- **Severity:** low (was medium) · **Kind:** gap · **Category:** consistency
- **Where:** architect:94-109,240; db-design:14,63-83; api-design:71-86 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** All three select the DB or protocol, and none reuses a recorded decision.
- **Impact:** The choice gets reopened or contradicted midway.
- **Fix:** The architect owns it and records it in decisions.md, and the other skills honor recorded choices.
- **Verifier correction:** 'none reuses a recorded decision' is overstated. api-design Step 0 (lines 41, 44) loads tech-stack.md and decisions.md. db-design:32 always loads tech-stack.md and loads decisions.md for 'prior design choices'. A recorded stack would therefore be in context. The practical failure comes mostly from F020: the architect never records its choice, so nothing is there to reuse. The remaining issue is the missing explicit authority rule, which makes this a low-severity consistency gap that largely duplicates F020.
- **Found by:** pair:arch-viz, pair:db-migrate

### F106: 'Architecture diagram' and 'ERD' triggers overlap; visualize's description lists only DB phrases

- **Severity:** low (was medium) · **Kind:** defect · **Category:** routing
- **Where:** line 3 of all three (files: .agents/skills/backend-visualize/SKILL.md, .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** architect 'creates ... mermaid diagrams', db-design 'creates ERD diagrams', and visualize has no sequence/flowchart/architecture phrases.
- **Impact:** Diagram requests misroute or don't trigger.
- **Fix:** State the boundaries in the descriptions and add the missing phrases.
- **Verifier correction:** 'visualize has no sequence/flowchart/architecture phrases' is inaccurate. visualize:3 explicitly says 'Supports ERD, class diagrams, user/actor diagrams, flowcharts, sequence diagrams, and architecture diagrams' and ends with 'or wants a visual representation of backend structure'. visualize:13 lists 'user flows, actor diagrams, or system architecture diagrams'. orchestrator:44 routes 'architecture diagram' to backend-visualize. Description matching is semantic, so misrouting risk is modest. The fix is limited to adding quoted trigger phrases and stating boundaries, which is low severity.
- **Found by:** pair:arch-viz

### F113: No concrete schema or flow extraction rules (globs, cardinality mapping, type sanitizing)

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-visualize/SKILL.md:81-94,211-228,543-551 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Lists ORMs by name with no globs, no source precedence, no nullable→|o mapping, and no fix for decimal(10,2) types.
- **Impact:** Varying, wrong-cardinality or unparseable diagrams.
- **Fix:** Add a references file with per-ORM globs, mappings, precedence, type rules and a call-trace recipe.
- **Verifier correction:** Narrow the finding to: (a) no attribute-type sanitizing rule for erDiagram (e.g. decimal(10,2), enum or array types); (b) no source-precedence rule between db-schema.md memory and ORM/DDL/migrations; (c) no explicit nullable-FK to |o / o| mapping. Drop the per-ORM glob claim, and note that :683 already covers asking about ambiguous cardinality and optionality. Severity low.
- **Found by:** pair:arch-viz

### F115: Visualize always forces the diagram menu, even when the type is named or inferable

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** backend-visualize/SKILL.md:10,22-24,61-63,83,685 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** REQUIRED 'ask the user to pick from the diagram menu' and 'Do not guess', even for 'draw ERD'. Input source: :92 auto-detect vs :685 ask.
- **Impact:** Redundant turns, and orchestrated runs stall.
- **Fix:** Skip the menu when the type is named or inferable, and pick one input-source default.
- **Verifier correction:** Drop the 'orchestrated runs stall' impact, since no workflow calls backend-visualize. Treat :92 vs :685 as a minor ambiguity. The remaining issue is that the menu is forced even when the user already named the diagram type. Severity low.
- **Found by:** pair:arch-viz, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F116: Description-only diagrams are blocked by the project-root prerequisite

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** visualize:18,59,89,681; context-loading.md:27 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** A user description is a valid source (:89), but the inherited root check stops the run.
- **Impact:** Quick sketches before any code exists are blocked.
- **Fix:** Skip project and memory checks when the source is a description or pasted DDL.
- **Verifier correction:** Same issue, but the impact is an unnecessary stop-and-ask plus a possible forced backend-scan, not an outright block. Severity low.
- **Found by:** pair:arch-viz

### F117: 'Update project memory' and 'visual decisions' point to memory content that doesn't exist

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** backend-visualize/SKILL.md:57,716-722 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Offers to update memory, but no schema covers diagrams.
- **Impact:** Ad-hoc writes break canonical files.
- **Fix:** Drop the option, or define a Diagrams link section in project-overview.
- **Verifier correction:** Narrow the finding to the undefined "update project memory" option at :720-722, which has no target file or section in memory-schema.md. Drop the claim that "visual decisions" point to content that doesn't exist: decisions.md covers design decisions. Lower the severity to low, because the append-only update rules limit any damage.
- **Found by:** pair:arch-viz

### F244: Architect's minor inconsistencies: duplicate questions, conflicting context lists

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** backend-architect/SKILL.md:26,31-44,52,64,166-167 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** The same question appears at :26 and :52, :166 and :167 duplicate each other, and Database principles aren't loaded.
- **Impact:** Redundant prompts.
- **Fix:** Remove duplicates and align the load lists.
- **Found by:** pair:arch-viz, lens:authoring, lens:scenarios-a

### F246: Saving diagrams has no existing-file check or provenance

- **Severity:** low · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-visualize/SKILL.md:716-722 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** 'write the diagrams to a Markdown file under docs/', with no existence check.
- **Impact:** Hand-maintained docs get overwritten.
- **Fix:** Check first, confirm, and add a source/commit header.
- **Found by:** pair:arch-viz

### F247: ERD example models M:N without a junction table and a multi-value column

- **Severity:** low · **Kind:** defect · **Category:** correctness
- **Where:** backend-visualize/SKILL.md:153,168-172,659 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** `USERS }o--o{ ROLES`, `string permissions`, while the note claims a junction table.
- **Impact:** Teaches denormalized models.
- **Fix:** Add USER_ROLES and permissions entities.
- **Found by:** pair:arch-viz

### F248: Visualize's minor inconsistencies (eager vs lazy, & claim)

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** backend-visualize/SKILL.md:34,51-57,417 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** 'others lazily' vs loads all five. Claims & fan-out that isn't in the template.
- **Impact:** Contradictory instructions.
- **Fix:** Load per diagram type and fix the claim.
- **Found by:** pair:arch-viz

### F249: Nested code fences in visualize's Output Format break the document

- **Severity:** low · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-visualize/SKILL.md:642-660 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** A ```markdown fence contains a ```mermaid fence, and the legend mentions shapes that aren't there.
- **Impact:** Garbled rendering.
- **Fix:** Use a 4-backtick outer fence and fix the legend.
- **Found by:** pair:arch-viz, lens:authoring

### F250: Renderer version and dark-mode readability not addressed

- **Severity:** low · **Kind:** gap · **Category:** portability
- **Where:** backend-visualize/SKILL.md:146,200-208,512-541 (files: .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** ER classDef needs Mermaid 11, and the pale rect blocks wash out in dark mode.
- **Impact:** Parse failures on older renderers and unreadable text.
- **Fix:** State the minimum version with a fallback, and use rgba/base theme.
- **Found by:** pair:arch-viz

## backend-db-design & backend-migrate

### F003: Expand/contract rename example has no dual-write, so writes after the backfill are lost at DROP

- **Severity:** high (was critical) · **Kind:** defect · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:70-90,108-117,135-142 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** :73 "backfill or dual-write". The single SQL block :79-89 runs ADD COLUMN, then an unbatched UPDATE, then a comment saying to switch, then `DROP COLUMN email`. There is no dual-write or trigger, and all phases sit in one migration. :110-117 gives a different sequence.
- **Impact:** Rows written through `email` during the rollout keep the new column NULL. The contract DROP then deletes the only copy, which is permanent data loss on the login table.
- **Fix:** Require dual-write (trigger or app) AND a batched backfill, then a parity check, then the read switch. Put contract in a separate later release behind a backup gate and user confirmation.
- **Verifier correction:** Change 'all phases sit in one migration' to: the phases are shown as one SQL block with phase comments. Also note that :110-117 in the same file already gives the dual-write, batched-backfill, later-release-drop sequence, and that tool-rules.md:38 pauses auto mode on schema drops. The defect is that the canonical example and the 'or' at :73 contradict that sequence, so an agent that copies the example can lose data. Severity is high, not critical.
- **Found by:** lens:scenarios-a, pair:db-migrate, lens:accuracy-safety

### F022: NOT NULL 'safer sequence' still locks the table: no-op or unbatched UPDATE, then a full-scan SET NOT NULL

- **Severity:** high · **Kind:** defect · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:94-106,265 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** ADD COLUMN ... DEFAULT 1; then UPDATE ... WHERE IS NULL (no-op on PG11+, unbatched otherwise), then SET NOT NULL under ACCESS EXCLUSIVE. Grep for NOT VALID or VALIDATE CONSTRAINT: 0 hits.
- **Impact:** The recommended 'zero-downtime' path causes the outage it is meant to avoid.
- **Fix:** Use a constant-default ADD on PG11+, or a batched backfill → CHECK NOT VALID → VALIDATE → SET NOT NULL. Use the same pattern for FKs and CHECKs, and build UNIQUE via a concurrent index.
- **Found by:** pair:db-migrate, lens:authoring, lens:accuracy-safety, lens:scenarios-a

### F023: No lock_timeout or statement_timeout guidance for DDL

- **Severity:** high · **Kind:** gap · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:54-59,92-127,253-269 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** Grep for lock_timeout|statement_timeout returns 0. :257 'Small (< 1M rows) ... usually fine' and :264 'Add nullable column | Online' size risk by row count, not lock level.
- **Impact:** Even instant DDL can queue behind a long transaction and stall all traffic on a hot table.
- **Fix:** Require SET lock_timeout and statement_timeout with retry, check pg_stat_activity first, and cover MySQL lock_wait_timeout. Classify operations by the lock they take.
- **Found by:** pair:db-migrate, lens:accuracy-safety, lens:scenarios-a, lens:coverage

### F026: No tool-specific migration workflow; ORM rename-as-drop and DB-resetting commands are not flagged

- **Severity:** high · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-migrate/SKILL.md:25,46-280; implement:231-240 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Prisma/Alembic/Rails/Flyway appear only in the glob. Prose search for these tools: 0 hits. Nothing covers @map/ignored_columns/db_column, `migrate reset`, `db push --accept-data-loss`, or reviewing autogenerated SQL.
- **Impact:** `prisma migrate dev` after a field rename drops the column with its data, and dev commands can reset the DB.
- **Fix:** Add a per-tool table (generate/apply/status/down, destructive commands, no-transaction switch, rename idioms), require a review of generated migrations for DROP, and cover parallel-branch conflicts.
- **Found by:** pair:db-migrate, lens:scenarios-a

### F024: CREATE INDEX CONCURRENTLY: transaction-wrapping ignored and failure guidance wrong

- **Severity:** medium (was high) · **Kind:** defect · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:58,119-127,231-233 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** The skill recommends CIC with no warning that it can't run in a transaction block, and most runners wrap migrations in one. :127 'may fail silently ... re-run if needed'. A failure actually errors and leaves an INVALID index, and the :233 query returns OIDs, not names.
- **Impact:** Migrations fail at deploy time, the agent may drop CONCURRENTLY, and an invalid index lingers.
- **Fix:** Give per-tool non-transactional opt-outs, one CIC per migration, and recovery via DROP INDEX CONCURRENTLY IF EXISTS / REINDEX CONCURRENTLY with a named query.
- **Verifier correction:** The defect is real but medium, not high. Both failures are loud, recoverable deploy errors with no data loss, and the skill's own staging check (:215-225) and the pg_index check at :233, which works apart from returning OIDs, would surface them.
- **Found by:** pair:db-migrate, lens:authoring, lens:accuracy-safety, lens:scenarios-a

### F025: backend-migrate has no confirmation gate or execution boundary for DDL, backfills, drops or restores on real DBs

- **Severity:** medium (was high) · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-migrate/SKILL.md:30,75,89,194-200,213-225,271-280 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** The workflow ends 'Test on staging ... Deploy' without saying who runs it or against which DB. Grep confirm|mode=auto: 0. There is no reference check or backup check before contract.
- **Impact:** In default auto mode the agent may run DDL or mass UPDATEs against a prod or staging DATABASE_URL.
- **Fix:** The skill writes files plus a runbook and applies them only to a verified local DB. It always pauses on DROP, type change, backfill, restore or down migrations, and checks references and backups before contract.
- **Verifier correction:** The shared mode=auto contract (tool-rules.md:36-38) already pauses on schema drops, data deletion and production deploys. What is actually missing: backend-migrate does not reference that contract, gives no rule for verifying the target database (local only versus a remote DATABASE_URL), and has no explicit pause for mass backfill UPDATEs, type changes, restores or down migrations, and no concrete reference or backup check step before contract. Severity is medium.
- **Found by:** pair:db-migrate, lens:accuracy-safety, lens:scenarios-a, lens:authoring

### F027: Rename guidance never carries UNIQUE, NOT NULL, indexes or dependents to the new column

- **Severity:** medium (was high) · **Kind:** gap · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:79-90,108-117; db-design:112,120 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Expand adds `contact_email TEXT` with no constraints, and contract drops `email UNIQUE NOT NULL`. There is no step for views, triggers, FKs or publications.
- **Impact:** Login email loses uniqueness and NOT NULL, and dependent DB objects break.
- **Fix:** Add steps: unique index concurrently, NOT NULL via validated CHECK, and an inventory of dependents via pg_depend before contract.
- **Verifier correction:** The gap is real but partly mitigated by the required principles.md:9. Most dependent-object breakage (views) is a loud DROP failure, not silent. The real risk is that copying the example leaves contact_email without UNIQUE or NOT NULL. Severity is medium.
- **Found by:** lens:scenarios-a

### F121: Backfill example assumes integer PKs and uuid-ossp, which conflicts with UUID schemas

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** migrate:84,102,136-149,167-172; db-design:111,274 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** `id > :cursor AND id <= :cursor + :batch_size`, `last_cursor BIGINT`, uuid_generate_v4(), while db-design uses UUID gen_random_uuid(). Ordering by non-unique created_at.
- **Impact:** Backfills fail or skip rows on the suite's own schemas.
- **Fix:** Use keyset batching with LIMIT, a typed cursor and gen_random_uuid(), and batch every UPDATE.
- **Found by:** pair:db-migrate, lens:cross-consistency, lens:scenarios-a

### F123: backend-migrate is effectively PostgreSQL-only although MySQL and MongoDB are recommended

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** migrate whole body; db-design:70-78 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** Grep MySQL|Mongo|INSTANT|gh-ost|pg_repack: 0.
- **Impact:** MySQL users get PG rules and assume transactional DDL.
- **Fix:** Add MySQL online DDL and gh-ost, Mongo schemaVersion and lazy migration, and pg_repack.
- **Found by:** pair:db-migrate, lens:accuracy-safety, lens:coverage

### F124: Migrate checkpoint caveat redefines the contract, and git-checkout rollback can't undo applied migrations

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** migrate:165-175,282-286; tool-rules.md:53,59 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** migrate adds clearing rules and a second progress table, and tool-rules rollback is `git checkout -- <file>`.
- **Impact:** After apply, the DB and repo drift apart.
- **Fix:** Add a stateful side-effects clause: rollback means a down or forward-fix migration. Record the applied IDs.
- **Verifier correction:** Drop the 'second progress table' claim: migrate:167-173 is a DB-side backfill cursor, not a competing checkpoint. The added caveat follows the same pattern as implement:348 and refactor:279, so the redefinition point is low-value. Keep the real defect: tool-rules.md:59 offers file-level `git checkout` as the only rollback, and there is no clause saying that for applied migrations rollback means running a down migration or a forward fix, with the applied migration IDs recorded.
- **Found by:** pair:db-migrate

### F125: Down migrations promised for drops can't restore data, and there is no backup gate before contract

- **Severity:** medium · **Kind:** defect · **Category:** agent-safety
- **Where:** backend-migrate/SKILL.md:182-192,219-225,284-286 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** :184 'undo the schema change exactly'; staging requires 'Down migration also succeeds'.
- **Impact:** False confidence, and an irreversible drop runs without a backup.
- **Fix:** Mark contract steps as one-way, and require verified PITR or a backup plus confirmation.
- **Verifier correction:** The drop is not entirely ungated: tool-rules.md:38 pauses mode=auto for schema drops and data deletion, and migrate:194-211 discusses restore strategies and unsafe rollback. The gap is narrower. Down migrations for drops are presented as full undos (:184, :224), contract steps are not marked one-way, and there is no explicit 'verify backup or PITR first' requirement.
- **Found by:** lens:scenarios-a

### F126: Multi-release expand/contract has no phase tracking across sessions

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** migrate:271-286; orchestrator:50-145 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** The workflow is one linear pass, with no gates, no implement handoff and no persistent phase record.
- **Impact:** Gates get skipped across releases.
- **Fix:** Store a phased runbook in memory and add a Schema Evolution workflow.
- **Found by:** lens:scenarios-a

### F131: SQL templates: redundant email index, case-sensitive uniqueness, TIMESTAMP without tz, static updated_at, nullable defaults

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** db-design:109-122,270-288,323 (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/_shared/principles.md)
- **Evidence:** `email UNIQUE` plus `CREATE INDEX idx_users_email`, `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, role without NOT NULL, a speculative status index, unindexed FKs. No timezone guidance.
- **Impact:** Duplicate indexes, timezone bugs, case-variant accounts, stale updated_at.
- **Fix:** Use citext or a lower() unique index, timestamptz NOT NULL, a trigger for updated_at, FK indexes, and UTC/ISO guidance in principles.
- **Verifier correction:** Drop or soften the 'unindexed FKs' sub-claim: the SQL templates define no FKs, and :321 says to index join columns. At most, note there is no explicit 'index FK columns in PostgreSQL' rule. Also note that the TIMESTAMP usage conflicts with backend-migrate:171, which uses TIMESTAMPTZ.
- **Found by:** pair:db-migrate, lens:accuracy-safety, lens:authoring, lens:scenarios-a, lens:coverage

### F132: Soft-delete template models deletion twice and keeps a global UNIQUE email

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-db-design/SKILL.md:236-240,274-286 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Both status 'deleted' and deleted_at, plus UNIQUE(email). Grep PII|GDPR: 0.
- **Impact:** Users can't re-register, the two fields disagree, and erasure is impossible.
- **Fix:** Use one mechanism, a partial unique index WHERE deleted_at IS NULL, and erasure guidance.
- **Verifier correction:** Correct the evidence: PII is mentioned at api-design:356 and ops:79 (logs and responses), but nothing covers data-layer erasure or retention. Restate the impact as 'no guidance for erasure or anonymization of soft-deleted rows' rather than 'erasure is impossible'.
- **Found by:** pair:db-migrate, lens:accuracy-safety

### F135: Primary-key strategy defaults to UUIDv4 everywhere with no criteria

- **Severity:** medium · **Kind:** enhancement · **Category:** coverage
- **Where:** backend-db-design/SKILL.md:92,111,274 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** 'UUID vs auto-increment' only. Grep uuidv7|IDENTITY: 0.
- **Impact:** Index fragmentation and a mismatch with migrate's backfill.
- **Fix:** Use identity for internal keys and UUIDv7 for exposed ones, with MySQL BINARY(16).
- **Found by:** pair:db-migrate

### F136: MySQL support claimed but only PostgreSQL DDL given, and no ORM schema output

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-db-design/SKILL.md:70-73,87-145,268-345 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** gen_random_uuid() and partial indexes. Grep Prisma|SQLAlchemy|GORM|JPA: 0. The Mongo template mixes Mongoose and shell syntax.
- **Impact:** MySQL DDL fails, and ORM translation drifts.
- **Fix:** Add a MySQL variant and per-ORM pointers in references/.
- **Found by:** pair:db-migrate

### F137: db-design Step 1.6 'MANDATORY' has no actions; the live schema is never inspected

- **Severity:** medium · **Kind:** gap · **Category:** authoring-quality
- **Where:** backend-db-design/SKILL.md:36-38,57-61 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** It only points to tool-rules. Memory is the only input, while memory-schema says 'Live code wins'.
- **Impact:** Designs clash with real tables and conventions.
- **Fix:** Glob and read schema and migrations, extract conventions, and run a memory conflict check.
- **Found by:** pair:db-migrate

### F139: Identity and role model designed in db-design, auth and visualize with incompatible shapes

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** db-design:113-114,236-240,276-277; auth:92,159-162,187-189; visualize:153,168-172 (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** A single role CHECK column with NOT NULL password_hash, vs roles arrays and admin/editor/viewer, vs an M:N with no junction.
- **Impact:** Rework, broken social login, mismatched code.
- **Fix:** Auth owns the identity/RBAC model (nullable credential, user_roles, permissions), and db-design defers to it.
- **Found by:** pair:db-migrate, pair:api-auth, lens:cross-consistency

### C010: Query-plan verification uses EXPLAIN ANALYZE with no warning that it executes the statement

- **Severity:** low (was medium) · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-migrate/SKILL.md:240-249 and 279; backend-implement/SKILL.md:268 (files: .agents/skills/backend-migrate/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** migrate:244-249 gives `EXPLAIN (ANALYZE, BUFFERS) SELECT ...` and says 'Compare plans before and after the migration'. Workflow step 7 (line 279) is 'Verify constraints, indexes, and query plans'. implement:268 says 'Check query plans or execution if the database supports it'. Neither skill says which database to run against or that ANALYZE actually runs the statement. In PostgreSQL, `EXPLAIN ANALYZE` on UPDATE, DELETE or INSERT, including the backfill statements in migrate:136-158, changes data unless wrapped in `BEGIN; ... ROLLBACK;`, and on large tables it does the full work.
- **Impact:** An agent checking whether a backfill or repository UPDATE uses the new index can apply that write for real, possibly against whatever database `DATABASE_URL` points to, or run a full-cost query on a production-sized table. F025 covers DDL gates, not this verification step.
- **Fix:** Use plain `EXPLAIN` by default. Allow `EXPLAIN ANALYZE` only on a disposable or staging database and, for DML, only inside `BEGIN; ... ROLLBACK;`. State the target database explicitly and require confirmation before running against any non-local database.
- **Found by:** critic

### C013: No internationalization guidance: character sets, collation, Unicode normalization or localized responses

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-db-design/SKILL.md:70-73,87-118; backend-api-design/SKILL.md:144-174,318-348; principles.md (no i18n section) (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-api-design/SKILL.md, .agents/skills/_shared/principles.md)
- **Evidence:** A case-insensitive search for `utf|collat|charset|unicode|locale|i18n|l10n|Accept-Language|translat|timezone|currency` across `.agents/` matches only `FixedClock` in backend-test:110 and two 'concurrency' false positives. db-design recommends MySQL (70-73) with `VARCHAR(255)` columns but never says to use `utf8mb4` (MySQL's legacy `utf8` cannot store 4-byte characters such as emoji or some CJK). Uniqueness on emails and usernames has no Unicode normalization (NFC/NFKC) or IDN guidance. API error messages are fixed English strings with no `Accept-Language` or `Content-Language` handling, and `createdAt: string; // ISO timestamp` (api-design:157) sets no UTC or offset rule. F131 covers only case sensitivity and TIMESTAMP without time zone.
- **Impact:** Generated schemas can silently truncate or reject multilingual data in MySQL. Visually identical Unicode identifiers can bypass uniqueness checks (homograph or duplicate accounts). APIs cannot serve localized errors. This matters for the suite's own audience: the README is translated into Indonesian, Spanish, Chinese and Japanese.
- **Fix:** Add an i18n section to principles and db-design: utf8mb4 and an explicit collation for MySQL, a deliberate collation or ICU choice for PostgreSQL, NFKC plus case-fold normalization for identifiers, and UTC timestamps with explicit offsets in API payloads. In api-design, use machine-readable error codes with localized messages chosen via Accept-Language.
- **Found by:** critic

### F122: Migration directory glob misses common layouts and stops greenfield first migrations

- **Severity:** low (was medium) · **Kind:** defect · **Category:** correctness
- **Where:** backend-migrate/SKILL.md:24-26 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** Five fixed paths miss Django apps, Laravel, goose, TypeORM, Drizzle, Supabase and EF. It stops if none match.
- **Impact:** Valid projects halt, and the db-design→migrate first migration has no path.
- **Fix:** Detect the tool from the manifest, use ** globs, and offer to initialize.
- **Verifier correction:** Drop the greenfield claim: first migrations belong to db-design, and its `migrations/` layout matches the glob. What remains is that the root-anchored globs miss several common layouts, causing an unnecessary stop-and-ask in Django, Laravel, Supabase, Drizzle, TypeORM and monorepo projects. Severity is low.
- **Found by:** pair:db-migrate, lens:scenarios-a, lens:coverage

### F127: Bare 'migration'/'migrate' triggers collide with framework, upgrade and API migrations

- **Severity:** low (was medium) · **Kind:** defect · **Category:** routing
- **Where:** backend-migrate/SKILL.md:3,11 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** 'migration', 'migrate', while refactor owns strangler migrations and the Spring guide is titled a 'Migration Guide'.
- **Impact:** Schema-DDL guidance activates for code or framework migrations.
- **Fix:** Qualify the triggers as database/schema and add a not-for clause.
- **Verifier correction:** Remove the fabricated 'Spring Migration Guide' evidence. The real collision is between the bare 'migrate'/'migration' triggers (migrate:3,11) and refactor's strangler-fig/legacy-modernization scope (refactor:3,13). backend-migrate lacks a reciprocal 'not for code/framework migrations' clause. Given the scoping words already in the description, severity is low.
- **Found by:** pair:db-migrate, lens:scenarios-b

### F128: Migrate verification depends on a staging DB; no local up/down/up, drift check or linter

- **Severity:** low (was medium) · **Kind:** enhancement · **Category:** testing-ci
- **Where:** backend-migrate/SKILL.md:213-249,278 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** Grep squawk|strong_migrations|atlas|testcontainers: 0.
- **Impact:** The agent can't verify, and may claim checks it didn't run.
- **Fix:** Add lint, an ephemeral up/down/up run and an ORM diff, and hand staging to the user.
- **Verifier correction:** Note that migration-correctness testing against a test DB exists in backend-test:51,73 and implement:239, and that tool-rules.md:28 forbids claiming unrun checks. What remains is that backend-migrate's own verification lacks a local up/down/up step, migration linting and a schema-drift check. Severity is low.
- **Found by:** pair:db-migrate

### F129: backend-migrate defines no deliverables or exit criteria

- **Severity:** low (was medium) · **Kind:** gap · **Category:** docs
- **Where:** backend-migrate/SKILL.md:271-280 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** 8 steps with no file paths, backfill location, runbook or 'done when'.
- **Impact:** Chained workflows have no completion signal.
- **Fix:** Add Outputs (files, backfill job, runbook, memory) and exit criteria.
- **Verifier correction:** Deliverables are partly defined: migration and down files and backfill scripts at :276-277, and memory updates to db-schema.md and decisions.md at :28-33. The gap is the missing explicit Output section with paths and runbook, and missing exit criteria, which several sibling skills do provide. Severity is low.
- **Found by:** pair:db-migrate

### F130: db-design has no concrete deliverable or exit criteria; its only output is an optional memory save

- **Severity:** low (was medium) · **Kind:** gap · **Category:** docs
- **Where:** backend-db-design/SKILL.md:215-232 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Ends with 'Should I save this to db-schema.md memory?'.
- **Impact:** Nothing persists if the user declines, and no handoff happens.
- **Fix:** Specify outputs (memory, design doc, ADRs), exit criteria, and a handoff to migrate and api-design.
- **Verifier correction:** Persistence is specified at db-design:28 and orchestrator:63, and orchestrator:62-68 sequences the handoff to api-design. Reframe the finding as an inconsistency: automatic append on approval (:28) versus an optional save prompt (:232), and the orchestrator claiming db-design writes migration files while the skill only plans them (:179-187). Severity is low.
- **Found by:** pair:db-migrate

### F133: Database selection is partly inaccurate and ignores an already-chosen stack

- **Severity:** low (was medium) · **Kind:** defect · **Category:** correctness
- **Where:** backend-db-design/SKILL.md:14,63-83 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Mongo 'eventual consistency' (ACID since 4.0), MySQL 'less JSON support', and no check of tech-stack or decisions.
- **Impact:** Wrong steering, and DB switches proposed mid-feature.
- **Fix:** Correct the claims, skip selection when a DB is already recorded, and map to Step 1 answers.
- **Verifier correction:** Only the MongoDB 'eventual consistency' claim is materially wrong; the MySQL JSON and type comparison is defensible. Selection is not entirely blind to the stack, because tech-stack.md is loaded at :32 and :36-38, but Step 2 should explicitly skip selection when a DB is already recorded. Severity is low.
- **Found by:** pair:db-migrate, lens:accuracy-safety

### F134: Foreign-key guidance is shallow: no FK-index rule, no ON DELETE choice, no FK DDL

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-db-design/SKILL.md:93-97,109-122,312-325 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Grep 'ON DELETE': 0. PG doesn't index referencing columns.
- **Impact:** Slow joins and deletes, and accidental CASCADE.
- **Fix:** Add FK DDL, an index rule, and an ON DELETE decision table.
- **Verifier correction:** Narrow the gap. The skill already asks for an FK delete/update decision (L97, L223) and indexes join columns (L321). What is missing is: (a) decision guidance for RESTRICT vs CASCADE vs SET NULL; (b) a PostgreSQL-specific note that referencing columns are not auto-indexed, which matters for parent deletes and updates, not only joins; (c) any DDL example with a REFERENCES clause. This is a depth gap, so low rather than medium.
- **Found by:** pair:db-migrate

### F138: Domain depth gaps: concurrency columns, outbox table, money, enums, sensitive columns, naming

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-db-design/SKILL.md:189-205,249-255,383-387 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Optimistic locking and outbox are only named. 'decimal type' has no precision or currency. Grep encrypt: 0.
- **Impact:** Expensive schema mistakes later.
- **Fix:** Add pattern cards for version column, outbox, money, enums, naming, encryption and partitioning.
- **Verifier correction:** Drop outbox (covered in backend-ops L182-186, not mentioned in db-design at all), naming (L90, L127), enums (L106, L277-278) and partitioning (L383) from the gap list. Keep: no version-column example for optimistic locking, no money precision or currency guidance, and no sensitive-column handling in db-design (principles.md L44 covers only secrets at rest). A cross-reference to backend-ops' outbox section would be a nice touch. Severity is low.
- **Found by:** pair:db-migrate

### F254: MongoDB template's sparse index is ineffective with default null, and no validator is shown

- **Severity:** low · **Kind:** defect · **Category:** correctness
- **Where:** backend-db-design/SKILL.md:126-145,338-344 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** `deletedAt default null` + `sparse: true`, no $jsonSchema, case-sensitive unique email.
- **Impact:** The index gives no savings, and collections have no validation.
- **Fix:** Use a partialFilterExpression, a validator example, and a collation.
- **Found by:** pair:db-migrate, lens:accuracy-safety

### F255: db-design has misplaced examples and placeholder steps

- **Severity:** low · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-db-design/SKILL.md:53-61,179-213 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** The migration file example sits in Step 5.5, with tool-agnostic naming, and staging testing appears in a design skill.
- **Impact:** Confusing order and unusable file names.
- **Fix:** Renumber and defer to migrate.
- **Verifier correction:** Keep: the migration-structure example is misplaced under Step 5.5, and Steps 1.5/1.6 are pointer-only. Drop 'unusable file names'; the real issue is that db-design never tells the agent to match the project's existing migration tool and naming convention. Drop 'staging testing does not belong': the orchestrator (L63) gives greenfield migration files to db-design. Severity is low.
- **Found by:** pair:db-migrate

### F256: Duplicated example blocks inflate db-design

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** db-design:110-121 vs 271-288; 151-177 vs 348-377 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Two near-identical DDL, Mongo and ERD blocks that have already drifted.
- **Impact:** Tokens wasted, and the weaker copy gets used.
- **Fix:** Keep one canonical example per store in references/.
- **Found by:** pair:db-migrate

### F257: Migrate polish: heading spacing, duplicated prerequisite, 'logical restore' misused

- **Severity:** low · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-migrate/SKILL.md:27,41,179-180,196 (files: .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** No blank line before ## Rollback Planning, and 'Logical restore: reverse the migration'.
- **Impact:** Rendering and terminology problems.
- **Fix:** Fix the spacing and rename the term.
- **Verifier correction:** The missing blank line at line 179/180 does not break rendering, because CommonMark ATX headings can interrupt paragraphs. It is a source-style or lint issue only. The real substance is the 'Logical restore' mislabel at line 196, which could confuse readers because the term normally means restoring from a logical dump such as pg_dump; rename it to something like 'Reverse migration / forward-fix'. The REQUIRED principles.md Database-section requirement at line 27 is repeated at line 41 and pointed to again at line 48, which is redundant but harmless. Overall severity: low polish.
- **Found by:** pair:db-migrate, lens:authoring

## backend-api-design & backend-auth

### F033: JWT guidance has no verification rules (alg pinning, iss/aud/exp/nbf, JWKS/kid, secret strength, revocation)

- **Severity:** high · **Kind:** gap · **Category:** security
- **Where:** auth:72-122,246-249,274; deploy:250 (files: .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Claims listed, but grep alg|HS256|RS256|JWKS|nbf returns nothing. :274 shared validation with no asymmetric keys. :116 'Revoke all tokens' has no mechanism. Refresh reuse doesn't revoke the token family.
- **Impact:** Generated verifiers accept alg confusion or skip claims, enabling forged tokens and auth bypass.
- **Fix:** Add a verification checklist: algorithm allowlist, iss/aud/exp/nbf with leeway, typ at+jwt, asymmetric keys plus local JWKS, ≥256-bit HS secrets, token_version revocation, family revoke on reuse.
- **Found by:** pair:api-auth, lens:accuracy-safety, lens:coverage

### C014: No HTTP caching semantics for API responses (Cache-Control, Vary, ETag/304), despite CDN advice

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-api-design/SKILL.md:75; backend-ops/SKILL.md:137-142,365-368 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** api-design:75 lists 'HTTP caching' as a REST advantage. Ops:141-142 recommend 'CDN | Static assets, public GET responses' and 'HTTP cache headers | Browser/proxy caching for idempotent reads'. A search for `ETag|Cache-Control|If-None-Match|304|Vary` across `.agents/` returns nothing. No rule separates `public` from `private`/`no-store` for authenticated or per-user responses, and none requires `Vary: Authorization, Cookie, Accept-Language`. F262 covers only a missing `Cache-Control: no-store` among auth security headers, and F145 covers optimistic concurrency, not read caching.
- **Impact:** Following 'put public GETs behind a CDN' without these rules risks a shared cache storing one user's authenticated response and serving it to another, a classic data leak. Conversely, APIs miss cheap conditional-GET savings.
- **Fix:** Add a caching section to api-design: default `Cache-Control: no-store` or `private` for authenticated endpoints, explicit `public, max-age` only for truly public resources, the correct `Vary` headers, and ETag/If-None-Match with 304. Have doctor flag authenticated routes served through a CDN without these headers.
- **Found by:** critic

### F030: Auth code ownership split between backend-auth and backend-implement, with conflicting guidance

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** auth:3,185-225,293; implement:195-196,305-308 (files: .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-implement/SKILL.md)
- **Evidence:** auth claims to 'Design and implement' yet hands off to implement (:293). implement :195 generates JWT/RBAC itself with no auth input. implement :307 'Email already registered' contradicts auth :195 anti-enumeration.
- **Impact:** Security-critical code can be generated without auth's defaults.
- **Fix:** Pick one owner. If implement writes the code, make the auth decision record a REQUIRED input and align the enumeration examples.
- **Verifier correction:** Narrow this to: implement's Authentication branch (:195-196) has no link to backend-auth, and no persisted auth contract exists for it to consume (the root cause, shared with F031). Treat the 'Email already registered' example as a minor wording inconsistency, not a contradiction. Severity is medium, not high.
- **Found by:** pair:api-auth, pair:impl-refactor, lens:cross-consistency

### F031: backend-auth never saves decisions to memory, though the orchestrator says it writes decisions.md

- **Severity:** medium (was high) · **Kind:** gap · **Category:** consistency
- **Where:** auth:283-293; orchestrator:71 (files: .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** orchestrator :71 'Writes: decisions.md'. auth has no write step, and memory-schema's Authentication and Auth sections are never filled.
- **Impact:** Mechanism, lifetimes and role model are lost, and implement/test/doctor have no auth contract.
- **Fix:** Add a persist step: an ADR in decisions.md plus api-patterns Authentication and tech-stack Auth, in the schema format.
- **Verifier correction:** Drop the claim that the Authentication and Auth sections are never filled; backend-scan:102-103 and api-design:260 fill them. The real defect is that the design rationale from backend-auth (mechanism, lifetimes, role model) is never recorded, which contradicts orchestrator:71. Severity is medium.
- **Found by:** pair:api-auth, lens:cross-consistency, lens:authoring, lens:scenarios-a

### F034: GraphQL and gRPC claimed but only REST/OpenAPI has working guidance

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-api-design/SKILL.md:3,78-86,109-130,246-260 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** gRPC gets 3 pros/cons bullets. The GraphQL example references undefined types and has no error model, DataLoader, depth/complexity limits or introspection policy. The only deliverable is an OpenAPI spec.
- **Impact:** GraphQL and gRPC users get non-compiling schemas, no contract artifact, and DoS-prone APIs.
- **Fix:** Add references/graphql.md and grpc.md with full examples, error model, limits, versioning and lint/breaking tools (buf, GraphQL Inspector).
- **Verifier correction:** Credit backend-implement:190 for DataLoader and api-design:81 for N+1 awareness. The real gaps are gRPC design guidance and a contract artifact (no .proto at all), and GraphQL's error model and abuse limits (depth, complexity, introspection). Severity is medium, since agents can fall back on general protocol knowledge, though the description overclaims.
- **Found by:** pair:api-auth, lens:coverage, lens:accuracy-safety

### F035: CSRF and session hardening are missing for cookie-borne credentials

- **Severity:** medium (was high) · **Kind:** gap · **Category:** security
- **Where:** backend-auth/SKILL.md:48-52,118-122,227-249,259-263,277-281 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** :263 'CSRF protection if using cookie-based sessions' is the only mention, while :262 puts the access token in a cookie and :120 allows SameSite None. Grep fixation|regenerate|idle: 0.
- **Impact:** Cookie-JWT APIs and admin dashboards ship CSRF-able, with session fixation and no timeouts.
- **Fix:** Require CSRF defenses (token plus Origin/Sec-Fetch checks) for any ambient cookie credential, session ID regeneration, and idle/absolute timeouts.
- **Verifier correction:** The line reference should be :261 (access token in cookie), not :262. Note that the Lax/Strict defaults at :52 and :119 partly mitigate CSRF. The remaining gaps are: no CSRF mechanism for SameSite=None or cookie-JWT setups, no session-ID regeneration, and no idle or absolute timeouts. Severity is medium.
- **Found by:** pair:api-auth, lens:accuracy-safety

### F036: Idempotency keys are mandated but no implementation pattern is given

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** principles.md:27; db-design:198 (files: .agents/skills/_shared/principles.md, .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** principles :27 'use idempotency keys for critical POST flows'. Grep Idempotency-Key and grep idempot in api-design both return 0.
- **Impact:** Retries can double-charge or double-create records.
- **Fix:** Add an Idempotency-Key contract, an idempotency_keys table, fingerprint mismatch → 422, in-flight duplicate → 409, response replay, and tests.
- **Verifier correction:** Severity is medium: a missing implementation pattern for a principle that is mandated, not a high-impact defect.
- **Found by:** lens:coverage, pair:api-auth

### F037: No guidance for inbound or outbound webhooks (raw body, signature, dedup, retries, SSRF)

- **Severity:** medium (was high) · **Kind:** gap · **Category:** security
- **Where:** memory-schema.md:108; auth:67; test:58 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-implement/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** memory-schema defines an empty Webhooks section. Grep stripe|signature|raw body returns nothing relevant. auth :67 treats webhooks like hashed API keys.
- **Impact:** Unverified webhooks let anyone forge 'invoice.paid', and duplicates are processed twice.
- **Fix:** Inbound: raw-body route ordering, signature check before parse, event_id dedup, ack-then-queue. Outbound: signing, outbox retries, SSRF checks.
- **Verifier correction:** Credit implement:325 and ops:179-184 (outbox) for outbound delivery and retries. The missing pieces are inbound signature verification on the raw body, dedup and replay protection, and SSRF and signing guidance for outbound targets. Also note that auth:67 combined with :70 (hash-only storage) is wrong for HMAC webhook secrets.
- **Found by:** lens:coverage, lens:scenarios-a, pair:api-auth

### F141: backend-api-design has no output path, validation or exit criteria

- **Severity:** medium · **Kind:** gap · **Category:** docs
- **Where:** backend-api-design/SKILL.md:176-178,246-260 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'Generate OpenAPI 3.0 specification' with no path, no lint, and no handoff.
- **Impact:** Specs end up in chat, and downstream skills don't know what to consume.
- **Fix:** Default to docs/api/openapi.yaml (or the existing spec), lint it, check it against db-schema, and hand off.
- **Found by:** pair:api-auth

### F142: API versioning and deprecation claimed but not covered

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-api-design/SKILL.md:3,99-107,354,357 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** Only /api/v1 and 'Consider API versioning'. Grep Sunset|Deprecation|oasdiff: 0.
- **Impact:** Breaking changes ship with no process.
- **Fix:** Add a scheme choice, breaking-change rules, Deprecation/Sunset headers and a CI diff check.
- **Found by:** pair:api-auth, lens:coverage

### F143: Sample OpenAPI spec is invalid (dangling $refs), has no security and is on 3.0.0

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-api-design/SKILL.md:176-244 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** Refs Pagination and CreateUser, but only User is defined. No securitySchemes, and 422 has no schema.
- **Impact:** Copied specs fail lint and codegen and omit auth.
- **Fix:** Ship a complete lint-clean 3.1 template with security and an error component.
- **Verifier correction:** Drop 'is on 3.0.0' as a defect. OpenAPI 3.0.x is still widely supported by tooling, so moving to 3.1 is an enhancement, not a correctness problem (if 3.0 stays, 3.0.3 is the better patch level). The defect is the unresolved $refs (Pagination, CreateUser), the missing securitySchemes/security and the 422 having no error schema.
- **Found by:** pair:api-auth, lens:authoring, lens:accuracy-safety

### F144: Pagination mixes cursor and offset fields, and casing conventions are mixed

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** api-design:98-107,186-200,273-277; memory-schema.md:129 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** 'Use cursor-based' then 'Include: page, per_page, total'. snake_case per_page vs camelCase createdAt.
- **Impact:** Inconsistent contracts and costly COUNT(*) on large tables.
- **Fix:** Give separate cursor and offset recipes with a tiebreaker, and state an explicit casing rule.
- **Found by:** pair:api-auth, lens:cross-consistency, lens:authoring, lens:accuracy-safety

### F145: No optimistic concurrency, long-running operation, bulk or PATCH-semantics patterns

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-api-design/SKILL.md:102,132-174,262-296 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** Grep etag|If-Match|202|bulk|problem+json: 0.
- **Impact:** Lost updates, request timeouts, ad-hoc bulk endpoints.
- **Fix:** Add ETag/If-Match→412, 202 plus an operation resource, bulk with per-item results, and a PATCH media type.
- **Verifier correction:** Acknowledge that db-design:198 covers optimistic locking at the DB layer. The gap is exposing it in the API contract (ETag/If-Match leading to 412). The other gaps stand: 202 Accepted plus an operation/status resource, bulk requests with per-item results, and PATCH semantics (merge-patch vs JSON Patch).
- **Found by:** lens:coverage, pair:api-auth

### F146: Rate limiting is required but not designed (algorithm, store, trusted proxy, headers)

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** principles.md:30; api-design:347,355; auth:231-234 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-auth/SKILL.md)
- **Evidence:** 'Implement rate limiting'. Grep Retry-After|trust proxy: 0. Hard lockout is recommended.
- **Impact:** Per-instance limiters keyed on the proxy IP, and attackers can lock out victims.
- **Fix:** Specify algorithm, key, Redis store, trusted proxy hops, RateLimit and Retry-After headers, and progressive delay.
- **Verifier correction:** Change the lockout evidence: auth:233 offers 'account lockout or exponential backoff'. The valid concern is that it does not warn that permanent or hard lockout lets attackers lock victims out, or recommend temporary or progressive lockout. The rest of the gap (algorithm, shared store, trusted-proxy IP resolution, RateLimit/Retry-After headers) stands.
- **Found by:** lens:coverage, lens:accuracy-safety, pair:api-auth

### F147: API design and principles omit BOLA, mass-assignment, SSRF and resource-limit controls

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** api-design:102-103,132-140; principles.md:24-31,42-49 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/_shared/principles.md)
- **Evidence:** The checklist asks only 'Authentication required', and PATCH /users/:id can set role. 'Input ... sanitization'. Grep SSRF: 0.
- **Impact:** Privilege escalation and cross-user object access.
- **Fix:** Add a per-endpoint authz rule, field allowlists, body and page limits, SSRF rules, and replace 'sanitize' with validate and encode.
- **Verifier correction:** Remove BOLA from the gap list (principles.md:29,45, auth:169-178 and doctor:161-165 cover it) and drop the fabricated 'PATCH can set role' evidence. The confirmed gaps are: no mass-assignment/field-allowlist guidance (DTO allowlisting for create and update bodies), no SSRF guidance for user-supplied URLs (webhooks, image fetch), no request-body size limits, and 'sanitize' wording where validate-and-encode is the established practice.
- **Found by:** pair:api-auth, lens:accuracy-safety

### F148: File uploads and object storage get five bullets with no security handling

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-api-design/SKILL.md:279-284 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'Validate file types server-side', and grep virus|magic|content-disposition: 0.
- **Impact:** Stored XSS or RCE, public buckets.
- **Fix:** Use presigned direct uploads with limits, magic-byte checks, scanning, private storage, Content-Disposition and lifecycle rules.
- **Verifier correction:** The existing bullets include basic controls (size limit, server-side type validation, presigned URLs). The gap is depth, not the absence of any security handling.
- **Found by:** lens:coverage, lens:accuracy-safety

### F149: Real-time (WebSocket/SSE) has no auth, Origin, scaling or reliability guidance

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** api-design:286-290; architect:171-174; implement:198-199 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-architect/SKILL.md)
- **Evidence:** 'Consider connection authentication'. Grep Origin|backpressure|Last-Event-ID: 0.
- **Impact:** Cross-site WebSocket hijacking, and broken fan-out across instances.
- **Fix:** Handshake tickets, an Origin allowlist, pub/sub fan-out, backpressure, resume and draining.
- **Verifier correction:** Multi-instance fan-out and heartbeat/reconnection are covered at a high level in architect:173-174. The remaining gaps are: an Origin allowlist and the handshake auth mechanism (ticket or cookie plus Origin check), backpressure and slow-consumer limits, SSE resume via Last-Event-ID, and graceful draining.
- **Found by:** lens:coverage, lens:accuracy-safety

### F150: api-design duplicates and conflicts with backend-auth on auth endpoints and mechanism

- **Severity:** medium · **Kind:** defect · **Category:** routing
- **Where:** api-design:3,56,93,101,144-150,264-271 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-auth/SKILL.md)
- **Evidence:** Hard-codes /auth/login and /auth/refresh tokens before auth runs. Verb paths break the 'Nouns' rule, and users can be created two ways.
- **Impact:** Token APIs get built where auth would have chosen sessions.
- **Fix:** Delegate the mechanism and endpoints to backend-auth, and record per-endpoint auth only.
- **Found by:** pair:api-auth, lens:cross-consistency, lens:authoring

### F151: Auth contradicts itself on where authorization runs, and the middleware example has no failure path

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-auth/SKILL.md:162,173-183,197-210 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** :162 'Check roles at route/middleware level' vs :183 'middleware only enforces is authenticated'. authenticate() has no 401 path or next(err).
- **Impact:** Inconsistent check placement, and middleware that hangs or crashes on bad tokens.
- **Fix:** State one rule (coarse roles in middleware, ownership in services) and fix the example.
- **Verifier correction:** The '401 path' criticism should be rephrased: 401 belongs in requireAuth by the skill's own design. The example's actual defects are that it does not handle a missing or invalid token (it should continue as anonymous or reject explicitly) and has no error propagation (try/catch with next(err)). The contradiction between 162/200 and 183/219 stands as stated.
- **Found by:** pair:api-auth, lens:authoring, lens:accuracy-safety

### F152: Password policy and hashing guidance is outdated (NIST 800-63B-4, bcrypt 72-byte limit, rehash)

- **Severity:** medium · **Kind:** defect · **Category:** security
- **Where:** auth:126-143; api-design:148 (files: .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'Minimum 8–12', 'min 8 chars', 'library defaults'. No bcrypt truncation note, no check_needs_rehash, and the mismatch exception is unhandled.
- **Impact:** Policy below the current baseline, truncated passwords, 500s on wrong passwords.
- **Fix:** 15 chars minimum single-factor (8 with MFA), accept 64+, OWASP argon2id parameters, rehash on login, dummy hash for unknown users.
- **Found by:** pair:api-auth, lens:accuracy-safety

### F153: OAuth/OIDC client checks, enterprise SSO/SCIM and build-vs-buy IdP guidance missing

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-auth/SKILL.md:60-64,157-183,265-269 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** Only 'authorization-code flow with PKCE'. Grep nonce|state|redirect|SAML|SCIM|Auth0|Keycloak: 0.
- **Impact:** Login CSRF, account takeover by linking unverified email, no SSO.
- **Fix:** Add an RFC 9700 client checklist, link identities by iss+sub, SSO/SCIM, ReBAC/policy engines, and a build-vs-buy tree.
- **Found by:** pair:api-auth, lens:accuracy-safety, lens:coverage

### F155: backend-auth has no verification step or negative-test exit criteria

- **Severity:** medium · **Kind:** gap · **Category:** testing-ci
- **Where:** backend-auth/SKILL.md:185-225,283-293 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** Grep test|backend-test: only :249.
- **Impact:** Auth changes are declared done without bypass tests.
- **Fix:** Require diagnostics plus a backend-test matrix: expired, forged and alg:none tokens, cross-tenant access, CSRF, lockout, refresh reuse.
- **Found by:** pair:api-auth

### F157: api-design discovery has no concrete targets and may miss or overwrite an existing spec

- **Severity:** medium · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-api-design/SKILL.md:61-65 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'MANDATORY' step that only says 'inspect the real codebase'.
- **Impact:** Spec divergence or overwrite.
- **Fix:** Glob openapi, proto and graphql files plus routes, reuse what exists, present a diff, and check staleness.
- **Verifier correction:** The guidance is not entirely target-free. tool-rules.md:7 and :9 give generic glob and grep targets ('routes, models...', 'locate endpoints'), and Step 0 at :38-46 loads the api-patterns.md endpoint inventory and conventions. The staleness check the finding asks for is already handled through context-loading.md and the 'suggest running backend-scan' line at :46. The overwrite risk is speculative, because the skill never names a spec file path to write. The divergence risk and the lack of any rule to reuse an existing spec are real, so medium is reasonable.
- **Found by:** pair:api-auth

### F158: backend-auth activates for reviews but has only a design workflow

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-auth/SKILL.md:14,25-27,283-293 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** 'Reviewing or hardening' is a trigger, yet the principal question still blocks and the output is a design doc.
- **Impact:** A review produces a greenfield design.
- **Fix:** Add a review mode: infer principals from code and run an evidence checklist in doctor's format.
- **Found by:** lens:scenarios-b

### F140: Tables that auth needs (refresh tokens, resets, MFA, lockout) never reach db-design

- **Severity:** low (was medium) · **Kind:** gap · **Category:** consistency
- **Where:** auth:108-116,145-155,187-189; orchestrator:61-72 (files: .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** db-design (step 2) runs before auth (step 4), and the only loop-back is to api-design.
- **Impact:** Implement invents schemas or skips revocation.
- **Fix:** Add an auth→db-design loop-back, and have auth output its persistence needs.
- **Verifier correction:** Note that orchestrator:76 and :144 already loop back to db-design when implementation finds missing schema. What remains is minor: auth should list its persistence needs explicitly, and the auth step could loop back to db-design directly. Severity is low.
- **Found by:** lens:scenarios-a, pair:api-auth

### F154: backend-auth discovery and examples are Node/TS-only despite a multi-language suite

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-auth/SKILL.md:41-42,83-94,131-137,173-210 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** The grep targets are bcrypt/jwt/passport/session, with no Spring Security, FastAPI Depends or golang-jwt.
- **Impact:** Existing auth goes undetected on Go, Java and Python projects.
- **Fix:** Add a per-stack frameworks reference with discovery patterns and vetted libraries.
- **Verifier correction:** The snippet at :131-137, which the finding cites as Node/TS evidence, is actually Python (argon2-cffi PasswordHasher), so the examples are not Node/TS-only. The discovery greps at :42 (bcrypt, jwt, session, authorize, permission, role) are mostly language-agnostic: they match golang-jwt, x/crypto/bcrypt, PyJWT/python-jose, Spring's authorizeHttpRequests and sessionManagement, and Spring's oauth2...jwt package. Only 'passport' is Node-specific, and :41 also globs for auth middleware, user models and protected routes in any language. So the claim that existing auth goes undetected on Go, Java and Python projects is overstated. What is really missing is per-stack library and framework guidance (Spring Security annotations, FastAPI Depends, case-insensitive matching). Severity is low.
- **Found by:** pair:api-auth

### F156: api-design triggers collide with the orchestrator and implement, and miss contract keywords

- **Severity:** low (was medium) · **Kind:** defect · **Category:** routing
- **Where:** api-design:3,10-14; orchestrator:10; implement:14 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** 'create endpoints' and 'Need to add new API routes' overlap. There is no OpenAPI/Swagger/proto trigger.
- **Impact:** Design or implementation gets skipped unpredictably.
- **Fix:** Use a contract-only description with distinctive keywords and not-for clauses.
- **Verifier correction:** Two parts of the finding are wrong. First, the contract keywords are not missing: the api-design description at :3 already contains 'Supports REST, GraphQL, and gRPC. Creates OpenAPI/Swagger specifications'; only 'proto' is absent. Second, the orchestrator collision is by design. Orchestrator:10 ('create API') is in the body, its description is only 'Route backend requests...', and its routing table at :35 sends API design to backend-api-design. The overlap with implement is also mitigated: the orchestrator's Quick Add Endpoint workflow (:87-98) sequences api-design before implement, and backend-implement:26 and :352 say to run backend-api-design first when no design exists. So the claim that design or implementation gets skipped unpredictably is overstated. Severity is low.
- **Found by:** pair:api-auth

### F258: Error model ignores RFC 9457 and omits the correlation ID that ops requires

- **Severity:** low · **Kind:** enhancement · **Category:** consistency
- **Where:** api-design:160-173,318-333; ops:77 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** `{error:{code,message,details}}` while ops says to return correlation_id in errors.
- **Impact:** Inconsistent error contracts.
- **Fix:** Add an RFC 9457 option, a request_id field, WWW-Authenticate and Retry-After.
- **Verifier correction:** The inconsistency is smaller than claimed. The ops middleware examples at backend-ops:283-284 (Node, res.set('x-correlation-id', ...)) and :336 (Go, X-Correlation-ID header) return the ID as a response header on every response, error responses included, so the ops requirement is met by the header. What remains is a polish enhancement: an optional RFC 9457 body format, an optional request_id body field, and Retry-After on 429 and WWW-Authenticate on 401. Severity is low.
- **Found by:** pair:api-auth, lens:cross-consistency

### F259: Auth description misses common auth terms and uses broad ones

- **Severity:** low · **Kind:** enhancement · **Category:** routing
- **Where:** backend-auth/SKILL.md:3 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** No MFA/passkey/SSO/password reset/CSRF terms. 'session' and 'roles' are generic.
- **Impact:** Under- and over-triggering.
- **Fix:** Add specific terms and qualify the generic ones.
- **Verifier correction:** The claim that MFA is missing is wrong. The description at :3 says 'Owns session/token/OAuth flows, JWT design, password handling, MFA, RBAC/ABAC'. The missing terms are passkey/WebAuthn, SSO/SAML, password reset, CSRF, API keys and 2FA. Severity is low.
- **Found by:** pair:api-auth

### F260: api-design has duplicated templates and repeats its own prerequisite questions

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** api-design:21-23 vs 50-56; 98-107 vs 300-316; 160-173 vs 318-333 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** Templates appear twice, and the user is asked the same questions twice.
- **Impact:** Wasted tokens and duplicate prompts.
- **Fix:** Merge the questions and move templates to references/.
- **Found by:** pair:api-auth

### F261: backend-auth is mostly reference text with no numbered workflow and no tool-rules reference

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-auth/SKILL.md:44-282 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** About 240 of 293 lines are reference material, cookie flags appear 3 times, and grep tool-rules returns 0.
- **Impact:** Token cost and no execution order.
- **Fix:** Use a numbered workflow with references/ files.
- **Verifier correction:** Narrow the finding. Drop the token-cost and cookie-repetition arguments. The real gap is that this is the only skill with no tool-rules.md reference, and it has no explicit agent workflow section. Such a section would cover requirements questions, codebase discovery, design proposal, confirmation and handoff to backend-implement, matching backend-api-design's Step 0 to N structure. The repo has no references/ subdirectory convention (a search for 'references' found no directories), so the recommendation to split into references/ files is a new convention, not alignment with the suite.
- **Found by:** pair:api-auth

### F262: Auth security headers are legacy-only and miss Cache-Control: no-store

- **Severity:** low · **Kind:** gap · **Category:** security
- **Where:** backend-auth/SKILL.md:236-239 (files: .agents/skills/backend-auth/SKILL.md)
- **Evidence:** HSTS, nosniff and XFO only. Grep no-store|frame-ancestors: 0.
- **Impact:** Token responses can be cached.
- **Fix:** Add no-store on auth endpoints, CSP frame-ancestors and Referrer-Policy.
- **Found by:** lens:accuracy-safety

## backend-implement & backend-refactor

### F040: No skill owns bug fixing or debugging; refactor redirects to implement, which has no bug workflow

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** refactor:17,299; implement:3,8-15,216-270; test:119-125,198-204 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-test/SKILL.md)
- **Evidence:** refactor :17 'fixing a bug ... redirect to backend-implement'. Implement has no bug triggers or workflow, and test :203 'Fix code bugs' conflicts with the orchestrator loop.
- **Impact:** 'Fix this 500' has no reproduce → failing test → root cause → fix loop.
- **Fix:** Add a bug-fix workflow or a backend-debug skill (reproduce, failing test, bisect/logs, minimal fix, regression test, issues.md) plus triggers and a routing row.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:coverage, lens:authoring

### F041: Post-generation checklist greps pass without scanning, mis-match code, and the exit-0 rule can't be met

- **Severity:** high · **Kind:** defect · **Category:** correctness
- **Where:** backend-implement/SKILL.md:61-98,144,161 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Checks 1 and 5 grep directories without -r and with 2>/dev/null, so they always 'pass'. `res\.status\(5\)` never matches 500. `%s` flags safe psycopg code. Paths hard-code src/ while the FastAPI layout is app/ and Go is internal/. Gin's uppercase methods are missed. grep exits 1 on no match, yet :61 requires exit 0.
- **Impact:** Layering and injection violations pass, safe code gets 'fixed', and Go and Python checks verify nothing.
- **Fix:** Use grep -rnE with word boundaries and per-stack patterns, take paths from project-overview, judge by match count, report a missing path as not run, and prefer semgrep/import-linter.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:authoring, lens:accuracy-safety, lens:scenarios-a, lens:scenarios-b

### F045: Refactor reverts to 'last known-good commit' and deletes files with no clean-tree, branch or commit policy

- **Severity:** high · **Kind:** defect · **Category:** agent-safety
- **Where:** refactor:66-68,133,137,159-166,182,241,267; tool-rules.md:53,59 (files: .agents/skills/backend-refactor/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** :133 'revert the last change immediately'. :164 'Revert to the last known-good commit'. :267 'delete the old file' in autonomous mode. There is no git status or branch step, and tool-rules forbids deleting user code.
- **Impact:** reset --hard or checkout . destroys uncommitted user work and earlier increments.
- **Fix:** Require a clean tree or a dedicated branch, commit each green increment, revert only the agent's own patch, propose deletions, and forbid hard resets without confirmation.
- **Verifier correction:** Drop or soften the deletion argument: deletion during a move or extract (:267, :182, :241) is part of the refactor itself and does not clearly conflict with tool-rules:59, which is about rollback. The real defect is the undefined revert (:133, :164) with no clean-tree, branch or commit-per-increment policy, plus Step 8 redefining rollback despite tool-rules:53/:59. Severity high, because uncommitted user work can be lost.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:accuracy-safety, lens:scenarios-b

### C007: Implement's post-generation checklist is POSIX-only, despite the suite's cross-platform promise

- **Severity:** medium · **Kind:** defect · **Category:** portability
- **Where:** backend-implement/SKILL.md:61-96; context-loading.md:5,146-157; backend-refactor/SKILL.md:292 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/_shared/context-loading.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** All seven shell checks in implement's checklist are bash/grep pipelines with `2>/dev/null`, for example line 64 `grep -nE "if|switch|for|while" src/controllers/ src/handlers/ 2>/dev/null | grep -v "validate\|parse..."`, and lines 69, 74, 85, 90, 96. Line 61 says a run is 'clean' only when every Check command exits 0. context-loading.md:5 and :148 promise 'platform-appropriate' PowerShell forms, and refactor:292 says 'prefer PowerShell on Windows ... Never hard-code Unix-only paths', but implement gives no PowerShell or Select-String equivalent. In Windows PowerShell, `grep` is not a command and `2>/dev/null` redirects to the nonexistent path `C:\dev\null`, which errors. Earlier findings covered only ops (F206), the shared snippets (F274) and doctor's curl smoke test (F191).
- **Impact:** On Windows hosts without Git Bash, which is the platform this repo's own README examples target (`C:\Users\you\...`), no checklist item can run. Under tool-rules a check that fails to run is a tooling failure, so implement can never reach 'clean', or the agent improvises unverified substitutes.
- **Fix:** Express each check as a host-neutral `grep`-tool pattern plus `glob` scope, which the suite already says to prefer, and keep bash/PowerShell only as fallbacks. Or ship a small cross-platform Node script for the checks.
- **Found by:** critic

### C008: FastAPI and Gin handler snippets block the event loop or fall through after a bind error

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-implement/SKILL.md:283-301 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** FastAPI pattern (lines 285-290): `async def create_user(data: UserCreate, svc: UserService = Depends(get_user_service)):` followed by `return svc.create_user(data)`, with no `await` and no `response_model`. Gin pattern (lines 295-299): `if err := c.ShouldBindJSON(&dto); err != nil { /* 400 */ }` with no `return`, after which `h.svc.CreateUser(...)` is called anyway. F159 covers the Express snippets and F048 the TypeScript service snippet; these two are separate.
- **Impact:** If the service is async (the norm with async SQLAlchemy), FastAPI gets an un-awaited coroutine and fails or returns garbage. If it is sync and does DB I/O, it blocks the event loop for every request because it runs inside `async def`. The Gin shape leads agents to write `c.JSON(400, ...)` without `return`, so invalid payloads still reach the service and the handler writes two responses. These are labelled the canonical 'Minimal' patterns the agent copies.
- **Fix:** FastAPI: `return await svc.create_user(data)` with an async service, or a plain `def` endpoint with a sync service, plus `response_model=UserOut`. Gin: `if err := c.ShouldBindJSON(&dto); err != nil { c.JSON(http.StatusBadRequest, ...); return }`, and show the error-mapping branch with `return` as well.
- **Found by:** critic

### C011: No dependency license-compliance check anywhere in the suite

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-implement/SKILL.md:182,207; backend-doctor/SKILL.md:114-132,215-220 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** implement:182 has the agent add 'framework, ORM/driver, validation, testing, linting, and DI/container libraries', and the summary lists 'Dependencies added' (line 207). Doctor's dependency section (114-132, 215-220) checks only vulnerabilities, unused packages and pinning. A case-insensitive search for 'licen' across `.agents/` returns zero matches. There is no step to check copyleft or unknown licenses (for example with `license-checker`, `pip-licenses` or `go-licenses`). F169 and F200 cover supply-chain security and SBOM/signing, not license policy.
- **Impact:** The agent can bring AGPL/GPL or unlicensed packages into a proprietary SaaS backend, and doctor's 'Dependencies: A' grade would never flag it. For a company shipping the generated code, that is a legal and compliance exposure.
- **Fix:** Add a license gate to implement (check a new dependency's license against an allow-list or ask first) and a license audit to doctor and to the deploy CI template, using per-stack commands, with unknown or copyleft licenses reported as High.
- **Found by:** critic

### F039: backend-implement and backend-refactor both trigger on refactor/split, with conflicting workflows

- **Severity:** medium (was high) · **Kind:** defect · **Category:** routing
- **Where:** implement:3,15,242-251,262-270,355,359; refactor:3,17; orchestrator:36,43 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** implement :3 'add, split, or refactor' and has its own split workflow with no baseline or characterization step. refactor :17 forbids mixing refactors with features, and grep backend-refactor in implement returns 0.
- **Impact:** 'Split this UserService' can load implement and skip the behavior lock.
- **Fix:** Remove split/refactor from implement, replace its split workflows with a handoff, and add precedence to the orchestrator.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F043: backend-implement writes and suggests applying migrations, bypassing backend-migrate and any gate

- **Severity:** medium (was high) · **Kind:** defect · **Category:** agent-safety
- **Where:** backend-implement/SKILL.md:193,208,231-240 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** :235 'Add the migration that matches the database decision'. :208 'Next steps: review, migrate, run'. Grep backend-migrate: 0.
- **Impact:** A locking or breaking ALTER may be applied to the configured DB.
- **Fix:** Hand migrations to backend-migrate, never apply outside a local disposable DB without confirmation, and list apply/reset/seed as pause points.
- **Verifier correction:** Implement does not instruct the agent to apply migrations: :208 only lists 'review, migrate, run' as next steps for the user. The defect is that implement's add-column workflow (:231-240) writes migration files itself, with no handoff to backend-migrate's zero-downtime checks. That can produce locking or breaking DDL that ships later. Severity medium.
- **Found by:** pair:impl-refactor

### F044: Refactor baseline hides failures (tee), writes into the repo, and its output hash can never match

- **Severity:** medium (was high) · **Kind:** defect · **Category:** correctness
- **Where:** backend-refactor/SKILL.md:70,78-89,153,279,292 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** `npm test 2>&1 | tee baseline-output.txt` returns tee's exit 0. 'Record the test output hash'. 'identical output' is the exit condition. On resume a hash mismatch means re-baseline. Durations and seeds vary, and characterization tests add output.
- **Impact:** A red baseline looks green, the exit condition is unreachable, resume re-baselines on half-refactored code, and the stray file may be committed.
- **Fix:** Use pipefail/$LASTEXITCODE, compare per-test pass/fail from JUnit/JSON allowing added tests, store artifacts under .checkpoints, and verify against the original baseline on resume.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:authoring, lens:accuracy-safety, lens:scenarios-b

### F047: Refactor size and strangler rules can't be met for atomic or large in-process changes

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** backend-refactor/SKILL.md:126-147,166,265-266,290 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** :137 '>~5 files, break it down'. :266 lsp_rename touches every caller. :290 '>20 files: Use the strangler-fig pattern' (routing or flags), but :166 says 'Never ship a partially-refactored state'. A javax→jakarta bump can't be split.
- **Impact:** The agent either loops on splitting the change, adds needless flags, or breaks the rules.
- **Fix:** Exempt tool-driven mechanical changes. Use a facade for in-process splits, keep strangler fig for service replacement, and define 'partial' as 'not green'.
- **Verifier correction:** Medium, not high. The contradiction is softened by the approximate threshold and by the alias approach at :196. What should change: :290 should point in-process renames and moves to the alias/facade approach rather than strangler fig, :166 should say 'partial' means 'not green', and mechanical or atomic changes (tool-driven renames, framework namespace bumps) need an exemption.
- **Found by:** pair:impl-refactor, lens:scenarios-b

### F048: Canonical implement snippets persist the raw DTO (plaintext password), race on uniqueness and leak fields

- **Severity:** medium (was high) · **Kind:** defect · **Category:** security
- **Where:** backend-implement/SKILL.md:274-310 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** `findByEmail` → throw → `repo.create(dto)` where the DTO has `password`. FastAPI has no response_model and returns an un-awaited sync call from async def. Gin's ShouldBindJSON has no return on error.
- **Impact:** Plaintext passwords get stored, duplicates race, password_hash is serialized, and execution continues on bad input.
- **Fix:** Hash the password, map explicit fields, rely on the unique constraint, add response_model/Annotated, and return after the 400.
- **Verifier correction:** Keep the confirmed issues: missing await or blocking call and no response_model in FastAPI, no return after the 400 in Gin, a check-then-insert race with no mapping of the unique violation, and the entity returned without explicit field mapping. Downgrade 'persists plaintext password' to a risk of copying the snippet, since the DTO's fields are not shown and hashing is required elsewhere. Severity medium.
- **Found by:** pair:impl-refactor, lens:accuracy-safety

### F159: Express async snippets in implement, auth and deploy never forward rejections

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** implement:276-280; auth:203-209; deploy:212-219 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Async handlers have no try/catch or next(err), and readiness uses Promise.all with no timeout.
- **Impact:** On Express 4, requests hang or the process crashes on bad tokens or a DB outage.
- **Fix:** Wrap handlers or note Express 5, map auth errors to 401, and use allSettled with timeouts.
- **Found by:** lens:accuracy-safety, pair:impl-refactor, pair:api-auth, pair:ops-deploy

### F160: Characterization-test ownership contradicts itself across refactor and test

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** refactor:24,38,84-88,181,283; test:34,127-133 (files: .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-test/SKILL.md)
- **Evidence:** refactor writes them, yet 'New test authoring (use backend-test)' and 'Stop and delegate'. test :132 'Replace characterization tests ... during refactoring'.
- **Impact:** Conflicting instructions, and the safety net is removed mid-refactor.
- **Fix:** Use one rule, keep the tests until verification, and add golden-master techniques.
- **Verifier correction:** Refactor's own Out of Scope (line 24, 'from scratch') and Edge Case (283, no tests at all) can be reconciled with Step 1.3 (an uncovered path inside an existing suite). The real defects are two. First, test:132 tells the agent to replace characterization tests during refactoring. Second, the baseline hash (line 83) is taken before tests are added (lines 84-89, 181), so the 'identical output' check (lines 70, 153) cannot pass. Fix: re-baseline after the characterization tests are added, keep them until Step 7 passes, and change test:132 to say 'after the refactor is verified'.
- **Found by:** pair:impl-refactor, pair:test-doctor, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F161: Refactor's 'test suite exists' gate passes on pyproject/go.mod and misses Spring *Tests.java

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-refactor/SKILL.md:35-38 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** The glob includes pyproject.toml and go.mod but not *Tests.java or *.spec.ts.
- **Impact:** Refactors proceed with zero tests, or stop wrongly.
- **Fix:** Detect actual test files, and require the runner to report more than 0 tests.
- **Found by:** pair:impl-refactor, lens:authoring, lens:scenarios-b

### F162: Behavior lock omits implicit behavior (transactions, proxies, DI, log/metric names, query count)

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-refactor/SKILL.md:93-99,174-182,281-292 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** Lists signatures, HTTP, errors and events only. Grep @Transactional|component scan|N+1: none.
- **Impact:** Tests pass while production behavior changes.
- **Fix:** Add an implicit-contract checklist with integration, DI-boot and query-count checks.
- **Verifier correction:** Narrow the gap. Caller discovery for dynamic/DI wiring is covered (lines 107, 288), and app boot is partly covered by Step 7.5 for API-facing code. What is missing: transaction scope and atomicity preservation when moving 'transaction ownership' (line 178), framework proxy pitfalls (e.g. @Transactional self-invocation after extracting a method), query count and performance regressions (N+1), and log/metric names as observable contracts.
- **Found by:** pair:impl-refactor, lens:scenarios-b

### F163: Strangler-fig guidance ignores flag defaults, parity checks and multi-session tracking

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-refactor/SKILL.md:139-147,231-243 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** 'Add a routing layer or feature flag', with no default-off, shadow compare or record.
- **Impact:** Live traffic goes to new code, and half-migrated systems are left untracked.
- **Fix:** Default-off flags, parity checks, user-controlled flips, and record the migration in decisions.md.
- **Found by:** pair:impl-refactor

### F164: Implement's Core Process skips the generate step and conflicts with mode=auto

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-implement/SKILL.md:37-114,201-214,357 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Steps go context → rules → checklist → tools, with no generate step. It asks 4 confirmations plus 'confirm each layer' and no slug.
- **Impact:** Unclear when to verify or what to skip.
- **Fix:** Reorder to load → choose → implement → verify → report, and add implement-specific pause points.
- **Verifier correction:** 'Skips the generate step' is overstated. The generation and modification workflows exist (lines 116-270), but Core Process never links or sequences them, and the checklist (59) sits before the Step 3 tool rules. The mode=auto, confirmation and slug inconsistency is real: tool-rules.md:49 says the contract wins, but implement neither references it nor defines its own pause points.
- **Found by:** pair:impl-refactor

### F165: Implement doesn't define deliverables or update api-patterns or db-schema memory

- **Severity:** medium · **Kind:** gap · **Category:** docs
- **Where:** implement:201-214,220-240; memory-schema.md:111-112,150-153 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/_shared/memory-schema.md)
- **Evidence:** Only 'Should I save progress to memory?' Endpoint and column workflows end with no memory step.
- **Impact:** Memory drifts after every implementation.
- **Fix:** Add an output summary and mandatory memory appends.
- **Verifier correction:** Greenfield does have a summary (lines 201-208) and a memory offer (214). The gap is in the 'Modifying Existing Code' workflows (216-270), which the skill calls the majority of the work. They have no output summary and no instruction to append the endpoint inventory to api-patterns.md or column changes to db-schema.md. That matters most for direct use and for Quick Add Endpoint, outside the full design pipeline.
- **Found by:** pair:impl-refactor, lens:cross-consistency

### F166: Refactor has no summary template or memory update for structural changes

- **Severity:** medium · **Kind:** gap · **Category:** docs
- **Where:** backend-refactor/SKILL.md:70,149-157,291 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** 'summary reported' with no template, project-overview Module Boundaries never updated, and 'create an issue' is ungated.
- **Impact:** Memory describes the old layout, so visualize draws stale structure.
- **Fix:** Add a summary template, Structure and decisions appends, and approval before external issues.
- **Found by:** pair:impl-refactor, lens:cross-consistency, lens:scenarios-b

### F167: Java claimed but not covered; Django, NestJS and Spring missing across implement, ops and deploy

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** implement:3,124-171,274-310; refactor:3 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** Structures and patterns are Express, FastAPI and Gin only.
- **Impact:** Spring, Django and NestJS users get ill-fitting advice.
- **Fix:** Add per-stack references, or narrow the descriptions.
- **Found by:** pair:impl-refactor, lens:authoring, lens:coverage

### F169: Implement adds dependencies and env config with no supply-chain or secret gate

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-implement/SKILL.md:181-182,208 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Grep install|audit|lockfile|.env: 0.
- **Impact:** Hallucinated packages and committed secrets.
- **Fix:** Verify packages, pin versions, audit, pause on new runtime deps, and write only .env.example.
- **Verifier correction:** The secret-commit risk is already covered by principles.md:48 (mandatory via implement:57), implement:181 ('env templates') and deploy:243 (.env.example). The remaining gap is dependency hygiene when the agent adds packages: verifying the package exists and is the intended one (hallucinated or typosquatted names), pinning and lockfile updates, running an audit right away, and pausing for approval before adding a new runtime dependency.
- **Found by:** pair:impl-refactor

### F170: Refactor in auto mode picks module boundaries for large splits without approval

- **Severity:** medium · **Kind:** enhancement · **Category:** agent-safety
- **Where:** backend-refactor/SKILL.md:63-70,93-99,174-177 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** 'Proceed autonomously', with no decomposition proposal or clustering heuristics.
- **Impact:** Many increments get spent on a structure the team rejects.
- **Fix:** Present a decomposition proposal for approval, add clustering heuristics, and record the rationale.
- **Verifier correction:** The claim of "no clustering heuristics" goes too far. backend-refactor:176 gives a basic cohesion heuristic ("Identify cohesive responsibility groups ... e.g., user CRUD vs. user notifications vs. user analytics"), and backend-implement:244 lists responsibility axes (transport mapping, business workflow, persistence, external calls). Edge cases at :285 (ambiguous scope: ask the user) and :290 (>20 files: use strangler fig) cover some of the risk. The real gap is narrower: there is no step to present the decomposition for approval between Step 2 and Step 5, and no write-back of the changed module boundaries and rationale to project-overview.md or decisions.md. The impact is wasted, reversible effort, not breakage, because every increment is checked against tests.
- **Found by:** lens:scenarios-b

### F168: Implement has no guidance for consumers, gRPC, pagination, outbound clients or config validation

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-implement/SKILL.md:184-199,325 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Grep worker|consumer|paginat|timeout|grpc: only 'outbox pattern'.
- **Impact:** Consumers without idempotency and clients without timeouts.
- **Fix:** Add short workflows in references/.
- **Verifier correction:** 'Consumers without idempotency' and the missing config-validation and pagination guidance are refuted: principles.md:30, 38 and 39 (mandatory per implement:57) cover them, as do ops:176-180, ops:207-211 and api-design:273. What remains: implement has no gRPC or consumer/worker implementation tree to match what api-design and ops advertise, and nothing in the suite requires timeouts or circuit breaking on outbound HTTP clients.
- **Found by:** pair:impl-refactor

### F263: Refactor's mode=auto pause rules contradict its HARD RULE and edge cases

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** backend-refactor/SKILL.md:27,69,182,196-197,241,284 (files: .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** :69 pauses on an API break or pre-existing failures, while :27 and :284 say stop. Deletions don't pause.
- **Impact:** The agent may continue past a contract break.
- **Fix:** Make an API break a hard stop and pause on removals.
- **Verifier correction:** Two parts of the finding are overstated. (1) For the API break, :27 itself says "stop and ask for clarification", which in practice is a pause. The real fix is to state that a contract break moves the work to backend-implement or backend-api-design rather than going ahead after approval. The agent could only continue past a break if the user explicitly approves, not on its own. (2) "Deletions don't pause" is not a real problem. The deletions at :146-147, :182, :196-197 and :241 are version-controlled code removals made only after zero references are confirmed (:155, :199, :243), and removing old code is the point of these patterns. The shared contract pauses for data deletion (tool-rules.md:38), not for code removal under VCS.
- **Found by:** pair:impl-refactor

### F264: Implement and refactor spend tokens on duplicated content

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** implement:110-171,272-342; refactor:17-25,139-147,168-271 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** Restated principles and test matrix, all stacks loaded, and Step 6 duplicates the catalog.
- **Impact:** Context cost and drift.
- **Fix:** Move per-stack and pattern content to references/.
- **Found by:** pair:impl-refactor

### F273: Greenfield flow never initializes git, which checkpoints, rollback and staleness depend on

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** implement:116-214; tool-rules.md:59-60 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Greenfield steps have no git init, .gitignore or module init.
- **Impact:** Rollback and branch isolation fail.
- **Fix:** Add a bootstrap step.
- **Verifier correction:** Two dependencies are overstated. Checkpoints are JSON files in .opencode/everything-backend-memory/.checkpoints/ (tool-rules.md:57) and do not need git. The staleness check falls back gracefully when git is missing (context-loading.md:144: "proceed with the memory files as-is and note that staleness was not verified"). Running git init alone would not make the rollback command in tool-rules.md:59 work for newly generated files, because they stay untracked until a first commit. The most useful parts of the recommendation are a .gitignore covering .env and secrets, and an explicit manifest init. Whether to git init should be the user's choice.
- **Found by:** lens:scenarios-a

## backend-test & backend-doctor

### F054: No security review, threat modeling or OWASP API Top 10 capability

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** doctor:13,150-168 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-auth/SKILL.md)
- **Evidence:** 'is my code secure?' gets 7 greps. Grep OWASP|STRIDE|SSRF|BOLA|mass assign|deserial returns nothing relevant. There are no SAST, history secret-scan or config checks (CORS, /docs, debug).
- **Impact:** Pre-launch reviews miss common vulnerabilities and give false assurance.
- **Fix:** Add a security-review mode or skill: trust-boundary/STRIDE pass, OWASP API Top 10 probes per framework, SAST, gitleaks over history, config checks, findings mapped to OWASP and written to issues.md.
- **Verifier correction:** SAST is present for Python (bandit, doctor:65) and Java (spotbugs, doctor:67/101); only Node/Go SAST is missing. BOLA-style ownership checks exist (doctor:161). The missing pieces are SSRF, mass assignment, deserialization, misconfiguration checks, history secret scanning, threat modeling and an OWASP API Top 10 mapping.
- **Found by:** lens:coverage, lens:scenarios-b

### C009: Doctor's `bandit -r .` scans virtualenvs and reports third-party code as project findings

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-doctor/SKILL.md:65 (command table); severity rules at 163-168 and 191 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Line 65 lists `bandit -r .` for Python. Bandit's default exclude list is `.svn,CVS,.bzr,.hg,.git,__pycache__,.tox,.eggs,*.egg`, which does not include `.venv`, `venv` or `env`. In the common in-project virtualenv layout, the scan therefore walks every installed package under `site-packages`. Doctor then classifies matches with its own rules, for example 'Confirmed injection or secret in committed code: **Critical**' (line 164). Ruff and black in the same row honour .gitignore, but bandit does not.
- **Impact:** Health reports fill with hundreds of B105/B108/B602-style hits from dependencies, some labelled Critical. The Production Readiness and New Feature workflows then STOP on Critical findings that are not in the user's code, and the scan easily exceeds the 30s timeout.
- **Fix:** Use `bandit -r <package-dir>` or `bandit -r . -x ./.venv,./venv,./env,./node_modules,./build`, read `[tool.bandit]` from pyproject when present, and tell doctor to discard any finding whose path is outside the project's source roots.
- **Found by:** critic

### F042: Tests and the app run autonomously with no check that the DB, queues or integrations are isolated

- **Severity:** medium (was high) · **Kind:** gap · **Category:** agent-safety
- **Where:** test:28-34,52,73,202; doctor:54-56,76-91,134-142; implement:267-268,335; refactor:39-41 (files: .agents/skills/backend-test/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** test 'Execute ... immediately'. Tests 'truncate between tests'. doctor starts `npm start`. implement :267 'real database'. EXPLAIN ANALYZE runs writes. Grep testcontainers|DATABASE_URL|staging: 0.
- **Impact:** Truncating suites or startup migrations can hit shared, staging or prod data and fire real emails or payments.
- **Fix:** Resolve the DB, queue and SMTP hosts first and run automatically only on local or ephemeral targets. Prefer Testcontainers, set APP_ENV=test, never ANALYZE writes, and make a non-local target a pause condition.
- **Verifier correction:** Drop the EXPLAIN ANALYZE claim and the 'real database' framing. Narrow the gap to this: there is no pre-run check of the target environment before auto-running the suite (test:30-33) or `npm start` in the doctor smoke test (doctor:136-142), even though test:73 asks for a separate test DB. A target that is not local or ephemeral should be a pause condition.
- **Found by:** pair:impl-refactor, pair:test-doctor, lens:accuracy-safety, lens:scenarios-b

### F051: Doctor never writes findings to issues.md, though workflows depend on it

- **Severity:** medium (was high) · **Kind:** gap · **Category:** consistency
- **Where:** doctor:21,33,46,222-308; orchestrator:83-85,119,133 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** orchestrator: doctor 'Writes: issues.md' and completion requires 'findings logged to issues.md'. Doctor only reads issues.md and has no output path.
- **Impact:** Completion criteria can never be met, and regressions and findings are lost between sessions.
- **Fix:** Add a persist step that appends findings in schema format, de-duplicated, marks issues Resolved or Regressed, masks secrets, and optionally saves the report.
- **Verifier correction:** 'Completion criteria can never be met' is wrong: the orchestrator's own steps tell the agent to log to issues.md. The gap is that direct doctor runs never persist findings or update issue status, which contradicts orchestrator:83/119/133.
- **Found by:** pair:test-doctor, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F052: Doctor and ops evidence rules copy live secret values into reports and memory

- **Severity:** medium (was high) · **Kind:** gap · **Category:** security
- **Where:** doctor:156,180-185,250; ops:346,351-357 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** The secrets grep at :156 combined with 'Relevant output excerpt: 2–10 lines'. Grep redact|mask returns nothing, and there is no rotate instruction.
- **Impact:** Leaked credentials spread into chat, reports and issues.md.
- **Fix:** Always mask values (prefix + length). Fix order is revoke/rotate (with confirmation), then remove, then optionally scrub history. Rate it Critical.
- **Verifier correction:** Severity Critical already exists (doctor:164, :191), and rotation is mentioned as a confirm-first action (doctor:56; principles:48; ops:222). The actual gaps are: no rule to mask secret values in evidence excerpts (doctor:182, ops:354), and no 'revoke/rotate first, removing from code is insufficient, scan history' remediation order in the doctor security decision tree (:198-202).
- **Found by:** pair:test-doctor, lens:accuracy-safety, pair:ops-deploy, lens:scenarios-b

### F053: 'Update invalid tests ... re-run until green' lets the agent weaken or skip failing tests

- **Severity:** medium (was high) · **Kind:** defect · **Category:** agent-safety
- **Where:** backend-test/SKILL.md:30-34,198-204 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** :203-204 'Fix code bugs or update tests that are now invalid / Re-run until green', run in auto mode. No criteria are given, nothing forbids skip/xfail, and the loop has no cap.
- **Impact:** Real regressions, including auth bugs, get erased to reach green.
- **Fix:** Never change an assertion, skip, delete or re-snapshot without a diff and user confirmation. Classify failures with evidence, cap retries, and report tests that were modified.
- **Found by:** pair:test-doctor, lens:accuracy-safety

### F055: No performance investigation, profiling, load testing or before/after measurement

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** doctor:13,159,204-208,298; test:36-66 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-test/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Grep load test|k6|locust|profil|pprof|pg_stat_statements|bisect: 0. Doctor's perf tree jumps straight to 'Consider caching'. 'Performance | B' is graded but never measured.
- **Impact:** 'p95 doubled' gets guessed fixes with no release diff, profile or proof.
- **Fix:** Add a perf workflow: mitigate or roll back, gather metrics, diff releases, reproduce with k6/wrk, profile per stack, EXPLAIN ANALYZE, fix, then re-measure p50/p95/p99.
- **Verifier correction:** The doctor perf tree starts with DB query issues, not caching. Query-plan guidance exists in migrate:240-247, and p50/p95/p99 metrics are in ops:89. The missing piece is a perf investigation workflow: baseline metrics, release diff, load reproduction, profiling, and re-measurement.
- **Found by:** pair:test-doctor, lens:coverage, lens:scenarios-b

### F172: Doctor marks issues.md both REQUIRED and optional; scan may never create it

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** doctor:21-22,26-35,45-46; scan:106 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** :21 REQUIRED vs :46 optional. Scan creates it only 'if found'. Load lists conflict.
- **Impact:** Scan loops or the agent stops on clean projects.
- **Fix:** Make it optional, have scan always create it, and keep one load list.
- **Found by:** pair:test-doctor, lens:scenarios-b, lens:cross-consistency

### F174: No coverage commands, though before/after coverage is a required output

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-test/SKILL.md:135-148,222-227,244 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** Grep --cov|coverprofile|jacoco: 0. 'Track trends, not absolute numbers' vs 'target >80%'.
- **Impact:** Coverage numbers get invented.
- **Fix:** Add per-stack coverage commands and a defined metric stored in test-strategy.md.
- **Verifier correction:** Drop the trends-vs-80% contradiction claim. Add as evidence that test-strategy.md, where a coverage target would be stored, is never created by any skill, even though orchestrator workflows depend on a 'project target'.
- **Found by:** pair:test-doctor

### F176: No guidance on testing authentication and authorization

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-test/SKILL.md:54-59,139-148 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** Grep auth in backend-test: 0.
- **Impact:** 401/403/IDOR regressions go undetected.
- **Fix:** Add a 401/403/ownership/tenant matrix, token cases and factories.
- **Found by:** pair:test-doctor, lens:coverage

### F177: No guidance on testing async consumers, idempotency or concurrency

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** test:51,183-186; principles.md:27,36,39 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** Only 'queues with test brokers'.
- **Impact:** Behaviors the principles require are never verified.
- **Fix:** Add duplicate delivery, retry→DLQ, key replay, concurrent invariants and rollback tests.
- **Found by:** pair:test-doctor

### F178: Contract testing ignores the OpenAPI spec and consumer-driven contracts

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-test/SKILL.md:54-59,97-101 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** Grep openapi|pact|schemathesis: 0.
- **Impact:** Spec and code drift silently.
- **Fix:** Add spec-conformance and fuzz tests, Pact, and secret scrubbing for recordings.
- **Found by:** pair:test-doctor, lens:coverage

### F179: No ephemeral test infrastructure, property-based, fuzz or mutation testing

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-test/SKILL.md:26,47-52,68-75 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** 'use a real database' with no way to provision one. Grep testcontainers|hypothesis|stryker: 0. db-schema.md is not loaded.
- **Impact:** Mocked or flaky integration tests.
- **Fix:** Testcontainers or a compose test profile, rollback/truncate per framework, per-worker isolation, property/fuzz/mutation testing.
- **Verifier correction:** Narrow the finding to the missing provisioning and isolation guidance: Testcontainers or a compose test profile, CI service containers, per-worker databases or schemas, and per-framework rollback or truncate. Property-based, fuzz and mutation testing should be a separate low-priority enhancement. Drop the claim that 'db-schema.md is not loaded'. backend-test:26 defers to the shared list, and _shared/context-loading.md:176 says to load priority 3 (db-schema.md) whenever the task touches data access, which integration tests do.
- **Found by:** lens:coverage, pair:test-doctor

### F181: Doctor audit commands: nonexistent Maven goal, unconfigured plugins, no Gradle, deprecated `safety check`

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-doctor/SKILL.md:62-68,101,120,122 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** `./mvnw dependency:check` (no such goal), spotbugs without the plugin, `safety check` (needs login in 3.x), and no Gradle row.
- **Impact:** Audits fail and get logged as tooling findings.
- **Fix:** Use dependency-check-maven:check or gradle dependencyCheckAnalyze, pip-audit or osv-scanner, and run plugins only if configured.
- **Verifier correction:** The `safety check` claim is slightly off. In Safety 3.x, `safety check` is deprecated (it prints a deprecation notice and was announced as unsupported after mid-2024), and it is the replacement `safety scan` that requires login. It is still outdated to recommend it. Line 120 lists it only as an alternative to `pip-audit --desc`, so its impact is small. The Maven and Gradle problems carry the medium severity.
- **Found by:** pair:test-doctor, lens:authoring, lens:accuracy-safety, lens:scenarios-b

### F182: Audit severity depends on prod vs dev dependencies, but the commands don't separate them

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-doctor/SKILL.md:64,116-132 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** 'production dependency: Critical' is checked with `npm audit` (devDeps included), and yarn and bun are missing.
- **Impact:** Inflated Critical findings trigger STOP gates.
- **Fix:** Use --omit=dev/--prod and detect the package manager from the lockfile.
- **Found by:** pair:test-doctor

### F183: Doctor's SQL-injection grep flags safe parameterized code and misses real sinks

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-doctor/SKILL.md:155 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Treats `%s` as injection (that's the psycopg placeholder) and misses f-strings, Sprintf and $queryRawUnsafe.
- **Impact:** Noise, plus missed Critical findings.
- **Fix:** Use per-stack sink lists and semgrep/bandit for confirmation.
- **Verifier correction:** The false-positive claim is overstated. Line 155 says to grep and then 'Use `read` to confirm', so psycopg `%s` placeholders are only candidates, not reported as injection. A Sprintf call that uses %s is caught. The real defect is missed sinks (f-strings, .format, %v, raw-unsafe APIs, multi-line queries), not noise. Recommend per-stack sink lists and confirmation with semgrep, bandit or gosec.
- **Found by:** pair:test-doctor, lens:accuracy-safety

### F184: Weak secret detection: no scanner, no git-history check, no tracked .env check

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-doctor/SKILL.md:65,150-168 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Keyword grep plus '.env in .gitignore'. Grep gitleaks|trufflehog: 0.
- **Impact:** Committed or historical secrets are missed.
- **Fix:** Run git ls-files for .env*, gitleaks/trufflehog with --redact, and stack SAST.
- **Found by:** pair:test-doctor, lens:accuracy-safety

### F185: Doctor's 'Static Review' references a checklist that doesn't exist

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-doctor/SKILL.md:74,163-174,302-307 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** 'Use the following checklist', followed only by a pointer. The report grades Layering/SOLID with no method.
- **Impact:** Grades and classifications are invented.
- **Fix:** Add the checklist mapped to report rows, or remove the reference.
- **Found by:** pair:test-doctor, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F186: Doctor's letter grades have no rubric, and the sample contradicts its own data

- **Severity:** medium · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-doctor/SKILL.md:229,237-242,293-300 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** 'Dependencies | A | All up to date' sits beside a lodash vulnerability, and Performance and Testing are unmeasured.
- **Impact:** Arbitrary scores and unmeasured claims.
- **Fix:** Define a deterministic rubric and use 'Not assessed' when a check didn't run.
- **Found by:** pair:test-doctor, lens:authoring

### F187: Severity rubrics conflict within doctor and between doctor and ops

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** doctor:91,148,166,191-194,264-291; ops:344-349 (files: .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Auth bypass is Critical by rule but the example files it High. Missing validation is High by rule but the example says Low. ops 'same scale' rates a missing /health High where doctor says Medium.
- **Impact:** STOP and pause gates misfire.
- **Fix:** Put one rubric in _shared, reference it, and fix the examples.
- **Found by:** pair:test-doctor, pair:ops-deploy, lens:cross-consistency, lens:authoring

### F188: Doctor doesn't separate environment failures from code defects

- **Severity:** medium · **Kind:** gap · **Category:** correctness
- **Where:** backend-doctor/SKILL.md:86-91,144-148 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Failures are High/Critical with no triage for missing DB or env.
- **Impact:** False Critical findings in fresh clones.
- **Fix:** Classify failures as env, flaky or code, and report env issues with setup instructions.
- **Found by:** pair:test-doctor

### F189: Doctor omits build, coverage and migration-status checks its rules and report depend on

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-doctor/SKILL.md:28-33,64-68,91,193,300 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** 'broken build is Critical', but no build step. Grep migrat: only the pause text.
- **Impact:** Unbuildable artifacts and unapplied migrations pass as healthy.
- **Fix:** Add build, coverage and read-only migration-status steps.
- **Verifier correction:** The scope is overstated. Build failures are partly caught already: `go test ./...` and `./mvnw test`/`verify` compile the code, and line 98 runs `tsc --noEmit` for TypeScript. So 'unbuildable artifacts pass as healthy' mainly applies to Node bundling/`npm run build` steps and similar. The real gaps are no explicit build step to back the Critical rule, no coverage step even though the report grades Testing on coverage, and no read-only migration-status check (e.g. `prisma migrate status`, `alembic current`), which needs a DB connection and so should be optional.
- **Found by:** pair:test-doctor

### F190: Doctor's scope (diagnose vs fix) is unclear; auto mode implies applying non-risky fixes

- **Severity:** medium · **Kind:** defect · **Category:** agent-safety
- **Where:** backend-doctor/SKILL.md:54-56,196-220 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** 'Only pause ... risky fix' plus 'Update vulnerable packages ... Pin versions', and no handoffs.
- **Impact:** Unrequested upgrades and edits right before launch.
- **Fix:** Read-only by default, with a 'Next skill' field on each finding and fixes via the owning skill after approval.
- **Found by:** pair:test-doctor, lens:scenarios-b

### F191: Doctor's smoke test isn't portable or robust (port, readiness, process tree, Windows curl)

- **Severity:** medium · **Kind:** gap · **Category:** portability
- **Where:** backend-doctor/SKILL.md:136-144 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** `curl -fsS` and kill PID, with no port source or readiness poll. curl is an alias in PS 5.1.
- **Impact:** Orphaned servers and false 'fails to start' findings.
- **Fix:** Specify the port source, a bounded poll, a process-tree kill and the PowerShell form.
- **Verifier correction:** Line 136 does say to 'wait for it to listen', so a readiness wait is required, just not specified (no bounded poll). The PowerShell `curl` alias point is narrower than stated: the step says to use `bash`, and Windows 10+ ships curl.exe. It only matters where the shell resolves to PowerShell 5.1. The suite does acknowledge PowerShell elsewhere (_shared/context-loading.md:146-157, backend-refactor/SKILL.md:292), and doctor line 17 claims the checks 'work cross-platform', so this still counts against that claim. The fix is to specify the port source, a bounded readiness poll, killing the whole process tree, and a PowerShell form (Invoke-WebRequest or curl.exe).
- **Found by:** pair:test-doctor

### F192: Python tooling assumes an active env; pip-audit may audit the wrong packages; the FastAPI start command is wrong

- **Severity:** medium · **Kind:** gap · **Category:** portability
- **Where:** backend-doctor/SKILL.md:65,82,120,139 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Bare pytest/pip-audit and `python -m <module>`, with no poetry/uv run.
- **Impact:** False clean audits and smoke tests that never start.
- **Fix:** Detect the env manager, use pip-audit -r or lockfile mode, and uvicorn for FastAPI.
- **Verifier correction:** Line 139's `python -m <module>` is a generic placeholder, not a FastAPI-specific command. It is incomplete (FastAPI/ASGI apps usually start with `uvicorn module:app` or `fastapi run`), not 'wrong'. A bare `pytest` with no venv usually fails loudly, which _shared/tool-rules.md treats as a tooling finding, not a false clean result. The serious part is pip-audit auditing the wrong environment. The fix is to detect the env manager (poetry run / uv run / pipenv run / .venv), use `pip-audit -r requirements.txt` or a project/lockfile mode, and add an ASGI start example.
- **Found by:** lens:scenarios-b

### F269: Doctor repeats severity text and inlines an 85-line report template

- **Severity:** medium (was low) · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** backend-doctor/SKILL.md:24-46,91-194,222-308 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Severity guidance appears in every step, and context is listed 3 times.
- **Impact:** Token cost, and the repetitions have already drifted.
- **Fix:** One table and one list, with the example moved to references/.
- **Verifier correction:** Restate the impact with the concrete drift: issues.md is REQUIRED at :21 but optional at :46 (scan only creates it if issues are found), context is loaded unconditionally at :31-32 but conditionally at :44-45, severities disagree between :91/:166 and :192 and the template at :286-291, and :172 points to a 'following checklist' that does not exist. Recommended fix: keep one context list (deferring to _shared/context-loading.md:185 for issues.md as supplementary or optional) and one severity table. Moving the template to references/ is optional and low value.
- **Found by:** pair:test-doctor

### F173: A REQUIRED test runner blocks the 'no tests' bootstrap and the refactor handoff

- **Severity:** low (was medium) · **Kind:** defect · **Category:** correctness
- **Where:** test:20-22,188-213; refactor:283 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** 'If missing: stop', yet the same skill has 'No tests exist' and 'Choosing a framework' trees.
- **Impact:** Untested apps stall at the prerequisite.
- **Fix:** Downgrade the check, propose a default runner, and confirm the install once.
- **Verifier correction:** Not a blocking stall: test:22 already asks the user to confirm a runner. The fix is cosmetic: point the prerequisite at the 'Choosing a framework' tree when no runner exists.
- **Found by:** pair:test-doctor, lens:cross-consistency, lens:scenarios-a

### F175: backend-test claims multi-stack support but covers only Node, Python and Go (npm hard-coded)

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-test/SKILL.md:21,154-174,206-213 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** No pom or gradle detection or commands, and no pnpm/yarn/bun.
- **Impact:** Wrong or missing commands.
- **Fix:** Add a per-stack table and detect the package manager from the lockfile.
- **Verifier correction:** Java/Maven commands exist in doctor:67/84, and scan detects pnpm/yarn and Gradle. The real gap is limited to backend-test's own detection and command list (no pom/gradle, no Gradle command anywhere, no lockfile-based package-manager choice).
- **Found by:** pair:test-doctor

### F180: backend-test fixes production code itself, overlapping implement and the orchestrator

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** test:119-125,198-204; orchestrator:80,102 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** '2. Fix the code', and the orchestrator routes fixes to implement.
- **Impact:** Fixes skip implement's checklist.
- **Fix:** Write the failing test and hand the fix to implement, and add a Handoffs section.
- **Verifier correction:** Downgrade to low. The conflict only arises inside orchestrator workflows, where backend-test should hand implementation fixes to backend-implement; used on its own, a test-then-fix regression flow is legitimate. No skill in the suite has a 'Handoffs' section (grep for handoff returned nothing), so that part of the recommendation is a new convention, not a fix for a missing one.
- **Found by:** pair:test-doctor

### F265: Regression rule says a bug fix may 'end with a failing test'

- **Severity:** low · **Kind:** defect · **Category:** authoring-quality
- **Where:** backend-test/SKILL.md:121-125 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** 'start or end with a failing test'.
- **Impact:** Ambiguous wording.
- **Fix:** Reword to: a test fails before the fix and passes after.
- **Found by:** pair:test-doctor

### F266: backend-test has no exit criteria; the output lists 'Run full suite' as still pending

- **Severity:** low · **Kind:** gap · **Category:** docs
- **Where:** backend-test/SKILL.md:215-220,235-254 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** '- [ ] Run full suite' sits in Next Steps.
- **Impact:** Done is declared without a green run.
- **Fix:** Add exit criteria (exit code, new tests, pre-existing failures, coverage).
- **Verifier correction:** Exit criteria are not entirely missing. Line 220 says 'Run the full suite before finishing', line 204 says 'Re-run until green', and line 196 says 'Run the suite and iterate'. The real defect is that the template contradicts line 220 by leaving the full run as an unchecked next step, and it has no results field or guidance on pre-existing failures. Low severity.
- **Found by:** pair:test-doctor

### F267: Java framework recommendation is still JUnit 5

- **Severity:** low · **Kind:** enhancement · **Category:** correctness
- **Where:** backend-test/SKILL.md:213 (files: .agents/skills/backend-test/SKILL.md)
- **Evidence:** 'JUnit 5 with AssertJ', while JUnit 6 has been GA since 2025.
- **Impact:** Greenfield projects start on the previous major.
- **Fix:** Recommend JUnit Jupiter 6 (5 on Java <17).
- **Found by:** pair:test-doctor

## backend-ops & backend-deploy

### F028: No migration step in deploy pipelines and no migrate→deploy handoff

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** backend-deploy/SKILL.md:136-200; backend-migrate/SKILL.md:280 (files: .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-migrate/SKILL.md)
- **Evidence:** Grep 'migrat' in backend-deploy: 0. migrate :280 just says 'Deploy with monitoring'. The CI templates have no migration job, ordering or lock.
- **Impact:** Migrations get skipped or run on every replica at startup, which breaks expand/contract during rolling deploys.
- **Fix:** Run migrations as a single-run pre-deploy job (CI, K8s Job or Helm hook) with a lock, never auto-run contract, and cross-link migrate, implement and test.
- **Found by:** pair:db-migrate, pair:ops-deploy, lens:coverage, lens:scenarios-a

### F058: backend-deploy has no workflow, output paths, validation or exit criteria

- **Severity:** high · **Kind:** gap · **Category:** authoring-quality
- **Where:** backend-deploy/SKILL.md:8-278 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Sections are template catalogues only. It names no output files and no hadolint, actionlint, compose config or dry-run step, yet orchestrator :116 expects a verify step.
- **Impact:** Output varies between runs and nothing is verified before success is claimed.
- **Fix:** Add an execution flow: inventory, choose, generate at explicit paths, validate (lint, build, compose up --wait), record memory, summarize.
- **Verifier correction:** The headings do implicitly name the root-level outputs: 'Dockerfile Template', '.dockerignore Template', 'docker-compose.yml Template' and '.env.example Template', plus docker-compose.override.yml at :134. What is unnamed is the CI file locations (.github/workflows/*.yml, .gitlab-ci.yml) and any K8s or infra paths. The rest is accurate. backend-deploy is the only one of the 14 skills with no process, workflow or execution section (heading list :8-273). It has no validation step (no hadolint, actionlint, 'docker compose config', build or --wait), no exit criteria, no 'existing artifacts' check, and it never writes decisions.md or the deployment.md memory file listed in _shared/context-loading.md:171. orchestrator:116 does assume a real CI run is checked ('If CI/CD health checks fail on a real run → re-run from step 2').
- **Found by:** pair:ops-deploy, lens:authoring

### F060: Kubernetes/Helm advertised but there are no manifests, probes, resources or securityContext

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** backend-deploy/SKILL.md:3,13,273-278 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** It triggers on K8s/Helm, but the only content is a 4-bullet 'When to Add Kubernetes'. Grep livenessProbe|startupProbe|preStop|HPA: 0.
- **Impact:** K8s requests produce improvised manifests without probes, limits or hardening.
- **Fix:** Add references/kubernetes.md with Deployment+Service+HPA+PDB, probes, preStop and grace period, securityContext, Helm values, and kubectl/helm validation.
- **Found by:** pair:ops-deploy, lens:authoring, lens:coverage, lens:accuracy-safety

### F063: No release strategy, deploy job, rollback or post-deploy verification

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** backend-deploy/SKILL.md:140-194,239-278 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** The CI templates only test and build-push. Rollback appears once at :276. Grep canary|blue.green: 0.
- **Impact:** 'How do I ship safely or roll back?' goes unanswered, and pipelines labelled CI/CD never deploy.
- **Fix:** Add deploy jobs per target, a strategy table, SHA-based rollback, smoke checks, and protected prod environments.
- **Found by:** pair:ops-deploy, lens:coverage

### F066: No resilience patterns for synchronous dependencies

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** ops:164-203; implement:317; principles.md:33-40 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/_shared/principles.md)
- **Evidence:** Grep circuit|bulkhead|load shedding: 0. Retries cover queues only. Clients are 'behind interfaces' with no timeout policy.
- **Impact:** Default or infinite timeouts and retry storms cascade into outages.
- **Fix:** Add timeouts, idempotent-only retries with jitter and budgets, circuit breakers, bulkheads, pool sizing, load shedding, and a doctor probe for clients without a timeout.
- **Found by:** lens:coverage, pair:ops-deploy

### F056: Health endpoint paths contradict between ops, deploy and doctor

- **Severity:** medium (was high) · **Kind:** defect · **Category:** consistency
- **Where:** ops:104,249-251,265-267,315; deploy:204-207; doctor:141,148,282 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** ops '/health, /ready, /metrics'. deploy '/health/live', '/health/ready'. doctor probes /health or /ready. The ops Go snippet uses net/http while implement uses Gin.
- **Impact:** Production Readiness creates duplicate probe sets and doctor raises false 'missing health endpoint' findings.
- **Fix:** Define one canonical set in principles.md, have doctor discover the actual routes, and give Gin/chi variants.
- **Verifier correction:** The evidence is accurate. ops:104 lists '/health, /ready, /metrics' and ops:265-267/291-295/315-320 scaffold /health. deploy:206-207/212 uses /health/live and /health/ready. doctor:141 curls /health or /ready, and doctor:282 recommends 'Add /health and /ready'. The ops audit grep at :250 matches only the quoted literal '/health', so it would not detect deploy's /health/live and could raise the High 'missing /health' finding (ops:347). ops:317 registers on net/http DefaultServeMux, while implement:159/293 standardises on Gin. Severity is overstated, though. The impact is duplicate endpoints and false-positive findings, not dangerous or materially wrong behaviour, so medium.
- **Found by:** pair:ops-deploy, pair:test-doctor, lens:cross-consistency, lens:authoring, lens:accuracy-safety, lens:scenarios-a, lens:scenarios-b

### F057: backend-deploy templates are Node-only though it detects Python, Go and Java

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-deploy/SKILL.md:28-30,56-76,140-194,211-252 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Every template uses node:20-alpine, npm ci, setup-node, a TS readiness handler and NODE_ENV. Grep python|go build|java|gradle: only the manifest glob.
- **Impact:** Non-Node projects get a pipeline that can't build.
- **Fix:** Add per-stack Dockerfile and CI references selected from the manifest, and derive build/start commands and port from the project.
- **Found by:** pair:ops-deploy, lens:scenarios-a, lens:scenarios-b

### F059: backend-deploy has no confirmation gates for pushes, deploys or overwriting existing pipelines

- **Severity:** medium (was high) · **Kind:** gap · **Category:** agent-safety
- **Where:** backend-deploy/SKILL.md:169-173 (whole file) (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Grep mode=|confirm|kubectl|terraform finds nothing relevant. The template has `push: true`, and there is no 'detect existing Dockerfile/CI' step.
- **Impact:** The agent may replace a working CI pipeline or push or apply to environments without asking.
- **Fix:** Generate files automatically, but confirm push, apply, IaC and secret changes. Diff and patch existing artifacts rather than overwriting them.
- **Verifier correction:** The part to keep is that there is no step to detect existing artifacts. Deploy's prerequisites (:22-40) glob only source dirs and manifests, and a grep for existing, overwrite, already, .github or gitlab-ci in deploy returns nothing. So the agent may regenerate over a working Dockerfile or workflow. The push and apply claim is overstated. The skill never tells the agent to run docker push, kubectl, helm or terraform. `push: true` (:172) and `docker push` (:192) are CI steps that run in GitHub or GitLab after a merge to main, which is normal CI. _shared/tool-rules.md:38 already requires pausing for 'production deploys', 'secret rotation' and 'force-pushes', and :59 provides a git-checkout rollback for generated files. Overwrites are recoverable through git, so this is medium, not high.
- **Found by:** pair:ops-deploy

### F061: Templates pin EOL or deprecated versions (Node 20, docker:24, npm --only, OpenAPI 3.0, safety check)

- **Severity:** medium (was high) · **Kind:** defect · **Category:** versioning
- **Where:** deploy:60,65,67,152,181,188-189; api-design:178,181 (files: .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** `node:20-alpine` (Node 20 went EOL 2026-04-30), `docker:24`, `npm ci --only=production`, `openapi: 3.0.0`. No 'as of' date anywhere.
- **Impact:** Generated images run on an unpatched runtime and use deprecated flags.
- **Fix:** Derive the version from .nvmrc/engines or current LTS, pin by digest, use --omit=dev, and date the examples.
- **Verifier correction:** Keep: node:20-alpine at deploy:60/:67/:181 and node-version 20 at :152 (Node 20 reached EOL on 2026-04-30, before today's date of 2026-10-31). docker:24 and docker:24-dind at :188-189 are several majors behind and out of support. `npm ci --only=production` at :65 is deprecated, still works with a warning, and should be --omit=dev. There is no 'as of' date anywhere. Drop: `openapi: 3.0.0` (api-design:178/181) is neither EOL nor deprecated. OAS 3.0.x is still a valid, widely supported spec and 3.1/3.2 are merely newer, so this is an enhancement, not a defect. The 'safety check' item is not in the cited files. It is at backend-doctor/SKILL.md:120, deprecated in favour of `safety scan` and paired there with pip-audit. Severity: these are concrete example pins the agent will probably copy, so the risk of shipping an EOL runtime is real but not immediately breaking. Medium.
- **Found by:** pair:ops-deploy, lens:authoring, lens:accuracy-safety

### F062: docker-compose and .env.example produce a stack that won't start or connect

- **Severity:** medium (was high) · **Kind:** defect · **Category:** correctness
- **Where:** backend-deploy/SKILL.md:102-128,243-252 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** postgres has no POSTGRES_PASSWORD. DATABASE_URL uses localhost inside the app container. A shared env_file gives JWT_SECRET to the db. `pg_isready -U postgres` hard-codes the user, and `version: "3.8"` is obsolete.
- **Impact:** `docker compose up` fails, and the db container receives app secrets.
- **Fix:** Use per-service env, POSTGRES_* in .env.example, service DNS names, a healthcheck with $${POSTGRES_USER}, and drop version:.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F064: GitHub Actions template lacks permissions (GHCR push fails) and uses static credentials

- **Severity:** medium (was high) · **Kind:** defect · **Category:** security
- **Where:** backend-deploy/SKILL.md:140-174,200 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** No `permissions:` block while pushing to ghcr with GITHUB_TOKEN (read-only by default since 2023). Uppercase repo names are not lowercased. 'keep deployment credentials in CI secrets'.
- **Impact:** The push fails with 403, or the job gets write-all tokens and long-lived cloud keys.
- **Fix:** Use least-privilege permissions (packages: write only on push), lowercase image names, and OIDC federation.
- **Found by:** pair:ops-deploy, lens:authoring, lens:accuracy-safety

### F065: SLOs, alerting, incident response and runbooks are triggers but have no content

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** backend-ops/SKILL.md:15,404-405 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** :15 activates on SLIs/SLOs and runbooks, and the only content is the leaf ':404 ... + alerting rules'. Grep postmortem|on-call|error budget: 0.
- **Impact:** Production-readiness and outage requests get no alerting, SLO or incident guidance.
- **Fix:** Add an SLO & Alerting section (SLIs, burn-rate alerts, runbook links) and an incident workflow (triage, mitigate, timeline, postmortem).
- **Found by:** pair:ops-deploy, lens:coverage, lens:authoring

### F097: Ops never records decisions or deployment memory, despite orchestrator claims

- **Severity:** medium · **Kind:** gap · **Category:** consistency
- **Where:** orchestrator:111,116; ops:411-418; deploy:42-52 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** ops is said to 'Write decisions.md', but it only reads it. tech-stack Observability/Caching/Messaging are never written.
- **Impact:** Ops and deploy choices are lost, and the deploy loop-back records nothing.
- **Fix:** Make ops append decisions and tech-stack sections and log findings to issues.md, and make deploy write deployment.md.
- **Found by:** pair:ops-deploy, lens:cross-consistency, lens:authoring, lens:scenarios-b

### F193: GitHub Actions template skips PR validation, invents script names and has no cache

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-deploy/SKILL.md:142-157,169-173,198-200 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Only `on: push main`, `npm run test:ci`, and no cache-from despite the 'Use registry caching' rule.
- **Impact:** Broken code reaches main and the pipeline fails on missing scripts.
- **Fix:** Add a pull_request trigger, take scripts from the manifest, and add a gha cache.
- **Found by:** pair:ops-deploy, lens:authoring

### F194: GitLab CI template can't push (no login), uses deprecated only:, and has no dind TLS

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-deploy/SKILL.md:176-194 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** docker push with no docker login, `only: [main]`, docker:24.
- **Impact:** The pipeline fails on its first run.
- **Fix:** Add a before_script login, rules:, DOCKER_TLS_CERTDIR, and a rootless option.
- **Verifier correction:** The 'no dind TLS' claim is weak. The official docker:24 and docker:24-dind images already default DOCKER_TLS_CERTDIR=/certs, and on GitLab.com SaaS runners (which mount /certs/client) the job connects without setting the variable explicitly. On self-hosted runners it depends on the runner's volume configuration, not only on the variable. Setting it explicitly is a robustness improvement, not a guaranteed failure. The finding should say 'only: is legacy, rules: preferred', not 'deprecated'. The missing login alone justifies medium.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F196: Dockerfile template correctness and hardening problems

- **Severity:** medium · **Kind:** defect · **Category:** security
- **Where:** backend-deploy/SKILL.md:58-96 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Hard-coded dist/main.js:3000, floating tag despite the 'pinned' rule, non-numeric USER, no init or HEALTHCHECK. .dockerignore misses .opencode, keys and .npmrc.
- **Impact:** Build failures, pods rejected by runAsNonRoot, internal notes leaked into layers.
- **Fix:** Derive entrypoint and port, pin by digest, use a numeric UID, add tini, and extend .dockerignore.
- **Verifier correction:** Some claims are overstated. Copied files such as .opencode memory notes, .npmrc or keys land only in the build stage, because `COPY . .` is at :64 and the runtime stage (:67-75) copies only node_modules, dist and package.json. They are not in the shipped image's layers; they matter only for build cache export or a leaked builder stage. Tini is not needed for signal handling here, because the template installs SIGTERM/SIGINT handlers (:229-230); its value is zombie reaping only. A Dockerfile HEALTHCHECK is ignored by Kubernetes. A wrong dist/main.js path causes a runtime crash, not a build failure. The finding misses a more important point: Node 20 reached end of life on 2026-04-30, and the template ships node:20-alpine here, `node-version: 20` (:152) and `node:20-alpine` in GitLab (:181). It also uses the deprecated `npm ci --only=production` (:65) instead of `--omit=dev`.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F197: Readiness and graceful-shutdown template drops requests and mishandles failures

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-deploy/SKILL.md:211-237 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** No readiness flip on SIGTERM, no deadline, internals exposed. Readiness fails on a shared-DB blip.
- **Impact:** 502s on every deploy, SIGKILL mid-request, total outage on a blip.
- **Fix:** Mark not-ready, wait or preStop, close with a forced deadline, and use short cached checks.
- **Verifier correction:** '502s on every deploy' and 'total outage on a blip' are overstated. Making readiness depend on shared dependencies is a debated design choice, not a clear defect. The suite prescribes it consistently: deploy:235-236 and ops:106 ('Readiness: dependencies (DB, cache, queue) are reachable'). The recommendation to cache or soften dependency checks is reasonable but is an enhancement. The finding misses some concrete template bugs. There is no timeout on db.ping()/cache.ping(), so the probe hangs. A rejected ping inside Promise.all throws out of an Express 4 async handler with no try/catch, giving an unhandled rejection instead of a 503. A second signal calls server.close() again. The deploy endpoints /health/live and /health/ready (:206-207) are also inconsistent with ops' /health and /ready (ops:104, 250, 265).
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F199: Secrets management is shallow: no provider integration, rotation runbook or leak response

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** ops:219-223; deploy:241,257-258 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Three bullets, and K8s secrets are treated as sufficient. Grep vault|KMS|SOPS: one hit.
- **Impact:** .env files in production, and no path to rotate.
- **Fix:** Add secret managers or ESO, encryption at rest, OIDC, dual-key rotation, and a leak procedure.
- **Verifier correction:** The evidence count is wrong: a grep for vault|kms|sops returns 0 hits, not 1. Some content the finding calls missing does exist at principle level. principles.md:44 says 'encrypt secrets at rest and in transit', principles.md:48 says 'rotate keys', ops:222 says 'support zero-downtime rotation', and auth:247-248 covers signing-key rotation with `kid`, which is the basis of dual-key rotation. The real gaps are concrete provider integration, the Kubernetes Secrets caveat, CI OIDC, and a leaked-secret procedure. Medium is appropriate.
- **Found by:** pair:ops-deploy, lens:coverage

### F200: No supply-chain controls in CI (image scanning, SBOM, signing, dependency updates)

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-deploy/SKILL.md:136-200 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Grep sbom|trivy|cosign|dependabot: 0.
- **Impact:** Images ship with no vulnerability gate.
- **Fix:** Add Trivy/Grype, an SBOM, cosign, renovate config and gitleaks.
- **Found by:** pair:ops-deploy, lens:coverage

### F201: Infrastructure-as-code routed to deploy but not covered

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** deploy:3; orchestrator:41 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** Grep terraform|pulumi|cloudformation: 0.
- **Impact:** Ad-hoc provisioning and click-ops.
- **Fix:** Add an IaC section or skill (remote state, plan in PR, policy scan, OIDC, apply gated), or scope it out.
- **Found by:** pair:ops-deploy, lens:coverage

### F202: Serverless and PaaS recommended but have no implementation or deploy guidance

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** deploy:16,263-271; architect:89-92,177 (files: .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Grep lambda|workers|RDS Proxy|fly.toml: 0.
- **Impact:** Choosing serverless gets no follow-through.
- **Fix:** Add a serverless/edge/PaaS track: handlers, DB connections, limits, event idempotency, tooling.
- **Found by:** pair:ops-deploy, lens:coverage

### F203: Deploy prerequisites duplicate context-loading and contradict themselves

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-deploy/SKILL.md:18-52 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** tech-stack is RECOMMENDED :31 and REQUIRED :47. Security section vs Code/System. The manifest list omits requirements.txt and Cargo.
- **Impact:** Valid projects get stopped.
- **Fix:** Reference the standard block and keep one consistent list.
- **Found by:** pair:ops-deploy

### F204: Ops has two process sections that disagree and contradict mode=auto

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** backend-ops/SKILL.md:231-261,411-418 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** 'add the missing pieces' vs 'Confirm scope: ask the user'. Grep mode=: 0.
- **Impact:** New deps and middleware may be added to a regressing prod service.
- **Fix:** Merge into one workflow and reference the contract, with confirmation before deps or middleware.
- **Found by:** pair:ops-deploy, lens:scenarios-b, lens:authoring

### F205: Ops audit covers only observability, not caching, messaging or config

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-ops/SKILL.md:235-257,342-349 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Six probes, all about logs, health and tracing.
- **Impact:** Queue and config reviews get generic advice.
- **Fix:** Add cache TTL, ack placement, DLQ and config-validation probes.
- **Found by:** pair:ops-deploy

### F206: Ops audit commands are POSIX-only, Node-centric and assume src/

- **Severity:** medium · **Kind:** defect · **Category:** portability
- **Where:** backend-ops/SKILL.md:240-255 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** `grep -R "console\.log\|..." src/`, unconditional manifest greps.
- **Impact:** Fails on Windows, false negatives on Go and Python, spurious tooling findings.
- **Fix:** Use native grep with per-language patterns and roots from project-overview.
- **Found by:** pair:ops-deploy, lens:scenarios-a

### F207: Ops scaffolding snippets are incomplete or wrong

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-ops/SKILL.md:275-287,302-311,330-339 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** The Python 'middleware' is only a ContextVar. structlog has no JSON configure. Go uses a string context key. Inbound IDs are unvalidated. No dependency install or verify step.
- **Impact:** Gaps reported as fixed, plus log injection.
- **Fix:** Provide complete validated middleware, install deps, and verify JSON logs and endpoints.
- **Found by:** pair:ops-deploy, lens:accuracy-safety, lens:authoring

### F208: Ops scaffolding covers only Express, FastAPI and net/http, with no OpenTelemetry bootstrap

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-ops/SKILL.md:117-122,261-340 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** No Spring/NestJS/Django/Gin, and 'Prefer OpenTelemetry' with no SDK setup.
- **Impact:** Common stacks get nothing for 'add tracing'.
- **Fix:** Add per-stack references, including Actuator/Micrometer, and an OTel env-driven bootstrap.
- **Found by:** pair:ops-deploy, lens:coverage, lens:scenarios-a

### F209: /metrics served on the public port, and metric cardinality not addressed

- **Severity:** medium · **Kind:** gap · **Category:** security
- **Where:** backend-ops/SKILL.md:94-107,269-274,322-325 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** `app.get('/metrics')` on the main router, with no label rules.
- **Impact:** Internal data exposed, and series explosions.
- **Fix:** Use an internal port, route-template labels only, and histograms.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F210: Caching guidance is inaccurate (write-through 'always consistent') and omits tenant-scoped keys

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-ops/SKILL.md:137-162,383 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** ':153 Write-through ... always consistent', 'LRU ... no eviction control', Bull instead of BullMQ.
- **Impact:** Stale data and cross-user leaks through shared keys.
- **Fix:** Correct the claims, use commit-then-delete, principal-scoped keys and private/no-store headers.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F211: Messaging and outbox guidance misstates delivery semantics and lacks dedup and ordering

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-ops/SKILL.md:164-203,391-392 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** 'Visibility timeout: prevent double-processing'. Relay polls with no SKIP LOCKED. No inbox, partition key or lag metric.
- **Impact:** Duplicate side effects and silent consumer lag.
- **Fix:** State at-least-once delivery, add an inbox table, SKIP LOCKED or CDC relay, partitioning, poison→DLQ and lag alerts.
- **Verifier correction:** Narrow the finding. Idempotency (line 176), DLQ (179, 199-202) and queue depth (91, 100) are already covered. The real gaps are: (1) the visibility-timeout wording at line 180; (2) the outbox relay at 186-187 has no concurrency control (FOR UPDATE SKIP LOCKED or a single leader) and no warning that a crash between publish and mark causes duplicates; (3) there is no concrete dedup mechanism, such as an inbox or processed-message-id table; (4) there is no guidance on per-key ordering or partition keys; (5) there is no metric for consumer lag or age of the oldest message.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F212: Ownership of secrets, config, promotion, health and correlation IDs overlaps across ops, deploy, auth and implement

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** ops:13,102-107,219-229; deploy:14-15,202-259; auth:246-249; implement:256 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** The same topics appear in several skills, and the duplicated health paths have already drifted.
- **Impact:** Ambiguous routing and diverging guidance.
- **Fix:** Write an ownership table and cross-reference it instead of duplicating.
- **Verifier correction:** Limit the finding to ops/deploy/doctor. The concrete drift is the health paths: ops:104 `/health`+`/ready`, deploy:206-207 `/health/live`+`/health/ready`, doctor:141,282 `/health`+`/ready`. The duplication is secrets and promotion: ops:219-229 against deploy:14,241-259. Drop auth:246-249 and implement:256 as evidence.
- **Found by:** pair:ops-deploy

### F214: Ops has no deliverables, report template or verification

- **Severity:** medium · **Kind:** gap · **Category:** authoring-quality
- **Where:** backend-ops/SKILL.md:259-261,342-359,411-418 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** 'produce a design doc' with no path or template.
- **Impact:** Success claimed without checking endpoints or logs.
- **Fix:** Add an Ops Report template and an exit checklist.
- **Verifier correction:** Restate the finding as three gaps: (1) ops never writes to decisions.md, contradicting orchestrator:111,116; (2) the 'design doc' at :418 has no output path or template; (3) there is no verification or exit checklist after generated changes. The per-finding report format at :342-359 and the curl probe at :251 already exist.
- **Found by:** pair:ops-deploy

### F215: Outdated OTel semantic conventions and Jaeger exporter; no sampling or PII guidance

- **Severity:** medium · **Kind:** defect · **Category:** correctness
- **Where:** backend-ops/SKILL.md:117-131 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** http.method, http.status_code, db.statement, 'Export to ... Jaeger'.
- **Impact:** Attributes don't match dashboards, and trace volume is unbounded.
- **Fix:** Use http.request.method etc., OTLP only, a sampler, and sanitize query text.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F195: CI actions are outdated and pinned by mutable tag

- **Severity:** low (was medium) · **Kind:** defect · **Category:** security
- **Where:** backend-deploy/SKILL.md:149-169 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** checkout@v4, build-push-action@v5, tag pins only.
- **Impact:** Deprecation breakage and tag-hijack supply-chain risk.
- **Fix:** Use current majors pinned to SHAs, updated by Dependabot or Renovate.
- **Verifier correction:** 'Deprecation breakage' is speculative. The cited versions still run, and newer majors mainly change the Node runtime. SHA pinning is GitHub's recommended hardening for third-party actions such as docker/*, and tag hijacks have really happened (e.g. tj-actions in 2025). Even so, major-tag pins are widespread accepted practice, and for first-party actions/* the risk is low. This is a hardening enhancement plus a version refresh, not a medium-severity defect. Recommend SHA pins with Dependabot/Renovate as an enhancement.
- **Found by:** pair:ops-deploy, lens:accuracy-safety

### F198: .env.example ships a non-empty placeholder JWT secret that defeats fail-fast checks

- **Severity:** low (was medium) · **Kind:** defect · **Category:** security
- **Where:** deploy:250; ops:209-211 (files: .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** `JWT_SECRET=replace-in-production` passes presence validation, and .env is never checked against gitignore.
- **Impact:** A known signing key in prod enables JWT forgery.
- **Fix:** Leave it empty, reject placeholders and short values, and check .gitignore.
- **Verifier correction:** The claim that '.env is never checked against gitignore' is refuted: backend-doctor:156 says 'Verify `.env` is in `.gitignore`', and doctor is step 3 of the Production Readiness workflow (orchestrator:117-121). The Dockerfile's .dockerignore excludes `.env*` (deploy:90), so the placeholder is never baked into images. The production risk depends on someone copying the example file into prod. That makes this a low-severity hardening issue, not a medium defect.
- **Found by:** pair:ops-deploy

### F213: Ops and deploy descriptions miss key triggers and collide on generic words

- **Severity:** low (was medium) · **Kind:** enhancement · **Category:** routing
- **Where:** line 3 of ops and deploy (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-deploy/SKILL.md)
- **Evidence:** ops has 'config'/'async' but no SLO/OTel/DLQ. deploy has no Helm/rollback/Dockerfile.
- **Impact:** Misrouting.
- **Fix:** Use WHAT+WHEN+phrases with a boundary clause.
- **Verifier correction:** Remove the Dockerfile and rollback claims. The real issue is that trigger terms from the When-to-Activate sections (SLO, feature flags, secrets, dead-letter, Helm, serverless/PaaS) are absent from the frontmatter descriptions, and that deploy:3 'health checks' collides with doctor:3 'health check' with no boundary clause. Low severity.
- **Found by:** pair:ops-deploy

### F270: backend-ops has no standard Prerequisites block and has duplicate context lists

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** backend-ops/SKILL.md:17-35; version-changelog.md:20 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** 0 context-loading references, two lists in different orders, and the changelog claims it was aligned.
- **Impact:** Root and staleness checks are skipped.
- **Fix:** Add the standard reference and one list.
- **Found by:** pair:ops-deploy, lens:authoring

### F271: PII redaction suggests plain hashing of low-entropy identifiers

- **Severity:** low · **Kind:** defect · **Category:** security
- **Where:** backend-ops/SKILL.md:79-83 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** 'Log only hashes ... for identifiers' alongside email and phone.
- **Impact:** Reversible pseudonyms create compliance exposure.
- **Fix:** Use keyed HMAC or tokenization with allow-list logging.
- **Found by:** pair:ops-deploy

## Cross-cutting coverage gaps

### F018: _shared is resolved via a project-relative path that doesn't exist on global installs; REQUIRED checks hard-stop

- **Severity:** high · **Kind:** defect · **Category:** portability
- **Where:** architect:22-24; auth:22-24; deploy:25-27; context-loading.md:73-79; README.md:61-65 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-deploy/SKILL.md, .agents/skills/_shared/context-loading.md)
- **Evidence:** 'Check: read .agents/skills/_shared/principles.md ... If missing: stop'. The README defaults to ~/.agents/skills, ~/.cursor/... and Gemini paths. context-loading :79 says missing shared files must 'not block execution'. Bare `_shared/` refs should be `../_shared/`.
- **Impact:** On every global install, architect, auth and deploy stop, and other skills silently skip the principles.
- **Fix:** Resolve `../_shared/` relative to the SKILL.md (or copy references into each skill), drop the hard-coded paths, and use one consistent block policy.
- **Verifier correction:** The three skills do not stop silently. They stop and ask the user, which is recoverable but interrupts every run, including mode=auto pipelines. The other skills do not 'silently skip' either: context-loading.md:79 tells them to note the missing files in the output. Per-project installs (<project>/.agents/skills) are unaffected.
- **Found by:** pair:arch-viz, pair:api-auth, pair:ops-deploy, lens:cross-consistency, lens:packaging, lens:authoring, lens:scenarios-a, lens:scenarios-b

### F029: Multi-tenancy is one line; the auth ownership example permits cross-tenant access

- **Severity:** high · **Kind:** gap · **Category:** security
- **Where:** db-design:387; auth:81,166,169-178; architect:169-204 (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-auth/SKILL.md, .agents/skills/backend-architect/SKILL.md)
- **Evidence:** db-design :387 'Add tenant_id to all tables, consider schema-per-tenant'. Grep RLS|row-level: 0. The auth example `ownerId !== currentUser.id && !currentUser.isAdmin()` uses a global admin bypass.
- **Impact:** SaaS backends ship with no enforced isolation, so cross-tenant data can leak.
- **Fix:** Add a tenancy model decision, tenant_id in PK/FK/unique keys, RLS or scoped repositories, tenant-scoped roles from the verified token, and cross-tenant negative tests.
- **Verifier correction:** The auth:174-178 example is a generic ownership check and is not presented as multi-tenant. A non-admin user from another tenant is still blocked by the ownerId comparison. The cross-tenant risk exists only because `isAdmin()` is a global role check with no tenant scoping, so it is a pitfall the skill fails to warn about rather than an example that outright 'permits cross-tenant access'.
- **Found by:** lens:coverage, lens:scenarios-a, pair:api-auth, pair:db-migrate

### F068: No backup, restore drill or disaster-recovery coverage

- **Severity:** high · **Kind:** gap · **Category:** coverage
- **Where:** migrate:194-200; orchestrator:105-121 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** Grep backup|PITR|RPO|failover finds only migrate's restore options. Production Readiness never checks backups.
- **Impact:** A service can be called production-ready with no verified restore.
- **Fix:** Add backup policy, PITR, restore drills that measure RTO/RPO, a DR runbook, and make 'restore tested' a readiness gate.
- **Found by:** lens:coverage

### F050: OpenCode/OMO tool names and LSP-dependent gates have no CLI fallback on the advertised Cursor and Gemini hosts

- **Severity:** medium (was high) · **Kind:** gap · **Category:** portability
- **Where:** tool-rules.md:3,10-12; refactor:70,105-106,154-155,265-266; doctor:103,157,187; scan:20,52 (files: .agents/skills/_shared/tool-rules.md, .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** lsp_*, call_omo_agent and task() are named, and refactor's lsp_rename isn't even in the toolkit. The refactor exit requires 'LSP diagnostics clean'. Doctor files a missing tool as a Medium finding. The README advertises Cursor and Gemini.
- **Impact:** Gates can't be met on other hosts, and doctor reports false Tooling findings against the project.
- **Fix:** Describe capabilities, not tool names, map them per host, give compiler and type-check fallbacks (tsc, mypy, go vet, mvn compile), and report an unavailable tool as an environment note.
- **Verifier correction:** The claim that there is no CLI fallback is wrong for doctor. doctor:97-101 already runs `tsc --noEmit`, `mypy .`, `go vet` and the Maven checks, and treats lsp_diagnostics (doctor:103) only as a supplement. tool-rules.md:27 already says to note an unavailable LSP explicitly. The real gap is refactor and implement, which have no compiler or type-check fallback for their LSP gates or for rename. scan:20 and :52 use generic glob/read/grep and are not a problem. The README and package.json are Opencode-centric ('Usage in Opencode'), which lowers the impact on the other hosts.
- **Found by:** pair:orch-scan, pair:arch-viz, pair:impl-refactor, pair:test-doctor, lens:packaging, lens:authoring, lens:scenarios-b, lens:cross-consistency

### F067: No scheduled jobs, job lifecycle, outbox relay or saga guidance

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** ops:164-203,182-187; architect:149,254 (files: .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Cron appears only in a table cell. Saga appears once. Grep temporal|advisory lock|leader|inbox: 0.
- **Impact:** Jobs double-run across replicas, drop work on deploy, and multi-step flows have no compensation.
- **Fix:** Add a jobs/workflows section: overlap locks, DST, worker drain, outbox relay with SKIP LOCKED/CDC plus inbox, sagas, and a durable-engine decision tree.
- **Verifier correction:** Saying there is no outbox guidance is inaccurate. ops:182-187 defines the outbox pattern (same-transaction write, a relay process that polls and publishes, mark as processed), ops:392 routes to it, and implement:325 references it. ops:166-180 also covers job queues, idempotent consumers, ack-after-success, bounded retries, DLQ and visibility timeout. 'Saga appears once' is also wrong: it appears zero times. The real gap is scheduled jobs, worker lifecycle and sagas, plus a shallow outbox relay. That is medium, not high.
- **Found by:** lens:coverage

### F069: Stacks beyond Node/Python/Go/Java are unsupported, and deploy hard-stops on them

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** context-loading.md:18,48; deploy:28-30; doctor:62-68 (files: .agents/skills/_shared/context-loading.md, .agents/skills/backend-deploy/SKILL.md, .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** deploy :30 says 'stop' without package.json/pyproject/go.mod/pom/gradle. Grep php|laravel|dotnet|csproj|elixir|kotlin|deno: 0.
- **Impact:** PHP, Rails, .NET, Rust, Kotlin and Elixir projects get no commands, and deploy refuses to run.
- **Fix:** Add _shared/stacks/<lang>.md (manifests, test/lint/audit/migrate commands, Docker/CI) and replace the stop with ask.
- **Verifier correction:** Rust and Ruby are recognised: context-loading.md:18 and :48 glob Cargo.toml and Gemfile, and scan:65-66 list both. The real defect is that deploy's manifest list is narrower than the shared one, so deploy stops on Rust and Ruby projects too. deploy stops and asks the user rather than refusing outright. doctor:70 says to 'fall back to the standard commands for the detected language', so it is not left with no commands at all. PHP, .NET, Kotlin DSL and Elixir are not covered at all. Medium rather than high, because the agent's own knowledge covers these stacks and the design skills are mostly language-agnostic.
- **Found by:** lens:coverage

### F070: No guidance for LLM/AI feature backends (RAG, vector stores, LLM gateway)

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** architect:94-109; db-design:63-83 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Grep LLM|RAG|vector|embedding|pgvector: 0. DB selection covers only PG/MySQL/Mongo/Redis.
- **Impact:** LLM integrations ship with no timeouts, cost limits or prompt-injection defense.
- **Fix:** Add backend-ai: gateway port, streaming, token budgets, a RAG pipeline with a vector index, evals, and security.
- **Verifier correction:** This is a scope expansion, not a defect. Nothing in the suite gives wrong guidance about AI features. It just has no specialised coverage, and the impact claim that integrations 'ship with no timeouts or cost limits' is speculative. Medium. A broader, cheaper fix is also missing: general resilience guidance for external dependencies (timeouts, retries, circuit breakers, budgets) in principles.md or backend-ops.
- **Found by:** lens:coverage

### F071: No framework or dependency major-upgrade workflow (e.g. Spring Boot 2.7→3)

- **Severity:** medium (was high) · **Kind:** gap · **Category:** coverage
- **Where:** refactor:17,27,245-257; doctor:215-220 (files: .agents/skills/backend-refactor/SKILL.md, .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Grep jakarta|openrewrite|upgrade|EOL: 0. refactor's HARD RULE forbids behavior change and doctor says only 'Check for breaking changes'.
- **Impact:** Upgrades have no home skill, and the closest skill tells the agent to stop.
- **Fix:** Add an upgrade workflow: migration guide, stepwise majors on a branch, codemods (OpenRewrite/Rector), a list of intended behavior changes for approval, then lockfiles, CI and runtime.
- **Verifier correction:** The topic is not entirely without a home. refactor's 'Modernize Legacy' recipe (refactor:246-257) covers replacing deprecated APIs and old ORM APIs incrementally under characterization tests, and refactor's triggers include 'modernize legacy'. What is missing is a dependency or framework major-upgrade workflow: migration guides, stepwise version bumps, codemods, and an approved list of intended behaviour changes. That is an important enhancement, but medium rather than high.
- **Found by:** lens:coverage, lens:scenarios-b

### F091: Design skills' mandatory question-and-confirm steps conflict with mode=auto and gate handoffs

- **Severity:** medium · **Kind:** defect · **Category:** consistency
- **Where:** architect:48-60,158-167; db-design:22-24,42-51,232; api-design:21-23,50-60,260; auth:25-27 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-auth/SKILL.md)
- **Evidence:** About 20 iterative questions, plus 'Should I save this to ... memory?' even though the next step reads that file. Grep mode= in these skills: 0.
- **Impact:** Pipelines stall, or the next step reads stale memory when the user declines.
- **Fix:** In auto mode, infer from the request and memory, ask one batched question for blocking inputs, persist approved designs automatically, and confirm once.
- **Found by:** pair:arch-viz, pair:db-migrate, pair:api-auth, lens:cross-consistency, lens:scenarios-a, lens:authoring

### F092: Context-loading boilerplate is repeated in most skills, and the copies contradict each other

- **Severity:** medium · **Kind:** defect · **Category:** authoring-quality
- **Where:** implement:28-53; visualize:16-59; ops:17-35; scan:36-42,100-138; context-loading.md:187-200 (files: .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-visualize/SKILL.md, .agents/skills/backend-ops/SKILL.md, .agents/skills/backend-scan/SKILL.md)
- **Evidence:** implement says lazy-load decisions.md, then Step 1 says 'Read all memory files'. visualize says 'others lazily', then loads five. ops lists the files twice in different orders.
- **Impact:** Wasted tokens and nondeterministic context loading.
- **Fix:** Keep one block per skill listing only deviations from the shared priority list.
- **Found by:** lens:authoring, lens:cross-consistency, pair:orch-scan, pair:impl-refactor

### F095: Generic one-word triggers ('test', 'config', 'session', 'health check') collide across skills

- **Severity:** medium · **Kind:** enhancement · **Category:** routing
- **Where:** frontmatter line 3: test, ops, scan, auth, refactor, doctor; test:30 (files: .agents/skills/backend-test/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** test triggers on 'test' and auto-runs the suite. doctor's 'health check' overlaps deploy's health checks. ops has 'config'/'async'. No description says 'not for'.
- **Impact:** 'test the migration on staging' runs the whole suite, and 'add health check' routes to doctor.
- **Fix:** Use backend-qualified multi-word triggers plus 'Do NOT use for' clauses.
- **Found by:** pair:test-doctor, lens:authoring

### F098: No scripts/ for deterministic logic currently done by hand in prose

- **Severity:** medium · **Kind:** gap · **Category:** authoring-quality
- **Where:** context-loading.md:118-144; memory-schema.md:305-315; implement:59-108; visualize:689-712 (files: .agents/skills/_shared/memory-schema.md, .agents/skills/backend-implement/SKILL.md, .agents/skills/backend-visualize/SKILL.md)
- **Evidence:** Staleness math, compaction, schema checks, layer greps, Mermaid rules and checkpoints are all prose with no script.
- **Impact:** Results vary from run to run and the procedures are error-prone.
- **Fix:** Ship scripts: validate_mermaid, check_memory_schema, staleness, compact, lint_migration, checkpoint, check_layers.
- **Found by:** lens:authoring

### F226: No API documentation publishing or SDK generation

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** backend-api-design/SKILL.md:176-244 (files: .agents/skills/backend-api-design/SKILL.md)
- **Evidence:** Grep redoc|spectral|openapi-generator: 0.
- **Impact:** Specs drift and consumers get no clients.
- **Fix:** Add design- vs code-first choice, Spectral, rendering, client generation and a drift check.
- **Found by:** lens:coverage

### F227: No data privacy or compliance capability (retention, erasure, DSAR, field encryption)

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** ops:79-83; db-design:240; principles.md:44 (files: .agents/skills/backend-db-design/SKILL.md, .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Grep GDPR|retention|erasure|DSAR: 0.
- **Impact:** PII is kept forever and erasure can't be done.
- **Fix:** Add a privacy skill: classification, encryption, retention jobs, DSAR export/erase.
- **Found by:** lens:coverage

### F229: No diff-scoped PR review mode

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** doctor:76-168; orchestrator:21,39 (files: .agents/skills/backend-doctor/SKILL.md)
- **Evidence:** Review routes to whole-repo checks. Grep git diff|pull request: only refactor :163.
- **Impact:** Slow, noisy reviews that miss diff-specific risks.
- **Fix:** Add mode=review scoped to base...HEAD with per-file checklists.
- **Found by:** lens:coverage

### F230: Search has no indexing, sync or reindex guidance

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** api-design:292-296; db-design:386 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Grep tsvector|reindex|alias: 0.
- **Impact:** Index drift and authz leaks in search results.
- **Fix:** Add an FTS vs engine decision, outbox/CDC sync, alias reindexing, and authz filters.
- **Verifier correction:** Grep evidence correction: 'tsvector|reindex' returns 0, and 'alias' matches only unrelated column and module aliasing (migrate:64, refactor:196-197). Existing search guidance is api-design:292-296 and db-design:67,386.
- **Found by:** lens:coverage

### F231: No event/message contract design or schema evolution

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** ops:164-203; refactor:97 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Grep schema registry|cloudevents|asyncapi: 0.
- **Impact:** Unversioned payloads break consumers.
- **Fix:** Add an envelope, compatibility rules, a registry, AsyncAPI and contract tests.
- **Found by:** lens:coverage

### F232: Payments and money movement not covered

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** db-design:249-255; principles.md:46 (files: .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** Grep stripe|ledger|refund|reconcil: 0.
- **Impact:** Lost or double-counted money.
- **Fix:** Add a payments skill: PSP adapter, state machine, idempotency, ledger, reconciliation.
- **Found by:** lens:coverage

### F233: No workflow for extracting a microservice or splitting data ownership

- **Severity:** medium · **Kind:** gap · **Category:** coverage
- **Where:** architect:198,298; refactor:231-243 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-refactor/SKILL.md)
- **Evidence:** 'document extraction triggers' with no steps. Grep database per service|anti-corruption: 0.
- **Impact:** Distributed-monolith failures.
- **Fix:** Add an Extract Service pattern: seam, data ownership, ACL, shadow traffic, cutover.
- **Found by:** lens:coverage

### F285: No human-facing documentation workflow (ADR files, README, runbooks)

- **Severity:** medium (was low) · **Kind:** gap · **Category:** coverage
- **Where:** architect:268-287; memory-schema.md:175-213 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** ADRs have no save path, and decisions live only in .opencode.
- **Impact:** Operating knowledge stays agent-private.
- **Fix:** Write docs/adr/NNNN.md plus a small backend-docs skill.
- **Verifier correction:** Restate the gap as: backend-architect produces an architecture overview and ADRs but never persists them anywhere, neither to decisions.md nor to a docs/adr/ path, so architecture decisions can be lost between sessions. There is also no runbook or README template. Acknowledge visualize:720-722 as the existing docs/ precedent. Raise severity to medium because the main deliverable of architect has no persistence step.
- **Found by:** lens:coverage

### C017: Issue and PR templates don't collect what's needed to triage AI-skill bugs or keep releases and translations in sync

- **Severity:** low · **Kind:** gap · **Category:** docs
- **Where:** bug_report.md:10-37; question.md:21-26; PULL_REQUEST_TEMPLATE.md:52-58 (files: .github/ISSUE_TEMPLATE/bug_report.md, .github/ISSUE_TEMPLATE/question.md, .github/PULL_REQUEST_TEMPLATE.md)
- **Evidence:** bug_report.md's reproduction steps are installer-shaped ('1. Install with `...` 2. Run command `...` 3. See error'). Its Environment section (lines 30-37) asks for OS, Node, npm and host app, but not the installed everything-backend version, the host app or model version, the prompt that triggered the skill, `mode=auto` versus interactive, or whether memory existed. It asks for 'full error messages' and pasted output with no warning to redact secrets, even though skills copy env values into memory and reports (F015, F052). question.md:24 asks only for 'Opencode version (if known)', although Cursor and Gemini are advertised. The PR checklist (PULL_REQUEST_TEMPLATE.md:52-58) has no item for bumping package.json or version-changelog, or for updating the four translated READMEs when README.md changes. That drift already exists: backend-refactor is missing from all READMEs (F171).
- **Impact:** Skill-behaviour bugs can't be reproduced without the prompt, version and host. Reporters may paste secrets from memory or report output into public issues. Release and translation drift keeps building up.
- **Fix:** Add fields to bug_report for package version, host and model version, the triggering prompt, mode and memory state, plus a redaction notice. Make question.md host-neutral. Add PR checklist items for the changelog and version bump and for translation sync (or a 'translations need update' label).
- **Found by:** critic

### F090: Skills redefine mode=auto instead of referencing the contract

- **Severity:** low (was medium) · **Kind:** defect · **Category:** consistency
- **Where:** test:28-34; doctor:54-56; tool-rules.md:49 (files: .agents/skills/backend-test/SKILL.md, .agents/skills/backend-doctor/SKILL.md, .agents/skills/_shared/tool-rules.md)
- **Evidence:** test 'Ask for confirmation only if ... adding new tests'. doctor has its own paragraph. migrate and deploy have no pause list.
- **Impact:** Pipelines stall on test authoring, and destructive steps differ by skill.
- **Fix:** Reference the contract and list only skill-specific pause points.
- **Verifier correction:** The impact is limited. tool-rules.md:49 says 'the contract wins', and test:233 points to tool-rules, so the conflict already has a stated resolution, and the extra prompt is a single question. doctor's own paragraph (doctor:54-56) is consistent with the contract: it pauses only for risky fixes such as deleting data, rotating secrets or destructive migrations. That makes it a harmless restatement, not a divergence. Migrate and deploy having no skill-level pause list is not itself a defect, because the contract's pause list (tool-rules.md:38) already covers schema drops and production deploys. Migrate does not mention mode=auto at all, a small clarity gap. Low severity.
- **Found by:** lens:cross-consistency, lens:authoring, pair:test-doctor

### F228: Feature flags are three bullets with no lifecycle or tooling

- **Severity:** low (was medium) · **Kind:** gap · **Category:** coverage
- **Where:** backend-ops/SKILL.md:213-217 (files: .agents/skills/backend-ops/SKILL.md)
- **Evidence:** Grep openfeature|unleash|stale flag: 0.
- **Impact:** Flag debt and unsafe defaults.
- **Fix:** Add OpenFeature, safe defaults, testing both branches, and expiry.
- **Verifier correction:** Partial lifecycle guidance exists at backend-refactor:144-147,239 (flag removal after a strangler-fig migration). The gap is limited to provider abstraction, safe defaults on provider failure, testing both flag states, and expiry/ownership for general-purpose flags. Severity should be low.
- **Found by:** lens:coverage

### F240: No worked input→output examples, especially for routing

- **Severity:** low · **Kind:** gap · **Category:** authoring-quality
- **Where:** orchestrator:28-48; scan:189-249 (files: .agents/skills/backend-orchestrator/SKILL.md)
- **Evidence:** No 'user says X → Y' examples.
- **Impact:** Inconsistent routing.
- **Fix:** Add 3-5 examples per skill and reuse them as evals.
- **Verifier correction:** Narrow the claim. An intent→skill routing table and trigger-phrase lists already exist. What is missing is worked examples for ambiguous or overlapping requests, such as implement vs refactor for 'split this service', api-design vs implement vs auth for 'add a login endpoint', and multi-skill requests.
- **Found by:** lens:authoring

### F241: Descriptions written as imperatives with inconsistent phrasing

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** line 3 of all 14 SKILL.md (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** 'Design API ...', 'Activate when' vs 'Use this skill when'.
- **Impact:** Off-convention and inconsistent.
- **Fix:** Use one third-person template.
- **Found by:** lens:authoring

### F242: Frontmatter has no version, license or compatibility metadata

- **Severity:** low · **Kind:** enhancement · **Category:** versioning
- **Where:** frontmatter lines 1-4 (all 14) (files: .agents/skills/backend-orchestrator/SKILL.md, package.json)
- **Evidence:** name and description only.
- **Impact:** Installs can't be traced, and requirements are undeclared.
- **Fix:** Add license, metadata.version and compatibility.
- **Found by:** lens:authoring

### F243: 'MANDATORY' Step 1.5/1.6 stubs are contentless and numbered differently across skills

- **Severity:** low · **Kind:** defect · **Category:** consistency
- **Where:** api-design:61,67; architect:62,66; db-design:53,57; version-changelog.md:22 (files: .agents/skills/backend-api-design/SKILL.md, .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-db-design/SKILL.md)
- **Evidence:** api-design has 1.5=tools, 1.6=principles; the others are reversed, although the changelog claims this was normalized.
- **Impact:** Ambiguous references and noise.
- **Fix:** Use one pre-step line, then number the real steps.
- **Found by:** lens:cross-consistency, lens:authoring, pair:arch-viz

### F245: Textbook content takes up a large share of several skills

- **Severity:** low · **Kind:** enhancement · **Category:** authoring-quality
- **Where:** architect:72-109,206-287; db-design:63-83; api-design:335-348; ops:60-100; principles.md:16-18 (files: .agents/skills/backend-architect/SKILL.md, .agents/skills/backend-ops/SKILL.md, .agents/skills/_shared/principles.md)
- **Evidence:** Generic pros/cons, a status-code table, and SOLID definitions.
- **Impact:** Token cost with no change in behavior.
- **Fix:** Replace with house rules and move tables to references/.
- **Verifier correction:** Limit the finding to architect:72-109, db-design:63-83 and ops:60-100 (plus principles.md:16 SOLID names and :18 DRY/KISS/YAGNI). Drop architect:206-287, the api-design error table and principles.md:17, which are templates or house rules. Change 'large share' to 'some generic reference material'.
- **Found by:** pair:arch-viz, lens:authoring

### F251: No domain modeling or lifecycle state machines

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** db-design:245,254 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Grep DDD|state machine: 0. Statuses are plain enums.
- **Impact:** Illegal state transitions.
- **Fix:** Add a domain-modeling step with transition rules.
- **Found by:** lens:coverage

### F252: Cost and FinOps only mentioned in passing

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** architect:55,90,294 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** 'cost-sensitive', 'budget' only.
- **Impact:** Bills can't be estimated or monitored.
- **Fix:** Add a cost model and cost observability.
- **Found by:** lens:coverage

### F284: No analytics, ETL/ELT or CDC pipeline guidance

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** backend-architect/SKILL.md:182-186 (files: .agents/skills/backend-architect/SKILL.md)
- **Evidence:** Only 'Consider data warehouse for analytics'.
- **Impact:** Reporting queries hit the primary DB, and PII flows into analytics tools.
- **Fix:** Add event schema, CDC, read replicas and PII rules.
- **Found by:** lens:coverage

### F286: No transactional notifications (email, SMS, push)

- **Severity:** low · **Kind:** gap · **Category:** coverage
- **Where:** backend-implement/SKILL.md:317,325 (files: .agents/skills/backend-implement/SKILL.md)
- **Evidence:** Grep smtp|sendgrid|bounce|unsubscribe: 0.
- **Impact:** Synchronous sends and duplicates on retry.
- **Fix:** Add an adapter, outbox send, idempotency, bounce handling and a local sandbox.
- **Verifier correction:** Narrow the gap to notification-specific concerns that are truly missing: provider bounce and complaint webhook handling, suppression lists, unsubscribe and preference management, template and localisation handling, sender authentication (SPF/DKIM/DMARC) and a local sandbox such as Mailpit for dev and test. Drop the claim that the suite leads to synchronous sends or duplicate sends on retry. backend-implement:317,325 already cover the adapter and after-commit or outbox send. backend-ops:176-187 and _shared/principles.md:27,36,39 already cover idempotent consumers, bounded retries, the DLQ and the outbox.
- **Found by:** lens:coverage
