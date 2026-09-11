# bake-terrain-tex.py — 지형 질감 베이크 (씬 정본: building_render.py 계열 — Cycles·태양 52°/-35° 3.6·월드 0.55)
#   **게임 카메라 각도(방위 45°·고도 30°)로 씨멜리스하게 굽는다** — 탑다운을 다이아몬드에 눌러
#   붙이면 풀이 옆으로 뭉개진다(재민 "풀 얼룩"). 갈래는 `angled` 하나다.
#   결과: scripts/terrain_tex/{grass,dry,mud}_angled.png → public/assets/terrain/
# 실행: blender -b -P scripts/bake-terrain-tex.py
import bpy, math, os, random


OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terrain_tex')
os.makedirs(OUT, exist_ok=True)
random.seed(1020)  # 라이브 시드와 같은 결정론

scene = bpy.context.scene
for o in list(scene.objects): bpy.data.objects.remove(o, do_unlink=True)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
scene.cycles.use_denoising = bool(getattr(bpy.app.build_options, 'openimagedenoise', False))
try: scene.view_settings.view_transform = 'Standard'
except Exception: pass
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGB'
if scene.world is None: scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.52, 0.56, 0.6, 1.0); bg.inputs[1].default_value = 0.55
sun_d = bpy.data.lights.new("Sun", 'SUN'); sun_d.energy = 3.6; sun_d.angle = 0.25
sun = bpy.data.objects.new("Sun", sun_d); scene.collection.objects.link(sun)
sun.rotation_euler = (math.radians(52), 0, math.radians(-35))
cam_d = bpy.data.cameras.new("Cam"); cam_d.type = 'ORTHO'
cam = bpy.data.objects.new("Cam", cam_d); scene.collection.objects.link(cam)
cam.location = (0, 0, 30); cam.rotation_euler = (0, 0, 0)   # 초기 자세 — `_angled_camera` 가 덮어쓴다
scene.camera = cam

def principled(name, base, rough=0.8, spec=0.2):
    m = bpy.data.materials.new(name); m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*base, 1.0)
    p.inputs['Roughness'].default_value = rough
    try: p.inputs['Specular IOR Level'].default_value = spec
    except Exception: pass
    return m

def _wrap_corners(path):
    """★렌더 직사각형(64P×32P)의 **네 모서리 삼각형**을 메운다.
       월드 정사각형 [0,P)² 는 iso 에서 **마름모**로 투영된다 — 직사각형의 모서리는 그 밖이라
       맨 흙으로 비어 나온다(1패스 실제 증상: 마름모만 풀, 네 귀퉁이는 흙).
       그런데 이 직사각형은 격자의 **두 칸**이고, 모서리는 격자 벡터 u=(32P,16P) 만큼 옮기면
       정확히 마름모 안으로 들어간다 ⇒ 마름모 밖 픽셀은 (x+W/2, y+H/2) 를 감아 읽어 채운다.
       내용이 진짜로 주기적이라 이음새가 0 이다(합성이 아니라 같은 장면의 다른 표본)."""
    img = bpy.data.images.load(path)
    W, H = img.size
    px = list(img.pixels[:])
    out = px[:]
    cx, cy = W / 2.0, H / 2.0
    for y in range(H):
        for x in range(W):
            if abs(x + 0.5 - cx) / cx + abs(y + 0.5 - cy) / cy <= 1.0:
                continue
            sx = (x + W // 2) % W; sy = (y + H // 2) % H
            d = (y * W + x) * 4; sI = (sy * W + sx) * 4
            out[d] = px[sI]; out[d + 1] = px[sI + 1]; out[d + 2] = px[sI + 2]; out[d + 3] = px[sI + 3]
    img.pixels = out
    img.filepath_raw = path; img.file_format = 'PNG'; img.save()
    bpy.data.images.remove(img)
    print('[bake] 모서리 격자 채움:', path)


def render_now(path):
    """해상도를 건드리지 않고 그대로 렌더 — 각도 베이크(직사각형 512×256)용."""
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print('[bake]', path, scene.render.resolution_x, 'x', scene.render.resolution_y)

def clear_meshes():
    for o in list(scene.objects):
        if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)

# ★실행 게이트 — 갈래는 `angled` 하나다(인자를 안 줘도 이것이다).
#   blender -b -P scripts/bake-terrain-tex.py            # = angled
#   blender -b -P scripts/bake-terrain-tex.py -- angled
#
# ★★[T169] **옛 `topdown` 갈래를 지웠다** — 죽은 갈래였다(실측 셋):
#   ⓐ 그 갈래의 산출물(`grass·dirt·rock·canopy·water_0..5.png`)이 `public/assets/terrain/` 에
#     **들어온 적이 한 번도 없다**(전수 `git log --diff-filter=A` = 0). 배포본 넷은 전부 `*_angled`.
#   ⓑ 산출물 자리 `scripts/terrain_tex/` 는 gitignore 라 저장소에도 남은 적이 없다.
#   ⓒ 그것을 읽는 것은 목업 둘(`mock-terrain-v3.js`·`mock-terrain-v4.js`)뿐이고, 둘 다
#     러너 밖(`@regress` 없음)이며 재료가 없어 이미 못 돈다.
#   ⇒ **되살릴 자리: `b331a574`**(2026-08-05 · 질감판 시안 도구). 갈래 전체가 거기 있다.
#
# ★★[T175] 그 목업 둘도 **지웠다** — 굽기가 사라진 뒤엔 재료를 만들 길조차 없는 고아였다.
#   (읽는 코드 0 · 러너 밖 · `package.json` 밖 — 전수로 쟀다. 남은 언급은 보고·인계의 **기록**뿐이다.)
#   되살릴 자리: `mock-terrain-v3.js` → `b331a574`(위와 같은 커밋) ·
#                `mock-terrain-v4.js` → `0caa0aff`(2026-08-05 · 시안 v5.4 — 그 파일의 마지막 판).
#   ⓘ `인계/R1-지형렌더.md` 가 v4 를 "실게임 이식 기준"이라 적어 둔 것은 **역사 기록**이다 —
#     문법은 이미 클라에 들어와 있고(배치 19), 그 문장이 가리키는 것은 그때의 그 파일이다.
#     같이 사라진 것: `render(path,res)`(정사각 탑다운 렌더) · `ShaderNodeBump` 세 곳과
#     `render_common.BUMP_DIST` import — 각도 갈래엔 범프가 **한 곳도 없다**(실측).
import sys as _sys
_argv = _sys.argv[_sys.argv.index('--') + 1:] if '--' in _sys.argv else ['angled']

# ═══════════════════════════════════════════════════════════════════════════════
# ★[배치 19 실장] 게임 카메라 각도 베이크 — **씨멜리스**
#   탑다운 텍스처를 다이아몬드에 눌러 붙이면 풀이 옆으로 뭉개진다("풀 얼룩" — 재민 지적).
#   그래서 지면 질감은 **게임 카메라(방위 45°·고도 30°)로 굽는다**. 정본 씬 값은 위와 동일.
#
# ★씨멜리스가 성립하는 이유(수학) — 대충 자른 게 아니다:
#   클라 투영 w2i(wx,wy) = (wx−wy, (wx+wy)/2) [게임 px]. 1유닛(=1셀=1m)=32 게임px 이므로
#     월드 (P,0,0) → iso (32P, 16P)   ·   월드 (0,P,0) → iso (−32P, 16P)
#   두 벡터의 합/차 = (0, 32P) · (64P, 0)  ⇒ **iso 공간에서 64P × 32P 직사각형이 주기**다.
#   따라서 월드 산포를 주기 P 로 감아 두고(경계 근처 블레이드를 ±P 로 복제) 그 직사각형을
#   그대로 렌더하면 canvas `repeat` 패턴으로 이음새 없이 깔린다.
#   P=8 → 512×256 px, 셀 하나가 정확히 64×32 px = **화면 1:1**(클라 zoom 없음, 실측).
# ═══════════════════════════════════════════════════════════════════════════════
import mathutils as _mu
_V = _mu.Vector
PPU_A = 64.0 / math.sqrt(2.0)                          # 45.2548 px/unit
ZSQ_A = 32.0 / (PPU_A * math.cos(math.radians(30.0)))  # 0.8165 — 1m 높이 = 32px
PERIOD = 8.0                                           # 주기(유닛=셀=m)
WRAP_MARGIN = 1.0                                      # 이 안쪽 블레이드는 ±P 복제(그림자·투영 여유)


def _angled_camera(res_x, res_y):
    """게임 카메라 = 방위 45°·고도 30° ORTHO. sensor_fit 을 HORIZONTAL 로 못 박는다
       (기본 AUTO 는 긴 변 기준이라 세로가 긴 프레임에서 배율이 달라진다)."""
    th = math.radians(30.0)
    nhat = _V((math.cos(th) / math.sqrt(2), math.cos(th) / math.sqrt(2), math.sin(th)))
    scene.render.resolution_x = res_x; scene.render.resolution_y = res_y
    cam_d.sensor_fit = 'HORIZONTAL'
    cam_d.ortho_scale = res_x / PPU_A
    ctr = _V((PERIOD / 2, PERIOD / 2, 0.0))
    cam.location = ctr + nhat * 200.0
    # TRACK_TO 대신 직접 회전 — 이 스크립트엔 빈 오브젝트가 없다
    d = (ctr - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()


def _wrap_place(src, x, y, place):
    """주기 경계에 걸친 개체를 ±P 로 복제 — 이게 씨멜리스의 전부다."""
    for dx in (-PERIOD, 0.0, PERIOD):
        for dy in (-PERIOD, 0.0, PERIOD):
            if dx or dy:
                if not (-WRAP_MARGIN <= x + dx <= PERIOD + WRAP_MARGIN): continue
                if not (-WRAP_MARGIN <= y + dy <= PERIOD + WRAP_MARGIN): continue
            place(src, x + dx, y + dy)


def _blade_meshes(cols, hs):
    out = []
    for bi, (h, col) in enumerate(zip(hs, cols)):
        hz = h * ZSQ_A                                   # ★z 압축 — 1m = 32px 화법
        verts = [(-0.011, 0, 0), (0.011, 0, 0), (-0.007, 0, hz * 0.6), (0.007, 0, hz * 0.6), (0.0, 0.05 * h, hz)]
        faces = [(0, 1, 3, 2), (2, 3, 4)]
        me = bpy.data.meshes.new('ab%d' % bi); me.from_pydata(verts, [], faces); me.update()
        ob = bpy.data.objects.new('ab%d' % bi, me); scene.collection.objects.link(ob)
        ob.data.materials.append(principled('abm%d' % bi, col, 0.72, 0.26))
        ob.location = (100, 100, 0)
        out.append(ob)
    return out


def _ground_plane(c0, c1, scale=18.0, rough=0.95):
    """★바닥 판은 **평평한 단색**이다. Blender 절차 노이즈는 주기가 P 와 안 맞아서
       타일 경계에 선을 만든다(씨멜리스가 깨진다). 질감은 감아 놓은 개체(풀·잔돌)가 낸다."""
    bpy.ops.mesh.primitive_plane_add(size=PERIOD * 4)
    g = bpy.context.object
    mid = tuple((a + b) * 0.5 for a, b in zip(c0, c1))
    g.data.materials.append(principled('agnd', mid, rough, 0.12))
    g.location = (PERIOD / 2, PERIOD / 2, 0)
    return g


def bake_grass_angled(name, seed, density, cols, hs, soil, flowers, samples=96):
    clear_meshes()
    random.seed(seed)
    _ground_plane(*soil)
    blades = _blade_meshes(cols, hs)
    def place(src, x, y):
        ob = src.copy(); scene.collection.objects.link(ob)
        s = random.uniform(0.72, 1.5)
        ob.location = (x, y, 0); ob.scale = (s, s, s * random.uniform(0.8, 1.35))
        ob.rotation_euler = (random.uniform(-0.16, 0.16), random.uniform(-0.16, 0.16), random.uniform(0, 6.283))
    n = int(PERIOD * PERIOD * density)
    for i in range(n):
        x = random.uniform(0, PERIOD); y = random.uniform(0, PERIOD)
        src = blades[random.randrange(len(blades))]
        st = random.getstate()                # 복제본이 같은 형태를 갖도록 상태 고정
        for dx in (-PERIOD, 0.0, PERIOD):
            for dy in (-PERIOD, 0.0, PERIOD):
                if dx or dy:
                    if not (-WRAP_MARGIN <= x + dx <= PERIOD + WRAP_MARGIN): continue
                    if not (-WRAP_MARGIN <= y + dy <= PERIOD + WRAP_MARGIN): continue
                random.setstate(st); place(src, x + dx, y + dy)
    fm = [principled('af1', (0.90, 0.90, 0.82), 0.6, 0.3), principled('af2', (0.86, 0.73, 0.22), 0.6, 0.3),
          principled('af3', (0.62, 0.50, 0.72), 0.6, 0.3)]
    for i in range(flowers):
        x = random.uniform(0, PERIOD); y = random.uniform(0, PERIOD); z = random.uniform(0.20, 0.34) * ZSQ_A
        mi = random.randrange(3)
        for dx in (-PERIOD, 0.0, PERIOD):
            for dy in (-PERIOD, 0.0, PERIOD):
                if dx or dy:
                    if not (-WRAP_MARGIN <= x + dx <= PERIOD + WRAP_MARGIN): continue
                    if not (-WRAP_MARGIN <= y + dy <= PERIOD + WRAP_MARGIN): continue
                bpy.ops.mesh.primitive_uv_sphere_add(radius=0.020, segments=8, ring_count=6,
                                                     location=(x + dx, y + dy, z))
                bpy.context.object.data.materials.append(fm[mi])
    scene.cycles.samples = samples
    _angled_camera(int(64 * PERIOD), int(32 * PERIOD))
    _p = os.path.join(OUT, name + '.png')
    render_now(_p); _wrap_corners(_p)


def bake_flat_angled(name, c0, c1, scale, pebbles=0, samples=64):
    """평평한 지면 질감(맨땅·진흙) — 세로 구조가 없어 각도 무관하지만 같은 조명·같은 주기로 굽는다."""
    clear_meshes()
    # ★★[T106 실측] 종전은 `random.seed(hash(name) & 0xffff)` 였다 — 파이썬 3 의 **문자열 `hash()` 는
    #   프로세스마다 다르다**(PYTHONHASHSEED). 같은 코드로 두 번 구워도 조약돌 자리가 달라져
    #   `mud_angled.png` 은 **재현이 불가능했다**(T101 이 `rock_render.py` 에서 잡은 그 함정과 같은 것).
    #   ⇒ 이름별 고정 시드라는 뜻은 지키되 값을 **정수로 못 박는다**(PYTHONHASHSEED=0 실측값).
    #   ⚠이 때문에 `mud_angled` 의 조약돌 배치는 배포본과 달라진다 — 옛 배치는 되살릴 수 없다.
    _SEEDS = {'mud_angled': 37335}
    random.seed(_SEEDS.get(name, sum(ord(c) * (i + 1) for i, c in enumerate(name)) & 0xffff))
    _ground_plane(c0, c1, scale)
    pm = principled(name + '_peb', (0.34, 0.31, 0.27), 0.9, 0.15)
    for i in range(pebbles):
        x = random.uniform(0, PERIOD); y = random.uniform(0, PERIOD)
        r = random.uniform(0.02, 0.06)
        for dx in (-PERIOD, 0.0, PERIOD):
            for dy in (-PERIOD, 0.0, PERIOD):
                if dx or dy:
                    if not (-WRAP_MARGIN <= x + dx <= PERIOD + WRAP_MARGIN): continue
                    if not (-WRAP_MARGIN <= y + dy <= PERIOD + WRAP_MARGIN): continue
                bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=8, ring_count=6,
                                                     location=(x + dx, y + dy, 0.01 * ZSQ_A))
                o = bpy.context.object; o.scale[2] = 0.5; o.data.materials.append(pm)
    scene.cycles.samples = samples
    _angled_camera(int(64 * PERIOD), int(32 * PERIOD))
    _p = os.path.join(OUT, name + '.png')
    render_now(_p); _wrap_corners(_p)


if 'angled' in _argv:
    # ★풀밭 본판 — 한국 초지(잡초·들꽃 섞임). 색은 기존 이웃과 같은 계열
    #   (bush 58,98,43 · tree 87,113,64 실측 — 배치 19 대조 시트 기준).
    bake_grass_angled('grass_angled', 1020, 190,
                      cols=[(0.19, 0.34, 0.10), (0.24, 0.38, 0.13), (0.15, 0.28, 0.09)],
                      hs=[0.32, 0.24, 0.42],
                      soil=((0.14, 0.17, 0.075), (0.23, 0.26, 0.12)), flowers=90)
    # ★마른땅/맨땅 — 풀이 성글고 흙이 드러난 뙈기. 지면 변주의 두 번째 층(저주파 마스크로 섞는다)
    bake_grass_angled('dry_angled', 7, 55,
                      cols=[(0.30, 0.32, 0.15), (0.34, 0.33, 0.18), (0.26, 0.28, 0.13)],
                      hs=[0.20, 0.16, 0.26],
                      soil=((0.24, 0.19, 0.11), (0.36, 0.29, 0.17)), flowers=8)
    # ★물밑 진흙 — ★풀 텍스처가 비치면 안 된다("반투명 풀" 사건). 물밑은 별도 재질이다.
    bake_flat_angled('mud_angled', (0.155, 0.135, 0.095), (0.26, 0.225, 0.155), 11.0, pebbles=70)
    print('DONE angled')
