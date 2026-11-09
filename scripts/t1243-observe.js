'use strict';
// (@regress 없음 — 러너 밖 · T1243 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1243-observe.js — 밭 세계 켬 판: 날마다 세계 합 — 서버 판 자(`t577-server-run.js`) 곁 프리로드 =====================
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1243-observe.js" node scripts/t577-server-run.js 100 1020   (판 JSON 곁 `<판>-<시드>.t1243.json`)
//   날마다(econ `tickVillage` 첫 마을 머리): 인구 · 사람 있는 마을 · 곳간 식량등가(`totalFoodEquivalent`) · 거둔 건수(`_t100HarvestN`) ·
//     거둔 낱개 → kg(`_t368InByItem` × 작물 `kgOf`) · 작물 없는 수확(`_t1243NoCrop`) · 몸 농부 · econ 농부 · 나무꾼
//   첫날: 마을마다 첫 곳간 품목(`_t1243Seed`) · 끝: `_t1243Stat` · `_t1221Stat` · `_t1212Rest`(일괄이 정말 0 인가)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1243.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { cols: ['day', 'pop', 'vils', 'tfe', 'harvN', 'kg', 'noCrop', 'bodyFarmer', 'econFarmer', 'lumber', 'bodies'], rows: [], seed: null, stat: null, err: null };
let last = -1, VIL = null, C = null;
function snap(day) {
  if (!VIL) { VIL = require(path.join(ROOT, 'server', 'villages')); C = require(path.join(ROOT, 'server', 'crops')); }
  const P = VIL.__labProbe._t569Probe.setup(), B = VIL.__p3Bind({});
  const players = (B.state.deps && B.state.deps.players) || new Map();
  let pop = 0, vils = 0, tfe = 0, harvN = 0, kg = 0, noCrop = 0, bf = 0, ef = 0, lj = 0, bodies = 0;
  for (const vil of (P.villages || [])) {
    const e = vil.econ || {}, n = (e.npcs || []).length;
    pop += n; if (n) vils++;
    tfe += V1.totalFoodEquivalent ? V1.totalFoodEquivalent(e) : 0;
    harvN += e._t100HarvestN || 0; noCrop += e._t1243NoCrop || 0;
    for (const [id, u] of Object.entries(e._t368InByItem || {})) kg += u * (C.kgOf(id) || 0);
    ef += (e.counts && e.counts.farmer) || 0; lj += (e.counts && e.counts.lumberjack) || 0;
    for (const pid of (vil.npcPids || [])) { const p = players.get(pid); if (!p) continue; bodies++; if (p.simJob === 'farmer') bf++; }
  }
  rec.rows.push([day, pop, vils, +tfe.toFixed(1), harvN, +kg.toFixed(1), noCrop, bf, ef, lj, bodies]);
  if (!rec.seed) rec.seed = (P.villages || []).map((v) => ({ n: v.name, pop: ((v.econ || {}).npcs || []).length, s: (v.econ || {})._t1243Seed || null }));
  rec.stat = { t1243: B._t1243Stat || null, t1221: B._t1221Stat || null, rest: B._t1212Rest || null, t1224: B._t1224Stat || null, pick: B._t1243PStat || null };
  if (day % 10 === 0) rec.crops = (P.villages || []).map((v) => { const by = {}; for (const e of (v._crop || new Map()).values()) if (e && e.c) by[e.c] = (by[e.c] || 0) + 1; const pv = {}; for (const x of ((v._t1243Prev || new Map()).values())) pv[x.c] = (pv[x.c] || 0) + 1;
    const sd = {}; for (const [k, n] of Object.entries((v.econ || {}).storage || {})) if (/^seed_|_seed$|씨/.test(k) || (C.seedOf && k.startsWith(C.seedOf('')))) sd[k] = +(+n).toFixed(2);
    return { n: v.name, f: +((((v.econ || {}).land || {}).fertility) || 0).toFixed(3), farm: v._farmSet ? v._farmSet.size : 0, dry: v._drySet ? v._drySet.size : 0, stand: by, prev: pv, seed: sd, day }; });
  if (day % 5 === 0) fs.writeFileSync(OUT, JSON.stringify(rec));
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; snap(day); } } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }
  return _t.apply(this, arguments);
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} });
