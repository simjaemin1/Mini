#!/usr/bin/env python3
"""Replay only days 91–100 from the closed baseline checkpoint, with native CPU profiling."""
import argparse, copy, json, os, shutil, subprocess, threading, time
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
stage_file = root/'diagnostic-stage.json'
def stage(value):
    tmp = stage_file.with_suffix('.tmp')
    tmp.write_text(json.dumps(dict(stage=value)))
    tmp.replace(stage_file)

candidate = runs/'ON-1020'
pin_done, pin_result = threading.Event(), {}
pin_path = Path('/workspace/scratch/t1411/preserved/ON-1020-90')
def pin_candidate():
    try:
        while True:
            exit_file = runs/'ON-1020.exit.json'
            if exit_file.exists() and json.loads(exit_file.read_text())['exit']:
                pin_result['skip'] = 'candidate failed before the post-optimization profile'
                return
            current = json.loads((candidate/'progress.json').read_text())
            if current['ck'] > 90:
                raise RuntimeError('missed candidate checkpoint 90; do not substitute another age')
            if current['ck'] == 90:
                assert (candidate/'ck/day').read_text().strip() == '90'
                assert not pin_path.exists(), 'do not overwrite a pinned checkpoint'
                pin_path.parent.mkdir(parents=True, exist_ok=True)
                tmp = pin_path.with_name(pin_path.name+'.tmp')
                assert not tmp.exists(), 'inspect a previous incomplete checkpoint copy first'
                shutil.copytree(candidate/'ck', tmp/'ck')
                assert json.loads((candidate/'progress.json').read_text())['ck'] == 90
                assert (tmp/'ck/day').read_text().strip() == '90'
                (tmp/'progress.json').write_text(json.dumps(current, indent=1))
                tmp.rename(pin_path)
                pin_result['path'] = str(pin_path)
                return
            time.sleep(55)
    except BaseException as exc:
        pin_result['error'] = str(exc)
    finally:
        pin_done.set()
threading.Thread(target=pin_candidate, daemon=True).start()
stage('early-census')
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
stage('baseline-native-91-100')
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
same = subprocess.run(['python3', str(method/'t1411-compare.py'), str(source), str(target),
                       '--days', '100', '--out', str(root/'late-profile-fingerprint100.json')])
if same.returncode:
    raise SystemExit(same.returncode)
stage('waiting-for-pinned-candidate-90')
while not pin_done.wait(55):
    pass
if pin_result.get('error'):
    raise RuntimeError(pin_result['error'])
if pin_result.get('skip'):
    stage(pin_result['skip']); raise SystemExit(0)
exit_file = runs/'ON-1020.exit.json'
if exit_file.exists() and json.loads(exit_file.read_text())['exit']:
    stage('candidate failed; post-optimization profile skipped'); raise SystemExit(0)

# A second native profile at the same age quantifies the remaining buckets.
# The only concurrent simulation is the original ON/1020 campaign world.
stage('candidate-native-91-100')
name = 'fast-late-profile-1020'
target = runs/name
assert not target.exists(), 'never overwrite an observed candidate replay'
target.mkdir()
shutil.copytree(pin_path/'ck', target/'ck')
Q = json.loads((pin_path/'progress.json').read_text())
for seg in Q['segs']:
    for f in candidate.glob(f"seg-{seg['from']}.*"):
        if f.is_file():
            shutil.copy2(f, target/f.name)
Q.update(dir=str(target), tag='fast-late-profile', days=100, done=False, tries=0)
Q.pop('ended', None)
env = Q['env']
benchmark = root/manifest.get('methodsVersion', 'method-v1')
for file in ['t1411-profile-hook.cjs', 't1411-census.cjs']:
    old, new = str(benchmark/file), str(method/file)
    assert old in env['NODE_OPTIONS'], old
    env['NODE_OPTIONS'] = env['NODE_OPTIONS'].replace(old, new)
tree = root/'fast'
env.update(T1411_CPU_PROF='1', T1411_PROFILE_DIR=str(runs/(name+'-profiles')), T1411_ROOT=str(tree), T1411_HOURLY='1')
(target/'progress.json').write_text(json.dumps(Q, indent=1))
launch = json.loads((runs/'ON-1020.launch.json').read_text())
launch.update(days=100, profile=True, census=True, sharedPrefixThrough=90, replayedDays=[91,100],
              independentWorld=False, env=env)
(runs/(name+'.launch.json')).write_text(json.dumps(launch, indent=1))
with (root/(name+'.guard.log')).open('wb') as log:
    r = subprocess.run(['node', 'scripts/t1308-long-run.js', '--resume', str(target)],
                       cwd=tree, env={**os.environ, **env}, stdout=log, stderr=subprocess.STDOUT)
(runs/(name+'.exit.json')).write_text(json.dumps(dict(exit=r.returncode)))
if r.returncode:
    raise SystemExit(r.returncode)
while json.loads((candidate/'progress.json').read_text())['ck'] < 100:
    if exit_file.exists() and json.loads(exit_file.read_text())['exit']:
        stage('candidate failed; fingerprint100 unavailable'); raise SystemExit(1)
    time.sleep(55)
same = subprocess.run(['python3', str(method/'t1411-compare.py'), str(candidate), str(target),
                       '--days', '100', '--out', str(root/'fast-late-profile-fingerprint100.json')])
if same.returncode:
    raise SystemExit(same.returncode)
same = subprocess.run(['python3', str(method/'t1411-compare.py'), str(source), str(candidate),
                       '--days', '100', '--out', str(root/'candidate-fingerprint100.json')])
stage('finished' if same.returncode == 0 else 'candidate-fingerprint100-difference')
raise SystemExit(same.returncode)
