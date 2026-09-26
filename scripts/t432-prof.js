#!/usr/bin/env node
// === scripts/t432-prof.js — `.cpuprofile` 을 함수별 자기 시간 · 포함 시간으로 읽는다(T432 ② 값 분해 · 계측기) ================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 무접촉 — `scripts/t432-probe.js` 가 쓴 V8 프로필을 읽기만 한다.
//   자기 시간 = 그 함수 몸통에서 보낸 시간 · 포함 시간 = 그 함수가 스택에 있던 시간(재귀는 한 번만 센다).
//   존 틱은 `setInterval` 한 함수라 "틱 함수의 포함 시간 ÷ 틱 수" 가 틱 한 번의 값이다 — 갈래는 그 안의 함수들로 가른다.
//
// 실행: node scripts/t432-prof.js <a.cpuprofile> [top=40] [--json out.json] [--focus 이름,이름…] [--tree 깊이]
'use strict';
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.log('쓰임: node scripts/t432-prof.js <a.cpuprofile> [top] [--json out] [--focus a,b]'); process.exit(2); }
const top = parseInt(args[1] && !args[1].startsWith('--') ? args[1] : '40', 10);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const focus = args.includes('--focus') ? args[args.indexOf('--focus') + 1].split(',') : [];
const P = JSON.parse(fs.readFileSync(file, 'utf8'));
const byId = new Map(), parent = new Map();
for (const n of P.nodes) byId.set(n.id, n);
for (const n of P.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const keyOf = (n) => { const f = n.callFrame; return `${f.functionName || '(익명)'} ${f.url ? path.basename(f.url) : ''}:${f.lineNumber + 1}`; };
const self = new Map(), incl = new Map();
let total = 0;
for (let i = 0; i < P.samples.length; i++) {
  const d = P.timeDeltas[i] || 0; total += d;
  let id = P.samples[i];
  const n0 = byId.get(id); if (!n0) continue;
  const k0 = keyOf(n0); self.set(k0, (self.get(k0) || 0) + d);
  const seen = new Set();
  while (id != null) { const n = byId.get(id); if (!n) break; const k = keyOf(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + d); } id = parent.get(id); }
}
const ms = (us) => +(us / 1000).toFixed(1);
const pct = (us) => +(100 * us / total).toFixed(2);
const rows = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
const idle = (self.get('(idle) :0') || 0), prog = (self.get('(program) :0') || 0), gc = (self.get('(garbage collector) :0') || 0);
console.log(`== ${path.basename(file)} · 창 ${ms(total)}ms · idle ${pct(idle)}% · program ${pct(prog)}% · GC ${pct(gc)}% · 일한 몫 ${pct(total - idle)}%`);
console.log(`\n-- 자기 시간 top ${top} (창 대비 % · ms)`);
for (const [k, v] of rows(self).slice(0, top)) console.log(`  ${pct(v).toFixed(2).padStart(6)}%  ${String(ms(v)).padStart(8)}  ${k}`);
console.log(`\n-- 포함 시간 top ${top}`);
for (const [k, v] of rows(incl).slice(0, top)) console.log(`  ${pct(v).toFixed(2).padStart(6)}%  ${String(ms(v)).padStart(8)}  ${k}`);
if (focus.length) {
  console.log('\n-- 초점(포함 시간 · 이름이 들어간 함수 전부)');
  for (const f of focus) for (const [k, v] of rows(incl)) if (k.split(' ')[0] === f) console.log(`  ${pct(v).toFixed(2).padStart(6)}%  ${String(ms(v)).padStart(8)}  ${k}`);
}
// ── 나무 — 틱 함수(존 `setInterval` 한 몸통 · zone.js 의 익명 함수 중 포함 시간이 가장 큰 것) 아래를 깊이 3 까지 · 같은 경로는 합친다
if (args.includes('--tree')) {
  const depth = parseInt(args[args.indexOf('--tree') + 1] || '3', 10) || 3;
  const tickKey = rows(incl).map(([k]) => k).find((k) => /^\(익명\) zone\.js:/.test(k));
  const tree = new Map();   // 경로 → us
  let ticks = 0;
  for (let i = 0; i < P.samples.length; i++) {
    const d = P.timeDeltas[i] || 0; const st = [];
    let id = P.samples[i]; while (id != null) { const n = byId.get(id); if (!n) break; st.push(keyOf(n)); id = parent.get(id); }
    const ti = st.indexOf(tickKey); if (ti < 0) continue;
    const path = st.slice(Math.max(0, ti - depth), ti).reverse();   // 틱 바로 아래부터 깊이만큼
    for (let j = 1; j <= path.length; j++) { const pk = path.slice(0, j).join(' ▸ '); tree.set(pk, (tree.get(pk) || 0) + d); }
    tree.set('', (tree.get('') || 0) + d);
  }
  const tickUs = tree.get('') || 0;
  console.log(`\n-- 틱 나무(${tickKey} · 포함 ${ms(tickUs)}ms = 창의 ${pct(tickUs)}%) · 깊이 ${depth} · 틱 몫 % 가 1 이상만`);
  const ks = [...tree.keys()].filter((k) => k).sort();
  const kids = (pre, lv) => ks.filter((k) => k.split(' ▸ ').length === lv && (lv === 1 || k.startsWith(pre + ' ▸ '))).sort((a, b) => tree.get(b) - tree.get(a));
  //   줄마다 = 그 경로의 포함 몫 · 끝에 "(1% 밑 n)" = 목록에 안 든 형제 합 · "(몸통)" = 그 함수 자기 몫(아래로 안 내려간 것)
  const walk = (pre, lv) => {
    const K = kids(pre, lv); let small = 0, smallN = 0, kidSum = 0;
    for (const k of K) { const v = tree.get(k); kidSum += v; if (100 * v / tickUs < 1) { small += v; smallN++; continue; }
      console.log(`  ${'   '.repeat(lv - 1)}${(100 * v / tickUs).toFixed(1).padStart(5)}%  ${k.split(' ▸ ').pop()}`); if (lv < depth) walk(k, lv + 1); }
    const me = pre ? tree.get(pre) : tickUs;
    if (smallN) console.log(`  ${'   '.repeat(lv - 1)}${(100 * small / tickUs).toFixed(1).padStart(5)}%  (1% 밑 ${smallN}개)`);
    if (me - kidSum > 0.005 * tickUs) console.log(`  ${'   '.repeat(lv - 1)}${(100 * (me - kidSum) / tickUs).toFixed(1).padStart(5)}%  (몸통)`);
  };
  walk('', 1);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ file, totalUs: total, idleUs: idle, gcUs: gc, programUs: prog,
  self: rows(self).slice(0, 200).map(([k, v]) => ({ k, us: v })), incl: rows(incl).slice(0, 400).map(([k, v]) => ({ k, us: v })) }, null, 1));
