#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1207-sbc-table.js — T1207 서버 판(3시드 × 800날 · 끔 ↔ 켬) 표 ===
//   읽는 것: `server-baseline-check.js --make … --days 800` 판 폴더 둘(끔 · 켬)의 `sbc-<시드>.json`(여덟 수 · 빈 마을)과
//     곁의 `.t1207.json`(계측 훅 — 100날마다 마을 줄: 이름 · 인구 · 영토 · 곳간 통나무 · 돌 · 나무꾼 · 채집꾼 · T1207 장부 · 수요 · 산 적 · 창설자 · 소비 EMA 통나무 · 돌 · 소비 누계)
//   쓰는 법: node scripts/t1207-sbc-table.js <끔 폴더> <켬 폴더> [--out 계측/T1207_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const OUT = (() => { const i = A.indexOf('--out'); return i >= 0 ? A[i + 1] : null; })();
const [DOFF, DON] = A.filter((x, i) => !x.startsWith('--') && A[i - 1] !== '--out');
const SEEDS = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
//   줄 칸 차례(훅과 같다)
const C = { name: 0, pop: 1, terr: 2, wood: 3, stone: 4, lj: 5, fo: 6, days: 7, stallW: 8, stallB: 9, cells: 10, pwood: 11, labor: 12, felled: 13, woodIn: 14, need: 15, ever: 16, founder: 17, emaW: 18, emaS: 19, cumW: 20 };
function sumRow(rows) {
  const s = { pop: 0, terr: 0, wood: 0, stone: 0, lj: 0, fo: 0, empty: 0, emaW: 0, emaS: 0, cumW: 0, hasEma: false, vils: rows.length };
  for (const r of rows) {
    s.pop += r[C.pop]; s.terr += r[C.terr]; s.wood += r[C.wood]; s.stone += r[C.stone]; s.lj += r[C.lj]; s.fo += r[C.fo];
    if (r[C.pop] === 0 && r[C.ever]) s.empty++;
    if (r.length > C.emaW) { s.hasEma = true; s.emaW += r[C.emaW]; s.emaS += r[C.emaS]; s.cumW += r[C.cumW]; }
  }
  return s;
}
function arm(dir, seed) {
  const run = rd(path.join(dir, `sbc-${seed}.json`)), h = rd(path.join(dir, `sbc-${seed}.json.t1207.json`));
  if (!run || !h) return null;
  const snaps = h.snaps.map((s) => Object.assign({ day: s.day, t: s.t }, sumRow(s.rows)));
  const end = snaps[snaps.length - 1];
  const mean = (k) => +(snaps.reduce((a, s) => a + s[k], 0) / snaps.length).toFixed(1);
  const t = end.t || {};
  return { seed, knob: h.knob, lastDay: h.lastDay, eight: run.eight, empty: run.empty, dissolved: run.dissolved, end, snaps,
    mean: { pop: mean('pop'), wood: mean('wood'), stone: mean('stone'), lj: mean('lj'), fo: mean('fo'), terr: mean('terr'), emaW: end.hasEma ? mean('emaW') : null, emaS: end.hasEma ? mean('emaS') : null },
    t1207: { days: t.days || 0, stallWood: t.stallWood || 0, stallBody: t.stallBody || 0, cells: t.cells || 0, wood: t.wood || 0, laborMin: t.laborMin || 0, felled: t.felled || 0, woodIn: t.woodIn || 0, need: t.need || 0,
      stallPct: t.days ? +(100 * (t.stallWood || 0) / t.days).toFixed(1) : null } };
}
const res = {};
for (const s of SEEDS) res[s] = { off: arm(DOFF, s), on: arm(DON, s) };
const f = (n, d = 0) => (n == null ? '—' : (+n).toLocaleString('en-US', { maximumFractionDigits: d }));
const pc = (a, b) => (a == null || b == null || !(a > 0) ? '—' : `${b >= a ? '+' : ''}${(100 * (b - a) / a).toFixed(1)}%`);
const md = [];
md.push('| 시드 | 팔 | 끝 날 인구 · 빈 마을 | 끝 날 영토(셀) | 곳간 통나무 · 돌(끝 날 · 100날 평균) | 나무꾼 · 채집꾼(끝 날 · 평균) | 통나무 소비 EMA 평균(날) | 영토 장부 — 넓힌 날 · 재료 막힘 % · 셀 · 말뚝 통나무 · 벤 그루 | 여덟 수 무기Q · 확장 · 도구Q · 곡물 |',
  '|---:|:-:|:-:|---:|:-:|:-:|---:|:-:|:-:|');
for (const s of SEEDS) for (const k of ['off', 'on']) {
  const r = res[s][k]; if (!r) { md.push(`| ${s} | ${k === 'off' ? '끔' : '켬'} | (판 없음) | | | | | | |`); continue; }
  const e = r.end, T = r.t1207;
  md.push(`| ${s} | ${k === 'off' ? '끔' : '켬'} | ${f(e.pop)} · ${e.empty} | ${f(e.terr)} | ${f(e.wood)} · ${f(e.stone)} (${f(r.mean.wood)} · ${f(r.mean.stone)}) | ${e.lj} · ${e.fo} (${f(r.mean.lj, 1)} · ${f(r.mean.fo, 1)}) | ${r.mean.emaW == null ? '—' : f(r.mean.emaW, 1)} | ${k === 'off' ? '—' : `${f(T.days)} · ${T.stallPct}% · ${f(T.cells)} · ${f(T.wood, 1)} · ${f(T.felled)}`} | ${r.eight.weapQ} · ${f(r.eight.expand)} · ${f(r.eight.toolQ, 1)} · ${f(r.eight.grain, 1)} |`);
}
//   합(3시드) — 켬 − 끔
const tot = (k, g) => SEEDS.reduce((a, s) => a + (res[s][k] ? g(res[s][k]) : 0), 0);
const sum = {
  popOff: tot('off', (r) => r.end.pop), popOn: tot('on', (r) => r.end.pop),
  emptyOff: tot('off', (r) => r.end.empty), emptyOn: tot('on', (r) => r.end.empty),
  terrOff: tot('off', (r) => r.end.terr), terrOn: tot('on', (r) => r.end.terr),
  woodOff: tot('off', (r) => r.mean.wood), woodOn: tot('on', (r) => r.mean.wood),
  stoneOff: tot('off', (r) => r.mean.stone), stoneOn: tot('on', (r) => r.mean.stone),
  ljOff: tot('off', (r) => r.mean.lj), ljOn: tot('on', (r) => r.mean.lj), foOff: tot('off', (r) => r.mean.fo), foOn: tot('on', (r) => r.mean.fo),
  days: tot('on', (r) => r.t1207.days), stall: tot('on', (r) => r.t1207.stallWood), stallBody: tot('on', (r) => r.t1207.stallBody),
  cells: tot('on', (r) => r.t1207.cells), postWood: tot('on', (r) => r.t1207.wood), felled: tot('on', (r) => r.t1207.felled), needEnd: tot('on', (r) => r.t1207.need),
};
const emaSeeds = SEEDS.filter((s) => res[s].off && res[s].on && res[s].off.mean.emaW != null && res[s].on.mean.emaW != null);
sum.emaSeeds = emaSeeds;
sum.emaWOff = emaSeeds.reduce((a, s) => a + res[s].off.mean.emaW, 0); sum.emaWOn = emaSeeds.reduce((a, s) => a + res[s].on.mean.emaW, 0);
sum.emaSOff = emaSeeds.reduce((a, s) => a + res[s].off.mean.emaS, 0); sum.emaSOn = emaSeeds.reduce((a, s) => a + res[s].on.mean.emaS, 0);
//   켬 판 영토 수요(하루) = 끝 날 모자람(막힌 마을이 오늘 못 치른 말뚝 통나무) — 같은 시드들의 끔 소비 EMA 대비
sum.needSeeds = emaSeeds.reduce((a, s) => a + res[s].on.t1207.need, 0);
sum.stallPct = sum.days ? +(100 * sum.stall / sum.days).toFixed(1) : null;
md.push('', `**3시드 합** — 끝 날 인구 ${f(sum.popOff)} → ${f(sum.popOn)}(${pc(sum.popOff, sum.popOn)}) · 빈 마을 ${sum.emptyOff} → ${sum.emptyOn} · 끝 날 영토 ${f(sum.terrOff)} → ${f(sum.terrOn)}(${pc(sum.terrOff, sum.terrOn)}) · `
  + `곳간 통나무(100날 평균 합) ${f(sum.woodOff)} → ${f(sum.woodOn)} · 돌 ${f(sum.stoneOff)} → ${f(sum.stoneOn)} · 나무꾼(평균) ${f(sum.ljOff, 1)} → ${f(sum.ljOn, 1)}(${pc(sum.ljOff, sum.ljOn)}) · 채집꾼 ${f(sum.foOff, 1)} → ${f(sum.foOn, 1)}(${pc(sum.foOff, sum.foOn)})`,
  `켬 영토 장부 — 넓히려 한 날 ${f(sum.days)} 중 통나무 막힘 ${f(sum.stall)}(${sum.stallPct}%) · 몸 막힘 ${f(sum.stallBody)} · 넓힌 셀 ${f(sum.cells)} · 말뚝 통나무 ${f(sum.postWood, 1)} · 벤 그루 ${f(sum.felled)} · 끝 날 모자람 ${f(sum.needEnd, 1)}`,
  emaSeeds.length ? `통나무 소비 EMA(100날 평균 · 시드 ${emaSeeds.join('·')}) ${f(sum.emaWOff, 1)} → ${f(sum.emaWOn, 1)}/날(${pc(sum.emaWOff, sum.emaWOn)}) · 돌 ${f(sum.emaSOff, 1)} → ${f(sum.emaSOn, 1)}(${pc(sum.emaSOff, sum.emaSOn)}) · 켬 끝 날 영토 모자람 ${f(sum.needSeeds, 1)}/날 = 끔 소비의 ${sum.emaWOff ? (100 * sum.needSeeds / sum.emaWOff).toFixed(1) : '—'}%` : '(소비 EMA 칸이 선 시드 없음)');
const txt = md.join('\n');
console.log(txt);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 't1207-sbc800.json'), JSON.stringify({ dirs: { off: DOFF, on: DON }, sum, seeds: res }, null, 1));
  fs.writeFileSync(path.join(OUT, 't1207-sbc800.md'), txt + '\n');
  console.log(`\n→ ${OUT}/t1207-sbc800.{json,md}`);
}
