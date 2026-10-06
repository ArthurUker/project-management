"""Compile planning artifacts from current ledgers; no product or ledger writes."""
import collections
import csv
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
P = ROOT / 'docs/remediation/2026-10-01-rdpms'
S = P / 'execution/supplements/parallel-lr7-2026-10-04-p01'


def read(p):
    return json.loads(p.read_text(encoding='utf-8-sig'))


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def write(name, data):
    p = OUT / name
    if p.exists():
        raise RuntimeError('Refuse overwrite: ' + str(p))
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')


domains = {
    'A': {'title': '账号、认证与会话', 'tasks': ['RP01-T02', 'RP01-T03', 'RP02-T02', 'RP03-T01', 'RP03-T02']},
    'B': {'title': '项目关系、注册项目与负责人', 'tasks': ['RP05-T02', 'RP05-T03', 'RP06-T01', 'RP06-T02', 'RP07-T02']},
    'C': {'title': '任务 revision 与报告状态', 'tasks': ['RP10-T01', 'RP10-T03']},
    'D': {'title': '回执事务与同步生产者', 'tasks': ['RP09-T01', 'RP09-T02', 'RP13-T03']},
    'E': {'title': '离线身份、缓存、队列与恢复', 'tasks': ['RP08-T02', 'RP11-T01', 'RP11-T02', 'RP11-T03', 'RP12-T01', 'RP12-T02']},
    'F': {'title': '文件、历史数据与模块恢复', 'tasks': ['RP14-T02', 'RP15-T01', 'RP15-T02', 'RP15-T03', 'RP16-T01', 'RP16-T02', 'RP16-T03']},
    'G': {'title': '备份、候选构建、灾备与最终对账', 'tasks': ['RP17-T02', 'RP17-T03', 'RP18-T01', 'RP18-T02', 'RP18-T03', 'RP19-T02', 'RP19-T03', 'RP19-T04']},
}
preparation = {
    'LP-01': {'title': '回执与删除恢复合同差分补齐', 'decisions': ['T-RP-02', 'T-RP-07'],
              'sources': ['window-c-receipts/decision-draft.json', 'window-c-receipts/current-contract.md',
                          'window-c-receipts/acceptance-draft.csv', 'window-c-receipts/interface-notes.md'],
              'products': ['receipt-contract-addendum.md', 'failure-recovery-matrix.csv', 'command-scope-matrix.csv', 'acceptance-spec.json']},
    'LP-02': {'title': '认证与离线归属联合批准缺口', 'decisions': ['T-RP-09', 'T-RP-01', 'T-RP-12', 'D-S01-04'],
              'sources': ['window-d-auth/decision-draft.json', 'window-d-auth/interface-notes.md',
                          'window-f-cache/cache-recovery-matrix.csv', 'window-f-cache/interface-notes.md'],
              'products': ['auth-owner-contract-addendum.md', 'identity-response-matrix.csv', 'last-copy-recovery-matrix.csv', 'acceptance-spec.json']},
    'LP-03': {'title': '独立业务规则与小范围修复批准表',
              'decisions': ['D-S01-01', 'D-S01-02', 'D-S01-03', 'D-S01-05', 'D-S01-06', 'D-S01-07', 'D-S01-08', 'T-RP-05', 'T-RP-06'],
              'sources': [],
              'products': ['decision-gap-table.csv', 'bounded-fix-order.md', 'acceptance-spec.json']},
    'LP-04': {'title': '客户端、水位、环境预算与补验输入',
              'decisions': ['T-RP-03', 'T-RP-04', 'T-RP-08', 'T-RP-10', 'T-RP-11', 'T-RP-13'],
              'sources': ['window-e-revision/decision-draft.md', 'window-e-revision/evidence/external-client-evidence-request.md',
                          'window-f-cache/watermark-options.md', 'window-f-cache/approval-request.md'],
              'products': ['external-input-requests.json', 'environment-readiness.json', 'validation-plan.json', 'case-evidence-gap-table.csv', 'budget-and-release-gap-table.csv']},
}
priorities = ['RP09-T01', 'RP02-T02', 'RP03-T01', 'RP03-T02', 'RP11-T01', 'RP01-T02', 'RP14-T02',
              'RP10-T03', 'RP10-T01', 'RP06-T01', 'RP07-T02', 'RP05-T02', 'RP09-T02',
              'RP11-T02', 'RP11-T03', 'RP08-T02', 'RP12-T01', 'RP12-T02', 'RP13-T03',
              'RP16-T01', 'RP16-T02', 'RP16-T03', 'RP17-T02', 'RP18-T01', 'RP18-T02',
              'RP17-T03', 'RP18-T03', 'RP19-T02', 'RP19-T03', 'RP15-T01', 'RP15-T02',
              'RP15-T03', 'RP06-T02', 'RP19-T04', 'RP01-T03', 'RP05-T03']
# RP13-T03 and other tasks are always selected by true prerequisites first; priority is only a tie-breaker.

notes = {
    'RP01-T02': '等级/reset子范围与强制改密分别判门禁；不重做B17、不改变seed/自定义角色绑定。',
    'RP01-T03': '可选扩展未激活；不为了54/54而默认实施。',
    'RP02-T02': '单次消费、family继承与真实expiresIn；客户端联合验收依赖RP03-T01，不作为实施阻碍。',
    'RP03-T01': '旧成功、旧失败、原请求三类都绑定发起身份；403/离线与401分开，真实JWT及双tab单列验收。',
    'RP03-T02': 'D-S01-04及T-RP-09须分别批准；S03-OI-06复用D-S01-04，无重复签署。',
    'RP05-T02': '保留ID、显式delta/权限及获准删除合同；不改现有保护使错误fixture通过。',
    'RP05-T03': '可选DAG未激活；相向并发写入必须有真实屏障，不能以单请求check证明。',
    'RP06-T01': '所有登记的registration入口和字段按D-S01-05；普通同步读权限已接受，不重做RP08-T01。',
    'RP06-T02': '依赖RP06-T01和RP07-T02；只共享已批准manager命令。',
    'RP07-T02': 'S03-OI-07复用D-S01-06；拒绝及成员/project事务原子性都验收。',
    'RP08-T02': 'T-RP-04及T-RP-12都需要；RP11-T01仅为验收依赖；不得删除撤权后的唯一outbox副本。',
    'RP09-T01': '每命令原子，批次允许已有逐项持久结果；delete适配不改时相关条件门禁不适用，但共享helper若影响delete须重新判定。',
    'RP09-T02': '原key/hash不变；查询/回放验证当前授权；留存RELEASE门禁不扩大为全部实现阻碍。',
    'RP10-T01': 'RP00-T03的实现COMPLETE不证明S03-OI-09受支持客户端资料齐；启用严格CAS前仍核对实际版本矩阵。',
    'RP10-T03': '仅来源状态/复提政策；已接受报告快照与迟到写保护不重复返工。',
    'RP11-T01': 'BOOTSTRAPPING不是logout；owner/代际/ACL回退覆盖实际页面，先证明非空成功夹具。',
    'RP11-T02': '未知owner只隔离保全；不得从内容或首个登录认领；abort/blocked/versionchange与多tab重入单列。',
    'RP11-T03': 'IDB原子转移及最后副本；用户恢复/导出要当前owner和授权；不得新造自动丢弃策略。',
    'RP12-T01': '条数和实际UTF-8 body bytes同时限额；不可变发送记录；环境上限未知不填拍脑袋数值。',
    'RP12-T02': '严格按key验证完整/唯一结果；missing/duplicate/unknown不出队；依赖业务/IDB原子合同。',
    'RP13-T03': 'producer覆盖HTTP/sync/import/restore/cascade；epoch/游标过期/每页授权及同资源revision顺序独立证明。',
    'RP14-T02': 'INFECTED阻断保持；FAILED/SKIPPED及metadata/elevated/audit采用T-RP-05明确规则。',
    'RP15-T01': '已有静态查询，不重复写查询充数；缺少获准实际schema/异常结果时继续ENV_BLOCKED；不连接真实库。',
    'RP15-T02': '必须先有实际异常及数据owner处置；不能自动重挂/删除；批准锁/兼容方案再写新迁移。',
    'RP15-T03': '只在自有合成库演练新迁移；不重写已应用migration，不执行真实数据恢复。',
    'RP16-T01': '完整主键/单列与复合unique/FK registry；JSON模块支持范围明确，不称整库镜像。',
    'RP16-T02': 'apply重校验、真实计数、无静默skipDuplicates；commit后失败不伪称回滚。',
    'RP16-T03': 'epoch/session/receipt/cursor/草稿影响按T-RP-10；模块恢复与整库DR分开。',
    'RP17-T02': 'run锁、staging、不可变manifest、成对保留；不删除最后已验证恢复点或他人stage。',
    'RP17-T03': '依赖RP17-T02；目标Linux/FS证明不能由macOS/stub替代，环境缺失如实记ENV_BLOCKED。',
    'RP18-T01': 'candidate先build/config后DDL；实际配置消费与compiled CLI；不安装升级、不执行真实部署。',
    'RP18-T02': 'first-safe回退不得选已知危险旧版本；仅修改与自有模拟验证，真实切流未授权。',
    'RP18-T03': '须隔离candidate/目标兼容环境；源码/CLI mock不替代实际应用行为。',
    'RP19-T02': '真实一致时点及DB/files恢复对；标签相同不是一致性证据；只合成资源演练。',
    'RP19-T03': '按具体candidate加载门禁，不以20包全完成作发布前置；不授权发布。',
    'RP19-T04': '最终总体关闭条件未满足，延后；禁止反复生成中间对账替代实质实施。',
}

graph = read(P / 'TASK_GRAPH.json')
state = read(P / 'IMPLEMENTATION_STATE.json')
packages = {x['id']: x for x in read(P / 'PACKAGES.json')['packages']}
decisions = read(P / 'DECISION_REGISTER.json')['decisions']
gates = read(P / 'OPEN_ITEM_GATES.json')['items']
contracts = read(P / 'CROSS_PACKAGE_CONTRACTS.json')
matrix = list(csv.DictReader((P / 'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
task_map = {t['id']: t for t in graph['tasks']}
unfinished = {tid for tid, t in state['tasks'].items() if t['implementation'] != 'COMPLETE'}
partitioned = [tid for x in domains.values() for tid in x['tasks']]
assert len(partitioned) == 36 and len(set(partitioned)) == 36 and set(partitioned) == unfinished
assert len(priorities) == len(set(priorities)) == 36 and set(priorities) == unfinished
assert set(d['id'] for d in decisions) == {d for x in preparation.values() for d in x['decisions']}

domain_for = {tid: did for did, d in domains.items() for tid in d['tasks']}
decision_for = {d: lp for lp, v in preparation.items() for d in v['decisions']}
inputs = ['EXECUTOR_PROMPT.md', 'REMEDIATION_PLAN.md', 'DECISIONS_AND_GATES.md',
          'CROSS_PACKAGE_CONTRACTS.md', 'CROSS_PACKAGE_CONTRACTS.json', 'TASK_GRAPH.json',
          'DECISION_REGISTER.json', 'OPEN_ITEM_GATES.json', 'PACKAGES.json', 'PACKAGES.md',
          'RELEASE_GATES.json', 'FINDING_TO_PACKAGE.json', 'ACCEPTANCE_MATRIX.csv',
          'IMPLEMENTATION_STATE.json', 'HANDOFF.md', 'execution/state.json', 'execution/handoff.md',
          'execution/remaining-task-gates.csv', 'execution/all54-task-status.csv',
          'execution/parallel-2026-10-04/BATCH_MANIFEST.json']
input_hashes = {str((P / n).relative_to(ROOT)): sha(P / n) for n in inputs}
review_sources = [ROOT / 'docs/remediation/2026-10-05-seal-correction-review/REVIEW.md',
                  ROOT / 'docs/remediation/2026-10-05-seal-correction-review/canonical-reference-index.json',
                  ROOT / 'docs/remediation/2026-10-05-seal-correction-review/NEXT_EXECUTION_PROMPT.md',
                  P / 'execution/RP00/RP00-T02/evidence/failure-point-matrix.json']
for path in review_sources:
    input_hashes[str(path.relative_to(ROOT))] = sha(path)

case_bindings = []
cards = []
for tid in sorted(unfinished):
    t = task_map[tid]
    pk = packages[t['packageId']]
    current = state['tasks'][tid]
    unmet = [d for d in t['implementationDependencies'] if state['tasks'][d]['implementation'] != 'COMPLETE']
    implementation_gates = [g for g in t['gateRequirements'] if g['before'] == 'IMPLEMENTATION']
    always_pending = [g['ref'] for g in implementation_gates if g['condition'] == 'always']
    optional = t['activation'] == 'CONDITIONAL_NOT_APPROVED'
    if optional:
        availability = 'OPTIONAL_INACTIVE'
    elif tid == 'RP15-T01':
        availability = 'EXTERNAL_DATA_INPUT_REQUIRED'
    elif tid == 'RP19-T04':
        availability = 'FINAL_CLOSURE_DEFERRED'
    elif unmet:
        availability = 'IMPLEMENTATION_DEPENDENCIES_PENDING'
    else:
        availability = 'APPLICABLE_IMPLEMENTATION_DECISIONS_PENDING'
    allowed_existing = list(pk['existingFileScope'])
    # New module paths proposed in v2 may already exist after earlier execution.
    allowed_proposed = [x for x in pk['proposedNewFiles'] if '<' not in x]
    linked_rows = []
    for line, row in enumerate(matrix, start=2):
        refs = re.findall(r'RP\d{2}-T\d{2}', row.get('task_refs', ''))
        if row['case_id'] in t['acceptanceCaseIds'] or tid in refs:
            linked_rows.append({'caseId': row['case_id'], 'sourceDataRow': line,
                                'sourceResult': row['result'], 'targetBehavior': row['target_behavior'],
                                'environment': row['environment'], 'evidenceRequirement': row['required_evidence'],
                                'expectationStatus': row.get('expectation_status'),
                                'conditionalGateRequirements': row.get('conditional_gate_requirements'),
                                'taskRefsAsDeclared': row.get('task_refs'), 'decisionRefsAsDeclared': row.get('decision_refs')})
            case_bindings.append({'taskId': tid, 'caseId': row['case_id'], 'sourceDataRow': line,
                                  'sourceResult': row['result'], 'planningStatus': 'SPECIFICATION_ONLY',
                                  'source': 'docs/remediation/2026-10-01-rdpms/ACCEPTANCE_MATRIX.csv'})
    missing_cases = set(t['acceptanceCaseIds']) - {x['caseId'] for x in linked_rows}
    assert not missing_cases, (tid, missing_cases)
    cards.append({'id': tid, 'domain': domain_for[tid], 'title': t['title'],
                  'currentImplementation': current['implementation'], 'currentValidation': current['validation'],
                  'release': current['release'], 'availabilityAtCheckpoint': availability,
                  'activation': t['activation'], 'requiredForPackageCompletion': t['requiredForPackageCompletion'],
                  'implementationDependencies': t['implementationDependencies'], 'unmetImplementationDependencies': unmet,
                  'acceptanceDependencies': t['acceptanceDependencies'], 'gateRequirements': t['gateRequirements'],
                  'pendingAlwaysImplementationRefs': always_pending, 'contractRefs': t['contractRefs'],
                  'currentEvidenceRefsAsRecorded': current.get('evidence', []),
                  'packageFindingIds': pk['findingIds'], 'historicalCardRefs': pk['priorCardRefs'],
                  'originalPackageExistingFileCeiling': allowed_existing,
                  'originalProposedModulePaths': allowed_proposed,
                  'schemaChangeRule': 'Only approved exact schema/migration design; never inherit a whole migration-directory write grant.',
                  'requiresTaskSpecificAllowlistBeforeCode': True,
                  'taskBoundary': notes[tid], 'inheritedPackageSteps': pk['implementationSteps'],
                  'acceptanceRows': linked_rows, 'acceptanceCaseIdsFromGraph': t['acceptanceCaseIds'],
                  'newFixtureRule': 'Register exact owned test paths before execution. No tests/builds in preparation mode.',
                  'implementationMode': 'FINAL_RECONCILIATION_ONLY' if tid == 'RP19-T04' else
                                        ('OWNER_APPROVED_READONLY_INPUT_ONLY' if tid == 'RP15-T01' else 'GATED_LOCAL_STANDARD'),
                  'relativeEffort': pk['relativeEffort'], 'rollbackRequirements': pk['rollback'],
                  'priority': priorities.index(tid) + 1,
                  'delivery': ['authorization.json', 'change-summary.md', 'evidence/', 'acceptance.json',
                               'rollback.md', 'task-state.json', 'handoff.md'],
                  'executionStartedByPlanning': False})

completed_validation = []
for tid, current in state['tasks'].items():
    if current['implementation'] == 'COMPLETE' and current['validation'] != 'PASS':
        t = task_map[tid]
        completed_validation.append({'taskId': tid, 'title': t['title'], 'implementation': 'COMPLETE',
                                     'validation': current['validation'], 'gateRequirements': t['gateRequirements'],
                                     'acceptanceDependencies': t['acceptanceDependencies'],
                                     'caseIds': t['acceptanceCaseIds'], 'evidenceRefsAsRecorded': current.get('evidence', []),
                                     'executionModeNow': 'PREPARE_OR_REUSE_EVIDENCE_ONLY',
                                     'noAutoReimplementation': True})
assert len(completed_validation) == 8

packets = []
for d in decisions:
    lp = decision_for[d['id']]
    source_refs = []
    for rel in preparation[lp]['sources']:
        q = S / rel
        source_refs.append({'pathBase': 'REPOSITORY', 'path': str(q.relative_to(ROOT)),
                            'exists': q.exists(), 'sha256': sha(q) if q.is_file() else None})
        if q.is_file():
            input_hashes[str(q.relative_to(ROOT))] = sha(q)
    packets.append({'id': d['id'], 'preparationWorkId': lp, 'topic': d['topic'], 'kind': d['kind'],
                    'statusAtCheckpoint': d['status'], 'ownerRoles': d['ownerRoles'], 'originalScope': d['scope'],
                    'optionsAsRecorded': d.get('options', []), 'affectedTaskIdsAsRecorded': d['affectedTaskIds'],
                    'contractRefs': d['contractRefs'], 'approvalEvidenceRequired': d['approvalEvidenceRequired'],
                    'reuseSourceRefs': source_refs,
                    'proposedChoice': None, 'approvedBy': None, 'approvedAt': None, 'evidenceRef': None,
                    'executionApprovalMeaning': 'Local implementation authorization does not approve this decision.'})

counts = {axis: dict(collections.Counter(v[axis] for v in state['tasks'].values()))
          for axis in ['implementation', 'validation', 'release']}
history_observations = {n: {'sha256AtObservation': sha(P / n), 'comparisonAtEnd': 'NOT_REQUIRED_CONCURRENT_OWNER_MUTABLE'}
                        for n in ['REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json']}
write('INPUT_MANIFEST.json', {'date': '2026-10-05', 'pathBase': 'REPOSITORY', 'stableInputFileHashes': input_hashes,
                              'concurrentOwnerMutableRecords': history_observations,
                              'rule': 'Do not treat authorized CodeBuddy history appends or new runtime files as plan-source drift.'})
write('INITIAL_STATE.json', {'date': '2026-10-05', 'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                            'taskCounts': counts, 'remainingImplementation': 36, 'remainingRequired': 34,
                            'optionalInactive': 2, 'completedImplementationWithOpenValidation': 8,
                            'additionalOpenCasesOnAcceptedTasks': 13,
                            'acceptanceRows': len(matrix), 'acceptanceCounts': dict(collections.Counter(r['result'] for r in matrix)),
                            'taskStateSnapshot': state['tasks'], 'decisionsApprovedByThisPlan': False,
                            'executionAuthorizedByThisPlanningTurn': False})
write('WORK_ITEMS.json', {'date': '2026-10-05', 'authority': 'Original v2 task graph remains the task-definition authority.',
                         'taskCount': 36, 'tasks': cards, 'scopeModeNow': 'PREPARATION_ONLY'})
write('VALIDATION_BACKLOG.json', {'count': 8, 'notAdditionalImplementationTasks': True, 'tasks': completed_validation})
write('DECISION_PACKETS.json', {'count': 21, 'preparationPackages': preparation, 'decisions': packets,
                              'noApprovalGranted': True})
write('COORDINATION.json', {'date': '2026-10-05', 'codebuddyState': 'USER_REPORTED_EXECUTING_SEAL_OVERLAY',
                           'codebuddyWritePrefix': str((S / 'integration/seal-overlay-2026-10-05-02').relative_to(ROOT)),
                           'codebuddyRootRecordOwnership': ['REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json'],
                           'lunaPreparationWritePrefix': 'docs/remediation/2026-10-05-luna-remaining-execution/preparation/',
                           'businessImplementationEnabled': False,
                           'implementationCoordinationReleaseRequires': ['Explicit CodeBuddy writer-stopped confirmation with evidence',
                                                                       'Fresh task-specific source/ledger baseline',
                                                                       'Current scope-specific decision and input checks',
                                                                       'User forwards separate implementation prompt'],
                           'preparationDoesNotWaitForMetadataSealPASS': True,
                           'businessCoordinationIsNotNewProductGate': True,
                           'sharedFileOwnersAtCurrentPlanningCheckpoint': 'No concurrent product writer assigned; future business tasks serial in Luna.',
                           'sharedPathsAsRecorded': contracts['sharedFileCoordination']})
with (OUT / 'REMAINING_TASKS.csv').open('x', newline='', encoding='utf-8-sig') as f:
    cols = ['taskId', 'domain', 'title', 'implementation', 'validation', 'availability',
            'unmetImplementationDependencies', 'implementationGates', 'validationGates', 'releaseGates',
            'acceptanceDependencies', 'activation', 'priority']
    w = csv.DictWriter(f, fieldnames=cols); w.writeheader()
    for card in cards:
        t = task_map[card['id']]
        w.writerow({'taskId': card['id'], 'domain': card['domain'], 'title': card['title'],
                    'implementation': card['currentImplementation'], 'validation': card['currentValidation'],
                    'availability': card['availabilityAtCheckpoint'],
                    'unmetImplementationDependencies': ';'.join(card['unmetImplementationDependencies']),
                    **{k: json.dumps([g for g in t['gateRequirements'] if g['before'] == before], ensure_ascii=False)
                       for k, before in [('implementationGates', 'IMPLEMENTATION'), ('validationGates', 'VALIDATION'), ('releaseGates', 'RELEASE')]},
                    'acceptanceDependencies': ';'.join(t['acceptanceDependencies']), 'activation': t['activation'], 'priority': card['priority']})
with (OUT / 'ACCEPTANCE_BINDINGS.csv').open('x', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=['taskId', 'caseId', 'sourceDataRow', 'sourceResult', 'planningStatus', 'source'])
    w.writeheader();w.writerows(case_bindings)
write('DOMAIN_MAP.json', {'domains': domains, 'domainCount': 7, 'parallelBusinessPermission': False,
                         'partitionMeaning': 'Ownership and scheduling groups, not permission for seven shared-checkout writers.'})
changed = [p for p, h in input_hashes.items() if sha(ROOT / p) != h]
assert not changed, changed
print(json.dumps({'remaining': len(cards), 'required': sum(t['requiredForPackageCompletion'] for t in cards),
                  'optional': sum(t['activation'] == 'CONDITIONAL_NOT_APPROVED' for t in cards),
                  'validationBacklog': len(completed_validation), 'decisionCoverage': len(packets),
                  'caseBindings': len(case_bindings), 'stableInputs': len(input_hashes),
                  'nonexistentDeclaredReuseSources': sorted({r['path'] for d in packets for r in d['reuseSourceRefs'] if not r['exists']})},
                 ensure_ascii=False, indent=2))
