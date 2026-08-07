#!/usr/bin/env python3
# =============================================================================
# 산 스프라이트 포장 — px/단위 균일화 + 투명 여백 잘라내기 + webp
#
# ★★근본 원인(실측): `bake-mountain.py` 는 `ortho_scale = dim*1.3` 으로 **메시 크기에 맞춰
#   카메라를 벌린다.** 해상도는 전부 같은데 담는 월드 폭이 다르니 **단위당 화소가 제각각**이 된다:
#
#       512 굽기 기준   mt_S1 ppu 60.9 · mt_M1 ppu 38.2 · mt_G0v0 ppu 24.5   (2.5배 차이)
#
#   화면이 요구하는 값은 `PPU_SCR = 64/√2 = 45.25` 곱하기 그 스프라이트가 그려지는 배율이다.
#   ⇒ **작은 봉우리는 처음부터 선명했고(60.9 > 45.25), 큰 산맥만 흐렸다(24.5).**
#     그런데 배치는 큰 산맥을 **제일 많이 확대**했다(밴드 폭 나누기 → 배율 중앙값 5.8).
#     해상도가 가장 부족한 놈을 가장 크게 늘린 것 — 벌이 두 번 겹쳤다.
#
#   그래서 여기서 **ppu 를 한 값으로 맞춘다.** 그러면 `sc` 가 비로소 순수한 디자인 손잡이가 된다
#   — 어느 스프라이트를 쓰든 같은 배율이면 같은 선명도.
#
# ★부수 이득 — 투명 여백: `pad=1.3` 정사각 프레임에서 **불투명 화소는 14%** 뿐이다.
#   나머지는 파일 용량이자 매 프레임 `drawImage` 가 훑는 화소다. 잘라내면 둘 다 준다.
#   클라는 `im.naturalWidth` 로 그리므로 **클라 코드 변경 0**, 앵커 ox/oy 만 옮기면 된다.
#
# 사용: python3 scripts/pack-mountain.py <입력> <출력> [목표ppu] [webp품질]
# =============================================================================
import json
import os
import sys

from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mt2048'
DST = sys.argv[2] if len(sys.argv) > 2 else '/tmp/mtpack'
TARGET_PPU = float(sys.argv[3]) if len(sys.argv) > 3 else 98.0
Q = int(sys.argv[4]) if len(sys.argv) > 4 else 92
MARGIN = 3
PPU_SCR = 64.0 / (2 ** 0.5)

os.makedirs(DST, exist_ok=True)
an = json.load(open(os.path.join(SRC, 'mountain_anchors.json')))
out = {}
tot_src = tot_dst = 0
worst = (0.0, '')
ups = []

for name, a in sorted(an.items()):
    p = os.path.join(SRC, name + '.png')
    if not os.path.exists(p):
        continue
    im = Image.open(p).convert('RGBA')
    tot_src += os.path.getsize(p)

    # ① px/단위 균일화 — 목표 ppu 로 재표본. 확대는 절대 안 한다(없는 정보는 못 만든다).
    k = TARGET_PPU / a['ppu']
    ups.append((round(k, 3), name))
    if k < 0.999:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
        ox, oy, ppu = a['ox'] * k, a['oy'] * k, TARGET_PPU
    else:
        ox, oy, ppu = a['ox'], a['oy'], a['ppu']          # 이미 목표보다 낮다 = 그대로 둔다

    # ② 불투명 상자로 자르기
    bb = im.getbbox()
    if bb is None:
        continue
    x0, y0 = max(0, bb[0] - MARGIN), max(0, bb[1] - MARGIN)
    x1, y1 = min(im.width, bb[2] + MARGIN), min(im.height, bb[3] + MARGIN)
    cr = im.crop((x0, y0, x1, y1))

    op = os.path.join(DST, name + '.webp')
    cr.save(op, quality=Q, method=6)
    tot_dst += os.path.getsize(op)

    # ③ 되읽어 화질 검증 — 눈이 아니라 수로. 불투명부만 잰다(투명부 차이는 안 보인다).
    rb = Image.open(op).convert('RGBA')
    sa, sb = cr.tobytes(), rb.tobytes()
    step = max(4, (len(sa) // 400000) * 4)
    d = n = 0
    for i in range(0, len(sa) - 3, step):
        if sa[i + 3] > 8:
            d += abs(sa[i] - sb[i]) + abs(sa[i + 1] - sb[i + 1]) + abs(sa[i + 2] - sb[i + 2])
            n += 1
    mad = d / (3 * n) if n else 0.0
    if mad > worst[0]:
        worst = (mad, name)

    out[name] = {'ox': round(ox - x0, 1), 'oy': round(oy - y0, 1), 'ppu': round(ppu, 2),
                 'w_units': a['w_units'], 'h_units': a['h_units'],
                 'w': cr.width, 'h': cr.height}

json.dump(out, open(os.path.join(DST, 'mountain_anchors.json'), 'w'), indent=1)
ppus = sorted(v['ppu'] for v in out.values())
areas = [v['w'] * v['h'] for v in out.values()]
print(f'{len(out)}종 · {tot_src/1e6:.1f}MB → {tot_dst/1e6:.2f}MB ({tot_dst/tot_src*100:.1f}%)')
print(f'  ppu {ppus[0]:.1f}~{ppus[-1]:.1f} (목표 {TARGET_PPU:.0f}) '
      f'→ 배율 {min(ppus)/PPU_SCR:.2f} 까지 확대 없음')
print(f'  평균 면적 {sum(areas)/len(areas)/1e6:.2f}MP · '
      f'최대 화소차 {worst[0]:.2f} [{worst[1]}]  ← 8 이하면 눈에 안 보인다')
