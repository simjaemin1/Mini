#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T407 표·그림 칸)
# =============================================================================
# T407 — 닛폰 소외 표 · 지형 밀도 표 · 그림 한 장(한반도와 같은 축척으로 옆에).
#
#   입력(전부 앞 단계가 남긴 파일 — 이 파일은 **새 수를 만들지 않는다**):
#     <dir>/iso-nippon.json|.bin · iso-hanbando.json|.bin  ← scripts/t407-nippon-isolation.js
#     <dir>/n17/o_<seed>.txt · n17/j_<seed>.json            ← T17_ZONE=nippon t17-metrics (ⓛ 바닥 마을)
#     <dir>/n176/x_<seed>.json                               ← T17_ZONE=nippon t176-ab (마을별 끝/최고 · 캐러밴)
#     <hb17>/o_<seed>.txt                                    ← 한반도 넷째 판 t17 (ⓛ 바닥 마을 · 비율의 분모)
#   문턱(소외 후보 칸)은 **한반도 분포에서 읽는다**: 거리 = 한반도 51곳 중 3번째로 먼 값(= "상위 셋"의 자리) ·
#     짝 ≤ 2(카드 그대로) · 바닥 마을(ⓛ). 판정이 아니라 칸이다.
#   그림: T393 문법(PIL · Noto CJK · 같은 색 판) · 한 칸 = 2셀(64px) · 두 존 같은 축척.
#
# 쓰는 법: python3 scripts/t407-nippon-tables.py <dir> <hb17 dir> <그림.png> <표.json>
# =============================================================================
import json, os, re, sys, math
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont

D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/t407'
HB17 = sys.argv[2] if len(sys.argv) > 2 else '/tmp/t407/b17'
PNG = sys.argv[3] if len(sys.argv) > 3 else '/tmp/t407/T407_닛폰_소외.png'
OUTJ = sys.argv[4] if len(sys.argv) > 4 else '/tmp/t407/tables.json'
SEEDS = [1020, 7, 42]

def load_iso(z):
    J = json.load(open(os.path.join(D, f'iso-{z}.json'), encoding='utf-8'))
    raw = np.fromfile(J['bin'], dtype=np.uint8)
    n = J['GX'] * J['GY']
    masks = {k: raw[i * n:(i + 1) * n].reshape(J['GY'], J['GX']).astype(bool) for i, k in enumerate(J['masks'])}
    return J, masks

def floor_names(txt):
    s = open(txt, encoding='utf-8').read()
    m = re.search(r'ⓛ \[T152\].*?\n(.*?)⇒', s, re.S)
    rows = {}
    if not m: return rows
    for line in m.group(1).splitlines()[1:]:
        p = line.split()
        if len(p) >= 8 and '/' in p[2]:
            end, mx = p[2].split('/')
            rows[p[0]] = dict(end=int(end), max=int(mx), stoneMin=float(p[3]), toolMin=float(p[4]), stone0=int(p[5]), tool0=int(p[6]))
    return rows

def dists(J, M, xy):
    """마을 자리(셀)마다: 주 광맥 중심 · 숲 · 강·호수 · 바다(띠)까지 거리(셀)."""
    st = J['STEP']
    out = {}
    edt = {k: ndimage.distance_transform_edt(~M[k]) * st for k in ('forest', 'inland', 'band')}
    ores = np.array([[o[0], o[1]] for o in J['geo']['oreCenters']]) if J['geo']['oreCenters'] else np.zeros((0, 2))
    for name, (x, y) in xy.items():
        gx = min(max(int(round(x / st)), 0), J['GX'] - 1); gy = min(max(int(round(y / st)), 0), J['GY'] - 1)
        r = {k: float(edt[k][gy, gx]) for k in edt}
        r['ore'] = float(np.min(np.hypot(ores[:, 0] - x, ores[:, 1] - y))) if len(ores) else float('nan')
        out[name] = r
    return out

NP, NPM = load_iso('nippon')
HB, HBM = load_iso('hanbando')

def pos(v):
    return (v['ccx'], v['ccy']) if v.get('seeded') else (v['x'], v['y'])

np_xy = {v['name']: pos(v) for v in NP['vills']}
hb_xy = {v['name']: pos(v) for v in HB['vills'] if v.get('seeded')}
np_d = dists(NP, NPM, np_xy)
hb_d = dists(HB, HBM, hb_xy)
KEYS = [('ore', '주 광맥'), ('forest', '숲'), ('inland', '강·호수')]
thr = {}
for k, _ in KEYS:
    arr = sorted([r[k] for r in hb_d.values()], reverse=True)
    thr[k] = {'third': arr[2], 'p50': float(np.median(arr)), 'p90': float(np.percentile(arr, 90)), 'max': arr[0]}

# 바닥 마을 · 끝/최고 · 캐러밴 — 3시드
floor = {s: floor_names(os.path.join(D, 'n17', f'o_{s}.txt')) for s in SEEDS}
per176 = {}
for s in SEEDS:
    x = json.load(open(os.path.join(D, 'n176', f'x_{s}.json'), encoding='utf-8'))
    per176[s] = {p['name']: p for p in x['per']}
hbfloor = {s: floor_names(os.path.join(HB17, f'o_{s}.txt')) for s in SEEDS}

rows = []
for v in NP['vills']:
    n = v['name']; d = np_d[n]
    r = dict(name=n, type=v['type'], picked=v['picked'], seeded=v['seeded'], notWhy=v.get('why'), x=round(np_xy[n][0]), y=round(np_xy[n][1]),
             partners=v.get('partnersB'), partners0=v.get('partners0'), viaBridge=v.get('viaBridge'),
             ore=round(d['ore']), forest=round(d['forest']), inland=round(d['inland']), sea=round(d['band']),
             floor=[n in floor[s] for s in SEEDS],
             endMax=[(per176[s][n]['N'], per176[s][n]['popMax']) if n in per176[s] else None for s in SEEDS],
             caravans=[per176[s][n].get('caravans') if n in per176[s] else None for s in SEEDS],
             foodImported=[per176[s][n].get('foodImported') if n in per176[s] else None for s in SEEDS])
    why = []
    if v['seeded']:
        if r['partners'] is not None and r['partners'] <= 2: why.append('짝≤2')
        for k, lab in KEYS:
            if d[k] >= thr[k]['third']: why.append(f'{lab} 먼(≥한반도 3위 {thr[k]["third"]:.0f})')
        if all(r['floor']): why.append('바닥 3/3')
        elif any(r['floor']): why.append(f'바닥 {sum(r["floor"])}/3')
    r['why'] = why
    r['cand'] = bool(v['seeded'] and why and (('짝≤2' in why) or any('먼' in w for w in why) or any(w.startswith('바닥') for w in why)))
    rows.append(r)

# 소외 후보 중 "먼" 사유를 가진 마을(바닥은 7곳 중 6곳이라 칸이 넓다 — 둘을 나눠 센다)
cand_far = [r['name'] for r in rows if any('먼' in w for w in r['why']) or '짝≤2' in r['why']]
cand_any = [r['name'] for r in rows if r['cand']]

# ── ④ 밀도 표 — 뭍(띠·강호수 아닌 표본) 백만 셀당
def dens(J):
    c = J['cnt']; st2 = J['STEP'] ** 2
    landAll = (c['samples'] - c['band'] - c['inland']) * st2          # 뭍(바위 포함) 셀
    g = J['geo']
    per = lambda v: v / landAll * 1e6
    return landAll, {
        '강 길이(셀)': per(g['rivers']['lenCells']), '강 줄기 수': per(g['rivers']['n']),
        '강·호수 물 면적(셀)': per(c['inland'] * st2), '호수 수': per(g['lakes']['nAll']),
        '능선 길이(셀)': per(g['ridges']['lenCells']), '바위 면적(셀)': per(c['rock'] * st2),
        '숲 면적(셀)': per(c['forest'] * st2), '숲 개수': per(g['forests']['nAll']),
        '주 광맥 수': per(g['ores']['major']), '자잘 광맥 수': per(g['ores']['minor']), '광맥 군집 면적(셀)': per(c['ore'] * st2),
        '골짜기 수': per(g['valleys']['n']), '군락 수': per(g['groves']), '고개 수': per(g['passes']),
    }, {
        '강 길이(셀)': g['rivers']['lenCells'], '강 줄기 수': g['rivers']['n'], '강·호수 물 면적(셀)': c['inland'] * st2,
        '호수 수': g['lakes']['nAll'], '능선 길이(셀)': g['ridges']['lenCells'], '바위 면적(셀)': c['rock'] * st2,
        '숲 면적(셀)': c['forest'] * st2, '숲 개수': g['forests']['nAll'], '주 광맥 수': g['ores']['major'],
        '자잘 광맥 수': g['ores']['minor'], '광맥 군집 면적(셀)': c['ore'] * st2, '골짜기 수': g['valleys']['n'],
        '군락 수': g['groves'], '고개 수': g['passes'],
    }
hbL, hbD, hbA = dens(HB)
npL, npD, npA = dens(NP)
dens_rows = [dict(k=k, hb=hbA[k], np=npA[k], hbPer=hbD[k], npPer=npD[k], ratio=(npD[k] / hbD[k] * 100 if hbD[k] else None)) for k in hbD]
src_rows = {z: {'강 원천/전체': (J['geo']['rivers']['srcN'], J['geo']['rivers']['n']), '능선 원천/전체': (J['geo']['ridges']['srcN'], J['geo']['ridges']['n']),
                '호수 원천/전체': (J['geo']['lakes']['srcN'], J['geo']['lakes']['nAll']), '숲 원천/전체': (J['geo']['forests']['srcN'], J['geo']['forests']['nAll']),
                '숲 손그림(타원)/사각': (J['geo']['forests']['hand'], J['geo']['forests']['rect'])} for z, J in (('hanbando', HB), ('nippon', NP))}

# ── 두 존 한 줄 비율(② — 한반도 넷째 판 대비)
def base(dirp, s):
    j = json.load(open(os.path.join(dirp, f'j_{s}.json'), encoding='utf-8'))
    return dict(pop=j['base']['pop'], dead=j['base']['dead'], ever=j['base']['ever'], live=j['live'], req=j['board']['reqOpened'],
                weapQ=j['base']['weapQ'], expand=j['base']['expand'], toolQ=j['tool']['q'], pres=j['preserve']['stock'],
                grain=j['eight']['grain'], dA=j['eight']['densAll'], dV=j['eight']['densValue'])
ratio = []
for s in SEEDS:
    h = base(HB17, s); n = base(os.path.join(D, 'n17'), s)
    ratio.append(dict(seed=s, hb=h, np=n, hbFloor=len(hbfloor[s]), npFloor=len(floor[s])))

json.dump(dict(rows=rows, thr=thr, cand_far=cand_far, cand_any=cand_any, dens=dens_rows, landCells={'hanbando': hbL, 'nippon': npL},
               src=src_rows, ratio=ratio, hbDist=hb_d, npDist=np_d, npComps={'B': NP['compsB'], '0': NP['comps0']},
               hbPartners=sorted([v.get('partnersB') for v in HB['vills'] if v.get('seeded')])), open(OUTJ, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

# ── 그림 — 두 존 같은 축척(한 칸 = STEP 셀)
FONT_DIR = '/usr/share/fonts/opentype/noto/'
def font(sz, bold=False):
    p = os.path.join(FONT_DIR, 'NotoSansCJK-Bold.ttc' if bold else 'NotoSansCJK-Regular.ttc')
    return ImageFont.truetype(p, sz, index=1) if os.path.exists(p) else ImageFont.load_default()
SURF = (252, 252, 251)
INK, INK2, INK3 = (11, 11, 11), (82, 81, 78), (140, 139, 134)
TREE, STUMP, MARK = (27, 175, 122), (235, 104, 52), (42, 120, 214)
WATER, ROCK, TERR = (217, 231, 245), (225, 223, 216), (238, 233, 221)
SEA = (190, 212, 236); RIVER = (120, 170, 225); ORE = (82, 81, 78); RED = (214, 40, 40)
FOREST = (196, 232, 214)

def raster(J, M):
    h, w = J['GY'], J['GX']
    a = np.zeros((h, w, 3), np.uint8); a[:] = TERR
    a[M['forest']] = FOREST
    a[M['rock']] = ROCK
    a[M['ore']] = (200, 196, 186)
    a[M['inland']] = RIVER
    a[M['band']] = SEA
    return Image.fromarray(a, 'RGB')

M_, HEAD, FOOT, GAP = 28, 150, 96, 60
imH, imN = raster(HB, HBM), raster(NP, NPM)
W = M_ * 2 + imH.width + GAP + imN.width + 130   # 오른쪽 여백 — 존 동쪽 끝 후보 이름표가 잘리지 않게
H = HEAD + max(imH.height, imN.height) + FOOT
im = Image.new('RGB', (W, H), SURF)
d = ImageDraw.Draw(im)
oxH, oxN, oy = M_, M_ + imH.width + GAP, HEAD
im.paste(imH, (oxH, oy)); im.paste(imN, (oxN, oy))
for ox, J in ((oxH, HB), (oxN, NP)):
    d.rectangle([ox - 1, oy - 1, ox + J['GX'], oy + J['GY']], outline=INK3, width=1)

def draw_zone(ox, J, labels, redset):
    st = J['STEP']
    for o in J['geo']['oreCenters']:
        x, y = ox + o[0] / st, oy + o[1] / st
        d.rectangle([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=ORE)
    for v in J['vills']:
        x0, y0 = pos(v); x, y = ox + x0 / st, oy + y0 / st
        if v.get('seeded'):
            rr = 6 if labels else 3.5
            d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=INK)
            if v['name'] in redset:
                d.ellipse([x - 13, y - 13, x + 13, y + 13], outline=RED, width=3)
        else:
            if labels:
                d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=INK2, width=2)
        if labels:
            d.text((x + 9, y - 10), v['name'] + ('' if v.get('seeded') else ' (안 섬)'), font=font(15, v.get('seeded')), fill=INK if v.get('seeded') else INK3)

# 다리 셀 — iso JSON 엔 수만 있다 → zone-config 를 다시 읽지 않고 파이썬이 정본 js 에서 배열을 뽑는다(글자 그대로)
def bridges_of(z):
    src = open(os.path.join(os.path.dirname(__file__), '..', 'server', 'zone-config.js'), encoding='utf-8').read()
    i = src.find(f'\n  {z}: {{')
    j = src.find('bridges: [', i); k = src.find(']', j)
    if i < 0 or j < 0: return []
    nums = [int(t) for t in src[j + 10:k].split(',') if t.strip()]
    return list(zip(nums[0::2], nums[1::2]))
for ox, J, z in ((oxH, HB, 'hanbando'), (oxN, NP, 'nippon')):
    st = J['STEP']
    for (cx, cy) in bridges_of(z):
        x, y = ox + cx / st, oy + cy / st
        d.rectangle([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=STUMP)

draw_zone(oxH, HB, False, set())
draw_zone(oxN, NP, True, set(cand_far))

d.text((M_, 14), 'T407 · 닛폰(아사기 열도) 소외 후보 — 한반도와 같은 축척', font=font(28, True), fill=INK)
d.text((M_, 54), f'한 칸 = {NP["STEP"]}셀({NP["STEP"]*32}px) · 한반도 {HB["NX"]}×{HB["NY"]}셀 · 닛폰 {NP["NX"]}×{NP["NY"]}셀 · 닛폰 후보 {len(NP["vills"])} → 시딩 {sum(1 for v in NP["vills"] if v.get("seeded"))}',
       font=font(18), fill=INK2)
lx, ly = M_, 96
def leg(col, label, shape='box'):
    global lx
    if shape == 'box': d.rectangle([lx, ly + 3, lx + 16, ly + 19], fill=col, outline=INK3)
    elif shape == 'dot': d.ellipse([lx, ly + 3, lx + 16, ly + 19], fill=col)
    elif shape == 'ring': d.ellipse([lx, ly + 1, lx + 20, ly + 21], outline=col, width=3)
    elif shape == 'hollow': d.ellipse([lx + 2, ly + 5, lx + 14, ly + 17], outline=col, width=2)
    d.text((lx + 24, ly), label, font=font(16), fill=INK2)
    lx += 24 + d.textlength(label, font=font(16)) + 20
leg(SEA, '바다(해안선 띠)'); leg(RIVER, '강·호수'); leg(ROCK, '바위(능선)'); leg(FOREST, '숲'); leg(ORE, '주 광맥', 'dot')
leg(STUMP, '다리', 'dot'); leg(INK, '시딩 마을', 'dot'); leg(INK2, '안 선 후보', 'hollow'); leg(RED, '소외 후보(짝≤2·거리)', 'ring')
d.text((oxH, oy - 26), f'한반도(hanbando) — 시딩 {sum(1 for v in HB["vills"] if v.get("seeded"))}곳 · 이름 생략', font=font(17, True), fill=INK)
d.text((oxN, oy - 26), '닛폰(nippon)', font=font(17, True), fill=INK)
fy = oy + max(imH.height, imN.height) + 14
d.text((M_, fy), '지형 = terrain.js 정본 술어(강·호수 isWaterCellLocal · 바위 isRockCellLocal · 숲 getForestMultiplier>1.5 · 광맥 isOreClusterAt) · 바다 = chunk.generateCoastlineWaterTiles(서버 WATER_TILES 와 같은 함수)',
       font=font(14), fill=INK3)
d.text((M_, fy + 22), '다리 = zone-config bridges · 마을 = terrain.siteCandidates → pickSeedVillages → findOpenCenter(서버 시딩과 같은 길) · 소외 후보 문턱 = 한반도 51곳 분포(3위 거리) · 판정 0',
       font=font(14), fill=INK3)
_nf = sum(1 for r in rows if r['seeded'] and all(r['floor'])); _ns = sum(1 for r in rows if r['seeded'])
d.text((M_, fy + 44), f'바닥 마을(ⓛ 돌 바닥 · 3시드 모두)은 닛폰 {_ns}곳 중 {_nf}곳이라 빨간 테두리에서 뺐다 — 표의 칸에 있다(보고/T407 §0-ⓒ)', font=font(14), fill=INK3)
os.makedirs(os.path.dirname(PNG) or '.', exist_ok=True)
im.save(PNG)
print(PNG, im.size, '후보(짝·거리)', cand_far, '후보(바닥 포함)', cand_any)
