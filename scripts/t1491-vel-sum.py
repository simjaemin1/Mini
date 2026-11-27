# (@regress 없음 — 계측기 · 러너 밖 · T1491 · 판정 0)
# === scripts/t1491-vel-sum.py — t1491-vel-hook 셈(json)을 표로: 진단 ① 까닭 · 몸 꼴 · 진단 ② 알아챔 틱 · 겹친 몸 ===
#   쓰는 법: python3 scripts/t1491-vel-sum.py <vel.json> [창 day,night]
import sys, json
d = json.load(open(sys.argv[1])); WS = (sys.argv[2] if len(sys.argv) > 2 else 'day,night').split(',')
def q(h, f):
    xs = sorted((int(k), v) for k, v in h.items()); n = sum(v for _, v in xs); c = 0
    for k, v in xs:
        c += v
        if c >= f * n: return k
    return None
for w in WS:
    B = d['win'].get(w)
    if not B: continue
    print(f'\n## 창 {w} · 틱 {B["ticks"]:,}')
    print('| 몸 꼴 | 걷는 틱 | 바뀐 몫 | 뜻 있게 바뀐 몫(걷는 틱) | 바뀐 틱 가운데 뜻 있게 | 칸 넘는 틱 몫 | 까닭(바뀐 틱 · 뜻 있게) |')
    print('|---|---|---|---|---|---|---|')
    T = {'walk': 0, 'chg': 0, 'mean': 0, 'cellX': 0, 'cause': {}}
    for k, K in sorted(B['kinds'].items(), key=lambda kv: -kv[1]['walk']):
        for a in ('walk', 'chg', 'mean', 'cellX'): T[a] += K[a]
        for c, C in K['cause'].items(): t = T['cause'].setdefault(c, {'n': 0, 'mean': 0}); t['n'] += C['n']; t['mean'] += C['mean']
        cs = ' · '.join(f'{c} {C["n"]:,}/{C["mean"]:,}' for c, C in sorted(K['cause'].items(), key=lambda kv: -kv[1]['n']))
        w_ = max(K['walk'], 1)
        print(f'| {k} | {K["walk"]:,} | {100*K["chg"]/w_:.1f} % | {100*K["mean"]/w_:.2f} % | {100*K["mean"]/max(K["chg"],1):.2f} % | {100*K["cellX"]/w_:.1f} % | {cs} |')
    w_ = max(T['walk'], 1)
    cs = ' · '.join(f'{c} {C["n"]:,}/{C["mean"]:,}' for c, C in sorted(T['cause'].items(), key=lambda kv: -kv[1]['n']))
    print(f'| **합** | {T["walk"]:,} | {100*T["chg"]/w_:.1f} % | {100*T["mean"]/w_:.2f} % | {100*T["mean"]/max(T["chg"],1):.2f} % | {100*T["cellX"]/w_:.1f} % | {cs} |')
    top = sorted(T['cause'].items(), key=lambda kv: -kv[1]['mean'])
    print('  뜻 있게 바뀐 까닭 차례: ' + ' · '.join(f'{c} {100*C["mean"]/max(T["mean"],1):.1f} %' for c, C in top if C['mean']))
    print('\n| 막힘 사건(몸 꼴) | 사건 | 벽·문·물 | 다른 몸 | 알아챔(멈춤·비킴) 수 · 가운데 · p90 틱 | 저절로 풀림 수 · 가운데 틱 | 못 알아챔(450 틱) |')
    print('|---|---|---|---|---|---|---|')
    for k, E in B['ep'].items():
        nn, nf = sum(E['notice'].values()), sum(E['free'].values())
        print(f'| {k} | {E["n"]:,} | {E["wall"]:,} | {E["body"]:,} | {nn:,} · {q(E["notice"], .5)} · {q(E["notice"], .9)} | {nf:,} · {q(E["free"], .5)} | {E["never"]:,} |')
    O = B['ov']; s = max(O['samples'], 1)
    print(f'\n겹친 몸(< 16px 쌍 · 표본 틱 {O["samples"]:,} · 몸 평균 {O["bodies"]/s:.0f}) — 틱마다 평균 쌍: ' + ' · '.join(f'{k} {v/s:.2f}' for k, v in sorted(O['pairs'].items(), key=lambda kv: -kv[1])))
