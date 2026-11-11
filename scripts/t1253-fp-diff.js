'use strict';
// (@regress 없음 — 러너 밖 · T1253 견줌 · 읽기만)
// === scripts/t1253-fp-diff.js — 두 판의 `<판>.t1253.json`(t1253-fp-hook) 을 견줘 **처음 갈린 날 · 마을 · 칸**을 짚는다 ===
//   node scripts/t1253-fp-diff.js <A.t1253.json> <B.t1253.json> [--all]
//   ⇒ 칸 지문(인구 · 곳간 품목 · 직업 · 주거 · 땅 · 금고)으로 처음 갈린 날 · 마을 · 칸 값 · 통 지문(윗 칸)으로 처음 갈린 날 · 마을 · 윗 칸 이름
const fs = require('fs');
const [fa, fb] = process.argv.slice(2);
const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
const ALL = process.argv.includes('--all');
const names = A.names;
const dA = new Map(A.days.map((r) => [r[0], r])), dB = new Map(B.days.map((r) => [r[0], r]));
const days = [...dA.keys()].filter((d) => dB.has(d)).sort((a, b) => a - b);
function deep(a, b, p, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) { for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) deep(a[k], b[k], p + '.' + k, out); return; }
  out.push([p, a, b]);
}
let firstF = null, firstW = null;
for (const d of days) {
  const ra = dA.get(d), rb = dB.get(d);
  const fv = [], wv = [];
  for (let i = 0; i < names.length; i++) {
    if (ra[2][i] !== rb[2][i]) fv.push(i);
    const ka = ra[3][i], kb = rb[3][i], ks = [...new Set([...Object.keys(ka), ...Object.keys(kb)])].filter((k) => ka[k] !== kb[k]);
    if (ks.length) wv.push([i, ks]);
  }
  if (fv.length && !firstF) firstF = d;
  if (wv.length && !firstW) firstW = d;
  if (fv.length || wv.length) {
    console.log(`날 ${d} — 칸 지문 갈린 마을 ${fv.length} · 통 지문 갈린 마을 ${wv.length}  (간격 콜백 A ${ra[1]} · B ${rb[1]})`);
    for (const i of fv.slice(0, ALL ? 99 : 6)) {
      const out = []; deep(A.dump[d][i].f, B.dump[d][i].f, '', out);
      console.log(`   칸 ${names[i]}: ` + out.slice(0, 12).map(([p, x, y]) => `${p} ${JSON.stringify(x)}→${JSON.stringify(y)}`).join(' · '));
    }
    for (const [i, ks] of wv.slice(0, ALL ? 99 : 6)) {
      let ex = '';
      const ra2 = A.dump[d][i].raw, rb2 = B.dump[d][i].raw;
      if (ra2 && rb2) { const out = []; for (const k of ks) deep(ra2[k], rb2[k], k, out); ex = out.slice(0, 8).map(([p, x, y]) => `${p} ${JSON.stringify(x)}→${JSON.stringify(y)}`.slice(0, 200)).join(' · '); }
      console.log(`   통 ${names[i]}: 윗 칸 ${ks.join(',')}${ex ? '  ⇒ ' + ex : ''}`);
    }
    if (!ALL && firstF && d > firstF + 1) break;
  }
}
console.log(`\n처음 갈림 — 칸 지문 ${firstF ?? '없음'} · 통 지문 ${firstW ?? '없음'} (견준 날 ${days.length} · ${days[0]}~${days[days.length - 1]})`);
