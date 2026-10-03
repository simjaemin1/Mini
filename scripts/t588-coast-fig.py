#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T588 ⑤ 그림 · 판정 0 · 표만)
# =============================================================================
# 해안 전후 그림 — 존 셋(한반도 · 닛폰 · 중원북) · **같은 축척**(전경 1셀 = 0.5px · 확대 1셀 = 1.5px) · 구간 이름·경계 표시.
#   띠 = `t588-coast-mask.js` 가 정본 생성기로 떨군 u8(끔 · 켬 a · 켬 b · 닛폰은 참고치 판도) — 그림은 그 칸을 그대로 칠한다(손 0).
#   지형 겹침(옅게) = 정본 지형 json(`server/hanbando-terrain.json`) 의 강 길 · 호수 원 · 마을 후보(점) — 위치 맥락만.
#   표 = `t588-coast-measure.py`(T549 자를 부른 모양 자) · `t588-coast-impact.js`(잃는 뭍 · 후보 · 강 하구) 결과 그대로.
# 쓰는 법: python3 scripts/t588-coast-fig.py <out_dir> <root_masks> <measure.json> <impact_dir>
#   <root_masks>/{m0,ma,mb,mar,mbr}/<zone>.{u8,json}
#   ① 지금 그림: python3 scripts/t588-coast-fig.py <out_dir> - - - --now <measure_all.json> <끔 마스크 디렉터리(전 뭍 존)>
# =============================================================================
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT, ROOT, MEAS, IMP = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
HERE = os.path.dirname(os.path.abspath(__file__))
TER = json.load(open(os.path.join(HERE, '..', 'server', 'hanbando-terrain.json'), encoding='utf-8'))
M = json.load(open(MEAS, encoding='utf-8')) if MEAS != '-' else {}
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; BOLD = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def font(sz, b=False): return ImageFont.truetype(BOLD if b else FONT, sz, index=1)
LAND = (222, 214, 186); SEA = (35, 50, 80); OCEAN = (28, 40, 66); RIVER = (70, 130, 205); INK = (30, 30, 30); GREY = (110, 110, 110)
SECCOL = {'kr_w': (230, 120, 40), 'kr_s': (200, 60, 120), 'kr_e': (40, 150, 120), 'jp_e': (120, 90, 200), 'jw_e': (150, 150, 40)}
VAR = [('m0', '지금(끔)'), ('ma', '켬 · 안 ⓐ (진폭 = 지금 식 진폭 5,000px · 구간마다 기울기 H = 2 − D)'), ('mb', '켬 · 안 ⓑ (구간 D 맞춤 진폭 — 서 6,904 · 남 7,406 · 동 3,849px)')]
SO, SZ_ZOOM = 0.5, 1.5   # 전경 · 확대 축척(px/셀)

def load(var, zone):
    p = os.path.join(ROOT, var, zone)
    meta = json.load(open(p + '.json', encoding='utf-8'))
    sea = np.fromfile(p + '.u8', np.uint8).reshape(meta['NY'], meta['NX']).astype(bool)
    return meta, sea

def world_mosaic(var, zones, wx0, wy0, wcells, hcells):
    """세계 좌표 창(셀) 하나에 여러 존의 띠를 모은다 — 바다 존은 전부 물(존 서버 isOcean) · 없는 존은 뭍."""
    img = np.zeros((hcells, wcells), np.uint8)   # 0 뭍 · 1 띠 바다 · 2 바다 존
    import subprocess
    zc = json.loads(subprocess.check_output(['node', '-e', 'const {ZONES}=require(' + json.dumps(os.path.join(HERE, '..', 'server', 'zone-config')) + ');console.log(JSON.stringify(ZONES))']))
    for zid, z in zc.items():
        zx0, zy0 = z['worldOffsetX'] // 32, z['worldOffsetY'] // 32
        zw, zh = int(np.ceil(z['zoneWidth'] / 32)), int(np.ceil(z['zoneHeight'] / 32))
        ax0, ay0 = max(wx0, zx0), max(wy0, zy0); ax1, ay1 = min(wx0 + wcells, zx0 + zw), min(wy0 + hcells, zy0 + zh)
        if ax0 >= ax1 or ay0 >= ay1: continue
        if z.get('isOcean'): img[ay0 - wy0:ay1 - wy0, ax0 - wx0:ax1 - wx0] = 2; continue
        if zid in zones:
            _, sea = load(var, zid)
            img[ay0 - wy0:ay1 - wy0, ax0 - wx0:ax1 - wx0] = sea[ay0 - zy0:ay1 - zy0, ax0 - zx0:ax1 - zx0].astype(np.uint8)
    return img, zc

def colorize(a):
    rgb = np.empty(a.shape + (3,), np.uint8); rgb[...] = LAND
    rgb[a == 1] = SEA; rgb[a == 2] = OCEAN
    return rgb

def to_img(rgb, scale):
    im = Image.fromarray(rgb)
    if scale >= 1: return im.resize((int(im.width * scale), int(im.height * scale)), Image.NEAREST)
    return im.resize((max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))), Image.BOX)

def overlay_terrain(dr, zone, ox, oy, scale, cx0, cy0, w, h):
    """지형 맥락(옅게): 강 길 · 호수 · 마을 후보 — 존 local px → 셀 → 그림 px"""
    t = TER.get(zone, {})
    def P(x, y): return ox + (x / 32 - cx0) * scale, oy + (y / 32 - cy0) * scale
    for rv in t.get('rivers', []):
        pts = [P(*(p['pos'] if isinstance(p, dict) else p)) for p in rv.get('path', [])]
        if len(pts) >= 2: dr.line(pts, fill=RIVER, width=max(1, int(1 * scale * 2)))
    for lk in t.get('lakes', []):
        if not lk.get('center') or not lk.get('radius'): continue
        x, y = P(*lk['center']); r = lk['radius'] / 32 * scale
        dr.ellipse([x - r, y - r, x + r, y + r], outline=RIVER, width=1)
    for v in t.get('villages', []):
        x, y = P(v['x'], v['y'])
        if ox <= x <= ox + w and oy <= y <= oy + h: dr.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 255, 255), outline=INK)

def sec_rows(name):
    m = M.get(name, {}); return {r['side']: r for r in m.get('sides', [])}

def fmt(r, k, nd=3):
    v = r.get(k) if r else None
    return '—' if v is None else (f'{v:.{nd}f}' if isinstance(v, float) else str(v))

# ════════════════════════ 한반도 ════════════════════════
def fig_hanbando():
    zone = 'hanbando'
    meta0, _ = load('m0', zone)
    NX, NY = meta0['NX'], meta0['NY']
    ROWS = 520; cy0 = NY - ROWS + 40
    W = int(NX * SO) + 40
    secs = [s for s in load('ma', zone)[0]['secs'] if s['zone'] == zone]
    imp = json.load(open(os.path.join(IMP, zone + '.json'), encoding='utf-8'))
    H = 140 + 3 * (int(ROWS * SO) + 34) + 30 + 3 * (int(180 * SZ_ZOOM) + 40) + 330
    im = Image.new('RGB', (max(W, 1420), H), (250, 250, 247)); dr = ImageDraw.Draw(im)
    dr.text((20, 12), 'T588 해안 — 한반도(새벌) 전후 · 남변 하나가 바다(동창해)에 닿는다', font=font(22, True), fill=INK)
    dr.text((20, 44), '같은 축척: 전경 1셀 = 0.5px · 확대 1셀 = 1.5px · 뭍 모래 · 띠 바다 남색 · 바다 존 짙은 남 · 강·호수 파랑 · 마을 후보 흰 점 · 구간 경계 점선(섞임 폭 = 띠 깊이 6,000px)', font=font(13), fill=GREY)
    dr.text((20, 64), '구간 성격 = T589(세션11 · 가지 59628c5d) D — 서 1.241 · 남 1.273 · 동 1.037(KINPR 40-4 BC법) · 굴곡 진폭·섬 밀도·갯벌 폭·자 범위 = 미확인(지어내지 않음)', font=font(13), fill=GREY)
    dr.text((20, 84), '구간 경계 = 남변을 같은 길이 셋으로(구간별 해안 길이 미확인 — 고를 자리) · 해안 차례: 중원(황해) → 서 → 남 → 동 → 닛폰 서(대한해협)', font=font(13), fill=GREY)
    y = 112
    for var, lab in VAR:
        _, sea = load(var, zone)
        a = np.zeros((ROWS + 40, NX), np.uint8); a[:ROWS, :] = sea[NY - ROWS:, :]; a[ROWS:, :] = 2
        tile = to_img(colorize(a), SO)
        overlay_terrain(ImageDraw.Draw(tile), zone, 0, 0, SO, 0, NY - ROWS, tile.width, tile.height)   # 그림 칸 안에서만(잘림)
        im.paste(tile, (20, y + 22))
        dr.text((20, y), lab, font=font(14, True), fill=INK)
        for s in secs:
            for xw in (s['ax'], s['bx']):
                xc = (xw - meta0['x0']) / 32
                if 0 < xc < NX:
                    X = 20 + xc * SO
                    for yy in range(y + 22, y + 22 + tile.height, 8): dr.line([(X, yy), (X, yy + 4)], fill=(255, 255, 255), width=1)
            if var == 'm0':
                xm = ((s['ax'] + s['bx']) / 2 - meta0['x0']) / 32
                ch = s['id']
                dr.text((20 + xm * SO - 120, y + 22 + 6), f"{s['ko']} · D {2 - s['H']:.3f}", font=font(13, True), fill=SECCOL.get(ch, INK))
        y += tile.height + 34
    # 확대 — 구간마다 220×180셀 창(구간 몸통 가운데 · 해안선이 든 줄)
    dr.text((20, y), '확대(1셀 = 1.5px) — 구간 몸통 가운데 220×180셀 · 왼쪽부터 지금 · 안 ⓐ · 안 ⓑ', font=font(14, True), fill=INK); y += 26
    for s in secs:
        xm = int(((s['ax'] + s['bx']) / 2 - meta0['x0']) / 32) - 110
        _, sea0 = load('m0', zone)
        col = sea0[:, xm + 110]; yc = NY - 1
        while yc > 0 and col[yc]: yc -= 1
        y0 = max(0, min(NY - 180, yc - 90))
        x = 20
        dr.text((x, y), f"{s['ko']}  (셀 x {xm}~{xm + 220} · y {y0}~{y0 + 180})", font=font(13, True), fill=SECCOL.get(s['id'], INK))
        for var, lab in VAR:
            _, sea = load(var, zone)
            tile = to_img(colorize(sea[y0:y0 + 180, xm:xm + 220].astype(np.uint8)), SZ_ZOOM); im.paste(tile, (x, y + 20))
            dr.rectangle([x - 1, y + 19, x + tile.width, y + 20 + tile.height], outline=(150, 150, 150))
            x += tile.width + 20
        y += int(180 * SZ_ZOOM) + 40
    # 표
    rows = {v: sec_rows(f'{v}_hanbando') for v, _ in VAR}
    dr.text((20, y), '구간 몸통(섞임 폭 뗀 곳)의 모양 — T549 자(t549-coast-shape.py) 그대로 · D = 박스 카운팅 상자 2~128셀(잔 2~16 · 큰 16~128)', font=font(13, True), fill=INK); y += 22
    hdr = ['구간', '고증 D', '지금 D(잔·큰)', 'ⓐ D(잔·큰)', 'ⓑ D(잔·큰)', '1셀 돌기 지금→ⓐ→ⓑ', '줄 점프≥5* 지금→ⓐ→ⓑ', '곶 r5/8/13 지금→ⓑ']
    xs = [20, 170, 230, 390, 550, 710, 900, 1090]
    for i, h_ in enumerate(hdr): dr.text((xs[i], y), h_, font=font(12, True), fill=INK)
    y += 18
    for s in secs:
        key = 'S:' + s['id']; r0, ra, rb = rows['m0'].get(key), rows['ma'].get(key), rows['mb'].get(key)
        D = lambda r: f"{fmt(r, 'D')}({fmt(r, 'Dsmall', 2)}·{fmt(r, 'Dlarge', 2)})"
        sp = lambda r: (r['spikeLand'] + r['spikeSea']) if r else '—'
        jp = lambda r: r['jumpS']['ge5'] if r else '—'
        cp = lambda r: '/'.join(str(r['capes'][str(k)]) for k in (5, 8, 13)) if r else '—'
        vals = [s['ko'], f"{2 - s['H']:.3f}", D(r0), D(ra), D(rb), f"{sp(r0)}→{sp(ra)}→{sp(rb)}", f"{jp(r0)}→{jp(ra)}→{jp(rb)}", f"{cp(r0)}→{cp(rb)}"]
        for i, v in enumerate(vals): dr.text((xs[i], y), str(v), font=font(12), fill=SECCOL.get(s['id'], INK) if i == 0 else INK)
        y += 18
    dr.text((20, y), '* 줄 점프 = T549 톱니 자(열마다 가장 남쪽 뭍 셀이 옆 열과 5셀 넘게 뜀) — 그래프 해안(지금 식)의 톱니를 세는 자라, 섬·굽이가 있는 켬 판에선 섬 가장자리·만 입구에서도 뛴다(뜻이 다르다)', font=font(11), fill=GREY); y += 16
    dr.text((20, y), '  구간 몸통 D 는 540셀 남짓 한 판이라 흔들린다 — 진폭 ⓑ 는 긴 시험 해안(8,192셀)에서 큰 상자 D(16~128셀)를 고증 D 에 맞춘 값(t588-coast-fit.js --match-d)', font=font(11), fill=GREY); y += 20
    A = imp['arms']
    for k, lab in (('a', '안 ⓐ'), ('b', '안 ⓑ')):
        t = A[k]
        dr.text((20, y), f"{lab}: 띠 {A['off']['bandPct']}% → {t['bandPct']}% · 바다가 되는 뭍 {t['lost']:,}셀(숲 {t['lostForest']} · 광맥 {t['lostOre']} · 민물 {t['lostFresh']}) · 뭍이 되는 띠 {t['gained']:,}셀 · 갯벌 칸(물때 층 뜻) {A['off'].get('tidal', 0):,} → {t.get('tidal', 0):,}",
                font=font(12), fill=INK); y += 17
        dr.text((40, y), f"바닷가 후보(960px) {len(A['off']['vilCoastal'])}→{len(t['vilCoastal'])}({', '.join(t['diff']['coastalGone']) or '-'} 빠짐) · 후보 바다 위 {len(t['vilSea'])}({', '.join(t['vilSea']) or '-'} · 끔도 같음) · "
                          f"광맥 중심 바다 {len(A['off']['oreSea'])}→{len(t['oreSea'])} · 하구가 바다 {len(A['off']['mouthToSea'])}→{len(t['mouthToSea'])}/{len(t['rivers'])} · 발원이 바다 {len(A['off']['srcInSea'])}→{len(t['srcInSea'])}({', '.join(t['diff']['srcInSeaNew']) or '-'})",
                font=font(12), fill=INK); y += 20
    dr.text((20, H - 26), 'T588 · scripts/t588-coast-mask.js → t588-coast-measure.py(T549 자) · t588-coast-impact.js → t588-coast-fig.py · 판정 0 — 고르는 건 재민', font=font(12), fill=GREY)
    return im

# ════════════════════════ 닛폰 ════════════════════════
def fig_nippon():
    zone = 'nippon'
    meta0, _ = load('m0', zone)
    NX, NY = meta0['NX'], meta0['NY']
    V = [('m0', '지금(끔)'), ('ma', '켬 · 안 ⓐ(표 그대로 — 닛폰 구간 미확인 → 지금 식)'), ('mar', '참고치 판 ⓐ — 동 D 1.2336(우와지마 · 확실도 약 · 기본 적재 안 함)'), ('mbr', '참고치 판 ⓑ — 동 D 맞춤 진폭 6,813px')]
    pw = int((NX + 40) * SO); ph = int((NY + 40) * SO)
    W = 20 + len(V) * (pw + 24); H = 130 + ph + 60 + int(180 * SZ_ZOOM) + 200
    im = Image.new('RGB', (W, H), (250, 250, 247)); dr = ImageDraw.Draw(im)
    dr.text((20, 12), 'T588 해안 — 닛폰(아사기 열도) 전후 · 남변(남창해) · 동변(큰바다)', font=font(22, True), fill=INK)
    dr.text((20, 44), '같은 축척: 전경 1셀 = 0.5px · 확대 1셀 = 1.5px · T589: 일본 동해쪽·세토내해·규슈서쪽 = 미확인 · 태평양쪽 = 참고치(산리쿠 아님 · 고교 보고서)만 → 켬 판은 닛폰 해안을 지금 식 그대로 둔다', font=font(13), fill=GREY)
    dr.text((20, 64), '⚠닛폰 폭은 T591(세션5)이 바꾼다(1,562 → 2,188셀) — 이 그림은 지금 폭 · T591 착지 뒤 같은 자로 다시 굽는다(추신)', font=font(13), fill=GREY)
    y = 96
    x = 20
    for var, lab in V:
        _, sea = load(var, zone)
        a = np.zeros((NY + 40, NX + 40), np.uint8); a[:NY, :NX] = sea; a[NY:, :] = 2; a[:, NX:] = 2
        tile = to_img(colorize(a), SO)
        overlay_terrain(ImageDraw.Draw(tile), zone, 0, 0, SO, 0, 0, tile.width, tile.height)   # 그림 칸 안에서만(잘림)
        im.paste(tile, (x, y + 30))
        dr.text((x, y), lab, font=font(12, True), fill=INK)
        x += pw + 24
    y += ph + 40
    # 확대 — 동해안 가운데 · 남해안 가운데
    dr.text((20, y), '확대(1셀 = 1.5px) — 동변 가운데 220×180셀(왼쪽부터 지금 · 켬 ⓐ · 참고 ⓐ · 참고 ⓑ)', font=font(14, True), fill=INK); y += 24
    x = 20
    for var, lab in V:
        _, sea = load(var, zone)
        y0 = NY // 2 - 90; tile = to_img(colorize(sea[y0:y0 + 180, NX - 220:NX].astype(np.uint8)), SZ_ZOOM); im.paste(tile, (x, y))
        dr.rectangle([x - 1, y - 1, x + tile.width, y + tile.height], outline=(150, 150, 150)); x += tile.width + 20
    y += int(180 * SZ_ZOOM) + 16
    rows = {v: sec_rows(f'{v}_nippon') for v, _ in V}
    for v, lab in V:
        rs = rows[v]; s = '  '.join(f"{k}: D {fmt(r, 'D')}({fmt(r, 'Dsmall', 2)}·{fmt(r, 'Dlarge', 2)}) · 1셀 돌기 {r['spikeLand'] + r['spikeSea']} · 줄 점프≥5 {(r['jumpS'] if k.startswith(('S', 'N')) else r['jumpE'])['ge5']}" for k, r in rs.items())
        dr.text((20, y), f"{lab.split(' — ')[0].split('(')[0]} — {s}", font=font(12), fill=INK); y += 18
    dr.text((20, H - 26), 'T588 · 참고치 판은 `--with-ref`(자 안에서만) — 정본 켬 판에는 안 들어간다 · 판정 0', font=font(12), fill=GREY)
    return im

# ════════════════════════ 중원북 ════════════════════════
def fig_jungwon():
    # 중원북 남동 꼭짓점(세계 409984, 180000 = 셀 12812, 5625) 둘레 700×700셀 — 중원북 · 한반도 · 중원남 · 동창해를 한 창에
    CX, CY = 409984 // 32, 180000 // 32; R = 350
    W = 20 + 3 * (int(2 * R * SO) + 24); H = 150 + int(2 * R * SO) + 40 + 120
    im = Image.new('RGB', (W, H), (250, 250, 247)); dr = ImageDraw.Draw(im)
    dr.text((20, 12), 'T588 해안 — 중원북(하란 북부) 전후 · 남동 꼭짓점 하나로만 바다(동창해)에 닿는다', font=font(22, True), fill=INK)
    dr.text((20, 44), '같은 축척: 1셀 = 0.5px · 창 = 꼭짓점 둘레 700×700셀(왼쪽 위 중원북 · 오른쪽 위 한반도 · 왼쪽 아래 중원남 · 오른쪽 아래 동창해)', font=font(13), fill=GREY)
    dr.text((20, 64), '중원 동해안(황해 쪽 — 중원남 동변 + 중원북 꼭짓점) = T589 미확인 → 지금 식 · 한반도 서(서해) 구간의 섞임 폭(6,000px)이 꼭짓점까지 닿아 사분원 끝이 조금 바뀐다', font=font(13), fill=GREY)
    y = 96; x = 20
    for var, lab in VAR:
        a, _ = world_mosaic(var, ('jungwon_n', 'hanbando', 'jungwon_s'), CX - R, CY - R, 2 * R, 2 * R)
        tile = to_img(colorize(a), SO); im.paste(tile, (x, y + 30))
        dr.text((x, y), lab, font=font(12, True), fill=INK)
        cx, cy = x + R * SO, y + 30 + R * SO
        dr.line([(cx, y + 30), (cx, y + 30 + tile.height)], fill=(150, 150, 150), width=1); dr.line([(x, cy), (x + tile.width, cy)], fill=(150, 150, 150), width=1)
        dr.text((x + 6, y + 36), '중원북', font=font(12, True), fill=INK); dr.text((cx + 6, y + 36), '한반도', font=font(12, True), fill=INK)
        dr.text((x + 6, cy + 6), '중원남', font=font(12, True), fill=INK); dr.text((cx + 6, cy + 6), '동창해', font=font(12, True), fill=(230, 230, 230))
        x += int(2 * R * SO) + 24
    y += int(2 * R * SO) + 44
    rows = {v: sec_rows(f'{v}_jungwon_n') for v, _ in VAR}
    for v, lab in VAR:
        r = rows[v].get('corner:SE')
        dr.text((20, y), f"{lab.split(' (')[0]} — 중원북 꼭짓점 띠: D {fmt(r, 'D')} · 해안 {fmt(r, 'coast')}셀 · 1셀 돌기 {(r['spikeLand'] + r['spikeSea']) if r else '—'} · 띠 {M.get(v + '_jungwon_n', {}).get('bandPct', '—')}%", font=font(12), fill=INK); y += 18
    dr.text((20, H - 26), 'T588 · 판정 0', font=font(12), fill=GREY)
    return im

# ════════════════════════ ① 지금(전 뭍 존) ════════════════════════
KO = {'hanbando': '한반도', 'nippon': '닛폰', 'jungwon_n': '중원북', 'jungwon_s': '중원남', 'bering': '베링'}
def fig_now(meas_all_path, mask_dir):
    MA = json.load(open(meas_all_path, encoding='utf-8'))
    metas = {}
    for f in sorted(os.listdir(mask_dir)):
        if f.endswith('.json') and not f.startswith('measure'):
            mt = json.load(open(os.path.join(mask_dir, f), encoding='utf-8'))
            if 'NX' in mt: metas[mt['zone']] = mt
    K = 16   # 세계 그림 1픽셀 = 16셀
    anyM = next(iter(metas.values()))
    WX = max([m['x0'] + m['w'] for m in metas.values()] + [o['x1'] for o in anyM['ocean']]); WY = max([m['y0'] + m['h'] for m in metas.values()] + [o['y1'] for o in anyM['ocean']])
    gw, gh = int(np.ceil(WX / 32 / K)), int(np.ceil(WY / 32 / K))
    world = np.full((gh, gw, 3), 200, np.uint8)
    for o in anyM['ocean']: world[o['y0'] // 32 // K:int(np.ceil(o['y1'] / 32 / K)), o['x0'] // 32 // K:int(np.ceil(o['x1'] / 32 / K))] = OCEAN
    for z, mt in metas.items():
        sea = np.fromfile(os.path.join(mask_dir, z + '.u8'), np.uint8).reshape(mt['NY'], mt['NX'])
        hh, ww = mt['NY'] // K, mt['NX'] // K
        frac = sea[:hh * K, :ww * K].reshape(hh, K, ww, K).mean(axis=(1, 3))
        blk = np.where(frac[..., None] >= 0.5, np.array(SEA, np.uint8), np.array(LAND, np.uint8))
        gy, gx = mt['y0'] // 32 // K, mt['x0'] // 32 // K
        world[gy:gy + hh, gx:gx + ww] = blk
    wim = Image.fromarray(world); dw = ImageDraw.Draw(wim)
    for z, mt in metas.items():
        dw.rectangle([mt['x0'] // 32 // K, mt['y0'] // 32 // K, (mt['x0'] + mt['w']) // 32 // K - 1, (mt['y0'] + mt['h']) // 32 // K - 1], outline=(150, 150, 150))
        dw.text((mt['x0'] // 32 // K + 4, mt['y0'] // 32 // K + 4), (KO[z] + ' · ' if z in KO else '') + (mt.get('name') or z), font=font(11), fill=(60, 40, 20))
    rows = []
    for z, v in MA.items():
        for r in v['sides']:
            jp = (r['jumpS'] if r['side'].startswith(('S', 'N')) else r['jumpE'])['ge5'] if not r['side'].startswith('corner') else '—'
            rows.append([(KO.get(v['zone']) or metas.get(v['zone'], {}).get('name') or v['zone']), r['side'], r['ocean'], f"{v['bandPct']:.2f}", f"{r['coast']:,}", f"{r['spikeLand']}+{r['spikeSea']}", f"{r['spikePer1k']:.2f}",
                         f"{r['D']:.3f} ({r['Dsmall']:.2f}·{r['Dlarge']:.2f})", str(jp), '/'.join(str(r['capes'][str(k)]) for k in (3, 5, 8, 13, 21)), '/'.join(str(r['bays'][str(k)]) for k in (3, 5, 8, 13, 21)),
                         f"{v['islands']}({v['islandMax']})" if r is v['sides'][0] else ''])
    H = 120 + wim.height + 40 + 22 * (len(rows) + 2) + 80
    im = Image.new('RGB', (max(wim.width + 40, 1500), H), (250, 250, 247)); dr = ImageDraw.Draw(im)
    dr.text((20, 12), 'T588 ① 지금 해안선 — 26존 공통 식(직사각 바다 변 거리 < 6,000 ± 5,000px × 값 잡음 3200/960/320px) · 바다 변마다 잰 표', font=font(20, True), fill=INK)
    dr.text((20, 44), '세계 그림 1픽셀 = 16셀(띠가 칸의 반 넘으면 남색) · 표 = T549 자(t549-coast-shape.py) 를 변(바다 존과 맞닿은 구간)마다 잘라 부른 값 · 섬 = 본토에 안 붙은 뭍 덩이(4방)', font=font(13), fill=GREY)
    dr.text((20, 64), '1셀 돌기 = 뭍 셀인데 4방 셋 이상이 바다(곶 끝) + 바다 셀인데 셋 이상이 뭍 · D = 박스 카운팅(상자 2~128셀 · 잔 2~16 · 큰 16~128) · 줄 점프 = 해안이 옆 줄과 5셀 넘게 뛴 곳(톱니)', font=font(13), fill=GREY)
    im.paste(wim, (20, 92)); y = 92 + wim.height + 24
    hdr = ['존', '변', '바다 존', '띠 %', '해안 셀', '1셀 돌기', '/1천', 'D (잔·큰)', '줄 점프≥5', '곶 r3/5/8/13/21', '만 r3/5/8/13/21', '섬(최대)']
    xs = [20, 150, 300, 440, 500, 580, 660, 720, 880, 960, 1130, 1300]
    for i, h_ in enumerate(hdr): dr.text((xs[i], y), h_, font=font(12, True), fill=INK)
    y += 20
    for r in rows:
        for i, v_ in enumerate(r): dr.text((xs[i], y), str(v_), font=font(12), fill=INK)
        y += 20
    dr.text((20, H - 26), 'T588 ① · scripts/t588-coast-mask.js(정본 생성기 끔) → t588-coast-measure.py(T549 자 부르기) · 관측 전용', font=font(12), fill=GREY)
    return im

os.makedirs(OUT, exist_ok=True)
if len(sys.argv) > 6 and sys.argv[5] == '--now':
    im = fig_now(sys.argv[6], sys.argv[7]); p = os.path.join(OUT, 'T588_해안_지금.png'); im.save(p); print(p, im.size)
else:
    for name, fn in (('한반도', fig_hanbando), ('닛폰', fig_nippon), ('중원북', fig_jungwon)):
        im = fn(); p = os.path.join(OUT, f'T588_해안_{name}_전후.png'); im.save(p); print(p, im.size)
