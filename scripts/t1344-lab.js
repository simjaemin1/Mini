'use strict';
// (@regress 없음 — 러너 밖 · T1344 랩 자 · 읽기만)
// === scripts/t1344-lab.js — 랩 세계(`econ-lab-real` · 51 곳) N 날 — 청동 · 대장장이 · 마을별 병기고 문 · 둘째 화물 · 식량 교역(손잡이는 env) ==========
//   쓰는 법: SEED_ALL=1 VILLAGE_MAX=51 [T1344_BRONZE_STOCK=1] [T1344_MIX_LOAD=1] [T1333_ALLOY_ORDER=1] node scripts/t1344-lab.js 100
//   → JSON 한 줄: 손잡이 · 합(청동 · 대장장이 · 사람 · 주조 문 닫힌 마을(종전 · 새) · 둘째 화물 줄 · 구리 둘째 화물 · 식량 교역) · 청동을 낸 마을 줄
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DAYS = +(process.argv[2] || 100);
process.argv = [process.argv[0], path.join(ROOT, 'scripts', 'econ-lab-real.js'), String(DAYS), '0'];
const _log = console.log; console.log = () => {};
let world; try { ({ world } = require(path.join(ROOT, 'scripts', 'econ-lab-real'))); } finally { console.log = _log; }
const v1 = require(path.join(ROOT, 'sim', 'economy-sim')), v2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const r3 = (x) => +(+x || 0).toFixed(3);
const tot = { bz: 0, sm: 0, pop: 0, fed: 0, shutOld: 0, shutNew: 0, mix2: 0, mixCu: 0, food: 0, rows: 0 };
const rows = [];
for (const v of world.villages) {
  const c = v.counts || {}, N = v.npcs.length || 0;
  tot.bz += v._bronzeWeaponMade || 0; tot.sm += c.smith || 0; tot.pop += N;
  const secF = v1._foodSecF(v), fed = secF > 0.45; if (fed) tot.fed++;
  const melee = (v.storage.weapon || 0) * (v._swordFrac != null ? v._swordFrac : 0.5);
  const cap = fed ? N * 0.72 * 0.45 : Math.max(2, (c.warrior || 0) * 1.2);
  const bz = (v1.T1344_BRONZE_STOCK && fed) ? v1._t1344BronzeStock(v) : melee;
  if ((c.smith || 0) > 0) { if (melee >= cap) tot.shutOld++; if (bz >= cap) tot.shutNew++; }
  if ((c.smith || 0) > 0 || (v._bronzeWeaponMade || 0) > 0) rows.push([v.name, N, c.smith || 0, r3(v._bronzeWeaponMade), r3(secF), r3(melee), r3(cap), v._t1344Q == null ? null : r3(v._t1344Q), r3(v.storage.copper), r3(v.storage.tin)]);
}
for (const r of (world.tradeLog || [])) {
  if (!r) continue; tot.rows++;
  if (r.sent2) { tot.mix2++; if (r.sent2.res === 'copper') tot.mixCu += +r.sent2.amt || 0; }
  const fv = (res, amt) => { const f = v1.storageFoodPer(world.villages[0], res); return f > 0 ? (+amt || 0) * f : 0; };
  if (r.sent) tot.food += fv(r.sent.res, r.sent.amt);
  if (r.sent2) tot.food += fv(r.sent2.res, r.sent2.amt);
  if (r.bought) tot.food += fv(r.bought.res, r.bought.amt);
}
for (const k of Object.keys(tot)) tot[k] = r3(tot[k]);
_log(JSON.stringify({ days: DAYS, knobs: { b: v1.T1344_BRONZE_STOCK, m: v2.T1344_MIX_LOAD, a: v1.T1333_ALLOY_ORDER }, tot, cols: ['name', 'pop', 'smith', 'bronzeW', 'secF', 'melee', 'cap', 'q', 'copper', 'tin'], rows }));
