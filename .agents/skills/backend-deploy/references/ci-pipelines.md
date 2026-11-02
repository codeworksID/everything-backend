# CI/CD Pipelines

Creating or editing pipeline files is Always Ask First: show the full file (or the diff for an existing one) and wait for approval.

## Pipeline Shape

```text
pull request:  lint -> type-check -> test -> build image (no push) -> scan
main branch:   test -> build and push image (tag = commit SHA)
               -> staging: migrate (expand) -> deploy -> verify
               -> production (approval): migrate (expand) -> deploy -> verify
later release: contract migrations, manual trigger only, after the Contract Gate
```

Rules:

- **Build once, promote the same image.** Tag with the full commit SHA. Staging and production deploy the same digest; only configuration differs.
- **Use the project's real scripts.** Read `package.json` scripts, `Makefile`, `pyproject.toml`, `pom.xml` or `build.gradle` and call what exists. Do not invent `test:ci` or `lint` if the project lacks them; report the gap instead.
- **Least-privilege tokens.** Set `permissions:` per workflow and per job. Grant `packages: write` only to the job that pushes, and `id-token: write` only to jobs that use OIDC.
- **OIDC, not static cloud keys.** Use the cloud's OIDC federation (AWS, GCP, Azure all support GitHub and GitLab OIDC) instead of long-lived access keys in CI secrets.
- **Protected production.** Production jobs use a protected environment with required reviewers (GitHub) or a protected environment plus a manual job (GitLab).
- **One deploy at a time per environment.** Use a concurrency group (GitHub) or `resource_group` (GitLab).
- **Pin actions and images.** Use each action's current major version, or a full commit SHA for third-party actions, and let Dependabot or Renovate update them. Check the action's README for its current major before writing the file.

## Migration Step

Required whenever the service has a database. backend-migrate writes and labels the migrations; this step only runs them.

- Runs once per environment per release, as its own job, before the deploy job (`needs: migrate`). Never inside the app's start command or on every replica.
- Runs only `pre-deploy` (expand) migrations from the `## Migration Phases` plan. `post-deploy` (contract) migrations never run in the automatic pipeline.
- Most tools (`prisma migrate deploy`, `alembic upgrade head`, `flyway migrate`, `migrate up`, Rails and Django `migrate`) apply every pending file and cannot filter by label. So a contract migration file must not be in the migrations directory on the deployed branch until the release where it is meant to run, after the Contract Gate. If it has to be committed earlier, keep it outside the tool's path, or give the job an explicit target (`alembic upgrade <rev>`, `flyway -target=<version>`, `migrate up <n>`) and check the pending list before applying.
- Uses the image built in this run (same SHA), so the migrations match the code.
- Holds a lock: one concurrency group per environment, and the tool's own migration lock where it has one (for example Prisma Migrate, Flyway, Liquibase, golang-migrate). If unsure whether the tool locks, rely on the concurrency group and never run two pipelines at once.
- Sets a statement or lock timeout through the migration files themselves (backend-migrate adds them).
- Production runs only after approval through the protected environment.
- If the database is reachable only from inside the cluster or VPC, run the step as a Kubernetes Job (see `kubernetes.md`) or a one-off platform task (for example `fly machine run`, an ECS run-task, a Cloud Run job) instead of from the CI runner.
- If the migration job fails, the deploy job does not run. Report it and hand off to backend-migrate; do not retry automatically.

## GitHub Actions

`.github/workflows/ci.yml` (validation on every pull request and push):

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc      # or package.json; never a hard-coded EOL version
          cache: npm
      - run: npm ci
      - run: npm run lint                # only scripts that exist in package.json
      - run: npm test
      - run: npm run build
  image:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: false
          load: true
          tags: app:ci
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

For Python use `actions/setup-python` with `python-version-file`, Go `actions/setup-go` with `go-version-file: go.mod`, Java `actions/setup-java` with the toolchain release and `cache: maven` or `gradle`.

`.github/workflows/deploy.yml` (main branch and manual runs):

```yaml
name: deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
# One release at a time: run B's migrate job must not start while run A is still
# migrating or deploying. Per-job groups alone do not serialize migrate and deploy.
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      image: ${{ steps.meta.outputs.image }}
    steps:
      - uses: actions/checkout@v4
      - id: meta
        run: echo "image=ghcr.io/${GITHUB_REPOSITORY,,}:${GITHUB_SHA}" >> "$GITHUB_OUTPUT"   # registry names must be lowercase
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.image }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: true
          sbom: true

  migrate-staging:
    needs: build
    runs-on: ubuntu-latest
    environment: staging
    concurrency: { group: migrate-staging, cancel-in-progress: false }
    permissions: { contents: read, packages: read }
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Run expand migrations
        run: >
          docker run --rm -e DATABASE_URL="$DATABASE_URL"
          "${{ needs.build.outputs.image }}" <migrate command>
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy-staging:
    needs: [build, migrate-staging]
    runs-on: ubuntu-latest
    environment: staging
    concurrency: { group: deploy-staging, cancel-in-progress: false }
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      # Authenticate with the cloud via OIDC (aws-actions/configure-aws-credentials,
      # google-github-actions/auth, azure/login), then deploy. Pick one:
      - run: <deploy command for the target, see "Deploy Commands">
      - name: Smoke test
        run: ./scripts/smoke.sh "${{ vars.BASE_URL }}"

  migrate-production:
    needs: [build, deploy-staging]
    runs-on: ubuntu-latest
    environment: production          # required reviewers configured on this environment
    concurrency: { group: migrate-production, cancel-in-progress: false }
    permissions: { contents: read, packages: read }
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: >
          docker run --rm -e DATABASE_URL="$DATABASE_URL"
          "${{ needs.build.outputs.image }}" <migrate command>
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

  deploy-production:
    needs: [build, migrate-production]
    runs-on: ubuntu-latest
    environment: production
    concurrency: { group: deploy-production, cancel-in-progress: false }
    permissions: { contents: read, id-token: write }
    steps:
      - uses: actions/checkout@v4
      - run: <deploy command for the target>
      - name: Smoke test
        run: ./scripts/smoke.sh "${{ vars.BASE_URL }}"
```

- Replace `<migrate command>` with the tool's apply command (for example `npx prisma migrate deploy`, `alembic upgrade head`, `migrate -path /migrations -database "$DATABASE_URL" up`, `flyway migrate`). If the runtime image lacks the tool, build a separate migration image or stage (`--target`) in the build job.
- If the service has no database, delete the migrate jobs and the `needs` on them.
- `./scripts/smoke.sh` is a small script this skill writes: it polls the readiness route and calls one or two read-only endpoints, failing on any non-2xx (see `release-rollback.md`).
- Contract migrations: a separate `migrate-contract.yml` with only `workflow_dispatch`, the `production` environment, and an input naming the phase-plan entry. Never trigger it from `push`.
- For a private GHCR package, the deploy target needs pull credentials (an image pull secret in Kubernetes).

## GitLab CI

```yaml
stages: [test, build, migrate, deploy, verify]

variables:
  IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  DOCKER_TLS_CERTDIR: "/certs"

workflow:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

test:
  stage: test
  image: node:<node-major>-slim         # the project's runtime version
  cache:
    key: { files: [package-lock.json] }
    paths: [.npm/]
  script:
    - npm ci --cache .npm --prefer-offline
    - npm run lint
    - npm test

build:
  stage: build
  image: docker:<docker-major>           # current stable Docker release
  services: [docker:<docker-major>-dind]
  before_script:
    - echo "$CI_REGISTRY_PASSWORD" | docker login -u "$CI_REGISTRY_USER" --password-stdin "$CI_REGISTRY"
  script:
    - docker build -t "$IMAGE" .
    - docker push "$IMAGE"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

.migrate:
  stage: migrate
  image: $IMAGE
  script:
    - <migrate command>

migrate-production:
  extends: .migrate
  environment: { name: production, action: prepare }
  resource_group: production
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
  allow_failure: false

deploy-production:
  stage: deploy
  needs: [build, migrate-production]
  environment: { name: production, url: $BASE_URL }
  resource_group: production
  script:
    - <deploy command for the target>
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

verify-production:
  stage: verify
  needs: [deploy-production]
  script:
    - ./scripts/smoke.sh "$BASE_URL"
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

- Prefer `rules:` over the legacy `only:`/`except:`.
- Mark the `production` environment as protected and limit who can run the manual migrate job.
- `DATABASE_URL` comes from a masked, protected CI/CD variable scoped to the environment.
- Add a staging copy of the migrate, deploy and verify jobs before production, following the same pattern.
- Rootless alternatives to Docker-in-Docker: Kaniko or Buildah, if the runners do not allow privileged mode.

## Deploy Commands

Use the one for the chosen target; each is Always Ask First when an agent runs it, and runs in CI only after the user approves the pipeline file.

| Target | Command shape |
|---|---|
| Kubernetes, plain manifests | `kubectl set image deployment/<app> app=$IMAGE` then `kubectl rollout status deployment/<app> --timeout=5m` |
| Kubernetes, Helm | `helm upgrade --install <app> <chart> -f values-<env>.yaml --set image.tag=$SHA --wait --timeout 10m` (add `--atomic` to roll back automatically on failure; newer Helm majors may rename this flag, so check `helm upgrade --help`) |
| Fly.io | `fly deploy --image $IMAGE` |
| Cloud Run | `gcloud run deploy <service> --image $IMAGE --region <region>` |
| AWS ECS | update the task definition with the new image and `aws ecs update-service`, or the ECS deploy action |
| VM with compose | `ssh` to the host, `docker compose pull && docker compose up -d --wait` |
| Serverless Framework / SAM | `serverless deploy --stage <env>` / `sam deploy --config-env <env>` |

## Supply-Chain Steps

backend-security owns the policy; the pipeline carries the steps. Add what the project accepts:

- Image vulnerability scan (Trivy or Grype) on the built image, failing on critical findings with a fix available.
- SBOM and provenance (`sbom: true`, `provenance: true` in build-push-action, or `syft`).
- Image signing with cosign keyless (OIDC) if the cluster verifies signatures.
- Secret scanning (gitleaks) on pull requests.
- Dependency update bot (Dependabot or Renovate) covering the package manager, Dockerfile base images and CI actions.
- Dependency license check per stack, if the project has a license policy.
