# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **コントリビューション歓迎！** Issue、Pull Request、翻訳、いずれも歓迎します。まずは [Issues](../../issues) タブと [Pull Requests](../../pulls) タブをご覧ください。

再利用可能な Opencode バックエンド向けスキル集。プロジェクトの発見、アーキテクチャ、データベース設計、API 設計、実装、テスト、認証、運用、デプロイ、マイグレーション、可視化、ヘルスチェック、メモリの更新までをカバーします。

## 含まれるスキル

- `backend-orchestrator` — 適切なバックエンドスキルへリクエストを振り分ける
- `backend-scan` — 既存プロジェクトを探索し、メモリファイルを同期する
- `backend-architect` — バックエンドのアーキテクチャと技術スタックを設計する
- `backend-db-design` — データベーススキーマとマイグレーションを設計する
- `backend-visualize` — 美しい Mermaid 図（ERD、クラス、アクター、フローチャート、シーケンス、アーキテクチャ）を生成する
- `backend-api-design` — API エンドポイントと契約を設計する
- `backend-implement` — バックエンドのコードを生成・修正する
- `backend-test` — テスト、fixture、mock、カバレッジを設計する
- `backend-auth` — 認証と認可を設計・実装する
- `backend-ops` — ログ、メトリクス、トレーシング、キャッシュ、非同期メッセージング、設定
- `backend-deploy` — コンテナ、docker-compose、CI/CD、ヘルスプローブ
- `backend-migrate` — スキーマの進化、バックフィル、ゼロダウンタイムマイグレーション
- `backend-doctor` — 実行ベースのヘルスチェックとレビューを実行する

共有の参照ファイルは `.agents/skills/_shared/` にあり、インストールに含まれます。

## はじめに

これらのスキルがはじめての方は、次の順序でお試しください。

1. **`backend-orchestrator`** — どのスキルが適切か迷ったらここから。適切なスキルへルーティングします。
2. **`backend-scan`** — 既存のリポジトリを対象に指定し、構造・スタック・規約を発見します。
3. **`backend-architect`** — 新規サービスの計画や、既存サービスの再構築を行う際に使用します。
4. **`backend-db-design`** — コードを書く前にテーブル、リレーション、インデックス、マイグレーションを設計します。
5. **`backend-api-design`** — エンドポイント、リクエスト/レスポンススキーマ、エラー契約を定義します。
6. **`backend-implement`** — 設計を動作するコードへ変換するか、既存コードを改良します。
7. **`backend-test`** — 続いてテスト、fixture、mock、カバレッジを追加します。

基本を身につけたあとは、必要に応じて専門スキルを活用してください。

- **`backend-auth`** — ログイン、サインアップ、JWT、RBAC、権限関連。
- **`backend-ops`** — ログ、メトリクス、トレーシング、キャッシュ、非同期メッセージング関連。
- **`backend-deploy`** — Docker、CI/CD、インフラ構築関連。
- **`backend-migrate`** — スキーマの進化とゼロダウンタイムマイグレーション関連。
- **`backend-doctor`** — ヘルスチェック、lint、型チェック、コードレビュー関連。
- **`backend-visualize`** — ERD、アーキテクチャ図、フロー図関連。

## インストール

`npx` を使ってインストーラを実行します。

```bash
npx everything-backend
```

インストーラは対話的に動作し、次の選択を求めます。

1. **Global** — スキルをグローバルな IDE/アプリのプラグインとしてインストールします。対象アプリの選択を求められます。
   - **Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills-cursor`
   - **Opencode / generic** — `~/.agents/skills`
2. **Per-project** — プロジェクトのディレクトリパスを尋ね、そのプロジェクト内の `<project-path>/.agents/skills/` にローカルインストールします。

### 代替 / 手動インストール

クローンしてローカルにインストールする場合はこちら。

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### 高度なオプション

`--target` パスで対話プロンプトをスキップできます。

```bash
npx everything-backend --target /path/to/project/.agents/skills
```

#### 利用可能なフラグ

- `--dry-run` — ファイルを書き込まずに、コピー対象の内容のみを表示する
- `--force` — 既存のインストール済みスキルを上書きする
- `--target <path>` — 任意の導入先パスを指定する（対話プロンプトをスキップ）

#### 例

```bash
node scripts/install.js --dry-run
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.agents/skills"
```

## インストールされるもの

インストーラは `.agents/skills/` 配下の全フォルダを Opencode のグローバルスキルディレクトリへコピーします。各スキルは次の形式で配置されます。

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## Opencode での使い方

インストール後はスキル名で呼び出せます。例：

- `backend-orchestrator` — バックエンドのリクエストを適切なサブスキルへルーティング
- `backend-scan` — 既存のバックエンドコードベースを調査しメモリを最新に保つ
- `backend-api-design` — エンドポイントとスキーマを設計
- `backend-visualize` — ERD、クラス図、アーキテクチャ図などを作成
- `backend-implement` — 設計をコードへ変換
- `backend-test` — テストを追加・拡充
- `backend-auth` — 認証と認可を追加
- `backend-doctor` — バックエンドのヘルスチェックを実行

## 開発

実際のグローバルディレクトリを汚さずにインストーラをテストするには：

```bash
node scripts/install.js --dry-run
node scripts/install.js --target ./tmp-skills --force
```

## リポジトリ構成

```text
.agents/skills/        スキル定義
scripts/install.js     NPX/ローカル用インストーラ
.opencode/             プロジェクトローカル Opencode メタデータ
```
