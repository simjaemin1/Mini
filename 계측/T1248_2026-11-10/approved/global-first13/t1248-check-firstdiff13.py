from pathlib import Path
import json
base=Path('/tmp/t1248-v6-firstdiff13')
def rows(p):return [json.loads(l)for l in p.read_text().splitlines()if l.strip()]
if not all((base/t/'status.json').exists()for t in ['tick13','des13']):raise SystemExit(2)
rs={};reproduces={}
for tag,original in [('tick13',Path('/tmp/t1248-v6-results/world30tick/world30tick-1020.json.t1248.jsonl')),('des13',Path('/tmp/t1248-v6-results/world100/world100-1020.json.t1248.jsonl'))]:
 d=base/tag;child=json.loads((d/'child.json').read_text());w=json.loads((d/(tag+'-1020.json')).read_text());assert child['code']==0 and child['signal']is None;assert w['days']==13 and w['villages']==51
 a={r['day']:r for r in rows(d/(tag+'-1020.json.t1248.jsonl'))if'day'in r};o={r['day']:r for r in rows(original)if'day'in r};assert len(a)==13;reproduces[tag]=all(a[k]['hash']==o[k]['hash']for k in a);assert reproduces[tag],(tag,'fingerprint differs from original13day prefix');rs[tag]=a
first=next(d for d in sorted(rs['tick13'])if rs['tick13'][d]['hash']!=rs['des13'][d]['hash']);fields=[]
for a,b in zip(rs['tick13'][first]['villages'],rs['des13'][first]['villages']):
 assert a['name']==b['name']
 for i,name in enumerate(['st','pp','hs','tr']):
  if a['fields'][i]==b['fields'][i]:continue
  x=json.loads(a['raw'][i]);y=json.loads(b['raw'][i]);values={k:[x.get(k),y.get(k)]for k in sorted(set(x)|set(y))if x.get(k)!=y.get(k)}if isinstance(x,dict)and isinstance(y,dict)else[x,y]
  fields.append({'village':a['name'],'field':name,'values':values,'tickRaw':a['raw'][i],'desRaw':b['raw'][i]})
result={'days':13,'villages':51,'fingerprintsReproduceOriginal':reproduces,'same':sum(rs['tick13'][k]['hash']==rs['des13'][k]['hash']for k in rs['tick13']),'firstDifference':{'day':first,'fields':fields}}
controls={};maps={}
for tag in ['workoff13','queueoff13','walkoff13']:
 d=base/tag
 if not(d/'status.json').exists():controls[tag]={'pending':True};continue
 child=json.loads((d/'child.json').read_text());world=json.loads((d/(tag+'-1020.json')).read_text());assert child['code']==0 and child['signal']is None;assert world['days']==13 and world['villages']==51
 a={r['day']:r for r in rows(d/(tag+'-1020.json.t1248.jsonl'))if'day'in r};assert len(a)==13;maps[tag]=a;v=next(v for v in a[13]['villages']if v['name']=='어촌9');lines=[l for l in(d/(tag+'-1020.log')).read_text().splitlines()if'캐러밴#273'in l]
 controls[tag]={'days':13,'sameAsTick':sum(a[k]['hash']==rs['tick13'][k]['hash']for k in a),'firstDifferenceToTick':next((k for k in sorted(a)if a[k]['hash']!=rs['tick13'][k]['hash']),None),'day13StorageHide':json.loads(v['raw'][0])['hide'],'day13TreasuryHide':json.loads(v['raw'][3]).get('hide',0),'caravan273Log':lines}
if 'workoff13'in maps and'walkoff13'in maps:controls['walkoff13']['comparisonWithWorkoff13']={'onlyMechanismChanged':'walking events (work0, queues1, sleep/rest/heap unchanged)','sameDays':sum(maps['workoff13'][k]['hash']==maps['walkoff13'][k]['hash']for k in maps['workoff13'])}
result['controls']=controls;result['controlsComplete']=all(not v.get('pending')for v in controls.values())
(base/'first-difference.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False,indent=2))
