#!/usr/bin/env python3
# T1452 보고 표 — 판 훅 칸(.t1452.json · .t1437.json)을 모아 보고 표 넷을 낸다(마크다운 + JSON)
#   ① 진단 — 지금 식 셋 + 앞날 장부가 틀린 날(놓침 · 헛울림 · 틀림 · H 30 · 90 · 180) — 재는 판(끔 세계에 장부만 곁에서 · 팔 off 인 장부 판) · 마을 꼴별
#   ② 맞음 — 예상 곳간 ↔ 실제(30 · 90 · 180날 앞 · 가운데 · 열에 아홉 · 치우침) · 크게 틀린 날 까닭 · 비상 · 모자람 철마다
#   ③ 판 — T1437 표 열(굶어 죽음 해마다 · 인구 · 끔비 · 빈 마을 · 나무꾼 0 마을-날 · 나무 값 · 식량 날치 가운데 · 광부 · 청동 · 주거) · 직업 · 장부 µs
# 쓰는 법: python3 t1452_report.py <out.md> <out.json> --farm <dir> --lab <dir> [--eq <dir>]
import json, os, sys, glob, importlib.util, gzip, math

HERE = os.path.dirname(os.path.abspath(__file__))
def _mod(name, path):
    s = importlib.util.spec_from_file_location(name, path); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
DIAG = _mod('t1452_diag', os.path.join(HERE, 't1452_diag.py'))
ACC = _mod('t1452_acc', os.path.join(HERE, 't1452_acc.py'))
TBL = _mod('t1437_table', os.path.join(HERE, '..', 'T1437_2026-11-22', 't1437_table.py'))

def _load(f):
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))
def arg(k, d=None):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d

OUTMD, OUTJ = sys.argv[1], sys.argv[2]
FARM, LAB, EQ = arg('--farm'), arg('--lab'), arg('--eq')
SEEDS = ('1020', '7', '42')

def find(d, tag, s, ext):
    if not d: return None
    for base in (os.path.join(d, f'{tag}-{s}{ext}'), os.path.join(d, f'{tag}-{s}', f'{tag}-{s}.json{ext}')):
        for g in (base, base + '.gz'):
            if os.path.exists(g): return g
    return None

ARMS = [   # (꼬리표 랩 · 밭 · 평형, 이름)
    (('LS', 'FS', 'EQS'), '끔(장부는 곁에서만 잰다)'),
    (('Lseen', 'Fseen', 'EQseen'), '겪은 낙폭(T1437 seen)'),
    (('LA', 'FA', 'EQA'), '앞날 장부(문 다 읽음)'),
    (('LR', 'FR', 'EQR'), '앞날 장부 값에만(T1452_AT=ref)'),
    (('LH', 'FH', None), 'ahead + 집 짓기 문(T1452_READS=house)'),
    (('LM', 'FM', None), 'ahead + 광부 길(T1452_READS=mine)'),
    ((None, 'FY', None), 'ahead + 출생 문 한 해 율(T1452_YEAR)'),
    ((None, 'FRe', None), '앞날 장부 값 + 비상(옛 팔 — 기근 블록이 비상을 읽음 · 고치기 앞 판)'),
]
WORLDS = (('랩(끔 세계) 800날', LAB, 0), ('밭 세계(T1421 판 조건 E) 730날', FARM, 1), ('평형 판(1,900날 저장본 + 730날)', EQ, 2))

R = {'diag': {}, 'acc': {}, 'tbl': {}, 'stat': {}}
md = []
def P(s=''): md.append(s)

# ── ③ 판 표 ─────────────────────────────────────────────────────────────────
P('## 판 표(T1437 표 열 · 시드마다)')
for wn, D, wi in WORLDS:
    if not D: continue
    P(f'\n### {wn}\n')
    P('| 팔 | 시드 | 사람(끔비) | 굶어 죽음 해마다 = 합 | 빈 마을 | 나무꾼 0 마을-날 | 나무 값 400 · 끝 | 식량 날치 가운데 | 광부 · 청동 | 주거 | 농부 · 어부 · 사냥 · 채집 · 나무꾼(끝 표) | 장부 µs(판 훅 · 셈 한 번 평균 · 가장 긴 — 서버 판은 가상 시계라 0 · 셈 몫은 §7) |')
    P('|---|---|---:|---|---:|---:|---|---:|---|---:|---|---|')
    base = {}
    for tags, nm in ARMS:
        tag = tags[wi]
        if not tag: continue
        for s in SEEDS:
            f37 = find(D, tag, s, '.t1437.json'); f52 = find(D, tag, s, '.t1452.json')
            if not f37: continue
            t = TBL.one(f37); R['tbl'][f'{tag}-{s}'] = t
            if tags[wi] == tags[0] or tag in ('LS', 'FS', 'EQS'): base[s] = t['pop'] if tag in ('LS', 'FS', 'EQS') else base.get(s)
            ratio = (t['pop'] / base[s]) if base.get(s) else None
            st = None
            if f52:
                d52 = _load(f52); st = d52.get('stat'); R['stat'][f'{tag}-{s}'] = st
            us = '—' if not st or not st.get('evals') else f"{st['us'] / st['evals']:.1f} · {st['maxUs']:.0f}"
            jb = (t.get('marks') or [[None]])[-1]
            jobs = ''
            try:
                d37 = _load(f37); J = d37['marks'][-1].get('jobs') or {}
                jobs = ' · '.join(str(J.get(k, 0)) for k in ('farmer', 'fisher', 'hunter', 'forager', 'lumberjack'))
            except Exception: jobs = '—'
            dead = ' · '.join(str(x) for x in t['dead'][:2] if x is not None)
            P(f"| {nm} | {s} | {t['pop']:,}({'—' if ratio is None else f'×{ratio:.3f}'}) | {dead} = {t['deadTot']:,} | {t['empty']} | {t['lj0']} % | {t['woodPx400']} · {t['woodPxEnd']} | {t['fdMed']} | {t['miner']} · {t['bronze']} | {t['housing']:,} | {jobs} | {us} |")

# ── ① 진단 ──────────────────────────────────────────────────────────────────
P('\n## 진단 — 식마다 틀린 날(마을-날 %) · 재는 판(끔 세계 + 장부는 곁에서)')
for wn, D, wi in WORLDS[:2]:
    if not D: continue
    tag = ('LS', 'FS')[wi]
    files = [find(D, tag, s, '.t1452.json') for s in SEEDS]; files = [f for f in files if f]
    if not files: continue
    P(f'\n### {wn} — {", ".join(os.path.basename(f).split(".")[0] for f in files)}\n')
    P('| H | 식 | 놓침 % | 헛울림 % | 틀림 % | 마을-날 |')
    P('|---:|---|---:|---:|---:|---:|')
    pool = {}
    bt = {}
    for f in files:
        for H in (30, 90, 180):
            r = DIAG.one(f, H); R['diag'][f'{os.path.basename(f)}:{H}'] = r
            for k, v in r['all'].items():
                a = pool.setdefault((H, k), [0, 0, 0]); a[0] += v['놓침%'] * v['날']; a[1] += v['헛울림%'] * v['날']; a[2] += v['날']
            if H == 90:
                for ty, T in r['byType'].items():
                    for k, v in T.items():
                        a = bt.setdefault((ty, k), [0, 0, 0]); a[0] += v['놓침%'] * v['날']; a[1] += v['헛울림%'] * v['날']; a[2] += v['날']
    NM = {'ga': '(가) 버틸 날', 'seen': '겪은 낙폭', 'yf': '한 해 율', 'ah': '앞날 장부(문 값 = 골 + 여유분)', 'ah0': '앞날 장부 골 그 자체(0 밑 첫날 ≤ H)'}
    for H in (30, 90, 180):
        for k in ('ga', 'seen', 'yf', 'ah', 'ah0'):
            a = pool.get((H, k))
            if not a or not a[2]: continue
            m, h = a[0] / a[2], a[1] / a[2]
            P(f'| {H} | {NM[k]} | {m:.1f} | {h:.1f} | {m + h:.1f} | {a[2]:,} |')
    P('\n마을 꼴별(H 90 · 틀림 % = 놓침 + 헛울림)\n')
    P('| 꼴 | (가) | 겪은 낙폭 | 한 해 율 | 앞날 장부(문 값) | 장부 골 그 자체 |')
    P('|---|---:|---:|---:|---:|---:|')
    for ty in sorted({t for t, _ in bt}):
        row = []
        for k in ('ga', 'seen', 'yf', 'ah', 'ah0'):
            a = bt.get((ty, k)); row.append('—' if not a or not a[2] else f'{(a[0] + a[1]) / a[2]:.1f}')
        P(f'| {ty} | ' + ' | '.join(row) + ' |')

# ── ② 맞음 ──────────────────────────────────────────────────────────────────
P('\n## 맞음 — 예상 곳간 ↔ 실제(날치 · |차| 가운데 · 열에 아홉 · 치우침) · 비상 · 모자람(철마다 마을-날 %)')
for wn, D, wi in WORLDS:
    if not D: continue
    P(f'\n### {wn}\n')
    P('| 판 | 30날 앞 | 90날 앞 | 180날 앞 | 비상 % 봄 · 여름 · 가을 · 겨울 | 0 밑 골 % 봄 · 여름 · 가을 · 겨울 |')
    P('|---|---|---|---|---|---|')
    for tag in (('LS', 'LA', 'LR'), ('FS', 'FA', 'FR', 'FRe', 'FY', 'FH', 'FM'), ('EQS', 'EQA', 'EQR'))[wi]:
        for s in SEEDS:
            f = find(D, tag, s, '.t1452.json')
            if not f: continue
            r = ACC.one(f); R['acc'][f'{tag}-{s}'] = r
            if not r['h30']['n']: continue
            cell = lambda h: f"{r[h]['가운데|차|']} · {r[h]['열에아홉|차|']} · {r[h]['치우침(가운데 차)']:+}" if r[h]['n'] else '—'
            em = ' · '.join(str(r['비상%'][k]) for k in 'suaw'); sh = ' · '.join(str(r['모자람%'][k]) for k in 'suaw')
            P(f'| {tag}-{s} | {cell("h30")} | {cell("h90")} | {cell("h180")} | {em} | {sh} |')
    # 까닭 표(밭 세계 · 장부가 문을 연 판 FA + 재는 판 FS)
P('\n### 크게 틀린 날(|차| 열에 아홉 위)의 까닭 — 90날 앞 · 판마다(먼저 걸린 하나)\n')
P('| 판 | 사람이 늘거나 줆 | 날씨(가뭄 · 폭풍) | 교역 | 거둠 | 그 밖(썩음 · 첫 해 흐름) |')
P('|---|---:|---:|---:|---:|---:|')
for key, r in R['acc'].items():
    if not r['h90']['n']: continue
    c = r['h90']['까닭']
    P(f"| {key} | " + ' | '.join(str(c.get(w, {}).get('크게 틀림', 0)) for w in ('사람', '날씨', '교역', '거둠', '그 밖')) + ' |')

open(OUTMD, 'w', encoding='utf-8').write('\n'.join(md) + '\n')
json.dump(R, open(OUTJ, 'w'), ensure_ascii=False, indent=1, default=str)
print(OUTMD)
