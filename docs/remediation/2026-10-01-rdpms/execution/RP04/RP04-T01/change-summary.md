# RP04-T01 — 业务状态/日期快照与活跃项目查询

## 状态与范围

实现 COMPLETE；API/DB验证 ENV_BLOCKED；release NOT_EVALUATED。HEAD及审计基线均为 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。本任务范围是 B03 项目 status/startDate 消费和 B20 普通项目列表/类型状态统计；没有修改全局 `projectVisibilityFilter`，避免改变 sync、reports、files、tasks、phases 等其他调用方语义。

## 变化

- `projects.js` 增加带 `deletedAt:null` 的局部项目可见查询 scope，仅用于普通项目 list/count 与 types/status 统计；权限可见范围仍与原 `projectVisibilityFilter` 相交。
- 状态 PUT、批量状态更新和模板应用分别读取显式业务快照。窄授权投影仍只负责授权/身份范围；状态机和默认模板日期不再从未选择字段读取。
- 新集成用例覆盖软删对象不出现在 list/count/type/status stats、detail仍404、合法/非法/不变状态编辑、批量状态及模板使用项目 startDate。测试为自有隔离DB设计，执行器必须在完整丢弃临时DB前保留审计行所引用合成用户。

## 影响边界

只更改 `rdpms-system/backend/src/routes/projects.js`，新增集成验收文件；无API schema、DB schema、依赖或迁移变化。项目查询仍保持各原有筛选/可见范围，不涉及回收站新增能力、全局统计、sync墓碑或业务删除。B03/B20仍 SUPPORTED，动态反向验收未通过前不标 FIX_ACCEPTED。

## 验证

两个Node语法检查和`git diff --check`通过；静态搜索未发现 status/startDate 仍从 `access.project` 读取。完整构建因工作区缺少 `tsc` ENV_BLOCKED，当前没有dist入口；本任务真实API/数据库验收未运行。证据见`evidence/commands-and-results.json`。
