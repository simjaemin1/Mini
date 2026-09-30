#!/usr/bin/env python3
# =============================================================================
# scripts/char_export_clips.py — ★★[T539 2026-09-30] 클립 나머지를 glTF 로(뼈대 + 액션만 · 몸·옷 메시 0)
#
# ★왜 따로인가: `char_body.glb`(몸 7 · 가죽옷 5 · 서기·걷기·조준)와 그 잠금 `char3d.lock.json` 은
#   **바이트 그대로 둔다**(카드 T539 "잠금 바이트 동일 · 형상 무변"). 그래서 이 파일은 `char_export_gltf.py` 를
#   **고치지 않고 읽어서** 쓴다 — 그 원문의 ①(머리 상수 + `char_render.py` 장면)·②(내보낼 것만)·④(GLB 내보내기)
#   절을 표지 줄로 잘라 그대로 실행하고(사본 0), 달라지는 것만 여기 둔다:
#     ⓐ 클립 목록 = `char_render.py` 의 CLIPS 가운데 `char_body.glb` 에 안 들어간 전부(달리기·휘두르기·쓰러짐·업기·
#        포로 둘·모캡 둘째 판 셋) — 표에 새 클립이 생기면 저절로 따라온다.
#     ⓑ 접지 클립(`_GROUND_CLIPS` — 쓰러짐·업기)의 내림은 **참 3D 값 그대로** root 뼈로 옮긴다.
#        (`char_export_gltf ③` 의 `rig.location.z ÷ ZSQ` 는 걸음 흔들림 몫이다 — apply_pose 가 흔들림은 누른 값으로,
#         내림은 **잰 값**으로 적기 때문이다. 내림은 리그 스케일 1 에서 재므로 이미 참 3D 다.)
#        ⇒ 내림은 옷·도구를 지우기 **전에** 잰다 — 시트 굽기가 누운 판을 **전 층**(`all_layer_objects`)으로 재기 때문이다.
#     ⓒ 내보내기 = 뼈대(CharRig)만 선택 — 메시 0. 엔진은 이 액션을 `char_body.glb` 몸에 **뼈 이름으로** 건다.
#
# 실행:  python3 scripts/char_export_clips.py        (pip `bpy` 5.0.1 · 동봉 `io_scene_gltf2`)
# 결과:  public/assets/char3d/char_clips.glb · char3d_clips_meta.json · char3d_clips.lock.json
# 잠금:  값 = sha1 앞 16자(바이트가 자산) · `_입력` = char_render.py · poses.json · char_export_gltf.py · 이 파일 — `scripts/e2e-char3d.js` ⓐ 가 잰다.
# =============================================================================
import os, sys, json, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = os.path.join(HERE, "char_export_gltf.py")
RSRC = os.path.join(HERE, "char_render.py")
OUTD = os.path.join(ROOT, "public", "assets", "char3d")
CGLB = os.path.join(OUTD, "char_clips.glb")
CMETA = os.path.join(OUTD, "char3d_clips_meta.json")
CLOCK = os.path.join(OUTD, "char3d_clips.lock.json")
M2 = "# ── ② 내보낼 것만 남긴다"
M3 = "# ── ③ 클립 셋 = 액션 셋"
M4 = "# ── ④ 내보내기 — GLB 하나"
M5 = "# ── ⑤ 메타"


def sha16(p):
    return hashlib.sha1(open(p, "rb").read()).hexdigest()[:16]


base_src = open(BASE, encoding="utf-8").read()
for mk in (M2, M3, M4, M5):
    if mk not in base_src:
        raise SystemExit(f"[char3d-clips] ★표지 줄이 없다: {mk!r} — char_export_gltf.py 가 바뀌었다(이 파이프를 고쳐라)")
part1 = base_src[:base_src.index(M2)]
part2 = base_src[base_src.index(M2):base_src.index(M3)]
part4 = base_src[base_src.index(M4):base_src.index(M5)]

# ── ① 머리 상수 + `char_render.py` 장면(굽기 앞까지) — `char_export_gltf.py` 그 절 그대로 ─────────────
G = {"__name__": "char3d_base", "__file__": BASE}
exec(compile(part1, BASE, "exec"), G)
NS, bpy, rig, scene, ZSQ = G["NS"], G["bpy"], G["rig"], G["scene"], G["ZSQ"]
apply_pose, CLIP_N, CLIP_FPS, CLIP_LOOP = G["apply_pose"], G["CLIP_N"], G["CLIP_FPS"], G["CLIP_LOOP"]
for need in ("_GROUND_CLIPS", "TOOLS", "CLIPS"):
    if need not in NS:
        raise SystemExit(f"[char3d-clips] ★장면에 `{need}` 가 없다 — char_render.py 앞절이 바뀌었다")
# 누운 판의 접지 자(`all_layer_objects`)는 char_render.py 표지 줄 **뒤**에 있다 — 그 정의 하나만 읽어 세운다(사본 0)
rsrc = open(RSRC, encoding="utf-8").read()
_i0 = rsrc.find("def all_layer_objects():")
if _i0 < 0:
    raise SystemExit("[char3d-clips] ★char_render.py 에 `all_layer_objects` 가 없다")
exec(compile(rsrc[_i0:rsrc.index("\n\n\n", _i0)], RSRC, "exec"), NS)

MORE = [c[0] for c in NS["CLIPS"] if c[0] not in G["CLIPS_OUT"]]   # 표 순서 그대로
if not MORE:
    raise SystemExit("[char3d-clips] 내보낼 나머지 클립이 없다")

# ── 접지 — 참 3D(리그 스케일 1)에서 · 옷·도구를 지우기 전에(시트 굽기와 같은 층으로 잰다) ─────────────
rig.scale = (1.0, 1.0, 1.0)
rig.location = (0.0, 0.0, 0.0)
rig.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()
for _c in sorted(NS["_GROUND_CLIPS"]):
    if _c in MORE:
        apply_pose(_c, 0, CLIP_N[_c], 0)          # 첫 부름이 잰다(`_ground_drop` 캐시)

# ── ② 내보낼 것만 — `char_export_gltf.py` 그 절 그대로(가죽 재질 · 몸+옷 · 리그 원점) ────────────────
exec(compile(part2, BASE, "exec"), G)

# ── ③ 나머지 클립 = 액션 — 판마다 apply_pose → 뼈 쿼터니언 열쇠(부호 연속) · root 뼈 = 흔들림/내림 ─────────
# 열쇠 눈금 — ★이 파일의 시각은 **판 번호**다(1초 = 1판 · `timeUnit: "frame"`). 판 k 의 열쇠가 시각 k 에 선다.
#   왜: 내보내기는 뼈 액션을 장면 fps 로 **표본을 뜬다**(`export_force_sampling=False` 여도 뼈는 뜬다 — T539 실측).
#   클립 fps 가 14·10·2·1·0.9 로 섞여 있어 초 단위로 모든 판을 정수 눈금에 앉히려면 630fps 가 들고(파일 2.4MB — 1판 실측),
#   판 번호를 시각으로 쓰면 1fps 한 눈금에 **모든 판이 정확히** 앉는다(표본 = 열쇠 · 사이 표본 0).
#   엔진은 메타의 fps 로 초 → 판(= 이 파일 시각)을 바꾼다. 몸 파일(`char_body.glb`)은 종전대로 초 단위다.
SCENE_FPS = 1
scene.render.fps = SCENE_FPS
scene.render.fps_base = 1.0
try:
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
except Exception:
    pass
if rig.animation_data is None:
    rig.animation_data_create()
for tr in list(rig.animation_data.nla_tracks):      # ②까지는 트랙이 없다 — 있으면 지운다(뼈대 파일은 이 카드 클립만)
    rig.animation_data.nla_tracks.remove(tr)
GROUND = set(NS["_GROUND_CLIPS"])
clip_meta = {}
_prevq = {}
for clip in MORE:
    n, fps, loop = CLIP_N[clip], CLIP_FPS[clip], CLIP_LOOP[clip]
    act = bpy.data.actions.new(clip)
    act.use_fake_user = True
    rig.animation_data.action = act
    _prevq.clear()
    keys = n + (1 if loop else 0)
    for k in range(keys):
        kk = k % n
        apply_pose(clip, kk, n, 0)                  # ★방향 0 — 방향은 엔진이 돌린다
        off = rig.location.z if clip in GROUND else rig.location.z / ZSQ   # ⓑ 내림 = 잰 값(참 3D) · 흔들림 = 누른 값 ÷ ZSQ
        rig.location = (0.0, 0.0, 0.0)
        f = k                                       # ★시각 = 판 번호(위 눈금 주석)
        for pb in rig.pose.bones:
            q = pb.rotation_euler.to_quaternion() if pb.rotation_mode == "XYZ" else pb.rotation_quaternion.copy()
            p = _prevq.get(pb.name)
            if p is not None and p.dot(q) < 0:
                q.negate()
            _prevq[pb.name] = q.copy()
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if pb.name == "root":
                pb.location = (0.0, off, 0.0)       # root 뼈는 +z 를 가리킨다 → 뼈 y = 세계 +z
                pb.keyframe_insert("location", frame=f)
    track = rig.animation_data.nla_tracks.new()
    track.name = clip
    track.strips.new(clip, 0, act)
    rig.animation_data.action = None
    clip_meta[clip] = {"frames": n, "fps": fps, "loop": bool(loop),
                       "duration": round((keys - 1) / fps, 6),    # 초(엔진이 도는 길이) — 고리 = n/fps · 원샷 = (n−1)/fps · 한 판 = 0
                       "span": keys - 1,                          # 이 파일 시각의 마지막 열쇠(판) — 고리 n · 원샷 n−1 · 한 판 0
                       "ground": clip in GROUND}
for pb in rig.pose.bones:
    pb.rotation_mode = "QUATERNION"
    pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
    pb.location = (0.0, 0.0, 0.0)
bpy.context.view_layer.update()

# ── ④ 내보내기 — `char_export_gltf.py` 그 절 그대로 · 뼈대만(선택 = 리그 · 메시 0) · 파일 이름만 바꾼다 ───────
G["keep"] = set()
G["GLB"] = CGLB
exec(compile(part4, BASE, "exec"), G)

# ── 메타 · 잠금 ─────────────────────────────────────────────────────────────────
import io_scene_gltf2
_bm = json.load(open(os.path.join(OUTD, "char3d_meta.json"), encoding="utf-8"))
meta = {
    "_": "[T539] char_export_clips.py 산물 — `char_body.glb` 몸에 **뼈 이름으로** 거는 액션(메시 0). 클라는 수를 하드코딩하지 않는다.",
    "glb": "char_clips.glb",
    "for": "char_body.glb",
    "clips": clip_meta,
    "groundNote": "쓰러짐·업기의 내림은 root 뼈 위치(참 3D · 엔진 부모 스케일 zsq 로 눌린다) — 시트 굽기가 전 층으로 잰 그 값",
    "zsq": ZSQ,
    "timeUnit": "frame",
    "timeNote": "이 파일의 액션 시각 = 판 번호(판 k 의 열쇠가 시각 k) · 엔진: 파일 시각 = 초 × fps — 몸 파일(char_body.glb)은 초 단위",
    "exporter": "io_scene_gltf2 " + ".".join(str(x) for x in io_scene_gltf2.bl_info.get("version", ())),
    "bpy": bpy.app.version_string,
    "baseClips": sorted(_bm.get("clips", {}).keys()),
}
with open(CMETA, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
lock = {
    "_": "[T539] char3d 클립 잠금 — 값 = 파일 sha1 앞 16자. 입력 지문이 바뀌면 다시 굽는다. `char3d.lock.json`(몸)은 따로다.",
    "_기계": f"pip bpy {bpy.app.version_string} · {meta['exporter']}",
    "_입력": {"scripts/char_render.py": sha16(RSRC),
              "assets-src/mocap/poses.json": sha16(os.path.join(ROOT, "assets-src", "mocap", "poses.json")),
              "scripts/char_export_gltf.py": sha16(BASE),
              "scripts/char_export_clips.py": sha16(os.path.abspath(__file__))},
    "char3d_clips": {"char_clips.glb": sha16(CGLB), "char3d_clips_meta.json": sha16(CMETA)},
}
with open(CLOCK, "w", encoding="utf-8") as f:
    json.dump(lock, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
_s = ", ".join("%s %d판" % (k, v["frames"]) for k, v in clip_meta.items())
print(f"[char3d-clips] {os.path.relpath(CGLB, ROOT)} {os.path.getsize(CGLB)}B · 클립 {_s} · 잠금 {lock['char3d_clips']['char_clips.glb']}")
