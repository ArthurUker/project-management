# SUP-03 交接（待独立审阅）

- 关联：RP04 / RP08（LR4-04 / B20），模式 REVIEW_ONLY。
- 范围：阶段读取 / 软删写入 / 直接客户端 / 历史合同范围定向核对（只读）。
- 核心结论：
  1. 普通 API 阶段列表未过滤 deletedAt（projects.js:820、phases.js:39/94），与 milestones（projects.js:808 已过滤）不一致 → 读取侧软删泄漏（CURRENT_IMPLEMENTATION，CONTRACT_UNRESOLVED）。
  2. 软删**写仅经同步 push（project_phases.delete 授权）可达**；phases.js 无 DELETE 路由。
  3. 同步侧软删处理正确（aliveFilter / tombstones）。
  4. 恢复无 API 可达路径 → CONTRACT_UNRESOLVED。
  5. 前端 projects.ts:39 直接消费泄漏列表，未见去重。
- 未改动任何代码；交付 phase-read-contract.md / scope-assessment.md / next-action.md / coverage.csv / evidence/ 及 7 类结构。
- 发布保持 NOT_EVALUATED，交由独立审阅与产品决策。
