# RP13-T02 — 未签署ADR与本地barrier证据

未实施应用/业务schema。保留 `evidence/WATERMARK_ADR_DRAFT.md` 为PROPOSED；新增owned本地PostgreSQL双会话SQL模型，验证未提交source/outbox对已完成cut不可见、提交后发布序号行锁模型返回精确revision、竞争publisher串行获取2/3、事务rollback无source/outbox或计数残留。普通非事务sequence反例显示2先提交、1后提交，checkpoint=2后返回0行，确认永久遗漏风险。

该证据仅验证候选SQL示意，不验证现有应用实现或生产方案；不选定架构，不签ADR，不批准T-RP-04/T-RP-10，也不激活RP13-T03。
