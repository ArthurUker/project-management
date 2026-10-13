-- 知识库 v1.3：物料「库子集标签」（2026-10-12）
-- 背景：扩增反应体系试剂（PCR/qPCR/RT-PCR/LAMP）本质是试剂原料，但需在
--       「扩增反应体系试剂」知识库中以表格子集视图展示（与试剂原料库同款表格）。
-- 方案：给 reagent_materials 增加 library_tags（逗号分隔，如 'AMP'），
--       由应用层按该字段筛选；不复用 category（分类是化学语义，用途标签独立）。
--
-- 数据标记（把盘点数据中的 PCR/Master Mix/聚合酶/dNTP 等标为 AMP）由应用层脚本执行。

ALTER TABLE "reagent_materials" ADD COLUMN "library_tags" VARCHAR(128);

CREATE INDEX "reagent_materials_library_tags_idx" ON "reagent_materials"("library_tags");
