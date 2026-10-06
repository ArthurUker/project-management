# Rollback and containment

1. 本地已验证RDPMS_SYNC_WRITE_DISABLED=true令reserve/push返回503而合法query可读；现有HTTP/API其它业务保持其合同。不要在目标环境自动设置，未获部署授权。
2. 目标发布前必须完成客户端协议接入、旧CI用例迁移、联合验收和候选环境演练。禁止通过恢复不安全旧sync写入来让旧测试通过。
3. 候选版本隔离回退时保留四nullable列及回执行，以禁写优先；不要删除审计/receipt或自动重发未知命令。原payload保留需求需客户端与数据合同裁定。
4. 若将来确需源码回退，在新隔离checkout按本run保存的before副本及逐任务diff评估，不reset/clean/stash当前脏工作区；不得覆盖其它历史修复。
5. 临时库迁移部署成功与整库销毁已有证据；目标down migration/真实恢复/生产配置回滚均NOT_RUN。未生成或执行生产回滚脚本。
