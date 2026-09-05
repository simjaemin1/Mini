# nature_render.py — durango-mini 자연물 스프라이트(나무 12종 · 수풀 · 물가 술 · 들꽃)
#   [배치 21 · T97 에서 `render_common` 편입 + bpy 5.0.1 재굽기 · 재민 확정 2026-09-05]
#
# ★★T97 편입 — 이 파일은 씬·헬퍼를 **자기 한 벌** 갖고 있었다(718줄 중 약 150줄).
#   `icon`/`props` 가 T77 에서 겪은 그대로다: 두 벌이면 한쪽만 고쳐지는 날이 온다.
#   ⇒ 씬 값·재질 문법(`principled`·`simple_mat`)·PNG 후처리·프레임 계산은 `render_common` 것,
#     **모델 본문과 재질표 `M` 은 이 파일 것**(T77 §0-ⓒ — 팔레트는 파일마다 다르다).
#   편입 자체는 **그림을 안 바꾼다**: 같은 컨테이너·같은 bpy 로 옛 코드를 구운 대조군과
#   38장 IDAT 동일을 확인한 뒤에야 `sensor_fit` 을 채우고 다시 구웠다(보고 T97 §1).
#
# ★씬·조명 정본은 `render_common` 한 곳:
#   Cycles · film_transparent · ORTHO · 태양 52°/−35° energy 3.6 · 월드 (0.52,0.56,0.6)@0.55 ·
#   SAMPLES 64 · OIDN 부재 자동 감지 · PPU 45.255 · ZSQ 0.8165 · 좌우 FLIP.
#
# ★왜 재렌더였나(재민 확정 "전면 통일"): 기존 나무·수풀은 Kenney 로우폴리 recolor 라
#   배치 19 의 질감 사실풍 지면 위에서 **제일 튄다**. 지면·건물과 같은 씬 정본으로 다시 굽는다.
#
# ★크기 규약 = 1셀 = 1m. 모델은 미터 단위로 짓고, 화면 픽셀은 `render()` 가 PPU·ZSQ 로 환산한다.
#   (1m 높이 = 32 게임px. 성목 3~5m = 96~160 게임px.)
#   고해상 배포: 나무 ppu_mul=4, 소품 ppu_mul=3 — 앵커 JSON 에 실제 ppu 를 적어 **클라가 축소한다**
#   (산 스프라이트 mountain_anchors.json 과 같은 규약). 가구·밭과 규격이 다른 자리다.
#
# 실행:  python3 scripts/nature_render.py [키 필터]      (pip bpy 5.0.1 — 굽는 기계 정본)
#        blender -b -P scripts/nature_render.py -- [키 필터]
# 결과:  scripts/nature_renders/*.png + nature_raw_anchors.json
#        → scripts/nature-postprocess.py 가 알파 bbox 크롭 후 public/assets/ 로 배치
#
# 고증(청동기 후기 송국리): 중부 한반도 온대 낙엽활엽수림 + 소나무.
#   물가는 저습지 — 갈대(Phragmites)·부들(Typha)이 본체다. 버드나무는 물가 수종.

import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_common import *              # 헬퍼·씬 상수·OBJS
import render_common as rc

HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "nature_renders")
os.makedirs(OUTDIR, exist_ok=True)


ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY = set(ARGS) if ARGS else None


# ═══════════════ 결정론 난수 (Math.random 금지 원칙의 파이썬 판 — 시드 고정) ═════════════
class R:
    def __init__(self, seed):
        self.s = (seed * 2654435761) & 0xFFFFFFFF

    def f(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0

    def r(self, a, b):
        return a + (b - a) * self.f()


# ═══════════════ 재질 ═══════════════
def _mix2(nt, fac_out, c1, c2):
    """ColorRamp 기본 2요소만 쓰고(★elements.new() 금지 — 인덱스 재정렬 함정) MixRGB 로 두 색."""
    rmp = nt.nodes.new("ShaderNodeValToRGB")
    rmp.color_ramp.elements[0].position = 0.36
    rmp.color_ramp.elements[1].position = 0.64
    nt.links.new(fac_out, rmp.inputs["Fac"])
    n1 = nt.nodes.new("ShaderNodeRGB"); n1.outputs[0].default_value = (c1[0], c1[1], c1[2], 1)
    n2 = nt.nodes.new("ShaderNodeRGB"); n2.outputs[0].default_value = (c2[0], c2[1], c2[2], 1)
    mx = nt.nodes.new("ShaderNodeMixRGB")
    nt.links.new(rmp.outputs["Color"], mx.inputs["Fac"])
    nt.links.new(n1.outputs[0], mx.inputs["Color1"])
    nt.links.new(n2.outputs[0], mx.inputs["Color2"])
    return mx, rmp


def leaf_mat(name, c1, c2, scale=42.0, rough=0.72, bump=0.32, detail=4.0):
    """잎 무리 — 노이즈 2톤 + 범프. 저해상도에서 '한 덩어리 초록'을 깨는 게 목적."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = detail
    try: nz.inputs["Roughness"].default_value = 0.62
    except Exception: pass
    mx, _ = _mix2(nt, nz.outputs["Fac"], c1, c2)
    nt.links.new(mx.outputs[0], b.inputs["Base Color"])
    bmp = nt.nodes.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = BUMP_DIST      # ★T101 — 5.0 기본값 0.001 되돌림
    nt.links.new(nz.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def bark_mat(name, base, dark, scale=26.0, rough=0.88, bump=0.55, plates=False):
    """수피 — 소나무는 판상(Voronoi), 활엽수는 세로결(Wave)."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = rough
    if plates:
        t = nt.nodes.new("ShaderNodeTexVoronoi")
        t.inputs["Scale"].default_value = scale
        try: t.inputs["Randomness"].default_value = 0.9
        except Exception: pass
        fac = t.outputs["Distance"]
    else:
        t = nt.nodes.new("ShaderNodeTexWave")
        t.inputs["Scale"].default_value = scale
        try: t.inputs["Distortion"].default_value = 4.5
        except Exception: pass
        fac = t.outputs["Fac"]
    mx, _ = _mix2(nt, fac, base, dark)
    nt.links.new(mx.outputs[0], b.inputs["Base Color"])
    bmp = nt.nodes.new("ShaderNodeBump"); bmp.inputs["Strength"].default_value = bump
    bmp.inputs["Distance"].default_value = BUMP_DIST      # ★T101 — 5.0 기본값 0.001 되돌림
    nt.links.new(fac, bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return m


def rock_mat(name, base=(0.22, 0.20, 0.18), moss=False, seed=0):
    """막돌 — `assets-src/legacy_mac/rock_render.py:rock_material` 본문 **그대로**(T101 편입).
    미세 범프 + 대형 굴곡 · 투톤 계단 얼룩 · (이끼) 위쪽 노멀 게이트로 상부 모자만."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = principled(m)
    b.inputs["Roughness"].default_value = 0.95
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 9 + (seed % 3) * 3
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.8
    bump.inputs["Distance"].default_value = BUMP_DIST     # ★T101 — 5.0 기본값 0.001 되돌림
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    big = nt.nodes.new("ShaderNodeTexNoise"); big.inputs["Scale"].default_value = 2.2
    bump2 = nt.nodes.new("ShaderNodeBump"); bump2.inputs["Strength"].default_value = 0.5
    bump2.inputs["Distance"].default_value = BUMP_DIST    # ★T101 — 5.0 기본값 0.001 되돌림
    nt.links.new(big.outputs["Fac"], bump2.inputs["Height"])
    nt.links.new(bump2.outputs["Normal"], bump.inputs["Normal"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    c1 = nt.nodes.new("ShaderNodeRGB"); c1.outputs[0].default_value = (base[0], base[1], base[2], 1)
    c2 = nt.nodes.new("ShaderNodeRGB")
    c2.outputs[0].default_value = (base[0] * 0.45, base[1] * 0.45, base[2] * 0.5, 1)
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = 4.5
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.42; ramp.color_ramp.elements[1].position = 0.62
    nt.links.new(n2.outputs["Fac"], ramp.inputs["Fac"])
    mixc = nt.nodes.new("ShaderNodeMixRGB"); mixc.blend_type = 'MIX'
    nt.links.new(ramp.outputs["Color"], mixc.inputs["Fac"])
    nt.links.new(c2.outputs[0], mixc.inputs["Color1"])
    nt.links.new(c1.outputs[0], mixc.inputs["Color2"])
    out_color = mixc.outputs["Color"]
    if moss:
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


# ═══════════════ 씬 — 정본 한 곳(`render_common.build_scene`) ═══════════════
scene, cam, cam_d, sun, tgt = rc.build_scene("nat")


# ═══════════════ 기하 헬퍼 ═══════════════
def add_mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate(verbose=False); me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene.collection.objects.link(ob)
    try:
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    except Exception:
        pass
    OBJS.append(ob)
    return ob


def tube(pts, radii, mat, seg=7, name="tube", cap=True):
    """폴리라인을 따라 테이퍼 원통 — 줄기·가지·대."""
    verts = []; faces = []
    n = len(pts)
    P = [V(p) for p in pts]
    for i in range(n):
        d = (P[i + 1] - P[i]) if i < n - 1 else (P[i] - P[i - 1])
        if d.length < 1e-6: d = V((0, 0, 1))
        d = d.normalized()
        ref = V((0, 0, 1)) if abs(d.z) < 0.94 else V((1, 0, 0))
        a = d.cross(ref).normalized(); b = d.cross(a).normalized()
        r = radii[i]
        for k in range(seg):
            th = 2 * math.pi * k / seg
            verts.append(P[i] + a * (r * math.cos(th)) + b * (r * math.sin(th)))
    for i in range(n - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append([i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k])
    if cap:
        verts.append(P[-1]); ti = len(verts) - 1
        base = (n - 1) * seg
        for k in range(seg):
            faces.append([base + k, base + (k + 1) % seg, ti])
    return add_mesh(name, verts, faces, mat)


def arc_pts(base, tip, bow, n=7):
    """base→tip 2차 베지어. bow = 제어점을 '수직 위'로 얼마나 띄우나(0=직선)."""
    b = V(base); t = V(tip)
    c = (b + t) * 0.5 + V((0, 0, 1)) * bow
    out = []
    for i in range(n):
        s = i / (n - 1.0)
        p = b * (1 - s) ** 2 + c * (2 * (1 - s) * s) + t * (s * s)
        out.append(p)
    return out


def blade(base, heading, height, reach, width, mat, rng, fold=0.32, seg=7, name="blade"):
    """풀·부들 잎 — 접힌(V) 리본. 아래에서 수직으로 나가 끝이 바깥으로 휜다."""
    dirh = V((math.cos(heading), math.sin(heading), 0.0))
    tip = V(base) + dirh * reach + V((0, 0, height))
    pts = arc_pts(base, tip, height * 0.55, seg)
    side = V((-dirh.y, dirh.x, 0.0))
    verts = []; faces = []
    for i, p in enumerate(pts):
        s = i / (seg - 1.0)
        w = width * max(0.06, (1.0 - s) ** 0.55) * (1.0 + 0.25 * math.sin(s * 3.1))
        verts.append(p - side * w)
        verts.append(p + side * (0.14 * w) + V((0, 0, 1)) * (w * fold))   # 접힌 등
        verts.append(p + side * w)
    for i in range(seg - 1):
        a0 = i * 3
        b0 = (i + 1) * 3
        faces.append([a0, a0 + 1, b0 + 1, b0])
        faces.append([a0 + 1, a0 + 2, b0 + 2, b0 + 1])
    return add_mesh(name, verts, faces, mat)


def leaf_shell(center, R, n, lw, ll, mat, rng, squash=1.0, droop=0.30, rmin=0.52,
               name="leaves", tilt=0.55):
    """★잎 카드 껍질 — 캐노피의 본체.
    변위 이코스피어만 쓰면 저해상도에서 **초록 베개**가 된다(1패스 실측 — 실루엣이 매끈한 공).
    실제 잎처럼 **작은 카드 수백 장**을 껍질에 흩뿌려야 가장자리가 잎 단위로 헤어지고
    빛이 장마다 달리 들어 질감이 산다. 카드는 전부 **한 메시**로 합쳐 렌더 비용을 낮춘다."""
    verts = []; faces = []
    C = V(center)
    for i in range(n):
        # 구면 균일 분포
        z0 = rng.r(-1, 1); ph = rng.r(0, 6.2832); s0 = math.sqrt(max(0.0, 1 - z0 * z0))
        d = V((s0 * math.cos(ph), s0 * math.sin(ph), z0))
        r = R * (rmin + (1.0 - rmin) * rng.f() ** 0.62)
        c = C + V((d.x * r, d.y * r, d.z * r * squash))
        # ★잎 '면'이 바깥(위)을 봐야 한다 — 1패스 결함: 길이축을 d 로 잡는 바람에 카드 **법선이
        #   옆을 봐서** 위에서 오는 태양을 못 받고 캐노피가 통째로 납작·어둡게 나왔다.
        #   법선 n = 바깥방향 + 처짐, 길이·폭축은 n 에 수직인 평면 안에서 임의 회전.
        n = (d + V((rng.r(-tilt, tilt) * 0.5, rng.r(-tilt, tilt) * 0.5, -droop * 0.5))).normalized()
        ref = V((0, 0, 1)) if abs(n.z) < 0.93 else V((1, 0, 0))
        t1 = n.cross(ref).normalized(); t2 = n.cross(t1).normalized()
        ang = rng.r(0, 6.2832)
        e1 = (t1 * math.cos(ang) + t2 * math.sin(ang)).normalized()   # 길이축
        e2 = n.cross(e1).normalized()                                  # 폭축
        e3 = n                                                         # 면 법선(접힘용)
        l = ll * rng.r(0.7, 1.3); w = lw * rng.r(0.7, 1.3)
        b = len(verts)
        verts.append(c - e1 * (l * 0.42))
        verts.append(c + e2 * (w * 0.5) - e1 * (l * 0.10) + e3 * (w * 0.22))
        verts.append(c + e1 * (l * 0.58))
        verts.append(c - e2 * (w * 0.5) - e1 * (l * 0.10) - e3 * (w * 0.22))
        faces.append([b, b + 1, b + 2, b + 3])
    return add_mesh(name, verts, faces, mat)


def blob(loc, radius, mat, rng, squash=1.0, disp=0.22, sub=3, name="blob"):
    """잎 무리 덩어리 — 이코스피어 + 구름 변위. 잎 카드 껍질 **안쪽의 어두운 속**으로만 쓴다."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=radius, location=tuple(loc))
    ob = bpy.context.object
    ob.name = name
    ob.scale = (1.0, 1.0, squash)
    ob.rotation_euler = (rng.r(0, 6.28), rng.r(0, 6.28), rng.r(0, 6.28))
    tex = bpy.data.textures.new(name + "_t", 'CLOUDS')
    tex.noise_scale = radius * rng.r(0.55, 0.85)
    tex.noise_depth = 3
    md = ob.modifiers.new("disp", 'DISPLACE')
    md.texture = tex
    md.strength = radius * disp
    md.mid_level = 0.42
    bpy.ops.object.modifier_apply(modifier=md.name)
    ob.data.materials.append(mat)
    try:
        ob.data.polygons.foreach_set("use_smooth", [True] * len(ob.data.polygons))
    except Exception:
        pass
    OBJS.append(ob)
    return ob

# ═══════════════ 렌더 ═══════════════
def render(key, ss, margin=6):
    """OBJS 전체를 굽는다. 프레임은 화면 bbox 에 딱 맞추고, 지면 원점(0,0,0)의 픽셀좌표를 앵커로.

    ★`ss` 는 **출력 픽셀 밀도 배수**다(초과표본이 아니다 — T97 에서 이름이 갈렸다).
      나무 4 · 소품 3 으로 구워 그대로 배포하고, 클라가 앵커의 `ppu` 로 되돌려 줄인다."""
    rc.bake_transforms()
    # ★★[T129] **땅속 금지** — 굽기 전에 정점 z 를 본다.
    #   T129 3패스에서 머루 송이가 **알 42자리 중 40이 지면 아래**로 내려갔다(최저 −1.26m).
    #   그림만 보면 "잎 아래 매달린 송이"로 잘 보였고, 앵커의 "지면 아래 화소"도 확증이 못 된다 —
    #   등축 투영에서는 **지면 위의 먼 점도 원점보다 아래로** 찍히기 때문이다(90.8px 이 그 경우다).
    #   ⇒ 화소로 못 재는 것은 **기하로 잰다.** 여기가 그 자리다(굽는 쪽만 정점을 안다).
    _under = 0
    for _o in OBJS:
        if not getattr(_o, 'data', None) or not hasattr(_o.data, 'vertices'):
            continue
        for _v in _o.data.vertices:
            if (_o.matrix_world @ _v.co).z < -0.02:
                _under += 1
    if _under:
        raise SystemExit(f"[nat] ★{key}: 지면 아래 정점 {_under}개 — 땅에 박히는 그림은 안 굽는다")
    rc.squash_z()                       # ★z 압축은 오브젝트 scale 이 아니라 **정점 좌표**로
    p = os.path.join(OUTDIR, key + ".png")
    rec = rc.render_world_pass(OBJS, p, margin=margin, ppu_mul=ss, ss=1)
    print(f"[nat] {key}: {rec['w']}x{rec['h']} anchor=({rec['ox']:.1f},{rec['oy']:.1f}) ppu={rec['ppu']:.3f}")
    return rec


# ═══════════════ 재질 팔레트 ═══════════════
# ★색 기준: 배치 19 지면 질감(초록 #5f7a45 계열)·건물 이엉(#c9a martian) 과 나란히 놓았을 때
#   튀지 않는 채도. 로우폴리 형광 초록(Kenney 원본 0.25,0.75,0.30)에서 **탈채도**가 핵심이다.
M = {}
# ★★색 보정(실측 A/B 1패스): 월드 앰비언트가 청회색(0.52,0.56,0.6)이라 **파랑이 들어와 회색빛으로 뜬다**.
#   1패스 실측 — 새 나무 평균 RGB (72,89,62) vs 지면 질감 grass_angled (64,82,47).
#   B 가 15 높아 "탈색된 초록"이 됐다. sRGB 인코딩이 낮은 채널을 크게 들어올리므로
#   **재질 알베도의 파랑을 0.6배, 초록을 1.15배**로 되민다(월드·태양 정본은 손대지 않는다).
def _fix(c):
    return (min(1.0, c[0] * 1.48), min(1.0, c[1] * 1.66), c[2] * 0.74)
M['bark_pine'] = bark_mat("bark_pine", (0.44, 0.23, 0.12), (0.25, 0.12, 0.06), 30.0, 0.9, 0.6, plates=True)
M['bark_oak'] = bark_mat("bark_oak", (0.32, 0.26, 0.16), (0.17, 0.13, 0.08), 22.0, 0.92, 0.62)
M['bark_chest'] = bark_mat("bark_chest", (0.35, 0.28, 0.17), (0.20, 0.15, 0.09), 26.0, 0.9, 0.55)
M['bark_wil'] = bark_mat("bark_wil", (0.34, 0.28, 0.15), (0.19, 0.15, 0.08), 34.0, 0.9, 0.6)
M['bark_jat'] = bark_mat("bark_jat", (0.31, 0.21, 0.11), (0.18, 0.11, 0.06), 26.0, 0.9, 0.55, plates=True)
M['nd_pine'] = leaf_mat("nd_pine", _fix((0.18, 0.31, 0.14)), _fix((0.10, 0.20, 0.09)), 55.0, 0.78, 0.45)
M['nd_jat'] = leaf_mat("nd_jat", _fix((0.23, 0.35, 0.18)), _fix((0.14, 0.24, 0.12)), 60.0, 0.8, 0.45)
M['lf_oak'] = leaf_mat("lf_oak", _fix((0.24, 0.36, 0.13)), _fix((0.13, 0.23, 0.09)), 40.0, 0.72, 0.36)
M['lf_chest'] = leaf_mat("lf_chest", _fix((0.30, 0.42, 0.15)), _fix((0.17, 0.28, 0.10)), 38.0, 0.7, 0.34)
M['lf_wil'] = leaf_mat("lf_wil", _fix((0.36, 0.45, 0.17)), _fix((0.22, 0.32, 0.11)), 44.0, 0.7, 0.3)
# 캐노피 속 — 잎 카드 사이로 비치는 그늘. ★밝으면 '매끈한 초록 공'이 그대로 보인다(1패스 결함).
M['in_dark'] = leaf_mat("in_dark", _fix((0.09, 0.14, 0.06)), _fix((0.05, 0.08, 0.04)), 30.0, 0.85, 0.2)

# ═══════════ [T129] 열매종 셋 · 가을 잎 넷 · 열매 넷 · 그루터기 ═══════════
# ★새 색을 아무렇게나 짓지 않는다 — 기존 다섯 종의 값을 **자로 삼는다**:
#   수피 밝기는 0.31~0.44 · 잎 알베도는 `_fix()` 를 통과한 (0.18~0.36, 0.31~0.45, 0.13~0.18) 띠 안.
#   그 띠를 벗어나면 새 나무만 화면에서 튄다(배치 21 이 로우폴리 형광 초록을 탈채도한 그 이유).
M['bark_haz'] = bark_mat("bark_haz", (0.38, 0.30, 0.19), (0.22, 0.17, 0.10), 30.0, 0.90, 0.50)   # 개암 — 매끈한 회갈
M['bark_mul'] = bark_mat("bark_mul", (0.36, 0.27, 0.15), (0.21, 0.15, 0.08), 24.0, 0.90, 0.58)   # 산뽕 — 세로로 갈라진 회갈
M['bark_vine'] = bark_mat("bark_vine", (0.33, 0.25, 0.14), (0.19, 0.14, 0.07), 40.0, 0.92, 0.62)  # 머루 덩굴 — 가늘고 껍질이 벗는다
M['lf_haz'] = leaf_mat("lf_haz", _fix((0.27, 0.39, 0.14)), _fix((0.15, 0.26, 0.09)), 36.0, 0.72, 0.34)   # 개암 — 둥근 잎
M['lf_mul'] = leaf_mat("lf_mul", _fix((0.29, 0.43, 0.16)), _fix((0.16, 0.29, 0.10)), 34.0, 0.66, 0.32)   # 산뽕 — 윤 나는 잎
M['lf_vine'] = leaf_mat("lf_vine", _fix((0.22, 0.34, 0.12)), _fix((0.12, 0.22, 0.08)), 30.0, 0.74, 0.36)  # 머루 — 크고 짙은 잎
# ★가을 잎 — **초록을 노랑·붉은 쪽으로 돌린 같은 잎**이다(다른 잎이 아니다).
#   `_fix()` 는 청회색 앰비언트를 되미는 보정이라 가을 색에도 그대로 통과시킨다(색계 하나).
M['lf_chest_a'] = leaf_mat("lf_chest_a", _fix((0.52, 0.40, 0.12)), _fix((0.34, 0.24, 0.08)), 38.0, 0.72, 0.34)  # 밤 — 노란 갈
M['lf_haz_a'] = leaf_mat("lf_haz_a", _fix((0.55, 0.42, 0.13)), _fix((0.36, 0.26, 0.09)), 36.0, 0.72, 0.34)      # 개암 — 노랑
M['lf_mul_a'] = leaf_mat("lf_mul_a", _fix((0.58, 0.45, 0.11)), _fix((0.38, 0.28, 0.08)), 34.0, 0.68, 0.32)      # 산뽕 — 밝은 노랑
# ★[T129 2패스] 머루 단풍만 `_fix()` 를 **안 통과시킨다.** `_fix` 는 초록을 ×1.66 으로 되미는
#   보정이라(청회색 앰비언트 대책) 붉은 잎에 걸면 **주황**이 된다 — 1패스가 그랬다.
#   보정의 뜻은 "초록이 회색으로 뜨는 것을 막는다"이지 "모든 색을 밀어라"가 아니다.
M['lf_vine_a'] = leaf_mat("lf_vine_a", (0.50, 0.15, 0.16), (0.31, 0.08, 0.10), 30.0, 0.74, 0.36)    # 머루 — 붉은 자주
# ★열매 — 실루엣이 작아 **명도 대비**로 읽힌다(64px 밖에서 보는 그림이 아니라 나무에 달린 점이다).
# ★[T129 2패스] 밤송이를 **어둡게** 바꿨다. 1패스의 연녹(0.44,0.44,0.16)은 가을 노란 잎과
#   명도가 겹쳐 대조표에서 **안 보였다**. 가을 밤송이는 실제로도 갈색으로 벌어진다.
M['fr_burr'] = leaf_mat("fr_burr", _fix((0.26, 0.21, 0.06)), _fix((0.15, 0.12, 0.03)), 70.0, 0.86, 0.55)   # 밤송이 — 벌어진 갈색 가시
M['fr_chest'] = bark_mat("fr_chest", (0.36, 0.18, 0.08), (0.22, 0.10, 0.04), 40.0, 0.55, 0.30)             # 밤 알 — 짙은 밤빛
M['fr_haz'] = bark_mat("fr_haz", (0.55, 0.38, 0.18), (0.36, 0.24, 0.10), 34.0, 0.60, 0.28)                 # 개암 — 밝은 견과
# ★[T129 3패스] 개암은 **초록 총포(總苞)에 싸여 달린다** — 고증이자 대비다.
#   가을 노란 잎 위의 밝은 갈색 견과는 실제 게임 크기에서 묻혔다(1배 대조표 실측).
#   총포가 초록이면 노란 잎과 갈린다 — 색을 지어낸 게 아니라 **원래 그렇게 달린다**.
M['fr_hazbract'] = leaf_mat("fr_hazbract", _fix((0.20, 0.33, 0.11)), _fix((0.11, 0.21, 0.07)), 46.0, 0.74, 0.40)
M['fr_mul'] = bark_mat("fr_mul", (0.20, 0.07, 0.16), (0.11, 0.04, 0.09), 30.0, 0.42, 0.35)                 # 오디 — 검붉은 자주
M['fr_grape'] = bark_mat("fr_grape", (0.14, 0.10, 0.22), (0.07, 0.05, 0.13), 26.0, 0.36, 0.30)             # 머루 — 청흑
M['wood_cut'] = bark_mat("wood_cut", (0.66, 0.54, 0.35), (0.50, 0.40, 0.24), 90.0, 0.72, 0.35)             # 자른 면 — 나이테
M['grass'] = leaf_mat("grass", _fix((0.30, 0.42, 0.16)), _fix((0.18, 0.30, 0.11)), 30.0, 0.72, 0.25)
M['grass_dry'] = leaf_mat("grass_dry", _fix((0.46, 0.44, 0.20)), _fix((0.30, 0.31, 0.14)), 30.0, 0.74, 0.25)
M['reed_leaf'] = leaf_mat("reed_leaf", _fix((0.30, 0.40, 0.15)), _fix((0.19, 0.29, 0.10)), 26.0, 0.74, 0.22)
M['reed_stem'] = simple_mat("reed_stem", _fix((0.34, 0.36, 0.14)), 0.85)
M['reed_plume'] = leaf_mat("reed_plume", _fix((0.50, 0.42, 0.26)), _fix((0.34, 0.27, 0.18)), 70.0, 0.85, 0.5)
M['cat_leaf'] = leaf_mat("cat_leaf", _fix((0.24, 0.36, 0.14)), _fix((0.14, 0.25, 0.09)), 24.0, 0.72, 0.22)
M['cat_spike'] = leaf_mat("cat_spike", (0.36, 0.20, 0.07), (0.24, 0.13, 0.04), 90.0, 0.9, 0.55)
M['bush_leaf'] = leaf_mat("bush_leaf", _fix((0.22, 0.34, 0.13)), _fix((0.12, 0.22, 0.08)), 46.0, 0.72, 0.36)
M['berry'] = simple_mat("berry", (0.48, 0.05, 0.05), 0.35)
M['herb_leaf'] = leaf_mat("herb_leaf", _fix((0.28, 0.40, 0.15)), _fix((0.16, 0.27, 0.10)), 40.0, 0.7, 0.3)
FLOWER_COLS = {
    'w': (0.92, 0.90, 0.78),   # 개망초·구절초 흰꽃
    'y': (0.92, 0.74, 0.16),   # 민들레·마타리 노랑
    'p': (0.60, 0.38, 0.62),   # 쑥부쟁이 연보라
    'r': (0.74, 0.20, 0.20),   # 패랭이 붉은꽃
}
for k, c in FLOWER_COLS.items():
    M['fl_' + k] = simple_mat("fl_" + k, c, 0.55)


# ═══════════════ 나무 ═══════════════
def trunk_curve(h, lean, bend, seed, rbase, rtop, sway=0.0):
    rng = R(seed)
    n = 7
    pts = []; rad = []
    for i in range(n):
        s = i / (n - 1.0)
        x = lean * s * s + sway * math.sin(s * 3.6) * 0.5
        y = bend * s * s * 0.8 + sway * math.cos(s * 2.9) * 0.35
        pts.append((x, y, h * s))
        rad.append(rbase + (rtop - rbase) * s ** 0.75)
    return pts, rad


def tree_pine(seed, h=3.6, spread=1.9):
    """소나무(Pinus densiflora) — 굽은 줄기 · 위로 몰린 판상 우산 수관 · 붉은 판상 수피."""
    rng = R(seed)
    lean = rng.r(-0.45, 0.45); bend = rng.r(-0.34, 0.34)
    pts, rad = trunk_curve(h, lean, bend, seed, 0.145, 0.045, sway=rng.r(0.06, 0.20))
    tube(pts, rad, M['bark_pine'], name="pine_trunk")
    top = V(pts[-1])
    nb = 5 + (1 if rng.f() > 0.4 else 0)
    plates = []
    for i in range(nb):
        th = rng.r(-0.5, 0.5) + i * 6.2832 / nb
        s0 = rng.r(0.72, 0.99)
        base = V(pts[0]) + (top - V(pts[0])) * s0
        rr = spread * rng.r(0.42, 0.80)
        tip = base + V((math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.02, 0.11)))
        tube(arc_pts(base, tip, h * 0.05, 5), [0.062, 0.052, 0.042, 0.032, 0.022],
             M['bark_pine'], seg=5, name="pine_br")
        plates.append((tip, rr))
    # 판상 솔잎 — 납작한 원반 껍질(가늘고 긴 카드 = 솔잎 다발)
    for (tip, rr) in plates:
        pr = spread * rng.r(0.52, 0.70)
        blob(tip + V((0, 0, 0.05)), pr * 0.42, M['in_dark'], rng, squash=0.34, disp=0.34, sub=2, name="pine_in")
        leaf_shell(tip + V((0, 0, 0.05)), pr, int(430 + 260 * rng.f()), 0.045, 0.30,
                   M['nd_pine'], rng, squash=0.42, droop=0.18, rmin=0.16, tilt=0.85, name="pine_nd")
    tr = spread * rng.r(0.70, 0.88)
    blob(top + V((0, 0, tr * 0.30)), tr * 0.42, M['in_dark'], rng, squash=0.42, disp=0.32, sub=2, name="pine_tin")
    leaf_shell(top + V((0, 0, tr * 0.30)), tr, 560, 0.045, 0.30, M['nd_pine'], rng,
               squash=0.52, droop=0.18, rmin=0.16, tilt=0.85, name="pine_top")


def tree_jat(seed, h=4.2, spread=1.35):
    """잣나무(Pinus koraiensis) — 곧은 줄기 · 원뿔 수관 · 짙은 청록."""
    rng = R(seed)
    pts, rad = trunk_curve(h, rng.r(-0.1, 0.1), rng.r(-0.08, 0.08), seed, 0.13, 0.035)
    tube(pts, rad, M['bark_jat'], name="jat_trunk")
    tiers = 5
    for i in range(tiers):
        s = 0.20 + 0.74 * (i / (tiers - 1.0))
        z = h * s
        r = spread * (1.0 - s) ** 0.75 * rng.r(0.92, 1.12) + 0.14
        cen = (rng.r(-0.08, 0.08), rng.r(-0.08, 0.08), z + r * 0.24)
        blob(cen, r * 0.40, M['in_dark'], rng, squash=0.56, disp=0.3, sub=2, name="jat_in")
        leaf_shell(cen, r, int(300 + 240 * (1.1 - s)), 0.042, 0.26, M['nd_jat'], rng,
                   squash=0.55, droop=0.36, rmin=0.14, tilt=0.8, name="jat_t")
    leaf_shell((0, 0, h + 0.14), spread * 0.26, 130, 0.042, 0.26, M['nd_jat'], rng,
               squash=1.0, droop=0.12, rmin=0.1, name="jat_tip")


def tree_oak(seed, h=4.0, spread=2.1):
    """참나무(Quercus) — 굵고 짧은 줄기 · 넓게 퍼진 둥근 수관 · 짙은 초록."""
    rng = R(seed)
    pts, rad = trunk_curve(h * 0.48, rng.r(-0.28, 0.28), rng.r(-0.22, 0.22), seed, 0.22, 0.12)
    tube(pts, rad, M['bark_oak'], name="oak_trunk")
    fork = V(pts[-1])
    tips = []
    for i in range(4):
        th = i * 1.5708 + rng.r(-0.45, 0.45)
        rr = spread * rng.r(0.40, 0.68)
        tip = fork + V((math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.22, 0.38)))
        tube(arc_pts(fork, tip, h * 0.09, 5), [0.105, 0.088, 0.07, 0.05, 0.034],
             M['bark_oak'], seg=6, name="oak_br")
        tips.append((tip, rr))
    for (tip, rr) in tips:
        cr = spread * rng.r(0.40, 0.54)
        cen = tip + V((0, 0, cr * 0.30))
        blob(cen, cr * 0.42, M['in_dark'], rng, squash=0.86, disp=0.3, sub=2, name="oak_in")
        leaf_shell(cen, cr, int(560 + 260 * rng.f()), 0.125, 0.20, M['lf_oak'], rng,
                   squash=0.86, droop=0.34, rmin=0.18, name="oak_cl")
    cr = spread * rng.r(0.52, 0.64)
    cen = fork + V((0, 0, h * 0.40))
    blob(cen, cr * 0.42, M['in_dark'], rng, squash=0.76, disp=0.3, sub=2, name="oak_tin")
    leaf_shell(cen, cr, 720, 0.125, 0.20, M['lf_oak'], rng, squash=0.76, droop=0.30, rmin=0.18, name="oak_top")


# ═══════════════ [T129] 열매 · 가을 판 문법 ═══════════════
# ★★**열매는 나무를 다시 짓지 않는다.** 가을 판은 같은 빌더를 같은 씨앗으로 부른 뒤
#   ⓐ 잎 재질만 갈고 ⓑ 열매를 **얹는다**. 그래서 여름 판과 가을 판의 **실루엣이 같다** —
#   같은 나무가 철이 바뀐 것이지 다른 나무가 아니다(T67 캐논: 물건 하나 = 모델 하나).
# ★★열매 자리는 **제 난수 줄기**를 쓴다(`R(fseed)`). 나무를 짓는 `rng` 를 건드리면
#   열매를 다는 순간 **수관이 흔들려** 여름 판과 실루엣이 갈린다 — 파티클이 모델을 바꾸는 셈이다.
#   ⇒ 결정론은 "씨앗을 박았다"로 끝나지 않는다. **누구의 난수를 쓰는가**까지가 결정론이다.
# ★[T129] `T129_NOFRUIT=1` — **가을 잎만** 굽는 대조군 손잡이. 배포용이 아니라 **재는 자**다:
#   "열매가 보이는가"는 가을 판을 혼자 봐서는 못 잰다(잎도 같이 노래졌으니까).
#   같은 나무의 **열매 없는 가을 판**과 견줘야 열매 몫만 남는다(T97 이후 쓰는 대조군 문법).
NOFRUIT = os.environ.get('T129_NOFRUIT') == '1'


def _fruit_cluster(center, R_, fseed, kind='burr', n=None):
    """수관 껍질 **바깥**에 열매를 흩뿌린다 — 매달린 것이므로 아래쪽으로 당긴다."""
    if NOFRUIT:
        return
    rng = R(fseed)
    spec = {                       # kind: (개수, 반지름, 재질, 아래로 당김)
        'burr':  (11, 0.105, M['fr_burr'],  0.30),   # 밤송이 — 가시 공
        'haz':   (12, 0.062, M['fr_haz'],   0.24),   # 개암 — 작은 견과
        'mul':   (20, 0.042, M['fr_mul'],   0.30),   # 오디 — 잘고 많다
        'grape': (7,  0.000, M['fr_grape'], 0.55),   # 머루 — 송이라 따로 짓는다(잎 더미 아래로)
    }[kind]
    cnt = n if n is not None else spec[0]
    for i in range(cnt):
        # ★★[T129 2패스 · 눈이 잡았다] 1패스는 `r = R_·0.72~0.98` 이라 열매가 **잎 껍질 안**에
        #   묻혔다 — 대조표를 보니 밤이 하나도 안 보였다(카드의 실기 1줄이 바로 그것이다).
        #   `leaf_shell` 의 카드는 `rmin~1.0` 껍질에 깔리므로 열매는 그 **바깥**이어야 한다.
        #   ⇒ ⓐ 반지름을 1.02~1.16 으로 밀어내고 ⓑ 아래쪽(`z0` 하한 −0.9)에 더 두고
        #     ⓒ 수관 아래로 당긴다(열매는 매달린다 — 위로 솟지 않는다).
        z0 = rng.r(-0.90, 0.35); ph = rng.r(0, 6.2832)
        s0 = math.sqrt(max(0.0, 1 - z0 * z0))
        d = V((s0 * math.cos(ph), s0 * math.sin(ph), z0))
        r = R_ * rng.r(1.02, 1.16)
        c = V(center) + V((d.x * r, d.y * r, d.z * r * 0.8 - R_ * spec[3]))
        # ★★[T129 5패스] **열매는 땅 위에 있어야 한다.** 4패스는 매다는 길이만 잘랐는데,
        #   자리를 잡는 `c` 자체가 이미 지면 밑으로 내려가 있었다(수관 중심이 낮은 머루에서).
        #   ⇒ 자리부터 바닥을 친다. 앵커 표가 이걸 잡았다(§3 표 · 다른 나무는 11~19px 인데
        #     `tree15_a` 만 지면 아래 200px 이었다).
        FLOOR = 0.42 if kind == 'grape' else 0.22
        if c.z < FLOOR:
            c = V((c.x, c.y, FLOOR))
        if kind == 'grape':
            _grape_bunch(c, rng)
        elif kind == 'burr':
            # 밤송이 — 공 하나 + 가시 카드 몇 장(가시가 없으면 그냥 초록 알이다)
            blob(c, spec[1], spec[2], rng, squash=0.92, disp=0.30, sub=2, name="ch_burr")
            leaf_shell(c, spec[1] * 1.5, 26, 0.010, 0.075, spec[2], rng,
                       squash=0.9, droop=0.0, rmin=0.72, tilt=1.0, name="ch_spine")
        elif kind == 'haz':
            blob(c, spec[1], spec[2], rng, squash=0.9, disp=0.16, sub=2, name="haz_nut")
            # 초록 총포 — 견과를 감싼 잎턱. 노란 가을 잎 위에서 견과를 **띄워 준다**.
            leaf_shell(c, spec[1] * 1.7, 14, 0.055, 0.10, M['fr_hazbract'], rng,
                       squash=0.9, droop=0.15, rmin=0.65, tilt=0.9, name="haz_bract")
        else:
            blob(c, spec[1], spec[2], rng, squash=0.9, disp=0.16, sub=2, name=kind + "_fr")


def _grape_bunch(top, rng):
    """머루 송이 — 알을 원뿔로 쌓는다(위가 넓고 아래로 뾰족). 알 하나짜리는 열매로 안 읽힌다.

    ★★[T129 3패스] 1배 대조표에서 **송이가 붉은 잎에 묻혔다**(짙은 자주 ↔ 짙은 붉은 잎).
      색을 밝히는 대신 **자리를 옮겼다** — 머루 송이는 원래 잎 더미 *아래로* 늘어진다.
      배경(빈 곳)을 등지면 어두운 알이 오히려 또렷해진다. 크기도 한 단 키웠다."""
    # ★★[T129 4패스 · 앵커가 잡았다] 3패스는 송이를 **땅 밑까지** 늘어뜨렸다.
    #   눈으로는 "잎 아래 매달린 송이"로 잘 보였는데, 앵커 표를 재니 `tree15_a` 만
    #   **지면 원점 아래 200.7px**(다른 나무는 11~19px = 밑동 퍼짐의 정상 범위)이었다.
    #   게임에서 그대로 그리면 **송이가 땅에 박힌다.** ⇒ 매다는 길이를 지면까지로 자른다.
    #   ⓘ 그림만 보고 통과시켰으면 못 잡았다 — **앵커도 그림의 일부**다.
    L = rng.r(0.30, 0.42)
    top = V(top)
    L = max(0.10, min(L, top.z - 0.18))          # 송이 끝이 지면 위 0.18m 에서 멈춘다
    rows = 6
    for k in range(rows):
        t = k / (rows - 1.0)
        rr = 0.072 * (1.0 - 0.72 * t)
        m = max(1, int(round(5 * (1.0 - 0.68 * t))))
        for j in range(m):
            a = j * 6.2832 / m + rng.r(-0.3, 0.3)
            c = V(top) + V((math.cos(a) * rr, math.sin(a) * rr, -L * t))
            blob(c, 0.034, M['fr_grape'], rng, squash=1.0, disp=0.10, sub=1, name="gr_berry")


def tree_hazel(seed, h=2.8, spread=1.55, autumn=False):
    """개암나무(Corylus heterophylla) — **뿌리에서 여러 대가 올라오는 관목형 나무**.
    실루엣의 표식은 굵은 줄기 하나가 없다는 것이다 — 참나무 옆에 두면 그것으로 갈린다."""
    rng = R(seed)
    LF = M['lf_haz_a'] if autumn else M['lf_haz']
    ns = 4 + (1 if rng.f() > 0.45 else 0)
    for i in range(ns):
        th = i * 6.2832 / ns + rng.r(-0.35, 0.35)
        lean = rng.r(0.22, 0.46)
        hh = h * rng.r(0.78, 1.06)
        base = V((math.cos(th) * 0.07, math.sin(th) * 0.07, 0.0))
        tip = base + V((math.cos(th) * spread * rng.r(0.30, 0.46), math.sin(th) * spread * rng.r(0.30, 0.46), hh))
        pp = arc_pts(base, tip, hh * 0.10, 6)
        tube(pp, [0.058, 0.050, 0.042, 0.034, 0.026, 0.018], M['bark_haz'], seg=6, name="hz_st")
        cr = spread * rng.r(0.34, 0.46)
        cen = tip + V((0, 0, cr * 0.24))
        blob(cen, cr * 0.40, M['in_dark'], rng, squash=0.90, disp=0.30, sub=2, name="hz_in")
        leaf_shell(cen, cr, int(420 + 200 * rng.f()), 0.105, 0.17, LF, rng,
                   squash=0.90, droop=0.34, rmin=0.20, name="hz_cl")
        if autumn:
            _fruit_cluster(cen, cr, seed * 17 + i * 31 + 3, kind='haz', n=4)


def tree_mulberry(seed, h=3.4, spread=1.90, autumn=False):
    """산뽕나무(Morus bombycis) — 짧은 줄기에서 **옆으로 벌어지는 성근 수관** · 윤 나는 잎.
    참나무보다 낮고 성글다 — 그 틈으로 하늘이 보이는 것이 표식이다."""
    rng = R(seed)
    LF = M['lf_mul_a'] if autumn else M['lf_mul']
    pts, rad = trunk_curve(h * 0.40, rng.r(-0.30, 0.30), rng.r(-0.24, 0.24), seed, 0.155, 0.085)
    tube(pts, rad, M['bark_mul'], name="ml_trunk")
    fork = V(pts[-1])
    nb = 5
    for i in range(nb):
        th = i * 6.2832 / nb + rng.r(-0.42, 0.42)
        rr = spread * rng.r(0.46, 0.82)
        tip = fork + V((math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.14, 0.34)))
        tube(arc_pts(fork, tip, h * 0.11, 5), [0.070, 0.058, 0.046, 0.034, 0.022],
             M['bark_mul'], seg=5, name="ml_br")
        cr = spread * rng.r(0.30, 0.40)
        cen = tip + V((0, 0, cr * 0.26))
        leaf_shell(cen, cr, int(300 + 160 * rng.f()), 0.115, 0.18, LF, rng,
                   squash=0.78, droop=0.40, rmin=0.24, name="ml_cl")
        if autumn:
            _fruit_cluster(cen, cr, seed * 19 + i * 37 + 7, kind='mul', n=9)


def tree_grape(seed, h=1.9, spread=1.75, autumn=False):
    """머루(Vitis coignetiae) — **덩굴이다.** 카드 규약대로 관목 문법으로 짓는다:
    낮은 받침(죽은 가지·바위)을 타고 올라 **퍼지는 잎 더미**가 되고, 송이는 그 아래로 늘어진다.
    ⇒ 나무처럼 줄기 하나가 서 있으면 안 된다 — 실루엣이 **옆으로 넓고 낮은 것**이 표식이다."""
    rng = R(seed)
    LF = M['lf_vine_a'] if autumn else M['lf_vine']
    nv = 6
    tops = []
    for i in range(nv):
        th = i * 6.2832 / nv + rng.r(-0.4, 0.4)
        rr = spread * rng.r(0.40, 0.80)
        base = V((math.cos(th) * 0.06, math.sin(th) * 0.06, 0.0))
        tip = base + V((math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.60, 1.00)))
        pp = arc_pts(base, tip, h * 0.40, 6)
        tube(pp, [0.030, 0.026, 0.022, 0.018, 0.014, 0.010], M['bark_vine'], seg=5, name="gv_st")
        tops.append((tip, rr))
    for (tip, rr) in tops:
        cr = spread * rng.r(0.34, 0.48)
        cen = tip + V((0, 0, cr * 0.16))
        leaf_shell(cen, cr, int(360 + 180 * rng.f()), 0.150, 0.19, LF, rng,
                   squash=0.60, droop=0.46, rmin=0.22, name="gv_lf")
    cen = V((0, 0, h * 0.62))
    cr = spread * 0.72
    blob(cen, cr * 0.34, M['in_dark'], rng, squash=0.46, disp=0.32, sub=2, name="gv_in")
    leaf_shell(cen, cr, 520, 0.150, 0.19, LF, rng, squash=0.50, droop=0.44, rmin=0.26, name="gv_top")
    if autumn:
        _fruit_cluster(cen, cr, seed * 23 + 13, kind='grape', n=6)


def tree_stump(seed=911, r=0.26, h=0.42):
    """그루터기 — **종 공통 하나면 충분하다**(카드). 벤 자리는 종을 안 묻는다.
    ★T120 밭 그루터기와 같은 결: **자른 면이 밝다**. 그것이 "벴다"를 말하는 신호다."""
    rng = R(seed)
    pts, rad = trunk_curve(h, rng.r(-0.05, 0.05), 0.0, seed, r, r * 0.94)
    tube(pts, rad, M['bark_oak'], name="st_body")
    # 자른 면 — 얇은 원반(나이테 재질)
    cyl_top = V((0, 0, h + 0.006))
    tube([cyl_top - V((0, 0, 0.012)), cyl_top], [r * 0.95, r * 0.93], M['wood_cut'], seg=12, name="st_cut")
    # 드러난 뿌리 — 밑동이 땅에 붙는 자리(안 그리면 원기둥이 떠 보인다)
    for i in range(5):
        th = i * 1.2566 + rng.r(-0.3, 0.3)
        tip = V((math.cos(th) * r * rng.r(1.5, 2.3), math.sin(th) * r * rng.r(1.5, 2.3), 0.015))
        tube(arc_pts(V((math.cos(th) * r * 0.8, math.sin(th) * r * 0.8, h * 0.22)), tip, 0.05, 4),
             [0.055, 0.042, 0.030, 0.020], M['bark_oak'], seg=5, name="st_root")


def sapling(species, seed, h=0.78):
    """묘목 — **성목 축소가 아니다**(카드). 어린 나무는 가지가 없고 잎이 크다.
    ⇒ 대 하나 + 잎 카드 한 줌. 종은 **잎 재질**로만 갈린다(어린 실루엣은 종을 잘 안 말한다).
    ★그래도 침엽(소나무·잣)은 다르다 — 어려도 바늘잎이라 폭이 좁고 촘촘하다."""
    rng = R(seed)
    LF, needle = {
        'pine':     (M['nd_pine'], True), 'jat': (M['nd_jat'], True),
        'oak':      (M['lf_oak'], False), 'chestnut': (M['lf_chest'], False),
        'willow':   (M['lf_wil'], False), 'hazel': (M['lf_haz'], False),
        'mulberry': (M['lf_mul'], False), 'grape': (M['lf_vine'], False),
    }[species]
    BK = {'pine': M['bark_pine'], 'jat': M['bark_jat'], 'oak': M['bark_oak'],
          'chestnut': M['bark_chest'], 'willow': M['bark_wil'], 'hazel': M['bark_haz'],
          'mulberry': M['bark_mul'], 'grape': M['bark_vine']}[species]
    pts, rad = trunk_curve(h, rng.r(-0.12, 0.12), rng.r(-0.10, 0.10), seed, 0.020, 0.010)
    tube(pts, rad, BK, seg=5, name="sap_st")
    top = V(pts[-1])
    if needle:
        leaf_shell(top + V((0, 0, -h * 0.16)), h * 0.34, 150, 0.030, 0.15, LF, rng,
                   squash=0.85, droop=0.24, rmin=0.20, tilt=0.85, name="sap_nd")
    else:
        leaf_shell(top + V((0, 0, -h * 0.10)), h * 0.36, 22, 0.115, 0.20, LF, rng,
                   squash=0.72, droop=0.34, rmin=0.30, name="sap_lf")


def tree_chestnut(seed, h=4.2, spread=1.85, autumn=False):
    """밤나무(Castanea crenata) — 곧은 편의 줄기 · 세로로 긴 타원 수관 · 밝은 초록 · 긴 잎.

    ★[T129] `autumn=True` 면 **같은 나무의 가을 판**이다 — 잎 재질만 갈고 밤송이를 단다.
      기본값은 `False` 라 `tree09`·`tree10` 의 출력은 **한 화소도 안 바뀐다**(그게 §1 계약이다)."""
    rng = R(seed)
    LF = M['lf_chest_a'] if autumn else M['lf_chest']
    pts, rad = trunk_curve(h * 0.56, rng.r(-0.2, 0.2), rng.r(-0.16, 0.16), seed, 0.185, 0.095)
    tube(pts, rad, M['bark_chest'], name="ch_trunk")
    fork = V(pts[-1])
    for i in range(3):
        th = i * 2.0944 + rng.r(-0.4, 0.4)
        rr = spread * rng.r(0.28, 0.48)
        tip = fork + V((math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.26, 0.40)))
        tube(arc_pts(fork, tip, h * 0.07, 5), [0.085, 0.07, 0.056, 0.042, 0.028],
             M['bark_chest'], seg=6, name="ch_br")
        cr = spread * rng.r(0.38, 0.50)
        cen = tip + V((0, 0, cr * 0.34))
        blob(cen, cr * 0.42, M['in_dark'], rng, squash=1.0, disp=0.3, sub=2, name="ch_in")
        leaf_shell(cen, cr, int(540 + 240 * rng.f()), 0.062, 0.28, LF, rng,
                   squash=1.0, droop=0.40, rmin=0.18, name="ch_cl")
        if autumn:
            _fruit_cluster(cen, cr, seed * 13 + 5, kind='burr')
    cr = spread * rng.r(0.50, 0.62)
    cen = fork + V((0, 0, h * 0.38))
    blob(cen, cr * 0.42, M['in_dark'], rng, squash=1.05, disp=0.3, sub=2, name="ch_tin")
    leaf_shell(cen, cr, 720, 0.062, 0.28, LF, rng, squash=1.05, droop=0.36, rmin=0.18, name="ch_top")
    if autumn:
        _fruit_cluster(cen, cr, seed * 13 + 11, kind='burr')


def tree_willow(seed, h=3.6, spread=1.95):
    """버드나무(Salix koreensis) — 물가 수종. 기운 줄기 · 늘어진 가지 · 밝은 황록."""
    rng = R(seed)
    lean = rng.r(0.30, 0.75) * (1 if rng.f() > 0.5 else -1)
    pts, rad = trunk_curve(h * 0.54, lean, rng.r(-0.26, 0.26), seed, 0.175, 0.085)
    tube(pts, rad, M['bark_wil'], name="wl_trunk")
    fork = V(pts[-1])
    dc = fork + V((0, 0, spread * 0.30))
    leaf_shell(dc, spread * 0.70, 680, 0.042, 0.26, M['lf_wil'], rng,
               squash=0.50, droop=0.60, rmin=0.18, name="wl_dome")
    # 늘어진 가지 — 실루엣의 본체. 가지마다 잎 카드를 매단다.
    ns = 22
    for i in range(ns):
        th = i * 6.2832 / ns + rng.r(-0.16, 0.16)
        rr = spread * rng.r(0.40, 0.90)
        top = fork + V((math.cos(th) * rr * 0.5, math.sin(th) * rr * 0.5, spread * rng.r(0.26, 0.44)))
        bot = fork + V((math.cos(th) * rr, math.sin(th) * rr, -h * rng.r(0.06, 0.26)))
        pp = arc_pts(top, bot, spread * 0.30, 6)
        tube(pp, [0.024, 0.021, 0.018, 0.015, 0.012, 0.008], M['bark_wil'], seg=4, name="wl_st")
        for k in range(2, 6):
            leaf_shell(pp[k], 0.16, 22, 0.038, 0.22, M['lf_wil'], rng,
                       squash=1.0, droop=0.85, rmin=0.2, tilt=0.35, name="wl_lf")


TREE_BUILD = [
    ("tree01", tree_pine, dict(seed=11, h=3.7, spread=1.95)),
    ("tree02", tree_pine, dict(seed=23, h=3.0, spread=1.65)),
    ("tree03", tree_pine, dict(seed=37, h=4.4, spread=2.15)),
    ("tree04", tree_jat, dict(seed=41, h=4.4, spread=1.78)),
    ("tree05", tree_jat, dict(seed=53, h=3.5, spread=1.50)),
    ("tree06", tree_oak, dict(seed=61, h=4.1, spread=2.15)),
    ("tree07", tree_oak, dict(seed=71, h=3.4, spread=1.85)),
    ("tree08", tree_oak, dict(seed=83, h=4.7, spread=2.45)),
    ("tree09", tree_chestnut, dict(seed=97, h=4.3, spread=1.90)),
    ("tree10", tree_chestnut, dict(seed=101, h=3.6, spread=1.62)),
    ("tree11", tree_willow, dict(seed=113, h=3.8, spread=2.00)),
    ("tree12", tree_willow, dict(seed=127, h=3.2, spread=1.72)),
    # ═══ [T129] 열매종 · 가을 판 · 그루터기 · 묘목 ═══
    # ★밤나무는 **이미 있다**(tree09·tree10). 그러니 밤의 "모델"을 새로 짓지 않는다 —
    #   가을 판만 더한다. `tree09` 와 **같은 씨앗·같은 인자**라 실루엣이 그대로다(§0-ⓑ).
    ("tree09_a", tree_chestnut, dict(seed=97, h=4.3, spread=1.90, autumn=True)),
    ("tree13", tree_hazel, dict(seed=137, h=2.8, spread=1.55)),
    ("tree13_a", tree_hazel, dict(seed=137, h=2.8, spread=1.55, autumn=True)),
    ("tree14", tree_mulberry, dict(seed=149, h=3.4, spread=1.90)),
    ("tree14_a", tree_mulberry, dict(seed=149, h=3.4, spread=1.90, autumn=True)),
    ("tree15", tree_grape, dict(seed=157, h=1.9, spread=1.75)),
    ("tree15_a", tree_grape, dict(seed=157, h=1.9, spread=1.75, autumn=True)),
    # 그루터기 — 종 공통 하나(카드). 묘목 — 종별 여덟.
    ("stump01", tree_stump, dict(seed=911)),
    ("sap_pine", sapling, dict(species='pine', seed=211, h=0.72)),
    ("sap_jat", sapling, dict(species='jat', seed=223, h=0.70)),
    ("sap_oak", sapling, dict(species='oak', seed=227, h=0.80)),
    ("sap_chestnut", sapling, dict(species='chestnut', seed=229, h=0.82)),
    ("sap_willow", sapling, dict(species='willow', seed=233, h=0.78)),
    ("sap_hazel", sapling, dict(species='hazel', seed=239, h=0.66)),
    ("sap_mulberry", sapling, dict(species='mulberry', seed=241, h=0.76)),
    ("sap_grape", sapling, dict(species='grape', seed=251, h=0.54)),
]


# ═══════════════ 수풀 · 풀숲 ═══════════════
def bush_berry(seed, w=1.5, h=1.2, berries=True):
    """딸기 덤불 — 잎 덩어리 3~5 + 붉은 열매(기존 자산 계보 유지)."""
    rng = R(seed)
    nb = 3 + int(rng.r(0, 2.99))
    for i in range(nb):
        th = i * 6.28 / nb + rng.r(-0.4, 0.4)
        rr = w * rng.r(0.10, 0.30)
        r = w * rng.r(0.26, 0.40)
        cen = (math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.40, 0.62))
        sq = rng.r(0.72, 0.95)
        blob(cen, r * 0.42, M['in_dark'], rng, squash=sq, disp=0.34, sub=2, name="bsh_in")
        leaf_shell(cen, r, int(260 + 150 * rng.f()), 0.062, 0.11, M['bush_leaf'], rng,
                   squash=sq, droop=0.38, rmin=0.18, name="bsh")
    # 밑동 잔가지
    for i in range(3):
        th = rng.r(0, 6.28)
        tube([(0, 0, 0), (math.cos(th) * w * 0.16, math.sin(th) * w * 0.16, h * 0.42)],
             [0.035, 0.02], M['bark_oak'], seg=4, name="bsh_st")
    if berries:
        for i in range(7):
            th = rng.r(0, 6.28); rr = w * rng.r(0.16, 0.36)
            bpy.ops.mesh.primitive_ico_sphere_add(
                subdivisions=1, radius=w * 0.045,
                location=(math.cos(th) * rr, math.sin(th) * rr, h * rng.r(0.42, 0.72)))
            ob = bpy.context.object; ob.data.materials.append(M['berry']); OBJS.append(ob)


def herb_clump(seed, h=0.75, n=16, mat=None, flower=None, fh=None):
    """약초·풀숲 — 잎 다발. flower 주면 꽃대(들꽃)."""
    rng = R(seed)
    mat = mat or M['herb_leaf']
    for i in range(n):
        th = rng.r(0, 6.28)
        blade((rng.r(-0.06, 0.06), rng.r(-0.06, 0.06), 0.0), th,
              h * rng.r(0.55, 1.0), h * rng.r(0.30, 0.72), h * rng.r(0.055, 0.10),
              mat, rng, fold=rng.r(0.22, 0.42), name="hb")
    if flower:
        nf = 9 + int(rng.r(0, 5.99))
        for i in range(nf):
            th = rng.r(0, 6.28)
            hh = (fh or h) * rng.r(0.85, 1.25)
            tipx, tipy = math.cos(th) * hh * 0.16, math.sin(th) * hh * 0.16
            tube(arc_pts((rng.r(-0.05, 0.05), rng.r(-0.05, 0.05), 0.0), (tipx, tipy, hh), hh * 0.18, 5),
                 [0.014, 0.012, 0.010, 0.009, 0.008], M['grass'], seg=4, name="fst")
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=hh * 0.052,
                                                  location=(tipx, tipy, hh))
            ob = bpy.context.object
            ob.scale = (1.35, 1.35, 0.30)
            ob.data.materials.append(M['fl_' + flower]); OBJS.append(ob)


# ═══════════════ 물가 술 — 풀포기 · 갈대 · 부들 ═══════════════
def grass_tuft(seed, h=0.62, n=26, dry=False):
    """풀포기 — 물가 절단선을 가리는 기본 술. ★1패스 실화면 결함: 잎이 두껍고 뻣뻣해
    **용설란(agave) 로제트**처럼 보였다. 얇게·많이·더 휘게 + 안쪽에 짧은 잎을 채워 '포기'로 만든다."""
    rng = R(seed)
    mat = M['grass_dry'] if dry else M['grass']
    for i in range(n):
        th = rng.r(0, 6.28)
        inner = i % 3 == 0                     # 3장에 1장은 짧은 속잎 — 가운데가 뚫려 보이지 않게
        hh = h * (rng.r(0.22, 0.5) if inner else rng.r(0.55, 1.0))
        blade((rng.r(-0.05, 0.05), rng.r(-0.05, 0.05), 0.0), th,
              hh, hh * rng.r(0.55, 1.15), hh * rng.r(0.05, 0.085),
              mat, rng, fold=rng.r(0.14, 0.3), name="gt")


def reed(seed, h=2.0, n=7):
    """갈대(Phragmites) — 곧은 대 + 끝의 이삭. 송국리 저습지 물가의 본체."""
    rng = R(seed)
    for i in range(n):
        th = rng.r(0, 6.28)
        rr = rng.r(0.02, 0.24)
        hh = h * rng.r(0.68, 1.0)
        bx, by = math.cos(th) * rr, math.sin(th) * rr
        tipx = bx + math.cos(th) * hh * rng.r(0.06, 0.20)
        tipy = by + math.sin(th) * hh * rng.r(0.06, 0.20)
        stem = arc_pts((bx, by, 0), (tipx, tipy, hh), hh * 0.14, 6)
        tube(stem, [0.026, 0.023, 0.020, 0.017, 0.014, 0.011], M['reed_stem'], seg=5, name="rd_st")
        # 이삭(원추화서) — ★깃털이다. 통짜 원통으로 굽면 부들 이삭처럼 보인다(1패스 실측 결함).
        #   가는 카드 수십 장을 세로로 길쭉한 껍질에 흩뿌려 성글게 헤어지게 한다.
        pl = V(stem[-1])
        ln = hh * rng.r(0.16, 0.24)
        cen = pl + V((math.cos(th) * ln * 0.28, math.sin(th) * ln * 0.28, ln * 0.55))
        leaf_shell(cen, ln * 0.30, 60, 0.010, ln * 0.55, M['reed_plume'], rng,
                   squash=2.0, droop=0.85, rmin=0.15, tilt=0.35, name="rd_pl")
        # 대 중간의 긴 잎 2장
        for k in range(2):
            s = 0.34 + 0.30 * k
            base = V(stem[int(s * 5)])
            blade(base, th + rng.r(-2.4, 2.4), hh * rng.r(0.18, 0.30), hh * rng.r(0.26, 0.42),
                  0.045, M['reed_leaf'], rng, fold=0.30, name="rd_lf")


def cattail(seed, h=1.7, n=6):
    """부들(Typha) — 칼 모양 긴 잎 + 갈색 원통 이삭."""
    rng = R(seed)
    for i in range(n):
        th = rng.r(0, 6.28)
        bx, by = rng.r(-0.12, 0.12), rng.r(-0.12, 0.12)
        for k in range(3):
            blade((bx, by, 0), th + rng.r(-1.2, 1.2), h * rng.r(0.62, 0.96),
                  h * rng.r(0.12, 0.34), 0.055, M['cat_leaf'], rng, fold=0.34, name="ct_lf")
        if i % 2 == 0:
            hh = h * rng.r(0.88, 1.06)
            stem = arc_pts((bx, by, 0), (bx + rng.r(-0.06, 0.06), by + rng.r(-0.06, 0.06), hh), hh * 0.05, 5)
            tube(stem, [0.022, 0.020, 0.018, 0.017, 0.016], M['reed_stem'], seg=5, name="ct_st")
            sp = V(stem[-1])
            spl = h * rng.r(0.14, 0.20)
            tube([sp - V((0, 0, spl)), sp - V((0, 0, spl * 0.72)), sp - V((0, 0, spl * 0.3)), sp],
                 [0.018, 0.052, 0.052, 0.020], M['cat_spike'], seg=7, name="ct_sp")


# ═══════════════ 빌드 표 ═══════════════
# ═══════════════ 막돌 · 이끼바위 [T101 편입 — legacy_mac/rock_render.py] ═══════════════
# ★★씨앗이 결정론이 아니었다: 옛 스크립트는 `random.seed(hash(kind) % 9973 + i*131 + 15500)` 인데
#   파이썬 3 의 **문자열 `hash()` 는 프로세스마다 다르다**(PYTHONHASHSEED). 같은 기계에서 두 번
#   구워도 다른 바위가 나온다 — 배포본 `rock01..06` 은 **재현이 불가능했다**(T101 §0-ⓐ 실측).
#   ⇒ `PYTHONHASHSEED=0` 실측값을 **정수로 못 박는다**. 이제 두 번 구우면 같은 바위다.
_KSEED = {'rock': 8765, 'mossrock': 4720}      # PYTHONHASHSEED=0 으로 잰 옛 씨앗값(위 설명 참조)


def _boulder(mat, size=1.0, squash=None, jitter=0.45, subdiv=2):
    """저폴리 각진 바위 — `legacy_mac/rock_render.py:make_boulder` 본문 **그대로**.
    `random` 호출 **순서까지** 같아야 대조군과 화소가 맞는다(편입 증명 · T101 §1)."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=size)
    o = bpy.context.active_object
    sq = squash or (random.uniform(0.85, 1.25), random.uniform(0.85, 1.25), random.uniform(0.6, 0.9))
    o.scale = sq
    me = o.data
    for v in me.vertices:
        v.co += V((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * size * jitter * random.random()
        if v.co.z < -size * 0.35:
            v.co.z = -size * 0.35                       # 바닥 컷(땅에 앉음)
    bpy.ops.object.shade_flat()
    o.data.materials.append(mat)
    OBJS.append(o)
    return o


def rock(i, moss=False):
    """바위 한 덩이. `i` = 1..6(파일 번호). 옛 JOBS 분기 본문 그대로 — 곁돌 확률까지."""
    kind = 'mossrock' if moss else 'rock'
    random.seed(_KSEED[kind] + i * 131 + 15500)
    if moss:
        m = rock_mat("mossrock%d" % (100 + i), (0.21, 0.20, 0.18), moss=True, seed=100 + i)
        _boulder(m, size=1.0, jitter=0.42)
    else:
        base = (0.22 + random.uniform(-0.03, 0.04),
                0.20 + random.uniform(-0.03, 0.03),
                0.18 + random.uniform(-0.02, 0.03))
        m = rock_mat("rock%d" % i, base, moss=False, seed=i)
        _boulder(m, size=1.0, jitter=0.4 + 0.12 * random.random())
        if random.random() < 0.5:                       # 곁돌
            small = _boulder(m, size=0.38, jitter=0.4)
            small.location = V((random.uniform(0.9, 1.3), random.uniform(-0.6, 0.6), -0.25))


PROP_BUILD = [
    ("bush01", bush_berry, dict(seed=201, w=1.55, h=1.20)),
    ("bush02", bush_berry, dict(seed=211, w=1.30, h=1.00)),
    ("bush03", bush_berry, dict(seed=223, w=1.75, h=1.35)),
    ("bush04", bush_berry, dict(seed=233, w=1.45, h=1.10, berries=False)),
    ("bush05", bush_berry, dict(seed=241, w=1.20, h=0.95)),
    ("bush06", bush_berry, dict(seed=251, w=1.62, h=1.28, berries=False)),
    ("herb01", herb_clump, dict(seed=301, h=0.80, n=17)),
    ("herb02", herb_clump, dict(seed=311, h=0.62, n=14)),
    ("herb03", herb_clump, dict(seed=323, h=0.92, n=20)),
    ("herb04", herb_clump, dict(seed=331, h=0.70, n=15)),
    ("herb05", herb_clump, dict(seed=347, h=0.85, n=18)),
    ("herb06", herb_clump, dict(seed=353, h=0.58, n=13)),
    ("grass01", grass_tuft, dict(seed=401, h=0.52, n=33)),
    ("grass02", grass_tuft, dict(seed=409, h=0.40, n=27)),
    ("grass03", grass_tuft, dict(seed=419, h=0.66, n=38)),
    ("grass04", grass_tuft, dict(seed=431, h=0.46, n=30, dry=True)),
    ("reed01", reed, dict(seed=501, h=2.05, n=7)),
    ("reed02", reed, dict(seed=509, h=1.70, n=5)),
    ("reed03", reed, dict(seed=521, h=2.35, n=9)),
    ("cattail01", cattail, dict(seed=601, h=1.75, n=6)),
    ("cattail02", cattail, dict(seed=613, h=1.40, n=4)),
    ("cattail03", cattail, dict(seed=619, h=2.00, n=7)),
    ("flower01", herb_clump, dict(seed=701, h=0.42, n=11, mat=None, flower='w', fh=0.62)),
    ("flower02", herb_clump, dict(seed=709, h=0.38, n=10, flower='y', fh=0.52)),
    ("flower03", herb_clump, dict(seed=719, h=0.45, n=12, flower='p', fh=0.66)),
    ("flower04", herb_clump, dict(seed=727, h=0.36, n=9, flower='r', fh=0.48)),
    # ★[T101] 막돌 6 + 이끼바위 6 — 여태 저장소 밖 스크립트가 굽던 것(회부 1). 이제 여기서 굽는다.
    #   광맥 `ore01..06` 은 모델이 아니다 — `scripts/ore-outcrop.py` 가 이 바위에서 PIL 로 파생한다.
    ("rock01", rock, dict(i=1)),
    ("rock02", rock, dict(i=2)),
    ("rock03", rock, dict(i=3)),
    ("rock04", rock, dict(i=4)),
    ("rock05", rock, dict(i=5)),
    ("rock06", rock, dict(i=6)),
    ("mossrock01", rock, dict(i=1, moss=True)),
    ("mossrock02", rock, dict(i=2, moss=True)),
    ("mossrock03", rock, dict(i=3, moss=True)),
    ("mossrock04", rock, dict(i=4, moss=True)),
    ("mossrock05", rock, dict(i=5, moss=True)),
    ("mossrock06", rock, dict(i=6, moss=True)),
]

# ═══════════════ [T129] 종 표 — **굽는 표에서 유도한다** ═══════════════
# ★★§0-ⓐ 실측: **종 배정은 이미 있었다.** `TREE_BUILD` 의 각 줄이 어느 빌더를 부르는지가
#   곧 종이고, 빌더 독스트링엔 학명까지 적혀 있다(소나무 Pinus densiflora …).
#   ⇒ 그러니 종 표를 **새로 지어 적지 않는다** — 굽는 표에서 **뽑는다**. 손으로 적으면
#   그게 두 번째 정본이고, 나무를 하나 더 굽는 날 조용히 갈린다(족보 79).
# ★키 이름: 종 id 는 여기 정하고, **수치(성장·수확)는 T123 랩/서버가 정본**이다.
#   이 파일이 말하는 것은 오직 "어느 그림이 어느 종인가"다.
SPECIES = {
    # 빌더 → (종 id, 한글, 학명)
    'tree_pine':      ('pine',     '소나무',   'Pinus densiflora'),
    'tree_jat':       ('jat',      '잣나무',   'Pinus koraiensis'),
    'tree_oak':       ('oak',      '참나무',   'Quercus'),
    'tree_chestnut':  ('chestnut', '밤나무',   'Castanea crenata'),
    'tree_willow':    ('willow',   '버드나무', 'Salix koreensis'),
    'tree_hazel':     ('hazel',    '개암나무', 'Corylus heterophylla'),
    'tree_mulberry':  ('mulberry', '산뽕나무', 'Morus bombycis'),
    'tree_grape':     ('grape',    '머루',     'Vitis coignetiae'),
}
# 열매가 달리는 종 — 가을 판이 있는 넷. 열매 품목 id 는 **서버가 아직 모른다**(회부).
FRUITING = {'chestnut': '밤', 'hazel': '개암', 'mulberry': '오디', 'grape': '머루'}


def build_species_table():
    """`TREE_BUILD` 를 훑어 종 표를 만든다 — 사람이 적는 칸은 위 `SPECIES` 뿐이다."""
    out = {}
    for key, fn, kw in TREE_BUILD:
        nm = getattr(fn, '__name__', '')
        if nm == 'sapling':
            sid = kw.get('species')
            out.setdefault(sid, {})['sapling'] = key
            continue
        if nm == 'tree_stump':
            continue                                  # 그루터기는 종을 안 묻는다(공통 하나)
        if nm not in SPECIES:
            continue
        sid, ko, latin = SPECIES[nm]
        e = out.setdefault(sid, {})
        e['ko'] = ko; e['latin'] = latin
        if kw.get('autumn'):
            e.setdefault('autumn', []).append(key)
        else:
            e.setdefault('sprites', []).append(key)
        if sid in FRUITING:
            e['fruit_ko'] = FRUITING[sid]
    for sid, e in out.items():
        for k in ('sprites', 'autumn'):
            if k in e: e[k] = sorted(e[k])
    return {
        '_뜻': '어느 그림이 어느 나무 종인가. **수치(성장·수확·벌목)는 서버/랩이 정본**이고 여기 없다.',
        '_유도': 'scripts/nature_render.py TREE_BUILD 에서 뽑는다 — 손으로 적지 마라(다시 구우면 덮인다).',
        '_그루터기': 'stump01 — 종 공통 하나. 벤 자리는 종을 안 묻는다.',
        '_단계': '성목(sprites) · 가을·열매(autumn) · 묘목(sapling) · 그루터기(공통).',
        'species': dict(sorted(out.items())),
    }


# ═══════════════ 굽기 ═══════════════
# ★[T101] `__main__` 가드 — 대조 하네스가 **빌더만** 꺼내 쓸 수 있어야 한다(편입 증명).
if __name__ == '__main__':
  anchors = {}
  apath = os.path.join(OUTDIR, "nature_raw_anchors.json")
  if os.path.exists(apath):
      try: anchors = json.load(open(apath))
      except Exception: anchors = {}

  for key, fn, kw in TREE_BUILD:
      if ONLY and key not in ONLY: continue
      fn(**kw)
      anchors[key] = render(key, ss=4, margin=8)
      anchors[key]["kind"] = "tree"
      cleanup()

  for key, fn, kw in PROP_BUILD:
      if ONLY and key not in ONLY: continue
      fn(**kw)
      anchors[key] = render(key, ss=3, margin=5)
      anchors[key]["kind"] = "prop"
      cleanup()

  json.dump(anchors, open(apath, "w"), indent=1)
  # ★[T129] 종 표 — 굽는 표에서 유도해 배포 자리에 바로 쓴다(스테이징을 안 거친다:
  #   그림이 아니라 **표**라 크롭할 것이 없다).
  _sp = os.path.join(HERE, "..", "public", "assets", "trees", "tree_species.json")
  json.dump(build_species_table(), open(_sp, "w", encoding="utf-8"),
            ensure_ascii=False, indent=1, sort_keys=False)
  print("[nat] 종 표 ->", os.path.normpath(_sp))
  print("[nat] DONE ->", OUTDIR, len(anchors), "keys")
