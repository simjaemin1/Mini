#!/usr/bin/env python3
# T1297 관찰 표 — 계측 훅 마을-날 줄(`sbc-<시드>.json.t1297.json`)만 읽는다 · 세계 0
#   표 1 출생이 곳간 며칠치에서 일어나나(3시드 합) — 난 사람(훅 `bornE` — econ 새 주민 번호 계수기 `_nid` 의 날 차 · 그 칸이 없는 판은 새 얼굴 중 그날 늘림이 선 마을-날만)을 그날 그 마을 곳간 식량 일치(식량 환산 ÷ 사람 · 하루 소비 1)로 나눈다 ·
#        그날 인구 ÷ K 로도 나눈다(K = econ 인구 식의 K — 땅 · 일자리 만충 부양력)
#   표 2 꼭대기 앞뒤(시드마다 그 판의 꼭대기 날 P · 50날 창 넷) — 난 · 굶어 죽음(`fdDead`) · 굶는 사람(하루 평균) · 곳간 일치(사람 가중 평균) · 인구 ÷ K(사람 가중 평균) ·
#        ⚠훅의 `died` 칸(어제 있던 id 가 오늘 어느 마을에도 없다)은 걸어 나간 사람(이주 — 걷는 동안 어느 마을 명부에도 없다)을 함께 세어 안 쓴다 — 죽음 전부는 판 JSON `deadTot`
#        곳간 10일치 밑 날에 난 몫
# 실행: python3 t1297_obs.py 팔=폴더1,폴더2,폴더3 [팔=…]   (폴더 안 sbc-<시드>.json.t1297.json 을 모두 읽는다)
import json, sys, os, glob, collections
B = [(0, 3), (3, 10), (10, 20), (20, 28), (28, 30), (30, 60), (60, 90), (90, None)]   # 28 ~ 30 = 문 줄(30일치)에서 그날 먹은 몫(하루치) · 상한 몫을 뺀 자리 — 훅은 날 끝에 잰다
lab = lambda lo, hi: f'{lo} ~ {hi}' if hi is not None else f'{lo} ~'
NK = [(0, 0.5), (0.5, 0.8), (0.8, 1.0), (1.0, None)]
def files(dirs):
    out = []
    for d in dirs: out += sorted(glob.glob(os.path.join(d, 'sbc-*.json.t1297.json')))
    return out
def arm(name, dirs):
    born = collections.Counter(); bornNK = collections.Counter(); tot = 0; fdays = []
    W = collections.OrderedDict((w, collections.Counter()) for w in ['P − 100 ~ P − 50', 'P − 50 ~ P', 'P ~ P + 50', 'P + 50 ~ P + 100'])
    seeds = []; modes = set()
    for p in files(dirs):
        h = json.load(open(p)); c = {k: i for i, k in enumerate(h['cols'])}; seeds.append(os.path.basename(p).split('.')[0][4:])
        exact = 'bornE' in c; modes.add('bornE' if exact else 'born · dP>0')
        # 난 사람: bornE(econ 새 주민 번호 날 차 — 이 마을에서 오늘 난 사람) · 그 칸이 없는 판은 새 얼굴(born) 중 그날 늘림이 선(dP > 0) 마을-날만 —
        #   늘림이 0 인 날의 새 얼굴은 다른 마을에서 나 그날 걸어 나와 닿은 사람이다(그 마을 출생 줄은 그날 못 낳는다)
        bornOf = (lambda q: q[c['bornE']] or 0) if exact else (lambda q: (q[c['born']] or 0) if (q[c['dP']] or 0) > 0 else 0)
        pop = collections.Counter()
        for q in h['rows']: pop[q[c['day']]] += q[c['N']]
        P = max(pop, key=lambda d: (pop[d], -d))
        for q in h['rows']:
            b = bornOf(q); fd = q[c['foodDays']]; N = q[c['N']]; K = q[c['K']]
            if b:
                tot += b
                if fd is not None:
                    for lo, hi in B:
                        if fd >= lo and (hi is None or fd < hi): born[lab(lo, hi)] += b; break
                    fdays += [fd] * b
                if K:
                    r = N / K
                    for lo, hi in NK:
                        if r >= lo and (hi is None or r < hi): bornNK[lab(lo, hi)] += b; break
            d = q[c['day']] - P
            w = 'P − 100 ~ P − 50' if -100 <= d < -50 else 'P − 50 ~ P' if -50 <= d < 0 else 'P ~ P + 50' if 0 <= d < 50 else 'P + 50 ~ P + 100' if 50 <= d <= 100 else None
            if w is None or not N: continue
            a = W[w]; a['born'] += b; a['fd'] += q[c['fdDead']] or 0; a['st'] += q[c['starving']] or 0
            a['n'] += N; a['days'] += 1
            if fd is not None: a['fdN'] += fd * N; a['fdW'] += N
            if K: a['nk'] += (N / K) * N; a['nkW'] += N
            if b and fd is not None and fd < 10: a['bornLow'] += b
        W.setdefault('_P', collections.Counter())[p] = P
    fdays.sort()
    med = fdays[len(fdays) // 2] if fdays else None
    md = ' · '.join(sorted(modes))
    print(f"\n**{name} — 시드 {' · '.join(seeds)} 합 · 난 사람 {tot:,}({md}) · 곳간 일치 가운데 {med if med is None else round(med, 1)}일**\n")
    print('| 곳간 식량 일치(그날 · 일) | ' + ' | '.join(lab(lo, hi) for lo, hi in B) + ' |')
    print('|---|' + '---:|' * len(B))
    print('| 난 사람 몫(%) | ' + ' | '.join(f"{100 * born[lab(lo, hi)] / tot:.0f}" if tot else '—' for lo, hi in B) + ' |')
    print('\n| 인구 ÷ K(그날) | ' + ' | '.join(lab(lo, hi) for lo, hi in NK) + ' |')
    print('|---|' + '---:|' * len(NK))
    print('| 난 사람 몫(%) | ' + ' | '.join(f"{100 * bornNK[lab(lo, hi)] / tot:.0f}" if tot else '—' for lo, hi in NK) + ' |')
    Ps = ' · '.join(str(v) for v in W.pop('_P').values())
    print(f"\n| 꼭대기 앞뒤(P = 꼭대기 날 {Ps}) | 난(명) | ㄴ 곳간 10일치 밑(%) | 굶어 죽음(명) | 굶는 사람(하루 평균 · 명) | 곳간 일치(사람 가중 · 일) | 인구 ÷ K(사람 가중) |")
    print('|---|---:|---:|---:|---:|---:|---:|')
    for w, a in W.items():
        days = a['days'] / 51 if a['days'] else 0
        print(f"| {w} | {a['born']:,} | {(100 * a['bornLow'] / a['born']) if a['born'] else 0:.0f} | {a['fd']:,} | {a['st'] / max(1, days):,.0f} | {a['fdN'] / a['fdW'] if a['fdW'] else 0:.1f} | {a['nk'] / a['nkW'] if a['nkW'] else 0:.2f} |")
if __name__ == '__main__':
    for a in sys.argv[1:]:
        nm, ds = a.split('=', 1); arm(nm, ds.split(','))
