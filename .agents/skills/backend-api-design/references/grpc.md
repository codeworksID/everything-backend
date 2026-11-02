# gRPC Contracts (Basic)

Basic guidance: proto layout, messages, errors, pagination and evolution. For codegen and server setup, follow the language's gRPC docs.

Default path: the existing proto tree, or `proto/<package>/v1/<service>.proto`. If the project uses Buf, keep its `buf.yaml` layout and lint rules.

## Proto Example

```proto
syntax = "proto3";

package acme.users.v1;

import "google/protobuf/field_mask.proto";
import "google/protobuf/timestamp.proto";

option go_package = "example.com/acme/gen/users/v1;usersv1";

service UserService {
  rpc GetUser(GetUserRequest) returns (GetUserResponse);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  rpc UpdateUser(UpdateUserRequest) returns (UpdateUserResponse);
  rpc DeleteUser(DeleteUserRequest) returns (DeleteUserResponse);
}

message User {
  string id = 1;
  string email = 2;
  string name = 3;
  google.protobuf.Timestamp create_time = 4;
}

message GetUserRequest {
  string id = 1;
}

message GetUserResponse {
  User user = 1;
}

message ListUsersRequest {
  int32 page_size = 1;   // server default 20, max 100
  string page_token = 2; // from next_page_token
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2; // empty on the last page
}

message CreateUserRequest {
  string email = 1;
  string name = 2;
  string request_id = 3; // idempotency key for retries
}

message CreateUserResponse {
  User user = 1;
}

message UpdateUserRequest {
  User user = 1;
  google.protobuf.FieldMask update_mask = 2; // fields to change
}

message UpdateUserResponse {
  User user = 1;
}

message DeleteUserRequest {
  string id = 1;
}

message DeleteUserResponse {}
```

## Conventions

- Version in the package name (`acme.users.v1`). A breaking change means a new package (`v2`) served alongside the old one.
- One request and one response message per RPC, even if they are small now, so fields can be added later.
- Fields are snake_case; messages and services PascalCase; enum values UPPER_SNAKE_CASE with the enum name as prefix and a zero value `..._UNSPECIFIED`.
- Use `google.protobuf.Timestamp` for times and `FieldMask` for partial updates.
- List RPCs use `page_size` and an opaque `page_token`, with a server-side maximum.
- Sorting uses an enum (`UserOrderBy { USER_ORDER_BY_UNSPECIFIED = 0; USER_ORDER_BY_CREATED_AT_DESC = 1; ... }`), not a free `string order_by`. If you follow AIP-132's string `order_by`, the server parses it against an allowlist and rejects anything else with `INVALID_ARGUMENT`. Filters are typed fields, or an AIP-160 `filter` string parsed into bound values, never passed to SQL (`_shared/sql-safety.md` rules 2, 10). Proto has no length or format constraints; enforce id format, string lengths and `repeated` item caps with protovalidate (`buf.validate`) or in the handler.

## Errors

Return standard gRPC status codes and map them consistently:

| Situation | Status code |
|---|---|
| Invalid argument | `INVALID_ARGUMENT` |
| Missing or invalid credentials | `UNAUTHENTICATED` |
| Not allowed | `PERMISSION_DENIED` |
| Not found | `NOT_FOUND` |
| Duplicate | `ALREADY_EXISTS` |
| Wrong state, failed precondition | `FAILED_PRECONDITION` |
| Concurrent modification | `ABORTED` |
| Rate limited, quota | `RESOURCE_EXHAUSTED` |
| Dependency down | `UNAVAILABLE` |
| Deadline passed | `DEADLINE_EXCEEDED` |
| Unexpected | `INTERNAL` |

For field-level details, attach the standard error detail messages (`google.rpc.BadRequest`, `google.rpc.ErrorInfo`) rather than encoding them in the message string.

## Evolution Rules

- Never change a field's number or type, and never reuse a field number. When removing a field, add `reserved <number>;` and `reserved "<name>";`.
- Adding fields and RPCs is safe; renaming fields breaks JSON transcoding and generated code.
- Mark old fields or RPCs with `[deprecated = true]` (or `option deprecated = true;` on an RPC) before removal.
- Lint with `buf lint` and check compatibility with `buf breaking` in CI if Buf is available (see `versioning.md`).

## Operational Contract

- Clients must set a deadline on every call; document a sensible default per RPC.
- Mark which RPCs are safe to retry (idempotent reads, and writes with `request_id`).
- Authenticate with per-call metadata (for example a bearer token) or mTLS between services; record the choice via `backend-auth`.
- Browser clients need gRPC-Web or an HTTP/JSON gateway; note it if a browser consumer exists.
- Record the proto path, package version and error mapping in `api-patterns.md`.
