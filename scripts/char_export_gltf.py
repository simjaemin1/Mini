#!/usr/bin/env python3
# =============================================================================
# scripts/char_export_gltf.py — ★★[T545 2026-10-03] 소체를 갈아끼운다(재민 확정 2026-09-30 · 실사풍 저폴리 · 좀보이드 결 · 툰 아님)
#   [T522 2026-09-29] 은 `char_render.py` 의 도형 소체(프리즘·로프트 몇 개)를 그대로 glTF 로 옮겼다. 3D 로 올리니 민낯이었다.
#   이 판은 **도구를 돌린다**(세션은 조각을 못 한다 — 손 모델링 0):
#
#   ① 소체 = MPFB 2.0.17(MakeHuman Plugin For Blender · 플러그인 GPL · **산출 메시·텍스처 CC0**) 을 pip `bpy` 안에서 돌린다.
#      매크로는 MPFB 기본값 그대로(나이·근육·체중·비율 0.5)에 성별 둘 · 인종 asian 1.0 — 프록시(저폴리 몸)는 MakeHuman
#      시스템 자산의 `male1591`·`female1605` · 눈 `low-poly` · 눈썹 `eyebrow001` · 머리 `ponytail01`(남)·`braid01`(여) ·
#      ★[T604 ②] 옷 기하 = **청동기 옷**(`char_clothes_mhclo.py` — 시트 `char_render.py` 의 링 표를 3D 몸에 입혀 MPFB `mhclo` 로 묶는다 ·
#      남 = 시트 그대로(옷자락 단 · 반팔 · 허리띠) · 여 = 무릎 단 · 긴팔 · 허리띠) — ★[T654] 옷 기하 하나(옷 넷이 같이) ·
#      ★[T708 ③] 갖옷 = **따로 지은 겉옷**(생성기 — 본 옷과 같은 위상 · 단 무릎 · 긴 소매 · 가슴 아래로 곧게 떨어지는 천 + 털 두께) —
#      정점 속성 `_furoffset`(옷 점 = 겉옷 자리 − 본 옷 자리 · m · glTF 축 · 그 밖 0)을 엔진 셰이더가 묶기 자세에서 더한다
#      (T654~T685 의 몸 부풀림 `_inflate` 를 걷었다) · [T664] 면 속성 `_furnormal` = 겉옷의 면 법선(갖옷 재질의 음영) ·
#      [T685] 점 속성 `_furjoints`·`_furweights` = 갖옷 몫 뼈 넷·무게 넷(겉옷 기하를 MPFB 로 따로 묶은 무게 · 그리지 않는다) ·
#      사용자 속성 넷 다 glb 뒷손질로 성긴 접근자).
#      ★[T708 ①] 묶기 자세 = **팔 내린 선 자세**(MPFB 쉼 A 자 → 다리 = BVH 0번 판 · 팔 = 서기 창 평균 · 좌우 대칭 — `stand_pose`) — 옷 넷 맞춤·뼈 무게는 이 자세에서.
#      T545 의 CC0 현대 옷(`male_casualsuit04`·`female_elegantsuit01`)은 더 안 읽는다.
#      키 = 1.60m(카드 "키 160cm 안팎" · 하네스 "사람 1.6m ↔ px") — 몸 맨 위(정수리)를 1.60m 에 맞추는 등배 한 번.
#      삼각형 = 한 몸 6,000 안(카드 "2~6k") — 살·눈·눈썹은 그대로 · [T604] 옷은 지은 그대로(링 표가 정한 수 · 남는 몫의 반 안이어야 한다) ·
#      나머지를 머리에(넘치면 축약 `Decimate`).
#   ② 리그 = MPFB 기본 리그 `cmu_mb`(31뼈 · 이름이 CMU BVH 관절과 같다) · 모션 = **CMU 모캡 리타깃**(코드 흔들기 0):
#      원본·창 규칙은 시트 굽기와 **같은 것**을 읽는다(`assets-src/mocap/*.bvh` · `mocap_retarget.py` 의 CLIPS·window_of — 사본 0).
#      리타깃 = 관절 월드 회전(BVH **0번 판**(변환기가 넣은 T자 보정 판) 대비) + **쉼 자세 보정**(팔다리만 — BVH 는 T자 · MPFB 는 A자 —
#      [T708 ①] 묶기 자세가 선 자세로 바뀌어도 보정은 옛 A 자 뼈 방향·틀(`align`)로 — 클립의 뼈 월드 회전은 그대로) ·
#      제자리(걷기·달리기 = 엉덩이 원점 · 서서 하는 클립 = 열쇠마다 두 발목 가운데 원점) · 접지(발 관절의 가장 낮은 높이 = 쉼 자세의 그 높이).
#      ★[T708 ②] 걷기·달리기의 **다리(엉덩이·무릎·발목)** = 열린 보행 자료의 평균 주기(`assets-src/gait/gait_norms.json` · `scripts/gait_norms.py` —
#      Fukuchi 2018 걷기 · 2017 달리기 · CC BY 4.0) — 위상만 모캡 넓적다리에 맞추고(상관) · 윗몸은 모캡 그대로 · 접지 = 열쇠마다 살 가장 낮은 점 = 0.
#   ③ 무늬 = 아틀라스 한 장(1024² 이하 · 카드) — 몸마다 **그리는 메시 하나 · 재질 하나**(족보 487 "몸마다 메시 하나·재질 아틀라스"):
#      ★[T654] 몸마다 메시 **하나**(T604 판의 갖옷 몸 `<몸>_fur` — 살·눈·눈썹·머리 사본 — 을 걷었다) · 옷 넷 = 재질(아틀라스) · 갖옷 = 셰이더가 겉옷 자리로([T708] `_furoffset`).
#      피부 = MakeHuman `young_asian_*`(CC0) · 눈 `brown` · 눈썹 · 머리(밝기 = 원판 · 빛깔 = 시트 정본 `char_render.py` 'hair') ·
#      옷 넷(삼베·모시·가죽·갖옷) = ambientCG(CC0) 사진의 결 × `render_common.CLOTH_MATS` 의 본천 색 ·
#      ★[T604] 허리띠 섬(옷 칸 안 가로 띠)만 본천 × `CLOTH_TRIM_K`(시트 허리끈 `hemp2` 와 같은 비).
#      알파(머리·눈썹)는 몸마다 따로 한 장 — 엔진이 `alphaMap` 으로 건다.
#   ④ 빛은 엔진이 건다(방향광 + 반구광 · 게임 시각·날씨) — 이 파일은 시트 굽기의 태양·하늘 정본(`render_common`)만 메타에 적는다.
#
# 원본은 저장소 밖(`~/Mini/_3d_in/` · `--src=` 로 바꾼다 · `_sfx_in/` 규약):
#   add-on-mpfb-v2.0.17.zip · makehuman_system_assets/(풀린 CC0 팩) · ambientcg/<Id>/<Id>_1K-JPG_Color.jpg
#   블렌더 사용자 폴더는 그 자리 안 `.blender_user/` 로 돌린다(`BLENDER_USER_RESOURCES` · `~/.config` 무접촉).
#
# 실행:  python3 scripts/char_export_gltf.py [--src=<원본 폴더>]        (pip `bpy` 5.0.1 · 동봉 `io_scene_gltf2`)
# 결과:  public/assets/char3d/char_body.glb · char3d_meta.json · char3d.lock.json · tex/{m,f}_{hemp,ramie,leather,fur}.jpg · tex/{m,f}_alpha.png
#        (옷 `mhclo` 는 중간 산물 — 원본 자리 안 `.work/t604/` · 저장소 밖 · 지문은 메타 `bodies.<몸>.clothes`)
# 잠금:  `char3d.lock.json` = 산물 sha1 앞 16자 + 굽는 기계 + 입력 지문(원본 파일마다) — 두 번 구워 바이트 동일 · `e2e-char3d` ⓐ 가 잰다.
# =============================================================================
import os, sys, json, math, hashlib, re, zipfile, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "assets", "char3d")
TEXD = os.path.join(OUT, "tex")
GLB = os.path.join(OUT, "char_body.glb")
META = os.path.join(OUT, "char3d_meta.json")
LOCK = os.path.join(OUT, "char3d.lock.json")
MOCAP = os.path.join(ROOT, "assets-src", "mocap")
ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SRCD = next((a.split("=", 1)[1] for a in ARGS if a.startswith("--src=")), None) \
    or os.environ.get("MINI_3D_IN") or os.path.expanduser("~/Mini/_3d_in")
SRCD = os.path.abspath(SRCD)
MPFB_ZIP = os.path.join(SRCD, "add-on-mpfb-v2.0.17.zip")
MH = os.path.join(SRCD, "makehuman_system_assets")
ACG = os.path.join(SRCD, "ambientcg")
USER_RES = os.path.join(SRCD, ".blender_user")
WORK = os.path.join(SRCD, ".work", "t604")             # ★[T604] 옷 `mhclo`·`obj`(중간 산물 — 저장소 밖 · 굽기마다 다시 짓는다)

H_PERSON = 1.60          # 카드 ①: 키 160cm 안팎 — 하네스 ⑤ "키 = 셀 규약(사람 1.6m ↔ px)" 와 같은 수
TRI_BUDGET = 6000        # 카드 ①: 폴리곤 2~6k 삼각형 — 한 몸(살·옷·머리·눈·눈썹 합) 상한
# KEYS_PER_FRAME — 시트 한 판 사이에 열쇠 넷(시트 판 k = 열쇠 4k — 시트 층을 얹는 판이 정확히 열쇠에 선다) · [T723] 정본은 `mocap_retarget.KEYS_PER_FRAME`(시트 다리 위상 맞춤과 같은 표본)
BODIES = {
    "M": {"gender": 1.0, "proxy": "proxymeshes/male1591/male1591.proxy", "skin": "skins/young_asian_male/young_lightskinned_male_diffuse3.png",
          "hair": "hair/ponytail01/ponytail01.mhclo"},
    "F": {"gender": 0.0, "proxy": "proxymeshes/female1605/female1605.proxy", "skin": "skins/young_asian_female/young_lightskinned_female_diffuse3.png",
          "hair": "hair/braid01/braid01.mhclo"},
}
COMMON = {"eyes": "eyes/low-poly/low-poly.mhclo", "eyetex": "eyes/materials/brown_eye.png", "brows": "eyebrows/eyebrow001/eyebrow001.mhclo"}
CLOTH_KINDS = ("hemp", "ramie", "leather", "fur")     # 카드 ③: 옷 넷(삼베·모시·가죽·갖옷) — 다섯째부터는 회부
FABRIC = {"hemp": "Fabric061", "ramie": "Fabric036", "leather": "Leather028", "fur": "Carpet016"}   # ambientCG(CC0) — 결만 쓴다(색은 CLOTH_MATS)
FABRIC_REPEAT = 4        # 옷 UV 한 장에 결이 되풀이되는 수(가로·세로)
ATLAS = 1024             # 카드 ③: 1024² 이하
PAD = 4                  # 칸 가장자리 번짐 막이(가장자리 화소를 바깥으로 늘린다)
CELLS = {                # 칸(PIL 좌표 · 왼쪽 위 원점) — x, y, w, h
    "skin":  (0, 0, 768, 768),
    "cloth": (768, 0, 256, 512),
    "hair":  (768, 512, 256, 512),
    "brows": (0, 768, 384, 256),
    "eyes":  (384, 768, 256, 256),
}


def sha16(p):
    return hashlib.sha1(open(p, "rb").read()).hexdigest()[:16]


# ── ⓪ 블렌더 사용자 폴더 = 원본 자리 안 · MPFB 확장 설치 · 자산 연결 ─────────────────────────────
for need in (MPFB_ZIP, MH, ACG):
    if not os.path.exists(need):
        raise SystemExit(f"[char3d] ★원본이 없다: {need} — `--src=` 로 원본 폴더를 주라(보고 T545 §원본)")
os.environ["BLENDER_USER_RESOURCES"] = USER_RES        # ★bpy 를 들이기 **전에** — 사용자 폴더(설정·확장)를 이 자리로
EXT = os.path.join(USER_RES, "extensions", "user_default", "mpfb")
_stamp = os.path.join(EXT, ".from_zip")
_zip_sha = sha16(MPFB_ZIP)
if not (os.path.exists(_stamp) and open(_stamp).read() == _zip_sha):
    shutil.rmtree(EXT, ignore_errors=True)
    os.makedirs(EXT)
    with zipfile.ZipFile(MPFB_ZIP) as z:
        z.extractall(EXT)
    with open(_stamp, "w") as f:
        f.write(_zip_sha)
_udata = os.path.join(USER_RES, "extensions", ".user", "user_default", "mpfb", "data")
os.makedirs(_udata, exist_ok=True)
for kind in ("proxymeshes", "clothes", "hair", "eyes", "eyebrows", "skins"):   # MPFB 는 프록시의 원본 경로를 제 자산 폴더에서 다시 찾는다
    link = os.path.join(_udata, kind)
    if os.path.islink(link) and os.readlink(link) == os.path.join(MH, kind):
        continue
    if os.path.lexists(link):
        os.remove(link)
    os.symlink(os.path.join(MH, kind), link)

import importlib                                       # noqa: E402
import bpy, addon_utils                                # noqa: E402
from mathutils import Matrix, Vector, Quaternion       # noqa: E402
import numpy as np                                     # noqa: E402
from PIL import Image                                  # noqa: E402
sys.path.insert(0, HERE)
import render_common as rc                             # noqa: E402  — 옷 색·태양·하늘 정본(읽기만)
import char_clothes_mhclo as CM                        # noqa: E402  — ★[T604] 청동기 옷 기하(시트 링 표 → mhclo)
import mocap_retarget as MR                            # noqa: E402  — BVH 파서·창 규칙·클립 표 정본(읽기만)
KEYS_PER_FRAME = MR.KEYS_PER_FRAME                     # ★[T723] 정본 한 자리 — 3D 열쇠와 시트 다리 위상 맞춤이 같은 표본(판 × 4)

for o in list(bpy.data.objects):                       # 시작 장면(정육면체·빛·카메라) 비우기
    bpy.data.objects.remove(o, do_unlink=True)
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, persistent=False)


def _svc(pkg, key):
    for m in list(sys.modules):
        if m.endswith(pkg):
            mod = importlib.import_module(m)
            if hasattr(mod, key):
                return getattr(mod, key)
    raise SystemExit(f"[char3d] ★MPFB 를 못 찾았다({pkg}) — 확장 설치가 안 됐다")


HS = _svc("mpfb.services.humanservice", "HumanService")
CS = _svc("mpfb.services.clothesservice", "ClothesService")
TS = _svc("mpfb.services.targetservice", "TargetService")
MPFB_VER = re.search(r'^version\s*=\s*"([^"]+)"', open(os.path.join(EXT, "blender_manifest.toml")).read(), re.M).group(1)   # schema_version 말고 version
INPUTS = {}                                            # 원본 지문 — 잠금 `_입력`


def src(rel):
    p = os.path.join(MH, rel)
    if not os.path.exists(p):
        raise SystemExit(f"[char3d] ★자산이 없다: {p}")
    INPUTS["makehuman_system_assets/" + rel] = sha16(p)
    return p


def tris(o):
    me = o.data
    return sum(len(p.vertices) - 2 for p in me.polygons)


def apply_mods(o, keep=("ARMATURE",)):
    """ARMATURE 밖의 모디파이어를 **맨 앞으로 옮겨** 차례로 적용한다(뼈대 무게는 그대로 산다)."""
    bpy.context.view_layer.objects.active = o
    for m in [m for m in o.modifiers if m.type not in keep]:
        with bpy.context.temp_override(object=o, active_object=o):
            bpy.ops.object.modifier_move_to_index(modifier=m.name, index=0)
            bpy.ops.object.modifier_apply(modifier=m.name)


def decimate(o, target):
    t0 = tris(o)
    if t0 <= target:
        return t0
    m = o.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = target / float(t0)
    m.use_symmetry = True
    m.symmetry_axis = "X"                              # MPFB 좌우 축(+x = 캐릭터 왼쪽)
    m.use_collapse_triangulate = True
    apply_mods(o)
    return tris(o)


def gltf_min_influence():
    """[T685] 내보내기(io_scene_gltf2)가 뼈 무게를 고르는 문턱 — 그 원문(`__get_bone_data` 의 `min_influence`)을 읽는다(사본 0 · 갖옷 몫 무게를 같은 규칙으로)."""
    import io_scene_gltf2
    p = os.path.join(os.path.dirname(io_scene_gltf2.__file__), "blender", "exp", "primitive_extract.py")
    m = re.findall(r"^\s*min_influence\s*=\s*([0-9.eE+-]+)\s*$", open(p, encoding="utf-8").read(), re.M)
    if len(m) != 1:
        raise SystemExit(f"[char3d] ★내보내기 원문에서 뼈 무게 문턱(min_influence)을 하나로 못 읽었다: {m} — {p}")
    return float(m[0])


# ── ⓪′ [T708 ①] 묶기 자세 = 팔 내린 선 자세 ─────────────────────────────────────────────────────────────
#   MPFB 쉼 자세는 A 자다(위팔 벌림 41° · 팔꿈치 굽힘 46° · 무릎 굽힘 6° · 발목 사이 0.36 — 프로브 실측) — 옷을 이 자세에서 맞추니 그림의 '쉼'이
#   팔 벌린 사람이었다(재민 10-11). ⇒ 옷을 맞추기 **전에** 기본 메시·뼈대의 쉼 자세를 바꾼다(몸 메시 교체 0 — 같은 MPFB 몸을 자세만):
#     다리(넓적다리·정강이) = BVH **0번 판**(곧게 선 다리 — 클립 리타깃의 기준 자세와 같은 판) · 팔(위팔·아래팔) = 서기 클립(`idle2`) 창의 **평균 방향**(좌우 평균 —
#     사람이 서서 팔을 내린 자료) · 손 = 아래팔 방향(손목 곧게 — `idle2` 리타깃도 손목 0°) · 발·발끝 = MPFB 쉼 그대로(발바닥이 땅에 평평) ·
#     몸통·목·머리·빗장·엉덩관절 = MPFB 그대로(손대지 않는다). 새 수 0 — 방향은 자료에서 · 손댈 뼈는 리타깃의 팔다리 사슬(`LIMB`).
#   굳히기 = 그 자세로 평가한 기본 메시 자리를 메시에 쓰고(모양 열쇠는 섞인 꼴 그대로 굳힌다) 뼈대 쉼 자세를 그 자세로(`armature_apply`) · 발바닥(살 가장 낮은 점)을 0 에 다시 세운다.
#   ★리타깃은 **옛 쉼 자세(A 자)의 뼈 방향·틀로** 맞춘다(`align`) — 클립의 뼈 월드 회전이 이 판 앞과 같다(쉼 자세는 옷·무게 묶기에만 든다).
def _bvh_dirs_engine(path, frames):
    """BVH 판들에서 팔다리 마디 방향(엔진 축 — 앞·왼·위 · 판마다 엉덩이 방위를 빼고) — {마디: (왼쪽, 오른쪽)} 의 판 목록."""
    nodes, order, fr, _dt = MR.parse_bvh(path)
    I = {nd["name"]: i for i, nd in enumerate(nodes)}
    out = []
    for fi in frames:
        pos = MR.fk(nodes, order, fr[fi])
        E = {n: Vector((pos[I[n]][2], pos[I[n]][0], pos[I[n]][1])) for n in I}   # BVH(x 왼 · y 위 · z 앞) → 엔진(앞 · 왼 · 위) — mocap_retarget 머리 주석의 실측 축
        left = E["LeftUpLeg"] - E["RightUpLeg"]
        left.z = 0.0
        left.normalize()
        Hn = Matrix(((left.y, -left.x, 0.0), (left.x, left.y, 0.0), (0.0, 0.0, 1.0)))   # 엉덩이 방위를 앞(+x)으로
        d = lambda a, b: (Hn @ (E[b] - E[a])).normalized()
        out.append({"UpLeg": (d("LeftUpLeg", "LeftLeg"), d("RightUpLeg", "RightLeg")), "Leg": (d("LeftLeg", "LeftFoot"), d("RightLeg", "RightFoot")),
                    "Arm": (d("LeftArm", "LeftForeArm"), d("RightArm", "RightForeArm")), "ForeArm": (d("LeftForeArm", "LeftHand"), d("RightForeArm", "RightHand"))})
    return out


def stand_targets():
    """[T708 ①] 선 자세 목표 방향(엔진 축 · 왼쪽 몸 — 오른쪽은 거울) — 다리 = BVH 0번 판 · 팔 = 서기 창 평균(좌우 평균) · 손 = 아래팔."""
    spec = next(c for c in MR.CLIPS if c[0] == "idle2")
    name, fn, label, nf, fps, loop, rule, bone = spec
    path = os.path.join(MOCAP, fn)
    INPUTS["assets-src/mocap/" + fn] = sha16(path)
    nodes, order, frames, dt = MR.parse_bvh(path)
    start, period = MR.window_of(nodes, order, frames, rule, bone, int(round(nf / fps / dt)), loop)
    mir = lambda v: Vector((v.x, -v.y, v.z))
    f0 = _bvh_dirs_engine(path, [0])[0]
    win = _bvh_dirs_engine(path, range(start, start + period))
    tg = {}
    for k in ("UpLeg", "Leg"):
        tg[k] = ((f0[k][0] + mir(f0[k][1])) / 2).normalized()
    for k in ("Arm", "ForeArm"):
        s = Vector((0.0, 0.0, 0.0))
        for q in win:
            s += q[k][0] + mir(q[k][1])
        tg[k] = s.normalized()
    tg["Hand"] = tg["ForeArm"].copy()
    return tg, {"src": fn, "legsFrame": 0, "armWindow": [int(start), int(period)]}


def stand_pose(base, rig):
    """[T708 ①] MPFB 쉼(A 자) → 팔 내린 선 자세로 기본 메시·뼈대를 굳힌다. 돌려주는 것: (옛 쉼의 뼈 방향·틀 — 리타깃 맞춤, 자세 표)."""
    tg, src_info = stand_targets()
    E2M = Matrix(((0.0, 1.0, 0.0), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0)))   # 엔진(앞 · 왼 · 위) → MPFB(+x 왼 · −y 앞 · +z 위)
    bones = rig.data.bones
    old = {b.name: ((b.tail_local - b.head_local).normalized(), b.matrix_local.to_3x3().normalized()) for b in bones}
    want = {}
    for side, sg in (("Left", 1.0), ("Right", -1.0)):
        for k in ("UpLeg", "Leg", "Arm", "ForeArm", "Hand"):
            v = tg[k]
            want[side + k] = (E2M @ Vector((v.x, sg * v.y, v.z))).normalized()
        for k in ("Foot", "ToeBase"):
            want[side + k] = "rest"                      # 발바닥 평평 — 쉼의 월드 틀 그대로
    order_b = [b for b in bones if b.parent is None]
    i = 0
    while i < len(order_b):
        order_b.extend(order_b[i].children)
        i += 1
    if any(n not in bones for n in want):
        raise SystemExit(f"[char3d] ★선 자세 뼈가 리그에 없다: {[n for n in want if n not in bones]}")
    bpy.context.view_layer.update()
    for b in order_b:
        if b.name not in want:
            continue
        pb = rig.pose.bones[b.name]
        Mc = pb.matrix.copy()
        if want[b.name] == "rest":
            R3 = b.matrix_local.to_3x3().normalized()
        else:
            cur = (Mc.to_3x3().normalized() @ Vector((0.0, 1.0, 0.0))).normalized()
            R3 = cur.rotation_difference(want[b.name]).to_matrix() @ Mc.to_3x3().normalized()
        pb.matrix = Matrix.Translation(Mc.translation) @ R3.to_4x4()
        bpy.context.view_layer.update()
    # 굳히기 — 가리개(MASK)를 끄고 평가한 자리(모양 열쇠 섞임 + 뼈대 자세)를 메시에 쓴다
    masks = [m for m in base.modifiers if m.type == "MASK"]
    was = [m.show_viewport for m in masks]
    for m in masks:
        m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get()
    ev = base.evaluated_get(dg)
    me = ev.to_mesh()
    co = [v.co.copy() for v in me.vertices]
    ev.to_mesh_clear()
    if len(co) != len(base.data.vertices):
        raise SystemExit("[char3d] ★선 자세 평가 점 수가 기본 메시와 다르다")
    if base.data.shape_keys:
        base.shape_key_clear()
    for v, c in zip(base.data.vertices, co):
        v.co = c
    base.data.update()
    bpy.context.view_layer.objects.active = rig
    with bpy.context.temp_override(active_object=rig, object=rig, selected_objects=[rig], selected_editable_objects=[rig]):
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.armature_apply(selected=False)
        bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    # 발바닥 다시 세우기 — 살(`body` 무리) 가장 낮은 점 = 0
    gi = base.vertex_groups["body"].index
    low = min(v.co.z for v in base.data.vertices if any(g.group == gi for g in v.groups))
    T = Matrix.Translation((0.0, 0.0, -low))
    base.data.transform(T)
    rig.data.transform(T)
    base.data.update()
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    ev = base.evaluated_get(dg)
    me = ev.to_mesh()
    err = max((a.co - b.co).length for a, b in zip(me.vertices, base.data.vertices)) if len(me.vertices) == len(base.data.vertices) else None
    ev.to_mesh_clear()
    for m, w in zip(masks, was):
        m.show_viewport = w
    if err is None or err > 1e-5:
        raise SystemExit(f"[char3d] ★선 자세를 굳힌 뒤 뼈대 변형이 단위가 아니다(차 {err}) — 쉼 자세가 안 섰다")
    def ang(bn):
        b = bones[bn]
        return (b.tail_local - b.head_local).normalized()
    tab = {}
    for nm, (d0, _B) in old.items():
        if nm in want:
            tab[nm] = round(math.degrees(d0.angle(ang(nm))), 3)
    side = {}
    for s in ("Left",):
        ua, fa = ang(s + "Arm"), ang(s + "ForeArm")
        th, sh = ang(s + "UpLeg"), ang(s + "Leg")
        side = {"armAbd": round(math.degrees(math.atan2(ua.x, -ua.z)), 3), "elbow": round(math.degrees(ua.angle(fa)), 3),
                "knee": round(math.degrees(th.angle(sh)), 3), "thighAbd": round(math.degrees(math.atan2(th.x, -th.z)), 3),
                "ankleGap": round(abs(bones["LeftFoot"].head_local.x - bones["RightFoot"].head_local.x), 5)}
    return old, dict(src_info, turned=tab, left=side, regroundM=round(-low, 6))


# ── ① 소체 — MPFB 로 몸 하나 · 프록시 · 눈 · 눈썹 · 머리 · 옷(기하 둘 — T604 청동기 옷) ──────────────────────
def build(sex):
    spec = BODIES[sex]
    macro = dict(TS.get_default_macro_info_dict())     # ★MPFB 기본값 그대로(새 수 0) — 성별·인종만 바꾼다
    macro["gender"] = spec["gender"]
    macro["race"] = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}
    base = HS.create_human(macro_detail_dict=macro)
    rig = HS.add_builtin_rig(base, "cmu_mb")
    # ★[T708 ①] 묶기 자세 = 팔 내린 선 자세(옷·눈·머리·프록시를 다 이 자세에서 맞춘다) — 옛 쉼(A 자)의 뼈 방향·틀은 리타깃 맞춤으로 남긴다
    alignA, stand = stand_pose(base, rig)
    # ★[T604 ②] 옷 = 시트 링 표 → 이 몸 → MPFB mhclo — 기본 메시(뼈 무게 · 보조 기하)를 읽어 짓는다(무리는 잠깐 세웠다 걷는다)
    #   [T654] 기하는 하나(옷 넷이 같이) — [T708 ③] 갖옷 = 같은 위상의 따로 지은 겉옷(`cl["fur"]`) · 엔진 셰이더가 그 자리로 옮긴다(메시 사본 0)
    cl = CM.make(sex, base, rig, WORK, CELLS["cloth"][2:], PAD, CS, log=print)
    prox = HS.add_mhclo_asset(src(spec["proxy"]), base, asset_type="Proxymeshes", subdiv_levels=0, material_type="NONE")
    parts = {"skin": prox}
    parts["eyes"] = HS.add_mhclo_asset(src(COMMON["eyes"]), base, asset_type="eyes", subdiv_levels=0, material_type="NONE")
    parts["brows"] = HS.add_mhclo_asset(src(COMMON["brows"]), base, asset_type="eyebrows", subdiv_levels=0, material_type="NONE")
    parts["hair"] = HS.add_mhclo_asset(src(spec["hair"]), base, asset_type="hair", subdiv_levels=0, material_type="NONE")
    parts["cloth"] = HS.add_mhclo_asset(cl["base"], base, asset_type="clothes", subdiv_levels=0, material_type="NONE")
    fur = HS.add_mhclo_asset(cl["fur"], base, asset_type="clothes", subdiv_levels=0, material_type="NONE")   # [T685] 갖옷 묶기(무게 재료만 · 안 그린다)
    for o in list(parts.values()) + [fur]:             # 모디파이어(무게 밖)는 적용해서 굳힌다 · 옷은 살을 안 지운다(delete_verts 0 — 어깨·단에서 살 구멍 0)
        apply_mods(o)
        for g in [g for g in o.vertex_groups if g.name not in rig.data.bones]:   # 뼈가 아닌 묶음은 버린다
            o.vertex_groups.remove(g)
    bpy.data.objects.remove(base, do_unlink=True)      # 기본 메시(고폴리)는 버린다 — 프록시가 몸이다
    for o in [rig, fur] + list(parts.values()):
        if o.matrix_world != Matrix.Identity(4):
            raise SystemExit(f"[char3d] ★{o.name} 의 오브젝트 변환이 단위가 아니다 — 데이터 변환 전제가 깨졌다")
    # ★[T654] 옷 점 차례 = 생성기가 지은 차례인가(털 두께 방향을 점 번호로 싣는다) — 묶어 입힌 점마다 가장 가까운 지은 점이 제 번호여야 한다
    #   [T685] 갖옷 묶기도 같은 검사(점 차례 = 본 옷 차례 — 갖옷 몫 무게를 같은 점 번호로 싣는다)
    for ob_, made_ in ((parts["cloth"], cl["baseVerts"]), (fur, cl["furVerts"])):
        got = np.array([tuple(v.co) for v in ob_.data.vertices], dtype=np.float64)
        made = np.array(made_, dtype=np.float64)
        near = ((got[:, None, :] - made[None, :, :]) ** 2).sum(-1).argmin(1) if len(got) == len(made) else None
        if near is None or (near != np.arange(len(made))).any():
            raise SystemExit(f"[char3d] ★{sex} 입힌 옷 점 차례가 지은 차례와 다르다({ob_.name} · 점 {len(got)} · 지은 {len(made)}) — 점 번호로 못 싣는다")
    # ★[T685] 갖옷 몫 뼈 무게 = 갖옷 묶기가 입힌 무게를 **내보내기와 같은 규칙**으로 고른다 — 문턱 = 내보내기 원문의 `min_influence`(사본 0) ·
    #   무게 큰 차례(같으면 묶음 차례 그대로 — 안정 정렬) · 앞 넷 · float32 합으로 나눔 → 정점 속성 `_furjoints`(뼈 번호 + 1 · 빈 칸 0 — glb 뒷손질이 glTF 뼈 번호로) · `_furweights`
    mi = gltf_min_influence()
    bidx = {b.name: i for i, b in enumerate(rig.data.bones)}
    nf = len(fur.data.vertices)
    FJ, FW = np.zeros((nf, 4), dtype=np.float32), np.zeros((nf, 4), dtype=np.float32)
    for v in fur.data.vertices:
        bones = [(bidx[fur.vertex_groups[g.group].name], g.weight) for g in v.groups if g.weight > mi and fur.vertex_groups[g.group].name in bidx]
        bones.sort(key=lambda x: x[1], reverse=True)
        if not bones:
            raise SystemExit(f"[char3d] ★{sex} 갖옷 점 {v.index} 에 뼈 무게가 없다 — 갖옷 묶기가 안 섰다")
        for c, (bi, w) in enumerate(bones[:4]):
            FJ[v.index, c], FW[v.index, c] = bi + 1, w
    FW /= FW.sum(axis=1).reshape(-1, 1)                # 내보내기 `primitive_attributes` 와 같은 정규화(float32 · 행마다)
    fur_n = {"verts": nf, "multi": int(sum(len([g for g in v.groups if g.weight > mi]) > 4 for v in fur.data.vertices))}
    # ★[T708 ③] 갖옷 자리 = 따로 지은 겉옷을 MPFB 가 입힌 자리 — 본 옷 점과 차례가 같다 ⇒ 점마다 "갖옷 자리 − 본 옷 자리"(MPFB 축 · 등배 앞)
    OFF = [(vf.co - vb.co).copy() for vf, vb in zip(fur.data.vertices, parts["cloth"].data.vertices)]
    bpy.data.objects.remove(fur, do_unlink=True)       # 갖옷 묶기는 자리·무게만 남기고 버린다(사본 0)
    # 삼각형 예산: 살·눈·눈썹은 그대로 · 옷은 지은 그대로(링 표가 정한다 — 줄이지 않는다) · 남는 몫을 머리에
    fixed = tris(parts["skin"]) + tris(parts["eyes"]) + tris(parts["brows"])
    left = TRI_BUDGET - fixed
    tri = {k: tris(o) for k, o in parts.items()}
    if tri["cloth"] > left // 2:
        raise SystemExit(f"[char3d] ★{sex} 옷 삼각형이 예산을 넘는다: {tri['cloth']} · 몫 {left // 2}")
    tri["hair"] = decimate(parts["hair"], max(1, left - tri["cloth"]))
    # 축·키: MPFB(−y 앞 · +x 왼쪽) → 엔진 규약(+x 앞 · +y 왼쪽 · T522 "방향 0 = +x") · 정수리 = 1.60m
    top = max(v.co.z for v in parts["skin"].data.vertices)
    # ★[T708 ①] 키 = **선 자세** 정수리 1.60m(셀 규약 — 하네스 ⓑ "쉼 자세 정수리 × 32 = 51.2px") — 옛 A 자 쉼은 무릎이 6° 굽어 같은 몸이 0.3 % 낮았다
    #   (등배 0.98267 → 0.97947 · 클립의 뼈 월드 회전은 그대로 · 자리는 등배만큼)
    s = H_PERSON / top
    M = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Scale(s, 4)
    rig.data.transform(M)
    for o in parts.values():
        o.data.transform(M)
    R3m = M.to_3x3().normalized()
    align = {nm: ((R3m @ d).normalized(), (R3m @ B).normalized()) for nm, (d, B) in alignA.items()}   # [T708 ①] 옛 쉼(A 자) 뼈 방향·틀 — 엔진 축
    # ★[T708 ③] 갖옷 자리 = 정점 속성 `_furoffset`(옷 점 = 따로 지은 겉옷 자리 − 본 옷 자리 · 몸과 같이 돌리고 등배 · 살·눈·눈썹·머리 = 0) — 엔진이 갖옷 재질에서만 더한다
    #   (T654~T685 의 `_inflate` 털 두께 방향 × 두께 = 몸 부풀림을 걷었다). 내보내기는 사용자 속성을 축 바꿈 없이 낸다 — glTF 축(y 위: (x, z, −y))으로 미리 돌린다.
    R3 = M.to_3x3().normalized()
    OFFm = [(R3 @ d) * s for d in OFF]
    for k, o in parts.items():
        a = o.data.attributes.new("_furoffset", "FLOAT_VECTOR", "POINT")
        if k == "cloth":
            for i, e in enumerate(OFFm):
                a.data[i].vector = (e.x, e.z, -e.y)
    # ★[T664 → T708] 갖옷 면 법선 = 겉옷 자리(본 옷 + `_furoffset`)의 블렌더 면 법선(면마다 하나 — 본 옷과 같은 평평 음영) → 면 속성 `_furnormal`
    #   (살·눈·눈썹·머리 = 0 · 엔진은 갖옷 재질에서만 0 아닌 법선으로 바꾼다 · glTF 축으로 미리 돌린다) — 옮긴 자리는 재고 바로 되돌린다(점 바이트 그대로).
    pad = round(s * cl["pad"], 6)
    me = parts["cloth"].data
    rest = [v.co.copy() for v in me.vertices]
    for v, e in zip(me.vertices, OFFm):
        v.co = v.co + e
    me.update()
    fn = [p.normal.copy() for p in me.polygons]
    for v, c in zip(me.vertices, rest):
        v.co = c
    me.update()
    for k, o in parts.items():
        a = o.data.attributes.new("_furnormal", "FLOAT_VECTOR", "FACE")
        if k == "cloth":
            for i, n in enumerate(fn):
                a.data[i].vector = (n.x, n.z, -n.y)
    # ★[T685] 갖옷 몫 뼈 넷 · 무게 넷 = 점 속성(넷씩 — 색 칸 꼴로 싣는다 · 살·눈·눈썹·머리 0) — 엔진은 갖옷 재질에서만 갈아 끼운다
    for k, o in parts.items():
        aj = o.data.attributes.new("_furjoints", "FLOAT_COLOR", "POINT")
        aw = o.data.attributes.new("_furweights", "FLOAT_COLOR", "POINT")
        if k == "cloth":
            if len(o.data.vertices) != nf:
                raise SystemExit(f"[char3d] ★{sex} 갖옷 묶기 점 {nf} ≠ 옷 점 {len(o.data.vertices)}")
            aj.data.foreach_set("color", FJ.ravel())
            aw.data.foreach_set("color", FW.ravel())
        else:                                          # ★색 칸 새 속성의 바탕은 흰색(1,1,1,1)이다(실측) — 0 으로 채운다(살·머리는 갖옷 무게 0)
            z = np.zeros(4 * len(o.data.vertices), dtype=np.float32)
            aj.data.foreach_set("color", z)
            aw.data.foreach_set("color", z)
    bpy.context.view_layer.update()
    offn = [e.length for e in OFFm]
    coat = dict(cl["info"]["coat"], pad=pad, offsetMaxM=round(max(offn), 5), offsetZero=int(sum(1 for x in offn if x == 0.0)))
    return rig, parts, cl, {"scale": round(s, 6), "topM": round(top, 6), "tris": tri, "coat": coat, "furWeights": fur_n, "stand": stand, "align": align}


# ── ③ 아틀라스 — 칸마다 원본 무늬를 붙이고 UV 를 그 칸으로 옮긴다 ─────────────────────────────────
def remap_uv(o, cell):
    x0, y0, w, h = cell
    ix0, iy0, iw, ih = x0 + PAD, y0 + PAD, w - 2 * PAD, h - 2 * PAD
    uv = o.data.uv_layers.active.data
    us = [d.uv[0] for d in uv]; vs = [d.uv[1] for d in uv]
    if min(us) < -1e-3 or max(us) > 1 + 1e-3 or min(vs) < -1e-3 or max(vs) > 1 + 1e-3:
        raise SystemExit(f"[char3d] ★{o.name} UV 가 [0,1] 밖이다({min(us):.3f}~{max(us):.3f}, {min(vs):.3f}~{max(vs):.3f}) — 칸 옮기기가 안 선다")
    for d in uv:
        u, v = min(1.0, max(0.0, d.uv[0])), min(1.0, max(0.0, d.uv[1]))
        d.uv = ((ix0 + u * iw) / ATLAS, 1.0 - (iy0 + (1.0 - v) * ih) / ATLAS)


def _lin2srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _fit(img, cell):
    """그림을 칸 안쪽(PAD 뺀)에 맞춰 넣고 가장자리 화소를 PAD 만큼 바깥으로 늘린다."""
    x0, y0, w, h = cell
    a = np.asarray(img.resize((w - 2 * PAD, h - 2 * PAD), Image.LANCZOS))
    pad = ((PAD, PAD), (PAD, PAD)) + (((0, 0),) if a.ndim == 3 else ())
    return Image.fromarray(np.pad(a, pad, mode="edge"))


def _hue(img_rgb, rgb_lin):
    """밝기는 원판 그대로 · 빛깔(색상·채도)만 정본으로 — 화소 밝기 L × (정본 색 ÷ 정본 색의 밝기)(sRGB · Rec.709 무게).
    ★평균으로 나눠 맞추면(옷 결처럼) 머리털의 반짝 줄이 평균의 몇 배라 하얗게 날아갔다(T545 첫 굽기 실측 — 땋은 머리 평균 24 · 반짝 200)."""
    w = np.array([0.2126, 0.7152, 0.0722])
    a = np.asarray(img_rgb.convert("RGB"), dtype=np.float64)
    L = a @ w
    col = np.array([_lin2srgb(c) for c in rgb_lin]) * 255.0
    out = np.clip(L[..., None] * (col / max(1e-6, col @ w))[None, None, :], 0, 255)
    return Image.fromarray(np.round(out).astype(np.uint8), "RGB")


def _fill_clear(img_rgba):
    """알파가 빈 화소의 빛깔 = 찬 화소의 평균 — 밉맵이 줄일 때 빈 자리의 빛깔(하양·검정)이 털 가장자리로 번지지 않게."""
    a = np.asarray(img_rgba.convert("RGBA"), dtype=np.float64)
    op = a[..., 3] > 127
    if op.any() and (~op).any():
        a[~op, :3] = a[op, :3].mean(0)
    return Image.fromarray(np.round(a).astype(np.uint8), "RGBA")


def hair_rgb_lin():
    """머리빛 = 시트 정본(`char_render.py` M['hair']) — 원문을 읽는다(사본 0)."""
    p = os.path.join(HERE, "char_render.py")
    m = re.search(r"'hair':\s*mat\(\"hair\",\s*\(([\d.]+),\s*([\d.]+),\s*([\d.]+)\)", open(p, encoding="utf-8").read())
    if not m:
        raise SystemExit("[char3d] ★char_render.py 에서 머리빛('hair')을 못 읽었다")
    INPUTS["scripts/char_render.py"] = sha16(p)
    return tuple(float(x) for x in m.groups())


def fabric_detail(kind, size):
    fid = FABRIC[kind]
    p = os.path.join(ACG, fid, f"{fid}_1K-JPG_Color.jpg")
    if not os.path.exists(p):
        raise SystemExit(f"[char3d] ★ambientCG 결이 없다: {p}")
    INPUTS[f"ambientcg/{fid}/{fid}_1K-JPG_Color.jpg"] = sha16(p)
    tile = Image.open(p).convert("L")
    t = tile.resize((max(1, size[0] // FABRIC_REPEAT), max(1, size[1] // FABRIC_REPEAT)), Image.LANCZOS)
    full = Image.new("L", (t.width * FABRIC_REPEAT, t.height * FABRIC_REPEAT))
    for i in range(FABRIC_REPEAT):
        for j in range(FABRIC_REPEAT):
            full.paste(t, (i * t.width, j * t.height))
    return full.resize(size, Image.LANCZOS)


def build_atlases(sex, trim_v):
    spec = BODIES[sex]
    rgb = Image.new("RGB", (ATLAS, ATLAS), (0, 0, 0))
    alpha = Image.new("L", (ATLAS, ATLAS), 255)

    def put(kind, img_rgba):
        c = CELLS[kind]
        im = _fill_clear(img_rgba)
        rgb.paste(_fit(im.convert("RGB"), c), (c[0], c[1]))
        alpha.paste(_fit(im.getchannel("A"), c), (c[0], c[1]))
    put("skin", Image.open(src(spec["skin"])))
    put("eyes", Image.open(src(COMMON["eyetex"])))
    brows = Image.open(src(os.path.join(os.path.dirname(COMMON["brows"]), "eyebrow001.png"))).convert("RGBA")
    put("brows", brows)
    hair = Image.open(src(os.path.join(os.path.dirname(spec["hair"]), os.path.basename(spec["hair"]).replace(".mhclo", "_diffuse.png")))).convert("RGBA")
    hairc = _hue(_fill_clear(hair).convert("RGB"), hair_rgb_lin())
    hairc.putalpha(hair.getchannel("A"))
    put("hair", hairc)
    # 옷 — 칸은 옷마다 다른 그림(4장) · 알파는 한 장(옷은 불투명)
    #   ★옷의 AO 그림은 안 쓴다: 안감·허리띠 안쪽이 검게 구워져 있어(가려진 면) 자세를 잡거나 축약하면 검은 조각으로 드러났다(T545 첫 굽기 실측).
    #     그늘은 엔진의 빛이 준다 — 옷 칸 = ambientCG 결(평균 1) × 본천 색(`CLOTH_MATS`) 뿐.
    #   ★[T604] 허리띠 섬(옷 칸 안 가로 띠 · `char_clothes_mhclo` 가 준 v 범위)만 본천 × `CLOTH_TRIM_K`(시트 허리끈 `hemp2` 의 비) — 한 PAD 넓혀 칠한다
    c = CELLS["cloth"]
    ih = c[3] - 2 * PAD
    y0 = c[1] + PAD + max(0, int(math.floor((1.0 - trim_v[1]) * ih)) - PAD)
    y1 = c[1] + PAD + min(ih, int(math.ceil((1.0 - trim_v[0]) * ih)) + PAD)
    out = {}
    for kind in CLOTH_KINDS:
        col, _rough, _spec = rc.CLOTH_MATS[kind]
        det = np.asarray(fabric_detail(kind, (1024, 1024)), dtype=np.float64) / 255.0
        det = det / max(1e-6, det.mean())
        a = rgb.copy()
        for cc, rows in ((col, None), (tuple(x * rc.CLOTH_TRIM_K for x in col), (y0, y1))):
            srgb = np.array([_lin2srgb(x) for x in cc]) * 255.0
            im = _fit(Image.fromarray(np.clip(det[..., None] * srgb[None, None, :], 0, 255).astype(np.uint8), "RGB"), c)
            if rows is None:
                a.paste(im, (c[0], c[1]))
            else:
                a.paste(im.crop((0, rows[0] - c[1], c[2], rows[1] - c[1])), (c[0], rows[0]))
        out[kind] = a
    return out, alpha


# ── ② 리타깃 — CMU BVH → cmu_mb 리그(관절 월드 회전 + 쉼 자세 보정 · 제자리 · 접지) ─────────────────
C_B2O = Matrix(((0, 0, 1), (1, 0, 0), (0, 1, 0)))     # BVH(+x 왼 · +y 위 · +z 앞) → 우리(+x 앞 · +y 왼 · +z 위) — mocap_retarget 머리 주석의 실측 축
RENAME_BVH = {"LeftHandFinger1": "LeftHandIndex1", "RightHandFinger1": "RightHandIndex1"}   # cmu_mb ↔ cgspeed 이름 둘만 다르다
FEET = ("LeftFoot", "LeftToeBase", "RightFoot", "RightToeBase")
LIMB = re.compile(r"(UpLeg|Leg|Foot|ToeBase|Arm|Hand|FingerBase|Finger1|Thumb)$")   # 팔다리 사슬(쉼 보정을 거는 뼈) — 이음·축 뼈는 밖


def _rotm(axis, deg):
    return Matrix(MR._rot(axis, deg))


def bvh_world_rots(nodes, order, frame):
    vals = {}
    for (ni, ch), v in zip(order, frame):
        vals.setdefault(ni, {})[ch] = v
    rot = {}
    for ni, nd in enumerate(nodes):
        d = vals.get(ni, {})
        R = Matrix.Identity(3)
        for ch in nd["chans"]:
            if ch.endswith("rotation"):
                R = R @ _rotm(ch[0], d.get(ch, 0.0))
        rot[ni] = R if nd["parent"] is None else rot[nd["parent"]] @ R
    return rot


def bvh_end_sites(path):
    """`End Site` 오프셋(관절 이름 → 오프셋) — `mocap_retarget.parse_bvh` 는 끝점을 버린다(시트 12뼈엔 안 쓴다). 끝 뼈(머리·발가락·손가락)의 방향 재료."""
    ends, stack, pend = {}, [], None
    for line in open(path, encoding="utf-8", errors="replace"):
        t = line.split()
        if not t:
            continue
        if t[0] == "MOTION":
            break
        if t[0] in ("ROOT", "JOINT"):
            stack.append(t[1])
        elif t[0] == "End":
            pend = stack[-1]
            stack.append(None)
        elif t[0] == "OFFSET" and pend is not None and stack and stack[-1] is None:
            ends[pend] = tuple(float(x) for x in t[1:4])
            pend = None
        elif t[0] == "}":
            stack.pop()
    return ends


def retarget_clip(rig, prefix, clip_name, spec, sheet, align, gait=None, body=None):
    """한 클립을 액션 하나로. 열쇠 k 의 시각 = k(판 단위 · 장면 fps 1 — 내보내기가 열쇠 사이를 다시 뜨지 않게).
    ★[T708 ①] `align` = 옛 쉼(MPFB A 자)의 뼈 방향·틀(엔진 축) — 쉼 보정 Q 와 월드 회전은 이것으로 짓는다(클립의 뼈 월드 회전 = 이 판 앞과 같다) ·
      관절 자리·지역 회전(L)은 새 쉼(선 자세)으로 — 묶기 자세가 바뀌어도 움직임은 그대로다.
    ★[T708 ②] `gait` = 열린 보행 자료의 다리 마디 땅 기준 시상각(`assets-src/gait/gait_norms.json` — 넓적다리 · 정강이 · 발) — 걷기·달리기의
      다리(넓적다리 · 정강이 · 발 · 발끝)를 그 각으로 세운다(윗몸은 모캡 그대로) · 위상 = 모캡 왼 넓적다리 각과 자료 넓적다리 각의 상관이 가장 큰 자리 ·
      오른 다리 = 반 주기 뒤 · 접지 = 그 열쇠의 살 가장 낮은 점(`body` 평가)을 쉼의 발바닥(0)에."""
    name, fn, label, nf, fps, loop, rule, bone = spec
    path = os.path.join(MOCAP, fn)
    INPUTS["assets-src/mocap/" + fn] = sha16(path)
    nodes, order, frames, dt = MR.parse_bvh(path)
    J = {nd["name"]: i for i, nd in enumerate(nodes)}
    start, period = MR.window_of(nodes, order, frames, rule, bone, int(round(nf / fps / dt)), loop)
    K = KEYS_PER_FRAME * nf if loop else KEYS_PER_FRAME * (nf - 1) + 1
    bones = rig.data.bones
    order_b = [b for b in bones if b.parent is None]
    i = 0
    while i < len(order_b):
        order_b.extend(order_b[i].children)
        i += 1
    rest = {b.name: b.matrix_local.copy() for b in bones}
    # ★기준 자세 = BVH 0번 판(cgspeed 변환이 모든 파일 맨 앞에 넣은 **T자 보정 판** — 세 파일 값이 같다 · 실측).
    #   BVH 의 "회전 0" 자세는 사람 자세가 아니다(다리 20° 벌어짐 · 목 앞 11°·머리 뒤 15° 꺾임 — 오프셋이 그렇게 생겼다).
    #   0번 판에서 다리는 곧고 팔은 수평이고 머리는 선다 ⇒ **0번 판 ↔ 리그 쉼 자세**로 맞춘다:
    #   T_b(t) = H · W'_j(t) · W'_j(0)ᵀ · Q_b · B_b   (W' = 우리 축의 BVH 월드 회전 · B = 리그 쉼 · H = 방위)
    #   Q_b = 리그 뼈 방향 → 0번 판의 같은 뼈 방향(관절 → 다음 관절 · 끝 뼈는 BVH `End Site`) 최소 회전 · 길이 0 이면 부모의 Q.
    #   ★Q 는 **팔다리 사슬에만** 건다(`LIMB` — 넓적다리 아래 · 위팔 아래): 0번 판(T자)과 리그 쉼(A자)이 갈리는 것은 팔다리뿐이다.
    #     축 뼈(엉덩이·허리·척추·목·머리)와 이음 뼈(엉덩관절·빗장)는 두 뼈대 모두 **서 있는 제 자세**라 보정 0 —
    #     걸면 MPFB 의 자연 굽이(척추 S자 · 빗장 각)가 BVH 막대 뼈대 꼴로 펴진다(실측: 엉덩관절을 BVH 방향으로 꺾자
    #     고관절 자리가 골반 안에서 6cm 내려앉고 접지가 몸을 4.6cm 들어 올렸다 · 키 1.69m).
    W0 = bvh_world_rots(nodes, order, frames[0])
    kids = {i: [] for i in range(len(nodes))}
    for ni, nd in enumerate(nodes):
        if nd["parent"] is not None:
            kids[nd["parent"]].append(ni)
    P0 = {}
    for ni, nd in enumerate(nodes):
        o = Vector(nd["offset"])
        P0[ni] = o if nd["parent"] is None else P0[nd["parent"]] + W0[nd["parent"]] @ o
    ends = bvh_end_sites(path)

    def target(jn, cj):
        a = P0[jn]
        k = cj
        while k is not None and (P0[k] - a).length < 1e-6:          # 길이 0 관절(LowerBack·Neck·LeftFingerBase …)은 건너 그 아래로
            k = kids[k][0] if kids[k] else None
        if k is not None:
            return P0[k] - a
        e = ends.get(nodes[jn]["name"])
        return (W0[jn] @ Vector(e)) if e and Vector(e).length > 1e-6 else None
    Q = {}
    for b in order_b:
        nm = b.name[len(prefix):]
        j = J[RENAME_BVH.get(nm, nm)]
        v = None
        if not LIMB.search(nm):                                  # 축 뼈·이음 뼈 — 두 뼈대 다 0번 판 = 서 있는 제 자세(보정 0)
            Q[b.name] = Matrix.Identity(3)
            continue
        if b.children:
            ch = min(b.children, key=lambda c: (c.head_local - b.tail_local).length)
            cn = ch.name[len(prefix):]
            cj = J.get(RENAME_BVH.get(cn, cn))
            if cj is not None:
                v = target(j, cj)
        else:
            v = target(j, None)
        if v is not None and v.length > 1e-6:
            Q[b.name] = align[nm][0].rotation_difference((C_B2O @ v).normalized()).to_matrix()
        else:
            Q[b.name] = Q[b.parent.name].copy() if b.parent else Matrix.Identity(3)
    W0o = {ni: C_B2O @ W0[ni] @ C_B2O.transposed() for ni in W0}
    corr = {b.name: W0o[J[RENAME_BVH.get(b.name[len(prefix):], b.name[len(prefix):])]].transposed() @ Q[b.name] for b in bones}
    feet_rest = min(min((rest[prefix + f].translation.z), (rest[prefix + f] @ Vector((0, bones[prefix + f].length, 0, 1))).z)
                    for f in FEET)

    def pose_at(fi):
        W = bvh_world_rots(nodes, order, frames[fi])
        return {ni: C_B2O @ W[ni] @ C_B2O.transposed() for ni in W}

    # 방향: 창 안의 엉덩이 앞(+z_b)의 평균 방위를 +x 로
    sx = sy = 0.0
    for k in range(K):
        t = start + period * k / float(K if loop else max(1, K - 1))
        Wh = pose_at(min(len(frames) - 1, int(round(t))))[J["Hips"]]
        f = Wh @ Vector((1, 0, 0))
        sx += f.x; sy += f.y
    H = Matrix.Rotation(-math.atan2(sy, sx), 3, "Z")
    gi = None
    if gait:
        # ★[T708 ②] 위상 맞추기 — 모캡 왼 넓적다리의 땅 기준 시상각(열쇠마다) ↔ 자료 넓적다리 각(φ0 + k/K) — 상관이 가장 큰 φ0(1/1000 격자 · 결정적)
        #   ★[T723] 정본은 `mocap_retarget.gait_phase` 하나 — 시트(2D) 다리도 같은 함수 · 같은 표본(K = 판 × 4)으로 맞춘다(사본 0)
        ph0, r_ph, th_m = MR.gait_phase(nodes, order, frames, start, period, K, gait["thigh"])   # ⚠`corr` 는 위의 쉼 보정 표 — 이름을 겹치지 않는다
        best = (ph0, r_ph)
        Ry = lambda deg: Matrix.Rotation(-math.radians(deg), 3, "Y")      # 앞으로 + (아래 → 앞 · 엔진 +y = 왼쪽 축)
        vert = {}
        for side in ("Left", "Right"):
            for part in ("UpLeg", "Leg"):
                vert[side + part] = Q[prefix + side + part] @ align[side + part][1]      # 0번 판 = 곧게 선 다리(수직)
        gi = {"phase0": ph0, "corr": round(best[1], 4), "thighMocap": [round(min(th_m), 2), round(max(th_m), 2)]}
        # 접지 재료 — 정강이·발·발끝에 무게가 있는 살 점(쉼 자리 · 뼈 무게 합 1 로)
        legb = {prefix + sd + pt for sd in ("Left", "Right") for pt in ("Leg", "Foot", "ToeBase")}
        gname = {g.index: g.name for g in body.vertex_groups}
        feet_skin = []
        for v in body.data.vertices:
            ws = [(gname[g.group], g.weight) for g in v.groups if gname[g.group] in rest and g.weight > 0]
            if any(n in legb for n, _w in ws):
                tot = sum(w for _n, w in ws)
                feet_skin.append((Vector((v.co.x, v.co.y, v.co.z, 1.0)), [(n, w / tot) for n, w in ws]))
        if not feet_skin:
            raise SystemExit(f"[char3d] ★{prefix} 정강이·발 살 점이 없다 — 접지를 못 잰다")

        def legs_at(kk):
            out = {}
            for side, off in (("Left", 0.0), ("Right", 0.5)):
                ph = ph0 + kk / float(K) + off
                a_t, a_s, a_f = (MR.gait_cyc(gait[c], ph) for c in ("thigh", "shank", "foot"))
                out[prefix + side + "UpLeg"] = Ry(a_t) @ vert[side + "UpLeg"]
                out[prefix + side + "Leg"] = Ry(a_s) @ vert[side + "Leg"]
                out[prefix + side + "Foot"] = Ry(a_f) @ align[side + "Foot"][1]          # 발 0 = 쉼의 평평한 발바닥(MPFB 선 발 · 선 자세에서도 그대로)
                out[prefix + side + "ToeBase"] = Ry(a_f) @ align[side + "ToeBase"][1]
            return out

    def locals_at(fi, ctr=(0.0, 0.0), legs=None):
        W = pose_at(fi)
        Mp = {}
        for b in order_b:
            nm = b.name[len(prefix):]
            T = legs[b.name] if (legs and b.name in legs) else H @ W[J[RENAME_BVH.get(nm, nm)]] @ corr[b.name] @ align[nm][1]
            if b.parent is None:
                head = rest[b.name].translation.copy()
            else:
                head = (Mp[b.parent.name] @ rest[b.parent.name].inverted() @ rest[b.name]).translation
            Mp[b.name] = Matrix.Translation(head) @ T.to_4x4()
        low = min(min(Mp[prefix + f].translation.z, (Mp[prefix + f] @ Vector((0, bones[prefix + f].length, 0, 1))).z) for f in FEET)
        dz = feet_rest - low
        mid = (Mp[prefix + "LeftFoot"].translation + Mp[prefix + "RightFoot"].translation) / 2   # 두 발목 가운데(옮기기 전)
        for k in Mp:
            Mp[k] = Matrix.Translation((-ctr[0], -ctr[1], dz)) @ Mp[k]
        L = {}
        for b in order_b:
            if b.parent is None:
                L[b.name] = rest[b.name].inverted() @ Mp[b.name]
            else:
                rel = rest[b.parent.name].inverted() @ rest[b.name]
                L[b.name] = rel.inverted() @ Mp[b.parent.name].inverted() @ Mp[b.name]
        return L, (mid.x, mid.y)

    # ★제자리 — 걷기·달리기(창 규칙 `cycle`)는 엉덩이가 원점(시트와 같은 앵커 규약 · 발이 번갈아 나간다 · 나아감은 뺀다) ·
    #   서서 하는 클립(`still`·`reach`·`beat` — 서기·조준·휘두르기)은 **열쇠마다 두 발목 가운데가 원점**(앵커 = 발밑 · 발이 땅에 박힌다) —
    #   엉덩이를 원점에 박으면 피험자가 몸무게를 옮길 때 엉덩이 대신 **발이 미끄러졌다**(실측: 서기 창에서 발목 가운데가 옆으로 18cm 오갔다).
    feet_ctr = rule != "cycle"
    act = bpy.data.actions.new(f"{prefix[:-1]}.{clip_name}")
    act.use_fake_user = True
    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = act
    prev = {}
    nkeys = K + 1 if loop else K                     # 루프는 끝에 0번 열쇠를 한 번 더(되감기 보간이 안 끊기게)
    for k in range(nkeys):
        kk = k % K if loop else k
        t = start + period * kk / float(K if loop else max(1, K - 1))
        i0 = min(len(frames) - 1, int(math.floor(t))); i1 = min(len(frames) - 1, i0 + 1); w = t - math.floor(t)
        ctr = (0.0, 0.0)
        if feet_ctr:
            m0, m1 = locals_at(i0)[1], locals_at(i1)[1]
            ctr = (m0[0] * (1 - w) + m1[0] * w, m0[1] * (1 - w) + m1[1] * w)
        legs = legs_at(kk) if gait else None
        L0, L1 = locals_at(i0, ctr, legs)[0], locals_at(i1, ctr, legs)[0]
        for b in order_b:
            pb = rig.pose.bones[b.name]
            pb.rotation_mode = "QUATERNION"
            q = L0[b.name].to_quaternion().slerp(L1[b.name].to_quaternion(), w)
            p = prev.get(b.name)
            if p is not None and p.dot(q) < 0:
                q.negate()
            prev[b.name] = q.copy()
            pb.rotation_quaternion = q
            if b.parent is None:
                pb.location = L0[b.name].translation.lerp(L1[b.name].translation, w)
        if gait:                                       # ★[T708 ②] 접지 = 이 열쇠 살 가장 낮은 점 → 0(쉼 발바닥) — 발뒤꿈치로 닿는 열쇠(관절은 발 속)도 땅 위
            #   살 자리는 직접 스키닝해 잰다(뼈대 변형 = 열쇠의 뼈 행렬 · 쉼 역행렬 · 무게 — 블렌더 뼈대 모디파이어와 같은 식) — 장면 평가(depsgraph)는
            #   이미 실린 NLA 트랙(앞 클립)을 같이 돌려 이 열쇠의 자세를 덮었다(실측: 달리기 0번 열쇠 = 걷기 자세) ⇒ 쓰지 않는다
            Mw = {}
            for b in order_b:
                pb = rig.pose.bones[b.name]
                Lb = Matrix.Translation(pb.location) @ pb.rotation_quaternion.to_matrix().to_4x4()
                Mw[b.name] = (rest[b.name] @ Lb) if b.parent is None else (Mw[b.parent.name] @ rest[b.parent.name].inverted() @ rest[b.name] @ Lb)
            D = {n: Mw[n] @ rest[n].inverted() for n in Mw}
            lowz = min(sum(wt * (D[bn] @ co).z for bn, wt in ws) for co, ws in feet_skin)
            rb = order_b[0]
            rig.pose.bones[rb.name].location = rig.pose.bones[rb.name].location + rest[rb.name].to_3x3().transposed() @ Vector((0.0, 0.0, -lowz))
            gi.setdefault("lowSkinBefore", []).append(round(lowz, 5))
        for b in order_b:
            pb = rig.pose.bones[b.name]
            pb.keyframe_insert("rotation_quaternion", frame=k)
            if b.parent is None:
                pb.keyframe_insert("location", frame=k)
    for fc in getattr(act, "fcurves", []):
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
    track = rig.animation_data.nla_tracks.new()
    track.name = act.name
    track.strips.new(act.name, 0, act)
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    return {"frames": nf, "fps": fps, "loop": bool(loop), "keys": K, "span": K if loop else K - 1,
            "duration": round((nf if loop else max(1, nf - 1)) / fps, 6), "src": fn, "label": label,
            "window": [int(start), int(period)], "rule": rule, "sheet": sheet, "center": "feet" if feet_ctr else "hips",
            **({"gait": {"legs": gait["src"], "phase0": gi["phase0"], "corr": gi["corr"], "thighMocapDeg": gi["thighMocap"],
                         "groundShiftMm": [round(-1000 * max(gi["lowSkinBefore"]), 2), round(-1000 * min(gi["lowSkinBefore"]), 2)]}} if gait else {})}


# ── 판 ─────────────────────────────────────────────────────────────────────────────────────
def sheet_clips():
    """시트 클립 표(`char_render.py` CLIPS) — 이름·판·루프·fps. 3D 클립의 시각은 이 표를 따른다(시트 상태기계가 돌린다)."""
    p = os.path.join(HERE, "char_render.py")
    s = open(p, encoding="utf-8").read()
    blk = s[s.index("\nCLIPS = ["):s.index("\n]", s.index("\nCLIPS = ["))]
    out = {}
    for m in re.finditer(r'\("(\w+)",\s*(\d+),\s*(True|False),\s*([\d.]+)\)', blk):
        out[m.group(1)] = (int(m.group(2)), m.group(3) == "True", float(m.group(4)))
    return out


SHEET = sheet_clips()
MOCAP_CLIPS = [c for c in MR.CLIPS]                    # walk · run · swing2 · aim2 · idle2 (T96 · T155)
for c in MOCAP_CLIPS:                                  # ★시트 표와 판·루프·fps 가 같아야 한다(같은 원본 · 같은 시계)
    sh = SHEET.get(c[0])
    if not sh or sh[0] != c[3] or sh[1] != c[5] or abs(sh[2] - c[4]) > 1e-9:
        raise SystemExit(f"[char3d] ★모캡 표와 시트 표가 갈렸다: {c[0]} {c[3:6]} vs {sh}")
CLIP_ALIAS = {"idle": "idle2", "aim": "aim2", "swing": "swing2"}   # 3D 는 모캡판 하나 — 손 포즈판 셋은 같은 뜻의 모캡판으로 선다
# ★[T708 ②] 걷기·달리기 다리 = 열린 보행 자료의 평균 주기(`scripts/gait_norms.py` 산물 · 커밋 표 — 읽기만) · 그 밖 클립은 모캡 그대로
INPUTS["assets-src/gait/gait_norms.json"] = sha16(MR.GAIT_PATH)
GAIT = MR.gait_tables()                                # ★[T723] 표 읽기·출처 한 줄도 정본 한 자리(시트 포즈표와 같은 줄)
scene = bpy.context.scene
scene.render.fps = 1                                   # ★열쇠 시각 = 판 번호(T539 클립 파일과 같은 문법 — 내보내기가 장면 fps 로 다시 뜬다)
scene.render.fps_base = 1.0
os.makedirs(TEXD, exist_ok=True)
built = {}
BONES_OF = {}                                          # [T685] 메시 이름 → 뼈 이름(블렌더 차례 · 몸 머리 붙인 뒤)


def _join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    b = objs[0]
    b.name = b.data.name = name
    b.data.materials.clear()                           # 재질은 엔진이 건다(아틀라스 넷 · 알파 하나) — 프리미티브 하나
    return b


for sex in ("M", "F"):
    rig, parts, cl, info = build(sex)
    atl, alpha = build_atlases(sex, cl["info"]["trimV"])
    for kind, o in parts.items():
        remap_uv(o, CELLS[kind])
    # ★[T654] 몸 하나 = 살·눈·눈썹·머리·옷(옷 넷이 같이 — [T708] 갖옷 겉옷 자리는 정점 속성 `_furoffset` · 셰이더) — 사본 0
    body = _join([parts["skin"], parts["eyes"], parts["brows"], parts["hair"], parts["cloth"]], f"{sex}_body")
    for b in rig.data.bones:                           # 뼈 이름에 몸 머리(두 몸이 한 파일 · 이름이 겹치지 않게) — 무게 묶음도 따라 바뀐다
        b.name = f"{sex}_{b.name}"
    rig.name = rig.data.name = sex
    BONES_OF[f"{sex}_body"] = [b.name for b in rig.data.bones]   # [T685] 갖옷 몫 뼈 번호(블렌더 차례) → 이름 → glTF 뼈 번호(glb 뒷손질)
    missing = [g.name for g in body.vertex_groups if g.name not in rig.data.bones]
    if missing:
        raise SystemExit(f"[char3d] ★뼈 이름을 바꾼 뒤 무게 묶음이 안 따라왔다: {missing[:5]}")
    clips = {}
    for spec in MOCAP_CLIPS:
        clips[spec[0]] = retarget_clip(rig, sex + "_", spec[0], spec, SHEET[spec[0]], info["align"], gait=GAIT.get(spec[0]), body=body)
    for kind, im in atl.items():
        im.save(os.path.join(TEXD, f"{sex.lower()}_{kind}.jpg"), quality=88, optimize=False, progressive=False, subsampling=0)
    alpha.save(os.path.join(TEXD, f"{sex.lower()}_alpha.png"), optimize=False, compress_level=9)
    info["trisTotal"] = tris(body)
    info["bones"] = len(rig.data.bones)
    built[sex] = {"rig": rig, "body": body, "info": info, "clips": clips, "cl": cl}
    print(f"[char3d] {sex}: 삼각형 {info['trisTotal']}({info['tris']}) · 뼈 {info['bones']} · 등배 {info['scale']} · 갖옷(겉옷) {json.dumps(info['coat'], ensure_ascii=False)} · 클립 {list(clips)}")

# ── ④ 내보내기 — GLB 하나(두 몸 · 몸마다 메시 하나) ───────────────────────────────────────────
bpy.ops.object.select_all(action="DESELECT")
for v in built.values():
    v["rig"].select_set(True); v["body"].select_set(True)
bpy.context.view_layer.objects.active = built["M"]["rig"]
opts = dict(filepath=GLB, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
            export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=False,
            export_skins=True, export_def_bones=False, export_leaf_bone=False, export_reset_pose_bones=True,
            export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,   # NLA 는 늘 표본을 뜬다 — 값이 안 변하는 채널은 열쇠 둘로(★False 면 쉼과 다른 상수 회전(엉덩관절·어깨·손가락)까지 버린다 · 실측)
            export_anim_slide_to_zero=False, export_frame_step=1,
            export_materials="NONE", export_normals=True, export_texcoords=True, export_vertex_color="NONE",
            export_attributes=True,                        # ★사용자 속성(밑줄 머리) — [T708] `_furoffset`(갖옷 겉옷 자리) · [T664] `_furnormal`(갖옷 면 법선) · [T685] `_furjoints`·`_furweights`(갖옷 몫 뼈·무게) 넷만 있다(ⓐ 하네스가 잰다)
            export_all_influences=False, export_cameras=False, export_lights=False, export_extras=False, export_morph=False)
known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
if "export_attributes" not in known:
    raise SystemExit("[char3d] ★내보내기에 사용자 속성 손잡이(`export_attributes`)가 없다 — 갖옷 겉옷 자리(`_furoffset`)를 못 싣는다")
bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})


# ── ④′ glb 뒷손질 한 단 — [T664] 사용자 속성은 성긴 접근자로 ─────────────────────────────────────
#   내보내기(io_scene_gltf2)는 사용자 속성을 빽빽이만 쓴다 — `_furoffset`·`_furnormal`·… 은 옷 점만 0 이 아니고 살·눈·눈썹·머리 몫이 다 0 이다.
#   glTF 2.0 성긴 접근자(본 = 0 · 0 아닌 줄만 첨자 + 값 · 핵심 규격 — 확장 0)로 고쳐 쓴다. 다른 버퍼 뷰는 바이트 그대로 옮긴다(4바이트 맞춤) · 결정적.
def sparsify_glb(path, keys, conv=None):
    import struct
    b = open(path, "rb").read()
    jl = struct.unpack_from("<I", b, 12)[0]
    J = json.loads(b[20:20 + jl].decode("utf-8"))
    bo = 20 + jl
    BIN = b[bo + 8: bo + 8 + struct.unpack_from("<I", b, bo)[0]]
    NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    tgt = sorted({p["attributes"][k] for m in J["meshes"] for p in m["primitives"] for k in keys if k in p["attributes"]})
    whose = {p["attributes"][k]: (k, mi) for mi, m in enumerate(J["meshes"]) for p in m["primitives"] for k in keys if k in p["attributes"]}
    joints_of = {n["mesh"]: [J["nodes"][j]["name"] for j in J["skins"][n["skin"]]["joints"]] for n in J["nodes"] if "mesh" in n and "skin" in n}
    users = {}
    for i, a in enumerate(J["accessors"]):
        for v in [a.get("bufferView")] + [a["sparse"][q]["bufferView"] for q in ("indices", "values") if "sparse" in a]:
            if v is not None:
                users.setdefault(v, set()).add(i)
    for im in J.get("images", []):
        if "bufferView" in im:
            users.setdefault(im["bufferView"], set()).add(-1)
    drop = {J["accessors"][i]["bufferView"] for i in tgt}
    if not tgt or any(J["accessors"][i]["componentType"] != 5126 for i in tgt) or any(users[v] - set(tgt) for v in drop):
        raise SystemExit(f"[char3d] ★성긴 접근자로 못 고친다 — 속성 {keys} 접근자 {tgt} (float 가 아니거나 버퍼 뷰를 남과 같이 쓴다)")
    views, chunks, remap = [], [], {}

    def put(data, view):
        view["byteOffset"] = sum(len(c) for c in chunks)
        view["byteLength"] = len(data)
        chunks.append(data + b"\0" * ((-len(data)) % 4))
        views.append(view)
        return len(views) - 1
    for vi, v in enumerate(J["bufferViews"]):
        if vi not in drop:
            o = v.get("byteOffset", 0)
            remap[vi] = put(BIN[o:o + v["byteLength"]], {k: x for k, x in v.items() if k not in ("byteOffset", "byteLength")})
    out = {}
    for i in tgt:
        a = J["accessors"][i]
        v, n = J["bufferViews"][a["bufferView"]], NC[a["type"]]
        o, st = v.get("byteOffset", 0) + a.get("byteOffset", 0), v.get("byteStride", 4 * n)
        arr = np.array([np.frombuffer(BIN, dtype="<f4", count=n, offset=o + r * st) for r in range(a["count"])], dtype=np.float32)
        key, mi = whose[i]
        dt, ct = "<f4", 5126
        if conv and key in conv:                                       # [T685] 값 바꿈(갖옷 몫 뼈 번호 → glTF 뼈 번호 · 정수 꼴)
            arr, dt, ct = conv[key](J["meshes"][mi]["name"], arr, joints_of.get(mi))
        nz = np.flatnonzero(np.any(arr != 0, axis=1))
        if not len(nz):
            raise SystemExit(f"[char3d] ★접근자 {i}({a['type']}) 가 전부 0 이다 — 성긴 접근자는 줄이 하나 이상이어야 한다")
        wide = a["count"] > np.iinfo(np.uint16).max                    # 첨자 꼴 = 점 수가 정한다(규격 · 설계 수 아님)
        iv = put(nz.astype("<u4" if wide else "<u2").tobytes(), {"buffer": 0})
        vv = put(arr[nz].astype(dt).tobytes(), {"buffer": 0})
        a["componentType"] = ct
        a.pop("bufferView"); a.pop("byteOffset", None)
        a["sparse"] = {"count": int(len(nz)), "indices": {"bufferView": iv, "componentType": 5125 if wide else 5123}, "values": {"bufferView": vv}}
        out[i] = (a["count"], int(len(nz)))
    for i, a in enumerate(J["accessors"]):
        if i not in tgt and "bufferView" in a:
            a["bufferView"] = remap[a["bufferView"]]
        if i not in tgt and "sparse" in a:
            for q in ("indices", "values"):
                a["sparse"][q]["bufferView"] = remap[a["sparse"][q]["bufferView"]]
    for im in J.get("images", []):
        if "bufferView" in im:
            im["bufferView"] = remap[im["bufferView"]]
    J["bufferViews"] = views
    nb = b"".join(chunks)
    J["buffers"][0]["byteLength"] = len(nb)
    js = json.dumps(J, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    js += b" " * ((-len(js)) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(nb)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(nb), b"BIN\0") + nb)
    return len(b), out


def _furjoints(mesh, arr, joints):
    """[T685] 갖옷 몫 뼈 칸 = 블렌더 뼈 번호 + 1(빈 칸 0) → 그 몸 스킨의 glTF 뼈 번호(이름으로 맞댐 · 빈 칸 0 — 내보내기 `JOINTS_0` 와 같은 꼴) · u8."""
    names = BONES_OF[mesh]
    jix = {n: k for k, n in enumerate(joints or [])}
    if np.any(arr != np.round(arr)) or arr.max() > len(names) or any(n not in jix for n in names):
        raise SystemExit(f"[char3d] ★{mesh} 갖옷 몫 뼈 칸이 뼈 번호가 아니거나 스킨에 없는 뼈가 있다")
    out = np.zeros(arr.shape, dtype=np.float32)
    for (r, c), v in np.ndenumerate(arr):
        if v:
            out[r, c] = jix[names[int(v) - 1]]
    wide = len(joints) > np.iinfo(np.uint8).max + 1
    return out, ("<u2" if wide else "<u1"), (5123 if wide else 5121)


_glb0, _sp = sparsify_glb(GLB, ("_FUROFFSET", "_FURNORMAL", "_FURJOINTS", "_FURWEIGHTS"), conv={"_FURJOINTS": _furjoints})
print(f"[char3d] ★[T664·T685] 성긴 접근자: glb {_glb0}B → {os.path.getsize(GLB)}B · " + " · ".join(f"접근자 {i} {c}점 중 {k}" for i, (c, k) in sorted(_sp.items())))

# ── ⑤ 메타 — 엔진이 읽는 규약(클라는 수를 안 박는다) ──────────────────────────────────────────
import io_scene_gltf2                                  # noqa: E402
sun_dir = Matrix.Rotation(rc.SUN_WORLD[2], 3, "Z") @ Matrix.Rotation(rc.SUN_WORLD[1], 3, "Y") @ Matrix.Rotation(rc.SUN_WORLD[0], 3, "X") @ Vector((0, 0, -1))
for k in ("render_common.py", "mocap_retarget.py", "char_clothes_mhclo.py", "char_render.py"):
    INPUTS["scripts/" + k] = sha16(os.path.join(HERE, k))
INPUTS["add-on-mpfb-v2.0.17.zip"] = _zip_sha
meta = {
    "_": "[T545 · T604 · T654 · T664 · T685 · T708] char_export_gltf.py 산물 — 엔진이 읽는 규약. 클라는 이 수를 하드코딩하지 않는다(갖옷 = `coatKind` 재질이 `furOffsetAttr` 를 더한다).",
    "glb": "char_body.glb",
    "units": "1 = 1m = 1셀(32 게임px)",
    "facing": "방향 0 = 모델 +x(Blender) — 시트 행 0 과 같다 · 방향 d = d×45°(연속 회전은 atan2(fy,fx))",
    "zsq": rc.ZSQ,
    "zsqNote": "엔진이 부모 스케일로 누른다(포즈 뒤 누르기 = char_render.py ZSQ 절과 같은 순서)",
    "flip": "시트는 굽고 나서 좌우를 뒤집는다(_flip_png) — 엔진은 모델 좌표를 게임 좌표 그대로 놓고(거울 = 행렬식 −1) 같은 그림을 얻는다",
    "height": H_PERSON,
    "body": "MPFB " + MPFB_VER + " · MakeHuman 시스템 자산(CC0)",
    "bodies": {sex: {"node": sex, "mesh": f"{sex}_body", "tris": v["info"]["trisTotal"], "trisParts": v["info"]["tris"],
                     "coat": v["info"]["coat"],
                     "furSkin": {"verts": v["info"]["furWeights"]["verts"], "over4": v["info"]["furWeights"]["multi"]},
                     "stand": v["info"]["stand"],
                     "bones": v["info"]["bones"], "scale": v["info"]["scale"],
                     "parts": {"proxy": BODIES[sex]["proxy"], "skin": BODIES[sex]["skin"], "hair": BODIES[sex]["hair"],
                               "eyes": COMMON["eyes"], "brows": COMMON["brows"]},
                     "clothes": dict(v["cl"]["info"], src="scripts/char_clothes_mhclo.py",
                                     mhclo={vr: {"mhclo": sha16(v["cl"][vr]), "obj": sha16(v["cl"][vr][:-6] + ".obj")} for vr in CM.VARIANTS})}
               for sex, v in built.items()},
    "defaultBody": "M",
    "rig": "MPFB cmu_mb(31뼈 · CMU BVH 관절 이름) — 뼈 이름 앞에 몸 머리('M_'·'F_')",
    "clips": built["M"]["clips"],
    "clipAlias": CLIP_ALIAS,
    "timeUnit": "key",
    "timeNote": "액션 시각 = 열쇠 번호(열쇠 k 가 시각 k) · 시트 판 k = 열쇠 keysPerFrame×k · 루프는 끝에 0번 열쇠가 한 번 더",
    "keysPerFrame": KEYS_PER_FRAME,
    "clipNames": "glTF 애니메이션 이름 = '<몸>.<클립>'(M.walk · F.walk …)",
    "atlas": {"size": ATLAS, "cells": CELLS, "pad": PAD},
    "clothKinds": list(CLOTH_KINDS),
    "coatKind": "fur",
    "furOffsetAttr": "_furoffset",
    "furNormalAttr": "_furnormal",
    "furJointsAttr": "_furjoints",
    "furWeightsAttr": "_furweights",
    "coatNote": "[T708 ③] 옷 → 메시는 하나(옷 넷 = 재질) · 갖옷(`coatKind`) = 따로 지은 겉옷(생성기 — 본 옷과 같은 위상 · 단 무릎 · 긴팔 · 가슴 아래로 떨어지는 천 · 털 두께) — "
                 "정점 속성 `_furoffset`(옷 점 = 겉옷 자리 − 본 옷 자리 · m · glTF 축 · 그 밖 0)을 묶기 자세에서 더한 뒤 스키닝(엔진 셰이더 한 줄 — T654~T685 의 몸 부풀림 `_inflate` 를 걷었다) · "
                 "[T664] 갖옷 면 법선 = 면 속성 `_furnormal`(겉옷의 면 법선 · 그 밖 0 — 갖옷 재질만 바꾼다) · "
                 "[T685] 갖옷 몫 뼈 넷·무게 넷 = `_furjoints`(glTF 뼈 번호 u8)·`_furweights`(합 1) — 겉옷 기하를 MPFB 로 따로 묶은 무게(내보내기와 같은 규칙) · "
                 "갖옷 재질만 스키닝 뼈·무게를 갈아 끼운다 · 사용자 속성 넷 다 glTF 성긴 접근자(바탕 0)",
    "textures": {sex: dict({k: f"tex/{sex.lower()}_{k}.jpg" for k in CLOTH_KINDS}, alpha=f"tex/{sex.lower()}_alpha.png") for sex in built},
    "roughness": {k: rc.CLOTH_MATS[k][1] for k in CLOTH_KINDS},
    "alphaTest": 0.5,
    "fabric": {k: FABRIC[k] for k in CLOTH_KINDS},
    "sunDir": [round(c, 6) for c in sun_dir],
    "sunEnergy": rc.SUN_ENERGY,
    "sky": list(rc.WORLD_BG),
    "skyStrength": rc.WORLD_STRENGTH,
    "exporter": "io_scene_gltf2 " + ".".join(str(x) for x in io_scene_gltf2.bl_info.get("version", ())),
    "bpy": bpy.app.version_string,
    "mpfb": MPFB_VER,
}
with open(META, "w", encoding="utf-8") as f:
    json.dump(meta, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
INPUTS["scripts/char_export_gltf.py"] = sha16(os.path.abspath(__file__))
outs = {"char_body.glb": sha16(GLB), "char3d_meta.json": sha16(META)}
for fn in sorted(os.listdir(TEXD)):
    outs["tex/" + fn] = sha16(os.path.join(TEXD, fn))
lock = {
    "_": "[T545 · T604 · T654 · T664 · T685 · T708] char3d 잠금 — 값 = 파일 sha1 앞 16자(바이트가 자산). 입력 지문이 바뀌면 다시 굽는다. 원본은 저장소 밖(`~/Mini/_3d_in/`).",
    "_기계": f"pip bpy {bpy.app.version_string} · {meta['exporter']} · MPFB {MPFB_VER}",
    "_입력": dict(sorted(INPUTS.items())),
    "char3d": outs,
}
with open(LOCK, "w", encoding="utf-8") as f:
    json.dump(lock, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
tot = sum(os.path.getsize(os.path.join(OUT, k)) for k in outs)
print(f"[char3d] {os.path.relpath(GLB, ROOT)} {os.path.getsize(GLB)}B · 무늬 {len(outs) - 2}장 · 합 {tot}B · 잠금 {outs['char_body.glb']}")
