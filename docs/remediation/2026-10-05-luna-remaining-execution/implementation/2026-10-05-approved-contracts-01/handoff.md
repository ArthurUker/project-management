# Approved contracts — local execution delivery

Approved by 郭仁康（研发副总监） through the current user message. T-RP-05 and D-S01-07 only; other 19 decisions remain unsigned. Single executor, serial tasks, no subagents.

## Completed scope

- RP14-T02 COMPLETE / local PASS: only CLEAN exports bytes; all aliases deny other/missing scan results, redacted strict denial audit. Intended M-1 elevated context preserved and sensitive access audited. Metadata/delete retain system permission/capability rules. Unscanned legacy raw originals cannot export. Uploads default SKIPPED: without an actual scan producing CLEAN their bytes are deliberately refused; scanning/deployment is not claimed.
- RP10-T03 COMPLETE / local PASS: DRAFT/NEEDS_REVISION only for new submit; same-key committed result replays after current auth; locked status/version CAS and stale review rejection; strict audit and review transition in one transaction.

## Actual verification

- RP14 policy 12/12; RF05 integration 8/8; original infected + file policy units 13/13.
- RP10 policy 13/13; full snapshot 25/25 (24 unchanged, one resubmit expectation updated to approved policy); idempotency 8/8; write authority 9/9; versions access 3/3.
- Backend unit/contract 93/93; each runner build/typecheck/lint:undefined/diff-check exit 0. Counts include overlapping regression executions, not unique acceptance records.
- Every integration suite uses a newly initialized random owned local PG cluster/database; legitimate JWT/Bearer + DB permission controls in the two new policy suites. Signer-minted synthetic tokens are not password-login/refresh end-to-end acceptance. Unknown/null scan tests are pure-policy cases because DB enum is non-null and cannot store them. Fault-injected audit errors still execute real transactions.
- Accepted run guard drop and cluster stop exit 0; owned dist/temp roots removed. Attempt-01 file runner socket-path failure and report syntax failure remain preserved, not PASS. The first non-running root was explicitly confirmed stopped and removed; no audit trigger or audit rows deleted.

## Limits and progress

- 54 tasks: 20 COMPLETE / 2 IN_PROGRESS / 32 NOT_STARTED; validation 12 PASS / 35 NOT_RUN / 7 ENV_BLOCKED. Remaining implementation 34 (32 required + 2 optional inactive).
- 306 matrix rows: 67 PASS / 214 NOT_RUN / 25 ENV_BLOCKED. Local pass never implies target or release. All release NOT_EVALUATED.
- B10/B11/B12 retain original SUPPORTED and wider fixAcceptance NOT_RUN; local evidence recorded separately. Original 31 historical open items not automatically closed. RP14 implementation aggregate complete but package joint/target/release remains open; RP10 still has RP10-T01 unimplemented.
- No new ready implementation task: see task-readiness.json for all 54; 19 task-specific decisions still unsigned. RP15 requires owner-approved readonly material, RP19-T04 final programme conditions. Existing continuous local authorization remains valid; no blanket approval inferred.
- No commit/stage/push/merge/deploy, dependency install, migration, real env/SSH credential, production/shared DB, real account or data restore access.

## Resume read order

1. This SESSION_SUMMARY.md and task-state.json.
2. approval.json, authorization.json, task-readiness.json.
3. Per-task runs / acceptance.json / evidence/validation-summary.json / source-hashes.json / source-diff.patch.
4. Current P/IMPLEMENTATION_STATE.json, TASK_GRAPH.json, DECISION_REGISTER.json and original EXECUTOR_PROMPT plus continuous override.
5. New exact approval or external material for the next blocked task; then its narrowed preparation allowlist/current card/case/history evidence.

Do not repeat completed scopes or overwrite old failed attempts. Independent review is pending. No release action authorized.
