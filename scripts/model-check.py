#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/model-check.py — 손으로 만든 3D 모델 받는 규격 검사기 [T1194 · ★재민 11-06]
#
# ★왜 있나: 외부 협력자(GitHub `euhhong`)가 모델을 보낸다(첫 PR #77 = FBX 셋). 굽기 도구
#   (`scripts/*_render.py`)는 코드로 만든 모델만 읽었고, 받은 파일이 쓸 만한지 볼 자가 없었다.
#   이 파일은 모델 하나(또는 여럿)를 블렌더로 열어 **받는 규격**(아래 `SPEC` — 협력자 안내
#   `assets-src/models/README.md` 와 같은 수)에 맞는지 항목마다 표로 낸다. 판정은 규격 그대로 — 새 기준 0.
#
# ★검사 항목(12) — `ITEMS` 차례가 표의 차례다:
#    1 형식        .glb(.gltf) 권장 · fbx/obj/blend 는 받되 경고
#    2 파일 크기   한 파일 25 MB 밑(깃허브 웹 올리기 한도 · git 기록에 영원히 남는다)
#    3 면 수       삼각형 2만 안팎(3만 넘으면 빠짐) — 도구에서 면 수를 정해 다시 뽑기
#    4 텍스처 크기 가장 긴 변 2048 이하
#    5 텍스처 동봉 모델 안에 들었거나(glb · 내장) 같은 폴더에 있다
#    6 UV          텍스처를 입히는 메시에 UV 가 있다
#    7 뼈대        동물 · 사람(분류 animals · char)은 뼈 1 개 이상
#    8 동작        동물 · 사람은 서 있기 · 걷기 · 뛰기 · 먹기 · 쓰러지기 다섯(이름표 `ACTIONS`)
#    9 크기(m)     실제 크기 — 가장 긴 변이 정확히 1.000(정규화) 이면서 `출처.txt` 에 크기가 없으면 빠짐
#   10 앞 방향     `출처.txt` 의 `앞:` 줄(+X −X +Y −Y) — 없으면 +Y 로 본다(경고 · 사람 확인)
#   11 바닥 · 위   블렌더로 가져온 뒤 위 = +Z · 가장 낮은 점이 z = 0(±1 cm)
#   12 출처.txt    같은 폴더 · 만든 사람 · 만든 도구 · 쓰임 조건 세 줄
#
# 실행: blender --background --factory-startup --python scripts/model-check.py -- <모델>… [--class=animals] [--json=<파일>]
#   모델이 여럿이면 열마다 한 파일인 표 하나를 더 낸다(PR 한 번에 온 묶음을 한눈에).
#   ⚠우분투 apt 블렌더(4.0.2)의 FBX 가져오기는 numpy 가 필요하다 — `apt-get install -y python3-numpy`.
# =============================================================================

import bpy, os, sys, json, math, hashlib

# ═══════════════ 받는 규격 — 한 곳(협력자 안내 README 와 같은 수 · 하네스가 둘을 견준다) ═══════════════
SPEC = {
    "formatsBest": [".glb", ".gltf"],
    "formatsTaken": [".fbx", ".obj", ".blend"],
    "fileMbMax": 25,
    "trisTarget": 20000,
    "trisMax": 30000,
    "texMax": 2048,
    "animClasses": ["animals", "char"],
    "normTol": 0.005,       # 가장 긴 변이 1 ± 0.5% 면 "정규화(1 로 맞춘 크기)" 로 본다
    "groundTolM": 0.01,
}
# 동작 이름표 — 영어 이름이 정본 · 한글 이름도 받는다(대소문자 · 띄어쓰기 무시 · 앞뒤 붙은 말은 '|' 뒤만 본다)
ACTIONS = {
    "idle": ["idle", "stand", "서기", "서있기", "서 있기"],
    "walk": ["walk", "걷기"],
    "run": ["run", "뛰기", "달리기"],
    "eat": ["eat", "graze", "먹기"],
    "die": ["die", "death", "dead", "쓰러지기", "죽기"],
}
FRONTS = {"+x": (1, 0), "-x": (-1, 0), "+y": (0, 1), "-y": (0, -1)}
ITEMS = ["형식", "파일 크기", "면 수", "텍스처 크기", "텍스처 동봉", "UV", "뼈대", "동작", "크기(m)", "앞 방향", "바닥 · 위", "출처.txt"]


def _args():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    files, opt = [], {"class": None, "json": None}
    for x in a:
        if x.startswith("--class="):
            opt["class"] = x.split("=", 1)[1]
        elif x.startswith("--json="):
            opt["json"] = x.split("=", 1)[1]
        else:
            files.append(x)
    return files, opt


def read_source_txt(model_path):
    """같은 폴더의 `출처.txt` — `키: 값` 줄. 없으면 None."""
    p = os.path.join(os.path.dirname(os.path.abspath(model_path)), "출처.txt")
    if not os.path.exists(p):
        return None
    out = {}
    with open(p, encoding="utf-8") as f:
        for ln in f:
            if ":" not in ln:
                continue
            k, v = ln.split(":", 1)
            k, v = k.strip(), v.split("#", 1)[0].strip()
            if k and v and not v.startswith("("):     # 안내 괄호만 남은 빈칸은 안 쓴 것으로 본다
                out[k] = v
    return out


def parse_front(s):
    if not s:
        return None
    t = s.replace("−", "-").replace(" ", "").lower()[:2]
    return t if t in FRONTS else None


def parse_size(s):
    """`크기:` 줄에서 첫 수(m) — '몸길이 1.45 m' · '1.45m' · '145 cm'. 없으면 None."""
    if not s:
        return None
    import re
    m = re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(cm|m)\b", s)
    if not m:
        return None
    v = float(m.group(1))
    return v / 100.0 if m.group(2) == "cm" else v


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_model(path):
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=path)
    elif ext == ".blend":
        with bpy.data.libraries.load(path, link=False) as (src, dst):
            dst.objects = list(src.objects)
        for o in dst.objects:
            if o is not None:
                bpy.context.scene.collection.objects.link(o)
    else:
        raise SystemExit(f"[model-check] 모르는 형식: {ext}")
    new = [o for o in bpy.data.objects if o not in before]
    # 뼈 모양 표시물(glTF 가져오기가 뼈마다 붙이는 Icosphere 같은 것)은 모델이 아니다 — 뼈의 custom_shape 로 쓰이는 물체는 빼고 그리지도 않는다
    shapes = {pb.custom_shape for a in new if a.type == 'ARMATURE' for pb in a.pose.bones if pb.custom_shape}
    for o in shapes:
        o.hide_render = True
    return [o for o in new if o not in shapes]


def rest_pose(objs, on=True):
    """뼈대가 있으면 **쉬는 자세**에서 잰다(크기 · 바닥은 동작의 한 판이 아니라 모델 그 자체의 값). 돌려주는 값을 다시 주면 되돌린다."""
    keep = {}
    for o in objs:
        if o.type == 'ARMATURE':
            keep[o.name] = o.data.pose_position
            o.data.pose_position = 'REST' if on is True else on.get(o.name, 'POSE')
    bpy.context.view_layer.update()
    return keep


def mesh_stats(objs):
    _keep = rest_pose(objs)
    dg = bpy.context.evaluated_depsgraph_get()
    tris = polys = verts = 0
    lo = [1e18] * 3
    hi = [-1e18] * 3
    no_uv = []
    for o in objs:
        if o.type != 'MESH':
            continue
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        polys += len(me.polygons)
        verts += len(me.vertices)
        tris += sum(len(p.vertices) - 2 for p in me.polygons)
        mw = eo.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            for i in range(3):
                if p[i] < lo[i]: lo[i] = p[i]
                if p[i] > hi[i]: hi[i] = p[i]
        uses_tex = any(m and m.use_nodes and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes) for m in o.data.materials)
        if uses_tex and len(me.uv_layers) == 0:
            no_uv.append(o.name)
        eo.to_mesh_clear()
    dims = [hi[i] - lo[i] for i in range(3)] if tris else [0, 0, 0]
    rest_pose(objs, _keep)
    return {"tris": tris, "polys": polys, "verts": verts, "min": lo, "max": hi, "dims": dims, "noUv": no_uv}


def textures_of(objs):
    seen, out = set(), []
    for o in objs:
        if o.type != 'MESH':
            continue
        for m in o.data.materials:
            if not (m and m.use_nodes):
                continue
            for n in m.node_tree.nodes:
                if n.type == 'TEX_IMAGE' and n.image and n.image.name not in seen:
                    im = n.image
                    seen.add(im.name)
                    fp = bpy.path.abspath(im.filepath) if im.filepath else ""
                    out.append({"name": im.name, "w": im.size[0], "h": im.size[1], "packed": im.packed_file is not None,
                                "onDisk": bool(fp) and os.path.exists(fp), "colorspace": im.colorspace_settings.name})
    return out


def action_names():
    names = [a.name for a in bpy.data.actions]
    found = {}
    for key, aliases in ACTIONS.items():
        al = [x.replace(" ", "").lower() for x in aliases]
        for nm in names:
            t = nm.split("|")[-1].replace(" ", "").lower()
            if t in al or any(t.startswith(x) or t.endswith(x) for x in al):
                found[key] = nm
                break
    return names, found


def md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def check(path, cls):
    clear()
    objs = import_model(path)
    st = mesh_stats(objs)
    tex = textures_of(objs)
    bones = sum(len(o.data.bones) for o in objs if o.type == 'ARMATURE')
    acts, found = action_names()
    src = read_source_txt(path)
    ext = os.path.splitext(path)[1].lower()
    mb = os.path.getsize(path) / 1e6          # 10⁶ 바이트 — 깃허브 웹 올리기 한도와 같은 자
    rows = []

    def row(item, value, spec, verdict):
        rows.append({"item": item, "value": value, "spec": spec, "verdict": verdict})

    # 1 형식
    row("형식", ext.lstrip("."), ".glb 권장", "통과" if ext in SPEC["formatsBest"] else ("경고" if ext in SPEC["formatsTaken"] else "빠짐"))
    # 2 파일 크기
    row("파일 크기", f"{mb:.1f} MB", f"≤ {SPEC['fileMbMax']} MB", "통과" if mb <= SPEC["fileMbMax"] else "빠짐")
    # 3 면 수
    row("면 수", f"삼각형 {st['tris']:,}", f"{SPEC['trisTarget']:,} 안팎(≤ {SPEC['trisMax']:,})", "통과" if 0 < st["tris"] <= SPEC["trisMax"] else "빠짐")
    # 4 텍스처 크기
    tmax = max([max(t["w"], t["h"]) for t in tex] or [0])
    row("텍스처 크기", " · ".join(f"{t['name']} {t['w']}²" if t["w"] == t["h"] else f"{t['name']} {t['w']}×{t['h']}" for t in tex) or "없음",
        f"≤ {SPEC['texMax']}", "통과" if tex and tmax <= SPEC["texMax"] else ("빠짐" if tex else "경고"))
    # 5 텍스처 동봉
    lost = [t["name"] for t in tex if not (t["packed"] or t["onDisk"])]
    row("텍스처 동봉", ("내장 " + str(sum(1 for t in tex if t["packed"])) + " · 파일 " + str(sum(1 for t in tex if t["onDisk"] and not t["packed"]))) if tex else "없음",
        "모델 안 또는 같은 폴더", "통과" if tex and not lost else ("빠짐" if lost else "경고"))
    # 6 UV
    row("UV", "없음: " + ", ".join(st["noUv"]) if st["noUv"] else "있음", "텍스처 메시마다", "빠짐" if st["noUv"] else "통과")
    # 7 뼈대 · 8 동작
    need_anim = (cls or "") in SPEC["animClasses"]
    row("뼈대", f"뼈 {bones}", "1 이상(동물 · 사람)" if need_anim else "—", ("통과" if bones > 0 else "빠짐") if need_anim else "—")
    miss = [k for k in ACTIONS if k not in found]
    row("동작", (", ".join(acts) if acts else "0"), "idle · walk · run · eat · die" if need_anim else "—",
        ("통과" if not miss else "빠짐") if need_anim else "—")
    # 9 크기(m)
    dims = st["dims"]
    longest = max(dims[0], dims[1]) if st["tris"] else 0.0
    normed = abs(longest - 1.0) <= SPEC["normTol"] or abs(max(dims) - 1.0) <= SPEC["normTol"]
    size_txt = parse_size(src.get("크기") if src else None)
    row("크기(m)", f"{dims[0]:.3f} × {dims[1]:.3f} × {dims[2]:.3f}" + (" (정규화로 보임)" if normed else "") + (f" · 출처 {size_txt} m" if size_txt else ""),
        "실제 미터 또는 출처.txt 크기", "빠짐" if (normed and not size_txt) else "통과")
    # 10 앞 방향
    fr = parse_front(src.get("앞") if src else None)
    row("앞 방향", fr if fr else "적힘 없음(+Y 로 본다)", "+Y 또는 출처.txt '앞:'", "통과" if fr else "경고")
    # 11 바닥 · 위
    minz = st["min"][2] if st["tris"] else 0.0
    row("바닥 · 위", f"위 +Z · 최저 z {minz:+.3f} m", f"최저 z = 0 ± {SPEC['groundTolM']} m", "통과" if abs(minz) <= SPEC["groundTolM"] else "경고")
    # 12 출처.txt
    need = ["만든 사람", "만든 도구", "쓰임 조건"]
    if src is None:
        row("출처.txt", "없음", "만든 사람 · 만든 도구 · 쓰임 조건", "빠짐")
    else:
        lack = [k for k in need if k not in src]
        row("출처.txt", "있음" + (" · 빠진 줄 " + ", ".join(lack) if lack else ""), "만든 사람 · 만든 도구 · 쓰임 조건", "빠짐" if lack else "통과")
    assert [r["item"] for r in rows] == ITEMS
    fails = [r["item"] for r in rows if r["verdict"] == "빠짐"]
    return {"file": os.path.basename(path), "path": os.path.abspath(path), "md5": md5(path), "bytes": os.path.getsize(path),
            "class": cls, "rows": rows, "pass": not fails, "missing": fails,
            "stats": {"tris": st["tris"], "polys": st["polys"], "verts": st["verts"], "dims": [round(x, 4) for x in dims],
                      "minZ": round(minz, 4), "bones": bones, "actions": acts, "actionsFound": found, "textures": tex,
                      "front": fr, "sizeM": size_txt, "normalized": normed, "source": src}}


def table_one(r):
    out = [f"### {r['file']}  (md5 {r['md5'][:8]} · {'통과' if r['pass'] else '빠짐 ' + str(len(r['missing']))})", "",
           "| # | 항목 | 값 | 규격 | 판정 |", "|---|---|---|---|---|"]
    for i, x in enumerate(r["rows"], 1):
        out.append(f"| {i} | {x['item']} | {x['value']} | {x['spec']} | {x['verdict']} |")
    return "\n".join(out)


def table_many(R):
    head = "| # | 항목 | 규격 | " + " | ".join(r["file"] for r in R) + " |"
    out = [head, "|---|---|---|" + "---|" * len(R)]
    for i, item in enumerate(ITEMS):
        spec = R[0]["rows"][i]["spec"]
        out.append(f"| {i + 1} | {item} | {spec} | " + " | ".join(f"{r['rows'][i]['verdict']} — {r['rows'][i]['value']}" for r in R) + " |")
    out.append("| | **통과** | | " + " | ".join(("**통과**" if r["pass"] else f"빠짐 {len(r['missing'])}") for r in R) + " |")
    return "\n".join(out)


if __name__ == "__main__":
    files, opt = _args()
    if not files:
        raise SystemExit("쓰는 법: blender --background --factory-startup --python scripts/model-check.py -- <모델>… [--class=animals] [--json=<파일>]")
    R = [check(f, opt["class"]) for f in files]
    print("\n[model-check] 받는 규격 검사 — 항목 %d" % len(ITEMS))
    for r in R:
        print(table_one(r))
        print()
    if len(R) > 1:
        print(table_many(R))
    npass = sum(1 for r in R if r["pass"])
    print(f"\n[model-check] 통과 {npass} / {len(R)}")
    if opt["json"]:
        with open(opt["json"], "w", encoding="utf-8") as f:
            json.dump({"spec": SPEC, "items": ITEMS, "results": R}, f, ensure_ascii=False, indent=1)
        print("[model-check] JSON:", opt["json"])
