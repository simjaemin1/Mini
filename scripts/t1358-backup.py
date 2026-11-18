#!/usr/bin/env python3
"""Back up immutable T1308 checkpoints and completed segment evidence outside /tmp.
Run once per checkpoint; does not read/write the live DB. Resume still uses canonical T1308.
"""
import argparse, json, shutil, gzip, os
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runs',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
a.out.mkdir(parents=True,exist_ok=True)
for d in sorted(a.runs.iterdir()):
 if not d.is_dir() or not (d/'progress.json').exists() or d.name.startswith(('node24-','Apre-')):continue
 P=json.loads((d/'progress.json').read_text()); ck=P.get('ck',0); dst=a.out/d.name;dst.mkdir(exist_ok=True)
 completed={s['from'] for s in P.get('segs',[])}
 for f in d.iterdir():
  if not f.is_file():continue
  # Completed segments only. No DB files, binary checkpoint, active log, or partial output is committed.
  import re
  m=re.match(r'^seg-(\d+)\.',f.name)
  if not m or int(m[1]) not in completed:continue
  if f.name.endswith(('.log','.json','.jsonl')):
   target=dst/(f.name+'.gz')
   if target.exists():continue
   tmp=target.with_suffix('.tmp')
   with f.open('rb') as src, gzip.open(tmp,'wb',compresslevel=5) as out:shutil.copyfileobj(src,out)
   tmp.replace(target)
 mark=dst/'backed-up-day'
 old=int(mark.read_text()) if mark.exists() else -1
 if ck and old!=ck:
  tmp=dst/'checkpoint.tmp';shutil.rmtree(tmp,ignore_errors=True)
  shutil.copytree(d/'ck',tmp)
  latest=json.loads((d/'progress.json').read_text())
  if latest.get('ck')==ck and (tmp/'day').read_text().strip()==str(ck):
   shutil.rmtree(dst/'checkpoint',ignore_errors=True);tmp.rename(dst/'checkpoint')
   (dst/'progress.json').write_text(json.dumps(P,indent=1));mark.write_text(str(ck))
  else:shutil.rmtree(tmp,ignore_errors=True)
 (dst/'latest-status.json').write_text(json.dumps(P,indent=1))
 print(d.name,'checkpoint',ck,'complete',P.get('done'),flush=True)
