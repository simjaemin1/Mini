# crop_render.py — durango-mini 작물 밭 4단계 스프라이트 (icon_render.py / rock_render.py v3 와 동일 씬)
#   곡물(grain: 벼·조·기장 계열) · 채소(veg: 잎채소·박 계열) × 4단계(갈은 흙 / 어린싹 / 자람 / 익음) = 8장.
#   고증: 청동기 후기(송국리) — 이랑 갈아엎은 흙 + 재래 곡물. 30종 개별 구분은 하지 않음(32px에서 판독 불가).
# 실행: blender -b -P crop_render.py   → ./crop_renders/{grain,veg}_{0..3}.png (512², 알파)
import bpy, os, math, random, mathutils
V = mathutils.Vector

RES = 512
SAMPLES = 64
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "crop_renders")
os.makedirs(OUTDIR, exist_ok=True)

def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': return n
    return mat.node_tree.nodes.get("Principled BSDF")

def simple_mat(name, color, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    return m

def bumped_mat(name, c1, c2, ns=9.0, bump=0.5, rough=0.85):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = ns
    bp = nt.nodes.new("ShaderNodeBump"); bp.inputs["Strength"].default_value = bump
    nt.links.new(n.outputs["Fac"], bp.inputs["Height"]); nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    r1 = nt.nodes.new("ShaderNodeRGB"); r1.outputs[0].default_value = (c1[0], c1[1], c1[2], 1)
    r2 = nt.nodes.new("ShaderNodeRGB"); r2.outputs[0].default_value = (c2[0], c2[1], c2[2], 1)
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = ns * 0.5
    rmp = nt.nodes.new("ShaderNodeValToRGB")
    rmp.color_ramp.elements[0].position = 0.42; rmp.color_ramp.elements[1].position = 0.62
    nt.links.new(n2.outputs["Fac"], rmp.inputs["Fac"])
    mx = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(rmp.outputs["Color"], mx.inputs["Fac"])
    nt.links.new(r2.outputs[0], mx.inputs["Color1"]); nt.links.new(r1.outputs[0], mx.inputs["Color2"])
    nt.links.new(mx.outputs["Color"], b.inputs["Base Color"])
    return m

# ===== 씬 (icon_render.py와 동일 정본) =====
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
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

M = {
    'soil':   bumped_mat("soil",  (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95),
    'sprout': simple_mat("sprout",(0.44, 0.66, 0.26), 0.55),
    'green':  simple_mat("green", (0.32, 0.52, 0.18), 0.6),
    'ripe':   simple_mat("ripe",  (0.78, 0.66, 0.24), 0.65),
    'head':   simple_mat("head",  (0.86, 0.74, 0.30), 0.7),
    'leaf':   simple_mat("leaf",  (0.30, 0.50, 0.17), 0.55),
    'leaf2':  simple_mat("leaf2", (0.42, 0.60, 0.22), 0.55),
    'fruit':  simple_mat("fruit", (0.70, 0.62, 0.22), 0.5),
}

OBJS = []
def add(o, mat):
    if mat: o.data.materials.append(mat)
    OBJS.append(o); return o
def box(sx, sy, sz, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz); return add(o, mat)
def cyl(r, d, loc, rot=(0, 0, 0), mat=None, verts=8):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)
def ico(r, loc, subdiv=2, mat=None, scale=(1, 1, 1), smooth=True):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object
    if smooth: bpy.ops.object.shade_smooth()
    o.scale = scale; return add(o, mat)
def plane(sx, sy, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, 1); return add(o, mat)

TILE = 1.8
def soil_bed(furrows=4):
    """갈아엎은 흙 타일 + 이랑 — 전 단계 공통 바닥(단계 0은 이것만)."""
    box(TILE, TILE, 0.12, (0, 0, 0.06), mat=M['soil'])
    for i in range(furrows):
        y = -TILE * 0.32 + i * (TILE * 0.64 / max(1, furrows - 1))
        o = cyl(0.10, TILE * 0.96, (0, y, 0.13), rot=(0, math.radians(90), 0), mat=M['soil'], verts=6)
        o.scale = (1.0, 1.0, 0.55)

def rows(n_per_row, n_rows, fn, jitter=0.06, seed=1):
    """이랑 위 규칙적 식재(약간의 흔들림) — 밭처럼 줄 맞춰 서게."""
    random.seed(seed)
    for r in range(n_rows):
        y = -TILE * 0.32 + r * (TILE * 0.64 / max(1, n_rows - 1))
        for c in range(n_per_row):
            x = -TILE * 0.36 + c * (TILE * 0.72 / max(1, n_per_row - 1))
            fn(x + random.uniform(-jitter, jitter), y + random.uniform(-jitter, jitter), r * 10 + c)

# --- 곡물(벼·조 계열) ---
def grain0(): soil_bed()
def grain1():
    soil_bed()
    def one(x, y, i):
        for k in range(3):
            a = k * 2.1 + i
            cyl(0.012, 0.17, (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.22),
                rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), mat=M['sprout'], verts=5)
    rows(5, 4, one, seed=11)
def grain2():
    soil_bed()
    def one(x, y, i):
        for k in range(4):
            a = k * 1.6 + i * 0.7
            cyl(0.014, 0.52, (x + math.cos(a) * 0.04, y + math.sin(a) * 0.04, 0.39),
                rot=(math.sin(a) * 0.22, -math.cos(a) * 0.22, 0), mat=M['green'], verts=5)
    rows(5, 4, one, seed=12)
def grain3():
    soil_bed()
    def one(x, y, i):
        for k in range(4):
            a = k * 1.6 + i * 0.7
            tilt = 0.30
            cyl(0.015, 0.62, (x + math.cos(a) * 0.045, y + math.sin(a) * 0.045, 0.44),
                rot=(math.sin(a) * tilt, -math.cos(a) * tilt, 0), mat=M['ripe'], verts=5)
            # 고개 숙인 이삭
            ico(0.055, (x + math.cos(a) * 0.16, y + math.sin(a) * 0.16, 0.72), subdiv=2,
                mat=M['head'], scale=(0.7, 0.7, 1.9))
    rows(5, 4, one, seed=13)

# --- 채소(잎채소·박 계열) ---
def veg0(): soil_bed(furrows=3)
def veg1():
    soil_bed(furrows=3)
    def one(x, y, i):
        for k in range(2):
            a = k * 3.0 + i
            o = plane(0.10, 0.16, (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.19),
                      rot=(math.radians(62), 0, a), mat=M['sprout'])
    rows(4, 3, one, jitter=0.05, seed=21)
def veg2():
    soil_bed(furrows=3)
    def one(x, y, i):
        for k in range(6):
            a = k * 1.05 + i * 0.5
            d = V((math.cos(a) * 0.72, math.sin(a) * 0.72, 0.70)).normalized()
            o = plane(0.13, 0.30, (x, y, 0.20) , mat=(M['leaf'] if k % 2 else M['leaf2']))
            o.location = (x + d.x * 0.11, y + d.y * 0.11, 0.20 + d.z * 0.09)
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
            o.scale = (0.45, 1.0, 1.0)
    rows(4, 3, one, jitter=0.05, seed=22)
def veg3():
    soil_bed(furrows=3)
    def one(x, y, i):
        for k in range(7):
            a = k * 0.9 + i * 0.5
            d = V((math.cos(a) * 0.80, math.sin(a) * 0.80, 0.60)).normalized()
            o = plane(0.15, 0.40, (x, y, 0.22), mat=(M['leaf'] if k % 2 else M['leaf2']))
            o.location = (x + d.x * 0.15, y + d.y * 0.15, 0.22 + d.z * 0.12)
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
            o.scale = (0.5, 1.0, 1.0)
        ico(0.10, (x, y, 0.34), subdiv=2, mat=M['fruit'], scale=(1.0, 1.0, 0.85))   # 결실
    rows(4, 3, one, jitter=0.05, seed=23)

JOBS = [("grain_0", grain0), ("grain_1", grain1), ("grain_2", grain2), ("grain_3", grain3),
        ("veg_0", veg0), ("veg_1", veg1), ("veg_2", veg2), ("veg_3", veg3)]

def frame_and_render(objs, path):
    mn = [1e9] * 3; mx = [-1e9] * 3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ V(c)
            for k in range(3): mn[k] = min(mn[k], w[k]); mx[k] = max(mx[k], w[k])
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

for (key, fn) in JOBS:
    OBJS = []; globals()['OBJS'] = OBJS
    fn()
    print("[crop] render", key, "objs=", len(OBJS))
    frame_and_render(OBJS, os.path.join(OUTDIR, key + ".png"))
    cleanup(OBJS)
print("[crop] DONE ->", OUTDIR)
