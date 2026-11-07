#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/model_gait.py — 받은 동작의 걸음 재기(고리 · 디딤 · 보폭 · 발 미끄러짐 · 쓰러짐 시간표) [T1210 · ★재민 11-07]
#
# ★왜 있나: 받은 동작(VARCO 3D 의 AI 동작 등)은 **제자리 걸음**이다 — 다리는 움직이는데 몸은 안 나아간다.
#   게임에서 짐승은 서버가 정한 빠르기로 움직이므로, 시트를 어떻게 돌릴지 정하려면 그 동작이
#   **땅을 미는 빠르기**(디딤 발이 뒤로 가는 빠르기 = 그 동작의 "제 빠르기")와 한 고리 · 보폭을 알아야 한다.
#   이 파일은 그 값을 잰다 — 판정 0 · 굽지 않는다. `model_render.py` 가 이 함수들을 그대로 부른다(사본 0).
#
# ★재는 법(차례 그대로 — 표의 글이 이 줄들이다)
#   발      : 끝 뼈(자식 없음) 가운데 쉬는 자세에서 바닥 가까이(뼈 높이 폭의 `FOOT_TOL` 안) 끝나는 것 — 고라니는 발굽 넷
#   디딤    : 그 발이 낮을 때 — 한 고리 안 그 발의 높이 폭의 `STANCE_K` 아래
#   고리    : 클립 안 고리 수 k = 발마다 디딤 수의 가운데 값 → 주기 P = 클립 길이 ÷ k
#             (받은 클립은 처음 = 끝인 고리라 P 로 나눠진다 · 고리마다 조금씩 다르다)
#             시트에 넣는 **한 고리** = 시작 t0 를 이음(t0 자세 ↔ t0 + P 자세의 뼈 끝 최대 거리)이 가장 작은 곳으로 —
#             클립 끝을 넘으면 처음으로 감는다(처음 = 끝인 고리라 이음이 없다)
#   제 빠르기: 발마다 [디딤 동안 앞 반대로 간 거리 ÷ 디딤 시간] → 발 평균. 보폭(한 고리) = 제 빠르기 × P
#   발 미끄러짐: 몸이 제 빠르기로 갈 때(= 보폭만큼 갈 때 한 고리를 돌릴 때) 디딤 발이 땅 위에서 끌리는 거리
#             = |그 발이 디딤 동안 뒤로 간 거리 − 제 빠르기 × 그 디딤 시간| (발마다 · 한 디딤)
#   쓰러짐  : 높이(뿌리 뼈 머리 z) · 몸 방향(두 뼈를 잇는 선 — 엉덩이 → 어깨)의 시간표
#
# 실행(재기만 · 표를 찍는다):
#   blender --background --factory-startup --python scripts/model_gait.py -- <뼈대 모델> --anim=<키>=<동작 파일>… \
#       [--front=-y] [--scale=0.81] [--face=<뼈 A>><뼈 B>] [--json=<파일>]
# =============================================================================

import bpy, os, sys, json, math, mathutils, importlib.util

V = mathutils.Vector
FOOT_TOL = 0.05       # 발 = 쉬는 자세에서 뼈 높이 폭의 5% 안에서 끝나는 끝 뼈
STANCE_K = 0.25       # 디딤 = 한 고리 안 그 발 높이 폭의 아래 1/4
STEP_Q = 4            # 재는 칸 = 1/4 프레임
LOCO = ("walk", "run")   # 걸음 동작(고리 · 디딤 · 보폭을 재는 클립) — 이름은 검사기 동작 이름표(`model-check.ACTIONS`)의 키


def fps():
    sc = bpy.context.scene
    return sc.render.fps / sc.render.fps_base


def span(act):
    """(첫 키 프레임, 길이 초) — 시간 0 = 그 동작의 첫 키."""
    f0, f1 = act.frame_range
    return f0, (f1 - f0) / fps()


def set_time(arm, act, t, wrap=False):
    """뼈대 `arm` 을 동작 `act` 의 첫 키에서 t 초 뒤 자세로. wrap = 고리 동작이면 길이로 감는다(처음 = 끝)."""
    if arm.animation_data is None:
        arm.animation_data_create()
    if arm.animation_data.action is not act:
        arm.animation_data.action = act
    f0, sp = span(act)
    if wrap and sp > 0:
        t = t % sp
    f = f0 + t * fps()
    fi = int(math.floor(f))
    bpy.context.scene.frame_set(fi, subframe=f - fi)


# ★공간: 재는 값은 다 **모델 공간**(가져온 그대로의 세계 — 위 +Z · 앞 = `출처.txt` 의 앞)이다.
#   `M` = 뼈대 공간 → 모델 공간 행렬(없으면 그 뼈대의 matrix_world · model_render 는 맞춤 앞의 그 값을 준다).
def _W(arm, M):
    return arm.matrix_world if M is None else M


def feet(arm, M=None):
    W = _W(arm, M)
    bs = arm.data.bones
    zs = [(W @ b.head_local).z for b in bs] + [(W @ b.tail_local).z for b in bs]
    lo, hi = min(zs), max(zs)
    return sorted(b.name for b in bs if not b.children and (W @ b.tail_local).z <= lo + FOOT_TOL * (hi - lo))


def points(arm, names=None, M=None):
    """뼈마다 (머리, 꼬리) — 모델 공간."""
    W = _W(arm, M)
    return {pb.name: (W @ pb.head, W @ pb.tail) for pb in arm.pose.bones if names is None or pb.name in names}


def pose_gap(a, b):
    """두 자세의 뼈 끝(머리 · 꼬리) 최대 거리 — 뼈대 단위."""
    return max(max((a[k][0] - b[k][0]).length, (a[k][1] - b[k][1]).length) for k in a)


def front_vec(front_xy):
    """모델의 앞(+x −x +y −y) — 모델 공간 수평 단위 벡터."""
    return V((front_xy[0], front_xy[1], 0.0)).normalized()


def _stances(z):
    """높이 열(고리 · 감김) → 디딤 구간들 [(시작 칸, 끝 칸)] — 한 고리 안 높이 폭의 아래 STANCE_K."""
    lo, hi = min(z), max(z)
    thr = lo + STANCE_K * (hi - lo)
    on = [v <= thr for v in z]
    n = len(on)
    if all(on) or not any(on):
        return []
    s0 = next(i for i in range(n) if not on[i])        # 들린 칸에서 시작해 감는다
    segs, i = [], 0
    while i < n:
        k = (s0 + i) % n
        if on[k]:
            j = i
            while j + 1 < n and on[(s0 + j + 1) % n]:
                j += 1
            segs.append(((s0 + i) % n, (s0 + j) % n, j - i + 1))
            i = j + 1
        else:
            i += 1
    return segs


def cycle(arm, act, M=None):
    """고리 동작 → {k, P, t0, seam} — 고리 수 · 주기(초) · 한 고리 시작(초) · 이음(모델 단위)."""
    f0, sp = span(act)
    step = 1.0 / (fps() * STEP_Q)
    n = max(1, int(round(sp / step)))
    F = feet(arm, M)
    zs = {f: [] for f in F}
    for i in range(n):
        set_time(arm, act, i * sp / n, wrap=True)
        p = points(arm, F, M)
        for f in F:
            zs[f].append(p[f][1].z)
    counts = sorted(len(_stances(zs[f])) for f in F)
    k = max(1, counts[len(counts) // 2])
    P = sp / k
    best = None
    for i in range(n):
        t0 = i * sp / n
        set_time(arm, act, t0, wrap=True); a = points(arm, None, M)
        set_time(arm, act, t0 + P, wrap=True); b = points(arm, None, M)
        g = pose_gap(a, b)
        if best is None or g < best[1] - 1e-12:
            best = (t0, g)
    return {"k": k, "P": P, "t0": best[0], "seam": best[1], "stancesPerFoot": counts}


def loop_gait(arm, act, t0, P, front_xy, M=None):
    """한 고리 [t0, t0 + P) 를 되풀이할 때 — 발마다 디딤(시간 · 뒤로 간 거리) · 제 빠르기 · 보폭 · 미끄러짐(모델 단위)."""
    F = feet(arm, M)
    fv = front_vec(front_xy)
    step = 1.0 / (fps() * STEP_Q)
    n = max(8, int(round(P / step)))
    pos = {f: [] for f in F}
    for i in range(n):
        set_time(arm, act, t0 + i * P / n, wrap=True)
        p = points(arm, F, M)
        for f in F:
            pos[f].append(p[f][1].copy())
    out = {}
    for f in F:
        segs = _stances([q.z for q in pos[f]])
        if not segs:
            continue
        a, b, ln = max(segs, key=lambda s: s[2])          # 고리에 디딤이 둘이면 긴 것
        back = -(pos[f][b] - pos[f][a]).dot(fv)
        dt = (ln - 1) * P / n
        out[f] = {"stanceS": dt, "back": back, "speed": back / dt if dt > 0 else 0.0}
    vs = [v["speed"] for v in out.values()]
    v_nat = sum(vs) / len(vs) if vs else 0.0
    for f, v in out.items():
        v["slip"] = abs(v["back"] - v_nat * v["stanceS"])
    return {"feet": out, "speed": v_nat, "stride": v_nat * P, "P": P}


def heading(arm, a, b, front_xy, M=None):
    """몸 방향(라디안 · 앞 기준 왼쪽 + = 위에서 봐 시계 반대)과 가운데 — 뼈 a 머리 → 뼈 b 꼬리의 수평 선(모델 공간)."""
    W = _W(arm, M)
    pa, pb = W @ arm.pose.bones[a].head, W @ arm.pose.bones[b].tail
    d = V((pb.x - pa.x, pb.y - pa.y, 0.0))
    fv = front_vec(front_xy)
    left = V((-fv.y, fv.x, 0.0))
    return math.atan2(d.dot(left), d.dot(fv)), V(((pa.x + pb.x) * 0.5, (pa.y + pb.y) * 0.5, 0.0))


def root_bone(arm):
    return next(b.name for b in arm.data.bones if b.parent is None)


# ═══════════════ 재기만(표) ═══════════════
if __name__ == "__main__":
    HERE = os.path.dirname(os.path.abspath(__file__))
    _spec = importlib.util.spec_from_file_location("model_check", os.path.join(HERE, "model-check.py"))
    mc = importlib.util.module_from_spec(_spec)
    _spec.loader.exec_module(mc)
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    model, anims, front, scale, face, jout = None, [], None, 1.0, None, None
    for x in a:
        if not x.startswith("--"):
            model = x
            continue
        k, _, v = x[2:].partition("=")
        if k == "anim":
            kk, _, ff = v.partition("=")
            anims.append((kk, ff))
        elif k == "front": front = mc.parse_front(v)
        elif k == "scale": scale = float(v)
        elif k == "face": face = tuple(v.split(">"))
        elif k == "json": jout = v
    if not model or not anims:
        raise SystemExit("쓰는 법: … model_gait.py -- <뼈대 모델> --anim=<키>=<동작 파일>… [--front=-y] [--scale=m/단위] [--face=A>B] [--json=<파일>]")
    front = front or mc.parse_front((mc.read_source_txt(model) or {}).get("앞")) or "+y"
    fxy = mc.FRONTS[front]
    rep = {"model": os.path.basename(model), "front": front, "scale": scale, "clips": {}}
    for key, path in anims:
        mc.clear()
        objs = mc.import_model(path)
        arm = next(o for o in objs if o.type == 'ARMATURE')
        act = arm.animation_data.action
        f0, sp = span(act)
        r = {"file": os.path.basename(path), "md5": mc.md5(path), "action": act.name, "spanS": sp, "feet": feet(arm)}
        print(f"\n[gait] {key} · {r['file']} · 길이 {sp:.4f}초 · 발 {' · '.join(r['feet'])}")
        if key in LOCO:                                   # 걸음 동작만 고리 · 디딤을 잰다(서기 · 쓰러짐은 걸음이 아니다)
            cy = cycle(arm, act)
            r["cycle"] = cy
            print(f"[gait]   고리 k {cy['k']}(발마다 디딤 수 {cy['stancesPerFoot']}) · 주기 {cy['P']:.4f}초 · 한 고리 시작 {cy['t0']:.4f}초 · 이음 {cy['seam']:.4f} 단위 = {cy['seam'] * scale * 100:.1f} cm")
            g = loop_gait(arm, act, cy["t0"], cy["P"], fxy)
            r["gait"] = g
            print(f"[gait]   제 빠르기 {g['speed']:.4f} 단위/초 = {g['speed'] * scale:.3f} m/s · 보폭(한 고리) {g['stride']:.4f} 단위 = {g['stride'] * scale:.3f} m")
            for f, v in sorted(g["feet"].items()):
                print(f"[gait]     {f:10s} 디딤 {v['stanceS']:.3f}초 · 뒤로 {v['back'] * scale * 100:5.1f} cm · {v['speed'] * scale:.3f} m/s · 미끄러짐 {v['slip'] * scale * 100:4.1f} cm")
        if face:
            tl, rb = [], root_bone(arm)
            nst = int(round(sp * 10))
            for i in range(nst + 1):
                set_time(arm, act, i / 10.0)
                h, c = heading(arm, face[0], face[1], fxy)
                tl.append({"t": round(i / 10.0, 2), "headingDeg": round(math.degrees(h), 1),
                           "rootZ": round((arm.matrix_world @ arm.pose.bones[rb].head).z, 4), "center": [round(c.x, 4), round(c.y, 4)]})
            r["timeline"] = tl
            print(f"[gait]   시간표(0.1초) 몸 방향 {face[0]}→{face[1]} · 뿌리 높이:")
            print("[gait]     " + " · ".join(f"{e['t']:.1f}s {e['headingDeg']:+.0f}° z{e['rootZ']:.2f}" for e in tl[::5]))
        rep["clips"][key] = r
    if jout:
        with open(jout, "w", encoding="utf-8") as f:
            json.dump(rep, f, ensure_ascii=False, indent=1)
        print("[gait] JSON:", jout)
