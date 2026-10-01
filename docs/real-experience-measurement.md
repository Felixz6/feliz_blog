# 真实体验测量（Core Web Vitals）

体积预算由 `npm run check:performance` 检查；它不代替真实用户体验。统一发布验证入口仍为 `npm run verify`，Node 固定为 24.21.0。测量使用现有 `web-vitals` 6.2.2，不新增依赖或监控系统。

## 样本与指标有效性

- 初始 `metrics` 是空对象；没有回调的 LCP、INP、CLS 是缺失，不是零。真实回调的零（包括 CLS=0）保留。
- 只接受有限、非负的数字和真实 `metricId`；不把 `null`、字符串或不支持的指标转换为零。没有交互的 INP 保持缺失。
- 移动端按粗指针或视口不超过 820 CSS px 分类。设备、视口、网络信息固定在样本创建时，不随迟到 beacon 改变。
- 每项指标独立计算有效样本数；30 次页面浏览不等于 30 个 INP 样本。

## 文档生命周期与真实软导航

`measurementScope` 有两种口径，统计时绝不混合：

1. `document`：文档生命周期指标绑定初始文档；使用 `reportSoftNavs: false`。Astro 换页后首次出现或更新的文档 INP、CLS 仍属于原文档，不按 interaction entry 的时间或当前 URL 改归属。BFCache 恢复是新访问，使用恢复事件的时间和当时路径。
2. `soft-navigation`：仅在浏览器同时提供 `soft-navigation` entry 和 `PerformanceSoftNavigation.getLargestInteractionContentfulPaint()` 时，额外使用 `reportSoftNavs: true`，并只接收其中的真实软导航回调。以浏览器 `navigationId`、`navigationStartTime` 和回调路径确定身份；重复进入同一路径仍是不同样本。

软导航选项会提前结束其初始硬导航指标，不能把该初始片段当成完整文档生命周期。因此支持环境采用分开的回调，软导航流中的初始硬导航/BFCache 指标不重复计数。不支持软导航 API 时只采文档生命周期指标；Astro 的 before/after-swap 本身不制造软导航样本。

`window.__yuimiWebVitals` 是最新已识别测量访问的快照，不承诺跟随每次 Astro 路径变化。`yuimi:web-vitals` 事件也发布旧访问的迟到更新，其 `detail.navigationId` 是该更新的真实身份；旧更新不会覆盖当前快照。端点为空时仍可本地观察。

## schema v2 的身份和时间字段

- `documentId`：当前文档实例的身份，跨该文档内软导航/BFCache 保持。
- `navigationId`：一个测量样本的 UUID；同一访问的更新不变，重复访问不复用。
- `revision`：指标或发送状态变化时递增；较晚到达的更高版本更新原样本。
- `measurementScope`：`document` 或 `soft-navigation`。
- `navigationStartedAt`：不可变的、带时区的访问开始时间。初始文档使用 `performance.timeOrigin`；软导航/BFCache 加上其 `navigationStartTime`。
- `navigationStartTime`：上述开始时间相对文档 time origin 的毫秒值。
- `browserNavigationId`：浏览器导航身份；软导航必需。初始文档未得到浏览器指标前可以缺失。
- `sampledAt`：快照/更新生成时间，不用于访问窗口过滤。
- 每项指标保留 `metricId`、`navigationType`、`navigationStartTime`、`navigationPath` 和可用的浏览器导航身份。`reportedNavigationPath` 保留库报告的路径用于核查；不保存 URL 查询参数、片段或完整交互内容。

收集器对相同软导航身份的冲突路径不猜测归属；指标身份跨样本冲突也被丢弃。浏览器库负责 CLS session-window、INP 交互分组和 LCP 生命周期。

## 接收、存储、导出

本仓库是静态站，没有生产接收器或数据库。本轮仅修测量，不设置 `PUBLIC_WEB_VITALS_ENDPOINT`，不修改 Cloudflare 配置。

后续复用已确认的接收/存储入口时：

1. 在构建环境设置 `PUBLIC_WEB_VITALS_ENDPOINT`；接收器按 `text/plain` 接收 JSON beacon。检查生产 JS 中端点已编译进去。
2. 保存全部修订，或按 `navigationId` 仅以更高 `revision` 幂等更新；访问开始时间、路径、口径不能随修订改变。接收端的 HTTP 成功不等于已落库，必须读回导出核对身份、版本和三项有效性。
3. 做一次真实移动硬导航、软导航（支持环境）、隐藏和迟到更新验证。测试生成的数据单独标注，不混入自然访问样本。
4. 积累自然移动访问后导出 JSON 数组或 `{ "reports": [...] }`。导出必须包含开始时间在窗口内的样本的全部修订，即使更新在窗口结束后才到达；不能仅按 beacon 到达时间裁剪。

## 统计

```sh
npm run check:vitals-report -- /absolute/path/web-vitals.json \
  --min-samples=30 \
  --from=2026-09-03T10:40:00Z \
  --to=2026-10-01T10:40:00Z
```

窗口为 `[from, to)`，起点包含、终点排除；必须使用含时区的 ISO 时间。省略窗口参数时统计输入中的全部可信记录。

脚本先按 `navigationId` 保留最高 `revision`，再按 `navigationStartedAt` 限定窗口，然后按**实际路径 × measurementScope × 指标**计算 nearest-rank p75：排序后取第 `ceil(0.75 × n)` 项。不会跨路由或跨导航口径凑足样本。

- LCP ≤ 2500 ms，INP ≤ 200 ms，CLS ≤ 0.1。
- `n < 30` 标为 `INCONCLUSIVE`；`n=0` 显示 `p75 missing`，不补零。
- 样本充分且超标退出 1；没有超标但存在样本不足退出 2；全部达标且充分退出 0。无可信移动记录或参数错误退出 2。
- v1 和修正前缺少开始时间、口径/文档身份的 v2 记录保留原数据，但从可信统计排除，不用 `sampledAt` 或当前路径补齐。占位零缺少回调身份，也不计入指标。
- 导航身份随 revision 变化、同版本指标内容冲突，以及带相同身份的畸形修订，均隔离该导航，不回退到旧版本冒充最新值。CLI 输出排除计数，不输出访问身份或原始记录。

新字段为 v2 的增量字段；部署重叠期旧记录仍可存储，但不与新可信口径合并。回滚时保留所有已存数据，旧统计器不用于新口径验收。

## 本地验收与生产边界

`tests/web-vitals-trust.test.ts` 覆盖无回调、真实零、首次迟到文档 INP、同路径多次软导航、迟到版本、开始时间窗口边界、BFCache、旧格式及身份冲突隔离。

`VITALS_HTTP_E2E=1` 链路测试使用临时 loopback HTTP 接收器，把原始和迟到修订保存为 JSON，再执行统计 CLI；它证明本地采集—传输—保存—导出—去重链路，不证明生产已接通。统一门禁仍是 `npm run verify`；HTTP 测试默认跳过，需显式开启。

缺少真实生产样本时不输出生产 p75，不把实验室测试或合成数据当成真实用户结果。
