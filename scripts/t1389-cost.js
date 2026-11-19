#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1389 계측기 · 세계 안 만짐)
// === scripts/t1389-cost.js — 넓은 땅 한 번 셈 비용 앞 → 뒤(T1386 회부 4) ==========
//
// ★무엇: 같은 땅(집 = (0, 0) · 나선으로 이어진 N칸 · 가득에서 떠나 한 달 안 들어옴)을 한 번에 셈하는 데 걸린 ms.
//   앞 = 종전 길(`advance(P, now, claims.components)` — 술어 함수 · 문자열 열쇠 · 땅 전체 두 번)
//   뒤 = 새 길(`advance(P, now, claims)` — 정본 객체 · 정수 열쇠 · 이웃 무리 번갈아 넓히기 · 한 셈 안 다시 씀)
//   두 길이 같은 칸을 같은 차례 · 같은 시각에 푸는지도 함께(sha1) · 틱 예산(존 `_T1389_BUDGET_MS` = 1000 ÷ 30 ÷ 2 ms)으로 끊으면 몇 토막인가.
//   node scripts/t1389-cost.js [--old <앞 뿌리>] [--json <파일>]
if (require.main === module) require('./lib-port').noCentral();
process.env.T1305_DEEDS = '1';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const D = require(path.join(ROOT, 'server', 'deeds.js'));
const C = require(path.join(ROOT, 'server', 'claims.js'));
const DAY = D.CFG.DAY_MS;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const JOUT = arg('--json', null);
const OLD = arg('--old', null);   // 앞 = 이 뿌리의 deeds · claims(예: T1389 앞 커밋의 git worktree) · 없으면 같은 정본의 술어 함수 길
const DO = OLD ? require(path.join(OLD, 'server', 'deeds.js')) : D, CO = OLD ? require(path.join(OLD, 'server', 'claims.js')) : C;
const BUDGET = 1000 / 30 / 2;
function spiral(n) { const o = [], seen = new Set(); let x = 0, y = 0, dx = 1, dy = 0, run = 1, st = 0, tu = 0; while (o.length < n) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); o.push([x, y]); } x += dx; y += dy; if (++st === run) { st = 0; [dx, dy] = [-dy, dx]; if (++tu % 2 === 0) run++; } } return o; }
function land(N) {
  const P = { chunks: [], cells: [], home: '0,0', debt: 0, t: 0, others: 0 }, by = new Map();
  for (const [x, y] of spiral(N)) { const [cx, cy] = D.chunkOf(x, y), key = cx + ',' + cy; if (!by.has(key)) { const c = { key, n: 0, m: 0, t: 0 }; by.set(key, c); P.chunks.push(c); } by.get(key).n++; P.cells.push({ id: x + ',' + y, x, y, key }); }
  for (const c of P.chunks) c.m = D.capOf(c.n);
  return P;
}
const once = (N, G, days, DD) => { DD = DD || D; const P = land(N), ord = []; const t0 = process.hrtime.bigint(); DD.advance(P, days * DAY, G, (c, at) => ord.push(c.id + '@' + Math.round(at))); const ms = Number(process.hrtime.bigint() - t0) / 1e6; return { ms, freed: ord.length, sha: crypto.createHash('sha1').update(ord.join(';')).digest('hex').slice(0, 12) }; };
const sliced = (N, days) => { const P = land(N); let parts = 0, worst = 0, freed = 0; for (let k = 0; k < 100000; k++) { const t0 = process.hrtime.bigint(); const r = D.advance(P, days * DAY, C, () => freed++, null, { budgetMs: BUDGET }); worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6); parts++; if (r.done !== false) break; } return { parts, worst, freed }; };
const rows = [];
console.log('=== T1389 한 번 셈 비용 — 가득에서 떠나 30일 안 들어온 땅을 한 번에(ms · 셋 중 가운데) ===');
console.log('| 칸 | 풀린 칸 | 앞(--old 뿌리 · 없으면 술어 함수) ms | 뒤(정본 객체) ms | 차례 · 시각 같음 | 틱 예산 ' + BUDGET.toFixed(1) + ' ms 로 끊으면 토막 · 한 토막 최대 ms |');
console.log('|---:|---:|---:|---:|---|---|');
for (const N of [155, 400, 1000, 5879]) {
  const med = (f) => { const a = [f(), f(), f()]; a.sort((p, q) => p.ms - q.ms); return a[1]; };
  const slow = N <= 1000 ? med(() => once(N, CO.components, 30, DO)) : null;
  const fast = med(() => once(N, C, 30));
  const sl = sliced(N, 30);
  const row = { N, freed: fast.freed, slowMs: slow && +slow.ms.toFixed(1), fastMs: +fast.ms.toFixed(1), same: slow ? slow.sha === fast.sha : null, parts: sl.parts, worstPart: +sl.worst.toFixed(1), slicedFreed: sl.freed };
  rows.push(row);
  console.log(`| ${N} | ${fast.freed} | ${slow ? slow.ms.toFixed(1) : '(안 잼 — 수 초)'} | ${fast.ms.toFixed(1)} | ${slow ? (row.same ? '같음' : '다름') : '-'} | ${sl.parts}토막 · ${sl.worst.toFixed(1)} ms(풀린 칸 ${sl.freed}) |`);
}
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify({ budgetMs: BUDGET, rows }, null, 1));
