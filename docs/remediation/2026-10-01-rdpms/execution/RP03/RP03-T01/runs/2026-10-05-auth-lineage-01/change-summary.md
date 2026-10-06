# RP03-T01 local implementation

Protected requests capture initiating actor/loginGeneration/tokenRevision. Shared auth state uses a single versioned envelope and short write lock; per-login refresh lock holds network only outside write lock. Same-lineage successor permits one immutable replay; stale A login/refresh/profile/logout cannot apply B state/credentials. Definitive current invalid refresh conditional cleanup; replayed/unknown outcomes preserve work and require explicit relogin. No Web Locks/storage means isolated in-memory login and no shared writes/automatic refresh.

Approved by 郭仁康（研发副总监）; exact contract in session approval.json.

API/schema: Bearer/body and current JWT TTL unchanged. Candidate legacy two-key sessions deliberately require explicit login; no import/delete of old keys or IDB/outbox. Auth API login/refresh explicit public dispatch; logout captured original Bearer. Existing browser/target mixed-version matrix remains NOT_RUN.

Changed files:

- rdpms-system/frontend/src/auth/tokenStore.ts
- rdpms-system/frontend/src/api/http.ts
- rdpms-system/frontend/src/auth/AuthProvider.tsx
- rdpms-system/frontend/src/api/endpoints/auth.ts
- rdpms-system/frontend/tests/unit/rp03-t01-acceptance.test.ts

Source before snapshots and task-specific diff are retained. No commits/deployments.
