# 窗口F：T-RP-04/T-RP-12水位与缓存保全待批准材料

先读COMMON_RULES和清单。唯一可写：`S/window-f-cache/`。模式PREPARATION_ONLY，不实施publisher/ACL/IDB迁移/缓存删除/epoch。

## 必读范围

T-RP-04、T-RP-12及引用的T-RP-10状态；PC05/PC12、RP08-T02卡及关联验收/门禁；RP13-T02已交付WATERMARK_ADR_DRAFT、2026-10-02-continuous-rework的barrier-summary和原始运行证据。
定向只读当前pull/init cursor、ACL投影和前端缓存/outbox/recovery接口。不得把MAX(seq)/数据库sequence分配顺序当提交可见性证明。

## 固定交付

1. watermark-options.md：复用现有barrier证据，逐选项明确source revision/commit visibility、publication顺序、snapshot分页切点、ACL重查、epoch/reset、cursor过期及局限。历史反例和局部候选证明分开，不选生产方案或补跑DB。
2. cache-recovery-matrix.csv：撤权/角色变化/回填/分页失败/旧cursor/outbox归属，以及conflict/dead-letter/unknown/oversize/quarantine保全、查看/导出/放弃的当前授权和最后副本边界；源码/旧证据/缺运行明确。
3. 两份decision-draft.json/.md分别针对T-RP-04、T-RP-12给可审查推荐方案、备选、兼容/迁移/回退/用户流程及所需批准；status=PROPOSED，签名null。
4. acceptance-draft.csv和approval-request.md：真实DB/IDB/多tab/非空授权/撤权后的具体未来验收，所需owner/环境/数据；本轮动态NOT_RUN，不复制本地barrier为safe-watermark验收。
5. interface-notes.md：与C的receipt/保留窗、D的generation、E的客户端兼容；缺跨包裁定列待汇总，不等待或改其它窗口。

T-RP-10恢复epoch仍未批准，阶段软删/删除政策未因本材料获准；RP13-T03不得激活。当前缺实际环境不阻止交付真实PROPOSED选项。
交付共同七类、WORKER_MANIFEST/READY，仅材料完成；不改root台账/其它窗口，不启动真正的cache清理、数据库或browser，冻结后停止。
