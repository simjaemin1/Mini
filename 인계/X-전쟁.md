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
* ⚠**나무는 아직 안 본다** — 존 나무는 청크가 켜질 때만 생기는 시드 자원이라 관측자에 따라 달라진다(ⓓ 결정성과 충돌). 회부.
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

### 남은 P4 순서(설계 §7)

1. ~~T284 전투 실체화~~ (이 절)
2. 대형 선택 규칙(NPC) — 랩 A/B.
3. 동원령 + 상한 UI + 대가 + 영속.
4. 인솔 행군(지휘관 = 플레이어) + 소대 위임 + 명령 우선 — `_warOrderFallback` 자리 · `war_command_join` 바인딩.
5. 인식·반응(합산 · 경계 층 · 추격 금지 · 동맹 정원).
6. 야전·약탈·점령(캐논 뒤).
