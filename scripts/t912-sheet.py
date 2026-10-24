#!/usr/bin/env python3
# === scripts/t912-sheet.py — T912 같은 자리 켬 · 끔 나란히 한 장(scripts/t912-shots.js 결과를 붙인다) · 계측 자 · 러너 밖 ==========
#   줄 = 자리(물가 마을 둘 · 산 둘) · 칸 = 크롬 끔 · 크롬 켬 · WebKit 끔 · WebKit 켬.
#   칸 그림 = 그 스크린샷 그대로(--scale 배로 줄임 · 기본 1 = 원본 화소) 를 가운데 기준 --crop W×H 로 자른 것(기본 = 자르지 않음).
#   줄 머리 = 자리 · 견줌 값(물 상자 화면 차 끔↔켬 · 끔↔끔둘째(바닥) · 산 청크 세그먼트 해시 같음/공통) — 값은 `<브라우저>-res.json` 그대로.
# 실행: python3 scripts/t912-sheet.py <shots 폴더> <나갈 그림> [--scale 0.5] [--crop 1100x720] [--note '아래 덧말']
import json, sys, os
from PIL import Image, ImageDraw, ImageFont

def opt(k, d):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d

SH, OUTF = sys.argv[1], sys.argv[2]
SCALE = float(opt('--scale', '1'))
CROP = opt('--crop', '')
NOTE = opt('--note', '')   # 아래쪽 한 줄 덧말(있으면)
BRS = [('chromium', '크롬'), ('webkit', 'WebKit')]
TAGS = [('off', '끔'), ('on', '켬')]

def font(sz, bold=False):
    p = '/usr/share/fonts/opentype/noto/NotoSansCJK-%s.ttc' % ('Bold' if bold else 'Regular')
    for i in range(10):   # KR 얼굴을 찾는다
        try:
            f = ImageFont.truetype(p, sz, index=i)
            if 'KR' in ' '.join(f.getname()): return f
        except Exception: break
    return ImageFont.truetype(p, sz)

res = {}
for b, _ in BRS:
    f = os.path.join(SH, b + '-res.json')
    if os.path.exists(f): res[b] = json.load(open(f))
spots = []
for b, _ in BRS:
    for s in (res.get(b) or {}).get('spots', []):
        if s['nm'] not in spots: spots.append(s['nm'])

def spot(b, nm):
    for s in (res.get(b) or {}).get('spots', []):
        if s['nm'] == nm: return s
    return None

def tile(path):
    im = Image.open(path).convert('RGB')
    if CROP:
        cw, ch = [int(x) for x in CROP.split('x')]
        cx, cy = im.width // 2, im.height // 2
        im = im.crop((max(0, cx - cw // 2), max(0, cy - ch // 2), min(im.width, cx - cw // 2 + cw), min(im.height, cy - ch // 2 + ch)))
    if SCALE != 1: im = im.resize((round(im.width * SCALE), round(im.height * SCALE)), Image.LANCZOS)
    return im

# 칸 크기 = 첫 그림 기준
first = None
for nm in spots:
    for b, _ in BRS:
        s = spot(b, nm)
        if s and not s.get('miss'):
            first = tile(s['shots'][0]['shot']); break
    if first: break
TW, TH = first.width, first.height
LW, HH, CAP, G, TOP = 300, 44, 26, 8, 92
F1, F2, F3 = font(30, True), font(19, True), font(16)
W = LW + len(BRS) * len(TAGS) * (TW + G) + G
H = TOP + HH + len(spots) * (TH + CAP + G) + G + 34 + (26 if NOTE else 0)
img = Image.new('RGB', (W, H), (250, 250, 248))
d = ImageDraw.Draw(img)
d.text((G + 4, 10), 'T912 — 같은 자리 끔 · 켬 나란히 (물 층 ½ T891_WATER_HALF · 산 띠 readPixels T898_MT_READPX — 두 칸을 같이 바꿈)', fill=(20, 20, 20), font=F1)
d.text((G + 4, 52), '끔 = 두 칸 false(종전 그림 길) · 켬 = 두 칸 true(T912 기본) · 끔 → 켬 → 끔(둘째) 차례로 · 바꿀 때마다 산 청크 캐시를 비우고 다 구운 뒤 본 캔버스 화소를 그대로 뜸(HUD 없음) · 물·바람 시각 고정 · 비 0 · 해 몫 한낮 · |Δ| = 화소 RGB 절대차 평균(0~255) · 바닥 = 끔 ↔ 끔(둘째)', fill=(70, 70, 70), font=F3)
x = LW + G
for b, bn in BRS:
    for t, tn in TAGS:
        col = (30, 90, 160) if t == 'on' else (90, 90, 90)
        d.rectangle([x, TOP, x + TW, TOP + HH - 6], fill=(232, 238, 246) if t == 'on' else (236, 236, 236))
        d.text((x + 10, TOP + 6), f'{bn} {tn}', fill=col, font=F2)
        x += TW + G
y = TOP + HH
for nm in spots:
    # 줄 머리
    lines = [nm + (' · 물가' if any((spot(b, nm) or {}).get('water') for b, _ in BRS) else ' · 산')]
    for b, bn in BRS:
        s = spot(b, nm)
        if not s or s.get('miss'): lines.append(f'{bn}: (없음)'); continue
        c = s.get('cmp', {})
        if s.get('water') and c.get('waterOffOn'):
            lines.append(f"{bn} 물 칸(화면 {c['waterOffOn'].get('pxPct')}%)")
            lines.append(f"   |Δ| 끔↔켬 {c['waterOffOn'].get('meanAbs')} · 바닥 {c['waterOffOff2'].get('meanAbs')}")
        m = c.get('mtOffOn') or {}
        lines.append(f"{bn} 산 청크 같음 {m.get('same')}/{m.get('common')}")
        lines.append(f"   화면 |Δ| 끔↔켬 {(c.get('scrOffOn') or {}).get('meanAbs')} · 바닥 {(c.get('scrOffOff2') or {}).get('meanAbs')}")
    ly = y + 4
    for i, ln in enumerate(lines):
        d.text((G + 4, ly), ln, fill=(20, 20, 20) if i == 0 else (60, 60, 60), font=F2 if i == 0 else F3); ly += 30 if i == 0 else 22
    x = LW + G
    for b, bn in BRS:
        s = spot(b, nm)
        for t, tn in TAGS:
            if s and not s.get('miss'):
                sh = [q for q in s['shots'] if q['tag'] == t][0]
                im = tile(sh['shot'])
                img.paste(im, (x, y))
                st = sh.get('st') or {}
                cap = f"물 GL {('×'.join(str(v) for v in st['wcv'])) if st.get('wcv') else '-'} · 구운 청크 {sh.get('baked')} · {round((sh.get('settleMs') or 0) / 1000)}초"
                d.text((x + 4, y + TH + 3), cap, fill=(80, 80, 80), font=F3)
            else:
                d.rectangle([x, y, x + TW, y + TH], outline=(180, 180, 180)); d.text((x + 10, y + 10), '(없음)', fill=(120, 120, 120), font=F2)
            x += TW + G
    y += TH + CAP + G
if NOTE: d.text((G + 4, H - 54), NOTE, fill=(60, 60, 60), font=F3)
ua = ' · '.join(f"{bn}: {((res.get(b) or {}).get('welcome') or {}).get('ua', '-')[:90]}" for b, bn in BRS)
d.text((G + 4, H - 28), f'scripts/t912-shots.js → scripts/t912-sheet.py · 칸 = 스크린샷 ×{SCALE}' + (f' · 가운데 {CROP}' if CROP else '') + ' · ' + ua, fill=(110, 110, 110), font=F3)
img.save(OUTF, optimize=True) if OUTF.lower().endswith('.png') else img.save(OUTF, quality=90, optimize=True)
print(OUTF, img.size, os.path.getsize(OUTF))
