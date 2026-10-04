#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 ⓪ 갇힌 덩이 그림 · 판정 0 — 재민이 고칠 자리)
# T524 자 한 판에서 본토 밖 1,000셀 이상 덩이마다 확대 칸 + 존 전체 칸(덩이 자리 상자). 가르는 강 · 산맥 이름은 `t549-terrain-check` 표(cutters)에서.
# 쓰는 법: python3 scripts/t615-trap-png.py <out.png> <T524 dir> <지형 절 json> <terrain-check 표.json> [--skip <셀수,…>](지금 판에도 있던 덩이 · 바닷가 섬)
import json, sys, glob, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT, D, PL, CHK = sys.argv[1:5]
SKIP = set(int(x) for x in sys.argv[sys.argv.index('--skip') + 1].split(',')) if '--skip' in sys.argv else set()
SZ = 32
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 15); FS = ImageFont.truetype(fp, 12); FB = ImageFont.truetype(fp, 22)
J = json.load(open(f'{D}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
K = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX); CB = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
T = json.load(open(PL, encoding='utf-8'))
big = [c for c in J['compsB'] if c['cls'] != '본토' and c['area'] >= 1000 and c['area'] not in SKIP]
def colorize(k, cb, cid):
    img = np.zeros(k.shape + (3,), np.uint8); img[:] = (226, 218, 192)
    img[k == 2] = (35, 50, 75); img[k == 3] = (70, 120, 200); img[k == 4] = (125, 110, 95)
    img[(k == 1) & (cb != J['main'])] = (235, 150, 60)
    if cid is not None: img[cb == cid] = (230, 40, 40)
    return img
def text(d, xy, s, font, fill):
    x, y = xy
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): d.text((x + dx, y + dy), s, font=font, fill=(255, 255, 255))
    d.text((x, y), s, font=font, fill=fill)
panels = []
for c in big:
    pad = 90; x0, y0 = max(0, c['x0'] - pad), max(0, c['y0'] - pad); x1, y1 = min(NX, c['x1'] + pad + 1), min(NY, c['y1'] + pad + 1)
    S = max(2, int(560 / max(x1 - x0, y1 - y0)))
    im = Image.fromarray(colorize(K[y0:y1, x0:x1], CB[y0:y1, x0:x1], c['id'])).resize(((x1 - x0) * S, (y1 - y0) * S), Image.NEAREST)
    d = ImageDraw.Draw(im)
    def P(p): return ((p[0] / SZ - x0) * S, (p[1] / SZ - y0) * S)
    for kind, col in (('rivers', (20, 40, 160)), ('ridges', (80, 60, 40))):
        for f in T.get(kind, []):
            pts = [q['pos'] for q in f['path']]
            inside = [q for q in pts if x0 * SZ <= q[0] < x1 * SZ and y0 * SZ <= q[1] < y1 * SZ]
            if not inside: continue
            m = inside[len(inside) // 2]; text(d, (P(m)[0] + 4, P(m)[1] - 8), f['name'], F, col)
            for a in (pts[0], pts[-1]):
                if x0 * SZ <= a[0] < x1 * SZ and y0 * SZ <= a[1] < y1 * SZ:
                    w = (f['path'][0] if a is pts[0] else f['path'][-1])['width']
                    text(d, (P(a)[0] + 4, P(a)[1] + 4), f"{'첫' if a is pts[0] else '끝'} 폭 {w}", FS, col)
    panels.append((c, im, (x0, y0, x1, y1)))
# 존 전체 칸(1/6)
S6 = 6; h, w = NY // S6, NX // S6
blk = lambda m: m[:h * S6, :w * S6].reshape(h, S6, w, S6).mean(axis=(1, 3))
ov = np.zeros((h, w, 3), np.uint8); ov[:] = (226, 218, 192)
ov[blk(K == 2) > 0.5] = (35, 50, 75); ov[blk(K == 4) > 0.3] = (125, 110, 95); ov[blk((K == 3).astype(float)) > 0] = (70, 120, 200)
ovi = Image.fromarray(ov); od = ImageDraw.Draw(ovi)
x = 1250 / S6
for yy in range(0, h, 10): od.line([(x, yy), (x, yy + 5)], fill=(200, 0, 160), width=1)
for c, _, (x0, y0, x1, y1) in panels: od.rectangle([x0 / S6, y0 / S6, x1 / S6, y1 / S6], outline=(230, 40, 40), width=3)
chk = json.load(open(CHK, encoding='utf-8'))
cut = chk.get('cutters') or []
PAD, TOP = 18, 56
W = PAD * 3 + ovi.width + max(im.width for _, im, _ in panels) + 380; H = max(TOP + ovi.height, TOP + sum(im.height + 60 for _, im, _ in panels)) + 30
cv = Image.new('RGB', (W, H), (250, 250, 248)); d = ImageDraw.Draw(cv)
d.text((PAD, 12), f'닛폰 동쪽 재민 v2 — 갇힌 덩이 {len(panels)} (T615 ⓪ · 띠 b · 다리 416) — 여기서 멈춤', font=FB, fill=(0, 0, 0))
cv.paste(ovi, (PAD, TOP)); d.text((PAD, TOP + ovi.height + 4), '존 전체(1px = 6셀) · 점선 = 세계 x 520,000(동쪽)', font=FS, fill=(60, 60, 60))
y = TOP; X = PAD * 2 + ovi.width
for c, im, (x0, y0, x1, y1) in panels:
    d.text((X, y), f"덩이 {c['area']:,}셀 · 셀 x {c['x0']}~{c['x1']} · y {c['y0']}~{c['y1']} · 다리 {c['bridges']}", font=F, fill=(180, 20, 20))
    cv.paste(im, (X, y + 24)); d.rectangle([X - 1, y + 23, X + im.width, y + 24 + im.height], outline=(0, 0, 0)); y += im.height + 60
ty = TOP; TX = X + max(im.width for _, im, _ in panels) + PAD
d.text((TX, ty), '가르는 것(terrain-check 둘레 표)', font=F, fill=(0, 0, 0)); ty += 22
for r in cut:
    if r['area'] in SKIP: continue
    d.text((TX, ty), f"{r['tag']} {r['area']:,}셀 — 둘레 민물 " + ' · '.join(f'{k} {v}' for k, v in r['fresh'].items()) + f" · 바위 {r['rock']} · 바다 {r['sea']}", font=FS, fill=(120, 20, 20)); ty += 16
ty += 10
for col, s in (((230, 40, 40), '갇힌 덩이'), ((235, 150, 60), '다른 본토 밖 뭍'), ((70, 120, 200), '민물'), ((125, 110, 95), '바위'), ((35, 50, 75), '바다 띠')):
    d.rectangle([TX, ty + 2, TX + 14, ty + 14], fill=col); d.text((TX + 20, ty), s, font=FS, fill=(40, 40, 40)); ty += 18
cv.save(OUT); print(OUT, cv.size, len(panels))
