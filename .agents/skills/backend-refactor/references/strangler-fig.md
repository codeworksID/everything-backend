# Strangler Fig

Use a strangler fig to replace a module or service that is too large or risky to swap in one change. For in-process renames and moves, use an alias or facade instead (see `patterns.md` -> Extract Module).

## When It Fits

- The old implementation sits behind a boundary you can intercept: an HTTP route group, a service interface, a message handler, a CLI command.
- The replacement will take more than one session, or needs to run side by side with the old code before cut-over.
- The change can't be split into small green increments any other way.

## Steps

1. **Define the seam.** Identify the old module's boundary (API surface, handlers, commands) and put a router, facade, or feature flag in front of it. This is a refactor increment of its own: with the flag in its default state, behavior is identical.
2. **Default to the old path.** The flag or router defaults to the old implementation in every environment. The new code is reachable only when the flag is turned on explicitly.
3. **Build the replacement behind the same interface.** Add it next to the old module, never in place of it.
4. **Check parity.** Run the characterization tests against both implementations (parametrize the tests over the flag). For data-returning paths, a shadow compare is useful: call both, return the old result, log differences. Shadow calls must not repeat side effects (writes, emails, payments, events); only shadow read-only paths.
5. **Migrate callers one at a time**, verifying after each against the baseline (SKILL.md Step 7).
6. **Flipping the flag is the user's call.** Turning the new path on in any shared or deployed environment is a configuration change the user makes or approves. The skill may turn it on in local tests only.
7. **Remove the old implementation** once zero callers remain and the user has confirmed the cut-over. Deleting the old files needs confirmation (Deletion rule in SKILL.md Step 5).
8. **Remove the router or flag** once the old code is gone.

## Tracking Across Sessions

A strangler migration often spans several runs. Leave a record so a half-migrated system is never forgotten:

- Append a `decisions.md` entry when the migration starts: what is replaced, the seam, the flag name and default, and the exit criteria. Set its status to Accepted when the old code is removed.
- Keep an open `issues.md` entry ("Strangler migration: <module> in progress") listing migrated and remaining callers. Update it at the end of each run; resolve it when the flag is removed.
- Each run uses its own checkpoint (one feature slug per migration step).

## What "Partial" Means

A strangler fig is partially migrated by design. That is fine as long as every increment is green and the default path is the old one. "Never ship a partially-refactored state" in SKILL.md means never leave the code in a state that is not green against the baseline.

## Done When

- All callers route through the new implementation.
- The old module has zero references and is deleted (with confirmation).
- The router or flag is removed.
- Tests pass against the original baseline (with test-id mappings for moved tests).
- The `decisions.md` entry is updated and the `issues.md` entry is resolved.
