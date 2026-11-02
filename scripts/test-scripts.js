#!/usr/bin/env node
"use strict";

// Tests for .agents/skills/_shared/scripts/guard.js and checkpoint.js.
// Zero dependencies (node:test + node:assert). Run: node scripts/test-scripts.js

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const scriptsDir = path.resolve(__dirname, "..", ".agents", "skills", "_shared", "scripts");
const guardPath = path.join(scriptsDir, "guard.js");
const checkpointPath = path.join(scriptsDir, "checkpoint.js");
const guard = require(guardPath);

// ---------------------------------------------------------------------------
// guard.js

// [command, expected decision, expected category (for ask), options]
const B = { shell: "bash", mode: "default" };
const PS = { shell: "powershell", mode: "default" };
const STRICT = { shell: "bash", mode: "strict" };
const STRICT_PS = { shell: "powershell", mode: "strict" };

const cases = [
  // read-only commands
  ["git status", "allow", null, B],
  ["git diff --stat HEAD~1", "allow", null, B],
  ["git log --oneline -n 20", "allow", null, B],
  ["ls -la", "allow", null, B],
  ["cat package.json", "allow", null, B],
  ["grep -rn TODO src", "allow", null, B],
  ["npx prisma migrate status", "allow", null, B],
  ["alembic current", "allow", null, B],
  ["alembic history --verbose", "allow", null, B],
  ["kubectl get pods -n prod", "allow", null, B],
  ["kubectl describe deployment api", "allow", null, B],
  ["terraform plan -out tf.plan", "allow", null, B],
  ["helm template ./chart", "allow", null, B],
  ["helm lint ./chart", "allow", null, B],
  ["docker build -t api:dev .", "allow", null, B],
  ["npm test", "allow", null, B],
  ["npx prisma generate", "allow", null, B],
  ["npx drizzle-kit generate", "allow", null, B],
  ["python manage.py makemigrations", "allow", null, B],
  ["dotnet ef migrations add Init", "allow", null, B],
  ["npm run migrate:status", "allow", null, B],
  ["kubectl rollout status deploy/api", "allow", null, B],
  ["kubectl apply -f k8s/ --dry-run=client", "allow", null, B],
  ["helm upgrade --install api ./chart --dry-run", "allow", null, B],
  ["echo 'git reset --hard'", "allow", null, B],
  ["# rm -rf /", "allow", null, B],

  // git history
  ["git checkout -b feat", "allow", null, B],
  ["git checkout main", "allow", null, B],
  ["git switch -c feat/login", "allow", null, B],
  ["git checkout -- src/a.ts", "ask", "git-history", B],
  ["git checkout .", "ask", "git-history", B],
  ["git checkout src/a.ts", "ask", "git-history", B],
  ["git checkout HEAD~1 src/a.ts", "ask", "git-history", B],
  ["git reset --hard HEAD~1", "ask", "git-history", B],
  ["git reset HEAD file.ts", "allow", null, B],
  ["git clean -fd", "ask", "git-history", B],
  ["git clean -nd", "allow", null, B],
  ["git restore --staged x", "allow", null, B],
  ["git restore src/a.ts", "ask", "git-history", B],
  ["git restore --staged --worktree x", "ask", "git-history", B],
  ["git push --force origin main", "ask", "git-history", B],
  ["git push -f", "ask", "git-history", B],
  ["git push --force-with-lease", "ask", "git-history", B],
  ["git push origin +main", "ask", "git-history", B],
  ["git push origin feat", "allow", null, B],
  ["git branch -D old", "ask", "git-history", B],
  ["git branch -d merged", "allow", null, B],
  ["git stash drop", "ask", "git-history", B],
  ["git stash clear", "ask", "git-history", B],
  ["git stash", "allow", null, B],
  ["git -C ../other reset --hard", "ask", "git-history", B],
  ["git status && git reset --hard", "ask", "git-history", B],

  // migrations
  ["npx prisma migrate deploy", "ask", "migration", B],
  ["npx prisma migrate dev", "ask", "migration", B],
  ["pnpm prisma migrate reset --force", "ask", "migration", B],
  ["yarn prisma db push", "ask", "migration", B],
  ["npx drizzle-kit push", "ask", "migration", B],
  ["npx drizzle-kit migrate", "ask", "migration", B],
  ["npx knex migrate:latest", "ask", "migration", B],
  ["npx knex migrate:make add_users", "allow", null, B],
  ["npx sequelize-cli db:migrate", "ask", "migration", B],
  ["npx typeorm migration:run -d src/data-source.ts", "ask", "migration", B],
  ["npx mikro-orm migration:up", "ask", "migration", B],
  ["alembic upgrade head", "ask", "migration", B],
  ["uv run alembic downgrade -1", "ask", "migration", B],
  ["poetry run alembic upgrade head", "ask", "migration", B],
  ["python -m alembic upgrade head", "ask", "migration", B],
  ["python manage.py migrate", "ask", "migration", B],
  ["python manage.py flush --noinput", "ask", "migration", B],
  ["bin/rails db:migrate", "ask", "migration", B],
  ["bundle exec rake db:drop", "ask", "migration", B],
  ["bundle exec rails db:migrate:status", "allow", null, B],
  ["flyway -url=jdbc:x migrate", "ask", "migration", B],
  ["flyway info", "allow", null, B],
  ["liquibase update", "ask", "migration", B],
  ["liquibase update-sql", "allow", null, B],
  ["migrate -path db/migrations -database $DB up", "ask", "migration", B],
  ["goose postgres $DB up", "ask", "migration", B],
  ["goose status", "allow", null, B],
  ["atlas migrate apply --env prod", "ask", "migration", B],
  ["atlas schema apply -u $DB --to file://schema.hcl", "ask", "migration", B],
  ["atlas migrate diff --env dev", "allow", null, B],
  ["dotnet ef database update", "ask", "migration", B],
  ["sqlx migrate run", "ask", "migration", B],
  ["sqlx migrate info", "allow", null, B],
  ["DATABASE_URL=postgres://x npm run db:migrate", "ask", "migration", B],
  ["make migrate", "ask", "migration", B],

  // destructive SQL
  ['psql -c "select 1"', "allow", null, B],
  ['psql -c "DELETE FROM users"', "ask", "destructive-sql", B],
  ['psql -c "DELETE FROM users WHERE id = 5"', "allow", null, B],
  ['psql "$DATABASE_URL" -c "UPDATE users SET admin = true"', "ask", "destructive-sql", B],
  ['psql -c "UPDATE users SET admin = true WHERE id = 1"', "allow", null, B],
  ['psql -c "SELECT * FROM jobs FOR UPDATE SKIP LOCKED"', "allow", null, B],
  ["psql -c 'DROP TABLE users'", "ask", "destructive-sql", B],
  ['psql -c "-- DROP TABLE users\nSELECT 1"', "allow", null, B],
  ["psql -c \"SELECT 'drop table x'\"", "allow", null, B],
  ['mysql -u root -e "TRUNCATE orders"', "ask", "destructive-sql", B],
  ['mysql -e "ALTER TABLE users ADD COLUMN x int"', "ask", "destructive-sql", B],
  ['sqlite3 app.db "DELETE FROM sessions"', "ask", "destructive-sql", B],
  ['sqlite3 app.db ".tables"', "allow", null, B],
  ['mongosh mongodb://localhost/app --eval "db.users.drop()"', "ask", "destructive-sql", B],
  ['mongosh --eval "db.users.find().limit(1)"', "allow", null, B],
  ["psql -f migrations/001.sql", "ask", "destructive-sql", B],
  ["psql < dump.sql", "ask", "destructive-sql", B],
  ['echo "DROP DATABASE app" | psql', "ask", "destructive-sql", B],
  ["psql $DB <<EOF\nDELETE FROM users;\nEOF", "ask", "destructive-sql", B],
  ["psql $DB <<'SQL'\nSELECT count(*) FROM users;\nSQL\necho done", "allow", null, B],
  ["sudo -u postgres psql -c 'DROP DATABASE app'", "ask", "destructive-sql", B],
  ['docker compose exec db psql -U app -c "TRUNCATE events"', "ask", "destructive-sql", B],
  ["redis-cli FLUSHALL", "ask", "destructive-sql", B],

  // deploy and infra
  ["kubectl apply -f k8s/", "ask", "deploy-infra", B],
  ["kubectl delete pod api-123", "ask", "deploy-infra", B],
  ["kubectl rollout undo deploy/api", "ask", "deploy-infra", B],
  ["kubectl scale deploy/api --replicas=0", "ask", "deploy-infra", B],
  ["helm upgrade --install api ./chart", "ask", "deploy-infra", B],
  ["helm uninstall api", "ask", "deploy-infra", B],
  ["helm rollback api 3", "ask", "deploy-infra", B],
  ["terraform apply -auto-approve", "ask", "deploy-infra", B],
  ["tofu destroy", "ask", "deploy-infra", B],
  ["terraform state rm aws_instance.x", "ask", "deploy-infra", B],
  ["pulumi up --yes", "ask", "deploy-infra", B],
  ["pulumi preview", "allow", null, B],
  ["docker push registry/app:1.2", "ask", "deploy-infra", B],
  ["docker compose down -v", "ask", "deploy-infra", B],
  ["docker compose down", "allow", null, B],
  ["fly deploy", "ask", "deploy-infra", B],
  ["vercel --prod", "ask", "deploy-infra", B],
  ["gcloud run deploy api --image x", "ask", "deploy-infra", B],
  ["gcloud run services list", "allow", null, B],
  ["aws cloudformation delete-stack --stack-name x", "ask", "deploy-infra", B],
  ["aws s3 ls s3://bucket", "allow", null, B],
  ["serverless deploy --stage prod", "ask", "deploy-infra", B],
  ["npm run deploy:prod", "ask", "deploy-infra", B],
  ["bash -c \"kubectl apply -f k8s/\"", "ask", "deploy-infra", B],
  ["ssh prod-host 'sudo kubectl delete ns api'", "ask", "deploy-infra", B],
  ["npm publish", "ask", "deploy-infra", B],

  // recursive delete
  ["rm -rf node_modules", "allow", null, B],
  ["rm -rf dist build .next coverage", "allow", null, B],
  ["rm -rf ./packages/api/dist/", "allow", null, B],
  ["rm -rf /tmp/build-123", "allow", null, B],
  ["rm -rf /", "ask", "recursive-delete", B],
  ["rm -rf /tmp/../etc", "ask", "recursive-delete", B],
  // global flags before the subcommand
  ["kubectl -n prod apply -f k8s/", "ask", "deploy-infra", B],
  ["kubectl --context prod delete ns api", "ask", "deploy-infra", B],
  ["kubectl -n prod rollout status deploy/api", "allow", null, B],
  ["helm -n prod upgrade api ./chart", "ask", "deploy-infra", B],
  ["helm -n prod list", "allow", null, B],
  ["docker --context prod compose down -v", "ask", "deploy-infra", B],
  ["docker compose -f compose.prod.yml down -v", "ask", "deploy-infra", B],
  ["docker compose -f compose.yml up -d", "allow", null, B],
  ["aws --profile prod s3 rm s3://bucket --recursive", "ask", "deploy-infra", B],
  ["aws --profile prod s3 ls", "allow", null, B],
  ["pulumi -C infra up", "ask", "deploy-infra", B],
  ["pulumi -C infra preview", "allow", null, B],
  // database-level destructive tools
  ["dropdb app_dev", "ask", "destructive-sql", B],
  ["mysqladmin -u root drop app", "ask", "destructive-sql", B],
  ["pg_restore --clean -d app backup.dump", "ask", "destructive-sql", B],
  ["pg_restore -Fc -d app backup.dump", "allow", null, B],
  // branch resets
  ["git checkout -B main origin/main", "ask", "git-history", B],
  ["git switch -C feat", "ask", "git-history", B],
  ["git switch -c feat", "allow", null, B],
  ["rm -rf ~", "ask", "recursive-delete", B],
  ["rm -rf src", "ask", "recursive-delete", B],
  ["rm -rf .", "ask", "recursive-delete", B],
  ['rm -rf "$DIR/"', "ask", "recursive-delete", B],
  ["rm -rf ../dist", "ask", "recursive-delete", B],
  ["rm src/old.ts", "allow", null, B],
  ["cd api && rm -fr data", "ask", "recursive-delete", B],
  ["FOO=1 sudo rm -rf /var/lib/postgresql", "ask", "recursive-delete", B],
  ["find . -name '*.log' | xargs rm -rf", "ask", "recursive-delete", B],
  ["Remove-Item -Recurse -Force .\\dist", "allow", null, PS],
  ["Remove-Item -Recurse C:\\data", "ask", "recursive-delete", PS],
  ["remove-item -path .\\node_modules -recurse -force", "allow", null, PS],
  ["rm -r -fo src", "ask", "recursive-delete", PS],
  ["Remove-Item .\\old.txt", "allow", null, PS],
  ['Remove-Item -Recurse -Force "$env:TEMP\\eb-test"', "allow", null, PS],
  ["Remove-Item -Recurse -Force -Path .\\build, .\\dist", "allow", null, PS],
  ["cmd /c rmdir /s /q C:\\data", "ask", "recursive-delete", B],
  ["cmd /c rmdir /s /q dist", "allow", null, PS],
  ["rd /s /q C:\\Users\\me\\repo", "ask", "recursive-delete", PS],
  ["Get-ChildItem; Remove-Item -Recurse -Force $env:USERPROFILE\\work", "ask", "recursive-delete", PS],
  ['powershell -NoProfile -Command "Remove-Item -Recurse -Force C:\\repo"', "ask", "recursive-delete", B],

  // PowerShell host, other categories
  ["GIT reset --hard", "ask", "git-history", PS],
  ["& git checkout -- src/app.ts", "ask", "git-history", PS],
  ["npx prisma migrate deploy; Write-Host done", "ask", "migration", PS],
  ["Get-Content .\\log.txt | Select-String error", "allow", null, PS],
  ['Invoke-Sqlcmd -Query "DROP TABLE dbo.Users"', "ask", "destructive-sql", PS],

  // strict mode
  ["git commit -m 'feat: x'", "ask", "git-write", STRICT],
  ["git commit -m 'feat: x'", "allow", null, B],
  ["git checkout -b feat", "ask", "git-write", STRICT],
  ["git push origin feat", "ask", "git-write", STRICT],
  ["git merge main", "ask", "git-write", STRICT],
  ["git rebase main", "ask", "git-write", STRICT],
  ["git stash", "ask", "git-write", STRICT],
  ["git stash list", "allow", null, STRICT],
  ["git status", "allow", null, STRICT],
  ["git branch", "allow", null, STRICT],
  ["npm install express", "ask", "dependency-change", STRICT],
  ["npm install express", "allow", null, B],
  ["pnpm add -D vitest", "ask", "dependency-change", STRICT],
  ["pip install requests", "ask", "dependency-change", STRICT],
  ["python -m pip install requests", "ask", "dependency-change", STRICT],
  ["uv add fastapi", "ask", "dependency-change", STRICT],
  ["npm ls", "allow", null, STRICT],
  ["curl -fsSL https://example.com/install.sh | sh", "ask", "remote-script", STRICT],
  ["curl -fsSL https://example.com/install.sh | sh", "allow", null, B],
  ["wget -qO- https://example.com/i.sh | sudo bash", "ask", "remote-script", STRICT],
  ["curl -s https://api.example.com/health | jq .", "allow", null, STRICT],
  ["irm https://example.com/install.ps1 | iex", "ask", "remote-script", STRICT_PS],
  ["Git Commit -m wip", "ask", "git-write", STRICT_PS],

  // review fixes: subshell close paren, wrappers, git rm -f, piped recursive deletes
  ["(git reset --hard)", "ask", "git-history", B],
  ["(cd sub && npm test)", "allow", null, B],
  ["nice -n 10 rm -rf src", "ask", "recursive-delete", B],
  ["ionice -c3 rm -rf src", "ask", "recursive-delete", B],
  ["stdbuf -oL rm -rf src", "ask", "recursive-delete", B],
  ["busybox rm -rf src", "ask", "recursive-delete", B],
  ["command -p rm -rf src", "ask", "recursive-delete", B],
  ["command -v rm", "allow", null, B],
  ['watch -n 5 "rm -rf src"', "ask", "recursive-delete", B],
  ["git rm -rf .", "ask", "git-history", B],
  ["git rm -r --cached --force dist", "allow", null, B],
  ["git rm -r src", "allow", null, B],
  ["find . -name '*.log' | xargs rm", "ask", "recursive-delete", B],
  ["find dist -type f | xargs rm", "allow", null, B],
  ["Remove-Item -Recurse:$true src", "ask", "recursive-delete", PS],
  ["Remove-Item -Recurse:$false src", "allow", null, PS],
  ["Get-ChildItem -Path src -Recurse | Remove-Item -Force", "ask", "recursive-delete", PS],
  ["gci src -r | rm -Force", "ask", "recursive-delete", PS],
  ["Get-ChildItem dist -Recurse | Remove-Item", "allow", null, PS],
  ["if ($true) { Remove-Item -Recurse src }", "ask", "recursive-delete", PS],
  ["Write-Output (Get-Date)", "allow", null, PS],
  ["Remove-Item (Join-Path $root 'src') -Recurse -Force", "ask", "recursive-delete", PS],
  ["Write-Output (git reset --hard)", "ask", "git-history", PS],
  ["foreach ($d in $dirs) { Remove-Item -Recurse $d }", "ask", "recursive-delete", PS],
];

test("guard: categories are exported", () => {
  assert.ok(Array.isArray(guard.CATEGORIES));
  const ids = guard.CATEGORIES.map((c) => c.id);
  for (const id of ["git-history", "migration", "destructive-sql", "deploy-infra", "recursive-delete", "git-write", "dependency-change", "remote-script"]) {
    assert.ok(ids.includes(id), "missing category " + id);
  }
  assert.equal(typeof guard.classify, "function");
});

test("guard: at least 60 classification cases", () => {
  assert.ok(cases.length >= 60, "only " + cases.length + " cases");
});

for (const [command, decision, category, opts] of cases) {
  const label = "guard[" + opts.mode + "/" + opts.shell + "]: " + JSON.stringify(command) + " -> " + decision;
  test(label, () => {
    const r = guard.classify(command, opts);
    assert.ok(!/could not parse/.test(r.reason), "parser error: " + r.reason);
    assert.equal(r.decision, decision, "reason: " + r.reason + " (category " + r.category + ")");
    if (category) assert.equal(r.category, category, "reason: " + r.reason);
    assert.equal(typeof r.reason, "string");
  });
}

test("guard: empty and garbage input never throws", () => {
  for (const c of ["", "   ", "'unterminated", '"also unterminated', "$((", "|||", "&&", "\\", "`"]) {
    const r = guard.classify(c, B);
    assert.equal(r.decision, "allow");
  }
});

test("guard CLI: exit codes and JSON output", () => {
  const allow = spawnSync(process.execPath, [guardPath, "--", "git status"], { encoding: "utf8" });
  assert.equal(allow.status, 0);
  assert.equal(JSON.parse(allow.stdout).decision, "allow");
  const askRes = spawnSync(process.execPath, [guardPath, "--", "git reset --hard"], { encoding: "utf8" });
  assert.equal(askRes.status, 10);
  assert.equal(JSON.parse(askRes.stdout).category, "git-history");
  const strict = spawnSync(process.execPath, [guardPath, "--strict", "--", "git commit -m x"], { encoding: "utf8" });
  assert.equal(strict.status, 10);
  const ps = spawnSync(process.execPath, [guardPath, "--shell", "powershell", "--", "Remove-Item -Recurse C:\\data"], { encoding: "utf8" });
  assert.equal(ps.status, 10);
  const usage = spawnSync(process.execPath, [guardPath], { encoding: "utf8" });
  assert.equal(usage.status, 2);
});

// ---------------------------------------------------------------------------
// checkpoint.js

function git(cwd, args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + " failed: " + r.stderr);
  return r.stdout;
}

function cp(cwd, args) {
  const r = spawnSync(process.execPath, [checkpointPath, ...args], { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function cpJson(cwd, args) {
  const r = cp(cwd, [...args, "--json"]);
  let data = null;
  try {
    data = JSON.parse(r.out);
  } catch (err) {
    // leave null
  }
  return Object.assign(r, { data });
}

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root, rel, content) {
  const abs = path.join(root, ...rel.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

function read(root, rel) {
  return fs.readFileSync(path.join(root, ...rel.split("/")), "utf8");
}

function exists(root, rel) {
  return fs.existsSync(path.join(root, ...rel.split("/")));
}

function initRepo() {
  const dir = makeTempDir("eb-cp-git-");
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "core.autocrlf", "false"]);
  write(dir, "src/a.ts", "export const a = 1;\n");
  write(dir, "src/b.ts", "export const b = 1;\n");
  write(dir, "README.md", "# demo\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "init"]);
  return dir;
}

const S = ["--skill", "backend-implement", "--feature", "user-registration"];

test("checkpoint: full lifecycle in a git repo", () => {
  const dir = initRepo();
  try {
    // user has a pre-existing change
    write(dir, "README.md", "# demo\nuser notes\n");

    const start = cpJson(dir, ["start", ...S, "--steps", "schema,service,tests"]);
    assert.equal(start.code, 0, start.err);
    const id = start.data.checkpoint.id;
    assert.match(id, /^backend-implement-user-registration-\d{8}T\d{6}Z$/);
    assert.ok(!id.includes(":"));
    assert.deepEqual(start.data.checkpoint.pre_existing_changes, ["README.md"]);
    assert.equal(start.data.checkpoint.git, true);
    assert.deepEqual(start.data.checkpoint.pending_steps, ["schema", "service", "tests"]);
    assert.match(start.err, /pre-existing/);
    assert.ok(exists(dir, ".opencode/everything-backend-memory/.checkpoints/" + id + ".json"));

    // duplicate start -> exit 3
    const dup = cp(dir, ["start", ...S]);
    assert.equal(dup.code, 3);
    assert.match(dup.out, /open checkpoint already exists/i);

    // the memory dir must not count as a user change in later starts
    const status = cpJson(dir, ["status", "--skill", "backend-implement"]);
    assert.equal(status.code, 0);
    assert.equal(status.data.length, 1);

    // backup the pre-existing dirty file before editing it
    const backup = cpJson(dir, ["backup", ...S, "README.md"]);
    assert.equal(backup.code, 0, backup.err);
    assert.deepEqual(backup.data.saved, ["README.md"]);
    write(dir, "README.md", "# demo\nuser notes\nrun edit\n");

    // run edits a tracked file and creates a new one
    write(dir, "src/a.ts", "export const a = 2;\n");
    write(dir, "src/new.ts", "export const n = 1;\n");
    const rec = cpJson(dir, ["record", ...S, "--modified", "src/a.ts", "--created", "src/new.ts", "--done", "schema", "--memory", "db-schema.md"]);
    assert.equal(rec.code, 0, rec.err);
    assert.deepEqual(rec.data.checkpoint.completed_steps, ["schema"]);
    assert.deepEqual(rec.data.checkpoint.pending_steps, ["service", "tests"]);
    assert.ok(rec.data.checkpoint.modified_files.includes("src/a.ts"));
    assert.deepEqual(rec.data.checkpoint.created_files, ["src/new.ts"]);
    assert.deepEqual(rec.data.checkpoint.memory_updates, ["db-schema.md"]);

    // paths outside the project are refused
    const outside = cp(dir, ["record", ...S, "--modified", "../evil.txt"]);
    assert.equal(outside.code, 1);
    assert.match(outside.err, /outside the project root/);

    // snapshot excludes the pre-existing file
    const snap = cpJson(dir, ["snapshot", ...S]);
    assert.equal(snap.code, 0, snap.err);
    assert.deepEqual(snap.data.files, ["src/a.ts"]);
    assert.deepEqual(snap.data.excluded, ["README.md"]);
    const patch = read(dir, snap.data.patch);
    assert.match(patch, /src\/a\.ts/);
    assert.ok(!/README/.test(patch));

    // dry run changes nothing
    const dry = cpJson(dir, ["rollback", ...S, "--dry-run", "--restore-backups", "--delete-created"]);
    assert.equal(dry.code, 0, dry.err);
    assert.equal(dry.data.result, "dry-run");
    assert.equal(read(dir, "src/a.ts"), "export const a = 2;\n");
    assert.ok(exists(dir, "src/new.ts"));

    // rollback without flags keeps backups and created files, but reverses the patch
    const rb = cpJson(dir, ["rollback", ...S]);
    assert.equal(rb.code, 0, rb.err);
    assert.equal(read(dir, "src/a.ts"), "export const a = 1;\n");
    assert.ok(exists(dir, "src/new.ts"), "created file kept without --delete-created");
    assert.equal(read(dir, "README.md"), "# demo\nuser notes\nrun edit\n", "backup not restored without flag");
    assert.deepEqual(rb.data.backups.pending, ["README.md"]);
    assert.deepEqual(rb.data.created.kept, ["src/new.ts"]);

    // checkpoint is now abandoned; no open checkpoint left
    const after = cpJson(dir, ["status"]);
    assert.equal(after.data.length, 0);

    // a closed checkpoint can still be rolled back further with flags (patch already reversed -> conflict-free? it no longer applies)
    // start a fresh run and test the flags
    const s2 = cpJson(dir, ["start", ...S]);
    assert.equal(s2.code, 0, s2.err);
    assert.deepEqual(s2.data.checkpoint.pre_existing_changes.sort(), ["README.md", "src/new.ts"]);
    cpJson(dir, ["backup", ...S, "README.md"]);
    write(dir, "README.md", "changed by run\n");
    write(dir, "src/b.ts", "export const b = 2;\n");
    write(dir, "src/c.ts", "export const c = 1;\n");
    cpJson(dir, ["record", ...S, "--modified", "src/b.ts", "--created", "src/c.ts"]);
    assert.equal(cpJson(dir, ["snapshot", ...S]).code, 0);
    const full = cpJson(dir, ["rollback", ...S, "--restore-backups", "--delete-created"]);
    assert.equal(full.code, 0, full.err);
    assert.equal(read(dir, "src/b.ts"), "export const b = 1;\n");
    assert.equal(read(dir, "README.md"), "# demo\nuser notes\nrun edit\n", "backup restored to the content at backup time");
    assert.ok(!exists(dir, "src/c.ts"), "created file deleted with --delete-created");
    assert.ok(exists(dir, "src/new.ts"), "file from an earlier run is untouched");

    // a second rollback (e.g. after the user approves restoring backups) skips the
    // already-reversed patch instead of reporting a conflict
    const again = cpJson(dir, ["rollback", ...S, "--restore-backups"]);
    assert.equal(again.code, 0, again.err);
    assert.equal(again.data.patch.already_reversed, true);
    assert.equal(read(dir, "src/b.ts"), "export const b = 1;\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint: rollback detects edits made after the snapshot", () => {
  const dir = initRepo();
  try {
    assert.equal(cp(dir, ["start", ...S]).code, 0);
    write(dir, "src/a.ts", "export const a = 2;\n");
    cp(dir, ["record", ...S, "--modified", "src/a.ts"]);
    assert.equal(cp(dir, ["snapshot", ...S]).code, 0);
    // user edits the same line after the snapshot
    write(dir, "src/a.ts", "export const a = 3; // user\n");
    const dry = cpJson(dir, ["rollback", ...S, "--dry-run"]);
    assert.equal(dry.code, 1);
    assert.equal(dry.data.result, "conflict");
    const rb = cpJson(dir, ["rollback", ...S]);
    assert.equal(rb.code, 1);
    assert.match(rb.out, /conflict/);
    assert.equal(read(dir, "src/a.ts"), "export const a = 3; // user\n", "user edit preserved");
    const st = cpJson(dir, ["status", ...S]);
    assert.equal(st.data.length, 1, "checkpoint stays open after a failed rollback");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint: restart, close, usage and validation", () => {
  const dir = initRepo();
  try {
    const first = cpJson(dir, ["start", ...S]);
    assert.equal(first.code, 0);
    const restarted = cpJson(dir, ["start", ...S, "--restart"]);
    assert.equal(restarted.code, 0, restarted.err);
    assert.notEqual(restarted.data.checkpoint.id, first.data.checkpoint.id);
    const all = cpJson(dir, ["status", "--all"]);
    const old = all.data.find((c) => c.id === first.data.checkpoint.id);
    assert.equal(old.status, "abandoned");

    const closed = cpJson(dir, ["close", ...S]);
    assert.equal(closed.code, 0);
    assert.equal(closed.data.checkpoint.status, "completed");
    assert.equal(cp(dir, ["close", ...S]).code, 1, "nothing open to close");

    assert.equal(cp(dir, ["start", "--skill", "Backend_Impl", "--feature", "x"]).code, 2, "bad slug");
    assert.equal(cp(dir, ["start", "--skill", "backend-implement"]).code, 2, "missing feature");
    assert.equal(cp(dir, ["frobnicate"]).code, 2, "unknown command");
    assert.equal(cp(dir, []).code, 2, "no command");
    assert.equal(cp(dir, ["close", ...S, "--status", "weird"]).code, 2);
    assert.equal(cp(dir, ["record", ...S, "--done", "x"]).code, 1, "no open checkpoint");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("checkpoint: rollback refuses tampered paths and ids", () => {
  const dir = initRepo();
  const outside = makeTempDir("eb-cp-outside-");
  try {
    write(outside, "victim/keep.txt", "keep me\n");
    const start = cpJson(dir, ["start", ...S]);
    assert.equal(start.code, 0, start.err);
    const id = start.data.checkpoint.id;
    const file = path.join(dir, ".opencode", "everything-backend-memory", ".checkpoints", id + ".json");
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    data.created_files = [path.relative(dir, path.join(outside, "victim")).split(path.sep).join("/")];
    fs.writeFileSync(file, JSON.stringify(data));
    const rb = cpJson(dir, ["rollback", ...S, "--delete-created"]);
    assert.equal(rb.code, 1);
    assert.match(rb.err, /invalid created file path/);
    assert.ok(fs.existsSync(path.join(outside, "victim", "keep.txt")), "file outside the project untouched");

    data.created_files = [];
    data.backups = [{ file: "src/a.ts", copy: "../../evil" }];
    fs.writeFileSync(file, JSON.stringify(data));
    assert.match(cp(dir, ["rollback", ...S, "--restore-backups"]).err, /invalid backup copy path/);

    // an id that is not a plain checkpoint id is ignored entirely
    data.id = "../../evil-20260101T000000Z";
    data.backups = [];
    fs.writeFileSync(file, JSON.stringify(data));
    const st = cpJson(dir, ["status", "--all"]);
    assert.equal(st.data.length, 0);
    assert.match(st.err, /invalid id/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test("checkpoint: --delete-created never removes pre-existing user files", () => {
  const dir = initRepo();
  try {
    // untracked user work that exists before the run
    write(dir, "notes/todo.md", "user todo\n");
    write(dir, "drafts/idea.md", "user idea\n");
    assert.equal(cp(dir, ["start", ...S]).code, 0);
    write(dir, "notes/run.md", "run file\n");
    write(dir, "gen/out.ts", "export {};\n");
    // a skill wrongly records whole directories (and a user file) as created
    const rec = cpJson(dir, ["record", ...S, "--created", "notes,drafts/idea.md,gen"]);
    assert.equal(rec.code, 0, rec.err);
    const rb = cpJson(dir, ["rollback", ...S, "--delete-created"]);
    assert.equal(rb.code, 0, rb.err);
    assert.deepEqual(rb.data.created.skipped_preexisting.sort(), ["drafts/idea.md", "notes"]);
    assert.deepEqual(rb.data.created.deleted, ["gen"]);
    assert.equal(read(dir, "notes/todo.md"), "user todo\n");
    assert.equal(read(dir, "drafts/idea.md"), "user idea\n");
    assert.ok(!exists(dir, "gen/out.ts"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("guard-hook: secret files, decisions and bad input", () => {
  const hookPath = path.join(__dirname, "..", "hooks", "guard-hook.js");
  const hook = require(hookPath);
  for (const f of [".env", "C:\\app\\.env.local", "certs/server.pem", "deploy.key", "id_rsa", "~/.ssh/id_ed25519", "id_ecdsa", "credentials.json"]) {
    assert.ok(hook.isSecretFile(f), f);
  }
  for (const f of [".env.example", "id_rsa.pub", "id_ed25519.pub", "src/app.ts", "", null]) {
    assert.ok(!hook.isSecretFile(f), String(f));
  }
  const run = (input) => spawnSync(process.execPath, [hookPath], { input, encoding: "utf8" });
  const askRes = run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "git reset --hard" } }));
  assert.equal(askRes.status, 0);
  assert.equal(JSON.parse(askRes.stdout).hookSpecificOutput.permissionDecision, "ask");
  for (const bad of ["", "not json{", "null", "[]", JSON.stringify({ tool_name: "Bash", tool_input: { command: 42 } })]) {
    const r = run(bad);
    assert.equal(r.status, 0, bad);
    assert.equal(r.stdout, "", bad);
  }
});

test("install: --force refuses a target inside the skills source", () => {
  const installPath = path.join(__dirname, "install.js");
  const source = path.join(__dirname, "..", ".agents", "skills");
  const r = spawnSync(process.execPath, [installPath, "--dry-run", "--force", "--target", source], { encoding: "utf8" });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout + r.stderr, /inside the skills source/);
  assert.ok(fs.existsSync(path.join(source, "_shared", "scripts", "guard.js")), "source intact");
});

test("checkpoint: non-git project", () => {
  const dir = makeTempDir("eb-cp-nogit-");
  try {
    write(dir, "app/main.py", "print('v1')\n");
    const start = cpJson(dir, ["start", "--skill", "backend-debug", "--feature", "fix-login"]);
    assert.equal(start.code, 0, start.err);
    assert.equal(start.data.checkpoint.git, false);
    const F = ["--skill", "backend-debug", "--feature", "fix-login"];
    assert.equal(cp(dir, ["backup", ...F, "app/main.py"]).code, 0);
    write(dir, "app/main.py", "print('v2')\n");
    write(dir, "app/extra.py", "x = 1\n");
    const rec = cpJson(dir, ["record", ...F, "--modified", "app/main.py", "--created", "app/extra.py"]);
    assert.equal(rec.code, 0);
    assert.deepEqual(rec.data.warnings, []);
    const snap = cp(dir, ["snapshot", ...F]);
    assert.equal(snap.code, 0);
    assert.match(snap.out, /no-op/);

    const noFlags = cpJson(dir, ["rollback", ...F, "--dry-run"]);
    assert.equal(noFlags.code, 0);
    assert.deepEqual(noFlags.data.backups.pending, ["app/main.py"]);

    const rb = cpJson(dir, ["rollback", ...F, "--restore-backups", "--delete-created"]);
    assert.equal(rb.code, 0, rb.err);
    assert.equal(read(dir, "app/main.py"), "print('v1')\n");
    assert.ok(!exists(dir, "app/extra.py"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
