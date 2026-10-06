# 独立审阅入口

1. REVIEW.md、findings.json、validation-summary.json：裁定及四个有证据的问题。
2. authorization.json、evidence/start-baseline.json、evidence/frozen-inputs.json：本轮读写边界及冻结清单。
3. evidence/independent-rp10/attempt-01/、independent-rp08/attempt-01/：两套完整真实DB运行、精确命令、日志和清理。
4. evidence/independent-validation.json、independent-field-traces.json、field-table-readback.json：运行轨迹及101行字段读回。
5. evidence/helper-controls.mjs/.json：纯helper反证，无数据库。
6. evidence/runner-exception-controls.py/.json与runner-exception-controls/：全subprocess模拟，冻结runner未修改。
7. evidence/record-integrity-analysis.json、phase-contract-check.json：摘要/ID、原state前缀及静态scope核对。
8. NEXT_EXECUTION.md、task-readiness.json、handoff.md、final-integrity-check.json：接续范围及审阅结束冻结核对。

旧执行者session所有文件保持原样；本审阅没有更新原任务状态或既有六个记录文件。新证据不能伪装为执行者当时的结果。
