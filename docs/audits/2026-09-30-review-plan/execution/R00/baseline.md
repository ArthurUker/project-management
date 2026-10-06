# R00 基线与证据接续

日期：2026-09-30。分支：`main`。基线与核对时 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。

## 仓库状态

- HEAD 匹配基线：是。
- `rdpms-system/` 跟踪工作树干净；当时未跟踪内容仅在 `docs/audits/`，故没有源代码差异。
- 本文是从原 R00 `baseline.json` 转录的可读摘要；机器数据及摘要值以 `baseline.json` 为准。

## 冻结审计摘要校验

| 文件 | manifest 摘要匹配 | SHA-256 |
|---|---:|---|
| `REPORT.md` | 是 | `704d2aacc5ab0677a4a3fb26de2b5b1352247be096b46cab6fa49ddbdaff0978` |
| `HANDOFF.md` | 是 | `33a94fc76c879fcc38db439386e6d73cf84489af77b8ef3d0e0df1ba8221741c` |
| `findings.json` | 是 | `c304f8288ab9b812eb014456d7a7209c86a89d22e1e6744316060153ecc715f2` |
| `backend-results.json` | 是 | `256f091df2e27f86e733a21b15636a09c7ae09081dd813e9d56ba142afc84ee5` |
| `additional-results.json` | 是 | `ef0971c8f91f787ca84c14258478c18f07795399a55d005340723f0c5756dc80` |
| `offline-results.json` | 是 | `88f60d08dfe24281e6b9c3ffbfa059fa4fb2fc13f4c58c45482c49f5e81ee390` |
| `backup-result.json` | 是 | `57bac6cb5a1a72a14be00c706b3c3e820e4a4a58c5ad8c80c5b8bb8f98aa0268` |
| `verify-backend.mjs` | 是 | `9f2caad59565c1feaca6af0cd5fc4e8820c6df16eb5f9c2caa10c8f138aca189` |
| `verify-additional.mjs` | 是 | `54e707dc51031b261b698c2609644f9cbe1f0581e66be55ff6fe9e22c69ad372` |
| `verify-offline.ts` | 是 | `2c1412a2a55f71dc8da5503d95d1e685a29251f110e91f2a8ffaf69c2b6b0ea7` |
| `verify-backup.py` | 是 | `b0bda85bd342234939ee2d2498144b2f43d4730b1ac245aaa10ac1eb638fccc3` |

## 历史发现映射

旧 findings 共 28 条，旧报告标题 28 条，ID 对应：是。严重度为 P1 16 条、P2 12 条。详细逐 ID 裁定见 R14 的 `CURRENT_FINDINGS.json` 与 `findings.json`。

## 证据限制

历史动态证据、静态部署确认、真实 JWT 与 actor 注入、前端引擎与真实浏览器、macOS 与目标 Linux 的证明能力不同；不要把历史复现写成本轮运行，也不要把缺少动态验证解释成源码问题不存在。后续具体范围、环境及未覆盖项记录在各工作包和 handoff。
