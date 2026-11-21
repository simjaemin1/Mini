#!/usr/bin/env python3
"""T1411 canonical, full-body T1358 cohort; each invocation runs one world only."""
import argparse, hashlib, json, os, re, subprocess
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('arm', choices=['ON', 'OFF'])
p.add_argument('--tree', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--tag', required=True)
p.add_argument('--seed', type=int, default=1020)
p.add_argument('--days', type=int, default=730)
p.add_argument('--every', type=int, default=10)
p.add_argument('--profile', action='store_true')
p.add_argument('--census', action='store_true')
p.add_argument('--set', action='append', default=[])
a = p.parse_args()
root, out = a.tree.resolve(), a.out.resolve()
out.mkdir(parents=True, exist_ok=True)
name = f'{a.tag}-{a.seed}'
run = out / name
env = {k: v for k, v in os.environ.items() if not
       (re.match(r'^(T\d+_|VILLAGE_|ENABLE_|WAR_|BODY_)', k) or k == 'NODE_OPTIONS')}
env.update(VILLAGE_DAY_MS='1440000', VILLAGE_NPC_CAP='Infinity', T400_BUILD_ACT='0',
           VILLAGE_CARAVAN_MAX='0', T745_VCLOCK='1', T1244_BODY_MS='10000',
           T1221_EVERY='10', T1259_WOOD_CAP='0', T1243_FARM_ON='0')
if a.arm == 'ON':
    env.update(T325_WOOD_ACT='1', T1207_TERR_REAL='1', T1238_TERR_V2='1',
               T1283_WOOD_DEMAND='1', T1297_BIRTH_FOOD='1', T1306_MIGRATE_FOOD='1',
               T1302_TERR_BODY='1', T1329_TERR_CREW='1', T1329_OBS='1',
               T1358_STAKE_REQUOTE='1')
for setting in a.set:
    key, value = setting.split('=', 1)
    assert re.fullmatch(r'T1411_[A-Z0-9_]+', key), key
    env[key] = value
hooks = ['t1274-baseline-hook', 't1302-observe', 't1243-observe', 't1221-observe',
         't1230-observe', 't1251-observe', 't1274-observe', 't1329-observe']
profile_hook = Path(__file__).with_name('t1411-profile-hook.cjs').resolve()
env['NODE_OPTIONS'] = '-r ' + str(profile_hook) + ' ' + ' '.join(
    '-r ' + str(root / 'scripts' / (h + '.js')) for h in hooks)
if a.census:
    env['T1411_ROOT'] = str(root)
    env['NODE_OPTIONS'] += ' -r ' + str(Path(__file__).with_name('t1411-census.cjs').resolve())
env.update(T1411_CPU_PROF='1' if a.profile else '0',
           T1411_PROFILE_DIR=str(out / (name + '-profiles')),
           T740_DUMP_DAYS='100,200,300,365,400,500,600,700,730')
source_files = ['server/villages.js', 'server/zone.js', 'server/build-haul.js',
                'server/terr-body.js', 'server/terr-cost.js', 'scripts/t1308-long-run.js']
sha = lambda f: hashlib.sha256(f.read_bytes()).hexdigest()
meta = dict(root=str(root), arm=a.arm, days=a.days, seed=a.seed, every=a.every,
            profile=a.profile, census=a.census, profileHookSha256=sha(profile_hook),
            source={f: sha(root / f) for f in source_files if (root / f).is_file()},
            env={k: v for k, v in env.items() if re.match(r'^(T\d+_|VILLAGE_)', k) or k == 'NODE_OPTIONS'})
(out / (name + '.launch.json')).write_text(json.dumps(meta, indent=1))
with (out / (name + '.guard.log')).open('ab') as log:
    r = subprocess.run(['bash', 'scripts/t1308-guard.sh', 'new', str(a.days), str(a.seed),
                        '--every', str(a.every), '--tag', a.tag, '--dir', str(run)],
                       cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
(out / (name + '.exit.json')).write_text(json.dumps(dict(exit=r.returncode)))
raise SystemExit(r.returncode)
