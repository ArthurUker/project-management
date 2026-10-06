CREATE TABLE "data_recovery_state" (
  "id" INTEGER PRIMARY KEY CHECK (id = 1), "epoch" UUID NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'READY' CHECK (status IN ('READY','RESTORING','RESTORE_NEEDS_RECONCILIATION')),
  "active_run_id" UUID, "payload_hash" CHAR(64), "manifest" JSONB, "summary" JSONB,
  "failure_code" VARCHAR(100), "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "data_recovery_state" (id,epoch) VALUES (1,gen_random_uuid());
CREATE FUNCTION rdpms_restore_write_gate() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recovery_status text; run_id uuid;
BEGIN
  SELECT status, active_run_id INTO recovery_status, run_id FROM public.data_recovery_state WHERE id = 1 FOR SHARE;
  IF recovery_status IS NULL THEN RAISE EXCEPTION 'RESTORE_GATE_UNAVAILABLE'; END IF;
  IF recovery_status <> 'READY' AND (run_id IS NULL OR current_setting('rdpms.restore_run', true) IS DISTINCT FROM run_id::text) THEN
    RAISE EXCEPTION 'RESTORE_WRITE_BLOCKED' USING ERRCODE = '55000';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "attachments" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "audit_logs" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "code_sequences" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "detection_targets" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "doc_categories" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "doc_documents" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "doc_versions" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "enum_meta" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "file_objects" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "formula_components" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "milestones" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "monthly_progress" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "mutation_receipts" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "permissions" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "phase_transitions" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "prep_records" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "primers" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "project_members" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "project_phases" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "project_templates" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "projects" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "reagent_formulas" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "reagent_lots" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "reagent_materials" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "refresh_tokens" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "registration_profiles" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "regulatory_documents" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "report_versions" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "reports" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "role_permissions" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "roles" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "sample_materials" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "sync_devices" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "sync_mutations" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "system_logs" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "system_settings" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "task_dependencies" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "task_doc_refs" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "task_regulatory_documents" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "task_template_steps" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "task_templates" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "tasks" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "template_phases" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "template_roles" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "template_tasks" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "user_roles" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER rdpms_restore_write_gate BEFORE INSERT OR UPDATE OR DELETE ON "users" FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
