/**
 * RF05 单元用例 —— FileAccessPolicy 的纯规则（F11）
 *
 * 验收（06 §第一阶段 RF05）：
 *   1. 甲项目成员看不到乙文件的 list / metadata / download / delete；
 *   2. 上传者私有暂存隔离（仅上传人可见）；
 *   3. import-source（法规原文来源文件）同样受策略约束；
 *   4. 历史无归属文件**不自动公开**（未分类 → 仅上传人/超管可分类，不对普通用户开放）。
 *
 * 本文件只测**纯函数**（不连库、不起 HTTP），真实约束由 tests/integration/rf05-file-scope 覆盖。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decideFileAccess,
  effectiveScope,
  listVisibilityFilter,
  FILE_SCOPE,
  FILE_ACTION,
  SHARED_READ_PERMISSION,
} from '../../dist/modules/files/fileAccessPolicy.js';

const ACTOR_ALICE = { userId: 'u-alice', systemRole: 'MEMBER', permissions: ['files.download', 'files.upload'] };
const ACTOR_BOB = { userId: 'u-bob', systemRole: 'MEMBER', permissions: ['files.download', 'files.upload'] };
const ACTOR_ADMIN = { userId: 'u-admin', systemRole: 'ADMIN', permissions: ['files.download', 'files.upload', 'files.delete'] };
const ACTOR_SUPER = { userId: 'u-super', systemRole: 'SUPER_ADMIN', permissions: ['files.download', 'files.upload', 'files.delete'] };

const file = (over = {}) => ({
  id: 'f1',
  accessScope: FILE_SCOPE.PRIVATE_STAGING,
  ownerUserId: null,
  ownerProjectId: null,
  sharedReadPermission: null,
  uploadedById: 'u-alice',
  isPublic: false,
  classifiedAt: null,
  deletedAt: null,
  ...over,
});
const inProject = (isMember, capabilities = []) => ({ projectAccess: { isMember, capabilities } });

test('RF05-U1 私有暂存：仅上传人可读（metadata/download），他人一律拒绝', () => {
  const staging = file();
  const own = decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_ALICE, staging, {});
  assert.equal(own.allow, true, own.reason);
  for (const action of [FILE_ACTION.METADATA, FILE_ACTION.DOWNLOAD, FILE_ACTION.IMPORT_SOURCE]) {
    const other = decideFileAccess(action, ACTOR_BOB, staging, inProject(true, ['read', 'write']));
    assert.equal(other.allow, false, `${action} 不得放行`);
    assert.equal(other.code, 'FILE_NOT_FOUND', '非本人不得知道该文件存在（隐藏存在性）');
  }
});

test('RF05-U2 私有暂存：删除也只允许上传人（或超管清理）', () => {
  const staging = file();
  const aliceDelete = { ...ACTOR_ALICE, permissions: ['files.download', 'files.upload', 'files.delete'] };
  assert.equal(decideFileAccess(FILE_ACTION.DELETE, aliceDelete, staging, {}).allow, true);
  assert.equal(
    decideFileAccess(FILE_ACTION.DELETE, ACTOR_ALICE, staging, {}).allow,
    false,
    '上传人若没有 files.delete 也不能删（路由级权限仍生效）',
  );
  assert.equal(decideFileAccess(FILE_ACTION.DELETE, ACTOR_BOB, staging, {}).allow, false);
  assert.equal(decideFileAccess(FILE_ACTION.DELETE, ACTOR_ADMIN, staging, {}).allow, false, '普通管理员不得删除他人暂存');
  assert.equal(decideFileAccess(FILE_ACTION.DELETE, ACTOR_SUPER, staging, {}).allow, true, '超管可清理孤儿暂存');
});

test('RF05-U3 项目文件：同项目成员可读，非成员一律拒绝；删除需项目写能力', () => {
  const projectFile = file({
    accessScope: FILE_SCOPE.PROJECT, ownerProjectId: 'p1', ownerUserId: null, classifiedAt: new Date(),
  });
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_BOB, projectFile, inProject(true, ['read'])).allow, true);
  const outsider = decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_BOB, projectFile, inProject(false, []));
  assert.equal(outsider.allow, false);
  assert.equal(outsider.code, 'FILE_NOT_FOUND', '非成员按资源不存在处理（与项目权限模型一致）');

  const bobDelete = { ...ACTOR_BOB, permissions: ['files.download', 'files.upload', 'files.delete'] };
  const reader = decideFileAccess(FILE_ACTION.DELETE, bobDelete, projectFile, inProject(true, ['read']));
  assert.equal(reader.allow, false, '只有读能力不得删除项目文件');
  const writer = decideFileAccess(FILE_ACTION.DELETE, bobDelete, projectFile, inProject(true, ['read', 'write']));
  assert.equal(writer.allow, true, '项目写能力 + files.delete 才可删除');
  assert.equal(
    decideFileAccess(FILE_ACTION.DELETE, { ...ACTOR_BOB, permissions: ['files.download'] }, projectFile, inProject(true, ['write'])).allow,
    false,
    '缺少 files.delete 权限不得删除',
  );
});

test('RF05-U4 项目作用域缺失 ownerProjectId（历史脏数据）按私有暂存处理，不自动公开', () => {
  const broken = file({ accessScope: FILE_SCOPE.PROJECT, ownerProjectId: null, classifiedAt: null });
  assert.equal(effectiveScope(broken), FILE_SCOPE.PRIVATE_STAGING, '归属不明的 PROJECT 文件必须降级为私有');
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_BOB, broken, inProject(true, ['read'])).allow, false);
});

test('RF05-U5 历史无归属（无 owner 也无上传者）：仅超管可见/可分类，普通用户 404', () => {
  const orphan = file({ uploadedById: null, ownerUserId: null, accessScope: FILE_SCOPE.PRIVATE_STAGING });
  assert.equal(decideFileAccess(FILE_ACTION.METADATA, ACTOR_BOB, orphan, {}).allow, false);
  assert.equal(decideFileAccess(FILE_ACTION.METADATA, ACTOR_ADMIN, orphan, {}).allow, false);
  const superDecision = decideFileAccess(FILE_ACTION.METADATA, ACTOR_SUPER, orphan, {});
  assert.equal(superDecision.allow, true, '超管可读以便人工分类');
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_SUPER, orphan, {}).allow, true, '分类前需要能下载核对内容');
});

test('RF05-U6 共享库：必须命中声明的读权限（未声明权限 = 不共享）', () => {
  const shared = file({
    accessScope: FILE_SCOPE.SHARED_LIBRARY,
    ownerUserId: null,
    sharedReadPermission: 'regulatory_documents.view',
    classifiedAt: new Date(),
  });
  assert.equal(
    decideFileAccess(FILE_ACTION.DOWNLOAD, { ...ACTOR_BOB, permissions: ['files.download', 'regulatory_documents.view'] }, shared, {}).allow,
    true,
  );
  const denied = decideFileAccess(FILE_ACTION.DOWNLOAD, { ...ACTOR_BOB, permissions: ['files.download'] }, shared, {});
  assert.equal(denied.allow, false, '没有声明权限的用户不得读共享库文件');

  const noRule = file({ accessScope: FILE_SCOPE.SHARED_LIBRARY, sharedReadPermission: null });
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_BOB, noRule, {}).allow, false, '未声明共享规则 = 不共享');
});

test('RF05-U7 公共文件：任意持 files.download 的登录用户可读', () => {
  const pub = file({ accessScope: FILE_SCOPE.PUBLIC, classifiedAt: new Date() });
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, ACTOR_BOB, pub, {}).allow, true);
  assert.equal(decideFileAccess(FILE_ACTION.DOWNLOAD, { ...ACTOR_BOB, permissions: [] }, pub, {}).allow, false, '仍需 files.download');
});

test('RF05-U8 已删除文件对所有动作隐藏（包括上传者与超管）', () => {
  const gone = file({ deletedAt: new Date() });
  for (const actor of [ACTOR_ALICE, ACTOR_SUPER]) {
    for (const action of [FILE_ACTION.METADATA, FILE_ACTION.DOWNLOAD, FILE_ACTION.DELETE, FILE_ACTION.IMPORT_SOURCE]) {
      const d = decideFileAccess(action, actor, gone, inProject(true, ['read', 'write']));
      assert.equal(d.allow, false);
      assert.equal(d.code, 'FILE_NOT_FOUND');
    }
  }
});

test('RF05-U9 列表可见性过滤：只返回本人/本项目/已声明共享/公共，超管额外可列出未分类历史文件', () => {
  const actor = { ...ACTOR_BOB, permissions: ['files.download', 'regulatory_documents.view'] };
  const filter = listVisibilityFilter(actor, { visibleProjectIds: ['p1', 'p2'] });
  const or = filter.OR;
  assert.ok(Array.isArray(or) && or.length >= 4, `过滤条件不足：${JSON.stringify(filter)}`);
  const json = JSON.stringify(filter);
  assert.ok(json.includes('p1') && json.includes('p2'), '项目作用域必须按可见项目过滤');
  assert.ok(json.includes('regulatory_documents.view'), '共享库必须按声明权限过滤');
  assert.ok(json.includes('u-bob'), '私有暂存只能列出本人文件');

  const superFilter = listVisibilityFilter(ACTOR_SUPER, { visibleProjectIds: ['p1'] });
  assert.ok(Array.isArray(superFilter.OR), '超管的过滤片段同样必须排除他人私有暂存');
  assert.ok(!JSON.stringify(superFilter).includes('"p1"'), '超管不受项目可见性限制（直接按 PROJECT 全量）');
  assert.ok(
    superFilter.OR.some((c) => c.accessScope === 'PRIVATE_STAGING' && c.ownerUserId === 'u-super'),
    '超管只能列出自己的暂存',
  );
  assert.ok(
    superFilter.OR.some((c) => c.accessScope === 'PRIVATE_STAGING' && c.ownerUserId === null && c.uploadedById === null),
    '超管可列出未分类历史文件以便人工分类',
  );
  assert.equal(SHARED_READ_PERMISSION.REGULATORY_DOCUMENT, 'regulatory_documents.view');
});

// ── 历史归属分类规则（与回填脚本/迁移共用同一实现）─────────────────────────────
test('RF05-U10 历史归类优先级：项目内实体 > 法规共享库 > 头像公共 > 未分类', async () => {
  const { classifyFromAttachments, fileDeleteGuard } = await import('../../dist/modules/files/fileCommands.js');
  const taskRef = { id: 'a1', entityType: 'TASK', entityId: 't1' };
  const docRef = { id: 'a2', entityType: 'REGULATORY_DOCUMENT', entityId: 'd1' };
  const resolver = (type, id) => (type === 'TASK' && id === 't1' ? 'p1' : null);

  const projectFirst = classifyFromAttachments({ attachments: [docRef, taskRef] }, resolver);
  assert.equal(projectFirst.scope, 'PROJECT', `项目内实体应优先：${JSON.stringify(projectFirst)}`);
  assert.equal(projectFirst.ownerProjectId, 'p1');

  const onlyDoc = classifyFromAttachments({ attachments: [docRef] }, resolver);
  assert.equal(onlyDoc.scope, 'SHARED_LIBRARY');
  assert.equal(onlyDoc.sharedReadPermission, 'regulatory_documents.view');

  const avatar = classifyFromAttachments({ attachments: [], isUserAvatar: true }, resolver);
  assert.equal(avatar.scope, 'PUBLIC');

  const nothing = classifyFromAttachments({ attachments: [{ id: 'a3', entityType: 'DOCUMENT', entityId: 'x' }] }, resolver);
  assert.equal(nothing.scope, 'PRIVATE_STAGING', '推导不出来必须保持未分类（不自动公开）');

  // 任务ID 解析不到项目（已删除/缺失）→ 不得回落成公开
  const dangling = classifyFromAttachments({ attachments: [{ id: 'a4', entityType: 'TASK', entityId: 'gone' }] }, resolver);
  assert.equal(dangling.scope, 'PRIVATE_STAGING');
});

test('RF05-U11 删除守卫：被证据引用的文件只能解绑，不得整体删除', async () => {
  const { fileDeleteGuard } = await import('../../dist/modules/files/fileCommands.js');
  const blocked = fileDeleteGuard([
    { id: 'a1', entityType: 'REGULATORY_DOCUMENT', entityId: 'd1', label: 'original', deletedAt: null },
  ]);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'FILE_REFERENCED_BY_EVIDENCE');

  const labelEvidence = fileDeleteGuard([
    { id: 'a2', entityType: 'TASK', entityId: 't1', label: 'evidence', deletedAt: null },
  ]);
  assert.equal(labelEvidence.ok, false, 'label=evidence 同样属于证据引用');

  const ok = fileDeleteGuard([
    { id: 'a3', entityType: 'TASK', entityId: 't1', label: 'attachment', deletedAt: null },
    { id: 'a4', entityType: 'REGULATORY_DOCUMENT', entityId: 'd1', label: 'original', deletedAt: new Date() },
  ]);
  assert.equal(ok.ok, true, '已删除的附件不阻止删除');
});
