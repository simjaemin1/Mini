#!/usr/bin/env python3
# =============================================================================
# scripts/fields_render.py — 밭 세계 스프라이트 8군 × 4단계 [재민 확정 2026-09-04 · T79c]
#
# ★★밭이 작물을 안다. 여태는 몰랐다 —
#   `cropSprite()` 가 작물 종류를 **안 보고 좌표 해시 홀짝**으로 `grain`/`veg` 를 골랐다(T79 §0-ⓑ 실측).
#   벼밭이 채소로 그려질 수 있었다는 뜻이다. 이제 `crops.json` 의 **`group`** 으로 고른다.
#
# ★★새 모델 0 — 아이콘 빌더를 **밭 위에 심는다.**
#   `models_crops.py` 가 이미 34종을 아홉 빌더로 짓고 있다(`_ear`·`_pod`·`_leaf`·`_fruit`·`_tuber`…).
#   군마다 대표 하나를 골라 그 빌더를 **줄 맞춰 심을** 뿐이다. 모델을 다시 적으면 그게 사본이고,
#   아이콘을 고치는 날 밭이 조용히 갈린다(T67 캐논).
#   ⇒ `_plant()` 가 빌더가 만든 오브젝트를 **통째로 옮기고 줄인다**(`OBJS` 뒤쪽만 집는다).
#
# ★단계 — 0 갈은 흙 / 1 어린싹 / 2 자람(풋빛) / 3 익음.
#   2 와 3 은 **같은 빌더**를 크기·재질만 바꿔 부른다(자라는 건 같은 식물이다).
#
# ★줄 간격이 군마다 다르다 — 고증이다. 곡물은 줄이 촘촘하고 박과는 포기 사이가 넓다.
#   그래서 **단계 0(맨 흙)도 군마다 다르다** — 이랑 수가 다르니까.
#
# 실행:  python3 scripts/fields_render.py            (컨테이너 · pip `bpy` 5.0.1 — 굽는 기계 정본)
#        FIELDS_ONLY=grain_3,veg_0 … 일부만
# 결과:  public/assets/crops/<group>_<stage>.png  (64×64 · 512² 로 굽고 `rc.downscale_png` 로 줄인다)
# =============================================================================

import bpy, os, math, random, sys, json

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_common as rc
from render_common import (V, OBJS, add, box, cyl, cone, ico, plane, cord,
                           simple_mat, striped_mat, bumped_mat)
# ★씬과 팔레트는 `models_crops` 가 세운다 — 빌더가 그 팔레트를 물고 있어서 갈라 놓을 수 없다.
import models_crops as MC
from models_crops import M

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "field_renders")
os.makedirs(OUT, exist_ok=True)
DEPLOY = os.path.join(HERE, "..", "public", "assets", "crops")

# ★★[T101] `TILE = 1.0` — **한 셀은 1m 다.** 종전 1.8 은 `crop_render.py` 에서 물려받은 값인데,
#   그때는 아이콘 패스(bbox 맞춤)로 구워 절대 축척이 **정규화돼 사라졌다** — 그래서 안 들켰다.
#   세계 패스는 축척이 그대로 나온다: 1유닛 = 1셀 = 가로 64px 다이아 · z 1m = 32px(ZSQ).
#   ⇒ 밭 바닥이 정확히 셀 다이아가 되려면 TILE 은 1.0 이어야 한다(T67 "모델이 셀 경계에서 끝나게").
#   ⓘ 심는 것의 `s` 는 안 건드린다 — 옛 그림의 유효 축척이 ~33px/유닛이었고 세계 패스가 32px/유닛이라
#     같은 `s` 가 같은 크기로 보인다(§0-ⓑ 실측). 바뀌는 건 **바닥이 셀에 맞는 것**뿐이다.
TILE = 1.0
PX = 64                          # 배포 크기 — 셀 다이아 폭 64px(= TILE 1.0 · PPU 45.255 의 결과)

M['soil'] = bumped_mat("w_soil", (0.32, 0.22, 0.13), (0.20, 0.13, 0.07), 12, 0.6, 0.95)   # 갈아엎은 흙
M['sprout'] = simple_mat("w_sprout", (0.44, 0.66, 0.26), 0.55)                             # 떡잎·어린싹
M['unripe'] = striped_mat("w_unripe", (0.52, 0.66, 0.28), (0.42, 0.56, 0.21), 28, 0.58, bump=0.35, dist=3.0)  # 아직 풋빛인 이삭·꼬투리
#   ⚠1패스 (0.36,0.52,0.20) 은 64px 에서 **어두운 죽**으로 읽혔다 — 흙과 명도가 겹쳤다. 풋빛은 밝다.


# ═══════════════ 밭 바닥 · 줄 심기 (종전 `crop_render.py` 문법 그대로) ═══════════════
def soil_bed(furrows=4):
    """갈아엎은 흙 타일 + 이랑 — 전 단계 공통 바닥(단계 0은 이것만).

    ★★[T101] **이랑이 이웃 칸으로 이어지게** 놓는다(T67 벽·울타리가 푼 그 규약).
      ⓐ 바닥은 정확히 TILE×TILE — 셀 다이아 64×32 다.
      ⓑ 이랑은 **월드 +x 를 따라** 눕는다 = 셀 다이아의 한 변과 나란하다. 길이도 TILE 꽉.
         그래야 +x 이웃 칸의 이랑과 **끝이 맞닿는다**.
      ⓒ y 자리는 **주기적**이다: `(i+0.5)·TILE/furrows − TILE/2`. 종전은 가운데 64%에만 몰아
         놓아(`−0.32T + i·0.64T/(n−1)`) +y 이웃과 사이가 벌어졌다 — 빗살이 안 맞았다.
         주기로 놓으면 이웃 칸의 첫 이랑이 내 마지막 이랑에서 **한 칸 간격**으로 이어진다."""
    box(TILE, TILE, 0.06, (0, 0, 0.03), mat=M['soil'])
    for i in range(furrows):
        y = (i + 0.5) * (TILE / max(1, furrows)) - TILE * 0.5
        # ★이랑 굵기는 TILE 에 비례한다 — 옛 값 0.10 은 TILE 1.8 짜리였다. 그대로 두면
        #   1.0 바닥의 80%를 이랑이 덮어 **널빤지**로 읽힌다(1패스 실측).
        o = cyl(0.10 * TILE / 1.8, TILE, (0, y, 0.055), rot=(0, math.radians(90), 0),
                mat=M['soil'], verts=6, smooth=False)
        # ★★[T101 실측] 옛 `o.scale = (1.0, 1.0, 0.55)` 는 **이랑을 눕히는 게 아니라 잘랐다.**
        #   블렌더 오브젝트 행렬은 T·R·S — 스케일이 **로컬** 축에 먼저 걸린다. 이 원통은
        #   `rot_y=90°` 로 로컬 +Z 가 월드 +X 를 보므로 `scale.z` 는 **길이**를 0.55 로 줄인다.
        #   그래서 이랑이 칸의 55%만 덮고 끝이 이웃과 안 닿았다(4×4 이음새 그림 1패스에서 잡혔다).
        #   눕히려면 단면을 눌러야 한다: 로컬 +X 가 월드 −Z(높이)다 ⇒ `scale.x`.
        o.scale = (0.55, 1.0, 1.0)


def rows(n_per_row, n_rows, fn, jitter=0.06, seed=1):
    """이랑 위 규칙적 식재(약간의 흔들림) — 밭처럼 줄 맞춰 서게."""
    random.seed(seed)
    # ★[T101] 심는 자리도 **주기적**으로 — 이랑과 같은 사상이다(가운데 몰림 금지).
    #   여백은 한 칸 간격의 절반이라 이웃 칸의 첫 포기와 내 마지막 포기 사이가 같은 간격이 된다.
    for r in range(n_rows):
        y = (r + 0.5) * (TILE / max(1, n_rows)) - TILE * 0.5
        for c in range(n_per_row):
            x = (c + 0.5) * (TILE / max(1, n_per_row)) - TILE * 0.5
            fn(x + random.uniform(-jitter, jitter), y + random.uniform(-jitter, jitter), r * 10 + c)


def _plant(build, x, y, s, rz=0.0):
    """빌더가 원점에 지은 것을 **통째로** (x,y) 로 옮기고 s 배로 줄인다.

    ★빌더 본문은 절대 좌표로 짓는다(`ico(r, (x,y,z))`) — 인자로 자리를 못 준다.
      그래서 짓고 나서 **`OBJS` 의 뒤쪽만** 집어 옮긴다. 이래야 모델을 다시 안 적는다."""
    i0 = len(OBJS)
    build()
    ca, sa = math.cos(rz), math.sin(rz)
    for o in OBJS[i0:]:
        lx, ly, lz = o.location.x * s, o.location.y * s, o.location.z * s
        o.location = (lx * ca - ly * sa + x, lx * sa + ly * ca + y, lz)
        o.scale = (o.scale.x * s, o.scale.y * s, o.scale.z * s)
        o.rotation_euler.z += rz


def _sprouts(x, y, i, n=3, h=0.17, r=0.012):
    """어린싹 — 군을 안 가린다(막 난 싹은 다 비슷하다). 종전 `grain1` 문법."""
    for k in range(n):
        a = k * (2 * math.pi / n) + i
        cyl(r, h, (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, 0.14 + h * 0.5),
            rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), mat=M['sprout'], verts=5, smooth=False)


# ═══════════════ 8군 — 대표 빌더 · 줄 간격 · 크기 ═══════════════
# `group` 은 `server/crops.js` 가 정본이다(한글). 파일 이름은 슬러그를 쓴다 —
# `scripts/test-crops-world.js` 가 이 표와 서버 group 집합이 **1:1** 인지 잰다(사본 금지 · 족보 79).
GROUPS = [
    # (슬러그,   group(서버 정본), 줄×포기, 씨앗,  단계2 빌더,                단계3 빌더,                 s2,   s3)
    ('grain',   '곡물', (5, 4), 4, 601,
     lambda: MC._ear(M['unripe'], rows_n=8, per_row=4, spread=0.115, droop=0.10, awn=0.30, straw=False, sd=601),
     lambda: MC._ear(M['gold'],   rows_n=8, per_row=4, spread=0.115, droop=0.62, awn=0.35, sd=601), 0.36, 0.40),
    ('bean',    '콩류', (4, 3), 4, 602,
     lambda: MC._pod(M['leaf2'], M['unripe'], bean_r=0.10, per_pod=3, pods=2, sd=602),
     lambda: MC._pod(M['soy'],  M['podfuzz'], bean_r=0.115, per_pod=3, pods=3, sd=602), 0.40, 0.44),
    ('veg',     '채소', (4, 3), 3, 603,
     lambda: MC._leaf(M['leaf2'], M['leaf'], n=8, lw=0.42, ll=0.62, open_deg=84, sd=603),
     lambda: MC._leaf(M['leaf'], M['leaf2'], n=6, lw=0.40, ll=0.66, open_deg=74,
                      head=M['leafpale'], head_r=0.46, sd=603), 0.52, 0.56),
    ('spice',   '양념', (5, 4), 4, 604,
     lambda: MC._leaf(M['leaf'], M['leaf2'], n=5, lw=0.13, ll=0.86, open_deg=24, shank=0.40, tube=True, sd=604),
     lambda: MC._leaf(M['leaf'], M['leaf2'], n=5, lw=0.13, ll=1.00, open_deg=22, shank=0.62, tube=True, sd=604), 0.40, 0.44),
    ('gourd',   '박과', (2, 2), 2, 605,
     lambda: MC._fruit(M['leaf2'], L=0.62, D=0.30, calyx=True, sd=605),
     lambda: MC._fruit(M['gourdf'], L=1.02, D=0.52, neck=0.42, sd=605), 0.54, 0.56),
    ('special', '특용', (4, 4), 4, 606,
     lambda: MC._leaf(M['leaf'], M['leaf2'], n=7, lw=0.105, ll=0.40, open_deg=62, stalk=0.55, sd=606),
     lambda: MC._leaf(M['leaf'], M['leaf2'], n=15, lw=0.095, ll=0.52, open_deg=72, stalk=1.45, sd=606), 0.40, 0.42),
    ('oil',     '유료', (4, 3), 3, 607,
     lambda: MC._oil(M['leafpale'], capsule=True, sd=607),
     lambda: MC._oil(M['perilla'], capsule=False, sd=607), 0.42, 0.46),
    ('tuber',   '구황', (3, 3), 3, 608,
     lambda: MC._leaf(M['leaf2'], M['leaf'], n=5, lw=0.34, ll=0.52, open_deg=58, stalk=0.34, stalk_mat=M['leaf2'], sd=608),
     lambda: MC._tuber(M['taro'], kind='corm', R=0.42, lobes=5, hair=True, leaves=1, sd=608), 0.52, 0.54),
]
SLUGS = [g[0] for g in GROUPS]
STAGES = 4


def build(slug, stage):
    """한 장 — 밭 바닥 + (단계에 맞는) 심긴 것."""
    g = next(x for x in GROUPS if x[0] == slug)
    _, group, (per, nrow), furrows, sd, b2, b3, s2, s3 = g
    soil_bed(furrows=furrows)
    if stage == 0:
        return                                    # 갈은 흙 — 아직 심지 않았다
    if stage == 1:
        rows(per, nrow, lambda x, y, i: _sprouts(x, y, i), seed=sd + 1)
        return
    build_fn, s = (b2, s2) if stage == 2 else (b3, s3)
    random.seed(sd + stage)
    rz = [random.uniform(-0.5, 0.5) for _ in range(per * nrow)]
    k = [0]
    def one(x, y, i):
        _plant(build_fn, x, y, s, rz[min(k[0], len(rz) - 1)]); k[0] += 1
    rows(per, nrow, one, seed=sd + 2)


# ═══════════════ [T95] 농지 아이콘 — **세계와 같은 모델** ═══════════════
# ★T67 캐논: 물건 하나 = 모델 하나 = 렌더 둘. 빈 밭의 **세계 스프라이트는 여기 `grain_0`** 이고
#   짐 창의 `item_farmland` 도 **같은 `soil_bed`** 에서 나와야 한다.
#   `icon_render.py` 에 있던 옛 `m_item_farmland` 는 그 사본이었다 — T95 가 지웠다.
ICON_OUT = os.path.join(HERE, "..", "public", "assets", "icons")


def bake_farmland_icon(out_dir):
    """빈 밭(이랑만) 아이콘 — 세계 `grain_0` 과 같은 모델, 아이콘 프리셋으로 한 번 더."""
    OBJS.clear()
    soil_bed(furrows=4)                       # ★곡물 이랑 수 = `grain_0` 과 같은 값
    rc.bake_transforms()
    p = os.path.join(out_dir, "item_farmland.png")
    size = rc.render_icon_pass(OBJS, p)
    rc.cleanup()
    print(f"[fields] icon item_farmland: 512²  (bbox {size:.2f}m)")
    return p


# ═══════════════ 굽기 ═══════════════
# ★★[T101] 세계 스프라이트는 **세계 패스**로 굽는다 — 여태 아이콘 패스였다(T97 §0-ⓒ).
#   아이콘 패스는 시선이 `ISO_DIR`(1,−1,1.2)이고 z 압축·FLIP 이 없다. 그래서 나온 그림은
#   **정사각**이라 64×32 셀 다이아에 절대 안 맞았다 — 키워도 안 맞는다(투영이 다르다).
#   세계 패스(방위 45°/고도 30° · ZSQ · FLIP)로 구우면 TILE 1.0 바닥이 곧 셀 다이아가 된다.
#   규격은 가구와 같다: `ppu_mul=1`(게임 해상도 45.255px/m) · `ss=3`(초과표본, 축소로 되돌림).
#   ⇒ `rc.downscale_png` 는 이제 안 쓴다(세계 패스가 `_post_png` 로 되돌린다).
#   앵커는 `crops_anchors.json` — 클라가 `drawImage(im, x-ox, y-oy)` 만 하면 된다(델타 계산 0).
if __name__ == '__main__':
    ONLY = [k for k in os.environ.get('FIELDS_ONLY', '').split(',') if k]
    apath = os.path.join(OUT, "crops_anchors.json")
    anchors = {}
    if os.path.exists(apath):
        try: anchors = json.load(open(apath, encoding='utf-8'))
        except Exception: anchors = {}
    n = 0
    for slug in SLUGS:
        for st in range(STAGES):
            key = f"{slug}_{st}"
            if ONLY and key not in ONLY:
                continue
            OBJS.clear()
            build(slug, st)
            rc.bake_transforms()
            zm = rc.zmax()
            rc.squash_z()                          # ★게임 화법(1m=32px) — 정점 z 를 직접 누른다
            p = os.path.join(OUT, key + ".png")
            rec = rc.render_world_pass(OBJS, p, margin=2, ppu_mul=1, ss=3)
            rec["group"] = slug
            rec["stage"] = st
            rec["zmax_px"] = round(zm * 32.0, 2)
            anchors[key] = rec
            print(f"[fields] {key}: {rec['w']}×{rec['h']} anchor=({rec['ox']:.2f},{rec['oy']:.2f}) "
                  f"z {rec['zmax_px']:.1f}px objs={len(OBJS)}")
            rc.cleanup()
            n += 1
    json.dump(anchors, open(apath, "w", encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
    # ★[T101] 배치도 코드다 — 여태 `cp` 한 줄이 머리말 주석에만 있었다(구전 · T79c 축소 단계와 같은 함정).
    import shutil
    os.makedirs(DEPLOY, exist_ok=True)
    for k in sorted(anchors):
        src = os.path.join(OUT, k + ".png")
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(DEPLOY, k + ".png"))
    shutil.copy2(apath, os.path.join(DEPLOY, "crops_anchors.json"))
    print(f"[fields] 배치 -> {DEPLOY} ({len(anchors)}장 + 앵커)")
    if not ONLY or 'item_farmland' in ONLY:
        bake_farmland_icon(OUT)               # 512² — `icons-postprocess.js` 가 96px 로
        n += 1
    print("[fields] DONE ->", OUT, n, "장")
