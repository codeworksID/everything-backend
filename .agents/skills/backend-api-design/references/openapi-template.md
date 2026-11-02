# OpenAPI Template

A complete starting spec for a new REST API. Every `$ref` resolves, every operation has an `operationId`, tags and security, and every error response has a schema. Every client input is constrained per `backend-api-design` Step 4a and `_shared/sql-safety.md` (rules 2, 4-6, 10): sort and field selection are enums, filters are typed named parameters, ids have a format, page size has a maximum, and search strings and arrays are bounded. Rename the `users` resource and fields to match the design, and keep the constraints when you do.

Default path: `docs/api/openapi.yaml`. The template is OpenAPI 3.1 (nullable fields use `type: [string, 'null']`). If the project already has a spec, keep its version. If its generators or gateways only support 3.0, use `openapi: 3.0.3` and write `nullable: true` instead of type arrays.

```yaml
openapi: 3.1.0
info:
  title: Example API
  version: 1.0.0
  description: API for managing users.
  contact: { name: API Team, email: api-team@example.com }
servers:
  - url: http://localhost:3000/api/v1
    description: Local development
tags:
  - name: users
    description: User accounts
security:
  - bearerAuth: []
paths:
  /users:
    get:
      tags: [users]
      operationId: listUsers
      summary: List users
      description: >-
        Returns users ordered by `sort` (default newest first). Sort, field and
        filter values are allowlisted by the enums below; the server maps each
        public name to a fixed column and returns 400 for anything else. Results
        are always scoped to the caller's tenant from the authenticated principal.
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
        - $ref: '#/components/parameters/UserSort'
        - $ref: '#/components/parameters/UserFields'
        - $ref: '#/components/parameters/UserStatusFilter'
        - $ref: '#/components/parameters/CreatedAfter'
        - $ref: '#/components/parameters/SearchQuery'
        - $ref: '#/components/parameters/UserIds'
      responses:
        '200':
          description: A page of users.
          content:
            application/json:
              schema:
                type: object
                required: [data, page]
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  page:
                    $ref: '#/components/schemas/CursorPage'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
    post:
      tags: [users]
      operationId: createUser
      summary: Create a user
      description: Creates a user. Admin only.
      parameters:
        - $ref: '#/components/parameters/IdempotencyKey'
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUserRequest'
      responses:
        '201':
          description: User created.
          headers:
            Location: { description: 'URL of the new user.', schema: { type: string } }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '409':
          $ref: '#/components/responses/Conflict'
        '422':
          $ref: '#/components/responses/ValidationError'
  /users/{userId}:
    parameters:
      - $ref: '#/components/parameters/UserId'
    get:
      tags: [users]
      operationId: getUser
      summary: Get a user
      description: >-
        The user themself or an admin of the same tenant. The server loads the
        row by id AND the caller's tenant (and user id, for non-admins), both
        bound as parameters; a row the caller does not own returns 404.
      responses:
        '200':
          description: The user.
          headers:
            ETag: { description: 'Version of the representation, for If-Match.', schema: { type: string } }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
    patch:
      tags: [users]
      operationId: updateUser
      summary: Update a user
      description: >-
        Partial update with merge semantics. The user themself or an admin of
        the same tenant. The UPDATE binds id AND tenant (and user id, for
        non-admins).
      parameters:
        - name: If-Match
          in: header
          required: true
          description: ETag from the last GET.
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/merge-patch+json:
            schema:
              $ref: '#/components/schemas/UpdateUserRequest'
      responses:
        '200':
          description: Updated user.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
        '412':
          $ref: '#/components/responses/PreconditionFailed'
        '428':
          $ref: '#/components/responses/PreconditionRequired'
        '422':
          $ref: '#/components/responses/ValidationError'
    delete:
      tags: [users]
      operationId: deleteUser
      summary: Delete a user
      description: Admin of the same tenant only. The DELETE binds id AND tenant.
      responses:
        '204':
          description: Deleted.
        '400':
          $ref: '#/components/responses/BadRequest'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '403':
          $ref: '#/components/responses/Forbidden'
        '404':
          $ref: '#/components/responses/NotFound'
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  parameters:
    UserId:
      name: userId
      in: path
      required: true
      description: Typed id; a value that is not a UUID returns 400 before any query runs.
      schema: { $ref: '#/components/schemas/Id' }
    Limit:
      name: limit
      in: query
      required: false
      schema:
        type: integer
        minimum: 1
        maximum: 100
        default: 20
    Cursor:
      name: cursor
      in: query
      required: false
      description: >-
        Opaque cursor from page.nextCursor (base64url). The server decodes it,
        validates every key, binds the values as parameters, and returns 400 if
        it is malformed.
      schema:
        type: string
        maxLength: 512
        pattern: '^[A-Za-z0-9_-]+={0,2}$'
    UserSort:
      name: sort
      in: query
      required: false
      description: >-
        Public sort keys only; a leading '-' means descending. The server maps
        each value to a fixed column. Never a column name or SQL fragment.
      schema:
        type: string
        enum: [createdAt, -createdAt, name, -name]
        default: -createdAt
    UserFields:
      name: fields
      in: query
      required: false
      description: Sparse field selection. Each value maps to a fixed column server-side.
      style: form
      explode: false
      schema:
        type: array
        minItems: 1
        maxItems: 6
        uniqueItems: true
        items:
          type: string
          enum: [id, email, name, avatarUrl, status, createdAt]
    UserStatusFilter:
      name: status
      in: query
      required: false
      schema: { $ref: '#/components/schemas/UserStatus' }
    CreatedAfter:
      name: createdAfter
      in: query
      required: false
      schema:
        type: string
        format: date-time
        maxLength: 35
    SearchQuery:
      name: q
      in: query
      required: false
      description: >-
        Plain text matched against an allowlisted set of fields (name, email).
        '%' and '_' match literally: the server escapes them and binds the value.
      schema:
        type: string
        minLength: 1
        maxLength: 100
    UserIds:
      name: ids
      in: query
      required: false
      description: Fetch a set of users by id. Bound as an array, never joined into SQL text.
      style: form
      explode: false
      schema:
        type: array
        minItems: 1
        maxItems: 100
        uniqueItems: true
        items: { $ref: '#/components/schemas/Id' }
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: false
      description: Unique key per logical request; retries reuse it.
      schema:
        type: string
        maxLength: 255
  schemas:
    Id:
      # UUID ids. For integer keys sent as strings, replace format/pattern with
      # pattern: '^[1-9][0-9]{0,18}$' and maxLength: 19.
      type: string
      format: uuid
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      maxLength: 36
    UserStatus:
      type: string
      enum: [active, suspended]
    User:
      type: object
      required: [id, email, name, status, createdAt]
      properties:
        id: { $ref: '#/components/schemas/Id' }
        email:
          type: string
          format: email
        name: { type: string }
        status: { $ref: '#/components/schemas/UserStatus' }
        avatarUrl:
          type: [string, 'null']
          format: uri
        createdAt:
          type: string
          format: date-time
    UserResponse:
      type: object
      required: [data]
      properties:
        data:
          $ref: '#/components/schemas/User'
    CreateUserRequest:
      type: object
      additionalProperties: false
      required: [email, name]
      properties:
        email:
          type: string
          format: email
          maxLength: 254
        name:
          type: string
          minLength: 1
          maxLength: 100
    UpdateUserRequest:
      type: object
      additionalProperties: false
      minProperties: 1
      properties:
        name:
          type: string
          minLength: 1
          maxLength: 100
        avatarUrl:
          type: [string, 'null']
          format: uri
          maxLength: 2048
    CursorPage:
      type: object
      required: [nextCursor, hasMore]
      properties:
        nextCursor:
          type: [string, 'null']
        hasMore: { type: boolean }
    Error:
      type: object
      required: [error]
      properties:
        error:
          type: object
          required: [code, message]
          properties:
            code: { type: string }
            message: { type: string }
            requestId: { type: string }
            details:
              type: array
              items:
                $ref: '#/components/schemas/FieldError'
    FieldError:
      type: object
      required: [field, code, message]
      properties:
        field: { type: string }
        code: { type: string }
        message: { type: string }
  responses:
    BadRequest:
      description: Malformed request.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Unauthorized:
      description: Missing or invalid credentials.
      headers:
        WWW-Authenticate:
          schema: { type: string }
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Forbidden:
      description: Not allowed.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    NotFound:
      description: Resource not found.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    Conflict:
      description: Conflicts with current state.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    PreconditionFailed:
      description: ETag does not match.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
    PreconditionRequired: { description: If-Match header missing., content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } } }
    ValidationError:
      description: Validation failed.
      content: { application/json: { schema: { $ref: '#/components/schemas/Error' } } }
```

## Notes

- Passwords are not in `CreateUserRequest`: user creation with credentials belongs to the signup flow designed by `backend-auth`. Add a password field only if `backend-auth` says so, and then never return it.
- `security` at the top level protects every operation. Mark a public operation with `security: []`.
- `bearerAuth` is a placeholder. Replace it with the scheme `backend-auth` recorded (for example a cookie `apiKey` scheme for session cookies).
- Keep `servers` free of production secrets. Real hostnames are fine; credentials are not.

## Injection-Proof Parameters

The template follows `_shared/sql-safety.md`. Keep these properties when you adapt it:

- The enums are the public contract, not the column list. The handler maps each `sort`, `fields` and filter value through a fixed server-side table (`{"createdAt": "created_at", "name": "last_name"}`) and never passes the client's string into a query, ORDER BY or column list (rule 2). Adding a sort key means adding it to the enum, the map and an index.
- No operation accepts a generic `filter`, `where`, `orderBy`, `select` or raw query object. Add one named, typed parameter per allowed filter (rules 2, 9).
- `Id` has both `format: uuid` and a `pattern`, because many validators skip `format` unless formats are enabled (for example Ajv without `ajv-formats`). Use the same `Id` schema in paths, query arrays and request bodies.
- `ids` and bulk bodies are capped with `maxItems` and bound as an array (rule 5). `limit` has a `maximum` (rule 4). `q` has a `maxLength` and its `%`/`_` are escaped server-side (rule 6).
- Path ids select a row; they do not authorize it. Every `/{userId}` query also binds the caller's tenant (and user id, where the rule is owner-only) from the token, never from the request (rule 3).
- Schema validation rejects bad input with 400/422 at the boundary. It is defense in depth: the queries behind it still use bound parameters (rules 1, 10).
- `BadRequest` and `ValidationError` bodies name the bad parameter but never echo SQL, driver messages or query text (rule 12).
- Before release, run a contract test per parameter with the hostile payloads in `_shared/sql-safety.md` -> Verification, step 4 (owned by `backend-test`).

## Docs and Clients

- Render docs from the spec with a viewer such as Redoc or Swagger UI; serve internal API docs behind auth.
- Generate client SDKs from the spec (for example with OpenAPI Generator) instead of hand-writing them.
- Prevent drift: code-first projects generate the spec in CI and fail on a diff with the committed file; design-first projects run contract tests (`backend-test`) against the spec.
