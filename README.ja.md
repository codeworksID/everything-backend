# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **コントリビューション歓迎！** Issue、Pull Request、翻訳、いずれも歓迎します。まずは [Issues](../../issues) タブと [Pull Requests](../../pulls) タブをご覧ください。
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

AI コーディングエージェント向けのバックエンドエンジニアリングスキル集です。プロジェクトの発見、アーキテクチャ、データベース設計、マイグレーション、API 設計、認証、実装、リファクタリング、テスト、デバッグ、セキュリティレビュー、ヘルスチェック、運用、デプロイ、図の作成までをカバーします。**Claude Code**、**Claude.ai**、**OpenCode / OMO**、**Cursor**、**Antigravity** で動作します。

## 含まれるスキル

- `backend-orchestrator`：適切なバックエンドスキルへリクエストを振り分け、複数ステップのワークフローを実行する
- `backend-scan`：既存プロジェクトを探索し、メモリファイルを同期する
- `backend-architect`：アーキテクチャと技術スタックを計画し、`docs/architecture/overview.md` と ADR を作成する
- `backend-db-design`：データベーススキーマとマイグレーション計画を設計する
- `backend-visualize`：テーマ付きの Mermaid 図（ERD、クラス、アクター、フローチャート、シーケンス、アーキテクチャ）を生成する
- `backend-api-design`：API エンドポイントと契約を設計する
- `backend-implement`：新機能を構築し、既存コードを発展させる
- `backend-refactor`：振る舞いを変えないリファクタリング。肥大化した controller や service の分割、モジュール抽出、結合度の低減、ストラングラーフィグ、レガシーコードの近代化など
- `backend-debug`：バグを再現し、失敗するテストを書き、根本原因を特定し、最小限の修正を行い、回帰テストを追加することでバグを修正する
- `backend-test`：テスト、fixture、mock、カバレッジを設計する
- `backend-auth`：認証と認可を設計・実装する
- `backend-security`：脅威モデリング、OWASP API Top 10、シークレットスキャン、SAST、サプライチェーンのチェックを含むセキュリティレビュー
- `backend-ops`：ログ、メトリクス、トレーシング、キャッシュ、非同期メッセージング、設定、レジリエンスパターン、バックアップ/リストア/DR
- `backend-deploy`：コンテナ、CI/CD、Kubernetes、リリース戦略、ロールバック、承認制のマイグレーションステップ
- `backend-migrate`：スキーマの進化、バックフィル、ゼロダウンタイム（expand/contract）マイグレーション
- `backend-doctor`：実行ベースのヘルスチェックと、差分を対象にしたレビュー

共有の資料は `.agents/skills/_shared/` にあります。

- すべてのスキルが従うルール（`tool-rules.md`、`context-loading.md`、`memory-schema.md`、`principles.md`）。インジェクションに強いデータアクセスのルールを定めた `sql-safety.md` も含みます（値は必ずバインドパラメータで渡す、識別子は許可リストで制限する、テナントやユーザーが所有するすべての行に所有者の条件を付ける、悪意のある入力でのテストを通過するまで変更は完了とみなさない）
- ホストごとのツール名の対応表（`host-tools.md`）
- スタック別リファレンス（`stacks/postgres.md`、`stacks/node-typescript.md`、`stacks/python-fastapi.md`）
- 強制用スクリプト（`scripts/checkpoint.js`、`scripts/guard.js`）

各スキルは短い `SKILL.md` を持ち、詳細なテンプレートやチェックリストは必要なときにだけ自身の `references/` フォルダから読み込みます。

## はじめに

1. **`backend-orchestrator`**：どのスキルが適切か迷ったらここから。適切なスキルへルーティングします。
2. **`backend-scan`**：既存のバックエンドリポジトリを対象に指定し、構造・スタック・規約を発見します。
3. **`backend-architect`**：新規サービスの計画や、既存サービスの再構築を行う際に使用します。
4. **`backend-db-design`**、続いて **`backend-migrate`**：まずスキーマを設計し、その後マイグレーションを安全に作成・適用します。
5. **`backend-api-design`**、続いて **`backend-implement`**、さらに **`backend-test`**：契約を定義し、実装し、テストします。

その後は必要に応じて専門スキルを活用してください。

- **`backend-debug`**：何かが壊れたとき。
- **`backend-security`**：リリース前。
- **`backend-auth`**：ログインと権限関連。
- **`backend-ops`**：本番環境での運用。
- **`backend-deploy`**：リリース作業。
- **`backend-refactor`**：振る舞いを変えずにコードを整理するとき。
- **`backend-doctor`**：ヘルスチェック。
- **`backend-visualize`**：図の作成。

## インストール

### Claude Code（推奨：ガードフック付きプラグイン）

Claude Code 内で次を実行します。

```text
/plugin marketplace add codeworksID/everything-backend
/plugin install everything-backend@codeworks
```

プラグインはすべてのスキルに加えて `PreToolUse` ガードフックをインストールします。このフックにより、Claude は次のいずれかを実行する前に確認を求めます。

- 破壊的な git コマンド（`reset --hard`、`clean -f`、`checkout -- <path>`、force push）
- マイグレーションの apply、reset、drop コマンド
- データやスキーマを書き換えるすべての SQL（`WHERE` 句があっても書き込みは安全になりません）
- デプロイおよびインフラ系コマンド（`kubectl apply`、`helm upgrade`、`terraform apply`、`docker push`）
- 再帰的な削除
- シークレットファイル（`.env`、鍵）の編集

フックの制御方法：

- `EVERYTHING_BACKEND_GUARD=off` を設定すると無効になります。
- `EVERYTHING_BACKEND_GUARD=strict` を設定すると、commit、push、依存関係のインストールの前にも確認を求めます。

フックなしで、通常の Claude Code スキルとしてインストールすることもできます。

```bash
npx everything-backend --host claude
```

これにより `~/.claude/skills` にコピーされます。単一のプロジェクトに導入する場合は、`npx everything-backend` を実行して **Per-project** を選び、`.claude/skills` レイアウトを選択してください。

### Claude.ai

Claude.ai では、パック全体を **1 つ** のスキル `everything-backend` として導入します。そのため、すべてのサブスキルが常にまとめてインストールされます。サブスキルは互いに依存している（共有ルール、引き継ぎ、相互参照）ため、一部のみのインストールはサポートしていません。次のコマンドでビルドします。

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
npm run build:claude
```

その後、`dist/claude/everything-backend.zip` を **Settings > Capabilities > Skills** からアップロードします。スクリプトを実行するには、コード実行が有効になっている必要があります。以前に個別の `backend-*` スキルをアップロードしている場合は、先にそれらを削除してください。

バンドルは毎回のセッション開始時に自己チェックを行います。エントリポイントが `skills/` の一覧を確認し、すべてのファイルの SHA-256 を記録した `MANIFEST.json` に対して `verify.js`（または `verify.py`）を実行します。サブスキルやファイルが欠けている、または変更されている場合は処理を停止し、zip 全体を再アップロードするよう求めます。

### OpenCode、Cursor、Antigravity

```bash
npx everything-backend
```

インストーラは次の選択を求めます。

1. **Global**：1 つのアプリ向けにインストールします。
   - **Claude Code**：`~/.claude/skills`
   - **Antigravity (Gemini IDE)**：`~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor**：`~/.cursor/skills`
   - **OpenCode / generic**：`~/.agents/skills`
2. **Per-project**：プロジェクトのパスとレイアウトを尋ねます。レイアウトは `<project>/.agents/skills/`（OpenCode、Cursor、generic）または `<project>/.claude/skills/`（Claude Code）のいずれかです。

OpenCode で「事前に確認する」ルールを強制するには、`_shared/host-tools.md` にある `opencode.json` の permission スニペットを参照してください。

### 手動インストール

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

#### フラグ

- `--host <claude|antigravity|cursor|opencode>`：1 つのホスト向けにプロンプトなしでグローバルインストールする
- `--target <path>`：任意の導入先を指定する。プロンプトをスキップし、`--host` より優先される
- `--dry-run`：ファイルを書き込まずに、コピー対象の内容のみを表示する
- `--force`：既存のインストール済みスキルを上書きする

```bash
node scripts/install.js --dry-run --host claude
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.claude\skills"
```

## インストールされるもの

インストーラは `.agents/skills/` 配下のすべてのスキルフォルダと共有フォルダ `_shared/` を導入先へコピーします。スキルはまず自身のフォルダ内、次にその隣にある `_shared/` を探すため、フォルダは同じ場所にまとめておく必要があります。

| インストール先 | スキルの配置 | 追加ファイル |
|---|---|---|
| Claude Code プラグイン | `/plugin` が管理 | ガードフック（`hooks/hooks.json`） |
| Claude Code スキル | `~/.claude/skills/<skill-name>/SKILL.md` | なし |
| Claude.ai | 1 つのスキル：`everything-backend/skills/<skill-name>/SKILL.md`（`skills/_shared/` を同梱） | エントリポイントの `SKILL.md`、`MANIFEST.json`、`verify.js`、`verify.py` |
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | なし |
| OpenCode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | なし |
| Per-project | `<project>/.agents/skills/` または `<project>/.claude/skills/` | なし |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | なし |

既存のスキルフォルダは `--force` を指定しない限りスキップされます。

## スキルがプロジェクト内で行うこと

- **メモリファイル。** スキルはプロジェクトのメモリ（概要、技術スタック、決定事項、未解決の課題、テスト戦略、デプロイ計画）を `.opencode/everything-backend-memory/` に書き込みます。互換性のため、このフォルダ名はどのホストでも同じです。チェックポイントとパッチは `.opencode/everything-backend-memory/.checkpoints/` に保存されます。`.checkpoints/` フォルダを `.gitignore` に追加してください。メモリをコミットしたくない場合は、メモリフォルダ全体を追加してください。
- **成果物。** 一部のスキルはプロジェクト内にドキュメントを書き込みます。
  - アーキテクチャドキュメントと ADR（`docs/architecture/`、`docs/adr/`）
  - セキュリティレビュー（`docs/security/`）
  - ランブック（`docs/runbooks/`）
- **チェックポイントと取り消し。** コードを編集するスキルは、各実行を `_shared/scripts/checkpoint.js` で記録します。実行は、その実行自身のパッチを逆適用することで取り消せます。ロールバックでは `git checkout --`、`reset --hard`、`clean` を一切使用しないため、あなた自身の編集は失われません。
- **既定は auto モード。** エージェントは確認なしでコードを読み、ローカルで完結するコマンドを実行します。これには lint、型チェック、ビルド、ユニットテスト、読み取り専用の依存関係監査が含まれます。
- **必ず事前に確認する操作** は次のとおりです。
  - マイグレーションの適用やデータベースの変更
  - git の commit、ブランチ切り替え、reset、clean、stash、rebase、merge、push
  - 自身が作成していないファイルの削除や上書き
  - 依存関係のインストール、更新、削除
  - デプロイ、イメージの push、IaC の apply、シークレットのローテーション、有料の外部 API 呼び出し
  - CI/CD 設定やシークレットファイルの編集
  - ローカルであると証明できないデータベース、キュー、サービスに対するテストやアプリの実行
- **失敗したテストを通すためにスキップしたり弱めたりすることはありません。**
- **対話モード。** "ask me before each step" と伝えると、各ステップを自分で承認できます。

## 開発

```bash
npm run check          # package, frontmatter, references, fences, plugin manifest
npm test               # guard.js and checkpoint.js tests
npm run build:claude   # Claude.ai bundle: dist/claude/everything-backend.zip
node scripts/install.js --dry-run --target ./tmp-skills
```

`npm run check` と `npm test` はどちらも `prepublishOnly` で実行されます。`npm run check` は次の点を検証します。

- `bin`/`files` のパスが存在すること
- frontmatter が Claude 向けに有効であること：name がフォルダ名と一致し、description が 1024 文字以内で山括弧を含まないこと
- すべてのスキルがこの README と `backend-orchestrator` に記載されていること
- 参照されているすべての `_shared/` および `references/` ファイルが存在すること
- コードフェンスの対応が取れていること
- プラグインマニフェストのバージョンが `package.json` と一致すること

## リポジトリ構成

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

`.opencode/` はこのリポジトリには含まれません。スキルの実行時にプロジェクト内へ `.opencode/everything-backend-memory/` が作成されます。
