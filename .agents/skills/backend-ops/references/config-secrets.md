# Config, Feature Flags and Secrets

## Environment Validation

- Load all config once at startup into a typed object and fail fast on missing or invalid values. Do not read environment variables ad hoc throughout the code.
- Validate types, ranges and allowed values. Typical tools: `zod` or `envalid` (Node), `pydantic-settings` `BaseSettings` (Python), `envconfig` or `caarlos0/env` (Go), `@ConfigurationProperties` with `@Validated` (Spring).
- Keep safe defaults for development only. Secrets have no defaults.
- Error messages name the missing variable, never its value.

## Multi-Environment Config

- Build one artifact or image and promote it across environments; only config changes.
- Environment-specific values come from environment variables, mounted files or the platform's config store, not from code branches on `NODE_ENV` or similar.
- Document every variable in a non-secret template (`.env.example`) with a placeholder and a one-line description. Creating or editing `.env*` files other than the example template is Always Ask First.

## Feature Flags

- Use flags for gradual rollout, kill switches and experiments.
- Keep flag state outside the deploy pipeline (a flag service or a config table) so it can change without a release.
- Give every flag an owner and a removal date; delete stale flags.
- Audit flag changes. Kill switches default to the safe state if the flag service is unreachable.

## Secrets

Injection:
- Never commit secrets. Load them from a secret manager (AWS Secrets Manager or SSM Parameter Store, GCP Secret Manager, Azure Key Vault, HashiCorp Vault) at startup or via the platform's injection.
- On Kubernetes, plain `Secret` objects are only base64-encoded. Enable encryption at rest for etcd, restrict RBAC on secrets, and prefer syncing from a manager (External Secrets Operator, the CSI secrets store driver) or SOPS-encrypted manifests.
- CI and deploy jobs should use short-lived OIDC federation to the cloud provider instead of long-lived keys stored as CI secrets. Pipeline changes belong to `backend-deploy`.
- Never print secrets in logs, error messages, health or metrics endpoints, memory files or reports. When showing evidence, mask values: first 4 characters, then `****`, then the length.

Rotation:
- Support two valid credentials at once so rotation needs no downtime: add the new one, roll the app, revoke the old one. For signing keys, publish both and select by key id (`kid`).
- Record the rotation interval per secret type in `decisions.md`.
- Rotating a secret is Always Ask First.

Leak response (when a secret is found in code, history, logs or an image):
1. Report it as Critical with the value masked.
2. Revoke or rotate the secret first. Removing it from the code does not help: it is already in git history, caches and forks. Rotation asks first.
3. Remove it from the code and load it from the secret manager.
4. Optionally scrub history (`git filter-repo` or BFG) after the user approves; it rewrites history and needs a force-push, which is Always Ask First.
5. Check access logs for use of the leaked credential.
6. Log the finding in `issues.md` (masked) and hand deeper review to `backend-security`.
