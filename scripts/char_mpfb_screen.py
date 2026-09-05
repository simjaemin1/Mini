#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""char_mpfb_screen — MakeHuman(MPFB) 몸을 지금 파이프 위에 세워 보고 **26px 에서 재는** 스크린.  [T111]

    python3 scripts/char_mpfb_screen.py -- [--clips=idle,walk] [--out=/tmp/t111/screen]

★★배포 0 이다. `public/assets/char/` 를 **한 바이트도 안 건드린다** — 산물은 `--out` 자리로만 간다.
  정본 `char_render.py` 도 무접촉이다: **import 해서 그 씬·리그·옷·카메라·후처리를 그대로 쓴다.**
  (그래야 비교가 공정하다 — 바뀌는 변수는 **몸 하나**뿐이어야 한다.)

★왜 import 가 되나: `char_render.py` 는 `--only-meta` 면 굽기 루프를 건너뛴다. 그 앞까지가
  씬·조명·카메라·리그·옷·프레임 상자 구축이라, import 만으로 정본 씬이 통째로 선다(실측 0.8초).
  `--sheetdir` 을 임시 자리로 돌려 메타·`.blend` 도 거기로 나가게 한다(배포 자리 무접촉).
  ★그 임시 자리에 **정본 `char_meta.json` 을 미리 복사**한다 — 그래야 T107 상자 못박기가 걸려
  프레임이 정본과 같은 327×270 이 된다(안 그러면 다른 자로 잰 그림이 된다).

★MPFB 좌표계는 **재서** 맞췄다(§0-ⓐ):
    MPFB: +x = 캐릭터의 왼쪽 · **−y = 앞**(발끝 `ball_l` 방향 (−0.066, −0.997, 0.047)) · +z = 위
    우리: +x = 앞 · +y = 왼쪽 · +z = 위
  ⇒ 오브젝트를 **z 축 +90°** 돌린다. 키는 1.6594m 라 정본 1.7m 로 **1.02447 배**.

★뼈는 **거리 가중으로 새로 붙이지 않는다**(카드가 물은 그 선택지). MPFB `game_engine` 리그(53뼈)가
  우리 12뼈와 거의 1:1 이고(`pelvis`·`spine_02`·`upperarm_*`·`lowerarm_*`·`thigh_*`·`calf_*`·`head`),
  그 리그에는 **MakeHuman 이 만든 제대로 된 스킨 웨이트**가 이미 붙어 있다. 버릴 이유가 없다.
  ⇒ 우리 12뼈를 포즈한 뒤 **뼈의 방향만** 옮긴다(각도 사본 0 · 축 규약 사본 0).
    `pb.matrix` 를 아마추어 공간에서 직접 세우므로 MPFB 뼈의 롤·부모 축을 하나도 안 베낀다.
"""
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = next((a.split("=", 1)[1] for a in ARGS if a.startswith("--out=")), "/tmp/t111/screen")
CLIPS = next((a.split("=", 1)[1] for a in ARGS if a.startswith("--clips=")), "idle,walk").split(",")
SCRATCH = os.path.join(OUT, "_scene")
os.makedirs(SCRATCH, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
# 정본 메타를 임시 자리에 복사 → 상자 못박기가 걸린다(프레임 327×270 동일)
import shutil
_canon = os.path.join(ROOT, "public", "assets", "char", "char_meta.json")
if os.path.exists(_canon):
    shutil.copy(_canon, os.path.join(SCRATCH, "char_meta.json"))

sys.path.insert(0, HERE)
sys.argv = ["char_render", "--", "--only-meta", "--sheetdir=" + SCRATCH]
import bpy                                            # noqa: E402
import mathutils                                      # noqa: E402
import char_render as CR                              # noqa: E402  ★정본 씬을 통째로 들여온다
import ink_post                                       # noqa: E402

MPFB_H = 1.6594          # §0-ⓐ 실측 — MPFB 중립 몸의 키(m)
BODY_SCALE = CR.H_TOT / MPFB_H        # 정본 키(1.70m)에 맞춘다 — 54.4px 축척 규약을 지킨다

# 우리 12뼈 → MPFB game_engine 뼈. 부모부터 차례로 세운다(자식이 부모의 결과 위에 앉는다).
BONE_MAP = [
    ("root",   "pelvis"),
    ("spine",  "spine_02"),
    ("head",   "head"),
    ("uarmL",  "upperarm_l"), ("larmL", "lowerarm_l"),
    ("uarmR",  "upperarm_r"), ("larmR", "lowerarm_r"), ("handR", "hand_r"),
    ("thighL", "thigh_l"), ("shinL", "calf_l"),
    ("thighR", "thigh_r"), ("shinR", "calf_r"),
]


def make_mpfb():
    """MPFB 중립 몸 + game_engine 리그. 좌표계·키를 우리 규약으로 맞춘다."""
    import addon_utils, importlib
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=True)

    def dyn(pkg, key):
        for m in sys.modules:
            if m.endswith(pkg):
                mod = importlib.import_module(m)
                if hasattr(mod, key):
                    return getattr(mod, key)
        raise SystemExit("MPFB 를 못 찾았다 — 확장으로 설치했나? (보고서 §0-ⓐ)")
    HS = dyn("mpfb.services.humanservice", "HumanService")
    body = HS.create_human()
    rig = HS.add_builtin_rig(body, "game_engine")
    body.name = "MPFB_body"; rig.name = "MPFB_rig"
    # 우리 축으로: z +90° · 키 맞춤 · z 압축(정본 리그와 같은 규약)
    rig.rotation_euler = (0.0, 0.0, math.pi / 2)
    rig.scale = (BODY_SCALE, BODY_SCALE, BODY_SCALE * CR.ZSQ)
    rig.location = (0.0, 0.0, 0.0)
    # 몸에는 정본 살빛을 입힌다 — 비교에서 **바뀌는 변수는 형상 하나**여야 한다
    body.data.materials.clear()
    body.data.materials.append(CR.M['skin'])      # 정본 살빛 그대로 — 변수는 형상 하나
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    # ★정본의 가시성 관리(`set_visible`)가 이 몸도 알게 등록한다. 파일은 안 건드리고 **목록만** 넓힌다.
    if body not in CR.ALLOBJ:
        CR.ALLOBJ.append(body)
    bpy.context.view_layer.update()
    return body, rig


def bone_dir_arm(rigobj, name):
    """아마추어 공간에서의 뼈 방향(단위). 오브젝트 스케일·회전이 안 섞인다."""
    pb = rigobj.pose.bones[name]
    v = (pb.tail - pb.head)
    return v.normalized()


def aim_bone(rigobj, name, target_arm):
    """그 뼈가 아마추어 공간에서 target 방향을 보게 한다 — 롤·부모축을 안 베낀다."""
    pb = rigobj.pose.bones[name]
    M = pb.matrix.copy()
    cur = (pb.tail - pb.head).normalized()
    q = cur.rotation_difference(target_arm)
    R = (q.to_matrix() @ M.to_3x3()).to_4x4()
    R.translation = M.translation
    pb.matrix = R
    bpy.context.view_layer.update()


def our_dirs(clip, fi, n):
    """정본 리그를 그 프레임으로 포즈하고 12뼈의 **몸 좌표** 방향을 읽는다(방향 회전 0)."""
    CR.apply_pose(clip, fi, n, 0)
    out = {}
    for ours, _ in BONE_MAP:
        out[ours] = bone_dir_arm(CR.rig, ours)
    return out


def pose_mpfb(rig, dirs):
    for ours, theirs in BONE_MAP:
        d = dirs[ours]
        # 몸 좌표(앞 x · 왼 y · 위 z) → MPFB 좌표(왼 x · 앞 −y · 위 z)
        aim_bone(rig, theirs, mathutils.Vector((d.y, -d.x, d.z)))


# ═══════════════ 굽기 — 정본과 **같은 카메라·조명·후처리** ═══════════════
def render_sheet(kind, clip, n, objs, holdouts, mrig, mbody):
    """행=방향 · 열=프레임. `char_render.render_layer` 와 같은 문법이되 몸을 갈아 끼운다."""
    TW, TH = CR.FW // CR.SS, CR.FH // CR.SS
    SW, SH = TW * n, TH * CR.DIRS
    sheet = CR.blank_sheet(SW, SH)
    tmp = os.path.join(CR.OUTDIR, "_mpfb_tmp.png")
    CR.set_visible(objs, holdouts)
    for d in range(CR.DIRS):
        for fi in range(n):
            dirs = our_dirs(clip, fi, n)              # 정본 리그를 포즈하고 방향을 읽는다
            CR.apply_pose(clip, fi, n, d)             # 프리즘 쪽은 그대로(방향 회전 포함)
            if kind == "mpfb":
                pose_mpfb(mrig, dirs)
                mrig.rotation_euler = (0.0, 0.0, math.pi / 2 + d * (2 * math.pi / CR.DIRS))
                mrig.location = CR.rig.location.copy()     # 걸음의 상하 흔들림(bob)도 같이
                bpy.context.view_layer.update()
            CR.scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            CR._flip_png(tmp)
            img = bpy.data.images.load(tmp)
            px = list(img.pixels[:])
            bpy.data.images.remove(img)
            px, tw, th = CR.downsample(px, CR.FW, CR.FH, CR.SS)
            CR.blit(sheet, SW, px, tw, th, fi * tw, (CR.DIRS - 1 - d) * th)
    return sheet, SW, SH


def main():
    mbody, mrig = make_mpfb()
    # 프리즘 몸과 MPFB 몸은 **번갈아** 보인다
    CLOTHSET = ["hemp", "fur", "ramie"]
    made = {}
    for clip in CLIPS:
        n = CR.CLIP_N[clip]
        for kind in ("prism", "mpfb"):
            objs = [mbody] if kind == "mpfb" else list(CR.BODY)
            sheet, SW, SH = render_sheet(kind, clip, n, objs, [], mrig, mbody)
            ink_post.cel_quantize(sheet, SW, SH, CR.CEL_BANDS, CR.EDGE_A, mask=None)
            ink_post.ink_outline(sheet, SW, SH, ink_post.INK_A, mask=None)
            key = f"{kind}_body_{clip}"
            CR.save_sheet(sheet, SW, SH, os.path.join(OUT, key + ".png"))
            made[key] = (SW, SH)
            print(f"[mpfb-screen] {key}: {SW}x{SH}")
            # 옷 — 같은 기하를 두 몸 위에 올려 관통을 잰다(§0-ⓒ)
            for ck in CLOTHSET:
                CR.set_cloth_material(ck)
                hold = [mbody] if kind == "mpfb" else list(CR.BODY)
                sheet, SW, SH = render_sheet(kind, clip, n, CR.cloth_objs(ck), hold, mrig, mbody)
                ink_post.cel_quantize(sheet, SW, SH, CR.CEL_BANDS, CR.EDGE_A, mask=None)
                ink_post.ink_outline(sheet, SW, SH, ink_post.INK_A, mask=None)
                key = f"{kind}_clothes_{ck}_{clip}"
                CR.save_sheet(sheet, SW, SH, os.path.join(OUT, key + ".png"))
                made[key] = (SW, SH)
                print(f"[mpfb-screen] {key}: {SW}x{SH}")
    print(f"[mpfb-screen] {len(made)}장 → {OUT}")


if __name__ == "__main__":
    main()
