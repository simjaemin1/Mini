'use strict';
// (@regress 없음 — 러너 밖 · T1276 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1276-observe.js — 밭 세계 출생 막힘: 날마다 K 세 몫(`_kDbg` slot · prod · fuel) · K 를 정한 몫 · 인구 · 출생 누적(`_dPAccum`) · 볏짚 밑변 ===
//   서버 판 자: NODE_OPTIONS="-r $PWD/scripts/t1276-observe.js" node scripts/t577-server-run.js <날> <시드>   (판 JSON 곁 `<판>-<시드>.t1276.json`)
//   랩 자:      T1276_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1276-observe.js" node scripts/t176-ab.js 800 1020
//   날마다(세계 합 · 마을 틱 뒤에 읽는다): 인구 · Σslot · Σprod · Σfuel · ΣK(min) · K 를 정한 몫별 마을 수와 그 마을 인구 · N ≥ 0.95K 인 마을 수 ·
//     Σ`_grainToday`(그날 거둔 곡식 — 볏짚 밑변 · 틱이 비우기 전 값) · Σ곳간 식량 환산 · 농부 수
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1));
const OUT = process.env.T1276_OUT || (SERVER && process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1276.json' : '');
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'vils', 'pop', 'slot', 'prod', 'fuel', 'K', 'bySlot', 'byProd', 'byFuel', 'popSlot', 'popProd', 'popFuel', 'atK', 'grain', 'tfe', 'farmer', 'born', 'lumber', 'sur', 'stand', 'h365', 'cells', 'harvN', 'fdDead', 'natDead', 'dead'], rows: [], err: null, vil: {} };
let cur = null, curDay = -1;
function flush() {
  if (!cur) return;
  rec.rows.push(rec.cols.map((c) => c === 'day' ? curDay : +(+(cur[c] || 0)).toFixed(2)));
  if (curDay % 5 === 0) try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {}
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  const g0 = v ? (v._grainToday || 0) : 0, n0 = v && v.npcs ? v.npcs.length : 0, b0 = v ? (v._bornTot || 0) : 0;
  const r = _t.apply(this, arguments);
  try {
    if (day !== curDay) { flush(); cur = {}; curDay = day; }
    const k = v._kDbg; const n = (v.npcs || []).length;
    if (n > 0 && k) {
      const K = Math.min(k.slot, k.prod, k.fuel);
      cur.vils = (cur.vils || 0) + 1; cur.pop = (cur.pop || 0) + n;
      cur.slot = (cur.slot || 0) + k.slot; cur.prod = (cur.prod || 0) + k.prod; cur.fuel = (cur.fuel || 0) + k.fuel; cur.K = (cur.K || 0) + K;
      const by = K === k.slot ? 'Slot' : K === k.prod ? 'Prod' : 'Fuel';
      cur['by' + by] = (cur['by' + by] || 0) + 1; cur['pop' + by] = (cur['pop' + by] || 0) + n;
      if (n >= 0.95 * K) cur.atK = (cur.atK || 0) + 1;
      cur.grain = (cur.grain || 0) + g0;
      cur.tfe = (cur.tfe || 0) + (V1.totalFoodEquivalent ? V1.totalFoodEquivalent(v) : 0);
      cur.farmer = (cur.farmer || 0) + ((v.counts && v.counts.farmer) || 0);
      cur.lumber = (cur.lumber || 0) + ((v.counts && v.counts.lumberjack) || 0);
      cur.born = (cur.born || 0) + Math.max(0, n - n0);
      cur.sur = (cur.sur || 0) + ((v.surplusEMA && v.surplusEMA.food) || 0);
      cur.stand = (cur.stand || 0) + (v._t1276Stand || 0); cur.cells = (cur.cells || 0) + (v._fieldCells || 0); cur.harvN = (cur.harvN || 0) + (v._t100HarvestN || 0); cur.h365 = (cur.h365 || 0) + (v._t1276H || 0); cur.fdDead = (cur.fdDead || 0) + (v._fdDeadTot || 0); cur.natDead = (cur.natDead || 0) + (v._natDeadTot || 0); cur.dead = (cur.dead || 0) + (v._deadTot || 0);   // ★[T1284] 죽음 누계(굶음 · 자연 · 전부 — 읽기만)
      if (day % 50 === 0) (rec.vil[day] = rec.vil[day] || []).push([v.name, n, k.slot, k.prod, k.fuel, +(v._dPAccum || 0).toFixed(3), +g0.toFixed(2)]);
    }
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  return r;
};
process.on('exit', () => { flush(); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} });
