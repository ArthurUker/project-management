-- RF05 / F11：文件访问作用域（expand + 可逆回填）
--
-- 目标：文件授权不再只依赖全局 files 权限，而是依据 FileObject 自己的
-- accessScope / ownerUserId / ownerProjectId / sharedReadPermission（唯一依据）。
--
-- 安全默认：新增列默认 PRIVATE_STAGING（= 仅上传人可见）。
-- 历史无归属（既无附件可推导、也无上传者）的记录保持未分类 → **不自动公开**，由超管人工分类。
--
-- 回退方式（可逆）：本迁移只新增列/枚举/索引，不删改任何既有列；
-- 回退 = `ALTER TABLE file_objects DROP COLUMN ...`（见文件末尾的回退脚本注释）。

-- ── 1. Expand ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "FileAccessScope" AS ENUM ('PRIVATE_STAGING', 'PROJECT', 'SHARED_LIBRARY', 'PUBLIC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "file_objects"
  ADD COLUMN IF NOT EXISTS "access_scope" "FileAccessScope" NOT NULL DEFAULT 'PRIVATE_STAGING',
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "owner_project_id" TEXT,
  ADD COLUMN IF NOT EXISTS "shared_read_permission" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "classified_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "classified_by_id" TEXT;

CREATE INDEX IF NOT EXISTS "file_objects_access_scope_owner_project_id_idx"
  ON "file_objects" ("access_scope", "owner_project_id");
CREATE INDEX IF NOT EXISTS "file_objects_access_scope_owner_user_id_idx"
  ON "file_objects" ("access_scope", "owner_user_id");

-- ── 2. 可逆回填（判定依据：附件指向的业务实体；第一条命中的规则胜出）────────────
-- 优先级：PROJECT（项目内实体）> SHARED_LIBRARY（法规原文）> PUBLIC（用户头像）> 保持私有暂存（未分类）
-- 每条 UPDATE 都带 `access_scope = 'PRIVATE_STAGING'` 守卫，保证幂等且先到先得。

-- 2.1 附件指向项目本身
UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = a."entity_id", "classified_at" = now()
FROM "attachments" a
JOIN "projects" p ON p."id" = a."entity_id" AND p."deleted_at" IS NULL
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'PROJECT'
  AND f."access_scope" = 'PRIVATE_STAGING';

-- 2.2 附件指向项目内实体（任务 / 阶段 / 里程碑 / 汇报 / 月度进展）
UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = t."project_id", "classified_at" = now()
FROM "attachments" a
JOIN "tasks" t ON t."id" = a."entity_id" AND t."deleted_at" IS NULL
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'TASK'
  AND f."access_scope" = 'PRIVATE_STAGING';

UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = ph."project_id", "classified_at" = now()
FROM "attachments" a
JOIN "project_phases" ph ON ph."id" = a."entity_id" AND ph."deleted_at" IS NULL
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'PROJECT_PHASE'
  AND f."access_scope" = 'PRIVATE_STAGING';

UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = m."project_id", "classified_at" = now()
FROM "attachments" a
JOIN "milestones" m ON m."id" = a."entity_id" AND m."deleted_at" IS NULL
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'MILESTONE'
  AND f."access_scope" = 'PRIVATE_STAGING';

UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = r."project_id", "classified_at" = now()
FROM "attachments" a
JOIN "reports" r ON r."id" = a."entity_id" AND r."deleted_at" IS NULL
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'REPORT'
  AND f."access_scope" = 'PRIVATE_STAGING';

UPDATE "file_objects" f
SET "access_scope" = 'PROJECT', "owner_project_id" = mp."project_id", "classified_at" = now()
FROM "attachments" a
JOIN "monthly_progress" mp ON mp."id" = a."entity_id"
WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'MONTHLY_PROGRESS'
  AND f."access_scope" = 'PRIVATE_STAGING';

-- 2.3 法规原文：共享库 + 显式声明读权限（不声明权限 = 不共享）
UPDATE "file_objects" f
SET "access_scope" = 'SHARED_LIBRARY',
    "shared_read_permission" = 'regulatory_documents.view',
    "classified_at" = now()
WHERE EXISTS (
  SELECT 1 FROM "attachments" a
  WHERE a."file_id" = f."id" AND a."deleted_at" IS NULL AND a."entity_type" = 'REGULATORY_DOCUMENT'
) AND f."access_scope" = 'PRIVATE_STAGING';

-- 2.4 用户头像：对全部登录用户可见（公共）
UPDATE "file_objects" f
SET "access_scope" = 'PUBLIC', "classified_at" = now()
WHERE EXISTS (SELECT 1 FROM "users" u WHERE u."avatar_file_id" = f."id") 
  AND f."access_scope" = 'PRIVATE_STAGING';

-- 2.5 其余保持 PRIVATE_STAGING 且 classified_at IS NULL = 未分类（不自动公开）
--     未分类清单可用：SELECT id FROM file_objects WHERE access_scope='PRIVATE_STAGING'
--       AND owner_user_id IS NULL AND uploaded_by_id IS NULL AND deleted_at IS NULL;

-- 说明：本次回填不写入 sourceId/migrationRunId（不改业务表结构）；判定依据即上述 SQL 规则，
--      重复执行安全（守卫 access_scope='PRIVATE_STAGING'），并且只新增列，回退不影响既有数据。
--
-- ── 回退脚本（需要时手工执行）────────────────────────────────────────────────
-- DROP INDEX IF EXISTS "file_objects_access_scope_owner_project_id_idx";
-- DROP INDEX IF EXISTS "file_objects_access_scope_owner_user_id_idx";
-- ALTER TABLE "file_objects"
--   DROP COLUMN IF EXISTS "access_scope",
--   DROP COLUMN IF EXISTS "owner_user_id",
--   DROP COLUMN IF EXISTS "owner_project_id",
--   DROP COLUMN IF EXISTS "shared_read_permission",
--   DROP COLUMN IF EXISTS "classified_at",
--   DROP COLUMN IF EXISTS "classified_by_id";
-- DROP TYPE IF EXISTS "FileAccessScope";
