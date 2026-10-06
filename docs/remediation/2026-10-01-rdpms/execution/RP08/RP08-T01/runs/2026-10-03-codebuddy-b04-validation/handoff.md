# RP08-T01 补验 handoff — 2026-10-03

## 完成内容

- 真实夹具补齐：OWNER 成员、VIEWER 成员、非成员、零权限成员、SUPER_ADMIN（非成员）全部实际调用 `/api/sync/init`。
- 4 个新用例：逐权限门禁（6 个 readPermission × 7 实体）、字段投影（每实体键集合 + 禁止字段）、角色范围矩阵（member/viewer/outsider/zero/superAdmin 的 `acl.projectIds`、`acl.permissions`、`aclVersion` 与逐实体可见性）、elevated own-only。
- 套件 5/5 通过（attempt-01 因合成用户名违反小写约束失败；attempt-02 因两处测试期望错误失败：tasks.readFields 含 `startDate`、own-only 需按身份自己的报告集合断言；均已修正，三份日志保留）。
- 业务代码未改。

## 限制

- 身份为注入可信 actor（真实 DB 合成用户行），**不是**完整 JWT 链证据。
- 同步读路径不写 elevated 审计（属在线读端点）；只断言可观察可见性。
- 实体权限缓存清理与历史回填仍属 RP08-T02（T-RP-04 / T-RP-12 未批准）。
- D-S01-05 condition=false（未请求注册类项目全局例外），未记 PASS。
- 前端 IndexedDB 未运行；release NOT_EVALUATED；未提交、未部署。

## 遗留

- B04 仍 SUPPORTED / 未在目标环境验收；AC-B04-02 与 PAC-RP08-02/03/04 保持 NOT_RUN。
- B04 的缓存撤销与回填必须在 RP08-T02 与 T-RP-04/T-RP-12 批准后一起验收。

## 下一就绪任务

本轮四项已全部交付；下一步为 LR2-05 台账一致性同步（ACCEPTANCE_MATRIX / IMPLEMENTATION_STATE / 两级 handoff / all54 统计）与统一汇报。
