# 下一步：只补齐三个SUP，禁止业务修复

当前业务任务接受和54/306统计保持；本轮补充交付需要有界返工。不得把“全部测试通过”替代本文件列出的缺项。

## 允许范围

仅原两个正式测试：rp10-report-submit-snapshot.integration.test.mjs、rp08-sync-read-authorization.integration.test.mjs。新证据/文档/runner写新session目录，旧test-contract-2026-10-03和全部审阅目录冻结。记录文件仅按原受控规则追加引用及真实摘要。业务源码、前端、helper、guard、schema、迁移、依赖、原矩阵和图只读。

## 固定补交顺序

1. SUP-01：相关旧单原语屏障迁移到同一局部受控工具；按目标业务键/id和payload处理create/upsert/updateMany/update参数；不是只列方法名称。补墓碑恢复后竞争submit成功再放行的正式测试，真实状态/版本/audit/receipt一致。全部相关屏障try/finally释放、清timer、等待pending请求收束。保留语义控制，只证明实际坏状态；控制没有命中/没有复现与业务失败分别记录。不得临时改业务源码。
2. SUP-02：成功和拒绝使用同一userId/角色/成员资格/作者归属，仅移除目标权限；补精准CSV/md，列七实体实际ID、形状、权限、字段数、正确禁止字段、源行、case和日志。不得去修改同步投影适配旧错误字段表。
3. SUP-03：补GET project detail内phases和无projectId phases列表；追踪真实直接调用者或NOT_FOUND，不推断实际UI；引用AC-B20原项目级范围。区分阶段资源DELETE与transition DELETE。政策无批准仍UNRESOLVED。只交付有证据建议，不实施过滤、恢复或前端。
4. 会话交付：纠正原LR4映射/补充case编号，保存新起始完整文件集（含untracked）及冻结摘要；如实承认旧起始证据缺失，不倒填。runner只在新目录复制修正，先校验ROOT/目标/所有权，cleanup各步异常隔离、结果总是留档、清理失败影响退出，stop失败保留自有目录。新运行和封存用真正逐文件hash，不用APPENDED/SESSION_DIR，不自包含history hash。

## 验证与停止

两个完整套件逐库重跑，以及build/typecheck/lint:undefined/diff-check。必要runner失败控制说明是模拟还是真实owned drill。保留失败日志。先成功夹具后负例，注入actor不叫JWT全链。

逐项交付SUP原要求的七类文件和CSV/合同文档，声明未覆盖范围、真正命令、实际DB和清理。旧54/306状态/门禁不变，release NOT_EVALUATED。发现业务失败仅留证据，不修业务。当前独立未发现业务回归。

补交完成后停止独立审阅，不选其他STANDARD任务。需要范围外修复只能提出具体路径/理由/最小授权请求。
