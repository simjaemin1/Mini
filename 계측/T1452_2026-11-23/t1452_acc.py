#!/usr/bin/env python3
# T1452 할 일 3 — 앞날 장부가 맞는지: 30 · 90 · 180날 앞 예상 곳간 ↔ 실제 곳간(날치) · 크게 틀린 날의 까닭 표 · 비상 마을-날(철마다)
#   훅 칸(t1452hook.js) — 장부 판(켬 `ahead` · 재는 판 `T1452_SHADOW=1`)만: ah = [골 날치, 골까지 날, 여유분, 비상, 버틸 날, p30, p90, p180, 창 안 골, 0 밑 첫날, 창 끝]
#   차(날치) = (예상 곳간 − 실제 곳간) ÷ (그날 사람 × 하루치) — + = 예상이 좋았다(실제가 더 모자랐다)
#   실제 곳간은 0 에서 멈춘다 — 예상이 0 밑이면 실제 0 과 견준다(빚 = 못 먹은 몫을 뺀 곳간과 견주는 줄도 같이)
#   크게 틀린 날(차 절댓값 열에 아홉 위)의 까닭(먼저 걸린 하나): 사람이 늘거나 줆(창 안 10 % 넘게) · 날씨(창 안 가뭄 · 폭풍 날) · 교역(창 안 들여온 식량 > 그날 곳간의 반) ·
#     거둠(밭 세계 — 창 안 거둔 식량이 예상과 다름) · 그 밖(썩음 · 첫 해 흐름 어림)
# 쓰는 법: python3 t1452_acc.py <out.json> <run.t1452.json[.gz]> …
import json, sys, gzip, os, math

def _load(f):
    return json.load(gzip.open(f, 'rt', encoding='utf-8') if str(f).endswith('.gz') else open(f, encoding='utf-8'))

def q(a, p):
    a = sorted(x for x in a if x is not None)
    return a[min(len(a) - 1, int(math.floor(p * len(a))))] if a else None

def one(f):
    d = _load(f); dfc = d.get('dfc') or 1.0; tag = os.path.basename(f).split('.')[0]; se = d.get('se', '')
    H = (30, 90, 180); err = {h: [] for h in H}; errd = {h: [] for h in H}; big = {h: {} for h in H}; rows = []
    em = {'s': [0, 0], 'u': [0, 0], 'a': [0, 0], 'w': [0, 0]}; short = {'s': [0, 0], 'u': [0, 0], 'a': [0, 0], 'w': [0, 0]}
    for v in d['vil']:
        S, N, ah = v['S'], v['N'], v.get('ah') or []
        sh = v.get('sh') or [0] * len(S); hv = v.get('hv') or [0] * len(S); im = v.get('im') or [0] * len(S); wx = v.get('wx') or ''
        L = len(S); d0 = v.get('d0', 0)
        for i in range(L):
            a = ah[i] if i < len(ah) else None
            if not a or not N[i]: continue
            sday = se[d0 + i] if d0 + i < len(se) else '.'
            if sday in em:
                em[sday][1] += 1; short[sday][1] += 1
                if a[3]: em[sday][0] += 1
                if a[0] is not None and a[0] < 0: short[sday][0] += 1
            C = N[i] * dfc
            for h, j in zip(H, (5, 6, 7)):
                if i + h >= L or a[j] is None or N[i + h] is None: continue
                act = S[i + h]
                debt = (sh[i + h] or 0) * dfc   # 빚 — 못 먹은 몫(하루치 단위 × 하루치)
                e = (a[j] - act) / C if a[j] >= 0 else (a[j] - (act - debt)) / C
                err[h].append(e)
                if abs(e) > 0: errd[h].append(abs(e))
                rows.append((h, abs(e), v['name'], d0 + i))
                # 까닭(창 안)
                n0, n1 = N[i], max(N[i:i + h + 1]); n2 = min(N[i:i + h + 1])
                why = None
                if n0 and (n1 > n0 * 1.1 or n2 < n0 * 0.9): why = '사람'
                elif any(c in 'DS' for c in wx[i:i + h]): why = '날씨'
                elif sum(x or 0 for x in im[i:i + h]) > 0.5 * max(1.0, S[i]): why = '교역'
                elif sum(x or 0 for x in hv[i:i + h]) > 0: why = '거둠'
                else: why = '그 밖'
                big[h].setdefault(why, []).append(abs(e))
    out = {'tag': tag, 'arm': d.get('arm')}
    for h in H:
        a = err[h]; ab = [abs(x) for x in a]
        cut = q(ab, 0.9)
        reasons = {}
        for why, xs in big[h].items():
            n_big = sum(1 for x in xs if cut is not None and x >= cut)
            reasons[why] = {'날': len(xs), '크게 틀림': n_big}
        out[f'h{h}'] = {'n': len(a), '가운데|차|': None if not ab else round(q(ab, 0.5), 2), '열에아홉|차|': None if not ab else round(q(ab, 0.9), 2),
                        '치우침(가운데 차)': None if not a else round(q(a, 0.5), 2), '까닭': reasons}
    out['비상%'] = {k: round(100 * x[0] / max(1, x[1]), 1) for k, x in em.items()}
    out['모자람%'] = {k: round(100 * x[0] / max(1, x[1]), 1) for k, x in short.items()}
    return out

def main():
    out = sys.argv[1]; R = [one(f) for f in sys.argv[2:]]
    json.dump(R, open(out, 'w'), ensure_ascii=False, indent=1)
    for r in R:
        print('==', r['tag'], r['arm'], '| 30', r['h30']['가운데|차|'], r['h30']['열에아홉|차|'], '| 90', r['h90']['가운데|차|'], r['h90']['열에아홉|차|'], '| 180', r['h180']['가운데|차|'], r['h180']['열에아홉|차|'],
              '| 비상%', r['비상%'], '| 모자람%', r['모자람%'])

if __name__ == '__main__':
    main()
