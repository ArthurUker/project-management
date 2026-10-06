# RP11-T02 handoff

Implementation COMPLETE, local scope passed (see task-state for joint validation), independent review PENDING, release NOT_EVALUATED.

IDB version4 copies every legacy row into immutable source/key/value quarantine and verifies before native upgrade commit. Explicit recorded owner restores only matching outbox/dead/pending-draft partition; unowned mirrors and old guessed logout labels stay quarantined. Existing owner keys win collisions with original retained. Blocked request aborts upgrade after blocker releases rather than performing a rejected background migration; errors retryable. Real versionchange closes old connection and pauses its engine. Real v1/v2/blocked/native abort/page-close/reentry tests passed, plus current13 owner/product Tasks cases.

Limits:

- Current5 migration +13 owner/browser product Tasks cases, synthetic HTTP auth/push; no native JWT joint/target deployment
- Unknown original source remains quarantined, no first-login claim/export enabled
- Version4 only adds/copies/verifies stores; original stores retained. Whole transaction abort preserves original version2 on real page close during4000-row copy
- Older regression attempt01 excluded due harness edit during run; source-start/end fenced attempt02 accepted

Cleanup: all accepted runs guarded drop + cluster stop exit 0; owned roots and dist absent. Earlier failed attempt logs retained.

Next: RP11-T03 atomic last-copy conflict/recovery, explicit recovery UI and real quota/fault evidence
