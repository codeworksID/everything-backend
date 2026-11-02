# ERD

Read this in Step 6 when drafting the entity-relationship diagram.

`backend-db-design` owns the content of the ERD (entities, keys, relationships). `backend-visualize` owns rendering conventions (theme, layout, file location, export). Draft the ERD here, then hand it to `backend-visualize` when the user wants a rendered or saved diagram, or when the project already keeps diagrams. If `backend-visualize` is not installed, present the Mermaid source as is.

## Content Rules

- One entity per table or collection, named in UPPER_SNAKE plural to match the table name.
- Mark keys: `PK`, `FK`, `UK` (unique). A column that is both: `FK, UK`.
- Show every relationship in the schema, including ones that are easy to forget (for example `USERS ||--o{ COMMENTS`).
- Cardinality must match the constraints: a nullable FK is `|o--o{`, a `NOT NULL` FK is `||--o{`.
- Junction tables appear as entities with two FKs; do not draw M:N directly.
- List only key and meaningful columns for large tables; the DDL is the full source of truth.
- Types are generic (`uuid`, `string`, `text`, `int`, `decimal`, `timestamp`, `bool`, `json`).

## Template

```mermaid
erDiagram
    USERS ||--o{ POSTS : writes
    USERS ||--o{ COMMENTS : writes
    CATEGORIES |o--o{ POSTS : groups
    POSTS ||--o{ COMMENTS : has
    POSTS ||--o{ POST_TAGS : tagged
    TAGS ||--o{ POST_TAGS : labels

    USERS {
        uuid id PK
        string email
        string email_normalized UK
        string status
        timestamp created_at
        timestamp deleted_at
    }
    CATEGORIES {
        uuid id PK
        string name
        string slug UK
    }
    POSTS {
        uuid id PK
        uuid user_id FK
        uuid category_id FK
        string title
        string slug UK
        string status
        int version
        timestamp published_at
    }
    COMMENTS {
        uuid id PK
        uuid post_id FK
        uuid user_id FK
        text body
        timestamp created_at
    }
    TAGS {
        uuid id PK
        string name UK
    }
    POST_TAGS {
        uuid post_id PK, FK
        uuid tag_id PK, FK
    }
```

`email_normalized` is unique only among live rows (partial index); note such conditions in the design summary, since Mermaid cannot show them.
