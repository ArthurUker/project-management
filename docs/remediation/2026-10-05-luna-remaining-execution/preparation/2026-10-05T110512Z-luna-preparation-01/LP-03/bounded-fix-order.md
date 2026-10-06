# 有界修复顺序建议（待逐项批准与新实施授权）

这不是当前改码授权。CodeBuddy停写并完成新baseline后，按真实implementationDependencies和IMPLEMENTATION阶段条件逐任务判断，不要求先批完21项。

1. T-RP-05批准后考虑RP14-T02（RP14-T01依赖已满足）；保留INFECTED阻断。
2. D-S01-07批准后考虑RP10-T03（RP10-T02依赖已完成）；不重做报告快照和迟到写保护。
3. D-S01-01后可考虑RP01-T02 rank/reset子范围；只有强制改密子范围还需D-S01-02；RP01-T03保持未激活。
4. D-S01-05后考虑RP06-T01 registration scope；不重新打开已接受的普通RP08-T01。
5. D-S01-06后考虑RP07-T02；S03-OI-07同一批准；RP06-T02仍等RP06-T01和RP07-T02 implementation deps。
6. T-RP-06后考虑RP16-T01；明确不是整库/文件灾备。
7. D-S01-08与T-RP-07满足且前置完成后考虑RP05-T02；只有实际改delete/tombstone才应用S03-OI-05。RP05-T03仍OPTIONAL_INACTIVE。

回执T-RP-02可独立批准后推进RP09-T01，但先复核RP00-T02实现前置和共享delete helper真实范围。T-RP-09不替代D-S01-04。RP02-T02的RP03-T01和RP08-T02的RP11-T01是验收依赖，不是实施依赖。

阶段读取软删政策和字段级授权批准来源仍需独立范围澄清；本准备不新增业务任务或授权修改phases.js/projects.js。
