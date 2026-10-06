# RP15-T01 static inventory preparation

Reviewed the current Prisma relation definitions and all six repository migration SQL files relevant to the plan, reusing frozen S04 findings and its read-only query plan. The current repo migration set contains id-only task parent/phase/dependency relationships; task parent FK uses physical `ON DELETE CASCADE`; project membership has `(project_id,user_id)` uniqueness. The prepared aggregate query template covers cross-project parent/phase/dependency edges, missing endpoints, tombstones, self edges, bounded dependency cycles, and duplicate member keys.

No database was queried. Actual target schema/migration drift and historical anomaly counts remain unknown because no owner-approved read-only snapshot is available. No raw IDs or business values were extracted; no schema/code/data was modified. See `evidence/static-schema-inventory.json` and `evidence/read-only-anomaly-queries.sql`.
