# Feliz Lab

Feliz Lab 是用 Astro 6 和 TypeScript 写的个人博客，主题为 Fuyukawa Kagari。页面静态构建，部署在 Cloudflare Pages；真实体验数据（RUM）由 Pages Functions 和 D1 接收、保存。

- 网站：[felizx.com](https://felizx.com/)
- 仓库：[Felixz6/feliz_blog](https://github.com/Felixz6/feliz_blog)
- 搜索：Pagefind，构建时生成索引，浏览器端全文检索
- 内容：Astro Content Collections、Markdown、代码高亮、章节目录与项目文档

## 目录

- [页面与功能](#页面与功能)
- [快速开始](#快速开始)
- [配置与个性化](#配置与个性化)
- [内容维护](#内容维护)
- [图片与音乐](#图片与音乐)
- [构建与部署](#构建与部署)
- [真实体验测量（RUM）](#真实体验测量rum)
- [目录结构](#目录结构)
- [维护文档](#维护文档)
- [许可证与第三方素材](#许可证与第三方素材)

## 页面与功能

| 路径 | 内容 |
| --- | --- |
| `/` | 首页：Hero、个人资料终端卡片、最近文章、本地日期时间 |
| `/blog/`、`/blog/<slug>/` | 文章归档、分类筛选、Pagefind 搜索；文章页带目录、代码复制、图片查看、打印样式 |
| `/projects/` | WORKS：项目展示、CTF 解题笔记、开源仓库入口 |
| `/projects/<project>/`、`/projects/<project>/docs/...` | 项目介绍与文档（项目 ID：`src-skill`、`recon-mcp`） |
| `/projects/ctf-notes/...` | Web CTF 笔记目录与章节 |
| `/blog/risc-v-xv6-learning-notes/`、`/risc-v-notes/<slug>/` | RISC-V / xv6 学习目录与章节 |
| `/about/` | ME：个人资料、技术方向、Anime Shelf |
| `/tools/transmit/` | 邮件发送终端，访客填写自己的 Resend API Key |
| `/friends/` | 旧入口，重定向到 `/about/` |
| `/api/rum`、`/api/send` | Pages Functions：RUM 上报、邮件转发 |

主站有樱花雨、阅读进度、返回顶部、音乐播放器和页面快捷菜单。自动播放仍受浏览器策略限制。

仓库只保留 Fuyukawa Kagari 一个主题。`/themes/fuyukawa-kagari/` 下的页面是历史兼容路由：使用主站 canonical，标记 `noindex,follow`，不进 sitemap，也不进 Pagefind。其余历史重定向写在 `astro.config.mjs`。

`/api/send` 只接受同源 `POST`，请求体上限 16 MiB，服务端不配置也不保存 API Key。`public/_routes.json` 只放行 `/api/rum` 和 `/api/send`，普通页面和静态资源不经过 Function。

## 快速开始

需要 Node.js 24.21.0 和 npm（版本以 `.nvmrc` 为准，`.npmrc` 开启了 `engine-strict`）。

```bash
nvm install && nvm use
npm ci
npm run dev
```

开发服务器通常在 `http://localhost:4321/`。Pagefind 索引只在构建时生成，要验收全文搜索，请先 `npm run build` 再 `npm run preview`。

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run check` | Astro / TypeScript 检查，再检查 `server/`、`functions/` 类型 |
| `npm test` | 仓库与主题回归测试 |
| `npm run build` | 生成资源、静态构建、Pagefind 索引及全部构建后检查 |
| `npm run verify` | 发布门禁：类型检查 → 测试 → 完整构建 |
| `npm run preview` | 预览 `dist/`（不含 Functions / D1） |
| `npm run generate:assets` | 从 `MUSIC/` 同步歌曲并重写清单 |
| `npm run prepare:covers` | 生成响应式封面与映射 |
| `npm run optimize:images` | 扫描 `public/` 图片生成 WebP（不在默认构建链内） |

其余脚本（`check:links`、`check:modules`、`check:performance`、`check:built-tests`、`prune:media` 以及 `rum:*`、`check:vitals-report`）见 `package.json`。前五个已包含在 `build` 中，RUM 相关见下文。

## 配置与个性化

| 修改内容 | 文件 |
| --- | --- |
| 站点标题、描述、作者、SEO 关键词、顶栏导航 | `src/lib/site.ts` |
| 个人简介、社交链接、技术方向、Anime Shelf | `src/core/data/profile.ts` |
| WORKS 项目卡片、分类与链接 | `src/core/data/projects.ts` |
| 项目 ID、显示名称、详情与文档入口 | `src/core/data/project-metadata.ts` |
| 头像、壁纸、favicon、音乐清单路径 | `src/themes/fuyukawa-kagari/assets.ts` |
| 漫画分层素材与响应式映射 | `src/themes/fuyukawa-kagari/data/mangaArt.ts` |
| 内容集合与 frontmatter schema | `src/content.config.ts` |
| canonical origin、重定向、sitemap、Markdown、Pagefind | `astro.config.mjs` |
| 缓存、Functions 路由、爬虫入口 | `public/_headers`、`public/_routes.json`、`public/robots.txt` |
| RUM 本地 / 云端目标 | `config/rum.local.json`、`config/rum.cloud.json` |

改导航或域名时，同步核对 canonical、sitemap、robots、项目数据和内部链接。

## 内容维护

### 写一篇博客

在 `src/content/blog/` 新增 Markdown 文件：

```yaml
---
title: "文章标题"
description: "一句话摘要"
pubDate: 2026-10-03
tags: ["Astro", "Dev"]
category: "tech"
draft: false
---
```

- 必填：`title`、`description`、`pubDate`。`category` 取 `tech`、`anime`、`life`，默认 `tech`。
- 可选：`slug`、`seoTitle`、`seoDescription`、`seoKeywords`、`updatedDate`、`cover`。URL 用 `slug`，未设置时用内容条目 ID。
- `draft: true` 的文章不进入列表，也没有路由。归档按 `updatedDate ?? pubDate` 降序。
- 集合 glob 包含 `.mdx`，但尚未配置 `@astrojs/mdx`。要用 MDX 组件，先配置集成并验证构建。
- 插图放 `public/blog-assets/` 或 `public/blog-content/`，正文用站内绝对 URL。改名、删除或调整 `slug` 后，同步入口链接和旧 URL 重定向，再跑 `npm run verify`。

### 章节与项目文档

| 集合 | 源目录 | 要点 |
| --- | --- | --- |
| `riscVNotes` | `src/content/risc-v-notes/` | 必填 `title`、`description`、`pubDate`；生成 `/risc-v-notes/<slug>/` |
| `ctfNotes` | `src/content/ctf-notes/` | 必填 `title`、`description`、正整数 `order`；按 `order` 排序 |
| `projectDocs` | `src/content/project-docs/<project>/` | 必填 `title`、`description`、`project`、`routeSlug`、`order`；`project` 须来自项目元数据 |

这三个集合没有 `draft` 字段，新增内容会直接生成路由。

## 图片与音乐

- **封面**：放 `public/blog-covers/`，`cover` 写 `/blog-covers/...`。`prepare:covers` 为 `cover-数字.webp` 生成 `responsive/` 下带哈希的派生图和 `src/core/content/responsive-covers.json`，`build` 会自动执行。
- **主题图片**：放 `public/themes/fuyukawa-kagari/assets/`，由 `assets.ts` 或 `mangaArt.ts` 引用。
- **`prune:media`**：只从 `dist/` 排除 `scripts/lib/media-publish-policy.mjs` 列出的文件，不删除源素材。
- **音乐**：源文件放根目录 `MUSIC/`，`generate:assets` 按文件名排序复制 `.mp3`、`.flac`、`.wav`、`.ogg`、`.m4a` 并重写 `manifest.json`。不要只手改清单；删歌后检查公开目录是否残留旧音频。

## 构建与部署

```text
verify
├── check：astro check → check:rum
├── test
└── build
    ├── generate:assets → prepare:covers
    ├── astro build（含 Pagefind 索引）
    ├── prune:media
    └── check:links → check:modules → check:performance → check:built-tests
```

索引创建失败或没有可索引页面时构建会失败。发布时需完整上传 `dist/`（含 Pagefind、共享样式、响应式封面和 Pages 规则文件）。

### Cloudflare Pages

- `felizx.com` 和 `www.felizx.com` 接到 Pages 项目 `feliz-blog`（`feliz-blog.pages.dev`），canonical 为 `https://felizx.com/`。
- 生产与预览构建命令均为 `npm run verify`，输出目录 `dist/`。域名、生产分支和触发器在 Cloudflare 控制台里配置，仓库配置不会自动同步，发布前请核对。
- 使用支持 `.nvmrc` 的 v3 构建镜像；旧的 `NODE_VERSION` 覆盖值应清除或设为 `24.21.0`。用 `npm ci` 装完整依赖，不要加 `--omit=dev` 或 `NODE_ENV=production`。
- 页面是 Astro `output: "static"`。仓库没有 Vercel、EdgeOne 或 GitHub Pages 的发布配置。
- `RUM_DB`、`RUM_ENVIRONMENT` 需在 Pages 对应环境单独绑定；生产与预览使用不同的物理数据库。

### 缓存

`public/_headers` 随构建复制到 `dist/`：HTML 默认 `max-age=0, must-revalidate`；`/_astro/*`、通用 WebP、WOFF2 为一年 `immutable`；固定文件名的主题素材改为重新验证。替换长期缓存的资源时请换文件名或 URL。本地构建通过不代表线上已更新。

## 真实体验测量（RUM）

`src/core/web-vitals.mjs` 采集 LCP、INP、CLS。构建变量 `PUBLIC_WEB_VITALS_ENDPOINT` 为空时只在本地观察，设为 `/api/rum` 后向同源上报；它会编译进前端，修改后需重新构建发布。

`functions/api/rum.ts` 配合 `server/rum.ts` 校验并写入 D1：只接受同源 `POST`、`text/plain` JSON、最大 16 KiB，成功返回 204。没有公开的导出或清理接口。

- 统计口径：缺失指标不补零；按 `navigationId` 取最高 `revision`；`document` 与 `soft-navigation` 分开；每组至少 30 个有效移动样本才算结论，否则为 `INCONCLUSIVE`。
- `check:vitals-report` 退出码：0 全部达标，1 有超标，2 样本不足。阈值 LCP 2500 ms、INP 200 ms、CLS 0.1。
- 本地验证用 `npm run rum:local -- <action> --authorize-local`（Wrangler 固定 4.145.0，状态在 `.wrangler/rum/`）；云端用 `npm run rum:cloud -- <action>`，每次须显式传入 `--authorize-cloud`、`--account`、`--database`、`--environment`。
- 数据保留 35 天，由 `.github/workflows/rum-retention.yml` 每日（UTC 19:17）触发。手动默认只读预检，清理需 `RUM_RETENTION_ENABLED` 精确为 `true`。有这份工作流不代表生产清理已激活，以 Actions 里实际 job 状态和结构化日志为准。

协议、导出、云端验收、保留期与工作流细节见 [真实体验测量文档](docs/real-experience-measurement.md)。

## 目录结构

```text
src/
├── content/          blog / risc-v-notes / ctf-notes / project-docs
├── core/             共享内容、数据、canonical 支持、web-vitals
├── pages/            主站、章节、项目及历史兼容路由
├── themes/fuyukawa-kagari/   页面、布局、组件、运行时模块、样式、主题测试
├── lib/site.ts       站点与导航配置
└── content.config.ts 内容集合 schema

public/               静态资源与 Pages 规则（blog-covers、blog-assets、blog-content、demos、themes）
MUSIC/                音乐源文件
scripts/              构建、资源、校验与 RUM 管理脚本
functions/api/        Pages Functions（rum.ts、send.ts）
server/               RUM 校验与存储、Resend 转发
migrations/rum/       D1 增量迁移
config/               RUM 本地 / 云端目标
.github/workflows/    RUM 保留期清理
tests/                仓库级回归与可选端到端验收
docs/                 测量文档
```

`BaseLayout.astro` 使用 Astro `ClientRouter`。修改运行时（首页、搜索、音乐、樱花）时，请核对冷启动、软导航、前进后退、重复挂载和旧 DOM 清理；搜索还要覆盖快速输入、迟到结果和错误重试。`npm run verify` 只检查代码，浏览器实际表现和线上结果需另外核对。

## 维护文档

- [真实体验测量](docs/real-experience-measurement.md)
- [项目开发记录](DEVELOPMENT_NOTES.md)：按阶段记录的维护历史，不代表实时部署状态
- [主题开发记录](src/themes/fuyukawa-kagari/DEVELOPMENT_NOTES.md)
- [第三方素材说明](THIRD_PARTY_ASSETS.md)

## 许可证与第三方素材

代码许可证不表示图片、音乐和角色素材都可自由使用。

| 内容 | 许可 |
| --- | --- |
| 维护者有权授权的代码、主题样式、脚本、测试、配置和技术文档 | [MIT](LICENSE) |
| `src/content/blog/` 中维护者有权授权的原创文章文字及网站发布版本 | [CC BY-NC-SA 4.0](CONTENT_LICENSE.md) |
| 原创软件代码示例 | MIT，除非另有声明；第三方代码遵循原许可 |
| 图片、截图、插画、音视频、字体、角色美术及其他媒体 | 不自动适用上述许可，详见 [第三方素材说明](THIRD_PARTY_ASSETS.md) |

复用主题时请确认素材授权并保留要求的署名。维护者不声称拥有第三方作品的版权，本仓库许可证也不能替第三方授权。
