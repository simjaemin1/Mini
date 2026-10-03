#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T591 ⑥ 그림 · 판정 0)
# 같은 축척으로 나란히: 한반도 · 닛폰(지금 5000 · 6000 · 7000 정본 · 7000 + 동쪽 안) · 베링(16000 · 17000). 바탕 = T524 자 셀 배열.
# 쓰는 법: python3 scripts/t591-png.py <out.png> <제목> <칸 정의 json>
#   칸 정의: [{"dir": T524 디렉터리, "zone": "nippon", "label": "…", "stats": "…"}, …] 의 두 줄(위 · 아래)
import json, sys, glob, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT, TITLE, DEF = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3], encoding='utf-8'))
S = 6   # 셀 → 픽셀 1/S
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 15); FS = ImageFont.truetype(fp, 12); FB = ImageFont.truetype(fp, 22)
def panel(d):
    J = json.load(open(f"{d['dir']}/{d['zone']}.json")); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
    K = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX); CB = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
    h, w = NY // S, NX // S
    blk = lambda m: m[:h * S, :w * S].reshape(h, S, w, S)
    anyof = lambda m: blk(m).any(axis=(1, 3)); frac = lambda m: blk(m).mean(axis=(1, 3))
    img = np.zeros((h, w, 3), np.uint8); img[:] = (226, 218, 192)
    img[frac(K == 2) > 0.5] = (35, 50, 75)
    img[frac((K == 1) & (CB != J['main'])) > 0.5] = (235, 150, 60)
    img[frac(K == 4) > 0.3] = (125, 110, 95)
    img[anyof(K == 3)] = (70, 120, 200)   # 가는 강도 보이게(블록 안에 민물 한 칸이라도)
    return Image.fromarray(img)
rows = []
for row in DEF:
    ims = [panel(d) for d in row]
    rows.append((row, ims))
PAD, TOP, LAB = 18, 50, 80
W = max(sum(im.width for im in ims) + PAD * (len(ims) + 1) for _, ims in rows)
H = TOP + sum(max(im.height for im in ims) + LAB + PAD for _, ims in rows)
cv = Image.new('RGB', (W, H), (250, 250, 248)); d = ImageDraw.Draw(cv)
d.text((PAD, 10), TITLE, font=FB, fill=(0, 0, 0))
y = TOP
for row, ims in rows:
    x = PAD
    for dd, im in zip(row, ims):
        d.text((x, y), dd['label'], font=F, fill=(0, 0, 0))
        for i, line in enumerate(dd.get('stats', '').split('\n')): d.text((x, y + 20 + i * 15), line, font=FS, fill=(40, 40, 40))
        cv.paste(im, (x, y + LAB)); d.rectangle([x - 1, y + LAB - 1, x + im.width, y + LAB + im.height], outline=(0, 0, 0))
        x += im.width + PAD
    y += max(im.height for im in ims) + LAB + PAD
d.text((PAD, H - 18), f'한 픽셀 = {S}셀 · 남색 = 해안 띠(바다) · 파랑 = 민물 · 갈색 = 바위 · 주황 = 본토 밖 뭍 · 바탕 = T524 자', font=FS, fill=(60, 60, 60))
cv.save(OUT); print(OUT, cv.size)
