#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 ① 그림 · 판정 0) — 닛폰 동쪽(셀 x ≥ 1,200) · 바탕 T524 자(더한 판) · 재민 줄 검정 · 더한 줄 빨강 · 마을 점
# 쓰는 법: python3 scripts/t615-png.py <out.png> <T524 dir> <안.json> <제목> [--tag _t615[,_t616]] [--stats "<줄>|<줄>"]
import json, sys, glob, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT, D, PL, TITLE = sys.argv[1:5]
TAGS = (sys.argv[sys.argv.index('--tag') + 1] if '--tag' in sys.argv else '_t615').split(',')
STATS = sys.argv[sys.argv.index('--stats') + 1].split('|') if '--stats' in sys.argv else []
SZ = 32; S = 2; XC0 = 1200
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 14); FS = ImageFont.truetype(fp, 11); FB = ImageFont.truetype(fp, 22)
J = json.load(open(f'{D}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']
K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(NY, NX)[:, XC0:]
h, w = NY // S, K.shape[1] // S
blk = lambda m: m[:h * S, :w * S].reshape(h, S, w, S).mean(axis=(1, 3))
img = np.zeros((h, w, 3), np.uint8); img[:] = (236, 230, 212)
img[blk(K == 2) > 0.5] = (60, 80, 110); img[blk(K == 4) > 0.3] = (190, 175, 160); img[blk((K == 3).astype(float)) > 0] = (150, 185, 230)
im = Image.fromarray(img).convert('RGBA'); ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
P = json.load(open(PL, encoding='utf-8'))
mine = lambda f: any(f.get(t) for t in TAGS)
jm = lambda f: '_jm' in f
Q = lambda p: ((p[0] / SZ - XC0) / S, p[1] / SZ / S)
def text(xy, s, font, fill):
    x, y = xy
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): d.text((x + dx, y + dy), s, font=font, fill=(255, 255, 255, 230))
    d.text((x, y), s, font=font, fill=fill)
def ell(f, col, wd):
    c = Q(f['center']); rx, ry = f['rx'] / SZ / S, f['ry'] / SZ / S
    d.ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], outline=col, width=wd)
BLK, RED = (20, 20, 20, 255), (215, 30, 30, 255)
for f in P['forests']:
    if jm(f): ell(f, BLK, 2)
    elif mine(f): ell(f, RED, 2)
for l in P['lakes']:
    if jm(l): c = Q(l['center']); r = l.get('radius', 600) / SZ / S; d.ellipse([c[0] - r, c[1] - r, c[0] + r, c[1] + r], outline=BLK, width=2)
for k in ('ridges', 'rivers', 'valleys'):
    for f in P.get(k, []):
        col = ((95, 75, 55, 255) if k == 'ridges' else BLK) if jm(f) else RED if mine(f) else None   # 재민 산맥은 검은 갈색(강과 가르려고)
        if not col: continue
        pts = [Q(p['pos']) for p in f['path']]
        if max(p[0] for p in pts) < 0: continue
        wd = max(2, round(f['path'][len(f['path']) // 2]['width'] / SZ / S)) if k != 'ridges' else 3
        if k == 'valleys': wd = max(4, wd)
        d.line(pts, fill=col, width=wd)
for k in ('rivers', 'valleys', 'forests'):
    for f in P.get(k, []):
        if not mine(f): continue
        m = Q(f['center']) if 'center' in f else Q(f['path'][len(f['path']) // 2]['pos'])
        text((m[0] + 5, m[1] - 6), f['name'], FS, RED)
for v in P.get('villages', []):
    c = Q((v['x'], v['y']))
    if c[0] < 0: continue
    col = RED if mine(v) else BLK
    d.ellipse([c[0] - 4, c[1] - 4, c[0] + 4, c[1] + 4], fill=col, outline=(255, 255, 255, 255)); text((c[0] + 6, c[1] - 4), v['name'], FS, col)
if '--bridges' in sys.argv:   # ★[T616] 다리 셀(flat [cx, cy, …]) — 옛 것 검정 · 새 것 빨강(`--bridges-old` 에 없는 것)
    nb = json.load(open(sys.argv[sys.argv.index('--bridges') + 1]))
    ob = json.load(open(sys.argv[sys.argv.index('--bridges-old') + 1])) if '--bridges-old' in sys.argv else []
    OB = {(ob[i], ob[i + 1]) for i in range(0, len(ob), 2)}
    for i in range(0, len(nb), 2):
        cx, cy = nb[i], nb[i + 1]
        if cx < XC0: continue
        q = ((cx - XC0) / S, cy / S); col = BLK if (cx, cy) in OB else (255, 120, 0, 255)
        d.rectangle([q[0] - 2, q[1] - 2, q[0] + 2, q[1] + 2], fill=col)
x0 = (1250 - XC0) / S
for yy in range(0, h, 10): d.line([(x0, yy), (x0, yy + 5)], fill=(200, 0, 160, 255), width=1)
im = Image.alpha_composite(im, ov).convert('RGB')
PAD, TOP = 18, 60 + 16 * len(STATS)
cv = Image.new('RGB', (im.width + PAD * 2 + 300, im.height + TOP + 30), (250, 250, 248)); dd = ImageDraw.Draw(cv)
dd.text((PAD, 10), TITLE, font=FB, fill=(0, 0, 0))
for i, s in enumerate(STATS): dd.text((PAD, 42 + 16 * i), s, font=FS, fill=(40, 40, 40))
cv.paste(im, (PAD, TOP)); dd.rectangle([PAD - 1, TOP - 1, PAD + im.width, TOP + im.height], outline=(0, 0, 0))
y = TOP; X = PAD * 2 + im.width
for col, s in (((20, 20, 20), '재민 줄(강 · 호수 · 숲)'), ((95, 75, 55), '재민 산맥'), ((215, 30, 30), '더한 것'), ((150, 185, 230), '민물'), ((190, 175, 160), '바위'), ((60, 80, 110), '바다 띠'), ((200, 0, 160), '세계 x 520,000'), ((255, 120, 0), '새 다리(있으면)')):
    dd.rectangle([X, y + 2, X + 14, y + 14], fill=col); dd.text((X + 20, y), s, font=FS, fill=(40, 40, 40)); y += 18
dd.text((PAD, TOP + im.height + 6), f'한 픽셀 = {S}셀 · 셀 x ≥ {XC0}', font=FS, fill=(60, 60, 60))
cv.save(OUT); print(OUT, cv.size)
