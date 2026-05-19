-- Add detection target field for primer/probe records
ALTER TABLE "Primer" ADD COLUMN "detectionTarget" TEXT;

-- Index for target-based search/filter
CREATE INDEX "Primer_detectionTarget_idx" ON "Primer"("detectionTarget");
