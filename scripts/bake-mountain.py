# bake-mountain.py — 능선 '장벽 산' 세그먼트 베이크 v3 [재민: "두꺼운 라인이 쭉 늘어진 산맥…
#   부숴도 나머지가 자연스러워야" + "두께 10셀이 어색함의 원인"]
#   단위 = 8방위 벽 세그먼트: ★늘임 축이 진행 방향의 '수직'(단면) — 단면 폭이 밴드 폭(한울대간 37셀)에
#   정합되는 넓은 벽 슬라이스. + 끝막이 캡(S)·매듭(M·L).
#   씬 정본: building_render.py 계열 (Cycles · ORTHO · 태양 52°/-35° 3.6 · 월드 0.55 ·
#   카메라 방위 45°·고도 30° · PPU 45.255 · ZSQ 0.8165 · film_transparent · 앵커 JSON)
# 실행: blender -b -P scripts/bake-mountain.py
# ★함정(실측 2회): ColorRamp 는 위치 1.0 에 기본 '흰색' 요소를 갖고 태어나고, elements.new() 뒤에는
#   인덱스가 위치순 재정렬이라 [1] 참조가 빗나간다 — '색으로 찾아' 교체할 것(봉두 255 클리핑 진범).
import bpy, math, os, json, random
import mathutils

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'mountain_renders')
os.makedirs(OUT, exist_ok=True)

PPU = 64.0 / math.sqrt(2.0)
ZSQ = 32.0 / (PPU * math.cos(math.radians(30.0)))   # 0.8165

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = 64
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35))
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
el = math.radians(30); az = math.radians(45); dist = 80
cam.location = (dist*math.cos(el)*math.cos(az), -dist*math.cos(el)*math.sin(az), dist*math.sin(el))
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam.constraints.new('TRACK_TO').target = tgt
scene.camera = cam

def mountain_material():
    m = bpy.data.materials.new('mt'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    zr = nt.nodes.new('ShaderNodeMapRange'); zr.name = 'zrange'
    zr.inputs['From Min'].default_value = 0.0; zr.inputs['From Max'].default_value = 3.4
    nt.links.new(sep.outputs['Z'], zr.inputs['Value'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 1.6; noise.inputs['Detail'].default_value = 6.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.075, 0.115, 0.05, 1)
    e1 = ramp.color_ramp.elements.new(0.38); e1.color = (0.115, 0.135, 0.085, 1)
    e2 = ramp.color_ramp.elements.new(0.66); e2.color = (0.235, 0.215, 0.185, 1)
    for el2 in ramp.color_ramp.elements:   # ★기본 흰 요소 사냥
        if el2.color[0] > 0.9 and el2.color[1] > 0.9 and el2.color[2] > 0.9:
            el2.color = (0.30, 0.285, 0.26, 1)
    n0 = nt.nodes.new('ShaderNodeMath'); n0.operation = 'SUBTRACT'
    nt.links.new(noise.outputs['Fac'], n0.inputs[0]); n0.inputs[1].default_value = 0.5
    n1 = nt.nodes.new('ShaderNodeMath'); n1.operation = 'MULTIPLY'
    nt.links.new(n0.outputs['Value'], n1.inputs[0]); n1.inputs[1].default_value = 0.45
    add2 = nt.nodes.new('ShaderNodeMath'); add2.operation = 'ADD'
    nt.links.new(zr.outputs['Result'], add2.inputs[0]); nt.links.new(n1.outputs['Value'], add2.inputs[1])
    nt.links.new(add2.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bnoise = nt.nodes.new('ShaderNodeTexNoise'); bnoise.inputs['Scale'].default_value = 5.5; bnoise.inputs['Detail'].default_value = 8.0
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.38
    nt.links.new(bnoise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.92
    try: p.inputs['Specular IOR Level'].default_value = 0.12
    except Exception: pass
    return m

MAT = mountain_material()

def make_massif(name, base_r, height, subpeaks, seed):
    random.seed(seed)
    objs = []
    peaks = [(0.0, 0.0, height, base_r)]
    for i in range(subpeaks):
        a = random.uniform(0, 6.283); rr = base_r * random.uniform(0.45, 0.8)
        peaks.append((math.cos(a)*rr, math.sin(a)*rr,
                      height*random.uniform(0.45, 0.75), base_r*random.uniform(0.45, 0.7)))
    for i, (px, py, ph, pr) in enumerate(peaks):
        bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=pr, radius2=0.06*pr, depth=ph,
                                        location=(px, py, ph/2))
        c = bpy.context.object
        me = c.data
        rnd = random.Random(seed*31+i)
        for v in me.vertices:
            f = 1.0 - (v.co.z + ph/2) / ph * 0.55
            v.co.x += rnd.uniform(-0.24, 0.24) * pr * f
            v.co.y += rnd.uniform(-0.24, 0.24) * pr * f
            v.co.z += rnd.uniform(-0.10, 0.10) * ph
        me.update()
        c.data.materials.append(MAT)
        objs.append(c)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    mass = bpy.context.object; mass.name = name
    mass.scale[2] = ZSQ
    bpy.ops.object.transform_apply(scale=True)
    return mass

def render_sprite(name, obj, pad=1.3):
    dim = max(obj.dimensions.x, obj.dimensions.y) + obj.dimensions.z
    cam_d.ortho_scale = dim * pad
    tgt.location = (0, 0, obj.dimensions.z*0.32)
    bpy.context.view_layer.update()
    res = 512
    scene.render.resolution_x = res; scene.render.resolution_y = res
    scene.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)
    from bpy_extras.object_utils import world_to_camera_view
    uv = world_to_camera_view(scene, cam, mathutils.Vector((0, 0, 0)))
    ax, ay = uv.x * res, (1 - uv.y) * res
    ppu_img = res / cam_d.ortho_scale
    return {'ox': round(ax, 1), 'oy': round(ay, 1), 'ppu': round(ppu_img, 2),
            'w_units': round(obj.dimensions.x, 2), 'h_units': round(obj.dimensions.z, 2)}

SPECS = [
    ('mt_S1', 1.5, 3.0, 1, 11), ('mt_S2', 1.7, 2.6, 1, 23),   # 캡 — 파괴 절단면·독립 노두
    ('mt_M1', 2.6, 5.0, 2, 37), ('mt_M2', 2.8, 4.4, 2, 41),   # 매듭 — 급커브·분기점
    ('mt_L1', 3.8, 7.2, 3, 53),
]
for a in range(8):
    for v in range(3):   # ★방위당 3변주 — 1종 반복이 '아코디언 벽'을 만든다(재민 지적 반복 무늬)
        SPECS.append(('mt_G%dv%d' % (a, v), 2.4, 5.6 - 0.5 * v, 3 + (v % 2), 100 + a * 7 + v * 131,
                      (2.1, a * 22.5 + 90)))

anchors = {}
for spec in SPECS:
    name, r, h, sp, seed = spec[:5]
    for o in [o for o in scene.objects if o.type == 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    m = make_massif(name, r, h, sp, seed)
    if len(spec) > 5:
        sx, rot = spec[5]
        m.scale[0] = sx; m.rotation_euler[2] = math.radians(rot)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
    MAT.node_tree.nodes['zrange'].inputs['From Max'].default_value = h * ZSQ * 0.95
    anchors[name] = render_sprite(name, m)
    print('[mt]', name, anchors[name])

with open(os.path.join(OUT, 'mountain_anchors.json'), 'w') as f:
    json.dump(anchors, f, indent=1)
print('DONE')
