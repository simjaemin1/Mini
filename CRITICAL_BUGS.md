# 중대 버그 사후 분석 (Critical Bug Postmortems)

겉증상과 진짜 원인이 달랐던 버그, 또는 한참 헤맸던 버그를 시간순으로 기록.
같은 함정에 두 번 안 빠지려고. (KNOWN_ISSUES.md는 일반 이슈 트래커, 여긴 사후 분석.)

각 항목 형식:
- **증상** (사용자가 본 것)
- **잘못된 가설** (먼저 의심한 것)
- **진짜 원인**
- **수정**
- **어떻게 찾았나**
- **교훈**

---

## 2026-05-31 · 계단 측면 차단 collider가 매 호출마다 quadtree query → 직진 중 snap-back

**증상**: 직선으로 쭉 걸어가는데 자꾸 뒤로 짧게 순간이동되며 버벅임. PVE 평지에서 계속.

**잘못된 가설**: 14.49-fix 평지 보정 임계가 또 빡빡한가? 네트워크 RTT 지터?

**진짜 원인**: 14.49-e3에서 추가한 `isBlockedByStairSide` 함수가 stair 위치 확인을 위해 매번 `qtBuildings.queryCircle()` 호출. 이 함수는 `isBlockedByWall`에서 매번 불림. player 이동 시 3회/tick, mob 200마리 × 2축 × 30Hz = 12,000 호출/초. 각 호출이 quadtree 쿼리 + 빌딩 iterate = ms 단위 지연. 누적되어 server tick이 33ms 한도 초과 → 클라 예측이 server 보다 앞서감 → snapshot 도착 시 server 위치(뒤)로 보정 → snap-back.

**수정 (14.49-e3-perf)**: `stairCellCache` Map 도입.
- `"cx_cy"` → `{stairId, step}` 미리 계산
- `findStairBuildingForCell` = O(1) Map lookup
- dirty flag로 stair 추가될 때만 rebuild

**교훈**:
- **새 collider 검사 추가할 때 호출 빈도 = entity 수 × tick 빈도 × 축 수.** ms 단위 함수도 1000× 호출되면 초 단위 부담.
- **Quadtree query는 cheap 아님.** O(log n) 이상 + JS object 할당. hot path엔 캐시 필수.
- **"왜 평지에서 뒤로 밀려?"의 원인은 평지 자체가 아님.** server CPU 부담이 원인 → 모든 곳에서 균등하게 snap-back 발생.

---

## 2026-05-31 · 26 컨테이너 × 30Hz × 1 vCPU → load 14, 직진 끊김의 진짜 원인

**증상**: stair cache 4번 깔아도 직진 walk 끊김 계속. e3-perf 시리즈 모두 적용 후에도.

**잘못된 가설** (네 단계 거침):
1. observer flap (e3 fix2): 사실이지만 그 후에도 끊김 → 다른 원인 있음
2. server stair check quadtree (e3-perf): 사실. cache로 mob 부담 1/100. 그래도 끊김
3. 클라 stair check (e3-perf3): 사실. cache로 client 부담 1/100. 그래도 끊김
4. findStairStepFor 별도 함수 (e3-perf4): 사실. 통합. 그래도 끊김

**진짜 원인 (실측)**: `docker stats` + `uptime`으로 봤더니 **load average 14.47/13.45/11.89 on 1 vCPU**. 한반도 컨테이너 자체는 3.7%인데, **26 zone × 평균 3-5% = 100%+ 합산**. OS scheduler가 컨테이너들 round-robin 처리 중 직진 player의 tick latency 발생 → 클라 snap-back.

stair 캐시는 한 컨테이너당 1-2% 줄여줬지만, **전체 26 컨테이너 합산이 1 vCPU 한계 넘는다는 구조 문제는 그대로**. e3-perf 4번을 깔아도 load 14 → 12 정도. 여전히 12배 과부하.

**진짜 수정 (e3-perf5)**: idle zone tick skip.
- 사람 player (isNpc=false) + observer 모두 0명인 zone은 매 tick 풀 처리 skip
- 사용자 한 명이 canada에 있으면 다른 25 zone은 거의 idle → 1 vCPU 부담 1/25 수준

**교훈**:
- **"성능 문제"를 가설로 추측하지 말고 즉시 실측.** `docker stats`, `top`, `uptime` 한 번이면 의미 없는 fix 4번 안 만들었을 거.
- **OS-level metric (load avg)을 application-level metric (per-container CPU)보다 먼저 확인.** load 14 = 명백한 CPU 포화. 개별 컨테이너 3.7%만 봤으면 "괜찮은데?" 오판.
- **micro-optimization (cache)와 architectural fix (idle skip)는 다른 부류.** 컨테이너가 너무 많으면 cache 아무리 해도 한계. 호출 빈도 자체를 줄이거나 (idle skip), 컨테이너 수 줄이거나 (Stage 2 multi-zone host), 코어 늘리거나 (vCPU 업그레이드).
- **유료 인프라 (vCPU 업그레이드)는 무료 코드 fix 다 시도 후에만.** 단, 무료 fix가 효과 없으면 미루지 말고.

---

## 2026-05-31 · stair cache TDZ — 모든 zone 컨테이너 부팅 실패 (TDZ 두 번째)

**증상**: 14.49-e3-perf 배포 직후 모든 zone 컨테이너에 WS 연결 실패 ("Could not connect to the server"). 클라가 ws://...:3001 등 어떤 zone에도 못 붙음.

**진짜 원인**: `stairCellCache`/`stairCellDirty` 선언이 line 3007 (`isBlockedByWall` 근처). 그런데 `addBlock`이 line 595 (spawnNpc 내부)에 정의, 모듈 init 단계의 NPC 마을 spawn(line 714 spawnNpc 호출)에서 `addBlock(.., 'stair', ..)` 호출 시 `stairCellDirty = true` 시도 → TDZ ReferenceError → 모듈 throw → 컨테이너 즉시 죽음.

같은 함정 (2026-05-30 WATER_TILES BUILDING_SIZE TDZ)이 두 번째. 이번엔 함수 선언이 아니라 `let`/`const` 변수.

**수정**: 선언을 FLOOR_HEIGHT 옆 line 247로 끌어올림. 함수 `rebuildStairCellCache` 등은 그대로 둠 (함수 선언은 hoist되어 정의 위치 무관).

**교훈**:
- **TDZ는 같은 함정에 두 번 빠진다.** const/let 사용 시 항상 "모듈 init 시 누가 누구를 부르나" 순서 추적.
- **새 cache 변수 추가 시, 그 cache를 dirty 마크하는 코드가 어디서 호출되는지 trace.** 모듈 init 코드(spawn, generate 등)에서 부르면 위로.
- **함수 호이스팅 vs let 호이스팅 차이를 명심.** `function foo()` 선언은 위에서 호출 가능. `const foo = () => {}`는 안 됨. `let bar`도 안 됨.

---

## 2026-05-31 · 시야 "셀 계단" 원인 — canvas 배경이 보였던 거 (5번 추측 헛짚음)

**증상**: 사용자가 "시야가 셀 단위로 보임, 계단모양"이라고 반복 호소. 스크린샷도 첨부.

**잘못된 가설 5번 연속**:
1. coneMultGround 함수 (per-tile cone math) → 부드럽게 조정. 안 됨.
2. VIEW_RADIUS 너무 작음 → 1500으로 확대. 안 됨.
3. radial gradient overlay 약함 → 강하게 조정. 안 됨.
4. per-tile alpha 계산 잔존 → visibility = 1로 통일. 안 됨.
5. tile 경계 anti-aliasing 문제? → 추측만, 시도 안 함.

**진짜 원인**: `if (!zMeta) continue;` — zone 데이터 없는 영역엔 tile 자체를 안 그림. canvas는 `#0a0d10` 어두운 배경. zone 없는 cell 위치에 그 배경이 그대로 노출 → 다이아몬드 모양 "구멍" → 사용자가 "셀 계단"으로 인식.

캐나다 같은 월드 경계 zone에선 인접 zone들이 observer 연결 안 됐을 때 그 방향 cell들이 다 zone 데이터 없음 → 다이아몬드 구멍 패턴.

**수정**: `!zMeta`에서 continue 대신 placeholder 다이아몬드(`#222a33`, alpha 0.4) 그림. vignette가 부드럽게 덮음.

**교훈** (가장 큰 교훈):
- **"시야가 X"라는 시각 문제는 추측 말고 무엇이 그려지고 무엇이 안 그려지는지 코드로 한 번에 확인.** canvas 배경, fillStyle, continue, alpha — 모든 가능성 1분 grep로 다 보고 시작.
- **사용자가 "여전히 X"라고 5번 반복하면 그건 내 모델이 틀린 신호.** 다른 가설 try 말고, 코드 처음부터 재독.
- **렌더링 디버깅 = "안 그려진 곳에 무엇이 보이나"부터.** 안 그려진 = 배경 노출 = canvas clear 색상. 그게 다이아몬드 패턴이면 tile shape의 hole.

---

## 2026-05-31 · entityVisibility scope: worldCx ReferenceError (scope 함정 3번째)

**증상**: 14.49-e6 배포 후 렌더링 중단. `ReferenceError: Can't find variable: worldCx`.

**진짜 원인**: 모듈 top-level에 새 helper `entityVisibility` 추가하면서 `worldCx`, `worldCy` 사용. 근데 그 두 변수는 `function render()` **안** 로컬. 호출하는 쪽에서만 보임.

**수정**: `worldCx === myAbsPredicted.x` (카메라 = 플레이어 중심) 이므로 `myAbsPredicted` 직접 참조로 교체. `myAbsPredicted`는 모듈 top-level이라 모든 함수에서 접근 가능.

**교훈 (3번째 scope 사고)**:
- **새 helper 함수를 만들기 전, 사용할 변수가 어느 scope에 있는지 먼저 확인.** render() 안 변수는 render() 밖 함수에서 안 보임.
- **모듈 top-level 함수 = 모듈 top-level 변수만 안전.** 더 deep nested function의 로컬 변수 참조하려면 파라미터로 전달.
- 같은 함정: BUILDING_SIZE (클라/서버), TDZ (stair cell cache), 이제 worldCx. 점점 패턴 보임.

---

## 2026-05-31 · 계단 그림 BUILDING_SIZE ReferenceError — 모든 빌딩 렌더링 중단

**증상**: `[Error] ReferenceError: Can't find variable: BUILDING_SIZE at drawBuildingIso`. 한 줄 에러로 전체 빌딩 그림이 안 그려져서 맵이 거의 비어 보임.

**진짜 원인**: 서버 코드의 상수명(`BUILDING_SIZE`)을 그대로 클라 코드에 복붙. 클라에는 그 이름의 변수가 없음 (`CL_BUILDING_SIZE`만 정의됨).

**수정**: `BUILDING_SIZE` → `CL_BUILDING_SIZE` 4곳 모두.

**교훈**:
- **서버에서 클라로 코드 이식할 때 변수명은 무조건 다시 확인.** 서버 상수가 클라에 똑같이 있다고 가정 X.
- **`node --check`로는 ReferenceError 안 잡힘** (선언 안 된 변수도 valid syntax). 브라우저 콘솔에서만 잡힘.
- 큰 함수에서 새 코드 추가 시, 그 함수에서 평소 쓰는 변수 prefix(여기선 `CL_`)를 미리 살펴봐야 함.

---

## 2026-05-30 · 자동 계단이 floor 변경 → 0F 벽 무력화 (벽 통과 버그)

**증상**: 캐나다에서 산책하다 갑자기 벽을 통과해 다님. "이건 무슨 일?"

**잘못된 가설**: 서버 CPU 포화로 isBlockedByWall 미작동.

**진짜 원인**: 14.49-c "PZ식 자동 계단"이 NPC 마을 stair 타일에 무차별 반응:
1. 플레이어가 NPC 마을 산책 중 우연히 stair 타일(NPC 집 옆) 위로 걸어감
2. 0.7초 후 floor 0 → 1로 자동 ascent
3. **stair에서 벗어나면 transition 취소하면서 floor는 1로 유지**
4. 1F에는 건축물 없음 (NPC 집은 모두 0F) → 0F 벽들이 1F 플레이어를 안 막음
5. **0F 벽들 전부 그냥 통과** = 산책 자유

**수정 (14.49-fix2)**:
1. 자동 floor 변경 코드 일시 제거. z 시각 효과만 유지 (계단 위에 서있을 때 16px 살짝 올라감).
2. floor 변경은 기존처럼 `,`/`.` 키로만 가능.
3. welcome 시 `initFloor = 0` 강제 — 이미 stuck된 사용자 복구.

**교훈**:
- **"자동" UX는 짜릿하지만 무차별 트리거 가능성 항상 검토.** PZ 진짜 계단은 hand-crafted 맵에서만 작동. 프로시저럴 환경에서 무차별 자동화는 위험.
- **floor 변경 같은 "상태 전이"는 명확한 사용자 의도 신호 필요.** 우연한 보행으로 floor 바뀌면 안 됨.
- **벽 통과 버그는 collider 자체 문제일 거라 가정하기 쉽지만**, 실제론 "비교 대상이 다른 floor"인 경우가 많음. floor mismatch 항상 우선 의심.
- 진짜 PZ식 계단은 **방향(dir) + entry/exit 지점**을 명시한 2-tile 구조로 다시 설계해야 함. 그건 별도 Phase에서.

---

## 2026-05-30 · NPC A* pathfinding이 한반도 zone CPU 폭발

**증상**: 14.49 배포 후 한반도(NPC 많은 zone) 컨테이너가 hang. 클라 콘솔에 `WebSocket failed: Could not connect` + `[recover] primary 재연결` 폭주. 자원·NPC 다 멈춤. 추가로 집 벽 콜라이더도 작동 안 함 (= 서버가 tick 못 돌려서 isBlockedByWall 검사 못 함).

**잘못된 가설**: WS 핸드셰이크 자체 문제 / 자원 broadcast 문제.

**진짜 원인**: A* pathfinding 비용 미산정. NPC ~200마리 × TICK 30Hz × A* maxCells=1500 expansion × 각 expansion당 quadtree 쿼리 = **분당 ~5억 quadtree 호출**. 컨테이너 CPU 100% 도달 → tick 완료 못 함 → WS keepalive 못 응답 → 클라 끊김.

**수정 (14.49-fix)**:
1. wander/flee 모드는 A* 안 함 (beeline). 짧은 거리·random target에 A* 낭비.
2. **straightPathClear raycast 먼저** — 직선이 깨끗하면 A* 스킵 (압도적 다수 케이스).
3. NPC당 A* 호출 최소 2초 간격 (per-NPC throttle).
4. maxCells 1500 → 200, searchRadius 48 → 24 cell.
5. NPC AI 루프에 **시간 예산 15ms** — 넘으면 남은 NPC는 다음 tick.

**교훈**:
- **새 알고리즘 추가할 때 "전체 부하 = 단가 × 호출 수" 항상 계산.** 단가 4ms도 200회면 800ms로 tick 33ms 한참 넘김.
- **MMO에서 무차별 A*는 죽음.** 직선 raycast 같은 cheap fast-path 먼저, 비싼 A*는 정말 필요할 때만.
- **CPU 포화 = 모든 게 망가짐.** 콜라이더 검사가 안 돌면 클라가 벽 통과 (= 본 적 없는 망가짐). 단일 원인이 다중 증상 만듦.
- **시간 예산 가드는 안전망.** "이론적으로 빠른 코드"가 어쩌다 폭주해도 tick은 살리기.

---

## 2026-05-30 · observer WS open/close flap → "자원이 갑자기 사라짐"

**증상**: 한반도 zone에서 한참 놀다 보면 갑자기 근처 나무·돌·mob이 다 사라짐. "서버 끊긴 거 아냐?"

**잘못된 가설**:
1. 자원이 시간 지나면서 채집돼서 자연 감소했나? → harvested_seeds 카운트 확인 필요
2. 청크 deactivate 캐스케이드? → 단일 player 이동만으로는 안 일어남
3. 서버 컨테이너가 죽었다 살아남? → `docker inspect RestartCount` 0, 메모리 37MB로 멀쩡
4. DB wipe 때문? → harvested_seeds 안 건드림

**진짜 원인**: 클라이언트 `manageNeighborSubscriptions`가 매 프레임 (60FPS) observer WebSocket 연결을 열고 → 즉시 닫음 → 1초에 60+회 WS 핸드셰이크 폭격 → 서버 부하 → tick broadcast 누락 → 자원 update 클라에 안 도착.

코드 (`public/client.js` 1208-1211):
```js
// 옛 코드 (BUG)
const cx = zm.worldOffsetX + zoneW / 2;   // ← zoneW = primary 거
const dist = Math.hypot(cx - myAbsPredicted.x, cy - myAbsPredicted.y);
if (dist > zoneW * 1.7) closeConnection(zid);
```

`zoneW`는 primary zone(한반도, 작음) 거인데 거리 계산은 이웃 zone(jungwon_n, bering — 거대) 중심까지. 큰 이웃은 항상 `primary zoneW * 1.7`보다 멀어서 매 프레임 close 판정.

옛날 1024×1024 정사각 zone일 땐 모두 같은 크기라 우연히 동작. Phase 14.46-a-v8(zone 크기 제각각) 도입과 동시에 잠재 버그가 깨어남.

**수정**: 이웃 zone 자기 크기 기준으로 임계 계산 + 엣지까지 거리(중심 X) 사용 (`14.46-b-smooth-fix2`)

```js
const nZoneW = zm.zoneWidth || 1024;
const nZoneH = zm.zoneHeight || 1024;
const edgeDistX = Math.max(0, Math.max(zm.worldOffsetX - myAbsPredicted.x, myAbsPredicted.x - (zm.worldOffsetX + nZoneW)));
const edgeDistY = Math.max(0, Math.max((zm.worldOffsetY||0) - myAbsPredicted.y, myAbsPredicted.y - ((zm.worldOffsetY||0) + nZoneH)));
const edgeDist = Math.hypot(edgeDistX, edgeDistY);
if (edgeDist > PEEK_THRESHOLD * 1.6) closeConnection(zid);
```

**어떻게 찾았나**:
1. 처음엔 `harvested_seeds` 폭증, day/night, vision cone 등을 의심 → 다 빗나감
2. 사용자가 브라우저 콘솔 던져줌 → TLS health 에러 90+개가 도배 중
3. health 폴링 자동 중단 코드 추가 + 사용자에게 `-TLS` 콘솔 필터 안내
4. 노이즈 제거 후 진짜 메시지 보임: WebSocket 연결 실패 100+개, 모두 zone 3015/3016, 모두 `manageNeighborSubscriptions:1211` → `closeConnection:842` 호출 스택
5. 1211줄 가서 한 번에 원인 파악

**교훈**:
- **콘솔 노이즈는 그 자체로 디버깅 방해 — 노이즈 끄는 것도 디버깅의 일부.** health 폴링 같은 "조용히 실패해도 무관한 것"은 실패가 누적되면 stop 해야 함.
- **변수 크기를 정규화에서 다양화로 바꿀 때, 옛 코드가 "우연히 동작하던 것"을 다 뒤져야 함.** zone 크기 제각각으로 바꾼 뒤로 zoneW를 hardcode-처럼 쓰던 코드 모두 점검 대상.
- **컨테이너 메트릭이 멀쩡해도 클라가 폭격 중일 수 있음.** 서버는 평온, 클라가 자해 중.
- **"갑자기"라는 사용자 표현 ≠ 진짜 갑자기.** 사용자는 누적된 효과의 결과를 한 순간으로 느낌.

**재발 (같은 날 오후)**: 동일 증상 다시 발생. 콘솔 스택 trace의 line이 1211→1230로 밀려있어 의심. 확인 결과 fix2가 git push 안 됐음. **교훈 추가**: 비슷한 line 번호로 동일 에러 보이면 "fix가 안 깔린 것"부터 의심하자. Stack trace의 함수 이름이 같으면 거의 100% 동일 버그.

---

## 2026-05-30 · 바다에 나무·돌이 떠있음

**증상**: 해안선 추가(`14.46-b-mini`) 후 바다 water tile 위에 나무·돌이 그려짐.

**잘못된 가설**: 클라 렌더링 z-order 문제 / 해안선 노이즈 어긋남.

**진짜 원인**: `generateChunkResources`는 water tile 존재를 모름. 청크 안 아무 데나 자원 spawn. `activateChunk`에서 spawn된 자원을 broadcast하는데 water tile 필터 없음.

**수정** (`14.46-b-smooth-fix`):
- `activateChunk`에서 자원 broadcast 전에 `isWaterTileLocal(r.x, r.y)` 체크 → 스킵
- `spawnMob`에서 랜덤 위치도 water tile 회피 (재시도 30회)

**교훈**:
- **새 콜라이더 추가 시 spawn 로직 전부 재검토.** 콜라이더는 "이동 차단"만 보지만, spawn은 "유효 위치 판정"이라 별개 로직.
- **DB wipe 없이도 fix 효과 보려면 청크 deactivate→activate 사이클이 한 번 돌아야 함.** 또는 명시적 cleanup 패스 추가.

---

## 2026-05-30 · WATER_TILES BUILDING_SIZE TDZ로 모든 zone 컨테이너 크래시

**증상**: `14.46-b-mini` 배포 직후 26 zone 컨테이너 모두 시작 실패.

**진짜 원인**: `const WATER_TILES = generateCoastlineWaterTiles(..., BUILDING_SIZE, ...)`가 line 157인데 `const BUILDING_SIZE = 32`는 line 218. 모듈 top-level 실행 순서상 BUILDING_SIZE가 TDZ(Temporal Dead Zone)에서 참조됨 → ReferenceError → 즉시 크래시.

**수정**: 리터럴 `32` 직접 사용 (BUILDING_SIZE 대신).

**교훈**:
- **`const`/`let`은 hoist 되지만 TDZ에 갇혀 있어 위에서 못 씀.** `function` 선언과 다름.
- **모듈 top-level에서 다른 const 참조할 때는 정의 순서 명시적으로 신경 써야 함.** 함수 안에서만 쓸 거면 호이스팅 덕분에 안전.

---

## 2026-05-30 · WASD 방향 3차례 reverting

**증상**: WASD 매핑이 직관 어긋남 (W 누르면 화면 오른쪽 위로 감 등).

**잘못된 가설 1**: 월드 N=화면 ↗이라 W가 NW면 화면 정 위 → 진실, 하지만 "정상 정 위"를 원함
**잘못된 가설 2**: 스크린 기준 단위벡터 (cos/sin) 사용 → (-0.95, -0.32) 같은 추한 값 + 대각선 이동 시 어색

**진짜 원인 + 수정**: 사용자가 "씨발 지금 45도만 회전시키면 된다고" → 각 키가 월드 대각선 단위벡터 contribute. W=NW(-1,-1), D=NE(1,-1), S=SE(1,1), A=SW(-1,1). 정규화. 깔끔.

**교훈**:
- **아이소메트릭 게임에서 방향 매핑은 "화면 cardinal" vs "월드 cardinal" 중 하나. 둘 다 만족시키려 하면 추함.** 우리는 화면 cardinal 선택 = 월드 대각선.
- **사용자 분노는 가장 빠른 디버거.** 머리로 추론하지 말고 그냥 원하는 걸 듣자.

---

## 2026-05-30 · 핸드오프 시 '?' 유령 캐릭터

**증상**: 다른 player가 zone 경계 넘으면 잠깐 이름 없는 '?' 캐릭터가 보임.

**진짜 원인**: 핸드오프 중인 player(`handingOff=true`)의 옛 zone이 계속 tick 브로드캐스트에 포함시킴. 새 zone에선 또 새로 등장. 클라 입장에선 같은 pid의 두 entity가 잠깐 공존.

**수정**: 서버가 handingOff player를 tick에서 제외 + visibleNeighbors에서도 필터.

**교훈**: **핸드오프는 두 zone 사이 "임계 상태"고, broadcast 통제권을 누가 가지는지 명시적으로 빼야 함.** 평화로운 정상 시각 갭이라도 클라엔 깜빡임 + 유령으로 보임.

---

## 2026-05-30 · 평지에서 걷다가 짧게 뒤로 끌리는 느낌

**증상**: 평지 직진 중에 가끔 짧게 뒤로 끌림.

**잘못된 가설**: 해안선 콜라이더 boundary 문제 (사용자가 "해안선 근처에서"라고 안 함 → 알아서 추측한 게 빗나감).

**진짜 원인**: 클라 `applyServerCorrection` 임계가 16px로 너무 빡빡. 평지에서 RTT 지터(20~30px 드리프트)만 있어도 80ms 짧은 lerp 발동 → "짧게 뒤로 끌림". + 서버 입력 타임아웃 1초도 짧아서 잠깐 네트워크 끊기면 vx/vy=0으로 멈춤 → 클라는 계속 예측 → snapshot 도착 시 뒤로 끌림.

**수정**: 임계 `16→48px`, lerp `80→150ms`. 서버 입력 타임아웃 `1000→2500ms`.

**교훈**:
- **wall stuck용으로 빡빡하게 잡은 임계가 평지에선 노이즈로 작동.** "정확성"과 "체감 부드러움"은 다른 목표.
- **사용자가 "X 근처에서"라고 안 했으면 임의 가설 세우지 말고 물어보자.** 시간 낭비 줄임.

---

## 형식 메모

새 항목 추가할 때 위 템플릿 따르기. 특히 **잘못된 가설** 섹션은 같은 함정 피하려고 꼭 적기.

세부 fix 코드는 git log/PHASE_NOTES.md에서 찾으면 되고, 여긴 "왜 헤맸나/어떻게 찾았나" 위주로.
