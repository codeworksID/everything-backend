# Flowchart, Sequence and State Diagrams

Read when the user asks for a business process or data flow (flowchart), a request or interaction over time (sequence), or an entity lifecycle such as order or payment status (state). Also read `theme.md` and `syntax-rules.md`.

## Sources

- Flowchart: the user's description, handler and service code, `project-overview.md`.
- Sequence: route and controller files, middleware, service calls, `api-patterns.md`. Trace one request from the route handler through each call it makes.
- State: enum or status columns, state-machine libraries, and the code paths that change the status.

## Flowchart Template

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#e1f5fe", "primaryBorderColor": "#01579b", "primaryTextColor": "#000000", "lineColor": "#546e7a"}}}%%
graph TD
    accTitle: Post submission flow
    accDescr: A submitted post is validated, saved, optionally moderated, then published and announced.

    %% Entry
    subgraph EntryPhase["Entry"]
        Start([User submits post])
    end

    %% Input checks
    subgraph ValidationPhase["Validation"]
        Validate{"Valid?"}
        Reject["Reject: return errors"]
    end

    %% Draft handling
    subgraph DraftPhase["Drafting"]
        Save[Save draft]
        PublishNow{"Publish now?"}
        KeepDraft[Keep as draft]
    end

    %% Review
    subgraph ModerationPhase["Moderation"]
        NeedsReview{"Needs review?"}
        Review[Queue for review]
        Approved{"Approved?"}
        Declined["Reject: decline post"]
    end

    %% Going live
    subgraph PublishPhase["Publishing"]
        GoLive[Publish post]
        Email[Email subscribers]
        Push[Push notification]
    end

    Done([Finish])

    Start --> Validate
    Validate -->|No| Reject
    Reject --> Start
    Validate -->|Yes| Save
    Save --> PublishNow
    PublishNow -->|No| KeepDraft
    PublishNow -->|Yes| NeedsReview
    NeedsReview -->|No| GoLive
    NeedsReview -->|Yes| Review
    Review --> Approved
    Approved -->|Yes| GoLive
    Approved -->|No| Declined
    GoLive ==>|fans out| Email & Push
    KeepDraft --> Done
    Declined --> Done
    Email --> Done
    Push --> Done

    classDef terminal fill:#ede7f6,stroke:#4527a0,stroke-width:2px,color:#000
    classDef decision fill:#fce4ec,stroke:#c2185b,stroke-width:2px,color:#000
    classDef process fill:#e0f2f1,stroke:#00695c,stroke-width:2px,color:#000
    classDef error fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#000

    class Start,Done terminal
    class Validate,PublishNow,NeedsReview,Approved decision
    class Save,KeepDraft,Review,GoLive,Email,Push process
    class Reject,Declined error
```

### Flowchart Rules

- Shapes: `([Label])` start or end (`terminal`), `{Label}` decision (`decision`), `[Label]` step (`process`), failure steps get `error` and a "Reject:" or "Error:" label prefix.
- Subgraph ids end in `Phase` (or another suffix) so they never collide with node ids.
- Label every edge leaving a decision: `-->|Yes|`, `-->|No|`, `-->|timeout|`.
- Keep the happy path running top-to-bottom (or left-to-right with `graph LR`).
- Use `&` fan-out on one line for one step that triggers several (`GoLive ==>|fans out| Email & Push`).

## Sequence Template

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#e1f5fe", "primaryBorderColor": "#01579b", "primaryTextColor": "#000000", "lineColor": "#546e7a"}}}%%
sequenceDiagram
    accTitle: Create post request
    accDescr: The client creates a post; the API checks the token, loads the category through the cache, stores the post and responds.
    autonumber
    actor U as User
    participant C as Client
    participant API as API
    participant Svc as PostService
    participant Cache as Cache
    participant DB as Database

    rect rgba(245, 127, 23, 0.12)
        Note over U,API: Auth phase
        U->>C: Submit post
        C->>API: POST /posts
        API->>API: Verify token
    end

    rect rgba(46, 125, 50, 0.12)
        Note over API,DB: Business logic phase
        API->>Svc: createPost(input)
        Svc->>Cache: get category
        Cache-->>Svc: miss
        Svc->>DB: SELECT category
        DB-->>Svc: category row
    end

    rect rgba(106, 27, 154, 0.12)
        Note over Svc,DB: Persistence phase
        Svc->>DB: INSERT post
        DB-->>Svc: post row
        Svc->>Cache: invalidate post list
    end

    rect rgba(230, 81, 0, 0.12)
        Note over U,API: Response phase
        Svc-->>API: post
        API-->>C: 201 Created
        C-->>U: Show success
    end
```

### Sequence Rules

- `actor` for people, `participant` for systems. Short aliases (`API`, `Svc`, `DB`).
- `autonumber` for numbered steps. `->>` for calls, `-->>` for returns, `A->>A: msg` for self-calls.
- Group phases with `rect rgba(R, G, B, 0.12)` blocks. Pick the RGB from the stroke color of the palette role the phase is about: boundary `245, 127, 23` for auth, service `46, 125, 50` for business logic, database `106, 27, 154` for persistence, actor `230, 81, 0` for the response to the user, error `198, 40, 40` for failure handling. The low alpha keeps text readable in light and dark themes.
- Start each `rect` with `Note over X,Y: Phase name`. A note is not a message and does not advance `autonumber`.
- Show failure paths with `alt` / `else` blocks, and retries with `loop`.
- No `&` and no `classDef` in sequence diagrams.

## State Diagram Template

Use for entity lifecycles (order status, payment status, subscription state).

```mermaid
%%{init: {"theme": "base", "themeVariables": {"primaryColor": "#e0f2f1", "primaryBorderColor": "#00695c", "primaryTextColor": "#000000", "lineColor": "#546e7a"}}}%%
stateDiagram-v2
    accTitle: Order lifecycle
    accDescr: An order moves from pending to paid, shipped and delivered, and can be cancelled before shipping.

    [*] --> Pending
    Pending --> Paid : payment captured
    Pending --> Cancelled : customer cancels
    Paid --> Shipped : label printed
    Paid --> Cancelled : refund issued
    Shipped --> Delivered : carrier confirms
    Delivered --> [*]
    Cancelled --> [*]

    classDef error fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#000
    class Cancelled error
```

### State Rules

- State names come from the real enum values. Transition labels name the event or code path that causes them.
- Only draw transitions the code actually allows; list guard conditions in Notes.
- Use `state Name { ... }` for composite states only when the code has sub-states.
