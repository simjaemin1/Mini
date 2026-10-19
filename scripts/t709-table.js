#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T709 표 기계 · 판 JSON 만 읽는다)
// === scripts/t709-table.js — 아홉째 판 후보 표: 3시드 두 자(t17 · t176-ab) 팔마다 인구 · 소멸 · 바뀐 마을 · 0 마을 ==========
//   node scripts/t709-table.js <폴더> <기준 팔> <팔> …   ⇒ `<폴더>/t17-<팔>-<시드>.json` · `<폴더>/t176-<팔>-<시드>.json`
//   바뀐 마을 = 기준 팔과 마을 인구(vpop)가 다른 곳 · 0 마을 = 판 끝 인구 0 · 남해안 = 이름 표(인자 --south a,b,c)
'use strict';
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const pos = a.filter((x, i) => !x.startsWith('--') && !(a[i - 1] || '').startsWith('--'));
const [DIR, BASE, ...ARMS] = pos;
const SOUTH = new Set((opt('--south') || '').split(',').filter(Boolean));
const SEEDS = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } };
const vmap = (J) => { if (!J) return null; const v = J.vpop || (J.final && J.final.vpop) || (Array.isArray(J.per) ? J.per.map((x) => ({ name: x.name, pop: x.N })) : null); if (!v) return null; const m = new Map(); for (const x of v) m.set(x.name, x.pop); return m; };   // t17 = vpop · t176 = per[].N
const obj = (x) => (x && typeof x === 'object' ? x : null);
const popOf = (J) => J && ((obj(J.base) && J.base.pop) ?? (obj(J.eight) && J.eight.pop) ?? J.pop);   // t176 의 base 는 글자("")
const deadOf = (J) => J && ((obj(J.base) && J.base.dead) ?? (obj(J.eight) && J.eight.dead) ?? J.dead);
for (const ruler of ['t17', 't176']) {
  console.log(`\n### ${ruler}\n`);
  console.log(`| 팔 | 시드 | 인구 | Δ(÷ ${BASE}) | 소멸 | 바뀐 마을 | 그중 남해안 | 0 마을 | 가장 큰 움직임 셋 |`);
  console.log('|---|---|---:|---:|---:|---:|---|---|---|');
  for (const arm of [BASE, ...ARMS]) for (const s of SEEDS) {
    const J = rd(`${ruler}-${arm}-${s}.json`), B = rd(`${ruler}-${BASE}-${s}.json`);
    if (!J) { console.log(`| ${arm} | ${s} | (없음) | | | | | | |`); continue; }
    const p = popOf(J), pb = popOf(B), vm = vmap(J), vb = vmap(B);
    let ch = [], zero = [];
    if (vm) { for (const [n, v] of vm) { if (v === 0) zero.push(n); if (vb && vb.get(n) !== v) ch.push([n, v - (vb.get(n) || 0)]); } }
    ch.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
    const sc = ch.filter(([n]) => SOUTH.has(n)).map(([n, d]) => `${n} ${d > 0 ? '+' : ''}${d}`).join(' · ');
    console.log(`| ${arm} | ${s} | ${p != null ? p.toLocaleString('en-US') : '—'} | ${pb && arm !== BASE ? `${p - pb > 0 ? '+' : ''}${p - pb} (${((p - pb) / pb * 100).toFixed(1)}%)` : '—'} | ${deadOf(J)} | ${vm && arm !== BASE ? ch.length : '—'} | ${arm !== BASE ? (sc || '—') : '—'} | ${zero.length ? zero.join(' · ') : '0'} | ${arm !== BASE ? ch.slice(0, 3).map(([n, d]) => `${n} ${d > 0 ? '+' : ''}${d}`).join(' · ') : '—'} |`);
  }
}
