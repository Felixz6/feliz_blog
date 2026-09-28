# 真实体验测量（Core Web Vitals）

体积预算继续由 `npm run check:performance` 检查；它不代替浏览器里的真实用户体验数据。布局会在每个页面视图（包括 Astro 客户端软导航）内采集 LCP、INP、CLS，并把最近一份本地快照暴露为 `window.__yuimiWebVitals`，也会派发 `yuimi:web-vitals` 事件。移动端按粗指针或视口宽度不超过 820 CSS px 分类。

## 接入真实用户数据

1. 配置构建环境变量 `PUBLIC_WEB_VITALS_ENDPOINT`，指向可接收 `POST` 的 RUM 收集端点；不设置时只在浏览器本地暴露数据，不会发送网络请求。
2. 收集端点按 `text/plain` 接收 JSON beacon，并保存每个页面视图的记录。记录含路径（不含查询参数/片段）、设备类别、视口宽度、网络类型和 `metrics`；不含账号、Cookie、来源 URL 或用户标识。发送时机是页面视图切换、隐藏或离开。
3. 导出记录数组到 JSON 文件，然后运行：

   ```sh
   npm run check:vitals-report -- ./reports/web-vitals.json --min-samples=30
   ```

脚本按移动端、路由和指标分别计算 nearest-rank p75。目标为 LCP ≤ 2500 ms、INP ≤ 200 ms、CLS ≤ 0.1；每组样本不足阈值时标为 `INCONCLUSIVE`（退出码 2），超标时退出码 1，全部达标且样本充足时退出码 0。建议用 28 天滚动窗口比较同一批路由的移动端访问。

记录格式示例：

```json
[
  {
    "schema": "yuimi-web-vitals/v1",
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
