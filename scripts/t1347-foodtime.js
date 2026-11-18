'use strict';
// (@regress 없음 — 러너 밖 · T1347 표 자 · 읽기만)
// === scripts/t1347-foodtime.js — 식량 교역량을 날 머리마다 누계로(t1344 관찰기 `trade[날]` = [줄 · 보낸 식량 · 받아 온 식량] — econ 식량 단위) ==========
//   쓰는 법: node scripts/t1347-foodtime.js <기준 이름=머리> <이름=머리> …   (첫 팔이 분모 · 머리 = 판 JSON 에서 `.json` 을 뗀 것)
//   칸: 날 50 · 100 · 200 · 300 · 끝 누계(분모 비) · 기준 판과 그날 장부 줄이 처음 갈린 날(그 앞은 두 판이 같은 세계)
//   뜻: 손잡이가 바꾼 자리(받아 올 짐 · 둘째 화물)가 몇 줄뿐이어도 세계는 그 날부터 갈린다 — 비가 날마다 어떻게 벌어지는지가 "직접 효과"와 "갈린 세계"를 가른다.
const fs = require('fs'), zlib = require('zlib');
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f + '.gz')).toString('utf8')); } catch (e2) { return null; } } };
const A = process.argv.slice(2).map((a) => { const k = a.indexOf('='); const X = rd(a.slice(k + 1) + '.t1344.json'); const t = {}; if (X && X.trade) for (const [d, v] of Object.entries(X.trade)) t[+d] = v; return [a.slice(0, k), X ? t : null]; });
if (!A.length) { console.log('(판 없음)'); process.exit(0); }
const last = Math.max(0, ...A.filter(([, t]) => t).map(([, t]) => Math.max(0, ...Object.keys(t).map(Number))));
const DAYS = [50, 100, 200, 300, last].filter((d, i, s) => d <= last && s.indexOf(d) === i);
const cum = (t, D) => { let s = 0; for (const [d, v] of Object.entries(t)) if (+d <= D) s += v[1] + v[2]; return s; };
const first = (a, b) => { const ds = [...new Set([...Object.keys(a), ...Object.keys(b)].map(Number))].sort((p, q) => p - q); for (const d of ds) if (JSON.stringify(a[d]) !== JSON.stringify(b[d])) return d; return null; };
console.log(`| 판 | ${DAYS.map((d) => `날 ${d} 누계(비)`).join(' | ')} | 기준과 처음 갈린 날 |`);
console.log(`|---|${DAYS.map(() => '---:').join('|')}|---:|`);
const [, B] = A[0];
for (const [n, t] of A) {
  if (!t) { console.log(`| ${n} | (관찰기 없음) |`); continue; }
  const cells = DAYS.map((D) => { const x = cum(t, D), y = B ? cum(B, D) : 0; return `${Math.round(x).toLocaleString('en-US')}(${y ? (x / y).toFixed(3) : '—'})`; });
  console.log(`| ${n} | ${cells.join(' | ')} | ${t === B ? '—' : (B ? (first(B, t) == null ? '같음' : first(B, t)) : '—')} |`);
}
