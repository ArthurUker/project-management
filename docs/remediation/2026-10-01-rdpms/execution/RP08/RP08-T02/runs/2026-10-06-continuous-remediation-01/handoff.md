# RP08-T02 handoff

Implementation COMPLETE, local validation see task-state and acceptance.json, independent review PENDING, release NOT_EVALUATED.

Current ACL SHA256 covers actor/system role/security version, sorted permissions and actual project role/membership/manager/projection version in the same repeatable-read snapshot as read projection. Missing/stale ACL forces full historical backfill; signed continuation binds fingerprint and409 on current change. Candidate client stages whole snapshot, invalidates old authorization before further roundtrip, commits mirror+ACL+cursor in one owner-fenced IDB tx only at final page. Native publish abort preserves originals and old cursor but hides old mirror. Denied queue is tagged before staging, remains original-owner; later grant restore cannot auto reserve/query/push isolated original. Explicit safe same-binding action required. NativeACL6/6, actual JWT/backend/browser7/7 including nonempty Tasks then real403 purge, nativeIDB ACL5/5, ordinary sync12/12, oldpagination2/2, owner13/13, receipt10/10,batch7/7 pass.

Limits:

- Candidate local only; no deployed client or target/production acceptance.
- Read snapshot is internally repeatable-read, but old updatedAt commit-order miss remains for RP13-T03; not closed B07.
- Five minute approved offline lease cannot know remote revocation during genuine network outage. Fresh definitive denial/ACL change immediately hides mirrors.
- Existing12 source tests changed only fingerprintformat and acknowledgedACL query parameter; all case names/field/value/denial invariants retained.
- Earlier tx connection failure and wrong UI error-text expectation preserved; finalnative7/7 verifies nonempty marker, actual403 and marker purge. Native quota priorENV not convertedPASS.

Cleanup: real DB runs guarded drop/cluster stop exit0 and owned roots/dist absent; browser runs settled Chrome exit, server closed and own profile removed. Earlier failed attempt logs retained.

Next: RP07-T02 same-transaction manager/member transfer shared command, then registration scope/adaptor and remaining independent STANDARD tasks
