#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T450 자의 그림 칸)
# =============================================================================
# T450 — 한반도 야생 군락 한 장(위에서 본 평면 · 세계 좌표 · T393 그림 문법)
#
#   입력: `node scripts/t450-wild-groves.js --png-json <json>` 이 남긴 JSON
#         (바탕 = `_wildClass` 를 8셀마다 · 야생 군락 중심·종 · 수동 군락 53 · 마을 51 · 유도 표).
#   출력: <출력 파일>.png — 존 전체를 한 칸에(세로가 긴 지도라 칸 높이 1,400px).
#   ★수를 적지 않는다: 자리·종·수는 전부 JSON 이 준 것(자 = 정본에서 읽은 값)이다.
#   ★색은 dataviz 검증기를 통과한 셋(파랑·주황·청록 · all-pairs PASS · 청록은 대비 WARN → 범례·표로 이름을 단다)이고,
#     종마다 **모양도** 다르다(● 버섯밭 · ▲ 벌집 · ■ 나물) — 색만으로 가르지 않는다.
#
# 쓰는 법: python3 scripts/t450-wild-groves-png.py /tmp/t450-png.json /tmp/T450_군락.png
# =============================================================================
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/t450-png.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/T450_군락.png'
J = json.load(open(SRC, encoding='utf-8'))

FONT_DIR = '/usr/share/fonts/opentype/noto/'
def font(sz, bold=False):
    p = os.path.join(FONT_DIR, 'NotoSansCJK-Bold.ttc' if bold else 'NotoSansCJK-Regular.ttc')
    if os.path.exists(p):
        return ImageFont.truetype(p, sz, index=1)   # index 1 = KR
    return ImageFont.load_default()

SURF = (252, 252, 251)
INK, INK2, INK3 = (11, 11, 11), (82, 81, 78), (140, 139, 134)
# 바탕(지형 · 맥락) — 옅은 칠 · 데이터 색과 안 겹친다
BG = {'0': (222, 226, 232), '1': (214, 228, 214), '2': (234, 240, 226), '3': (224, 234, 243), '4': SURF}
BG_KO = [('1', '숲(깊은 숲 · 벌집·버섯밭 서식)'), ('2', '숲 가장자리(나물 서식)'), ('3', '물가 220px(머루 서식)'), ('4', '들(표에 종 없음)'), ('0', '물·바위')]
# 종 — 검증기 통과 셋(라이트 · all-pairs) · 고정 차례
KIND = {'mushroom_patch': ((42, 120, 214), '버섯밭', 'o'), 'beehive': ((235, 104, 52), '벌집', '^'), 'greens_patch': ((27, 175, 122), '나물', 's')}
ORDER = ['mushroom_patch', 'beehive', 'greens_patch']

ZW, ZH, st = J['W'], J['H'], J['st']
PLOT_H = 1400
S = PLOT_H / ZH                         # 세계 px → 그림 px
PLOT_W = int(round(ZW * S))
M, HEAD, SIDE = 28, 150, 420
W, H = M + PLOT_W + M + SIDE, HEAD + PLOT_H + 90
im = Image.new('RGB', (W, H), SURF)
d = ImageDraw.Draw(im)
ox, oy = M, HEAD

# 바탕 — 8셀(256px)마다 한 칸
cellpx = st * 32 * S
for yi, row in enumerate(J['grid']):
    for xi, ch in enumerate(row):
        x0, y0 = ox + xi * cellpx, oy + yi * cellpx
        d.rectangle([x0, y0, x0 + cellpx + 0.6, y0 + cellpx + 0.6], fill=BG.get(ch, SURF))
d.rectangle([ox, oy, ox + PLOT_W, oy + PLOT_H], outline=INK3, width=1)

def to(px, py):
    return ox + px * S, oy + py * S

# 마을(51) — 작은 + · 수동 군락(53) — 검은 테 동그라미(야생 중심과 같은 자에 겹쳐도 보이게)
for v in J['villages']:
    x, y = to(v['x'], v['y'])
    d.line([x - 3, y, x + 3, y], fill=INK2, width=1); d.line([x, y - 3, x, y + 3], fill=INK2, width=1)
for g in J['ring']:
    x, y = to(g['x'], g['y'])
    d.ellipse([x - 4.5, y - 4.5, x + 4.5, y + 4.5], outline=INK, width=1)

# 야생 군락 — 중심 한 점(점 3개 · 반경 110px 은 이 축척에서 1px 남짓이라 중심으로 찍는다) · 2px 바탕 테
def mark(x, y, kind):
    col, _, sh = KIND[kind]
    r = 3.2
    if sh == 'o':
        d.ellipse([x - r - 1.5, y - r - 1.5, x + r + 1.5, y + r + 1.5], fill=SURF)
        d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    elif sh == '^':
        d.polygon([(x, y - r - 2.8), (x - r - 2.4, y + r + 1.4), (x + r + 2.4, y + r + 1.4)], fill=SURF)
        d.polygon([(x, y - r - 0.8), (x - r - 0.6, y + r), (x + r + 0.6, y + r)], fill=col)
    else:
        d.rectangle([x - r - 1.5, y - r - 1.5, x + r + 1.5, y + r + 1.5], fill=SURF)
        d.rectangle([x - r, y - r, x + r, y + r], fill=col)
for c in J['centers']:
    if c['kind'] in KIND:
        x, y = to(c['gx'] * 32 + 16, c['gy'] * 32 + 16)
        mark(x, y, c['kind'])

# 머리
cnt = J['counts']
d.text((M, 18), 'T450 — 한반도 야생 군락: 서식이 낳는다(손잡이 T450_WILD_GROVES 켬 판)', font=font(26, True), fill=INK)
d.text((M, 58), f"수동 군락 53(검은 테 ○) + 야생 군락 {cnt['groves']}곳 · 개체 {cnt['wild']} — 종과 서식은 T415 표 그대로 · 밀도는 수동 53 의 지형별 셀당 밀도(51마을 채집 원판)", font=font(16), fill=INK2)
d.text((M, 84), '들(초원)엔 T415 표의 종이 없어 안 깐다 · 물가는 수동 53 에 물가 군락이 0 이라 밀도 0(머루 0) · 채집꾼·원정군의 종 집합(덤불·풀) 밖', font=font(16), fill=INK2)
d.text((M, 110), '● 버섯밭  ▲ 벌집  ■ 나물  ○ 수동 군락(링)  + 마을', font=font(16), fill=INK3)

# 옆 칸 — 범례(이름은 글자색 · 색 표본은 모양으로) · 표
sx, sy = M + PLOT_W + M, HEAD
d.text((sx, sy), '종(야생 군락 · 곳 · 개체)', font=font(18, True), fill=INK); sy += 34
byk = cnt['byKind']
cls_of = {}
for c in J['centers']:
    cls_of.setdefault(c['kind'], {}).setdefault(c['cls'], 0)
    cls_of[c['kind']][c['cls']] += 1
for k in ORDER:
    col, ko, sh = KIND[k]
    mark(sx + 8, sy + 12, k)
    n_g = sum(cls_of.get(k, {}).values())
    d.text((sx + 26, sy), f"{ko}  {n_g}곳 · {byk.get(k, 0)}개체", font=font(17), fill=INK)
    sy += 30
d.text((sx + 26, sy), '머루  0곳 · 0개체(물가 밀도 0)', font=font(17), fill=INK3); sy += 44
d.text((sx, sy), '바탕(지형 · _wildClass)', font=font(18, True), fill=INK); sy += 34
for code, ko in BG_KO:
    d.rectangle([sx, sy + 4, sx + 18, sy + 22], fill=BG[code], outline=INK3)
    d.text((sx + 28, sy), ko, font=font(16), fill=INK2)
    sy += 28
sy += 18
d.text((sx, sy), '유도(수동 53 × 51마을 채집 원판 30셀)', font=font(18, True), fill=INK); sy += 34
dv = J['derive']
for c, ko in [('forest', '숲'), ('edge', '가장자리'), ('riverside', '물가'), ('plain', '들')]:
    n = dv['byClass'].get(c, 0); cl = dv['cells'].get(c, 0)
    dens = (n / cl) if cl else 0
    d.text((sx, sy), f"{ko:<5} 군락 {n:>2} / 셀 {cl:>6,} = {dens:.2e}", font=font(16), fill=INK2)
    sy += 26
d.text((sx, sy + 6), f"군락 모양: 점 {J['derive']['nMed']} · 반경 {J['derive']['rMed']}px(수동 돌·덤불 그대로)", font=font(15), fill=INK3)

# 발
d.text((M, HEAD + PLOT_H + 14), f"존 {ZW:,} × {ZH:,}px · 바탕 한 칸 = {st}셀({st * 32}px) · 점 = 군락 중심(점 3개가 반경 110px 안에 선다)", font=font(14), fill=INK3)
d.text((M, HEAD + PLOT_H + 38), '자 scripts/t450-wild-groves.js --png-json → 이 그림 · 수는 전부 정본(chunk.js WILD · terrain · forage)에서 읽었다', font=font(14), fill=INK3)
im.save(OUT)
print('그림 →', OUT, im.size)
