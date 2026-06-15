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
- `backend-db-design` — 设计数据库 schema 与迁移
- `backend-visualize` — 生成精美的 Mermaid 图表（ERD、类图、角色图、流程图、时序图、架构图）
- `backend-api-design` — 设计 API 接口及其契约
- `backend-implement` — 生成或修改后端代码
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
4. **`backend-db-design`** — 在写代码之前先设计表、关系、索引和迁移。
5. **`backend-api-design`** — 定义端点、请求/响应 schema 与错误契约。
6. **`backend-implement`** — 将设计转化为可运行的代码，或演进现有代码。
7. **`backend-test`** — 接下来添加测试、fixtures、mocks 与覆盖率。

掌握基础之后，再按需使用专项技能：

- **`backend-auth`** — 用于登录、注册、JWT、RBAC 与权限。
- **`backend-ops`** — 用于日志、指标、链路追踪、缓存与异步消息。
- **`backend-deploy`** — 用于 Docker、CI/CD 与基础设施搭建。
- **`backend-migrate`** — 用于 schema 演进与零停机迁移。
- **`backend-doctor`** — 用于健康检查、lint、类型检查与代码审查。
- **`backend-visualize`** — 用于 ERD、架构图与流程图。

## 安装

使用 `npx` 运行安装程序：

```bash
npx everything-backend
```

安装程序将以交互方式运行，并提示你选择：

1. **Global（全局）** — 将技能作为全局 IDE/应用插件安装。你将被要求选择目标应用：
   - **Gemini IDE** — `~/.gemini/config/plugins/everything-backend-plugin`
   - **Cursor** — `~/.cursor/skills-cursor`
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

安装程序会将 `.agents/skills/` 中的每个文件夹复制到你的全局 Opencode 技能目录中。每个技能都按如下形式安装：

```text
~/.agents/skills/<skill-name>/SKILL.md
```

## 在 Opencode 中使用

安装完成后，技能即可按名称调用。示例：

- `backend-orchestrator` — 将后端请求路由到正确的子技能
- `backend-scan` — 检查现有后端代码库并保持记忆更新
- `backend-api-design` — 设计端点与 schema
- `backend-visualize` — 绘制 ERD、类图、架构图等
- `backend-implement` — 将设计转化为代码
- `backend-test` — 添加或扩展测试
- `backend-auth` — 添加身份认证与授权
- `backend-doctor` — 运行后端健康检查

## 开发

要在不触碰真实全局目录的情况下测试安装程序：

```bash
node scripts/install.js --dry-run
node scripts/install.js --target ./tmp-skills --force
```

## 仓库结构

```text
.agents/skills/        技能定义
scripts/install.js     NPX/本地安装程序
.opencode/             项目级 Opencode 元数据
```
