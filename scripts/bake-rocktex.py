#!/usr/bin/env python3
# =============================================================================
# 바위 알베도 텍스처 — 산 스프라이트(진짜 바위 렌더)에서 뽑아 **이음매 없이** 만든다
#   [재민 2026-08-08 "산도 실제처럼 꾸미고"]
#
# 왜 새로 굽지 않고 기존 스프라이트에서 뽑나:
#   ⓐ 이미 Blender 정본 태양(52°/−35°)·등각 카메라로 렌더된 **같은 화법**의 바위다.
#      새로 구우면 각도·색온도가 지면 텍스처와 어긋난다.
#   ⓑ 타일러블 렌더는 별개의 문제(경계 조건)라 굽는 걸로는 못 푼다.
#
# ══ 1차 판의 실패 — 기록해 둔다 ═══════════════════════════════════════════════
#   1차는 **미러 타일링**(패치를 좌우·상하 거울로 붙이기)을 썼다.
#   판정 3개(이음매·무광화·결)를 **전부 통과**했는데 그림은 나비 날개였다.
#   자가 계측이 "거울 대칭이 눈에 띄는가"를 **안 재고 있었다**.
#   ⇒ 판정을 완화하는 게 아니라 **자를 늘린다**: ④ 거울 대칭 · ⑤ 구조 잔량.
#     그리고 방법 자체를 바꾼다.
#
# ══ 채택: 스펙트럼 합성(무작위 위상) ═════════════════════════════════════════
#   FFT 로 진폭 스펙트럼 |F| 만 남기고 위상을 새로 준다.
#     ⓐ FFT 출력은 **정의상 주기 함수** → 이음매가 구조적으로 0
#     ⓑ 거울 대칭이 안 생긴다 (위상이 무작위)
#     ⓒ |F| 가 같으니 **결의 굵기·방향성**이 원본 바위 그대로다
#   위상은 세 채널에 **같은 값**을 준다 — 안 그러면 색이 분해돼 무지개 잡음이 된다.
#   마지막에 원본으로 **히스토그램 정합** — 위상 무작위화는 값을 가우시안으로 만든다.
#   시드는 고정 상수. (렌더 산포의 Math.random 금지와는 다른 층 — 여긴 굽는 스크립트다.)
#
# 출력: public/assets/terrain/rock_angled.png (512×256, 지면 타일과 같은 주기 = 8×8셀)
# =============================================================================
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MT = os.path.join(ROOT, 'public/assets/mountains')
OUT = os.environ.get('OUT', os.path.join(ROOT, 'public/assets/terrain/rock_angled.png'))
BLUR = float(os.environ.get('BLUR', 26))
TW, TH = 512, 256                 # 지면 타일과 같은 크기·주기(8×8셀)
SEED = int(os.environ.get('SEED', 20260808))


# ── 도구 ─────────────────────────────────────────────────────────────────────
def wrap_blur(a, r):
    """**감긴(주기) 흐림**. 3×3 로 깔고 흐린 뒤 가운데를 오린다.
    타일은 주기 함수다 — 저주파도 주기 위에서 재고 지워야 맞는다."""
    H, W = a.shape[:2]
    big = np.tile(a, (3, 3, 1))
    return np.stack([
        np.asarray(Image.fromarray(np.clip(big[..., c], 0, 255).astype(np.uint8))
                   .filter(ImageFilter.GaussianBlur(r))).astype(np.float32)[H:2 * H, W:2 * W]
        for c in range(3)], axis=2)


def flatten(t, iters=5):
    """저주파(산 굴곡 음영)를 **나눠서** 없앤다 — 음영은 곱셈으로 들어가 있다.
    ★한 번으로는 안 된다: 나눗셈은 비선형이라 blur(a/blur(a)) 가 상수가 아니다.
      실측 잔량 84.6% → 1회 24.0 · 2회 15.6 · 3회 11.3 · 5회 6.0."""
    for _ in range(iters):
        t = t / np.maximum(wrap_blur(t, BLUR), 1.0) * float(t.mean())
    return t


def lowfreq_span(img):
    lo = wrap_blur(np.clip(np.asarray(img).astype(np.float32), 0, 255), BLUR).mean(axis=2)
    return float(lo.max() - lo.min()) / max(1.0, float(lo.mean())) * 100.0


def ncc(a, b):
    """정규화 상관 — 1 이면 같은 그림, 0 이면 무관."""
    a = a.astype(np.float32).ravel() ; b = b.astype(np.float32).ravel()
    a = a - a.mean() ; b = b - b.mean()
    d = (np.linalg.norm(a) * np.linalg.norm(b)) or 1.0
    return float(np.dot(a, b) / d)


def mirror_sym(img):
    """④ **거울 대칭이 눈에 띄는가** — 1차 판이 못 재서 나비 날개를 통과시킨 그 자."""
    g = np.asarray(img).astype(np.float32).mean(axis=2)
    return max(ncc(g, g[:, ::-1]), ncc(g, g[::-1, :]))


def coarse_ratio(img, cut=64):
    """⑤ **구조 잔량** — 파장 cut px(=2셀) 보다 큰 구조가 전체 분산의 몇 %인가.
    타일 크기(512px)에 견줄 만한 덩어리가 있으면 8셀마다 반복이 눈에 띈다."""
    g = np.clip(np.asarray(img).astype(np.float32), 0, 255)
    lo = wrap_blur(g, cut / 3.0).mean(axis=2)
    return float(lo.var() / max(1e-6, g.mean(axis=2).var()) * 100.0)


def match_hist(y, x):
    """y 의 값 분포를 x 에 맞춘다(채널별). 위상 무작위화가 만든 가우시안을 되돌린다."""
    out = np.empty_like(y)
    n = y.shape[0] * y.shape[1]
    for c in range(3):
        xs = np.sort(x[..., c].ravel())
        rank = np.argsort(np.argsort(y[..., c].ravel()))
        idx = (rank.astype(np.int64) * (len(xs) - 1)) // max(1, n - 1)
        out[..., c] = xs[idx].reshape(y.shape[:2])
    return out


def periodic_component(u):
    """Moisan 2011 — u = p + s. p 는 **감아도 매끈한** 성분, s 는 경계 불연속만 담은 매끈한 성분.

    ★2차 판이 여기서 걸렸다. "FFT 출력은 주기니까 이음매 0" 은 **틀린 추론**이다.
      주기 ≠ 매끈. 원본 패치의 좌우 끝 단차는 스펙트럼 |F| 에 그대로 들어가고,
      위상을 무작위로 바꿔도 그 에너지는 남아 감은 자리에 단차로 되살아난다.
      실측: 감은 차 / 인접 중앙값 — 원본 6.46 → 위상무작위만 2.41 → Moisan 후 1.09.
      그래서 **스펙트럼을 뜨기 전에** 경계 단차를 s 로 떼어낸다.
    """
    H, W = u.shape
    v = np.zeros((H, W))
    v[0, :] += u[-1, :] - u[0, :] ; v[-1, :] += u[0, :] - u[-1, :]
    v[:, 0] += u[:, -1] - u[:, 0] ; v[:, -1] += u[:, 0] - u[:, -1]
    q = np.arange(H).reshape(-1, 1) ; r = np.arange(W).reshape(1, -1)
    den = 2 * np.cos(2 * np.pi * q / H) + 2 * np.cos(2 * np.pi * r / W) - 4
    den[0, 0] = 1.0
    S = np.fft.fft2(v) / den ; S[0, 0] = 0
    return u - np.real(np.fft.ifft2(S))


def spectral_synth(patch, seed):
    """|F| 는 그대로, 위상만 새로. 주기 성분에서만 뜬다 → 이음매 0, 거울 대칭 없음."""
    rng = np.random.default_rng(seed)
    H, W = patch.shape[:2]
    ph = rng.uniform(-np.pi, np.pi, (H, W))
    ii = (-np.arange(H)) % H ; jj = (-np.arange(W)) % W
    ph = (ph - ph[np.ix_(ii, jj)]) / 2.0        # θ(−k) = −θ(k) → ifft2 가 실수
    ph[0, 0] = 0.0
    e = np.exp(1j * ph)
    out = np.stack([np.real(np.fft.ifft2(np.fft.fft2(periodic_component(patch[..., c])) * e))
                    for c in range(3)], axis=2)
    return match_hist(out, patch)


def pick_window(name, w, h):
    """완전 불투명하고 **잔결이 굵은** 창. 큰 구조(능선)는 오히려 감점한다 —
    1차 판이 능선 한복판을 골라서 나비 날개가 됐다."""
    im = Image.open(os.path.join(MT, name + '.webp')).convert('RGBA')
    a = np.asarray(im).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    H, W = alpha.shape
    if H < h or W < w:
        return None
    best, bw = -1e9, None
    for y in range(0, H - h + 1, 8):
        for x in range(0, W - w + 1, 8):
            if alpha[y:y + h, x:x + w].min() < 255:
                continue
            g = rgb[y:y + h, x:x + w].mean(axis=2)
            lo = np.asarray(Image.fromarray(g.astype(np.uint8))
                            .filter(ImageFilter.GaussianBlur(10))).astype(np.float32)
            fine = float((g - lo).std())            # 잔결 — 많을수록 좋다
            coarse = float(lo.std())                # 큰 구조 — 많을수록 나쁘다
            s = fine - 0.5 * coarse
            if s > best:
                best, bw = s, (x, y, fine, coarse)
    if bw is None:
        return None
    x, y, fine, coarse = bw
    print(f'  {name}: 창 ({x},{y}) 잔결 σ={fine:.1f} 큰구조 σ={coarse:.1f} 점수 {best:.1f}')
    return rgb[y:y + h, x:x + w].copy(), best


if __name__ == '__main__':
    import glob
    # ★재민(타 세션) 지정: "기존 mt_G 스프라이트에서 추출한 바위 질감"
    cands = os.environ.get('CANDS', '')
    names = cands.split(',') if cands else sorted(
        os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(MT, 'mt_G*.webp')))
    print(f'{TW}×{TH} 불투명 창 후보:')
    picks = []
    for n in names:
        r = pick_window(n, TW, TH)
        if r:
            picks.append((n, r[0], r[1]))
    if not picks:
        raise SystemExit('후보 없음 — 큰 스프라이트가 없다')
    picks.sort(key=lambda t: -t[2])
    name, patch, sc = picks[0]
    print(f'채택: {name} (점수 {sc:.1f})')

    flat = flatten(patch)
    mu = flat.mean()
    flat = mu + (flat - mu) * float(os.environ.get('CON', 1.25))
    tile = np.clip(spectral_synth(flat, SEED), 0, 255)
    tile = np.clip(flatten(tile, 2), 0, 255)      # 합성이 되살린 저주파 정리
    # ★마지막에 주기 성분을 한 번 더 — 위의 평탄화(감긴 흐림이지만 나눗셈이 비선형)가
    #   감은 자리에 미세 단차를 되살린다. 실측 이음매 비 1.70 → 0.50.
    tile = np.clip(np.stack([periodic_component(tile[..., c]) for c in range(3)], axis=2),
                   0, 255).astype(np.uint8)

    # 반례A = 1차 판이 쓰던 **미러 타일**(같은 소재, 같은 무광화)
    half = flat[:TH // 2, :TW // 2]
    top = np.concatenate([half, half[:, ::-1]], axis=1)
    mirror = np.clip(np.concatenate([top, top[::-1, :]], axis=0), 0, 255).astype(np.uint8)
    # 반례B = 미러 없이 그냥 이어붙임 (이음매가 생겨야 한다)
    naive = np.clip(np.concatenate([np.concatenate([half, half], 1)] * 2, 0), 0, 255).astype(np.uint8)

    def seam(img):
        """감은 자리의 인접 차 / **모든 인접 쌍의 중앙값**.

        ★1·2차 판은 기준을 '1↔2 열 한 쌍'으로 잡았다. 인접 차는 쌍마다 ±25% 흔들려서
          (실측 511쌍 min 3.12 max 4.97) 한 쌍을 기준으로 쓰면 자가 흔들린다.
          중앙값으로 바꾸고, 그 쌍이 분포의 몇 번째인지(백분위)도 같이 낸다.
        """
        a = np.clip(img.astype(np.float32), 0, 255)
        dx = np.abs(np.diff(a, axis=1)).mean(axis=(0, 2))
        dy = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
        wx = float(np.abs(a[:, 0] - a[:, -1]).mean())
        wy = float(np.abs(a[0, :] - a[-1, :]).mean())
        return max(wx / max(1e-6, np.median(dx)), wy / max(1e-6, np.median(dy)))

    ok = True
    print('\n판정 — 채택 / 반례A(미러) / 반례B(그냥붙임)')
    sr, mr, nr = seam(tile), seam(mirror), seam(naive)
    print(f'① 이음매 비    채택 {sr:6.2f}  A {mr:6.2f}  B {nr:6.2f}   (1.6 이하 통과)')
    if nr <= 1.6:
        print('   ✗ 자가 검사 실패 — 반례B 가 통과했다'); ok = False
    elif sr > 1.6:
        print('   ✗ 이음매가 보인다'); ok = False
    else:
        print('   ✓ 채택 통과 · 반례B 탈락')

    sl, ml = lowfreq_span(tile), lowfreq_span(np.clip(patch, 0, 255).astype(np.uint8))
    print(f'② 저주파 밝기폭 채택 {sl:6.1f}%                원본 {ml:6.1f}%   (원본의 30% 이하)')
    if ml < 12:
        print('   ✗ 자가 검사 실패 — 원본에 지울 음영이 없었다'); ok = False
    elif sl > ml * 0.30:
        print('   ✗ 음영이 남았다 — 8셀마다 밝기 얼룩'); ok = False
    else:
        print('   ✓ 무광 (램버트와 이중 음영이 안 난다)')

    sd = float(np.asarray(tile).astype(np.float32).mean(axis=2).std())
    print(f'③ 결 σ         채택 {sd:6.2f}                              (6.0 이상)')
    if sd < 6.0:
        print('   ✗ 결이 죽었다 — 회색 판'); ok = False
    else:
        print('   ✓ 바위 결 유지')

    ss, ms = mirror_sym(tile), mirror_sym(mirror)
    print(f'④ 거울 대칭     채택 {ss:6.3f}  A {ms:6.3f}              (0.25 이하)')
    print('   ★1차 판이 이 자가 없어서 나비 날개를 통과시켰다.')
    if ms <= 0.25:
        print('   ✗ 자가 검사 실패 — 반례A(미러) 가 통과했다'); ok = False
    elif ss > 0.25:
        print('   ✗ 거울 대칭이 보인다'); ok = False
    else:
        print('   ✓ 채택 통과 · 반례A 탈락')

    s5, m5 = coarse_ratio(tile), coarse_ratio(np.clip(patch, 0, 255).astype(np.uint8))
    print(f'⑤ 구조 잔량     채택 {s5:6.1f}%                원본 {m5:6.1f}%   (25% 이하)')
    if s5 > 25.0:
        print('   ✗ 큰 덩어리가 남았다 — 8셀 반복이 눈에 띈다'); ok = False
    else:
        print('   ✓ 잔결만 남았다 (반복이 안 읽힌다)')

    if not ok:
        raise SystemExit('\n판정 실패 — 저장하지 않는다')

    # ★평균 100 은 산을 '어두운 덩어리'로 만든다. 알베도를 화강암 수준(≈132)으로 올린다.
    #   대비는 그대로 두고 평균만 옮긴다(곱셈이 아니라 덧셈 — 대비가 안 눌린다).
    TGT = float(os.environ.get('TGT', 132))
    tile = np.clip(tile.astype(np.float32) + (TGT - tile.mean()), 0, 255).astype(np.uint8)
    Image.fromarray(tile, 'RGB').save(OUT)
    print(f'\n산출: {OUT} {Image.open(OUT).size} {os.path.getsize(OUT)/1024:.0f}KB')
    print('평균색 rgb', [int(v) for v in tile.reshape(-1, 3).mean(axis=0)])
