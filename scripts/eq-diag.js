#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1420 평형 진단 자 · 읽기만 · 판정 0)
// === scripts/eq-diag.js — 날마다 관측 줄(`T1420_OBS` · 시드 여럿)에서 평형 곡선 · 기준 후보 든 날 · 해 창 평균 · 진폭 표 + 곡선 SVG ==========
//   node scripts/eq-diag.js --out <폴더> <시드>=<obs.json> …
//   ⇒ <폴더>/diag.json · diag.md(표) · curve.svg(날마다 인구(옅은 줄) · 365날 이동 평균(굵은 줄) · 시드마다 색)
'use strict';
const fs = require('fs');
const path = require('path');
const Cr = require('./lib-eq-crit');
const A = process.argv.slice(2);
const OUT = A.includes('--out') ? A[A.indexOf('--out') + 1] : '.';
const runs = A.filter((x, i) => x.includes('=') && A[i - 1] !== '--out').map((x) => { const [s, f] = x.split('='); return { seed: s, rows: JSON.parse(fs.readFileSync(f, 'utf8')).rows }; });
fs.mkdirSync(OUT, { recursive: true });
const C = Cr.COL, W = 365;
const roll = (ys, w) => ys.map((_, i) => (i + 1 >= w ? Cr.mean(ys.slice(i + 1 - w, i + 1)) : null));
const J = { W, seeds: {} };
const L = ['| 시드 | 날 | 인구 | 해 평균 인구(앞 365날) | 앞 해 대비 | 해 안 진폭(최대 − 최소 ÷ 평균) | 산 마을 | 식량 날치 해 평균 | 식량 날치 진폭 |', '|---|---|---|---|---|---|---|---|---|'];
for (const r of runs) {
  const ser = Cr.series(r.rows, W), at = new Map(ser.map((s) => [s.d, s]));
  const pops = r.rows.map((x) => x[C.pop]), m365 = roll(pops, W);
  const marks = [365, 730, 1095, 1460, r.rows[r.rows.length - 1][C.d]];
  const tab = [];
  for (const d of marks) {
    const i = r.rows.findIndex((x) => x[C.d] === d); if (i < 0) continue;
    const s = at.get(d);
    const cur = r.rows.slice(Math.max(0, i - W + 1), i + 1);
    const pm = Cr.mean(cur.map((x) => x[C.pop])), amp = (Math.max(...cur.map((x) => x[C.pop])) - Math.min(...cur.map((x) => x[C.pop]))) / pm;
    const fdm = Cr.mean(cur.map((x) => x[C.fd]).filter((x) => x != null)), fda = (Math.max(...cur.map((x) => x[C.fd] || 0)) - Math.min(...cur.map((x) => x[C.fd] || 0))) / (fdm || 1);
    const row = { d, pop: r.rows[i][C.pop], yMean: Math.round(pm), vsPrev: s ? +(s.c1 * 100).toFixed(2) : null, amp: +(amp * 100).toFixed(1), alive: r.rows[i][C.alive], fdMean: +fdm.toFixed(1), fdAmp: +(fda * 100).toFixed(1) };
    tab.push(row);
    L.push(`| ${r.seed} | ${d} | ${row.pop} | ${row.yMean} | ${row.vsPrev != null ? row.vsPrev + '%' : '—'} | ${row.amp}% | ${row.alive} | ${row.fdMean} | ${row.fdAmp}% |`);
  }
  // 해 안 고리 — 한 해 안의 날(0 ~ 364)별 인구 · 식량 날치를 마지막 두 해에서 견준다(같은 철에 같은 꼴이면 고리)
  const last = r.rows.slice(-2 * W), y1 = last.slice(0, W), y2 = last.slice(W);
  let cyc = null;
  if (y2.length === W) {
    const d1 = y1.map((x) => x[C.pop] / Cr.mean(y1.map((q) => q[C.pop]))), d2 = y2.map((x) => x[C.pop] / Cr.mean(y2.map((q) => q[C.pop])));
    const m1 = Cr.mean(d1), m2 = Cr.mean(d2); let sxy = 0, sxx = 0, syy = 0;
    for (let k = 0; k < W; k++) { sxy += (d1[k] - m1) * (d2[k] - m2); sxx += (d1[k] - m1) ** 2; syy += (d2[k] - m2) ** 2; }
    cyc = +(sxy / Math.sqrt(sxx * syy || 1)).toFixed(3);   // 두 해의 철 꼴 상관(1 = 같은 고리)
  }
  J.seeds[r.seed] = { tab, crit: Cr.table(r.rows, W), cycCorr: cyc, last: r.rows[r.rows.length - 1].slice(0, 4), seriesTail: ser.filter((s) => s.d % 50 === 0) };
  r.m365 = m365;
}
L.push('', '기준 후보 든 날(처음 참이 되고 끝까지 참 · 창 365날 · 안 듦 = 끝 날에 거짓):', '');
const keys = Object.keys(Cr.table(runs[0].rows, W).enter);
L.push('| 기준 | ' + runs.map((r) => r.seed).join(' | ') + ' |', '|---|' + runs.map(() => '---|').join(''));
for (const k of keys) L.push(`| ${k} | ` + runs.map((r) => J.seeds[r.seed].crit.enter[k] ?? '안 듦').join(' | ') + ' |');
L.push('', '두 해 철 꼴 상관(마지막 두 해 · 해 평균으로 나눈 인구 · 1 = 같은 고리): ' + runs.map((r) => `${r.seed} ${J.seeds[r.seed].cycCorr}`).join(' · '));
fs.writeFileSync(path.join(OUT, 'diag.json'), JSON.stringify(J, null, 1));
fs.writeFileSync(path.join(OUT, 'diag.md'), L.join('\n') + '\n');
// 곡선 SVG
const Wd = 960, Ht = 420, pad = 50, maxD = Math.max(...runs.map((r) => r.rows[r.rows.length - 1][C.d])), maxP = Math.max(...runs.map((r) => Math.max(...r.rows.map((x) => x[C.pop])))) * 1.05;
const X = (d) => pad + (Wd - 2 * pad) * d / maxD, Y = (p) => Ht - pad - (Ht - 2 * pad) * p / maxP;
const col = ['#1f77b4', '#d62728', '#2ca02c', '#9467bd'];
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Ht}" font-family="sans-serif" font-size="12"><rect width="100%" height="100%" fill="#fff"/>`;
for (let d = 0; d <= maxD; d += 200) svg += `<line x1="${X(d)}" y1="${pad}" x2="${X(d)}" y2="${Ht - pad}" stroke="#eee"/><text x="${X(d)}" y="${Ht - pad + 16}" text-anchor="middle">${d}</text>`;
for (let p = 0; p <= maxP; p += 1000) svg += `<line x1="${pad}" y1="${Y(p)}" x2="${Wd - pad}" y2="${Y(p)}" stroke="#eee"/><text x="${pad - 6}" y="${Y(p) + 4}" text-anchor="end">${p}</text>`;
runs.forEach((r, i) => {
  svg += `<polyline fill="none" stroke="${col[i]}" stroke-opacity="0.35" stroke-width="1" points="${r.rows.map((x) => `${X(x[C.d]).toFixed(1)},${Y(x[C.pop]).toFixed(1)}`).join(' ')}"/>`;
  svg += `<polyline fill="none" stroke="${col[i]}" stroke-width="2.5" points="${r.rows.map((x, k) => (r.m365[k] != null ? `${X(x[C.d]).toFixed(1)},${Y(r.m365[k]).toFixed(1)}` : null)).filter(Boolean).join(' ')}"/>`;
  svg += `<text x="${Wd - pad - 120}" y="${pad + 16 + i * 16}" fill="${col[i]}">시드 ${r.seed}</text>`;
});
svg += `<text x="${pad}" y="${pad - 14}">랩 세계 인구(옅은 줄 = 날마다 · 굵은 줄 = 365날 이동 평균) · 가로 = 날</text></svg>`;
fs.writeFileSync(path.join(OUT, 'curve.svg'), svg);
console.log(L.join('\n'));
