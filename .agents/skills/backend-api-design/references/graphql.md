# GraphQL Contracts (Basic)

Basic guidance: schema shape, errors, limits and evolution. For server-specific setup, follow the chosen framework's docs.

Default path: the existing schema file, or `docs/api/schema.graphql` (schema-first). In code-first projects (schema built from code types or decorators), design in that form and treat the printed schema as the artifact.

## Schema Example

All referenced types are defined, so this compiles as written.

```graphql
scalar DateTime

type Query {
  me: User
  user(id: ID!): User
  users(first: Int = 20, after: String, filter: UserFilter, orderBy: UserOrder): UserConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): CreateUserPayload!
  updateUser(input: UpdateUserInput!): UpdateUserPayload!
  deleteUser(input: DeleteUserInput!): DeleteUserPayload!
}

type User {
  id: ID!
  email: String!
  name: String!
  createdAt: DateTime!
  posts(first: Int = 20, after: String): PostConnection!
}

type Post {
  id: ID!
  title: String!
  author: User!
  publishedAt: DateTime
}

input UserFilter {
  nameContains: String   # server enforces maxLength 100, escapes % and _
  createdAfter: DateTime
  status: UserStatus
}

enum UserStatus {
  ACTIVE
  SUSPENDED
}

enum UserOrderField {
  CREATED_AT
  NAME
}

enum OrderDirection {
  ASC
  DESC
}

input UserOrder {
  field: UserOrderField! = CREATED_AT
  direction: OrderDirection! = DESC
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

type UserEdge {
  cursor: String!
  node: User!
}

type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
}

type PostEdge {
  cursor: String!
  node: Post!
}

type PostConnection {
  edges: [PostEdge!]!
  pageInfo: PageInfo!
}

input CreateUserInput {
  email: String!
  name: String!
}

input UpdateUserInput {
  id: ID!
  name: String
}

input DeleteUserInput {
  id: ID!
}

type UserError {
  code: String!
  message: String!
  field: [String!]
}

type CreateUserPayload {
  user: User
  errors: [UserError!]!
}

type UpdateUserPayload {
  user: User
  errors: [UserError!]!
}

type DeleteUserPayload {
  deletedId: ID
  errors: [UserError!]!
}
```

## Conventions

- One input type and one payload type per mutation. Inputs list only client-writable fields.
- Lists that can grow use cursor connections (`first`/`after`, `edges`, `pageInfo`) with a maximum `first` (for example 100), enforced on the server.
- Fields are camelCase, types PascalCase, enum values UPPER_CASE.
- Use `ID` for identifiers and a custom `DateTime` scalar serialized as RFC 3339 UTC.

## Error Model

- Expected business failures (validation, conflicts, not allowed for this item) go in the payload's `errors` list, so clients handle them as data.
- Unexpected failures and auth failures go in the top-level `errors` array with `extensions.code` (for example `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_USER_INPUT`, `INTERNAL_SERVER_ERROR`).
- Never expose stack traces or internal messages in `errors[].message` in production; mask them and log with the request ID.

## Limits and Abuse Controls

A single GraphQL request can be very expensive. Define in the contract:

- Maximum query depth (for example 10) and a query cost or complexity limit, with list fields costed by their `first` argument.
- Maximum page size on every connection (reject `first` above it).
- Sort fields and directions are GraphQL enums; filters are typed input fields. Never a `String` that holds a column name, an ORDER BY, a `where` expression or a JSON query (`_shared/sql-safety.md` rules 2, 9). String inputs used in search have a documented max length that resolvers enforce (GraphQL has no built-in length constraint). Resolvers map enum values to fixed columns.
- `ID` is opaque in GraphQL; resolvers validate its shape (UUID or integer) and return a validation error before querying.
- Introspection: disable or restrict in production for private APIs; keep it on for public APIs that publish their schema.
- Persisted queries (an allowlist of known operations) for first-party clients when possible.
- Limit aliases and batched operations per request.
- Rate limit by cost, not only by request count.

## Authorization

Authorize in resolvers or the service layer, per field or per object, not only at the endpoint. A user reachable through `post.author` must pass the same checks as `user(id:)`.

## Performance

Batch and cache per-request lookups (the DataLoader pattern) so nested fields do not cause N+1 queries. Flag this for `backend-implement`.

## Evolution

- Do not version the schema. Add fields freely; mark old ones `@deprecated(reason: "Use fullName")` and remove them only after usage drops to zero.
- Check breaking changes with a schema diff tool such as GraphQL Inspector in CI (see `versioning.md`).
- Record the schema path, limits and error model in `api-patterns.md`.
