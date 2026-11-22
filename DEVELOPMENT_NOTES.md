# Feliz Lab 开发笔记

Feliz Lab 是 Astro 6 静态博客，只使用 Fuyukawa Kagari 主题。页面输出到 `dist/`，部署目标是 Cloudflare Pages。RUM、邮件转发和留言由 Pages Functions 处理。这里只记录当前代码里的事实。

## 目录职责

- `src/pages/`：主站路由。首页、博客、项目、关于、RISC-V 笔记、CTF 笔记和 404 渲染 Fuyukawa Kagari 的页面或布局。
- `src/pages/themes/fuyukawa-kagari/`：同一内容的历史兼容路由。
- `src/themes/fuyukawa-kagari/`：主题布局、组件、样式和浏览器运行时。
- `src/core/`：内容辅助、canonical 路径和 SEO。
- `src/content/`：博客、RISC-V 笔记、CTF 笔记、项目文档。
- `src/lib/site.ts`：站点名、描述和导航。
- `public/`：静态资源、`_headers`、`_routes.json`。音乐在 `public/themes/fuyukawa-kagari/music/`。
- `functions/api/`：`rum.ts`、`send.ts`、`message.ts`。
- `server/`：RUM 校验与存储、Resend 转发。
- `scripts/`：资源生成、构建后检查、RUM 管理。
- `tests/`：回归测试。云端和本地 D1 验收默认跳过。

## 关键不变量

- 正式 origin 是 `astro.config.mjs` 里的 `https://felizx.com`。`getCanonicalPath()` 会去掉 `/themes/fuyukawa-kagari` 前缀；兼容页使用这个 canonical。
- `/themes/` 下的兼容路由输出 `noindex,follow`。sitemap 排除以 `/themes/` 开头的地址，Pagefind 也不索引这些别名。
- 兼容路由继续提供首页、博客、关于、项目和 404，不是第二套主题。
- `public/_routes.json` 只放行 `/api/rum`、`/api/send`、`/api/message`。普通页面和静态资源不进入 Functions。
- `npm run generate:assets` 从公开音乐目录重写 `manifest.json`。不要手改清单。
- `scripts/lib/media-publish-policy.mjs` 只决定哪些封面原图不进入 `dist/`，不删除 `public/` 中的文件。

## 常用命令

需要 Node.js 24.21.0（`.nvmrc`，`engine-strict`）。

```bash
npm ci
npm run dev
npm run check
npm test
npm run build
npm run verify
```

`npm run verify` 是发布门禁：`check`（`astro check`，再对 `server/` 和 `functions/` 做 `tsc`）→ 测试 → 完整构建。构建包含资源生成、静态页面、Pagefind、媒体裁剪，以及链接、模块、体积和构建后测试。

## 历史

2026 年 11 月之前的长篇记录在 `docs/archive/DEVELOPMENT_NOTES.legacy.md`。其中的旧主题、本机路径和调度说明不代表当前行为。
