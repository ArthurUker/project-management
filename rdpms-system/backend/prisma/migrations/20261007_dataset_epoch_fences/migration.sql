ALTER TABLE data_recovery_state ADD COLUMN previous_epoch UUID, ADD COLUMN initiator_id TEXT, ADD COLUMN initiator_version INTEGER;
CREATE FUNCTION rdpms_current_dataset_epoch() RETURNS UUID LANGUAGE SQL STABLE AS $$ SELECT epoch FROM public.data_recovery_state WHERE id = 1 $$;
ALTER TABLE sync_devices ADD COLUMN dataset_epoch UUID NOT NULL DEFAULT rdpms_current_dataset_epoch();
ALTER TABLE refresh_tokens ADD COLUMN dataset_epoch UUID NOT NULL DEFAULT rdpms_current_dataset_epoch();
ALTER TABLE mutation_receipts ADD COLUMN dataset_epoch UUID NOT NULL DEFAULT rdpms_current_dataset_epoch();
CREATE OR REPLACE FUNCTION rdpms_restore_write_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recovery_status text; run_id uuid; current_epoch uuid; expected_epoch text;
BEGIN
  SELECT status, active_run_id, epoch INTO recovery_status, run_id, current_epoch FROM public.data_recovery_state WHERE id = 1 FOR SHARE;
  IF recovery_status IS NULL THEN RAISE EXCEPTION 'RESTORE_GATE_UNAVAILABLE'; END IF;
  IF recovery_status <> 'READY' AND (run_id IS NULL OR current_setting('rdpms.restore_run', true) IS DISTINCT FROM run_id::text) THEN
    RAISE EXCEPTION 'RESTORE_WRITE_BLOCKED' USING ERRCODE = '55000';
  END IF;
  expected_epoch := current_setting('rdpms.dataset_epoch',true);
  IF recovery_status = 'READY' AND expected_epoch IS NOT NULL AND expected_epoch <> '' AND expected_epoch <> current_epoch::text THEN
    RAISE EXCEPTION 'DATASET_EPOCH_CHANGED' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END $$;
