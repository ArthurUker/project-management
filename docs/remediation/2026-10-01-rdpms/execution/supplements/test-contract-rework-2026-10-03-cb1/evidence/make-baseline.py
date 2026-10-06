"""Build the executor start-baseline for the 2026-10-03 SUP rework session.

Only reads the repository and writes evidence/start-baseline.json inside this
new session directory. Nothing outside this session is modified.
"""
import hashlib, json, pathlib, subprocess, datetime

SESSION = pathlib.Path(__file__).resolve().parents[1]
ROOT = SESSION.parents[5]                       # repository root
PLAN = SESSION.parents[2]                       # docs/remediation/2026-10-01-rdpms


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_map(root, rel_dirs, suffixes=None):
    out = {}
    for rel in rel_dirs:
        base = root / rel
        if not base.exists():
            out[f'__missing__{rel}'] = None
            continue
        for path in sorted(base.rglob('*')):
            if path.is_file():
                rel_path = path.relative_to(root).as_posix()
                if suffixes and not any(rel_path.endswith(s) for s in suffixes):
                    continue
                out[rel_path] = sha256(path)
    return out


def dir_digest(root, rel):
    base = root / rel
    if not base.exists():
        return {'exists': False}
    files = sorted(p for p in base.rglob('*') if p.is_file())
    digests = {p.relative_to(base).as_posix(): sha256(p) for p in files}
    combined = hashlib.sha256(
        ''.join(f'{k}:{v}\n' for k, v in sorted(digests.items())).encode()
    ).hexdigest()
    return {'exists': True, 'fileCount': len(files), 'files': digests, 'combinedSha256': combined}


def git(*args):
    res = subprocess.run(['git', *args], cwd=ROOT, text=True, capture_output=True)
    return res.returncode, res.stdout, res.stderr


head = git('rev-parse', 'HEAD')[1].strip()
status = git('status', '--short')[1]
diff_check_code, diff_check_out, diff_check_err = git('diff', '--check')

business_sources = file_map(ROOT, ['rdpms-system/backend/src', 'rdpms-system/frontend/src'])
tests = file_map(ROOT, ['rdpms-system/backend/tests', 'rdpms-system/frontend/tests'],
                 suffixes=['.mjs', '.ts', '.tsx', '.js'])
schema_guard = file_map(ROOT, [
    'rdpms-system/backend/prisma/schema.prisma',
    'rdpms-system/backend/prisma/migrations',
    'rdpms-system/backend/scripts/test-db.mjs',
    'rdpms-system/backend/package.json',
    'rdpms-system/backend/package-lock.json',
    'rdpms-system/backend/tsconfig.json',
    'rdpms-system/frontend/package.json',
    'rdpms-system/frontend/package-lock.json',
    'rdpms-system/frontend/tsconfig.json',
])

frozen_plan_inputs = [
    'TASK_GRAPH.json', 'PACKAGES.json', 'FINDING_TO_PACKAGE.json', 'ACCEPTANCE_MATRIX.csv',
    'execution/all54-task-status.csv', 'execution/remaining-task-gates.csv', 'REMEDIATION_PLAN.md',
    'DECISION_REGISTER.json', 'DECISIONS_AND_GATES.md', 'OPEN_ITEM_GATES.json',
    'CROSS_PACKAGE_CONTRACTS.json', 'CROSS_PACKAGE_CONTRACTS.md', 'RELEASE_GATES.json',
    'INPUT_MANIFEST.json', 'REVISION_INPUT_MANIFEST.json', 'PLAN_VALIDATION.json', 'REVIEW_ENTRY.md',
]
frozen_inputs = {rel: (sha256(PLAN / rel) if (PLAN / rel).exists() else None) for rel in frozen_plan_inputs}

mutable_records = [
    'IMPLEMENTATION_STATE.json', 'execution/state.json', 'HANDOFF.md',
    'execution/handoff.md', 'REVISION_HISTORY.json', 'EXECUTION_REVISION_HISTORY.json',
]
records = {rel: (sha256(PLAN / rel) if (PLAN / rel).exists() else None) for rel in mutable_records}

frozen_roots = [
    'execution/supplements/test-contract-2026-10-03',
    'execution/reviews',
    'execution/RP10', 'execution/RP08', 'execution/RP04', 'execution/RP02',
    'execution/CODEBUDDY_TEST_CONTRACT_EXECUTOR_PROMPT_2026-10-03.md',
    'execution/CODEBUDDY_TEST_CONTRACT_PROMPT_MANIFEST_2026-10-03.json',
    'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_MANIFEST_2026-10-03.json',
]
frozen = {rel: dir_digest(PLAN, rel) for rel in frozen_roots}

audits = dir_digest(ROOT, 'docs/audits')

state = json.loads((PLAN / 'IMPLEMENTATION_STATE.json').read_text())
exec_state = json.loads((PLAN / 'execution/state.json').read_text())


def counts(obj):
    """Mirror the existing run-state counts verbatim; never recompute a different definition."""
    declared = obj.get('counts')
    tasks = obj.get('tasks')
    task_count = len(tasks) if isinstance(tasks, dict) else (len(tasks) if isinstance(tasks, list) else None)
    return {
        'declaredCounts': declared,
        'taskEntryCount': task_count,
        'note': 'existing run-state mirror read as-is; this session does not alter it',
    }


baseline = {
    'sessionId': SESSION.name,
    'createdOn': '2026-10-03',
    'executor': 'CodeBuddy',
    'promptRef': 'execution/CODEBUDDY_SUPPLEMENT_REWORK_PROMPT_2026-10-03.md',
    'authorityReviewRef': 'execution/reviews/2026-10-03-codebuddy-supplements/REVIEW.md',
    'pathBases': {
        'repositoryFiles': 'REPOSITORY_ROOT',
        'planFiles': 'PLAN_DIRECTORY',
        'frozenRoots': 'EACH_DIRECTORY_ROOT',
    },
    'git': {
        'head': head,
        'statusShort': status,
        'diffCheckExit': diff_check_code,
        'diffCheckOutput': (diff_check_out + diff_check_err).strip(),
    },
    'counts': {
        'businessSourceFiles': len(business_sources),
        'testFiles': len(tests),
        'frozenRootCount': len(frozen_roots),
    },
    'businessSourceFileHashes': business_sources,
    'untrackedBusinessSourceFiles': [
        'rdpms-system/backend/src/modules/files/fileReadService.ts',
        'rdpms-system/backend/src/modules/projects/projectCommands.ts',
    ],
    'formalTests': {
        'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs': sha256(
            ROOT / 'rdpms-system/backend/tests/integration/rp10-report-submit-snapshot.integration.test.mjs'),
        'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs': sha256(
            ROOT / 'rdpms-system/backend/tests/integration/rp08-sync-read-authorization.integration.test.mjs'),
        'startCopies': {
            'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start': sha256(
                SESSION / 'evidence/start-copies/rp10-report-submit-snapshot.integration.test.mjs.start'),
            'evidence/start-copies/rp08-sync-read-authorization.integration.test.mjs.start': sha256(
                SESSION / 'evidence/start-copies/rp08-sync-read-authorization.integration.test.mjs.start'),
        },
    },
    'testFiles': tests,
    'schemaGuardDependencyConfig': schema_guard,
    'frozenPlanInputs': frozen_inputs,
    'mutableRecordFiles': records,
    'frozenRoots': frozen,
    'docsAudits': audits,
    'originalCounts': {
        'IMPLEMENTATION_STATE.json': counts(state),
        'execution/state.json': counts(exec_state),
        'note': 'run-state mirror only; original 54 tasks / 306 acceptance rows are not modified this session',
    },
    'historicalEvidenceGap': {
        'oldExecutorSessionStartBaseline': 'HISTORICAL_EVIDENCE_UNAVAILABLE',
        'detail': '旧 session test-contract-2026-10-03 未保存规定起始 manifest/完整文件集/清理记录；本轮不倒填、不重建当时起点，只在新 errata 说明。',
    },
    'generatedAt': datetime.datetime.now().astimezone().isoformat(),
}

(SESSION / 'evidence/start-baseline.json').write_text(
    json.dumps(baseline, ensure_ascii=False, indent=2) + '\n')
print('businessSourceFiles', len(business_sources))
print('testFiles', len(tests))
print('frozenRoots', len(frozen_roots), 'files', sum(v.get('fileCount', 0) for v in frozen.values()))
print('head', head, 'diffCheckExit', diff_check_code)
