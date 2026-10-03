#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T586 ④ 그림 · 판정 0)
# 닛폰 군락(종별) · 숲(자잘 = 긴 반경 ≤ 50셀 · 한반도 자잘 16 과 같은 자 / 큰 숲) · 마을 후보 30 · 자잘 광맥 임시 판(있으면 점)을 T524 바탕에 찍는다.
# 쓰는 법: python3 scripts/t586-png.py <T524 닛폰 디렉터리> <그림.png> [자잘 광맥 임시 정본.json]
import json, sys, glob, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
TD, OUT = sys.argv[1], sys.argv[2]
TMP = sys.argv[3] if len(sys.argv) > 3 else None
ROOT = __file__.rsplit('/scripts/', 1)[0]
J = json.load(open(f'{TD}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
W = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))['nippon']
K, S = 3, 2; h, w = NY // K, NX // K; k = kind[:h * K:K, :w * K:K]
img = np.zeros((h, w, 3), np.uint8); img[:] = (232, 226, 205)
img[k == 2] = (35, 50, 75); img[k == 3] = (90, 140, 210); img[k == 4] = (140, 128, 112)
im = Image.fromarray(img).resize((w * S, h * S), Image.NEAREST); d = ImageDraw.Draw(im, 'RGBA')
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 14); FS = ImageFont.truetype(fp, 13); FB = ImageFont.truetype(fp, 22)
P = lambda x, y: (x / 32 / K * S, y / 32 / K * S)
small = lambda f: max(f['rx'], f['ry']) / 32 <= 50
for f in W['forests']:
    (x, y), rx, ry = P(*f['center']), f['rx'] / 32 / K * S, f['ry'] / 32 / K * S
    d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(40, 150, 60, 150) if small(f) else (20, 90, 40, 90), outline=(0, 90, 20, 255) if small(f) else None, width=2)
if TMP:
    T = json.load(open(TMP, encoding='utf-8'))['nippon']
    for o in T['ores']:
        if not o.get('minor'): continue
        x, y = P(*o['center']); d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(150, 60, 170, 230))
GC = {'berry_bush': (220, 40, 60), 'water_pool': (0, 170, 230), 'rock': (90, 90, 90)}
for g in W.get('groves', []):
    x, y = P(*g['center']); r = 5
    d.ellipse([x - r, y - r, x + r, y + r], fill=GC.get(g['kind'], (0, 0, 0)), outline=(255, 255, 255), width=1)
for v in W['villages']:
    x, y = P(v['x'], v['y']); r = 30 * 32 / 32 / K * S   # 채집 원판 반경 30셀
    d.ellipse([x - r, y - r, x + r, y + r], outline=(0, 0, 0, 200), width=1)
    d.rectangle([x - 3, y - 3, x + 3, y + 3], fill=(0, 0, 0))
    tx = x + 8 if x < im.width - 120 else x - 8 - d.textlength(v['name'], font=F)
    d.text((tx, y - 18), v['name'], font=F, fill=(0, 0, 0), stroke_width=3, stroke_fill=(255, 255, 255))
H = 92; cv = Image.new('RGB', (im.width, im.height + H), (250, 250, 248)); cv.paste(im, (0, H)); dc = ImageDraw.Draw(cv)
g = W.get('groves', []); from collections import Counter; gc = Counter(x['kind'] for x in g)
ns = sum(1 for f in W['forests'] if small(f))
dc.text((10, 4), f"T586 닛폰 군락 · 숲 — 군락 {len(g)} · 자잘 숲 {ns}/{len(W['forests'])}" + (" · 자잘 광맥 임시 판" if TMP else ''), font=FB, fill=(0, 0, 0))
dc.text((10, 36), f"군락 점: 빨강 덤불 {gc.get('berry_bush',0)} · 하늘 둠벙(샘) {gc.get('water_pool',0)} · 회색 자갈밭 {gc.get('rock',0)} · 검은 고리 = 마을 채집 원판(반경 30셀 = 걸음 15초)", font=FS, fill=(30, 30, 30))
dc.text((10, 58), "숲: 진한 테두리 연두 = 자잘(긴 반경 ≤ 50셀 · 한반도 자잘 16 과 같은 자) · 짙은 초록 = 큰 숲" + (" · 보라 점 = 자잘 광맥(임시 · 정본 아님)" if TMP else ''), font=FS, fill=(30, 30, 30))
cv.save(OUT); print(OUT, cv.size)
