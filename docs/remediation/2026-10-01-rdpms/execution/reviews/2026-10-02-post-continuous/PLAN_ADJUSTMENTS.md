# 修复规划 v2 — 连续执行后调整

仍为20包/54任务，不重新制定架构。当前整改顺序：

1. **RP10-T02返工（LR2-01/03，优先）**：清点saveReportDraft所有HTTP/sync调用者；将可编辑状态与写入原子绑定，或在一致行锁后读取并检查。现代CAS保留、旧兼容仅现有可编辑状态、合法同key回放保留。双方向确定性save/submit竞争核对响应、行、版本、audit/receipt；sync同一共享保护。不同key并发版本测试继续执行。不要改变submit/resubmit政策。AC-B10-01写正确场景；AC-B10-02等待D-S01-07，不能复用版本测试PASS。
2. **RP04-T02返工（LR2-02）**：顶层name/type/subtype/positioning/引用/isDraft/date先做scalar检查再normalize；metadata维持JSON合同；嵌套task与milestone负例保留。空值和允许的日期标量按已有实际调用边界登记，不发明日期/经理业务规则。每种无效输入400并核对sequence、聚合、audit、receipt不增。复验所有故障注入和同key回放；PC03联合仍NOT_RUN。
3. **RP02-T01补验（LR2-04）**：真实DB/JWT证明合法成功；确定性disable与login两方向屏障；ACTIVE/PENDING/LOCKED/DISABLED锁内正确/错误密码、到期恢复、响应/用户/refresh/audit一致。无新失败证据先只补测试，不能顺带改refresh/family/权限等级或激活策略。必须记录操作线性化点，不能要求任意提交次序均拒绝已完成合法登录。
4. **RP08-T01补验（LR2-04）**：让真实VIEWER和SUPER_ADMIN/elevated夹具实际执行；成员/非成员/零权限、reports ownOnly、全部实体与字段正负对照。目标字段以当前普通API批准合同为基准；明确真实JWT与注入actor覆盖。旧缓存清理/回填仍RP08-T02联合工作。无证据时只补测试。
5. **记录同步（LR2-05）**：逐case原ID、完整/局部/未运行分开；旧run不改，引用本次裁定。finding事实SUPPORTED与当前实现/局部验收/发布分开；解除普通本地授权的重复请求，继续按现有连续授权选STANDARD并登记新scope。

## 不扩大门禁

两项返工及两项补验使用原任务授权，未要求新的产品规则。RP10-T02的D-S01-07 condition=false、RP09-T01只限制联合验收；RP04-T02不触发D-S01-06。其余技术/业务决定仍PENDING/PROPOSED，不能代签。

## 解锁后续合同的准备

负责人应审阅可选方案、风险、兼容窗和具体参数，再提供具名批准。T-RP-02优先解锁receipt合同；T-RP-09/T-RP-12解锁认证跨身份与owner保全；T-RP-03依赖支持客户端实证；T-RP-04/T-RP-10需要批准watermark/epoch和应用生产者证据；目标数据/FS/runbook均用真实材料。技术scope标题不等于可直接批准的参数化实施方案；先补已有草案必要缺项，不能由执行者批准。

## 验收和交付

每项新run追加scope/authorization、change-summary、acceptance逐case、evidence、rollback、task-state、handoff。使用新自有资源；合法成功先行；失败反例不能当修复PASS；只允许当前源码下的完整适用验收关闭本任务。所有release保持NOT_EVALUATED。
