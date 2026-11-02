# Mermaid Syntax Rules and Pitfalls

Read this before writing any diagram and again when a render fails. These rules are stated once here; the templates follow them.

## Identifiers and Labels

- Node ids are alphanumeric plus underscore (`OrderSvc`, `user_roles`). No spaces, dashes, slashes or dots in ids.
- Every id is unique across the whole diagram, including `subgraph` ids. Do not reuse a node id as a subgraph id (for example a `Publish` decision node and a `Publish` subgraph).
- Do not use lowercase `end` as a node id or an unquoted label; it closes blocks. Use `EndProc`, `Finish`, `End`, or a quoted label such as `Stop["end"]`.
- Avoid ids that start with `o` or `x` right after an edge (`A---oB`, `A---xB` parse as circle/cross edges). Add a space or rename.
- Quote any label that contains characters other than letters, digits and spaces: `Route["/users/:id"]`, `Step["Validate (JWT)"]`, `Hook{"Retry?"}`.
- Inside a quoted label, write a double quote as `#quot;` and use `<br/>` for a line break.
- Keep labels short (about 4 words). Put details in the Notes section of the output, not in the node.
- Derive names from the project (real module, table and route names). Never copy example names from the templates into a user's diagram.

## Semicolons

Do not end any statement with `;`. Flowcharts tolerate it, but `erDiagram` and `classDiagram` fail with errors like `Expecting 'EOF', 'SPACE', ... got ';'`. One rule for all types: no semicolons.

## Applying Classes

| Diagram | Define | Apply |
|---|---|---|
| `graph` / `flowchart` | `classDef name ...` | `class A,B,C name` (comma list allowed) or inline `A:::name` |
| `classDiagram` | `classDef name ...` | `cssClass "A,B,C" name` or inline `class A:::name`; never `class A,B name` |
| `erDiagram` | not needed | The theme init directive styles entities. Mermaid 11 also accepts `classDef` + `class A,B name`, but older renderers reject it |
| `sequenceDiagram` | none | Color phases with `rect rgba(...)` blocks |
| `stateDiagram-v2` | `classDef name ...` | `class StateA, StateB name` or inline `StateA:::name` |

## Fan-out with `&`

- `&` works only in `graph` / `flowchart`. It does not work in `erDiagram`, `classDiagram`, `sequenceDiagram` or `stateDiagram-v2`; write one statement per pair there.
- Use it to show one source reaching many targets: `Admin ==>|full access| Billing & Users & Reports`.
- The whole chain stays on one line. A line that starts with `& C` is a parse error.
- Every id in a chain should be declared earlier with its shape. An undeclared id becomes a plain rectangle; a shape written inside a chain is hard to read and easy to break.
- If a chain gets too long, split by source (one statement per source), not the chain itself.

## Grouping

- `subgraph Id["Label"] ... end` in flowcharts. Labels in Title Case. Add a one-line `%%` comment above each group saying what belongs together.
- `namespace Name { ... }` in class diagrams. Namespace names are plain identifiers (`Auth`, `Content`); no spaces or emoji.
- `erDiagram` has no grouping block. Use `%% Auth context` comment headers and split by context when the diagram grows.
- Keep each group to 3-7 items. Past about 12 nodes in total, split into groups or offer separate diagrams.
- Avoid nesting subgraphs more than one level deep.

## Edges

- `-->` direct flow or dependency; `-.->` evaluation, lookup or async; `==>` privileged or high-volume path.
- Label every edge whose meaning is not obvious: `-->|Yes|`, `-->|reads|`, `-->|timeout|`.
- Sequence: `->>` call, `-->>` return. Self-call: `A->>A: msg`.

## Code Fences in Output

When showing a Markdown example that itself contains a fenced ` ```mermaid ` block, wrap the outer example in four backticks (` ```` `). Every fence you open must be closed.

## Common Errors

| Error text (approximate) | Usual cause | Fix |
|---|---|---|
| `got ';'` | semicolon in `erDiagram` / `classDiagram` | Remove semicolons |
| `Expecting 'PS', 'PE', ...` | special characters in an unquoted label, or a broken `&` chain | Quote the label; keep the chain on one line |
| `got 'end'` or a block closes early | node id or label `end` | Rename the node |
| Diagram renders but a subgraph swallows a node | id reused for a node and a subgraph | Make ids unique |
| Directive text shows up as a node | `subgraph` in `erDiagram`, or init directive after the header | Remove the subgraph; move the directive to line 1 |
| ER attribute parse error | type with comma or space, such as `decimal(10,2)` or `character varying` | Sanitize the type (see `erd.md`) |
| `class` line ignored in class diagram | used `class A,B name` | Use `cssClass "A,B" name` |
