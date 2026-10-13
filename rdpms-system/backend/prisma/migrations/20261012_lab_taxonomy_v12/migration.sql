-- 实验室台账 v1.2：引物探针库存归位 + 样本库位字段
-- 背景（2026-10-12，用户确认）：v1.1 导入时因 primers 表 sequence 必填且无库存字段，
-- 引物探针/质粒/菌株/样本被临时落在 reagent_materials（按 category 标签区分），
-- 与「引物探针库 / 样本库」的界面语义不符。本次迁移补齐承载结构，数据搬迁由应用层脚本执行。
--
-- 本迁移只包含结构变更：
--   1. primers.sequence 改为可空（库存引物没有序列，序列待补充）；
--   2. 新增 primer_lots 表（引物/探针库存批次：位置/数量/规格/管数/开封状态/批号/形态），
--      复用 storage_locations 库位树；
--   3. sample_materials 增加 location_id / location（复用库位树，承接质粒/菌株/样本位置）。
--
-- 注：数据搬迁（reagent_materials → primers/primer_lots、sample_materials，原记录软删）
--     在迁移后的应用层脚本中进行，不写在本迁移内。

-- ── primers.sequence 可空 ────────────────────────────────────────────────────
ALTER TABLE "primers" ALTER COLUMN "sequence" DROP NOT NULL;

-- ── 新表：引物/探针库存批次 ──────────────────────────────────────────────────
CREATE TABLE "primer_lots" (
    "id" TEXT NOT NULL,
    "primer_id" TEXT NOT NULL,
    "lot_no" VARCHAR(64) NOT NULL,
    "quantity" DECIMAL(14,4),
    "unit" VARCHAR(16) NOT NULL DEFAULT '未标注',
    "spec" VARCHAR(128),
    "container_count" DECIMAL(10,2),
    "opened_status" "OpenedStatus",
    "form" VARCHAR(64),
    "location_id" TEXT,
    "location" VARCHAR(128),
    "supplier" VARCHAR(255),
    "received_at" DATE,
    "notes" TEXT,
    "status" "LotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "primer_lots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "primer_lots_primer_id_lot_no_key" ON "primer_lots"("primer_id", "lot_no");
CREATE INDEX "primer_lots_location_id_idx" ON "primer_lots"("location_id");
CREATE INDEX "primer_lots_status_idx" ON "primer_lots"("status");

ALTER TABLE "primer_lots" ADD CONSTRAINT "primer_lots_primer_id_fkey"
  FOREIGN KEY ("primer_id") REFERENCES "primers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "primer_lots" ADD CONSTRAINT "primer_lots_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── sample_materials 增加库位 ────────────────────────────────────────────────
ALTER TABLE "sample_materials"
  ADD COLUMN "location_id" TEXT,
  ADD COLUMN "location" VARCHAR(128);

CREATE INDEX "sample_materials_location_id_idx" ON "sample_materials"("location_id");

ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
