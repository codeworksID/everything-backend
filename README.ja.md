# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **コントリビューション歓迎！** Issue、Pull Request、翻訳、いずれも歓迎します。まずは [Issues](../../issues) タブと [Pull Requests](../../pulls) タブをご覧ください。
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

再利用可能な Opencode バックエンド向けスキル集。プロジェクトの発見、アーキテクチャ、データベース設計、API 設計、実装、テスト、認証、運用、デプロイ、マイグレーション、可視化、ヘルスチェック、メモリの更新までをカバーします。

## 含まれるスキル

- `backend-orchestrator` — 適切なバックエンドスキルへリクエストを振り分ける
- `backend-scan` — 既存プロジェクトを探索し、メモリファイルを同期する
- `backend-architect` — バックエンドのアーキテクチャと技術スタックを設計する
- `backend-db-design` — データベーススキーマとマイグレーション計画を設計する
- `backend-visualize` — 美しい Mermaid 図（ERD、クラス、アクター、フローチャート、シーケンス、アーキテクチャ）を生成する
- `backend-api-design` — API エンドポイントと契約を設計する
- `backend-implement` — バックエンドのコードを生成・修正する
- `backend-refactor` — 振る舞いを変えないリファクタリング：肥大化した controller/service の分割、モジュール抽出、結合度の低減、ストラングラーフィグ、レガシーの近代化
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
4. **`backend-db-design`** — コードを書く前にテーブル、リレーション、インデックス、マイグレーション計画を設計します（マイグレーションファイルの作成と適用は `backend-migrate` が行います）。
5. **`backend-api-design`** — エンドポイント、リクエスト/レスポンススキーマ、エラー契約を定義します。
6. **`backend-implement`** — 設計を動作するコードへ変換するか、既存コードを改良します。
7. **`backend-test`** — 続いてテスト、fixture、mock、カバレッジを追加します。

基本を身につけたあとは、必要に応じて専門スキルを活用してください。

- **`backend-auth`** — ログイン、サインアップ、JWT、RBAC、権限関連。
- **`backend-ops`** — ログ、メトリクス、トレーシング、キャッシュ、非同期メッセージング関連。
- **`backend-deploy`** — Docker、CI/CD、インフラ構築関連。
- **`backend-migrate`** — スキーマの進化とゼロダウンタイムマイグレーション関連。
- **`backend-refactor`** — 肥大化した controller や service の分割、モジュール抽出、結合度の低減、レガシーコードの近代化を、振る舞いを変えずに行う場合。
- **`backend-doctor`** — ヘルスチェック、lint、型チェック、コードレビュー関連。
- **`backend-visualize`** — ERD、アーキテクチャ図、フロー図関連。

## インストール

`npx` を使ってインストーラを実行します。

```bash
npx everything-backend
```

インストーラは対話的に動作し、次の選択を求めます。

1. **Global** — スキルをグローバルな IDE/アプリのプラグインとしてインストールします。対象アプリの選択を求められます。
   - **Antigravity (Gemini IDE)** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills`
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

インストーラは `.agents/skills/` 配下の各スキルフォルダと共有フォルダ `_shared/` を、選択したインストール先へコピーします。スキルは自身のフォルダの隣にある `_shared/` を参照するため、両者は常に同じ場所に置かれます。

| インストール先 | スキルの配置 | 追加ファイル |
|---|---|---|
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | — |
| Opencode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | — |
| Per-project | `<project-path>/.agents/skills/<skill-name>/SKILL.md` | — |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | — |

どの場合も `_shared/` はスキルフォルダの隣に配置されます（例：`~/.agents/skills/_shared/`）。既存のスキルフォルダは `--force` を指定しない限りスキップされます。

## Opencode での使い方

インストール後はスキル名で呼び出せます。例：

- `backend-orchestrator` — バックエンドのリクエストを適切なサブスキルへルーティング
- `backend-scan` — 既存のバックエンドコードベースを調査しメモリを最新に保つ
- `backend-api-design` — エンドポイントとスキーマを設計
- `backend-visualize` — ERD、クラス図、アーキテクチャ図などを作成
- `backend-implement` — 設計をコードへ変換
- `backend-refactor` — 既存コードを振る舞いを変えずに再構成
- `backend-test` — テストを追加・拡充
- `backend-auth` — 認証と認可を追加
- `backend-doctor` — バックエンドのヘルスチェックを実行

## スキルがプロジェクト内で行うこと

- **メモリファイル**：スキルはプロジェクトのメモリ（概要、技術スタック、決定事項、未解決の課題）をプロジェクト内の `.opencode/everything-backend-memory/` に、実行のチェックポイントとパッチを `.opencode/everything-backend-memory/.checkpoints/` に書き込みます。チェックポイントフォルダは `.gitignore` に追加してください。
- **既定は auto モード**：エージェントは確認なしでコードを読み、ローカルで完結するコマンド（lint、型チェック、ビルド、ユニットテスト、読み取り専用の依存関係監査）を実行します。
- **必ず事前に確認する操作**：マイグレーションの適用やデータベースの変更、git の commit・ブランチ切り替え・reset・clean・stash・rebase・merge・push、自身が作成していないファイルの削除や上書き、依存関係の追加・更新・削除、デプロイ・イメージの push・IaC の apply・シークレットのローテーション・有料の外部 API 呼び出し、CI/CD 設定やシークレットファイルの編集、そしてローカルであると証明できないデータベース・キュー・サービスに対するテストやアプリの実行。失敗したテストを通すためにスキップしたり弱めたりすることはありません。
- **対話モード**："ask me before each step" と伝えると、各ステップを自分で承認できます。

## 開発

実際のグローバルディレクトリを汚さずにインストーラをテストするには：

```bash
node scripts/install.js --dry-run --target ./tmp-skills
node scripts/install.js --target ./tmp-skills --force
rm -rf ./tmp-skills   # テスト用インストールを削除（コミットしない）
npm run check
```

`npm run check`（`prepublishOnly` でも実行）は、`bin` と `files` のパスが存在すること、各スキルの frontmatter が有効であること、各スキルが `README.md` と `backend-orchestrator` に記載されていること、参照されている `_shared/` ファイルが存在することを検証します。

## リポジトリ構成

```text
.agents/skills/            スキル定義（スキルごとに 1 フォルダ）
.agents/skills/_shared/    全スキル共通の参照ドキュメント
scripts/install.js         NPX/ローカル用インストーラ
scripts/check-package.js   パッケージとスキルの整合性チェック（npm run check）
docs/                      監査レポート
.github/                   Issue と Pull Request のテンプレート
```

`.opencode/` はこのリポジトリには含まれません。スキルの実行時にプロジェクト内へ `.opencode/everything-backend-memory/` が作成されます。
