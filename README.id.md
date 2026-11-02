# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Terbuka untuk kontribusi!** Issue, pull request, dan terjemahan semuanya diterima. Lihat tab [Issues](../../issues) dan [Pull Requests](../../pulls) untuk memulai.
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

Skill backend Opencode yang dapat digunakan kembali, mencakup penemuan proyek, arsitektur, desain basis data, desain API, implementasi, pengujian, autentikasi, operasi, deployment, migrasi, visualisasi, pemeriksaan kesehatan, dan penyegaran memori.

## Skill yang tersedia

- `backend-orchestrator` — mengarahkan permintaan ke skill backend yang tepat
- `backend-scan` — mengeksplorasi proyek yang sudah ada dan menyinkronkan file memori
- `backend-architect` — merancang arsitektur backend dan pemilihan tech stack
- `backend-db-design` — merancang skema basis data dan rencana migrasi
- `backend-visualize` — menghasilkan diagram Mermaid yang indah (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design` — merancang endpoint API dan kontraknya
- `backend-implement` — membuat atau memodifikasi kode backend
- `backend-refactor` — refactoring tanpa mengubah perilaku: memecah controller/service yang gemuk, mengekstrak modul, mengurangi coupling, strangler fig, memodernisasi kode legacy
- `backend-test` — merancang tes, fixture, mock, dan cakupan (coverage)
- `backend-auth` — merancang dan mengimplementasikan autentikasi serta otorisasi
- `backend-ops` — logging, metrics, tracing, caching, async messaging, dan konfigurasi
- `backend-deploy` — container, docker-compose, CI/CD, dan health probe
- `backend-migrate` — evolusi skema, backfill, dan migrasi zero-downtime
- `backend-doctor` — menjalankan pemeriksaan kesehatan dan review berbasis eksekusi

File referensi bersama berada di `.agents/skills/_shared/` dan disertakan dalam instalasi.

##从哪里开始 / Where to start

Jika Anda baru mengenal skill-skill ini, coba dalam urutan berikut:

1. **`backend-orchestrator`** — Tidak yakin skill mana yang sesuai dengan permintaan Anda? Mulai dari sini dan skill ini akan mengarahkan Anda ke yang tepat.
2. **`backend-scan`** — Arahkan ke repositori backend yang sudah ada untuk menemukan struktur, stack, dan konvensinya.
3. **`backend-architect`** — Gunakan ini ketika Anda merencanakan layanan baru atau merestrukturisasi layanan yang sudah ada.
4. **`backend-db-design`** — Rancang tabel, relasi, indeks, dan rencana migrasi sebelum menulis kode (`backend-migrate` yang menulis dan menerapkan file migrasinya).
5. **`backend-api-design`** — Definisikan endpoint, skema request/response, dan kontrak error.
6. **`backend-implement`** — Ubah desain menjadi kode yang berfungsi, atau kembangkan kode yang sudah ada.
7. **`backend-test`** — Tambahkan tes, fixture, mock, dan cakupan (coverage) selanjutnya.

Setelah dasar-dasarnya, gunakan skill khusus sesuai kebutuhan:

- **`backend-auth`** — untuk login, signup, JWT, RBAC, dan permissions.
- **`backend-ops`** — untuk logging, metrics, tracing, caching, dan async messaging.
- **`backend-deploy`** — untuk Docker, CI/CD, dan setup infrastruktur.
- **`backend-migrate`** — untuk evolusi skema dan migrasi zero-downtime.
- **`backend-refactor`** — untuk memecah controller dan service yang gemuk, mengekstrak modul, mengurangi coupling, dan memodernisasi kode legacy tanpa mengubah perilaku.
- **`backend-doctor`** — untuk health check, linting, type check, dan code review.
- **`backend-visualize`** — untuk diagram ERD, arsitektur, dan alur.

## 安装 / Installation

Jalankan installer menggunakan `npx`:

```bash
npx everything-backend
```

Installer akan berjalan secara interaktif dan meminta Anda memilih:

1. **Global** — Menginstal skill sebagai plugin IDE/aplikasi global. Anda akan diminta memilih aplikasi target:
   - **Antigravity (Gemini IDE)** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills`
   - **Opencode / generic** — `~/.agents/skills`
2. **Per-project** — Meminta path direktori proyek Anda dan menginstal skill secara lokal di dalam `<project-path>/.agents/skills/`.

### 安装替代方案 / Alternative / Manual installation

Jika Anda lebih suka mengkloning dan menginstal secara lokal:

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### 高级选项 / Advanced Options

Anda dapat melewati prompt interaktif dengan menentukan path `--target`:

```bash
npx everything-backend --target /path/to/project/.agents/skills
```

#### 可用标志 / Available flags

- `--dry-run` — menampilkan apa yang akan disalin tanpa menulis file
- `--force` — menimpa skill yang sudah terinstal
- `--target <path>` — path tujuan khusus (melewati prompt interaktif)

#### 示例 / Examples

```bash
node scripts/install.js --dry-run
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.agents/skills"
```

## 安装内容 / What gets installed

Installer menyalin setiap folder skill dari `.agents/skills/` beserta folder bersama `_shared/` ke target yang Anda pilih. Skill mencari `_shared/` di samping foldernya sendiri, jadi keduanya selalu berada bersama.

| Target | Skill diinstal sebagai | File tambahan |
|---|---|---|
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | — |
| Opencode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | — |
| Per-project | `<project-path>/.agents/skills/<skill-name>/SKILL.md` | — |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | — |

`_shared/` selalu ditempatkan di samping folder skill (misalnya `~/.agents/skills/_shared/`). Folder skill yang sudah ada dilewati kecuali Anda memberikan `--force`.

## Opencode 中的使用 / Usage in Opencode

Setelah instalasi, skill tersedia berdasarkan nama. Contoh:

- `backend-orchestrator` — mengarahkan permintaan backend ke sub-skill yang tepat
- `backend-scan` — memeriksa codebase backend yang sudah ada dan menjaga memori tetap terbaru
- `backend-api-design` — merancang endpoint dan skema
- `backend-visualize` — menggambar ERD, class diagram, diagram arsitektur, dan lainnya
- `backend-implement` — mengubah desain menjadi kode
- `backend-refactor` — merestrukturisasi kode yang ada tanpa mengubah perilaku
- `backend-test` — menambah atau memperluas tes
- `backend-auth` — menambah autentikasi dan otorisasi
- `backend-doctor` — menjalankan health check backend

## Apa yang dilakukan skill di proyek Anda

- **File memori**: skill menulis memori proyek (overview, tech stack, keputusan, issue terbuka) ke `.opencode/everything-backend-memory/` di proyek Anda, serta checkpoint dan patch run ke `.opencode/everything-backend-memory/.checkpoints/`. Tambahkan folder checkpoint ke `.gitignore`.
- **Mode auto adalah default**: agen membaca kode dan menjalankan perintah lokal yang hermetis (lint, type-check, build, unit test, audit dependensi read-only) tanpa bertanya.
- **Agen selalu bertanya dulu** sebelum menerapkan migrasi atau mengubah basis data; git commit, pindah branch, reset, clean, stash, rebase, merge, atau push; menghapus atau menimpa file yang tidak dibuatnya; menginstal, meng-upgrade, atau menghapus dependensi; deploy, push image, IaC apply, rotasi secret, atau panggilan API eksternal berbayar; mengedit file CI/CD atau file rahasia; serta menjalankan tes atau aplikasi terhadap basis data, queue, atau layanan yang tidak terbukti lokal. Agen tidak pernah melewati atau melemahkan tes yang gagal agar lulus.
- **Mode interaktif**: katakan "ask me before each step" untuk menyetujui setiap langkah sendiri.

## 开发 / Development

Untuk menguji installer tanpa menyentuh direktori global Anda yang sebenarnya:

```bash
node scripts/install.js --dry-run --target ./tmp-skills
node scripts/install.js --target ./tmp-skills --force
rm -rf ./tmp-skills   # hapus hasil instalasi uji; jangan di-commit
npm run check
```

`npm run check` (juga dijalankan saat `prepublishOnly`) memverifikasi bahwa path `bin` dan `files` ada, setiap skill memiliki frontmatter yang valid, setiap skill tercantum di `README.md` dan di `backend-orchestrator`, dan setiap file `_shared/` yang dirujuk ada.

## 仓库布局 / Repository layout

```text
.agents/skills/            Definisi skill (satu folder per skill)
.agents/skills/_shared/    Dokumen referensi bersama untuk semua skill
scripts/install.js         Installer NPX/lokal
scripts/check-package.js   Pemeriksaan konsistensi paket dan skill (npm run check)
docs/                      Laporan audit
.github/                   Template issue dan pull request
```

`.opencode/` bukan bagian dari repositori ini: skill membuat `.opencode/everything-backend-memory/` di dalam proyek Anda saat dijalankan.
