#!/usr/bin/env python3
"""T1411 serial gates, then six fixed-source worlds; never exceed two worlds."""
import argparse, hashlib, json, os, signal, subprocess, time
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--root', type=Path, required=True)
p.add_argument('--repo', type=Path, required=True)
p.add_argument('--resume', action='store_true', help='recover a verified infrastructure interruption; never retry an observed world failure')
a = p.parse_args()
root, repo = a.root.resolve(), a.repo.resolve()
runs = root/'worlds'
method = root/json.loads((root/'candidate-manifest.json').read_text()).get('methodsVersion', 'method-v1')
status_file = root/'campaign.json'
status = dict(stage='waiting-for-native-profile', worlds={}, diagnostics={}, fingerprint30=None)

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
    for name in ['base-profile-1020', 'base-plain-1020'] + list(status['worlds']) + list(status['diagnostics']):
        f = runs/name/'progress.txt'
        if f.exists():
            lines.append(f.read_text().strip())
    print(status['stage'] + '\n' + '\n'.join(lines), flush=True)

active = {}
try:
    if a.resume:
        status = read(status_file)
        recovery = read(root/'infrastructure-recovery.json')
        assert recovery['kind'] == 'cloud-environment-interruption' and recovery['productExitObserved'] is False
        assert status['stage'] == 'six-worlds' and status['fingerprint30'] is True
        assert read(root/'candidate-fingerprint100.json')['same'] is True
        assert all(g['exit'] == 0 for g in read(root/'gates/final/status.json'))
        assert all(e.get('exit') == 0 and e.get('done') for e in status['diagnostics'].values())
        # PID numbers from a previous machine lifetime are not process identities.
        # Inspect live command arguments before launching any recovery children.
        for proc in Path('/proc').iterdir():
            if not proc.name.isdigit() or int(proc.name) == os.getpid():
                continue
            try:
                argv = (proc/'cmdline').read_bytes().split(b'\0')
            except OSError:
                continue
            assert not any(x.startswith(str(root).encode()+b'/') and x.endswith((b'/server/zone.js', b'/scripts/t1308-long-run.js', b'/t1411-run.py')) for x in argv), 'existing world: '+proc.name
            assert not any(x.endswith(b'scripts/t1411-campaign.py') for x in argv), 'existing campaign: '+proc.name
    if not a.resume:
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
        gate_command = ['python3', str(repo/'scripts/t1411-check.py'), '--out', str(root/'gates/final')]
        if (root/'gates/final/status.json').exists():
            gate_command += ['--resume-with-manifest', str(root/'candidate-manifest.json')]
        checked(gate_command, root/'gate-driver.log')
    manifest = read(root/'candidate-manifest.json')
    for name, expected in manifest['featureSource'].items():
        assert hashlib.sha256((root/'fast'/name).read_bytes()).hexdigest() == expected, name
        assert hashlib.sha256((repo/name).read_bytes()).hexdigest() == expected, 'working tree changed: ' + name
    status['stage'] = 'six-worlds'; heartbeat()
    queue = [(arm, seed) for seed in [1020, 7, 42] for arm in ['ON', 'OFF'] if f'{arm}-{seed}' not in status['worlds']]
    if a.resume:
        pending = []
        for name, entry in status['worlds'].items():
            e = runs/(name+'.exit.json')
            P = progress(name)
            if e.exists():
                entry.update(exit=read(e)['exit'], checkpoint=P['ck'], done=bool(P.get('done')))
                continue
            assert 'exit' not in entry, 'terminal outcome missing its evidence: '+name
            assert not P.get('done') and (runs/name/'ck/day').read_text().strip() == str(P['ck'])
            archived = recovery['cases'][name]
            assert archived['checkpoint'] == P['ck']
            for filename, digest in archived['binaryCheckpointHashes'].items():
                assert hashlib.sha256((runs/name/'ck'/filename).read_bytes()).hexdigest() == digest
            assert P['env']['VILLAGE_NPC_CAP'] == 'Infinity' and P['env']['VILLAGE_DAY_MS'] == '1440000'
            pending.append((name, entry))
        assert len(pending) <= 2
        for name, entry in pending:
            with (root/(name+'.driver.log')).open('ab') as f:
                child = subprocess.Popen(entry['command'], cwd=repo, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
            active[name] = child
            entry.setdefault('infrastructureResumes', []).append(dict(checkpoint=progress(name)['ck'], evidence=str(root/'infrastructure-recovery.json'), previousPid=entry['pid']))
            entry['pid'] = child.pid
        heartbeat()
    while queue or active:
        for name, child in list(active.items()):
            code = child.poll()
            if code is None:
                continue
            P = progress(name)
            # Death is an observed outcome, never an automatic retry or a completed 730-day world.
            entry = status['worlds'].get(name, status['diagnostics'].get(name))
            entry.update(exit=code, checkpoint=P.get('ck'), done=bool(P.get('done')),
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
        if completed('base-plain-1020') and not status['diagnostics'] and len(active) < 2:
            name = 'late-profile-1020'
            command = ['python3', str(repo/'scripts/t1411-late-profile.py'), '--root', str(root)]
            with (root/(name+'.driver.log')).open('ab') as f:
                child = subprocess.Popen(command, cwd=repo, stdout=f, stderr=subprocess.STDOUT, start_new_session=True)
            active[name] = child
            status['diagnostics'][name] = dict(pid=child.pid, command=command, sharedPrefixThrough=90)
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
