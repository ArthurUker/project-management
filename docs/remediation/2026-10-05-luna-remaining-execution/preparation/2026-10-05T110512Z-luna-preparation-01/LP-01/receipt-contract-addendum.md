# T-RP-02 / T-RP-07 回执合同补遗（待批准）

## 当前事实与失败分类

HTTP MutationReceipt 与同步 SyncMutation 是不同通道。HTTP已有作用域/hash/事务，不证明sync具备同等保护。目标只讨论每条命令的一致提交，不承诺整个batch原子回滚。

- FP-06：较早item业务和receipt可持久；后来receipt写失败时，该item业务也可能已持久但receipt缺失；后续项未处理；客户端整个outbox仍保留。重试必须逐key/hash恢复。
- FP-07：所有item业务及receipt已持久，随后lastPushAt失败而返回500。此时不能声称数据整体回滚。当前聚合best-effort audit插入失败和lastPushAt未捕获错误要分别判断。
- FP-08：receipt提交、响应丢失。服务端结果可能已提交；客户端保留原outbox，以原key/hash查询或重放，不能换key盲重做。

## 签署前字段

选定唯一键范围、actor/device/resource/command/entity/op/id/hash版本、规范化hash、旧client缺hash兼容截止、查询授权/查无、unknown/expired响应、retention/max offline window、清理责任人与频率、partial batch应答与兼容切换。24h、OPT-A、一个发版周期仍是建议，未批准。

## 不可接受为安全回退的路径

C草案中关闭flag后返回“业务写与回执分开upsert”的旧路径会恢复B06已证问题，不是已验证安全回退。只可由负责人选择不会重新打开孤儿写/跨actor回放的精确安全兼容或停止受影响写入并保全原副本方案；本run不决定、不演练。

## Delete范围

若实际修改delete/tombstone/restore调用链或共享helper影响这些语义，T-RP-07/D-S01-08/S03-OI-05按真实scope适用。任务命名不能规避门禁。

动态验收NOT_RUN；B06仍SUPPORTED，T-RP-02/T-RP-07仍PROPOSED。
