#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/props_render.py — 가구·시설 정본 [재민 확정 2026-09-03 · T67]
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
# 실행:  python3 scripts/props_render.py            (컨테이너 · pip `bpy`)
#        blender -b -P scripts/props_render.py      (blender 바이너리)
#        PROPS_ONLY=chest,wall  … 일부만
# 결과:  scripts/props_renders/<world_key>.png + props_anchors.json   (세계용 · 1:1 · PPU 45.255)
#        scripts/props_icon_renders/<icon_key>.png                     (512² — icons-postprocess.js 가 96px 로)
# 배치:  cp scripts/props_renders/*        public/assets/props/
#        node scripts/icons-postprocess.js scripts/props_icon_renders public/assets/icons
# =============================================================================

import bpy, os, math, random, json, mathutils

V = mathutils.Vector

SAMPLES = 64
SS = 3                                   # 세계 패스 초과표본(자연물 규약) — 굽고 나서 1:1 로 되돌린다
RES_ICON = 512
PPU = 64.0 / math.sqrt(2.0)              # 45.255 px/유닛(=1셀=1m) — 셀 다이아 가로폭 64px
ZSQ = 32.0 / (PPU * math.cos(math.radians(30.0)))   # 0.8165 — 1m 높이 = 32px
HERE = os.path.dirname(os.path.abspath(__file__))
OUT_W = os.path.join(HERE, "props_renders")
OUT_I = os.path.join(HERE, "props_icon_renders")
os.makedirs(OUT_W, exist_ok=True)
os.makedirs(OUT_I, exist_ok=True)


# ═══════════════ 재질 (building_render.py / icon_render.py 와 같은 문법) ═══════════════
def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return mat.node_tree.nodes.get("Principled BSDF")


def simple_mat(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    try: b.inputs["Metallic"].default_value = metal
    except Exception: pass
    return m


def striped_mat(name, base, stripe, scale=22.0, rough=0.8, bump=0.35, dist=3.0):
    """결(나무·이엉) — 웨이브 텍스처 계단 + 범프."""
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
    """투톤 노이즈 + 범프 — 막돌·흙 (rock 문법 축약)."""
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


# ═══════════════ 씬 ═══════════════
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
_bg = scene.world.node_tree.nodes.get("Background")
if _bg:
    _bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); _bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'; cam_d.clip_start = 0.1; cam_d.clip_end = 2000
# ★★`ortho_scale` 은 sensor_fit 이 AUTO 면 **긴 변**을 잡는다. 건물·자연물 스프라이트는 늘
#   가로가 길어 이 함정이 안 드러났는데, 가구는 **세로가 긴 것이 절반**이다(벽 43×88 · 문 45×90 …).
#   그대로 두면 세로 긴 그림이 h/w 배(문 = 2배) 확대돼 **가운데만 찍힌다** — 1패스에서 실제로
#   문설주 둘이 화면 밖으로 나가고 문짝만 꽉 찬 그림이 나왔다(알파 덤프로 잡았다).
#   ⇒ 가로로 못박는다. 그래야 `ortho_scale = Wpx/PPU` 가 언제나 PPU 를 뜻한다.
cam_d.sensor_fit = 'HORIZONTAL'
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam
print("[props] bpy", bpy.app.version_string, "denoise =", scene.cycles.use_denoising,
      "ppu =", round(PPU, 3), "zsq =", round(ZSQ, 4))

# 세계 패스 축(building_render.py 와 같은 수학)
THETA = math.radians(30.0)
NHAT = V((math.cos(THETA) / math.sqrt(2), math.cos(THETA) / math.sqrt(2), math.sin(THETA)))
RHAT = V((1.0, -1.0, 0.0)).normalized()
UHAT = V((-math.sin(THETA) / math.sqrt(2), -math.sin(THETA) / math.sqrt(2), math.cos(THETA)))
# 아이콘 패스 축(icon_render.py 와 같은 값)
ISO_DIR = V((1.0, -1.0, 1.2)).normalized()

SUN_WORLD = (math.radians(52), 0, math.radians(-35))   # FLIP 보정 뒤 기존 베이크와 같은 방향
SUN_ICON = (math.radians(52), 0, math.radians(35))


# ═══════════════ PNG 후처리 — 좌우 FLIP + 초과표본 되돌리기 ═══════════════
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
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    o = bpy.context.active_object
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = len(p.vertices) == 4        # 옆면만 스무스 · 뚜껑은 플랫(소체 2차 규약)
    return add(o, mat)


def ico(r, loc, subdiv=1, mat=None, scale=(1, 1, 1), jitter=0.0, seed=None):
    if seed is not None:
        random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object; o.scale = scale
    if jitter:
        for v in o.data.vertices:
            v.co *= (1.0 + random.uniform(-jitter, jitter))
    return add(o, mat)


def cord(r, length, loc, rot, mat, verts=8):
    """새끼줄 한 바퀴 — 가는 원통(감은 티만 난다)."""
    return cyl(r, length, loc, rot=rot, mat=mat, verts=verts)


# ═══════════════ 재질표 ═══════════════
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
M['ochre'] = simple_mat("p_ochre", (0.66, 0.30, 0.18), 0.85)                                  # 붉은 흙 안료


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
]


# ═══════════════ 렌더 ═══════════════
def _bake_transforms():
    if not OBJS:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = OBJS[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')


def _zmax():
    z = -1e18
    for o in OBJS:
        for v in o.data.vertices:
            z = max(z, v.co.z)
    return z


def _squash_z():
    for o in OBJS:
        for v in o.data.vertices:
            v.co.z *= ZSQ


def render_icon(key):
    """아이콘 패스 — icon_render.py 와 같은 씬(ISO_DIR · bbox 맞춤 512² · 압축·FLIP 없음)."""
    sun.rotation_euler = SUN_ICON
    mn = [1e18] * 3; mx = [-1e18] * 3
    for o in OBJS:
        for c in o.bound_box:
            w = o.matrix_world @ V(c)
            for k in range(3):
                mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
    ctr = V(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    size = max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
    scene.render.resolution_x = RES_ICON; scene.render.resolution_y = RES_ICON
    tgt.location = ctr
    cam.location = ctr + ISO_DIR * (size * 4 + 20)
    cam_d.ortho_scale = size * 1.25 + 0.5
    p = os.path.join(OUT_I, key + ".png")
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    print(f"[props] icon {key}: {RES_ICON}²  (size={size:.2f}m)")


def render_world(key, margin=3):
    """세계 패스 — building_render.py 와 같은 씬(45°/30° · PPU 45.255 · ZSQ · FLIP).
    프레임은 화면 bbox 에 맞추고, **로컬 원점(0,0,0)의 픽셀 좌표**를 앵커로 낸다."""
    sun.rotation_euler = SUN_WORLD
    umin = wmin = 1e18; umax = wmax = -1e18
    for o in OBJS:
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
    scene.render.resolution_x = Wpx * SS; scene.render.resolution_y = Hpx * SS
    cam_d.ortho_scale = Wpx / PPU                 # ★해상도만 SS 배 — 픽셀 밀도가 SS 배가 된다
    tgt.location = ctr
    cam.location = ctr + NHAT * 300.0
    p = os.path.join(OUT_W, key + ".png")
    scene.render.filepath = p
    bpy.ops.render.render(write_still=True)
    _post_png(p, ss=SS, flip=True)                # 초과표본 되돌리기 + 게임 손방향 보정
    ox = Wpx / 2.0 - (umin + umax) * 0.5
    oy = Hpx / 2.0 - (wmin + wmax) * 0.5
    print(f"[props] world {key}: {Wpx}×{Hpx} anchor=({ox:.2f},{oy:.2f}) ppu={PPU:.3f}")
    return {"w": Wpx, "h": Hpx, "ox": round(ox, 2), "oy": round(oy, 2), "ppu": round(PPU, 3)}


def cleanup():
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


ONLY = [k for k in os.environ.get('PROPS_ONLY', '').split(',') if k]
apath = os.path.join(OUT_W, "props_anchors.json")
anchors = {}
if os.path.exists(apath):
    try: anchors = json.load(open(apath))
    except Exception: anchors = {}

for p in PROPS:
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

json.dump(anchors, open(apath, "w"), indent=1, ensure_ascii=False)
print("[props] DONE ->", OUT_W, len(anchors), "world keys ·", OUT_I, "icons")
