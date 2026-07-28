# building_render.py — durango-mini 건물 스프라이트(움집 지붕 · 큰집 지붕 · 고상곳간 통짜)
#   씬·조명 정본은 icon_render.py / bridge_render.py 계열과 동일(Cycles · film_transparent · ORTHO ·
#   태양 52°/35° energy 3.6 · 월드 (0.52,0.56,0.6)@0.55 · SAMPLES 64 · OIDN 부재 자동 감지).
#
# ★게임 정합(다리 규약의 일반화 — 발자국 N×M셀로 확장):
#   클라 투영  w2i(wx,wy,wz) = { x: wx-wy, y: (wx+wy)/2 - wz }  (2:1 다이메트릭)
#   → 카메라 방위 45°·고도 30°.  1셀(=32 게임px) 가로폭 = 64px 이므로 **px/unit = 64/√2 = 45.255**.
#   ★높이 축만 게임 화법이 따로 있다: 클라 베이크 아트는 **1m(=1셀) 높이 = 32px**(WALL_HEIGHT 64px = 2m).
#     물리적으로 정확한 렌더는 45.255×cos30 = 39.2px/유닛이므로, 모델 z를 **32/39.2 = 0.8165배**로 눌러
#     기존 벽·처마선과 정확히 맞춘다(= 1/√1.5. 2:1 등각 화법의 표준 압축).
#   ★앵커 규약: 클라는 `drawImage(img, s.x - img._ox, s.y - img._oy)`로 그리고, s는 **지붕 로컬 원점**
#     (발자국+오버행의 북서 모서리, 지면)의 화면 좌표다. 그래서 렌더 시 그 점의 픽셀 위치를 계산해
#     `building_anchors.json`으로 함께 내보낸다(클라가 그대로 _ox/_oy로 쓴다).
#
# 실행:  blender -b -P building_render.py
# 결과:  ./building_renders/{hut_roof,hall_roof,granary}.png + building_anchors.json
# 고증: 청동기 후기(송국리) — 지상 통나무 벽 + 맞배 이엉, 큰집 8×8 굴립주, 고상곳간 5×3(문 없음·사다리).

import bpy, os, math, random, json, mathutils
V = mathutils.Vector

SAMPLES = 64
PPU = 64.0 / math.sqrt(2.0)      # px per Blender unit(=1셀=1m) — 셀 다이아 가로폭 64px
ZSQ = 32.0 / (PPU * math.cos(math.radians(30.0)))   # 높이 압축(=0.8165) — 1m 높이 = 32px
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "building_renders")
os.makedirs(OUTDIR, exist_ok=True)


def principled(mat):
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return mat.node_tree.nodes.get("Principled BSDF")


def simple_mat(name, color, rough=0.8):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = principled(m)
    b.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    b.inputs["Roughness"].default_value = rough
    return m


def striped_mat(name, base, stripe, scale=22.0, rough=0.8, bump=0.35, dist=3.0):
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


# ===== 씬 =====
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
scene = bpy.context.scene
scene.render.engine = 'CYCLES'; scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
print("[bld] denoise =", scene.cycles.use_denoising, "ppu =", round(PPU, 3), "zsq =", round(ZSQ, 4))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
if bg:
    bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35))   # ★좌우 뒤집기 보정(아래 _flip_png) — 뒤집은 뒤 기존 베이크와 같은 방향에서 빛이 온다
tgt = bpy.data.objects.new("Tgt", None); scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'; cam_d.clip_start = 0.1; cam_d.clip_end = 2000
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt; scene.camera = cam

THETA = math.radians(30.0)
NHAT = V((math.cos(THETA) / math.sqrt(2), math.cos(THETA) / math.sqrt(2), math.sin(THETA)))
RHAT = V((1.0, -1.0, 0.0)).normalized()
UHAT = V((-math.sin(THETA) / math.sqrt(2), -math.sin(THETA) / math.sqrt(2), math.cos(THETA)))

# =============================================================================
# ★★좌우 뒤집기(FLIP) — 8차 실측으로 확정된 필수 보정.
#   Blender TRACK_TO 카메라를 (+x,+y,+z)에 두면 **화면 오른쪽이 (-1,+1,0)** 이 된다(축 실측:
#   (1,0,0)=왼쪽 86px · (0,1,0)=오른쪽 214px · 중심 150). 그런데 게임 투영 w2i는 +x가 오른쪽이다.
#   → 렌더 결과를 좌우로 뒤집어야 게임과 같은 손방향이 된다. 뒤집지 않으면 x/y가 뒤바뀌어
#     **맞배지붕 용마루가 90° 돌아간 것처럼** 보인다(7차 건물 스프라이트의 실제 결함 — 실화면 A/B로 발견).
#   앵커(_ox)는 원래부터 '게임 규약(+x 오른쪽)' 기준으로 계산해 왔으므로 **뒤집은 뒤에 그대로 맞는다**
#   (하네스 test-building-anchor.js가 같은 수학으로 대조).
# =============================================================================
def _flip_png(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = list(img.pixels[:])                       # (Blender 번들 파이썬엔 numpy가 없을 수 있어 순수 파이썬으로)
    out = [0.0] * len(px)
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            s2 = row + x * 4
            d2 = row + (w - 1 - x) * 4
            out[d2] = px[s2]; out[d2 + 1] = px[s2 + 1]; out[d2 + 2] = px[s2 + 2]; out[d2 + 3] = px[s2 + 3]
    img.pixels = out
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


M = {}
# ★색 보정(A/B 육안): 하늘(청회색 0.52/0.56/0.60)을 위로 향한 면이 많이 받아 **이엉이 탁하게** 나왔다.
#   기존 베이크의 따뜻한 볏짚색과 나란히 놓고 보정 — 채도·황색을 올려 같은 마을 안에서 이질감이 없게.
M['thatch'] = striped_mat("thatch", (0.94, 0.74, 0.30), (0.78, 0.57, 0.19), 26, 0.88, 0.55, 4.0)  # 이엉(볏짚·양지)
M['thatch2'] = striped_mat("thatch2", (0.86, 0.66, 0.25), (0.70, 0.50, 0.16), 30, 0.9, 0.5, 4.0)  # 그늘면 이엉
M['log'] = striped_mat("log", (0.44, 0.31, 0.17), (0.33, 0.22, 0.12), 18, 0.85, 0.45)             # 통나무(굴립주·서까래)
M['plank'] = striped_mat("plank", (0.55, 0.41, 0.24), (0.45, 0.32, 0.18), 14, 0.82, 0.35)         # 판벽
M['cord'] = simple_mat("cord", (0.55, 0.45, 0.26), 0.9)
M['dark'] = simple_mat("dark", (0.07, 0.06, 0.05), 0.95)                                          # 들린 바닥 밑 그늘
M['soil'] = striped_mat("soil", (0.34, 0.25, 0.15), (0.24, 0.17, 0.10), 9, 0.95, 0.6, 6.0)        # 파낸 흙(수혈·둔덕)
M['soil2'] = striped_mat("soil2", (0.28, 0.20, 0.12), (0.19, 0.13, 0.08), 12, 0.95, 0.5, 6.0)     # 수혈 바닥 다짐흙(그늘)
M['fiber'] = simple_mat("fiber", (0.62, 0.55, 0.30), 0.9)                                          # 새끼·풀 결속

OBJS = []


def add(o, mat):
    if mat is not None:
        o.data.materials.append(mat)
    OBJS.append(o)
    return o


def cyl(r, d, loc, rot=(0, 0, 0), mat=None, verts=14):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d, location=loc, rotation=rot)
    return add(bpy.context.active_object, mat)


def box(sx, sy, sz, loc, rot=(0, 0, 0), mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    return add(o, mat)


def tri_prism(pts, depth, axis_loc, mat=None):
    """단면 삼각형(합각) — pts=[(x,z)×3] (y는 axis_loc에 두께 depth)."""
    verts, faces = [], []
    for s in (-0.5, 0.5):
        for (x, z) in pts:
            verts.append((x, axis_loc + s * depth, z))
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    me = bpy.data.meshes.new("tri"); me.from_pydata(verts, [], faces); me.update()
    o = bpy.data.objects.new("tri", me); scene.collection.objects.link(o)
    return add(o, mat)


# =============================================================================
# 지붕 — 맞배 이엉. 발자국 W×D셀 + 오버행 0.5셀 사방 ⇒ 로컬 [0..W+1]×[0..D+1]
#   처마 EAVE_M(m) · 용마루 = 처마 + (반깊이 × 물매). 클라 베이크와 같은 물매 0.6(19.2px/셀).
# =============================================================================
SLOPE = 0.6            # 물매(수직/수평) — 클라 베이크 19.2px/셀 ÷ 32px/m
EAVE_M = 2.0           # 처마 높이 2m(=WALL_HEIGHT 64px) — 벽 유닛 위에 얹히는 규약


def gable_roof(W, D, eave=EAVE_M, seed=0, ridge_pole=True):
    """로컬 원점(0,0)=북서 오버행 모서리. 용마루는 x축(i축)과 나란하다."""
    random.seed(seed)
    DI, DJ = W + 1.0, D + 1.0            # 오버행 포함 전체
    jc = DJ / 2.0
    ridge = eave + jc * SLOPE
    th = 0.16                            # 이엉 두께
    # ① 두 경사면 — 얇은 판을 기울여 배치(윗면이 이엉)
    slab_len = math.hypot(jc, ridge - eave)
    ang = math.atan2(ridge - eave, jc)
    for sgn, mat in ((-1, M['thatch']), (1, M['thatch2'])):
        cy = jc + sgn * jc / 2.0
        cz = (eave + ridge) / 2.0
        # ★회전 부호: 남면(sgn=+1)은 용마루→처마가 (+Y,−Z) 방향이라 X축 −ang. 1패스에서 반대로 줘
        #   두 면이 서로 다른 방향으로 누웠다(육안에서 즉시 드러남).
        o = box(DI, slab_len, th, (DI / 2, cy, cz), rot=(-sgn * ang, 0, 0), mat=mat)
    # ② 용마루 이엉 마루 + 눌림대 통나무
    box(DI, 0.42, 0.20, (DI / 2, jc, ridge + 0.05), mat=M['thatch'])
    if ridge_pole:
        cyl(0.075, DI + 0.10, (DI / 2, jc, ridge + 0.16), rot=(0, math.radians(90), 0), mat=M['log'])
    # ③ 합각(박공) — 동·서 마구리 삼각면
    pts = [(0.0, eave), (DJ, eave), (jc, ridge)]
    for x_at in (0.02, DI - 0.02):
        verts = [(x_at, p[0], p[1]) for p in pts] + [(x_at + 0.04, p[0], p[1]) for p in pts]
        faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
        me = bpy.data.meshes.new("gable"); me.from_pydata(verts, [], faces); me.update()
        o = bpy.data.objects.new("gable", me); scene.collection.objects.link(o)
        add(o, M['thatch2'])
    # ④ 처마 밑 서까래 끝(손으로 엮은 티) — 남·북 처마선에 일정 간격
    for i in range(1, int(DI)):
        for (jj, s2) in ((0.10, -1), (DJ - 0.10, 1)):
            cyl(0.05, 0.34, (i + 0.5, jj, eave - 0.04), rot=(math.radians(90 - s2 * 18), 0, 0), mat=M['log'], verts=8)
    # ⑤ 새끼줄 눌림(용마루 가로 결속)
    for i in range(1, int(DI), 2):
        cyl(0.028, 0.70, (i + 0.5, jc, ridge + 0.14), rot=(math.radians(90), 0, 0), mat=M['cord'], verts=8)


# =============================================================================
# 고상곳간 — 통짜 1장(기둥 + 판벽 + 이엉 + 사다리). 발자국 5×3 + 오버행 0.5 ⇒ 로컬 [0..6]×[0..4]
#   클라 _granC와 동일 구성: 기둥층 0.75m(24px) + 몸체 1.25m(40px) = 처마 2m(64px).
# =============================================================================
def granary():
    random.seed(51)
    W, D = 5.0, 3.0
    DI, DJ = W + 1.0, D + 1.0
    STILT, BODY = 0.75, 1.25
    eave = STILT + BODY
    b0, b1i, b1j = 0.5, DI - 0.5, DJ - 0.5      # 발자국(오버행 안쪽)
    # ① 굴립주 6주
    for (sx2, sy2) in ((b0, b0), (DI / 2, b0), (b1i, b0), (b0, b1j), (DI / 2, b1j), (b1i, b1j)):
        cyl(0.11, STILT + 0.18, (sx2, sy2, (STILT + 0.18) / 2), mat=M['log'], verts=10)
    # ② 들린 바닥(판재) + 밑면 그늘
    box(W, D, 0.14, (DI / 2, DJ / 2, STILT + 0.07), mat=M['plank'])
    box(W - 0.1, D - 0.1, 0.02, (DI / 2, DJ / 2, STILT - 0.01), mat=M['dark'])
    # ③ 판벽 몸체(문 없음 — 밀폐)
    for (sx2, sy2, w2, d2) in ((DI / 2, b0, W, 0.12), (DI / 2, b1j, W, 0.12),
                               (b0, DJ / 2, 0.12, D), (b1i, DJ / 2, 0.12, D)):
        box(w2, d2, BODY, (sx2, sy2, STILT + BODY / 2), mat=M['plank'])
    # ④ 사다리(남면 중앙) — 세로 2줄 + 가로장
    for dx in (-0.22, 0.22):
        cyl(0.05, eave + 0.30, (DI / 2 + dx, b1j + 0.34, (eave + 0.30) / 2 - 0.05),
            rot=(math.radians(14), 0, 0), mat=M['log'], verts=8)
    for k in range(4):
        z = 0.28 + k * 0.44
        cyl(0.035, 0.50, (DI / 2, b1j + 0.30 - (z - eave / 2) * 0.06, z), rot=(0, math.radians(90), 0), mat=M['log'], verts=8)
    # ⑤ 이엉 맞배 지붕(같은 물매)
    gable_roof(W, D, eave=eave, seed=7)


def hut_roof():
    gable_roof(6.0, 4.0, seed=1)


def hall_roof():
    gable_roof(8.0, 8.0, seed=2)


# =============================================================================
# 렌더 — 로컬 원점(0,0,0)의 화면 픽셀 좌표(_ox,_oy)를 계산해 앵커로 내보낸다.
# =============================================================================
def render(key, W, D, top_m):
    """W×D=발자국(셀). top_m=최고 높이(m, z압축 전). 이미지는 오버행 포함 전체를 담는다."""
    # ★z 압축 — 게임 화법(1m=32px). **오브젝트 scale로 누르면 안 된다**: 회전된 오브젝트의 로컬 z는
    #   월드 z가 아니라서 형태가 어긋난다(1패스 실패의 원인). 변환을 굽고 **정점 좌표**를 직접 누른다.
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        o.select_set(True)
    bpy.context.view_layer.objects.active = OBJS[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in OBJS:
        for v in o.data.vertices:
            v.co.z *= ZSQ
    bpy.ops.object.select_all(action='DESELECT')
    DI, DJ = W + 1.0, D + 1.0
    # 화면 픽셀 폭/높이(클라 베이크와 동일 계산): 가로 (DI+DJ)*32, 세로 (DI+DJ)*16 + 최고높이px + 여유
    top_px = top_m * 32.0
    Wpx = int((DI + DJ) * 32) + 8
    Hpx = int((DI + DJ) * 16 + top_px) + 12
    scene.render.resolution_x = Wpx; scene.render.resolution_y = Hpx
    cam_d.ortho_scale = Wpx / PPU
    ctr = V((DI / 2, DJ / 2, (top_m * ZSQ) / 2))
    tgt.location = ctr
    cam.location = ctr + NHAT * 200.0
    _p = os.path.join(OUTDIR, key + ".png")
    scene.render.filepath = _p
    bpy.ops.render.render(write_still=True)
    _flip_png(_p)                     # ★게임 손방향 보정(위 FLIP 주석)
    # 로컬 원점(0,0,0)의 픽셀 좌표 = 앵커
    rel = V((0.0, 0.0, 0.0)) - ctr
    ox = Wpx / 2.0 + rel.dot(RHAT) * PPU
    oy = Hpx / 2.0 - rel.dot(UHAT) * PPU
    print(f"[bld] {key}: {Wpx}×{Hpx} anchor=({ox:.1f},{oy:.1f})")
    return {"w": Wpx, "h": Hpx, "ox": round(ox, 1), "oy": round(oy, 1)}


def cleanup():
    bpy.ops.object.select_all(action='DESELECT')
    for o in OBJS:
        try: o.select_set(True)
        except Exception: pass
    bpy.ops.object.delete()


# =============================================================================
# 움집 4단계 공정(HUT_STAGES) — 서버 stage 1~3이 '움집터'로 보이는 구간. 4단계=완공(hut_roof가 대체).
#   ① 수혈 굴착(터파기) ② 굴립주 기둥 6 ③ 도리·서까래 골조 ④ 이엉(=완공)
#   발자국은 완공 움집과 동일한 6×4 — 같은 앵커 계약이라 클라가 같은 원점에 그린다.
# =============================================================================
HUT_W, HUT_D = 6.0, 4.0
POSTS6 = None   # 굴립주 6주 좌표(발자국 안쪽) — 단계 ②③ 공용


def _hut_posts():
    """굴립주 6주 = 네 모서리 + 장변 중간 2 (고증: 6주식)."""
    b0x, b1x = 0.9, HUT_W + 0.1
    b0y, b1y = 0.9, HUT_D + 0.1
    return [(b0x, b0y), ((b0x + b1x) / 2, b0y), (b1x, b0y),
            (b0x, b1y), ((b0x + b1x) / 2, b1y), (b1x, b1y)]


def _hut_pit(rim=True):
    """수혈(얕은 구덩이) — 바닥 다짐흙 + 파낸 흙 둔덕. 로컬 원점 기준 발자국은 [0.5..W+0.5]×[0.5..D+0.5]."""
    random.seed(91)
    cx2, cy2 = (HUT_W + 1) / 2, (HUT_D + 1) / 2
    # ★1패스 육안: 바닥이 '깔개'처럼 보였다 — 더 낮게·더 어둡게 깔고 둔덕을 키워 '파낸 구덩이'로 읽히게.
    box(HUT_W, HUT_D, 0.06, (cx2, cy2, -0.06), mat=M['soil2'])           # 파인 바닥(수혈 — 지면보다 낮다)
    if rim:
        for i in range(30):                                              # 파낸 흙 둔덕(가장자리 — 구덩이 테두리)
            t = i / 30 * 2 * math.pi
            x = cx2 + math.cos(t) * (HUT_W / 2 + 0.22)
            y = cy2 + math.sin(t) * (HUT_D / 2 + 0.22)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=random.uniform(0.16, 0.26), location=(x, y, 0.09))
            o = bpy.context.active_object
            o.scale = (1.25, 1.25, 0.62)
            add(o, M['soil'])


def hut_s1():
    """① 수혈 굴착 — 구덩이 + 흙 둔덕 + 파낸 자리 말뚝 표시 2개."""
    _hut_pit()
    for (x, y) in ((1.2, 0.75), (HUT_W - 0.2, HUT_D + 0.25)):
        cyl(0.04, 0.42, (x, y, 0.21), mat=M['log'], verts=8)


def hut_s2():
    """② 굴립주 기둥 6 — 2m 통나무를 수혈 바닥에 묻어 세운다."""
    _hut_pit()
    for (x, y) in _hut_posts():
        cyl(0.115, EAVE_M + 0.20, (x, y, (EAVE_M + 0.20) / 2 - 0.10), mat=M['log'], verts=10)
        cyl(0.15, 0.10, (x, y, 0.03), mat=M['soil'], verts=10)           # 밑동 되메운 흙


def hut_s3():
    """③ 도리·서까래 골조 — 기둥 + 처마도리 + 용마루 종도리 + 서까래(이엉 전). 물매는 완공과 동일."""
    hut_s2()
    jc = (HUT_D + 1) / 2
    ridge = EAVE_M + jc * SLOPE
    # 처마도리(장변 2줄)
    for y in (0.9, HUT_D + 0.1):
        cyl(0.075, HUT_W + 0.5, ((HUT_W + 1) / 2, y, EAVE_M), rot=(0, math.radians(90), 0), mat=M['log'], verts=10)
    # 마룻대(종도리) + 받침 기둥 2
    cyl(0.085, HUT_W + 0.6, ((HUT_W + 1) / 2, jc, ridge), rot=(0, math.radians(90), 0), mat=M['log'], verts=10)
    for x in (1.2, HUT_W - 0.2):
        cyl(0.09, ridge, (x, jc, ridge / 2), mat=M['log'], verts=10)
    # 서까래 — 마룻대에서 양 처마로
    ang = math.atan2(ridge - EAVE_M, jc)
    ln = math.hypot(jc, ridge - EAVE_M)
    for i in range(9):
        x = 0.65 + i * (HUT_W - 0.3) / 8
        for sgn in (-1, 1):
            cy2 = jc + sgn * jc / 2
            cz = (EAVE_M + ridge) / 2
            cyl(0.038, ln, (x, cy2, cz), rot=(math.radians(90) - sgn * ang, 0, 0), mat=M['log'], verts=7)
    # 들보(장변 기둥을 가로로 묶는 보 2줄) — 골조가 '서 있는 구조'로 읽히게
    for x in (1.6, HUT_W - 0.6):
        cyl(0.06, HUT_D - 0.6, (x, jc, EAVE_M - 0.12), rot=(math.radians(90), 0, 0), mat=M['log'], verts=8)
    # 결속 새끼(마룻대 몇 군데)
    for i in range(3):
        x = 1.4 + i * (HUT_W - 1.6) / 2
        cyl(0.03, 0.34, (x, jc, ridge), rot=(math.radians(90), 0, 0), mat=M['fiber'], verts=8)


JOBS = [
    ("hut_roof", hut_roof, 6.0, 4.0, EAVE_M + 2.5 * SLOPE + 0.4),
    ("hall_roof", hall_roof, 8.0, 8.0, EAVE_M + 4.5 * SLOPE + 0.4),
    ("granary", granary, 5.0, 3.0, 2.0 + 2.0 * SLOPE + 0.4),
    # ★움집 공정 — 발자국은 완공과 같은 6×4(같은 앵커 계약), 높이만 단계별
    ("hut_s1", hut_s1, 6.0, 4.0, 0.45),
    ("hut_s2", hut_s2, 6.0, 4.0, EAVE_M + 0.35),
    ("hut_s3", hut_s3, 6.0, 4.0, EAVE_M + 2.5 * SLOPE + 0.35),
]
ONLY = [k for k in os.environ.get('BLD_ONLY', '').split(',') if k]
anchors = {}
for (key, fn, W, D, top) in JOBS:
    if ONLY and key not in ONLY:
        continue
    OBJS = []
    globals()['OBJS'] = OBJS
    fn()
    print("[bld] render", key, "objs=", len(OBJS))
    anchors[key] = render(key, W, D, top)
    cleanup()

apath = os.path.join(OUTDIR, "building_anchors.json")
if ONLY and os.path.exists(apath):
    try: anchors = {**json.load(open(apath)), **anchors}
    except Exception: pass
json.dump(anchors, open(apath, "w"), indent=1)
print("[bld] DONE ->", OUTDIR, json.dumps(anchors))
