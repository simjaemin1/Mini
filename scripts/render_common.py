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
#            PNG 후처리(`_post_png`)
#   안 갖는다: **모델**(무엇을 만드는가) · **재질표 `M`**(어떤 색인가).
#            팔레트는 파일마다 다르다 — icon 의 `stone` 과 props 의 `stone` 은 다른 돌이다.
#            섞으면 그림이 바뀐다. 두 팔레트는 **두 팔레트로 남는다**(T77 §0-ⓒ).
#
# ★★씬 값은 **무변**이다. 여기 숫자를 고치면 자연물·건물·캐릭터와 한 몸이던 그림이 갈린다.
#   Cycles · film_transparent · ORTHO · SAMPLES 64 · view_transform Standard ·
#   월드 (0.52,0.56,0.6)@0.55 · 태양 고도 52° energy 3.6 angle 0.2
#     [아이콘 프리셋] ISO_DIR (1,−1,1.2) · bbox 맞춤 512² · 압축 없음 · FLIP 없음 · 태양 방위 +35°
#     [세계  프리셋] 방위 45°/고도 30° · PPU 45.255 · ZSQ 0.8165 · SS 3 · FLIP · 태양 방위 −35°
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
    for blk in (bpy.data.meshes,):
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
def render_world_pass(objs, path, margin=3):
    """방위 45°/고도 30° · PPU 45.255 · SS 3 초과표본 · 좌우 FLIP · 태양 −35°.
    프레임은 **화면 bbox** 에 맞추고, 로컬 원점 (0,0,0) 의 픽셀 좌표를 앵커로 낸다.
    ⚠호출 전에 `bake_transforms()` 와 (게임 화법이 필요하면) `squash_z()` 를 끝내 둬야 한다 —
      여기서는 `v.co` 를 그대로 읽는다."""
    SUN.rotation_euler = SUN_WORLD
    umin = wmin = 1e18; umax = wmax = -1e18
    for o in objs:
        for v in o.data.vertices:
            u = v.co.dot(RHAT) * PPU
            w = -v.co.dot(UHAT) * PPU
            umin = min(umin, u); umax = max(umax, u)
            wmin = min(wmin, w); wmax = max(wmax, w)
    Wpx = int(math.ceil(umax - umin)) + margin * 2
    Hpx = int(math.ceil(wmax - wmin)) + margin * 2
    a = (umin + umax) * 0.5 / PPU
    b = -(wmin + wmax) * 0.5 / PPU
    ctr = RHAT * a + UHAT * b
    SCENE.render.resolution_x = Wpx * SS; SCENE.render.resolution_y = Hpx * SS
    CAM_D.ortho_scale = Wpx / PPU                 # ★해상도만 SS 배 — 픽셀 밀도가 SS 배가 된다
    TGT.location = ctr
    CAM.location = ctr + NHAT * 300.0
    SCENE.render.filepath = path
    bpy.ops.render.render(write_still=True)
    _post_png(path, ss=SS, flip=True)             # 초과표본 되돌리기 + 게임 손방향 보정
    ox = Wpx / 2.0 - (umin + umax) * 0.5
    oy = Hpx / 2.0 - (wmin + wmax) * 0.5
    return {"w": Wpx, "h": Hpx, "ox": round(ox, 2), "oy": round(oy, 2), "ppu": round(PPU, 3)}
