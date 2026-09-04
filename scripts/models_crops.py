#!/usr/bin/env python3
# =============================================================================
# scripts/models_crops.py — 작물 수확물·씨앗 아이콘 [재민 확정 2026-09-03 · T79]
#
# ★★T77 §12 문법대로다: 헬퍼는 `render_common` 한 벌 · 팔레트는 이 파일 · 렌더는 프리셋 이름.
#   새 모델군이라 `models_<군>.py` 로 낸다. 재질 datablock 접두는 **`g_`**(곡식 crop).
#
# ★★씨앗 규약 [T79 §0-ⓐ 실측 — 서버가 정본이다]
#   `server/crops.js` 가 씨앗을 **다른 품목 id** 로 갖는다: `SEED_PREFIX = 'seed_'` ⇒ `seed_rice`.
#   무게도 다르다 — 작물 0.45~0.75kg vs `SEED_KG` **0.02kg**(한 줌). 30배 차이다.
#   그런데 `koOf` 는 "<작물> 씨앗", `emojiOf` 는 씨앗 **전부 `🌰`** — 모양 규약이 **없었다**.
#   ⇒ 여기서 짓는다. 그리고 크기로는 못 짓는다(`icons-postprocess.js` 가 전부 96px 를 채운다 ·
#      T72 §0-ⓒ). **그릇으로 짓는다**:
#        · 수확물 = 밭에서 온 꼴 — 이삭·꼬투리에 **짚·줄기가 붙어 있다**.
#        · 씨앗   = 알곡만 **토기 접시에 담긴 한 줌** — 줄기가 없다.
#      접시는 **낮고 넓다**. 이미 있는 토기(단지 `berry_jam`·`pickled_veg`)는 높고 좁아서
#      26px 에서 실루엣이 갈린다. 그리고 접시는 **열려 있어야 한다** — 주머니로 덮으면
#      씨앗 14장이 서로 똑같아진다(그게 더 큰 실패다).
#
# ★모델 재사용 세 층(T76 §9-A) 중 **첫째 층**을 쓴다 — 같은 함수, 다른 인자:
#     `_ear(..., seed=True)` · `_pod(..., seed=True)` …
#   `scripts/test-icons.js ⑥` 이 "두 `m_*` 가 같은 `_빌더` 를 부르는가"로 계보를 지킨다.
#
# ★고증: 청동기 후기(송국리). 낟알 모양이 **종을 가르는 유일한 단서**다 —
#   세계 스프라이트는 `grain`/`veg` 두 벌뿐이고, 그나마 좌표 해시로 고른다(T79 §0-ⓑ 실측).
#
# 실행:  python3 scripts/models_crops.py            (컨테이너 · pip `bpy` 5.0.1 — 굽는 기계 정본)
#        CROPS_ONLY=rice,seed_rice … 일부만
# 결과:  scripts/crop_icon_renders/<key>.png (512²) → `icons-postprocess.js` 가 96px 로
# =============================================================================

import bpy, os, math, random, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_common import (V, RES_ICON, SAMPLES, ISO_DIR, OBJS,
                           principled, simple_mat, striped_mat, bumped_mat,
                           add, box, cyl, cone, ico, plane, cord)
import render_common as rc

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_I = os.path.join(HERE, "crop_icon_renders")
os.makedirs(OUT_I, exist_ok=True)

scene, cam, cam_d, sun, tgt = rc.build_scene("crops")

# ═══════════════ 팔레트 — 이 파일의 것(접두 `g_`) ═══════════════
M = {}
M['straw']   = striped_mat("g_straw", (0.74, 0.62, 0.32), (0.60, 0.49, 0.24), 30, 0.82, bump=0.35, dist=3.0)   # 마른 볏짚 대
M['stem']    = striped_mat("g_stem", (0.52, 0.55, 0.26), (0.40, 0.44, 0.19), 26, 0.72, bump=0.35, dist=3.0)    # 아직 푸른 대
M['gold']    = striped_mat("g_gold", (0.80, 0.64, 0.24), (0.66, 0.51, 0.17), 34, 0.58, bump=0.40, dist=3.0)    # 익은 낟알(벼·밀)
M['amber']   = striped_mat("g_amber", (0.74, 0.58, 0.22), (0.58, 0.44, 0.15), 32, 0.60, bump=0.40, dist=3.0)   # 보리 낟알(조금 더 탁하다)
M['awn']     = simple_mat("g_awn", (0.86, 0.78, 0.46), 0.55)                                                   # 까끄라기 — 밝고 가늘다
M['millet']  = simple_mat("g_millet", (0.82, 0.70, 0.30), 0.62)                                                # 조·기장 잔 낟알
M['sorg']    = simple_mat("g_sorg", (0.60, 0.28, 0.16), 0.58)                                                  # 수수 — 붉은 갈색
M['barn']    = simple_mat("g_barn", (0.60, 0.58, 0.32), 0.68)                                                  # 피 — 녹갈색(잡초성이라 탁하다)
M['bead']    = bumped_mat("g_bead", (0.60, 0.52, 0.36), (0.44, 0.37, 0.24), 6, 0.20, 0.34)                      # 율무 — 단단한 구슬(염주를 만들던 것)
M['buck']    = simple_mat("g_buck", (0.32, 0.24, 0.16), 0.50)                                                  # 메밀 — 검은 갈색 세모 씨
M['podfuzz'] = bumped_mat("g_podfuzz", (0.64, 0.57, 0.28), (0.48, 0.42, 0.19), 22, 0.70, 0.94)                  # 대두 꼬투리 — 잔털
M['poddry']  = striped_mat("g_poddry", (0.52, 0.42, 0.22), (0.40, 0.31, 0.15), 24, 0.80, bump=0.35, dist=3.0)   # 마른 꼬투리(팥·녹두)
M['soy']     = simple_mat("g_soy", (0.84, 0.74, 0.40), 0.45)                                                   # 대두 알 — 노랗고 둥글다
M['azuki']   = simple_mat("g_azuki", (0.56, 0.16, 0.12), 0.45)                                                 # 팥 — 짙은 붉은색
M['hilum']   = simple_mat("g_hilum", (0.90, 0.88, 0.82), 0.55)                                                 # 팥 배꼽(흰 줄) — 팥의 표식
M['mung']    = simple_mat("g_mung", (0.34, 0.46, 0.16), 0.42)                                                  # 녹두 — 짙은 초록
M['perilla'] = bumped_mat("g_perilla", (0.50, 0.42, 0.32), (0.36, 0.30, 0.22), 30, 0.45, 0.62)                  # 들깨 — 회갈색 그물 무늬
M['sesame']  = simple_mat("g_sesame", (0.90, 0.86, 0.74), 0.42)                                                # 참깨 — 납작한 흰 씨
M['capsule'] = striped_mat("g_capsule", (0.62, 0.58, 0.30), (0.48, 0.45, 0.22), 20, 0.72, bump=0.35, dist=3.0)  # 참깨 삭과(꼬투리)
M['dish']    = bumped_mat("g_dish", (0.54, 0.35, 0.23), (0.42, 0.26, 0.16), 8, 0.35, 0.88)                      # 민무늬토기 접시 — 낮고 넓다


# ═══════════════ 그릇 — 씨앗 규약의 몸 ═══════════════
def _dish(r=0.62):
    """민무늬토기 **낮고 넓은 접시**. 씨앗 아이콘의 그릇이다.
    ★높지 않다 — 단지(`berry_jam`·`pickled_veg`)와 26px 에서 실루엣이 갈려야 한다."""
    cyl(r, 0.10, (0, 0, 0.05), mat=M['dish'], verts=28, smooth=True)          # 굽
    o = cyl(r * 1.16, 0.20, (0, 0, 0.18), mat=M['dish'], verts=28, smooth=True)  # 벌어진 전
    o.scale = (1.0, 1.0, 1.0)
    cyl(r * 1.02, 0.04, (0, 0, 0.27), mat=M['dish'], verts=28, smooth=True)   # 안쪽 바닥(살짝 오목하게 보이도록)


def _heap(fn, n=34, r=0.62, seed=7):
    """접시에 담긴 낟알 한 줌 — 알을 무더기로 앉힌다. `fn(x, y, z, i)` 가 알 하나를 만든다."""
    random.seed(seed)
    for i in range(n):
        a = random.uniform(0, 2 * math.pi)
        d = r * math.sqrt(random.uniform(0, 1))
        x, y = math.cos(a) * d, math.sin(a) * d
        z = 0.30 + (r - d) * 0.52 + random.uniform(0.0, 0.06)      # 가운데가 봉긋(더 높이 쌓는다)
        fn(x, y, z, i)


# ═══════════════ 빌더 ① 이삭 — 벼·보리·밀·조·기장·수수·피 ═══════════════
def _ear(kernel, ker_r=0.055, ker_scale=(0.72, 0.72, 1.5), rows_n=7, per_row=4,
         axis_len=1.5, spread=0.10, droop=0.0, awn=0.0, awn_len=0.55,
         panicle=0.0, straw=True, seed=False, seed_n=40, seed_scale=None, sd=101):
    """이삭 하나 + 대. `seed=True` 면 **대를 떼고 낟알만 접시에** 담는다(씨앗 규약).

    kernel     낟알 재질            ker_r/ker_scale  낟알 크기·모양
    rows_n×per_row  이삭에 붙는 낟알 수     spread  이삭 굵기
    droop      고개 숙임(벼)         awn     까끄라기 길이 비율(보리는 크게)
    panicle    가지 벌어짐(기장)      straw   마른 대인가 푸른 대인가
    """
    random.seed(sd)
    if seed:
        _dish()
        sc = seed_scale or (ker_scale[0] * 1.1, ker_scale[1] * 1.1, ker_scale[2] * 0.80)
        _heap(lambda x, y, z, i: ico(ker_r * 1.25, (x, y, z), subdiv=2, mat=kernel,
                                     scale=sc, jitter=0.10, smooth=True),
              n=seed_n, r=0.60, seed=sd + 1)
        return
    # ── 대(짚) ──
    mat_stem = M['straw'] if straw else M['stem']
    cyl(0.035, axis_len * 0.95, (0, 0, axis_len * 0.42), rot=(0, math.radians(4), 0),
        mat=mat_stem, verts=8, smooth=True)
    # 잎 하나 — 이삭만 있으면 '털 뭉치'로 읽힌다
    plane(0.055, 0.62, (0.16, 0.02, axis_len * 0.34),
          rot=(math.radians(74), 0, math.radians(20)), mat=mat_stem)
    # ── 이삭 ──
    top = axis_len * 0.86
    for r in range(rows_n):
        t = r / max(1, rows_n - 1)                     # 0 = 이삭 밑, 1 = 끝
        z = top + t * (axis_len * 0.52)
        bend = droop * (t ** 2)                        # 고개 숙임은 끝으로 갈수록
        cx = bend * 0.60
        rad = spread * (1.0 - 0.45 * t) + panicle * t * 0.45
        for k in range(per_row):
            a = k * (2 * math.pi / per_row) + r * 0.9
            px = cx + math.cos(a) * rad
            py = math.sin(a) * rad
            ico(ker_r, (px, py, z - bend * 0.28), subdiv=2, mat=kernel,
                scale=ker_scale, jitter=0.10, smooth=True)
            if awn > 0:
                cyl(0.008, awn_len * awn, (px + math.cos(a) * 0.05, py + math.sin(a) * 0.05,
                                           z + awn_len * awn * 0.45),
                    rot=(math.sin(a) * 0.30, -math.cos(a) * 0.30, 0), mat=M['awn'], verts=4, smooth=False)


# ═══════════════ 빌더 ② 구슬 낟알 — 율무 ═══════════════
def _bead(seed=False, sd=131):
    """율무 — 낟알이 **크고 단단한 구슬**이다(실제로 꿰어 염주를 만들었다).
    다른 곡물과 96px 에서 갈리는 유일한 표식이라 알을 크게 · 적게 놓는다."""
    random.seed(sd)
    if seed:
        _dish()
        _heap(lambda x, y, z, i: ico(0.125, (x, y, z + 0.03), subdiv=2, mat=M['bead'],
                                     scale=(1.0, 1.0, 0.94), jitter=0.05, smooth=True),
              n=15, r=0.52, seed=sd + 1)
        return
    cyl(0.036, 1.45, (0, 0, 0.66), rot=(0, math.radians(5), 0), mat=M['stem'], verts=8, smooth=True)
    plane(0.055, 0.70, (0.17, 0.02, 0.50),
          rot=(math.radians(74), 0, math.radians(24)), mat=M['stem'])
    # ★알을 **작게·여럿·줄기를 따라** — 꿰어 염주를 만들던 것이라 '구슬이 달린 대'로 읽혀야 한다.
    for i in range(13):
        t = i / 12.0
        z = 0.52 + t * 0.94                     # 대의 절반을 따라 — 뭉치지 않게
        a = i * 2.3
        r = 0.085 + t * 0.035
        ico(0.062, (math.cos(a) * r, math.sin(a) * r, z), subdiv=2, mat=M['bead'],
            scale=(1.0, 0.96, 1.16), jitter=0.04, smooth=True)
        if i % 2 == 0:                     # 알을 받치는 짧은 꼭지 — 대에 '달린' 티
            cyl(0.013, 0.08, (math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, z - 0.05),
                rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0), mat=M['stem'], verts=5, smooth=False)


# ═══════════════ 빌더 ③ 세모 씨 — 메밀 ═══════════════
def _tri(seed=False, sd=141):
    """메밀 — **곡물이 아니라 마디풀과**다. 낟알이 **삼각뿔**이라 그 하나로 갈린다."""
    random.seed(sd)
    def one(x, y, z, rz, s=1.0):
        cone(0.115 * s, 0.0, 0.26 * s, (x, y, z), rot=(0, 0, rz), mat=M['buck'], verts=3)
    if seed:
        _dish()
        _heap(lambda x, y, z, i: one(x, y, z + 0.02, random.uniform(0, 6.28), 0.92),
              n=22, r=0.56, seed=sd + 1)
        return
    cyl(0.032, 1.25, (0, 0, 0.58), rot=(0, math.radians(6), 0), mat=M['stem'], verts=8, smooth=True)
    plane(0.075, 0.42, (0.16, 0.02, 0.52),
          rot=(math.radians(70), 0, math.radians(26)), mat=M['stem'])
    for i, (dx, dy, dz) in enumerate(((0.0, 0.0, 1.24), (0.19, 0.05, 1.10), (-0.17, -0.04, 1.06),
                                      (0.08, -0.16, 0.96), (-0.10, 0.15, 0.92), (0.0, 0.0, 0.82))):
        one(dx, dy, dz, i * 1.1, 1.0)


# ═══════════════ 빌더 ④ 꼬투리 — 콩·팥·녹두 ═══════════════
def _pod(bean, pod_mat, bean_r=0.115, per_pod=3, pods=3, pod_len=0.78, pod_r=0.135,
         hilum=False, seed=False, seed_n=30, sd=151):
    """꼬투리 + 알. `seed=True` 면 꼬투리를 떼고 알만 접시에.

    ★1패스에서 콩 셋이 전부 **애벌레**로 읽혔다 — 알을 축에 꿰니 알이 몸통이 되고 꼬투리가 사라졌다.
      지금은 꼬투리가 **납작한 초승달 몸통**이고, 알은 그 겉으로 비치는 **불룩한 마디**다.
      그리고 맨 앞 하나는 **터진 꼬투리** — 벌어진 사이로 알이 드러난다. 종을 가르는 건 그 알이다:
        · 대두 = 굵고 노랗다(꼬투리에 잔털)  · 팥 = 작고 붉으며 **흰 배꼽**  · 녹두 = 더 잘고 짙은 초록
    """
    random.seed(sd)

    def one_bean(x, y, z, s=1.0):
        ico(bean_r * s, (x, y, z), subdiv=2, mat=bean, scale=(1.25, 1.0, 1.0),
            jitter=0.05, smooth=True)
        if hilum:                                   # 팥 배꼽 — 팥임을 말하는 흰 줄
            o = cyl(bean_r * s * 0.26, bean_r * s * 0.12, (x, y - bean_r * s * 0.88, z),
                    rot=(math.radians(90), 0, 0), mat=M['hilum'], verts=8, smooth=True)
            o.scale = (1.0, 2.2, 1.0)

    def whole_pod(cx, cz, ang, ln, opened=False):
        """납작한 꼬투리 하나. `opened` 면 반쪽만 두고 알을 드러낸다."""
        n = per_pod
        for k in range(n):                          # 몸통 — 마디마다 불룩하게(콩 자리)
            t = (k + 0.5) / n - 0.5
            px = cx + math.cos(ang) * ln * t
            pz = cz + math.sin(ang) * ln * t
            o = ico(pod_r, (px, 0.0, pz), subdiv=2, mat=pod_mat,
                    scale=(1.10, 0.52, 1.16), jitter=0.06, smooth=True)
        o2 = cyl(pod_r * 0.60, ln * 1.02, (cx, 0.0, cz), rot=(0, math.pi / 2 - ang, 0),
                 mat=pod_mat, verts=10, smooth=True)   # 등줄기(꼬투리 봉합선)
        o2.scale = (1.0, 0.42, 1.0)
        cyl(0.028, 0.20, (cx - math.cos(ang) * ln * 0.60, 0.0, cz - math.sin(ang) * ln * 0.60),
            rot=(0, math.pi / 2 - ang, 0), mat=M['stem'], verts=6, smooth=True)   # 꼭지
        if opened:
            for k in range(n):
                t = (k + 0.5) / n - 0.5
                one_bean(cx + math.cos(ang) * ln * t,
                         -pod_r * 0.62,
                         cz + math.sin(ang) * ln * t)

    if seed:
        _dish()
        _heap(lambda x, y, z, i: one_bean(x, y, z + 0.02, 0.95),
              n=seed_n, r=0.56, seed=sd + 1)
        return

    cyl(0.036, 1.15, (0, 0.10, 0.52), rot=(0, math.radians(6), 0), mat=M['stem'], verts=8, smooth=True)
    plane(0.075, 0.44, (0.17, 0.12, 0.46), rot=(math.radians(70), 0, math.radians(26)), mat=M['stem'])
    layout = ((-0.30, 0.98, math.radians(-58)), (0.30, 0.80, math.radians(-118)),
              (-0.02, 0.42, math.radians(-72)))
    for i in range(min(pods, 3)):
        cx, cz, ang = layout[i]
        whole_pod(cx, cz, ang, pod_len, opened=(i == 2))     # 앞의 하나만 터뜨린다


# ═══════════════ 빌더 ⑤ 기름씨 — 들깨·참깨 ═══════════════
def _oil(seedmat, capsule=False, seed=False, seed_n=54, seed_r=0.055,
         seed_scale=(1.0, 1.0, 0.55), sd=161):
    """들깨·참깨. 참깨는 **삭과가 줄기에 세로로 붙는다**(`capsule=True`) — 그게 표식이고,
    들깨는 총상화서에 잔 삭과가 성기게 달린다."""
    random.seed(sd)
    if seed:
        _dish()
        _heap(lambda x, y, z, i: ico(seed_r, (x, y, z + 0.01), subdiv=1, mat=seedmat,
                                     scale=seed_scale, jitter=0.12, smooth=True),
              n=seed_n, r=0.58, seed=sd + 1)
        return
    cyl(0.038, 1.40, (0, 0, 0.66), rot=(0, math.radians(4), 0), mat=M['stem'], verts=8, smooth=True)
    plane(0.085, 0.46, (0.18, 0.02, 0.46),
          rot=(math.radians(68), 0, math.radians(28)), mat=M['stem'])
    if capsule:                       # 참깨 — 줄기에 딱 붙은 세로 삭과
        for i in range(8):
            z = 0.42 + (i // 2) * 0.30
            sgn = 1 if i % 2 == 0 else -1
            ico(0.082, (sgn * 0.105, 0.0, z), subdiv=2, mat=M['capsule'],
                scale=(0.78, 0.70, 1.85), jitter=0.05, smooth=True)         # 가늘고 긴 삭과
            cyl(0.020, 0.10, (sgn * 0.055, 0.0, z - 0.06), rot=(0, sgn * 0.9, 0),
                mat=M['stem'], verts=5, smooth=False)                        # 짧은 꼭지
        for i in range(7):            # 터진 삭과에서 나온 씨
            a = i * 0.9
            ico(0.052, (math.cos(a) * 0.26, math.sin(a) * 0.22, 0.44 + (i % 3) * 0.10),
                subdiv=1, mat=seedmat, scale=seed_scale, jitter=0.10, smooth=True)
    else:                             # 들깨 — 성긴 총상화서
        for i in range(20):
            t = i / 19.0
            z = 0.66 + t * 0.72
            a = i * 1.9
            r = 0.15 * (1.0 - 0.45 * t)
            ico(0.062, (math.cos(a) * r, math.sin(a) * r, z), subdiv=2, mat=M['capsule'],
                scale=(1.0, 1.0, 0.90), jitter=0.10, smooth=True)
            if i % 2 == 0:
                ico(0.040, (math.cos(a) * r * 1.7, math.sin(a) * r * 1.7, z - 0.04),
                    subdiv=1, mat=seedmat, scale=seed_scale, jitter=0.12, smooth=True)


# ═══════════════ 모델 — 곡물 9 ═══════════════
# 고증 한 줄씩(§0-ⓑ 표) — 낟알 모양이 종을 가르는 유일한 단서다.
def m_rice():            _ear(M['gold'], rows_n=8, per_row=4, spread=0.115, droop=0.62,
                              awn=0.35, awn_len=0.40, sd=201)          # 벼 — 고개 숙인 이삭 + 짧은 까끄라기
def m_seed_rice():       _ear(M['gold'], seed=True, seed_n=44, sd=201)  # 볍씨 — 겉겨째(도정 전)

def m_barley():          _ear(M['amber'], rows_n=6, per_row=4, spread=0.095, droop=0.06,
                              awn=1.0, awn_len=0.95, sd=202)           # 보리 — 곧게 서고 **긴 까끄라기**가 부챗살
def m_seed_barley():     _ear(M['amber'], seed=True, seed_n=40, sd=202)

def m_wheat():           _ear(M['gold'], ker_r=0.058, ker_scale=(0.82, 0.82, 1.30),
                              rows_n=7, per_row=4, spread=0.085, droop=0.10,
                              awn=0.30, awn_len=0.30, sd=203)          # 밀 — 까끄라기가 짧고 낟알이 굵다
def m_seed_wheat():      _ear(M['gold'], ker_r=0.065, ker_scale=(0.85, 0.85, 1.25),
                              seed=True, seed_n=36, sd=203)

def m_foxtail_millet():  _ear(M['millet'], ker_r=0.038, ker_scale=(1.0, 1.0, 1.0),
                              rows_n=15, per_row=7, spread=0.115, droop=0.12,
                              axis_len=1.35, sd=204)                    # 조 — 강아지풀 꼴 **원통 이삭**, 잔 낟알 빽빽
def m_seed_foxtail_millet(): _ear(M['millet'], ker_r=0.038, ker_scale=(1.0, 1.0, 1.0),
                                  seed=True, seed_n=62, sd=204)

def m_millet():          _ear(M['millet'], ker_r=0.048, ker_scale=(1.0, 1.0, 0.95),
                              rows_n=8, per_row=5, spread=0.06, panicle=1.0,
                              droop=0.18, axis_len=1.35, sd=205)        # 기장 — 조와 달리 **벌어진 원추화서**
def m_seed_millet():     _ear(M['millet'], ker_r=0.048, ker_scale=(1.0, 1.0, 0.95),
                              seed=True, seed_n=52, sd=205)

def m_sorghum():         _ear(M['sorg'], ker_r=0.062, ker_scale=(1.0, 1.0, 1.0),
                              rows_n=9, per_row=6, spread=0.20, droop=0.0,
                              axis_len=1.55, sd=206)                    # 수수 — 위로 곧게 뭉친 덩이, 굵고 붉은 알
def m_seed_sorghum():    _ear(M['sorg'], ker_r=0.062, ker_scale=(1.0, 1.0, 1.0),
                              seed=True, seed_n=34, sd=206)

def m_adlay():           _bead()                                        # 율무 — 구슬 낟알(염주)
def m_seed_adlay():      _bead(seed=True)

def m_barnyard_millet(): _ear(M['barn'], ker_r=0.040, ker_scale=(1.0, 1.0, 1.05),
                              rows_n=9, per_row=6, spread=0.15, panicle=0.42,
                              droop=0.14, axis_len=1.30, straw=False, sd=208)
                                                                        # 피 — 잡초성. 짧고 뭉툭한 가지 여럿, 성기고 탁하다
def m_seed_barnyard_millet(): _ear(M['barn'], ker_r=0.040, ker_scale=(1.0, 1.0, 1.05),
                                   seed=True, seed_n=58, sd=208)

def m_buckwheat():       _tri()                                         # 메밀 — 삼각뿔 씨
def m_seed_buckwheat():  _tri(seed=True)


# ═══════════════ 모델 — 콩류 3 ═══════════════
def m_soybean():         _pod(M['soy'], M['podfuzz'], bean_r=0.125, per_pod=3, pods=3,
                              sd=211)                                   # 대두 — 잔털 꼬투리 + 굵고 노란 알
def m_seed_soybean():    _pod(M['soy'], M['podfuzz'], bean_r=0.125, seed=True, seed_n=26, sd=211)

def m_azuki():           _pod(M['azuki'], M['poddry'], bean_r=0.088, per_pod=4, pods=3,
                              pod_len=0.86, pod_r=0.105, hilum=True, sd=212)
                                                                        # 팥 — 가는 꼬투리 · 작고 붉은 알 · **흰 배꼽**
def m_seed_azuki():      _pod(M['azuki'], M['poddry'], bean_r=0.088, hilum=True,
                              seed=True, seed_n=40, sd=212)

def m_mungbean():        _pod(M['mung'], M['poddry'], bean_r=0.070, per_pod=5, pods=3,
                              pod_len=0.82, pod_r=0.088, sd=213)        # 녹두 — 더 잘고 짙은 초록
def m_seed_mungbean():   _pod(M['mung'], M['poddry'], bean_r=0.070, seed=True, seed_n=54, sd=213)


# ═══════════════ 모델 — 유료 2 ═══════════════
def m_perilla():         _oil(M['perilla'], capsule=False, sd=221)      # 들깨 — 성긴 총상화서
def m_seed_perilla():    _oil(M['perilla'], seed=True, seed_n=52, seed_r=0.060,
                              seed_scale=(1.0, 1.0, 0.80), sd=221)      # 들깨 씨 — 둥글고 회갈색

def m_sesame():          _oil(M['sesame'], capsule=True, sd=222)        # 참깨 — 줄기에 붙은 세로 삭과
def m_seed_sesame():     _oil(M['sesame'], seed=True, seed_n=64, seed_r=0.052,
                              seed_scale=(1.0, 0.85, 0.40), sd=222)     # 참깨 씨 — **납작하다**


# ═══════════════ 표 ═══════════════
CROPS_A = ['rice', 'barley', 'wheat', 'foxtail_millet', 'millet', 'sorghum',
           'adlay', 'barnyard_millet', 'buckwheat',
           'soybean', 'azuki', 'mungbean', 'perilla', 'sesame']
ITEMS = []
for _c in CROPS_A:
    ITEMS.append((_c, globals()['m_' + _c]))
    ITEMS.append(('seed_' + _c, globals()['m_seed_' + _c]))

# 계보 — 수확물 → 씨앗(같은 빌더, `seed=True`). `test-icons ⑥` 이 읽는다.
CROP_LINEAGE = [(c, 'seed_' + c) for c in CROPS_A]


# ═══════════════ 굽기 ═══════════════
ONLY = [k for k in os.environ.get('CROPS_ONLY', '').split(',') if k]
_n = 0
for (key, fn) in ITEMS:
    if ONLY and key not in ONLY:
        continue
    OBJS.clear()
    fn()
    rc.bake_transforms()
    size = rc.render_icon_pass(OBJS, os.path.join(OUT_I, key + ".png"))
    print(f"[crops] icon {key}: {RES_ICON}²  (size={size:.2f}m · objs={len(OBJS)})")
    rc.cleanup()
    _n += 1
print("[crops] DONE ->", OUT_I, _n, "장")
