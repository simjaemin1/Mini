'use strict';
// (@regress 없음 — 러너 밖 · T1277 같음 자 · 읽기만)
// === scripts/t1277-same.js — 두 판(같은 팔 · 같은 시드)의 날 줄이 날 1 ~ N 까지 바이트 같은가(CPU 고침 = 결과 무변의 증거) ==========
//   쓰는 법: node scripts/t1277-same.js <판 머리 A> <판 머리 B> <끝 날 N>
//   견주는 칸(날 ≤ N): 판 JSON `rows` · t1256 `day` · `g`(시간 칸 `ns*` 뺌) · t1266 `g` · t1243 `rows` · `body` · t1277 `ore` · `cell`.
//   시간 칸(t1243 `cpu` · t724 `ns` · `nsPick` · `nsCut`)과 판 끝 칸(판 길이가 다르면 다르다)은 안 본다.
const fs = require('fs');
const [ha, hb, nArg] = process.argv.slice(2);
if (!ha || !hb || !nArg) { console.error('쓰는 법: node scripts/t1277-same.js <머리 A> <머리 B> <끝 날 N>'); process.exit(2); }
const N = parseInt(nArg, 10);
const rd = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (/^ns(Pick|Cut)?$/.test(k) ? undefined : v)));
let diff = 0, same = 0; const where = [];
function cmp(name, a, b) { const x = JSON.stringify(strip(a)), y = JSON.stringify(strip(b)); if (x === y) same++; else { diff++; if (where.length < 12) where.push(name); } }
function days(o, f) { const r = {}; for (const k in (o || {})) { const d = +k; if (d <= N) r[k] = f ? f(o[k]) : o[k]; } return r; }
const A = { j: rd(ha + '.json'), a: rd(ha + '.t1256.json'), b: rd(ha + '.t1266.json'), c: rd(ha + '.t1243.json'), e: rd(ha + '.t1277.json') };
const B = { j: rd(hb + '.json'), a: rd(hb + '.t1256.json'), b: rd(hb + '.t1266.json'), c: rd(hb + '.t1243.json'), e: rd(hb + '.t1277.json') };
const rowsN = (j) => (j && j.rows ? j.rows.filter((r) => r[0] <= N) : null);
if (A.j && B.j) cmp('판 rows', rowsN(A.j), rowsN(B.j));
if (A.a && B.a) { for (let d = 1; d <= N; d++) { cmp('t1256 day ' + d, A.a.day[d], B.a.day[d]); cmp('t1256 g ' + d, A.a.g[d], B.a.g[d]); } }
if (A.b && B.b) { for (let d = 1; d <= N; d++) cmp('t1266 g ' + d, A.b.g[d], B.b.g[d]); cmp('t1266 st', days(A.b.st), days(B.b.st)); }
if (A.c && B.c) { cmp('t1243 rows', (A.c.rows || []).filter((r) => r[0] <= N), (B.c.rows || []).filter((r) => r[0] <= N)); cmp('t1243 body', days(A.c.body), days(B.c.body)); }
if (A.e && B.e) { cmp('t1277 ore', days(A.e.ore), days(B.e.ore)); cmp('t1277 cell', days(A.e.cell), days(B.e.cell)); }
console.log(`날 1~${N}: 같은 칸 ${same} · 다른 칸 ${diff}` + (where.length ? ' — ' + where.join(' · ') : ''));
process.exitCode = diff ? 1 : 0;
