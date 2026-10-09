# CodeBuddy（DeepSeek）审阅资料归档

本目录收录 **CodeBuddy（模型 DeepSeek）** 在 RDPMS 项目上产生的审阅、分析、验证材料，
按日期命名并标注当前状态，便于在 GitHub 上回溯。

> **当前仍有未闭环事项 —— 见 [open-items.md](./open-items.md)。**
> 那份清单是这个目录里最需要先看的东西；其余文件多为已闭环的过程记录。

## 材料清单

| 日期 | 材料 | 用途 | 当前状态 |
|---|---|---|---|
| 2026-10-07 | [test-only-fix-run.md](./2026-10-07-test-only-fix-run.md) | 前端测试对齐 owner/session API 的补正记录（原 16 项失败逐条映射） | **有效**（其中 4 项未闭环） |
| 2026-10-07 | [candidate-verification.md](./2026-10-07-candidate-verification.md) | 候选产物验证 + 目标环境差异盘点（43 张表、6 个迁移逐项分析） | **部分有效**：候选机制已废弃，迁移分析留档 |
| 2026-10-07 | [deploy-contract-draft.md](./2026-10-07-deploy-contract-draft.md) | RP18 部署合同草案（contract + 10 个 hook 的返回值契约） | **已作废**：方案被否决，改为原地部署 |
| 2026-10-06 | [github-drift-analysis.md](./2026-10-06-github-drift-analysis.md) | 服务器与 GitHub 的代码差异分析（3 提交 / 6 迁移风险评估） | **已作废**：差异已通过部署形态改造解决 |
| 2026-09-17 | [de260fc-independent-review/](./2026-09-17-de260fc-independent-review/) | `de260fc` 独立复核报告（Q1–Q9 缺陷复现 + JSON 证据） | 已闭环（2026-09-28 A01–A10） |

「已作废」指其**决策背景已不适用**，不是指内容有误 —— 保留是为了可回溯当时为什么那么判断。

## artifacts/

| 文件 | 说明 | 是否入库 |
|---|---|---|
| `test-only-fix-63d243b.patch` | 前端测试补正（12/16 项修复），**基线 `63d243b`** | ✅ 已入库 |
| `cand-63d243b-tests-20261007.tar.gz` | 补正后的完整 `tests/unit` 目录 | ❌ 未入库 |
| `cand-evidence-20261007.tar.gz` | 候选门禁证据（`candidate-manifest.json` + 构建日志，buildId `58bf3d1c…`） | ❌ 未入库 |

两个 `.tar.gz` 被仓库 `.gitignore` 的 `*.tar.gz` 规则挡下（该规则用于防止备份/压缩包入库），
**未强制加入**：测试包的内容与 patch 重叠，候选证据对应的门禁机制已被否决，
二者都没有独立留存价值。原始文件保留在服务器 `/mnt/datadisk0/rdpms-review/review-inputs/`。

## 边界说明

- **只收录 CodeBuddy 产出的材料。** 其他来源不在本目录：
  - `docs/remediation/`、`docs/audits/` —— RP 整改包的产出（另一执行体）
  - `review-packages/` 的两个复核 zip（43M）—— 保留在服务器
    `/mnt/datadisk0/rdpms-review/review-packages/`，**未纳入版本控制**（延续 round7 的体积控制约定）
- **未闭环事项统一记录在 [open-items.md](./open-items.md)**，不散落在各份材料里。
- 目录命名约定：`docs/review/<工具>/<模型>/`，便于将来区分不同来源的审阅材料。
