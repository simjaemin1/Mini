#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T974 표 기계 · 판 JSON 만 읽는다 · 세계 안 만짐)
// === scripts/t974-band-table.js — 판 자 띠(T837 갈림 대조)로 다섯 셈: 전쟁 길이 · 징발 · 굶는 마을-날 · 첫해 기근 · 인구 ============
//   node scripts/t974-band-table.js <판 뿌리> --pair a:b[:이름] [--pair …] [--json out.json]
//     판 뿌리 아래 `run-<갈래>`(갈래 판) · `run-<갈래>~raidN`(그 갈래의 갈림 대조 — `diverge-ctl.js` `DCTL_SKIP=raid:n`)
//     판마다 `base-<시드>.json`(t577 판 JSON) · `.dctl.json`(diverge-ctl) · `.t845.json`(징발 · 전쟁 — `t845-observe.js`) · `.t875.json`(첫해 — `t875-observe.js`)
//   셈(3시드 합 · 판 하나):
//     wars = 판 동안 선 전쟁 수 · long30 = 30날 이상 산 전쟁(T956 `long30` 과 같은 잣대 — 산 날 = 마지막 본 날 − 처음 본 날 + 1 · 판 끝까지 산 전쟁은 판 끝까지)
//     lenMax = 가장 오래 산 전쟁(날) · warDays = 전쟁-날 합(전쟁마다 산 날의 합)
//     draftVD = 징발 마을-날(인구 > 0 · 징발 `_warDraft` > 0 — T956 `dvd` 와 같은 잣대) · draftPD = 징발 사람-날(그날 징발 수의 합)
//     starve = 굶는 마을-날(인구 > 0 · 곳간 식량 환산 < 인구 — `diverge-table` `starveDays` 와 같은 잣대 · dctl 날 줄)
//     fam365 = 365날 앞 죽음(첫해 기근 — `t875-table` `fam365` 와 같은 잣대 · t875 `deaths` 칸 · 365날 앞)
//     pop = 판 끝 인구(`eight.pop`) · empty = 끝 날 빈 마을(판 JSON `empty`)
//   띠 = 그 갈래 판들(갈래 판 + 대조 k 판) 최소 ~ 최대 · 폭 = 최대 − 최소. 견줌 = 두 갈래 판의 차 · 두 띠 평균의 차 · 겹치나 · 갈래 차 > 두 폭 중 큰 것인가
//   (`diverge-table` 과 같은 산수 — 판정 0 · 무엇을 읽을지는 보고가 적는다)
'use strict';
const fs = require('fs');
const path = require('path');
const D = process.argv[2];
if (!D) { console.error('쓰는 법: node scripts/t974-band-table.js <판 뿌리> --pair a:b'); process.exit(2); }
const PAIRS = []; process.argv.forEach((x, i) => { if (x === '--pair') { const [a, b, ...nm] = process.argv[i + 1].split(':'); PAIRS.push({ a, b, name: nm.join(':') || `${a} ↔ ${b}` }); } });
const JOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const SEEDS = [1020, 7, 42];
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
function measure(dir) {
  const m = { wars: 0, long30: 0, lenMax: 0, warDays: 0, draftVD: 0, draftPD: 0, starve: 0, fam365: 0, pop: 0, empty: 0, ok: true, per: {} };
  for (const s of SEEDS) {
    const o = rd(path.join(dir, `base-${s}.json`)), ob = rd(path.join(dir, `base-${s}.dctl.json`)), q = rd(path.join(dir, `base-${s}.t845.json`)), t = rd(path.join(dir, `base-${s}.t875.json`));
    if (!o || !ob || !q || !t) { m.ok = false; continue; }
    const p = { wars: 0, long30: 0, lenMax: 0, warDays: 0, draftVD: 0, draftPD: 0, starve: 0, fam365: 0, pop: o.eight ? o.eight.pop : 0, empty: o.empty || 0, longs: [] };
    //   전쟁 — t845 `wars`(전쟁이 산 날마다 [날 · [[id · 공격 · 방어 · 국면 · 작전 · 짐 · 병력] …]])
    const lastDay = q.rows.length ? q.rows[q.rows.length - 1][0] : 0;
    const W = new Map();
    for (const [d, list] of (q.wars || [])) for (const w of list) { const x = W.get(w[0]) || { id: w[0], atk: w[1], def: w[2], first: d, last: d }; x.last = d; W.set(w[0], x); }
    for (const x of W.values()) { const len = x.last - x.first + 1; p.wars++; p.warDays += len; if (len >= 30) { p.long30++; p.longs.push(`${x.id}:${x.atk}→${x.def}:${len}${x.last >= lastDay ? '(끝까지)' : ''}`); } if (len > p.lenMax) p.lenMax = len; }
    //   징발 — t845 마을 줄 [N · tfe · eaten · drafted · …]
    const iN = 0, iDr = (q.cols || []).indexOf('drafted');
    for (const [, row] of q.rows) for (const c of row) { if (c[iN] > 0 && c[iDr] > 0) { p.draftVD++; p.draftPD += c[iDr]; } }
    //   굶는 마을-날 — dctl 날 줄 [인구 · 곳간 식량 환산 · …](diverge-table 과 같은 잣대)
    for (const [, row] of ob.days) for (const v of row) if (v && v[0] > 0 && v[1] < v[0]) p.starve++;
    //   첫해 기근 — t875 날 줄(t875-table 과 같은 잣대 · 365날 앞)
    const C = t.cols, iD = C.indexOf('deaths');
    for (const [d, row] of t.rows) if (d < 365) for (const c of row) p.fam365 += c[iD] || 0;
    for (const k of ['wars', 'long30', 'warDays', 'draftVD', 'draftPD', 'starve', 'fam365', 'pop', 'empty']) m[k] += p[k];
    if (p.lenMax > m.lenMax) m.lenMax = p.lenMax;
    m.per[s] = p;
  }
  return m;
}
const dirs = fs.readdirSync(D).filter((x) => /^run-/.test(x) && fs.statSync(path.join(D, x)).isDirectory());
const G = {};
for (const x of dirs) { const [arm, ctl] = x.slice(4).split('~'); const g = G[arm] || (G[arm] = { arm: null, ctl: {} }); const m = measure(path.join(D, x)); if (!m.ok) continue; if (ctl) g.ctl[ctl] = m; else g.arm = m; }
const KEYS = [['long30', '30날 넘게 산 전쟁'], ['lenMax', '가장 긴 전쟁(날)'], ['warDays', '전쟁-날 합'], ['wars', '전쟁 수'], ['draftVD', '징발 마을-날'], ['draftPD', '징발 사람-날'],
  ['starve', '굶는 마을-날'], ['fam365', '첫해 굶어 죽음(365날 앞)'], ['pop', '판 끝 인구'], ['empty', '빈 마을(끝 날)']];
const band = (g, k) => { const xs = [g.arm, ...Object.values(g.ctl)].filter(Boolean).map((m) => m[k]); return { xs, lo: Math.min(...xs), hi: Math.max(...xs), mean: xs.reduce((a, b) => a + b, 0) / xs.length, w: Math.max(...xs) - Math.min(...xs), n: xs.length }; };
const f = (x) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-US') : (Math.round(x * 10) / 10).toString());
const OUT = { groups: {}, pairs: [] };
console.log('\n## 판마다 셈(3시드 합)\n');
console.log('| 갈래 · 판 | ' + KEYS.map((k) => k[1]).join(' | ') + ' | 시드마다 30날+ 전쟁 · 가장 긴 전쟁 · 인구(1020 / 7 / 42) |');
console.log('|---|' + KEYS.map(() => '---:').join('|') + '|---|');
for (const arm of Object.keys(G).sort()) { const g = G[arm]; OUT.groups[arm] = g;
  for (const [nm, m] of [[arm, g.arm], ...Object.entries(g.ctl).sort().map(([c, v]) => [`${arm}~${c}`, v])]) { if (!m) continue;
    console.log(`| ${nm} | ${KEYS.map(([k]) => f(m[k])).join(' | ')} | ${SEEDS.map((s) => m.per[s] ? `${m.per[s].long30} · ${m.per[s].lenMax} · ${f(m.per[s].pop)}` : '—').join(' / ')} |`); } }
for (const P of PAIRS) {
  const A = G[P.a], B = G[P.b]; if (!A || !B || !A.arm || !B.arm) { console.log(`\n(${P.name}: 판 없음)`); continue; }
  console.log(`\n## ${P.name} — 대조 띠 vs 갈래 차(${P.a} 판 ${band(A, 'pop').n} · ${P.b} 판 ${band(B, 'pop').n})\n`);
  console.log(`| 셈 | ${P.a} 띠(최소 ~ 최대 · 폭) | ${P.b} 띠(최소 ~ 최대 · 폭) | 갈래 차(${P.b} − ${P.a} · 갈래 판끼리) | 띠 평균 차 | 띠 겹침 | 갈래 차 > 큰 띠 폭 |`);
  console.log('|---|---|---|---|---|---|---|');
  const rows = [];
  for (const [k, nm] of KEYS) { const a = band(A, k), b = band(B, k), d = B.arm[k] - A.arm[k], dm = b.mean - a.mean, ov = !(a.hi < b.lo || b.hi < a.lo), big = Math.abs(d) > Math.max(a.w, b.w);
    rows.push({ k, a, b, d, dm, ov, big });
    console.log(`| ${nm} | ${f(a.lo)} ~ ${f(a.hi)} · ${f(a.w)} | ${f(b.lo)} ~ ${f(b.hi)} · ${f(b.w)} | ${d > 0 ? '+' : ''}${f(d)} | ${dm > 0 ? '+' : ''}${f(dm)} | ${ov ? '겹침' : '안 겹침'} | ${big ? '예' : '아니오'} |`); }
  OUT.pairs.push({ P, rows });
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(OUT));
