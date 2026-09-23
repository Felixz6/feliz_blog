---
title: "recon-mcp README"
description: "recon-mcp 统一 AI 网络资产侦察 Gateway 的使用与架构说明。"
project: recon-mcp
routeSlug: overview
order: 1
---

# recon-mcp

`recon-mcp` 是一个基于 TypeScript、Node.js、MCP SDK、stdio 的统一 AI 网络资产侦察 Gateway。它把现有本地工具和已有 API 测绘 MCP/账号统一成三个工具：`asset_search`、`recon`、`deep_recon`。

## 架构与调用策略

```text
AI Agent
   |
recon-mcp
   |-- 本地优先：subfinder -> httpx -> naabu -> nuclei
   |-- API fallback：Netlas -> Quake -> FOFA（严格串行）
```

- 默认优先使用本地免费能力。
- `asset_search` 默认只执行本地资产发现（subfinder、httpx、naabu）；本地已有资产时不调用 API。
- `deep=true` 才允许在本地结果基础上进入 API fallback；本地无资产时也会按顺序尝试已开启的 API。
- API 不并发：Netlas 有资产即停止，否则 Quake，再否则 FOFA。
- `ENABLE_NETLAS`、`ENABLE_QUAKE`、`ENABLE_FOFA` 默认均为关闭。
- 同一域名的有效缓存 24 小时内优先返回，避免重复本地扫描和 API 消耗。
- 所有工具只处理当前请求传入的 `target`；本地发现和 API 结果仅保留该 target 及其相关子域。

## 项目结构

```text
recon-mcp/
├── src/
│   ├── index.ts
│   ├── orchestrator.ts
│   ├── cache.ts
│   ├── quota.ts
│   ├── types/
│   │   └── Asset.ts
│   ├── utils/
│   │   └── deduplicate.ts
│   ├── providers/
│   │   ├── netlas.ts
│   │   ├── quake.ts
│   │   ├── fofa.ts
│   │   └── common.ts
│   └── scanners/
│       ├── subfinder.ts
│       ├── httpx.ts
│       ├── naabu.ts
│       └── nuclei.ts
├── cache/
├── config/quota.json
├── scripts/smoke.mjs
└── README.md
```

## 安装与构建

```bash
cd ~/Documents/recon-mcp
npm install
npm run build
```

Node.js 要求 `>=20`。本地命令需要已经在 `PATH` 中：

```bash
subfinder -version
httpx -version
naabu -version
nuclei -version
```

也可以为每个命令设置绝对路径：`SUBFINDER_BIN`、`HTTPX_BIN`、`NAABU_BIN`、`NUCLEI_BIN`。所有子进程均通过 `child_process.spawn(command, args, {shell:false})` 调用，不使用 shell 拼接；超时由 `COMMAND_TIMEOUT_MS` 控制，日志只写 stderr。

## 环境变量

API 默认关闭，显式开启才会访问：

```bash
export ENABLE_NETLAS=true
export ENABLE_QUAKE=false
export ENABLE_FOFA=false
```

可选的 API 凭据环境变量：

```bash
export NETLAS_API_KEY='...'
export QUAKE_API_KEY='...'
export FOFA_EMAIL='...'
export FOFA_KEY='...'
```

若未在进程环境中设置，Gateway 会只读复用现有安装目录的私有 `.env`：

- `~/.dsh/mcp-servers/netlas/.env`
- `~/.dsh/mcp-servers/quake/.env`
- `~/.dsh/mcp-servers/fofa/.env`

也兼容 `~/.codex/mcp-servers/*/.env`。凭据不会写入结果、日志或缓存。

可选 endpoint 覆盖变量：`NETLAS_API_URL`、`QUAKE_API_URL`、`FOFA_API_URL`；默认使用各 provider 的官方 REST endpoint。可选 `PROVIDER_TIMEOUT_MS` 控制 API 超时。

## MCP 运行

```bash
cd ~/Documents/recon-mcp
npm start
```

服务使用 stdio，stdout 只用于 MCP JSON-RPC，运行日志写 stderr。

## 统一 AssetResult Schema

`asset_search`、`recon`、`deep_recon` 三个 MCP Tool 返回完全相同的 JSON 结构：

```json
{
  "target": "example.com",
  "assets": [
    {
      "host": "oa.example.com",
      "url": "https://oa.example.com",
      "ip": "1.1.1.1",
      "ports": [443, 8080],
      "title": "OA System",
      "technologies": ["nginx", "Spring"],
      "source": ["subfinder", "httpx", "netlas"]
    }
  ],
  "summary": {
    "subdomains": 1,
    "live_hosts": 1,
    "open_ports": 2,
    "vulnerabilities": 0
  },
  "metadata": {
    "cached": false,
    "providers_used": [],
    "timestamp": "2026-09-19T00:00:00.000Z"
  },
  "errors": []
}
```

Asset 字段始终存在：`host`、`url`、`ip`、`ports`、`title`、`technologies`、`source`。没有值时使用空字符串或空数组。

### 资产去重规则

所有 scanner/provider 输出在进入最终结果前都会经过 `src/utils/deduplicate.ts`：

1. 优先按 `host` 合并。
2. 无 host 匹配时按 `ip + port` 合并。
3. 再按 `url` 合并。
4. `source` 采用并集，不覆盖已有来源。
5. `ports` 采用数字并集并排序。
6. `technologies` 按大小写不敏感规则去重并保留首次出现顺序。

### `asset_search`

输入：

```json
{"target":"example.com","deep":false}
```

流程：缓存 → 本地 `subfinder → httpx → naabu` → 仅在无本地资产或 `deep=true` 时按 `Netlas → Quake → FOFA` 串行 fallback。

### `recon`

输入：

```json
{"target":"example.com"}
```

严格执行：`subfinder → httpx → naabu → nuclei`，并使用统一 `AssetResult` 返回。`summary.vulnerabilities` 是 nuclei 发现数量。

### `deep_recon`

输入：

```json
{"target":"example.com"}
```

执行完整本地侦察并按深度模式使用 API fallback，最终仍返回统一 `AssetResult`。有效缓存仍优先，缓存命中时不会再次消耗 API。

单个本地命令或 provider 失败时，已完成资产仍会返回，错误统一写入 `errors`，同时写入 stderr 日志。

## 缓存

缓存目录默认为 `~/Documents/recon-mcp/cache/`，文件格式为 `cache/example.com.json`：

```json
{
  "target":"example.com",
  "timestamp":"2026-09-19T00:00:00.000Z",
  "source":"local",
  "providers_used":[],
  "assets":[]
}
```

24 小时内按 target 优先读取。可用 `RECON_CACHE_DIR` 指定测试或部署目录。

## 额度管理

默认文件为 `config/quota.json`：

```json
{
  "netlas":{"daily_limit":100,"used":0,"date":""},
  "quake":{"daily_limit":50,"used":0,"date":""},
  "fofa":{"daily_limit":30,"used":0,"date":""}
}
```

每次准备 API 请求时先检查 `used >= daily_limit`。额度耗尽直接返回 `quota_exhausted`，不会发起网络请求。只有 provider 返回有效 HTTP/JSON 响应时才将 `used` 增加 1；带 `date` 的记录跨 UTC 日期自动归零。可以直接编辑 `daily_limit` 或将 `used` 调整为新周期值。可用 `RECON_QUOTA_FILE` 指定独立额度文件。

## DSH MCP 配置

在 DSH 的 MCP 配置中新增一个 server，不删除现有 `fofa`、`quake`、`netlas`：

```json
{
  "mcpServers": {
    "recon-mcp": {
      "command": "node",
      "args": ["/Users/feliz/Documents/recon-mcp/dist/index.js"],
      "env": {
        "ENABLE_NETLAS": "false",
        "ENABLE_QUAKE": "false",
        "ENABLE_FOFA": "false"
      }
    }
  }
}
```

若 DSH 使用数组形式，则使用同样的 `command`、`args`、`env` 字段。API 开关可在确认需要时单独改为 `true`。

## DSH 主备路由

DSH 的主搜索源是已注册的 `recon-mcp`，而不是独立 provider MCP。默认调用 `asset_search({"target":"...","deep":false})`；完整侦察或深度模式按需调用 `recon` / `deep_recon`。`recon-mcp` 使用缓存和本地扫描优先，DSH 配置中的 `ENABLE_NETLAS`、`ENABLE_QUAKE`、`ENABLE_FOFA` 保持 `false`，避免网关默认消耗 API 额度。

只有 `recon-mcp` 无结果、不可用或用户明确要求补充时，DSH 才按 **Netlas → Quake → FOFA** 依次调用 `~/.dsh/mcp-servers/` 下的独立 provider MCP；不并发、不在主源已有足够结果时调用、不自动扩展 target。

`playwright` 仅用于浏览器操作，虽然仍注册在 DSH 中，但不属于搜索源、provider fallback 或资产查询顺序。

## CLI 与测试

CLI 复用和 MCP 完全相同的 target 规范、缓存、额度、超时逻辑：

```bash
npm run recon -- example.com
node dist/index.js asset_search example.com
node dist/index.js asset_search example.com --deep
node dist/index.js deep_recon example.com
```

运行完整 smoke 测试：

```bash
npm run build
npm test
```

smoke 测试使用临时 fixture 命令验证：统一 AssetResult、跨来源去重、source/ports/technologies 合并、三工具 Schema 一致、24 小时缓存命中、API 全关闭、额度耗尽和当前 target 范围处理；不会调用真实 API。
