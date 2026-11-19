#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1389 판 · 세계 안 만짐 · 판정 0 — 두 안은 재민이 고른다)
// === scripts/t1389-corridor-sim.js — 복도 막힘 두 안(T1386 회부 1): 복도로 늘린 땅 꼴 셋 × 안 들어온 날 → 남는 칸 ==========
//
// ★무엇: `server/deeds.js` 정본 `advance`(빚 · 먼 칸 · 갈라짐 — `claims` 정본 객체를 넘겨 빠른 길)를 그대로 부른다(사본 0).
//   ㉠ 지금대로(끔 기본) — 바닥난 청크의 칸이 다 목이면 빚을 들고 기다린다(다른 청크가 바닥나는 순간 쌓인 빚만큼 한꺼번에).
//   ㉡ `T1389_NECK_GIVE`(여기선 `opt.neckGive`) — 가장 먼 목 칸을 풀고(빚 −100) 그 칸이 떼어 낸 조각 가운데 집이 안 든 조각을 통째로 내준다.
// ★판의 조건: 집 = (0, 0)(집 덩이의 첫 칸) · 덩이 4×4 · 복도는 너비 1(y = 1 줄 · 청크 4×4 안에 복도 칸만 든 청크가 생긴다).
//   가득에서 버티는 날 D(N) 의 절반 동안 → 떠나는 날 복도만 빼고 다 가득으로 돌봄(복도 청크는 반쯤 빔 — 길은 지나만 다닌다) → 그 뒤 한 번도 안 들어옴.
//   "모두 가득에서 떠남" 줄도 함께(복도가 같이 바닥나면 막힘이 안 생긴다 — 두 안이 같다).
//
//   node scripts/t1389-corridor-sim.js [--json <파일>]
if (require.main === module) require('./lib-port').noCentral();   // [T1288] 규약 머리 줄(존 안 띄움)
process.env.T1305_DEEDS = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Deeds = require(path.join(ROOT, 'server', 'deeds.js'));
const Claims = require(path.join(ROOT, 'server', 'claims.js'));
const F = Deeds.CFG, DAY = F.DAY_MS;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const JOUT = arg('--json', null);
const blob = (x0, y0) => { const o = []; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) o.push([x0 + x, y0 + y]); return o; };
const line = (x0, x1, y) => { const o = []; for (let x = x0; x <= x1; x++) o.push([x, y]); return o; };
const col = (x, y0, y1) => { const o = []; for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
const SHAPES = [
  ['외길 — 집 덩이 · 복도 12 · 먼 덩이', [blob(0, 0), blob(16, 0)], [line(4, 15, 1)]],
  ['갈래 — 집 덩이에서 복도 둘 · 끝마다 덩이', [blob(0, 0), blob(12, 0), blob(0, 12)], [line(4, 11, 1), col(1, 4, 11)]],
  ['사슬 — 덩이 · 복도 · 덩이 · 복도 · 덩이', [blob(0, 0), blob(12, 0), blob(24, 0)], [line(4, 11, 1), line(16, 23, 1)]],
];
function landOf(blobs, paths) {   // 칸 차례 = 집 덩이 → 덩이 · 복도(차례는 셈에 안 든다 — 집 = (0, 0))
  const P = { chunks: [], cells: [], home: '0,0', debt: 0, t: 0, others: 0 }, by = new Map(), pathCells = new Set(paths.flat().map(([x, y]) => x + ',' + y));
  for (const [x, y] of [...blobs.flat(), ...paths.flat()]) { const [cx, cy] = Deeds.chunkOf(x, y), key = cx + ',' + cy; if (!by.has(key)) { const c = { key, n: 0, m: 0, t: 0, path: true }; by.set(key, c); P.chunks.push(c); } const c = by.get(key); c.n++; if (!pathCells.has(x + ',' + y)) c.path = false; P.cells.push({ id: x + ',' + y, x, y, key }); }
  for (const c of P.chunks) c.m = Deeds.capOf(c.n);
  return P;
}
const AWAY = [3, 7, 15, 30, 41];
const out = { away: AWAY, rows: [] };
console.log('=== T1389 복도 막힘 두 안 — 남는 칸(집 칸 포함) · ㉠ 기다림(지금 · 끔 기본) / ㉡ 집 쪽이 아닌 조각을 통째로 ===');
console.log('| 땅 꼴 | 칸 | 떠날 때 | 안 | ' + AWAY.map((d) => d + '일').join(' | ') + ' | 막힘 · 한꺼번에 가장 많이 |');
console.log('|---|---:|---|---|' + AWAY.map(() => '---:').join('|') + '|---|');
for (const [name, blobs, paths] of SHAPES) {
  const cells = [...blobs.flat(), ...paths.flat()];
  for (const pre of ['복도만 반쯤 빔', '모두 가득']) {
    for (const give of [false, true]) {
      const row = [], burst = [];
      for (const d of AWAY) {
        const P = landOf(blobs, paths), at = (x) => x * DAY, half = Deeds.daysOf(cells.length) / 2;   // 복도는 버티는 날의 절반 동안 못 돌봄
        Deeds.advance(P, at(half), Claims, null, null, { neckGive: give });
        if (pre === '복도만 반쯤 빔') { for (const c of P.chunks) if (!c.path) Deeds.addPts(P, c, 1e12); }
        else for (const c of P.chunks) Deeds.addPts(P, c, 1e12);
        let maxAt = 0; const per = new Map();
        Deeds.advance(P, at(half + d), Claims, (cell, t) => { const k = Math.round(t); per.set(k, (per.get(k) || 0) + 1); }, null, { neckGive: give });
        for (const v of per.values()) maxAt = Math.max(maxAt, v);
        row.push(P.cells.length); burst.push(maxAt);
      }
      const st = Deeds._debtStat.stuck;
      out.rows.push({ shape: name, cells: cells.length, pre, give, row, burst: Math.max(...burst) });
      console.log(`| ${name} | ${cells.length} | ${pre} | ${give ? '㉡' : '㉠'} | ${row.join(' | ')} | 한 순간 최대 ${Math.max(...burst)}칸 |`);
    }
  }
}
out.stat = Object.assign({}, Deeds._debtStat);
console.log(`\n  셈 표: 막힘 ${out.stat.stuck}번 · ㉡ 내준 번 ${out.stat.neckGive | 0}`);
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
