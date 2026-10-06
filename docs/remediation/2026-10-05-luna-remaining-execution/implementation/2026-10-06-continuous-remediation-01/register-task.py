from pathlib import Path
import json,shutil,sys
P=Path('docs/remediation/2026-10-01-rdpms');S=Path(__file__).parent;TASK=sys.argv[1];config=json.loads((S/(TASK+'-scope.json')).read_text());R=P/'execution'/TASK[:4]/TASK/'runs'/S.name;R.mkdir(parents=True,exist_ok=True);(R/'evidence').mkdir(exist_ok=True)
def save(p,d):p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
for name in config['allowedFiles']:
 f=Path(name);b=S/('before-'+TASK)/name
 if f.exists() and not b.exists():b.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,b)
a=json.loads((S/'approval.json').read_text());a['scope']=list(dict.fromkeys(a['scope']+[TASK]));a['contracts'].update(config['contracts']);save(S/'approval.json',a)
s=json.loads((S/'task-scopes.json').read_text());s[TASK]={'kind':'STANDARD','state':'IN_PROGRESS','allowedFiles':config['allowedFiles'],'scope':config['scope']};save(S/'task-scopes.json',s)
save(R/'authorization.json',{'taskId':TASK,'authorizationRef':str(S/'authorization.json'),'authority':'User approved subsequent local STANDARD repairs; delegated concrete option selection','allowedFiles':config['allowedFiles'],'approvedBy':'郭仁康','approvedRole':'研发副总监','scope':config['scope'],'noProductionOrRelease':True})
save(R/'evidence/decision-contract.json',{'taskId':TASK,'authority':'USER_DELEGATED_OPTION_SELECTION','contracts':config['contracts'],'dependenciesAndCases':next(t for t in json.loads((P/'TASK_GRAPH.json').read_text())['tasks'] if t['id']==TASK),'boundary':config['scope']})
for file in [P/'IMPLEMENTATION_STATE.json',P/'execution/state.json']:
 d=json.loads(file.read_text());d['tasks'].setdefault(TASK,{}).update(implementation='IN_PROGRESS',validation='NOT_RUN',release='NOT_EVALUATED',latestRun=str(R.relative_to(P)));d['activeTask']=TASK;d['nextReadyTask']=TASK;save(file,d)
g=json.loads((P/'TASK_GRAPH.json').read_text());t=next(t for t in g['tasks'] if t['id']==TASK);t.update(status='IN_PROGRESS',implementationStatus='IN_PROGRESS',validationStatus='NOT_RUN',owner='Codex single executor');save(P/'TASK_GRAPH.json',g)
d=json.loads((P/'DECISION_REGISTER.json').read_text())
for ref in config.get('gateRefs',[]):
 x=next(x for x in d['decisions'] if x['id']==ref);x.setdefault('additionalApprovedScopes',[]).append({'taskId':TASK,'authority':'USER_DELEGATED_OPTION_SELECTION','approvedBy':'郭仁康','approvedRole':'研发副总监','date':'2026-10-06','contractRef':str(R/'evidence/decision-contract.json'),'scope':config['scope']})
save(P/'DECISION_REGISTER.json',d)
u=json.loads((S/'authorization.json').read_text());u['activeTask']=TASK;save(S/'authorization.json',u)
print('Registered',TASK)
