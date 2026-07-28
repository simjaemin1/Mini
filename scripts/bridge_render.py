# bridge_render.py — durango-mini 다리(통나무 널다리) 타일 스프라이트 렌더
#   씬·조명·재질 정본은 icon_render.py 계열과 동일(Cycles·film_transparent·ORTHO·태양 52°/35° energy 3.6·
#   월드 (0.52,0.56,0.6)@0.55·SAMPLES 64·OpenImageDenoise 부재 자동 감지).
#
# ★아이콘과 결정적으로 다른 점 — **카메라가 게임 투영과 정확히 일치해야 한다.**
#   클라 투영: w2i(wx,wy,wz) = { x: wx-wy, y: (wx+wy)/2 - wz }  → 2:1 다이메트릭.
#   카메라 기저를 그 식에서 역산하면:
#     화면 오른쪽 r̂ = (1,-1,0)/√2      (+x 오른쪽, +y 왼쪽 — 식의 x항)
#     시선(카메라 쪽) n̂ = (cosθ/√2, cosθ/√2, sinθ),  sinθ = 0.5  →  **고도각 θ=30°, 방위각 45°**
#   이 각도에서 1×1 셀은 가로 √2 · 세로 √2/2 (정확히 2:1) 다이아몬드로 투영된다.
#   ortho_scale = 2√2 로 두면 **셀 다이아몬드 폭 = 이미지 폭의 정확히 1/2**, 타깃(셀 중심)=이미지 중심.
#   → 클라는 셀 중심 화면좌표에 한 변 2×(64px)=128px 정사각으로 그리면 픽셀 단위로 맞는다.
#
# ★타일러블 규약: 1 Blender 유닛 = 1 셀(32 게임 px). 타일은 x,y ∈ [0,1].
#   - 종방향 통나무(보)는 x=0..1 전 구간을 관통 → 셀 경계에서 끊김 없음.
#   - 횡방향 널은 주기 0.2(5장/셀)로 **경계를 걸치지 않게** 배치 → 이웃 타일과 이음매 없음.
#   - 널은 y=0..1 전폭 → 폭 2셀 다리에서 두 줄이 맞닿아 하나의 상판으로 읽힌다.
#
# 실행:  blender -b -P bridge_render.py
# 결과:  ./bridge_renders/bridge_{mid,cap0,cap1}_{x,y}.png (256², 알파)
# 고증: 청동기 후기(송국리) — 통나무 보 + 쪼갠 널 + 새끼 결속 + 말뚝. 석조 아치·제재목 금지.

import bpy, os, math, random, mathutils
V = mathutils.Vector

RES = 256
SAMPLES = 64
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "bridge_renders")
os.makedirs(OUTDIR, exist_ok=True)


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


def bumped_mat(name, c1, c2, noise_scale=9.0, bump=0.5, rough=0.85, ramp=(0.42, 0.62)):
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


def striped_mat(name, base, stripe, scale=22.0, rough=0.75, bump=0.3):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    w = nt.nodes.new("ShaderNodeTexWave"); w.inputs["Scale"].default_value = scale
    try: w.inputs["Distortion"].default_value = 3.0
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


# ===== 씬 =====
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
print("[bridge] denoise =", scene.cycles.use_denoising, "samples =", SAMPLES)
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.resolution_x = RES; scene.render.resolution_y = RES
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(35))
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'; cam_d.clip_start = 0.1; cam_d.clip_end = 1000
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam

# ★게임 투영 정합 카메라 — 방위 45°·고도 30°(sinθ=0.5 ⇒ 2:1), ortho_scale = 2√2(= 셀 다이아 폭 ×2)
THETA = math.radians(30.0)
NHAT = V((math.cos(THETA) / math.sqrt(2), math.cos(THETA) / math.sqrt(2), math.sin(THETA)))
CELL_DIAG_W = math.sqrt(2.0)                 # 1×1 셀의 투영 가로폭(Blender 유닛)
cam_d.ortho_scale = CELL_DIAG_W * 2.0        # 이미지 폭 = 셀 다이아 폭 ×2

# ===== 재질 =====
M = {}
M['log']    = striped_mat("log",   (0.44, 0.31, 0.17), (0.34, 0.23, 0.12), 20, 0.85, 0.45)   # 껍질 붙은 통나무 보
M['plank']  = striped_mat("plank", (0.60, 0.45, 0.26), (0.50, 0.36, 0.20), 13, 0.80, 0.35)   # 쪼갠 널(결 굵게 — 축소 판독)
M['plank2'] = striped_mat("plank2",(0.55, 0.41, 0.23), (0.46, 0.33, 0.18), 15, 0.82, 0.35)   # 널 색 변주(단조로움 방지)
M['cord']   = simple_mat("cord",   (0.55, 0.45, 0.26), 0.9)
M['soil']   = bumped_mat("soil",   (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95)
M['straw']  = striped_mat("straw", (0.80, 0.66, 0.31), (0.66, 0.51, 0.21), 30, 0.85, 0.4)   # 볏짚 단(곳간 짐더미)
M['pottery']= bumped_mat("pottery",(0.52, 0.32, 0.20), (0.38, 0.22, 0.13), 6, 0.3, 0.75)      # 토기 항아리
M['stone']  = bumped_mat("stone",  (0.34, 0.33, 0.31), (0.16, 0.16, 0.16), 9, 0.8, 0.95)

OBJS = []


def add(o, mat):
    if mat is not None:
        o.data.materials.append(mat)
    OBJS.append(o)
    return o


def cyl(r, d, loc, rot=(0, 0, 0), mat=None, verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)


def box(sx, sy, sz, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)   # ★scale은 호출부에서 덮어쓰지 않는다(icon 파이프라인 함정 8차 교훈)
    return add(o, mat)


def ico(r, loc, subdiv=1, mat=None, scale=(1, 1, 1), jitter=0.0):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object
    if jitter > 0:
        for v in o.data.vertices:
            v.co = v.co * (1.0 + random.uniform(-jitter, jitter))
    o.scale = scale
    return add(o, mat)


# ===== 다리 부재 =====
DECK_Z = 0.16          # 상판 윗면 높이(셀=1.0 기준 — 물 위 한 뼘)
LOG_R = 0.085
PLANK_T = 0.035
PLANK_W = 0.15         # 널 폭(주기 0.2 → 셀당 5장, 경계 미접촉)
PLANK_SPAN = 1.06      # ★널 y 길이 — 셀 폭보다 살짝 길게(±0.03). 이웃 타일 스프라이트의 알파 가장자리가
                       #   서로 덮여 **셀마다 생기던 가는 이음매 선**이 사라진다(1패스 육안에서 확인된 결함).
LOG_Y = (0.15, 0.85)   # ★보를 바깥으로 — 상판 아래로 둥근 통나무 배가 비쳐야 '통나무 널다리'로 읽힌다
                       #   (1패스: 보가 널에 완전히 가려 그냥 판때기 부교로 보였음)


def bearers(seed=0):
    """종방향 통나무 보 2개 — x=0..1 전 구간 관통(셀 경계 이음매 없음)."""
    random.seed(seed)
    for y in LOG_Y:
        # 길이 1.0(셀 관통). 보의 평평한 끝면은 **경계에 걸친 널**(deck의 x=0.0/1.0 장)이 덮어 가린다.
        #   ※3패스 교훈: 보를 셀 밖으로 내밀면(1.16) 나중에 그려지는 이웃 스프라이트가 그 끝을
        #     상판 **위에** 얹어 버려 셀마다 혹이 돋는다 — 화가 알고리즘 순서 때문. 내밀지 말 것.
        cyl(LOG_R, 1.0, (0.5, y, DECK_Z - PLANK_T / 2 - LOG_R * 0.62),
            rot=(0, math.radians(90), 0), mat=M['log'], verts=14)


def deck(seed=0, x0=0.0, x1=1.0):
    """횡방향 널 — 주기 0.2, 셀 경계를 걸치지 않게 x=0.1,0.3,…에 중심. y는 전폭(+오버랩)."""
    random.seed(seed + 7)
    # ★널 위상 = 0.0,0.2,…,1.0 — **경계에 널이 걸친다**(양끝 장은 반만 보이고, 이웃 타일의 반쪽과
    #   정확히 겹쳐 한 장이 된다). 3패스 교훈: 경계를 '틈'으로 두면 그 틈으로 보의 끝면·물이 비쳐
    #   셀 주기가 눈에 띈다. 널로 덮는 쪽이 이음매가 사라진다.
    xs = [round(0.2 * i, 3) for i in range(6)]
    for i, x in enumerate(xs):
        if x < x0 - 1e-6 or x > x1 + 1e-6:
            continue
        jz = random.uniform(-0.004, 0.004)          # 널 높낮이 미세 차 — 손으로 깐 느낌
        jy = random.uniform(-0.010, 0.010)
        box(PLANK_W, PLANK_SPAN, PLANK_T, (x, 0.5 + jy, DECK_Z + jz),
            rot=(0, 0, random.uniform(-0.012, 0.012)),
            mat=(M['plank'] if i % 2 == 0 else M['plank2']))


def lashing(x=0.5):
    """새끼 결속 — ★상판 위가 아니라 **보를 감아 도는** 밧줄(1패스: 갑판에 박힌 쇠꺾쇠처럼 보였음).
    널 아래·보 바깥면에 걸쳐 축소해도 '묶은 자국'으로만 읽히게 한다."""
    for y in LOG_Y:
        bpy.ops.mesh.primitive_torus_add(major_radius=LOG_R + 0.012, minor_radius=0.013,
                                         location=(x, y, DECK_Z - PLANK_T / 2 - LOG_R * 0.62),
                                         rotation=(0, math.radians(90), 0))
        add(bpy.context.active_object, M['cord'])


def abutment(at_x1=True, seed=0):
    """접지부 — 흙둔덕 + 굄돌 + 말뚝 2개. 다리 끝이 뭍에 얹히는 자리(1패스보다 크고 뚜렷하게)."""
    random.seed(seed + 31)
    ex = 0.97 if at_x1 else 0.03
    sgn = 1.0 if at_x1 else -1.0
    # 흙둔덕 — 널 끝을 받치고 뭍으로 이어지는 둔덕(상판 옆으로 비져 나오게 폭을 넓게)
    ico(0.34, (ex + sgn * 0.06, 0.5, DECK_Z - 0.13), subdiv=1, mat=M['soil'],
        scale=(0.80, 1.35, 0.52), jitter=0.20)
    for _ in range(5):   # 굄돌 — 둔덕 앞자락에 박히듯
        ico(random.uniform(0.06, 0.095),
            (ex + sgn * random.uniform(-0.06, 0.06), random.uniform(0.10, 0.90), DECK_Z - 0.08),
            subdiv=1, mat=M['stone'], jitter=0.3)
    # ★보의 끝 — 뭍 쪽으로만 내밀어 둔덕에 얹는다(중간 타일에선 절대 내밀지 않는다: 화가 순서 혹 발생).
    #   다리를 '통나무 위에 널을 깐 것'으로 읽게 하는 유일한 단서라 접지부에만 노출한다.
    for y in LOG_Y:
        cyl(LOG_R, 0.26, (ex + sgn * 0.10, y, DECK_Z - PLANK_T / 2 - LOG_R * 0.62),
            rot=(0, math.radians(90), 0), mat=M['log'], verts=14)
    for y in (0.15, 0.85):   # 말뚝 — 상판 모서리에 박아 널을 잡아 준다(짧고 굵게)
        cyl(0.042, 0.22, (ex - sgn * 0.02, y, DECK_Z + 0.07), mat=M['log'], verts=8)


# ===== 타일 조립 =====
def t_mid():
    bearers(1); deck(1); lashing(0.5)


def t_cap1():     # +x 쪽 끝(뭍에 닿는 쪽이 x=1)
    bearers(2); deck(2); lashing(0.3); abutment(True, 2)


def t_cap0():     # -x 쪽 끝
    bearers(3); deck(3); lashing(0.7); abutment(False, 3)


# ===== 곳간 짐더미(재고 가시화) =====
#   사다리 앞 칸에 쌓인 볏짚 단 — 재고 구간 2단계. 다리와 **같은 셀 정합 카메라**를 쓰므로
#   클라는 다리 타일과 똑같이 "셀 중심에 128px 정사각"으로 그리면 된다(별도 규약 불필요).
def _bundle(x, y, z, ang, ln=0.30, r=0.075, seed=0):
    """볏짚 단 1개 — 눕힌 원기둥 + 새끼 결속 2줄."""
    cyl(r, ln, (x, y, z), rot=(0, math.radians(90), ang), mat=M['straw'], verts=10)
    for t in (-0.28, 0.28):
        bpy.ops.mesh.primitive_torus_add(major_radius=r + 0.008, minor_radius=0.012,
                                         location=(x + math.cos(ang) * ln * t, y + math.sin(ang) * ln * t, z),
                                         rotation=(0, math.radians(90), ang))
        add(bpy.context.active_object, M['cord'])


# ★크기: 셀(=32게임px) 대비 폭 0.8~0.9 — 1패스 육안에서 단이 너무 잘아 죽처럼 뭉갰다(인게임 25px 미만).
def t_pile1():   # 적은 재고 — 단 3개(바닥 한 층)
    random.seed(71)
    for i, (x, y, a) in enumerate(((0.34, 0.40, 0.15), (0.60, 0.50, -0.20), (0.44, 0.66, 0.45))):
        _bundle(x, y, 0.12, a, ln=0.46, r=0.12, seed=i)


def t_pile2():   # 많은 재고 — 아래 4 + 위 2 + 토기 항아리 2
    random.seed(72)
    for i, (x, y, a) in enumerate(((0.30, 0.38, 0.10), (0.58, 0.34, -0.15), (0.34, 0.64, 0.35), (0.62, 0.62, -0.40))):
        _bundle(x, y, 0.12, a, ln=0.46, r=0.12, seed=i)
    for i, (x, y, a) in enumerate(((0.42, 0.46, 0.55), (0.56, 0.56, -0.05))):
        _bundle(x, y, 0.335, a, ln=0.42, r=0.115, seed=10 + i)
    for (x, y) in ((0.78, 0.50), (0.22, 0.52)):        # 토기 항아리(재고가 곳간 밖까지 넘친 느낌)
        cyl(0.105, 0.24, (x, y, 0.12), mat=M['pottery'], verts=14)
        cyl(0.070, 0.07, (x, y, 0.265), mat=M['pottery'], verts=14)


JOBS = [("bridge_mid", t_mid, True), ("bridge_cap1", t_cap1, True), ("bridge_cap0", t_cap0, True),
        ("gran_pile1", t_pile1, False), ("gran_pile2", t_pile2, False)]


def frame_and_render(path, rot_z_deg):
    """셀 중심(0.5,0.5,0)을 이미지 중심에 두고 렌더. rot_z_deg=90이면 다리 축이 y축(세로 방향)."""
    if rot_z_deg:
        bpy.ops.object.select_all(action='DESELECT')
        for o in OBJS:
            o.select_set(True)
        bpy.context.view_layer.objects.active = OBJS[0]
        bpy.ops.transform.rotate(value=math.radians(rot_z_deg), orient_axis='Z',
                                 center_override=(0.5, 0.5, 0.0))
        bpy.ops.object.select_all(action='DESELECT')
    ctr = V((0.5, 0.5, 0.0))
    tgt.location = ctr
    cam.location = ctr + NHAT * 40.0
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if rot_z_deg:                     # 원위치(다음 축 렌더를 위해 되돌린다)
        bpy.ops.object.select_all(action='DESELECT')
        for o in OBJS:
            o.select_set(True)
        bpy.context.view_layer.objects.active = OBJS[0]
        bpy.ops.transform.rotate(value=math.radians(-rot_z_deg), orient_axis='Z',
                                 center_override=(0.5, 0.5, 0.0))
        bpy.ops.object.select_all(action='DESELECT')


def cleanup():
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        try: o.select_set(True)
        except Exception: pass
    bpy.ops.object.delete()


ONLY = [k for k in os.environ.get('BRIDGE_ONLY', '').split(',') if k]
for (key, fn, two_axis) in JOBS:
    if ONLY and key not in ONLY:
        continue
    OBJS = []
    globals()['OBJS'] = OBJS
    fn()
    print("[bridge] render", key, "objs=", len(OBJS), "축2종" if two_axis else "단일")
    if two_axis:
        frame_and_render(os.path.join(OUTDIR, key + "_x.png"), 0)      # 다리 축 = 월드 x
        frame_and_render(os.path.join(OUTDIR, key + "_y.png"), 90)     # 다리 축 = 월드 y
    else:
        frame_and_render(os.path.join(OUTDIR, key + ".png"), 0)        # 방향 없는 소품(짐더미)
    cleanup()

print("[bridge] DONE ->", OUTDIR)
