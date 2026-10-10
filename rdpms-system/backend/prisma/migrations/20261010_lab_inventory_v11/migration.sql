-- 实验室盘点 v1.1：设备台账 + 库位结构化 + 物料/批次/引物扩展
-- 背景（2026-10-10，用户批准全面改造）：8 份盘点表导入后暴露的设计缺口。
--
-- 本迁移只包含本次改动（剔除了 prisma migrate diff 附带的历史 drift 项：
--   audit_logs_after_gin_idx / audit_logs_metadata_gin_idx / doc_documents_tags_gin_idx 的 DROP，
--   sync_change_events 的列默认值变更与索引重命名 —— 均不属于本次范围）。
--
-- 说明：
--   1. MaterialCategory 扩展 7 个业务分类值（引物探针/磁珠/质粒/菌株/培养基/对照品/试剂盒）；
--   2. 新增 OpenedStatus / StorageLocationType / EquipmentStatus 三个枚举；
--   3. reagent_lots 增加 结构化库位/包装规格/管数/开封状态/形态/备注 列；
--   4. reagent_materials 增加 外部编码/项目标签 列；
--   5. primers 增加 荧光通道 列；
--   6. 新增 storage_locations（库位树）与 equipment（设备台账）表。
--
-- 注：PostgreSQL 12+ 允许在事务内 ALTER TYPE ... ADD VALUE；本迁移不写入使用新枚举值的数据
--     （新值的数据回填在迁移后的应用层脚本进行）。

-- ── 枚举 ─────────────────────────────────────────────────────────────────────
CREATE TYPE "OpenedStatus" AS ENUM ('SEALED', 'OPENED');
CREATE TYPE "StorageLocationType" AS ENUM ('ROOM', 'CABINET', 'FRIDGE', 'FREEZER', 'SHELF', 'DRAWER', 'BOX', 'BAG', 'OTHER');
CREATE TYPE "EquipmentStatus" AS ENUM ('IN_USE', 'IDLE', 'REPAIRING', 'SCRAPPED', 'DISPOSED');

ALTER TYPE "MaterialCategory" ADD VALUE 'PRIMER_PROBE';
ALTER TYPE "MaterialCategory" ADD VALUE 'MAGNETIC_BEAD';
ALTER TYPE "MaterialCategory" ADD VALUE 'PLASMID';
ALTER TYPE "MaterialCategory" ADD VALUE 'STRAIN';
ALTER TYPE "MaterialCategory" ADD VALUE 'MEDIA';
ALTER TYPE "MaterialCategory" ADD VALUE 'CONTROL';
ALTER TYPE "MaterialCategory" ADD VALUE 'KIT';

-- ── 列扩展 ───────────────────────────────────────────────────────────────────
ALTER TABLE "primers" ADD COLUMN "fluorescent_channel" VARCHAR(64);

ALTER TABLE "reagent_lots"
  ADD COLUMN "container_count" DECIMAL(14,4),
  ADD COLUMN "form" VARCHAR(64),
  ADD COLUMN "location_id" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "opened_status" "OpenedStatus",
  ADD COLUMN "spec" VARCHAR(255);

ALTER TABLE "reagent_materials"
  ADD COLUMN "external_code" VARCHAR(64),
  ADD COLUMN "project_label" VARCHAR(512);

-- ── 新表：库位树 ──────────────────────────────────────────────────────────────
CREATE TABLE "storage_locations" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "type" "StorageLocationType" NOT NULL DEFAULT 'OTHER',
    "parent_id" TEXT,
    "path" VARCHAR(512) NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "storage_locations_pkey" PRIMARY KEY ("id")
);

-- ── 新表：设备台账 ────────────────────────────────────────────────────────────
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(64),
    "model" VARCHAR(255),
    "manufacturer" VARCHAR(255),
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" VARCHAR(32),
    "location" VARCHAR(255),
    "custodian" VARCHAR(128),
    "start_use_date" DATE,
    "nature" VARCHAR(64),
    "admin_code" VARCHAR(64),
    "orig_code" VARCHAR(64),
    "barcode" VARCHAR(64),
    "status" "EquipmentStatus" NOT NULL DEFAULT 'IN_USE',
    "scrapped" BOOLEAN NOT NULL DEFAULT false,
    "inventory_result" VARCHAR(64),
    "inventory_note" VARCHAR(512),
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- ── 索引 ─────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "storage_locations_code_key" ON "storage_locations"("code");
CREATE INDEX "storage_locations_parent_id_idx" ON "storage_locations"("parent_id");
CREATE INDEX "storage_locations_type_status_idx" ON "storage_locations"("type", "status");

CREATE UNIQUE INDEX "equipment_code_key" ON "equipment"("code");
CREATE INDEX "equipment_category_status_idx" ON "equipment"("category", "status");
CREATE INDEX "equipment_location_idx" ON "equipment"("location");
CREATE INDEX "equipment_name_idx" ON "equipment"("name");

CREATE INDEX "reagent_lots_location_id_idx" ON "reagent_lots"("location_id");
CREATE INDEX "reagent_materials_external_code_idx" ON "reagent_materials"("external_code");

-- ── 外键 ─────────────────────────────────────────────────────────────────────
ALTER TABLE "reagent_lots" ADD CONSTRAINT "reagent_lots_location_id_fkey"
  FOREIGN KEY ("location_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "storage_locations" ADD CONSTRAINT "storage_locations_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "storage_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
