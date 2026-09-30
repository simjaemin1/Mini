#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 그림 칸)
# =============================================================================
# T549 — 한 존의 가로막는 지형(강 · 호수 · 산맥 · 고개)을 **T524 성분 그림 위에** 겹쳐 그린다.
#   바탕 = T524 자 셀 배열(바다 · 민물 · 바위 · 본토 · 본토 밖 성분 · 물 없는 땅 분홍)
#   겹침 = 지형 절 json 의 선(강 중심선 · 하구 화살 · 산맥 중심선 · 고개 원 · 호수 원) + 이름
#   표시 = `t549-terrain-check.py` 의 ✗(막다른 하구 빨간 원 · 산맥 관통 빨간 점 · 갇힌 A~D · 물 없는 덩이 1~8)
#   오른쪽 칸 = 강 · 호수 · 산맥 표 + ✗ 목록 + 수(갇힌 % · 물 없는 % · 자원 사막 %).
# 쓰는 법: python3 scripts/t549-render.py <지형 json | -> <T524 디렉터리> <check.json> <그림.png> <제목> [tables.json]
# =============================================================================
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SZ = 32; K = 3
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
font = lambda sz, b=False: ImageFont.truetype(BOLD if b and os.path.exists(BOLD) else FONT, sz, index=1) if os.path.exists(FONT) else ImageFont.load_default()

src, d, chk, png, title = sys.argv[1:6]
tables = json.load(open(sys.argv[6], encoding='utf-8')) if len(sys.argv) > 6 else None
hc = json.load(open(os.path.join(ROOT, 'server', 'hanbando-terrain.json'), encoding='utf-8'))
T = hc['nippon'] if src == '-' else json.load(open(src, encoding='utf-8'))
J = json.load(open(os.path.join(d, 'nippon.json'), encoding='utf-8'))
C = json.load(open(chk, encoding='utf-8'))
raw = open(J['bin'], 'rb').read(); N = J['N']; NY, NX = J['NY'], J['NX']
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
cb = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
fresh_d = np.frombuffer(raw[7 * N + 4 * N + 4 * N:7 * N + 4 * N + 4 * N + 2 * N], np.uint16).reshape(NY, NX) if False else None
# 거리 배열(u16 다섯) — layout 순서: kind u8 · forest u8 · ore u8 · compB i32 · comp0 i32 · fresh · forest · ore · rock · sea (u16)
off = N * 3 + N * 4 * 2
fresh_d = np.frombuffer(raw[off:off + 2 * N], np.uint16).reshape(NY, NX)
TH = 297   # 한반도 민물 p95(T524 · 같은 자)

k = kind[::K, ::K]; c = cb[::K, ::K]; fd = fresh_d[::K, ::K]
img = np.zeros(k.shape + (3,), np.uint8); img[:] = (38, 52, 72)
img[c == J['main']] = (222, 216, 190)
cols = [(230, 90, 60), (240, 170, 40), (150, 80, 200), (60, 180, 120), (230, 60, 140), (40, 170, 210)]
off_main = [x for x in J['compsB'] if x['cls'] != '본토']
big = [x for x in off_main if x['area'] >= 1000]
for n, x in enumerate(off_main): img[c == x['id']] = cols[min(n, len(cols) - 1)] if x['area'] >= 1000 else (255, 255, 255)
dry = (k == 1) & (fd > TH) & (c == J['main'])
img[dry] = (img[dry] * 0.55 + np.array([214, 40, 160]) * 0.45).astype(np.uint8)
img[k == 4] = (132, 124, 112); img[k == 3] = (70, 130, 200)
im = Image.fromarray(img).convert('RGB'); dr = ImageDraw.Draw(im, 'RGBA')
P = lambda x, y: (x / SZ / K, y / SZ / K)

def outline_text(xy, t, f, fill=(255, 255, 255), stroke=(0, 0, 0)):
    dr.text(xy, t, font=f, fill=fill, stroke_width=2, stroke_fill=stroke)

# 산맥
for g in T.get('ridges', []):
    pts = [P(*p['pos']) for p in g['path']]
    if len(pts) > 1: dr.line(pts, fill=(90, 60, 30, 200), width=2)
    mid = pts[len(pts) // 2]; outline_text((mid[0] + 4, mid[1] - 8), g['name'], font(12), fill=(255, 230, 190))
# 고개
for q in T.get('passes', []):
    x, y = P(*q['pos']); r = q['radius'] / SZ / K
    dr.ellipse([x - r, y - r, x + r, y + r], outline=(255, 230, 0), width=2); outline_text((x + r + 2, y - 7), q['name'], font(11), fill=(255, 240, 120))
# 호수
for l in T.get('lakes', []):
    x, y = P(*l['center']); r = l.get('radius', 0) / SZ / K
    dr.ellipse([x - r, y - r, x + r, y + r], outline=(160, 230, 255), width=2); outline_text((x + r + 2, y - 7), l['name'], font(11), fill=(190, 240, 255))
# 강 — 중심선 + 하구 화살
byname = {r['name'] + str(i): r for i, r in enumerate(C['rivers'])}
for i, r in enumerate(T.get('rivers', [])):
    pts = [P(*p['pos']) for p in r['path']]
    if len(pts) > 1: dr.line(pts, fill=(20, 60, 170, 230), width=1)
    cr = C['rivers'][i] if i < len(C['rivers']) else None
    mouth = pts[0] if (cr and cr['mouthFirst']) else pts[-1]
    prev = pts[1] if (cr and cr['mouthFirst']) else pts[-2]
    ang = math.atan2(mouth[1] - prev[1], mouth[0] - prev[0])
    for s in (0.5, -0.5):
        dr.line([mouth, (mouth[0] - 9 * math.cos(ang + s), mouth[1] - 9 * math.sin(ang + s))], fill=(20, 60, 170, 255), width=2)
    if cr and cr['mouth'][0] in ('뭍', '산맥'):
        dr.ellipse([mouth[0] - 9, mouth[1] - 9, mouth[0] + 9, mouth[1] + 9], outline=(230, 20, 20), width=3)
    mid = pts[len(pts) // 2]; outline_text((mid[0] + 4, mid[1] + 2), r['name'], font(12, True), fill=(200, 225, 255), stroke=(10, 30, 90))
# 산맥 관통 — 강 표본 중 산맥 몸 안(발원 덩이 뺌)을 빨간 점으로
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location('chk', os.path.join(os.path.dirname(os.path.abspath(__file__)), 't549-terrain-check.py'))
M = importlib.util.module_from_spec(spec); spec.loader.exec_module(M)
for i, r in enumerate(T.get('rivers', [])):
    cr = C['rivers'][i] if i < len(C['rivers']) else None
    if not cr or not cr['cross']: continue
    S = M.sample(r); order = S[::-1] if cr['mouthFirst'] else S
    for g in T.get('ridges', []):
        if g['name'] not in cr['cross']: continue
        dd, hw = M.seg_dist(order[:, :2], M.pts(g))
        inside = dd < hw
        first_out = int(np.argmax(~inside)) if inside[0] else 0
        for (x, y) in order[first_out:][inside[first_out:]][:, :2]:
            X, Y = P(x, y); dr.point((X, Y), fill=(230, 20, 20, 255))
# 갇힌 A~D · 물 없는 덩이
for n, x in enumerate(big):
    X, Y = x['cx'] / K, x['cy'] / K
    dr.ellipse([X - 12, Y - 12, X + 12, Y + 12], fill=(20, 20, 20)); dr.text((X - 6, Y - 12), (chr(65+n) if n<26 else 'Z'+str(n)), fill=(255, 255, 255), font=font(16, True))
riv = [b for b in (J.get('dry') or {}).get('top', [])[:8]]
for n, b in enumerate(riv):
    X, Y = ((b['x0'] + b['x1']) / 2) / K, ((b['y0'] + b['y1']) / 2) / K
    outline_text((X - 5, Y - 9), str(n + 1), font(15, True), fill=(255, 200, 240), stroke=(90, 0, 60))

# 오른쪽 칸
PW = 980; HDR = 64
out = Image.new('RGB', (im.width + 36 + PW, max(im.height + HDR + 40, 1400)), (250, 250, 248)); out.paste(im, (12, HDR))
d2 = ImageDraw.Draw(out)
d2.text((12, 10), title, fill=(20, 20, 20), font=font(22, True))
d2.text((12, 40), f'한 칸 = {K}셀(96px) · 바탕 = T524 자(다리 판 성분) · 겹침 = 지형 json 선', fill=(90, 90, 90), font=font(13))
x0 = im.width + 32; y = 14
def line(t, sz=13, col=(40, 40, 40), dy=None, b=False):
    global y; d2.text((x0, y), t, fill=col, font=font(sz, b)); y += dy or int(sz * 1.55)
if tables:
    line(f"갇힌 땅 {tables['trapped']:.1f}% · 물 없는 땅 {tables['dry']:.1f}% · 자원 사막 {tables['desert']:.1f}% · 성분 {tables['comps']} · 후보 설 수 있음 {tables['standable']}/{tables['cands']}", 15, (20, 20, 20), 26, True)
line('범례: 파랑 선 = 강 중심선(화살 = 하구 · 폭이 넓은 끝) · 갈색 선 = 산맥 · 노란 원 = 고개 · 하늘 원 = 호수', 12, (90, 90, 90))
line('빨간 원 = 하구가 뭍/산맥(막다른 하구) · 빨간 점 = 강이 산맥 몸을 고개 없이 지남 · A~ = 본토 밖 성분 · 분홍 n = 물 없는 덩이', 12, (90, 90, 90), 26)
line(f"강 {len(C['rivers'])}", 15, (20, 20, 20), 22, True)
line('이름 · 길이(셀) · 폭 발원→하구(px) · 발원 · 하구 · 바다 효율 · 고개 없이 자른 산맥', 11, (110, 110, 110))
for r in C['rivers']:
    cr = ' · '.join(f"{k} {v}" for k, v in r['cross'].items()) or '-'
    ef = f"{r['coast']:.2f}" if r['coast'] is not None else '-'
    bad = r['mouth'][0] in ('뭍', '산맥') or r['cross'] or r['wMouth'] < r['wSrc']
    line(f"{r['name']} · {r['lenCells']} · {r['wSrc']}→{r['wMouth']} · {r['src'][0]}{(' ' + r['src'][1]) if r['src'][1] and r['src'][0] in ('강','산맥','호수') else ''} · {r['mouth'][0]}{(' ' + r['mouth'][1]) if r['mouth'][1] and r['mouth'][0] in ('강','산맥','호수') else ''} · {ef} · {cr}", 12, (170, 20, 20) if bad else (40, 40, 40))
y += 8; line(f"호수 {len(C['lakes'])} · 산맥 {len(C['ridges'])} · 고개 {C['passes']}", 15, (20, 20, 20), 22, True)
for l in C['lakes']:
    line(f"{l['name']} · 반경 {l['rCells']}셀 · 강 {','.join(l['rivers']) or '없음'} · 바다 {l['seaDist']}셀 · 가장자리 {'예' if l['edge'] else '아니오'}", 12, (170, 20, 20) if (l['edge'] or not l['rivers']) else (40, 40, 40))
for g in C['ridges']:
    line(f"{g['name']} · {'경계 거울 띠(T408)' if g['mirror'] else '섬 안'} · {g['lenCells']}셀 · 폭 {g['wMin']}~{g['wMax']} · y {g['y'][0]}~{g['y'][1]}", 12)
y += 8; line(f"걸림 {len(C['flags'])}건(판정 0 · 표만)", 15, (170, 20, 20), 22, True)
for f in C['flags']:
    line(f"{f[0]} — {f[1]} · {f[2]}", 12, (120, 30, 30))
d2.text((12, out.height - 28), 'T549 · scripts/t549-render.py · 지형 정본 무접촉', fill=(110, 110, 110), font=font(12))
out.save(png); print(png, out.size)
