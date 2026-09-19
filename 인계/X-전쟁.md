# 인계 — X 전쟁

> ★이 파일은 **영역 소유 세션만** 갱신한다. 다른 영역에 쓸 말이 생기면 `인계/회부.md` 에 한 줄.
> 원문은 `_아카이브_2026-08_다음세션_인계.md` 에 그대로 동결돼 있다(족보 · 삭제 금지).
> 영역 배정(재민 09-14): WAR = 세션7(T290 뒤). ⚠T284 는 재민 지시로 **세션10** 이 실행했다(보고 머리 참조).

## X-1. ★★2026-09-14 — T284 전투 실체화: 좌표계 하나 · 장애물은 존의 것 · 전투 = 연속 상태

> 정본 `설계/설계_전쟁_플레이어.md` §1(재민 확정 일곱). 보고 `보고/T284_2026-09-16.md`. 하네스 `scripts/test-war-world.js`.
> 이 절 전에 있던 것(130×130 로컬 전장 · 맵↔로컬 미러 · 가짜 건물 22채 · 20Hz 서브루프 · 판 · 200초 강제결판 ·
> 관측자 없으면 headless 수 결판)은 **전부 걷어냈다.** 되돌리는 손잡이는 없다 — 캐논 위반 제거라 끔 팔이 없다.
> 대신 결정성이 자다(하네스 ⓓ: 관측자 켬/끔 세 시드 한 글자 동일).

### 영역(파일)

| 파일 | 무엇 | 이 카드 뒤 |
|---|---|---|
| `sim/battle-core.js` | 병종·사기·궤주·화살·파손·상성 수식(랩과 같은 파일) | 수식 무변. `ctx.world` 어댑터(장애물·엄폐·전진·궤주 방향·추격 없음) · `u.ctl`(대형이 모는 병사는 전투 스텝 건너뜀) · 존 ctx 엔 판 결과 없음 · `genForest`/`ctx.trees`/`ctx.buildings` 삭제 · 독립 실행(랩·`runBattleHeadless`)은 어댑터 없음 = 빈 들판 · `DEPLOY_W/H` 는 표준 배치 폭일 뿐 |
| `sim/war-core.js` | 선포·명분·군량·결단·항복·조공·포로·정산 | **무변**(0줄). 호스트가 `onEngage` 로 계기를 받는다 |
| `server/war-live.js` | 대형(_mu*) + 교전(fight) 기하 | 전면 교체 — `makeFight/enlist/stepFight/settle` · 병사 x/y 는 player px 에 **묶인 접근자** |
| `server/villages.js` 전쟁 절 | 몸(행군·주둔·교전·귀환) · 징발 · 방어 포진 · 정산 계기 · `warThreats` | 전면 교체(`// P3 — 실체 전쟁` 절) · `_vbFootprint`(건물 발자국 한 곳) |
| `server/zone.js` | `war_command_join`(근접 검증 · 바인딩 dormant) · `/perf` | `tickHz` 주입 · `/perf` 에 `war` 칸과 `tick.ms`(관측자) |
| `public/client/35-x-war.js` | 관전·지휘·지시자 HUD | `phase==='standoff'` → "대치" 한 낱말 |

### 좌표계 하나

* 1셀 = 1m = 32px(`zone.js` "32px=1m" · `villages SZ=32`). `war-live` 의 `M_PER_CELL = cellPx/pxPerM`(지금 1) 하나가 환산이다.
* 병사 = 마을 NPC(`players` 의 pid · `_muster`·`simWar`). 대형 병사(gu)와 전투 병사(bu)의 `x/y` 는 **그 player 의 px 를 읽고 쓰는 접근자**다 — 복사본도 미러도 없다.
* 교전 스텝 = 존 틱 한 번(`tickWarBodies` · dt = 1/TICK_HZ 고정). 벽시계 dt·서브스텝·예산·동시 상한 없음.
* 장애물 = `isTerrainBlockedLocal`(물·바위·도랑·다리) + **건물 행 발자국**(`village_buildings` → `_vbFootprint` · 큰집 8×8 · 움집/쉼터/의뢰집 6×4 · 곳간 5×3). 청크 활성과 무관(관측자 무관). 지형 술어는 교전마다 메모(`_warTerrBlocked`).
* ~~⚠**나무는 아직 안 본다**~~ — **X-3 에서 닫혔다**(2026-09-19). 그 사이 T301 이 관측자 무관 색인을 세웠고, 전쟁은 이제 나무를 본다(장애물·시야·엄폐).
* 존 이동 자체는 건물을 본다 — `isBlockedByWall`(벽 변·울타리 셀 · 활성 청크의 buildings) · 나무·바위는 `treeBlockerAt`. 평시 NPC 가 집을 뚫는 일은 없다(§0-ⓑ 표).

### 연속 전투 — 전이

| 상태 | w.phase / op | 누가 모나 | 들어가는 계기 | 나가는 계기 |
|---|---|---|---|---|
| 행군·주둔(form) | march / march·camp·siege | 대형(`_muStepFollow`·포진) | 선포 | war-core 결단 assault·sortie → `onEngage` |
| 전진(advance) | battle / assault | 전진 쪽: 행군로 위 대형 → 곧은 길이 열리고 거리 ≤ WAR_ENGAGE_R 이면 풀림(전투 스텝) · 지키는 쪽: 대형 | `_warEngage` | 접촉 → 교전 · 진척 없음 n초 → 대치 |
| 교전(engaged) | battle | battle-core 스텝(양쪽) · 지키는 쪽은 물러나는(ctl) 적을 쫓지 않음 | 접촉(`st` 가 melee·shoot) | 궤주 → 정산 · 접촉 없음 n초 → 대치 · 지휘관 후퇴(`_warOrderFallback`) |
| 대치(standoff) | march / camp | 대형(공격은 주둔점으로 걸어서 · 방어는 포진점으로) | 위 | war-core 결단(다음 날): assault·sortie → 전진 · 항복 · 철수 |
| 정산 | return | 귀환 대형 | 궤주(`M_BREAK`) · 항복(`_opCheckSurrender`) · 철수(결단 — 군량 0) · 무저항(`_warWalkoverOutcome`) | 귀환 완료 → 해제 |

* **n초** = 근접 교전 거리 13m ÷ 교전 본대 행군 속도(battle-core `_cen.march`) — 창방패 1.5 m/s 면 8.7초, 장창이 끼면 9.3초. 값 후보는 재민(보고 §0-ⓒ).
* 정산은 `war-live.settle` 이 **한 번만**(게이트). 궤주·철수(교전 있었음) → `warResolveBattle(w, day, {res})` · 항복·무저항 → war-core 가 이미 정산(기록만) · 철수(교전 없음) → 정산 없음(`withdrawQuiet`).
* 교전 중(w.phase=battle)엔 war-core daily 가 그 전쟁을 건너뛴다(군량 시계 정지) — 대치로 떨어지면 다시 돈다. 교전이 끝없이 이어지는 경우는 없다: 접촉이 있으면 사기가 결판을 내고, 없으면 n초 뒤 대치다.
* 항복/철수 구별 = 그날 war-core `stats().surrender` 증분(읽기만). 같은 날 둘이 겹치면 곳간이 더 빈 쪽이 항복.
* **WAR_OPS=0**(P1 폴백 손잡이)은 war-core daily 가 eta 에 스스로 정산한다 — 몸은 걷다가 `withdrawQuiet` 로 해제된다(war-core 무변 규칙상 그대로 둠).

### 성능 자

* 자는 `scripts/war-world-perf.js`(계측기 · 러너 밖): 틀 세계(실지도 전 마을 · 생활층 · 야생 · 캐러밴 · 시드 1020)를 키운 DB 를 팔마다 복사 → 존 + 관측자 하나 → `/perf` 의 `tick.ms`(존 틱 본문) · `tick.dropN`(T153 빚) · `war`(전쟁 틱 전체/교전 중 p50·p95 · 병사 최대 · 전이 통계).
* 표는 보고 §0-ⓓ. 컨테이너 2코어 — VPS 와 절대값이 다르다(비율만). VPS 실측은 배포 뒤 재민(`/perf` 의 `war`·`tick.ms`).

### 함정

1. **대형 추종 한 걸음 상한 `FOLLOW_CAP`(5셀/틱)은 옛 랩 행군 값이다** — 30Hz 로 부르면 뒤처진 병사가 초당 150m 로 따라붙는다. 행군 페이싱이 econ 날짜라 생긴 값이고 이 카드는 건드리지 않았다(교전 뒤 재편·주둔 복귀·포진 복귀는 행군 속도 상한을 쓴다). 회부.
2. 대형 슬롯 걸음이 막히면 몸의 행군로(`body.pts`) 위로 우회한다(`g.detour`). 행군로는 코스 격자 A*(4셀)라 좁은 바위 모서리를 자를 수 있다 — 그 칸에서 병사가 잠깐 선다.
3. 전진은 **행군로를 따라** 적 대형 원점의 투영점까지 간다. 방어가 출격했는데 공격이 아직 주둔점에 못 왔으면(econ 날짜 페이싱) 길 위에서 만난다 — 하네스 ⓖ 첫 판이 그 모양이었다.
4. `_warBlockedCell` 대조 팔(`state._warNoCollide`)은 하네스 전용이다. 운영 코드엔 그 값을 세우는 줄이 없다.
5. `sim/_*-probe.js` 여럿(`_battle-core-verify`·`_war-probe`·`_captive`·`_return`·`_s1-mirror`·`_scramble`·`_siege`)은 **main 에서 이미 exit 1** 이었다(09-16 실측). `_p3-war-probe`·`_livebattle-probe` 는 옛 API 전용이라 지웠다(test-war-world 가 대체).

### 회부 — 동원의 대가(재민 09-17 · `인계/회부.md` WAR 절 ①~⑦)

징발자가 경제에선 계속 일함(pid↔econ npc 끈 없음) · `_laborMul` 서버 엔진 미소비 · 행군 군량 미환급·궤주 시 팩 소멸·부족↔사기 무관 · 군량이 `food` 한 칸만 봄(품목 무시) · 창·장창·도끼·화살 재고 없이 생김 + 소집 반출/복귀 반납 없음 · 아무 때나 소집(기습). → P4-3 한 카드로. 부하는 게임일 1회 장부 연산(추정 수 ms 이하).

## X-2. ★★2026-09-19 — T295 동원의 대가: 징발자는 생산에서 빠진다 · 군량은 한 번 싣고 한 곳에서 돌려준다

> 카드 `지시/지시_T295.md`. 보고 `보고/T295_2026-09-19.md`. 하네스 `scripts/test-war-world.js` 절 ⓗ~ⓚ.
> 재민 캐논(09-17): *"일을 안 하니 자연히 동결"* · *"규모 비례 적재 → 부족하면 사기↓ → 복귀 시 잔량 곳간 복귀(끝난 방식과 무관)"*.
> X-1(T284) 의 회부 ①~④ 를 닫은 자리다. ⑤(무기 재고) · ⑥(선포 무관 동원) · `FOLLOW_CAP` · `WAR_OPS=0` 은 그대로 남아 있다.

### 결속 — 정본은 존 pid 다

| 계기 | 누가 부르나 | 무슨 일 |
|---|---|---|
| 동원(선포) | `war-core warMobilize` → `warDraftFill(V, force, w.id)` | econ 에서 **병력만큼** 자리를 비운다(`npc._warDraft = w.id` · `counts[job]--`) — 물리 표본과 무관한 **전량** |
| 인스턴스화(걷는 병사) | `villages._warDraftPids` → `warDraftBind(vil, pid, simJob, w.id)` | 그 pid 가 **이미 비운 자리 하나**를 집는다(같은 직업 우선 · `npc._warPid = pid`). 방어 소집처럼 동원을 안 거친 길이면 그 자리에서 새로 비운다 |
| 생산 | `economy-sim` 생산 루프 `if (npc._warDraft) continue` | 교역 원정(`_tradingUntil`)과 **같은 자리·같은 문법**. 이 한 줄이 옛 `_laborMul` 동원 항을 대체한다 |
| 복귀 | `villages._warReleasePid` → `warDraftReleasePid` · 해제 때 `warDraftReleaseWar(w)` | 마크를 풀고 `counts[job]++` — **제 직업 자리로** 돌아간다(직업은 애초에 안 바꿨다) |
| 전사(표본 pid) | `villages._warDespawnPid` → 결속만 푼다 | econ 사망은 `warResolveBattle` 의 `warKill` **하나**가 정본(사본 0 · 이중 사망 금지) |
| 사망 일반 | `war-core _warRemoveNpc` | `warKill` 이 부르는 그 함수. 징발자면 `counts` 를 또 빼지 않는다(자리는 이미 비었다) |

* 징발자는 **직업 전환 대상이 아니다**(`switchNPCJob` 첫 줄) · 마을 기근 사망·이주 후보에서도 빠진다 — 그 사람은 마을에 없다.
  ⚠이 셋 중 하나라도 빠지면 `counts` 합이 인구를 넘는다(실측: 30명 마을에 31).
* 표본(`VILLAGE_WAR_SAMPLE`·`NPC_SAMPLE`)은 **화면**의 상한이지 경제의 상한이 아니다 — 대가는 전량이다.

### 군량 — 한 적재 · 환급 한 곳 · 품목은 섭식 정본이 고른다

* **한 적재**: 행군분(`marchDays×2`) + 공성분(`WAR_SIEGE_PACK`)을 `_opPackLoad(V, force, days, w)` 한 번에. 새 수 0(전부 기존 상수).
  결단이 보는 수는 `_packRem − marchDays`(귀환 몫 예약)라 문턱(`WAR_PACK_CRIT` 등)이 보던 값은 종전 그대로다.
* **소모**: 행군·주둔·포위·귀환 **매일 1일분**(종전은 주둔만).
* **환급 한 곳**: `warRationRefund(w, why, survivors)` — 궤주·항복·철수·무저항 넷이 **해제(귀환 완료) 한 문**을 지난다.
  잔량 비율 × **생존 비율**(전사자 몫은 안 돌아온다 — 들고 있던 것). 두 번 불러도 한 번만 준다(팩을 비운다).
* **품목**: `consumeFood`(economy-sim 섭식 정본)를 **주입받아 그대로 부른다** — 적재·약탈·공납·조공이 그 순서로 품목별 차감, 환급은 **뗀 품목 그대로**.
  `food` 0 이어도 생선·조리식이 있으면 팩이 찬다. 미주입(랩·v1 CLI)이면 `food` 한 칸 = **종전 비트**.
* **사기 항**: battle-core `updateMorale` 에 손잡이 `T295_RATION_MRL`(기본 **끔** · 값이 곧 가중치 = 새 수 0).
  끔이면 사기 식이 한 글자도 안 바뀐다(A/B 표: 끔은 ration 1.0/0.5/0.0 셋이 같은 수 — 보고 §0-ⓑ).

### 죽은 칸

* `war-core _recomputeLabor` **삭제** · `_laborMul` 쓰기 0. 생활층 `villages.js` 의 한 줄은 남는다 — **부상 노동력**(요양 0 · 부상 hp율)이 그 칸의 주인이다(동원 항 `_mobF` 만 걷어냈다).
* ⚠**T284 회부 ②의 "엔진 v2 미소비" 는 틀렸다**(§0-ⓚ 대조 실측): `economy-sim` 생산 줄이 `(v._laborMul || 1)` 을 읽고 v2 는 `v1.tickVillage` 를 부른다 — 30일 판에서 0.5 를 넣으면 곳간이 눈에 띄게 준다. 즉 종전엔 **동원 감산이 실제로 걸려 있었고**, 이 카드의 결속과 겹쳐 이중이 될 뻔했다.

### 함정

1. `_packRem` 의 뜻이 바뀌었다 — 이제 **총 잔여 일수**(행군분 포함)다. 결단 쪽에서 읽을 땐 `− marchDays`. 구 객체(재부팅 직전 저장분)는 `_packItems` 가 없어 환급이 `food` 한 칸으로 떨어진다(폴백 · 무해).
2. 약탈·공납·조공의 **양**이 `storage.food` 가 아니라 **식량등가**(`totalFoodEquivalent`) 기준이 됐다 — 같은 비율이라도 곳간이 다양하면 더 많이 간다. 전쟁 궤적이 그만큼 달라진다(랩·3시드 판은 전쟁이 없어 무관).
3. 포로 몸값(`WAR_CAP_RANSOM_FOOD`)은 아직 `storage.food` 한 칸이다 — 카드 밖(회부).
4. 방어 소집도 결속을 건다(같은 `w.id`) — 방어 병사가 오래 잡혀 있으면 그 마을 생산도 준다. 해제는 몸 정리(`_warCleanupBody`)와 전쟁 해제 둘 다에서 돈다.
## X-3. ★2026-09-19 — 나무가 존의 것이 됐다(T284 회부 닫기 · T309 §0ⓑ 표 실행 · 카드 번호 없음)

> 보고 `보고/T295_나무콜라이더_2026-09-19.md` · 가지 `batch/war-trees-0919`(베이스 main `5e67863`) · 하네스 절 ⓛ.
> X-1 이 "⚠나무는 아직 안 본다 — 관측자에 따라 달라진다(ⓓ 결정성과 충돌)" 로 남겼던 자리다. T301 이 **관측자 무관 색인**
> (`chunk.resourceAt/treeBlockerAt`)을 세웠고, T309 가 붙일 자리를 표로 냈고(§0ⓑ), 이 절이 붙였다.

### 어디에 붙었나

| 자리 | 무엇 |
|---|---|
| `server/zone.js warTreeCellBlocked` | **술어의 주인**. 청크 한 판을 `generateChunkResources`(청크가 켜질 때 부르는 그 함수 · `harvestedSeeds`·게임일 그대로)로 낳아 **나무 칸 색인**을 만든다. 날마다 비운다. 넘침 상한(`forestSpacing(FOREST_MIN_COV)` = 96px)만큼 가까울 때만 이웃 청크를 더 낳는다 |
| `SimVillages.init({ treeCellBlocked })` | 생활층으로 넘기는 칸. **생활층은 청크를 직접 안 부른다**(벤 나무 장부·게임일을 못 넘기니까) |
| `villages._warTreeCell` | 셀 메모(`state._warTreeMemo` · 키 `ix*65536+iy`) · `_warNoCollide`(하네스 대조 팔) 게이트 |
| `villages._warBuildRectIndex` | 메모 비우는 줄 — **지형 메모 옆 한 군데**(하루 한 번·교전 시작) |
| `villages._warBlockedCell` | **나무가 여기 들어간다**(대형 걸음·슬롯·우회·전투 스텝이 같은 답을 본다) |
| `villages._warWorld.losBlocked` · `coverAt` | 화살이 나무에 막히고, 나무 뒤가 엄폐다 |

### 왜 `_warBlockedCell` 인가(어댑터만으로는 안 되는 이유)

어댑터 `blocked` 에만 넣으면 **대형이 병사를 숲 안에 세운 채 풀어 준다**. battle-core 몸 클램프는 "새 자리가 막히면
옛 자리로 되돌린다" 인데 그 옛 자리도 막혀 있어 병사가 **그 칸에 갇힌다** — 실측 518/980틱. 장애물은 한 곳에서 답한다.

### 값

* 술어: 칸마다 묻기 27.5µs → **청크 통째 색인 1.6µs/칸**(같은 함수의 생성물 · 하네스가 1,000칸 전수 대조 · 다른 칸 0).
* 세계: 존 틱 p50 **4.05 → 6.27ms** · p95 8.7 → **48.5ms** · drop 0(전쟁 6 · 병사 283). 늘어난 몫의 대부분은 술어가 아니라
  **숲에서 싸운다는 사실**이다(대치 24 → 41 · 궤주 29 → 19 · 판이 길어진다). p95 값 판정은 재민.

### 함정

1. **빽빽한 숲은 판을 안 끝낸다** — 모든 칸이 나무인 벽을 깔면 두 군대가 서로 못 닿는다(하네스 실측). 존 숲은 격자 2~3셀이라
   사이에 길이 남아 지금은 지나간다. 행군로 A\* 는 여전히 **숲을 모른다**(회부).
2. **그날 벤 나무는 다음 날 교전부터** — 존 색인 캐시가 날마다 비워진다(건물 발자국·지형 메모와 같은 규약). 벨 때마다 비우면
   벌목꾼이 있는 세계에서 캐시가 끊임없이 날아간다(실측 p50 6.2 → 7.2ms).
3. 그루터기·묘목은 **안 막는다**(`RESOURCE_HP_TABLE` 이 그렇게 가른다) — 벤 자리는 지나간다.
4. 하네스 대조 팔(`_warNoCollide`)은 나무도 끈다 — 안 그러면 "콜라이더 끔" 팔이 나무에 막혀 대조가 죽는다.

### 남은 P4 순서(설계 §7)

1. ~~T284 전투 실체화~~(X-1) · ~~T295 동원의 대가 ①~④~~(X-2)
2. 대형 선택 규칙(NPC) — 랩 A/B.
3. 동원령 + 상한 UI + 대가 + 영속.
4. 인솔 행군(지휘관 = 플레이어) + 소대 위임 + 명령 우선 — `_warOrderFallback` 자리 · `war_command_join` 바인딩.
5. 인식·반응(합산 · 경계 층 · 추격 금지 · 동맹 정원).
6. 야전·약탈·점령(캐논 뒤).
