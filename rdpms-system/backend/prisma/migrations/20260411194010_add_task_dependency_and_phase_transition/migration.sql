-- 手工补录：TaskDependency 表（已通过 db execute 创建）
CREATE TABLE IF NOT EXISTS "TaskDependency" (
    "id"             TEXT NOT NULL PRIMARY KEY,
    "taskId"         TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    "createdAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskDependency_taskId_fkey"
        FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE,
    CONSTRAINT "TaskDependency_prerequisiteId_fkey"
        FOREIGN KEY ("prerequisiteId") REFERENCES "Task"("id") ON DELETE CASCADE,
    CONSTRAINT "TaskDependency_taskId_prerequisiteId_key"
        UNIQUE ("taskId", "prerequisiteId")
);

-- 手工补录：PhaseTransition 表（已通过 db execute 创建）
CREATE TABLE IF NOT EXISTS "PhaseTransition" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "fromPhaseId" TEXT NOT NULL,
    "toPhaseId"   TEXT NOT NULL,
    CONSTRAINT "PhaseTransition_unique" UNIQUE ("fromPhaseId", "toPhaseId")
);
