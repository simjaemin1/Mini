#!/usr/bin/env python3
# T1437 자 진단 — 훅 칸(`t1437hook.js` · runs/*.t1437.json)에서 "겪은 낙폭"을 마을 · 해마다 잰다(세계 0 · 읽기만)
#   자 넷(+ 굶은 날):
#     V  곳간 날치(S ÷ 하루 먹을 것) − 못 먹은 날치 누계 의 꼭대기 → 그 뒤 바닥(= 넣은 자 · 'seen' 고리와 같은 셈)
#     A  곳간 날치만의 꼭대기 → 그 뒤 바닥(카드 글자 — 바닥이 0 에서 멈춘다)
#     Au 곳간 양(식량 환산)의 꼭대기 → 그 뒤 바닥 ÷ 그 해 끝 하루 먹을 것(양으로 잰 뒤 나눔)
#     B  누적(먹은 것 − 든 것) 날치의 가장 깊은 곳(먹은 것 = 사람 × 하루치 − 못 먹은 몫 · 든 것 = 그날 생산 환산 + 들여온 것)
#     G  굶은 날 수(그날 못 먹은 몫 > 0 인 날)
#   해 = 판 날 1 ~ 365 · 366 ~ 730(800날 판의 731 ~ 800 은 70날 — 따로 표에 안 넣는다)
#   뒤 창(trailing) = 날 t 에서 앞 365 칸 — 'seen' 이 그날 쓰는 값(날 366 부터)
# 쓰는 법: python3 t1437_diag.py <out.json> <run.json> …   (팔 이름 = 파일 이름 앞머리)
import json, sys, os, re, math
import gzip
def _load(f):   # 판 칸은 .json.gz 로 싣는다(레포 크기) — 날것 .json 도 읽는다
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def q(a, p):
    if not a: return None
    s = sorted(a); return s[min(len(s) - 1, int(math.floor(p * len(s))))]

def dd(xs):   # 꼭대기 → 그 뒤 바닥 의 가장 깊은 차
    pk, d = -1e300, 0.0
    for x in xs:
        if x is None: continue
        if x > pk: pk = x
        elif pk - x > d: d = pk - x
    return d

def typ(nm):
    return re.sub(r'[0-9]+$', '', nm or '')

def series(v, dfc):
    S, N, sh, pr, im = v['S'], v['N'], v['sh'], v['pr'], v['im']
    n = len(S)
    fd = [None] * n; Vx = [None] * n; r = [None] * n
    u = 0.0; R = 0.0
    for t in range(n):
        if not (N[t] and N[t] > 0):
            u = 0.0; R = 0.0; continue
        C = N[t] * dfc
        fd[t] = (S[t] or 0) / C
        Vx[t] = fd[t] - u
        u += (sh[t] or 0) / C
        eaten = C - (sh[t] or 0)
        R += (eaten - (pr[t] or 0) - (im[t] or 0)) / C
        r[t] = R
    return fd, Vx, r

def measures(v, dfc, a, b):   # 날 [a, b) 창
    fd, Vx, r = series(v, dfc)
    S, N, sh = v['S'], v['N'], v['sh']
    idx = [t for t in range(a, min(b, len(S))) if N[t] and N[t] > 0]
    if len(idx) < (b - a) * 0.9: return None   # 그 창에 거의 산 마을만
    C_end = N[idx[-1]] * dfc
    m = {}
    m['V'] = dd([Vx[t] for t in idx])
    m['A'] = dd([fd[t] for t in idx])
    m['Au'] = dd([S[t] for t in idx]) / C_end
    # B: r 의 가장 깊은 오름(먹은 것 − 든 것 누계가 가장 크게 오른 몫)
    lo, best = 1e300, 0.0
    for t in idx:
        x = r[t]
        if x < lo: lo = x
        elif x - lo > best: best = x - lo
    m['B'] = best
    m['G'] = sum(1 for t in idx if (sh[t] or 0) > 1e-6)
    m['fdMed'] = q([fd[t] for t in idx], 0.5)
    m['fdMin'] = min(fd[t] for t in idx)
    m['dead'] = sum(v['fd'][t] or 0 for t in idx)
    return m

def trailing(v, dfc, W=365, start=365):
    fd, Vx, r = series(v, dfc)
    N = v['N']; out = []
    for t in range(start, len(Vx)):
        win = [Vx[k] for k in range(t - W + 1, t + 1) if N[k] and N[k] > 0]
        if len(win) < W: continue
        out.append(dd(win))
    return out

def main():
    out = sys.argv[1]
    res = {}
    for f in sys.argv[2:]:
        d = _load(f)
        tag = os.path.basename(f).split('.')[0]
        dfc = d.get('dfc') or 1.0
        rows = []
        for v in d['vil']:
            for yi, (a, b) in enumerate([(0, 365), (365, 730)]):
                m = measures(v, dfc, a, b)
                if m: m.update(name=v['name'], type=typ(v['name']), year=yi + 1); rows.append(m)
        tr = []
        for v in d['vil']: tr += trailing(v, dfc)
        res[tag] = {'rows': rows, 'trail': {'n': len(tr), 'med': q(tr, 0.5), 'p90': q(tr, 0.9), 'max': max(tr) if tr else None}}
    json.dump(res, open(out, 'w'), ensure_ascii=False)
    # 짧은 표
    for tag, R in res.items():
        print('==', tag, '· 뒤 창(날 366~) V 가운데', R['trail']['med'], '열에 아홉', R['trail']['p90'], '최대', R['trail']['max'])
        for y in (1, 2):
            rr = [m for m in R['rows'] if m['year'] == y]
            if not rr: continue
            f = lambda k, p: q([m[k] for m in rr], p)
            print(f'  해 {y} 마을 {len(rr)} · V {f("V",.5):.1f}/{f("V",.9):.1f} · A {f("A",.5):.1f}/{f("A",.9):.1f} · Au {f("Au",.5):.1f}/{f("Au",.9):.1f} · B {f("B",.5):.1f}/{f("B",.9):.1f} · G {f("G",.5)}/{f("G",.9)} · V>30 {sum(1 for m in rr if m["V"] > 30)} · 굶어 죽음 {sum(m["dead"] for m in rr)}')
            for t in sorted(set(m['type'] for m in rr)):
                tt = [m for m in rr if m['type'] == t]
                g = lambda k, p: q([m[k] for m in tt], p)
                print(f'     {t} {len(tt)} · V {g("V",.5):.1f}/{g("V",.9):.1f} · A {g("A",.5):.1f} · B {g("B",.5):.1f}/{g("B",.9):.1f} · G {g("G",.5)}')

if __name__ == '__main__':
    main()
