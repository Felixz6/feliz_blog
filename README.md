# Feliz Lab

Feliz Lab 是一个基于 Astro 的静态个人博客，当前主站统一使用 Fuyukawa Kagari 主题，包含文章、项目展示与个人资料页面。

- 网站配置地址：<https://felizx.com/>
- GitHub 仓库：<https://github.com/Felixz6/feliz_blog>
- 技术栈：Astro、TypeScript、Pagefind

## 页面与主题

| 路径 | 页面 | 主题/说明 |
| --- | --- | --- |
| / | 首页 | Fuyukawa Kagari |
| /blog/ | 文章归档、搜索与文章详情 | Fuyukawa Kagari |
| /projects/ | 项目展示 | Fuyukawa Kagari |
| /about/ | 个人资料 | Fuyukawa Kagari |
| /friends/ | 旧入口 | 重定向到 /about/ |
| /games/ | 游戏页面 | 主站路由已移除 |
| /themes/fuyukawa-kagari/games/ | 游戏页面 | 保留的主题前缀兼容路由 |

根路径主站统一使用 Fuyukawa Kagari，顶栏不显示 Games。`/games/` 主站路由已移除；主题前缀兼容路径 `/themes/fuyukawa-kagari/games/` 仍会构建。Blank 与 Kisara 主题源码、专属页面路由及其公开资源已从当前工作区删除，仓库仅保留 Fuyukawa Kagari 主题。

## 当前功能

- 首页包含 Hero、个人资料终端卡片、最近文章与本地日期时间。
- Blog 页面提供文章归档与 Pagefind 全文搜索。
- Projects 页面展示已发布的项目、解题笔记与开源仓库链接。
- About 页面从共享资料配置读取个人信息与技术方向。
- 页面保留樱花雨效果和音乐播放器；播放器标题为 Music / Playlist。
- Live2D、公告卡片和猪形滚动挂件已从当前界面移除。
- 浏览器图标资源路径由 src/themes/fuyukawa-kagari/assets.ts 中的 favicon 配置指向 public/themes/fuyukawa-kagari/assets/。

## 本地开发

环境要求：Node.js 24 和 npm。

~~~bash
npm ci
npm run dev
~~~

Astro 默认会在终端显示本地访问地址，通常是 http://localhost:4321/。

常用命令：

~~~bash
npm run dev       # 启动开发服务器
npm test          # 运行仓库测试
node --test src/themes/fuyukawa-kagari/tests/*.test.mjs  # 运行 Fuyukawa 主题专项测试
npm run build     # 生成资源并构建 dist/
npm run preview   # 本地预览构建产物
~~~

## 修改站点资料

- 站点标题、描述、关键词和顶栏导航：src/lib/site.ts
- 个人简介、社交链接、技术方向和状态：src/core/data/profile.ts
- 项目展示数据：src/core/data/projects.ts
- 主题资源路径：src/themes/fuyukawa-kagari/assets.ts
- 音乐曲目清单：public/themes/fuyukawa-kagari/music/manifest.json
- 头像、壁纸、背景等图片：public/themes/fuyukawa-kagari/assets/

## 写一篇文章

在 src/content/blog/ 下新增 Markdown 或 MDX 文件。frontmatter 字段按以下 schema 校验：

~~~yaml
---
title: "文章标题"
description: "一句话摘要"
pubDate: 2026-08-18
tags: ["Astro", "Dev"]
category: "tech"
draft: false
---
~~~

category 可选 tech、anime 或 life；draft: true 的文章不会进入正式文章列表。也可使用 seoTitle、seoDescription、seoKeywords、updatedDate 和 cover。

文章封面原图放在 public/blog-covers/。替换封面后可运行以下命令生成响应式缩略图；npm run build 也会自动执行这一步：

~~~bash
npm run prepare:covers
~~~

## 构建与发布

~~~bash
npm test
npm run build
~~~

构建产物位于 `dist/`。截至 2026-09-24，正式入口 `https://felizx.com/` 和别名 `https://felizx.vercel.app/` 均由 Vercel 提供服务，两者返回相同页面 ETag；正式页 canonical 为 `https://felizx.com/`。Vercel 项目的 Git 来源、发布触发器和构建设置由 Vercel 控制台管理；当前仓库不使用 `vercel.json` 覆盖这些平台设置，也不再保留 GitHub Pages 工作流或 EdgeOne 配置。

本次核验中，当前仓库 `Felixz6/feliz_blog` 的 GitHub Pages API 返回 404、Actions 工作流运行列表为空，`https://felixz6.github.io/feliz_blog/` 也返回 404。另一个仍可访问的 EdgeOne 域名 `https://yuimi-chaya.636.ltd/` 与 `https://yuimi-chaya.github.io/` 返回相同的旧版页面，canonical 为 `https://yuimi-chaya.github.io/`；它们属于旧站点部署，不是 `felizx.com` 的生产链路。此仓库的 `astro.config.mjs` 与 `public/robots.txt` 均以 `https://felizx.com/` 为 canonical/sitemap origin。

## 主要目录

~~~text
src/
├── content/blog/                 博客文章 Markdown / MDX
├── core/                         主题注册、共享数据与内容能力
├── pages/                        主站路由与主题前缀兼容路由
├── themes/
│   └── fuyukawa-kagari/          当前主站主题
├── lib/site.ts                   站点配置
└── content.config.ts             文章数据 schema

public/
├── blog-covers/                  文章封面与响应式缩略图
└── themes/fuyukawa-kagari/
    ├── assets/                   主题图片资源
    └── music/                    音乐文件与 manifest.json

scripts/                          构建与资源处理脚本
tests/                            仓库测试
~~~

## 许可证与第三方素材

不同内容类型有不同的许可范围，代码许可证不代表所有图片、音乐或角色素材都可自由使用。

| 内容 | 许可 |
| --- | --- |
| 维护者有权授权的代码、主题样式、脚本、测试、配置和技术文档 | [MIT](LICENSE) |
| src/content/blog/ 中维护者有权授权的原创文章文字及网站发布版本 | [CC BY-NC-SA 4.0](CONTENT_LICENSE.md) |
| 原创软件代码示例 | MIT，除非另有声明；第三方代码遵循原许可 |
| 图片、截图、插画、音视频、字体、角色美术及其他媒体 | 不自动适用上述许可；详见 [第三方素材说明](THIRD_PARTY_ASSETS.md) |

复用主题时，请确认素材具有相应授权，并保留第三方作品要求的署名与许可证信息。维护者不声称拥有第三方作品版权，也不能通过本仓库许可证替第三方授权。
