# T1467 길 그림 셈 — 시계 판(us-line.json first) + 셈 판(touch json) + 기울기 판
import json, sys, os
R = '/tmp/t1467/r'
def first(d, arm):
    try:
        for o in json.load(open(f'{R}/{d}/us-line.json')):
            if o['arm'] == arm: return o['first']
    except Exception as e: return None
B = first('pil', 'base')
T = json.load(open(sys.argv[1]))
W = sys.argv[2] if len(sys.argv) > 2 else 'day'
TB = T['win'][W]; t = TB['ticks']; pop = B['pop']
seg = B['segDayUs' if W == 'day' else 'segNightUs']
tot = B['day' if W == 'day' else 'night']
print(f'== {W} · 틱 µs/사람 {tot:.3f} · 몸 {pop}')
body = ['결정 문(순회)', '화살·걸음 커널 준비', '이동 문(순회)', '계단·낙하·게이지·HP']
stand = walk = 0; rem = {}
out = {}
for k in body:
    S = TB['seg'][k]; C = S['ms'] / t; n = S['n'] / t; real = seg[k] * pop / 1000
    c0 = (C - real) / n if n else 0
    by = S['by']; rc = {}
    for c, v in by.items():
        rc[c] = max(0.0, v['ms'] / t - (v['n'] / t) * c0)
    inside = sum(rc.values()); rem[k] = max(0.0, real - inside)
    st = rc.get('서 있는', 0); wk = rc.get('걷는', 0)
    unS = 1 - by.get('서 있는', {}).get('chg', 0) / max(1, by.get('서 있는', {}).get('sn', 1))
    unW = 1 - by.get('걷는', {}).get('chg', 0) / max(1, by.get('걷는', {}).get('sn', 1))
    out[k] = dict(real=real, c0ns=c0 * 1e6, stand=st, walk=wk, other=rc.get('새 몸', 0), rem=rem[k], unS=unS, unW=unW, nS=by.get('서 있는', {}).get('n', 0) / t, nW=by.get('걷는', {}).get('n', 0) / t)
    print(f"  {k}: 시계 {real:.3f} ms/틱 · 감싸기 몫 {c0*1e6:.0f} ns/부름 · 서 있는 {st:.3f}(안 바뀜 {unS*100:.1f}%) · 걷는 {wk:.3f}(안 바뀜 {unW*100:.1f}%) · 그 밖 몸 {rc.get('새 몸',0):.3f} · 부름 밖 {rem[k]:.3f}")
cls = TB['cls']; sh = cls.get('서 있는', 0) / (cls.get('서 있는', 0) + cls.get('걷는', 0))
k_cross = TB['tick']['keys'].get('_rdK', 0) / max(1, TB['tick']['keys'].get('x', 1))
print(f'  서 있는 몸 몫 {sh*100:.1f}% · 걷는 몸 길 칸 넘음 {k_cross*100:.1f}% 틱(칸마다 {1/max(k_cross,1e-9):.1f} 틱)')
ms2us = lambda ms: ms * 1000 / pop
idx = seg['공간 색인·입력 시한']
# ㉮ 서 있는 몸 — 네 부름 몫 × 안 바뀐 몫 + 색인 · 이동 문 부름 밖(밀기 · 고리) 의 서 있는 몫(사람 비례 어림)
ga = sum(ms2us(out[k]['stand'] * out[k]['unS']) for k in body)
ga_idx = idx * sh; ga_rem = ms2us(out['이동 문(순회)']['rem']) * sh
# ㉯ 걷는 몸 — 네 부름 몫 + 커널 준비 부름 밖(커널 걸음 · 열 채움) + 이동 문 부름 밖 걷는 몫 → 칸 넘을 때만(1 − 넘는 몫)
gb_base = sum(ms2us(out[k]['walk']) for k in body) + ms2us(out['화살·걸음 커널 준비']['rem']) + ms2us(out['이동 문(순회)']['rem']) * (1 - sh) + idx * (1 - sh)
gb = gb_base * (1 - k_cross)
print(f'  ㉮ 서 있는 몸 아예 안 만짐 −{ga + ga_idx + ga_rem:.3f}(부름 {ga:.3f} · 색인 {ga_idx:.3f} · 밀기·고리 {ga_rem:.3f})')
print(f'  ㉯ 걷는 몸 칸 넘을 때만 −{gb:.3f}(걷는 몸 몫 {gb_base:.3f} × {1-k_cross:.3f})')
json.dump(dict(W=W, tot=tot, pop=pop, seg=seg, out=out, standShare=sh, cross=k_cross, ga=ga + ga_idx + ga_rem, gaParts=[ga, ga_idx, ga_rem], gbBase=gb_base, gb=gb), open(f'/tmp/t1467/ana-{W}.json', 'w'), ensure_ascii=False, indent=1)
