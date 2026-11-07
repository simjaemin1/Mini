#!/usr/bin/env node
// (@regress 없음 — 판 JSON 읽기만 · 세계를 안 세운다 · 판정 0)
// === scripts/t1213-sbc-table.js — T1213 게이트 표: main 기준선 11-07 판 자(가상 시계 · 400날) — 끔 ↔ T1207 켬(+T1213) ↔ T1207 켬 · T1213 끔 ===
//   읽는 것: `server-baseline-check.js` 판 폴더(끔 = 기준선 견주기 · 켬 · 켬0 = `--make`)의 `sbc-<시드>.json`(여덟 수 · 빈 마을)과
//     곁의 `.t1213.json`(계측 훅 — 50날마다 마을 줄 · 칸 차례는 아래 C).
//   쓰는 법: node scripts/t1213-sbc-table.js --off <폴더> --on <폴더> [--on0 <폴더>] [--same "3/3"] [--out 계측/T1213_<날짜>]
'use strict';
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2);
const opt = (k) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : null; };
const DIRS = { off: opt('--off'), on: opt('--on'), on0: opt('--on0') };
const SAME = opt('--same'), OUT = opt('--out');
const SEEDS = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const C = { name: 0, pop: 1, terr: 2, wood: 3, stone: 4, lj: 5, fo: 6, days: 7, stallW: 8, stallB: 9, cells: 10, pwood: 11, labor: 12, felled: 13, woodIn: 14, need: 15, ever: 16, founder: 17,
  emaW: 18, emaS: 19, cumW: 20, ma: 21, fa: 22, bW: 23, bS: 24, kilnW: 25, ch: 26 };
const KS = ['pop', 'terr', 'wood', 'stone', 'lj', 'fo', 'ma', 'fa', 'emaW', 'emaS', 'bW', 'bS', 'need', 'ch'];
function sumRow(rows) {
  const s = { empty: 0, vils: rows.length }; for (const k of KS) s[k] = 0;
  for (const r of rows) { for (const k of KS) s[k] += r[C[k]] || 0; if (r[C.pop] === 0 && r[C.ever]) s.empty++; }
  return s;
}
function arm(dir, seed) {
  if (!dir) return null;
  const run = rd(path.join(dir, `sbc-${seed}.json`)), h = rd(path.join(dir, `sbc-${seed}.json.t1213.json`));
  if (!run || !h) return null;
  const snaps = h.snaps.map((s) => Object.assign({ day: s.day, t: s.t }, sumRow(s.rows)));
  const end = snaps[snaps.length - 1], t = end.t || {};
  const mean = {}; for (const k of KS) mean[k] = +(snaps.reduce((a, s) => a + s[k], 0) / snaps.length).toFixed(2);
  return { seed, knob: h.knob, add: h.add, lastDay: h.lastDay, eight: run.eight, empty: run.empty, end, mean, snaps,
    t1207: { days: t.days || 0, stallWood: t.stallWood || 0, stallBody: t.stallBody || 0, cells: t.cells || 0, wood: t.wood || 0, felled: t.felled || 0, need: t.need || 0,
      stallPct: t.days ? +(100 * (t.stallWood || 0) / t.days).toFixed(1) : null } };
}
const res = {}; for (const s of SEEDS) res[s] = { off: arm(DIRS.off, s), on: arm(DIRS.on, s), on0: arm(DIRS.on0, s) };
const f = (n, d = 0) => (n == null ? '—' : (+n).toLocaleString('en-US', { maximumFractionDigits: d }));
const pc = (a, b) => (a == null || b == null || !(a > 0) ? '—' : `${b >= a ? '+' : ''}${(100 * (b - a) / a).toFixed(1)}%`);
const NAME = { off: '끔', on: '켬(T1207+T1213)', on0: '켬 · T1213 끔' };
const md = [];
md.push('| 시드 | 판 | 끝 날 인구 · 빈 마을 | 끝 날 영토 | 곳간 통나무 · 돌(끝 · 평균) | 나무꾼 · 채집꾼 · 석공 · 농부(끝 · 평균 나무꾼) | 짓는 수요 통나무 · 돌(평균) | 통나무 소비 EMA(평균) | 영토 — 넓히려 한 날 · 재료 막힘 · 넓힌 셀 · 말뚝 통나무 | 무기Q · 확장 · 곡물 |',
  '|---:|:-:|:-:|---:|:-:|:-:|:-:|---:|:-:|:-:|');
for (const s of SEEDS) for (const k of ['off', 'on0', 'on']) {
  const r = res[s][k]; if (!r) continue;
  const e = r.end, T = r.t1207, m = r.mean;
  md.push(`| ${s} | ${NAME[k]} | ${f(e.pop)} · ${e.empty} | ${f(e.terr)} | ${f(e.wood)} · ${f(e.stone)}(${f(m.wood)} · ${f(m.stone)}) | ${e.lj} · ${e.fo} · ${e.ma} · ${e.fa}(${f(m.lj, 1)}) | ${k === 'on' ? `${f(m.bW)} · ${f(m.bS, 1)}` : '—'} | ${f(m.emaW, 1)} | ${k === 'off' ? '—' : `${f(T.days)} · ${T.stallPct}% · ${f(T.cells)} · ${f(T.wood, 1)}`} | ${r.eight.weapQ} · ${f(r.eight.expand)} · ${f(r.eight.grain)} |`);
}
const tot = (k, g) => SEEDS.reduce((a, s) => a + (res[s][k] ? g(res[s][k]) : 0), 0);
const have = (k) => SEEDS.filter((s) => res[s][k]);
const sum = {};
for (const k of ['off', 'on']) {
  sum[k] = { seeds: have(k), pop: tot(k, (r) => r.end.pop), empty: tot(k, (r) => r.end.empty), terr: tot(k, (r) => r.end.terr), lj: tot(k, (r) => r.mean.lj), ljEnd: tot(k, (r) => r.end.lj),
    fo: tot(k, (r) => r.mean.fo), ma: tot(k, (r) => r.mean.ma), fa: tot(k, (r) => r.mean.fa), wood: tot(k, (r) => r.mean.wood), stone: tot(k, (r) => r.mean.stone), emaW: tot(k, (r) => r.mean.emaW),
    days: tot(k, (r) => r.t1207.days), stall: tot(k, (r) => r.t1207.stallWood), cells: tot(k, (r) => r.t1207.cells), postWood: tot(k, (r) => r.t1207.wood) };
  sum[k].stallPct = sum[k].days ? +(100 * sum[k].stall / sum[k].days).toFixed(1) : null;
}
//   시드별 게이트(인구 ≥ 끔의 95% · 빈 마을 ≤ 끔)
const gate = SEEDS.filter((s) => res[s].off && res[s].on).map((s) => ({ seed: s, popRatio: +(res[s].on.end.pop / res[s].off.end.pop).toFixed(3), emptyOff: res[s].off.end.empty, emptyOn: res[s].on.end.empty,
  popOk: res[s].on.end.pop >= 0.95 * res[s].off.end.pop, emptyOk: res[s].on.end.empty <= res[s].off.end.empty }));
sum.gate = gate;
sum.popRatio = sum.off.pop ? +(sum.on.pop / sum.off.pop).toFixed(3) : null;
sum.gatePass = gate.length === 3 && gate.every((g) => g.popOk && g.emptyOk) && sum.popRatio >= 0.95 && sum.on.empty <= sum.off.empty;
//   시드 1020 셋(끔 · 켬0 · 켬) — T1213 몫 가르기
const s0 = res[1020];
if (s0.on0) sum.s1020 = { off: s0.off && { pop: s0.off.end.pop, empty: s0.off.end.empty, lj: s0.off.mean.lj }, on0: { pop: s0.on0.end.pop, empty: s0.on0.end.empty, lj: s0.on0.mean.lj, stallPct: s0.on0.t1207.stallPct, cells: s0.on0.t1207.cells },
  on: s0.on && { pop: s0.on.end.pop, empty: s0.on.end.empty, lj: s0.on.mean.lj, stallPct: s0.on.t1207.stallPct, cells: s0.on.t1207.cells } };
md.push('', `**3시드 합(끔 ↔ 켬)** — 끝 날 인구 ${f(sum.off.pop)} → ${f(sum.on.pop)}(${pc(sum.off.pop, sum.on.pop)} · 비 ${sum.popRatio}) · 빈 마을 ${sum.off.empty} → ${sum.on.empty} · 끝 날 영토 ${f(sum.off.terr)} → ${f(sum.on.terr)} · `
  + `나무꾼(평균) ${f(sum.off.lj, 1)} → ${f(sum.on.lj, 1)}(${pc(sum.off.lj, sum.on.lj)}) · 채집꾼 ${f(sum.off.fo, 1)} → ${f(sum.on.fo, 1)} · 석공 ${f(sum.off.ma, 1)} → ${f(sum.on.ma, 1)} · 농부 ${f(sum.off.fa, 1)} → ${f(sum.on.fa, 1)} · 곳간 통나무(평균) ${f(sum.off.wood)} → ${f(sum.on.wood)} · 돌 ${f(sum.off.stone)} → ${f(sum.on.stone)}`,
  `켬 영토 장부 — 넓히려 한 날 ${f(sum.on.days)} 중 통나무 막힘 ${f(sum.on.stall)}(${sum.on.stallPct}%) · 넓힌 셀 ${f(sum.on.cells)} · 말뚝 통나무 ${f(sum.on.postWood, 1)}`,
  `게이트(시드별) — ${gate.map((g) => `${g.seed}: 인구 비 ${g.popRatio}${g.popOk ? '' : '✗'} · 빈 마을 ${g.emptyOff} → ${g.emptyOn}${g.emptyOk ? '' : '✗'}`).join(' · ')} · 끔 판 = main 기준선 ${SAME || '?'} ⇒ ${sum.gatePass && SAME === '3/3' ? '선다' : '안 선다'}`,
  sum.s1020 ? `시드 1020 셋 — 끔 인구 ${f(sum.s1020.off && sum.s1020.off.pop)} · 켬0(T1213 끔) ${f(sum.s1020.on0.pop)}(막힘 ${sum.s1020.on0.stallPct}% · 셀 ${f(sum.s1020.on0.cells)} · 나무꾼 평균 ${f(sum.s1020.on0.lj, 1)}) · 켬 ${f(sum.s1020.on && sum.s1020.on.pop)}(막힘 ${sum.s1020.on && sum.s1020.on.stallPct}% · 셀 ${f(sum.s1020.on && sum.s1020.on.cells)} · 나무꾼 평균 ${f(sum.s1020.on && sum.s1020.on.lj, 1)})` : '(켬0 판 없음)');
const txt = md.join('\n');
console.log(txt);
if (OUT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 't1213-sbc400.json'), JSON.stringify({ dirs: DIRS, same: SAME, sum, seeds: res }, null, 1));
  fs.writeFileSync(path.join(OUT, 't1213-sbc400.md'), txt + '\n');
  console.log(`\n→ ${OUT}/t1213-sbc400.{json,md}`);
}
