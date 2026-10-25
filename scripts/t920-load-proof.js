#!/usr/bin/env node
// === scripts/t920-load-proof.js — `__loadReport()` 상자 판(T920 ②) · 러너 밖 계측 자 ==========================================
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 **새 컨텍스트(빈 캐시)** 페이지를 `--n` 번 띄워
//   로비 → "들어가기" → 들어감 뒤 `__loadReport()` 결과(갈래 ms · 층 · 받은 메시지 · 페이지 적재)를 모은다. 값은 이 상자 값이다.
//   존 env 는 이 자를 부른 env 를 그대로 물려받는다 — 손잡이를 켠 판을 재려면 env 를 얹는다.
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t920-load-proof.js [--n 3] [--out /tmp/t920] [--tag 이름]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t920'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3');
const BR = require('./e2e-browser').which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t920-c-${process.pid}.db`, ZDB = `/tmp/t920-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  console.log(`\n=== T920 첫 접속 표 — 브라우저 ${BR} · ${N}판 · ${TAG} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  await sleep(5000);
  const browser = await require('./e2e-browser').launch({ headless: true });
  const runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);   // 로비에서 사람이 누르기까지의 틈(그림 · 소리 적재가 이 틈에 이어진다 — 표의 "눌림 뒤 도착" 칸)
    const en = await page.$('#enter'); if (en) await en.click();
    const inw = await FixClock.waitInWorld(page, { timeoutMs: 240000 });
    const r = inw.ok ? await page.evaluate(() => window.__loadReport().then((x) => x && { verdict: x.verdict, total: x.total, settled: x.settled, stages: x.stages, layers: x.layers, long: x.long, msgs: x.msgs, resources: x.resources, welcome: x.welcome, text: x.text })) : null;
    console.log(`\n--- ${i + 1} ---\n${r ? r.text : '(입장 실패)'}`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t920-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs }, null, 1));
    await ctx.close(); await sleep(2000);
  }
  fs.writeFileSync(path.join(OUT, `t920-${TAG}.txt`), runs.map((r, i) => `--- ${i + 1} ---\n${r ? r.text : '(실패)'}`).join('\n\n') + '\n');
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
