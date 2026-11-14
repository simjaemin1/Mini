#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1303 잼 표 자 · 제품 무변 · 읽기만)
// === scripts/t1303-table.js — 고침 앞/뒤 두 판(몸 전부 · 밭 켬 · 같은 시드)의 꼬리표 분포 · econ 까닭 일치 % · 세계 지문 맞대기 ===
//   쓰는 법: node scripts/t1303-table.js <앞 t1303 관찰기 JSON(.gz 도)> <뒤 t1303 관찰기 JSON>
//   칸: 10날마다 인구(앞 : 뒤) · 적힌 꼬리표(굶음 · 늙음) · econ 까닭(굶음 · 늙음) · 일치 % · 몸이 받은 꼬리표(굶음 · 늙음 · 그 밖) · 날마다 세계 지문 같은 날 수.
const fs = require('fs');
const zlib = require('zlib');
const load = (f) => { let b = fs.readFileSync(f); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); };
const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) { console.error('쓰는 법: node scripts/t1303-table.js <앞.t1303.json> <뒤.t1303.json>'); process.exit(2); }
const A = load(fa), B = load(fb);
const pct = (S) => (S && S.pct != null ? `${S.pct}%` : '—');
const bd = (x) => { if (!x) return '—'; const o = Object.entries(x).filter(([k]) => k !== 'starve' && k !== 'old').reduce((s, [, v]) => s + v, 0); return `${x.starve || 0} · ${x.old || 0} · ${o}`; };
const sn = (r) => new Map(r.snaps.filter((s) => s.why === 'ten').map((s) => [s.day, s]));
const SA = sn(A), SB = sn(B);
const days = [...new Set([...SA.keys(), ...SB.keys()])].sort((x, y) => x - y);
console.log('| 날 | 인구 앞 : 뒤 | 적힌 굶음 · 늙음 앞 : 뒤 | econ 굶음 · 늙음(앞 = 뒤) | 일치 앞 : 뒤 | 몸이 받은 굶음 · 늙음 · 그 밖 앞 : 뒤 |');
console.log('|---:|---|---|---|---|---|');
for (const d of days) {
  const a = SA.get(d), b = SB.get(d);
  const pop = `${a ? a.pop.toLocaleString() : '—'} : ${b ? b.pop.toLocaleString() : '—'}${a && b ? (a.pop === b.pop ? '' : ' ✗') : ''}`;
  const nt = (s) => (s ? `${s.sum.noted.starve} · ${s.sum.noted.old}` : '—');
  const ec = (s) => (s ? `${s.sum.econ.starve} · ${s.sum.econ.old}` : '—');
  const ecTxt = a && b && ec(a) !== ec(b) ? `${ec(a)} : ${ec(b)} ✗` : ec(a || b);
  console.log(`| ${d} | ${pop} | ${nt(a)} : ${nt(b)} | ${ecTxt} | ${pct(a && a.sum)} : ${pct(b && b.sum)} | ${bd(a && a.bodyDied)} : ${bd(b && b.bodyDied)} |`);
}
// 날마다 세계 지문(관찰기 ⓑ — 날 머리 · 'exit' 줄 뺌)
const fp = (r) => new Map(r.fp.filter((x) => x.length === 2).map((x) => [x[0], x[1]]));
const FA = fp(A), FB = fp(B);
let same = 0, n = 0, first = null;
for (const [d, h] of FA) { if (!FB.has(d)) continue; n++; if (FB.get(d) === h) same++; else if (first == null || d < first) first = d; }
const lastA = A.snaps[A.snaps.length - 1], lastB = B.snaps[B.snaps.length - 1];
console.log('');
console.log(`세계 지문(날 머리 · 곳간 · 주민 · 주거): 함께 닿은 날 ${n} 중 같음 ${same}${first != null ? ` · 첫 갈림 날 ${first}` : ''}`);
const ex = (r) => r.fp.find((x) => x[2] === 'exit');
const xa = ex(A), xb = ex(B);
if (xa && xb) console.log(`판 끝 지문(exit): 앞 날 ${xa[0]} ${xa[1]} · 뒤 날 ${xb[0]} ${xb[1]} → ${xa[0] === xb[0] && xa[1] === xb[1] ? '같음' : '다름'}`);
for (const [nm, s] of [['앞', lastA], ['뒤', lastB]]) {
  const S = s.sum, n2 = S.agree + S.miss;
  console.log(`${nm}(날 ${s.day} · ${s.why}): 인구 ${s.pop.toLocaleString()} · 적힌 꼬리표 굶음 ${S.noted.starve} · 늙음 ${S.noted.old} · econ 굶음 ${S.econ.starve}(식량 빚) · 늙음 ${S.econ.old}(나이 ${S.econ.nat} · 인구식 고리 ${S.econ.rest}) · 일치 ${S.agree}/${n2} = ${pct(S)} · 어긋남 ${S.miss}(빚→늙음 ${S.missBy.starveAsOld} · 늙음→굶음 ${S.missBy.oldAsStarve}) · 몸이 받은 ${bd(s.bodyDied)}`);
}
