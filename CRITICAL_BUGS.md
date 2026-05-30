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
