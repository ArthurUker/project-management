"""Reconstruct the byte-exact pre-CLOSE-01 rp10 test content and verify it by SHA256.

The file is untracked in git and no snapshot was taken before the CLOSE-01 edits began,
so the start copy is reconstructed by inverse-applying exactly the edits made in this
session. The reconstruction is accepted ONLY if its SHA256 equals the independently
verified manifest baseline 95b70b11ab1b67021a07aebd6b02aca341f735b2926d969657310a183aa75c30.
"""
import hashlib, pathlib

R = pathlib.Path('/Users/renkang/VS Code/project-management')
TEST = R / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'
SESSION = R / 'docs/remediation/2026-10-01-rdpms/execution/supplements/lr6-closeout-2026-10-04-cb1'
EXPECTED = '95b70b11ab1b67021a07aebd6b02aca341f735b2926d969657310a183aa75c30'

text = TEST.read_text()

# ── inverse of the appended CLOSE-01 tests ──────────────────────────────────
marker = '\n\n// ══ CLOSE-01 / LR6-01：屏障匹配完整性与草稿竞争收束补正'
idx = text.find(marker)
assert idx != -1, 'appended CLOSE-01 block not found'
text = text[:idx] + '\n'

# ── inverse of the selector full-key upgrade ────────────────────────────────
IDENT = "projectId: project.id, authorId: actor.id, reportType: 'MONTHLY', "
selector_pairs = [
    ("matchReportWrite({ " + IDENT + "periodKey: PERIOD(2), marker: 'late-new-POST' })",
     "matchReportWrite({ periodKey: PERIOD(2), marker: 'late-new-POST' })"),
    ("matchReportWrite({ " + IDENT + "periodKey: PERIOD(3), marker: 'first-writer' })",
     "matchReportWrite({ periodKey: PERIOD(3), marker: 'first-writer' })"),
    ("matchReportWrite({ " + IDENT + "periodKey: PERIOD(4), marker: 'create-only-late' })",
     "matchReportWrite({ periodKey: PERIOD(4), marker: 'create-only-late' })"),
    ("matchReportWrite({ " + IDENT + "periodKey: period, marker: 'late-new-POST' })",
     "matchReportWrite({ periodKey: period, marker: 'late-new-POST' })"),
    ("matchReportWrite({ " + IDENT + "periodKey: period, marker: 'control-late' })",
     "matchReportWrite({ periodKey: period, marker: 'control-late' })"),
    ("matchReportWrite({ reportId: seed?.id, " + IDENT + "periodKey: period, marker })",
     "matchReportWrite({ reportId: seed?.id, periodKey: period, marker })"),
    ("matchReportWrite({ " + IDENT + "periodKey: period, marker: 'settle-control' })",
     "matchReportWrite({ periodKey: period, marker: 'settle-control' })"),
]
for new, old in selector_pairs:
    assert text.count(new) == 1, f'selector rewrite count != 1: {new[:50]}'
    text = text.replace(new, old)

# ── inverse of the three draft-race test edits ──────────────────────────────
legacy_new = """  const target = await makeReport(`rp10-legacy-late-${suffix}`, '2026-13', { revision: 'submit-source' });
  const gate = draftWriteBarrier(target.id, 'late-draft-write');
  const app = makeApp(gate.client, WRITE_PERMS);

  let lateSave;
  try {
    lateSave = app.request(`/api/reports/${target.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: { revision: 'late-draft-write' }, clientMutationId: `rp10-legacy-late-${suffix}` }),
    });
    await reachBarrier(gate, 'legacy draft race');
    assert.equal(gate.fired(), true, 'late save must reach the real ORM write before submit commits');
    assert.equal(gate.firedMethod(), 'updateMany', 'the legacy draft save must be intercepted as updateMany');

    const submitted = await app.request(`/api/reports/${target.id}/submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientMutationId: `rp10-legacy-late-submit-${suffix}` }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  } finally {
    await settleGate(gate, lateSave);
  }

  const response = await lateSave;"""
legacy_old = """  const target = await makeReport(`rp10-legacy-late-${suffix}`, '2026-13', { revision: 'submit-source' });
  const { client, barrier, fired } = draftWriteBarrier(target.id);
  const app = makeApp(client, WRITE_PERMS);

  const lateSave = app.request(`/api/reports/${target.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: { revision: 'late-draft-write' }, clientMutationId: `rp10-legacy-late-${suffix}` }),
  });
  await Promise.race([barrier.reached, new Promise((_, reject) => setTimeout(() => reject(new Error('draft write barrier not reached')), 10000))]);
  assert.equal(fired(), true, 'late save must reach the real ORM write before submit commits');

  const submitted = await app.request(`/api/reports/${target.id}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientMutationId: `rp10-legacy-late-submit-${suffix}` }),
  });
  assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  barrier.release();

  const response = await lateSave;"""
assert text.count(legacy_new) == 1, 'legacy block not found'
text = text.replace(legacy_new, legacy_old)

modern_new = """  const target = await makeReport(`rp10-modern-late-${suffix}`, '2026-14', { revision: 'submit-source' });
  const baseline = target.updatedAt.toISOString();
  const gate = draftWriteBarrier(target.id, 'late-modern-write');
  const app = makeApp(gate.client, WRITE_PERMS);

  let lateSave;
  try {
    lateSave = app.request(`/api/reports/${target.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        content: { revision: 'late-modern-write' },
        expectedUpdatedAt: baseline,
        clientContract: 'modern',
        clientMutationId: `rp10-modern-late-${suffix}`,
      }),
    });
    await reachBarrier(gate, 'modern draft race');
    assert.equal(gate.fired(), true);

    const submitted = await app.request(`/api/reports/${target.id}/submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientMutationId: `rp10-modern-late-submit-${suffix}` }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  } finally {
    await settleGate(gate, lateSave);
  }

  const response = await lateSave;"""
modern_old = """  const target = await makeReport(`rp10-modern-late-${suffix}`, '2026-14', { revision: 'submit-source' });
  const baseline = target.updatedAt.toISOString();
  const { client, barrier, fired } = draftWriteBarrier(target.id);
  const app = makeApp(client, WRITE_PERMS);

  const lateSave = app.request(`/api/reports/${target.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: { revision: 'late-modern-write' },
      expectedUpdatedAt: baseline,
      clientContract: 'modern',
      clientMutationId: `rp10-modern-late-${suffix}`,
    }),
  });
  await Promise.race([barrier.reached, new Promise((_, reject) => setTimeout(() => reject(new Error('draft write barrier not reached')), 10000))]);
  assert.equal(fired(), true);

  const submitted = await app.request(`/api/reports/${target.id}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientMutationId: `rp10-modern-late-submit-${suffix}` }),
  });
  assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  barrier.release();

  const response = await lateSave;"""
assert text.count(modern_new) == 1, 'modern block not found'
text = text.replace(modern_new, modern_old)

sync_new = """  const target = await makeReport(`rp10-sync-late-${suffix}`, '2026-15', { revision: 'submit-source' });
  const gate = draftWriteBarrier(target.id, 'late-sync-write');
  const app = makeApp(gate.client, WRITE_PERMS);
  const deviceId = `rp10-device-${suffix}`;

  let push;
  try {
    push = app.request('/api/sync/push', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        changes: [{
          clientMutationId: `rp10-sync-late-${suffix}`,
          entity: 'reports',
          id: target.id,
          op: 'upsert',
          baseUpdatedAt: target.updatedAt.toISOString(),
          data: { content: { revision: 'late-sync-write' } },
        }],
      }),
    });
    await reachBarrier(gate, 'sync draft race');
    assert.equal(gate.fired(), true);

    const submitted = await app.request(`/api/reports/${target.id}/submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientMutationId: `rp10-sync-late-submit-${suffix}` }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  } finally {
    await settleGate(gate, push);
  }

  const response = await push;"""
sync_old = """  const target = await makeReport(`rp10-sync-late-${suffix}`, '2026-15', { revision: 'submit-source' });
  const { client, barrier, fired } = draftWriteBarrier(target.id);
  const app = makeApp(client, WRITE_PERMS);
  const deviceId = `rp10-device-${suffix}`;

  const push = app.request('/api/sync/push', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      changes: [{
        clientMutationId: `rp10-sync-late-${suffix}`,
        entity: 'reports',
        id: target.id,
        op: 'upsert',
        baseUpdatedAt: target.updatedAt.toISOString(),
        data: { content: { revision: 'late-sync-write' } },
      }],
    }),
  });
  await Promise.race([barrier.reached, new Promise((_, reject) => setTimeout(() => reject(new Error('sync write barrier not reached')), 10000))]);
  assert.equal(fired(), true);

  const submitted = await app.request(`/api/reports/${target.id}/submit`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientMutationId: `rp10-sync-late-submit-${suffix}` }),
  });
  assert.equal(submitted.status, 200, JSON.stringify(await submitted.json()));
  barrier.release();

  const response = await push;"""
assert text.count(sync_new) == 1, 'sync block not found'
text = text.replace(sync_new, sync_old)

# ── inverse of draftWriteBarrier ────────────────────────────────────────────
barrier_new = """/**
 * 屏障式保存：命中 reportId + 该请求唯一 payload 标记的第一次真实写入暂停在写入前。
 * 复用统一匹配器，因此 upsert 的 create/update payload（data 为 null）同样能命中；
 * 不能只把 upsert 加进 methods 却仍只检查 data.content。
 */
function draftWriteBarrier(reportId, marker) {
  return gateReportWrite(prisma, ['updateMany', 'update', 'upsert'],
    matchReportWrite({ reportId, marker }));
}"""
barrier_old = """/** 屏障式保存：命中 reportId 的第一次真实写入暂停在写入前（create/upsert/update/updateMany 均可） */
function draftWriteBarrier(reportId) {
  const gate = gateReportWrite(prisma, ['updateMany', 'update', 'upsert'],
    ({ data, where }) => where?.id === reportId && data?.content !== undefined);
  return { client: gate.client, barrier: { reached: gate.reached, release: gate.release }, fired: gate.fired };
}"""
assert text.count(barrier_new) == 1, 'draftWriteBarrier block not found'
text = text.replace(barrier_new, barrier_old)

# ── inverse of the matcher block ────────────────────────────────────────────
matcher_new_start = "const FULL_BUSINESS_KEY_FIELDS = ['projectId', 'authorId', 'reportType', 'periodKey'];"
matcher_new_end = """    return candidatePayloadsOf(method, { data, create, update })
      .some((content) => contentMarkerOf(content) === selector.marker);
  };
}"""
start = text.find(matcher_new_start)
end = text.find(matcher_new_end)
assert start != -1 and end != -1 and end > start, 'matcher block not found'
end += len(matcher_new_end)
matcher_old = """/**
 * 统一匹配器：必须命中「报告 id」或「业务唯一键」，且必须命中指定 payload 标记。
 * selector: { reportId?, periodKey?, marker? }
 */
function matchReportWrite(selector) {
  return ({ method, data, where, create, update }) => {
    const compound = where?.projectId_authorId_reportType_periodKey;
    const keyHit = (selector.reportId !== undefined && where?.id === selector.reportId)
      || (selector.periodKey !== undefined && (
        data?.periodKey === selector.periodKey
        || create?.periodKey === selector.periodKey
        || compound?.periodKey === selector.periodKey
        || where?.periodKey === selector.periodKey
      ));
    if (!keyHit) return false;
    if (selector.marker === undefined) return true;
    return [data?.content, create?.content, update?.content]
      .some((content) => contentMarkerOf(content) === selector.marker);
  };
}"""
text = text[:start] + matcher_old + text[end:]

rebuilt = hashlib.sha256(text.encode()).hexdigest()
print('reconstructed sha256:', rebuilt)
print('matches manifest baseline:', rebuilt == EXPECTED)
if rebuilt == EXPECTED:
    (SESSION / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start').write_text(text)
    print('start copy written (byte-exact, hash-verified)')
else:
    raise SystemExit('reconstruction mismatch; refusing to write a start copy')
