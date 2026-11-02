# 마을 화면 자료 `villageView` — 서버가 보내는 한 덩어리 (T1072 · 2026-11-02)

> 정본 그림 `설계/시안/오석/마을_{dash,proj,mem,store}.jpg` · 화면 정본 `설계/설계_마을화면_오석.md` · 클라 카드 T1070(세션12).
> 고정 자료 `test/fixtures/village-view.json` — 이 표와 **같은 모양**이다(값은 예시 · 클라 배치용).
> 칸 전수표(시안 칸 하나하나 → 서버 정본 파일:줄 · 있음/파생/없음)는 `보고/T1072_2026-11-02.md`.

## 0. 규약
* **있는 칸만 싣는다.** 서버에 없는 칸은 키 자체가 없다(빈 문자열 · 0 으로 채우지 않는다) — 회부 `인계/회부.md` `T1072`.
* 품목은 구체다 — 뭉뚱그린 econ 재화(`food` 곡식 · `fish` 생선 · `meat` 고기 …)는 행으로 싣지 않고 **센다**(`withheld`). 목록은 `server/village-view.js` `LUMPED` 하나.
* 시세는 거래소 정본(`trade.board` — `villageTradeBoard`) 그대로 · 기준 품목 = 클라가 고른 것(`numeraire`) · 마을 중심 밖이면 `prices = { none: 'far' }`(원격 시세 0).
* 가입 계량기는 하나 — `onboarding.contrib`(`membership.contribOf` 가 읽는 그 값).
* 화면에 보이는 수는 모두 서버 값이다. 클라는 다시 계산하지 않는다(문장 · 달력 · 비율 전부 서버가 준다).

## 1. 메시지
| 방향 | 모양 | 뜻 |
|---|---|---|
| 클라 → 서버 | `{ type:'village_view', vid, numeraire? }` | 연다(열린 채 다시 보내면 기준 품목만 바꿔 **통째로** 다시 받는다) |
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
| `me` | `member` · `memberVid` | bool · int\|null | `membership.publicState().vid` (=== vid 이면 이 마을 사람) | 가입 안내 "아직 이 마을 사람이 아닙니다" |
| | `contrib` · `need` | int · int | `onboarding.contrib`(`membership.contribOf`) · `membership.CFG.N_MEMBER` | 머리줄 "마을 사람이 되기까지 n / m" |
| | `left` | int | `need − contrib`(0 아래로 안 간다 · 파생) | 가입 안내 "n 더 모으면" |
| | `chief` · `offer` | bool · int\|null | `membership.publicState` | — |
| `dash` | `pop` | int | `econ.npcs.length` | "사는 사람 48명" |
| | `toWinter` | int \| null | 달력 정본으로 다음 겨울 첫날까지(파생 · 겨울이면 0) | "겨울까지 34일 남았습니다" |
| | `projectsN` | int | `projects.now.length` | "하고 있는 일 5가지" |
| `requests` | `rows[]` `{ res, ko, item, qty, filled, remain, rewRes?, rewKo?, rewQty?, line? }` | arr | `villageBoard().rows`(게시판 정본) | "마을의 부탁" · "12 / 30 모임" |
| | `withheld` | int | 구하는 품목이 뭉뚱그린 것이라 뺀 줄 수 | — |
| | `rewardWithheld` | int | 갚는 품목만 뭉뚱그린 것(거의 곡식)이라 **갚는 칸 · 문장(`line` = "나무 18 → 곡식 4")을 뺀** 줄 수 — 그 줄은 `rewRes`·`rewKo`·`rewQty`·`line` 키가 없다 | — |
| `news` | `rows[]` `{ line, type, day, heard, ago, from }` | arr | `villageBoard().news`(= `ledger.visibleEvents` · 소문 가시성) | "마을 소식" · "3일 전 · 들려온 소문"(`from` ≠ null) |
| | `withheld` | int | 위와 같음 | — |
| `projects` | `now[]` — 아래 §3 | arr | 집터 `vil._site` · 의뢰 집터 `vil._psite` · 캐러밴 `world.caravans` | "지금 하고 있는 일" 카드 |
| | `done[]` `{ line, day, ago }` | arr | `ledger.chronicle` 의 `BUILT`(올해) | "끝낸 일" |
| `members` | `n` | int | `vil.npcPids` 중 몸이 있는 사람 | "함께 사는 사람 48명" |
| | `byJob[]` `{ job, ko, n }` | arr | 몸의 `simJob` 집계 · 이름표 `zone.js JOB_KR_NPC` | 직업별 수 "어부 14" |
| | `people[]` `{ pid, name, job, jobKo, act, chief }` | arr | 몸 `name` · `simJob` · 행위 라벨 `_lifeAct` · 촌장 = `chiefOf` | 사람 칸 |
| `store` | `rows[]` `{ res, ko, qty, daysOf, short, glut }` | arr | 곳간 `playerVillageInventory().groups` · 래치 `ledger.detOf(vid,res)` · 소비 `econ._consEMA` | "곳간에 있는 것" · 넉넉함 · "모자란 것"(`short`) |
| | `shortDays` · `glutDays` | num | `events.CFG.SHORT_DAYS` · `GLUT_DAYS`(넉넉함 기준 — 사건 장부 정본) | 넉넉함 막대의 눈금 |
| | `withheld` | int | 뭉뚱그린 품목이라 뺀 줄 수 | — |
| `prices` | 가까이: `{ numeraire, numeraireKo, spread, rows[], basis[], withheld }` | obj | `villageTradeBoard(vid, x, y, inv, numeraire)` | "시세 (조 기준)" · "시세 기준" 버튼 |
| | `rows[]` `{ res, ko, num, glut, canGive, canTake, mine }` | arr | 거래소 행 그대로(`num` = 기준 품목 몇 개 값) | 시세 열 |
| | `basis[]` `{ res, ko, mine }` | arr | 내 짐에 있고 낼 수 있는 구체 품목(`mine>0 ∧ canGive`) | 시세 기준 고르기 |
| | 기준이 뭉뚱그린 품목이면 `{ pick:true, basis[], withheld }` (시세 수 없음) | obj | 거래소 기본 기준이 `food` 라서 — 고르면 그 기준으로 다시 온다 | — |
| | 멀면 `{ none:'far' }` | obj | `_villageNear` 거절 | "가까이 가야 볼 수 있습니다" |
| `gate` | `near` | bool | `_villageNear` | — |

## 3. `projects.now[]` 한 줄
| 필드 | 집터(`kind:'house'`) | 의뢰 집터(`kind:'phouse'`) | 행상(`kind:'caravan'`) |
|---|---|---|---|
| `kind` · `name` | `'house'` · `"움집 짓기"` | `'phouse'` · `"<의뢰한 사람> 움집"` | `'caravan'` · `"<가는 마을>로 가는 행상"` |
| `stage` · `stages` | 공정 단계 · `hut-stages.js HUT_STAGES.length` | 같음 | — |
| `stageLabel` | `HUT_STAGES[stage].label`(지금 하는 공정) | 같음 | — |
| `need[]` `{ res, ko, need, have }` | `econ.hutEconStage(stage)` · `_site.mat` | — (선납이라 자재가 이미 들어와 있다) | — |
| `state` · `toDays` | — | — | `'outbound'`/`'inbound'`… · 도착까지 날 수(`arriveDay`/`returnArriveDay − day`) |
| `cargo[]` `{ res, ko, n }` | — | — | `giveRes`/`giveAmt`(+둘째 화물) |
| `to` | — | — | 가는 마을 이름 |

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
