#!/usr/bin/env python3
"""Summarize the completed, read-only hourly diagnostic; means are sample means."""
import argparse, csv, json, statistics
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('run', type=Path)
p.add_argument('--out', type=Path, required=True)
a = p.parse_args()
P = json.loads((a.run/'progress.json').read_text())
assert P['done'], 'use a completed diagnostic, not a partial stream'
assert json.loads((a.run.parent/(a.run.name+'.exit.json')).read_text())['exit'] == 0
day_ms = float(P['env']['VILLAGE_DAY_MS'])
assert day_ms > 0

def records(suffix):
    rows = []
    for seg in P['segs']:
        f = a.run/f"seg-{seg['from']}.json.{suffix}.jsonl"
        if f.exists():
            rows += [json.loads(s) for s in f.read_text().splitlines() if s.strip()]
    return rows

hourly = sorted(records('t1411-hourly'), key=lambda r: r['now'])
daily = sorted([r for r in records('t1411-census') if 'lifeSleep' in r], key=lambda r: r['day'])
assert hourly and daily, 'v3 hourly and daily snapshots are required'
assert len({r['now'] for r in hourly}) == len(hourly), 'duplicate observations'
for r in hourly:
    assert r['lifeSleep'] + r['lifeOther'] + r['lifeUnknown'] == r['bodies'], 'activity label closure'
    assert 0 <= r['scheduledAwake'] <= r['bodies'] and 0 <= r['moving'] <= r['bodies']
    assert r['nonResidentPlayerEntries'] == r['allPlayerEntries'] - r['bodies']

stops = sorted((a.run/'ck').glob('stop-*.json'))
lo = json.loads(stops[-1].read_text())['at'] if stops else hourly[0]['now']
rows = []
metrics = ['bodies', 'scheduledAwake', 'lifeSleep', 'lifeOther', 'lifeUnknown', 'moving', 'allPlayerEntries', 'nonResidentPlayerEntries']
for boundary in daily:
    hi = boundary['now']
    if hi <= lo:
        continue
    samples = [r for r in hourly if lo <= r['now'] < hi]
    assert samples, ('no observations for boundary', boundary['day'])
    row = dict(day=boundary['day'], samples=len(samples), intervalGameHours=(hi-lo)/(day_ms/24),
               firstSampleAt=samples[0]['now'], lastSampleAt=samples[-1]['now'], ledgerAt=hi,
               bodiesAtLedger=boundary['bodies'], workWindowAtLedger=boundary['scheduledAwakeAtLedger'],
               lifeSleepAtLedger=boundary['lifeSleep'], lifeUnknownAtLedger=boundary['lifeUnknown'])
    for key in metrics:
        values = [r[key] for r in samples]
        row[key+'Mean'] = statistics.mean(values)
        row[key+'Min'] = min(values)
        row[key+'Max'] = max(values)
    rows.append(row); lo = hi

a.out.mkdir(parents=True, exist_ok=True)
with (a.out/'awake-days.csv').open('w') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]), lineterminator='\n'); w.writeheader(); w.writerows(rows)
flat = [{k: v for k, v in r.items() if k != 'villages'} for r in hourly]
with (a.out/'hourly.csv').open('w') as f:
    w = csv.DictWriter(f, fieldnames=list(flat[0]), lineterminator='\n'); w.writeheader(); w.writerows(flat)
result = dict(case=a.run.name, seed=P['seed'], diagnosticOnly=True, meanDefinition='unweighted actual snapshot sample means; not an exact time integral',
              workWindowDefinition='production day/longitude/duty window', activityDefinition='actual _lifeAct label: 취침 / other nonempty / unknown; not inferred consciousness',
              movingDefinition='nonzero velocity fields', firstIntervalMayBePartial=True, days=rows)
(a.out/'awake-summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=1))
print(json.dumps(dict(case=a.run.name, days=[r['day'] for r in rows], samples=len(hourly)), ensure_ascii=False))
