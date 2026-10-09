# 未闭环事项清单（CodeBuddy / DeepSeek）

更新：2026-10-09　　关联提交：`f8ccb06`（部署形态改造）

> 本文件是 RDPMS 当前**尚未闭环**的事项汇总。已闭环的历史材料见同目录
> [README.md](./README.md) 的清单。

## A. 前端测试 4 项未解决（技术债，优先级最高）

2026-10-07 的 `TEST_ONLY` 补正把前端单测从 47/63 提升到 60/64，仍有 4 项失败，
全部位于 `rdpms-system/frontend/tests/unit/offlineAccountSwitch.test.ts` 的引擎时序套件：

| 用例 | 现象 | 性质 |
|---|---|---|
| **A03-E4** | 断言「B 的拒绝内容必须归属 B」失败：0 ≠ 1 | **未定性** —— 真实缺陷 或 旧预期与新合同冲突，待裁定 |
| A03-E2 | 「A 的上行已发出」屏障超时（push 未被调用） | 夹具时序 |
| A03-E3 | `NETWORK_ERROR`（疑似上一用例遗留的 syncNow 在传输替身还原后走默认传输） | 夹具时序 + 用例隔离 |
| RP13-T01 | 「第二页请求已发起」屏障超时 | 夹具时序 |

已排除的原因（均实测过）：缺 `datasetEpoch`、缺 `_syncRevision`、
`resetDatasetEpoch` 清键、事件循环空转、用例间引擎状态残留。
独立诊断已证明**引擎的分页续拉逻辑本身正常**（第 1 页 → 第 2 页 → `cursor-final` 完整走通），
因此问题定位在夹具与引擎的时序耦合，而非分页实现。

**下一步**：先裁定 A03-E4 是缺陷还是旧预期冲突，再针对确认的原因单独划修复项；
其余三项作为「夹具时序」专项处理。

补正成果见 `artifacts/test-only-fix-63d243b.patch`。注意其基线是 `63d243b`，
当前 HEAD 已是 `f8ccb06`，应用时可能需要手工对齐。

## B. 部署工具中的死代码（待清理）

`rdpms-system/deploy/scripts/` 下仍保留着已被否决的 RP18 门禁体系：

```
deploy-control.py      候选部署状态机（contract + 10 个 hook）
candidate-gate.py      候选准备门禁（生成 manifest / buildId）
backup-pair.py         配对备份
preflight.sh           （已被改写为只有 --host / --candidate）
deploy.sh              （已被改写为只转发 --prepare / --apply）
drill/                 发布演练脚本
```

2026-10-08 改为原地部署后，这些不再参与任何流程。

**下一步**：确认删除，或保留作历史参考。删之前注意 `deploy.sh`、`preflight.sh`
已被新流程绕开，但文件内容是 RP18 时期的实现。

## C. 待专项验证（需自有隔离库，禁止访问生产库）

`pullProtocol=2` 首次拉取的**懒初始化**：`routes/sync.js` 的 `/init` 在该分支先
`await publishCommittedChanges(prisma)`，其内部 `upsert` 当前 epoch 的
`sync_publication_state`，因此**不会**因缺行而失败 —— 2026-10-07 已撤回原先的
「缺行导致必然报错」判断。

但首次初始化涉及源表锁定与批量捕获，其**耗时与锁等待**尚未在目标环境实测。

**下一步**：在 `rdpms_test` 中构造「迁移完成、publication state 不存在、无迁移后业务写入」
的场景，实测首次 v2 拉取；不得绕过路由直接调底层函数后宣称 API 有缺陷。

## D. 环境遗留

| 项 | 现状 | 建议 |
|---|---|---|
| 系统盘占用 | 77%（50G 用 37G，剩 12G） | 与 rdpms 无关（/home 15G、/usr 6.4G、/tmp 2G）；如需清理另行安排 |
| `/tmp/codebuddy-heap-snapshots` | 1.5G | CodeBuddy 扩展产生，非项目产物 |
| `review-packages/` 两个复核 zip | 43M，位于 `/mnt/datadisk0/rdpms-review/` | 内含代码版本已超前两代，可删（未纳入版本控制） |

## E. 已知的用户可见影响（非缺陷，无需修复）

- **需要重新登录一次**：新代码要求 access token 携带 `securityVersion`；
  2026-10-08 之前签发的 token 没有该字段，会被判为 `SESSION_REVOKED`（401）。
  这是 `kernel/rbac.js` 校验的确定性结果，刷新页面重新登录即可。
- **前端 IndexedDB v2 → v4**：旧库原始数据转入 `legacyQuarantine`（原样保留），
  未同步的离线草稿需通过 RecoveryPanel 恢复。**此项尚缺真实浏览器 UI 验证**
  （现有证据文件名不能替代真实截图）。
