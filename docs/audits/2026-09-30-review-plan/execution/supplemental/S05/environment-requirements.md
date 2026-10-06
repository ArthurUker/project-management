# S05 目标环境需求

所有项目当前均为 `PLANNED_NOT_RUN`。不得用真实业务数据、真实 `.env`、生产主机或现有固定夹具库代替隔离资源。

|场景|所需材料/环境|隔离与安全边界|产出/解除条件|
|---|---|---|---|
|D01 Linux 两轮快照|目标发行版/文件系统、cp/rsync 版本、临时 uploads 源和输出目录|虚构小文件；明确首/次快照目录；不可映射生产备份目录|命令、退出码、两轮 manifest/hash，证明首份字节保持|
|R12-N01 配对恢复|Disposable PostgreSQL、合成 DB schema/data、对应临时 uploads 目录；调度写屏障/快照说明|仅合成 attachment metadata 与二进制；清理实例由执行者拥有|runId、dump/file manifest、恢复后引用/大小/hash 核对|
|B13 restore|单次 disposable DB 快照与合成唯一/FK冲突夹具|无复用历史停机固定 DB；执行前/后快照|接口响应与实际受影响行计数、提交后 DB 对账|
|D02 候选门禁|固定 candidate commit/build ID、临时 DB、能在 migration 前注入候选合同失败的主机|禁止连接生产 DB；验证 current 指针和现服务不变|候选错误阻断日志、current/build identity|
|D03 配置|从 schema 生成的脱敏变量集；临时服务/本地域名|不读取真实 `.env`；无公开网络暴露|preflight 有效变量与应用 headers/行为对照|
|手动回滚|受控 runbook、两个兼容 release、临时服务、迁移兼容说明|不切换真实服务；负责人和终止条件预先记录|回滚前后 commit/build、health/readiness/smoke 与失败状态|

每场景须在启动前记录唯一问题、所有权、command、预期信号和清理步骤；没有环境就保持 OPEN，不可宣称通过。
