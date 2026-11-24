# T1467 몸 수 기울기 — 낮 창 덩이 µs/사람 · ms/틱 = a + b·몸 (최소제곱) · 고정 몫 a · 몸 몫 b
import json
R = '/tmp/t1467/r'
def first(d, arm):
    for o in json.load(open(f'{R}/{d}/us-line.json')):
        if o['arm'] == arm: return o['first']
P = [('c16', 'c16x'), ('pil2', 'base'), ('x4k', 'x4k'), ('x10k', 'x10k')]
F = [(first(d, a), d) for d, a in P]
segs = list(F[1][0]['segDayUs'].keys())
print('| 덩이(낮 · µs/사람) | ' + ' | '.join(f"몸 {f['pop']:,}" for f, _ in F) + ' | 고정 a ms/틱 | 몸 몫 b µs/몸 |')
print('|---|' + '---|' * (len(F) + 2))
out = {}
for k in segs + ['합']:
    ys = [(f['pop'], (sum(f['segDayUs'].values()) if k == '합' else f['segDayUs'].get(k, 0)) * f['pop'] / 1000) for f, _ in F]
    n = len(ys); mx = sum(x for x, _ in ys) / n; my = sum(y for _, y in ys) / n
    b = sum((x - mx) * (y - my) for x, y in ys) / sum((x - mx) ** 2 for x, _ in ys); a = my - b * mx
    us = [y * 1000 / x for x, y in ys]
    out[k] = dict(us=us, a=a, b=b * 1000)
    print(f'| {k} | ' + ' | '.join(f'{u:.3f}' for u in us) + f' | {a:.3f} | {b*1000:.3f} |')
json.dump(dict(pops=[f['pop'] for f, _ in F], seg=out), open('/tmp/t1467/slope.json', 'w'), ensure_ascii=False, indent=1)
