#!/usr/bin/env python3
"""Compare closed T1308 econ and complete village-field fingerprints by day."""
import argparse, json
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('left', type=Path)
p.add_argument('right', type=Path)
p.add_argument('--days', type=int, default=30)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()

def read(run):
    progress = json.loads((run / 'progress.json').read_text())
    econ, side = {}, {}
    for seg in progress['segs']:
        start = seg['from']
        for suffix, target, key in [('sbc', econ, lambda r: r[0]), ('t740', side, lambda r: r['d'])]:
            raw = json.loads((run / f'seg-{start}.json.{suffix}.json').read_text())
            for row in raw['days']:
                day = key(row)
                if day > a.days:
                    continue
                assert day not in target, (run, suffix, 'duplicate', day)
                target[day] = row
    expected = set(range(1, a.days + 1))
    assert set(econ) == set(side) == expected, (run, 'incomplete coverage', len(econ), len(side))
    return econ, side

left, right = read(a.left), read(a.right)
diffs = []
for day in range(1, a.days + 1):
    if left[0][day] != right[0][day]:
        diffs.append(dict(day=day, layer='econ'))
    lf, rf = left[1][day]['f'], right[1][day]['f']
    # The official comparator hashes absent fields as ∅, including fields first
    # introduced on later days. No worker/cache fields are excluded here.
    fields = [k for k in sorted(lf.keys() | rf.keys()) if (lf.get(k) or '∅') != (rf.get(k) or '∅')]
    if fields:
        diffs.append(dict(day=day, layer='village', fields=fields))
result = dict(left=str(a.left), right=str(a.right), days=a.days,
              econCompared=a.days, villageCompared=a.days,
              same=not diffs, differences=diffs)
a.out.parent.mkdir(parents=True, exist_ok=True)
a.out.write_text(json.dumps(result, ensure_ascii=False, indent=1))
print(json.dumps({k: v for k, v in result.items() if k != 'differences'}, ensure_ascii=False))
if diffs:
    print('First difference:', json.dumps(diffs[0], ensure_ascii=False))
raise SystemExit(int(bool(diffs)))
