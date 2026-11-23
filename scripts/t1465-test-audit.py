#!/usr/bin/env python3
"""Audit outer regression-runner exit codes; preserve initial reds and controls."""
import pathlib,re,json,sys,gzip
root=pathlib.Path(__file__).resolve().parents[1];p=root/'계측/T1465_2026-11-23';plan=(p/'touched-목록-최종.txt').read_text().splitlines();cases=[];active=[]
assert len(plan)==159 and len(set(plan))==159
for name,node in [('touched-실행.txt','v22.23.4'),('touched-재개실행.txt','v24.22.1')]:
 source=p/name
 if not source.exists():source=p/(name+'.gz')
 text=gzip.decompress(source.read_bytes()).decode() if source.suffix=='.gz' else source.read_text()
 parts=re.split(r'^##### (\S+) #####\s*$',text,flags=re.M)
 for i in range(1,len(parts),2):
  rc=re.findall(r'^  [✓✗] RC=(\d+)',parts[i+1],flags=re.M)
  if rc:cases.append({'name':parts[i],'initialCode':int(rc[-1]),'log':source.name,'parentNode':node})
  else:active.append(parts[i])
assert len(set(x['name'] for x in cases))==len(cases)
assert all(x['name'] in plan for x in cases)
extra={}
for name in ['슬롯-대조-결과.json','자연물-대조-결과.json','존주소-대조-결과.json']:
 if (p/name).exists():extra[name]=json.loads((p/name).read_text())
if (p/'첫가입-Node24-재검.txt').exists():
 s=(p/'첫가입-Node24-재검.txt').read_text();assert 'PASS 82 · FAIL 0' in s
 extra['firstJoinCompatibleNativeModule']={'node':'v24.22.1','pass':82,'fail':0,'harnessChanged':False,'initialFailure':'ERR_DLOPEN_FAILED under Node22 against shared Node24 better-sqlite3 binary'}
complete=len(cases)==159 and (p/'touched-재개-종료.json').exists()
r={'complete':complete,'planned':len(plan),'completed':len(cases),'initialPassingCases':sum(x['initialCode']==0 for x in cases),'initialFailures':[x for x in cases if x['initialCode']!=0],'notCompleted':[x for x in plan if x not in {a['name'] for a in cases}],'interruptedUncountedBlocks':active,'controls':extra,'cases':cases,'interpretation':'Initial failures are preserved even when controlled reruns pass. Mixed local Node runtimes are explicit. No black-box harness modified.'}
if '--partial' not in sys.argv:assert complete, 'Regression continuation is incomplete'
(p/'하네스-집계.json').write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:r[k] for k in ['complete','planned','completed','initialPassingCases','initialFailures','notCompleted']},ensure_ascii=False))
