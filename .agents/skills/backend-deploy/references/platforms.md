# Platforms

Detail for step 2 (choose the strategy). Whatever the target: build one image or artifact per commit, promote it through environments, keep config and secrets out of the artifact, and run migrations as a separate gated step.

Config comes in three layers: base config in the repo, runtime values (secrets, URLs) injected from a secret manager or CI/platform variables, and per-environment overrides only where needed. Inject secrets through the platform's mechanism (Kubernetes Secrets synced from a manager, Docker secrets, PaaS secret store, CI secret variables), never baked into the image. Require approval or branch protection for production deploys.

## Choosing

| Question | Leans toward |
|---|---|
| Does the team want to run servers or clusters? No | PaaS or serverless |
| Long-lived connections (WebSockets, streaming), background workers, steady traffic | PaaS, VM or Kubernetes (not functions) |
| Many independently deployed services, autoscaling, platform team or managed cluster | Kubernetes |
| Traffic near zero most of the time, event-driven, short requests | Serverless |
| Strict data residency or on-prem | VM or Kubernetes in the required region |
| Existing platform in `decisions.md` or existing artifacts | Keep it unless the user asks to change |

When the answer is unclear, present the top two options with cost, ops effort and scaling trade-offs, and ask. Record the choice in `decisions.md`.

## PaaS (Fly.io, Render, Railway, Heroku, Cloud Run, App Runner, Azure Container Apps)

- Deploy the same container image built by CI (most PaaS accept an image) rather than a platform-side build, so staging and production run identical bits.
- Configure the health check path to the readiness route and the port the app listens on (many platforms inject `PORT`; the app must read it).
- Migrations: use the platform's release or pre-deploy command (Heroku and Render release phase, Fly `release_command`) or a one-off job (Cloud Run jobs). These run once per release, not per instance. Gate production with the platform's or CI's approval.
- Keep platform config in the repo (`fly.toml`, `render.yaml`, `app.yaml`, `Procfile`) and edit it like any deployment file (diff, ask before overwriting).
- Secrets: the platform's secret store, set by the user. Never write values into the config file.
- Rollback: the platform's previous release or revision (see `release-rollback.md`).

## Containers on a VM

- Compose (`compose.yaml` plus a production override) or systemd units running containers, behind a reverse proxy (Caddy, Nginx, Traefik) that terminates TLS.
- Deploy: pull the SHA-tagged image, run the migration container once, then `docker compose up -d --wait`. Single-host compose restarts containers, so expect a brief blip unless you run two app replicas behind the proxy.
- Secrets: files with tight permissions or a secret manager agent on the host; never in the compose file in git.
- Backups, OS patching, monitoring and disk space are the team's job; route them to backend-ops.
- Graduate to a PaaS or Kubernetes when you need more than one host or zero-downtime deploys.

## Kubernetes

See `kubernetes.md`. Prefer a managed control plane (EKS, GKE, AKS). Use plain manifests with Kustomize overlays for one or two services; use Helm when the project already has charts or needs packaging for others. GitOps (Argo CD, Flux) is a good fit when the team already runs it: then CI updates the image tag in the GitOps repo instead of calling `kubectl`.

## Serverless Functions (Lambda, Cloud Functions, Azure Functions)

- **Handlers**: thin handler that calls the same service layer as the HTTP app; initialize clients outside the handler for reuse across invocations.
- **Database connections**: functions scale out fast and exhaust connection limits. Use a pooler or proxy (RDS Proxy, PgBouncer, Neon or Supabase poolers, Cloud SQL connector limits) or an HTTP-based data API, and keep pool size at 1 per instance.
- **Limits**: execution timeout, payload size, memory, cold starts. Long jobs go to queues or containers.
- **Events**: triggers are at-least-once; make handlers idempotent (backend-ops).
- **Tooling**: AWS SAM, Serverless Framework, SST, CDK, or Terraform. Keep one in the repo, deploy per stage (`--stage` or config env), and gate production.
- **Migrations**: never inside a function cold start. Run them from CI or a one-off task before shifting traffic.
- **Release**: use versions and aliases (Lambda) or traffic splitting for canaries; rollback moves the alias back.

## Infrastructure as Code

backend-deploy writes the app's deployment files. Provisioning cloud resources (networks, clusters, databases, buckets) is infrastructure as code. When the user asks for it:

- Keep it in a separate folder (`infra/`) with remote state and state locking, one state per environment.
- Run `terraform fmt -check`, `terraform validate` and `terraform plan` (or `tofu`, `pulumi preview`) locally or in a pull request. `plan` and `preview` read the live cloud account, so ask before running them against a real account.
- `apply`, `destroy` and `pulumi up` are Always Ask First and belong in a gated pipeline job, after the plan is reviewed.
- Authenticate CI with OIDC, not static keys.
- If the request is large (a whole platform), say it is beyond this skill's templates, produce a minimal module for the app's own needs (registry, service, database reference, secrets), and recommend a platform review.
