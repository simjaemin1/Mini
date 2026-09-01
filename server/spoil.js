// === server/spoil.js — 부패 곡선 + 보존 가공 정본 [재민 확정 2026-08-31] =========
//
// 재민 확정(병행 트랙 4): ① 식품 로트의 **부패 곡선**(취득일에서 유도 — 냉장고 없는 청동기)
//   ② 보존 가공 3종(말리기·훈제·절임) ③ 상한 음식의 결과.
//
// ★★`server/lots.js` 가 파 둔 자리에 앉는 층이다. 그 파일 머리 주석이 이 배치를 예고했다:
//   *"취득일이 남으니, 곡선은 나중에 **조회 함수 하나**로 얹힌다."* — 그 함수가 `freshnessOf` 다.
//   로트 레코드(`{d, n}`)는 **한 글자도 안 바뀐다**. 저장 형식도 그대로다.
//
// ★★**틱 비용 0 — lazy.** 광맥 번영도(`mined_cells`)·어장 재생(`fishing.js`)·채집 군락
//   (`forage.js`)이 이미 세 번 쓴 문법을 **네 번째로** 쓴다. 여기엔 setInterval 이 없다:
//   신선도는 **조회할 때** `오늘 − 취득일` 로 한 번에 계산한다. 오프라인 며칠이어도 오차 0.
//
// ★★**주사위 금지**(일관성 원칙 · `durango-consistency-principle`).
//   부패는 **시간의 함수지 확률이 아니다.** 같은 나이의 같은 품목은 **언제나 같은 신선도**다.
//   식중독 확률 굴리기는 재민이 명시적으로 금지했다 — 상한 걸 먹으면 **확정적으로** 탈이 난다.
//   (`Body.onDamage` 가 "피해량 문턱"으로 부상을 내는 것과 같은 결. 문턱이지 주사위가 아니다.)
//
// ── 곡선의 모양: **속은 연속, 겉은 계단** (§7 신체 상태와 같은 규약) ──────────
//   ★모양은 **새로 발명하지 않았다** — `zone.dishFreshness`(요리 신선도)가 쓰는
//     `1 − age/window` 클램프와 **같은 꼴**이다. 이 레포에서 신선도를 표현한 유일한 선례고,
//     여기가 그 문법의 두 번째 사용처다(요리 = 실시간 창 · 로트 = 게임일 창).
//   ⇒ 값은 연속(절벽 없음), 단조 감소, [0,1] 유계. 단계는 **표시에서만** 계단이 된다.
//   ★단계에 히스테리시스를 안 건다(Body.STAGE_HYST 와 다른 점): 신선도는 **단조 감소**라
//     경계에서 떨릴 수가 없다. 되돌아오지 않는 값에 히스테리시스는 죽은 코드다.
//
// ── ⚠econ 과의 관계: **개념 정합, 코드 무접촉** ─────────────────────────────
//   econ 의 `tickDecay`(`sim/economy-sim-v2.js`)도 **결정론**이고 품목별 일일률(`DECAY_V2`)을
//   쓴다 — 거기까지는 같은 세계관이다. 이 파일은 econ 을 **한 줄도 안 건드린다**(플레이어 층 전용).
//
//   ★★그런데 **순서가 뒤집혀 있다**(실측): econ 은 생선·고기 0.0005 < 조리식 0.001 <
//     채소·과일 0.0015 로 **생선이 가장 느리게** 상한다. 플레이어 층은 정반대다(생선이 제일 빠름).
//     모순이 아니라 **층이 다르다** — 그리고 그 차이가 이 배치의 존재 이유다:
//       · econ 의 `v.storage.fish` 는 **곳간에 쟁인 생선**이다. 청동기 마을이 곳간에 생선을
//         쟁였다면 그건 이미 **말리거나 절인 생선**이다(그래서 연 단위로 버틴다).
//       · 플레이어의 로트는 **방금 잡아 손에 든 생선**이다. 그래서 이틀이면 상한다.
//     ⇒ 보존 가공이 **두 층을 잇는 다리**다. 플레이어가 말리는 순간 그 생선은 곳간의 문법으로
//       넘어간다(`DRIED.fish` 의 보관일이 econ 쪽 스케일에 가깝게 잡힌 이유다).
//   ★그리고 econ 에는 **"저장이 부패를 늦춘다"가 이미 있다** — 옹기(`POTTERY_DECAY_SAVE` −30%,
//     진흙으로 장독을 빚는다). 회부에 걸린 "저장 시설(움·곳간 서늘함) = 부패 감속"은 지어낼 게
//     아니라 **그 상수에서 유도하면 된다**. 다음 층의 근거를 여기 적어 둔다.
//
// ⚠**온도 결합은 이번이 아니다**(회부). 더운 날 빨리 상하는 건 `weather.temperatureAt` 를
//   읽어 배율 한 줄이면 붙는다 — 추위 2차 트랙이 쓰는 그 정본과 **같은 함수**를 써야 한다.
//   지금 두 벌로 만들면 그게 사본이다. `회부_부패_다음층.md` A 항.
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
// ★게임일 정수화 — **`| 0` 금지**(int32 로 감긴다 · `server/lots.js` 머리의 잠복 결함 주석 참조).
const _day = (x) => { const v = Math.floor(Number(x)); return Number.isFinite(v) ? v : 0; };

// ── 보관일(게임일) — 신선도가 1 → 0 에 닿는 데 걸리는 날수 ──────────────────
//   ★재민이 준 시작점을 그대로 옮겼다(지시서 §2). 전부 env 손잡이다 —
//     **실기 대기 항목**이라 이 배치에서 값을 튜닝하지 않는다(절대 규칙: 게임 손잡이 튜닝 금지).
//   ★게임일 24분 기준 실시간 환산은 `SHELF_TABLE` 이 보고용으로 낸다.
const D = {
  // 생선·생고기 = 2~3일 (실시간 1시간 급 — "빨리 처리하라"는 압박이 이 배치의 심장이다)
  RAW_FLESH: _num('SPOIL_D_RAW_FLESH', 2.5),
  // 조리식 = 3~4일
  COOKED: _num('SPOIL_D_COOKED', 3.5),
  // 채집 과실·채소 = 5~7일
  PRODUCE: _num('SPOIL_D_PRODUCE', 6),
  // 유제품·알 — LOT_CORE 에 있으니 값이 있어야 한다(없으면 조용히 기본값으로 떨어진다)
  MILK: _num('SPOIL_D_MILK', 2),
  EGG: _num('SPOIL_D_EGG', 12),
  CHEESE: _num('SPOIL_D_CHEESE', 30),
  BREAD: _num('SPOIL_D_BREAD', 5),
  // 말린 약재 — econ `DECAY_V2.herb = 0.0008` 주석이 "말린 약재 — 느린 변질"이라 적었다. 그 결.
  HERB: _num('SPOIL_D_HERB', 30),
  // 보존식 = 수십 일
  PRESERVED: _num('SPOIL_D_PRESERVED', 45),
  // 건조 곡물 = 수개월 — ★그래서 곡물이 화폐 노릇을 한다(거래소 numeraire = food 와 정합).
  GRAIN: _num('SPOIL_D_GRAIN', 180),
  // 표에 없는 로트 품목(specialty marine/livestock/agri)의 기본값
  DEFAULT: _num('SPOIL_D_DEFAULT', 5),
};

// 품목 → 보관일. **이 표가 정본이다** — 다른 파일에 날수를 옮겨 적지 마라.
const SHELF_DAYS = {
  fish: D.RAW_FLESH, meat_raw: D.RAW_FLESH, meat: D.RAW_FLESH,
  fish_cooked: D.COOKED, meat_cooked: D.COOKED, food_cooked: D.COOKED,
  cooked_food: D.COOKED, berry_jam: D.COOKED, bread: D.BREAD,
  berry: D.PRODUCE, fruit: D.PRODUCE, vegetable: D.PRODUCE, mushroom: D.PRODUCE,
  milk: D.MILK, egg: D.EGG, cheese: D.CHEESE, herb: D.HERB,
  food: D.GRAIN,
};

// ── 보존식 — 이 배치가 새로 만드는 품목 4종 ─────────────────────────────────
//   ★`PRESERVED_ITEMS` 하나가 정본이다. 로트 대상·무게·식품 효과·거래 가능 여부가 전부
//     이 목록에서 파생된다(목록을 두 벌로 적으면 그날 한쪽만 고쳐진다).
const PRESERVED_ITEMS = {
  dried_fish:   { ko: '건어물',     shelf: D.PRESERVED },
  dried_fruit:  { ko: '말린 과실',  shelf: D.PRESERVED },
  smoked_meat:  { ko: '훈제육',     shelf: _num('SPOIL_D_SMOKED', 40) },
  pickled_veg:  { ko: '절임',       shelf: _num('SPOIL_D_PICKLED', 50) },
};
for (const [k, v] of Object.entries(PRESERVED_ITEMS)) SHELF_DAYS[k] = v.shelf;

// ── ★★[작물 층 2026-08-31] 작물·씨앗의 보관일은 **카탈로그 저장성 축에서 온다** ──────
//   재민 질문: *"작물별로 부패 속도가 다 다를 텐데 — 지금 맞나?"* → 그때는 **아니었다**.
//   위 표는 품목군 5버킷이고, 34종 작물이 전부 같은 버킷에 들어 있었다(채소 = 전부 6일).
//   ★재민의 `한국작물_카탈로그.xlsx` 에 **저장성(1~5)** 축이 이미 있었다 —
//     `server/crops.js` 가 그 축을 보관일로 옮긴다. 여기서는 **읽어서 덮기만** 한다(두 벌 금지).
//   ★★그리고 놀랍게도 **위 5버킷이 그 축 위에 정확히 있었다**: 채소 6일 = 저장성 2 ·
//     곡물 180일 = 저장성 5 · 보존식 45일 = 저장성 4. 버킷이 틀린 게 아니라 **거칠었던 것**이고,
//     축으로 바꾸니 상추 3일 / 배추 6 / 무 14 / 기장 45 / 쌀 180 으로 저절로 갈렸다.
let Crops = null;
try { Crops = require('./crops'); } catch (e) { Crops = null; }
if (Crops) { for (const [k, d] of Object.entries(Crops.shelfMap())) SHELF_DAYS[k] = d; }

function shelfOf(item) {
  const s = SHELF_DAYS[item];
  return Number.isFinite(s) && s > 0 ? s : D.DEFAULT;
}
function isPreserved(item) { return Object.prototype.hasOwnProperty.call(PRESERVED_ITEMS, item); }

// ── ★신선도 — 이 배치의 조회 함수 하나 ──────────────────────────────────────
//   f(나이일, 품목) → [0,1]. 연속·단조감소·결정론. 확률 없음.
//   ★`ageDays` 는 실수를 받는다(테스트가 0.5일을 물어볼 수 있게) — 게임에선 정수 일이다.
function freshnessOf(item, ageDays) {
  const L = shelfOf(item);
  const a = Number(ageDays);
  if (!Number.isFinite(a) || a <= 0) return 1;
  const f = 1 - a / L;
  return f <= 0 ? 0 : (f >= 1 ? 1 : +f.toFixed(6));
}

// ── 표시 3단계 (겉은 계단) ───────────────────────────────────────────────────
//   신선(f ≥ FRESH_AT) · 시듦(0 < f < FRESH_AT) · 상함(f ≤ 0)
//   ★"상함"은 **f 가 정확히 0 인 자리**다(보관일에 닿는 날). 별도 문턱 상수를 두지 않는다 —
//     두면 "보관일"과 "상하는 날"이 갈려서 두 개의 진실이 생긴다.
const FRESH_AT = _num('SPOIL_FRESH_AT', 0.6);
const STAGE_KO = { fresh: '신선', wilt: '시듦', spoiled: '상함' };
const STAGE_EMO = { fresh: '🟢', wilt: '🟡', spoiled: '🔴' };
function stageOf(f) { return f <= 0 ? 'spoiled' : (f >= FRESH_AT ? 'fresh' : 'wilt'); }
function stageOfAge(item, ageDays) { return stageOf(freshnessOf(item, ageDays)); }
function isSpoiled(item, ageDays) { return freshnessOf(item, ageDays) <= 0; }

// ── 영양·가치 — 신선도에 **비례**(연속) ──────────────────────────────────────
//   ★상함(f=0)이면 회복 0 이다. 곱하기 하나로 그게 저절로 성립한다(별도 분기 없음).
function nutritionMult(f) { const x = Number(f); return Number.isFinite(x) && x > 0 ? x : 0; }

// ── ★상한 걸 먹으면: 확정 탈 ────────────────────────────────────────────────
//   재민 확정: *"식중독 확률 굴리기 금지 — 상한 걸 먹으면 확정적으로 탈이 난다(일관성)."*
//   ★**새 축을 만들지 않는다** — 신체 §7 의 **부상(injury)** 축 하나를 재사용한다.
//     부상 축은 이미 이속·작업 배율 곡선을 갖고 있고(`Body.CURVES.injury`), 바닥(0.72)이
//     걸려 있어 죽음의 나선이 안 난다. HP 는 **안 건드린다**(아사 폐지 캐논과 같은 결).
//   ★얼마나: 한 단위(1개)를 먹으면 `SPOIL_INJURY`. 부분 섭취는 **비례**한다(0.25단위 = ¼).
const SPOIL_INJURY = _num('SPOIL_INJURY', 0.30);
function illnessFor(portion) {
  const p = Number(portion);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return +Math.min(1, SPOIL_INJURY * p).toFixed(6);
}

// ── 로트 묶음의 신선도 ───────────────────────────────────────────────────────
//   `Lots.consume` 이 돌려주는 `ages:[{d,n}]` 를 그대로 받는다(사본 금지 — 로트를 다시 안 뒤진다).
//   ★가중평균과 "상한 몫"을 **따로** 낸다: 신선한 것과 상한 것을 같이 먹었다면
//     회복은 신선한 몫에서만 나오고, 탈은 상한 몫에서 난다. 평균 하나로 뭉개면 둘 다 거짓말이다.
function ofAges(item, ages, today) {
  let n = 0, wf = 0, bad = 0;
  for (const a of (ages || [])) {
    const q = Number(a.n) || 0;
    if (q <= 0) continue;
    // ★[부패 2차 2026-09-01] 나이가 아니라 **노출**로 잰다. 노출 필드가 없는 옛 레코드는
    //   `exposureOf` 가 `today − d`(종전 뜻)로 답하므로 이 자리는 **한 줄만 바뀌고 값은 연속**이다.
    const f = freshnessOf(item, exposureOf(a, today));
    n += q; wf += f * q;
    if (f <= 0) bad += q;
  }
  return { n: +n.toFixed(6), fresh: n > 0 ? +(wf / n).toFixed(6) : 1, spoiled: +bad.toFixed(6) };
}
// ★**안 꺼내고 미리 본다** — 지금 n 개를 내면 어느 로트에서 나가는가(FIFO, `Lots.consume` 과 같은 순서).
//   거래소·게시판이 **차감 전에** 신선도를 알아야 해서 필요하다(견적과 실행이 다른 수를 쓰면
//   그게 보이지 않는 손이다 — 거래소 배치가 못 박은 규약).
//   ⚠로트를 **건드리지 않는다**: 읽기만 한다.
function peekAges(lots, n) {
  let left = Math.max(0, Number(n) || 0);
  const out = [];
  for (const l of (lots || [])) {
    if (left <= 1e-9) break;
    const take = Math.min(left, Number(l.n) || 0);
    if (take > 0) { out.push({ d: l.d, n: +take.toFixed(6), e: l.e, t: l.t, m: l.m, w: l.w }); left -= take; }
  }
  return out;
}
// 지금 n 개를 낼 때의 신선도·상한 몫 — `peekAges` + `ofAges` 두 정본의 합성.
function peekOffer(item, lots, n, today) { return ofAges(item, peekAges(lots, n), today); }

// 로트 배열(`Lots.of`)의 **가장 신선한** 몫 — "이 품목을 지금 팔 수 있나"의 답.
function bestOf(item, lots, today) {
  let best = 0;
  for (const l of (lots || [])) best = Math.max(best, freshnessOf(item, exposureOf(l, today)));
  return best;
}

// ── ★★보존 가공 3종 ─────────────────────────────────────────────────────────
//
// 재민 확정: *"산출은 새 로트(취득일 = 완성일)로 — **부패 시계가 리셋되는 게 보존의 본질**이다."*
//
// ★시설 문법은 `facility.js` 의 것을 그대로 쓴다("제작창 = 시설의 창"):
//   말리기 = 건조대(`dry`) · 훈제 = 모닥불·화덕(`cook`) · 절임 = 작업대(`tool`).
//   ⇒ **새 창을 만들지 않는다**. 훈제와 절임은 이미 있는 두 시설에 얹혔고, 새 시설은 건조대 하나뿐이다.
//
// ★★**입력 신선도 → 산출 수율**(재민: "시든 생선으로 만든 건어물은 하급").
//   왜 품질 등급이 아니라 **수율**인가: 로트 레코드는 `{d, n}` 둘뿐이라 품질 축을 얹으려면
//   저장 형식·UI·거래소가 전부 따라 움직여야 한다(그건 이 배치의 범위가 아니다).
//   수율은 **있는 축(n)으로 같은 것을 말한다** — 시든 생선 세 마리로 건어물 두 개가 나오면
//   플레이어는 "싱싱할 때 말릴걸"을 정확히 배운다. 재료 선택이 판단이 된다.
//   ⚠"보존식 품질 등급 축"은 회부(`회부_부패_다음층.md` B).
//   수율 = `YIELD_FLOOR + (1−YIELD_FLOOR) × 입력신선도`. 상한 재료는 아예 못 넣는다(아래 `canPreserve`).
const YIELD_FLOOR = _num('SPOIL_YIELD_FLOOR', 0.4);
function yieldMult(fresh) {
  const f = Math.max(0, Math.min(1, Number(fresh) || 0));
  return +(YIELD_FLOOR + (1 - YIELD_FLOOR) * f).toFixed(6);
}

// 가공 시간 — **게임일로 적고 실시간으로 환산한다.**
//   ★새 시계를 만들지 않는다: 하루 길이는 부르는 쪽(zone)이 `dayMs` 로 주입한다
//     (`zone._SEASON_DAY_MS` = WORLD.dayLengthMs 단일 원천). 여기에 24*60*1000 을 안 적는다.
const PRESERVE_DAYS = {
  dry:    _num('PRESERVE_DAYS_DRY', 3),      // 말리기 — 사흘. 이 배치에서 가장 길다(그게 말리기다)
  smoke:  _num('PRESERVE_DAYS_SMOKE', 1),    // 훈제 — 하루. 불을 지켜야 하니 짧다
  pickle: _num('PRESERVE_DAYS_PICKLE', 2),   // 절임 — 이틀. 독에 넣고 기다린다
};

// ★레시피 정본. `from` = 입력 로트 품목 · `out` = 산출 · `needs` = 추가 소모(로트 아님)
const PRESERVE = {
  dry_fish:    { label: '생선 말리기',   kind: 'dry',    facilityKo: '건조대',
                 from: 'fish',      out: 'dried_fish',  days: PRESERVE_DAYS.dry,    needs: {} },
  dry_fruit:   { label: '과실 말리기',   kind: 'dry',    facilityKo: '건조대',
                 from: 'berry',     out: 'dried_fruit', days: PRESERVE_DAYS.dry,    needs: {} },
  // ★훈제는 **땔감을 먹는다** — 연기가 나야 훈제다. 통나무 1단/단위.
  smoke_meat:  { label: '고기 훈제',     kind: 'cook',   facilityKo: '모닥불·화덕',
                 from: 'meat_raw',  out: 'smoked_meat', days: PRESERVE_DAYS.smoke,  needs: { wood: 1 } },
  // ★★절임은 **소금이 있어야 한다** — 소금 없이는 절임이 아니다.
  //   ⚠소금의 세계 조달은 이 배치에 없다(§0-ⓓ 실측: 한반도 광종 POOL 에 소금이 없고
  //     `PV_DEPOSIT_MAP` 에도 없어 게시판·거래소가 소금을 다루지 못한다).
  //     **기계는 완성돼 있다** — 소금이 손에 들어오는 날 이 레시피는 그대로 작동한다.
  //     조달안(자염 = 화덕에서 바닷물 졸이기)은 `회부_부패_다음층.md` C 항.
  pickle_veg:  { label: '남새 절임',     kind: 'tool',   facilityKo: '작업대',
                 from: 'vegetable', out: 'pickled_veg', days: PRESERVE_DAYS.pickle, needs: { salt: 1 } },
  pickle_fish: { label: '생선 절임',     kind: 'tool',   facilityKo: '작업대',
                 from: 'fish',      out: 'pickled_veg', days: PRESERVE_DAYS.pickle, needs: { salt: 1 } },
};

// 이 레시피를 지금 걸 수 있나 — **상한 재료는 못 넣는다**(상한 걸 말려도 상한 것이다).
//   반환: { ok, err } · `fresh` 는 부르는 쪽이 `ofAges` 로 이미 잰 값이다.
function canPreserve(recipeKey, fresh) {
  const r = PRESERVE[recipeKey];
  if (!r) return { ok: false, err: '알 수 없는 가공' };
  if (!(fresh > 0)) return { ok: false, err: '상한 재료로는 보존식을 만들 수 없다' };
  return { ok: true };
}
// 산출량 — 입력 n 개, 입력 신선도 f → 산출 개수(내림. 0 이면 부르는 쪽이 거절한다).
function outputQty(n, fresh) {
  const q = Math.floor((Number(n) || 0) * yieldMult(fresh) + 1e-9);
  return q > 0 ? q : 0;
}
// 가공 시간(ms) — 하루 길이를 주입받는다(새 시계 금지).
function preserveMs(recipeKey, dayMs) {
  const r = PRESERVE[recipeKey];
  if (!r) return 0;
  const dm = Number(dayMs);
  return Math.max(0, Math.round(r.days * (Number.isFinite(dm) && dm > 0 ? dm : 24 * 60 * 1000)));
}

// ── 대리 지표: 보고서가 쓰는 표 ──────────────────────────────────────────────
//   ★"겨울 한 주를 나려면 보존식 몇 단위"의 산수는 여기서 나온다(겨울나기 공동 프로젝트의 첫 수치).
//   `hungerPerDay` = 하루에 채워야 하는 허기 총량 · `effect` = 그 품목 1단위의 허기 회복량.
function shelfTable(dayMs) {
  const dm = Number(dayMs) > 0 ? Number(dayMs) : 24 * 60 * 1000;
  const rows = [];
  for (const [item, days] of Object.entries(SHELF_DAYS)) {
    rows.push({ item, days, realMin: +(days * dm / 60000).toFixed(1), preserved: isPreserved(item),
                wiltAtDay: +(days * (1 - FRESH_AT)).toFixed(2) });
  }
  rows.sort((a, b) => a.days - b.days);
  return rows;
}
// 겨울 한 주 산수 — 보존식 1단위의 허기 회복량과 하루 허기 소모에서 유도한다.
//   ★상수를 여기 안 적는다: `bodyHungerSec`(허기 0→100 초)와 `effect`(품목 회복량)를 주입받는다.
function winterMath(bodyHungerSec, dayMs, effectPerUnit) {
  const dm = Number(dayMs) > 0 ? Number(dayMs) : 24 * 60 * 1000;
  const hs = Number(bodyHungerSec) > 0 ? Number(bodyHungerSec) : 1800;
  const drainPerDay = 100 * (dm / 1000) / hs;              // 하루에 비는 허기(게이지)
  const eff = Number(effectPerUnit) > 0 ? Number(effectPerUnit) : 1;
  const perDay = drainPerDay / eff;                         // 하루치 단위 수
  return { drainPerDay: +drainPerDay.toFixed(3), unitsPerDay: +perDay.toFixed(3),
           unitsPerWeek: +(perDay * 7).toFixed(2) };
}

// ── 자기검사: 곡선 순서 ──────────────────────────────────────────────────────
//   ★하네스가 이걸 다시 적지 않게 여기서 낸다(검사 기준이 두 벌이 되면 그게 사본이다).
//   생선 < 조리식 < 채소 < 보존식 < 곡물 — 지시서가 못 박은 순서.
function orderCheck() {
  const seq = [['fish', 'fish'], ['fish_cooked', '조리식'], ['vegetable', '채소'],
               ['dried_fish', '보존식'], ['food', '곡물']];
  const out = [];
  for (let i = 1; i < seq.length; i++) {
    const a = shelfOf(seq[i - 1][0]), b = shelfOf(seq[i][0]);
    out.push({ pair: `${seq[i - 1][1]} < ${seq[i][1]}`, a, b, ok: a < b });
  }
  return out;
}

// ═══ ★★온도 결합 + 저장 감속 [재민 확정 2026-09-01 · 부패 2차] ═══════════════
//
// ★★**"나이"가 "노출"로 바뀐다.** 곡선(`freshnessOf`)은 한 글자도 안 고쳤다 —
//   둘째 인수의 **뜻**만 바뀐다: 경과 일수 → **노출량 E**(기준온도 환산 일수).
//   ⇒ 기준온도 환경에서 E == 일수 이므로 **채택된 보관일 표가 그대로 보존된다.**
//
// ★★**기준온도는 고르지 않고 유도했다.** `SPOIL_REF_C` 는 "이 세계의 1년 평균 노출이 정확히 1"
//   이 되는 온도다(econ 기온 곡선에서 이분법으로 푼 값 ≈ **14.83℃**). 그래야 *연평균으로는*
//   종전 보관일이 그대로고, 여름엔 빨리·겨울엔 느리게만 갈린다. 10℃ 같은 어림수를 쓰면
//   전 품목의 보관일이 조용히 40% 짧아진다(실측 meanR(10℃)=1.397).
//
// ★★**사본 금지** — 기온은 `server/weather.js`(그리고 그 아래 econ 정본)에게만 묻는다.
//   여기에 코사인도 365도 없다. 날씨 잡음(`devCOf`)·일교차 배율(`ampMultOf`)도 그쪽 것이다.
//   ⇒ 이 파일이 아는 건 **℃ → 부패 속도** 하나뿐이다.
//
// ★★**틱 0** — 광맥·어장·채집·부패·작물에 이은 여섯 번째 lazy. 누적표는 **조회할 때** 채운다.
//   나이 100일짜리를 물어도 표 두 값의 차 + 오늘 부분일 = **O(1)**.
//
// ★★**주사위 0** — 같은 (자리 이력, 날) = 같은 E. 비트 동일.
const _W = (() => { let m; return () => { if (m === undefined) { try { m = require('./weather'); } catch (e) { m = null; } } return m; }; })();
const _EC = (() => { let m; return () => { if (m === undefined) { try { m = require('../sim/economy-sim-v2.js'); } catch (e) { m = null; } } return m; }; })();

const EXP = {
  // Q10 — 10℃ 오르면 부패 속도 몇 배. 식품미생물학의 표준 근사치는 2~3이고 2가 보수적이다.
  Q10:   _num('SPOIL_Q10', 2),
  // 기준온도(℃) — **유도값**. 0 이하를 주면 아래에서 "연평균 노출 1" 을 풀어 채운다.
  REF_C: _num('SPOIL_REF_C', 0),
  // 하루를 몇 조각으로 적분하나. 24 = 한 시간 눈금(일교차가 곡선이라 조각이 필요하다).
  STEPS: Math.max(1, Math.round(_num('SPOIL_EXP_STEPS', 24))),
  // 속도 클램프 — 극단 잡음에서 표가 폭주하지 않게(물리적으로도 냉동/열분해 밖은 뜻이 없다).
  R_MIN: _num('SPOIL_R_MIN', 0.05),
  R_MAX: _num('SPOIL_R_MAX', 8),
  // 누적표가 뒤로 얼마나 멀리까지 답하나(일). 가장 긴 보관일(곡물 180·씨앗 365)의 두 배 남짓.
  BACK:  Math.max(30, Math.round(_num('SPOIL_EXP_BACK', 800))),
};

// ── ★자리(place) — 두 물리 인자로 쪼갠다. 불투명한 배율 하나를 두지 않는다 ──────
//   · `seal`(밀폐) : 온도와 무관한 속도 배율. **econ 정본에서 온다** —
//     `economy-sim-v2.POTTERY_DECAY_SAVE = 0.3`("질그릇 밀폐 — 부패 −30%") ⇒ 밀폐 용기 = 0.70.
//     부패 배치가 머리말에 *"지어낼 게 아니라 그 상수에서 유도하면 된다"* 고 적어 둔 그 자리다.
//   · `damp`(완충) : 그 자리의 기온이 **연평균 쪽으로 얼마나 당겨지는가**(0=바깥 그대로, 1=연중 항온).
//     움집·고상곳간이 음식을 지키는 진짜 이유가 이것이다(밀폐가 아니라 **온도 완충**).
//     ⇒ 여름엔 서늘해서 느리고 **겨울엔 덜 추워서 오히려 빠르다**. 그게 물리고, 그래서
//       "여름엔 곳간에, 겨울엔 밖에"라는 **판단**이 생긴다(§2 — 진행바가 아니라 판단).
//   ⚠`seal` 은 유도값이 하나(옹기), `damp` 는 전부 **추정**이다 — 회부에 전수를 적었다.
const PLACES = {
  carry:   { seal: 1.00, damp: 0.00, ko: '몸에 지님' },
  ground:  { seal: 1.00, damp: 0.00, ko: '바닥' },
  indoor:  { seal: 1.00, damp: _num('STORE_DAMP_INDOOR', 0.40), ko: '실내 바닥' },
  chest:   { seal: _num('STORE_SEAL_CHEST', 0.70), damp: 0.00, ko: '상자' },
  chest_in:{ seal: _num('STORE_SEAL_CHEST', 0.70), damp: _num('STORE_DAMP_INDOOR', 0.40), ko: '실내 상자' },
  granary: { seal: _num('STORE_SEAL_CHEST', 0.70), damp: _num('STORE_DAMP_GRANARY', 0.55), ko: '곳간' },
};
function placeOf(key) { return PLACES[key] || PLACES.carry; }
function placeKeys() { return Object.keys(PLACES); }

// ── ℃ → 부패 속도 ───────────────────────────────────────────────────────────
function rateAtC(tC) {
  const t = Number(tC);
  if (!Number.isFinite(t)) return 1;
  const r = Math.pow(EXP.Q10, (t - refC()) / 10);
  return r < EXP.R_MIN ? EXP.R_MIN : (r > EXP.R_MAX ? EXP.R_MAX : r);
}
// 그 고도의 **연평균 기온**(완충이 당겨 가는 목표점). econ 곡선에서 평균을 내서 얻는다(상수 복사 0).
const _meanC = new Map();
function meanC(elevKm) {
  const k = +(+(elevKm || 0)).toFixed(3);
  if (_meanC.has(k)) return _meanC.get(k);
  const E = _EC();
  let v = null;
  if (E && typeof E.temperatureAt === 'function') {
    let s = 0; for (let d = 0; d < 365; d++) s += E.temperatureAt(d, null, k);
    v = s / 365;
  }
  _meanC.set(k, v);
  return v;
}
// 기준온도 — 안 주면 "연평균 노출 = 1" 을 이분법으로 푼다(유도값 · 한 번만).
let _ref = null;
function refC() {
  if (EXP.REF_C > 0) return EXP.REF_C;
  if (_ref !== null) return _ref;
  const E = _EC();
  if (!E || typeof E.temperatureAt !== 'function') return (_ref = 10);
  const N = EXP.STEPS;
  const mean = (ref) => {
    let s = 0, c = 0;
    for (let d = 0; d < 365; d++) for (let i = 0; i < N; i++) {
      s += Math.pow(EXP.Q10, (E.temperatureAt(d, (i + 0.5) / N, 0) - ref) / 10); c++;
    }
    return s / c;
  };
  let lo = -20, hi = 60;
  for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (mean(m) > 1) lo = m; else hi = m; }
  return (_ref = +((lo + hi) / 2).toFixed(4));
}

// ── 하루치 노출 ─────────────────────────────────────────────────────────────
//   ★기온 곡선을 여기서 만들지 않는다: 날씨 정본이 내주는 **그날의 낮·밤 두 점** 사이를
//     econ 자신의 일주 모양(−cos 2πh)으로 잇는다. 두 끝은 정본 값과 **정확히 일치**한다.
//   ★날씨를 못 물으면(랩·스텁) **1.0/일** 로 떨어진다 = 종전 모델 그대로(회귀 안전).
function dayExposure(day, elevKm, damp) {
  const W = _W();
  if (!W || !W.available || !W.available()) return 1;
  const d = _day(day), e = +(elevKm || 0), w = Math.max(0, Math.min(1, +(damp || 0)));
  const hi = W.tempAt(d, false, e), lo = W.tempAt(d, true, e);
  if (hi === null || lo === null) return 1;
  const mid = (hi + lo) / 2, half = (hi - lo) / 2;
  const m = meanC(e);
  const N = EXP.STEPS;
  let s = 0;
  for (let i = 0; i < N; i++) {
    let T = mid + half * (-Math.cos(2 * Math.PI * ((i + 0.5) / N)));
    if (w > 0 && m !== null) T = T + w * (m - T);      // ★완충 — 연평균 쪽으로 당긴다
    s += rateAtC(T);
  }
  return s / N;
}

// ── 누적 노출표 (lazy · 틱 0) ───────────────────────────────────────────────
//   key = `고도|완충`. 각 표는 `{ a: 시작일, c: [누적…] }` (c[0] = 0, c[i] = a..a+i-1 합).
const _cum = new Map();
function _tbl(elevKm, damp) {
  const k = `${+(+(elevKm || 0)).toFixed(3)}|${+(+(damp || 0)).toFixed(3)}`;
  let t = _cum.get(k);
  if (!t) { t = { a: null, c: [0], e: +(elevKm || 0), w: +(damp || 0), mean: null }; _cum.set(k, t); }
  return t;
}
// 그 자리의 **연평균 하루 노출** — 표 밖을 물었을 때 O(1) 로 답하는 데 쓴다(한 번만 계산).
function _meanDay(t) {
  if (t.mean !== null) return t.mean;
  let s = 0; for (let d = 0; d < 365; d++) s += dayExposure(d, t.e, t.w);
  return (t.mean = s / 365);
}
// ★★**표에는 상한이 있다.** [부패 2차 2026-09-01 · 자기 결함 수리]
//   1차 실장이 `while (끝 < d) push()` 였는데, 하네스가 게임일 **35.8억**을 물자 배열을 35억 칸
//   늘리려다 죽었다(`RangeError: Invalid array length`). `| 0` 족보(77)와 **같은 족**이다:
//   *커질 수 있는 값을 열거하면 언젠가 터지고, 그날은 그 값이 처음으로 중요해지는 날이다.*
//   ⇒ 표는 `EXP.BACK+1` 칸을 넘지 않는다. 창 밖은 **연평균 × 일수**로 잇는다 —
//     기준온도를 "연평균 노출 1" 로 잡아 뒀으므로 그 근사는 곧 **종전 '일수' 모델**이고,
//     보관일이 가장 긴 씨앗(365일)도 창(기본 800일) 안에 있어 실제로는 근사를 안 탄다.
function cumExposure(day, elevKm, damp) {
  const x = Number(day);
  if (!Number.isFinite(x)) return 0;
  const d = Math.floor(x), frac = x - d;
  const t = _tbl(elevKm, damp);
  const SPAN = EXP.BACK;
  if (t.a === null) { t.a = d - SPAN; t.c = [0]; }        // 처음 물은 날에서 뒤로 창 하나
  // ★너무 멀리 뛰었다 — 열거하지 않고 **창을 옮긴다**. 옮기면서 원점의 뜻(절대 누적)은 유지한다.
  if (d < t.a - SPAN || d > t.a + t.c.length - 1 + SPAN) {
    const md = _meanDay(t);
    const base = t.c[0] + (d - SPAN - t.a) * md;
    t.a = d - SPAN; t.c = [base];
  }
  while (t.a + t.c.length - 1 < d) {                       // 앞으로만 늘린다
    const last = t.a + t.c.length - 1;
    t.c.push(t.c[t.c.length - 1] + dayExposure(last, t.e, t.w));
  }
  const base = (d < t.a) ? (t.c[0] - (t.a - d) * _meanDay(t)) : t.c[d - t.a];
  // 창이 길어지면 왼쪽을 자른다 — `c` 는 **절대 누적**이라 잘라도 값의 뜻이 안 바뀐다.
  const MAXLEN = 2 * SPAN + 2;
  if (t.c.length > MAXLEN) { const cut = t.c.length - MAXLEN; t.c = t.c.slice(cut); t.a += cut; }
  return frac > 0 ? base + frac * dayExposure(d, t.e, t.w) : base;
}
// 계측용 — 하네스가 "표가 적중했는가"를 세려면 필요하다.
function _cumStats() { let n = 0; for (const t of _cum.values()) n += t.c.length; return { tables: _cum.size, days: n }; }
function _cumReset() { _cum.clear(); _meanC.clear(); _ref = null; }

// ── ★로트 하나의 노출 ───────────────────────────────────────────────────────
//   레코드: `{ d, n, e, t, m, w }`
//     `d` = **취득일 — 뜻이 안 바뀌었다.** 화면의 "N일 전"도, `consumeFrom(lotDay)` 도 그대로다.
//     `e` = `t` 시점까지 정산된 누적 노출 · `t` = 마지막 정산일 · `m` = 자리 seal · `w` = 자리 damp
//   ★★**e 가 없으면 옛 로트다** — 그땐 나이가 `today − d` 다(종전 뜻 그대로).
//     그래서 이 코드가 켜지는 날 **아무 로트도 갑자기 상하지 않는다**(절벽 없음).
//     `Lots.settle` 이 처음 만질 때 `e = today − d · t = today` 로 옮겨 적는다 — 그 순간 값이 **연속**이다.
//   ⚠`d` 를 정산일로 재활용하지 않은 이유: 그러면 모든 로트의 `d` 가 오늘로 뭉개져
//     화면의 나이 표시와 "이 로트를 먹는다"(`consumeFrom`)가 **조용히 같은 로트를 가리키게** 된다.
function exposureOf(lot, today, elevKm) {
  if (!lot) return 0;
  const now = _day(today);
  if (lot.e == null) { const a = now - _day(lot.d); return a > 0 ? a : 0; }   // 옛 로트 = 종전 뜻
  const m = (lot.m == null) ? 1 : +lot.m;
  const w = (lot.w == null) ? 0 : +lot.w;
  const t0 = _day(lot.t == null ? lot.d : lot.t);
  const add = (cumExposure(now, elevKm, w) - cumExposure(t0, elevKm, w)) * m;
  const e = (+lot.e || 0) + (add > 0 ? add : 0);
  return e > 0 ? +e.toFixed(6) : 0;
}
// 자리 이름 → 로트에 적을 두 값.
function placeFields(key) { const p = placeOf(key); return { m: p.seal, w: p.damp }; }

module.exports = {
  Crops, D, SHELF_DAYS, PRESERVED_ITEMS, PRESERVE, PRESERVE_DAYS,
  FRESH_AT, STAGE_KO, STAGE_EMO, SPOIL_INJURY, YIELD_FLOOR,
  _day, shelfOf, isPreserved, freshnessOf, stageOf, stageOfAge, isSpoiled,
  // ★[부패 2차 2026-09-01] 온도 결합 + 저장 감속
  EXP, PLACES, placeOf, placeKeys, placeFields, rateAtC, refC, meanC,
  dayExposure, cumExposure, exposureOf, _cumStats, _cumReset,
  nutritionMult, illnessFor, ofAges, bestOf, peekAges, peekOffer,
  yieldMult, canPreserve, outputQty, preserveMs,
  shelfTable, winterMath, orderCheck,
};
