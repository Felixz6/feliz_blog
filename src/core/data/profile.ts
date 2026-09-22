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

export const animeFavorites = [
  { key: "relife", title: "ReLIFE", subtitle: "ReLIFE 重返17岁" },
  { key: "clannad", title: "CLANNAD", subtitle: "团子大家族" },
  { key: "oregairu", title: "我的青春恋爱物语果然有问题", subtitle: "やはり俺の青春ラブコメはまちがっている。" },
  { key: "eighty-six", title: "86 - 不存在的战区", subtitle: "８６―エイティシックス―" },
  { key: "sword-art-online", title: "刀剑神域", subtitle: "ソードアート・オンライン" },
  { key: "grand-blue", title: "碧蓝之海", subtitle: "ぐらんぶる" },
  { key: "mushoku-tensei", title: "无职转生", subtitle: "無職転生 ～異世界行ったら本気だす～" },
  { key: "rezero", title: "Re：从零开始的异世界生活", subtitle: "Re:ゼロから始める異世界生活" },
  { key: "eromanga-sensei", title: "埃罗芒阿老师", subtitle: "エロマンガ先生" },
  { key: "charlotte", title: "夏洛特", subtitle: "シャーロット" },
  { key: "classroom-of-the-elite", title: "欢迎来到实力至上主义教室", subtitle: "ようこそ実力至上主義の教室へ" },
  { key: "engage-kiss", title: "契约之吻", subtitle: "エンゲージ・キス" }
] as const;

export const xpFavorites = [] as const;

export const favoriteGames = [] as const;

export const currentSignals = [
  { label: "技术记录", text: "Web Security、CTF 与 Linux 的学习笔记。" },
  { label: "开发方向", text: "关注 Git、开源项目、开发工具与 AI 工作流。" },
  { label: "日常片段", text: "也会记录看番日常" }
] as const;
