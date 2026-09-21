export const projectTechLines = [
  { key: "web-security", label: "Web Security", note: "安全研究与分析" },
  { key: "ctf", label: "CTF", note: "题目与解题笔记" },
  { key: "open-source", label: "Open Source", note: "开源项目记录" },
  { key: "web-development", label: "Web Development", note: "个人博客与开发" },
  { key: "ai", label: "AI", note: "工具与工作流实验" }
] as const;

export const projectEntries = [
  {
    id: "security-research",
    title: "Security Research",
    type: "Research Notes",
    line: "web-security",
    status: "占位项目，待补充",
    summary: "后续用于整理 Web Security 学习与研究记录。",
    details: ["Web Security", "Research Log"]
  },
  {
    id: "ctf-notes",
    title: "CTF Notes",
    type: "Write-ups",
    line: "ctf",
    status: "占位项目，待补充",
    summary: "后续用于整理 CTF 练习、题目分析与解题笔记。",
    details: ["CTF", "解题记录"]
  },
  {
    id: "recon-tools",
    title: "Recon Tools",
    type: "Development Tools",
    line: "web-security",
    status: "占位项目，待补充",
    summary: "后续用于记录侦察工具、脚本与使用方法。",
    details: ["Recon", "开发工具"]
  },
  {
    id: "open-source",
    title: "Open Source",
    type: "Community",
    line: "open-source",
    status: "占位项目，待补充",
    summary: "后续用于记录开源项目、贡献与协作。",
    details: ["Open Source", "贡献记录"]
  },
  {
    id: "personal-blog",
    title: "Personal Blog",
    type: "Web Development",
    line: "web-development",
    status: "占位项目，待补充",
    summary: "记录个人博客的主题、内容与功能迭代。",
    details: ["Astro", "个人网站"]
  },
  {
    id: "ai-experiments",
    title: "AI Experiments",
    type: "Experiments",
    line: "ai",
    status: "占位项目，待补充",
    summary: "后续用于整理 AI 工具、模型与工作流实验。",
    details: ["AI", "Workflow"]
  }
] as const;
