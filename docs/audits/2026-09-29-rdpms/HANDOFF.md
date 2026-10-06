# RDPMS 深审接续记录

## 可复制接续提示

请接续 `/Users/renkang/VS Code/project-management/docs/audits/2026-09-29-rdpms/` 中的 RDPMS 审计。先读 HANDOFF.md、REPORT.md（若存在）、三个 results JSON 和 backup-result.json；以 `138cf2da1b63195cef7e884f69bdf8ded6ed3c21` 为审计基线。不要重做已完成的全仓扫描，不把缺陷复现成功当作系统验收通过。用户授权深入审计及架构评估，尚未要求修改业务代码或提交。先比较当前 HEAD/status，若基线变化只检查相关增量。按报告中分阶段计划推进；任何实施应先明确本次修复范围。

## 恢复额度后的续接（2026-09-30）

- 已读取本交接文档和记忆续接条目，核对HEAD仍为冻结基线，工作区仍仅有 `docs/audits/` 未跟踪新增。
- 已完成并复核 `REPORT.md`：28个条目各自有证据/触发路径/影响/建议与验证门槛；16 P1、12 P2，源码链接行号有效。
- 已新增 `manifest.json`，记录验证边界、基线、工件SHA256与结果统计。后续可从报告阶段0的优先级开始，但用户目前仍只授权审计/架构评估，未要求改业务代码。
- 冻结实例状态/复现限制仍按下方记录执行。

## 当前状态（2026-09-29）

- 当前 HEAD main: 138cf2da1b63195cef7e884f69bdf8ded6ed3c21；审计前工作区干净。
- 业务代码未修改；新增内容仅 docs/audits/2026-09-29-rdpms/，尚未提交。
- 已完成架构/认证授权/离线同步/文件/事务并发/模型/部署回滚的定向阅读。
- 真 PostgreSQL 隔离数据库：后端 20 + 注册项目补充 1 条缺陷复现成功；前端真实 engine + fake-indexeddb 4 条缺陷复现成功；本机 cp/rsync 1 条备份历史被改写的缺陷复现成功。
- 另外 2 条静态确认：preflight 检查旧 current 而非候选 release；ALLOWED_ORIGINS/ENABLE_BACKUP_EXPORT 配置与应用实现不一致。
- 合计 28 条发现，报告按 16 P1 / 12 P2 组织；没有认定 P0。
- 不是完整产品回归或真实浏览器 E2E；未访问生产/预发数据库，未运行生产部署/恢复。
- 隔离 PG 已用 pg_ctl -D 精确路径 -m fast -w stop 关闭，命令返回 0 / server stopped。后续不应假定该实例运行。

## 证据与环境

- backend-results.json / verify-backend.mjs：20 条。多数通过 actorResolver 注入明确身份，B01 管理员重置超管使用真实登录 JWT 和角色读取；并发/故障注入均在结果中注明。
- additional-results.json / verify-additional.mjs：B21 非成员读取及修改注册项目；普通项目详情404，对应注册详情200且更新200。
- offline-results.json / verify-offline.ts：4 条，用实际源码打包 + fake-indexeddb + 注入 transport；首次 F04 因测试脚本启动时意外自动同步未命中，修正夹具启动顺序后全部复现，未改业务代码。
- backup-result.json / verify-backup.py：本机 macOS cp -al latest 保存软链，rsync --delete 修改旧快照；没有在目标 Linux 主机执行。
- 临时根：/var/folders/6v/sk5g296520z6hvn1q3v9_xnr0000gn/T/rdpms-deep-audit-hru8uwnj
- 内有 backend/frontend 独立依赖和 backend dist，pgdata（已停）、pgsocket、database.json、原始运行日志。端口50796，库名rdpms_audit_isolated，仅127.0.0.1。
- npm ci 在副本执行，后端 tsc build 成功，6 条仓库迁移在独立 PG18.4 成功应用。不是全量测试通过。
- backend 两个复现脚本使用固定夹具名，不能不重置隔离库就重复运行；禁止指向任何现有业务数据库。脚本会核验 loopback、库名及 SHOW data_directory。

## 重要裁定与边界

- B01 ADMIN 默认有 users.reset_password，可重置 SUPER_ADMIN、再登录调用高权限接口；mustChangePassword 只在前端拦截，服务端仍可用。已真实JWT复现。
- 不将 projects.delete 缺少项目范围单独认定为普通用户可利用：默认仅超管持有，当前角色授权仅P0允许集合，不支持授予该未冻结权限。B02 项目嵌套硬删则已实证成立。
- F01 页面初始 user=null 被当作退出，fresh engine currentUserId=null 忽略归属用户的队列再 clearAll；需要启动清理先于身份恢复完成的时序，未做浏览器E2E。
- F03 账号切换共享项目缓存能读到前用户报告数据仅证实存储/API层；当前报告UI未发现使用 readCachedRecords，不能宣称页面已显示前用户报告。
- B05 需要知道已有 mutationId；证明错主体/错payload重放与资源元数据泄露，不能宣称能猜出随机ID或泄露报告正文。
- B19 创建本项目任务引用其他项目parent可接受；不是证明可以删除他人任务。
- 人工决定回滚符合脚本文档，缺少自动回滚本身不列缺陷。迁移先于构建是风险/优化项，未证明当前迁移造成回滚失败。
- 不基于 README 的旧 Dexie/Zustand 描述画架构；实际自封装 IndexedDB、React AuthProvider/SyncProvider、Hono模块单体、Prisma PG、本地文件。

## 下一步

1. 读 REPORT.md；若不存在，先依据上述证据完成正式报告（每条严重度、源码行、触发路径、影响、修复与验证门槛）。
2. 优先 P1：超管密码重置、注册项目越权、嵌套硬删、离线草稿丢失、备份历史污染；随后同步事务/游标和汇报状态快照。
3. 架构保留模块单体；HTTP与sync共用授权/命令/CAS/严格审计/回执事务；离线按主体分区、事务落盘；文件统一读策略；候选制品门禁与可回滚迁移。
4. 如用户要求修复，分小包逐个执行和验收；未获修复任务前不擅自改业务。
