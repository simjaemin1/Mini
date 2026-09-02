// === server/events.js — 사건 장부(event ledger) ================================
//
// ★설계 근거: `설계_게임성_사건레이어_TODO.md` §3.1/§3.2/§3.3 [재민 확정 2026-08-25]
//   "tickVillage 하루 경계에서 유의미한 변화를 사건 레코드로 영속화 …
//    소비처 전부 이 장부 하나에서: 소문·게시판·의뢰·연대기·복귀 브리핑. 따로 만들지 말 것."
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★이 파일의 제1 규약: **장부는 관측자다. econ 을 건드리지 않는다.**
//
//   · 재고·소비EMA·가격은 **econ 정본 필드·함수**를 그대로 읽는다. 장부용으로 다시 계산하지 않는다.
//     (배치 7 오진의 재발 방지 — 계측 스크립트가 정본 판독기 대신 JSON 을 직접 파싱해서
//      "지도에 철 0개"라는 **틀린 회부**를 냈다. 엔진엔 "사본 금지"를 지키고 계측기에서 어겼다.)
//   · 검출기 상태(가격 EMA·래치)는 **이 모듈 안에만** 산다. econ 마을 객체에 필드를 붙이지 않는다
//     — 붙이면 serializeEcon 이 DB 로 퍼 나르고, 언젠가 그게 econ 상태인 척한다.
//   · `world.events` 는 **이미 econ 이 쓰는 이름**(재해 이벤트 큐, economy-sim.js:3575 processEvents).
//     장부는 그 근처에도 안 간다.
//   ⇒ 검사: `scanDay()` 전후로 econ 상태가 비트 동일해야 한다(test-events ⑧).
//
// ★제2 규약: **뉴스는 평소에서 벗어난 것**이므로 사건은 **에지 트리거**다.
//   "오늘도 소금이 없다"는 뉴스가 아니다. 조건이 **거짓→참으로 바뀌는 그 날** 1건만 낸다.
//   경계에서 떠는 것(chatter)은 히스테리시스 밴드로 막는다(들어갈 때와 나올 때 문턱이 다르다).
//
// ★제3 규약: **문턱은 전부 env 손잡이 · 기본값이 채택값**(A/B 재현 규약, lab-wiring-check [A2] 정신).
//
// ★★제4 규약 [T7 2026-09-01]: **사건은 순간 전파되지 않는다.**
//   마을 V 에서 사건 e 가 보인다 ⇔ `today ≥ e.day + (출발 마을 → V 도달 일수)`.
//   도달 일수의 정본은 `server/rumor.js` 하나이고, 그 시계는 **econ 캐러밴 시계**다(시계 둘 금지).
//   촌장 브리핑·게시판·시작 화면 근황이 **전부 `visibleEvents` 하나를 통해서만** 사건을 본다 —
//   사본을 만들면 그날 "촌장은 아는데 게시판은 모르는" 마을이 생긴다.
//   ⚠도달 전 사건은 **없는 것과 같다**. "소문이 퍼지는 중" 같은 메타 표시를 만들지 마라(디에게틱).
//
// ★★채택 근거 — 실지도 51마을 3시드(1020·7·42) 800일 실측(`scripts/ev-density.js`).
//   재민 확정 목표는 "마을당 2~3일에 1건"이다. 세 후보를 **같은 틱 스트림 위에** 동시에 얹어 쟀다
//   (장부는 관측자라 여러 개를 한 세계에 달 수 있다 — 카오스 잡음 0 인 A/B):
//     A ±40% · H1.35 : 1.94 / 1.92 / 1.92 일  ← **목표 밖**(너무 잦다)
//     B ±55% · H1.60 : 2.08 / 2.08 / 2.07 일  ← 목표 하단
//     C ±70% · H1.60 : 2.21 / 2.22 / 2.22 일  ← **채택**(구간 한가운데 · 비용도 제일 싸다)
//   되돌리기: `EV_PRICE_UP=0.40 EV_PRICE_DOWN=0.40 EV_HYST=1.35` 로 채택 전 값이 정확히 재현된다.
//   ⚠`SHORT_DAYS`(부족 정의)는 밀도 튜닝에 **쓰지 않았다** — 그 값은 게시판 의뢰의 정의이기도 해서
//     밀도 맞추자고 흔들면 "부족"의 뜻이 바뀐다. 밀도는 가격 문턱과 히스테리시스로만 맞췄다.
//
// mag 의 정의 — 전 타입 공통 **관측값 ÷ 기준값**:
//   STOCK_SHORTAGE  mag = 재고 ÷ (소비EMA×SHORT_DAYS)     → <1, 작을수록 심각
//   STOCK_GLUT      mag = 재고 ÷ (소비EMA×GLUT_DAYS)      → >1, 클수록 심각
//   PRICE_SPIKE     mag = 오늘가 ÷ 30일 자기평균           → >1+UP
//   PRICE_DROP      mag = 오늘가 ÷ 30일 자기평균           → <1−DOWN
//   CARAVAN_LATE    mag = 지연일수 ÷ LATE_DAYS             → ≥1
//   SEASON_CHANGE   mag = 1 (이상이 아니라 달력)
//   ⇒ 심각도 정렬은 |ln(mag)| 하나로 전 타입을 견줄 수 있다(briefing 상위 N 선정).
//
// ★★제5 규약 [T50 2026-09-02]: **세계의 "일"에는 sev 눈금이 없다 — 축을 둘로 둔다.**
//   2차 유형(아래)은 값의 이탈이 아니라 **일어난 일**이다. econ 이 스스로 세운 상태를 읽을 뿐이고,
//   장부는 그 상태가 바뀌는 **에지**만 본다(각본 금지 — 사건을 내려고 세계에 심은 장치는 하나도 없다).
//     HARVEST_BOON    mag = econ `_yearShock` 의 비옥도 배수(풍년 1.30)
//     HARVEST_BLIGHT  mag = 같은 배수(흉년 0.70)
//     WEATHER         mag = econ `_weather` 배수 중 **1 에서 가장 멀리 벗어난 것**(가뭄 0.65 …)
//     POP_COLLAPSE    mag = 오늘 인구 ÷ 인구 자기평균(가격 이탈과 **같은 문법**)
//     CARAVAN_RAIDED  mag = 그날 털린 캐러밴 수 ÷ RAID_N (CARAVAN_LATE 와 같은 문법)
//     TRADER_KILLED   mag = 그날 돌아오지 못한 행상 수 ÷ RAID_N
//     BUILT           mag = 1 (이상이 아니라 완공)
//     FIRST_GOODS     mag = 1 (이상이 아니라 처음)
//     WINTER_KEPT     mag = 그해 겨울 목표 달성률 (≥1)          [T20]
//     WINTER_SHORT    mag = 같은 달성률 (<1)
//   ⚠**sev 로만 정렬하면 이 일곱은 영원히 안 보인다.** 흉년은 sev 0.36 이고 소금값 9배는 2.2 라,
//     한 자로 재면 촌장은 흉년 대신 소금값을 말한다. 그게 T18 회부 A-1 의 내용이고 이 배치가 온 이유다.
//   ⇒ 정렬·연표 자격은 **`heavier()` 하나**를 통한다: 일이 먼저 서고, 그 안에서 sev 로 견준다.
//     근거는 발명이 아니라 실측이다 — 실지도 51마을 800일 3시드에서 값 유형 18,434건 대 일 유형 623건.
//     **드문 것은 걸러낼 필요가 없고, 흔한 것은 걸러야 한다.** 그 비대칭이 두 축의 전부다.
'use strict';

const path = require('path');

// 한글 이름 — **표시 전용**이다(경제 로직 아님). specialty 정본에 있으면 그것을 쓰고,
// 없는 기초 재화만 여기서 채운다(specialty.js 는 특산물 표라 food/wood/stone 이 없다).
let _SPEC = null;
try { _SPEC = require(path.join(__dirname, 'specialty')).RESOURCES; } catch (e) { _SPEC = null; }
const KO_BASE = {
  food: '곡식', fish: '생선', meat: '고기', cooked_food: '익힌 음식', fruit: '열매',
  vegetable: '남새', mushroom: '버섯', wood: '나무', stone: '돌', twig: '삭정이',
  pebble: '자갈', tool: '연장', iron_tool: '쇠연장', bronze_tool: '청동 연장',
  ore: '광석', iron: '철', copper: '구리', tin: '주석', lead: '납', silver: '은', gold: '금',
  weapon: '무기', armor: '갑옷', hide: '가죽', bone: '뼈', clothes: '옷', herb: '약초',
  clay: '진흙', charcoal: '숯', hemp: '삼', ramie: '모시', salt: '소금', water: '물',
};
function koRes(r) {
  if (KO_BASE[r]) return KO_BASE[r];
  if (_SPEC && _SPEC[r] && _SPEC[r].ko) return _SPEC[r].ko;
  return r;
}

// ── 손잡이 ────────────────────────────────────────────────────────────────────
const _num = (envName, def) => {
  const x = parseFloat(process.env[envName] != null ? process.env[envName] : '');
  return isFinite(x) ? x : def;
};
const CFG = {
  SHORT_DAYS: _num('EV_SHORT_DAYS', 5),      // 재고 < 소비EMA×이 일수 → 부족
  GLUT_DAYS: _num('EV_GLUT_DAYS', 45),       // 재고 > 소비EMA×이 일수 → 과잉(소비EMA>0 일 때만)
  HYST: _num('EV_HYST', 1.60),               // 히스테리시스 폭 — 해제는 진입 문턱×이 배수 ★채택값
  PRICE_WIN: _num('EV_PRICE_WIN', 30),       // 자기평균 창(EMA α=1/WIN — _consEMA 와 같은 문법)
  PRICE_UP: _num('EV_PRICE_UP', 0.70),       // +70% 이탈 → 급등 ★채택값
  PRICE_DOWN: _num('EV_PRICE_DOWN', 0.70),   // −70% 이탈 → 급락 ★채택값
  PRICE_MIN: _num('EV_PRICE_MIN', 0.05),     // 이보다 싼 시세는 판정 제외(0 근방 비율 폭발 차단)
  LATE_DAYS: _num('EV_LATE_DAYS', 1),        // 교역 도착 지연 이 일수 이상 → 지연 사건
  KEEP_DAYS: _num('EV_KEEP_DAYS', 90),       // 마을당 링버퍼·DB 보존 일수
  MAX_DAY: _num('EV_MAX_DAY', 0),            // 마을당 하루 사건 상한(0=무제한). 잘린 수는 stats.capped 로 보고
  REQ_DAYS: _num('EV_REQ_DAYS', 1),          // 의뢰 수량 = 소비EMA × 이 일수
  REQ_PREMIUM: _num('EV_REQ_PREMIUM', 0.20), // 보상 프리미엄 +20%
  // ★★[재민 확정 2026-08-25 · B-1] **물리 상한**. 비율 캡으로 값을 깎지 않는다 —
  //   보상은 마을 **실재고**에서만 나오고, 한 의뢰가 그 품목 재고의 이 비율을 넘겨 지불할 수 없다.
  //   "마을은 없는 걸 못 준다"가 유일한 제한이고, 그 제한은 **보상이 아니라 의뢰 크기**로 흡수한다.
  REW_STOCK_FRAC: _num('EV_REW_STOCK_FRAC', 0.25),
  REQ_MAX_PC: _num('EV_REQ_MAX_PC', 0.25),   // (구명 — REW_STOCK_FRAC 로 대체. 호환용으로만 남긴다)
  REQ_COOLDOWN: _num('EV_REQ_COOLDOWN', 3),  // 다 채워진 의뢰를 다시 걸기까지 쉬는 일수
  // ★비율 상한(0=무제한, **기본 OFF 유지가 재민 확정**). 극단 시세는 극단 부족의 신호고,
  //   그 보상이 플레이어를 걷게 만드는 게 의뢰 생성기의 존재 이유다 — 보이지 않는 손으로 깎지 않는다.
  //   켜면 **게시된 보상이 등가보다 낮아진다**(그게 이 손잡이의 뜻이다). 기본값은 끔.
  REQ_REW_CAP: _num('EV_REQ_REW_CAP', 0),
  BRIEF_N: _num('EV_BRIEF_N', 3),            // 촌장이 한 번에 전하는 건수
  // ★★[T7 2026-09-01] 복귀 브리핑 — 자리 비운 동안 **이 마을에 도달한** 사건을 몇 줄까지 전하는가.
  //   ⚠클라(`public/client/30-n-net.js`)의 말풍선은 `lines.slice(0, 3)` 이다 — 3 을 넘겨 보내면
  //     말풍선엔 3줄만 뜬다(알림 한 줄은 lines[0]). 기본 3 은 그 상한과 맞춘 값이다.
  RETURN_N: _num('EV_RETURN_N', 3),
  // 부재가 이 일수 미만이면 평소 브리핑 그대로 — 잠깐 나갔다 온 사람에게 잔소리하지 않는다.
  RETURN_MIN_DAYS: _num('EV_RETURN_MIN_DAYS', 1),
  // ★★[T18 2026-09-01] **연대기에 남을 만큼 큰 사건인가** — |ln(mag)| 문턱.
  //   왜 문턱인가: 사건 등급 필드는 **없다**(§0-ⓓ 실측). 있는 건 `sev = |ln(관측÷기준)|` 하나뿐이고,
  //   그건 이미 전 타입을 견주라고 만든 축이다(파일 머리 mag 정의). 새 등급표를 발명하는 대신
  //   그 축에 선을 긋는다 — **차등의 근거는 세계의 실제 데이터**(재민 확정 08-26).
  //   채택값 근거는 `scripts/ev-density.js` ⓔ 스윕(실지도 51마을 800일).
  //   ★채택 2.2 = **평소의 9배(또는 1/9)로 벗어난 일**(e^2.2 ≈ 9.0). 실지도 51마을 800일에서
  //     마을·계절당 14.4건 — 아래 상한 5로 추리면 "그 계절 다섯 가지 일"이 된다.
  CHRON_SEV: _num('EV_CHRON_SEV', 2.2),
  // ★★**이웃 마을 소식은 더 높은 문턱을 넘어야 한다.** 안 그러면 연표가 51마을의 잡음으로 덮인다
  //   (마을 하나의 연표에 다른 50곳의 사건이 전부 후보로 들어온다 — 계절당 700건 넘는다).
  //   3.5 = **33배 벗어난 일**(e^3.5 ≈ 33). 그쯤 돼야 남의 마을 일이 여기까지 회자된다.
  CHRON_FOREIGN_SEV: _num('EV_CHRON_FOREIGN_SEV', 3.5),
  // 한 계절에 실을 **이웃 마을 소식** 최대 줄 수(우리 마을 몫과 따로 센다).
  CHRON_FOREIGN: _num('EV_CHRON_FOREIGN', 2),
  // ★★한 계절 칸에 실을 최대 줄 수. 문턱만으로는 밀도가 세계 상태에 따라 흔들려
  //   어떤 해는 두 줄, 어떤 해는 200줄이 된다 — 연표는 **읽히는 것**이 목적이라 상한이 필요하다.
  //   자르는 기준은 **심각도**(그 계절에 가장 유난했던 것)이고, 잘린 수는 **반드시 보고한다**
  //   (조용한 절단 금지 — `commit` 의 `stats.capped` 와 같은 규약).
  CHRON_PER_SEASON: _num('EV_CHRON_PER_SEASON', 5),
  // ★★[T50 2026-09-02] **인구 축** — 재고가 아니라 **사람**이 주는 것. `STOCK_SHORTAGE` 와 다른 축이다
  //   (저건 곳간이 비는 일이고 이건 마을이 비는 일이다). 문법은 가격 이탈과 똑같다 —
  //   자기평균(EMA) 대비 이탈 + 에지 + 히스테리시스(`HYST` 공유). 상수는 **하나도 베끼지 않았다**:
  //   `bandits.js` 의 해체 판정(순감 5일·식량 3일치·잔존 55%)은 **도적단 결성의 조건**이고
  //   이건 **촌장이 하는 말**이다. 두 값이 갈라져도 서로 무해해야 하므로 각자 자기 근거를 갖는다.
  //   ★채택 근거: `scripts/ev-sources.js` ⓖ 스윕(실지도 51마을 800일 3시드).
  POP_WIN: _num('EV_POP_WIN', 90),        // 인구 자기평균 창(한 계절 — 계절 이주·아사가 한 창에 담긴다)
  POP_DOWN: _num('EV_POP_DOWN', 0.30),    // 자기평균 대비 −30% → 붕괴 위기 ★채택값
  POP_MIN: _num('EV_POP_MIN', 5),         // 이 인원 미만은 판정 제외(3명 마을의 1명은 33% 다 — 뉴스가 아니라 산수)
  RAID_N: _num('EV_RAID_N', 1),           // 약탈 mag 기준(CARAVAN_LATE 의 LATE_DAYS 와 같은 자리)
  FIRST_MIN: _num('EV_FIRST_MIN', 1),     // 이만큼은 실제로 들어와야 "처음 들어왔다"고 한다
  // ★★A/B 단일 손잡이 — `EV_DEEDS_OFF=1` 이면 **T50 이전 동작이 정확히 재현된다**
  //   (일 유형이 하나도 안 나고, 검출기도 안 돌고, 정렬도 sev 하나로 돌아간다).
  //   T7 의 `RUMOR_OFF` 와 같은 자리다 — 배치의 기여를 재려면 되돌릴 줄 하나가 있어야 한다.
  DEEDS_OFF: _num('EV_DEEDS_OFF', 0),
};
// ★연표에 실을 사건 유형 — 기본은 **계절 전환을 뺀 전부**다.
//   계절은 사건이 아니라 **연표의 축**이라(연·계절로 묶는 그 기준) 항목으로 또 적으면 겹친다.
const CHRON_TYPES = String(process.env.EV_CHRON_TYPES || 'STOCK_SHORTAGE,STOCK_GLUT,PRICE_SPIKE,PRICE_DROP,CARAVAN_LATE')
  .split(',').map((x) => x.trim()).filter(Boolean);

const TYPES = ['STOCK_SHORTAGE', 'STOCK_GLUT', 'PRICE_SPIKE', 'PRICE_DROP', 'CARAVAN_LATE', 'SEASON_CHANGE',
  // ★[T50 2026-09-02] 2차 — 세계의 "일". 원천이 §0 에서 실증된 것만 여기 있다(원천 없는 후보는 회부).
  'HARVEST_BOON', 'HARVEST_BLIGHT', 'WEATHER', 'POP_COLLAPSE', 'CARAVAN_RAIDED', 'TRADER_KILLED', 'BUILT', 'FIRST_GOODS',
  // ★[T20 2026-09-02] 겨울나기 공동 프로젝트의 **판정**. 공표는 사건이 아니라 `SEASON_CHANGE` 의 meta 다.
  'WINTER_KEPT', 'WINTER_SHORT'];
// ★★[T50] **"일" 유형** — 값의 이탈이 아니라 일어난 일. 정렬에서 먼저 서고, 연표 sev 문턱을 면제받는다.
//   면제의 근거는 **드묾**이다(실측 3.3%). 이 목록에 흔한 유형을 넣으면 그 순간 연표가 그것으로 덮인다.
const DEED_TYPES = String(process.env.EV_DEED_TYPES
  || 'HARVEST_BOON,HARVEST_BLIGHT,WEATHER,POP_COLLAPSE,CARAVAN_RAIDED,TRADER_KILLED,BUILT,FIRST_GOODS,WINTER_KEPT,WINTER_SHORT')
  .split(',').map((x) => x.trim()).filter(Boolean);
// ★이웃 마을에서 **여기까지 회자되는** 일. 날씨(573건 — 국지적이고 일주일이면 끝난다)·완공(남의 집)·
//   첫 물건(남의 곳간)은 빠진다. 남는 것은 그 마을의 운과 사람과 길의 안부다.
//   ⚠[T20] 겨울나기 판정도 **빠진다** — 남의 마을이 올겨울 넉넉한지는 이 마을 연표에 적을 일이 아니다.
const DEED_FOREIGN = String(process.env.EV_DEED_FOREIGN
  || 'HARVEST_BOON,HARVEST_BLIGHT,POP_COLLAPSE,CARAVAN_RAIDED,TRADER_KILLED')
  .split(',').map((x) => x.trim()).filter(Boolean);

// ★게시판이 다루는 품목은 **플레이어가 실제로 낼 수 있는 것**뿐이다.
//   정본은 `villages.playerVillageDepositMap()`(플레이어 아이템 ↔ econ 재화 대응표) 하나다 —
//   여기서 그 표를 다시 적지 않고 **주입받는다**(사본 금지). 주입이 없으면 게시판은 조용히 비어 있다:
//   낼 수 없는 의뢰는 의뢰가 아니라 벽이다.
function buildDeliverable(depositMap) {
  const items = new Map();    // econ 재화 → [플레이어 아이템…] (cooked_food 처럼 여럿이 매핑된다)
  const toEcon = new Map();   // econ 재화 → 대표 플레이어 아이템(보상 지급용 역방향)
  const fromEcon = new Set(); // 플레이어가 낼 수 있는 econ 재화(의뢰 대상)
  for (const [item, res] of Object.entries(depositMap || {})) {
    fromEcon.add(res);
    if (!items.has(res)) items.set(res, []);
    items.get(res).push(item);
    if (!toEcon.has(res)) toEcon.set(res, item);   // 첫 항목이 대표
  }
  return { items, toEcon, fromEcon };
}

// ★★[거래소 배치 2026-08-27] **물리 상한 부품 — 여기가 정본이다.**
//   B-1 이 세운 규칙: *마을은 없는 걸 못 준다.* 한 거래가 그 품목 재고의 `frac` 을 넘겨 가져갈 수 없다.
//   게시판 보상(`makeRequest`)과 거래소(`server/trade.js`)가 **같은 이 함수를 부른다** —
//   두 벌로 두면 한쪽만 고쳐지는 날이 오고, 그날 "게시판은 되는데 거래소는 안 되는" 마을이 생긴다.
//   ⚠**환산(가격 비율 × 배수)은 공유하지 않는다.** 게시판은 프리미엄을 얹고 최소 1을 보장하지만
//     (의뢰는 0 보상이면 의뢰가 아니다), 거래소에서 최소 1 보장은 **공짜 물건**이 된다. 뜻이 다르다.
function payableQty(stock, frac) {
  const s = Number(stock) || 0, f = Number(frac) || 0;
  if (!(s > 0) || !(f > 0)) return 0;
  return Math.floor(s * f);
}

// ── 계절 — econ 정본 함수를 그대로 부른다(사본 금지) ──────────────────────────
let _econV2 = null;
function seasonOf(day) {
  if (!_econV2) _econV2 = require(path.join(__dirname, '..', 'sim', 'economy-sim-v2'));
  // economy-sim-v2 는 seasonOf 를 export 하지 않는다 — 대신 SEASON 경계와 **같은 산수**를
  // 쓰는 대신, 공개된 temperatureAt 로 우회하지 않고 여기 한 줄로 둔다.
  // ⚠이 줄은 economy-sim-v2.js:210 `seasonOf` 와 동기 계약이다(둘 다 365일 4분기 · d<90/180/270).
  //   엔진이 계절 경계를 바꾸면 여기도 바꿔야 한다 — 그 사실을 test-events ③ 이 검사한다.
  const d = ((day % 365) + 365) % 365;
  return d < 90 ? 'spring' : d < 180 ? 'summer' : d < 270 ? 'autumn' : 'winter';
}
const KO_SEASON = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };

// ── ★★달력 — [재민 확정 2026-08-30] **원천은 econ 계절 정본 하나다.** ─────────
//   재민 지시: *"원천은 econ 계절 정본 하나 — 새 시계·새 매핑 상수 금지(사본 금지)."*
//   ⇒ 아래 셋은 **오직 `seasonOf` 만** 부른다. 365·90·180·270 같은 수를 여기 한 번도 안 적는다.
//     엔진이 계절 경계를 바꾸면 달력이 **저절로** 따라간다(고칠 곳이 없다).
//   ★비용: 경계 탐색은 계절 길이만큼(≈95회) 도는데, 결과를 캐시해 하루 1회만 돈다.
let _yearDays = 0;
function yearDaysOf() {
  if (_yearDays) return _yearDays;
  const first = seasonOf(0);
  let d = 1;
  // 첫 계절이 **다시 시작하는** 날 = 한 해의 길이. 상수를 안 쓰고 정본에서 읽어 낸다.
  while (d < 100000) { if (seasonOf(d) === first && seasonOf(d - 1) !== first) break; d++; }
  _yearDays = d;
  return _yearDays;
}
const _sStartCache = new Map();
function seasonStartOf(day) {
  const key = day | 0;
  if (_sStartCache.has(key)) return _sStartCache.get(key);
  const s = seasonOf(key);
  let d = key;
  while (d > 0 && seasonOf(d - 1) === s) d--;
  if (_sStartCache.size > 4096) _sStartCache.clear();
  _sStartCache.set(key, d);
  return d;
}
// 화면이 그릴 것 — "0년 여름 42일" 의 재료. **클라는 이걸 받아 쓰기만 한다**(매핑 사본 금지).
function calendarOf(day) {
  const d = Math.max(0, day | 0);
  const yd = yearDaysOf();
  const season = seasonOf(d);
  const start = seasonStartOf(d);
  let end = start;
  while (end < start + yd && seasonOf(end) === season) end++;
  return {
    day: d,
    year: Math.floor(d / yd),
    dayOfYear: d % yd,
    yearDays: yd,
    season, seasonKo: KO_SEASON[season] || season,
    dayOfSeason: d - start + 1,
    seasonDays: end - start,
  };
}

// ── 가격 — econ 정본 함수/캐시를 그대로 읽는다 ────────────────────────────────
//   tickTradeV2 는 매일 교역 자격이 있는 마을의 `_priceCache` 를 **그날 시세로** 덮는다
//   (economy-sim-v2.js:602). 그 값이 오늘 것이면 그대로 쓰고(추가 비용 0),
//   아니면(고립·포위·인구<2) 정본 함수를 부른다. 어느 쪽이든 **장부가 가격을 계산하지 않는다.**
function pricesOf(econV2, v, day) {
  if (v._priceCache && v._priceCacheDay === day) return v._priceCache;
  return econV2.computeShadowPrices(v);
}
// ★[거래소 2026-08-27] **캐시를 무시하고 지금 재고로** 다시 매긴 시세.
//   왜 필요한가 ①: 거래소가 큰 거래를 **한 조각씩** 값을 매기려면(trade.js `planSliced`),
//   조각마다 재고가 달라진 뒤의 시세를 봐야 한다. 하루 캐시를 보면 그 움직임이 안 보인다.
//   왜 필요한가 ② [`e2e-trade ⑤` 실측]: 거래소의 **표시·견적**도 이걸 써야 한다.
//   하루 캐시로 표시하면 플레이어가 재고를 ±30% 움직여도 화면 값이 소수점까지 그대로라
//   (ⓐ 이 배치의 존재 이유가 화면에서 사라지고 ⓑ 표시된 비율과 실제 수령량이 갈린다).
//   ⚠여전히 **정본 함수 하나**를 부를 뿐이다 — 가격을 여기서 계산하지 않는다.
//   ⚠NPC 교역(`tickTradeV2`)은 종전대로 하루 캐시를 읽는다 — 이 접근자는 그 경로를 안 건드린다.
function pricesFresh(econV2, v) { return econV2.computeShadowPrices(v); }

// ── 장부 ──────────────────────────────────────────────────────────────────────
function createLedger(opts) {
  const o = opts || {};
  const cfg = Object.assign({}, CFG, o.cfg || {});
  const vidOf = o.vidOf || ((v, i) => i);
  const econV2 = o.econV2 || require(path.join(__dirname, '..', 'sim', 'economy-sim-v2'));
  const DEL = buildDeliverable(o.depositMap);
  const onEvent = o.onEvent || null;          // (ev) => void — 영속화 훅(서버가 DB 에 꽂는다)
  const onRequest = o.onRequest || null;      // (req, 'open'|'close') => void
  // ★★[T18] 연대기 영속화 훅 — **사건 링버퍼는 90일이면 잘린다**(`KEEP_DAYS`). 연표는 해를 넘겨 읽는
  //   것이므로 잘리는 표를 볼 수 없다. ⇒ **큰 사건만** 따로, 잘리지 않는 곳에 남긴다.
  //   ⚠남기는 건 **사건 하나당 한 행**이다(마을×사건이 아니라). 누가 언제 들었는지는
  //   도달표가 **결정론적으로** 되돌려 주므로 저장할 이유가 없다(파생값 미저장 — spoil.js 규약).
  const onChronicle = o.onChronicle || null;  // (ev) => void

  // 마을별 상태. 전부 이 Map 안에만 산다(econ 객체 무오염).
  //   det: Map<item, {pEma,pN,short,glut,up,down}>
  //   ring: 최근 KEEP_DAYS 사건
  //   reqs: Map<item, request>
  // ★★[T7 2026-09-01] 소문 물리 전파 — 도달 시각표. 정본은 `server/rumor.js` 하나다.
  //   `geo` 가 주입되지 않으면 그래프가 없고, 그러면 **자기 마을 것만 보인다**(T7 이전 동작).
  //   랩(`econ-lab-real.js`·`ev-density.js`)엔 지형 거리행렬이 없으므로 자연히 그 쪽으로 떨어진다
  //   — 그래서 이 배치는 econ 기준선을 구조적으로 못 움직인다.
  const RUMOR = o.geo ? require(path.join(__dirname, 'rumor')).createGraph(o.geo) : null;
  // 장부가 아는 "오늘". prime/scanDay 가 세운다 — 조회 함수들이 날짜를 따로 받지 않아도
  // 같은 날을 보게 하는 유일한 자리다(시계 사본 금지).
  let _lastDay = 0;

  const byVid = new Map();
  const st = (vid) => {
    let s = byVid.get(vid);
    // chron: **잘리지 않는** 큰 사건 목록(연대기용 · day 오름차순). ring 과 겹쳐도 상관없다 —
    //   연표는 오직 이 배열만 읽는다(두 원천을 합치면 중복 제거가 새 규칙이 되고, 규칙은 갈라진다).
    if (!s) { s = { vid, det: new Map(), ring: [], reqs: new Map(), chron: [] }; byVid.set(vid, s); }
    return s;
  };
  const det = (s, r) => {
    let d = s.det.get(r);
    if (!d) { d = { pEma: null, pN: 0, short: false, glut: false, up: false, down: false }; s.det.set(r, d); }
    return d;
  };

  const stats = { days: 0, emitted: 0, capped: 0, byType: {}, scanMs: 0, reqOpened: 0, reqClosed: 0, reqFilled: 0,
    reqShrunk: 0, reqNoPay: 0, reqRevalidated: 0, reqRefused: 0,
    chronicled: 0, chronBuilt: 0, chronHit: 0, chronMs: 0 };
  for (const t of TYPES) stats.byType[t] = 0;

  let lastSeason = null;

  // 이 마을에서 이 품목이 **뉴스거리인가** — 소비하거나 갖고 있는 것만.
  //   (마을이 평생 본 적 없는 재화의 시세 요동은 그 마을 사람에게 뉴스가 아니다.)
  const relevant = (ema, stock) => (ema > 0 || stock > 0.5);

  // 후보 품목 = 소비EMA 키 ∪ 곳간 키. `_` 로 시작하는 내부 필드는 제외(`_cash` 등).
  //   ★매일 Set 을 새로 짓지 않는다 — 재화 목록은 거의 안 바뀌는데 51마을×800일이면 4만 번이다.
  //     키 개수가 바뀐 날에만 다시 짓는다(재화가 늘거나 곳간이 비어 키가 지워진 날).
  function itemsOf(s, v) {
    const e = v._consEMA || {}, sto = v.storage || {};
    let ne = 0; for (const _k in e) ne++;
    let ns = 0; for (const _k in sto) ns++;
    if (s.itemList && s.itemNE === ne && s.itemNS === ns) return s.itemList;
    const set = new Set();
    for (const r in e) if (r.charCodeAt(0) !== 95) set.add(r);
    for (const r in sto) if (r.charCodeAt(0) !== 95) set.add(r);
    s.itemNE = ne; s.itemNS = ns; s.itemList = [...set];
    return s.itemList;
  }

  // ── ★★[T50 2026-09-02] "일" 검출기 ─────────────────────────────────────────
  //   ★이 절의 제1 규약: **장부는 판정하지 않는다.** 아래 넷 중 셋은 econ 이 스스로 세운 상태
  //     (`_yearShock`·`_weather`·`tradeStats`)의 **에지**를 읽을 뿐이고, 장부가 문턱을 가진 것은
  //     인구 축 하나뿐이다. 그 하나도 새 문법이 아니라 **가격 이탈과 같은 문법**(자기평균 대비)이다.
  //   ★제2 규약: **econ 을 한 글자도 안 건드린다.** 전부 읽기고, 검출기 상태는 `s`(장부 안)에 산다.
  //   ★제3 규약: 랩(econ 단독)에서 **날 수 있는 것만** 여기서 난다. 도적 호스트가 없으면 약탈은
  //     구조적으로 0 이고(CARAVAN_LATE 와 같은 자리), 생활층이 없으면 완공도 0 이다.
  //     ⇒ 그래서 이 배치는 econ 기준선을 못 움직인다(관측은 개입이 아니다).
  const _wxKey = (w) => (w ? (w.name + '@' + (w.untilDay | 0)) : null);
  function deedPrime(s, v, day) {
    s.ysK = _wxKey(v._yearShock && v._yearShock.untilDay >= day ? v._yearShock : null);
    s.wxK = _wxKey(v._weather && v._weather.untilDay >= day ? v._weather : null);
    const ts = v.tradeStats || {};
    s.raidSeen = +ts.caravansRaided || 0;
    s.killSeen = +ts.tradersKilled || 0;
    const n = (v.npcs || []).length;
    s.popEma = n >= cfg.POP_MIN ? n : null;
    s.popLow = false;
  }
  // 이 마을이 **가진 적 있는** 재화 — "처음 들어왔다"의 기준.
  //   ★영속을 새로 만들지 않는다: 현재 곳간 ∪ 연표에 남은 지난 `FIRST_GOODS`.
  //     일 유형은 전부 연표에 남으므로(`isChronicle`), 재기동해도 `loadChronicle` 이 그 이력을 되돌린다.
  //     ⇒ 파생 상태를 저장하지 않는다는 규약(도달일 미저장과 같은 자리)을 여기서도 지킨다.
  function goodsOf(s, v) {
    if (!s.goods) {
      s.goods = new Set();
      for (const r in (v.storage || {})) if (r.charCodeAt(0) !== 95 && (v.storage[r] || 0) > 0) s.goods.add(r);
    }
    // ⚠호스트는 `prime()` 뒤에 `loadChronicle()` 을 부른다(villages.js 부팅 순서) — 그래서 지난
    //   이력은 프라이밍 때 아직 없다. 첫 조회 때 **한 번** 접어 넣는다(그 뒤로는 공짜).
    if (!s.goodsChron) {
      s.goodsChron = true;
      for (const ev of s.chron) if (ev.type === 'FIRST_GOODS' && ev.item) s.goods.add(ev.item);
    }
    return s.goods;
  }
  function deeds(s, v, day, mine) {
    if (cfg.DEEDS_OFF) return;              // ★A/B — T50 이전 동작(검출기 자체를 안 돌린다)
    // ① 풍년·흉년 — econ 이 가을 첫날 마을마다 정하는 그 해의 운. mag 은 econ 이 **실제로 곱하는** 배수다.
    const ys = (v._yearShock && v._yearShock.untilDay >= day) ? v._yearShock : null;
    const ysK = _wxKey(ys);
    if (ysK && ysK !== s.ysK) {
      const m = +((ys.mult && ys.mult.fertility) || 1);
      mine.push({ day, vid: s.vid, type: m >= 1 ? 'HARVEST_BOON' : 'HARVEST_BLIGHT', item: ys.name,
        mag: +m.toFixed(4), meta: { until: ys.untilDay | 0 } });
    }
    s.ysK = ysK;
    // ② 날씨 — 가뭄·폭풍·풍요·안개. mag = 배수 중 **1 에서 가장 멀리 벗어난 것**(그 날씨의 실제 크기).
    //    ⚠`_weather.name` 은 econ 정본의 이름이다(랩 WEATHER_KINDS). 여기서 종류를 다시 정의하지 않는다.
    const wx = (v._weather && v._weather.untilDay >= day) ? v._weather : null;
    const wxK = _wxKey(wx);
    if (wxK && wxK !== s.wxK) {
      let m = 1, best = 0;
      for (const k in (wx.mult || {})) {
        const x = +wx.mult[k];
        if (!isFinite(x) || !(x > 0)) continue;
        const d = Math.abs(Math.log(x));
        if (d > best) { best = d; m = x; }
      }
      // ★★종류는 **`item` 에** 담는다(`meta` 가 아니라). `village_chronicle` 표는 meta 를 안 담기
      //   때문이다(T18 규약) — meta 에 두면 재기동 뒤 연표가 "날씨가 심상찮네"로 뭉개진다.
      //   ★이 함정을 test-events ㉘(결정론)이 실제로 잡았다. 규약: **연표 문장은 vid·day·type·item·mag
      //     만으로 만들어져야 한다.** `test-events ㉝` 이 전 유형에 대해 그걸 검사한다.
      mine.push({ day, vid: s.vid, type: 'WEATHER', item: wx.name, mag: +m.toFixed(4),
        meta: { until: wx.untilDay | 0 } });
    }
    s.wxK = wxK;
    // ③ 인구 붕괴 위기 — **사람이 줄고 있다.**
    const n = (v.npcs || []).length;
    if (n >= cfg.POP_MIN) {
      if (s.popEma == null) s.popEma = n;
      else {
        const ratio = n / s.popEma;
        const on = 1 - cfg.POP_DOWN, off = 1 - cfg.POP_DOWN / cfg.HYST;
        if (!s.popLow && ratio < on) {
          s.popLow = true;
          mine.push({ day, vid: s.vid, type: 'POP_COLLAPSE', item: null, mag: +ratio.toFixed(4),
            meta: { pop: n, was: Math.round(s.popEma) } });
        } else if (s.popLow && ratio > off) s.popLow = false;
        s.popEma = s.popEma * (1 - 1 / cfg.POP_WIN) + n * (1 / cfg.POP_WIN);
      }
    } else { s.popEma = null; s.popLow = false; }
    // ④ 캐러밴 약탈 — econ 이 도적 갱과의 실전투 끝에 올리는 누계의 **증분**.
    //    ★행상 사망은 **별도 유형**이다. 같은 유형 안에서 `meta.dead` 로 갈랐더니 연표가 재기동
    //      뒤에 그 갈래를 잃었다(meta 미영속) — 그리고 물건을 잃은 것과 사람이 죽은 것은
    //      애초에 같은 사건이 아니다. 유형이 다르면 문장도 도달도 연표도 저절로 갈린다.
    const ts = v.tradeStats || {};
    const raided = +ts.caravansRaided || 0, killed = +ts.tradersKilled || 0;
    if (s.raidSeen == null) { s.raidSeen = raided; s.killSeen = killed; }
    else {
      if (raided > s.raidSeen) {
        mine.push({ day, vid: s.vid, type: 'CARAVAN_RAIDED', item: null,
          mag: +((raided - s.raidSeen) / Math.max(1e-9, cfg.RAID_N)).toFixed(4), meta: { n: raided - s.raidSeen } });
        s.raidSeen = raided;
      }
      if (killed > s.killSeen) {
        mine.push({ day, vid: s.vid, type: 'TRADER_KILLED', item: null,
          mag: +((killed - s.killSeen) / Math.max(1e-9, cfg.RAID_N)).toFixed(4), meta: { n: killed - s.killSeen } });
        s.killSeen = killed;
      }
    }
    // ⑤ 지금 곳간에 있는 것은 전부 **가진 적 있음**이다 — 스스로 캐거나 거둔 것은 "처음 들어온 물건"이
    //    아니다. 이 적립이 없으면 자급하던 재화가 어쩌다 실려 온 날 "처음"이라고 적힌다.
    {
      const g = goodsOf(s, v), sto = v.storage || {};
      for (const r in sto) if (r.charCodeAt(0) !== 95 && (sto[r] || 0) > 0) g.add(r);
    }
  }

  // 마을 이름 → vid. 거래 기록이 이름으로 적히기 때문에 필요하다(사본이 아니라 색인이다).
  const _nameVid = new Map();
  function firstGoods(hit, res, amt, day, out) {
    if (!hit || !res || !(+amt >= cfg.FIRST_MIN)) return;
    const vid = hit.vid;
    const s = st(vid);
    const g = goodsOf(s, hit.v);
    if (g.has(res)) return;
    g.add(res);
    commit(s, [{ day, vid, type: 'FIRST_GOODS', item: res, mag: 1,
      meta: { amt: +(+amt).toFixed(2) } }], out);
  }

  // ── 프라이밍: 지금 상태를 래치에 **소리 없이** 심는다 ───────────────────────
  //   왜: 서버 재기동 직후 첫 하루 경계에서 "이미 몇 달째 부족하던 품목" 전부가 한꺼번에
  //   터지면 그건 뉴스가 아니라 재기동 잡음이다. 시작 상태는 사건이 아니라 **배경**이다.
  function prime(world) {
    const day = world.day | 0;
    _lastDay = day;
    lastSeason = seasonOf(day);
    world.villages.forEach((v, i) => {
      const vid = vidOf(v, i);
      if (vid == null) return;
      const s = st(vid);
      const prices = pricesOf(econV2, v, day);
      const e = v._consEMA || {}, sto = v.storage || {};
      for (const r of itemsOf(s, v)) {
        const d = det(s, r);
        const ema = +e[r] || 0, stock = +sto[r] || 0;
        d.short = ema > 0 && stock < ema * cfg.SHORT_DAYS;
        d.glut = ema > 0 && stock > ema * cfg.GLUT_DAYS;
        const p = +prices[r] || 0;
        if (p > 0) { d.pEma = p; d.pN = 1; }
      }
      // ★[T50] 일 검출기도 같은 이유로 심는다 — 재기동 직후 "지난 가을부터 흉년이던 마을"
      //   전부가 한꺼번에 터지면 그건 뉴스가 아니라 재기동 잡음이다(위 프라이밍 주석과 같은 규약).
      deedPrime(s, v, day);
    });
    return byVid.size;
  }

  // ── 하루 경계 스캔 ─────────────────────────────────────────────────────────
  //   extra.caravanDelays: [{ vid, days, from, to }] — 호스트(server/villages.js)가
  //   실체 캐러밴의 `body.delayedDays` 증분을 그대로 넘긴다. 랩(econ 단독)엔 실체가 없으니 빈 배열이다.
  function scanDay(world, day, extra) {
    const t0 = process.hrtime.bigint();
    const out = [];
    _lastDay = day | 0;
    const season = seasonOf(day);
    const seasonTurned = (lastSeason != null && season !== lastSeason);
    lastSeason = season;
    // ★[T20] 겨울나기 — 호스트(`server/winter.js`)가 오늘치를 넘긴다. 장부는 실어 나르기만 한다.
    const wGoal = (extra && extra.winter && extra.winter.goal) || null;
    // ★[T50] 거래 기록은 마을을 **이름**으로 적는다(econ 정본 필드) — 이름↔마을 색인이 필요하다.
    //   마을 구성이 바뀔 때만 다시 짓는다(`itemsOf` 와 같은 절약 문법).
    if (_nameVid.size !== world.villages.length) {
      _nameVid.clear();
      world.villages.forEach((v, i) => { const id = vidOf(v, i); if (id != null && v.name != null) _nameVid.set(v.name, { vid: id, v }); });
    }
    // ★★**교역 도착은 마을 루프보다 먼저 본다.** 순서가 계약이다: 도착한 물건은 이미 곳간에 들어와
    //   있으므로(econ 틱이 먼저 돌았다), 곳간을 "가진 적 있음"으로 적립하기 **전에** 물어야
    //   "처음 들어왔다"가 성립한다. 뒤로 미루면 이 유형은 영원히 0 건이 된다.
    const TL = cfg.DEEDS_OFF ? null : world.tradeLog;
    if (TL && TL.length) {
      for (let i = TL.length - 1; i >= 0; i--) {
        const e = TL[i];
        if ((e.day | 0) !== (day | 0)) { if ((e.day | 0) < (day | 0)) break; else continue; }
        if (e.rerouted || e.abandoned) continue;   // 재routing·빈손 귀환은 **도착이 아니다**
        if (e.sent) firstGoods(_nameVid.get(e.to), e.sent.res, e.sent.amt, day, out);
        if (e.bought) firstGoods(_nameVid.get(e.from), e.bought.res, e.bought.amt, day, out);   // 되사 온 물건도 도착이다
      }
    }

    world.villages.forEach((v, i) => {
      const vid = vidOf(v, i);
      if (vid == null) return;
      if (!v.npcs || v.npcs.length === 0) return;   // 사람이 없는 마을엔 소식이 없다
      const s = st(vid);
      const mine = [];
      const prices = pricesOf(econV2, v, day);
      const e = v._consEMA || {}, sto = v.storage || {};

      for (const r of itemsOf(s, v)) {
        const ema = +e[r] || 0, stock = +sto[r] || 0;
        const d = det(s, r);

        // ① 재고 부족 — 소비가 있는 품목만(소비 0 이면 문턱 0 → 애초에 성립 불가)
        if (ema > 0) {
          const thr = ema * cfg.SHORT_DAYS;
          if (!d.short && stock < thr) {
            d.short = true;
            mine.push({ day, vid, type: 'STOCK_SHORTAGE', item: r, mag: +(stock / thr).toFixed(4), meta: { stock: +stock.toFixed(2), thr: +thr.toFixed(2) } });
          } else if (d.short && stock > thr * cfg.HYST) d.short = false;

          // ② 재고 과잉 — ★소비EMA>0 인 품목만. 소비 없는 품목의 허위 글럿 금지(재민 명시).
          const thrG = ema * cfg.GLUT_DAYS;
          if (!d.glut && stock > thrG) {
            d.glut = true;
            mine.push({ day, vid, type: 'STOCK_GLUT', item: r, mag: +(stock / thrG).toFixed(4), meta: { stock: +stock.toFixed(2), thr: +thrG.toFixed(2) } });
          } else if (d.glut && stock < thrG / cfg.HYST) d.glut = false;
        } else {
          // 소비가 끊긴 품목은 래치를 푼다(다시 소비가 살아나면 그때 새 사건이 난다)
          d.short = false; d.glut = false;
        }

        // ③④ 가격 이탈 — **어제까지의** 자기평균과 오늘 값을 견준다(오늘 값을 평균에 먼저 섞지 않는다).
        const p = +prices[r] || 0;
        if (p > cfg.PRICE_MIN) {
          const warm = d.pEma != null && d.pN >= cfg.PRICE_WIN;
          if (warm && relevant(ema, stock)) {
            const ratio = p / d.pEma;
            const upOn = 1 + cfg.PRICE_UP, upOff = 1 + cfg.PRICE_UP * 0.6;
            const dnOn = 1 - cfg.PRICE_DOWN, dnOff = 1 - cfg.PRICE_DOWN * 0.6;
            if (!d.up && ratio > upOn) {
              d.up = true;
              mine.push({ day, vid, type: 'PRICE_SPIKE', item: r, mag: +ratio.toFixed(4), meta: { p: +p.toFixed(3), avg: +d.pEma.toFixed(3) } });
            } else if (d.up && ratio < upOff) d.up = false;
            if (!d.down && ratio < dnOn) {
              d.down = true;
              mine.push({ day, vid, type: 'PRICE_DROP', item: r, mag: +ratio.toFixed(4), meta: { p: +p.toFixed(3), avg: +d.pEma.toFixed(3) } });
            } else if (d.down && ratio > dnOff) d.down = false;
          }
          // 폴드는 판정 뒤에(EMA α=1/WIN — _consEMA 와 같은 문법)
          d.pEma = (d.pEma == null) ? p : d.pEma * (1 - 1 / cfg.PRICE_WIN) + p * (1 / cfg.PRICE_WIN);
          d.pN++;
        }
      }

      // ⑤ 계절 전환 — 전환일에 마을당 1건(촌장 인사의 근거)
      //    ★[T20] 가을 첫날이면 호스트가 넘긴 **겨울 목표**를 같이 싣는다(새 사건 종류 0).
      //      ⚠연표는 이 meta 를 못 본다(㉝) — 그래서 **공표는 브리핑·게시판의 일**이고 연표에 남는 건 판정이다.
      if (seasonTurned) mine.push({ day, vid, type: 'SEASON_CHANGE', item: null, mag: 1,
        meta: (wGoal && wGoal[vid]) ? { season, winter: wGoal[vid] } : { season } });

      // ⑥ ★[T50] 세계의 "일" — 풍흉·날씨·인구·약탈. econ 상태의 에지만 읽는다(위 절 참조).
      deeds(s, v, day, mine);

      commit(s, mine, out);
    });

    // ⑥ 교역 도착 지연 — 실체 층(server/villages.js `body.delayedDays`)이 있을 때만.
    //    econ 단독(랩)엔 실체가 없어 0건이다. **없는 데이터를 억지로 만들지 않는다.**
    for (const cd of ((extra && extra.caravanDelays) || [])) {
      if (cd == null || cd.vid == null) continue;
      const days = +cd.days || 0;
      if (days < cfg.LATE_DAYS) continue;
      const s = st(cd.vid);
      commit(s, [{ day, vid: cd.vid, type: 'CARAVAN_LATE', item: null, mag: +(days / cfg.LATE_DAYS).toFixed(4),
        meta: { days, from: cd.from || null, to: cd.to || null } }], out);
    }

    // ⑨ ★[T50] **완공** — 실체 층(server/villages.js 생활층)이 넘겨 준 것만. 랩엔 집도 곳간도 없다.
    //    장부는 건축을 모른다 — 다 지은 그 순간을 호스트가 알려 줄 뿐이다(caravanDelays 와 같은 자리).
    for (const b of ((!cfg.DEEDS_OFF && extra && extra.builds) || [])) {
      if (b == null || b.vid == null) continue;
      commit(st(b.vid), [{ day, vid: b.vid | 0, type: 'BUILT', item: b.kind || 'house', mag: 1, meta: null }], out);
    }

    // ⑩ ★[T20] **겨울나기 판정** — 호스트가 넘긴 것만. 장부가 겨울을 판정하지 않는다(완공과 같은 자리).
    //    ⚠참여 0 인 마을은 호스트가 아예 안 넘긴다 ⇒ 플레이어 없는 랩에서 구조적으로 0 건이다.
    for (const e of ((extra && extra.winter && extra.winter.emit) || [])) {
      if (e == null || e.vid == null) continue;
      commit(st(e.vid), [{ day, vid: e.vid | 0, type: String(e.type), item: e.item || null,
        mag: +e.mag || 1, meta: e.meta || null }], out);
    }

    // ⑦ 의뢰 — 부족 **래치**가 서 있으면 걸려 있고, 회복하면 거둔다(사건 에지가 아니라 상태)
    syncRequests(world, day);

    stats.days++;
    stats.scanMs += Number(process.hrtime.bigint() - t0) / 1e6;
    return out;
  }

  // 하루치 사건을 링버퍼·영속·통계에 밀어넣는다(상한이 있으면 |ln(mag)| 큰 것부터 남긴다).
  function commit(s, mine, out) {
    if (!mine.length) return;
    // ★★[T7] **도달표는 사건이 날 때 한 번 계산한다.** 출발 마을당 한 번이고(51마을이면 최대 51번),
    //   그 뒤로는 조회도 하루 경계도 그래프를 걷지 않는다. 여기 두는 이유는 "사건이 존재하는 순간
    //   그 사건이 언제 어디에 닿는지도 이미 정해져 있다"가 이 층의 계약이기 때문이다 —
    //   조회 때 계산하면 계약이 "조회할 때 정해진다"로 미끄러진다.
    if (RUMOR) RUMOR.rowOf(s.vid);
    let keep = mine;
    if (cfg.MAX_DAY > 0 && mine.length > cfg.MAX_DAY) {
      keep = mine.slice().sort((a, b) => sev(b) - sev(a)).slice(0, cfg.MAX_DAY);
      stats.capped += mine.length - keep.length;   // ★잘린 수를 반드시 보고한다(조용한 절단 금지)
    }
    for (const ev of keep) {
      s.ring.push(ev);
      out.push(ev);
      stats.emitted++;
      stats.byType[ev.type] = (stats.byType[ev.type] || 0) + 1;
      if (onEvent) { try { onEvent(ev); } catch (err) { /* 영속화 실패가 틱을 죽이지 않는다 */ } }
      // ★[T18] 큰 사건이면 연대기에도 — **링버퍼와 별개**라 90일 뒤에도 남는다.
      if (isChronicle(ev)) {
        s.chron.push(ev);
        stats.chronicled++;
        if (onChronicle) { try { onChronicle(ev); } catch (err) {} }
      }
    }
    // 링버퍼 — 최근 KEEP_DAYS 일. 오래된 것부터 버린다.
    const cut = keep[keep.length - 1].day - cfg.KEEP_DAYS;
    while (s.ring.length && s.ring[0].day < cut) s.ring.shift();
  }
  const sev = (ev) => Math.abs(Math.log(Math.max(1e-6, ev.mag || 1)));
  // ★★[T50 2026-09-02] **사건의 무게 — 축이 둘이다.**
  //   `sev` 는 "값이 평소에서 얼마나 벗어났나"를 잰다. 값 유형끼리는 그걸로 견줄 수 있다.
  //   그런데 **일 유형에는 그 눈금이 없다** — 흉년은 비옥도 0.7배(sev 0.36)고 소금값 급등은 9배(2.2)라,
  //   한 자로 재면 촌장은 흉년 대신 소금값을 말한다. 그게 T18 회부 A-1 이 적은 결함이다.
  //   ⇒ 축을 섞지 않는다: **일이 먼저 서고, 그 안에서 sev 로 견준다.** 브리핑·게시판·연표가
  //     전부 이 비교자 하나를 쓴다(정렬 사본을 만들면 그날 촌장과 연표가 다른 말을 한다).
  const isDeed = (ev) => !cfg.DEEDS_OFF && DEED_TYPES.indexOf(ev.type) >= 0;
  const heavier = (a, b) => ((isDeed(b) ? 1 : 0) - (isDeed(a) ? 1 : 0)) || (sev(b) - sev(a));
  // ★[T18/T50] 연표에 남길 만큼 큰 사건인가 — **일이면 문턱 없이**, 값이면 화이트리스트 ∩ 심각도 문턱.
  //   `SEASON_CHANGE` 는 기본 목록에 없다: 계절은 사건이 아니라 **연표의 축**이다.
  //   일 유형에 문턱을 안 두는 근거는 **실측된 드묾**이다(값 18,434건 대 일 623건 · 800일 51마을 3시드).
  //   ⚠이 목록(`EV_DEED_TYPES`)에 흔한 유형을 넣으면 그 순간 연표가 그것으로 덮인다.
  const isChronicle = (ev) => isDeed(ev) || (CHRON_TYPES.indexOf(ev.type) >= 0 && sev(ev) >= cfg.CHRON_SEV);

  // ── 게시판 의뢰 ────────────────────────────────────────────────────────────
  // ★사건은 **에지**지만 의뢰는 **상태**다 — 이 구분이 이 층의 핵심이다.
  //   소금이 떨어진 날 촌장이 한 번 말하는 것(사건)과, 소금 의뢰가 게시판에 **걸려 있는 것**(상태)은
  //   다른 것이다. 의뢰를 사건 에지에만 걸면 두 가지가 깨진다:
  //     ① 서버가 재기동하면 이미 몇 달째 부족하던 품목의 의뢰가 영영 안 걸린다(에지가 지났으므로).
  //     ② 한 번 채워졌는데 아직도 부족한 마을이 다시 걸지 못한다 — **1개 내고 끝**.
  //   ⇒ 의뢰는 **부족 래치가 서 있는 동안** 걸려 있고, 래치가 풀리면 거둔다.
  //   채워진 뒤의 재게시는 COOLDOWN 일 쉰다(같은 의뢰를 매일 갈아 먹는 되풀이 차단).
  function syncRequests(world, day) {
    world.villages.forEach((v, i) => {
      const vid = vidOf(v, i);
      if (vid == null) return;
      const s = byVid.get(vid);
      if (!s) return;
      // ① 철회 — 부족 래치가 풀렸거나(재고 회복) 다 채워졌으면
      for (const [item, req] of [...s.reqs]) {
        const d = s.det.get(item);
        const filled = req.filled >= req.qty;
        if (!d || !d.short || filled) {
          s.reqs.delete(item);
          stats.reqClosed++;
          if (d) d.reqClosedDay = filled ? day : -Infinity;   // 회복으로 거둔 건 쉬지 않는다(다시 떨어지면 바로 건다)
          if (onRequest) { try { onRequest(req, 'close'); } catch (e) {} }
        }
      }
      // ①b 약속 재검증 — 갚을 수 없게 된 의뢰는 조건을 바꾸지 않고 거두거나 받은 만큼으로 닫는다
      revalidate(s, v, day);
      // ② 게시 — 부족이 서 있고, 플레이어가 낼 수 있고, 쉬는 기간이 지난 품목
      let prices = null;
      for (const [item, d] of s.det) {
        if (!d.short || s.reqs.has(item)) continue;
        if (!DEL.fromEcon.has(item)) continue;                 // 낼 수 없는 의뢰는 의뢰가 아니라 벽이다
        if (d.reqClosedDay != null && (day - d.reqClosedDay) < cfg.REQ_COOLDOWN) continue;
        if (!prices) prices = pricesOf(econV2, v, day);
        const req = makeRequest(s, v, item, prices, day);
        if (!req) continue;
        s.reqs.set(item, req);
        stats.reqOpened++;
        if (onRequest) { try { onRequest(req, 'open'); } catch (e) {} }
      }
    });
  }

  // ★★[재민 확정 2026-08-25 · B-1] **게시된 보상은 반드시 전액 지급 가능해야 한다.**
  //   종전 판은 `rewQty = min(등가, 재고×비율)` 이었다 — 그건 **조용히 덜 주는 것**이다.
  //   게시판에 걸린 값과 실제 값이 갈리면 그게 보이지 않는 손이다(일관성 원칙 위반).
  //   ⇒ 보상은 **깎지 않는다**. 못 갚으면 **구하는 양을 줄인다**. 그것도 안 되면 **안 건다**.
  //     ⓐ 지금 요청량을 전액 갚을 수 있는 잉여 품목이 있으면 그것으로
  //     ⓑ 아무도 전액을 못 갚으면 갚을 수 있는 선까지 **요청 qty 축소**
  //     ⓒ 최소 단위(1)도 못 갚으면 **미게시** — 못 갚을 의뢰는 의뢰가 아니라 거짓말이다
  function makeRequest(s, v, item, prices, day) {
    const ema = +((v._consEMA || {})[item]) || 0;
    const wantQty = Math.max(1, Math.round(ema * cfg.REQ_DAYS));
    const pWant = +prices[item] || 0;
    if (!(pWant > 0)) return null;
    const sto = v.storage || {};

    // 후보 잉여 — 플레이어가 **받을 수 있고** 재고·시세가 있는 품목만.
    //   우선순위: ①글럿인 것(정말 남아도는 것부터) ②지불 가능량 많은 순.
    const cands = [];
    for (const r of Object.keys(sto)) {
      if (r === item || r.charCodeAt(0) === 95 || !DEL.toEcon.has(r)) continue;
      const stock = +sto[r] || 0, pRew = +prices[r] || 0;
      if (!(stock > 0) || !(pRew > 0)) continue;
      const d = s.det.get(r);
      cands.push({ r, stock, pRew, glut: !!(d && d.glut), payable: payableQty(stock, cfg.REW_STOCK_FRAC) });
    }
    if (!cands.length) { stats.reqNoPay++; return null; }
    cands.sort((a, b) => ((b.glut ? 1 : 0) - (a.glut ? 1 : 0)) || (b.payable - a.payable));

    // 시세 등가 + 프리미엄 — **이 값은 깎지 않는다**(REQ_REW_CAP 을 명시적으로 켠 경우 제외)
    const rewFor = (q, c) => {
      let rq = Math.max(1, Math.round(q * (pWant / c.pRew) * (1 + cfg.REQ_PREMIUM)));
      if (cfg.REQ_REW_CAP > 0) rq = Math.min(rq, cfg.REQ_REW_CAP);
      return rq;
    };

    // ⓐ 요청량 그대로 전액 지급 가능한 잉여
    for (const c of cands) {
      if (c.payable <= 0) continue;
      const rq = rewFor(wantQty, c);
      if (rq <= c.payable) return { vid: s.vid, item, qty: wantQty, filled: 0, rewItem: c.r, rewQty: rq, day, fit: 'full' };
    }
    // ⓑ 요청 축소 — 갚을 수 있는 만큼만 구한다. 가장 많이 구할 수 있는 후보를 고른다.
    let best = null;
    for (const c of cands) {
      if (c.payable <= 0) continue;
      const maxQty = Math.floor((c.payable * c.pRew) / (pWant * (1 + cfg.REQ_PREMIUM)));
      if (maxQty < 1) continue;
      const q = Math.min(wantQty, maxQty);
      const rq = rewFor(q, c);
      if (rq > c.payable) continue;
      if (!best || q > best.qty) best = { vid: s.vid, item, qty: q, filled: 0, rewItem: c.r, rewQty: rq, day, fit: 'shrunk' };
    }
    if (best) { stats.reqShrunk++; return best; }
    // ⓒ 못 갚으면 안 건다
    stats.reqNoPay++;
    return null;
  }

  // ★게시된 약속이 아직 유효한가 — 하루 경계마다 다시 본다.
  //   마을 재고는 계속 움직인다(NPC 가 먹고 캐러밴이 실어 간다). 어제 갚을 수 있던 것을
  //   오늘 못 갚을 수 있고, 그 상태로 두면 **플레이어가 낸 뒤에 거절당한다**.
  function revalidate(s, v, day) {
    const sto = v.storage || {};
    for (const [item, req] of [...s.reqs]) {
      const remainQty = req.qty - req.filled;
      if (remainQty <= 0) continue;
      const remainRew = Math.round(req.rewQty * (remainQty / req.qty));
      if (Math.floor(+sto[req.rewItem] || 0) >= remainRew) continue;   // 아직 갚을 수 있다
      stats.reqRevalidated++;
      if (req.filled > 0) {
        // 이미 일부를 받았다 — 조건을 바꾸지 않는다. 받은 만큼으로 닫는다("그만하면 됐네").
        req.qty = req.filled;
        continue;
      }
      // 아무도 안 냈다 — 거둔다. 다음 게시 때 지금 재고로 다시 계산된다(ⓐⓑⓒ).
      s.reqs.delete(item);
      stats.reqClosed++;
      const d = s.det.get(item);
      if (d) d.reqClosedDay = -Infinity;   // 갚을 게 생기면 바로 다시 걸 수 있게(쉬는 기간 없음)
      if (onRequest) { try { onRequest(req, 'close'); } catch (e) {} }
    }
  }

  // 납품 — **원자적**. 남은 몫만 받고 초과분은 거절한다(동시 납품 경쟁 조건).
  //   실물 이동(플레이어 인벤 ↔ 마을 곳간)은 호스트가 정본 함수로 한다. 장부는 몫만 센다.
  function claim(vid, item, want) {
    const s = byVid.get(vid);
    const req = s && s.reqs.get(item);
    if (!req) return { ok: false, err: '그런 의뢰가 없다' };
    const room = req.qty - req.filled;
    if (!(room > 0)) return { ok: false, err: '이미 다 채워진 의뢰다' };
    const n = Math.floor(Number(want) || 0);
    if (!(n > 0)) return { ok: false, err: '낼 수량이 없다' };
    const take = Math.min(n, room);                   // ★초과분 거절 — 여기서 즉시 확정(await 없음 = 원자적)
    req.filled += take;
    const rew = Math.max(0, Math.round(req.rewQty * (take / req.qty)));
    const done = req.filled >= req.qty;
    stats.reqFilled += take;
    return { ok: true, take, refused: n - take, rew, rewItem: req.rewItem, done, req };
  }
  // 정산 실패 시 되돌리기(호스트가 실물 이동에 실패했을 때만)
  function unclaim(vid, item, take) {
    const s = byVid.get(vid); const req = s && s.reqs.get(item);
    if (req) { req.filled = Math.max(0, req.filled - (Number(take) || 0)); stats.reqFilled -= (Number(take) || 0); }
  }

  // ── ★★[T7 2026-09-01] 가시성 술어 — **여기가 유일한 문이다** ────────────────
  //   재민 확정: *"마을 V 에서 사건 e 가 보인다 ⇔ today ≥ e.reach[V]."*
  //   게시판·브리핑·시작 화면 근황(온보딩 v2)이 **전부 이 함수를 거쳐서만** 사건을 본다.
  //   사본을 만들면 그날 "촌장은 아는데 게시판은 모르는" 마을이 생긴다.
  //
  // ★도달표를 사건 레코드에 **넣지 않는다**(51칸짜리 객체 × 사건 수 = 순수 낭비).
  //   도달일은 `사건이 난 날 + 출발마을→그 마을 일수` 이고, 뒤엣것은 출발 마을당 한 번 계산해
  //   캐시한 표(server/rumor.js)에서 O(1) 로 나온다. DB 스키마도 그대로다(파생값은 저장하지 않는다 —
  //   신선도를 저장하지 않는 `spoil.js` 와 같은 규약).
  //
  // ★직접 목격 예외: 플레이어가 **그 마을에 서 있으면** 그 마을 사건의 지연은 0 이다
  //   (`delayBetween(v, v) === 0`). 즉 자기 눈으로 본 것은 즉시다 — 규칙을 따로 두지 않았고,
  //   술어 하나에서 저절로 나온다. "예전에 다른 마을에서 본 것"까지 기억하는 **플레이어별 목격
  //   기록은 회부**다(이번엔 현재 위치 마을 기준만).
  function delayTo(fromVid, toVid) {
    if (fromVid === toVid) return 0;
    if (!RUMOR) return Infinity;                      // 지형이 없는 랩 — 자기 마을 것만 보인다
    return RUMOR.delayBetween(fromVid, toVid);
  }
  // 사건 e 가 마을 vid 에 **닿는 날**. 못 닿으면 Infinity.
  function heardDayOf(ev, vid) {
    const d = delayTo(ev.vid, vid);
    return isFinite(d) ? (ev.day + d) : Infinity;
  }
  function visibleTo(vid, ev, today) {
    return (today == null ? _lastDay : today) >= heardDayOf(ev, vid);
  }
  // 마을 vid 가 오늘까지 들은 사건 — 최신(=들은 날) · 심각 순.
  //   opts.n        몇 건까지(기본 BRIEF_N)
  //   opts.today    기준일(기본 = 장부가 아는 오늘)
  //   opts.sinceDay 이 날 **뒤에** 도달한 것만(복귀 브리핑) — 없으면 전부
  //   반환: [{ ev, heard }] — `heard` 는 **이 마을이 들은 날**이지 사건이 난 날이 아니다.
  function visibleEvents(vid, opts) {
    const o = opts || {};
    const today = (o.today == null) ? _lastDay : (o.today | 0);
    const k = Math.max(1, (o.n | 0) || cfg.BRIEF_N);
    const since = (o.sinceDay == null) ? null : (o.sinceDay | 0);
    // ★행 하나만 데운다 — 거리행렬이 무향이라 "V 에서 남까지"가 곧 "남에서 V 까지"다.
    //   이게 없으면 조회 한 번에 마을 수만큼 그래프를 걷는다(test-events ㉒ 가 그걸 잰다).
    if (RUMOR) RUMOR.rowOf(vid);
    const out = [];
    for (const s of byVid.values()) {
      const dly = delayTo(s.vid, vid);
      if (!isFinite(dly)) continue;
      const ring = s.ring;
      for (let i = ring.length - 1; i >= 0; i--) {
        const ev = ring[i];
        const heard = ev.day + dly;
        if (heard > today) continue;                  // 아직 안 왔다 — 없는 것과 같다
        if (since != null && heard <= since) break;   // 링은 day 오름차순 → 더 볼 것이 없다
        out.push({ ev, heard });
      }
    }
    out.sort((a, b) => (b.heard - a.heard) || heavier(a.ev, b.ev));
    return { total: out.length, rows: out.slice(0, k) };
  }
  // ── ★★[T18 2026-09-01] 연대기 — 마을 연표 ──────────────────────────────────
  //   설계: 사건 장부는 **지금**을 보여 주지만 세계에는 역사가 쌓인다.
  //   연표는 **플레이어가 들은 순서**로 읽는다 — 사건이 난 날이 아니라 **이 마을에 도달한 날**로
  //   묶는다(T7 도달표). 그래야 "우리 마을이 겪은 일"이 되고, 먼 마을 소식은 늦게 적힌다.
  //
  // ★★캐시가 **지난 해에는 영원히 맞는** 이유(이게 이 층의 성능 전부다):
  //   새로 도달하는 사건의 도달일은 **언제나 오늘**이다(`heard = day + delay` 이고 오늘 도달했으니).
  //   ⇒ 새 사건은 **올해 칸에만** 들어간다. 지난 해 칸은 한 번 지으면 다시 바뀌지 않는다.
  //   그래서 캐시 무효는 ①올해(오늘이 바뀌면) ②도달표 세대(마을이 늘면) 둘뿐이다.
  //   ⚠이 논증이 참이려면 **도달 지연이 음수가 아니어야** 한다 — `travelDaysOf` 가 보장한다.
  const chronCache = new Map();   // `${vid}|${year}` → { rows, day, gen }
  const chronGen = () => (RUMOR ? RUMOR.stats.gen : 0);

  // 연표 한 해 — 계절별로 묶어 문장으로. 반환은 화면이 그대로 그릴 모양이다(클라 재계산 0).
  function chronicle(vid, opts) {
    const o = opts || {};
    const today = (o.today == null) ? _lastDay : (o.today | 0);
    const cal = calendarOf(today);
    const year = (o.year == null) ? cal.year : (o.year | 0);
    const key = vid + '|' + year;
    const hit = chronCache.get(key);
    // 지난 해는 날짜와 무관하게 유효하다(위 논증). 올해만 오늘이 바뀌면 다시 짓는다.
    if (hit && hit.gen === chronGen() && (year < cal.year || hit.day === today)) {
      stats.chronHit++;
      return { vid, year, yearDays: cal.yearDays, today, seasons: hit.rows, cached: true };
    }
    const t0 = process.hrtime.bigint();
    const yd = cal.yearDays;
    const yStart = year * yd, yEnd = yStart + yd - 1;
    // 계절 칸을 미리 만든다 — 빈 계절도 자리를 지킨다(연표에 구멍이 있으면 그것도 정보다).
    const buckets = new Map();
    const rows = [];
    for (let d = yStart; d <= Math.min(yEnd, today); ) {
      const c = calendarOf(d);
      const b = { season: c.season, seasonKo: c.seasonKo, start: d, days: c.seasonDays, items: [] };
      buckets.set(c.season + '@' + c.year, b); rows.push(b);
      d += c.seasonDays - (c.dayOfSeason - 1);
    }
    if (rows.length) {
      if (RUMOR) RUMOR.rowOf(vid);            // 행 하나만 데운다(조회 중 그래프 걷기 0회)
      for (const src of byVid.values()) {
        const dly = delayTo(src.vid, vid);
        if (!isFinite(dly)) continue;
        const arr = src.chron;
        for (let i = 0; i < arr.length; i++) {
          const ev = arr[i];
          const heard = ev.day + dly;
          if (heard < yStart) continue;
          if (heard > yEnd) break;            // chron 은 day 오름차순 ⇒ 이후는 전부 범위 밖
          if (heard > today) break;           // 아직 안 들었다 — 없는 것과 같다
          const c = calendarOf(heard);
          const b = buckets.get(c.season + '@' + c.year);
          if (!b) continue;
          const foreign = (ev.vid !== vid);
          const sv = sev(ev);
          // ★이웃 소식은 더 큰 일이어야 여기까지 온다. **일 유형은 sev 가 아니라 목록으로 가른다** —
          //   날씨(573건 · 국지적 · 일주일)와 완공·첫 물건은 남의 마을 것까지 회자되지 않는다.
          if (foreign && (isDeed(ev) ? DEED_FOREIGN.indexOf(ev.type) < 0 : sv < cfg.CHRON_FOREIGN_SEV)) continue;
          b.items.push({ line: briefLine(ev), type: ev.type, item: ev.item, day: ev.day, heard,
            from: foreign ? ev.vid : null, sev: +sv.toFixed(3), deed: isDeed(ev) });
        }
      }
      for (const b of rows) {
        // ★★**우리 마을 일과 이웃 소식은 따로 센다.** 한 그릇에 담아 심각도로만 자르면
        //   연표가 "이 세계에서 가장 극단적이었던 값 여섯 개"가 된다 — 그건 마을의 역사가 아니다.
        //   마을 연표는 **여기서 일어난 일**이 본문이고, 이웃 소식은 몇 줄의 여백이다.
        const mine = [], abroad = [];
        for (const it of b.items) (it.from == null ? mine : abroad).push(it);
        b.mine = mine.length; b.abroad = abroad.length;
        b.total = b.items.length;
        // ★[T50] 자르는 기준이 sev 하나였다 — 그래서 연표가 "값이 크게 움직인 해"로만 읽혔다.
        //   이제 **일이 먼저 자리를 잡고**, 남은 칸을 값이 심각도 순으로 채운다(같은 비교자 `heavier`).
        const byWeight = (x, y) => ((y.deed ? 1 : 0) - (x.deed ? 1 : 0)) || (y.sev - x.sev) || (x.heard - y.heard);
        mine.sort(byWeight); abroad.sort(byWeight);
        const keepMine = cfg.CHRON_PER_SEASON > 0 ? mine.slice(0, cfg.CHRON_PER_SEASON) : mine;
        const keepAbroad = cfg.CHRON_FOREIGN > 0 ? abroad.slice(0, cfg.CHRON_FOREIGN) : abroad;
        b.items = keepMine.concat(keepAbroad);
        // ★★"그 밖에 n건"은 **우리 마을 몫만** 센다. 이웃 후보는 51마을이 한꺼번에 쏟아져
        //   계절당 수백 건이 되는데(실측 98.7% 가 잘린다), 그걸 "그 밖에 490건"이라고 적으면
        //   연표가 거짓말을 한다 — 마을은 그 490건을 **기록한 적이 없다.** 스쳐 들었을 뿐이다.
        //   ⇒ 화면이 쓰는 수(`more`)는 우리 마을 것, 계측용 수(`abroadMore`)는 따로 낸다.
        b.more = mine.length - keepMine.length;
        b.abroadMore = abroad.length - keepAbroad.length;
        // ★남긴 것을 **다시 시간순으로** 놓는다(연표를 읽는 순서는 심각도가 아니라 시간이다).
        b.items.sort((x, y) => (x.heard - y.heard) || (y.sev - x.sev));
      }
    }
    chronCache.set(key, { rows, day: today, gen: chronGen() });
    stats.chronBuilt++;
    stats.chronMs += Number(process.hrtime.bigint() - t0) / 1e6;
    return { vid, year, yearDays: yd, today, seasons: rows, cached: false };
  }
  // 이 마을 연표에 해가 몇 개 있는가 — 화면의 연도 목록(접힘/펼침)이 쓴다.
  function chronicleYears(vid, opts) {
    const o = opts || {};
    const today = (o.today == null) ? _lastDay : (o.today | 0);
    const cur = calendarOf(today).year;
    let first = cur;
    if (RUMOR) RUMOR.rowOf(vid);
    for (const src of byVid.values()) {
      const dly = delayTo(src.vid, vid);
      if (!isFinite(dly) || !src.chron.length) continue;
      const h = src.chron[0].day + dly;
      if (h > today) continue;
      const y = calendarOf(h).year;
      if (y < first) first = y;
    }
    const out = [];
    for (let y = cur; y >= first; y--) out.push(y);
    return out;
  }
  // ★영속 복구 — 잘린 사건까지 되살린다(연표는 90일 너머를 읽는다).
  //   ⚠`day` 오름차순으로 넣어야 위 조회의 조기 종료가 성립한다.
  function loadChronicle(rows) {
    let n = 0;
    for (const r of (rows || []).slice().sort((a, b) => a.day - b.day)) {
      const s = st(r.vid);
      s.chron.push({ day: r.day | 0, vid: r.vid, type: r.type, item: r.item == null ? null : r.item, mag: +r.mag || 1, meta: null });
      n++;
    }
    chronCache.clear();
    return n;
  }
  function chronOf(vid) { const s = byVid.get(vid); return s ? s.chron.slice() : []; }

  // ── 읽기 ───────────────────────────────────────────────────────────────────
  // ★T7 이후 `recent` 는 **가시성 술어의 얇은 껍데기**다(사본 금지). 날짜를 안 받는 이유는
  //   장부가 오늘을 알기 때문이다(`_lastDay`) — 호출부마다 시계를 들고 다니면 그게 사본이다.
  function recent(vid, n) {
    return visibleEvents(vid, { n }).rows.map((r) => r.ev);
  }
  // ★★복귀 브리핑 — "자리 비운 사이 이 마을에 **도달한**" 사건만.
  //   부재가 RETURN_MIN_DAYS 미만이면 `returned:false` 로 답하고 호출부는 평소 브리핑을 쓴다.
  function returnBrief(vid, sinceDay, opts) {
    const o = opts || {};
    const today = (o.today == null) ? _lastDay : (o.today | 0);
    if (sinceDay == null || !isFinite(sinceDay)) return { returned: false, absent: 0 };
    const absent = today - (sinceDay | 0);
    if (!(absent >= cfg.RETURN_MIN_DAYS)) return { returned: false, absent };
    const k = Math.max(1, (o.n | 0) || cfg.RETURN_N);
    const v = visibleEvents(vid, { n: k, today, sinceDay: sinceDay | 0 });
    return { returned: true, absent, total: v.total, rows: v.rows,
             lines: v.rows.map((r) => briefLine(r.ev)).filter(Boolean),
             more: Math.max(0, v.total - v.rows.length) };
  }
  function board(vid) {
    const s = byVid.get(vid);
    if (!s) return [];
    return [...s.reqs.values()].map((r) => ({ ...r, remain: r.qty - r.filled }));
  }
  function ringOf(vid) { const s = byVid.get(vid); return s ? s.ring.slice() : []; }
  function detOf(vid, item) { const s = byVid.get(vid); return s ? (s.det.get(item) || null) : null; }
  // ★영속 복구 — DB 에서 읽어 온 과거 사건을 링버퍼에 되돌린다(래치는 prime 이 따로 심는다)
  function loadRing(vid, evs) {
    const s = st(vid);
    s.ring = (evs || []).slice().sort((a, b) => a.day - b.day);
    return s.ring.length;
  }
  // ★의뢰 복구 — 저장된 납품 진척(filled)을 되돌린다.
  //   이게 없으면 재기동이 곧 의뢰 초기화가 되어 **낸 사람만 손해**다(물건은 이미 곳간에 갔다).
  //   ⚠ prime() **뒤에** 불러야 한다: 지금 부족이 아닌 품목의 의뢰는 어차피 다음 경계에 철회된다.
  function loadRequest(vid, req) {
    if (!req || !req.item) return false;
    const s = st(vid);
    const q = +req.qty || 0, f = Math.max(0, Math.min(q, +req.filled || 0));
    if (!(q > 0) || f >= q) return false;
    s.reqs.set(req.item, { vid, item: req.item, qty: q, filled: f, rewItem: req.rewItem, rewQty: +req.rewQty || 0, day: req.day | 0 });
    return true;
  }

  return {
    cfg, stats, TYPES,
    prime, scanDay, recent, board, claim, unclaim, ringOf, detOf, loadRing, loadRequest,
    // ★[T7] 소문 물리 전파 — 가시성 술어와 그 부속. 사본 금지: 사건을 보는 문은 이것뿐이다.
    visibleEvents, visibleTo, heardDayOf, delayTo, returnBrief,
    // ★[T18] 연대기 — 같은 도달표 위에 선다(사본 0).
    chronicle, chronicleYears, loadChronicle, chronOf, isChronicle,
    // ★[T50] 사건의 무게 — 하네스·계측기가 **같은 판정**을 쓰라고 내준다(사본 금지).
    isDeed, heavier, sevOf: sev,
    get chronTypes() { return CHRON_TYPES.slice(); },
    get deedTypes() { return DEED_TYPES.slice(); },
    get deedForeign() { return DEED_FOREIGN.slice(); },
    get today() { return _lastDay; },
    rumorInvalidate: () => { if (RUMOR) RUMOR.invalidate(); },
    get rumorStats() { return RUMOR ? RUMOR.stats : null; },
    get hasRumor() { return !!RUMOR; },
    get vids() { return [...byVid.keys()]; },
    deliverable: DEL,
  };
}

// ── 전달 층 — 사건 → 촌장의 말 ────────────────────────────────────────────────
// ★대시보드 톤 금지(설계 §3.2). 수치를 읊지 않는다 — 사람이 하는 말이다.
// 조사 — 받침 유무로 고른다. 한글 음절 블록 (가~힣) 의 코드로 종성을 뽑는다:
//   (code − 0xAC00) % 28 === 0 이면 받침 없음. 한글이 아닌 이름(폴백 id)은 받침 없음으로 친다.
function josa(word, withBatchim, withoutBatchim) {
  const ch = String(word || '').slice(-1);
  const c = ch.charCodeAt(0);
  const hangul = c >= 0xac00 && c <= 0xd7a3;
  const has = hangul && ((c - 0xac00) % 28 !== 0);
  return has ? withBatchim : withoutBatchim;
}
const LINES = {
  STOCK_SHORTAGE: (ev) => { const n = koRes(ev.item); return `요즘 ${n}${josa(n, '이', '가')} 달리는군.`; },
  STOCK_GLUT: (ev) => { const n = koRes(ev.item); return `${n}${josa(n, '은', '는')} 곳간에 쌓여 썩을 지경이야.`; },
  PRICE_SPIKE: (ev) => `${koRes(ev.item)} 값이 부쩍 올랐어.`,
  PRICE_DROP: (ev) => `${koRes(ev.item)} 값이 영 시원찮네.`,
  CARAVAN_LATE: (ev) => `행상이 여태 안 오는군. 고갯길에 무슨 일이 있나.`,
  SEASON_CHANGE: (ev) => {
    const s = ev.meta && ev.meta.season;
    // ★[T20] 가을이면 **올겨울 목표를 함께 말한다**(새 사건 종류 0 — 설계안 §2.3).
    //   ⚠`SEASON_CHANGE` 는 연표에 안 실린다(`CHRON_TYPES` 밖) ⇒ meta 에 기대도 ㉝ 계약을 안 깬다.
    //     그래서 **공표는 브리핑·게시판의 일**이고, 연표에 남는 것은 판정(`WINTER_KEPT`)이다.
    const w = ev.meta && ev.meta.winter;
    if (s === 'autumn' && w && w.target > 0) {
      const n = koRes(w.res);
      return `가을일세. 올겨울 ${n}${josa(n, '을', '를')} ${w.target}만큼 모아 두려 하네 — 손을 보태 주게.`;
    }
    return s === 'spring' ? '봄일세. 밭에 나갈 때야.'
      : s === 'summer' ? '여름이군. 물가를 조심하게.'
        : s === 'autumn' ? '가을일세. 거둘 것이 많아.'
          : '겨울이 왔네. 땔감은 넉넉한가.';
  },
  // ── ★[T50 2026-09-02] 세계의 "일" ──────────────────────────────────────────
  //   ⚠수치를 읊지 않는다(§3.2 대시보드 톤 금지). "비옥도 0.7배"가 아니라 "소출이 시원찮다"다.
  HARVEST_BOON: () => '올해는 땅이 넉넉하이. 거둘 것이 많아.',
  HARVEST_BLIGHT: () => '올해는 소출이 영 시원찮아. 겨울이 걱정일세.',
  // 종류는 **econ 이 붙인 이름**(`_weather.name`)에서 온다 — 여기서 날씨를 다시 정의하지 않는다.
  //   ⚠econ 이 새 날씨를 더하면 아래 폴백이 받는다(빈 문장이 나가지 않는다). 계약 검사는 test-events ㉜.
  WEATHER: (ev) => {
    const k = String(ev.item || '');
    if (k.indexOf('가뭄') >= 0) return '비가 통 안 오는군. 밭이 마르네.';
    if (k.indexOf('폭풍') >= 0) return '바람이 사납네. 지붕을 단단히 매게.';
    if (k.indexOf('풍요') >= 0) return '요즘은 들에 나가면 손이 바쁘이.';
    if (k.indexOf('안개') >= 0) return '안개가 짙어. 사냥 나가긴 어렵겠군.';
    return '날씨가 심상찮네.';
  },
  POP_COLLAPSE: () => '사람이 자꾸 줄어. 이러다 마을이 비겠어.',
  CARAVAN_RAIDED: () => '행상이 길에서 털렸다는군. 한동안 길이 사납겠어.',
  TRADER_KILLED: () => '고갯길에서 행상이 변을 당했네. 끝내 돌아오지 못했어.',
  BUILT: (ev) => ((ev.item === 'granary') ? '곳간을 한 채 더 올렸네.' : '새 움집이 하나 섰네.'),
  FIRST_GOODS: (ev) => { const n = koRes(ev.item); return `${n}${josa(n, '이', '가')} 이 마을에 처음 들어왔어.`; },
  // ── ★[T20 2026-09-02] 겨울나기 판정 ─────────────────────────────────────────
  //   ⚠`vid·day·type·item·mag` 만으로 만든다(㉝ 계약) — 기여자 이름·수량은 `meta` 라 여기 못 쓴다.
  WINTER_KEPT: (ev) => { const n = koRes(ev.item); return `올겨울은 넉넉하이. ${n} 곳간이 든든하네 — 자네들 덕일세.`; },
  WINTER_SHORT: (ev) => { const n = koRes(ev.item); return `올겨울 ${n}${josa(n, '은', '는')} 좀 궁하겠어. 그래도 손을 보탠 이가 있었네.`; },
};
function briefLine(ev) {
  const f = LINES[ev.type];
  return f ? f(ev) : '';
}
// 게시판 한 줄 — "무엇을 얼마 가져오면 무엇으로 갚는다"
function boardLine(req) {
  const remain = (req.remain != null ? req.remain : (req.qty - req.filled));
  return `${koRes(req.item)} ${remain} → ${koRes(req.rewItem)} ${req.rewQty}`;
}

// ── 납품 정산 ─────────────────────────────────────────────────────────────────
// ★한 구현만 둔다. 서버(zone.js→villages.js)도 하네스도 **이 함수**를 부른다 —
//   두 군데 적으면 그게 사본이고, 이 프로젝트는 그걸로 여러 번 데였다.
//   실물 이동은 스스로 하지 않고 **정본 함수를 주입받아** 부른다:
//     deposit = villages.playerVillageDeposit(vil, inventory, want)  ← 플레이어 아이템→econ 재화 대응·곳간 가산의 정본
//   순서가 계약이다: ①몫 확정(원자적) → ②실물 이동 → ③실패면 몫 되돌림 → ④보상 지급.
function deliverToVillage(a) {
  const { ledger, vil, vid, inventory, item, deposit } = a;
  const v = vil && vil.econ;
  if (!v) return { ok: false, err: '마을을 찾지 못했다' };
  const D = ledger.deliverable;
  const playerItems = (D.items.get(item) || []);
  if (!playerItems.length) return { ok: false, err: '곳간이 받는 물건이 아니다' };

  // 이 의뢰에 낼 수 있는 내 물건을 센다(여러 아이템이 한 재화로 갈 수 있다 — 익힌 음식 등)
  let have = 0;
  for (const it of playerItems) have += Math.floor(Number(inventory[it]) || 0);
  const want = (a.want != null) ? Math.floor(Number(a.want) || 0) : have;
  if (!(want > 0)) return { ok: false, err: '낼 물건이 없다' };
  if (want > have) return { ok: false, err: '그만큼 갖고 있지 않다' };

  // ① 몫 확정 — 여기서 초과분이 거절된다(동시 납품 경쟁의 유일한 관문)
  const c = ledger.claim(vid, item, want);
  if (!c.ok) return c;

  // ①b ★**갚을 수 있는지 먼저 본다.** 물건을 받아 놓고 못 갚으면 그게 사기다.
  //   (게시 시점엔 갚을 수 있었어도 그 사이 마을 재고가 줄 수 있다 — 하루 경계 재검증과 이 줄이 짝이다.)
  const _rewRes = c.rewItem, _rewItem0 = D.toEcon.get(_rewRes);
  if (c.rew > 0) {
    const have = Math.floor(+((v.storage || {})[_rewRes] || 0));
    if (!_rewItem0 || have < c.rew) {
      ledger.unclaim(vid, item, c.take);
      ledger.stats.reqRefused++;
      return { ok: false, err: '마을이 지금 갚을 것이 없다 — 촌장이 면목없어 한다' };
    }
  }
  // ② 실물 이동 — 정본 함수. 내가 가진 아이템에서 c.take 개만큼 골라 낸다.
  const give = {};
  let left = c.take;
  for (const it of playerItems) {
    if (left <= 0) break;
    const q = Math.min(left, Math.floor(Number(inventory[it]) || 0));
    if (q > 0) { give[it] = q; left -= q; }
  }
  // ★[무게 배치 2026-08-27] 개체 무게 환산을 **게시판 납품에도** 그대로 태운다 —
  //   같은 물고기가 거래소에선 2.2단위, 게시판에선 1단위면 그게 보이지 않는 손이다.
  const dep = deposit(vil, inventory, give, a.unitsOf);
  if (!dep || !dep.ok) { ledger.unclaim(vid, item, c.take); return { ok: false, err: (dep && dep.err) || '곳간이 받지 않았다' }; }

  // ③ 보상 — 마을 잉여를 실제로 덜어 준다(물물. `_cash` 는 쓰지 않는다 — 재민 세금 캐논).
  //   ★**전액 아니면 0**. 위 ①b 가 이미 보장하므로 여기서 깎이는 일은 없다.
  const rewRes = _rewRes, rewPlayerItem = _rewItem0;
  let rewPaid = 0;
  if (rewPlayerItem && c.rew > 0) {
    rewPaid = c.rew;
    v.storage[rewRes] = +(((v.storage[rewRes] || 0) - rewPaid)).toFixed(3);
    inventory[rewPlayerItem] = (inventory[rewPlayerItem] || 0) + rewPaid;
  }
  return { ok: true, take: c.take, refused: c.refused, taken: dep.taken, moved: dep.moved,
    rew: rewPaid, rewRes, rewItem: rewPlayerItem, done: c.done, req: c.req };
}

module.exports = { createLedger, CFG, TYPES, DEED_TYPES, DEED_FOREIGN, briefLine, boardLine, koRes, josa, seasonOf, KO_SEASON,
  yearDaysOf, seasonStartOf, calendarOf,
  buildDeliverable, deliverToVillage, pricesOf, pricesFresh, payableQty };
