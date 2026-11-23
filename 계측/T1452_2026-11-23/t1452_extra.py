#!/usr/bin/env python3
# T1452 보고 덧셈 — 판 훅 칸(.t1452.json · .t1437.json)에서 보고 §3 · §4 의 수를 모은다(손으로 옮겨 적지 않게)
#   팔마다(시드 묶음): 기근 문이 열린 마을-날 %(장부 문 값 sd < need · (가) sd < ga · 장부 문은 날 창마다도) · 비상 · 0 밑 골 % · 들여온 식량(마을 꼴별) · 굶어 죽음(마을 꼴별)
#     · 여유분 나눔(둘째 해 — 날 366 부터 · 가운데 · 열에 아홉 · 날 창 366 ~ 400 · 500 ~ 540 · 690 ~ 729 · 760 ~ 799 마다) · 같은 판의 겪은 낙폭(T1437 고리 셈 — 곳간 꼭대기 → 바닥 · 둘째 해) · 창 안 골 나눔 · 일 수 100날 줄(시드 합 — 농부 · 어부 · 사냥 · 채집 · 나무꾼)
# 쓰는 법: python3 t1452_extra.py <out.json> --farm <dir> --lab <dir> <꼬리표> …
import json, os, sys, re, gzip, importlib.util
_s = importlib.util.spec_from_file_location('t1452_diag', os.path.join(os.path.dirname(os.path.abspath(__file__)), 't1452_diag.py')); DIAG = importlib.util.module_from_spec(_s); _s.loader.exec_module(DIAG)

def _load(f):
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))
def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
def q(a, p):
    a = sorted(a); return a[min(len(a) - 1, int(p * len(a)))] if a else None
OUT = sys.argv[1]; FARM, LAB = arg('--farm'), arg('--lab')
TAGS = [a for i, a in enumerate(sys.argv[2:], 2) if not a.startswith('--') and sys.argv[i - 1] not in ('--farm', '--lab')]
SEEDS = ('1020', '7', '42')
typ = lambda n: re.sub(r'[0-9]+$', '', n or '')

def find(tag, s, ext):
    for d in (FARM, LAB):
        if not d: continue
        for base in (os.path.join(d, f'{tag}-{s}{ext}'), os.path.join(d, f'{tag}-{s}', f'{tag}-{s}.json{ext}')):
            for g in (base, base + '.gz'):
                if os.path.exists(g): return g
    return None

R = {}
for tag in TAGS:
    a = {'seeds': [], 'vd': 0, 'doorAh': 0, 'doorGa': 0, 'emerg': 0, 'short': 0, 'imp': {}, 'fd': {}, 'buf2': [], 'seen2': [], 'minW': [], 'jobs': {}, 'bufW': {}}
    for s in SEEDS:
        f = find(tag, s, '.t1452.json')
        if not f: continue
        a['seeds'].append(s); d = _load(f); dfc = d.get('dfc') or 1
        for v in d['vil']:
            S, N, ga, ah, im, fd = v['S'], v['N'], v['ga'], v.get('ah') or [], v.get('im') or [], v.get('fd') or []
            t = typ(v['name']); d0 = v.get('d0', 0)
            sdd = [(S[i] / (N[i] * dfc)) if (N[i] and S[i] is not None) else None for i in range(len(S))]
            bfs = DIAG.buf_series(sdd, v['sh'], N)
            for i in range(len(S)):
                if N[i] and d0 + i >= 366: a['seen2'].append(bfs[i])
                if not N[i] or S[i] is None: continue
                sd = S[i] / (N[i] * dfc); a['vd'] += 1
                if ga[i] is not None and sd < ga[i]: a['doorGa'] += 1
                x = ah[i] if i < len(ah) else None
                if not x: continue
                if x[4] is not None and sd < x[4]: a['doorAh'] += 1
                if x[4] is not None:
                    for lo, hi in ((1, 365), (366, 400), (500, 540), (690, 729), (760, 799)):
                        if lo <= d0 + i <= hi: w = a.setdefault('doorW', {}).setdefault(f'{lo}-{hi}', [0, 0]); w[1] += 1; w[0] += 1 if sd < x[4] else 0
                if x[3]: a['emerg'] += 1
                if x[0] is not None and x[0] < 0: a['short'] += 1
                if x[2] is not None and d0 + i >= 366: a['buf2'].append(x[2])
                if x[2] is not None:
                    for lo, hi in ((366, 400), (500, 540), (690, 729), (760, 799)):
                        if lo <= d0 + i <= hi: a['bufW'].setdefault(f'{lo}-{hi}', []).append(x[2])
                if x[8] is not None: a['minW'].append(x[8])
            a['imp'][t] = a['imp'].get(t, 0) + sum(z or 0 for z in im)
            a.setdefault('impS', {}); a['impS'][s] = a['impS'].get(s, 0) + sum(z or 0 for z in im)
            a['fd'][t] = a['fd'].get(t, 0) + sum(z or 0 for z in fd)
        f37 = find(tag, s, '.t1437.json')
        if f37:
            for m in _load(f37).get('marks') or []:
                J = m.get('jobs') or {}; row = a['jobs'].setdefault(str(m['day']), {'n': 0, 'pop': 0, 'farmer': 0, 'fisher': 0, 'hunter': 0, 'forager': 0, 'lumberjack': 0})
                row['n'] += 1; row['pop'] += m.get('pop') or 0
                for k in ('farmer', 'fisher', 'hunter', 'forager', 'lumberjack'): row[k] += J.get(k, 0) or 0
    if not a['seeds']: continue
    vd = max(1, a['vd'])
    R[tag] = {'seeds': a['seeds'], 'villageDays': a['vd'], 'doorAhPct': round(100 * a['doorAh'] / vd, 1), 'doorGaPct': round(100 * a['doorGa'] / vd, 1),
              'emergPct': round(100 * a['emerg'] / vd, 1), 'shortPct': round(100 * a['short'] / vd, 1),
              'imp': {k: round(v) for k, v in a['imp'].items()}, 'impTot': round(sum(a['imp'].values())), 'impBySeed': {k: round(v) for k, v in (a.get('impS') or {}).items()}, 'fd': {k: int(v) for k, v in a['fd'].items()}, 'fdTot': int(sum(a['fd'].values())),
              'buf2': {'med': q(a['buf2'], 0.5), 'p90': q(a['buf2'], 0.9), 'n': len(a['buf2'])}, 'seen2': {'med': q(a['seen2'], 0.5), 'p90': q(a['seen2'], 0.9)}, 'bufWin': {k: {'med': q(v, 0.5), 'p90': q(v, 0.9)} for k, v in a['bufW'].items()}, 'doorWin': {k: round(100 * v[0] / max(1, v[1]), 1) for k, v in (a.get('doorW') or {}).items()}, 'minW': {'med': q(a['minW'], 0.5), 'p10': q(a['minW'], 0.1), 'p90': q(a['minW'], 0.9)},
              'jobs': a['jobs']}
json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
for k, v in R.items():
    print(k, v['seeds'], '문(장부)', v['doorAhPct'], '문((가))', v['doorGaPct'], '비상', v['emergPct'], '0밑골', v['shortPct'], '들여옴', v['impTot'], '굶어죽음', v['fdTot'], '여유분 둘째 해', v['buf2'], '겪은 낙폭 둘째 해', v['seen2'])
