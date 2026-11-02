# Versioning and Deprecation

## Choose a Scheme

Pick one per API, record it in `decisions.md`, and keep it.

| Scheme | Example | Use when |
|---|---|---|
| URL major version | `/api/v1/users` | Default. Easy to route, cache and see in logs. |
| Header or media type | `Accept: application/vnd.example.v2+json` | Clean URLs matter and all clients can set headers. |
| Date-based version header | `Api-Version: 2026-11-01` | Public APIs with many small, frequent changes. Needs per-version transformation layers. |

Only the major version goes in the URL. Additive changes never bump it.

GraphQL normally does not version; it evolves with `@deprecated` (see `graphql.md`). gRPC versions in the package name (`acme.users.v1`, see `grpc.md`).

## Additive vs Breaking Changes

Additive (safe in the current version):
- New endpoint, new optional query parameter, new optional request field.
- New response field (clients must ignore unknown fields; say so in the docs).
- New error code on an existing status, new enum value only if clients were told to handle unknown values.

Breaking (needs a new major version or a deprecation cycle):
- Removing or renaming an endpoint, field, parameter or error code.
- Changing a field's type, format, or meaning; making an optional field required.
- Tightening validation (shorter max length, new required header).
- Changing status codes, auth requirements, pagination style or default sort.
- Adding an enum value when clients were not told to expect new values.

When editing an existing contract, list every change and its class before writing. A breaking change needs explicit user approval.

## Breaking-Change Check in CI

Suggest a diff check that compares the spec on the branch with the spec on the main branch and fails on breaking changes:

- OpenAPI: a spec diff tool such as oasdiff (`oasdiff breaking <base-spec> <new-spec>`).
- Proto: `buf breaking --against '.git#branch=main'`.
- GraphQL: GraphQL Inspector (`graphql-inspector diff <old-schema> <new-schema>`).

Adding the check edits CI configuration, which is Always Ask First. Propose it; do not add it silently.

## Deprecation Process

1. Mark the old endpoint or field deprecated in the contract (`deprecated: true` in OpenAPI, `@deprecated(reason: ...)` in GraphQL, `option deprecated = true;` in proto).
2. Send deprecation headers on every response from the old endpoint:
   - `Deprecation: @<unix-timestamp>` (RFC 9745), the moment it became deprecated.
   - `Sunset: <HTTP-date>` (RFC 8594), when it will stop working.
   - `Link: <https://docs.example.com/migrate-v2>; rel="deprecation"` pointing to migration docs.
3. Tell consumers (changelog, email to API key owners). Measure usage of the old endpoint by consumer.
4. Run old and new versions in parallel until the sunset date and until usage is near zero.
5. After sunset, return 410 Gone with a pointer to the replacement for a while before removing the route.
6. Mark the endpoint deprecated in the `api-patterns.md` inventory (never delete the entry), with the sunset date.

Pick the overlap window with the consumers: weeks for internal clients you control, months for mobile apps (old app versions stay installed) and third parties.
