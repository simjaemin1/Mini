'use strict';
// (계측 자 · 판정 0) T1462 — 싸움의 사기: 진 편이 왜 거의 다 죽나 · 팔(`T1462_MORALE`)마다 무엇이 바뀌나.
//   battle-core 를 머리 없이(빈 들판 · 표준 배치 · dt 0.1 · 판 끝 = battle-core judge — 한 편 다 죽거나 다 달아남 · 120초) · 씨 고정.
//   node 계측/T1462_2026-11-23/사기.js <일> [팔들 — 쉼표 묶음을 | 로 · 기본 = 끔|self|nodesp|wound|nochase|self,nodesp,wound|self,nodesp,wound,nochase]
//   일: table(싸움 꼴 일곱) · solo(혼자 ↔ 도적 하나 × 행복 다섯) · trace(몸 하나의 사기 · 항별 몫 시간 줄) · matchup(병종 상성 10 ↔ 10)
const path = require('path');
const BC = require(path.join(__dirname, '..', '..', 'sim', 'battle-core.js'));
function mkRng(s) { s = (s >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const C1 = 'self,nodesp,wound,nocommit', C2 = C1 + ',instant', C3 = C2 + ',breaknow', C4 = C3 + ',nochase', C5 = C4 + ',norally';
const ARMS = (process.argv[3] || ['끔', 'self', 'nodesp', 'wound', 'nochase', 'nocommit', 'instant', 'breaknow', 'norally', C1, C2, C3, C4, C5].join('|')).split('|');
const setArm = (a) => { if (a === '끔') delete process.env.T1462_MORALE; else process.env.T1462_MORALE = a; };
//   한 판 — spec = { A: {…, form}, B: {…} } · happy = A 편 armyMrl(없으면 칸 안 섬)
function fight(spec, seed, happy, onStep) {
  const h = BC.createBattle(Object.assign({ terrain: 'plain' }, spec), { rng: mkRng(seed) });
  if (happy != null) h.ctx.sides.A.armyMrl = happy;
  const U = h.units, st = new Map();
  for (const u of U) st.set(u, { rout0: false, routN: 0, routEng: 0, routFree: 0, deadAt: null, deadRouting: null, wasSt: u.st });
  let t = 0;
  for (; t < 6000 && !h.result; t++) {
    h.step(0.1);
    for (const u of U) {
      const s = st.get(u);
      if (u.hp <= 0) { if (s.deadAt == null) { s.deadAt = h.ctx.tick; s.deadRouting = !!s.rout0; } continue; }
      if (u.routing && !s.rout0) { s.routN++; if (s.wasSt === 'melee') s.routEng++; else s.routFree++; }
      s.rout0 = !!u.routing; s.wasSt = u.st;
    }
    if (onStep) onStep(h, t);
  }
  const win = (h.result && h.result.win) || '무';
  const side = (x) => U.filter((u) => u.side === x);
  const out = { win, secs: +h.ctx.tick.toFixed(1) };
  for (const x of ['A', 'B']) {
    const L = side(x); let dead = 0, deadR = 0, alive = 0, aliveR = 0, routN = 0, routEng = 0, routFree = 0;
    for (const u of L) { const s = st.get(u); if (u.hp <= 0) { dead++; if (s.deadRouting) deadR++; } else { alive++; if (u.routing) aliveR++; } routN += s.routN; routEng += s.routEng; routFree += s.routFree; }
    out[x] = { n: L.length, dead, deadR, alive, aliveR, routN, routEng, routFree };
  }
  return out;
}
const pc = (a, b) => b ? Math.round(100 * a / b) : 0;
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
function many(spec, N, happy) {
  const R = { n: 0, ld: 0, lr: 0, la: 0, lN: 0, wd: 0, wN: 0, rEng: 0, rFree: 0, secs: [], winA: 0, winB: 0, draw: 0, aD: 0, aN: 0, bD: 0, bN: 0 };
  for (let s = 1; s <= N; s++) {
    const o = fight(spec, s * 7919 + 13, happy);
    R.aD += o.A.dead; R.aN += o.A.n; R.bD += o.B.dead; R.bN += o.B.n;
    if (o.win === '무') { R.draw++; R.secs.push(o.secs); continue; }
    const L = o.win === 'A' ? o.B : o.A, W = o.win === 'A' ? o.A : o.B;
    R.n++; R.ld += L.dead; R.lr += L.deadR; R.la += L.alive; R.lN += L.n; R.wd += W.dead; R.wN += W.n; R.rEng += o.A.routEng + o.B.routEng; R.rFree += o.A.routFree + o.B.routFree; R.secs.push(o.secs);
    if (o.win === 'A') R.winA++; else R.winB++;
  }
  return R;
}
const KIND = process.argv[2] || 'table';
const SC = [
  ['민병 1 ↔ 석검 1', { A: { militia: 1, form: 'line' }, B: { dagger: 1, form: 'line' } }, 100],
  ['민병 5 ↔ 석검 5', { A: { militia: 5, form: 'line' }, B: { dagger: 5, form: 'line' } }, 100],
  ['민병 20 ↔ 석검 20', { A: { militia: 20, form: 'line' }, B: { dagger: 20, form: 'line' } }, 60],
  ['창 20 ↔ 창 20', { A: { spear: 20, form: 'line' }, B: { spear: 20, form: 'line' } }, 60],
  ['창 20 ↔ 석검 20', { A: { spear: 20, form: 'line' }, B: { dagger: 20, form: 'line' } }, 60],
  ['창 30 + 궁 10 + 정예 3 ↔ 창 20 + 석검 15 + 궁 10', { A: { spear: 30, archer: 10, champion: 3, form: 'line' }, B: { spear: 20, dagger: 15, archer: 10, form: 'line' } }, 40],
  ['창 40 ↔ 창 20', { A: { spear: 40, form: 'line' }, B: { spear: 20, form: 'line' } }, 40],
  ['창 2(원형) ↔ 석검 3', { A: { spear: 2, form: 'circle' }, B: { dagger: 3, form: 'line' } }, 100],
  ['ⓐ 창 30 ↔ 창 20 · A 행복 0.3', { A: { spear: 30, form: 'line' }, B: { spear: 20, form: 'line' } }, 40, 0.3],
  ['ⓑ 창 18 ↔ 창 22 · A 행복 1', { A: { spear: 18, form: 'line' }, B: { spear: 22, form: 'line' } }, 40, 1],
];
if (KIND === 'table') {
  console.log('| 팔 | 싸움 | 판 | 진 편 죽음 | 그중 달아나다 죽음 | 진 편 살아 달아남 | 이긴 편 죽음 | 달아나기 시작(치던 중 · 안 치던 중) | 가운데 초 | A 이김 · B 이김 · 비김 | A 죽음 · B 죽음 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const a of ARMS) { setArm(a); for (const [nm, spec, N, hp] of SC) { const R = many(spec, N, hp == null ? null : hp);
    console.log(`| ${a} | ${nm} | ${N} | ${pc(R.ld, R.lN)} % | ${pc(R.lr, R.ld)} % | ${pc(R.la, R.lN)} % | ${pc(R.wd, R.wN)} % | ${R.rEng} · ${R.rFree} | ${med(R.secs)} | ${R.winA} · ${R.winB} · ${R.draw} | ${pc(R.aD, R.aN)} % · ${pc(R.bD, R.bN)} % |`); } }
} else if (KIND === 'solo') {
  console.log('| 팔 | 도적 | 행복 | 행상 죽음 | 달아나 삶 | 이김 | 비김 | 달아나기 시작(치던 중 · 안 치던 중) |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const a of ARMS) { setArm(a); for (const [bn, B] of [['석검 하나', { dagger: 1, form: 'line' }], ['맨손(민병) 하나', { militia: 1, form: 'line' }]]) for (const hp of [1, 0.9, 0.7, 0.55, 0.4]) {
    let die = 0, live = 0, win = 0, draw = 0, re = 0, rf = 0;
    for (let s = 1; s <= 200; s++) { const o = fight({ A: { militia: 1, form: 'line' }, B }, s * 104729 + 7, hp);
      if (o.A.dead) die++; else if (o.win === 'A') win++; else if (o.win === '무') draw++; else live++; re += o.A.routEng; rf += o.A.routFree; }
    console.log(`| ${a} | ${bn} | ${hp} | ${die} | ${live} | ${win} | ${draw} | ${re} · ${rf} |`); } }
} else if (KIND === 'trace') {
  //   몸 하나(진 편 · 처음 죽거나 달아난 몸)의 사기와 항별 몫 — battle-core `updateMorale` 의 항을 같은 상수로 다시 셈(읽기만)
  const spec = SC[+(process.argv[4] || 2)][1], seed = +(process.argv[5] || 1);
  for (const a of ARMS) { setArm(a); const rows = [];
    let tgt = null;
    const o = fight(spec, seed * 7919 + 13, null, (h, t) => {
      const ctx = h.ctx, A = ctx._t1462 || {};
      if (!tgt) tgt = h.units.find((u) => u.side === 'A' && u.hp > 0 && Math.abs(u.y - 65) < 3) || h.units.find((u) => u.side === 'A');
      const u = tgt; if (t % 5 || !u) return;
      const BK = BC.BK, bx = Math.floor(u.x / BK), by = Math.floor(u.y / BK); let fN = 0, eN = 0, rN = 0, champ = 0, dMin2 = 1e9;
      for (let ix = bx - 1; ix <= bx + 1; ix++) for (let iy = by - 1; iy <= by + 1; iy++) { const c = ctx._grid.get(((ix + 256) * 8192) + (iy + 256)); if (!c) continue;
        for (const q of c) { if (q === u || q.hp <= 0) continue; if (q.side === u.side) { fN++; if (q._rPrev) rN++; if (q.type === 'champion') champ = 1; } else { eN++; const dx = u.x - q.x, dy = u.y - q.y, dd = dx * dx + dy * dy; if (dd < dMin2) dMin2 = dd; } } }
      const S = ctx.sides, relA = S.A.start ? S.A.dead / S.A.start : 0, relB = S.B.start ? S.B.dead / S.B.start : 0;
      const commit = u.st === 'melee' ? 1 : (dMin2 < BC.COMMIT_D * BC.COMMIT_D ? 1 - Math.sqrt(dMin2) / BC.COMMIT_D : 0), wound = u.hp > 0 ? 1 - u.hp / u.maxHp : 1;
      const T = { 기본: BC.MRL0[u.type], 수우열: BC.M_KODDS * ((A.self ? fN + 1 : fN) - eN) / (fN + eN + 1), 전염: -BC.M_KCONTAG * rN, 사상률: BC.M_KRELCAS * (relB - relA) - BC.M_KABS * relA,
        교전: A.nocommit ? 0 : BC.M_KCOMMIT * commit, 다침뺌: -BC.M_KWOUND * wound * (A.wound ? 1 : (1 - commit)), 다침더함: A.nodesp ? 0 : BC.M_KDESP * wound * commit };
      rows.push({ s: +ctx.tick.toFixed(1), hp: Math.round(u.hp), mrl: +(u.mrl || 0).toFixed(2), rout: !!u.routing, st: u.st, fN, eN, ...Object.fromEntries(Object.entries(T).map(([k, v]) => [k, +v.toFixed(2)])) });
    });
    console.log(`\n### 팔 ${a} — 몸 하나(A · ${tgt && tgt.type}) · 판 끝 ${o.win} ${o.secs}초`);
    console.log('| 초 | hp | 사기 | 궤주 | 상태 | 곁 아군 · 적 | 기본 | 수 우열 | 전염 | 사상률 | 교전 | 다침(뺌) | 다침(더함) |'); console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows.filter((r, i) => i % 2 === 0 || r.rout || r.hp <= 0).slice(0, 60)) console.log(`| ${r.s} | ${r.hp} | ${r.mrl} | ${r.rout ? '○' : ''} | ${r.st} | ${r.fN} · ${r.eN} | ${r.기본} | ${r.수우열} | ${r.전염} | ${r.사상률} | ${r.교전} | ${r.다침뺌} | ${r.다침더함} |`);
  }
} else if (KIND === 'matchup') {
  const T = ['spear', 'dagger', 'militia', 'greataxe', 'pike', 'champion', 'archer', 'slinger'];
  for (const a of ARMS) { setArm(a); console.log(`\n### 팔 ${a} — 10 ↔ 10 A 이김 %(줄 = A · 칸 = B · 20판)`); console.log('| A \\ B | ' + T.join(' | ') + ' |'); console.log('|---' + '|---'.repeat(T.length) + '|');
    for (const x of T) { const cells = []; for (const y of T) { let w = 0; for (let s = 1; s <= 20; s++) { const o = fight({ A: { [x]: 10, form: 'line' }, B: { [y]: 10, form: 'line' } }, s * 31 + 5, null); if (o.win === 'A') w++; } cells.push(Math.round(w * 5)); } console.log(`| ${x} | ${cells.join(' | ')} |`); } }
}
