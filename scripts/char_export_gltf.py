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
#      남 = 시트 그대로(옷자락 단 · 반팔 · 허리띠) · 여 = 무릎 단 · 긴팔 · 허리띠) — ★[T654] 옷 기하 하나(옷 넷이 같이 · 갖옷 털 두께는
#      정점 속성 `_inflate` = 털 두께 방향(옷 점만 · 생성기가 둘레에 두께를 더하던 방향) × 메타 `bodies.<몸>.inflate.fur`(m) — 엔진 셰이더 한 줄).
#      T545 의 CC0 현대 옷(`male_casualsuit04`·`female_elegantsuit01`)은 더 안 읽는다.
#      키 = 1.60m(카드 "키 160cm 안팎" · 하네스 "사람 1.6m ↔ px") — 몸 맨 위(정수리)를 1.60m 에 맞추는 등배 한 번.
#      삼각형 = 한 몸 6,000 안(카드 "2~6k") — 살·눈·눈썹은 그대로 · [T604] 옷은 지은 그대로(링 표가 정한 수 · 남는 몫의 반 안이어야 한다) ·
#      나머지를 머리에(넘치면 축약 `Decimate`).
#   ② 리그 = MPFB 기본 리그 `cmu_mb`(31뼈 · 이름이 CMU BVH 관절과 같다) · 모션 = **CMU 모캡 리타깃**(코드 흔들기 0):
#      원본·창 규칙은 시트 굽기와 **같은 것**을 읽는다(`assets-src/mocap/*.bvh` · `mocap_retarget.py` 의 CLIPS·window_of — 사본 0).
#      리타깃 = 관절 월드 회전(BVH **0번 판**(변환기가 넣은 T자 보정 판) 대비) + **쉼 자세 보정**(팔다리만 — BVH 는 T자 · MPFB 는 A자) ·
#      제자리(걷기·달리기 = 엉덩이 원점 · 서서 하는 클립 = 열쇠마다 두 발목 가운데 원점) · 접지(발 관절의 가장 낮은 높이 = 쉼 자세의 그 높이).
#   ③ 무늬 = 아틀라스 한 장(1024² 이하 · 카드) — 몸마다 **그리는 메시 하나 · 재질 하나**(족보 487 "몸마다 메시 하나·재질 아틀라스"):
#      ★[T654] 몸마다 메시 **하나**(T604 판의 갖옷 몸 `<몸>_fur` — 살·눈·눈썹·머리 사본 — 을 걷었다) · 옷 넷 = 재질(아틀라스) · 갖옷 = 셰이더 부풀림.
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
KEYS_PER_FRAME = 4       # 시트 한 판 사이에 열쇠 넷(시트 판 k = 열쇠 4k — 시트 층을 얹는 판이 정확히 열쇠에 선다)
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


# ── ① 소체 — MPFB 로 몸 하나 · 프록시 · 눈 · 눈썹 · 머리 · 옷(기하 둘 — T604 청동기 옷) ──────────────────────
def build(sex):
    spec = BODIES[sex]
    macro = dict(TS.get_default_macro_info_dict())     # ★MPFB 기본값 그대로(새 수 0) — 성별·인종만 바꾼다
    macro["gender"] = spec["gender"]
    macro["race"] = {"asian": 1.0, "caucasian": 0.0, "african": 0.0}
    base = HS.create_human(macro_detail_dict=macro)
    rig = HS.add_builtin_rig(base, "cmu_mb")
    # ★[T604 ②] 옷 = 시트 링 표 → 이 몸 → MPFB mhclo — 기본 메시(뼈 무게 · 보조 기하)를 읽어 짓는다(무리는 잠깐 세웠다 걷는다)
    #   [T654] 기하는 하나(옷 넷이 같이) — 갖옷 털 두께는 점마다 방향(`cl["inflate"]`) · 엔진 셰이더가 민다(메시 사본 0)
    cl = CM.make(sex, base, rig, WORK, CELLS["cloth"][2:], PAD, CS, log=print)
    prox = HS.add_mhclo_asset(src(spec["proxy"]), base, asset_type="Proxymeshes", subdiv_levels=0, material_type="NONE")
    parts = {"skin": prox}
    parts["eyes"] = HS.add_mhclo_asset(src(COMMON["eyes"]), base, asset_type="eyes", subdiv_levels=0, material_type="NONE")
    parts["brows"] = HS.add_mhclo_asset(src(COMMON["brows"]), base, asset_type="eyebrows", subdiv_levels=0, material_type="NONE")
    parts["hair"] = HS.add_mhclo_asset(src(spec["hair"]), base, asset_type="hair", subdiv_levels=0, material_type="NONE")
    parts["cloth"] = HS.add_mhclo_asset(cl["base"], base, asset_type="clothes", subdiv_levels=0, material_type="NONE")
    for o in parts.values():                           # 모디파이어(무게 밖)는 적용해서 굳힌다 · 옷은 살을 안 지운다(delete_verts 0 — 어깨·단에서 살 구멍 0)
        apply_mods(o)
        for g in [g for g in o.vertex_groups if g.name not in rig.data.bones]:   # 뼈가 아닌 묶음은 버린다
            o.vertex_groups.remove(g)
    bpy.data.objects.remove(base, do_unlink=True)      # 기본 메시(고폴리)는 버린다 — 프록시가 몸이다
    for o in [rig] + list(parts.values()):
        if o.matrix_world != Matrix.Identity(4):
            raise SystemExit(f"[char3d] ★{o.name} 의 오브젝트 변환이 단위가 아니다 — 데이터 변환 전제가 깨졌다")
    # ★[T654] 옷 점 차례 = 생성기가 지은 차례인가(털 두께 방향을 점 번호로 싣는다) — 묶어 입힌 점마다 가장 가까운 지은 점이 제 번호여야 한다
    got = np.array([tuple(v.co) for v in parts["cloth"].data.vertices], dtype=np.float64)
    made = np.array(cl["inflate"]["verts"], dtype=np.float64)
    near = ((got[:, None, :] - made[None, :, :]) ** 2).sum(-1).argmin(1) if len(got) == len(made) else None
    if near is None or (near != np.arange(len(made))).any():
        raise SystemExit(f"[char3d] ★{sex} 입힌 옷 점 차례가 지은 차례와 다르다(점 {len(got)} · 지은 {len(made)}) — 털 두께 방향을 못 싣는다")
    # 삼각형 예산: 살·눈·눈썹은 그대로 · 옷은 지은 그대로(링 표가 정한다 — 줄이지 않는다) · 남는 몫을 머리에
    fixed = tris(parts["skin"]) + tris(parts["eyes"]) + tris(parts["brows"])
    left = TRI_BUDGET - fixed
    tri = {k: tris(o) for k, o in parts.items()}
    if tri["cloth"] > left // 2:
        raise SystemExit(f"[char3d] ★{sex} 옷 삼각형이 예산을 넘는다: {tri['cloth']} · 몫 {left // 2}")
    tri["hair"] = decimate(parts["hair"], max(1, left - tri["cloth"]))
    # 축·키: MPFB(−y 앞 · +x 왼쪽) → 엔진 규약(+x 앞 · +y 왼쪽 · T522 "방향 0 = +x") · 정수리 = 1.60m
    top = max(v.co.z for v in parts["skin"].data.vertices)
    s = H_PERSON / top
    M = Matrix.Rotation(math.pi / 2, 4, "Z") @ Matrix.Scale(s, 4)
    rig.data.transform(M)
    for o in parts.values():
        o.data.transform(M)
    # ★[T654] 털 두께 방향 = 정점 속성 `_inflate`(옷 점 = 생성기 방향을 몸과 같이 돌린 단위 벡터 · 살·눈·눈썹·머리 = 0) · 두께 = 생성기 두께 × 등배.
    #   내보내기는 사용자 속성을 축 바꿈 없이 낸다(io_scene_gltf2 `__get_layer_attribute`) — 위치와 같은 glTF 축(y 위: (x, z, −y))으로 미리 돌려 싣는다.
    R3 = M.to_3x3().normalized()
    for k, o in parts.items():
        a = o.data.attributes.new("_inflate", "FLOAT_VECTOR", "POINT")
        if k == "cloth":
            for i, d in enumerate(cl["inflate"]["dir"]):
                e = R3 @ Vector(d)
                a.data[i].vector = (e.x, e.z, -e.y)
    bpy.context.view_layer.update()
    return rig, parts, cl, {"scale": round(s, 6), "topM": round(top, 6), "tris": tri, "inflate": {"fur": round(s * cl["inflate"]["pad"], 6)}}


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


def retarget_clip(rig, prefix, clip_name, spec, sheet):
    """한 클립을 액션 하나로. 열쇠 k 의 시각 = k(판 단위 · 장면 fps 1 — 내보내기가 열쇠 사이를 다시 뜨지 않게)."""
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
            Q[b.name] = (b.tail_local - b.head_local).normalized().rotation_difference((C_B2O @ v).normalized()).to_matrix()
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

    def locals_at(fi, ctr=(0.0, 0.0)):
        W = pose_at(fi)
        Mp = {}
        for b in order_b:
            nm = b.name[len(prefix):]
            T = H @ W[J[RENAME_BVH.get(nm, nm)]] @ corr[b.name] @ rest[b.name].to_3x3()
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
        L0, L1 = locals_at(i0, ctr)[0], locals_at(i1, ctr)[0]
        for b in order_b:
            pb = rig.pose.bones[b.name]
            pb.rotation_mode = "QUATERNION"
            q = L0[b.name].to_quaternion().slerp(L1[b.name].to_quaternion(), w)
            p = prev.get(b.name)
            if p is not None and p.dot(q) < 0:
                q.negate()
            prev[b.name] = q.copy()
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=k)
            if b.parent is None:
                pb.location = L0[b.name].translation.lerp(L1[b.name].translation, w)
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
            "window": [int(start), int(period)], "rule": rule, "sheet": sheet, "center": "feet" if feet_ctr else "hips"}


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
scene = bpy.context.scene
scene.render.fps = 1                                   # ★열쇠 시각 = 판 번호(T539 클립 파일과 같은 문법 — 내보내기가 장면 fps 로 다시 뜬다)
scene.render.fps_base = 1.0
os.makedirs(TEXD, exist_ok=True)
built = {}


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
    # ★[T654] 몸 하나 = 살·눈·눈썹·머리·옷(옷 넷이 같이 — 갖옷 털 두께는 정점 속성 `_inflate` · 셰이더) — 사본 0
    body = _join([parts["skin"], parts["eyes"], parts["brows"], parts["hair"], parts["cloth"]], f"{sex}_body")
    for b in rig.data.bones:                           # 뼈 이름에 몸 머리(두 몸이 한 파일 · 이름이 겹치지 않게) — 무게 묶음도 따라 바뀐다
        b.name = f"{sex}_{b.name}"
    rig.name = rig.data.name = sex
    missing = [g.name for g in body.vertex_groups if g.name not in rig.data.bones]
    if missing:
        raise SystemExit(f"[char3d] ★뼈 이름을 바꾼 뒤 무게 묶음이 안 따라왔다: {missing[:5]}")
    clips = {}
    for spec in MOCAP_CLIPS:
        clips[spec[0]] = retarget_clip(rig, sex + "_", spec[0], spec, SHEET[spec[0]])
    for kind, im in atl.items():
        im.save(os.path.join(TEXD, f"{sex.lower()}_{kind}.jpg"), quality=88, optimize=False, progressive=False, subsampling=0)
    alpha.save(os.path.join(TEXD, f"{sex.lower()}_alpha.png"), optimize=False, compress_level=9)
    info["trisTotal"] = tris(body)
    info["bones"] = len(rig.data.bones)
    built[sex] = {"rig": rig, "body": body, "info": info, "clips": clips, "cl": cl}
    print(f"[char3d] {sex}: 삼각형 {info['trisTotal']}({info['tris']}) · 뼈 {info['bones']} · 등배 {info['scale']} · 갖옷 두께 {info['inflate']['fur']}m · 클립 {list(clips)}")

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
            export_attributes=True,                        # ★[T654] 사용자 속성(밑줄 머리) — `_inflate`(갖옷 털 두께 방향)만 있다(ⓐ 하네스가 잰다)
            export_all_influences=False, export_cameras=False, export_lights=False, export_extras=False, export_morph=False)
known = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
if "export_attributes" not in known:
    raise SystemExit("[char3d] ★내보내기에 사용자 속성 손잡이(`export_attributes`)가 없다 — 갖옷 털 두께(`_inflate`)를 못 싣는다")
bpy.ops.export_scene.gltf(**{k: v for k, v in opts.items() if k in known})

# ── ⑤ 메타 — 엔진이 읽는 규약(클라는 수를 안 박는다) ──────────────────────────────────────────
import io_scene_gltf2                                  # noqa: E402
sun_dir = Matrix.Rotation(rc.SUN_WORLD[2], 3, "Z") @ Matrix.Rotation(rc.SUN_WORLD[1], 3, "Y") @ Matrix.Rotation(rc.SUN_WORLD[0], 3, "X") @ Vector((0, 0, -1))
for k in ("render_common.py", "mocap_retarget.py", "char_clothes_mhclo.py", "char_render.py"):
    INPUTS["scripts/" + k] = sha16(os.path.join(HERE, k))
INPUTS["add-on-mpfb-v2.0.17.zip"] = _zip_sha
meta = {
    "_": "[T545 · T604 · T654] char_export_gltf.py 산물 — 엔진이 읽는 규약. 클라는 이 수를 하드코딩하지 않는다(갖옷 털 두께는 `bodies.<몸>.inflate`).",
    "glb": "char_body.glb",
    "units": "1 = 1m = 1셀(32 게임px)",
    "facing": "방향 0 = 모델 +x(Blender) — 시트 행 0 과 같다 · 방향 d = d×45°(연속 회전은 atan2(fy,fx))",
    "zsq": rc.ZSQ,
    "zsqNote": "엔진이 부모 스케일로 누른다(포즈 뒤 누르기 = char_render.py ZSQ 절과 같은 순서)",
    "flip": "시트는 굽고 나서 좌우를 뒤집는다(_flip_png) — 엔진은 모델 좌표를 게임 좌표 그대로 놓고(거울 = 행렬식 −1) 같은 그림을 얻는다",
    "height": H_PERSON,
    "body": "MPFB " + MPFB_VER + " · MakeHuman 시스템 자산(CC0)",
    "bodies": {sex: {"node": sex, "mesh": f"{sex}_body", "tris": v["info"]["trisTotal"], "trisParts": v["info"]["tris"],
                     "inflate": v["info"]["inflate"],
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
    "inflateAttr": "_inflate",
    "inflateNote": "[T654] 옷 → 메시는 하나(옷 넷 = 재질) · 갖옷 = 정점 속성 `_inflate`(옷 점 = 털 두께 방향 단위 벡터 · 살·눈·눈썹·머리 = 0) × "
                   "`bodies.<몸>.inflate.<옷>`(m · 생성기 `FUR_PAD` × 키 비 × 등배) — 묶기 자세에서 민 뒤 스키닝(엔진 셰이더 한 줄)",
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
    "_": "[T545 · T604 · T654] char3d 잠금 — 값 = 파일 sha1 앞 16자(바이트가 자산). 입력 지문이 바뀌면 다시 굽는다. 원본은 저장소 밖(`~/Mini/_3d_in/`).",
    "_기계": f"pip bpy {bpy.app.version_string} · {meta['exporter']} · MPFB {MPFB_VER}",
    "_입력": dict(sorted(INPUTS.items())),
    "char3d": outs,
}
with open(LOCK, "w", encoding="utf-8") as f:
    json.dump(lock, f, ensure_ascii=False, indent=1, sort_keys=True)
    f.write("\n")
tot = sum(os.path.getsize(os.path.join(OUT, k)) for k in outs)
print(f"[char3d] {os.path.relpath(GLB, ROOT)} {os.path.getsize(GLB)}B · 무늬 {len(outs) - 2}장 · 합 {tot}B · 잠금 {outs['char_body.glb']}")
