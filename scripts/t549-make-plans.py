#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 ③ 안 짜는 기계 · 정본 무접촉)
# =============================================================================
# 정본 `server/hanbando-terrain.json` 의 `nippon` 칸을 **읽기만** 하고, 가로막는 지형(강 · 호수 · 산맥 · 고개 · 계곡)만 바꾼
# 안 둘을 레포 밖 json 으로 쓴다. 숲 · 광맥 · 후보 자리는 한 글자도 안 바꾼다(다음 카드).
#   ⓐ 최소 손질 — 지금 선을 두고: A·B 를 가른 강에 여울(건널 목 — 그 몇 꼭짓점 폭 0 · `_ford`) · C·D 골에 고개 ·
#                  물 없는 큰 평원 둘에 강 한 줄씩(서: 니시가와 → 아카호 → 토오가와 · 남동: 미나미가와 → 동해안).
#   ⓑ 재설계 — 규칙으로 긋는다(카드 §③ⓑ · 재민 의도 한 줄이 오면 그게 앞선다):
#        등뼈 하나(북 아라야마 밑 → 남 토오호 위 · 열도 긴 축) + 지맥(닛폰북령 — 서쪽 경계 접합 그대로) ·
#        큰 강: 서 평원 세로 큰 강 하나(북서 경계로 들어오는 한반도 물을 받아 남해로) + 동쪽 셋(등뼈 → 가장 가까운 동해) + 남쪽 하나(토오호 → 남해) ·
#        하류로 넓게 · 해안 따라 나란히 흐르지 않게 · 호수 셋(분지: 아카호 · 스미호는 큰 강 위 · 토오호는 등뼈 남쪽 발치) ·
#        고개 다섯(등뼈) · 계곡 셋(닛폰북령을 건너는 골) · 강마다 여울(중·상류 건널 목) ·
#        경계 접합(T408)은 그대로 — 서쪽 경계 거울 띠 산맥 다섯 · 고개 쇠재·한재 · 경계를 넘는 강의 경계 끝(자리·폭) · 모서리 호수 닭밭호.
# 쓰는 법: python3 scripts/t549-make-plans.py <출력 디렉터리>   → nippon_A.json · nippon_B.json
# =============================================================================
import copy, json, math, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Mini/_terrain')
os.makedirs(OUT, exist_ok=True)
HC = json.load(open(os.path.join(ROOT, 'server', 'hanbando-terrain.json'), encoding='utf-8'))
NOW = HC['nippon']

def strip(f):   # 캐시 칸(_bbox · _segIdx)은 지운다 — 모양이 바뀌면 틀린 상자가 된다
    return {k: v for k, v in f.items() if k not in ('_bbox', '_segIdx')}

def catmull(ctrl, step=320):
    """조절점 → 부드러운 곡선 점들(Catmull-Rom · 끝점 지남)."""
    P = [ctrl[0]] + ctrl + [ctrl[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        L = math.hypot(p2[0] - p1[0], p2[1] - p1[1]); n = max(1, int(L // step))
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3)
            y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
            out.append([round(x), round(y)])
    out.append([round(ctrl[-1][0]), round(ctrl[-1][1])])
    return out

def path_w(pts, w0, w1):
    """발원 w0 → 하구 w1 을 길이 비례로(하류로 넓게)."""
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    T = L[-1] or 1
    return [{'pos': p, 'width': round(w0 + (w1 - w0) * (l / T))} for p, l in zip(pts, L)]

def river(name, ctrl, w0, w1, **kw):
    f = {'name': name, 'path': path_w(catmull(ctrl), w0, w1)}; f.update(kw); return f

def ridge(name, ctrl, widths, **kw):
    """widths: 조절점마다 폭(곡선 위로 보간)."""
    pts = catmull(ctrl)
    # 조절점 사이 폭 보간 — 곡선 점을 가장 가까운 조절 구간 비율로
    cum = [0.0]
    for i in range(1, len(ctrl)): cum.append(cum[-1] + math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1]))
    L = [0.0]
    for i in range(1, len(pts)): L.append(L[-1] + math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    s = cum[-1] / (L[-1] or 1)
    out = []
    for p, l in zip(pts, L):
        u = l * s; j = max(0, min(len(cum) - 2, next((k for k in range(len(cum) - 1) if cum[k + 1] >= u), len(cum) - 2)))
        t = (u - cum[j]) / ((cum[j + 1] - cum[j]) or 1)
        out.append({'pos': p, 'width': round(widths[j] + (widths[j + 1] - widths[j]) * t)})
    f = {'name': name, 'path': out, 'noValley': True}; f.update(kw); return f

def ford(f, near, span=1):
    """그 강에서 `near` 에 가장 가까운 꼭짓점 ± span 의 폭을 0 으로 — 건널 목(여울). 물은 이어져 흐른다고 보되 걸어서 건넌다."""
    i = min(range(len(f['path'])), key=lambda k: math.hypot(f['path'][k]['pos'][0] - near[0], f['path'][k]['pos'][1] - near[1]))
    for k in range(max(0, i - span), min(len(f['path']), i + span + 1)):
        f['path'][k]['width'] = 0; f['path'][k]['_ford'] = True
    return i


def ridge_edge(ridges, y, side, margin=30):
    """그 y 줄에서 산맥 몸의 서(-1)/동(+1) 끝 — 거기서 강이 나면 "산에서 난다"(몸에 닿는다 · 몸 안으로는 안 든다)."""
    best = None
    for g in ridges:
        P = g['path']
        for i in range(len(P) - 1):
            (x0, y0), (x1, y1) = P[i]['pos'], P[i + 1]['pos']
            if (y0 - y) * (y1 - y) > 0 or y0 == y1: continue
            t = (y - y0) / (y1 - y0); x = x0 + (x1 - x0) * t; w = P[i]['width'] + (P[i + 1]['width'] - P[i]['width']) * t
            e = x + side * (w / 2 + margin)
            if best is None or (side < 0 and e < best) or (side > 0 and e > best): best = e
    return round(best) if best is not None else None

def x_on(f, y):
    P = f['path']
    for i in range(len(P) - 1):
        (x0, y0), (x1, y1) = P[i]['pos'], P[i + 1]['pos']
        if (y0 - y) * (y1 - y) <= 0 and y0 != y1: return round(x0 + (x1 - x0) * (y - y0) / (y1 - y0))
    return None

def base():
    T = copy.deepcopy(NOW)
    for k in ('rivers', 'lakes', 'ridges', 'passes', 'valleys'):
        T[k] = [strip(f) for f in T.get(k, [])]
    return T

def byname(L, name, nth=0):
    hits = [f for f in L if f['name'] == name]; return hits[nth]

# ── ⓐ 최소 손질 ─────────────────────────────────────────────────────────────────
def plan_A():
    T = base(); notes = []
    i = ford(byname(T['rivers'], '후카가와'), (40736, 41984), span=1); notes.append(f'후카가와 여울 꼭짓점 {i}±1 (A 북쪽 끝 · T524 다리 자리)')
    i = ford(byname(T['rivers'], '하야가와'), (24640, 122720), span=1); notes.append(f'하야가와 여울 꼭짓점 {i}±1 (B 서쪽 끝 · T524 다리 자리)')
    T['passes'].append({'name': '척량재', 'pos': [24048, 101744], 'radius': 1900}); notes.append('고개 척량재 (24048,101744) r1900 — C 동쪽 산맥 115셀')
    T['passes'].append({'name': '츠키재', 'pos': [22896, 115728], 'radius': 520}); notes.append('고개 츠키재 (22896,115728) r520 — D 동쪽 산맥 25셀')
    sw = ridge_edge([g for g in T['ridges'] if g['name'] in ('닛폰척량', '유키야마')], 48500, -1)
    T['rivers'].append(river('니시가와', [[sw, 48500], [16300, 56000], [13600, 64000], [11000, 71800], [9300, 77600], [8750, 79300], [8650, 81500], [8450, 85000], [8378, 87700]], 120, 560))
    notes.append(f'강 니시가와: 등뼈 서쪽 몸 끝({sw},48500) → 아카호 → 토오가와 합류(8378,87700) — 물 없는 덩이 1')
    se = ridge_edge([g for g in T['ridges'] if g['name'] in ('닛폰척량', '츠키야마')], 96800, +1)
    T['rivers'].append(river('미나미가와', [[se, 96800], [31500, 98300], [36500, 99000], [42000, 100300], [46500, 101200], [49950, 101800]], 120, 480))
    notes.append(f'강 미나미가와: 츠키야마 동쪽 몸 끝({se},96800) → 동해안(49950,101800) — 물 없는 덩이 2')
    for nm in ('니시가와', '미나미가와'):   # 새 강마다 가운데 한 목 — 산에 닿는 강은 뭍을 가른다(없으면 강 한 줄이 평원을 둘로 나눈다)
        f = byname(T['rivers'], nm); P = f['path']; m = P[len(P) // 2]['pos']
        notes.append(f'{nm} 여울 꼭짓점 {ford(f, m, span=1)}')
    T['_t549'] = {'plan': 'A', 'notes': notes}
    return T

# ── ⓑ 재설계 ─────────────────────────────────────────────────────────────────────
def plan_B():
    T = base(); notes = []
    keepR = []   # 살리는 강(경계 접합 · 바다로 가는 짧은 것) — 이름으로
    seam = ('시로가와', '달재천', '솔여울', '미르내', '쿠로가와', '키요가와')
    for f in T['rivers']:
        if f['name'] in seam: keepR.append(f)
    # 경계를 넘어 들어오는 한반도 강 셋(토오가와 · 사키가와 · 미도리가와)은 **경계 끝(자리 · 폭)을 그대로** 두고 안쪽만 새로 긋는다.
    #   토오가와: 경계 (-459,87004) 폭 519 → 서 평원 큰 강에 합류(동쪽으로 등뼈를 안 넘는다)
    #   사키가와: 경계 (-354,90480) 폭 339 → 큰 강 합류
    #   미도리가와: 경계 (-210,10055) 폭 238 → 이 강이 큰 강의 머리(북서로 들어온 한반도 물 · 시로가와 옆)
    # 서 평원 큰 강 "오오카와" — 미도리가와 경계에서 시작해 남쪽으로 · 유키호(새 자리 · 북서 분지) · 아카호 · 스미호를 지나 남해로
    big = river('오오카와', [[-210, 10055], [300, 12400], [700, 14100], [3600, 16800], [7000, 21000], [9800, 27000], [10400, 34000], [9800, 42000],
                              [9300, 52000], [9000, 62000], [8900, 71000], [8750, 79300], [8900, 87500], [9400, 96000],
                              [9300, 105000], [8747, 114513], [9200, 121000], [10200, 127800], [10600, 130400]], 240, 1250)
    keepR.append(big); notes.append('큰 강 오오카와: 북서 경계(미도리가와 자리 · 폭 240) → 서 평원 세로 → 아카호 · 스미호 → 남해 (폭 → 1250)')
    keepR.append(river('토오가와', [[-459, 87004], [2500, 87300], [5500, 87500], [8400, 87600]], 519, 640)); notes.append('토오가와: 경계 끝 그대로 → 오오카와 합류(등뼈를 안 넘는다)')
    keepR.append(river('사키가와', [[-354, 90480], [300, 91800], [3200, 92500], [6000, 93000], [9000, 93800]], 339, 460)); notes.append('사키가와: 경계 끝 그대로 → 오오카와 합류')
    # 등뼈 — 먼저 그어 두고(강 발원이 그 몸 끝에 닿게) 아래 산맥 절에서 쓴다
    spine = ridge('닛폰척량', [[27500, 2500], [27000, 12000], [25600, 24000], [24200, 36000], [23600, 50000], [23800, 64000],
                              [23200, 78000], [23400, 92000], [22800, 106000], [22300, 117000]],
                  [900, 1300, 1700, 2000, 2200, 2200, 2000, 1800, 1500, 1100])
    # 서쪽 지류 — 등뼈 서쪽 몸 끝에서 나서 오오카와로(서 평원 동쪽 절반 · 한반도 p95 297셀 안으로 드는 간격)
    WN = [('유키가와', 34000), ('니시가와', 46500), ('시라카와', 58000), ('아오가와', 70500), ('나카가와', 81000), ('쿠라가와', 99000), ('스미가와', 109500)]
    for nm, y0 in WN:
        sx = ridge_edge([spine], y0, -1); ex = x_on(big, y0 + 5200)
        keepR.append(river(nm, [[sx, y0], [round(sx - (sx - ex) * 0.35), y0 + 1800], [round(sx - (sx - ex) * 0.7), y0 + 3800], [ex, y0 + 5200]], 120, 400))
    notes.append('서쪽 지류 ' + str(len(WN)) + ': ' + ' · '.join(n for n, _ in WN) + ' — 등뼈 서쪽 몸 끝 → 오오카와')
    # 동쪽 — 등뼈 동쪽 몸 끝에서 가장 가까운 동해로(곧장 · 약간 굽이)
    EN = [('츠키가와', 13500), ('모리가와', 27000), ('후카가와', 40000), ('카제가와', 52500), ('하나가와', 66500), ('호시가와', 76000), ('타키가와', 87500), ('미나미가와', 97500), ('사쿠라가와', 108000)]
    def jit(nm, k, a):   # 이름에서 뽑은 결정론 흔들림(같은 안 = 같은 선) — 빗살처럼 똑같은 강을 피한다
        h = 0
        for ch in nm + str(k): h = (h * 131 + ord(ch)) % 1000003
        return round(((h % 2001) / 1000 - 1) * a)
    for nm, y0 in EN:
        sx = ridge_edge([spine], y0, +1); span = 49950 - sx
        keepR.append(river(nm, [[sx, y0], [sx + round(span * 0.2), y0 + 700 + jit(nm, 1, 900)], [sx + round(span * 0.45), y0 + jit(nm, 2, 1400)],
                                [sx + round(span * 0.7), y0 + 900 + jit(nm, 3, 1600)], [49950, y0 + 1400 + jit(nm, 4, 1800)]], 130, 500 + jit(nm, 5, 120)))
    notes.append('동쪽 강 ' + str(len(EN)) + ': ' + ' · '.join(n for n, _ in EN) + ' — 등뼈 동쪽 몸 끝 → 동해 곧장(해안 따라 흐르던 후카가와 3,112셀 · 하야가와 1,189셀 대신)')
    # 북 — 닛폰북령 북쪽 골(서 평원 밖)을 북 경계(베링)로 · 남동 — 등뼈 남쪽 끝 동쪽을 남해로
    sx = ridge_edge([spine], 9000, -1)
    keepR.append(river('키타가와', [[sx, 9000], [sx - 4000, 7600], [sx - 8000, 5200], [sx - 11000, 2600], [sx - 12500, -200]], 120, 420)); notes.append('북 키타가와: 등뼈 서쪽 몸 끝(y 9,000) → 북 경계(베링) — 닛폰북령 북쪽 골')
    sx = ridge_edge([spine], 115500, +1)
    keepR.append(river('우미가와', [[sx, 115500], [29000, 118500], [35500, 121200], [41000, 124800], [44500, 130400]], 130, 520)); notes.append('남동 우미가와: 등뼈 남쪽 끝 동쪽 → 남해')
    # 남쪽 — 등뼈 남쪽 발치 토오호에서 남해로
    keepR.append(river('하야가와', [[21410, 121995], [22600, 125000], [23600, 128000], [24200, 130400]], 380, 620)); notes.append('남 하야가와: 토오호 → 남해(동쪽 해안 따라 돌던 1,189셀 대신 · B 를 안 가른다)')
    T['rivers'] = keepR
    # 여울 — 큰 강 · 지류마다 중·상류 건널 목
    fl = []
    for nm, pts in (('오오카와', [(9800, 42000), (8900, 71000), (9400, 100000), (9200, 121000)]), ('하야가와', [(22600, 125000)]), ('토오가와', [(5500, 87500)]), ('사키가와', [(6000, 93000)])):
        f = byname(T['rivers'], nm)
        for p in pts: fl.append(f"{nm} 꼭짓점 {ford(f, p, span=1)}")
    for nm, _ in WN + EN + [('키타가와', 0), ('우미가와', 0)]:   # 지류 · 동쪽 강마다 가운데 한 목
        f = byname(T['rivers'], nm); P = f['path']; m = P[len(P) // 2]['pos']
        fl.append(f"{nm} 꼭짓점 {ford(f, m, span=1)}")
    notes.append('여울 ' + str(len(fl)) + ': ' + ' · '.join(fl))
    # 산맥 — 경계 거울 띠 다섯 그대로 + 닛폰북령(서 경계 접합 지맥) 그대로 + 아라야마(북 경계) 그대로 + 등뼈 하나
    keepG = [g for g in T['ridges'] if g['name'] in ('쿠로야마', '매산맥', '연산맥', '학산맥', '화산맥', '닛폰북령', '아라야마')]
    keepG.append(spine); T['ridges'] = keepG
    notes.append('등뼈 닛폰척량 하나: (27500,2500) → (22300,117000) · 폭 900~2200 — 유키야마 · 츠키야마 · 옛 척량을 한 줄로')
    # 고개 — 경계 둘 그대로 + 등뼈 다섯
    T['passes'] = [q for q in T['passes'] if q['name'] in ('쇠재', '한재')] + [
        {'name': '북척재', 'pos': [25900, 22000], 'radius': 1500}, {'name': '유키재', 'pos': [23900, 43000], 'radius': 1600},
        {'name': '한가운데재', 'pos': [23700, 64000], 'radius': 1700}, {'name': '츠키재', 'pos': [23300, 86000], 'radius': 1500},
        {'name': '남척재', 'pos': [22700, 108000], 'radius': 1300}]
    notes.append('고개 등뼈 다섯: 북척재 · 유키재 · 한가운데재 · 츠키재 · 남척재(+ 경계 쇠재 · 한재)')
    # 계곡 — 닛폰북령을 건너는 골 셋(서 평원 북쪽 ↔ 북동)
    nb = byname(T['ridges'], '닛폰북령')
    def gorge(name, frac):
        P = nb['path']; L = [0.0]
        for i in range(1, len(P)): L.append(L[-1] + math.hypot(P[i]['pos'][0] - P[i - 1]['pos'][0], P[i]['pos'][1] - P[i - 1]['pos'][1]))
        i = min(range(len(P) - 1), key=lambda k: abs(L[k] - frac * L[-1])); a, b = P[i]['pos'], P[i + 1]['pos']
        dx, dy = b[0] - a[0], b[1] - a[1]; n = math.hypot(dx, dy) or 1; ux, uy = -dy / n, dx / n
        half = P[i]['width'] / 2 + 500
        return {'name': name, 'path': [{'pos': [round(a[0] - ux * half), round(a[1] - uy * half)], 'width': 520}, {'pos': [round(a[0]), round(a[1])], 'width': 520},
                                        {'pos': [round(a[0] + ux * half), round(a[1] + uy * half)], 'width': 520}]}
    T['valleys'] = [gorge('서북령골', 0.3), gorge('북령골', 0.45), gorge('동북령골', 0.6)]
    notes.append('계곡 셋: 닛폰북령을 건너는 골(북령골 · 서북령골 · 동북령골)')
    # 호수 — 닭밭호(모서리 · 한반도 은호 짝) 그대로 · 아카호 · 스미호(큰 강 위 분지) · 토오호(등뼈 남쪽 발치) · 유키호 → 북서 분지로 옮김(큰 강의 머리 가까이)
    L = {l['name']: l for l in T['lakes']}
    T['lakes'] = [L['닭밭호'], dict(L['토오호']), {'name': '아카호', 'center': [8750, 79300], 'shape': 'circle', 'radius': 1300},
                  dict(L['스미호'], radius=1200), {'name': '유키호', 'center': [10200, 30500], 'shape': 'circle', 'radius': 1200}]
    notes.append('호수 다섯 = 닭밭호(모서리 · 그대로) · 토오호(그대로) · 아카호 r1300 · 스미호 r1200(큰 강 위) · 유키호 → (10200,30500) r1200(큰 강 위 · 북 경계에서 들임)')
    T['_t549'] = {'plan': 'B', 'notes': notes}
    return T

for nm, fn in (('A', plan_A), ('B', plan_B)):
    T = fn(); p = os.path.join(OUT, f'nippon_{nm}.json')
    json.dump(T, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    print(nm, p, {k: len(T.get(k, [])) for k in ('rivers', 'lakes', 'ridges', 'passes', 'valleys')})
    for n in T['_t549']['notes']: print('   ·', n)
