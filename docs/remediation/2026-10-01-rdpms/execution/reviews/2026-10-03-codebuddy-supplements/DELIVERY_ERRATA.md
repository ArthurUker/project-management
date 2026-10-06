# 冻结CodeBuddy补充交付的独立勘误

不修改原session；以下纠正用于接续。

| 原交付 | 裁定 |
|---|---|
| 三项全部完成验证通过 | 当前31条正式测试重跑通过，但必需覆盖/文档/清理失败路径和摘要要求缺项；三个SUP补交，原业务接受不变。 |
| SUP-01关联LR4-01；SUP-03关联LR4-04 | SUP-01→LR4-03；SUP-02/SUP-03→LR4-02。LR4-01为此前台账；LR4-04未定义。 |
| 四原语屏障均已覆盖 | 新用例只命中create；控制直接执行upsert；旧竞态和恢复仍单原语。恢复后submit竞态未固化。 |
| 移除同一actor权限 | 新用例从member切到zero账号，需补同账号对照。 |
| code/templateId/completedAt/submittedById等禁止读取 | 这些字段在当前允许读投影中；客户端禁止写与禁止读不能混淆。精确CSV/md待补。 |
| 项目phases请求封装证明前端会显示 | 封装没有证明调用。ProjectDetail实际读取项目详情；PhaseProgressBar使用模板阶段/tasks。UI NOT_RUN。 |
| 普通阶段行为即B20回归/已批准阶段政策 | 原B20为项目级软删范围；普通阶段当前行为和未裁定政策分开，不能自动推翻旧项目级接受。 |
| phases文件无DELETE路由 | 无阶段资源DELETE；存在流转边DELETE。 |
| 全部源码启动/结束摘要已证明 | 跟踪聚合复现一致；缺完整起始快照，排除两未跟踪模块。当前原审阅逐hash匹配，不补造历史基线。 |
| 版本摘要readback一致 | APPENDED_*/SESSION_DIR不是hash，history不自hash；需新追加真实摘要。 |
| 全部命令已运行 | executor build/套件有日志，typecheck/lint/diff无证据；reviewer独立补跑均0。 |
| 其他51项STANDARD任务 | 54任务18完成、2进行、34未开始，36项实施未完成；SUP不加入或相减54。 |
