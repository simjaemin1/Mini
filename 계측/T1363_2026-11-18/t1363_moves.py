#!/usr/bin/env python3
# T1363 ① · ② — 기근 블록 ∧ 치명 도구 마을-날(두 해)의 옮김 · 석공 · 돌 — 마을-날 줄(t1363 훅 · 랩 자 t1363lab)만 읽는다(세계 0)
#   실행: python3 t1363_moves.py <판 이름=마을-날 JSON> … [--out <json>]
#   칸(날 0 ~ 729):
#     · 마을-날 · 기근 블록(곳간 < 사람 × 30) · 치명 도구(곳간 도구 < 도구 쓰는 일꾼 × 0.7) · 둘 다
#     · 둘 다 인 날 옮긴 사람(사람 id 로 어제 일과 견줌) — 석공 나감 · 들어옴 · 채집꾼 나감 · 들어옴
#     · 둘 다 인 날 갈래 — 쪼을 돌 없음(곳간 돌 < 석공 하루 재료) · 그 가운데 석공이 목표만큼 · 석공 목표만큼 + 돌 있음 · 석공 목표 밑 · 석공 0 · 만든 석기(마을-날 평균)
#     · 도구 몫 0.5 밑 마을-날 · 두 해 굶어 죽음(그 가운데 도구 몫 0.5 밑 날) · K 위 죽음(그 가운데 도구 몫 0.5 밑 날)
#       (K 위 죽음 = 서버 훅 `kovTot` · 랩 자 `deadTot − fdTot − natTot` · 누계의 마을 날 차)
import json, sys, collections
A = sys.argv[1:]
OUT = A[A.index('--out') + 1] if '--out' in A else None
RUNS = [a for a in A if '=' in a and not a.startswith('--')]

def moves(tag, p):
    J = json.load(open(p)); C = {c: i for i, c in enumerate(J['cols'])}
    g = lambda r, k: r[C[k]] if k in C else None
    x = collections.Counter(); made = 0.0; lastF, lastK = {}, {}
    for r in J['rows']:
        d, v = g(r, 'day'), g(r, 'v')
        if d > 729: continue
        f = g(r, 'fdTot') or 0
        k = (g(r, 'kovTot') or 0) if 'kovTot' in C else ((g(r, 'deadTot') or 0) - f - (g(r, 'natTot') or 0))
        df = max(0, f - lastF.get(v, f)); dk = max(0, k - lastK.get(v, k)); lastF[v] = f; lastK[v] = k
        x['vd'] += 1; x['fd'] += df; x['kov'] += dk
        tc = g(r, 'toolCov')
        if tc is not None and tc < 0.5: x['low'] += 1; x['fdLow'] += df; x['kovLow'] += dk
        fam, crit = g(r, 'famine') == 1, g(r, 'toolCrit') == 1
        x['fam'] += fam; x['crit'] += crit
        if not (fam and crit): continue
        x['both'] += 1
        mv = g(r, 'moves')
        if isinstance(mv, dict):
            for kk, c in mv.items():
                o, n_ = kk.split('>', 1)
                x['mv'] += c
                if o == 'mason': x['masonOut'] += c
                if n_ == 'mason': x['masonIn'] += c
                if o == 'forager': x['foragerOut'] += c
                if n_ == 'forager': x['foragerIn'] += c
        atT = (g(r, 'n_mason') or 0) >= (g(r, 'masonT') or 0); ready = (g(r, 'stone') or 0) >= (g(r, 'stoneWork') or 0.2)
        x['noStone'] += (not ready); x['noStoneAtT'] += (atT and not ready); x['atTStone'] += (atT and ready); x['belowT'] += (not atT)
        x['mason0'] += (g(r, 'n_mason') == 0); made += g(r, 'toolMade') or 0
    res = dict(x); res['tag'] = tag; res['madePerVD'] = round(made / x['both'], 2) if x['both'] else None
    return res

R = [moves(t, p) for t, p in (a.split('=', 1) for a in RUNS)]
pc = lambda a, b: f"{100 * a / b:.0f}%" if b else '—'
for r in R:
    b = r.get('both', 0)
    print(f"== {r['tag']} — 두 해 마을-날 {r['vd']:,} · 기근 블록 {r.get('fam', 0):,} · 치명 도구 {r.get('crit', 0):,} · 둘 다 {b:,} | 둘 다 인 날 석공 나감 {r.get('masonOut', 0)} / 들어옴 {r.get('masonIn', 0)} · "
          f"채집꾼 나감 {r.get('foragerOut', 0)} / 들어옴 {r.get('foragerIn', 0)} | 쪼을 돌 없음 {pc(r.get('noStone', 0), b)}(석공 목표만큼 {pc(r.get('noStoneAtT', 0), b)}) · 석공 목표만큼 + 돌 {pc(r.get('atTStone', 0), b)} · "
          f"석공 목표 밑 {pc(r.get('belowT', 0), b)} · 석공 0 {pc(r.get('mason0', 0), b)} · 만든 석기 {r['madePerVD']} | 도구 몫 0.5 밑 {r.get('low', 0):,} · 굶어 죽음 {r.get('fd', 0)}({r.get('fdLow', 0)}) · K 위 죽음 {r.get('kov', 0)}({pc(r.get('kovLow', 0), r.get('kov', 0))})")
if OUT: json.dump(R, open(OUT, 'w'), ensure_ascii=False, indent=1)
