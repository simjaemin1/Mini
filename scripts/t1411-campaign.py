#!/usr/bin/env python3
"""T1411 serial gates, then six fixed-source worlds; never exceed two worlds."""
import argparse, hashlib, json, os, signal, subprocess, time
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', type=Path, required=True)
p.add_argument('--repo', type=Path, required=True)
a = p.parse_args()
root, repo = a.root.resolve(), a.repo.resolve()
runs, method = root/'worlds', root/'method-v1'
status_file = root/'campaign.json'
status = dict(stage='waiting-for-native-profile', worlds={}, fingerprint30=None)

def read(path):
    return json.loads(path.read_text())

def save():
    temp = status_file.with_suffix('.tmp')
    temp.write_text(json.dumps(status, ensure_ascii=False, indent=1))
    temp.replace(status_file)

def checked(command, log):
    with log.open('wb') as f:
        r = subprocess.run(command, cwd=repo, stdout=f, stderr=subprocess.STDOUT)
    if r.returncode:
        raise RuntimeError(f'{log.name}: exit {r.returncode}')

def progress(name):
    f = runs/name/'progress.json'
    return read(f) if f.exists() else {}

def completed(name):
    e = runs/(name+'.exit.json')
    return e.exists() and read(e)['exit'] == 0 and progress(name).get('done')

def heartbeat():
    save()
    lines = []
    for name in ['base-profile-1020', 'base-plain-1020'] + list(status['worlds']):
        f = runs/name/'progress.txt'
        if f.exists():
            lines.append(f.read_text().strip())
    print(status['stage'] + '\n' + '\n'.join(lines), flush=True)

active = {}
try:
    while not completed('base-profile-1020') or progress('base-plain-1020').get('ck', 0) < 30:
        for name in ['base-profile-1020', 'base-plain-1020']:
            f = runs/(name+'.exit.json')
            if f.exists() and read(f)['exit']:
                raise RuntimeError(f'{name}: {read(f)}')
        heartbeat(); time.sleep(55)
    checked(['python3', str(method/'t1411-compare.py'), str(runs/'base-profile-1020'),
             str(runs/'base-plain-1020'), '--days', '30', '--out', str(root/'profile-fingerprint30.json')],
            root/'profile-compare.log')
    status['stage'] = 'focused-gates'; heartbeat()
    checked(['python3', str(repo/'scripts/t1411-check.py'), '--out', str(root/'gates/final')],
            root/'gate-driver.log')
    manifest = read(root/'candidate-manifest.json')
    for name, expected in manifest['featureSource'].items():
        assert hashlib.sha256((root/'fast'/name).read_bytes()).hexdigest() == expected, name
        assert hashlib.sha256((repo/name).read_bytes()).hexdigest() == expected, 'working tree changed: ' + name
    status['stage'] = 'six-worlds'; heartbeat()
    queue = [(arm, seed) for seed in [1020, 7, 42] for arm in ['ON', 'OFF']]
    while queue or active:
        for name, child in list(active.items()):
            code = child.poll()
            if code is None:
                continue
            P = progress(name)
            # Death is an observed outcome, never an automatic retry or a completed 730-day world.
            status['worlds'][name].update(exit=code, checkpoint=P.get('ck'), done=bool(P.get('done')),
                                          lastStatus=(runs/name/'progress.txt').read_text() if (runs/name/'progress.txt').exists() else None)
            del active[name]
        if status['fingerprint30'] is None:
            P = progress('ON-1020')
            if P.get('ck', 0) >= 30:
                checked(['python3', str(method/'t1411-compare.py'), str(runs/'base-plain-1020'),
                         str(runs/'ON-1020'), '--days', '30', '--out', str(root/'candidate-fingerprint30.json')],
                        root/'candidate-compare.log')
                status['fingerprint30'] = True
            elif 'ON-1020' in status['worlds'] and 'ON-1020' not in active:
                raise RuntimeError('candidate died before fingerprint30 validation')
        external = int(not completed('base-plain-1020'))
        while queue and len(active) + external < 2:
            if status['worlds'] and status['fingerprint30'] is None:
                break
            arm, seed = queue.pop(0)
            name = f'{arm}-{seed}'
            command = ['python3', str(method/'t1411-run.py'), arm,
                       '--tree', str(root/'fast'), '--out', str(runs), '--tag', arm,
                       '--seed', str(seed), '--days', '730', '--census']
            if arm == 'ON':
                command += ['--set', 'T1411_TERR_FAST=1']
            assert not (runs/(name+'.exit.json')).exists(), 'refuse to overwrite an observed outcome: ' + name
            with (root/(name+'.driver.log')).open('ab') as f:
                child = subprocess.Popen(command, cwd=repo, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
            active[name] = child
            status['worlds'][name] = dict(pid=child.pid, command=command)
        heartbeat(); time.sleep(55)
    status['stage'] = 'worlds-finished'; heartbeat()
except BaseException as exc:
    status['stage'] = 'stopped'
    status['error'] = str(exc)
    for child in active.values():
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
    heartbeat()
    raise
