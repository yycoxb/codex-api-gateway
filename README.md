# Codex API Gateway

一个运行在本机的 Codex API Gateway。它可以把本机 Codex OAuth 账号包装成 OpenAI 风格的本地 `/v1` API，并提供账号管理、额度查看、账号切换、API 服务集合和唤醒任务等管理界面。

> 本项目只提交源代码。每个使用者的账号、token、API Key、运行配置都会保存在自己电脑的用户目录中，不应该提交到 GitHub。

## 功能

- 本地 OpenAI 风格接口：
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `POST /v1/images/generations`（`gpt-image-2`，需要官方 OpenAI API Key）
  - `POST /v1/images/edits`（`gpt-image-2`，需要官方 OpenAI API Key）
- 管理界面：`http://127.0.0.1:18080/_admin`
- 多账号导入与切换
- Codex OAuth 添加账号
- Gateway / Cockpit / sub2api / CPA JSON 导入/导出
- 本地账号格式转换：支持把 ChatGPT/Codex session、sub2api、CPA、Cockpit JSON 转为本项目可导入格式
- API 服务账号集合
- 按策略调用账号，例如优先使用快到期账号
- 额度查看与自动刷新
- 账号唤醒任务
- 本地 API Key 鉴权：`Authorization: Bearer agt_codex_xxx`

## 环境要求

- Windows / macOS / Linux 均可运行 Node 服务
- Node.js `>= 24`
- 已拥有可用的 Codex / ChatGPT 账号
- 如需使用 `gpt-image-2` 图片接口，需要在启动 Gateway 的进程环境中设置 `OPENAI_API_KEY` 或 `CODEX_GATEWAY_OPENAI_API_KEY`

> 项目使用了 Node 内置 `node:sqlite`。为了另一台电脑开箱即用，建议直接安装 Node.js 24 LTS 或更新版本。

Windows 用户可以直接使用项目里的 `.cmd` 启动脚本。

如果是从 GitHub 克隆到新电脑，可以运行下面命令在当前用户桌面创建快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

如果也想创建停止服务的快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1 -IncludeStopShortcut
```

## 下载与启动

### 方式一：Git 克隆

```powershell
git clone https://github.com/yycoxb/codex-api-gateway.git
cd codex-api-gateway
npm install
npm start
```

### 方式二：下载 ZIP

在 GitHub 页面点击：

```text
Code → Download ZIP
```

解压后进入目录：

```powershell
npm install
npm start
```

### Windows 快捷启动

在 Windows 上也可以双击：

```text
Codex API Gateway.cmd
```

停止服务：

```text
Stop Codex API Gateway.cmd
```

## 在另一台电脑上使用

另一台电脑只需要从 GitHub 拉取源代码，账号和 API Key 需要在那台电脑本地重新配置：

```powershell
git clone https://github.com/yycoxb/codex-api-gateway.git
cd codex-api-gateway
npm install
npm start
```

可选：创建桌面快捷方式：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

然后打开：

```text
http://127.0.0.1:18080/_admin
```

首次使用请选择一种方式添加账号：

1. **OAuth 授权**：推荐方式，在新电脑上重新登录自己的 Codex / ChatGPT 账号。
2. **导入账号 JSON**：在旧电脑管理页导出账号，再通过可信方式复制到新电脑后导入。
3. **本地格式转换**：如果手头是 ChatGPT/Codex session、sub2api、CPA 或 Cockpit JSON，可在管理页 `Token / JSON` 里先转换，再导入。

不要通过 GitHub 同步账号数据。下面这些文件只属于每台电脑本地运行环境：

```text
~/.codex-api-gateway/
~/.codex/
auth.json
accounts.json
config.json
.env
exported account JSON
```

## 打开管理界面

服务启动后打开：

```text
http://127.0.0.1:18080/_admin
```

管理页可以查看：

- Base URL
- 本地 API Key
- 当前账号
- API 服务集合
- 账号额度
- 唤醒任务
- 统计面板

## 第一次添加账号

进入管理页后点击：

```text
添加 / 导入账号
```

可选方式：

1. **OAuth 授权**：按页面提示登录自己的 Codex 账号。
2. **Token / JSON 导入**：导入自己的 `auth.json`、单账号 JSON、Gateway / Cockpit / sub2api / CPA 导出的账号 JSON，或 ChatGPT/Codex session JSON。
3. **本地导入**：读取当前电脑的 `~/.codex/auth.json`。

导入后账号会保存到本机：

```text
~/.codex-api-gateway/accounts.json
```

### 本地格式转换

管理页的 `添加账号 → Token / JSON → 本地格式转换` 可以在本机完成格式转换，不会上传到外部服务，也不会保存转换历史。

支持输入：

```text
gateway
cockpit-tools
sub2api
cpa / token storage
ChatGPT/Codex session JSON
```

支持输出：

```text
gateway
cockpit-tools
sub2api
cpa / token storage
```

如果输入缺少真实 `id_token`，Gateway 会根据 `access_token` claims 合成 Codex 可解析的占位 `id_token`，并标记为 `synthetic-id-token`。这种账号可以短期使用；如果有真实 `refresh_token`，后续仍可自动刷新。

## 在客户端中使用

管理页里复制：

```text
Base URL: http://127.0.0.1:18080/v1
API Key:  agt_codex_xxx
```

请求示例：

```powershell
$env:CODEX_GATEWAY_KEY="agt_codex_xxx"

curl.exe http://127.0.0.1:18080/v1/models `
  -H "Authorization: Bearer $env:CODEX_GATEWAY_KEY"
```

Chat Completions 流式调用：

```powershell
curl.exe -N http://127.0.0.1:18080/v1/chat/completions `
  -H "Authorization: Bearer $env:CODEX_GATEWAY_KEY" `
  -H "Content-Type: application/json" `
  -H "Accept: text/event-stream" `
  -d '{"model":"gpt-5.4-mini","stream":true,"messages":[{"role":"user","content":"Reply with exactly: OK"}]}'
```

图片生成调用（`gpt-image-2`）：

> 图片接口走官方 OpenAI Images API；Codex / ChatGPT OAuth 账号池不会被用于图片生成。请先在启动 Gateway 前设置 `OPENAI_API_KEY` 或 `CODEX_GATEWAY_OPENAI_API_KEY`，不要把完整 Key 写进仓库。

```powershell
curl.exe http://127.0.0.1:18080/v1/images/generations `
  -H "Authorization: Bearer $env:CODEX_GATEWAY_KEY" `
  -H "Content-Type: application/json" `
  -d '{"model":"gpt-image-2","prompt":"A small watercolor robot holding a sign that says OK","size":"1024x1024"}'
```

## 本地数据位置

运行时数据默认保存在：

```text
~/.codex-api-gateway/
```

常见文件：

```text
config.json
account.json
accounts.json
local-access.json
local-access-stats.json
wakeup-history.json
```

这些文件可能包含账号 token 或本地 API Key，**不要提交到 GitHub，不要分享给别人**。

## 修改前备份与回滚

项目内置了两个本地保护脚本，方便修改错代码时回退，不影响账号数据。

修改前先创建 checkpoint：

```powershell
.\scripts\checkpoint.ps1
```

- 工作区干净时：创建本地备份分支。
- 工作区已有修改时：检查敏感文件名后创建 checkpoint commit。
- checkpoint 信息记录在 `.git/codex-last-checkpoint`。

如果改错了，回到最近 checkpoint：

```powershell
.\scripts\rollback-last.ps1
```

如果当前还有未提交改动，脚本会要求输入 `ROLLBACK` 确认。  
这个回滚只作用于当前 Git 仓库，不会碰：

```text
~/.codex-api-gateway/
~/.codex/
```

未来让 Codex/AI 修改此项目时，也建议先读取 `AGENTS.md`。

## 项目结构

```text
src/
  server.js                 # CLI 入口
  gateway.js                # HTTP 服务、鉴权、路由、上游转发
  # /v1/images/* 会转发到官方 OpenAI Images API
  account.js                # 账号导入、保存、刷新 token
  codex-oauth.js            # Codex OAuth 登录流程
  codex-app.js              # Codex App auth/config 兼容
  local-access.js           # 本地 API 服务集合
  local-access-stats.js     # API 使用统计
  quota.js                  # 额度读取与解析
  wakeup.js                 # 账号唤醒
  chat-completions.js       # /v1/chat/completions 转换层
  admin-ui.js               # 管理页面
  config.js                 # 配置与 API key
  constants.js              # 常量与路径
```

## 安全提醒

- 不要公开自己的 `auth.json`、`accounts.json`、`config.json`、`.env`。
- 不要把完整 access token / refresh token / session token 发给别人。
- 如果误提交 token，请立刻删除仓库历史并重新生成/撤销相关凭据。
- 本服务默认只监听 `127.0.0.1`，不建议暴露到公网。
