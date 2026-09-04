# crop_render.py — durango-mini 작물 밭 4단계 스프라이트 (icon_render.py / rock_render.py v3 와 동일 씬)
#   곡물(grain: 벼·조·기장 계열) · 채소(veg: 잎채소·박 계열) × 4단계(갈은 흙 / 어린싹 / 자람 / 익음) = 8장.
#   고증: 청동기 후기(송국리) — 이랑 갈아엎은 흙 + 재래 곡물. 30종 개별 구분은 하지 않음(32px에서 판독 불가).
# 실행: blender -b -P crop_render.py   → ./crop_renders/{grain,veg}_{0..3}.png (512², 알파)
import bpy, os, math, random, sys

# ★★[T79] 헬퍼·씬 값·프리셋은 `scripts/render_common.py` 한 벌이다(T77) — 여기 두 번 적지 않는다.
#   이 파일이 갖는 것은 **모델(밭 4단계)과 팔레트**뿐이다.
#   ⓘ `blender -b -P` 로 부르면 스크립트 폴더가 `sys.path` 에 없다 — 직접 넣는다.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render_common import (V, RES_ICON, SAMPLES, ISO_DIR, OBJS,
                           principled, simple_mat, striped_mat, bumped_mat,
                           add, box, cyl, cone, ico, plane, cord)
import render_common as rc

RES = RES_ICON                                   # 종전 이름 유지
HERE = os.path.dirname(os.path.abspath(__file__))
OUTDIR = os.path.join(HERE, "crop_renders")
os.makedirs(OUTDIR, exist_ok=True)

# ===== 씬 — 정본은 render_common.build_scene =====
scene, cam, cam_d, sun, tgt = rc.build_scene("crop")

# ===== 팔레트 — 이 파일의 것 =====
M = {
    'soil':   bumped_mat("c_soil",  (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95),
    'sprout': simple_mat("c_sprout",(0.44, 0.66, 0.26), 0.55),
    'green':  simple_mat("c_green", (0.32, 0.52, 0.18), 0.6),
    'ripe':   simple_mat("c_ripe",  (0.78, 0.66, 0.24), 0.65),
    'head':   simple_mat("c_head",  (0.86, 0.74, 0.30), 0.7),
    'leaf':   simple_mat("c_leaf",  (0.30, 0.50, 0.17), 0.55),
    'leaf2':  simple_mat("c_leaf2", (0.42, 0.60, 0.22), 0.55),
    'fruit':  simple_mat("c_fruit", (0.70, 0.62, 0.22), 0.5),
}

TILE = 1.8
def soil_bed(furrows=4):
    """갈아엎은 흙 타일 + 이랑 — 전 단계 공통 바닥(단계 0은 이것만)."""
    box(TILE, TILE, 0.12, (0, 0, 0.06), mat=M['soil'])
    for i in range(furrows):
        y = -TILE * 0.32 + i * (TILE * 0.64 / max(1, furrows - 1))
        o = cyl(0.10, TILE * 0.96, (0, y, 0.13), rot=(0, math.radians(90), 0), mat=M['soil'], verts=6, smooth=False)
        o.scale = (1.0, 1.0, 0.55)

def rows(n_per_row, n_rows, fn, jitter=0.06, seed=1):
    """이랑 위 규칙적 식재(약간의 흔들림) — 밭처럼 줄 맞춰 서게."""
    random.seed(seed)
    for r in range(n_rows):
        y = -TILE * 0.32 + r * (TILE * 0.64 / max(1, n_rows - 1))
        for c in range(n_per_row):
            x = -TILE * 0.36 + c * (TILE * 0.72 / max(1, n_per_row - 1))
            fn(x + random.uniform(-jitter, jitter), y + random.uniform(-jitter, jitter), r * 10 + c)

# --- 곡물(벼·조 계열) ---
def grain0(): soil_bed()
def grain1():
    soil_bed()
    def one(x, y, i):
        for k in range(3):
            a = k * 2.1 + i
            cyl(0.012, 0.17, (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.22),
                rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), mat=M['sprout'], verts=5, smooth=False)
    rows(5, 4, one, seed=11)
def grain2():
    soil_bed()
    def one(x, y, i):
        for k in range(4):
            a = k * 1.6 + i * 0.7
            cyl(0.014, 0.52, (x + math.cos(a) * 0.04, y + math.sin(a) * 0.04, 0.39),
                rot=(math.sin(a) * 0.22, -math.cos(a) * 0.22, 0), mat=M['green'], verts=5, smooth=False)
    rows(5, 4, one, seed=12)
def grain3():
    soil_bed()
    def one(x, y, i):
        for k in range(4):
            a = k * 1.6 + i * 0.7
            tilt = 0.30
            cyl(0.015, 0.62, (x + math.cos(a) * 0.045, y + math.sin(a) * 0.045, 0.44),
                rot=(math.sin(a) * tilt, -math.cos(a) * tilt, 0), mat=M['ripe'], verts=5, smooth=False)
            # 고개 숙인 이삭
            ico(0.055, (x + math.cos(a) * 0.16, y + math.sin(a) * 0.16, 0.72), subdiv=2,
                mat=M['head'], scale=(0.7, 0.7, 1.9), smooth=True)
    rows(5, 4, one, seed=13)

# --- 채소(잎채소·박 계열) ---
def veg0(): soil_bed(furrows=3)
def veg1():
    soil_bed(furrows=3)
    def one(x, y, i):
        for k in range(2):
            a = k * 3.0 + i
            o = plane(0.10, 0.16, (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.19),
                      rot=(math.radians(62), 0, a), mat=M['sprout'])
    rows(4, 3, one, jitter=0.05, seed=21)
def veg2():
    soil_bed(furrows=3)
    def one(x, y, i):
        # ★4단계와 구분: 잎이 아직 **세워져 있고 작다**(결구·열매 없음)
        for k in range(5):
            a = k * 1.26 + i * 0.5
            d = V((math.cos(a) * 0.50, math.sin(a) * 0.50, 0.86)).normalized()
            o = plane(0.11, 0.26, (x, y, 0.20), mat=(M['leaf'] if k % 2 else M['leaf2']))
            o.location = (x + d.x * 0.07, y + d.y * 0.07, 0.20 + d.z * 0.09)
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
            o.scale = (0.40, 1.0, 1.0)
    rows(4, 3, one, jitter=0.05, seed=22)
def veg3():
    # ★3단계(잎만)와 확실히 구분: 잎을 더 벌리고 **결구(속이 찬 통배추형) + 열매**를 크게 얹는다.
    soil_bed(furrows=3)
    def one(x, y, i):
        for k in range(8):
            a = k * 0.79 + i * 0.5
            d = V((math.cos(a) * 0.95, math.sin(a) * 0.95, 0.35)).normalized()   # 더 눕혀 벌어진 겉잎
            o = plane(0.19, 0.52, (x, y, 0.20), mat=(M['leaf'] if k % 2 else M['leaf2']))
            o.location = (x + d.x * 0.20, y + d.y * 0.20, 0.20 + d.z * 0.10)
            o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
            o.scale = (0.55, 1.0, 1.0)
        ico(0.16, (x, y, 0.34), subdiv=2, mat=M['leaf2'], scale=(1.0, 1.0, 1.15), smooth=True)   # 결구(속)
        ico(0.085, (x + 0.13, y - 0.10, 0.30), subdiv=2, mat=M['fruit'], scale=(1.0, 1.0, 0.9), smooth=True)   # 열매
    rows(4, 3, one, jitter=0.05, seed=23)

JOBS = [("grain_0", grain0), ("grain_1", grain1), ("grain_2", grain2), ("grain_3", grain3),
        ("veg_0", veg0), ("veg_1", veg1), ("veg_2", veg2), ("veg_3", veg3)]


for (key, fn) in JOBS:
    OBJS.clear()                 # ★[T79] 공용 `OBJS` 를 **비운다** — 새 리스트로 갈면 헬퍼와의 결속이 끊긴다
    fn()
    print("[crop] render", key, "objs=", len(OBJS))
    rc.render_icon_pass(OBJS, os.path.join(OUTDIR, key + ".png"))
    rc.cleanup()
print("[crop] DONE ->", OUTDIR)
