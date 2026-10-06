# 下一轮接续范围

1. 完整读取本目录REVIEW.md、findings.json、validation-summary.json、task-readiness.json、PLAN_ADJUSTMENTS.md、handoff.md，尤其evidence/observations.json里的late-POST反例。
2. 按原EXECUTOR_PROMPT/v2图和任务卡读取RP10-T02、RP08-T01、关联验收原定义及CodeBuddy新run。旧run/旧审计冻结，不覆盖。
3. RP10-T02先返工：检查所有报告正文写入，不只检索saveReportDraft调用；新建无行竞态不得通过upsert更新竞争产生的已提交行。合法 create、新出现行冲突拒绝/受控处理、既有draft CAS、墓碑恢复、同key回放、PUT/sync、submit版本全覆盖。先证明合法创建/保存/提交，再反转独立反例，核对真实行/版本/audit/receipt。没有source-state新政策，D-S01-07 condition=false；RP09仅联合验收依赖。无业务迁移。
4. RP08-T01只补验：普通API七实体/字段授权来源映射和实际成对请求；SUPER_ADMIN本人报告非空正例及别人报告拒绝；适用墓碑先带权限可见再无权限拒绝；init/pull增量；记录同期user/project/field实际行。不启用注册全局例外或缓存撤权/历史回填/IDB新政策。没有新失败证据，不改业务实现。必要规则不明精确记NOT_RUN，不代签。
5. RP02业务实现无需返工；将本目录真实login updateMany前的停用屏障固化为正式测试（作为补验，不把用户状态读前屏障删掉），相关套件复验。无session/refresh家族政策变动。
6. 新唯一run逐任务交付authorization/change-summary/evidence/acceptance/rollback/task-state/handoff，再同步当前镜像和两份版本摘要；旧logs不动，source hash绑定当前worktree。局部证据不扩大为package或release验收。

此文件提供接续范围，没有启动上述修复。继续使用用户既有本地授权，保留不提交/部署/升级/生产访问/子代理/模型切换/代签等边界；实际执行前登记精确taskIds和允许文件。完成范围后独立复核。
