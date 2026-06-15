# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **Terbuka untuk kontribusi!** Issue, pull request, dan terjemahan semuanya diterima. Lihat tab [Issues](../../issues) dan [Pull Requests](../../pulls) untuk memulai.

Skill backend Opencode yang dapat digunakan kembali, mencakup penemuan proyek, arsitektur, desain basis data, desain API, implementasi, pengujian, autentikasi, operasi, deployment, migrasi, visualisasi, pemeriksaan kesehatan, dan penyegaran memori.

## Skill yang tersedia

- `backend-orchestrator` — mengarahkan permintaan ke skill backend yang tepat
- `backend-scan` — mengeksplorasi proyek yang sudah ada dan menyinkronkan file memori
- `backend-architect` — merancang arsitektur backend dan pemilihan tech stack
- `backend-db-design` — merancang skema basis data dan migrasi
- `backend-visualize` — menghasilkan diagram Mermaid yang indah (ERD, class, actor, flowchart, sequence, architecture)
- `backend-api-design` — merancang endpoint API dan kontraknya
- `backend-implement` — membuat atau memodifikasi kode backend
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
4. **`backend-db-design`** — Rancang tabel, relasi, indeks, dan migrasi sebelum menulis kode.
5. **`backend-api-design`** — Definisikan endpoint, skema request/response, dan kontrak error.
6. **`backend-implement`** — Ubah desain menjadi kode yang berfungsi, atau kembangkan kode yang sudah ada.
7. **`backend-test`** — Tambahkan tes, fixture, mock, dan cakupan (coverage) selanjutnya.

Setelah dasar-dasarnya, gunakan skill khusus sesuai kebutuhan:

- **`backend-auth`** — untuk login, signup, JWT, RBAC, dan permissions.
- **`backend-ops`** — untuk logging, metrics, tracing, caching, dan async messaging.
- **`backend-deploy`** — untuk Docker, CI/CD, dan setup infrastruktur.
- **`backend-migrate`** — untuk evolusi skema dan migrasi zero-downtime.
- **`backend-doctor`** — untuk health check, linting, type check, dan code review.
- **`backend-visualize`** — untuk diagram ERD, arsitektur, dan alur.

## 安装 / Installation

Jalankan installer menggunakan `npx`:

```bash
npx everything-backend
```

Installer akan berjalan secara interaktif dan meminta Anda memilih:

1. **Global** — Menginstal skill sebagai plugin IDE/aplikasi global. Anda akan diminta memilih aplikasi target:
   - **Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills-cursor`
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

Installer menyalin setiap folder dari `.agents/skills/` ke direktori skill Opencode global Anda. Setiap skill diinstal sebagai:

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## Opencode 中的使用 / Usage in Opencode

Setelah instalasi, skill tersedia berdasarkan nama. Contoh:

- `backend-orchestrator` — mengarahkan permintaan backend ke sub-skill yang tepat
- `backend-scan` — memeriksa codebase backend yang sudah ada dan menjaga memori tetap terbaru
- `backend-api-design` — merancang endpoint dan skema
- `backend-visualize` — menggambar ERD, class diagram, diagram arsitektur, dan lainnya
- `backend-implement` — mengubah desain menjadi kode
- `backend-test` — menambah atau memperluas tes
- `backend-auth` — menambah autentikasi dan otorisasi
- `backend-doctor` — menjalankan health check backend

## 开发 / Development

Untuk menguji installer tanpa menyentuh direktori global Anda yang sebenarnya:

```bash
node scripts/install.js --dry-run
node scripts/install.js --target ./tmp-skills --force
```

## 仓库布局 / Repository layout

```text
.agents/skills/        Skill definitions
scripts/install.js     NPX/local installer
.opencode/             Project-local Opencode metadata
```
