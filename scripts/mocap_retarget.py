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
ROUND = 6                       # 라디안 소수 자리(바이트 결정론)

# ★★[T155] 클립마다 **프레임 수 · 루프 · 창 규칙**을 적는다.
#   ⚠프레임 수·fps·루프는 `char_render.py CLIPS` 와 **같아야 한다** — 손으로 두 벌 적는 자리라
#     `test-charsheet` 가 두 표가 갈렸는지 검사한다(갈리면 빨개진다). 종전엔 `NFRAMES=8` 한 줄에
#     *"바꾸지 마라"* 라고만 적혀 있었다.
#   ★**창 규칙**(어느 구간을 쓸 것인가)도 고르지 않고 잰다 — 클립의 뜻에서 나온다:
#     cycle  반복 동작. 그 뼈 시상각의 **상승 영교차** 간격이 한 주기다(T96 이 걸음에 쓴 그 자).
#     reach  겨누는 동작. 오른손이 몸 앞으로 **가장 멀리** 나간 창(조준의 계약 = 손을 앞으로 · T107).
#     still  서 있는 동작. 각이 **가장 적게 움직이는** 창(서기는 조용한 것이 뜻이다).
#   ★창의 길이는 그 클립의 **재생 시간**에서 나온다(프레임 수 ÷ fps × 원본 fps) — 새 수 0.
CLIPS = [
    # (이름, 파일, 설명, 프레임수, fps, 루프, 창 규칙, 규칙이 보는 뼈)
    ("walk",   "cmu_07_01_walk.bvh", "CMU 07_01 (Subject #7 · walk)",   8, 10.0, True,  "cycle", "thighL"),
    ("run",    "cmu_09_01_run.bvh",  "CMU 09_01 (Subject #9 · run)",    8, 14.0, True,  "cycle", "thighL"),
    ("swing2", "cmu_80_71_chop.bvh",  "CMU 80_71 (Subject #80 · chopping wood)",          6, 14.0, False, "beat",  None),
    ("aim2",   "cmu_113_24_throw.bvh", "CMU 113_24 (Subject #113 · Throw)",               2,  2.0, True,  "reach", None),
    ("idle2",  "cmu_77_02_stand.bvh", "CMU 77_02 (Subject #77 · standing)",               4,  0.90, True, "still", None),
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


_JOINTS = {b[0]: (b[1], b[2], b[3]) for b in BONES}


def cycle_of(nodes, order, frames, bone="thighL"):
    """그 뼈 시상각의 **상승 영교차**로 한 주기를 잰다(자리를 고르지 않는다).
       ★[T155] 보던 뼈를 인자로 뺐다 — 걸음은 넓적다리, 도끼질은 위팔이 주기를 그린다.
         기본값이 `thighL` 이라 walk·run 은 **한 자도 안 바뀐다**(바이트 무변의 근거)."""
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    ja, jb, torso = _JOINTS[bone]
    sag = []
    for f in frames:
        a, _ = ab_of(seg_dir_body(fk(nodes, order, f), I, ja, jb), torso)
        sag.append(a)
    zc = [i for i in range(1, len(sag)) if sag[i - 1] < 0 <= sag[i]]
    if len(zc) < 2:
        raise SystemExit(f"주기를 못 찾았다 — {bone} 시상각에 영교차가 {len(zc)}개뿐이다")
    per = sorted(zc[i + 1] - zc[i] for i in range(len(zc) - 1))
    cycle_of.last = (len(zc), per[0], per[-1])       # 진단용 — 교차 수·최단·최장
    return zc[0], per[len(per) // 2]


def body_frame(pos, I):
    """엉덩이에서 세운 **몸 기준틀** (앞, 왼, 위) — 피험자가 어느 쪽을 보고 있든 같은 뜻이 된다."""
    left = seg_dir_body(pos, I, "RightUpLeg", "LeftUpLeg")
    up = seg_dir_body(pos, I, "Hips", "Spine")
    fwd = (left[1] * up[2] - left[2] * up[1],
           left[2] * up[0] - left[0] * up[2],
           left[0] * up[1] - left[1] * up[0])
    n = math.sqrt(sum(c * c for c in fwd)) or 1.0
    return tuple(c / n for c in fwd), left, up


def reach_fwd(pos, I):
    """**두 손**이 몸 앞으로 나간 평균 거리(엉덩이 기준 · 몸 크기로 정규화).

       ★한 손만 보면 안 된다 — 겨누는 자세는 **두 팔이 다 앞**이다(활을 당기든 무릿매를 들든).
         §0 실측: 오른손만 보면 던지기 클립의 '공 든 채 서 있는' 순간이 뽑혔다(팔이 안 나갔다)."""
    fwd, _l, _u = body_frame(pos, I)
    hp, sp = pos[I["Hips"]], pos[I["Spine"]]
    scale = math.sqrt(sum((sp[j] - hp[j]) ** 2 for j in range(3))) or 1.0
    tot = 0.0
    for jn in ("RightHand", "LeftHand"):
        h = pos[I[jn]]
        v = (h[2] - hp[2], h[0] - hp[0], h[1] - hp[1])      # 리그 축(앞,왼,위) · 손 − 엉덩이
        tot += sum(v[j] * fwd[j] for j in range(3)) / scale
    return tot * 0.5


def _angles_of(pos, I):
    """이 프레임의 열두 뼈 절대 (α, β)."""
    return {nm: ab_of(seg_dir_body(pos, I, ja, jb), torso) for nm, ja, jb, torso, _p in BONES}


def hand_up(pos, I):
    """오른손이 엉덩이보다 얼마나 위인가(몸 크기로 정규화) — 도끼질의 **박자**를 그리는 신호."""
    _f, _l, up = body_frame(pos, I)
    h, hp, sp = pos[I["RightHand"]], pos[I["Hips"]], pos[I["Spine"]]
    v = (h[2] - hp[2], h[0] - hp[0], h[1] - hp[1])
    sc = math.sqrt(sum((sp[j] - hp[j]) ** 2 for j in range(3))) or 1.0
    return sum(v[j] * up[j] for j in range(3)) / sc


def torso_lean(pos, I):
    """몸통이 앞으로 얼마나 숙었나(라디안 · 골반 뼈의 시상각) — 원샷의 **쉼**을 찾는 신호."""
    a, _b = ab_of(seg_dir_body(pos, I, "Hips", "Spine"), True)
    return abs(a)


def beat_of(nodes, order, frames, loop=True):
    """손 높이가 **평균을 위로 지나는** 자리 사이가 한 번의 도끼질이다.

       ★왜 뼈 각이 아니라 손 높이인가 — §0 실측이 시켰다. 위팔 시상각의 영교차로 재 봤더니
         후보 셋의 영교차가 3·2·4회로 제각각이었고 주기가 1.8초·8.1초·0.3초로 흩어졌다
         (팔이 수직 아래를 안 지나는 도끼질이 있다 = 영이 박자가 아니다).
         손 높이는 **찍고 드는 동작 자체**라 도끼질마다 정확히 한 번 오르내린다."""
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    sig = [hand_up(fk(nodes, order, f), I) for f in frames]
    mu = sum(sig) / len(sig)
    zc = [i for i in range(1, len(sig)) if sig[i - 1] < mu <= sig[i]]
    if len(zc) < 2:
        raise SystemExit("박자를 못 찾았다 — 손 높이가 평균을 두 번 이상 안 지난다")
    # ★시작은 **손이 가장 낮은 자리**다 — 도끼가 나무에 박힌 그 순간이 쉼이고, 원샷 클립은
    #   거기서 시작해 들어올렸다 내려친다(손 포즈판의 "0~0.35 들어올림"과 같은 위상).
    #   ⚠길이는 **그 도끼질 제 길이**를 쓴다(중앙값이 아니다). 80_71 은 박자가 48~141판으로
    #     들쭉날쭉해서 중앙값을 쓰면 표본이 다음 도끼질로 흘러 들어간다(§0 실측: 마지막 판이
    #     쉼이 아니라 다시 들어올린 자세였다). ⇒ 바닥에서 바닥까지가 한 번이다.
    bottoms = [min(range(zc[i], zc[i + 1]), key=lambda j: sig[j]) for i in range(len(zc) - 1)]
    if len(bottoms) < 2:
        raise SystemExit("도끼질이 한 번뿐이다 — 바닥을 둘 이상 못 찾았다")
    lens = [bottoms[i + 1] - bottoms[i] for i in range(len(bottoms) - 1)]
    med = sorted(lens)[len(lens) // 2]
    k = min(range(len(lens)), key=lambda i: abs(lens[i] - med))   # 가장 대표적인 한 번
    beat_of.last = (len(zc), min(lens), max(lens))
    st, per = bottoms[k], lens[k]
    if not loop:
        # ★★**원샷은 쉼에서 시작해 쉼으로 끝나야 한다.** 손 높이의 바닥은 도끼가 나무에 박힌
        #   순간이라 **몸이 가장 많이 숙은** 자리다 — 거기서 시작하면 첫 판과 끝 판이 둘 다
        #   허리를 접은 자세가 되고, 서 있다가 그 판으로 튄다(§0 실측: root 시상 −32°·−41°).
        #   ⇒ 그 한 번 안에서 **몸통이 가장 곧게 선 자리**를 시작으로 옮긴다. 길이는 그대로다.
        #   (손 포즈판도 같은 모양이다: "0~0.35 들어올림 → 0.35~0.62 내려침 → 0.62~1 복귀".)
        lean = [torso_lean(fk(nodes, order, frames[i]), I) for i in range(st, min(st + per, len(frames)))]
        st = st + min(range(len(lean)), key=lambda i: lean[i])
    return st, per


def window_of(nodes, order, frames, rule, bone, span, loop=True):
    """창을 **잰다**. `span` = 이 클립의 재생 시간만큼의 원본 프레임 수."""
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    if rule == "cycle":
        return cycle_of(nodes, order, frames, bone or "thighL")
    if rule == "beat":
        return beat_of(nodes, order, frames, loop)
    span = max(2, min(span, len(frames) - 1))
    A = [_angles_of(fk(nodes, order, f), I) for f in frames]
    quiet = [0.0] + [-sum(abs(A[i][nm][j] - A[i - 1][nm][j]) for nm in A[i] for j in (0, 1))
                     for i in range(1, len(A))]      # 부호를 뒤집어 '클수록 조용'으로 통일한다

    def slide(v):
        run = sum(v[:span])
        out = [run]
        for i in range(1, len(v) - span + 1):
            run += v[i + span - 1] - v[i - 1]
            out.append(run)
        return out

    Q = slide(quiet)
    if rule == "still":
        return max(range(len(Q)), key=lambda i: Q[i]), span
    if rule == "reach":
        # ★★겨누는 자세는 **두 단계로** 잡는다(무게로 섞지 않는다 — 그러면 손잡이가 생긴다):
        #   ⓐ 두 손이 몸 앞으로 **가장 멀리** 나간 **한 판**을 찾는다 = 겨눈 순간.
        #   ⓑ 그 판을 품은 창들 중 **가장 조용한** 것을 쓴다 = 그 순간의 멈춤.
        #   ⚠순서가 뒤바뀌면 안 된다(§0 실측 · 두 번 틀렸다):
        #     "가장 앞인 창"만 보면 던지는 **한복판**이 뽑혀 두 판이 서로 다른 자세가 됐고,
        #     "조용한 절반 중 가장 앞"으로 보면 던지기 클립의 *공 들고 서 있는* 대목이 뽑혔다.
        #     겨눈 **순간**을 먼저 못 박고 그 둘레에서 멈춤을 찾아야 한다.
        E1 = [reach_fwd(fk(nodes, order, f), I) for f in frames]
        peak = max(range(len(E1)), key=lambda i: E1[i])
        lo = max(0, peak - span + 1)
        hi = min(len(Q) - 1, peak)
        return max(range(lo, hi + 1), key=lambda i: Q[i]), span
    raise SystemExit("모르는 창 규칙: " + str(rule))


def retarget(path, nframes=8, loop=True, rule="cycle", bone="thighL", span=0):
    nodes, order, frames, dt = parse_bvh(path)
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    start, period = window_of(nodes, order, frames, rule, bone, span, loop)
    NFRAMES = nframes
    out = []
    for k in range(NFRAMES):
        # ★루프는 k/N(끝=처음), 원샷은 k/(N−1)(끝=창의 끝) — `char_render.apply_pose` 의 u 와 같은 식이다.
        t = start + period * k / float(NFRAMES if loop else max(1, NFRAMES - 1))
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
                # ★[T155] 부모 대비 각은 **(−π, π] 로 접는다.** α 는 atan2 라 ±π 에서 감기는데,
                #   걸음은 그 근처에 안 가서 T96 이 안 밟았다. 도끼질은 팔이 머리 위를 넘어가므로
                #   접지 않으면 한 판 사이에 288° 짜리 헛움직임이 생긴다(§0 실측에서 잡았다).
                #   ⚠walk·run 은 이 값이 원래 (−π, π] 안이라 **한 자도 안 바뀐다**(바이트 무변의 근거).
                a = (a - pa + math.pi) % (2 * math.pi) - math.pi
                b = b - pb
            rx = b
            rz = -a if torso else a
            pose[nm] = [round(rx, ROUND), 0.0, round(rz, ROUND)]
        out.append(pose)
    return out, {"frames": len(frames), "fps": round(1.0 / dt, 3),
                 "cycleStart": start, "cyclePeriod": period,
                 "cycleSec": round(period * dt, 4)}


# ═══════════ §0 후보 표 [T155] ═══════════
#   `--probe 이름=파일 …` — 채택 전에 **재는 자리**다. 굽지 않고 원본과 창만 본다.
#   자는 T96 이 걸음에 쓴 것과 같은 종류다: **화면에서 얼마나 움직이는가**.
#     · 오른손이 창 안에서 앞/옆으로 오간 거리를 **몸 크기로 정규화**해 재고,
#       우리 캐릭터의 척추 길이(Z_SHLD−Z_WAIST = 0.35m)와 PPU0(45.2548px/m)로 화면 px 로 옮긴다.
#     · 앞/옆 비는 T107 의 그 자다(도끼질은 앞으로 가야 한다 · 옆으로 쓸면 26px 에서 안 읽힌다).
SPINE_M = 0.35                  # 우리 리그의 척추 뼈 길이(m) — `char_render.py` Z_SHLD−Z_WAIST
PPU0 = 45.2548                  # 우리 시트의 화면 배율(px/m) — `char_render.py` 메타 `ppu`


def probe(name, path):
    spec = next((c for c in CLIPS if c[0] == name), None)
    if not spec:
        raise SystemExit("모르는 클립 이름: " + name)
    _n, _f, _lab, nf, fps, loop, rule, bone = spec
    nodes, order, frames, dt = parse_bvh(path)
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    span = int(round(nf / fps / dt))
    start, period = window_of(nodes, order, frames, rule, bone, span, loop)
    fwd_v, side_v = [], []
    for k in range(nf + (0 if loop else 1)):
        t = start + period * k / float(nf if loop else max(1, nf - 1))
        pos = fk(nodes, order, frames[min(int(round(t)), len(frames) - 1)])
        fwd, left, up = body_frame(pos, I)
        h, hp, sp = pos[I["RightHand"]], pos[I["Hips"]], pos[I["Spine"]]
        v = (h[2] - hp[2], h[0] - hp[0], h[1] - hp[1])                 # 리그 축(앞,왼,위)
        sc = math.sqrt(sum((sp[j] - hp[j]) ** 2 for j in range(3))) or 1.0
        fwd_v.append(sum(v[j] * fwd[j] for j in range(3)) / sc)
        side_v.append(sum(v[j] * left[j] for j in range(3)) / sc)
    def travel(a):
        return (max(a) - min(a)) * SPINE_M * PPU0
    F, S = travel(fwd_v), travel(side_v)
    # ★겨누는 동작은 **얼마나 움직이나**가 아니라 **얼마나 앞으로 나가 있나**가 계약이다(T107 ⓒ).
    EXT = sum(fwd_v) / len(fwd_v) * SPINE_M * PPU0
    poses, info = retarget(path, nf, loop, rule, bone, span)
    def _d(u, v):
        return abs((u - v + math.pi) % (2 * math.pi) - math.pi)
    gaps = [max(_d(poses[k][n][j], poses[(k + 1) % nf][n][j]) for n in poses[k] for j in (0, 2))
            for k in range(nf)]
    print(f"  {name:7s} {os.path.basename(path):22s} 원본 {len(frames):5d}판 {round(1/dt):3.0f}fps"
          f" · 창 {start:5d}+{period:4d}({period*dt:5.2f}초) · 손 앞 {F:5.1f}px 옆 {S:5.1f}px"
          f" · 앞/옆 {(F/S if S else 0):4.2f} · 앞으로 나감 {EXT:+5.1f}px"
          f" · 이음새 {math.degrees(gaps[-1]):5.1f}°"
          f" · 판간 최대 {math.degrees(max(gaps[:-1])):5.1f}°"
          + (f" · 교차 {getattr(cycle_of if rule == 'cycle' else beat_of, 'last', ('-', 0, 0))[0]}회"
             f" {getattr(cycle_of if rule == 'cycle' else beat_of,'last',(0,0,0))[1]}~"
             f"{getattr(cycle_of if rule == 'cycle' else beat_of,'last',(0,0,0))[2]}판"
             if rule in ("cycle", "beat") else ""))


def main():
    doc = {
        "_": "mocap_retarget.py 산물 — 손편집 금지. 원본은 assets-src/mocap/*.bvh, 규약은 그 스크립트.",
        "nframes": {c[0]: c[3] for c in CLIPS},
        "bones": [b[0] for b in BONES],
        "clips": {},
        "source": {},
    }
    for clip, fn, label, nf, fps, loop, rule, bone in CLIPS:
        src = os.path.join(SRC, fn)
        if not os.path.exists(src):
            print(f"[mocap] ⚠{fn} 이 없다 — {clip} 을 건너뛴다")
            continue
        nodes, order, frames, dt = parse_bvh(src)
        poses, info = retarget(src, nf, loop, rule, bone, int(round(nf / fps / dt)))
        info["nframes"], info["clipFps"], info["loop"], info["rule"] = nf, fps, loop, rule
        doc["clips"][clip] = poses
        info["file"] = fn
        info["clip"] = label
        doc["source"][clip] = info
        # 루프 이음새 — 첫↔끝 |Δ각| 이 이웃 프레임 간격 안이면 튀지 않는다
        gaps = []
        for k in range(nf):
            a, b = poses[k], poses[(k + 1) % nf]
            gaps.append(max(abs((a[n][j] - b[n][j] + math.pi) % (2 * math.pi) - math.pi)
                            for n in a for j in (0, 2)))
        info["loopSeamDeg"] = round(math.degrees(gaps[-1]), 3)
        info["stepMaxDeg"] = round(math.degrees(max(gaps[:-1])), 3)
        print(f"[mocap] {clip}: {fn} · 주기 {info['cyclePeriod']}프레임({info['cycleSec']}초) "
              f"· 이음새 {info['loopSeamDeg']}° · 프레임 간 최대 {info['stepMaxDeg']}°")
    with open(OUT, "w") as f:
        json.dump(doc, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"[mocap] 저장: {OUT}")


if __name__ == "__main__":
    import sys
    if "--probe" in sys.argv:
        print("[mocap] §0 후보 표 — 굽기 전에 재는 자리(채택은 26px 대조표)")
        for arg in sys.argv[sys.argv.index("--probe") + 1:]:
            probe(*arg.split("=", 1))
    else:
        main()
