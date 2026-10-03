#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T604 추신2 ③ 그림 · 판정 0 — 이동 값은 재민이 고른다)
# =============================================================================
# 한반도 남해안 **b × 평행이동 0/30/60/90셀** — 통째(1셀 = 0.5px) + 확대 둘(노루내·한들천·가랑천 둘레 1px · 한여울강 하구 1.5px).
#   띠 = `t588-coast-mask.js --shift <셀>`(T588_COAST=b)이 정본 생성기로 떨군 u8 그대로 · 바다 위 정본(강 점 · 마을 후보 · 광맥 · 숲)은 빨강 ·
#   바닷가 후보(960px 안 — `land.coastal`)는 주황 테 · 지금(끔 · 이동 0) 해안선은 얇은 노랑 선(견줌).
#   정본 자리 = `t604-coast-shift.js` 가 적은 canonPos(존 local px · 사본 0) · 표 = 같은 json 의 줄.
# 쓰는 법: python3 scripts/t604-coast-shift-fig.py <out.png> <masks_dir(b0,b30,b60,b90,off0 .u8/.json)> <shift_all.json>
# =============================================================================
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT, MD, TJ = sys.argv[1], sys.argv[2], sys.argv[3]
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(sz, b=False): return ImageFont.truetype(BOLD if b else FONT, sz, index=1)
LAND = (222, 214, 186); SEA = (35, 50, 80); OCEAN = (28, 40, 66); RIVER = (70, 130, 205); INK = (30, 30, 30); GREY = (110, 110, 110)
RED = (225, 40, 40); ORANGE = (240, 150, 30); REF = (250, 220, 60)
SHIFTS = [0, 30, 60, 90]
TAB = json.load(open(TJ, encoding='utf-8'))
Z = TAB['zones']['hanbando']; CP = Z['canonPos']
ROWS = {(r['arm'], r['shift']): r for r in Z['rows']}

def load(name):
    m = json.load(open(os.path.join(MD, name + '.json'), encoding='utf-8'))
    a = np.fromfile(os.path.join(MD, name + '.u8'), np.uint8).reshape(m['NY'], m['NX']).astype(bool)
    return m, a
meta0, ref = load('off0')
NX, NY = meta0['NX'], meta0['NY']
# 지금(끔 · 이동 0) 해안선 칸 = 띠 바다 칸 중 4방에 뭍이 있는 칸
refEdge = ref & ~(np.pad(ref, 1, constant_values=True)[:-2, 1:-1] & np.pad(ref, 1, constant_values=True)[2:, 1:-1] & np.pad(ref, 1, constant_values=True)[1:-1, :-2] & np.pad(ref, 1, constant_values=True)[1:-1, 2:])

PANELS = [   # 이름 · x0 · x1 · y0 · 축척(px/셀)
    ('남해안 통째', 0, NX, NY - 420, 0.5),
    ('확대 ① 노루내 · 한들천 · 가랑천 둘레', 140, 1300, NY - 243, 1.0),
    ('확대 ② 한여울강 하구', 1120, 1360, NY - 220, 1.5),
]
SEAROWS = 14   # 존 아래 바다 존 몇 줄(물 닿는 곳이 보이게)

def panel_img(sea, x0, x1, y0, sc):
    h = NY - y0 + SEAROWS
    a = np.zeros((h, x1 - x0), np.uint8); a[:NY - y0, :] = sea[y0:NY, x0:x1]; a[NY - y0:, :] = 2
    rgb = np.empty(a.shape + (3,), np.uint8); rgb[...] = LAND; rgb[a == 1] = SEA; rgb[a == 2] = OCEAN
    e = np.zeros_like(a, bool); e[:NY - y0, :] = refEdge[y0:NY, x0:x1]
    rgb[e] = REF
    im = Image.fromarray(rgb)
    if sc >= 1: im = im.resize((int(im.width * sc), int(im.height * sc)), Image.NEAREST)
    else: im = im.resize((max(1, int(round(im.width * sc))), max(1, int(round(im.height * sc)))), Image.BOX)
    return im

def sea_at(sea, x, y):
    cx, cy = int(x // 32), int(y // 32)
    return 0 <= cx < NX and 0 <= cy < NY and bool(sea[cy, cx])

def coastal(sea, x, y, R=31):
    cx, cy = int(x // 32), int(y // 32)
    y0, y1, x0, x1 = max(0, cy - R), min(NY, cy + R + 1), max(0, cx - R), min(NX, cx + R + 1)
    ys, xs = np.nonzero(sea[y0:y1, x0:x1])
    if not len(ys): return False
    d2 = ((ys + y0 - cy) ** 2 + (xs + x0 - cx) ** 2).min()
    return (d2 ** 0.5) * 32 <= 960

def overlay(dr, sea, x0, x1, y0, sc, ox, oy, labels):
    def P(x, y): return ox + (x / 32 - x0) * sc, oy + (y / 32 - y0) * sc
    def inside(x, y): return x0 <= x / 32 < x1 and y0 <= y / 32 < NY + SEAROWS
    lw = 1 if sc < 1 else 2
    for rv in CP['rivers']:
        pts = [p for p in rv['path']]
        if not any(inside(p[0], p[1]) for p in pts): continue
        dr.line([P(p[0], p[1]) for p in pts], fill=RIVER, width=lw)
        for p in pts:
            if inside(p[0], p[1]) and sea_at(sea, p[0], p[1]):
                X, Y = P(p[0], p[1]); r = 2 if sc < 1 else 3
                dr.ellipse([X - r, Y - r, X + r, Y + r], fill=RED)
        if labels and rv['name'] in ('노루내', '한들천', '가랑천', '한여울강'):
            q = pts[-1] if inside(pts[-1][0], pts[-1][1]) else next((p for p in reversed(pts) if inside(p[0], p[1])), None)
            if q:
                X, Y = P(q[0], q[1]); dr.text((X + 4, Y - 18), rv['name'], font=font(12, True), fill=(255, 255, 255), stroke_width=2, stroke_fill=(20, 20, 20))
    for v in CP['villages']:
        if not inside(v['x'], v['y']): continue
        X, Y = P(v['x'], v['y']); s, c = sea_at(sea, v['x'], v['y']), coastal(sea, v['x'], v['y'])
        r = 4 if sc < 1 else 6
        dr.ellipse([X - r, Y - r, X + r, Y + r], fill=RED if s else (255, 255, 255), outline=ORANGE if c else INK, width=2 if c else 1)
        if labels: dr.text((X + 6, Y - 6), v['name'], font=font(10), fill=INK)
    for o in CP['ores']:
        if inside(o['x'], o['y']) and sea_at(sea, o['x'], o['y']):
            X, Y = P(o['x'], o['y']); r = 2 if sc < 1 else 3; dr.rectangle([X - r, Y - r, X + r, Y + r], fill=RED)
    for f in CP['forests']:
        if inside(f['x'], f['y']) and sea_at(sea, f['x'], f['y']):
            X, Y = P(f['x'], f['y']); r = 5; dr.polygon([(X, Y - r), (X - r, Y + r), (X + r, Y + r)], fill=RED)

def dfmt(r):
    return ' · '.join((d['side'] + ' ' if len(r['depth']) > 1 else '') + (f"반지름 {d['radius']}" if d.get('radius') is not None else f"{d['min']}/{d['med']}/{d['max']}") for d in r['depth'])

# 크기
imgs = {}
for sh in SHIFTS:
    m, sea = load(f'b{sh}')
    imgs[sh] = (m, sea, [panel_img(sea, x0, x1, y0, sc) for (_, x0, x1, y0, sc) in PANELS])
pw = [im.width for im in imgs[0][2]]; ph = max(im.height for im in imgs[0][2])
W = 20 + sum(pw) + 24 * (len(pw) - 1) + 20
H = 150 + len(SHIFTS) * (ph + 58) + 30 + 22 * 14 + 60
im = Image.new('RGB', (W, H), (250, 250, 247)); dr = ImageDraw.Draw(im)
dr.text((20, 12), 'T604 추신2 — 한반도 남해안 b × 평행이동 0 · 30 · 60 · 90셀(존별 coastShift) · 재민이 이동 값을 고른다(PM 안 60)', font=font(22, True), fill=INK)
dr.text((20, 46), '뭍 모래 · 띠 바다 남색 · 바다 존 짙은 남 · 노랑 선 = 지금(끔 · 이동 0) 해안선 · 강 파랑(바다 위 강 점 빨강) · 마을 후보 흰 점(바다 위 빨강 · 바닷가 960px 안 주황 테) · 광맥 중심이 바다 위 = 빨강 네모 · 숲 중심이 바다 위 = 빨강 세모', font=font(13), fill=GREY)
dr.text((20, 68), '이동 = 띠 깊이에서 빼고 0 아래는 0 · 뭍 이웃 변(서 = 중원북 · 동 = 닛폰)에서는 0 에서 시작해 이동만큼 들어가면 다(45° 꺾임 — 이웃 존과 계단 0) · 1셀 ≈ 137m(T589 축척) → 30셀 ≈ 4.1km', font=font(13), fill=GREY)
dr.text((20, 90), '같은 축척: 통째 1셀 = 0.5px · 확대 ① 1px · 확대 ② 1.5px · 확대 창 — ① 셀 x 140~1300 · y 3820~4063 · ② x 1120~1360 · y 3843~4063(아래 14줄은 바다 존)', font=font(13), fill=GREY)
y = 122
for sh in SHIFTS:
    m, sea, ps = imgs[sh]; r = ROWS[('b', sh)]
    c = r['canon']
    dr.text((20, y), f"b · 이동 {sh}셀  —  띠 깊이 {dfmt(r)}셀 · 띠 {r['bandPct']:.2f}% · 바다 위 강 점 {c['riverPts']}({c['riverLines']}줄) · 마을 {len(c['villSea'])} · 광맥 {c['oreSea']} · 숲 {len(c['forestSea'])} · 바닷가 후보 {len(c['villCoastal'])}({'·'.join(c['villCoastal']) or '-'}) · 늘어난 뭍 {r['gained']:,}칸",
            font=font(14, True), fill=INK)
    x = 20
    for (nm, x0, x1, y0, sc), pim in zip(PANELS, ps):
        pim = pim.copy(); overlay(ImageDraw.Draw(pim), sea, x0, x1, y0, sc, 0, 0, labels=(sc >= 1))   # 판 그림 위에 그려 판 밖은 잘린다
        im.paste(pim, (x, y + 24))
        if sh == SHIFTS[0]: dr.text((x, y + 24 + pim.height + 2), nm, font=font(12), fill=GREY)
        x += pim.width + 24
    y += ph + 58
# 표
dr.text((20, y), '표 — 한반도 · 닛폰 · 중원북 × 끔/b × 이동(셀) · 바다 위 정본(강 점(줄) · 마을 · 광맥 · 숲) · 바닷가 후보(960px) · 늘어난 뭍 — scripts/t604-coast-shift.js', font=font(13, True), fill=INK); y += 22
hdr = ['존 · 안', '이동', '띠 깊이 최소/중앙/최대(셀)', '띠 %', '강 점(줄)', '마을', '광맥', '숲', '바닷가 후보', '늘어난 뭍']
xs = [20, 170, 230, 560, 640, 740, 800, 860, 910, 1180]
for i, h_ in enumerate(hdr): dr.text((xs[i], y), h_, font=font(12, True), fill=INK)
y += 18
KO = {'hanbando': '한반도', 'nippon': '닛폰', 'jungwon_n': '중원북'}
for zid in ('hanbando', 'nippon', 'jungwon_n'):
    for r in TAB['zones'][zid]['rows']:
        if r['arm'] != 'b' and zid != 'hanbando': continue
        c = r['canon']
        vals = [f"{KO[zid]} · {'끔' if r['arm'] == 'off' else r['arm']}", str(r['shift']), dfmt(r), f"{r['bandPct']:.2f}", f"{c['riverPts']}({c['riverLines']})", str(len(c['villSea'])), str(c['oreSea']), str(len(c['forestSea'])),
                f"{len(c['villCoastal'])}({'·'.join(c['villCoastal']) or '-'})", f"{r['gained']:,}"]
        for i, v in enumerate(vals): dr.text((xs[i], y), v, font=font(12), fill=INK if r['arm'] == 'b' else GREY)
        y += 17
dr.text((20, y + 10), 'T604 추신2 · t588-coast-mask.js --shift → t604-coast-shift.js(표 · 정본 자리) → t604-coast-shift-fig.py · 판정 0 — 이동 값은 재민 · 적재는 PM', font=font(12), fill=GREY)
im = im.crop((0, 0, W, min(H, y + 40)))
im.save(OUT); print(OUT, im.size)
