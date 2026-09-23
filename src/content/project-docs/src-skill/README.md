---
title: "SRC 研究环境：README"
description: "DSH、Claude Code 与 Codex 的 SRC 研究环境说明。"
project: src-skill
routeSlug: overview
order: 1
---

# SRC 研究环境：DSH · Claude Code · Codex

本目录包含 `src-research` 技能、规则、知识库、MCP 服务源码与部署脚本。平台部署状态及验证证据见[部署记录](/projects/src-skill/docs/deployment/)，目录结构分析见[目录文件分析](/projects/src-skill/docs/structure/)；本文件仅保留 DSH、Claude Code、Codex 三个平台的使用和部署信息。

## DSH Desktop

部署根目录为 `~/.dsh`。技能位于 `~/.dsh/skills/src-research/SKILL.md`，全局入口为 `~/.dsh/AGENTS.md`。技能目录由 DSH 监视；新增或改名技能文件可被发现。

MCP 注册写入当前激活 profile 的 `cordis.patch.yml`，服务目录为 `~/.dsh/mcp-servers/`。当前激活 profile 为 `desktop`，已配置 `recon-mcp`、Netlas、Quake、FOFA 和 Playwright；ZoomEye 已移除。修改 profile patch 后需重启 DSH 才会加载新 MCP 配置。

DSH 的资产搜索主源是 `/Users/feliz/Documents/recon-mcp` 提供的 `recon-mcp`，默认使用 `asset_search`，完整流程使用 `recon`，深度流程使用 `deep_recon`。Gateway 遵循缓存和本地扫描优先；独立 provider 仅在主源无结果、不可用或明确要求补充时按 **Netlas → Quake → FOFA** 串行回退。`ENABLE_NETLAS`、`ENABLE_QUAKE`、`ENABLE_FOFA` 在 DSH 配置中默认关闭。Playwright 仅用于浏览器操作，不属于搜索源或 provider fallback。

使用 `scripts/deploy_dsh.py` 预检；需要实际安装时使用 `--apply`，中断后可用 `--apply --resume` 续跑。服务凭据保存在各自 `.env` 文件中，部署脚本会先备份要修改的 profile 配置。

## Claude Code

用户级配置根目录为 `~/.claude`。技能位于 `~/.claude/skills/src-research/SKILL.md`，全局入口为 `~/.claude/CLAUDE.md`，MCP 注册在 `~/.claude.json` 的 `mcpServers` 下。最近记录已移除 ZoomEye，搜索顺序恢复为 Netlas → FOFA；既有 Netlas、FOFA、Playwright 部署保留。

设置 `CLAUDE_CONFIG_DIR` 后启动 Claude Code。查看用户级 MCP 连接状态：

```sh
CLAUDE_CONFIG_DIR="$HOME/.claude" claude mcp list
```

Claude Code 技能目录和 MCP 状态的详细检查结果见[部署记录](/projects/src-skill/docs/deployment/)。

## Codex

技能位于 `~/.codex/skills/src-research/SKILL.md`，全局入口为 `~/.codex/AGENTS.md`。**2026-09-21 已从 `~/.codex/config.toml` 注销本项目的 Quake、Netlas、FOFA、Playwright MCP 注册并归档服务目录；`src-research` 技能与项目源码保留。**因此当前记录状态下，Codex 仍可使用技能说明，但本项目的四个 MCP 不会由 Codex 加载。

移除前的部署使用 `scripts/deploy_codex.py`，并由 `codex mcp list` 检查 MCP 注册。若重新部署，先核对当前配置和备份，再使用该脚本预检；`--apply` 才会安装。

## 共享源码与验证

- 规则：`rules/`；技能入口和知识库：`skills/skill/`。
- MCP 服务源码：`mcp-servers/quake_MCP/`、`mcp-servers/netlas_MCP/`、`mcp-servers/fofa_MCP/`。
- DSH 统一 Gateway：`/Users/feliz/Documents/recon-mcp/`，只向 DSH 暴露 `asset_search`、`recon`、`deep_recon` 三个工具。
- 部署脚本：`scripts/deploy_dsh.py`、`scripts/deploy_codex.py`、`scripts/add_quake.py`。
- 项目回归：`.venv/bin/python -m unittest discover -s tests -q`。

客户端配置和凭据分别维护。客户端复制或回滚记录、回归结果与路径细节以[部署记录](/projects/src-skill/docs/deployment/)为准。
