#!/usr/bin/env python3
"""T1358: reproduce T1329's segmented, full-body territory experiment (house/farm OFF).
OFF = no candidate bundle; BODY = T1329 diagnostic bundle; A = BODY + dynamic stakes.
B/C already exist in BODY: stake pickup before land reservation; queued demand in woodShareD.
No equivalence across different checkpoint cadence or different arm environment is assumed.
"""
import argparse, os, re, subprocess, json
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('arm',choices=['OFF','BODY','A'])
p.add_argument('--seed',type=int,default=1020)
p.add_argument('--days',type=int,default=400)
p.add_argument('--every',type=int,default=10)
p.add_argument('--tree',type=Path,default=Path(__file__).resolve().parent.parent)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args(); root=a.tree.resolve(); out=a.out.resolve(); out.mkdir(parents=True,exist_ok=True)
env={k:v for k,v in os.environ.items() if not (k.startswith('VILLAGE_') or re.match(r'^T\d+_',k) or k=='NODE_OPTIONS')}
env.update(VILLAGE_DAY_MS='1440000',VILLAGE_NPC_CAP='Infinity',T400_BUILD_ACT='0',VILLAGE_CARAVAN_MAX='0',T745_VCLOCK='1',T1244_BODY_MS='10000',T1221_EVERY='10',T1259_WOOD_CAP='0',T1243_FARM_ON='0')
if a.arm!='OFF':
    env.update(T325_WOOD_ACT='1',T1207_TERR_REAL='1',T1238_TERR_V2='1',T1283_WOOD_DEMAND='1',T1297_BIRTH_FOOD='1',T1306_MIGRATE_FOOD='1',T1302_TERR_BODY='1',T1329_TERR_CREW='1',T1329_OBS='1')
if a.arm=='A': env['T1358_STAKE_REQUOTE']='1'
hooks=['t1274-baseline-hook','t1302-observe','t1243-observe','t1221-observe','t1230-observe','t1251-observe','t1274-observe','t1329-observe']
env['NODE_OPTIONS']=' '.join('-r '+str(root/'scripts'/(h+'.js')) for h in hooks)
# Read-only full village state at the ruler points, before t577's immediate final exit.
env['T740_DUMP_DAYS']='100,200,400'
name=f'{a.arm}-{a.seed}'; run=out/name
(out/(name+'.launch.json')).write_text(json.dumps(dict(root=str(root),days=a.days,seed=a.seed,every=a.every,env={k:v for k,v in env.items() if k.startswith(('T','VILLAGE_','NODE_OPTIONS'))}),indent=1))
with (out/(name+'.guard.log')).open('wb') as log:
    r=subprocess.run(['bash','scripts/t1308-guard.sh','new',str(a.days),str(a.seed),'--every',str(a.every),'--tag',a.arm,'--dir',str(run)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
(out/(name+'.exit.json')).write_text(json.dumps(dict(exit=r.returncode)))
raise SystemExit(r.returncode)
