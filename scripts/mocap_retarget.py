#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""mocap_retarget — CMU BVH 한 보폭을 **12뼈 8프레임 포즈표**로 굳힌다.  [T96]

    python3 scripts/mocap_retarget.py          # → assets-src/mocap/poses.json

★왜 굽기와 분리하나 [카드 규약]
  `char_render.py` 안에서 BVH 를 읽으면 굽기가 원본 파일·부동소수 경로를 타게 된다.
  ⇒ 리타깃은 **여기서 한 번**, 결과는 `poses.json` 으로 커밋, 굽기는 그 표를 **읽기만** 한다.
  같은 원본 → 같은 표(바이트 동일) → 같은 시트(IDAT 동일). 결정론이 두 단으로 나뉜다.

★왜 `bpy` 를 안 쓰나
  `bpy 5.0.1` 에 `import_anim.bvh` 는 **있다**(§0-ⓒ 실측 · 확인함). 그런데 그걸 쓰면 이 스크립트가
  Blender 없이는 못 돈다 — "두 번 돌려 바이트 같은가"를 물으려면 3.5분짜리 씬 구축을 두 번 해야 한다.
  BVH 는 텍스트고 필요한 건 **전방기구학 한 번**이라 표준 라이브러리로 충분하다(아래 60줄).

═══════════ 좌표계 — 짐작 없이 **재서** 맞췄다 ═══════════

BVH(cgspeed 변환본):  +Y 위 · +Z 앞 · +X 캐릭터의 **왼쪽**
  · 앞 = 루트 이동으로 쟀다(07_01 에서 Hips 가 317프레임 동안 +Z 로 63.5 이동 · X 0.7 · Y 1.5).
  · 왼쪽 = 1프레임 T 포즈에서 `LeftArm→LeftHand` 가 +X 를 가리킨다.
  · 회전 채널은 `Zrotation Yrotation Xrotation` — 나열 순서대로 곱한다(BVH 표준).

리그(`char_render.py` · 12뼈):  +Z 위 · **+X 앞**(메타 "d=0 은 +x") · +Y 캐릭터의 왼쪽
  · 앞이 +x 인 근거: 어깨·엉덩이가 ±y 로 벌어져 있고(`uarmL` +y · `uarmR` −y),
    오른손이 −y 다 — +x 를 보고 +z 가 위면 오른쪽이 −y 다.

★리그의 로컬 오일러가 뼈를 **어디로 눕히는가**는 `depsgraph` 에서 직접 읽어 쟀다(§0-ⓒ):

    사지 뼈(휴식 = 아래 (0,0,−1)):  rx=+30° → (0, +.577, −.816)   rz=+30° → (−.577, 0, −.816)
    몸통 뼈(휴식 = 위  (0,0,+1)):   rx=+30° → (0, −.577, +.816)   rz=+30° → (−.577, 0, +.816)
    ry → 변화 0 (뼈 축 비틀기)

  .577/.816 은 리그 z 압축(`rig.scale=(1,1,ZSQ)` · ZSQ=.8165) 때문이다. 압축을 되돌리면
  **정확히 30°** 다 — 즉 오일러 한 각 = 그 평면의 각 그대로다. ⇒ 정확한 정·역변환:

    α = +y 축 둘레 회전(시상면 · 앞뒤)      β = +x 축 둘레 회전(관상면 · 좌우)
    사지: d = (−sinα·cosβ, sinβ, −cosα·cosβ)    α = atan2(−dx, −dz)   β = asin( dy)
    몸통: d = (−sinα·cosβ, −sinβ, +cosα·cosβ)   α = atan2( dx,  dz)   β = asin(−dy)
    오일러: rx = β · ry = 0 · rz = α (사지) / −α (몸통)

  ⚠**두 각 분해는 자세 각이 크면 정확히 합이 아니다.** 그래도 이 문법을 쓰는 이유: 지금 포즈
    함수들이 정확히 이 문법이고(부모 대비 한 평면 각), 26px 스프라이트에서 차이가 화소 밑이다.
    부모 대비로 빼는 것도 같은 근사다. 실측 검증은 `보고/T96` 의 대조표(굽고 나서 방향 재비교).

═══════════ 뼈 대응 (CMU 31관절 → 리그 12뼈) ═══════════

    root   ← Hips→Spine          spine ← Spine→Neck        head ← Neck1→Head
    thighL ← LeftUpLeg→LeftLeg   shinL ← LeftLeg→LeftFoot   (R 도 같다)
    uarmL  ← LeftArm→LeftForeArm larmL ← LeftForeArm→LeftHand
    handR  — 안 쓴다(휴식). 손에 든 것이 손목 각도로 흔들리면 26px 에서 도끼가 떨린다.
    버리는 관절 19개: L/RHipJoint · L/RToeBase · LowerBack · Spine1 · Neck(위치만) ·
      L/RShoulder · L/RHand 이하 손가락 여섯 · LThumb · RThumb.
"""
import json
import math
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "assets-src", "mocap")
OUT = os.path.join(SRC, "poses.json")
NFRAMES = 8                     # `char_render.py CLIPS` 의 walk·run 프레임 수 — 바꾸지 마라
ROUND = 6                       # 라디안 소수 자리(바이트 결정론)

CLIPS = [
    ("walk", "cmu_07_01_walk.bvh", "CMU 07_01 (Subject #7 · walk)"),
    ("run",  "cmu_09_01_run.bvh",  "CMU 09_01 (Subject #9 · run)"),
]

# 뼈 = (리그 이름, BVH 시작관절, BVH 끝관절, 몸통인가, 리그 부모)
BONES = [
    ("root",   "Hips",         "Spine",        True,  None),
    ("spine",  "Spine",        "Neck",         True,  "root"),
    ("head",   "Neck1",        "Head",         True,  "spine"),
    ("thighL", "LeftUpLeg",    "LeftLeg",      False, "root"),
    ("shinL",  "LeftLeg",      "LeftFoot",     False, "thighL"),
    ("thighR", "RightUpLeg",   "RightLeg",     False, "root"),
    ("shinR",  "RightLeg",     "RightFoot",    False, "thighR"),
    ("uarmL",  "LeftArm",      "LeftForeArm",  False, "spine"),
    ("larmL",  "LeftForeArm",  "LeftHand",     False, "uarmL"),
    ("uarmR",  "RightArm",     "RightForeArm", False, "spine"),
    ("larmR",  "RightForeArm", "RightHand",    False, "uarmR"),
]


# ═══════════ BVH 파서 + 전방기구학 ═══════════
def parse_bvh(path):
    txt = open(path).read()
    toks = txt.replace("\n", " \n ").split()
    nodes, stack, order, i = [], [], [], 0
    while i < len(toks):
        t = toks[i]
        if t in ("ROOT", "JOINT"):
            nodes.append({"name": toks[i + 1], "offset": (0.0, 0.0, 0.0), "chans": [],
                          "parent": stack[-1] if stack else None})
            stack.append(len(nodes) - 1); i += 2
        elif t == "End":
            stack.append(-1); i += 2
        elif t == "OFFSET":
            if stack[-1] >= 0:
                nodes[stack[-1]]["offset"] = tuple(float(x) for x in toks[i + 1:i + 4])
            i += 4
        elif t == "CHANNELS":
            n = int(toks[i + 1])
            ch = toks[i + 2:i + 2 + n]
            nodes[stack[-1]]["chans"] = ch
            order.extend((stack[-1], c) for c in ch)
            i += 2 + n
        elif t == "}":
            stack.pop(); i += 1
        elif t == "MOTION":
            break
        else:
            i += 1
    m = re.search(r"MOTION\s+Frames:\s*(\d+)\s+Frame Time:\s*([0-9.eE+-]+)", txt)
    nf, dt = int(m.group(1)), float(m.group(2))
    body = txt[m.end():].split()
    nc = len(order)
    frames = [[float(x) for x in body[f * nc:(f + 1) * nc]] for f in range(nf)]
    return nodes, order, frames, dt


def _rot(axis, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    if axis == "X":
        return ((1, 0, 0), (0, c, -s), (0, s, c))
    if axis == "Y":
        return ((c, 0, s), (0, 1, 0), (-s, 0, c))
    return ((c, -s, 0), (s, c, 0), (0, 0, 1))


def _mm(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def _mv(a, v):
    return tuple(sum(a[i][k] * v[k] for k in range(3)) for i in range(3))


def fk(nodes, order, frame):
    """관절별 월드 좌표. BVH 규약: 채널 나열 순서대로 곱한다."""
    vals = {}
    for (ni, ch), v in zip(order, frame):
        vals.setdefault(ni, {})[ch] = v
    pos, rot = {}, {}
    for ni, nd in enumerate(nodes):
        d = vals.get(ni, {})
        R = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        for ch in nd["chans"]:
            if ch.endswith("rotation"):
                R = _mm(R, _rot(ch[0], d.get(ch, 0.0)))
        if nd["parent"] is None:
            pos[ni] = (d.get("Xposition", 0.0), d.get("Yposition", 0.0), d.get("Zposition", 0.0))
            rot[ni] = R
        else:
            pp, pr = pos[nd["parent"]], rot[nd["parent"]]
            o = _mv(pr, nd["offset"])
            pos[ni] = (pp[0] + o[0], pp[1] + o[1], pp[2] + o[2])
            rot[ni] = _mm(pr, R)
    return pos


# ═══════════ 리타깃 ═══════════
def seg_dir_body(pos, I, a, b):
    """BVH 두 관절 → **리그 몸 좌표계**의 단위 방향 (앞, 왼쪽, 위)."""
    p, q = pos[I[a]], pos[I[b]]
    vx, vy, vz = q[0] - p[0], q[1] - p[1], q[2] - p[2]        # BVH: x=왼쪽 y=위 z=앞
    d = (vz, vx, vy)                                          # 리그: x=앞 y=왼쪽 z=위
    n = math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) or 1.0
    return (d[0] / n, d[1] / n, d[2] / n)


def ab_of(d, torso):
    """방향 → (α 시상, β 관상). 위 주석의 정확한 역변환."""
    dx, dy, dz = d
    if torso:
        return math.atan2(dx, dz), math.asin(max(-1.0, min(1.0, -dy)))
    return math.atan2(-dx, -dz), math.asin(max(-1.0, min(1.0, dy)))


def cycle_of(nodes, order, frames):
    """왼 넓적다리 시상각의 **상승 영교차**로 한 보폭 주기를 잰다(자리를 고르지 않는다)."""
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    sag = []
    for f in frames:
        a, _ = ab_of(seg_dir_body(fk(nodes, order, f), I, "LeftUpLeg", "LeftLeg"), False)
        sag.append(a)
    zc = [i for i in range(1, len(sag)) if sag[i - 1] < 0 <= sag[i]]
    if len(zc) < 2:
        raise SystemExit("주기를 못 찾았다 — 이 클립은 한 보폭이 안 들어 있다")
    per = sorted(zc[i + 1] - zc[i] for i in range(len(zc) - 1))
    return zc[0], per[len(per) // 2]


def retarget(path):
    nodes, order, frames, dt = parse_bvh(path)
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    start, period = cycle_of(nodes, order, frames)
    out = []
    for k in range(NFRAMES):
        t = start + period * k / float(NFRAMES)
        i0 = int(math.floor(t))
        w = t - i0
        i1 = min(i0 + 1, len(frames) - 1)
        p0, p1 = fk(nodes, order, frames[i0]), fk(nodes, order, frames[i1])
        world = {}
        for nm, ja, jb, torso, _par in BONES:
            d0 = seg_dir_body(p0, I, ja, jb)
            d1 = seg_dir_body(p1, I, ja, jb)
            d = tuple(d0[j] * (1 - w) + d1[j] * w for j in range(3))
            n = math.sqrt(sum(c * c for c in d)) or 1.0
            world[nm] = ab_of(tuple(c / n for c in d), torso)
        pose = {}
        for nm, _ja, _jb, torso, par in BONES:
            a, b = world[nm]
            if par:
                pa, pb = world[par]
                a, b = a - pa, b - pb
            rx = b
            rz = -a if torso else a
            pose[nm] = [round(rx, ROUND), 0.0, round(rz, ROUND)]
        out.append(pose)
    return out, {"frames": len(frames), "fps": round(1.0 / dt, 3),
                 "cycleStart": start, "cyclePeriod": period,
                 "cycleSec": round(period * dt, 4)}


def main():
    doc = {
        "_": "mocap_retarget.py 산물 — 손편집 금지. 원본은 assets-src/mocap/*.bvh, 규약은 그 스크립트.",
        "nframes": NFRAMES,
        "bones": [b[0] for b in BONES],
        "clips": {},
        "source": {},
    }
    for clip, fn, label in CLIPS:
        poses, info = retarget(os.path.join(SRC, fn))
        doc["clips"][clip] = poses
        info["file"] = fn
        info["clip"] = label
        doc["source"][clip] = info
        # 루프 이음새 — 첫↔끝 |Δ각| 이 이웃 프레임 간격 안이면 튀지 않는다
        gaps = []
        for k in range(NFRAMES):
            a, b = poses[k], poses[(k + 1) % NFRAMES]
            gaps.append(max(abs(a[n][j] - b[n][j]) for n in a for j in (0, 2)))
        info["loopSeamDeg"] = round(math.degrees(gaps[-1]), 3)
        info["stepMaxDeg"] = round(math.degrees(max(gaps[:-1])), 3)
        print(f"[mocap] {clip}: {fn} · 주기 {info['cyclePeriod']}프레임({info['cycleSec']}초) "
              f"· 이음새 {info['loopSeamDeg']}° · 프레임 간 최대 {info['stepMaxDeg']}°")
    with open(OUT, "w") as f:
        json.dump(doc, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"[mocap] 저장: {OUT}")


if __name__ == "__main__":
    main()
