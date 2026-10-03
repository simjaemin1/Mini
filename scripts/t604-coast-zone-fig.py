#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T604 추신3 ③ 그림 · 판정 0 — 닛폰 · 중원북 적재는 재민 ○ 뒤)
# =============================================================================
# 존 하나의 해안 **지금(끔 · 이동 0) | 이 가지 기본(b · 이동 0) | b · 이동 90(+ 경계 앞 8셀 지킴)** — 세 칸 나란히 · 같은 창 · 같은 축척.
#   띠 = `t588-coast-mask.js`(정본 생성기 그대로 · `--shift`) 가 떨군 u8 · 바다 위 정본(강 점 · 마을 후보 · 광맥 · 숲)은 빨강 ·
#   노랑 선 = 지금(끔 · 이동 0) 해안선(견줌) · 존 밖은 바다 존이면 짙은 남 · 뭍 존이면 회색(그 존 띠는 안 그린다).
#   정본 자리 · 표 = `t604-coast-shift.js` json(canonPos · rows — 사본 0).
# 쓰는 법: python3 scripts/t604-coast-zone-fig.py <out.png> <zone> <masks_dir(<zone>_off0 · _b0 · _b90 .u8/.json)> <표.json(off·def × 0·90)>
# =============================================================================
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT, ZID, MD, TJ = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(sz, b=False): return ImageFont.truetype(BOLD if b else FONT, sz, index=1)
LAND = (222, 214, 186); SEA = (35, 50, 80); OCEAN = (28, 40, 66); NEIGH = (200, 200, 196); RIVER = (70, 130, 205); INK = (30, 30, 30); GREY = (110, 110, 110)
RED = (225, 40, 40); ORANGE = (240, 150, 30); REF = (250, 220, 60)
TAB = json.load(open(TJ, encoding='utf-8'))
Z = TAB['zones'][ZID]; CP = Z['canonPos']
ROWS = {(r['arm'], r['shift']): r for r in Z['rows']}
KO = {'hanbando': '한반도(새벌)', 'nippon': '닛폰(아사기 열도)', 'jungwon_n': '중원북'}

def load(name):
    m = json.load(open(os.path.join(MD, f'{ZID}_{name}.json'), encoding='utf-8'))
    a = np.fromfile(os.path.join(MD, f'{ZID}_{name}.u8'), np.uint8).reshape(m['NY'], m['NX']).astype(bool)
    return m, a
COLS = [('off0', ('off', 0), '지금(main) — 끔 · 이동 0'), ('b0', ('def', 0), '이 가지 기본 — b · 이동 0'), ('b90', ('def', 90), 'b · 이동 90(+ 경계 앞 8셀 지킴) — 재민 ○ 이면')]
MAS = {k: load(k) for k, _, _ in COLS}
meta0, ref = MAS['off0']
NX, NY, ZX0, ZY0 = meta0['NX'], meta0['NY'], meta0['x0'], meta0['y0']
OCEANS = meta0['ocean']
refEdge = ref & ~(np.pad(ref, 1, constant_values=True)[:-2, 1:-1] & np.pad(ref, 1, constant_values=True)[2:, 1:-1] & np.pad(ref, 1, constant_values=True)[1:-1, :-2] & np.pad(ref, 1, constant_values=True)[1:-1, 2:])

# 판(셀 창 · 존 밖 칸 포함 가능) — 이름 · x0 · x1 · y0 · y1 · 축척(px/셀)
M = 14   # 존 밖 몇 칸(경계가 보이게)
if ZID == 'nippon':
    PANELS = [('통째(1셀 = 0.2px)', -M, NX + M, -M, NY + M, 0.2),
              ('확대 ① 남서 — 쿠로가와 · 미르내 · 아라가와 · 오오가와(한반도 경계 옆)', -M, 420, NY - 200, NY + M, 1.5),
              ('확대 ② 남동 모서리', NX - 300, NX + M, NY - 300, NY + M, 1.0),
              ('확대 ③ 동변 가운데', NX - 260, NX + M, 1700, 2300, 1.0)]
    LABELS = ('쿠로가와', '미르내', '아라가와', '오오가와')
else:   # jungwon_n — 남동 꼭짓점으로만 바다(east_sea_s)에 닿는다
    PANELS = [('남동 모서리 넓게(1셀 = 0.6px)', NX - 700, NX + M, NY - 700, NY + M, 0.6),
              ('확대 — 꼭짓점 · 상수 · 이음수(1셀 = 2px)', NX - 230, NX + M, NY - 150, NY + M, 2.0)]
    LABELS = ('상수', '이음수')

def in_ocean(wx, wy):
    for o in OCEANS:
        if o['x0'] <= wx < o['x1'] and o['y0'] <= wy < o['y1']: return True
    return False

def panel_img(sea, x0, x1, y0, y1, sc):
    w, h = x1 - x0, y1 - y0
    rgb = np.empty((h, w, 3), np.uint8); rgb[...] = LAND
    xs, ys = np.arange(x0, x1), np.arange(y0, y1)
    inX, inY = (xs >= 0) & (xs < NX), (ys >= 0) & (ys < NY)
    sub = np.zeros((h, w), bool); e = np.zeros((h, w), bool)
    yi, xi = np.nonzero(inY)[0], np.nonzero(inX)[0]
    if len(yi) and len(xi):
        sub[yi[0]:yi[-1] + 1, xi[0]:xi[-1] + 1] = sea[ys[yi[0]]:ys[yi[-1]] + 1, xs[xi[0]]:xs[xi[-1]] + 1]
        e[yi[0]:yi[-1] + 1, xi[0]:xi[-1] + 1] = refEdge[ys[yi[0]]:ys[yi[-1]] + 1, xs[xi[0]]:xs[xi[-1]] + 1]
    rgb[sub] = SEA
    out = ~(inY[:, None] & inX[None, :])
    if out.any():   # 존 밖 칸 — 바다 존이면 짙은 남 · 뭍 존이면 회색
        oy, ox = np.nonzero(out)
        for yy, xx in zip(oy, ox):
            wx, wy = ZX0 + xs[xx] * 32 + 16, ZY0 + ys[yy] * 32 + 16
            rgb[yy, xx] = OCEAN if in_ocean(wx, wy) else NEIGH
    rgb[e] = REF
    im = Image.fromarray(rgb)
    if sc >= 1: im = im.resize((int(w * sc), int(h * sc)), Image.NEAREST)
    else: im = im.resize((max(1, int(round(w * sc))), max(1, int(round(h * sc)))), Image.BOX)
    return im

def sea_at(sea, x, y):
    cx, cy = int(x // 32), int(y // 32)
    return 0 <= cx < NX and 0 <= cy < NY and bool(sea[cy, cx])

def coastal(sea, x, y, R=31):
    cx, cy = int(x // 32), int(y // 32)
    y0, y1, x0, x1 = max(0, cy - R), min(NY, cy + R + 1), max(0, cx - R), min(NX, cx + R + 1)
    ys, xs = np.nonzero(sea[y0:y1, x0:x1])
    if not len(ys): return False
    return (((ys + y0 - cy) ** 2 + (xs + x0 - cx) ** 2).min() ** 0.5) * 32 <= 960

def overlay(dr, sea, x0, x1, y0, y1, sc, labels):
    def P(x, y): return ((x / 32 - x0) * sc, (y / 32 - y0) * sc)
    def inside(x, y): return x0 <= x / 32 < x1 and y0 <= y / 32 < y1
    lw = 1 if sc < 1 else 2
    for rv in CP['rivers']:
        pts = rv['path']
        if not any(inside(p[0], p[1]) for p in pts): continue
        dr.line([P(p[0], p[1]) for p in pts], fill=RIVER, width=lw)
        for p in pts:
            if inside(p[0], p[1]) and sea_at(sea, p[0], p[1]):
                X, Y = P(p[0], p[1]); r = 2 if sc < 1 else 3
                dr.ellipse([X - r, Y - r, X + r, Y + r], fill=RED)
        if labels and rv['name'] in LABELS:
            q = next((p for p in reversed(pts) if inside(p[0], p[1])), None)
            if q:
                X, Y = P(q[0], q[1]); dr.text((X + 4, Y - 18), rv['name'], font=font(12, True), fill=(255, 255, 255), stroke_width=2, stroke_fill=(20, 20, 20))
    for v in CP['villages']:
        if not inside(v['x'], v['y']): continue
        X, Y = P(v['x'], v['y']); s, c = sea_at(sea, v['x'], v['y']), coastal(sea, v['x'], v['y'])
        r = 3 if sc < 1 else 5
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

# 판 그림(열 = 세 안 · 줄 = 판)
cells = {}
for k, _, _ in COLS:
    _, sea = MAS[k]
    cells[k] = []
    for (nm, x0, x1, y0, y1, sc) in PANELS:
        pim = panel_img(sea, x0, x1, y0, y1, sc); overlay(ImageDraw.Draw(pim), sea, x0, x1, y0, y1, sc, labels=(sc >= 1)); cells[k].append(pim)
colW = max(max(p.width for p in cells[k]) for k, _, _ in COLS)
rowH = [max(cells[k][i].height for k, _, _ in COLS) for i in range(len(PANELS))]
GAP = 26
W = 20 + 3 * colW + 2 * GAP + 20
H = 150 + 70 + sum(h + 30 for h in rowH) + 40
im = Image.new('RGB', (W, H), (250, 250, 247)); dr = ImageDraw.Draw(im)
dr.text((20, 12), f'T604 추신3 — {KO.get(ZID, ZID)} 해안 · 지금 | 이 가지 기본 b | b + 이동 90(경계 앞 8셀 지킴) — 적재는 재민 ○ 뒤', font=font(22, True), fill=INK)
dr.text((20, 46), '뭍 모래 · 띠 바다 남색 · 바다 존 짙은 남 · 이웃 뭍 존 회색(그 존 띠는 안 그림) · 노랑 선 = 지금(끔 · 이동 0) 해안선 · 강 파랑(바다 위 강 점 빨강) · 마을 후보 흰 점(바다 위 빨강 · 960px 안 주황 테) · 광맥 중심 바다 위 = 빨강 네모 · 숲 중심 = 빨강 세모', font=font(13), fill=GREY)
dr.text((20, 68), '이동 = 띠 깊이에서 빼고, 바다 존 경계 앞 바다가 8셀(256px · 핸드오프 겹침 띠 폭 `HANDOFF_COMMIT`)보다 얇아지는 곳에서는 이동이 거기서 멈춘다 · 뭍 이웃 변에서는 0 에서 시작해 이동만큼 들어가면 다(45°)', font=font(13), fill=GREY)
y = 100
x = 20
for k, key, lab in COLS:
    r = ROWS[key]; c = r['canon']
    dr.text((x, y), lab, font=font(15, True), fill=INK)
    dr.text((x, y + 22), f"띠 깊이 {dfmt(r)}셀 · 띠 {r['bandPct']:.2f}%", font=font(12), fill=INK)
    dr.text((x, y + 40), f"바다 위 강 점 {c['riverPts']}({c['riverLines']}줄) · 마을 {len(c['villSea'])} · 광맥 {c['oreSea']} · 숲 {len(c['forestSea'])} · 바닷가 {len(c['villCoastal'])}", font=font(12), fill=INK)
    dr.text((x, y + 58), ('강: ' + ' · '.join(f"{q['name']} {q['onSea']}/{q['pts']}" for q in c['rivers'])) if c['rivers'] else '강: 0', font=font(12), fill=GREY)
    dr.text((x, y + 76), f"늘어난 뭍 {r['gained']:,}칸(같은 안 이동 0 대비) · 8셀 못 지킨 칸 {r['keep']['cells']}" if r['arm'] == 'def' and r['shift'] else '', font=font(12), fill=GREY)
    x += colW + GAP
y += 104
for i, (nm, x0, x1, y0, y1, sc) in enumerate(PANELS):
    dr.text((20, y), f'{nm} — 셀 x {x0}~{x1} · y {y0}~{y1}(존 밖 {M}칸 = 경계 너머)', font=font(13, True), fill=INK)
    x = 20
    for k, _, _ in COLS:
        im.paste(cells[k][i], (x, y + 22)); x += colW + GAP
    y += rowH[i] + 30
dr.text((20, y + 4), 'T604 추신3 · t588-coast-mask.js(--shift 0/90 · T588_COAST=0/기본) → t604-coast-shift.js(표 · 정본 자리) → t604-coast-zone-fig.py · 판정 0 — 넣을지는 재민', font=font(12), fill=GREY)
im = im.crop((0, 0, W, min(H, y + 30)))
im.save(OUT); print(OUT, im.size)
