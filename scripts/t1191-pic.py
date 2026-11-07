#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T1191 그림 칸 · 관찰기 JSON 만 읽는다)
# =============================================================================
# T1191 — 시범 마을 환호를 위에서 본 그림. `t1191-ditch-observe.js` 가 찍은 칸 글자 지도를 PNG 로 굽는다.
#   ① 시간 그림: 한 장 = 마을 하나 · 행 = 시드 · 열 = 찍은 날 — 영토 · 도랑(제 영토 안 · 영토 밖 · 남의 영토) · 그날 집을 다 품는 고리 · 집
#   ② 꼴 그림: 한 장 = 마을 하나 · 한 날 한 시드 · 열 = ㄷ(지금 고리 + 영토 밖 칸 편입) · ㄹ(회관 + 곳간) · 섞기(+ 가까운 집 6/17)
# 쓰는 법:
#   python3 scripts/t1191-pic.py time <출력.png> <마을> <시드=판.t1191.json> …
#   python3 scripts/t1191-pic.py form <출력.png> <마을> <판.t1191.json> <날>
# =============================================================================
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
def font(sz):
    return ImageFont.truetype(FONT, sz, index=1) if os.path.exists(FONT) else ImageFont.load_default()
BG = (250, 250, 248)
C = {
    '.': (214, 222, 170), '#': (140, 140, 150), 't': (232, 214, 172), 'o': (205, 190, 225),
    'D': (92, 60, 36), 'X': (214, 40, 40), 'Y': (128, 40, 160),
    'c': (40, 110, 210), 'm': (30, 150, 90), 'n': (240, 150, 30),
    'h': (40, 40, 40), 'H': (0, 0, 0), 'g': (230, 190, 20),
}
K = 4
mode, out, vil = sys.argv[1], sys.argv[2], sys.argv[3]

def grid(o, keep):
    """칸 글자 → 색 (keep 에 없는 고리 글자는 영토 't' 로 본다 — 그 판의 고리만 보이게)"""
    rows = o['pic']['rows']
    return [[(ch if (ch not in 'cmn' or ch in keep) else 't') for ch in r] for r in rows]

def draw(img, d, g, x0, y0):
    for j, r in enumerate(g):
        for i, ch in enumerate(r):
            d.rectangle([x0 + i * K, y0 + j * K, x0 + i * K + K - 1, y0 + j * K + K - 1], fill=C.get(ch, (255, 0, 255)))

def legend(d, x, y, items):
    f = font(15)
    for ch, label in items:
        d.rectangle([x, y + 3, x + 14, y + 17], fill=C[ch]); d.text((x + 20, y), label, fill=(20, 20, 20), font=f); x += 30 + int(d.textlength(label, font=f))

if mode == 'time':
    cols = []
    for a in sys.argv[4:]:
        nm, f = a.split('=', 1)
        cols.append((nm, json.load(open(f))))
    days = sorted({s['day'] for _, doc in cols for s in doc['shots']})
    W = max(len(s['v'][vil]['pic']['rows'][0]) for _, doc in cols for s in doc['shots'] if vil in s['v'])
    Hh = max(len(s['v'][vil]['pic']['rows']) for _, doc in cols for s in doc['shots'] if vil in s['v'])
    cw, ch_ = W * K + 20, Hh * K + 70
    img = Image.new('RGB', (cw * len(days) + 90, ch_ * len(cols) + 110), BG); d = ImageDraw.Draw(img)
    d.text((10, 8), f'T1191 — {vil} 환호 · 영토 · 집 (행 = 시드 · 열 = 날)', fill=(0, 0, 0), font=font(22))
    legend(d, 10, 40, [('t', '영토'), ('D', '도랑(영토 안)'), ('X', '도랑(영토 밖)'), ('Y', '도랑(남의 영토)'), ('n', '그날 집을 다 품는 고리'), ('h', '집'), ('H', '회관'), ('g', '곳간'), ('o', '남의 영토'), ('#', '물 · 바위')])
    for r, (nm, doc) in enumerate(cols):
        y = 80 + r * ch_
        d.text((10, y + Hh * K // 2), f'시드 {nm}', fill=(0, 0, 0), font=font(18))
        for c, day in enumerate(days):
            x = 90 + c * cw
            sh = next((s for s in doc['shots'] if s['day'] == day), None)
            if not sh or vil not in sh['v']:
                d.text((x, y + 20), '찍음 없음', fill=(120, 0, 0), font=font(16)); continue
            o = sh['v'][vil]
            draw(img, d, grid(o, 'n'), x, y)
            n = o['ringNow']
            d.text((x, y + len(o['pic']['rows']) * K + 4), f"{day}날 · 영토 {o['terr']:,} · 도랑 {o['cells']} (밖 {o['out']} · 남 {o['other']}) · 집 {o['houses']} (고리 안 {o['H']['in']})", fill=(0, 0, 0), font=font(14))
            d.text((x, y + len(o['pic']['rows']) * K + 24), f"그날 다 품는 고리 {n['a']}×{n['b']} · {n['cells']}칸 (밖 {n['out']} · 남 {n['other']})", fill=(60, 60, 60), font=font(14))
    img.save(out)
else:
    doc = json.load(open(sys.argv[4])); day = int(sys.argv[5])
    sh = next(s for s in doc['shots'] if s['day'] == day)
    o = sh['v'][vil]; A = sh['alt'][vil]
    W, Hh = len(o['pic']['rows'][0]), len(o['pic']['rows'])
    cw = W * K + 24
    img = Image.new('RGB', (cw * 3 + 20, Hh * K + 170), BG); d = ImageDraw.Draw(img)
    d.text((10, 8), f'T1191 — {vil} 꼴 셋 ({day}날 · 같은 함수 `ditchRing` · 같은 축)', fill=(0, 0, 0), font=font(22))
    legend(d, 10, 40, [('t', '영토'), ('D', '도랑(영토 안)'), ('X', '영토 밖 → ㄷ 이면 편입'), ('Y', '남의 영토'), ('c', 'ㄹ 고리'), ('m', '섞기 고리'), ('h', '집'), ('H', '회관'), ('g', '곳간'), ('#', '물 · 바위')])
    same = A['core']['a'] == A['mix']['a'] and A['core']['b'] == A['mix']['b']
    panels = [('ㄷ 마을 전체(지금 판 고리)', '', f"도랑 {o['cells']}칸 · 영토 밖 {o['out']} · 남의 영토 {o['other']} · 집 {o['houses']} 중 고리 안 {o['H']['in']}"),
              ('ㄹ 회관 + 곳간', 'c', f"{A['core']['a']}×{A['core']['b']} · {A['core']['cells']}칸 · 영토 밖 {A['core']['out']} · 남 {A['core']['other']} · 고리 안 집 {A['core']['housesIn']}"),
              (f"섞기 + 가까운 집 {A['mix']['nMix']}채", 'cm' if same else 'm', f"{A['mix']['a']}×{A['mix']['b']} · {A['mix']['cells']}칸 · 영토 밖 {A['mix']['out']} · 남 {A['mix']['other']} · 고리 안 집 {A['mix']['housesIn']}")]
    # 대안 고리는 칸 글자가 겹쳐 가려지므로(우선순위) 같은 기하로 다시 그린다 — 중심 · 축(`frame`) · a · b · 폭 2 · 출입구 |pu| ≤ 1.5 · 물 · 바위 칸은 안 판다
    x0, y0 = o['pic']['x0'], o['pic']['y0']
    hx = hy = None
    for j, r in enumerate(o['pic']['rows']):
        i = r.find('H')
        if i >= 0: hx, hy = x0 + i, y0 + j
    U, V = o['frame']['u'], o['frame']['v']
    def ring(a, b):
        S = set(); ao, bo = a + 2, b + 2
        for j, r in enumerate(o['pic']['rows']):
            for i, ch in enumerate(r):
                dx, dy = x0 + i - hx, y0 + j - hy
                pu, pv = dx * U['x'] + dy * U['y'], dx * V['x'] + dy * V['y']
                if (pu / ao) ** 2 + (pv / bo) ** 2 > 1 or (pu / a) ** 2 + (pv / b) ** 2 < 1 or abs(pu) <= 1.5 or ch == '#': continue
                S.add((i, j))
        return S
    RS = [None, ring(A['core']['a'], A['core']['b']), ring(A['mix']['a'], A['mix']['b'])]
    for i, (t, keep, cap) in enumerate(panels):
        x = 10 + i * cw
        g = grid(o, '')
        if i > 0:
            g = [[{'D': 't', 'X': '.', 'Y': 'o'}.get(ch, ch) for ch in r] for r in g]   # 대안 판엔 지금 고리를 지운다
            for (ci, cj) in RS[i]:
                if g[cj][ci] not in 'hHg': g[cj][ci] = 'c' if i == 1 else 'm'
        d.text((x, 70), t, fill=(0, 0, 0), font=font(17))
        draw(img, d, g, x, 96)
        d.text((x, 96 + Hh * K + 6), cap, fill=(0, 0, 0), font=font(13))
    img.save(out)
print(out)
