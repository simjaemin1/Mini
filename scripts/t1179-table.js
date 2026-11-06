#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1179 표 기계 · 관찰기 판 JSON 만 읽는다 · 판정 0)
// === scripts/t1179-table.js — 작물 철 표(서버 판 자 3시드 × 800날 · T1149 관찰기 `base-<시드>.t1149.json`) ===
//   node scripts/t1179-table.js <뿌리> <판,…> [--json <파일>]   ⇒ <뿌리>/run-<판>/base-<시드>.t1149.json
//   셈(3시드 합 · 날 = econ 날 · 달 · 철 = 달력 정본 `server/calendar.js`):
//     굶어 죽음 — 누계 `_deadTot` 의 하루 차를 철 · 달로 · 가장 많이 죽은 달(보릿고개 달)
//     골짜기 — 마을마다 해마다 겨울(겨울 최저 ÷ 앞 가을 최고) · 봄(봄 최저 ÷ 앞 겨울 최고) · 평균 · 0.9 밑 마을-해
//     곳간 며칠치(곳간 식량 환산 ÷ 인구) — 달마다 가운데 · 마을-해마다 가장 낮은 날(수확 직전 최저)의 가운데 · 10%
//     밭에 선 먹을 것(`pool` ÷ 인구 · 달마다 가운데) · 보존식 재고(`pres` ÷ 인구 · 철마다 가운데)
//     교역 — 오는 식량 캐러밴(철마다 마을-날 평균) · 누계 식량 수입 증가(철마다 마을-날 평균)
//     목표 그림 칸(★재민 11-05) — 11월 1일 곳간 ÷ (인구 × 다음 6월 15일까지 날) · 마을-해 가운데 · 10% · 90% · 1 이상 몫
//     인구(400 · 800날) · 빈 마을(800날) · 출생 누계
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const RUNS = (process.argv[3] || 'off,on').split(',');
const ji = process.argv.indexOf('--json'), JOUT = ji > 0 ? process.argv[ji + 1] : null;
const SEEDS = [1020, 7, 42];
const C = require(path.join(__dirname, '..', 'server', 'calendar.js'));
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const SE = ['spring', 'summer', 'autumn', 'winter'], SEK = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const yearOf = (d) => { const t = C.dateOf(d); return t.month >= 3 ? t.year : t.year - 1; };

function one(run) {
  const o = { run, seeds: 0, deadSe: { spring: 0, summer: 0, autumn: 0, winter: 0 }, deadMo: Array(13).fill(0), dead: 0, born: 0, pop400: 0, pop800: 0, empty: 0,
    vW: [], vS: [], daysMo: Array.from({ length: 13 }, () => []), lowYr: [], poolMo: Array.from({ length: 13 }, () => []), presSe: { spring: [], summer: [], autumn: [], winter: [] },
    cover: [], carSe: { spring: [0, 0], summer: [0, 0], autumn: [0, 0], winter: [0, 0] }, impSe: { spring: [0, 0], summer: [0, 0], autumn: [0, 0], winter: [0, 0] } };
  for (const s of SEEDS) {
    const t = J(path.join(ROOT, 'run-' + run, `base-${s}.t1149.json`)); if (!t) continue;
    o.seeds++;
    const ix = Object.fromEntries(t.cols.map((c, i) => [c, i])), nV = t.names.length;
    const Y = Array.from({ length: nV }, () => ({}));
    let prev = null, last = null;
    for (const [d, vs] of t.rows) {
      const se = C.seasonOf(d), mo = C.dateOf(d).month, y = yearOf(d);
      vs.forEach((x, k) => {
        const N = x[ix.pop];
        if (prev) { const dd = Math.max(0, (x[ix.dead] || 0) - (prev[k][ix.dead] || 0)); o.deadSe[se] += dd; o.deadMo[mo] += dd;
          const di = Math.max(0, (x[ix.imp] || 0) - (prev[k][ix.imp] || 0)); if (N > 0) { o.impSe[se][0] += di; o.impSe[se][1]++; } }
        const YY = Y[k][y] || (Y[k][y] = { aMax: 0, wMax: 0, wMin: Infinity, sMin: Infinity, low: Infinity });
        if (N > 0) {
          const days = x[ix.tfe] / N;
          o.daysMo[mo].push(days); YY.low = Math.min(YY.low, days);
          if (ix.pool != null && x[ix.pool] != null) o.poolMo[mo].push(x[ix.pool] / N);
          if (ix.pres != null && x[ix.pres] != null) o.presSe[se].push(x[ix.pres] / N);
          o.carSe[se][0] += x[ix.carIn] || 0; o.carSe[se][1]++;
        }
        const Nn = N > 0 ? N : 0;
        if (se === 'autumn') YY.aMax = Math.max(YY.aMax, Nn);
        if (se === 'winter') { YY.wMax = Math.max(YY.wMax, Nn); YY.wMin = Math.min(YY.wMin, Nn); }
        if (se === 'spring') { const Yp = Y[k][y]; Yp.sMin = Math.min(Yp.sMin, Nn); }
      });
      { const t0 = C.dateOf(d); if (t0.month === 11 && t0.dom === 1) { const span = C.dayOf(t0.year + 1, 6, 15) - d; vs.forEach((x) => { if (x[ix.pop] > 0) o.cover.push(x[ix.tfe] / x[ix.pop] / span); }); } }   // ★목표 그림 칸 — 11월 1일 곳간 ÷ 다음 6월 15일까지 먹을 몫
      if (d === 400) o.pop400 += vs.reduce((a, x) => a + x[ix.pop], 0);
      prev = vs; last = vs;
    }
    o.dead += last.reduce((a, x) => a + (x[ix.dead] || 0), 0);
    o.born += last.reduce((a, x) => a + (x[ix.born] || 0), 0);
    o.pop800 += last.reduce((a, x) => a + x[ix.pop], 0);
    o.empty += last.filter((x) => !(x[ix.pop] > 0)).length;
    for (let k = 0; k < nV; k++) {
      const ys = Object.keys(Y[k]).map(Number).sort((a, b) => a - b);
      for (const y of ys) {
        const A = Y[k][y], B = Y[k][y + 1];
        if (A.aMax > 0 && isFinite(A.wMin)) o.vW.push(A.wMin / A.aMax);
        if (A.wMax > 0 && B && isFinite(B.sMin)) o.vS.push(B.sMin / A.wMax);   // 봄 = 다음 해(3월 ~)의 봄
        if (isFinite(A.low)) o.lowYr.push(A.low);
      }
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  let worstMo = 1; for (let m = 1; m <= 12; m++) if (o.deadMo[m] > o.deadMo[worstMo]) worstMo = m;
  return { run: o.run, seeds: o.seeds, dead: o.dead, deadSe: o.deadSe, deadMo: o.deadMo.slice(1), worstMo, worstMoDead: o.deadMo[worstMo],
    vWinter: r2(mean(o.vW)), vWinter09: o.vW.filter((x) => x < 0.9).length, vWinterN: o.vW.length, vSpring: r2(mean(o.vS)), vSpring09: o.vS.filter((x) => x < 0.9).length, vSpringN: o.vS.length,
    daysMo: o.daysMo.slice(1).map((a) => r2(q(a, 0.5))), lowMed: r2(q(o.lowYr, 0.5)), lowP10: r2(q(o.lowYr, 0.1)),
    poolMo: o.poolMo.slice(1).map((a) => r2(q(a, 0.5))), presSe: Object.fromEntries(SE.map((s) => [s, r2(q(o.presSe[s], 0.5))])),
    carSe: Object.fromEntries(SE.map((s) => [s, r2(o.carSe[s][1] ? o.carSe[s][0] / o.carSe[s][1] : 0)])), impSe: Object.fromEntries(SE.map((s) => [s, r2(o.impSe[s][1] ? o.impSe[s][0] / o.impSe[s][1] : 0)])),
    coverMed: r2(q(o.cover, 0.5)), coverP10: r2(q(o.cover, 0.1)), coverP90: r2(q(o.cover, 0.9)), coverOk: o.cover.filter((x) => x >= 1).length, coverN: o.cover.length,
    born: o.born, pop400: o.pop400, pop800: o.pop800, empty: o.empty };
}
const res = RUNS.map(one).filter((r) => r.seeds);
console.log('| 판 | 시드 | 굶어 죽음 800날 | 봄 · 여름 · 가을 · 겨울 | 가장 많이 죽은 달 | 골짜기 겨울(평균 · 0.9 밑) | 골짜기 봄(평균 · 0.9 밑) | 곳간 가장 낮은 날(가운데 · 10%) | 출생 | 인구 400 · 800 | 빈 마을 |');
console.log('|---|---|---:|---|---|---|---|---|---:|---|---:|');
for (const r of res) console.log(`| ${r.run} | ${r.seeds} | ${r.dead} | ${SE.map((s) => r.deadSe[s]).join(' · ')} | ${r.worstMo}월 ${r.worstMoDead} | ${r.vWinter} · ${r.vWinter09}/${r.vWinterN} | ${r.vSpring} · ${r.vSpring09}/${r.vSpringN} | ${r.lowMed} · ${r.lowP10} | ${r.born} | ${r.pop400} · ${r.pop800} | ${r.empty} |`);
console.log('\n### 목표 그림 칸 — 11월 1일 곳간 ÷ 다음 6월 15일까지 먹을 몫(마을-해)\n');
console.log('| 판 | 가운데 | 10% | 90% | 1 이상 마을-해 |');
console.log('|---|---:|---:|---:|---:|');
for (const r of res) console.log(`| ${r.run} | ${r.coverMed} | ${r.coverP10} | ${r.coverP90} | ${r.coverOk}/${r.coverN} |`);
console.log('\n### 달마다 — 곳간 며칠치(가운데) · 밭에 선 먹을 것(사람당 · 가운데) · 굶어 죽음\n');
console.log('| 판 | 칸 | ' + [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2].map((m) => m + '월').join(' | ') + ' |');
console.log('|---|---|' + '---:|'.repeat(12));
const ord = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];
for (const r of res) {
  console.log(`| ${r.run} | 곳간 며칠치 | ${ord.map((m) => r.daysMo[m - 1]).join(' | ')} |`);
  console.log(`| ${r.run} | 밭에 선 것 | ${ord.map((m) => r.poolMo[m - 1]).join(' | ')} |`);
  console.log(`| ${r.run} | 굶어 죽음 | ${ord.map((m) => r.deadMo[m - 1]).join(' | ')} |`);
}
console.log('\n### 철마다 — 보존식 재고(사람당 · 가운데) · 오는 식량 캐러밴(마을-날) · 식량 수입(마을-날)\n');
console.log('| 판 | 칸 | 봄 | 여름 | 가을 | 겨울 |');
console.log('|---|---|---:|---:|---:|---:|');
for (const r of res) {
  console.log(`| ${r.run} | 보존식 | ${SE.map((s) => r.presSe[s]).join(' | ')} |`);
  console.log(`| ${r.run} | 오는 식량 캐러밴 | ${SE.map((s) => r.carSe[s]).join(' | ')} |`);
  console.log(`| ${r.run} | 식량 수입 | ${SE.map((s) => r.impSe[s]).join(' | ')} |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ runs: res }, null, 1));
