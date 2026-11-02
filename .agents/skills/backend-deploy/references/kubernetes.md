# Kubernetes and Helm

Generate manifests only when the target is Kubernetes. Writing files is fine; any `kubectl apply/delete/rollout/scale` or `helm install/upgrade/rollback/uninstall` is Always Ask First, and so is `kubectl ... --dry-run=server` (it contacts the cluster). Confirm the kube context and namespace before asking.

## Layout

```text
deploy/k8s/
  base/
    deployment.yaml
    service.yaml
    configmap.yaml
    pdb.yaml
    hpa.yaml
    kustomization.yaml
  overlays/
    staging/kustomization.yaml     # image tag, replicas, resources, config per env
    production/kustomization.yaml
  jobs/
    migrate-job.yaml               # NOT listed in any kustomization; the pipeline applies it per release
```

Keep the migration Job out of the kustomization resources. Otherwise every `kubectl apply -k` would create a migration Job outside the gated migration step.

If the project already uses Helm, add or update `values-<env>.yaml` and the chart templates instead, keeping the same content below. Never commit Secret manifests with real values.

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  labels: { app.kubernetes.io/name: app }
spec:
  replicas: 3
  revisionHistoryLimit: 5
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }
  selector:
    matchLabels: { app.kubernetes.io/name: app }
  template:
    metadata:
      labels: { app.kubernetes.io/name: app }
    spec:
      automountServiceAccountToken: false
      terminationGracePeriodSeconds: 40          # longer than preStop + app drain time
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001                         # the image's numeric UID (1000 for the Node template)
        runAsGroup: 10001
        fsGroup: 10001
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: app
          image: ghcr.io/org/app:<sha>           # set per release; never :latest
          imagePullPolicy: IfNotPresent
          ports:
            - { name: http, containerPort: 3000 }
          envFrom:
            - configMapRef: { name: app-config }
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: app-secrets, key: DATABASE_URL }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 512Mi }            # set a CPU limit only if the cluster policy requires it
          startupProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 5
            failureThreshold: 30                 # up to 150s to start
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
            timeoutSeconds: 2
            failureThreshold: 3
          readinessProbe:
            httpGet: { path: /readyz, port: http }
            periodSeconds: 5
            timeoutSeconds: 2
            failureThreshold: 2
          lifecycle:
            preStop:
              sleep: { seconds: 10 }             # older clusters: exec ["sleep","10"] (needs a shell)
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: tmp
          emptyDir: {}
```

Rules:

- **Probes.** Liveness checks only the process (no database), so a database blip does not restart every pod. Readiness checks hard dependencies with a short timeout and returns 503 while draining. Startup covers slow boots so liveness does not kill a starting pod. Use the app's real routes (Spring Boot: `/actuator/health/liveness` and `/actuator/health/readiness`).
- **Shutdown.** The `preStop` sleep gives load balancers time to stop routing. `terminationGracePeriodSeconds` must exceed the preStop sleep plus the app's drain deadline. The app must handle SIGTERM (see `health-shutdown.md`). The `sleep` lifecycle handler needs Kubernetes 1.30 or later (beta, on by default); on older clusters use `exec` with a shell, or skip preStop for distroless images and rely on the app's readiness flip.
- **Resources.** Always set requests. Set a memory limit. Size from observed usage; start conservative and adjust. Size the database pool so `pool size x replicas (max, including HPA)` stays below the database connection limit, or use a pooler.
- **Security context.** Non-root numeric UID, read-only root filesystem with `emptyDir` for writable paths, all capabilities dropped, no privilege escalation, default seccomp profile, no service account token unless the app calls the Kubernetes API.
- **Image.** Deploy by SHA tag or digest. `:latest` makes rollback impossible.
- **Spread.** For three or more replicas, add `topologySpreadConstraints` across zones (`topology.kubernetes.io/zone`).

## Service, ConfigMap and Secrets

```yaml
apiVersion: v1
kind: Service
metadata: { name: app }
spec:
  selector: { app.kubernetes.io/name: app }
  ports:
    - { name: http, port: 80, targetPort: http }
---
apiVersion: v1
kind: ConfigMap
metadata: { name: app-config }
data:
  NODE_ENV: production
  LOG_LEVEL: info
```

Secrets (`app-secrets` above) never live in git as plain manifests. Pick one and record it in `deployment.md` -> `## Config and Secrets`:

- External Secrets Operator syncing from a cloud secret manager or Vault (preferred).
- Sealed Secrets or SOPS-encrypted files committed to git.
- Secrets created by the platform team or by IaC outside this repo.

Kubernetes Secrets are only base64-encoded. Make sure etcd encryption at rest and RBAC on Secrets are enabled; flag it for backend-security if unknown.

## PodDisruptionBudget and HPA

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: app }
spec:
  minAvailable: 1                 # or maxUnavailable: 1 for larger deployments
  selector:
    matchLabels: { app.kubernetes.io/name: app }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: app }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: app }
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
```

- With an HPA, omit `spec.replicas` from the Deployment in the base and every overlay (drop `replicas: 3` from the example above); otherwise each apply resets the count the HPA chose.
- CPU utilization targets need CPU requests on the container.
- `minAvailable` must be lower than the minimum replica count, or node drains block.

## Migration Job

Runs expand migrations once per release, before the Deployment's image changes. The pipeline creates it, waits for completion, and only then updates the Deployment.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: app-migrate-<sha>          # unique per release; Job specs are immutable
  labels: { app.kubernetes.io/name: app, app.kubernetes.io/component: migrate }
spec:
  backoffLimit: 0                  # never retry a failed migration automatically
  activeDeadlineSeconds: 1800
  ttlSecondsAfterFinished: 86400
  template:
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 10001                 # the image's numeric UID (1000 for the Node template)
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: migrate
          image: ghcr.io/org/app:<sha>     # same image as the release
          command: ["<migrate>", "<args>"] # e.g. ["npx","prisma","migrate","deploy"], ["alembic","upgrade","head"]
          envFrom:
            - configMapRef: { name: app-config }
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: app-secrets, key: DATABASE_URL }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          volumeMounts:
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: tmp
          emptyDir: {}
```

Pipeline order (each command Always Ask First outside an approved pipeline):

```bash
kubectl apply -f deploy/k8s/jobs/migrate-job.yaml   # after setting <sha>
# `kubectl wait --for=condition=complete` alone does not return when the Job fails;
# it blocks until --timeout. Poll for either terminal condition instead:
for i in $(seq 1 360); do                           # 360 x 5 s = 30 min
  state=$(kubectl get job app-migrate-<sha> -o jsonpath='{.status.conditions[?(@.status=="True")].type}')
  case "$state" in
    *Failed*)   echo "migration job failed"; exit 1 ;;
    *Complete*) break ;;
  esac
  [ "$i" -eq 360 ] && { echo "migration job timed out"; exit 1; }
  sleep 5
done
kubectl set image deployment/app app=ghcr.io/org/app:<sha>
kubectl rollout status deployment/app --timeout=5m
```

If the Job fails, the loop exits non-zero and the pipeline stops before the rollout. Read the logs (`kubectl logs job/app-migrate-<sha>`), report, and hand off to backend-migrate. Do not delete and rerun the Job automatically.

The Job's root filesystem is read-only, so the migrate command must not write outside `/tmp`. Tools that write caches to `$HOME` (for example `npx`) need `HOME=/tmp` in `env`, and the tool must be installed in the image: `npx prisma` in an image built with `npm ci --omit=dev` fails if `prisma` is a devDependency, so use a migration stage or image (`ci-pipelines.md`).

Never use an init container for migrations in a multi-replica Deployment: every pod would run them, and a rollout would race old and new pods against a half-migrated schema.

## Helm

For a Helm chart, run the same Job as a hook:

```yaml
metadata:
  annotations:
    "helm.sh/hook": pre-install,pre-upgrade
    "helm.sh/hook-weight": "-5"
    "helm.sh/hook-delete-policy": before-hook-creation
```

- `pre-install`/`pre-upgrade` hooks run before any of the release's normal resources are created or updated, so the ConfigMap and Secret the Job reads must already exist. Either create them outside the chart, or make them hooks too (same hook events, lower `hook-weight`); a hook weight has no effect on non-hook resources.
- `helm rollback` does not roll back a migration. See `release-rollback.md`.
- Keep per-environment values in `values-<env>.yaml`: image tag, replicas, resources, ingress host, config. No secrets in values files.

Typical values keys to generate or check: `image.repository`, `image.tag`, `replicaCount`, `resources`, `podSecurityContext`, `securityContext`, `probes` (liveness, readiness, startup), `autoscaling` (enabled, min, max, target), `podDisruptionBudget`, `migrations.enabled`, `migrations.command`, `envFrom`, `existingSecret`.

## Validation (local, runs without asking)

```bash
kubectl kustomize deploy/k8s/overlays/staging | kubeconform -strict -summary -ignore-missing-schemas -
helm lint deploy/helm/app -f deploy/helm/app/values-staging.yaml
helm template app deploy/helm/app -f deploy/helm/app/values-staging.yaml | kubeconform -strict -summary -
```

`kubectl kustomize` (or `kustomize build`) renders locally without contacting the cluster. If `kubeconform` or `helm` is not installed, report the check as "not run" and suggest installing it. Policy tools (kube-linter, Polaris, Kyverno CLI) are optional extras.
