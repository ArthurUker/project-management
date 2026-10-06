# R13 — 候选发布门禁、配置与回滚

## 状态与范围

- 包状态：`COMPLETE_WITH_PENDING`。
- 基线与当前 HEAD：`138cf2da1b63195cef7e884f69bdf8ded6ed3c21`。
- 范围：deploy/preflight/start/smoke 脚本、systemd unit、后端示例配置与 CORS 装配；只读检查。未读取真实 `.env`，未调用 sudo/systemctl，未部署或执行 restore/回滚。
- 旧发现 D02、D03：仍为 `SUPPORTED / P2`，当前源码路径与历史静态证据一致。未新增确认的发布缺陷。
- 主要 pending：目标 Linux 上的回滚演练与失败状态验证未运行；尚无不兼容迁移的证据，不能断言“先迁移后构建”已经造成回滚失败。

## 发布阶段、目标与持久状态矩阵

| 阶段 | 实际目标 | 门禁/动作 | 可能已改变的持久状态 | 失败后恢复边界 |
|---|---|---|---|---|
| 1 preflight | 默认 `/opt/rdpms/current` 指向的源码、配置与主机 | `/usr/local/bin/rdpms-preflight.sh`；检查读取 `.env`、路径、配置和代码契约。部署脚本未传候选 `REPO_ROOT/APP_DIR/WEB_DIR` | 通常无应用写入；检查可读 `.env` 并做主机只读探测 | 失败即停止，未取候选；不需切流恢复 |
| 2 发布前备份 | 生产数据库与上传文件 | `rdpms-backup.sh predeploy` | 新备份文件/快照 | 备份失败停止；本包不重复审阅 D01/B13，参见 R12 |
| 3 clone | `/opt/rdpms/releases/${REL}` | SSH clone 与目录断言 | 新 release 目录 | 失败停止；可能留下不完整 release 目录，current 未切换 |
| 4 npm ci | 候选 backend/frontend 工作树 | 锁文件安装依赖 | 候选目录 node_modules | 出错由 `set -e` 退出；不影响 current；清理不完整目录的流程未见于该脚本 |
| 5 migration | 共享生产数据库，执行目录在候选 backend | `prisma generate && prisma migrate deploy && status`；位于候选构建与 smoke 之前 | 数据库 schema/data 迁移可能已提交；失败没有本脚本级自动补偿 | 应保持 expand/contract 向后兼容；若迁移不兼容，退回旧代码不能自行回滚 DB。当前未证明有具体不兼容迁移，故只列风险/待演练 |
| 6 seed | 共享 DB | 仅 `RUN_SEED=true` 时执行 seed | 可能写入/更新 seed 数据 | 默认跳过；显式启用时失败中止，seed 部分事务/恢复依赖未在本包验证 |
| 7 build | 候选 backend/frontend | 后端 `npm run build` 且断言 `dist/index.js`；生成前端 `.env.production` 后 build 并断言 dist 目录 | 候选目录构建物、前端构建配置 | 构建失败退出；current 尚未切换。前端 build 命令未显式 `|| die`，但 `set -e` 下简单命令失败仍退出 |
| 8 切流/重启 | `/opt/rdpms/current` 指向新 release；systemd API 与运行代理 | `ln -sfn`、写 `.deploy-meta`、restart API、已运行代理 validate/reload | current 指针、部署元数据、进程版本；代理 reload 可能改变流量路径 | 这些步骤之后失败需要人工决定并指回上一完整 release；`reload_proxy` 在发现运行中代理但 validate/reload 失败时会中止。未验证每种中断状态 |
| 9 smoke | 默认本机 API 地址；默认 production/read-only profile | health、ready、未认证拒绝、登录/授权、业务只读检查；失败退出并提示按 §13 回滚 | read-only profile 预期不改变业务行；smoke 日志写 `/var/log/rdpms`；登录/审计副作用需看实现配置 | 部署脚本只提示人工回滚，没有自动切回；当前 worktree 未发现 §13 具体 runbook 内容。用户提供的旧交付证据称手动回滚符合流程，但本轮无法验证服务器操作说明 |
| 10 清理 | `/opt/rdpms/releases/*` | 保留最近 `KEEP_RELEASES`（默认 3）个目录 | 旧 release 目录删除 | 成功完成后，较老回退目标可能不可用；是否保留上一完整 release取决于目录排序与数量。失败清理不应撤回已上线指针 |

## D02 — P2 — `SUPPORTED`

- **入口与调用链：** deploy Step 1 调用无参数 preflight → preflight 默认 `REPO_ROOT=/opt/rdpms/current`、`APP_DIR/WEB_DIR` 也在 current → 只有通过后才 clone `${REL}` 候选 → 安装依赖 → 迁移/seed → 构建候选 → 切 current。见 `deploy.sh:94-117,119-152`、`preflight.sh:58-61`。
- **触发前提：** 候选代码或 schema/seed 契约与 current 不同，且候选存在一项 preflight 会捕获的问题。无需源码变化即可走到此路径。
- **历史证据：** 旧 REPORT 的 D02 为静态确认；当前轮未重跑部署，也没有理由重跑。历史结论只证明门禁目标顺序错误，不证明已有生产候选因此发布失败。
- **当前代码证据：** preflight 支持通过环境变量指定 `REPO_ROOT/APP_DIR/WEB_DIR`，但 deploy 调用未传入候选路径；clone 后也没有对候选执行同等门禁。
- **保护与反证：** 候选结构断言、`npm ci`、迁移状态、后端构建和 dist 断言仍会失败关闭；它们不是 preflight 覆盖的完整 schema/seed/源码契约。门禁错误目标仍成立。
- **已证明影响：** preflight 通过只证明当前 current 对应源码满足这些契约检查，不能据此证明即将切流的候选满足。尚无证据证明线上已发生具体错误发布。
- **修复建议：** 将主机检查与制品检查拆分；clone 后对 `${RELEASE_ROOT}` 明确传递候选 `REPO_ROOT/APP_DIR/WEB_DIR` 执行候选门禁，再迁移/切流。给候选生成 commit/build manifest，并让门禁和后续 smoke 共用该标识。
- **验收条件：** 在隔离副本里让候选 schema/seed/源码契约故意失败而 current 通过；候选门禁必须在 DB migration 和 symlink 切换前失败。正常候选应记录被检查的 release commit 并匹配构建输入。

## D03 — P2 — `SUPPORTED`

- **入口与调用链：** `.env.example` 定义 `ALLOWED_ORIGINS`、`ENABLE_BACKUP_EXPORT` → preflight source `.env` 并检查 `ALLOWED_ORIGINS` 不为 `*`、`ENABLE_BACKUP_EXPORT=false` → systemd 以 `EnvironmentFile=/srv/rdpms/.env` 把环境变量注入应用 → createApp 实际读取 `CORS_ORIGINS`，缺项默认 `*`；backend/src 未读取 `ENABLE_BACKUP_EXPORT`。
- **触发前提：** 运维只按模板/preflight 配置 `ALLOWED_ORIGINS`，未额外配置 `CORS_ORIGINS`；或认为将 `ENABLE_BACKUP_EXPORT=false` 作为门禁就会由应用执行该开关。真实 `.env` 未读，故生产触发事实未知。
- **历史证据：** 旧 REPORT D03 是静态确认；未声称无认证导出或令牌可直接窃取。
- **当前代码证据：** `backend/.env.example:32,48`；`preflight.sh:125,131`；systemd unit `:12-15`；`createApp.js:65-69`。静态搜索 backend/src 与模板显示只有运行时 `CORS_ORIGINS` 被用作 CORS 输入，没有 `ENABLE_BACKUP_EXPORT` 消费点。
- **保护与反证：** preflight 会拒绝 production 下 `ALLOWED_ORIGINS=*`，但应用若只得到该变量仍按 `CORS_ORIGINS || '*'` 设置 CORS。备份导出路由另受应用权限控制；未把开关不生效扩展成无认证备份暴露。
- **已证明影响：** 检查结果与运行时 CORS 配置不是同一变量契约；该开关的 preflight 成功不能证明应用层已启用/关闭某功能。没有生产配置证据，故实际部署后果为待确认。
- **修复建议：** 建一个类型化、唯一配置 schema，在应用启动时解析并拒绝无效/缺失 production 配置；preflight 与应用共用同一 schema 或同一生成契约。导出开关若无产品行为则移除虚假检查；若需要则由唯一导出入口读取并有针对性验收。
- **验收条件：** 使用隔离环境传入只设置模板变量的配置，检查 CORS 响应确实采用允许列表且拒绝其他来源；分别验证导出开关 true/false 对明确的受权请求行为一致，并验证 preflight 与应用在缺失/非法配置时给出一致失败。

## 回滚路径与演练状态

已有可见设计：发布前备份；release 目录独立；切流使用 `current` 软链；启动包装 `rdpms-start.sh` 通过当前路径选 `dist/index.js` 或旧 `src/index.js`；systemd unit 注释描述手动将 current 指回上一完整 release。部署 smoke 失败只提示按 §13 回滚并退出，不自动回滚。按计划要求，人工回滚本身不构成缺陷。

当前 repo 证据没有明确的 §13 操作步骤文件，也没有本轮演练记录。rollback 方案（**仅计划，未执行**）：记录当前/前一 release commit、schema migration 状态和备份 manifest；确认上一 release 兼容当前数据库；由值班负责人将 current 指回上一完整 release、restart 服务；通过 health、ready、认证只读 smoke 和 build/commit 指纹确认；检查日志/错误率后决定是否恢复流量。任何向后不兼容 schema 或数据迁移须有前向修复或成对补偿计划，不自动 `migrate down`。目标 Linux 上需验证软链切换、进程重新解析、代理、日志、旧 release 保留和 restart 失败处理。

## 架构优化建议

1. 统一配置：示例、预检、systemd 与运行时消费相同的 schema；显式声明每个变量的来源、默认、敏感级别、生产约束和消费者。
2. 候选门禁：将主机门禁与候选门禁分开；候选在迁移前完成依赖/源码/schema/seed/构建检查，并生成可追踪的不可变 release manifest。
3. 上线信号：`/api/ready` 当前只证明数据库 `SELECT 1` 可用；smoke 当前对 health/ready 断言 HTTP 成功。将实例/build ID、migration revision、readiness 和关键业务只读契约绑定同一次发布记录，并明确 smoke 是否必须验证这些身份。
4. 回退契约：坚持 expand/contract；每个 migration 标注旧代码兼容窗口、不可逆数据转换和补偿办法；设置显式的保留 release 清单及演练记录，避免清理策略误删唯一兼容回退目标。

## 待决与未覆盖

- `COMPLETE_WITH_PENDING`：D02/D03 源码判定完成；目标服务器真实配置与服务状态未检查。
- 未读取真实 `.env`，未访问数据库、生产主机或代理配置；因此不能确认当前线上变量、代理拓扑、候选内容或迁移状态。
- 未执行部署、preflight、smoke、systemctl、回滚或 restore；矩阵的失败状态是按源码控制流推导，不是运行时结果。
- 未发现/核对明确的 §13 手动回滚 runbook；需由运维提供非敏感 runbook 和目标 Linux 隔离环境才能完成演练。
- 未审计 workflow/CI 发布流水线及签名、制品仓库权限；不据此声称当前不存在外部门禁。
- 不兼容迁移属于条件性风险；目前没有一个具体 migration 被证明会破坏旧版运行。
