'use strict';
// (@regress 없음 — 러너 밖 · T1479 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1479-observe.js — 붓는 쪽(주조)을 날마다: 대장장이 · 일손 · 숯 · 구리 · 주석 · 그날 부은 것 · 붓지 않은 까닭의 문 + 농촌 먹을 것 들어온 길 [T1479 · S13 · 2026-11-24] ======
//   쓰는 법(랩): T1479_OUT=<out.json> NODE_OPTIONS="… -r $PWD/scripts/t1385-lab-probe.js -r $PWD/scripts/t1407-observe.js -r $PWD/scripts/t1479-observe.js" node scripts/t17-metrics.js <날수> <시드>
//   ⚠싣는 차례: **맨 뒤**(t1475 와 같은 까닭 — 주조 훅 `world.onCast` 를 세계마다 한 번 감싸 사슬 맨 안에 선다).
//   ⚠값을 바꾸지 않는다. 곳간 · 상태 · 장부는 읽기만 · 부르는 함수는 읽기 함수뿐(`_foodSecF` · `_alloyMelt`(배합 탐색 — 곳간에서 값 몫만 셈) · `storageFoodPer`).
//   ■ 주조 문(sim/economy-sim.js `produceSpecial === 'smith'` 갈래, 약 5512 ~ 5560행)을 그대로 옮긴 날치 칸:
//      ① 대장장이 0            : 마을 `counts.smith` == 0 (이 갈래를 돌 사람이 없다)
//      ② 구리 0 · 배합 못 짬   : `_alloyMelt(v)` == null (곳간 구리 ≤ 0.01 이거나 한 번 부을 재료 0.15 가 모자라 배합이 하나도 안 선다)
//      ③ 목표 참              : `(곳간 근접검 몫) ≥ 병기고 한도` — 한도 = (식량안보 secF > 0.45 이거나 T1385_POOR) ? N × 0.72 × T1385_FRAC : max(2, 전사 × 1.2) · 곳간 근접검 몫 = weapon × _swordFrac
//                                (T1344_BRONZE_STOCK 켬 · secF > 0.45 · 배합이 청동이면 청동 근접검 몫 `_t1344BronzeStock` 으로 잰다 — 옮겨 센다)
//      ④ 값 문               : **주조 갈래에 값을 보는 문이 없다**(배합 탐색은 이윤 최대 배합을 고를 뿐 거절하지 않는다). 값 문은 수출 주조(`_t1333ExportCast` · 환경 T1333_EXPORT_CAST=1)뿐인데
//                                그 문은 병기고 한도가 찬 뒤 한 번 더 열 뿐이다. 이 관찰기는 그 문을 못 부른다(비공개 함수 · 이웃 순수출가 주입 필요) → 한도가 찬 날 수출 문이 켜져 있으면 "계측 없음".
//      ⑤ 숯                  : **주조 갈래는 숯을 읽지 않는다.** 숯은 제련(`_trySmelt` → `smeltFuelTake`)에서만 든다. 곳간 숯을 날마다 적기만 한다(숯 0 이 주조를 막는 문은 없다).
//      ⑥ 일손이 다른 일로      : 대장장이는 있고 ②③ 이 안 걸리는데도 안 부은 날 — 그날 제련(`_smeltedTotal` 날 차)이 있으면 "제련에 일손"(하루를 제련에 쓴 대장장이는 주조 안 함 · 코드 5538 ~ 5545행), 없으면 "계측 없음"(그 밖 막은 못 본다).
//   ■ 칸 키: 행의 날 d = **그 날 하루가 끝난 곳간 · 그날 부은 것**(관찰기는 이튿날 첫 마을 틱에서 뜬다 — 틱 앞 끝 상태). 곳간 문턱(구리 0.01 · 주석 0.12)은 하루 안에서 움직여 날치 끝 상태로는 근사다.
//   ■ 먹을 것 들어온 길(T1479_FEED=<마을>): 교역 장부 새 줄에서 그 마을로 먹을 것(식량 환산 `storageFoodPer`)을 낸 마을 · 날 · 양 · 줄 수 + (T1479_ALL=1 이면) 모든 마을의 날치 가벼운 칸.
//      장부 줄의 날 = 배가 B 에 닿은 날 + 1. 줄 하나에 가는 바구니(A → B)와 되가져 오는 바구니(B → A)가 같이 있고, 되가져 오는 짐은 집에 닿는 날이 더 뒤다 — 줄의 날로 적는다(도착 날 아님).
const path = require('path'), fs = require('fs');
const OUT = process.env.T1479_OUT || ''; if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const VILS = (process.env.T1479_VILS || '광산5,임업2').split(',');
const FEED = process.env.T1479_FEED || '';
const ALL = process.env.T1479_ALL === '1';
const FROM = +(process.env.T1479_FROM || 0), TO = process.env.T1479_TO ? +process.env.T1479_TO : Infinity;
const r4 = (x) => (x == null || !isFinite(+x) ? null : +(+x).toFixed(4));
const ENVF = ['T1333_EXPORT_CAST', 'T1385_ARMORY', 'T1385_TINGATE', 'T1385_POOR', 'T1344_BRONZE_STOCK', 'T1226_JOB_FLEX', 'T1420_EQ'];
const COLS = ['N', 'smith', 'miner', 'mason', 'farmer', 'fisher', 'hunter', 'lumberjack', 'forager', 'warrior',
  'charcoal', 'copper', 'tin', 'oreTin', 'oreCu', 'bronze',
  'castN', 'castAmt', 'castBz', 'castTin', 'castPureCu', 'castOth', 'stoneMade', 'ironMade', 'smelted',
  'weapon', 'swordFrac', 'melee', 'bronzeS', 'secF', 'stock', 'cap', 'full', 'meltOk', 'meltTin', 'fdDead'];
const LCOLS = ['N', 'smith', 'farmer', 'fisher', 'hunter', 'lumberjack', 'forager', 'miner', 'foodDays', 'foodStock', 'secF', 'fdDead', 'weapon', 'copper', 'tin'];
const rec = { cols: COLS, lcols: LCOLS, vils: VILS, feed: FEED, flags: {}, consts: {}, names: null, day: {}, light: {}, feedIn: {}, legs: {}, err: null };
for (const k of ENVF) rec.flags[k] = process.env[k] == null ? null : process.env[k];
for (const k of ['T1385_FRAC', 'T1385_BZ', 'T1344_BRONZE_STOCK', 'T1333_EXPORT_CAST', 'T1385']) { try { rec.flags['eng.' + k] = typeof V1[k] === 'object' ? JSON.stringify(V1[k]) : V1[k]; } catch (e) { /* 자리 */ } }
let W = null, lastDay = null, ready = false;
const CAST = new Map(), HOOKED = new WeakSet(), SEEN = new WeakSet(), FP = new Map(), PREV = new Map();
function hook(w) {
  if (HOOKED.has(w)) return; HOOKED.add(w);
  const inner = w.onCast || null;
  const f = function (v, m, amt) {
    try {
      const c = CAST.get(v.name) || [0, 0, 0, 0, 0, 0]; const a = +amt || 0, t = (m && m.take) || {};
      c[0] += 1; c[1] += a; c[2] += a * (+(m && m.bronzeness) || 0); c[3] += +t.tin || 0;
      if (!(+t.tin > 0) && !(+t.lead > 0) && !(+t.silver > 0) && !(+t.gold > 0)) c[4] += a;   // 순동(구리만)
      c[5] += (+t.lead || 0) + (+t.silver || 0) + (+t.gold || 0);
      CAST.set(v.name, c);
    } catch (e) { rec.err = rec.err || ('cast ' + String(e && e.stack || e).slice(0, 300)); }
    if (inner) return inner.apply(this, arguments);
  };
  w.onCast = f;
}
function foodPer(res) {
  if (FP.has(res)) return FP.get(res);
  let f = 0; try { f = +V1.storageFoodPer((W && W.villages && W.villages[0]) || { storage: {}, npcs: [] }, res) || 0; } catch (e) { f = 0; }
  if (!(f > 0)) f = 0; FP.set(res, f); return f;
}
function feedLegs() {   // 교역 장부 새 줄 — FEED 마을로 먹을 것이 가는 줄(가는 바구니 A → B · 되가져 오는 바구니 B → A)
  const L = W && W.tradeLog; if (!FEED || !Array.isArray(L) || !L.length) return;
  let i = L.length - 1; while (i >= 0 && !SEEN.has(L[i])) i--;
  const mark = (d, from, a, legs) => { const T = rec.feedIn[d] || (rec.feedIn[d] = {}); const x = T[from] || (T[from] = [0, 0]); x[0] += a; x[1] += legs; };
  for (let j = i + 1; j < L.length; j++) {
    const r = L[j]; if (!r || typeof r !== 'object') continue; SEEN.add(r);
    const d = r.day | 0;
    if (r.from === FEED || r.to === FEED) {   // 줄 수(품목 가리지 않음) — FEED 가 낸 쪽(from) · 받는 쪽(to) · 빈손 귀환(abandoned)
      const o = r.from === FEED ? r.to : r.from, T = rec.legs[d] || (rec.legs[d] = {}), x = T[o] || (T[o] = [0, 0, 0]);
      if (r.from === FEED) x[0]++; else x[1]++;
      if (r.abandoned) x[2]++;
    }
    const one = (res, amt, from, to) => { if (to !== FEED || !res || !(amt > 0)) return; const fe = foodPer(res); if (fe > 0) mark(d, from, fe * amt, 1); };
    if (!r.abandoned) {
      if (Array.isArray(r.basket)) { for (const it of r.basket) { if (it) one(it.res, +it.amt, r.from, r.to); } }
      else { if (r.sent) one(r.sent.res, +r.sent.amt, r.from, r.to); if (r.sent2) one(r.sent2.res, +r.sent2.amt, r.from, r.to); }
    }
    if (Array.isArray(r.retBasket)) { for (const it of r.retBasket) { if (it) one(it.res, +it.amt, r.to, r.from); } }
    else if (r.bought) one(r.bought.res, +r.bought.amt, r.to, r.from);
  }
}
function snap(day) {
  const vils = (W && W.villages) || []; if (!vils.length) return;
  if (!rec.names) rec.names = vils.map((v) => v.name);
  feedLegs();
  const dd = day - 1, inWin = dd >= FROM && dd <= TO;
  const rows = {}, lrows = {};
  for (const v of vils) {
    const name = v.name, N = (v.npcs || []).length, cnt = v.counts || {}, st = v.storage || {};
    const cst = CAST.get(name) || [0, 0, 0, 0, 0, 0]; CAST.delete(name);
    const p = PREV.get(name) || [0, 0, 0]; const stoneC = +v._stoneWeaponMade || 0, ironC = +v._ironWeaponMade || 0, smT = +v._smeltedTotal || 0;
    PREV.set(name, [stoneC, ironC, smT]);
    if (!inWin || !N) continue;
    const isSub = VILS.includes(name);
    if (!isSub && !ALL) continue;
    let secF = null, fe = null;
    try { secF = V1._foodSecF(v); } catch (e) { /* 자리 */ }
    try { fe = V1.totalFoodEquivalent(v); } catch (e) { /* 자리 */ }
    if (ALL) lrows[name] = [N, cnt.smith || 0, cnt.farmer || 0, cnt.fisher || 0, cnt.hunter || 0, cnt.lumberjack || 0, cnt.forager || 0, cnt.miner || 0, r4(fe != null ? fe / Math.max(1, N) : null), r4(st.food), r4(secF), v._fdDeadTot || 0, r4(st.weapon), r4(st.copper), r4(st.tin)];
    if (!isSub) continue;
    let melt = null; try { melt = V1._alloyMelt(v); } catch (e) { rec.err = rec.err || ('melt ' + String(e && e.stack || e).slice(0, 300)); }
    const F = V1.T1385_FRAC != null ? V1.T1385_FRAC : 0.45, poor = !!(V1.T1385 && V1.T1385.poor), secOk = (secF != null && secF > 0.45) || poor;
    const sf = v._swordFrac != null ? v._swordFrac : 0.5, melee = (+st.weapon || 0) * sf;
    // 곳간 근접검 몫(주조 문이 잰 수): 청동 몫 장부 켬 · 잘 먹는 마을 · 배합이 청동이면 `v._t1344Q` 로 센 청동 근접검 몫(읽기), 아니면 근접검 전부
    const q = Math.max(0, Math.min(1, +v._t1344Q || 0));
    const useBz = !!(V1.T1344_BRONZE_STOCK && secF != null && secF > 0.45 && melt && melt.bronzeness > 0);
    const stock = useBz ? melee * q : melee;
    const cap = secOk ? N * 0.72 * F : Math.max(2, (cnt.warrior || 0) * 1.2);
    rows[name] = [N, cnt.smith || 0, cnt.miner || 0, cnt.mason || 0, cnt.farmer || 0, cnt.fisher || 0, cnt.hunter || 0, cnt.lumberjack || 0, cnt.forager || 0, cnt.warrior || 0,
      r4(st.charcoal), r4(st.copper), r4(st.tin), r4(st.ore_tin), r4(st.ore_copper), r4(st.bronze),
      cst[0], r4(cst[1]), r4(cst[2]), r4(cst[3]), r4(cst[4]), r4(cst[5]), r4(Math.max(0, stoneC - p[0])), r4(Math.max(0, ironC - p[1])), r4(Math.max(0, smT - p[2])),
      r4(st.weapon), r4(sf), r4(melee), r4(melee * q), r4(secF), r4(stock), r4(cap), stock >= cap ? 1 : 0, melt ? 1 : 0, melt ? r4((melt.take || {}).tin || 0) : null, v._fdDeadTot || 0];
  }
  if (inWin) { if (Object.keys(rows).length) rec.day[dd] = rows; if (ALL) rec.light[dd] = lrows; }
  if (day % 100 === 0) write();
}
function write() { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) { /* 자리 */ } }
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try {
    if (!W && v && v._world) W = v._world;
    if (W) hook(W);
    if (day !== lastDay) { lastDay = day; if (ready) snap(day); ready = true; }
  } catch (e) { rec.err = rec.err || ('snap ' + String(e && e.stack || e).slice(0, 400)); }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { if (W) feedLegs(); write(); } catch (e) { /* 자리 */ } });
