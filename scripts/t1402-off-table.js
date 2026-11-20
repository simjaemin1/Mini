#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1402 판 ③ · 판정 0)
// === scripts/t1402-off-table.js — T1386 표(넓이 × 안 들어온 날 → 남는 칸)를 서버 켜짐 / 꺼짐 하루 · 사흘 · 보름으로 다시 ==========
//
// ★무엇: 존 정본을 켬으로 실제로 띄워 땅을 걸고(나선 · 집 = 첫 칸 · 가득) 내린 뒤, DB 를 "A 일 전에 떠난 사람 · 마지막 k 일은 서버가 꺼져 있던 판"으로 옮겨
//   (청크 셈 시각 · 빚 셈 시각을 A 일 앞으로 · 마지막 살아 있던 시각을 k 일 앞으로) 다시 띄운다 → 부팅이 꺼진 k 일을 물리고 셈 → 남는 칸.
//   꺼진 날이 표를 안 움직이면: 남는 칸(N, A, k) = 남는 칸(N, A − k, 0).
//   node scripts/t1402-off-table.js [--json <파일>]   (약 10분 · 아이 판 백여 개)
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYMS = 24 * 3600 * 1000;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const MODE = process.env.__T1402T || '';
const PID = 't1402_tab';
if (MODE) {
  Object.assign(process.env, { ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CLAIM_ABSENCE: '0', T1305_DEEDS: '1' });
  const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const H = require(path.join(ROOT, 'server', 'zone.js')).__testBind();
  console.log = _l;
  const SZ = H.BUILDING_SIZE, R = {};
  if (MODE === 'claim') {
    const N = +process.env.__T1402_N, o = [], seen = new Set(); let x = 0, y = 0, dx = 1, dy = 0, run = 1, st = 0, tu = 0;
    while (o.length < N) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); o.push([x, y]); } x += dx; y += dy; if (++st === run) { st = 0; [dx, dy] = [-dy, dx]; if (++tu % 2 === 0) run++; } }
    const p = { pid: 'p_tab', playerId: PID, name: 'tab', persistent: false, ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: { wood: 99999, stone: 99999 }, equipment: [], equipSlots: {}, craftSkill: {} };
    H.players.set(p.pid, p);
    for (const [cx, cy] of o) { p.x = (59000 + cx) * SZ + SZ / 2; p.y = (59000 + cy) * SZ + SZ / 2; H.tryClaim(p, 'personal'); }
    H.players.delete(p.pid);
    H._t1343Advance(PID, H._t1402Uptime()); H._t1402Save(Date.now());
  } else {
    H._t1343Advance(PID, H._t1402Uptime());   // 부팅 셈이 틱 예산으로 끊겼으면 마저(같은 결과 — T1389 ⓒ)
  }
  R.live = [...H.claims.values()].filter((c) => c.ownerPid === PID && (c.state || 'active') !== 'free').length;
  R.off = H._t1402Stat().off / DAYMS;
  console.log('@@T1402T ' + JSON.stringify(R));
  process.exit(0);
}
const { DatabaseSync } = require('node:sqlite');
const child = (mode, env) => {
  let o = ''; try { o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1402T: mode, ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(37960)) }, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 300000, maxBuffer: 16 * 1024 * 1024 }); } catch (e) { o = String((e && e.stdout) || ''); }
  const m = /@@T1402T (\{.*\})/.exec(o); return m ? JSON.parse(m[1]) : { err: true };
};
const rm = (f) => { for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + x); } catch (e) {} } };
const NS = [24, 30, 40, 70, 100, 155], AS = [3, 7, 15, 30, 41], KS = [0, 1, 3, 15];
const out = { rows: [] }, tag = `${process.pid}`;
console.log('=== T1402 넓이 × 안 들어온 날(A) → 남는 칸 · 서버 켜짐(k = 0) / 마지막 k 일 꺼짐 ===');
console.log('| 넓이 | 안 들어온 날 | 켜짐 | 꺼짐 1일 | 꺼짐 3일 | 꺼짐 15일 | 꺼진 날이 표를 안 움직임(= 켜짐 A − k) |');
console.log('|---:|---:|---:|---:|---:|---:|---|');
let allSame = true;
for (const N of NS) {
  const base = `/tmp/t1402-tab-${tag}-${N}.db`; rm(base);
  const C = child('claim', { DB_PATH: base, __T1402_N: String(N) });
  if (C.err || C.live !== N) { console.log(`| ${N} | (걸기 실패 ${JSON.stringify(C)}) |`); continue; }
  const rem = new Map();
  const get = (A, k) => {
    const key = A + ',' + k; if (rem.has(key)) return rem.get(key);
    if (A - k <= 0) { rem.set(key, N); return N; }
    const db = `/tmp/t1402-tab-${tag}-${N}-${A}-${k}.db`; rm(db); fs.copyFileSync(base, db);
    for (const x of ['-wal', '-shm']) { try { fs.copyFileSync(base + x, db + x); } catch (e) {} }
    const d = new DatabaseSync(db);
    d.prepare('UPDATE deed_chunks SET t = t - ?').run(A * DAYMS);
    try { d.prepare('UPDATE deed_owners SET dt = dt - ? WHERE dt IS NOT NULL').run(A * DAYMS); } catch (e) {}
    const row = d.prepare('SELECT data FROM world_meta WHERE zone = ?').get('deedclock:hanbando'), j = JSON.parse(row.data);
    j.alive = Date.now() - k * DAYMS; d.prepare('UPDATE world_meta SET data = ? WHERE zone = ?').run(JSON.stringify(j), 'deedclock:hanbando'); d.close();
    const r = child('read', { DB_PATH: db }); rm(db);
    const v = r.err ? null : r.live; rem.set(key, v); return v;
  };
  for (const A of AS) {
    const cells = KS.map((k) => (k <= A ? get(A, k) : null));
    const same = KS.every((k, i) => k > A || k === 0 || cells[i] === get(A - k, 0));
    if (!same) allSame = false;
    out.rows.push({ N, A, cells, same });
    console.log(`| ${N} | ${A}일 | ${cells.map((c) => (c == null ? '—' : c)).join(' | ')} | ${same ? '○' : '✗'} |`);
  }
  rm(base);
}
out.allSame = allSame;
console.log(`\n  꺼진 날이 표를 안 움직임: ${allSame ? '○ 전부' : '✗ 어긋난 줄 있음'}`);
const J = arg('--json', null); if (J) fs.writeFileSync(J, JSON.stringify(out, null, 1));
