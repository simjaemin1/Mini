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
// ⚠**부패 곡선·상함 판정·보존 가공(말리기·훈제·절임)은 이번이 아니다**(재민 확정).
//   여기까지가 그 층이 앉을 자리다 — 취득일이 남으니, 곡선은 나중에 **조회 함수 하나**로 얹힌다.
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

// ── 로트로 관리할 품목 ──────────────────────────────────────────────────────
//   상하는 식품만. 돌·장작·섬유는 무기한 벌크라 로트가 없다(나이가 뜻이 없다).
let Specialty = null;
try { Specialty = require('./specialty'); } catch (e) { Specialty = null; }
const LOT_CORE = new Set(['food', 'berry', 'fruit', 'vegetable', 'meat', 'meat_raw', 'meat_cooked',
  'fish', 'fish_cooked', 'berry_jam', 'cooked_food', 'mushroom', 'milk', 'egg', 'cheese', 'bread']);
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
  const arr = of(p, item), d = day | 0;
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
// 표시용 — 겹쳐 보여 주되 펼치면 로트가 보인다("감자 4.2 (0.84kg)" → 로트별 나이).
function view(p, item, inventory, day) {
  if (!isLot(item)) return null;
  reconcile(p, item, inventory, day);
  const arr = of(p, item);
  if (!arr.length) return null;
  return { item, total: sum(p, item),
           lots: arr.map((l) => ({ day: l.d, n: l.n, ageDays: Math.max(0, (day | 0) - l.d), coalesced: !!l.coalesced })) };
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
        .map((l) => (l.coalesced ? { d: l.d | 0, n: +l.n, coalesced: true } : { d: l.d | 0, n: +l.n }));
      arr.sort((x, y) => x.d - y.d);
      if (arr.length) out[k] = _cap(arr);
    }
    p.lots = out;
  }
  return all(p);
}
module.exports = { CFG, LOT_CORE, isLot, all, of, sum, note, reconcile, consume, view, toSave, fromSave };
