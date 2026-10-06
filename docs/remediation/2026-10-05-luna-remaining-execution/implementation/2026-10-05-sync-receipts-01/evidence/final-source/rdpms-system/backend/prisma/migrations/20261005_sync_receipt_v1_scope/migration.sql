-- Approved T-RP-02-SCOPED-RESERVATION-V1: additive only, no legacy backfill.
ALTER TABLE "sync_mutations"
  ADD COLUMN "receipt_version" INTEGER,
  ADD COLUMN "resource_scope" VARCHAR(200),
  ADD COLUMN "payload_hash" CHAR(64),
  ADD COLUMN "expires_at" TIMESTAMPTZ(3);
