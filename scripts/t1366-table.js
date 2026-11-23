#!/usr/bin/env node
// === scripts/t1366-table.js — T1366 e2e 한 종당 스무 판 표(러너 밖 · 로그만 읽는다) ===
//
// 읽는 것: $R/pool.txt("이름 판 결과(G/R/Y) rc 초" 한 줄씩 — 계측/T1366_2026-11-18/e2e20.sh 가 쓴다)
//          $R/logs/<이름>.<판>.log(빨강 판의 첫 ✗ 줄 글자)
// 내는 것: 종마다 빨강 ○/n · 유보 ○ · 걸린 초(중앙 · 최대) · 빨강 판의 첫 ✗ 줄(같은 줄인가) · 가름
//   가름  ㉮ 늘 빨강(유보 뺀 판이 모두 빨강)  ㉯ 같은 줄에서 흔들림  ㉰ 판마다 다른 줄에서 흔들림  ㉱ 초록 n/n
//         ㉲ 빨강 0 · 유보 섞임(초록 n/n 이 아니라 따로 둔다)
//   "같은 줄"은 첫 ✗ 줄의 숫자(음수 부호 포함)를 # 로 바꾼 글자가 같은 것(걸린 ms · 좌표 같은 수만 다른 줄은 같은 줄로 본다).
//   러너 자신의 판정 줄(`✗ RC=n …`)은 첫 ✗ 줄로 안 친다 — 하네스 ✗ 줄이 없으면 "(하네스 ✗ 줄 없음 · RC=n)".
// 쓰는 법: R=/dev/shm/t1366 node scripts/t1366-table.js [--json out.json]
'use strict';
const fs = require('fs');
const path = require('path');

const R = process.env.R || '/dev/shm/t1366';
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

const rows = fs.readFileSync(path.join(R, 'pool.txt'), 'utf8').split('\n').filter(Boolean)
  .map((l) => l.trim().split(/\s+/)).filter((a) => a.length >= 5)
  .map(([name, run, res, rc, sec]) => ({ name, run: +run, res, rc: +rc, sec: +sec }));

const firstX = (name, run, rc) => {
  const f = path.join(R, 'logs', `${name}.${run}.log`);
  if (!fs.existsSync(f)) return `(로그 없음 · RC=${rc})`;
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const hit = lines.find((l) => /^\s*✗/.test(l) && !/✗ RC=\d+/.test(l));
  return hit ? hit.trim().slice(0, 160) : `(하네스 ✗ 줄 없음 · RC=${rc})`;
};
const norm = (s) => s.replace(/-?\d+(\.\d+)?/g, '#');
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };

const by = new Map();
for (const r of rows) { if (!by.has(r.name)) by.set(r.name, []); by.get(r.name).push(r); }

const out = [];
for (const [name, rs] of [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  rs.sort((a, b) => a.run - b.run);
  const n = rs.length;
  const red = rs.filter((r) => r.res === 'R');
  const yubo = rs.filter((r) => r.res === 'Y').length;
  const green = rs.filter((r) => r.res === 'G').length;
  const xs = red.map((r) => ({ run: r.run, rc: r.rc, line: firstX(name, r.run, r.rc) }));
  const kinds = [...new Set(xs.map((x) => norm(x.line)))];
  let cls;
  if (red.length === 0) cls = yubo ? '㉲' : '㉱';
  else if (red.length === n - yubo) cls = '㉮';
  else cls = kinds.length === 1 ? '㉯' : '㉰';
  const secs = rs.map((r) => r.sec);
  out.push({ name, n, red: red.length, yubo, green, secMed: med(secs), secMax: Math.max(...secs), cls, kinds: kinds.length, xs });
}

const CLS = { '㉮': '늘 빨강', '㉯': '같은 줄 흔들림', '㉰': '다른 줄 흔들림', '㉱': '초록 n/n', '㉲': '빨강 0 · 유보 섞임' };
const count = (c) => out.filter((o) => o.cls === c).length;
const totSec = rows.reduce((s, r) => s + r.sec, 0);
const L = [];
L.push(`# T1366 e2e 한 종당 스무 판 — ${out.length}종 · ${rows.length}판 · 걸린 시간 ${(totSec / 3600).toFixed(1)}시간(하네스 판 합)`);
L.push('');
L.push(`가름: ${Object.keys(CLS).map((c) => `${c} ${CLS[c]} ${count(c)}`).join(' · ')} · 유보 판 합 ${out.reduce((s, o) => s + o.yubo, 0)}(${out.filter((o) => o.yubo).length}종)`);
L.push('');
L.push('| 종 | 판 | 빨강 | 유보 | 초(중앙 · 최대) | 가름 | 첫 ✗ 줄(빨강 판 · 글자 가짓수) |');
L.push('|---|---|---|---|---|---|---|');
const order = ['㉮', '㉯', '㉰', '㉲', '㉱'];
for (const o of [...out].sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls) || b.red - a.red || a.name.localeCompare(b.name))) {
  const x = o.xs.length ? `${o.kinds}가지 — ${o.xs[0].line.replace(/\|/g, '\\|')}` : '—';
  L.push(`| ${o.name} | ${o.n} | ${o.red}/${o.n} | ${o.yubo} | ${o.secMed} · ${o.secMax} | ${o.cls} | ${x} |`);
}
L.push('');
L.push('## 빨강 판마다 첫 ✗ 줄');
for (const o of out.filter((o) => o.red)) {
  L.push(`- **${o.name}** (${o.cls} · ${o.red}/${o.n})`);
  for (const x of o.xs) L.push(`  - 판 ${x.run} · RC=${x.rc} · ${x.line}`);
}
console.log(L.join('\n'));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ species: out, runs: rows.length, totSec, counts: Object.fromEntries(Object.keys(CLS).map((c) => [c, count(c)])) }, null, 1));
