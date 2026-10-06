# 窗口D：T-RP-09认证transport/跨身份合同待批准材料

先读COMMON_RULES和清单。唯一可写：`S/window-d-auth/`。模式PREPARATION_ONLY，不修auth/client/tokenStore或会话策略。

## 必读范围

T-RP-09、PC01/PC04相关范围、RP00-T04当前交付和auth-generation-matrix.json；RP02-T02、RP03-T01及RP11-T01相关卡/验收/门禁。
定向只读trace后端实际login/refresh/鉴权和前端tokenStore、refresh发起/响应提交/原请求重放链。cookie旗标不能替代真实transport来源。

## 固定交付

1. transport-current.csv/.md：access/refresh从何处产生、发送、存储和消费；Bearer/body/cookie的实际入口和反证；事实来源/行号/hash。
2. generation-matrix.csv：两tab、切用户、logout、迟到成功/失败、refresh竞争、原请求重放的actor/token generation变化及现有保护。源码/旧运行层次分开，本轮真实JWT/IDB/UI NOT_RUN。
3. decision-draft.json/.md：T-RP-09可审批推荐合同（维持或调整现有transport的准确选择、single-use/family失败语义、前端generation fence与重放归属、兼容与回退）；status=PROPOSED，签名null。
4. acceptance-draft.csv：真实合法token/非空资源成功前提、两身份与两tab成功/失败负例、真实持久状态和所需临时环境；不以注入actor/mock冒充JWT全链。
5. approval-request.md和interface-notes.md：需安全/认证/前端具名确认的精确选择；与C的actor/key、E的兼容窗口、F的缓存generation接口，当前未定部分列待汇总。

D-S01-04已发access JWT撤销策略仍独立PENDING，不因T-RP-09方案而隐式批准；T-RP-12缓存/保全策略也不代签。缺实部署/真实支持范围如实OPEN_INPUT。
交付共同七类、WORKER_MANIFEST、READY；本轮只是材料交付，父任务实施/验收NOT_RUN。不得写共享根台账或其它窗口，冻结后停止。
