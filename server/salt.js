// === server/salt.js — 자염(煮鹽) 정본 [재민 확정 2026-09-01 ①] ==================
//
// 재민 확정: **자염** — 갯벌·바닷물을 끓여 소금을 얻는다. 청동기 한반도 서해·남해안 고증
// (암염 없음 · 천일염은 근대). 부패·보존 배치가 절임을 다 만들어 놓고 *"소금이 이 세계에 없다"*
// 에 막혀 회부한 그 조달을, 이 배치가 **플레이어의 손으로** 닫는다.
//
// ★★정본은 이 파일 하나다. 염도·수율·땔감·시간을 다른 파일에 적지 마라
//   (`spoil.js`·`crops.js` 선례 — 읽는 쪽은 표를 복사하지 않고 함수를 부른다).
//
// ── §0 실측이 뒤집은 전제 셋 ────────────────────────────────────────────────
//   ⓐ **소금은 이 세계에 이미 있다.** 앞 배치의 "소금이 없다"는 절반만 맞았다 —
//      `specialty.RESOURCES.salt` 는 **실재한다**(ko '소금' · 🧂 · mineral · weight 1 ·
//      baseValue 5 · subsistence 0.3 · happiness 0.5 · harvest 'mining'). 없는 것은 **조달**이다:
//      한반도 광종 POOL 여섯(철·구리·금·납·은·옥+흑요석)에 소금이 없어 **어느 마을도 캐지 못하고**,
//      `PV_DEPOSIT_MAP` 에 없어 **플레이어가 내지도 팔지도 못한다**. 이 배치는 앞의 것을 연다.
//   ⓑ **한반도는 반도가 아니다.** 서·동·북이 전부 **육지 존**(하란 북부·아사기 열도·눈벌 동토)이고
//      바다는 **남쪽 하나**(동창해)뿐이다. 해안선 침입 깊이 남 8,960px · 서 5,728 · 동 5,600 · 북 0.
//      ⇒ 51마을 중 해안은 **3곳뿐**(어촌6 20px · 농촌12 426px · 농촌21 644px). 나머지는 9,221px 이상.
//      시작 광장(농촌22)에서 바다까지 **61,968px = 도보 16분**이다. 자염은 **원정**이지 동네 일이 아니다.
//   ⓒ **물을 담는 문법이 없다.** 갈증은 물가에서 즉시 회복이고(`물을 마셨습니다`), 인벤에 물이 없다.
//      단 `water_bottle`(물병 · 1.00kg · "박 물병 + 물")이 **품목으로는 이미 있었다** —
//      무게표·라벨·아이콘·상자 허용목록에 다 있는데 **레시피가 서버에 없어 만들 수가 없었다**
//      (클라 폴백 목록에만 있었고 그건 `cookRecipes` 가 비었을 때만 뜬다 = 영영 안 뜬다).
//      ⇒ **죽은 품목이었다.** 이 배치가 그 물병에 첫 쓸모를 준다(빈손 배치가 찾은 죽은 신호 계보).
//
// ── ★★염도 3% 로는 이 게임이 성립하지 않는다 — 산수가 강제한 설계 ─────────────
//   지시서는 *"염도 3% → 바닷물 10kg → 소금 0.3kg"* 을 시작점으로 줬다. 그대로 두면:
//     소금 1단위 = 1.00kg ⇒ 바닷물 **34되(34kg)** 가 필요하다.
//     그런데 적재 상한은 **25kg** 이고, 물병 34개엔 풀 68단이 든다.
//     34kg 은 과적 바닥(×0.35)이라 해안에서 가마까지 **비틀거리며** 와야 한다.
//   ⇒ 그건 판단도 위험도 손맛도 없는 **34번의 같은 입력** — §2 가 금지한 "진행바"다.
//   ★그리고 **실제 자염이 그렇게 하지 않았다.** 조선 자염은 바닷물을 바로 끓이지 않는다 —
//     갯벌 흙에 바닷물을 부어 거른 **함수(鹹水, 15~20%)** 를 끓였다. 바닷물을 직통으로 졸이는 건
//     연료가 감당이 안 돼 역사적으로도 안 한 일이다. **"자염 = 함수를 끓이는 것"** 이 원래 뜻이다.
//   ⇒ 갯벌에서 뜨는 것을 **바닷물이 아니라 짠물(함수)** 로 잡는다. 채수 한 번이 곧 갯벌 여과다.
//     이건 지시서에서 벗어난 유일한 자리이고, **고증 쪽으로** 벗어났다. 회부 A 에 적었다.
//
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const _int = (k, d) => { const v = Math.round(_num(k, d)); return Number.isFinite(v) ? v : d; };

// ── 품목 ────────────────────────────────────────────────────────────────────
//   ★`salt` 는 **새 품목이 아니다** — econ 정본 `specialty.RESOURCES.salt` 그 id 그대로다.
//     그래야 절임·거래소·사건 장부가 **특별 취급 코드 없이** 이 소금을 다룬다(사본 금지의 값).
const SALT = 'salt';
// 짠물(함수 鹹水) — 갯벌에 거른 것. **로트가 아니다**(썩지 않는다 · 무기한 벌크 = 인벤 3층의 셋째).
const BRINE = 'brine';
const BRINE_KO = '짠물';
// 용기 — 이미 있던 죽은 품목. 짠물 한 되를 담는다.
const VESSEL = 'water_bottle';

// ── 수치 ────────────────────────────────────────────────────────────────────
//   전부 env 손잡이다. **실기 전엔 값을 안 건드린다**(게임 손잡이 튜닝 금지).
const CFG = {
  // 갯벌 함수 염도(질량비). 조선 자염 함수가 15~20%였다 — 아래끝을 쓴다.
  BRINE_PCT:  _num('SALT_BRINE_PCT', 0.15),
  // 한 되(물병 하나)의 무게. `weights.water_bottle` 1.00 과 **같아야** 한다 —
  //   물병↔짠물이 서로 바뀌므로 무게가 다르면 채수만으로 몸무게가 변한다.
  BRINE_KG:   _num('SALT_BRINE_KG', 1.00),
  // 소금 한 단위의 무게(econ 정본 `specialty.RESOURCES.salt.weight` = 1). 여기서 발명하지 않는다.
  SALT_KG:    1.00,
  // 한 솥에 드는 땔감. **열역학에서 나온 수**다(추정 딱지):
  //   짠물 7되(7kg)에서 물 6kg 을 날린다 → 증발 잠열 2.26MJ/kg × 6 ≈ 13.6MJ.
  //   마른 장작 ~15MJ/kg · 노천 가마 효율 ~15% ⇒ 6kg ≈ `wood` 2단(단당 3.00kg).
  WOOD_PER_POT: _int('SALT_WOOD_PER_POT', 2),
  // 한 솥이 끓는 데 드는 **게임일**. 실제 벌막은 한 솥에 8~10시간을 땠다.
  //   0.5 게임일 = 실시간 12분(하루 24분). 제련 2분과 말리기 3일(72분) 사이다.
  BOIL_DAYS:  _num('SALT_BOIL_DAYS', 0.5),
  // ⚠채수에 드는 시간은 **여기 없다** — 채집 쿨다운(`forage.CFG.COOLDOWN_MS`)이 그 값이다.
  //   손잡이를 두 개 만들면 언젠가 한쪽만 고쳐진다(캐논: 플래그를 두 개 만들지 마라).
};
// 소금 한 단위를 얻는 데 드는 짠물 되수 — **유도값이다**(표에 적지 않는다).
//   ceil(1.00 / (1.00 × 0.15)) = 7
function brinePerPot() {
  const per = CFG.BRINE_KG * CFG.BRINE_PCT;          // 한 되에서 나오는 소금 kg
  if (!(per > 0)) return Infinity;
  return Math.max(1, Math.ceil(CFG.SALT_KG / per));
}
// 짠물 n 되 → 소금 몇 단위인가. **주사위 없음** — 같은 입력이면 언제나 같은 출력.
function saltFrom(nBrine) {
  const n = Math.max(0, Math.floor(Number(nBrine) || 0));
  return Math.floor(n / brinePerPot());
}

// ── 레시피 ──────────────────────────────────────────────────────────────────
//   ★한 솥이 단위다. `amount` 는 솥 수를 곱한다 — 그래야 비용이 전부 정수로 떨어진다
//     (되당 땔감 0.29단 같은 소수를 화면에 띄우지 않는다).
//   ★`kind: 'boil'` — 새 창이 아니라 **새 시설의 창**이다("제작창 = 시설의 창" 그대로).
const RECIPES = {
  boil_salt: {
    label: '자염(煮鹽)', kind: 'boil', facilityKo: '소금가마',
    from: BRINE, out: SALT, days: CFG.BOIL_DAYS,
  },
};
// 한 솥의 재료 — 정본은 이 함수 하나다(표를 두 벌 만들지 않는다).
function potCost(key) {
  if (!RECIPES[key]) return null;
  return { [BRINE]: brinePerPot(), wood: CFG.WOOD_PER_POT };
}
// 한 솥의 산출.
function potYield(key) {
  if (!RECIPES[key]) return 0;
  return saltFrom(brinePerPot());
}
// 이 레시피를 지금 걸 수 있나 — 재료만 본다(시설·소유는 부르는 쪽 몫).
function canBoil(key, inv, pots) {
  const r = RECIPES[key];
  if (!r) return { ok: false, err: '알 수 없는 가공' };
  const p = Math.max(1, Math.floor(Number(pots) || 1));
  const cost = potCost(key);
  for (const [k, n] of Object.entries(cost)) {
    const have = Math.floor((inv && inv[k]) || 0);
    if (have < n * p) return { ok: false, err: `${k} ${n * p}개 필요(보유 ${have})`, item: k, need: n * p, have };
  }
  return { ok: true, cost, pots: p };
}
// 걸리는 시간(ms) — **게임일로 적고 하루 길이로 환산한다**(새 시계 금지 · 보존 배치와 같은 규약).
function boilMs(key, dayMs) {
  const r = RECIPES[key];
  if (!r) return 0;
  const d = Number(dayMs);
  return Math.max(0, Math.round(r.days * (Number.isFinite(d) && d > 0 ? d : 24 * 60 * 1000)));
}

// ── 갯벌 판정 ───────────────────────────────────────────────────────────────
//   ★★**바다는 강·호수와 다른 층이다.** 이 레포엔 이미 두 술어가 따로 있다:
//     · `terrain.isWaterCellLocal` = 강·호수(지형 JSON 의 rivers/lakes)
//     · `zone.WATER_TILES`         = **해안선 water tiles**(`chunk.generateCoastlineWaterTiles` —
//                                     ocean 존에 면한 가장자리에 노이즈로 깐 띠)
//   ⇒ **바다 = 해안선 타일이면서 강·호수가 아닌 것.** 새 지형 층을 만들지 않는다.
//     (부르는 쪽이 두 술어를 주입한다 — 사본 금지 · `forage.js` 와 같은 규약.)
//   ★갯벌 = **바다에 접한 뭍 한 칸**. 물 위에선 못 뜬다(거기 서 있을 수가 없다).
const CELL_PX = 32;
const ADJ = [[CELL_PX, 0], [-CELL_PX, 0], [0, CELL_PX], [0, -CELL_PX],
             [CELL_PX, CELL_PX], [CELL_PX, -CELL_PX], [-CELL_PX, CELL_PX], [-CELL_PX, -CELL_PX]];
// ctx: { isSea(x,y) }  → 이 자리가 갯벌인가
function isTidalFlat(x, y, ctx) {
  if (!ctx || typeof ctx.isSea !== 'function') return false;
  if (ctx.isSea(x, y)) return false;              // 바다 위는 갯벌이 아니다(뭍이어야 뜬다)
  for (const [dx, dy] of ADJ) if (ctx.isSea(x + dx, y + dy)) return true;
  return false;
}

// 화면에 내보낼 표 — 클라가 수치를 다시 적지 않게(사본 금지).
function payload() {
  const key = 'boil_salt';
  return {
    brine: BRINE, brineKo: BRINE_KO, vessel: VESSEL, salt: SALT,
    brinePerPot: brinePerPot(), woodPerPot: CFG.WOOD_PER_POT,
    saltPerPot: potYield(key), boilDays: CFG.BOIL_DAYS, brinePct: CFG.BRINE_PCT,
  };
}

module.exports = {
  SALT, BRINE, BRINE_KO, VESSEL, CFG, RECIPES,
  brinePerPot, saltFrom, potCost, potYield, canBoil, boilMs,
  isTidalFlat, payload,
};
