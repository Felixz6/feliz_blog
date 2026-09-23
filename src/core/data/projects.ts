export const projectTechLines = [
  { key: "web-security", label: "Web Security", note: "安全研究与分析" },
  { key: "ctf", label: "CTF", note: "题目与解题笔记" },
  { key: "open-source", label: "Open Source", note: "开源项目记录" }
] as const;

export const projectEntries = [
  {
    id: "security-research",
    title: "SRC Skill",
    type: "SRC Research Toolkit",
    line: "web-security",
    summary: "SRC 研究技能、规则、知识库、MCP 服务源码与部署脚本的整理项目。",
    details: ["src-skill", "SRC Skill", "规则与知识库"],
    href: "/projects/src-skill/",
    linkLabel: "查看项目详情"
  },
  {
    id: "ctf-notes",
    title: "CTF Notes",
    type: "Write-ups",
    line: "ctf",
    status: "已发布，8 篇 Web CTF 笔记",
    summary: "覆盖 SQL 注入、SSRF、SSTI、反序列化、文件上传与文件包含等常见题型。",
    details: ["8 篇笔记", "Web CTF", "解题流程"],
    href: "/projects/ctf-notes/",
    linkLabel: "浏览 8 篇笔记"
  },
  {
    id: "whuctf-lapsa-writeup",
    title: "2026 WHUCTF 校赛 Writeup",
    type: "CTF Write-up",
    line: "ctf",
    status: "已发布，可阅读全文",
    summary: "lapsa 队的 2026 年 WHUCTF 校赛解题记录。",
    details: ["WHUCTF", "lapsa 队", "Writeup"],
    href: "/blog/2026-whuctf-lapsa-writeup/"
  },
  {
    id: "recon-tools",
    title: "Recon MCP",
    type: "Reconnaissance MCP",
    line: "web-security",
    summary: "基于 TypeScript 的统一资产侦察 MCP Gateway，采用本地优先扫描与串行 provider 回退。",
    details: ["recon-mcp", "MCP Gateway", "资产侦察"],
    href: "/projects/recon-mcp/",
    linkLabel: "查看项目详情"
  },
  {
    id: "open-source-eisland-lite",
    title: "eIsland Lite",
    type: "Windows / Dynamic Island",
    line: "open-source",
    summary: "基于 eIsland 的 Windows 动态岛改进版与补丁工具集：提供 app.asar 解包、补丁、重打包和校验流程，以及 CDP 调试脚本、PowerShell 验证工具和补丁文档。",
    details: ["Windows", "Electron", "Patch Toolkit"],
    href: "https://github.com/Felixz6/eisland-lite",
    linkLabel: "github.com/Felixz6/eisland-lite"
  },
  {
    id: "open-source-rime-sukura",
    title: "Rime-sukura",
    type: "Windows Input Method",
    line: "open-source",
    summary: "面向 Windows 小狼毫（Weasel）的定制分支，支持候选窗三段式背景图（左右保持比例、中段拉伸）和水平候选列表独立左边距，并附樱花主题 YAML 示例与部署说明。",
    details: ["Rime / Weasel", "C++", "Sakura Theme"],
    href: "https://github.com/Felixz6/Rime-sukura",
    linkLabel: "github.com/Felixz6/Rime-sukura"
  },
  {
    id: "open-source-adsdk-agent",
    title: "ADSDK-Agent",
    type: "Android Privacy Audit",
    line: "open-source",
    summary: "本地 Android APK 隐私审计与合规分析平台：通过 Web 控制台管理任务，组合 Manifest/SDK 静态分析、Frida 动态观测、mitmproxy 流量采集、Consent 时间线、证据关联和隐私发现；AI 可选辅助编排与报告叙述。",
    details: ["Android APK", "Static + Dynamic", "Privacy Findings"],
    href: "https://github.com/Felixz6/ADSDK-Agent",
    linkLabel: "github.com/Felixz6/ADSDK-Agent"
  },
  {
    id: "open-source-mobile-vscode",
    title: "MobileVSCode",
    type: "Android Code Editor",
    line: "open-source",
    summary: "面向 Android 手机的 VSCode 风格代码编辑器，聚焦 Python 与 C：包含工作区和多文件编辑、可折叠终端、本地/远程运行与自动回退，并集成全局搜索、LSP 诊断、插件和基础 Git 能力。",
    details: ["Android", "Python + C", "Local / Remote"],
    href: "https://github.com/Felixz6/MobileVSCode",
    linkLabel: "github.com/Felixz6/MobileVSCode"
  }
] as const;
