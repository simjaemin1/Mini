#!/usr/bin/env python3
# (러너 밖 · T1178 그림 · 읽기만) — t1178-dryland.js 의 JSON 을 지도 PNG 셋으로.
#   쓰는 법: python3 scripts/t1178-draw.py <dryland.json> <out_dir>
#   ① 판 다섯 나란히 — 지금 · ⓑ 들판 · ⓐ′(α 0.5) · ⓒ′(α 0.5 + 들판) · ⓒ — 칸마다 20명을 먹이는 축(T1153 색) · 빈 땅 빨강
#   ② ⓒ 판에서 칸마다 고른 작물(벼 · 보리 · 밀 · 조 · 기장 · 수수 · 피 · 콩 · 팥)
#   ③ 자리 — 지금(흰 점) · 규칙 ⓒ(노란 네모) · 규칙 ⓒ′(하늘 세모)
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
d = json.load(open(src))
Z = d['zone']; G = d['grid']; W = d['cells']['W']; H = d['cells']['H']
S = 4
gw, gh = (W + G - 1) // G, (H + G - 1) // G
AXL = {'a': 'farm', 'h': 'hunt', 'w': 'wood', 'f': 'fish', 'm': 'mine'}
COL = {'farm': (150, 200, 80), 'hunt': (200, 130, 60), 'wood': (30, 110, 50), 'fish': (60, 130, 220), 'mine': (150, 90, 190)}
PRI = ['farm', 'fish', 'hunt', 'wood', 'mine']
FONT = None
for f in ['/System/Library/Fonts/AppleSDGothicNeo.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc']:
    try: FONT = ImageFont.truetype(f, 12); break
    except Exception: pass
FONT = FONT or ImageFont.load_default()
PLAN_IDS = [p['id'] for p in d['plans']]
PL = {p['id']: p for p in d['plans']}
PS = d['planStats']

def cellxy(cx, cy, ox=0):
    return ox + (cx // G) * S, 34 + (cy // G) * S

def axis_col(code):
    on = [AXL[ch] for ch in code if ch in AXL]
    if not on: return (220, 40, 40)
    a = next(a for a in PRI if a in on); col = COL[a]
    return tuple(min(255, int(v * 1.25 + 20)) for v in col) if len(on) >= 2 else col

def legend(dr, items, y):
    x = 6
    for lab, c in items:
        dr.rectangle([x, y, x + 10, y + 10], fill=c); dr.text((x + 14, y - 3), lab, fill=(230, 230, 230), font=FONT); x += 14 + int(dr.textlength(lab, font=FONT)) + 12

def live_dots(dr, ox, color=(255, 255, 255)):
    for s in d['sites']:
        if not s['seeded']: continue
        x, y = cellxy(s['cx'], s['cy'], ox); x += S // 2; y += S // 2
        dr.ellipse([x - 2, y - 2, x + 2, y + 2], fill=color, outline=(0, 0, 0))

# ① 판 넷
show = ['base', 'B', 'AH', 'CH', 'C']
pw = gw * S + 10
im = Image.new('RGB', (pw * len(show), gh * S + 34 + 40), (20, 20, 24)); dr = ImageDraw.Draw(im)
for j, pid in enumerate(show):
    k = PLAN_IDS.index(pid); ox = j * pw
    for c in d['cellsOut']:
        x, y = cellxy(c[0], c[1], ox)
        if c[2] == 'w': col = (25, 35, 80)
        elif c[2] == 'r': col = (90, 90, 90)
        else: col = axis_col(c[2].split(',')[k])
        dr.rectangle([x, y, x + S - 1, y + S - 1], fill=col)
    live_dots(dr, ox)
    dr.text((ox + 4, 2), PL[pid]['label'], fill=(255, 255, 255), font=FONT)
    dr.text((ox + 4, 17), f"빈 땅 {PS[pid]['empty20'] * 100:.1f}%", fill=(255, 120, 120), font=FONT)
legend(dr, [('농사', COL['farm']), ('고기잡이', COL['fish']), ('사냥', COL['hunt']), ('숲(교역)', COL['wood']), ('광업(교역)', COL['mine']), ('빈 땅', (220, 40, 40)), ('흰 점 = 지금 마을', (255, 255, 255))], gh * S + 44)
im.save(os.path.join(out, f'{Z}_1_판다섯.png'))

# ② ⓒ 작물
CC = {'rice': (70, 140, 230), 'barley': (230, 210, 80), 'wheat': (240, 170, 60), 'foxtail_millet': (230, 120, 40), 'millet': (200, 90, 40), 'sorghum': (180, 60, 60),
      'barnyard_millet': (150, 150, 110), 'soybean': (90, 190, 90), 'azuki': (170, 70, 120)}
KO = {c['id']: c['ko'] for c in d['crops']}
im = Image.new('RGB', (gw * S + 10, gh * S + 34 + 56), (20, 20, 24)); dr = ImageDraw.Draw(im)
for c in d['cellsOut']:
    x, y = cellxy(c[0], c[1])
    col = (25, 35, 80) if c[2] == 'w' else (90, 90, 90) if c[2] == 'r' else CC.get(c[3], (255, 0, 255))
    dr.rectangle([x, y, x + S - 1, y + S - 1], fill=col)
live_dots(dr, 0)
dr.text((4, 2), f"{d['displayName']} · ⓒ 칸마다", fill=(255, 255, 255), font=FONT)
dr.text((4, 17), "농사 값이 가장 큰 작물", fill=(255, 255, 255), font=FONT)
used = [k for k in CC if any(len(c) > 3 and c[3] == k for c in d['cellsOut'])]
legend(dr, [(KO[k], CC[k]) for k in used], gh * S + 44)
im.save(os.path.join(out, f'{Z}_2_작물.png'))

# ③ 자리
im = Image.new('RGB', (gw * S + 10, gh * S + 34 + 40), (20, 20, 24)); dr = ImageDraw.Draw(im)
k = PLAN_IDS.index('C')
for c in d['cellsOut']:
    x, y = cellxy(c[0], c[1])
    col = (25, 35, 80) if c[2] == 'w' else (90, 90, 90) if c[2] == 'r' else ((60, 60, 66) if c[2].split(',')[k] != '-' else (110, 40, 40))
    dr.rectangle([x, y, x + S - 1, y + S - 1], fill=col)
live_dots(dr, 0)
for rid, colr, shape in [('C', (255, 210, 0), 'sq'), ('CH', (120, 220, 255), 'tri')]:
    r = d['rules'].get(rid)
    if not r: continue
    for p in r['pts']:
        x, y = cellxy(p['cx'], p['cy']); x += S // 2; y += S // 2
        if shape == 'sq': dr.rectangle([x - 3, y - 3, x + 3, y + 3], fill=colr, outline=(0, 0, 0))
        else: dr.polygon([(x, y - 4), (x - 4, y + 3), (x + 4, y + 3)], fill=colr, outline=(0, 0, 0))
rc, rh = d['rules']['C'], d['rules'].get('CH')
dr.text((4, 2), f"{d['displayName']} · 규칙 ⓒ 간격 {rc['gapCells']}셀 · 변동계수 {rc['nb']['nn']['cv']}", fill=(255, 255, 255), font=FONT)
if rh: dr.text((4, 17), f"규칙 ⓒ′ 간격 {rh['gapCells']}셀 · 변동계수 {rh['nb']['nn']['cv']}", fill=(160, 230, 255), font=FONT)
legend(dr, [('지금 마을', (255, 255, 255)), ('규칙 ⓒ', (255, 210, 0)), ('규칙 ⓒ′(α 0.5)', (120, 220, 255)), ('ⓒ 빈 땅', (110, 40, 40))], gh * S + 44)
im.save(os.path.join(out, f'{Z}_3_자리규칙.png'))
print('ok', Z)
