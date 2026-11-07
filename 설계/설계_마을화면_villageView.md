# 마을 화면 자료 `villageView` — 서버가 보내는 한 덩어리 (T1072 · 2026-11-02)

> 정본 그림 `설계/시안/오석/마을_{dash,proj,mem,store}.jpg` · 화면 정본 `설계/설계_마을화면_오석.md` · 클라 카드 T1070(세션12).
> 고정 자료 `test/fixtures/village-view.json` — 이 표와 **같은 모양**이다(값은 예시 · 클라 배치용).
> 칸 전수표(시안 칸 하나하나 → 서버 정본 파일:줄 · 있음/파생/없음)는 `보고/T1072_2026-11-02.md`.
> T1084(2026-11-02): 없던 29칸 중 지금 세계에서 셀 수 있는 둘을 더했다 — `projects.now[]` 집터 줄 `bedsGain` · 새 줄 `kind:'clear'`(`fields` · `crew`). **새 칸만** — 옛 이름 · 뜻 무변. 29칸 표 `보고/T1084_2026-11-02.md`.
> T1105(2026-11-03): PM 임시 `vvAdapt` 가 비워 둔 칸 중 서버에 이미 있는 값 셋을 더했다 — `head.region`(지역 이름 = 그 존의 `displayName`) · `dash.foodDays`(먹을 것 며칠치) · `dash.fuelCov` · `dash.fuelShort`(땔감 충당 몫 · 모자람). **새 칸만** — 옛 이름 · 뜻 무변. 겨울 준비 %(분모) · 인구 증감 · 다음 일 한 줄은 여전히 키가 없다. 화면 칸 ← 서버 칸 표 `보고/T1105_2026-11-03.md`.
> T1116(2026-11-03): 창고 탭(재민 11-01 "창고 · 각 물품별 시세")에 서버에 이미 있는 값을 더했다 — 곳간 줄 `use`(하루 수요) · `priceUp`/`priceDown`(장부 값 래치) · `store.short`/`store.glut`(모자란 것 · 남는 것 줄 — 곳간이 바닥난 물건 포함) · `store.priceMoves`(이 마을 장부의 지난 30날 값 오르내림 사건). **새 칸만** — 옛 이름 · 뜻 무변. 물품별 **날마다의** 시세 흐름(30날 선) · 어제보다는 저장 칸이 없어 키가 없다(회부 T1116 1). 칸 표 `보고/T1116_2026-11-03.md`.

## 0. 규약
* **있는 칸만 싣는다.** 서버에 없는 칸은 키 자체가 없다(빈 문자열 · 0 으로 채우지 않는다) — 회부 `인계/회부.md` `T1072`.
* 품목은 구체다 — 뭉뚱그린 econ 재화(`food` 곡식 · `fish` 생선 · `meat` 고기 …)는 행으로 싣지 않고 **센다**(`withheld`). 목록은 `server/village-view.js` `LUMPED` 하나.
* 시세는 거래소 정본(`trade.board` — `villageTradeBoard`) 그대로 · 기준 품목 = 클라가 고른 것(`numeraire`) · 마을 중심 밖이면 `prices = { none: 'far' }`(원격 시세 0).
* 가입 계량기는 하나 — `onboarding.contrib`(`membership.contribOf` 가 읽는 그 값).
* 화면에 보이는 수는 모두 서버 값이다. 클라는 다시 계산하지 않는다(문장 · 달력 · 비율 전부 서버가 준다).

## 1. 메시지
| 방향 | 모양 | 뜻 |
|---|---|---|
| 클라 → 서버 | `{ type:'village_view', vid, numeraire? }` | 연다(열린 채 다시 보내면 기준 품목만 바꿔 **통째로** 다시 받는다) · `numeraire` = res id(화면은 `prices.basis[].ko` 이름을 보이고 `res` 를 보낸다 · T1103) |
| 클라 → 서버 | `{ type:'village_view_close' }` | 닫는다(그 뒤로 바뀐 칸을 안 보낸다) |
| 서버 → 클라 | `{ type:'village_view', vid, seq, full:true, view:{…칸 전부} }` | 열 때 한 번 |
| 서버 → 클라 | `{ type:'village_view', vid, seq, full:false, slots:{ 바뀐 칸만 } }` | 열려 있는 동안 — 칸 단위로 통째 교체(칸 안을 부분 갱신하지 않는다) |
| 서버 → 클라 | `{ type:'notice', text }` | 못 연다(마을 중심에서 너무 멀다 등 — 게시판과 같은 말) |

열기 게이트 = 게시판 · 브리핑 · 연대기 · 거래소와 **같은 술어**(`villages.js` `_villageNear` · `EV_BRIEF_PX` 260px).
열린 채 멀어지면 `gate.near=false` · `prices={none:'far'}` 만 바뀌어 오고, 나머지 칸은 마지막 값에서 멈춘다(멀리서는 다시 읽지 않는다).

## 2. 칸(최상위 키) — `view.<칸>`
| 칸 | 필드 | 형 | 원천(서버 정본) | 시안 자리 |
|---|---|---|---|---|
| `head` | `vid` · `name` | int · str | `vil.dbId` · `vil.name` | 머리줄 "어촌3" |
| | `day` | int | `state.world.day` | — |
| | `cal` `{ label, season, seasonKo, dayOfSeason, seasonDays, year }` | obj | `events.calendarOf(day)` | 대시 "지금은 가을" |
| | `age` | int | `day − econ.foundedDay` (파생) | 머리줄 "412일째" |
| | `chief` `{ name, npc }` \| `null` | obj | `village-kin.chiefOf(vil)` | 머리줄 "촌장 도미" |
| | `region` (T1105) | str | 이 마을이 선 존의 이름 `zone-config.js ZONES[zoneId].displayName`(손잡이 `villageViewSrc().zoneId` · 한반도 존 = "새벌") — 게임이 "지역"이라 부르는 그 이름 · 존을 모르는 판이면 키 없음 | 머리줄 부제 자리("남해 바닷가 마을" — 그 문장은 회부 T1072 2) |
| `me` | `member` · `memberVid` | bool · int\|null | `membership.publicState().vid` (=== vid 이면 이 마을 사람) | 가입 안내 "아직 이 마을 사람이 아닙니다" |
| | `contrib` · `need` | int · int | `onboarding.contrib`(`membership.contribOf`) · `membership.CFG.N_MEMBER` | 머리줄 "마을 사람이 되기까지 n / m" |
| | `left` | int | `need − contrib`(0 아래로 안 간다 · 파생) | 가입 안내 "n 더 모으면" |
| | `chief` · `offer` | bool · int\|null | `membership.publicState` | — |
| `dash` | `pop` | int | `econ.npcs.length` | "사는 사람 48명" |
| | `toWinter` | int \| null | 달력 정본으로 다음 겨울 첫날까지(파생 · 겨울이면 0) | "겨울까지 34일 남았습니다" |
| | `projectsN` | int | `projects.now.length`(T1084 부터 밭 일구기 줄도 든다) | "하고 있는 일 5가지" |
| | `foodDays` (T1105) | num | 곳간 스냅숏 정본 `playerVillageInventory().foodDays`(= econ `totalFoodEquivalent ÷ 인구` · 한 사람 하루 1 → "며칠치" · 소수 한 자리) — 새로 오는 사람 문의 "자립 n일"과 같은 함수 · ⚠겨울 준비 %가 아니다(분모 없음 · 회부) | 겨울 준비 "먹을 것" 자리(%는 회부 — 며칠치만) |
| | `fuelCov` · `fuelShort` (T1105) | num · bool | econ 이 그날 연료 단계에서 남긴 땔감 충당 몫 `_fuelCov`(`sim/economy-sim.js` · (짚 + 잔가지·껍질 + 땔나무) ÷ 그날 땔감 수요 · 0..1 · 겨울엔 추위만큼 수요가 커진다 · econ 이 이 값으로 건강을 깎는다) · 소수 둘째 자리 · `fuelShort` = 그 값 < 1 · 첫 econ 날 전엔 둘 다 키 없음 · ⚠**오늘** 몫이지 겨울 목표 대비가 아니다 | 겨울 준비 "땔감" 막대 · "땔감이 모자랍니다" |
| `requests` | `rows[]` `{ res, ko, item, qty, filled, remain, rewRes?, rewKo?, rewQty?, line? }` | arr | `villageBoard().rows`(게시판 정본) | "마을의 부탁" · "12 / 30 모임" |
| | `withheld` | int | 구하는 품목이 뭉뚱그린 것이라 뺀 줄 수 | — |
| | `rewardWithheld` | int | 갚는 품목만 뭉뚱그린 것(거의 곡식)이라 **갚는 칸 · 문장(`line` = "나무 18 → 곡식 4")을 뺀** 줄 수 — 그 줄은 `rewRes`·`rewKo`·`rewQty`·`line` 키가 없다 | — |
| `news` | `rows[]` `{ line, type, day, heard, ago, from }` | arr | `villageViewNews()` = 게시판 소식과 같은 술어 · 같은 줄 수(`ledger.visibleEvents` · 소문 가시성) · **줄은 하십시오체 `events.newsLine`**(T1103 — 게시판 · 촌장 말은 하게체 `briefLine` 그대로) | "마을 소식" · "3일 전 · 들려온 소문"(`from` ≠ null) |
| | `withheld` | int | 위와 같음 | — |
| `projects` | `now[]` — 아래 §3 | arr | 집터 `vil._site` · 의뢰 집터 `vil._psite` · 밭 일구기(개간 술어 · T1084) · 캐러밴 `world.caravans` | "지금 하고 있는 일" 카드 · "다 지으면 침상이 n 늘어납니다"(`bedsGain`) · "밭 일구기 · 하는 중"(`kind:'clear'`) |
| | `done[]` `{ line, day, ago }` | arr | `ledger.chronicle` 의 `BUILT`(올해) · 줄 = 하십시오체 `events.newsLine`(T1103) | "끝낸 일" |
| `members` | `n` | int | `vil.npcPids` 중 몸이 있는 사람 | "함께 사는 사람 48명" |
| | `byJob[]` `{ job, ko, n }` | arr | 몸의 `simJob` 집계 · 이름표 `zone.js JOB_KR_NPC` | 직업별 수 "어부 14" |
| | `people[]` `{ pid, name, job, jobKo, act, chief }` | arr | 몸 `name` · `simJob` · 행위 라벨 `_lifeAct` · 촌장 = `chiefOf` | 사람 칸 |
| | `assign` (T1169) `{ rows[] { id, job, jobKo, age, left, away, chief }, jobs[] { job, ko, open }, cooldown }` | obj | 게시판 판 T1085 명부와 **같은 자료** `SimVillages.assignRoster`(econ 사람 · 몸 이름 없음) · 이름표 `JOB_KR_NPC` · 싣는 때 = 사람이 세운 마을(`econ.founder`) ∧ `me.chief`(`chiefCached` — 게시판과 같은 술어) · 아니면 **키 없음** | 촌장 「일 맡기기」 판(지금 일 · 나이 · 형편 · 맡길 일 · 단추 → `assign_job`) |
| `store` | `rows[]` `{ res, ko, qty, daysOf, short, glut }` | arr | 곳간 `playerVillageInventory().groups` · 래치 `ledger.detOf(vid,res)` · 소비 `econ._consEMA` | "곳간에 있는 것" · 넉넉함 (「모자란 것」 판은 T1169 부터 아래 `store.short.rows`) |
| | `rows[].use` (T1116) | num | 하루 수요 = econ 소비 EMA `_consEMA[res]`(`daysOf` 의 분모 그대로 · 소수 둘째 자리) · 소비 0 이면 키 없음 | 넉넉함 옆 "하루 n씩 씁니다" 자리 |
| | `rows[].priceUp` · `priceDown` (T1116) | bool | 사건 장부 값 래치 `detOf().up/down`(`PRICE_SPIKE`/`PRICE_DROP` 이 선 뒤 풀리기 전까지 참 · 30날 자기평균 대비) · 장부가 그 물건 값을 창(`events.CFG.PRICE_WIN` 30날)만큼 지켜보기 전이면(재기동 직후 포함) **키 없음** | "값 ▲" · "값 ▼"(⚠"어제보다"가 아니다 — 회부) |
| | `shortDays` · `glutDays` | num | `events.CFG.SHORT_DAYS` · `GLUT_DAYS`(넉넉함 기준 — 사건 장부 정본) | 넉넉함 막대의 눈금 |
| | `withheld` | int | 뭉뚱그린 품목이라 뺀 줄 수 | — |
| | `short` (T1116) `{ rows[] { res, ko, qty, daysOf, use? }, withheld }` | obj | 사건 장부 모자람 래치(`STOCK_SHORTAGE` · `detOf().short`)가 선 물건 전부 — 후보 = 곳간 줄 ∪ `_consEMA` 키(래치는 소비가 있는 물건에서만 선다) · **곳간이 바닥난 물건도 든다**(`qty:0` · `daysOf:0` — 스냅숏엔 줄이 없다) · 차례 = 곳간 스냅숏 차례 뒤 `_consEMA` 차례 · 뭉뚱그린 것은 빼고 `withheld` | "모자란 것" 판 |
| | `glut` (T1116) `{ rows[] { res, ko, qty, daysOf, use? }, withheld }` | obj | 같은 장부의 넘침 래치(`STOCK_GLUT` · `detOf().glut`) | "남는 것"(시안에 자리 없음 · 회부) |
| | `priceMoves` (T1116) `{ rows[] { res, ko, type, day, ago, line }, withheld, days }` | obj | 이 마을 장부 링(`ledger.ringOf(vid)` — DB `village_events` 에서 되살린 것 포함)의 `PRICE_SPIKE`/`PRICE_DROP` 중 지난 `days`(= `PRICE_WIN` 30)날 것 · 새것부터 · `line` = 하십시오체 `events.newsLine` · 값 수(`mag` · `meta`)는 안 싣는다(그림자가격 원값 — 시세는 `prices` 칸 하나) | 물품별 "n일 전 값이 올랐습니다" 줄(⚠날마다의 시세 선이 아니다 — 회부) |
| `prices` | 가까이: `{ numeraire, numeraireKo, spread, rows[], basis[], withheld }` | obj | `villageTradeBoard(vid, x, y, inv, numeraire)` | "시세 (조 기준)" · "시세 기준" 버튼 |
| | `rows[]` `{ res, ko, num, glut, canGive, canTake, mine }` | arr | 거래소 행 그대로(`num` = 기준 품목 몇 개 값) | 시세 열 |
| | `basis[]` `{ res, ko, mine }` | arr | 내 짐에 있고 낼 수 있는 구체 품목(`mine>0 ∧ canGive`) | 시세 기준 고르기 |
| | 기준이 뭉뚱그린 품목이면 `{ pick:true, basis[], withheld }` (시세 수 없음) | obj | 거래소 기본 기준이 `food` 라서 — 고르면 그 기준으로 다시 온다 | — |
| | 멀면 `{ none:'far' }` | obj | `_villageNear` 거절 | "가까이 가야 볼 수 있습니다" |
| `gate` | `near` | bool | `_villageNear` | — |

## 3. `projects.now[]` 한 줄
| 필드 | 집터(`kind:'house'`) | 의뢰 집터(`kind:'phouse'`) | 밭 일구기(`kind:'clear'` · T1084) | 행상(`kind:'caravan'`) |
|---|---|---|---|---|
| `kind` · `name` | `'house'` · `"움집 짓기"` | `'phouse'` · `"<의뢰한 사람> 움집"` | `'clear'` · (이름 키 없음) | `'caravan'` · `"<가는 마을>로 가는 행상"` |
| `stage` · `stages` | 공정 단계 · `hut-stages.js HUT_STAGES.length` | 같음 | — | — |
| `stageLabel` | `HUT_STAGES[stage].label`(지금 하는 공정) | 같음 | — | — |
| `need[]` `{ res, ko, need, have, give[] }` | `econ.hutEconStage(stage)` · `_site.mat` · `give` = 그 자재로 곳간에 들어가는 내 물건 키(기부 문 정본 `playerVillageDepositMap` · T1103 — 화면 "재료 가져오기"가 보낸다) | — (선납이라 자재가 이미 들어와 있다) | — | — |
| `bedsGain` (T1084) | 다 지으면 늘어나는 침상 = econ `hutCapPerHut()`(층당 정원 6 × 층수 상한 1 = 침상 명부 `villages.js _mapBedsOf` 가 집 한 채에 더하는 수) | — (마을 침상 명부 밖) | — | — |
| `fields` · `crew` (T1084) | — | — | 지금 밭 칸 수(`vil._farmSet.size`) · 지금 개간을 쥔 몸 수(`vil._clearCrew`) | — |
| `state` · `toDays` | — | — | — | `'outbound'`/`'inbound'`… · 도착까지 날 수(`arriveDay`/`returnArriveDay − day`) |
| `cargo[]` `{ res, ko, n }` | — | — | — | `giveRes`/`giveAmt`(+둘째 화물) |
| `to` | — | — | — | 가는 마을 이름 |

* 밭 일구기 줄은 **개간 술어 정본**(`villages.js _lifeNeedClear` — 손잡이 `villageViewSrc().needClear`)이 참이고 그 마을에 농부 몸이 있는 동안만 선다(개간 두 길 — 몸 · 일괄 `_lifeClearDay(vil, farmerN)` — 의 문 그대로). 술어가 거짓이면 줄이 없다. 목표 칸 수("6칸 중 4칸")는 술어 안의 식이라 싣지 않는다(회부 T1084).
* ⚠`name` 은 지금 서버가 싣지 않는다(T1072 그대로 — 고정 자료에만 예시가 있다). 화면 이름은 `kind` 로 정한다.

## 4. 보내는 때
| 때 | 무엇을 | 상한 |
|---|---|---|
| 열 때 | 칸 전부(`full:true`) | 메시지당 한 번 |
| 열려 있는 동안 | 다시 읽어 **JSON 이 바뀐 칸만**(`full:false`) · 시세는 입력 지문(그날 · 곳간 · 내 짐 · 기준 · 걸린 보상)이 같으면 지난 칸 그대로(정본 재호출 0 — 곳간이 한 톨만 움직여도 다시 부른다) | 존의 5초 박자(`zone.js` 바닥 물건 정리 `setInterval(…, 5000)` · 잠든 존 유지보수와 같은 수 — 새 수 0 · 손잡이 `VILLAGE_VIEW_MS`) — 한 사람 5초에 한 번 |
| 내가 납품 · 교환 · 기부 · 꺼내기를 한 직후 | 같은 비교(바뀐 칸만) | 그 행동 한 번에 한 번 |
| 닫을 때 · 끊길 때 | 없음(열림 표지를 지운다) | — |

## 5. 값(한 마을 열기 · `scripts/test-village-view.js` ⑥ · 존 한 벌 · 마을 2곳 · 인구 8~12)
| 무엇 | 평균 | 가운데 | 최대 | 대부분 |
|---|---|---|---|---|
| 열기(칸 전부 · 정본 전부) | 9.0~11.7ms | 8.6~11.4ms | 16~27ms | 거래소 정본 `villageTradeBoard` 한 번(≈9ms — `gluttedAt` 이 품목마다 시세를 두 번 낸다 · 지금 거래소 패널이 여는 값과 같다) |
| 열린 동안 다시 읽기(시세 입력 그대로) | 157~275µs | 124~133µs | 0.4~3.2ms | 게시판 · 연대기 · 곳간 스냅숏 · 몸 명부 |
| 통째 메시지 | 약 5KB | | | 사람 칸이 인구만큼 는다 |
박자 5초 × 열린 사람 하나 = 다시 읽기 한 번(시세 입력이 바뀐 박자만 거래소 정본 한 번 더).

## 6. 화면 맞춤 — 클라 `vvAdapt`(T1103 · `public/client/52-v-village-view.js`)
* 받기: `full:true` 면 칸 덩어리를 갈아 끼우고, `full:false` 면 온 칸만 바꾼다(다른 마을 · 지난 seq 는 버린다). 바뀐 칸을 읽는 판(머리 · 탭)만 다시 짓는다.
* 없는 칸은 화면에도 없다 — 줄 · 카드를 통째로 안 그린다(빈 문자열 · 0 · 예시 문장 0).
* 클라가 만드는 것은 문장 틀(하십시오체) · 막대 비율(넉넉함 = `daysOf / glutDays` · 공정 = `stage / stages` · 부탁 = `filled / qty`) · 공사 줄 이름(`kind` 로 — 서버가 `name` 을 안 싣는다)뿐이다.
* [T1116] 창고 탭 새 칸 — `store.short.rows` 는 `rows[].short` 로 거르는 것보다 넓다(곳간이 바닥난 물건이 든다) · `priceUp`/`priceDown` · `priceMoves` 는 키가 있을 때만 그린다 · 날마다의 시세 선 · 어제보다는 그리지 않는다(키 없음).
* [T1169] 화면 「모자란 것」 = `store.short.rows`(바닥난 줄 = "곳간에 없습니다") — 칸이 없는 옛 서버만 `rows[].short` 거르기 · 구성원 탭 아래 「일 맡기기」 판 = `members.assign`(키가 있을 때만 · 단추 = `assign_job` · 맡긴 뒤 서버는 열린 마을 화면의 칸만 다시 보낸다 — 게시판 판을 띄우지 않는다).
* 아직 서버에 없는 칸(T1105 가 셀 것) — 키가 오면 그린다: `head.region` · `dash.popDelta` · `dash.winter[] { label, frac, short }` · `dash.workNext` · `members.delta` · `projects.next[]`(문장 줄).

* [T1189 · 문 24 권고대로] 새 칸 — `head.kindKo`(마을 꼴 · 회관 행 꼬리표 낱말 농촌 · 어촌 · 광산 · 임업 · 부제 = `region` + `kindKo`) · `dash.winter[] { label:'먹을 것', frac, short, days, need }`(먹을 것 며칠치 ÷ 겨울 끝까지 남은 날 — T1179 수확창이 서면 "다음 수확까지"로) · `store.rows[].kg`(낱개 × `weights.kgOf`) · `prices.trend { days, rows[] { res, pts[] { ago, num } } }`(econ 행 칸 `_t1189Px` 30날 고리 ÷ 고른 기준 · 시세 칸 안 — 멀면 없음). 화면: 오늘 땔감 줄(`fuelCov`)은 겨울 준비 판 안 따로 · 「다 되면」 문장 없음(`bedsGain` 안 그림) · 「모자란 것」 = 며칠치 + 값 ▲ · 「재료 가져오기」(집터) = `village_site_give` `{ vid, want }`(짐 → 집터 `_site.mat` · 남은 몫까지 · 단계 자재를 다 채운 한 번 = 기여 +1).
