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
    nt.links.new(fac, bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], b.inputs["Normal"])
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


def tree_chestnut(seed, h=4.2, spread=1.85):
    """밤나무(Castanea crenata) — 곧은 편의 줄기 · 세로로 긴 타원 수관 · 밝은 초록 · 긴 잎."""
    rng = R(seed)
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
        leaf_shell(cen, cr, int(540 + 240 * rng.f()), 0.062, 0.28, M['lf_chest'], rng,
                   squash=1.0, droop=0.40, rmin=0.18, name="ch_cl")
    cr = spread * rng.r(0.50, 0.62)
    cen = fork + V((0, 0, h * 0.38))
    blob(cen, cr * 0.42, M['in_dark'], rng, squash=1.05, disp=0.3, sub=2, name="ch_tin")
    leaf_shell(cen, cr, 720, 0.062, 0.28, M['lf_chest'], rng, squash=1.05, droop=0.36, rmin=0.18, name="ch_top")


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
]

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
print("[nat] DONE ->", OUTDIR, len(anchors), "keys")
