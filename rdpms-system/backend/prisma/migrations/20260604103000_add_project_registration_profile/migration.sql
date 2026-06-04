-- Add registration profile table for registration projects

CREATE TABLE "ProjectRegistrationProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "registrationType" TEXT NOT NULL DEFAULT 'IVD',
    "region" TEXT,
    "authority" TEXT,
    "submissionNo" TEXT,
    "certificateNo" TEXT,
    "currentStage" TEXT,
    "plannedSubmissionDate" DATETIME,
    "expectedApprovalDate" DATETIME,
    "complianceOwnerId" TEXT,
    "riskLevel" TEXT NOT NULL DEFAULT '中',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectRegistrationProfile_projectId_key" UNIQUE ("projectId"),
    CONSTRAINT "ProjectRegistrationProfile_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectRegistrationProfile_complianceOwnerId_fkey"
      FOREIGN KEY ("complianceOwnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ProjectRegistrationProfile_registrationType_idx" ON "ProjectRegistrationProfile"("registrationType");
CREATE INDEX "ProjectRegistrationProfile_currentStage_idx" ON "ProjectRegistrationProfile"("currentStage");
CREATE INDEX "ProjectRegistrationProfile_complianceOwnerId_idx" ON "ProjectRegistrationProfile"("complianceOwnerId");
