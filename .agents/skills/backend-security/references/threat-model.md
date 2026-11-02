# Threat Model Template

Read this in Step 2. Fill the tables from memory and the code. Keep it short: a threat model that nobody reads is worse than a one-page one. For a diff or a single feature, fill only the rows the change touches.

## 1. System Summary

```markdown
### System
- Service: <name>, <one-line purpose>
- Exposure: public internet / partner / internal only / mixed
- Deploy target: <from deployment.md or "unknown">
- Auth: <mechanism from api-patterns.md, e.g. session cookie, JWT bearer, API key>
- Tenancy: single tenant / multi-tenant (<isolation model>)
```

"Internal only" is an assumption. Write down what enforces it (network policy, private ingress, mTLS). If nothing enforces it, treat the service as exposed.

## 2. Assets

| Asset | Where it lives | Why it matters | Classification |
|---|---|---|---|
| User credentials (password hashes, MFA secrets) | `users` table | Account takeover | Secret |
| Session and refresh tokens | cookie / `sessions` table | Impersonation | Secret |
| PII (name, email, phone, address) | `users`, `orders` | Privacy law, user trust | Confidential |
| Payment references | `payments` table, provider | Fraud, compliance | Confidential |
| Tenant business data | tenant-scoped tables | Cross-tenant leak | Confidential |
| Admin capabilities | `/admin/*`, CLI | Full compromise | Privileged |
| Service secrets (DB URL, API keys, signing keys) | env, secret manager | Lateral movement | Secret |
| Availability | the API itself | Revenue, SLAs | - |

Replace the example rows with the project's own. Use the classifications Secret, Confidential, Internal, Public, Privileged.

## 3. Actors

| Actor | Trust | Can reach |
|---|---|---|
| Anonymous internet user | none | public routes, login, signup, webhooks endpoint |
| Authenticated user | own data only | user routes |
| User of another tenant | own tenant only | same routes, different tenant |
| Admin / support staff | elevated | admin routes, back office |
| Internal service | service identity | internal endpoints, queues |
| Third-party webhook sender | verified by signature only | webhook routes |
| Compromised dependency or CI job | code execution in build | build secrets, artifacts |

## 4. Entry Points and Trust Boundaries

List every entry point in scope from Step 1. Mark where data crosses a trust boundary.

| # | Entry point | Actor | Auth required | Crosses boundary | Notes |
|---|---|---|---|---|---|
| E1 | `POST /auth/login` | anonymous | no | internet -> API | brute force target |
| E2 | `GET /orders/{id}` | user | yes | internet -> API -> DB | object ownership |
| E3 | `POST /webhooks/stripe` | third party | signature | internet -> API | replay, spoofing |
| E4 | `POST /imports` (URL fetch) | user | yes | API -> internet | SSRF |
| E5 | `orders.created` consumer | internal | broker creds | queue -> worker | poison messages |

Data-flow sketch (text is fine; use `backend-visualize` for a diagram if the user wants one):

```text
[Client] --HTTPS--> [Ingress/LB] --> [API] --> [Postgres]
                                       |--> [Redis]
                                       |--> [Payment provider] (outbound)
[Provider] --webhook--> [API]
[API] --publish--> [Queue] --> [Worker] --> [Email provider]
```

Boundaries to name explicitly: internet to edge, edge to app, app to data stores, app to third parties, tenant to tenant, user to admin plane, CI to production.

## 5. STRIDE Table

One row per entry point or boundary that carries risk. Fill "Existing control" from the code you read, not from intent. "Gap" becomes a lead for Step 3.

| Entry / boundary | S Spoofing | T Tampering | R Repudiation | I Info disclosure | D Denial of service | E Elevation of privilege |
|---|---|---|---|---|---|---|
| E1 login | credential stuffing; control: rate limit? | - | failed logins logged? | user enumeration via messages/timing | bcrypt cost per request | - |
| E2 orders/{id} | - | body edits other user's order | audit log on change? | IDOR read | unbounded list size | role field in body |
| E3 webhook | forged event; control: signature + timestamp | replayed event | event id stored? | verbose errors | large payloads | event triggers admin action |

Then list the gaps:

```markdown
### Threats needing review
| ID | Threat | Entry | STRIDE | Likelihood | Impact | Checked in |
|---|---|---|---|---|---|---|
| T1 | IDOR on order read/update | E2 | I, E | High | High | API1 |
| T2 | Forged webhook events | E3 | S, T | Medium | High | Beyond Top 10: webhooks |
```

Likelihood and Impact are High / Medium / Low. Each threat maps to a Top 10 item or a Beyond the Top 10 check, so Step 3 confirms or dismisses it with evidence.

## 6. Common Threats by Entry-Point Type

Use this as a prompt list, not a checklist to copy.

- **Login, signup, password reset, OTP**: credential stuffing, enumeration, reset token reuse or leakage, OTP brute force, missing lockout or throttling, session fixation.
- **Object routes (`/{id}`)**: IDOR across users and tenants, guessable IDs, update of server-owned fields.
- **List and search**: unbounded page size, expensive filters, injection in sort or filter parameters, data from other tenants.
- **File upload and download**: path traversal, content-type spoofing, stored XSS from served files, oversized files, public buckets.
- **Outbound fetch (webhook targets, URL import, image proxy, PDF render)**: SSRF to metadata services and internal ranges, redirects to internal hosts, DNS rebinding.
- **Inbound webhooks**: spoofing, replay, slow or huge payloads, side effects without idempotency.
- **Queue consumers**: poison messages, unvalidated payloads trusted because they are "internal", replay.
- **Admin and back office**: missing role checks, CSRF on cookie-auth admin panels, no audit trail.
- **GraphQL**: introspection in production, query depth and cost, batching to bypass rate limits, field-level authorization.
- **CI/CD and build**: unpinned actions, secrets exposed to forked PRs, dependency confusion, mutable base images.

## 7. Assumptions and Out of Scope

Write these down so the reader knows what the review does not cover:

```markdown
### Assumptions
- TLS terminates at <load balancer>; traffic inside the VPC is <plain/TLS>.
- Secrets come from <secret manager>; not reviewed: its access policy.

### Out of scope
- Infrastructure accounts and IAM, unless IaC is in the repo.
- Client applications (web, mobile).
- Physical and social engineering threats.
```
