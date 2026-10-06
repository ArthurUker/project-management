CREATE TABLE sync_publication_state(epoch UUID PRIMARY KEY,head BIGINT NOT NULL DEFAULT 0,floor BIGINT NOT NULL DEFAULT 0,initialized BOOLEAN NOT NULL DEFAULT FALSE,CHECK(floor>=0 AND head>=floor));
CREATE TABLE sync_source_revisions(epoch UUID NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,revision BIGINT NOT NULL,CHECK(revision>0),PRIMARY KEY(epoch,entity,entity_id));
CREATE TABLE sync_change_events(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),epoch UUID NOT NULL,entity TEXT NOT NULL,entity_id TEXT NOT NULL,project_id TEXT NOT NULL,author_id TEXT,revision BIGINT NOT NULL,action TEXT NOT NULL CHECK(action IN ('upsert','delete')),payload JSONB NOT NULL,published_sequence BIGINT,created_at TIMESTAMP(3) NOT NULL DEFAULT clock_timestamp(),UNIQUE(epoch,published_sequence),UNIQUE(epoch,entity,entity_id,revision));
CREATE INDEX sync_events_resource_revision ON sync_change_events(epoch,entity,entity_id,revision);
CREATE FUNCTION rdpms_capture_sync_row(p_epoch UUID,p_entity TEXT,p_row JSONB,p_action TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE rev BIGINT;
BEGIN
 INSERT INTO sync_source_revisions(epoch,entity,entity_id,revision) VALUES(p_epoch,p_entity,p_row->>'id',1)
 ON CONFLICT(epoch,entity,entity_id) DO UPDATE SET revision=sync_source_revisions.revision+1 RETURNING revision INTO rev;
 INSERT INTO sync_change_events(epoch,entity,entity_id,project_id,author_id,revision,action,payload)
 VALUES(p_epoch,p_entity,p_row->>'id',CASE WHEN p_entity='projects' THEN p_row->>'id' ELSE p_row->>'project_id' END,CASE WHEN p_entity='reports' THEN p_row->>'author_id' END,rev,p_action,p_row);
END $$;
CREATE FUNCTION rdpms_source_sync_trigger() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE e UUID; row_data JSONB; old_data JSONB; action TEXT;
BEGIN
 SELECT epoch INTO e FROM data_recovery_state WHERE id=1;
 IF e IS NULL THEN RAISE EXCEPTION 'DATASET_EPOCH_UNAVAILABLE'; END IF;
 IF TG_OP='DELETE' THEN PERFORM rdpms_capture_sync_row(e,TG_ARGV[0],to_jsonb(OLD),'delete'); RETURN OLD; END IF;
 row_data:=to_jsonb(NEW);
 IF TG_OP='UPDATE' THEN
  old_data:=to_jsonb(OLD);
  IF old_data->>'id' IS DISTINCT FROM row_data->>'id' OR old_data->>'project_id' IS DISTINCT FROM row_data->>'project_id' OR old_data->>'author_id' IS DISTINCT FROM row_data->>'author_id' THEN
   PERFORM rdpms_capture_sync_row(e,TG_ARGV[0],old_data,'delete');
  END IF;
 END IF;
 action:=CASE WHEN row_data->>TG_ARGV[1] IS NOT NULL THEN 'delete' ELSE 'upsert' END;
 PERFORM rdpms_capture_sync_row(e,TG_ARGV[0],row_data,action); RETURN NEW;
END $$;
CREATE TRIGGER journal_projects AFTER INSERT OR UPDATE OR DELETE ON projects FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('projects','deleted_at');
CREATE TRIGGER journal_project_phases AFTER INSERT OR UPDATE OR DELETE ON project_phases FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('projectPhases','deleted_at');
CREATE TRIGGER journal_tasks AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('tasks','deleted_at');
CREATE TRIGGER journal_milestones AFTER INSERT OR UPDATE OR DELETE ON milestones FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('milestones','deleted_at');
CREATE TRIGGER journal_monthly_progress AFTER INSERT OR UPDATE OR DELETE ON monthly_progress FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('monthlyProgress','deleted_at');
CREATE TRIGGER journal_reports AFTER INSERT OR UPDATE OR DELETE ON reports FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('reports','deleted_at');
CREATE TRIGGER journal_project_members AFTER INSERT OR UPDATE OR DELETE ON project_members FOR EACH ROW EXECUTE FUNCTION rdpms_source_sync_trigger('projectMembers','left_at');
CREATE FUNCTION rdpms_immutable_sync_event() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.published_sequence IS NOT NULL OR NEW.published_sequence IS NULL OR
 (to_jsonb(OLD)-'published_sequence') IS DISTINCT FROM (to_jsonb(NEW)-'published_sequence') THEN RAISE EXCEPTION 'SYNC_EVENT_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_sync_event BEFORE UPDATE OR DELETE ON sync_change_events FOR EACH ROW EXECUTE FUNCTION rdpms_immutable_sync_event();
CREATE TRIGGER recovery_gate_journal BEFORE INSERT OR UPDATE OR DELETE ON sync_change_events FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER recovery_gate_revisions BEFORE INSERT OR UPDATE OR DELETE ON sync_source_revisions FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();
CREATE TRIGGER recovery_gate_publisher BEFORE INSERT OR UPDATE OR DELETE ON sync_publication_state FOR EACH STATEMENT EXECUTE FUNCTION rdpms_restore_write_gate();

CREATE FUNCTION rdpms_block_sync_truncate() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNC_SOURCE_TRUNCATE_REQUIRES_NEW_EPOCH'; END $$;
CREATE TRIGGER no_truncate_projects BEFORE TRUNCATE ON projects EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_phases BEFORE TRUNCATE ON project_phases EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_tasks BEFORE TRUNCATE ON tasks EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_milestones BEFORE TRUNCATE ON milestones EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_progress BEFORE TRUNCATE ON monthly_progress EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_reports BEFORE TRUNCATE ON reports EXECUTE FUNCTION rdpms_block_sync_truncate();
CREATE TRIGGER no_truncate_members BEFORE TRUNCATE ON project_members EXECUTE FUNCTION rdpms_block_sync_truncate();
