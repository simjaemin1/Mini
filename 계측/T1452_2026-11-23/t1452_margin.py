#!/usr/bin/env python3
# T1452 여유분 자 가르기 — 장부 셈 자(t1452-us-bench.js · T1452_BENCH_TRACE=1)의 `tr` 칸에서 여유분(뜻밖의 누적 x 의 낙폭)이 무엇으로 크는지
#   칸 = [날 차례, 날, x, pN(그날 하루 차 예상), pC(하루치), fm[날], fm[날+1], 곳간, 밭 거둠 누계, 사람]
#   이웃한 두 줄 사이 x 의 차 = 하루 뜻밖의 차(날치). 그 날을 둘로 나눈다:
#     밭 몫이 안 든 날 — 앞 줄의 밭 칸(fm[날] + fm[날+1] — 오늘 · 내일 든다고 본 익은 밭)이 있는데 그 사이 거둔 것이 그 반에 못 미침
#     그 밖 — 지난 해 같은 날 흐름(ⓑ) · 썩음 · 짐 · 먹음
#   ① 하루 차의 흔들림(그 밖 날 · 표준 편차 σ) · 마구 걷기라면 한 해 낙폭 ≈ σ × √(π × 365 ÷ 2)(치우침 0 · 브라운 운동의 가장 깊은 낙폭 기댓값)
#   ② 마을마다 x 의 낙폭(잰 창 전체) · 밭 몫이 안 든 날의 차를 0 으로 둔 x 의 낙폭(그 몫이 없으면) — 가운데 · 열에 아홉
#   ③ 밭 몫이 안 든 날 수 · 그날들 차의 합(날치) — 같은 밭을 며칠 거듭 '오늘 든다'로 본 몫
#   ④ 해마다 하루 치우침(x 의 하루 평균 변화 · 첫 해 = 날 ≤ 365(이력 없는 날 — (가) 흐름) · 둘째 해 = 날 ≥ 366(지난 해 같은 날)) · 둘째 해 안에서만 잰 낙폭
# 쓰는 법: python3 t1452_margin.py <out.json> <bench.json> …
import json, sys, math, statistics as st

def mdd(xs):
    pk, dd = -1e18, 0.0
    for v in xs:
        if v > pk: pk = v
        elif pk - v > dd: dd = pk - v
    return dd
def q(a, p):
    a = sorted(a); return a[min(len(a) - 1, int(p * len(a)))] if a else None

out = {}
for f in sys.argv[2:]:
    d = json.load(open(f)); tr = d.get('tr') or {}
    sig, dd0, dd1, nMiss, sMiss, nDays, villages = [], [], [], 0, 0.0, 0, 0
    dr1, dr2, dd2 = [], [], []
    for name, rows in tr.items():
        if len(rows) < 30: continue
        villages += 1
        x0 = [r[2] for r in rows]; x1 = [x0[0]]; oth = []
        for k in range(1, len(rows)):
            a, b = rows[k - 1], rows[k]
            dx = b[2] - a[2]
            fmA = (a[5] or 0) + (a[6] or 0); hv = (b[8] or 0) - (a[8] or 0)
            miss = fmA > 0 and hv < 0.5 * fmA and dx < 0
            if miss: nMiss += 1; sMiss += dx
            else: oth.append(dx)
            x1.append(x1[-1] + (0 if miss else dx)); nDays += 1
        if len(oth) > 2: sig.append(st.pstdev(oth))
        dd0.append(mdd(x0)); dd1.append(mdd(x1))
        y1 = [r for r in rows if r[1] <= 365]; y2 = [r for r in rows if r[1] >= 366]
        if len(y1) > 60: dr1.append((y1[-1][2] - y1[0][2]) / len(y1))
        if len(y2) > 30: dr2.append((y2[-1][2] - y2[0][2]) / len(y2)); dd2.append(mdd([r[2] for r in y2]))
    s = q(sig, 0.5)
    T = max((len(r) for r in tr.values()), default=0)
    out[f] = {'villages': villages, 'days': T, 'sigmaMed': None if s is None else round(s, 2),
              'rwDrawdown365': None if s is None else round(s * math.sqrt(math.pi * 365 / 2), 1), 'rwDrawdownT': None if s is None else round(s * math.sqrt(math.pi * T / 2), 1),
              'mdd': {'med': q(dd0, 0.5), 'p90': q(dd0, 0.9)}, 'mddNoFieldMiss': {'med': q(dd1, 0.5), 'p90': q(dd1, 0.9)},
              'fieldMissDays': nMiss, 'fieldMissSum': round(sMiss, 1), 'villageDays': nDays,
              'driftY1': None if not dr1 else round(q(dr1, 0.5), 3), 'driftY2': None if not dr2 else round(q(dr2, 0.5), 3), 'mddY2': None if not dd2 else {'med': round(q(dd2, 0.5), 1), 'p90': round(q(dd2, 0.9), 1), 'days': max(len([r for r in rw if r[1] >= 366]) for rw in tr.values())}}
    print(f, json.dumps(out[f], ensure_ascii=False))
json.dump(out, open(sys.argv[1], 'w'), ensure_ascii=False, indent=1)
