# Exact validation refinements

- Shared mock SyncDevice must mirror native epoch DEFAULT; native unit cannot treat missing epoch as valid device. Business rejection assertions retained.
- Login standalone ORM now uses the public protected native transaction. RP02/RP03 barriers wrap actual tx models in addition to top-level models; exact target + payload predicates, SQL/results unchanged, positive hit required.
- RP09 lastPush fault moves to actual tx model. Task delete after prior RP05 lock uses exact `SELECT id FROM tasks WHERE id IN` bound target ID before real lock; two contenders can reach it without impossible simultaneous post-lock waits. Prior receipt/CAS/barrier effect assertions unchanged.
- Native ACL prior session script counted all owners' physical task mirrors in a current-owner revoke assertion. New owned clone requires current actor zero task mirrors AND exact foreign partition unchanged. Original script and failed run retained.
- Failed migration sorting, malformed fixture shapes/permissions and script preflight directory target retained as actual failures; no failed logs overwritten or treated as acceptance.
- Final epoch pagination fixture requires actual 3001 native tasks, mandatory real continuation token, bound same device and old signed epoch denial (no conditional skip).
