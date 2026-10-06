# 最小下一步建议（SUP-03，仅建议，不实施）

> 本轮为 REVIEW_ONLY，未做任何代码改动。以下为面向独立审阅 / 产品决策的最小建议。

1. **阶段读取是否过滤 deletedAt（决策门）**
   - 现状：普通 API 阶段列表未过滤 deletedAt（projects.js:820、phases.js:39），与 milestones（projects.js:808 已过滤）不一致。
   - 建议：由产品/安全明确"阶段读取应排除软删行"是否成立；若成立，应作为统一模式在 phases 读取入口补齐 `deletedAt: null`，并与 milestones 保持一致。
   - 本轮未实施：不在 projects.js 添加过滤。

2. **阶段软删恢复是否应 API 可达（决策门）**
   - 现状：软删仅经同步 push 可达；恢复无 API 路径（phases.js 无恢复端点，同步 upsert 不清除 deletedAt）。
   - 建议：明确是否需要"取消软删"能力；若需要，定义经授权的恢复端点或同步 push 语义，并补齐审计。
   - 本轮未实施：不生成业务 patch。

3. **前端对软删阶段的去重（决策门）**
   - 现状：projects.ts:39 直接使用后端列表，未见 deletedAt 去重。
   - 建议：若后端保持返回软删行，前端应据 deletedAt 过滤；否则随后端修复自动收敛。待第 1 项决策后定。
   - 本轮未实施：不改前端。

4. **合同登记**
   - 建议将"阶段读取过滤"与"阶段恢复可达性"两条写入正式合同/验收矩阵；当前为 CONTRACT_UNRESOLVED，待权威来源确认后再关闭。

所有建议均不扩大本轮 TEST_ONLY / REVIEW_ONLY 授权范围。
