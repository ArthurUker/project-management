-- 样本库类型细化（v1.5，2026-10-12）
-- 背景：盘点数据显示质粒/假病毒/菌株/疫苗/生物样本是独立品类，
--       此前被笼统标为 REFERENCE_STANDARD（标准品），导致「明显是质粒却归为标准品」。
-- 本次扩展 SampleType 枚举，由应用层按名称/来源重新分类。

ALTER TYPE "SampleType" ADD VALUE IF NOT EXISTS 'PLASMID';
ALTER TYPE "SampleType" ADD VALUE IF NOT EXISTS 'PSEUDOVIRUS';
ALTER TYPE "SampleType" ADD VALUE IF NOT EXISTS 'STRAIN';
ALTER TYPE "SampleType" ADD VALUE IF NOT EXISTS 'VACCINE';
ALTER TYPE "SampleType" ADD VALUE IF NOT EXISTS 'BIOLOGICAL_SAMPLE';
