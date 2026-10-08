#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T650 계측기 · 제품 무변)
// === scripts/t650-diff.js — 두 판의 `*.t650.json` 을 견주어 **첫 갈림**(날 → 마을 → 칸)과 그날까지의 시간 읽기 셈을 낸다 ==========
//   쓰는 법: node scripts/t650-diff.js <A.t650.json> <B.t650.json> [--sites]
'use strict';
const fs = require('fs');
const [fa, fb] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const SHOW = process.argv.includes('--sites');
const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
const F = ['이름', '곳간', '인구', 'econ 주민', '몸 좌표 합', '주거', '확장', null, '금고', '교역 표', '마지막 교역일', '직업 수', '어장 상한', '어제 어획', '잠재 어획'];   // ★[T661] 뒤 넷 덧칸(옛 판 json 엔 없다 — 없으면 둘 다 undefined 라 같다)
const cash = (t) => (t && typeof t === 'object') ? (t._cash != null ? t._cash : '—') : t;
const byD = (X) => new Map(X.days.map((r) => [r.d, r]));
const MA = byD(A), MB = byD(B);
const ds = [...MA.keys()].filter((d) => MB.has(d)).sort((a, b) => a - b);
let first = null;
for (const d of ds) {
  const a = MA.get(d), b = MB.get(d);
  const seedDiff = a.seed !== b.seed;
  const vd = [];
  for (let i = 0; i < Math.max(a.vil.length, b.vil.length); i++) {
    const x = a.vil[i] || [], y = b.vil[i] || [];
    const f = []; for (let k = 1; k < F.length; k++) if (F[k] && JSON.stringify(x[k]) !== JSON.stringify(y[k])) f.push(F[k]);
    if (f.length) vd.push({ v: x[0] || y[0], f, a: x, b: y });
  }
  if (seedDiff || vd.length) { first = { d, seedDiff, a, b, vd }; break; }
}
const sum = (X, upto) => { const c = { now: 0, perf: 0, hr: 0, rnd: 0 }, s = { now: {}, perf: {}, hr: {}, rnd: {} };
  for (const r of X.days) { if (upto != null && r.d > upto) break; for (const k of Object.keys(c)) { c[k] += r.cnt[k] || 0; for (const [q, n] of Object.entries(r.sites[k] || {})) s[k][q] = (s[k][q] || 0) + n; } }
  return { c, s }; };
console.log(`날 ${ds.length}개 견줌(${ds[0]}~${ds[ds.length - 1]})`);
if (!first) console.log('★갈림 없음 — 모든 날 econ 난수 상태 · 마을 지문이 같다');
else {
  console.log(`★첫 갈림 = 날 ${first.d} · econ 난수 ${first.seedDiff ? `다름(${first.a.seed} ≠ ${first.b.seed})` : '같음'} · 다른 마을 ${first.vd.length}`);
  for (const q of first.vd.slice(0, 12)) {
    console.log(`  ${q.v}: ${q.f.join(' · ')}  인구 ${q.a[2]}/${q.b[2]} · 금고 현금 ${cash(q.a[8])}/${cash(q.b[8])} · 마지막 교역일 ${q.a[10]}/${q.b[10]}`);
    const sa = q.a[7] || {}, sb = q.b[7] || {}; const ks = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter((k) => sa[k] !== sb[k]);
    if (ks.length) console.log('    곳간 다른 칸: ' + ks.map((k) => `${k} ${sa[k]} / ${sb[k]} (${((sb[k] || 0) - (sa[k] || 0)).toFixed(4)})`).join(' · '));
  }
  const pd = ds[ds.indexOf(first.d) - 1];
  if (pd != null) { const a = MA.get(pd), b = MB.get(pd); console.log(`  (그 앞날 ${pd}: 난수 ${a.seed === b.seed ? '같음' : '다름'})`); }
}
const sa = sum(A, first ? first.d : null), sb = sum(B, first ? first.d : null);
console.log(`시간 읽기(첫 갈림 날까지 · A / B): Date.now ${sa.c.now} / ${sb.c.now} · performance.now ${sa.c.perf} / ${sb.c.perf} · hrtime ${sa.c.hr} / ${sb.c.hr} · Math.random ${sa.c.rnd} / ${sb.c.rnd}`);
if (SHOW) for (const k of ['rnd', 'now', 'perf', 'hr']) {
  const all = new Set([...Object.keys(sa.s[k]), ...Object.keys(sb.s[k])]);
  const rows = [...all].map((q) => [q, sa.s[k][q] || 0, sb.s[k][q] || 0]).sort((x, y) => (y[1] + y[2]) - (x[1] + x[2])).slice(0, 25);
  console.log(`\n[${k}] 자리별(${k === 'rnd' ? '전수' : '1/64 표본'}) — A / B`);
  for (const [q, x, y] of rows) console.log(`  ${q}  ${x} / ${y}`);
}
