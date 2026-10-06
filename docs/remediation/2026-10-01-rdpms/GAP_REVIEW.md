# 修复计划查漏结果（2026-10-02）

本轮对v1冻结快照、发现映射、开放项、任务卡及验收要求做结构/证据比对；仅针对认证transport、IDB、DTO、编译入口、测试guard等命名路径只读核对。没有执行新的全仓审阅、复现或业务修复。

## 结论

原计划有18项需补齐的规划缺口，现已写入v2计划与机器登记。33条产品记录/31条审计开放项保持不变，没有新增已确认产品问题。计划层面ADDRESSED不表示实施完成。

## 逐项缺口

### PG01 验收矩阵漏包及漏包内要求

v1证据：v1 ACCEPTANCE_MATRIX仅97条继承行，RP00/RP15为0；PACKAGES.acceptanceCases未入矩阵。

补充：全20包的包完成、门禁和联合场景进入矩阵，并保持原97个case_id。

落实：ACCEPTANCE_MATRIX.csv。状态：规划ADDRESSED；实施NOT_STARTED。

### PG02 未裁定目标没有机器条件

v1证据：v1矩阵无decision/task/expectation字段；AC-B10-02规定拒绝SUBMITTED，但D-S01-07仍可选择允许复提。

补充：验收目标关联决定、条件子任务与批准状态；未批准目标不产生PASS。

落实：DECISION_REGISTER.json; ACCEPTANCE_MATRIX.csv。状态：规划ADDRESSED；实施NOT_STARTED。

### PG03 整包依赖阻塞独立子任务且存在隐含循环

v1证据：RP02要求RP03方案定稿而RP03依赖RP02；RP10/RP13/RP19整包依赖与局部推进正文不一致。

补充：明确子任务实施DAG与验证/发布依赖，设计合同前置不等同实现完成。

落实：TASK_GRAPH.json。状态：规划ADDRESSED；实施NOT_STARTED。

### PG04 门禁文本与机器范围未统一

v1证据：v1 T-RP-01..08只有Markdown；S03-OI-05遗漏实际sync写入所属RP09；state只有自然语言gates。

补充：统一决定registry、每项门禁的affectedTaskIds和执行阶段；旧31项不关闭。

落实：OPEN_ITEM_GATES.json; DECISION_REGISTER.json。状态：规划ADDRESSED；实施NOT_STARTED。

### PG05 IDB多标签升级和事务生命周期未展开

v1证据：RP11写中止可重入，但未规定blocked/versionchange、旧tab写入和跨owner升级互斥。

补充：定义升级协调、关闭旧连接、租约/代次及IDB事务内禁止不受控外部await。

落实：CROSS_PACKAGE_CONTRACTS.md PC04。状态：规划ADDRESSED；实施NOT_STARTED。

### PG06 成功旧响应及原请求主体绑定未展开

v1证据：RP03仅强调旧失败不能清较新token；缺旧成功响应、原请求A在B会话下重放目标。

补充：请求与token generation/actor绑定，成功和失败过期响应都不污染新身份；403不绕cache。

落实：CROSS_PACKAGE_CONTRACTS.md PC01。状态：规划ADDRESSED；实施NOT_STARTED。

### PG07 同资源离线后续编辑和过期回执策略不足

v1证据：RP12依赖排序，RP09保留窗均未规定发送中本地再编辑、同key payload变化和key过期处置。

补充：已发送mutation不可变，后续编辑新key并保留版本链；过期unknown回执不自动二次执行。

落实：CROSS_PACKAGE_CONTRACTS.md PC03/PC12。状态：规划ADDRESSED；实施NOT_STARTED。

### PG08 发布水位安全不等于同资源版本有序

v1证据：RP13持锁publication序列未规定已提交outbox扫描次序、同资源revision排序及恢复epoch。

补充：定义event source revision/epoch、同资源序、去重与故障恢复；不能以发布时间号覆盖较新资源。

落实：CROSS_PACKAGE_CONTRACTS.md PC05。状态：规划ADDRESSED；实施NOT_STARTED。

### PG09 snapshot与log、ACL重校验和过期cursor合同不足

v1证据：RP08/RP13要求snapshot和version，却缺bootstrap切点、旧event覆盖snapshot、分页间撤权和RESET_REQUIRED。

补充：定义一致bootstrap/去重应用、页级授权和投影、撤权outbox隔离、过期cursor保全重建。

落实：CROSS_PACKAGE_CONTRACTS.md PC05。状态：规划ADDRESSED；实施NOT_STARTED。

### PG10 restore对会话、回执、同步和草稿影响不足

v1证据：RP16仅registry/count，RP19paired restore；未覆盖恢复旧security状态、旧receipt/cursor和post-commit核查失败。

补充：批准dataset epoch与会话/receipt策略；reset保全owner outbox；区分提交前rollback及提交后needs-reconciliation。

落实：CROSS_PACKAGE_CONTRACTS.md PC06。状态：规划ADDRESSED；实施NOT_STARTED。

### PG11 备份并发、硬链约束和配对清理不足

v1证据：RP17只有runId及published清理原则；无两任务并发、runId碰撞、shared inode/metadata及pair保留测试。

补充：唯一run/mutex、硬链修改选项约束、完整对的保留/孤儿处置与目标文件系统实证。

落实：CROSS_PACKAGE_CONTRACTS.md PC08。状态：规划ADDRESSED；实施NOT_STARTED。

### PG12 关系/DAG并发和迁移预算缺具体合同

v1证据：RP05/RP15同项目与DAG描述缺相向并发边、锁顺序、递归预算及超限处理。

补充：批准DAG时验证两个并发边不能合成环；登记锁/递归预算、cancel和补偿。

落实：CROSS_PACKAGE_CONTRACTS.md PC07/PC11。状态：规划ADDRESSED；实施NOT_STARTED。

### PG13 candidate构建次序和配置运行入口不完整

v1证据：RP18要求gate在DDL前，但新typed config/build入口未明；backend package start为dist，deploy写VITE_AUTH_MODE=cookie不证明cookie实现。

补充：先建立candidate编译产物并校验后DDL，确认config CLI加载dist；核对auth配置真实消费。

落实：CROSS_PACKAGE_CONTRACTS.md PC09。状态：规划ADDRESSED；实施NOT_STARTED。

### PG14 首个安全版本失败时没有可用回退路径

v1证据：多个rollback只说不能回旧漏洞版本；尚无首个safe版本失败时的具体可恢复目标。

补充：每candidate登记兼容且安全的rollback或局部维护/停写方案、负责人及解除条件，未具备不发布。

落实：RELEASE_GATES.json; PC10。状态：规划ADDRESSED；实施NOT_STARTED。

### PG15 描述步骤与可改文件不完全吻合

v1证据：RP04/07的strict audit、RP08/13的IDB/DTO、RP10的types、RP13发布器生命周期不在原scope。

补充：补明确文件范围与共享owner/联合合同；新增路径仍是提案。

落实：PACKAGES.json; CROSS_PACKAGE_CONTRACTS.json。状态：规划ADDRESSED；实施NOT_STARTED。

### PG16 用户冲突恢复与隔离数据处置未具体定义

v1证据：RP11提认领/导出但无当前权限校验、恢复选择、容量/保留与最后副本目标。

补充：定义冲突对比、保持副本、重新授权重试、过期/无owner隔离和安全导出/放弃，禁止首个账号自动认领。

落实：CROSS_PACKAGE_CONTRACTS.md PC12。状态：规划ADDRESSED；实施NOT_STARTED。

### PG17 可观察性、性能门槛和负例前提不足

v1证据：v1日志要求没有publisher lag/DB lock/storage quota/last verified backup门槛，也没规定鉴权成功/夹具存在前提。

补充：登记预算及owner、遥测/停止阈值，负例先验证合法主体和持久夹具，避免把401/空结果当权限PASS。

落实：RELEASE_GATES.json; PC11。状态：规划ADDRESSED；实施NOT_STARTED。

### PG18 项目收尾只明确16个P1

v1证据：v1计划只写16个P1总体验收，未明确P2/候选及支持迁移剩余的总体状态。

补充：全部32confirmed和1candidate逐条处置，risk accepted不记FIXED，local/target/deployed独立登记。

落实：IMPLEMENTATION_STATE.json; RELEASE_GATES.json。状态：规划ADDRESSED；实施NOT_STARTED。

## 仍待真实信息或批准

两项静态前置、8业务/13技术决定、目标环境/retention/body/锁/观察预算、32确认项验收及候选裁定均未由本次计划编辑解决。需要启动实施后按task/gate证据分别完成。不再添加没有代码证据的新漏洞断言。

## 版本与状态

v1快照13文件保持sha256不变；输入manifest和历史审计冻结。v2依赖DAG、映射、场景及引用校验见PLAN_VALIDATION；检查对象为计划文档，产品运行检查NOT_RUN。
