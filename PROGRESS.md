# 进度跟踪

> 每完成一项打勾并附一行说明（改了什么、测试结果）。会话恢复时从未完成项无缝续作。

## 文档
- [x] IDENTITY.md 已生成
- [x] TASK.md 已归档指令书
- [x] DECISIONS.md 已初始化（D001-D012）
- [x] PROGRESS.md 已初始化

## M1 工程脚手架
- [ ] pnpm workspace + 目录骨架
- [ ] apps/web：Vite+React+TS+Tailwind+shadcn/ui
- [ ] apps/server：Hono+tRPC+Drizzle
- [ ] packages/shared：zod 契约占位
- [ ] docker-compose.yml（app/mysql/redis）
- [ ] .env.example 完整
- [ ] ESLint+Prettier 配置
- [ ] npm run dev 一键起前后端
- [ ] tRPC 健康检查路由 /health 返回 200
- [ ] 完成判定：npm run build 通过

## M2 数据库与迁移
- [ ] schema.ts（8 张表 SQLite 兼容）
- [ ] 迁移脚本可重复执行
- [ ] seed 演示用户与示例文档
- [ ] 完成判定：seed 后 API 能查到

## M3 认证
- [ ] auth.sendCode / auth.verifyCode 路由
- [ ] 验证码 TTL（Redis 或 Memory）
- [ ] JWT + cookie 会话中间件
- [ ] 无 SMTP 时验证码打日志
- [ ] Playwright e2e：登录→刷新保持→登出

## M4 文档与卡片组 CRUD
- [ ] documents.create/list/get/delete 路由
- [ ] cardSets.create/rename/delete 路由
- [ ] 工作台页面（列表/新建/重命名/删除）
- [ ] 契约测试覆盖全部路由

## M5 生成管线
- [ ] LLMProvider 抽象 + deepseek/kimi/mock 三实现
- [ ] generateCards 降级链 + 溯源硬闸门
- [ ] 长文本分块归并
- [ ] generation.createJob + watch SSE
- [ ] 失败配额自动返还
- [ ] 单测：schema/溯源/降级链/分块
- [ ] e2e：createJob→watch→入库

## M6 生成前端
- [ ] 文本输入（字数+100k 提示）
- [ ] 三形态切换
- [ ] SSE 分步进度动画
- [ ] 卡片网格 100ms 入场
- [ ] 点击翻转
- [ ] 卡片编辑保存
- [ ] e2e：粘贴→生成→翻转→编辑→保存→刷新仍在

## M7 SM-2 引擎
- [ ] scheduler.ts 落地
- [ ] 单测分支覆盖 100%
- [ ] 30 天连续复习模拟脚本

## M8 复习页（桌面）
- [ ] 今日队列
- [ ] 三档评分按钮
- [ ] 进度条 + 总结 + 再来一组
- [ ] e2e：评分后 dueAt 更新/日志写入/队列减一

## M9 统计与曲线
- [ ] review.stats 路由
- [ ] 保持率/连续天数/待复习数/30 天热力
- [ ] 对账测试

## M10 排版引擎
- [ ] layout-engine.ts 落地
- [ ] 单测覆盖率 ≥95%
- [ ] 20 组真实卡片零静默截断

## M11 打印页
- [ ] 密度切换 + 迷你网格图标
- [ ] A4 实时预览
- [ ] 溢出警告 UI（红框+建议按钮）
- [ ] @page A4 样式
- [ ] e2e 打印预览无裁剪

## M12 PDF 导出
- [ ] playwright-core worker
- [ ] 异步任务 + 下载链接
- [ ] 10 次/天限流
- [ ] PDF 与浏览器打印一致

## M13 PWA 与移动复习
- [ ] vite-plugin-pwa + SW 预缓存
- [ ] IndexedDB 离线卡片包
- [ ] 手势/按钮评分
- [ ] 离线暂存 + 联网幂等同步
- [ ] e2e 断网复习 + Lighthouse

## M14 对话式配置
- [ ] updateCardConfig 工具
- [ ] SSE 打字机回复
- [ ] 配置面板联动高亮
- [ ] 3 条预设问题按钮
- [ ] 20 条意图识别 ≥90%

## M15 落地页
- [ ] 青绿→蓝渐变 Hero
- [ ] 艾宾浩斯 SVG 滚动描边
- [ ] "8 小时 vs 5 分钟"对比
- [ ] CTA 进入登录/工作台
- [ ] LCP ≤ 2.5s

## M16 分享克隆
- [ ] 生成 share_token 只读链接
- [ ] 预览页
- [ ] 一键克隆（复习状态独立）
- [ ] e2e 克隆后状态互不影响

## M17 工程化收尾
- [ ] Dockerfile 多阶段
- [ ] docker compose up 一键起
- [ ] README 完整
- [ ] PROGRESS.md/DECISIONS.md 归档

## 全量验收 DoD
- [ ] npm run build + docker compose up 一次成功
- [ ] 单测/契约/e2e 六链路全绿
- [ ] mock 模式完整链路走通
- [ ] SM-2 30 天模拟 + 排版 20 组卡片
- [ ] 配额限流生效 + 失败返还
- [ ] 性能基线达标
- [ ] README/PROGRESS/DECISIONS 完整
- [ ] 无假功能
