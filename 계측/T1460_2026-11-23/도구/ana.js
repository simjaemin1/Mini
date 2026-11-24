// ana.js — T1460 판 표: node ana.js <runs 폴더> [ROOT]
//   진단(할 일 1) = 넷 다(N_*) 판의 은거지 전수 · 판(할 일 3) = N ↔ D(넷 다 + T1460) 3시드
'use strict';
const fs = require('fs'), path = require('path');
const RUNS = process.argv[2], ROOT = process.argv[3] || path.join(__dirname, '../../..');
const SEEDS = [1020, 7, 42];
const rd = (tag, s) => { if (fs.existsSync(path.join(RUNS, tag + 'y'))) tag = tag + 'y'; const d = path.join(RUNS, tag); const a = path.join(d, `${tag}-${s}.json`), b = a + '.t1460.json'; if (!fs.existsSync(b)) return null; return { R: fs.existsSync(a) ? JSON.parse(fs.readFileSync(a, 'utf8')) : null, J: JSON.parse(fs.readFileSync(b, 'utf8')) }; };
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const r1 = (x) => x == null ? null : Math.round(x * 10) / 10;
let ta = null;
function ring(cx, cy) {
  if (!ta) { const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {}; try { ta = require(path.join(ROOT, 'server/xzone-geo')).zoneAdapter('hanbando').ta; } finally { console.log = _l; console.warn = _w; } }
  let n = 0, f = 0, r = 0, w = 0, hn = 0, hf = 0;
  for (let dy = -140; dy <= 140; dy += 4) for (let dx = -140; dx <= 140; dx += 4) { const d2 = dx * dx + dy * dy, x = cx + dx, y = cy + dy;
    if (d2 >= 1600 && d2 <= 16900) { hn++; if (ta.forestMult(x, y) > 1.2) hf++; }
    if (d2 > 19600) continue; n++; if (ta.isRock(x, y)) r++; else if (ta.forestMult(x, y) > 1.2) f++; if (ta.isWater(x, y)) w++; }
  return { n, forest: f, rock: r, water: w, huntBand: hn, huntForest: hf, self: +ta.forestMult(cx, cy).toFixed(2) };
}
const out = { diag: [], diagSum: {}, runs: [] };
// ── 진단 ──
for (const s of SEEDS) {
  const X = rd('N_' + s, s); if (!X) continue;
  const walk = new Map(); for (const w of ((X.J.walk && X.J.walk.rows) || [])) if (w.kind === 'gang') walk.set(w.id, w);
  for (const g of X.J.gangs) {
    const t = (g.t60 || [])[0] || {}, tl = (g.t60 || []).slice(-1)[0] || t, rg = ring(g.camp[0], g.camp[1]), wk = walk.get(g.id);
    out.diag.push({ seed: s, id: g.id, why: g.why, den: g.den, camp: g.camp, camps: g.camps, born: g.first, last: g.last, life: g.last - g.first + 1, nMax: g.nMax, nearD: g.nearD, near: g.near, walk: wk ? wk.walk : null,
      ring: rg, mine: t.mine, now: t.now, real: t.real, capNow: t.capNow, capNowStone: t.capNowStone, capReal: t.capReal, capRealStone: t.capRealStone, bandAnimals: t.bandAnimals, bandCells: t.bandCells, bandMine: t.bandMine,
      hereD: g.hereD, awayD: g.awayD, noBodyD: g.noBodyD, memD: g.memD, capRealEnd: tl.capReal, capRealStoneEnd: tl.capRealStone });
  }
}
{
  const D = out.diag, cr = D.map((x) => x.capReal), cs = D.map((x) => x.capRealStone), cn = D.map((x) => x.capNow);
  out.diagSum = { camps: D.length, uniq: new Set(D.map((x) => x.camp.join(','))).size, capNow: { med: med(cn), max: Math.max(...cn.filter((x) => x != null)) }, capReal: { med: med(cr), max: Math.max(...cr.filter((x) => x != null)) },
    capRealStone: { med: med(cs), max: Math.max(...cs.filter((x) => x != null)) }, forestRing0: D.filter((x) => x.ring.forest === 0).length, mineMed: med(D.map((x) => x.mine)),
    awayShare: r1(100 * D.reduce((a, x) => a + (x.awayD || 0), 0) / Math.max(1, D.reduce((a, x) => a + (x.memD || 0), 0))) };
}
// ── 판 ──
for (const s of SEEDS) for (const tag of ['N_' + s, 'D_' + s]) {
  const X = rd(tag, s); if (!X) { out.runs.push({ tag, seed: s, missing: true }); continue; }
  const J = X.J, C = J.wcols, w = J.w, ix = (k) => C.indexOf(k), last = w[w.length - 1];
  const col = (k) => w.map((r) => r[ix(k)]);
  const pop = col('pop'), mem = col('members'), gN = col('gangs'), loot = col('lootN');
  const days = w.map((r) => r[0]);
  const yr = (a, b) => { const sel = w.filter((r) => r[0] > a && r[0] <= b && r[ix('pop')] > 0); return sel.length ? r1(100 * sel.reduce((p, r) => p + r[ix('members')] / r[ix('pop')], 0) / sel.length) : null; };
  const share = w.map((r) => r[ix('pop')] ? 100 * r[ix('members')] / r[ix('pop')] : 0);
  const G = J.gangs, endDay = last[0];
  const lifeOf = (g) => g.last - g.first + 1;
  const forest = G.filter((g) => g.t60 && g.t60[0] && g.t60[0].real && g.t60[0].real.wood > 0.45), open = G.filter((g) => !(g.t60 && g.t60[0] && g.t60[0].real && g.t60[0].real.wood > 0.45));
  const lastM = Math.max(...J.vm.map((r) => r[0])), empty = J.vm.filter((r) => r[0] === lastM && r[3] === 0).length;
  const st4 = (J.t1404 && J.t1404.st) || {}, b = J.bandit || {};
  out.runs.push({ tag, seed: s, days: endDay, popEnd: last[ix('pop')], alive: last[ix('alive')], empty,
    gangsAvg: r1(gN.reduce((a, x) => a + x, 0) / gN.length), gangsMax: Math.max(...gN), memMed: med(mem), memMax: Math.max(...mem), biggest: G.length ? Math.max(...G.map((g) => g.nMax)) : 0,
    gangsSeen: G.length, lifeMed: med(G.map(lifeOf)), lifeMax: G.length ? Math.max(...G.map(lifeOf)) : null, loot: loot.reduce((a, x) => a + x, 0),
    noLootDays: w.filter((r) => r[ix('gangs')] > 0 && r[ix('lootN')] === 0).length, gangDays: w.filter((r) => r[ix('gangs')] > 0).length,
    home: st4.home || 0, homeBody: st4.homeBody || 0, homeRec: st4.homeRec || 0, homeNone: st4.homeNone || 0, split: st4.split || 0, leave: st4.leave || 0, starve: b.starve || 0,
    fgFood: r1(st4.fgFood || 0), fgHunt: r1(st4.fgHunt || 0), fgForage: r1(st4.fgForage || 0), lootFood: r1(col('lootFood').reduce((a, x) => a + x, 0)),
    forestN: forest.length, openN: open.length, lifeForest: med(forest.map(lifeOf)), lifeOpen: med(open.map(lifeOf)),
    shareMax: r1(Math.max(...share)), shareY1: yr(0, 365), shareY2: yr(365, 730), t1460: J.t1460 || null,
    killed: col('killed').reduce((a, x) => a + x, 0), raided: col('raided').reduce((a, x) => a + x, 0), sent: col('sent').reduce((a, x) => a + x, 0), foodImp: r1(col('foodImp').reduce((a, x) => a + x, 0)) });
}
for (const s of SEEDS) { const N = out.runs.find((r) => r.tag === 'N_' + s), D = out.runs.find((r) => r.tag === 'D_' + s); if (N && D && !N.missing && !D.missing) D.popRatio = +(D.popEnd / N.popEnd).toFixed(3); }
console.log(JSON.stringify(out, null, 1));
