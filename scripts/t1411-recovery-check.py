#!/usr/bin/env python3
"""Compare retained daily observations across an infrastructure interruption; no world launches."""
import argparse, gzip, hashlib, json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--evidence', type=Path, required=True)
p.add_argument('--runs', type=Path, required=True)
p.add_argument('--out', type=Path, required=True)
p.add_argument('--allow-incomplete', action='store_true')
a = p.parse_args()
record = json.loads((a.evidence/'interruption.json').read_text())
channels = {'t1274-days': {'cpuSeconds', 'processCPUSeconds', 'uptimeSeconds'},
            't1302-days': set(), 't1411-census': set()}
results, complete = {}, True
for name, case in record['cases'].items():
    for channel, timing in channels.items():
        filename = f"seg-{case['checkpoint']}.json.{channel}.jsonl"
        old = a.evidence/name/(filename+'.gz')
        if not old.exists():
            continue
        with gzip.open(old, 'rt') as f:
            before = {r['day']: r for r in (json.loads(line) for line in f if line.strip())}
        current = a.runs/name/filename
        after = {}
        if current.exists():
            for line in current.read_text().splitlines(keepends=True):
                # A live append may expose an unfinished final write.
                if not line.endswith('\n'):
                    continue
                r = json.loads(line)
                after[r['day']] = r
        matched, differences = [], []
        for day in sorted(before.keys() & after.keys()):
            left = {k: v for k, v in before[day].items() if k not in timing}
            right = {k: v for k, v in after[day].items() if k not in timing}
            if left != right:
                differences.append(dict(day=day, fields=sorted(k for k in left.keys() | right.keys() if k not in left or k not in right or left[k] != right[k])))
            else:
                matched.append(day)
        done = set(matched) == set(before) and not differences
        complete = complete and done
        results[name+'/'+channel] = dict(expectedDays=sorted(before), matchedDays=matched,
            excludedTimingFields=sorted(timing), differences=differences,
            archivedFileSha256=hashlib.sha256(old.read_bytes()).hexdigest())
complete = complete and any(v['expectedDays'] for v in results.values())
result = dict(kind='daily-observation-replay-check', complete=complete,
    scope='All retained daily observation fields except the three named CPU/uptime fields; not a full-state fingerprint or an independent world.',
    cases=results)
a.out.parent.mkdir(parents=True, exist_ok=True)
a.out.write_text(json.dumps(result, ensure_ascii=False, indent=1))
print(json.dumps(dict(complete=complete, matched={k: len(v['matchedDays']) for k, v in results.items()}), ensure_ascii=False))
if any(v['differences'] for v in results.values()):
    raise SystemExit(1)
raise SystemExit(0 if complete or a.allow_incomplete else 2)
