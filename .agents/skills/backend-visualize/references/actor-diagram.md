# User / Actor Diagram

Read when the user asks who uses the system, what each role can do, or for an access map. Also read `theme.md` and `syntax-rules.md`.

## Sources

- Auth configuration, role and permission definitions, route guards and middleware.
- `project-overview.md` for modules; `api-patterns.md` for the auth method.
- Take role, module and route names from the project. The template below uses placeholder names only.

## Template

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#e1f5fe", "primaryBorderColor": "#01579b", "primaryTextColor": "#000000", "lineColor": "#546e7a"}}}%%
graph TD
    accTitle: Roles and module access
    accDescr: Visitors sign in, the session resolves a role, and each role reaches a set of modules.

    %% Entry points and identity
    subgraph AuthBoundary["Authentication Boundary"]
        Visitor((Visitor))
        SignIn["/login"]
        Session{{"Session or token<br/>role claims"}}
    end

    %% Roles the session can resolve to
    subgraph Roles["Resolved Roles"]
        AdminRole([Admin])
        MemberRole([Member])
    end

    %% Features the system owns
    subgraph Modules["App Modules"]
        Orders[Orders]
        Billing[Billing]
        Settings[Settings]
    end

    Visitor -->|signs in| SignIn
    SignIn --> Session
    Session -.->|resolves| AdminRole
    Session -.->|resolves| MemberRole

    AdminRole ==>|full access| Orders & Billing & Settings
    MemberRole -->|own records| Orders

    classDef actor fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#000
    classDef boundary fill:#fffde7,stroke:#f57f17,stroke-width:2px,color:#000
    classDef service fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#000

    class Visitor,AdminRole,MemberRole actor
    class SignIn,Session boundary
    class Orders,Billing,Settings service
```

## Actor Diagram Rules

- Direction `graph TD` for layered access maps; `graph LR` only for short linear flows.
- Node shapes carry meaning (and pair with the color class from `theme.md`):
  - `((Label))` external person or visitor (`actor`)
  - `([Label])` resolved role, tenant or identity (`actor`)
  - `["/route"]` entry route or form; always quote routes (`boundary`)
  - `{{Label}}` session, token evaluation or middleware (`boundary`)
  - `[Label]` internal module, page or service (`service`)
  - `[(Label)]` data store (`database`)
- Edge styles: `-->` direct flow, `-.->` evaluation or lookup, `==>` full or privileged access. Label every access edge with its scope.
- Use `&` to fan out one role to many modules, on one line (see `syntax-rules.md` -> Fan-out).
- Typical groups: authentication boundary, resolved roles, app modules, separate surfaces (for example a customer portal or partner API).
- Keep each subgraph to 3-7 nodes. If a role reaches more than 7 modules, collapse the rest into an "Other modules" node or draw a second diagram per role.
- If roles are tenant-scoped, say so on the edge label (`own tenant`) and in Notes.
