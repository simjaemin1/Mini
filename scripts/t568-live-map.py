#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T568 PM 자 · 라이브 DB 사본(맥 ~/Mini/_db/) 지도 굽기·개울 미리보기 · 제품 무변 · 디렉터리 = 환경변수 T568_DIR)
# 서울 라이브 DB 사본(09-30 · day 3341) + 한반도 지형(T524 셀 격자) → 전 맵 한 장 + 마을 확대 + 표.
import json, math, sqlite3, colorsys, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os; D = os.environ.get('T568_DIR', '/tmp/out/live')
J = json.load(open(f'{D}/t524/hanbando.json')); N = J['N']; NY, NX = J['NY'], J['NX']
raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
forest = np.frombuffer(raw[N:2*N], np.uint8).reshape(NY, NX)
ore = np.frombuffer(raw[2*N:3*N], np.uint8).reshape(NY, NX)
off = 11 * N; DIST = {}
for k in ('fresh', 'forest', 'ore', 'rock', 'sea'):
    DIST[k] = np.frombuffer(raw[off:off+2*N], np.uint16).reshape(NY, NX); off += 2*N
np.save(f'{D}/kind.npy', kind); np.save(f'{D}/fresh.npy', DIST['fresh'])
c = sqlite3.connect(f'{D}/live.db')
V = {r[0]: dict(id=r[0], name=r[1], cx=r[2], cy=r[3], pop=r[4]) for r in c.execute('select id,name,cx,cy,population from villages')}
ids = sorted(V)
for i, vid in enumerate(ids):
    h = (i * 0.618034) % 1
    V[vid]['col'] = tuple(int(255 * x) for x in colorsys.hsv_to_rgb(h, 0.75, 0.95))
terr = np.zeros((NY, NX), np.int16)  # village id(마지막 것) · 겹침은 따로
over = np.zeros((NY, NX), np.uint8)
layers = {}
for t in ('terr', 'yard', 'plaza', 'garden', 'dryfield', 'farmland', 'nongzone', 'ditch', 'house', 'housesite', 'granary', 'hall', 'shelter'):
    rows = np.array(c.execute('select village_id,cx,cy from village_buildings where type=?', (t,)).fetchall(), dtype=np.int64).reshape(-1, 3)
    m = (rows[:, 1] >= 0) & (rows[:, 1] < NX) & (rows[:, 2] >= 0) & (rows[:, 2] < NY); rows = rows[m]
    layers[t] = rows
tr = layers['terr']
np.add.at(over, (tr[:, 2], tr[:, 1]), 1)   # ★중복 셀을 세려면 add.at(팬시 += 는 겹친 칸을 한 번만 센다)
terr[tr[:, 2], tr[:, 1]] = tr[:, 0]
# 플레이어·NPC 짓는 집(벽·바닥 · px)
B = np.array(c.execute("select x,y,type from buildings where type in ('floor','wall')").fetchall(), dtype=object).reshape(-1, 3)
bx = (B[:, 0].astype(float) // 32).astype(int); by = (B[:, 1].astype(float) // 32).astype(int); btype = B[:, 2]
# 길
R = np.array(c.execute("select cell_key, v from roads where zone='hanbando'").fetchall(), dtype=np.float64).reshape(-1, 2)
if not len(R): R = np.array(c.execute("select cell_key, v from roads").fetchall(), dtype=np.float64).reshape(-1, 2)
rk = R[:, 0].astype(np.int64); rv = R[:, 1]; ry, rx = rk // NX, rk % NX
road = np.zeros((NY, NX), np.uint8)
ok = (ry < NY) & (rx < NX)
road[ry[ok], rx[ok]] = np.where(rv[ok] >= 28, 2, np.where(rv[ok] >= 8, 1, 0))
np.save(f'{D}/terr.npy', terr); np.save(f'{D}/road.npy', road)
# ── 색칠(셀 1:1)
img = np.zeros((NY, NX, 3), np.uint8)
img[:] = (226, 216, 186)                              # 뭍
img[forest == 1] = (150, 178, 120)                    # 숲
img[kind == 4] = (140, 128, 112)                      # 바위(산)
img[(ore == 1) & (kind != 4)] = (196, 150, 90)        # 광맥(뭍)
img[kind == 3] = (70, 140, 210)                       # 민물
img[kind == 2] = (34, 60, 96)                         # 바다 띠
# 영토 — 마을 색을 뭍 위에 45% 섞기
tm = terr > 0
cols = np.zeros((NY, NX, 3), np.float32)
for vid in ids:
    cols[terr == vid] = V[vid]['col']
img[tm] = (img[tm] * 0.55 + cols[tm] * 0.45).astype(np.uint8)
img[over >= 2] = (255, 40, 200)                       # 두 마을 이상이 가진 셀
def paint(t, col):
    r = layers[t]; img[r[:, 2], r[:, 1]] = col
paint('nongzone', (200, 210, 140)); paint('dryfield', (205, 180, 90)); paint('farmland', (120, 170, 60)); paint('garden', (170, 200, 90))
paint('yard', (235, 228, 210)); paint('plaza', (245, 240, 230)); paint('ditch', (90, 60, 40))
img[road == 1] = (190, 160, 120); img[road == 2] = (130, 95, 60)
inb = (bx >= 0) & (bx < NX) & (by >= 0) & (by < NY)
img[by[inb & (btype == 'floor')], bx[inb & (btype == 'floor')]] = (110, 70, 50)
img[by[inb & (btype == 'wall')], bx[inb & (btype == 'wall')]] = (40, 25, 20)
# 집(부지 중심) · 곳간 · 회관 — 점
def dots(t, col, r):
    for vid, x, y in layers[t]:
        img[max(0, y-r):y+r+1, max(0, x-r):x+r+1] = col
dots('house', (180, 30, 30), 1); dots('granary', (240, 200, 0), 2); dots('hall', (0, 0, 0), 3)
Image.fromarray(img).save(f'{D}/full_1to1.png')
# 전 맵 1/2
ov = Image.fromarray(img).resize((NX // 2, NY // 2), Image.BOX)
dr = ImageDraw.Draw(ov)
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
try: f = ImageFont.truetype(FONT, 14, index=1)
except Exception: f = ImageFont.load_default()
for vid in ids:
    v = V[vid]; dr.text((v['cx'] // 2 + 6, v['cy'] // 2 - 8), v['name'], fill=(0, 0, 0), font=f, stroke_width=2, stroke_fill=(255, 255, 255))
ov.save(f'{D}/overview.png')
# 표
stats = []
for vid in ids:
    v = V[vid]; m = terr == vid
    n = int((tr[:, 0] == vid).sum())
    ys, xs = np.nonzero(m)
    d = np.hypot(xs - v['cx'], ys - v['cy']) if len(xs) else np.array([0])
    hs = layers['house'][layers['house'][:, 0] == vid]
    hd = np.hypot(hs[:, 1] - v['cx'], hs[:, 2] - v['cy']) if len(hs) else np.array([0])
    fields = sum(int((layers[t][:, 0] == vid).sum()) for t in ('farmland', 'dryfield', 'garden'))
    fr = DIST['fresh'][m]; fr = fr[fr < 65535]
    stats.append(dict(id=vid, name=v['name'], pop=v['pop'], terr=n, r50=float(np.percentile(d, 50)), r95=float(np.percentile(d, 95)), rmax=float(d.max()),
                      houses=len(hs), house_r95=float(np.percentile(hd, 95)) if len(hs) else 0, house_rmax=float(hd.max()) if len(hs) else 0,
                      fields=fields, fresh_p50=int(np.median(fr)) if len(fr) else -1, fresh_center=int(DIST['fresh'][v['cy'], v['cx']])))
json.dump(dict(V={k: {kk: vv for kk, vv in v.items()} for k, v in V.items()}, stats=stats, over2=int((over >= 2).sum()),
               floors=int((btype == 'floor').sum()), walls=int((btype == 'wall').sum()), roads=[int((road == 1).sum()), int((road == 2).sum())]),
          open(f'{D}/stats.json', 'w'), ensure_ascii=False, indent=1)
print('ok', len(stats))
