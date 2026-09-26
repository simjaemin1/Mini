#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T393 자의 그림 칸)
# =============================================================================
# T393 — 도착 지점 시야 상자 한 장 그림(위에서 본 평면 · 세계 좌표)
#
#   입력: `scripts/t393-spawn-forest.js` 가 남긴 JSON(`T393_JSON`)의 `pics`(중앙값 · 최대 · 최소 셋).
#   출력: <출력 폴더>/T393_<tag>_<마을>.png — 3,000×3,000px(±1,500) 을 1/3 로 줄여 1,000px 칸에 찍는다.
#   ★수를 적지 않는다: 상자 반경·점 자리는 전부 JSON 이 준 것(자 = 정본에서 읽은 값)이다.
#   ★색은 dataviz 검증기로 통과한 셋(나무 aqua · 그루터기 orange · 도착/상자 blue · all-pairs PASS)만 쓴다.
#
# 쓰는 법: python3 scripts/t393-spawn-forest-png.py /tmp/t393.json /tmp/t393-png
# =============================================================================
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/t393.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/t393-png'
os.makedirs(OUT, exist_ok=True)
J = json.load(open(SRC, encoding='utf-8'))

FONT_DIR = '/usr/share/fonts/opentype/noto/'
def font(sz, bold=False):
    for f in (('NotoSansCJK-Bold.ttc' if bold else 'NotoSansCJK-Regular.ttc'),):
        p = os.path.join(FONT_DIR, f)
        if os.path.exists(p):
            return ImageFont.truetype(p, sz, index=1)   # index 1 = KR
    return ImageFont.load_default()

SURF = (252, 252, 251)
INK, INK2, INK3 = (11, 11, 11), (82, 81, 78), (140, 139, 134)
TREE, STUMP, MARK = (27, 175, 122), (235, 104, 52), (42, 120, 214)
WATER, ROCK, TERR = (217, 231, 245), (225, 223, 216), (238, 233, 221)

PLOT, M, HEAD, FOOT = 1000, 24, 128, 58
for P in J['pics']:
    R, RV = P['R'], P['Rv']
    S = PLOT / (2 * R)                              # 세계 px → 그림 px
    W, H = PLOT + 2 * M, HEAD + PLOT + FOOT
    im = Image.new('RGB', (W, H), SURF)
    d = ImageDraw.Draw(im)
    ox, oy = M, HEAD                                # 그림 칸 왼위 = 세계 (−R, −R)
    def to(px, py):
        return ox + (px + R) * S, oy + (py + R) * S
    # ★점과 칸은 **그림 칸 크기의 판**에 찍고 붙인다 — 테두리 밖으로 삐져나온 점을 자른다
    pl = Image.new('RGB', (PLOT, PLOT), SURF)
    dp = ImageDraw.Draw(pl)
    def tp(px, py):
        return (px + R) * S, (py + R) * S
    cell = 32 * S
    def cells(lst, col):
        for (px, py) in lst:
            x0, y0 = tp(px, py)
            dp.rectangle([x0, y0, x0 + cell, y0 + cell], fill=col)
    cells(P['terr'], TERR)
    cells(P['rock'], ROCK)
    cells(P['water'], WATER)
    # 그루터기(영토 안 · T378 개간) — 작은 점
    for (x, y, r) in P['stumps']:
        cx, cy = tp(x, y)
        rr = max(1.6, r * S * 0.6)
        dp.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=STUMP)
    # 서 있는 나무 — 수관 반경(r)을 그대로 줄여 찍는다(최소 2px)
    for (x, y, r) in P['trees']:
        cx, cy = tp(x, y)
        rr = max(2.0, r * S)
        dp.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=TREE)
    im.paste(pl, (ox, oy))
    # 상자 둘 — ±R(그림 테두리) · ±RV(지금 개체 컬링)
    d.rectangle([ox, oy, ox + PLOT, oy + PLOT], outline=MARK, width=2)
    a0, b0 = to(-RV, -RV); a1, b1 = to(RV, RV)
    dash = 10
    for k in range(int(a0), int(a1), dash * 2):
        d.line([k, b0, min(k + dash, a1), b0], fill=MARK, width=2); d.line([k, b1, min(k + dash, a1), b1], fill=MARK, width=2)
    for k in range(int(b0), int(b1), dash * 2):
        d.line([a0, k, a0, min(k + dash, b1)], fill=MARK, width=2); d.line([a1, k, a1, min(k + dash, b1)], fill=MARK, width=2)
    # 마을 중심(+) · 도착 지점(흰 테 파란 점)
    ccx, ccy = to(P['center'][0] - P['ax'], P['center'][1] - P['ay'])
    if ox <= ccx <= ox + PLOT and oy <= ccy <= oy + PLOT:
        d.line([ccx - 8, ccy, ccx + 8, ccy], fill=INK, width=2); d.line([ccx, ccy - 8, ccx, ccy + 8], fill=INK, width=2)
    sx, sy = to(0, 0)
    d.ellipse([sx - 9, sy - 9, sx + 9, sy + 9], fill=SURF)
    d.ellipse([sx - 6, sy - 6, sx + 6, sy + 6], fill=MARK)
    # 머리 — 제목 · 수 · 범례(글자는 잉크색 · 색 점은 옆에)
    tagko = {'median': '중앙값', 'max': '최대', 'min': '최소'}.get(P['tag'], P['tag'])
    c = P['counts']
    d.text((M, 14), f"T393 · {P['name']} 도착 지점 시야 — 50마을 중 {tagko}", font=font(26, True), fill=INK)
    d.text((M, 50), f"서 있는 나무  ±{R:,}: {c['standing']:,}그루   ±{RV:,}: {c['standingView']:,}그루   ·   영토 안 그루터기(T378 개간) {c['stump']:,}",
           font=font(18), fill=INK2)
    lx, ly = M, 88
    def leg(col, label, shape='dot'):
        nonlocal_lx = legx[0]
        if shape == 'dot':
            d.ellipse([nonlocal_lx, ly + 4, nonlocal_lx + 12, ly + 16], fill=col)
        elif shape == 'box':
            d.rectangle([nonlocal_lx, ly + 3, nonlocal_lx + 14, ly + 17], fill=col, outline=INK3)
        elif shape == 'dash':
            d.line([nonlocal_lx, ly + 10, nonlocal_lx + 16, ly + 10], fill=col, width=2)
        d.text((nonlocal_lx + 20, ly), label, font=font(16), fill=INK2)
        legx[0] = nonlocal_lx + 20 + d.textlength(label, font=font(16)) + 22
    legx = [lx]
    leg(TREE, '서 있는 나무')
    leg(STUMP, '그루터기')
    leg(MARK, '도착 지점')
    leg(MARK, f'지금 컬링 ±{RV}', 'dash')
    leg(TERR, '영토', 'box')
    leg(WATER, '물', 'box')
    leg(ROCK, '바위', 'box')
    # 발 — 무엇을 그렸나
    d.text((M, HEAD + PLOT + 12), f"위에서 본 평면(세계 좌표) · 테두리 = ±{R:,}px(T392 컬링 팔) · 1칸 32px · + = 마을 중심 · 화면은 2.5D 라 모양이 기울어 보인다",
           font=font(15), fill=INK3)
    d.text((M, HEAD + PLOT + 34), "나무 = chunk.generateChunkResources(T301 색인과 같은 답) − 벤 장부 · 영토·장부 = 부팅한 DB · 도착 지점 = onboarding.arrivalOf",
           font=font(15), fill=INK3)
    fn = os.path.join(OUT, f"T393_{P['tag']}_{P['name']}.png")
    im.save(fn)
    print(fn, im.size)
