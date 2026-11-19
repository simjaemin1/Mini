#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1340 계측기)
// === scripts/t1340-moment-cmp.js — 종료 저장 순간(save) ↔ 다시 뜬 첫 틱(ready) 전수 견줌(`t1340-moment-hook.js` 의 두 덤프) ===
//   node scripts/t1340-moment-cmp.js <save.json> <ready.json> [--json out] [--ex N]
//   ⇒ 갈래(몸 · 서버 마을 · econ 마을 · econ 세계 · 서버 state)마다 칸 → 갈린 수 / 둘 다 있는 수 · 한쪽에만 있는 수 · 보기 값
'use strict';
const fs = require('fs');
const a = process.argv.slice(2);
const S = JSON.parse(fs.readFileSync(a[0], 'utf8')), R = JSON.parse(fs.readFileSync(a[1], 'utf8'));
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const EX = +opt('ex', '1');
const T = {};
const add = (g, k, x, y, who) => {
  const P = (T[g] || (T[g] = {}))[k] || (T[g][k] = { both: 0, diff: 0, onlyS: 0, onlyR: 0, ex: [] });
  if (x === undefined && y === undefined) return;
  if (y === undefined) { P.onlyS++; if (P.ex.length < EX) P.ex.push([who, String(x).slice(0, 160), '∅']); return; }
  if (x === undefined) { P.onlyR++; if (P.ex.length < EX) P.ex.push([who, '∅', String(y).slice(0, 160)]); return; }
  P.both++; if (x !== y) { P.diff++; if (P.ex.length < EX) P.ex.push([who, String(x).slice(0, 160), String(y).slice(0, 160)]); }
};
const cmpObj = (g, x, y, who) => { for (const k of new Set([...Object.keys(x || {}), ...Object.keys(y || {})])) add(g, k, (x || {})[k], (y || {})[k], who); };
let bodies = 0, pidSame = 0;
for (const nm of Object.keys(S.vils)) {
  const s = S.vils[nm], r = R.vils[nm]; if (!r) continue;
  const n = Math.min(s.rows.length, r.rows.length);
  for (let i = 0; i < n; i++) { if (!s.rows[i] || !r.rows[i]) continue; bodies++; if (s.pids[i] === r.pids[i]) pidSame++; cmpObj('몸', s.rows[i], r.rows[i], `${nm}#${i}`); }
  add('몸 수', 'n', String(s.rows.length), String(r.rows.length), nm);
  cmpObj('서버 마을', s.side, r.side, nm);
  cmpObj('econ 마을', s.econ, r.econ, nm);
}
cmpObj('econ 세계', S.world, R.world, 'world');
cmpObj('서버 state', S.state, R.state, 'state');
const out = { save: { V: S.V, day: S.worldDay }, ready: { V: R.V, day: R.worldDay }, bodies, pidSame, groups: {} };
console.log(`=== 저장 순간 V ${S.V} 날 ${S.worldDay} ↔ 다시 뜬 첫 틱 V ${R.V} 날 ${R.worldDay} · 몸 ${bodies}(pid 같음 ${pidSame}) ===`);
for (const g of Object.keys(T)) {
  const rows = Object.entries(T[g]).filter(([, p]) => p.diff || p.onlyS || p.onlyR).sort((x, y) => (y[1].diff + y[1].onlyS + y[1].onlyR) - (x[1].diff + x[1].onlyS + x[1].onlyR));
  out.groups[g] = Object.fromEntries(rows);
  console.log(`\n[${g}] 갈린 칸 ${rows.length} / ${Object.keys(T[g]).length}`);
  for (const [k, p] of rows) console.log(`  ${k.padEnd(22)} 갈림 ${p.diff}/${p.both}${p.onlyS ? ` · 저장에만 ${p.onlyS}` : ''}${p.onlyR ? ` · 다시 뜬 쪽에만 ${p.onlyR}` : ''}  ${p.ex.map((e) => `${e[0]}: ${e[1]} → ${e[2]}`).join(' | ').slice(0, 300)}`);
}
if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
