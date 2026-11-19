'use strict';
// === 계측/T1309_2026-11-16/t1309-observe.js — 서버 몸 판 곁 관찰기(읽기만 · 세계 무변) ===
//   쓰는 법: NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … (판 JSON 곁 `<판>.t1309.json`)
//   5날마다(econ `tickVillage` 날 머리): 사람 · 마을 사람 가중 건강 · 다양성 · 행복(`lastStats`) · 곳간 로트 건강 셈(`granary-lots` stats — t1309Tag · TagU · EatU · EatH)
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1309.json' : '';
if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { knobs: { T1309: V1.T1309_HEALTH_EATEN, T1298H: V1.T1298_HEALTH, T1298L: V1.T1298_LEDGER, T1286: V1.T1286_COOK_SPARE }, rows: [], err: null };
let last = -1;
function snap(day) {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const G = require(path.join(ROOT, 'server', 'granary-lots'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, w = 0, h = 0, fg = 0, hp = 0, att = 0;
    for (const vil of (P.villages || [])) { const e = vil.econ; if (!e) continue; const n = (e.npcs || []).length; pop += n; if (G.attached(e)) att++;
      const L = e.lastStats; if (L && n > 0) { w += n; h += (+L.health || 0) * n; fg += (+L.foodGroups || 0) * n; hp += (+L.happiness || 0) * n; } }
    const S = G.stats(false) || {};
    rec.rows.push({ day, pop, attached: att, health: w ? +(h / w).toFixed(4) : null, fg: w ? +(fg / w).toFixed(4) : null, happy: w ? +(hp / w).toFixed(4) : null,
      tag: S.t1309Tag || 0, tagU: +(S.t1309TagU || 0).toFixed(2), eatU: +(S.t1309EatU || 0).toFixed(2), eatH: +(S.t1309EatH || 0).toFixed(3) });
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { last = day; if (day % 5 === 0) { snap(day); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} } }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { snap(last); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
