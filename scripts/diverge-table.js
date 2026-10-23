#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T837 갈림 대조 표 · 판 JSON 만 읽는다)
// === scripts/diverge-table.js — 셈마다 **대조 띠**(갈래 판 + 갈림 대조 판) 와 **갈래 차** 를 나란히 ================================
//   쓰는 법: node scripts/diverge-table.js <판 뿌리> --pair a:g[:이름] [--pair a:on[:이름]] [--json out.json]
//     판 뿌리 아래 `run-<갈래>`(갈래 판) · `run-<갈래>~<대조>`(그 갈래의 대조 판 — `diverge-ctl.js` `DCTL_SKIP`) / `base-<시드>.json`(t577) · `base-<시드>.dctl.json`
//   셈(3시드 합): 빈 마을 · 해체 없이 굶어 빔 · 800일 인구 · T796 대상 8곳 800일 산 · 첫해 T796 대상으로 오는 캐러밴 · 굶는 마을-날 · 굶는 날 먹을 것 수출 leg
//   띠 = 그 갈래의 판들(갈래 판 + 대조 k 판) 최소 ~ 최대 · 폭 = 최대 − 최소. 견줌 = 두 갈래 판의 차 · 두 띠 평균의 차 · 두 띠가 겹치나 · 갈래 차 > 두 폭 중 큰 것인가.
//   (판정 0 — 칸은 산수뿐이다. 무엇을 읽을지는 보고가 적는다.)
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/diverge-table.js <판 뿌리> --pair a:g'); process.exit(2); }
const PAIRS = []; process.argv.forEach((x, i) => { if (x === '--pair') { const [a, b, ...nm] = process.argv[i + 1].split(':'); PAIRS.push({ a, b, name: nm.join(':') || `${a} ↔ ${b}` }); } });
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SEEDS = [1020, 7, 42];
const T796 = { 1020: ['농촌13', '농촌16', '농촌18'], 7: ['농촌6', '농촌7', '농촌15', '농촌18'], 42: ['농촌10'] };
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
// 판 하나(디렉터리) → 셈
function measure(dir) {
  const m = { empty: 0, starveEmpty: 0, pop: 0, alive796: 0, toT796: 0, cars1y: 0, starveDays: 0, starveFoodLegs: 0, skipped: [], ok: true };
  for (const s of SEEDS) {
    const o = rd(path.join(dir, `base-${s}.json`)), ob = rd(path.join(dir, `base-${s}.dctl.json`));
    if (!o || !ob) { m.ok = false; continue; }
    const last = o.rows[o.rows.length - 1][1];
    m.empty += o.empty; m.starveEmpty += o.names.filter((x, i) => last[i] === 0 && o.bdtDay[i] == null).length;
    m.pop += o.eight ? o.eight.pop : 0;
    for (const n of T796[s]) if (last[o.names.indexOf(n)] > 0) m.alive796++;
    const tg = new Set(T796[s].map((n) => ob.names.indexOf(n)));
    for (const c of ob.cars) if (c[0] >= 1 && c[0] < 365) { m.cars1y++; if (tg.has(c[2])) m.toT796++; }   // ★[T879] 첫해 캐러밴 전체도(초기화 판 — T796 대상 이름은 열한째 판 지도의 것)
    for (const [, row] of ob.days) for (const v of row) if (v && v[0] > 0 && v[1] < v[0]) m.starveDays++;
    for (const l of ob.legs) if (l[6] < l[5]) m.starveFoodLegs++;
    for (const k of ob.skipped || []) m.skipped.push([s, ...k]);
  }
  return m;
}
const dirs = fs.readdirSync(D).filter((x) => /^run-/.test(x) && fs.statSync(path.join(D, x)).isDirectory());
const G = {};   // 갈래 → { arm: 셈, ctl: { 이름: 셈 } }
for (const x of dirs) { const [arm, ctl] = x.slice(4).split('~'); const g = G[arm] || (G[arm] = { arm: null, ctl: {} }); const m = measure(path.join(D, x)); if (!m.ok) continue; if (ctl) g.ctl[ctl] = m; else g.arm = m; }
const KEYS = [['empty', '빈 마을'], ['starveEmpty', '해체 없이 굶어 빔'], ['pop', '800일 인구'], ['alive796', 'T796 대상 800일 산(/8)'], ['toT796', '첫해 T796 대상으로 오는 캐러밴'], ['cars1y', '첫해 캐러밴(전체)'], ['starveDays', '굶는 마을-날'], ['starveFoodLegs', '굶는 날 먹을 것 수출 leg']];
const band = (g, k) => { const xs = [g.arm, ...Object.values(g.ctl)].filter(Boolean).map((m) => m[k]); return { xs, lo: Math.min(...xs), hi: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, w: Math.max(...xs) - Math.min(...xs), n: xs.length }; };
const f = (x) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : (Math.round(x * 10) / 10).toString());
const OUT = { groups: {}, pairs: [] };
console.log('\n## 판마다 셈(3시드 합)\n');
console.log('| 갈래 · 판 | ' + KEYS.map((k) => k[1]).join(' | ') + ' | 건너뛴 사건(시드 · 날 · 종류 · n · 길) |');
console.log('|---|' + KEYS.map(() => '---').join('|') + '|---|');
for (const arm of Object.keys(G).sort()) { const g = G[arm]; OUT.groups[arm] = g;
  for (const [nm, m] of [[arm, g.arm], ...Object.entries(g.ctl).sort().map(([c, v]) => [`${arm}~${c}`, v])]) { if (!m) continue;
    console.log(`| ${nm} | ${KEYS.map(([k]) => f(m[k])).join(' | ')} | ${m.skipped.map((x) => `${x[0]} · ${x[1]} · ${x[2]}${x[3]} · ${x[4]}→${x[5]}`).join(' / ') || '—'} |`); } }
for (const P of PAIRS) {
  const A = G[P.a], B = G[P.b]; if (!A || !B || !A.arm || !B.arm) { console.log(`\n(${P.name}: 판 없음)`); continue; }
  console.log(`\n## ${P.name} — 대조 띠 vs 갈래 차(${P.a} 판 ${band(A, 'empty').n} · ${P.b} 판 ${band(B, 'empty').n})\n`);
  console.log(`| 셈 | ${P.a} 띠(최소 ~ 최대 · 폭) | ${P.b} 띠(최소 ~ 최대 · 폭) | 갈래 차(${P.b} − ${P.a} · 갈래 판끼리) | 띠 평균 차 | 띠 겹침 | 갈래 차 > 큰 띠 폭 |`);
  console.log('|---|---|---|---|---|---|---|');
  const rows = [];
  for (const [k, nm] of KEYS) { const a = band(A, k), b = band(B, k), d = B.arm[k] - A.arm[k], dm = b.mean - a.mean, ov = !(a.hi < b.lo || b.hi < a.lo), big = Math.abs(d) > Math.max(a.w, b.w);
    rows.push({ k, a, b, d, dm, ov, big });
    console.log(`| ${nm} | ${f(a.lo)} ~ ${f(a.hi)} · ${f(a.w)} | ${f(b.lo)} ~ ${f(b.hi)} · ${f(b.w)} | ${d > 0 ? '+' : ''}${f(d)} | ${dm > 0 ? '+' : ''}${f(dm)} | ${ov ? '겹침' : '안 겹침'} | ${big ? '예' : '아니오'} |`); }
  OUT.pairs.push({ P, rows });
}
// ★[T859 · T842 추신] 굶는 날(출발 마을 곳간 식량 환산 < 인구) 떠난 캐러밴 — 무엇을 내주고 식량을 사 왔나 · 그 뒤 그 마을 도구 · 무기 · 생산(갈래 판 · 3시드 합)
if (process.argv.includes('--buys')) {
  console.log('\n## 굶는 마을이 식량을 사 올 때 내준 것(갈래 판 · 3시드 합 · `diverge-ctl` buys)\n');
  console.log('| 갈래(쓴 판) | 굶는 날 떠난 캐러밴 | 그중 먹을 것을 사 옴 | 사 온 식량 환산 | 내준 것(품목 · 양 — 많은 순) | 식량 한 단위당 내준 값(출발 값 × 양 ÷ 식량 환산) | 한 번마다 그 값 — 중앙값 · 90% · 최대 | 식량 한 단위당 내준 양 | 그 마을 도구 · 무기 · 생산 배율(떠난 날 → 30일 뒤 · 평균) |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  OUT.buys = {};
  //   갈래의 판 가운데 buys 가 선 판(사 온 것이 한 번이라도 적힌 판 — 이 칸이 생기기 전 판은 뺀다)을 다 더한다 · 쓴 판 수를 적는다
  for (const arm of Object.keys(G).sort()) {
    const runs = [arm, ...Object.keys(G[arm].ctl).sort().map((c) => `${arm}~${c}`)];
    let n = 0, nf = 0, feq = 0, val = 0, gq = 0, used = 0; const give = {}; const per = []; const t0 = [0, 0, 0], t1 = [0, 0, 0]; let tn = 0;
    for (const rn of runs) { const dir = path.join(D, 'run-' + rn);
    const obs = SEEDS.map((s) => rd(path.join(dir, `base-${s}.dctl.json`)));
    if (!obs.every((ob) => ob && ob.buys && ob.ver >= 2)) continue; used++;   // ver 2 = 장마당 정산 뒤에 적는 판
    for (const ob of obs) { const by = new Map(ob.days.map((d) => [d[0], d[1]]));
      for (const b of ob.buys) { n++; const [d0, fi, , gr, ga, pf, rr, ra, f] = b;
        if (f > 0 && ra > 0) { nf++; feq += ra * f; val += ga * pf; gq += ga; per.push(ga * pf / (ra * f)); if (gr) { const g = give[gr] || (give[gr] = 0); give[gr] = g + ga; } }
        const A = by.get(d0), Z = by.get(d0 + 30); if (A && Z && A[fi] && Z[fi] && A[fi].length > 4) { for (let j = 0; j < 3; j++) { t0[j] += A[fi][2 + j]; t1[j] += Z[fi][2 + j]; } tn++; } } } }
    if (!n) continue;
    const top = Object.entries(give).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([r, q]) => `${r} ${f(q)}`).join(' · ');
    per.sort((x, y) => x - y); const q = (p) => per.length ? per[Math.min(per.length - 1, Math.floor(p * per.length))] : 0;
    OUT.buys[arm] = { n, nf, feq, val, gq, give, t0, t1, tn, used, p50: q(0.5), p90: q(0.9), pmax: per.length ? per[per.length - 1] : 0 };
    console.log(`| ${arm}(판 ${used}) | ${n} | ${nf} | ${f(feq)} | ${top || '—'} | ${feq > 0 ? (val / feq).toFixed(3) : '—'} | ${per.length ? [q(0.5), q(0.9), per[per.length - 1]].map((x) => x.toFixed(3)).join(' · ') : '—'} | ${feq > 0 ? (gq / feq).toFixed(3) : '—'} | ${tn ? t0.map((x, j) => `${f(x / tn)} → ${f(t1[j] / tn)}`).join(' · ') : '—'} |`);
  }
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(OUT));
