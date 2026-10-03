#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 ③ⓑ 후보 그림 · 판정 0)
# 닛폰 마을 후보 30(옛 16 · 새 14) · 다리 · 계곡(협곡/고개)을 T524 자 바탕 위에 찍는다 — 재민 승인용 그림.
# 쓰는 법: python3 scripts/t550-cands-png.py <T524 닛폰 디렉터리> <후보 표 *_villages.json> <이름 표 names.json> <그림.png>
import json, re, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
TD, VT, NT, OUT = sys.argv[1:5]
ROOT = __file__.rsplit('/scripts/', 1)[0]
J = json.load(open(f'{TD}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
cb = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
W = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))['nippon']
src = open(f'{ROOT}/server/zone-config.js', encoding='utf-8').read()
br = json.loads(re.search(r"\n  nippon: \{[\s\S]*?\n    bridges: (\[[^\]]*\])", src).group(1))
K = 3; h, w = NY // K, NX // K
k = kind[:h * K:K, :w * K:K]; c = cb[:h * K:K, :w * K:K]
img = np.zeros((h, w, 3), np.uint8)
img[:] = (225, 216, 190)
img[k == 2] = (35, 50, 75); img[k == 3] = (70, 120, 200); img[k == 4] = (125, 110, 95)
img[(k == 1) & (c != J['main'])] = (235, 150, 60)
S = 1                     # 그림 1px = K 셀
im = Image.fromarray(img).resize((w * 2, h * 2), Image.NEAREST); S = 2
d = ImageDraw.Draw(im)
try: F = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc', 15); FB = ImageFont.truetype('/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc', 22)
except Exception:
    import glob; f = (glob.glob('/usr/share/fonts/**/*CJK*', recursive=True) + glob.glob('/usr/share/fonts/**/*Nanum*', recursive=True))[0]; F = ImageFont.truetype(f, 15); FB = ImageFont.truetype(f, 22)
P = lambda x, y: (x / 32 / K * S, y / 32 / K * S)
for v in W.get('valleys', []):
    col = (255, 240, 120) if '협곡' in v['name'] else (250, 250, 250)
    pts = [P(*p['pos']) for p in v['path']]
    d.line(pts, fill=col, width=4 if '협곡' in v['name'] else 3)
for i in range(0, len(br), 2):
    x, y = br[i] / K * S, br[i + 1] / K * S; d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=(220, 30, 30))
VTb = json.load(open(VT, encoding='utf-8')); NM = {r['from']: r['to'] for r in json.load(open(NT, encoding='utf-8'))['villages']}
newset = {NM.get(r['name'], r['name']) for r in VTb['rows'] if r['kind'] == '새'}
moved = {NM.get(r['name'], r['name']) for r in VTb['rows'] if '옮김' in r['kind']}
TC = {'mining': (150, 60, 160), 'riverside': (20, 110, 190), 'forest': (30, 130, 50), 'plain': (200, 140, 30), None: (90, 90, 90)}
for v in W['villages']:
    x, y = P(v['x'], v['y']); new = v['name'] in newset; r = 9 if new else 7
    d.ellipse([x - r, y - r, x + r, y + r], fill=TC.get(v.get('type')) if new else (255, 255, 255), outline=(0, 0, 0), width=2)
    lab = v['name'] + (' (옮김)' if v['name'] in moved else '')
    d.text((x + 11, y - 9), lab, font=F, fill=(0, 0, 0), stroke_width=3, stroke_fill=(255, 255, 255))
H = 64; canvas = Image.new('RGB', (im.width, im.height + H), (250, 250, 248)); canvas.paste(im, (0, H)); dc = ImageDraw.Draw(canvas)
m = VTb['meta']
dc.text((10, 4), f"T550 ③ⓑ 닛폰 마을 후보 {len(W['villages'])} (옛 {m['old']} · 새 {m['added']}) · 다리 {len(br)//2}셀 · 계곡 {len(W.get('valleys', []))}", font=FB, fill=(0, 0, 0))
dc.text((10, 36), f"흰 원 = 옛 · 색 원 = 새(보라 광산 · 파랑 어촌 · 초록 임업 · 주황 농촌) · 빨강 = 다리 · 노랑 선 = 협곡 · 흰 선 = 고개 계곡 · 주황 땅 = 본토 밖 · 간격 ≥ {m['sep']}px(한반도 p80)", font=F, fill=(40, 40, 40))
canvas.save(OUT); print(OUT, canvas.size)
