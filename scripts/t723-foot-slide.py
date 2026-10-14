#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""t723-foot-slide — 걸음 한 주기 동안 **디딘 발이 땅 위에서 미끄러진 거리**를 잰다(3D 클립 · 2D 시트 둘 다).  [T723 ②]

    python3 scripts/t723-foot-slide.py --glb=<char_body.glb> [--out=<json>]                    # 3D(넘파이만 · glb 를 직접 풀어 스키닝)
    <bpy 파이썬> scripts/t723-foot-slide.py --sheet [--poses=<poses.json>] [--out=<json>]      # 2D(`char_render.py` 의 장면·리그·apply_pose 를 그대로 — 렌더 0)

★재는 법(새 수 0)
  ⓐ 클립은 제자리다(엉덩이 원점) — 게임에서는 몸이 게임 속도 v 로 나아간다(재생 주기 T = 판 수 ÷ fps 고정 · 클라 `charState` · `char3d.pose`).
  ⓑ 미끄러짐(열쇠 k → k+1) = 땅에 닿은 **같은 살 점**의 땅 위 앞뒤 이동 = (제자리 클립에서 그 점의 앞뒤 이동) + v·Δt.
     한 주기 합 = v·T − L  ·  L = 닿은 점이 몸 대비 뒤로 간 빠르기 × T(애니메이션의 '보폭' — 미끄러짐 0 이 되는 이동).
     ⇒ 맞추는 길 둘: ⓐ 주기 T' = L / v(재생 속도만 = 걸음 수만) · ⓑ 보폭 L' = v·T(보폭만 = 걸음 수 그대로).
  ⓒ 닿은 점 — 두 자:
     (가) 그 열쇠의 **양발 중 가장 낮은 살 점**(3D 내보내기 접지와 같은 자 — 정강이·발·발끝에 무게가 있는 살 점 · 2D = 짚신 상자 둘의 꼭짓점) =
          3D 가 땅에 세우는 그 점(열쇠마다 가장 낮은 점 = 0). 2D 시트는 접지를 안 한다(엉덩이 높이 고정 + 흔들림) — 공중 판에도 가장 낮은 발을 센다.
     (나) **디딘 발**만 — 자료 디딤 구간(그 발 위상 < 디딤 비율 · 왼발 위상 = φ0 + k/K · 오른발 + ½)에 양 끝이 다 드는 구간의 그 발 가장 낮은 점.
          φ0 = 모캡 왼 넓적다리 ↔ 자료 넓적다리 상관 맞춤(`mocap_retarget.gait_phase` · 시트·3D 같은 표본) — 모캡 다리(전)도 같은 창이라 같은 φ0
          (그 클립에 위상이 없으면 지금 `poses.json` 의 φ0) · 디딤 비율 = `gait_speeds.json`(다리 곡선을 뽑은 그 조건).
     (다) [T741] **땅에 세운 점** — 디딘 발(자료 디딤 구간 · 둘이면 둘 중) 가장 낮은 살 점 = T741 3D 접지 규칙 그대로 · 디딘 발 없는 열쇠(공중)는 안 센다 ·
          흔드는 발 − 디딘 발 높이 차 최저 · 공중 열쇠 수 · 공중 가장 낮은 살 최저도 적는다. `--body=M|F` 로 몸을 고른다(기본 = 메타 기본 몸).
  ⓓ 앞 = 모델 +x(3D: 클라가 +x 를 게임 방향으로 돌린다 · 2D: 방향 0 = +x · 짚신 앞코가 +x).
게임 속도: 걷기 `MOVE_SPEED` 64 px/s = 2.0 m/s(server/zone.js · 32 px = 1 m) · 달리기 × `SPRINT_MULT` 2.5 = 5.0 m/s. 재생: 걷기 8판 10 fps · 달리기 8판 14 fps(`char_render.py` CLIPS).
"""
import json
import math
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
V_GAME = {"walk": 64.0 / 32.0, "run": 64.0 * 2.5 / 32.0}          # m/s — server/zone.js MOVE_SPEED · SPRINT_MULT · 32 px = 1 m
CLIPS = {"walk": (8, 10.0), "run": (8, 14.0)}                      # 판 수 · fps — char_render.py CLIPS(3D 도 같은 표 · 열쇠 = 판 × 4)


def phase_now():
    """지금 `poses.json` 의 φ0(클립마다) — 위상이 없는 모캡 다리 클립의 디딤 구간 자."""
    src = json.load(open(os.path.join(ROOT, "assets-src", "mocap", "poses.json"), encoding="utf-8"))["source"]
    return {c: src[c]["gait"]["phase0"] for c in ("walk", "run")}


def duty_of():
    """자료 디딤 비율 — 다리 곡선을 뽑은 그 조건(`gait_norms.json` cond)의 `gait_speeds.json` 값."""
    gn = json.load(open(os.path.join(ROOT, "assets-src", "gait", "gait_norms.json"), encoding="utf-8"))
    gs = json.load(open(os.path.join(ROOT, "assets-src", "gait", "gait_speeds.json"), encoding="utf-8"))
    return {c: gs[c]["conds"][gn[c]["cond"]]["duty"] for c in ("walk", "run")}


def slide(P, side, dt, v, ph0=None, duty=None):
    """P[k] = 후보 점들의 (앞 x, 옆 y, 위 z) 목록(열쇠 k · 점 순서 고정) · side[i] = 'L'/'R' · 한 주기 고리.
       (가) 닿은 점 = 그 열쇠의 가장 낮은 점(양발 중) — 게임이 땅에 세우는 점(3D 접지 규약) 그대로.
       (나) 디딘 발 = 자료 디딤 구간(왼발 위상 φ0 + k/K · 오른발 + ½ · 위상 < 디딤 비율) 안의 그 발 가장 낮은 점만."""
    K = len(P)
    out = {"keys": K, "dt": dt, "T": K * dt, "steps": []}
    L = 0.0
    low = lambda k, f: min((i for i in range(len(P[k])) if f is None or side[i] == f), key=lambda i: (P[k][i][2], i))
    phase = lambda k, f: (ph0 + k / float(K) + (0.0 if f == "L" else 0.5)) % 1.0
    swing_low = 0
    for k in range(K):
        n = (k + 1) % K
        c = low(k, None)
        d = P[n][c][0] - P[k][c][0]
        L -= d
        st = {"k": k, "foot": side[c], "pt": c, "x": round(P[k][c][0], 5), "z": round(P[k][c][2], 5), "dx": round(d, 5),
              "gapMm": round(1000 * (min(P[k][i][2] for i in range(len(P[k])) if side[i] != side[c]) - P[k][c][2]), 2)}
        for f in ("L", "R"):                                   # 발마다 가장 낮은 점 · 그 같은 점의 다음 열쇠까지 앞뒤 이동(그림 · 발자국 띠)
            i = low(k, f)
            st["low" + f] = [round(P[k][i][0], 5), round(P[k][i][2], 5)] + ([phase(k, f) < duty] if ph0 is not None else [])
            st["dx" + f] = round(P[n][i][0] - P[k][i][0], 5)
        if ph0 is not None:
            st["stance"] = phase(k, side[c]) < duty
            swing_low += 0 if st["stance"] else 1
        out["steps"].append(st)
    T = K * dt
    out.update({"L": round(L, 5), "vAnim": round(L / T, 5), "v": v, "slipCycle": round(v * T - L, 5),
                "slipAbs": round(sum(abs(s["dx"] + v * dt) for s in out["steps"]), 5),
                "a_T": round(L / v, 5), "b_L": round(v * T, 5), "b_scale": round(v * T / L, 5) if L > 0 else None})
    if ph0 is not None:
        D, n_int = 0.0, 0
        for f in ("L", "R"):
            for k in range(K):
                n = (k + 1) % K
                if phase(k, f) < duty and phase(n, f) < duty and phase(n, f) > phase(k, f):
                    c = low(k, f)
                    D -= P[n][c][0] - P[k][c][0]
                    n_int += 1
        vs = D / (n_int * dt)
        Ls = vs * T
        out["stance"] = {"phase0": ph0, "duty": duty, "intervals": n_int, "vAnim": round(vs, 5), "L": round(Ls, 5),
                         "slipCycle": round(v * T - Ls, 5), "slipStance": round((v - vs) * duty * T, 5),
                         "a_T": round(Ls / v, 5), "b_L": round(v * T, 5), "b_scale": round(v * T / Ls, 5), "swingLowKeys": swing_low}
        # (다) [T741] 땅에 세운 점 = 디딘 발(자료 디딤 구간 · 둘이면 둘 중) 가장 낮은 살 점 — T741 3D 접지 규칙 그대로 · 디딘 발 없는 열쇠(공중)는 안 센다
        Dg = Sg = Sa = 0.0
        ng = 0
        sw_gap, air, air_min = [], 0, None
        for k in range(K):
            n = (k + 1) % K
            dd = [f for f in ("L", "R") if phase(k, f) < duty]
            if not dd:
                air += 1
                zz = min(P[k][i][2] for i in range(len(P[k])))
                air_min = zz if air_min is None else min(air_min, zz)
                continue
            cands = [i for i in range(len(P[k])) if side[i] in dd]
            c = min(cands, key=lambda i: (P[k][i][2], i))
            d = P[n][c][0] - P[k][c][0]
            Dg -= d
            Sg += d + v * dt
            Sa += abs(d + v * dt)
            ng += 1
            for f in ("L", "R"):                                   # 흔드는 발 − 디딘 발(가장 낮은 점끼리) 높이 차
                if f not in dd:
                    sw_gap.append(min(P[k][i][2] for i in range(len(P[k])) if side[i] == f) - P[k][c][2])
        out["grounded"] = {"keys": ng, "L": round(Dg, 5), "slipCycle": round(Sg, 5), "slipAbs": round(Sa, 5),
                           "swingGapMinMm": round(1000 * min(sw_gap), 3) if sw_gap else None, "airKeys": air,
                           "airMinMm": round(1000 * air_min, 3) if air_min is not None else None}
    return out


# ── 3D — glb 를 직접 푼다(넘파이) ───────────────────────────────────────────────────────────────
def glb_slide(path, body=None):
    import numpy as np
    b = open(path, "rb").read()
    jl = struct.unpack("<I", b[12:16])[0]
    J = json.loads(b[20:20 + jl])
    bl = struct.unpack("<I", b[20 + jl:24 + jl])[0]
    BIN = b[28 + jl:28 + jl + bl]
    CT = {5126: ("<f4", 4), 5125: ("<u4", 4), 5123: ("<u2", 2), 5121: ("u1", 1)}
    NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}

    def acc(i):
        a = J["accessors"][i]
        bv = J["bufferViews"][a["bufferView"]]
        dt_, sz = CT[a["componentType"]]
        nc = NC[a["type"]]
        st = bv.get("byteStride", sz * nc)
        off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        raw = np.frombuffer(BIN, dtype=np.uint8, count=st * (a["count"] - 1) + sz * nc, offset=off)
        out = np.lib.stride_tricks.as_strided(raw, shape=(a["count"], sz * nc), strides=(st, 1)).copy().view(dt_).reshape(a["count"], nc)
        return out.astype(np.float64)

    def quat(q):
        x, y, z, w = q
        return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                         [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                         [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])

    nodes = J["nodes"]
    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []):
            parent[c] = i
    meta = json.load(open(os.path.join(os.path.dirname(path), "char3d_meta.json"), encoding="utf-8"))
    body = body or meta["defaultBody"]
    mesh_node = next(i for i, n in enumerate(nodes) if n.get("name") == meta["bodies"][body]["mesh"])
    skin = J["skins"][nodes[mesh_node]["skin"]]
    joints = skin["joints"]
    IBM = acc(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)       # 열 우선 → 행렬
    prim = J["meshes"][nodes[mesh_node]["mesh"]]["primitives"][0]
    POS = acc(prim["attributes"]["POSITION"])
    JN = acc(prim["attributes"]["JOINTS_0"]).astype(int)
    WT = acc(prim["attributes"]["WEIGHTS_0"])
    # 접지 재료 = 정강이·발·발끝에 무게가 있는 살 점(`char_export_gltf.py` 접지와 같은 자)
    legj = {k for k, j in enumerate(joints) if any(nodes[j]["name"] == f"{body}_{s}{p}" for s in ("Left", "Right") for p in ("Leg", "Foot", "ToeBase"))}
    sel = [i for i in range(len(POS)) if any(JN[i, q] in legj and WT[i, q] > 0 for q in range(4))]
    sidej = {k: ("L" if "_Left" in nodes[j]["name"] else "R") for k, j in enumerate(joints) if k in legj}
    side = [sidej[max(((JN[i, q], WT[i, q]) for q in range(4) if JN[i, q] in legj), key=lambda t: t[1])[0]] for i in sel]
    clipsm = meta["clips"]
    kpf = meta["keysPerFrame"]

    def local(i, over):
        n = nodes[i]
        if "matrix" in n and i not in over:
            return np.array(n["matrix"]).reshape(4, 4).T
        t = over.get((i, "translation"), n.get("translation", [0, 0, 0]))
        r = over.get((i, "rotation"), n.get("rotation", [0, 0, 0, 1]))
        s = over.get((i, "scale"), n.get("scale", [1, 1, 1]))
        M = np.eye(4)
        M[:3, :3] = quat(r) @ np.diag(s)
        M[:3, 3] = t
        return M

    res = {}
    for clip, (nf, fps) in CLIPS.items():
        an = next(a for a in J["animations"] if a["name"] == f"{body}.{clip}")
        K = clipsm[clip]["keys"]
        ch = [(c["target"]["node"], c["target"]["path"], acc(an["samplers"][c["sampler"]]["input"])[:, 0], acc(an["samplers"][c["sampler"]]["output"]),
               an["samplers"][c["sampler"]].get("interpolation", "LINEAR")) for c in an["channels"]]

        def sample(pth, tin, tout, mode, t):
            """glTF 표본 — 열쇠에 서면 그 값 · STEP = 앞 열쇠 · LINEAR = 곧게(회전은 구면)."""
            j = int(np.searchsorted(tin, t + 1e-9)) - 1
            j = max(0, min(len(tin) - 1, j))
            if abs(tin[j] - t) < 1e-9 or mode == "STEP" or j == len(tin) - 1:
                return list(tout[j])
            f = (t - tin[j]) / (tin[j + 1] - tin[j])
            a, b_ = tout[j], tout[j + 1]
            if pth != "rotation":
                return list(a * (1 - f) + b_ * f)
            d = float(np.dot(a, b_))
            if d < 0:
                b_, d = -b_, -d
            if d > 0.9995:
                q = a * (1 - f) + b_ * f
            else:
                th = math.acos(d)
                q = (math.sin((1 - f) * th) * a + math.sin(f * th) * b_) / math.sin(th)
            return list(q / np.linalg.norm(q))
        P = []
        for k in range(K):
            over = {}
            for nd, pth, tin, tout, mode in ch:
                over[(nd, pth)] = sample(pth, tin, tout, mode, float(k))
            G = {}

            def glob(i):
                if i not in G:
                    G[i] = (glob(parent[i]) if i in parent else np.eye(4)) @ local(i, over)
                return G[i]
            JM = np.stack([glob(j) @ IBM[q] for q, j in enumerate(joints)])
            v4 = np.c_[POS[sel], np.ones(len(sel))]
            sk = np.zeros((len(sel), 4))
            for q in range(4):
                sk += WT[sel, q][:, None] * np.einsum("nij,nj->ni", JM[JN[sel, q]], v4)
            # glTF: x 앞 · y 위 · z 옆 → (앞, 옆, 위)
            P.append([(float(p[0]), float(p[2]), float(p[1])) for p in sk[:, :3]])
        dt = 1.0 / (fps * kpf)
        ph = (clipsm[clip].get("gait") or {}).get("phase0")
        res[clip] = slide(P, side, dt, V_GAME[clip], ph if ph is not None else PHASE[clip], DUTY[clip])
        res[clip]["phaseFrom"] = "clip" if ph is not None else "poses.json"
        res[clip].update({"fps": fps, "frames": nf, "a_fps": round(nf / res[clip]["a_T"], 4), "points": len(sel), "lowest": round(min(min(p[2] for p in Pk) for Pk in P), 5)})
    return {"kind": "3d", "src": os.path.relpath(path, ROOT) if path.startswith(ROOT) else path, "body": body,
            "heightM": meta.get("height"), "clips": res}


# ── 2D — `char_render.py` 의 장면·리그·apply_pose 를 그대로(렌더 0) ─────────────────────────────────
def sheet_slide(poses=None, tmpdir=None):
    import bpy  # noqa: F401
    p = os.path.join(HERE, "char_render.py")
    src = open(p, encoding="utf-8").read()
    cut = src.index("# ═══════════════ 공유 프레임 박스 ═══════════════")
    sys.argv = [p, "--", "--sheetdir=" + (tmpdir or os.path.join(ROOT, "scripts", "char_renders", "_t723_slide"))]
    ns = {"__file__": p, "__name__": "char_render_prefix"}
    exec(compile(src[:cut], p, "exec"), ns)
    if poses:
        ns["_MOCAP"] = json.load(open(poses, encoding="utf-8"))
        for c in ns["_MOCAP"]["clips"]:
            if c in ns["CLIP_LOOP0"]:
                ns["POSE_FN"][c] = ns["_pose_table"](c, ns["CLIP_LOOP0"][c])
    feet = [o for o in ns["ALLOBJ"] if o.name in ("footL", "footR")]
    res = {}
    for clip, (nf, fps) in CLIPS.items():
        if ns["CLIP_N"][clip] != nf or abs(ns["CLIP_FPS"][clip] - fps) > 1e-9:
            raise SystemExit(f"[slide] ★시트 클립 표가 갈렸다: {clip}")
        P, side = [], None
        for k in range(nf):
            ns["apply_pose"](clip, k, nf, 0)
            dg = bpy.context.evaluated_depsgraph_get()
            pts, sd = [], []
            for ob in sorted(feet, key=lambda o: o.name):
                eo = ob.evaluated_get(dg)
                me = eo.to_mesh()
                mw = eo.matrix_world
                for v in me.vertices:
                    w = mw @ v.co
                    pts.append((float(w.x), float(w.y), float(w.z)))
                    sd.append(ob.name[-1])
                eo.to_mesh_clear()
            P.append(pts)
            side = sd
        ph = ((ns["_MOCAP"].get("source") or {}).get(clip, {}).get("gait") or {}).get("phase0")
        res[clip] = slide(P, side, 1.0 / fps, V_GAME[clip], ph if ph is not None else PHASE[clip], DUTY[clip])
        res[clip]["phaseFrom"] = "clip" if ph is not None else "poses.json"
        res[clip].update({"fps": fps, "frames": nf, "a_fps": round(nf / res[clip]["a_T"], 4), "points": len(side), "lowest": round(min(min(q[2] for q in Pk) for Pk in P), 5)})
    return {"kind": "2d", "poses": os.path.relpath(poses, ROOT) if poses and poses.startswith(ROOT) else (poses or "assets-src/mocap/poses.json"),
            "heightM": ns["H_TOT"] if "H_TOT" in ns else None, "clips": res}


DUTY = duty_of()
PHASE = phase_now()


# ── 표 — 잰 값 ↔ 자료(속도별 보폭 · 분당 걸음) ─────────────────────────────────────────────────────
def table(items):
    """items = [(이름, json 경로)] → 두 표(마크다운). ⓐ/ⓑ 는 (나) 디딘 발의 L 로 · 자료 = `gait_speeds.json` 무차원 맞춤
       ln(보폭/키) = a + β ln(v/√(g·키)) — 그 몸의 키로 게임 속도에서 읽는다(맞춤 범위 밖이면 '밖'이라 적는다)."""
    gs = json.load(open(os.path.join(ROOT, "assets-src", "gait", "gait_speeds.json"), encoding="utf-8"))
    g = 9.81
    rows1 = ["| 경우 | 클립 | 주기 T(s) | (나) 디딘 발 L(m) · 빠르기(m/s) · 구간 | (나) 미끄러짐 v·T − L (cm/주기) | (나) 디딤 한 번(cm) | (가) 가장 낮은 점 L(m) | (가) 미끄러짐(cm/주기) | (가) 흔드는 발이 닿는 열쇠 |",
             "|---|---|---|---|---|---|---|---|---|"]
    rows2 = ["| 경우 | 클립 | 게임 v(m/s) · 키(m) | 지금 L(m) · 분당 | ⓐ 주기만: T'(s) · fps · 분당 · 보폭 | ⓑ 보폭만: L'(m) · ×배 · 분당 | 자료(그 키 · 그 속도): 보폭(m) · 분당 | ⓐ − 자료(보폭 · 분당) | ⓑ − 자료(보폭 · 분당) |",
             "|---|---|---|---|---|---|---|---|---|"]
    for name, p in items:
        d = json.load(open(p, encoding="utf-8"))
        H = d.get("heightM")
        for clip, c in d["clips"].items():
            s = c.get("stance")
            rows1.append(f"| {name} | {clip} | {c['T']:.4f} | {s['L']:.3f} · {s['vAnim']:.3f} · {s['intervals']} | {100 * s['slipCycle']:+.1f} | {100 * s['slipStance']:+.1f} | "
                         f"{c['L']:.3f} | {100 * c['slipCycle']:+.1f} | {s['swingLowKeys']}/{c['keys']} |")
            fit = gs[clip]["share"]["fitH"]
            vh = c["v"] / math.sqrt(g * H)
            sl = H * math.exp(fit["a"]) * vh ** fit["beta"]
            cad = 120.0 * c["v"] / sl
            lo_, hi_ = fit["vhatH"]
            inside = lo_ <= vh <= hi_
            note = "" if inside else f" (맞춤 범위 밖 — v/√(gH) {vh:.3f} > {hi_})"
            aT = s["L"] / c["v"]
            a_cad, b_cad, now_cad = 120.0 / aT, 120.0 / c["T"], 120.0 / c["T"]
            pct = lambda x, y: f"{100 * (x / y - 1):+.1f} %"
            rows2.append(f"| {name} | {clip} | {c['v']} · {H} | {s['L']:.3f} · {now_cad:.1f} | {aT:.4f} · {c['frames'] / aT:.2f} · {a_cad:.1f} · {s['L']:.3f} | "
                         f"{c['v'] * c['T']:.3f} · ×{c['v'] * c['T'] / s['L']:.3f} · {b_cad:.1f} | {sl:.3f} · {cad:.1f}{note} | "
                         f"{pct(s['L'], sl)} · {pct(a_cad, cad)} | {pct(c['v'] * c['T'], sl)} · {pct(b_cad, cad)} |")
    share = ["| 자료 | 조건 | β = d ln 보폭 / d ln 속도(사람마다 → 평균 ± 표준편차) | 걸음 수 몫 1 − β | 무차원 맞춤 β · 범위 v/√(gH) |", "|---|---|---|---|---|"]
    for clip, nm in (("walk", "WBDS 걷기 · 러닝머신 T01~T08 · 젊은 24명"), ("run", "RBDS 달리기 · 2.5 · 3.5 · 4.5 m/s · 28명")):
        b = gs[clip]["share"]
        share.append(f"| {nm} | {', '.join(gs[clip]['conds'])} | {b['betaMean']:.3f} ± {b['betaSD']:.3f} | {1 - b['betaMean']:.3f} | {b['fitH']['beta']:.3f} · {b['fitH']['vhatH']} |")
    return "\n".join(rows1) + "\n\n" + "\n".join(rows2) + "\n\n" + "\n".join(share)


def main():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    opt = lambda k: next((a.split("=", 1)[1] for a in args if a.startswith(f"--{k}=")), None)
    out = opt("out")
    if "--table" in args:
        print(table([tuple(a.split("=", 1)) for a in args if "=" in a and not a.startswith("--")]))
        return
    if "--sheet" in args:
        r = sheet_slide(opt("poses"), opt("tmp"))
    else:
        r = glb_slide(opt("glb") or os.path.join(ROOT, "public", "assets", "char3d", "char_body.glb"), opt("body"))
    for c, d in r["clips"].items():
        print(f"[slide] {r['kind']} {c}: 열쇠 {d['keys']} · T {d['T']:.4f} s · L {d['L']:.4f} m(v_anim {d['vAnim']:.3f} m/s) · v {d['v']} → "
              f"미끄러짐 {100 * d['slipCycle']:+.1f} cm/주기(절대합 {100 * d['slipAbs']:.1f}) · ⓐ T' {d['a_T']:.4f} s · ⓑ L' {d['b_L']:.3f} m(×{d['b_scale']})")
        if "stance" in d:
            s = d["stance"]
            print(f"        (나) 디딘 발만: 구간 {s['intervals']} · v_anim {s['vAnim']:.3f} · L {s['L']:.4f} → {100 * s['slipCycle']:+.1f} cm/주기 · "
                  f"디딤 한 번 {100 * s['slipStance']:+.1f} cm · ⓐ T' {s['a_T']:.4f} · ⓑ ×{s['b_scale']} · 흔드는 발이 가장 낮은 열쇠 {s['swingLowKeys']}/{d['keys']}")
            g = d["grounded"]
            print(f"        (다) 땅에 세운 점(디딘 발 중 가장 낮은 살): 열쇠 {g['keys']} · 미끄러짐 {100 * g['slipCycle']:+.1f} cm/주기(절대합 {100 * g['slipAbs']:.1f}) · "
                  f"흔드는 발 − 디딘 발 최저 {g['swingGapMinMm']} mm · 공중 열쇠 {g['airKeys']}(가장 낮은 살 최저 {g['airMinMm']} mm)")
    if out:
        json.dump(r, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"[slide] 저장: {out}")


if __name__ == "__main__":
    main()
