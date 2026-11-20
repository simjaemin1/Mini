#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1372 계측기)
// === scripts/t1372-moment-cmp.js — 캐러밴 몸 · 첫 거름 표 견줌(`t1372-moment-hook.js` 의 두 덤프) ====================================
//   node scripts/t1372-moment-cmp.js <A: 한 번에 돈 판 at.json> <B: 다시 뜬 판 ready.json> [--ex N] [--json out]
//   ⇒ 캐러밴(한쪽에만 · 둘 다) · 몸 칸 / 상인 몸 칸 / 호위 몸 칸 마다 갈린 수 · 첫 거름 표 pid 마다 갈린 열
'use strict';
const fs = require('fs');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const X = JSON.parse(fs.readFileSync(a[0], 'utf8')), Y = JSON.parse(fs.readFileSync(a[1], 'utf8'));
const EX = +opt('ex', '2');
const T = {};
const add = (g, k, x, y, who) => {
  const P = (T[g] || (T[g] = {}))[k] || (T[g][k] = { both: 0, diff: 0, onlyA: 0, onlyB: 0, ex: [] });
  if (x === undefined && y === undefined) return;
  if (y === undefined) { P.onlyA++; if (P.ex.length < EX) P.ex.push([who, String(x).slice(0, 140), '∅']); return; }
  if (x === undefined) { P.onlyB++; if (P.ex.length < EX) P.ex.push([who, '∅', String(y).slice(0, 140)]); return; }
  P.both++; if (x !== y) { P.diff++; if (P.ex.length < EX) P.ex.push([who, String(x).slice(0, 140), String(y).slice(0, 140)]); }
};
const cmpObj = (g, x, y, who) => { for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) add(g, k, (x || {})[k], (y || {})[k], who); };
const ids = new Set([...Object.keys(X.cars), ...Object.keys(Y.cars)]);
let both = 0, onlyA = [], onlyB = [], pidSame = 0;
for (const id of [...ids].sort((p, q) => p - q)) {
  const x = X.cars[id], y = Y.cars[id];
  if (!x) { onlyB.push(id); continue; } if (!y) { onlyA.push(id); continue; }
  both++; if (x.body.pid === y.body.pid) pidSame++;
  cmpObj('캐러밴 몸', x.body, y.body, '#' + id);
  cmpObj('상인 몸', x.p, y.p, '#' + id);
  for (let i = 0; i < Math.max(x.esc.length, y.esc.length); i++) { cmpObj('호위 몸', x.esc[i], y.esc[i], `#${id}.${i}`); cmpObj('호위 기록', (x.escRec || [])[i], (y.escRec || [])[i], `#${id}.${i}`); }
}
const ssP = new Set([...Object.keys(X.ss), ...Object.keys(Y.ss)]);
let ssBoth = 0;
for (const pid of ssP) { const x = X.ss[pid], y = Y.ss[pid]; if (x && y) ssBoth++; cmpObj('첫 거름 표', x || { TK: '(없음)' }, y || { TK: '(없음)' }, pid); }
//   모듈 객체 — 모듈마다 칸 수 · 갈린 칸 · 한쪽에만(칸 이름의 앞 조각 = 마을 · 몹 번호는 떼고 칸 이름으로 묶는다)
const MODS = {};
if (X.mods && Y.mods) for (const m of ['ledger', 'roads', 'payload', 'mobs']) {
  const x = X.mods[m] || {}, y = Y.mods[m] || {}, R = MODS[m] = { keys: 0, diff: 0, onlyA: 0, onlyB: 0, byField: {} };
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    R.keys++; const f = m === 'payload' || m === 'mobs' ? k.slice(k.indexOf('.') + 1) : k;
    const d = x[k] === undefined ? 'onlyB' : y[k] === undefined ? 'onlyA' : x[k] !== y[k] ? 'diff' : null;
    if (d) { R[d]++; R.byField[f] = (R.byField[f] || 0) + 1; }
  }
}
const tk = (S) => { const c = {}; for (const r of Object.values(S.ss)) c[r.TK] = (c[r.TK] || 0) + 1; return JSON.stringify(c); };
console.log(`=== A V ${X.V} 날 ${X.day} ↔ B V ${Y.V} 날 ${Y.day} · 캐러밴 A ${Object.keys(X.cars).length} · B ${Object.keys(Y.cars).length} · 둘 다 ${both}(pid 같음 ${pidSame}) · A 에만 ${onlyA.length}${onlyA.length ? ' ' + onlyA.slice(0, 8).join(',') : ''} · B 에만 ${onlyB.length}${onlyB.length ? ' ' + onlyB.slice(0, 8).join(',') : ''} ===`);
console.log(`    가장 큰 pid A ${X.maxPid} · B ${Y.maxPid} · 첫 거름 칸 수 A ${X.ssN} · B ${Y.ssN} · 표 든 몸 A ${Object.keys(X.ss).length} ${tk(X)} · B ${Object.keys(Y.ss).length} ${tk(Y)}`);
const out = { A: { V: X.V, day: X.day, cars: Object.keys(X.cars).length, maxPid: X.maxPid }, B: { V: Y.V, day: Y.day, cars: Object.keys(Y.cars).length, maxPid: Y.maxPid }, both, pidSame, onlyA, onlyB, groups: {} };
for (const g of Object.keys(T)) {
  const rows = Object.entries(T[g]).filter(([, p]) => p.diff || p.onlyA || p.onlyB).sort((x, y) => (y[1].diff + y[1].onlyA + y[1].onlyB) - (x[1].diff + x[1].onlyA + x[1].onlyB));
  out.groups[g] = Object.fromEntries(rows);
  console.log(`\n[${g}] 갈린 칸 ${rows.length} / ${Object.keys(T[g]).length}`);
  for (const [k, p] of rows.slice(0, 40)) console.log(`  ${k.padEnd(18)} 갈림 ${p.diff}/${p.both}${p.onlyA ? ` · A 에만 ${p.onlyA}` : ''}${p.onlyB ? ` · B 에만 ${p.onlyB}` : ''}  ${p.ex.map((e) => `${e[0]}: ${e[1]} → ${e[2]}`).join(' ‖ ')}`);
}
if (Object.keys(MODS).length) { console.log(`\n[모듈 객체] 몹 A ${X.mods.mobN} · B ${Y.mods.mobN}`); for (const [m, R] of Object.entries(MODS)) console.log(`  ${m.padEnd(8)} 칸 ${R.keys} · 갈림 ${R.diff} · A 에만 ${R.onlyA} · B 에만 ${R.onlyB}  ${Object.entries(R.byField).sort((p, q) => q[1] - p[1]).slice(0, 12).map(([f, n]) => f + ' ' + n).join(' · ')}`); out.mods = MODS; }
//   ★[T1382] 길 닳음 칸 — 칸 수 · 갈린 칸 · 한쪽에만 · 코스 지도 · 마지막 날
if (X.mods && Y.mods && (X.mods.rd || Y.mods.rd)) {
  const x = X.mods.rd || { cells: {} }, y = Y.mods.rd || { cells: {} }, R = out.rd = { nA: x.n || 0, nB: y.n || 0, diff: 0, onlyA: 0, onlyB: 0, ex: [], scal: {} };
  for (const k of new Set([...Object.keys(x.cells), ...Object.keys(y.cells)])) { const a2 = x.cells[k], b2 = y.cells[k]; const d = a2 === undefined ? 'onlyB' : b2 === undefined ? 'onlyA' : a2 !== b2 ? 'diff' : null; if (d) { R[d]++; if (R.ex.length < EX) R.ex.push([k, a2 || '∅', b2 || '∅']); } }
  for (const k of ['lastDay', 'coarseGen', 'coarseN', 'pavedN', 'coarse']) if (x[k] !== y[k]) R.scal[k] = [String(x[k]).slice(0, 60), String(y[k]).slice(0, 60)];
  console.log(`\n[길 닳음 칸] A ${R.nA} · B ${R.nB} · 갈림 ${R.diff} · A 에만 ${R.onlyA} · B 에만 ${R.onlyB}${Object.keys(R.scal).length ? ' · 다른 값 ' + Object.keys(R.scal).join(',') : ''}  ${R.ex.map((e) => e.join(': ')).join(' ‖ ')}`);
}
if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
