#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1500 스냅숏 요약 견줌 · 제품 무변)
// === 계측/T1500_2026-11-27/t1500-diff.js — `t1500-snap.js` 요약 둘 이상을 길(지배 사슬) · 생성자로 견준다 ===
//   node t1500-diff.js <요약 A> <요약 B> [<요약 C> …] [--days a,b,…] [--top 40] [--depth 0]
//   ⇒ 길마다 붙든 MB(스냅숏마다) · 첫 → 끝 증가 · 하루 +MB(--days 가 있으면) — 증가 큰 순
//   --depth N: 길을 앞 N 칸으로 접는다(0 = 그대로)
const fs = require('fs');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const files = a.filter((x, i) => !x.startsWith('--') && !(i > 0 && a[i - 1].startsWith('--')));
const DAYS = opt('days', null) ? opt('days').split(',').map(Number) : null;
const TOP = +opt('top', '40'), DEPTH = +opt('depth', '0');
const S = files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const M = (b) => (b / 1048576).toFixed(1);
console.log('스냅숏: ' + S.map((s, i) => `${DAYS ? 'd' + DAYS[i] : i} ${M(s.total)} MB · 노드 ${s.reach}`).join(' | '));
const norm = (seg) => {   // 지배자가 곧은 부모가 아닌 칸의 붙든 이 이름은 스냅숏마다 다를 수 있다 — 접는다(맥락 변수 이름이 있으면 그 이름으로)
  if (!seg.startsWith('~(')) return seg; const i = seg.lastIndexOf('):'); if (i < 0) return seg;
  const inner = seg.slice(2, i), m = inner.match(/\$([A-Za-z_$][\w$]*)$/); return m ? '$' + m[1] + ':' + seg.slice(i + 2) : '~:' + seg.slice(i + 2); };
const fold = (p) => { let a = p.split('system / ').join('system∕').split(' / ').map(norm); const j = a.findIndex((x) => x.startsWith('$')); if (j > 0) a = a.slice(j); return (DEPTH > 0 ? a.slice(0, DEPTH) : a).join(' / '); };
const P = new Map();
S.forEach((s, i) => { for (const [p, v] of Object.entries(s.paths)) { const k = fold(p); if (!P.has(k)) P.set(k, new Array(S.length).fill(0)); P.get(k)[i] += v; } });
const span = DAYS ? DAYS[DAYS.length - 1] - DAYS[0] : null;
const rows = [...P.entries()].map(([k, v]) => ({ k, v, d: v[v.length - 1] - v[0] })).sort((x, y) => y.d - x.d);
console.log('\n## 길 — 끝 − 첫 큰 순');
for (const r of rows.slice(0, TOP)) console.log(`${M(r.d).padStart(8)} MB${span ? ` (+${(r.d / 1048576 / span).toFixed(3)}/날)` : ''} | ${r.v.map(M).join(' → ')} | ${r.k.slice(-420)}`);
console.log('\n## 생성자 — self 증가 큰 순');
const C = new Map();
S.forEach((s, i) => { for (const [k, o] of Object.entries(s.byCtor)) { if (!C.has(k)) C.set(k, S.map(() => ({ n: 0, self: 0 }))); C.get(k)[i] = o; } });
const cr = [...C.entries()].map(([k, v]) => ({ k, v, d: v[v.length - 1].self - v[0].self })).sort((x, y) => y.d - x.d);
for (const r of cr.slice(0, TOP)) console.log(`${M(r.d).padStart(8)} MB | ${r.v.map((o) => `${M(o.self)}MB/${o.n}`).join(' → ')} | ${r.k.slice(0, 100)}`);
