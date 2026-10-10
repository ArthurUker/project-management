-- 归档备份产物登记（backend/src/platform/backup/archive.ts）
--
-- 口径：文件系统为准、DB 标记登记状态。
--   - status='ok'     有产物文件（dir_path/aes_path/meta_path 指向归档根内相对路径）
--   - status='failed' 只有失败留痕，没有文件（dir_path 为空串）
-- 保留策略（retention.ts）只删除有登记行的产物目录，未登记目录一律跳过。
CREATE TABLE "backup_archives" (
    "id" TEXT NOT NULL,
    "job_id" VARCHAR(64) NOT NULL,
    "run_type" VARCHAR(24) NOT NULL DEFAULT 'manual',
    "scope" VARCHAR(24) NOT NULL DEFAULT 'all',
    "status" VARCHAR(16) NOT NULL DEFAULT 'ok',
    "verify_status" VARCHAR(16) NOT NULL DEFAULT 'unknown',
    "dir_path" VARCHAR(512) NOT NULL,
    "aes_path" VARCHAR(512) NOT NULL,
    "meta_path" VARCHAR(512) NOT NULL,
    "file_size" BIGINT NOT NULL,
    "plain_size" BIGINT,
    "checksum" CHAR(64),
    "algorithm" VARCHAR(32) NOT NULL DEFAULT 'aes-256-gcm',
    "key_mode" VARCHAR(32) NOT NULL DEFAULT 'local',
    "compression" VARCHAR(40) NOT NULL DEFAULT 'pg_dump -Fc -Z6',
    "snapshot_mode" VARCHAR(16) NOT NULL DEFAULT 'live',
    "table_counts" JSONB NOT NULL,
    "schema_snapshot" JSONB,
    "counts_cross_check" JSONB,
    "table_count" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "failure_code" VARCHAR(64),
    "failure_detail" VARCHAR(1000),
    "created_by_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ(3),
    CONSTRAINT "backup_archives_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "backup_archives_job_id_key" ON "backup_archives"("job_id");
CREATE INDEX "backup_archives_created_at_idx" ON "backup_archives"("created_at");
CREATE INDEX "backup_archives_status_created_at_idx" ON "backup_archives"("status", "created_at");
