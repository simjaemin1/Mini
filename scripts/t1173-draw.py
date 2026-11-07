#!/usr/bin/env python3
# (러너 밖 · T1173 그림 · 읽기만) — t1153-terrain-census.js 갈래 판 JSON 넷을 비옥도 지도 넷으로 나란히(전 → 후).
#   쓰는 법: python3 scripts/t1173-draw.py <out.png> <제목> <판1.json:이름> <판2.json:이름> ...
#   칸 색 = 그 칸에 마을이 선다면의 마을 비옥도(영토 평균 × 1.4 · 0.1 ~ 1.4 띠) · 물 남색 · 바위 회색 · 흰 점 = 지금 마을 · 빨간 테두리 = 그 판에서 생업 없는 칸
import json, sys
from PIL import Image, ImageDraw, ImageFont
out, title, *runs = sys.argv[1:]
S = 4
try: FONT = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', 12)
except Exception: FONT = ImageFont.load_default()
ds = [(json.load(open(r.split(':')[0])), r.split(':', 1)[1]) for r in runs]
G = ds[0][0]['grid']; W = ds[0][0]['cells']['W']; H = ds[0][0]['cells']['H']
gw, gh = (W + G - 1) // G, (H + G - 1) // G
pw = gw * S + 10
im = Image.new('RGB', (pw * len(ds), gh * S + 70), (20, 20, 24)); dr = ImageDraw.Draw(im)
def ramp(v):
    t = max(0.0, min(1.0, (v - 0.1) / 1.3))
    stops = [(0, (120, 60, 40)), (0.25, (200, 150, 70)), (0.5, (220, 220, 110)), (0.75, (120, 200, 90)), (1, (30, 130, 60))]
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b: u = (t - a) / (b - a); return tuple(int(ca[i] + (cb[i] - ca[i]) * u) for i in range(3))
    return stops[-1][1]
for k, (d, name) in enumerate(ds):
    ox = k * pw
    for c in d['cellsOut']:
        x = ox + (c[0] // G) * S; y = (c[1] // G) * S
        if c[2] == 'w': col = (25, 35, 80)
        elif c[2] == 'r': col = (90, 90, 90)
        else: col = ramp(c[4])
        dr.rectangle([x, y, x + S - 1, y + S - 1], fill=col)
        if c[2] not in ('w', 'r') and all(int(ch) == 0 for ch in c[2]): dr.rectangle([x, y, x + S - 1, y + S - 1], outline=(230, 40, 40))
    for s in d['sites']:
        if s['skip'] or not s['seeded']: continue
        x = ox + (s['cx'] // G) * S + S // 2; y = (s['cy'] // G) * S + S // 2
        dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(255, 255, 255), outline=(0, 0, 0))
    dr.text((ox + 4, gh * S + 4), f"{name} · 빈 땅 {d['empty']['n20']:.1%}", fill=(235, 235, 235), font=FONT)
x = 6; y = gh * S + 26
for v in (0.1, 0.4, 0.7, 1.0, 1.4):
    dr.rectangle([x, y, x + 12, y + 12], fill=ramp(v)); dr.text((x + 16, y - 2), f'{v}', fill=(220, 220, 220), font=FONT); x += 50
dr.rectangle([x, y, x + 12, y + 12], outline=(230, 40, 40)); dr.text((x + 16, y - 2), '생업 없음', fill=(220, 220, 220), font=FONT)
dr.text((6, gh * S + 48), title, fill=(200, 200, 200), font=FONT)
im.save(out); print('ok', out)
