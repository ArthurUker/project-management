# 窗口E：T-RP-03/S03-OI-09客户端revision矩阵

先读COMMON_RULES和清单。唯一可写：`S/window-e-revision/`。模式PREPARATION_ONLY，不启用严格CAS、不改前端任务/报告保存或sync代码。

## 必读范围

RP00-T03当前revision-support-matrix.json及引用证据，T-RP-03、S03-OI-09和RP10-T01任务卡/验收。
只读当前客户端普通字段/status/assignee/批量/离线入队/重试/冲突处理链及服务端对应revision字段；按矩阵缺口补齐调用者，不重新审计整个前端。

## 固定交付

1. source-client-matrix.csv/.md：每入口到API→queue→sync/server→conflict/retry的具体调用链、base读取/发送/持久化、legacy/missing-base分支；附当前hash/行号和证据层次。
2. support-evidence-register.json：严格区分源码观察、构建版本、已部署版本、产品声明的支持版本、升级截止。后3项没有外部来源则UNCONFIRMED/OPEN_INPUT；package.json版本不等于已部署/仍受支持。
3. decision-draft.json/.md：T-RP-03推荐兼容矩阵、missing-base/409交互、升级窗口及字段/status/assignee全链范围；所有政策PROPOSED、签名null。
4. acceptance-draft.csv：支持端合法成功/缺base/旧revision/切用户/离线重试、真实IDB与UI验收要求；动态NOT_RUN，缺fake-indexeddb也不安装。
5. external-client-evidence-request.md：逐项列真正缺少的部署版本/支持声明/升级时间/实例来源，提供空白填写结构；不访问服务器、真实客户端、账号或SSH。

交付共同七类、WORKER_MANIFEST/READY。源码矩阵材料完整不代表S03-OI-09已满足或RP10-T01可启动；禁止更新原RP00-T03及根门禁台账。已知旧证据直接引用，避免重复生成。
