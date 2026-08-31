#!/usr/bin/env blender --background --python
# =============================================================================
# scripts/char_render.py — 플레이어 캐릭터 스프라이트시트 [재민 확정 2026-08-30]
#
# ★계보: `nature_render.py` · `building_render.py` 와 **같은 씬 정본**이다 —
#   Cycles · film_transparent · ORTHO · SAMPLES 64 · view_transform Standard ·
#   태양 52°/−35° energy 3.6 · 월드 (0.52,0.56,0.6)@0.55 · PPU0 45.255 · ZSQ 0.8165 ·
#   **좌우 FLIP**. 그림이 한 몸이어야 하므로 이 값들을 여기서 바꾸지 마라.
#
# ★★재민 확정: **게임엔 3D 가 아니라 스프라이트로 들어간다**(좀보이드 구빌드·디아블로 방식).
#   Blender 는 **굽는 기계**일 뿐이고 런타임엔 PNG 시트와 메타 JSON 만 간다.
#
# ═══ 이 파일이 정본이다 ═══
#   `assets-src/char_body.blend` 는 이 스크립트가 **써 내는 산물**이다(재민이 열어 보라고 남긴다).
#   .blend 를 손으로 고쳐도 다음 렌더가 덮는다. **모양을 바꾸려면 이 파일을 고쳐라.**
#   (자연물·건물 자산이 전부 .py 정본인 그 규약 그대로. 손편집 금지 캐논 동형.)
#
# ═══ 소체 조형 [재민 확정 2026-08-31 — 「직육면체로만 만든 거 아냐?」] ═══
#   1차(08-30)는 몸 전체가 테이퍼 직육면체 25개·플랫 셰이딩이었다. 실측해 보니 이 레포에서
#   **곡면 프리미티브가 0개소인 자산 스크립트는 여기뿐**이었다(nature 3 · building 10 ·
#   bridge 7 · crop 2 · icon 12 개소). "기존 자연물과 같은 급"을 폴리곤 수로만 읽고
#   **표면 문법을 안 맞춘 것**이다. 그래서 2차에서:
#     · 팔·다리·몸통·옷·자루 → n각 프리즘(옆면 스무스 · 뚜껑 플랫)
#     · 머리·머리칼·손·관절(어깨·팔꿈치·무릎) → 타원체(전면 스무스)
#     · 짚신·돌도끼날 → 상자 유지(각진 물건이라 그게 맞다)
#   폴리곤은 200 → 1300 정점으로 늘었지만 **비용은 사실상 0**이다 — 어차피 PNG 로 굽고
#   Cycles 비용은 샘플링이 지배한다(전 클립 굽는 시간 변화 측정치는 인계 문서에).
#
# ═══ 진짜 천장은 폴리곤이 아니라 화소다 ═══
#   키 54.4px · **머리 7px** · 어깨 폭 ~10px. 이 크기에서 조형을 더 정교하게 해도
#   화소가 없다. 그래서 비례 손잡이(HEAD_K 등)를 열어 두되 **기본은 1.0(고증 비례)**이고,
#   과장안은 재민 판정 대기다(회부 문서 B-8).
#
# ═══ 리그 ═══
#   단순 휴머노이드 아마추어 12본 + **강체 웨이팅**(파트마다 정점 100% 를 본 하나에).
#   ★자동 웨이트(automatic weights)를 안 쓴다 — 54px 스프라이트에서 스킨 품질은 안 보이고,
#     자동 웨이트는 헤드리스에서 결과가 흔들린다(결정론 계약 위반). 강체는 두 계약을 다 지킨다.
#
# ═══ 레이어 분리 = 착장의 답 ═══
#   같은 리그·같은 카메라·같은 프레임에서 ⓐ몸 ⓑ옷 ⓒ손도구를 **따로** 굽는다.
#   ★픽셀 정렬이 계약이다: 모든 레이어가 **같은 프레임 박스**(아래 공유 bbox)를 쓰므로
#     런타임은 그냥 같은 자리에 겹쳐 그리면 된다(오프셋 계산 없음 · 어긋남 0px).
#
# ═══ 공유 프레임 박스 ═══
#   ★자연물 `render()` 는 개체마다 bbox 에 딱 맞춰 자른다. 애니에 그러면 **프레임마다 상자가 달라져
#     스프라이트가 덜덜 떤다.** 그래서 여기선 **모든 클립×모든 방향×모든 프레임×모든 레이어**의
#     화면 bbox 합집합을 한 번 재고, 그 하나의 상자·하나의 앵커로 전부 굽는다.
#   앵커 = 지면 원점(0,0,0)의 픽셀 = **발밑**. 클라는 발밑을 캐릭터 좌표에 맞춘다.
#
# 실행: blender --background --python scripts/char_render.py -- [클립…]
#       (인자 없으면 전 클립. `--only-meta` 는 굽지 않고 상자·메타만 계산)
# =============================================================================

import bpy, os, math, json, sys, mathutils

V = mathutils.Vector

SAMPLES = 64
PPU0 = 64.0 / math.sqrt(2.0)                          # px/미터(=1셀). 셀 다이아 가로 64px
ZSQ = 32.0 / (PPU0 * math.cos(math.radians(30.0)))    # 높이 압축 0.8165 — 1m 높이 = 32px
SS = 3                                                # 슈퍼샘플(소품 급) — 메타에 ppu 를 적어 클라가 되돌린다
MARGIN = 3                                            # 공유 상자 여백(px, 슈퍼샘플 좌표계)

# ── 조형 손잡이 [이번 배치 신설] ────────────────────────────────────────────
SEG = 14          # 팔·다리·몸통 프리즘의 각 수. 54px 에선 12 이상이면 실루엣이 매끈하다
RINGS = 8         # 타원체(머리·손·관절)의 위도 분할

# ── 실루엣 강화 [이번 배치 신설 · 재민 선택] ────────────────────────────────
#   ★조명은 자산 정본이라 **못 건드린다**(태양 52°/−35°). 그래서 대비는 **후처리**로 준다:
#     실루엣 안쪽 한 겹(불투명이면서 이웃이 비어 있는 화소)의 RGB 를 EDGE_K 배로 낮춘다.
#   ★반투명(안티에일리어싱) 화소는 **건드리지 않는다** — 거기를 어둡게 하면 프린지가 되고,
#     그건 test-charsheet ④ 가 잡는 바로 그 증상이다.
EDGE_K = 0.78     # 1.0 = 끔. 0.78 = 은은한 자체 아웃라인(기존 자연물엔 아웃라인이 없다 — 세기 판정은 재민)
EDGE_A = 0.60     # "불투명" 문턱(알파)

# ── 비례 손잡이 [이번 배치 신설 · 기본 1.0 = 고증 비례 무변경] ──────────────
#   ★54px 에서 머리는 7px 다. 좀보이드·디아블로가 머리·손발을 키우는 건 사실성을 버려서가
#     아니라 그 크기에서 "사람으로 읽히게" 하는 유일한 길이 과장이기 때문이다.
#   ★기본값을 1.0 으로 둔다 — 과장은 **고증보다 가독성을 택하는 판단**이라 재민 몫이다.
HEAD_K = 1.0      # 머리·머리칼 크기 배수
SHLD_K = 1.0      # 어깨 반폭 배수
LIMB_K = 1.0      # 팔·다리 굵기 배수(길이는 안 건드린다 — 키가 변하면 축척 캐논이 흔들린다)
HAND_K = 1.0      # 손·발 크기 배수

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUTDIR = os.path.join(HERE, "char_renders")           # .gitignore (배치 19~21 산출물 규약)
SHEETDIR = os.path.join(ROOT, "public", "assets", "char")
BLENDOUT = os.path.join(ROOT, "assets-src", "char_body.blend")
os.makedirs(OUTDIR, exist_ok=True)
os.makedirs(SHEETDIR, exist_ok=True)

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ONLY_META = "--only-meta" in ARGS
RAWDUMP = "--rawdump" in ARGS      # 실루엣 강화 전 시트를 OUTDIR 에 남긴다(세기 비교용)
CLIP_FILTER = set(a for a in ARGS if not a.startswith("--")) or None

DIRS = 8   # 8방향. 16방향은 회부(연속 페이싱 재론과 함께)

# ═══════════════ 클립 정의 ═══════════════
#   loop=True 면 시작=끝 정합(루프 튐 금지)을 위해 프레임을 [0,1) 위상으로 만든다.
CLIPS = [
    ("idle",  4,  True,  0.90),   # (이름, 프레임수, 루프, 초당 재생 배속 기준 fps)
    ("walk",  8,  True,  10.0),
    ("run",   8,  True,  14.0),
    ("swing", 6,  False, 14.0),   # 원샷 — 끝나면 이전 상태 복귀
    ("aim",   2,  True,  2.0),
]

# ═══════════════ 씬 정본 (nature_render.py 와 동일 — 바꾸지 마라) ═══════════════
scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
try:
    scene.cycles.use_denoising = bool(scene.cycles.denoiser)
except Exception:
    scene.cycles.use_denoising = False
try:
    scene.view_settings.view_transform = 'Standard'
except Exception:
    pass
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.filter_size = 1.2

world = bpy.data.worlds.new("W")
scene.world = world
world.use_nodes = True
_bg = world.node_tree.nodes.get("Background")
if _bg:
    _bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0)
    _bg.inputs[1].default_value = 0.55

sun_d = bpy.data.lights.new("Sun", 'SUN')
sun_d.energy = 3.6
sun_d.angle = 0.2
sun = bpy.data.objects.new("Sun", sun_d)
scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35))

tgt = bpy.data.objects.new("Tgt", None)
scene.collection.objects.link(tgt)
cam_d = bpy.data.cameras.new("Cam")
cam_d.type = 'ORTHO'
cam_d.clip_start = 0.1
cam_d.clip_end = 2000
cam = bpy.data.objects.new("Cam", cam_d)
scene.collection.objects.link(cam)
cam.constraints.new('TRACK_TO').target = tgt
scene.camera = cam

THETA = math.radians(30.0)
NHAT = V((math.cos(THETA) / math.sqrt(2), math.cos(THETA) / math.sqrt(2), math.sin(THETA)))
RHAT = V((1.0, -1.0, 0.0)).normalized()
UHAT = V((-math.sin(THETA) / math.sqrt(2), -math.sin(THETA) / math.sqrt(2), math.cos(THETA)))


def _flip_png(path):
    """★좌우 뒤집기 — 자산 정본 규약. 게임 투영은 +x 가 오른쪽인데 Blender 카메라는 반대다."""
    img = bpy.data.images.load(path)
    w, h = img.size
    px = list(img.pixels[:])
    out = [0.0] * len(px)
    for y in range(h):
        row = y * w * 4
        for x in range(w):
            s2 = row + x * 4
            d2 = row + (w - 1 - x) * 4
            out[d2] = px[s2]; out[d2 + 1] = px[s2 + 1]
            out[d2 + 2] = px[s2 + 2]; out[d2 + 3] = px[s2 + 3]
    img.pixels = out
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


# ═══════════════ 재질 ═══════════════
#   ★고증(청동기 후기 송국리): 서민 복장 = **물들이지 않은 삼베**. 화려함 금지 —
#     수수함이 정체성이고, 청동 위세재(무기·거울)의 화려함과 대비되어야 그 축이 산다.
#   ★월드 앰비언트가 청회색(0.52,0.56,0.6)이라 파랑이 들어온다(자연물 배치 실측).
#     식생용 보정(파랑×0.74·초록×1.66)은 초록 전용이므로 그대로 쓰면 안 된다 —
#     여기선 **파랑만 살짝** 눌러 회색빛을 걷는다(아래 `_deblue`).
def _deblue(rgb, k=0.88):
    return (rgb[0], rgb[1], rgb[2] * k)


def mat(name, rgb, rough=0.75, spec=0.15):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    r, g, bl = _deblue(rgb)
    b.inputs["Base Color"].default_value = (r, g, bl, 1.0)
    b.inputs["Roughness"].default_value = rough
    try:
        b.inputs["Specular"].default_value = spec
    except KeyError:
        try:
            b.inputs["Specular IOR Level"].default_value = spec
        except KeyError:
            pass
    return m


M = {
    'skin':  mat("skin",  (0.60, 0.43, 0.31), 0.80, 0.10),   # 볕에 그은 농부 살빛
    'hair':  mat("hair",  (0.085, 0.068, 0.058), 0.85, 0.06),
    'hemp':  mat("hemp",  (0.70, 0.655, 0.545), 0.90, 0.06),  # 물들이지 않은 삼베
    'hemp2': mat("hemp2", (0.60, 0.555, 0.455), 0.90, 0.06),  # 허리끈·단 — 한 톤 어둡게
    'wood':  mat("wood",  (0.36, 0.255, 0.155), 0.85, 0.08),
    'stone': mat("stone", (0.44, 0.44, 0.42), 0.72, 0.14),
    'cord':  mat("cord",  (0.42, 0.36, 0.26), 0.92, 0.05),
    'straw': mat("straw", (0.545, 0.475, 0.335), 0.93, 0.05),  # 짚신
    'eye':   mat("eye",   (0.17, 0.12, 0.10), 0.88, 0.05),     # 눈 띠(_torso_mat 주석 참조)
}

# ═══════════════ 기하 헬퍼 ═══════════════
BODY, CLOTH = [], []
TOOLS = {}    # name -> [objects]
ALLOBJ = []


def box(name, cx, cy, cz, sx, sy, sz, material, bucket, taper=1.0):
    """중심(cx,cy,cz)·치수(sx,sy,sz) 상자. taper<1 이면 윗면이 좁아진다(팔·다리 테이퍼)."""
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    tx, ty = hx * taper, hy * taper
    verts = [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - tx, cy - ty, cz + hz), (cx + tx, cy - ty, cz + hz),
        (cx + tx, cy + ty, cz + hz), (cx - tx, cy + ty, cz + hz),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(material)
    for p in me.polygons:
        p.use_smooth = False
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    bucket.append(ob)
    ALLOBJ.append(ob)
    return ob



def _mkobj(name, verts, faces, material, bucket, smooth_n):
    """faces 앞쪽 smooth_n 장만 스무스. (프리즘은 옆면만, 타원체는 전부)"""
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(material)
    for i, pg in enumerate(me.polygons):
        pg.use_smooth = (i < smooth_n)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    bucket.append(ob)
    ALLOBJ.append(ob)
    return ob


def prism(name, cx, cy, cz, sx, sy, sz, material, bucket, taper=1.0, seg=SEG):
    """타원 단면 프리즘 — 팔·다리·몸통·소매·자루. box() 와 **인자 규약이 같다**
       (sx,sy 는 지름, sz 는 길이, taper<1 이면 윗면이 좁아진다)."""
    hx, hy, hz = sx * 0.5, sy * 0.5, sz * 0.5
    tx, ty = hx * taper, hy * taper
    verts = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        verts.append((cx + hx * math.cos(a), cy + hy * math.sin(a), cz - hz))
    for k in range(seg):
        a = 2 * math.pi * k / seg
        verts.append((cx + tx * math.cos(a), cy + ty * math.sin(a), cz + hz))
    faces = [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
    faces.append(tuple(range(seg - 1, -1, -1)))      # 아랫 뚜껑(플랫)
    faces.append(tuple(range(seg, 2 * seg)))         # 윗 뚜껑(플랫)
    return _mkobj(name, verts, faces, material, bucket, smooth_n=seg)


# ═══════════════ 링 로프트 — **한 장으로 이어진 표면** [재민 확정 2026-08-31 3차] ═══════
#   ★독립 입체를 겹치는 것과 근본이 다르다. 좀보이드(구빌드)·디아블로2·마운트앤블레이드가
#     공통으로 쓴 구조가 이것이다 — **발끝에서 정수리까지 한 장**, 관절 자리에 링(=엣지 루프),
#     그리고 텍스처. 2차의 "상자를 프리즘으로" 는 표면 문법만 바꾼 것이지 구조가 아니었다.
#   ★단면(링)을 z 를 따라 쌓아 옆면을 이으면 어깨가 팔로 흐르고 허리가 잘록해지고
#     목이 머리로 이어진다. 실루엣에 계단이 안 남는다.
#   ★웨이트는 **해석적 블렌드**다(Blender 자동 웨이트 아님 — 헤드리스 결정론 계약 유지).
#     이어진 메시를 강체(부위 100%)로 물리면 관절에서 표면이 찢어진다. 그래서 링의 z 로
#     두 뼈 비중을 섞는다 — 팔꿈치 링은 위팔:아래팔 50:50. 식이라 재렌더가 늘 같다.
#   ★텍스처: 이 레포는 UV·텍스처 이미지를 쓰지 않는다(.py 가 정본 캐논). 대신 **재질 띠** —
#     링 위상이 있으니 "몇 번째 링의 앞쪽 열"에 다른 재질을 줄 수 있다. 머리칼 캡·머리선이
#     그렇게 만들어진다.
LOFT_SEG = 16


def _ring(cz, cx, cy, rx, ry, seg=LOFT_SEG):
    """z=cz 평면의 타원 단면. a=0 이 +x — **캐릭터가 보는 쪽**이다."""
    return [(cx + rx * math.cos(2 * math.pi * k / seg),
             cy + ry * math.sin(2 * math.pi * k / seg), cz) for k in range(seg)]


LOFT_W = {}   # 오브젝트명 -> (링별 웨이트, seg). 웨이팅 단계가 읽는다.


def loft(name, rings, wmap, material, bucket, seg=LOFT_SEG, matfn=None, extra_mats=()):
    """rings = [(z, cx, cy, rx, ry), ...] 아래→위 · wmap = [{뼈: 비중}, ...] 링과 1:1.
       matfn(띠index, 열index) → 재질 인덱스(0=기본). 재질 띠가 텍스처를 대신한다."""
    verts = []
    for r in rings:
        verts += _ring(r[0], r[1], r[2], r[3], r[4], seg)
    nR = len(rings)
    faces, fmat = [], []
    for i in range(nR - 1):
        b0, b1 = i * seg, (i + 1) * seg
        for k in range(seg):
            k2 = (k + 1) % seg
            faces.append((b0 + k, b0 + k2, b1 + k2, b1 + k))
            fmat.append(matfn(i, k) if matfn else 0)
    nSide = len(faces)
    faces.append(tuple(range(seg - 1, -1, -1)))                 # 아랫 뚜껑
    fmat.append(0)
    faces.append(tuple(range((nR - 1) * seg, nR * seg)))        # 윗 뚜껑
    fmat.append(matfn(nR - 2, 0) if matfn else 0)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    me.materials.append(material)
    for m in extra_mats:
        me.materials.append(m)
    for i, pg in enumerate(me.polygons):
        pg.use_smooth = (i < nSide)        # 옆면만 스무스 — 뚜껑까지 스무스하면 정수리가 뭉갠다
        pg.material_index = fmat[i]
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    bucket.append(ob)
    ALLOBJ.append(ob)
    LOFT_W[ob.name] = (wmap, seg)
    return ob


def blendw(rings, bands):
    """bands = [(z아래, z위, 뼈)]. 링의 z 가 두 구간에 겹쳐 들면 그 링은 50:50 이 된다
       ⇒ **겹치는 폭이 곧 관절의 부드러움**이다. 구간 밖 링은 가장 가까운 구간에 100%."""
    out = []
    for r in rings:
        z = r[0]
        w = {}
        for (z0, z1, bone) in bands:
            if z0 <= z <= z1:
                w[bone] = w.get(bone, 0.0) + 1.0
        if not w:
            best = min(bands, key=lambda b: min(abs(z - b[0]), abs(z - b[1])))
            w = {best[2]: 1.0}
        tot = sum(w.values())
        out.append({k: v / tot for k, v in w.items()})
    return out


# ═══════════════ 소체 치수 (미터 · 1셀=1m 규약) ═══════════════
#   ★화면에선 키 1.70m = 54.4px. **머리는 7px** 이다 — 조형의 천장은 폴리곤이 아니라 화소다.
H_TOT = 1.70
Z_ANKLE, Z_KNEE, Z_HIP, Z_WAIST, Z_SHLD, Z_NECK = 0.09, 0.46, 0.90, 1.04, 1.39, 1.47
SH_W = 0.19 * SHLD_K   # 어깨 반폭 (★뼈대도 이 값을 쓴다 — 손잡이를 돌리면 리그가 따라온다)
HIP_W = 0.115          # 골반 반폭
ARM_Y = SH_W + 0.045   # 팔 중심 y


def _hz(z):
    """머리 비례 손잡이 — 목(Z_NECK) 위로만 자란다. 발이 뜨면 안 되니까 아래는 안 건드린다."""
    return Z_NECK + (z - Z_NECK) * HEAD_K if z > Z_NECK else z


# ── 몸통 + 머리 — **한 장** ──────────────────────────────────────────────────
#   골반 → 허리(제일 좁다) → 갈비 → 가슴 → 어깨선 → 승모근 → 목 → 턱 → 광대 → 정수리.
#   ★승모근 링(1.432)이 "어깨가 흐른다"의 정체다. 이 링이 없으면 어깨가 통으로 각진다.
TORSO_R = [
    (0.855, 0, 0, 0.112, 0.126),                      # 0 골반 아래(치마 속)
    (0.950, 0, 0, 0.120, 0.134),                      # 1 엉덩이
    (1.040, 0, 0, 0.104, 0.116),                      # 2 허리 ★잘록
    (1.160, 0, 0, 0.116, 0.138),                      # 3 갈비 아래
    (1.300, 0, 0, 0.128, 0.152 * SHLD_K),             # 4 가슴
    (1.390, 0, 0, 0.124, 0.150 * SHLD_K),             # 5 어깨선
    (1.432, 0, 0, 0.072, 0.080),                      # 6 승모근
    (1.470, 0, 0, 0.045, 0.048),                      # 7 목
    (_hz(1.512), 0.004, 0, 0.058 * HEAD_K, 0.060 * HEAD_K),   # 8 턱
    (_hz(1.545), 0.006, 0, 0.073 * HEAD_K, 0.077 * HEAD_K),   # 9 광대(눈 아래)
    (_hz(1.596), 0.004, 0, 0.078 * HEAD_K, 0.082 * HEAD_K),   # 10 눈 위
    (_hz(1.635), 0, 0, 0.077 * HEAD_K, 0.081 * HEAD_K),       # 11 머리 중간
    (_hz(1.678), 0, 0, 0.055 * HEAD_K, 0.058 * HEAD_K),       # 12 정수리 앞
    (_hz(1.700), 0, 0, 0.018 * HEAD_K, 0.019 * HEAD_K),       # 13 정수리
]


def _torso_mat(i, k):
    """재질 띠 = 텍스처 대신. fr>0 이 앞면(캐릭터는 +x 를 본다).
       ★눈 띠(재질 2)는 **32px/m 에서 안 읽힌다** — 0.05m 는 1.6px 이고 ×3 다운샘플에서
         살색에 섞인다. 더 넓히면 눈이 아니라 복면이 된다. 남겨 둔 건 (ㄱ)턱 아래 음영을
         한 겹 만들어 머리가 구슬로 안 읽히게 하고 (ㄴ)해상도를 올리면 그때 살아나기 때문이다.
         **얼굴은 이 크기에서 잘못된 레버다** — 디아블로2·좀보이드도 얼굴은 안 보인다.
         사람으로 읽히게 하는 건 실루엣·머리 덩이 모양·움직임이다."""
    fr = math.cos(2 * math.pi * k / LOFT_SEG)
    if i >= 10:
        return 1                       # 정수리 쪽 전부 머리칼
    if i == 9 and fr > 0.10:
        return 2                       # 눈 띠(앞면)
    if i >= 8 and fr < -0.10:
        return 1                       # 뒤통수·목뒤 머리칼
    return 0


o_torso = loft("torso", TORSO_R,
               blendw(TORSO_R, [(0.80, 1.060, 'root'), (1.020, 1.478, 'spine'), (1.462, 2.20, 'head')]),
               M['skin'], BODY, matfn=_torso_mat, extra_mats=(M['hair'], M['eye']))

# ── 팔·다리 — 각각 **한 장**. 어깨/팔꿈치/손목/엉덩이/무릎 자리에 링이 있다 ────
ARM_R = [(1.425, 0.062, 0.066), (1.390, 0.058, 0.061), (1.300, 0.048, 0.050),
         (1.180, 0.043, 0.045), (1.090, 0.040, 0.042), (0.990, 0.037, 0.039),
         (0.890, 0.032, 0.034), (0.835, 0.029, 0.031), (0.790, 0.038, 0.033),
         (0.740, 0.022, 0.020)]
LEG_R = [(0.955, 0.063, 0.068), (0.900, 0.062, 0.067), (0.760, 0.056, 0.060),
         (0.620, 0.050, 0.053), (0.500, 0.046, 0.049), (0.460, 0.045, 0.048),
         (0.360, 0.048, 0.050), (0.240, 0.040, 0.042), (0.150, 0.034, 0.035),
         (0.090, 0.031, 0.032)]
SLV_R = [(1.405, 0.072, 0.076), (1.300, 0.062, 0.064), (1.180, 0.054, 0.056)]

for _sg, _sf in ((+1, 'L'), (-1, 'R')):
    _hand = 'handR' if _sf == 'R' else 'larmL'          # 왼손 뼈는 없다(도구가 오른손 전용)
    _ar = [(z, 0, _sg * ARM_Y, rx * LIMB_K * (HAND_K / LIMB_K if z < 0.83 else 1.0),
            ry * LIMB_K * (HAND_K / LIMB_K if z < 0.83 else 1.0)) for (z, rx, ry) in ARM_R]
    loft("arm" + _sf, _ar,
         blendw(_ar, [(1.398, 1.46, 'spine'), (1.075, 1.412, 'uarm' + _sf),
                      (0.830, 1.105, 'larm' + _sf), (0.700, 0.860, _hand)]),
         M['skin'], BODY)
    _lr = [(z, 0, _sg * HIP_W * 0.62, rx * LIMB_K, ry * LIMB_K) for (z, rx, ry) in LEG_R]
    loft("leg" + _sf, _lr,
         blendw(_lr, [(0.885, 1.00, 'root'), (0.455, 0.910, 'thigh' + _sf), (0.05, 0.472, 'shin' + _sf)]),
         M['skin'], BODY)
    # 짚신만 상자다 — 각진 물건이라 그게 맞다
    box("foot" + _sf, 0.035, _sg * HIP_W * 0.62, Z_ANKLE * 0.5,
        0.17 * HAND_K, 0.105 * HAND_K, Z_ANKLE, M['straw'], BODY)

# ── 옷(베옷 한 벌) — 옷도 이어진 표면이라야 어깨가 흐른다 ────────────────────
TUNIC_R = [(0.880, 0, 0, 0.134, 0.148), (1.040, 0, 0, 0.126, 0.140),
           (1.160, 0, 0, 0.136, 0.158), (1.300, 0, 0, 0.148, 0.172 * SHLD_K),
           (1.392, 0, 0, 0.144, 0.170 * SHLD_K), (1.424, 0, 0, 0.098, 0.108)]
SKIRT_R = [(0.700, 0, 0, 0.152, 0.160), (0.800, 0, 0, 0.142, 0.150), (0.905, 0, 0, 0.128, 0.136)]
BELT_R = [(0.998, 0, 0, 0.130, 0.144), (1.048, 0, 0, 0.130, 0.144)]
loft("tunic", TUNIC_R, blendw(TUNIC_R, [(0.80, 1.060, 'root'), (1.020, 1.50, 'spine')]), M['hemp'], CLOTH)
loft("skirt", SKIRT_R, blendw(SKIRT_R, [(0.60, 1.00, 'root')]), M['hemp'], CLOTH)
loft("belt", BELT_R, blendw(BELT_R, [(0.95, 1.10, 'root')]), M['hemp2'], CLOTH)
for _sg, _sf in ((+1, 'L'), (-1, 'R')):
    _sr = [(z, 0, _sg * ARM_Y, rx * LIMB_K, ry * LIMB_K) for (z, rx, ry) in SLV_R]
    loft("slv" + _sf, _sr, blendw(_sr, [(1.398, 1.46, 'spine'), (1.075, 1.412, 'uarm' + _sf)]),
         M['hemp'], CLOTH)


# ── 도구(손에 드는 것) — 오른손(모델 −y) 기준 ───────────────────────────────
#   ★목록 주도: 여기 한 줄을 더하면 파이프라인이 자동으로 그 도구 시트를 굽는다.
def build_axe():
    L = []
    prism("axe_haft", 0.02, -ARM_Y, Z_SHLD - 0.60, 0.045, 0.045, 0.62, M['wood'], L, seg=8)
    box("axe_head", 0.02, -ARM_Y, Z_SHLD - 0.30, 0.075, 0.155, 0.115, M['stone'], L)   # 돌날은 각진 게 맞다
    prism("axe_bind", 0.02, -ARM_Y, Z_SHLD - 0.365, 0.055, 0.075, 0.045, M['cord'], L, seg=8)
    return L


def build_rod():
    L = []
    prism("rod_pole", 0.02, -ARM_Y, Z_SHLD - 0.42, 0.032, 0.032, 1.05, M['wood'], L, taper=0.55, seg=8)
    prism("rod_grip", 0.02, -ARM_Y, Z_SHLD - 0.86, 0.042, 0.042, 0.14, M['cord'], L, seg=8)
    return L


TOOL_BUILDERS = [("axe", build_axe), ("rod", build_rod)]
for _tn, _tb in TOOL_BUILDERS:
    TOOLS[_tn] = _tb()

# ═══════════════ 아마추어 (12본 · 강체 웨이팅) ═══════════════
arm_d = bpy.data.armatures.new("CharRig")
rig = bpy.data.objects.new("CharRig", arm_d)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')

BONES = [
    # (이름, head, tail, 부모)
    ("root",   (0, 0, Z_HIP),                 (0, 0, Z_WAIST),               None),
    ("spine",  (0, 0, Z_WAIST),               (0, 0, Z_SHLD),                "root"),
    ("head",   (0, 0, Z_NECK),                (0, 0, Z_NECK + 0.24),         "spine"),
    ("uarmL",  (0, +SH_W + 0.045, Z_SHLD),    (0, +SH_W + 0.045, Z_SHLD - 0.30), "spine"),
    ("larmL",  (0, +SH_W + 0.045, Z_SHLD - 0.30), (0, +SH_W + 0.045, Z_SHLD - 0.56), "uarmL"),
    ("uarmR",  (0, -SH_W - 0.045, Z_SHLD),    (0, -SH_W - 0.045, Z_SHLD - 0.30), "spine"),
    ("larmR",  (0, -SH_W - 0.045, Z_SHLD - 0.30), (0, -SH_W - 0.045, Z_SHLD - 0.56), "uarmR"),
    ("thighL", (0, +HIP_W * 0.62, Z_HIP),     (0, +HIP_W * 0.62, Z_KNEE),    "root"),
    ("shinL",  (0, +HIP_W * 0.62, Z_KNEE),    (0, +HIP_W * 0.62, Z_ANKLE),   "thighL"),
    ("thighR", (0, -HIP_W * 0.62, Z_HIP),     (0, -HIP_W * 0.62, Z_KNEE),    "root"),
    ("shinR",  (0, -HIP_W * 0.62, Z_KNEE),    (0, -HIP_W * 0.62, Z_ANKLE),   "thighR"),
    ("handR",  (0, -SH_W - 0.045, Z_SHLD - 0.56), (0, -SH_W - 0.045, Z_SHLD - 0.68), "larmR"),
]
_eb = {}
for nm, hd, tl, par in BONES:
    b = arm_d.edit_bones.new(nm)
    b.head = hd
    b.tail = tl
    b.use_connect = False
    if par:
        b.parent = _eb[par]
    _eb[nm] = b
bpy.ops.object.mode_set(mode='OBJECT')

# 파트 → 본 (강체 100%)
WEIGHT = {
    # ★몸·옷은 전부 로프트라 여기 없다 — LOFT_W 의 링별 블렌드가 대신한다.
    #   여기 남는 건 **강체가 맞는 것들**뿐이다: 짚신과 손에 든 도구.
    'footL': 'shinL', 'footR': 'shinR',
    'axe_haft': 'handR', 'axe_head': 'handR', 'axe_bind': 'handR',
    'rod_pole': 'handR', 'rod_grip': 'handR',
}
for ob in ALLOBJ:
    if ob.name in LOFT_W:
        # ★이어진 표면 — 링마다 뼈 비중이 다르다(해석적 블렌드).
        #   강체로 물리면 관절에서 표면이 찢어진다. 이게 3차가 2차와 다른 두 번째 지점이다.
        wmap, seg = LOFT_W[ob.name]
        groups = {}
        for ri, w in enumerate(wmap):
            for bone, val in w.items():
                if bone not in groups:
                    groups[bone] = ob.vertex_groups.new(name=bone)
                groups[bone].add(list(range(ri * seg, (ri + 1) * seg)), val, 'REPLACE')
        md = ob.modifiers.new("Arm", 'ARMATURE')
        md.object = rig
        ob.parent = rig
        continue
    bone = WEIGHT.get(ob.name)
    if not bone:
        print("[char] ⚠웨이트 미지정:", ob.name)
        continue
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    md = ob.modifiers.new("Arm", 'ARMATURE')
    md.object = rig
    ob.parent = rig

# ═══════════════ ★★z 압축(ZSQ) — 2026-08-31 수리 ═══════════════
#   ★1차의 버그: `ZSQ` 를 **화면 bbox 계산에만** 곱하고 **기하에는 안 걸었다**.
#     자연물(`nature_render.py:318`)·건물(`building_render.py:300`)은 정점 z 에 직접 곱한다
#     (`v.co.z *= ZSQ`). 그래서 캐릭터만 1m = 39.2px 로 구워졌다 — 나머지 세상은 32px/m.
#     실측: 시트의 발밑→정수리가 67.3px(1.694m → 39.7px/m). 즉 **24% 너무 컸다.**
#     (자연물 대조: bush01 은 1.49m 를 47.7px 로 굽는다 = 32.0px/m.)
#   ★고치는 자리가 정점이 아니라 **리그 오브젝트 스케일**인 이유: 뼈가 있는 몸은
#     "누른 다음 포즈"와 "포즈한 다음 누르기"가 다르다. 세상이 보는 건 후자다.
#     리그를 (1,1,ZSQ) 로 스케일하면 자식 메시가 전부 **포즈된 결과 위에** 눌린다.
rig.scale = (1.0, 1.0, ZSQ)
bpy.context.view_layer.update()

# ═══════════════ 클립 = 포즈 함수 (해석적 · 결정론) ═══════════════
#   반환: {본이름: (rx, ry, rz)} 라디안. 없는 본은 rest.
#   ★루프 클립은 위상 u∈[0,1) 의 순수 삼각함수라 **시작=끝이 자동 정합**이다(루프 튐 금지).
def _pose_idle(u):
    s = math.sin(u * 2 * math.pi)
    return {
        'spine': (math.radians(1.2 + 0.8 * s), 0, 0),
        'uarmL': (math.radians(2.5 * s), 0, math.radians(3)),
        'uarmR': (math.radians(-2.5 * s), 0, math.radians(-3)),
        'head':  (math.radians(0.9 * s), 0, 0),
    }


def _pose_walk(u, amp=1.0, lean=0.0):
    s = math.sin(u * 2 * math.pi)
    c = math.cos(u * 2 * math.pi)
    leg = math.radians(26 * amp)
    knee = math.radians(30 * amp)
    arm = math.radians(19 * amp)
    return {
        'root':   (math.radians(lean), 0, 0),
        'spine':  (math.radians(lean * 0.6), 0, math.radians(3.5 * amp * c)),
        'thighL': (leg * s, 0, 0),
        'shinL':  (max(0.0, -knee * math.sin(u * 2 * math.pi + 0.9)), 0, 0),
        'thighR': (-leg * s, 0, 0),
        'shinR':  (max(0.0, -knee * math.sin(u * 2 * math.pi + 0.9 + math.pi)), 0, 0),
        'uarmL':  (-arm * s, 0, math.radians(4)),
        'uarmR':  (arm * s, 0, math.radians(-4)),
        'larmL':  (math.radians(-14 * amp), 0, 0),
        'larmR':  (math.radians(-14 * amp), 0, 0),
    }


def _pose_run(u):
    p = _pose_walk(u, amp=1.5, lean=11.0)
    p['larmL'] = (math.radians(-52), 0, 0)
    p['larmR'] = (math.radians(-52), 0, 0)
    return p


def _pose_swing(u):
    """원샷 6프레임. 0~0.35 들어올림 → 0.35~0.62 내려침 → 0.62~1 복귀."""
    if u < 0.35:
        k = u / 0.35
        up = k
        fwd = 0.0
    elif u < 0.62:
        k = (u - 0.35) / 0.27
        up = 1.0 - k
        fwd = k
    else:
        k = (u - 0.62) / 0.38
        up = 0.0
        fwd = 1.0 - k
    return {
        'spine':  (math.radians(-8 * up + 15 * fwd), 0, math.radians(16 * up - 12 * fwd)),
        'uarmR':  (math.radians(-118 * up + 62 * fwd), 0, math.radians(-8)),
        'larmR':  (math.radians(-70 * up + 6 * fwd), 0, 0),
        'handR':  (math.radians(-25 * up + 18 * fwd), 0, 0),
        'uarmL':  (math.radians(-16 * up + 22 * fwd), 0, math.radians(10)),
        'larmL':  (math.radians(-28), 0, 0),
        'root':   (math.radians(5 * fwd), 0, 0),
        'thighL': (math.radians(-9 * fwd), 0, 0),
        'thighR': (math.radians(9 * fwd), 0, 0),
    }


def _pose_aim(u):
    """조준 자세 — 낮춘 무게중심·앞으로 내민 손. 2프레임(미세 호흡)."""
    s = 1.0 if u < 0.5 else 0.0
    return {
        'root':   (math.radians(6), 0, 0),
        'spine':  (math.radians(4 + 0.7 * s), 0, math.radians(-9)),
        'uarmR':  (math.radians(-58 - 1.2 * s), 0, math.radians(-26)),
        'larmR':  (math.radians(-34), 0, 0),
        'handR':  (math.radians(-12), 0, 0),
        'uarmL':  (math.radians(-50), 0, math.radians(30)),
        'larmL':  (math.radians(-58), 0, 0),
        'thighL': (math.radians(-13), 0, 0),
        'thighR': (math.radians(11), 0, 0),
        'shinL':  (math.radians(16), 0, 0),
        'shinR':  (math.radians(14), 0, 0),
    }


POSE_FN = {'idle': _pose_idle, 'walk': _pose_walk, 'run': _pose_run,
           'swing': _pose_swing, 'aim': _pose_aim}


def apply_pose(clip, fi, nframes, dirIdx):
    """포즈 + 방향 회전을 적용. 방향은 **루트 본이 아니라 리그 오브젝트**를 돌린다
       (본을 돌리면 자식 로컬축이 따라 돌아 포즈 해석이 흔들린다)."""
    u = (fi / nframes) if CLIP_LOOP[clip] else (fi / max(1, nframes - 1))
    pose = POSE_FN[clip](u)
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = pose.get(pb.name, (0.0, 0.0, 0.0))
        pb.location = (0.0, 0.0, 0.0)
    # 걸음의 상하 흔들림(bob) — 리그 전체를 살짝 올렸다 내린다
    bob = 0.0
    if clip in ('walk', 'run'):
        amp = 0.012 if clip == 'walk' else 0.022
        bob = amp * abs(math.sin(u * 2 * math.pi))
    rig.location = (0.0, 0.0, bob * ZSQ)   # ★location 은 제 오브젝트 스케일을 안 먹는다
    rig.rotation_euler = (0.0, 0.0, dirIdx * (2 * math.pi / DIRS))
    bpy.context.view_layer.update()


CLIP_LOOP = {c[0]: c[2] for c in CLIPS}
CLIP_N = {c[0]: c[1] for c in CLIPS}
CLIP_FPS = {c[0]: c[3] for c in CLIPS}


# ═══════════════ 공유 프레임 박스 ═══════════════
def screen_bbox_now(objs):
    """지금 포즈에서 objs 의 화면 bbox(px, 슈퍼샘플 좌표계).
       ★정점은 **평가된 depsgraph**에서 읽는다 — 아마추어 변형이 반영된 실제 좌표.
       ★z 압축은 **여기서 곱하지 않는다** — 리그 스케일이 이미 matrix_world 에 들어 있다.
         (1차는 여기서만 곱하고 기하엔 안 걸어 렌더가 24% 더 컸다. 두 번 누르지 마라.)"""
    dg = bpy.context.evaluated_depsgraph_get()
    PPU = PPU0 * SS
    umin = wmin = 1e18
    umax = wmax = -1e18
    for ob in objs:
        eo = ob.evaluated_get(dg)
        me = eo.to_mesh()
        mw = eo.matrix_world
        for v in me.vertices:
            p = mw @ v.co
            u = p.dot(RHAT) * PPU
            w = -p.dot(UHAT) * PPU
            umin = min(umin, u); umax = max(umax, u)
            wmin = min(wmin, w); wmax = max(wmax, w)
        eo.to_mesh_clear()
    return umin, umax, wmin, wmax


def all_layer_objects():
    objs = list(BODY) + list(CLOTH)
    for L in TOOLS.values():
        objs += L
    return objs


print("[char] 공유 프레임 박스 계산 — 전 클립×전 방향×전 프레임×전 레이어")
UMIN = WMIN = 1e18
UMAX = WMAX = -1e18
# ★가림 — 화가 순서(몸→옷→도구)는 깊이를 모른다. 3차에서 **홀드아웃**으로 잡는다
#   (`set_visible` 주석 참조): 몸을 홀드아웃 삼아 옷·도구를 구우면 몸이 앞인 자리의
#   화소가 아예 잘려 나가므로, 고정 순서가 몸에 대해 **깊이 정확**해진다.
#   ★회부 B-1 의 ⓐ(방향별 z 순서)는 버렸다 — 두 번 만들었다 두 번 틀렸고
#     ⓑ 가 공짜로 되는 순간 순서표는 정확도도 단순함도 진다. 기록은 인계 문서에.
_probe = all_layer_objects()
for cname, n, loop, _fps in CLIPS:
    for d in range(DIRS):
        for fi in range(n):
            apply_pose(cname, fi, n, d)
            a, b, c2, d2 = screen_bbox_now(_probe)
            UMIN = min(UMIN, a); UMAX = max(UMAX, b)
            WMIN = min(WMIN, c2); WMAX = max(WMAX, d2)


def _ceil_ss(v):
    n = int(math.ceil(v)) + MARGIN * 2
    return ((n + SS - 1) // SS) * SS               # ★SS 배수로 — 다운샘플이 정확히 떨어져야 한다

FW = _ceil_ss(UMAX - UMIN)                         # 프레임 폭(슈퍼샘플 px)
FH = _ceil_ss(WMAX - WMIN)                         # 프레임 높이
# 카메라 중심(월드) — 상자의 한가운데
PPU = PPU0 * SS
_ca = (UMIN + UMAX) * 0.5 / PPU
_cb = -(WMIN + WMAX) * 0.5 / PPU
CTR = RHAT * _ca + UHAT * _cb
# 앵커 = 지면 원점(0,0,0)의 프레임 내 픽셀. ★좌우 FLIP 뒤에도 그대로 맞는다
#   (bbox 계산이 이미 게임 규약 RHAT=+x-오른쪽 으로 재고 있으므로).
ANCH_X = FW / 2.0 - (UMIN + UMAX) * 0.5
ANCH_Y = FH / 2.0 - (WMIN + WMAX) * 0.5
print(f"[char] 프레임 {FW}x{FH} (ss={SS}) · 앵커=({ANCH_X:.1f},{ANCH_Y:.1f}) · ppu={PPU:.3f}")
# 화면 세로 px/m = PPU0 · ZSQ · cos30° = 32.0 (자산 정본: 1m 높이 = 32px)
_PXM = PPU0 * ZSQ * math.cos(math.radians(30.0))
print(f"[char] 시트 프레임(클라) = {FW//SS}x{FH//SS}px · 키 {H_TOT}m → {H_TOT*_PXM:.1f}px (1m={_PXM:.1f}px)")

scene.render.resolution_x = FW
scene.render.resolution_y = FH
cam_d.ortho_scale = FW / PPU
tgt.location = CTR
cam.location = CTR + NHAT * 300.0


# ═══════════════ 렌더 ═══════════════
def set_visible(objs_on, holdouts=()):
    """objs_on 만 보이게. holdouts 는 **보이되 화소를 안 남기고 뒤를 가린다**(Cycles is_holdout).
       ★가림 수리 ⓑ [2026-08-31 3차] — 회부 B-1 이 "도구 유무 조합마다 몸 시트가 곱으로 는다"며
         미뤄 뒀던 그 홀드아웃이다. 그런데 **방향이 반대면 공짜**다:
           · 몸을 홀드아웃 삼아 **옷**을 구우면 → 몸이 앞인 자리의 옷 화소가 잘려 나간다.
           · 몸을 홀드아웃 삼아 **도구**를 구우면 → 몸이 앞인 자리의 도구 화소가 잘려 나간다.
         **몸은 언제나 그려진다**(`charLayersFor` 는 항상 body 를 낸다). 그래서 조합이 안 는다.
         곱으로 느는 건 그 반대 — 도구를 홀드아웃 삼아 *몸*을 굽는 경우다. 그건 여전히 안 한다.
       ⇒ 화가 순서 몸→옷→도구가 **몸에 대해서는 깊이 정확**해진다. 남는 부정확은 옷↔도구뿐이고,
         옷 종류가 늘어도 도구 시트를 다시 안 굽게 하려고 **도구는 몸만 홀드아웃**한다(회부 A-5 보호)."""
    on = set(id(o) for o in objs_on)
    ho = set(id(o) for o in holdouts)
    for o in ALLOBJ:
        hide = (id(o) not in on) and (id(o) not in ho)
        o.hide_render = hide
        o.hide_viewport = hide
        o.is_holdout = (id(o) in ho) and (id(o) not in on)


# (이름, 그릴 것, 홀드아웃) — 홀드아웃은 **항상 같이 그려지는 아래 레이어**만 넣는다.
LAYERS = [("body", lambda: BODY, lambda: []),
          ("clothes_hemp", lambda: CLOTH, lambda: BODY)]
for _tn, _ in TOOL_BUILDERS:
    LAYERS.append(("tool_" + _tn, (lambda n: (lambda: TOOLS[n]))(_tn), lambda: BODY))

# ★검사용 대조 레이어(`--probe`): 몸+옷+도끼를 **한 번에** 굽는다.
#   런타임 합성(레이어를 화가 순서로 겹치기)과 이 대조를 견주면 **가림(occlusion) 오차**가 수치로 나온다.
#   합성은 깊이를 모르므로 도구가 몸 뒤로 가야 할 방향에서 앞에 뜬다 — 그 크기를 재려는 것이다.
if "--probe" in ARGS:
    LAYERS.append(("probeall", lambda: BODY + CLOTH + TOOLS['axe'], lambda: []))


def downsample(px, w, h, k):
    """k×k 박스필터. ★알파 가중 평균 — 안 하면 투명 픽셀의 검은 RGB 가 테두리에 번진다.
       (자연물은 슈퍼샘플을 파일에 남기고 클라가 줄였지만, 시트는 프레임이 수백 장이라
        여기서 줄인다. 최종 ppu 는 PPU0 — 메타에 그렇게 적는다.)"""
    ow, oh = w // k, h // k
    out = [0.0] * (ow * oh * 4)
    inv = 1.0 / (k * k)
    for y in range(oh):
        for x in range(ow):
            r = g = b = a = 0.0
            for dy in range(k):
                row = ((y * k + dy) * w + x * k) * 4
                for dx in range(k):
                    i = row + dx * 4
                    av = px[i + 3]
                    r += px[i] * av; g += px[i + 1] * av; b += px[i + 2] * av
                    a += av
            o = (y * ow + x) * 4
            if a > 1e-6:
                out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a
            out[o + 3] = a * inv
    return out, ow, oh


def edge_darken(sheet, w, h, k, athr=EDGE_A, mask=None):
    """실루엣 안쪽 한 겹의 RGB 를 k 배로 낮춘다 — **자체 아웃라인**.
       mask 를 주면 그 알파를 실루엣으로 삼는다(몸·옷은 **합집합** 실루엣을 쓴다 —
       레이어마다 제 실루엣을 그으면 살↔옷 경계에 없는 선이 하나 더 생긴다).
       ★불투명(a>=athr) 화소 중 4이웃에 비어 있는(a<athr) 화소가 있는 것만 건드린다.
         반투명(안티에일리어싱) 화소는 손대지 않는다 — 거기를 어둡게 하면 그게 검은 프린지이고,
         test-charsheet ④ 가 정확히 그 증상을 잡는다.
       ★읽기용 사본을 먼저 뜬다 — 제자리 수정하면 어두워진 화소가 다음 화소의 이웃 판정에
         끼어들어 아웃라인이 안쪽으로 번진다(1겹 계약 위반)."""
    if k >= 0.999:
        return sheet
    a = mask if mask is not None else [sheet[i * 4 + 3] for i in range(w * h)]
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if a[i] < athr or sheet[i * 4 + 3] < athr:   # 실루엣 위 + 제 화소도 불투명일 것
                continue
            edge = (x == 0 or a[i - 1] < athr or x == w - 1 or a[i + 1] < athr
                    or y == 0 or a[i - w] < athr or y == h - 1 or a[i + w] < athr)
            if edge:
                o = i * 4
                sheet[o] *= k; sheet[o + 1] *= k; sheet[o + 2] *= k
    return sheet


def blank_sheet(w, h):
    return [0.0] * (w * h * 4)


def blit(sheet, sw, tile, tw, th, tx, ty):
    """tile(RGBA float 리스트, 아래가 0행)을 시트의 (tx,ty) 픽셀 위치에 얹는다."""
    for y in range(th):
        src = y * tw * 4
        dst = ((ty + y) * sw + tx) * 4
        sheet[dst:dst + tw * 4] = tile[src:src + tw * 4]


def render_layer(layer_name, objs, clip, n, holdouts=()):
    """한 레이어·한 클립 → 시트 하나(행=방향, 열=프레임)."""
    set_visible(objs, holdouts)
    TW, TH = FW // SS, FH // SS                    # 다운샘플 뒤 타일 크기 = 클라가 보는 크기
    SW, SH = TW * n, TH * DIRS
    sheet = blank_sheet(SW, SH)
    tmp = os.path.join(OUTDIR, "_tmp.png")
    for d in range(DIRS):
        for fi in range(n):
            apply_pose(clip, fi, n, d)
            scene.render.filepath = tmp
            bpy.ops.render.render(write_still=True)
            _flip_png(tmp)
            img = bpy.data.images.load(tmp)
            px = list(img.pixels[:])
            bpy.data.images.remove(img)
            px, tw, th = downsample(px, FW, FH, SS)
            # ★행 0 = 방향 0(위에서 아래). Blender 이미지는 **아래가 0행**이라 여기서 뒤집어 쌓는다.
            blit(sheet, SW, px, tw, th, fi * tw, (DIRS - 1 - d) * th)
    return sheet, SW, SH


def save_sheet(sheet, w, h, path):
    img = bpy.data.images.new("sheet", width=w, height=h, alpha=True)
    img.pixels = sheet
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


META = {
    "_": "char_render.py 산물 — 손편집 금지. 규약은 그 파일이 정본.",
    "ss": SS, "ppu": round(PPU0, 4), "renderPpu": round(PPU, 4), "zsq": round(ZSQ, 5),
    "pxPerMeterH": round(PPU0 * ZSQ * math.cos(math.radians(30.0)), 4),
    "frameW": FW // SS, "frameH": FH // SS,
    "anchorX": round(ANCH_X / SS, 3), "anchorY": round(ANCH_Y / SS, 3),
    "dirs": DIRS,
    "dirOrder": "d = round(atan2(fy,fx)/(PI/4)) mod 8 — 월드 방향. d=0 은 +x(동).",
    "rowOrder": "행 0 = 방향 0, 위에서 아래로. 열 = 프레임 0..n-1, 왼쪽에서 오른쪽으로.",
    "heightM": H_TOT,
    # ★이 시트를 만든 조형 손잡이 — 시트만 보고도 무엇이 적용됐는지 알 수 있게 남긴다
    "shape": {"gen": 3, "loftSeg": LOFT_SEG, "seg": SEG, "rings": RINGS, "edgeK": EDGE_K, "edgeA": EDGE_A,
              "headK": HEAD_K, "shldK": SHLD_K, "limbK": LIMB_K, "handK": HAND_K},
    "clips": {c[0]: {"frames": c[1], "loop": c[2], "fps": c[3]} for c in CLIPS},
    "layers": [l[0] for l in LAYERS if l[0] != 'probeall'],
    "sheets": {},
}


def _png_size(path):
    with open(path, 'rb') as f:
        d = f.read(33)
    return int.from_bytes(d[16:20], 'big'), int.from_bytes(d[20:24], 'big')


def rebuild_sheets():
    """★메타의 sheets 는 **디스크를 훑어** 세운다.
       한 클립만 다시 구웠을 때 메타가 그 클립만 남기고 덮어써서 나머지가 통째로 사라지는 사고를
       구조적으로 막는다(1차 실행에서 실제로 그렇게 됐다). `probeall`(검사용 대조군)은 제외한다."""
    out = {}
    for fn in sorted(os.listdir(SHEETDIR)):
        if not fn.endswith(".png") or fn.startswith("probeall"):
            continue
        key = fn[:-4]
        lay = next((l for l in META["layers"] if key.startswith(l + "_")), None)
        if not lay:
            continue
        clip = key[len(lay) + 1:]
        if clip not in META["clips"]:
            continue
        w, h = _png_size(os.path.join(SHEETDIR, fn))
        out[key] = {"w": w, "h": h, "cols": META["clips"][clip]["frames"],
                    "rows": DIRS, "layer": lay, "clip": clip}
    return out

# ★몸·옷은 **한 몸의 실루엣**을 공유한다(도구는 항상 맨 위에 그려지니 제 실루엣).
SILHOUETTE_GROUP = set(l[0] for l in LAYERS if l[0] == 'body' or l[0].startswith('clothes'))


if not ONLY_META:
    for clip, n, loop, fps in CLIPS:
        if CLIP_FILTER and clip not in CLIP_FILTER:
            continue
        built = []
        for lname, getter, hoget in LAYERS:
            sheet, SW, SH = render_layer(lname, getter(), clip, n, hoget())
            built.append([lname, sheet, SW, SH])
            if RAWDUMP:   # 실루엣 강화 **전** 원본 — 세기 비교판을 재렌더 없이 만들려고 남긴다
                save_sheet(sheet, SW, SH, os.path.join(OUTDIR, f"raw_{lname}_{clip}.png"))
        if EDGE_K < 0.999:
            SW, SH = built[0][2], built[0][3]
            uni = [0.0] * (SW * SH)
            for lname, sheet, _w, _h in built:
                if lname not in SILHOUETTE_GROUP:
                    continue
                for i in range(SW * SH):
                    av = sheet[i * 4 + 3]
                    if av > uni[i]:
                        uni[i] = av
            for lname, sheet, _w, _h in built:
                edge_darken(sheet, SW, SH, EDGE_K,
                            mask=(uni if lname in SILHOUETTE_GROUP else None))
        for lname, sheet, SW, SH in built:
            key = f"{lname}_{clip}"
            save_sheet(sheet, SW, SH, os.path.join(SHEETDIR, key + ".png"))
            print(f"[char] {key}: {SW}x{SH}")

META["sheets"] = rebuild_sheets()
with open(os.path.join(SHEETDIR, "char_meta.json"), "w") as f:
    json.dump(META, f, indent=1, sort_keys=True)
print(f"[char] 메타 저장: {len(META['sheets'])}장 · {os.path.join(SHEETDIR, 'char_meta.json')}")

# ═══════════════ .blend 정본 저장 (재민이 열어 보라고) ═══════════════
set_visible(all_layer_objects())
try:
    bpy.ops.wm.save_as_mainfile(filepath=BLENDOUT)
    print("[char] .blend 저장:", BLENDOUT)
except Exception as e:
    print("[char] ⚠.blend 저장 실패:", e)
