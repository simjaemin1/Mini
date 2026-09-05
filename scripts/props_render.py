#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/props_render.py — 가구·시설·손도구·먹을 것 정본 [재민 확정 2026-09-03 · T67 · T72 · T76]
#
# ★★캐논: **물건 하나 = 모델 정의 하나 = 렌더 둘.**
#   가구는 해체하면 인벤에 들어간다(`doDismantleBuilding` → `BUILDING_TYPE_TO_ITEM`).
#   그래서 세계에 서 있을 때와 인벤에 있을 때가 **같은 그림**이어야 한다.
#   ⇒ 이 파일이 모델을 **한 번** 정의하고, 그 **같은 오브젝트**로
#      ⓐ 아이콘(96px · icon_render.py 씬)  ⓑ 세계 아이소 스프라이트(building_render.py 씬)
#      를 이어서 굽는다. 모델을 두 번 적지 않는다 — 두 벌이 되는 순간 둘은 갈린다.
#
# ★씬 값은 **무변**이다(자연물·건물·캐릭터와 한 몸):
#   Cycles · film_transparent · ORTHO · SAMPLES 64 · view_transform Standard ·
#   월드 (0.52,0.56,0.6)@0.55 · 태양 52° energy 3.6 ·
#   [세계] 방위 45°/고도 30° · PPU 45.255 · ZSQ 0.8165 · 좌우 FLIP · 태양 방위 −35°
#   [아이콘] ISO_DIR (1,−1,1.2) · bbox 맞춤 512² · 압축 없음 · FLIP 없음 · 태양 방위 +35°
#   여기서 이 값을 바꾸지 마라. 바꾸면 그림이 한 몸이 아니게 된다.
#
# ★★앵커 규약 — **그리기 자리에 맞춘다**(건물 규약의 일반화).
#   클라는 언제나 `ctx.drawImage(sp, x - sp._ox, y - sp._oy)` 로 그린다. 여기서 (x,y) 는
#   `drawBuildingIso` 가 받는 화면 좌표다. 그 점이 무엇이냐가 타입마다 다르다(서버 실측):
#     · 덩어리형(작업대·건조대·상자·모닥불·소금가마·울타리) — `b.x = cx*32 + 16` = **셀 중심**
#       ⇒ 모델 로컬 원점 = 셀 중심의 지면.
#     · 변형(벽·문) — `b.x = cx*32` = 셀 북서 모서리이고, 그리기 코드는 그 점을
#       **벽 밑변의 가운데**로 쓴다(밑변이 (x−16,y−8)~(x+16,y+8) = 월드 x −0.5..+0.5m).
#       ⇒ 모델 로컬 원점 = 벽 밑변 한가운데의 지면.
#   이렇게 잡으면 클라가 델타 계산을 한 줄도 안 하고, 도형이 있던 자리에 그림이 그대로 앉는다.
#
# ★크기 정본은 **서버**다 — `server/zone.js` 의 `BUILDING_HEIGHT`(px, 32px=1m).
#   아래 `PROPS` 의 `body_px + flame_px = BUILDING_HEIGHT[type]` 이 계약이고
#   `scripts/test-props.js` 가 zone.js 를 직접 읽어 대조한다(사본 금지 · 족보 79).
#
# ★고증: 청동기 후기(송국리). 금속은 구리/청동 톤만 — **철기 금지**. 못·경첩 없음(새끼·나무못).
#
# ★★[T77] 헬퍼·씬 값·프리셋은 `scripts/render_common.py` 한 벌이다.
#   이 파일은 **모델(무엇을 만드는가)과 팔레트(어떤 색인가)**만 갖는다. 새 모델을 지을 때
#   `def box`/`def ico` 를 여기 다시 적지 마라 — `scripts/test-render-common.js` 가 잡는다.
#
# 실행:  python3 scripts/props_render.py            (컨테이너 · pip `bpy`)
#        blender -b -P scripts/props_render.py      (blender 바이너리)
#        PROPS_ONLY=chest,wall  … 가구 일부만 · ITEMS_ONLY=axe,fish,salmon … 손도구·먹을 것 일부만
#        SKIP_PROPS=1 / SKIP_ITEMS=1 … 한쪽만 굽는다(다시 굽는 범위를 줄인다)
# 결과:  scripts/props_renders/<world_key>.png + props_anchors.json   (세계용 · 1:1 · PPU 45.255)
#        scripts/props_icon_renders/<icon_key>.png                     (512² — icons-postprocess.js 가 96px 로)
# 배치:  cp scripts/props_renders/*        public/assets/props/
#        node scripts/icons-postprocess.js scripts/props_icon_renders public/assets/icons
# =============================================================================

import bpy, os, math, random, json, sys

# ★★[T77] 헬퍼·씬 값·프리셋은 `scripts/render_common.py` **한 벌**이다 — 여기 두 번 적지 않는다.
#   이 파일이 갖는 것은 **모델과 팔레트**뿐이다(재질표 `M` 은 이 파일의 것 — icon 판과 색이 다르다).
#   ⓘ `blender -b -P` 로 부르면 스크립트 폴더가 `sys.path` 에 없다 — 직접 넣는다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_common import (V, SAMPLES, SS, RES_ICON, PPU, ZSQ, ISO_DIR,
                           NHAT, RHAT, UHAT, SUN_ICON, SUN_WORLD, OBJS,
                           principled, simple_mat, striped_mat, bumped_mat,
                           add, box, cyl, cone, ico, plane, cord)
import render_common as rc

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_W = os.path.join(HERE, "props_renders")
OUT_I = os.path.join(HERE, "props_icon_renders")
os.makedirs(OUT_W, exist_ok=True)
os.makedirs(OUT_I, exist_ok=True)

# ═══════════════ 씬 — 정본은 render_common.build_scene ═══════════════
scene, cam, cam_d, sun, tgt = rc.build_scene("props")

# ═══════════════ 재질표 — 이 파일의 팔레트 ═══════════════
M = {}
M['log'] = striped_mat("p_log", (0.44, 0.31, 0.17), (0.33, 0.22, 0.12), 18, 0.85, 0.45)      # 통나무
M['log2'] = striped_mat("p_log2", (0.38, 0.26, 0.14), (0.28, 0.19, 0.10), 20, 0.88, 0.45)    # 통나무(그늘)
M['plank'] = striped_mat("p_plank", (0.55, 0.41, 0.24), (0.45, 0.32, 0.18), 14, 0.82, 0.35)  # 판재
M['plank2'] = striped_mat("p_plank2", (0.48, 0.35, 0.20), (0.39, 0.27, 0.15), 16, 0.85, 0.35)
M['cord'] = simple_mat("p_cord", (0.46, 0.36, 0.19), 0.92)                                     # 새끼줄
M['fiber'] = simple_mat("p_fiber", (0.62, 0.55, 0.30), 0.9)                                   # 풀 끈
M['stone'] = bumped_mat("p_stone", (0.52, 0.50, 0.47), (0.38, 0.37, 0.35), 11, 0.55, 0.92)    # 막돌
M['stone2'] = bumped_mat("p_stone2", (0.45, 0.43, 0.41), (0.32, 0.31, 0.30), 13, 0.55, 0.93)  # 막돌(그늘)
M['grind'] = bumped_mat("p_grind", (0.60, 0.58, 0.54), (0.47, 0.45, 0.42), 20, 0.30, 0.55)    # 숫돌(간 면)
M['clay'] = bumped_mat("p_clay", (0.56, 0.36, 0.24), (0.44, 0.27, 0.17), 8, 0.35, 0.88)       # 토기(민무늬)
M['soil'] = striped_mat("p_soil", (0.34, 0.25, 0.15), (0.24, 0.17, 0.10), 9, 0.95, 0.6, 6.0)  # 흙
M['ash'] = bumped_mat("p_ash", (0.62, 0.60, 0.57), (0.44, 0.42, 0.40), 14, 0.35, 0.95)        # 재
M['coal'] = simple_mat("p_coal", (0.09, 0.08, 0.075), 0.95)                                   # 숯·그을음
M['char'] = striped_mat("p_char", (0.20, 0.15, 0.11), (0.11, 0.09, 0.07), 16, 0.92, 0.5)      # 탄 통나무
M['dried'] = striped_mat("p_dried", (0.72, 0.55, 0.33), (0.60, 0.43, 0.24), 24, 0.85, 0.3)    # 마르는 것
M['brine'] = simple_mat("p_brine", (0.68, 0.72, 0.70), 0.18)                                  # 함수(끓는 물)
M['bronze'] = simple_mat("p_bronze", (0.62, 0.38, 0.15), 0.42, metal=0.25)                    # 청동 — 거래소 표식
#   ★금속 0.85 로는 환경이 없는 씬(월드 단색)에서 **회백색 거울**이 된다 — 구리빛이 남게 0.25 로 눌렀다.
M['door'] = striped_mat("p_door", (0.40, 0.27, 0.145), (0.31, 0.20, 0.105), 11, 0.86, 0.40)   # 문짝 널(벽보다 진하다)
# ── [T72] 손도구·손에 드는 것 ─────────────────────────────────────────────
M['ground'] = bumped_mat("p_ground", (0.40, 0.40, 0.39), (0.29, 0.29, 0.29), 5, 0.16, 0.42)   # 간석기 — 갈아 낸 매끈한 면
M['chipped'] = bumped_mat("p_chipped", (0.42, 0.40, 0.37), (0.27, 0.26, 0.24), 15, 0.75, 0.90) # 뗀석기 — 깨뜨린 거친 면
M['river'] = bumped_mat("p_river", (0.40, 0.36, 0.31), (0.27, 0.24, 0.20), 7, 0.30, 0.66)      # 냇돌 — 모서리가 닳아 매끈하고 갈빛(소금과 갈려야 한다)
M['river2'] = bumped_mat("p_river2", (0.33, 0.31, 0.29), (0.22, 0.21, 0.19), 9, 0.30, 0.70)
M['haft'] = striped_mat("p_haft", (0.58, 0.44, 0.26), (0.46, 0.34, 0.19), 20, 0.78, 0.35)      # 다듬은 자루
M['bark2'] = bumped_mat("p_bark2", (0.30, 0.20, 0.11), (0.19, 0.12, 0.06), 16, 0.55, 0.92)     # 껍질 붙은 잔가지
M['scale'] = striped_mat("p_scale", (0.15, 0.21, 0.19), (0.27, 0.34, 0.31), 34, 0.34, 0.45)    # 물고기 비늘(어두운 청올리브)
#   ⚠1·2패스는 은백~옅은 청회색이라 96px 에서 **흰 비행선**으로 읽혔다. 배(밝음)와 대비가 나야 물고기가 된다.
M['belly'] = simple_mat("p_belly", (0.78, 0.76, 0.68), 0.45)                                    # 물고기 배(밝다)
M['dorsal'] = striped_mat("p_dorsal", (0.14, 0.20, 0.18), (0.22, 0.29, 0.26), 30, 0.38, 0.40)   # 물고기 등(어둡다 — 카운터셰이딩)
M['fin'] = simple_mat("p_fin", (0.30, 0.34, 0.33), 0.55)                                        # 지느러미(T72 `fish`·`fish_cooked` 전용 — 건드리면 그 두 장이 바뀐다)
M['grilled'] = striped_mat("p_grilled", (0.56, 0.38, 0.20), (0.34, 0.21, 0.10), 26, 0.62, 0.35) # 구운 살갗
M['scorch'] = simple_mat("p_scorch", (0.14, 0.11, 0.09), 0.92)                                  # 그을음
M['saltx'] = bumped_mat("p_saltx", (0.88, 0.88, 0.86), (0.74, 0.75, 0.75), 22, 0.30, 0.42)      # 소금 결정
M['gourd'] = bumped_mat("p_gourd", (0.72, 0.62, 0.34), (0.58, 0.48, 0.24), 6, 0.22, 0.62)       # 표주박 껍질
M['brinew'] = simple_mat("p_brinew", (0.26, 0.34, 0.31), 0.12)
M['freshw'] = simple_mat("p_freshw", (0.30, 0.44, 0.52), 0.08)                                   # 민물 — 맑고 푸르다(짠물과 갈려야 한다)                                  # 짠물 — 어둡고 젖어 있다(밝은 회색이면 '쇠뚜껑'으로 읽힌다)
# ── [T76] 먹을 것 — 어종·갯벌·보존식 ───────────────────────────────────────
M['fin2'] = simple_mat("f_fin2", (0.34, 0.38, 0.38), 0.55)                                      # 어종 지느러미(몸빛에 가깝게 — 회색 날개로 안 읽히게)
#   ★`fin` 을 안 고치고 새로 둔 이유: `_fish()` 가 그것을 쓴다 — 고치면 T72 의 두 장이 조용히 바뀐다.
M['f_silver'] = striped_mat("f_silver", (0.44, 0.48, 0.52), (0.60, 0.64, 0.67), 36, 0.28, 0.42)  # 은빛 바닷물고기(연어·청어)
M['f_back'] = striped_mat("f_back", (0.12, 0.18, 0.24), (0.20, 0.27, 0.33), 30, 0.32, 0.40)      # 등 — 바다빛 남청
M['f_olive'] = striped_mat("f_olive", (0.30, 0.29, 0.17), (0.42, 0.40, 0.24), 32, 0.36, 0.42)    # 대구·명태 올리브갈
M['f_gold'] = striped_mat("f_gold", (0.42, 0.31, 0.13), (0.56, 0.43, 0.20), 26, 0.34, 0.45)      # 잉어 황갈(큰 비늘)
M['f_rose'] = simple_mat("f_rose", (0.62, 0.30, 0.22), 0.42)                                      # 연어 옆줄 붉은 띠
M['f_spot'] = simple_mat("f_spot", (0.16, 0.13, 0.10), 0.55)                                      # 반점(송어·대구)
M['f_spot2'] = simple_mat("f_spot2", (0.62, 0.24, 0.16), 0.50)                                    # 송어 붉은 반점
M['shell'] = bumped_mat("t_shell", (0.62, 0.60, 0.55), (0.44, 0.43, 0.40), 13, 0.65, 0.72)        # 굴 껍데기(거칠다)
M['nacre'] = simple_mat("t_nacre", (0.72, 0.74, 0.70), 0.14)                                      # 진주광 안쪽
M['abshell'] = bumped_mat("t_abshell", (0.34, 0.30, 0.24), (0.24, 0.21, 0.17), 9, 0.45, 0.60)     # 전복 껍데기(겉)
M['flesh'] = simple_mat("t_flesh", (0.72, 0.62, 0.52), 0.52)                                       # 조갯살
M['kelp'] = striped_mat("t_kelp", (0.20, 0.26, 0.14), (0.30, 0.36, 0.19), 12, 0.42, 0.55)         # 미역·다시마(젖은 갈녹)
M['kelpdry'] = striped_mat("t_kelpdry", (0.11, 0.13, 0.09), (0.17, 0.19, 0.13), 16, 0.72, 0.55)   # 마른 미역(검게 졸았다)
M['shrimp'] = striped_mat("t_shrimp", (0.46, 0.29, 0.25), (0.62, 0.42, 0.35), 26, 0.34, 0.45)     # 새우 껍질
#   ⚠1패스 (0.66,0.52,0.46) 은 조명을 받아 **흰 애벌레**로 읽혔다 — 갯벌 새우는 붉은 잿빛이다.
M['crab'] = bumped_mat("t_crab", (0.48, 0.24, 0.16), (0.36, 0.17, 0.11), 11, 0.40, 0.55)          # 게 등딱지
M['driedf'] = striped_mat("p_driedf", (0.44, 0.33, 0.20), (0.32, 0.23, 0.13), 30, 0.80, 0.42)     # 마른 살(가죽처럼 졸았다)
M['smoked'] = striped_mat("p_smoked", (0.26, 0.15, 0.09), (0.16, 0.09, 0.055), 22, 0.78, 0.40)    # 훈제 — 겉이 검다
M['driedb'] = simple_mat("p_driedb", (0.24, 0.09, 0.11), 0.62)                                     # 말린 과실(쪼그라든 검붉은)
M['radish'] = simple_mat("p_radish", (0.86, 0.85, 0.80), 0.45)                                     # 무 속살
M['radskin'] = simple_mat("p_radskin", (0.62, 0.66, 0.52), 0.50)                                   # 무 껍질(윗동 푸르다)
M['ochre'] = simple_mat("p_ochre", (0.66, 0.30, 0.18), 0.85)                                  # 붉은 흙 안료
# ── [T95] 옷 여섯 · 시설 셋 ─────────────────────────────────────────────────
# ★★옷 색의 정본은 **`render_common.CLOTH_MATS`** 하나다(T81 이 fiber·ramie 를 밀어낸 값 그대로).
#   짐 창의 갖옷과 몸에 걸친 갖옷이 **같은 물건**으로 읽혀야 한다 — 색이 갈리면 그 순간 두 물건이 된다.
#   ★★[T120 2026-09-05] **전사(轉寫)를 끝냈다** — 여섯 값을 `render_common.CLOTH_MATS` 에서
#     읽는다. 여기 있던 사본 여섯 줄과 상수 둘이 T77·T87·T95 회부가 가리키던 바로 그 이중화다.
#     ⓘ `spec` 은 안 쓴다 — 이 파일의 옷은 `simple_mat`(색·rough)로 굽는다. 표는 셋을 갖고 있고
#       쓰는 쪽이 필요한 둘만 집는다(표를 파일마다 깎으면 그게 다시 사본이다).
#     ⓘ 순서는 표가 준다(`server/clothes.js` 표 순서 · 계약) — 여기서 다시 안 적는다.
_TRIM_K, _PLACKET_K = rc.CLOTH_TRIM_K, rc.CLOTH_PLACKET_K
for _k, (_c, _r, _sp) in rc.CLOTH_MATS.items():
    M['cl_' + _k] = simple_mat('p_cl_' + _k, _c, _r)
    M['cl_' + _k + '_t'] = simple_mat('p_cl_' + _k + '_t', tuple(v * _TRIM_K for v in _c), _r)
    M['cl_' + _k + '_p'] = simple_mat('p_cl_' + _k + '_p', tuple(v * _PLACKET_K for v in _c), _r)
M['tamped2'] = bumped_mat("p_tamped2", (0.47, 0.37, 0.24), (0.33, 0.25, 0.15), 16, 0.35, 0.95)  # 다짐 바닥
M['tread'] = striped_mat("p_tread", (0.54, 0.40, 0.23), (0.43, 0.31, 0.17), 16, 0.84, bump=0.35, dist=3.0)  # 계단 디딤 널
M['earth'] = bumped_mat("p_earth", (0.38, 0.28, 0.17), (0.26, 0.19, 0.11), 10, 0.55, 0.94)      # 계단 흙심
# ★[T97] 움집 실내 둘. 벡터가 쓰던 색을 그대로 옮긴다 — 침상 #c8a95e·짚결 #8a713c·목침 #7a5a34.
M['straw'] = striped_mat("p_straw", (0.784, 0.663, 0.369), (0.541, 0.443, 0.235), 30, 0.90, bump=0.45, dist=2.0)  # 거적(볏짚)
M['pillow'] = striped_mat("p_pillow", (0.478, 0.353, 0.204), (0.36, 0.26, 0.15), 22, 0.80, bump=0.30, dist=3.0)   # 목침


# ═══════════════ 모델 — 가구 8종 ═══════════════
# 좌표계: 1유닛 = 1m = 1셀 = 32px. 원점은 위 "앵커 규약" 이 정한 점, z=0 이 지면.

def m_workbench():
    """작업대 — 통나무 4 + 석재 2. 정품 간석기를 만드는 자리(zone.js BUILD 비용 그대로).
    통나무 다리 넷에 쪼갠 널 둘을 얹고 숫돌을 올렸다. 못은 없다 — 새끼로 묶는다."""
    random.seed(670)
    for (sx, sy) in ((-0.33, -0.20), (0.33, -0.20), (-0.33, 0.20), (0.33, 0.20)):
        cyl(0.048, 0.62, (sx, sy, 0.31), mat=M['log'], verts=10)
    for sy in (-0.145, 0.145):                                    # 쪼갠 널 둘(상판)
        box(0.82, 0.27, 0.065, (0.0, sy, 0.6575), mat=M['plank'])
    for sx in (-0.33, 0.33):                                      # 다리 묶은 새끼
        cord(0.016, 0.50, (sx, 0.0, 0.55), (math.radians(90), 0, 0), M['cord'])
    ico(0.155, (0.10, -0.05, 0.755), subdiv=2, mat=M['grind'], scale=(1.0, 0.72, 0.36), jitter=0.10)
    ico(0.062, (-0.24, 0.10, 0.712), subdiv=1, mat=M['stone2'], scale=(1.1, 0.9, 0.55), jitter=0.28)
    cyl(0.030, 0.30, (-0.02, 0.17, 0.706), rot=(0, math.radians(90), math.radians(12)),
        mat=M['log2'], verts=8)                                   # 자루감 나무토막


def m_drying_rack():
    """건조대 — 통나무 2 + 풀 4. 장대 둘에 가로대를 걸고 풀 끈으로 묶어 널었다.
    ★널린 것은 **상태가 아니다** — 서버에 건조대 내용물이 없다(facility 는 거리 판정뿐).
      그래서 몸체에 굽는다(§0-ⓒ 실측)."""
    random.seed(671)
    for sx in (-0.40, 0.40):
        cyl(0.043, 1.00, (sx, 0.0, 0.50), mat=M['log'], verts=10)
        cyl(0.058, 0.09, (sx, 0.0, 0.035), mat=M['soil'], verts=10)        # 밑동 되메운 흙
    cyl(0.030, 0.94, (0.0, 0.0, 1.030), rot=(0, math.radians(90), 0), mat=M['log2'], verts=10)
    for sx in (-0.40, 0.40):                                                # 결속 풀 끈
        cord(0.014, 0.13, (sx, 0.0, 1.020), (math.radians(90), 0, 0), M['fiber'])
        cord(0.014, 0.13, (sx, 0.0, 0.985), (0, math.radians(90), 0), M['fiber'])
    for i, sx in enumerate((-0.24, 0.0, 0.24)):                             # 널린 것 셋(마르는 어물·고기)
        cyl(0.010, 0.15, (sx, 0.0, 0.955), mat=M['fiber'], verts=6)
        ico(0.105, (sx, 0.0, 0.775), subdiv=2, mat=M['dried'],
            scale=(0.42, 0.34, 1.35), jitter=0.16, seed=6710 + i)


def m_chest(exchange=False):
    """상자 — 판자 4. 널을 짜 맞춘 궤. 경첩·못이 없다(청동기) — 새끼로 묶고 나무못을 박는다.
    exchange=True 는 **같은 모델**에 마을 거래소 표식(청동 못·붉은 안료 띠)만 더한 변형이다."""
    random.seed(672)
    for sy in (-0.20, 0.20):                                                # 굄목(바닥에서 띄운다)
        cyl(0.038, 0.72, (0.0, sy, 0.038), rot=(0, math.radians(90), 0), mat=M['log2'], verts=8)
    box(0.78, 0.50, 0.53, (0.0, 0.0, 0.335), mat=M['plank'])                # 몸통
    for sx in (-0.375, 0.375):                                              # 마구리 널(결이 다르다)
        box(0.035, 0.51, 0.54, (sx, 0.0, 0.335), mat=M['plank2'])
    box(0.83, 0.55, 0.115, (0.0, 0.0, 0.6575), mat=M['plank2'])             # 뚜껑
    for sx in (-0.22, 0.22):                                                # 뚜껑 묶은 새끼
        cord(0.026, 0.60, (sx, 0.0, 0.665), (math.radians(90), 0, 0), M['cord'])
        cord(0.026, 0.58, (sx, 0.0, 0.40), (math.radians(90), 0, 0), M['cord'])
    box(0.10, 0.045, 0.055, (0.0, -0.26, 0.585), mat=M['log'])              # 손잡이 나무토막
    if exchange:
        box(0.80, 0.02, 0.075, (0.0, -0.256, 0.44), mat=M['ochre'])         # 붉은 안료 띠 — 거래소 표식
        box(0.80, 0.02, 0.075, (0.0, 0.256, 0.44), mat=M['ochre'])
        for sx in (-0.26, 0.0, 0.26):                                       # 청동 못머리 셋
            cyl(0.032, 0.022, (sx, 0.0, 0.727), mat=M['bronze'], verts=10)
    else:
        for sx in (-0.26, 0.26):
            cyl(0.026, 0.018, (sx, 0.0, 0.724), mat=M['log2'], verts=8)     # 나무못 머리


def m_campfire():
    """모닥불 — 통나무 3. **몸체만** 굽는다: 화덕돌 고리 + 재 + 탄 장작.
    ★불꽃은 코드가 얹는다(흔들려야 한다) — 그래서 몸체 높이는 10px 이고
      코드 불꽃 10px 을 더해 서버 BUILDING_HEIGHT.campfire(20px) 를 채운다."""
    random.seed(673)
    cyl(0.34, 0.035, (0.0, 0.0, 0.018), mat=M['ash'], verts=18)             # 재 바닥
    for i in range(9):                                                       # 화덕돌 고리
        t = i / 9 * 2 * math.pi
        ico(random.uniform(0.085, 0.125), (math.cos(t) * 0.365, math.sin(t) * 0.365, 0.055),
            subdiv=1, mat=(M['stone'] if i % 2 else M['stone2']),
            scale=(1.15, 1.15, 0.80), jitter=0.30, seed=6730 + i)
    for i, (t, tilt, zc) in enumerate(((0.35, 76, 0.115), (2.45, 76, 0.115), (4.35, 66, 0.147))):
        # ★셋째는 화덕돌에 걸쳐 세운다 — 몸체 꼭대기가 10px(=BUILDING_HEIGHT 20 − 코드 불꽃 10)에 닿는다
        cyl(0.052, 0.62, (math.cos(t) * 0.06, math.sin(t) * 0.06, zc),
            rot=(0, math.radians(tilt), t), mat=M['char'], verts=8)
    for i in range(6):                                                       # 잉걸·숯 조각
        ico(random.uniform(0.035, 0.06), (random.uniform(-0.16, 0.16), random.uniform(-0.16, 0.16), 0.05),
            subdiv=1, mat=M['coal'], scale=(1.2, 1.2, 0.6), jitter=0.3, seed=6740 + i)


def m_salt_kiln():
    """소금가마 — 석재 4 + 통나무 3. 자염(煮鹽): 막돌을 쌓아 아궁이를 만들고
    그 위에 함수를 졸이는 토기 소래를 앉혔다. 소래에 꽂아 둔 **고무래**가 이 설비를 말해 준다
    (졸아붙는 소금을 긁어 모으는 나무 주걱 — 자염의 연장이다).
    ★지시서 원안의 '점토'는 플레이어 품목이 아니라 **비용에서 빠졌다**(zone.js 회부 C).
      그림에서는 소래가 토기다 — 자염에 그릇이 없으면 그 설비가 뭘 하는지 안 읽힌다.
    ★1패스에서 벌막(비 가리개)을 세웠더니 이엉이 소래를 덮어 '평상'으로 읽혔다.
      카메라가 +x,+y 쪽이라 **앞에 둔 것은 반드시 가린다** — 벌막은 접고 아궁이를 키웠다."""
    random.seed(674)
    # ① 막돌 아궁이 — 네 켜. 앞(+y)쪽 한 곳을 불구멍으로 튼다.
    for ring, (zc, rr, n) in enumerate(((0.10, 0.42, 12), (0.28, 0.405, 11), (0.46, 0.39, 10), (0.63, 0.375, 10))):
        for i in range(n):
            t = i / n * 2 * math.pi + ring * 0.26
            if ring <= 1 and 1.00 < (t % (2 * math.pi)) < 2.05:              # 아궁이(불구멍)
                continue
            ico(random.uniform(0.100, 0.140), (math.cos(t) * rr, math.sin(t) * rr, zc),
                subdiv=1, mat=(M['stone'] if (i + ring) % 2 else M['stone2']),
                scale=(1.2, 1.2, 0.85), jitter=0.26, seed=6741 + ring * 20 + i)
    cyl(0.32, 0.05, (0.0, 0.0, 0.03), mat=M['ash'], verts=16)                 # 아궁이 바닥 재
    for (dx, dy, rz) in ((-0.10, 0.46, 0.2), (0.08, 0.52, -0.4), (0.00, 0.42, 1.1)):
        cyl(0.048, 0.44, (dx, dy, 0.09), rot=(0, math.radians(84), rz), mat=M['char'], verts=8)
    # ② 소래(자염 토기) — 넓고 얕다. 아궁이 위에 앉는다.
    cyl(0.40, 0.24, (0.0, 0.0, 0.845), mat=M['clay'], verts=22)
    cyl(0.425, 0.06, (0.0, 0.0, 0.975), mat=M['clay'], verts=22)              # 아가리 전
    cyl(0.355, 0.02, (0.0, 0.0, 0.985), mat=M['brine'], verts=22)             # 졸고 있는 함수
    for i in range(7):                                                         # 전에 앉은 소금 결정
        t = i / 7 * 2 * math.pi + 0.4
        ico(random.uniform(0.030, 0.048), (math.cos(t) * 0.335, math.sin(t) * 0.335, 0.998),
            subdiv=1, mat=M['ash'], scale=(1.2, 1.2, 0.5), jitter=0.35, seed=6790 + i)
    # ③ 고무래 — 소래에 걸쳐 세운 나무 주걱. 꼭대기가 40px(BUILDING_HEIGHT.salt_kiln)이다.
    cyl(0.030, 0.92, (-0.13, -0.16, 0.86), rot=(math.radians(-24), math.radians(15), 0),
        mat=M['log'], verts=8)
    box(0.26, 0.05, 0.13, (-0.06, -0.06, 0.99), rot=(0, math.radians(-16), 0), mat=M['plank2'])
    # ④ 곁에 쟁여 둔 장작 — 불을 오래 때는 물건이다
    for i, (dx, dy) in enumerate(((-0.50, 0.10), (-0.52, -0.06))):
        cyl(0.050, 0.52, (dx, dy, 0.05 + i * 0.09), rot=(math.radians(90), 0, math.radians(18 + i * 9)),
            mat=M['log'], verts=8)


def _axis_vecs(side):
    """변형(벽·문·울타리)의 두 수평축.
    side 'N' = 셀 **북쪽 변**에 서는 것 → 몸이 월드 **x** 를 따라 1m 눕는다.
    side 'E' = 셀 **동쪽 변** → 월드 **y** 를 따라 눕는다.
    반환 (a, s): a=몸이 눕는 축 · s=두께 방향이면서 **화면 앞쪽**(+x/+y 가 화면 아래쪽이다)."""
    if side == 'N':
        return V((1.0, 0.0, 0.0)), V((0.0, 1.0, 0.0))
    return V((0.0, 1.0, 0.0)), V((1.0, 0.0, 0.0))


def bar(r, ln, center, along, mat, verts=8):
    """가로로 눕힌 통나무 — 축을 **글자로** 받는다.
    ★1패스 결함: 오일러 (90°,0,rz) 로 눕혔더니 N 은 y 를, E 는 x 를 따라 누웠다(정확히 반대).
      회전을 손으로 짜맞추지 말고 축을 이름으로 고른다."""
    rot = (0, math.radians(90), 0) if along == 'x' else (math.radians(90), 0, 0)
    return cyl(r, ln, center, rot=rot, mat=mat, verts=verts)


def m_wall(side='N'):
    """벽 — 판자 2, 높이 2m(WALL_HEIGHT 64px). 송국리 **지상 통나무 벽(굴립주 벽주)**.
    ★밑변이 셀 경계에서 정확히 끝난다(축 −0.5..+0.5m) — 옆 벽 유닛과 이음새가 맞는다.
    ★기둥 반지름은 간격의 반(0.0833)이다: 더 굵으면 서로 먹어 **판벽처럼 납작**해지고,
      더 가늘면 사이가 비어 벽이 아니게 된다(1패스에서 0.098 로 굵어 통판이 됐다)."""
    random.seed(675 if side == 'N' else 676)
    a, sv = _axis_vecs(side)
    along = 'x' if side == 'N' else 'y'
    for i in range(6):
        u = -0.41667 + i * 0.16667
        p = a * u
        cyl(0.0833, 2.0, (p.x, p.y, 1.0), mat=(M['log'] if i % 2 else M['log2']), verts=9)
    for z in (0.62, 1.52):                                                    # 가로 띠장(안쪽에 덧댄다)
        q = sv * -0.075
        bar(0.034, 0.98, (q.x, q.y, z), along, M['log2'], verts=8)
    for u in (-0.30, 0.30):                                                   # 새끼 결속
        p = a * u
        bar(0.017, 0.24, (p.x, p.y, 1.52), ('y' if along == 'x' else 'x'), M['cord'], verts=6)
    q = sv * -0.01
    bar(0.050, 1.00, (q.x, q.y, 1.958), along, M['log'], verts=9)             # 처마도리(마감)


def m_door(side='N', opened=False):
    """문 — 판자 2, 높이 2m. 문설주 둘 + 인방 + 널문짝. 경첩이 없다(청동기 · 철기 금지) —
    문짝 위아래를 새끼로 문설주에 매달고 **안쪽으로 밀어** 연다(움집 문은 남벽 = 안이 북쪽이다).
    opened=True 는 문짝이 **뒤로**(−s) 젖혀진 모습이다 — 문설주·인방이 앞에 남아 개구가 읽힌다.
    ★코드는 높이를 줄이지 않는다(종전 '열림=1/4 높이 반투명' 폐지) — 열림도 **몸체**다."""
    random.seed(677)
    a, sv = _axis_vecs(side)
    along = 'x' if side == 'N' else 'y'
    rz0 = 0.0 if side == 'N' else math.radians(90)
    for u in (-0.455, 0.455):                                                 # 문설주 둘 — 앞으로 조금 내민다
        p = a * u + sv * 0.045
        cyl(0.105, 2.0, (p.x, p.y, 1.0), mat=M['log'], verts=10)
    q = sv * 0.045
    bar(0.068, 1.02, (q.x, q.y, 1.945), along, M['log'], verts=10)            # 인방
    bar(0.048, 1.00, (q.x, q.y, 0.048), along, M['log2'], verts=9)            # 문지방
    if opened:
        # ★★열린 문 = **문짝을 들어낸 문틀**이다. 청동기 문에는 경첩이 없다 —
        #   위아래를 새끼로 매달아 놓고, 열 때는 그 새끼를 풀어 **문짝을 들어내 옆에 세운다**.
        #   그래서 열림은 문설주·인방·문지방과 **풀린 새끼**만 남고 개구는 비어(투명) 있다.
        # ★왜 젖힌 문짝을 안 그리나 — 2:1 다이메트릭에서는 **그릴 수가 없다**(2패스 실측):
        #   화면 x 는 (wx−wy) 라서, 문짝을 벽에 수직으로(±s) 젖히면 화면 x 가 거의 안 움직이고
        #   (열림 74°·100° 둘 다 −1.4px), 벽과 나란히(±a) 젖히면 그건 개구 자리 그대로다.
        #   ⇒ 어느 각도로 젖혀도 **닫힌 문과 같은 자리에 같은 너비**로 앉는다. 종전 벡터가
        #     '1/4 높이 반투명'이라는 관습을 쓴 이유가 이것이고, 관습을 쓰되 **몸체로** 쓴다.
        for u in (-0.40, 0.40):                                               # 풀려 늘어진 새끼
            p2 = a * u + sv * 0.02
            cyl(0.016, 0.30, (p2.x, p2.y, 1.62), rot=(math.radians(14), 0, 0), mat=M['cord'], verts=6)
        bar(0.030, 0.86, (q.x - sv.x * 0.09, q.y - sv.y * 0.09, 1.80), along, M['cord'], verts=6)
    else:
        q2 = sv * -0.075                                                      # 문짝은 설주보다 **뒤**에 앉는다
        box(0.74, 0.075, 1.76, (q2.x, q2.y, 0.94), rot=(0, 0, rz0), mat=M['door'])
        for z in (0.44, 1.40):                                                # 가로 띠장 둘
            box(0.76, 0.090, 0.062, (q2.x, q2.y, z), rot=(0, 0, rz0), mat=M['plank2'])
        for u in (-0.40, 0.40):                                               # 매단 새끼(위·아래)
            p2 = a * u
            for z in (1.66, 0.26):
                bar(0.017, 0.24, (p2.x, p2.y, z), ('y' if along == 'x' else 'x'), M['cord'], verts=6)
        h = a * 0.28 + sv * -0.10
        cyl(0.028, 0.09, (h.x, h.y, 1.02), rot=(math.radians(90) if along == 'x' else 0,
                                                0 if along == 'x' else math.radians(90), 0),
            mat=M['log2'], verts=8)                                           # 문고리 나무(자유변 쪽)


def m_fence(ori='NS'):
    """울타리 — 판자 1, 높이 1m. 말뚝 둘 + 가로대 둘.
    ★말뚝을 **셀 경계**(축 ±0.5m)에 둔다 — 옆 칸 울타리의 말뚝과 **같은 자리**에 서서
      이음새가 맞는다(재민 실기 ②). 코드는 이웃을 안 본다(§0-ⓑ 실측)."""
    random.seed(678 if ori == 'NS' else 679)
    side = 'E' if ori == 'NS' else 'N'          # NS = 남북 = 월드 y 축 · EW = 동서 = 월드 x 축
    a, sv = _axis_vecs(side)
    along = 'y' if ori == 'NS' else 'x'
    for u in (-0.5, 0.5):
        p = a * u
        cyl(0.062, 1.00, (p.x, p.y, 0.50), mat=M['log'], verts=9)
        cyl(0.080, 0.075, (p.x, p.y, 0.03), mat=M['soil'], verts=9)
    for z in (0.44, 0.86):
        q = sv * -0.045
        bar(0.036, 1.00, (q.x, q.y, z), along, M['log2'], verts=8)
    for u in (-0.5, 0.5):                                                     # 가로대 묶은 새끼
        p = a * u
        for z in (0.44, 0.86):
            bar(0.015, 0.20, (p.x, p.y, z), ('y' if along == 'x' else 'x'), M['fiber'], verts=6)


# ═══════════════ [T95] 옷 여섯 — 개어 놓은 한 벌 ═══════════════
def _folded(mat, trim, plk, thick=0.055, fuzz=0.0, strands=0, sheen=False, sd=901):
    """**개어 놓은 옷 한 벌** — 입은 모습이 아니라 **물건**이다(짐에 든 것).

    시트(`char_render.py`)는 몸에 걸친 옷을 그린다. 짐 창의 옷은 **개켜 쌓인 천**이어야
    "물건"으로 읽힌다 — 옷걸이도 마네킹도 청동기에 없다.
    ⇒ 저고리를 반 접어 쌓고, 그 위에 **허리끈**을 한 바퀴 두르고, 접힌 면에 **앞섶**이 비친다.
      셋(본천·허리끈·앞섶)은 시트와 **같은 세 재질**이다 — 같은 물건이라는 표시다.

    thick   한 겹 두께(m) — 갖옷은 두껍다(`FUR_PAD` 와 같은 뜻)
    fuzz    가장자리 털(갖옷) — 무두질 전 털가죽이라 결이 삐져나온다
    strands 엮은 결(풀옷) — 풀을 엮은 것이라 올이 굵다
    sheen   무두질한 가죽의 윤(가죽옷)
    """
    random.seed(sd)
    W, D = 0.62, 0.44                       # 갠 옷 한 장의 가로 · 세로
    n = 3                                   # 겹 수
    # ★★패스 둘을 태웠다. 1패스는 `box` 로 쌓아 **나무 궤짝**, 2패스는 이코스피어로 눌러 **알·번데기**.
    #   갠 옷은 **납작한 층이 어긋나게 포개진 것**이고, 앞쪽에 **접힌 말이(roll)** 가 보인다.
    #   ⇒ 층은 납작한 사각(천은 네모로 갠다) · 앞 모서리마다 가는 원통으로 **말린 자리**를 얹는다.
    #     그 말이가 "각진 궤짝"과 "둥근 알" 사이의 답이다.
    for i in range(n):
        z = 0.045 + i * thick
        w = W * (1.0 - i * 0.075)
        d = D * (1.0 - i * 0.085)
        ox, oy = (i - 1) * 0.020, (i - 1) * 0.016      # 층이 어긋난다 — 손으로 갠 티
        box(w, d, thick * 0.80, (ox, oy, z), rot=(0, 0, (i - 1) * 0.045), mat=mat)
        # 접힌 말이 — 앞 모서리와 옆 모서리. 천이 접히면 각이 아니라 **말이**가 생긴다.
        cyl(thick * 0.40, w, (ox, oy - d * 0.5, z), rot=(0, math.radians(90), (i - 1) * 0.045),
            mat=mat, verts=10, smooth=True)
        cyl(thick * 0.36, d, (ox - w * 0.5, oy, z), rot=(math.radians(90), 0, (i - 1) * 0.045),
            mat=mat, verts=10, smooth=True)
    top = 0.045 + (n - 1) * thick + thick * 0.40
    # 앞섶 — 여민 자리가 한 톤 짙다(시트의 주된 앞뒤 신호를 물건에서도 쓴다)
    box(W * 0.17, D * 0.72, thick * 0.30, (-W * 0.17, -D * 0.02, top + thick * 0.12), mat=plk)
    # 허리끈 — 갠 옷을 **묶어** 둔다. 뭉치를 감싸야지 위에 얹히면 손잡이로 읽힌다.
    for (ax, ay, rot, ln) in ((0.0, D * 0.06, (0, math.radians(90), 0), W * 1.02),
                              (W * 0.24, 0.0, (math.radians(90), 0, 0), D * 1.02)):
        cyl(0.019, ln, (ax, ay, top * 0.52), rot=rot, mat=trim, verts=10, smooth=True)
    for a in (0.7, 2.6):                    # 매듭 끝자락
        cyl(0.016, 0.17, (W * 0.24 + math.cos(a) * 0.07, D * 0.06 + math.sin(a) * 0.07,
                          top * 0.52 + 0.02),
            rot=(math.sin(a) * 1.3, -math.cos(a) * 1.3, 0), mat=trim, verts=6, smooth=False)
    if fuzz > 0:                            # 갖옷 — 털이 **윗면 전체**로 곤두선다(가장자리만이 아니다)
        for i in range(90):
            px = random.uniform(-W * 0.48, W * 0.48)
            py = random.uniform(-D * 0.46, D * 0.46)
            edge = max(abs(px) / (W * 0.5), abs(py) / (D * 0.5))
            ln = fuzz * (0.55 + 0.75 * edge)
            ex, ey = random.uniform(-1, 1), random.uniform(-1, 1)
            cyl(0.0075, ln, (px, py, top + ln * 0.35),
                rot=(ey * 0.7, -ex * 0.7, 0), mat=mat, verts=4, smooth=False)
    if strands:                             # 풀옷 — 엮은 올이 굵어 겉으로 드러난다
        for i in range(strands):
            t = (i + 0.5) / strands
            cyl(0.014, D * 0.94, (-W * 0.46 + W * 0.92 * t, 0.0, top + thick * 0.24),
                rot=(math.radians(90), 0, 0), mat=(plk if i % 3 == 0 else mat), verts=5, smooth=False)
    if sheen:                               # 무두질 가죽 — 접힌 면에 빛이 흐른다
        box(W * 0.74, D * 0.13, thick * 0.16, (0.0, -D * 0.20, top + thick * 0.10), mat=trim)


def m_clothes_fur():     _folded(M['cl_fur'], M['cl_fur_t'], M['cl_fur_p'], thick=0.085, fuzz=0.075, sd=901)
def m_clothes_leather(): _folded(M['cl_leather'], M['cl_leather_t'], M['cl_leather_p'], thick=0.052, sheen=True, sd=902)
def m_clothes_hide():    _folded(M['cl_hide'], M['cl_hide_t'], M['cl_hide_p'], thick=0.068, sd=903)
def m_clothes_ramie():   _folded(M['cl_ramie'], M['cl_ramie_t'], M['cl_ramie_p'], thick=0.040, sd=904)
def m_clothes_hemp():    _folded(M['cl_hemp'], M['cl_hemp_t'], M['cl_hemp_p'], thick=0.046, sd=905)
def m_clothes_fiber():   _folded(M['cl_fiber'], M['cl_fiber_t'], M['cl_fiber_p'], thick=0.058, strands=11, sd=906)


# ═══════════════ [T95] 시설 둘 — 바닥 · 계단 ═══════════════
def m_floor():
    """다짐 바닥 — 움집 실내 바닥 한 칸. `BUILDING_HEIGHT.floor = 4px` = 0.125m."""
    random.seed(921)
    box(1.0, 1.0, 0.125, (0, 0, 0.0625), mat=M['tamped2'])
    for i in range(7):                       # 밟아 다진 자국 — 판판한 판이 아니다
        a = i * 0.9
        o = ico(0.13, (math.cos(a) * 0.30, math.sin(a) * 0.30, 0.122), subdiv=1, mat=M['tamped2'],
                scale=(1.0, 1.0, 0.10), jitter=0.28, smooth=False)


def m_stair(d='N'):
    """계단 — **3칸 24 소단**. 클라(`36-r2-building.js`)가 그리던 그 수치 그대로다:
       소단 24개 · 칸당 8 · 소단 깊이 4px(0.125m) · 폭 1칸 · 높이 0~64px(0~2m).
       원점 = 칸 0 중심의 지면(덩어리형 앵커). `dir` 로 뻗는다.
    ★흙을 다져 올리고 디딤에 널을 얹은 꼴 — 청동기에 석축 계단은 없다(못·경첩도 없다)."""
    random.seed(922)
    dv = {'N': (0.0, -1.0), 'S': (0.0, 1.0), 'E': (1.0, 0.0), 'W': (-1.0, 0.0)}[d]
    along_x = abs(dv[0]) > 0.5
    SUB, PER = 24, 8
    for S in range(SUB):
        cell, sub = S // PER, S % PER
        w = cell * 1.0 + (sub - 3.5) * 0.125
        z = (S / (SUB - 1.0)) * 2.0
        cx, cy = dv[0] * w, dv[1] * w
        sx = 0.125 if along_x else 1.0
        sy = 1.0 if along_x else 0.125
        if z > 0.02:
            box(sx, sy, z, (cx, cy, z * 0.5), mat=M['earth'])          # 다진 흙 심
        box(sx * 1.02, sy * 1.02, 0.030, (cx, cy, z + 0.015), mat=M['tread'])   # 디딤 널
    # 옆을 잡아 주는 통나무 — 흙이 무너지지 않게 (양옆)
    for sgn in (-1, 1):
        mx = dv[0] * 1.0 + (0.0 if along_x else sgn * 0.5)
        my = dv[1] * 1.0 + (sgn * 0.5 if along_x else 0.0)
        o = cyl(0.055, 2.9, (mx, my, 0.52), rot=((0, math.radians(72), 0) if along_x
                                                 else (math.radians(72), 0, math.radians(90))),
                mat=M['log'], verts=8, smooth=True)


def m_stair_n(): m_stair('N')
def m_stair_e(): m_stair('E')
def m_stair_s(): m_stair('S')
def m_stair_w(): m_stair('W')


# ═══════════════ 모델 — 움집 실내 장식 둘 [T97] ═══════════════
# ★이 둘은 **건물 행이 아니다**(T97 §0-ⓑ 실측): 서버 `BUILDING_RECIPES` 에 없고,
#   `BUILDING_TYPE_TO_ITEM` 은 그 표에서만 만들어지며, `doDismantleBuilding` 은 `b.type` 으로 돈다.
#   클라가 `building.data.hut` 의 실내 좌표를 보고 그리는 **장식**이라 해체 대상이 아니다.
#   ⇒ 물건 하나 = 모델 하나 = **렌더 하나**(세계 스프라이트만). 아이콘은 회부한다 —
#     짐에 들어가지 않는 것에 인벤 그림을 만들면 그게 쓸 데 없는 사본이다(T67 캐논).


def m_bed():
    """거적 침상 — 움집 실내 1인 자리. 침대 6 = 사람 여섯(랩 정본 "1인 1침대" · HOME_SLOTS 사상)이라
    **한 칸이 한 자리**다. 그래서 셀을 꽉 채우지 않는다 — 여섯이 여섯으로 읽혀야 한다.
    ★거적은 판 하나로 못 만든다(T79b 잎 교훈 — 납작한 판은 '종이'로 읽힌다).
      짚 오리를 나란히 눕히고 두 곳을 새끼로 묶어 **엮은 결**을 만든다."""
    random.seed(971)
    box(0.74, 0.60, 0.030, (0.0, 0.0, 0.015), mat=M['straw'])              # 거적 바탕
    for i in range(9):                                                      # 짚 오리 — 결
        y = -0.255 + i * 0.0638
        cyl(0.026, 0.72, (0.0, y, 0.040), rot=(0, math.radians(90), 0),
            mat=M['straw'], verts=6, smooth=False)
    for sx in (-0.355, 0.355):                                              # 말린 양 끝단
        cyl(0.040, 0.60, (sx, 0.0, 0.042), rot=(math.radians(90), 0, 0),
            mat=M['straw'], verts=8, smooth=True)
    for sx in (-0.20, 0.20):                                                # 새끼 두 줄 — 엮은 자리
        cord(0.012, 0.62, (sx, 0.0, 0.058), (math.radians(90), 0, 0), M['cord'])
    # 목침 — 통나무를 깎아 만든 나무 베개. 한쪽 끝에만 둔다(머리 쪽이 정해져 있어야 자리로 읽힌다).
    box(0.21, 0.10, 0.085, (-0.245, 0.0, 0.098), mat=M['pillow'])
    for sy in (-0.038, 0.038):                                              # 목침 발 — 바닥에서 살짝 띄운다
        box(0.05, 0.022, 0.055, (-0.245, sy, 0.028), mat=M['pillow'])


def m_hearth():
    """화덕(노지) — 수혈주거 한가운데 판 얕은 불자리. 막돌을 둘러 놓고 재가 깔린다.
    ★**몸체만** 굽는다: 잉걸빛은 코드가 얹는다 — 모닥불과 **같은 경계**다(T67 ⓒ).
      불이 꺼진 화덕도 같은 몸이어야 한다. 발광 재질을 여기 넣으면 그 경계가 무너진다."""
    random.seed(972)
    # ★1패스 실측: 재 원반(r 0.42)이 막돌 고리보다 넓어 **회색 접시 위의 돌무더기**로 읽혔다.
    #   벡터가 옳았다 — 벡터의 그림은 어두운 불자리가 주인공이고 막돌은 테두리다
    #   (불자리 24×12px · 막돌 6.4×4.4px · 고리 반지름 13px). 그 비례로 되돌린다.
    cyl(0.400, 0.022, (0.0, 0.0, 0.011), mat=M['ash'], verts=20)            # 재 — 바닥에 퍼진 자리
    cyl(0.265, 0.030, (0.0, 0.0, 0.030), mat=M['coal'], verts=18)           # 불자리 — 그을어 검다(주인공)
    for i in range(6):                                                      # 막돌 여섯(벡터가 여섯이었다)
        # ★고리 반지름 실측 3패스: 0.408 은 재 밖에서 **떠서 꽃잎 여섯**, 0.305 는 불자리를
        #   **덮어 돌무더기**. 0.355 — 불자리(0.265) 테두리 바로 밖, 재(0.400) 안쪽에 걸친다.
        t = i / 6 * 2 * math.pi
        ico(random.uniform(0.060, 0.082), (math.cos(t) * 0.355, math.sin(t) * 0.355, 0.030),
            subdiv=1, mat=(M['stone'] if i % 2 else M['stone2']),
            scale=(1.25, 1.25, 0.58), jitter=0.32, seed=9720 + i)
    for (t, tilt) in ((0.9, 84), (3.6, 84)):                                # 탄 장작 둘 — 불자리 안에
        cyl(0.034, 0.38, (math.cos(t) * 0.04, math.sin(t) * 0.04, 0.062),
            rot=(0, math.radians(tilt), t), mat=M['char'], verts=8)
    for i in range(5):                                                      # 숯 조각
        ico(random.uniform(0.028, 0.046), (random.uniform(-0.15, 0.15), random.uniform(-0.15, 0.15), 0.055),
            subdiv=1, mat=M['coal'], scale=(1.2, 1.2, 0.6), jitter=0.3, seed=9730 + i)


# ═══════════════ 표 — 물건 하나 = 모델 하나 = 렌더 둘 ═══════════════
# icon:      /assets/icons/<icon>.png (96px) — 인벤·조합법·바닥·거래소·창고 공용 정본
# btype:     server/zone.js 의 건물 타입(BUILDING_HEIGHT 대조 키)
# body_px:   스프라이트 몸체 높이(px) — 모델의 실제 z 최대와 ±1px 로 맞아야 한다
# flame_px:  코드가 몸체 위에 얹는 상태 그림의 높이(px). body_px + flame_px = BUILDING_HEIGHT[btype]
# world:     [(세계 키, 모델 인자)] — 첫 항목이 아이콘을 굽는 대표 변형이다
PROPS = [
    dict(icon='item_workbench', btype='workbench', build=m_workbench, body_px=26, flame_px=0,
         world=[('workbench', {})]),
    dict(icon='item_drying_rack', btype='drying_rack', build=m_drying_rack, body_px=34, flame_px=0,
         world=[('drying_rack', {})]),
    dict(icon='item_chest', btype='chest', build=m_chest, body_px=24, flame_px=0,
         world=[('chest', {}), ('chest_exchange', {'exchange': True})]),
    dict(icon='item_campfire', btype='campfire', build=m_campfire, body_px=10, flame_px=10,
         world=[('campfire', {})]),
    dict(icon='item_salt_kiln', btype='salt_kiln', build=m_salt_kiln, body_px=40, flame_px=0,
         world=[('salt_kiln', {})]),
    dict(icon='item_wall', btype='wall', build=m_wall, body_px=64, flame_px=0,
         world=[('wall_n', {'side': 'N'}), ('wall_e', {'side': 'E'})]),
    dict(icon='item_door', btype='door', build=m_door, body_px=64, flame_px=0,
         world=[('door_n', {'side': 'N', 'opened': False}), ('door_n_open', {'side': 'N', 'opened': True}),
                ('door_e', {'side': 'E', 'opened': False}), ('door_e_open', {'side': 'E', 'opened': True})]),
    dict(icon='item_fence', btype='fence', build=m_fence, body_px=32, flame_px=0,
         world=[('fence_ns', {'ori': 'NS'}), ('fence_ew', {'ori': 'EW'})]),
    # ★[T95] T67 이 남긴 마지막 셋 중 둘. 농지는 여기 없다 —
    #   빈 밭의 **세계 스프라이트는 이미 있다**(T79c `crops/grain_0` = 이랑만 갈아 놓은 밭).
    #   그래서 농지 아이콘은 `fields_render.py` 가 **같은 `soil_bed` 모델**로 굽는다.
    #   여기 또 만들면 그게 사본이고, 밭을 고치는 날 짐 창과 세계가 갈린다(T67 캐논).
    dict(icon='item_floor', btype='floor', build=m_floor, body_px=4, flame_px=0,
         world=[('floor', {})]),
    dict(icon='item_stair', btype='stair', build=m_stair, body_px=64, flame_px=0,
         world=[('stair_n', {'d': 'N'}), ('stair_e', {'d': 'E'}),
                ('stair_s', {'d': 'S'}), ('stair_w', {'d': 'W'})]),
]

# ═══════════════ 표 둘째 — 실내 장식(건물 행이 **아닌** 것) [T97] ═══════════════
# ★왜 표가 둘인가: 위 `PROPS` 는 전부 서버 건물 타입이 있고, 짐에 들어가고, 해체된다.
#   침상·화덕은 셋 다 아니다(§0-ⓑ). 같은 표에 억지로 넣으면 `btype` 칸이 거짓말을 하거나
#   `test-props ③`(서버 BUILDING_HEIGHT 대조)이 없는 키를 찾다 빨개진다.
#   ⇒ **다른 것은 다른 표**로 둔다. 앵커에 `decor: true` 를 적어 하네스가 갈라 보게 한다.
# body_px: 모델 실측 z 최대와 ±1px 로 맞아야 한다(서버 대조가 없으니 이 줄이 유일한 자다).
DECOR = [
    dict(key='bed', build=m_bed, body_px=4),
    dict(key='hearth', build=m_hearth, body_px=4),
]


# ═══════════════ [T72] 손도구·손에 드는 것 — 아이콘 1차 13종 ═══════════════
# ★같은 씬·같은 재질 문법을 쓴다(파일을 새로 파면 씬이 두 벌이 된다 — 그게 사본이다).
#   지금은 **아이콘만** 굽지만 구조는 T67 그대로다: 나중에 손에 들리거나 바닥에 떨어질 때
#   `PROPS` 처럼 `world=[...]` 를 붙이면 **같은 모델**에서 세계 렌더가 나온다.
# ★고증(청동기 후기 송국리): 일상 도구는 **간석기**(갈아 만든 돌)다. 조잡한 셋은 **뗀석기 급조**
#   (자갈을 깨 날을 세워 나뭇가지에 풀로 동여맨 것 — `zone.js RECIPES` 의 자갈·잔가지·풀 그대로).
#   철기 금지. 검은 **마제석검**이다 — 레시피가 `wood 2 + stone 8` 이라 정본이 돌이라고 말한다.

def _lash(x, y, z, rot, r=0.032, ln=0.30, n=3, mat=None, gap=0.075):
    """동여맨 끈 n 바퀴 — 조잡한 석기와 간석기 자루를 묶는 그 층."""
    for i in range(n):
        cyl(r, ln, (x, y, z + (i - (n - 1) / 2) * gap), rot=rot, mat=(mat or M['fiber']), verts=7)


def m_crude_axe():
    """조잡한 돌도끼 — 자갈 2 + 잔가지 1 + 풀 2. **깨뜨린 날**을 갈라진 가지에 풀로 동여맸다.
    간석기(`axe`)와 **한눈에 구별**돼야 한다(같은 그림이면 속는다 — 51-s-side 가 이모지로도 그렇게 했다)."""
    #   ⚠1패스는 돌을 자루 **가운데**에 붙여 곤봉으로 읽혔다. 날은 **끝**에 있어야 도끼가 된다.
    random.seed(720)
    cyl(0.072, 1.40, (-0.24, 0, 0.16), rot=(0, math.radians(84), math.radians(10)), mat=M['bark2'], verts=8)
    for sgn in (-1, 1):                                                    # 갈라진 가지 끝(날을 물린다)
        cyl(0.040, 0.42, (0.36, sgn * 0.075, 0.20), rot=(0, math.radians(78), math.radians(10)),
            mat=M['bark2'], verts=6)
    ico(0.30, (0.62, 0.0, 0.30), subdiv=1, mat=M['chipped'], scale=(1.05, 0.42, 1.15), jitter=0.26, smooth=False)
    ico(0.15, (0.80, 0.0, 0.44), subdiv=1, mat=M['chipped'], scale=(0.9, 0.30, 1.1), jitter=0.30, smooth=False)  # 깨뜨린 날끝
    _lash(0.40, 0.0, 0.24, (0, math.radians(90), math.radians(84)), ln=0.30, n=3)


def m_crude_pick():
    """조잡한 돌괭이 — 자갈 3 + 잔가지 1 + 풀 2. 뾰족한 자갈을 **가로로** 묶었다(찍는 자세)."""
    #   ⚠도끼와 갈려야 한다: 도끼는 날이 자루와 **한 줄**, 괭이는 자루를 **가로질러** 아래로 찍는다.
    random.seed(721)
    cyl(0.070, 1.46, (-0.22, 0, 0.34), rot=(0, math.radians(86), math.radians(6)), mat=M['bark2'], verts=8)
    ico(0.30, (0.46, 0.30, 0.22), subdiv=1, mat=M['chipped'], scale=(0.60, 1.30, 0.80), jitter=0.26, smooth=False)
    ico(0.16, (0.50, 0.62, 0.06), subdiv=1, mat=M['chipped'], scale=(0.55, 1.35, 0.7), jitter=0.30, smooth=False)  # 찍는 끝
    ico(0.13, (0.42, -0.10, 0.34), subdiv=1, mat=M['chipped'], scale=(0.7, 0.9, 0.7), jitter=0.32, smooth=False)   # 뒤 굄돌
    _lash(0.44, 0.06, 0.30, (0, math.radians(90), math.radians(86)), ln=0.30, n=3)


def m_crude_blade():
    """조잡한 돌칼 — 자갈 2 + 잔가지 1 + 풀 1. 자루가 짧다(가장 가볍고 가장 빨리 닳는다)."""
    #   ⚠1패스는 날이 자루보다 커서 창끝으로 읽혔다. **자루가 절반은 돼야** 칼이다.
    random.seed(722)
    cyl(0.070, 0.80, (-0.40, 0.0, 0.10), rot=(0, math.radians(88), math.radians(8)), mat=M['bark2'], verts=9)
    ico(0.26, (0.20, 0.0, 0.13), subdiv=1, mat=M['chipped'], scale=(1.55, 0.22, 0.62), jitter=0.20, smooth=False)
    ico(0.12, (0.52, 0.0, 0.11), subdiv=1, mat=M['chipped'], scale=(1.7, 0.20, 0.50), jitter=0.24, smooth=False)
    _lash(-0.10, 0.0, 0.12, (0, math.radians(90), math.radians(88)), ln=0.24, n=2, gap=0.085)


def m_axe():
    """도끼 — 통나무 5 + 석재 2. **간석기 합인석부**: 갈아 낸 매끈한 날 + 다듬은 자루 + 새끼 결속.
    조잡한 것과 갈리는 단서는 ⓐ 매끈한 면 ⓑ 좌우 대칭 ⓒ 자루가 다듬어졌다는 것이다."""
    #   ⚠1패스는 날이 넓고 납작해 **삽**으로 읽혔다. 도끼는 ⓐ 자루 **끝**에 ⓑ **쐐기**(등이 두껍고 날이 얇다)
    #     ⓒ 자루보다 **작다**. 셋을 다 지켜야 96px 에서 도끼가 된다.
    random.seed(723)
    cyl(0.066, 1.52, (-0.26, 0, 0.16), rot=(0, math.radians(84), math.radians(10)), mat=M['haft'], verts=10)
    cyl(0.086, 0.30, (0.44, 0, 0.22), rot=(0, math.radians(84), math.radians(10)), mat=M['haft'], verts=10)  # 자루 머리(두껍게 남긴다)
    box(0.30, 0.155, 0.44, (0.60, 0.0, 0.30), rot=(0, math.radians(-8), 0), mat=M['ground'])                  # 날 몸(등이 두껍다)
    box(0.16, 0.055, 0.50, (0.80, 0.0, 0.33), rot=(0, math.radians(-12), 0), mat=M['ground'])                 # 날(얇게 갈아 낸 인부)
    _lash(0.44, 0.0, 0.22, (0, math.radians(90), math.radians(84)), ln=0.28, n=3, mat=M['cord'])


def m_pickaxe():
    """곡괭이 — 통나무 3 + 석재 5. 간석기 **돌괭이**(따비·괭이 계열): 갈아 낸 날을 자루에 **직각**으로."""
    random.seed(724)
    cyl(0.068, 1.50, (-0.24, 0, 0.40), rot=(0, math.radians(87), math.radians(4)), mat=M['haft'], verts=10)
    box(0.185, 0.66, 0.14, (0.46, 0.34, 0.26), rot=(math.radians(-30), 0, 0), mat=M['ground'])   # 넓은 날(자루와 직각)
    box(0.155, 0.30, 0.075, (0.46, 0.70, 0.06), rot=(math.radians(-30), 0, 0), mat=M['ground'])  # 갈아 낸 날끝
    box(0.15, 0.18, 0.16, (0.46, -0.14, 0.40), mat=M['ground'])                                   # 자루에 물린 목
    _lash(0.46, -0.02, 0.38, (math.radians(90), 0, 0), ln=0.30, n=3, mat=M['cord'])


def m_sword():
    """검 — 통나무 2 + 석재 8. **마제석검**: 갈아 만든 나뭇잎꼴 검신 + 등날(척) + 자루.
    ⚠지시서는 '청동검'이라 했는데 `RECIPES.sword` 가 `wood 2 + stone 8` 이라 **정본은 돌**이다(§0-ⓐ).
      그리고 마제석검은 송국리 문화기의 표지 유물이라 고증도 같은 답을 낸다."""
    random.seed(725)
    box(0.30, 0.115, 0.115, (-0.66, 0, 0.10), rot=(0, 0, 0), mat=M['haft'])          # 자루
    box(0.11, 0.30, 0.10, (-0.50, 0, 0.10), mat=M['ground'])                          # 검코(段)
    box(0.62, 0.27, 0.075, (-0.10, 0, 0.10), mat=M['ground'])                         # 검신(아래쪽 — 가장 넓다)
    box(0.52, 0.21, 0.070, (0.44, 0, 0.10), mat=M['ground'])                          # 검신(위쪽 — 좁아진다)
    box(1.12, 0.055, 0.125, (0.10, 0, 0.10), mat=M['ground'])                         # 등날(척) — 마제석검의 표지
    for sgn in (-1, 1):                                                                # 봉부(끝이 좁아진다)
        box(0.30, 0.11, 0.055, (0.72, sgn * 0.055, 0.10), rot=(0, 0, math.radians(-sgn * 9)), mat=M['ground'])
    box(0.13, 0.20, 0.09, (-0.83, 0, 0.10), mat=M['haft'])                            # 자루끝
    _lash(-0.66, 0, 0.10, (0, math.radians(90), 0), r=0.026, ln=0.22, n=3, mat=M['cord'], gap=0.075)


def m_carrier():
    """지게 — 통나무 2 + 풀 2(`EQUIPMENT_RECIPES.carrier`). 가지 두 개를 A 자로 세우고 세장을 지르고
    밀삐(짚 끈)로 동여맸다. ★등에 진 모습은 **캐릭터 시트 규약**이라 여기선 안 만든다(회부)."""
    random.seed(726)
    for sgn in (-1, 1):                                                                # 지겟다리 둘(A 자)
        cyl(0.070, 1.60, (sgn * 0.20, 0.0, 0.80), rot=(0, math.radians(sgn * 7), 0), mat=M['haft'], verts=9)
        cyl(0.058, 0.62, (sgn * 0.40, -0.16, 1.42), rot=(math.radians(70), 0, math.radians(sgn * 26)),
            mat=M['haft'], verts=8)                                                    # 새고자(위로 뻗은 가지)
    for z in (0.42, 0.86, 1.24):                                                       # 세장 셋
        bar(0.046, 0.52, (0.0, 0.0, z), 'x', M['haft'], verts=8)
        for sgn in (-1, 1):
            _lash(sgn * 0.21, 0.0, z, (0, math.radians(90), 0), r=0.026, ln=0.17, n=2, gap=0.07)
    for sgn in (-1, 1):                                                                # 밀삐(짚 끈)
        for k in range(5):
            t = k / 4.0
            cyl(0.030, 0.24, (sgn * (0.21 + 0.07 * math.sin(t * 3.1)), 0.13 + 0.05 * math.sin(t * 3.1),
                              1.16 - t * 0.72), rot=(math.radians(74), 0, 0), mat=M['fiber'], verts=6)
    bar(0.040, 0.44, (0.0, -0.10, 0.20), 'x', M['haft'], verts=8)                       # 목발 받침


def _fish(cooked=False, dried=False):
    """생선 — 담수 잡어 한 마리(붕어꼴). `cooked=True` 는 **같은 모델**에 구운 살갗·그을음·꼬치.
    `dried=True`(T76)는 **같은 물고기**를 말린 것 — 살이 졸아 얇아지고 색이 가죽빛이 되고 끈에 꿰인다.
    ★T67 캐논의 작은 적용: 날것·구운 것·말린 것은 **같은 물고기**여야 한다.
    ★기본 인자를 안 바꿨으므로 T72 의 `fish`·`fish_cooked` 두 장은 한 픽셀도 안 변한다."""
    random.seed(727)
    body = M['driedf'] if dried else (M['grilled'] if cooked else M['scale'])
    ico(0.46, (0.0, 0.0, 0.30), subdiv=2, mat=body, scale=(1.85, 0.62, 1.00), jitter=0.05, smooth=True)      # 몸통
    ico(0.20, (0.74, 0.0, 0.30), subdiv=2, mat=body, scale=(1.25, 0.55, 0.80), jitter=0.06, smooth=True)     # 머리
    if not cooked:
        ico(0.44, (-0.02, 0.0, 0.58), subdiv=2, mat=M['dorsal'], scale=(1.72, 0.48, 0.44), jitter=0.05, smooth=True)  # 어두운 등(몸 위로 살짝 나온다)
        ico(0.085, (0.86, -0.115, 0.36), subdiv=2, mat=M['belly'], jitter=0.05, smooth=True)                  # 눈(흰자)
        ico(0.050, (0.90, -0.155, 0.36), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)                 # 눈동자
        box(0.05, 0.12, 0.34, (0.60, -0.16, 0.30), rot=(0, math.radians(-8), 0), mat=M['fin'])                # 아가미 뚜껑
        ico(0.40, (-0.06, 0.0, 0.20), subdiv=2, mat=M['belly'], scale=(1.55, 0.45, 0.55), jitter=0.05, smooth=True)
    for sgn in (-1, 1):                                                                          # 꼬리 — 갈퀴 두 갈래
        box(0.40, 0.035, 0.26, (-1.00, 0.0, 0.30 + sgn * 0.20), rot=(0, math.radians(sgn * 40), 0),
            mat=(M['scorch'] if cooked else M['fin']))
    box(0.16, 0.075, 0.16, (-0.84, 0.0, 0.30), mat=(M['scorch'] if cooked else M['fin']))        # 꼬리 밑동
    box(0.44, 0.05, 0.22, (0.02, 0.0, 0.66), rot=(0, math.radians(-12), 0),
        mat=(M['scorch'] if cooked else M['fin']))                                               # 등지느러미
    box(0.20, 0.14, 0.035, (0.30, -0.20, 0.20), rot=(math.radians(34), 0, math.radians(-10)),
        mat=(M['scorch'] if cooked else M['fin']))                                               # 가슴지느러미(작게)
    if cooked:
        cyl(0.038, 2.30, (0.0, 0.10, 0.24), rot=(0, math.radians(90), math.radians(-4)),
            mat=M['bark2'], verts=7)                                                             # 꿴 꼬치
        for (dx, dz) in ((-0.34, 0.52), (0.16, 0.56), (0.46, 0.44), (-0.62, 0.34)):              # 탄 자국
            ico(0.10, (dx, -0.14, dz), subdiv=1, mat=M['scorch'], scale=(1.5, 0.35, 0.8), jitter=0.3, smooth=False)
    if dried:
        for o in OBJS:                                                                            # ★살이 졸았다 — 두께를 눌러 같은 실루엣을 남긴다
            for v in o.data.vertices:
                v.co.y *= 0.55
        cyl(0.030, 2.60, (0.0, 0.0, 0.62), rot=(0, math.radians(90), math.radians(-3)),
            mat=M['fiber'], verts=6)                                                              # 아가미로 꿴 끈(널어 말린다)
        for (dx, dz) in ((0.34, 0.60), (-0.10, 0.62), (-0.50, 0.56)):                             # 갈라 벌린 등살
            box(0.30, 0.03, 0.10, (dx, 0.0, dz), rot=(0, math.radians(-10), 0), mat=M['scorch'])


def m_fish():        _fish(False)
def m_fish_cooked(): _fish(True)


def m_salt():
    """소금 — 1.00kg(`weights` · `salt.CFG.SALT_KG`). 자염으로 졸여 낸 **굵은 결정 무더기**.
    ★96px 는 bbox 를 꽉 채우므로(§0-ⓒ) 작은 물건은 **낱개가 아니라 무더기**로 크기를 말한다."""
    random.seed(728)
    cyl(0.62, 0.09, (0, 0, 0.045), mat=M['clay'], verts=18)                                      # 담아 둔 토기 접시
    for i in range(26):
        a = i * 2.399
        rr = random.uniform(0.05, 0.115)
        d = random.uniform(0, 0.40)
        ico(rr, (math.cos(a) * d, math.sin(a) * d, 0.10 + rr * 0.8 + (0.34 - d) * 0.42),
            subdiv=1, mat=M['saltx'], scale=(1.0, 1.0, 0.85), jitter=0.30, smooth=False)


def m_twig():
    """잔가지 — 0.40kg 불쏘시개 한 단. 조잡한 석기의 자루가 되는 그 가지다."""
    random.seed(730)
    for i in range(9):
        a = random.uniform(-0.42, 0.42)
        ln = random.uniform(1.05, 1.55)
        cyl(random.uniform(0.032, 0.056), ln,
            (random.uniform(-0.16, 0.16), random.uniform(-0.20, 0.20), 0.05 + i * 0.045),
            rot=(0, math.radians(90 - random.uniform(0, 7)), a), mat=M['bark2'], verts=6)
        if i % 3 == 0:                                                                            # 곁가지
            cyl(0.026, 0.34, (random.uniform(-0.3, 0.3), random.uniform(-0.2, 0.2), 0.07 + i * 0.045),
                rot=(0, math.radians(84), a + 0.9), mat=M['bark2'], verts=5)
    for z in (0.14, 0.30):                                                                        # 풀로 묶은 단
        for k in range(3):
            cyl(0.028, 0.46, (0.0, -0.02 + k * 0.02, z), rot=(math.radians(90), 0, 0), mat=M['fiber'], verts=6)


def m_pebble():
    """자갈 — 0.60kg 한 줌. 조잡한 석기의 날이 되는 그 돌이다(냇돌 — 모서리가 닳았다)."""
    #   ⚠1패스는 각지고 희어서 **소금 무더기**와 헷갈렸다. 냇돌은 모서리가 닳아 둥글고 색이 어둡다.
    random.seed(731)
    for i in range(11):
        a = i * 2.399
        d = random.uniform(0, 0.44)
        rr = random.uniform(0.13, 0.24)
        ico(rr, (math.cos(a) * d, math.sin(a) * d, rr * 0.72 + (0.10 if i % 3 == 0 else 0.0)),
            subdiv=2, mat=(M['river'] if i % 2 else M['river2']),
            scale=(1.30, 1.05, 0.62), jitter=0.08, smooth=True)


# ═══════════════ [T76] 먹을 것 — 어종 8 · 갯벌 4 · 보존식 6 ═══════════════
# ★고증(청동기 후기 한반도): 연어·송어는 하천 소상·산간 계류, 대구·청어·명태는 동해 한류,
#   잉어는 강·못, 새우·게·굴·해조·전복은 갯벌과 연안 바위. 전부 **잡아서 그날 먹거나 말리는** 것들이다.
# ★크기는 그림이 말하지 않는다 — 96px 를 다 채우는 것이 이 레포의 규약이고(T72 §0-ⓒ),
#   새우 0.1kg 과 연어 1.5kg 은 **이름과 kg 이** 가른다. 규약을 여기서 바꾸지 않는다.

def _finfish(L=1.0, D=0.62, H=1.00, body=None, back=None, belly=None,
             spots=0, spot_mat=None, barbels=0, dorsals=1, forked=True,
             stripe=None, headfrac=0.42, seed=760):
    """지느러미 물고기 한 마리 — 어종 여덟이 **한 몸틀**에서 나온다.
    L=길이배 · D=두께배 · H=몸높이배 · dorsals=등지느러미 수(대구·명태는 셋) ·
    barbels=입수염 수(잉어 4 · 대구·명태 1) · forked=꼬리 갈퀴 여부(송어는 반듯하다)."""
    random.seed(seed)
    body = body or M['f_silver']; back = back or M['f_back']; belly = belly or M['belly']
    ico(0.46, (0.0, 0.0, 0.30), subdiv=2, mat=body, scale=(1.85 * L, 0.62 * D, 1.00 * H), jitter=0.05, smooth=True)
    hx = 0.74 * L
    ico(0.20, (hx, 0.0, 0.30), subdiv=2, mat=body, scale=(1.25 * L, 0.55 * D, 0.80 * H), jitter=0.06, smooth=True)
    ico(0.44, (-0.02, 0.0, 0.30 + 0.28 * H), subdiv=2, mat=back,
        scale=(1.72 * L, 0.48 * D, 0.44 * H), jitter=0.05, smooth=True)                     # 어두운 등
    ico(0.40, (-0.06, 0.0, 0.30 - 0.10 * H), subdiv=2, mat=belly,
        scale=(1.55 * L, 0.45 * D, 0.55 * H), jitter=0.05, smooth=True)                     # 밝은 배
    if stripe:                                                                               # 옆줄 띠(연어 산란빛)
        #   ⚠1패스는 띠가 몸 안에 묻혀 안 보였다 — 카메라 쪽(−y)으로 **내밀고** 굵게 한다.
        ico(0.44, (-0.04, -0.30 * D, 0.30), subdiv=2, mat=stripe,
            scale=(1.66 * L, 0.16, 0.42 * H), jitter=0.04, smooth=True)
    ico(0.085, (hx + 0.12, -0.115 * D, 0.36), subdiv=2, mat=M['belly'], jitter=0.05, smooth=True)
    ico(0.050, (hx + 0.16, -0.155 * D, 0.36), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)
    box(0.05, 0.12 * D, 0.34 * H, (0.60 * L, -0.16 * D, 0.30), rot=(0, math.radians(-8), 0), mat=M['fin2'])
    for i in range(barbels):                                                                 # 입수염
        a = (i / max(1, barbels - 1) - 0.5) if barbels > 1 else 0.0
        cyl(0.018, 0.26, (hx + 0.20, a * 0.16 * D, 0.20), rot=(math.radians(70), 0, a * 1.2),
            mat=M['fin2'], verts=5)
    tx = -1.00 * L
    if forked:
        for sgn in (-1, 1):
            box(0.30, 0.030, 0.22 * H, (tx + 0.06, 0.0, 0.30 + sgn * 0.17 * H),
                rot=(0, math.radians(sgn * 40), 0), mat=M['fin2'])
    else:
        box(0.34, 0.035, 0.52 * H, (tx + 0.04, 0.0, 0.30), mat=M['fin2'])                     # 반듯한 꼬리(송어)
    box(0.16, 0.075 * D, 0.16, (-0.84 * L, 0.0, 0.30), mat=M['fin2'])
    for d in range(dorsals):                                                                 # 등지느러미 1~3
        #   ⚠셋일 때 서로 붙어 있으면 하나로 읽힌다 — 몸 길이에 고루 벌리고 사이를 띄운다.
        fx = (0.52 * L) - d * (1.10 * L / max(1, dorsals))
        box((0.44 if dorsals == 1 else 0.30) * L, 0.05, (0.22 if dorsals == 1 else 0.28) * H,
            (fx, 0.0, 0.30 + 0.38 * H), rot=(0, math.radians(-12), 0), mat=M['fin2'])
    box(0.20, 0.14 * D, 0.035, (0.30 * L, -0.20 * D, 0.30 - 0.10 * H),
        rot=(math.radians(34), 0, math.radians(-10)), mat=M['fin2'])
    for i in range(spots):                                                                   # 반점
        a = i * 2.399
        ico(0.055, (math.cos(a) * 0.66 * L, -0.16 * D, 0.30 + math.sin(a) * 0.26 * H),
            subdiv=1, mat=(spot_mat or M['f_spot']), scale=(1.1, 0.3, 1.0), jitter=0.25, smooth=True)


def m_salmon():
    """연어 — 동해로 흐르는 하천을 거슬러 오른다. 은청 등에 **산란기 붉은 옆줄**과 굽은 턱(kype). 1.5kg."""
    _finfish(L=1.22, D=0.60, H=0.92, body=M['f_silver'], stripe=M['f_rose'], forked=True, seed=761)
    box(0.30, 0.10, 0.10, (1.06, 0.0, 0.20), rot=(0, math.radians(-26), 0), mat=M['f_silver'])   # 굽은 턱


def m_cod():
    """대구 — 동해 한류. **머리가 크고 턱수염 하나**, 등지느러미 셋, 올리브갈 반점. 1.5kg."""
    _finfish(L=1.02, D=0.76, H=1.14, body=M['f_olive'], back=M['f_olive'], spots=11,
             barbels=1, dorsals=3, forked=False, headfrac=0.52, seed=762)
    ico(0.24, (0.80, 0.0, 0.34), subdiv=2, mat=M['f_olive'], scale=(1.30, 0.70, 1.05), jitter=0.06, smooth=True)  # 큰 머리


def m_herring():
    """청어 — 동해를 떼로 회유한다. **작고 몸이 높은 은빛**, 등은 청록, 꼬리가 깊게 갈라진다. 0.3kg."""
    _finfish(L=0.74, D=0.40, H=1.34, body=M['f_silver'], forked=True, seed=763)


def m_trout():
    """송어 — 산간 계류. **붉고 검은 반점**이 흩뿌려지고 꼬리가 반듯하다. 0.8kg."""
    _finfish(L=1.02, D=0.60, H=0.96, body=M['f_olive'], spots=11, spot_mat=M['f_spot2'],
             forked=False, seed=764)


def m_pollock():
    """명태 — 동해 한류. **가늘고 길며** 등지느러미 셋, 턱수염 하나, 회갈색. 0.8kg."""
    _finfish(L=1.52, D=0.42, H=0.64, body=M['f_olive'], back=M['f_back'], barbels=1,
             dorsals=3, forked=False, seed=765)


def m_carp():
    """잉어 — 강·못. **몸이 굵고 큰 비늘**, 입가 수염 **두 쌍(4)**, 황갈색. 1.0kg."""
    _finfish(L=0.98, D=0.78, H=1.10, body=M['f_gold'], back=M['f_gold'], barbels=4,
             forked=True, seed=766)


def m_shrimp():
    """새우 — 갯벌·연안. **머리(두흉부)가 굵고** 배마디가 활처럼 굽어 가늘어지며 부채꼴 꼬리로 끝난다.
    ⚠1패스는 같은 크기 구슬을 줄로 꿰어 **애벌레**로 읽혔다 — 새우는 앞이 굵고 뒤로 갈수록 가늘다."""
    random.seed(767)
    # 두흉부 — 굵고 각지다. 앞에 뿔(rostrum).
    ico(0.34, (0.72, 0.0, 0.66), subdiv=2, mat=M['shrimp'], scale=(1.35, 0.90, 1.05), jitter=0.05, smooth=True)
    box(0.46, 0.05, 0.10, (1.14, 0.0, 0.86), rot=(0, math.radians(-14), 0), mat=M['shrimp'])      # 뿔
    for i in range(6):                                                                            # 배마디 여섯 — 굽으며 가늘어진다
        t = i / 5.0
        a = -0.20 - t * 1.55
        r = 0.30 - t * 0.16
        ico(r, (0.44 + math.sin(a) * 0.72 + 0.20, 0.0, 0.62 + (math.cos(a) - 1.0) * 0.62),
            subdiv=2, mat=M['shrimp'], scale=(0.86, 1.0, 1.05), jitter=0.05, smooth=True)
    for sgn in (-1, 0, 1):                                                                        # 꼬리 부채 셋(크게 — 새우의 표지다)
        box(0.46, 0.045, 0.26, (-0.76, 0.0, 0.10 + sgn * 0.20),
            rot=(0, math.radians(sgn * 32 - 14), 0), mat=M['shrimp'])
    for sgn in (-1, 1):                                                                           # 더듬이 둘(길다)
        cyl(0.014, 1.50, (1.22, sgn * 0.10, 0.74), rot=(0, math.radians(72), math.radians(sgn * 14)),
            mat=M['fin2'], verts=5)
    for i in range(5):                                                                            # 유영지(배 밑 잔다리)
        cyl(0.016, 0.22, (0.62 - i * 0.20, 0.12, 0.40 - i * 0.05),
            rot=(math.radians(-64), 0, math.radians(-8)), mat=M['fin2'], verts=5)
    for sgn in (-1, 1):                                                                           # 걷는다리(앞쪽 굵게)
        cyl(0.024, 0.30, (0.78, sgn * 0.18, 0.42), rot=(math.radians(sgn * 54), 0, 0), mat=M['shrimp'], verts=5)
    ico(0.060, (1.00, -0.16, 0.78), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)           # 눈


def m_crab():
    """게 — 갯벌. **납작한 등딱지**에 집게 둘과 다리 여덟. 1.0kg."""
    random.seed(768)
    ico(0.62, (0, 0, 0.26), subdiv=2, mat=M['crab'], scale=(1.0, 0.82, 0.34), jitter=0.05, smooth=True)
    for sgn in (-1, 1):
        for i in range(4):                                                                   # 다리 여덟
            a = 0.30 + i * 0.42
            cyl(0.042, 0.52, (math.cos(a) * -0.52, sgn * (0.34 + i * 0.10), 0.16),
                rot=(math.radians(sgn * 62), 0, math.radians(sgn * (12 + i * 8))), mat=M['crab'], verts=6)
            cyl(0.032, 0.34, (math.cos(a) * -0.62 - 0.10, sgn * (0.62 + i * 0.13), 0.04),
                rot=(math.radians(sgn * 24), 0, math.radians(sgn * (20 + i * 8))), mat=M['crab'], verts=6)
        cyl(0.052, 0.46, (0.52, sgn * 0.34, 0.24), rot=(0, math.radians(64), math.radians(sgn * 26)),
            mat=M['crab'], verts=7)                                                          # 집게발 팔
        ico(0.20, (0.86, sgn * 0.50, 0.30), subdiv=2, mat=M['crab'], scale=(1.25, 0.60, 0.70), jitter=0.06, smooth=True)
        box(0.26, 0.07, 0.07, (1.02, sgn * 0.56, 0.30), rot=(0, 0, math.radians(sgn * 16)), mat=M['crab'])
    for sgn in (-1, 1):                                                                      # 자루눈
        cyl(0.026, 0.16, (0.30, sgn * 0.14, 0.42), mat=M['crab'], verts=5)
        ico(0.045, (0.30, sgn * 0.14, 0.50), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)


def _oyster(dried=False):
    """굴 — 갯벌 바위에 붙는다. 거친 회백 껍데기 둘, 한 짝을 열어 살을 보인다.
    `dried=True` 는 **같은 굴**을 말린 것 — 껍데기를 버리고 살만 졸아 무더기가 된다."""
    random.seed(769)
    if not dried:
        ico(0.60, (0, 0, 0.16), subdiv=2, mat=M['shell'], scale=(1.05, 0.86, 0.30), jitter=0.16, smooth=False)
        ico(0.52, (0.04, 0.02, 0.30), subdiv=2, mat=M['nacre'], scale=(0.95, 0.78, 0.10), jitter=0.10, smooth=True)
        ico(0.36, (0.02, 0.0, 0.34), subdiv=2, mat=M['flesh'], scale=(1.0, 0.80, 0.42), jitter=0.14, smooth=True)
        ico(0.50, (-0.62, 0.34, 0.14), subdiv=2, mat=M['shell'], scale=(1.0, 0.80, 0.26),
            jitter=0.20, smooth=False)                                                        # 옆에 둔 짝 껍데기
        ico(0.30, (0.66, -0.30, 0.10), subdiv=2, mat=M['shell'], scale=(1.0, 0.85, 0.24), jitter=0.22, smooth=False)
    else:
        cyl(0.60, 0.08, (0, 0, 0.04), mat=M['clay'], verts=18)                                # 담아 둔 토기 접시
        for i in range(13):                                                                   # 졸아붙은 살 무더기
            a = i * 2.399
            d = random.uniform(0, 0.36)
            ico(random.uniform(0.11, 0.17), (math.cos(a) * d, math.sin(a) * d, 0.13 + (0.30 - d) * 0.30),
                subdiv=2, mat=M['driedf'], scale=(1.15, 0.85, 0.52), jitter=0.22, smooth=True)


def m_oyster():        _oyster(False)
def m_dried_oyster():  _oyster(True)


def _seaweed(dried=False):
    """해조(미역·다시마) — 긴 잎이 물결처럼 주름지며 늘어진다. 뿌리(홀드패스트)에서 갈라진다.
    `dried=True` 는 **같은 잎**을 말린 것 — 짧고 검게 졸아 짚끈으로 묶인다.
    ⚠1패스는 같은 크기 판을 격자로 깔아 **초록 벽돌**로 읽혔다 — 미역은 **가늘고 긴 리본**이다."""
    random.seed(770)
    mat = M['kelpdry'] if dried else M['kelp']
    k = 0.60 if dried else 1.0
    for i, (a, ln) in enumerate(((-0.62, 2.10), (0.10, 2.45), (0.70, 1.85))):                     # 잎 셋
        ln *= k
        n = 12
        for j in range(n):                                                                         # 한 잎 = **이어진 리본**(마디가 겹쳐 끊기지 않는다)
            t = j / (n - 1.0)
            wave = math.sin(t * 4.6 + i * 2.1)
            w = (0.34 - 0.20 * t) * k                                                              # 밑이 넓고 끝이 좁다
            box(w, 0.028, ln / n * 1.35,
                (math.cos(a) * 0.18 + wave * 0.11 * k,
                 math.sin(a) * 0.18 + wave * 0.07 * k,
                 0.10 + t * ln),
                rot=(math.radians(wave * 9), math.radians(wave * 7), a * 0.35), mat=mat)
    cyl(0.075, 0.26 * k, (0, 0, 0.10), mat=mat, verts=9)                                           # 뿌리(홀드패스트)
    for i in range(4):                                                                              # 뿌리 갈래
        a = i * 1.57
        cyl(0.030, 0.30, (math.cos(a) * 0.14, math.sin(a) * 0.14, 0.06),
            rot=(math.radians(66), 0, a), mat=mat, verts=5)
    if dried:
        for i in range(2):                                                                          # 묶은 짚 끈
            cyl(0.030, 0.52, (0.02, 0.0, 0.46 + i * 0.40), rot=(0, math.radians(90), math.radians(6)),
                mat=M['fiber'], verts=6)


def m_seaweed():        _seaweed(False)
def m_dried_seaweed():  _seaweed(True)


def m_abalone():
    """전복 — 연안 바위. 타원 껍데기에 **호흡공이 한 줄**로 뚫리고, 뒤집으면 안쪽이 진주광이다. 0.4kg."""
    random.seed(771)
    ico(0.62, (0, 0, 0.16), subdiv=2, mat=M['abshell'], scale=(1.10, 0.78, 0.34), jitter=0.07, smooth=True)
    ico(0.50, (0.04, 0.0, 0.24), subdiv=2, mat=M['abshell'], scale=(1.05, 0.74, 0.22), jitter=0.06, smooth=True)
    for i in range(6):                                                                        # 호흡공 한 줄
        cyl(0.045, 0.06, (-0.42 + i * 0.20, -0.26 + i * 0.020, 0.34 - abs(i - 2.5) * 0.012),
            mat=M['scorch'], verts=7)
    ico(0.44, (-0.72, 0.42, 0.12), subdiv=2, mat=M['nacre'], scale=(1.10, 0.78, 0.16),
        jitter=0.06, smooth=True)                                                             # 뒤집어 둔 짝 — 진주광
    ico(0.30, (-0.70, 0.42, 0.18), subdiv=2, mat=M['flesh'], scale=(1.0, 0.80, 0.34), jitter=0.12, smooth=True)


def _gourd_bottle(salty=True):
    """표주박 물병 — **그릇은 하나**다. 서버가 갯벌에서 `water_bottle` 을 `brine` 으로 바꾸고
    가마가 도로 물병으로 되돌린다(`fresh_water` 도 같은 그릇에 담긴다).
    ⇒ `salty=True` 는 짠물(뿌옇고 아가리에 소금이 앉는다) · `False` 는 민물(맑다).
    ★T72 `brine` 과 **같은 문장·같은 순서**라 다시 구워도 바이트가 안 바뀐다."""
    random.seed(729)
    ico(0.50, (0, 0, 0.46), subdiv=2, mat=M['gourd'], scale=(1.0, 1.0, 1.05), jitter=0.04, smooth=True)       # 아랫통
    ico(0.30, (0, 0, 1.02), subdiv=2, mat=M['gourd'], scale=(1.0, 1.0, 0.95), jitter=0.05, smooth=True)       # 윗통(잘록한 표주박)
    #   ⚠1패스는 마개를 씌워 **속이 안 보였다** — 그러면 그냥 박이다. 아가리를 넓히고 마개를 빼서
    #     찰랑이는 물을 드러내고, 흘러내린 자국으로 "담겨 있다"고 말하게 한다.
    cyl(0.235, 0.30, (0, 0, 1.36), mat=M['gourd'], verts=14)                                     # 넓은 아가리
    water = M['brinew'] if salty else M['freshw']
    cyl(0.196, 0.06, (0, 0, 1.492), mat=water, verts=14)                                         # 찰랑이는 물(아가리 전 바로 밑까지 찬다)
    for i in range(6):                                                                            # 짠물만 — 아가리 전에 앉은 소금
        a = i * 1.05
        if salty:
            ico(0.040, (math.cos(a) * 0.242, math.sin(a) * 0.242, 1.495), subdiv=1, mat=M['saltx'],
                scale=(1.3, 1.3, 0.35), jitter=0.30, smooth=False)
    for (a, ln) in ((0.3, 0.40), (1.9, 0.28), (4.4, 0.34)):                                       # 흘러내린 자국
        cyl(0.030, ln, (math.cos(a) * 0.24, math.sin(a) * 0.24, 1.30 - ln / 2), mat=water, verts=6)
    for i in range(3):                                                                            # 목에 감은 끈(들고 다닌다)
        cyl(0.026, 0.34, (0, 0, 1.24 + i * 0.05), rot=(0, math.radians(90), 0), mat=M['cord'], verts=7)


def m_brine():       _gourd_bottle(True)
def m_fresh_water(): _gourd_bottle(False)


def m_dried_fish():  _fish(dried=True)


def m_smoked_meat():
    """훈제육 — `meat_raw` 를 연기에 걸어 겉이 검게 굳은 **덩어리 살점**. 걸었던 끈이 그대로 꿰여 있다.
    ⚠1패스는 덩이가 둥글고 칼집이 갈비뼈처럼 보여 **짐승 몸통**으로 읽혔다 —
      훈제육은 **납작하게 저며 건 살**이다. 두께를 눌러 판으로 만들고 지방 결을 넣는다.
    ⚠원물 `meat_raw` 모델은 **`icon_render.py` 에 있다** — 이 파일로 가져오면 사본이 된다(§0-ⓐ 회부)."""
    random.seed(772)
    for i, (dx, dz, rz) in enumerate(((-0.18, 0.44, 0.10), (0.22, 0.38, -0.14))):                  # 저민 살점 둘
        ico(0.52, (dx, i * 0.16, dz), subdiv=2, mat=M['smoked'],
            scale=(1.00, 0.26, 1.28), jitter=0.09, smooth=True)
        for j in range(3):                                                                          # 지방 결(밝은 줄)
            box(0.60, 0.02, 0.045, (dx + 0.04, i * 0.16 - 0.14, dz - 0.28 + j * 0.28),
                rot=(0, math.radians(6 - j * 5), rz), mat=M['flesh'])
    cyl(0.024, 1.20, (0.0, 0.08, 1.10), rot=(0, math.radians(90), math.radians(-5)), mat=M['fiber'], verts=6)
    for dx in (-0.18, 0.22):                                                                        # 꿴 끈이 살점을 든다
        cyl(0.020, 0.52, (dx, 0.06, 0.90), rot=(math.radians(6), 0, 0), mat=M['fiber'], verts=5)


def m_dried_fruit():
    """말린 과실 — 베리를 볕에 말린 것. **쪼그라들고 색이 짙어진다**(주름이 그 증거다).
    ⚠원물 `berry` 모델도 `icon_render.py` 에 있다(§0-ⓐ 회부)."""
    random.seed(773)
    cyl(0.60, 0.08, (0, 0, 0.04), mat=M['clay'], verts=18)                                    # 널어 담은 토기 접시
    for i in range(15):
        a = i * 2.399
        d = random.uniform(0, 0.38)
        r = random.uniform(0.10, 0.15)
        ico(r, (math.cos(a) * d, math.sin(a) * d, 0.10 + r * 0.7 + (0.30 - d) * 0.26),
            subdiv=2, mat=M['driedb'], scale=(1.0, 1.0, 0.66), jitter=0.30, smooth=True)      # 주름 = 큰 지터
        if i % 4 == 0:
            cyl(0.012, 0.12, (math.cos(a) * d, math.sin(a) * d, 0.24), mat=M['bark2'], verts=4)  # 꼭지


def m_pickled_veg():
    """절임 — 남새(무 대표)를 소금에 절여 토기 항아리에 담갔다. 소금물에 잠긴 무 토막이 보인다.
    ★`vegetable` 은 원물 모델이 아직 없다 — 대표를 **무**로 정했다(§0-ⓐ · 회부)."""
    random.seed(774)
    ico(0.62, (0, 0, 0.52), subdiv=2, mat=M['clay'], scale=(1.0, 1.0, 0.92), jitter=0.05, smooth=True)   # 항아리 배
    cyl(0.40, 0.22, (0, 0, 1.04), mat=M['clay'], verts=16)                                    # 목
    cyl(0.46, 0.07, (0, 0, 1.16), mat=M['clay'], verts=16)                                    # 아가리 전
    cyl(0.375, 0.05, (0, 0, 1.13), mat=M['brinew'], verts=16)                                 # 소금물
    for i, (dx, dy, rz) in enumerate(((-0.14, 0.05, 0.3), (0.13, -0.08, -0.5), (0.02, 0.14, 1.1))):
        cyl(0.115, 0.34, (dx, dy, 1.16), rot=(math.radians(74), 0, rz), mat=M['radish'], verts=10)   # 무 토막
        cyl(0.118, 0.06, (dx, dy - 0.03, 1.21), rot=(math.radians(74), 0, rz), mat=M['radskin'], verts=10)
    for i in range(3):                                                                        # 항아리 목에 감은 끈
        cyl(0.024, 0.44, (0, 0, 0.96 + i * 0.05), rot=(0, math.radians(90), 0), mat=M['cord'], verts=7)


# ★표 — 아이콘 키 = 서버 품목 키. 세계 렌더는 아직 없다(`world` 빈 칸) — 붙일 때 같은 모델을 쓴다.
ITEMS = [
    ('crude_axe', m_crude_axe), ('crude_pick', m_crude_pick), ('crude_blade', m_crude_blade),
    ('axe', m_axe), ('pickaxe', m_pickaxe), ('sword', m_sword), ('carrier', m_carrier),
    ('fish', m_fish), ('fish_cooked', m_fish_cooked), ('salt', m_salt), ('brine', m_brine),
    ('twig', m_twig), ('pebble', m_pebble),
    # ── [T76] 어종 8 ──
    ('salmon', m_salmon), ('cod', m_cod), ('herring', m_herring), ('trout', m_trout),
    ('pollock', m_pollock), ('carp', m_carp), ('shrimp', m_shrimp), ('crab', m_crab),
    # ── [T76] 갯벌 4 (병은 짠물과 **같은 모델**) ──
    ('oyster', m_oyster), ('seaweed', m_seaweed), ('abalone', m_abalone), ('fresh_water', m_fresh_water),
    # ── [T76] 보존식 6 — 셋은 **원물과 같은 모델**(fish·oyster·seaweed), 셋은 원물이 이 파일에 없다 ──
    ('dried_fish', m_dried_fish), ('dried_oyster', m_dried_oyster), ('dried_seaweed', m_dried_seaweed),
    ('smoked_meat', m_smoked_meat), ('dried_fruit', m_dried_fruit), ('pickled_veg', m_pickled_veg),
]
# ★원물 → 보존식 계보(하네스가 실루엣 상관으로 검사한다). `spoil.PRESERVE` 가 정본이고 여기는 **이 파일이 가진 짝**만 적는다.
# ★[T95] 옷 여섯 — 재질마다 다른 물건이다(갖옷과 삼베옷은 같은 그림일 수 없다).
#   키는 `clothes_<mat>` · 순서는 `server/clothes.js` 표 순서(계약).
# ★[T120] 목록도 **정본 표에서 받는다** — 여섯을 여기 또 적으면 그게 세 번째 사본이다
#   (파이썬 dict 는 넣은 순서를 지키므로 `server/clothes.js` 표 순서가 그대로 온다).
CLOTHES = list(rc.CLOTH_MATS)
for _m in CLOTHES:
    ITEMS.append(('clothes_' + _m, globals()['m_clothes_' + _m]))

ITEM_LINEAGE = [('fish', 'dried_fish'), ('oyster', 'dried_oyster'), ('seaweed', 'dried_seaweed')]


# ═══════════════ 렌더 — 프리셋 정본은 render_common ═══════════════
# 여기 남는 것은 **파일 이름과 로그**뿐이다. 카메라·조명·PPU·FLIP 은 공용 모듈이 갖는다.
_bake_transforms = rc.bake_transforms
_zmax = rc.zmax
_squash_z = rc.squash_z
cleanup = rc.cleanup


def render_icon(key):
    """아이콘 패스 — icon_render.py 와 **같은 프리셋**(ISO_DIR · bbox 맞춤 512² · 압축·FLIP 없음)."""
    size = rc.render_icon_pass(OBJS, os.path.join(OUT_I, key + ".png"))
    print(f"[props] icon {key}: {RES_ICON}²  (size={size:.2f}m)")


def render_world(key, margin=3):
    """세계 패스 — building_render.py 와 **같은 프리셋**(45°/30° · PPU 45.255 · ZSQ · FLIP).
    프레임은 화면 bbox 에 맞추고, **로컬 원점(0,0,0)의 픽셀 좌표**를 앵커로 낸다."""
    rec = rc.render_world_pass(OBJS, os.path.join(OUT_W, key + ".png"), margin=margin)
    print(f"[props] world {key}: {rec['w']}×{rec['h']} "
          f"anchor=({rec['ox']:.2f},{rec['oy']:.2f}) ppu={rec['ppu']:.3f}")
    return rec


ONLY = [k for k in os.environ.get('PROPS_ONLY', '').split(',') if k]
apath = os.path.join(OUT_W, "props_anchors.json")
anchors = {}
if os.path.exists(apath):
    try: anchors = json.load(open(apath))
    except Exception: anchors = {}

ITEM_ONLY = [k for k in os.environ.get('ITEMS_ONLY', '').split(',') if k]
for p in (PROPS if not os.environ.get('SKIP_PROPS') else []):
    if ONLY and p['icon'] not in ONLY and p['btype'] not in ONLY:
        continue
    for i, (wkey, kw) in enumerate(p['world']):
        OBJS.clear()
        p['build'](**kw)
        _bake_transforms()
        if i == 0:
            render_icon(p['icon'])          # ★같은 오브젝트로 아이콘을 먼저(압축 전) 굽는다
        zm = _zmax()
        _squash_z()                          # ★게임 화법(1m=32px) — 정점 z 를 직접 누른다
        rec = render_world(wkey)
        rec["icon"] = p['icon']
        rec["btype"] = p['btype']
        rec["body_px"] = p['body_px']
        rec["flame_px"] = p['flame_px']
        rec["zmax_px"] = round(zm * 32.0, 2)
        anchors[wkey] = rec
        cleanup()

# ── [T97] 움집 실내 장식 — **세계 스프라이트만**(아이콘 없음 · 해체 대상이 아니다) ──
for d in (DECOR if not os.environ.get('SKIP_PROPS') else []):
    if ONLY and d['key'] not in ONLY:
        continue
    OBJS.clear()
    d['build']()
    _bake_transforms()
    zm = _zmax()
    _squash_z()
    rec = render_world(d['key'])
    rec["icon"] = None
    rec["btype"] = None
    rec["decor"] = True
    rec["body_px"] = d['body_px']
    rec["flame_px"] = 0
    rec["zmax_px"] = round(zm * 32.0, 2)
    anchors[d['key']] = rec
    cleanup()

# ── [T72] 손도구·손에 드는 것 — 아이콘만 굽는다(세계 렌더는 다음 카드) ──
_n_items = 0
for (key, fn) in (ITEMS if not os.environ.get('SKIP_ITEMS') else []):
    if ITEM_ONLY and key not in ITEM_ONLY:
        continue
    OBJS.clear()
    fn()
    _bake_transforms()
    render_icon(key)
    cleanup()
    _n_items += 1

json.dump(anchors, open(apath, "w"), indent=1, ensure_ascii=False)
print("[props] DONE ->", OUT_W, len(anchors), "world keys ·", OUT_I, "icons(가구", len(PROPS), "+ 손도구", _n_items, ")")
