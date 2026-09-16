# PROVENANCE-CORRECTION —— round6 运行清单的版本出处更正

本文件只做**更正说明**。**未修改任何旧 manifest、旧 result JSON 或旧截图**；旧记录（含失败记录）保持原样，
仅在此说明它们真实对应的版本，避免被误读为「当前代码的结果」。

## 1. 哪份文档表述有误

复核包 `rdpms-review-20260916-de260fc.zip` 内的 `README-review.md`（以及当时的回复）写有：

> `evidence/round6/*-manifest.json`（B01–B03 通过、B04–B06 失败）… commit `de260fc`

该表述**不正确**：清单是**运行时**写入的，记录的是当次运行时刻的 HEAD，而不是导出时的 HEAD。

## 2. 旧 manifest 的真实值（本次逐文件读取核对）

| 运行 | manifest 文件 | `git.headShort` | `worktreeDirty` | backend 源码树 hash | dist 产物 hash |
|---|---|---|---|---|---|
| 探针 probe | `2026-09-16T03-22-35-735Z-ce7bd0-manifest.json` | `ee2fba7` | **true** | `5ad79ca0bc6395f4b294776b79439a3b` | `a5bff9eac831f043a20b6793faadf107` |
| B01–B03（通过 8/8） | `2026-09-16T03-46-16-593Z-693cfe-manifest.json` | `ee2fba7` | **true** | 同上 | 同上 |
| B04–B06（失败 3/14） | `2026-09-16T06-20-33-402Z-7254ca-rf03b-manifest.json` | `be49ebd` | **true** | 同上 | 同上 |

（round6 目录下不同 suite 清单共用同一后端/前端源码内容哈希。）

## 3. 为什么不能把 Git commit identity 与源码内容 hash 混为一谈

- `git.head` 是**运行那一刻**的提交指针；只要运行期间有未提交改动，`worktreeDirty=true` 就表示
  **实际被执行的代码 ≠ 该提交的内容**。
- 本轮三次运行的 `worktreeDirty` 均为 `true`：当时工作区带着尚未提交的测试脚手架改动，因此
  它们的正确表述是「在 `ee2fba7`/`be49ebd` 之上、叠加了未提交改动的工作区上运行」，**不是**该提交本身的结果。
- 反过来，源码内容哈希（`sourceHash.backendSrc` / `buildArtifactHash.dist`）在三次运行中相同，
  说明**后端代码内容在三次运行间没有变化**；但这**不等于**「HEAD/dirty 状态也相同或等于导出 HEAD」。
- 结论：**「源码 hash 一致」只能支持「后端内容相同」的结论，不能用来把一个运行记到某个 commit 名下。**

## 4. 旧证据的处置

- 全部旧 manifest / result JSON / 截图 / 日志**保持原样**，未改写、未删除、未重命名。
- 旧 B04–B06 的 **3/14 PASS** 结果继续保留为历史失败证据，并标注：
  **该次运行的 harness 存在认证读取（token）与 reviewer fixture 缺陷，不可用于产品结论判定**。
- 复核包内 README 的该处错误以本文件为准；不回溯修改已导出的 zip（避免把「更正」写成「原始记录」）。

## 5. 新的可信基线要求（后续执行）

1. 源码修改全部完成后，`git status --porcelain` 必须为空 → 取得**最终 clean HEAD 完整 SHA**；
2. 在该 clean HEAD 上重新运行验收（B04/B05/B06/F10/RF04 及必要的 B01–B03 回归）；
3. 每次运行由 `frontend/tests/browser/harness.mjs` 生成**新 manifest**（新 runId），必须包含：
   runId、时间戳、branch、HEAD 完整 SHA、`worktreeDirty`、**测试前后各一次**的 backend/frontend 源码哈希、
   dist 构建产物哈希、Node/npm 版本、浏览器名称与版本、隔离测试库脱敏名、前后端端口、suite 名称、
   synthetic 账号与项目标识、结果汇总；
4. **若运行期间源码哈希发生变化，该次运行不得作为正式证据**；
5. 只有 (1)–(4) 同时成立的新运行，才是本轮之后的可信基线；旧清单不得被改写为新基线。

## 6. 当前状态（写作本文件时）

- HEAD：`e46f82b573abb6acee7cec9778485d482071d1ab`（`refactor/rdpms-guidance-v2`），工作区干净。
- Phase A–E（reviewer fixture、ReportEdit 状态锁、B04/B05/B06 重写与运行、F10 恢复闭环与真实 Chromium 验收、
  RF04 授权前置 + 撤权重放回归）**尚未执行**；因此**当前尚不存在**符合 §5 的新可信运行基线。
