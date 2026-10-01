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

本仓库保持 Astro `output: "static"`，新增 `functions/api/rum.ts` 与 D1 增量迁移。`public/_routes.json` 仅包含精确路径 `/api/rum`，其他页面/资源不调用 Function；没有 HTTP 导出接口、独立 Worker 或监控面板。采集端点仍默认空，本地实现不代表生产已接通。生产目前仍为 `de7fc63`，测量修正基线为 `bf3a4da`。

### 接收与持久化契约

- 同源 `POST /api/rum`，`Origin` 必须等于请求 origin；存在 `Sec-Fetch-Site` 时仅接受 `same-origin`/`none`。其余方法 405，错误路径 404，跨源 403；不开放 CORS。
- 接受 `text/plain` 或 `text/plain;charset=UTF-8` JSON，最大 **16 KiB UTF-8 字节**；既检查 Content-Length，也逐块读取并限制实际大小。拒绝畸形 JSON/UTF-8、额外字段、缺少必需字段及错误类型，不做数字强转。
- 严格检查现有 schema v2 身份、开始/快照时间、设备维度和指标字段；软导航必须有真实浏览器身份。仅保留路径，不接收查询参数、片段、原始交互内容或凭据。`metrics: {}` 合法，真实回调零合法，`null`/占位值被拒绝。
- D1 原子 batch 内进行身份检查和写入；**提交成功后才返回 204**，绑定缺失或数据库失败返回 503。没有异步 `waitUntil` 先回成功。
- `rum_navigations` 保存首次归属和隔离状态；`rum_revisions` 保存全部有效 revision，唯一键为 `(environment, navigation_id, revision)`；`rum_conflicts` 保留冲突变体和原因。高版本、乱序低版本都不覆盖原访问归属。
- 记录字段和指标按键排序进行规范化比较。重复请求仅忽略 `sampledAt` 差异，避免重试时间造成伪冲突；缺失与真实零仍然不同。身份冲突或任何已保存版本的内容冲突将**整个导航永久隔离到保留期结束**，返回 409；普通导出排除该导航的全部版本，冲突记录仍在数据库。
- 文档 `browserNavigationId` 允许从缺失变为已知，不作为文档的不可变身份；软导航则必须固定。文档身份、实际路径、口径、开始时间及设备/网络维度均固定。
- 该公开匿名入口的 Origin 校验不是用户身份认证，也不保证数据来自真人。云端接入时应使用现有 Cloudflare 边缘规则限制滥用，不新增监控系统。

### 本地真实 D1 与授权分页导出

使用固定 **Wrangler 4.145.0** 开发工具；项目没有新增依赖。默认通过 `npm exec --package=wrangler@4.145.0` 调用，或设置 `RUM_WRANGLER_CLI` 为已安装的该版本 CLI 文件路径。D1 管理命令固定 `--local` 和 `config/rum.local.json`，Pages dev 使用对应的本地 D1/环境绑定参数，不接受 `--remote`、其他配置或生产环境参数。

```sh
npm run verify
npm run rum:local -- init --authorize-local
npm run rum:local -- dev --authorize-local
# 开发服务为 http://127.0.0.1:8788。完成写入后先停止 dev，再导出。
npm run rum:local -- export --authorize-local \
  --from=2026-10-01T00:00:00Z --to=2026-10-02T00:00:00Z \
  --page-size=100 --out=/absolute/private/path/rum.json
npm run check:vitals-report -- /absolute/private/path/rum.json \
  --min-samples=30 --from=2026-10-01T00:00:00Z --to=2026-10-02T00:00:00Z
```

授权由本地操作系统对 D1 文件的访问权限与显式 `--authorize-local` 共同限定，**不是公开 HTTP token 接口**。状态目录默认 `.wrangler/rum`，新目录权限 0700，导出文件 0600；命令不打印导航身份或原始记录。它们与本地 secret 文件已加入忽略规则。`--state=/absolute/path` 可以指定独立验收数据库。

导出按不可变 `navigationStartedAt` 的 `[from,to)` 选择未隔离导航，然后以 D1 row_id 作 keyset 分页，输出 `{ "reports": [...] }`，含窗口内导航的**全部已保存 revision**；迟到 `sampledAt` 超出窗口仍导出。JSON 原子写入文件，仅包含采集契约的脱敏字段，不含 IP、UA、数据库密钥或请求头。开发/导出/清理共享本地独占锁，导出前必须停止包装命令启动的 Pages dev；不要绕过包装脚本同时写数据库。进程被强制终止后，应先确认其子进程退出，再人工移除陈旧锁。

### 35 天保留与显式清理

保留期按**访问开始时间**计算，而非最后 revision 到达时间，恰好 35 天的访问保留，早于截止时间删除。超过 35 天的迟到上报返回 410，避免已清理访问复活。

```sh
# 仅本地；显式执行，没有定时器。
npm run rum:local -- cleanup --authorize-local
# 可指定历史验收时钟；拒绝未来清理时钟。
npm run rum:local -- cleanup --authorize-local --now=2026-10-01T12:00:00Z
```

删除 `rum_navigations` 时外键级联删除其 revisions 和 conflicts；本地命令仅清理 `environment='local'`。本轮仅对独立合成验收数据执行清理。

### 云端授权管理与并发分页

云端命令是独立的 `npm run rum:cloud`；`rum:local` 的默认值、虚拟数据库 ID、`--local` 和停服锁保持不变。没有公开 HTTP 导出/清理接口，也没有独立 Worker。

`config/rum.cloud.json` 记录账户、Pages 项目及 production/preview 两个**不同物理数据库**。它只供管理员工具读取，不是 Pages 的部署配置；绑定仍在 Pages 控制台分别管理。每个数据库的 `rum_admin_identity` 单行记录再次核对账户、数据库及环境。所有云端操作都必须显式提供四个参数，拒绝数据库/环境不匹配；数据库触发器还会拒绝跨环境导航写入。

管理员使用官方 Wrangler 已登录凭据，或通过环境变量提供已有最小权限凭据。D1 需要写权限（清理/登记），Pages 配置与部署需要 Pages 写权限。凭据不写入仓库、不打印；不要在命令行参数中放 token。固定 Wrangler 4.145.0，与本地工具一致。

```sh
# ACCOUNT、PREVIEW_DB、PRODUCTION_DB 从 config/rum.cloud.json 读取；均非凭据。
npm run rum:cloud -- status --authorize-cloud \
  --account="$ACCOUNT" --database="$PREVIEW_DB" --environment=preview
npm run rum:cloud -- export --authorize-cloud \
  --account="$ACCOUNT" --database="$PREVIEW_DB" --environment=preview \
  --from=2026-10-01T00:00:00Z --to=2026-10-02T00:00:00Z \
  --page-size=100 --out=/absolute/private/path/natural.json
# 显式 35 天清理，不包含定时器，也不删除数据库。
npm run rum:cloud -- cleanup --authorize-cloud \
  --account="$ACCOUNT" --database="$PREVIEW_DB" --environment=preview
# 生产同一命令必须明确切换数据库与环境，禁止复用预览数据库 ID。
npm run rum:cloud -- cleanup --authorize-cloud \
  --account="$ACCOUNT" --database="$PRODUCTION_DB" --environment=production
```

迁移 `0001_rum.sql` 保留现有采集契约，`0002_cloud_admin.sql` 增量增加管理身份、导出代数及合成导航登记；都可重复执行，无 drop/覆盖旧 revision。云端用 `wrangler d1 migrations apply RUM_DB --remote --config=<明确账户及数据库的管理员配置>` 记录迁移历史；禁止将本地虚拟配置用于云端。迁移后管理员一次性写入与实际库匹配的 `rum_admin_identity`，工具核验成功后再接收合成数据。生产库本轮只有迁移/身份元数据，没有 RUM 记录。

云端导出**不使用本地停服锁**：主库的 SQL 触发器对 navigation、revision、conflict 和合成分类的所有插入/更新/删除递增环境代数。工具读取起始代数和 row_id 高水位，按访问开始时间 `[from,to)` 选择未隔离导航，分页导出窗口内全部保存 revision，再核对结束代数。期间出现迟到 revision、隔离或清理变化时，丢弃整批结果并重试（最多 3 次）；持续变化则退出 1，不发布部分文件，也不覆盖已有导出。通过的结果是最后检查时刻之前的一致快照，之后到达的 revision/冲突由下一次导出体现。高水位单独不足以防止分页途中发生隔离。

默认导出 `cohort=natural`，排除管理员预先登记的合成 navigationId；仅预览支持 `--cohort=synthetic`。受控测试先将唯一 ID 数组写入本地 0600 JSON，再用 `register-synthetic --ids=/absolute/private/path/ids.json` 登记，**之后**才 POST。同源接收契约不增加可伪造的 cohort 字段。合成验收文件与自然样本文件分开保存；现有统计器仍接受 `{reports:[...]}`，额外 export 元数据仅记录窗口/代数/分页，不含凭据或原始请求头。导出文件原子替换，权限 0600。

清理按不可变开始时间单条 DELETE + 外键级联执行，不先读计数再删除；并发迟到请求在接收器被 35 天规则拒绝。合成登记仅在超过 35 天且对应导航已删除时清理。**每日自动清理另列待办，本轮不新增调度。**

### 生产／预览绑定、发布与回滚

Pages 项目 `feliz-blog` 的生产分支保持 `main`；`codex/rum-cloud-preview` 只发布预览。绑定对照以 `config/rum.cloud.json` 和验收记录为准：production 的 `RUM_DB` 指向生产库、`RUM_ENVIRONMENT=production`；preview 指向预览库、`RUM_ENVIRONMENT=preview`。运行时变量修改不会把已有生产部署替换为新代码，本轮检查生产部署号和编译端点前后不变。

两个环境的 `PUBLIC_WEB_VITALS_ENDPOINT` 均保持空（未设置亦为空），所以自然访问不自动上报。云端合成请求只向**验收部署专属的预览 URL**发送，不向生产域名发送。`public/_routes.json` 与构建产物均仅 include `/api/rum`；普通页面和静态资源由 Pages 静态层处理。发布前核对 Git 规则：若该分支被配置为生产分支或工作流触发生产部署，应停止推送和发布。

额外验收命令（均为显式 opt-in）：

```sh
npm run verify
VITALS_HTTP_E2E=1 node --test tests/web-vitals*.test.ts
RUM_D1_E2E=1 node --test tests/rum-d1-local.test.ts
# 仅接受已发布的八位部署 ID 专属 pages.dev URL，不接受生产或分支别名。
RUM_CLOUD_E2E=1 RUM_PREVIEW_URL=https://DEPLOY_ID.feliz-blog.pages.dev \
  node --test tests/rum-cloud-preview.test.ts
```

应用回滚：停止该预览分支的后续发布，保留空采集端点；将应用文件恢复为发布前版本，只重新发布预览。生产在本轮未发布，不需要生产回滚。**不删 D1、不 drop 表、不反向执行迁移、不清空已存数据；保留数据库绑定、管理身份、合成标记和全部 revision/conflict**。本地 `ROLLBACK.sh` 只在明确副本目录恢复文件，验证 D1 文件哈希不变；不能当作删库或云端迁移回退工具。

下一轮开启生产采集的最少操作：单独授权合并/生产发布已验收代码；核对生产接收函数绑定与数据库身份，再单独将生产构建变量 `PUBLIC_WEB_VITALS_ENDPOINT=/api/rum` 并重建；验证一次真实移动访问的实际写入/读回及完整链路（不将本轮预览合成数据迁入生产）。每日清理自动化另行确认。自然样本充足前页面性能仍为“尚无结论”，预览合成 p75 不作为真实用户表现。

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

真实 D1 验收：`RUM_D1_E2E=1 node --test tests/rum-d1-local.test.ts`（Node 24.21.0），包含未迁移库 503、初始/迟到/乱序/重复、身份与同版本冲突、缺失/真实零、窗口边界、分页导出、持久化重启与级联清理/环境隔离。门禁默认跳过该本地运行时测试，以便无 Wrangler/loopback 环境仍执行静态类型和全部纯回归；发布前需显式完成该额外验收。
