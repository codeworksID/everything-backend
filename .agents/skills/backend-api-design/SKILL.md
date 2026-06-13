---
name: backend-api-design
description: "Design API endpoints including resource structure, request/response schemas, error handling, authentication, and versioning. Supports REST, GraphQL, and gRPC. Creates OpenAPI/Swagger specifications. Use this skill when the user says 'design API', 'create endpoints', 'plan routes', or starting a new feature with API surface."
---

# Backend API Design

## When to Activate

- User wants to design API endpoints
- User says "design API", "create endpoints", "plan routes"
- Starting a new feature with API surface
- User asks "what endpoints do I need?"
- Need to add new API routes

## Design Process

### Step 1: Requirements Gathering

Ask the user iteratively:

1. "What resources do you need to expose?" (users, posts, orders, etc.)
2. "What operations do you need?" (CRUD, custom actions)
3. "Who are the consumers?" (frontend, mobile, third-party, internal)
4. "Any specific protocols?" (REST, GraphQL, gRPC)
5. "Authentication needed?" (public, API key, OAuth, JWT)

Always confirm:
- "Let me confirm the resources: [list]. Did I miss any?"

### Step 2: API Protocol Selection

#### REST
- **When**: Standard CRUD, web/mobile consumers, team familiarity
- **Pros**: Wide tooling, HTTP caching, predictable, easy to debug
- **Cons**: Over/under-fetching, multiple round trips for complex data

#### GraphQL
- **When**: Complex data needs, mobile apps, multiple consumers with different needs
- **Pros**: Flexible queries, single endpoint, type system, no over-fetching
- **Cons**: Complexity, caching challenges, N+1 queries, learning curve

#### gRPC
- **When**: Microservices, high performance, internal services
- **Pros**: Fast (binary), bi-directional streaming, code generation, type safety
- **Cons**: Browser support limited, learning curve, harder to debug

### Step 3: Resource Design

#### REST Resources

Use these naming conventions:
- **Nouns, plural, lowercase**: `/users`, `/orders`, `/products`
- **Nested resources**: `/users/:id/orders`
- **Actions as sub-resources**: `/orders/:id/cancel`
- **Kebab-case for multi-word**: `/team-members`, `/order-items`

```
GET    /api/v1/users              # List users
GET    /api/v1/users/:id          # Get user
POST   /api/v1/users              # Create user
PUT    /api/v1/users/:id          # Replace user
PATCH  /api/v1/users/:id          # Update user
DELETE /api/v1/users/:id          # Delete user
GET    /api/v1/users/:id/orders   # Get user's orders
POST   /api/v1/orders/:id/cancel  # Cancel order
```

#### GraphQL Types

```graphql
type User {
  id: ID!
  email: String!
  name: String!
  createdAt: DateTime!
  posts(first: Int, after: String): PostConnection!
}

type Query {
  users(first: Int, after: String, filter: UserFilter): UserConnection!
  user(id: ID!): User
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
}
```

### Step 4: Endpoint Design

For each endpoint, define:
- HTTP method and path
- Request parameters (path, query, body)
- Request body schema
- Response schema
- Error responses
- Authentication required

#### Request/Response Schemas

```typescript
// Create user request
interface CreateUserRequest {
  email: string;      // required, valid email
  password: string;   // required, min 8 chars
  name: string;       // required, 1-100 chars
}

// User response
interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;  // ISO timestamp
}

// Error response
interface ErrorResponse {
  error: {
    code: string;         // e.g., "validation_error"
    message: string;      // Human-readable
    details?: FieldError[]; // For validation errors
  };
}

interface FieldError {
  field: string;
  message: string;
  code: string;  // e.g., "invalid_format"
}
```

### Step 5: OpenAPI/Swagger Spec

Generate OpenAPI 3.0 specification:

```yaml
openapi: 3.0.0
info:
  title: API Title
  version: 1.0.0
paths:
  /api/v1/users:
    get:
      summary: List users
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          schema:
            type: integer
            default: 20
            maximum: 100
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
                  meta:
                    $ref: '#/components/schemas/Pagination'
    post:
      summary: Create user
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateUser'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '422':
          description: Validation error
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
        email: { type: string }
        name: { type: string }
        createdAt: { type: string, format: date-time }
```

### Step 6: User Confirmation

Present API design:

- Show endpoint list
- Show request/response schemas
- Show error response format
- Show authentication method
- Show OpenAPI spec

Ask:
- "Does this API design meet your needs?"
- "Any missing endpoints?"
- "Any fields to add/remove?"
- "Should I save this to api-patterns.md memory?"

## Decision Trees

### If user authentication needed:
- POST /auth/register - Create account
- POST /auth/login - Get token
- POST /auth/refresh - Refresh token
- POST /auth/logout - Invalidate token
- GET /auth/me - Current user

### If pagination needed:
- Use cursor-based for large datasets (>10K items)
- Use offset-based for admin dashboards
- Include: page, per_page, total, has_next
- Add Link headers for HATEOAS

### If file upload needed:
- POST /upload (multipart/form-data)
- Consider presigned URLs for S3/cloud storage
- Define file size limits (e.g., max 10MB)
- Validate file types server-side
- Return file URL/ID in response

### If real-time needed:
- WebSocket endpoint: /ws
- GraphQL subscriptions
- Server-Sent Events: /events
- Consider connection authentication

### If search needed:
- GET /resources?q=searchterm
- Support filters and sorting
- Use full-text search index
- Return relevance scores

## Templates

### REST Endpoint Template
```
# Resource endpoints
GET    /api/v1/{resource}           # List (with pagination)
GET    /api/v1/{resource}/:id       # Get one
POST   /api/v1/{resource}           # Create
PUT    /api/v1/{resource}/:id       # Replace
PATCH  /api/v1/{resource}/:id       # Update
DELETE /api/v1/{resource}/:id       # Delete

# Nested resources
GET    /api/v1/{parent}/:id/{resource}
POST   /api/v1/{parent}/:id/{resource}

# Actions
POST   /api/v1/{resource}/:id/{action}
```

### Error Response Template
```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [
      {
        "field": "email",
        "message": "Must be a valid email address",
        "code": "invalid_format"
      }
    ]
  }
}
```

### Standard Error Codes
| HTTP | Code | Meaning |
|------|------|---------|
| 200 | - | Success |
| 201 | - | Created |
| 204 | - | No Content |
| 400 | bad_request | Malformed request |
| 401 | unauthorized | Missing/invalid auth |
| 403 | forbidden | Authenticated but not authorized |
| 404 | not_found | Resource doesn't exist |
| 409 | conflict | Duplicate, state conflict |
| 422 | validation_error | Validation failed |
| 429 | rate_limit_exceeded | Too many requests |
| 500 | internal_error | Server error |

## Edge Cases

- **No clear resources**: Ask user for examples, start with core CRUD
- **Complex relationships**: Use nested resources, consider GraphQL for flexibility
- **Multiple consumers**: Consider API versioning, different rate limits
- **High traffic**: Implement rate limiting, caching, pagination
- **Sensitive data**: Never return passwords, tokens, PII unless required
- **Legacy API**: Document migration path, support both versions temporarily
