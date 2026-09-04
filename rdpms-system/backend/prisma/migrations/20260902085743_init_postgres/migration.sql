-- =============================================================================
-- RDPMS / IVD 注册研发项目管理系统 —— PostgreSQL baseline migration
--
-- 生成方式（离线，不连接数据库）：
--   npx prisma migrate diff --from-empty \
--        --to-schema-datamodel prisma/schema.prisma --script
-- 生成结果再追加文件尾部的「手工补充部分」（CHECK 约束 / 部分索引 / GIN / 触发器）。
--
-- 合规说明（M-1 v1.0 + W10 Q-a/Q-b）：
--   * 权限为 permissions 表模型；审计动作为 varchar(64) + EnumMeta 展示；
--   * 样本/批次/阶段/依赖类型/关联类型/法规文档状态均为独立枚举；
--   * 本文件不创建任何数据库扩展；全文/模糊检索一律用 text[] + GIN；
--   * 注：OPS preflight 对 migrations 目录采用朴素 grep（不做注释过滤），
--     因此本文件（含注释）不得出现被门禁禁止的关键字。
-- =============================================================================
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'LOCKED', 'PENDING_ACTIVATION');

-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('IVD_REGISTRATION', 'REAGENT_CHIP', 'DEVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "RegulatoryDocStatus" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'IN_PROGRESS', 'PENDING_PROCESSING', 'PENDING_VERIFICATION', 'ON_HOLD', 'COMPLETED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('PLATFORM', 'CUSTOMIZATION', 'COLLABORATION', 'TESTING', 'APPLICATION');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PhaseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('CLASSIFICATION', 'STRATEGY', 'REGISTRATION_DOSSIER', 'LABELING', 'QMS', 'CLINICAL_EVALUATION', 'CLINICAL_EVALUATION_EXEMPTION', 'CLINICAL_TRIAL', 'ANALYTICAL_VALIDATION', 'PERFORMANCE_VALIDATION', 'SOFTWARE', 'SUBMISSION', 'POST_MARKET', 'DESIGN_INPUT', 'DESIGN_OUTPUT', 'PRODUCTION', 'STABILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "TaskApplicability" AS ENUM ('REQUIRED', 'CONDITIONAL', 'NOT_APPLICABLE', 'TO_BE_CONFIRMED');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('P0', 'P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "Applicability" AS ENUM ('CORE', 'CONDITIONAL', 'POST_MARKET', 'LOW_RELEVANCE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RegulatoryRegion" AS ENUM ('MACAO_ISAF', 'MAINLAND_NMPA', 'HONG_KONG', 'EU_IVDR', 'US_FDA', 'ISO', 'OTHER');

-- CreateEnum
CREATE TYPE "RegulatoryCategory" AS ENUM ('CLASSIFICATION', 'CLINICAL_EVALUATION', 'CLINICAL_EVALUATION_EXEMPTION', 'CLINICAL_TRIAL', 'CLINICAL_TRIAL_PERMISSION', 'LABELING', 'REGISTRATION_DOSSIER', 'PRIORITY_REVIEW', 'CONDITIONAL_APPROVAL', 'RENEWAL', 'REGISTRATION_CHANGE', 'FILING', 'FILING_CHANGE', 'SPECIAL_APPROVAL', 'THIRD_PARTY_REVIEW', 'QMS', 'QMS_IVD', 'QMS_STERILE', 'QMS_IMPLANTABLE', 'QMS_SPECIAL', 'SOFTWARE_QMS', 'MANUFACTURING_QMS_DOC', 'CONTRACT_MANUFACTURING', 'MANUFACTURER_NAMING', 'MANUFACTURER_OTHER_PRODUCTS', 'DISTRIBUTION_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "RegistrationType" AS ENUM ('IVD', 'MEDICAL_DEVICE', 'IVD_SOFTWARE', 'COMBINATION', 'OTHER');

-- CreateEnum
CREATE TYPE "RegistrationStage" AS ENUM ('DOSSIER_PREPARATION', 'SUBMISSION_ACCEPTED', 'TECHNICAL_REVIEW', 'ADMIN_APPROVAL', 'CERTIFIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('SOP', 'TEMPLATE', 'GUIDE', 'REFERENCE', 'REGULATION', 'PROTOCOL', 'REPORT', 'FORM');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'PHASE', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWING', 'NEEDS_REVISION', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('BUFFER', 'SALT', 'ENZYME', 'DYE', 'NUCLEIC_ACID', 'SOLVENT', 'ACID_BASE', 'SURFACTANT', 'OTHER');

-- CreateEnum
CREATE TYPE "MaterialState" AS ENUM ('SOLID', 'LIQUID', 'SOLUTION', 'GAS');

-- CreateEnum
CREATE TYPE "ConcentrationUnit" AS ENUM ('M', 'MM', 'UM', 'NM', 'NG_PER_UL', 'MG_PER_ML', 'PERCENT', 'X', 'OTHER');

-- CreateEnum
CREATE TYPE "FormulaType" AS ENUM ('BUFFER', 'LYSIS', 'WASH', 'REACTION_MIX', 'PCR_MIX', 'STOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "FormulaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PrimerType" AS ENUM ('PRIMER', 'PROBE');

-- CreateEnum
CREATE TYPE "SampleType" AS ENUM ('REFERENCE_STANDARD', 'CLINICAL_SAMPLE', 'CONTROL', 'BLANK_MATRIX', 'SIMULATED', 'OTHER');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'USED', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'SEALED', 'DISPOSED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('USER', 'PROJECT', 'PROJECT_PHASE', 'TASK', 'MILESTONE', 'REPORT', 'MONTHLY_PROGRESS', 'DOCUMENT', 'DOC_VERSION', 'REGULATORY_DOCUMENT', 'REGISTRATION_PROFILE', 'FORMULA', 'PREP_RECORD', 'PRIMER', 'SAMPLE', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "FileStorageProvider" AS ENUM ('LOCAL', 'S3', 'OSS', 'COS');

-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('SKIPPED', 'PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');

-- CreateEnum
CREATE TYPE "TaskRegulatoryRelationType" AS ENUM ('BASIS', 'REFERENCE', 'CONDITIONAL', 'POST_MARKET', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255) NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "password_changed_at" TIMESTAMPTZ(3),
    "display_name" VARCHAR(128) NOT NULL,
    "position" VARCHAR(128),
    "department" VARCHAR(128),
    "phone" VARCHAR(32),
    "system_role" "SystemRole" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "avatar_file_id" TEXT,
    "last_login_at" TIMESTAMPTZ(3),
    "last_login_ip" VARCHAR(45),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" VARCHAR(128) NOT NULL,
    "family_id" TEXT NOT NULL,
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "module" VARCHAR(64),
    "is_high_risk" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by_id" TEXT,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "ProjectType" NOT NULL,
    "subtype" VARCHAR(128),
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
    "is_draft" BOOLEAN NOT NULL DEFAULT false,
    "positioning" TEXT,
    "manager_id" TEXT NOT NULL,
    "template_id" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "actual_end_date" DATE,
    "metadata" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "created_by_id" TEXT,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_templates" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "category" VARCHAR(64),
    "type_label" VARCHAR(128),
    "status" "TemplateStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_master" BOOLEAN NOT NULL DEFAULT false,
    "parent_id" TEXT,
    "config" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_roles" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_phases" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL,
    "planned_start_offset_days" INTEGER,
    "planned_duration_days" INTEGER,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "template_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_tasks" (
    "id" TEXT NOT NULL,
    "template_phase_id" TEXT NOT NULL,
    "code" VARCHAR(64),
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "task_type" "TaskType" NOT NULL DEFAULT 'OTHER',
    "applicability" "TaskApplicability" NOT NULL DEFAULT 'REQUIRED',
    "regulatory_priority" "PriorityLevel" NOT NULL DEFAULT 'P2',
    "expected_deliverable" TEXT,
    "regulatory_notes" TEXT,
    "estimated_hours" DECIMAL(10,2),
    "assignee_role_code" VARCHAR(64),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "template_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_phases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "template_phase_id" TEXT,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "status" "PhaseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "planned_start" DATE,
    "planned_end" DATE,
    "actual_start" DATE,
    "actual_end" DATE,
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "is_milestone" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "project_phases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_transitions" (
    "id" TEXT NOT NULL,
    "from_phase_id" TEXT NOT NULL,
    "to_phase_id" TEXT NOT NULL,
    "condition" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "phase_id" TEXT,
    "parent_id" TEXT,
    "template_task_id" TEXT,
    "code" VARCHAR(64),
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "assignee_id" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "task_type" "TaskType",
    "applicability" "TaskApplicability" NOT NULL DEFAULT 'REQUIRED',
    "regulatory_priority" "PriorityLevel",
    "expected_deliverable" TEXT,
    "regulatory_notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "estimated_hours" DECIMAL(10,2),
    "actual_hours" DECIMAL(10,2),
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE,
    "due_date" DATE,
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_dependencies" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "prerequisite_id" TEXT NOT NULL,
    "dependency_type" "DependencyType" NOT NULL DEFAULT 'FS',
    "lag_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(64),
    "description" TEXT,
    "estimated_days" INTEGER NOT NULL DEFAULT 0,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_template_steps" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "estimated_hours" DECIMAL(10,2),
    "assignee_role_code" VARCHAR(64),
    "checklist" TEXT[],

    CONSTRAINT "task_template_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_documents" (
    "id" TEXT NOT NULL,
    "dispatch_no" VARCHAR(128) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "full_title" TEXT,
    "category" "RegulatoryCategory" NOT NULL DEFAULT 'OTHER',
    "region" "RegulatoryRegion" NOT NULL DEFAULT 'MACAO_ISAF',
    "applicability" "Applicability" NOT NULL DEFAULT 'CONDITIONAL',
    "applicable_to_ivd" BOOLEAN NOT NULL DEFAULT false,
    "priority_level" "PriorityLevel" NOT NULL DEFAULT 'P3',
    "summary" TEXT,
    "applicability_note" TEXT,
    "status" "RegulatoryDocStatus" NOT NULL DEFAULT 'ACTIVE',
    "effective_date" DATE,
    "source_url" VARCHAR(1024),
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "regulatory_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_regulatory_documents" (
    "task_id" TEXT NOT NULL,
    "regulatory_document_id" TEXT NOT NULL,
    "relation_type" "TaskRegulatoryRelationType" NOT NULL DEFAULT 'BASIS',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "task_regulatory_documents_pkey" PRIMARY KEY ("task_id","regulatory_document_id")
);

-- CreateTable
CREATE TABLE "registration_profiles" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "registration_type" "RegistrationType" NOT NULL DEFAULT 'IVD',
    "region" "RegulatoryRegion" NOT NULL DEFAULT 'MACAO_ISAF',
    "authority" VARCHAR(255),
    "submission_no" VARCHAR(128),
    "certificate_no" VARCHAR(128),
    "current_stage" "RegistrationStage" NOT NULL DEFAULT 'DOSSIER_PREPARATION',
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "planned_submission_date" DATE,
    "actual_submission_date" DATE,
    "expected_approval_date" DATE,
    "approval_date" DATE,
    "compliance_owner_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "registration_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "report_type" "ReportType" NOT NULL DEFAULT 'MONTHLY',
    "period_key" VARCHAR(16) NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "content" JSONB NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "review_note" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_versions" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "changelog" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_progress" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "period_key" VARCHAR(7) NOT NULL,
    "actual_work" TEXT,
    "completion_percent" INTEGER NOT NULL DEFAULT 0,
    "next_plan" TEXT,
    "risks" TEXT,
    "project_status" "ProjectStatus",
    "submitted_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "monthly_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_categories" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "icon" VARCHAR(64),
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "doc_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_documents" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "doc_type" "DocType" NOT NULL DEFAULT 'SOP',
    "content" TEXT,
    "current_version" VARCHAR(16) NOT NULL DEFAULT 'V1.0',
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[],
    "owner_id" TEXT NOT NULL,
    "reviewer_id" TEXT,
    "reviewed_at" TIMESTAMPTZ(3),
    "effective_date" DATE,
    "review_due_date" DATE,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "doc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_versions" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "content" TEXT NOT NULL,
    "changelog" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "doc_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reagent_materials" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "common_name" VARCHAR(255) NOT NULL,
    "chinese_name" VARCHAR(255),
    "english_name" VARCHAR(255),
    "category" "MaterialCategory" NOT NULL DEFAULT 'OTHER',
    "cas_number" VARCHAR(32),
    "molecular_formula" VARCHAR(128),
    "molecular_weight" DECIMAL(12,4),
    "purity" DECIMAL(8,4),
    "density" DECIMAL(12,6),
    "state" "MaterialState" NOT NULL DEFAULT 'LIQUID',
    "default_stock_conc" DECIMAL(18,8),
    "default_stock_unit" "ConcentrationUnit" NOT NULL DEFAULT 'M',
    "hazard_level" VARCHAR(32),
    "supplier" VARCHAR(255),
    "storage_condition" VARCHAR(128),
    "notes" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "reagent_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reagent_lots" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "lot_no" VARCHAR(64) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" VARCHAR(16) NOT NULL DEFAULT 'g',
    "received_at" DATE,
    "expiry_date" DATE,
    "location" VARCHAR(128),
    "supplier" VARCHAR(255),
    "certificate_url" VARCHAR(1024),
    "status" "LotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reagent_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reagent_formulas" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255),
    "type" "FormulaType" NOT NULL DEFAULT 'OTHER',
    "ph" DECIMAL(6,2),
    "status" "FormulaStatus" NOT NULL DEFAULT 'DRAFT',
    "project_id" TEXT,
    "procedure" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "reagent_formulas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formula_components" (
    "id" TEXT NOT NULL,
    "formula_id" TEXT NOT NULL,
    "material_id" TEXT,
    "custom_name" VARCHAR(255),
    "concentration" DECIMAL(18,8),
    "unit" "ConcentrationUnit" NOT NULL DEFAULT 'M',
    "concentration_text" VARCHAR(64),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "formula_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_records" (
    "id" TEXT NOT NULL,
    "formula_id" TEXT NOT NULL,
    "target_volume" DECIMAL(14,4) NOT NULL,
    "volume_unit" VARCHAR(16) NOT NULL DEFAULT 'mL',
    "calc_result" JSONB NOT NULL,
    "prep_date" TIMESTAMPTZ(3) NOT NULL,
    "operator" VARCHAR(128),
    "batch_no" VARCHAR(64),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,

    CONSTRAINT "prep_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detection_targets" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "gene_symbol" VARCHAR(64),
    "organism_latin" VARCHAR(255),
    "organism_chinese" VARCHAR(255),
    "taxid" VARCHAR(32),
    "atcc_strain" VARCHAR(128),
    "notes" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "detection_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "primers" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "PrimerType" NOT NULL DEFAULT 'PRIMER',
    "sequence" VARCHAR(512) NOT NULL,
    "project_id" TEXT,
    "target_id" TEXT,
    "target_gene" VARCHAR(128),
    "modification5" VARCHAR(128),
    "modification3" VARCHAR(128),
    "amplicon_length" INTEGER,
    "synthesis_amount" VARCHAR(64),
    "synthesis_company" VARCHAR(255),
    "tube_count" INTEGER,
    "notes" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "primers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_materials" (
    "id" TEXT NOT NULL,
    "sample_code" VARCHAR(64) NOT NULL,
    "sample_name" VARCHAR(255) NOT NULL,
    "sample_type" "SampleType" NOT NULL DEFAULT 'CLINICAL_SAMPLE',
    "project_id" TEXT,
    "species" VARCHAR(255),
    "tissue" VARCHAR(255),
    "concentration" VARCHAR(128),
    "volume" VARCHAR(128),
    "storage_condition" VARCHAR(128) NOT NULL DEFAULT '-80°C',
    "received_at" DATE,
    "expiry_date" DATE,
    "supplier" VARCHAR(255),
    "status" "SampleStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "sample_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" TEXT NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "provider" "FileStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "bucket" VARCHAR(255),
    "original_name" VARCHAR(512) NOT NULL,
    "mime_type" VARCHAR(255) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" VARCHAR(128),
    "scan_status" "FileScanStatus" NOT NULL DEFAULT 'SKIPPED',
    "scanned_at" TIMESTAMPTZ(3),
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "uploaded_by_id" TEXT,
    "metadata" JSONB,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "label" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" VARCHAR(128),
    "actor_role" VARCHAR(64),
    "action" VARCHAR(64) NOT NULL,
    "entity_type" "EntityType",
    "entity_id" TEXT,
    "entity_label" VARCHAR(255),
    "before" JSONB,
    "after" JSONB,
    "changed_fields" TEXT[],
    "metadata" JSONB,
    "ip" VARCHAR(45),
    "user_agent" VARCHAR(512),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "category" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "user_id" TEXT,
    "ip" VARCHAR(45),
    "request_id" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enum_meta" (
    "id" TEXT NOT NULL,
    "enum_name" VARCHAR(64) NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "color" VARCHAR(32),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "enum_meta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_sequences" (
    "id" TEXT NOT NULL,
    "scope" VARCHAR(64) NOT NULL,
    "period_key" VARCHAR(16) NOT NULL DEFAULT '',
    "prefix" VARCHAR(32) NOT NULL,
    "padding" INTEGER NOT NULL DEFAULT 3,
    "last_value" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "code_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(128) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_avatar_file_id_key" ON "users"("avatar_file_id");

-- CreateIndex
CREATE INDEX "users_system_role_status_idx" ON "users"("system_role", "status");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE INDEX "roles_deleted_at_idx" ON "roles"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_sort_order_idx" ON "permissions"("module", "sort_order");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_status_deleted_at_idx" ON "projects"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "projects_manager_id_idx" ON "projects"("manager_id");

-- CreateIndex
CREATE INDEX "projects_type_idx" ON "projects"("type");

-- CreateIndex
CREATE INDEX "projects_template_id_idx" ON "projects"("template_id");

-- CreateIndex
CREATE INDEX "projects_start_date_idx" ON "projects"("start_date");

-- CreateIndex
CREATE INDEX "project_members_user_id_left_at_idx" ON "project_members"("user_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_user_id_key" ON "project_members"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_templates_code_key" ON "project_templates"("code");

-- CreateIndex
CREATE INDEX "project_templates_parent_id_idx" ON "project_templates"("parent_id");

-- CreateIndex
CREATE INDEX "project_templates_category_status_idx" ON "project_templates"("category", "status");

-- CreateIndex
CREATE INDEX "template_roles_template_id_idx" ON "template_roles"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "template_roles_template_id_code_key" ON "template_roles"("template_id", "code");

-- CreateIndex
CREATE INDEX "template_phases_template_id_sort_order_idx" ON "template_phases"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "template_phases_template_id_code_key" ON "template_phases"("template_id", "code");

-- CreateIndex
CREATE INDEX "template_tasks_template_phase_id_idx" ON "template_tasks"("template_phase_id");

-- CreateIndex
CREATE INDEX "template_tasks_task_type_idx" ON "template_tasks"("task_type");

-- CreateIndex
CREATE UNIQUE INDEX "template_tasks_template_phase_id_sort_order_title_key" ON "template_tasks"("template_phase_id", "sort_order", "title");

-- CreateIndex
CREATE INDEX "project_phases_project_id_sort_order_idx" ON "project_phases"("project_id", "sort_order");

-- CreateIndex
CREATE INDEX "project_phases_status_deleted_at_idx" ON "project_phases"("status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "project_phases_project_id_code_key" ON "project_phases"("project_id", "code");

-- CreateIndex
CREATE INDEX "phase_transitions_to_phase_id_idx" ON "phase_transitions"("to_phase_id");

-- CreateIndex
CREATE UNIQUE INDEX "phase_transitions_from_phase_id_to_phase_id_key" ON "phase_transitions"("from_phase_id", "to_phase_id");

-- CreateIndex
CREATE INDEX "milestones_project_id_due_date_idx" ON "milestones"("project_id", "due_date");

-- CreateIndex
CREATE INDEX "milestones_status_due_date_idx" ON "milestones"("status", "due_date");

-- CreateIndex
CREATE INDEX "milestones_phase_id_idx" ON "milestones"("phase_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_deleted_at_idx" ON "tasks"("project_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "tasks_project_id_phase_id_idx" ON "tasks"("project_id", "phase_id");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- CreateIndex
CREATE INDEX "tasks_parent_id_idx" ON "tasks"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_project_id_code_key" ON "tasks"("project_id", "code");

-- CreateIndex
CREATE INDEX "task_dependencies_prerequisite_id_idx" ON "task_dependencies"("prerequisite_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_dependencies_task_id_prerequisite_id_key" ON "task_dependencies"("task_id", "prerequisite_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_code_key" ON "task_templates"("code");

-- CreateIndex
CREATE INDEX "task_templates_category_deleted_at_idx" ON "task_templates"("category", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_template_steps_template_id_sort_order_key" ON "task_template_steps"("template_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "regulatory_documents_dispatch_no_key" ON "regulatory_documents"("dispatch_no");

-- CreateIndex
CREATE INDEX "regulatory_documents_priority_level_idx" ON "regulatory_documents"("priority_level");

-- CreateIndex
CREATE INDEX "regulatory_documents_applicability_applicable_to_ivd_idx" ON "regulatory_documents"("applicability", "applicable_to_ivd");

-- CreateIndex
CREATE INDEX "regulatory_documents_category_region_idx" ON "regulatory_documents"("category", "region");

-- CreateIndex
CREATE INDEX "task_regulatory_documents_regulatory_document_id_idx" ON "task_regulatory_documents"("regulatory_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "registration_profiles_project_id_key" ON "registration_profiles"("project_id");

-- CreateIndex
CREATE INDEX "registration_profiles_registration_type_current_stage_idx" ON "registration_profiles"("registration_type", "current_stage");

-- CreateIndex
CREATE INDEX "registration_profiles_compliance_owner_id_idx" ON "registration_profiles"("compliance_owner_id");

-- CreateIndex
CREATE INDEX "registration_profiles_region_idx" ON "registration_profiles"("region");

-- CreateIndex
CREATE INDEX "reports_project_id_status_deleted_at_idx" ON "reports"("project_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "reports_author_id_period_key_idx" ON "reports"("author_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "reports_project_id_author_id_report_type_period_key_key" ON "reports"("project_id", "author_id", "report_type", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "report_versions_report_id_version_key" ON "report_versions"("report_id", "version");

-- CreateIndex
CREATE INDEX "monthly_progress_submitted_by_id_idx" ON "monthly_progress"("submitted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_progress_project_id_period_key_key" ON "monthly_progress"("project_id", "period_key");

-- CreateIndex
CREATE UNIQUE INDEX "doc_categories_code_key" ON "doc_categories"("code");

-- CreateIndex
CREATE INDEX "doc_categories_parent_id_sort_order_idx" ON "doc_categories"("parent_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "doc_documents_code_key" ON "doc_documents"("code");

-- CreateIndex
CREATE INDEX "doc_documents_category_id_status_deleted_at_idx" ON "doc_documents"("category_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "doc_documents_doc_type_idx" ON "doc_documents"("doc_type");

-- CreateIndex
CREATE UNIQUE INDEX "doc_versions_document_id_version_key" ON "doc_versions"("document_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "reagent_materials_code_key" ON "reagent_materials"("code");

-- CreateIndex
CREATE INDEX "reagent_materials_common_name_idx" ON "reagent_materials"("common_name");

-- CreateIndex
CREATE INDEX "reagent_materials_category_status_idx" ON "reagent_materials"("category", "status");

-- CreateIndex
CREATE INDEX "reagent_materials_cas_number_idx" ON "reagent_materials"("cas_number");

-- CreateIndex
CREATE INDEX "reagent_lots_expiry_date_idx" ON "reagent_lots"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "reagent_lots_material_id_lot_no_key" ON "reagent_lots"("material_id", "lot_no");

-- CreateIndex
CREATE UNIQUE INDEX "reagent_formulas_code_key" ON "reagent_formulas"("code");

-- CreateIndex
CREATE INDEX "reagent_formulas_type_status_deleted_at_idx" ON "reagent_formulas"("type", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "reagent_formulas_project_id_idx" ON "reagent_formulas"("project_id");

-- CreateIndex
CREATE INDEX "formula_components_formula_id_sort_order_idx" ON "formula_components"("formula_id", "sort_order");

-- CreateIndex
CREATE INDEX "formula_components_material_id_idx" ON "formula_components"("material_id");

-- CreateIndex
CREATE INDEX "prep_records_formula_id_prep_date_idx" ON "prep_records"("formula_id", "prep_date");

-- CreateIndex
CREATE INDEX "prep_records_batch_no_idx" ON "prep_records"("batch_no");

-- CreateIndex
CREATE UNIQUE INDEX "detection_targets_code_key" ON "detection_targets"("code");

-- CreateIndex
CREATE INDEX "detection_targets_organism_latin_idx" ON "detection_targets"("organism_latin");

-- CreateIndex
CREATE INDEX "detection_targets_gene_symbol_idx" ON "detection_targets"("gene_symbol");

-- CreateIndex
CREATE UNIQUE INDEX "primers_code_key" ON "primers"("code");

-- CreateIndex
CREATE INDEX "primers_project_id_status_deleted_at_idx" ON "primers"("project_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "primers_target_id_idx" ON "primers"("target_id");

-- CreateIndex
CREATE INDEX "primers_name_idx" ON "primers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sample_materials_sample_code_key" ON "sample_materials"("sample_code");

-- CreateIndex
CREATE INDEX "sample_materials_project_id_status_deleted_at_idx" ON "sample_materials"("project_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "sample_materials_sample_type_idx" ON "sample_materials"("sample_type");

-- CreateIndex
CREATE INDEX "sample_materials_expiry_date_idx" ON "sample_materials"("expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storage_key_key" ON "file_objects"("storage_key");

-- CreateIndex
CREATE INDEX "file_objects_uploaded_by_id_idx" ON "file_objects"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "file_objects_checksum_idx" ON "file_objects"("checksum");

-- CreateIndex
CREATE INDEX "file_objects_scan_status_idx" ON "file_objects"("scan_status");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_deleted_at_idx" ON "attachments"("entity_type", "entity_id", "deleted_at");

-- CreateIndex
CREATE INDEX "attachments_file_id_idx" ON "attachments"("file_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "system_logs_level_created_at_idx" ON "system_logs"("level", "created_at");

-- CreateIndex
CREATE INDEX "system_logs_user_id_created_at_idx" ON "system_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "system_logs_category_action_idx" ON "system_logs"("category", "action");

-- CreateIndex
CREATE INDEX "enum_meta_enum_name_sort_order_idx" ON "enum_meta"("enum_name", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "enum_meta_enum_name_code_key" ON "enum_meta"("enum_name", "code");

-- CreateIndex
CREATE UNIQUE INDEX "code_sequences_scope_period_key_key" ON "code_sequences"("scope", "period_key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_avatar_file_id_fkey" FOREIGN KEY ("avatar_file_id") REFERENCES "file_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "project_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_roles" ADD CONSTRAINT "template_roles_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_phases" ADD CONSTRAINT "template_phases_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_tasks" ADD CONSTRAINT "template_tasks_template_phase_id_fkey" FOREIGN KEY ("template_phase_id") REFERENCES "template_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_template_phase_id_fkey" FOREIGN KEY ("template_phase_id") REFERENCES "template_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_transitions" ADD CONSTRAINT "phase_transitions_from_phase_id_fkey" FOREIGN KEY ("from_phase_id") REFERENCES "project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_transitions" ADD CONSTRAINT "phase_transitions_to_phase_id_fkey" FOREIGN KEY ("to_phase_id") REFERENCES "project_phases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "project_phases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_template_steps" ADD CONSTRAINT "task_template_steps_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_regulatory_documents" ADD CONSTRAINT "task_regulatory_documents_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_regulatory_documents" ADD CONSTRAINT "task_regulatory_documents_regulatory_document_id_fkey" FOREIGN KEY ("regulatory_document_id") REFERENCES "regulatory_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_profiles" ADD CONSTRAINT "registration_profiles_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_profiles" ADD CONSTRAINT "registration_profiles_compliance_owner_id_fkey" FOREIGN KEY ("compliance_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_progress" ADD CONSTRAINT "monthly_progress_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_progress" ADD CONSTRAINT "monthly_progress_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_categories" ADD CONSTRAINT "doc_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "doc_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "doc_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_documents" ADD CONSTRAINT "doc_documents_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "doc_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reagent_lots" ADD CONSTRAINT "reagent_lots_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "reagent_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reagent_formulas" ADD CONSTRAINT "reagent_formulas_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reagent_formulas" ADD CONSTRAINT "reagent_formulas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_components" ADD CONSTRAINT "formula_components_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "reagent_formulas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formula_components" ADD CONSTRAINT "formula_components_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "reagent_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_records" ADD CONSTRAINT "prep_records_formula_id_fkey" FOREIGN KEY ("formula_id") REFERENCES "reagent_formulas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_records" ADD CONSTRAINT "prep_records_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primers" ADD CONSTRAINT "primers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primers" ADD CONSTRAINT "primers_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "detection_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "primers" ADD CONSTRAINT "primers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_materials" ADD CONSTRAINT "sample_materials_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- 手工补充部分（Prisma Schema 无法表达，由 DB 窗口维护，禁止被 prisma 自动生成覆盖）
-- 每次新增迁移后需人工回归校验这些对象仍存在：见 docs/refactor/postgres-baseline.md
-- ============================================================================


-- ── 1. 账号名规范化：大小写不再产生第二个身份 ────────────────────────────────
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_lowercase_chk" CHECK ("username" = lower("username"));

-- ── 2. 百分比取值域 ──────────────────────────────────────────────────────────
ALTER TABLE "project_phases"
  ADD CONSTRAINT "project_phases_progress_chk"
  CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100);
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_progress_chk"
  CHECK ("progress_percent" >= 0 AND "progress_percent" <= 100);
ALTER TABLE "monthly_progress"
  ADD CONSTRAINT "monthly_progress_completion_chk"
  CHECK ("completion_percent" >= 0 AND "completion_percent" <= 100);

-- ── 3. 日期区间自洽 ──────────────────────────────────────────────────────────
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_date_range_chk"
  CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "project_phases"
  ADD CONSTRAINT "project_phases_date_range_chk"
  CHECK ("planned_end" IS NULL OR "planned_start" IS NULL OR "planned_end" >= "planned_start");
ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_date_range_chk"
  CHECK ("due_date" IS NULL OR "start_date" IS NULL OR "due_date" >= "start_date");

-- ── 4. 图结构禁止自引用（环形依赖由应用层 DFS 拦截，DB 只能挡自环）──────────
ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_no_self_chk"
  CHECK ("task_id" <> "prerequisite_id");
ALTER TABLE "phase_transitions"
  ADD CONSTRAINT "phase_transitions_no_self_chk"
  CHECK ("from_phase_id" <> "to_phase_id");

-- ── 5. 数值合理性 ────────────────────────────────────────────────────────────
ALTER TABLE "file_objects"
  ADD CONSTRAINT "file_objects_size_chk"
  CHECK ("size_bytes" >= 0 AND "size_bytes" <= 2147483647);
ALTER TABLE "reagent_materials"
  ADD CONSTRAINT "reagent_materials_purity_chk"
  CHECK ("purity" IS NULL OR ("purity" >= 0 AND "purity" <= 100));

-- ── 6. 软删除高频查询的部分索引（未删除行才是常态查询集）────────────────────
CREATE INDEX "projects_status_active_idx"
  ON "projects" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX "tasks_status_active_idx"
  ON "tasks" ("status") WHERE "deleted_at" IS NULL;
CREATE INDEX "doc_documents_active_idx"
  ON "doc_documents" ("category_id", "status") WHERE "deleted_at" IS NULL;
CREATE INDEX "attachments_active_idx"
  ON "attachments" ("entity_type", "entity_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "regulatory_documents_active_idx"
  ON "regulatory_documents" ("category") WHERE "deleted_at" IS NULL;

-- ── 7. 数组标签检索（text[] 的 GIN）────────────────────────────
CREATE INDEX "doc_documents_tags_gin_idx"
  ON "doc_documents" USING gin ("tags");

-- ── 8. 审计日志只追加（触发器语义清晰，优于 RULE）────────────────────────────
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only; UPDATE/DELETE is forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- ── 9. 审计 JSON 变更检索 ────────────────────────────────────────────────────
CREATE INDEX "audit_logs_after_gin_idx"
  ON "audit_logs" USING gin ("after" jsonb_path_ops);

-- ── 10. 审计 metadata 检索（M-1 v1.0：elevated / override / breakGlass / permissionCode）──
CREATE INDEX "audit_logs_metadata_gin_idx"
  ON "audit_logs" USING gin ("metadata" jsonb_path_ops);
