#!/usr/bin/env python3
# =============================================================================
# scripts/render_common.py — 렌더 공용 정본 [재민 확정 2026-09-03 · T77]
#
# ★★왜 있나: `icon_render.py` 와 `props_render.py` 가 **같은 헬퍼를 두 벌** 적고 있었다.
#   두 벌이면 한쪽만 고쳐지는 날이 오고, 그날 인벤과 세계가 조용히 갈린다(T67 캐논).
#   ⇒ 헬퍼는 여기 한 벌, 씬 값도 여기 한 곳. 모델과 **재질표는 각 파일이 그대로 갖는다.**
#
# ★이 파일이 갖는 것 / 안 갖는 것
#   갖는다 : 재질 문법(`simple_mat`·`striped_mat`·`bumped_mat`) · 기하 헬퍼(`box`·`cyl`·
#            `cone`·`ico`·`plane`·`cord`) · 오브젝트 등록(`add`/`OBJS`) ·
#            씬 조립(`build_scene`) · **프리셋 둘**(`render_icon_pass`/`render_world_pass`) ·
#            PNG 후처리(`_post_png`·`downscale_png`)
#          · **시트 후처리**(`cel_quantize`·`ink_outline`·`edge_darken`·`post_all`)
#          · **상자 못박기**(`read_pinned_box`·`fit_pinned_box`)                   [T116]
#   안 갖는다: **모델**(무엇을 만드는가) · **재질표 `M`**(어떤 색인가).
#            팔레트는 파일마다 다르다 — icon 의 `stone` 과 props 의 `stone` 은 다른 돌이다.
#            섞으면 그림이 바뀐다. 두 팔레트는 **두 팔레트로 남는다**(T77 §0-ⓒ).
#
# ★★씬 값은 **무변**이다. 여기 숫자를 고치면 자연물·건물·캐릭터와 한 몸이던 그림이 갈린다.
#   Cycles · film_transparent · ORTHO · SAMPLES 64 · view_transform Standard ·
#   월드 (0.52,0.56,0.6)@0.55 · 태양 고도 52° energy 3.6 angle 0.2
#     [아이콘 프리셋] ISO_DIR (1,−1,1.2) · bbox 맞춤 512² · 압축 없음 · FLIP 없음 · 태양 방위 +35°
#     [세계  프리셋] 방위 45°/고도 30° · PPU 45.255 · ZSQ 0.8165 · FLIP · 태양 방위 −35°
#        └ 규격 둘(T97): `ppu_mul`=출력 픽셀 밀도 배수 · `ss`=초과표본 배수(축소로 되돌림)
#          가구·밭 (1, 3) 게임 해상도 배포 · 자연물 (4 또는 3, 1) 고해상 배포 + 클라가 축소
#
# ★★기본값 함정 — 합치면서 갈린 기본값은 **호출부에 명시 인자로 잠갔다**(T77 §0-ⓐ 실측):
#     ┌ 함수         인자     icon 옛 기본값   props 옛 기본값   합친 기본값   잠근 곳
#     │ ico          subdiv   2               1                1            전 호출부가 이미 명시(생략 0)
#     │ ico          smooth   True            False            False        icon 9곳에 `smooth=True`
#     │ cyl          verts    24              12               12           전 호출부가 이미 명시(생략 0)
#     │ cyl          smooth   (인자 없음=끔)   True             True         icon 22곳에 `smooth=False`
#     │ striped_mat  rough    0.75            0.8              0.8          전 호출부가 이미 명시(생략 0)
#     │ striped_mat  bump     (0.3 하드코딩)   0.35             0.35         icon 10곳에 `bump=0.3`
#     └ striped_mat  dist     (3.0 하드코딩)   3.0              3.0          값이 같아 잠글 것 없음
#   ⚠`subdiv`·`verts` 는 **지금 아무 호출부도 생략하지 않아** 합친 기본값이 닿지 않는다.
#     그래서 `scripts/test-render-common.js` 가 "생략 0" 을 지킨다 — 새 모델(T79 작물 등)이
#     무심코 생략하면 icon 쪽은 옛 기본값과 다른 그림이 나온다. 하네스가 그때 빨개진다.
#
# 쓰는 법:
#   import sys, os
#   sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
#   from render_common import *            # 헬퍼·상수·OBJS
#   import render_common as rc
#   scene, cam, cam_d, sun, tgt = rc.build_scene("icon")
# =============================================================================

import bpy, os, math, random, mathutils

V = mathutils.Vector

# ═══════════════ 씬 상수 — 한 곳 ═══════════════
SAMPLES = 64
RES_ICON = 512                                       # 아이콘 패스 정사각 해상도(→ icons-postprocess.js 가 96px)
SS = 3                                               # 세계 패스 초과표본 — 굽고 나서 1:1 로 되돌린다
PPU = 64.0 / math.sqrt(2.0)                          # 45.255 px/유닛(=1셀=1m) — 셀 다이아 가로폭 64px
ZSQ = 32.0 / (PPU * math.cos(math.radians(30.0)))    # 0.8165 — 1m 높이 = 32px

WORLD_BG = (0.52, 0.56, 0.6)
WORLD_STRENGTH = 0.55
SUN_ENERGY = 3.6
SUN_ANGLE = 0.2
SUN_ICON = (math.radians(52), 0, math.radians(35))    # 아이콘 패스 태양(방위 +35°)
SUN_WORLD = (math.radians(52), 0, math.radians(-35))  # 세계 패스 태양(FLIP 보정 뒤 +35°와 같은 방향)

CLIP_START = 0.1
# ★clip_end — icon 은 1000, props 는 2000 이었다(T77 §0-ⓑ 실측). **넓은 쪽**으로 합친다:
#   far clip 을 넓히는 것은 **자르던 것을 덜 자르는** 방향이라 1000 이 살리던 기하를 못 지운다.
#   실제 카메라 거리는 아이콘 ~20–30, 세계 300 이라 둘 다 여유 안이다. 84장 `cmp` 가 증인이다.
CLIP_END = 2000

ISO_DIR = V((1.0, -1.0, 1.2)).normalized()            # 아이콘 패스 시선

# ★★★[T101 실측] **블렌더 5.0 은 `Bump` 노드의 `Distance` 기본값을 1.0 → 0.001 로 바꿨다.**
#   범프가 1000분의 1 로 죽는다. 여태 "4.0.2 → 5.0.1 기계 차이"(T79 6~19/255 · T97 5.53/255)라
#   불러 온 것의 **진짜 정체가 이것**이다 — 4.0.2 가 얼룩을 남긴 게 아니라 5.0.1 이 범프를 잃었다.
#   T101 §1 증거: 같은 코드·같은 씨앗으로 막돌을 구우니 5.0.1 은 **매끈한 저폴리 덩어리**가 나왔고,
#   `Distance` 만 1.0 으로 되돌리자 4.0.2 배포본의 돌 표면이 그대로 돌아왔다(그림 `바위_범프.png`).
#   ⇒ 범프를 만드는 모든 자리에 **`Distance` 를 명시**한다. 기본값에 기대면 다음 판올림이 또 가져간다.
BUMP_DIST = 1.0        # 블렌더 4.x 까지의 기본값 — 지금 미술은 전부 이 값으로 맞춰져 있다


# ═══════════════ 옷 재질 표 — 정본 하나 [T120 2026-09-05] ═══════════════
# ★★여섯 재질 값이 **두 파일에 따로** 있었다(T77·T87·T95 회부):
#     `scripts/char_render.py`  CLOTH_MATS   — 시트가 입은 옷
#     `scripts/props_render.py` _CL          — 짐 창의 옷 아이콘 여섯
#   같은 물건이 두 자리에서 정의되면 언젠가 갈린다. 여태는 `test-icons ⑨` 가 **갈렸는지 검사만**
#   하고 있었는데, 검사는 갈린 뒤에야 말한다 — 안 갈리게 하는 것이 낫다(T67 캐논).
#   ⇒ 표는 여기 하나다. 두 파일은 **읽기만** 한다.
#   ⓘ T120 §0-ⓐ 실측: 옮기기 전 두 표는 여섯 항목 · 같은 순서 · **색·rough 차이 0** 이었다.
#     (그래서 이 통합은 값 결정이 아니라 **자리 결정**이다 — 굽는 바이트가 바뀌면 그건 실패다.)
#
# ★값의 근거는 `char_render.py` 의 T81 절이 갖고 있다 — 여기 옮겨 적지 않는다(사본 금지):
#   아이콘 정본에서 베낀 셋(hide·leather·fiber) · 고증으로 정한 둘(fur·ramie) ·
#   §0-ⓐ 실측이 밀어낸 둘(ramie 더 희게 · fiber 더 밝게) · 얼린 삼베.
# 순서 = `server/clothes.js` 표 순서(계약).
CLOTH_MATS = {                     # id → (기본색, rough, spec)
    'fur':     ((0.300, 0.210, 0.145), 0.97, 0.03),
    'ramie':   ((0.885, 0.875, 0.835), 0.88, 0.08),
    'leather': ((0.400, 0.270, 0.160), 0.75, 0.18),
    'hide':    ((0.600, 0.440, 0.280), 0.85, 0.10),
    'fiber':   ((0.720, 0.665, 0.315), 0.95, 0.04),
    'hemp':    ((0.700, 0.655, 0.545), 0.90, 0.06),
}
# 띠 둘은 **비율로 유도한다**(눈대중 금지 · 족보 74) — 근거는 char_render T81 절.
CLOTH_TRIM_K = 0.85       # 허리끈 = 본천 × 이 값
CLOTH_PLACKET_K = 0.56    # 앞섶  = 본천 × 이 값
# 갖옷만 제 기하 — 털 두께(m). 무두질 전 털가죽이라 짜서 붙는 삼베·모시와 부피가 다르다(T81).
FUR_PAD = 0.03


THETA = math.radians(30.0)                            # 세계 패스 고도
NHAT = V((math.cos(THETA) / math.sqrt(2), math.cos(THETA) / math.sqrt(2), math.sin(THETA)))
RHAT = V((1.0, -1.0, 0.0)).normalized()
UHAT = V((-math.sin(THETA) / math.sqrt(2), -math.sin(THETA) / math.sqrt(2), math.cos(THETA)))

# 씬 조립이 채운다 — 프리셋이 쓴다
SCENE = CAM = CAM_D = SUN = TGT = None


# ═══════════════ 재질 문법 ═══════════════
def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return mat.node_tree.nodes.get("Principled BSDF")


def simple_mat(name, color, rough=0.8, metal=0.0, emit=None, emit_str=0.0):
    """단색 — `emit` 을 주면 발광(불꽃·잉걸). 안 주면 발광 노드에 손대지 않는다."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    try: b.inputs["Metallic"].default_value = metal
    except Exception: pass
    if emit is not None:
        try:
            b.inputs["Emission Color"].default_value = (emit[0], emit[1], emit[2], 1.0)
            b.inputs["Emission Strength"].default_value = emit_str
        except Exception:
            try: b.inputs["Emission"].default_value = (emit[0]*emit_str, emit[1]*emit_str, emit[2]*emit_str, 1.0)
            except Exception: pass
    return m


def striped_mat(name, base, stripe, scale=22.0, rough=0.8, bump=0.35, dist=3.0):
    """결/줄무늬(나무결·이엉·근섬유·비늘) — 웨이브 텍스처 계단 + 범프."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    w = nt.nodes.new("ShaderNodeTexWave"); w.inputs["Scale"].default_value = scale
    try: w.inputs["Distortion"].default_value = dist
    except Exception: pass
    rmp = nt.nodes.new("ShaderNodeValToRGB")
    rmp.color_ramp.elements[0].position = 0.45; rmp.color_ramp.elements[1].position = 0.58
    nt.links.new(w.outputs["Fac"], rmp.inputs["Fac"])
    c1 = nt.nodes.new("ShaderNodeRGB"); c1.outputs[0].default_value = (base[0], base[1], base[2], 1)
    c2 = nt.nodes.new("ShaderNodeRGB"); c2.outputs[0].default_value = (stripe[0], stripe[1], stripe[2], 1)
    mx = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(rmp.outputs["Color"], mx.inputs["Fac"])
    nt.links.new(c1.outputs[0], mx.inputs["Color1"])
    nt.links.new(c2.outputs[0], mx.inputs["Color2"])
    nt.links.new(mx.outputs["Color"], b.inputs["Base Color"])
    bmp = nt.nodes.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = BUMP_DIST     # ★T101 — 5.0 기본값 0.001 을 되돌린다
    nt.links.new(w.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def bumped_mat(name, c1, c2, noise_scale=9.0, bump=0.5, rough=0.85, ramp=(0.42, 0.62)):
    """투톤 노이즈 + 범프 — 막돌·흙·껍데기(rock 문법 축약, 축소 판독성 위해 계단 램프)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = noise_scale
    bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump
    bp.inputs["Distance"].default_value = BUMP_DIST      # ★T101 — 5.0 기본값 0.001 을 되돌린다
    nt.links.new(n.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    r1 = nt.nodes.new("ShaderNodeRGB"); r1.outputs[0].default_value = (c1[0], c1[1], c1[2], 1)
    r2 = nt.nodes.new("ShaderNodeRGB"); r2.outputs[0].default_value = (c2[0], c2[1], c2[2], 1)
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = noise_scale * 0.5
    rmp = nt.nodes.new("ShaderNodeValToRGB")
    rmp.color_ramp.elements[0].position = ramp[0]; rmp.color_ramp.elements[1].position = ramp[1]
    nt.links.new(n2.outputs["Fac"], rmp.inputs["Fac"])
    mx = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(rmp.outputs["Color"], mx.inputs["Fac"])
    nt.links.new(r2.outputs[0], mx.inputs["Color1"])
    nt.links.new(r1.outputs[0], mx.inputs["Color2"])
    nt.links.new(mx.outputs["Color"], b.inputs["Base Color"])
    return m


# ═══════════════ 씬 조립 ═══════════════
def build_scene(tag="render"):
    """빈 씬을 정본 값으로 세운다. 돌려주는 것: (scene, cam, cam_d, sun, tgt)."""
    global SCENE, CAM, CAM_D, SUN, TGT
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
    # ★우분투 apt 빌드는 OpenImageDenoise 없음 — 감지해서 자동 비활성(있으면 켬)
    scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
    try: scene.view_settings.view_transform = 'Standard'
    except Exception: pass
    scene.render.film_transparent = True
    scene.render.resolution_x = RES_ICON; scene.render.resolution_y = RES_ICON
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    if scene.world is None: scene.world = bpy.data.worlds.new("W")
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (WORLD_BG[0], WORLD_BG[1], WORLD_BG[2], 1.0)
        bg.inputs[1].default_value = WORLD_STRENGTH
    sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = SUN_ENERGY; sun_d.angle = SUN_ANGLE
    sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
    sun.rotation_euler = SUN_ICON
    tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
    cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'
    cam_d.clip_start = CLIP_START; cam_d.clip_end = CLIP_END
    # ★★`ortho_scale` 은 sensor_fit 이 AUTO 면 **긴 변**을 잡는다. 건물·자연물 스프라이트는 늘
    #   가로가 길어 이 함정이 안 드러났는데, 가구는 **세로가 긴 것이 절반**이다(벽 43×88 · 문 45×90 …).
    #   그대로 두면 세로 긴 그림이 h/w 배(문 = 2배) 확대돼 **가운데만 찍힌다** — T67 1패스에서 실제로
    #   문설주 둘이 화면 밖으로 나가고 문짝만 꽉 찬 그림이 나왔다(알파 덤프로 잡았다).
    #   ⇒ 가로로 못박는다. 그래야 `ortho_scale = Wpx/PPU` 가 언제나 PPU 를 뜻한다.
    #   ⓘ 아이콘 패스는 늘 정사각(512²)이라 AUTO 와 HORIZONTAL 이 같다 — icon_render.py 가
    #     이 줄 없이도 멀쩡했던 이유이고, 붙여도 그림이 안 바뀌는 이유다(84장 `cmp` 가 증인).
    cam_d.sensor_fit = 'HORIZONTAL'
    cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
    cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam
    SCENE, CAM, CAM_D, SUN, TGT = scene, cam, cam_d, sun, tgt
    print(f"[{tag}] bpy {bpy.app.version_string} denoise = {scene.cycles.use_denoising}"
          f" samples = {SAMPLES} ppu = {round(PPU, 3)} zsq = {round(ZSQ, 4)}")
    return scene, cam, cam_d, sun, tgt


# ═══════════════ 기하 헬퍼 ═══════════════
OBJS = []


def add(o, mat):
    if mat is not None:
        o.data.materials.append(mat)
    OBJS.append(o)
    return o


def box(sx, sy, sz, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    return add(o, mat)


def cyl(r, d, loc, rot=(0, 0, 0), mat=None, verts=12, smooth=True):
    """원통. `smooth=True` 면 **옆면(4각면)만** 스무스 · 뚜껑은 플랫(소체 2차 규약)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.active_object
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = len(p.vertices) == 4
    return add(o, mat)


def cone(r1, r2, d, loc, rot=(0, 0, 0), mat=None, verts=20):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)


def ico(r, loc, subdiv=1, mat=None, scale=(1, 1, 1), jitter=0.0, seed=None, smooth=False):
    """이코스피어. 둥근 몸(생선·열매·낟알)은 `smooth=True`, 돌·흙덩이는 플랫이라야 각이 산다.

    ★★[T79 · PM 판정] 스무스를 **폴리곤 루프**로 한다 — 오퍼레이터가 아니다.
      T77 이 잰 것: 옛 `icon_render.py` 는 `bpy.ops.object.shade_smooth()` 가 **오퍼레이터라는
      이유만으로** 뎁스그래프를 한 바퀴 돌려 `o.bound_box`·`o.matrix_world` 캐시를 씻어 주고
      있었다. 아이콘 프리셋이 그 bbox 로 프레임을 잡으므로, 우연한 부작용이 그림을 맞히고
      있었던 셈이다(지터를 쓴 `hide`·`meat_cooked` 두 장이 그것에 매달려 있었다).
      T77 은 리팩터라 그 우연을 보존했고, T79 는 재굽기 카드라 **바로잡는다** —
      스무스는 부작용 없는 루프로, 캐시 갱신은 `render_icon_pass` 가 **명시로** 한다."""
    if seed is not None:
        random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object; o.scale = scale
    if jitter:
        for v in o.data.vertices:
            v.co *= (1.0 + random.uniform(-jitter, jitter))
    if smooth:
        for pg in o.data.polygons:
            pg.use_smooth = True
    return add(o, mat)


def plane(sx, sy, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, 1)
    return add(o, mat)


def cord(r, length, loc, rot, mat, verts=8):
    """새끼줄 한 바퀴 — 가는 원통(감은 티만 난다)."""
    return cyl(r, length, loc, rot=rot, mat=mat, verts=verts)


def cleanup():
    """만든 것을 지우고 `OBJS` 를 비운다(리스트는 **같은 객체**로 남는다 — import 결속 유지)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        try: o.select_set(True)
        except Exception: pass
    if OBJS:
        bpy.context.view_layer.objects.active = OBJS[0]
        bpy.ops.object.delete()
    OBJS.clear()
    # ★`bpy.data.textures` 도 함께 — DISPLACE 모디파이어용 레거시 텍스처 데이터블록이다.
    #   지금 이걸 만드는 건 `nature_render.py:blob()`(CLOUDS) 하나뿐이라 다른 파일엔 **빈 순회**다
    #   (`scripts/test-render-common.js` 가 "만드는 곳 하나" 를 지킨다). 안 쓸면 38장 굽는 동안
    #   고아 텍스처가 쌓인다 — T97 편입 전 `nature_render.py` 가 자기 `cleanup()` 에서 하던 일.
    for blk in (bpy.data.meshes, bpy.data.textures):
        for d in list(blk):
            if d.users == 0:
                blk.remove(d)


def bake_transforms():
    """로컬 변환을 정점에 굽는다 — 세계 패스가 `v.co` 로 화면 bbox 를 재기 전에 필요하다."""
    if not OBJS:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = OBJS[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')


def zmax():
    z = -1e18
    for o in OBJS:
        for v in o.data.vertices:
            z = max(z, v.co.z)
    return z


def squash_z():
    """게임 화법(1m=32px) — 오브젝트 스케일이 아니라 **정점 z 를 직접** 누른다."""
    for o in OBJS:
        for v in o.data.vertices:
            v.co.z *= ZSQ


# ═══════════════ PNG 후처리 — 초과표본 되돌리기 + 좌우 FLIP ═══════════════
def _post_png(path, ss=1, flip=True):
    """Blender 가 쓴 PNG 를 읽어 ⓐ ss 배 박스 축소(프리멀티플라이) ⓑ 좌우 반전 후 덮어쓴다.
    ★순수 파이썬이다 — Blender 번들 파이썬엔 numpy·PIL 이 없을 수 있다(building_render 규약)."""
    img = bpy.data.images.load(path)
    W, H = img.size
    px = list(img.pixels[:])
    if ss > 1:
        w2, h2 = W // ss, H // ss
        out = [0.0] * (w2 * h2 * 4)
        inv = 1.0 / (ss * ss)
        for y in range(h2):
            for x in range(w2):
                r = g = b = a = 0.0
                for sy in range(ss):
                    row = ((y * ss + sy) * W + x * ss) * 4
                    for sx in range(ss):
                        i = row + sx * 4
                        al = px[i + 3]
                        r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al
                d = (y * w2 + x) * 4
                if a > 1e-6:
                    k = 1.0 / a                     # 언프리멀티플라이
                    out[d] = r * k; out[d + 1] = g * k; out[d + 2] = b * k
                out[d + 3] = a * inv
        px = out; W, H = w2, h2
    if flip:
        fl = [0.0] * len(px)
        for y in range(H):
            row = y * W * 4
            for x in range(W):
                s = row + x * 4; d = row + (W - 1 - x) * 4
                fl[d] = px[s]; fl[d + 1] = px[s + 1]; fl[d + 2] = px[s + 2]; fl[d + 3] = px[s + 3]
        px = fl
    bpy.data.images.remove(img)
    out_img = bpy.data.images.new("post", W, H, alpha=True)
    out_img.pixels = px
    out_img.filepath_raw = path
    out_img.file_format = 'PNG'
    out_img.save()
    bpy.data.images.remove(out_img)


# ═══════════════ 후처리 프리셋 — 512² → N px 박스 축소 ═══════════════
def downscale_png(path, size=64):
    """★★[T79c] **밭 스프라이트의 축소 단계 — 여태 코드에 없던 것.**

    작물 세계 스프라이트는 512² 로 굽고 **64px 로 줄여** 배포한다. 그런데 그 줄이는 단계가
    2026-07 커밋 메시지(`82a1bef6`) 한 줄에만 있었고 스크립트에는 없었다 —
    "512² 렌더 → 64×64 박스필터 축소(프리멀티플라이드 가중)". 구전이었다는 뜻이다.
    T79 가 다시 굽자 했을 때 재현이 안 돼 카드가 막혔다(T79 회부 3). 여기서 **코드로 만든다.**

    ⚠T79 의 재현 어긋남(평균 6~19/255)은 **필터 탓이 아니다** — 상류(4.0.2 vs 5.0.1) 탓이다.
      증거: 어긋남이 **범프 흙이 보이는 만큼** 커진다 — 맨흙 단계 `grain_0` 19.5 · `veg_0` 19.1 인데
      잎이 흙을 덮은 `veg_2`·`veg_3` 는 6.8 이다. 4.0.2 가 범프 면에 얼룩을 남기던 그 서명(T79 §0-ⓒ)과
      같은 무늬다. 박스필터는 결정적이라 같은 입력이면 같은 출력을 낸다.

    ★알파 가중(프리멀티플라이)으로 모은다 — 안 그러면 투명 가장자리의 색이 배어 테두리가 뜬다.
    ★순수 파이썬이다(`_post_png` 와 같은 규약) — Blender 번들 파이썬엔 numpy·PIL 이 없을 수 있다."""
    img = bpy.data.images.load(path)
    W, H = img.size
    px = list(img.pixels[:])
    if W % size or H % size:
        raise ValueError(f"{W}×{H} 는 {size} 로 정수 배 축소가 안 된다 — 박스필터는 정수 배만 옳다")
    kx, ky = W // size, H // size
    out = [0.0] * (size * size * 4)
    inv = 1.0 / (kx * ky)
    for y in range(size):
        for x in range(size):
            r = g = b = a = 0.0
            for sy in range(ky):
                row = ((y * ky + sy) * W + x * kx) * 4
                for sx in range(kx):
                    i = row + sx * 4
                    al = px[i + 3]
                    r += px[i] * al; g += px[i + 1] * al; b += px[i + 2] * al; a += al
            d = (y * size + x) * 4
            if a > 1e-6:
                k = 1.0 / a                     # 언프리멀티플라이
                out[d] = r * k; out[d + 1] = g * k; out[d + 2] = b * k
            out[d + 3] = a * inv
    bpy.data.images.remove(img)
    o = bpy.data.images.new("dn", size, size, alpha=True)
    o.pixels = out
    o.filepath_raw = path
    o.file_format = 'PNG'
    o.save()
    bpy.data.images.remove(o)


# ═══════════════ 프리셋 ① 아이콘 ═══════════════
def render_icon_pass(objs, path):
    """ISO_DIR · 월드 bbox 맞춤 · 512² · 압축 없음 · FLIP 없음 · 태양 +35°.
    돌려주는 것: 잡은 bbox 의 최대 변 길이(m) — 부르는 쪽이 로그에 쓴다."""
    SUN.rotation_euler = SUN_ICON
    mn = [1e18] * 3; mx = [-1e18] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ V(c)
            for k in range(3):
                mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
    ctr = V(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    size = max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
    SCENE.render.resolution_x = RES_ICON; SCENE.render.resolution_y = RES_ICON
    TGT.location = ctr
    CAM.location = ctr + ISO_DIR * (size * 4 + 20)
    CAM_D.ortho_scale = size * 1.25 + 0.5
    SCENE.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return size


# ═══════════════ 프리셋 ② 세계 ═══════════════
def render_world_pass(objs, path, margin=3, ppu_mul=1.0, ss=SS):
    """방위 45°/고도 30° · ZSQ 0.8165 · 좌우 FLIP · 태양 −35°.
    프레임은 **화면 bbox** 에 맞추고, 로컬 원점 (0,0,0) 의 픽셀 좌표를 앵커로 낸다.
    ⚠호출 전에 `bake_transforms()` 와 (게임 화법이 필요하면) `squash_z()` 를 끝내 둬야 한다 —
      여기서는 `v.co` 를 그대로 읽는다.

    ★★[T97] **규격이 둘이라 손잡이도 둘이다.** 여태 이 함수는 한 규격만 알았다.
      · `ppu_mul` — **출력 자체의** 픽셀 밀도 배수. 나온 PNG 가 게임 해상도의 몇 배인가.
      · `ss`      — **초과표본** 배수. 굽고 나서 박스 축소로 되돌리므로 출력 크기엔 안 남는다.
      두 규격:
        [가구·밭 등]  ppu_mul 1 · ss 3 → 45.255px/m 로 배포, 굽기만 3배(앨리어싱 죽이기)
        [자연물]      ppu_mul 3~4 · ss 1 → 135~181px/m 고해상으로 **배포**하고,
                      앵커 JSON 의 `ppu` 를 보고 **클라가 그릴 때 줄인다**(산 스프라이트와 같은 규약).
      자연물이 고해상을 남기는 이유: 나무는 3~5m 라 게임 해상도로 구우면 잔가지가 뭉갠다.
      기본값(1, SS)은 T77 이 84장 `cmp` 0 으로 세운 옛 거동 그대로다 — 기존 호출부 무변."""
    SUN.rotation_euler = SUN_WORLD
    ppu = PPU * ppu_mul
    umin = wmin = 1e18; umax = wmax = -1e18
    for o in objs:
        for v in o.data.vertices:
            u = v.co.dot(RHAT) * ppu
            w = -v.co.dot(UHAT) * ppu
            umin = min(umin, u); umax = max(umax, u)
            wmin = min(wmin, w); wmax = max(wmax, w)
    Wpx = int(math.ceil(umax - umin)) + margin * 2
    Hpx = int(math.ceil(wmax - wmin)) + margin * 2
    a = (umin + umax) * 0.5 / ppu
    b = -(wmin + wmax) * 0.5 / ppu
    ctr = RHAT * a + UHAT * b
    SCENE.render.resolution_x = Wpx * ss; SCENE.render.resolution_y = Hpx * ss
    CAM_D.ortho_scale = Wpx / ppu                 # ★해상도만 ss 배 — 픽셀 밀도가 ss 배가 된다
    TGT.location = ctr
    CAM.location = ctr + NHAT * 300.0
    SCENE.render.filepath = path
    bpy.ops.render.render(write_still=True)
    _post_png(path, ss=ss, flip=True)             # 초과표본 되돌리기 + 게임 손방향 보정
    ox = Wpx / 2.0 - (umin + umax) * 0.5
    oy = Hpx / 2.0 - (wmin + wmax) * 0.5
    return {"w": Wpx, "h": Hpx, "ox": round(ox, 2), "oy": round(oy, 2), "ppu": round(ppu, 3)}


# ═════════════════════════════════════════════════════════════════════════════
# [T116] **시트 후처리 · 상자 못박기 — 공용으로 올림**
#
# ★어디서 왔나: 아래 두 묶음은 `scripts/ink_post.py`(T96·T107)와 `scripts/char_render.py`(T107)
#   안에 있던 것을 **그대로 옮긴 것**이다(사본이 아니라 이동 — 원래 자리는 지웠다).
#   주석 안의 숫자는 전부 그때의 실측이고, 옮기면서 한 톨도 안 고쳤다.
#
# ★왜 옮기나 [카드 T116 ②③]: T106 이 끝나 이 파일이 굽기 공용의 정본이 됐는데, 후처리와
#   상자 못박기만 캐릭터 쪽에 남아 있었다. 자연물·소품·건물에 같은 것을 걸려면 **두 벌째를 적는
#   날**이 오고, 그날 한쪽만 고쳐진다(이 파일 머리말의 T67 캐논이 바로 그 이야기다).
#   ⇒ 함수는 여기 한 벌. **다만 거는 것은 아직 캐릭터뿐이다** — 자연물·소품·건물에 실제로
#     적용하는 것은 별도 카드다(세션8). 여기서는 **부를 수 있게만** 해 둔다.
#
# ★캐릭터가 이 함수들을 부르고도 배포 PNG 가 **바이트 한 톨 안 바뀐다**는 것이 이 이동의 증명이다
#   (`보고/T116` §3 — 다섯 클립 70장 전수 · `char_sheets.lock.json` 무변).
#
# ⚠이 파일과 캐릭터는 `PPU` 라는 **같은 이름을 다른 값으로** 쓴다(여기 45.255 = px/m,
#   `char_render` 135.765 = 그 SS배). 그래서 캐릭터는 `from render_common import *` 가 아니라
#   **`import render_common as rc`(이름 붙여서)** 로만 부른다. 세션8 도 같은 함정을 밟지 마라.
# ═════════════════════════════════════════════════════════════════════════════

# ── 먹색 [T96 §0-ⓐ 실측에서 유도 · 눈대중 아님] ──────────────────────────────
#   `public/assets/char/body_walk.png` 실측: 실루엣 안 휘도 1% = 39.3 · 중앙 102.5 · 99% 180.1.
#   선이 몸에 묻히지 않으려면 몸의 바닥보다 확실히 아래여야 한다 ⇒ **1% 의 절반**(19.7)을 잡는다.
#   색비는 시트가 이미 가진 가장 어두운 테두리 색 (34,31,27) = 1 : 0.91 : 0.79 (따뜻한 흑갈).
#   ⇒ 휘도 19.7 · 그 비율 → (21, 19, 17). 순검정(0,0,0)이 아니다 — 검정은 화면에서 **구멍**이 된다.
INK_RGB = (21 / 255.0, 19 / 255.0, 17 / 255.0)

# ── 먹이 닿아도 되는 알파 문턱 [실측이 정했다 · 눈대중 아님] ──────────────────
#   ⚠1차는 `char_render.py` 의 `EDGE_A`(0.60 = 153/255)를 그대로 썼다가 **`test-charsheet ④` 를
#     빨갛게 만들었다**(반투명 화소 중 검은 것 0.0% → **23.0%**). 한 변수씩 갈라 보면 범인이 명확하다:
#       raw 0.0% · 옛 edge_darken 0.0% · **셀만 0.0%** · **먹선만 23.0%**
#     `edge_darken` 은 RGB 를 0.78 **곱했으니** 합이 90 밑으로 안 내려갔고, 먹선은 **덮으니** 내려간다.
#   ⇒ 문턱은 ④ 가 이미 쓰는 숫자에서 가져온다(족보 74): ④ 는 `a < 200` 을 **반투명**으로 친다.
#     그러니 먹은 `a >= 200` 에만 닿는다 — 그래야 이 모듈이 적어 둔 "반투명 무접촉"이 참말이 된다.
#   ★셀은 `EDGE_A` 로 둔다: 밝기를 **비율로** 옮길 뿐이라 검은 화소를 안 만든다(위 실측 0.0%).
#     문턱을 올리면 테두리 한 겹이 계단을 안 타 옆 화소와 어긋난다.
INK_A = 200 / 255.0

# ── 셀 단수의 밝기 범위 — **시트 제 것을 쓴다** [T96 §0-ⓑ 실측이 시켰다] ────────
#   ⓐ 처음엔 범위를 한 번 재서 못박았다(몸 시트의 1~99% = 39.3~180.1). 그러면 층·클립이
#     같은 계단을 쓰니 '한 사람'이 된다고 봤다. **그런데 그게 재질을 지운다.**
#     실측: 옷 여섯의 평균 휘도 15쌍 중 문턱(14.7 · T81 이 통과시킨 최소 간격) 미만이
#     원본 2쌍 → 고정범위 3단에서도 2쌍이지만, 갖옷↔가죽의 **색거리가 11.7 → 3.5 로 무너졌다**
#     (둘은 색이 거의 같고 밝기로만 갈리는 짝이라, 공통 계단이 그 밝기 차를 통째로 삼킨다).
#   ⓑ 고치는 자리는 계단 수가 아니라 **범위**다. 셀 셰이딩이 계단 지어야 하는 것은
#     '재질의 밝기'가 아니라 '그 재질에 진 그늘'이다 ⇒ 범위를 **시트 제 실루엣의 1~99%** 로 잡는다.
#     재질의 평균은 그대로 남고 그늘만 계단이 된다.
#   ⓒ 그래도 층·클립이 안 흔들리는가? 쟀다 — 같은 층의 다섯 클립에서 1% 는 0.1 이내,
#     99% 는 최대 4 이내로 같다(`clothes_fur` 43.6~43.7 / 118.4~122.5). 계단이 거의 안 움직인다.
CEL_P_LO = 0.01
CEL_P_HI = 0.99

# ★시트 화소 공간 = PNG 8bit ÷ 255 (선형). 실측으로 확인했다: `bpy` 이미지에 0.0·0.1·0.5·0.78·1.0
#   을 넣고 저장하면 PNG 가 0·26·128·199·255 로 나온다 — 감마가 안 끼어 있다.
#   그래서 위 상수는 **그냥 sRGB 8bit ÷ 255** 로 적혀 있다.
# ★계약 둘은 어느 자산군에 걸든 그대로다(`test-charsheet ④` 가 캐릭터에서 지킨다):
#   ⓐ **반투명(안티에일리어싱) 화소 무접촉** — 거기를 어둡게 하면 그게 검은 프린지다.
#   ⓑ **1겹** — 읽기용 사본을 먼저 뜬다. 제자리로 고치면 방금 먹인 화소가 다음 화소의 이웃 판정에
#      끼어들어 선이 안쪽으로 번진다.
_LUMA = (0.2126, 0.7152, 0.0722)


def _luma(r, g, b):
    return _LUMA[0] * r + _LUMA[1] * g + _LUMA[2] * b


def cel_range(sheet, w, h, athr):
    """이 시트 실루엣 안 휘도의 1%~99%. 정렬이라 결정적이다."""
    L = [ _luma(sheet[i * 4], sheet[i * 4 + 1], sheet[i * 4 + 2])
          for i in range(w * h) if sheet[i * 4 + 3] >= athr ]
    if len(L) < 8:
        return None
    L.sort()
    lo = L[int(len(L) * CEL_P_LO)]
    hi = L[min(len(L) - 1, int(len(L) * CEL_P_HI))]
    return (lo, hi) if hi - lo > 1e-4 else None


def cel_quantize(sheet, w, h, bands, athr, mask=None):
    """실루엣 안 화소의 **밝기만** bands 단으로 계단 짓는다(색조 유지 · 알파 무접촉).

       ★색조를 지키는 법: 휘도만 목표값으로 옮기고 RGB 를 그 비율로 곱한다.
         (RGB 를 각각 양자화하면 색이 튄다 — 살빛이 자주색으로 돈다.)
       ★반투명 화소는 안 건드린다(먹선과 같은 계약 · 프린지 금지).
       ★구간은 **이 시트의** [1%, 99%] 를 bands 등분하고 값은 각 칸의 한가운데.
         범위 밖은 가장자리 칸으로 잘린다(가장 어두운 그늘·가장 밝은 하이라이트가 안 사라진다)."""
    if not bands or bands < 2:
        return sheet
    rng = cel_range(sheet, w, h, athr)
    if rng is None:
        return sheet
    lo, hi = rng
    a = mask if mask is not None else None
    span = (hi - lo) / bands
    levels = [lo + span * (k + 0.5) for k in range(bands)]
    for i in range(w * h):
        if sheet[i * 4 + 3] < athr:
            continue
        if a is not None and a[i] < athr:
            continue
        o = i * 4
        r, g, b = sheet[o], sheet[o + 1], sheet[o + 2]
        L = _luma(r, g, b)
        if L <= 1e-6:
            continue
        k = int((L - lo) / span)
        if k < 0:
            k = 0
        elif k >= bands:
            k = bands - 1
        s = levels[k] / L
        sheet[o] = r * s
        sheet[o + 1] = g * s
        sheet[o + 2] = b * s
    return sheet


def ink_outline(sheet, w, h, athr=INK_A, mask=None, rgb=INK_RGB):
    """실루엣 안쪽 **한 겹**을 먹색으로 덮는다.

       mask 를 주면 그 알파를 실루엣으로 삼는다 — 몸·옷은 **합집합**을 준다.
       안 그러면 살↔옷 경계에 없는 선이 하나 더 생긴다(겹선).
       도구·등짐은 제 실루엣을 쓴다(손에 든 것은 손과 갈려 보여야 한다)."""
    a = mask if mask is not None else [sheet[i * 4 + 3] for i in range(w * h)]
    hits = []
    for y in range(h):
        base = y * w
        for x in range(w):
            i = base + x
            if a[i] < athr or sheet[i * 4 + 3] < athr:
                continue
            if (x == 0 or a[i - 1] < athr or x == w - 1 or a[i + 1] < athr
                    or y == 0 or a[i - w] < athr or y == h - 1 or a[i + w] < athr):
                hits.append(i)
    for i in hits:
        o = i * 4
        sheet[o], sheet[o + 1], sheet[o + 2] = rgb
    return sheet


def edge_darken(sheet, w, h, k, athr, mask=None):
    """실루엣 안쪽 한 겹의 RGB 를 k 배로 낮춘다 — 옛 자체 아웃라인(`T96_INK=0` 되돌림 경로).
       ★`ink_outline` 과 배타적이다: 이건 **곱해서** 낮추니 화소마다 색이 달라 '그늘'이고,
         `ink_outline` 은 같은 자리를 **한 색으로 덮으니** 비로소 '선'이다."""
    if k >= 0.999:
        return sheet
    a = mask if mask is not None else [sheet[i * 4 + 3] for i in range(w * h)]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if a[i] < athr or sheet[i * 4 + 3] < athr:
                continue
            edge = (x == 0 or a[i - 1] < athr or x == w - 1 or a[i + 1] < athr
                    or y == 0 or a[i - w] < athr or y == h - 1 or a[i + w] < athr)
            if edge:
                o = i * 4
                sheet[o] *= k; sheet[o + 1] *= k; sheet[o + 2] *= k
    return sheet


def post_all(built, w, h, *, silhouette, partner_of, alpha_of, ink_px, cel_bands, edge_a, edge_k):
    """한 클립의 층 전부에 후처리를 건다 — **굽기와 되굽기가 같이 부르는 자리**.

       built      : [(층이름, sheet), ...]  (제자리 수정)
       silhouette : 합집합 실루엣을 쓰는 층 이름 집합(몸·옷)
       partner_of : 층이름 → 짝 층이름 (몸의 짝은 기본 한 벌 · 옷의 짝은 몸)
       alpha_of   : 층이름 → 알파 리스트를 내는 함수(없으면 None — 짝이 이 판에 없다는 뜻)
       ★순서가 규약이다: **셀 먼저, 먹선 나중.** 반대로 하면 방금 그은 먹선이 양자화에 끌려
         올라가 선이 흐려지고, 먹색이 휘도 분포에 섞여 칸 경계까지 움직인다.
       ★[T116] 실루엣 합집합·짝 표는 **캐릭터의 정책**이라 인자로 받는다(몸↔옷). 자연물·소품은
         층이 하나뿐이라 `silhouette=set()` 을 주면 전부 `mask=None` 경로로 간다."""
    if not (ink_px or cel_bands >= 2 or edge_k < 0.999):
        return
    for lname, sheet in built:
        if cel_bands >= 2:
            cel_quantize(sheet, w, h, cel_bands, edge_a, mask=None)
        if lname in silhouette:
            uni = list(alpha_of(lname))
            other = alpha_of(partner_of.get(lname))
            if other:
                for i in range(w * h):
                    if other[i] > uni[i]:
                        uni[i] = other[i]
            mask = uni
        else:
            # 도구·등짐은 **제 실루엣**이다 — 손에 든 것이 손과 갈려 보여야 한다.
            mask = None
        if ink_px:
            ink_outline(sheet, w, h, INK_A, mask=mask)
        elif edge_k < 0.999:
            edge_darken(sheet, w, h, edge_k, edge_a, mask=mask)


# ── float 시트 입출력 ─────────────────────────────────────────────────────────
#   ★[T107] 왜 있나: 8bit raw 에 후처리를 다시 걸면 양자화 칸 경계가 반올림에 옮겨 가 배포 PNG 와
#     **바이트가 다르다**(실측 화소 14,255곳 · 최대 채널차 160). 그래서 먹선·셀 세기를 한 칸
#     바꾸려면 1시간 27분을 다시 구워야 했다. 굽기가 후처리 **전** float 시트를 EXR 로 남기고
#     되굽기가 그걸 읽어 **같은 `post_all`** 을 태우면, 굽기 없이 바이트가 같은 결과가 나온다.
#   (`ink_post.py` 시절의 `import bpy` 지연 들여오기는 뺐다 — 이 파일은 이미 맨 위에서 들여온다.)
def load_exr(path):
    """EXR(float32 · 무손실 ZIP) → (sheet, w, h). 굽기가 남긴 **후처리 전** 값 그대로."""
    img = bpy.data.images.load(path)
    w, h = img.size
    sheet = list(img.pixels[:])
    bpy.data.images.remove(img)
    return sheet, w, h


def save_png(sheet, w, h, path):
    """`char_render.save_sheet` 와 **같은 경로**로 PNG 를 쓴다 — 인코더가 같아야 바이트가 같다."""
    img = bpy.data.images.new("sheet", width=w, height=h, alpha=True)
    img.pixels = sheet
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def save_exr(sheet, w, h, path):
    """후처리 **전** float 시트를 EXR 로 남긴다(float32 · ZIP = 무손실).
       ★half(16bit)로 줄이면 용량이 절반이지만 **바이트 동일을 보장 못 한다**:
         8bit 한 칸이 1/255 = 0.0039 인데 half 의 1.0 근처 간격이 0.001 이라 네 배밖에 안 곱다 —
         반올림 경계에 걸린 값 하나면 갈린다. 증명이 목적이므로 float32 를 쓴다."""
    img = bpy.data.images.new("raw", width=w, height=h, alpha=True, float_buffer=True)
    img.pixels = sheet
    st = bpy.context.scene.render.image_settings
    keep = (st.file_format, st.color_mode, getattr(st, "color_depth", None), getattr(st, "exr_codec", None))
    st.file_format = 'OPEN_EXR'; st.color_mode = 'RGBA'
    st.color_depth = '32'; st.exr_codec = 'ZIP'
    img.save_render(path)
    st.file_format, st.color_mode = keep[0], keep[1]
    if keep[2] is not None:
        st.color_depth = keep[2]
    if keep[3] is not None:
        st.exr_codec = keep[3]
    bpy.data.images.remove(img)


# ── 상자 못박기 [T107 에서 옮김 · T116 에서 공용] ──────────────────────────────
#   ★왜 [T107 §0-ⓐ 실측]: 포즈를 고치면 상자가 다시 잡히고, 그러면 프레임 크기와 앵커가 흔들려
#     **안 건드린 클립의 시트까지** 다시 구워야 한다. swing·aim 의 축을 바로잡자 상자가
#     u ±160.21 → ±143.83 · w −240.57 → −225.16 으로 **줄었다**. 크기가 줄어도 규격이 바뀌면
#     클라가 보는 자가 바뀐다. ⇒ 이미 배포된 메타가 있으면 **그 값을 쓴다**. 새 상자가 그 안에
#     안 들어가면 **크게 실패한다** — 조용히 잘리는 것보다 낫다(그때는 사람이 규격을 새로 정할 일).
#
#   ★[T116 §0-ⓒ 실측] 배포 메타의 서식이 자산군마다 다르다. 그래서 읽는 쪽을 여기 한 벌 둔다:
#     ┌ 자산군          파일                                    상자          앵커        모양
#     │ 캐릭터          public/assets/char/char_meta.json        frameW/frameH anchorX/Y   최상위 **하나**(전 시트 공용)
#     │ 자연물·소품·    …/nature_anchors.json · props_ · crops_  w/h           ox/oy       **자산마다** {키: {...}}
#     │ 작물·산         …/mountain_anchors.json
#     └ 건물            **배포 메타가 없다** — building_anchors.json 은 scripts/building_renders/
#                       (gitignore) 에만 있다. 세션8 이 건물에 걸려면 먼저 배포로 올려야 한다.
#     ⇒ 자산별 서식(`w/h/ox/oy`)은 바로 위 `render_world_pass()` 가 **내는 그 서식**이다.
#       즉 공용이 쓰는 것을 공용이 읽는다 — 이름을 새로 짓지 않았다.
def read_pinned_box(path, key=None, *, scale=1.0):
    """배포 메타에서 얼린 상자 (FW, FH, AX, AY) 를 꺼낸다. 없으면 **None**(= 매번 새로 잰다).

       path  : 배포 메타 경로. 없으면 None 을 낸다(첫 굽기 — 못박을 것이 없다).
       key   : 자산별 서식일 때 그 자산의 키(`"bush01"`). 캐릭터처럼 최상위 하나면 None.
       scale : 메타가 클라 픽셀이면 굽기 픽셀로 올리는 배수(캐릭터는 `SS`). 자산별 서식은 1.
       ★`scale` 이 정수면 FW·FH 도 정수로 남는다 — 해상도로 그대로 들어가는 값이라 그래야 한다."""
    import json                      # 이 파일 맨 위 import 줄을 안 건드리려고 여기서 들여온다
    if not path or not os.path.exists(path):
        return None
    with open(path) as f:
        m = json.load(f)
    if key is not None:
        m = m.get(key)
        if not m:
            return None
    if "frameW" in m:                                    # 캐릭터 서식
        fw, fh, ax, ay = m["frameW"], m["frameH"], m["anchorX"], m["anchorY"]
    elif "w" in m and "ox" in m:                         # 자연물·소품·작물·산 서식
        fw, fh, ax, ay = m["w"], m["h"], m["ox"], m["oy"]
    else:
        # ★파일이 **있는데** 서식이 둘 다 아니면 그건 "못박을 것이 없다"가 아니라 **버그**다.
        #   여기서 None 을 내면 상자를 새로 재 버려, 못박기가 막으려던 바로 그 일(규격이 조용히
        #   바뀌는 것)이 일어난다. 없는 것과 깨진 것을 같게 다루지 않는다.
        raise SystemExit(f"[render_common] 상자 메타 서식을 모르겠다: {path}"
                         f" (키 {sorted(m)[:8]}…) — frameW/frameH 나 w/h/ox/oy 중 하나여야 한다")
    return (int(fw) * scale, int(fh) * scale, float(ax) * scale, float(ay) * scale)


def fit_pinned_box(pinned, umin, umax, wmin, wmax, *, label="asset", verbose=True):
    """새로 잰 상자가 얼린 상자 안에 들어가는지 본다.

       pinned : `read_pinned_box()` 가 낸 (FW, FH, AX, AY) — 굽기 픽셀.
       나머지 : 이번에 실측한 화면 상자(굽기 픽셀 · u=가로, w=세로).
       → (FW, FH, AX, AY, cu, cw). cu·cw 는 얼린 상자의 한가운데(카메라를 그리로 옮긴다).
       ★안 들어가면 **SystemExit** — 잘린 그림을 조용히 배포하느니 여기서 멈춘다."""
    fw, fh, ax, ay = pinned
    cu, cw = fw / 2.0 - ax, fh / 2.0 - ay
    fit = (umin >= cu - fw / 2.0 and umax <= cu + fw / 2.0
           and wmin >= cw - fh / 2.0 and wmax <= cw + fh / 2.0)
    if verbose:
        print(f"[{label}] 상자 못박음: 잰 값 u[{umin:.1f},{umax:.1f}] w[{wmin:.1f},{wmax:.1f}]"
              f" → 얼린 값 {fw}x{fh} 중심({cu:.1f},{cw:.1f}) · 들어맞음={fit}")
    if not fit:
        raise SystemExit(f"[{label}] ★상자를 벗어난다 — 얼린 프레임에 안 들어간다. 규격을 새로 정해야 한다.")
    return fw, fh, ax, ay, cu, cw
