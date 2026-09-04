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
# ── [T79b] 채소 9 · 양념 3 · 박과 2 · 특용 4 · 구황 2 ───────────────────────
M['leaf']    = striped_mat("g_leaf", (0.30, 0.48, 0.18), (0.22, 0.38, 0.13), 16, 0.55, bump=0.30, dist=2.0)     # 잎 — 짙은 초록
M['leaf2']   = striped_mat("g_leaf2", (0.44, 0.60, 0.24), (0.34, 0.50, 0.18), 18, 0.52, bump=0.30, dist=2.0)    # 잎(밝은 겉장)
M['leafpale']= striped_mat("g_leafpale", (0.78, 0.80, 0.52), (0.66, 0.70, 0.40), 22, 0.50, bump=0.28, dist=2.0) # 배추 속잎 — 노란 기
M['leaftea'] = striped_mat("g_leaftea", (0.20, 0.36, 0.16), (0.14, 0.27, 0.11), 14, 0.34, bump=0.32, dist=2.0)  # 차 잎 — 두껍고 윤이 난다
M['bud']     = simple_mat("g_bud", (0.68, 0.74, 0.44), 0.45)                                                    # 차 새순(백호)
M['stemw']   = striped_mat("g_stemw", (0.88, 0.88, 0.80), (0.76, 0.78, 0.68), 26, 0.55, bump=0.30, dist=2.0)     # 대파·부추 흰 밑동
M['radish']  = bumped_mat("g_radish", (0.90, 0.90, 0.86), (0.78, 0.79, 0.74), 10, 0.22, 0.52)                    # 무 속살 — 희다
M['turnip']  = bumped_mat("g_turnip", (0.84, 0.82, 0.84), (0.68, 0.64, 0.70), 9, 0.22, 0.55)                     # 순무 — 희읍스름한 자줏빛
M['turnipt'] = simple_mat("g_turnipt", (0.55, 0.38, 0.52), 0.48)                                                 # 순무 어깨 자주
M['cuke']    = striped_mat("g_cuke", (0.26, 0.44, 0.16), (0.38, 0.56, 0.22), 30, 0.36, bump=0.55, dist=1.0)      # 오이 — 세로 골
M['eggpl']   = simple_mat("g_eggpl", (0.22, 0.10, 0.24), 0.24)                                                   # 가지 — 짙은 자주에 윤
M['calyx']   = simple_mat("g_calyx", (0.30, 0.44, 0.18), 0.55)                                                   # 꼭지(꽃받침)
M['gourdf']  = bumped_mat("g_gourdf", (0.82, 0.80, 0.62), (0.70, 0.68, 0.50), 7, 0.22, 0.60)                      # 박 — 흰 기 도는 연둣빛
M['melon']   = striped_mat("g_melon", (0.82, 0.70, 0.20), (0.90, 0.86, 0.62), 9, 0.35, bump=0.25, dist=0.6)      # 참외 — 노랑 바탕 흰 골
M['garlic']  = bumped_mat("g_garlic", (0.90, 0.87, 0.80), (0.78, 0.74, 0.66), 12, 0.30, 0.66)                     # 마늘 겉껍질(종이질)
M['garlicp'] = simple_mat("g_garlicp", (0.72, 0.58, 0.50), 0.60)                                                 # 마늘 쪽 겉의 붉은 기
M['ginger']  = bumped_mat("g_ginger", (0.78, 0.66, 0.40), (0.62, 0.50, 0.28), 14, 0.55, 0.78)                     # 생강 뿌리줄기 — 마디지고 누렇다
M['taro']    = bumped_mat("g_taro", (0.52, 0.40, 0.28), (0.38, 0.28, 0.19), 16, 0.62, 0.90)                       # 토란 — 털 난 갈색 껍질
M['tarohair']= simple_mat("g_tarohair", (0.42, 0.34, 0.24), 0.92)                                                # 토란 잔털·마디 줄
M['yam']     = bumped_mat("g_yam", (0.62, 0.50, 0.34), (0.46, 0.36, 0.23), 11, 0.50, 0.86)                        # 마 — 길고 울퉁불퉁
M['hempst']  = striped_mat("g_hempst", (0.52, 0.56, 0.28), (0.40, 0.44, 0.20), 28, 0.62, bump=0.35, dist=2.0)     # 삼대 — 곧고 억세다
M['indigo']  = striped_mat("g_indigo", (0.26, 0.40, 0.30), (0.19, 0.31, 0.23), 15, 0.52, bump=0.30, dist=2.0)     # 쪽 잎 — 푸른 기 도는 녹색
M['mulberry']= striped_mat("g_mulberry", (0.34, 0.52, 0.20), (0.25, 0.42, 0.15), 13, 0.48, bump=0.30, dist=2.0)   # 뽕잎 — 넓고 심장형
# ── [T79b] 씨앗 — 실물 색·꼴. 접시 위에서 20종이 갈려야 한다(§0-ⓒ)
M['sd_black']= simple_mat("g_sd_black", (0.14, 0.12, 0.10), 0.42)     # 배추·순무·부추·대파·쪽 — 검은 좁쌀
M['sd_cream']= simple_mat("g_sd_cream", (0.88, 0.84, 0.70), 0.40)     # 오이·박·참외 — 흰 납작
M['sd_brown']= simple_mat("g_sd_brown", (0.52, 0.38, 0.22), 0.48)     # 무·미나리·뽕 — 갈색
M['sd_grey'] = bumped_mat("g_sd_grey", (0.50, 0.50, 0.42), (0.38, 0.38, 0.31), 26, 0.30, 0.44)   # 삼씨 — 잿빛 얼룩에 윤
M['sd_ring'] = simple_mat("g_sd_ring", (0.62, 0.56, 0.44), 0.55)      # 아욱 — 수레바퀴꼴 분과
M['sd_pale'] = simple_mat("g_sd_pale", (0.78, 0.72, 0.50), 0.45)      # 가지·상추 — 옅은 납작
M['sd_nut']  = bumped_mat("g_sd_nut", (0.44, 0.30, 0.16), (0.33, 0.22, 0.11), 9, 0.30, 0.52)     # 차씨 — 굵은 갈색 알(도토리만 하다)


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


# ═══════════════ [T79b] 빌더 넷 — 뿌리 · 잎 · 박 · 덩이 ═══════════════
# 곡식과 달리 이 스무 종은 **먹는 부위가 제각각**이다(뿌리·잎·열매·땅속줄기).
# 그래서 빌더도 부위로 갈랐다 — 낟알 하나로 다 덮던 §T79 문법이 여기선 안 통한다.

def _seed_dish(mat, n=44, r=0.055, scale=(1.0, 1.0, 0.55), sd=1, sub=1, jit=0.12):
    """씨앗 규약의 몸 — 접시 + 알곡 한 줌(T79 §0-ⓐ). 씨앗 20종은 **색과 꼴**로 갈린다."""
    _dish()
    _heap(lambda x, y, z, i: ico(r, (x, y, z + 0.01), subdiv=sub, mat=mat,
                                 scale=scale, jitter=jit, smooth=True),
          n=n, r=0.58, seed=sd)


# ── 빌더 ① 뿌리 — 무 · 순무 ────────────────────────────────────────────
def _root(body, L=1.30, W=0.34, taper=0.22, shoulder=None, leaves=6, leaf_len=0.62,
          seed=False, seed_kw=None, sd=301):
    """뿌리채소 — 땅속 뿌리 + 위로 뻗은 잎. 뿌리의 **길이 대 굵기**가 무와 순무를 가른다
    (무는 길고 곧다 · 순무는 둥글고 어깨가 자줏빛이다)."""
    random.seed(sd)
    if seed:
        _seed_dish(**(seed_kw or {})); return
    # 뿌리 — 위가 굵고 아래로 가늘어진다
    n = 7
    for i in range(n):
        t = i / (n - 1.0)
        rr = W * (1.0 - taper * t) * (1.0 - 0.55 * t * t)
        ico(rr, (0, 0, L * (1.0 - t) * 0.72 + 0.10), subdiv=2, mat=body,
            scale=(1.0, 1.0, 0.62), jitter=0.05, smooth=True)
    if shoulder:                                   # 순무 어깨 — 햇빛 본 데가 자줏빛
        ico(W * 1.02, (0, 0, L * 0.70), subdiv=2, mat=shoulder,
            scale=(1.0, 1.0, 0.34), jitter=0.04, smooth=True)
    cone(W * 0.14, 0.0, 0.26, (0, 0, 0.02), mat=body, verts=8)          # 잔뿌리 끝
    for i in range(leaves):                        # 잎 — 위로 벌어진다
        a = i * (2 * math.pi / leaves) + 0.3
        d = V((math.cos(a) * 0.42, math.sin(a) * 0.42, 0.86)).normalized()
        o = plane(0.085, leaf_len, (math.cos(a) * 0.05, math.sin(a) * 0.05, L * 0.74),
                  mat=(M['leaf'] if i % 2 else M['leaf2']))
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()


# ── 빌더 ② 잎 — 배추 · 상추 · 아욱 · 미나리 · 부추 · 대파 · 삼 · 쪽 · 뽕 · 차 ──
def _blade(w, l, loc, dirv, mat, rib=None, curl=0.0, tube=False, sd=0):
    """잎 한 장. ★`plane` 은 **모난 사각형**이라 1패스에서 잎 여덟이 전부 '초록 종이'로 읽혔다.
    잎은 **끝이 좁아지는 둥근 판**이다 — 납작하게 누른 이코스피어로 만든다.
    `tube=True` 면 대파처럼 **속이 빈 둥근 잎**(눌러 놓지 않는다)."""
    o = ico(0.5, loc, subdiv=2, mat=mat,
            scale=(w, l, w if tube else max(0.035, w * 0.16)), jitter=0.06, smooth=True)
    o.rotation_euler = dirv.to_track_quat('Z', 'Y').to_euler()
    if rib is not None and not tube:                      # 잎맥 — 96px 에서 '잎'을 못박는 한 줄
        o2 = cyl(w * 0.055, l * 0.95, loc, mat=rib, verts=6, smooth=True)
        o2.rotation_euler = dirv.to_track_quat('Z', 'Y').to_euler()
    if curl > 0:                                          # 오글거리는 겉장(상추·아욱)
        for k in (-1, 1):
            o3 = ico(0.5, loc, subdiv=1, mat=mat,
                     scale=(w * 0.42, l * 0.62, max(0.03, w * 0.12)), jitter=0.22, smooth=True)
            o3.rotation_euler = dirv.to_track_quat('Z', 'Y').to_euler()
            o3.location = (loc[0] + dirv.x * l * 0.30 + k * curl * 0.10,
                           loc[1] + dirv.y * l * 0.30 + k * curl * 0.10,
                           loc[2] + dirv.z * l * 0.30)
    return o


def _leaf(mat, mat2=None, n=9, lw=0.26, ll=0.72, open_deg=55, head=None, head_r=0.30,
          shank=0.0, shank_mat=None, stalk=0.0, stalk_mat=None, bud=False,
          crinkle=0.0, tube=False, rib=True, seed=False, seed_kw=None, sd=311):
    """잎채소·잎을 쓰는 것 전부.

    open_deg  잎이 벌어지는 각(작으면 결구 — 배추 · 크면 흩어진 상추)
    head      속(결구) 재질 — 주면 가운데가 찬다
    shank     흰 밑동 길이(대파·부추)   ·   tube  둥근 속빈 잎(대파)
    stalk     곧은 대(삼 — 껍질을 벗겨 실을 뽑는 것이라 대가 주인공이다)
    bud       새순 하나(차 — 잎 둘에 순 하나가 차의 표식)
    """
    random.seed(sd)
    if seed:
        _seed_dish(**(seed_kw or {})); return
    m2 = mat2 or mat
    base_z = 0.06
    if shank > 0:                                   # 흰 밑동 — 대파·부추의 표식
        cyl(0.10, shank, (0, 0, shank * 0.5), mat=shank_mat or M['stemw'], verts=14, smooth=True)
        base_z = shank * 0.92
    if stalk > 0:                                   # 삼대 — 곧고 억세다
        cyl(0.055, stalk, (0, 0, stalk * 0.5), mat=stalk_mat or M['hempst'], verts=10, smooth=True)
        base_z = stalk * 0.26
    for i in range(n):
        t = i / max(1, n - 1.0)
        a = i * (2 * math.pi / max(1, n)) * 0.92 + 0.4
        lean = math.radians(open_deg) * (0.42 + 0.58 * t)
        d = V((math.cos(a) * math.sin(lean), math.sin(a) * math.sin(lean), math.cos(lean)))
        z = base_z + (stalk * 0.60 * t if stalk > 0 else 0.0)
        loc = (math.cos(a) * (0.06 + d.x * ll * 0.30),
               math.sin(a) * (0.06 + d.y * ll * 0.30),
               z + d.z * ll * 0.42)
        _blade(lw * (1.0 - 0.16 * t), ll * (1.0 - 0.18 * t), loc, d,
               mat if i % 2 else m2, rib=(m2 if rib and not tube else None),
               curl=crinkle, tube=tube)
    if head:                                        # 결구 — 속이 찬 배추
        ico(head_r, (0, 0, base_z + head_r * 0.80), subdiv=2, mat=head,
            scale=(0.78, 0.78, 1.45), jitter=0.04, smooth=True)
    if bud:                                         # 차 — 잎 둘에 순 하나
        cone(0.045, 0.012, 0.26, (0, 0, base_z + stalk * 0.62 + 0.20), mat=M['bud'], verts=8)


# ── 빌더 ③ 박 — 오이 · 가지 · 박 · 참외 ────────────────────────────────
def _fruit(body, L=0.9, D=0.42, ridges=0, calyx=True, curve=0.0, stripe=None,
           neck=0.0, seed=False, seed_kw=None, sd=321):
    """열매를 먹는 것 — 열매 하나 + 꼭지 + 덩굴손.
    `L/D` 가 꼴을 가른다(오이는 길고 가늘다 · 박은 크고 둥글다 · 가지는 배 모양)."""
    random.seed(sd)
    if seed:
        _seed_dish(**(seed_kw or {})); return
    n = 9
    for i in range(n):
        t = i / (n - 1.0)
        bulge = math.sin(math.pi * (0.15 + 0.75 * t))
        rr = D * (0.55 + 0.45 * bulge)
        if neck > 0:                                # 박 — 목이 잘록하다
            rr *= (1.0 - neck * math.exp(-((t - 0.72) ** 2) / 0.006))
        ico(rr, (curve * math.sin(math.pi * t) * 0.5, 0, 0.16 + L * t), subdiv=2, mat=body,
            scale=(1.0, 1.0, 0.55), jitter=0.03, smooth=True)
    if ridges:                                      # 오이 세로 골
        for k in range(ridges):
            a = k * (2 * math.pi / ridges)
            o = cyl(0.016, L * 0.86, (math.cos(a) * D * 0.86, math.sin(a) * D * 0.86, 0.16 + L * 0.5),
                    mat=body, verts=6, smooth=True)
    if stripe:                                      # 참외 흰 골
        for k in range(6):
            a = k * (2 * math.pi / 6)
            o = cyl(0.030, L * 0.94, (math.cos(a) * D * 0.80, math.sin(a) * D * 0.80, 0.16 + L * 0.5),
                    mat=stripe, verts=6, smooth=True)
            o.scale = (1.0, 0.45, 1.0)
    if calyx:
        cone(D * 0.44, D * 0.16, 0.20, (curve * 0.5, 0, 0.16 + L * 1.02), mat=M['calyx'], verts=10)
        cyl(0.028, 0.24, (curve * 0.5, 0, 0.16 + L * 1.16), mat=M['calyx'], verts=6, smooth=True)
    for k in range(2):                              # 덩굴손 — 박과의 티
        a = 2.2 + k * 1.4
        for j in range(5):
            ico(0.022, (math.cos(a + j * 1.1) * (D * 0.9 + j * 0.035),
                        math.sin(a + j * 1.1) * (D * 0.9 + j * 0.035),
                        0.16 + L * 0.86 + j * 0.045),
                subdiv=1, mat=M['calyx'], scale=(1, 1, 1), jitter=0.0, smooth=True)


# ── 빌더 ④ 덩이 — 마늘 · 생강 · 토란 · 마 ──────────────────────────────
# ★★이 넷은 **씨앗으로 심지 않는다**(§0-ⓒ). 마늘은 **쪽**, 생강은 **뿌리줄기 조각**,
#   토란·마는 **덩이**를 묻는다. 그래서 `seed=True` 가 접시를 안 쓴다 — 심는 것이 곧 그 물건이다.
#   키(`seed_<id>`)는 서버 정본이라 그대로 두고, **그림만** 실물을 따른다.
def _tuber(body, kind='corm', L=0.9, R=0.40, lobes=5, hair=False, skin=None,
           leaves=0, seed=False, sd=331):
    """kind: 'bulb'(마늘 통) · 'rhizome'(생강) · 'corm'(토란) · 'long'(마)
    `seed=True` = 심는 것 — 마늘은 쪽 몇 개 · 생강은 조각 하나 · 토란/마는 작은 덩이."""
    random.seed(sd)
    if kind == 'bulb':
        nc = 7 if not seed else 3
        if not seed:                                   # 통마늘 — 쪽이 모인 통 + 종이질 겉껍질
            for i in range(nc):
                a = i * (2 * math.pi / nc)
                o = ico(0.20, (math.cos(a) * 0.17, math.sin(a) * 0.17, 0.34), subdiv=2,
                        mat=body, scale=(0.72, 0.72, 1.25), jitter=0.05, smooth=True)
            ico(0.30, (0, 0, 0.30), subdiv=2, mat=body, scale=(1.0, 1.0, 0.55),
                jitter=0.05, smooth=True)              # 밑동
            for i in range(6):                         # 마른 줄기
                a = i * 1.05
                cyl(0.020, 0.42, (math.cos(a) * 0.03, math.sin(a) * 0.03, 0.74),
                    rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0), mat=M['garlic'], verts=5, smooth=False)
            for i in range(9):                         # 잔뿌리
                a = i * 0.7
                cyl(0.012, 0.16, (math.cos(a) * 0.10, math.sin(a) * 0.10, 0.04),
                    rot=(math.sin(a) * 0.6, -math.cos(a) * 0.6, 0), mat=M['garlic'], verts=4, smooth=False)
        else:                                          # ★심는 것 = **쪽** 셋(통이 아니다)
            for i, (dx, dy, rz) in enumerate(((-0.30, 0.06, 0.5), (0.10, -0.16, -0.8), (0.28, 0.20, 1.9))):
                o = ico(0.26, (dx, dy, 0.26), subdiv=2, mat=body,
                        scale=(0.60, 0.60, 1.20), jitter=0.05, smooth=True)
                o.rotation_euler = (0.25, rz * 0.30, rz)
                o2 = ico(0.155, (dx + math.cos(rz) * 0.055, dy + math.sin(rz) * 0.055, 0.24),
                         subdiv=2, mat=skin or M['garlicp'], scale=(0.60, 0.60, 1.05),
                         jitter=0.05, smooth=True)
                o2.rotation_euler = (0.25, rz * 0.30, rz)
        return
    if kind == 'rhizome':                              # 생강 — 마디진 손바닥꼴 뿌리줄기
        segs = 5 if not seed else 2
        pts = [(0.0, 0.0), (0.42, 0.10), (-0.36, 0.14), (0.22, -0.32), (-0.18, -0.30)][:segs]
        for i, (dx, dy) in enumerate(pts):
            o = ico(0.26, (dx, dy, 0.22), subdiv=2, mat=body,
                    scale=(1.25, 0.78, 0.72), jitter=0.10, smooth=True)
            o.rotation_euler = (0, 0, i * 1.1)
            cone(0.10, 0.0, 0.22, (dx * 1.5, dy * 1.5, 0.30), rot=(0.6, 0, i * 1.1),
                 mat=body, verts=8)                    # 눈(싹) — 뿌리줄기의 표식
        return
    if kind == 'long':                                 # 마 — 길고 울퉁불퉁한 덩이뿌리
        n = 8 if not seed else 4
        for i in range(n):
            t = i / max(1, n - 1.0)
            rr = R * (0.62 + 0.38 * math.sin(math.pi * (0.2 + 0.7 * t)))
            ico(rr, (math.sin(t * 3.0) * 0.09, 0, 0.14 + L * t * (1.0 if not seed else 0.55)),
                subdiv=2, mat=body, scale=(1.0, 0.92, 0.78), jitter=0.16, smooth=True)
        for i in range(7):                             # 잔뿌리 — 마의 표식
            a = i * 0.9
            cyl(0.014, 0.20, (math.cos(a) * R * 0.7, math.sin(a) * R * 0.7,
                              0.16 + L * (0.25 + 0.5 * (i % 3) / 3.0) * (1.0 if not seed else 0.55)),
                rot=(math.sin(a) * 1.2, -math.cos(a) * 1.2, 0), mat=body, verts=4, smooth=False)
        return
    # 'corm' — 토란: 둥글고 마디진 갈색 덩이 + 잔털
    n = lobes if not seed else 2
    for i in range(n):
        a = i * (2 * math.pi / max(1, n))
        d = 0.0 if i == 0 else 0.34
        rr = R if i == 0 else R * 0.52
        ico(rr, (math.cos(a) * d, math.sin(a) * d, 0.16 + rr * 0.55), subdiv=2, mat=body,
            scale=(1.0, 1.0, 1.18), jitter=0.07, smooth=True)
    if hair:
        for i in range(11):                            # 마디 줄 — 토란은 껍질에 테가 있다
            a = i * 0.58
            o = cyl(R * 0.92, 0.020, (0, 0, 0.16 + R * (0.30 + 0.10 * (i % 4))),
                    mat=M['tarohair'], verts=14, smooth=True)
    if leaves:
        cyl(0.05, 0.34, (0, 0, 0.16 + R * 1.5), mat=M['calyx'], verts=8, smooth=True)


# ═══════════════ [T79b] 모델 — 채소 9 · 양념 3 · 박과 2 · 특용 4 · 구황 2 ═══════════════
# 씨앗 색은 실물이다(§0-ⓒ) — 접시 위에서 20종이 갈려야 하니 **색과 꼴을 실물에서** 가져왔다.

# ── 채소 9 ──
def m_cabbage():        _leaf(M['leaf'], M['leaf2'], n=6, lw=0.40, ll=0.66, open_deg=74,
                              head=M['leafpale'], head_r=0.46, crinkle=0.0, sd=401)   # 배추 — 결구(속이 찬다)
def m_seed_cabbage():   _leaf(M['leaf'], seed=True, sd=401,
                              seed_kw=dict(mat=M['sd_black'], n=64, r=0.040, scale=(1.0, 1.0, 0.9), sd=401))

def m_lettuce():        _leaf(M['leaf2'], M['leaf'], n=10, lw=0.62, ll=0.60, open_deg=96,
                              crinkle=0.26, sd=402)                                     # 상추 — 결구 없이 벌어진다
def m_seed_lettuce():   _leaf(M['leaf2'], seed=True, sd=402,
                              seed_kw=dict(mat=M['sd_pale'], n=54, r=0.052, scale=(0.42, 1.0, 0.34), sd=402))

def m_curled_mallow():  _leaf(M['leaf'], M['leaf2'], n=5, lw=0.66, ll=0.52, open_deg=88,
                              stalk=0.80, stalk_mat=M['leaf2'], crinkle=0.06, sd=403)                                     # 아욱 — 둥글고 주름진 잎
def m_seed_curled_mallow(): _leaf(M['leaf'], seed=True, sd=403,
                              seed_kw=dict(mat=M['sd_ring'], n=34, r=0.070, scale=(1.0, 1.0, 0.30), sd=403))

def m_water_dropwort(): _leaf(M['leaf2'], M['leaf'], n=11, lw=0.17, ll=0.30, open_deg=46,
                              stalk=0.86, stalk_mat=M['leaf2'], sd=404)                 # 미나리 — 가는 대가 여럿
def m_seed_water_dropwort(): _leaf(M['leaf2'], seed=True, sd=404,
                              seed_kw=dict(mat=M['sd_brown'], n=70, r=0.036, scale=(0.7, 1.0, 0.8), sd=404))

def m_chive():          _leaf(M['leaf'], M['leaf2'], n=10, lw=0.095, ll=1.20, open_deg=9,
                              shank=0.16, rib=False, sd=405)                                       # 부추 — 납작하고 가는 잎 다발
def m_seed_chive():     _leaf(M['leaf'], seed=True, sd=405,
                              seed_kw=dict(mat=M['sd_black'], n=60, r=0.042, scale=(1.0, 0.9, 0.62), sd=405))

def m_radish():         _root(M['radish'], L=1.30, W=0.34, taper=0.24, leaves=7, sd=406)  # 무 — 길고 흰 뿌리
def m_seed_radish():    _root(M['radish'], seed=True, sd=406,
                              seed_kw=dict(mat=M['sd_brown'], n=40, r=0.062, scale=(1.0, 1.0, 0.9), sd=406))

def m_turnip():         _root(M['turnip'], L=0.72, W=0.44, taper=0.10, shoulder=M['turnipt'],
                              leaves=6, leaf_len=0.56, sd=407)                            # 순무 — 둥글고 어깨가 자줏빛
def m_seed_turnip():    _root(M['turnip'], seed=True, sd=407,
                              seed_kw=dict(mat=M['sd_black'], n=52, r=0.046, scale=(1.0, 1.0, 0.95), sd=407))

def m_cucumber():       _fruit(M['cuke'], L=1.10, D=0.26, ridges=7, curve=0.16, sd=408)   # 오이 — 길고 골이 진다
def m_seed_cucumber():  _fruit(M['cuke'], seed=True, sd=408,
                              seed_kw=dict(mat=M['sd_cream'], n=40, r=0.070, scale=(0.55, 1.0, 0.22), sd=408))

def m_eggplant():       _fruit(M['eggpl'], L=0.86, D=0.36, curve=0.10, sd=409)            # 가지 — 짙은 자주에 윤
def m_seed_eggplant():  _fruit(M['eggpl'], seed=True, sd=409,
                              seed_kw=dict(mat=M['sd_pale'], n=62, r=0.044, scale=(1.0, 1.0, 0.28), sd=409))

# ── 양념 3 ── (마늘·생강은 씨앗이 아니다 — 쪽과 뿌리줄기다)
def m_garlic():         _tuber(M['garlic'], kind='bulb', sd=411)                          # 통마늘
def m_seed_garlic():    _tuber(M['garlic'], kind='bulb', seed=True, skin=M['garlicp'], sd=411)  # ★심는 것 = 쪽

def m_ginger():         _tuber(M['ginger'], kind='rhizome', sd=412)                       # 생강 — 마디진 뿌리줄기
def m_seed_ginger():    _tuber(M['ginger'], kind='rhizome', seed=True, sd=412)            # ★심는 것 = 조각

def m_scallion():       _leaf(M['leaf'], M['leaf2'], n=5, lw=0.13, ll=1.00, open_deg=22,
                              shank=0.62, tube=True, sd=413)                                          # 대파 — 흰 밑동이 길다
def m_seed_scallion():  _leaf(M['leaf'], seed=True, sd=413,
                              seed_kw=dict(mat=M['sd_black'], n=58, r=0.044, scale=(1.0, 0.85, 0.70), sd=413))

# ── 박과 2 ──
def m_gourd():          _fruit(M['gourdf'], L=1.02, D=0.52, neck=0.42, sd=421)            # 박 — 목이 잘록한 큰 열매
def m_seed_gourd():     _fruit(M['gourdf'], seed=True, sd=421,
                              seed_kw=dict(mat=M['sd_cream'], n=17, r=0.130, scale=(0.66, 1.0, 0.16), sd=421))

def m_korean_melon():   _fruit(M['melon'], L=0.78, D=0.40, stripe=M['leafpale'], sd=422)  # 참외 — 노랑 바탕 흰 골
def m_seed_korean_melon(): _fruit(M['melon'], seed=True, sd=422,
                              seed_kw=dict(mat=M['sd_cream'], n=48, r=0.058, scale=(0.55, 1.0, 0.22), sd=422))

# ── 특용 4 ── (비식품이지만 씨앗은 **서버에 실재한다** — §0-ⓐ 실측)
def m_hemp_plant():     _leaf(M['leaf'], M['leaf2'], n=15, lw=0.095, ll=0.52, open_deg=72,
                              stalk=1.45, sd=431)                                          # 삼 — 곧은 대 + 손바닥꼴 잎
def m_seed_hemp_plant(): _leaf(M['leaf'], seed=True, sd=431,
                              seed_kw=dict(mat=M['sd_grey'], n=40, r=0.062, scale=(1.0, 0.9, 0.78), sd=431, sub=2, jit=0.06))

def m_indigo_plant():   _leaf(M['indigo'], M['leaf'], n=14, lw=0.26, ll=0.34, open_deg=76,
                              stalk=0.90, stalk_mat=M['indigo'], sd=432)                   # 쪽 — 잎을 따 염료로
def m_seed_indigo_plant(): _leaf(M['indigo'], seed=True, sd=432,
                              seed_kw=dict(mat=M['sd_black'], n=56, r=0.044, scale=(1.0, 0.9, 0.85), sd=432))

def m_mulberry_leaf():  _leaf(M['mulberry'], M['leaf2'], n=5, lw=0.72, ll=0.76, open_deg=68,
                              sd=433)                                                       # 뽕 — 넓은 심장형 잎(누에 밥)
def m_seed_mulberry_leaf(): _leaf(M['mulberry'], seed=True, sd=433,
                              seed_kw=dict(mat=M['sd_brown'], n=72, r=0.034, scale=(1.0, 1.0, 0.8), sd=433))

def m_tea():            _leaf(M['leaftea'], M['leaftea'], n=8, lw=0.30, ll=0.44, open_deg=62,
                              stalk=0.72, stalk_mat=M['leaftea'], bud=True, sd=434)        # 차 — 두꺼운 잎 + 새순 하나
def m_seed_tea():       _leaf(M['leaftea'], seed=True, sd=434,
                              seed_kw=dict(mat=M['sd_nut'], n=11, r=0.150, scale=(1.0, 1.0, 0.86), sd=434, sub=2, jit=0.05))

# ── 구황 2 ── (씨앗이 아니라 덩이를 묻는다)
def m_taro():           _tuber(M['taro'], kind='corm', R=0.42, lobes=5, hair=True, leaves=1, sd=441)  # 토란 — 털 난 갈색 덩이
def m_seed_taro():      _tuber(M['taro'], kind='corm', R=0.40, hair=True, seed=True, sd=441)          # ★심는 것 = 씨토란

def m_yam():            _tuber(M['yam'], kind='long', L=1.20, R=0.26, sd=442)                          # 마 — 길고 울퉁불퉁
def m_seed_yam():       _tuber(M['yam'], kind='long', L=1.20, R=0.28, seed=True, sd=442)               # ★심는 것 = 덩이 토막


# ═══════════════ 표 ═══════════════
CROPS_A = ['rice', 'barley', 'wheat', 'foxtail_millet', 'millet', 'sorghum',
           'adlay', 'barnyard_millet', 'buckwheat',
           'soybean', 'azuki', 'mungbean', 'perilla', 'sesame']
# [T79b] 채소 9 · 양념 3 · 박과 2 · 특용 4 · 구황 2
CROPS_B = ['cabbage', 'lettuce', 'curled_mallow', 'water_dropwort', 'chive',
           'radish', 'turnip', 'cucumber', 'eggplant',
           'garlic', 'ginger', 'scallion',
           'gourd', 'korean_melon',
           'hemp_plant', 'indigo_plant', 'mulberry_leaf', 'tea',
           'taro', 'yam']
# ★★씨앗으로 심지 않는 넷 — 접시 문법을 **깬다**(§0-ⓒ). 키는 서버 정본대로 `seed_<id>` 그대로다.
#   마늘 = 쪽 · 생강 = 뿌리줄기 조각 · 토란 = 씨토란 · 마 = 덩이 토막.
#   ⓘ 계보는 오히려 더 팽팽하다 — 심는 것이 **그 물건 자체**라 같은 빌더가 그대로 쓰인다.
NOT_SEEDS = ['garlic', 'ginger', 'taro', 'yam']
CROPS_ALL = CROPS_A + CROPS_B
ITEMS = []
for _c in CROPS_ALL:
    ITEMS.append((_c, globals()['m_' + _c]))
    ITEMS.append(('seed_' + _c, globals()['m_seed_' + _c]))

# 계보 — 수확물 → 씨앗(같은 빌더, `seed=True`). `test-icons ⑥` 이 읽는다.
CROP_LINEAGE = [(c, 'seed_' + c) for c in CROPS_ALL]


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
