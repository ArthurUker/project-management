# RP10-T02 — 同修订 report snapshot/version

submit 命令在事务内对 reports 行 `FOR UPDATE`，随后从事务客户端重读最新行；版本快照取该锁定修订正文，版本号及 `currentVersion`、SUBMITTED 状态和审计/回执由原事务提交。保留已审阅拒绝与当前非REVIEWED复提语义；未更改D-S01-07政策，未实施其他任务 CAS。

真实自有PostgreSQL用例交错：另一事务先更新正文并持锁，提交请求读取旧 preflight 后等待行锁，更新提交后，submit同事务重读并快照新正文；再并发五个不同幂等键验证版本1..5唯一且currentVersion=5。
