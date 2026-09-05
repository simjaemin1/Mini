# tree_render.py — durango-mini 아이소 나무 렌더 (재귀 가지 + 잎카드, Blender 5.x)
# 실행:  cd ~/Mini && /Applications/Blender.app/Contents/MacOS/Blender -b -P tree_render.py
# 필요: 같은 폴더에 leaf.png (잎 텍스처) 있어야 함.
# 결과: ~/Mini/tree_renders/tree_iso_01.png ...
# 에러나면 콘솔 그대로 붙여줘.

import bpy, os, math, random, mathutils
V = mathutils.Vector

# ===== CONFIG =====
N_TREES   = 12
RES_X, RES_Y = 512, 800
SAMPLES   = 48
DEPTH     = 3
OUTDIR    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tree_renders")
LEAF_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "leaf.png")
BARK = (0.24,0.15,0.08)
# ==================
os.makedirs(OUTDIR, exist_ok=True)

def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED': return n
    return mat.node_tree.nodes.get("Principled BSDF")

def bark_material():
    m = bpy.data.materials.new("bark"); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Base Color"].default_value = (BARK[0],BARK[1],BARK[2],1.0)
    b.inputs["Roughness"].default_value = 0.92
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 14
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def leaf_material(img):
    m = bpy.data.materials.new("leafcard"); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = 0.6
    return m

def add_segment(p0, p1, r0, r1, mat, objs):
    d = p1 - p0; L = d.length
    if L < 1e-4: return
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r0, radius2=r1, depth=L, location=(p0+p1)/2)
    o = bpy.context.active_object
    o.rotation_euler = d.to_track_quat('Z','Y').to_euler()
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat); objs.append(o)

def add_leaf_cards(center, size, mat, objs, n):
    for _ in range(n):
        off = V((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-0.7,1.0))) * size * 0.8
        bpy.ops.mesh.primitive_plane_add(size=size*random.uniform(0.9,1.4), location=center+off)
        o = bpy.context.active_object
        o.rotation_euler = (random.uniform(0,math.pi), random.uniform(0,math.pi), random.uniform(0,2*math.pi))
        o.data.materials.append(mat); objs.append(o)

def grow(p, dr, length, radius, depth, bark, leaf, leaf_size, density, objs):
    dr = dr.normalized(); end = p + dr*length
    add_segment(p, end, radius, radius*0.7, bark, objs)
    if depth <= 0:
        add_leaf_cards(end, leaf_size, leaf, objs, max(3, int(random.randint(8,12)*density)))
        return
    if depth == 1 and density > 1.0:    # 빽빽한 나무는 중간 가지에도 잎 → 풍성한 캐노피
        add_leaf_cards(end, leaf_size*1.15, leaf, objs, int(random.randint(3,6)*(density-0.8)))
    nb = random.randint(2,3)
    for i in range(nb):
        spread = math.radians(random.uniform(28,48))
        azi = (i/nb)*2*math.pi + random.uniform(0,1.2)
        up = V((0,0,1)); perp = dr.cross(up)
        if perp.length < 1e-3: perp = V((1,0,0))
        perp.normalize(); perp.rotate(mathutils.Quaternion(dr, azi))
        cdir = dr.copy(); cdir.rotate(mathutils.Quaternion(perp, spread))
        grow(end, cdir, length*random.uniform(0.62,0.78), radius*0.62, depth-1, bark, leaf, leaf_size, density, objs)
    if random.random() < 0.6:
        grow(end, (dr+V((0,0,0.35))).normalized(), length*0.7, radius*0.6, depth-1, bark, leaf, leaf_size, density, objs)

# ---- 씬 셋업 ----
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
if bg: bg.inputs[0].default_value=(0.52,0.56,0.6,1.0); bg.inputs[1].default_value=0.55
sun_d = bpy.data.lights.new("Sun",'SUN'); sun_d.energy=3.6; sun_d.angle=0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52),0,math.radians(35))
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam"); cam_d.type='ORTHO'; cam_d.clip_start=0.1; cam_d.clip_end=1000
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam
ISO_DIR = V((1.0,-1.0,1.2)).normalized()   # ≈40° 부감 (더 확실한 아이소 — 위에서 비스듬히)

if not os.path.exists(LEAF_PATH):
    print("[!!] leaf.png 없음:", LEAF_PATH); raise SystemExit
leaf_img = bpy.data.images.load(LEAF_PATH)
bark_mat = bark_material()
leaf_mat = leaf_material(leaf_img)

def frame_and_render(objs, path):
    mn=[1e9]*3; mx=[-1e9]*3
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ V(c)
            for k in range(3): mn[k]=min(mn[k],w[k]); mx[k]=max(mx[k],w[k])
    ctr = V(((mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2))
    size = max(mx[0]-mn[0], mx[1]-mn[1], mx[2]-mn[2])
    tgt.location = ctr
    cam.location = ctr + ISO_DIR*(size*4+20)
    cam_d.ortho_scale = size*1.25 + 0.5
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)

for idx in range(1, N_TREES+1):
    random.seed(idx*11)
    density = 0.5 + 1.7*((idx-1)/(N_TREES-1))   # 성긴(0.5) → 빽빽(2.2) 그라데이션
    objs = []
    trunk_len = random.uniform(1.8,2.6); trunk_r = random.uniform(0.16,0.24)
    leaf_size = trunk_len * 0.2
    grow(V((0,0,0)), V((0,0,1)), trunk_len, trunk_r, DEPTH, bark_mat, leaf_mat, leaf_size, density, objs)
    if not objs:
        print("[!!] tree %d 0개" % idx); continue
    path = os.path.join(OUTDIR, "tree_iso_%02d.png" % idx)
    print("[render] %s (objs=%d, density=%.1f) ..." % (os.path.basename(path), len(objs), density))
    frame_and_render(objs, path)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        try: o.select_set(True)
        except Exception: pass
    bpy.ops.object.delete()

print("\n[DONE] → %s" % OUTDIR)
