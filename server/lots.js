// === server/lots.js — 식품 로트 장부(취득일) [재민 확정 2026-08-27] ============
//
// ★★인벤 3층 구조의 가운데 층. 재민 확정:
//   *"감자·곡물·고기 등 상하는 식품 — `(품목, 취득일, 수량)` 레코드. 같은 날 얻은 것끼리는
//     동질(구별 무의미), 다른 날 것과는 로트가 갈린다. 신선도는 타이머가 아니라 조회 시
//     (오늘−취득일)로 유도한다."*
//
// ★**틱 비용 0** — 광맥 번영도·어장 재생과 같은 문법(lazy timestamp). 여기엔 setInterval 이 없다.
// ★**로트 병합 금지** — 나이를 섞으면 거짓말이다. 상한에 닿았을 때만 예외이고,
//   그때도 **오래된 쪽으로만** 뭉갠다(음식이 실제보다 **싱싱해 보이는 일은 없게**). 아래 `_cap` 참조.
//
// ✅**그 층이 앉았다 [2026-08-31]** — 곡선은 예고대로 **조회 함수 하나**(`spoil.freshnessOf`)로
//   얹혔고, **로트 레코드는 한 글자도 안 바뀌었다**(`{d, n}` 그대로 · 저장 형식 그대로).
//   이 파일이 하는 일은 종전과 같다: 수량의 나이 분포를 적는다. 신선도는 `server/spoil.js` 가
//   그 나이에서 유도한다 — 여기에 부패 상수를 적지 마라(그게 사본이다).
//
// ── 불변식 ───────────────────────────────────────────────────────────────────
//   `inventory[item] === Math.floor(Σ lots[item].n)`
//   수량의 정본은 여전히 **인벤**이다. 로트는 그 수량의 **나이 분포**를 적는다.
//   그래서 로트를 안 거치는 경로가 인벤을 건드려도 `reconcile` 이 스스로 낫는다
//   (그 몫은 "오늘 얻은 것"으로 잡힌다 — 이건 알고 하는 근사이고, 아래 주석에 못 박았다).
//   ★소수 몫은 인벤에 안 올라간다 — `oreCarry`(선광 소수분 이월)와 같은 규약이라
//     "0.75 남은 곡식은 아직 못 판다"가 자연스럽게 성립한다.
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const CFG = {
  MAX_LOTS: Math.max(2, Math.round(_num('LOT_MAX_PER_ITEM', 12))),
  EPS: 1e-6,
};
// ★★[2026-08-31 · 부패 배치가 드러낸 잠복 결함] **게임일에 `| 0` 을 쓰면 안 된다.**
//   `| 0` 은 **int32 로 자른다**(2^31 = 21.4억). 게임일은 `(now − epoch) / dayMs` 라
//   하루가 짧은 하네스(`VILLAGE_DAY_MS=500` — `e2e-trade` 가 마을을 데울 때 쓴다)에선
//   **35.8억**이 나오고, 그 순간 `|0` 이 **−7.2억으로 감긴다**.
//   여태는 조용했다 — 취득일은 화면에 "N일 전"으로만 쓰였고, 감긴 값끼리 빼면 대개 상쇄됐다.
//   부패 곡선이 들어온 지금은 **나이가 42.9억 일**이 되어 갓 잡은 생선이 즉시 "상함"이 된다
//   (`e2e-trade` 5건이 실제로 그렇게 죽었다 — 제품이 아니라 이 한 글자가 원인이었다).
//   ⇒ 게임일은 **`_day()` 하나로만** 정수화한다. 배정도 실수는 2^53 까지 정확하다.
const _day = (x) => { const v = Math.floor(Number(x)); return Number.isFinite(v) ? v : 0; };

// ── 로트로 관리할 품목 ──────────────────────────────────────────────────────
//   상하는 식품만. 돌·장작·섬유는 무기한 벌크라 로트가 없다(나이가 뜻이 없다).
let Specialty = null;
try { Specialty = require('./specialty'); } catch (e) { Specialty = null; }
const Spoil = require('./spoil');
const LOT_CORE = new Set(['food', 'berry', 'fruit', 'vegetable', 'meat', 'meat_raw', 'meat_cooked',
  'fish', 'fish_cooked', 'berry_jam', 'cooked_food', 'mushroom', 'milk', 'egg', 'cheese', 'bread']);
// ★[부패 배치 2026-08-31] 보존식도 **로트다** — 오래 가지만 영원하진 않다.
//   목록을 여기 옮겨 적지 않고 `spoil.PRESERVED_ITEMS` 를 **읽는다**(정본 하나).
for (const k of Object.keys(Spoil.PRESERVED_ITEMS)) LOT_CORE.add(k);
// ★★[작물 층 2026-08-31] 작물과 **씨앗**도 로트다.
//   작물: 34종 중 12종은 specialty agri 라 이미 로트였지만 나머지 22종은 아니었다 — 목록을 맞춘다.
//   씨앗: 종자도 늙는다(발아율). 목록 정본은 `server/crops.js` — 여기 옮겨 적지 않는다.
if (Spoil.Crops) {
  for (const c of Spoil.Crops.list()) { LOT_CORE.add(c.id); LOT_CORE.add(Spoil.Crops.seedOf(c.id)); }
}
function isLot(item) {
  if (!item) return false;
  if (LOT_CORE.has(item)) return true;
  const sp = Specialty && Specialty.RESOURCES && Specialty.RESOURCES[item];
  // 해산물·축산·작물은 상한다. 광물·임산물(통나무·송진)·가공 내구재는 아니다.
  return !!(sp && (sp.category === 'marine' || sp.category === 'livestock' || sp.category === 'agri'));
}

function all(p) { if (!p.lots || typeof p.lots !== 'object') p.lots = {}; return p.lots; }
function of(p, item) { const L = all(p); if (!Array.isArray(L[item])) L[item] = []; return L[item]; }
function sum(p, item) { let s = 0; for (const l of of(p, item)) s += l.n; return +s.toFixed(6); }

// ★상한 — **오래된 쪽 둘을 뭉치고 더 오래된 날짜를 준다.**
//   왜 이 방향인가: 반대로 하면(새것에 붙이면) 갓 얻은 식량이 **실제보다 오래돼 보인다**.
//   어느 쪽이든 근사지만, 이 방향의 오차는 "먹을 순서"를 어기지 않고
//   **음식이 실제보다 싱싱해 보이는 일이 절대 없다**. 안전한 쪽으로만 틀린다.
function _cap(arr) {
  while (arr.length > CFG.MAX_LOTS) {
    const a = arr[0], b = arr[1];
    arr.splice(0, 2, { d: Math.min(a.d, b.d), n: +(a.n + b.n).toFixed(6), coalesced: true });
  }
  return arr;
}
// 취득 — 같은 날이면 그 로트에 더하고, 다른 날이면 **새 로트**(병합 금지).
function note(p, item, n, day) {
  if (!isLot(item) || !(n > 0)) return null;
  const arr = of(p, item), d = _day(day);
  const hit = arr.find((l) => l.d === d);
  if (hit) hit.n = +(hit.n + n).toFixed(6);
  else arr.push({ d, n: +(+n).toFixed(6) });
  arr.sort((x, y) => x.d - y.d);
  return _cap(arr);
}
// ★인벤과 장부를 맞춘다 — 로트를 안 거친 경로가 인벤을 건드려도 스스로 낫는다.
//   남으면 **오늘 얻은 것**으로 잡고(알고 하는 근사), 모자라면 **오래된 것부터** 뺀다.
function reconcile(p, item, inventory, day) {
  if (!isLot(item)) return null;
  const arr = of(p, item);
  const have = Math.max(0, Math.floor(Number((inventory || {})[item]) || 0));
  let s = sum(p, item);
  if (Math.floor(s + CFG.EPS) < have) { note(p, item, have - Math.floor(s + CFG.EPS), day); s = sum(p, item); }
  else if (Math.floor(s + CFG.EPS) > have) {
    let over = Math.floor(s + CFG.EPS) - have;
    while (over > CFG.EPS && arr.length) {
      const take = Math.min(over, arr[0].n);
      arr[0].n = +(arr[0].n - take).toFixed(6); over -= take;
      if (arr[0].n <= CFG.EPS) arr.shift();
    }
  }
  if (!arr.length) delete all(p)[item];
  return arr;
}
// 소비 — **오래된 로트부터**. 소수 소비 허용(한 입 0.25단위).
//   반환: { taken, ages:[{d,n}] } · 인벤은 `floor(Σ)` 로 맞춘다.
function consume(p, item, amount, inventory, day) {
  if (!isLot(item)) return { taken: 0, ages: [] };
  reconcile(p, item, inventory, day);
  const arr = of(p, item);
  let left = Math.max(0, Number(amount) || 0), taken = 0;
  const ages = [];
  while (left > CFG.EPS && arr.length) {
    const take = Math.min(left, arr[0].n);
    ages.push({ d: arr[0].d, n: +take.toFixed(6) });
    arr[0].n = +(arr[0].n - take).toFixed(6);
    left -= take; taken += take;
    if (arr[0].n <= CFG.EPS) arr.shift();
  }
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +taken.toFixed(6), ages };
}
// ★★[원장 승격 2026-08-30] **지목 소비** — 펼친 로트 줄 하나를 골라 버리는 길.
//   `consume` 은 오래된 것부터(FIFO)라 "3일 전 것만 버린다"를 표현할 수 없었다.
//   FIFO 를 없애는 게 아니라 **옆에 지목 경로를 하나 더** 낸다(먹기는 그대로 FIFO 가 맞다).
function consumeFrom(p, item, day, amount, inventory) {
  if (!isLot(item)) return { taken: 0 };
  const arr = of(p, item);
  const i = arr.findIndex((l) => l.d === _day(day));
  if (i < 0) return { taken: 0 };
  const take = Math.min(Math.max(0, Number(amount) || 0), arr[i].n);
  arr[i].n = +(arr[i].n - take).toFixed(6);
  if (arr[i].n <= CFG.EPS) arr.splice(i, 1);
  if (inventory) inventory[item] = Math.floor(sum(p, item) + CFG.EPS);
  if (!arr.length) delete all(p)[item];
  return { taken: +take.toFixed(6) };
}
// ★UI 가 그릴 것 — 로트가 있는 품목만. 원장과 같은 규약(클라가 표를 안 든다).
function viewAll(p, inventory, day) {
  const out = {};
  for (const item of Object.keys(all(p))) {
    const v = view(p, item, inventory, day);
    if (v && v.lots && v.lots.length) out[item] = v.lots;
  }
  return out;
}
// 표시용 — 겹쳐 보여 주되 펼치면 로트가 보인다("감자 4.2 (0.84kg)" → 로트별 나이).
function view(p, item, inventory, day) {
  if (!isLot(item)) return null;
  reconcile(p, item, inventory, day);
  const arr = of(p, item);
  if (!arr.length) return null;
  // ★[부패 배치 2026-08-31] 펼침에 **신선도 칸을 채운다** — 새 컴포넌트를 만들지 않는다.
  //   정비 배치가 파 둔 로트 펼침이 이미 `ageDays` 를 그리고 있었다. 그 옆에 두 칸을 더 낸다.
  return { item, total: sum(p, item),
           lots: arr.map((l) => {
             const ageDays = Math.max(0, _day(day) - l.d);
             const fresh = Spoil.freshnessOf(item, ageDays);
             return { day: l.d, n: l.n, ageDays, coalesced: !!l.coalesced,
                      fresh, stage: Spoil.stageOf(fresh) };
           }) };
}
function toSave(p) { const L = all(p); return Object.keys(L).length ? L : null; }
function fromSave(p, saved) {
  if (saved && typeof saved === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(saved)) {
      if (!Array.isArray(v)) continue;
      // ★`coalesced` 는 **참일 때만** 남긴다 — 거짓 키를 붙이면 저장 전후가 구조적으로 달라져
      //   "재접속을 넘어 그대로인가" 판정이 자기 직렬화 때문에 실패한다(1차 실행에서 실제로 그랬다).
      const arr = v.filter((l) => l && Number.isFinite(l.d) && l.n > 0)
        .map((l) => (l.coalesced ? { d: _day(l.d), n: +l.n, coalesced: true } : { d: _day(l.d), n: +l.n }));
      arr.sort((x, y) => x.d - y.d);
      if (arr.length) out[k] = _cap(arr);
    }
    p.lots = out;
  }
  return all(p);
}
module.exports = { CFG, LOT_CORE, _day, isLot, all, of, sum, note, reconcile, consume, consumeFrom, view, viewAll, toSave, fromSave };
