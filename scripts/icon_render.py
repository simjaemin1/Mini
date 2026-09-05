# icon_render.py — durango-mini 인벤토리 아이콘 3D 렌더 (rock_render.py v3 / tree_render.py 와 동일 씬)
#   씬·카메라·조명 정본: Cycles·film_transparent·ORTHO·ISO_DIR(1,-1,1.2)·태양 52°/35° energy 3.6·월드 (0.52,0.56,0.6)@0.55
#   우분투 apt Blender 4.0.2 는 OpenImageDenoise 미포함 → build_options 감지해 자동 비활성 + SAMPLES 64.
# ★★[T77] 헬퍼·씬 값·프리셋은 `scripts/render_common.py` 한 벌이다 — 이 파일은 모델과 팔레트만 갖는다.
# 실행:  blender -b -P icon_render.py
# 결과:  ./icon_renders/<key>.png (512², 알파)  — 이후 node로 bbox 크롭 + 96px 리사이즈
# 고증: 청동기 후기(송국리). 금속은 구리/청동 톤만. 플라스틱·철기 금지.

import bpy, os, math, random, sys

# ★★[T77] 헬퍼·씬 값·프리셋은 `scripts/render_common.py` **한 벌**이다 — 여기 두 번 적지 않는다.
#   두 벌이던 시절의 함정(같은 이름, 다른 기본값)은 그 파일 머리의 표에 적어 두었다.
#   이 파일이 갖는 것은 **모델과 팔레트**뿐이다.
#   ⓘ `blender -b -P` 로 부르면 스크립트 폴더가 `sys.path` 에 없다 — 직접 넣는다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_common import (V, RES_ICON, SAMPLES, ISO_DIR, OBJS,
                           principled, simple_mat, striped_mat, bumped_mat,
                           add, box, cyl, cone, ico, plane, cord)
import render_common as rc

RES = RES_ICON                                   # 종전 이름 유지
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "icon_renders")
os.makedirs(OUTDIR, exist_ok=True)

# ===== 씬 — 정본은 render_common.build_scene =====
scene, cam, cam_d, sun, tgt = rc.build_scene("icon")

# ===== 공용 재질 =====
M = {}
M['bark']    = bumped_mat("i_bark",   (0.26, 0.16, 0.09), (0.15, 0.09, 0.05), 14, 0.45, 0.92)
M['peeled']  = striped_mat("i_peeled",(0.72, 0.56, 0.34), (0.60, 0.44, 0.25), 26, 0.75, bump=0.3)   # 껍질 벗긴 통나무
M['sawn']    = striped_mat("i_sawn",  (0.78, 0.63, 0.41), (0.66, 0.50, 0.30), 16, 0.7, bump=0.3)    # 판자
M['stone']   = bumped_mat("i_stone",  (0.34, 0.33, 0.31), (0.16, 0.16, 0.16), 9, 0.8, 0.95)
M['straw']   = striped_mat("i_straw", (0.83, 0.68, 0.30), (0.68, 0.52, 0.20), 34, 0.8, bump=0.3)    # 이엉·볏짚
M['grass']   = striped_mat("i_grass", (0.46, 0.55, 0.26), (0.34, 0.44, 0.18), 30, 0.7, bump=0.3)    # 풀 줄기(생)
M['drygrass']= striped_mat("i_drygrass",(0.62, 0.58, 0.28), (0.48, 0.44, 0.20), 28, 0.8, bump=0.3)  # 마른 풀 줄기(fiber — herb와 색 분리)
M['meat']    = striped_mat("i_meat",  (0.44, 0.11, 0.10), (0.56, 0.22, 0.19), 30, 0.5, bump=0.3)    # 붉은 살: 촘촘한 근섬유 결(scale 30 — 6은 굵은 띠라 '분홍 뇌'로 읽혔음)
M['fat']     = simple_mat("i_fat",    (0.80, 0.68, 0.60), 0.5)                             # 지방·힘줄(살빛에 가깝게 — 흰 막대로 안 읽히게)
M['seedhull']= striped_mat("i_seedhull",(0.46, 0.16, 0.14), (0.60, 0.30, 0.22), 24, 0.55, bump=0.3)  # 베리 씨앗 껍질(붉은 기)
M['cooked']  = striped_mat("i_cooked",(0.42, 0.22, 0.10), (0.26, 0.13, 0.06), 18, 0.5, bump=0.3)
M['hide']    = bumped_mat("i_hide",   (0.60, 0.44, 0.28), (0.44, 0.31, 0.19), 7, 0.35, 0.8)
M['leather'] = bumped_mat("i_leather",(0.40, 0.27, 0.16), (0.27, 0.17, 0.09), 11, 0.45, 0.7)
M['pottery'] = bumped_mat("i_pottery",(0.52, 0.32, 0.20), (0.38, 0.22, 0.13), 6, 0.3, 0.75)
M['jam']     = simple_mat("i_jam",    (0.35, 0.06, 0.10), 0.35)
M['berry']   = simple_mat("i_berry",  (0.20, 0.025, 0.05), 0.45)   # 짙은 붉은 열매(하이라이트로 밝아지므로 베이스는 어둡게)
M['seed']    = simple_mat("i_seed",   (0.78, 0.70, 0.50), 0.65)
M['copper']  = simple_mat("i_copper", (0.46, 0.20, 0.06), 0.35, metal=0.55)   # 구리빛 광석 결정(발광 제거 — 흰빛 뜸 방지)
M['soil']    = bumped_mat("i_soil",   (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95)
M['tamped']  = bumped_mat("i_tamped", (0.47, 0.37, 0.24), (0.33, 0.25, 0.15), 16, 0.35, 0.95)
M['flame']   = simple_mat("i_flame",  (1.0, 0.55, 0.12), 0.4, emit=(1.0, 0.52, 0.12), emit_str=6.0)
M['cord']    = simple_mat("i_cord",   (0.55, 0.45, 0.26), 0.85)
M['leafg']   = simple_mat("i_leafg",  (0.20, 0.38, 0.11), 0.55)
M['leafg2']  = simple_mat("i_leafg2", (0.33, 0.52, 0.17), 0.55)
M['flower']  = simple_mat("i_flower", (0.86, 0.82, 0.42), 0.5)
M['charcoal']= simple_mat("i_charcoal",(0.10, 0.09, 0.08), 0.9)
M['charc2']  = striped_mat("i_charc2", (0.018, 0.016, 0.015), (0.045, 0.042, 0.040), 26, 0.98, bump=0.3)  # 숯 — 새까맣게 탄 목결(1차 0.055는 화면에서 회색으로 읽혔다)
# ★[2026-08-02e ⑦ 야금 아이콘 8종] 배치 1 야금 사슬 산출물이 아이콘 없이 이모지 폴백이었다.
#   고증 색: 적철석/자철석 = 검붉은~쇳빛 · 정광 = 부순 알갱이 · 연철 = 회흑색 무광(청동처럼 안 빛난다)
#   운철 = 니켈 함유라 은빛에 가깝고 비드만슈테텐 무늬(줄무늬로 표현) · 납 = 무거운 청회색 · 주석 = 은백 무광
M['ironore'] = bumped_mat("i_ironore",(0.24, 0.13, 0.10), (0.13, 0.08, 0.07), 11, 0.7, 0.9)   # 검붉은 쇳돌(적철석)
M['ironmet'] = simple_mat("i_ironmet",(0.30, 0.29, 0.29), 0.55, metal=0.7)                     # 연철 — 회흑 무광(청동보다 덜 빛남)
M['meteor']  = striped_mat("i_meteor",(0.40, 0.40, 0.41), (0.26, 0.26, 0.28), 20, 0.30, bump=0.3)        # 운철 — 은빛 금속(1차 0.62는 흰 수정으로 읽혔다). 줄무늬=비드만슈테텐 결
M['tinmet']  = simple_mat("i_tinmet", (0.72, 0.73, 0.74), 0.4, metal=0.65)                     # 주석 — 은백
M['leadmet'] = simple_mat("i_leadmet",(0.40, 0.42, 0.46), 0.45, metal=0.6)                     # 납 — 청회색
M['coppermet']=simple_mat("i_coppermet",(0.55, 0.28, 0.11), 0.32, metal=0.75)                  # 구리 금속(광석 결정보다 밝게)
M['gangue']  = bumped_mat("i_gangue", (0.42, 0.40, 0.36), (0.26, 0.25, 0.22), 13, 0.6, 0.95)   # 맥석 섞인 잡석
# ★[2026-08-04a 배치 15 ④] 남은 4종 — 인벤에서 404 나던 키(silver·gold·nickel·jade_raw).
#   고증: 은·금은 청동기 npcMetals(era.js)라 잉곳이 맞다. 다만 주석 잉곳(0.72,0.73,0.74)과
#   **96px 에서 구분이 안 되면 아이콘이 아니다** — 색만이 아니라 **형태로도** 갈라 놓는다
#   (이 파일이 이미 쓴 수법: 잉곳이 초가지붕으로 읽혀 형태를 바꿨고, 운철이 골프공으로 읽혀 각지게 했다).
#     · 은  = 산출이 적어 **작은 빵떡 여러 개**(변색 살짝 낀 은백)
#     · 금  = 환원 불필요(REDUCTION_T gold=0 — 자연금)라 **작은 덩이 + 사금 알갱이**
#     · 니켈 = era.js 상 steel 대의 금속 — 두들긴 **각진 괴**(iron 형태 계열, 색은 노란 기 도는 은백)
#     · 옥 원석 = 금속이 아니다. 송국리기 곡옥·관옥의 원료 **연옥 원석** — 거친 겉면에 깨진 초록 속살
#   ⚠1차 렌더에서 배운 것(대조 시트 실측): metal 을 0.9 이상 주면 월드 색(0.52,0.56,0.6 푸른빛)이
#     반사로 얹혀 **금이 올리브색으로** 읽힌다. 이 씬에서 색이 사는 금속은 확산이 남아 있는 구리
#     (metal 0.75·rough 0.32)다 — 금도 그 대역으로 맞춘다. 은/니켈은 반대로 명도와 거칠기로 갈랐다.
M['silvermet'] = simple_mat("i_silvermet", (0.92, 0.92, 0.90), 0.18, metal=0.80)                # 은 — 밝고 매끈한 은백(니켈보다 확실히 밝게)
M['silvertar'] = simple_mat("i_silvertar", (0.24, 0.21, 0.18), 0.60, metal=0.55)                # 은 변색(황화은) — 짙은 갈흑 띠. 은임을 알리는 단서
M['goldmet']   = simple_mat("i_goldmet",   (0.92, 0.68, 0.13), 0.30, metal=0.72)                # 금 — 구리와 같은 대역(확산이 남아 색이 산다)
M['nickelmet'] = simple_mat("i_nickelmet", (0.55, 0.54, 0.47), 0.62, metal=0.60)                # 니켈 — 탁한 회황백 무광(은과 명도 대비)
M['jaderind']  = bumped_mat("i_jaderind",  (0.50, 0.48, 0.41), (0.33, 0.32, 0.27), 10, 0.60, 0.94)  # 옥 원석 겉껍질(풍화 회백)
M['jadecore']  = simple_mat("i_jadecore",  (0.20, 0.42, 0.22), 0.34)                            # 깨진 면의 연옥 속살 — 연옥은 민트가 아니라 **누런 기 도는 시금치 녹색**(rough 0.16 은 반사가 세 파스텔로 떴다)


# ===== 아이템 모델 =====
def m_pillar():   # 껍질 벗긴 통나무 기둥 — 밑동 굵고 위 가늘게, 도끼 자국 상단
    cyl(0.17, 2.2, (0, 0, 1.1), mat=M['peeled'], verts=16, smooth=False)
    cone(0.17, 0.10, 0.22, (0, 0, 2.30), mat=M['peeled'], verts=16)   # 다듬은 머리
    cyl(0.185, 0.10, (0, 0, 0.06), mat=M['bark'], verts=16, smooth=False)           # 밑동 껍질 자국

def m_rafter():   # 가는 장대 다발 — 5개 + 새끼 묶음
    random.seed(11)
    for i in range(5):
        a = i * 2 * math.pi / 5
        cyl(0.045, 2.0, (math.cos(a) * 0.09, math.sin(a) * 0.09, 1.0),
            rot=(random.uniform(-0.04, 0.04), random.uniform(-0.04, 0.04), 0), mat=M['peeled'], verts=10, smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.028, location=(0, 0, 1.15))
    add(bpy.context.active_object, M['cord'])

def m_thatch():   # 이엉(볏짚 다발) — 가는 줄기 다수 + 중간 결속
    random.seed(21)
    for i in range(46):
        a = random.uniform(0, 2 * math.pi); rr = random.uniform(0, 0.26)
        tilt = random.uniform(0.0, 0.12)
        cyl(0.016, random.uniform(1.5, 1.9),
            (math.cos(a) * rr, math.sin(a) * rr, 0.9),
            rot=(math.sin(a) * tilt, -math.cos(a) * tilt, 0), mat=M['straw'], verts=6, smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.035, location=(0, 0, 1.0))
    add(bpy.context.active_object, M['cord'])

def m_berry():    # 붉은 열매 몇 알 + 잔가지
    random.seed(31)
    pts = [(0, 0, 0.22), (0.30, 0.06, 0.20), (0.14, 0.28, 0.19), (-0.20, 0.16, 0.21)]
    for p in pts:
        ico(0.20, p, subdiv=3, mat=M['berry'], scale=(1, 1, 0.92), smooth=True)
    ico(0.15, (0.16, -0.16, 0.16), subdiv=3, mat=M['berry'], scale=(1, 1, 0.92), smooth=True)
    for p in pts[:3]:   # 꼭지
        cyl(0.018, 0.10, (p[0], p[1], p[2] + 0.19), mat=M['grass'], verts=6, smooth=False)

def m_fiber():    # 풀 줄기 다발 — 휜 잎날 + 결속
    random.seed(41)
    for i in range(22):
        a = random.uniform(0, 2 * math.pi); tilt = random.uniform(0.10, 0.42)
        d = V((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        o = plane(0.055, 1.5, d * 0.62 + V((0, 0, 0.30)), mat=M['drygrass'])
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        o.scale = (0.10, 1.0, 1.0)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.16, minor_radius=0.03, location=(0, 0, 0.16))
    add(bpy.context.active_object, M['cord'])

def m_meat_raw():  # 생고기 덩이 — 잘라낸 정육(각진 덩어리 + 지방 줄 + 절단면)
    random.seed(51)
    # 도려낸 살덩이: 저폴리 각짐(subdiv 1)으로 '잘린 고기'의 면이 서게 — 매끈한 구는 뇌처럼 보인다
    # 몸통 = 각진 저폴리 덩이. ★평면 '뚜껑' 박스를 얹지 않는다 — 얹으면 여행가방처럼 보인다(7차 1패스 실패).
    #   대신 살짝 납작한 덩이를 두 번 겹쳐 윗면이 자연스레 평평해지게(잘라낸 면) 한다.
    ico(0.60, (0, 0, 0.30), subdiv=1, mat=M['meat'], scale=(1.28, 0.92, 0.52), jitter=0.16, smooth=False)
    ico(0.46, (0.06, 0.04, 0.50), subdiv=1, mat=M['meat'], scale=(1.20, 0.88, 0.30), jitter=0.13, smooth=False)
    # ★지방·힘줄은 **절단면 안쪽에 묻는다** — 종전엔 실린더가 살 밖으로 못처럼 삐져나왔다.
    #   길이를 살 폭(≈1.5)보다 훨씬 짧게(0.34~0.46) 하고 중심 근처에 두어 양 끝이 살 안에서 끝나게 한다.
    #   z도 절단면(0.60)보다 살짝 아래(0.585)로 내려 표면에 얹히지 않고 박힌 것처럼 보이게.
    for i, (x, y, ln, r) in enumerate(((-0.16, 0.10, 0.46, 0.030), (0.10, -0.08, 0.40, 0.026), (0.28, 0.12, 0.34, 0.022))):
        cyl(r, ln, (x, y, 0.585), rot=(0, math.radians(88), 0.30 + i * 0.55), mat=M['fat'], verts=6, smooth=False)
    # 비계는 덩어리 가장자리에 '얹지 말고' 살 윤곽 안쪽으로 넣는다
    ico(0.13, (-0.40, -0.04, 0.34), subdiv=1, mat=M['fat'], scale=(0.5, 0.8, 0.30), jitter=0.18, smooth=False)

def m_meat_cooked():  # 구운 고기 꼬치
    random.seed(61)
    cyl(0.035, 2.1, (0, 0, 0.9), rot=(0, math.radians(62), 0), mat=M['peeled'], verts=8, smooth=False)
    for i, t in enumerate((-0.55, 0.0, 0.55)):
        c = V((math.sin(math.radians(62)) * t, 0, math.cos(math.radians(62)) * t)) + V((0, 0, 0.9))
        ico(0.30, c, subdiv=3, mat=M['cooked'], scale=(1.0, 0.85, 0.85), jitter=0.12, smooth=True)

def m_hide():     # 펼친 가죽 — 아주 납작한 판 + 사지/목 자락
    random.seed(71)
    ico(0.90, (0, 0, 0.03), subdiv=3, mat=M['hide'], scale=(1.0, 0.62, 0.028), jitter=0.05, smooth=True)
    for dx, dy, sx, sy in ((0.70, 0.44, 0.9, 0.5), (-0.70, 0.44, 0.9, 0.5),
                            (0.70, -0.44, 0.9, 0.5), (-0.70, -0.44, 0.9, 0.5)):
        ico(0.30, (dx, dy, 0.03), subdiv=2, mat=M['hide'], scale=(sx, sy, 0.045), jitter=0.08, smooth=True)
    ico(0.28, (0, 0.66, 0.03), subdiv=2, mat=M['hide'], scale=(0.7, 0.9, 0.045), jitter=0.08, smooth=True)   # 목
    ico(0.16, (0, -0.78, 0.03), subdiv=2, mat=M['hide'], scale=(0.6, 1.1, 0.04), jitter=0.10, smooth=True)   # 꼬리

def m_berry_jam():  # 토기 단지 + 붉은 내용물
    cone(0.42, 0.52, 0.55, (0, 0, 0.28), mat=M['pottery'], verts=28)
    cone(0.52, 0.34, 0.45, (0, 0, 0.78), mat=M['pottery'], verts=28)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.045, location=(0, 0, 1.00))
    add(bpy.context.active_object, M['pottery'])
    cyl(0.33, 0.06, (0, 0, 1.00), mat=M['jam'], verts=28, smooth=False)
    ico(0.10, (0.10, 0.06, 1.05), subdiv=2, mat=M['berry'], smooth=True)

def m_water_bottle():  # 가죽 물주머니 (청동기 — 플라스틱 금지)
    ico(0.52, (0, 0, 0.50), subdiv=3, mat=M['leather'], scale=(1.0, 0.72, 1.05), jitter=0.07, smooth=True)
    cyl(0.14, 0.34, (0, 0, 1.10), mat=M['leather'], verts=14, smooth=False)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.035, location=(0, 0, 1.14))
    add(bpy.context.active_object, M['cord'])
    cyl(0.13, 0.09, (0, 0, 1.30), mat=M['peeled'], verts=14, smooth=False)   # 나무 마개
    bpy.ops.mesh.primitive_torus_add(major_radius=0.44, minor_radius=0.028, location=(0, 0.02, 0.72), rotation=(math.radians(80), 0, 0))
    add(bpy.context.active_object, M['cord'])                   # 어깨끈

def m_seed_berry():  # 베리 씨앗 — 작고 붉은 기 도는 알갱이 무더기(달걀처럼 안 보이게 작고 많이·각지게)
    random.seed(81)
    pts = []
    for ring, (n, rr, z) in enumerate(((7, 0.26, 0.05), (5, 0.14, 0.10), (3, 0.05, 0.15))):
        for i in range(n):
            a = i * (2 * math.pi / n) + ring * 0.7
            pts.append((math.cos(a) * rr + random.uniform(-0.02, 0.02),
                        math.sin(a) * rr + random.uniform(-0.02, 0.02), z))
    for (x, y, z) in pts:
        o = ico(0.062, (x, y, z), subdiv=1, mat=M['seedhull'], scale=(1.0, 0.72, 0.52), jitter=0.22, smooth=False)
        o.rotation_euler = (random.uniform(-0.3, 0.3), random.uniform(-0.3, 0.3), random.uniform(0, 3.14))

def m_herb():     # 약초 다발(수확물) — ★8차: 눕힘 축 통일
    #   [7차의 결함] 잎은 rotation_euler=(88°, 0, AX+…) 였다. Blender XYZ 오일러에서 X축 88° 회전은
    #   평면의 긴 축(+Y)을 거의 +Z로 세운다 — 즉 **잎은 서 있었다**. 반면 줄기·끈은 (0, 90°, AX)로
    #   **누워** 있었다. 두 축이 서로 달라서 잎 하나가 다발과 직각으로 삐져나와 허공에 뜬 것처럼 보였다.
    #   [8차] 잎·줄기·끈을 **모두 AX 방향으로 눕힌다**. 평면의 긴 축 +Y를 월드 (cosAX, sinAX, 0)에
    #   맞추려면 Rz(AX − 90°)다(−sinθ=cosAX, cosθ=sinAX). 옆으로 벌리는 폭은 반드시 **AX의 수직 벡터**
    #   perp=(−sinAX, cosAX)를 따라야 한다(7차는 x만 sinAX를 곱해 축이 비틀렸다).
    random.seed(91)
    AX = 0.62                                   # 다발이 누운 방향(수평)
    ca, sa = math.cos(AX), math.sin(AX)
    px, py = -sa, ca                            # AX의 수직 — 잎을 옆으로 벌리는 축
    LAY = AX - math.pi / 2                      # 평면 긴 축(+Y)을 AX에 맞추는 Z회전
    for i in range(13):
        t = (i / 12) - 0.5                      # -0.5..0.5
        ln = 1.55 + random.uniform(-0.16, 0.16)
        # 8차 2패스: 폭이 전부 같아 '대파 묶음'처럼 균일해 보였다 → 잎폭을 층지게(0.075~0.15) +
        #   끝단 부챗살을 키워(0.34) 잎 끝이 벌어지는 약초 다발 실루엣으로.
        fan = t * 0.55 + random.uniform(-0.06, 0.06)   # 3패스: 끝단을 크게 벌려 '묶인 밑동 ↔ 퍼진 잎끝' 대비를 준다
        tilt = random.uniform(-0.10, 0.10)                # 살짝 들림(겹침 명암용) — 세우지는 않는다
        wid = (0.075, 0.11, 0.15)[i % 3]
        o = plane(1.0, 1.0, (px * t * 0.28, py * t * 0.28, 0.075 + abs(t) * 0.015),
                  mat=(M['leafg'] if i % 2 else M['leafg2']))
        o.rotation_euler = (tilt, 0, LAY + fan)
        o.scale = (wid, ln, 1.0)
    # 줄기 밑동 — 다발 한쪽 끝(−AX 방향)에 모임. 실린더 기본 축 Z → (0, 90°, AX)면 AX를 따라 눕는다.
    for i in range(5):
        cyl(0.017, 0.55, (-ca * 0.52 + px * (i - 2) * 0.035, -sa * 0.52 + py * (i - 2) * 0.035, 0.055),
            rot=(0, math.radians(90), AX), mat=M['grass'], verts=5, smooth=False)
    # 3패스: 잔잎(작은 곁잎) — 매끈한 줄기 묶음이 대파처럼 보이던 것을 약초답게. 눕힘 축은 동일하게 유지.
    for i, (tt, off, ln2) in enumerate(((0.34, 0.30, 0.62), (-0.28, 0.44, 0.55), (0.12, 0.56, 0.48), (-0.40, 0.18, 0.58))):
        o = plane(1.0, 1.0, (ca * off + px * tt * 0.34, sa * off + py * tt * 0.34, 0.105),
                  mat=(M['leafg2'] if i % 2 else M['leafg']))
        o.rotation_euler = (random.uniform(-0.12, 0.12), 0, LAY + tt * 1.25)
        o.scale = (0.085, ln2, 1.0)
    # 묶음 끈 — 다발 가운데를 감는다(고리 면이 AX에 수직)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.20, minor_radius=0.032,
                                     location=(-ca * 0.12, -sa * 0.12, 0.085),
                                     rotation=(0, math.radians(90), AX))
    add(bpy.context.active_object, M['cord'])

def m_ore():      # 구리빛 광석 덩이 — 모암 + 구리 결정
    random.seed(101)
    ico(0.60, (0, 0, 0.42), subdiv=1, mat=M['stone'], scale=(1.15, 1.0, 0.85), jitter=0.22, smooth=False)
    for i in range(6):
        a = i * 1.047 + 0.3
        # 육각 기둥 + 뾰족 머리 = 광맥 결정(각진 금속면). 짧고 굵게 — 당근 실루엣 회피.
        cyl(0.105, 0.30, (math.cos(a) * 0.30, math.sin(a) * 0.26, 0.74 + (i % 2) * 0.09),
            rot=(random.uniform(-0.45, 0.45), random.uniform(-0.45, 0.45), 0), mat=M['copper'], verts=6, smooth=False)
        cone(0.105, 0.0, 0.14, (math.cos(a) * 0.30, math.sin(a) * 0.26, 0.96 + (i % 2) * 0.09),
             mat=M['copper'], verts=6)

def m_wood():     # 통나무 토막 (눕힘) — 껍질 + 마구리 나이테
    cyl(0.42, 1.7, (0, 0, 0.42), rot=(0, math.radians(90), math.radians(18)), mat=M['bark'], verts=22, smooth=False)
    for s in (-1, 1):
        cyl(0.425, 0.04,
            (math.cos(math.radians(18)) * 0.86 * s, math.sin(math.radians(18)) * 0.86 * s, 0.42),
            rot=(0, math.radians(90), math.radians(18)), mat=M['peeled'], verts=22, smooth=False)

def m_plank():    # 판자 3장
    random.seed(111)
    for i in range(3):
        box(1.7, 0.46, 0.075, (i * 0.05, i * 0.10 - 0.10, 0.06 + i * 0.10),
            rot=(0, 0, math.radians(-4 + i * 4)), mat=M['sawn'])

def m_stone():    # 각진 돌덩이 (저폴리)
    random.seed(121)
    ico(0.72, (0, 0, 0.50), subdiv=1, mat=M['stone'], scale=(1.15, 1.0, 0.9), jitter=0.26, smooth=False)
    ico(0.26, (0.55, 0.30, 0.20), subdiv=1, mat=M['stone'], jitter=0.30, smooth=False)

def m_ore_chunk():  # 캔 것 — **정체 모를 원석 덩이**(선광 전). 맥석 섞인 잡석 3덩이, 금속기 없음
    random.seed(201)
    for i, (x, y, z, r) in enumerate([(0, 0, 0.40, 0.55), (0.52, 0.28, 0.26, 0.34), (-0.44, 0.34, 0.22, 0.28)]):
        ico(r, (x, y, z), subdiv=1, mat=M['gangue'], scale=(1.2, 1.0, 0.8), jitter=0.30, smooth=False)

def m_iron_ore():   # 철 정광 — 선광 뒤 **부순 알갱이 무더기**(원석과 달라야 한다: 잘고 균질하고 검붉다)
    random.seed(202)
    for i in range(14):
        a = i * 0.9
        rr = 0.10 + random.uniform(0, 0.055)
        ico(rr, (math.cos(a) * random.uniform(0, 0.44), math.sin(a) * random.uniform(0, 0.40),
                 0.10 + random.uniform(0, 0.20)), subdiv=1, mat=M['ironore'],
            scale=(1.1, 1.0, 0.85), jitter=0.35, smooth=False)

def m_charcoal():   # 숯 — 탄화한 나무 토막 3개(결이 남은 각재), 무광 검정
    random.seed(203)
    for (x, y, rot, ln) in [(-0.22, 0.10, 0.10, 1.05), (0.20, -0.06, -0.22, 0.95), (0.02, 0.30, 0.55, 0.80)]:
        cyl(0.135, ln, (x, y, 0.16), rot=(math.radians(90), 0, rot), mat=M['charc2'], verts=7, smooth=False)

def m_iron():       # 연철 괴(해면철을 두들겨 짠 것) — 각재에 가깝게 두들긴 덩이 + 망치 자국
    random.seed(204)
    box(1.20, 0.62, 0.34, (0, 0, 0.17), rot=(0, 0, math.radians(12)), mat=M['ironmet'])
    box(0.86, 0.46, 0.22, (0.06, 0.10, 0.44), rot=(0, math.radians(-7), math.radians(-16)), mat=M['ironmet'])
    ico(0.16, (-0.44, -0.18, 0.36), subdiv=1, mat=M['ironmet'], jitter=0.30, smooth=False)   # 떨어져 나간 슬래그 조각

def m_meteoric_iron():  # 운철 — 은빛 각진 덩이 + 융단 굴곡(regmaglypt).
    #   ⚠1차 시도는 subdiv=2 매끈 구체라 **골프공**으로 읽혔다. 각지게(subdiv=1·smooth=False) + 지터를 키운다.
    random.seed(205)
    ico(0.60, (0, 0, 0.44), subdiv=1, mat=M['meteor'], scale=(1.25, 0.90, 0.72), jitter=0.34, smooth=False)
    for i in range(3):
        a = i * 2.09 + 0.5
        ico(0.19, (math.cos(a) * 0.36, math.sin(a) * 0.28, 0.30 + (i % 2) * 0.28),
            subdiv=1, mat=M['meteor'], jitter=0.40, smooth=False)

def _ingot(mat, seed):   # 금속 잉곳 — **납작한 빵떡 잉곳**(bun ingot: 도가니 바닥 모양 그대로 굳은 것).
    #   ⚠1차 시도는 4각 뿔대 2개였는데 ISO 뷰에서 **초가지붕**으로 읽혔다 — 높이를 낮추고 지름을 키운다.
    #   고증: 청동기 잉곳은 도가니·주형 바닥에서 굳어 위가 볼록하고 아래가 평평한 원반형이다.
    random.seed(seed)
    cyl(0.66, 0.20, (0, 0, 0.10), mat=mat, verts=14, smooth=False)                       # 아래 원반(평평한 바닥)
    cone(0.66, 0.30, 0.16, (0, 0, 0.28), mat=mat, verts=14)                # 볼록한 위면
    cyl(0.40, 0.15, (0.30, 0.34, 0.44), rot=(0, math.radians(72), math.radians(20)), mat=mat, verts=12, smooth=False)  # 기대 세운 두 번째 덩이

def m_copper():   _ingot(M['coppermet'], 206)
def m_tin():      _ingot(M['tinmet'], 207)
def m_lead():     _ingot(M['leadmet'], 208)

# ★[2026-08-04a 배치 15 ④] 404 4종. 실루엣이 서로 다르도록 형태를 갈랐다(위 재질 주석 참조).
def m_silver():   # 은 — 작은 빵떡 3개(산출이 적어 소형 잉곳). 가운데 덩이에 **굵은 황화 변색 띠**.
    random.seed(209)
    for (x, y, z, r, h) in [(0, 0, 0.09, 0.48, 0.19), (0.52, 0.34, 0.08, 0.36, 0.17), (-0.42, 0.36, 0.30, 0.31, 0.15)]:
        cyl(r, h, (x, y, z), mat=M['silvermet'], verts=13, smooth=False)
        cone(r, r * 0.42, h * 0.9, (x, y, z + h * 0.9), mat=M['silvermet'], verts=13)
    cyl(0.492, 0.10, (0, 0, 0.155), mat=M['silvertar'], verts=13, smooth=False)      # 변색 띠(굵게) — 주석과 갈리는 단서

def m_gold():     # 금 — 자연금(REDUCTION_T=0): 덩이 하나 + **굵은 사금 알갱이 4개**.
    #   ⚠1차는 알갱이 9개가 잘아 96px 에서 얼룩으로 뭉갰다. 수를 줄이고 키운다.
    random.seed(210)
    cyl(0.50, 0.19, (-0.14, -0.10, 0.10), mat=M['goldmet'], verts=13, smooth=False)
    cone(0.50, 0.24, 0.16, (-0.14, -0.10, 0.27), mat=M['goldmet'], verts=13)
    for (x, y, r) in [(0.52, 0.30, 0.20), (0.30, 0.58, 0.16), (0.66, -0.02, 0.14), (0.14, 0.44, 0.12)]:
        ico(r, (x, y, r * 0.85), subdiv=1, mat=M['goldmet'], jitter=0.36, smooth=False)

def m_nickel():   # 니켈 — **세워 놓은 각괴**(빌릿) 2개 + 조각. 색은 탁한 회황백 무광.
    #   ⚠1차는 iron 과 같은 '누운 각재 2단'이라 실루엣이 겹쳤다(대조 시트 실측). 세로로 세워 갈라 놓는다.
    random.seed(211)
    box(0.44, 0.44, 1.28, (-0.14, 0.06, 0.64), rot=(0, 0, math.radians(-12)), mat=M['nickelmet'])
    box(0.36, 0.36, 0.92, (0.44, -0.20, 0.46), rot=(0, math.radians(4), math.radians(24)), mat=M['nickelmet'])
    ico(0.16, (-0.02, -0.48, 0.16), subdiv=1, mat=M['nickelmet'], jitter=0.32, smooth=False)

def m_jade_raw(): # 옥 원석 — 연옥 자갈: 풍화 회백 겉껍질 + **쪼갠 면에 드러난 초록 속살**(위세품 원료라 티가 나야 한다)
    #   ⚠1차는 초록을 얇은 판으로 박아 '회색 돌에 그은 초록 선'으로 읽혔다. 쪼갠 면을 **덩이 절반 크기**로 키운다.
    random.seed(212)
    ico(0.62, (-0.10, 0.10, 0.46), subdiv=1, mat=M['jaderind'], scale=(1.15, 1.0, 0.85), jitter=0.22, smooth=False)
    # 쪼갠 면 — 앞아래를 통째로 초록 덩이로(겉껍질 덩이와 맞물려 '반쪽이 깨진 자갈'로 읽힘)
    ico(0.46, (0.34, -0.30, 0.34), subdiv=1, mat=M['jadecore'], scale=(1.0, 1.0, 0.90), jitter=0.16, smooth=False)
    box(0.66, 0.62, 0.10, (0.34, -0.30, 0.70), rot=(math.radians(-12), math.radians(16), 0), mat=M['jadecore'])  # 매끈한 파단면
    ico(0.20, (0.56, 0.42, 0.18), subdiv=1, mat=M['jadecore'], jitter=0.28, smooth=False)    # 떨어져 나온 초록 조각




JOBS = [
    ("pillar", m_pillar), ("rafter", m_rafter), ("thatch", m_thatch),
    ("berry", m_berry), ("fiber", m_fiber), ("meat_raw", m_meat_raw), ("meat_cooked", m_meat_cooked),
    ("hide", m_hide), ("berry_jam", m_berry_jam), ("water_bottle", m_water_bottle),
    ("seed_berry", m_seed_berry), ("herb", m_herb), ("ore", m_ore),
    ("wood", m_wood), ("plank", m_plank), ("stone", m_stone),
    # ★★[T67 2026-09-03] **가구 5종(벽·문·울타리·상자·모닥불)은 여기서 빠졌다.**
    #   재민 확정 "물건 하나 = 모델 하나 = 렌더 둘" — 이제 `scripts/props_render.py` 가
    #   **세계 스프라이트와 같은 모델**로 그 아이콘을 굽는다. 여기 모델을 남겨 두면 사본이 되고,
    #   이 파일을 다시 굽는 날 세계와 인벤이 조용히 갈린다(족보: 사본 금지).
    #   ⓘ 바닥·계단·농지 셋은 아직 세계 스프라이트가 없어(회부: 다음 ART 카드) 여기 남는다.
    # ★★[T95 2026-09-05] **바닥·계단·농지 셋이 여기서 빠졌다** — T67 이 남긴 마지막 셋이다.
    #   이제 셋 다 세계 스프라이트가 있으니 캐논이 적용된다(물건 하나 = 모델 하나 = 렌더 둘):
    #     · 바닥·계단 → `props_render.py`(PROPS 표 — 세계 스프라이트 + 아이콘 한 모델에서)
    #     · 농지     → `fields_render.py`(빈 밭 `crops/grain_0` 과 **같은 `soil_bed`**)
    #   여기 모델을 남겨 두면 그게 사본이고, 세계를 고치는 날 짐 창이 조용히 갈린다.
    # ★[2026-08-02e ⑦] 야금 사슬 8종 — 배치 1 산출물이 아이콘 없이 이모지 폴백이었다
    ("ore_chunk", m_ore_chunk), ("iron_ore", m_iron_ore), ("charcoal", m_charcoal),
    ("iron", m_iron), ("meteoric_iron", m_meteoric_iron),
    ("copper", m_copper), ("tin", m_tin), ("lead", m_lead),
    # ★[2026-08-04a 배치 15 ④] 인벤 404 4종 — ITEM_ICONS 키 36개 중 파일이 없던 전부(전수 대조 결과)
    ("silver", m_silver), ("gold", m_gold), ("nickel", m_nickel), ("jade_raw", m_jade_raw),
]


ONLY = [k for k in os.environ.get('ICON_ONLY', '').split(',') if k]
for (key, fn) in JOBS:
    if ONLY and key not in ONLY: continue
    OBJS.clear()                 # ★[T77] 공용 `OBJS` 를 **비운다** — 새 리스트로 갈면 헬퍼와의 결속이 끊긴다
    fn()
    path = os.path.join(OUTDIR, key + ".png")
    print("[icon] render", key, "objs=", len(OBJS))
    rc.render_icon_pass(OBJS, path)
    rc.cleanup()

print("[icon] DONE ->", OUTDIR)
