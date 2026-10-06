# 窗口C：T-RP-02回执合同待批准材料

先读COMMON_RULES和清单。唯一可写：`S/window-c-receipts/`。模式PREPARATION_ONLY，禁止实施RP09/RP12业务代码。

## 必读范围

当前T-RP-02、PC03、RP09-T01/T02及RP12-T02任务卡/关联验收/条件门禁；RP00-T02的change-summary、handoff、acceptance及引用的500恢复合同证据。
沿现有receipts/payloadHash、sync push、报告/项目调用的相关链定向只读核对，读取有关schema字段和客户端key提交/重放处理。不要重审所有路由或306行。

## 固定交付

1. current-contract.md：真实actor/resource/command/key/hash/device及hash版本、tx中业务/audit/receipt、首次响应/同key重放/不同payload/unknown/expired/500边界；每事实有来源/行号/hash，已有保护和未覆盖分开。
2. decision-draft.json/.md：只为T-RP-02给出一个可审查推荐方案及必要备选；明确作用域、字段/API语义、留存/最大离线窗/查询授权、错误响应、兼容窗口、迁移和回退边界。推荐值是PROPOSED，不能称批准。
3. acceptance-draft.csv：合法认证与非空成功、真实副作用、同key/跨actor/resource/hash、提交前后500、unknown/expired及离线恢复的具体将来验收；本轮动态项NOT_RUN。必要T-RP-07/S03-OI-05只在对应delete范围生效，不扩大或略过。
4. approval-request.md：精确需批准的选择、数值/期限、具名角色/日期/证据字段，外部输入缺口。无源码依据的数值须明确“建议待批准”，不编造既有设置。
5. interface-notes.md：与认证窗口D/水位窗口F需确认的接口，使用当前合同及未批准占位，不读取其它窗口未冻结材料、不自行决定跨包冲突。

交付共同七类，准备材料可READY_FOR_AGGREGATION；产品实施/验收NOT_RUN，T-RP-02仍PROPOSED，签名字段null。不更新DECISION_REGISTER、任何根台账，不执行真实DB/测试/build或发消息给负责人。完成后冻结自己的目录。
