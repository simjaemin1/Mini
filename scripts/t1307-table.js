#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1307 표 자 · 읽기만)
// === scripts/t1307-table.js — t1307 관찰기 JSON(gz 도) → 10날 표: 출생 · 집 짓기(바람 · 지음 · 지은 수용력 · 목재에 묶임) · 곳간 목재 · 나무꾼 · 주거 문 · 집터 ===
//   쓰는 법: node scripts/t1307-table.js 이름=<관찰기 JSON> [이름=<…> …]  [--pair 이름A:이름B …]
//   10날 칸 k = 날 줄 k−9 ~ k(관찰기 날 = econ `tickVillage` 날) — 합 칸(출생 · 마을-날 · 수용력)은 그 열 날 합 · 곳간 목재 · 나무꾼 · 농부 · 인구 · 완공 집은 끝 날 값.
//   `--pair A:B` — 두 판을 칸마다 나란히(A : B).
const fs = require('fs');
const zlib = require('zlib');
const args = process.argv.slice(2);
const runs = [], pairs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--pair') { pairs.push(args[++i].split(':')); continue; }
  const j = args[i].indexOf('='); if (j < 0) continue;
  const name = args[i].slice(0, j), f = args[i].slice(j + 1);
  let buf = fs.readFileSync(f); if (/\.gz$/.test(f)) buf = zlib.gunzipSync(buf);
  runs.push({ name, d: JSON.parse(buf.toString('utf8')) });
}
const SUM = ['born', 'hWant', 'hBuilt', 'hCap', 'hNoWood', 'gate', 'zGate', 'sSite', 'sNew', 'sDone', 'woodOut', 'woodCons'];
const LAST = ['pop', 'woodSt', 'lumber', 'farmer', 'sHouses'];
function tens(d) {
  const I = {}; d.cols.forEach((k, i) => { I[k] = i; });
  const out = [];
  const maxDay = d.rows.length ? d.rows[d.rows.length - 1][0] : 0;
  for (let e = 10; e <= Math.ceil(maxDay / 10) * 10; e += 10) {
    const rs = d.rows.filter((r) => r[0] > e - 10 && r[0] <= e); if (!rs.length) continue;
    const o = { end: e, to: rs[rs.length - 1][0] };
    for (const k of SUM) o[k] = rs.reduce((a, r) => a + (+r[I[k]] || 0), 0);
    for (const k of LAST) o[k] = +rs[rs.length - 1][I[k]] || 0;
    out.push(o);
  }
  return out;
}
const R = (x) => Math.round(x).toLocaleString('en-US');
const lines = [];
for (const r of runs) {
  const T = tens(r.d), srv = !!r.d.server;
  lines.push(`## ${r.name}  (${srv ? '몸 세계' : '랩'} · 날 ${T.length ? T[T.length - 1].to : 0}까지${r.d.err ? ' · 관찰기 오류 ' + r.d.err.slice(0, 80) : ''})`);
  lines.push('| 날 | 인구 | 출생 | 집 바람 마을-날 | 지은 마을-날 | 지은 수용력 | 목재에 묶임 마을-날 | 곳간 목재 | 나무꾼 | 농부 | 수식 벌목 | 쓴 목재 | 주거 문 마을-날 | 출생 0 · 주거 문 | ' + (srv ? '집터 선 마을-날 | 새 집터 | 완공 집 | 완공 집 합 |' : ''));
  lines.push('|---|' + '---:|'.repeat(srv ? 17 : 13));
  for (const o of T) lines.push(`| ${o.end - 10}~${o.to} | ${R(o.pop)} | ${R(o.born)} | ${R(o.hWant)} | ${R(o.hBuilt)} | ${o.hCap.toFixed(1)} | ${R(o.hNoWood)} | ${R(o.woodSt)} | ${R(o.lumber)} | ${R(o.farmer)} | ${R(o.woodOut)} | ${R(o.woodCons)} | ${R(o.gate)} | ${R(o.zGate)} |` + (srv ? ` ${R(o.sSite)} | ${R(o.sNew)} | ${R(o.sDone)} | ${R(o.sHouses)} |` : ''));
  lines.push('');
}
for (const [a, b] of pairs) {
  const A = runs.find((r) => r.name === a), B = runs.find((r) => r.name === b); if (!A || !B) continue;
  const TA = tens(A.d), TB = tens(B.d);
  lines.push(`## ${a} : ${b}`);
  lines.push('| 날 | 인구 | 출생 | 지은 수용력 | 목재에 묶임 마을-날 | 곳간 목재 | 나무꾼 | 농부 | 수식 벌목 | 주거 문 마을-날 | 출생 0 · 주거 문 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const oa of TA) {
    const ob = TB.find((o) => o.end === oa.end); if (!ob) continue;
    const c = (k, f) => `${f ? f(oa[k]) : R(oa[k])} : ${f ? f(ob[k]) : R(ob[k])}`;
    lines.push(`| ${oa.end - 10}~${Math.min(oa.to, ob.to)} | ${c('pop')} | ${c('born')} | ${c('hCap', (x) => x.toFixed(1))} | ${c('hNoWood')} | ${c('woodSt')} | ${c('lumber')} | ${c('farmer')} | ${c('woodOut')} | ${c('gate')} | ${c('zGate')} |`);
  }
  lines.push('');
}
process.stdout.write(lines.join('\n') + '\n');
