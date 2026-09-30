#!/usr/bin/env node
// === scripts/t562-seoul.js — 사본 세계 부팅 뒤 첫 하루 마감 조각 [T562 추신 · 2026-09-30] ======================
//
// ★묻는 것: 산 세계 사본(서울 `hanbando-0930.db` · 몸 무제한)을 띄우면 부팅 뒤 **첫 두 하루 마감**의 가장 큰 조각이 몇 ms 이고
//   그 조각의 주인이 누구인가(T538 추신3 ⓑ: 7,802ms · 5,676ms · `life:쉼표`).
// ★재기만 한다 — 판정·수는 전부 존 `/perf`(`econTick.last` · `tick.ms`)가 낸 값이다. 사본은 /tmp 에 복사해 띄운다(원본 무접촉).
//   하루 = `VILLAGE_DAY_MS`(T538 과 같은 10초 · 테스트 전용 손잡이) · 관측자 0.
// ★제품 코드 0 · 러너 밖. 실행: node scripts/t562-seoul.js --db <사본.db> [--days 4] [--day-ms 10000] [--env K=V] [--out f.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const SRC = val('--db', null), DAYS = +val('--days', '4'), DAYMS = val('--day-ms', '10000');
const CPORT = +val('--cport', '3718'), ZPORT = +val('--zport', '3728');
const OUT = val('--out', '/tmp/t562-seoul.json');
const ZENV = {};
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
if (!SRC || !fs.existsSync(SRC)) { console.log('사본이 없다 — --db <사본.db>'); process.exit(2); }
const ZDB = `/tmp/t562s-zone-${process.pid}.db`, CDB = `/tmp/t562s-central-${process.pid}.db`;
for (const suf of ['', '-wal', '-shm']) if (fs.existsSync(SRC + suf)) { fs.copyFileSync(SRC + suf, ZDB + suf); fs.chmodSync(ZDB + suf, 0o644); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, ['--max-old-space-size=1500', path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const jget = async (u) => { try { return await (await fetch(u, { signal: AbortSignal.timeout(60000) })).json(); } catch (e) { return null; } };

(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const t0 = Date.now();
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_DAY_MS: DAYMS, ...ZENV });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  console.log(`up ${((Date.now() - t0) / 1000).toFixed(0)}초 · 손잡이 ${JSON.stringify(ZENV)}`);
  await jget(`http://localhost:${ZPORT}/perf?reset=1`);
  const byDay = new Map(); let lastSeen = null, polls = 0;
  const tEnd = Date.now() + (DAYS + 1) * (+DAYMS) + 240000;
  while (Date.now() < tEnd && byDay.size < DAYS) {
    await sleep(1500);
    const p = await jget(`http://localhost:${ZPORT}/perf`); polls++;
    const L = p && p.econTick && p.econTick.last;
    if (L && L.day != null && L.day !== lastSeen && L.at) { lastSeen = L.day;
      const st = L.stages || {}, top = Object.entries(st).filter(([k]) => /max$/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 6);
      byDay.set(L.day, { day: L.day, total: L.total, wall: L.wall, maxChunk: L.maxChunk, maxChunkAt: L.maxChunkAt, frames: L.frames, lifeMaxAt: L.lifeMaxAt || null, topMax: top, tickMax: p.tick && p.tick.ms ? p.tick.ms.max : null });
      console.log(`  하루 ${L.day}: 합 ${L.total}ms · 가장 큰 조각 ${L.maxChunk}ms(${L.maxChunkAt}) · 틱 최대 ${p.tick && p.tick.ms ? p.tick.ms.max : '?'}ms · ${top.map(([k, v]) => k + ' ' + v).join(' · ')}`);
      await jget(`http://localhost:${ZPORT}/perf?reset=1`);
    }
  }
  const lifedbg = await jget(`http://localhost:${ZPORT}/lifedbg`);
  const rows = [...byDay.values()];
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), src: SRC, dayMs: +DAYMS, env: ZENV, days: rows, t562: lifedbg && lifedbg.totals ? lifedbg.totals.t562 : null, pop: lifedbg && lifedbg.totals ? lifedbg.totals.pop : null }, null, 1));
  console.log(JSON.stringify({ days: rows.map((r) => [r.day, r.maxChunk, r.maxChunkAt, r.tickMax]), t562: lifedbg && lifedbg.totals ? lifedbg.totals.t562 && { sets: lifedbg.totals.t562.sets, q: lifedbg.totals.t562.q, pend: lifedbg.totals.t562.pend } : null }));
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [ZDB, CDB]) for (const suf of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + suf); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
