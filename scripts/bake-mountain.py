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
OUT = os.environ.get('MT_OUT') or os.path.join(HERE, 'mountain_renders')
os.makedirs(OUT, exist_ok=True)
RES = int(os.environ.get('MT_RES', '512'))   # ★해상도만 바꿔도 월드 발자국은 그대로 — ppu 가 같이 커지고 클라가 PPU_SCR/ppu 로 나눈다
ONLY = [x for x in (os.environ.get('MT_ONLY') or '').split(',') if x]
os.makedirs(OUT, exist_ok=True)

PPU = 64.0 / math.sqrt(2.0)
ZSQ = 32.0 / (PPU * math.cos(math.radians(30.0)))   # 0.8165

scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = int(os.environ.get('MT_SAMPLES', '64'))
# ★파이어플라이 클램프 [2026-08-07 실측] — 샘플 64 로는 크고 매끈한 면에서 밝은 튀는 화소가 남고,
#   디노이저가 그걸 **부드러운 흰 반점으로 뭉갠다**(mt_X1 에서 화소의 1.6%가 250 초과).
#   해만 켜도·하늘만 켜도 똑같이 나온 게 증거다 — 광원이 아니라 표본 분산이다.
scene.cycles.sample_clamp_direct = float(os.environ.get('MT_CLAMP', '2.0'))
scene.cycles.sample_clamp_indirect = float(os.environ.get('MT_CLAMP', '2.0'))
scene.cycles.use_denoising = (os.environ.get('MT_DENOISE','1') == '1') and bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = float(os.environ.get('MT_WORLD', '0.55'))
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = float(os.environ.get('MT_SUN', '3.6')); sun_d.angle = 0.2
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
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = float(os.environ.get('MT_BUMP', '0.38'))
    nt.links.new(bnoise.outputs['Fac'], bump.inputs['Height'])
    if os.environ.get('MT_BUMP') != '0':
        nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
    # ★거울 반사 0 [2026-08-07 실측] — 0.12 로도 큰 매끈한 면(mt_X1)에서 흰 반점이 터진다.
    #   화소의 5.5%가 250 초과로 날아갔다(작은 각면 스프라이트 mt_G0v0 은 0개라 안 보였다).
    #   청동기 화강암에 하이라이트는 애초에 안 맞는다.
    p.inputs['Roughness'].default_value = 0.97
    try: p.inputs['Specular IOR Level'].default_value = 0.0
    except Exception: pass
    return m

def forest_material():
    m = bpy.data.materials.new('mtF'); m.use_nodes = True
    nt = m.node_tree; p = nt.nodes.get('Principled BSDF')
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    zr = nt.nodes.new('ShaderNodeMapRange'); zr.name = 'zrange'
    zr.inputs['From Min'].default_value = 0.0; zr.inputs['From Max'].default_value = 3.4
    nt.links.new(sep.outputs['Z'], zr.inputs['Value'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 2.4; noise.inputs['Detail'].default_value = 7.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.06, 0.10, 0.04, 1)      # 기슭 짙은 숲
    e1 = ramp.color_ramp.elements.new(0.45); e1.color = (0.10, 0.155, 0.065, 1)  # 산허리 숲
    e2 = ramp.color_ramp.elements.new(0.80); e2.color = (0.135, 0.175, 0.09, 1)  # 능선 숲
    for el2 in ramp.color_ramp.elements:   # 기본 흰 요소 사냥 → 꼭대기 바위
        if el2.color[0] > 0.9 and el2.color[1] > 0.9 and el2.color[2] > 0.9:
            el2.color = (0.27, 0.255, 0.23, 1)
    n0 = nt.nodes.new('ShaderNodeMath'); n0.operation = 'SUBTRACT'
    nt.links.new(noise.outputs['Fac'], n0.inputs[0]); n0.inputs[1].default_value = 0.5
    n1 = nt.nodes.new('ShaderNodeMath'); n1.operation = 'MULTIPLY'
    nt.links.new(n0.outputs['Value'], n1.inputs[0]); n1.inputs[1].default_value = 0.35
    add2 = nt.nodes.new('ShaderNodeMath'); add2.operation = 'ADD'
    nt.links.new(zr.outputs['Result'], add2.inputs[0]); nt.links.new(n1.outputs['Value'], add2.inputs[1])
    nt.links.new(add2.outputs['Value'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], p.inputs['Base Color'])
    bn = nt.nodes.new('ShaderNodeTexNoise'); bn.inputs['Scale'].default_value = 9.0; bn.inputs['Detail'].default_value = 8.0
    bp2 = nt.nodes.new('ShaderNodeBump'); bp2.inputs['Strength'].default_value = 0.5   # 수관 몽글몽글
    nt.links.new(bn.outputs['Fac'], bp2.inputs['Height'])
    nt.links.new(bp2.outputs['Normal'], p.inputs['Normal'])
    p.inputs['Roughness'].default_value = 0.95
    try: p.inputs['Specular IOR Level'].default_value = 0.08
    except Exception: pass
    return m

MAT = mountain_material()
MATF = forest_material()

def make_massif(name, base_r, height, subpeaks, seed, mat=None, rnd_shape=False):
    """rnd_shape=True → 둥근 산 [재민 2026-08-07 "둥근 버전도 만들어서 여러 개 혼합해서 쓰자"]

    ★뾰족함이 어디서 오나: 원뿔 꼭지 radius2=0.06*pr(거의 점) + 면 9개(각지다)
      + 정점 지터 ±24%(들쭉날쭉). 셋이 겹쳐 '종이접기 송곳'이 된다.
    ★둥글게 하는 법: 꼭지를 뭉툭하게(0.34) · 면을 늘리고(20) · 지터를 절반으로 줄이고
      · **섭디비전 1단 + 부드러운 셰이딩**. 한반도 산은 닳아 둥근 노년기 지형이다.
    """
    random.seed(seed)
    objs = []
    peaks = [(0.0, 0.0, height, base_r)]
    # ★부봉 비율 — 기본은 종전값. 주봉(mt_X)은 이걸 줄여 **으뜸 정상 하나**가 서게 한다.
    sh = float(os.environ.get('MT_SUBH', '0')) or None
    sr = float(os.environ.get('MT_SUBR', '0')) or None
    for i in range(subpeaks):
        a = random.uniform(0, 6.283); rr = base_r * random.uniform(0.45, 0.8)
        peaks.append((math.cos(a)*rr, math.sin(a)*rr,
                      height*random.uniform(0.28, sh) if sh else height*random.uniform(0.45, 0.75),
                      base_r*random.uniform(0.26, sr) if sr else base_r*random.uniform(0.45, 0.7)))
    nv = int(os.environ.get('MT_RNV', '14')) if rnd_shape else 9
    r2 = float(os.environ.get('MT_RR2', '0.18')) if rnd_shape else 0.06
    jxy = float(os.environ.get('MT_RJ', '0.20')) if rnd_shape else 0.24
    jz = 0.07 if rnd_shape else 0.10
    for i, (px, py, ph, pr) in enumerate(peaks):
        bpy.ops.mesh.primitive_cone_add(vertices=nv, radius1=pr, radius2=r2*pr, depth=ph,
                                        location=(px, py, ph/2))
        c = bpy.context.object
        me = c.data
        rnd = random.Random(seed*31+i)
        for v in me.vertices:
            f = 1.0 - (v.co.z + ph/2) / ph * 0.55
            v.co.x += rnd.uniform(-jxy, jxy) * pr * f
            v.co.y += rnd.uniform(-jxy, jxy) * pr * f
            v.co.z += rnd.uniform(-jz, jz) * ph
        me.update()
        c.data.materials.append(mat or MAT)
        objs.append(c)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    mass = bpy.context.object; mass.name = name
    if rnd_shape and os.environ.get('MT_RSUB') == '1':
        # ★1차 시도에서 섭디비전 1단 + shade_smooth 를 넣었더니 **만두**가 됐다.
        #   실루엣까지 뭉개져 저폴리 각면 화풍에서 벗어난다. 기본값은 끔.
        m = mass.modifiers.new('sub', 'SUBSURF'); m.levels = 1; m.render_levels = 1
        bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.shade_smooth()
    mass.scale[2] = ZSQ
    bpy.ops.object.transform_apply(scale=True)
    return mass

def render_sprite(name, obj, pad=1.3):
    dim = max(obj.dimensions.x, obj.dimensions.y) + obj.dimensions.z
    cam_d.ortho_scale = dim * pad
    tgt.location = (0, 0, obj.dimensions.z*0.32)
    bpy.context.view_layer.update()
    res = RES
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
    for v in range(3):   # 돌산(화강암) 세그먼트
        SPECS.append(('mt_G%dv%d' % (a, v), 2.4, 5.6 - 0.5 * v, 3 + (v % 2), 100 + a * 7 + v * 131,
                      (2.1, a * 22.5 + 90)))
    for v in range(2):   # ★숲산 세그먼트 [재민 "무조건 돌산이네.. 다른 버전도 가능해?"] — 낮고 둥글게
        SPECS.append(('mt_F%dv%d' % (a, v), 2.5, 4.2 - 0.4 * v, 3, 300 + a * 11 + v * 97,
                      (2.1, a * 22.5 + 90), 'F'))
# ★★둥근 판 [재민 2026-08-07: "둥근 버전도 만들어서, 여러 개 혼합해서 쓰자.
#   물론 한반도 지역은 둥근 거 위주로"] — 이름 규약: **접두 R = 둥근**.
#   섞는 비율은 굽기가 아니라 **배치 쪽 손잡이**다(굽기는 재료만 댄다).
for a in range(8):
    for v in range(3):   # 둥근 돌산 — 닳은 화강암 능선
        SPECS.append(('mt_RG%dv%d' % (a, v), float(os.environ.get('MT_RBR', '3.05')),
                      float(os.environ.get('MT_RH', '3.9')) - 0.35 * v, 3 + (v % 2),
                      700 + a * 7 + v * 131, (2.1, a * 22.5 + 90), 'R'))
    for v in range(2):   # 둥근 숲산 — 노년기 구릉
        SPECS.append(('mt_RF%dv%d' % (a, v), float(os.environ.get('MT_RBR', '3.05')) + 0.2,
                      float(os.environ.get('MT_RH', '3.9')) - 0.7 - 0.3 * v, 3,
                      900 + a * 11 + v * 97, (2.1, a * 22.5 + 90), 'FR'))
# ★주봉 [재민 2: "큰 봉우리가 잘 안 선다"] — **별도 굽기**(MT_X=1 MT_RES=4096)로 배율 4.3 까지 선명.
#   2048 로는 확대 없는 한계가 1.96 이라 주봉을 크게 세우면 다시 뭉갠다.
SPECS_X = [
    # ★1차 설계(밑변 5.4 · 부봉 4개 동급)는 **알 무더기**가 됐다 — 으뜸 정상이 없었다.
    #   주봉 = 높은 정상 하나 + 낮은 어깨. 밑변을 줄이고 키를 올리고 부봉을 눌렀다(MT_SUBH/MT_SUBR).
    ('mt_X1', 3.4, 12.0, 2, 61, (1.5, 90), 'R'),    # 둥근 주봉 — 한반도 주력
    ('mt_X2', 3.0, 13.5, 2, 67, (1.3, 90), 'R'),
    ('mt_X3', 3.6, 12.5, 3, 71, (1.5, 90), ''),     # 뾰족 주봉 — 돌산 지역용
]
if os.environ.get('MT_X'):
    SPECS = SPECS_X

anchors = {}
for spec in SPECS:
    name, r, h, sp, seed = spec[:5]
    if ONLY and name not in ONLY: continue
    flags = spec[6] if len(spec) > 6 else ''
    isF = 'F' in flags
    isR = 'R' in flags
    for o in [o for o in scene.objects if o.type == 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    m = make_massif(name, r, h, sp, seed, MATF if isF else MAT, rnd_shape=isR)
    if len(spec) > 5 and isinstance(spec[5], tuple):
        sx, rot = spec[5]
        m.scale[0] = sx; m.rotation_euler[2] = math.radians(rot)
        bpy.ops.object.transform_apply(scale=True, rotation=True)
    (MATF if isF else MAT).node_tree.nodes['zrange'].inputs['From Max'].default_value = h * ZSQ * 0.95
    anchors[name] = render_sprite(name, m)
    print('[mt]', name, anchors[name])

with open(os.path.join(OUT, 'mountain_anchors.json'), 'w') as f:
    json.dump(anchors, f, indent=1)
print('DONE')
