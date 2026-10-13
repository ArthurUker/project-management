-- 样本库检测靶标字段（v1.7，2026-10-12）
-- 来源：研发总表 20210701 / 20211203 的「引物质粒对应表」（质粒 ↔ 检测项目 ↔ 对应靶标）。
-- 与 Primer.targetGene 同模式（文本，多靶标逗号分隔）；数据由应用层脚本按名称匹配回填。

ALTER TABLE "sample_materials" ADD COLUMN "target_gene" VARCHAR(512);
