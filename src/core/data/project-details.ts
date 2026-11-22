import type { ProjectId } from "./project-metadata.ts";

export type ProjectTile = { title: string; text: string };

export type ProjectBlock =
  | { kind: "prose"; title: string; paragraphs: string[]; code?: string }
  | { kind: "tiles"; title?: string; label?: string; tiles: ProjectTile[] }
  | { kind: "docs"; title: string; paragraph: string; label: string }
  | { kind: "repo"; href: string; ariaLabel: string; name: string; description: string };

export type ProjectDetailContent = {
  kicker: string;
  description: string;
  tags: string[];
  blocks: ProjectBlock[];
};

export const projectDetails: Record<ProjectId, ProjectDetailContent> = {
  "src-skill": {
    kicker: "SRC RESEARCH TOOLKIT",
    description: "把 SRC 研究技能、规则、知识库、MCP 服务源码与部署脚本整理在同一个研究工作区。",
    tags: ["SRC Research", "Rules & Knowledge", "MCP"],
    blocks: [
      {
        kind: "prose",
        title: "项目概览",
        paragraphs: ["这个工作区围绕 src-research 技能构建：用技能入口和规则组织研究流程，以知识库沉淀方法，再通过 MCP 服务源码和部署脚本连接日常工具。项目文档覆盖 DSH、Claude Code 与 Codex 的使用方式。"]
      },
      {
        kind: "tiles",
        label: "项目组成",
        tiles: [
          { title: "研究技能与规则", text: "集中整理技能入口、适用规则和可持续维护的研究知识库。" },
          { title: "MCP 服务源码", text: "收纳资产搜索相关的 provider 服务源码，并与统一 recon-mcp Gateway 协作。" },
          { title: "平台部署脚本", text: "为不同编码助手整理配置说明与部署工具，让同一套研究资料更容易复用。" }
        ]
      },
      {
        kind: "prose",
        title: "目录速览",
        paragraphs: [],
        code: "skills/skill/   技能入口与知识库\nrules/          研究规则\nmcp-servers/    provider 服务源码\nscripts/        平台部署脚本"
      },
      {
        kind: "docs",
        title: "项目文档",
        paragraph: "阅读项目说明、部署记录与目录分析。",
        label: "浏览 3 份主文档"
      }
    ]
  },
  "recon-mcp": {
    kicker: "LOCAL-FIRST RECONNAISSANCE GATEWAY",
    description: "基于 TypeScript、Node.js 与 MCP SDK 构建的统一网络资产侦察 Gateway，将本地扫描与可选 API provider 整理成一致的工具接口。",
    tags: ["TypeScript", "MCP", "Asset Discovery"],
    blocks: [
      {
        kind: "tiles",
        title: "三个统一入口",
        tiles: [
          { title: "asset_search", text: "快速发现并汇总当前 target 的资产，优先使用本地能力。" },
          { title: "recon", text: "串联子域发现、存活探测、端口检查与 nuclei 检查。" },
          { title: "deep_recon", text: "在完整本地流程后按顺序尝试已启用的 API provider。" }
        ]
      },
      {
        kind: "prose",
        title: "执行链路",
        paragraphs: ["本地扫描按顺序运行；API provider 作为可选回退并串行执行。统一结果便于 Agent 和其他调用方消费。"],
        code: "AI Agent\n  └─ recon-mcp\n      ├─ local: subfinder → httpx → naabu → nuclei\n      └─ API fallback: Netlas → Quake → FOFA"
      },
      {
        kind: "prose",
        title: "调用示例",
        paragraphs: ["每次请求围绕调用方传入的 target，返回统一的资产列表、统计摘要、元数据与错误信息。"],
        code: JSON.stringify({ target: "example.com", deep: false }, null, 2)
      },
      {
        kind: "prose",
        title: "运行方式",
        paragraphs: ["项目使用 Node.js 20 或更高版本；构建后以 stdio 模式启动，便于接入支持 MCP 的客户端。"],
        code: "npm install\nnpm run build\nnpm start"
      },
      {
        kind: "repo",
        href: "https://github.com/Felixz6/recon-mcp",
        ariaLabel: "在 GitHub 上查看 Felixz6/recon-mcp 仓库",
        name: "Felixz6 / recon-mcp",
        description: "查看源代码、README 与项目更新。"
      }
    ]
  }
};
