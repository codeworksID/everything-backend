# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **欢迎贡献！** 欢迎提交 Issue、Pull Request 以及翻译。请查看 [Issues](../../issues) 和 [Pull Requests](../../pulls) 选项卡开始参与。
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

面向 AI 编程 agent 的后端工程技能集合：项目发现、架构设计、数据库设计、迁移、API 设计、身份认证、代码实现、重构、测试、调试、安全审查、健康检查、运维、部署以及图表。它们可在 **Claude Code**、**Claude.ai**、**OpenCode / OMO**、**Cursor** 和 **Antigravity** 中使用。

## 包含的技能

- `backend-orchestrator`：将请求路由到合适的后端技能，并运行多步骤工作流
- `backend-scan`：探索现有项目并保持记忆文件同步
- `backend-architect`：规划架构与技术栈，并编写 `docs/architecture/overview.md` 和 ADR
- `backend-db-design`：设计数据库 schema 与迁移计划
- `backend-visualize`：生成带主题的 Mermaid 图表（ERD、类图、角色图、流程图、时序图、架构图）
- `backend-api-design`：设计 API 接口及其契约
- `backend-implement`：构建新功能并演进现有代码
- `backend-refactor`：保持行为不变的重构，例如拆分臃肿的 controller 或 service、提取模块、降低耦合、绞杀者模式（strangler fig）以及现代化遗留代码
- `backend-debug`：修复 bug：复现问题、编写失败的测试、定位根因、做出最小修复，并添加回归测试
- `backend-test`：设计测试、fixtures、mocks 与覆盖率
- `backend-auth`：设计与实现身份认证与授权
- `backend-security`：安全审查，涵盖威胁建模、OWASP API Top 10、密钥扫描、SAST 以及供应链检查
- `backend-ops`：日志、指标、链路追踪、缓存、异步消息、配置、弹性模式以及备份/恢复/灾难恢复（DR）
- `backend-deploy`：容器、CI/CD、Kubernetes、发布策略、回滚以及受控的迁移步骤
- `backend-migrate`：schema 演进、数据回填与零停机（expand/contract）迁移
- `backend-doctor`：基于执行的健康检查与针对 diff 范围的审查

共享内容位于 `.agents/skills/_shared/`：

- 每个技能都遵循的规则（`tool-rules.md`、`context-loading.md`、`memory-schema.md`、`principles.md`），其中包括 `sql-safety.md`，即防注入的数据访问规则（只使用绑定参数、标识符走白名单、每个租户或用户所属的行都带上所有者条件，并且在用恶意输入测试通过之前，改动不算完成）
- 各宿主环境的工具名称映射（`host-tools.md`）
- 技术栈参考（`stacks/postgres.md`、`stacks/node-typescript.md`、`stacks/python-fastapi.md`）
- 强制执行脚本（`scripts/checkpoint.js`、`scripts/guard.js`）

每个技能都保持一个简短的 `SKILL.md`，只在需要时才从自身的 `references/` 文件夹加载详细的模板和检查清单。

## 入门指引

1. **`backend-orchestrator`**：如果不确定哪个技能适合你的需求，从这里开始。它会将你路由到正确的技能。
2. **`backend-scan`**：将其指向一个已有的后端仓库，以发现其结构、技术栈和约定。
3. **`backend-architect`**：当你正在规划一个新服务或重构现有服务时使用。
4. **`backend-db-design`**，然后 **`backend-migrate`**：先设计 schema，再安全地编写并执行迁移。
5. **`backend-api-design`**，然后 **`backend-implement`**，然后 **`backend-test`**：定义契约、实现它，再测试它。

之后再按需使用专项技能：

- **`backend-debug`**：出现故障时使用。
- **`backend-security`**：上线之前使用。
- **`backend-auth`**：用于登录与权限。
- **`backend-ops`**：用于生产环境运维。
- **`backend-deploy`**：用于发布交付。
- **`backend-refactor`**：用于在不改变行为的前提下清理代码。
- **`backend-doctor`**：用于健康检查。
- **`backend-visualize`**：用于绘制图表。

## 安装

### Claude Code（推荐：带 guard hook 的插件）

在 Claude Code 中运行：

```text
/plugin marketplace add codeworksID/everything-backend
/plugin install everything-backend@codeworks
```

该插件会安装所有技能以及一个 `PreToolUse` guard hook。该 hook 会让 Claude 在运行以下任何操作之前先询问：

- 破坏性的 git 命令（`reset --hard`、`clean -f`、`checkout -- <path>`、强制推送）
- 执行、重置或删除迁移的命令
- 任何写入数据或 schema 的 SQL（有 `WHERE` 子句也不代表写入是安全的）
- 部署与基础设施命令（`kubectl apply`、`helm upgrade`、`terraform apply`、`docker push`）
- 递归删除
- 编辑密钥文件（`.env`、密钥）

控制该 hook：

- 设置 `EVERYTHING_BACKEND_GUARD=off` 以禁用它。
- 设置 `EVERYTHING_BACKEND_GUARD=strict`，在 commit、push 和安装依赖之前也会询问。

你也可以将这些技能作为普通的 Claude Code 技能安装，不带 hook：

```bash
npx everything-backend --host claude
```

这会将它们复制到 `~/.claude/skills`。如果只用于单个项目，运行 `npx everything-backend`，选择 **Per-project（按项目）**，并选择 `.claude/skills` 布局。

### Claude.ai

Claude.ai 会把整个技能包作为**一个**技能 `everything-backend` 安装，因此所有子技能总是一起安装。子技能之间相互依赖（共享规则、交接、交叉引用），所以不支持只安装其中一部分。构建方法：

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
npm run build:claude
```

然后在 **Settings > Capabilities > Skills** 中上传 `dist/claude/everything-backend.zip`。必须启用代码执行，脚本才能运行。如果你之前上传过单独的 `backend-*` 技能，请先将它们删除。

每次会话开始时，该包都会自检：其入口文件会列出 `skills/`，并运行 `verify.js`（或 `verify.py`）对照 `MANIFEST.json` 进行校验，该文件记录了每个文件的 SHA-256。如果任何子技能或文件缺失或被修改，它会停止并要求你重新上传完整的 zip。

### OpenCode、Cursor、Antigravity

```bash
npx everything-backend
```

安装程序会提示你选择：

1. **Global（全局）**：为某一个应用安装。
   - **Claude Code**：`~/.claude/skills`
   - **Antigravity (Gemini IDE)**：`~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor**：`~/.cursor/skills`
   - **OpenCode / generic**：`~/.agents/skills`
2. **Per-project（按项目）**：询问你的项目路径和布局。布局可以是 `<project>/.agents/skills/`（OpenCode、Cursor、通用）或 `<project>/.claude/skills/`（Claude Code）。

如需在 OpenCode 上强制执行“先询问”规则，请参阅 `_shared/host-tools.md` 中的 `opencode.json` 权限片段。

### 手动安装

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

#### 参数

- `--host <claude|antigravity|cursor|opencode>`：为单个宿主进行全局安装，不显示任何提示
- `--target <path>`：自定义目标路径；会跳过提示并覆盖 `--host`
- `--dry-run`：显示将要复制的内容，但不实际写入文件
- `--force`：覆盖已安装的技能

```bash
node scripts/install.js --dry-run --host claude
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.claude\skills"
```

## 安装内容

安装程序会将 `.agents/skills/` 中的每个技能文件夹以及共享的 `_shared/` 文件夹复制到目标位置。技能会先在自身文件夹内查找 `_shared/`，然后在其旁边查找，因此这些文件夹必须放在一起。

| 目标 | 技能安装位置 | 额外文件 |
|---|---|---|
| Claude Code 插件 | 由 `/plugin` 管理 | guard hook（`hooks/hooks.json`） |
| Claude Code 技能 | `~/.claude/skills/<skill-name>/SKILL.md` | 无 |
| Claude.ai | 一个技能：`everything-backend/skills/<skill-name>/SKILL.md`，附带 `skills/_shared/` | `SKILL.md` 入口文件、`MANIFEST.json`、`verify.js`、`verify.py` |
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | 无 |
| OpenCode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | 无 |
| Per-project（按项目） | `<project>/.agents/skills/` 或 `<project>/.claude/skills/` | 无 |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | 无 |

已存在的技能文件夹会被跳过，除非你传入 `--force`。

## 技能会在你的项目中做什么

- **记忆文件。** 技能会将项目记忆（概览、技术栈、决策、未解决问题、测试策略、部署计划）写入 `.opencode/everything-backend-memory/`。为保持兼容，该文件夹在所有宿主环境中都使用这个名称。检查点和补丁写入 `.opencode/everything-backend-memory/.checkpoints/`。请将 `.checkpoints/` 文件夹加入 `.gitignore`；如果不想提交记忆，也可以加入整个记忆文件夹。
- **交付物。** 部分技能会在你的项目中写入文档：
  - 架构文档与 ADR（`docs/architecture/`、`docs/adr/`）
  - 安全审查报告（`docs/security/`）
  - 运行手册（`docs/runbooks/`）
- **检查点与撤销。** 会修改代码的技能会通过 `_shared/scripts/checkpoint.js` 记录每次运行。你可以通过反向应用该次运行自己的补丁来撤销它。回滚从不使用 `git checkout --`、`reset --hard` 或 `clean`，因此你自己的修改会被保留。
- **默认为 auto 模式。** agent 会直接读取代码并运行本地、封闭的命令，无需询问。这包括 lint、类型检查、构建、单元测试以及只读依赖审计。
- **以下操作始终先询问：**
  - 执行迁移或修改数据库
  - git commit、切换分支、reset、clean、stash、rebase、merge 或 push
  - 删除或覆盖并非由它创建的文件
  - 安装、升级或移除依赖
  - 部署、推送镜像、IaC apply、密钥轮换或调用付费外部 API
  - 编辑 CI/CD 配置或密钥文件
  - 针对任何无法证明是本地的数据库、队列或服务运行测试或应用
- **它绝不会为了让失败的测试通过而跳过或削弱该测试。**
- **交互模式。** 说 "ask me before each step" 即可由你亲自批准每一步。

## 开发

```bash
npm run check          # package, frontmatter, references, fences, plugin manifest
npm test               # guard.js and checkpoint.js tests
npm run build:claude   # Claude.ai bundle: dist/claude/everything-backend.zip
node scripts/install.js --dry-run --target ./tmp-skills
```

`npm run check` 和 `npm test` 都会在 `prepublishOnly` 时运行。`npm run check` 会验证以下内容：

- `bin`/`files` 路径存在
- frontmatter 对 Claude 有效：name 与文件夹名一致，description 不超过 1024 个字符且不含尖括号
- 每个技能都列在本 README 和 `backend-orchestrator` 中
- 每个被引用的 `_shared/` 和 `references/` 文件都存在
- 代码围栏成对闭合
- 插件清单的版本与 `package.json` 一致

## 仓库结构

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

`.opencode/` 不属于本仓库：技能会在运行时于你的项目中创建 `.opencode/everything-backend-memory/`。
