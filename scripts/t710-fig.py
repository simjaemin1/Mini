#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T710 그림 · 판정 0) 차분(`t710-diff.js` JSON)을 옛 굽기 위에 칠한다 + 존 DB 사본의 마을 영토(회색) · 마을 가운데(점)
# 쓰는 법: python3 scripts/t710-fig.py <옛.t710r> <차분.json> <out.png> [--db <존 DB 사본>] [--crop x0,y0,x1,y1] [--scale 2]
import sys, json, gzip, struct, base64, sqlite3
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import glob
_fp = (glob.glob('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc') + glob.glob('/usr/share/fonts/**/*CJK*.tt[cf]', recursive=True) + [None])[0]
FONT = ImageFont.truetype(_fp, 12, index=1) if _fp else None   # index 1 = KR(없으면 기본 글꼴 — 한글이 안 나온다)
a = sys.argv[1:]
def opt(k, d=None):
    return a[a.index(k) + 1] if k in a else d
raw = gzip.open(a[0]).read(); n = struct.unpack('<I', raw[:4])[0]; meta = json.loads(raw[4:4 + n]); W, H = meta['W'], meta['H']
bits = np.frombuffer(raw[4 + n:4 + n + W * H], dtype=np.uint8).reshape(H, W)
D = json.load(open(a[1]))
crop = [int(v) for v in opt('--crop', '0,3550,2188,4063').split(',')]; sc = int(opt('--scale', '2'))
img = np.full((H, W, 3), (222, 214, 190), np.uint8)                     # 뭍
img[(bits & 4) > 0] = (150, 140, 128)                                    # 바위
img[(bits & 32) > 0] = (190, 205, 170)                                   # 숲
img[(bits & 3) > 0] = (120, 160, 200)                                    # 물(옛)
img[(bits & 8) > 0] = (110, 80, 50)                                      # 다리(옛)
db = opt('--db')
if db:
    c = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    for cx, cy in c.execute("SELECT cx, cy FROM village_buildings WHERE type='terr'"):
        if 0 <= cx < W and 0 <= cy < H: img[cy, cx] = (img[cy, cx] * 0.55 + np.array((90, 90, 90)) * 0.45).astype(np.uint8)
COL = {'뭍→강호수': (20, 60, 200), '뭍→바다': (0, 40, 140), '물→뭍': (230, 150, 40), '다리 빠짐': (220, 0, 0), '다리 생김': (0, 170, 0),
       '개울 생김': (0, 200, 220), '개울 빠짐': (240, 120, 200), '숲 생김': (40, 120, 40), '숲 빠짐': (200, 200, 120),
       '광맥 생김': (150, 40, 200), '광맥 빠짐': (90, 90, 90), '광맥 바뀜': (220, 60, 220), '바위 생김': (60, 50, 40), '바위 빠짐': (255, 255, 255)}
for k, col in COL.items():
    s = D['cells'].get(k)
    if not s: continue
    idx = np.frombuffer(base64.b64decode(s), dtype=np.uint32)
    ys, xs = idx // W, idx % W
    img[ys, xs] = col
x0, y0, x1, y1 = crop
im = Image.fromarray(img[y0:y1, x0:x1]).resize(((x1 - x0) // sc, (y1 - y0) // sc), Image.NEAREST)
dr = ImageDraw.Draw(im)
if db:
    for name, cx, cy in c.execute('SELECT name, cx, cy FROM villages'):
        if x0 <= cx < x1 and y0 <= cy < y1:
            px, py = (cx - x0) // sc, (cy - y0) // sc; dr.ellipse([px - 3, py - 3, px + 3, py + 3], outline=(0, 0, 0), width=2); dr.text((px + 5, py - 6), name, fill=(0, 0, 0), font=FONT)
for v in D.get('villageSites', []):
    for key, col in (('from', (200, 0, 0)), ('to', (0, 140, 0))):
        if v.get(key):
            cx, cy = v[key]
            if x0 <= cx < x1 and y0 <= cy < y1:
                px, py = (cx - x0) // sc, (cy - y0) // sc; dr.rectangle([px - 4, py - 4, px + 4, py + 4], outline=col, width=2); dr.text((px + 6, py + 2), f"{v['name']} {'옛' if key == 'from' else '새'}", fill=col, font=FONT)
y = 4
for k, col in COL.items():
    if D['summary'].get(k, {}).get('cells'):
        dr.rectangle([4, y, 14, y + 10], fill=col); dr.text((18, y - 1), f"{k} {D['summary'][k]['cells']}", fill=(0, 0, 0), font=FONT); y += 14
im.save(a[2]); print('→', a[2], im.size)
