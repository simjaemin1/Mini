#!/usr/bin/env python3
"""Watch/backup only this T1358 six-run grid; product processes remain canonical T1308."""
import argparse, subprocess, time, json, re
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runs',type=Path,required=True);p.add_argument('--backup',type=Path,required=True);a=p.parse_args()
expected=[f'{arm}-{seed}' for seed in [1020,7] for arm in ['OFF','BODY','A']]
while True:
 subprocess.run(['python3',str(Path(__file__).with_name('t1358-backup.py')),'--runs',str(a.runs),'--out',str(a.backup)],stdout=subprocess.DEVNULL,check=True)
 status=[];finished=0
 for name in expected:
  d=a.runs/name;line='not started'
  if (d/'progress.txt').exists():line=(d/'progress.txt').read_text().strip()
  if (d/'progress.json').exists():
   P=json.loads((d/'progress.json').read_text());finished+=bool(P.get('done'))
  status.append(name+': '+line)
 txt='\n'.join(status)+'\n';print(txt,flush=True)
 (a.backup/'status.txt').write_text(txt)
 if finished==len(expected):break
 time.sleep(30)
