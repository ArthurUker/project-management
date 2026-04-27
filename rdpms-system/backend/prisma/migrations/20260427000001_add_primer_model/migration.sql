-- CreateTable: Primer
CREATE TABLE "Primer" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "projectName"         TEXT,
    "name"                TEXT NOT NULL,
    "sequence"            TEXT NOT NULL,
    "targetGene"          TEXT,
    "modification5"       TEXT,
    "modification3"       TEXT,
    "ampliconLength"      INTEGER,
    "speciesLatinName"    TEXT,
    "speciesChineseName"  TEXT,
    "speciesTaxid"        TEXT,
    "atccStrain"          TEXT,
    "validatedStrain"     TEXT,
    "synthesisAmount"     TEXT,
    "synthesisCompany"    TEXT,
    "tubeCount"           INTEGER,
    "notes"               TEXT,
    "status"              TEXT NOT NULL DEFAULT 'active',
    "createdBy"           TEXT,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Primer_projectName_idx" ON "Primer"("projectName");

-- CreateIndex
CREATE INDEX "Primer_targetGene_idx" ON "Primer"("targetGene");

-- CreateIndex
CREATE INDEX "Primer_name_idx" ON "Primer"("name");
