# icon_render.py — durango-mini 인벤토리 아이콘 3D 렌더 (rock_render.py v3 / tree_render.py 와 동일 씬)
#   씬·카메라·조명 정본: Cycles·film_transparent·ORTHO·ISO_DIR(1,-1,1.2)·태양 52°/35° energy 3.6·월드 (0.52,0.56,0.6)@0.55
#   우분투 apt Blender 4.0.2 는 OpenImageDenoise 미포함 → build_options 감지해 자동 비활성 + SAMPLES 64.
# 실행:  blender -b -P icon_render.py
# 결과:  ./icon_renders/<key>.png (512², 알파)  — 이후 node로 bbox 크롭 + 96px 리사이즈
# 고증: 청동기 후기(송국리). 금속은 구리/청동 톤만. 플라스틱·철기 금지.

import bpy, os, math, random, mathutils
V = mathutils.Vector

RES = 512
SAMPLES = 64
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "icon_renders")
os.makedirs(OUTDIR, exist_ok=True)

def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': return n
    return mat.node_tree.nodes.get("Principled BSDF")

def simple_mat(name, color, rough=0.8, metal=0.0, emit=None, emit_str=0.0):
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

def bumped_mat(name, c1, c2, noise_scale=9.0, bump=0.5, rough=0.85, ramp=(0.42, 0.62)):
    """투톤 노이즈 + 범프 — rock_material 축약형(축소 판독성 위해 계단 램프)."""
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

def striped_mat(name, base, stripe, scale=22.0, rough=0.75):
    """결/줄무늬(고기 지방·나무 결) — 웨이브 텍스처 계단."""
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
    bmp = nt.nodes.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = 0.3
    nt.links.new(w.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m

# ===== 씬 =====
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
# ★우분투 빌드는 OpenImageDenoise 없음 — 감지해서 자동 비활성(있으면 켬)
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
print("[icon] denoise =", scene.cycles.use_denoising, "samples =", SAMPLES)
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.resolution_x = RES; scene.render.resolution_y = RES
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg: bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(35))
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'; cam_d.clip_start = 0.1; cam_d.clip_end = 1000
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam
ISO_DIR = V((1.0, -1.0, 1.2)).normalized()

# ===== 공용 재질 =====
M = {}
M['bark']    = bumped_mat("bark",   (0.26, 0.16, 0.09), (0.15, 0.09, 0.05), 14, 0.45, 0.92)
M['peeled']  = striped_mat("peeled",(0.72, 0.56, 0.34), (0.60, 0.44, 0.25), 26, 0.75)   # 껍질 벗긴 통나무
M['sawn']    = striped_mat("sawn",  (0.78, 0.63, 0.41), (0.66, 0.50, 0.30), 16, 0.7)    # 판자
M['stone']   = bumped_mat("stone",  (0.34, 0.33, 0.31), (0.16, 0.16, 0.16), 9, 0.8, 0.95)
M['straw']   = striped_mat("straw", (0.83, 0.68, 0.30), (0.68, 0.52, 0.20), 34, 0.8)    # 이엉·볏짚
M['grass']   = striped_mat("grass", (0.46, 0.55, 0.26), (0.34, 0.44, 0.18), 30, 0.7)    # 풀 줄기(생)
M['drygrass']= striped_mat("drygrass",(0.62, 0.58, 0.28), (0.48, 0.44, 0.20), 28, 0.8)  # 마른 풀 줄기(fiber — herb와 색 분리)
M['meat']    = striped_mat("meat",  (0.44, 0.11, 0.10), (0.56, 0.22, 0.19), 30, 0.5)    # 붉은 살: 촘촘한 근섬유 결(scale 30 — 6은 굵은 띠라 '분홍 뇌'로 읽혔음)
M['fat']     = simple_mat("fat",    (0.80, 0.68, 0.60), 0.5)                             # 지방·힘줄(살빛에 가깝게 — 흰 막대로 안 읽히게)
M['seedhull']= striped_mat("seedhull",(0.46, 0.16, 0.14), (0.60, 0.30, 0.22), 24, 0.55)  # 베리 씨앗 껍질(붉은 기)
M['cooked']  = striped_mat("cooked",(0.42, 0.22, 0.10), (0.26, 0.13, 0.06), 18, 0.5)
M['hide']    = bumped_mat("hide",   (0.60, 0.44, 0.28), (0.44, 0.31, 0.19), 7, 0.35, 0.8)
M['leather'] = bumped_mat("leather",(0.40, 0.27, 0.16), (0.27, 0.17, 0.09), 11, 0.45, 0.7)
M['pottery'] = bumped_mat("pottery",(0.52, 0.32, 0.20), (0.38, 0.22, 0.13), 6, 0.3, 0.75)
M['jam']     = simple_mat("jam",    (0.35, 0.06, 0.10), 0.35)
M['berry']   = simple_mat("berry",  (0.20, 0.025, 0.05), 0.45)   # 짙은 붉은 열매(하이라이트로 밝아지므로 베이스는 어둡게)
M['seed']    = simple_mat("seed",   (0.78, 0.70, 0.50), 0.65)
M['copper']  = simple_mat("copper", (0.46, 0.20, 0.06), 0.35, metal=0.55)   # 구리빛 광석 결정(발광 제거 — 흰빛 뜸 방지)
M['soil']    = bumped_mat("soil",   (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95)
M['tamped']  = bumped_mat("tamped", (0.47, 0.37, 0.24), (0.33, 0.25, 0.15), 16, 0.35, 0.95)
M['flame']   = simple_mat("flame",  (1.0, 0.55, 0.12), 0.4, emit=(1.0, 0.52, 0.12), emit_str=6.0)
M['cord']    = simple_mat("cord",   (0.55, 0.45, 0.26), 0.85)
M['leafg']   = simple_mat("leafg",  (0.20, 0.38, 0.11), 0.55)
M['leafg2']  = simple_mat("leafg2", (0.33, 0.52, 0.17), 0.55)
M['flower']  = simple_mat("flower", (0.86, 0.82, 0.42), 0.5)
M['charcoal']= simple_mat("charcoal",(0.10, 0.09, 0.08), 0.9)

OBJS = []
def add(o, mat):
    if mat is not None:
        o.data.materials.append(mat)
    OBJS.append(o)
    return o

def cyl(r, d, loc, rot=(0, 0, 0), mat=None, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)

def cone(r1, r2, d, loc, rot=(0, 0, 0), mat=None, verts=20):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)

def box(sx, sy, sz, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    return add(o, mat)

def ico(r, loc, subdiv=2, mat=None, scale=(1, 1, 1), jitter=0.0, smooth=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object
    if jitter > 0:
        for v in o.data.vertices:
            v.co = v.co * (1.0 + random.uniform(-jitter, jitter))
    if smooth: bpy.ops.object.shade_smooth()
    o.scale = scale
    return add(o, mat)

def plane(sx, sy, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, 1)
    return add(o, mat)

# ===== 아이템 모델 =====
def m_pillar():   # 껍질 벗긴 통나무 기둥 — 밑동 굵고 위 가늘게, 도끼 자국 상단
    cyl(0.17, 2.2, (0, 0, 1.1), mat=M['peeled'], verts=16)
    cone(0.17, 0.10, 0.22, (0, 0, 2.30), mat=M['peeled'], verts=16)   # 다듬은 머리
    cyl(0.185, 0.10, (0, 0, 0.06), mat=M['bark'], verts=16)           # 밑동 껍질 자국

def m_rafter():   # 가는 장대 다발 — 5개 + 새끼 묶음
    random.seed(11)
    for i in range(5):
        a = i * 2 * math.pi / 5
        cyl(0.045, 2.0, (math.cos(a) * 0.09, math.sin(a) * 0.09, 1.0),
            rot=(random.uniform(-0.04, 0.04), random.uniform(-0.04, 0.04), 0), mat=M['peeled'], verts=10)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.028, location=(0, 0, 1.15))
    add(bpy.context.active_object, M['cord'])

def m_thatch():   # 이엉(볏짚 다발) — 가는 줄기 다수 + 중간 결속
    random.seed(21)
    for i in range(46):
        a = random.uniform(0, 2 * math.pi); rr = random.uniform(0, 0.26)
        tilt = random.uniform(0.0, 0.12)
        cyl(0.016, random.uniform(1.5, 1.9),
            (math.cos(a) * rr, math.sin(a) * rr, 0.9),
            rot=(math.sin(a) * tilt, -math.cos(a) * tilt, 0), mat=M['straw'], verts=6)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.035, location=(0, 0, 1.0))
    add(bpy.context.active_object, M['cord'])

def m_berry():    # 붉은 열매 몇 알 + 잔가지
    random.seed(31)
    pts = [(0, 0, 0.22), (0.30, 0.06, 0.20), (0.14, 0.28, 0.19), (-0.20, 0.16, 0.21)]
    for p in pts:
        ico(0.20, p, subdiv=3, mat=M['berry'], scale=(1, 1, 0.92))
    ico(0.15, (0.16, -0.16, 0.16), subdiv=3, mat=M['berry'], scale=(1, 1, 0.92))
    for p in pts[:3]:   # 꼭지
        cyl(0.018, 0.10, (p[0], p[1], p[2] + 0.19), mat=M['grass'], verts=6)

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
    ico(0.60, (0, 0, 0.32), subdiv=1, mat=M['meat'], scale=(1.30, 0.90, 0.58), jitter=0.16, smooth=False)
    box(1.05, 0.72, 0.10, (0.02, 0.02, 0.60), rot=(0, 0, 0.12), mat=M['meat'])          # 윗면 절단면(평평)
    for i, (x, y, r) in enumerate(((-0.26, 0.12, 0.035), (0.16, -0.10, 0.030), (0.40, 0.14, 0.026))):
        cyl(r, 0.80, (x, y, 0.615), rot=(0, math.radians(88), 0.30 + i * 0.55), mat=M['fat'], verts=6)   # 절단면에 드러난 지방 결(얇게)
    ico(0.16, (-0.56, -0.06, 0.30), subdiv=1, mat=M['fat'], scale=(0.55, 0.85, 0.35), jitter=0.2, smooth=False)  # 비계 가장자리

def m_meat_cooked():  # 구운 고기 꼬치
    random.seed(61)
    cyl(0.035, 2.1, (0, 0, 0.9), rot=(0, math.radians(62), 0), mat=M['peeled'], verts=8)
    for i, t in enumerate((-0.55, 0.0, 0.55)):
        c = V((math.sin(math.radians(62)) * t, 0, math.cos(math.radians(62)) * t)) + V((0, 0, 0.9))
        ico(0.30, c, subdiv=3, mat=M['cooked'], scale=(1.0, 0.85, 0.85), jitter=0.12)

def m_hide():     # 펼친 가죽 — 아주 납작한 판 + 사지/목 자락
    random.seed(71)
    ico(0.90, (0, 0, 0.03), subdiv=3, mat=M['hide'], scale=(1.0, 0.62, 0.028), jitter=0.05)
    for dx, dy, sx, sy in ((0.70, 0.44, 0.9, 0.5), (-0.70, 0.44, 0.9, 0.5),
                            (0.70, -0.44, 0.9, 0.5), (-0.70, -0.44, 0.9, 0.5)):
        ico(0.30, (dx, dy, 0.03), subdiv=2, mat=M['hide'], scale=(sx, sy, 0.045), jitter=0.08)
    ico(0.28, (0, 0.66, 0.03), subdiv=2, mat=M['hide'], scale=(0.7, 0.9, 0.045), jitter=0.08)   # 목
    ico(0.16, (0, -0.78, 0.03), subdiv=2, mat=M['hide'], scale=(0.6, 1.1, 0.04), jitter=0.10)   # 꼬리

def m_berry_jam():  # 토기 단지 + 붉은 내용물
    cone(0.42, 0.52, 0.55, (0, 0, 0.28), mat=M['pottery'], verts=28)
    cone(0.52, 0.34, 0.45, (0, 0, 0.78), mat=M['pottery'], verts=28)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.36, minor_radius=0.045, location=(0, 0, 1.00))
    add(bpy.context.active_object, M['pottery'])
    cyl(0.33, 0.06, (0, 0, 1.00), mat=M['jam'], verts=28)
    ico(0.10, (0.10, 0.06, 1.05), subdiv=2, mat=M['berry'])

def m_water_bottle():  # 가죽 물주머니 (청동기 — 플라스틱 금지)
    ico(0.52, (0, 0, 0.50), subdiv=3, mat=M['leather'], scale=(1.0, 0.72, 1.05), jitter=0.07)
    cyl(0.14, 0.34, (0, 0, 1.10), mat=M['leather'], verts=14)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.15, minor_radius=0.035, location=(0, 0, 1.14))
    add(bpy.context.active_object, M['cord'])
    cyl(0.13, 0.09, (0, 0, 1.30), mat=M['peeled'], verts=14)   # 나무 마개
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

def m_herb():     # 약초 다발 — 자연물 herb.png의 잎날 구조를 아이콘 스케일로(납작한 별 → 세워 묶은 다발)
    random.seed(91)
    # 밑동 줄기 묶음(세로) — 다발의 축이 서야 '납작한 별'로 안 읽힌다
    for i in range(5):
        a = i * 1.257
        cyl(0.018, 0.42, (math.cos(a) * 0.035, math.sin(a) * 0.035, 0.21),
            rot=(math.sin(a) * 0.06, -math.cos(a) * 0.06, 0), mat=M['grass'], verts=5)
    # 잎날: 좁고 길게, 위로 세워 부챗살(tilt 낮을수록 수직) — 2톤 교차
    for i in range(11):
        a = i * (2 * math.pi / 11) + 0.3
        tilt = 0.20 + (i % 3) * 0.10
        d = V((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        o = plane(0.085, 1.30, d * 0.62 + V((0, 0, 0.46)), mat=(M['leafg'] if i % 2 else M['leafg2']))
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        o.scale = (0.16, 1.0, 1.0)          # 좁은 잎날(자연물 herb 동형)
    for i in range(4):                       # 꽃점 — 잎 끝 높이에
        a = i * 1.57 + 0.4
        ico(0.085, (math.cos(a) * 0.17, math.sin(a) * 0.17, 1.14), subdiv=2, mat=M['flower'])
    bpy.ops.mesh.primitive_torus_add(major_radius=0.075, minor_radius=0.02, location=(0, 0, 0.13))
    add(bpy.context.active_object, M['cord'])   # 묶음 끈

def m_ore():      # 구리빛 광석 덩이 — 모암 + 구리 결정
    random.seed(101)
    ico(0.60, (0, 0, 0.42), subdiv=1, mat=M['stone'], scale=(1.15, 1.0, 0.85), jitter=0.22, smooth=False)
    for i in range(6):
        a = i * 1.047 + 0.3
        # 육각 기둥 + 뾰족 머리 = 광맥 결정(각진 금속면). 짧고 굵게 — 당근 실루엣 회피.
        cyl(0.105, 0.30, (math.cos(a) * 0.30, math.sin(a) * 0.26, 0.74 + (i % 2) * 0.09),
            rot=(random.uniform(-0.45, 0.45), random.uniform(-0.45, 0.45), 0), mat=M['copper'], verts=6)
        cone(0.105, 0.0, 0.14, (math.cos(a) * 0.30, math.sin(a) * 0.26, 0.96 + (i % 2) * 0.09),
             mat=M['copper'], verts=6)

def m_wood():     # 통나무 토막 (눕힘) — 껍질 + 마구리 나이테
    cyl(0.42, 1.7, (0, 0, 0.42), rot=(0, math.radians(90), math.radians(18)), mat=M['bark'], verts=22)
    for s in (-1, 1):
        cyl(0.425, 0.04,
            (math.cos(math.radians(18)) * 0.86 * s, math.sin(math.radians(18)) * 0.86 * s, 0.42),
            rot=(0, math.radians(90), math.radians(18)), mat=M['peeled'], verts=22)

def m_plank():    # 판자 3장
    random.seed(111)
    for i in range(3):
        box(1.7, 0.46, 0.075, (i * 0.05, i * 0.10 - 0.10, 0.06 + i * 0.10),
            rot=(0, 0, math.radians(-4 + i * 4)), mat=M['sawn'])

def m_stone():    # 각진 돌덩이 (저폴리)
    random.seed(121)
    ico(0.72, (0, 0, 0.50), subdiv=1, mat=M['stone'], scale=(1.15, 1.0, 0.9), jitter=0.26, smooth=False)
    ico(0.26, (0.55, 0.30, 0.20), subdiv=1, mat=M['stone'], jitter=0.30, smooth=False)

def m_item_wall():  # 통나무 벽 유닛 미니어처 — 굴립주 벽주 6개 + 상하 가로대
    random.seed(131)
    for i in range(9):
        x = -0.80 + i * 0.20
        cyl(0.104, 1.7 + random.uniform(-0.05, 0.05), (x, 0, 0.86), mat=M['peeled'], verts=10)
    box(1.85, 0.16, 1.62, (0, 0.05, 0.85), mat=M['peeled'])          # 뒤판(틈 메움 — 벽=밀폐)
    for z in (0.34, 1.42):
        cyl(0.055, 1.86, (0, -0.13, z), rot=(0, math.radians(90), 0), mat=M['bark'], verts=8)

def m_item_floor():  # 다짐 바닥 타일
    box(1.7, 1.7, 0.14, (0, 0, 0.07), mat=M['tamped'])
    random.seed(141)
    for _ in range(9):
        ico(0.075, (random.uniform(-0.72, 0.72), random.uniform(-0.72, 0.72), 0.14),
            subdiv=1, mat=M['tamped'], scale=(1, 1, 0.35), jitter=0.3, smooth=False)

def m_item_door():  # 나무 문짝 — 세로 판 + 가로 띠 + 손잡이 끈
    for i in range(4):
        box(0.34, 0.075, 1.6, (-0.51 + i * 0.34, 0, 0.80), mat=M['sawn'])
    for z in (0.35, 1.25):
        box(1.42, 0.09, 0.13, (0, -0.07, z), mat=M['bark'])
    bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.028, location=(0.46, -0.11, 0.82), rotation=(math.radians(90), 0, 0))
    add(bpy.context.active_object, M['cord'])

def m_item_fence():  # 울타리 유닛 — 기둥 2 + 가로대 2
    for x in (-0.62, 0.62):
        cyl(0.10, 1.5, (x, 0, 0.75), mat=M['peeled'], verts=10)
        cone(0.10, 0.03, 0.16, (x, 0, 1.58), mat=M['peeled'], verts=10)
    for z in (0.55, 1.15):
        cyl(0.055, 1.45, (0, -0.10, z), rot=(0, math.radians(90), 0), mat=M['bark'], verts=8)

def m_item_stair():  # 통나무 계단 3단
    for i in range(3):
        box(1.3, 0.44, 0.16, (0, -0.44 + i * 0.44, 0.16 + i * 0.32), mat=M['sawn'])
        cyl(0.09, 1.32, (0, -0.63 + i * 0.44, 0.10 + i * 0.32), rot=(0, math.radians(90), 0), mat=M['peeled'], verts=10)

def m_item_chest():  # 나무 궤 — 몸통 + 뚜껑 + 결속 띠
    box(1.5, 0.95, 0.72, (0, 0, 0.40), mat=M['sawn'])
    box(1.54, 0.99, 0.20, (0, 0, 0.86), mat=M['bark'])
    for x in (-0.45, 0.45):
        box(0.10, 1.02, 0.98, (x, 0, 0.50), mat=M['bark'])
    bpy.ops.mesh.primitive_torus_add(major_radius=0.10, minor_radius=0.025, location=(0, -0.50, 0.70), rotation=(math.radians(90), 0, 0))
    add(bpy.context.active_object, M['cord'])

def m_item_campfire():  # 돌 두른 모닥불
    random.seed(151)
    for i in range(9):
        a = i * 2 * math.pi / 9
        ico(0.22, (math.cos(a) * 0.78, math.sin(a) * 0.78, 0.14), subdiv=1, mat=M['stone'],
            scale=(1.1, 1.0, 0.8), jitter=0.28, smooth=False)
    for i in range(4):
        a = i * math.pi / 4 + 0.3
        cyl(0.09, 1.1, (0, 0, 0.22), rot=(math.radians(74), 0, a), mat=M['charcoal'], verts=8)
    cone(0.30, 0.02, 0.85, (0, 0, 0.62), mat=M['flame'], verts=14)
    cone(0.17, 0.02, 0.50, (0.10, 0.06, 0.52), mat=M['flame'], verts=12)

def m_item_farmland():  # 갈아엎은 흙 타일 — 이랑 3줄
    box(1.7, 1.7, 0.12, (0, 0, 0.06), mat=M['soil'])
    random.seed(161)
    # 이랑 = 낮고 넓은 흙둔덕(삼각 단면) — 통나무처럼 보이지 않게 반경↓·폭↑·각짐
    for i in range(4):
        y = -0.62 + i * 0.42
        o = cyl(0.115, 1.68, (0, y, 0.13), rot=(0, math.radians(90), 0), mat=M['soil'], verts=6)
        o.scale = (1.0, 1.0, 0.55)
    for _ in range(10):   # 흙덩이
        ico(0.055, (random.uniform(-0.72, 0.72), random.uniform(-0.72, 0.72), 0.17),
            subdiv=1, mat=M['soil'], jitter=0.35, smooth=False)

JOBS = [
    ("pillar", m_pillar), ("rafter", m_rafter), ("thatch", m_thatch),
    ("berry", m_berry), ("fiber", m_fiber), ("meat_raw", m_meat_raw), ("meat_cooked", m_meat_cooked),
    ("hide", m_hide), ("berry_jam", m_berry_jam), ("water_bottle", m_water_bottle),
    ("seed_berry", m_seed_berry), ("herb", m_herb), ("ore", m_ore),
    ("wood", m_wood), ("plank", m_plank), ("stone", m_stone),
    ("item_wall", m_item_wall), ("item_floor", m_item_floor), ("item_door", m_item_door),
    ("item_fence", m_item_fence), ("item_stair", m_item_stair), ("item_chest", m_item_chest),
    ("item_campfire", m_item_campfire), ("item_farmland", m_item_farmland),
]

def frame_and_render(objs, path):
    mn = [1e9] * 3; mx = [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ V(c)
            for k in range(3):
                mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
    ctr = V(((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2))
    size = max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2])
    tgt.location = ctr
    cam.location = ctr + ISO_DIR * (size * 4 + 20)
    cam_d.ortho_scale = size * 1.25 + 0.5
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

def cleanup(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        try: o.select_set(True)
        except Exception: pass
    bpy.ops.object.delete()

ONLY = [k for k in os.environ.get('ICON_ONLY', '').split(',') if k]
for (key, fn) in JOBS:
    if ONLY and key not in ONLY: continue
    OBJS = []
    globals()['OBJS'] = OBJS
    fn()
    path = os.path.join(OUTDIR, key + ".png")
    print("[icon] render", key, "objs=", len(OBJS))
    frame_and_render(OBJS, path)
    cleanup(OBJS)

print("[icon] DONE ->", OUTDIR)
