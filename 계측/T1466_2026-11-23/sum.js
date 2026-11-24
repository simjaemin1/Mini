'use strict';
// T1466 계측 묶음 — runs/<판>/{jp.json, bot.json, st.json} → 표(마크다운) · sum.json
//   쓰는 법: node 계측/T1466_2026-11-23/sum.js <runs 디렉터리> [out.json]
//   벽시계(판정 혼자 줄에 있을 때) = 판정 CPU 를 16 ms 몫으로 나눈 틱 수 × 33.3 ms(손짓 틱에 한 몫 · 그다음 틱마다 한 몫)
const fs = require('fs'), path = require('path');
const DIR = process.argv[2], OUT = process.argv[3];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const q = (a, p) => { if (!a || !a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1); };
const wall = (cpu) => Math.ceil(Math.max(cpu, 0.01) / 16) * 33.3;
const dist = (a) => ({ n: a.length, p50: q(a, 0.5), p90: q(a, 0.9), p99: q(a, 0.99), max: a.length ? +Math.max(...a).toFixed(1) : null });
const S = { off: {}, on: {}, lab: {}, st: {} };
for (const tag of fs.readdirSync(DIR)) {
  const jp = J(path.join(DIR, tag, 'jp.json')), bot = J(path.join(DIR, tag, 'bot.json')), st = J(path.join(DIR, tag, 'st.json'));
  if (/^OFF_/.test(tag) && jp) {
    const arms = {}; for (const [a, C] of Object.entries(jp.cmp || {})) arms[a] = { n: C.n, same: C.same, v: C.v, pb: C.pb, pass: C.pass, len: C.len, cells: C.cells, pairs: C.pairs, pairsLen: C.pairsLen, pairsCells: C.pairsCells, qa: C.qa, qb: C.qb, diff: (C.diff || []).slice(0, 12) };
    const heavy = (jp.jobs || []).filter((j) => j.cpu >= 1000).map((j) => ({ at: j.at.slice(0, 2), cls: j.meta.cls, v: j.verdict, pairs: j.pairs, groups: j.groups, cpu: j.cpu, temp: j.temp, overlap: j.overlap && j.overlap.share, n: j.n,
      sh: Object.fromEntries(Object.entries(j.sh || {}).map(([a, o]) => [a, o && { cpu: o.cpuB, v: o.vB, same: o.same, pb: o.pb, pass: o.pass, pairs: o.pairs, len: o.len, cells: o.cells, runs: o.fs && o.fs.each ? o.fs.each.length : 0, pops: o.fs && o.fs.pops, defer: o.defer || null, dl: (o.dl || []).slice(0, 6) }])) }));
    S.off[tag] = { arms, heavy, small: jp.small, npc: jp.npc || null, land: jp.land || null, gate: jp.gate ? { bake: jp.gate.bake, rebake: jp.gate.rebake, q: jp.gate.q, qCpu: jp.gate.qCpu, full: jp.gate.full, marks: jp.gate.dirtyMarks } : null, mem: jp.mem || null, tick: bot && bot.tick, err: jp.err };
  }
  if (/^ON_/.test(tag) && jp) {
    const cpus = (jp.small.cpu ? jp.small.cpu : []).slice(); const big = (jp.jobs || []).map((j) => j.cpu);
    S.on[tag] = { small: { n: jp.small.n, p50: jp.small.p50, p99: jp.small.p99, max: jp.small.max }, big: big.length, jobs: (jp.jobs || []).map((j) => ({ at: j.at.slice(0, 2), cls: j.meta.cls, v: j.verdict, pairs: j.pairs, cpu: j.cpu, wall: Math.round(wall(j.cpu)), fs: j.fs && { runs: j.fs.runs, pops: j.fs.pops, srcs: j.fs.srcs } })),
      npc: jp.npc || null, L: jp.L || null, S: jp.S || null, mem: jp.mem || null, tick: bot && bot.tick, tickPre: bot && bot.tickPre, zone: bot && bot.zone && { pend: bot.zone.pend, pendTicks: bot.zone.pendTicks }, err: jp.err };
  }
  if (/^LAB_/.test(tag) && jp && jp.lab) {
    const rows = jp.lab.rows || [], A = rows.map((r) => r.cpu), arms = {};
    for (const r of rows) for (const [a, o] of Object.entries(r.sh || {})) { if (!o) continue; const z = arms[a] || (arms[a] = { cpu: [], same: 0, v: 0, n: 0, pairs: 0, pairsLen: 0, pairsCells: 0, diff: [] }); z.n++; z.cpu.push(o.cpuB); if (o.same) z.same++; else if (z.diff.length < 10) z.diff.push({ x: r.x, y: r.y, kind: r.kind, vA: o.vA, vB: o.vB, pb: o.pb, pass: o.pass, dl: (o.dl || []).slice(0, 3) }); if (o.v) z.v++; z.pairs += o.pairs | 0; z.pairsLen += o.len | 0; z.pairsCells += o.cells | 0; }
    S.lab[tag] = { day: jp.lab.day, cells: jp.lab.cells, busy: jp.lab.busy, rand: jp.lab.rand, maxPairs: jp.lab.maxPairs, done: !!jp.lab.done, t1440: dist(A), t1440wall: dist(A.map(wall)), bridge: rows.filter((r) => r.bridge).length,
      arms: Object.fromEntries(Object.entries(arms).map(([a, z]) => [a, { n: z.n, same: z.same, v: z.v, pairs: z.pairs, pairsLen: z.pairsLen, pairsCells: z.pairsCells, cpu: dist(z.cpu), wall: dist(z.cpu.map(wall)), diff: z.diff }])),
      top: rows.slice().sort((a, b) => b.cpu - a.cpu).slice(0, 8).map((r) => ({ x: r.x, y: r.y, kind: r.kind, n: r.n, bridge: r.bridge, v: r.v, cpu: r.cpu, sh: Object.fromEntries(Object.entries(r.sh || {}).map(([a, o]) => [a, o && [o.cpuB, o.vB, o.same]])) })), err: jp.err };
  }
  if (/^ST/.test(tag) && st) S.st[tag] = st;
}
const out = JSON.stringify(S, null, 1);
if (OUT) fs.writeFileSync(OUT, out);
console.log(out.slice(0, 200000));
