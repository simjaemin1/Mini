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
# ── [T1067] 어종 열셋 — 민물 아홉(`server/freshfish.js`) · 바다 넷(`server/seafish.js` 해안 표) ──────────
#   ★위 재질은 한 줄도 안 바꿨다(이미 구운 장이 그대로다) — 새 몸빛만 더한다. 표 키는 `g_` 머리 · datablock 이름은 이 파일의 `p_/f_/t_` 네임스페이스(`test-render-common` · 겹침 0).
M['g_bronze'] = striped_mat("f_crucian", (0.24, 0.22, 0.10), (0.34, 0.31, 0.15), 28, 0.36, 0.45)   # 붕어 — 어두운 청동빛 올리브(잉어 황갈보다 검푸르다)
M['g_dusk'] = simple_mat("f_catfish", (0.10, 0.10, 0.09), 0.35)                                       # 메기 — 비늘 없는 검은 잿빛(매끈 · 젖은 살갗)
M['g_brown'] = striped_mat("f_snakehead", (0.36, 0.33, 0.22), (0.44, 0.40, 0.27), 28, 0.34, 0.45)      # 가물치 — 누런 잿갈 바탕(그 위에 검은 얼룩띠)
M['g_yellow'] = striped_mat("f_mandarin", (0.80, 0.62, 0.14), (0.92, 0.76, 0.24), 26, 0.34, 0.45)    # 쏘가리 — 밝은 누런 금빛(검은 무늬와 대비)
M['g_teal'] = simple_mat("f_minnowbar", (0.16, 0.36, 0.40), 0.45)                                        # 피라미 — 청록 가로띠(혼인색)
M['g_pink'] = simple_mat("f_minnowfin", (0.70, 0.36, 0.38), 0.45)                                        # 피라미 — 분홍 지느러미
M['g_ayu'] = simple_mat("f_ayuspot", (0.76, 0.62, 0.18), 0.45)                                          # 은어 — 아가미 뒤 노란 점
M['g_eel'] = striped_mat("f_eel", (0.17, 0.19, 0.11), (0.24, 0.26, 0.15), 18, 0.24, 0.40)          # 뱀장어 등 — 짙은 올리브(매끈)
M['g_eelb'] = simple_mat("f_eelbelly", (0.74, 0.68, 0.44), 0.45)                                        # 뱀장어 배 — 누런 흰빛
M['g_loach'] = striped_mat("f_loach", (0.50, 0.42, 0.22), (0.58, 0.49, 0.27), 30, 0.30, 0.45)      # 미꾸라지 — 누런 갈색(그 위에 잔 얼룩)
M['g_ayub'] = striped_mat("f_ayubody", (0.72, 0.62, 0.22), (0.82, 0.72, 0.30), 34, 0.28, 0.42)        # 은어 — 누르스름한 은빛(수박 향 나는 노란 몸빛)
M['g_ayuk'] = striped_mat("f_ayuback", (0.20, 0.24, 0.10), (0.28, 0.32, 0.15), 30, 0.32, 0.40)        # 은어 등 — 짙은 올리브 녹색
M['g_white'] = striped_mat("f_barbelw", (0.74, 0.75, 0.74), (0.86, 0.86, 0.84), 36, 0.28, 0.42)      # 누치 — 흰 은빛(등은 잿갈)
M['g_grey'] = striped_mat("f_barbelg", (0.26, 0.25, 0.22), (0.34, 0.32, 0.28), 30, 0.32, 0.42)        # 누치 등 — 잿갈
M['g_basket'] = striped_mat("p_basket", (0.60, 0.48, 0.26), (0.46, 0.35, 0.17), 18, 0.85, 0.45)    # 대 · 싸리 바구니
# ── [T1067] 사냥 산출 · 손도구 · 장비 갈래 · 광물 둘 ───────────────────────────────────
M['g_venison'] = bumped_mat("p_venison", (0.46, 0.10, 0.09), (0.30, 0.05, 0.05), 10, 0.25, 0.55)   # 사슴고기 — 검붉은 살(돼지 · 소 고기보다 어둡다)
M['g_fat'] = bumped_mat("p_fatcap", (0.80, 0.72, 0.52), (0.68, 0.60, 0.42), 12, 0.20, 0.50)          # 굳은 기름 · 비계(누르스름)
M['g_furblk'] = striped_mat("p_furblk", (0.07, 0.06, 0.05), (0.15, 0.13, 0.11), 40, 0.95, 0.90)   # 곰 털(검다)
M['g_furbrn'] = striped_mat("p_furbrn", (0.38, 0.27, 0.16), (0.56, 0.42, 0.26), 40, 0.95, 0.90)   # 들짐승 털(누런 갈색)
M['g_plucked'] = bumped_mat("p_plucked", (0.86, 0.70, 0.58), (0.74, 0.56, 0.44), 14, 0.30, 0.55)  # 털 뽑은 닭 살갗
M['g_bone'] = bumped_mat("p_bonewh", (0.86, 0.82, 0.70), (0.70, 0.65, 0.52), 9, 0.30, 0.70)         # 뼈(누렇게 바랜 흰빛)
M['g_leather'] = bumped_mat("p_tanned", (0.36, 0.21, 0.10), (0.27, 0.15, 0.07), 5, 0.12, 0.55)    # 무두질한 가죽(짙은 갈색 · 매끈)
M['g_lthin'] = simple_mat("p_tanlite", (0.56, 0.40, 0.24), 0.60)                                       # 가죽 속살 · 덧댄 테(밝은 갈색)
M['g_antler'] = bumped_mat("p_antler", (0.62, 0.50, 0.34), (0.42, 0.32, 0.20), 13, 0.55, 0.75)    # 녹각(누런 갈색 · 끝은 희다)
M['g_tip'] = simple_mat("p_tipwh", (0.90, 0.86, 0.76), 0.55)                                         # 뿔 끝 · 알껍데기
M['g_rust'] = striped_mat("p_pheasant", (0.52, 0.24, 0.10), (0.20, 0.12, 0.07), 22, 0.60, 0.60)       # 꿩 꼬리깃(적갈에 검은 띠)
M['g_straw'] = striped_mat("p_nest", (0.66, 0.56, 0.30), (0.50, 0.40, 0.20), 30, 0.85, 0.40)     # 마른 풀 둥지
M['g_boiled'] = bumped_mat("p_boiled", (0.40, 0.29, 0.22), (0.30, 0.21, 0.16), 10, 0.25, 0.55)    # 삶은 고기(잿빛 갈색 — 굽지 않아 그을음이 없다)
M['g_obsid'] = bumped_mat("p_obsid", (0.02, 0.02, 0.025), (0.05, 0.05, 0.06), 6, 0.04, 0.48)     # 흑요석(검은 유리 — 월드 반사로 잿빛이 안 되게 거칠기를 조금 둔다)
M['g_sulfur'] = bumped_mat("p_sulfur", (0.86, 0.74, 0.14), (0.66, 0.54, 0.08), 12, 0.45, 0.70)    # 유황(샛노란 결정)
M['g_sard'] = striped_mat("f_sardine", (0.16, 0.30, 0.38), (0.24, 0.38, 0.46), 34, 0.28, 0.40)        # 정어리 등 — 청록 푸른빛
M['g_octo'] = bumped_mat("t_octopus", (0.58, 0.27, 0.20), (0.40, 0.17, 0.13), 9, 0.40, 0.55)          # 문어 — 적갈 살갗(오돌토돌)
M['g_sucker'] = simple_mat("t_sucker", (0.84, 0.72, 0.64), 0.50)                                    # 문어 빨판 — 살빛
M['g_squid'] = bumped_mat("t_squid", (0.78, 0.66, 0.56), (0.52, 0.34, 0.26), 14, 0.22, 0.42)       # 오징어 — 살빛에 갈색 색소점
# ── [T1088] 그림 없는 품목 이어서 — 같은 팔레트 문법 · datablock 이름은 `p_h_*`(이 파일 네임스페이스) ──
#   있는 재질로 되는 것은 **있는 것을 쓴다**(굴 껍데기 · 미역 · 소쿠리 · 청동 · 모시옷 빛) — 같은 물건은 같은 재질이다.
M['h_grain'] = bumped_mat("p_h_grain", (0.80, 0.66, 0.40), (0.60, 0.46, 0.24), 70, 0.35, 0.70)     # 곡식 더미 — 잡곡 낟알 결
M['h_kern1'] = simple_mat("p_h_kern1", (0.84, 0.70, 0.40), 0.6)                                   # 낟알 — 누런
M['h_kern2'] = simple_mat("p_h_kern2", (0.58, 0.40, 0.20), 0.6)                                   # 낟알 — 갈색
M['h_kern3'] = simple_mat("p_h_kern3", (0.90, 0.85, 0.66), 0.6)                                   # 낟알 — 흰
M['h_cooked'] = bumped_mat("p_h_cooked", (0.93, 0.90, 0.80), (0.80, 0.73, 0.56), 60, 0.25, 0.45)  # 익힌 곡식 — 불어 뽀얀 낟알
M['h_bowl'] = bumped_mat("p_h_bowl", (0.60, 0.40, 0.27), (0.46, 0.29, 0.18), 8, 0.30, 0.70)       # 바리(무문토기) — 붉은 갈색
M['h_redware'] = bumped_mat("p_h_redware", (0.56, 0.17, 0.10), (0.44, 0.12, 0.07), 6, 0.20, 0.35) # 붉은 간토기(홍도) — 윤 낸 붉은 그릇
M['h_kelpcooked'] = striped_mat("p_h_kelpcooked", (0.14, 0.34, 0.10), (0.10, 0.26, 0.07), 30, 0.45, 0.25)   # 끓인 미역 — 데치면 새파래진다(날미역 `t_kelp` 의 익은 빛)
M['h_soot'] = bumped_mat("p_h_soot", (0.21, 0.16, 0.12), (0.12, 0.09, 0.07), 5, 0.20, 0.80)       # 끓임 그릇 — 그을린 몸
M['h_broth'] = simple_mat("p_h_broth", (0.62, 0.57, 0.44), 0.65)                                  # 조개탕 국물 — 뽀얀 누런빛
M['h_soup'] = simple_mat("p_h_soup", (0.27, 0.17, 0.07), 0.65)                                    # 미역국 국물 — 맑은 갈색
M['h_porridge'] = bumped_mat("p_h_porridge", (0.84, 0.66, 0.30), (0.70, 0.52, 0.22), 36, 0.25, 0.50)  # 죽(곡식 + 부재료)
M['h_meatbit'] = simple_mat("p_h_meatbit", (0.40, 0.18, 0.10), 0.6)                               # 고깃점(익은)
M['h_green'] = simple_mat("p_h_green", (0.24, 0.46, 0.14), 0.6)                                   # 나물
M['h_bronzemet'] = simple_mat("p_h_bronzemet", tuple(principled(M['bronze']).inputs['Base Color'].default_value)[:3], 0.24, metal=1.0)   # 청동 덩이 — 이 파일 청동 빛(`M['bronze']`) 그대로 · 쇠붙이 윤만 올렸다
M['h_patina'] = bumped_mat("p_h_patina", (0.30, 0.54, 0.44), (0.18, 0.38, 0.30), 14, 0.35, 0.85)  # 청동 푸른 녹
M['h_stalk'] = striped_mat("p_h_stalk", (0.58, 0.56, 0.32), (0.44, 0.42, 0.22), 40, 0.6, 0.30)    # 삼대 — 누런 풀빛 줄기
M['h_hempleaf'] = simple_mat("p_h_hempleaf", (0.22, 0.38, 0.12), 0.6)                             # 삼 잎
M['h_ramief'] = striped_mat("p_h_ramief", rc.CLOTH_MATS['ramie'][0],
                            tuple(v * 0.90 for v in rc.CLOTH_MATS['ramie'][0]), 90, 0.55, 0.25)   # 모시 올 — 모시옷과 같은 빛(정본 `CLOTH_MATS`) · 결만 줬다
M['h_resin'] = simple_mat("p_h_resin", (0.80, 0.47, 0.07), 0.12)                                  # 송진 — 노란 호박빛(윤)
M['h_clayraw'] = bumped_mat("p_h_clayraw", (0.58, 0.42, 0.30), (0.50, 0.35, 0.24), 4, 0.12, 0.38)  # 날진흙 — 젖은 갈흙(찰지고 매끈)
M['h_tiger'] = striped_mat("p_h_tiger", (0.84, 0.40, 0.06), (0.05, 0.04, 0.03), 2.2, 0.85, 0.15, 7.0)  # 호피 — 주황 바탕 굽이진 검은 줄
M['h_hempweave'] = striped_mat("p_h_hempweave", rc.CLOTH_MATS['hemp'][0],
                                tuple(v * 0.82 for v in rc.CLOTH_MATS['hemp'][0]), 70, 0.9, 0.35)   # 삼베 결 — 삼베옷 빛(정본 `CLOTH_MATS`) · 올만 줬다
M['h_tigerw'] = simple_mat("p_h_tigerw", (0.88, 0.84, 0.74), 0.9)                                 # 호피 배 — 흰 털
# ── [T1088 ②] 빌린 그림이 다른 물건으로 보이던 것 — 숲 · 광물 ──
M['h_amber'] = simple_mat("p_h_amber", (0.78, 0.36, 0.04), 0.08)                                  # 호박 — 윤 나는 주황 송진 화석
M['h_ambercrust'] = bumped_mat("p_h_ambercrust", (0.42, 0.26, 0.12), (0.30, 0.18, 0.08), 12, 0.6, 0.9)   # 호박 원석 겉껍질(풍화)
M['h_bamboo'] = striped_mat("p_h_bamboo", (0.46, 0.58, 0.20), (0.38, 0.50, 0.16), 30, 0.45, 0.25)  # 대나무 줄기
M['h_bambnode'] = simple_mat("p_h_bambnode", (0.32, 0.40, 0.13), 0.5)                              # 대 마디
M['h_bambcut'] = simple_mat("p_h_bambcut", (0.86, 0.82, 0.62), 0.7)                                # 벤 면(속 빈 대)
M['h_wax'] = bumped_mat("p_h_wax", (0.88, 0.74, 0.38), (0.80, 0.64, 0.28), 8, 0.25, 0.45)         # 밀랍
M['h_birchbark'] = striped_mat("p_h_birchbark", (0.88, 0.86, 0.80), (0.20, 0.18, 0.16), 12, 0.8, 0.3, 4.0)   # 자작나무 껍질 — 흰 바탕 검은 껍질눈
M['h_sap'] = simple_mat("p_h_sap", (0.50, 0.56, 0.52), 0.25)                                       # 수액 — 맑은 물빛
M['h_petal'] = simple_mat("p_h_petal", (0.94, 0.93, 0.88), 0.7)                                    # 흰 꽃잎
M['h_disc'] = simple_mat("p_h_disc", (0.90, 0.66, 0.08), 0.6)                                      # 노란 꽃술
M['h_stem'] = simple_mat("p_h_stem", (0.30, 0.48, 0.18), 0.6)                                      # 풀 줄기
M['h_leaf'] = simple_mat("p_h_leaf", (0.22, 0.42, 0.14), 0.55)                                     # 잎
M['h_cork'] = bumped_mat("p_h_cork", (0.78, 0.60, 0.38), (0.64, 0.46, 0.27), 25, 0.7, 0.95)        # 코르크 — 숭숭한 갈색 껍질
M['h_raspberry'] = simple_mat("p_h_raspberry", (0.72, 0.07, 0.11), 0.35)                           # 산딸기 알
M['h_ginseng'] = bumped_mat("p_h_ginseng", (0.86, 0.76, 0.54), (0.74, 0.62, 0.40), 20, 0.3, 0.6)   # 인삼 — 누르스름한 흰 뿌리
M['h_wildgin'] = bumped_mat("p_h_wildgin", (0.70, 0.56, 0.36), (0.56, 0.42, 0.24), 22, 0.4, 0.7)   # 산삼 — 묵은 누런 갈색 뿌리
M['h_redberry'] = simple_mat("p_h_redberry", (0.80, 0.08, 0.06), 0.3)                              # 붉은 열매(삼 열매)
M['h_latex'] = simple_mat("p_h_latex", (0.94, 0.93, 0.88), 0.30)                                   # 라텍스 — 흰 유액
M['h_rubber'] = simple_mat("p_h_rubber", (0.11, 0.09, 0.07), 0.35)                                 # 고무 — 검갈색
M['h_walnut'] = bumped_mat("p_h_walnut", (0.62, 0.46, 0.28), (0.44, 0.30, 0.17), 30, 0.9, 0.8)     # 호두 껍데기(골)
M['h_hazel'] = simple_mat("p_h_hazel", (0.46, 0.27, 0.11), 0.40)                                   # 개암
M['h_almond'] = striped_mat("p_h_almond", (0.70, 0.50, 0.30), (0.58, 0.39, 0.21), 40, 0.6, 0.3)   # 아몬드
M['h_dakin'] = striped_mat("p_h_dakin", (0.88, 0.82, 0.66), (0.78, 0.71, 0.54), 50, 0.8, 0.25)    # 닥 속껍질(흰)
M['h_dakout'] = bumped_mat("p_h_dakout", (0.44, 0.32, 0.20), (0.33, 0.23, 0.14), 18, 0.5, 0.9)    # 닥 겉껍질
M['h_truffle'] = bumped_mat("p_h_truffle", (0.17, 0.13, 0.10), (0.07, 0.05, 0.04), 40, 1.0, 0.85)  # 송로 — 오돌토돌 검갈색
M['h_trufflein'] = bumped_mat("p_h_trufflein", (0.42, 0.30, 0.22), (0.82, 0.76, 0.68), 18, 0.2, 0.7, (0.55, 0.62))   # 송로 속 — 대리석 무늬
M['h_coal'] = bumped_mat("p_h_coal", (0.055, 0.052, 0.05), (0.025, 0.024, 0.023), 10, 0.5, 0.30)   # 석탄 — 윤 나는 검정
M['h_kaolin'] = bumped_mat("p_h_kaolin", (0.91, 0.90, 0.86), (0.83, 0.82, 0.77), 4, 0.12, 0.50)   # 고령토 — 흰 찰흙
M['h_mercury'] = simple_mat("p_h_mercury", (0.82, 0.83, 0.86), 0.05, metal=1.0)                    # 수은 — 거울 같은 은빛 물
M['h_nitrate'] = simple_mat("p_h_nitrate", (0.93, 0.93, 0.91), 0.25)                               # 초석 — 흰 바늘 결정
M['h_sand'] = bumped_mat("p_h_sand", (0.82, 0.72, 0.50), (0.68, 0.58, 0.38), 90, 0.4, 0.95)       # 모래
M['h_sodaash'] = bumped_mat("p_h_sodaash", (0.88, 0.88, 0.86), (0.74, 0.74, 0.72), 60, 0.3, 0.95)  # 소다재 — 흰 잿가루
M['h_burlap'] = striped_mat("p_h_burlap", (0.58, 0.48, 0.32), (0.47, 0.37, 0.23), 60, 0.9, 0.35)  # 삼베 자루
# ── [T1088 ②] 향신료 갈래(약초 풀 그림) · 농산물 갈래(곡물 밭 그림) ──
M['h_pepper'] = bumped_mat("p_h_pepper", (0.13, 0.10, 0.08), (0.06, 0.05, 0.04), 30, 0.8, 0.6)    # 후추 알 — 쭈글한 검은 알
M['h_cumin'] = striped_mat("p_h_cumin", (0.58, 0.48, 0.30), (0.42, 0.33, 0.18), 50, 0.7, 0.3)    # 큐민 씨 — 줄진 회갈색
M['h_cardamom'] = striped_mat("p_h_cardamom", (0.58, 0.66, 0.36), (0.48, 0.56, 0.28), 24, 0.6, 0.3)   # 카다멈 꼬투리 — 옅은 풀빛
M['h_clove'] = bumped_mat("p_h_clove", (0.34, 0.16, 0.08), (0.24, 0.10, 0.05), 20, 0.5, 0.6)      # 정향 — 붉은 흑갈색
M['h_nutmeg'] = bumped_mat("p_h_nutmeg", (0.48, 0.32, 0.18), (0.36, 0.22, 0.12), 14, 0.5, 0.7)    # 육두구 씨
M['h_mace'] = simple_mat("p_h_mace", (0.80, 0.10, 0.06), 0.4)                                      # 육두구 씨옷(새빨간 그물)
M['h_nutfruit'] = simple_mat("p_h_nutfruit", (0.88, 0.78, 0.44), 0.5)                              # 육두구 열매 살(노란)
M['h_anise'] = bumped_mat("p_h_anise", (0.46, 0.22, 0.10), (0.34, 0.15, 0.06), 20, 0.6, 0.6)      # 팔각 — 붉은 갈색 꼬투리
M['h_cinnamon'] = striped_mat("p_h_cinnamon", (0.58, 0.32, 0.15), (0.46, 0.23, 0.10), 30, 0.7, 0.3)   # 계피 — 말린 붉은 갈색 껍질
M['h_vanilla'] = striped_mat("p_h_vanilla", (0.16, 0.10, 0.06), (0.10, 0.06, 0.04), 40, 0.4, 0.3)     # 바닐라 꼬투리 — 윤 나는 흑갈색
M['h_saffron'] = simple_mat("p_h_saffron", (0.80, 0.14, 0.04), 0.5)                                # 사프란 암술 — 붉은 실
M['h_crocus'] = simple_mat("p_h_crocus", (0.52, 0.34, 0.72), 0.5)                                  # 사프란 꽃잎 — 연보라
M['h_paprika'] = simple_mat("p_h_paprika", (0.76, 0.08, 0.04), 0.18)                               # 파프리카 — 윤 나는 빨강
M['h_redpowder'] = bumped_mat("p_h_redpowder", (0.70, 0.16, 0.06), (0.56, 0.10, 0.04), 80, 0.3, 0.95)   # 붉은 가루
M['h_turmskin'] = bumped_mat("p_h_turmskin", (0.56, 0.38, 0.20), (0.44, 0.28, 0.14), 20, 0.5, 0.8)    # 강황 겉
M['h_turmeric'] = simple_mat("p_h_turmeric", (0.92, 0.52, 0.04), 0.6)                              # 강황 속 · 가루 — 샛노란 주황
M['h_frank'] = simple_mat("p_h_frank", (0.88, 0.80, 0.54), 0.45)                                   # 유향 — 우윳빛 노란 진
M['h_myrrh'] = simple_mat("p_h_myrrh", (0.46, 0.15, 0.05), 0.20)                                   # 몰약 — 붉은 갈색 진
M['h_apple'] = simple_mat("p_h_apple", (0.66, 0.06, 0.05), 0.35)                                   # 사과 — 붉은 껍질
M['h_appley'] = simple_mat("p_h_appley", (0.78, 0.62, 0.16), 0.40)                                 # 사과 — 노란 볼
M['h_appleflesh'] = simple_mat("p_h_appleflesh", (0.94, 0.90, 0.72), 0.6)                          # 사과 속살
M['h_banana'] = simple_mat("p_h_banana", (0.92, 0.76, 0.16), 0.5)                                  # 바나나 — 노랑
M['h_cassava'] = bumped_mat("p_h_cassava", (0.44, 0.28, 0.14), (0.32, 0.19, 0.09), 16, 0.6, 0.9)   # 카사바 겉(갈색 껍질)
M['h_whiteflesh'] = simple_mat("p_h_whiteflesh", (0.95, 0.93, 0.86), 0.6)                          # 흰 속살(카사바 · 코코넛)
M['h_chickpea'] = bumped_mat("p_h_chickpea", (0.86, 0.72, 0.46), (0.74, 0.60, 0.36), 18, 0.5, 0.7)   # 병아리콩
M['h_pod'] = simple_mat("p_h_pod", (0.46, 0.60, 0.24), 0.55)                                       # 푸른 꼬투리
M['h_chiligreen'] = simple_mat("p_h_chiligreen", (0.16, 0.42, 0.08), 0.25)                         # 풋고추
M['h_cocoapod'] = striped_mat("p_h_cocoapod", (0.84, 0.54, 0.10), (0.66, 0.36, 0.06), 10, 0.5, 0.4)   # 카카오 꼬투리 — 골진 주황
M['h_cocoabean'] = simple_mat("p_h_cocoabean", (0.36, 0.18, 0.10), 0.5)                            # 카카오 콩
M['h_husk'] = striped_mat("p_h_husk", (0.46, 0.32, 0.18), (0.30, 0.20, 0.10), 60, 0.9, 0.4)       # 코코넛 겉 — 섬유 결
M['h_coffee'] = simple_mat("p_h_coffee", (0.30, 0.16, 0.08), 0.35)                                 # 볶은 커피콩
M['h_corn'] = bumped_mat("p_h_corn", (0.94, 0.72, 0.12), (0.82, 0.58, 0.06), 46, 0.6, 0.5)        # 옥수수 낟알
M['h_cornhusk'] = striped_mat("p_h_cornhusk", (0.78, 0.74, 0.48), (0.62, 0.62, 0.34), 40, 0.8, 0.3)   # 옥수수 껍질
M['h_cotton'] = simple_mat("p_h_cotton", (0.96, 0.95, 0.92), 0.95)                                 # 목화솜
M['h_bract'] = simple_mat("p_h_bract", (0.38, 0.24, 0.12), 0.8)                                    # 마른 꽃받침
M['h_date'] = simple_mat("p_h_date", (0.40, 0.17, 0.06), 0.22)                                     # 대추야자 — 윤 나는 적갈
M['h_fig'] = simple_mat("p_h_fig", (0.30, 0.16, 0.26), 0.45)                                       # 무화과 — 검보라
M['h_figin'] = bumped_mat("p_h_figin", (0.82, 0.34, 0.36), (0.94, 0.80, 0.62), 30, 0.2, 0.6, (0.40, 0.70))   # 무화과 속 — 붉은 씨 결
M['h_flax'] = striped_mat("p_h_flax", (0.72, 0.68, 0.42), (0.60, 0.56, 0.32), 40, 0.7, 0.3)       # 아마 줄기 — 옅은 볏짚빛
M['h_flaxflower'] = simple_mat("p_h_flaxflower", (0.36, 0.48, 0.86), 0.5)                          # 아마 꽃 — 하늘빛
M['h_lentil'] = simple_mat("p_h_lentil", (0.80, 0.40, 0.16), 0.5)                                  # 렌즈콩 — 주황
M['h_mango'] = simple_mat("p_h_mango", (0.90, 0.60, 0.10), 0.35)                                   # 망고 — 익은 노란 주황 껍질
M['h_mangored'] = simple_mat("p_h_mangored", (0.86, 0.38, 0.12), 0.35)                             # 망고 — 붉은 볼
M['h_mangoflesh'] = simple_mat("p_h_mangoflesh", (0.96, 0.62, 0.08), 0.45)                         # 망고 속 — 진주황
M['h_mulleaf'] = simple_mat("p_h_mulleaf", (0.20, 0.44, 0.12), 0.30)                               # 뽕잎 — 윤 나는 진초록
M['h_olive'] = simple_mat("p_h_olive", (0.22, 0.14, 0.20), 0.25)                                   # 올리브 — 검보라
M['h_olivegreen'] = simple_mat("p_h_olivegreen", (0.46, 0.52, 0.16), 0.30)                         # 푸른 올리브
M['h_oliveleaf'] = simple_mat("p_h_oliveleaf", (0.42, 0.50, 0.38), 0.55)                           # 올리브 잎 — 은빛 회록
M['h_onion'] = striped_mat("p_h_onion", (0.70, 0.44, 0.16), (0.56, 0.32, 0.10), 30, 0.5, 0.25)    # 양파 겉껍질 — 금갈색 결
M['h_onionin'] = simple_mat("p_h_onionin", (0.94, 0.92, 0.84), 0.5)                                # 양파 속 — 흰
M['h_peanut'] = bumped_mat("p_h_peanut", (0.90, 0.78, 0.56), (0.80, 0.66, 0.44), 30, 0.6, 0.8)    # 땅콩 껍데기 — 그물 결
M['h_peanutk'] = simple_mat("p_h_peanutk", (0.62, 0.24, 0.16), 0.5)                                # 땅콩 알 — 붉은 속껍질
M['h_pineapple'] = bumped_mat("p_h_pineapple", (0.80, 0.58, 0.16), (0.52, 0.34, 0.10), 9, 0.9, 0.6, (0.50, 0.56))   # 파인애플 — 마름모 눈
M['h_pineleaf'] = simple_mat("p_h_pineleaf", (0.28, 0.48, 0.24), 0.5)                              # 파인애플 잎
M['h_potato'] = bumped_mat("p_h_potato", (0.70, 0.54, 0.34), (0.58, 0.42, 0.24), 14, 0.4, 0.8)    # 감자 — 누런 갈색
M['h_potatoin'] = simple_mat("p_h_potatoin", (0.94, 0.88, 0.62), 0.55)                             # 감자 속 — 연노랑
M['h_pumpkin'] = striped_mat("p_h_pumpkin", (0.86, 0.46, 0.08), (0.74, 0.36, 0.05), 6, 0.5, 0.3)  # 늙은호박 — 주황 골
M['h_beet'] = simple_mat("p_h_beet", (0.90, 0.86, 0.74), 0.55)                                     # 사탕무 — 흰 뿌리
M['h_cane'] = striped_mat("p_h_cane", (0.48, 0.26, 0.32), (0.38, 0.18, 0.24), 30, 0.4, 0.25)      # 사탕수수 — 자줏빛 줄기
M['h_canenode'] = simple_mat("p_h_canenode", (0.78, 0.70, 0.42), 0.5)                              # 사탕수수 마디(누런 테)
M['h_sweetpot'] = simple_mat("p_h_sweetpot", (0.52, 0.16, 0.22), 0.45)                             # 고구마 — 자홍 껍질
M['h_sweetin'] = simple_mat("p_h_sweetin", (0.96, 0.74, 0.30), 0.5)                                # 고구마 속 — 노란 주황
M['h_tobacco'] = striped_mat("p_h_tobacco", (0.62, 0.42, 0.16), (0.48, 0.30, 0.10), 18, 0.8, 0.3)   # 말린 담뱃잎 — 금갈색
M['h_tomato'] = simple_mat("p_h_tomato", (0.82, 0.10, 0.06), 0.25)                                 # 토마토
M['h_tomatoin'] = bumped_mat("p_h_tomatoin", (0.90, 0.28, 0.18), (0.96, 0.78, 0.30), 26, 0.2, 0.5, (0.55, 0.62))   # 토마토 속(씨)
# ── [T1088] 보석 · 주화 · 위세품 ──
M['h_diamond'] = simple_mat("p_h_diamond", (0.86, 0.91, 0.96), 0.03)                               # 다이아몬드 — 맑은 흰빛
M['h_ruby'] = simple_mat("p_h_ruby", (0.66, 0.03, 0.08), 0.05)                                     # 루비
M['h_sapphire'] = simple_mat("p_h_sapphire", (0.05, 0.16, 0.62), 0.05)                             # 사파이어
M['h_emerald'] = simple_mat("p_h_emerald", (0.04, 0.48, 0.22), 0.05)                               # 에메랄드
M['h_amethyst'] = simple_mat("p_h_amethyst", (0.42, 0.16, 0.60), 0.08)                             # 자수정
M['h_topaz'] = simple_mat("p_h_topaz", (0.92, 0.64, 0.14), 0.05)                                   # 토파즈 — 금빛
M['h_turq'] = bumped_mat("p_h_turq", (0.28, 0.70, 0.66), (0.16, 0.20, 0.18), 7, 0.2, 0.35, (0.60, 0.66))   # 터키석 — 하늘빛에 검은 그물
M['h_jade'] = simple_mat("p_h_jade", (0.16, 0.44, 0.26), 0.12)                                     # 옥(갈아 윤 낸 것)
M['h_goldmet'] = simple_mat("p_h_goldmet", (0.88, 0.64, 0.18), 0.22, metal=1.0)                    # 금화
M['h_silvmet'] = simple_mat("p_h_silvmet", (0.78, 0.78, 0.80), 0.22, metal=1.0)                    # 은화
M['h_ironmet'] = simple_mat("p_h_ironmet", (0.36, 0.36, 0.38), 0.35, metal=1.0)                    # 쇠(위세 칼)
M['h_paper'] = striped_mat("p_h_paper", (0.90, 0.86, 0.74), (0.84, 0.79, 0.66), 70, 0.9, 0.15)    # 종이 · 두루마리
M['h_redcord'] = simple_mat("p_h_redcord", (0.66, 0.10, 0.08), 0.6)                                # 붉은 끈
M['h_ink'] = simple_mat("p_h_ink", (0.06, 0.06, 0.07), 0.4)                                        # 먹빛
# ── [T1088] 공예품 · 가축 산물 · 바다 · 그 밖 ──
M['h_foam'] = bumped_mat("p_h_foam", (0.96, 0.94, 0.88), (0.86, 0.84, 0.78), 30, 0.3, 0.8)        # 맥주 거품
M['h_beer'] = simple_mat("p_h_beer", (0.62, 0.36, 0.06), 0.3)                                      # 맥주 — 호박빛
M['h_wine'] = simple_mat("p_h_wine", (0.30, 0.02, 0.06), 0.15)                                     # 포도주 — 검붉은
M['h_soy'] = simple_mat("p_h_soy", (0.07, 0.04, 0.02), 0.08)                                       # 간장 — 윤 나는 검정
M['h_onggi'] = bumped_mat("p_h_onggi", (0.30, 0.18, 0.10), (0.22, 0.12, 0.07), 6, 0.15, 0.25)     # 옹기 — 윤 낸 검붉은 갈색
M['h_kimchi'] = bumped_mat("p_h_kimchi", (0.92, 0.70, 0.52), (0.80, 0.20, 0.09), 14, 0.3, 0.5, (0.58, 0.66))   # 김치 — 고춧물 든 배춧잎
M['h_cabbage'] = simple_mat("p_h_cabbage", (0.86, 0.88, 0.62), 0.5)                                # 배추 줄기 — 연한 흰 초록
M['h_crust'] = bumped_mat("p_h_crust", (0.62, 0.36, 0.14), (0.48, 0.26, 0.08), 10, 0.4, 0.7)      # 빵 껍질
M['h_crumb'] = bumped_mat("p_h_crumb", (0.94, 0.86, 0.66), (0.84, 0.74, 0.52), 40, 0.4, 0.9)      # 빵 속
M['h_bowwood'] = striped_mat("p_h_bowwood", (0.20, 0.12, 0.07), (0.30, 0.18, 0.10), 20, 0.35, 0.3)  # 각궁 몸(뿔 · 나무 · 옻)
M['h_brushhair'] = simple_mat("p_h_brushhair", (0.10, 0.08, 0.07), 0.7)                            # 붓털(먹 머금은)
M['h_inkstone'] = bumped_mat("p_h_inkstone", (0.20, 0.20, 0.22), (0.12, 0.12, 0.13), 8, 0.3, 0.5) # 벼루
M['h_mudbrick'] = bumped_mat("p_h_mudbrick", (0.66, 0.46, 0.28), (0.54, 0.36, 0.20), 16, 0.6, 0.95)   # 진흙 벽돌(햇볕에 말린)
M['h_cutstone'] = bumped_mat("p_h_cutstone", (0.62, 0.61, 0.58), (0.50, 0.49, 0.46), 12, 0.4, 0.9)   # 다듬은 돌
M['h_indigo'] = simple_mat("p_h_indigo", (0.06, 0.10, 0.34), 0.45)                                 # 쪽빛(인디고)
M['h_indigocake'] = bumped_mat("p_h_indigocake", (0.10, 0.14, 0.42), (0.05, 0.07, 0.24), 12, 0.4, 0.7)   # 인디고 덩이
M['h_purple'] = simple_mat("p_h_purple", (0.36, 0.06, 0.32), 0.35)                                 # 자색 염료
M['h_purpleyarn'] = striped_mat("p_h_purpleyarn", (0.48, 0.10, 0.42), (0.36, 0.06, 0.30), 60, 0.6, 0.3)   # 자색 실
M['h_glass'] = simple_mat("p_h_glass", (0.16, 0.50, 0.58), 0.02)                                   # 유리 — 푸른 물빛
M['h_perfume'] = simple_mat("p_h_perfume", (0.78, 0.42, 0.62), 0.03)                               # 향수병 — 분홍 유리
M['h_celadon'] = simple_mat("p_h_celadon", (0.56, 0.70, 0.62), 0.12)                               # 도자기 유약 — 비색
M['h_silk'] = striped_mat("p_h_silk", (0.66, 0.08, 0.12), (0.54, 0.05, 0.09), 50, 0.22, 0.15)     # 비단 — 윤 나는 진홍
M['h_tallow'] = bumped_mat("p_h_tallow", (0.93, 0.89, 0.74), (0.86, 0.80, 0.62), 6, 0.15, 0.55)   # 소기름 — 굳은 흰 기름
M['h_cheese'] = bumped_mat("p_h_cheese", (0.96, 0.80, 0.34), (0.90, 0.72, 0.26), 10, 0.2, 0.6)    # 치즈 속
M['h_rind'] = simple_mat("p_h_rind", (0.78, 0.52, 0.16), 0.5)                                      # 치즈 껍질
M['h_duck'] = bumped_mat("p_h_duck", (0.40, 0.08, 0.08), (0.30, 0.05, 0.05), 20, 0.3, 0.5)        # 오리 살 — 검붉은
M['h_duckskin'] = simple_mat("p_h_duckskin", (0.90, 0.80, 0.62), 0.45)                             # 오리 껍질 · 기름
M['h_milk'] = simple_mat("p_h_milk", (0.97, 0.96, 0.93), 0.4)                                      # 젖
M['h_ivory'] = striped_mat("p_h_ivory", (0.92, 0.88, 0.76), (0.84, 0.79, 0.64), 14, 0.3, 0.2)     # 상아 — 결 진 미색
M['h_linen'] = striped_mat("p_h_linen", (0.80, 0.76, 0.64), (0.70, 0.66, 0.54), 80, 0.9, 0.3)     # 리넨 — 거친 회베이지 올
M['h_beef'] = bumped_mat("p_h_beef", (0.90, 0.84, 0.76), (0.52, 0.05, 0.06), 22, 0.2, 0.5, (0.64, 0.70))   # 쇠고기 — 마블링
M['h_mutton'] = simple_mat("p_h_mutton", (0.70, 0.22, 0.22), 0.45)                                 # 양고기 살
M['h_porkfat'] = simple_mat("p_h_porkfat", (0.96, 0.90, 0.84), 0.5)                                # 비계
M['h_porklean'] = simple_mat("p_h_porklean", (0.86, 0.46, 0.46), 0.45)                             # 돼지 살(분홍)
M['h_porkskin'] = simple_mat("p_h_porkskin", (0.84, 0.66, 0.52), 0.5)                              # 돼지 껍질
M['h_cocoon'] = bumped_mat("p_h_cocoon", (0.96, 0.95, 0.90), (0.88, 0.86, 0.80), 40, 0.3, 0.8)    # 고치
M['h_silkthread'] = striped_mat("p_h_silkthread", (0.92, 0.84, 0.56), (0.84, 0.74, 0.44), 90, 0.25, 0.2)   # 생사 — 윤 나는 금빛 흰 실
M['h_silkworm'] = bumped_mat("p_h_silkworm", (0.92, 0.91, 0.86), (0.80, 0.78, 0.72), 30, 0.2, 0.5)   # 누에
M['h_wool'] = bumped_mat("p_h_wool", (0.95, 0.92, 0.82), (0.88, 0.84, 0.72), 50, 0.3, 0.98)       # 양털
M['h_lobster'] = bumped_mat("p_h_lobster", (0.14, 0.22, 0.28), (0.08, 0.14, 0.18), 20, 0.4, 0.4) # 바닷가재 — 검푸른 껍데기
M['h_lobsterj'] = simple_mat("p_h_lobsterj", (0.86, 0.36, 0.12), 0.4)                              # 바닷가재 마디 · 집게 끝(주황)
M['h_murex'] = bumped_mat("p_h_murex", (0.84, 0.76, 0.62), (0.62, 0.52, 0.40), 18, 0.5, 0.6)      # 자색고둥 껍데기
# ── [T1099] 셋째 묶음 — 막대 낚싯대 · 같은 꼴로 빌리던 스물여덟(곡물 둘 · 통나무 일곱 · 잎 향초 일곱 · 광석 일곱 · 돌 다섯) ──
M['j_oat'] = simple_mat("p_j_oat", (0.86, 0.80, 0.54), 0.7)                                       # 귀리 이삭 — 연한 볏짚빛
M['j_rye'] = simple_mat("p_j_rye", (0.66, 0.64, 0.50), 0.6)                                       # 호밀 이삭 — 회록빛 도는 볏짚
M['j_pinebark'] = bumped_mat("p_j_pinebark", (0.78, 0.42, 0.15), (0.18, 0.08, 0.03), 6, 1.0, 0.9, (0.20, 0.36))   # 소나무 껍질 — 붉은 거북등 판(금이 검다)
M['j_pinewood'] = striped_mat("p_j_pinewood", (0.90, 0.70, 0.38), (0.80, 0.58, 0.28), 18, 0.7, 0.2)      # 소나무 속 — 노란 나이테
M['j_oakbark'] = bumped_mat("p_j_oakbark", (0.66, 0.65, 0.62), (0.20, 0.19, 0.18), 14, 0.8, 0.95, (0.20, 0.34))   # 참나무 껍질 — 밝은 회색에 깊은 골
M['j_oakwood'] = striped_mat("p_j_oakwood", (0.40, 0.28, 0.16), (0.32, 0.22, 0.12), 22, 0.7, 0.2)      # 참나무 속 — 짙은 갈색
M['j_birchwood'] = striped_mat("p_j_birchwood", (0.93, 0.86, 0.68), (0.84, 0.76, 0.58), 20, 0.7, 0.2)   # 자작 속 — 흰 미색
M['j_cedarbark'] = bumped_mat("p_j_cedarbark", (0.30, 0.06, 0.04), (0.14, 0.03, 0.02), 22, 0.8, 0.9)        # 삼나무 껍질 — 짙은 붉은 섬유
M['j_cedarwood'] = striped_mat("p_j_cedarwood", (0.66, 0.20, 0.13), (0.56, 0.14, 0.10), 18, 0.7, 0.2)      # 삼나무 속 — 붉은빛
M['j_ebonywood'] = simple_mat("p_j_ebonywood", (0.05, 0.045, 0.045), 0.35)                            # 흑단 속 — 새까만
M['j_mahowood'] = striped_mat("p_j_mahowood", (0.40, 0.12, 0.07), (0.30, 0.08, 0.05), 18, 0.5, 0.2)       # 마호가니 속 — 짙은 적갈
M['j_teakwood'] = striped_mat("p_j_teakwood", (0.80, 0.52, 0.16), (0.66, 0.40, 0.10), 18, 0.5, 0.2)    # 티크 속 — 금갈색
M['j_sapwood'] = simple_mat("p_j_sapwood", (0.84, 0.76, 0.58), 0.7)                                    # 변재(흑단 둘레 흰 테)
M['j_basil'] = simple_mat("p_j_basil", (0.18, 0.48, 0.12), 0.30)                                      # 바질 — 윤 나는 진초록
M['j_mint'] = simple_mat("p_j_mint", (0.34, 0.62, 0.28), 0.6)                                         # 박하 — 밝은 풀빛
M['j_mintstem'] = simple_mat("p_j_mintstem", (0.42, 0.24, 0.32), 0.6)                                 # 박하 줄기 — 자줏빛
M['j_corian'] = simple_mat("p_j_corian", (0.44, 0.68, 0.24), 0.6)                                     # 고수 — 연두
M['j_thyme'] = simple_mat("p_j_thyme", (0.38, 0.46, 0.30), 0.8)                                       # 타임 — 회록
M['j_woody'] = simple_mat("p_j_woody", (0.40, 0.30, 0.20), 0.8)                                       # 나무질 줄기
M['j_rosemary'] = simple_mat("p_j_rosemary", (0.16, 0.30, 0.20), 0.6)                                 # 로즈마리 — 짙은 바늘잎
M['j_rosebloom'] = simple_mat("p_j_rosebloom", (0.56, 0.66, 0.90), 0.5)                               # 로즈마리 꽃 — 연하늘
M['j_sage'] = bumped_mat("p_j_sage", (0.56, 0.62, 0.50), (0.48, 0.54, 0.42), 40, 0.4, 0.9)           # 세이지 향초 — 은빛 회록 털잎
M['j_lavender'] = bumped_mat("p_j_lavender", (0.54, 0.42, 0.78), (0.40, 0.30, 0.62), 40, 0.5, 0.7)   # 라벤더 꽃이삭
M['j_bauxite'] = bumped_mat("p_j_bauxite", (0.66, 0.34, 0.20), (0.50, 0.24, 0.14), 10, 0.6, 0.9)      # 보크사이트 — 붉은 갈흙돌
M['j_pisolith'] = simple_mat("p_j_pisolith", (0.76, 0.48, 0.24), 0.7)                                 # 보크사이트 알갱이(콩알)
M['j_chromite'] = bumped_mat("p_j_chromite", (0.12, 0.11, 0.10), (0.20, 0.19, 0.18), 30, 0.5, 0.35)   # 크롬철석 — 윤 도는 검은 알갱이
M['j_cobaltite'] = simple_mat("p_j_cobaltite", (0.62, 0.62, 0.68), 0.30, metal=0.8)                   # 휘코발트석 — 은회색 쇠빛
M['j_erythrite'] = bumped_mat("p_j_erythrite", (0.82, 0.36, 0.58), (0.66, 0.24, 0.44), 30, 0.4, 0.7)   # 코발트 꽃(적색 피막)
M['j_magnesite'] = bumped_mat("p_j_magnesite", (0.95, 0.94, 0.91), (0.86, 0.85, 0.80), 18, 0.5, 0.6)  # 마그네사이트 — 사기 같은 흰 덩이
M['j_pyrolusite'] = bumped_mat("p_j_pyrolusite", (0.08, 0.075, 0.075), (0.16, 0.16, 0.18), 22, 0.6, 0.8)   # 연망간석 — 그을음 같은 검정
M['j_wolfram'] = simple_mat("p_j_wolfram", (0.22, 0.17, 0.13), 0.20)                                  # 철망간중석 — 윤 나는 흑갈 판 결정
M['j_quartz'] = simple_mat("p_j_quartz", (0.90, 0.89, 0.86), 0.3)                                     # 석영 바탕(흰)
M['j_smithson'] = bumped_mat("p_j_smithson", (0.50, 0.74, 0.68), (0.38, 0.62, 0.58), 24, 0.4, 0.4)   # 능아연석 — 푸른 물빛 포도송이 피막
M['j_matrix'] = bumped_mat("p_j_matrix", (0.46, 0.38, 0.30), (0.34, 0.27, 0.21), 12, 0.7, 0.9)        # 갈색 바탕돌
M['j_flint'] = simple_mat("p_j_flint", (0.17, 0.16, 0.16), 0.15)                                      # 부싯돌 속 — 유리 같은 검회색
M['j_cortex'] = bumped_mat("p_j_cortex", (0.88, 0.86, 0.80), (0.76, 0.74, 0.68), 14, 0.5, 0.95)       # 부싯돌 겉(흰 분필 껍질)
M['j_granite'] = bumped_mat("p_j_granite", (0.82, 0.56, 0.52), (0.48, 0.48, 0.50), 60, 0.3, 0.7)      # 화강암 — 분홍 · 회색 알갱이
M['j_limestone'] = bumped_mat("p_j_limestone", (0.87, 0.85, 0.77), (0.78, 0.76, 0.68), 8, 0.3, 0.9)    # 석회암 — 연한 미색
M['j_marble'] = simple_mat("p_j_marble", (0.95, 0.95, 0.93), 0.12)                                     # 대리석 — 윤 낸 흰 판
M['j_vein'] = simple_mat("p_j_vein", (0.42, 0.44, 0.46), 0.3)                                          # 대리석 결(회색 줄)
M['j_phosphate'] = bumped_mat("p_j_phosphate", (0.56, 0.48, 0.38), (0.42, 0.36, 0.28), 26, 0.6, 0.9)   # 인광석 — 숭숭한 회갈 덩이
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


# ═══════════════ [T1067] 어종 열셋 — 민물 아홉 · 바다 넷 ═══════════════
# ★키 = 서버 품목 키 그대로 — 민물 `server/freshfish.js SPECIES`(T593 · 플레이어 낚시가 강 · 호수 · 논물에서 낸다) ·
#   바다 `server/seafish.js` 해안 낚싯대 표(`gear: 'rod'`). 이름 · 무게 · 물 · 철은 그 두 표가 정본이다(여기 안 적는다).
# ★몸틀은 T76 의 `_finfish()` 그대로다(새 몸틀 0) — 지느러미 물고기 열은 인자만 다르다.
#   몸틀로 안 되는 넷(뱀장어 · 멸치 · 문어 · 오징어)만 이 절에서 모양을 짓는다.
# ★크기는 그림이 말하지 않는다(§9 — 96px 를 꽉 채운다). 손가락만 한 멸치는 **한 무더기**로(소금 · 자갈의 문법).
# ★고증: 청동기 후기 한반도 — 붕어 · 메기 · 가물치 · 쏘가리 · 누치 · 피라미 · 은어 · 뱀장어 · 미꾸라지는
#   강 · 못 · 논물의 토박이고, 정어리 · 멸치 · 문어 · 오징어는 연안에서 잡힌다(`설계/고증_바닷물고기.md`).

def _blotch(xs, D, H, rad, mat, zmid=0.30, zamp=0.18, seed=0):
    """큰 얼룩 — 몸 옆(카메라 쪽 −y)에 붙는 납작한 반점. `_finfish` 의 잔 반점(0.055)으로는 96px 에서 무늬가 안 선다."""
    random.seed(seed)
    for i, x in enumerate(xs):
        z = zmid + (zamp if i % 2 else -zamp * 0.6) * H + random.uniform(-0.04, 0.04)
        ico(rad * random.uniform(0.85, 1.15), (x, -0.27 * D, z), subdiv=2, mat=mat,
            scale=(1.25, 0.30, 1.0), jitter=0.18, smooth=True)


def _shift(n0, dx=0.0, dy=0.0, dz=0.0):
    """`n0` 번째 뒤로 지은 오브젝트를 통째로 옮긴다 — 몸틀(`_finfish`)은 자리 인자가 없어서 무리(꿰미)를 지을 때 쓴다."""
    for o in OBJS[n0:]:
        o.location.x += dx; o.location.y += dy; o.location.z += dz


def _spin(n0, rz, px=0.0, py=0.0):
    """`n0` 번째 뒤로 지은 오브젝트를 (px, py) 둘레로 세계 z 축 `rz` 만큼 돌린다 — 무리(정어리 부채)를 지을 때 쓴다.
    ⓘ 부품마다 이미 기운 각(지느러미)이 있어 오일러 z 에 더하면 틀린다 — 회전 행렬을 앞에 곱한다."""
    from mathutils import Matrix
    R = Matrix.Rotation(rz, 3, 'Z')
    c, s_ = math.cos(rz), math.sin(rz)
    for o in OBJS[n0:]:
        x, y = o.location.x - px, o.location.y - py
        o.location.x, o.location.y = px + x * c - y * s_, py + x * s_ + y * c
        o.rotation_euler = (R @ o.rotation_euler.to_matrix()).to_euler('XYZ')


def _fishlet(x, y, z, ang, body, back, s=1.0, tail=None, curl=0.0):
    """잔고기 한 마리 — 멸치 · 미꾸라지 무리(§9 — 작은 것은 개수와 그릇으로 말한다).
    `curl` 은 몸이 휜 정도(미꾸라지는 몸을 꼰다) · `ang` 은 머리 쪽 방향(라디안)."""
    ca, sa = math.cos(ang), math.sin(ang)
    n = 6
    for j in range(n):                                                              # 몸 여섯 마디 — 머리에서 꼬리로 가늘어진다
        t = j / (n - 1)
        bend = curl * (t - 0.35) ** 2 * 2.2
        dx = (0.32 - t * 0.64) * s
        px, py = x + ca * dx - sa * bend * s, y + sa * dx + ca * bend * s
        r = (0.078 - t * 0.034) * s
        o = ico(r, (px, py, z), subdiv=2, mat=body, scale=(1.45, 1.0, 1.0), jitter=0.03, smooth=True)
        o.rotation_euler = (0, 0, ang)
        o = ico(r * 0.82, (px, py, z + r * 0.42), subdiv=2, mat=back, scale=(1.45, 0.78, 0.62), jitter=0.03, smooth=True)
        o.rotation_euler = (0, 0, ang)
    ico(0.026 * s, (x + ca * 0.34 * s + sa * 0.04 * s, y + sa * 0.34 * s - ca * 0.04 * s, z + 0.022 * s), subdiv=1, mat=M['scorch'])   # 눈
    bend = curl * 0.65 ** 2 * 2.2
    tx, ty = x - ca * 0.40 * s - sa * bend * s, y - sa * 0.40 * s + ca * bend * s
    box(0.10 * s, 0.02 * s, 0.12 * s, (tx, ty, z), rot=(0, 0, ang), mat=(tail or M['fin2']))                          # 꼬리


def m_crucian():
    """붕어 — 강 · 못 · 논물 어디나 사철. **몸이 높고 짧으며 수염이 없다**(잉어와 가르는 표지) · 검푸른 청동빛."""
    _finfish(L=0.84, D=0.60, H=1.36, body=M['g_bronze'], back=M['g_bronze'], forked=True, seed=1671)


def m_catfish():
    """메기 — 중 · 하류 여름. **납작하고 넓은 머리 · 긴 입수염 한 쌍과 짧은 한 쌍** · 비늘 없는 검은 잿빛 몸 ·
    등지느러미는 작고 뒷지느러미가 꼬리까지 길다."""
    _finfish(L=1.40, D=0.86, H=0.66, body=M['g_dusk'], back=M['g_dusk'], dorsals=0, forked=False, seed=1672)
    ico(0.34, (1.02, 0.0, 0.26), subdiv=2, mat=M['g_dusk'], scale=(1.05, 1.55, 0.58), jitter=0.03, smooth=True)   # 넓적한 머리
    box(0.30, 0.56, 0.05, (1.26, 0.0, 0.17), mat=M['belly'])                                                     # 큰 입(흰 입술)
    for sgn in (-1, 1):
        cyl(0.024, 1.30, (0.92, sgn * 0.72, 0.24), rot=(0, math.radians(90), math.radians(sgn * -52)),
            mat=M['scorch'], verts=5)                                                                        # 긴 수염(위턱)
        cyl(0.018, 0.40, (1.18, sgn * 0.22, 0.08), rot=(math.radians(sgn * 40), math.radians(60), 0),
            mat=M['scorch'], verts=5)                                                                        # 짧은 수염(아래턱)
    box(0.14, 0.04, 0.12, (0.30, 0.0, 0.56), rot=(0, math.radians(-12), 0), mat=M['g_dusk'])                     # 작은 등지느러미
    box(1.20, 0.035, 0.14, (-0.66, 0.0, 0.06), mat=M['g_dusk'])                                                  # 긴 뒷지느러미


def m_snakehead():
    """가물치 — 호수 여름. **긴 통나무꼴 몸에 등 · 뒷지느러미가 길게 이어지고** 누런 잿갈 바탕에 검은 얼룩띠가 크게 진다 ·
    꼬리는 둥글다."""
    _finfish(L=1.50, D=0.70, H=0.74, body=M['g_brown'], back=M['g_brown'], dorsals=0, forked=False, seed=1673)
    _blotch([0.80, 0.52, 0.24, -0.04, -0.32, -0.60, -0.88, -1.12], 0.70, 0.74, 0.15, M['scorch'], seed=16731)
    box(1.90, 0.045, 0.16, (-0.30, 0.0, 0.62), rot=(0, math.radians(-3), 0), mat=M['scorch'])                    # 긴 등지느러미(검다)
    box(1.20, 0.045, 0.13, (-0.58, 0.0, 0.03), mat=M['scorch'])                                                  # 긴 뒷지느러미
    box(0.30, 0.20, 0.06, (1.18, 0.0, 0.20), rot=(0, math.radians(-14), 0), mat=M['g_brown'])                    # 큰 아래턱


def m_mandarin():
    """쏘가리 — 상 · 중류 바위 틈. **밝은 누런 금빛에 표범 같은 검은 무늬** · 가시 등지느러미 · 큰 입 · 둥근 꼬리."""
    _finfish(L=1.00, D=0.62, H=1.12, body=M['g_yellow'], back=M['g_yellow'], dorsals=2, forked=False, seed=1674)
    _blotch([0.62, 0.40, 0.18, -0.04, -0.26, -0.48, -0.70], 0.62, 1.12, 0.12, M['scorch'], zamp=0.16, seed=16741)
    _blotch([0.50, 0.08, -0.36, -0.62], 0.62, 1.12, 0.09, M['scorch'], zmid=0.12, zamp=0.05, seed=16742)
    _blotch([0.30, -0.14, -0.58], 0.62, 1.12, 0.08, M['scorch'], zmid=0.50, zamp=0.04, seed=16743)
    box(0.30, 0.22, 0.07, (1.02, 0.0, 0.22), rot=(0, math.radians(-18), 0), mat=M['g_yellow'])                  # 내민 아래턱
    for i in range(5):                                                                                           # 등 가시
        cyl(0.016, 0.22, (0.50 - i * 0.12, 0.0, 0.84), rot=(0, math.radians(-14), 0), mat=M['scorch'], verts=5)


def m_barbel():
    """누치 — 중류 모래 바닥. **길쭉한 흰 은빛 몸에 잿갈 등 · 입가 수염 한 쌍** · 주둥이가 길게 아래로 숙었다 · 꼬리가 갈라진다."""
    _finfish(L=1.46, D=0.54, H=0.76, body=M['g_white'], back=M['g_grey'], barbels=2, forked=True, seed=1675)
    ico(0.17, (1.20, 0.0, 0.22), subdiv=2, mat=M['g_white'], scale=(1.55, 0.70, 0.66), jitter=0.05, smooth=True)  # 숙인 긴 주둥이


def _minnow_one(seed):
    _finfish(L=0.62, D=0.40, H=0.70, body=M['f_silver'], back=M['f_back'], forked=True, seed=seed)
    for i in range(4):                                                                                           # 청록 가로띠 — 카메라 쪽(−y)으로 내민다
        box(0.028, 0.03, 0.24, (0.30 - i * 0.17, -0.17, 0.30), rot=(0, math.radians(8), 0), mat=M['g_teal'])
    box(0.34, 0.04, 0.24, (-0.26, 0.0, 0.06), rot=(0, math.radians(18), 0), mat=M['g_pink'])                     # 큰 뒷지느러미(분홍)
    box(0.16, 0.12, 0.04, (0.22, -0.16, 0.16), rot=(math.radians(34), 0, math.radians(-10)), mat=M['g_pink'])     # 가슴지느러미


def m_minnow():
    """피라미 — 상 · 중류 여울. 손가락만 한 은빛 잔고기에 **청록 가로띠와 분홍 지느러미**(혼인색) —
    한 마리로는 안 읽히니(§9) **풀 끈에 아가미를 꿴 꿰미 셋**."""
    cyl(0.022, 2.60, (0.36, 0.0, 1.08), rot=(0, math.radians(-52), 0), mat=M['fiber'], verts=6)                # 아가미로 꿴 풀 끈(셋의 머리를 잇는다)
    for i, (dx, dz) in enumerate(((-0.80, 1.62), (-0.10, 1.08), (0.60, 0.54))):
        n0 = len(OBJS)
        _minnow_one(16760 + i)
        _shift(n0, dx=dx, dz=dz)


def m_sweetfish():
    """은어 — 상 · 중류 여름. 날씬한 **누르스름한 은빛** 몸에 올리브 등 · **아가미 뒤 노란 점과 노란 지느러미 · 기름지느러미**."""
    _finfish(L=1.18, D=0.46, H=0.80, body=M['g_ayub'], back=M['g_ayuk'], forked=True, seed=1677)
    ico(0.14, (0.42, -0.24, 0.36), subdiv=2, mat=M['g_ayu'], scale=(1.4, 0.35, 1.0), jitter=0.05, smooth=True)   # 노란 점
    box(0.14, 0.04, 0.10, (-0.66, 0.0, 0.58), mat=M['g_ayu'])                                                    # 기름지느러미
    box(0.52, 0.045, 0.34, (0.04, 0.0, 0.72), rot=(0, math.radians(-14), 0), mat=M['g_ayu'])                     # 크고 노란 등지느러미
    for sgn in (-1, 1):                                                                                          # 노란 꼬리 갈퀴(몸틀 꼬리 위에 덧댄다)
        box(0.24, 0.032, 0.16, (-1.12, 0.0, 0.30 + sgn * 0.14), rot=(0, math.radians(sgn * 40), 0), mat=M['g_ayu'])


def m_eel():
    """뱀장어 — 하류 가을. **뱀처럼 긴 몸이 S 자로 누웠고** 등 · 뒷지느러미가 꼬리까지 한 줄로 이어진다 ·
    등은 짙은 올리브 · 배는 누런 흰빛. 몸틀(`_finfish`)로는 안 되는 모양이라 촘촘한 마디로 잇는다."""
    random.seed(1678)
    n = 40
    for i in range(n):
        t = i / (n - 1)
        x = 1.10 - t * 2.30
        y = math.sin(t * math.pi * 1.55) * 0.38
        r = 0.15 * (1.0 - 0.55 * t) if t > 0.08 else 0.15 * (0.80 + 2.5 * t)
        ico(r, (x, y, 0.20), subdiv=2, mat=M['g_eel'], scale=(1.0, 1.0, 1.0), smooth=True)                       # 등(위)
        ico(r * 0.90, (x, y - 0.02, 0.14), subdiv=2, mat=M['g_eelb'], scale=(1.0, 1.0, 0.75), smooth=True)        # 배(아래)
        if t > 0.30:
            ico(r * 0.42, (x, y, 0.20 + r * 0.95), subdiv=1, mat=M['g_eel'], scale=(1.0, 1.0, 1.25), smooth=True)  # 이어진 등지느러미(낮은 둑)
    ico(0.055, (1.16, -0.09, 0.25), subdiv=2, mat=M['belly'], smooth=True)                                     # 눈
    ico(0.032, (1.19, -0.12, 0.25), subdiv=2, mat=M['scorch'], smooth=True)
    box(0.12, 0.10, 0.03, (0.94, -0.13, 0.18), rot=(math.radians(40), 0, 0), mat=M['fin2'])                       # 가슴지느러미


def _wiggle(x0, y0, ang, L, r0, body, belly, n, amp, waves, seed, spots=0, spot_mat=None, z0=0.0):
    """꼬인 긴 몸 — 마디를 **촘촘히** 겹쳐 잇는다(간격 ≈ 반지름의 0.4 — 성기면 구슬로 읽힌다 · 1패스 실측).
    미꾸라지 셋이 쓴다(뱀장어 `m_eel` 과 같은 마디 문법 — 그 하나는 등지느러미 둑이 붙어 제 고리를 둔다). `ang` 은 머리 쪽 방향."""
    random.seed(seed)
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(n):
        t = i / (n - 1)
        u = (0.5 - t) * L
        v = math.sin(t * math.pi * waves) * amp
        x, y = x0 + ca * u - sa * v, y0 + sa * u + ca * v
        r = r0 * (1.0 - 0.55 * t) if t > 0.08 else r0 * (0.80 + 2.5 * t)
        ico(r, (x, y, z0 + r), subdiv=2, mat=body, smooth=True)
        ico(r * 0.90, (x, y, z0 + r * 0.62), subdiv=2, mat=belly, scale=(1.0, 1.0, 0.75), smooth=True)
        pts.append((x, y, r))
    for k in range(spots):                                                           # 잔 얼룩(등)
        x, y, r = pts[int((k + 0.5) / spots * (n - 2)) + 1]
        ico(r * 0.42, (x + random.uniform(-0.3, 0.3) * r, y + random.uniform(-0.3, 0.3) * r, z0 + r * 1.85),
            subdiv=1, mat=spot_mat, scale=(1.0, 1.0, 0.4))
    hx, hy, hr = pts[0]
    ico(hr * 0.34, (hx + ca * hr * 0.55 + sa * hr * 0.45, hy + sa * hr * 0.55 - ca * hr * 0.45, z0 + hr * 1.35),
        subdiv=1, mat=M['scorch'])                                                   # 눈
    return pts


def m_loach():
    """미꾸라지 — 논물 · 도랑. 손가락만 한 **누런 갈색 잔고기가 몸을 꼰다**(검은 잔 얼룩 · 입가 수염) —
    한 마리로는 안 읽히니(§9) **셋이 나란히 꿈틀**."""
    for i, (dy, ph) in enumerate(((-0.42, 1.0), (0.0, -1.0), (0.42, 1.0))):
        pts = _wiggle(0.0, dy, 0.10 * ph, 1.30, 0.085, M['g_loach'], M['g_eelb'], 34, 0.10 * ph, 1.6,
                      seed=16790 + i, spots=9, spot_mat=M['scorch'])
        hx, hy, hr = pts[0]
        for sgn in (-1, 1):                                                          # 입수염
            cyl(0.010, 0.16, (hx + 0.09, hy + sgn * 0.04, hr * 0.8), rot=(0, math.radians(80), math.radians(sgn * 30)),
                mat=M['f_spot'], verts=4)


def _sardine_one(seed):
    _finfish(L=1.02, D=0.44, H=0.74, body=M['f_silver'], back=M['g_sard'], forked=True, seed=seed)
    ico(0.40, (-0.02, 0.0, 0.48), subdiv=2, mat=M['g_sard'], scale=(1.70, 0.50, 0.40), jitter=0.04, smooth=True)   # 푸른 등을 넓게
    for i in range(7):                                                                                           # 점 한 줄 — 카메라 쪽으로 내민다
        ico(0.060, (0.48 - i * 0.16, -0.25, 0.36), subdiv=1, mat=M['scorch'], scale=(1.1, 0.35, 1.0), jitter=0.2, smooth=True)


def m_sardine():
    """정어리 — 연안 떼. 날씬한 은빛 몸에 **진한 청록 등 · 옆구리에 검은 점이 한 줄** · 꼬리가 깊게 갈라진다.
    0.1kg 잔고기라(§9) **셋을 머리 모아 부채로** — 한 마리면 연어 · 청어와 갈리지 않는다(`test-icons ⑫` 자)."""
    for i, (rz, dy, dz) in enumerate(((-0.42, -0.10, 0.0), (0.0, 0.18, 0.10), (0.42, 0.46, 0.20))):
        n0 = len(OBJS)
        _sardine_one(16800 + i)
        _spin(n0, rz, px=0.95, py=0.0)
        _shift(n0, dy=dy, dz=dz)


def _anchovy_one(x, y, z, ang, s=1.0):
    """멸치 한 마리 — 매끈한 긴 몸 한 덩이(마디로 이으면 애벌레로 읽힌다 · 1패스 실측) + 푸른 등줄 + 갈라진 꼬리 + 눈."""
    ca, sa = math.cos(ang), math.sin(ang)
    o = ico(0.11 * s, (x, y, z), subdiv=2, mat=M['f_silver'], scale=(3.3, 0.62, 0.72), smooth=True); o.rotation_euler = (0, 0, ang)
    o = ico(0.085 * s, (x - ca * 0.02 * s, y - sa * 0.02 * s, z + 0.045 * s), subdiv=2, mat=M['g_sard'],
            scale=(3.6, 0.40, 0.42), smooth=True); o.rotation_euler = (0, 0, ang)                       # 푸른 등줄
    ico(0.028 * s, (x + ca * 0.30 * s + sa * 0.05 * s, y + sa * 0.30 * s - ca * 0.05 * s, z + 0.02 * s), subdiv=1, mat=M['scorch'])  # 눈
    for sgn in (-1, 1):                                                                                  # 갈라진 꼬리
        box(0.11 * s, 0.018 * s, 0.07 * s, (x - ca * 0.40 * s, y - sa * 0.40 * s, z + sgn * 0.035 * s),
            rot=(0, math.radians(sgn * 35), ang), mat=M['fin2'])


def m_anchovy():
    """멸치 — 남해 연안 떼. 손가락만 한 은빛 잔고기 — 한 마리로는 안 읽히니(§9) **한 무더기**(그물에서 쏟아 나란히 쌓인 것)."""
    random.seed(1681)
    k = 0
    for layer, (n, z) in enumerate(((5, 0.08), (4, 0.17), (3, 0.26))):
        for j in range(n):
            y = (j - (n - 1) / 2.0) * 0.17
            x = random.uniform(-0.10, 0.10) + layer * 0.05
            _anchovy_one(x, y, z, random.uniform(-0.30, 0.30) + (math.pi if k % 4 == 3 else 0.0), s=1.0)
            k += 1


def m_octopus():
    """문어 — 연안 바위. **둥근 몸통(외투막) 아래로 빨판 달린 팔 여덟이 말려** 바닥에 퍼졌다 · 적갈 살갗."""
    random.seed(1682)
    ico(0.44, (-0.18, 0.0, 0.66), subdiv=2, mat=M['g_octo'], scale=(1.25, 1.00, 1.10), jitter=0.05, smooth=True)   # 외투막
    ico(0.30, (0.20, 0.0, 0.40), subdiv=2, mat=M['g_octo'], scale=(1.0, 1.10, 0.85), jitter=0.05, smooth=True)     # 머리
    for sgn in (-1, 1):                                                                                              # 눈
        ico(0.075, (0.34, sgn * 0.22, 0.56), subdiv=2, mat=M['g_sucker'], jitter=0.05, smooth=True)
        ico(0.040, (0.38, sgn * 0.25, 0.57), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)
    for k in range(8):                                                                                               # 팔 여덟 — 끝이 말린다
        a0 = k * (math.tau / 8) + 0.18
        px, py, pz = 0.20 + math.cos(a0) * 0.18, math.sin(a0) * 0.18, 0.24
        heading = a0
        for s in range(11):
            t = s / 10.0
            r = 0.10 * (1.0 - 0.70 * t)
            heading += 0.16 + t * 0.42 * (1 if k % 2 else -1)
            px += math.cos(heading) * 0.13 * (1.0 - 0.35 * t)
            py += math.sin(heading) * 0.13 * (1.0 - 0.35 * t)
            pz = max(r * 0.8, 0.22 - t * 0.20)
            ico(r, (px, py, pz), subdiv=2, mat=M['g_octo'], scale=(1.0, 1.0, 0.85), jitter=0.04, smooth=True)
            if s % 2 == 0 and s < 9:
                ico(r * 0.42, (px, py, pz + r * 0.62), subdiv=1, mat=M['g_sucker'], scale=(1.0, 1.0, 0.6))      # 빨판


def m_squid():
    """오징어 — 동해 연안. **긴 원뿔 몸통 끝에 세모 지느러미 · 큰 눈 · 팔 여덟과 촉완 둘** · 살빛에 갈색 색소점."""
    random.seed(1683)
    ico(0.32, (-0.30, 0.0, 0.32), subdiv=2, mat=M['g_squid'], scale=(2.50, 1.00, 0.95), jitter=0.03, smooth=True)   # 몸통
    ico(0.19, (-0.98, 0.0, 0.32), subdiv=2, mat=M['g_squid'], scale=(1.60, 0.90, 0.80), jitter=0.03, smooth=True)   # 끝
    for sgn in (-1, 1):                                                                                                # 세모 지느러미
        box(0.50, 0.38, 0.04, (-1.02, sgn * 0.26, 0.34), rot=(0, 0, math.radians(sgn * 38)), mat=M['g_squid'])
    ico(0.21, (0.50, 0.0, 0.30), subdiv=2, mat=M['g_squid'], scale=(1.10, 1.05, 0.90), jitter=0.04, smooth=True)    # 머리
    for sgn in (-1, 1):                                                                                                # 큰 눈
        ico(0.11, (0.54, sgn * 0.20, 0.37), subdiv=2, mat=M['belly'], jitter=0.03, smooth=True)
        ico(0.068, (0.58, sgn * 0.25, 0.38), subdiv=2, mat=M['scorch'], jitter=0.03, smooth=True)
    for k in range(8):                                                                                                 # 팔 여덟 — 굵게 모아 앞으로
        a = (k / 7.0 - 0.5) * 0.90
        for s in range(6):
            t = s / 5.0
            ico(0.070 * (1.0 - 0.55 * t), (0.70 + s * 0.12 * math.cos(a), math.sin(a) * (0.10 + s * 0.10), 0.24 - t * 0.12),
                subdiv=2, mat=M['g_squid'], jitter=0.03, smooth=True)
    for sgn in (-1, 1):                                                                                                # 촉완 둘(짧게 — 몸이 그림을 채우게) + 곤봉
        cyl(0.028, 0.62, (1.04, sgn * 0.16, 0.14), rot=(0, math.radians(88), math.radians(sgn * 12)), mat=M['g_squid'], verts=6)
        ico(0.075, (1.36, sgn * 0.23, 0.13), subdiv=2, mat=M['g_squid'], scale=(1.7, 0.9, 0.7), jitter=0.04, smooth=True)
    for i in range(18):                                                                                                # 색소점
        x = random.uniform(-1.0, 0.30)
        ico(0.038, (x, random.uniform(-0.30, -0.16), 0.30 + random.uniform(0.02, 0.22)),
            subdiv=1, mat=M['g_octo'], scale=(1.0, 0.5, 1.0), jitter=0.2, smooth=True)


# ═══════════════ [T1067] 사냥 산출 · 손도구 둘 · 장비 갈래 셋 · 광물 둘 ═══════════════
# ★키 = 서버 품목 키 — 사냥 · 도살 산출(`server/wildlife.js` 동물 표 · 도살 `server/zone.js` · 이름 `specialty`/`game-meat`) ·
#   손 제작 망치 · 톱(`server/zone.js` RECIPES) · 작업대 장비 갈래(`EQUIPMENT_RECIPES` · 클라 `EQUIP_ICONS` — 재질이 그림을 안 바꾸는 갈래) ·
#   선광 광물 둘(흑요석 · 유황 — 지금은 광물 갈래 대표 `ore` 를 빌린다 · T481).
# ★날것 → 익힌 것은 **같은 함수 · 다른 인자**(§9-A 첫째 층) — `_haunch(cooked)` · `_bearslab(boiled)`.
# ★고증: 청동기 후기 — 장비 갈래 그림은 그 시대 가장 흔한 꼴로 고른다(무기 = 간돌 창 · 도구 = 홈자귀(송국리 문화의 표지 석기) ·
#   갑옷 = 가죽 몸가리개). 재질별 그림은 갈래 하나로 묶는다(`equipPicKey` — 옷만 재질마다 · 그 규약 그대로).

def _haunch(cooked=False):
    """사슴 뒷다리 한 짝 — 넓적다리 살 · 정강이 · 굽. `cooked=True` 는 **같은 다리**를 구운 것(털 · 굽을 걷어 낸 뼈 정강이 · 그을음)."""
    random.seed(1684)
    flesh = M['grilled'] if cooked else M['g_venison']
    ico(0.50, (-0.20, 0.0, 0.36), subdiv=2, mat=flesh, scale=(1.30, 0.82, 0.72), jitter=0.06, smooth=True)          # 넓적다리 살
    ico(0.30, (0.30, 0.0, 0.30), subdiv=2, mat=flesh, scale=(1.10, 0.70, 0.66), jitter=0.06, smooth=True)            # 무릎 쪽으로 좁아진다
    ico(0.13, (-0.86, 0.0, 0.46), subdiv=2, mat=M['g_bone'], scale=(1.0, 1.0, 1.0), jitter=0.05, smooth=True)        # 잘린 관절(엉덩뼈 머리)
    if cooked:
        cyl(0.075, 0.70, (0.78, 0.0, 0.24), rot=(0, math.radians(84), 0), mat=M['g_bone'], verts=10)               # 드러난 정강이뼈
        ico(0.11, (1.14, 0.0, 0.22), subdiv=2, mat=M['g_bone'], scale=(1.1, 1.0, 0.9), jitter=0.05, smooth=True)
        for (dx, dz) in ((-0.42, 0.66), (0.02, 0.62), (0.34, 0.50), (-0.70, 0.52)):                                # 탄 자국
            ico(0.11, (dx, -0.16, dz), subdiv=1, mat=M['scorch'], scale=(1.6, 0.35, 0.8), jitter=0.3, smooth=False)
    else:
        cyl(0.11, 0.62, (0.78, 0.0, 0.24), rot=(0, math.radians(84), 0), mat=M['g_furbrn'], verts=10)              # 털 붙은 정강이
        for sgn in (-1, 1):                                                                                         # 갈라진 굽
            box(0.16, 0.08, 0.20, (1.12, sgn * 0.05, 0.16), rot=(0, math.radians(-20), 0), mat=M['scorch'])


def m_meat_game():        _haunch(False)
def m_meat_game_cooked(): _haunch(True)


def _bearslab(boiled=False):
    """곰고기 한 덩이 — **누르스름한 비계**가 한 켜 얹힌 검붉은 살에 검은 털가죽 띠가 붙어 있다.
    `boiled=True` 는 **같은 덩이**를 삶아 털을 벗기고 **세 점으로 썬 것**(살이 잿빛 갈색 · 비계 켜는 그대로 · 그을음 없음).
    ⓘ 솥에 담아 보이면 씨앗 접시 문법과 겹친다(`test-icons ⑫` 실측 23.8) — 그릇 없이 썬 결로 말한다."""
    random.seed(1686)
    if boiled:
        for i in range(3):                                                                                                  # 썬 세 점 — 살 · 비계 두 켜는 날것과 같다
            x = -0.46 + i * 0.46
            for (zz, sx, mat) in ((0.0, 1.0, M['g_boiled']), (0.24, 0.96, M['g_fat'])):
                o = ico(0.40, (x, 0.0, 0.34 + zz * 0.55), subdiv=2, mat=mat, scale=(0.30, 1.10 * sx, (0.62 if zz == 0 else 0.24)),
                        jitter=0.05, smooth=True)
                o.rotation_euler = (0, math.radians(-24), 0)
        return
    ico(0.56, (0.0, 0.0, 0.26), subdiv=2, mat=M['g_venison'], scale=(1.30, 0.96, 0.46), jitter=0.07, smooth=True)       # 살
    ico(0.54, (0.0, 0.0, 0.42), subdiv=2, mat=M['g_fat'], scale=(1.24, 0.90, 0.16), jitter=0.06, smooth=True)           # 비계 한 켜
    for (dx, dy) in ((-0.30, -0.28), (0.20, -0.32), (0.46, -0.10)):                                                      # 살 결(비계 줄)
        ico(0.10, (dx, dy, 0.30), subdiv=1, mat=M['g_fat'], scale=(1.8, 0.30, 0.4), jitter=0.2, smooth=True)
    for i in range(9):                                                                                                  # 검은 털가죽 띠(한쪽 가장자리)
        t = i / 8.0
        ico(0.17, (-0.66 + t * 1.32, 0.44, 0.50), subdiv=1, mat=M['g_furblk'], scale=(1.0, 0.8, 0.9), jitter=0.35, smooth=False)


def m_meat_bear():        _bearslab(False)
def m_meat_bear_cooked(): _bearslab(True)


def m_meat_chicken():
    """닭고기 — 꿩 · 메추라기를 잡아 **털을 뽑은 통 한 마리**. 다리 둘 · 접은 날개 · 목 그루터기."""
    random.seed(1688)
    ico(0.46, (0.0, 0.0, 0.40), subdiv=2, mat=M['g_plucked'], scale=(1.25, 0.95, 0.82), jitter=0.04, smooth=True)   # 몸통
    ico(0.30, (0.36, 0.0, 0.50), subdiv=2, mat=M['g_plucked'], scale=(1.0, 1.05, 0.95), jitter=0.04, smooth=True)   # 가슴
    cyl(0.09, 0.26, (0.70, 0.0, 0.62), rot=(0, math.radians(60), 0), mat=M['g_plucked'], verts=10)                # 목 그루터기
    for sgn in (-1, 1):
        ico(0.16, (-0.30, sgn * 0.34, 0.24), subdiv=2, mat=M['g_plucked'], scale=(1.5, 0.9, 0.9), jitter=0.04, smooth=True)  # 다리 살
        cyl(0.035, 0.30, (-0.60, sgn * 0.40, 0.16), rot=(0, math.radians(76), 0), mat=M['g_bone'], verts=7)        # 다리뼈 끝
        ico(0.24, (0.06, sgn * 0.40, 0.46), subdiv=2, mat=M['g_plucked'], scale=(1.30, 0.40, 0.70), jitter=0.04, smooth=True)  # 접은 날개
    ico(0.08, (-0.56, 0.0, 0.52), subdiv=1, mat=M['g_plucked'], jitter=0.1)                                          # 꽁지


def m_bone():
    """뼈 — 사냥한 짐승의 다리뼈 둘. 곧은 줄기에 **혹 두 개씩 달린 끝**(뼈의 표지)."""
    random.seed(1689)
    for (x, y, rz, L) in ((0.0, -0.10, 18, 1.60), (0.0, 0.16, -46, 1.20)):
        a = math.radians(rz)
        cyl(0.075, L, (x, y, 0.16), rot=(0, math.radians(90), a), mat=M['g_bone'], verts=10)
        for end in (-1, 1):
            ex, ey = x + math.cos(a) * L / 2 * end, y + math.sin(a) * L / 2 * end
            for sgn in (-1, 1):
                ico(0.12, (ex - math.sin(a) * 0.08 * sgn, ey + math.cos(a) * 0.08 * sgn, 0.17), subdiv=2, mat=M['g_bone'],
                    jitter=0.06, smooth=True)


def m_fur():
    """모피 — 털을 살린 채 다룬 털가죽을 **둘둘 말아 끈으로 묶었다** · 끝에 꼬리가 늘어진다(여우 · 늑대).
    `hide`(날가죽)는 펴 둔 가죽이고 이것은 **털이 북슬한 두루마리**다 — 한눈에 갈려야 한다."""
    random.seed(1690)
    cyl(0.34, 1.20, (0.0, 0.0, 0.34), rot=(0, math.radians(90), 0), mat=M['g_furbrn'], verts=16)                 # 두루마리
    for i in range(240):                                                                                            # 털 — 작고 매끈한 뭉치를 촘촘히(부드러운 윤곽)
        ang = random.uniform(-0.35, math.pi + 0.35)
        x = random.uniform(-0.62, 0.62)
        rr = random.uniform(0.05, 0.085)
        o = ico(rr, (x, math.cos(ang) * 0.38, 0.34 + math.sin(ang) * 0.38), subdiv=2,
                mat=(M['g_furbrn'] if i % 4 else M['g_furblk']), scale=(0.7, 0.7, 1.7), jitter=0.10, smooth=True)
        o.rotation_euler = (ang - math.pi / 2, random.uniform(-0.4, 0.4), 0)
    for sgn in (-1, 1):                                                                                             # 동여맨 끈
        cyl(0.40, 0.05, (sgn * 0.34, 0.0, 0.34), rot=(0, math.radians(90), 0), mat=M['cord'], verts=16)
    for i in range(8):                                                                                              # 늘어진 꼬리(끝이 희다)
        t = i / 7.0
        ico(0.15 * (1.0 - 0.45 * t), (0.70 + t * 0.62, -0.10 - t * 0.30, 0.20 - t * 0.12), subdiv=1,
            mat=(M['g_tip'] if t > 0.80 else M['g_furbrn']), scale=(1.3, 1.0, 1.0), jitter=0.30, smooth=False)


def m_leather():
    """가죽 — 무두질해 **매끈한 짙은 갈색** 가죽을 말아 두었다(한 자락은 펴져 있다). 털이 없다 —
    날가죽(`hide` · 누런 펴진 가죽)과 모피(털 두루마리)와 갈린다."""
    random.seed(1691)
    cyl(0.24, 1.10, (-0.30, 0.0, 0.24), rot=(0, math.radians(90), math.radians(12)), mat=M['g_leather'], verts=18)  # 만 부분
    for sgn in (-1, 1):
        cyl(0.248, 0.02, (-0.30 + sgn * 0.54 * math.cos(math.radians(12)), sgn * 0.54 * math.sin(math.radians(12)), 0.24),
            rot=(0, math.radians(90), math.radians(12)), mat=M['g_lthin'], verts=18)                                # 말린 단면(속살 빛)
    plane(1.10, 0.95, (0.28, -0.05, 0.03), rot=(0, 0, math.radians(12)), mat=M['g_leather'])                      # 펴진 자락
    for (dx, dy) in ((0.82, 0.30), (0.86, -0.42), (0.10, -0.52)):                                                 # 다리 자리 가장자리(가죽 윤곽)
        ico(0.14, (dx, dy, 0.03), subdiv=1, mat=M['g_leather'], scale=(1.4, 0.8, 0.12), jitter=0.2)
    cyl(0.26, 0.05, (-0.30, 0.0, 0.24), rot=(0, math.radians(90), math.radians(12)), mat=M['cord'], verts=16)       # 끈


def m_horn():
    """뿔 — 사슴 · 말코손바닥사슴의 **가지 친 녹각** 하나. 밑동 테(뿔밑) · 굽은 줄기 · 가지 셋 · 끝은 희다."""
    random.seed(1692)
    pts = []
    for i in range(9):                                                                                              # 굽은 줄기
        t = i / 8.0
        x, z = -0.70 + t * 1.30, 0.10 + math.sin(t * math.pi * 0.85) * 0.70
        r = 0.10 * (1.0 - 0.45 * t)
        ico(r, (x, 0.0, z), subdiv=2, mat=(M['g_tip'] if t > 0.95 else M['g_antler']), jitter=0.05, smooth=True)
        pts.append((x, z, r))
        if i < 8:
            nx, nz = -0.70 + (i + 1) / 8.0 * 1.30, 0.10 + math.sin((i + 1) / 8.0 * math.pi * 0.85) * 0.70
            ln = math.hypot(nx - x, nz - z)
            cyl(r * 0.95, ln, ((x + nx) / 2, 0.0, (z + nz) / 2), rot=(0, math.atan2(nx - x, nz - z), 0), mat=M['g_antler'], verts=8)
    ico(0.15, (-0.72, 0.0, 0.08), subdiv=1, mat=M['g_antler'], scale=(1.0, 1.2, 0.5), jitter=0.3)                 # 뿔밑 테
    for (k, ln, lean) in ((2, 0.50, -10), (4, 0.42, 4), (6, 0.34, 14)):                                           # 가지 셋
        x, z, r = pts[k]
        tx, tz = x + math.sin(math.radians(lean)) * ln, z + math.cos(math.radians(lean)) * ln
        cyl(r * 0.70, ln, ((x + tx) / 2, -0.04, (z + tz) / 2), rot=(0, math.radians(lean), 0), mat=M['g_antler'], verts=8)
        ico(r * 0.62, (tx, -0.04, tz), subdiv=2, mat=M['g_tip'], jitter=0.05, smooth=True)


def m_feather():
    """깃털 — 꿩 **꼬리깃 셋**을 부채로 펼쳤다(적갈에 검은 띠 · 가운데 흰 깃대)."""
    random.seed(1693)
    for i, rz in enumerate((-16, 0, 16)):
        a = math.radians(rz)
        cx, cy = math.cos(a) * 0.20, math.sin(a) * 0.20
        o = ico(0.40, (cx, cy, 0.04 + i * 0.03), subdiv=2, mat=M['g_rust'], scale=(3.10, 0.72, 0.05), jitter=0.02, smooth=True)
        o.rotation_euler = (0, 0, a)
        cyl(0.010, 2.10, (cx, cy, 0.065 + i * 0.03), rot=(0, math.radians(90), a), mat=M['g_lthin'], verts=5)   # 깃대(가늘게)
    cyl(0.05, 0.30, (-1.30, 0.0, 0.10), rot=(0, math.radians(90), 0), mat=M['cord'], verts=8)                     # 깃대 밑을 묶은 끈


def m_egg():
    """계란 — 메추라기 · 꿩 둥지에서 꺼낸 **알 셋**을 마른 풀 둥지째 들었다."""
    random.seed(1694)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.50, minor_radius=0.16, location=(0, 0, 0.14))
    add(bpy.context.active_object, M['g_straw'])                                                                    # 둥지 테
    cyl(0.48, 0.08, (0, 0, 0.06), mat=M['g_straw'], verts=18)                                                       # 둥지 바닥
    for i in range(16):                                                                                             # 삐져나온 풀
        a = random.uniform(0, math.tau)
        cyl(0.012, random.uniform(0.30, 0.50), (math.cos(a) * 0.56, math.sin(a) * 0.56, 0.16),
            rot=(random.uniform(-0.6, 0.6), math.radians(80), a), mat=M['g_straw'], verts=4)
    for (x, y, rz) in ((-0.14, -0.10, 0.3), (0.16, -0.04, -0.4), (0.0, 0.18, 1.2)):
        o = ico(0.18, (x, y, 0.28), subdiv=2, mat=M['g_tip'], scale=(1.0, 1.0, 1.30), jitter=0.01, smooth=True)
        o.rotation_euler = (math.radians(70), 0, rz)


def m_hammer():
    """망치 — 나무 3 · 돌 3 손 제작(시설 0). 둥근 **냇돌 망치돌**을 자루 끝에 가로로 물려 끈으로 동여맸다."""
    random.seed(1695)
    cyl(0.07, 1.50, (-0.20, 0.0, 0.18), rot=(0, math.radians(86), math.radians(6)), mat=M['haft'], verts=9)       # 자루
    ico(0.30, (0.62, 0.0, 0.26), subdiv=2, mat=M['river'], scale=(0.86, 1.30, 0.86), jitter=0.06, smooth=True)    # 망치돌(가로)
    _lash(0.62, 0.0, 0.26, (math.radians(90), 0, 0), r=0.035, ln=0.66, n=3, gap=0.09)


def m_saw():
    """톱 — 나무 2 · 돌 4 손 제작(시설 0). 납작한 돌날 **아래에 이를 깨뜨려 세우고** 나무 자루에 박아 끈으로 동여맸다."""
    random.seed(1696)
    cyl(0.085, 0.70, (-0.78, 0.0, 0.18), rot=(0, math.radians(90), 0), mat=M['haft'], verts=10)                   # 자루
    box(1.30, 0.07, 0.30, (0.20, 0.0, 0.22), mat=M['chipped'])                                                      # 돌날
    for i in range(11):                                                                                             # 이
        cone(0.05, 0.0, 0.10, (-0.38 + i * 0.12, 0.0, 0.03), rot=(math.radians(180), 0, 0), mat=M['chipped'], verts=4)
    _lash(-0.46, 0.0, 0.20, (0, math.radians(90), 0), r=0.04, ln=0.16, n=1)
    for k in range(3):
        cyl(0.10, 0.04, (-0.52 + k * 0.07, 0.0, 0.20), rot=(0, math.radians(90), 0), mat=M['fiber'], verts=10)


def m_weapon():
    """무기(갈래) — 작업대 장비 무기 갈래의 그림. 청동기 후기에 가장 흔한 **간돌 창** — 버들잎꼴 창끝을 긴 자루에 묶었다.
    재질(돌 · 나무 · 뼈 · 흑요석 · 구리 · 청동 · 철)이 그림을 안 바꾼다(갈래 아이콘 규약)."""
    random.seed(1697)
    cyl(0.055, 2.40, (-0.40, 0.0, 0.14), rot=(0, math.radians(88), math.radians(4)), mat=M['haft'], verts=8)       # 긴 자루
    ico(0.26, (1.08, 0.0, 0.18), subdiv=2, mat=M['ground'], scale=(2.10, 0.20, 0.62), jitter=0.02, smooth=True)    # 버들잎꼴 창끝(간돌)
    box(0.30, 0.03, 0.06, (1.00, -0.05, 0.19), mat=M['chipped'])                                                     # 가운데 등날
    _lash(0.62, 0.0, 0.16, (0, math.radians(90), math.radians(4)), r=0.04, ln=0.12, n=1)
    for k in range(3):
        cyl(0.075, 0.035, (0.52 + k * 0.06, 0.0, 0.16), rot=(0, math.radians(90), 0), mat=M['fiber'], verts=10)


def m_tool():
    """도구(갈래) — 작업대 장비 도구 갈래의 그림. 송국리 문화의 표지 석기 **홈자귀** — 홈을 판 간돌 자귀를
    무릎꼴(ㄱ자) 자루 짧은 쪽에 대고 끈으로 감았다. 재질이 그림을 안 바꾼다(갈래 아이콘 규약)."""
    random.seed(1698)
    cyl(0.07, 1.40, (-0.30, 0.0, 0.16), rot=(0, math.radians(84), 0), mat=M['haft'], verts=9)                      # 자루 긴 쪽
    cyl(0.085, 0.52, (0.44, 0.0, 0.36), rot=(0, math.radians(20), 0), mat=M['haft'], verts=9)                      # 무릎(짧은 쪽 · 위로 꺾임)
    box(0.16, 0.24, 0.86, (0.66, 0.0, 0.30), rot=(0, math.radians(24), 0), mat=M['ground'])                        # 간돌 자귀 몸(길쭉하다)
    box(0.04, 0.26, 0.06, (0.62, 0.0, 0.58), rot=(0, math.radians(24), 0), mat=M['scorch'])                        # 묶는 홈
    box(0.20, 0.26, 0.05, (0.84, 0.0, -0.08), rot=(0, math.radians(24), 0), mat=M['grind'])                        # 날(간 면)
    _lash(0.56, 0.0, 0.56, (0, math.radians(110), 0), r=0.035, ln=0.34, n=2, gap=0.07)


def m_armor():
    """갑옷(갈래) — 작업대 장비 갑옷 갈래의 그림. **가죽 몸가리개**를 앞판이 위로 오게 **펴 놓았다**(옷 여섯 아이콘과 같은 눕힌 자세) —
    어깨가 넓고 허리가 좁은 몸판 · 목 파임 · 어깨끈 · 아래로 늘어진 가죽 자락.
    재질(가죽 · 날가죽 · 구리 · 청동 · 철 · 운철)이 그림을 안 바꾼다(갈래 아이콘 규약)."""
    random.seed(1699)
    ico(0.50, (0.30, 0.0, 0.10), subdiv=2, mat=M['g_leather'], scale=(0.62, 1.30, 0.20), jitter=0.02, smooth=True)   # 가슴(넓다)
    ico(0.50, (-0.16, 0.0, 0.10), subdiv=2, mat=M['g_leather'], scale=(0.70, 0.96, 0.19), jitter=0.02, smooth=True)  # 허리(좁다)
    ico(0.20, (0.64, 0.0, 0.17), subdiv=2, mat=M['scorch'], scale=(0.45, 1.30, 0.20), jitter=0.02, smooth=True)       # 목 파임
    for sgn in (-1, 1):
        box(0.46, 0.20, 0.05, (0.64, sgn * 0.42, 0.18), rot=(0, 0, math.radians(sgn * 10)), mat=M['g_lthin'])       # 어깨끈
        ico(0.17, (0.42, sgn * 0.66, 0.16), subdiv=2, mat=M['scorch'], scale=(1.0, 0.45, 0.30), smooth=True)       # 팔 구멍
        for k in range(3):                                                                                           # 옆 여밈 끈
            cyl(0.020, 0.16, (0.10 - k * 0.22, sgn * 0.52, 0.16), rot=(math.radians(90), 0, 0), mat=M['cord'], verts=6)
    box(0.07, 1.04, 0.04, (0.12, 0.0, 0.205), mat=M['g_lthin'])                                                      # 가슴 테
    for i in range(5):                                                                                               # 늘어진 가죽 자락
        box(0.42, 0.15, 0.05, (-0.78, -0.36 + i * 0.18, 0.06), rot=(0, math.radians(4), 0), mat=M['g_leather'])
        box(0.05, 0.155, 0.055, (-0.60, -0.36 + i * 0.18, 0.08), mat=M['g_lthin'])


def m_obsidian():
    """흑요석 — 선광해 고른 **검은 유리 돌**. 패각상으로 깨진 매끈한 면과 날카로운 모서리 · 옆에 떨어진 격지 둘."""
    random.seed(1700)
    ico(0.46, (0.0, 0.0, 0.36), subdiv=1, mat=M['g_obsid'], scale=(1.20, 0.95, 0.85), jitter=0.22, smooth=False)  # 덩이
    ico(0.24, (0.40, 0.10, 0.62), subdiv=1, mat=M['g_obsid'], scale=(1.0, 0.8, 0.7), jitter=0.30, smooth=False)   # 모난 등
    for (x, y, rz) in ((0.70, -0.40, 0.4), (-0.62, -0.42, -0.6)):                                                  # 격지(얇은 조각)
        o = ico(0.16, (x, y, 0.05), subdiv=1, mat=M['g_obsid'], scale=(1.6, 1.0, 0.25), jitter=0.25, smooth=False)
        o.rotation_euler = (0, 0, rz)


def m_sulfur():
    """유황 — 선광해 고른 **샛노란 결정 덩이**. 성긴 덩이 위에 뾰족한 결정이 돋았다."""
    random.seed(1701)
    for i in range(7):                                                                                              # 덩이
        a = i * 2.399
        d = random.uniform(0.0, 0.34)
        ico(random.uniform(0.18, 0.26), (math.cos(a) * d, math.sin(a) * d, 0.20 + (0.34 - d) * 0.30), subdiv=1,
            mat=M['g_sulfur'], scale=(1.1, 1.0, 0.8), jitter=0.28, smooth=False)
    for i in range(9):                                                                                              # 돋은 결정
        a = random.uniform(0, math.tau)
        d = random.uniform(0.0, 0.30)
        cone(0.07, 0.0, random.uniform(0.18, 0.30), (math.cos(a) * d, math.sin(a) * d, 0.46 + (0.30 - d) * 0.25),
             rot=(random.uniform(-0.4, 0.4), random.uniform(-0.4, 0.4), 0), mat=M['g_sulfur'], verts=5)


# ═══════════════ [T1088] 그림 없는 품목 이어서 — 첫 1시간 제작창 · 곳간 · 거래 빈도 순 ═══════════════
# ★차례의 자: 제작창 음식 칸(모두가 첫 1시간에 본다) → 곳간 · 거래 · 게시판 빈도(`T17_ITEMFREQ` · 보고/T1088 §1).
# ★같은 물건은 같은 재질 — 조개탕은 **굴**(그 요리의 재료 `tidal.cookMap`)의 껍데기 · 살 재질 · 미역국은 미역 재질 ·
#   모시는 모시옷 빛(`CLOTH_MATS`) · 청동은 이 파일의 청동 재질 그대로다.

def _ring(R, r, loc, mat, rot=(0, 0, 0), maj=32, mnr=8):
    """고리 — 아가리 테 · 동여맨 끈 · 섬유 타래(원환체)."""
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=maj, minor_segments=mnr,
                                     location=loc, rotation=rot)
    o = bpy.context.active_object
    for pg in o.data.polygons:
        pg.use_smooth = True
    return add(o, mat)


def _bowl(R, H, mat, base=0.56):
    """바리(사발) — 바닥이 좁고 아가리가 벌어진 무문토기 그릇 + 아가리 테. 안에 담는 것은 부르는 쪽이 얹는다."""
    cone(R * base, R, H, (0, 0, H / 2), mat=mat, verts=32)
    _ring(R - 0.03, 0.05, (0, 0, H), mat)


def _kernels(n, cx, cy, cz, rx, ry, rz, seed, mats, r=0.034):
    """낟알 n 개 — 반타원 둔덕 위에 흩뿌린다(작은 것은 개수로 말한다 · §9)."""
    random.seed(seed)
    for i in range(n):
        a = random.uniform(0, math.tau); t = math.sqrt(random.uniform(0, 1))
        x, y = cx + math.cos(a) * rx * t, cy + math.sin(a) * ry * t
        z = cz + rz * math.sqrt(max(0.0, 1 - t * t))
        o = ico(r * random.uniform(0.85, 1.15), (x, y, z), subdiv=1, mat=mats[i % len(mats)], scale=(1.5, 1.0, 0.9), smooth=True)
        o.rotation_euler = (random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), random.uniform(0, math.tau))


def m_food():
    """곡식(`food` — econ 곡식 칸 · 이름표 '곡식' · 곳간 · 게시판 보상 · 모닥불 · 익힌 곡식의 재료).
    **한 곡식을 고르지 않는다** — 누런 · 갈색 · 흰 낟알을 섞은 잡곡을 소쿠리에 고봉으로 담고 앞에 몇 알 흘렸다(§9 — 작은 것은 그릇과 개수로)."""
    random.seed(1801)
    cone(0.50, 0.70, 0.44, (0, 0, 0.22), mat=M['g_basket'], verts=32)                                     # 소쿠리(엮은 결)
    _ring(0.69, 0.055, (0, 0, 0.44), M['g_basket'])
    ico(0.68, (0, 0, 0.44), subdiv=3, mat=M['h_grain'], scale=(1.0, 1.0, 0.52), smooth=True)              # 고봉
    _kernels(80, 0, 0, 0.44, 0.62, 0.62, 0.34, 18011, [M['h_kern1'], M['h_kern2'], M['h_kern3']])
    _kernels(12, 0.42, -0.66, 0.02, 0.26, 0.14, 0.03, 18012, [M['h_kern1'], M['h_kern2'], M['h_kern3']])  # 흘린 낟알


def m_food_cooked():
    """익힌 곡식(`food_cooked` — 곡식 1 을 모닥불에서 · 제작창 음식 칸) — 바리에 고봉으로 담았다.
    낟알이 불어 뽀얗고, 곡식(`food`)과 같은 잡곡 낟알이 군데군데 박혔다(한 곡식을 고르지 않는다)."""
    random.seed(1803)
    _bowl(0.62, 0.40, M['h_bowl'])
    ico(0.60, (0, 0, 0.40), subdiv=3, mat=M['h_cooked'], scale=(1.0, 1.0, 0.64), smooth=True)
    _kernels(36, 0, 0, 0.40, 0.55, 0.55, 0.38, 18031, [M['h_kern3'], M['h_kern3'], M['h_kern1'], M['h_kern2']], r=0.030)


def _oyster_half(x, y, z, rz, s=1.0):
    """굴 반쪽 — 굴 아이콘(`_oyster`)의 껍데기 · 진주층 · 살 재질 그대로(조개탕의 재료가 굴 셋이다)."""
    o = ico(0.30 * s, (x, y, z), subdiv=2, mat=M['shell'], scale=(1.05, 0.80, 0.30), jitter=0.16, smooth=False); o.rotation_euler = (0, 0, rz)
    o = ico(0.25 * s, (x, y, z + 0.05 * s), subdiv=2, mat=M['nacre'], scale=(0.95, 0.74, 0.10), jitter=0.08, smooth=True); o.rotation_euler = (0, 0, rz)
    o = ico(0.17 * s, (x, y, z + 0.08 * s), subdiv=2, mat=M['flesh'], scale=(1.0, 0.78, 0.40), jitter=0.12, smooth=True); o.rotation_euler = (0, 0, rz)


def m_clam_stew():
    """조개탕(`clam_stew` — 굴 3 을 끓인 요리 · 제작창 음식 칸 · `tidal.cookMap`) — 그을린 **심발**(깊은 끓임 그릇)에 뽀얀 국물 ·
    반쪽 껍데기째 끓인 굴(굴 아이콘과 같은 껍데기 · 진주층 · 살 재질) · 달래 몇 가닥. 바리에 담은 미역국 · 익힌 곡식 · 요리와 그릇 꼴로 갈린다."""
    random.seed(1804)
    cone(0.46, 0.70, 0.66, (0, 0, 0.33), mat=M['h_soot'], verts=32)
    _ring(0.68, 0.06, (0, 0, 0.66), M['h_soot'])
    cyl(0.66, 0.03, (0, 0, 0.665), mat=M['h_broth'], verts=32)                                            # 국물 면(그릇 윗면보다 살짝 위)
    for (x, y, rz, s_) in ((0.22, -0.22, 0.5, 0.80), (-0.30, 0.02, 2.3, 0.76), (0.10, 0.32, -1.0, 0.72), (-0.06, -0.40, 3.4, 0.58)):
        _oyster_half(x, y, 0.67, rz, s=s_)
    for i in range(7):                                                                                     # 달래
        a = i * 0.90 + 0.4; d = random.uniform(0.10, 0.50)
        cyl(0.016, 0.24, (math.cos(a) * d, math.sin(a) * d, 0.69), rot=(0, math.radians(90), a), mat=M['h_green'], verts=6)


def m_seaweed_soup():
    """미역국(`seaweed_soup` — 미역 2 를 끓인 요리 · 제작창 음식 칸) — 바리에 맑은 갈색 국물 · 풀어져 국물에 누운 미역 가닥
    (미역 아이콘과 같은 리본 꼴 · 끓여서 새파래진 빛) · 걸쳐 둔 나무 국자. 흙빛 접시(씨앗 · 건굴 · 말린 열매)와 국 빛 · 국자로 갈린다."""
    random.seed(1805)
    _bowl(0.66, 0.42, M['h_bowl'], base=0.54)
    cyl(0.62, 0.03, (0, 0, 0.425), mat=M['h_soup'], verts=32)                                            # 국물 면(그릇 윗면보다 살짝 위)
    for i in range(11):                                                                                   # 미역 가닥 — 이어진 리본이 물결지며 눕는다
        a0 = i * 0.571 + random.uniform(-0.2, 0.2); d0 = random.uniform(0.05, 0.36)
        x0, y0 = math.cos(a0) * d0, math.sin(a0) * d0
        h = a0 + random.uniform(1.2, 2.0)
        for j in range(9):
            t = j / 8.0
            px = x0 + math.cos(h) * (t - 0.5) * 0.80 + math.sin(t * 6.0 + i) * 0.05 * -math.sin(h)
            py = y0 + math.sin(h) * (t - 0.5) * 0.80 + math.sin(t * 6.0 + i) * 0.05 * math.cos(h)
            if px * px + py * py > 0.54 ** 2:
                continue
            box(0.12, 0.16 - t * 0.06, 0.012, (px, py, 0.445 + j * 0.001), rot=(0, 0, h + math.sin(t * 6.0 + i) * 0.5), mat=M['h_kelpcooked'])
    cyl(0.036, 1.00, (-0.62, 0.0, 0.70), rot=(0, math.radians(-59), 0), mat=M['haft'], verts=10)          # 국자 자루(아가리에 걸쳤다)
    ico(0.13, (-0.16, 0.0, 0.44), subdiv=2, mat=M['haft'], scale=(1.1, 1.0, 0.35), smooth=True)              # 국자 머리(국에 잠겼다)


def m_cooked_food():
    """요리(`cooked_food` — econ 칸: 곡식 + 부재료를 끓인 조리식 · `sim/economy-sim.js` cook '곡식 + 부재료 → 요리' · 곳간 '요리') —
    윤 낸 붉은 간토기(홍도) 바리에 걸쭉한 **죽** · 위에 고깃점과 나물(부재료). 밥 한 그릇(익힌 곡식) · 국 둘과 꼴 · 빛으로 갈린다."""
    random.seed(1806)
    _bowl(0.64, 0.44, M['h_redware'], base=0.50)
    ico(0.60, (0, 0, 0.42), subdiv=3, mat=M['h_porridge'], scale=(1.0, 1.0, 0.18), smooth=True)
    for i in range(7):                                                                                    # 고깃점
        a = i * 0.898 + 0.3; d = random.uniform(0.10, 0.40)
        o = ico(0.09, (math.cos(a) * d, math.sin(a) * d, 0.50), subdiv=1, mat=M['h_meatbit'], scale=(1.3, 1.0, 0.7), jitter=0.2)
        o.rotation_euler = (0, 0, a)
    for i in range(8):                                                                                    # 나물
        a = i * 0.785 + 0.7; d = random.uniform(0.05, 0.44)
        o = ico(0.08, (math.cos(a) * d, math.sin(a) * d, 0.51), subdiv=1, mat=M['h_green'], scale=(1.8, 0.6, 0.15), jitter=0.1)
        o.rotation_euler = (0, 0, a + 1.2)


def _bar(x, y, z, rz, L, W, H, mat):
    """막대 덩이 — 열린 거푸집 바닥 꼴(아래가 넓고 위가 좁다)."""
    o = box(L, W, H, (x, y, z), rot=(0, 0, rz), mat=mat)
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.x *= 0.88; v.co.y *= 0.62
    return o


def m_bronze():
    """청동(`bronze` — 구리와 주석을 녹여 섞은 쇠 · 장비 재질 칸 · 시설창 노 · 작업대) — 열린 거푸집에 부어 굳힌 **막대 덩이** 둘을
    엇걸어 놓았다 · 등이 부풀었고 겉에 푸른 녹이 앉았다. 빛은 이 파일의 청동(`M['bronze']`) 그대로에 쇠붙이 윤만.
    구리 · 주석 · 납의 빵떡 덩이(`icon_render._ingot`)와 꼴로 갈린다."""
    random.seed(1807)
    bars = ((0.0, 0.0, 0.10, math.radians(-20)), (0.04, 0.02, 0.32, math.radians(52)))
    for (x, y, z, rz) in bars:
        _bar(x, y, z, rz, 1.50, 0.44, 0.20, M['h_bronzemet'])
        o = cyl(0.15, 1.28, (x, y, z + 0.10), rot=(0, math.radians(90), rz), mat=M['h_bronzemet'], verts=20)   # 부푼 등
        o.scale = (0.55, 1.0, 1.0)
    for k in range(14):                                                                                     # 녹
        x, y, z, rz = bars[k % 2]
        t = random.uniform(-0.60, 0.60)
        o = ico(random.uniform(0.09, 0.15), (x + math.cos(rz) * t, y + math.sin(rz) * t + random.uniform(-0.05, 0.05) * math.cos(rz), z + 0.175),
                subdiv=1, mat=M['h_patina'], scale=(1.5, 1.0, 0.25), jitter=0.25)
        o.rotation_euler = (0, 0, rz + random.uniform(-0.6, 0.6))


def m_ramie():
    """모시(`ramie` — 옷 재질 칸 · 곳간 '모시') — 모시풀 껍질을 째어 낸 **흰 섬유 타래**: 가는 올이 긴 고리를 이루고 한쪽을 끈으로 동였다.
    빛은 모시옷과 같은 값(정본 `render_common.CLOTH_MATS['ramie']`) — 같은 물건의 앞뒤라는 표시."""
    random.seed(1809)
    for k in range(7):                                                                                      # 올 다발(고리)
        o = _ring(0.80 + random.uniform(-0.05, 0.05), 0.055, (random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), 0.07 + k * 0.022),
                  M['h_ramief'], rot=(random.uniform(-0.05, 0.05), random.uniform(-0.05, 0.05), 0), maj=48, mnr=8)
        o.scale = (1.0, 0.36, 1.0)
    for i in range(3):                                                                                      # 동인 끈(한쪽 끝)
        cyl(0.11, 0.05, (0.74 - i * 0.07, 0.0, 0.14), rot=(0, math.radians(90), 0), mat=M['cord'], verts=12)
    for i in range(9):                                                                                      # 끝에서 풀린 올
        a = random.uniform(-0.5, 0.5)
        o = cyl(0.012, 0.42, (-0.98 - math.cos(a) * 0.12, math.sin(a) * 0.20, 0.10), rot=(0, math.radians(90), a), mat=M['h_ramief'], verts=6)


def m_hemp():
    """대마(`hemp` — 삼 · 옷 재질 칸 · 곳간 '삼베' 감) — 벤 **삼대 한 단**: 긴 줄기를 두 군데 묶고 윗동에 손바닥꼴 잎이 달렸다."""
    random.seed(1808)
    for i in range(11):                                                                                     # 줄기
        dy = (i - 5) * 0.045 + random.uniform(-0.01, 0.01); dz = 0.06 + (i % 3) * 0.04
        cyl(0.036, 2.30, (-0.10, dy, dz), rot=(0, math.radians(90), dy * 0.35), mat=M['h_stalk'], verts=7)
    for x in (-0.45, 0.20):                                                                                 # 묶은 끈
        cyl(0.21, 0.06, (x, 0.0, 0.10), rot=(0, math.radians(90), 0), mat=M['cord'], verts=12)
    for (cx, cy, cz, rz) in ((1.02, -0.16, 0.16, -0.5), (1.12, 0.16, 0.20, 0.4), (0.84, 0.02, 0.30, 0.0)):    # 잎(손바닥꼴 · 잎줄기 일곱)
        for j in range(7):
            a = rz + (j - 3) * 0.42
            L = 0.30 - abs(j - 3) * 0.05
            o = ico(L * 0.5, (cx + math.cos(a) * L * 0.5, cy + math.sin(a) * L * 0.5, cz), subdiv=2, mat=M['h_hempleaf'],
                    scale=(1.0, 0.20, 0.05), smooth=True)
            o.rotation_euler = (0, 0, a)


def m_clothes():
    """옷(`clothes` — 옷 갈래 키 · econ 재봉사 산출 '옷' · 곳간 '옷') — **펼친 관두의**(머리를 넣는 구멍을 낸 통옷) 한 벌을 허리끈과 함께 눕혔다.
    재질 여섯(`clothes_<재질>`)은 **개켜 쌓은** 그림이다 — 갈래 그림은 펼친 꼴로 갈린다. 빛은 삼베옷 값(정본 `CLOTH_MATS` — 청동기 한반도 옷감의 바탕)."""
    random.seed(1810)
    n0 = len(OBJS)
    box(1.00, 1.04, 0.05, (0, 0, 0.04), mat=M['h_hempweave'])                                            # 몸판(어깨 +x · 단 −x)
    for sgn in (-1, 1):                                                                                     # 소매 — 양쪽으로 뻗었다
        box(0.44, 0.66, 0.05, (0.24, sgn * 0.82, 0.045), rot=(0, 0, sgn * -0.10), mat=M['h_hempweave'])
        box(0.46, 0.06, 0.055, (0.24, sgn * 1.13, 0.05), rot=(0, 0, sgn * -0.10), mat=M['cl_hemp_t'])      # 소맷부리
    for i in range(3):                                                                                       # 주름
        box(0.70, 0.035, 0.03, (-0.10, -0.30 + i * 0.30, 0.075), rot=(0, 0, 0.06 * (i - 1)), mat=M['cl_hemp_t'])
    cyl(0.15, 0.02, (0.36, 0.0, 0.075), mat=M['cl_hemp_p'], verts=20)                                       # 목 구멍
    box(0.26, 0.035, 0.02, (0.18, 0.0, 0.075), mat=M['cl_hemp_p'])                                          # 앞 트임
    box(0.11, 1.10, 0.05, (-0.08, 0.0, 0.085), mat=M['cl_hemp_p'])                                          # 허리끈
    for sgn in (-1, 1):
        box(0.40, 0.07, 0.03, (-0.36, sgn * 0.10, 0.09), rot=(0, 0, sgn * 0.45), mat=M['cl_hemp_p'])        # 늘어진 끈 끝
    _spin(n0, math.radians(135))                                                                            # 소매가 화면 가로로 · 어깨가 안쪽으로


def m_resin():
    """송진(`resin` — 숲 갈래 채집물) — 소나무 껍질 조각에 흘러 굳은 **노란 진** 방울 · 옆에 떨어진 진 덩이 둘(윤이 난다)."""
    random.seed(1811)
    box(1.30, 0.56, 0.14, (0, 0, 0.07), rot=(0, 0, math.radians(8)), mat=M['bark2'])                       # 껍질 조각
    for i in range(4):
        box(1.20, 0.07, 0.06, (0.0, -0.20 + i * 0.13, 0.15), rot=(0, 0, math.radians(8)), mat=M['bark2'])  # 껍질 골
    for (x, y, r) in ((-0.30, 0.02, 0.22), (0.10, -0.06, 0.18), (0.42, 0.06, 0.15), (-0.02, 0.16, 0.12)):
        ico(r, (x, y, 0.18 + r * 0.5), subdiv=2, mat=M['h_resin'], scale=(1.2, 1.0, 0.75), jitter=0.10, smooth=True)
        ico(r * 0.55, (x + 0.06, y - r * 0.9, 0.12), subdiv=2, mat=M['h_resin'], scale=(1.0, 1.6, 0.6), jitter=0.10, smooth=True)  # 흘러내린 자국
    ico(0.20, (0.66, -0.56, 0.12), subdiv=2, mat=M['h_resin'], scale=(1.2, 1.0, 0.7), jitter=0.18, smooth=True)
    ico(0.13, (0.30, -0.66, 0.08), subdiv=2, mat=M['h_resin'], scale=(1.1, 1.0, 0.7), jitter=0.18, smooth=True)


def m_clay():
    """진흙(`clay` — 광물 갈래 · 그릇 · 벽돌 감) — 젖은 갈흙 덩이(`_earth`)."""
    _earth(M['h_clayraw'], 1812)


def m_tigerhide():
    """호피(`tigerhide` — econ 칸: 호랑이 도축 · 최고가 위신재 · 곳간 '호피') — 펼친 **범 가죽**: 주황 바탕에 굽이진 검은 줄 ·
    네 다리를 옆으로 벌렸고 꼬리가 길며 가장자리가 희다."""
    random.seed(1813)
    n0 = len(OBJS)
    ico(0.70, (0, 0, 0.03), subdiv=3, mat=M['h_tigerw'], scale=(1.50, 0.86, 0.03), smooth=True)            # 흰 배 가장자리
    ico(0.66, (0, 0, 0.06), subdiv=3, mat=M['h_tiger'], scale=(1.50, 0.78, 0.04), smooth=True)              # 등가죽
    for (x, sgn) in ((0.66, 1), (0.66, -1), (-0.70, 1), (-0.70, -1)):                                        # 다리(옆으로 벌렸다)
        a = sgn * (1.25 if x > 0 else 1.90)
        for j in range(4):
            t = j / 3.0
            ico(0.17 - t * 0.05, (x + math.cos(a) * (0.38 + t * 0.42), sgn * 0.30 + math.sin(a) * (0.30 + t * 0.42) * sgn * sgn, 0.05),
                subdiv=2, mat=M['h_tiger'], scale=(1.3, 1.0, 0.25), smooth=True)
        ico(0.09, (x + math.cos(a) * 0.98, sgn * 0.30 + math.sin(a) * 0.86, 0.06), subdiv=2, mat=M['h_tigerw'], scale=(1.2, 1.0, 0.4), smooth=True)
    for j in range(9):                                                                                       # 꼬리(검은 고리)
        t = j / 8.0
        ico(0.085 - t * 0.025, (-1.06 - t * 0.80, 0.08 + math.sin(t * 3.0) * 0.26, 0.05), subdiv=2,
            mat=(M['g_furblk'] if j % 2 else M['h_tiger']), scale=(1.3, 1.0, 0.45), smooth=True)
    ico(0.30, (1.20, 0.0, 0.09), subdiv=2, mat=M['h_tiger'], scale=(0.95, 1.0, 0.32), smooth=True)          # 머리 가죽
    ico(0.14, (1.42, 0.0, 0.10), subdiv=2, mat=M['h_tigerw'], scale=(0.8, 1.2, 0.35), smooth=True)          # 주둥이(흰)
    for sgn in (-1, 1):
        ico(0.09, (1.10, sgn * 0.26, 0.16), subdiv=1, mat=M['g_furblk'], scale=(1.0, 1.0, 0.5))            # 귀
        ico(0.035, (1.30, sgn * 0.11, 0.18), subdiv=1, mat=M['g_furblk'])                                   # 눈


def _earth(mat, seed):
    """흙덩이 — 캐어 낸 찰흙: 뭉친 덩이의 윗면을 칼로 잘라 매끈하다 · 손가락 자국 · 말아 둔 흙가래(그릇을 쌓는 감) · 떼어 낸 덩이.
    진흙(`clay`)과 고령토(`kaolin`)가 **같은 흙 문법**이다 — 빛만 다르다."""
    random.seed(seed)
    o = ico(0.58, (-0.06, 0.06, 0.30), subdiv=3, mat=mat, scale=(1.20, 1.0, 0.62), jitter=0.04, smooth=True)
    for v in o.data.vertices:                                                                                  # 칼로 자른 윗면
        if v.co.z > 0.40:
            v.co.z = 0.40
    for i in range(3):                                                                                        # 손가락 자국
        ico(0.09, (-0.40 + i * 0.20, -0.42, 0.40), subdiv=2, mat=mat, scale=(0.6, 1.0, 0.4), smooth=True)
    _ring(0.22, 0.075, (0.52, -0.62, 0.075), mat, maj=40, mnr=10)                                             # 감은 흙가래
    cyl(0.075, 0.80, (-0.10, -0.80, 0.075), rot=(0, math.radians(90), math.radians(-10)), mat=mat, verts=14)
    ico(0.20, (0.70, 0.28, 0.14), subdiv=2, mat=mat, scale=(1.1, 1.0, 0.7), jitter=0.06, smooth=True)          # 떼어 낸 덩이


def m_kaolin():
    """고령토(`kaolin` — 광물 갈래 · 흰 찰흙) — 진흙과 같은 흙 덩이(`_earth`) · 흰빛."""
    _earth(M['h_kaolin'], 1830)


def m_amber_resin():
    """호박(`amber_resin` — 숲 갈래 채집물 · 땅에서 줍는 송진 화석) — 윤 나는 주황 호박 덩이 다섯(둥글게 닳았다)."""
    random.seed(1820)
    for (x, y, r) in ((0.0, 0.0, 0.34), (0.46, -0.20, 0.24), (-0.40, -0.26, 0.22), (0.18, 0.40, 0.20), (-0.30, 0.34, 0.16)):
        ico(r, (x, y, r * 0.75), subdiv=2, mat=M['h_amber'], scale=(1.25, 1.0, 0.85), jitter=0.18, smooth=True)


def m_amber_raw():
    """호박 원석(`amber_raw` — 광물 갈래 · 캐낸 것) — 풍화된 **겉껍질**을 쓴 덩이를 쪼개 윤 나는 주황 속살이 드러났다(옥 원석과 같은 문법)."""
    random.seed(1821)
    ico(0.60, (-0.10, 0.10, 0.42), subdiv=2, mat=M['h_ambercrust'], scale=(1.15, 1.0, 0.82), jitter=0.18, smooth=False)
    ico(0.46, (0.30, -0.28, 0.34), subdiv=2, mat=M['h_amber'], scale=(1.0, 1.0, 0.86), jitter=0.12, smooth=True)    # 쪼갠 면 — 속살
    ico(0.18, (0.60, 0.40, 0.14), subdiv=2, mat=M['h_amber'], jitter=0.2, smooth=True)                               # 떨어진 조각
    ico(0.14, (-0.62, -0.40, 0.10), subdiv=1, mat=M['h_ambercrust'], jitter=0.3)


def m_bamboo():
    """대나무(`bamboo` — 숲 갈래 · 벤 것) — 벤 **대 세 토막**: 마디가 도드라진 푸른 줄기 · 속 빈 벤 면 · 잎 몇 장."""
    random.seed(1822)
    for (y, z, L, rz) in ((-0.22, 0.12, 2.0, 0.0), (0.20, 0.12, 1.8, 0.06), (0.0, 0.34, 1.9, -0.04)):
        cyl(0.12, L, (0.0, y, z), rot=(0, math.radians(90), rz), mat=M['h_bamboo'], verts=14)
        for k in range(-2, 3):                                                                               # 마디
            cyl(0.128, 0.05, (k * 0.42 + 0.1, y, z), rot=(0, math.radians(90), rz), mat=M['h_bambnode'], verts=14)
        cyl(0.11, 0.02, (L / 2 + 0.005, y, z), rot=(0, math.radians(90), rz), mat=M['h_bambcut'], verts=14)    # 벤 면
        cyl(0.06, 0.025, (L / 2 + 0.01, y, z), rot=(0, math.radians(90), rz), mat=M['scorch'], verts=12)       # 빈 속
    for (x, y, a) in ((-0.70, -0.10, 2.4), (-0.55, 0.10, 2.0), (-0.85, 0.05, 2.8)):
        o = ico(0.26, (x + math.cos(a) * 0.22, y + math.sin(a) * 0.22, 0.46), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.18, 0.04), smooth=True)
        o.rotation_euler = (0, math.radians(-10), a)


def m_beeswax():
    """밀랍(`beeswax` — 숲 갈래 · 벌집을 녹여 거른 것) — 둥글게 굳힌 **밀랍 떡** 둘을 어긋나게 포갰다 · 깨진 조각 하나."""
    random.seed(1823)
    cyl(0.62, 0.20, (0.0, 0.0, 0.10), mat=M['h_wax'], verts=36)
    cyl(0.50, 0.18, (0.16, 0.12, 0.29), mat=M['h_wax'], verts=36)
    _ring(0.60, 0.035, (0.0, 0.0, 0.195), M['h_wax'], maj=40)                                                 # 굳으며 부푼 가장자리
    o = ico(0.20, (0.58, -0.54, 0.08), subdiv=1, mat=M['h_wax'], scale=(1.4, 1.0, 0.5), jitter=0.2)


def m_birch_sap():
    """자작나무 수액(`birch_sap` — 숲 갈래 채집물) — 흰 **자작나무 껍질 그릇**에 받은 맑은 수액 · 껍질 귀를 접어 꿰맸다."""
    random.seed(1824)
    cyl(0.52, 0.62, (0, 0, 0.31), mat=M['h_birchbark'], verts=24)
    cyl(0.49, 0.02, (0, 0, 0.625), mat=M['h_sap'], verts=24)                                                  # 수액 면
    _ring(0.52, 0.04, (0, 0, 0.62), M['h_birchbark'])
    for sgn in (-1, 1):                                                                                      # 접은 귀
        box(0.10, 0.30, 0.50, (sgn * 0.52, 0.0, 0.34), rot=(0, sgn * 0.12, 0), mat=M['h_birchbark'])
    for i in range(5):                                                                                        # 꿰맨 실
        cyl(0.012, 0.18, (0.36, -0.36 + i * 0.03, 0.12 + i * 0.10), rot=(0, 0, math.radians(45)), mat=M['cord'], verts=5)
    for (x, y) in ((0.64, -0.50), (0.52, -0.66)):                                                             # 떨어진 방울
        ico(0.05, (x, y, 0.04), subdiv=2, mat=M['h_sap'], scale=(1.0, 1.0, 0.5), smooth=True)


def m_chamomile():
    """카모마일(`chamomile` — 숲 갈래 채집물) — 흰 꽃잎 · 노란 꽃술의 **꽃 한 줌**을 줄기째 묶었다."""
    random.seed(1825)
    for i in range(7):                                                                                        # 줄기
        cyl(0.018, 1.30, (-0.25, (i - 3) * 0.035, 0.08), rot=(0, math.radians(90), (i - 3) * 0.06), mat=M['h_stem'], verts=6)
    cyl(0.07, 0.10, (-0.50, 0.0, 0.08), rot=(0, math.radians(90), 0), mat=M['cord'], verts=10)
    for i, (x, y, z) in enumerate(((0.46, -0.30, 0.20), (0.62, 0.02, 0.26), (0.44, 0.30, 0.22), (0.28, -0.04, 0.34), (0.76, -0.26, 0.14), (0.70, 0.30, 0.16), (0.20, 0.30, 0.18))):
        ico(0.075, (x, y, z + 0.03), subdiv=2, mat=M['h_disc'], scale=(1.0, 1.0, 0.7), smooth=True)          # 꽃술
        for k in range(12):                                                                                   # 꽃잎
            a = k * math.tau / 12 + i
            o = ico(0.07, (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, z), subdiv=1, mat=M['h_petal'], scale=(1.6, 0.55, 0.15))
            o.rotation_euler = (0, 0, a)


def m_cork():
    """코르크(`cork` — 숲 갈래 · 코르크참나무 겉껍질) — 벗겨 낸 **두꺼운 껍질 판** 둘(숭숭한 결 · 속은 붉은 갈색)과 그 판을 뚫어 낸 **마개** 셋."""
    random.seed(1826)
    for (x, y, z, rz, w) in ((0.0, -0.10, 0.12, 0.2, 0.62), (-0.10, 0.30, 0.20, -0.25, 0.56)):
        o = cyl(0.62, 1.40, (x, y, z), rot=(0, math.radians(90), rz), mat=M['h_cork'], verts=28)
        o.scale = (0.22, w / 0.62 * 0.6, 1.0)
        o = cyl(0.60, 1.42, (x, y, z + 0.04), rot=(0, math.radians(90), rz), mat=M['h_dakout'], verts=28)    # 속면(붉은 갈색)
        o.scale = (0.10, w / 0.62 * 0.55, 1.0)
    for (x, y, rz) in ((0.52, -0.58, 0.3), (0.80, -0.30, -0.4), (0.20, -0.72, 1.2)):                        # 마개
        cyl(0.13, 0.30, (x, y, 0.13), rot=(0, math.radians(90), rz), mat=M['h_cork'], verts=16)


def m_fruit_berries():
    """산딸기(`fruit_berries` — 숲 갈래 채집물) — 잔 알갱이가 뭉친 **붉은 산딸기** 여섯 · 잎 둘. 매끈한 베리 알(`berry`)과 결로 갈린다."""
    random.seed(1827)
    for (x, y) in ((-0.30, -0.35), (0.40, -0.10), (-0.10, 0.10), (0.15, 0.48), (-0.55, 0.30), (0.55, 0.42)):
        z = 0.22
        ico(0.18, (x, y, z), subdiv=2, mat=M['h_raspberry'], scale=(1.0, 1.0, 1.1), smooth=True)
        for k in range(22):
            u = random.uniform(-1, 1); a = random.uniform(0, math.tau); rr = math.sqrt(1 - u * u)
            ico(0.065, (x + rr * math.cos(a) * 0.18, y + rr * math.sin(a) * 0.18, z + u * 0.20), subdiv=1, mat=M['h_raspberry'], smooth=True)
    for (x, y, a) in ((0.05, -0.62, 0.3), (-0.70, -0.20, 2.0)):
        o = ico(0.30, (x, y, 0.05), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.55, 0.06), smooth=True)
        o.rotation_euler = (0, 0, a)


def _root(x, y, z, L, r, ang, mat, legs=2, hair=8, seed=0):
    """뿌리(삼) — 통통한 몸 · 갈라진 다리 · 잔뿌리. `ang` 은 머리(줄기 쪽) 방향."""
    random.seed(seed)
    ca, sa = math.cos(ang), math.sin(ang)
    o = ico(r, (x, y, z), subdiv=2, mat=mat, scale=(L / r * 0.5, 1.0, 0.9), jitter=0.08, smooth=True); o.rotation_euler = (0, 0, ang)
    for k in range(legs):                                                                                     # 다리
        b = ang + math.pi + (k - (legs - 1) / 2) * 0.55
        lx, ly = x - ca * L * 0.40 + math.cos(b) * L * 0.30, y - sa * L * 0.40 + math.sin(b) * L * 0.30
        o = ico(r * 0.55, (lx, ly, z - r * 0.15), subdiv=2, mat=mat, scale=(L / r * 0.45, 0.8, 0.7), jitter=0.10, smooth=True)
        o.rotation_euler = (0, 0, b)
    for k in range(hair):                                                                                     # 잔뿌리
        b = ang + math.pi + random.uniform(-1.2, 1.2)
        d0 = random.uniform(0.2, 0.7) * L
        cyl(0.012, L * 0.5, (x - ca * d0 * 0.5 + math.cos(b) * L * 0.3, y - sa * d0 * 0.5 + math.sin(b) * L * 0.3, z - r * 0.3),
            rot=(0, math.radians(90), b), mat=mat, verts=5)
    for k in range(4):                                                                                        # 뇌두(나이 마디)
        ico(r * 0.30, (x + ca * (L * 0.5 + k * r * 0.25), y + sa * (L * 0.5 + k * r * 0.25), z + r * 0.1), subdiv=1, mat=mat, scale=(0.8, 1.0, 0.8))


def _palm5(x, y, z, s, mat, rz=0.0):
    """다섯 잎(손바닥꼴 겹잎) — 삼(蔘) 잎."""
    for k in range(5):
        a = rz + k * math.tau / 5
        o = ico(0.20 * s, (x + math.cos(a) * 0.20 * s, y + math.sin(a) * 0.20 * s, z), subdiv=2, mat=mat, scale=(1.0, 0.42, 0.06), smooth=True)
        o.rotation_euler = (0, 0, a)


def m_ginseng():
    """인삼(`ginseng` — 숲 갈래 · 기른 삼) — **통통한 흰 뿌리** 둘(갈라진 다리 · 잔뿌리 · 뇌두)과 다섯 잎 한 줄기."""
    _root(-0.05, -0.18, 0.18, 1.10, 0.20, math.radians(160), M['h_ginseng'], legs=2, hair=7, seed=1828)
    _root(0.20, 0.28, 0.16, 0.90, 0.16, math.radians(200), M['h_ginseng'], legs=2, hair=5, seed=18281)
    cyl(0.02, 0.60, (-0.80, 0.0, 0.30), rot=(0, math.radians(60), math.radians(180)), mat=M['h_stem'], verts=6)
    _palm5(-1.02, 0.0, 0.46, 1.0, M['h_leaf'], 0.3)


def m_wild_ginseng():
    """산삼(`wild_ginseng` — 숲 갈래 · 산에서 캔 삼) — **가늘고 긴 묵은 뿌리**(긴 잔뿌리 · 마디진 뇌두)와 줄기 끝의 **붉은 열매** 한 송이 · 다섯 잎."""
    _root(0.05, 0.0, 0.12, 1.30, 0.11, math.radians(170), M['h_wildgin'], legs=3, hair=14, seed=1829)
    cyl(0.018, 0.80, (-0.88, 0.02, 0.36), rot=(0, math.radians(55), math.radians(175)), mat=M['h_stem'], verts=6)
    _palm5(-1.10, 0.10, 0.52, 0.9, M['h_leaf'], 0.0)
    for k in range(9):                                                                                        # 붉은 열매 송이
        a = k * 2.399; d = 0.05 + (k % 3) * 0.035
        ico(0.055, (-1.18 + math.cos(a) * d, -0.06 + math.sin(a) * d, 0.78 + (k % 2) * 0.03), subdiv=2, mat=M['h_redberry'], smooth=True)


def m_latex():
    """라텍스(`latex` — 숲 갈래 · 고무나무 유액) — 칼금 낸 나무껍질에서 흘러내린 **흰 유액**을 그릇에 받았다."""
    random.seed(1831)
    box(0.30, 0.90, 1.10, (-0.30, 0.10, 0.55), rot=(0, 0, math.radians(-8)), mat=M['bark2'])                    # 껍질 조각(세웠다)
    for k in range(3):                                                                                        # 칼금
        box(0.04, 0.70, 0.05, (-0.14, 0.10, 0.50 + k * 0.22), rot=(math.radians(20), 0, math.radians(-8)), mat=M['h_latex'])
    cyl(0.03, 0.40, (-0.12, -0.08, 0.30), mat=M['h_latex'], verts=8)                                         # 흘러내림
    _bowl(0.40, 0.30, M['h_bowl'])
    o = OBJS[-2]; o.location.x += 0.10; o.location.y -= 0.30
    o = OBJS[-1]; o.location.x += 0.10; o.location.y -= 0.30
    cyl(0.37, 0.03, (0.10, -0.30, 0.31), mat=M['h_latex'], verts=24)                                          # 받은 유액


def m_rubber():
    """고무(`rubber` — 숲 갈래 · 유액을 굳힌 것) — 검갈색 **고무 공** 둘과 말아 굳힌 고무 판."""
    random.seed(1832)
    ico(0.40, (0.0, 0.0, 0.40), subdiv=3, mat=M['h_rubber'], smooth=True)
    ico(0.28, (0.62, -0.32, 0.28), subdiv=3, mat=M['h_rubber'], smooth=True)
    o = cyl(0.20, 0.80, (-0.50, -0.42, 0.20), rot=(0, math.radians(90), math.radians(30)), mat=M['h_rubber'], verts=20)
    _ring(0.20, 0.02, (-0.16, -0.22, 0.20), M['h_latex'], rot=(0, math.radians(90), math.radians(30)))      # 말린 가장자리(흰 유액 자국)


def m_nuts():
    """견과류(`nuts` — 숲 갈래 채집물) — **섞인 견과 한 무더기**: 골진 호두 · 반들한 개암 · 길쭉한 아몬드. 밤 · 도토리(제 그림)와 무더기로 갈린다."""
    random.seed(1833)
    for (x, y) in ((0.0, 0.0), (0.38, -0.26), (-0.36, 0.30)):                                                  # 호두
        ico(0.24, (x, y, 0.24), subdiv=3, mat=M['h_walnut'], scale=(1.0, 0.92, 0.92), jitter=0.04, smooth=True)
    for (x, y) in ((-0.40, -0.26), (0.30, 0.36), (0.62, 0.10), (-0.10, -0.50)):                                # 개암
        ico(0.15, (x, y, 0.15), subdiv=2, mat=M['h_hazel'], smooth=True)
        ico(0.06, (x + 0.06, y - 0.06, 0.27), subdiv=1, mat=M['h_walnut'], scale=(1.4, 1.4, 0.5))
    for (x, y, a) in ((0.12, 0.55, 0.4), (-0.62, 0.0, 1.8), (0.58, -0.48, -0.6), (0.20, -0.40, 2.6)):         # 아몬드
        o = ico(0.15, (x, y, 0.09), subdiv=2, mat=M['h_almond'], scale=(1.5, 0.95, 0.55), smooth=True)
        o.rotation_euler = (0, 0, a)


def m_paper_mulberry():
    """닥나무 껍질(`paper_mulberry` — 숲 갈래 · 종이 감) — 벗겨 낸 **흰 속껍질 띠** 다발을 묶었다 · 몇 가닥엔 갈색 겉껍질이 남았다."""
    random.seed(1834)
    for i in range(9):
        dy = (i - 4) * 0.075; dz = 0.05 + (i % 3) * 0.035
        mat = M['h_dakout'] if i in (1, 6) else M['h_dakin']
        o = box(2.10, 0.09, 0.02, (0.0, dy, dz), rot=(0, 0, dy * 0.25), mat=mat)
    for i in range(5):                                                                                        # 끝이 풀려 휜 띠
        a = (i - 2) * 0.25
        box(0.50, 0.08, 0.02, (1.18 + math.cos(a) * 0.1, (i - 2) * 0.10 + math.sin(a) * 0.15, 0.06), rot=(0, math.radians(-8), a), mat=M['h_dakin'])
    for x in (-0.50, 0.30):                                                                                   # 묶은 끈
        cyl(0.20, 0.06, (x, 0.0, 0.08), rot=(0, math.radians(90), 0), mat=M['cord'], verts=12)
        o = OBJS[-1]; o.scale = (0.45, 1.0, 1.0)


def m_truffle():
    """송로버섯(`truffle` — 숲 갈래 · 땅속 버섯) — **오돌토돌한 검은 덩이** 하나와 반을 갈라 **대리석 무늬 속살**을 위로 둔 반쪽."""
    random.seed(1835)
    ico(0.40, (-0.36, 0.22, 0.36), subdiv=3, mat=M['h_truffle'], scale=(1.1, 1.0, 0.92), jitter=0.06, smooth=True)
    _half(0.34, -0.24, 0.40, (1.1, 1.0, 0.8), M['h_truffle'], M['h_trufflein'], k=0.92)


def m_coal():
    """석탄(`coal` — 광물 갈래) — 소쿠리에 담은 윤 나는 **검은 덩이**(모난 조각이 수북하다). 흑요석(덩이 하나 · 유리 면) · 숯(나뭇결)과 갈린다."""
    random.seed(1836)
    cone(0.50, 0.70, 0.44, (0, 0, 0.22), mat=M['g_basket'], verts=32)                                     # 소쿠리(곡식과 같은 그릇)
    _ring(0.69, 0.055, (0, 0, 0.44), M['g_basket'])
    for i in range(18):
        a = i * 2.399; d = math.sqrt(i / 18.0) * 0.58
        ico(random.uniform(0.15, 0.22), (math.cos(a) * d, math.sin(a) * d, 0.46 + (0.58 - d) * 0.40), subdiv=1, mat=M['h_coal'],
            scale=(1.2, 1.0, 0.85), jitter=0.30, smooth=False)
    for (x, y) in ((0.52, -0.70), (0.80, -0.44)):                                                           # 흘린 덩이
        ico(0.12, (x, y, 0.08), subdiv=1, mat=M['h_coal'], jitter=0.3)


def m_mercury():
    """수은(`mercury` — 광물 갈래) — 돌 확에 고인 **거울 같은 은빛 물** · 옆에 굴러 나온 동그란 방울 셋."""
    random.seed(1837)
    cone(0.60, 0.70, 0.26, (0, 0, 0.13), mat=M['ground'], verts=28)                                          # 돌 확
    _ring(0.66, 0.06, (0, 0, 0.26), M['ground'])
    o = ico(0.56, (0, 0, 0.25), subdiv=3, mat=M['h_mercury'], scale=(1.0, 1.0, 0.10), smooth=True)          # 고인 수은(가운데가 부푼다)
    for (x, y, r) in ((0.72, -0.52, 0.10), (0.48, -0.74, 0.07), (0.90, -0.30, 0.055)):
        ico(r, (x, y, r * 0.8), subdiv=3, mat=M['h_mercury'], scale=(1.0, 1.0, 0.8), smooth=True)


def m_nitrate():
    """초석(`nitrate` — 광물 갈래 · 흙벽에서 긁어 모은 흰 결정) — 덩이 위에 돋은 **흰 바늘 결정** 다발."""
    random.seed(1838)
    ico(0.44, (0, 0, 0.18), subdiv=2, mat=M['h_sodaash'], scale=(1.3, 1.1, 0.45), jitter=0.20)
    for i in range(22):
        a = random.uniform(0, math.tau); d = random.uniform(0.0, 0.40); L = random.uniform(0.30, 0.62)
        tilt = d * 1.4
        cyl(0.035, L, (math.cos(a) * d, math.sin(a) * d, 0.26 + L * 0.4), rot=(math.sin(a) * -tilt, math.cos(a) * tilt, 0),
            mat=M['h_nitrate'], verts=6, smooth=False)


def m_sand():
    """모래(`sand` — 광물 갈래) — 부어 놓은 **모래 둔덕** · 흘러내린 자락과 섞인 잔돌 몇."""
    random.seed(1839)
    o = cone(0.80, 0.10, 0.52, (0, 0, 0.26), mat=M['h_sand'], verts=40)
    ico(0.12, (0, 0, 0.50), subdiv=2, mat=M['h_sand'], scale=(1.0, 1.0, 0.4), smooth=True)
    ico(0.52, (0.50, -0.42, 0.02), subdiv=3, mat=M['h_sand'], scale=(1.2, 0.8, 0.12), smooth=True)          # 흘러내린 자락
    for (x, y) in ((0.70, -0.62), (-0.60, -0.40), (0.30, 0.66)):
        ico(0.06, (x, y, 0.05), subdiv=1, mat=M['river'], jitter=0.2)


def m_soda_ash():
    """소다재(`soda_ash` — 광물 갈래 · 풀을 태워 얻는 흰 잿가루) — 삼베 **자루**에 담은 흰 가루가 고봉이고 앞에 흘렀다."""
    random.seed(1840)
    o = ico(0.56, (0, 0, 0.42), subdiv=3, mat=M['h_burlap'], scale=(1.0, 1.0, 0.85), jitter=0.04, smooth=True)   # 자루 몸
    _ring(0.50, 0.07, (0, 0, 0.80), M['h_burlap'])                                                            # 접어 내린 아가리
    ico(0.48, (0, 0, 0.80), subdiv=3, mat=M['h_sodaash'], scale=(1.0, 1.0, 0.40), smooth=True)              # 흰 가루 고봉
    ico(0.34, (0.48, -0.56, 0.02), subdiv=3, mat=M['h_sodaash'], scale=(1.2, 0.8, 0.14), smooth=True)        # 흘린 가루


def _mound(n, R, H, z0, seed, put):
    """작은 것 n 개를 둔덕으로 쌓는다(§9 — 작은 것은 개수로). `put(x, y, z, a)` 가 한 알을 놓는다."""
    random.seed(seed)
    for i in range(n):
        a = i * 2.399 + random.uniform(-0.2, 0.2); d = math.sqrt((i + 0.5) / n) * R
        put(math.cos(a) * d, math.sin(a) * d, z0 + (1 - d / R) * H, random.uniform(0, math.tau))


def m_black_pepper():
    """후추(`black_pepper` — 향신료 갈래) — 쭈글한 **검은 알 무더기**와 덩굴에서 딴 알송이(푸른 알 · 붉게 익은 알) · 하트꼴 잎 둘."""
    _mound(34, 0.62, 0.36, 0.08, 1841, lambda x, y, z, a: ico(0.085, (x, y, z), subdiv=2, mat=M['h_pepper'], jitter=0.08, smooth=True))
    cyl(0.02, 0.90, (0.60, -0.50, 0.12), rot=(0, math.radians(90), math.radians(30)), mat=M['h_stem'], verts=6)
    for k in range(12):
        t = k / 11.0
        for sgn in (-1, 1):
            ico(0.065, (0.26 + t * 0.74 + sgn * 0.03, -0.70 + t * 0.42 - sgn * 0.05, 0.17), subdiv=2, mat=(M['h_redberry'] if k % 3 == 0 else M['h_pod']), smooth=True)
    for (x, y, a) in ((0.98, -0.12, 0.9), (0.70, -0.04, 2.0)):
        o = ico(0.26, (x, y, 0.10), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.75, 0.05), smooth=True); o.rotation_euler = (0, 0, a)


def m_cumin():
    """큐민(`cumin` — 향신료 갈래 · 씨) — 삼베 주머니에 담은 **줄진 회갈색 씨** 고봉 · 앞에 흘린 씨 몇."""
    random.seed(1842)
    ico(0.44, (0, 0, 0.30), subdiv=3, mat=M['h_burlap'], scale=(1.0, 1.0, 0.72), jitter=0.04, smooth=True)
    _ring(0.38, 0.06, (0, 0, 0.58), M['h_burlap'])
    _mound(46, 0.38, 0.20, 0.58, 18421, lambda x, y, z, a: _seedlet(x, y, z, a, 0.05, M['h_cumin']))
    for k in range(8):
        a = random.uniform(-1, 1)
        _seedlet(0.50 + random.uniform(-0.2, 0.2), -0.52 + random.uniform(-0.15, 0.15), 0.02, a, 0.05, M['h_cumin'])


def _seedlet(x, y, z, a, r, mat):
    """길쭉한 씨 한 알."""
    o = ico(r, (x, y, z), subdiv=1, mat=mat, scale=(2.2, 0.9, 0.8), smooth=True)
    o.rotation_euler = (0, 0, a)


def m_cardamom():
    """카다멈(`cardamom` — 향신료 갈래 · 꼬투리) — 골진 **옅은 풀빛 꼬투리** 무더기 · 하나는 갈라 검은 씨가 보인다."""
    def pod(x, y, z, a):
        o = ico(0.12, (x, y, z), subdiv=2, mat=M['h_cardamom'], scale=(1.6, 1.0, 0.95), smooth=True); o.rotation_euler = (0, 0, a)
    _mound(16, 0.60, 0.30, 0.10, 1843, pod)
    o = ico(0.13, (0.66, -0.50, 0.08), subdiv=2, mat=M['h_cardamom'], scale=(1.6, 1.0, 0.5), smooth=True); o.rotation_euler = (0, 0, 0.5)
    for k in range(5):
        ico(0.04, (0.60 + k * 0.03, -0.50 + (k % 2) * 0.04, 0.14), subdiv=1, mat=M['h_pepper'])


def m_clove():
    """정향(`clove` — 향신료 갈래 · 말린 꽃봉오리) — **못 꼴 봉오리**(가는 꽃대 · 둥근 봉오리 · 네 꽃받침) 무더기."""
    def bud(x, y, z, a):
        ca, sa = math.cos(a), math.sin(a)
        cyl(0.03, 0.30, (x, y, z), rot=(0, math.radians(90), a), mat=M['h_clove'], verts=6)
        ico(0.055, (x + ca * 0.17, y + sa * 0.17, z), subdiv=2, mat=M['h_clove'], smooth=True)
        for k in range(4):
            b = k * math.pi / 2
            ico(0.03, (x + ca * 0.14 + math.cos(b) * 0.04, y + sa * 0.14 + math.sin(b) * 0.04, z + 0.02), subdiv=1, mat=M['h_clove'])
    _mound(22, 0.62, 0.30, 0.06, 1844, bud)


def m_nutmeg():
    """육두구(`nutmeg` — 향신료 갈래 · 씨) — 반 갈라진 노란 열매 속에 **새빨간 그물(씨옷)**에 싸인 씨 · 옆에 씨 둘."""
    random.seed(1845)
    for sgn in (-1, 1):                                                                                     # 갈라진 열매 두 쪽
        o = ico(0.42, (0.0, sgn * 0.30, 0.26), subdiv=3, mat=M['h_nutfruit'], scale=(1.0, 0.62, 0.62), smooth=True)
        o.rotation_euler = (sgn * 0.5, 0, 0)
    ico(0.26, (0.0, 0.0, 0.34), subdiv=3, mat=M['h_nutmeg'], scale=(1.15, 0.9, 0.9), smooth=True)          # 씨
    for k in range(9):                                                                                       # 씨옷 그물
        a = k * 0.7
        o = cyl(0.025, 0.42, (math.cos(a) * 0.12, math.sin(a) * 0.08, 0.40), rot=(math.radians(70), 0, a), mat=M['h_mace'], verts=6)
    for (x, y) in ((0.60, -0.46), (0.82, -0.12)):
        ico(0.18, (x, y, 0.16), subdiv=3, mat=M['h_nutmeg'], scale=(1.2, 0.9, 0.9), smooth=True)


def m_star_anise():
    """팔각(`star_anise` — 향신료 갈래) — 여덟 꼬투리가 **별꼴**로 벌어진 붉은 갈색 열매 다섯 · 꼬투리마다 윤 나는 씨."""
    random.seed(1846)
    for (x, y, z, rz) in ((0.0, 0.0, 0.16, 0.0), (0.62, -0.20, 0.06, 0.4), (-0.56, 0.22, 0.06, 0.9), (0.20, 0.60, 0.06, 0.2), (-0.20, -0.62, 0.06, 1.3)):
        for k in range(8):
            a = rz + k * math.pi / 4
            o = ico(0.12, (x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, z), subdiv=2, mat=M['h_anise'], scale=(1.5, 0.55, 0.55), smooth=True)
            o.rotation_euler = (0, 0, a)
            ico(0.035, (x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, z + 0.06), subdiv=1, mat=M['h_date'])
        ico(0.05, (x, y, z + 0.03), subdiv=1, mat=M['h_anise'])


def m_cinnamon():
    """계피(`cinnamon` — 향신료 갈래 · 나무껍질) — 말려 둘둘 감긴 **붉은 갈색 껍질 대롱** 다섯을 묶었다 · 끝에 감긴 결이 보인다."""
    random.seed(1847)
    for (y, z, L) in ((-0.22, 0.12, 1.8), (0.0, 0.12, 1.9), (0.22, 0.12, 1.75), (-0.11, 0.32, 1.85), (0.11, 0.32, 1.8)):
        cyl(0.11, L, (0.0, y, z), rot=(0, math.radians(90), 0.03), mat=M['h_cinnamon'], verts=14)
        _ring(0.07, 0.02, (L / 2 + 0.005, y, z), M['h_cinnamon'], rot=(0, math.radians(90), 0.03), maj=16, mnr=6)   # 감긴 결
        cyl(0.05, 0.02, (L / 2 + 0.012, y, z), rot=(0, math.radians(90), 0.03), mat=M['scorch'], verts=10)
    for x in (-0.45, 0.40):
        cyl(0.36, 0.05, (x, 0.0, 0.22), rot=(0, math.radians(90), 0), mat=M['cord'], verts=16)
        o = OBJS[-1]; o.scale = (0.55, 1.0, 1.0)


def m_vanilla():
    """바닐라(`vanilla` — 향신료 갈래 · 꼬투리) — 윤 나는 **흑갈색 긴 꼬투리** 열을 끈으로 묶었다 · 옆에 연노랑 바닐라 꽃 하나."""
    random.seed(1848)
    for i in range(10):
        dy = (i - 4.5) * 0.075; dz = 0.06 + (i % 2) * 0.05
        o = cyl(0.06, 2.10, (0.0, dy, dz), rot=(0, math.radians(90), dy * 0.4), mat=M['h_vanilla'], verts=8)
        o.scale = (0.7, 1.0, 1.0)
        ico(0.06, (1.06, dy + dy * 0.4, dz), subdiv=1, mat=M['h_vanilla'], scale=(1.6, 0.8, 0.6))           # 꼬부라진 끝
    cyl(0.30, 0.10, (-0.30, 0.0, 0.12), rot=(0, math.radians(90), 0), mat=M['cord'], verts=14)
    o = OBJS[-1]; o.scale = (0.5, 1.0, 1.0)
    for sgn in (-1, 1):                                                                                     # 늘어진 끈 끝
        box(0.36, 0.03, 0.02, (-0.46, sgn * 0.20, 0.05), rot=(0, 0, sgn * 0.6), mat=M['cord'])
    for k in range(5):                                                                                       # 바닐라 꽃(연노랑 다섯 잎 · 나팔 입술)
        a = k * 1.257
        o = ico(0.16, (0.42 + math.cos(a) * 0.16, -0.62 + math.sin(a) * 0.16, 0.10), subdiv=2, mat=M['h_frank'], scale=(1.5, 0.5, 0.10), smooth=True)
        o.rotation_euler = (0, 0, a)
    ico(0.09, (0.42, -0.62, 0.16), subdiv=2, mat=M['h_disc'], scale=(1.0, 1.0, 0.8), smooth=True)
    o = ico(0.24, (0.80, -0.56, 0.06), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.45, 0.05), smooth=True); o.rotation_euler = (0, 0, 0.3)


def m_saffron():
    """사프란(`saffron` — 향신료 갈래 · 꽃의 암술) — 연보라 **사프란 꽃** 둘(가운데 붉은 암술 셋)과 따 모은 **붉은 실** 한 줌."""
    random.seed(1849)
    for (x, y) in ((-0.30, 0.20), (0.24, 0.36)):
        for k in range(6):                                                                                   # 꽃잎(컵꼴)
            a = k * math.pi / 3
            o = ico(0.16, (x + math.cos(a) * 0.10, y + math.sin(a) * 0.10, 0.20), subdiv=2, mat=M['h_crocus'], scale=(0.6, 0.45, 1.3), smooth=True)
            o.rotation_euler = (math.sin(a) * 0.45, -math.cos(a) * 0.45, a)
        for k in range(3):
            a = k * 2.1
            cyl(0.018, 0.30, (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, 0.36), rot=(math.sin(a) * 0.5, -math.cos(a) * 0.5, 0), mat=M['h_saffron'], verts=5)
        cyl(0.03, 0.16, (x, y, 0.06), mat=M['h_stem'], verts=6)
    for k in range(40):                                                                                      # 붉은 실 한 줌
        a = random.uniform(0, math.tau); d = random.uniform(0, 0.30)
        cyl(0.016, random.uniform(0.18, 0.30), (0.40 + math.cos(a) * d, -0.42 + math.sin(a) * d * 0.7, 0.03 + random.uniform(0, 0.08)),
            rot=(0, math.radians(90), random.uniform(0, math.tau)), mat=M['h_saffron'], verts=5)


def m_paprika():
    """파프리카(`paprika` — 향신료 갈래) — 윤 나는 **붉은 단고추** 하나(꼭지 · 골진 몸)와 빻은 **붉은 가루** 둔덕."""
    random.seed(1850)
    for k in range(4):                                                                                       # 골진 몸 넷
        a = k * math.pi / 2
        ico(0.30, (-0.20 + math.cos(a) * 0.12, 0.10 + math.sin(a) * 0.12, 0.34), subdiv=3, mat=M['h_paprika'], scale=(0.85, 0.85, 1.15), smooth=True)
    cyl(0.05, 0.20, (-0.20, 0.10, 0.74), mat=M['h_chiligreen'], verts=8)                                     # 꼭지
    ico(0.12, (-0.20, 0.10, 0.66), subdiv=2, mat=M['h_chiligreen'], scale=(1.0, 1.0, 0.4), smooth=True)
    o = cone(0.44, 0.06, 0.30, (0.42, -0.42, 0.15), mat=M['h_redpowder'], verts=32)                        # 가루 둔덕
    ico(0.07, (0.42, -0.42, 0.29), subdiv=2, mat=M['h_redpowder'], scale=(1.0, 1.0, 0.4), smooth=True)


def m_turmeric():
    """강황(`turmeric` — 향신료 갈래 · 뿌리줄기) — 마디진 **뿌리줄기** 손가락 다발 · 하나는 잘라 샛노란 속이 보이고 앞에 노란 가루."""
    random.seed(1851)
    ico(0.20, (-0.20, 0.10, 0.18), subdiv=2, mat=M['h_turmskin'], scale=(1.6, 1.0, 0.9), jitter=0.06, smooth=True)
    for k in range(5):                                                                                       # 손가락
        a = -0.9 + k * 0.45
        o = ico(0.11, (-0.20 + math.cos(a) * 0.40, 0.10 + math.sin(a) * 0.40, 0.14), subdiv=2, mat=M['h_turmskin'],
                scale=(2.4, 1.0, 1.0), jitter=0.06, smooth=True)
        o.rotation_euler = (0, 0, a)
        for m in range(3):
            _ring(0.11, 0.012, (-0.20 + math.cos(a) * (0.24 + m * 0.12), 0.10 + math.sin(a) * (0.24 + m * 0.12), 0.14), M['h_cassava'],
                  rot=(0, math.radians(90), a), maj=12, mnr=4)
    cyl(0.11, 0.02, (0.64, 0.30, 0.14), rot=(0, math.radians(90), 0.3), mat=M['h_turmeric'], verts=14)        # 자른 면
    cone(0.36, 0.05, 0.22, (0.40, -0.46, 0.11), mat=M['h_turmeric'], verts=28)                               # 노란 가루


def m_frankincense():
    """유향(`frankincense` — 향신료 갈래 · 나무 진) — 우윳빛 **노란 진 방울** 무더기(눈물꼴로 굳었다)."""
    def tear(x, y, z, a):
        o = ico(0.12, (x, y, z), subdiv=2, mat=M['h_frank'], scale=(1.3, 1.0, 0.9), jitter=0.14, smooth=True); o.rotation_euler = (0, 0, a)
    _mound(22, 0.62, 0.34, 0.08, 1852, tear)


def m_myrrh():
    """몰약(`myrrh` — 향신료 갈래 · 나무 진) — 모나고 윤 나는 **붉은 갈색 진 덩이** 무더기."""
    def lump(x, y, z, a):
        o = ico(0.15, (x, y, z), subdiv=1, mat=M['h_myrrh'], scale=(1.3, 1.0, 0.8), jitter=0.28, smooth=False); o.rotation_euler = (0, 0, a)
    _mound(14, 0.60, 0.30, 0.10, 1853, lump)


def m_musk():
    """사향(`musk` — 향신료 갈래 · 사향노루 향주머니) — 털 덮인 둥근 **향주머니** 둘(가운데 구멍) · 꺼낸 검은 사향 알갱이."""
    random.seed(1854)
    for (x, y, r) in ((-0.18, 0.12, 0.40), (0.42, -0.24, 0.28)):
        ico(r, (x, y, r * 0.7), subdiv=3, mat=M['g_furbrn'], scale=(1.1, 1.0, 0.72), jitter=0.04, smooth=True)
        ico(r * 0.35, (x, y, r * 1.18), subdiv=2, mat=M['h_wildgin'], scale=(1.0, 1.0, 0.25), smooth=True)   # 털 없는 가운데
        ico(r * 0.10, (x, y, r * 1.24), subdiv=1, mat=M['scorch'])
        for k in range(14):                                                                                  # 털
            a = k * 0.449; u = 0.75
            cyl(0.012, r * 0.30, (x + math.cos(a) * r * u, y + math.sin(a) * r * u, r * 0.95), rot=(math.sin(a) * 0.8, -math.cos(a) * 0.8, 0), mat=M['g_furbrn'], verts=4)
    for k in range(9):
        ico(0.045, (0.66 + random.uniform(-0.12, 0.12), 0.40 + random.uniform(-0.10, 0.10), 0.04), subdiv=1, mat=M['h_pepper'], jitter=0.3)


def m_apple():
    """사과(`apple` — 농산물 갈래 · 열매) — 붉은 **사과** 하나(꼭지 · 잎)와 반으로 가른 쪽(흰 속살 · 씨)."""
    random.seed(1855)
    ico(0.44, (-0.18, 0.10, 0.42), subdiv=3, mat=M['h_apple'], scale=(1.0, 1.0, 0.92), smooth=True)
    ico(0.30, (-0.10, -0.06, 0.40), subdiv=3, mat=M['h_appley'], scale=(1.0, 1.0, 1.0), smooth=True)        # 노란 볼
    cyl(0.025, 0.20, (-0.18, 0.10, 0.88), rot=(0.3, 0, 0), mat=M['h_cassava'], verts=6)
    o = ico(0.18, (-0.05, 0.18, 0.86), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.45, 0.06), smooth=True); o.rotation_euler = (0, -0.4, 0.6)
    _half(0.50, -0.40, 0.36, (1.0, 1.0, 0.85), M['h_apple'], M['h_appleflesh'])
    for k in range(5):                                                                                       # 씨방 별꼴 · 씨
        a = k * 1.257
        o = ico(0.035, (0.50 + math.cos(a) * 0.08, -0.40 + math.sin(a) * 0.08, 0.015), subdiv=1, mat=M['h_cocoabean'], scale=(1.6, 1.0, 0.5)); o.rotation_euler = (0, 0, a)


def m_banana():
    """바나나(`banana` — 농산물 갈래 · 열매) — 한 꼭지에 달린 **노란 바나나** 다섯(휜 몸 · 검은 끝)."""
    random.seed(1856)
    cyl(0.07, 0.30, (-0.70, 0.0, 0.30), rot=(0, math.radians(60), 0), mat=M['h_cassava'], verts=8)          # 꼭지
    for i in range(5):
        dy = (i - 2) * 0.17
        for j in range(8):                                                                                   # 휜 몸(마디)
            t = j / 7.0
            x = -0.55 + t * 1.30
            z = 0.22 + math.sin(t * math.pi) * 0.22 + (i % 2) * 0.08
            o = ico(0.11 - abs(t - 0.45) * 0.06, (x, dy * (1 + t * 0.4), z), subdiv=2, mat=M['h_banana'], scale=(1.5, 1.0, 1.0), smooth=True)
            o.rotation_euler = (0, -math.cos(t * math.pi) * 0.5, dy * 0.4)
        ico(0.04, (0.78, dy * 1.4, 0.24 + (i % 2) * 0.08), subdiv=1, mat=M['h_cassava'])


def m_cassava():
    """카사바(`cassava` — 농산물 갈래 · 덩이뿌리) — 길쭉하고 끝이 가는 **갈색 덩이뿌리** 셋 · 하나는 잘라 흰 속이 보인다."""
    random.seed(1857)
    for (y, z, L, a) in ((-0.24, 0.16, 1.7, 0.10), (0.18, 0.16, 1.5, -0.12), (-0.02, 0.38, 1.6, 0.02)):
        for j in range(7):
            t = j / 6.0
            r = 0.17 * (1 - abs(t - 0.4) * 1.1) + 0.03
            ico(r, (-L / 2 + t * L, y + math.sin(a) * t, z), subdiv=2, mat=M['h_cassava'], scale=(1.4, 1.0, 1.0), jitter=0.04, smooth=True)
    cyl(0.17, 0.02, (-0.05, -0.24, 0.16), rot=(0, math.radians(90), 0.1), mat=M['h_whiteflesh'], verts=16)   # 자른 면
    _ring(0.16, 0.02, (-0.045, -0.24, 0.16), M['h_cassava'], rot=(0, math.radians(90), 0.1), maj=18, mnr=5)


def m_chickpea():
    """병아리콩(`chickpea` — 농산물 갈래 · 콩) — 부리 달린 **누런 콩** 무더기와 부푼 푸른 꼬투리 둘."""
    def pea(x, y, z, a):
        ico(0.10, (x, y, z), subdiv=2, mat=M['h_chickpea'], jitter=0.06, smooth=True)
        ico(0.03, (x + math.cos(a) * 0.09, y + math.sin(a) * 0.09, z + 0.03), subdiv=1, mat=M['h_chickpea'])
    _mound(26, 0.60, 0.30, 0.08, 1858, pea)
    for (x, y, a) in ((0.70, -0.30, 0.5), (0.50, -0.62, -0.3)):
        o = ico(0.16, (x, y, 0.10), subdiv=2, mat=M['h_pod'], scale=(1.5, 1.0, 0.85), smooth=True); o.rotation_euler = (0, 0, a)


def m_chili():
    """고추(`chili` — 농산물 갈래) — 가늘고 휜 **붉은 고추**와 풋고추 다섯(푸른 꼭지)이 부채꼴로 놓였다."""
    random.seed(1859)
    for i in range(5):
        a = -0.7 + i * 0.35
        mat = M['h_chiligreen'] if i in (1, 3) else M['h_paprika']
        n = 16
        for j in range(n):
            t = j / (n - 1.0)
            d = 0.15 + t * 1.10
            curl = t * t * 0.35 * (1 if i % 2 else -1)
            o = ico(0.11 * (1 - t * 0.78) + 0.018, (math.cos(a + curl) * d - 0.4, math.sin(a + curl) * d, 0.12), subdiv=2, mat=mat,
                    scale=(1.6, 1.0, 1.0), smooth=True)
            o.rotation_euler = (0, 0, a + curl)
        cyl(0.03, 0.20, (math.cos(a) * 0.05 - 0.4, math.sin(a) * 0.05, 0.14), rot=(0, math.radians(90), a), mat=M['h_chiligreen'], verts=6)
        ico(0.07, (math.cos(a) * 0.13 - 0.4, math.sin(a) * 0.13, 0.13), subdiv=2, mat=M['h_chiligreen'], scale=(0.8, 1.2, 1.2), smooth=True)


def m_cocoa():
    """카카오(`cocoa` — 농산물 갈래) — 골진 **주황 꼬투리** 하나와 반으로 가른 쪽(흰 과육에 줄지어 박힌 콩) · 꺼낸 콩 몇."""
    random.seed(1860)
    o = ico(0.32, (-0.30, 0.22, 0.32), subdiv=3, mat=M['h_cocoapod'], scale=(1.7, 1.0, 1.0), smooth=True); o.rotation_euler = (0, 0, 0.4)
    _half(0.36, -0.26, 0.32, (1.7, 1.0, 0.9), M['h_cocoapod'], M['h_whiteflesh'], rz=0.4, k=0.86)
    for k in range(9):
        t = (k - 4) / 4.0
        ico(0.06, (0.36 + math.cos(0.4) * t * 0.36 - math.sin(0.4) * ((k % 2) * 0.10 - 0.05), -0.26 + math.sin(0.4) * t * 0.36 + math.cos(0.4) * ((k % 2) * 0.10 - 0.05), 0.02),
            subdiv=2, mat=M['h_cocoabean'], scale=(1.4, 1.0, 0.7), smooth=True)
    for (x, y) in ((0.86, 0.12), (0.70, 0.34), (-0.74, -0.40)):
        ico(0.07, (x, y, 0.05), subdiv=2, mat=M['h_cocoabean'], scale=(1.4, 1.0, 0.7), smooth=True)


def m_coconut():
    """코코넛(`coconut` — 농산물 갈래) — 섬유 결 **갈색 열매** 하나와 반으로 깬 쪽(흰 과육 · 고인 물)."""
    random.seed(1861)
    ico(0.48, (-0.24, 0.18, 0.46), subdiv=3, mat=M['h_husk'], scale=(1.0, 1.0, 0.95), jitter=0.03, smooth=True)
    for k in range(3):                                                                                       # 세 눈
        a = k * 2.094
        ico(0.05, (-0.24 + math.cos(a) * 0.10, 0.18 + math.sin(a) * 0.10, 0.90), subdiv=1, mat=M['scorch'])
    _half(0.50, -0.36, 0.42, (1.0, 1.0, 0.9), M['h_husk'], M['h_whiteflesh'], k=0.90)
    cyl(0.26, 0.012, (0.50, -0.36, 0.012), mat=M['h_sap'], verts=28)                                         # 고인 물


def m_coffee():
    """커피(`coffee` — 농산물 갈래) — 가운데 골이 팬 **볶은 갈색 콩** 무더기와 붉게 익은 열매 달린 가지 하나."""
    def bean(x, y, z, a):
        o = ico(0.10, (x, y, z), subdiv=2, mat=M['h_coffee'], scale=(1.3, 1.0, 0.65), smooth=True); o.rotation_euler = (0, 0, a)
        o = box(0.20, 0.016, 0.02, (x, y, z + 0.06), rot=(0, 0, a), mat=M['scorch'])
    _mound(26, 0.58, 0.28, 0.06, 1862, bean)
    cyl(0.02, 0.90, (0.56, -0.50, 0.10), rot=(0, math.radians(90), 0.6), mat=M['h_cassava'], verts=6)
    for k in range(6):
        t = (k - 2.5) / 2.5
        ico(0.07, (0.56 + math.cos(0.6) * t * 0.36, -0.50 + math.sin(0.6) * t * 0.36 + 0.06 * (k % 2), 0.14), subdiv=2, mat=M['h_redberry'], smooth=True)
    for (a, sgn) in ((0.6, 1), (0.6, -1)):
        o = ico(0.20, (0.80 + 0.12 * sgn, -0.30 + 0.10, 0.10), subdiv=2, mat=M['h_leaf'], scale=(1.0, 0.42, 0.05), smooth=True); o.rotation_euler = (0, 0, a + sgn * 0.6)


def m_corn():
    """옥수수(`corn` — 농산물 갈래) — 껍질을 젖힌 **노란 옥수수** 두 자루(낟알 결)."""
    random.seed(1863)
    for (y, z, a) in ((-0.20, 0.20, 0.15), (0.24, 0.24, -0.10)):
        cyl(0.20, 1.20, (0.10, y, z), rot=(0, math.radians(90), a), mat=M['h_corn'], verts=16)
        ico(0.20, (0.70, y + math.sin(a) * 0.6, z), subdiv=2, mat=M['h_corn'], scale=(0.8, 1.0, 1.0), smooth=True)
        for k in range(4):                                                                                   # 젖힌 껍질
            b = k * math.pi / 2 + 0.4
            o = ico(0.30, (-0.62, y + math.cos(b) * 0.20, z + math.sin(b) * 0.20), subdiv=2, mat=M['h_cornhusk'], scale=(1.6, 0.60, 0.08), smooth=True)
            o.rotation_euler = (b, 0.2, a)
        cyl(0.05, 0.30, (-1.00, y - math.sin(a) * 0.4, z), rot=(0, math.radians(90), a), mat=M['h_cornhusk'], verts=8)


def m_cotton():
    """면화(`cotton` — 농산물 갈래) — 마른 가지 끝에 터진 **흰 목화솜** 셋(갈색 꽃받침)."""
    random.seed(1864)
    cyl(0.03, 1.20, (-0.10, 0.0, 0.14), rot=(0, math.radians(90), 0.2), mat=M['h_cassava'], verts=6)
    for (x, y, z) in ((0.40, -0.10, 0.32), (-0.10, 0.36, 0.30), (-0.40, -0.28, 0.26)):
        for k in range(4):                                                                                   # 꽃받침
            a = k * math.pi / 2 + 0.3
            o = ico(0.16, (x + math.cos(a) * 0.14, y + math.sin(a) * 0.14, z - 0.12), subdiv=1, mat=M['h_bract'], scale=(1.4, 0.6, 0.12)); o.rotation_euler = (0, 0, a)
        for k in range(4):                                                                                   # 솜 네 덩이
            a = k * math.pi / 2
            ico(0.16, (x + math.cos(a) * 0.10, y + math.sin(a) * 0.10, z), subdiv=2, mat=M['h_cotton'], jitter=0.12, smooth=True)
        ico(0.14, (x, y, z + 0.10), subdiv=2, mat=M['h_cotton'], jitter=0.12, smooth=True)


def m_dates():
    """대추야자(`dates` — 농산물 갈래 · 열매) — 가는 줄기에 달린 윤 나는 **적갈색 열매** 송이 · 떨어진 몇 알."""
    random.seed(1865)
    for k in range(4):
        a = -0.5 + k * 0.33
        cyl(0.012, 1.0, (math.cos(a) * 0.40 - 0.3, math.sin(a) * 0.40, 0.30), rot=(0, math.radians(84), a), mat=M['h_cornhusk'], verts=5)
        for j in range(4):
            t = 0.25 + j * 0.22
            o = ico(0.11, (-0.3 + math.cos(a) * (0.1 + t * 0.85), math.sin(a) * (0.1 + t * 0.85) + (j % 2) * 0.06, 0.30 - j * 0.02), subdiv=2,
                    mat=M['h_date'], scale=(1.5, 1.0, 1.0), smooth=True)
            o.rotation_euler = (0, 0.3, a)
    for (x, y, a) in ((0.40, -0.50, 0.3), (0.62, -0.34, 1.2)):
        o = ico(0.11, (x, y, 0.08), subdiv=2, mat=M['h_date'], scale=(1.5, 1.0, 1.0), smooth=True); o.rotation_euler = (0, 0, a)


def m_fig():
    """무화과(`fig` — 농산물 갈래 · 열매) — 검보라 **무화과** 둘(조롱박꼴)과 반으로 가른 쪽(붉은 씨 결 속)."""
    random.seed(1866)
    for (x, y) in ((-0.30, 0.20), (0.10, 0.40)):
        ico(0.30, (x, y, 0.30), subdiv=3, mat=M['h_fig'], scale=(1.0, 1.0, 0.95), smooth=True)
        o = ico(0.14, (x - 0.24, y + 0.10, 0.46), subdiv=2, mat=M['h_fig'], scale=(1.6, 1.0, 1.0), smooth=True); o.rotation_euler = (0, -0.5, 2.7)
    _half(0.46, -0.36, 0.30, (1.3, 1.0, 0.9), M['h_fig'], M['h_figin'], rz=0.3, k=0.88)


def m_flax():
    """아마(`flax` — 농산물 갈래 · 섬유) — 세워 묶은 **가는 아마 줄기 한 단** · 끝에 하늘빛 꽃."""
    random.seed(1867)
    for i in range(24):
        a = random.uniform(0, math.tau); d = random.uniform(0, 0.16)
        tilt = d * 1.2
        cyl(0.018, 1.60, (math.cos(a) * d, math.sin(a) * d, 0.80), rot=(math.sin(a) * -tilt * 0.4, math.cos(a) * tilt * 0.4, 0), mat=M['h_flax'], verts=5)
    _ring(0.13, 0.035, (0, 0, 0.62), M['cord'])
    for i in range(10):
        a = i * 0.628; d = 0.10 + (i % 3) * 0.08
        x, y, z = math.cos(a) * d * 1.6, math.sin(a) * d * 1.6, 1.62 + (i % 2) * 0.06
        for k in range(5):
            b = k * 1.257
            o = ico(0.05, (x + math.cos(b) * 0.05, y + math.sin(b) * 0.05, z), subdiv=1, mat=M['h_flaxflower'], scale=(1.4, 0.8, 0.3)); o.rotation_euler = (0, 0, b)


def _half(x, y, r, sc, skin, flesh, rz=0.0, k=0.94):
    """반으로 가른 쪽 — 껍질 반구(아래)를 깎아 **자른 면이 위**로 오게 눕혔다 · 속살 면은 껍질보다 조금 안쪽."""
    o = ico(r, (x, y, 0.0), subdiv=3, mat=skin, scale=sc, smooth=True)
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.z = 0.0
    o.rotation_euler = (0, 0, rz)
    o = cyl(r * k, 0.012, (x, y, 0.004), mat=flesh, verts=32)
    o.scale = (sc[0], sc[1], 1.0)
    o.rotation_euler = (0, 0, rz)
    return o


def _leafy(x, y, z, L, W, a, mat, tilt=0.0):
    """넓은 잎 한 장(납작한 타원)."""
    o = ico(L * 0.5, (x, y, z), subdiv=2, mat=mat, scale=(1.0, W / L, 0.05), smooth=True)
    o.rotation_euler = (0, tilt, a)
    return o


def m_lentil():
    """렌즈콩(`lentil` — 농산물 갈래 · 콩) — 납작한 볼록렌즈꼴 **주황 알** 무더기와 마른 꼬투리 둘."""
    _mound(60, 0.64, 0.30, 0.04, 1870, lambda x, y, z, a: ico(0.065, (x, y, z), subdiv=2, mat=M['h_lentil'], scale=(1.0, 1.0, 0.45), smooth=True))
    for (x, y, a) in ((0.72, -0.30, 0.4), (0.56, -0.58, -0.4)):
        o = ico(0.14, (x, y, 0.06), subdiv=2, mat=M['h_cornhusk'], scale=(1.6, 1.0, 0.5), smooth=True); o.rotation_euler = (0, 0, a)


def m_mango():
    """망고(`mango` — 농산물 갈래 · 열매) — 콩팥꼴로 익은 **노란 주황 망고** 하나(붉은 볼 · 꼭지 쪽 푸른 기)와 반으로 가른 쪽(진주황 속살 · 칼집)."""
    random.seed(1871)
    o = ico(0.42, (-0.24, 0.20, 0.34), subdiv=3, mat=M['h_mango'], scale=(1.35, 1.0, 0.85), smooth=True); o.rotation_euler = (0, 0, 0.5)
    o = ico(0.30, (-0.10, 0.06, 0.38), subdiv=3, mat=M['h_mangored'], scale=(1.30, 0.95, 0.90), smooth=True); o.rotation_euler = (0, 0, 0.5)
    o = ico(0.16, (-0.66, -0.02, 0.40), subdiv=2, mat=M['h_pod'], scale=(1.0, 1.0, 0.7), smooth=True)                     # 꼭지 쪽 푸른 기
    cyl(0.02, 0.10, (-0.72, -0.05, 0.62), mat=M['h_cassava'], verts=5)
    _half(0.46, -0.36, 0.36, (1.35, 1.0, 0.8), M['h_mango'], M['h_mangoflesh'], rz=0.5)
    for k in range(4):                                                                                       # 칼집(고슴도치 썰기)
        box(0.60, 0.012, 0.01, (0.46, -0.36 + (k - 1.5) * 0.10, 0.012), rot=(0, 0, 0.5), mat=M['h_mangored'])


def m_mulberry():
    """뽕나무 잎(`mulberry` — 농산물 갈래 · 누에 먹이) — 딴 **윤 나는 진초록 잎**(하트꼴 · 톱니) 한 다발을 가지째 놓았다."""
    random.seed(1872)
    cyl(0.03, 1.40, (-0.10, 0.0, 0.10), rot=(0, math.radians(90), 0.15), mat=M['h_cassava'], verts=6)
    for (x, y, z, a, s_) in ((0.40, -0.26, 0.16, -0.8, 1.0), (0.44, 0.28, 0.20, 0.7, 0.95), (-0.10, -0.34, 0.14, -1.2, 0.9),
                            (-0.12, 0.32, 0.18, 1.3, 0.9), (0.72, 0.0, 0.24, 0.0, 1.05), (-0.56, 0.0, 0.12, 3.0, 0.8)):
        _leafy(x, y, z, 0.70 * s_, 0.56 * s_, a, M['h_mulleaf'], tilt=random.uniform(-0.1, 0.1))
        box(0.66 * s_, 0.02, 0.012, (x, y, z + 0.03), rot=(0, 0, a), mat=M['h_pod'])                           # 잎맥


def m_olive():
    """올리브(`olive` — 농산물 갈래 · 열매) — 은빛 회록 **가는 잎** 가지에 달린 검보라 · 푸른 열매 · 떨어진 몇 알."""
    random.seed(1873)
    cyl(0.025, 1.60, (0.0, 0.0, 0.14), rot=(0, math.radians(90), 0.2), mat=M['h_cassava'], verts=6)
    for k in range(9):
        t = (k - 4) / 4.0
        x, y = t * 0.70, t * 0.14
        _leafy(x + 0.10, y + (0.18 if k % 2 else -0.18), 0.16, 0.42, 0.10, (0.5 if k % 2 else -0.5) + 0.2, M['h_oliveleaf'])
    for (x, y, mat) in ((0.10, -0.06, 'h_olive'), (-0.24, 0.0, 'h_olivegreen'), (0.36, 0.10, 'h_olive'), (0.50, -0.50, 'h_olive'), (0.70, -0.30, 'h_olivegreen'), (0.30, -0.66, 'h_olive')):
        o = ico(0.13, (x, y, 0.20 if y > -0.3 else 0.09), subdiv=2, mat=M[mat], scale=(1.35, 1.0, 1.0), smooth=True); o.rotation_euler = (0, 0, 0.6)


def m_onion():
    """양파(`onion` — 농산물 갈래) — 금갈색 **겉껍질 양파** 둘(뾰족한 목 · 뿌리 털)과 반으로 가른 쪽(흰 겹 테)."""
    random.seed(1874)
    for (x, y, r) in ((-0.30, 0.18, 0.38), (0.20, 0.42, 0.30)):
        ico(r, (x, y, r * 0.95), subdiv=3, mat=M['h_onion'], scale=(1.0, 1.0, 0.92), smooth=True)
        cone(r * 0.30, 0.02, r * 0.6, (x, y, r * 1.95), mat=M['h_onion'], verts=10)
        for k in range(5):
            a = k * 1.257
            cyl(0.008, 0.12, (x + math.cos(a) * 0.05, y + math.sin(a) * 0.05, 0.03), rot=(math.sin(a) * 1.2, -math.cos(a) * 1.2, 0), mat=M['h_cornhusk'], verts=4)
    _half(0.46, -0.36, 0.34, (1.0, 1.0, 0.9), M['h_onion'], M['h_onionin'], k=0.92)
    for k in range(4):                                                                                       # 겹 테
        _ring(0.07 + k * 0.065, 0.008, (0.46, -0.36, 0.014), M['h_cornhusk'], maj=28, mnr=4)


def m_peanut():
    """땅콩(`peanut` — 농산물 갈래) — 가운데가 잘록한 그물 결 **꼬투리** 무더기 · 까 놓은 붉은 속껍질 알 몇."""
    def pod(x, y, z, a):
        ca, sa = math.cos(a), math.sin(a)
        for sgn in (-1, 1):
            ico(0.13, (x + ca * sgn * 0.12, y + sa * sgn * 0.12, z), subdiv=2, mat=M['h_peanut'], scale=(1.05, 0.95, 0.95), smooth=True)
        ico(0.09, (x, y, z), subdiv=2, mat=M['h_peanut'], scale=(1.0, 0.9, 0.9), smooth=True)                   # 잘록한 허리
    _mound(10, 0.56, 0.30, 0.10, 1875, pod)
    for (x, y) in ((0.62, -0.44), (0.82, -0.22), (0.44, -0.66)):
        ico(0.08, (x, y, 0.05), subdiv=2, mat=M['h_peanutk'], scale=(1.3, 1.0, 0.9), smooth=True)


def m_pineapple():
    """파인애플(`pineapple` — 농산물 갈래 · 열매) — 마름모 눈이 덮인 **노란 갈색 몸**과 위로 뻗은 뾰족한 잎 다발."""
    random.seed(1876)
    ico(0.44, (0, 0, 0.56), subdiv=3, mat=M['h_pineapple'], scale=(1.0, 1.0, 1.30), smooth=True)
    for k in range(16):                                                                                      # 잎 다발
        a = k * 2.399; up = 0.5 + (k % 4) * 0.12; L = 0.36 + (k % 3) * 0.10
        o = cone(0.07, 0.0, L, (math.cos(a) * 0.10, math.sin(a) * 0.10, 1.18 + L * 0.4), rot=(math.sin(a) * (1.4 - up), -math.cos(a) * (1.4 - up), 0), mat=M['h_pineleaf'], verts=4)
        o.scale = (1.0, 0.35, 1.0)


def m_potato():
    """감자(`potato` — 농산물 갈래 · 덩이줄기) — 울퉁불퉁한 **누런 갈색 덩이** 셋(눈) · 하나는 갈라 연노랑 속이 보인다."""
    random.seed(1877)
    for (x, y, r) in ((-0.30, 0.20, 0.32), (0.18, 0.40, 0.26), (-0.50, -0.28, 0.24)):
        ico(r, (x, y, r * 0.75), subdiv=3, mat=M['h_potato'], scale=(1.3, 1.0, 0.8), jitter=0.06, smooth=True)
        for k in range(3):
            a = k * 2.1 + x
            ico(0.025, (x + math.cos(a) * r * 0.9, y + math.sin(a) * r * 0.7, r * 0.95), subdiv=1, mat=M['h_cassava'])
    _half(0.42, -0.30, 0.30, (1.3, 1.0, 0.8), M['h_potato'], M['h_potatoin'], k=0.92)


def m_pumpkin():
    """호박(`pumpkin` — 농산물 갈래 · 늙은호박) — 골이 깊은 **주황 호박** 하나(굵은 꼭지)."""
    random.seed(1878)
    for k in range(10):                                                                                      # 골 열(둥근 쪽 열 개)
        a = k * math.tau / 10
        o = ico(0.36, (math.cos(a) * 0.36, math.sin(a) * 0.36, 0.44), subdiv=3, mat=M['h_pumpkin'], scale=(1.0, 0.70, 0.95), smooth=True)
        o.rotation_euler = (0, 0, a)
    ico(0.44, (0, 0, 0.46), subdiv=3, mat=M['h_pumpkin'], scale=(1.0, 1.0, 0.85), smooth=True)
    cyl(0.08, 0.30, (0.02, 0.0, 0.92), rot=(0.25, 0.1, 0), mat=M['h_cassava'], verts=7)
    o = _leafy(-0.40, 0.30, 0.86, 0.50, 0.42, 2.2, M['h_leaf'], tilt=0.3)


def m_sugarbeet():
    """사탕무(`sugarbeet` — 농산물 갈래 · 뿌리) — 끝이 가는 **흰 원뿔 뿌리** 둘과 위의 푸른 잎."""
    random.seed(1879)
    for (y, L) in ((-0.18, 1.10), (0.26, 0.90)):
        for j in range(6):
            t = j / 5.0
            ico(0.26 * (1 - t * 0.85) + 0.02, (-0.30 + t * L, y + t * 0.1, 0.24 - t * 0.06), subdiv=2, mat=M['h_beet'], scale=(1.2, 1.0, 1.0), smooth=True)
        for k in range(5):
            a = math.pi + (k - 2) * 0.45
            _leafy(-0.50 + math.cos(a) * 0.32, y + math.sin(a) * 0.32, 0.40, 0.56, 0.30, a, M['h_mulleaf'], tilt=-0.3)


def m_sugarcane():
    """사탕수수(`sugarcane` — 농산물 갈래) — 자줏빛 **마디진 줄기** 세 토막(누런 마디 테 · 벤 면) · 마른 잎 한 장."""
    random.seed(1880)
    for (y, z, L, rz) in ((-0.24, 0.14, 2.0, 0.0), (0.22, 0.14, 1.8, 0.06), (0.0, 0.40, 1.9, -0.04)):
        cyl(0.14, L, (0.0, y, z), rot=(0, math.radians(90), rz), mat=M['h_cane'], verts=14)
        for k in range(-2, 3):
            cyl(0.148, 0.06, (k * 0.40 + 0.1, y, z), rot=(0, math.radians(90), rz), mat=M['h_canenode'], verts=14)
        cyl(0.13, 0.02, (L / 2 + 0.005, y, z), rot=(0, math.radians(90), rz), mat=M['h_beet'], verts=14)        # 벤 면(흰 속)
    o = _leafy(-0.40, -0.52, 0.10, 1.4, 0.16, 0.2, M['h_cornhusk'])


def m_sweet_potato():
    """고구마(`sweet_potato` — 농산물 갈래 · 덩이뿌리) — 양끝이 가는 **자홍 껍질** 고구마 둘 · 하나는 잘라 노란 주황 속."""
    random.seed(1881)
    for (y, z, L, a) in ((-0.10, 0.20, 1.40, 0.15), (0.34, 0.18, 1.20, -0.25)):
        for j in range(7):
            t = j / 6.0
            r = 0.24 * math.sin(math.pi * (0.15 + t * 0.7)) + 0.03
            ico(r, (-L / 2 + t * L, y + math.sin(a) * (t - 0.5) * L, z), subdiv=2, mat=M['h_sweetpot'], scale=(1.4, 1.0, 1.0), jitter=0.04, smooth=True)
    _half(0.52, -0.46, 0.24, (1.6, 1.0, 0.9), M['h_sweetpot'], M['h_sweetin'], rz=0.4, k=0.90)


def m_tobacco():
    """담배(`tobacco` — 농산물 갈래 · 잎) — 꼭지를 한데 묶어 말린 **금갈색 큰 잎** 한 손."""
    random.seed(1882)
    for k in range(7):
        a = (k - 3) * 0.16
        o = ico(0.60, (math.cos(a) * 0.62 - 0.4, math.sin(a) * 0.62, 0.08 + k * 0.025), subdiv=2, mat=M['h_tobacco'], scale=(1.0, 0.36, 0.05), jitter=0.04, smooth=True)
        o.rotation_euler = (0, 0, a)
        box(1.10, 0.02, 0.012, (math.cos(a) * 0.62 - 0.4, math.sin(a) * 0.62, 0.12 + k * 0.025), rot=(0, 0, a), mat=M['h_cornhusk'])   # 잎맥
    cyl(0.12, 0.16, (-0.48, 0.0, 0.18), rot=(0, math.radians(90), 0), mat=M['cord'], verts=12)
    for k in range(5):
        cyl(0.02, 0.24, (-0.66, (k - 2) * 0.04, 0.18), rot=(0, math.radians(90), (k - 2) * 0.15), mat=M['h_tobacco'], verts=5)


def m_tomato():
    """토마토(`tomato` — 농산물 갈래 · 열매) — 푸른 꽃받침을 쓴 **붉은 토마토** 둘과 반으로 가른 쪽(씨 박힌 속)."""
    random.seed(1883)
    for (x, y, r) in ((-0.30, 0.18, 0.36), (0.22, 0.42, 0.28)):
        ico(r, (x, y, r * 0.85), subdiv=3, mat=M['h_tomato'], scale=(1.0, 1.0, 0.85), smooth=True)
        for k in range(5):
            a = k * 1.257
            o = ico(0.08, (x + math.cos(a) * 0.08, y + math.sin(a) * 0.08, r * 1.66), subdiv=1, mat=M['h_chiligreen'], scale=(1.6, 0.45, 0.2)); o.rotation_euler = (0, 0, a)
        cyl(0.02, 0.10, (x, y, r * 1.72), mat=M['h_chiligreen'], verts=5)
    _half(0.46, -0.34, 0.32, (1.0, 1.0, 0.85), M['h_tomato'], M['h_tomatoin'], k=0.92)


def _brilliant(x, y, z, r, mat, verts=8):
    """둥근 깎음 — 위 관(넓은 평면 · 비스듬한 면)과 아래 뾰족한 정자리."""
    cone(r, r * 0.58, r * 0.42, (x, y, z + r * 0.21), mat=mat, verts=verts)
    cone(0.0, r, r * 0.86, (x, y, z - r * 0.43), mat=mat, verts=verts)


def m_diamond():
    """다이아몬드(`diamond` — 보석 갈래) — 둥글게 깎은 **맑은 흰 보석** 하나(넓은 평면 · 여덟 면)와 작은 알 둘."""
    _brilliant(0.0, 0.0, 0.56, 0.52, M['h_diamond'], verts=8)
    _brilliant(0.62, -0.42, 0.20, 0.18, M['h_diamond'], verts=8)
    _brilliant(0.30, -0.64, 0.16, 0.13, M['h_diamond'], verts=8)


def m_ruby():
    """루비(`ruby` — 보석 갈래) — 타원으로 깎은 **붉은 보석** 하나와 작은 알 둘."""
    _brilliant(0.0, 0.0, 0.50, 0.50, M['h_ruby'], verts=10)
    for o in OBJS[-2:]:
        o.scale = (1.25, 0.9, 1.0)
    _brilliant(0.64, -0.40, 0.18, 0.16, M['h_ruby'], verts=10)
    _brilliant(0.34, -0.66, 0.15, 0.12, M['h_ruby'], verts=10)


def m_sapphire():
    """사파이어(`sapphire` — 보석 갈래) — 네모 둥근 쿠션꼴로 깎은 **푸른 보석** 하나와 작은 알 둘."""
    _brilliant(0.0, 0.0, 0.50, 0.52, M['h_sapphire'], verts=4)
    for o in OBJS[-2:]:
        o.rotation_euler = (0, 0, math.radians(45))
    _brilliant(0.66, -0.36, 0.18, 0.17, M['h_sapphire'], verts=6)
    _brilliant(0.36, -0.66, 0.15, 0.12, M['h_sapphire'], verts=6)


def m_emerald():
    """에메랄드(`emerald` — 보석 갈래) — **계단꼴로 깎은 네모 초록 보석**(모서리를 친 직사각) 하나와 육각 원석 기둥 하나."""
    o = box(0.90, 0.64, 0.30, (0.0, 0.0, 0.30), mat=M['h_emerald'])
    for v in o.data.vertices:
        if v.co.z > 0:
            v.co.x *= 0.78; v.co.y *= 0.70
    o = box(0.90, 0.64, 0.30, (0.0, 0.0, 0.02), mat=M['h_emerald'])
    for v in o.data.vertices:
        if v.co.z < 0:
            v.co.x *= 0.62; v.co.y *= 0.50
    cyl(0.14, 0.50, (0.66, -0.44, 0.14), rot=(0, math.radians(90), 0.5), mat=M['h_emerald'], verts=6, smooth=False)


def m_amethyst():
    """자수정(`amethyst` — 보석 갈래 · 캔 것) — 회색 바탕돌에서 돋은 **보랏빛 육각 결정** 무리."""
    random.seed(1884)
    ico(0.50, (0, 0, 0.16), subdiv=2, mat=M['stone'], scale=(1.4, 1.1, 0.40), jitter=0.18)
    for i in range(11):
        a = random.uniform(0, math.tau); d = random.uniform(0.0, 0.40); L = random.uniform(0.34, 0.70); tilt = d * 1.3
        rx, ry = math.sin(a) * -tilt, math.cos(a) * tilt
        cyl(0.08, L, (math.cos(a) * d, math.sin(a) * d, 0.24 + L * 0.42), rot=(rx, ry, 0), mat=M['h_amethyst'], verts=6, smooth=False)
        cone(0.08, 0.0, 0.14, (math.cos(a) * (d + math.sin(tilt) * L * 0.5), math.sin(a) * (d + math.sin(tilt) * L * 0.5), 0.24 + L * 0.42 + math.cos(tilt) * (L * 0.5 + 0.07)),
             rot=(rx, ry, 0), mat=M['h_amethyst'], verts=6)


def m_topaz():
    """토파즈(`topaz` — 보석 갈래) — 물방울꼴로 깎은 **금빛 보석** 하나와 작은 알 둘."""
    _brilliant(0.0, 0.0, 0.50, 0.50, M['h_topaz'], verts=10)
    for o in OBJS[-2:]:
        o.scale = (1.45, 0.85, 1.0)
        for v in o.data.vertices:
            if v.co.x > 0:
                v.co.y *= max(0.2, 1 - v.co.x / 0.5 * 0.8)
    _brilliant(0.66, -0.38, 0.18, 0.16, M['h_topaz'], verts=8)
    _brilliant(0.36, -0.66, 0.15, 0.12, M['h_topaz'], verts=8)


def m_turquoise():
    """터키석(`turquoise` — 보석 갈래) — 검은 그물 결이 든 **하늘빛 돌**: 갈아 둥글린 알(돔꼴) 하나와 원석 덩이 둘."""
    random.seed(1885)
    ico(0.46, (0.0, 0.0, 0.0), subdiv=3, mat=M['h_turq'], scale=(1.25, 1.0, 0.70), smooth=True)
    for (x, y, r) in ((0.62, -0.44, 0.22), (-0.62, -0.30, 0.18)):
        ico(r, (x, y, r * 0.5), subdiv=1, mat=M['h_turq'], scale=(1.2, 1.0, 0.8), jitter=0.25)


def m_jade_polished():
    """옥 가공품(`jade_polished` — 보석 갈래) — 갈아 윤 낸 **굽은 옥**(곡옥 — 머리에 구멍 · C 자로 감긴 꼬리) 둘과 대롱옥 하나(청동기 한반도의 옥)."""
    random.seed(1886)
    _gogok(-0.24, 0.10, 1.0, 0.2)
    _gogok(0.52, -0.30, 0.72, 2.6)
    cyl(0.10, 0.50, (0.24, 0.60, 0.10), rot=(0, math.radians(90), 0.4), mat=M['h_jade'], verts=14)               # 대롱옥
    cyl(0.04, 0.52, (0.24, 0.60, 0.10), rot=(0, math.radians(90), 0.4), mat=M['scorch'], verts=10)


def m_amber_polished():
    """호박 가공(`amber_polished` — 보석 갈래) — 갈아 윤 낸 **둥근 호박 구슬**을 끈에 꿴 한 줄."""
    random.seed(1887)
    for k in range(9):
        t = k / 8.0
        a = math.pi * (0.15 + t * 0.9)
        x, y = math.cos(a) * 0.70, math.sin(a) * 0.55 - 0.20
        ico(0.15 + 0.03 * math.sin(t * math.pi), (x, y, 0.15), subdiv=3, mat=M['h_amber'], smooth=True)
    for k in range(10):
        t = (k + 0.5) / 9.0
        a = math.pi * (0.15 + t * 0.9 - 0.05)
        cyl(0.012, 0.16, (math.cos(a) * 0.70, math.sin(a) * 0.55 - 0.20, 0.15), rot=(0, math.radians(90), a + math.pi / 2), mat=M['cord'], verts=5)
    for sgn in (-1, 1):                                                                                          # 끈 끝
        cyl(0.012, 0.40, (sgn * 0.74, -0.42, 0.10), rot=(0, math.radians(90), sgn * 1.2), mat=M['cord'], verts=5)


def _coins(x, y, n, r, mat, seed):
    """주화 더미 — 쌓은 것 n 닢(조금씩 어긋남) · 테를 두른 둥근 돈."""
    random.seed(seed)
    for k in range(n):
        dx, dy = random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03)
        cyl(r, 0.07, (x + dx, y + dy, 0.035 + k * 0.075), mat=mat, verts=28)
        _ring(r * 0.88, 0.012, (x + dx, y + dy, 0.072 + k * 0.075), mat, maj=28, mnr=4)


def m_gold_coin():
    """금화(`gold_coin` — 보석 갈래 · 위세 재화) — 쌓은 **금빛 주화** 두 더미와 기대 세운 한 닢."""
    _coins(-0.20, 0.10, 6, 0.32, M['h_goldmet'], 1888)
    _coins(0.38, 0.34, 3, 0.30, M['h_goldmet'], 18881)
    cyl(0.30, 0.07, (0.42, -0.42, 0.24), rot=(math.radians(70), 0, 0.4), mat=M['h_goldmet'], verts=28)


def m_silver_coin():
    """은화(`silver_coin` — 보석 갈래 · 위세 재화) — 쌓은 **은빛 주화** 두 더미와 기대 세운 한 닢."""
    _coins(-0.20, 0.10, 6, 0.32, M['h_silvmet'], 1889)
    _coins(0.38, 0.34, 3, 0.30, M['h_silvmet'], 18891)
    cyl(0.30, 0.07, (0.42, -0.42, 0.24), rot=(math.radians(70), 0, 0.4), mat=M['h_silvmet'], verts=28)


def m_relic():
    """유물(`relic` — 보석 갈래 · 줍는 위세품) — 푸른 녹이 앉은 **잔무늬 청동 거울**(가는 동심 무늬 · 가운데 꼭지 둘에 꿴 끈)을 비스듬히 세웠다 — 청동기 한반도 최고의 보물."""
    random.seed(1890)
    n0 = len(OBJS)
    cyl(0.70, 0.08, (0, 0, 0.04), mat=M['h_bronzemet'], verts=40)
    _ring(0.69, 0.045, (0, 0, 0.08), M['h_bronzemet'], maj=48, mnr=6)
    for k in range(5):                                                                                        # 잔무늬 테(녹)
        _ring(0.16 + k * 0.10, 0.016, (0, 0, 0.085), M['h_patina'], maj=40, mnr=4)
    for sgn in (-1, 1):                                                                                       # 꼭지 둘
        ico(0.08, (sgn * 0.10, 0.0, 0.12), subdiv=2, mat=M['h_bronzemet'], scale=(1.0, 0.6, 0.8), smooth=True)
    for k in range(10):                                                                                       # 녹 얼룩
        a = random.uniform(0, math.tau); d = random.uniform(0.15, 0.62)
        ico(random.uniform(0.08, 0.14), (math.cos(a) * d, math.sin(a) * d, 0.09), subdiv=1, mat=M['h_patina'], scale=(1.5, 1.0, 0.2), jitter=0.3)
    _ring(0.10, 0.02, (0.0, 0.0, 0.16), M['h_redcord'], rot=(math.radians(90), 0, 0), maj=16, mnr=5)          # 꼭지에 꿴 끈
    _tilt(n0, math.radians(40), 'X')                                                                          # 뒷면 무늬가 보는 쪽으로 오게 세운다


def m_iron_relic():
    """철제 위세품(`iron_relic` — 위세 갈래 · 철기 대금) — 고리자루에 금테를 두른 **쇠 큰칼**(위세 칼)을 칼집 없이 눕혔다."""
    random.seed(1891)
    box(1.70, 0.16, 0.04, (0.30, 0.0, 0.06), mat=M['h_ironmet'])                                             # 날
    o = box(0.30, 0.16, 0.04, (1.24, 0.0, 0.06), rot=(0, 0, 0), mat=M['h_ironmet'])                            # 칼끝
    for v in o.data.vertices:
        if v.co.x > 0:
            v.co.y *= 0.05
    box(0.42, 0.10, 0.08, (-0.78, 0.0, 0.06), mat=M['haft'])                                                 # 자루
    for k in range(4):
        cyl(0.065, 0.03, (-0.92 + k * 0.10, 0.0, 0.06), rot=(0, math.radians(90), 0), mat=M['h_goldmet'], verts=10)   # 금테
    _ring(0.16, 0.04, (-1.14, 0.0, 0.06), M['h_goldmet'], rot=(math.radians(90), 0, 0), maj=24, mnr=8)          # 고리
    box(0.06, 0.28, 0.10, (-0.54, 0.0, 0.06), mat=M['h_goldmet'])                                            # 코등이


def m_scroll():
    """두루마리(`scroll` — 보석 갈래 · 위세 기록) — 붉은 끈으로 묶은 **말린 두루마리** 하나와 반쯤 펼친 하나(먹 글줄 · 나무 축)."""
    random.seed(1892)
    cyl(0.18, 1.30, (-0.10, 0.30, 0.18), rot=(0, math.radians(90), 0.2), mat=M['h_paper'], verts=20)
    for sgn in (-1, 1):
        cyl(0.05, 0.14, (-0.10 + sgn * 0.70, 0.30 + sgn * 0.14, 0.18), rot=(0, math.radians(90), 0.2), mat=M['haft'], verts=10)
    _ring(0.185, 0.02, (-0.10, 0.30, 0.18), M['h_redcord'], rot=(0, math.radians(90), 0.2), maj=20, mnr=5)
    box(1.10, 0.80, 0.015, (0.20, -0.40, 0.01), rot=(0, 0, 0.2), mat=M['h_paper'])                          # 펼친 종이
    cyl(0.12, 1.00, (0.28, -0.84, 0.12), rot=(0, math.radians(90), 0.2), mat=M['h_paper'], verts=18)          # 말린 쪽
    for k in range(5):                                                                                        # 먹 글줄
        box(0.03, 0.62, 0.01, (-0.18 + k * 0.16, -0.36 + k * 0.03, 0.022), rot=(0, 0, 0.2), mat=M['h_ink'])


def _gogok(x, y, s_, rz):
    """굽은 옥(곡옥) — 둥근 머리(구멍)에서 꼬리가 C 자로 감겨 가늘어진다(눕힌 것)."""
    ico(0.30 * s_, (x, y, 0.16 * s_), subdiv=3, mat=M['h_jade'], scale=(1.0, 1.0, 0.55), smooth=True)
    for j in range(16):
        t = (j + 1) / 16.0
        a = rz + t * 2.6
        cx, cy = x + math.cos(rz) * 0.30 * s_, y + math.sin(rz) * 0.30 * s_
        ico((0.27 - t * 0.17) * s_, (cx + math.cos(a + math.pi) * 0.30 * s_, cy + math.sin(a + math.pi) * 0.30 * s_, 0.14 * s_), subdiv=2,
            mat=M['h_jade'], scale=(1.0, 1.0, 0.55), smooth=True)
    cyl(0.08 * s_, 0.02, (x, y, 0.255 * s_), mat=M['scorch'], verts=14)                                       # 구멍


def _tilt(n0, ang, axis='X'):
    """`n0` 번째 뒤로 지은 오브젝트를 원점 둘레로 세계 축 `axis` 만큼 기울인다(회전 행렬을 앞에 곱한다 — `_spin` 과 같은 문법)."""
    from mathutils import Matrix
    R = Matrix.Rotation(ang, 3, axis)
    for o in OBJS[n0:]:
        o.location = R @ o.location
        o.rotation_euler = (R @ o.rotation_euler.to_matrix()).to_euler('XYZ')


def _jar(x, y, R, H, mat, neck=0.55, lip=0.62):
    """항아리 — 배부른 몸 · 좁은 목 · 벌어진 아가리(옹기 · 토기)."""
    ico(R, (x, y, H * 0.45), subdiv=3, mat=mat, scale=(1.0, 1.0, H / (2 * R) * 1.05), smooth=True)
    cyl(R * neck, H * 0.20, (x, y, H * 0.90), mat=mat, verts=24)
    _ring(R * lip, R * 0.08, (x, y, H * 1.0), mat, maj=28, mnr=8)


def m_beer():
    """맥주(`beer` — 공예품 갈래) — 넓은 토기 잔에 찰랑이는 **호박빛 맥주** · 가장자리를 두른 흰 거품 띠와 떠 있는 거품."""
    random.seed(1900)
    _bowl(0.58, 0.56, M['h_bowl'], base=0.70)
    cyl(0.55, 0.03, (0, 0, 0.565), mat=M['h_beer'], verts=28)
    _ring(0.47, 0.07, (0, 0, 0.59), M['h_foam'], maj=36, mnr=10)                                             # 거품 띠
    for k in range(5):                                                                                        # 떠 있는 거품
        a = k * 1.3 + 0.3; d = random.uniform(0.05, 0.28)
        ico(random.uniform(0.07, 0.12), (math.cos(a) * d, math.sin(a) * d, 0.585), subdiv=2, mat=M['h_foam'], scale=(1.0, 1.0, 0.45), smooth=True)
    _ring(0.18, 0.05, (0.62, 0.0, 0.30), M['h_bowl'], rot=(math.radians(90), 0, 0), maj=18, mnr=8)          # 손잡이


def m_wine():
    """와인(`wine` — 공예품 갈래) — 두 귀 달린 **목 긴 토기 병**과 앞에 따른 **검붉은 포도주** 한 잔."""
    random.seed(1901)
    _jar(-0.26, 0.20, 0.36, 1.30, M['h_bowl'], neck=0.40, lip=0.46)
    for sgn in (-1, 1):
        _ring(0.12, 0.035, (-0.26 + sgn * 0.20, 0.20, 1.06), M['h_bowl'], rot=(math.radians(90), 0, 0), maj=16, mnr=6)
    n0 = len(OBJS)
    _bowl(0.30, 0.22, M['h_bowl'], base=0.55)
    cyl(0.28, 0.02, (0, 0, 0.225), mat=M['h_wine'], verts=24)
    for o in OBJS[n0:]:
        o.location.x += 0.40; o.location.y -= 0.40


def m_soy_sauce():
    """간장(`soy_sauce` — 공예품 갈래) — 윤 낸 검붉은 **옹기**에 담긴 검은 장(뚜껑을 비켜 놓았다)과 작은 종지 하나."""
    random.seed(1902)
    _jar(-0.20, 0.16, 0.52, 1.10, M['h_onggi'], neck=0.70, lip=0.74)
    cyl(0.36, 0.02, (-0.20, 0.16, 1.07), mat=M['h_soy'], verts=28)
    o = cyl(0.44, 0.06, (0.36, 0.40, 0.08), rot=(math.radians(-14), 0, 0), mat=M['h_onggi'], verts=28)       # 비켜 놓은 뚜껑
    ico(0.06, (0.36, 0.40, 0.14), subdiv=1, mat=M['h_onggi'])
    n0 = len(OBJS)
    _bowl(0.22, 0.14, M['h_onggi'], base=0.6)
    cyl(0.20, 0.02, (0, 0, 0.145), mat=M['h_soy'], verts=20)
    for o in OBJS[n0:]:
        o.location.x += 0.46; o.location.y -= 0.46


def m_kimchi():
    """김치(`kimchi` — 공예품 갈래) — 바리에 담은 고춧물 든 **배추 포기**(겹겹의 잎 · 흰 줄기) 둘."""
    random.seed(1903)
    _bowl(0.66, 0.36, M['h_onggi'], base=0.6)
    for (x, y, a) in ((-0.14, 0.10, 0.5), (0.20, -0.18, 0.3)):
        for k in range(5):                                                                                     # 겹잎
            o = ico(0.30 - k * 0.03, (x, y + (k - 2) * 0.05, 0.42 + k * 0.03), subdiv=2, mat=(M['h_kimchi'] if k % 2 == 0 else M['h_cabbage']),
                    scale=(1.9, 0.50, 0.40), jitter=0.06, smooth=True)
            o.rotation_euler = (0, 0, a)
    for k in range(10):                                                                                        # 고춧가루 · 실파
        a = random.uniform(0, math.tau); d = random.uniform(0.1, 0.5)
        ico(0.03, (math.cos(a) * d, math.sin(a) * d, 0.52), subdiv=1, mat=M['h_paprika'])


def m_bread():
    """빵(`bread` — 공예품 갈래) — 칼집 낸 껍질이 터진 **둥근 빵** 한 덩이와 썰어 낸 한 조각."""
    random.seed(1904)
    ico(0.56, (-0.12, 0.10, 0.30), subdiv=3, mat=M['h_crust'], scale=(1.30, 1.0, 0.58), jitter=0.02, smooth=True)
    for k in range(3):                                                                                         # 칼집(터진 속)
        o = ico(0.30, (-0.40 + k * 0.28, 0.10, 0.60), subdiv=2, mat=M['h_crumb'], scale=(0.25, 1.4, 0.10), smooth=True)
        o.rotation_euler = (0, 0, 0.25)
    o = box(0.16, 0.70, 0.46, (0.66, -0.36, 0.23), rot=(0, 0, 0.3), mat=M['h_crust'])                          # 조각(껍질)
    box(0.17, 0.62, 0.38, (0.66, -0.36, 0.22), rot=(0, 0, 0.3), mat=M['h_crumb'])                              # 조각 속


def m_bow():
    """활(`bow` — 공예품 갈래) — 양끝이 뒤로 젖혀진 **짧은 각궁**(검은 몸 · 줌통 감은 끈)에 시위를 메웠다."""
    random.seed(1905)
    pts = []
    for j in range(15):
        t = (j / 14.0) * 2 - 1                                                                                 # −1 … 1
        x = t * 1.10
        y = 0.38 * (1 - t * t) - 0.30 * (abs(t) ** 6) * 1.6                                                   # 활 몸 굽이 + 끝 젖힘
        pts.append((x, y))
    for j in range(14):
        (x0, y0), (x1, y1) = pts[j], pts[j + 1]
        L = math.hypot(x1 - x0, y1 - y0); a = math.atan2(y1 - y0, x1 - x0)
        cyl(0.05 - abs(j - 6.5) * 0.002, L * 1.08, ((x0 + x1) / 2, (y0 + y1) / 2, 0.06), rot=(0, math.radians(90), a), mat=M['h_bowwood'], verts=8)
    cyl(0.07, 0.30, (0.0, 0.38, 0.06), rot=(0, math.radians(90), 0), mat=M['cord'], verts=10)                 # 줌통
    xA, yA = pts[1]; xB, yB = pts[-2]
    cyl(0.012, math.hypot(xB - xA, yB - yA), ((xA + xB) / 2, (yA + yB) / 2, 0.06), rot=(0, math.radians(90), math.atan2(yB - yA, xB - xA)), mat=M['h_petal'], verts=5)   # 시위


def m_brush():
    """붓(`brush` — 공예품 갈래) — 대나무 붓대에 **먹 머금은 검은 털**이 달린 붓 둘(하나는 붓걸이에 기댔다)."""
    random.seed(1906)
    for (y, z, ry) in ((-0.16, 0.06, 0.0), (0.22, 0.30, -0.20)):
        cyl(0.05, 1.40, (-0.10, y, z), rot=(0, math.radians(90) + ry, 0.1), mat=M['h_bamboo'], verts=10)
        cyl(0.06, 0.08, (0.58, y + 0.07, z - 0.13 * (1 if ry else 0)), rot=(0, math.radians(90) + ry, 0.1), mat=M['h_bambnode'], verts=10)
        o = cone(0.075, 0.0, 0.42, (0.82, y + 0.09, z - 0.18 * (1 if ry else 0)), rot=(0, math.radians(90) + ry, 0.1), mat=M['h_brushhair'], verts=12)
    box(0.12, 0.70, 0.30, (-0.60, 0.10, 0.15), mat=M['haft'])                                                   # 붓걸이


def m_ink():
    """먹(`ink` — 공예품 갈래) — 검은 **먹 막대** 하나(금빛 글자 자리)와 먹을 간 **벼루**(검은 먹물 못)."""
    random.seed(1907)
    box(1.10, 0.70, 0.16, (0.0, 0.10, 0.08), mat=M['h_inkstone'])                                               # 벼루
    box(0.70, 0.46, 0.02, (0.10, 0.10, 0.165), mat=M['h_soy'])                                                  # 먹물 못
    box(0.22, 0.46, 0.04, (-0.40, 0.10, 0.17), mat=M['h_inkstone'])                                             # 연지 둑
    box(0.90, 0.20, 0.12, (0.20, -0.56, 0.06), rot=(0, 0, 0.35), mat=M['h_ink'])                                # 먹 막대
    box(0.40, 0.10, 0.01, (0.20, -0.56, 0.125), rot=(0, 0, 0.35), mat=M['h_goldmet'])                           # 금빛 글자 자리


def m_paper():
    """종이(`paper` — 공예품 갈래) — 가지런히 쌓은 **미색 종이** 한 묶음(겹이 보이는 옆면 · 맨 위 한 장은 비스듬)과 묶은 끈."""
    random.seed(1908)
    for k in range(10):
        box(1.20, 0.86, 0.022, (random.uniform(-0.02, 0.02), random.uniform(-0.02, 0.02), 0.012 + k * 0.026), rot=(0, 0, random.uniform(-0.02, 0.02)), mat=M['h_paper'])
    box(1.20, 0.86, 0.02, (0.16, -0.12, 0.30), rot=(0, 0, 0.35), mat=M['h_paper'])
    for sgn in (-1, 1):
        box(1.24, 0.04, 0.30, (0.0, sgn * 0.22, 0.14), mat=M['cord'])


def _bricks(mat, seed, chip=0.0):
    """벽돌 쌓기 — 아래 셋 · 위 둘 엇쌓기 · 옆에 하나."""
    random.seed(seed)
    for (x, y, z, rz) in ((0.0, -0.36, 0.13, 0.0), (0.0, 0.0, 0.13, 0.0), (0.0, 0.36, 0.13, 0.0), (0.06, -0.18, 0.39, 0.0), (0.06, 0.18, 0.39, 0.0), (0.84, -0.30, 0.13, 0.5)):
        o = box(0.80, 0.34, 0.25, (x, y, z), rot=(0, 0, rz), mat=mat)
        if chip:
            for v in o.data.vertices:
                v.co.x *= 1 + random.uniform(-chip, chip); v.co.y *= 1 + random.uniform(-chip, chip)


def m_clay_brick():
    """진흙 벽돌(`clay_brick` — 공예품 갈래) — 햇볕에 말린 **누런 갈색 흙벽돌** 엇쌓기(모서리가 무르다)."""
    _bricks(M['h_mudbrick'], 1909, chip=0.06)


def m_stone_brick():
    """석재 벽돌(`stone_brick` — 공예품 갈래) — 정으로 다듬은 **회색 돌 벽돌** 엇쌓기(반듯한 모서리)."""
    _bricks(M['h_cutstone'], 1910)


def m_dye_indigo():
    """인디고(`dye_indigo` — 공예품 갈래 · 쪽 염료) — 짙은 **쪽빛 물**이 담긴 바리와 앞에 굳힌 쪽빛 덩이 셋."""
    random.seed(1911)
    _bowl(0.56, 0.40, M['h_bowl'], base=0.6)
    cyl(0.53, 0.02, (0, 0, 0.405), mat=M['h_indigo'], verts=28)
    for (x, y, r) in ((0.62, -0.46, 0.15), (0.40, -0.70, 0.12), (0.82, -0.20, 0.11)):
        ico(r, (x, y, r * 0.8), subdiv=1, mat=M['h_indigocake'], scale=(1.2, 1.0, 0.9), jitter=0.2)


def m_dye_purple():
    """자색 염료(`dye_purple` — 공예품 갈래 · 고둥 염료) — **자줏빛 물**이 담긴 바리와 그 물에 들인 자색 실 타래."""
    random.seed(1912)
    _bowl(0.56, 0.40, M['h_bowl'], base=0.6)
    cyl(0.53, 0.02, (0, 0, 0.405), mat=M['h_purple'], verts=28)
    for k in range(4):
        o = _ring(0.40, 0.05, (0.56 + k * 0.01, -0.50, 0.05 + k * 0.03), M['h_purpleyarn'], maj=36, mnr=8)
        o.scale = (1.0, 0.45, 1.0)


def m_glass():
    """유리(`glass` — 공예품 갈래) — 푸른 물빛 **유리 병** 하나와 유리 구슬 몇(청동기 · 철기 한반도의 유리 구슬)."""
    random.seed(1913)
    ico(0.40, (-0.20, 0.16, 0.40), subdiv=3, mat=M['h_glass'], scale=(1.0, 1.0, 1.0), smooth=True)
    cyl(0.12, 0.40, (-0.20, 0.16, 0.92), mat=M['h_glass'], verts=20)
    _ring(0.14, 0.035, (-0.20, 0.16, 1.12), M['h_glass'], maj=20, mnr=6)
    for (x, y) in ((0.40, -0.36), (0.62, -0.10), (0.20, -0.62), (0.56, -0.62), (0.80, -0.40)):
        ico(0.10, (x, y, 0.09), subdiv=2, mat=M['h_glass'], scale=(1.0, 1.0, 0.85), smooth=True)
        cyl(0.03, 0.02, (x, y, 0.18), mat=M['scorch'], verts=8)


def m_perfume():
    """향수(`perfume` — 공예품 갈래) — 배부른 **분홍 유리 병**(금빛 마개 · 목 테)과 옆에 놓인 꽃 한 송이."""
    random.seed(1914)
    ico(0.38, (0, 0, 0.38), subdiv=3, mat=M['h_perfume'], scale=(1.0, 1.0, 0.95), smooth=True)
    cyl(0.10, 0.26, (0, 0, 0.82), mat=M['h_perfume'], verts=16)
    _ring(0.12, 0.03, (0, 0, 0.92), M['h_goldmet'], maj=18, mnr=6)
    ico(0.13, (0, 0, 1.04), subdiv=2, mat=M['h_goldmet'], scale=(1.0, 1.0, 1.3), smooth=True)
    for k in range(5):
        a = k * 1.257
        o = ico(0.10, (0.56 + math.cos(a) * 0.09, -0.40 + math.sin(a) * 0.09, 0.06), subdiv=2, mat=M['h_crocus'], scale=(1.3, 0.8, 0.25), smooth=True)
        o.rotation_euler = (0, 0, a)
    ico(0.05, (0.56, -0.40, 0.10), subdiv=1, mat=M['h_disc'])
    cyl(0.015, 0.50, (0.86, -0.22, 0.04), rot=(0, math.radians(90), 0.6), mat=M['h_stem'], verts=5)


def m_pottery():
    """도자기(`pottery` — 공예품 갈래) — 어깨가 넓고 목이 짧은 **유약 입힌 병**(비색 유약 · 굽) — 흙빛 토기 항아리들과 빛으로 갈린다."""
    random.seed(1915)
    ico(0.48, (0, 0, 0.62), subdiv=3, mat=M['h_celadon'], scale=(1.0, 1.0, 1.10), smooth=True)              # 넓은 어깨
    cone(0.24, 0.40, 0.40, (0, 0, 0.20), mat=M['h_celadon'], verts=28)                                      # 아래로 좁아지는 몸
    cyl(0.12, 0.18, (0, 0, 1.18), mat=M['h_celadon'], verts=20)                                             # 짧은 목
    _ring(0.13, 0.04, (0, 0, 1.27), M['h_celadon'], maj=20, mnr=6)
    _ring(0.25, 0.03, (0, 0, 0.02), M['h_celadon'], maj=24, mnr=6)                                          # 굽
    for k in range(3):                                                                                        # 상감 무늬 띠
        _ring(0.47 - abs(k - 1) * 0.04, 0.012, (0, 0, 0.66 + (k - 1) * 0.14), M['h_petal'], maj=36, mnr=4)


def m_silk_cloth():
    """비단(`silk_cloth` — 공예품 갈래) — 윤 나는 **진홍 비단** 한 필: 말린 두루마리와 앞으로 흘러내린 자락(금빛 단)."""
    random.seed(1916)
    cyl(0.26, 1.30, (-0.10, 0.20, 0.26), rot=(0, math.radians(90), 0.25), mat=M['h_silk'], verts=24)
    for k in range(6):                                                                                        # 흘러내린 자락(물결)
        t = k / 5.0
        box(0.80, 0.26, 0.02, (0.10 + math.cos(0.25) * (t - 0.5) * 0.10, -0.12 - t * 0.56, 0.20 - t * 0.16 + math.sin(t * 6) * 0.03),
            rot=(math.radians(-24) + math.sin(t * 6) * 0.2, 0, 0.25), mat=M['h_silk'])
    box(0.80, 0.04, 0.025, (0.16, -0.72, 0.03), rot=(0, 0, 0.25), mat=M['h_goldmet'])                       # 금빛 단


def m_beef_tallow():
    """소기름(`beef_tallow` — 가축 산물) — 녹였다 굳힌 **흰 기름 덩이** 둘(매끈한 윗면)과 토기 종지에 담긴 녹은 기름."""
    random.seed(1917)
    o = box(0.70, 0.50, 0.34, (-0.16, 0.14, 0.17), rot=(0, 0, 0.2), mat=M['h_tallow'])
    for v in o.data.vertices:
        v.co.x *= 1 + random.uniform(-0.05, 0.05); v.co.y *= 1 + random.uniform(-0.05, 0.05)
    o = box(0.46, 0.40, 0.26, (0.42, 0.36, 0.13), rot=(0, 0, -0.3), mat=M['h_tallow'])
    n0 = len(OBJS)
    _bowl(0.26, 0.16, M['h_bowl'], base=0.6)
    cyl(0.24, 0.02, (0, 0, 0.165), mat=M['h_beer'], verts=20)
    for o in OBJS[n0:]:
        o.location.x += 0.46; o.location.y -= 0.40


def m_cheese():
    """치즈(`cheese` — 가축 산물) — 쐐기 하나를 잘라 낸 **둥근 치즈**(누런 껍질 · 구멍 난 속)와 그 쐐기."""
    random.seed(1918)
    n = 28
    cyl(0.62, 0.40, (0, 0, 0.20), mat=M['h_rind'], verts=n)
    o = OBJS[-1]
    for v in o.data.vertices:                                                                                 # 쐐기 자리(앞쪽 60°)를 안쪽으로 접는다
        a = math.atan2(v.co.y, v.co.x)
        if -0.9 < a < 0.15:
            v.co.x *= 0.02; v.co.y *= 0.02
    for sgn, a in ((1, -0.9), (-1, 0.15)):                                                                    # 자른 면(속)
        box(0.60, 0.012, 0.38, (math.cos(a) * 0.30, math.sin(a) * 0.30, 0.20), rot=(0, 0, a), mat=M['h_cheese'])
    for k in range(4):                                                                                        # 구멍
        a = random.uniform(-0.8, 0.1)
        cyl(0.04, 0.02, (math.cos(a) * 0.30, math.sin(a) * 0.30, 0.10 + k * 0.07), rot=(math.radians(90), 0, a), mat=M['h_rind'], verts=10)
    o = cone(0.0, 0.0, 0.0, (0, 0, 0), mat=M['h_cheese'], verts=3)                                             # (자리 표 · 크기 0)
    o.scale = (0, 0, 0)
    for (x, y) in ((0.80, -0.40),):                                                                           # 잘라 낸 쐐기
        o = cyl(0.50, 0.36, (x, y, 0.18), mat=M['h_cheese'], verts=3)
        o.rotation_euler = (0, 0, 0.6)


def m_duck_meat():
    """오리고기(`duck_meat` — 가축 산물) — **두툼한 흰 기름 껍질**을 인 검붉은 오리 가슴살 둘(껍질에 칼집) · 다리 하나."""
    random.seed(1919)
    for (x, y, a) in ((-0.20, 0.14, 0.3), (0.30, -0.20, 0.5)):
        o = ico(0.40, (x, y, 0.14), subdiv=3, mat=M['h_duck'], scale=(1.4, 0.80, 0.36), smooth=True); o.rotation_euler = (0, 0, a)
        o = ico(0.38, (x, y, 0.22), subdiv=3, mat=M['h_duckskin'], scale=(1.4, 0.78, 0.22), smooth=True); o.rotation_euler = (0, 0, a)
        for k in range(4):
            box(0.70, 0.015, 0.012, (x, y + (k - 1.5) * 0.10, 0.31), rot=(0, 0, a + 0.7), mat=M['h_duck'])
    o = ico(0.20, (0.62, 0.40, 0.14), subdiv=2, mat=M['h_duckskin'], scale=(1.5, 1.0, 0.8), smooth=True); o.rotation_euler = (0, 0, 2.2)
    cyl(0.05, 0.36, (0.40, 0.66, 0.12), rot=(0, math.radians(90), 2.2), mat=M['g_bone'], verts=8)


def m_goat_milk():
    """염소젖(`goat_milk` — 가축 산물) — 아가리를 묶은 **가죽 젖 부대**에서 흰 젖이 비치고, 앞에 젖을 따른 작은 종지."""
    random.seed(1920)
    ico(0.52, (-0.16, 0.10, 0.44), subdiv=3, mat=M['g_leather'], scale=(1.15, 0.95, 0.85), jitter=0.04, smooth=True)
    for (x, y) in ((-0.62, -0.20), (-0.58, 0.44)):                                                            # 다리 자리 매듭
        ico(0.10, (x, y, 0.20), subdiv=2, mat=M['g_leather'], scale=(1.0, 1.0, 1.4), smooth=True)
    cyl(0.12, 0.26, (0.30, -0.06, 0.86), rot=(0.0, math.radians(35), 0), mat=M['g_leather'], verts=12)
    _ring(0.12, 0.03, (0.36, -0.06, 0.92), M['cord'], rot=(0, math.radians(35), 0), maj=16, mnr=6)
    cyl(0.09, 0.02, (0.44, -0.06, 1.0), rot=(0, math.radians(35), 0), mat=M['h_milk'], verts=12)
    n0 = len(OBJS)
    _bowl(0.26, 0.16, M['h_bowl'], base=0.6)
    cyl(0.24, 0.02, (0, 0, 0.165), mat=M['h_milk'], verts=20)
    for o in OBJS[n0:]:
        o.location.x += 0.52; o.location.y -= 0.50


def m_milk():
    """우유(`milk` — 가축 산물) — 나무 테를 두른 **나무 들통**에 가득 찬 흰 젖(손잡이)."""
    random.seed(1921)
    cone(0.46, 0.56, 0.80, (0, 0, 0.40), mat=M['plank'], verts=20)
    for z in (0.18, 0.62):
        _ring(0.52 + (z - 0.4) * 0.12, 0.03, (0, 0, z), M['g_leather'], maj=28, mnr=6)
    cyl(0.53, 0.03, (0, 0, 0.79), mat=M['h_milk'], verts=24)
    o = _ring(0.56, 0.025, (0, 0, 0.80), M['haft'], rot=(math.radians(90), 0, 0), maj=28, mnr=6)              # 손잡이(반원)
    o.scale = (1.0, 0.75, 1.0)


def m_ivory():
    """상아(`ivory` — 가축 산물) — 끝으로 갈수록 가늘게 휜 **미색 엄니** 하나(결 · 뿌리 쪽 단면)."""
    random.seed(1922)
    n = 16
    for j in range(n):
        t = j / (n - 1.0)
        a = t * 1.5
        x, z = -0.90 + math.sin(a) * 1.2 * 0.9, 0.12 + (1 - math.cos(a)) * 0.55
        r = 0.20 * (1 - t * 0.85) + 0.02
        ico(r, (x, -0.10 + t * 0.20, z), subdiv=2, mat=M['h_ivory'], scale=(1.3, 1.0, 1.0), smooth=True)
    cyl(0.19, 0.02, (-0.97, -0.10, 0.12), rot=(0, math.radians(90), 0), mat=M['h_tallow'], verts=20)           # 뿌리 쪽 단면


def m_linen():
    """리넨(`linen` — 가축 산물 갈래 · 아마 천) — 거친 회베이지 **아마 천** 한 필: 말린 두루마리와 앞으로 갠 자락 · 실 타래 하나."""
    random.seed(1923)
    cyl(0.26, 1.20, (-0.10, 0.24, 0.26), rot=(0, math.radians(90), 0.25), mat=M['h_linen'], verts=24)
    for k in range(3):
        box(0.90, 0.56, 0.035, (0.14 + k * 0.02, -0.34, 0.02 + k * 0.04), rot=(0, 0, 0.25), mat=M['h_linen'])
    o = _ring(0.16, 0.05, (0.66, -0.62, 0.06), M['h_flax'], maj=24, mnr=8)


def m_meat_beef():
    """쇠고기(`meat_beef` — 가축 산물) — 흰 결이 촘촘히 박힌 **검붉은 등심** 한 덩이(갈비뼈 하나 · 기름 테)."""
    random.seed(1924)
    o = ico(0.56, (0, 0, 0.18), subdiv=3, mat=M['h_beef'], scale=(1.30, 0.95, 0.36), jitter=0.03, smooth=True)
    o = ico(0.56, (-0.04, 0.06, 0.15), subdiv=3, mat=M['h_tallow'], scale=(1.36, 1.02, 0.30), smooth=True)   # 기름 테
    cyl(0.07, 1.10, (0.10, 0.58, 0.14), rot=(0, math.radians(90), -0.15), mat=M['g_bone'], verts=10)         # 갈비뼈
    ico(0.09, (0.68, 0.50, 0.14), subdiv=2, mat=M['g_bone'], smooth=True)


def m_meat_mutton():
    """양고기(`meat_mutton` — 가축 산물) — 뼈가 길게 나온 **양갈비** 셋(분홍 살 · 흰 기름 테)을 나란히 놓았다."""
    random.seed(1925)
    for k in range(3):
        y = (k - 1) * 0.34
        o = ico(0.30, (-0.10, y, 0.14), subdiv=3, mat=M['h_mutton'], scale=(1.20, 0.55, 0.40), smooth=True)
        o = ico(0.32, (-0.14, y, 0.12), subdiv=3, mat=M['h_tallow'], scale=(1.22, 0.60, 0.34), smooth=True)
        cyl(0.05, 0.70, (0.50, y + 0.04, 0.16), rot=(0, math.radians(90), 0.05), mat=M['g_bone'], verts=10)
        ico(0.06, (0.86, y + 0.06, 0.16), subdiv=2, mat=M['g_bone'], smooth=True)


def m_meat_pork():
    """돼지고기(`meat_pork` — 가축 산물) — 분홍 살과 흰 비계가 **켜켜이 쌓인** 삼겹 덩이(위에 껍질) 하나와 썬 조각 둘."""
    random.seed(1926)
    layers = (('h_porkskin', 0.06), ('h_porkfat', 0.08), ('h_porklean', 0.10), ('h_porkfat', 0.05), ('h_porklean', 0.10), ('h_porkfat', 0.07))
    z = 0.0
    for (m, h) in layers[::-1]:
        box(1.20, 0.62, h, (-0.10, 0.12, z + h / 2), rot=(0, 0, 0.2), mat=M[m])
        z += h
    for k in range(2):
        z = 0.0
        for (m, h) in layers[::-1]:
            box(0.12, 0.50, h, (0.68 + k * 0.18, -0.46 + k * 0.04, z + h / 2), rot=(0, math.radians(8), 0.2), mat=M[m])
            z += h


def m_silk_raw():
    """비단 원사(`silk_raw` — 가축 산물 · 누에고치에서 켠 실) — 흰 **누에고치** 무더기와 켜 낸 윤 나는 **생사 타래**."""
    random.seed(1927)
    for k in range(7):
        a = k * 0.9; d = 0.10 + (k % 3) * 0.12
        o = ico(0.14, (-0.30 + math.cos(a) * d, 0.24 + math.sin(a) * d, 0.12 + (k % 2) * 0.08), subdiv=2, mat=M['h_cocoon'], scale=(1.5, 1.0, 1.0), smooth=True)
        o.rotation_euler = (0, 0, a)
    for k in range(6):
        o = _ring(0.34 + k * 0.012, 0.04, (0.36, -0.30, 0.05 + k * 0.025), M['h_silkthread'], maj=40, mnr=6)
        o.scale = (1.0, 0.50, 1.0)


def m_silkworm():
    """누에(`silkworm` — 가축 산물) — 뽕잎 위에 올라 앉은 **흰 누에** 셋(마디진 몸)."""
    random.seed(1928)
    for (x, y, a) in ((-0.10, 0.10, 0.3), (0.30, 0.20, 1.6), (-0.30, -0.10, -0.4)):
        _leafy(x, y, 0.04, 0.80, 0.62, a, M['h_mulleaf'])
    for (x, y, a) in ((-0.20, 0.10, 0.4), (0.24, 0.22, 1.9), (-0.06, -0.24, -0.5)):
        for j in range(9):
            t = j / 8.0
            r = 0.075 * (1 - abs(t - 0.4) * 0.8) + 0.02
            ico(r, (x + math.cos(a) * (t - 0.5) * 0.56, y + math.sin(a) * (t - 0.5) * 0.56 + math.sin(t * 5) * 0.03, 0.12 + r * 0.4), subdiv=2,
                mat=M['h_silkworm'], smooth=True)
        ico(0.05, (x + math.cos(a) * 0.30, y + math.sin(a) * 0.30, 0.13), subdiv=1, mat=M['h_cassava'])


def m_wool():
    """양털(`wool` — 가축 산물) — 깎아 낸 **보송한 미색 털 뭉치**와 자아 감은 털실 공 하나."""
    random.seed(1929)
    for k in range(14):
        a = k * 2.399; d = math.sqrt(k / 14.0) * 0.55
        ico(random.uniform(0.18, 0.26), (math.cos(a) * d - 0.12, math.sin(a) * d + 0.08, 0.20 + (0.55 - d) * 0.40), subdiv=2, mat=M['h_wool'],
            jitter=0.22, smooth=True)
    ico(0.22, (0.58, -0.50, 0.22), subdiv=3, mat=M['h_wool'], smooth=True)
    for k in range(5):
        _ring(0.225, 0.018, (0.58, -0.50, 0.22), M['h_wool'], rot=(k * 0.7, k * 0.45, 0), maj=28, mnr=4)
    cyl(0.018, 0.50, (0.86, -0.70, 0.04), rot=(0, math.radians(90), -0.5), mat=M['h_wool'], verts=5)          # 풀린 실


def m_lobster():
    """바닷가재(`lobster` — 바다 갈래) — 검푸른 껍데기에 주황 마디 · **큰 집게 둘**과 마디진 꼬리 · 긴 더듬이."""
    random.seed(1930)
    ico(0.24, (0.10, 0.0, 0.18), subdiv=3, mat=M['h_lobster'], scale=(1.6, 1.0, 0.85), smooth=True)          # 머리가슴
    for j in range(6):                                                                                         # 꼬리 마디
        t = j / 5.0
        ico(0.17 - t * 0.04, (-0.30 - t * 0.56, 0.0, 0.14 - t * 0.03), subdiv=2, mat=(M['h_lobster'] if j % 2 == 0 else M['h_lobsterj']),
            scale=(0.9, 1.2, 0.7), smooth=True)
    for sgn in (-1, 1):
        o = ico(0.10, (0.42, sgn * 0.20, 0.16), subdiv=2, mat=M['h_lobsterj'], scale=(1.8, 0.7, 0.7), smooth=True); o.rotation_euler = (0, 0, sgn * 0.6)
        o = ico(0.20, (0.72, sgn * 0.42, 0.16), subdiv=3, mat=M['h_lobster'], scale=(1.8, 0.95, 0.65), smooth=True); o.rotation_euler = (0, 0, sgn * 0.3)   # 집게
        for k in (-1, 1):
            o = ico(0.08, (0.98, sgn * 0.48 + k * 0.05, 0.16), subdiv=2, mat=M['h_lobsterj'], scale=(1.8, 0.6, 0.6), smooth=True); o.rotation_euler = (0, 0, sgn * 0.3 + k * 0.2)
        cyl(0.012, 1.1, (0.80, sgn * 0.14, 0.26), rot=(0, math.radians(82), sgn * 0.25), mat=M['h_lobsterj'], verts=4)   # 더듬이
        for k in range(3):                                                                                     # 다리
            cyl(0.02, 0.30, (0.10 - k * 0.12, sgn * 0.26, 0.10), rot=(math.radians(90) * sgn * -1 + sgn * 0.4, 0, 0), mat=M['h_lobsterj'], verts=5)
    o = ico(0.18, (-1.02, 0.0, 0.10), subdiv=2, mat=M['h_lobsterj'], scale=(0.6, 1.5, 0.3), smooth=True)        # 꼬리 부채


def m_murex_shell():
    """자색고둥(`murex_shell` — 바다 갈래 · 자색 염료의 고둥) — 가시가 돋은 **방추꼴 고둥**(긴 수관) · 아가리 안쪽이 자줏빛."""
    random.seed(1931)
    for j in range(7):                                                                                         # 나선 층
        t = j / 6.0
        ico(0.34 * (1 - t * 0.75) + 0.04, (-0.10 + t * 0.70, 0.0, 0.26 + t * 0.06), subdiv=2, mat=M['h_murex'], scale=(0.9, 1.0, 0.9), smooth=True)
        for k in range(5):                                                                                     # 가시
            a = k * 1.257 + j * 0.6
            r = 0.34 * (1 - t * 0.75) + 0.04
            cone(0.035, 0.0, 0.16, (-0.10 + t * 0.70, math.cos(a) * r, 0.26 + math.sin(a) * r * 0.9), rot=(-a + math.pi / 2, 0, 0), mat=M['h_murex'], verts=5)
    cyl(0.06, 0.70, (-0.70, 0.0, 0.22), rot=(0, math.radians(84), 0), mat=M['h_murex'], verts=8)              # 긴 수관
    o = ico(0.18, (-0.16, -0.20, 0.30), subdiv=2, mat=M['h_purple'], scale=(1.6, 0.4, 0.9), smooth=True)       # 아가리 안(자줏빛)


def m_grain_sheaf():
    """볏단(`grain_sheaf` — 주민이 벤 곡식 다발 · 무게 표) — 밑동을 세워 묶은 **누런 곡식 한 단** · 고개 숙인 이삭이 위로 퍼졌다."""
    random.seed(1932)
    for i in range(26):
        a = random.uniform(0, math.tau); d = random.uniform(0, 0.20); tilt = d * 1.1
        cyl(0.022, 1.30, (math.cos(a) * d, math.sin(a) * d, 0.65), rot=(math.sin(a) * -tilt * 0.6, math.cos(a) * tilt * 0.6, 0), mat=M['straw'], verts=5)
    _ring(0.17, 0.045, (0, 0, 0.55), M['cord'])
    for i in range(16):                                                                                        # 고개 숙인 이삭
        a = i * 0.393; d = 0.22 + (i % 3) * 0.06
        o = ico(0.06, (math.cos(a) * d, math.sin(a) * d, 1.28 - (i % 2) * 0.06), subdiv=2, mat=M['h_kern1'], scale=(1.0, 1.0, 2.4), smooth=True)
        o.rotation_euler = (math.sin(a) * 0.9, -math.cos(a) * 0.9, 0)


def m_bronze_tool():
    """청동 도구(`bronze_tool` — econ 칸 '청동 도구') — 부채꼴 날의 **청동 도끼**(선형동부 — 청동기 한반도의 표지 청동기)를 나무 자루에 물렸다 · 녹이 앉았다."""
    random.seed(1933)
    cyl(0.07, 1.50, (-0.24, 0.0, 0.16), rot=(0, math.radians(86), 0), mat=M['haft'], verts=9)                  # 자루
    o = box(0.34, 0.20, 0.30, (0.58, 0.0, 0.24), mat=M['h_bronzemet'])                                        # 투겁(자루 끼우는 몸)
    o = box(0.30, 0.10, 0.60, (0.86, 0.0, 0.24), mat=M['h_bronzemet'])                                        # 부채꼴 날
    for v in o.data.vertices:
        if v.co.x > 0:
            v.co.z *= 1.35
    for k in range(4):
        ico(0.06, (0.62 + k * 0.08, -0.10, 0.20 + (k % 2) * 0.14), subdiv=1, mat=M['h_patina'], scale=(1.4, 0.3, 1.0), jitter=0.2)
    _lash(0.44, 0.0, 0.18, (0, math.radians(90), 0), r=0.035, ln=0.14, n=1)


def m_iron_tool():
    """철 도구(`iron_tool` — econ 칸 '철 도구') — 반달처럼 휜 **쇠 낫**(나무 자루 · 날 끝이 뾰족)."""
    random.seed(1934)
    cyl(0.07, 1.10, (-0.50, 0.0, 0.14), rot=(0, math.radians(88), 0.2), mat=M['haft'], verts=9)                # 자루
    for j in range(12):                                                                                        # 휜 날
        t = j / 11.0
        a = math.pi * 0.95 * t
        x, y = 0.10 + math.sin(a) * 0.62, 0.62 - math.cos(a) * 0.62
        o = box(0.20, 0.10 - t * 0.06, 0.04, (x, y - 0.62, 0.14), rot=(0, 0, a), mat=M['h_ironmet'])
    box(0.20, 0.08, 0.06, (0.02, 0.0, 0.14), rot=(0, 0, 0.2), mat=M['h_ironmet'])                              # 슴베


def m_crude_rod():
    """막대 낚싯대(`crude_rod` — T1065 급조 사다리 · 잔가지 1 + 풀 2 · 제작창 도구 칸 · 첫 1시간 모두) — 조잡한 돌도끼에서 돌 날을 뺀 몫 그대로:
    껍질 그대로인 **긴 잔가지 장대**(끝으로 가늘고 살짝 휜다) · 밑동을 풀로 감은 손잡이 · 풀 꼰 **낚싯줄**(장대에 감고 끝에서 늘어뜨렸다).
    재질은 조잡한 연장 셋과 같다(`bark2` 자루 · `fiber` 끈) — 같은 재료는 같은 그림."""
    random.seed(1950)
    pts = []
    for j in range(9):                                                                                     # 장대(마디 아홉 · 끝이 들린다)
        t = j / 8.0
        pts.append((-1.00 + t * 2.10, -0.02 * t, 0.10 + 0.34 * t * t))
    for j in range(8):
        (x0, y0, z0), (x1, y1, z1) = pts[j], pts[j + 1]
        L = math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2 + (z1 - z0) ** 2)
        ry = math.atan2(x1 - x0, z1 - z0)
        cyl(0.062 - j * 0.0055, L * 1.06, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), rot=(0, ry, 0), mat=M['bark2'], verts=8)
    _lash(-0.78, 0.0, 0.12, (0, math.radians(86), 0), r=0.07, ln=0.05, n=5, gap=0.06)                       # 손잡이(풀 감기)
    for k in range(4):                                                                                     # 장대에 감아 둔 줄
        _ring(0.07, 0.016, (-0.30 + k * 0.05, 0.0, 0.135 + k * 0.004), M['fiber'], rot=(0, math.radians(84), 0), maj=14, mnr=4)
    tx, ty, tz = pts[-1]
    line = []
    for j in range(13):                                                                                    # 끝에서 늘어뜨린 줄(처진 곡선)
        t = j / 12.0
        line.append((tx - 0.02 - t * 0.55, ty - 0.10 - t * 0.55, tz - 0.42 * math.sin(t * math.pi * 0.62) - t * 0.06))
    for j in range(12):
        (x0, y0, z0), (x1, y1, z1) = line[j], line[j + 1]
        dx, dy, dz = x1 - x0, y1 - y0, z1 - z0
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        o = cyl(0.016, L * 1.1, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat=M['fiber'], verts=5)
        from mathutils import Vector
        o.rotation_euler = Vector((dx, dy, dz)).to_track_quat('Z', 'Y').to_euler()
    lx, ly, lz = line[-1]
    ico(0.05, (lx, ly, lz), subdiv=1, mat=M['fiber'], jitter=0.2)                                         # 줄 끝 매듭


def _stalks(n, L, mat, seed, spread=0.05):
    """누운 줄기 다발(x 축) — 밑동을 한데 모았다."""
    random.seed(seed)
    for i in range(n):
        dy = (i - (n - 1) / 2) * spread
        cyl(0.02, L, (0.0, dy, 0.06 + (i % 2) * 0.03), rot=(0, math.radians(90), dy * 0.5), mat=mat, verts=5)


def m_oats():
    """귀리(`oats` — 농산물 갈래 · 곡식) — 벤 귀리 한 줌: 줄기 끝에 **가지 친 이삭**(성긴 원뿔꼴 · 낱알이 가는 꼭지에 매달려 늘어진다) · 밑동을 볏짚으로 묶었다.
    밀 · 보리 · 쌀(한 줄기에 뭉친 이삭 · 제 그림)과 이삭 꼴로 갈린다."""
    random.seed(1951)
    _stalks(5, 1.60, M['straw'], 19511)
    cyl(0.16, 0.06, (-0.50, 0.0, 0.08), rot=(0, math.radians(90), 0), mat=M['straw'], verts=12)
    o = OBJS[-1]; o.scale = (0.6, 1.0, 1.0)
    for i in range(5):
        dy = (i - 2) * 0.05
        x0 = 0.80
        for k in range(9):                                                                                 # 가지 친 이삭(층마다 둘)
            t = k / 8.0
            for sgn in (-1, 1):
                a = sgn * (0.5 + 0.5 * (1 - t))
                bx, by = x0 + t * 0.50, dy + sgn * (0.05 + 0.20 * (1 - t))
                cyl(0.008, 0.22 * (1 - t) + 0.06, ((x0 + t * 0.50 + bx) / 2, (dy + by) / 2, 0.09 + (i % 2) * 0.03), rot=(0, math.radians(90), a), mat=M['j_oat'], verts=4)
                o = ico(0.045, (bx, by, 0.06 + (i % 2) * 0.03), subdiv=1, mat=M['j_oat'], scale=(1.5, 0.8, 0.8), smooth=True)
                o.rotation_euler = (0, 0, a)


def m_rye():
    """호밀(`rye` — 농산물 갈래 · 곡식) — 벤 호밀 한 줌: 줄기 끝에 **가늘고 긴 이삭**(회록빛 · 긴 까끄라기)이 곧게 뻗었다 · 밑동을 볏짚으로 묶었다."""
    random.seed(1952)
    _stalks(5, 1.50, M['straw'], 19521)
    cyl(0.16, 0.06, (-0.50, 0.0, 0.08), rot=(0, math.radians(90), 0), mat=M['straw'], verts=12)
    o = OBJS[-1]; o.scale = (0.6, 1.0, 1.0)
    for i in range(5):
        dy = (i - 2) * 0.06 * 1.6
        for k in range(10):                                                                                # 긴 이삭(낱알 열 쌍)
            t = k / 9.0
            for sgn in (-1, 1):
                o = ico(0.034, (0.78 + t * 0.62, dy * (1 + t * 0.3) + sgn * 0.022, 0.08 + (i % 2) * 0.03), subdiv=1, mat=M['j_rye'], scale=(1.6, 0.8, 0.8), smooth=True)
                o.rotation_euler = (0, 0, sgn * 0.25)
                cyl(0.004, 0.26, (0.86 + t * 0.62, dy * (1 + t * 0.3) + sgn * 0.07, 0.09 + (i % 2) * 0.03), rot=(0, math.radians(90), sgn * 0.35), mat=M['j_rye'], verts=3)   # 까끄라기


def _logstack(bark, wood, seed, ring=None, n=3):
    """통나무 무더기 — 아래 둘 · 위 하나(같은 길이) · **벤 면이 보는 쪽**(나이테 결 · 변재 테)으로 돌려 놓았다.
    종은 껍질 · 속 빛으로만 갈린다(같은 함수 일곱)."""
    random.seed(seed)
    n0 = len(OBJS)
    for (y, z, r) in ((-0.26, 0.26, 0.26), (0.26, 0.26, 0.26), (0.0, 0.70, 0.25))[:n]:
        L = 0.62
        cyl(r, L, (0.0, y, z), rot=(0, math.radians(90), 0), mat=bark, verts=18)
        cyl(r * 0.92, 0.02, (L / 2 + 0.006, y, z), rot=(0, math.radians(90), 0), mat=(ring or wood), verts=18)    # 변재 테
        cyl(r * (0.80 if ring else 0.90), 0.025, (L / 2 + 0.012, y, z), rot=(0, math.radians(90), 0), mat=wood, verts=18)   # 심재
        for k in range(2):                                                                                         # 나이테
            _ring(r * (0.30 + k * 0.25), 0.006, (L / 2 + 0.026, y, z), M['scorch'] if wood is not M['j_ebonywood'] else M['j_sapwood'],
                  rot=(0, math.radians(90), 0), maj=20, mnr=3)
    _spin(n0, math.radians(-38))


def m_pine_log():
    """소나무 통나무(`pine_log` — 숲 갈래 · 벤 것) — 붉은 **거북등 껍질**의 통나무 셋 · 벤 면은 연노랑 나이테."""
    _logstack(M['j_pinebark'], M['j_pinewood'], 1953)


def m_oak_log():
    """참나무 통나무(`oak_log`) — 깊이 갈라진 **검회갈 껍질**의 통나무 셋 · 벤 면은 연갈색."""
    _logstack(M['j_oakbark'], M['j_oakwood'], 1954)


def m_birch_log():
    """자작나무(`birch_log`) — **흰 껍질에 검은 껍질눈**의 통나무 셋 · 벤 면은 흰 미색(자작나무 수액 그릇과 같은 껍질 재질)."""
    _logstack(M['h_birchbark'], M['j_birchwood'], 1955)


def m_cedar_log():
    """삼나무(`cedar_log`) — 붉은 **섬유질 껍질**의 통나무 셋 · 벤 면은 분홍 붉은빛."""
    _logstack(M['j_cedarbark'], M['j_cedarwood'], 1956)


def m_ebony_log():
    """흑단(`ebony_log` — 숲 갈래 · 벤 것) — 네모로 다듬은 **새까만 각재** 셋 · 모서리에 흰 변재가 남았다."""
    _beams(M['j_ebonywood'], 1957, edge=M['j_sapwood'])


def m_mahogany_log():
    """마호가니(`mahogany_log`) — 네모로 다듬은 **짙은 적갈 각재** 셋(곧은 결)."""
    _beams(M['j_mahowood'], 1958)


def m_teak_log():
    """티크(`teak_log`) — 네모로 다듬은 **금갈색 각재** 셋(기름 먹은 윤)."""
    _beams(M['j_teakwood'], 1959)


def _sprig(x, y, ang, L, stem, leaf, pairs, lw, ll, seed, lift=0.10, tilt=0.15):
    """잎줄기 하나(누운 것) — 줄기를 따라 잎이 마주난다. `ang` 은 끝 방향."""
    random.seed(seed)
    ca, sa = math.cos(ang), math.sin(ang)
    cyl(0.022, L, (x + ca * L / 2, y + sa * L / 2, lift), rot=(0, math.radians(90), ang), mat=stem, verts=6)
    for k in range(pairs):
        t = 0.25 + 0.75 * k / max(1, pairs - 1)
        px, py = x + ca * L * t, y + sa * L * t
        for sgn in (-1, 1):
            a = ang + sgn * 0.9
            o = ico(ll * 0.5, (px + math.cos(a) * ll * 0.45, py + math.sin(a) * ll * 0.45, lift + 0.02), subdiv=2, mat=leaf,
                    scale=(1.0, lw / ll, 0.12), smooth=True)
            o.rotation_euler = (sgn * tilt, 0, a)
    o = ico(ll * 0.42, (x + ca * (L + ll * 0.3), y + sa * (L + ll * 0.3), lift + 0.03), subdiv=2, mat=leaf, scale=(1.0, lw / ll, 0.14), smooth=True)
    o.rotation_euler = (0, 0, ang)


def _bunch(stems, tie=(-0.40, 0.0)):
    """잎줄기 다발 — 밑동을 끈으로 묶었다(약초 그림과 같은 묶음 문법)."""
    cyl(0.12, 0.10, (tie[0], tie[1], 0.11), rot=(0, math.radians(90), 0), mat=M['cord'], verts=12)


def m_basil():
    """바질(`basil` — 향신료 갈래 · 잎) — **윤 나는 넓은 달걀꼴 잎**이 마주난 줄기 셋을 묶었다."""
    for i, (dy, a) in enumerate(((-0.18, -0.25), (0.0, 0.0), (0.20, 0.28))):
        _sprig(-0.60, dy, a, 1.10, M['h_stem'], M['j_basil'], 4, 0.26, 0.40, 1960 + i)
    _bunch(None)


def m_mint():
    """박하(`mint` — 향신료 갈래 · 잎) — 자줏빛 네모 줄기에 **톱니 진 작은 잎**이 촘촘히 마주난 줄기 넷."""
    for i, (dy, a) in enumerate(((-0.24, -0.30), (-0.08, -0.08), (0.08, 0.10), (0.24, 0.32))):
        _sprig(-0.60, dy, a, 1.10, M['j_mintstem'], M['j_mint'], 6, 0.17, 0.26, 1961 + i)
    _bunch(None)


def m_coriander():
    """고수(`coriander` — 향신료 갈래 · 잎) — 가는 줄기 끝에 **잘게 갈라진 둥근 잎**(연두)이 부채처럼 퍼진 한 줌."""
    random.seed(1962)
    for i in range(7):
        a = -0.6 + i * 0.2
        cyl(0.015, 1.00, (-0.40 + math.cos(a) * 0.50, math.sin(a) * 0.50, 0.10), rot=(0, math.radians(90), a), mat=M['h_stem'], verts=5)
        cx, cy = -0.40 + math.cos(a) * 1.05, math.sin(a) * 1.05
        for k in range(5):                                                                                # 갈라진 잎 조각
            b = a + (k - 2) * 0.55
            o = ico(0.10, (cx + math.cos(b) * 0.12, cy + math.sin(b) * 0.12, 0.12), subdiv=2, mat=M['j_corian'], scale=(1.0, 0.8, 0.12), smooth=True)
            o.rotation_euler = (0, 0, b)
    _bunch(None, tie=(-0.30, 0.0))


def m_thyme():
    """타임(`thyme` — 향신료 갈래 · 잎) — 나무질 잔가지에 **좁쌀만 한 회록 잎**이 촘촘한 작은 다발."""
    random.seed(1963)
    for i in range(9):
        a = -0.45 + i * 0.11
        cyl(0.018, 1.10, (-0.40 + math.cos(a) * 0.55, math.sin(a) * 0.55, 0.10 + (i % 2) * 0.03), rot=(0, math.radians(90), a), mat=M['j_woody'], verts=5)
        for k in range(12):
            t = 0.35 + 0.65 * k / 11.0
            ico(0.035, (-0.40 + math.cos(a) * 1.10 * t + random.uniform(-0.03, 0.03), math.sin(a) * 1.10 * t + random.uniform(-0.03, 0.03), 0.13 + (i % 2) * 0.03),
                subdiv=1, mat=M['j_thyme'], scale=(1.3, 1.0, 0.6))
    _bunch(None, tie=(-0.30, 0.0))


def m_rosemary():
    """로즈마리(`rosemary` — 향신료 갈래 · 잎) — 나무질 가지에 **바늘꼴 짙은 잎**이 빽빽하고 연하늘 꽃이 몇 점."""
    random.seed(1964)
    for i in range(5):
        a = -0.30 + i * 0.15
        cyl(0.025, 1.20, (-0.40 + math.cos(a) * 0.60, math.sin(a) * 0.60, 0.10 + (i % 2) * 0.04), rot=(0, math.radians(90), a), mat=M['j_woody'], verts=6)
        for k in range(16):
            t = 0.25 + 0.75 * k / 15.0
            for sgn in (-1, 1):
                b = a + sgn * 1.1
                px, py = -0.40 + math.cos(a) * 1.20 * t, math.sin(a) * 1.20 * t
                cyl(0.014, 0.14, (px + math.cos(b) * 0.06, py + math.sin(b) * 0.06, 0.12 + (i % 2) * 0.04), rot=(0, math.radians(90), b), mat=M['j_rosemary'], verts=4)
        for k in range(2):
            t = 0.5 + k * 0.3
            ico(0.035, (-0.40 + math.cos(a) * 1.20 * t, math.sin(a) * 1.20 * t + 0.05, 0.17), subdiv=1, mat=M['j_rosebloom'])
    _bunch(None, tie=(-0.30, 0.0))


def m_sage_herb():
    """세이지 향초(`sage_herb` — 향신료 갈래 · 잎) — **은빛 회록 털잎**(길쭉한 타원 · 잎맥이 오돌토돌)이 달린 줄기 셋."""
    for i, (dy, a) in enumerate(((-0.18, -0.22), (0.0, 0.0), (0.20, 0.25))):
        _sprig(-0.60, dy, a, 1.05, M['h_stem'], M['j_sage'], 3, 0.20, 0.46, 1965 + i)
    _bunch(None)


def m_lavender():
    """라벤더(`lavender` — 향신료 갈래 · 꽃) — 긴 줄기 끝의 **보랏빛 꽃이삭** 한 다발(밑동을 끈으로 묶었다)."""
    random.seed(1966)
    for i in range(9):
        a = -0.40 + i * 0.10
        cyl(0.016, 1.30, (-0.50 + math.cos(a) * 0.65, math.sin(a) * 0.65, 0.10 + (i % 2) * 0.03), rot=(0, math.radians(90), a), mat=M['h_stem'], verts=5)
        for k in range(7):                                                                                # 꽃이삭(층층)
            t = k / 6.0
            o = ico(0.045, (-0.50 + math.cos(a) * (1.30 + t * 0.36), math.sin(a) * (1.30 + t * 0.36), 0.11 + (i % 2) * 0.03), subdiv=1, mat=M['j_lavender'],
                    scale=(1.0, 1.0, 1.0), jitter=0.15)
    _bunch(None, tie=(-0.20, 0.0))


def _rock(x, y, z, r, mat, sc=(1.2, 1.0, 0.8), jit=0.22, seed=None):
    """바탕돌 덩이(광석 · 돌 공통) — 모난 이코스피어."""
    return ico(r, (x, y, z), subdiv=2, mat=mat, scale=sc, jitter=jit, seed=seed, smooth=False)


def m_bauxite():
    """보크사이트(`bauxite` — 광물 갈래 · 광석) — **붉은 갈흙돌**에 콩알만 한 알갱이(피솔라이트)가 박힌 덩이 둘."""
    random.seed(1967)
    _rock(0.0, 0.0, 0.34, 0.52, M['j_bauxite'])
    _rock(0.62, -0.36, 0.16, 0.26, M['j_bauxite'])
    for k in range(22):
        a = random.uniform(0, math.tau); u = random.uniform(-0.2, 1.0)
        r = math.sqrt(max(0, 1 - u * u))
        ico(0.06, (math.cos(a) * r * 0.58, math.sin(a) * r * 0.50, 0.34 + u * 0.40), subdiv=2, mat=M['j_pisolith'], smooth=True)


def m_chromium():
    """크롬(`chromium` — 광물 갈래 · 크롬철석) — **윤 도는 검은 알갱이 광석** 덩이와 깨진 조각(쇠빛 결정면)."""
    random.seed(1968)
    _rock(0.0, 0.0, 0.36, 0.54, M['j_chromite'], sc=(1.15, 1.0, 0.85), jit=0.18)
    for k in range(6):
        a = random.uniform(0, math.tau)
        o = box(0.18, 0.16, 0.04, (math.cos(a) * 0.40, math.sin(a) * 0.34, 0.50), rot=(random.uniform(-0.5, 0.5), random.uniform(-0.5, 0.5), a), mat=M['j_cobaltite'])   # 쇠빛 면
    _rock(0.66, -0.40, 0.14, 0.22, M['j_chromite'], jit=0.3)


def m_cobalt():
    """코발트(`cobalt` — 광물 갈래 · 휘코발트석) — 갈색 바탕돌의 은회색 쇠빛 결정 사이로 **분홍 보라 코발트 꽃**(풍화 피막)이 두껍게 앉았다."""
    random.seed(1969)
    _rock(0.0, 0.0, 0.30, 0.50, M['j_matrix'], sc=(1.25, 1.0, 0.75))
    for k in range(6):                                                                                    # 쇠빛 결정
        a = random.uniform(0, math.tau); d = random.uniform(0.0, 0.40)
        box(0.16, 0.16, 0.16, (math.cos(a) * d, math.sin(a) * d * 0.8, 0.54), rot=(0.6, 0.5, a), mat=M['j_cobaltite'])
    for k in range(22):                                                                                   # 코발트 꽃
        a = random.uniform(0, math.tau); d = math.sqrt(random.uniform(0, 1)) * 0.58
        ico(random.uniform(0.09, 0.14), (math.cos(a) * d, math.sin(a) * d * 0.8, 0.44 + (0.58 - d) * 0.18), subdiv=2, mat=M['j_erythrite'], scale=(1.3, 1.0, 0.5), jitter=0.2, smooth=True)


def m_magnesite():
    """마그네사이트(`magnesite` — 광물 갈래) — **사기 같은 흰 덩이**(꽃양배추처럼 울퉁불퉁) 셋."""
    random.seed(1970)
    for (x, y, r) in ((0.0, 0.0, 0.42), (0.56, -0.30, 0.28), (-0.50, -0.30, 0.24)):
        ico(r, (x, y, r * 0.8), subdiv=3, mat=M['j_magnesite'], scale=(1.15, 1.0, 0.85), jitter=0.08, smooth=True)
        for k in range(6):
            a = k * 1.05 + x
            ico(r * 0.35, (x + math.cos(a) * r * 0.75, y + math.sin(a) * r * 0.65, r * 1.15), subdiv=2, mat=M['j_magnesite'], smooth=True)


def m_manganese():
    """망간(`manganese` — 광물 갈래 · 연망간석) — 그을음 같은 **검은 포도송이꼴 덩이**와, 흰 돌을 깨면 드러나는 **검은 고사리 무늬**(수지상 망간) 판."""
    random.seed(1971)
    for k in range(20):                                                                                   # 포도송이 덩이
        a = random.uniform(0, math.tau); d = math.sqrt(random.uniform(0, 1)) * 0.36
        ico(random.uniform(0.10, 0.16), (-0.30 + math.cos(a) * d, 0.24 + math.sin(a) * d * 0.8, 0.22 + (0.36 - d) * 0.50), subdiv=2, mat=M['j_pyrolusite'], smooth=True)
    box(0.90, 0.70, 0.08, (0.36, -0.30, 0.04), rot=(0, 0, 0.3), mat=M['j_limestone'])                     # 흰 판돌
    for b in range(4):                                                                                    # 고사리 무늬(가지 친 검은 결)
        a0 = 0.3 + b * 0.5; x0, y0 = 0.10 + b * 0.12, -0.52 + b * 0.10
        for k in range(6):
            t = k / 5.0
            px, py = x0 + math.cos(a0 + 1.2) * t * 0.36, y0 + math.sin(a0 + 1.2) * t * 0.36
            box(0.10, 0.018, 0.01, (px, py, 0.085), rot=(0, 0, a0 + 1.2), mat=M['j_pyrolusite'])
            for sgn in (-1, 1):
                box(0.08 * (1 - t * 0.5), 0.012, 0.01, (px + math.cos(a0 + 1.2 + sgn * 0.8) * 0.04, py + math.sin(a0 + 1.2 + sgn * 0.8) * 0.04, 0.086), rot=(0, 0, a0 + 1.2 + sgn * 0.8), mat=M['j_pyrolusite'])


def m_tungsten():
    """텅스텐(`tungsten` — 광물 갈래 · 철망간중석) — 흰 석영 바탕에 박힌 **윤 나는 흑갈색 판 결정** 다발."""
    random.seed(1972)
    _rock(0.0, 0.0, 0.26, 0.52, M['j_quartz'], sc=(1.3, 1.0, 0.6), jit=0.18)
    for k in range(8):
        a = random.uniform(-0.6, 0.6); d = random.uniform(-0.25, 0.25)
        box(0.46, 0.06, 0.36, (d * 0.6, d, 0.52), rot=(random.uniform(-0.3, 0.3), random.uniform(-0.2, 0.2), a + math.pi / 4), mat=M['j_wolfram'])


def m_zinc():
    """아연(`zinc` — 광물 갈래 · 능아연석) — 갈색 바탕돌을 덮은 **푸른 물빛 포도송이 피막**(아연 광석)."""
    random.seed(1973)
    _rock(0.0, 0.0, 0.28, 0.52, M['j_matrix'], sc=(1.3, 1.0, 0.65))
    for k in range(30):
        a = random.uniform(0, math.tau); d = math.sqrt(random.uniform(0, 1)) * 0.56
        ico(random.uniform(0.07, 0.12), (math.cos(a) * d, math.sin(a) * d * 0.8, 0.44 + (0.56 - d) * 0.22), subdiv=2, mat=M['j_smithson'], smooth=True)


def m_flint():
    """부싯돌(`flint` — 광물 갈래) — **흰 분필 껍질**을 쓴 덩이를 깨뜨려 유리 같은 검회색 속이 드러났다 · 날카로운 격지 둘."""
    random.seed(1974)
    o = ico(0.52, (-0.10, 0.10, 0.36), subdiv=2, mat=M['j_cortex'], scale=(1.2, 1.0, 0.78), jitter=0.12, smooth=True)
    o = ico(0.40, (0.24, -0.20, 0.34), subdiv=1, mat=M['j_flint'], scale=(1.0, 1.0, 0.85), jitter=0.20, smooth=False)    # 깨진 면
    for (x, y, rz) in ((0.70, -0.46, 0.4), (0.44, -0.70, -0.8)):                                              # 격지
        o = ico(0.16, (x, y, 0.04), subdiv=1, mat=M['j_flint'], scale=(1.6, 1.0, 0.2), jitter=0.25)
        o.rotation_euler = (0, 0, rz)


def m_granite():
    """화강암(`granite` — 광물 갈래 · 돌) — 다듬은 **분홍 · 회색 알갱이 돌 덩이**(검은 운모 점)."""
    random.seed(1975)
    o = box(1.10, 0.80, 0.56, (0, 0, 0.28), rot=(0, 0, 0.15), mat=M['j_granite'])
    for v in o.data.vertices:
        v.co.x *= 1 + random.uniform(-0.04, 0.04); v.co.y *= 1 + random.uniform(-0.04, 0.04)
    for k in range(40):
        face = random.choice((0, 1, 2))
        if face == 0:
            p = (random.uniform(-0.5, 0.5), random.uniform(-0.36, 0.36), 0.565)
        elif face == 1:
            p = (random.uniform(-0.5, 0.5), -0.405, random.uniform(0.05, 0.52))
        else:
            p = (0.555, random.uniform(-0.36, 0.36), random.uniform(0.05, 0.52))
        ico(0.022, p, subdiv=1, mat=M['h_coal'])


def m_limestone():
    """석회암(`limestone` — 광물 갈래 · 돌) — 깨낸 연한 미색 **돌 조각** 셋(모난 면) · 큰 조각에 조개 화석 자국."""
    random.seed(1976)
    _rock(0.0, 0.0, 0.30, 0.50, M['j_limestone'], sc=(1.3, 1.0, 0.70), jit=0.14)
    _rock(0.64, -0.34, 0.14, 0.22, M['j_limestone'], jit=0.2)
    _rock(-0.62, -0.36, 0.12, 0.18, M['j_limestone'], jit=0.2)
    for (x, y, r) in ((-0.16, -0.04, 0.13), (0.20, 0.10, 0.09)):
        for k in range(3):
            _ring(r * (0.35 + k * 0.33), 0.012, (x, y, 0.62), M['j_matrix'], maj=20, mnr=4)


def m_marble():
    """대리석(`marble` — 광물 갈래 · 돌) — 윤 낸 **흰 판돌**에 흐르는 회색 결 · 뒤에 덩이 하나."""
    random.seed(1977)
    _rock(-0.40, 0.42, 0.30, 0.40, M['j_marble'], sc=(1.2, 1.0, 0.8), jit=0.18)
    box(1.20, 0.80, 0.18, (0.10, -0.10, 0.09), rot=(0, 0, 0.2), mat=M['j_marble'])
    for k in range(5):                                                                                      # 결
        a = 0.2 + random.uniform(-0.5, 0.5)
        box(random.uniform(0.40, 0.80), 0.018, 0.01, (0.10 + random.uniform(-0.3, 0.3), -0.10 + random.uniform(-0.25, 0.25), 0.185), rot=(0, 0, a), mat=M['j_vein'])


def m_phosphate():
    """인광석(`phosphate` — 광물 갈래) — **숭숭한 회갈 덩이** 무더기(뼈 · 껍데기 조각이 굳은 돌 · 하나는 깨져 흰 조각이 보인다)."""
    random.seed(1978)
    for i in range(9):
        a = i * 2.399; d = math.sqrt(i / 9.0) * 0.56
        _rock(math.cos(a) * d, math.sin(a) * d, 0.18 + (0.56 - d) * 0.42, random.uniform(0.18, 0.26), M['j_phosphate'], sc=(1.15, 1.0, 0.85), jit=0.25)
    for k in range(6):
        a = random.uniform(0, math.tau)
        ico(0.04, (math.cos(a) * 0.30, math.sin(a) * 0.26, 0.50), subdiv=1, mat=M['g_bone'], jitter=0.3)


def _beams(wood, seed, edge=None):
    """각재 더미 — 껍질을 벗겨 **네모로 다듬은** 단단한 열대 나무(흑단 · 마호가니 · 티크 — 그 나무가 오가는 꼴): 아래 둘 · 위 하나 ·
    벤 면이 보는 쪽으로. 종은 속 빛으로만 갈린다(같은 함수 셋 · `edge` = 흑단의 흰 변재 모서리)."""
    random.seed(seed)
    n0 = len(OBJS)
    for (y, z) in ((-0.23, 0.19), (0.23, 0.19), (0.0, 0.57)):
        box(0.85, 0.42, 0.38, (0.0, y, z), mat=wood)
        box(0.014, 0.40, 0.36, (0.428, y, z), mat=wood)                                                   # 벤 면
        for k in range(3):                                                                                 # 벤 면의 나이테 결
            box(0.004, 0.36 - k * 0.10, 0.012, (0.436, y, z - 0.10 + k * 0.10), mat=M['scorch'] if edge is None else edge)
        if edge is not None:
            box(0.86, 0.06, 0.06, (0.0, y + 0.19, z + 0.17), mat=edge)                                     # 흰 변재 모서리
    _spin(n0, math.radians(-38))


# ═══════════════ [T1172] 어종 가공품 마흔셋 — 말린 것 21 · 절인 것 21 · 생선 절임 1(T1128 §4) ═══════════════
# ★키 = 서버 품목 키(`server/fish-preserve.js` — `dried_<종>` · `pickled_<종>` · 잡어 절임 `pickled_fish`) — `test-icons ⑮` 가 그 대조를 잰다.
# ★계보(T76 ⑥ · T67 캐논): 말린 것 · 절인 것은 **원물과 같은 물고기**다 — 원물 함수(`m_<종>`)를 그대로 부르고 그 몸에 가공만 입힌다
#   (새 몸틀 0 · 종을 가르는 꼴 · 빛 · 무늬는 원물이 이미 가진 것).
#   · 말린 것 = 살이 졸아 얇아지고(두께를 누른다) 빛이 누렇게 바래 어두워진다 · 널어 말린 꼴을 든다 —
#     지느러미 물고기 · 꿰미는 아가미로 꿴 끈(T76 `dried_fish` 그 문법) · 오징어 · 문어는 펴서 꿴 꼬챙이 둘 · 잔것(새우 · 게 · 멸치 · 미꾸라지 · 뱀장어)은 납작하게 졸았다.
#   · 절인 것 = 소금에 절어 빛이 희게 바래고 **켜켜이 쌓아** 소금을 쳤다 — 같은 물고기 두 마리를 눕혀 엇갈려 쌓고 위에 소금 알갱이(염장 생선 꼴).
# ★빛 바래기 = 화면 빛(sRGB)에 **더하는** 몫이다 — 섞기(lerp)나 곱하기는 종 사이 빛 차이를 줄여 짐 창에서 종이 안 갈린다(1패스 실측: 섞기 판은
#   마른 잉어 ↔ 마른 대구 |Δ| 21 · 그릇을 같이 쓴 판은 절인 명태 ↔ 절인 가물치 5.4 — `test-icons` 자 40 밑). 더하기는 종 사이 차이를 그대로 둔다.
# ★고증: 청동기 후기 한반도 — 말리기 · 소금 절임(자염)은 이 세계가 이미 가진 두 가공이다(`spoil.PRESERVE` · `salt`).
#   북어 · 과메기 · 새우젓 · 멸치젓 · 오징어젓은 이름만 고증 이름이고 그림 문법은 같다(같은 가공).

_T1172_OFF = {'dry': (-12, -40, -78), 'pale': (30, 22, -20), 'salt': (26, 30, 24)}   # 화면 빛(0~255)에 더하는 몫 — 마른 것 = 누렇고 어둡게 · 북어 = 누렇게 희게 · 절인 것 = 희게
_T1172_TINT = {}                                                 # (재질 이름, 갈래) → 바랜 사본(같은 재질은 한 번만 짓는다)


def _t1172_shift(c, off):
    """선형 빛 → 화면 빛(sRGB)에 `off` 를 더해 → 선형으로(0~1 로 자른다)."""
    out = []
    for i in range(3):
        l = max(0.0, c[i])
        sv = 12.92 * l if l <= 0.0031308 else 1.055 * (l ** (1 / 2.4)) - 0.055
        sv = min(1.0, max(0.0, sv + off[i] / 255.0))
        out.append(sv / 12.92 if sv <= 0.04045 else ((sv + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def _t1172_tint(mat, kind):
    """재질 사본 — 바탕 빛(Principled 기본값 · RGB 노드)만 바랜다. 결 · 범프 · 거칠기는 그대로(같은 살갗이 바랜 것)."""
    if mat is None:
        return None
    key = (mat.name, kind)
    if key in _T1172_TINT:
        return _T1172_TINT[key]
    off = _T1172_OFF[kind]
    m2 = mat.copy(); m2.name = mat.name + '_t1172' + kind
    for n in m2.node_tree.nodes:
        if n.type == 'RGB':
            n.outputs[0].default_value = _t1172_shift(n.outputs[0].default_value, off)
        elif n.type == 'BSDF_PRINCIPLED':
            bc = n.inputs["Base Color"]
            if not bc.is_linked:
                bc.default_value = _t1172_shift(bc.default_value, off)
            em = n.inputs.get("Emission Strength")
            if em is not None:
                em.default_value = 0.0                                                     # 가공품은 안 빛난다
    _T1172_TINT[key] = m2
    return m2


def _t1172_raw(sp):
    """원물을 그대로 짓고(같은 함수 · 같은 씨) 변환을 정점에 굽는다 — 그 뒤 가공은 세계 축 정점으로 한다."""
    n0 = len(OBJS)
    globals()['m_' + sp]()
    rc.bake_transforms()
    return OBJS[n0:]


def _t1172_box(objs):
    xs, ys, zs = [], [], []
    for o in objs:
        for v in o.data.vertices:
            xs.append(v.co.x); ys.append(v.co.y); zs.append(v.co.z)
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def _t1172_paint(objs, kind):
    for o in objs:
        for i, sl in enumerate(o.material_slots):
            if sl.material is not None:
                o.material_slots[i].material = _t1172_tint(sl.material, kind)


# 원물 그림의 꼴 — 선 몸(옆모습이 카메라를 본다)과 누운 몸
_T1172_UPRIGHT = ('salmon', 'cod', 'herring', 'trout', 'pollock', 'carp', 'crucian', 'catfish', 'snakehead', 'mandarin',
                  'barbel', 'sweetfish', 'sardine', 'minnow', 'shrimp', 'fish')
_T1172_SPREAD = ('squid', 'octopus')                                         # 말릴 때 펴서 꼬챙이에 꿴다
_T1172_SPLIT = ('cod', 'herring', 'salmon')                                  # 배를 갈라 펴서 말린다(대구포 · 과메기 · 연어포) — 눕혀 넓게 편 몸에 벌림 꼬챙이
_T1172_PALE = ('pollock',)                                                   # 북어 — 한겨울 덕장에서 얼었다 녹으며 말라 누렇게 희다(어둡게 안 바랜다)
_T1172_TAIL = ('carp',)                                                      # 잉어 — 꼬리를 묶어 머리를 아래로 매달아 말린다(굵은 몸은 세로로 걸어야 고루 마른다)


def _dried(sp):
    """말린 것 — 원물(`m_<종>`)과 **같은 물고기**를 말렸다(T76 `_fish(dried=True)` 문법을 종마다)."""
    random.seed(11720)
    objs = _t1172_raw(sp)
    _t1172_paint(objs, 'pale' if sp in _T1172_PALE else 'dry')
    x0, x1, y0, y1, z0, z1 = _t1172_box(objs)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    if sp in _T1172_SPLIT:
        for o in objs:                                                                       # 눕혀(옆구리가 위를 본다) 넓게 편다 — 갈라 벌린 몸
            for v in o.data.vertices:
                x, y, z = v.co.x, v.co.y - cy, v.co.z - cz
                v.co.y, v.co.z = -z * 1.85, y * 0.45
        x0, x1, y0, y1, z0, z1 = _t1172_box(objs)
        for o in objs:
            for v in o.data.vertices:
                v.co.z -= z0
        for f in (0.30, 0.70):                                                               # 벌림 꼬챙이 둘(편 몸을 버틴다)
            cyl(0.026, (y1 - y0) + 0.24, (x0 + (x1 - x0) * f, (y0 + y1) / 2, (z1 - z0) + 0.03),
                rot=(math.radians(90), 0, 0), mat=M['bark2'], verts=6)
    elif sp in _T1172_UPRIGHT:
        for o in objs:                                                                       # ★살이 졸았다 — 두께(옆 폭)를 눌러 같은 실루엣을 남긴다
            for v in o.data.vertices:
                v.co.y = cy + (v.co.y - cy) * 0.55
        if sp in _T1172_TAIL:                                                                # 꼬리를 위로 세운다(머리가 아래) · 꼬리에 묶은 끈 고리
            for o in objs:
                for v in o.data.vertices:
                    x, z = v.co.x - cx, v.co.z - (z0 + z1) / 2
                    v.co.x, v.co.z = cx + z, -x + (x1 - x0) / 2                              # 길이가 높이로 · 몸 높이가 너비로(같은 몸을 세웠다)
            zt = (x1 - x0)
            cyl(0.030, 0.62, (cx, cy, zt + 0.22), mat=M['fiber'], verts=6)                     # 꼬리 묶은 끈(위로)
            cyl(0.030, 0.70, (cx, cy, zt + 0.52), rot=(0, math.radians(90), 0), mat=M['bark2'], verts=6)   # 건 장대
        elif sp not in ('minnow', 'shrimp'):                                                 # 피라미는 원물부터 꿰미다
            zc = z0 + (z1 - z0) * 0.80
            cyl(0.030, (x1 - x0) + 0.50, (cx, cy, zc), rot=(0, math.radians(90), math.radians(-3)),
                mat=M['fiber'], verts=6)                                                     # 아가미로 꿴 끈(널어 말린다)
    elif sp in _T1172_SPREAD:
        for o in objs:                                                                       # 펴서 말렸다 — 높이를 눌러 납작하게
            for v in o.data.vertices:
                v.co.z = z0 + (v.co.z - z0) * 0.42
        zt = z0 + (z1 - z0) * 0.42 + 0.03
        cyl(0.030, (x1 - x0) + 0.30, (cx, cy, zt), rot=(0, math.radians(90), 0), mat=M['bark2'], verts=6)          # 길게 꿴 꼬챙이
        cyl(0.028, (y1 - y0) + 0.30, (cx - (x1 - x0) * 0.18, cy, zt + 0.02), rot=(math.radians(90), 0, 0),
            mat=M['bark2'], verts=6)                                                         # 가로 꼬챙이(편 몸을 버틴다)
    else:
        for o in objs:                                                                       # 졸아붙었다 — 높이를 누른다
            for v in o.data.vertices:
                v.co.z = z0 + (v.co.z - z0) * 0.60


def _pickled(sp):
    """절인 것 — 원물(`m_<종>`)과 **같은 물고기 둘**이 소금에 절어 켜켜이 엇갈려 누웠고 위에 소금이 앉았다
    (배를 갈라 펴 말리는 종은 절일 때도 갈라 편다 — 자반)."""
    random.seed(11721)
    a = _t1172_raw(sp)
    b = _t1172_raw(sp)                                                                       # 같은 함수 · 같은 씨 — 같은 물고기 한 마리 더
    _t1172_paint(a + b, 'salt')
    x0, x1, y0, y1, z0, z1 = _t1172_box(a)
    cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
    lay = sp in _T1172_UPRIGHT
    for k, objs in enumerate((a, b)):
        ang = math.radians(-14 if k == 0 else 62)
        ca, sa = math.cos(ang), math.sin(ang)
        for o in objs:
            for v in o.data.vertices:
                x, y, z = v.co.x - cx, v.co.y - cy, v.co.z - cz
                if lay:                                                                      # 선 몸은 눕힌다 — 옆구리(무늬)가 위를 본다
                    y, z = -z, y
                    if sp in _T1172_SPLIT:                                                   # 자반 — 배를 갈라 펴서 소금 친다(말린 것과 같은 갈래)
                        y, z = y * 1.85, z * 0.45
                x, y = x * ca - y * sa, x * sa + y * ca
                v.co.x, v.co.y, v.co.z = x, y, z
    for k, objs in enumerate((a, b)):                                                        # 바닥에 놓고 둘째를 첫째 위에
        bx0, bx1, by0, by1, bz0, bz1 = _t1172_box(objs)
        lift = (-bz0) if k == 0 else (_t1172_box(a)[5] * 0.50 - bz0)                         # 둘째 밑 = 첫째 높이의 반(겹쳐 누른다)
        for o in objs:
            for v in o.data.vertices:
                v.co.z += lift
    x0, x1, y0, y1, z0, z1 = _t1172_box(a + b)
    for i in range(18):                                                                      # 위에 친 소금
        t = random.uniform(0.0, 1.0)
        ico(random.uniform(0.030, 0.050),
            (x0 + (x1 - x0) * random.uniform(0.15, 0.85), y0 + (y1 - y0) * random.uniform(0.15, 0.85), z1 - 0.02 - t * 0.10),
            subdiv=1, mat=M['saltx'], scale=(1.2, 1.2, 0.6), jitter=0.30, smooth=False)

# 마흔셋 — 말린 것 · 절인 것은 원물 함수 이름을 그대로 넘긴다(`test-icons ⑮` 가 짝을 잰다)
def m_dried_anchovy():    _dried('anchovy')
def m_pickled_anchovy():  _pickled('anchovy')
def m_dried_carp():    _dried('carp')
def m_pickled_carp():  _pickled('carp')
def m_dried_cod():    _dried('cod')
def m_pickled_cod():  _pickled('cod')
def m_dried_crab():    _dried('crab')
def m_pickled_crab():  _pickled('crab')
def m_dried_herring():    _dried('herring')
def m_pickled_herring():  _pickled('herring')
def m_dried_octopus():    _dried('octopus')
def m_pickled_octopus():  _pickled('octopus')
def m_dried_pollock():    _dried('pollock')
def m_pickled_pollock():  _pickled('pollock')
def m_dried_salmon():    _dried('salmon')
def m_pickled_salmon():  _pickled('salmon')
def m_dried_sardine():    _dried('sardine')
def m_pickled_sardine():  _pickled('sardine')
def m_dried_shrimp():    _dried('shrimp')
def m_pickled_shrimp():  _pickled('shrimp')
def m_dried_squid():    _dried('squid')
def m_pickled_squid():  _pickled('squid')
def m_dried_trout():    _dried('trout')
def m_pickled_trout():  _pickled('trout')
def m_dried_barbel():    _dried('barbel')
def m_pickled_barbel():  _pickled('barbel')
def m_dried_catfish():    _dried('catfish')
def m_pickled_catfish():  _pickled('catfish')
def m_dried_crucian():    _dried('crucian')
def m_pickled_crucian():  _pickled('crucian')
def m_dried_eel():    _dried('eel')
def m_pickled_eel():  _pickled('eel')
def m_dried_loach():    _dried('loach')
def m_pickled_loach():  _pickled('loach')
def m_dried_mandarin():    _dried('mandarin')
def m_pickled_mandarin():  _pickled('mandarin')
def m_dried_minnow():    _dried('minnow')
def m_pickled_minnow():  _pickled('minnow')
def m_dried_snakehead():    _dried('snakehead')
def m_pickled_snakehead():  _pickled('snakehead')
def m_dried_sweetfish():    _dried('sweetfish')
def m_pickled_sweetfish():  _pickled('sweetfish')
def m_pickled_fish():  _pickled('fish')


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
# ★[T1067] 어종 열셋 · 사냥 산출 · 손도구 · 장비 갈래 · 광물 — 위 31종(`test-icons ①` 이 그 수를 못 박는다) **뒤에 따로** 붙인다(아래 옷 여섯과 같은 꼴).
#   키는 서버 정본(민물 `freshfish.SPECIES` · 바다 `seafish` 해안 표)과 같다 — `test-icons ⑫` 가 그 대조를 잰다.
ITEMS_T1067 = [
    ('crucian', m_crucian), ('catfish', m_catfish), ('snakehead', m_snakehead), ('mandarin', m_mandarin),
    ('barbel', m_barbel), ('minnow', m_minnow), ('sweetfish', m_sweetfish), ('eel', m_eel), ('loach', m_loach),
    ('sardine', m_sardine), ('anchovy', m_anchovy), ('octopus', m_octopus), ('squid', m_squid),
    # ── 사냥 산출 아홉 · 익힌 것 둘(날것과 같은 함수) · 손도구 둘 · 장비 갈래 셋 · 광물 둘 ──
    ('meat_game', m_meat_game), ('meat_game_cooked', m_meat_game_cooked), ('meat_bear', m_meat_bear),
    ('meat_bear_cooked', m_meat_bear_cooked), ('meat_chicken', m_meat_chicken), ('bone', m_bone), ('fur', m_fur),
    ('leather', m_leather), ('horn', m_horn), ('feather', m_feather), ('egg', m_egg),
    ('hammer', m_hammer), ('saw', m_saw), ('weapon', m_weapon), ('tool', m_tool), ('armor', m_armor),
    ('obsidian', m_obsidian), ('sulfur', m_sulfur),
]
ITEMS += ITEMS_T1067
# ★[T1088] 그림 없는 품목 이어서 — 차례 = 첫 1시간 제작창 음식 칸 → 곳간 · 거래 · 게시판 빈도(보고/T1088 §1) → 빌린 그림이 다른 물건으로 보이는 것.
#   키는 서버 정본 그대로(무게 표 · 요리 표 `tidal.cookMap` · 곳간 묶음 `villages.PV_INV_GROUPS`) — `test-icons ⑬` 이 그 대조를 잰다.
ITEMS_T1088 = [
    ('food_cooked', m_food_cooked), ('clam_stew', m_clam_stew), ('seaweed_soup', m_seaweed_soup), ('food', m_food),
    ('bronze', m_bronze), ('ramie', m_ramie), ('hemp', m_hemp), ('clothes', m_clothes), ('resin', m_resin),
    ('cooked_food', m_cooked_food), ('clay', m_clay), ('tigerhide', m_tigerhide),
    # ── ② 빌린 그림이 다른 물건으로 보이던 것 — 숲(서 있는 나무 그림) · 광물(광석 그림) ──
    ('amber_resin', m_amber_resin), ('bamboo', m_bamboo), ('beeswax', m_beeswax), ('birch_sap', m_birch_sap),
    ('chamomile', m_chamomile), ('cork', m_cork), ('fruit_berries', m_fruit_berries), ('ginseng', m_ginseng),
    ('wild_ginseng', m_wild_ginseng), ('latex', m_latex), ('rubber', m_rubber), ('nuts', m_nuts),
    ('paper_mulberry', m_paper_mulberry), ('truffle', m_truffle),
    ('amber_raw', m_amber_raw), ('coal', m_coal), ('kaolin', m_kaolin), ('mercury', m_mercury),
    ('nitrate', m_nitrate), ('sand', m_sand), ('soda_ash', m_soda_ash),
    # ── ② 향신료(약초 풀 그림) · 농산물(곡물 밭 그림) ──
    ('black_pepper', m_black_pepper), ('cumin', m_cumin), ('cardamom', m_cardamom), ('clove', m_clove), ('nutmeg', m_nutmeg),
    ('star_anise', m_star_anise), ('cinnamon', m_cinnamon), ('vanilla', m_vanilla), ('saffron', m_saffron), ('paprika', m_paprika),
    ('turmeric', m_turmeric), ('frankincense', m_frankincense), ('myrrh', m_myrrh), ('musk', m_musk),
    ('apple', m_apple), ('banana', m_banana), ('cassava', m_cassava), ('chickpea', m_chickpea), ('chili', m_chili),
    ('cocoa', m_cocoa), ('coconut', m_coconut), ('coffee', m_coffee), ('corn', m_corn), ('cotton', m_cotton),
    ('dates', m_dates), ('fig', m_fig), ('flax', m_flax), ('lentil', m_lentil), ('mango', m_mango), ('mulberry', m_mulberry),
    ('olive', m_olive), ('onion', m_onion), ('peanut', m_peanut), ('pineapple', m_pineapple), ('potato', m_potato),
    ('pumpkin', m_pumpkin), ('sugarbeet', m_sugarbeet), ('sugarcane', m_sugarcane), ('sweet_potato', m_sweet_potato),
    ('tobacco', m_tobacco), ('tomato', m_tomato),
    # ── ① 남은 점선 — 보석 · 주화 · 위세품(곳간 · 거래 0회 — 갈래 차례) ──
    ('diamond', m_diamond), ('ruby', m_ruby), ('sapphire', m_sapphire), ('emerald', m_emerald), ('amethyst', m_amethyst),
    ('topaz', m_topaz), ('turquoise', m_turquoise), ('jade_polished', m_jade_polished), ('amber_polished', m_amber_polished),
    ('gold_coin', m_gold_coin), ('silver_coin', m_silver_coin), ('relic', m_relic), ('iron_relic', m_iron_relic), ('scroll', m_scroll),
    # ── ① 남은 점선 — 공예품 · 가축 산물 · 바다 · 그 밖 ──
    ('beer', m_beer), ('wine', m_wine), ('soy_sauce', m_soy_sauce), ('kimchi', m_kimchi), ('bread', m_bread), ('bow', m_bow),
    ('brush', m_brush), ('ink', m_ink), ('paper', m_paper), ('clay_brick', m_clay_brick), ('stone_brick', m_stone_brick),
    ('dye_indigo', m_dye_indigo), ('dye_purple', m_dye_purple), ('glass', m_glass), ('perfume', m_perfume), ('pottery', m_pottery),
    ('silk_cloth', m_silk_cloth),
    ('beef_tallow', m_beef_tallow), ('cheese', m_cheese), ('duck_meat', m_duck_meat), ('goat_milk', m_goat_milk), ('milk', m_milk),
    ('ivory', m_ivory), ('linen', m_linen), ('meat_beef', m_meat_beef), ('meat_mutton', m_meat_mutton), ('meat_pork', m_meat_pork),
    ('silk_raw', m_silk_raw), ('silkworm', m_silkworm), ('wool', m_wool),
    ('lobster', m_lobster), ('murex_shell', m_murex_shell),
    ('grain_sheaf', m_grain_sheaf), ('bronze_tool', m_bronze_tool), ('iron_tool', m_iron_tool),
]
ITEMS += ITEMS_T1088
# ★[T1099] 셋째 묶음 — 차례 = 제작창 도구 칸의 새 품목(T1065 막대 낚싯대 · 첫 1시간 모두) → 같은 꼴로 빌리던 스물여덟(곡물 둘 · 통나무 일곱 · 잎 향초 일곱 · 광석 일곱 · 돌 다섯).
#   빌림 셋(`herbs` · `sage` · `meteorite`)과 `jade` 는 같은 물건 판정이라 안 굽는다(보고/T1099 §4) — `test-icons ⑭` 가 이 표를 잰다.
ITEMS_T1099 = [
    ('crude_rod', m_crude_rod),
    ('oats', m_oats), ('rye', m_rye),
    ('pine_log', m_pine_log), ('oak_log', m_oak_log), ('birch_log', m_birch_log), ('cedar_log', m_cedar_log),
    ('ebony_log', m_ebony_log), ('mahogany_log', m_mahogany_log), ('teak_log', m_teak_log),
    ('basil', m_basil), ('mint', m_mint), ('coriander', m_coriander), ('thyme', m_thyme), ('rosemary', m_rosemary),
    ('sage_herb', m_sage_herb), ('lavender', m_lavender),
    ('bauxite', m_bauxite), ('chromium', m_chromium), ('cobalt', m_cobalt), ('magnesite', m_magnesite),
    ('manganese', m_manganese), ('tungsten', m_tungsten), ('zinc', m_zinc),
    ('flint', m_flint), ('granite', m_granite), ('limestone', m_limestone), ('marble', m_marble), ('phosphate', m_phosphate),
]
ITEMS += ITEMS_T1099

# ★[T1172] 어종 가공품 마흔셋(T1128 §4) — 키 = `server/fish-preserve.js items()` 그대로(종 차례 = `fishing.FISH_ITEMS`) · `test-icons ⑮` 가 이 표를 잰다.
ITEMS_T1172 = [
    ('dried_anchovy', m_dried_anchovy), ('pickled_anchovy', m_pickled_anchovy),
    ('dried_carp', m_dried_carp), ('pickled_carp', m_pickled_carp),
    ('dried_cod', m_dried_cod), ('pickled_cod', m_pickled_cod),
    ('dried_crab', m_dried_crab), ('pickled_crab', m_pickled_crab),
    ('dried_herring', m_dried_herring), ('pickled_herring', m_pickled_herring),
    ('dried_octopus', m_dried_octopus), ('pickled_octopus', m_pickled_octopus),
    ('dried_pollock', m_dried_pollock), ('pickled_pollock', m_pickled_pollock),
    ('dried_salmon', m_dried_salmon), ('pickled_salmon', m_pickled_salmon),
    ('dried_sardine', m_dried_sardine), ('pickled_sardine', m_pickled_sardine),
    ('dried_shrimp', m_dried_shrimp), ('pickled_shrimp', m_pickled_shrimp),
    ('dried_squid', m_dried_squid), ('pickled_squid', m_pickled_squid),
    ('dried_trout', m_dried_trout), ('pickled_trout', m_pickled_trout),
    ('dried_barbel', m_dried_barbel), ('pickled_barbel', m_pickled_barbel),
    ('dried_catfish', m_dried_catfish), ('pickled_catfish', m_pickled_catfish),
    ('dried_crucian', m_dried_crucian), ('pickled_crucian', m_pickled_crucian),
    ('dried_eel', m_dried_eel), ('pickled_eel', m_pickled_eel),
    ('dried_loach', m_dried_loach), ('pickled_loach', m_pickled_loach),
    ('dried_mandarin', m_dried_mandarin), ('pickled_mandarin', m_pickled_mandarin),
    ('dried_minnow', m_dried_minnow), ('pickled_minnow', m_pickled_minnow),
    ('dried_snakehead', m_dried_snakehead), ('pickled_snakehead', m_pickled_snakehead),
    ('dried_sweetfish', m_dried_sweetfish), ('pickled_sweetfish', m_pickled_sweetfish),
    ('pickled_fish', m_pickled_fish),
]
ITEMS += ITEMS_T1172
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
    # ★[T132] 상자 못박기 — 소품 세계 스프라이트는 크롭 없이 **그대로 배포**되므로
    #   배포 앵커(`public/assets/props/props_anchors.json`)와 규격이 정확히 같아야 한다.
    rc.assert_pinned_box(os.path.join(HERE, "..", "public", "assets", "props", "props_anchors.json"),
                         key, rec["w"], rec["h"], rec["ox"], rec["oy"], label="props")
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
