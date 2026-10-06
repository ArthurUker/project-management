# 本地回滚边界

先读各任务rollback.md与source-diff.patch，确认当前文件没有后续修改再只逆本任务hunk；不能reset/clean/stash覆盖既有工作。无schema迁移。不能恢复已消费refresh或删除审计、不能用旧两键凭据冒充安全登录代际。生产/兼容窗/目标回滚未运行，release NOT_EVALUATED。
