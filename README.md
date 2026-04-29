# Codex API Gateway

一个运行在本机的 Codex API Gateway。它可以把本机 Codex OAuth 账号包装成 OpenAI 风格的本地 `/v1` API，并提供账号管理、额度查看、账号切换、API 服务集合和唤醒任务等管理界面。

> 本项目只提交源代码。每个使用者的账号、token、API Key、运行配置都会保存在自己电脑的用户目录中，不应该提交到 GitHub。

## 功能

- 本地 OpenAI 风格接口：
  - `GET /v1/models`
  - `POST /v1/chat/completions`
- 管理界面：`http://127.0.0.1:18080/_admin`
- 多账号导入与切换
- Codex OAuth 添加账号
- Cockpit 兼容 JSON 导入/导出
- API 服务账号集合
- 按策略调用账号，例如优先使用快到期账号
- 额度查看与自动刷新
- 账号唤醒任务
- 本地 API Key 鉴权：`Authorization: Bearer agt_codex_xxx`

## 环境要求

- Windows / macOS / Linux 均可运行 Node 服务
- Node.js `>= 18`
- 已拥有可用的 Codex / ChatGPT 账号

Windows 用户可以直接使用项目里的 `.cmd` 启动脚本。

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
2. **Token / JSON 导入**：导入自己的 `auth.json`、单账号 JSON 或 Cockpit 导出的账号数组。
3. **本地导入**：读取当前电脑的 `~/.codex/auth.json`。

导入后账号会保存到本机：

```text
~/.codex-api-gateway/accounts.json
```

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
