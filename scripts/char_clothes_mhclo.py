#!/usr/bin/env python3
# =============================================================================
# scripts/char_clothes_mhclo.py — ★★[T604 ② 2026-10-04] 청동기 옷 기하 — 시트 링 표 → 3D 몸 → MPFB `mhclo`
#
#   T545 의 옷은 MakeHuman CC0 현대 옷(반팔 티 + 청바지 · 긴소매 블라우스 + 치마)을 깎은 것이었다(회부 6).
#   이 판은 **시트(2D) 옷을 3D 몸에 입힌다** — 옷 그림은 어디서나 하나(캐논) · 새 수 0:
#     ⓐ 꼴의 정본 = `char_render.py` 의 링 표(`TUNIC_R` 웃옷 · `SKIRT_R` 옷자락 · `BELT_R` 허리띠 · `SLV_R` 소매) +
#        몸 표(`TORSO_R` · `LEG_R` · `ARM_R`) + 뼈 표(`BONES`) + 갖옷 털 두께 `FUR_PAD` — **원문을 읽는다**(ast · 사본 0).
#     ⓑ 높이 = 뼈 자리끼리 맞댄다(시트 발목·무릎·엉덩관절·어깨관절·머리뼈 밑·정수리 ↔ MPFB `cmu_mb` 같은 관절) — 사이는 곧은 보간.
#        소매는 위팔·아래팔 뼈를 따라 잰다(시트 팔은 곧게 내린 팔 · MPFB 는 A 자).
#     ⓒ 둘레 = 3D 몸의 단면(볼록 껍질) + **시트의 여유**(시트 옷 링 − 시트 몸 단면 · 방향마다) × 키 비(3D 정수리 ÷ 시트 `H_TOT`).
#        웃옷은 시트 몸이 그렇듯 몸에서 2cm 남짓 뜨고 · 옷자락은 두 다리를 한 둘레로 감싼다 · 허리띠는 웃옷 위 몇 mm.
#     ⓓ 링 사이에서 몸이 옷을 뚫으면 그 높이에 링을 하나 더 넣는다(몸 점마다 잰다 · 요구 = 몸 점이 옷 안) ·
#        링 자리 그 자체면 그 점을 그 링의 단면 껍질에 넣어 다시 잰다(그래도 현이 모자라면 — 뾰족한 껍질 모서리 — 그 두 방향을 민다).
#        옷자락(엉덩관절 아래)은 아래로 좁아지지 않는다(천은 늘어진다).
#     ⓔ 각 수 = 시트 `LOFT_SEG`(16) · 갖옷 = 모든 둘레 + `FUR_PAD` × 키 비(시트 `build_cloth(pad=FUR_PAD)` 와 같은 문법).
#        ★[T654 2026-10-05] 기하는 **하나**(본 옷)만 짓는다 — 점마다 털 두께 방향(링 평면의 바깥 단위 벡터 = 위 문법이 둘레에
#        두께를 더하던 방향 · 소매 뚜껑 가운데 0)과 두께(`FUR_PAD` × 키 비)를 돌려주고, 엔진 셰이더가 갖옷일 때만 그만큼 민다(메시 사본 0).
#        ★[T685 2026-10-10] 갖옷 기하(둘레 + 두께 — T604 판 식 그대로)도 다시 짓는다 — 그리지 않고 **MPFB 묶기만**: 그 묶기가 낸 뼈 무게를
#        내보내기가 갖옷 몫 무게(정점 속성)로 싣는다(옛 갖옷 몸이 제 묶기로 움직이던 그대로 · 본 옷 무게 무접촉).
#     ⓕ 소매 = 시트 `SLV_R` 링을 위팔 뼈 위 같은 자리에 · 둘레 = 이웃 링 사이 팔 점의 축 반지름 최대 + 시트 소매 여유 × 키 비 ·
#        위 끝은 막는다(시트 `loft()` 윗 뚜껑 — 네모 여덟) — 어깨에서 소매와 웃옷이 겹치는 자리(시트도 겹친다)에 열린 틈이 안 선다.
#     ⓖ 살은 안 지운다(`delete_verts` 0) — 옷 밑 살을 지우면 어깨·단에서 옷끼리 벌어질 때 구멍이 난다 · 예산은 6,000 안에 든다.
#   ★몸 둘의 재단(카드 T604 ② "무릎 길이 웃옷 · 반팔/긴팔 · 허리띠 · 갖옷은 털 바깥 · 여: 긴 웃옷/치마"):
#     남(M) = 시트 그대로(옷자락 단 = `SKIRT_R` 맨 아래 링 · 반팔 = `SLV_R`) — 게임 안의 몸(`defaultBody`)이라 시트와 한 그림이어야 한다.
#     여(F) = 단을 무릎(시트 `Z_KNEE` 뼈 자리)까지 · 긴팔(소매가 손목까지 — `ARM_R` 링을 따라 · 여유 = 소매 끝 링의 여유).
#       ↳ T545 여 옷이 "긴소매 웃옷 + 무릎 치마"였다 — 그 몫을 청동기 꼴로(현대 옷 → 시트 옷 문법). 수 0(뼈 자리 · 기존 링).
#   ★MPFB 가 입힌다: 옷 점마다 **묶을 몸 무리**(점 무리 하나)를 주고 MPFB 묶기(`create_mhclo_from_clothes_matching` 의 고리 — `VertexMatch`)가
#     가장 가까운 몸 면에 묶는다(삼각 무게 + 어긋남) → `Mhclo.write_mhclo`(+ obj). 뼈 무게는 묶인 몸 점에서 MPFB 가 옮긴다.
#     웃옷 = 몸통 무리 · 옷자락 = MakeHuman `helper-skirt`(치마 보조 기하 — MakeClothes 규약) · 소매 = 위팔/아래팔 무리.
#   ★손 모델링 0: 점·면은 링 표에서 **식으로** 나온다(로프트 — `char_render.py loft()` 와 같은 문법).
#
# 쓰는 곳: `char_export_gltf.py` 가 몸마다 부른다(`make(sex, base, rig, ...)`) — 산물(.mhclo · .obj)은 원본 자리 안 작업 폴더(저장소 밖).
# =============================================================================
import os, math, ast, uuid

import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET_PY = os.path.join(HERE, "char_render.py")
_NEED = ("H_TOT", "Z_ANKLE", "Z_KNEE", "Z_HIP", "Z_WAIST", "Z_SHLD", "Z_NECK", "HEAD_K", "SHLD_K", "LIMB_K", "HAND_K",
         "SH_W", "HIP_W", "ARM_Y", "LOFT_SEG", "TORSO_R", "ARM_R", "LEG_R", "SLV_R", "FUR_PAD", "TUNIC_R", "SKIRT_R", "BELT_R",
         "BONES", "_hz")
CUTS = {"M": {"hem": "sheet", "sleeve": "short"}, "F": {"hem": "knee", "sleeve": "long"}}
VARIANTS = ("base", "fur")                 # 본 옷 기하(옷 넷이 같이 그린다 — [T654] 갖옷 = 같은 기하 + 털 두께 방향 × 두께 · 셰이더) ·
                                           # [T685] 갖옷 기하 = **묶기만**(T604 갖옷 판 그대로 지어 MPFB 로 묶는다 — 그 뼈 무게를 갖옷 몫 무게로 · 그리지 않는다)
_EPS = 1e-6                                # 수치 허용(1µm · 설계 수 아님) — 민 링 위에 정확히 얹힌 점의 부동소수 잔차
_ELLIPSE_SAMPLES = 256                     # 수치 표본(설계 수 아님) — 시트 타원의 볼록 껍질을 잡는 점 수 · 배로 늘려도 링이 0.01mm 안에서 같다(보고 T604 §②)


# ── 시트 정본 읽기 — `char_render.py` 의 대입문만 풀어 돌린다(사본 0 · bpy 무접촉) ─────────────────────────
def sheet_tables():
    import render_common as rc
    src = open(SHEET_PY, encoding="utf-8").read()
    ns = {"math": math, "rc": rc}
    for node in ast.parse(src).body:
        names = set()
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name):
                    names.add(t.id)
                elif isinstance(t, ast.Tuple):
                    names |= {e.id for e in t.elts if isinstance(e, ast.Name)}
        elif isinstance(node, ast.FunctionDef):
            names.add(node.name)
        if names & set(_NEED):
            exec(compile(ast.Module(body=[node], type_ignores=[]), SHEET_PY, "exec"), ns)
    miss = [k for k in _NEED if k not in ns]
    if miss:
        raise SystemExit(f"[clothes] ★char_render.py 에서 못 읽었다: {miss}")
    S = {k: ns[k] for k in _NEED}
    S["BONE"] = {b[0]: (b[1], b[2]) for b in S["BONES"]}
    return S


def _interp_rings(rings, z, cols):
    """rings = [(z, ...)] 오름차순 · z 에서 cols 칸을 곧게 보간(밖이면 None)."""
    if z < rings[0][0] - 1e-12 or z > rings[-1][0] + 1e-12:
        return None
    for a, b in zip(rings, rings[1:]):
        if a[0] - 1e-12 <= z <= b[0] + 1e-12:
            t = 0.0 if b[0] == a[0] else (z - a[0]) / (b[0] - a[0])
            return tuple(a[c] + (b[c] - a[c]) * t for c in cols)
    return tuple(rings[-1][c] for c in cols)


# ── 평면 기하 — 볼록 껍질 · 반직선 반지름 ─────────────────────────────────────────────────────────
def _hull(pts):
    P = sorted(set((float(x), float(y)) for x, y in pts))
    if len(P) < 3:
        return P

    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


def _ray(poly, c, th):
    """다각형(닫힌 · 볼록) 경계까지 c 에서 각 th 반직선의 거리 — 못 맞으면 0."""
    dx, dy = math.cos(th), math.sin(th)
    best = 0.0
    n = len(poly)
    for i in range(n):
        px, py = poly[i]
        qx, qy = poly[(i + 1) % n]
        ex, ey = qx - px, qy - py
        den = dx * ey - dy * ex
        if abs(den) < 1e-15:
            continue
        wx, wy = px - c[0], py - c[1]
        t = (wx * ey - wy * ex) / den
        s = (wx * dy - wy * dx) / den
        if -1e-12 <= s <= 1 + 1e-12 and t > best:
            best = t
    return best


def _ellipse_pts(cx, cy, rx, ry):
    a = np.arange(_ELLIPSE_SAMPLES) * (2 * math.pi / _ELLIPSE_SAMPLES)
    return list(zip(cx + rx * np.cos(a), cy + ry * np.sin(a)))


# ── 시트 쪽 — 몸 단면(몸통 타원 ∪ 두 다리 타원)의 볼록 껍질 · 옷 링 타원 → 방향마다 여유 ─────────────────────
def sheet_body_hull(S, zs):
    pts = []
    tr = _interp_rings(sorted(S["TORSO_R"]), zs, (1, 2, 3, 4))
    if tr:
        pts += _ellipse_pts(*tr)
    lr = _interp_rings(sorted(S["LEG_R"]), zs, (1, 2))                 # 시트 `LEG_R` 는 위→아래 — 오름차순으로
    if lr:
        ly = S["BONE"]["thighL"][0][1]                   # 시트 다리 축 y(= HIP_W × 0.62 · 뼈 표)
        for sg in (+1, -1):
            pts += _ellipse_pts(0.0, sg * ly, lr[0] * S["LIMB_K"], lr[1] * S["LIMB_K"])
    return _hull(pts)


def ellipse_r(rx, ry, th):
    c, s = math.cos(th), math.sin(th)
    return 1.0 / math.sqrt((c / rx) ** 2 + (s / ry) ** 2)


def sheet_tube(S, cut):
    """시트 옷 몸통 링(아래→위): (zs, rx, ry) — 옷자락(웃옷 단 아래 링) + 웃옷. 여(무릎 단)는 무릎 링을 맨 아래에(여유 = 옷자락 맨 아래 링)."""
    tu = [(r[0], r[3], r[4]) for r in S["TUNIC_R"]]
    sk = [(r[0], r[3], r[4]) for r in S["SKIRT_R"] if r[0] < tu[0][0]]   # 웃옷 단(0.880) 위 링(0.905)은 웃옷 속에 숨는다 — 겉 실루엣만
    rings = sorted(sk + tu)
    if cut["hem"] == "knee":
        rings = [(S["Z_KNEE"], None, None)] + rings      # 둘레는 옷자락 맨 아래 링의 여유 + 늘어짐 규칙(아래)
    return rings


def sheet_ease_tube(S, zs, rx, ry, N):
    hull = sheet_body_hull(S, zs)
    return [ellipse_r(rx, ry, 2 * math.pi * k / N) - _ray(hull, (0.0, 0.0), 2 * math.pi * k / N) for k in range(N)]


def sheet_garment_at(S, rings, zs):
    """시트 옷 링 표를 zs 에서 곧게 보간(사이에 넣는 링의 시트 둘레)."""
    rr = [r for r in rings if r[1] is not None]
    v = _interp_rings(rr, zs, (1, 2))
    return v if v else (rr[0][1], rr[0][2])


# ── 3D 쪽 — MPFB 몸(모양 열쇠 섞은 자리 · 보조 기하 포함) · 뼈 자리 · 점마다 으뜸 뼈 ───────────────────────────
class Body:
    def __init__(self, base, rig):
        masks = [m for m in base.modifiers if m.type == "MASK"]
        was = [m.show_viewport for m in masks]
        for m in masks:
            m.show_viewport = False
        dg = bpy.context.evaluated_depsgraph_get()
        ev = base.evaluated_get(dg)
        me = ev.to_mesh()
        self.co = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
        ev.to_mesh_clear()
        for m, w in zip(masks, was):
            m.show_viewport = w
        n = len(base.data.vertices)
        if len(self.co) != n:
            raise SystemExit("[clothes] ★평가한 몸 점 수가 몸 메시와 다르다(가리개를 다 못 껐다)")
        gname = {g.index: g.name for g in base.vertex_groups}
        bones = set(rig.data.bones.keys())
        self.body = np.zeros(n, dtype=bool)
        self.skirt = np.zeros(n, dtype=bool)
        self.dom = [None] * n
        for v in base.data.vertices:
            best, bw = None, 0.0
            for g in v.groups:
                nm = gname[g.group]
                if nm == "body":
                    self.body[v.index] = True
                elif nm == "helper-skirt":
                    self.skirt[v.index] = True
                elif nm in bones and g.weight > bw:
                    best, bw = nm, g.weight
            self.dom[v.index] = best
        self.faces = [tuple(p.vertices) for p in base.data.polygons]
        self.B = {b.name: (np.array(b.head_local[:]), np.array(b.tail_local[:])) for b in rig.data.bones}
        self.chain = {}
        for side, root in (("L", "LeftArm"), ("R", "RightArm")):
            self.chain[side] = {root} | {c.name for c in rig.data.bones[root].children_recursive}
        bz = self.co[self.body][:, 2]
        self.top = float(bz.max())

    def bz(self, a, b=None, end="head"):
        h = (self.B[a][0] if end == "head" else self.B[a][1])
        if b:
            h2 = (self.B[b][0] if end == "head" else self.B[b][1])
            return float((h[2] + h2[2]) / 2)
        return float(h[2])

    def edges_of(self, mask):
        """몸 면(점이 다 `body`)의 모서리 가운데 한 끝이라도 mask 안인 것(고유) — 경계 모서리도 든다(무리 가장자리 점이 단면에서 안 빠진다)."""
        E = set()
        for f in self.faces:
            if all(self.body[i] for i in f) and any(mask[i] for i in f):
                for i in range(len(f)):
                    a, b = f[i], f[(i + 1) % len(f)]
                    if mask[a] or mask[b]:
                        E.add((a, b) if a < b else (b, a))
        return np.array(sorted(E), dtype=np.int64)


def _slice(co, E, p0, nrm):
    """모서리 E 가 평면(p0 · 법선 nrm)을 지나는 점들(3D)."""
    if len(E) == 0:
        return np.zeros((0, 3))
    A, Bv = co[E[:, 0]], co[E[:, 1]]
    da, db = (A - p0) @ nrm, (Bv - p0) @ nrm
    m = ((da < 0) & (db >= 0)) | ((db < 0) & (da >= 0))
    t = (da[m] / (da[m] - db[m]))[:, None]
    return A[m] + t * (Bv[m] - A[m])


# ── 링 → 로프트 ─────────────────────────────────────────────────────────────────────────────
F_AX = np.array([0.0, -1.0, 0.0])       # MPFB 앞(−y) — 시트 +x(캐릭터가 보는 쪽)
L_AX = np.array([1.0, 0.0, 0.0])        # MPFB +x = 캐릭터 왼쪽 — 시트 +y


def _ring_pts(r):
    """링 r = {c(3D 가운데), u, w(평면 두 축), rad[k]} → 점 N 개(k=0 이 앞 · 시트 a=0)."""
    N = len(r["rad"])
    return [r["c"] + r["rad"][k] * (math.cos(2 * math.pi * k / N) * r["u"] + math.sin(2 * math.pi * k / N) * r["w"]) for k in range(N)]


def make(sex, base, rig, outdir, cell_px, pad_px, ClothesService, log=print):
    """몸 하나의 옷 기하(본 옷 하나 — [T654] 갖옷은 같은 기하 + 털 두께 방향)를 짓고 MPFB 로 묶어 .mhclo + .obj 로 쓴다.
    돌려주는 것: {'base': mhclo 경로, 'inflate': {'dir': 점마다 털 두께 방향, 'pad': 두께, 'verts': 지은 점(묶기 앞 · 차례 맞대기)}, 'fur': [T685] 갖옷 묶기 mhclo 경로(그리지 않는다 — 뼈 무게 재료), 'furVerts': 그 지은 점, 'info': {...}}
    (자리·방향·두께는 MPFB 좌표 — 내보내기가 몸과 같은 변환을 건다)."""
    S = sheet_tables()
    N = int(S["LOFT_SEG"])
    cut = CUTS[sex]
    Bd = Body(base, rig)
    co = Bd.co
    K = Bd.top / S["H_TOT"]                                         # 키 비 — 시트 미터 → 3D 미터(여유·털 두께)
    # 높이 맞대기 — 시트 뼈 자리 ↔ MPFB 관절(사이는 곧게)
    knots = [(S["Z_ANKLE"], Bd.bz("LeftFoot", "RightFoot")), (S["Z_KNEE"], Bd.bz("LeftLeg", "RightLeg")),
             (S["Z_HIP"], Bd.bz("LeftUpLeg", "RightUpLeg")), (S["Z_SHLD"], Bd.bz("LeftArm", "RightArm")),
             (S["Z_NECK"], Bd.bz("Head")), (S["H_TOT"], Bd.top)]
    zs_k, z3_k = [k[0] for k in knots], [k[1] for k in knots]
    to3 = lambda zs: float(np.interp(zs, zs_k, z3_k))
    to_s = lambda z3: float(np.interp(z3, z3_k, zs_k))
    hip3 = Bd.bz("LeftUpLeg", "RightUpLeg")

    # ── 소매 축(몸 양쪽) — 시트 위팔(uarm: 어깨관절 → 팔꿈치) · 아래팔(larm: 팔꿈치 → 손목) ↔ MPFB LeftArm · LeftForeArm
    zU0, zU1 = S["BONE"]["uarmL"][0][2], S["BONE"]["uarmL"][1][2]
    zL0, zL1 = S["BONE"]["larmL"][0][2], S["BONE"]["larmL"][1][2]
    slv = [(r[0], r[1] * S["LIMB_K"], r[2] * S["LIMB_K"]) for r in S["SLV_R"]]                  # 시트 소매 링(위→아래)
    arm_at = lambda zs: tuple(v * S["LIMB_K"] for v in _interp_rings(sorted(S["ARM_R"]), zs, (1, 2)))
    if cut["sleeve"] == "long":
        e_last = (slv[-1][1] - arm_at(slv[-1][0])[0], slv[-1][2] - arm_at(slv[-1][0])[1])        # 소매 끝 링의 여유(시트)
        for r in S["ARM_R"]:
            if zL1 - 1e-9 <= r[0] < slv[-1][0]:
                slv.append((r[0], r[1] * S["LIMB_K"] + e_last[0], r[2] * S["LIMB_K"] + e_last[1]))
    side_par = {}
    for side, (bu, bf) in (("L", ("LeftArm", "LeftForeArm")), ("R", ("RightArm", "RightForeArm"))):
        A, E = Bd.B[bu][0], Bd.B[bu][1]
        W = Bd.B[bf][1]

        def at(zs, A=A, E=E, W=W):                                   # 시트 팔 높이 → 3D 축 위 점 · 축 방향
            if zs >= zU1:
                s = (zU0 - zs) / (zU0 - zU1)
                return A + s * (E - A), (E - A) / np.linalg.norm(E - A), ("arm", s)
            s = (zL0 - zs) / (zL0 - zL1)
            return E + s * (W - E), (W - E) / np.linalg.norm(W - E), ("farm", s)
        side_par[side] = at
    s_top = (zU0 - slv[0][0]) / (zU0 - zU1)                         # 소매 위 끝(어깨관절보다 조금 위 — 시트 1.405)

    # ── 점 무리 — 몸통 관(웃옷·옷자락이 감쌀 몸) · 팔(소매가 감쌀 몸) ─────────────────────────────────────
    n = len(co)
    par = {}                                                         # 팔 사슬 점 → (쪽, 'arm'|'farm', 매개)
    for i in range(n):
        if not Bd.body[i] or Bd.dom[i] is None:
            continue
        for side in ("L", "R"):
            if Bd.dom[i] in Bd.chain[side]:
                bu = "LeftArm" if side == "L" else "RightArm"
                A, E = Bd.B[bu]
                s = float((co[i] - A) @ (E - A) / ((E - A) @ (E - A)))
                par[i] = (side, s)
    tube = np.array([Bd.body[i] and (i not in par or par[i][1] < s_top) for i in range(n)])   # 소매 위 끝보다 어깨 쪽 팔 점은 웃옷 몫
    upper = np.array([tube[i] and (Bd.dom[i] not in ("LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase")) for i in range(n)])
    E_tube = Bd.edges_of(tube)

    # ── ① 소매 — 축을 따라 · 링마다 이웃 링 사이 팔 점의 반지름 최대 + 시트 여유 × K ─────────
    #   ★소매 위 끝은 막는다(시트 `loft()` 의 윗 뚜껑 — 네모 여덟: 가운데 + 테두리 셋씩) · 소매 끝(손목 쪽)은 열린다(팔이 지난다)
    sleeves = {}
    for side in ("L", "R"):
        at = side_par[side]
        geo = [at(r[0]) for r in slv]
        frames = []
        for g in geo:
            c, a, _ = g
            u = F_AX - (F_AX @ a) * a
            u /= np.linalg.norm(u)
            w = np.cross(a, u)                                       # u × w = a(링이 나아가는 쪽) — 면 감김이 관과 같다(겉이 바깥) · 시트 타원은 좌우 대칭
            frames.append((c, a, u, w))
        arm_pts = [i for i, (sd, s) in par.items() if sd == side and s >= s_top]
        # 팔 점의 링 매개: 링 사이 구간을 축 투영으로 찾는다(위팔 → 아래팔)
        rad = [[0.0] * N for _ in geo]
        for i in arm_pts:
            p = co[i]
            best = None
            for j in range(len(geo) - 1):
                c0, a0 = frames[j][0], frames[j][1]
                c1 = frames[j + 1][0]
                seg = c1 - c0
                L2 = seg @ seg
                t = float((p - c0) @ seg / L2) if L2 > 0 else 0.0
                if -1e-9 <= t <= 1 + 1e-9:
                    best = (j, t)
                    break
            if best is None:
                continue                                             # 소매 밖(손목 아래 · 위팔 끝 너머)
            j, t = best
            for jj in (j, j + 1):
                c, a, u, w = frames[jj]
                d = p - c
                d = d - (d @ a) * a
                rv = float(np.linalg.norm(d))
                th = math.atan2(float(d @ w), float(d @ u)) % (2 * math.pi)
                k = int(th // (2 * math.pi / N)) % N
                for kk in (k, (k + 1) % N):
                    rad[jj][kk] = max(rad[jj][kk], rv)
        rings_s = []
        for j, ((c, a, u, w), r) in enumerate(zip(frames, slv)):
            ar = arm_at(r[0])
            e = [K * (ellipse_r(r[1], r[2], 2 * math.pi * k / N) - ellipse_r(ar[0], ar[1], 2 * math.pi * k / N)) for k in range(N)]
            rings_s.append({"zs": r[0], "c": c, "u": u, "w": w, "rad": [rad[j][k] + e[k] for k in range(N)], "ease": e, "part": at(r[0])[2][0]})
        empty = [j for j, rr in enumerate(rad) if min(rr) <= 0.0]
        if empty:
            raise SystemExit(f"[clothes] ★{sex}{side} 소매 링 {empty} 에 팔 점이 안 든 방향이 있다")
        sleeves[side] = rings_s

    # ── ② 몸통 관 링 — 시트 링 높이 · 단면 껍질 + 시트 여유 × K ────────────────────────────────────────
    srings = sheet_tube(S, cut)
    ease_cache = {}

    def ease_tube(zs):
        key = round(zs, 9)
        if key not in ease_cache:
            if zs < srings[1][0] - 1e-12 and srings[0][1] is None:   # 무릎 링(여): 옷자락 맨 아래 링의 여유
                g = srings[1]
                ease_cache[key] = sheet_ease_tube(S, g[0], g[1], g[2], N)
            else:
                rx, ry = sheet_garment_at(S, srings, zs)
                ease_cache[key] = sheet_ease_tube(S, zs, rx, ry, N)
        return ease_cache[key]

    def tube_ring(z3, extra=()):
        pts = _slice(co, E_tube, np.array([0.0, 0.0, z3]), np.array([0.0, 0.0, 1.0]))
        P2 = [(float(p @ F_AX), float(p @ L_AX)) for p in pts]
        if len(P2) < 3:
            raise SystemExit(f"[clothes] ★{sex} 몸통 단면이 비었다(z {z3:.4f})")
        xs, ys = [p[0] for p in P2], [p[1] for p in P2]
        c2 = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
        h = _hull(P2 + [(c2[0] + x, c2[1] + y) for x, y in extra])
        e = ease_tube(to_s(z3))
        rad = [_ray(h, c2, 2 * math.pi * k / N) + K * e[k] for k in range(N)]
        c3 = c2[0] * F_AX + c2[1] * L_AX + np.array([0.0, 0.0, z3])
        return {"z": z3, "zs": to_s(z3), "c": c3, "u": F_AX, "w": L_AX, "rad": rad, "ease": [K * x for x in e], "sheet": True, "extra": list(extra)}

    rings = [tube_ring(to3(r[0])) for r in srings]
    for r, s0 in zip(rings, srings):
        r["zs"] = s0[0]
    # ⓓ 뚫림 잡기 — 몸 점마다(관 무리 · 관 높이 안): 그 높이·방향의 옷 둘레(링 점을 잇는 곧은 현) ≥ 점 반지름
    #   못 미치면 그 높이에 링을 하나 더 넣는다 · 링 자리 그 자체면 그 점을 그 링 껍질에 넣어 다시 잰다(그래도 현이 모자라면 두 방향을 민다)
    vi = np.where(tube & (co[:, 2] > rings[0]["z"]) & (co[:, 2] < rings[-1]["z"]))[0]
    inserted = bumped = 0
    for _ in range(400):
        worst, wz, wk = 0.0, None, None
        zr = [r["z"] for r in rings]
        for i in vi:
            pv = co[i]
            z = pv[2]
            j = int(np.searchsorted(zr, z)) - 1
            a, b = rings[j], rings[j + 1]
            t = (z - a["z"]) / (b["z"] - a["z"])
            c = a["c"] + t * (b["c"] - a["c"])
            d = pv - c
            x, y = float(d @ F_AX), float(d @ L_AX)
            rv, th = math.hypot(x, y), math.atan2(y, x) % (2 * math.pi)
            k = int(th // (2 * math.pi / N)) % N
            k2 = (k + 1) % N
            f = (th - k * 2 * math.pi / N) / (2 * math.pi / N)
            ra = (1 - t) * a["rad"][k] + t * b["rad"][k]
            rb = (1 - t) * a["rad"][k2] + t * b["rad"][k2]
            # 현(k → k2) 위의 반지름(그 방향) — 두 끝 점을 잇는 곧은 선 · 요구 = 몸 점이 옷 안(뚫림 0)
            #   ★여유(시트)는 링 점에서 준다 — 현은 링 점 사이를 곧게 자르므로(각 16) 긴 단면의 옆구리에서 몇 mm 덜 뜬다(그 몫은 여유가 먹는다)
            p1 = (ra * math.cos(k * 2 * math.pi / N), ra * math.sin(k * 2 * math.pi / N))
            p2 = (rb * math.cos(k2 * 2 * math.pi / N), rb * math.sin(k2 * 2 * math.pi / N))
            rg = _ray([p1, p2], (0.0, 0.0), th)
            if rv - rg > max(worst, _EPS):
                worst, wz, wk = rv - rg, float(z), (x, y)
        if wz is None:
            break
        if os.environ.get("T604_DEBUG"):
            log(f"  [뚫림] {sex} 모자람 {worst*1000:.2f}mm · z {wz:.4f} · 방향 {wk}")
        zr = [r["z"] for r in rings]
        j = int(np.searchsorted(zr, wz))
        near = j - 1 if abs(wz - zr[j - 1]) <= abs(zr[j] - wz) else j
        if abs(wz - zr[near]) < 1e-6:                                # 링 자리 그 자체(그 단면이 그 점을 못 잡았다) — 그 점을 껍질에 넣어 링을 다시 잰다
            old = rings[near]
            if any(abs(q[0] - wk[0]) < 1e-9 and abs(q[1] - wk[1]) < 1e-9 for q in old["extra"]):
                th = math.atan2(wk[1], wk[0]) % (2 * math.pi)       # 껍질에 넣었는데도 현이 모자라면(뾰족한 껍질 모서리) 그 두 방향을 모자란 만큼 민다
                k = int(th // (2 * math.pi / N)) % N
                for kk in (k, (k + 1) % N):
                    old["rad"][kk] += worst
            else:
                nr = tube_ring(old["z"], old["extra"] + [wk])
                nr["sheet"], nr["zs"] = old["sheet"], old["zs"]
                rings[near] = nr
            bumped += 1
            continue
        nr = tube_ring(wz)
        nr["sheet"] = False
        rings.insert(j, nr)
        inserted += 1
    else:
        raise SystemExit(f"[clothes] ★{sex} 뚫림 잡기가 안 끝난다")
    # 늘어짐 — 엉덩관절 아래는 아래로 좁아지지 않는다(위 링에서 내려오며 방향마다 큰 쪽)
    below = [i for i, r in enumerate(rings) if r["z"] <= hip3]
    for i in reversed(below):
        if i + 1 < len(rings):
            rings[i]["rad"] = [max(a, b) for a, b in zip(rings[i]["rad"], rings[i + 1]["rad"])]

    # ── ③ 허리띠 — 시트 `BELT_R` 높이(+ 그 사이 관 링 높이) · 관 겉면 + 시트 띠 여유(띠 − 웃옷) × K ──────────────
    def tube_at(z3):
        zr = [r["z"] for r in rings]
        j = max(1, min(len(rings) - 1, int(np.searchsorted(zr, z3))))
        a, b = rings[j - 1], rings[j]
        t = (z3 - a["z"]) / (b["z"] - a["z"])
        return a["c"] + t * (b["c"] - a["c"]), [(1 - t) * x + t * y for x, y in zip(a["rad"], b["rad"])]
    bz3 = [to3(r[0]) for r in S["BELT_R"]]
    bzs = sorted(set(bz3 + [r["z"] for r in rings if bz3[0] < r["z"] < bz3[-1]]))
    tu_rings = [(r[0], r[3], r[4]) for r in S["TUNIC_R"]]
    belt = []
    for z3 in bzs:
        zs = to_s(z3)
        brx, bry = _interp_rings([(r[0], r[3], r[4]) for r in S["BELT_R"]], zs, (1, 2))
        trx, try_ = _interp_rings(tu_rings, zs, (1, 2))
        c, rad = tube_at(z3)
        e = [K * (ellipse_r(brx, bry, 2 * math.pi * k / N) - ellipse_r(trx, try_, 2 * math.pi * k / N)) for k in range(N)]
        belt.append({"z": z3, "zs": zs, "c": c, "u": F_AX, "w": L_AX, "rad": [r + x for r, x in zip(rad, e)], "ease": e})

    # ── ④ 메시 — 관 · 소매 둘 · 띠 (네모 면만 · 열린 관) · UV(칸 안 고른 결 밀도) · 점 무리 ───────────────────────
    def perim(r):
        P = _ring_pts(r)
        return float(sum(np.linalg.norm(P[k] - P[(k + 1) % N]) for k in range(N)))

    def length(rs):
        return float(sum(np.linalg.norm(b["c"] - a["c"]) for a, b in zip(rs, rs[1:])))
    isl = [("tube", rings), ("slvL", sleeves["L"]), ("slvR", sleeves["R"]), ("belt", belt)]
    dims = {nm: (max(perim(r) for r in rs), length(rs)) for nm, rs in isl}
    Wpx, Hpx = cell_px[0] - 2 * pad_px, cell_px[1] - 2 * pad_px            # 칸 안쪽(번짐 막이 뺀) — export `remap_uv` 와 같은 자
    rows = [["tube"], ["slvL", "slvR"], ["belt"]]
    gap = 2 * pad_px                                                   # 섬 사이 = 번짐 막이 둘(허리띠 짙은 띠를 한 PAD 넓혀 칠해도 이웃 섬에 안 닿는다)
    dpx = min(min((Wpx - 2 * pad_px - (len(row) - 1) * gap) / sum(dims[nm][0] for nm in row) for row in rows),
              (Hpx - 2 * pad_px - (len(rows) - 1) * gap) / sum(max(dims[nm][1] for nm in row) for row in rows))   # 미터당 화소(고른 결 밀도)
    place = {}
    vtop = Hpx - pad_px
    for row in rows:
        h = max(dims[nm][1] for nm in row)
        x = pad_px
        for nm in row:
            place[nm] = (x, vtop - dims[nm][1] * dpx)                  # (왼쪽 px, 아래 px) — UV v 는 아래가 0
            x += dims[nm][0] * dpx + gap
        vtop -= h * dpx + gap
    trim = (place["belt"][1] / Hpx, (place["belt"][1] + dims["belt"][1] * dpx) / Hpx)

    def build(variant):
        padm = K * S["FUR_PAD"] if variant == "fur" else 0.0     # [T685] 갖옷 묶기 재료 = T604 갖옷 판 식 그대로(둘레 + 두께)
        V, Fc, UV, grp, D = [], [], [], [], []
        for nm, rs in isl:
            base_i = len(V)
            x0, y0 = place[nm]
            acc = 0.0
            for j, r in enumerate(rs):
                rr = dict(r)
                rr["rad"] = [x + padm for x in r["rad"]]
                V += _ring_pts(rr)
                D += _ring_pts(dict(r, c=np.zeros(3), rad=[1.0] * N))  # ★[T654] 털 두께 방향 = 링 평면의 바깥 단위 벡터(ⓔ 갖옷 = 둘레 + 두께 — T604 갖옷 기하가 민 방향 그대로)
                if nm == "tube":
                    g = "t604_upper" if r["z"] > hip3 else "helper-skirt"
                elif nm == "belt":
                    g = "t604_upper"
                else:
                    g = f"t604_{'farm' if r['part'] == 'farm' else 'arm'}{nm[-1]}"
                grp += [g] * N
                if j:
                    acc += float(np.linalg.norm(r["c"] - rs[j - 1]["c"]))
                r["_v"] = acc
            if nm.startswith("slv"):                                  # 소매 위 끝 뚜껑 — 가운데 점 + 네모 여덟(겉 = 어깨 쪽 · 감김을 거꾸로)
                ci = len(V)
                V.append(rs[0]["c"])
                D.append(np.zeros(3))                                  # 뚜껑 가운데는 둘레가 아니다 — 두께 0(T604 갖옷 판도 안 밀었다)
                grp.append(f"t604_arm{nm[-1]}")
                cr = sum(rs[0]["rad"]) / N + padm
                cu = (x0 + dims[nm][0] * dpx / 2, y0 + dims[nm][1] * dpx - cr * dpx)   # 섬 안 작은 원(결이 되풀이되니 겹쳐도 같다)
                for k in range(0, N, 2):
                    q = [base_i + (k + d) % N for d in (2, 1, 0)]
                    Fc.append((ci, q[0], q[1], q[2]))
                    UV.append([(cu[0] / Wpx, cu[1] / Hpx)] + [((cu[0] + cr * dpx * math.cos(2 * math.pi * ((k + d) % N) / N)) / Wpx,
                                                                (cu[1] + cr * dpx * math.sin(2 * math.pi * ((k + d) % N) / N)) / Hpx) for d in (2, 1, 0)])
            for j in range(len(rs) - 1):
                for k in range(N):
                    k2 = (k + 1) % N
                    a0, a1 = base_i + j * N + k, base_i + j * N + k2
                    b0, b1 = base_i + (j + 1) * N + k, base_i + (j + 1) * N + k2
                    Fc.append((a0, a1, b1, b0))
                    # UV — 둘레 매개(뒤 가운데 k = N/2 에서 끊는다 — 끝 열은 1) × 섬 너비 · 길이 매개 × 섬 높이
                    qa = ((k - N // 2) % N) / N
                    qb = ((k2 - N // 2) % N) / N or 1.0
                    va = (y0 + (dims[nm][1] - rs[j]["_v"]) * dpx) / Hpx
                    vb = (y0 + (dims[nm][1] - rs[j + 1]["_v"]) * dpx) / Hpx
                    ua = (x0 + qa * dims[nm][0] * dpx) / Wpx
                    ub = (x0 + qb * dims[nm][0] * dpx) / Wpx
                    UV.append([(ua, va), (ub, va), (ub, vb), (ua, vb)])
        me = bpy.data.meshes.new(f"t604_{sex}_{variant}")
        me.from_pydata([tuple(map(float, v)) for v in V], [], Fc)
        me.update()
        uvl = me.uv_layers.new(name="UVMap")
        for p, quad in zip(me.polygons, UV):
            for li, (u, v) in zip(p.loop_indices, quad):
                uvl.data[li].uv = (u, v)
        ob = bpy.data.objects.new(f"t604_{sex}_{variant}", me)
        bpy.context.scene.collection.objects.link(ob)
        for g in sorted(set(grp)):
            ob.vertex_groups.new(name=g)
        by = {}
        for i, g in enumerate(grp):
            by.setdefault(g, []).append(i)
        for g, idx in by.items():
            ob.vertex_groups[g].add(idx, 1.0, "REPLACE")
        return ob, len(Fc) * 2, V, D

    # ── ⑤ 몸 무리(묶을 자리) — 몸 메시에 잠깐 세운다 · 옷 점은 제 무리의 가장 가까운 몸 면에 묶인다 ─────────────────
    groups = {"t604_upper": [i for i in range(n) if upper[i]]}
    for side in ("L", "R"):
        groups[f"t604_arm{side}"] = [i for i, (sd, s) in par.items() if sd == side and s >= s_top and Bd.dom[i] in ("LeftArm", "RightArm")]
        groups[f"t604_farm{side}"] = [i for i, (sd, s) in par.items() if sd == side and Bd.dom[i] in ("LeftForeArm", "RightForeArm")]
    made = []
    for g, idx in groups.items():
        vg = base.vertex_groups.new(name=g)
        vg.add(sorted(idx), 1.0, "REPLACE")
        made.append(vg)
    os.makedirs(outdir, exist_ok=True)
    out = {"info": {"rings": len(rings), "inserted": inserted, "bumped": bumped, "sheetRings": len(srings), "belt": len(belt),
                    "sleeve": len(sleeves["L"]), "K": round(K, 6), "hem3": round(rings[0]["z"], 5),
                    "hemS": srings[0][0], "trimV": [round(trim[0], 6), round(trim[1], 6)], "cut": dict(cut)}}
    # ★묶기 = MPFB `ClothesService.create_mhclo_from_clothes_matching` 의 고리 그대로(같은 클래스 · 같은 인자) —
    #   다른 것은 하나: 몸 단면표(`MeshCrossRef` · 몸 19,158점 · 무리 백여 개 — 한 번에 30초)를 미리 한 번 짓는다(MPFB 는 부를 때마다 새로 짓는다 ·
    #   T604 판은 옷 둘이 같이 썼다 · [T654] 기하는 하나).
    #   옷 규약 검사(`mesh_is_valid_as_clothes`)도 같은 표를 다시 짓는다 — 같은 조건을 여기서 바로 잰다(네모 면만 · 점마다 무리 하나 · 무리가 몸에 있다).
    import sys as _sys
    _cm = _sys.modules[ClothesService.__module__]
    ref = ClothesService.get_reference_scale(base)
    xb = _cm.MeshCrossRef(base, after_modifiers=True, build_faces_by_group_reference=True, cache_dir=None, write_cache=False, read_cache=False)
    sf = _cm.GeneralObjectProperties.get_value("scale_factor", entity_reference=base)
    have = {g.name for g in base.vertex_groups}
    for variant in VARIANTS:
        ob, ntri, V, D = build(variant)
        bad = [p.index for p in ob.data.polygons if len(p.vertices) != 4]
        ng = [len(v.groups) for v in ob.data.vertices]
        miss = [g.name for g in ob.vertex_groups if g.name not in have]
        if bad or min(ng) != 1 or max(ng) != 1 or miss:
            raise SystemExit(f"[clothes] ★{sex} {variant} 옷 메시가 MPFB 옷 규약에 안 맞다: 네모 아닌 면 {len(bad)} · 무리 수 {min(ng)}~{max(ng)} · 없는 무리 {miss}")
        nm = f"bronze_{sex.lower()}_{variant}"
        mh = _cm.Mhclo()
        mh.verts = dict()
        mh.clothes = ob
        for k, v in {"name": nm, "author": "durango-mini_T604", "license": "CC0",
                     "description": f"T604 bronze-age tunic {sex} {variant} from char_render.py ring tables",
                     "uuid": str(uuid.uuid5(uuid.NAMESPACE_URL, f"durango-mini/T604/{nm}"))}.items():
            setattr(mh, k, v)
        xc = _cm.MeshCrossRef(ob, after_modifiers=True, build_faces_by_group_reference=True, cache_dir=None, write_cache=False, read_cache=False)
        mp = max(len(e) for e in xc.edges_by_vertex)
        if mp:
            mh.max_pole = mp
        for vi in range(len(xc.vertex_coordinates)):
            mh.verts[vi] = _cm.VertexMatch(ob, vi, xc, base, xb, scale_factor=sf, reference_scale=ref, allow_exact=True).mhclo_line
        path = os.path.join(outdir, nm + ".mhclo")
        mh.write_mhclo(path, also_export_mhmat=False, also_export_obj=True, reference_scale=ref)
        out[variant] = path
        out["info"][f"tris_{variant}"] = ntri
        out["info"][f"verts_{variant}"] = len(ob.data.vertices)
        # ★[T654] 갖옷 = 이 기하 + 털 두께 방향 × 두께(ⓔ) — 점 차례 = 지은 차례(.obj 점 차례 · 내보내기가 맞대어 잰다)
        if variant == "base":
            out["inflate"] = {"dir": [tuple(map(float, d)) for d in D], "pad": float(K * S["FUR_PAD"]), "verts": [tuple(map(float, v)) for v in V]}
        else:                                                          # [T685] 갖옷 묶기 — 점 차례 = 본 옷과 같다(같은 위상 · 같은 차례)
            out["furVerts"] = [tuple(map(float, v)) for v in V]
        bpy.data.objects.remove(ob, do_unlink=True)
        log(f"[clothes] {sex} {variant}: 링 관 {len(rings)}(시트 {len(srings)} + 넣음 {inserted} · 민 {bumped}) · 소매 {len(sleeves['L'])} · 띠 {len(belt)} · 삼각형 {ntri} → {os.path.basename(path)}")
    for vg in made:
        base.vertex_groups.remove(vg)
    return out
