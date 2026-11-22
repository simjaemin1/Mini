"""Offline archive of a closed prefix of the existing two worlds; launches none."""
import argparse, gzip, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--through', type=int, required=True)
p.add_argument('--reuse', type=Path)
p.add_argument('--root', type=Path, default=Path('/tmp/t1411'))
p.add_argument('--repo', type=Path, default=Path('/workspace/Mini'))
p.add_argument('--out', type=Path)
a = p.parse_args()
root, repo = a.root.resolve(), a.repo.resolve()
out = a.out or repo / f'계측/T1411_2026-11-21/pair-1020-{a.through}'
assert a.through % 10 == 0 and 0 < a.through < 730
assert not out.exists(), out
out.mkdir()
read = lambda f: json.loads(f.read_text())

with tempfile.TemporaryDirectory(prefix='closed-prefix-', dir=root) as td:
    stage = Path(td)
    for name in ['ON-1020', 'OFF-1020']:
        src = root/'worlds'/name
        progress = read(src/'progress.json')
        assert progress['ck'] >= a.through and progress['days'] == 730
        segments = [s for s in progress['segs'] if s['to'] <= a.through]
        assert [s['from'] for s in segments] == list(range(0, a.through, 10))
        dest = out/name
        dest.mkdir()
        staged = stage/name
        staged.mkdir()
        for s in segments:
            start = s['from']
            z = read(src/f'seg-{start}.json.zone-exit.json')
            m = read(src/f'seg-{start}.json.t1274-meta.json')
            assert s['code'] == z['code'] == m['exitEventCode'] == m['clock']['errs'] == 0
            for f in sorted(src.glob(f'seg-{start}.*')):
                if not f.is_file() or not f.name.endswith(('.json', '.jsonl', '.log')):
                    continue
                (staged/f.name).symlink_to(f)
                target = dest/(f.name+'.gz')
                prior = a.reuse/name/target.name if a.reuse else None
                if prior and prior.exists():
                    with gzip.open(prior, 'rb') as g:
                        assert hashlib.sha256(g.read()).digest() == hashlib.sha256(f.read_bytes()).digest(), str(f)
                    shutil.copyfile(prior, target)
                else:
                    with f.open('rb') as source, target.open('wb') as compressed:
                        with gzip.GzipFile(filename='', mode='wb', fileobj=compressed, mtime=0, compresslevel=5) as g:
                            shutil.copyfileobj(source, g)
        (dest/'closed-prefix.json').write_text(json.dumps(dict(
            sourceSegments=segments, through=a.through, actualTarget=730,
            sourceCheckpointAtArchive=progress['ck'], independentWorld=False), indent=1))
        # A temporary read view contains only closed segments. Keep target=730
        # and done=false; this does not manufacture a completed shorter world.
        progress.update(segs=segments, ck=a.through, done=False)
        (staged/'progress.json').write_text(json.dumps(progress))
        shutil.copyfile(root/'worlds'/(name+'.launch.json'), stage/(name+'.launch.json'))
        shutil.copyfile(stage/(name+'.launch.json'), out/(name+'.launch.json'))
    subprocess.run(['python3', str(repo/'scripts/t1411-collect.py'), '--runs', str(stage),
                    '--out', str(out), '--allow-live', '--cases', 'ON-1020,OFF-1020'], check=True, stdout=subprocess.DEVNULL)
    summary = read(out/'summary.json')
    for name, r in summary.items():
        assert r['days'] == a.through and not r['done'] and not r['failed']
        assert r['observerErrors'] == 0 and len(r['clockExitMeta']) == a.through//10
        if name.startswith('ON'):
            assert r['minBodyRatio'] == 1 and r['maxMissingResidents'] == 0
        subprocess.run(['python3', str(repo/'scripts/t1411-compare.py'), str(root/'worlds'/name),
                        str(out/name), '--days', str(a.through), '--out',
                        str(out/f'archive-{name.lower()}-integrity{a.through}.json')], check=True, stdout=subprocess.DEVNULL)
        print(name, json.dumps(r['points'][str(a.through)], ensure_ascii=False))
shutil.copyfile(__file__, out/'archive-prefix.py')
print(out)
