"""T1329 — 몸 영토 처리량 판(T1308 자 · 마디 판)을 모은다. 판 끝 수(인구 · 이탈 · 굶음 · CPU · 몸 완공 · 일괄)는 T1318 모으개(`t1318-collect.py` 의 `arm`)를 그대로 부르고,
T1329 관찰기(`scripts/t1329-observe.js` · `seg-<날>.json.t1329-days.jsonl`)에서 마을 · 날 칸(줄 길이 · 일감 몸 · 완공 · 시간 가름 · 여유 크루 · 줄 머리 · 크루 몸)을 더한다.
쓰기: python3 scripts/t1329-collect.py <판 뿌리> [<내보낼 폴더>]     (판 폴더 = <뿌리>/<팔>-<시드> · 팔 OFF · DIAG · FIX)
"""
import json, sys, os, re, csv, importlib.util, statistics
from pathlib import Path
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('t1318c', HERE / 't1318-collect.py'); T1318 = importlib.util.module_from_spec(spec); spec.loader.exec_module(T1318)
ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '/dev/shm/t1329/runs')
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else None
CLS = ['개간', '벌목', '통나무', '현장', '말뚝', '기다림', '밤']

def obs(d):
    """T1329 관찰기 날 줄 — 마디마다 프로세스 누계(`done` = `_t1207.body`)를 날 차로 바꾼다."""
    d = Path(d); out = []
    for s in T1318.segs(d):
        p = d / f'seg-{s}.json.t1329-days.jsonl'
        if not p.exists(): continue
        prev = {}
        for l in p.read_text().splitlines():
            if not l.strip(): continue
            r = json.loads(l)
            for v in r['vils']:
                v['doneDay'] = v['done'] - prev.get(v['n'], 0); prev[v['n']] = v['done']
            r['seg'] = s; out.append(r)
    return out

def tenday(rows, f):
    acc = {}
    for r in rows: acc.setdefault((r['day'] - 1) // 10, []).append(f(r))
    return acc

def diag(rows):
    if not rows: return None
    days = {}
    for r in rows:
        vs = r['vils']; T = {k: sum(v['s'][k] for v in vs) for k in CLS}; tot = sum(T.values()) or 1
        work = [v for v in vs if v['doneDay'] > 0]
        days[r['day']] = dict(done=sum(v['doneDay'] for v in vs), pend=sum(v['pend'] for v in vs), pend60=sum(1 for v in vs if v['pend'] >= 60),
            jobBodies=sum(v['jobBodies'] for v in vs), spare=sum(v['spare'] for v in vs), zeroVils=sum(1 for v in vs if v['doneDay'] == 0), cuts=sum(v['cuts'] for v in vs),
            trips=sum(v.get('trips', 0) for v in vs), waitVils=sum(1 for v in vs if v['s']['기다림'] > 0), share={k: T[k] / tot for k in CLS}, sec=T,
            fullHands=sum(1 for v in vs for c in (v.get('crew') or []) if c.get('hn', 0) == 0 and v['doneDay'] == 0 and v['s']['말뚝'] > 0 and c.get('inv') and sum(c['inv'].values()) > 50))
    ten = {}
    for k, xs in tenday([dict(day=d, **x) for d, x in days.items()], lambda x: x).items():
        sec = {c: sum(x['sec'][c] for x in xs) for c in CLS}; tot = sum(sec.values()) or 1
        ten[f'{k * 10 + 1}-{k * 10 + 10}'] = dict(done=sum(x['done'] for x in xs), zeroVilsAvg=statistics.mean(x['zeroVils'] for x in xs), pendAvg=statistics.mean(x['pend'] for x in xs),
            pend60Avg=statistics.mean(x['pend60'] for x in xs), jobBodiesAvg=statistics.mean(x['jobBodies'] for x in xs), spareAvg=statistics.mean(x['spare'] for x in xs),
            waitVilsAvg=statistics.mean(x['waitVils'] for x in xs), share={c: round(sec[c] / tot, 4) for c in CLS}, segFirst=[x['done'] for x in xs if x['day'] % 10 == 1])
    vil = {}
    for r in rows:
        for v in r['vils']:
            o = vil.setdefault(v['n'], {'done10': {}, 'zeroDays': 0, 'days': 0})
            k = (r['day'] - 1) // 10; o['done10'][k] = o['done10'].get(k, 0) + v['doneDay']; o['days'] += 1; o['zeroDays'] += v['doneDay'] == 0
    return dict(days=days, ten=ten, vil=vil)

if __name__ == '__main__':
    res = {}
    for p in sorted(ROOT.iterdir()) if ROOT.exists() else []:
        if not (p / 'progress.json').exists(): continue
        try: a = T1318.arm(p)
        except Exception as e: print('skip', p.name, e); continue
        a['t1329'] = diag(obs(p)); res[p.name] = a
    for name, x in res.items():
        m = re.match(r'^(\w+?)(t\d+)?-(\d+)$', name)
        if not m: continue
        o = res.get(f'OFF-{m.group(3)}')
        if o and o is not x and o['days'] == x['days'] and o['pop']: x['offRatio'] = x['pop'] / o['pop']
    for k, v in res.items():
        print(k, {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items() if kk not in ('events', 'daily', 'emigrationDays', 't1329', 'segs')})
        if v.get('t1329'):
            for t, x in v['t1329']['ten'].items(): print('   ', t, {kk: (round(vv, 2) if isinstance(vv, float) else vv) for kk, vv in x.items()})
    if OUT:
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / 'summary.json').write_text(json.dumps({k: {kk: (vv if kk != 't1329' else {'ten': vv['ten'], 'vil': vv['vil']} if vv else None) for kk, vv in v.items() if kk not in ('daily',)} for k, v in res.items()}, ensure_ascii=False, indent=1))
        with (OUT / 'daily.csv').open('w') as f:
            w = csv.writer(f, lineterminator='\n')
            w.writerow(['case', 'day', 'pop', 'bodies', 'empty', 'cpuSeconds', 'emigrationCumulative', 'bodyStarve', 'debtDeaths', 'territory', 'physical', 'batch',
                        'done', 'pend', 'pend60', 'jobBodies', 'spare', 'zeroVils', 'waitVils', 'trips', 'cuts'] + ['s_' + c for c in CLS])
            for k, v in res.items():
                D = (v.get('t1329') or {}).get('days', {})
                for r in v['daily']:
                    x = D.get(r['day'], {})
                    w.writerow([k] + [r[c] for c in ('day', 'pop', 'bodies', 'empty', 'cpuSeconds', 'emigrationCumulative', 'bodyStarve', 'debtDeaths', 'territory', 'physical', 'batch')]
                               + [x.get(c) for c in ('done', 'pend', 'pend60', 'jobBodies', 'spare', 'zeroVils', 'waitVils', 'trips', 'cuts')] + [(x.get('sec') or {}).get(c) for c in CLS])
        F = ['day', 'village', 'person', 'job', 'age', 'population', 'bodies', 'food', 'wood', 'happiness', 'health', 'housing', 'mapBeds', 'pressure', 'to', 'bodyPeople']
        for k, v in res.items():
            if not v['events']: continue
            with (OUT / f'{k}-emigration.csv').open('w') as f:
                w = csv.DictWriter(f, fieldnames=F, lineterminator='\n'); w.writeheader()
                for e in v['events']:
                    dep = e.get('depart') or {}
                    w.writerow({c: e.get(c) for c in F} | {'to': dep.get('to'), 'bodyPeople': ' '.join(str(x) for x in (dep.get('bodyPeople') or []))})
