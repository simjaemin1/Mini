#!/usr/bin/env python3
"""T1411 recovery evidence: five-minute backups; never copy the live world DB."""
import argparse, gzip, json, shutil, subprocess, time
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runs', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
a.out.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parent
while not (a.out/'stop-watch').exists():
    r = subprocess.run(['python3', str(root/'t1358-backup.py'), '--runs', str(a.runs),
                        '--out', str(a.out/'worlds')], capture_output=True, text=True)
    status = []
    # Launch conditions and actual wrapper exits are part of recovery evidence,
    # including a run that dies before its next checkpoint.
    for f in list(a.runs.glob('*.json')) + list(a.runs.parent.glob('*manifest.json')) + list(a.runs.parent.glob('*fingerprint30.json')) + [a.runs.parent/'campaign.json']:
        if f.is_file():
            dest = a.out/'metadata'/f.name
            dest.parent.mkdir(parents=True, exist_ok=True)
            tmp = dest.with_suffix('.tmp'); shutil.copyfile(f, tmp); tmp.replace(dest)
    for d in sorted(a.runs.iterdir()):
        if not d.is_dir() or not (d/'progress.json').exists():
            continue
        progress = json.loads((d/'progress.json').read_text())
        status.append(dict(case=d.name, checkpoint=progress['ck'], done=progress['done'],
                           target=progress['days'], line=(d/'progress.txt').read_text().strip()))
        exit_file = a.runs/(d.name+'.exit.json')
        if exit_file.exists() and json.loads(exit_file.read_text())['exit'] != 0:
            for f in d.glob('seg-*'):
                if not f.is_file() or not f.name.endswith(('.log', '.json', '.jsonl')):
                    continue
                dest = a.out/'failed'/d.name/(f.name+'.gz')
                if dest.exists():
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                tmp = dest.with_suffix('.tmp')
                with f.open('rb') as src, gzip.open(tmp, 'wb', compresslevel=5) as dst:
                    shutil.copyfileobj(src, dst)
                tmp.replace(dest)
    for f in a.runs.glob('*-profiles/*.cpuprofile'):
        dest = a.out/'profiles'/f.parent.name/(f.name+'.gz')
        if dest.exists():
            continue
        try:
            data = f.read_bytes(); parsed = json.loads(data)
            if not parsed.get('endTime') or not parsed.get('samples'):
                continue
        except (OSError, ValueError):
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = dest.with_suffix('.tmp')
        with gzip.open(tmp, 'wb', compresslevel=5) as fp:
            fp.write(data)
        tmp.replace(dest)
    (a.out/'status.json').write_text(json.dumps(dict(backupExit=r.returncode, cases=status), indent=1))
    print(json.dumps(status), flush=True)
    if r.returncode:
        print(r.stderr, flush=True)
        raise SystemExit(r.returncode)
    time.sleep(300)
