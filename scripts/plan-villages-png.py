#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T596 그림 · 판정 0) 계획기(`plan-villages-reset.js --raster`) 출력 → 존마다 옛/새 자리 그림
#   쓰는 법: python3 scripts/plan-villages-png.py <plan.json> <raster dir> <out dir>
#   그림: 뭍(옅은 흙) · 물(파랑) · 바위(회색) · 예상 최대 영토 원(=2 상한 · 옛 자리 = 붉은 점선 느낌의 얇은 원 · 새 자리 = 초록 원) · 옮긴 마을은 화살표와 이름
import json, sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont
plan = json.load(open(sys.argv[1])); RD = sys.argv[2]; OUT = sys.argv[3]
os.makedirs(OUT, exist_ok=True)
def font(sz):
    for f in ['/usr/share/fonts/truetype/nanum/NanumGothic.ttf', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc']:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
F, FS = font(14), font(11)
for zid, Z in plan['zones'].items():
    R = Z.get('raster')
    if not R: continue
    W, H, K = R['W'], R['H'], R['K']
    a = np.fromfile(os.path.join(RD, R['file']), np.uint8).reshape(H, W)
    S = 2 if max(W, H) < 700 else 1   # 작은 존은 두 배
    img = np.zeros((H, W, 3), np.uint8); img[:] = (236, 228, 205)
    img[a == 1] = (120, 165, 210); img[a == 2] = (150, 150, 150); img[a == 3] = (90, 90, 90)
    im = Image.fromarray(img).resize((W * S, H * S), Image.NEAREST); d = ImageDraw.Draw(im, 'RGBA')
    p = lambda c: (c['cx'] / K * S, c['cy'] / K * S)
    for r in Z['rows']:
        rr = r['r'] / K * S
        x0, y0 = p(r['from']); x1, y1 = p(r['to'])
        if r['moved'] > 0:
            d.ellipse([x0 - rr, y0 - rr, x0 + rr, y0 + rr], outline=(200, 40, 40, 200), width=1)
            d.line([x0, y0, x1, y1], fill=(200, 40, 40, 255), width=2)
            d.ellipse([x1 - rr, y1 - rr, x1 + rr, y1 + rr], outline=(20, 140, 40, 255), width=2, fill=(20, 140, 40, 30))
            d.ellipse([x1 - 3, y1 - 3, x1 + 3, y1 + 3], fill=(20, 140, 40, 255))
            d.text((x1 + 5, y1 - 7), f"{r['name']} {r['moved']:.0f}셀", fill=(10, 10, 10, 255), font=FS)
        else:
            d.ellipse([x0 - rr, y0 - rr, x0 + rr, y0 + rr], outline=(60, 60, 60, 160), width=1)
            d.ellipse([x0 - 2, y0 - 2, x0 + 2, y0 + 2], fill=(40, 40, 40, 255))
            d.text((x0 + 4, y0 - 6), r['name'], fill=(40, 40, 40, 220), font=FS)
    mv = [r for r in Z['rows'] if r['moved'] > 0]
    h1 = f"T596 {zid} — 후보 {Z['n']} · 예상 겹침 쌍 {len(Z['pairs0'])} → 남은 {len(Z['left'])} · 옮김 {len(mv)} · 최대 {max([r['moved'] for r in mv] or [0]):.0f}셀"
    h2 = "원 = 예상 최대 영토(T579 추신 =2 상한) · 붉은 = 옛 자리 · 초록 = 새 자리 · 검은 = 그대로"
    d.rectangle([0, 0, im.width, 38], fill=(255, 255, 255, 235)); d.text((6, 2), h1, fill=(0, 0, 0, 255), font=F); d.text((6, 20), h2, fill=(60, 60, 60, 255), font=FS)
    fn = os.path.join(OUT, f'T596_마을자리_{zid}.png'); im.save(fn); print(fn, im.size)
