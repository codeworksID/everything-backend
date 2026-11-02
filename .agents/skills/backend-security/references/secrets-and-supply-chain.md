# Secrets, Dependencies and Supply Chain

Read this in Steps 4 and 5. Check whether each tool is installed with a quick version probe (`gitleaks version`, `trufflehog --version`, `syft version`, `trivy --version`, `grype version`, `semgrep --version`). Use only tools that are already installed. Installing one (including `npx`, `pipx run`, `go run`, `docker run` of an image not present locally) is Always Ask First.

Scanner reports go to a temp directory outside the project (for example the OS temp folder), never into the repository, and are deleted after triage. `$TMP` below means that folder: in bash use `${TMPDIR:-/tmp}` if `$TMP` is unset; in PowerShell use `$env:TEMP`. Scanners exit non-zero when they find something; that is a result, not a tool error.

## Secrets

### Rules

- Never print, copy or store a secret value. Report `file:line` (or `commit file`) and the secret type.
- Turn on redaction and turn off live verification. Verification sends the secret to its provider.
- A secret found only in history is still leaked. Recommend rotation first. Rewriting history (`git filter-repo`, BFG) and force pushes are the user's decision and Always Ask First.

### 1. Tracked files that should not be committed

```bash
git ls-files | grep -Ei '(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|id_ed25519.*|credentials.*\.json|.*\.p12|.*\.pfx|.*\.keystore|service-account.*\.json)$' | grep -Eiv '\.env\.(example|sample|template)$'
```

PowerShell: `git ls-files | Where-Object { $_ -match '(^|/)(\.env(\..*)?|.*\.pem|.*\.key|id_rsa.*|id_ed25519.*|credentials.*\.json|.*\.p12|.*\.pfx|.*\.keystore|service-account.*\.json)$' -and $_ -notmatch '\.env\.(example|sample|template)$' }`

Also list secret-like files that were ever added, even if deleted later:

```bash
git log --all --diff-filter=A --name-only --format= -- '*.env' '*.env.*' '*.pem' '*.key' '*id_rsa*' '*credentials*.json' '*.p12' '*.pfx' | grep -Eiv '\.env\.(example|sample|template)$' | sort -u
```

Confirm `.gitignore` covers `.env*` (except the example files) and key files.

### 2. Scanner (preferred)

gitleaks (newer releases use `git` and `dir` subcommands; older ones use `detect`):

```bash
gitleaks git --redact --report-format json --report-path "$TMP/gitleaks-history.json" .
gitleaks dir --redact --report-format json --report-path "$TMP/gitleaks-tree.json" .
# older releases
gitleaks detect --source . --redact --report-format json --report-path "$TMP/gitleaks-history.json"
gitleaks detect --source . --no-git --redact --report-format json --report-path "$TMP/gitleaks-tree.json"
```

Read only `File`, `StartLine`, `RuleID`, `Commit` from the report. Respect an existing `.gitleaks.toml` and `.gitleaksignore`.

trufflehog (its JSON contains the raw secret, so extract fields without printing the rest):

```bash
trufflehog git file://. --no-verification --json > "$TMP/th.jsonl"
trufflehog filesystem . --no-verification --json > "$TMP/th-fs.jsonl"
node -e "process.argv.slice(1).forEach(f=>require('fs').readFileSync(f,'utf8').split('\n').filter(Boolean).forEach(l=>{try{const j=JSON.parse(l);const d=j.SourceMetadata&&j.SourceMetadata.Data||{};const g=d.Git||d.Filesystem||{};console.log([g.file,g.line,j.DetectorName,(g.commit||'').slice(0,8)].join(' '))}catch(e){}}))" "$TMP/th.jsonl" "$TMP/th-fs.jsonl"
```

Delete the temp files after triage.

### 3. Manual search (no scanner)

`-o -r '[REDACTED]'` makes ripgrep print only `file:line:col:[REDACTED]`, never the match:

```bash
rg -n --hidden -g '!.git' -o -r '[REDACTED]' \
  -e 'AKIA[0-9A-Z]{16}' \
  -e '-----BEGIN [A-Z ]*PRIVATE KEY-----' \
  -e 'gh[pousr]_[A-Za-z0-9]{36,}' -e 'github_pat_[A-Za-z0-9_]{20,}' \
  -e 'xox[abposr]-[A-Za-z0-9-]{10,}' \
  -e '(sk|rk)_live_[0-9A-Za-z]{20,}' \
  -e 'AIza[0-9A-Za-z_-]{35}' \
  -e '[a-z][a-z0-9+.-]*://[^:/\s"]+:[^@/\s"]{3,}@' \
  -e '(?i)(password|passwd|secret|api_?key|access_?token|private_?key)\s*[:=]\s*["'"'"'][^"'"'"'\s]{8,}'
```

PowerShell (prints path and line number only):

```powershell
Get-ChildItem -Recurse -File -Exclude *.lock | Where-Object { $_.FullName -notmatch '\\(\.git|node_modules|\.venv|venv|dist|build)\\' } |
  Select-String -Pattern 'AKIA[0-9A-Z]{16}','-----BEGIN [A-Z ]*PRIVATE KEY-----','sk_live_[0-9A-Za-z]{20,}' |
  ForEach-Object { "$($_.Path):$($_.LineNumber)" }
```

History without printing contents (patterns kept simple so they work as git's default regex):

```bash
git log --all -G 'AKIA[0-9A-Z]' --format='%h %ad' --date=short --name-only
git log --all -G 'BEGIN [A-Z ]*PRIVATE KEY' --format='%h %ad' --date=short --name-only
git log --all -G 'sk_live_' --format='%h %ad' --date=short --name-only
```

Triage each hit by reading the line yourself: test fixtures with fake values, documented example keys and placeholders (`changeme`, `xxx`, `<token>`) are false positives. Do not quote the line in the report.

### Severity for secrets

- Live-looking production credential (cloud keys, payment live keys, DB URL with password, private signing key) in the working tree: **Critical**.
- The same in history only: **High** (rotation still required).
- Test or sandbox keys, internal low-value tokens: **Medium**.
- Secret files not ignored but not committed: **Low**.

## Dependencies

Run only the read-only audit modes allowed by `<shared>/tool-rules.md` -> Runs Without Asking. Never run `npm audit fix`, `--force` or any upgrade: those change dependencies and are Always Ask First.

| Stack | Command | Notes |
|---|---|---|
| npm | `npm audit --json` (add `--omit=dev` for the production view) | needs `package-lock.json` |
| pnpm | `pnpm audit --json` | |
| Yarn 1 | `yarn audit --json` | |
| Yarn 2+ | `yarn npm audit --all --recursive --json` | |
| Python (installed env) | `pip-audit` inside the project's virtualenv | `pip-audit -r requirements.txt` builds a temp env: Always Ask First |
| Go | `govulncheck ./...` | reports whether vulnerable code is actually called |
| Rust | `cargo audit` | |
| Ruby | `bundle audit check` | `--update` fetches the advisory DB |
| .NET | `dotnet list package --vulnerable --include-transitive` | |
| Java | the OWASP dependency-check or similar plugin, only if already configured in the build | first run downloads a large DB; ask if not configured |
| Any | `osv-scanner scan source -r .` (older releases: `osv-scanner -r .`) | if installed |

These commands contact the advisory database online. That sends package names and versions, not source code; it is allowed.

Report per vulnerability: package, installed version, fixed version, severity, direct or transitive, dev-only or production, and whether the vulnerable code is reachable when the tool says so. Adjust severity with evidence only: a dev-only tool that never ships in the production image can drop one level; say why.

## SBOM

If `syft` is installed:

```bash
syft dir:. -o cyclonedx-json="$TMP/sbom.cdx.json"
syft docker:<local-image> -o cyclonedx-json="$TMP/sbom-image.cdx.json"
```

Alternative: `trivy fs --format cyclonedx --output "$TMP/sbom.cdx.json" .`

Keep the SBOM out of the repo unless the user asks; then save it as `docs/security/sbom-<YYYYMMDD>.cdx.json` and record it in the checkpoint. Recommend generating the SBOM in CI on every release (`backend-deploy`).

## Container Images and IaC

Scan a locally built image only. Pulling from a private registry or building an image is asked first. Both tools fall back to pulling from a registry when the image is not in the local daemon, so force the local source:

```bash
trivy image --image-src docker --scanners vuln --severity HIGH,CRITICAL <local-image>
trivy fs --scanners vuln,misconfig .
trivy config .            # Dockerfile, Kubernetes, Helm, Terraform misconfiguration
grype docker:<local-image>
grype dir:.
```

Trivy downloads its vulnerability DB on first run. Do not enable trivy's secret scanner here; Step 4 handles secrets with redaction.

## Pinning and Build Integrity

Search and read:

- Lockfile present and tracked: `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `poetry.lock`, `uv.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, `Gemfile.lock`, `packages.lock.json`. Missing lockfile in a deployable service: **Medium**.
- Lockfile used in CI and Dockerfiles: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, `pip install --require-hashes` or `uv sync --frozen`, `poetry install --no-update`-style flags. `npm install` in a Dockerfile or CI: **Low/Medium**.
- Base images: `FROM .*:latest` or `FROM <image>` without a tag: **Medium**. Tag without digest: **Low** (recommend `@sha256:` pinning with an update bot).
- Remote scripts: `curl .*\|\s*(ba)?sh`, `wget .*\|\s*sh`, `iwr .*\|\s*iex` in Dockerfiles, CI or setup scripts: **High** unless a checksum is verified.
- Dependency confusion: private package scopes without a scoped registry in `.npmrc`; `--extra-index-url` in pip config or requirements: **Medium**.
- Container runs as root (no `USER` in the final stage): see the config reference.

## CI/CD

GitHub Actions (`.github/workflows/*.yml`):

- Third-party actions not pinned to a full 40-character commit SHA: `uses:\s*[^@\s]+@(?![0-9a-f]{40}\b)` needs `rg -P`; without PCRE, list `uses:` lines and check by eye. Third-party action with access to secrets: **Medium**; first-party `actions/*` on a tag: **Low**.
- No top-level `permissions:` block (token may get broad default rights): **Medium**. Recommend `permissions: contents: read` and per-job grants.
- `pull_request_target` or `workflow_run` that checks out the PR head (`github.event.pull_request.head`) and runs its code with secrets: **Critical**.
- Untrusted event fields interpolated into `run:` scripts (`\$\{\{\s*github\.event\.(issue|pull_request|comment|review|head_commit)\.`): script injection, **High**. Fix: pass through `env:` and quote.
- Secrets printed or written to artifacts (`echo .*secrets\.`), long-lived cloud keys where OIDC is available: **Medium**.

GitLab CI, CircleCI and others: same ideas (pinned images, protected variables, no untrusted MR code with secrets).

Update automation: `.github/dependabot.yml`, `renovate.json`, `.renovaterc*`. Missing: **Low**, recommend one.

Release integrity (recommendations for `backend-deploy`, not findings unless the threat model needs them): SBOM per release, image scanning gate, image signing with cosign, provenance attestations.

Editing CI files is Always Ask First; this skill reports and hands the change to `backend-deploy`.

## Licenses

A compliance flag for the team, not legal advice. Check only when the service is proprietary or distributed; ask the user for the license policy if one exists.

Node (lockfile v2+ records licenses; no install needed):

```bash
node -e "const l=require('./package-lock.json');const c={};for(const[k,v]of Object.entries(l.packages||{})){if(!k)continue;const lic=v.license||'UNKNOWN';(c[lic]=c[lic]||[]).push(k.replace(/^.*node_modules\//,''))}for(const[k,v]of Object.entries(c))console.log(k,v.length,/GPL|AGPL|SSPL|UNKNOWN|UNLICENSED/i.test(k)?v.slice(0,20).join(' '):'')"
```

Python (installed env, no install needed):

```bash
python -c "import importlib.metadata as m; [print(d.metadata['Name'], '|', d.metadata.get('License-Expression') or d.metadata.get('License') or [c for c in (d.metadata.get_all('Classifier') or []) if c.startswith('License')]) for d in m.distributions()]"
```

Go: `go-licenses report ./...` if installed. Others: the package manager's license report if available (`pip-licenses`, `cargo deny check licenses`, `license_finder`), only if installed.

Classification:
- AGPL, SSPL, GPL (strong copyleft) in a proprietary service, or unknown/unlicensed packages: **High**, owner: the team's legal or compliance contact; engineering follow-up via `backend-implement` (replace the package).
- LGPL, MPL, EPL (weak copyleft): **Low**, note the obligations.
- Permissive (MIT, BSD, Apache-2.0, ISC): no finding.
