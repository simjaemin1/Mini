#!/usr/bin/env python3
"""Tabulate all seven mine villages, requiring six full deterministic observer controls."""
import argparse, hashlib, json, pathlib
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--original',type=pathlib.Path,required=True)
p.add_argument('--flow',type=pathlib.Path,required=True)
p.add_argument('--out',type=pathlib.Path,required=True)
a=p.parse_args();pairs=[];controls=[]
for seed in [1020,7,42]:
 modes={}
 for mode in ['off','on']:
  name=f'{mode}-{seed}.json';old=a.original/name;observed=a.flow/name
  if observed.read_bytes()!=old.read_bytes():raise SystemExit(f'observer changed world: {name}')
  world=json.loads(observed.read_text());f=json.loads((a.flow/(name+'.verified.json')).read_text())
  if world['days']!=800 or f['days']!=800:raise SystemExit(f'incomplete run: {name}')
  modes[mode]={v['name']:v for v in f['villages']}
  controls.append({'mode':mode,'seed':seed,'days':800,'byteEqualOriginal':True,'worldSHA256':hashlib.sha256(observed.read_bytes()).hexdigest(),'flowSHA256':hashlib.sha256((a.flow/(name+'.verified.json')).read_bytes()).hexdigest()})
 for i in range(1,8):
  name=f'광산{i}'
  pairs.append({'seed':seed,'village':name,'off':modes['off'][name],'on':modes['on'][name]})
a.out.parent.mkdir(parents=True,exist_ok=True)
a.out.write_text(json.dumps({'complete':True,'days':800,'controls':controls,'definition':'executed market purchases: all canonical food-equivalent items; cargo may still be returning. Exports include both legs, canonical item kg. Total econ deaths are _deadTot; food-debt deaths are _fdDeadTot; hunger is foodDebtOf(v).starving summed after each daily tick as person-days and village-days; jobs are end-of-run counts.','minePairs':pairs},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'complete':True,'byteEqualControls':len(controls),'minePairs':len(pairs)}))
