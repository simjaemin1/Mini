#!/usr/bin/env node
// === scripts/t913-lag-proof.js — `__lagReport()` 증명 판(T913 ③) · 러너 밖 계측 자 ==========================================
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 실클라 하나를 띄워 마을(기본 광산1 — 물 없음 · `--village`)에 서서
//   `__lagReport(N)` 을 세 판 돈다 — 판정이 **맞는 쪽을 가리키는지** 일부러 일으킨 렉으로 본다(값은 이 상자 값이다).
//     ① 평소        — 아무것도 안 한다
//     ② 클라 막힘   — 페이지에 3초마다 300ms 바쁜 고리를 건다(이 자만 넣는다 · 제품 0) → 판정이 "클라" 여야 한다
//     ③ 서버 멈춤   — 존 프로세스를 3초마다 0.8초 SIGSTOP/SIGCONT → 판정이 "서버" 여야 한다(서버가 보낸 틱 간격이 튄다)
//   글(`__lagReportText`)과 값을 `--out` 에 남긴다.
// 실행: [E2E_BROWSER=webkit] node scripts/t913-lag-proof.js [--out /tmp/t913] [--sec 30]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t913'); fs.mkdirSync(OUT, { recursive: true });
const SEC = +arg('--sec', '30'), VIL = arg('--village', '광산1');
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t913-c-${process.pid}.db`, ZDB = `/tmp/t913-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGCONT'); p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  console.log(`\n=== T913 렉 보고 증명 — 브라우저 ${BR} · ${SEC}초 × 3 ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const logs = [];
  page.on('console', (m) => { const t = m.text(); if (/렉 보고|\[frame\]/.test(t)) logs.push(t); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  const v = rows.find((r) => r.name === VIL) || rows[0];
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [v.cx * 32 + 16, v.cy * 32 + 16]);
  await sleep(20000);   // 도착 · 첫 굽기가 가라앉게
  const res = { browser: BR, village: v.name, runs: [] };
  const run = async (tag, during) => {
    let stop = null;
    if (during === 'client') await page.evaluate(() => { window.__t913busy = setInterval(() => { const t = performance.now(); while (performance.now() - t < 300) {} }, 3000); });
    if (during === 'server') { const iv = setInterval(() => { try { z.kill('SIGSTOP'); setTimeout(() => { try { z.kill('SIGCONT'); } catch (e) {} }, 800); } catch (e) {} }, 3000); stop = () => clearInterval(iv); }
    const r = await page.evaluate((s) => window.__lagReport(s).then((x) => x && { verdict: x.verdict, main: x.main, evidence: x.evidence, table: x.table, text: x.text }), SEC);
    if (stop) { stop(); await sleep(1000); try { z.kill('SIGCONT'); } catch (e) {} }
    if (during === 'client') await page.evaluate(() => clearInterval(window.__t913busy));
    console.log(`\n--- ${tag} ---\n${r ? r.text : '(결과 없음)'}`);
    res.runs.push({ tag, during, ...r });
    fs.writeFileSync(path.join(OUT, `t913-${BR}-${VIL}.json`), JSON.stringify(res, null, 1));
    await sleep(3000);
  };
  await run('① 평소', null);
  await run('② 클라 막힘(3초마다 300ms)', 'client');
  await run('③ 서버 멈춤(3초마다 0.8초)', 'server');
  res.consoleLines = logs.length;
  fs.writeFileSync(path.join(OUT, `t913-${BR}-${VIL}.json`), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(OUT, `t913-${BR}-${VIL}.txt`), res.runs.map((r) => `--- ${r.tag} ---\n${r.text}`).join('\n\n') + '\n');
  console.log(`\n  · 판정: ${res.runs.map((r) => `${r.tag} → ${r.main || '없음'}`).join(' · ')}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
