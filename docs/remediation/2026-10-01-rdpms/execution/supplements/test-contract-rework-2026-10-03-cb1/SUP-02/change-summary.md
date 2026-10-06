# SUP-02 变更摘要（TEST_ONLY）

唯一修改的正式测试：`rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs`
（起始副本与 sha256 存于 session 根 `evidence/start-copies/`；业务源码改动数 = 0）。

## 1. 同账号撤权对照（LR5-02 第 3 项）

原用例正例用 member、拒例换成 `fixtures.users.zero`（另一个真实账号），
不能证明“同一合法账号仅失去目标读权限时拒绝”。本轮改为：

- 正例 actor：member + ALL_READ_PERMISSIONS；
- 拒例 actor：**同一 member** + 移除目标权限后的权限集；
- 断言：userId 相同、systemRole 相同、权限差集 `removed == [目标权限]` 且 `added == []`、
  成员资格仍有效（leftAt IS NULL）、reports 目标行作者仍是该 actor。

## 2. 精确行/字段对照保留并加固

- 七实体仍用**活跃目标行**（过滤 deletedAt/leftAt），避免误取 B3 建的墓碑行；
- 逐键逐值 deepEqual；manager 等较窄嵌套投影逐键比较在线同一对象；
- 按真实响应形状解析（members 裸数组 / list-object / single-object），不静默退空集合。

## 3. 字段表纠正（LR5-02 第 6 项）

- 新表按实际读投影与运行结果生成：`deliverables/field-comparison.csv`（101 行逐字段）
  与 `deliverables/field-comparison.md`。
- 纠正旧表误列：code、templateId、completedAt、submittedById、reviewNote、reviewedAt
  在当前**读投影中是允许字段**，不能写成禁止字段；「读取投影允许字段」与「客户端禁止写入字段」分开。
- 每实体登记入口/响应形状/权限/目标 ID/字段数/源码行号/用例与日志引用。
- 来源标 CURRENT_IMPLEMENTATION_COMPARISON；独立产品/安全字段政策批准仍 NOT_EVALUATED。

## 4. 保留的原范围

原 12 条套件全部保留（VIEWER/非成员/零权限/elevated/own-only/撤成员/墓碑/增量），
本轮只改最后一条补充用例，用例总数仍为 12。

七实体字段数：projects(16), projectPhases(16), tasks(26), milestones(10), monthlyProgress(12), reports(15), projectMembers(5)。
