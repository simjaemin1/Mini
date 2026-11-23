#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1426 ②③ 진단 자 · 읽기만 · 판정 0)
// === scripts/eq-grow-diag.js — 긴 랩 판의 관측 두 줄(`T1420_OBS` · `T1426_GROW`)에서 해마다 "무엇이 인구를 묶나" 표 ==========
//   node scripts/eq-grow-diag.js --out <폴더> <시드>=<obs.json>,<grow.json> …
//   ⇒ <폴더>/grow.json · grow.md
//   해(365날 창)마다: 해 평균 인구 · 앞 해 대비 · 태어남 ÷ 인구(태어남 = 인구 차 + 죽음 + 떠남) · 죽음 ÷ 인구(자연사 · 굶음 · 그 밖 = K 넘김 로지스틱 · 싸움) ·
//     K 세 몫 합(slot · prod · fuel) · 무는 몫 마을 수(해 끝 날) · 주거 문 막힌 마을-날 · dP > 0 마을-날 · 영토 크기 · 그 해 산 셀 · 확장 멈춘 마을(MB < MC) ·
//     식량 날치 해 평균 · 식량 값 해 평균 · 직업 몫(농부 · 채집 · 사냥 · 어부 · 나무꾼) · 행복 · 건강 평균
'use strict';
const fs = require('fs');
const path = require('path');
const Cr = require('./lib-eq-crit');
const A = process.argv.slice(2);
const OUT = A.includes('--out') ? A[A.indexOf('--out') + 1] : '.';
const W = 365;
const runs = A.filter((x, i) => x.includes('=') && A[i - 1] !== '--out').map((x) => {
  const [seed, files] = x.split('='); const [fo, fg] = files.split(',');
  const rd = (f) => JSON.parse(/\.gz$/.test(f) ? require('zlib').gunzipSync(fs.readFileSync(f)) : fs.readFileSync(f, 'utf8'));
  return { seed, obs: rd(fo), grow: rd(fg) };
});
fs.mkdirSync(OUT, { recursive: true });
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const J = { W, seeds: {} };
const L = [];
for (const r of runs) {
  const O = r.obs.rows, G = r.grow.rows, GC = r.grow.cols, gi = (k) => GC.indexOf(k), C = Cr.COL;
  const gAt = new Map(G.map((x) => [x[0], x])), oAt = new Map(O.map((x) => [x[C.d], x]));
  const endD = Math.min(O[O.length - 1][C.d], G[G.length - 1][0]);
  const years = [];
  let prevMean = null;
  for (let y = 1; y * W <= endD; y++) {
    const d0 = (y - 1) * W, d1 = y * W;
    const o = O.filter((x) => x[C.d] > d0 && x[C.d] <= d1), g = G.filter((x) => x[0] > d0 && x[0] <= d1);
    const g0 = gAt.get(d0) || null, g1 = gAt.get(d1);
    const pm = mean(o.map((x) => x[C.pop]));
    const N0 = g0 ? g0[gi('N')] : g[0][gi('N')], N1 = g1[gi('N')];
    const dd = (k) => g1[gi(k)] - (g0 ? g0[gi(k)] : 0);
    const nat = dd('natDead'), fd = dd('fdDead'), dead = dd('dead'), emig = dd('emig');
    const births = (N1 - N0) + dead + emig;
    const jobs = {}; for (const x of o) for (const [k, v] of Object.entries(x[C.jobs] || {})) jobs[k] = (jobs[k] || 0) + v / o.length;
    const row = {
      y, d: d1, popMean: Math.round(pm), vsPrev: prevMean ? +((pm / prevMean - 1) * 100).toFixed(2) : null, N: N1,
      birthPerN: +(births / pm * 100).toFixed(2), deathPerN: +(dead / pm * 100).toFixed(2), natPerN: +(nat / pm * 100).toFixed(2), famPerN: +(fd / pm * 100).toFixed(2),
      otherPerN: +((dead - nat - fd) / pm * 100).toFixed(2), emig,
      K: Math.round(g1[gi('K')]), slot: Math.round(g1[gi('slot')]), prod: Math.round(g1[gi('prod')]), fuel: Math.round(g1[gi('fuel')]), NoverK: +(N1 / g1[gi('K')]).toFixed(3),
      bind: { slot: g1[gi('bindSlot')], prod: g1[gi('bindProd')], fuel: g1[gi('bindFuel')] },
      gatedDays: g.reduce((a, x) => a + x[gi('gated')], 0), dpPosDays: g.reduce((a, x) => a + x[gi('dpPos')], 0),
      land: +g1[gi('landSize')].toFixed(1), cellsYear: dd('expCells'), expVillageDays: g.reduce((a, x) => a + x[gi('expToday')], 0), mbmcStop: g1[gi('mbmcStop')],
      fdMean: +mean(o.map((x) => x[C.fd]).filter((x) => x != null)).toFixed(1), foodPrice: +mean(o.map((x) => (x[C.price] || {}).food).filter((x) => x != null)).toFixed(3),
      jobs: Object.fromEntries(['farmer', 'forager', 'hunter', 'fisher', 'lumberjack'].map((k) => [k, +((jobs[k] || 0) * 100).toFixed(1)])),
      h: +mean(g.map((x) => x[gi('hMean')])).toFixed(3), health: +mean(g.map((x) => x[gi('healthMean')])).toFixed(3),
    };
    years.push(row); prevMean = pm;
  }
  const crit = Cr.table(O, W), eq = Cr.reached(O, W);
  J.seeds[r.seed] = { years, crit, eq: { day: eq.day, th: eq.th } };
  L.push(`### 시드 ${r.seed} — 해마다(365날 창 · 값은 해 끝 날 또는 해 평균)`, '',
    '| 해 | 날 | 해 평균 인구 | 앞 해 대비 | 태어남 ÷ 인구 | 죽음 ÷ 인구(자연 · 굶음 · K 넘김 등) | K(slot · prod · fuel 합) | N ÷ K | 무는 몫 마을(slot/prod/fuel) | 주거 문 막힘(마을-날) | 영토 크기 | 그 해 산 셀 | 확장 멈춘 마을 | 식량 날치 | 식량 값 | 농부 · 채집 · 사냥 · 어부 · 나무꾼 % |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of years) if (x.y <= 3 || x.y % 2 === 0 || x.y === years.length)
    L.push(`| ${x.y} | ${x.d} | ${x.popMean} | ${x.vsPrev == null ? '—' : x.vsPrev + '%'} | ${x.birthPerN}% | ${x.deathPerN}% (${x.natPerN} · ${x.famPerN} · ${x.otherPerN}) | ${x.K} (${x.slot} · ${x.prod} · ${x.fuel}) | ${x.NoverK} | ${x.bind.slot}/${x.bind.prod}/${x.bind.fuel} | ${x.gatedDays} | ${x.land} | ${x.cellsYear} | ${x.mbmcStop}/51 | ${x.fdMean} | ${x.foodPrice} | ${['farmer', 'forager', 'hunter', 'fisher', 'lumberjack'].map((k) => x.jobs[k]).join(' · ')} |`);
  L.push('', `평형(판정 33 기본 — C1 ≤ 0.05 ∧ C3 ≤ 0.1 ∧ C2 = 0) 든 날: ${eq.day ?? '안 듦'} · 후보: ` + Object.entries(crit.enter).map(([k, v]) => `${k} → ${v ?? '안 듦'}`).join(' · '), '');
}
fs.writeFileSync(path.join(OUT, 'grow.json'), JSON.stringify(J, null, 1));
fs.writeFileSync(path.join(OUT, 'grow.md'), L.join('\n') + '\n');
console.log(L.join('\n'));
