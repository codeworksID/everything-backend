# Implementation Patterns

Minimal, copyable shapes for the transport, service, and repository layers, plus the layering, transaction, and testing rules they follow. For deeper per-stack conventions, read the matching file in `<shared>/stacks/` (for example `node-typescript.md`, `python-fastapi.md`, `postgres.md`) when it exists.

## Layering Rules

- Controllers / handlers: transport only. No business branching beyond input validation and response mapping.
- Services / use cases: business workflow, invariants, authorization checks, transaction ownership.
- Repositories: persistence only. No transport or domain orchestration.
- External adapters: email, queues, storage, HTTP clients behind interfaces or ports.
- Composition root: assembles concrete implementations and injects dependencies.

## Transaction Rules

- Open transactions in the service layer, never in controllers.
- Repositories may join a transaction but do not decide cross-repository workflow.
- Keep transactions short and free of side effects.
- External side effects (email, webhooks, queue publishes) happen after commit, or through an outbox table written in the same transaction.

## Minimal Controller (Express, TypeScript)

```typescript
// Express 5 forwards rejected promises from async handlers to the error middleware.
// Express 4 does not: keep the try/catch + next(err), or wrap the handler.
// An arrow-function class field keeps `this` bound for `router.post('/', controller.createUser)`.
createUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dto = CreateUserSchema.parse(req.body);   // ZodError -> 400 in the error middleware
    const user = await this.userService.createUser(dto);
    res.status(201).json({ data: toUserResponse(user) });
  } catch (err) {
    next(err);
  }
};

// Response DTO: explicit fields only, never password_hash or other secrets
function toUserResponse(u: User): UserResponse {
  return { id: u.id, email: u.email, displayName: u.displayName, createdAt: u.createdAt };
}
```

## Minimal Router (FastAPI)

```python
# UserOut omits password_hash; with Pydantic v2 set model_config = ConfigDict(from_attributes=True)
@router.post("/", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def create_user(
    data: UserCreate,
    svc: Annotated[UserService, Depends(get_user_service)],
):
    # The service uses an async driver (SQLAlchemy AsyncSession, asyncpg), so await it.
    # With a sync service, declare the endpoint with plain `def` so FastAPI runs it in a threadpool;
    # never call blocking DB I/O inside `async def`.
    return await svc.create_user(data)
```

## Minimal Handler (Go, Gin)

```go
func (h *UserHandler) CreateUser(c *gin.Context) {
    var dto CreateUserDto
    if err := c.ShouldBindJSON(&dto); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
        return // without return the handler keeps running and writes a second response
    }
    user, err := h.svc.CreateUser(c.Request.Context(), dto)
    if err != nil {
        _ = c.Error(err) // error middleware maps ErrEmailTaken -> 409, unknown -> 500
        return
    }
    c.JSON(http.StatusCreated, toUserResponse(user))
}
```

## Minimal Controller (Spring Boot)

```java
@PostMapping
public ResponseEntity<UserResponse> createUser(@Valid @RequestBody CreateUserRequest req) {
    // @Valid failures and domain exceptions are mapped in one @RestControllerAdvice
    User user = userService.createUser(req.toCommand());
    return ResponseEntity.status(HttpStatus.CREATED).body(UserResponse.from(user));
}
```

## Minimal Service (TypeScript)

```typescript
async createUser(dto: CreateUserDto): Promise<User> {
  const passwordHash = await this.passwordHasher.hash(dto.password); // argon2id (or bcrypt)
  try {
    // Map explicit fields; never persist the raw DTO
    return await this.repo.create({
      email: normalizeEmail(dto.email),
      displayName: dto.displayName,
      passwordHash,
    });
  } catch (err) {
    // Rely on the unique constraint on email; no check-then-insert (it races).
    // Unique violation: Postgres SQLSTATE 23505, MySQL error 1062, Prisma P2002.
    // Match the specific constraint (pg `err.constraint`, Prisma `err.meta.target`),
    // so another unique column does not surface as an email conflict.
    if (isUniqueViolation(err, 'users_email_key')) throw new ConflictError('Email already registered'); // -> 409
    throw err;
  }
}
```

Rules the service shape encodes:

- Never pass a request DTO straight to the repository. Map the fields the entity needs.
- Hash passwords in the service before persisting (argon2id or bcrypt; follow the `backend-auth` decision).
- Enforce uniqueness with a database unique constraint and map the unique-violation error to 409. A prior `findBy...` check is optional UX, not the guarantee.
- On Postgres a unique violation aborts the surrounding transaction. Inside a wider transaction, use a savepoint or `INSERT ... ON CONFLICT DO NOTHING` and check the affected row count.
- If `backend-auth` chose anti-enumeration for sign-up, return the generic response it specifies instead of a 409 that reveals the email exists.
- Return a response DTO with explicit fields. Never serialize the entity directly.

## Idempotent POST (critical writes)

For payments, orders, and other critical POSTs that clients retry:

1. Require an `Idempotency-Key` header on the route.
2. In the service, inside one transaction, insert `(key, request_hash, status)` into an idempotency table with a unique constraint on `key`.
3. On a unique violation, load the stored row: same `request_hash` returns the stored response; a different hash returns 422 (key reused with a different body); an in-progress row returns 409.
4. Store the response with the row when the work commits. Expire rows after the retry window the API design states.

## Testing Matrix

### Unit tests
- Service and use-case invariants
- Error branches and authorization failures
- Domain calculations and state transitions

### Integration tests
- Repository behavior against a provably local database with the migrated schema (Testcontainers or a local container), or a close test double. Migration correctness itself is tested by `backend-migrate`.
- Unique-constraint violations mapped to 409 (or the anti-enumeration response)
- Transaction rollback behavior

### Endpoint / contract tests
- Request validation
- Response shape and error mapping
- Authentication and authorization behavior
