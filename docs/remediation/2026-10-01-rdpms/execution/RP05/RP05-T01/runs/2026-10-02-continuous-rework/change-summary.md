# RP05-T01 fixture correction — 2026-10-02

关联LR-06、既有B02/B19。只修改 `tests/integration/rp05-parent-delete-guard.integration.test.mjs` 的两个project PUT fixture，在tasks数组外加入当前项目的合法`name`字段，使请求通过 `pickAllowed` 并到达嵌套删除保护。

没有业务源码差异、权限放宽、schema/migration/dependency变更，也没有激活D-S01-08、T-RP-07或S03-OI-05。真实API与PostgreSQL中四条集成测试全通过；两条此前400的fixture现在分别到达权限拒绝和跨项目子项保护，父任务及外部子项均保留。
