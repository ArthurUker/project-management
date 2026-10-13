-- 知识库 v1.4：引物/样本的项目名文本字段（2026-10-12）
-- 背景：盘点数据（引物 914 条、样本 459 条）携带业务项目名（如 "08-消化道_食源性"），
--       但 primers 的历史重构把「文本 projectName」改成了「外键 projectId」，
--       而业务项目名多未登记进 projects 表，导致：
--         1) 归类迁移（v1.2）只能把项目名降级写入备注（notes）；
--         2) 前端「所属项目」列（按 projectName 渲染）无值。
-- 方案：补回文本承载字段（外键保留），由应用层从软删记录 / 备注回填。
--
-- 数据回填（project_name 值）由应用层脚本执行。

ALTER TABLE "primers" ADD COLUMN "project_name" VARCHAR(512);
ALTER TABLE "sample_materials" ADD COLUMN "project_name" VARCHAR(512);
