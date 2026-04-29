# Codex API Gateway MVP

独立本地 Codex API 代理服务。它读取本机 `~/.codex/auth.json` 的 OAuth token，在 `127.0.0.1` 启动一个 OpenAI 风格的 `/v1` API。

## 当前已实现

- `GET /v1/models`
- `POST /v1/chat/completions`，stream 模式已测通
- 自动读取 `~/.codex/auth.json`
- access token 过期时用 refresh token 刷新
- 本地 API Key 鉴权：`Authorization: Bearer agt_codex_xxx`

> 注意：`/v1/responses` 直通还不是稳定兼容层。当前建议优先使用 `/v1/chat/completions`。

## 项目结构

```text
src/
  server.js            # CLI 入口：serve / doctor / import / rotate-key
  gateway.js           # HTTP 服务、鉴权、路由、上游转发
  account.js           # 读取 ~/.codex/auth.json，保存账号，刷新 token
  jwt.js               # JWT payload 解码、过期判断、账号ID/邮箱提取
  chat-completions.js  # /v1/chat/completions -> Codex responses 的转换层
  sse.js               # SSE frame 解析工具
  http-utils.js        # JSON/CORS 响应、读取请求体、API key 提取
  config.js            # 加载配置、轮换本地 API key
  storage.js           # JSON 文件读写、原子写入
  constants.js         # 常量：路径、上游地址、模型列表
  utils.js             # 时间、脱敏、API key 生成
```

## 启动

```powershell
cd C:\Users\15267\Downloads\codex-api-gateway
npm start
```

首次启动会创建：

```text
~/.codex-api-gateway/config.json
~/.codex-api-gateway/account.json
```

查看状态：

```powershell
npm run doctor
```

重新导入当前 Codex 账号：

```powershell
node src/server.js import
```

轮换本地 API Key：

```powershell
node src/server.js rotate-key
```

## 调用示例

把启动时输出的 API key 填进去：

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

## 管理界面\n\n浏览器打开：\n\n```text\nhttp://127.0.0.1:18080/_admin\n```\n\n页面功能：\n\n- 查看 Base URL / API Key / 当前账号\n- 复制地址和密钥\n- 测试 `/v1/models`\n- 测试 `/v1/chat/completions`\n- 轮换 API Key\n\n`/_admin/state` 会返回 JSON 状态，方便脚本读取。\n


## 多账号导入

管理页 `http://127.0.0.1:18080/_admin` 现在支持账号管理：

- `导入当前 ~/.codex/auth.json`：把当前 Codex 官方登录账号导入账号池，并设为当前使用账号。
- `粘贴 auth.json 导入`：把另一个账号的 `auth.json`、Cockpit 导出的单个账号 JSON，或 Cockpit 导出的账号数组粘贴进来导入。
- `使用`：切换网关当前使用的账号。
- `删除`：从网关账号池删除账号。

账号池保存在：

```text
~/.codex-api-gateway/accounts.json
```

兼容用的当前账号投影仍保存在：

```text
~/.codex-api-gateway/account.json
```

## 账号唤醒

管理页 `http://127.0.0.1:18080/_admin` 现在支持“账号唤醒”：

1. 在账号列表左侧勾选一个或多个账号。
2. 在“账号唤醒”区域选择模型，默认 `gpt-5.5`。
3. 可修改提示词，默认 `Reply with exactly: OK`。
4. 点击 `唤醒选中账号`。
5. 点击 `查看历史` 可查看最近唤醒记录。

唤醒历史保存到：

```text
~/.codex-api-gateway/wakeup-history.json
```

说明：唤醒本质是对选中账号发起一次轻量 Codex 请求。它能产生活动记录，但是否影响官方刷新/重置时间由 Codex 上游规则决定。
