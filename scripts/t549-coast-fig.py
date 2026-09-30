#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 ⓪-c 그림 · 판정 0)
# 해안선 띠 마스크 여럿(u8)을 같은 창(닛폰 동해안 한 토막 · 1셀 = 1픽셀 × 확대)으로 나란히 + `t549-coast-shape.py` 표.
# 쓰는 법: python3 scripts/t549-coast-fig.py <shape.json> <out.png> <창 y0> <창 y1> <창 x0> <이름=u8경로[@r]> ...
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
font = lambda sz, b=False: ImageFont.truetype(BOLD if b else FONT, sz, index=1)
S = json.load(open(sys.argv[1], encoding='utf-8')); OUT = sys.argv[2]
Y0, Y1, X0 = int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]); NY = 4063
# 모양 자의 smooth 를 그대로 쓴다(같은 원판 · 같은 식)
import scipy.ndimage as ndi
def open_(m, r):
    rho = r + 0.5; er = ndi.distance_transform_edt(m) > rho; return ndi.distance_transform_edt(~er) <= rho
def smooth(sea, r):
    s = open_(sea, r); return ~open_(~s, r)
panels = []
for a in sys.argv[6:]:
    name, rest = a.split('=', 1); r = None
    if '@' in rest: rest, r = rest.split('@'); r = int(r)
    raw = np.fromfile(rest, np.uint8); nx = raw.size // NY; sea = raw.reshape(NY, nx).astype(bool)
    if r: sea = smooth(sea, r)
    panels.append((name, sea[Y0:Y1, X0:nx]))
Z = 2; PW = max(p[1].shape[1] for p in panels) * Z; PH = (Y1 - Y0) * Z
W = 40 + len(panels) * (PW + 24); H = 90 + PH + 200
im = Image.new('RGB', (W, H), (250, 250, 248)); dr = ImageDraw.Draw(im)
dr.text((20, 12), f'닛폰 동해안 띠 모양 — 창 y {Y0}~{Y1}셀 · x {X0}셀~ (1셀 = {Z}px) · 폭 60,000', font=font(20, True), fill=(20, 20, 20))
dr.text((20, 42), '뭍 = 모래색 · 띠 바다 = 남색 · 1셀 돌기(뭍 3면 바다 = 빨강 · 바다 3면 뭍 = 노랑) · 자로만(정본 무변)', font=font(13), fill=(90, 90, 90))
for i, (name, sea) in enumerate(panels):
    x = 20 + i * (PW + 24); y = 80
    rgb = np.where(sea[..., None], np.array([35, 50, 80], np.uint8), np.array([222, 214, 186], np.uint8)).astype(np.uint8)
    P = np.pad(sea, 1, mode='edge'); n4 = P[:-2, 1:-1].astype(int) + P[2:, 1:-1] + P[1:-1, :-2] + P[1:-1, 2:]
    rgb[(~sea) & (n4 >= 3)] = (220, 30, 30); rgb[sea & (n4 <= 1)] = (250, 210, 0)
    tile = Image.fromarray(rgb).resize((sea.shape[1] * Z, sea.shape[0] * Z), Image.NEAREST)
    im.paste(tile, (x, y)); dr.rectangle([x - 1, y - 1, x + tile.width, y + tile.height], outline=(120, 120, 120))
    dr.text((x, y + PH + 6), name, font=font(15, True), fill=(20, 20, 20))
    m = S.get(name.split(' ')[0], S.get(name))
    if m:
        L = [f"띠 {m['bandPct']:.2f}% · 해안 {m['coast']:,}셀", f"1셀 돌기 {m['spikeLand']}+{m['spikeSea']} = {m['spikePer1k']}/1,000",
             f"D {m['D']} (잔 {m['Dsmall']} · 큰 {m['Dlarge']})", f"줄 점프 p95 {m['jumpE']['p95']} · ≥5셀 {m['jumpE']['ge5']}",
             '곶 r1/2/3/5/8: ' + '/'.join(str(m['capes'][str(k)] if str(k) in m['capes'] else m['capes'].get(k, 0)) for k in (1, 2, 3, 5, 8)),
             '만 r1/2/3/5/8: ' + '/'.join(str(m['bays'][str(k)] if str(k) in m['bays'] else m['bays'].get(k, 0)) for k in (1, 2, 3, 5, 8))]
        for j, t in enumerate(L): dr.text((x, y + PH + 30 + j * 19), t, font=font(12), fill=(50, 50, 50))
dr.text((20, H - 40), 'D = 박스 카운팅(상자 2~128셀) · 실제 해안 1.2~1.3(카드) · 곶/만 = 원판 열림 입도(반경 r 셀에서 떨어져 나간 조각 수) · T549 scripts/t549-coast-fig.py', font=font(12), fill=(110, 110, 110))
im.save(OUT); print(OUT, im.size)
