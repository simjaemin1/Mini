"""T1318 — T1302 본판(T1308 자 · 마디 판)을 모은다. 관찰기 칸은 프로세스마다 0 에서 다시 세는 것이 있어 마디별 끝 값을 더한다.
쓰기: python3 scripts/t1318-collect.py <판 뿌리=/tmp/t1318> [<내보낼 폴더>]
판 폴더 = <뿌리>/<팔>-<시드>(t1308-long-run.js · seg-<시작 날>.* 조각) — 팔 OFF · COMBO · BODY · 시드 1020 · 7.
"""
import json, sys, os, re, csv, statistics, gzip
from pathlib import Path
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/t1318')
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else None
rd = lambda p: json.loads(Path(p).read_text())
def jl(p):
    p = Path(p)
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []
def segs(d):
    return sorted(int(m.group(1)) for f in os.listdir(d) for m in [re.match(r'^seg-(\d+)\.log$', f)] if m)
def per_seg_sum(rows_by_seg, get):
    """프로세스마다 0 에서 세는 누계 — 마디마다 끝 값을 더한다(날 d 까지)."""
    out = {}; base = 0
    for s, rows in rows_by_seg:
        for r in rows: out[r['day']] = base + get(r)
        if rows: base += get(rows[-1])
    return out
def arm(d):
    d = Path(d); P = rd(d / 'progress.json'); S = segs(d)
    t74 = [(s, rd(d / f'seg-{s}.json.t1274.json')['rows']) for s in S if (d / f'seg-{s}.json.t1274.json').exists()]
    t02 = [(s, rd(d / f'seg-{s}.json.t1302.json')) for s in S if (d / f'seg-{s}.json.t1302.json').exists()]
    d02 = [(s, jl(d / f'seg-{s}.json.t1302-days.jsonl')) for s in S]
    rows = [r for _, rr in t74 for r in rr]
    days = [r['day'] for r in rows]
    first = {rr[0]['day'] for _, rr in t74 if rr}
    em = [e for _, x in t02 for e in x['emigration'] if e.get('accepted')]
    errs = [e for _, x in t02 for e in x.get('errors', [])]
    phys = per_seg_sum(d02, lambda r: r['physical']); added = per_seg_sum(d02, lambda r: r['added'])
    batch = per_seg_sum(d02, lambda r: r['batchCalls'])
    tc_cells = per_seg_sum(t74, lambda r: (r.get('territoryCost') or {}).get('cells', 0))
    tc_body = per_seg_sum(t74, lambda r: (r.get('territoryCost') or {}).get('body', 0))
    starve = per_seg_sum(t74, lambda r: r['bodyStarve'])
    born = per_seg_sum(t74, lambda r: r['bornCumulative'])
    missing = max((sum(len(v['missingPeople']) for v in r['villages']) for _, rr in d02 for r in rr), default=None)
    last = rows[-1] if rows else {}
    cpu_all = [r['cpuSeconds'] for r in rows if r['day'] > 1]
    cpu_run = [r['cpuSeconds'] for r in rows if r['day'] not in first]
    ratio = [(r['bodies'] / r['pop']) for r in rows if r['pop']]
    D = last.get('day')
    return dict(dir=str(d), done=P.get('done'), segs=[(x['from'], x['to'], round(x['sec'])) for x in P.get('segs', [])], days=D,
        pop=last.get('pop'), bodies=last.get('bodies'), empty=last.get('empty'),
        minBodyRatio=min(ratio) if ratio else None, maxBodyGap=max((r['pop'] - r['bodies'] for r in rows), default=None), maxMissingPeople=missing,
        physical=phys.get(D), added=added.get(D), batchCalls=batch.get(D), terrCells=tc_cells.get(D), terrBody=tc_body.get(D), territory=last.get('territory'),
        emigration=len(em), emigrationCumulativeField=last.get('emigrationCumulative'), emigrationDays={str(k): sum(1 for e in em if e['day'] == k) for k in sorted({e['day'] for e in em})},
        emig90=sum(1 for e in em if e['day'] >= 90), bodyStarve=starve.get(D), debtDeaths=last.get('debtDeaths'), bornCum=born.get(D),
        cpuMeanAll=statistics.mean(cpu_all) if cpu_all else None, cpuMeanRun=statistics.mean(cpu_run) if cpu_run else None,
        cpuSegFirst=statistics.mean([r['cpuSeconds'] for r in rows if r['day'] in first and r['day'] > 1]) if len(first) > 1 else None,
        errors=len(errs), events=em,
        daily=[{k: r[k] for k in ('day', 'pop', 'bodies', 'empty', 'cpuSeconds', 'emigrationCumulative', 'bodyStarve', 'debtDeaths', 'territory')} | {'physical': phys.get(r['day']), 'batch': batch.get(r['day'])} for r in rows])
if __name__ == '__main__':
    res = {}
    for name in ['OFF-1020', 'COMBO-1020', 'BODY-1020', 'OFF-7', 'COMBO-7', 'BODY-7']:
        if (ROOT / name / 'progress.json').exists(): res[name] = arm(ROOT / name)
    for s in ['1020', '7']:
        o = res.get(f'OFF-{s}')
        for a in ['COMBO', 'BODY']:
            x = res.get(f'{a}-{s}')
            if o and x and o['days'] == x['days'] and o['pop']: x['offRatio'] = x['pop'] / o['pop']
    for k, v in res.items():
        print(k, {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk not in ('events', 'daily', 'emigrationDays')})
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'summary.json').write_text(json.dumps({k: {kk: vv for kk, vv in v.items() if kk != 'daily'} for k, v in res.items()}, ensure_ascii=False, indent=1))
        with (OUT / 'daily.csv').open('w') as f:
            w = csv.writer(f, lineterminator='\n'); w.writerow(['case', 'day', 'pop', 'bodies', 'empty', 'cpuSeconds', 'emigrationCumulative', 'bodyStarve', 'debtDeaths', 'territory', 'physical', 'batch'])
            for k, v in res.items():
                for r in v['daily']: w.writerow([k] + [r[c] for c in ('day', 'pop', 'bodies', 'empty', 'cpuSeconds', 'emigrationCumulative', 'bodyStarve', 'debtDeaths', 'territory', 'physical', 'batch')])
        F = ['day', 'village', 'person', 'job', 'age', 'population', 'bodies', 'food', 'wood', 'happiness', 'health', 'housing', 'mapBeds', 'pressure', 'to', 'bodyPeople']
        for k, v in res.items():
            with (OUT / f'{k}-emigration.csv').open('w') as f:
                w = csv.DictWriter(f, fieldnames=F, lineterminator='\n'); w.writeheader()
                for e in v['events']:
                    dep = e.get('depart') or {}
                    w.writerow({c: e.get(c) for c in F} | {'to': dep.get('to'), 'bodyPeople': ' '.join(str(x) for x in (dep.get('bodyPeople') or []))})
