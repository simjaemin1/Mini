from pathlib import Path
import json,re,time
root=Path('/tmp/t1255-baseline');out={}
for tag in ['off_old','make_new','repeat1','repeat2']:
 d=root/tag
 if(d/'status.json').exists():
  s=json.loads((d/'status.json').read_text());out[tag]={'done':True,'rc':s['rc']};continue
 v={'done':False,'days':{}}
 if(d/'driver.log').exists():
  m=re.search(r'판 (/tmp/sbc-[\w-]+)',(d/'driver.log').read_text())
  if m:
   for seed in [1020,7,42]:
    f=Path(m.group(1))/f'sbc-{seed}.json.t1255.jsonl';rows=[]
    if f.exists():
     for line in f.read_text().splitlines():
      try:rows.append(json.loads(line))
      except ValueError:pass
    v['days'][str(seed)]=rows[-1]['day']if rows else 0
 out[tag]=v
print(json.dumps({'cases':out,'complete':all(s['done']for s in out.values()),'failure':any(s.get('rc',0)!=0 for s in out.values()),'KST':time.strftime('%H:%M:%S',time.gmtime(time.time()+9*3600))}))
