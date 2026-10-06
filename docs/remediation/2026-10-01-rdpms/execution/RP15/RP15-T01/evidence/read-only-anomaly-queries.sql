-- PREPARED ONLY; NOT EXECUTED.
-- Run only against a specifically authorized read-only snapshot after confirming schema/migration level.
-- The caller must enforce read-only transaction, statement_timeout, lock_timeout, and a disclosed recursion ceiling.
-- Output only aggregate counts; never export task text, names, tokens, attachment paths, or raw IDs.

-- Relationship integrity counts. Orphans may be impossible when the target FK is valid,
-- but the query is still useful for drifted/NOT VALID target constraints.
SELECT
  count(*) FILTER (WHERE child.parent_id IS NOT NULL AND parent.id IS NULL) AS missing_parent_count,
  count(*) FILTER (WHERE parent.id IS NOT NULL AND parent.project_id <> child.project_id) AS cross_project_parent_count,
  count(*) FILTER (WHERE child.parent_id = child.id) AS self_parent_count,
  count(*) FILTER (WHERE child.deleted_at IS NULL AND parent.deleted_at IS NOT NULL) AS active_child_tombstoned_parent_count
FROM tasks child
LEFT JOIN tasks parent ON parent.id = child.parent_id;

SELECT
  count(*) FILTER (WHERE child.phase_id IS NOT NULL AND phase.id IS NULL) AS missing_phase_count,
  count(*) FILTER (WHERE phase.id IS NOT NULL AND child.project_id <> phase.project_id) AS cross_project_phase_count,
  count(*) FILTER (WHERE child.deleted_at IS NULL AND phase.deleted_at IS NOT NULL) AS active_task_tombstoned_phase_count
FROM tasks child
LEFT JOIN project_phases phase ON phase.id = child.phase_id;

SELECT
  count(*) FILTER (WHERE dep.task_id = dep.prerequisite_id) AS self_dependency_count,
  count(*) FILTER (WHERE left_task.id IS NULL OR right_task.id IS NULL) AS missing_dependency_endpoint_count,
  count(*) FILTER (WHERE left_task.id IS NOT NULL AND right_task.id IS NOT NULL AND left_task.project_id <> right_task.project_id) AS cross_project_dependency_count,
  count(*) FILTER (WHERE (left_task.deleted_at IS NULL) <> (right_task.deleted_at IS NULL)) AS mixed_tombstone_dependency_count
FROM task_dependencies dep
LEFT JOIN tasks left_task ON left_task.id = dep.task_id
LEFT JOIN tasks right_task ON right_task.id = dep.prerequisite_id;

-- Bounded cycle probe only. Set max_depth conservatively for the target DB and report
-- frontier_count separately. A nonzero frontier means the result is inconclusive, not acyclic.
WITH RECURSIVE edges(src, dst) AS (
  SELECT task_id, prerequisite_id FROM task_dependencies
), walk(start_id, node_id, path, depth, cycle) AS (
  SELECT src, dst, ARRAY[src, dst], 1, (src = dst) FROM edges
  UNION ALL
  SELECT walk.start_id, edges.dst, walk.path || edges.dst, walk.depth + 1,
         edges.dst = ANY(walk.path)
  FROM walk
  JOIN edges ON edges.src = walk.node_id
  WHERE NOT walk.cycle AND walk.depth < 32
)
SELECT
  count(DISTINCT start_id) FILTER (WHERE cycle) AS cycle_start_count,
  count(*) FILTER (WHERE NOT cycle AND depth = 32) AS depth_frontier_count
FROM walk;

SELECT count(*) AS duplicate_project_member_key_count
FROM (
  SELECT project_id, user_id
  FROM project_members
  GROUP BY project_id, user_id
  HAVING count(*) > 1
) duplicate_keys;

-- Required provenance: target snapshot identifier, target schema and applied migration set,
-- query text SHA-256, transaction/read-only proof, elapsed time, exit status, and cleanup record.
