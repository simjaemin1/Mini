#!/usr/bin/env python3
"""Preserve obsolete T1411 stop dumps as verified gzip; leave live state/ck alone.

Canonical T1308 reads the current ck/stop-N.json, never older root stop dumps.
Only closed endpoints strictly before both progress and binary checkpoint qualify.
This is storage maintenance, not a world launch or a change to measurement code.
"""
import argparse, gzip, hashlib, json, os, re, shutil
from datetime import datetime, timezone
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--runs', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--cases', default='ON-1020,OFF-1020,ON-7,OFF-7,ON-42,OFF-42')
a = p.parse_args()

def digest(stream):
    h = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024*1024), b''):
        h.update(chunk)
    return h.hexdigest()

def save(path, data):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1)+'\n')
    tmp.replace(path)

results = []
for name in a.cases.split(','):
    assert re.fullmatch(r'(ON|OFF)-(1020|7|42)', name), name
    src = a.runs/name
    if not (src/'progress.json').exists() or not (src/'ck/day').exists():
        continue
    progress = json.loads((src/'progress.json').read_text())
    boundary = min(progress['ck'], int((src/'ck/day').read_text()))
    endpoints = {s['to'] for s in progress['segs'] if s['code'] == 0}
    dest = a.out/name
    dest.mkdir(parents=True, exist_ok=True)
    manifest_path = dest/'manifest.json'
    records = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    packed = removed = compressed = 0
    for f in sorted(src.glob('stop-*.json')):
        match = re.fullmatch(r'stop-(\d+)\.json', f.name)
        if not match or int(match[1]) >= boundary or int(match[1]) not in endpoints:
            continue
        before = f.stat()
        with f.open('rb') as stream:
            expected = digest(stream)
        target = dest/(f.name+'.gz')
        created = not target.exists()
        if created:
            tmp = target.with_suffix('.tmp')
            with f.open('rb') as source, tmp.open('wb') as out:
                with gzip.GzipFile(filename='', mode='wb', fileobj=out, mtime=0, compresslevel=5) as g:
                    shutil.copyfileobj(source, g)
                out.flush()
                os.fsync(out.fileno())
            tmp.replace(target)
        with gzip.open(target, 'rb') as stream:
            assert digest(stream) == expected, str(target)
        after = f.stat()
        assert (before.st_size, before.st_mtime_ns) == (after.st_size, after.st_mtime_ns), str(f)
        latest = json.loads((src/'progress.json').read_text())
        assert latest['ck'] >= boundary and int((src/'ck/day').read_text()) >= boundary
        if f.name in records:
            assert records[f.name]['sourceSha256'] == expected, str(f)
        records[f.name] = dict(sourceSha256=expected, sourceBytes=before.st_size,
            gzipBytes=target.stat().st_size, archive=str(target.resolve()),
            verifiedAt=datetime.now(timezone.utc).isoformat(), checkpointBoundary=boundary)
        # Preserve verified recovery instructions before removing the duplicate.
        save(manifest_path, records)
        f.unlink()
        packed += 1
        removed += before.st_size
        compressed += target.stat().st_size if created else 0
    results.append(dict(case=name, checkpointBoundary=boundary, packed=packed,
                        sourceBytesRemoved=removed, gzipBytesAdded=compressed,
                        manifest=str(manifest_path.resolve())))
print(json.dumps(results, ensure_ascii=False))
