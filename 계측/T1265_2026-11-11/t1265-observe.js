'use strict';
// === 계측/T1265_2026-11-11/t1265-observe.js — 서버 판 곁 관찰기(읽기만 · 세계 무변): 곳간 증설 · 전쟁 식량 추정이 바꾼 것 ===
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … (판 JSON 곁 `<판>.t1265.json`)
//   20날마다(econ `tickVillage` 날 머리): 인구 · 곳간 동 수(`vil._granList` 합) · 착공 중 · 곳간 식량 합계 · `food` 칸 합 · 전쟁 누계(`world._warStats` — 선전포고 · 전투 · 조공 · 항복 · 철수 · 몸값 · 사유별)
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1265.json' : '';
if (!OUT) return;
const ROOT = '/home/user/Mini';
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { rows: [], err: null };
let last = -1, W0 = null;
function snap(day, world) {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, gran = 0, pend = 0, feq = 0, food = 0, vils = 0;
    for (const vil of (P.villages || [])) { const e = vil.econ; if (!e) continue; const n = (e.npcs || []).length; pop += n; if (n) vils++;
      gran += (vil._granList || []).length; if (vil._granPend) pend++; try { feq += +V1.totalFoodEquivalent(e) || 0; } catch (x) {} food += (e.storage && e.storage.food) || 0; }
    const W = (world && world._warStats) || {};
    const war = {}; for (const k of ['decl', 'battle', 'atkWin', 'defWin', 'cas', 'loot', 'tribute', 'tributes', 'siege', 'assault', 'withdraw', 'surrender', 'sortie', 'walkover', 'captured', 'ransomed']) war[k] = W[k] || 0;
    war.byCasus = W.byCasus || null;
    rec.rows.push({ day, pop, vils, gran, pend, feq: Math.round(feq), food: Math.round(food), war });
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  W0 = v._world || W0;
  if (day !== last) { last = day; if (day % 20 === 0) { snap(day, v._world); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} } }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { snap(last, W0); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
