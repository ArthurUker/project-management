# Rollback

仅新增证据文件及本地临时DB测试资源；没有应用/schema变更。临时DB由guard drop，cluster停止。证据或ADR错误时可通过新增run修订，不覆盖attempt-01/02。不得据此实施publisher或迁移。
