#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T762 표 기계 · 판 파일만 읽는다)
// === scripts/t762-sbc-table.js — 서버 기준선 자(T650 · 3시드 400날 · 몸 0) 팔마다 여덟 수 + 장부 캐러밴 수 ==========
//   node scripts/t762-sbc-table.js <이름>=<폴더> …   ⇒ 폴더마다 `sbc-<시드>.json`(t577 판 JSON) · `sbc-<시드>.log`(존 로그)
//   장부 캐러밴 수 = 날마다 존 로그 `캐러밴 실체 a/X` 의 X(`world.caravans.length` — 몸 상한 60 을 넘는 날 = 몸이 켜진 판이면 몸 없이 가는 캐러밴이 있는 날)
'use strict';
const fs = require('fs');
const path = require('path');
const arms = process.argv.slice(2).map((x) => x.split('='));
const SEEDS = [1020, 7, 42];
const K = ['pop', 'dead', 'ever', 'weapQ', 'expand', 'board', 'toolQ', 'preserve', 'grain'];
const rows = {};
for (const [name, dir] of arms) for (const s of SEEDS) {
  const J = JSON.parse(fs.readFileSync(path.join(dir, `sbc-${s}.json`), 'utf8'));
  const L = fs.readFileSync(path.join(dir, `sbc-${s}.log`), 'utf8');
  const X = [...L.matchAll(/econ day (\d+):.*?캐러밴 실체 \d+\/(\d+)/g)].map((m) => +m[2]);
  rows[`${name}|${s}`] = { e: J.eight, dis: J.dissolved, empty: J.empty, deadTot: J.deadTot, tk: J.tradersKilled, loot: J.bandit && J.bandit.loot,
    car: { mean: X.reduce((a, b) => a + b, 0) / Math.max(1, X.length), max: Math.max(0, ...X), over60: X.filter((x) => x > 60).length, n: X.length } };
}
console.log(`| 팔 | 시드 | ${K.join(' | ')} | 해체 · 빈 마을 | 죽음 누계 | 행상 피살 · 약탈 | 장부 캐러밴(평균 · 최대 · 60 넘는 날) |`);
console.log(`|---|---|${K.map(() => '---:').join('|')}|---|---:|---|---|`);
for (const [name] of arms) for (const s of SEEDS) {
  const r = rows[`${name}|${s}`];
  console.log(`| ${name} | ${s} | ${K.map((k) => r.e[k]).join(' | ')} | ${r.dis} · ${r.empty} | ${r.deadTot} | ${r.tk} · ${r.loot} | ${r.car.mean.toFixed(1)} · ${r.car.max} · ${r.car.over60}/${r.car.n} |`);
}
// 끔 대비 비(시드 평균)
const base = arms[0][0];
console.log(`\n| 팔 ÷ ${base}(3시드 합) | ${K.join(' | ')} | 장부 캐러밴 평균 |`);
console.log(`|---|${K.map(() => '---:').join('|')}|---:|`);
for (const [name] of arms) {
  const sum = (n, f) => SEEDS.reduce((a, s) => a + f(rows[`${n}|${s}`]), 0);
  console.log(`| ${name} | ${K.map((k) => { const b = sum(base, (r) => r.e[k]); return b ? (sum(name, (r) => r.e[k]) / b).toFixed(3) : '—'; }).join(' | ')} | ${(sum(name, (r) => r.car.mean) / sum(base, (r) => r.car.mean)).toFixed(3)} |`);
}
