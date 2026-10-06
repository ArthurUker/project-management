# 独立审阅入口

读 SESSION_SUMMARY.md → approval.json/authorization.json → 两任务source-diff/source-hashes → frontend/browser bindings → final-validation-index → final-scope-and-cleanup → task-readiness.json。

尤其检查：user行锁顺序和事务strict audit；same-family单次消费；跨tab短写锁网络隔离、响应归属、请求不可换actor；真实commit-loss行为；legacy/capability降级；原始失败日志与最终明确attempt；RP02依赖验收addendum；原规划与target/release边界。

独立复核PENDING，当前执行者不代审。
