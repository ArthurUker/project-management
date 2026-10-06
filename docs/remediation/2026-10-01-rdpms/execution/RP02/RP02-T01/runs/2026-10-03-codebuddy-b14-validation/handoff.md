# RP02-T01 补验 handoff — 2026-10-03

## 完成内容

- 新增 4 个用例（业务代码未改）：disable 先提交的登录拒绝、登录条件写入先提交的合法更早成功、有效定时锁内正确密码、有效定时锁内错误密码；均核对 HTTP 状态/code、真实 users 行、refreshToken 计数与审计行。
- 确定性屏障用 ORM 调用级 gate（`user.findFirst` / `user.update` 暂停一次），不使用 sleep 猜顺序。
- 线性化点已记录于测试文件头与交付物：登录成功=条件 `updateMany` 提交；登录拒绝=入口状态读；停用=`PATCH /api/users/:id/status` 的 `user.update` 提交。停用不吊销既有 refreshToken（RP02-T02/T-RP-09 范围，已断言并注明归属）。
- 套件 11/11 通过（首次 attempt-01 因注入的管理员无真实用户导致审计外键失败，改为真实合成管理员后通过；两份日志均保留）。

## 限制

- 管理员为注入可信 actor（真实 DB 合成用户），非完整 JWT 链；未跑前端 IDB、目标环境、部署验收。
- release NOT_EVALUATED；未提交、未部署。
- 无新失败证据，因此本轮未改任何业务代码。

## 遗留

- B14 仍 SUPPORTED / 未在目标环境验收。
- B15、RP02-T02、PAC-RP02-02/03/04/05、T-RP-09 仍未批准/未运行。

## 下一就绪任务

RP08-T01 补验（LR2-04 / B04），随后做 LR2-05 台账一致性同步与统一交付。
