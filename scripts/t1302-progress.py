"""Read-only progress for the bounded T1302 measurement supervisor."""
from pathlib import Path
import sys,json
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1302-r1')
parts=[]
for d in sorted(P.iterdir()):
 if not d.is_dir() or not (d/'input.json').exists():continue
 info=json.loads((d/'input.json').read_text());seed=info['seed']
 done=(d/'status.json').exists()
 name=d.name+(' 완료'+str(json.loads((d/'status.json').read_text())['exit']) if done else ' 실행')
 a=d/f'server/run-{seed}.json.t1274-days.jsonl';b=d/f'server/run-{seed}.json.t1302-days.jsonl'
 try:
  if a.exists():
   r=json.loads(a.read_text().splitlines()[-1]);name+=f' d{r["day"]} N{r["pop"]} bodies{r["bodies"]} CPU{r["cpuSeconds"]:.1f}s'
  if b.exists():
   r=json.loads(b.read_text().splitlines()[-1]);name+=f' physical{r["physical"]}/{r["added"]} batch{r["batchCalls"]}'
 except (ValueError,IndexError):pass
 parts.append(name)
print(' | '.join(parts))
for f in ['complete.json','failure.json']:
 if (P/f).exists():print('SUPERVISOR',json.loads((P/f).read_text())['state'])
