# 真实体验测量（Core Web Vitals）

体积预算继续由 `npm run check:performance` 检查；它不代替浏览器里的真实用户体验数据。布局使用 Google 官方 `web-vitals` 6.2.2 计算 LCP、INP、CLS，再把每个页面视图（包括 Astro 客户端软导航）的最新值暴露为 `window.__yuimiWebVitals`，也派发 `yuimi:web-vitals` 事件。该库负责 LCP 生命周期、CLS session-window、INP 交互分组/异常值处理与支持环境中的 BFCache/软导航细节；本项目只负责按路由归属、加上设备/网络维度和发送。移动端按粗指针或视口宽度不超过 820 CSS px 分类。

## 接入真实用户数据

1. 配置构建环境变量 `PUBLIC_WEB_VITALS_ENDPOINT`，指向可接收 `POST` 的 RUM 收集端点；不设置时只在浏览器本地暴露数据，不会发送网络请求。
2. 收集端点按 `text/plain` 接收 JSON beacon，并保存每个页面视图的记录。schema v2 的 `navigationId` 标识一次页面视图，`revision` 随指标更新递增；隐藏或离开后到达的指标仍归属原页面视图，并发送更高版本的快照。记录含路径（不含查询参数/片段）、设备类别、视口宽度、网络类型和 `metrics`。统计脚本按 `navigationId` 只保留最高 `revision`，避免重复 beacon 增加 p75 样本数；没有导航身份的旧格式记录仍按单条样本处理。
3. 导出记录数组到 JSON 文件，然后运行：

   ```sh
   npm run check:vitals-report -- ./reports/web-vitals.json --min-samples=30
   ```

脚本按去重后的移动端页面视图、路由和指标分别计算 nearest-rank p75。目标为 LCP ≤ 2500 ms、INP ≤ 200 ms、CLS ≤ 0.1；每组样本不足阈值时标为 `INCONCLUSIVE`（退出码 2），超标时退出码 1，全部达标且样本充足时退出码 0。建议用 28 天滚动窗口比较同一批路由的移动端访问。

`VITALS_HTTP_E2E=1 npm test` 中的链路测试会启动本机 HTTP 接收器，驱动 collector 发布三项指标、通过真实 HTTP POST 送达接收器、保存按路由分开的 JSON，再执行统计 CLI 并核对通过/超标输出；普通 `npm test` 默认跳过需要绑定 loopback 的这一条链路测试。该验证证明本地采集—传输—按页面汇总链路；它不证明生产服务已经接通或已有足够的真实移动端样本。核验生产时，应检查部署产物中的 `PUBLIC_WEB_VITALS_ENDPOINT` 已编译为接收器 URL，并在接收器看到带路由的记录。

记录格式示例：

```json
[
  {
    "schema": "yuimi-web-vitals/v2",
    "navigationId": "d1b20dd0-7c99-4c9a-a5a6-4b254b544f80",
    "revision": 4,
    "path": "/",
    "deviceClass": "mobile",
    "viewportWidth": 390,
    "network": "4g",
    "saveData": false,
    "sampledAt": "2026-09-28T08:00:00.000Z",
    "metrics": {
      "LCP": { "value": 2140, "unit": "ms", "rating": "good", "target": 2500 },
      "INP": { "value": 168, "unit": "ms", "rating": "good", "target": 200 },
      "CLS": { "value": 0.04, "unit": "score", "rating": "good", "target": 0.1 }
    }
  }
]
```

缺少收集端点或真实访问样本时，仓库中的代码只能验证采集及 p75 计算逻辑，不能替代生产数据结论。
