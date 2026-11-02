# Frameworks and Commands

Read this to detect the test runner, pick run and coverage commands per stack, choose a framework for a project without tests, and handle flaky tests. If the stack has a file in `<shared>/stacks/`, its Testing section takes precedence for that stack.

Every command below that is not a hermetic unit run still goes through the Target Check in SKILL.md first.

## Detect the Runner

Read the manifest and test config; do not guess from folder names alone.

| Stack | Signals | Runner |
|---|---|---|
| Node.js / TypeScript | `package.json` `scripts.test`, devDependencies, `vitest.config.*`, `jest.config.*`, `.mocharc*`, `node --test` in scripts | Vitest, Jest, Mocha, or the built-in `node:test` |
| Python | `[tool.pytest.ini_options]` in `pyproject.toml`, `pytest.ini`, `tox.ini`, `setup.cfg`, `conftest.py`; `manage.py` for Django | pytest (with pytest-django for Django), or `unittest` / `manage.py test` |
| Go | `go.mod`, `*_test.go` files | `go test` |
| Java (Maven) | `pom.xml`, `mvnw` | Surefire (unit), Failsafe (integration, `*IT` classes) |
| Java / Kotlin (Gradle) | `build.gradle`, `build.gradle.kts`, `gradlew` | Gradle `test` task (JUnit Platform) |
| .NET | `*.csproj` referencing `Microsoft.NET.Test.Sdk`, xunit, NUnit or MSTest | `dotnet test` |
| Rust | `Cargo.toml` | `cargo test` |
| Ruby | `Gemfile` with rspec-rails or minitest, `spec/` or `test/` | `bundle exec rspec`, `bin/rails test` |
| PHP | `composer.json` with phpunit or pest, `phpunit.xml*` | `vendor/bin/phpunit`, `vendor/bin/pest` |

Pick the package manager or wrapper from what the project already uses:

- Node: `packageManager` field in package.json first; else the lockfile: `pnpm-lock.yaml` -> pnpm, `yarn.lock` -> yarn, `bun.lock` or `bun.lockb` -> bun, `package-lock.json` -> npm. Run scripts with that manager (`pnpm test`, `yarn test`, `bun run test`, `npm test`).
- Python: `uv.lock` -> `uv run pytest`, `poetry.lock` -> `poetry run pytest`, `pdm.lock` -> `pdm run pytest`; otherwise the active virtualenv's `pytest` (or `python -m pytest`).
- Java: prefer the wrappers `./mvnw` and `./gradlew` (on Windows `mvnw.cmd`, `gradlew.bat`) over global `mvn` and `gradle`.
- Prefer the project's own scripts (`test:unit`, `test:integration`, Makefile targets) over raw runner commands, after reading what they do.

## Run Commands

| Runner | Full suite | One file | One test by name |
|---|---|---|---|
| Vitest | `npx vitest run` (never bare `vitest` in automation: it starts watch mode) | `npx vitest run src/users/user.service.test.ts` | `npx vitest run -t "rejects duplicate email"` |
| Jest | `npx jest` | `npx jest src/users/user.service.test.ts` | `npx jest -t "rejects duplicate email"` |
| node:test | `node --test` | `node --test test/user.test.js` | `node --test --test-name-pattern="duplicate"` |
| pytest | `pytest -q` | `pytest tests/unit/test_users.py` | `pytest tests/unit/test_users.py::test_rejects_duplicate_email` or `-k duplicate` |
| Django | `python manage.py test` | `python manage.py test users.tests.test_api` | `python manage.py test users.tests.test_api.UserApiTests.test_create` |
| Go | `go test ./...` | `go test ./internal/users` | `go test ./internal/users -run TestCreateUser` |
| Maven | `./mvnw test` (unit), `./mvnw verify` (adds Failsafe ITs) | `./mvnw test -Dtest=UserServiceTest` | `./mvnw test -Dtest=UserServiceTest#rejectsDuplicateEmail` |
| Gradle | `./gradlew test` | `./gradlew test --tests "com.acme.users.UserServiceTest"` | `./gradlew test --tests "com.acme.users.UserServiceTest.rejectsDuplicateEmail"` |
| .NET | `dotnet test` | `dotnet test tests/Users.Tests` | `dotnet test --filter "FullyQualifiedName~RejectsDuplicateEmail"` |
| Rust | `cargo test` | `cargo test --test users` | `cargo test rejects_duplicate_email` |
| RSpec | `bundle exec rspec` | `bundle exec rspec spec/models/user_spec.rb` | `bundle exec rspec spec/models/user_spec.rb:42` |

Notes:

- Through npm scripts, pass runner flags after `--`: `npm test -- -t "name"`. pnpm and yarn pass them directly.
- Go caches test results. Use `-count=1` to force a real run, and `-race` for code with goroutines or shared state.
- Show failures in full: avoid quiet flags that hide assertion output when debugging (`pytest -q` is fine; `-x` stops at the first failure).

## Coverage Commands

Pick one metric and record it in `test-strategy.md` -> Coverage Target: line coverage, or branch coverage where the tool supports it. Record the scope too (source paths measured, paths excluded such as generated code, migrations, test files). Compare before and after only with the same command, metric and scope.

| Runner | Command | Where the number is |
|---|---|---|
| Vitest | `npx vitest run --coverage --coverage.reporter=text-summary` (needs `@vitest/coverage-v8` or `@vitest/coverage-istanbul`) | "Lines" and "Branches" in the text summary |
| Jest | `npx jest --coverage --coverageReporters=text-summary` | text summary |
| node:test | `node --test --experimental-test-coverage` (recent Node LTS), or `npx c8 node --test` if c8 is installed | coverage table at the end |
| pytest | `pytest --cov=<package> --cov-branch --cov-report=term-missing` (needs pytest-cov) | `TOTAL` line; missing lines per file |
| coverage.py | `coverage run -m pytest` then `coverage report -m` | `TOTAL` line |
| Go | `go test ./... -coverprofile=coverage.out` then `go tool cover -func=coverage.out` | last line `total:` (statement coverage); add `-covermode=atomic` with `-race` |
| Maven | `./mvnw verify` with the JaCoCo plugin configured | `target/site/jacoco/index.html` or `jacoco.csv` |
| Gradle | `./gradlew test jacocoTestReport` with the `jacoco` plugin applied | `build/reports/jacoco/test/html/index.html` |
| .NET | `dotnet test --collect:"XPlat Code Coverage"` (coverlet.collector) | `TestResults/*/coverage.cobertura.xml` (`line-rate`, `branch-rate`) |
| Rust | `cargo llvm-cov` (cargo-llvm-cov installed) | summary table |
| RSpec / Minitest | SimpleCov started in the spec or test helper | `coverage/.last_run.json` |

Rules:

- If the coverage tool or plugin is not installed or configured, report coverage as "not measured". Adding a dependency or editing build config to enable it is Always Ask First.
- Never estimate coverage from the number of tests or files.
- Default targets when the project has none: about 80% line coverage on services and domain code; every repository method and transaction path exercised by at least one integration test; every endpoint covered for success and failure by a contract test. Record the agreed target in `test-strategy.md`.
- Coverage is a signal, not the goal. Flag modules at 0% and large uncovered branches, and watch for tests that run code without asserting anything. Track the trend across runs rather than chasing one absolute number.
- Code that no test can reach may be dead. Report it; removing it is a production change for `backend-refactor`, not for backend-test.

## Choosing a Framework

Use what the project already has. For a project with no tests, propose the stack's common default, show the install command, and ask before installing:

- **Node.js / TypeScript**: Vitest (natural fit for TypeScript and ESM) or Jest; Supertest for Express and NestJS HTTP tests, `app.inject()` for Fastify.
- **Python**: pytest with pytest-cov; factory-boy or polyfactory for factories; httpx `AsyncClient` with `ASGITransport` for FastAPI; pytest-django for Django.
- **Go**: the standard `testing` package with `net/http/httptest`; testify is optional.
- **Java / Kotlin**: JUnit Jupiter with AssertJ and Mockito. JUnit 6 requires Java 17 or later; stay on JUnit 5 for older Java. Use the Spring Boot test starter for Spring projects.
- **.NET**: xUnit or NUnit, with `WebApplicationFactory` for ASP.NET Core API tests.
- **Any stack with a real database**: Testcontainers (available for Node, Python, Java, Go and .NET).

Use the current stable release of each tool; do not pin versions from memory.

## Flaky Tests

A test is flaky when it passes and fails on the same code.

1. Confirm it: run only that test repeatedly. Go: `go test ./pkg -run TestX -count=50`. Other runners: loop the single-test command in the shell (or use a repeat plugin the project already has).
2. Check the usual causes: shared mutable state between tests, test order dependence, real time or time zones, unordered collections compared as ordered, races and missing awaits, fixed ports, leftover database rows, network calls to real services.
3. Fix the cause: isolate state, inject a fixed clock, sort before comparing, await or synchronize explicitly, use random free ports, isolate the database per test.
4. Do not add retries, longer sleeps, or skips to hide flakiness. If the cause is not found, report the test as flaky with the failure rate and evidence, and record it in `test-strategy.md` -> Flaky Tests with an `issues.md` entry.

Randomized ordering (pytest-randomly, `go test -shuffle=on`, Jest `--randomize`, Vitest `--sequence.shuffle`) helps surface order dependence; use it only when the project already does or the user agrees.
