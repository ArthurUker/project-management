-- Add isDraft field to Project for draft project management
ALTER TABLE "Project" ADD COLUMN "isDraft" BOOLEAN NOT NULL DEFAULT false;

-- Add phaseId and phaseName fields to Milestone for phase association
ALTER TABLE "Milestone" ADD COLUMN "phaseId" TEXT;
ALTER TABLE "Milestone" ADD COLUMN "phaseName" TEXT;

-- Create index on phaseId for efficient milestone-phase lookups
CREATE INDEX "Milestone_phaseId_idx" ON "Milestone"("phaseId");
