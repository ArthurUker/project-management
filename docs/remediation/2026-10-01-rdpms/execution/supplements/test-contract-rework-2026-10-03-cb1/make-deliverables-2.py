"""Deliverables part 2: SUP-03 seven-type artifacts (REVIEW_ONLY)."""
import json, pathlib

SESSION = pathlib.Path(__file__).resolve().parents[0]


def write(path, text):
    target = SESSION / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text if text.endswith('\n') else text + '\n')


def write_json(path, payload):
    write(path, json.dumps(payload, ensure_ascii=False, indent=2))


write_json('SUP-03/authorization.json', {
    'supplementId': 'SUP-03',
    'parentTaskIds': ['RP04-T01', 'RP08-T01'],
    'kind': 'REVIEW_ONLY',
    'originalFinding': 'LR4-02',
    'currentFindings': ['LR5-03', 'LR5-04'],
    'sessionId': SESSION.name,
    'executor': 'CodeBuddy',
    'userInstructionSource': 'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'allowedWrites': ['docs/remediation/2026-10-01-rdpms/execution/supplements/'
                      'test-contract-rework-2026-10-03-cb1/ (new only)'],
    'businessSourceChangesAuthorized': False,
    'frontendChangesAuthorized': False,
    'schemaOrMigrationChangesAuthorized': False,
    'phaseFilterImplementationAuthorized': False,
    'readScope': ['backend/src/routes/projects.js', 'backend/src/routes/phases.js',
                  'backend/src/routes/sync.js', 'backend/src/kernel/projectAccess.js',
                  'prisma/schema.prisma (targeted)', 'frontend/src/api/endpoints/projects.ts',
                  'frontend/src/pages/ProjectDetail.tsx (targeted)',
                  'frontend/src/components/PhaseProgressBar.tsx (targeted)'],
    'newDynamicProbes': False,
    'browserOrUiRuns': False,
    'stopConditions': ['SUP-03 read-only review delivered and sealed', 'independent review pending'],
})

write('SUP-03/change-summary.md', '''# SUP-03 变更摘要（REVIEW_ONLY）

本项**没有修改任何仓库既有文件**：不改动 `backend/src`、`frontend/src`、schema、迁移、
其他正式测试或共享 helper。增量只在本 session 目录内新增文档与证据。

## 1. 补齐上一轮遗漏的入口（LR5-03）

- `GET /api/projects/:id` 详情内嵌 `phases`（`projects.js:328/341`）：聚合未过滤 `deletedAt`。
- `GET /api/phases`（无 projectId 的全局列表，`phases.js:42-50`）：走 `projectVisibilityFilter`、
  `take: 500`，未过滤 `deletedAt`。

## 2. 直接客户端调用链（一层）

- `projects.ts:39` 只定义访问器；在 `frontend/src` 定向检索 `projectAPI.phases` / `.phases(` 命中 0
  → `lookupResult=NOT_FOUND`（封装存在不等于实际调用）。
- `ProjectDetail.tsx:51` 实际调用 `projectAPI.get(id)`；`ProjectDetail.tsx:198` 把 `template` 与 `tasks`
  传给 `PhaseProgressBar`；`PhaseProgressBar.tsx:32-40` 从 `template.content.phases` 派生
  （**模板阶段**，不是 `ProjectPhase` 实例列表）。
- 实际页面是否显示软删阶段实例：`NOT_RUN`（无浏览器验收；静态不能代动态）。

## 3. 写入 / 恢复链路与易混淆项

- API 可达阶段软删：`POST /api/sync/push` 的 `op=delete`（`sync.js:217-225`、`596-609`），
  独立权限 `project_phases.delete`。
- 阶段资源 DELETE / restore：`NOT_FOUND`（`phases.js` 无 `delete('/:id')`、无 restore；
  同步 upsert 到已墓碑行不清 `deletedAt`，见 `sync.js:653-673`）。
- `phases.js:194` `DELETE /:id/transitions/:toPhaseId` 删的是 **PhaseTransition 边**，
  不是阶段实例——不得笼统说“文件无 DELETE 路由”。

## 4. 合同范围（B20）

- 引用 `AC-B20-01/02/03`、`PAC-RP04-03` 原文：全部是**项目级**软删范围
  （list / count / search / stats / detail / 回收站），不覆盖阶段实例过滤。
- 不自动把 B20 扩大为阶段规则，也不因普通阶段视图例外重新打开 B20。
- 阶段过滤政策无具名批准来源 → `CONTRACT_UNRESOLVED`。

## 5. 建议

只给 `KEEP_CURRENT` / `SCOPED_FIX` / `CONTRACT_CLARIFICATION` 三类中**有证据**的选项，
见 `deliverables/next-action.md`；不写业务 patch，不创建或激活实施任务。
''')

write_json('SUP-03/evidence/phase-read-trace.json', {
    'kind': 'STATIC_REVIEW',
    'baselineHead': '138cf2da1b63195cef7e884f69bdf8ded6ed3c21',
    'entrypoints': [
        {'entry': 'GET /api/projects/:id (embedded phases)', 'permission': 'projects.view',
         'scope': 'resolveProjectAccess (deleted/non-member project -> 404; SUPER_ADMIN elevated)',
         'orm': 'include.phases orderBy sortOrder', 'deletedAt': 'not filtered',
         'source': 'rdpms-system/backend/src/routes/projects.js:328; projects.js:341',
         'client': 'ProjectDetail.tsx:51 projectAPI.get; no phases usage found in that page'},
        {'entry': 'GET /api/projects/:id/phases', 'permission': 'project_phases.view + capability read',
         'scope': 'resolveProjectAccess + assertProjectCapability', 'orm': 'findMany where { projectId }',
         'deletedAt': 'not filtered', 'source': 'projects.js:814; projects.js:820-823',
         'client': 'no direct caller found'},
        {'entry': 'GET /api/phases?projectId=', 'permission': 'project_phases.view + capability read',
         'scope': 'resolveProjectAccess + assertProjectCapability', 'orm': 'findMany where { projectId }',
         'deletedAt': 'not filtered', 'source': 'phases.js:32; phases.js:39', 'client': 'no direct caller found'},
        {'entry': 'GET /api/phases (no projectId)', 'permission': 'project_phases.view (no capability assert)',
         'scope': 'projectVisibilityFilter (member/manager; SUPER_ADMIN all)',
         'orm': 'findMany where { project: visible } take 500', 'deletedAt': 'not filtered',
         'source': 'phases.js:42-50 (phases.js:45)', 'client': 'no direct caller found'},
        {'entry': 'GET /api/phases/:id', 'permission': 'project_phases.view (no capability assert)',
         'scope': 'resolveProjectAccess(phase.projectId)', 'orm': 'findUnique where { id }',
         'deletedAt': 'not filtered (soft-deleted phase detail still returned)',
         'source': 'phases.js:92-99', 'client': 'no direct caller found'},
        {'entry': 'sync upserts', 'permission': 'per-entity readPermission',
         'scope': 'byProject acl.projectIds; reports ownOnly', 'orm': 'aliveFilter deletedAt null',
         'deletedAt': 'live only', 'source': 'sync.js:428-436; sync.js:442', 'client': 'NOT_RUN'},
        {'entry': 'sync tombstones', 'permission': 'per-entity readPermission', 'scope': 'same as upserts',
         'orm': 'findMany where tombstoneField not null, select id + tombstoneField',
         'deletedAt': 'tombstones only (id list)', 'source': 'sync.js:452-457; sync.js:469', 'client': 'NOT_RUN'},
    ],
    'writePaths': [
        {'path': 'POST /api/sync/push op=delete (projectPhases)', 'result': 'API-reachable soft delete',
         'permission': 'project_phases.delete (independent code)',
         'source': 'sync.js:217-225; sync.js:596-609'},
        {'path': 'phase-resource DELETE', 'result': 'NOT_FOUND', 'source': "phases.js has no delete('/:id')"},
        {'path': 'phase restore', 'result': 'NOT_FOUND',
         'source': 'sync.js:653-673 generic upsert does not clear deletedAt'},
        {'path': 'DELETE /:id/transitions/:toPhaseId', 'result': 'deletes a PhaseTransition edge, not a phase',
         'source': 'phases.js:194'},
    ],
    'clientChain': {
        'apiWrapper': 'frontend/src/api/endpoints/projects.ts:39',
        'directCaller': 'NOT_FOUND (targeted search over rdpms-system/frontend/src)',
        'actualDetailCaller': 'ProjectDetail.tsx:51 projectAPI.get(id)',
        'progressBarSource': 'ProjectDetail.tsx:198 -> PhaseProgressBar.tsx:32-40 template.content.phases',
        'uiVisibility': 'NOT_RUN',
    },
    'b20Boundary': {
        'AC-B20-01': 'Soft-deleted projects are absent from list, total count, search and ordinary statistics.',
        'AC-B20-02': 'Detail continues returning not found for deleted projects.',
        'AC-B20-03': 'Dedicated recycle-bin query, if present, remains explicit.',
        'PAC-RP04-03': '软删项目在普通 list/count/search/stats 均不出现，详情与专用回收策略一致。',
        'verdict': 'project-level scope; does not cover phase instance filtering',
    },
    'policyApproval': 'CONTRACT_UNRESOLVED (no attributable named approval source found)',
})

write_json('SUP-03/acceptance.json', {
    'supplementId': 'SUP-03', 'parentTaskIds': ['RP04-T01', 'RP08-T01'], 'kind': 'REVIEW_ONLY',
    'originalFinding': 'LR4-02', 'currentFindings': ['LR5-03', 'LR5-04'],
    'cases': [
        {'id': 'SUP-03-01', 'meaning': '入口与写入链覆盖', 'status': 'PASS', 'kind': 'STATIC_REVIEW',
         'evidence': 'SUP-03/deliverables/phase-read-contract.md; SUP-03/evidence/phase-read-trace.json'},
        {'id': 'SUP-03-02', 'meaning': '直接客户端 / B20 合同范围', 'status': 'PASS', 'kind': 'STATIC_REVIEW',
         'evidence': 'SUP-03/deliverables/scope-assessment.md; SUP-03/evidence/phase-read-trace.json',
         'detail': '直接调用者 NOT_FOUND；B20 原文为项目级范围'},
        {'id': 'SUP-03-03', 'meaning': '证据层次与未覆盖', 'status': 'PASS', 'kind': 'STATIC_REVIEW',
         'evidence': 'SUP-03/deliverables/coverage.csv',
         'detail': '静态项 PASS；动态/API/UI 项 NOT_RUN；阶段政策 CONTRACT_UNRESOLVED'},
        {'id': 'SUP-03-04', 'meaning': '具体建议且业务源码零变化', 'status': 'PASS', 'kind': 'STATIC_REVIEW',
         'evidence': 'SUP-03/deliverables/next-action.md',
         'detail': '只给 KEEP_CURRENT/SCOPED_FIX/CONTRACT_CLARIFICATION 有证据选项；源码改动数 0'},
    ],
    'meaning': 'COMPLETE 仅表示本次只读核对交付完整，不是阶段政策批准、业务修复或 UI 验收',
    'notRun': ['阶段 API 动态探针', '浏览器 / 实际 UI', '项目级 B20 验收重跑', '完整 JWT 链'],
    'businessAcceptanceImpact': 'none; B20/RP04/RP08 原状态不变',
})

write('SUP-03/rollback.md', '''# SUP-03 回滚说明（人工撤销范围，不执行）

SUP-03 为 REVIEW_ONLY：本轮**没有修改任何既有仓库文件**（业务源码、前端、schema、
其他正式测试、共享 helper 均零改动）。

人工撤销范围仅限：删除本 session 目录 `SUP-03/`（新增文档与证据）以及
六个受控记录文件中本轮追加的条目（不触碰旧条目）。

不存在业务回滚或生产回滚：本轮未实施阶段过滤、恢复、前端或权限改动，也未部署。
''')

write_json('SUP-03/task-state.json', {
    'supplementId': 'SUP-03', 'parentTaskIds': ['RP04-T01', 'RP08-T01'], 'parentTaskStatusChanged': False,
    'kind': 'REVIEW_ONLY', 'originalFinding': 'LR4-02', 'currentFindings': ['LR5-03', 'LR5-04'],
    'delivery': {'sevenTypeArtifacts': True,
                 'documents': ['phase-read-contract.md', 'scope-assessment.md', 'coverage.csv', 'next-action.md'],
                 'status': 'DELIVERED'},
    'implementation': {'scope': 'read-only contract review', 'srcChanges': 0, 'frontendChanges': 0,
                       'schemaChanges': 0, 'status': 'NO_BUSINESS_CHANGE_BY_DESIGN'},
    'validation': {'status': 'STATIC_REVIEW_PASS',
                   'meaning': '静态核对交付完整；动态/UI/项目级验收 NOT_RUN，静态不能代动态'},
    'independentReview': 'PENDING', 'release': 'NOT_EVALUATED',
    'uncovered': ['阶段过滤政策批准（CONTRACT_UNRESOLVED）', '阶段 API 动态验证', '浏览器/实际 UI',
                  '项目级 B20 验收重跑'],
})

write('SUP-03/handoff.md', '''# SUP-03 交接（待独立审阅）

- 类型：REVIEW_ONLY，关联 RP04-T01 / RP08-T01（状态不变），原映射 LR4-02，本轮处理 LR5-03 及共有 LR5-04。
- 交付：七类产物 + `deliverables/phase-read-contract.md`、`scope-assessment.md`、`coverage.csv`、`next-action.md`。
- 结论：补齐详情内嵌 phases 与全局阶段列表入口；阶段资源 DELETE/restore 为 NOT_FOUND；
  直接调用者 NOT_FOUND；B20 原定义为项目级范围；阶段过滤政策 CONTRACT_UNRESOLVED；UI/动态 NOT_RUN。
- 业务源码、前端、schema 改动数 = 0；未实施阶段过滤、恢复或权限改动。
- 下一步：等待独立审阅；不创建或激活实施任务。
''')

print('SUP-03 deliverables written')
