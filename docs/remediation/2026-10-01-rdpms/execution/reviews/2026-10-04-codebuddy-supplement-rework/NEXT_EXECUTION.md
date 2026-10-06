# 下一轮最小范围

本文件是独立建议，编写不启动执行、不批准业务政策。须由下一轮用户限定指令授权后执行。

## 保留已通过项

- 两个当前正式套件真实22/22、12/12及四原语/恢复submit证据保留。
- SUP-02本地四case和101行字段表接受；不再改其正式测试或字段表。
- SUP-03指定入口、真实客户端/B20范围/UI NOT_RUN/政策未决主体保留。

## 固定剩余清单

1. **报告正式测试一个文件**：完整业务键或id+payload匹配；draft upsert create/update形状；三个旧legacy/modern/sync草稿竞争的try/finally、timer cleanup、pending settle。保留原22条业务断言，补精准控制后跑完整报告套件。
2. **新session runner**：主执行TimeoutExpired/spawn异常必须记录且非零；结果写盘失败也非零。保留drop/stop/failed-build清理控制和正常隔离；只复制新runner，不改冻结旧runner。失败控制可安全模拟，明确层次。
3. **新订正封存**：唯一新version/session ID；引用本轮旧重复ID的明确entry位置/session；排除history自身/交叉摘要或标明旧阶段快照；逐文件真实hash读回。保持旧session/entries冻结，不覆写历史“让它通过”。
4. **两句静态文档勘误**：单项目404与无projectId全局manager/member/elevated列表分开；不再称全部resolveProjectAccess/404。新errata，不修改阶段/项目代码，不重开B20。

## 边界

下一轮现有代码写入只能为报告正式测试；新证据/runner/文档在唯一新session。必要六个记录文件仅独立continuation/追加handoff/history订正引用，原54/306轴/批准/门禁不变。

业务src、frontend、sync正式测试、helper/guard/schema/依赖、其他STANDARD任务只读。不得阶段过滤、恢复、权限扩展或政策批准。业务失败仅留证据。

报告测试变更后完整rp10真实自有库复跑及build/typecheck/lint:undefined/diff；rp08保持本轮真实证据和hash，只在源码/测试发生可解释变化时重新登记必要验证，不能扩大修改范围。

没有新增业务实施就绪项。完成上述余项后停止独立审阅，不把36个剩余任务自动激活。
