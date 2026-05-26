-- Migration: Add regulatory documents and task regulatory fields for Macau IVD module

-- 1) Add task extension columns
ALTER TABLE "Task" ADD COLUMN "taskType" TEXT;
ALTER TABLE "Task" ADD COLUMN "applicabilityStatus" TEXT DEFAULT 'required';
ALTER TABLE "Task" ADD COLUMN "regulatoryPriority" TEXT DEFAULT 'P2';
ALTER TABLE "Task" ADD COLUMN "expectedDeliverable" TEXT;
ALTER TABLE "Task" ADD COLUMN "regulatoryNotes" TEXT;

-- 2) Regulatory document master table
CREATE TABLE "RegulatoryDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dispatchNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "fullTitle" TEXT,
    "category" TEXT,
    "applicability" TEXT NOT NULL DEFAULT 'conditional',
    "applicableToIvd" BOOLEAN NOT NULL DEFAULT false,
    "priorityLevel" TEXT NOT NULL DEFAULT 'P3',
    "summary" TEXT,
    "applicabilityNote" TEXT,
    "fileName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RegulatoryDocument_dispatchNo_key" UNIQUE ("dispatchNo")
);

-- 3) Task <-> RegulatoryDocument relation table
CREATE TABLE "TaskRegulatoryDocument" (
    "taskId" TEXT NOT NULL,
    "regulatoryDocumentId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'basis',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("taskId", "regulatoryDocumentId"),
    CONSTRAINT "TaskRegulatoryDocument_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaskRegulatoryDocument_regulatoryDocumentId_fkey"
      FOREIGN KEY ("regulatoryDocumentId") REFERENCES "RegulatoryDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 4) Indexes
CREATE INDEX "RegulatoryDocument_priorityLevel_idx" ON "RegulatoryDocument"("priorityLevel");
CREATE INDEX "RegulatoryDocument_applicability_idx" ON "RegulatoryDocument"("applicability");
CREATE INDEX "RegulatoryDocument_applicableToIvd_idx" ON "RegulatoryDocument"("applicableToIvd");
CREATE INDEX "TaskRegulatoryDocument_taskId_idx" ON "TaskRegulatoryDocument"("taskId");
CREATE INDEX "TaskRegulatoryDocument_regulatoryDocumentId_idx" ON "TaskRegulatoryDocument"("regulatoryDocumentId");