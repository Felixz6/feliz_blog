import { site } from "@/lib/site";

export const profileIdentity = {
  displayName: site.author,
  handle: "@felixz6",
  siteName: site.name,
  bio: site.description,
  github: "https://github.com/Felixz6",
  bilibili: "https://space.bilibili.com/3546948617373876"
} as const;

export const profileStatus = [
  "技术方向：Web Security、CTF ",
  "关注 Linux、Git、开源与开发工具",
  "也会记录看番日常"
] as const;

export const profileTech = [
  { key: "web-security", name: "Web Security", note: "Web 安全学习与研究" },
  { key: "ctf", name: "CTF", note: "题目练习与解题记录" },
  { key: "linux", name: "Linux", note: "系统与命令行工具" },
  { key: "git", name: "Git", note: "版本管理与协作" },
  { key: "open-source", name: "Open Source", note: "开源项目与社区" },
  { key: "ai", name: "AI", note: "模型、工具与工作流" }
] as const;

export const animeFavorites = [] as const;

export const xpFavorites = [] as const;

export const favoriteGames = [] as const;

export const currentSignals = [
  { label: "技术记录", text: "Web Security、CTF 与 Linux 的学习笔记。" },
  { label: "开发方向", text: "关注 Git、开源项目、开发工具与 AI 工作流。" },
  { label: "日常片段", text: "也会记录看番日常" }
] as const;
