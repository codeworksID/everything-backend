---
name: backend-implement
description: "Generate code from architecture, API, and database designs. Creates project structure, controllers, services, repositories, models, and tests. Supports Node.js, Python, Go, and Java. Reads from memory files for full context. Use this skill when the user says 'implement', 'generate code', 'build this', or after architecture and API design are complete."
---

# Backend Implement

## When to Activate

- User wants to generate code from design
- User says "implement", "generate code", "build this"
- After architecture and API design are complete
- User asks "how do I build this?"
- Starting implementation of a new feature

## Implementation Process

### Step 1: Context Loading

Read all memory files for full context:

- `project-overview.md` - Project type, structure
- `tech-stack.md` - Languages, frameworks, databases
- `api-patterns.md` - API design, endpoints
- `db-schema.md` - Database schema
- `decisions.md` - Architecture decisions

If memory is empty or stale, suggest running:
- `backend-discovery` first
- `backend-architect` for architecture
- `backend-api-design` for endpoints
- `backend-db-design` for schema

### Step 1.5: Implementation Rules (MANDATORY)

Apply these rules before generating code:

1. **Thin transport layer**
   - Controllers/handlers validate transport input, call a use case/service, and map output/errors
   - Controllers must not contain business rules, persistence logic, or transaction orchestration

2. **Business logic lives in services/use cases**
   - Services own workflow, invariants, authorization decisions, and transaction boundaries
   - Break large workflows into smaller use-case-focused services when one class gains multiple reasons to change

3. **Repositories are persistence adapters**
   - Repositories fetch/store data and expose intent-oriented methods
   - Repositories must not call HTTP APIs, send emails, or contain domain policy

4. **Depend on abstractions**
   - Prefer interfaces/ports for repositories, clocks, ID generators, queues, and external clients
   - Wire concrete dependencies in a composition root or module setup layer

5. **Validation happens at multiple layers**
   - Request schema validation at the boundary
   - Business invariant validation in services/domain
   - Database constraints for persistence invariants

6. **Errors are typed and intentional**
   - Use domain/application errors for expected failure modes
   - Map them centrally to HTTP/gRPC responses

7. **Tests are part of generation**
    - Generate unit tests for business rules
    - Generate integration tests for repositories and DB-backed flows
    - Generate endpoint/contract tests for transport behavior

8. **Operational and security defaults**
   - Implement role-based access control, least privilege, and audit logging where privileged workflows exist
   - Sanitize and validate inputs before business processing and use safe defaults for secrets/config
   - Prefer observability hooks early: structured logging, metrics, health checks, and correlation IDs when the stack supports them

### Step 1.6: Tool Usage Rules (MANDATORY)

Use OpenCode tools during implementation, not just prose reasoning:

1. **`glob`** to discover adjacent modules, tests, configs, and generated files
2. **`read`** to inspect existing implementations before generating new ones
3. **`grep`** to find patterns, validators, error classes, routes, and test helpers
4. **`ast_grep_search`** to match structural patterns such as service interfaces, repository implementations, and handler signatures
5. **`lsp_goto_definition`, `lsp_find_references`, and `lsp_symbols`** to reuse existing abstractions correctly
6. **`lsp_diagnostics`** after edits to catch errors early
7. **`task` with `subagent_type="explore"`** for multi-area codebase search and **`subagent_type="librarian"`** for external library usage research

### Step 2: Project Structure Creation

#### Node.js/Express Structure
```
src/
├── controllers/     # Request handlers
├── services/        # Business logic
├── repositories/    # Data access
├── models/          # Database models
├── middleware/       # Express middleware
├── routes/          # API routes
├── utils/           # Utility functions
├── config/          # Configuration
└── types/           # TypeScript types
tests/
├── unit/
├── integration/
└── e2e/
```

#### Python/FastAPI Structure
```
app/
├── api/             # API routes
│   └── v1/          # Version 1
├── models/          # SQLAlchemy models
├── schemas/         # Pydantic schemas
├── services/        # Business logic
├── repositories/    # Data access
├── core/            # Configuration
└── utils/           # Utilities
tests/
├── unit/
├── integration/
└── e2e/
```

#### Go/Gin Structure
```
internal/
├── handlers/        # HTTP handlers
├── services/        # Business logic
├── repositories/    # Data access
├── models/          # Database models
├── middleware/       # Gin middleware
└── config/          # Configuration
pkg/                 # Public packages
cmd/                 # Entry points
tests/
```

### Step 3: Code Generation

#### Controller/Handler Generation
- Generate request handling
- Generate input validation (Zod, Pydantic, etc.)
- Generate response formatting
- Generate error handling
- Generate logging

#### Service Layer Generation
- Generate business logic
- Generate data transformation
- Generate orchestration between repositories
- Generate domain invariant checks
- Generate authorization checks where relevant
- Generate transaction boundaries for multi-write flows
- Generate error handling
- Generate logging

#### Repository Generation
- Generate CRUD operations
- Generate query building
- Generate transaction handling
- Generate error handling
- Generate connection management
- Generate interfaces/ports where language patterns support it

#### Model Generation
- Generate database models
- Generate relationships
- Generate validations
- Generate timestamps
- Generate migrations
- Respect normalization and constraint decisions from `db-schema.md`

### Step 4: Dependency Setup

Generate manifest files:

- **Node.js**: `package.json` with dependencies and scripts
- **Python**: `requirements.txt` or `pyproject.toml`
- **Go**: `go.mod` with required modules
- **Java**: `pom.xml` or `build.gradle`

Include:
- Framework dependencies
- Database drivers/ORMs
- Validation libraries
- Testing frameworks
- Development tools (linting, formatting)
- DI/container support only if the language/framework meaningfully benefits from it

### Step 5: Configuration

Generate config files:

- Environment variables template (`.env.example`)
- Database connection config
- Logging configuration
- Middleware setup
- Error handling setup

### Step 6: User Confirmation

Present generated code:

```markdown
# Implementation Summary

## Project Structure
[Show tree of generated files]

## Key Files
- `src/controllers/user.controller.ts` - User API handlers
- `src/services/user.service.ts` - User business logic
- `src/repositories/user.repository.ts` - User data access
- `src/models/user.model.ts` - User database model

## Dependencies Added
- express, prisma, zod, dotenv

## Next Steps
- [ ] Review generated code
- [ ] Run database migrations
- [ ] Start development server
- [ ] Test endpoints
- [ ] Verify controllers stay thin and services own business rules
- [ ] Verify repository boundaries and transaction placement
```

Ask:
- "Does this implementation look correct?"
- "Any changes needed?"
- "Should I generate or expand tests by layer (unit, integration, endpoint)?"
- "Should I save progress to memory?"

## Decision Trees

### If REST API:
- Generate Express/FastAPI/Gin routes
- Generate request validation middleware
- Generate response formatting
- Generate error handling middleware
- Generate OpenAPI spec

### If GraphQL:
- Generate schema definitions
- Generate resolvers
- Generate data loaders (for N+1 prevention)
- Generate subscriptions for real-time
- Generate federation config (if needed)

### If database operations:
- Generate ORM models (Prisma, SQLAlchemy, GORM)
- Generate migrations
- Generate seed data scripts
- Generate query builders
- Generate connection pooling
- Ensure DB constraints and transaction boundaries match schema guidance

### If authentication:
- Generate auth middleware
- Generate JWT handling
- Generate password hashing
- Generate role-based access control
- Generate session management

### If WebSocket:
- Generate WebSocket server setup
- Generate connection management
- Generate message handlers
- Generate room/channel logic
- Generate authentication for WebSocket

## Templates

### Express Controller Template
```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserService } from '../services/user.service';
import { CreateUserSchema } from '../schemas/user.schema';

export class UserController {
  constructor(private userService: UserService) {}

  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Number(req.query.page) || 1;
      const perPage = Number(req.query.per_page) || 20;
      const result = await this.userService.getUsers(page, perPage);
      res.json({
        data: result.users,
        meta: {
          total: result.total,
          page,
          per_page: perPage,
          total_pages: Math.ceil(result.total / perPage)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await this.userService.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'User not found' }
        });
      }
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: Request, res: Response, next: NextFunction) {
    try {
      const validated = CreateUserSchema.parse(req.body);
      const user = await this.userService.createUser(validated);
      res.status(201)
        .location(`/api/v1/users/${user.id}`)
        .json({ data: user });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({
          error: {
            code: 'validation_error',
            message: 'Request validation failed',
            details: error.errors
          }
        });
      }
      next(error);
    }
  }
}
```

### Layering Rules Template
```markdown
## Layering Rules

- Controllers/handlers: transport only, no business branching beyond response mapping
- Services/use cases: business workflow, invariants, authorization, transaction ownership
- Repositories: persistence only, no transport or domain orchestration
- External adapters: email, queues, storage, HTTP clients behind interfaces/ports
- Composition root: assemble concrete implementations and inject dependencies
```

### FastAPI Router Template
```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.schemas.user import User, UserCreate, UserUpdate
from app.services.user_service import UserService
from app.core.database import get_db

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/", response_model=List[User])
async def get_users(
    page: int = 1,
    per_page: int = 20,
    db: Session = Depends(get_db)
):
    service = UserService(db)
    return service.get_users(page, per_page)

@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str, db: Session = Depends(get_db)):
    service = UserService(db)
    user = service.get_user(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return user

@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    service = UserService(db)
    return service.create_user(user_data)
```

### Go Handler Template
```go
package handlers

import (
    "net/http"
    "strconv"
    "github.com/gin-gonic/gin"
    "github.com/yourorg/yourapp/internal/services"
)

type UserHandler struct {
    userService *services.UserService
}

func NewUserHandler(userService *services.UserService) *UserHandler {
    return &UserHandler{userService: userService}
}

func (h *UserHandler) GetUsers(c *gin.Context) {
    page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
    perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
    
    users, total, err := h.userService.GetUsers(c.Request.Context(), page, perPage)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{
            "error": gin.H{"code": "internal_error", "message": "Failed to fetch users"},
        })
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "data": users,
        "meta": gin.H{
            "total":       total,
            "page":        page,
            "per_page":    perPage,
            "total_pages": (total + perPage - 1) / perPage,
        },
    })
}
```

### Service Layer Template
```typescript
export interface UserRepository {
  findAll(page: number, perPage: number): Promise<User[]>;
  count(): Promise<number>;
  findByEmail(email: string): Promise<User | null>;
  create(data: CreateUserRecord): Promise<User>;
}

export interface LoggerPort {
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export class UserService {
  constructor(
    private userRepository: UserRepository,
    private logger: LoggerPort
  ) {}

  async getUsers(page: number, perPage: number) {
    this.logger.info('Fetching users', { page, perPage });
    const [users, total] = await Promise.all([
      this.userRepository.findAll(page, perPage),
      this.userRepository.count()
    ]);
    return { users, total };
  }

  async createUser(data: CreateUserDto): Promise<User> {
    if (data.password.length < 12) {
      throw new ValidationError('Password must be at least 12 characters long');
    }

    const existing = await this.userRepository.findByEmail(data.email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.userRepository.create({
      ...data,
      passwordHash
    });
    this.logger.info('User created', { userId: user.id });
    return user;
  }
}
```

### Transaction Placement Template
```markdown
## Transaction Rules

- Open transactions in the application/service layer, not in controllers
- Repositories may participate in a transaction but should not decide cross-repository workflow
- Keep transactions short and side-effect free
- External side effects (email, webhooks, queues) happen after commit or through an outbox pattern
```

### Test Template
```typescript
import { UserService } from '../user.service';

class FakeUserRepository {
  findAll = jest.fn();
  count = jest.fn();
  findByEmail = jest.fn();
  create = jest.fn();
}

class FakeLogger {
  info = jest.fn();
  error = jest.fn();
  warn = jest.fn();
}

describe('UserService', () => {
  let service: UserService;
  let mockRepo: FakeUserRepository;
  let logger: FakeLogger;

  beforeEach(() => {
    mockRepo = new FakeUserRepository();
    logger = new FakeLogger();
    service = new UserService(mockRepo, logger);
  });

  describe('getUsers', () => {
    it('should return paginated users', async () => {
      const users = [{ id: '1', email: 'test@test.com', name: 'Test' }];
      mockRepo.findAll.mockResolvedValue(users);
      mockRepo.count.mockResolvedValue(1);

      const result = await service.getUsers(1, 20);

      expect(result.users).toEqual(users);
      expect(result.total).toBe(1);
      expect(mockRepo.findAll).toHaveBeenCalledWith(1, 20);
    });
  });
});
```

### Testing Matrix Template
```markdown
## Testing Matrix

### Unit Tests
- Service/use-case invariants
- Error branches and authorization failures
- Domain calculations and state transitions

### Integration Tests
- Repository behavior against the real database or a close test double
- Migration correctness for new schema changes
- Transaction rollback behavior

### Endpoint / Contract Tests
- Request validation
- Response shape and error mapping
- Authentication/authorization behavior
```

## Edge Cases

- **No design exists**: Run backend-architect and backend-api-design first
- **Complex business logic**: Break into smaller services, use domain modeling
- **Legacy code**: Ask user about integration approach (strangler pattern, rewrite)
- **Multiple languages**: Ask user which to prioritize
- **Large project**: Generate incrementally, confirm each layer before next
- **Existing tests**: Match existing test patterns and frameworks
- **Fat controller temptation**: Move rules into services/use cases before adding more endpoints
- **Repository doing too much**: Split query concerns from business workflow and inject collaborators
