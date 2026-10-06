import json, hashlib, pathlib, csv, collections, subprocess, datetime
R=pathlib.Path.cwd()
S=R/'docs/remediation/2026-10-05-luna-remaining-execution/implementation/2026-10-05-sync-receipts-01'
P=R/'docs/remediation/2026-10-01-rdpms'
A=S.parent/'2026-10-05-auth-lineage-01/before/records'
def rel(p): return str(p.relative_to(R))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def read(p): return json.loads(p.read_text())
def writej(p,d): p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
def writem(n,t): (S/n).write_text(t.strip()+'\n')
now=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
b=read(S/'start-baseline.json'); auth=read(S/'authorization.json'); allowed=set(auth['allowedFiles'])
checks={}
checks['headUnchanged']=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()==b['head']
checks['frozenFiles']={'count':len(b['protected']),'drift':[v['path'] for v in b['protected'] if not (R/v['path']).is_file() or sha(R/v['path'])!=v['sha256']]}
checks['preExistingSourceAndConfiguration']={'count':len(b['files']),'allowedChanged':[],'unexpectedDrift':[]}
for v in b['files']:
 if not (R/v['path']).is_file() or sha(R/v['path'])!=v['sha256']:
  checks['preExistingSourceAndConfiguration']['allowedChanged' if v['path'] in allowed else 'unexpectedDrift'].append(v['path'])
f=read(S/'evidence/final-source-hashes.json')
checks['sourceBindings']={'count':len(f),'drift':[x['path'] for x in f if sha(R/x['path'])!=x['finalSha256']]}
oldg=read(A/'TASK_GRAPH.json'); g=read(P/'TASK_GRAPH.json')
defs=['id','title','implementationDependencies','acceptanceDependencies','gateRequirements','activation','requiredForPackageCompletion','acceptanceCaseIds','contractRefs']
checks['taskDefinitionComparison']={'basis':rel(A/'TASK_GRAPH.json'),'changed':{k:[x['id'] for x,y in zip(oldg['tasks'],g['tasks']) if x.get(k)!=y.get(k)] for k in defs}}
oldm=list(csv.DictReader((A/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig'))); m=list(csv.DictReader((P/'ACCEPTANCE_MATRIX.csv').open(encoding='utf-8-sig')))
checks['acceptanceDefinitionComparison']={'basis':rel(A/'ACCEPTANCE_MATRIX.csv'),'rows':len(m),'changedColumns':{k:sum(x[k]!=y[k] for x,y in zip(oldm,m)) for k in oldm[0] if any(x[k]!=y[k] for x,y in zip(oldm,m))},'comparisonIncludesPriorAuthRuntimeChanges':True}
checks['historyAppendOnly']=[]; checks['handoffAppendOnly']=[]
for v in b['rootBefore']:
 p=R/v['path']
 if 'HISTORY' in p.name:
  d=read(p); key='versions' if 'versions' in d else 'entries'; beforeN=len(d[key]); d[key]=[x for x in d[key] if not x.get('id',x.get('version','')).startswith(S.name)]
  h=hashlib.sha256((json.dumps(d,ensure_ascii=False,indent=2)+'\n').encode()).hexdigest()
  checks['historyAppendOnly'].append({'path':v['path'],'appendedEntries':beforeN-len(d[key]),'reconstructedOriginalSha256':h,'originalHashMatches':h==v['sha256'],'method':'Remove only this session entries in memory, preserve all old fields, original serializer; no reconstructed archive written'})
 if p.name.lower()=='handoff.md':
  data=p.read_bytes(); matches=[]
  # Only bounded candidates around actual heading starts, compare original recorded byte SHA.
  for offset in range(len(data)):
   if data[offset:offset+4]==b'\n## ':
    for end in range(max(0,offset-3),offset+3):
     if hashlib.sha256(data[:end]).hexdigest()==v['sha256']:matches.append(end)
  checks['handoffAppendOnly'].append({'path':v['path'],'matchingOriginalPrefixBytes':matches,'originalPrefixPreserved':bool(matches)})
st=read(P/'IMPLEMENTATION_STATE.json'); ex=read(P/'execution/state.json'); counts=read(S/'evidence/current-counts.json')
impl=dict(collections.Counter(v['implementation'] for v in st['tasks'].values())); valid=dict(collections.Counter(v['validation'] for v in st['tasks'].values()))
checks['runtimeState']={'tasks':len(st['tasks']),'implementation':impl,'validation':valid,'caseCounts':dict(collections.Counter(x['result'] for x in m)),'executionStateRows':len(ex['tasks']),'partialExecutionStateMeaning':'Execution rows are not the full54; full IMPLEMENTATION_STATE and all54 summary are canonical','allGraphMirrorsMatch':all(t['implementationStatus']==st['tasks'][t['id']]['implementation'] and t['validationStatus']==st['tasks'][t['id']]['validation'] for t in g['tasks']),'packageRP09':st['packages']['RP09']['status'],'openAuditStatusesUnchanged':st['auditOpenItems']==read(A/'IMPLEMENTATION_STATE.json')['auditOpenItems'],'ciRegression':'FAIL'}
i=read(S/'evidence/final-validation-index.json'); cleanup=[]
for run in i['ownedRuns']:
 rr=read(R/run['path']); c=rr['cleanup']; root=pathlib.Path(run['resource']['tempRoot'])
 cleanup.append({'resultRef':run['path'],'resultHashMatches':sha(R/run['path'])==run['sha256'],'guardDropExit':c['guardDropExit'],'clusterStopExit':c['clusterStopExit'],'ownedTempRootExistsNow':root.exists(),'ownPostmasterPidExistsNow':(root/'pg/postmaster.pid').exists()})
checks['ownedCleanup']={'runs':len(cleanup),'details':cleanup,'distExistsNow':(R/'rdpms-system/backend/dist').exists(),'resourceScope':'Only roots/database/ports in owned run records; no global process kill'}
assert checks['headUnchanged'] and not checks['frozenFiles']['drift'] and not checks['preExistingSourceAndConfiguration']['unexpectedDrift'] and not checks['sourceBindings']['drift']
assert all(not v for v in checks['taskDefinitionComparison']['changed'].values()) and len(m)==306
assert set(checks['acceptanceDefinitionComparison']['changedColumns']) <= {'result','evidence_ref','owner','target_baseline','evidence_level'}
assert all(x['originalHashMatches'] for x in checks['historyAppendOnly']) and all(x['originalPrefixPreserved'] for x in checks['handoffAppendOnly'])
assert len(st['tasks'])==54 and checks['runtimeState']['allGraphMirrorsMatch'] and checks['runtimeState']['openAuditStatusesUnchanged']
assert impl==counts['tasks']['implementation'] and valid==counts['tasks']['validation'] and checks['runtimeState']['caseCounts']==counts['cases']
assert all(x['resultHashMatches'] and x['guardDropExit']==0 and x['clusterStopExit']==0 and not x['ownedTempRootExistsNow'] and not x['ownPostmasterPidExistsNow'] for x in cleanup) and not checks['ownedCleanup']['distExistsNow']
checks['result']='PASS'; checks['meaning']='Record/ownership/static consistency only; does not override CI FAIL or product acceptance'
writej(S/'evidence/final-consistency-check.json',checks)
auth['activeTask']=None;auth['completedLocalTaskIds']=['RP09-T01','RP09-T02'];auth['closedAt']=now;auth['remainingScope']='No automatic expansion to another business task; independent review pending; CI FAIL'
writej(S/'authorization.json',auth)
writem('SESSION_SUMMARY.md','''# RP09 scoped local execution — final delivery

## Approval and scope

郭仁康 / 研发副总监批准 T-RP-02-SCOPED-RESERVATION-V1（RP09-T01/T02）及 T-RP-07-SYNC-DELETE-WINS-V1（RP09-T01 sync delete only）。来源见 approval.json；两份具体合同并未批准其它业务决定。仅串行执行两个子任务，保护启动时全部未提交差异。

## Delivered implementation

- RP09-T01：不可变 actor/device/resource/key/hash/version 预约；当前授权、共享命令/CAS、严格审计和 applied receipt 在调用者单项事务内完成；禁止外层 catch SQL 后继续提交。
- RP09-T02：原回执查询/过期/未知处理；同键并发、异载荷隔离、可序列化有限重试、真实提交后响应丢失恢复；绝不自动重预约或生成新键。
- Receipt 有效窗固定24小时，不因重试更新。权限撤销后不回放旧成功正文；软删项目的当前可见性丧失时查询 unknown。
- SyncMutation 只加四个 nullable 字段，保留旧记录/旧唯一键，无旧行自动回填。迁移仅在自有临时库执行。
- 六个允许文件详见 evidence/final-source-hashes.json；既有256源码/测试/配置的额外漂移为0，冻结2733文件漂移为0。

## Validation and limits

- 新协议正式套件30/30 +22/22；T01在最终当前源码重新30/30。真实自有PostgreSQL；实际登录/Bearer及HTTP断连证据在T02。不以mock/401/空库替代。
- 旧选定回归：单元/契约83/93，八套集成59/68，总142/161、19失败，4组仍旧wire。CI=FAIL。未修改旧正式测试；新v1等效用例不能使旧CI自动通过。
- 事务外root DB写入语义负对照：3条预期断言失败、27跳过，揭示部分持久化，非产品PASS。
- 每次owned run的build/typecheck/undefined/diff检查退出0，全部20次owned run的guard drop/cluster stop退出0；临时根与dist不存在。失败原始attempt全保留。
- 早期attempt未逐次保存当时源码字节；存在原始日志、持久状态、启动副本和最终hash。不得声称早期每一attempt的源码hash均可独立复算。
- 旧前端尚未接入预约协议：旧push明确426 UPGRADE_REQUIRED；RDPMS_SYNC_WRITE_DISABLED=true时reserve/push503、合法query可读。该控制已本地验证，未在目标环境设置。
- 前端IDB/UI、客户端联合验收、目标迁移/回滚/恢复/保留策略与部署未运行；independentReview=PENDING，release=NOT_EVALUATED。

## Current programme state

54任务：24 COMPLETE /2 IN_PROGRESS /28 NOT_STARTED；本地验证16 PASS /31 NOT_RUN /7 ENV_BLOCKED。306验收：100 PASS /181 NOT_RUN /25 ENV_BLOCKED。剩余30实施项（28必需+2未激活可选），不计为全部结束。

RP09包仍IN_PROGRESS；B05/B06仍SUPPORTED，跨客户端及目标范围未关闭。PAC-RP09-05整体NOT_RUN（后端过期证据不替代客户端最后副本验证）。其它PC联合验收未扩大。

11项适用具体决定尚待确定、15项实施依赖未完成、1项需数据所有者只读快照、1项最终对账、2项可选未激活。task-readiness.json以implementationDependencies和精确scope判断；验收依赖不作为实施依赖。

## Entry and next steps

先读REVIEW_ENTRY.md和handoff.md，再查两任务acceptance及validation-addendum、regression-classification、最终源码hash、正式run结果。不得因本地PASS直接部署。封存payload覆盖本session及两个任务run，不把仍会变化的原计划台账纳为不可变payload；封存时台账hash独立绑定。
''')
writem('change-summary.md','''# Actual changes

本session只改两既有文件（routes/sync.js、prisma/schema.prisma），新建syncMutationCommands.ts、20261005_sync_receipt_v1_scope迁移及两套rp09正式集成测试。详细逐任务diff位于原任务run/evidence中；最终六文件hash见evidence/final-source-hashes.json。

新增预约/query后端合同、不可变身份作用域与载荷、调用者事务内业务/CAS/严格审计/回执、24h到期与unknown恢复、当前权限回放、有限可序列化重试、delete-wins和写入禁用控制。保留冻结P1权限与共享业务命令，不修改前端、角色seed、DAG或其它HTTP政策。

旧协议不兼容是显式批准的候选合同边界：未预约push返回426。目前旧前端及19条旧wire断言未迁移；CI FAIL，尚不能发布。已有node_modules Prisma client按现有版本从自有schema重生成，属派生产物；未安装/升级依赖，未改锁文件。
''')
base={'taskIds':['RP09-T01','RP09-T02'],'implementation':'COMPLETE','validation':'PASS','validationScope':'APPROVED_LOCAL_V1_BACKEND_ONLY','ciRegression':'FAIL','independentReview':'PENDING','package':'RP09','packageStatus':'IN_PROGRESS','jointValidation':'NOT_RUN','targetValidation':'NOT_RUN','release':'NOT_EVALUATED','findingDisposition':{'B05':'SUPPORTED','B06':'SUPPORTED'},'approvalRef':rel(S/'approval.json'),'countRef':rel(S/'evidence/current-counts.json')}
writej(S/'task-state.json',base)
writej(S/'acceptance.json',{**base,'formalTests':{'RP09-T01':{'pass':30,'fail':0,'finalSourceRun':rel(S/'evidence/regressions/rp09-scoped-receipt/attempt-01/run-results.json')},'RP09-T02':{'pass':22,'fail':0,'finalSourceRun':rel(S/'evidence/rp09-t02/attempt-05/run-results.json')}},'oldRegression':i['oldSelectedRegressions'],'negativeControl':i['semanticNegativeControl'],'indexRef':rel(S/'evidence/final-validation-index.json'),'notRun':['Client IndexedDB last-copy expiry','Client queue/reservation integration','Target/production migration, rollback, restore and retention','Frontend UI/browser','PC joint acceptance'],'definitionBoundary':'Local PASS does not close full matrix rows, package, old finding or CI'})
writem('rollback.md','''# Rollback and containment

1. 本地已验证RDPMS_SYNC_WRITE_DISABLED=true令reserve/push返回503而合法query可读；现有HTTP/API其它业务保持其合同。不要在目标环境自动设置，未获部署授权。
2. 目标发布前必须完成客户端协议接入、旧CI用例迁移、联合验收和候选环境演练。禁止通过恢复不安全旧sync写入来让旧测试通过。
3. 候选版本隔离回退时保留四nullable列及回执行，以禁写优先；不要删除审计/receipt或自动重发未知命令。原payload保留需求需客户端与数据合同裁定。
4. 若将来确需源码回退，在新隔离checkout按本run保存的before副本及逐任务diff评估，不reset/clean/stash当前脏工作区；不得覆盖其它历史修复。
5. 临时库迁移部署成功与整库销毁已有证据；目标down migration/真实恢复/生产配置回滚均NOT_RUN。未生成或执行生产回滚脚本。
''')
ready=read(S/'task-readiness.json')
lines=['# Remaining scope and ordered next actions','','## Current priorities','','1. 先独立复核两RP09任务：业务/审计/回执是否确实同事务，绑定与当前授权、并发/响应丢失证据是否匹配最终源码。','2. 旧正式测试协议迁移：四失败组保留FAIL；下轮先登记精确测试allowlist和共享stub范围，再接入reserve→handle→push→query夹具；保留拒绝负例与竞态语义，不能只把期望改426来消除失败。当前授权六源码文件之外不自动修改。','3. 客户端RP11/RP12：明确T-RP-12本地身份/隔离合同与T-RP-11队列升级合同及T-RP-02客户端scope；实现真实IDB预约持久化、到期最后副本与未知回执恢复。服务端通过不代替客户端验收。','4. RP08-T02需T-RP-04 +T-RP-12具体方案；RP10-T01需受支持部署客户端/legacy矩阵与T-RP-03。复用旧本地代码枚举不声称全部已部署客户端被覆盖。','5. 只读数据任务RP15-T01需要数据所有者批准的快照、字段/脱敏/保留/访问边界；任何批准不凭空产生真实快照。','','## Remaining30 tasks','']
for t in ready['tasks']:
 if t['implementation']=='COMPLETE':continue
 gates=', '.join(x['ref'] for x in t['implementationGates']) or 'none'
 deps=', '.join(t['unmetImplementationDependencies']) or 'none'
 lines.append(f"- {t['taskId']}: {t['readiness']}; implementation dependencies=[{deps}]; scoped gates=[{gates}].")
lines+=['','详见remaining-task-readiness.csv及task-readiness.json。只批准两RP09合同不扩大为任意产品/安全政策批准；条件门禁不扩大成全局障碍。未启动DAG/自定义角色绑定，不自动部署。']
writem('next-actions.md','\n'.join(lines))
writem('handoff.md','''# Exact resumption order

本session已交付RP09-T01/T02，停止本run编辑等待独立复核。两任务scope本地COMPLETE/PASS；RP09包IN_PROGRESS；CI FAIL；target/joint NOT_RUN；release NOT_EVALUATED。

## Read in order

1. REVIEW_ENTRY.md → SESSION_SUMMARY.md → approval.json/authorization.json。
2. 两任务runs/2026-10-05-sync-receipts-01/acceptance.json及validation-addendum/acceptance.json；后者绑定最终源码与CI失败边界。
3. evidence/final-source-hashes.json → evidence/final-validation-index.json → evidence/regression-classification.json。
4. 当前源码两模块/路由/新增schema迁移、30+22正式测试；读取实际最终run-results和suite.log，不能只依摘要。
5. evidence/final-consistency-check.json → evidence/payload-manifest.json → final-integrity.json → post-seal-readback.json → READY_FOR_REVIEW.json。
6. task-readiness.json /remaining-task-readiness.csv /next-actions.md，再读原计划当前TASK_GRAPH/DECISION_REGISTER/IMPLEMENTATION_STATE及下一具体任务卡。

## Known limits

19旧协议断言失败，现有前端尚不支持预约，不能发布或把新测试视为旧CI迁移。没有客户端IDB/目标/实际保留任务验收。早期attempt未逐一存源码字节；原失败日志保留，不倒填。语义负对照3fail是坏写入被发现，非产品通过。

剩余30=28必需+2可选。已签两RP09批准无须重复批准；其它决定只能在具体范围与方案确定后使用。不要改冻结审计、原run、旧history entries；不直接选择或激活未就绪任务。

## Resources

20个owned run整库guard drop/cluster stop均0；原临时根与backend/dist现不存在。新Prisma client派生缓存留存，现有依赖版本不变。HEAD不变，既有工作区差异保留；没有stage/commit/push/merge/deploy或生产访问。
''')
writem('REVIEW_ENTRY.md','''# Independent review entry — RP09 local v1 backend

请先读SESSION_SUMMARY.md和handoff.md。当前独立审阅PENDING，CI FAIL，release NOT_EVALUATED。

Task1: ../../../../2026-10-01-rdpms/execution/RP09/RP09-T01/runs/2026-10-05-sync-receipts-01/ （以仓库路径为准）。
Task2: docs/remediation/2026-10-01-rdpms/execution/RP09/RP09-T02/runs/2026-10-05-sync-receipts-01/。

优先核对syncMutationCommands.ts和sync.js实际预约/查询/单项事务链；receipt绑定、当前授权、24h到期、客户端未知处理；并发SQL40001重试、业务CAS和严格审计回滚；原任务验收与最终validation-addendum口径。scope只含两具体批准合同。

最终证据：evidence/final-source-hashes.json、final-validation-index.json、regression-classification.json、final-consistency-check.json；正式最终T01 30/30、T02 22/22；旧选定142/161与19fail原日志；root-DB语义负对照3fail/27skip。封存见payload-manifest、final-integrity和post-seal-readback。

冻结2733与其它既有源码/正式测试零额外漂移；不要把24实施完成或100验收PASS解读为全部计划完成。未执行前端IDB、目标迁移/回滚/恢复或发布。
''')
print(json.dumps({'staticConsistency':checks['result'],'frozenCount':len(b['protected']),'sourceBindingCount':len(f),'ownedCleanupRuns':len(cleanup),'counts':counts,'documentsWritten':9},ensure_ascii=False))
