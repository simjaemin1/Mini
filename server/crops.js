// === server/crops.js — 작물 정본 [재민 확정 2026-08-31] ==========================
//
// 재민 질문: *"작물별로 포만감·부패속도·수확량당 무게·자라는 기간·수확 계절·난이도가
//   다 다를 텐데, 고증에도 맞고 밸런스에도 맞는 거 같아?"*
// 실측 답: **그때까지 작물이 한 종이었다**(`cropType:'berry'` 하드코딩 · 60초 · 계절 무관).
//   그리고 재민은 이미 답지를 만들어 두었다 — `~/Mini/한국작물_카탈로그.xlsx` 34종 × 18필드.
//   **그걸 아무 코드도 안 읽고 있었다.** 이 파일이 그 다리다.
//
// ★★★**표는 여기 없다.** 원천은 재민의 xlsx 이고, `scripts/build-crops.py` 가 `crops.json` 으로
//   굽는다(월드 데이터는 빌드 스크립트 경유 — 손편집 금지 캐논). 이 파일은 **읽고 파생만** 한다.
//   숫자를 여기 옮겨 적는 순간 그게 사본이고, 재민이 표를 고쳐도 게임은 모르게 된다.
//
// ★★**축은 카탈로그가 정하고, 축→게임 값의 환산만 여기서 한다.** 그 환산은 전부 env 손잡이다
//   (게임 손잡이 튜닝 금지 캐논 — 실기 전엔 값을 건드리지 않는다).
//
// ⚠**econ 무접촉.** 계절은 `events.seasonOf`(econ 정본 래퍼)를 **부르기만** 한다 —
//   365·90·270 같은 수를 여기 한 번도 안 적는다(`weather.js` 가 같은 자리에서 코사인을
//   따로 만들었다가 최한일이 2일 어긋난 족보가 있다. 사본은 언제나 그렇게 조용히 어긋난다).
//   그리고 econ 은 이 파일을 **부르지 않는다** — 작물 층은 플레이어 층 전용이다.
'use strict';
const path = require('path');
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const DATA = require('./crops.json');
const CROPS = DATA.crops || {};
let Specialty = null;
try { Specialty = require('./specialty'); } catch (e) { Specialty = null; }
// ★게임일 정수화 — **`| 0` 금지**(int32 절단 · `server/lots.js` 머리의 잠복 결함 주석 참조).
//   ⚠이 파일 초안이 `day | 0` 을 세 곳에 썼다가 여기서 고쳤다. 규칙을 세운 다음 날 내가 어겼다.
const _day = (x) => { const v = Math.floor(Number(x)); return Number.isFinite(v) ? v : 0; };
let _Events = null;                                  // ★lazy — 로드 시점에 econ 을 끌어오지 않는다
function _events() { if (!_Events) _Events = require('./events'); return _Events; }

// ── ①저장성(1~5) → 보관일 ───────────────────────────────────────────────────
//   ★★**부패 배치의 5버킷이 이 축 위에 있었다.** 손으로 정했던 값들이 그대로 맞는다:
//     채소 6일 = 저장성 2 · 곡물 180일 = 저장성 5 · 보존식 45일 = 저장성 4.
//   ⇒ 버킷을 축으로 바꾸면 **34종이 저절로 갈린다**(상추 3일 · 배추 6 · 무 14 · 기장 45 · 쌀 180).
//   ⚠`server/spoil.js` 의 `SHELF_DAYS` 는 이 표를 **읽어서** 작물 몫을 채운다(두 벌 금지).
const KEEP_DAYS = {
  1: _num('CROP_KEEP_D1', 3),     // 잎채소·오이·참외 — 며칠 못 간다
  2: _num('CROP_KEEP_D2', 6),     // 배추·대파·뽕잎
  3: _num('CROP_KEEP_D3', 14),    // 무·순무·토란·메밀·피
  4: _num('CROP_KEEP_D4', 45),    // 기장·수수·팥·녹두·들깨·마·생강
  5: _num('CROP_KEEP_D5', 180),   // 쌀·보리·밀·조·콩·참깨·마늘 — 곳간에 쟁이는 것들
};
// ── ②생존(1~5) → 생식 포만감 ── ⚠**폐기됐다 [T59 2026-09-03 재민 확정]** ────────
//   ~~앵커가 이미 코드 안에 있었다: `FOOD_EFFECTS.food`(생곡)의 허기 7 = 쌀 생존 5 × 1.4.~~
//   ★★그 **앵커 자체가 틀렸다.** 생곡 7 은 베리 시절 값이고, econ 은 같은 곡식 1단위를
//     **NPC 하루치**로 먹고 있었다(`DAILY_FOOD_CONSUMPTION` 1.0) — 7배 어긋남.
//     역산은 옳은 방법이었지만 **앵커가 썩어 있으면 표 전체가 같은 배율로 썩는다**(족보).
//   ⇒ 포만감은 이제 **열량에서 나온다**: `server/kcal.js` 가 kg × `kcal` 축으로 유도한다.
//     이 파일은 **`kcal` 축을 내주기만** 한다(카탈로그의 `열량(kcal/kg)` 열 — 전사물).
//   ⚠`CROP_HUNGER_PER_SUBS` 는 **더 이상 읽히지 않는다**(안 읽히는 사본을 남기지 않으려고 지웠다).
// ── ③기호(0~5) → 사기 ──────────────────────────────────────────────────────
//   맛있는 걸 먹으면 사기가 오른다(§7 "사기 = 당근"). 조리식과 같은 축을 쓴다 — 새 축 없음.
const TASTE_MORALE_AT = _num('CROP_TASTE_MORALE_AT', 3);
// ── ④씨앗 보관일 ────────────────────────────────────────────────────────────
//   ★종자는 **열매보다 오래 간다** — 한 해를 나라고 여문 것이다. 다만 여문 정도(저장성)가
//     조금 갈린다. 상추 씨 248일 · 쌀 씨 365일 — 둘 다 게임 한 해 언저리다.
//   ★그리고 이게 **발아율**이 된다: 묵은 씨앗을 심으면 덜 난다(아래 `harvestUnits`).
const SEED_KEEP_DAYS = _num('CROP_SEED_KEEP_DAYS', 365);
const SEED_KEEP_FLOOR = _num('CROP_SEED_KEEP_FLOOR', 0.6);
// ── ⑤성장일 배율 ────────────────────────────────────────────────────────────
//   ⚠**카탈로그의 성장일을 그대로 게임일로 쓴다**(쌀 78일 = 실시간 31시간 · 상추 24일 = 9.6시간).
//     종전 농사는 **60초**였다 — 600~1800배 차이다. 그게 이 배치에서 가장 크게 달라지는 수치이고,
//     **실기 판정 대상**이다. 손잡이를 열어 두되 기본값은 카탈로그 그대로 간다(튜닝 금지).
const GROW_SCALE = _num('CROP_GROW_SCALE', 1.0);
// ── ⑥물·관리 ────────────────────────────────────────────────────────────────
//   물이 모자랄 때 얼마나 깎이나 = **관리난이도에 비례**한다.
//   난이도 5(쌀)는 물이 안 맞으면 통째로 망하고, 난이도 1(기장)은 20%만 준다.
//   ⇒ 카탈로그의 *"물관리 까다롭지만 단위면적 최고 수확"* 이 그대로 게임 규칙이 된다.
const CARE_MAX = _num('CROP_CARE_MAX', 5);

// ── 분류별 앵커 ─────────────────────────────────────────────────────────────
//   ★무게는 **specialty 가 정본**이다(34종 중 12종이 거기 있다). 없는 22종만 분류에서 유도한다.
//   ⚠유도값은 `회부_작물_다음층.md` 에 그대로 옮겨 적는다(표에 없는 값은 유도하고 회부에 적어라).
const GROUP_KG = {
  '곡물': 0.70,   // = CORE_KG.food 앵커(주식 곡물 1단위 = 1인 1일분)
  '콩류': 0.45,   // = specialty.soybean
  '유료': 0.50,   // 참깨·들깨 — 기름 종자, 곡물보다 성기고 가볍다
  '구황': 1.10,   // = specialty.yam — 뿌리라 무겁고 수분이 많다
  '채소': 0.60,   // = CORE_KG.vegetable
  '양념': 0.20,   // = specialty.garlic
  '박과': 1.50,   // 박·참외 — 통째로 드는 큰 열매
  '특용': 0.35,   // = CORE_KG.ramie(식물 섬유)
};
const GROUP_EMOJI = { '곡물': '🌾', '콩류': '🫘', '유료': '🌰', '구황': '🍠', '채소': '🥬', '양념': '🧄', '박과': '🍈', '특용': '🌱' };
// 식품이 아닌 분류 — 먹을 수 없다(섬유·양잠·염색·차는 각자 다른 층이다 · 회부)
const NON_FOOD_GROUPS = new Set(['특용']);

const SEED_PREFIX = 'seed_';
const IDS = Object.keys(CROPS).sort();

function get(id) { return CROPS[id] || null; }
function list() { return IDS.map((k) => CROPS[k]); }
function isCrop(item) { return Object.prototype.hasOwnProperty.call(CROPS, item); }
function seedOf(id) { return SEED_PREFIX + id; }
function isSeed(item) { return typeof item === 'string' && item.startsWith(SEED_PREFIX) && isCrop(item.slice(SEED_PREFIX.length)); }
function cropOfSeed(item) { return isSeed(item) ? item.slice(SEED_PREFIX.length) : null; }
function isFood(id) { const c = get(id); return !!c && !NON_FOOD_GROUPS.has(c.group); }

// ── 파생 ────────────────────────────────────────────────────────────────────
function keepDaysOf(id) { const c = get(id); return c ? (KEEP_DAYS[c.keep] || KEEP_DAYS[3]) : 0; }
function seedKeepDaysOf(id) {
  const c = get(id); if (!c) return 0;
  return +(SEED_KEEP_DAYS * (SEED_KEEP_FLOOR + (1 - SEED_KEEP_FLOOR) * (c.keep / 5))).toFixed(1);
}
// ★[T59] 열량 축 — 카탈로그 `열량(kcal/kg)` 열 그대로(전사물 · 손으로 고치지 마라).
//   특용 4종(삼·뽕·차·쪽)은 0 이고 그래서 `isFood` 가 이미 걸러 낸다 — 두 곳이 같은 말을 한다.
function kcalOf(id) { const c = get(id); const k = c && Number(c.kcal); return Number.isFinite(k) && k > 0 ? k : 0; }
// 포만감은 **여기서 안 정한다** — `server/kcal.js` 가 kg × kcal/kg 에서 유도한다(정본 하나).
//   ⚠늦게 부른다(맞물림 금지): `kcal.js` 가 이 파일을 문다.
function hungerOf(id) {
  if (!isFood(id)) return 0;
  let K = null; try { K = require('./kcal'); } catch (e) { return 0; }
  return K.hungerOf(id);
}
function tastyOf(id) { const c = get(id); return !!c && c.taste >= TASTE_MORALE_AT; }
function growDaysOf(id) { const c = get(id); return c ? Math.max(1, Math.round(c.growDays * GROW_SCALE)) : 0; }
function kgOf(id) {
  const c = get(id); if (!c) return null;
  const sp = Specialty && Specialty.RESOURCES && Specialty.RESOURCES[id];
  if (sp && sp.weight > 0) return sp.weight;                 // ★specialty 가 정본
  return GROUP_KG[c.group] || 0.6;                            // 없으면 분류 앵커에서 유도
}
// 씨앗 무게 — 한 줌. `weights.DERIVED_KG.seed_berry`(0.02) 와 같은 급이다.
const SEED_KG = _num('CROP_SEED_KG', 0.02);
function koOf(id) { const c = get(id); return c ? c.ko : id; }
function emojiOf(id) {
  const c = get(id); if (!c) return '🌱';
  const sp = Specialty && Specialty.RESOURCES && Specialty.RESOURCES[id];
  return (sp && sp.emoji) || GROUP_EMOJI[c.group] || '🌱';
}

// ── 파종철 — econ 계절 정본을 **부르기만** 한다 ─────────────────────────────
function seasonOfDay(day) { return _events().seasonOf(_day(day)); }
function sowSeasons(id) { const c = get(id); return c ? (c.sow || []) : []; }
function canSowOn(id, day) { return sowSeasons(id).includes(seasonOfDay(day)); }
// 그 계절에 심을 수 있는 작물 전부(씨앗을 세계가 내줄 때도 이 목록을 쓴다)
function sowableIn(season) { return list().filter((c) => (c.sow || []).includes(season)).map((c) => c.id); }
function sowableOn(day) { return sowableIn(seasonOfDay(day)); }

// ── ★★월동 — 겨울엔 자라지 않는다 ──────────────────────────────────────────
//   카탈로그 원문: *"월동: 가을 파종 → **겨울 휴면** → 초여름 수확."*
//   ⇒ 성장은 **활동일**로 센다. 겨울 하루는 나이를 먹되 **자라지는 않는다.**
//   ★새 시계를 만들지 않는다 — 하루하루 `seasonOf` 에게 물어본다(호출은 성장일+겨울 길이로 유계).
//   ★1년생은 이 갈래를 안 탄다(겨울에 심을 수 없으니 애초에 겨울을 만날 일이 드물고,
//     만나면 그냥 자란다 — 서리에 죽는 모델은 회부다).
// ── ★★★재배유형(`lifecycle`) — **축을 코드가 읽는다** [T91 2026-09-04] ─────────
//   카탈로그 `재배유형` 열은 네 값이다(34종 실측): `1년생` 26 · `1년생(모종)` 1 · `월동` 3 · `다년생` 4.
//   ★★§0ⓐ 가 밝힌 것: **그 축을 읽는 코드가 상태기에 0곳이었다.** `crops.js:payload` 가 클라에
//     흘려보내는 한 곳뿐이고, 상태기(`villages.cropTaskOf/cropDoTask/cropDayTick`)는 안 봤다.
//   ★그런데 **월동만은 이미 살아 있었다** — 다만 축을 읽은 게 아니라 **빌드가 구워 넣은 불리언**을
//     읽었다(`scripts/build-crops.py:117` — `rec['winterCrop'] = (rec['lifecycle'] == '월동')`).
//     즉 축→게임 환산이 빌드 쪽에 하나, 여기 하나로 갈릴 수 있는 자리였다.
//   ⇒ 여기서 **축을 그대로 읽는다.** 새 불리언을 하나 더 굽지 않는다(사본 금지).
//     그리고 구워 넣은 `winterCrop` 과 축에서 유도한 답이 **같은지 하네스가 34종 전수로 잰다**
//     (T59 의 교훈: 역산 앵커는 좋지만 **앵커가 옳다는 건 따로 증명해야 한다**).
//   ⚠아래 두 글자는 **새 상수가 아니라 카탈로그의 값 그 자체**다(env 손잡이로 열지 않는다 —
//     열면 표의 글자와 코드의 글자가 갈릴 수 있고, 그게 정확히 사본이다).
const LC_WINTER = '월동';
const LC_PERENNIAL = '다년생';
function lifecycleOf(id) { const c = get(id); return c ? String(c.lifecycle || '') : ''; }
// **다년생 — 베어도 다시 난다.** 카탈로그 원문: 부추 *"한 번 심으면 베어도 다시 남"* ·
//   뽕 *"다년생, 심으면 매년"* · 차 *"다년생"* · 미나리 *"물가 다년생"*.
//   수확 뒤 처리는 `villages.cropAfterHarvest` 가 이 답 하나로 갈린다(정본 하나 · 마을·플레이어 공용).
function isPerennial(id) { return lifecycleOf(id) === LC_PERENNIAL; }
// 월동 — **축에서 유도한** 답. 운영 경로는 아직 구워진 `winterCrop` 을 쓴다(무변경 · T91 은 표만).
function isWinterCrop(id) { return lifecycleOf(id) === LC_WINTER; }
// ── ★★★[T99 2026-09-05] 휴면 · 춘화 — **T91 §3 표 셋에 대한 PM 판정** ─────────────
//
//   T91 이 월동 셋을 "축의 뜻 문제"로 회부했고, PM 이 판정을 내렸다(재민 거부권 · 채팅 고지):
//     ①(ⓐ 27일 · ⓑ 마늘 12월) **월동 작물은 겨울을 지나야 익기 시작한다 — 춘화(春化).**
//        가을은 **뿌리내림**이고 익음의 활동일은 **겨울이 끝난 날부터** 센다.
//        ⇒ 보리 88 · 밀 90 · 마늘 90 이 전부 봄 첫날 + 활동일 = **5월 말~6월 초** = 카탈로그의
//          *"초여름 수확"* 에 닿는다. **115 같은 새 수 없이 `growDays` 그대로.**
//        ⇒ 마늘을 9월 초에 심어도 12월에 안 익는다(겨울을 못 지났으니).
//     ②(ⓒ 겨울 물대기) **휴면은 성장·돌봄·품질 셋 다 멈춘다.** 겨울 논에 물을 안 댄다.
//     ③(T91 회부 2) **휴면 축 = 월동 + 다년생.** 부추 그루터기가 한겨울에 여물지 않는다.
//
//   ★★**되돌림 셋**(env · 1 이 기본 · 0 이면 T91 그대로). 판정이 뒤집히면 코드가 아니라 값이 움직인다.
//   ⚠새 수 0 · 새 열 0 · `crops.json` 무변 — 아래 어디에도 365·90·95·115 같은 수가 없다.
//     달력은 **`events.calendarOf` 에게 물어보고**(계절 길이·계절 안 며칠), 계절 수는 표에서 센다.
const VERNAL = _num('T99_VERNAL', 1) !== 0;                       // ① 춘화
const CARE_PAUSE = _num('T99_CARE_PAUSE', 1) !== 0;               // ② 휴면 중 돌봄·품질 정지
const PER_DORMANT = _num('T99_PERENNIAL_DORMANT', 1) !== 0;       // ③ 휴면 축에 다년생 포함

// ★★**휴면 술어는 하나다.** 성장(`grownDays`)·돌봄(`villages.cropTaskOf`/`cropDoTask`)·
//   품질(`villages.cropDayTick`) 셋이 전부 이 답을 쓴다 — 두 벌이 되면 "겨울에 안 자라는데
//   물은 대라는" 밭이 생긴다(그게 정확히 T91 §3ⓒ 가 잰 그림이다).
//   ⚠`isWinterCrop` 은 **축에서 유도한** 답이다(T91 이 구운 `winterCrop` 과 34종 전수 대조 — 불일치 0).
//     여기서부터 운영 경로도 축을 쓴다. 하네스의 그 대조는 그대로 남는다(사본 감시).
function _dormantKind(id) { return isWinterCrop(id) || (PER_DORMANT && isPerennial(id)); }
function _dormant(id, day) { return _dormantKind(id) && seasonOfDay(day) === 'winter'; }
// 돌봄·품질이 부르는 문 — **성장 휴면과 같은 답**이고 되돌림만 따로 열려 있다.
function dormantAt(id, day) { return CARE_PAUSE && _dormant(id, day); }

// ── ★★★[T112 2026-09-05] **비 온 날은 물 준 날이다** ────────────────────────
//   T98 이 하늘에 비를 세웠는데(`weather.precipAt` · 0..1 · 전 존 공통 · 결정론) **밭이 몰랐다.**
//   물대기 일감은 `day − (e.w || e.p) >= L_WATERGAP(7)` 이고, 그 `e.w` 가 하늘을 안 봤다
//   ⇒ 장마철에도 NPC 가 논에 물을 이고 다녔다(§0ⓐ 실측: 비 온 날 물대기 일감 6,072건).
//   ★**술어는 하나**다. 마을 밭과 플레이어 밭이 같은 답을 본다(상태기 셋이 같은 문으로 들어간다).
//   ★**강도 문턱이 없다 = 새 수 0.** 비가 오면 준 것이다(첫 판). 세기로 가르려면 문턱이 필요하고
//     그건 새 수다 — T98 회부의 앵커가 서면 그때 가른다(회부).
//   ★날씨를 못 물으면 **거짓**이다(비 없음). 랩·하네스처럼 하늘이 없는 자리에서 종전 그대로 돈다
//     — `weather.js` 머리의 `available()` 과 같은 규약이고, **거짓말을 지어내지 않는다.**
//   ⚠`weather.js` 는 달을 물으려고 이 파일을 부른다(맞물림) ⇒ 양쪽 다 **lazy** 다. 로드 시점엔 안 문다.
const RAIN_WATER = _num('T112_RAIN', 1) !== 0;
let _Weather = null;
function _weather() {
  if (_Weather === null) { try { const m = require('./weather'); _Weather = (m && typeof m.precipAt === 'function') ? m : false; } catch (e) { _Weather = false; } }
  return _Weather || null;
}
function rainedOn(day) {
  if (!RAIN_WATER) return false;
  const W = _weather(); if (!W) return false;
  let p = 0; try { p = +W.precipAt(_day(day)) || 0; } catch (e) { p = 0; }
  return p > 0;
}

// ── 춘화 — "겨울이 끝난 날" 을 달력 정본에게서 얻는다 ───────────────────────
//   ★계절 수는 **표에서 센다**(4 를 안 적는다). 한 해 안에 겨울은 반드시 한 번 온다.
//   ⚠`_SEASON_IX`(야생 채종 절)는 **아래에** 선언돼 있다 — 여기서 상수로 굳히면 TDZ 로 죽는다
//     (첫 판이 실제로 그랬다). 부를 때 센다 — 어차피 표 하나짜리 `Object.keys` 다.
function _seasonsPerYear() { return Object.keys(_SEASON_IX).length; }
//   ★그 계절의 **다음 날**로 건너뛴다 — 하루씩 훑지 않으니 호출이 계절 수로 유계다.
function _nextSeasonDay(day) {
  const d = _day(day);
  let cal = null; try { cal = _events().calendarOf(d); } catch (e) { cal = null; }
  if (!cal) return d + 1;
  return d + Math.max(1, (cal.seasonDays | 0) - (cal.dayOfSeason | 0) + 1);
}
const _vernCache = new Map();
function _vernalCompute(id, p) {
  let d = p;
  for (let hop = 0, cap = _seasonsPerYear(); hop <= cap && seasonOfDay(d) !== 'winter'; hop++) d = _nextSeasonDay(d);
  if (seasonOfDay(d) !== 'winter') return p;      // 달력에 겨울이 없다 ⇒ 종전대로(안전 폴백)
  return _nextSeasonDay(d);                       // 그 겨울이 끝난 다음 날 = **익음 시계의 0일**
}
// 익음 시계가 0 이 되는 날. 월동이 아니거나 되돌리면 **심은 날 그대로**(1년생 무접촉).
//   ★겨울에 심었으면 그 겨울의 남은 몫이 춘화가 된다(파종창엔 겨울이 0종이라 실제로는 안 온다).
function vernalDay(id, plantedDay) {
  const p = _day(plantedDay);
  if (!VERNAL || !isWinterCrop(id)) return p;
  const k = id + ',' + p;
  let v = _vernCache.get(k);
  if (v === undefined) { if (_vernCache.size > 4096) _vernCache.clear(); v = _vernalCompute(id, p); _vernCache.set(k, v); }
  return v;
}

// 심은 날부터 오늘까지 **활동일**이 얼마나 쌓였나(lazy · 틱 0).
//   ★[T99] 월동은 **춘화일부터** 센다 — 가을 활동일은 뿌리내림이라 익음에 0 이다
//     (돌봄·품질에는 그대로 셈한다 — 그건 `cropDayTick` 이 하고 여기와 무관하다).
function grownDays(id, plantedDay, today) {
  const need = growDaysOf(id);
  let n = 0;
  const a = vernalDay(id, plantedDay), b = _day(today);
  if (b <= a) return 0;
  for (let d = a; d < b; d++) {
    if (!_dormant(id, d)) n++;
    if (n >= need) return need;                    // 다 자랐으면 더 셀 이유가 없다
  }
  return n;
}
function isReady(id, plantedDay, today) { return grownDays(id, plantedDay, today) >= growDaysOf(id); }
// 언제 다 자라나(게임일). 표시용 — 못 찾으면 null(월동이 아주 길게 걸리는 경우 대비 상한).
function readyDay(id, plantedDay, maxScanDays) {
  const need = growDaysOf(id);
  const cap = Math.max(need + 1, Math.round(maxScanDays || need * 4 + 400));
  let n = 0;
  const p0 = vernalDay(id, plantedDay);            // ★[T99] 춘화일부터 — 겨울을 지나야 시계가 돈다
  for (let d = p0; d < p0 + cap; d++) {
    if (!_dormant(id, d)) n++;
    if (n >= need) return d + 1;
  }
  return null;
}

// ── 물·관리 → 수확량 ────────────────────────────────────────────────────────
//   `supply` 는 그 자리의 물 공급(1~5 · 부르는 쪽이 지형 정본으로 잰다 — 여기서 지형을 안 푼다).
//   ★못 미친 만큼을 **관리난이도에 비례**해 깎는다. 넘치는 물은 이득이 아니다(논에 물을 더 대도 소용없다).
function waterMult(id, supply) {
  const c = get(id); if (!c) return 1;
  const need = Math.max(1, c.water || 1);
  const got = Math.max(0, Math.min(5, Number(supply) || 0));
  const short = Math.max(0, 1 - got / need);
  return +Math.max(0, 1 - short * (c.care / CARE_MAX)).toFixed(6);
}
// 수확 단위 = 수확량 × 물충족 × **발아율**(씨앗 신선도). 전부 결정론 — 주사위 없음.
function harvestUnits(id, opts) {
  const c = get(id); if (!c) return 0;
  const o = opts || {};
  const w = waterMult(id, o.supply);
  const germ = Math.max(0, Math.min(1, o.seedFresh == null ? 1 : Number(o.seedFresh)));
  return Math.max(0, Math.floor(c.yield * w * germ + 1e-9));
}

// ── ★★야생 채종 — 첫 씨앗이 세계에서 나오는 길 ─────────────────────────────
//
// ⚠**소금의 전철을 밟지 않으려고 여기 있다.** 보존 배치에서 절임을 다 만들어 놓고
//   소금이 이 세계에 없어 레시피가 잠긴 일이 있었다. 작물 34종을 넣으면서 씨앗이
//   손에 안 들어오면 똑같은 일이 난다 — 그래서 조달을 **같은 배치 안에서** 낸다.
//
// ★고증: 청동기 농사의 시작은 **야생종 채종**이다. 들에서 여문 씨를 받아 이듬해 심었다.
// ★★**주사위가 아니라 자리다.** 어느 덤불이 씨를 내는지는 **셀 좌표와 계절의 함수**다 —
//   같은 덤불은 그 철 내내 같은 답을 준다(광맥 광종 배분과 같은 문법). 그래서
//   "저 덤불에 씨가 있다"를 기억할 수 있고, 철이 바뀌면 나오는 씨앗도 바뀐다.
// ★그리고 **그 철에 심을 수 있는 것만** 나온다 ⇒ 가을에 주운 씨앗은 월동 작물이라
//   자연히 가을에 심게 된다. 달력을 설명할 필요가 없어진다.
const WILD_SEED_CHANCE = _num('CROP_WILD_SEED_CHANCE', 0.30);
function _h32(a, b, c) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
const _SEASON_IX = { spring: 1, summer: 2, autumn: 3, winter: 4 };
// 그 셀이 이 철에 내주는 씨앗(없으면 null). `chance` 를 주면 그 비율만큼의 자리가 씨를 낸다.
function wildSeedAt(cx, cy, day, chance) {
  const season = seasonOfDay(day);
  const pool = sowableIn(season);
  if (!pool.length) return null;                       // ★겨울엔 아무것도 안 나온다(심을 수도 없다)
  const six = _SEASON_IX[season] || 0;
  const p = chance == null ? WILD_SEED_CHANCE : chance;
  if (_h32(cx, cy, six * 7919) / 4294967296 >= p) return null;
  return pool[_h32(cx, cy, six * 104729 + 13) % pool.length];
}

// ── ★★§6 달력 · 논밭 · 특산 [T58a 2026-09-03] ────────────────────────────────
//
// ★★**새 시계를 만들지 않는다**(재민 확정 2026-08-30: *"원천은 econ 계절 정본 하나 —
//   새 시계·새 매핑 상수 금지(사본 금지)"*). 여기 월은 **계절 정본의 더 촘촘한 읽기**일 뿐이다:
//   한 해의 길이는 `events.yearDaysOf()`(계절 정본에서 스스로 읽어 낸 값)이고, 열두 등분한다.
//
// ★★★**앵커는 고르지 않고 카탈로그에서 역산했다**(족보 (86) · T59 의 "세 자 일치"와 같은 결):
//   카탈로그에는 `sowMonths`(실제 달)와 `sow`(계절)가 **둘 다** 있다 ⇒ 둘이 어긋나지 않는
//   오프셋은 하나뿐이다. 열둘을 전수로 재면
//     offset 0:31 · 1:10 · **2:0** · 3:10 · 4:37 · 5:62 · 6:71 · 7:73 · 8:75 · 9:80 · 10:72 · 11:55  (위반 수)
//   ⇒ **게임일 0 = 실제 3월 1일**(봄의 첫날). 유일 최소이고 그 자리에서 위반이 **0** 이다.
//   ⚠이 수를 손으로 고치지 마라 — `test-crops` 가 카탈로그에서 **다시 역산해** 대조한다
//     (T59 의 교훈: 역산 앵커는 좋지만, 앵커가 옳다는 것은 따로 증명해야 한다).
//
// ⚠**랩의 `L_START=120`(게임일 0 = 5월)은 이 앵커와 두 달 어긋나 있었고**, 게다가 서버는
//   랩의 **0-based `plantMo`**(랩 주석 7929: *"plantMo=0=1월"*)를 1-based 로 읽고 있었다
//   ⇒ NPC 가 카탈로그보다 **한 달 일찍**, 그리고 봄 작물을 **겨울에** 심고 있었다. 그 표를 지운다.
const MONTHS_PER_YEAR = 12;
const ANCHOR_MONTH = _num('CROP_ANCHOR_MONTH', 3);      // 게임일 0 의 실제 달(유도값 · 위 주석)
const _MO_SEASON_IX = { spring: 0, summer: 1, autumn: 2, winter: 3 };
// ★★달을 **계절 정본에서** 센다(해 길이 365 도, 경계 90/180/270 도 여기 안 적는다).
//   `events.calendarOf` 가 주는 (계절 · 계절 안 며칠 · 그 계절 길이)를 셋으로 나눈 것이 달이다.
//   ⇒ **계절 경계와 달 경계가 어긋날 수 없다**(365/12 와 365/4 로 따로 나누면 하루씩 어긋난다 — 실측).
function monthOf(day) {
  let cal = null;
  try { cal = _events().calendarOf(_day(day)); } catch (e) {}
  if (!cal) return ANCHOR_MONTH;
  const six = _MO_SEASON_IX[cal.season] || 0;
  const len = Math.max(1, cal.seasonDays | 0);
  const third = Math.min(2, Math.floor((Math.max(1, cal.dayOfSeason) - 1) / len * 3));
  return ((six * 3 + third + ANCHOR_MONTH - 1) % MONTHS_PER_YEAR) + 1;
}
// 카탈로그의 사람 글("4~5·7~9월")을 기계 축으로 푼다 — 표를 옮겨 적지 않는다.
const _moCache = {};
function sowMonthsOf(id) {
  if (id in _moCache) return _moCache[id];
  const c = get(id);
  const out = new Set();
  if (c && c.sowMonths) {
    for (const part of String(c.sowMonths).replace(/월/g, '').split('·')) {
      const t = part.trim();
      const r = /^(\d+)~(\d+)$/.exec(t);
      if (r) { let a = +r[1], b = +r[2]; if (b < a) b += MONTHS_PER_YEAR; for (let i = a; i <= b; i++) out.add(((i - 1) % MONTHS_PER_YEAR) + 1); }
      else if (/^\d+$/.test(t)) out.add(+t);
    }
  }
  return (_moCache[id] = [...out].sort((a, b) => a - b));
}
// 논이냐 밭이냐 — 카탈로그의 `field` 는 **복합 표기**다("밭·논" · "물가·논" · "밭(뽕밭)" · "밭(경사)").
//   ⇒ 이분법으로 자르지 말고 **포함 여부**로 묻는다(표를 두 벌로 만들지 않으려고).
function fitsField(id, field) { const c = get(id); return !!c && String(c.field || '').includes(String(field || '')); }
// 그 달에 그 자리(논/밭)에 심을 수 있는 작물 id — **정렬해서** 돌려준다(결정론).
const _smCache = {};
function sowableMonth(field, month) {
  const k = field + '_' + month;
  if (k in _smCache) return _smCache[k];
  const out = IDS.filter((id) => fitsField(id, field) && sowMonthsOf(id).includes(month | 0));
  return (_smCache[k] = out);
}
// ★결정론 해시 — `wildSeedAt` 이 쓰는 그 함수를 **그대로 내준다**(부르는 쪽이 사본을 만들지 않게).
function h32(a, b, c) { return _h32(a, b, c); }

// ── 다른 정본에게 넘겨 줄 표들(전부 파생 — 저쪽이 옮겨 적지 않게 한다) ──────
function shelfMap() {                       // → spoil.SHELF_DAYS
  const out = {};
  for (const c of list()) { out[c.id] = keepDaysOf(c.id); out[seedOf(c.id)] = seedKeepDaysOf(c.id); }
  return out;
}
function weightMap() {                      // → weights.catalog
  const out = {};
  for (const c of list()) { out[c.id] = kgOf(c.id); out[seedOf(c.id)] = SEED_KG; }
  return out;
}
function foodMap() {                        // → zone.FOOD_EFFECTS
  const out = {};
  for (const c of list()) { if (isFood(c.id)) out[c.id] = { hunger: hungerOf(c.id), thirst: 0 }; }
  return out;
}
function labelMap() {                       // → zone.ITEM_LABEL_SERVER · 클라 이름표
  const out = {};
  for (const c of list()) { out[c.id] = c.ko; out[seedOf(c.id)] = `${c.ko} 씨앗`; }
  return out;
}
function emojiMap() {
  const out = {};
  for (const c of list()) { out[c.id] = emojiOf(c.id); out[seedOf(c.id)] = '🌰'; }
  return out;
}
// 클라가 받을 페이로드(클라가 표를 안 든다 — 원장·무게와 같은 규약)
function payload() {
  return list().map((c) => ({
    id: c.id, ko: c.ko, emoji: emojiOf(c.id), group: c.group, field: c.field, lifecycle: c.lifecycle,
    sow: c.sow, winterCrop: !!c.winterCrop, growDays: growDaysOf(c.id),
    yield: c.yield, care: c.care, water: c.water, keep: c.keep, pest: c.pest,
    keepDays: keepDaysOf(c.id), seedKeepDays: seedKeepDaysOf(c.id),
    hunger: hungerOf(c.id), kg: kgOf(c.id), tasty: tastyOf(c.id), note: c.note || '',
  }));
}

module.exports = {
  DATA, CROPS, IDS, SEED_PREFIX, _day, SEED_KG, KEEP_DAYS, GROUP_KG, GROUP_EMOJI, NON_FOOD_GROUPS,
  get, list, isCrop, isSeed, seedOf, cropOfSeed, isFood, kcalOf,
  keepDaysOf, seedKeepDaysOf, hungerOf, tastyOf, growDaysOf, kgOf, koOf, emojiOf,
  seasonOfDay, sowSeasons, canSowOn, sowableIn, sowableOn, wildSeedAt, WILD_SEED_CHANCE,
  monthOf, sowMonthsOf, fitsField, sowableMonth, h32, MONTHS_PER_YEAR, ANCHOR_MONTH,
  lifecycleOf, isPerennial, isWinterCrop, LC_WINTER, LC_PERENNIAL,
  dormantAt, vernalDay, VERNAL, CARE_PAUSE, PER_DORMANT,   // ★[T99] 휴면 술어 하나 · 춘화일 — 마을·플레이어가 같이 부른다
  rainedOn, RAIN_WATER,   // ★[T112] 비 온 날은 물 준 날 — 상태기 셋이 같이 부른다
  grownDays, isReady, readyDay, waterMult, harvestUnits,
  shelfMap, weightMap, foodMap, labelMap, emojiMap, payload,
};
