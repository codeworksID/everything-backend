# Error Format

Use one error format for every endpoint. If the project already has one, keep it. Otherwise pick one of the two formats below and record it under Conventions in `api-patterns.md`.

## Option A: Error Envelope (default)

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "requestId": "01JC9Z6Q8F3W2K7V5T4R1N0M9B",
    "details": [
      {
        "field": "email",
        "code": "invalid_format",
        "message": "Must be a valid email address"
      }
    ]
  }
}
```

Schema, as TypeScript for reference:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // stable, machine-readable, e.g. "validation_error"
    message: string;        // for humans; may be localized
    requestId?: string;     // same value as the X-Request-ID / correlation ID response header
    details?: FieldError[]; // validation errors only
  };
}

interface FieldError {
  field: string;   // JSON path of the field, e.g. "items[2].quantity"
  code: string;    // e.g. "invalid_format", "too_long", "required"
  message: string;
}
```

## Option B: Problem Details (RFC 9457)

Media type `application/problem+json`. Good for public APIs and teams that want a standard shape.

```json
{
  "type": "https://api.example.com/problems/validation-error",
  "title": "Request validation failed",
  "status": 422,
  "detail": "2 fields are invalid",
  "instance": "/api/v1/users",
  "code": "validation_error",
  "requestId": "01JC9Z6Q8F3W2K7V5T4R1N0M9B",
  "errors": [
    { "field": "email", "code": "invalid_format", "message": "Must be a valid email address" }
  ]
}
```

`type`, `title`, `status`, `detail` and `instance` are standard members. `code`, `requestId` and `errors` are extension members; keep them so clients have a stable machine code.

## Status Codes and Error Codes

| HTTP | code | Use for |
|---|---|---|
| 400 | `bad_request` | Malformed JSON, bad cursor, unknown query parameter |
| 401 | `unauthorized` | Missing or invalid credentials |
| 403 | `forbidden` | Authenticated but not allowed |
| 404 | `not_found` | Resource does not exist, or the caller may not know it exists |
| 405 | `method_not_allowed` | Method not supported on this path |
| 409 | `conflict` | Duplicate unique value, invalid state transition, idempotency key in flight |
| 412 | `precondition_failed` | `If-Match` ETag no longer matches |
| 413 | `payload_too_large` | Body over the size limit |
| 415 | `unsupported_media_type` | Wrong `Content-Type` |
| 422 | `validation_error` | Well-formed request with invalid field values |
| 428 | `precondition_required` | `If-Match` required but missing |
| 429 | `rate_limit_exceeded` | Too many requests |
| 500 | `internal_error` | Unexpected server error |
| 503 | `service_unavailable` | Dependency down, maintenance, overload |

Success codes are in `rest-conventions.md`.

## Rules

- Never include stack traces, SQL, internal hostnames or exception class names in error bodies. Log them server-side with the request ID.
- Return 404 instead of 403 when revealing that a resource exists would leak information (for example another tenant's record).
- Do not reveal whether an account exists on login, signup or password reset; `backend-auth` owns those messages.
- Every error response carries the request or correlation ID, at least as a response header (`backend-ops` sets it), and optionally as `requestId` in the body.
- 401 responses include a `WWW-Authenticate` header naming the scheme (for example `Bearer`).
- 429 and 503 responses include `Retry-After` (seconds).
- Machine codes are stable API surface: adding a code is additive, renaming or removing one is breaking.
- Project-specific codes (for example `insufficient_funds`, `order_already_shipped`) go in the Error Codes section of `api-patterns.md`.
