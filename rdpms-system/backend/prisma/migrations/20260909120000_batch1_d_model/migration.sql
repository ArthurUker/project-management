-- 批次一（D 模型补齐）：Tencent 功能复刻承接
-- 对应 schema：TaskDocRef 新表、Primer.validatedStrain
-- 原则：不迁移旧数据（baseline 推倒重建）；本迁移只加结构，不动存量行。

-- D-3：Primer.validatedStrain（验证菌株，引物级，Tencent 语义 1:1 承接）
ALTER TABLE "primers" ADD COLUMN "validated_strain" VARCHAR(128);

-- D-2：任务↔知识库文档引用（Tencent Task.docRefs JSON 字段的结构化承接）
-- CreateTable
CREATE TABLE "task_doc_refs" (
    "task_id" TEXT NOT NULL,
    "doc_document_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "task_doc_refs_pkey" PRIMARY KEY ("task_id","doc_document_id")
);

-- CreateIndex
CREATE INDEX "task_doc_refs_doc_document_id_idx" ON "task_doc_refs"("doc_document_id");

-- AddForeignKey
ALTER TABLE "task_doc_refs" ADD CONSTRAINT "task_doc_refs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_doc_refs" ADD CONSTRAINT "task_doc_refs_doc_document_id_fkey" FOREIGN KEY ("doc_document_id") REFERENCES "doc_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
