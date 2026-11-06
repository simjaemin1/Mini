'use strict';
// (@regress 없음 — 러너 밖 · T1149 관찰기 · 읽기만 · 제품 손잡이 0)
// === scripts/t1149-observe.js — 겨울 골짜기 관찰기(서버 판 자 곁 프리로드 · T1141 관찰기와 같은 자리 · 같은 문법) ===
//   쓰는 법: NODE_OPTIONS="-r scripts/t1149-observe.js" T577_TAG=base T577_DIR=<판> node scripts/t577-server-run.js 800 <시드>  ⇒ <판>/base-<시드>.t1149.json
//   장부 `scanDay`(econ 하루 끝)에서 마을 × 날 한 줄 — econ 이 그날 적어 둔 칸을 읽기만 한다(사본 0 · 새 수 0):
//     인구 · 곳간 식량 환산(`totalFoodEquivalent`) · K 와 그 셋(`_dpDebug.K` · `_kDbg` 자리 · 식량 흐름 · 땔감) · 침상(min(주거, 지은 침상)) ·
//     누계 식량 수입(`tradeStats.foodImported`) · 누계 죽음(`_deadTot`) · 누계 출생(명부에 처음 보는 사람) ·
//     그날 길 위 식량 캐러밴 — 이 마을로 오는 것(나간 짐이 식량 · 돌아오는 짐이 식량) · 이 마을에서 식량을 내가는 것 · 그날 식량 값(`_priceCache.food`) ·
//     식량 흐름 EMA(`surplusEMA.food`) · 한랭(`_coldStress`) · 로지스틱 항(`_dpDebug.logi`) · [T1179] 밭에 선 먹을 것(`t1179Standing`) · 보존식 재고(`PRESERVED_FOODS` 합)
//   표 기계 `scripts/t1149-table.js`.
const path = require('path'), fs = require('fs');
if (!process.env.T577_SEED) return;
const OUT = process.env.T1149_OUT || (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1149.json' : '');
let ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, 'server', 'events.js'))) ROOT = path.join(path.dirname(process.argv[1] || ''), '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const FOODR = { food: 1, fish: 1, meat: 1, cooked_food: 1, rice: 1, wheat: 1, barley: 1 };
const COLS = ['pop', 'tfe', 'K', 'kSlot', 'kProd', 'kFuel', 'hcap', 'imp', 'dead', 'born', 'carIn', 'carOut', 'pFood', 'sEma', 'cold', 'logi', 'banditized', 'pool', 'pres'];
const rec = { root: ROOT, cols: COLS, names: null, land: null, rows: [], errs: 0, err0: null };
const r2 = (x) => (x == null || !isFinite(+x)) ? null : Math.round((+x) * 100) / 100;
const SEEN = new WeakSet(), BORN = new Map();
let last = -1;
function snap(world, day) {
  if (day === last) return; last = day;
  const V = world.villages || [];
  const first = !rec.names;
  if (first) {
    rec.names = V.map((v) => v.name);
    rec.land = V.map((v) => { const L = v.land || {}; return { fertility: r2(L.fertility), water: r2(L.water), wood: r2(L.wood), game: r2(L.game), stone: r2(L.stone), ore: r2(L.ore) }; });
  }
  for (const v of V) for (const p of (v.npcs || [])) if (!SEEN.has(p)) { SEEN.add(p); if (!first) BORN.set(v, (BORN.get(v) || 0) + 1); }
  const cin = new Map(), cout = new Map();
  for (const c of (world.caravans || [])) {
    if (!c) continue;
    if (c.state === 'outbound' && FOODR[c.giveRes]) { cin.set(c.to, (cin.get(c.to) || 0) + 1); cout.set(c.from, (cout.get(c.from) || 0) + 1); }
    if (c.state === 'inbound' && FOODR[c._returningRes]) cin.set(c.from, (cin.get(c.from) || 0) + 1);
  }
  const row = V.map((v) => {
    const T = v.tradeStats || {}, kd = v._kDbg || {}, dd = v._dpDebug || {};
    let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = -1; }
    const hcap = Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity);
    return [(v.npcs || []).length, r2(tfe), r2(dd.K), r2(kd.slot), r2(kd.prod), r2(kd.fuel), isFinite(hcap) ? r2(hcap) : null, r2(T.foodImported), v._deadTot || 0, BORN.get(v) || 0,
      cin.get(v) || 0, cout.get(v) || 0, r2(v._priceCache && v._priceCache.food), r2(v.surplusEMA && v.surplusEMA.food), r2(v._coldStress), r2(dd.logi), v._banditized ? 1 : 0,
      r2(V1.t1179Standing ? V1.t1179Standing(v) : 0), r2((V1.PRESERVED_FOODS || []).reduce((a, k) => a + ((v.storage || {})[k] || 0), 0))];
  });
  rec.rows.push([day, row]);
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { snap(world, day | 0); } catch (e) { rec.errs++; if (!rec.err0) rec.err0 = String(e && e.stack || e).slice(0, 300); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
