#!/usr/bin/env python3
# ore-outcrop.py — 광맥 자원 스프라이트를 **노두(露頭)**로 재생성 [재민 확정 2026-08-06]
#
# ★왜: 기존 ore01..06 은 바위에 **주황 결정이 솟은 게임식 표식**이었다.
#   재민 지적 — "광맥은 눈에 보이는 게 아니라 그냥 구역인데".
#   광맥(terrain 의 ores)은 실제로 **보이지 않는 구역**이고(자원 스폰 밀도와 광종만 정한다),
#   플레이어가 화면에서 보는 건 지표에 드러난 **바위**다. 그래서:
#     · 바위 스프라이트(rock01..06)를 **그대로 몸통으로 쓰고**
#     · 표면에 **은은한 광물 변색**(적갈 = 산화철 · 녹청 = 공작석 계열)만 얼룩으로 얹는다.
#   ⇒ 눈에 보이는 건 '바위'다. 캐 보면 광물이 나온다 — 발견의 재미가 살고 고증에도 맞다.
#
# ★결정론: 자리 해시가 아니라 **파일 인덱스 시드**로만 얼룩을 만든다(같은 입력 → 같은 출력).
# ★알파 무변: 실루엣은 바위 그대로다. 색만 곱셈/오버레이로 얹는다.
#
# 실행: python3 scripts/ore-outcrop.py
import math, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
NATURE = os.path.join(os.path.dirname(HERE), "public", "assets", "nature")

# 광종 색 — 광맥은 광종을 알려주지 않는다(클라는 자리 해시로 스프라이트를 고른다).
#   그래서 6장을 한 벌의 '광화된 바위'로 읽히게 적갈·녹청을 섞어 배분한다.
RUST = (150, 74, 34)     # 산화철 — 적갈
VERD = (58, 122, 96)     # 공작석·남동석 계열 — 녹청
# ★1패스 실측: 얼룩 피복 68~87% 는 '광물이 낀 바위'가 아니라 **칠한 바위**로 읽혔다.
#   재민 지시는 '은은한 얼룩'이다 — 세기와 얼룩 크기를 함께 낮춰 40~55% 대로 맞춘다.
MIX = [(RUST, 0.46), (VERD, 0.40), (RUST, 0.36), (VERD, 0.48), (RUST, 0.40), (VERD, 0.34)]


class R:
    def __init__(self, seed): self.s = (seed * 2654435761) & 0xFFFFFFFF
    def f(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


def blotch_mask(w, h, seed, blobs=6):
    """저주파 얼룩 — 균일한 물 들이기가 아니라 '광맥이 지나간 자국'처럼 뭉쳐야 한다."""
    rng = R(seed)
    cx = [rng.f() for _ in range(blobs)]
    cy = [rng.f() for _ in range(blobs)]
    rr = [0.11 + 0.19 * rng.f() for _ in range(blobs)]
    el = [0.45 + 1.4 * rng.f() for _ in range(blobs)]      # 타원 비 — 띠처럼 늘어지게
    an = [rng.f() * math.pi for _ in range(blobs)]
    m = Image.new("L", (w, h), 0)
    px = m.load()
    for y in range(h):
        fy = y / h
        for x in range(w):
            fx = x / w
            v = 0.0
            for i in range(blobs):
                dx, dy = fx - cx[i], fy - cy[i]
                ca, sa = math.cos(an[i]), math.sin(an[i])
                ux = (dx * ca + dy * sa) / el[i]
                uy = (-dx * sa + dy * ca) * el[i]
                d = math.sqrt(ux * ux + uy * uy) / rr[i]
                if d < 1.0:
                    v += (1.0 - d) ** 1.6
            px[x, y] = int(255 * min(1.0, v))
    return m


for i in range(1, 7):
    src = os.path.join(NATURE, f"rock{i:02d}.png")
    dst = os.path.join(NATURE, f"ore{i:02d}.png")
    rock = Image.open(src).convert("RGBA")
    w, h = rock.size
    col, strength = MIX[i - 1]
    mask = blotch_mask(w, h, seed=911 + i * 37)
    rp, gp, bp, ap = rock.split()
    tinted = Image.new("RGBA", (w, h))
    tp = tinted.load(); sp = rock.load(); mp = mask.load()
    stained = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a == 0:
                tp[x, y] = (r, g, b, a); continue
            t = (mp[x, y] / 255.0) * strength
            if t > 0.02: stained += 1
            # 곱셈 + 약한 발광 — 바위 명암(질감)은 그대로 살리고 색만 물든다
            lum = (r * 0.30 + g * 0.59 + b * 0.11) / 255.0
            nr = r * (1 - t) + col[0] * t * (0.55 + 0.75 * lum)
            ng = g * (1 - t) + col[1] * t * (0.55 + 0.75 * lum)
            nb = b * (1 - t) + col[2] * t * (0.55 + 0.75 * lum)
            tp[x, y] = (int(min(255, nr)), int(min(255, ng)), int(min(255, nb)), a)
    tinted.save(dst)
    opaque = sum(1 for y in range(h) for x in range(w) if sp[x, y][3] > 0)
    print(f"  ore{i:02d} ← rock{i:02d} {rock.size}  광물 얼룩 {stained}/{opaque}px "
          f"({stained/max(1,opaque)*100:.0f}%)  색 {'적갈' if col == RUST else '녹청'}")
print("[ore] 노두 6종 재생성 — 실루엣(알파)은 바위와 동일, 색만 변색")
