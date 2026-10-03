#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T580 ⑤ 후보 30 그림 · 판정 0 — 재민이 보고 지우거나 옮길 것을 고른다)
# =============================================================================
# 닛폰 정본 후보 30 을 T524 자 바탕 위에 찍는다. 원 색 = 꼴(광산 · 어촌 · 임업 · 농촌) ·
#   **채운 원 = 시딩 20 · 빈 원(점선 고리) = 선별에서 빠진 10** · 이름 옆 꼬리표 = 꼴 낱말 · 옛/새.
#   시딩 목록은 부팅 로그(`[이름] 시딩: 중심 셀`)에서 읽는다 — 서버가 실제로 고른 것(사본 0).
#   T550 `t550-cands-png.py` 의 바탕 그리기를 그대로 쓰고, 칠하는 규칙만 다르다.
# 쓰는 법: python3 scripts/t580-cands-png.py <T524 닛폰 디렉터리> <부팅 로그> <후보 표 문서/T550_후보표.json> <이름 표 문서/T550_이름표.json> <그림.png>
# =============================================================================
import json, re, sys, glob, numpy as np
from PIL import Image, ImageDraw, ImageFont
TD, LOGP, VT, NT, OUT = sys.argv[1:6]
ROOT = __file__.rsplit('/scripts/', 1)[0]
J = json.load(open(f'{TD}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']; raw = open(J['bin'], 'rb').read()
kind = np.frombuffer(raw[:N], np.uint8).reshape(NY, NX)
cb = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(NY, NX)
W = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))['nippon']
src = open(f'{ROOT}/server/zone-config.js', encoding='utf-8').read()
br = json.loads(re.search(r"\n  nippon: \{[\s\S]*?\n    bridges: (\[[^\]]*\])", src).group(1))
seeded = re.findall(r'\[([^\]]+)\] 시딩: 중심 셀', open(LOGP, encoding='utf-8').read())
K = 3; S = 2; h, w = NY // K, NX // K
k = kind[:h * K:K, :w * K:K]; c = cb[:h * K:K, :w * K:K]
img = np.zeros((h, w, 3), np.uint8); img[:] = (225, 216, 190)
img[k == 2] = (35, 50, 75); img[k == 3] = (70, 120, 200); img[k == 4] = (125, 110, 95)
img[(k == 1) & (c != J['main'])] = (235, 150, 60)
im = Image.fromarray(img).resize((w * S, h * S), Image.NEAREST); d = ImageDraw.Draw(im)
fp = (glob.glob('/usr/share/fonts/**/NotoSansCJK-Bold.ttc', recursive=True) + glob.glob('/usr/share/fonts/**/*CJK*', recursive=True))[0]
F = ImageFont.truetype(fp, 16); FS = ImageFont.truetype(fp, 13); FB = ImageFont.truetype(fp, 22)
P = lambda x, y: (x / 32 / K * S, y / 32 / K * S)
for v in W.get('valleys', []):
    d.line([P(*p['pos']) for p in v['path']], fill=(255, 240, 120) if '협곡' in v['name'] else (250, 250, 250), width=3)
for i in range(0, len(br), 2):
    x, y = br[i] / K * S, br[i + 1] / K * S; d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=(220, 30, 30))
rows = json.load(open(VT, encoding='utf-8'))['rows']; NM = {r['from']: r['to'] for r in json.load(open(NT, encoding='utf-8'))['villages']}
kindOf = {NM.get(r['name'], r['name']): r['kind'] for r in rows}
TC = {'mining': (150, 60, 170), 'riverside': (20, 110, 200), 'forest': (30, 140, 50), 'plain': (210, 140, 20), None: (110, 110, 110)}
TW = {'mining': '광산', 'riverside': '어촌', 'forest': '임업', 'plain': '농촌', None: '꼴 없음'}
for v in W['villages']:
    x, y = P(v['x'], v['y']); col = TC.get(v.get('type')); on = v['name'] in seeded; r = 10
    if on: d.ellipse([x - r, y - r, x + r, y + r], fill=col, outline=(0, 0, 0), width=2)
    else:
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255), outline=col, width=4)
        d.ellipse([x - r - 4, y - r - 4, x + r + 4, y + r + 4], outline=(200, 0, 0), width=2)
    kd = kindOf.get(v['name'], '옛')
    tag = f"{TW.get(v.get('type'))} · {'새' if kd == '새' else ('옛·옮김' if '옮김' in kd else '옛')}{'' if on else ' · 빠짐'}"
    tx = x + 14 if x < im.width - 190 else x - 14 - max(d.textlength(v['name'], font=F), d.textlength(tag, font=FS))   # 오른쪽 끝은 왼쪽에 쓴다
    d.text((tx, y - 14), v['name'], font=F, fill=(0, 0, 0), stroke_width=3, stroke_fill=(255, 255, 255))
    d.text((tx, y + 4), tag, font=FS, fill=(120, 0, 0) if not on else (40, 40, 40), stroke_width=3, stroke_fill=(255, 255, 255))
H = 92; cv = Image.new('RGB', (im.width, im.height + H), (250, 250, 248)); cv.paste(im, (0, H)); dc = ImageDraw.Draw(cv)
ns = sum(1 for v in W['villages'] if v['name'] in seeded)
dc.text((10, 4), f"T580 닛폰 후보 {len(W['villages'])} — 시딩 {ns} · 빠짐 {len(W['villages']) - ns} (재민: 지울 것 · 옮길 것)", font=FB, fill=(0, 0, 0))
dc.text((10, 36), "채운 원 = 시딩(서버 부팅이 고른 20) · 빈 원 + 빨간 고리 = 선별에서 빠진 10 · 원 색 = 꼴: 보라 광산 · 파랑 어촌 · 초록 임업 · 주황 농촌", font=FS, fill=(30, 30, 30))
dc.text((10, 58), f"빨간 점 = 다리({len(br)//2}셀) · 노란 선 = 협곡 · 흰 선 = 고개 계곡 · 주황 땅 = 본토 밖 덩이 · 에디터 작업 파일: ~/Mini/_terrain/nippon_후보30.json", font=FS, fill=(30, 30, 30))
cv.save(OUT); print(OUT, cv.size, '시딩', ns)
