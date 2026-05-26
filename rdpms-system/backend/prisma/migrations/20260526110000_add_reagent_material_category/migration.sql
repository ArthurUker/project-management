-- Add reagent material category
ALTER TABLE "ReagentMaterial"
ADD COLUMN "category" TEXT NOT NULL DEFAULT '未分类';

-- CreateIndex
CREATE INDEX "ReagentMaterial_category_idx" ON "ReagentMaterial"("category");