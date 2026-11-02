# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Terbuka untuk kontribusi!** Issue, pull request, dan terjemahan semuanya diterima. Lihat tab [Issues](../../issues) dan [Pull Requests](../../pulls) untuk memulai.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Skill rekayasa backend untuk agen AI coding: penemuan proyek, arsitektur, desain basis data, migrasi, desain API, autentikasi, implementasi, refactoring, pengujian, debugging, review keamanan, pemeriksaan kesehatan, operasi, deployment, dan diagram. Skill ini berjalan di **Claude Code**, **Claude.ai**, **OpenCode / OMO**, **Cursor**, dan **Antigravity**.

## Skill yang tersedia

- `backend-orchestrator`: mengarahkan permintaan ke skill backend yang tepat dan menjalankan alur kerja multi-langkah
- `backend-scan`: mengeksplorasi proyek yang sudah ada dan menjaga file memori tetap sinkron
- `backend-architect`: merencanakan arsitektur dan tech stack, serta menulis `docs/architecture/overview.md` dan ADR
- `backend-db-design`: merancang skema basis data dan rencana migrasi
- `backend-visualize`: menghasilkan diagram Mermaid bertema (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design`: merancang endpoint API dan kontraknya
- `backend-implement`: membangun fitur baru dan mengembangkan kode yang sudah ada
- `backend-refactor`: refactoring tanpa mengubah perilaku, seperti memecah controller atau service yang gemuk, mengekstrak modul, mengurangi coupling, strangler fig, dan memodernisasi kode legacy
- `backend-debug`: memperbaiki bug dengan mereproduksi bug, menulis tes yang gagal, menemukan akar masalah, membuat perbaikan minimal, dan menambahkan tes regresi
- `backend-test`: merancang tes, fixture, mock, dan cakupan (coverage)
- `backend-auth`: merancang dan mengimplementasikan autentikasi serta otorisasi
- `backend-security`: review keamanan yang mencakup threat modeling, OWASP API Top 10, pemindaian secret, SAST, dan pemeriksaan supply chain
- `backend-ops`: logging, metrics, tracing, caching, async messaging, konfigurasi, pola resiliensi, serta backup/restore/DR
- `backend-deploy`: container, CI/CD, Kubernetes, strategi rilis, rollback, dan langkah migrasi yang dijaga persetujuan
- `backend-migrate`: evolusi skema, backfill, dan migrasi zero-downtime (expand/contract)
- `backend-doctor`: pemeriksaan kesehatan berbasis eksekusi dan review yang dibatasi pada diff

Materi bersama berada di `.agents/skills/_shared/`:

- aturan yang diikuti setiap skill (`tool-rules.md`, `context-loading.md`, `memory-schema.md`, `principles.md`), termasuk `sql-safety.md`, aturan akses data yang kebal injeksi (hanya parameter terikat, identifier dari allowlist, predikat pemilik pada setiap baris milik tenant atau pengguna, dan tes dengan input berbahaya sebelum sebuah perubahan dianggap selesai), serta `secure-coding.md`, aturan untuk semua hal lainnya (S1-S18: tanpa mass assignment, tanpa shell atau `eval`, path file yang dibatasi, panggilan keluar yang aman dari SSRF, parser yang aman, kriptografi yang teruji, tanpa secret di kode maupun log, sumber daya yang dibatasi, webhook yang diverifikasi, supply chain yang di-pin), yang diperiksa oleh `scripts/security-scan.js` bawaan
- peta nama tool untuk setiap host (`host-tools.md`)
- referensi stack (`stacks/postgres.md`, `stacks/node-typescript.md`, `stacks/python-fastapi.md`)
- skrip penegakan aturan (`scripts/checkpoint.js`, `scripts/guard.js`)

Setiap skill memiliki `SKILL.md` yang ringkas dan memuat template serta checklist detailnya dari folder `references/` miliknya sendiri hanya saat dibutuhkan.

## Mulai dari mana

1. **`backend-orchestrator`**: mulai dari sini jika Anda tidak yakin skill mana yang sesuai dengan permintaan Anda. Skill ini akan mengarahkan Anda ke skill yang tepat.
2. **`backend-scan`**: arahkan ke repositori backend yang sudah ada untuk menemukan struktur, stack, dan konvensinya.
3. **`backend-architect`**: gunakan ini ketika Anda merencanakan layanan baru atau merestrukturisasi layanan yang sudah ada.
4. **`backend-db-design`**, lalu **`backend-migrate`**: rancang skema terlebih dahulu, lalu tulis dan terapkan migrasi dengan aman.
5. **`backend-api-design`**, lalu **`backend-implement`**, lalu **`backend-test`**: definisikan kontraknya, bangun, lalu uji.

Setelah itu, gunakan skill khusus sesuai kebutuhan:

- **`backend-debug`** ketika ada yang rusak.
- **`backend-security`** sebelum rilis.
- **`backend-auth`** untuk login dan permissions.
- **`backend-ops`** untuk operasional di production.
- **`backend-deploy`** untuk pengiriman (shipping).
- **`backend-refactor`** untuk merapikan kode tanpa mengubah perilaku.
- **`backend-doctor`** untuk health check.
- **`backend-visualize`** untuk diagram.

## Instalasi

### Claude Code (direkomendasikan: plugin dengan guard hook)

Di dalam Claude Code:

```text
/plugin marketplace add codeworksID/everything-backend
/plugin install everything-backend@codeworks
```

Plugin ini menginstal semua skill beserta guard hook `PreToolUse`. Hook ini membuat Claude bertanya terlebih dahulu sebelum menjalankan salah satu dari hal berikut:

- perintah git yang destruktif (`reset --hard`, `clean -f`, `checkout -- <path>`, force push)
- perintah apply, reset, atau drop migrasi
- SQL apa pun yang menulis data atau skema (klausa `WHERE` tidak membuat penulisan menjadi aman)
- perintah deploy dan infrastruktur (`kubectl apply`, `helm upgrade`, `terraform apply`, `docker push`)
- penghapusan rekursif
- pengeditan file rahasia (`.env`, key)
- penulisan kode yang tidak aman: setiap `Write` atau `Edit` dipindai dengan `security-scan.js`, dan temuan kritis atau tinggi (SQL yang dirangkai dari string, pemanggilan shell, `eval`, deserializer tidak aman, TLS yang dimatikan, secret di kode, mass assignment, SSRF, path traversal) memerlukan konfirmasi Anda

Untuk mengatur hook:

- Setel `EVERYTHING_BACKEND_GUARD=off` untuk menonaktifkannya.
- Setel `EVERYTHING_BACKEND_GUARD=strict` agar juga bertanya sebelum commit, push, dan instalasi dependensi.

Anda juga dapat menginstal skill sebagai skill Claude Code biasa, tanpa hook:

```bash
npx everything-backend --host claude
```

Perintah itu menyalinnya ke `~/.claude/skills`. Untuk satu proyek saja, jalankan `npx everything-backend`, pilih **Per-project**, lalu pilih layout `.claude/skills`.

### Claude.ai

Claude.ai mendapatkan seluruh paket sebagai **satu** skill, `everything-backend`, sehingga setiap sub-skill selalu terinstal bersama. Sub-skill saling bergantung (aturan bersama, handoff, rujukan silang), jadi instalasi sebagian tidak didukung. Build paketnya:

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
npm run build:claude
```

Lalu unggah `dist/claude/everything-backend.zip` di **Settings > Capabilities > Skills**. Code execution harus diaktifkan agar skrip dapat berjalan. Jika sebelumnya Anda mengunggah skill `backend-*` satu per satu, hapus skill tersebut terlebih dahulu.

Di awal setiap sesi, bundle memeriksa dirinya sendiri: entry point-nya menampilkan isi `skills/` dan menjalankan `verify.js` (atau `verify.py`) terhadap `MANIFEST.json`, yang berisi SHA-256 dari setiap file. Jika ada sub-skill atau file yang hilang atau berubah, bundle berhenti dan meminta Anda mengunggah ulang zip lengkapnya.

### OpenCode, Cursor, Antigravity

```bash
npx everything-backend
```

Installer akan meminta Anda memilih:

1. **Global**: menginstal untuk satu aplikasi.
   - **Claude Code**: `~/.claude/skills`
   - **Antigravity (Gemini IDE)**: `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor**: `~/.cursor/skills`
   - **OpenCode / generic**: `~/.agents/skills`
2. **Per-project**: meminta path proyek Anda dan sebuah layout. Layout-nya adalah `<project>/.agents/skills/` (OpenCode, Cursor, generic) atau `<project>/.claude/skills/` (Claude Code).

Untuk menegakkan aturan "tanya dulu" di OpenCode, lihat cuplikan permission `opencode.json` di `_shared/host-tools.md`.

### Instalasi manual

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

#### Flag

- `--host <claude|antigravity|cursor|opencode>`: instalasi global untuk satu host, tanpa prompt
- `--target <path>`: path tujuan khusus; melewati prompt dan mengesampingkan `--host`
- `--dry-run`: menampilkan apa yang akan disalin tanpa menulis file
- `--force`: menimpa skill yang sudah terinstal

```bash
node scripts/install.js --dry-run --host claude
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.claude\skills"
```

## Apa yang diinstal

Installer menyalin setiap folder skill dari `.agents/skills/` beserta folder bersama `_shared/` ke target. Skill mencari `_shared/` di dalam foldernya sendiri terlebih dahulu, lalu di sampingnya, jadi folder-folder tersebut harus tetap berada bersama.

| Target | Skill diinstal sebagai | File tambahan |
|---|---|---|
| Claude Code plugin | dikelola oleh `/plugin` | guard hook (`hooks/hooks.json`) |
| Claude Code skills | `~/.claude/skills/<skill-name>/SKILL.md` | tidak ada |
| Claude.ai | satu skill: `everything-backend/skills/<skill-name>/SKILL.md`, dengan `skills/_shared/` | entry point `SKILL.md`, `MANIFEST.json`, `verify.js`, `verify.py` |
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | tidak ada |
| OpenCode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | tidak ada |
| Per-project | `<project>/.agents/skills/` atau `<project>/.claude/skills/` | tidak ada |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | tidak ada |

Installer melewati folder skill yang sudah ada kecuali Anda memberikan `--force`.

## Apa yang dilakukan skill di proyek Anda

- **File memori.** Skill menulis memori proyek (overview, tech stack, keputusan, issue terbuka, strategi pengujian, rencana deployment) ke `.opencode/everything-backend-memory/`. Folder ini tetap memakai nama tersebut di setiap host, demi kompatibilitas. Checkpoint dan patch disimpan di `.opencode/everything-backend-memory/.checkpoints/`. Tambahkan folder `.checkpoints/` ke `.gitignore`, atau seluruh folder memori jika Anda tidak ingin meng-commit memori.
- **Deliverable.** Beberapa skill menulis dokumen ke dalam proyek Anda:
  - dokumen arsitektur dan ADR (`docs/architecture/`, `docs/adr/`)
  - review keamanan (`docs/security/`)
  - runbook (`docs/runbooks/`)
- **Checkpoint dan undo.** Skill yang mengedit kode mencatat setiap run dengan `_shared/scripts/checkpoint.js`. Anda dapat membatalkan sebuah run dengan menerapkan kebalikan dari patch run tersebut. Rollback tidak pernah memakai `git checkout --`, `reset --hard`, atau `clean`, sehingga editan Anda sendiri tetap aman.
- **Mode auto adalah default.** Agen membaca kode dan menjalankan perintah lokal yang hermetis tanpa bertanya. Ini mencakup lint, type-check, build, unit test, dan audit dependensi read-only.
- **Agen selalu bertanya dulu** sebelum melakukan salah satu dari hal berikut:
  - menerapkan migrasi atau mengubah basis data
  - git commit, pindah branch, reset, clean, stash, rebase, merge, atau push
  - menghapus atau menimpa file yang tidak dibuatnya
  - menginstal, meng-upgrade, atau menghapus dependensi
  - deploy, push image, IaC apply, rotasi secret, atau panggilan API eksternal berbayar
  - mengedit file CI/CD atau file rahasia
  - menjalankan tes atau aplikasi terhadap basis data, queue, atau layanan yang tidak terbukti lokal
- **Agen tidak pernah melewati atau melemahkan tes yang gagal** agar lulus.
- **Mode interaktif.** Katakan "ask me before each step" untuk menyetujui setiap langkah sendiri.

## Pengembangan

```bash
npm run check          # package, frontmatter, references, fences, plugin manifest
npm test               # guard.js and checkpoint.js tests
npm run build:claude   # Claude.ai bundle: dist/claude/everything-backend.zip
node scripts/install.js --dry-run --target ./tmp-skills
```

`npm run check` dan `npm test` keduanya dijalankan saat `prepublishOnly`. `npm run check` memverifikasi hal-hal berikut:

- path `bin`/`files` ada
- frontmatter valid untuk Claude: nama cocok dengan folder, dan deskripsi paling banyak 1024 karakter tanpa tanda kurung sudut
- setiap skill tercantum di README ini dan di `backend-orchestrator`
- setiap file `_shared/` dan `references/` yang dirujuk ada
- code fence seimbang
- versi manifest plugin cocok dengan `package.json`

## Struktur repositori

```text
.agents/skills/<skill>/SKILL.md      Skill entry points (one folder per skill)
.agents/skills/<skill>/references/   Detail loaded on demand
.agents/skills/_shared/              Shared rules, host tool map, stack references
.agents/skills/_shared/scripts/      checkpoint.js and guard.js
.claude-plugin/                      Claude Code plugin manifest and marketplace
hooks/                               Claude Code guard hook
scripts/install.js                   NPX/local installer
scripts/build-claude-skills.js       Claude.ai bundle builder
packaging/claude-ai/                 Bundle entry point and verifiers
scripts/check-package.js             Consistency check (npm run check)
scripts/test-scripts.js              Script tests (npm test)
docs/                                Audit reports
.github/                             Issue and pull request templates
```

`.opencode/` bukan bagian dari repositori ini: skill membuat `.opencode/everything-backend-memory/` di dalam proyek Anda saat dijalankan.
