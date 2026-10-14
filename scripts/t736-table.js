#!/usr/bin/env node
'use strict';
// === scripts/t736-table.js — T736 표 기계(관찰기 `t736-observe.js` JSON 만 읽는다 · 세계를 안 세운다) ===============
//
// ★[T736 2026-10-14] 바닥 마을(물 = 51곳 최솟값)로 오는 캐러밴 — 판마다 [바닥행 · 전체 · 인일 · 1천 인일당 · 바닥행 몫]과
//   바닥 마을 하나씩 [들어옴 · 출발 상위 · 품목 상위 · 거리 중앙 · 길 위험 > 0 · 길목 갱].
//   맨 앞 두 판(기준 A = 서버 · B = 랩)으로 "인일을 맞추면 갭이 얼마나 메워지나"(A 바닥행 × B 인일 ÷ A 인일)를 낸다.
//   산수는 합 · 비 · 중앙값뿐이다(새 수 0).
//
// 실행:  node scripts/t736-table.js 서버=/tmp/t736/srv 랩=/tmp/t736/lab_base [이름=<폴더> …] [--seeds 1020,7,42]
//   폴더 안 파일: 서버 자 = `*-<시드>.t736.json`(t577 판 JSON 곁) · 랩 자 = `<시드>.json`
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const si = args.indexOf('--seeds');
const SEEDS = si >= 0 ? args[si + 1].split(',') : ['1020', '7', '42'];
const sets = args.filter((a, i) => a.includes('=') && (si < 0 || (i !== si && i !== si + 1))).map((a) => a.split('='));
function fileOf(dir, s) {
  const fs_ = fs.readdirSync(dir);
  const srv = fs_.find((f) => f.endsWith(`-${s}.t736.json`));
  if (srv) return path.join(dir, srv);
  return fs_.includes(`${s}.json`) ? path.join(dir, `${s}.json`) : null;
}
function popDays(o) {
  let t = 0;
  for (let k = 0; k + 1 < o.pop.length; k++) {
    const [d0, a] = o.pop[k], [d1, b] = o.pop[k + 1];
    t += (a.reduce((x, y) => x + y, 0) + b.reduce((x, y) => x + y, 0)) / 2 * (d1 - d0);
  }
  return t;
}
const med = (a) => { const s = a.filter((x) => x != null).sort((p, q) => p - q); return s.length ? s[s.length >> 1] : null; };
const top = (arr, n) => { const m = new Map(); for (const x of arr) m.set(x, (m.get(x) || 0) + 1); return [...m].sort((p, q) => q[1] - p[1]).slice(0, n).map(([k, v]) => `${k} ${v}`).join(' · '); };
function stat(o) {
  const F = new Set(o.floor), C = o.caravans, pd = popDays(o);
  const inF = C.filter((c) => F.has(c[2])).length;
  return { o, car: C.length, inF, pd, rate: C.length / pd * 1000, share: inF / C.length };
}
const R = sets.map(([name, dir]) => ({ name, rows: SEEDS.map((s) => { const f = fileOf(dir, s); return f ? stat(JSON.parse(fs.readFileSync(f, 'utf8'))) : null; }) }));
console.log(`\n| 판 | 바닥행 (${SEEDS.join(' · ')}) | 합 | 캐러밴 전체 | 인일(천) | 1천 인일당 | 바닥행 몫 |`);
console.log('|---|---|---:|---|---|---|---|');
const g = (rows, f) => rows.map((r) => (r ? f(r) : '—')).join(' · ');
for (const { name, rows } of R) {
  const tot = rows.reduce((a, r) => a + (r ? r.inF : 0), 0);
  console.log(`| ${name} | ${g(rows, (r) => r.inF)} | ${tot} | ${g(rows, (r) => r.car)} | ${g(rows, (r) => (r.pd / 1e3).toFixed(0))} | ${g(rows, (r) => r.rate.toFixed(2))} | ${g(rows, (r) => (r.share * 100).toFixed(1) + '%')} |`);
}
if (R.length >= 2 && R[0].rows.every(Boolean) && R[1].rows.every(Boolean)) {
  const A = R[0].rows, B = R[1].rows;
  const a = A.reduce((x, r) => x + r.inF, 0), b = B.reduce((x, r) => x + r.inF, 0);
  const pred = A.reduce((x, r, i) => x + r.inF * B[i].pd / r.pd, 0);
  console.log(`\n인일 맞춤: ${R[0].name} 바닥행 ${a} × (${R[1].name} 인일 ÷ ${R[0].name} 인일) = ${pred.toFixed(0)} — ${R[1].name} ${b} · 갭 ${b - a} 중 메운 몫 ${((pred - a) / (b - a) * 100).toFixed(0)}% · 인일 비 ${A.map((r, i) => (B[i].pd / r.pd).toFixed(2)).join(' · ')}`);
  for (let k = 2; k < R.length; k++) {
    const t = R[k].rows.reduce((x, r) => x + (r ? r.inF : 0), 0);
    if (!R[k].rows.every(Boolean)) continue;
    console.log(`  ${R[k].name}: 바닥행 ${t} — ${R[0].name} 대비 ${t - a >= 0 ? '+' : ''}${t - a} · ${R[1].name} 대비 ${t - b >= 0 ? '+' : ''}${t - b} (갭 ${b - a} 의 ${(((R[k].name.startsWith(R[1].name) ? b - t : t - a)) / (b - a) * 100).toFixed(0)}% 를 메움 — 같은 쪽 기준 판과 견줌)`);
  }
}
for (const { name, rows } of R) {
  console.log(`\n### ${name} — 바닥 마을 하나씩(시드 ${SEEDS.join(' · ')})`);
  const o0 = rows.find(Boolean); if (!o0) continue;
  console.log('| 마을 | 들어옴 | 나감 | 거리 중앙 | 길 위험>0 · 갱 | 출발 상위(시드 합) | 품목 상위(시드 합) |');
  console.log('|---|---|---|---|---|---|---|');
  o0.o.floor.forEach((fi) => {
    const N = o0.o.names;
    const per = rows.map((r) => (r ? r.o.caravans.filter((c) => c[2] === fi) : []));
    const all = [].concat(...per);
    const out = rows.map((r) => (r ? r.o.caravans.filter((c) => c[1] === fi).length : '—'));
    console.log(`| ${N[fi]} | ${per.map((p) => p.length).join(' · ')} | ${out.join(' · ')} | ${med(all.map((c) => c[5]))} | ${all.filter((c) => (c[8] || 0) > 0).length} · ${all.filter((c) => c[9] > 0).length} | ${top(all.map((c) => N[c[1]]), 3)} | ${top(all.map((c) => c[3]), 3)} |`);
  });
}
