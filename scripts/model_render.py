#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/model_render.py — 받은 3D 모델 → 8방향 스프라이트 시트 [T1194 · ★재민 11-06]
#
# ★왜 있나: 굽기 도구(`scripts/*_render.py`)는 **코드로 만든 모델만** 읽었다. 외부 협력자가 손으로 만든
#   모델(첫 PR #77 = 소 · 닭 · 멧돼지 FBX)을 받아 굽는 길이 없었다. 이 파일이 그 길이다:
#     받은 모델 → 실제 크기로 맞춤 → **사람 시트와 같은 씬**(`render_common` — 카메라 · 빛 · 1m = 32px)
#     → 8방향 → 동작이 있으면 동작마다 시트 · 없으면 **서 있기 한 장**(8방향) → 메타 JSON(`char_meta.json` 문법).
#
# ★★씬 값은 하나도 여기 적지 않는다 — `render_common`(정본)에서 읽는다(사본 0 · `test-model-intake` 가 지킨다).
#   ⚠`render_common.PPU`(45.255 = px/m)와 `char_render.PPU`(그 SS 배)는 이름이 같고 값이 다르다 —
#     그래서 `import render_common as rc` 로만 부른다(그 파일 머리말의 경고 그대로).
#   후처리(먹선 · 셀 · 가장자리)는 **사람 시트의 그 값**을 `public/assets/char/char_meta.json` 의 `shape` 에서 읽는다
#   (짐승과 사람이 한 화면에 서므로 한 붓이다 · 수를 옮겨 적지 않는다).
#   가져오기 · `출처.txt` 읽기 · 동작 이름표는 검사기 `scripts/model-check.py` 의 함수를 그대로 부른다(사본 0).
#
# ★방향: d = 0 은 +x(동) — 사람 메타의 `dirOrder` 그대로. 모델의 **앞**(`--front` · 없으면 `출처.txt` 의 `앞:` ·
#   그것도 없으면 +Y)을 +x 로 돌린 뒤 d × 45° 로 돈다. 행 = 방향(위에서 아래) · 열 = 프레임.
# ★크기: `--length`(앞 축 길이 m) 또는 `--height`(m) · 없으면 `출처.txt` 의 `크기:` · 그것도 없으면 모델 단위 그대로
#   (단, 가장 긴 변이 1.000 인 정규화 모델이면 멈춘다 — 크기를 모르고 구우면 짐승이 다 1m 다).
# ★공유 프레임 상자: 전 방향 × 전 프레임의 화면 bbox 합집합 하나 · 앵커 = 지면 원점(몸 가운데 아래) — 사람과 같은 규약.
#   메타가 이미 있으면 그 상자를 못박는다(`T1194_BOXPIN=0` 이면 새로 잰다 · `render_common.fit_pinned_box`).
#
# 실행:
#   blender --background --factory-startup --python scripts/model_render.py -- <모델> --name=wild_boar --class=animals \
#       [--front=-y] [--length=1.45 | --height=0.9] [--size-src="…"] [--out=<폴더>] [--preview=<png> --preview-dir=1]
#       [--respec=20000:2048 [--respec-out=<glb>]] [--naive=20000:2048] [--no-sheet]
#   --respec : 규격판을 만들어 그것으로 굽는다 — 면 수를 정해 다시 뽑고(Decimate) **UV 를 새로 펴 텍스처를 다시 굽는다**
#              (원본에서 색 · 요철을 옮겨 굽기 — 리토폴로지 + 베이크의 자동판 · 비교용).
#   --naive  : 비교용 "자동 줄이기만"(옛 UV 그대로 Decimate + 텍스처 축소) — UV 가 찢어진 얼룩을 보이려는 판.
#   ⚠우분투 apt 블렌더(4.0.2)의 FBX 가져오기는 numpy 가 필요하다 — `apt-get install -y python3-numpy`.
#
# ★★[T1210 · ★재민 11-07] 동작이 **파일마다 따로** 온다(VARCO 3D — 뼈대 하나 + 동작 파일 넷 · 같은 뼈대) — 한 뼈대에 묶어 굽는다:
#   --anim=<키>=<파일>      : 그 파일의 동작을 클립 <키>(idle · walk · run · eat · die)로 — 뼈 이름 · 쉬는 자세가 같아야 한다(다르면 멈춘다)
#   --clip=<키>=<구간>      : 클립에 쓸 때(초 · 그 동작의 첫 키 = 0) — `2.5-3.4+5.7-6.4` 처럼 이어 붙인다 · `cycle` = 한 고리(`model_gait.cycle`)
#                             걷기 · 뛰기는 주지 않으면 `cycle` 이다(받은 클립엔 고리가 여럿 — 8판을 여러 고리에 펴면 다리가 뭉갠다) · 나머지는 통째
#   --frames=<키>=<n>       : 판 수(없으면 아래 `CLIP_TABLE` — 사람 시트와 같은 수)
#   --face=<키>=<뼈A>><뼈B> : 그 클립의 **첫 판**에서 몸(뼈A 머리 → 뼈B 꼬리) 방향 · 가운데를 쉬는 자세의 것으로 돌려 놓는다(클립 내내 같은 돌림 하나) —
#                             말용 쓰러짐처럼 쓰러지며 몸이 돌면 행(방향)이 틀어지므로
#   --species=<게임 키>     : 목록(`index.json`)에서 이 시트가 설 **게임 짐승 칸**(`public/animals.js` 의 키) — 없으면 폴더 이름(종전)
#   걷기 · 뛰기 클립은 메타에 `strideM`(한 고리 보폭 m) · `speedMps`(제 빠르기) · `slipCm`(발마다 미끄러짐) 을 적는다 — 재는 법은 `model_gait.py` 머리말.
#   시간 0 = 동작의 첫 키 · 판의 때는 소수 프레임까지(`frame_set(subframe)`) — 받은 키가 씬 fps 와 안 맞아도 그때 그 자세다.
# ★★[T1237 · ★재민 11-09 "새 종"] 받은 동작에 **없는 자세**를 이 뼈대로 짓는다(키) — 셋:
#   --key=<키>=<원천>@<초>:<때>|…  : 키 클립 — 받은 동작(`--anim` 의 키)의 그 초 자세를 새 클립의 그 때(초)에 두고 사이는 뼈마다 보간
#                                    (옮김 · 크기 = 곧게 · 돎 = 구면 · 짧은 쪽). 첫 때 = 0 · 때는 늘어나야 한다. `--face` 가 있으면 **키마다** 몸 방향 · 가운데를
#                                    쉬는 자세의 것으로 돌려 놓고(뿌리 뼈에 구워) 보간하고, 판마다 한 번 더 맞춘다(쓰러지며 도는 원천도 행이 안 틀어진다).
#                                    예: 쓰러짐 1.2초 = 서기 0초 → 말용 쓰러짐 2.85 · 3.25(엎드림) · 5.95(옆으로 넘어감) · 6.4초(누움) — 원천이 엎드려 머리를 드는
#                                    3.4 ~ 5.7초를 건너뛴다(T1210 회부 4 "이은 자리 머리 들림").
#   --bend=<키>=<뼈>:<도>,…        : 그 클립의 판마다 뼈를 제 X 축(옆 축 — 목뼈는 몸 옆)으로 더 돌린다(풀 뜯기 = 서기 동작 위에 목 · 머리 숙임).
#   --loop=<키>=0|1                 : 고리 여부(없으면 아래 `CLIP_TABLE`) — 풀 뜯기는 서기처럼 돈다.
#   새 클립 키 `lie`(엎드림 · 한 판) — 검사기 동작 이름표(`model-check.ACTIONS` — 받는 이름 다섯)엔 없다: 받는 동작이 아니라 굽는 쪽이 짓는 클립이다.
# =============================================================================

import bpy, os, sys, json, math, mathutils, importlib.util

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import render_common as rc

_spec = importlib.util.spec_from_file_location("model_check", os.path.join(HERE, "model-check.py"))
mc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mc)
import model_gait as mg                # [T1210] 걸음 재기(고리 · 보폭 · 미끄러짐 · 몸 방향) — 재는 함수는 그 파일 하나(사본 0)

V = mathutils.Vector
M = mathutils.Matrix

SS = rc.SS
PPU0 = rc.PPU                      # px/m(게임 해상도) — 사람 메타의 `ppu`
P = PPU0 * SS                      # 굽기 px/m
MARGIN = 3                         # 공유 상자 여백(굽기 px) — 사람 시트(`char_render.MARGIN`)와 같은 값
DIRS = 8
# 동작 → (프레임 수, 루프) — 사람 시트 표(`char_render.CLIPS`)의 같은 꼴: 서기 4 · 걷기 8 · 뛰기 8 · 원샷 6(휘두르기와 같은 칸)
CLIP_TABLE = {"idle": (4, True), "walk": (8, True), "run": (8, True), "eat": (6, False), "die": (6, False), "lie": (1, True)}   # [T1237] lie = 엎드림(한 판)


def _args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"model": None, "name": None, "class": "animals", "front": None, "length": None, "height": None, "sizeSrc": None,
         "out": None, "preview": None, "previewDir": 1, "respec": None, "respecOut": None, "naive": None, "noSheet": False, "raw": None,
         "anim": [], "clip": {}, "frames": {}, "face": {}, "species": None, "key": {}, "bend": {}, "loop": {}}
    for x in a:
        if not x.startswith("--"):
            o["model"] = x
            continue
        k, _, v = x[2:].partition("=")
        if k in ("anim", "clip", "frames", "face", "key", "bend", "loop"):     # [T1210] <키>=<값> · [T1237] key · bend · loop
            ck, _, cv = v.partition("=")
            if ck not in CLIP_TABLE:
                raise SystemExit(f"[model] --{k}: 클립 키 '{ck}' 를 모른다(키 {' · '.join(CLIP_TABLE)})")
            if k == "anim": o["anim"].append((ck, cv))
            elif k == "clip": o["clip"][ck] = cv
            elif k == "frames": o["frames"][ck] = int(cv)
            elif k == "key": o["key"][ck] = cv
            elif k == "bend": o["bend"][ck] = [(b, float(a)) for b, _, a in (t.partition(":") for t in cv.split(","))]
            elif k == "loop": o["loop"][ck] = cv not in ("0", "false", "")
            else: o["face"][ck] = tuple(cv.split(">"))
            continue
        if k == "species": o["species"] = v
        elif k == "name": o["name"] = v
        elif k == "class": o["class"] = v
        elif k == "front": o["front"] = mc.parse_front(v)
        elif k == "length": o["length"] = float(v)
        elif k == "height": o["height"] = float(v)
        elif k == "size-src": o["sizeSrc"] = v
        elif k == "out": o["out"] = v
        elif k == "preview": o["preview"] = v
        elif k == "preview-dir": o["previewDir"] = int(v)
        elif k == "respec": o["respec"] = tuple(int(t) for t in v.split(":"))
        elif k == "respec-out": o["respecOut"] = v
        elif k == "naive": o["naive"] = tuple(int(t) for t in v.split(":"))
        elif k == "no-sheet": o["noSheet"] = True
        elif k == "raw": o["raw"] = v
    if not o["model"] or not o["name"]:
        raise SystemExit("쓰는 법: … model_render.py -- <모델> --name=<종 키> [--class=animals] [--front=-y] [--length=m] …")
    if not o["out"]:
        o["out"] = os.path.join(ROOT, "public", "assets", o["class"], o["name"])
    return o


OPT = _args()
SRC_TXT = mc.read_source_txt(OPT["model"]) or {}

# ═══════════════ 씬(정본) · 가져오기 ═══════════════
scene, cam, cam_d, sun, tgt = rc.build_scene("model")
sun.rotation_euler = rc.SUN_WORLD                     # 세계 패스 태양(좌우 FLIP 보정과 짝)
imported = mc.import_model(OPT["model"])
MESHES = [o for o in imported if o.type == 'MESH']
ARMS = [o for o in imported if o.type == 'ARMATURE']
if not MESHES:
    raise SystemExit("[model] 메시가 없다")


def merge_anims(specs, arm):
    """[T1210] 동작 파일마다 그 동작만 남기고(뼈대 · 메시 · 텍스처는 지운다) 클립 키에 묶는다. → {키: (동작 이름, 파일 지문)}"""
    out = {}
    for key, path in specs:
        if arm is None:
            raise SystemExit("[model] --anim: 바탕 모델에 뼈대가 없다")
        pools = (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures)
        before = [set(p) for p in pools]
        acts0 = set(bpy.data.actions)
        mc.import_model(path)
        new = [[x for x in p if x not in b] for p, b in zip(pools, before)]
        arms2 = [o for o in new[0] if o.type == 'ARMATURE']
        acts = [a for a in bpy.data.actions if a not in acts0]
        if len(arms2) != 1 or len(acts) != 1:
            raise SystemExit(f"[model] --anim {key}: 뼈대 {len(arms2)} · 동작 {len(acts)} — 하나씩이어야 한다({os.path.basename(path)})")
        a2 = arms2[0]
        n1, n2 = {b.name: b for b in arm.data.bones}, {b.name: b for b in a2.data.bones}
        if set(n1) != set(n2):
            raise SystemExit(f"[model] --anim {key}: 뼈 이름이 다르다 — 없는 뼈 {sorted(set(n1) ^ set(n2))[:6]}")
        # 쉬는 자세 — 뼈마다 같은 **옮김 하나**만 허락한다(받은 파일마다 모델 전체가 조금씩 옮겨져 나온다 · 모양은 같다).
        #   동작은 쉬는 자세에서의 차로 읽히므로 바탕 뼈대에 얹으면 그 옮김만 빠진 같은 자세다 — 모양이 다르면(옮김 하나로 안 맞으면) 멈춘다.
        off = n2[next(iter(n1))].head_local - n1[next(iter(n1))].head_local
        gap = max(max((n2[k].head_local - n1[k].head_local - off).length, (n2[k].tail_local - n1[k].tail_local - off).length) for k in n1)
        if gap > 1e-4:
            raise SystemExit(f"[model] --anim {key}: 쉬는 자세의 모양이 다르다(옮김 {off.length:.4f} 을 빼고도 뼈 끝 최대 {gap:.5f}) — 같은 뼈대가 아니다")
        act = acts[0]
        act.use_fake_user = True
        act.name = f"{key}|{os.path.basename(path)}"
        for o in new[0]:
            bpy.data.objects.remove(o, do_unlink=True)
        for pool, xs in zip(pools[1:], new[1:]):
            for x in xs:
                if x.users == 0:
                    pool.remove(x)
        out[key] = (act.name, {"file": os.path.basename(path), "md5": mc.md5(path), "bytes": os.path.getsize(path),
                               "restOffset": [round(x, 5) for x in off]})
        print(f"[model] 동작 묶음 {key} ← {os.path.basename(path)} · 뼈 {len(n1)} 이름 같음 · 쉬는 자세 = 바탕 + 옮김 {off.length:.4f}(모양 차 {gap:.1e})")
    return out


ANIMS = merge_anims(OPT["anim"], ARMS[0] if ARMS else None)


def mesh_bbox(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    lo, hi = [1e18] * 3, [-1e18] * 3
    for o in objs:
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        mw = eo.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            for i in range(3):
                if p[i] < lo[i]: lo[i] = p[i]
                if p[i] > hi[i]: hi[i] = p[i]
        eo.to_mesh_clear()
    return lo, hi


def tri_count(objs):
    return sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)


# ═══════════════ 규격판(--respec) · 자동 줄이기만(--naive) — 비교용 ═══════════════
def _join(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def _decimated_copy(src, tris_target, name):
    low = src.copy()
    low.data = src.data.copy()
    low.name = name
    bpy.context.scene.collection.objects.link(low)
    ratio = min(1.0, tris_target / max(1, tri_count([src])))
    md = low.modifiers.new("dec", 'DECIMATE')
    md.ratio = ratio
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.ops.object.modifier_apply(modifier=md.name)
    return low


def _first_image(obj, colorspace):
    for m in obj.data.materials:
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.colorspace_settings.name == colorspace:
                    return n.image
    return None


def naive_version(objs, tris_target, tex):
    """자동 줄이기만 — 옛 UV · 옛 재질 그대로 면만 줄이고 텍스처를 `tex` 로 줄인다(PM 이 잰 얼룩의 판)."""
    src = _join(objs)
    low = _decimated_copy(src, tris_target, "naive")
    for m in low.data.materials:
        if m and m.use_nodes:
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and max(n.image.size) > tex:
                    im = n.image.copy()
                    im.scale(tex, tex)
                    n.image = im
    bpy.data.objects.remove(src, do_unlink=True)
    return [low]


def respec_version(objs, tris_target, tex, out_glb=None):
    """규격판 — 면 수를 정해 다시 뽑고(Decimate) UV 를 새로 펴고, 원본에서 색 · 요철을 `tex`² 로 다시 굽는다."""
    high = _join(objs)
    low = _decimated_copy(high, tris_target, "spec")
    # UV 새로 — 옛 UV 를 지우고 펼친다(옛 UV 는 줄이면서 찢어진다 — 그 찢어짐이 얼룩이다)
    while low.data.uv_layers:
        low.data.uv_layers.remove(low.data.uv_layers[0])
    low.data.uv_layers.new(name="UVMap")
    bpy.ops.object.select_all(action='DESELECT')
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66.0), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    # 굽는 판 — 새 재질(이미지 노드 하나가 활성 = 굽는 자리)
    img_c = bpy.data.images.new("spec_base_color", tex, tex, alpha=False)
    img_n = bpy.data.images.new("spec_normal", tex, tex, alpha=False, float_buffer=False)
    img_n.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new("spec_mat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexImage'); tc.image = img_c
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img_n
    low.data.materials.clear()
    low.data.materials.append(mat)
    sc = bpy.context.scene
    keep = (sc.cycles.samples,)
    sc.cycles.samples = 4
    size = max(V(low.dimensions))
    bk = sc.render.bake
    bk.use_selected_to_active = True
    bk.cage_extrusion = 0.01 * size
    bk.margin = 8
    bpy.ops.object.select_all(action='DESELECT')
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    nt.nodes.active = tc
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, cage_extrusion=bk.cage_extrusion, margin=bk.margin)
    nt.nodes.active = tn
    bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_selected_to_active=True, cage_extrusion=bk.cage_extrusion, margin=bk.margin)
    sc.cycles.samples = keep[0]
    # 다 구운 재질 — 색 · 요철을 잇는다
    nt.links.new(tc.outputs['Color'], bsdf.inputs['Base Color'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    _copy_bsdf_values(high, bsdf)                     # 원본 재질의 잇지 않은 값(거칠기 · IOR · 반사 세기 …)을 그대로 — 굽는 것은 색 · 요철뿐
    img_c.pack(); img_n.pack()
    bpy.data.objects.remove(high, do_unlink=True)
    if out_glb:
        bpy.ops.object.select_all(action='DESELECT')
        low.select_set(True)
        bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_image_format='JPEG')
        print(f"[model] 규격판 저장: {out_glb} · {os.path.getsize(out_glb) / 1e6:.2f} MB · 삼각형 {tri_count([low]):,}")
    return [low]


def _copy_bsdf_values(src_obj, dst_bsdf):
    """원본의 첫 Principled 에서 **링크 안 된** 입력값을 새 재질로 옮긴다(색 · 요철 · 법선은 구운 그림이 맡는다)."""
    for m in src_obj.data.materials:
        if not (m and m.use_nodes):
            continue
        for n in m.node_tree.nodes:
            if n.type != 'BSDF_PRINCIPLED':
                continue
            for inp in n.inputs:
                if inp.is_linked or inp.name in ('Base Color', 'Normal') or not hasattr(inp, 'default_value'):
                    continue
                if inp.name in dst_bsdf.inputs and not dst_bsdf.inputs[inp.name].is_linked:
                    try:
                        dst_bsdf.inputs[inp.name].default_value = inp.default_value
                    except Exception:
                        pass
            for k in ('distribution', 'subsurface_method'):
                if hasattr(n, k):
                    setattr(dst_bsdf, k, getattr(n, k))
            return


SRC_TRIS = tri_count(MESHES)
VARIANT = "원본"
if OPT["respec"]:
    MESHES = respec_version(MESHES, OPT["respec"][0], OPT["respec"][1], OPT["respecOut"])
    VARIANT = f"규격판 {OPT['respec'][0]}:{OPT['respec'][1]}"
elif OPT["naive"]:
    MESHES = naive_version(MESHES, OPT["naive"][0], OPT["naive"][1])
    VARIANT = f"자동 줄이기만 {OPT['naive'][0]}:{OPT['naive'][1]}"
TRIS = tri_count(MESHES)

# ═══════════════ 맞춤 — 앞 → +x · 실제 크기 · 땅 위 · 몸 가운데 = 원점 ═══════════════
root = bpy.data.objects.new("Root", None); scene.collection.objects.link(root)
fit = bpy.data.objects.new("Fit", None); scene.collection.objects.link(fit)
fit.parent = root
for o in list(MESHES) + list(ARMS):
    if o.parent is None or o.parent not in (MESHES + ARMS):
        mw = o.matrix_world.copy()
        o.parent = fit
        o.matrix_parent_inverse = M.Identity(4)
        o.matrix_basis = mw
bpy.context.view_layer.update()

FRONT = OPT["front"] or mc.parse_front(SRC_TXT.get("앞")) or "+y"
FRONT_SRC = "인자" if OPT["front"] else ("출처.txt" if mc.parse_front(SRC_TXT.get("앞")) else "기본 +Y(규격)")
fx, fy = mc.FRONTS[FRONT]
BASE_ROT = -math.atan2(fy, fx)                        # 앞을 +x(동)로 — d = 0 이 동쪽을 본다(사람 메타 `dirOrder`)
_keep = mc.rest_pose(ARMS)                             # 크기 · 바닥은 쉬는 자세에서(검사기와 같은 자)
lo, hi = mesh_bbox(MESHES)
mc.rest_pose(ARMS, _keep)
ext = [hi[i] - lo[i] for i in range(3)]
along = abs(fx) * ext[0] + abs(fy) * ext[1]          # 앞 축 길이(모델 단위)
size_txt = mc.parse_size(SRC_TXT.get("크기"))
if OPT["length"]:
    S = OPT["length"] / along; SIZE_SRC = OPT["sizeSrc"] or f"인자 --length={OPT['length']}"
elif OPT["height"]:
    S = OPT["height"] / ext[2]; SIZE_SRC = OPT["sizeSrc"] or f"인자 --height={OPT['height']}"
elif size_txt:
    S = size_txt / along; SIZE_SRC = "출처.txt 크기: " + SRC_TXT.get("크기", "")
else:
    if abs(max(ext[0], ext[1]) - 1.0) <= mc.SPEC["normTol"] or abs(max(ext) - 1.0) <= mc.SPEC["normTol"]:
        raise SystemExit("[model] ★크기를 모른다 — 정규화(가장 긴 변 1.000) 모델이다. --length / --height 또는 출처.txt '크기:' 를 주라")
    S = 1.0; SIZE_SRC = "모델 단위 그대로(m)"
ground = V(((lo[0] + hi[0]) * 0.5, (lo[1] + hi[1]) * 0.5, lo[2]))
fit.matrix_basis = M.Rotation(BASE_ROT, 4, 'Z') @ M.Scale(S, 4) @ M.Translation(-ground)
root.scale = (1.0, 1.0, rc.ZSQ)                       # 높이 압축(1m 높이 = 32px) — 회전은 z 축이라 둘이 바뀌어도 같다
bpy.context.view_layer.update()
LEN_M, WID_M, HGT_M = along * S, (abs(fy) * ext[0] + abs(fx) * ext[1]) * S, ext[2] * S
print(f"[model] {OPT['name']} · {VARIANT} · 삼각형 {TRIS:,}(원본 {SRC_TRIS:,}) · 앞 {FRONT}({FRONT_SRC}) · 배 {S:.4f}({SIZE_SRC})"
      f" → 길이 {LEN_M:.3f} · 폭 {WID_M:.3f} · 높이 {HGT_M:.3f} m")

# ═══════════════ 동작 → 클립 ═══════════════
_names, FOUND = mc.action_names()
FOUND.update({k: v[0] for k, v in ANIMS.items()})     # [T1210] --anim 이 이름표보다 앞선다(키를 사람이 적었다)
ARM = ARMS[0] if ARMS else None
ARM_BASE = ARM.matrix_basis.copy() if ARM else None
CLIPS = []


def _segments(key, act):
    """[T1210] 클립에 쓸 구간들 [(t0, t1)](초) · 한 고리 값 — `--clip` 또는 걷기 · 뛰기 = 한 고리 · 나머지 = 통째."""
    _f0, sp = mg.span(act)
    spec = OPT["clip"].get(key) or ("cycle" if key in mg.LOCO else None)
    if spec is None:
        return [(0.0, sp)], None
    if spec == "cycle":
        cy = mg.cycle(ARM, act, ARM_BASE)
        return [(cy["t0"], cy["t0"] + cy["P"])], cy
    segs = []
    for part in spec.split("+"):
        a, _, b = part.partition("-")
        segs.append((float(a), float(b)))
    if any(b <= a for a, b in segs):
        raise SystemExit(f"[model] --clip {key}: 구간이 거꾸로다 {spec}")
    return segs, None


def _times(segs, n, loop):
    """판 n 개의 때(초) — 구간들을 이어 붙인 길이 위에 고르게(고리 = 끝 칸 안 셈 · 한 번 = 끝 칸까지)."""
    tot = sum(b - a for a, b in segs)
    out = []
    for i in range(n):
        u = tot * (i / n if loop else i / max(1, n - 1))
        acc = 0.0
        for a, b in segs:
            if u <= acc + (b - a) + 1e-9 or (a, b) == segs[-1]:
                out.append(a + min(u - acc, b - a))
                break
            acc += b - a
    return out, tot


def _keyed(key, spec):
    """[T1237] `--key` 글자 → [(원천 키, 원천 초, 때)] · 키마다 뼈 자세(뼈대 공간 기준 `matrix_basis`)."""
    ks = []
    for part in spec.split("|"):
        src, _, rest = part.partition("@")
        ts, _, at = rest.partition(":")
        if src not in FOUND:
            raise SystemExit(f"[model] --key {key}: 원천 '{src}' 가 없다(`--anim={src}=…` 로 먼저 묶는다)")
        ks.append((src, float(ts), float(at)))
    if ks[0][2] != 0.0 or any(b[2] <= a[2] for a, b in zip(ks, ks[1:])):
        raise SystemExit(f"[model] --key {key}: 때는 0 에서 시작해 늘어나야 한다 {spec}")
    poses = []
    for src, ts, _at in ks:
        _rest_bones()
        mg.set_time(ARM, bpy.data.actions[FOUND[src]], ts)
        poses.append({pb.name: pb.matrix_basis.copy() for pb in ARM.pose.bones})
    return ks, poses


def _rest_bones():
    """[T1237] 뼈마다 쉬는 자세로 — 손으로 쓴 자세(키 클립 · 굽힘)가 남아 **동작이 키를 안 박은 뼈**(받은 서기 · 걷기 · 뛰기는 뿌리 뼈를 안 움직인다)를
    다음 클립까지 틀어 놓지 않게. 동작 클립은 늘 쉬는 자세 위에 그 동작을 얹는다(종전 굽기 = 손 자세가 없던 판과 같은 자세)."""
    if ARM is None:
        return
    for pb in ARM.pose.bones:
        pb.matrix_basis = M.Identity(4)


if ARM and (FOUND or OPT["key"]):
    FXY = None
    for key in list(mc.ACTIONS) + [k for k in CLIP_TABLE if k not in mc.ACTIONS]:   # [T1237] 받는 이름 다섯 + 굽는 쪽 클립(lie)
        n, loop = CLIP_TABLE[key]
        n = OPT["frames"].get(key, n)
        loop = OPT["loop"].get(key, loop)
        if key in OPT["key"]:                                  # [T1237] 키 클립 — 받은 동작의 자세들을 이어 짓는다
            ks, kp = _keyed(key, OPT["key"][key])
            dur = ks[-1][2]
            times, _d = _times([(0.0, dur)], n, loop)
            c = {"key": key, "action": None, "frames": n, "loop": loop, "times": times, "segs": None, "dur": dur,
                 "fps": round((n if loop else max(1, n - 1)) / max(1e-6, dur), 3), "comp": None, "cycle": None, "keyed": ks, "kposes": kp}
            CLIPS.append(c)
            continue
        if key not in FOUND:
            continue
        act = bpy.data.actions[FOUND[key]]
        segs, cy = _segments(key, act)
        times, dur = _times(segs, n, loop)
        c = {"key": key, "action": act.name, "frames": n, "loop": loop, "times": times, "segs": segs, "dur": dur,
             "fps": round((n if loop else max(1, n - 1)) / max(1e-6, dur), 3), "comp": None, "cycle": cy}
        CLIPS.append(c)
if not CLIPS:
    CLIPS = [{"key": "idle", "action": None, "frames": 1, "loop": False, "fps": 1.0}]   # 서 있기 한 장(사람 `down` · `carry` 의 한 판 꼴)

# [T1210] 걸음 값(걷기 · 뛰기) · 몸 돌림(--face) — 다 모델 공간(맞춤 앞 · 실제 m = × S)
for c in CLIPS:
    if c["action"] is None:
        continue
    act = bpy.data.actions[c["action"]]
    if c["key"] in mg.LOCO and len(c["segs"]) == 1:
        a, b = c["segs"][0]
        g = mg.loop_gait(ARM, act, a, b - a, (fx, fy), ARM_BASE)
        c["gait"] = {"strideM": round(g["stride"] * S, 4), "speedMps": round(g["speed"] * S, 4),
                     "slipCm": {f: round(v["slip"] * S * 100, 2) for f, v in sorted(g["feet"].items())},
                     "stanceS": {f: round(v["stanceS"], 4) for f, v in sorted(g["feet"].items())}}
        print(f"[model] {c['key']} 한 고리 {a:.4f}~{b:.4f}초 · 보폭 {c['gait']['strideM']} m · 제 빠르기 {c['gait']['speedMps']} m/s · 미끄러짐(cm) {c['gait']['slipCm']}")
    if c["key"] in OPT["face"]:
        A, B = OPT["face"][c["key"]]
        _k = mc.rest_pose(ARMS)
        h_r, c_r = mg.heading(ARM, A, B, (fx, fy), ARM_BASE)
        mc.rest_pose(ARMS, _k)
        mg.set_time(ARM, act, c["times"][0], wrap=c["loop"])
        h_0, c_0 = mg.heading(ARM, A, B, (fx, fy), ARM_BASE)
        c["comp"] = M.Translation(c_r) @ M.Rotation(h_r - h_0, 4, 'Z') @ M.Translation(-c_0)
        hs = []
        for t in c["times"]:
            mg.set_time(ARM, act, t, wrap=c["loop"])
            hs.append(math.degrees(mg.heading(ARM, A, B, (fx, fy), ARM_BASE)[0] - h_0))
        c["face"] = {"bones": [A, B], "turnDeg": round(math.degrees(h_0 - h_r), 2), "shiftM": round((c_0 - c_r).length * S, 4),
                     "driftDeg": [round(min(hs), 1), round(max(hs), 1)]}
        print(f"[model] {c['key']} 몸 돌림 — 첫 판 방향 {c['face']['turnDeg']:+.1f}° · 가운데 {c['face']['shiftM']} m 를 쉬는 자세로 · 판마다 남는 돌음 {c['face']['driftDeg']}°")


# [T1237] 키 클립의 몸 돌림 — 키마다 몸 방향 · 가운데를 쉬는 자세의 것으로 **뿌리 뼈에 구워**(보간이 원천의 돎을 안 따라 돌게) · 판마다 나머지를 한 번 더(`_face_frame`)
def _keyed_face():
    RB = mg.root_bone(ARM)
    for c in CLIPS:
        if not c.get("keyed") or c["key"] not in OPT["face"]:
            continue
        A, B = OPT["face"][c["key"]]
        _k = mc.rest_pose(ARMS)
        h_r, c_r = mg.heading(ARM, A, B, (fx, fy), ARM_BASE)
        mc.rest_pose(ARMS, _k)
        c["faceRef"] = (A, B, h_r, c_r)
        turns, shifts = [], []
        L = ARM.data.bones[RB].matrix_local
        for kp in c["kposes"]:
            ARM.matrix_basis = ARM_BASE
            _set_pose(kp)
            h, cc = mg.heading(ARM, A, B, (fx, fy), ARM_BASE)
            comp = M.Translation(c_r) @ M.Rotation(h_r - h, 4, 'Z') @ M.Translation(-cc)
            Ca = ARM_BASE.inverted() @ comp @ ARM_BASE
            kp[RB] = L.inverted() @ Ca @ L @ kp[RB]
            turns.append(round(math.degrees(h - h_r), 1)); shifts.append(round((cc - c_r).length * S, 4))
        c["face"] = {"bones": [A, B], "keyTurnDeg": turns, "keyShiftM": shifts, "per": "키마다 뿌리 뼈 + 판마다 나머지"}
        print(f"[model] {c['key']} 키 몸 돌림 — 키마다 방향 {turns}° · 가운데 {shifts} m 를 쉬는 자세로")


def _set_pose(mats):
    """[T1237] 뼈마다 자세를 손으로 — 동작을 떼고 쓴다(굽는 동안 동작 평가가 손 자세를 덮지 않게)."""
    if ARM.animation_data is not None:
        ARM.animation_data.action = None
    for pb in ARM.pose.bones:
        pb.matrix_basis = mats[pb.name]
    bpy.context.view_layer.update()


def _lerp_pose(a, b, u):
    """[T1237] 두 자세 사이 u(0~1) — 뼈마다 옮김 · 크기 = 곧게 · 돎 = 구면(짧은 쪽)."""
    out = {}
    for k in a:
        la, ra, sa = a[k].decompose()
        lb, rb, sb = b[k].decompose()
        if ra.dot(rb) < 0:
            rb = rb.copy(); rb.negate()
        out[k] = M.LocRotScale(la.lerp(lb, u), ra.slerp(rb, u), sa.lerp(sb, u))
    return out


def _bend(key):
    """[T1237] `--bend` — 그 뼈를 제 X 축으로 더 돌린다(판마다 · 동작 위에)."""
    bs = OPT["bend"].get(key)
    if not bs:
        return
    for bone, deg in bs:
        pb = ARM.pose.bones[bone]
        pb.matrix_basis = pb.matrix_basis @ M.Rotation(math.radians(deg), 4, 'X')
    bpy.context.view_layer.update()


def _face_frame(clip):
    """[T1237] 키 클립 — 판마다 몸 방향 · 가운데를 쉬는 자세의 것으로(키에 구운 돌림의 나머지)."""
    fr = clip.get("faceRef")
    if not fr:
        return
    A, B, h_r, c_r = fr
    h, cc = mg.heading(ARM, A, B, (fx, fy), ARM_BASE)
    ARM.matrix_basis = M.Translation(c_r) @ M.Rotation(h_r - h, 4, 'Z') @ M.Translation(-cc) @ ARM_BASE


def pose(clip, fi):
    if ARM is None:
        return
    if clip.get("keyed"):                                      # [T1237] 키 클립 — 키 자세 사이를 보간
        t, ks, kp = clip["times"][fi], clip["keyed"], clip["kposes"]
        i = max(j for j in range(len(ks)) if ks[j][2] <= t + 1e-9)
        mats = kp[-1] if i >= len(ks) - 1 else _lerp_pose(kp[i], kp[i + 1], (t - ks[i][2]) / (ks[i + 1][2] - ks[i][2]))
        ARM.matrix_basis = ARM_BASE
        _set_pose(mats)
        _bend(clip["key"])
        _face_frame(clip)
        return
    if clip["action"] is None:
        return
    ARM.matrix_basis = clip["comp"] @ ARM_BASE if clip.get("comp") is not None else ARM_BASE   # [T1210] 몸 돌림은 모델 공간에서(왼쪽 곱)
    _rest_bones()                                                # [T1237] 앞 클립의 손 자세가 키 없는 뼈에 남지 않게
    mg.set_time(ARM, bpy.data.actions[clip["action"]], clip["times"][fi], wrap=clip["loop"])
    if clip["key"] in OPT["bend"]:                            # [T1237] 동작 위에 굽힘(풀 뜯기 = 서기 + 목 숙임)
        _set_pose({pb.name: pb.matrix_basis.copy() for pb in ARM.pose.bones})
        _bend(clip["key"])


if ARM is not None:
    _keyed_face()


def set_dir(d):
    root.rotation_euler = (0.0, 0.0, d * (2 * math.pi / DIRS))
    bpy.context.view_layer.update()


def screen_box(objs):
    dg = bpy.context.evaluated_depsgraph_get()
    u0 = w0 = 1e18; u1 = w1 = -1e18
    for o in objs:
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        mw = eo.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            u = p.dot(rc.RHAT) * P
            w = -p.dot(rc.UHAT) * P
            if u < u0: u0 = u
            if u > u1: u1 = u
            if w < w0: w0 = w
            if w > w1: w1 = w
        eo.to_mesh_clear()
    return u0, u1, w0, w1


def render_rgba(path_tmp, res_w, res_h, ortho, ctr):
    scene.render.resolution_x = res_w; scene.render.resolution_y = res_h
    cam_d.ortho_scale = ortho
    tgt.location = ctr
    cam.location = ctr + rc.NHAT * 300.0
    scene.render.filepath = path_tmp
    bpy.ops.render.render(write_still=True)
    rc._post_png(path_tmp, ss=SS, flip=True)          # 초과표본 되돌리기(알파 가중) + 게임 손방향 보정
    img = bpy.data.images.load(path_tmp)
    px = list(img.pixels[:]); w, h = img.size
    bpy.data.images.remove(img)
    return px, w, h


TMP = os.path.join(OPT["out"] if not OPT["noSheet"] else
                   (os.path.dirname(os.path.abspath(OPT["preview"])) if OPT["preview"] else os.getcwd()), "_tmp_model.png")
os.makedirs(os.path.dirname(TMP), exist_ok=True)

# ═══════════════ 128px 비교판(--preview) — 한 방향 · 정사각 · 후처리 없음 ═══════════════
if OPT["preview"]:
    pose(CLIPS[0], 0)
    set_dir(OPT["previewDir"])
    u0, u1, w0, w1 = screen_box(MESHES)
    side = 128
    span = max(u1 - u0, w1 - w0) / P * 1.08            # 가장 긴 화면 변 + 4% 여백(두 판이 같은 틀이 되게 원본 기준 상자는 아래 고정 값으로)
    if os.environ.get("T1194_PREVIEW_SPAN"):
        span = float(os.environ["T1194_PREVIEW_SPAN"])
    ctr = rc.RHAT * ((u0 + u1) * 0.5 / P) + rc.UHAT * (-(w0 + w1) * 0.5 / P)
    if os.environ.get("T1194_PREVIEW_CTR"):
        a, b = (float(t) for t in os.environ["T1194_PREVIEW_CTR"].split(","))
        ctr = rc.RHAT * a + rc.UHAT * b
    px, w, h = render_rgba(TMP, side * SS, side * SS, span, ctr)
    rc.save_png(px, w, h, OPT["preview"])
    print(f"[model] 비교판 {OPT['preview']} · {w}x{h} · 틀 {span:.4f} m · 가운데 ({ctr.dot(rc.RHAT):.4f},{-ctr.dot(rc.UHAT):.4f})"
          f" · T1194_PREVIEW_SPAN={span:.6f} T1194_PREVIEW_CTR={ctr.dot(rc.RHAT):.6f},{ctr.dot(rc.UHAT):.6f}")

if OPT["noSheet"]:
    if os.path.exists(TMP): os.remove(TMP)
    raise SystemExit(0)

# ═══════════════ 공유 프레임 상자 ═══════════════
UMIN = WMIN = 1e18; UMAX = WMAX = -1e18
for c in CLIPS:
    for d in range(DIRS):
        for fi in range(c["frames"]):
            pose(c, fi); set_dir(d)
            a, b, c2, d2 = screen_box(MESHES)
            UMIN = min(UMIN, a); UMAX = max(UMAX, b); WMIN = min(WMIN, c2); WMAX = max(WMAX, d2)


def _ceil_ss(v):
    n = int(math.ceil(v)) + MARGIN * 2
    return ((n + SS - 1) // SS) * SS


FW, FH = _ceil_ss(UMAX - UMIN), _ceil_ss(WMAX - WMIN)
ANCH_X = FW / 2.0 - (UMIN + UMAX) * 0.5
ANCH_Y = FH / 2.0 - (WMIN + WMAX) * 0.5
CU, CW = (UMIN + UMAX) * 0.5, (WMIN + WMAX) * 0.5
META_PATH = os.path.join(OPT["out"], f"{OPT['name']}_meta.json")
_pin = rc.read_pinned_box(META_PATH, scale=SS) if os.environ.get("T1194_BOXPIN", "1") != "0" else None
if _pin:
    FW, FH, ANCH_X, ANCH_Y, CU, CW = rc.fit_pinned_box(_pin, UMIN, UMAX, WMIN, WMAX, label=OPT["name"])
CTR = rc.RHAT * (CU / P) + rc.UHAT * (-CW / P)
print(f"[model] 프레임 {FW // SS}x{FH // SS}px · 앵커 ({ANCH_X / SS:.2f},{ANCH_Y / SS:.2f}) · 상자 u[{UMIN:.1f},{UMAX:.1f}] w[{WMIN:.1f},{WMAX:.1f}]")

# ═══════════════ 시트 굽기 ═══════════════
_char = json.load(open(os.path.join(ROOT, "public", "assets", "char", "char_meta.json")))
SHAPE = {k: _char["shape"][k] for k in ("inkPx", "celBands", "edgeA", "edgeK")}   # 사람 시트의 붓 그대로(읽기만)
TW, TH = FW // SS, FH // SS
built = []
for c in CLIPS:
    n = c["frames"]
    SW, SH = TW * n, TH * DIRS
    sheet = [0.0] * (SW * SH * 4)
    for d in range(DIRS):
        for fi in range(n):
            pose(c, fi); set_dir(d)
            px, w, h = render_rgba(TMP, FW, FH, FW / P, CTR)
            ty = (DIRS - 1 - d) * TH                  # 행 0 = 방향 0(위에서 아래) — 블렌더 이미지는 아래가 0행
            for y in range(h):
                s0 = y * w * 4
                d0 = ((ty + y) * SW + fi * TW) * 4
                sheet[d0:d0 + w * 4] = px[s0:s0 + w * 4]
    built.append((c, sheet, SW, SH))
if os.path.exists(TMP):
    os.remove(TMP)
for c, sheet, SW, SH in built:
    if OPT["raw"]:
        rc.save_png(list(sheet), SW, SH, OPT["raw"])  # 후처리 앞 원본(비교판용)
    rc.post_all([("body", sheet)], SW, SH, silhouette=set(), partner_of={}, alpha_of=lambda _n: None,
                ink_px=SHAPE["inkPx"], cel_bands=SHAPE["celBands"], edge_a=SHAPE["edgeA"], edge_k=SHAPE["edgeK"])
    rc.save_png(sheet, SW, SH, os.path.join(OPT["out"], f"body_{c['key']}.png"))
    print(f"[model] body_{c['key']}.png {SW}x{SH}")
# [T1237 · T1210 회부 7] 시트 옆 같은 화소 무손실 webp 쌍둥이(T1131 — 매니페스트가 webp 주소를 낸다) — png 만 새로 굽고 쌍둥이를 안 다시 쓰면
#   낡은 webp 가 배포에 남는다(T1131 `asset-lock` 규약) ⇒ 굽기가 같은 자리에서 다시 쓴다(실패는 삼키지 않는다 — `webp_twins.run`).
import webp_twins
webp_twins.run([os.path.join(OPT["out"], f"body_{c['key']}.png") for c, _s, _w, _h in built])

# ═══════════════ 메타(사람 `char_meta.json` 문법) · 분류 목록 ═══════════════
META = {
    "_": "model_render.py 산물 — 손편집 금지. 규약은 그 파일이 정본(사람 시트 char_meta.json 과 같은 문법).",
    "ss": SS, "ppu": round(PPU0, 4), "renderPpu": round(P, 4), "zsq": round(rc.ZSQ, 5),
    "pxPerMeterH": round(PPU0 * rc.ZSQ * math.cos(math.radians(30.0)), 4),
    "frameW": TW, "frameH": TH, "anchorX": round(ANCH_X / SS, 3), "anchorY": round(ANCH_Y / SS, 3),
    "dirs": DIRS,
    "dirOrder": "d = round(atan2(fy,fx)/(PI/4)) mod 8 — 월드 방향. d=0 은 +x(동).",
    "rowOrder": "행 0 = 방향 0, 위에서 아래로. 열 = 프레임 0..n-1, 왼쪽에서 오른쪽으로.",
    "heightM": round(HGT_M, 4), "lengthM": round(LEN_M, 4), "widthM": round(WID_M, 4),
    "clips": {c["key"]: dict({"frames": c["frames"], "loop": c["loop"], "fps": c["fps"]},
                             **({"durS": round(c["dur"], 4), "srcS": [[round(a, 4), round(b, 4)] for a, b in c["segs"]]} if c.get("segs") else {}),
                             **({"durS": round(c["dur"], 4), "keys": [[k[0], round(k[1], 4), round(k[2], 4)] for k in c["keyed"]]} if c.get("keyed") else {}),   # [T1237] 키 클립
                             **({"bend": [[b, d] for b, d in OPT["bend"][c["key"]]]} if c["key"] in OPT["bend"] else {}),
                             **(c.get("gait") or {}), **({"face": c["face"]} if c.get("face") else {}),
                             **({"cycle": {"k": c["cycle"]["k"], "periodS": round(c["cycle"]["P"], 4), "seamCm": round(c["cycle"]["seam"] * S * 100, 2)}}
                                if c.get("cycle") else {}))
              for c in CLIPS},
    "layers": ["body"],
    "sheets": {f"body_{c['key']}": {"w": SW, "h": SH, "cols": c["frames"], "rows": DIRS, "layer": "body", "clip": c["key"]}
               for c, _s, SW, SH in built},
    "shape": dict(SHAPE, src="public/assets/char/char_meta.json shape(사람 시트와 같은 붓)"),
    "source": {"file": os.path.basename(OPT["model"]), "md5": mc.md5(OPT["model"]), "bytes": os.path.getsize(OPT["model"]),
               "variant": VARIANT, "tris": TRIS, "srcTris": SRC_TRIS, "front": FRONT, "frontSrc": FRONT_SRC,
               "scale": round(S, 6), "sizeSrc": SIZE_SRC, "bones": sum(len(a.data.bones) for a in ARMS),
               "actions": {c["key"]: c["action"] for c in CLIPS if c["action"]}, "bpy": bpy.app.version_string,
               **({"anims": {k: v[1] for k, v in ANIMS.items()}} if ANIMS else {})},
    **({"species": OPT["species"]} if OPT["species"] else {}),
}
os.makedirs(OPT["out"], exist_ok=True)
with open(META_PATH, "w", encoding="utf-8") as f:
    json.dump(META, f, ensure_ascii=False, indent=1, sort_keys=True)
print("[model] 메타:", META_PATH)

# 분류 목록 — 디스크를 훑어 세운다(한 종만 다시 구워도 다른 종이 안 사라진다 · 사람 `rebuild_sheets` 와 같은 까닭)
cls_dir = os.path.dirname(os.path.abspath(OPT["out"]))
idx = {"_": "model_render.py 산물 — 종 키 → 메타 경로(이 폴더 기준). 클라는 손잡이 T1194_MODEL_SPRITES(미리보기 · 모든 종) 또는 T1237_WATER_DEER(고라니)가 켜졌을 때만 읽는다."}
for nm in sorted(os.listdir(cls_dir)):
    mp = os.path.join(cls_dir, nm, f"{nm}_meta.json")
    if os.path.isdir(os.path.join(cls_dir, nm)) and os.path.exists(mp):
        key = json.load(open(mp, encoding="utf-8")).get("species") or nm   # [T1210] 메타의 게임 칸(`--species`) — 없으면 폴더 이름(종전)
        if key in idx:
            raise SystemExit(f"[model] 목록: 게임 칸 '{key}' 에 시트가 둘이다({idx[key]} · {nm}) — 하나만 둔다")
        idx[key] = f"{nm}/{nm}_meta.json"
with open(os.path.join(cls_dir, "index.json"), "w", encoding="utf-8") as f:
    json.dump(idx, f, ensure_ascii=False, indent=1, sort_keys=True)
print("[model] 목록:", os.path.join(cls_dir, "index.json"), [k for k in idx if k != "_"])
