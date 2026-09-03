#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/props_render.py — 가구·시설·손도구 정본 [재민 확정 2026-09-03 · T67 · T72]
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
#        PROPS_ONLY=chest,wall  … 가구 일부만 · ITEMS_ONLY=axe,fish … 손도구 일부만
#        SKIP_PROPS=1 / SKIP_ITEMS=1 … 한쪽만 굽는다(다시 굽는 범위를 줄인다)
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


def ico(r, loc, subdiv=1, mat=None, scale=(1, 1, 1), jitter=0.0, seed=None, smooth=False):
    # ★[T72] `smooth` 를 열었다 — 기본값은 종전 그대로(플랫)라 T67 가구 14장은 한 픽셀도 안 바뀐다.
    #   생선처럼 **둥근 몸**은 스무스라야 하고, 돌·흙덩이는 플랫이라야 각이 산다(소체 2차 규약).
    if seed is not None:
        random.seed(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r, location=loc)
    o = bpy.context.active_object; o.scale = scale
    if jitter:
        for v in o.data.vertices:
            v.co *= (1.0 + random.uniform(-jitter, jitter))
    if smooth:
        for pg in o.data.polygons:
            pg.use_smooth = True
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
# ── [T72] 손도구·손에 드는 것 ─────────────────────────────────────────────
M['ground'] = bumped_mat("p_ground", (0.40, 0.40, 0.39), (0.29, 0.29, 0.29), 5, 0.16, 0.42)   # 간석기 — 갈아 낸 매끈한 면
M['chipped'] = bumped_mat("p_chipped", (0.42, 0.40, 0.37), (0.27, 0.26, 0.24), 15, 0.75, 0.90) # 뗀석기 — 깨뜨린 거친 면
M['river'] = bumped_mat("p_river", (0.40, 0.36, 0.31), (0.27, 0.24, 0.20), 7, 0.30, 0.66)      # 냇돌 — 모서리가 닳아 매끈하고 갈빛(소금과 갈려야 한다)
M['river2'] = bumped_mat("p_river2", (0.33, 0.31, 0.29), (0.22, 0.21, 0.19), 9, 0.30, 0.70)
M['haft'] = striped_mat("p_haft", (0.58, 0.44, 0.26), (0.46, 0.34, 0.19), 20, 0.78, 0.35)      # 다듬은 자루
M['bark2'] = bumped_mat("p_bark2", (0.30, 0.20, 0.11), (0.19, 0.12, 0.06), 16, 0.55, 0.92)     # 껍질 붙은 잔가지
M['scale'] = striped_mat("p_scale", (0.15, 0.21, 0.19), (0.27, 0.34, 0.31), 34, 0.34, 0.45)    # 물고기 비늘(어두운 청올리브)
#   ⚠1·2패스는 은백~옅은 청회색이라 96px 에서 **흰 비행선**으로 읽혔다. 배(밝음)와 대비가 나야 물고기가 된다.
M['belly'] = simple_mat("p_belly", (0.78, 0.76, 0.68), 0.45)                                    # 물고기 배(밝다)
M['dorsal'] = striped_mat("p_dorsal", (0.14, 0.20, 0.18), (0.22, 0.29, 0.26), 30, 0.38, 0.40)   # 물고기 등(어둡다 — 카운터셰이딩)
M['fin'] = simple_mat("p_fin", (0.30, 0.34, 0.33), 0.55)                                        # 지느러미
M['grilled'] = striped_mat("p_grilled", (0.56, 0.38, 0.20), (0.34, 0.21, 0.10), 26, 0.62, 0.35) # 구운 살갗
M['scorch'] = simple_mat("p_scorch", (0.14, 0.11, 0.09), 0.92)                                  # 그을음
M['saltx'] = bumped_mat("p_saltx", (0.88, 0.88, 0.86), (0.74, 0.75, 0.75), 22, 0.30, 0.42)      # 소금 결정
M['gourd'] = bumped_mat("p_gourd", (0.72, 0.62, 0.34), (0.58, 0.48, 0.24), 6, 0.22, 0.62)       # 표주박 껍질
M['brinew'] = simple_mat("p_brinew", (0.26, 0.34, 0.31), 0.12)                                  # 짠물 — 어둡고 젖어 있다(밝은 회색이면 '쇠뚜껑'으로 읽힌다)
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


# ═══════════════ [T72] 손도구·손에 드는 것 — 아이콘 1차 13종 ═══════════════
# ★같은 씬·같은 재질 문법을 쓴다(파일을 새로 파면 씬이 두 벌이 된다 — 그게 사본이다).
#   지금은 **아이콘만** 굽지만 구조는 T67 그대로다: 나중에 손에 들리거나 바닥에 떨어질 때
#   `PROPS` 처럼 `world=[...]` 를 붙이면 **같은 모델**에서 세계 렌더가 나온다.
# ★고증(청동기 후기 송국리): 일상 도구는 **간석기**(갈아 만든 돌)다. 조잡한 셋은 **뗀석기 급조**
#   (자갈을 깨 날을 세워 나뭇가지에 풀로 동여맨 것 — `zone.js RECIPES` 의 자갈·잔가지·풀 그대로).
#   철기 금지. 검은 **마제석검**이다 — 레시피가 `wood 2 + stone 8` 이라 정본이 돌이라고 말한다.

def _lash(x, y, z, rot, r=0.032, ln=0.30, n=3, mat=None, gap=0.075):
    """동여맨 끈 n 바퀴 — 조잡한 석기와 간석기 자루를 묶는 그 층."""
    for i in range(n):
        cyl(r, ln, (x, y, z + (i - (n - 1) / 2) * gap), rot=rot, mat=(mat or M['fiber']), verts=7)


def m_crude_axe():
    """조잡한 돌도끼 — 자갈 2 + 잔가지 1 + 풀 2. **깨뜨린 날**을 갈라진 가지에 풀로 동여맸다.
    간석기(`axe`)와 **한눈에 구별**돼야 한다(같은 그림이면 속는다 — 51-s-side 가 이모지로도 그렇게 했다)."""
    #   ⚠1패스는 돌을 자루 **가운데**에 붙여 곤봉으로 읽혔다. 날은 **끝**에 있어야 도끼가 된다.
    random.seed(720)
    cyl(0.072, 1.40, (-0.24, 0, 0.16), rot=(0, math.radians(84), math.radians(10)), mat=M['bark2'], verts=8)
    for sgn in (-1, 1):                                                    # 갈라진 가지 끝(날을 물린다)
        cyl(0.040, 0.42, (0.36, sgn * 0.075, 0.20), rot=(0, math.radians(78), math.radians(10)),
            mat=M['bark2'], verts=6)
    ico(0.30, (0.62, 0.0, 0.30), subdiv=1, mat=M['chipped'], scale=(1.05, 0.42, 1.15), jitter=0.26, smooth=False)
    ico(0.15, (0.80, 0.0, 0.44), subdiv=1, mat=M['chipped'], scale=(0.9, 0.30, 1.1), jitter=0.30, smooth=False)  # 깨뜨린 날끝
    _lash(0.40, 0.0, 0.24, (0, math.radians(90), math.radians(84)), ln=0.30, n=3)


def m_crude_pick():
    """조잡한 돌괭이 — 자갈 3 + 잔가지 1 + 풀 2. 뾰족한 자갈을 **가로로** 묶었다(찍는 자세)."""
    #   ⚠도끼와 갈려야 한다: 도끼는 날이 자루와 **한 줄**, 괭이는 자루를 **가로질러** 아래로 찍는다.
    random.seed(721)
    cyl(0.070, 1.46, (-0.22, 0, 0.34), rot=(0, math.radians(86), math.radians(6)), mat=M['bark2'], verts=8)
    ico(0.30, (0.46, 0.30, 0.22), subdiv=1, mat=M['chipped'], scale=(0.60, 1.30, 0.80), jitter=0.26, smooth=False)
    ico(0.16, (0.50, 0.62, 0.06), subdiv=1, mat=M['chipped'], scale=(0.55, 1.35, 0.7), jitter=0.30, smooth=False)  # 찍는 끝
    ico(0.13, (0.42, -0.10, 0.34), subdiv=1, mat=M['chipped'], scale=(0.7, 0.9, 0.7), jitter=0.32, smooth=False)   # 뒤 굄돌
    _lash(0.44, 0.06, 0.30, (0, math.radians(90), math.radians(86)), ln=0.30, n=3)


def m_crude_blade():
    """조잡한 돌칼 — 자갈 2 + 잔가지 1 + 풀 1. 자루가 짧다(가장 가볍고 가장 빨리 닳는다)."""
    #   ⚠1패스는 날이 자루보다 커서 창끝으로 읽혔다. **자루가 절반은 돼야** 칼이다.
    random.seed(722)
    cyl(0.070, 0.80, (-0.40, 0.0, 0.10), rot=(0, math.radians(88), math.radians(8)), mat=M['bark2'], verts=9)
    ico(0.26, (0.20, 0.0, 0.13), subdiv=1, mat=M['chipped'], scale=(1.55, 0.22, 0.62), jitter=0.20, smooth=False)
    ico(0.12, (0.52, 0.0, 0.11), subdiv=1, mat=M['chipped'], scale=(1.7, 0.20, 0.50), jitter=0.24, smooth=False)
    _lash(-0.10, 0.0, 0.12, (0, math.radians(90), math.radians(88)), ln=0.24, n=2, gap=0.085)


def m_axe():
    """도끼 — 통나무 5 + 석재 2. **간석기 합인석부**: 갈아 낸 매끈한 날 + 다듬은 자루 + 새끼 결속.
    조잡한 것과 갈리는 단서는 ⓐ 매끈한 면 ⓑ 좌우 대칭 ⓒ 자루가 다듬어졌다는 것이다."""
    #   ⚠1패스는 날이 넓고 납작해 **삽**으로 읽혔다. 도끼는 ⓐ 자루 **끝**에 ⓑ **쐐기**(등이 두껍고 날이 얇다)
    #     ⓒ 자루보다 **작다**. 셋을 다 지켜야 96px 에서 도끼가 된다.
    random.seed(723)
    cyl(0.066, 1.52, (-0.26, 0, 0.16), rot=(0, math.radians(84), math.radians(10)), mat=M['haft'], verts=10)
    cyl(0.086, 0.30, (0.44, 0, 0.22), rot=(0, math.radians(84), math.radians(10)), mat=M['haft'], verts=10)  # 자루 머리(두껍게 남긴다)
    box(0.30, 0.155, 0.44, (0.60, 0.0, 0.30), rot=(0, math.radians(-8), 0), mat=M['ground'])                  # 날 몸(등이 두껍다)
    box(0.16, 0.055, 0.50, (0.80, 0.0, 0.33), rot=(0, math.radians(-12), 0), mat=M['ground'])                 # 날(얇게 갈아 낸 인부)
    _lash(0.44, 0.0, 0.22, (0, math.radians(90), math.radians(84)), ln=0.28, n=3, mat=M['cord'])


def m_pickaxe():
    """곡괭이 — 통나무 3 + 석재 5. 간석기 **돌괭이**(따비·괭이 계열): 갈아 낸 날을 자루에 **직각**으로."""
    random.seed(724)
    cyl(0.068, 1.50, (-0.24, 0, 0.40), rot=(0, math.radians(87), math.radians(4)), mat=M['haft'], verts=10)
    box(0.185, 0.66, 0.14, (0.46, 0.34, 0.26), rot=(math.radians(-30), 0, 0), mat=M['ground'])   # 넓은 날(자루와 직각)
    box(0.155, 0.30, 0.075, (0.46, 0.70, 0.06), rot=(math.radians(-30), 0, 0), mat=M['ground'])  # 갈아 낸 날끝
    box(0.15, 0.18, 0.16, (0.46, -0.14, 0.40), mat=M['ground'])                                   # 자루에 물린 목
    _lash(0.46, -0.02, 0.38, (math.radians(90), 0, 0), ln=0.30, n=3, mat=M['cord'])


def m_sword():
    """검 — 통나무 2 + 석재 8. **마제석검**: 갈아 만든 나뭇잎꼴 검신 + 등날(척) + 자루.
    ⚠지시서는 '청동검'이라 했는데 `RECIPES.sword` 가 `wood 2 + stone 8` 이라 **정본은 돌**이다(§0-ⓐ).
      그리고 마제석검은 송국리 문화기의 표지 유물이라 고증도 같은 답을 낸다."""
    random.seed(725)
    box(0.30, 0.115, 0.115, (-0.66, 0, 0.10), rot=(0, 0, 0), mat=M['haft'])          # 자루
    box(0.11, 0.30, 0.10, (-0.50, 0, 0.10), mat=M['ground'])                          # 검코(段)
    box(0.62, 0.27, 0.075, (-0.10, 0, 0.10), mat=M['ground'])                         # 검신(아래쪽 — 가장 넓다)
    box(0.52, 0.21, 0.070, (0.44, 0, 0.10), mat=M['ground'])                          # 검신(위쪽 — 좁아진다)
    box(1.12, 0.055, 0.125, (0.10, 0, 0.10), mat=M['ground'])                         # 등날(척) — 마제석검의 표지
    for sgn in (-1, 1):                                                                # 봉부(끝이 좁아진다)
        box(0.30, 0.11, 0.055, (0.72, sgn * 0.055, 0.10), rot=(0, 0, math.radians(-sgn * 9)), mat=M['ground'])
    box(0.13, 0.20, 0.09, (-0.83, 0, 0.10), mat=M['haft'])                            # 자루끝
    _lash(-0.66, 0, 0.10, (0, math.radians(90), 0), r=0.026, ln=0.22, n=3, mat=M['cord'], gap=0.075)


def m_carrier():
    """지게 — 통나무 2 + 풀 2(`EQUIPMENT_RECIPES.carrier`). 가지 두 개를 A 자로 세우고 세장을 지르고
    밀삐(짚 끈)로 동여맸다. ★등에 진 모습은 **캐릭터 시트 규약**이라 여기선 안 만든다(회부)."""
    random.seed(726)
    for sgn in (-1, 1):                                                                # 지겟다리 둘(A 자)
        cyl(0.070, 1.60, (sgn * 0.20, 0.0, 0.80), rot=(0, math.radians(sgn * 7), 0), mat=M['haft'], verts=9)
        cyl(0.058, 0.62, (sgn * 0.40, -0.16, 1.42), rot=(math.radians(70), 0, math.radians(sgn * 26)),
            mat=M['haft'], verts=8)                                                    # 새고자(위로 뻗은 가지)
    for z in (0.42, 0.86, 1.24):                                                       # 세장 셋
        bar(0.046, 0.52, (0.0, 0.0, z), 'x', M['haft'], verts=8)
        for sgn in (-1, 1):
            _lash(sgn * 0.21, 0.0, z, (0, math.radians(90), 0), r=0.026, ln=0.17, n=2, gap=0.07)
    for sgn in (-1, 1):                                                                # 밀삐(짚 끈)
        for k in range(5):
            t = k / 4.0
            cyl(0.030, 0.24, (sgn * (0.21 + 0.07 * math.sin(t * 3.1)), 0.13 + 0.05 * math.sin(t * 3.1),
                              1.16 - t * 0.72), rot=(math.radians(74), 0, 0), mat=M['fiber'], verts=6)
    bar(0.040, 0.44, (0.0, -0.10, 0.20), 'x', M['haft'], verts=8)                       # 목발 받침


def _fish(cooked=False):
    """생선 — 담수 잡어 한 마리(붕어꼴). `cooked=True` 는 **같은 모델**에 구운 살갗·그을음·꼬치.
    ★T67 캐논의 작은 적용: 날것과 구운 것은 **같은 물고기**여야 한다."""
    random.seed(727)
    body = M['grilled'] if cooked else M['scale']
    ico(0.46, (0.0, 0.0, 0.30), subdiv=2, mat=body, scale=(1.85, 0.62, 1.00), jitter=0.05, smooth=True)      # 몸통
    ico(0.20, (0.74, 0.0, 0.30), subdiv=2, mat=body, scale=(1.25, 0.55, 0.80), jitter=0.06, smooth=True)     # 머리
    if not cooked:
        ico(0.44, (-0.02, 0.0, 0.58), subdiv=2, mat=M['dorsal'], scale=(1.72, 0.48, 0.44), jitter=0.05, smooth=True)  # 어두운 등(몸 위로 살짝 나온다)
        ico(0.085, (0.86, -0.115, 0.36), subdiv=2, mat=M['belly'], jitter=0.05, smooth=True)                  # 눈(흰자)
        ico(0.050, (0.90, -0.155, 0.36), subdiv=2, mat=M['scorch'], jitter=0.05, smooth=True)                 # 눈동자
        box(0.05, 0.12, 0.34, (0.60, -0.16, 0.30), rot=(0, math.radians(-8), 0), mat=M['fin'])                # 아가미 뚜껑
        ico(0.40, (-0.06, 0.0, 0.20), subdiv=2, mat=M['belly'], scale=(1.55, 0.45, 0.55), jitter=0.05, smooth=True)
    for sgn in (-1, 1):                                                                          # 꼬리 — 갈퀴 두 갈래
        box(0.40, 0.035, 0.26, (-1.00, 0.0, 0.30 + sgn * 0.20), rot=(0, math.radians(sgn * 40), 0),
            mat=(M['scorch'] if cooked else M['fin']))
    box(0.16, 0.075, 0.16, (-0.84, 0.0, 0.30), mat=(M['scorch'] if cooked else M['fin']))        # 꼬리 밑동
    box(0.44, 0.05, 0.22, (0.02, 0.0, 0.66), rot=(0, math.radians(-12), 0),
        mat=(M['scorch'] if cooked else M['fin']))                                               # 등지느러미
    box(0.20, 0.14, 0.035, (0.30, -0.20, 0.20), rot=(math.radians(34), 0, math.radians(-10)),
        mat=(M['scorch'] if cooked else M['fin']))                                               # 가슴지느러미(작게)
    if cooked:
        cyl(0.038, 2.30, (0.0, 0.10, 0.24), rot=(0, math.radians(90), math.radians(-4)),
            mat=M['bark2'], verts=7)                                                             # 꿴 꼬치
        for (dx, dz) in ((-0.34, 0.52), (0.16, 0.56), (0.46, 0.44), (-0.62, 0.34)):              # 탄 자국
            ico(0.10, (dx, -0.14, dz), subdiv=1, mat=M['scorch'], scale=(1.5, 0.35, 0.8), jitter=0.3, smooth=False)


def m_fish():        _fish(False)
def m_fish_cooked(): _fish(True)


def m_salt():
    """소금 — 1.00kg(`weights` · `salt.CFG.SALT_KG`). 자염으로 졸여 낸 **굵은 결정 무더기**.
    ★96px 는 bbox 를 꽉 채우므로(§0-ⓒ) 작은 물건은 **낱개가 아니라 무더기**로 크기를 말한다."""
    random.seed(728)
    cyl(0.62, 0.09, (0, 0, 0.045), mat=M['clay'], verts=18)                                      # 담아 둔 토기 접시
    for i in range(26):
        a = i * 2.399
        rr = random.uniform(0.05, 0.115)
        d = random.uniform(0, 0.40)
        ico(rr, (math.cos(a) * d, math.sin(a) * d, 0.10 + rr * 0.8 + (0.34 - d) * 0.42),
            subdiv=1, mat=M['saltx'], scale=(1.0, 1.0, 0.85), jitter=0.30, smooth=False)


def m_brine():
    """짠물 — 갯벌에서 뜬 함수 한 되(1.00kg = `salt.CFG.BRINE_KG`).
    ★**물병과 같은 물건**이다: 서버가 `water_bottle` 을 갯벌에서 `brine` 으로 바꾸고 가마가 도로 물병으로 되돌린다.
      그래서 표주박 병 그대로 두고 **속만 뿌연 바닷물**로 그린다(아가리에 소금 앉음)."""
    random.seed(729)
    ico(0.50, (0, 0, 0.46), subdiv=2, mat=M['gourd'], scale=(1.0, 1.0, 1.05), jitter=0.04, smooth=True)       # 아랫통
    ico(0.30, (0, 0, 1.02), subdiv=2, mat=M['gourd'], scale=(1.0, 1.0, 0.95), jitter=0.05, smooth=True)       # 윗통(잘록한 표주박)
    #   ⚠1패스는 마개를 씌워 **속이 안 보였다** — 그러면 그냥 박이다. 아가리를 넓히고 마개를 빼서
    #     찰랑이는 함수를 드러내고, 흘러내린 자국과 앉은 소금으로 "짠물"이라고 말하게 한다.
    cyl(0.235, 0.30, (0, 0, 1.36), mat=M['gourd'], verts=14)                                     # 넓은 아가리
    cyl(0.196, 0.06, (0, 0, 1.492), mat=M['brinew'], verts=14)                                   # 찰랑이는 함수(아가리 전 바로 밑까지 찬다)
    for i in range(6):                                                                            # 아가리 전에 앉은 소금(낮게 — 왕관이 되면 안 된다)
        a = i * 1.05
        ico(0.040, (math.cos(a) * 0.242, math.sin(a) * 0.242, 1.495), subdiv=1, mat=M['saltx'],
            scale=(1.3, 1.3, 0.35), jitter=0.30, smooth=False)
    for (a, ln) in ((0.3, 0.40), (1.9, 0.28), (4.4, 0.34)):                                       # 흘러내린 자국
        cyl(0.030, ln, (math.cos(a) * 0.24, math.sin(a) * 0.24, 1.30 - ln / 2), mat=M['brinew'], verts=6)
    for i in range(3):                                                                            # 목에 감은 끈(들고 다닌다)
        cyl(0.026, 0.34, (0, 0, 1.24 + i * 0.05), rot=(0, math.radians(90), 0), mat=M['cord'], verts=7)


def m_twig():
    """잔가지 — 0.40kg 불쏘시개 한 단. 조잡한 석기의 자루가 되는 그 가지다."""
    random.seed(730)
    for i in range(9):
        a = random.uniform(-0.42, 0.42)
        ln = random.uniform(1.05, 1.55)
        cyl(random.uniform(0.032, 0.056), ln,
            (random.uniform(-0.16, 0.16), random.uniform(-0.20, 0.20), 0.05 + i * 0.045),
            rot=(0, math.radians(90 - random.uniform(0, 7)), a), mat=M['bark2'], verts=6)
        if i % 3 == 0:                                                                            # 곁가지
            cyl(0.026, 0.34, (random.uniform(-0.3, 0.3), random.uniform(-0.2, 0.2), 0.07 + i * 0.045),
                rot=(0, math.radians(84), a + 0.9), mat=M['bark2'], verts=5)
    for z in (0.14, 0.30):                                                                        # 풀로 묶은 단
        for k in range(3):
            cyl(0.028, 0.46, (0.0, -0.02 + k * 0.02, z), rot=(math.radians(90), 0, 0), mat=M['fiber'], verts=6)


def m_pebble():
    """자갈 — 0.60kg 한 줌. 조잡한 석기의 날이 되는 그 돌이다(냇돌 — 모서리가 닳았다)."""
    #   ⚠1패스는 각지고 희어서 **소금 무더기**와 헷갈렸다. 냇돌은 모서리가 닳아 둥글고 색이 어둡다.
    random.seed(731)
    for i in range(11):
        a = i * 2.399
        d = random.uniform(0, 0.44)
        rr = random.uniform(0.13, 0.24)
        ico(rr, (math.cos(a) * d, math.sin(a) * d, rr * 0.72 + (0.10 if i % 3 == 0 else 0.0)),
            subdiv=2, mat=(M['river'] if i % 2 else M['river2']),
            scale=(1.30, 1.05, 0.62), jitter=0.08, smooth=True)


# ★표 — 아이콘 키 = 서버 품목 키. 세계 렌더는 아직 없다(`world` 빈 칸) — 붙일 때 같은 모델을 쓴다.
ITEMS = [
    ('crude_axe', m_crude_axe), ('crude_pick', m_crude_pick), ('crude_blade', m_crude_blade),
    ('axe', m_axe), ('pickaxe', m_pickaxe), ('sword', m_sword), ('carrier', m_carrier),
    ('fish', m_fish), ('fish_cooked', m_fish_cooked), ('salt', m_salt), ('brine', m_brine),
    ('twig', m_twig), ('pebble', m_pebble),
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

ITEM_ONLY = [k for k in os.environ.get('ITEMS_ONLY', '').split(',') if k]
for p in (PROPS if not os.environ.get('SKIP_PROPS') else []):
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

# ── [T72] 손도구·손에 드는 것 — 아이콘만 굽는다(세계 렌더는 다음 카드) ──
_n_items = 0
for (key, fn) in (ITEMS if not os.environ.get('SKIP_ITEMS') else []):
    if ITEM_ONLY and key not in ITEM_ONLY:
        continue
    OBJS.clear()
    fn()
    _bake_transforms()
    render_icon(key)
    cleanup()
    _n_items += 1

json.dump(anchors, open(apath, "w"), indent=1, ensure_ascii=False)
print("[props] DONE ->", OUT_W, len(anchors), "world keys ·", OUT_I, "icons(가구", len(PROPS), "+ 손도구", _n_items, ")")
