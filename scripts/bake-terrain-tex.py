# bake-terrain-tex.py — 지형 질감 베이크 (씬 정본: building_render.py 계열 — Cycles·태양 52°/-35° 3.6·월드 0.55)
#   탑다운 ORTHO 로 굽는다(지면 텍스처는 클라가 다이아몬드로 어파인 매핑).
#   결과: scripts/terrain_tex/{grass,dirt,rock,canopy}.png + water_0..5.png
# 실행: blender -b -P scripts/bake-terrain-tex.py
import bpy, math, os, random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terrain_tex')
os.makedirs(OUT, exist_ok=True)
random.seed(1020)  # 라이브 시드와 같은 결정론

scene = bpy.context.scene
for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.25
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35))
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.location = (0, 0, 30); cam.rotation_euler = (0, 0, 0)   # 탑다운
scene.camera = cam

def principled(name, base, rough=0.8, spec=0.2):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*base, 1.0)
    p.inputs['Roughness'].default_value = rough
    try: p.inputs['Specular IOR Level'].default_value = spec
    except Exception: pass
    return m

def render(path, res):
    scene.render.resolution_x = res; scene.render.resolution_y = res
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('[bake]', path)

def clear_meshes():
    for o in list(scene.objects):
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)

# ── ① 풀밭 (8×8m 창 — 잡초·들꽃 섞인 초지) ──────────────────────────────────
def bake_grass():
    clear_meshes()
    cam_d.ortho_scale = 8.0
    # 흙 바닥(풀 사이로 비치는 땅)
    bpy.ops.mesh.primitive_plane_add(size=12)
    ground = bpy.context.object
    gm = bpy.data.materials.new('gnd'); gm.use_nodes = True
    nt = gm.node_tree; p = nt.nodes.get('Principled BSDF')
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 18.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.14, 0.17, 0.075, 1)   # 짙은 부식토+풀그늘
    ramp.color_ramp.elements[1].color = (0.23, 0.26, 0.12, 1)    # 마른 흙+풀
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = 0.95
    ground.data.materials.append(gm)
    # 풀잎 오브젝트(인스턴스 원본) 3종 — 휘어진 블레이드
    blades = []
    for bi, (h, col) in enumerate([(0.32, (0.19, 0.34, 0.10)), (0.24, (0.24, 0.38, 0.13)), (0.42, (0.15, 0.28, 0.09))]):
        verts = [(-0.012, 0, 0), (0.012, 0, 0), (-0.008, 0, h*0.6), (0.008, 0, h*0.6), (0.0, 0.05*h, h)]
        faces = [(0, 1, 3, 2), (2, 3, 4)]
        me = bpy.data.meshes.new('blade%d' % bi); me.from_pydata(verts, [], faces); me.update()
        ob = bpy.data.objects.new('blade%d' % bi, me); scene.collection.objects.link(ob)
        ob.data.materials.append(principled('bl%d' % bi, col, 0.7, 0.28))
        ob.location = (50, 50, 0)  # 화면 밖
        blades.append(ob)
    flower = None
    fverts = [(-0.03, 0, 0.26), (0.03, 0, 0.26), (0, 0.03, 0.30), (0, -0.001, 0.0), (0.004, 0, 0.0)]
    me = bpy.data.meshes.new('fl'); me.from_pydata([(0, 0, 0), (0.004, 0, 0), (0.002, 0, 0.26)] , [], [(0, 1, 2)]); me.update()
    # 파티클 대신 직접 산포 — 결정론·API 단순(4.0 파티클 이슈 회피)
    import mathutils
    N = 15000
    for i in range(N):
        x = random.uniform(-4.4, 4.4); y = random.uniform(-4.4, 4.4)
        src = blades[random.randrange(3)]
        ob = src.copy()  # linked duplicate (mesh 공유 — 메모리 절약)
        scene.collection.objects.link(ob)
        s = random.uniform(0.7, 1.5)
        ob.location = (x, y, 0); ob.scale = (s, s, s * random.uniform(0.8, 1.3))
        ob.rotation_euler = (random.uniform(-0.18, 0.18), random.uniform(-0.18, 0.18), random.uniform(0, 6.28))
    # 들꽃(흰·노랑 점) 소량
    fl_m1 = principled('flw', (0.9, 0.9, 0.82), 0.6, 0.3)
    fl_m2 = principled('fly', (0.85, 0.72, 0.2), 0.6, 0.3)
    for i in range(130):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, segments=8, ring_count=6,
            location=(random.uniform(-4.4, 4.4), random.uniform(-4.4, 4.4), random.uniform(0.22, 0.34)))
        fo = bpy.context.object; fo.data.materials.append(fl_m1 if random.random() < 0.6 else fl_m2)
    render(os.path.join(OUT, 'grass.png'), 1024)

# ── ② 물 (6프레임 루프 — 잔물결 노멀·유광) ──────────────────────────────────
def bake_water():
    clear_meshes()
    cam_d.ortho_scale = 8.0
    bpy.ops.mesh.primitive_plane_add(size=12)
    w = bpy.context.object
    m = bpy.data.materials.new('water'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (0.09, 0.23, 0.36, 1)
    p.inputs['Roughness'].default_value = 0.08
    try: p.inputs['Specular IOR Level'].default_value = 0.9
    except Exception: pass
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.noise_dimensions = '4D'
    noise.inputs['Scale'].default_value = 3.2; noise.inputs['Detail'].default_value = 6.0
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.45
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    w.data.materials.append(m)
    for f in range(6):
        noise.inputs['W'].default_value = f / 6.0 * 2.0   # 위상 루프
        render(os.path.join(OUT, 'water_%d.png' % f), 512)

# ── ③ 흙 둑면 ───────────────────────────────────────────────────────────────
def bake_dirt():
    clear_meshes()
    cam_d.ortho_scale = 4.0
    bpy.ops.mesh.primitive_plane_add(size=6)
    d = bpy.context.object
    m = bpy.data.materials.new('dirt'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 9.0; n1.inputs['Detail'].default_value = 8.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.16, 0.11, 0.06, 1)
    ramp.color_ramp.elements[1].color = (0.32, 0.23, 0.13, 1)
    nt.links.new(n1.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55
    nt.links.new(n1.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.95
    d.data.materials.append(m)
    # 잔돌
    pm = principled('peb', (0.35, 0.32, 0.28), 0.9, 0.15)
    for i in range(60):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=random.uniform(0.02, 0.06), segments=8, ring_count=6,
            location=(random.uniform(-2, 2), random.uniform(-2, 2), 0.01))
        o = bpy.context.object; o.scale[2] = 0.5; o.data.materials.append(pm)
    render(os.path.join(OUT, 'dirt.png'), 512)

# ── ④ 화강암 ────────────────────────────────────────────────────────────────
def bake_rock():
    clear_meshes()
    cam_d.ortho_scale = 6.0
    bpy.ops.mesh.primitive_plane_add(size=8)
    r = bpy.context.object
    # 변위로 울퉁불퉁하게
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=80); bpy.ops.object.mode_set(mode='OBJECT')
    tex = bpy.data.textures.new('rtx', 'MUSGRAVE'); tex.noise_scale = 1.4
    mod = r.modifiers.new('disp', 'DISPLACE'); mod.texture = tex; mod.strength = 0.5
    m = bpy.data.materials.new('rock'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    n1 = nt.nodes.new('ShaderNodeTexNoise'); n1.inputs['Scale'].default_value = 5.0; n1.inputs['Detail'].default_value = 9.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (0.30, 0.29, 0.27, 1)   # 담회
    ramp.color_ramp.elements[1].color = (0.55, 0.54, 0.51, 1)   # 밝은 화강암
    nt.links.new(n1.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.5
    nt.links.new(n1.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.9
    r.data.materials.append(m)
    render(os.path.join(OUT, 'rock.png'), 512)

# ── ⑤ 임상(숲 수관 — 산체 표면) ─────────────────────────────────────────────
def bake_canopy():
    clear_meshes()
    cam_d.ortho_scale = 8.0
    bpy.ops.mesh.primitive_plane_add(size=12)
    base = bpy.context.object
    base.data.materials.append(principled('cb', (0.05, 0.09, 0.04), 0.95, 0.1))
    cm1 = principled('c1', (0.13, 0.24, 0.09), 0.8, 0.2)
    cm2 = principled('c2', (0.17, 0.30, 0.11), 0.8, 0.2)
    cm3 = principled('c3', (0.10, 0.20, 0.08), 0.8, 0.2)
    for i in range(650):
        r = random.uniform(0.18, 0.5)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=10, ring_count=8,
            location=(random.uniform(-4.6, 4.6), random.uniform(-4.6, 4.6), random.uniform(0.05, 0.25)))
        o = bpy.context.object; o.scale[2] = random.uniform(0.5, 0.75)
        o.data.materials.append([cm1, cm2, cm3][random.randrange(3)])
    render(os.path.join(OUT, 'canopy.png'), 1024)

bake_water()
bake_dirt()
bake_rock()
bake_canopy()
bake_grass()
print('DONE')
