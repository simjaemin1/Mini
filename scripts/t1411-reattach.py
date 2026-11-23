#!/usr/bin/env python3
"""T1411: adopt surviving wrappers after a controller loss; never replay worlds."""
import argparse, hashlib, json, os, subprocess, time
from datetime import datetime, timezone
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', type=Path, required=True)
p.add_argument('--repo', type=Path, required=True)
p.add_argument('--check', action='store_true', help='read-only preflight; no launches or status writes')
a = p.parse_args()
root, repo = a.root.resolve(), a.repo.resolve()
runs = root/'worlds'
read = lambda f: json.loads(f.read_text())

def process(pid):
    try:
        d = Path('/proc')/str(pid)
        args = [x.decode() for x in (d/'cmdline').read_bytes().split(b'\0') if x]
        fields = (d/'stat').read_text().rpartition(')')[2].split()
        return dict(args=args, parent=int(fields[1]), start=fields[19], state=fields[0])
    except (FileNotFoundError, ProcessLookupError):
        return None

def save():
    temp = (root/'campaign.json').with_suffix('.tmp')
    temp.write_text(json.dumps(state, ensure_ascii=False, indent=1)+'\n')
    temp.replace(root/'campaign.json')

def same_wrapper(name, entry):
    info = process(entry['pid'])
    command = entry['command']
    assert info and info['args'] and Path(info['args'][0]).name == Path(command[0]).name
    assert info['args'][1:] == command[1:], 'wrapper identity mismatch: '+name
    progress = read(runs/name/'progress.json')
    assert not progress['done'] and progress['days'] == 730
    assert progress['env']['VILLAGE_NPC_CAP'] == 'Infinity'
    assert progress['env']['VILLAGE_DAY_MS'] == '1440000'
    return dict(pid=entry['pid'], start=info['start'])

# Preflight is outside the mutation/error handler: a duplicate invocation must
# not overwrite the live controller's status, nor signal any world process.
state = read(root/'campaign.json')
assert state['stage'] in ['six-worlds', 'controller-stopped']
assert state['fingerprint30'] is True and read(root/'candidate-fingerprint100.json')['same'] is True
assert all(g['exit'] == 0 for g in read(root/'gates/final/status.json'))
assert all(d.get('done') and d.get('exit') == 0 for d in state['diagnostics'].values())
manifest = read(root/'candidate-manifest.json')
for name, expected in manifest['featureSource'].items():
    for tree in [root/'fast', repo]:
        assert hashlib.sha256((tree/name).read_bytes()).hexdigest() == expected, str(tree/name)
method = root/manifest['methodsVersion']
for name, expected in manifest['methods'].items():
    assert hashlib.sha256((method/name).read_bytes()).hexdigest() == expected, name
active = {}
for name, entry in state['worlds'].items():
    exit_file = runs/(name+'.exit.json')
    if exit_file.exists():
        progress = read(runs/name/'progress.json')
        entry.update(exit=read(exit_file)['exit'], checkpoint=progress['ck'], done=bool(progress['done']), lastStatus=(runs/name/'progress.txt').read_text())
    else:
        assert 'exit' not in entry
        active[name] = same_wrapper(name, entry)
assert len(active) <= 2
owners = {e['pid'] for e in active.values()}
zones = []
for d in Path('/proc').iterdir():
    if not d.name.isdigit() or int(d.name) == os.getpid():
        continue
    info = process(int(d.name))
    if not info:
        continue
    assert not any(x.endswith(('scripts/t1411-campaign.py', 'scripts/t1411-reattach.py')) for x in info['args']), 'existing controller: '+d.name
    world_args = [x for x in info['args'] if x.startswith(str(root)+'/') and x.endswith(('/t1411-run.py', '/scripts/t1308-long-run.js', '/server/zone.js'))]
    if not world_args:
        continue
    pid, seen = int(d.name), set()
    while pid not in owners and pid > 1 and pid not in seen:
        seen.add(pid)
        parent = process(pid)
        pid = parent['parent'] if parent else 0
    assert pid in owners, 'unregistered world process: '+d.name
    if any(x.endswith('/server/zone.js') for x in world_args):
        zones.append(dict(pid=int(d.name), start=info['start'], wrapper=pid))
assert len(zones) <= len(active) and len({z['wrapper'] for z in zones}) == len(zones)
observation = dict(at=datetime.now(timezone.utc).isoformat(), wrappers={n: dict(identity) for n, identity in active.items()}, zones=zones,
                   worldsReplayed=0, actualWorldExitsUsed=True)
if a.check:
    print(json.dumps(observation, ensure_ascii=False))
    raise SystemExit(0)

state.setdefault('controllerReattachments', []).append(observation)
state['controller'] = dict(pid=os.getpid(), script=str(Path(__file__).resolve()), mode='adopt-surviving-wrappers')
state.pop('controllerError', None)
queue = [(arm, seed) for seed in [1020, 7, 42] for arm in ['ON', 'OFF'] if f'{arm}-{seed}' not in state['worlds']]
children = {}
try:
    while active or queue:
        for name, identity in list(active.items()):
            exit_file = runs/(name+'.exit.json')
            if not exit_file.exists():
                now = process(identity['pid'])
                child = children.get(name)
                assert now and now['start'] == identity['start'] and now['state'] != 'Z' and (child is None or child.poll() is None), 'wrapper disappeared/reused without exit evidence: '+name
                continue
            child = children.get(name)
            if child is not None and child.poll() is None:
                continue
            actual = read(exit_file)
            progress = read(runs/name/'progress.json')
            state['worlds'][name].update(exit=actual['exit'], checkpoint=progress['ck'], done=bool(progress['done']), lastStatus=(runs/name/'progress.txt').read_text())
            del active[name]
            children.pop(name, None)
        while queue and len(active) < 2:
            arm, seed = queue.pop(0)
            name = f'{arm}-{seed}'
            assert not (runs/(name+'.exit.json')).exists() and not (runs/name/'progress.json').exists(), name+' already has evidence'
            command = ['python3', str(method/'t1411-run.py'), arm, '--tree', str(root/'fast'), '--out', str(runs), '--tag', arm, '--seed', str(seed), '--days', '730', '--census']
            if arm == 'ON':
                command += ['--set', 'T1411_TERR_FAST=1']
            with (root/(name+'.driver.log')).open('ab') as log:
                child = subprocess.Popen(command, cwd=repo, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            info = process(child.pid)
            assert info, 'new wrapper vanished: '+name
            active[name] = dict(pid=child.pid, start=info['start'])
            children[name] = child
            state['worlds'][name] = dict(pid=child.pid, command=command)
        state['stage'] = 'six-worlds'
        save()
        print(json.dumps(dict(at=datetime.now(timezone.utc).isoformat(), active=list(active), queued=len(queue))), flush=True)
        if active:
            time.sleep(55)
    state['stage'] = 'worlds-finished'
    save()
except BaseException as exc:
    # Controller failures are not world exit codes. Preserve surviving worlds.
    state['stage'] = 'controller-stopped'
    state['controllerError'] = str(exc)
    save()
    raise
