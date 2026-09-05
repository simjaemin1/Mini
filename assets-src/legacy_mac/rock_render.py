# rock_render.py v3 — durango-mini 아이소 자연물 렌더 (tree_render.py 씬·카메라·조명 동일 = 나무와 같은 룩)
# v3 [사용자: "나무는 3D라 사실적인데 덤불이 2D 스타듀밸리 같다"]:
#   ★덤불 = 나무와 같은 방식(tree_render grow() 재귀 가지+잎카드)으로 재작성 — 다간 관목(줄기 2~4개, depth 2,
#     밀도 2.2)이라 가지 구조가 실루엣·명암을 만들고, 열매는 실제 잎뭉치 끝 위치에 달림(3D 부피감).
#   ★약초 = leaf.png 텍스처 스머지 대신 전용 2톤 그라데이션 잎날(좁은 카드 6~8장 부챗살 + 꽃점) — 또렷한 실루엣.
#   (v2 유지분) 바위: 알베도 어둡게·투톤 계단·범프 강화·각진 저폴리 / 이끼: 상부 모자만 / 광맥: 크리스탈 크게·발광
# 실행:  cd ~/Mini && /Applications/Blender.app/Contents/MacOS/Blender -b -P rock_render.py
# 필요: 같은 폴더에 leaf.png (잎 텍스처 — tree_render와 공용)
# 결과: ~/Mini/nature_renders/{rock,mossrock,ore,bush,herb}_iso_01.png ...
# 에러나면 콘솔 그대로 붙여줘.

import bpy, os, math, random, mathutils
V = mathutils.Vector

# ===== CONFIG =====
RES_X, RES_Y = 512, 512
SAMPLES  = 48
N_EACH   = 6
OUTDIR   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nature_renders")
LEAF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "leaf.png")
# ==================
os.makedirs(OUTDIR, exist_ok=True)

def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': return n
    return mat.node_tree.nodes.get("Principled BSDF")

# ---- 재질 ----
def rock_material(base=(0.22,0.20,0.18), moss=False, seed=0):
    m = bpy.data.materials.new("rock%d" % seed); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = 0.95
    # 미세 범프(강하게) + 대형 노이즈 범프(바위 면 굴곡)
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 9 + (seed % 3) * 3
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.8
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    big = nt.nodes.new("ShaderNodeTexNoise"); big.inputs["Scale"].default_value = 2.2
    bump2 = nt.nodes.new("ShaderNodeBump"); bump2.inputs["Strength"].default_value = 0.5
    nt.links.new(big.outputs["Fac"], bump2.inputs["Height"])
    nt.links.new(bump2.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    # 색 변주 — 투톤 대비 강화(밝은 면 vs 깊은 틈)
    c1 = nt.nodes.new("ShaderNodeRGB"); c1.outputs[0].default_value = (base[0], base[1], base[2], 1)
    c2 = nt.nodes.new("ShaderNodeRGB"); c2.outputs[0].default_value = (base[0]*0.45, base[1]*0.45, base[2]*0.5, 1)
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = 4.5
    ramp = nt.nodes.new("ShaderNodeValToRGB")   # 노이즈를 계단화 → 얼룩 경계 또렷(축소 판독성)
    ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[1].position = 0.62
    nt.links.new(n2.outputs["Fac"], ramp.inputs["Fac"])
    mixc = nt.nodes.new("ShaderNodeMixRGB"); mixc.blend_type = 'MIX'
    nt.links.new(ramp.outputs["Color"], mixc.inputs["Fac"])
    nt.links.new(c2.outputs[0], mixc.inputs["Color1"])
    nt.links.new(c1.outputs[0], mixc.inputs["Color2"])
    out_color = mixc.outputs["Color"]
    if moss:  # 위쪽(노멀 Z↑) 상부 모자만 — v2: 게이트 강화로 덮임 절제
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(geo.outputs["Normal"], sep.inputs[0])
        up = nt.nodes.new("ShaderNodeMath"); up.operation = 'GREATER_THAN'; up.inputs[1].default_value = 0.62
        nt.links.new(sep.outputs["Z"], up.inputs[0])
        n3 = nt.nodes.new("ShaderNodeTexNoise"); n3.inputs["Scale"].default_value = 5
        mask = nt.nodes.new("ShaderNodeMath"); mask.operation = 'MULTIPLY'
        nt.links.new(up.outputs[0], mask.inputs[0]); nt.links.new(n3.outputs["Fac"], mask.inputs[1])
        gate = nt.nodes.new("ShaderNodeMath"); gate.operation = 'GREATER_THAN'; gate.inputs[1].default_value = 0.45
        nt.links.new(mask.outputs[0], gate.inputs[0])
        mg = nt.nodes.new("ShaderNodeRGB"); mg.outputs[0].default_value = (0.12, 0.24, 0.08, 1)
        mixm = nt.nodes.new("ShaderNodeMixRGB")
        nt.links.new(gate.outputs[0], mixm.inputs["Fac"])
        nt.links.new(out_color, mixm.inputs["Color1"])
        nt.links.new(mg.outputs[0], mixm.inputs["Color2"])
        out_color = mixm.outputs["Color"]
    nt.links.new(out_color, b.inputs["Base Color"])
    return m

def crystal_material():
    m = bpy.data.materials.new("crystal"); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (0.82, 0.42, 0.14, 1.0)   # 구리빛
    b.inputs["Roughness"].default_value = 0.22
    try: b.inputs["Metallic"].default_value = 0.8
    except Exception: pass
    try: b.inputs["Emission Color"].default_value = (0.95, 0.45, 0.13, 1.0); b.inputs["Emission Strength"].default_value = 0.8
    except Exception:
        try: b.inputs["Emission"].default_value = (0.5, 0.22, 0.07, 1.0)
        except Exception: pass
    return m

def leaf_material(img):
    m = bpy.data.materials.new("leafcard"); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.6
    return m


def bark_material():
    m = bpy.data.materials.new("bark"); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Base Color"].default_value = (0.24, 0.15, 0.08, 1.0)
    b.inputs["Roughness"].default_value = 0.92
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 14
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def herb_leaf_material():
    # 약초 잎날: 전역 Z 그라데이션(밑동 짙은 초록 → 끝 밝은 연두) — 텍스처 없이 또렷한 실루엣
    m = bpy.data.materials.new("herbleaf"); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = 0.55
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs[0])
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.0; mr.inputs["From Max"].default_value = 0.75
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.10, 0.22, 0.07, 1)
    ramp.color_ramp.elements[1].color = (0.30, 0.52, 0.16, 1)
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m

def flower_material():
    m = bpy.data.materials.new("flower"); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (0.92, 0.88, 0.55, 1.0)
    b.inputs["Roughness"].default_value = 0.5
    try: b.inputs["Emission Color"].default_value = (0.9, 0.85, 0.4, 1.0); b.inputs["Emission Strength"].default_value = 0.3
    except Exception: pass
    return m

def add_segment(p0, p1, r0, r1, mat, objs):
    d = p1 - p0; L = d.length
    if L < 1e-4: return
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r0, radius2=r1, depth=L, location=(p0 + p1) / 2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat); objs.append(o)

def grow(p, dr, length, radius, depth, bark, leaf, leaf_size, density, objs, tips=None):
    # tree_render.py grow() 동형(잎뭉치 끝 위치 기록용 tips만 추가) — 나무의 사실감 DNA 그대로
    dr = dr.normalized(); end = p + dr * length
    add_segment(p, end, radius, radius * 0.7, bark, objs)
    if depth <= 0:
        add_leaf_cards(end, leaf_size, leaf, objs, max(3, int(random.randint(8, 12) * density)))
        if tips is not None: tips.append(end.copy())
        return
    if depth == 1 and density > 1.0:
        add_leaf_cards(end, leaf_size * 1.15, leaf, objs, int(random.randint(3, 6) * (density - 0.8)))
        if tips is not None: tips.append(end.copy())
    nb = random.randint(2, 3)
    for i in range(nb):
        spread = math.radians(random.uniform(28, 48))
        azi = (i / nb) * 2 * math.pi + random.uniform(0, 1.2)
        up = V((0, 0, 1)); perp = dr.cross(up)
        if perp.length < 1e-3: perp = V((1, 0, 0))
        perp.normalize(); perp.rotate(mathutils.Quaternion(dr, azi))
        cdir = dr.copy(); cdir.rotate(mathutils.Quaternion(perp, spread))
        grow(end, cdir, length * random.uniform(0.62, 0.78), radius * 0.62, depth - 1, bark, leaf, leaf_size, density, objs, tips)
    if random.random() < 0.6:
        grow(end, (dr + V((0, 0, 0.35))).normalized(), length * 0.7, radius * 0.6, depth - 1, bark, leaf, leaf_size, density, objs, tips)

def berry_material():
    m = bpy.data.materials.new("berry"); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (0.62, 0.05, 0.05, 1.0)
    b.inputs["Roughness"].default_value = 0.3
    try: b.inputs["Emission Color"].default_value = (0.5, 0.03, 0.03, 1.0); b.inputs["Emission Strength"].default_value = 0.25
    except Exception: pass
    return m

# ---- 오브젝트 빌더 ----
def make_boulder(mat, objs, size=1.0, squash=None, jitter=0.45, subdiv=2):
    # v2: subdiv 3→2(면이 크고 각져 축소 시 실루엣 판독) + 지터 강화
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=size)
    o = bpy.context.active_object
    sq = squash or (random.uniform(0.85, 1.25), random.uniform(0.85, 1.25), random.uniform(0.6, 0.9))
    o.scale = sq
    me = o.data
    for v in me.vertices:
        v.co += V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * size * jitter * random.random()
        if v.co.z < -size * 0.35: v.co.z = -size * 0.35   # 바닥 컷(땅에 앉음)
    bpy.ops.object.shade_flat()
    o.data.materials.append(mat); objs.append(o)
    return o

def scatter_on_top(o, count, radius_scale=0.9, ph_max=1.1):
    """바위 상반부 표면 근사 위치 목록"""
    pts = []
    for _ in range(count):
        th = random.uniform(0, 2 * math.pi)
        ph = random.uniform(0.12, ph_max)   # 위쪽 위주
        d = V((math.cos(th) * math.sin(ph), math.sin(th) * math.sin(ph), math.cos(ph)))
        w = o.matrix_world @ (V((d.x * o.scale.x, d.y * o.scale.y, d.z * o.scale.z)) * radius_scale)
        pts.append((w, d))
    return pts

def make_crystals(rock, mat, objs, n):
    # v2: 적게·크게·상부 집중(ph<=0.65) — 아이소에서 위로 솟게
    for (p, d) in scatter_on_top(rock, n, 0.75, ph_max=0.65):
        h = random.uniform(0.7, 1.3); r = h * random.uniform(0.26, 0.34)
        bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=r, radius2=0.03, depth=h, location=p + d * h * 0.3)
        c = bpy.context.active_object
        tilt = d + V((random.uniform(-0.25, 0.25), random.uniform(-0.25, 0.25), random.uniform(0.5, 1.0)))
        c.rotation_euler = tilt.to_track_quat('Z', 'Y').to_euler()
        bpy.ops.object.shade_flat()
        c.data.materials.append(mat); objs.append(c)

def add_leaf_cards(center, size, mat, objs, n, zbias=0.0):
    for _ in range(n):
        off = V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.3, 0.9) + zbias)) * size * 0.7
        bpy.ops.mesh.primitive_plane_add(size=size * random.uniform(0.95, 1.5), location=center + off)
        o = bpy.context.active_object
        o.rotation_euler = (random.uniform(0, math.pi), random.uniform(0, math.pi), random.uniform(0, 2 * math.pi))
        o.data.materials.append(mat); objs.append(o)

def make_bush(bark_mat, leaf_mat, berry_mat, objs, size=1.0, berries=10):
    # ★v3: 나무와 같은 방식 — 다간 관목(짧은 줄기 2~4개가 바깥으로 벌어짐, depth 2, 밀도 최대)
    #   가지 구조가 실루엣·명암을 만들고 잎카드가 가지 끝에 달려 3D 부피가 생긴다(2D 스머지 해소).
    tips = []
    stems = random.randint(2, 4)
    for i in range(stems):
        azi = (i / stems) * 2 * math.pi + random.uniform(-0.5, 0.5)
        tilt = random.uniform(0.3, 0.6)   # 바깥으로 벌어진 줄기(관목형)
        dr = V((math.cos(azi) * math.sin(tilt), math.sin(azi) * math.sin(tilt), math.cos(tilt)))
        grow(V((random.uniform(-0.07, 0.07), random.uniform(-0.07, 0.07), 0)), dr,
             size * random.uniform(0.45, 0.6), size * 0.06, 2, bark_mat, leaf_mat,
             size * 0.24, 2.2, objs, tips)
    # 열매: 실제 잎뭉치(가지 끝) 위치에 부착 — 겉에서 보이게 약간 바깥·위로
    if tips:
        for _ in range(berries):
            t = tips[random.randrange(len(tips))]
            off = V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-0.2, 0.8)))
            off = off.normalized() * size * random.uniform(0.1, 0.22)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size * 0.075, location=t + off)
            b = bpy.context.active_object
            bpy.ops.object.shade_smooth()
            b.data.materials.append(berry_mat); objs.append(b)

def make_herb(herb_mat, flower_mat, objs, size=0.7):
    # ★v3: 좁은 잎날 6~8장 부챗살(전용 2톤 그라데이션 — leaf.png 스머지 해소) + 꽃점 1~3개(약초 판독성)
    n = random.randint(6, 8)
    for i in range(n):
        azi = (i / n) * 2 * math.pi + random.uniform(-0.25, 0.25)
        tilt = random.uniform(0.4, 0.7)
        d = V((math.cos(azi) * math.sin(tilt), math.sin(azi) * math.sin(tilt), math.cos(tilt)))
        L = size * random.uniform(0.85, 1.25)
        bpy.ops.mesh.primitive_plane_add(size=L * 0.6, location=d * L * 0.4 + V((0, 0, L * 0.16)))
        o = bpy.context.active_object
        o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
        o.scale = (0.22, 1.0, 1.0)   # 좁은 잎날
        o.data.materials.append(herb_mat); objs.append(o)
    for _ in range(random.randint(1, 3)):
        azi = random.uniform(0, 2 * math.pi); tilt = random.uniform(0.15, 0.5)
        d = V((math.cos(azi) * math.sin(tilt), math.sin(azi) * math.sin(tilt), math.cos(tilt)))
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=size * 0.06, location=d * size * 0.5 + V((0, 0, size * 0.35)))
        f = bpy.context.active_object
        bpy.ops.object.shade_smooth()
        f.data.materials.append(flower_mat); objs.append(f)

# ---- 씬 셋업 (tree_render.py 동일 — 같은 태양·카메라·톤) ----
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
try: scene.cycles.use_denoising = True
except Exception: pass
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.resolution_x = RES_X; scene.render.resolution_y = RES_Y
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

if not os.path.exists(LEAF_PATH):
    print("[!!] leaf.png 없음:", LEAF_PATH); raise SystemExit
leaf_img = bpy.data.images.load(LEAF_PATH)
leaf_mat = leaf_material(leaf_img)
bark_mat = bark_material()
herb_mat = herb_leaf_material()
flower_mat = flower_material()
berry_mat = berry_material()
crystal_mat = crystal_material()

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

JOBS = []
for i in range(1, N_EACH + 1): JOBS.append(("rock_iso_%02d.png" % i, "rock", i))
for i in range(1, N_EACH + 1): JOBS.append(("mossrock_iso_%02d.png" % i, "mossrock", i))
for i in range(1, N_EACH + 1): JOBS.append(("ore_iso_%02d.png" % i, "ore", i))
for i in range(1, N_EACH + 1): JOBS.append(("bush_iso_%02d.png" % i, "bush", i))
for i in range(1, N_EACH + 1): JOBS.append(("herb_iso_%02d.png" % i, "herb", i))

for (fname, kind, i) in JOBS:
    random.seed(hash(kind) % 9973 + i * 131 + 15500)   # v3 시드
    objs = []
    if kind == "rock":
        base = (0.22 + random.uniform(-0.03, 0.04), 0.20 + random.uniform(-0.03, 0.03), 0.18 + random.uniform(-0.02, 0.03))
        m = rock_material(base, moss=False, seed=i)
        make_boulder(m, objs, size=1.0, jitter=0.4 + 0.12 * random.random())
        if random.random() < 0.5:   # 곁돌
            small = make_boulder(m, objs, size=0.38, jitter=0.4)
            small.location = V((random.uniform(0.9, 1.3), random.uniform(-0.6, 0.6), -0.25))
    elif kind == "mossrock":
        base = (0.21, 0.20, 0.18)
        m = rock_material(base, moss=True, seed=100 + i)
        make_boulder(m, objs, size=1.0, jitter=0.42)
    elif kind == "ore":
        m = rock_material((0.16, 0.15, 0.14), moss=False, seed=200 + i)
        r = make_boulder(m, objs, size=0.95, jitter=0.38)
        make_crystals(r, crystal_mat, objs, random.randint(3, 5))
    elif kind == "bush":
        make_bush(bark_mat, leaf_mat, berry_mat, objs, size=1.0, berries=random.randint(8, 12))
    elif kind == "herb":
        make_herb(herb_mat, flower_mat, objs, size=0.7)
    if not objs:
        print("[!!] %s 0개" % fname); continue
    path = os.path.join(OUTDIR, fname)
    print("[render] %s (objs=%d) ..." % (fname, len(objs)))
    frame_and_render(objs, path)
    cleanup(objs)

print("\n[DONE] → %s" % OUTDIR)
