# Increments, Undo, Resume, and Rollback

Detailed procedures for SKILL.md Steps 5 and 9 and for resuming a run. These extend `tool-rules.md` -> Concurrent & Partial Work; they never replace it. `<shared>` is the resolved shared docs folder, `<run-dir>` is `.opencode/everything-backend-memory/.checkpoints/<id>/` (see `baseline-and-verification.md`), and `<files>` is this run's modified files minus `pre_existing_changes[]`.

All commands run from the project root.

## Run-Start Record

After `checkpoint.js start`, record in `<run-dir>`:

- `start-sha.txt`: the output of `git rev-parse HEAD`. Write it with the host's file-write action, not a PowerShell `>` redirect.
- `baseline-results.json`: the normalized baseline (Step 1).

The checkpoint itself (written by `checkpoint.js start`) holds `pre_existing_changes[]`, steps, `created_files[]`, `modified_files[]`, and the patch path.

## Before Each Increment

Write `<run-dir>/in-progress.json` with the increment number and the files it will touch (e.g. `{ "increment": 3, "files": ["src/a.ts", "src/b.ts"] }`), using the host's file-write action. Resume and rollback use it to tell an interrupted increment from outside edits. Delete it, or set `"increment": null`, once the increment is green and snapshotted or has been undone.

## After a Green Increment

1. Record the files the increment touched:
   `node <shared>/scripts/checkpoint.js record --skill backend-refactor --feature <slug> --modified a,b --created c`
2. Snapshot the run's cumulative changes (this rewrites the checkpoint's `.patch`, so it always equals the last green state):
   `node <shared>/scripts/checkpoint.js snapshot --skill backend-refactor --feature <slug>`
3. Save a numbered copy for increment undo:
   `git diff --binary --output=<run-dir>/step-<N>.patch HEAD -- <files>`
4. Copy files this run created into `<run-dir>/step-<N>/created/` (untracked files are not in `git diff`).

## Undoing a Failed Increment

A failed increment is undone at once, then work continues from the last green state. Do not stack broken states.

1. Check that `git rev-parse HEAD` still equals `start-sha.txt`. If it moved, stop and ask (see Committed Increments below).
2. Save the failed state for the report:
   `git diff --binary --output=<run-dir>/failed-<N>.patch HEAD -- <files> <files in in-progress.json>`
3. Reverse it: `git apply -R --check <run-dir>/failed-<N>.patch`, then `git apply -R <run-dir>/failed-<N>.patch`. This returns those files to `HEAD`.
4. Re-apply the last green state: `git apply <run-dir>/step-<N-1>.patch` (skip for the first increment).
5. Delete files this increment created, and restore earlier run-created files from `<run-dir>/step-<N-1>/created/`. The run created them, so no confirmation is needed.
6. If any `git apply` fails because files changed outside this run, stop and show the conflict. Never force it, and never use `git checkout -- <file>`, `git reset --hard`, or `git clean`.

## Committed Increments

The user may commit green increments; commit for them only when they ask (`tool-rules.md` -> Always Ask First). Once `HEAD` moves, patches taken against the old `HEAD` no longer reverse-apply. Stop and ask:

- Undoing committed increments is done only with a `git revert` the user approves, never by reverse-applying patches over them.
- To continue after a user commit, update `start-sha.txt` to the new `HEAD` (with the user's agreement) and take a fresh `step-<N>.patch`.

## Rollback of the Whole Run

When verification fails and the fix is not obvious, or the user asks to undo:

1. Show the user which files this run changed and created (`git diff --stat HEAD -- <files>` and `created_files[]`).
2. Check `HEAD` against `start-sha.txt`; if it moved, follow Committed Increments.
3. If an increment is in progress, undo it first (Undoing a Failed Increment, steps 2-5).
4. Preview: `node <shared>/scripts/checkpoint.js rollback --skill backend-refactor --feature <slug> --dry-run`
5. Apply: `node <shared>/scripts/checkpoint.js rollback --skill backend-refactor --feature <slug>`. It runs `git apply -R --check` first and stops on conflicts; if it does, show the conflicting hunks and stop. Never force it.
6. Created files: list them, ask, and only then re-run rollback with `--delete-created`. This skill never edits files in `pre_existing_changes[]`, so it has no backups to restore; do not pass `--restore-backups`.
7. Close: `node <shared>/scripts/checkpoint.js close --skill backend-refactor --feature <slug> --status abandoned`.

Undo always comes from saved patches, never from a fresh diff: a diff taken at rollback time reverse-applies cleanly and would silently discard edits the user made since.

## Resume

When `checkpoint.js start` exits with code 3, an open checkpoint exists for this feature. Offer to resume or restart (`--restart` marks the old one abandoned).

On resume:

1. Check `HEAD` against `start-sha.txt` (if it moved, follow Committed Increments).
2. Compare `git diff --binary HEAD -- <files>` with the last `step-<N>.patch`:
   - Equal: continue from the next pending step.
   - Extra changes only in files listed in `in-progress.json`: the run was interrupted mid-increment. Show the diff and offer to undo that increment, or stop.
   - Changes in other files, or beyond the in-progress increment: the code changed while the checkpoint was inactive. Stop and show the difference.
3. Re-run the suite and compare against the original `baseline-results.json`, not a fresh baseline.
4. Never re-baseline on half-refactored code. If the baseline must be replaced, roll back to the run-start state first and ask.

## Manual Fallback (No Node)

If Node is not available, follow `tool-rules.md` -> Concurrent & Partial Work by hand:

- Write the checkpoint JSON yourself at `.opencode/everything-backend-memory/.checkpoints/backend-refactor-<slug>-<YYYYMMDDTHHMMSSZ>.json` (UTC, no colons) with the fields listed there.
- Record `git status --porcelain -- . ":(exclude).opencode/everything-backend-memory"` as `pre_existing_changes[]`.
- Write the run patch with `git diff --binary --output=<checkpoint-id>.patch HEAD -- <files>` after each green increment, plus the numbered `step-<N>.patch` copies above.
- Roll back with `git apply -R --check`, then `git apply -R`, exactly as above.
