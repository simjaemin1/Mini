# 인계 — ART 자산 — 렌더 스크립트·씬 정본·앵커 문법

> ★이 파일은 **영역 소유 세션만** 갱신한다. 다른 영역에 쓸 말이 생기면 `인계/회부.md` 에 한 줄.
> 영역 ART = `scripts/*_render.py` · `public/assets/**` · 앵커 JSON. 코드 접점은 클라 그리기 자리 몇 줄뿐이다.

## 0. 이 영역이 무엇인가

**그림은 코드가 아니다 — `.py` 가 정본이고 PNG 는 산물이다.** `.blend` 손편집 금지(다음 렌더가 덮는다).
런타임엔 **PNG + 앵커 JSON** 만 간다(Blender 는 굽는 기계다 · `char_render.py` 머리의 재민 확정).

## 1. 정본 스크립트 목록

| 스크립트 | 굽는 것 | 결과 | 앵커 |
|---|---|---|---|
| **`scripts/render_common.py`** | ★렌더 **공용 정본** — 재질 문법·기하 헬퍼·씬·프리셋 둘·후처리. 그림은 안 만든다 | — | — |
| `scripts/building_render.py` | 움집 4단계·지붕 · 회관 지붕 · 곳간 · 노 3단계+완공 · 숯가마 2단계 | `public/assets/buildings/*.png` | `building_anchors.json` (클라 `20-r2-visibility.js` 의 A표에 **손으로 옮겨 적혀 있다** — `test-building-anchor.js` 가 대조) |
| **`scripts/props_render.py`** ★T67 신규 · T72 확장 | **가구·시설 8종**(작업대·건조대·상자·모닥불·소금가마·벽·문·울타리) + **손도구·손에 드는 것 13종**(§9) | `public/assets/props/*.png` + `public/assets/icons/*.png` | `public/assets/props/props_anchors.json` — 클라가 **읽는다**(사본 없음) · 아이콘은 앵커 없음 |
| `scripts/nature_render.py` | 나무·덤불·풀·갈대·부들·꽃·이끼바위 | `public/assets/nature/*.png` | `nature_anchors.json`(클라가 fetch) |
| `scripts/icon_render.py` | 인벤 아이콘(자원·야금 사슬 등) · **공용 모듈 씀** | `icon_renders/*.png` → `icons-postprocess.js` → `public/assets/icons/` | 없음(bbox 중심) |
| `scripts/crop_render.py` | 작물 4단계 | `public/assets/crops/` | — |
| `scripts/char_render.py` | 캐릭터 스프라이트시트 | `public/assets/char/` | 프레임 상자 메타 JSON |
| `scripts/bridge_render.py` | 다리 | `public/assets/bridge/` | — |
| `scripts/bake-mountain.py` · `pack-mountain.py` | 산 | `public/assets/mountains/` | `mountain_anchors.json` |

## 2. 씬 값 — **무변**이다(그림이 한 몸이어야 한다)

전 스크립트 공통: Cycles · `film_transparent` · ORTHO · `SAMPLES 64` · `view_transform Standard` ·
월드 배경 `(0.52,0.56,0.6) @ 0.55` · 태양 고도 52° · energy 3.6 · angle 0.2 ·
OIDN 은 빌드 옵션으로 자동 감지(우분투 apt 빌드·pip `bpy` 둘 다 없음 → 자동 비활성).

두 씬이 갈리는 자리는 **여기뿐**이다:

| | 세계(아이소) — building/nature/props/char | 아이콘 — icon/props |
|---|---|---|
| 카메라 방위·고도 | 45° / 30°(`NHAT`) — 게임 투영 `w2i(wx,wy,wz)={x:wx−wy, y:(wx+wy)/2−wz}` 와 같은 손방향 | `ISO_DIR (1,−1,1.2)` — 방위 −45° / 고도 40.3°("정면 살짝 위") |
| 배율 | `ortho_scale = Wpx / PPU`, **PPU = 64/√2 = 45.255 px/유닛**(1유닛=1셀=1m, 셀 다이아 가로 64px) | `ortho_scale = bbox×1.25+0.5`(물건마다 다름) |
| z 압축 | **ZSQ = 32/(PPU·cos30°) = 0.8165** — 게임 화법 1m=32px. ★오브젝트 scale 이 아니라 **정점 z** 를 직접 누른다(회전된 로컬 z 는 월드 z 가 아니다) | 없음 |
| 좌우 FLIP | **있다** — Blender TRACK_TO 는 화면 오른쪽이 (−1,+1,0)인데 게임은 +x 가 오른쪽이다 | 없음 |
| 태양 방위 | **−35°**(FLIP 보정 뒤 기존 베이크와 같은 방향) | **+35°** |
| 해상도 | 화면 bbox 맞춤 1:1 (props 는 SS=3 초과표본 뒤 되돌림) | 512² → bbox 크롭 → 96px(`icons-postprocess.js`) |

### ★★함정 — `ortho_scale` 은 **긴 변**을 잡는다 [T67 실측 · 값 비쌌다]

`sensor_fit` 이 기본 `AUTO` 면 `ortho_scale` 은 렌더의 **긴 변**에 걸린다.
건물·자연물 스프라이트는 늘 **가로가 길어** 이 함정이 안 드러났는데, 가구는 **세로가 긴 것이 절반**이다
(벽 43×88 · 문 45×90 · 울타리 46×58 · 건조대 38×56). 그대로 두면 그 그림들이 h/w 배로 **확대돼 가운데만 찍힌다** —
1패스에서 문설주 둘이 화면 밖으로 나가고 문짝만 꽉 찬 그림이 나왔다(알파 덤프로 잡았다 · 문은 2.0배였다).
⇒ **`cam_d.sensor_fit = 'HORIZONTAL'` 을 못 박아라.** 그래야 `ortho_scale = Wpx/PPU` 가 언제나 PPU 를 뜻한다.
(선례: `scripts/bake-terrain-tex.py:256` 이 같은 이유로 이미 못박아 뒀다 — 그 줄을 못 보고 두 시간을 썼다.)
⚠**`nature_render.py`(333) · `char_render.py`(801) 는 아직 안 못박혀 있다** — 회부(`인계/회부.md`).

## 3. 앵커 문법 — **그리기 자리에 맞춘다**

클라는 언제나 `ctx.drawImage(sp, x − sp._ox, y − sp._oy)` 로 그린다. `(_ox,_oy)` 는 **모델 로컬 원점의 이미지 안 픽셀 좌표**이고,
로컬 원점을 어디에 두느냐가 규약이다. 원점을 **그 타입의 그리기 좌표 `(x,y)` 가 뜻하는 월드 점**에 두면 클라의 델타 계산이 0줄이 된다.

| 자산 | 로컬 원점 | 근거 |
|---|---|---|
| 건물(움집·노·숯가마·곳간) | 발자국+오버행의 **북서 모서리** 지면 | 클라가 `(x0−0.5, y0−0.5)셀`까지의 델타를 iso 로 변환해 붙인다 |
| **가구 — 덩어리형**(작업대·건조대·상자·모닥불·소금가마·울타리) | **셀 중심**의 지면 | 서버가 `b.x = cx*32 + 16`(`addBlock`·`doBuild` 의 `gx`) |
| **가구 — 변형**(벽·문) | **밑변 한가운데**의 지면 | 서버가 `b.x = cx*32`(`addWall`)이고 그리기 코드가 그 점을 밑변 중점으로 쓴다(밑변 `(x−16,y−8)~(x+16,y+8)` = 월드 축 −0.5..+0.5m) |
| 자연물 | 지면 원점(0,0,0) | `nature_render.py render()` |

계산식(`props_render.render_world` · `nature_render.render` 동형):
```
u = v·RHAT·PPU ,  w = −v·UHAT·PPU        (정점 전수)
Wpx = ceil(umax−umin) + 2·margin ,  Hpx = ceil(wmax−wmin) + 2·margin
ox  = Wpx/2 − (umin+umax)/2 ,  oy = Hpx/2 − (wmin+wmax)/2
```
★**앵커 표를 클라에 옮겨 적지 마라.** 가구는 `/assets/props/props_anchors.json` 을 **fetch 해서 읽는다**
(자연물과 같은 규약). 옮겨 적으면 다시 굽는 날 두 벌이 갈린다(족보 79) — 건물 A표가 아직 그 사본이고,
그래서 `test-building-anchor.js` 라는 대조기가 따로 필요하다.

## 4. 렌더 둘 규약 — **물건 하나 = 모델 정의 하나 = 렌더 둘** [재민 확정 2026-09-03]

가구는 **해체하면 인벤에 들어간다**(`doDismantleBuilding` → `BUILDING_TYPE_TO_ITEM` → 가구 그 자체 환원).
그래서 세계에 선 모습과 인벤 아이콘이 **같은 물건**으로 보여야 한다.

`props_render.py` 는 모델 함수를 **한 번** 부르고, **그 같은 오브젝트로** 두 장을 잇달아 굽는다:

```
build(**kw) → transform_apply → [i==0 이면] render_icon(512²)   ← 압축 전
                              → _squash_z(ZSQ) → render_world(1:1) ← 압축 후
```
아이콘은 그 가구의 **첫 세계 변형**에서 나온다(벽=`wall_n` · 문=`door_n` · 상자=`chest` · 울타리=`fence_ns`).
모델을 두 번 적지 않는다 — 두 벌이 되는 순간 둘은 갈린다.
⇒ 그래서 **`icon_render.py` 의 가구 5종(벽·문·울타리·상자·모닥불) 모델은 T67 이 지웠다.** 남기면 사본이다.
(바닥·계단·농지 셋은 아직 세계 스프라이트가 없어 `icon_render.py` 에 남아 있다 — 회부.)

## 5. 크기 정본은 **서버**다

`server/zone.js` 의 `BUILDING_HEIGHT`(px · 32px = 1m)가 가구 높이의 정본이다.
`props_render.py` 의 `PROPS` 표가 `body_px + flame_px = BUILDING_HEIGHT[btype]` 을 선언하고,
`scripts/test-props.js` 가 **zone.js 소스를 직접 읽어** 대조한다(사본 금지).
`flame_px` 는 **코드가 몸체 위에 얹는 상태 그림**의 몫이다 — 지금은 모닥불 불꽃 10px 하나뿐이다.

⚠**`BUILDING_HEIGHT` 는 지금 아무도 안 읽는다**(전수 grep 1건 = 선언뿐). 무해해 보이는 이유는
"아무도 안 읽어서"이고, 그건 족보 (89) 가 말한 **아직 안 터진 것**이다. T67 이 이 표를 **그림의 정본으로 삼아**
읽는 자리를 하나 만들었다(하네스). 서버가 이 값을 쓰기 시작하면 그림도 따라와야 한다 — 회부.

## 6. 굽는 절차

```
# 컨테이너(권장) — pip 모듈 bpy 5.0.1
pip install bpy --break-system-packages         # ~1분 · numpy 를 1.26.4 로 내린다(opencv 경고는 무해)
python3 scripts/props_render.py                 # 전 14장 + 아이콘 8장 · 약 60초
PROPS_ONLY=chest,wall python3 scripts/props_render.py   # 일부만

# Blender 바이너리(있으면)
blender -b -P scripts/props_render.py

# 배치
cp scripts/props_renders/*  public/assets/props/
node scripts/icons-postprocess.js scripts/props_icon_renders public/assets/icons
node scripts/test-props.js
```
★**pip `bpy` 로 구운 그림이 Blender 바이너리 산물과 같은지 확인했다**(T67 §0):
`BLD_ONLY=furn_s1 python3 scripts/building_render.py` 로 기존 자산을 다시 구워
**치수 200×117 · 앵커 (100.0, 15.3) 이 한 자리도 안 달라졌고**, 픽셀은 평균차 1.5/255 · 최대 223(몬테카를로 잡음 몇 점)였다.
⇒ 실루엣·정렬·빛은 같고 **표본만 다르다**. md5 는 다르다(3-자산 규약과 같은 성질).

## 7. 고증 앵커

청동기 후기(송국리). 금속은 **구리/청동 톤만 — 철기 금지**. 못·경첩 없음(새끼줄·나무못).
벽은 **지상 통나무 벽(굴립주 벽주)**, 지붕은 맞배 이엉. 곡면 문법 — 직육면체만 쓰지 마라(`char_render.py` 2차 규약):
통나무·기둥은 n각 프리즘, 돌·흙덩이는 타원체, 판재·문짝은 상자(각진 물건이라 그게 맞다).

## 8-A. 지금까지 구운 아이콘 — 그리고 남은 것

| 묶음 | 키 | 어디서 굽나 |
|---|---|---|
| 자원·야금 36종 | `pillar rafter thatch berry fiber meat_raw meat_cooked hide berry_jam water_bottle seed_berry herb ore wood plank stone ore_chunk iron_ore charcoal iron meteoric_iron copper tin lead silver gold nickel jade_raw` + `item_floor item_stair item_farmland` | `icon_render.py` |
| **가구 8종**(T67) | `item_wall item_door item_fence item_chest item_campfire item_workbench item_drying_rack item_salt_kiln` | `props_render.py` `PROPS` — **세계 스프라이트와 같은 모델** |
| **손도구·손에 드는 것 13종**(T72) | `crude_axe crude_pick crude_blade axe pickaxe sword carrier fish fish_cooked salt brine twig pebble` | `props_render.py` `ITEMS` — 지금은 아이콘만(세계·손 렌더는 `world=[…]` 붙이면 같은 모델에서) |
| **먹을 것 18종**(T76) | 어종 8 `salmon cod herring trout pollock carp shrimp crab` · 갯벌 4 `oyster seaweed abalone fresh_water` · 보존식 6 `dried_fish dried_oyster dried_seaweed smoked_meat dried_fruit pickled_veg` | 〃 · 어종 여덟은 **한 몸틀** `_finfish()` 에서, 보존식 셋은 **원물과 같은 함수**에서 |

**남은 것**(다음 ART 카드 순서, 회부에 등재):
작물 34 + 씨앗 34(`crop_render.py` 와 **같은 모델**에서 수확물을 뽑는다 · T77) → 옷 · 나머지.
그리고 **재료별 도구 아이콘**(§0-ⓐ — 지금은 품목당 하나) · 지게 등짐 스프라이트 · 계단·바닥·농지 세계 스프라이트.

## 9-A. 모델 재사용의 세 층 [T76]

| 층 | 뜻 | 예 |
|---|---|---|
| **같은 함수 · 다른 인자** | 한 모델이 상태로 갈린다. 바이트까지 검증 가능 | `_fish(cooked/dried)` · `_oyster(dried)` · `_seaweed(dried)` · `_gourd_bottle(salty)` · `m_chest(exchange)` |
| **같은 몸틀 · 다른 비례** | 여러 품목이 한 빌더에서 나온다 | `_finfish(L,D,H,barbels,dorsals,spots…)` → 어종 여섯 |
| **못 하는 것** | 원물 모델이 **다른 파일**에 있다 | `dried_fruit`←`berry` · `smoked_meat`←`meat_raw` (둘 다 `icon_render.py`) |

★셋째 층이 지금 이 레포의 한계다. `icon_render.py` 와 `props_render.py` 가 **씬·재질·헬퍼를 각자 갖고** 있어서
모델을 옮기면 사본이 된다. 푸는 길은 공용 모듈(`render_scene.py` + 모델 모듈) 하나뿐이고 별도 카드다(회부).

★★**같은 함수 재사용은 말이 아니라 바이트로 증명한다.** T76 이 `m_brine` 을 `_gourd_bottle(salty=True)` 로
갈아 끼우고 다시 구웠더니 **최대 화소차 0**(T72 산출물과 바이트 동일)이었다. `fish`·`fish_cooked` 도
`_fish` 에 `dried` 인자를 더한 뒤 **바이트 동일**을 확인했다(그래서 지느러미 재질은 안 고치고 `fin2` 를 새로 뒀다).
⇒ 리팩터가 그림을 안 건드렸다는 것을 **주장하지 말고 재라.**

## 9. 아이콘 크기 문법 — **상대 크기는 보존되지 않는다**

`scripts/icons-postprocess.js` 는 알파 bbox 로 자른 뒤 `scale = 96 / max(bb.w, bb.h)` 로 **96px 를 꽉 채운다.**
그래서 자갈 한 줌과 지게가 화면에서 **같은 크기**로 뜬다 — 상대 크기 규약은 **없다**(T72 §0-ⓒ 실측).
⇒ 작은 물건은 크기가 아니라 **개수와 담긴 그릇**으로 말한다: 소금은 토기 접시 위 결정 무더기,
자갈·잔가지는 한 줌·한 단. 기존 36종(`stone`·`ore_chunk`·`gold`)이 이미 그 문법이다.
바꾸려면 키마다 상대 배율 표가 필요하고 **기존 36종을 전부 다시 구워야** 한다 — 별도 카드.

## 8. T67 배치 (2026-09-03) — 가구·시설 렌더

보고서 `보고/T67_2026-09-03.md`. 산출: 세계 14장 + 아이콘 8장 · 하네스 `test-props`(신규 `@regress`) ·
클라 접점은 `36-r2-building.js` 8절 교체 하나. 서버 무접촉 · econ 랩 적재 목록과 **교집합 ∅**.

## 10. T72 배치 (2026-09-03) — 아이콘 1차 13장

보고서 `보고/T72_2026-09-03.md`. `props_render.py` 에 `ITEMS` 표를 더했다(같은 씬·같은 재질 — 파일을 새로 파면 씬이 두 벌이 된다).
하네스 `test-icons`(신규 `@regress`). **게임 코드 diff 0** — 클라 배선(`43-i-icon.js` 두 줄)은 T66 뒤로 **회부**했다.
`ico()` 에 `smooth` 인자를 열었다(기본값이 종전과 같아 T67 가구 14장은 한 픽셀도 안 바뀐다).

## 11. T76 배치 (2026-09-03) — 아이콘 2차 18장

보고서 `보고/T76_2026-09-03.md`. 어종 8 + 갯벌 4 + 보존식 6. **게임 코드 diff 0**(배선은 여전히 T66).
`_finfish()` 몸틀 하나에서 어종 여섯이 나오고, 보존식 셋은 원물과 **같은 함수**에서 나온다(§9-A).
`test-icons` 를 31키로 넓히고 **계보 검사**(서버 `spoil.PRESERVE` 짝 + 같은 모델 함수)를 더했다.
★계보를 **픽셀 상관으로는 못 가른다**는 것을 측정으로 확인했다 — 자세한 수치는 보고서 §3.

## 12. T77 배치 (2026-09-03) — 렌더 공용 모듈

`icon_render.py` 와 `props_render.py` 가 같은 헬퍼를 **두 벌** 적고 있던 것을 한 벌로 합쳤다.
84장 `cmp` 0 (같은 컨테이너·같은 bpy·옛 코드 대조군). 보고: `보고/T77_2026-09-03.md`.

### ★★새 모델을 지을 때의 문법 — T79 부터 이대로

1. **헬퍼는 다시 적지 않는다.** `def box`/`def ico`/`def simple_mat` … 을 렌더 스크립트에 쓰면
   그 순간 두 벌이 된다. `from render_common import (…)` 로 가져다 쓴다.
   새 모델군은 `models_<군>.py` 에 두고, 그 파일도 헬퍼는 공용에서 가져온다.
2. **재질은 표(팔레트)로, 파일마다.** 공용 모듈은 재질 **문법**(`simple_mat`·`striped_mat`·
   `bumped_mat`)만 갖는다. 색은 파일이 자기 `M` 에 갖는다 — icon 의 `stone` 과 props 의 `stone` 은
   **다른 돌**이라 합치면 그림이 바뀐다(T77 §0-ⓒ 실측: 키 교집합 셋).
   Blender datablock 이름엔 **접두**를 붙인다: icon `i_` · props `p_`/`f_`/`t_` · 새 군은 새 접두.
3. **렌더는 프리셋 이름으로.** 카메라·조명·해상도를 손으로 세우지 않는다.
   `rc.render_icon_pass(objs, path)` (아이콘) · `rc.render_world_pass(objs, path)` (세계).
   씬은 `rc.build_scene("<태그>")` 한 줄로 선다.
4. **기본값을 생략하지 마라 — 명시로 쓴다.** 합치면서 두 판의 기본값이 갈렸던 인자
   (`ico.subdiv` · `ico.smooth` · `cyl.verts` · `cyl.smooth` · `striped_mat.rough`/`bump`)는
   지금 전 호출부가 **명시**한다. `scripts/test-render-common.js ④` 가 그것을 지킨다.

### 갈렸던 기본값 (합친 값 ≠ icon 옛값인 것 — 새 코드가 조심할 자리)

| 인자 | icon 옛 기본값 | 합친 기본값 | 생략하면 |
|---|---|---|---|
| `ico.subdiv` | 2 | **1** | 면이 성겨진다 |
| `ico.smooth` | True | **False** | 각이 산다(둥근 몸엔 틀리다) |
| `cyl.verts` | 24 | **12** | 원통이 각져 보인다 |
| `cyl.smooth` | (없음=끔) | **True** | 옆면이 매끄러워진다 |
| `striped_mat.rough` | 0.75 | **0.8** | 살짝 덜 반짝인다 |
| `striped_mat.bump` | 0.3(하드) | **0.35** | 결이 살짝 깊어진다 |

### ★함정 — `o.bound_box` 는 **캐시**다 [T77 실측 · 비쌌다]

정점(`v.co`)을 직접 만진 뒤에는 뎁스그래프가 한 번 돌아야 `o.bound_box`·`o.matrix_world` 가
갱신된다. 아이콘 프리셋은 그 bbox 로 프레임을 잡으므로, 갱신을 놓치면 **지터 전 경계**로 찍는다.
`ico()` 안의 `bpy.ops.object.shade_smooth()` 가 오퍼레이터라 그 한 바퀴를 **부작용으로** 돌려
주고 있었다 — 그래서 지금까지 맞았다. 폴리곤 루프로 바꾸거나 `o.scale` 을 앞으로 옮기면
그 갱신이 사라지고 `hide`·`meat_cooked` 두 장의 중심이 밀린다(z 0.0189 → 0.0300 실측).
props 가 멀쩡한 이유도 같다 — 거기선 렌더 직전 `bake_transforms()` 가 늘 캐시를 씻는다.
⇒ **정점을 만지는 새 헬퍼를 쓸 때는 오퍼레이터의 부작용에 기대지 마라.** 바로잡는 것은 회부했다.

### ★자를 조심해라 — 저장소 PNG 는 **대조군이 아니다** [T77]

`icon_render.py` 산출 31장은 **원래 Blender 4.0.2 로 구운 것**이다(그 뒤로 다시 안 구웠다).
지금 컨테이너의 pip `bpy` 5.0.1 로는 **옛 코드로 구워도** 평균 8–26/255 다르다.
그래서 "저장소 PNG 와 `cmp` 0" 은 리팩터의 합격선이 못 된다.
**옳은 자**: 같은 컨테이너·같은 bpy 로 **옛 코드를 다시 구워** 대조군을 만들고, 새 코드와 `cmp`.
겸사겸사 확인할 것 둘 — ⓐ 같은 코드 두 번 굽기가 `cmp` 0 인가(굽기가 결정적인가),
ⓑ 부분 굽기(`ICON_ONLY=`)와 전체 굽기가 같은가(부분 대조가 유효한가). T77 은 둘 다 확인했다.

### 굽는 시간 (컨테이너 pip `bpy` 5.0.1 · SAMPLES 64 · CPU)

| 스크립트 | 장수 | 시간 |
|---|---|---|
| `props_render.py` | 세계 14 + 아이콘 39 | 2분 39초 |
| `icon_render.py` | 아이콘 31 | 2분 55초 |
| `icons-postprocess.js` (70장) | — | 1초 미만 |
