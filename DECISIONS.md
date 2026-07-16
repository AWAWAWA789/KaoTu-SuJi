# 自主决策记录

> 凡需求歧义、库版本、目录结构、命名等自行决定的事项，均追加到本文件。会话恢复时优先读取。

## D001 - 项目结构（Monorepo 单仓）
- **决策**：采用 pnpm workspace 单仓结构，packages/apps 双层
  - `apps/web`：Vite+React 前端
  - `apps/server`：Hono+tRPC 后端
  - `packages/shared`：zod 契约、SM-2 引擎、排版引擎（前后端共用）
- **理由**：shared 必须前后端共用（契约、SM-2、排版引擎均明确要求"前后端共用"），单仓避免发包同步成本
- **包管理器**：pnpm（workspace 友好、磁盘节省）

## D002 - 包管理器
- **决策**：pnpm
- **理由**：workspace 原生支持、幽灵依赖防护、磁盘节省；Node 20 已自带 npx

## D003 - 数据库降级策略
- **决策**：默认 SQLite（better-sqlite3，Node 20 原生支持），通过 `DATABASE_URL` 协议段切换
  - `file:./data/app.db` → SQLite
  - `mysql://...` → MySQL 8
- **理由**：开发环境无 Docker 时立即可用；Drizzle 同时支持两套 dialect；schema.ts 用 SQLite 兼容类型（INTEGER 替代 BIGINT、TEXT 替代 JSON/ENUM），生产 MySQL DDL 在迁移脚本中显式补齐 ENUM/CHECK

## D004 - Redis 降级策略
- **决策**：默认进程内 Map 实现（`src/server/infra/queue-memory.ts`），通过 `REDIS_URL` 是否存在自动切换
  - 存在 → ioredis
  - 不存在 → MemoryQueue（同接口：enqueue/dequeue/ack/peek/TTL）
- **理由**：队列、限流、验证码 TTL 三个用途统一抽象为 KVStore + Queue 接口

## D005 - LLM Provider 默认值
- **决策**：`LLM_PROVIDER=mock` 为默认值（开发模式零配置可跑）
- **理由**：指令书要求"mock 仅存在于 Provider 层且默认关闭"，但本地开发需要立即可用——折中：默认 mock，生产部署时由 .env 切换为 deepseek；README 明确说明 mock 仅供开发，生产必须切换

## D006 - 表结构 ENUM 处理
- **决策**：Drizzle schema 用 `text('type').notNull()` + zod enum 双层校验，SQLite 原生不支持 ENUM
- **理由**：跨 dialect 兼容；MySQL 迁移时另起 DDL 补充 ENUM 约束

## D007 - 会话机制
- **决策**：JWT + httpOnly cookie（不依赖服务端 session store，便于水平扩展）
- **理由**：无 Redis 也能工作；过期 7 天；刷新策略：剩余 <1 天自动续签

## D008 - 测试目录结构
- **决策**：与源码同目录的 `*.test.ts`（Vitest 默认）+ 顶层 `e2e/` 放 Playwright
- **理由**：单测紧邻源码便于维护；e2e 跨前后端单列

## D009 - Tailwind 配置
- **决策**：Tailwind v3（非 v4），因 shadcn/ui 当前生态稳定版基于 v3
- **理由**：避免 v4 alpha API 变动带来的不稳定

## D010 - playwright-core 安装
- **决策**：PDF worker 使用 playwright-core，需要手动安装 Chromium
  - 开发：`npx playwright install chromium`
  - Docker：多阶段构建中预装
- **理由**：playwright-core 不自动下浏览器，体积小；Chromium 是 PDF 渲染必须

## D011 - SSE 实现方式
- **决策**：Hono 原生 SSE helper（`streamSSE`），不走 tRPC subscription
- **理由**：tRPC subscription 需要 ws 适配器，SSE 更轻量且 HTTP/1.1 原生支持；进度推送单向，SSE 足够

## D012 - shadcn/ui 组件按需引入
- **决策**：手动复制 components.json 风格，按需 add 组件
- **理由**：避免一次性引入过多未使用组件
