#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T524 표·그림 칸)
# =============================================================================
# T524 — `t524-land-audit.js` 가 남긴 <dir>/<zone>.json|.bin 두 존(닛폰 · 한반도)에서 표와 그림을 만든다.
#   새 수 0 · 새 문턱 0: "멀다"의 자는 **한반도 분포의 p95**(같은 자로 잰 한반도 값) 하나다.
#   ⓐ 물 없는 땅 = 민물 실걸음 > 한반도 p95(또는 닿을 길 없음) · ⓑ 자원 사막 = 숲 · 광맥 · 바위(산) **셋 다** > 한반도 p95(또는 없음)
#     — 덩이는 4방 이웃으로 묶는다(`scipy.ndimage.label`). 한반도에도 같은 자를 대어 **비교 열**을 붙인다.
#   그림(PIL · Noto CJK · 한 칸 = 4셀): 거리 넷(민물 · 숲 · 광맥 · 산) 한 장 + 성분·후보 자리 한 장 — 닛폰 · 한반도 같은 축척.
#
# 쓰는 법: python3 scripts/t524-land-figs.py <dir> <그림 디렉터리> <표.json>
# =============================================================================
import json, os, sys
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw, ImageFont

D = sys.argv[1] if len(sys.argv) > 1 else '/tmp/t524'
FIG = sys.argv[2] if len(sys.argv) > 2 else '/tmp/t524'
OUTJ = sys.argv[3] if len(sys.argv) > 3 else '/tmp/t524/tables.json'
INF = 65535
K = 4   # 한 칸 = K 셀
FONT = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
font = lambda sz: ImageFont.truetype(FONT, sz, index=1) if os.path.exists(FONT) else ImageFont.load_default()   # index 1 = KR

def layers(z):   # 셀 배열 — u16 은 거리라 이름 뒤에 `_d`(숲 u8 표시 · 숲 u16 거리가 한 이름이라)
    J = json.load(open(os.path.join(D, f'{z}.json'), encoding='utf-8'))
    raw = open(J['bin'], 'rb').read(); N = J['N']; NY, NX = J['NY'], J['NX']
    off = 0; L = {}
    for spec in J['layout']:
        name, t = spec.split(':'); dt = {'u8': np.uint8, 'i32': np.int32, 'u16': np.uint16}[t]; nb = N * np.dtype(dt).itemsize
        L[name + ('_d' if t == 'u16' else '')] = np.frombuffer(raw[off:off + nb], dtype=dt).reshape(NY, NX); off += nb
    return J, L

HB, LH = layers('hanbando')
NP, LN = layers('nippon')
TH = {k: HB['dist'][k]['p95'] for k in ('fresh', 'forest', 'ore', 'rock', 'sea')}

def blobs(mask):
    lab, n = ndimage.label(mask)   # 4방
    if n == 0: return [], lab
    area = ndimage.sum(mask, lab, index=np.arange(1, n + 1)).astype(int)
    sl = ndimage.find_objects(lab)
    out = [dict(id=i + 1, area=int(area[i]), x0=s[1].start, y0=s[0].start, x1=s[1].stop - 1, y1=s[0].stop - 1) for i, s in enumerate(sl)]
    out.sort(key=lambda b: -b['area'])
    return out, lab

def audit(J, L):
    land = L['kind'] == 1
    far = {k: land & (L[k + '_d'] > TH[k]) for k in ('fresh', 'forest', 'ore', 'rock')}   # INF(65535) 도 > p95
    dry = far['fresh']
    desert = far['forest'] & far['ore'] & far['rock']
    B, _ = blobs(dry); S, _ = blobs(desert)
    main = L['compB'] == J['main']
    return dict(land=int(land.sum()),
                far={k: int(v.sum()) for k, v in far.items()},
                farMain={k: int((v & main).sum()) for k, v in far.items()},
                dry=dict(n=len(B), area=int(dry.sum()), top=B[:8], sizes=[b['area'] for b in B]),
                desert=dict(n=len(S), area=int(desert.sum()), top=S[:8], sizes=[b['area'] for b in S]))

AN, AH = audit(NP, LN), audit(HB, LH)

# ── 그림 ① 거리 넷
PAL = dict(sea=(38, 52, 72), fresh=(70, 130, 200), rock=(120, 116, 110), none=(0, 0, 0), far=(214, 40, 160))
def ramp(t):   # 0 가깝다(노랑) → 1 멀다(진녹)  · 단색 순차
    t = np.clip(t, 0, 1)[..., None]
    a = np.array([250, 236, 160]); b = np.array([24, 92, 70])
    return (a * (1 - t) + b * t).astype(np.uint8)
def panel(J, L, key, title):
    kind = L['kind'][::K, ::K]; d = L[key + '_d'][::K, ::K].astype(float)
    img = np.zeros(kind.shape + (3,), np.uint8)
    land = kind == 1
    img[land] = ramp(d[land] / TH[key])
    img[land & (d > TH[key])] = PAL['far']
    img[land & (d >= INF)] = PAL['none']
    img[kind == 2] = PAL['sea']; img[kind == 3] = PAL['fresh']; img[kind == 4] = PAL['rock']
    im = Image.fromarray(img)
    dr = ImageDraw.Draw(im)
    for v in J['vills']:
        x, y = (v['ccx'] if v['seeded'] else v['x']) / K, (v['ccy'] if v['seeded'] else v['y']) / K
        if v['seeded']: dr.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(255, 255, 255), width=2)
        else: dr.line([x - 5, y - 5, x + 5, y + 5], fill=(255, 255, 255), width=2); dr.line([x - 5, y + 5, x + 5, y - 5], fill=(255, 255, 255), width=2)
    hdr = Image.new('RGB', (im.width, 64), (250, 250, 248)); hd = ImageDraw.Draw(hdr)
    hd.text((8, 4), title, fill=(20, 20, 20), font=font(20))
    hd.text((8, 34), f"자 = 한반도 p95 {TH[key]}셀 · 분홍 = 그보다 멂 · 검정 = 길 없음", fill=(80, 80, 80), font=font(14))
    out = Image.new('RGB', (im.width, im.height + 64), (250, 250, 248)); out.paste(hdr, (0, 0)); out.paste(im, (0, 64))
    return out
def sheet(J, L, name, fn):
    ps = [panel(J, L, k, f'{name} · {t}') for k, t in (('fresh', '민물까지'), ('forest', '숲까지'), ('ore', '광맥까지'), ('rock', '산(바위)까지'))]
    W = sum(p.width for p in ps) + 12 * 5; H = max(p.height for p in ps) + 80
    out = Image.new('RGB', (W, H), (250, 250, 248)); x = 12
    for p in ps: out.paste(p, (x, 12)); x += p.width + 12
    dr = ImageDraw.Draw(out)
    dr.text((12, H - 60), f'{name} 실걸음 거리(4방 · 다리 판 · 셀 = 32px) · 한 칸 = {K}셀 · ○ 시딩된 마을 · × 안 선 후보 · 바다 남색 · 민물 파랑 · 바위 회색', fill=(40, 40, 40), font=font(16))
    dr.text((12, H - 34), 'T524 · scripts/t524-land-audit.js → t524-land-figs.py · 지형 무변', fill=(110, 110, 110), font=font(13))
    out.save(fn); return out.size

# ── 그림 ② 성분 · 수동 지형 후보 자리(지도엔 기호만 · 오른쪽 칸에 표)
def comps_fig(J, L, name, fn, A):
    kind = L['kind'][::K, ::K]; cb = L['compB'][::K, ::K]
    img = np.zeros(kind.shape + (3,), np.uint8); img[:] = (38, 52, 72)
    img[kind == 3] = (70, 130, 200); img[kind == 4] = (120, 116, 110)
    img[cb == J['main']] = (214, 208, 180)
    cols = [(230, 90, 60), (240, 170, 40), (150, 80, 200), (60, 180, 120), (230, 60, 140), (40, 170, 210)]
    off = [c for c in J['compsB'] if c['cls'] != '본토']
    big = [c for c in off if c['area'] >= 1000]
    for n, c in enumerate(off): img[cb == c['id']] = cols[min(n, len(cols) - 1)] if c['area'] >= 1000 else (255, 255, 255)
    fresh = L['fresh_d'][::K, ::K]; land = kind == 1
    dry = land & (fresh > TH['fresh']) & (cb == J['main'])
    img[dry] = (img[dry] * 0.5 + np.array([214, 40, 160]) * 0.5).astype(np.uint8)
    im = Image.fromarray(img); dr = ImageDraw.Draw(im)
    tag = lambda n: chr(ord('A') + n)
    for n, c in enumerate(big):
        x, y = c['cx'] / K, c['cy'] / K
        dr.ellipse([x - 11, y - 11, x + 11, y + 11], fill=(20, 20, 20)); dr.text((x - 5, y - 11), tag(n), fill=(255, 255, 255), font=font(16))
        for k in ('pass', 'bridge'):
            if c.get(k + 'At'):
                ax, ay = c[k + 'At'][0] / K, c[k + 'At'][1] / K
                dr.rectangle([ax - 5, ay - 5, ax + 5, ay + 5], outline=(255, 255, 0) if k == 'bridge' else (0, 255, 255), width=2)
    riv = [b for b in (J.get('dry') or {}).get('top', [])[:8] if b.get('fx') is not None]
    for n, b in enumerate(riv):
        x, y = b['fx'] / K, b['fy'] / K
        dr.line([x - 7, y, x + 7, y], fill=(255, 255, 255), width=2); dr.line([x, y - 7, x, y + 7], fill=(255, 255, 255), width=2)
        dr.text((x + 7, y - 18), str(n + 1), fill=(255, 255, 255), font=font(15))
    PW = 560; hdr = 20
    out = Image.new('RGB', (im.width + 24 + PW, max(im.height + hdr + 40, 900)), (250, 250, 248)); out.paste(im, (12, hdr))
    d2 = ImageDraw.Draw(out); x0 = im.width + 32; y = hdr
    def line(t, sz=14, c=(40, 40, 40), dy=None):
        nonlocal y; d2.text((x0, y), t, fill=c, font=font(sz)); y += dy or int(sz * 1.6)
    line(f'{name} · 뭍 성분(다리 판 · 4방 실셀)', 20, (20, 20, 20))
    line('본토 베이지 · 본토 밖 색 · 바다 남색 · 민물 파랑 · 바위 회색', 13, (90, 90, 90))
    line(f'분홍 겹침 = 본토의 물 없는 땅(민물 > 한반도 p95 {TH["fresh"]}셀)', 13, (90, 90, 90))
    line('노란 네모 = 본토까지 가장 짧은 다리 자리 · 하늘 네모 = 고개 자리', 13, (90, 90, 90))
    line('흰 십자 n = 강 후보 시작점(덩이의 가장 먼 셀)', 13, (90, 90, 90), 30)
    line('본토 밖 성분(1,000셀 이상)', 16, (20, 20, 20))
    for n, c in enumerate(big):
        nz = lambda v: '-' if v is None else v; br = f"다리 {c['bridge']}(강 {nz(c['bridgeFresh'])} · 바다 {nz(c['bridgeSea'])})" if c.get('bridge') is not None else '다리 -'
        line(f"{tag(n)}  {c['cls']} {c['area']:,}셀 · 둘레 바위 {c['rockB']} 바다 {c['seaB']} 민물 {c['freshB']}", 13)
        line(f"     고개 {c['pass'] if c.get('pass') is not None else '-'}셀 · {br}셀 · 자리 {c.get('bridgeAt') or c.get('passAt') or '-'}", 12, (90, 90, 90))
    rest = [c for c in off if c['area'] < 1000]
    line(f"그 밖 {len(rest)}개 · {sum(c['area'] for c in rest):,}셀(흰색 · 한 덩이 {min((c['area'] for c in rest), default=0)}~{max((c['area'] for c in rest), default=0)}셀)", 12, (90, 90, 90), 30)
    if riv:
        line('강 하나를 그으면(물 없는 덩이 큰 순)', 16, (20, 20, 20))
        for n, b in enumerate(riv):
            line(f"{n + 1}  덩이 {b['area']:,}셀 · 강 {b['riverLen']}셀 → {b['freed']:,}셀이 p95 안({100 * b['freed'] / b['area']:.0f}%)", 13)
        line('강은 과녁으로만 더했다(통행 무변 = 근사) · 길 = 거리 기울기', 12, (90, 90, 90))
    d2.text((12, out.height - 30), 'T524 · 지형 무변 · 표만 — 그리는 손은 재민(판정대기 ③)', fill=(110, 110, 110), font=font(13))
    out.save(fn); return out.size

os.makedirs(FIG, exist_ok=True)
sz = {}
sz['n_dist'] = sheet(NP, LN, '닛폰', os.path.join(FIG, 'T524_닛폰_거리.png'))
sz['h_dist'] = sheet(HB, LH, '한반도', os.path.join(FIG, 'T524_한반도_거리.png'))
sz['n_comp'] = comps_fig(NP, LN, '닛폰', os.path.join(FIG, 'T524_닛폰_성분.png'), AN)
# ★[T535] 셋째 존 — `T524_EXTRA=jungwon_n` 이면 같은 자로 그 존도(거리 넷 · 성분) · 표 JSON 에 한 칸 더. 안 주면 종전 그대로.
EXTRA = {}
for ez in [z for z in os.environ.get('T524_EXTRA', '').split(',') if z]:
    EJ, EL = layers(ez); EA = audit(EJ, EL); EXTRA[ez] = EA
    en = {'jungwon_n': '중원북'}.get(ez, ez)
    sz[ez + '_dist'] = sheet(EJ, EL, en, os.path.join(FIG, f'T524_{en}_거리.png'))
    sz[ez + '_comp'] = comps_fig(EJ, EL, en, os.path.join(FIG, f'T524_{en}_성분.png'), EA)
json.dump(dict(TH=TH, nippon=AN, hanbando=AH, sizes=sz, **EXTRA), open(OUTJ, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(dict(TH=TH, n_far=AN['far'], h_far=AH['far'], n_dry=[AN['dry']['n'], AN['dry']['area']], h_dry=[AH['dry']['n'], AH['dry']['area']],
                      n_des=[AN['desert']['n'], AN['desert']['area']], h_des=[AH['desert']['n'], AH['desert']['area']], sz=sz), ensure_ascii=False))
