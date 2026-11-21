#!/usr/bin/env python3
"""Replay only days 91–100 from the closed baseline checkpoint, with native CPU profiling."""
import argparse, copy, json, os, shutil, subprocess
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', type=Path, required=True)
a = p.parse_args()
root = a.root.resolve()
runs, tree = root/'worlds', root/'base'
manifest = json.loads((root/'candidate-manifest.json').read_text())
method = root/manifest.get('diagnosticMethodsVersion', manifest.get('methodsVersion', 'method-v1'))
source = runs/'base-plain-1020'
name = 'late-profile-1020'
target = runs/name
P = json.loads((source/'progress.json').read_text())
assert P['done'] and P['days'] == 100 and P['ck'] == 100
assert json.loads((runs/'base-plain-1020.exit.json').read_text())['exit'] == 0
assert (source/'ck/day').read_text().strip() == '90', 'closed checkpoint must be exactly day 90'
assert not target.exists(), 'never overwrite an observed replay'
# The ledger boundary is night for this cohort. Measure the whole first day too,
# in a separate one-day diagnostic; never mix it into benchmark CPU or six arms.
early = runs/'early-census-1020'
assert not early.exists(), 'never overwrite an observed first-day diagnostic'
first = subprocess.run(['python3', str(method/'t1411-run.py'), 'ON', '--tree', str(tree),
                        '--out', str(runs), '--tag', 'early-census', '--days', '1', '--census',
                        '--set', 'T1411_HOURLY=1'])
if first.returncode:
    raise SystemExit(first.returncode)
same = subprocess.run(['python3', str(method/'t1411-compare.py'), str(source), str(early),
                       '--days', '1', '--out', str(root/'early-census-fingerprint1.json')])
if same.returncode:
    raise SystemExit(same.returncode)
target.mkdir()
shutil.copytree(source/'ck', target/'ck')
# No live DB is read: only immutable closed prefix evidence and checkpoint 90.
prefix = [seg for seg in P['segs'] if seg['to'] <= 90]
for seg in prefix:
    for f in source.glob(f"seg-{seg['from']}.*"):
        if f.is_file():
            shutil.copy2(f, target/f.name)
Q = copy.deepcopy(P)
Q.update(dir=str(target), tag='late-profile', ck=90, segs=prefix, done=False, tries=0)
Q.pop('ended', None)
env = Q['env']
old_hook = str(root/'t1411-profile-hook.cjs')
new_hook = str(method/'t1411-profile-hook.cjs')
assert old_hook in env['NODE_OPTIONS']
env['NODE_OPTIONS'] = env['NODE_OPTIONS'].replace(old_hook, new_hook) + ' -r ' + str(method/'t1411-census.cjs')
env.update(T1411_CPU_PROF='1', T1411_PROFILE_DIR=str(runs/(name+'-profiles')), T1411_ROOT=str(tree), T1411_HOURLY='1')
(target/'progress.json').write_text(json.dumps(Q, indent=1))
launch = json.loads((runs/'base-plain-1020.launch.json').read_text())
launch.update(profile=True, census=True, sharedPrefixThrough=90, replayedDays=[91,100],
              independentWorld=False, env=env)
(runs/(name+'.launch.json')).write_text(json.dumps(launch, indent=1))
with (root/(name+'.guard.log')).open('wb') as log:
    r = subprocess.run(['node', 'scripts/t1308-long-run.js', '--resume', str(target)],
                       cwd=tree, env={**os.environ, **env}, stdout=log, stderr=subprocess.STDOUT)
(runs/(name+'.exit.json')).write_text(json.dumps(dict(exit=r.returncode)))
if r.returncode:
    raise SystemExit(r.returncode)
raise SystemExit(subprocess.run(['python3', str(method/'t1411-compare.py'), str(source), str(target),
                                '--days', '100', '--out', str(root/'late-profile-fingerprint100.json')]).returncode)
