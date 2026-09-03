# 인계 — ART 자산 — 렌더 스크립트·씬 정본·앵커 문법

> ★이 파일은 **영역 소유 세션만** 갱신한다. 다른 영역에 쓸 말이 생기면 `인계/회부.md` 에 한 줄.
> 영역 ART = `scripts/*_render.py` · `public/assets/**` · 앵커 JSON. 코드 접점은 클라 그리기 자리 몇 줄뿐이다.

## 0. 이 영역이 무엇인가

**그림은 코드가 아니다 — `.py` 가 정본이고 PNG 는 산물이다.** `.blend` 손편집 금지(다음 렌더가 덮는다).
런타임엔 **PNG + 앵커 JSON** 만 간다(Blender 는 굽는 기계다 · `char_render.py` 머리의 재민 확정).

## 1. 정본 스크립트 목록

| 스크립트 | 굽는 것 | 결과 | 앵커 |
|---|---|---|---|
| `scripts/building_render.py` | 움집 4단계·지붕 · 회관 지붕 · 곳간 · 노 3단계+완공 · 숯가마 2단계 | `public/assets/buildings/*.png` | `building_anchors.json` (클라 `20-r2-visibility.js` 의 A표에 **손으로 옮겨 적혀 있다** — `test-building-anchor.js` 가 대조) |
| **`scripts/props_render.py`** ★T67 신규 | **가구·시설 8종**(작업대·건조대·상자·모닥불·소금가마·벽·문·울타리) | `public/assets/props/*.png` + `public/assets/icons/item_*.png` | `public/assets/props/props_anchors.json` — 클라가 **읽는다**(사본 없음) |
| `scripts/nature_render.py` | 나무·덤불·풀·갈대·부들·꽃·이끼바위 | `public/assets/nature/*.png` | `nature_anchors.json`(클라가 fetch) |
| `scripts/icon_render.py` | 인벤 아이콘(자원·야금 사슬 등) | `icon_renders/*.png` → `icons-postprocess.js` → `public/assets/icons/` | 없음(bbox 중심) |
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

## 8. T67 배치 (2026-09-03) — 가구·시설 렌더

보고서 `보고/T67_2026-09-03.md`. 산출: 세계 14장 + 아이콘 8장 · 하네스 `test-props`(신규 `@regress`) ·
클라 접점은 `36-r2-building.js` 8절 교체 하나. 서버 무접촉 · econ 랩 적재 목록과 **교집합 ∅**.
