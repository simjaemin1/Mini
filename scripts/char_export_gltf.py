#!/usr/bin/env python3
# =============================================================================
# scripts/char_export_gltf.py — ★★[T522 2026-09-29] 사람 하나를 glTF 로 (재민 확정: 최종은 3D · 사람·동물만 3D)
#
# ★파이프 한 줄: `char_render.py` 의 **그 장면**(소체 · 12본 리그 · 로프트 웨이트 · 포즈 함수)을 그대로 세우고
#   클립 셋(서기 idle · 걷기 walk · 조준 aim)을 **액션**으로 구워 `.glb` 하나로 낸다(엔진 무관 자산).
#   ★새 형상 0 — 몸·옷의 기하는 `char_render.py` 가 짓는다. 이 파일은 **짓지 않는다**:
#     `char_render.py` 원문을 "공유 프레임 박스" 절 **앞까지** 읽어 실행한다(굽기·상자 계산·시트 저장은 안 지난다).
#     표지 줄이 없거나 필요한 이름이 없으면 **죽는다**(조용히 다른 장면을 내보내지 않는다).
#   ★포즈는 `apply_pose(clip, 판, 판수, 방향 0)` **그 함수**로 세운다 — 판마다 뼈 회전을 쿼터니언 열쇠로 옮긴다.
#     걸음 흔들림(bob)은 리그 오브젝트 대신 **root 뼈**의 위치로 옮긴다(글TF 한 액션에 뼈 채널만 · 값 무변).
#   ★z 누르기(ZSQ)는 **안 굽는다** — 리그 스케일을 1 로 되돌려 참 3D 로 낸다. 누르기는 엔진이 부모 스케일로 한다:
#     시트와 같은 순서("포즈한 다음 누르기" — `char_render.py` ZSQ 절)가 부모 스케일에서 저절로 선다.
#   ★옷은 한 벌(가죽 · 카드 ④) — 같은 기하에 재질 슬롯만 가죽으로(`set_cloth_material('leather')` · T81 문법).
#
# 실행:  python3 scripts/char_export_gltf.py            (pip `bpy` 5.0.1 · 동봉 `io_scene_gltf2`)
# 결과:  public/assets/char3d/char_body.glb · char3d_meta.json · char3d.lock.json
# 잠금:  `char3d.lock.json` = 파일 sha1 앞 16자(glb·메타) + 굽는 기계 + 입력 지문(`char_render.py`·`poses.json`) —
#        `scripts/e2e-char3d.js` ⓐ 가 잰다(글TF 는 화소가 아니라 **바이트**가 자산이다 · 같은 입력 두 번 = 같은 바이트).
# =============================================================================
import os, sys, json, math, hashlib, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "char_render.py")
MARK = "# ═══════════════ 공유 프레임 박스 ═══════════════"
OUT = os.path.join(ROOT, "public", "assets", "char3d")
GLB = os.path.join(OUT, "char_body.glb")
META = os.path.join(OUT, "char3d_meta.json")
LOCK = os.path.join(OUT, "char3d.lock.json")
CLIPS_OUT = ("idle", "walk", "aim")       # 카드 ①: 서기 · 걷기 · 조준
CLOTH_KEY = "leather"                     # 카드 ④: 옷 한 벌(가죽)
SCENE_FPS = 90                            # 열쇠 시각 = 판 ÷ 클립 fps (초) · 90 = 클립 fps 셋(0.9·10·2)의 판이 전부 정수 눈금에 떨어지는 가장 작은 수(샘플링이 판을 안 비껴간다)


def sha16(p):
    return hashlib.sha1(open(p, "rb").read()).hexdigest()[:16]


# ── ① `char_render.py` 의 장면을 **그대로** 세운다(굽기 앞까지) ──────────────────────────
src = open(SRC, encoding="utf-8").read()
if MARK not in src:
    raise SystemExit(f"[char3d] ★표지 줄이 없다: {MARK!r} — char_render.py 가 바뀌었다(이 파이프를 고쳐라)")
head = src[:src.index(MARK)]
_tmp = tempfile.mkdtemp(prefix="char3d-")          # ★시트 자리 덮어쓰기 — 저장소의 시트·메타·.blend 를 안 건드린다
sys.argv = [SRC, "--", "--sheetdir=" + _tmp]
NS = {"__name__": "char_render_scene", "__file__": SRC}
exec(compile(head, SRC, "exec"), NS)
for need in ("bpy", "rig", "BODY", "CLOTH", "ALLOBJ", "apply_pose", "CLIP_N", "CLIP_FPS", "CLIP_LOOP",
             "set_cloth_material", "ZSQ", "scene", "sun", "world", "V"):
    if need not in NS:
        raise SystemExit(f"[char3d] ★장면에 `{need}` 가 없다 — char_render.py 앞절이 바뀌었다")
bpy = NS["bpy"]; rig = NS["rig"]; scene = NS["scene"]; ZSQ = NS["ZSQ"]
apply_pose = NS["apply_pose"]; CLIP_N = NS["CLIP_N"]; CLIP_FPS = NS["CLIP_FPS"]; CLIP_LOOP = NS["CLIP_LOOP"]

# ── ② 내보낼 것만 남긴다: 몸 + 옷 한 벌(가죽) · 리그 ───────────────────────────────────────
NS["set_cloth_material"](CLOTH_KEY)
keep = {o.name for o in NS["BODY"]} | {o.name for o in NS["CLOTH"]}
body_names = sorted(o.name for o in NS["BODY"])
cloth_names = sorted(o.name for o in NS["CLOTH"])
for o in list(scene.objects):
    if o.type == "MESH" and o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
rig.scale = (1.0, 1.0, 1.0)            # ★참 3D — 누르기는 엔진(부모 스케일)
rig.location = (0.0, 0.0, 0.0)
rig.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

# ── ③ 클립 셋 = 액션 셋 — `apply_pose` 그 함수로 판마다 세우고 쿼터니언 열쇠로 옮긴다 ──────────
scene.render.fps = SCENE_FPS
scene.render.fps_base = 1.0
try:
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
except Exception:
    pass
if rig.animation_data is None:
    rig.animation_data_create()
clip_meta = {}
_prevq = {}
for clip in CLIPS_OUT:
    n, fps, loop = CLIP_N[clip], CLIP_FPS[clip], CLIP_LOOP[clip]
    act = bpy.data.actions.new(clip)
    act.use_fake_user = True
    rig.animation_data.action = act
    _prevq.clear()
    keys = n + (1 if loop else 0)                  # 루프면 끝에 0번 판을 한 번 더(되돌아오는 보간이 끊기지 않게)
    for k in range(keys):
        kk = k % n
        apply_pose(clip, kk, n, 0)                  # ★방향 0(+x 를 본다) — 방향은 엔진이 돌린다(연속 회전)
        bob = rig.location.z / ZSQ                  # apply_pose 는 누른 값을 적는다(리그 스케일이 자기 위치를 안 먹는 까닭) → 참 3D 로 되돌림
        rig.location = (0.0, 0.0, 0.0)
        f = k / fps * SCENE_FPS
        for pb in rig.pose.bones:
            q = pb.rotation_euler.to_quaternion() if pb.rotation_mode == "XYZ" else pb.rotation_quaternion.copy()
            p = _prevq.get(pb.name)
            if p is not None and p.dot(q) < 0:      # 부호 연속 — 슬러프가 먼 길로 안 돌게
                q.negate()
            _prevq[pb.name] = q.copy()
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == "root":
                pb.location = (0.0, bob, 0.0)       # root 뼈는 +z 를 가리킨다 → 뼈 y = 세계 +z
                pb.keyframe_insert("location", frame=f)
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 0, act)
    rig.animation_data.action = None
    clip_meta[clip] = {"frames": n, "fps": fps, "loop": bool(loop), "duration": round(((n if loop else max(1, n - 1)) / fps), 6)}
# 쉼 자세로 되돌린다(내보내기의 휴지 자세 = 리그 휴지)
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    pb.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

# ── ④ 내보내기 — GLB 하나 ─────────────────────────────────────────────────────────────
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action="DESELECT")
for o in scene.objects:
    if o == rig or o.name in keep:
        o.select_set(True)
bpy.context.view_layer.objects.active = rig
opts = dict(filepath=GLB, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
            export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,
            export_skins=True, export_def_bones=False, export_leaf_bone=False, export_reset_pose_bones=True,
            export_optimize_animation_size=False, export_anim_slide_to_zero=False,
            export_materials="EXPORT", export_normals=True, export_texcoords=False, export_vertex_color="NONE",
            export_cameras=False, export_lights=False, export_extras=False, export_morph=False)
known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})

# ── ⑤ 메타 — 엔진이 읽는 규약(클라에 수를 적지 않게) ────────────────────────────────────
import io_scene_gltf2
_sun = NS["sun"]
_sd = _sun.matrix_world.to_3x3() @ NS["V"]((0.0, 0.0, -1.0))          # 태양이 **비추는** 방향(Blender z-up)
_bg = NS["world"].node_tree.nodes.get("Background")
meta = {
    "_": "[T522] char_export_gltf.py 산물 — 엔진이 읽는 규약. 클라는 이 수를 하드코딩하지 않는다.",
    "glb": "char_body.glb",
    "units": "1 = 1m = 1셀(32 게임px)",
    "facing": "방향 0 = 모델 +x(Blender) — 시트 행 0 과 같다 · 방향 d = d×45°(연속 회전은 atan2(fy,fx))",
    "zsq": ZSQ,
    "zsqNote": "엔진이 부모 스케일로 누른다(포즈 뒤 누르기 = char_render.py ZSQ 절과 같은 순서)",
    "flip": "시트는 굽고 나서 좌우를 뒤집는다(_flip_png) — 엔진은 모델 좌표를 게임 좌표 그대로 놓고(거울 = 행렬식 −1) 같은 그림을 얻는다",
    "clips": clip_meta,
    "meshes": {"body": body_names, "clothes": cloth_names, "clothesMat": CLOTH_KEY},
    "sunDir": [round(c, 6) for c in _sd],
    "sunEnergy": _sun.data.energy,
    "ambient": [round(c, 6) for c in tuple(_bg.inputs[0].default_value)[:3]] if _bg else None,
    "ambientStrength": float(_bg.inputs[1].default_value) if _bg else None,
    "exporter": "io_scene_gltf2 " + ".".join(str(x) for x in io_scene_gltf2.bl_info.get("version", ())),
    "bpy": bpy.app.version_string,
}
with open(META, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")

lock = {
    "_": "[T522] char3d 잠금 — 값 = 파일 sha1 앞 16자(글TF 는 바이트가 자산이다). 입력 지문이 바뀌면 다시 굽는다.",
    "_기계": f"pip bpy {bpy.app.version_string} · {meta['exporter']}",
    "_입력": {"scripts/char_render.py": sha16(SRC),
              "assets-src/mocap/poses.json": sha16(os.path.join(ROOT, "assets-src", "mocap", "poses.json")),
              "scripts/char_export_gltf.py": sha16(os.path.abspath(__file__))},
    "char3d": {"char_body.glb": sha16(GLB), "char3d_meta.json": sha16(META)},
}
with open(LOCK, "w", encoding="utf-8") as f:
    json.dump(lock, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
_clips_s = ", ".join("%s %d판" % (k, v["frames"]) for k, v in clip_meta.items())
print(f"[char3d] {os.path.relpath(GLB, ROOT)} {os.path.getsize(GLB)}B · 클립 {_clips_s}"
      f" · 몸 {len(body_names)} · 옷 {len(cloth_names)}({CLOTH_KEY}) · 잠금 {lock['char3d']['char_body.glb']}")
