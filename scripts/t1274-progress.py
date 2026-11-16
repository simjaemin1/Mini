# T1274: read-only progress display for a measurement directory.
from pathlib import Path
import json,re,sys
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1274-r2');parts=[]
for n in ['PREFLIGHT_PLAIN','PREFLIGHT_OBSERVED','OFF','WOOD','TERR','V2_WOOD','FAST_OLD_CLOCK','OFF_GATE','FAST_CURRENT']:
 d=P/n
 if not d.exists():continue
 status=json.loads((d/'status.json').read_text()) if (d/'status.json').exists() else None
 text=n+(' 완료'+str(status['exit']) if status else ' 실행')
 f=d/'server/run-1020.json.t1274-days.jsonl'
 if f.exists():
  try:
   r=json.loads(f.read_text().splitlines()[-1]);text+=f' d{r["day"]} N{r["pop"]} bodies{r["bodies"]} CPU/day{r["cpuSeconds"]:.1f}s'
  except (ValueError,IndexError):pass
 elif (d/'controller.log').exists():
  log=(d/'controller.log').read_text();m=re.search(r'판 (/tmp/sbc-\w+)',log)
  if m:
   f=Path(m[1])/'sbc-1020.json.t740.json'
   if f.exists():
    try:text+=' side'+str(len(json.loads(f.read_text())['days']))
    except ValueError:pass
 parts.append(text)
print(' | '.join(parts))

f=P/"supervisor-complete.json"
if f.exists(): print("SUPERVISOR",json.loads(f.read_text())["state"])
