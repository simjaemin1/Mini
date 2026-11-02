# tools/oseok/bake.py — 오석 판 재질을 브라우저용으로 굽는다(T1071 ①)
#
#   시안(mono.py · tabs.py)의 절차 돌 무늬 · 모따기 빛을 **그대로의 식으로** 굽되, 화면 어디에나 깔 수 있게
#   ⓐ 돌 무늬는 이음매 없는 타일(가우스 흐림을 wrap 으로 · 1x 는 wrap 덧대고 LANCZOS 로 줄인 뒤 잘라 냄)
#   ⓑ 모따기 테두리는 9조각(border-image) — 돌 위에 얹는 빛 · 그늘 막(흰 · 검정 + 알파 · 평평한 데는 알파 0)
#   ⓓ 바닥 그림자도 9조각(box-shadow 흐림 대신 · WebKit 다시 그리기 값)
#   ⓒ 글꼴은 Noto CJK KR(OFL) 세 벌을 KS X 1001 한글 2,350 자 + 글자 · 기호만 남겨 woff2 로
#   를 public/ui/oseok/ 에 쓴다. 외부 사진 0 · 무작위는 시드 고정(결정론).
#
# 실행: python3 tools/oseok/bake.py            (repo 뿌리에서 · numpy · scipy · Pillow · fontTools · brotli)
#       python3 tools/oseok/bake.py --no-fonts
import os, sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as nd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'ui', 'oseok')
sys.path.insert(0, HERE)
import mono  # noqa: E402  — 시안 식(SS · granite · render)

PLATE_LEVEL = 0.26   # 시안 tabs.py mono.LEVEL
GROUND_LEVEL = 0.07  # 시안 tabs.py ground level
TILE = 512           # 1x 타일 한 변(px) — 2x 는 1024
BEVEL = 7            # 시안 render(bevel=7)
SLICE = 12           # 9조각 한 변(1x px) — 모따기 7 + 흐림 · 그림자 여유
LIGHT = (-0.7, -0.9, 1.0)

# ── ⓐ 이음매 없는 오석 무늬 — mono.granite('black') 와 같은 식 · 흐림만 wrap ────────────────
def granite_wrap(H, W, level, seed, ss):
    r = np.random.default_rng(seed)
    def n(sig, sd):
        a = nd.gaussian_filter(r.standard_normal((H, W)).astype(np.float32), sig, mode='wrap')
        return (a - a.mean()) / (a.std() + 1e-6)
    def sst(x, a, b):
        t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
    lv = level
    base = lv + 0.012 * n(80 * ss, 1) + 0.014 * n(2 * ss, 2)
    sp = sst(n(0.7 * ss, 3), 2.0, 2.5); sp2 = sst(n(0.5 * ss, 7), 2.1, 2.6)
    g = base * (1 - sp) + (lv + 0.15) * sp; g = g * (1 - sp2) + (lv * 0.5) * sp2; g += 0.012 * n(0.5 * ss, 6)
    return np.clip(g, 0, 1)

def down2_wrap(a):
    """2x → 1x 를 시안처럼 LANCZOS 로 — 타일 가장자리는 wrap 덧대어 이음매 없이."""
    H, W = a.shape; P = 16
    pad = np.pad(a, P, mode='wrap')
    im = Image.fromarray((np.clip(pad, 0, 1) * 65535).astype(np.uint16).astype(np.int32), 'I').convert('F')
    sm = np.asarray(im.resize(((W + 2 * P) // 2, (H + 2 * P) // 2), Image.LANCZOS), np.float32) / 65535
    return sm[P // 2: P // 2 + H // 2, P // 2: P // 2 + W // 2]

def save_gray(a, path):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'L').save(path, optimize=True)

def bake_tiles():
    out = {}
    for name, lv, seed in (('plate', PLATE_LEVEL, 1), ('ground', GROUND_LEVEL, 7)):
        g2 = granite_wrap(TILE * 2, TILE * 2, lv, seed, 2)          # 2x 화소에서 시안 SS=2 와 같은 흐림 폭
        save_gray(g2, os.path.join(OUT, f'{name}@2x.png'))
        save_gray(down2_wrap(g2), os.path.join(OUT, f'{name}.png'))
        out[name] = {'mean2x': float(g2.mean())}
    return out

# ── ⓑ 모따기 9조각 — mono.render 의 블록 높이 · 빛 식 그대로, 평평한 면(sh=1)은 알파 0 ───────────────
def bevel_overlay(ss):
    S = 4 * SLICE                        # 블록 한 변(1x) — 가운데는 평평
    H = W = S * ss; P = 4 * ss
    B = np.zeros((H + 2 * P, W + 2 * P), np.float32); B[P:P + H, P:P + W] = 1
    Bb = B > 0.5
    bd = nd.distance_transform_edt(Bb).astype(np.float32)
    bev = np.clip(bd / (BEVEL * ss), 0, 1)
    Hh = bev * BEVEL * ss * 0.9
    Hs = nd.gaussian_filter(Hh, 0.5 * ss)
    gy, gx = np.gradient(Hs)
    L = np.array(LIGHT, np.float32); L /= np.linalg.norm(L)
    nz = np.sqrt(gx * gx + gy * gy + 1)
    sh = np.clip((-gx * L[0] - gy * L[1] + L[2]) / nz / L[2], 0.35, 1.7)
    Bi = nd.gaussian_filter(Bb.astype(np.float32), 0.5 * ss)
    m = PLATE_LEVEL
    # 돌 m 위에서 col*sh 가 되게: 어두우면 검정 알파 1-sh, 밝으면 흰 알파 m(sh-1)/(1-m)
    c = (sh > 1).astype(np.float32)
    a = np.where(sh > 1, m * (sh - 1) / (1 - m), 1 - sh)
    a = np.clip(a, 0, 1) * Bi
    a = a[P:P + H, P:P + W]; c = c[P:P + H, P:P + W]
    return c, a

def save_overlay(c, a, path, ss):
    if ss == 1:  # 2x 에서 1x 로: 미리곱한 값으로 2×2 평균
        pc = c * a
        H, W = a.shape
        a = a.reshape(H // 2, 2, W // 2, 2).mean((1, 3)); pc = pc.reshape(H // 2, 2, W // 2, 2).mean((1, 3))
        c = np.where(a > 1e-4, pc / np.maximum(a, 1e-4), 0)
    rgba = np.zeros(a.shape + (4,), np.uint8)
    v = (np.clip(c, 0, 1) * 255 + 0.5).astype(np.uint8)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = v
    rgba[..., 3] = (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(path, optimize=True)

# ── ⓓ 바닥 그림자 9조각 — 시안 render: 블록을 (6, 8) 밀어 σ=9 흐림 · 바닥 × (1 − 0.6·그림자) → 검정 알파 0.6·흐림 ──────
#   box-shadow 흐림은 WebKit(소프트)에서 글자 하나 바뀔 때마다 판 그림자를 다시 흐려 비싸다(바꿈 56 → 26ms · 재기 T1071) — 그림으로 굽는다.
SH_M, SH_S = 32, 64            # 9조각 바깥 여유 · 조각 한 변(1x)
def bake_shadow():
    for ss, name in ((2, 'shadow@2x.png'), (1, 'shadow.png')):
        n = 2 * SH_S + 96          # 가운데 96 은 늘어나는 몫
        H = W = n * ss
        B = np.zeros((H, W), np.float32); B[SH_M * ss:(n - SH_M) * ss, SH_M * ss:(n - SH_M) * ss] = 1
        a = nd.gaussian_filter(B, 9 * ss) * 0.6
        rgba = np.zeros((H, W, 4), np.uint8); rgba[..., 3] = (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name), optimize=True)

def bake_bevel():
    c, a = bevel_overlay(2)
    save_overlay(c, a, os.path.join(OUT, 'bevel@2x.png'), 2)
    save_overlay(c, a, os.path.join(OUT, 'bevel.png'), 1)

# ── ⓒ 글꼴 — Noto CJK KR(OFL) 세 벌 · KS X 1001 한글 2,350 자 + ASCII · 기호 ─────────────────────
NOTO = '/usr/share/fonts/opentype/noto/'
FONTS = (('oseok-serif-bold', 'NotoSerifCJK-Bold.ttc'), ('oseok-sans-bold', 'NotoSansCJK-Bold.ttc'), ('oseok-sans-medium', 'NotoSansCJK-Medium.ttc'))
def charset():
    cs = set(chr(c) for c in range(0x20, 0x7f))
    for cp in range(0xAC00, 0xD7A4):
        ch = chr(cp)
        try:
            if len(ch.encode('euc-kr')) == 2: cs.add(ch)
        except UnicodeEncodeError: pass
    cs.update('·…—–‘’“”「」『』〈〉《》【】※▲▼△▽◆◇○●□■→←↑↓×÷±%‰℃°㎏㎞㎡')
    cs.update(chr(c) for c in range(0x3131, 0x3164))   # 한글 호환 자모(ㄱ … ㅣ)
    return cs

def bake_fonts():
    from fontTools.ttLib import TTCollection
    from fontTools import subset
    text = ''.join(sorted(charset()))
    for out, ttc in FONTS:
        f = TTCollection(NOTO + ttc).fonts[1]           # index 1 = KR
        opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['kern']; opt.name_IDs = ['*']; opt.notdef_outline = True
        # ↑ locl(KOR) 은 뺀다 — lang=ko 에서 빈칸 폭이 시안(PIL)과 달라진다(0.279em ↔ 0.225em)
        opt.hinting = False; opt.desubroutinize = True
        s = subset.Subsetter(opt); s.populate(text=text); s.subset(f)
        f.flavor = 'woff2'; f.save(os.path.join(OUT, 'fonts', out + '.woff2'))
    return len(text)

if __name__ == '__main__':
    os.makedirs(os.path.join(OUT, 'fonts'), exist_ok=True)
    info = {'tiles': bake_tiles()}
    bake_bevel()
    bake_shadow()
    if '--no-fonts' not in sys.argv: info['chars'] = bake_fonts()
    sizes = {}
    for dp, _, fs in os.walk(OUT):
        for fn in fs: p = os.path.join(dp, fn); sizes[os.path.relpath(p, OUT)] = os.path.getsize(p)
    info['sizes'] = dict(sorted(sizes.items()))
    print(json.dumps(info, ensure_ascii=False, indent=1))
