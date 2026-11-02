# OpenAPI Template

A complete starting spec for a new REST API. Every `$ref` resolves, every operation has an `operationId`, tags and security, and every error response has a schema. Rename the `users` resource and fields to match the design.

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
      description: Returns users ordered by creation time, newest first.
      parameters:
        - $ref: '#/components/parameters/Limit'
        - $ref: '#/components/parameters/Cursor'
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
      description: The user themself or an admin.
      responses:
        '200':
          description: The user.
          headers:
            ETag: { description: 'Version of the representation, for If-Match.', schema: { type: string } }
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '401':
          $ref: '#/components/responses/Unauthorized'
        '404':
          $ref: '#/components/responses/NotFound'
    patch:
      tags: [users]
      operationId: updateUser
      summary: Update a user
      description: Partial update with merge semantics. The user themself or an admin.
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
      description: Admin only.
      responses:
        '204':
          description: Deleted.
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
    UserId: { name: userId, in: path, required: true, schema: { type: string } }
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
      description: Opaque cursor from page.nextCursor.
      schema: { type: string }
    IdempotencyKey:
      name: Idempotency-Key
      in: header
      required: false
      description: Unique key per logical request; retries reuse it.
      schema:
        type: string
        maxLength: 255
  schemas:
    User:
      type: object
      required: [id, email, name, createdAt]
      properties:
        id: { type: string }
        email:
          type: string
          format: email
        name: { type: string }
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

## Docs and Clients

- Render docs from the spec with a viewer such as Redoc or Swagger UI; serve internal API docs behind auth.
- Generate client SDKs from the spec (for example with OpenAPI Generator) instead of hand-writing them.
- Prevent drift: code-first projects generate the spec in CI and fail on a diff with the committed file; design-first projects run contract tests (`backend-test`) against the spec.
