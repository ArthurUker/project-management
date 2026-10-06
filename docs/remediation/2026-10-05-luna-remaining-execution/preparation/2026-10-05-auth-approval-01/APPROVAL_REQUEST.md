# T-RP-09：下一组认证修复裁定

**推荐：T-RP-09-STRICT-LINEAGE-V1；当前 PROPOSED，签名未填。**

## 需要批准的具体取舍

- 同一个 refresh **只允许一个赢家**；旧 token 消费、同 family successor 和必需审计同事务。拒绝旧 token 的并发败者，保留赢家会话，不因竞争自动吊销整个 family。
- 请求、刷新、用户资料、退出都绑定发起身份/登录代际；迟到 A 不能覆盖或清除 B，更不能带 B 凭据重发 A 请求。同一人重新登录也算新代际。
- 401/403/网络失败分开；旧重放失败不能清新 token。真正无效且仍归属当前登录的 refresh 才清理。
- 有安全能力时用 Web Locks 和单一会话信封；缺能力时使用隔离内存会话，停用共享 token 写入、静默刷新及自动重放，过期后显式登录。
- **恢复和兼容取舍**：刷新已提交但回包丢失、候选升级遇旧两键会话时，可能需要重新登录；任何情况都不删除 IDB/outbox/未发送内容。
- 保留 Bearer/body 传输和现有 TTL；不新增迁移；不同时批准 access JWT 即时撤销、盗用检测、缓存/IDB 或回执规则。当前只申请仓库候选的本地实现与合成验证，真实旧版本/浏览器/目标环境另验。

完整条款、残留风险和不授权范围见 [decision-proposal.json](decision-proposal.json)。

## 批准后直接串行执行

1. RP02-T02：服务端原子单次消费、family 继承、故障回滚、真实 TTL 回归。
2. RP03-T01：跨标签页协调、身份代际、迟到成功/失败/资料/退出以及原请求重放围栏。

RP02 客户端联合验收依赖 RP03-T01，不能误当实施阻碍。RP03 的 S02-OPEN-05 是真实双 tab 验收门禁，未运行就保持未验收。

## 需要该批准的依据

原 EXECUTOR_PROMPT 第六节和 LUNA_IMPLEMENTATION_PROMPT 要求 PROPOSED/PENDING 不能当批准；TASK_GRAPH 为上述两个任务设置 **T-RP-09 / IMPLEMENTATION / always**。上轮郭仁康的批准只覆盖 T-RP-05 和 D-S01-07。本地执行授权已具备，不需要重复申请。

可回复：**“批准 T-RP-09 推荐方案 T-RP-09-STRICT-LINEAGE-V1（含重新登录及能力不足降级的取舍），批准人：郭仁康，职责：研发副总监。”**
