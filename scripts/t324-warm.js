#!/usr/bin/env node
// === scripts/t324-warm.js — 인원 곡선용 틀 세계 굽기 (T324 추신 1) ==========================
// ⚠계측기다(러너 밖). 제품 무접촉. `t316-fish-perf.js` 의 틀 굽기 절을 **그 문법 그대로** 떼어 쓴다.
// 왜 — 추신 1: "답은 사람당 µs **와 그 곡선**(1,476 · 3,000 · 8,318)". 곡선을 내려면 인원이 다른
//   세계가 여럿 있어야 한다. 인원은 게임일이 정한다 ⇒ 깊이 구운 틀 DB 를 만든다.
// 실행: WARM_DAYS=150 OUT=/tmp/t324-tpl-d150.db node scripts/t324-warm.js
'use strict';
const path = require('path'); const fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const DAYS = parseInt(process.env.WARM_DAYS || '150', 10);
const OUT = process.env.OUT || `/tmp/t324-tpl-d${DAYS}.db`;
const DAY_MS = parseInt(process.env.WARM_DAY_MS || '12000', 10);
const PB = parseInt(process.env.PORT_BASE || '3670', 10);
const SEED_DB = process.env.SEED_DB || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const SECRET = 't324-warm', CP = PB, ZP = PB + 1, DB = `/tmp/t324-warm-z.db`;
rmdb(DB); rmdb('/tmp/t324-warm-c.db');
if (SEED_DB) for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(SEED_DB + s, DB + s); } catch (e) {} }
const logf = fs.openSync('/tmp/t324-warm.log', 'w');
const c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
  env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: '/tmp/t324-warm-c.db', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', logf, logf],
  env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
    ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY_MS), DB_PATH: DB, VILLAGE_WAR_LOG: '0' }) });
const perf = async () => { try { const r = await fetch(`http://localhost:${ZP}/perf`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
const life = async () => { try { const r = await fetch(`http://localhost:${ZP}/lifedbg`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
const health = async () => { try { const r = await fetch(`http://localhost:${ZP}/health`); return r.ok; } catch (e) { return false; } };
const dayOf = (p) => (p && p.econTick && p.econTick.last && p.econTick.last.day) || 0;
(async () => {
  for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
  let d = 0; const t0 = Date.now();
  while (d < DAYS && Date.now() - t0 < 170 * 60000) {
    await sleep(20000); const p = await perf(); d = dayOf(p);
    if ((Date.now() - t0) % 120000 < 20000) { const L = await life(); console.log('  day', d, '인구', L && L.totals ? L.totals.pop : '?'); }
  }
  const L = await life();
  console.log('완료 day', d, '인구', L && L.totals ? L.totals.pop : '?');
  await sleep(8000);
  try { z.kill('SIGINT'); } catch (e) {} await sleep(4000);
  try { z.kill('SIGKILL'); c.kill('SIGKILL'); } catch (e) {} await sleep(800);
  rmdb(OUT);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(DB + s, OUT + s); } catch (e) {} }
  console.log('틀 →', OUT);
  process.exit(0);
})();
