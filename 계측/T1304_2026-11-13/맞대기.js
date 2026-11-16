#!/usr/bin/env node
'use strict';
// === 계측/T1304_2026-11-13/맞대기.js — 끔 판 두 머리의 관찰기 줄을 날 N 까지 맞댄다(결정성) · 읽기만 ===
//   쓰는 법: node 맞대기.js <기준 머리> <새 머리> [날 N=끝]
//     머리 = `<T577_DIR>/<판>-<시드>`(뒤에 .t1243.json · .t1263.json · .t1230.json) — 예: 계측/T1263_2026-11-11/OFF-1020
//   맞대는 것(시간 칸은 뺀다 — CPU · 벽 초는 판마다 다르다):
//     t1243 날 줄(`rows` — 인구 · 마을 · 식량등가 · 수확 · 농부 · 나무꾼 · 몸) · t1243 10날 줄(`ten`) ·
//     t1263 날 줄(`days` — 거둔 · 심은 · 그루) · t1263 10날 사진(`snaps` — 인구 · 죽음 · 곳간 품목 · 마을마다) ·
//     t1230 날 줄(출생 등 — 있는 열 그대로)
//   찍는 것: 갈래마다 같은 줄 수 / 맞댄 줄 수 · 첫 갈린 날 · 그날 두 값(앞 200자)
const fs = require('fs');
const [A, B, NS] = process.argv.slice(2);
if (!A || !B) { console.error('쓰는 법: node 맞대기.js <기준 머리> <새 머리> [날 N]'); process.exit(2); }
const N = NS ? +NS : Infinity;
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const TIME = /cpu|wall|sec|ms$|time|^t0$|elapsed/i;
const strip = (x) => {
  if (Array.isArray(x)) return x.map(strip);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) if (!TIME.test(k)) o[k] = strip(x[k]); return o; }
  return x;
};
const dayOf = (r) => (Array.isArray(r) ? r[0] : (r && (r.day != null ? r.day : r.d)));
function cmp(name, ra, rb) {
  if (!Array.isArray(ra) || !Array.isArray(rb)) { console.log(`${name}: 자료 없음(${!!ra} · ${!!rb})`); return null; }
  const ma = new Map(ra.filter((r) => dayOf(r) <= N).map((r) => [dayOf(r) + '|' + (r && r.why ? r.why : ''), r]));
  let same = 0, n = 0, first = null;
  for (const r of rb) {
    const d = dayOf(r); if (!(d <= N)) continue;
    const k = d + '|' + (r && r.why ? r.why : '');
    if (!ma.has(k)) continue;
    n++;
    const x = JSON.stringify(strip(ma.get(k))), y = JSON.stringify(strip(r));
    if (x === y) same++; else if (!first) first = { d, x: x.slice(0, 200), y: y.slice(0, 200) };
  }
  console.log(`${name}: 같음 ${same}/${n}` + (first ? ` · 첫 갈림 날 ${first.d}\n    기준 ${first.x}\n    새   ${first.y}` : ''));
  return { name, same, n, first: first ? first.d : null };
}
const out = [];
const a43 = rd(A + '.t1243.json'), b43 = rd(B + '.t1243.json');
out.push(cmp('t1243 날 줄', a43 && a43.rows, b43 && b43.rows));
out.push(cmp('t1243 10날 줄', a43 && a43.ten, b43 && b43.ten));
const a63 = rd(A + '.t1263.json'), b63 = rd(B + '.t1263.json');
out.push(cmp('t1263 날 줄', a63 && a63.days, b63 && b63.days));
out.push(cmp('t1263 10날 사진', a63 && a63.snaps, b63 && b63.snaps));
const a30 = rd(A + '.t1230.json'), b30 = rd(B + '.t1230.json');
const rowsOf = (o) => (o ? (o.rows || o.days || o.daily || null) : null);
out.push(cmp('t1230 날 줄', rowsOf(a30), rowsOf(b30)));
if (process.env.T1304_JSON) fs.writeFileSync(process.env.T1304_JSON, JSON.stringify(out.filter(Boolean), null, 1) + '\n');
