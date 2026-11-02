# everything-backend

> **Languages / Bahasa / Idiomas / 语言 / 言語:**
> [English](README.md) · [Bahasa Indonesia](README.id.md) · [Español](README.es.md) · [中文](README.zh.md) · [日本語](README.ja.md)

> **欢迎贡献！** 欢迎提交 Issue、Pull Request 以及翻译。请查看 [Issues](../../issues) 和 [Pull Requests](../../pulls) 选项卡开始参与。
>
> [![GitHub issues](https://img.shields.io/github/issues/codeworksID/everything-backend)](../../issues) [![good first issue](https://img.shields.io/github/issues/codeworksID/everything-backend/good%20first%20issue?color=7057ff&label=good%20first%20issue)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) [![help wanted](https://img.shields.io/github/issues/codeworksID/everything-backend/help%20wanted?color=008672&label=help%20wanted)](../../issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22)

可复用的 Opencode 后端技能集合，涵盖项目发现、架构设计、数据库设计、API 设计、代码实现、测试、身份认证、运维、部署、迁移、可视化、健康检查以及记忆刷新。

## 包含的技能

- `backend-orchestrator` — 将请求路由到合适的后端技能
- `backend-scan` — 探索现有项目并保持记忆文件同步
- `backend-architect` — 规划后端架构与技术栈选型
- `backend-db-design` — 设计数据库 schema 与迁移计划
- `backend-visualize` — 生成精美的 Mermaid 图表（ERD、类图、角色图、流程图、时序图、架构图）
- `backend-api-design` — 设计 API 接口及其契约
- `backend-implement` — 生成或修改后端代码
- `backend-refactor` — 保持行为不变的重构：拆分臃肿的 controller/service、提取模块、降低耦合、绞杀者模式（strangler fig）、现代化遗留代码
- `backend-test` — 设计测试、fixtures、mocks 与覆盖率
- `backend-auth` — 设计与实现身份认证与授权
- `backend-ops` — 日志、指标、链路追踪、缓存、异步消息与配置
- `backend-deploy` — 容器、docker-compose、CI/CD 与健康探针
- `backend-migrate` — schema 演进、数据回填与零停机迁移
- `backend-doctor` — 基于执行运行健康检查与审查

共享的参考文件位于 `.agents/skills/_shared/`，并随安装一起提供。

## 入门指引

如果你是第一次接触这些技能，建议按以下顺序尝试：

1. **`backend-orchestrator`** — 不确定哪个技能适合你的需求？从这里开始，它会将你路由到正确的技能。
2. **`backend-scan`** — 将其指向一个已有的后端仓库，以发现其结构、技术栈和约定。
3. **`backend-architect`** — 当你正在规划一个新服务或重构现有服务时使用。
4. **`backend-db-design`** — 在写代码之前先设计表、关系、索引和迁移计划（迁移文件由 `backend-migrate` 编写并执行）。
5. **`backend-api-design`** — 定义端点、请求/响应 schema 与错误契约。
6. **`backend-implement`** — 将设计转化为可运行的代码，或演进现有代码。
7. **`backend-test`** — 接下来添加测试、fixtures、mocks 与覆盖率。

掌握基础之后，再按需使用专项技能：

- **`backend-auth`** — 用于登录、注册、JWT、RBAC 与权限。
- **`backend-ops`** — 用于日志、指标、链路追踪、缓存与异步消息。
- **`backend-deploy`** — 用于 Docker、CI/CD 与基础设施搭建。
- **`backend-migrate`** — 用于 schema 演进与零停机迁移。
- **`backend-refactor`** — 用于在不改变行为的前提下拆分臃肿的 controller 与 service、提取模块、降低耦合以及现代化遗留代码。
- **`backend-doctor`** — 用于健康检查、lint、类型检查与代码审查。
- **`backend-visualize`** — 用于 ERD、架构图与流程图。

## 安装

使用 `npx` 运行安装程序：

```bash
npx everything-backend
```

安装程序将以交互方式运行，并提示你选择：

1. **Global（全局）** — 将技能作为全局 IDE/应用插件安装。你将被要求选择目标应用：
   - **Antigravity (Gemini IDE)** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills`
   - **Opencode / generic** — `~/.agents/skills`
2. **Per-project（按项目）** — 询问你的项目目录路径，并将技能本地安装到 `<project-path>/.agents/skills/`。

### 替代 / 手动安装

如果你更倾向于克隆并本地安装：

```bash
git clone https://github.com/codeworksID/everything-backend.git
cd everything-backend
node scripts/install.js
```

### 高级选项

你可以通过指定 `--target` 路径来跳过交互式提示：

```bash
npx everything-backend --target /path/to/project/.agents/skills
```

#### 可用参数

- `--dry-run` — 显示将要复制的内容，但不实际写入文件
- `--force` — 覆盖已安装的技能
- `--target <path>` — 自定义目标路径（跳过交互式提示）

#### 示例

```bash
node scripts/install.js --dry-run
node scripts/install.js --target "C:\Users\you\Documents\GitHub\my-project\.agents/skills"
```

## 安装内容

安装程序会将 `.agents/skills/` 中的每个技能文件夹以及共享的 `_shared/` 文件夹复制到你选择的目标位置。技能会在自身文件夹旁查找 `_shared/`，因此两者始终放在一起。

| 目标 | 技能安装位置 | 额外文件 |
|---|---|---|
| Antigravity (Gemini IDE) | `~/.gemini/config/plugins/everything-backend-plugin/skills/<skill-name>/SKILL.md` | `plugin.json` (name, version) |
| Cursor | `~/.cursor/skills/<skill-name>/SKILL.md` | — |
| Opencode / generic | `~/.agents/skills/<skill-name>/SKILL.md` | — |
| Per-project（按项目） | `<project-path>/.agents/skills/<skill-name>/SKILL.md` | — |
| `--target <path>` | `<path>/<skill-name>/SKILL.md` | — |

在所有情况下，`_shared/` 都位于技能文件夹旁边（例如 `~/.agents/skills/_shared/`）。已存在的技能文件夹会被跳过，除非你传入 `--force`。

## 在 Opencode 中使用

安装完成后，技能即可按名称调用。示例：

- `backend-orchestrator` — 将后端请求路由到正确的子技能
- `backend-scan` — 检查现有后端代码库并保持记忆更新
- `backend-api-design` — 设计端点与 schema
- `backend-visualize` — 绘制 ERD、类图、架构图等
- `backend-implement` — 将设计转化为代码
- `backend-refactor` — 在不改变行为的前提下重构现有代码
- `backend-test` — 添加或扩展测试
- `backend-auth` — 添加身份认证与授权
- `backend-doctor` — 运行后端健康检查

## 技能会在你的项目中做什么

- **记忆文件**：技能会将项目记忆（概览、技术栈、决策、未解决问题）写入项目中的 `.opencode/everything-backend-memory/`，并将运行检查点和补丁写入 `.opencode/everything-backend-memory/.checkpoints/`。请将检查点文件夹加入 `.gitignore`。
- **默认为 auto 模式**：agent 会直接读取代码并运行本地、封闭的命令（lint、类型检查、构建、单元测试、只读依赖审计），无需询问。
- **以下操作始终先询问**：执行迁移或修改数据库；git commit、切换分支、reset、clean、stash、rebase、merge 或 push；删除或覆盖并非由它创建的文件；安装、升级或移除依赖；部署、推送镜像、IaC apply、密钥轮换或调用付费外部 API；编辑 CI/CD 配置或密钥文件；以及针对任何无法证明是本地的数据库、队列或服务运行测试或应用。它绝不会为了让失败的测试通过而跳过或削弱该测试。
- **交互模式**：说 "ask me before each step" 即可由你亲自批准每一步。

## 开发

要在不触碰真实全局目录的情况下测试安装程序：

```bash
node scripts/install.js --dry-run --target ./tmp-skills
node scripts/install.js --target ./tmp-skills --force
rm -rf ./tmp-skills   # 删除测试安装目录；不要提交它
npm run check
```

`npm run check`（也会在 `prepublishOnly` 时运行）会检查 `bin` 与 `files` 路径是否存在、每个技能的 frontmatter 是否有效、每个技能是否都列在 `README.md` 和 `backend-orchestrator` 中，以及每个被引用的 `_shared/` 文件是否存在。

## 仓库结构

```text
.agents/skills/            技能定义（每个技能一个文件夹）
.agents/skills/_shared/    所有技能共用的参考文档
scripts/install.js         NPX/本地安装程序
scripts/check-package.js   包与技能一致性检查（npm run check）
docs/                      审计报告
.github/                   Issue 与 Pull Request 模板
```

`.opencode/` 不属于本仓库：技能会在运行时于你的项目中创建 `.opencode/everything-backend-memory/`。
