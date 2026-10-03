# Feliz Lab

Feliz Lab 是基于 **Astro 6 + TypeScript** 的个人博客，主站统一使用 **Fuyukawa Kagari** 主题。页面静态构建，真实体验数据通过 **Cloudflare Pages Functions + D1** 接收和保存。

- 网站：[felizx.com](https://felizx.com/)
- 仓库：[Felixz6/feliz_blog](https://github.com/Felixz6/feliz_blog)
- 搜索：Pagefind 构建时生成索引，浏览器端全文检索
- 内容：Astro Content Collections、Markdown、代码高亮、章节目录与项目文档
- 部署：Cloudflare Pages，构建产物为 `dist/`

## 目录

- [页面与功能](#页面与功能)
- [本地开发与验证](#本地开发与验证)
- [配置与个性化](#配置与个性化)
- [内容维护](#内容维护)
- [图片与音乐资源](#图片与音乐资源)
- [构建、部署与缓存](#构建部署与缓存)
- [真实体验测量与 RUM](#真实体验测量与-rum)
- [主要目录与运行时](#主要目录与运行时)
- [维护文档](#维护文档)
- [许可证与第三方素材](#许可证与第三方素材)

## 页面与功能

| 路径 | 内容 |
| --- | --- |
| `/` | 首页 Hero、个人资料终端卡片、最近文章、本地日期时间 |
| `/blog/` | 文章归档、分类筛选、文章目录、Pagefind 全文搜索 |
| `/blog/<slug>/` | 博客文章、桌面/移动端目录、代码复制、图片查看与打印样式 |
| `/projects/` | WORKS：项目展示、CTF 解题笔记与开源仓库入口 |
| `/projects/src-skill/`、`/projects/recon-mcp/` | 项目介绍 |
| `/projects/<project>/docs/`、`/projects/<project>/docs/<slug>/` | 项目文档目录、正文与前后篇导航；项目 ID 为 `src-skill`、`recon-mcp` |
| `/projects/ctf-notes/`、`/projects/ctf-notes/<slug>/` | Web CTF 笔记目录与章节 |
| `/blog/risc-v-xv6-learning-notes/`、`/risc-v-notes/<slug>/` | RISC-V / xv6 学习目录与独立章节 |
| `/about/` | ME：共享个人资料、技术方向与 Anime Shelf |
| `/friends/` | 旧入口，重定向到 `/about/` |
| `/404.html` | 主站 404 页面 |
| `/api/rum` | 唯一 Pages Function 路由，接收同源 RUM 上报，不是静态页面 |

主站保留樱花雨、阅读进度、返回顶部、音乐播放器和页面快捷菜单；Live2D、公告卡片、猪形滚动挂件及首页标签雨已移除。音乐播放器标题为 Music / Playlist，支持切歌、进度、音量和续播设置，实际自动播放仍受浏览器行为影响。

仓库仅保留 Fuyukawa Kagari 主题。`/themes/fuyukawa-kagari/` 下的首页、Blog、Projects、About 和 404 是历史兼容路由，不是另一套主站；对应页面使用主站 canonical，标记 `noindex,follow`，并排除于 sitemap 和 Pagefind 索引。其他历史重定向由 `astro.config.mjs` 管理，包括旧 SRC 项目名和已替换的文章入口。

## 本地开发与验证

环境要求：**Node.js 24.21.0** 和 npm。`.nvmrc` 是版本入口，`package.json` 的 `engines.node` 与 `.npmrc` 的 `engine-strict=true` 会拒绝不匹配的安装环境；依赖版本以 `package-lock.json` 为准。

```bash
nvm install
nvm use
npm ci
npm run dev
```

开发服务器通常为 `http://localhost:4321/`，以终端输出为准。**Pagefind 索引由构建生成**；验证完整搜索体验时使用 `npm run build` 后的 `npm run preview`，不要把开发服务器的本地标题/摘要回退搜索当成全文索引验收。

### 常用命令

| 命令 | 功能 |
| --- | --- |
| `npm run dev` | Astro 开发服务器 |
| `npm run check` | Astro / TypeScript 检查，再运行 Functions 和 RUM 服务端类型检查 |
| `npm run check:rum` | 单独检查 `server/`、`functions/` 的 TypeScript 类型 |
| `npm test` | 仓库与主题回归测试 |
| `node --test src/themes/fuyukawa-kagari/tests/*.test.mjs` | 仅运行主题专项测试 |
| `npm run build` | 资源生成、静态构建、Pagefind 索引与全部构建后检查 |
| `npm run verify` | 发布门禁：类型检查 → 测试 → 完整构建 |
| `npm run preview` | 预览 `dist/` 静态产物；不提供 Pages Functions / D1 运行时 |
| `npm run generate:assets` | 生成辅助资源，并从 `MUSIC/` 同步歌曲和清单 |
| `npm run prepare:covers` | 生成响应式封面及资源映射 |
| `npm run optimize:images` | 显式扫描 `public/` 图片生成 WebP；不属于默认构建链 |
| `npm run prune:media` | 从 `dist/` 排除已审核的封面原始素材，保留 `public/` 原件 |
| `npm run check:links` | 检查构建产物中的内部链接 |
| `npm run check:modules` | 检查构建后脚本模块 |
| `npm run check:performance` | 检查页面 HTML / CSS 与响应式封面体积预算 |
| `npm run check:built-tests` | 在新产物上重跑 MangaRuntime 作用域和 Pagefind 兼容路由测试 |
| `npm run check:vitals-report -- <file>` | 对导出的真实体验 JSON 执行可信移动样本统计 |
| `npm run rum:local -- <action> ...` | 本地 D1 初始化、开发、导出、清理 |
| `npm run rum:cloud -- <action> ...` | 明确指定云端环境和数据库的状态、导出、清理及预览合成登记 |
| `npm run rum:retention -- ...` | 带激活、凭据检查和结构化日志的 35 天清理入口 |

`verify` 使用 `&&` 串联，类型或测试失败即停止。干净工作区中依赖 `dist/` 的测试可能在前置阶段跳过；`check:built-tests` 会在本轮构建完成后重新执行。纯回归门禁不自动开启 HTTP、真实 D1 或云端端到端测试。

## 配置与个性化

| 修改内容 | 文件 |
| --- | --- |
| 站点标题、描述、作者、SEO 关键词、顶栏导航 | `src/lib/site.ts` |
| 个人简介、社交链接、技术方向、状态与 Anime Shelf | `src/core/data/profile.ts` |
| WORKS 项目卡片、分类和链接 | `src/core/data/projects.ts` |
| 项目 ID、显示名称、详情及文档入口 | `src/core/data/project-metadata.ts` |
| 主题头像、壁纸、favicon、音乐清单路径 | `src/themes/fuyukawa-kagari/assets.ts` |
| 漫画分层素材及响应式映射 | `src/themes/fuyukawa-kagari/data/mangaArt.ts` |
| 内容集合与 frontmatter schema | `src/content.config.ts` |
| canonical origin、重定向、sitemap、Markdown 和 Pagefind 集成 | `astro.config.mjs` |
| 页面缓存、Functions 路由、爬虫入口 | `public/_headers`、`public/_routes.json`、`public/robots.txt` |
| 本地 D1 与云端管理目标 | `config/rum.local.json`、`config/rum.cloud.json` |
| RUM 清理工作流 | `.github/workflows/rum-retention.yml` |

调整导航或域名时，同时核对 canonical、sitemap、robots、项目数据和内部链接。`config/rum.cloud.json` 是管理员工具的目标清单，**不自动配置 Pages 的 D1 绑定或环境变量**。

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

- `title`、`description`、`pubDate` 必填；`category` 为 `tech`、`anime` 或 `life`，默认 `tech`；`tags` 默认空数组，`draft` 默认 `false`。
- `draft: true` 的文章不进入已发布列表和文章路由。归档按 `updatedDate ?? pubDate` 降序排列。
- 可选字段：`slug`、`seoTitle`、`seoDescription`、`seoKeywords`、`updatedDate`、`cover`。文章 URL 使用 `slug`，未设置时使用内容条目 ID。
- 集合 glob 包含 `.mdx`，但当前没有配置 `@astrojs/mdx` 集成；现有写作流程使用 `.md`。引入 MDX 组件前需另行配置集成并验证构建。
- Markdown 支持 GFM、标题锚点和 Expressive Code 高亮/复制。图片查看器、文章目录与打印样式由共享文章布局提供。

文章插图可放入 `public/blog-assets/` 或 `public/blog-content/`，正文通过站内绝对 URL 引用。改名、删除文章或调整 `slug` 后，应同步项目入口、章节链接及必要的旧 URL 重定向，并运行 `npm run verify`。

### 章节与项目文档

| 内容集合 | 源目录 | frontmatter / 路由规则 |
| --- | --- | --- |
| `riscVNotes` | `src/content/risc-v-notes/` | `title`、`description`、`pubDate` 必填；可选 `slug` 等文章字段；生成 `/risc-v-notes/<slug>/`，返回学习目录 |
| `ctfNotes` | `src/content/ctf-notes/` | `title`、`description`、正整数 `order` 必填；条目 ID 生成章节路径，按 `order` 排序 |
| `projectDocs` | `src/content/project-docs/<project>/` | `title`、`description`、`project`、`routeSlug`、正整数 `order` 必填；`project` 必须来自项目元数据 |

这些集合没有博客的 `draft` 字段，新增内容会直接参与静态路由生成。项目文档的 URL 使用 `routeSlug`，可以与中文 Markdown 文件名不同；正文、目录和前后篇导航由共享 `DocumentLayout.astro` 渲染。

## 图片与音乐资源

### 封面和主题图片

- 文章封面放在 `public/blog-covers/`，`cover` 使用 `/blog-covers/...`。当前响应式脚本处理 `cover-数字.webp` 命名的静态 WebP，生成较小尺寸，不覆盖接受的原图。
- `npm run prepare:covers` 生成 `public/blog-covers/responsive/` 和 `src/core/content/responsive-covers.json`；派生文件名包含内容/参数哈希，供列表的 `srcset` 使用。`npm run build` 自动执行这一步。
- 主题素材放在 `public/themes/fuyukawa-kagari/assets/`，通过 `assets.ts` 或 `mangaArt.ts` 引用。favicon 目前指向该目录的 `kanade_c.png`。
- `prune:media` 仅移除 `scripts/lib/media-publish-policy.mjs` 列出的构建产物；它不是通用“删除未使用文件”工具，也不删除源目录素材。
- `optimize:images` 会批量扫描公开目录，适合明确的图片维护任务；日常构建不需要额外运行。

### 音乐

音乐源文件位于根目录 **`MUSIC/`**。`generate:assets` 按文件名排序，复制支持的 `.mp3`、`.flac`、`.wav`、`.ogg`、`.m4a`，并重写 `public/themes/fuyukawa-kagari/music/manifest.json`。因此调整曲目应修改 `MUSIC/` 后生成，而不是只手工编辑生成的清单。

```bash
npm run generate:assets
npm run prepare:covers
npm run verify
```

上述生成步骤也包含在构建中。移除歌曲后需核对公开目录是否仍残留旧音频；同步脚本负责复制和重建清单，不会自动删除所有旧文件。文件格式能否播放取决于浏览器支持。

## 构建、部署与缓存

```bash
nvm use
npm ci
npm run verify
```

### 构建链

```text
verify
├── check：astro check → check:rum
├── test：仓库及主题回归
└── build
    ├── generate:assets → prepare:covers
    ├── astro build（包含 Pagefind 索引生成）
    ├── prune:media
    ├── check:links → check:modules → check:performance
    └── check:built-tests
```

Pagefind 集成在 `scripts/lib/pagefind-integration.mjs`，索引输出到 `dist/pagefind/`；创建索引、写入文件失败或没有可索引页面会阻止构建成功。发布时需要完整上传 `dist/`，不能遗漏 Pagefind、共享样式、响应式封面或 Pages 规则文件。

### Cloudflare Pages

仓库部署约定：正式入口 `https://felizx.com/` 与 `https://www.felizx.com/` 均接入 Cloudflare Pages 项目 `feliz-blog`（`https://feliz-blog.pages.dev/`），正式页 canonical 为 `https://felizx.com/`。生产与预览构建命令统一设为 **`npm run verify`**，输出目录仍为 **`dist/`**；域名、生产分支、构建触发器和环境配置由 Cloudflare 控制台管理。

- 使用支持 `.nvmrc` 的 v3 构建镜像；旧 `NODE_VERSION` 覆盖值应清除，或与 `24.21.0` 一致。
- 使用 `npm ci` 安装完整依赖，不通过 `--omit=dev` / `NODE_ENV=production` 省略类型检查工具。
- 仓库配置不会自动修改控制台构建命令；发布前核对设置。已开启 Git 自动部署时，推送生产分支可能触发发布。
- 页面仍为 Astro `output: "static"`，没有 Vercel adapter / `vercel.json`、EdgeOne 配置或 GitHub Pages 发布工作流。当前 GitHub Actions 的 RUM 工作流是数据库管理任务，**不是网站部署任务**。
- RUM Function 需要在 Pages 对应环境单独绑定 `RUM_DB` 和 `RUM_ENVIRONMENT`；生产与预览使用不同物理数据库，不能复用本地虚拟数据库 ID。

### 缓存策略

`public/_headers` 随构建复制到 `dist/`：HTML 默认 `max-age=0, must-revalidate`；`/_astro/*`、通用 WebP 和 WOFF2 使用一年 `immutable`。固定文件名的 `/themes/fuyukawa-kagari/assets/*` 在后置规则中覆盖为重新验证缓存，便于更新主题素材。HTML 没有 `no-transform`，允许边缘压缩文本。

替换长期缓存资源时应使用新文件名/URL；响应式封面已带哈希。不要把“本地构建通过”当作 CDN 或线上版本已经更新。

## 真实体验测量与 RUM

### 采集与接收

`src/core/web-vitals.mjs` 使用官方 `web-vitals` 采集 **LCP、INP、CLS**。构建变量 `PUBLIC_WEB_VITALS_ENDPOINT` 控制发送：空值只保留本地观察；设置 `/api/rum` 后向同源接收端上报。该变量编译进前端，修改后需要重新构建发布。

`functions/api/rum.ts` 使用 `server/rum.ts` 校验并写入 D1。`public/_routes.json` 仅 include `/api/rum`，普通页面和静态资源不调用 Function。接收端只接受同源 `POST`、`text/plain` JSON，最大 16 KiB；写入成功后返回 204，冲突导航隔离，超过保留期的迟到上报返回 410。没有公开 HTTP 导出/清理接口。

统计口径保持：

- 缺失指标不补零；真实回调的 CLS=0 保留；没有交互时 INP 可以缺失。
- 按 `navigationId` 选最高 `revision`，窗口按不可变 `navigationStartedAt` 的 `[from,to)` 筛选。
- `document` 与真实 `soft-navigation` 分开统计；Astro 换页事件本身不制造软导航样本，迟到文档指标仍归原文档。
- 按**实际路径 × 测量口径 × 指标**计算可信移动样本 p75。每组至少 30 个有效样本；不足标为 `INCONCLUSIVE`，不以实验室或合成结果代替自然表现。
- `check:vitals-report`：充分且全部达标退出 0，充分但存在超标退出 1，无超标但样本不足退出 2；LCP / INP / CLS 阈值为 2500 ms / 200 ms / 0.1。

### 本地 D1 与统计

Astro 的 `dev` / `preview` 不运行 Pages Functions。完整本地链路使用固定 **Wrangler 4.145.0**；脚本默认通过 `npm exec` 调用，或使用 `RUM_WRANGLER_CLI` 指向已有 CLI。首次使用可能下载开发工具。

```bash
# 端点在构建时生效；只用于本地 D1 验证。
PUBLIC_WEB_VITALS_ENDPOINT=/api/rum npm run build
npm run rum:local -- init --authorize-local
npm run rum:local -- dev --authorize-local
# 通常访问 http://127.0.0.1:8788/；导出前先停止上面的 dev。
npm run rum:local -- export --authorize-local \
  --from=2026-10-01T00:00:00Z --to=2026-10-03T00:00:00Z \
  --page-size=100 --out=/absolute/private/path/rum.json
npm run check:vitals-report -- /absolute/private/path/rum.json \
  --min-samples=30 --from=2026-10-01T00:00:00Z --to=2026-10-03T00:00:00Z
```

本地状态默认在 `.wrangler/rum/`，开发、导出与清理共享独占锁；`.wrangler/` 和 `.dev.vars*` 已被忽略。导出与端点数据不要作为公开仓库素材。

可选本地端到端验收需显式执行，不属于默认门禁：

```bash
VITALS_HTTP_E2E=1 npm test
RUM_D1_E2E=1 node --test tests/rum-d1-local.test.ts
```

前者验证本地 HTTP 上报链路，后者运行独立合成数据的真实本地 D1 验收；两者都不证明生产采集或自然样本充足。云端预览端到端验收及所需部署参数见测量文档。

### 云端管理与 35 天保留

云端入口为 `rum:cloud`，每次明确提供 `--authorize-cloud`、`--account`、`--database`、`--environment`，并核对配置和库内身份。以下为只读状态查询示例，变量取自已确认的管理目标：

```bash
npm run rum:cloud -- status --authorize-cloud \
  --account="$ACCOUNT" --database="$PRODUCTION_DB" --environment=production
```

自然导出默认排除预先登记的合成导航；`register-synthetic` 和 `--cohort=synthetic` 仅用于 preview。受控验收结果和自然样本分开保存，不把预览数据迁入生产统计。

保留期按访问开始时间计算：早于执行时刻减 **35×24 小时**的导航清理，恰好截止保留；删除导航会级联删除 revisions / conflicts，迟到 revision 不延长寿命。日调度不等于毫秒级物理 TTL；第二条清理语句失败时可能已有部分删除，代码回滚不恢复已删除数据。

### GitHub Actions 清理工作流

当前入口已迁移到 **`.github/workflows/rum-retention.yml`**，旧 `config/automation/rum-retention.yml.disabled` 已移除。仓库已交付工作流和回归测试；**工作流存在不等于生产清理已激活**。

| 项目 | 当前代码约定 |
| --- | --- |
| 触发器 | `schedule` / `workflow_dispatch`，无 push / PR 触发 |
| 时间 | 每日 UTC 19:17，即北京时间次日 03:17；实际执行可能延迟 |
| 手动默认操作 | **只读预检**，调用既有 `rum:cloud status`，不执行清理，也不要求激活变量为 true |
| 清理操作 | 手动选择“清理”或定时触发；shell 和 CLI 都要求 `RUM_RETENTION_ENABLED` 精确为 `true` |
| 固定目标 | `Felixz6/feliz_blog` 的 `main`，production 数据库；不提供 preview 切换 |
| 凭据 | secret `RUM_RETENTION_API_TOKEN`；variables `RUM_RETENTION_ACCOUNT_ID`、`RUM_RETENTION_PRODUCTION_DB_ID` |
| 运行约束 | Node.js 24.21.0；10 分钟超时；production 串行且不取消进行中的任务；GitHub token 仅 `contents: read` |
| 激活值为空 / false | 清理 job 被跳过；这不是成功清理，也不是一次失败的清理运行 |
| 执行内容 | 使用现有管理 CLI，不运行 `npm ci`、网站构建或部署 |

启用、停止和首次生产清理是独立管理操作。停止时需同时处理激活变量、workflow 状态和已经开始的 run；以 Actions 实际 job 状态及 `rum-retention.started` / `succeeded` / `failed` 日志判断结果，不用整个 run 的绿色状态替代清理证据。

完整采集、存储、导出与历史验收见 [真实体验测量文档](docs/real-experience-measurement.md)。其中自动化准备段落保留历史模板阶段说明；**当前工作流入口与操作默认值以本节和 workflow 源码为准**。

## 主要目录与运行时

```text
src/
├── content/
│   ├── blog/                     博客文章
│   ├── risc-v-notes/             RISC-V / xv6 章节
│   ├── ctf-notes/                CTF Web 笔记
│   └── project-docs/             项目文档
├── core/
│   ├── content/                 已发布文章、封面映射
│   ├── data/                    共享个人资料、项目与元数据
│   ├── themes/                  canonical 与快捷菜单支持
│   └── web-vitals.mjs           真实体验采集
├── pages/                       主站、章节、项目及历史兼容路由
├── themes/fuyukawa-kagari/
│   ├── pages/                   主题页面实现
│   ├── layouts/                 BaseLayout / ArticleLayout
│   ├── components/              Hero、目录、文档布局与运行时入口
│   ├── lib/                     搜索、音乐、首页、樱花等运行时模块
│   ├── styles/                  主题与页面样式
│   ├── tests/                   主题专项回归
│   └── assets.ts                公开资源路径
├── lib/site.ts                  站点与导航配置
└── content.config.ts            四类内容集合 schema

public/                          直接复制的静态资源与 Pages 规则
├── blog-covers/                 封面原件与 responsive/ 派生图
├── blog-assets/                 文章插图
├── blog-content/                文章内容资源
├── demos/                       静态演示
└── themes/fuyukawa-kagari/       主题 assets/ 与生成的 music/

MUSIC/                           音乐源文件
scripts/                         构建、资源、校验与 RUM 管理脚本
functions/api/rum.ts             Pages Function 接收入口
server/rum.ts                    RUM 校验、存储与导出契约
migrations/rum/                  D1 增量迁移
config/                          本地运行配置、云端管理目标清单
.github/workflows/               RUM 管理工作流
tests/                           仓库级回归与可选端到端验收
docs/                            测量文档
```

`BaseLayout.astro` 使用 Astro `ClientRouter`。首页逻辑拆分在 `home-runtime.mjs` / `home-hero.mjs`，全文搜索在 `blog-search.mjs`，全局布局、音乐和樱花各自拥有运行时模块；需要页面增强的页面按 `needsMangaRuntime` 加载 `MangaRuntime.astro`。

维护运行时时应核对冷启动、软导航、前进/后退、重复挂载与旧 DOM 清理。搜索还需覆盖快速输入、迟到结果、错误回退/重试；图片或 CSS 变更需补桌面/移动端和跨页样式验证。`npm run verify` 是代码门禁，不替代真实浏览器与线上发布核验。

## 维护文档

- [真实体验测量](docs/real-experience-measurement.md)：RUM 协议、D1 管理、统计与历史验收。
- [项目开发记录](DEVELOPMENT_NOTES.md)：按阶段记录的维护历史，不作为实时部署状态。
- [主题开发记录](src/themes/fuyukawa-kagari/DEVELOPMENT_NOTES.md)：主题结构与演进记录。
- [第三方素材说明](THIRD_PARTY_ASSETS.md)：媒体、字体、角色素材及复用边界。

`.codex-artifacts/` 是本地验证与回滚工件，不是应用源码或站点资源；提交 README 更新时应单独核对 diff，避免夹带原始测量数据、诊断输出或凭据。

## 许可证与第三方素材

不同内容类型有不同许可范围，代码许可证不代表所有图片、音乐或角色素材都可自由使用。

| 内容 | 许可 |
| --- | --- |
| 维护者有权授权的代码、主题样式、脚本、测试、配置和技术文档 | [MIT](LICENSE) |
| `src/content/blog/` 中维护者有权授权的原创文章文字及网站发布版本 | [CC BY-NC-SA 4.0](CONTENT_LICENSE.md) |
| 原创软件代码示例 | MIT，除非另有声明；第三方代码遵循原许可 |
| 图片、截图、插画、音视频、字体、角色美术及其他媒体 | 不自动适用上述许可；详见 [第三方素材说明](THIRD_PARTY_ASSETS.md) |

复用主题时请确认素材授权，并保留要求的署名与许可证信息。维护者不声称拥有第三方作品版权，仓库许可证不替第三方授权。
