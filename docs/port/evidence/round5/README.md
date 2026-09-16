# 第五轮证据包（浏览器验收 / 运行清单 / 增量导出）

## 1. 证据分类（重要，避免口径混淆）

| 证据 | 实现方式 | 分类 |
|---|---|---|
| `tests/unit/deadLetter.idb.test.ts`（F10 五条） | **fake-indexeddb**（Node 进程内的 IndexedDB API 实现） | 存储层语义验证（**非真实浏览器**） |
| `tests/browser/*`（本轮新增脚手架） | **真实浏览器**：chrome-headless-shell + playwright-core | 浏览器证据 |
| 后端 unit/contract/integration | node:test + 真实 PostgreSQL（rdpms_test） | 服务端证据 |

结论：F10 的 IndexedDB 用例**不是**真实浏览器证据，只能证明「在 IndexedDB API 语义下，拒绝区满足同一事务迁移、刷新可恢复、跨账户隔离」；
真实浏览器下的行为（含配额、隐私模式、事件时序）应以本轮 `tests/browser` 的产出为准。

## 2. 运行清单（每轮必录，防止旧进程结果被误算）

`run-manifest.json` 由 `tests/browser/harness.mjs` 在**每次运行**自动生成，字段含：

- `commit` / `commitShort` / `worktreeDirty`：被测代码的真实提交号与是否脏工作区；
- `buildId`：`dist/index.js` 的 mtime+大小（确认跑的不是旧构建）；
- `srcHash`：后端源码树内容哈希；
- `backendPort` / `frontendPort`：**本轮实际端口**（探针用 3400/5400，独立于常用的 3000/3210）；
- `database`：测试库名（脚本硬校验必须含 `rdpms_test`，否则拒绝启动）；
- `browser` / `node`：浏览器二进制路径与 Node 版本。

本轮探针记录：`commit=a5b79df`、`buildId=dist@2026-09-16T02:46:53.554Z-487`、`srcHash=ad5372b5dd17`、
`backendPort=3400`、`frontendPort=5400`、`database=rdpms_test`、浏览器 `chrome-headless-shell-1234`。

## 3. 浏览器环境与实际执行情况

- 可用：`playwright-core`（devDependency）+ 已缓存的 `chromium_headless_shell-1234/chrome-headless-shell`；
  脚手架 `tests/browser/harness.mjs`（独立端口启动后端+vite、等待就绪、生成运行清单）与 `tests/browser/probe.mjs`（页面结构探针）。
- 探针实测：登录成功（`test_super_admin`），但 `/reports` 显示「403 没有访问权限 / 当前账号未获取到任何权限点」。
- 根因（**非本轮改动引入，属既有缺陷**）：`/api/auth/me` 的 `loadPermissions()` 对 `SUPER_ADMIN` 返回 `undefined`，
  调用方回落成 `permissions: []`；同一账号在同步入口却能拿到 98 条权限 → 前后端口径不一致，超管界面全面不可用。
  修复：超管口径改为「全部权限码」，与同步入口一致；回归用例 `tests/unit/rf03-super-admin-permissions.test.mjs`。
  实测修复后 `/api/auth/me` 返回 `permissions=98`，含 `reports.view`。
- **未完成**：RF03 全场景（不同日期新建 / 编辑回填 / 保存后提交 / 重新打开）与多项目部分成功的**浏览器断言尚未编写与运行**；
  探针只到「列表页 DOM 取样 + 缺陷定位」这一步。该缺陷修复后，界面才具备继续做交互验收的前提。

## 4. 凭据与数据边界

- 本目录**不含** `.env.test.local`、JWT 密钥、种子口令，也不含任何真实实验数据。
- 增量补丁中唯一命中的凭据形字符串是 CI 工作流内的 `rdpms_app:ci-app-password`（GitHub Actions 临时 Postgres 容器的自有口令，非共享凭据）；
  另有 `.env.example` 版本样例，均为示例值。

## 5. 导出物

- `rdpms-bf04495-to-HEAD.bundle`（228K）：从基线 `bf04495` 到当前 HEAD 的增量 Git bundle；
- `rdpms-incremental.patch`（476K）：等效的完整增量补丁。
  应用方式：`git fetch <bundle> HEAD` 或 `git apply rdpms-incremental.patch`（复核用，不用于生产部署）。
