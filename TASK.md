# 考途速记 · AI 开发任务指令书（归档）

> 本文件为唯一需求源，自包含产品定义、技术决策、数据模型、核心算法参考实现、工作清单、验收标准。会话中断后恢复时无需重读原指令书，直接读本文件即可。

---

## 一、产品定义

**一句话**：用户粘贴教材文本，AI 产出可信（可溯源原文）、可复习（按遗忘规律调度）、可打印（A4 多等分）的记忆卡片。

**用户**：大学生、职业资格证考生、语言考试考生。

### 功能清单

| # | 功能 | 要点 |
|---|------|------|
| F1 | AI 卡片生成 | 粘贴文本 → 队列异步生成 → SSE 分步进度（分析/抽取/生成）→ 三种卡片形态：问答式（点击翻转）、填空式（___ 隐去关键术语）、导图式（├─ └─ 树状文本）。每张卡片带 sourceQuote 溯源句 |
| F2 | A4 多等分打印 | 4/8/16/32 等分实时切换预览，密度按钮带迷你网格图标；排版引擎容量感知：字号自动缩放到可读下限，仍溢出则显式警告并建议降密度，绝不静默截断；浏览器打印（@page A4）+ 服务端 PDF 导出 |
| F3 | 间隔重复复习 | SM-2 改良引擎：新卡走 1/2/4/7/15 天阶梯，毕业后 EF 动态调度；今日到期队列；三档评分（不认识=1/模糊=3/已掌握=5）；艾宾浩斯曲线区展示用户真实统计数据 |
| F4 | 移动复习 | PWA：Service Worker 预缓存 + IndexedDB 离线卡片包；手势/按钮滑动评分；断网可复习、评分本地暂存、联网自动同步（幂等去重） |
| F5 | 对话式配置 | Function Calling：自然语言改配置（卡片类型/难度/密度/数量），SSE 打字机流式回复，配置面板联动高亮；无法解析的指令不污染配置 |
| F6 | 卡片包 | 卡片组管理（重命名/编辑卡片/删除）；一键克隆分享链接（只读快照，克隆后复习状态独立初始化） |

### 页面清单
落地页、登录页、工作台、生成页、复习页、打印页、设置页。

### 配额
- 免费用户：20 次生成/月、10 次 PDF 导出/天
- 超限返回 429 + 友好提示

---

## 二、技术栈（已定，禁止变更）

| 层 | 决策 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui；PWA（vite-plugin-pwa） |
| 后端 | Node 20 + Hono + tRPC + Drizzle ORM；前后端共享 zod 契约 |
| 数据库 | MySQL 8（生产）/ SQLite（无 Docker 环境降级）；Redis（队列/限流/验证码 TTL），无 Redis 时进程内 Map 降级 |
| LLM | OpenAI 兼容协议双 Provider：DeepSeek（`https://api.deepseek.com`，模型 deepseek-v4-flash）为主，Moonshot Kimi（`https://api.moonshot.cn/v1`，模型 kimi-k2.6`）为兜底；MockProvider 开发降级 |
| PDF | worker 进程内 playwright-core + 无头 Chromium，渲染与浏览器打印同一 HTML 模板 |
| 测试 | Vitest（单元/契约）、Playwright（e2e）、k6 或 autocannon（压测，可选） |
| 部署 | Dockerfile + docker-compose.yml（app / mysql / redis 三服务），.env.example 完整 |

### 环境变量
`DEEPSEEK_API_KEY`、`MOONSHOT_API_KEY`、`LLM_PROVIDER`（deepseek/mock）、`DATABASE_URL`、`REDIS_URL`、`SMTP_*`（可选）、`APP_PORT`

---

## 三、数据模型（Drizzle 迁移，生产口径 MySQL 8）

详见 `src/server/db/schema.ts`。表：users / login_codes / source_documents / card_sets / cards / review_states / review_logs / generation_jobs。无 Docker 时使用 SQLite 等价 schema（类型映射：BIGINT→INTEGER、JSON→TEXT、ENUM→TEXT+check）。

---

## 四、核心契约与参考实现（必须采用）

### 4.1 卡片契约
- `src/shared/contracts/card.ts`：CardSchema + CardBatchSchema + SYSTEM_PROMPT
- 溯源硬闸门：`normText.includes(sourceQuote)`，不通过的卡片直接丢弃

### 4.2 生成管线
- `src/server/ai/generate.ts`：LLMProvider 抽象 + OpenAI 兼容实现 + mockProvider + generateCards 降级链
- 长文本规则：> 12k tokens 按 \n\n 语义边界切块（重叠 200 字），块数上限 20，单文档字符上限 100k
- 失败任务配额自动返还

### 4.3 SM-2 调度器
- `src/server/srs/scheduler.ts`：NEW_CARD_STEPS=[1,2,4,7,15]、INITIAL_EF=2.5、MIN_EF=1.3
- 分支覆盖 100%

### 4.4 A4 排版引擎
- `src/shared/print/layout-engine.ts`：纯函数，前后端共用，覆盖率 ≥ 95%
- 全局字号二分 + 溢出标记 + 降密度建议 + 多页警告

### 4.5 对话式配置工具
- `updateCardConfig` Function Calling 工具，参数与前端配置状态同构
- 链路：用户消息 → LLM 决策 → 服务端持久化 → SSE 流式 → 前端高亮

---

## 五、API 路由表（tRPC）

| 路由 | 类型 | 说明 | 限流 |
|------|------|------|------|
| auth.sendCode / auth.verifyCode | mutation | 邮箱验证码登录 | 1 次/分/邮箱 |
| documents.create/list/get/delete | mutation/query | 文本入库 | ≤100k 字符 |
| generation.createJob | mutation | 生成任务入队 | 免费 20 次/月 |
| generation.watch | subscription | SSE 进度 | — |
| cards.listBySet/update/delete | query/mutation | 卡片编辑 | — |
| cardSets.create/rename/share/clone | mutation | 卡片组管理 | — |
| review.todayQueue | query | 今日队列 ≤50 | — |
| review.submitGrade | mutation | 评分+SM-2+日志 | client_event_id 幂等 |
| review.stats | query | 保持率/连续/待复习 | — |
| print.layout | query | LayoutResult | — |
| print.exportPdf | mutation | 异步 PDF | 10 次/天 |
| config.chat | subscription | 对话配置 | 60 条/天 |

---

## 六、连续工作清单（M1-M17）

每项的"完成判定"必须通过才进入下一项；失败立即修复。全程更新 PROGRESS.md。

- **M1 工程脚手架**：Vite+React+TS+Tailwind+shadcn/ui 前端；Hono+tRPC+Drizzle 后端；docker-compose；.env.example；ESLint+Prettier；npm run dev 一键起前后端。
  判定：npm run build 通过、前端空白页可访问、tRPC 健康检查路由返回 200。
- **M2 数据库与迁移**：按第四部分建表（无 Docker 用 SQLite）；seed 演示用户与示例文档。
  判定：迁移可重复执行；seed 后 API 能查到。
- **M3 认证**：邮箱 OTP 登录/登出/会话中间件；无 SMTP 时验证码打日志。
  判定：Playwright 走通输邮箱→读日志→登录→刷新保持→登出。
- **M4 文档与卡片组 CRUD**：documents/cardSets 路由 + 工作台页面。
  判定：契约测试全覆盖；页面走通增删改查。
- **M5 生成管线**：5.1/5.2 落地；三 Provider；队列+SSE+配额返还；长文本分块。
  判定：单测覆盖（schema/溯源/降级链/分块）；mock 下 createJob→watch→入库 e2e 通过。
- **M6 生成前端**：文本输入（字数+100k 提示）、三形态切换、SSE 进度动画、网格（100ms 入场）、点击翻转、卡片编辑保存。
  判定：e2e 粘贴→生成→翻转→编辑→保存→刷新仍在。
- **M7 SM-2 引擎**：5.3 落地 + 单测分支 100%。
  判定：30 天连续模拟脚本断言全过。
- **M8 复习页（桌面）**：今日队列、三档评分、进度条、总结、再来一组。
  判定：e2e 评分后 dueAt 更新、日志写入、队列减一。
- **M9 统计与曲线**：review.stats 驱动保持率/连续/待复习/30 天热力。
  判定：评分后统计实时变化，与日志表对账一致。
- **M10 排版引擎**：5.4 落地 + 单测覆盖率 ≥95%。
  判定：20 组真实长度卡片四种密度零静默截断。
- **M11 打印页**：密度切换、A4 实时预览、溢出警告 UI、@page、仅打印卡片区域。
  判定：Chrome/Edge 打印预览无裁剪；溢出场景行为正确。
- **M12 PDF 导出**：worker + playwright-core 同模板；异步下载链接；10 次/天限流。
  判定：PDF 与浏览器打印逐格一致；超限 429。
- **M13 PWA 与移动复习**：SW 预缓存、IndexedDB 离线包、手势/按钮评分、离线暂存、联网幂等同步。
  判定：e2e 断网完成整组复习、恢复后同步无重复；Lighthouse PWA 通过。
- **M14 对话式配置**：5.5 落地；SSE 打字机；配置面板联动高亮；3 条预设问题按钮。
  判定：20 条自由表述意图识别 ≥90%；错误指令不污染配置。
- **M15 落地页**：青绿→蓝渐变（#0d9488→#0284c7）、Hero、艾宾浩斯 SVG（滚动描边）、"8 小时 vs 5 分钟"对比区；CTA 进入。
  判定：Lighthouse LCP ≤ 2.5s（4G 节流）。
- **M16 分享克隆**：卡片组只读分享链接；他人可预览+克隆。
  判定：e2e 克隆后两套复习状态独立；未登录可见只读。
- **M17 工程化收尾**：Dockerfile 多阶段；docker compose up 一键起；README（架构/启动/环境变量/降级）；PROGRESS.md/DECISIONS.md 归档。
  判定：干净环境按 README 可跑通全流程。

---

## 七、质量基线

| 层 | 硬指标 |
|------|------|
| 单元测试 | SM-2 分支覆盖 100%；排版引擎 ≥95%；生成管线核心路径 ≥90% |
| 契约测试 | 第六部分全部路由 |
| e2e（Playwright） | 登录、生成、复习评分、打印溢出治理、对话配置、分享克隆 |
| 性能 | 复习 p95 ≤200ms（200 并发）；生成 p95 ≤30s；PDF p95 ≤15s；落地页 LCP ≤2.5s |
| 代码 | 零 any、零 console.error 存量、零 TODO |
| 真实模型基准（有 key 时） | 100 条样本各 25 条：schema ≥98%、可溯源 ≥95%、成本 ≤¥0.01；写入 BENCHMARK.md |

---

## 八、全量验收标准（Definition of Done）

1. `npm run build` 与 `docker compose up --build` 均一次成功，干净环境可复现
2. 第八部分全部测试绿灯：单测、契约、e2e 六链路、PWA 离线
3. mock 模式下完整走通：注册登录→粘贴→生成三形态→编辑→复习评分→统计变化→四种密度打印预览→PDF 导出→分享克隆→对话配置
4. SM-2 30 天模拟脚本断言全过；排版引擎 20 组真实卡片零静默截断
5. 配额与限流生效（生成 20/月、PDF 10/天、接口限流），失败任务配额自动返还
6. 性能基线达标
7. README 完整；PROGRESS.md 全部打勾；DECISIONS.md 记录全部自主决策
8. 无任何形式的假功能：所有按钮、链接、流程均已接线；mock 仅存在于 Provider 层且默认关闭
