#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T610 ① 그림 · 판정 0 — 재민이 눈으로 고른다 · T595 그림 `t595-east-png.py` 와 같은 틀 · 칸 셋)
# 닛폰 동쪽 새 땅 — **지금**(정본) · **안**(T595 · `t591-east.py`) · **안2**(`t610-east2.py` · 갇힘 0) 나란히 · 띠 = `T588_COAST=b`.
#   바탕 = T524 자 셀 배열(띠 · 민물 · 바위 · 본토 밖 뭍). 위에 지형 칸(강 · 숲 · 호수 이름 · 마을 30)을 얹는다.
#   안 · 안2 칸에서는 **연장한 강 줄기만 빨강** · 옛 동쪽 끝(5000 = 1,562셀)은 점선 · 오른쪽 표 = 안2 줄기별 고른 안.
# 쓰는 법: python3 scripts/t610-east2-png.py <out.png> <지금 dir> <안 dir> <안2 dir> <안.json> <안_east.json> <안2.json> <안2_east2.json> <지금 sum> <안 sum> <안2 sum>
import json, sys, glob, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT, DNOW, DEAST, DE2, PLAN, EAST, PLAN2, EAST2 = sys.argv[1:9]
SUMS = sys.argv[9:12]
ROOT = __file__.rsplit('/scripts/', 1)[0]
S = 4; SZ = 32; OLD_EDGE = 49984 // SZ   # 폭 5000 판의 동쪽 끝(셀)
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 15); FS = ImageFont.truetype(fp, 11); FT = ImageFont.truetype(fp, 10); FB = ImageFont.truetype(fp, 22); FR = ImageFont.truetype(fp, 13)
NOW = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))['nippon']
ANP = json.load(open(PLAN, encoding='utf-8')); ANP2 = json.load(open(PLAN2, encoding='utf-8'))
ER1 = {r['name']: r for r in json.load(open(EAST, encoding='utf-8'))['rows']}
ER2 = {r['name']: r for r in json.load(open(EAST2, encoding='utf-8'))['rows'] if r.get('cells')}
ROWS2 = json.load(open(EAST2, encoding='utf-8'))['rows']

def base(d):
    J = json.load(open(f'{d}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
    K = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX); CB = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
    h, w = NY // S, NX // S
    blk = lambda m: m[:h * S, :w * S].reshape(h, S, w, S)
    frac = lambda m: blk(m).mean(axis=(1, 3)); anyof = lambda m: blk(m).any(axis=(1, 3))
    img = np.zeros((h, w, 3), np.uint8); img[:] = (226, 218, 192)
    img[frac(K == 2) > 0.5] = (35, 50, 75)
    img[frac((K == 1) & (CB != J['main'])) > 0.5] = (235, 150, 60)
    img[frac(K == 4) > 0.3] = (125, 110, 95)
    img[anyof(K == 3)] = (70, 120, 200)
    return Image.fromarray(img).convert('RGBA')

P = lambda xy: (xy[0] / SZ / S, xy[1] / SZ / S)
def overlay(im, T, EROWS):
    east = bool(EROWS)
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for f in T.get('forests', []):
        c = P(f['center']); rx = (f.get('rx') or 4000) / SZ / S; ry = (f.get('ry') or 3000) / SZ / S
        d.ellipse([c[0] - rx, c[1] - ry, c[0] + rx, c[1] + ry], fill=(60, 140, 60, 70), outline=(30, 100, 30, 200))
    if east:   # 연장 줄기(원 경로 뒤에 붙은 점들)만 빨강
        old = {g['name']: len(g['path']) for g in NOW['rivers']}
        for g in T['rivers']:
            if g['name'] not in EROWS: continue
            n0 = old[g['name']]; pts = g['path']
            seg = pts[n0 - 1:] if EROWS[g['name']]['frm'] == pts[n0 - 1]['pos'] else pts[:len(pts) - n0 + 1]
            w = max(2, round(seg[0]['width'] / SZ / S))
            d.line([P(p['pos']) for p in seg], fill=(220, 30, 30, 255), width=w)
    lab = ImageDraw.Draw(ov)
    def text(xy, s, font, fill):
        x, y = xy
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): lab.text((x + dx, y + dy), s, font=font, fill=(255, 255, 255, 220))
        lab.text((x, y), s, font=font, fill=fill)
    for f in T.get('forests', []):
        c = P(f['center']); text((c[0] - 12, c[1] - 6), f['name'], FT, (20, 80, 20, 255))
    for l in T.get('lakes', []):
        c = P(l['center']); text((c[0] - 10, c[1] - 6), l['name'], FT, (20, 50, 150, 255))
    for g in T['rivers']:
        pts = g['path']
        if len(pts) < 2: continue
        L = sum(math.hypot(b['pos'][0] - a['pos'][0], b['pos'][1] - a['pos'][1]) for a, b in zip(pts, pts[1:]))
        big = east and g['name'] in EROWS and EROWS[g['name']]['cells'] >= 10   # 1셀 합류는 표에만
        if L < 12000 and not big: continue   # 짧은 지류 이름은 생략(그림이 덮인다)
        if big:   # 연장 끝(새 바다 띠 · 합류점) 왼쪽 위에
            e = P(EROWS[g['name']]['to']); tw = lab.textlength(g['name'], font=FR)
            text((e[0] - tw - 4, e[1] - 18), g['name'], FR, (200, 20, 20, 255)); continue
        m = P(pts[len(pts) // 2]['pos'])
        text((m[0] + 3, m[1] - 7), g['name'], FS, (30, 60, 140, 255))
    for v in T.get('villages', []):
        c = (v['x'] / SZ / S, v['y'] / SZ / S)
        lab.ellipse([c[0] - 3, c[1] - 3, c[0] + 3, c[1] + 3], fill=(0, 0, 0, 255), outline=(255, 255, 255, 255))
        text((c[0] + 4, c[1] + 1), v['name'], FT, (0, 0, 0, 255))
    x = OLD_EDGE / S
    for y in range(0, im.size[1], 10): lab.line([(x, y), (x, y + 5)], fill=(200, 0, 160, 255), width=2)
    return Image.alpha_composite(im, ov).convert('RGB')

pan = [(overlay(base(DNOW), NOW, {}), '지금(정본 · 띠 b)'),
       (overlay(base(DEAST), ANP, ER1), f'안(T595 · 강 {len(ER1)}줄기 · {sum(r["cells"] for r in ER1.values()):,}셀)'),
       (overlay(base(DE2), ANP2, ER2), f'안2(갇힘 0 · {len(ER2)}줄기 · {sum(r["cells"] for r in ER2.values()):,}셀)')]
stats = ['', '', '']
if SUMS:
    for i, p in enumerate(SUMS):
        s = json.load(open(p))
        stats[i] = f"갇힌 {s['trapped']:.2f}% · 물 없는 {s['dry']:.1f}% · 사막 {s['desert']:.1f}% · 서나 {s['standable']}/{s['cands']}"
PAD, TOP, LAB = 18, 50, 46
W = sum(im.width for im, _ in pan) + PAD * 4 + 360; H = TOP + LAB + max(im.height for im, _ in pan) + 40
cv = Image.new('RGB', (W, H), (250, 250, 248)); d = ImageDraw.Draw(cv)
d.text((PAD, 10), '닛폰 동쪽 새 땅 — 지금 · 안 · 안2 (T610 ① · 띠 b · 재민 ○ 뒤에 적재)', font=FB, fill=(0, 0, 0))
x = PAD
for (im, t), st in zip(pan, stats):
    d.text((x, TOP), t, font=F, fill=(0, 0, 0)); d.text((x, TOP + 20), st[:110], font=FS, fill=(60, 60, 60))
    cv.paste(im, (x, TOP + LAB)); d.rectangle([x - 1, TOP + LAB - 1, x + im.width, TOP + LAB + im.height], outline=(0, 0, 0))
    x += im.width + PAD
# 오른쪽 표 — 연장한 강
y = TOP + LAB; d.text((x, y), '안2 — 줄기마다 고른 안(넓은 강 먼저)', font=F, fill=(0, 0, 0)); y += 22
for r in ROWS2:
    d.text((x, y), f"{r['name']}  {r['act']} · {r['cells']}셀 · 폭 {r['width']}", font=FS, fill=(160, 20, 20) if r['cells'] else (90, 90, 90)); y += 15
    if r.get('why'): d.text((x + 10, y), r['why'], font=FT, fill=(80, 80, 80)); y += 15
y += 12
for c, s in (((35, 50, 75), '바다 띠'), ((70, 120, 200), '민물(강 · 호수)'), ((125, 110, 95), '바위'), ((235, 150, 60), '본토 밖 뭍(갇힌)'),
             ((90, 160, 90), '숲(정본 칸)'), ((220, 30, 30), '안: 연장한 강'), ((200, 0, 160), '옛 동쪽 끝(폭 5000)'), ((0, 0, 0), '마을 후보 30')):
    d.rectangle([x, y + 2, x + 14, y + 14], fill=c); d.text((x + 20, y), s, font=FS, fill=(40, 40, 40)); y += 18
d.text((PAD, H - 22), f'한 픽셀 = {S}셀 · 바탕 = T524 자 · 숲 · 호수 · 짧은 강은 안이 안 그린다(재민 그림 몫) · 강 이름은 길이 12,000px 이상만', font=FS, fill=(60, 60, 60))
cv.save(OUT); print(OUT, cv.size)
