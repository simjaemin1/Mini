#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T728 실클라 확인 · 제품 무변)
// === scripts/t728-client-clock.js — 실클라(Chromium)에서 시계 다시 맞추기 · 날짜 경계 넘김 ==========================
//   node scripts/t728-client-clock.js          ← 켬(`T728_RESTART_KEEP=1`)
//   T728_RESTART_KEEP=0 node scripts/t728-client-clock.js   ← 끔 대조(다시 맞추기 없음 · 날짜는 방송 때)
//   잰다(같은 기계 — 참 차 0):
//     ① 입장 뒤 클라 차(`worldClock.serverNowOffset`)
//     ② 차를 일부러 +60초 틀어 놓고 2초 뒤 — 켬이면 pong 이 다시 맞춘다(끔이면 틀린 채 남는다)
//     ③ 날짜 경계(VILLAGE_DAY_MS 20초 날) 둘 — 클라 날짜가 넘어간 순간의 서버 시각 − 그 경계 시각(켬) · 방송 도착까지(끔)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const KEEP = process.env.T728_RESTART_KEEP !== '0';
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t728-cc-central-${process.pid}.db`, ZDB = `/tmp/t728-cc-zone-${process.pid}.db`;
for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
(async () => {
  console.log(`\n=== T728 실클라 시계 — ${KEEP ? '켬' : '끔'} ===`);
  const C = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cUp = FB.waitUp(C, /central server up on/, { name: 'central' });
  const Z = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', VILLAGE_DAY_MS: '20000', T728_RESTART_KEEP: KEEP ? '1' : '0' });
  const zUp = FB.waitUp(Z, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok((await cUp).ok, 'central 기동'); ok((await zUp).ok, 'zone 기동');
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const b = await page.$('#enter'); if (b) await b.click();
  for (let i = 0; i < 60 && !(await page.evaluate(() => !!(window.__getMyAbs && window.__getMyAbs()))); i++) await sleep(500);
  await sleep(3000);
  const clk = () => page.evaluate(() => window.__t728Clock ? window.__t728Clock() : null);
  const c0 = await clk();
  ok(!!c0 && Number.isFinite(c0.offset), '① 입장 — 클라 차', c0 && `${c0.offset.toFixed(1)} ms${c0.iv ? ` · 구간 [${c0.iv[0].toFixed(0)}, ${c0.iv[1].toFixed(0)}]` : ''} · 날짜 ${c0.cal} · 다음 ${c0.next}`);
  // ② 일부러 틀기
  await page.evaluate(() => { worldClock.serverNowOffset += 60000; if (worldClock._t728Iv) { worldClock._t728Iv[0] += 60000; worldClock._t728Iv[1] += 60000; } });   // 시계가 뛴 셈(구간째 옮긴다)
  await sleep(2500);
  const c1 = await clk();
  if (KEEP) ok(!!c1.iv && c1.iv[0] <= 0 && 0 <= c1.iv[1] && Math.abs(c1.offset) <= (c1.iv[1] - c1.iv[0]) / 2 + 1, '★② 켬 — +60초 틀어 놓은 차를 pong 이 다시 맞췄다(2.5초 뒤 · 참 차 0 이 구간 안 · 오차 ≤ 구간 반폭)', `${c1.offset.toFixed(1)} ms${c1.iv ? ` · 구간 [${c1.iv[0].toFixed(0)}, ${c1.iv[1].toFixed(0)}]` : ''}`);
  else ok(Math.abs(c1.offset - 60000) < 200, '② 끔 — 틀린 차가 그대로 남는다(대조)', `${c1.offset.toFixed(1)} ms`);
  if (!KEEP) await page.evaluate(() => { worldClock.serverNowOffset -= 60000; });
  // ③ 날짜 경계 둘
  const lags = [];
  for (let k = 0; k < 2; k++) {
    const s = await clk(); const d0 = s.cal;
    let at = s.at, seen = null;
    for (let i = 0; i < 600; i++) {   // 30초까지
      const r = await page.evaluate(() => ({ day: window.__calendar() ? window.__calendar().day : null, sv: Date.now() + worldClock.serverNowOffset, c: window.__t728Clock() }));
      if (r.day !== d0) { seen = r; break; }
      if (r.c.at) at = r.c.at;
      await sleep(50);
    }
    if (seen && at) lags.push(Math.round(seen.sv - at)); else if (seen) lags.push(null);
  }
  if (KEEP) ok(lags.length === 2 && lags.every((x) => x != null && x >= 0 && x < 300), '★③ 켬 — 클라가 날짜를 **경계 순간에** 넘긴다(서버 시각 − 경계)', lags.join(' · ') + ' ms');
  else ok(lags.length === 2, '③ 끔 — 날짜는 방송 도착 때 넘어간다(경계 시각을 모른다)', lags.join(' · '));
  ok(errs.length === 0, '페이지 오류 0', errs.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
