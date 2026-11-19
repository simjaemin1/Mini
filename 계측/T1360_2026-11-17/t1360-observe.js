'use strict';
// === 계측/T1360_2026-11-17/t1360-observe.js — 서버 몸 판 곁 관찰기(읽기만 · 세계 무변 · T1309 관찰기 꼴) ===
//   쓰는 법: T1360_OBS=<out.json> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --seeds <한 시드>
//   날마다: 기근 마을-날(`totalFoodEquivalent < 사람×30` — 랩 자 t176-ab 와 같은 정의) · 로트 적기(모두 · 건강 > 0 · 품목) · 먹은 로트(건강 > 0 단위)
//   5날마다: 사람 · 사람 가중 건강 · 다양성 · 행복(`lastStats`) · 요리사 수(`counts.cook`) · 로트 붙은 마을
//   로트 셈은 `granary-lots` 내보낸 `tagH` · `eatEnd` 를 감싸 센다(돌려주는 값 · 인자 그대로 — 세계 무변)
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T1360_OBS; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const G = require(path.join(ROOT, 'server', 'granary-lots'));
const rec = { seed: +process.env.T577_SEED, knobs: { T1260: V1.T1260_FOOD_READS, T1298L: V1.T1298_LEDGER, T1298H: V1.T1298_HEALTH, T1279: V1.T1279_COOK, T1286: V1.T1286_COOK_SPARE, MOVE: V1.T1309_MOVE_CONS, HEALTH: V1.T1309_HEALTH_EATEN, DIV: V1.T1309_DIVERSITY_EATEN },
  days: [], snaps: [], err: null };
let cur = null, last = -1;
const day0 = (d) => ({ day: d, famine: 0, vill: 0, tag: 0, tagH: 0, tagHU: 0, tagItems: {}, eatHU: 0, eatHS: 0 });
const _tag = G.tagH;
G.tagH = function (v, res, du, h) { const ok = _tag.apply(this, arguments); if (ok && cur) { cur.tag++; cur.tagItems[res] = (cur.tagItems[res] || 0) + 1; if (h > 0) { cur.tagH++; cur.tagHU += du; } } return ok; };
const _end = G.eatEnd;
G.eatEnd = function (v) { const m = _end.apply(this, arguments); if (m && cur) for (const k in m) { if (m[k][0] > 0) { cur.eatHU += m[k][1]; cur.eatHS += m[k][0]; } } return m; };
function snap(day) {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, w = 0, h = 0, fg = 0, hp = 0, att = 0, cooks = 0;
    for (const vil of (P.villages || [])) { const e = vil.econ; if (!e) continue; const n = (e.npcs || []).length; pop += n; if (G.attached(e)) att++; cooks += (e.counts && e.counts.cook) || 0;
      const L = e.lastStats; if (L && n > 0) { w += n; h += (+L.health || 0) * n; fg += (+L.foodGroups || 0) * n; hp += (+L.happiness || 0) * n; } }
    rec.snaps.push({ day, pop, attached: att, cooks, health: w ? +(h / w).toFixed(4) : null, fg: w ? +(fg / w).toFixed(4) : null, happy: w ? +(hp / w).toFixed(4) : null });
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { if (cur) rec.days.push(cur); last = day; cur = day0(day); if (day % 5 === 0) { snap(day); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} } }
  try { const n = (v.npcs || []).length; if (n > 0) { cur.vill++; if (V1.totalFoodEquivalent(v) < n * 30) cur.famine++; } } catch (e) {}
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { if (cur) rec.days.push(cur); snap(last); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
