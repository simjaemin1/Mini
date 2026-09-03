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
function _dormant(id, day) { const c = get(id); return !!(c && c.winterCrop) && seasonOfDay(day) === 'winter'; }
// 심은 날부터 오늘까지 **활동일**이 얼마나 쌓였나(lazy · 틱 0).
function grownDays(id, plantedDay, today) {
  const need = growDaysOf(id);
  let n = 0;
  const a = _day(plantedDay), b = _day(today);
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
  const p0 = _day(plantedDay);
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
  grownDays, isReady, readyDay, waterMult, harvestUnits,
  shelfMap, weightMap, foodMap, labelMap, emojiMap, payload,
};
