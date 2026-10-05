#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T651 그림 · 판정 0) — 두 존 나란히(한반도 | 닛폰 · 세계 좌표 그대로 맞붙음)
#   바탕 = T524 칸 종류(뭍 · 민물 · 바위) · 해안 띠(서버 정본 마스크) · 띠에서 곧은 140셀(어장권) · 30셀(자염) 안 칠
#   마을 점 = econ 거리로 빨강(≤30) · 주황(≤140) · 회색(밖) · 테두리 검정 = 실걸음(4방 BFS)과 문턱이 갈린 마을
# 쓰는 법: python3 scripts/t651-coast-png.py <out.png> <T524 dir> <mask dir> <tab dir>
import json, sys, glob, numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont
OUT, AD, MD, TD = sys.argv[1:5]
S = 4
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 13); FS = ImageFont.truetype(fp, 10); FB = ImageFont.truetype(fp, 20)
panels = []
for z in ('hanbando', 'nippon'):
    J = json.load(open(f'{AD}/{z}.json')); N = J['N']; NY, NX = J['NY'], J['NX']
    K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(NY, NX)
    meta = json.load(open(f'{MD}/{z}.json')); M = (np.fromfile(f'{MD}/{z}.u8', np.uint8).reshape(meta['NY'], meta['NX']) > 0)[:NY, :NX]
    E = ndimage.distance_transform_edt(~M)
    h, w = NY // S, NX // S
    blk = lambda m: m[:h * S, :w * S].reshape(h, S, w, S).mean(axis=(1, 3))
    img = np.zeros((h, w, 3), np.uint8); img[:] = (236, 230, 212)
    img[blk(E <= 140) > 0.5] = (222, 236, 228); img[blk(E <= 30) > 0.5] = (200, 226, 214)
    img[blk(K == 4) > 0.3] = (190, 175, 160); img[blk((K == 3).astype(float)) > 0] = (150, 185, 230); img[blk(M) > 0.5] = (60, 80, 110)
    im = Image.fromarray(img).convert('RGBA'); d = ImageDraw.Draw(im)
    T = json.load(open(f'{TD}/tab_{z}.json', encoding='utf-8'))
    for r in T['rows']:
        x, y = r['cell'][0] / S, r['cell'][1] / S
        col = (215, 30, 30) if r['econ'] <= 30 else (240, 140, 0) if r['econ'] <= 140 else (120, 120, 120)
        flip = any((r['econ'] <= t) != (r['walk'] is not None and r['walk'] <= t) for t in (30, 140))
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=col, outline=(0, 0, 0) if flip else (255, 255, 255), width=3 if flip else 1)
        if r['econ'] <= 200 or flip:
            tx = x + 7 if x < w - 70 else x - 7 - d.textlength(r['name'], font=FS)   # 오른쪽 가장자리 마을은 왼쪽에 적는다
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): d.text((tx + dx, y - 6 + dy), r['name'], font=FS, fill=(255, 255, 255))
            d.text((tx, y - 6), r['name'], font=FS, fill=(20, 20, 20))
    panels.append((z, im, T['summary']))
PAD, TOP = 16, 96
Wt = sum(p[1].width for p in panels) + PAD * 2 + 230
cv = Image.new('RGB', (Wt, max(p[1].height for p in panels) + TOP + 40), (250, 250, 248)); dd = ImageDraw.Draw(cv)
dd.text((PAD, 8), 'T651 econ 바다 거리 vs 정본 해안 띠 — 한반도 | 닛폰(세계 좌표 그대로 맞붙음)', font=FB, fill=(0, 0, 0))
x = PAD
for z, im, sm in panels:
    dd.text((x, 40), f"{z} · econ ≤140셀 {sm['econ']['140']} · ≤30셀 {sm['econ']['30']} | 실걸음 {sm['walk']['140']} · {sm['walk']['30']}", font=F, fill=(30, 30, 30))
    cv.paste(im, (x, TOP)); dd.rectangle([x - 1, TOP - 1, x + im.width, TOP + im.height], outline=(0, 0, 0)); x += im.width
dd.text((PAD, TOP - 22), '↑ 북 = 베링(뭍 존) · 한반도 서 = 중원(뭍 존) · 둘 사이 = 존 경계(뭍) · 바다 존은 아래(동해 남 · 일본 태평양)와 닛폰 오른쪽(태평양)뿐', font=FS, fill=(90, 0, 120))
y = TOP; X = x + PAD
for col, s in (((60, 80, 110), '해안 띠(정본 마스크)'), ((200, 226, 214), '띠에서 30셀 안(자염)'), ((222, 236, 228), '띠에서 140셀 안(어장권)'), ((150, 185, 230), '민물'), ((190, 175, 160), '바위'),
               ((215, 30, 30), '마을 econ ≤30'), ((240, 140, 0), '마을 econ ≤140'), ((120, 120, 120), '마을 밖'), ((0, 0, 0), '검은 테 = 실걸음과 갈림')):
    dd.rectangle([X, y + 2, X + 14, y + 14], fill=col); dd.text((X + 20, y), s, font=FS, fill=(40, 40, 40)); y += 18
dd.text((PAD, cv.height - 24), f'한 픽셀 = {S}셀 · 마을 = 한반도 51(전수) · 닛폰 50(전수 · SEED_ALL — 실서버 게이트 판은 36)', font=FS, fill=(60, 60, 60))
cv.save(OUT); print(OUT, cv.size)
