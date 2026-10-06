# Sync v1 CI follow-up

Migrated original RF04 unit/integration, RF02 retry and RP10 sync race fixtures to actual v1 reservations. Original case names and denial/CAS/content/barrier assertions retained; same-key changed-payload now explicit409, refused execution leaves pending reservation. Real DB grant fixtures replace stale middleware grants. Unit-only assertion view exposes reservation-denial stage and actual HTTP status; no 401/426/500 accepted as business denial. No business source changed.
