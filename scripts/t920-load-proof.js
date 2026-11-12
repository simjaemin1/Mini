#!/usr/bin/env node
// === scripts/t920-load-proof.js — `__loadReport()` 상자 판(T920 ②) · 러너 밖 계측 자 ==========================================
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 **새 컨텍스트(빈 캐시)** 페이지를 `--n` 번 띄워
//   로비 → "들어가기" → 들어감 뒤 `__loadReport()` 결과(갈래 ms · 층 · 받은 메시지 · 페이지 적재)를 모은다. 값은 이 상자 값이다.
//   존 env 는 이 자를 부른 env 를 그대로 물려받는다 — 손잡이를 켠 판을 재려면 env 를 얹는다.
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t920-load-proof.js [--n 3] [--out /tmp/t920] [--tag 이름]
//   ★[T1131] --wait <ms> = 로비에서 누르기까지 틈(기본 3000 — 종전 값 · 0 = 「나루터로 간다」가 눌릴 수 있게 되자마자) ·
//            --throttle = Chromium 망 조임(CDP · 10 Mbit/s · 왕복 100ms — t1123-lobby-measure 와 같은 수) ·
//            --root <트리> = 서버(central · 존)를 다른 트리에서 띄운다(main 작업트리 견줌) ·
//            판마다 `img` = 눌림 뒤 게임 그림: 눌림 때 아직 안 온 것 · 눌림 뒤 받은 KB · 마지막 그림 도착(눌림 기준) · 나무 열둘이 다 뜬 때(눌림 기준)
'use strict';
if (require.main === module) require('./lib-port').hold(3010, 3020);   // [T1288] 제품 고정 포트(존 설정 · central 기본) — 띄우는 동안 이 기계에서 혼자 쥔다(나란히 돌면 줄 선다 · `lib-port.hold`)
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
const WAIT = +arg('--wait', '3000');
const THROTTLE = process.argv.includes('--throttle');
const SROOT = arg('--root', ROOT);
const GAME = /\/assets\/(trees|nature|buildings|bridge|crops|terrain|icons|mountains)\/|\/assets\/icons\.lock\.json|\/terrain\.json/;   // [T1131] 게임 그림 문을 지나는 주소
const CDB = `/tmp/t920-c-${process.pid}.db`, ZDB = `/tmp/t920-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(SROOT, 'server', file)], { cwd: SROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  console.log(`\n=== T920 첫 접속 표 — 브라우저 ${BR} · ${N}판 · ${TAG} · 로비 틈 ${WAIT}ms${THROTTLE ? ' · 망 조임' : ''} · 서버 ${SROOT} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  await sleep(5000);
  const browser = await require('./e2e-browser').launch({ headless: true });
  const runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    // [T1131] 나무 열둘이 다 뜬 때(페이지 시계) — 50ms 마다 본다(읽기만)
    await ctx.addInitScript(() => { try { performance.setResourceTimingBufferSize(5000); } catch (e) {} window.__t1131Trees = null;
      const iv = setInterval(() => { try { if (typeof TREE_SPRITES !== 'undefined' && TREE_SPRITES.length && TREE_SPRITES.every((im) => im.complete && im.naturalWidth > 0)) { window.__t1131Trees = performance.now(); clearInterval(iv); } } catch (e) {} }, 50); });
    const page = await ctx.newPage();
    if (THROTTLE && BR === 'chromium') {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
    }
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 120000 }).catch(() => {});
    if (WAIT > 0) await sleep(WAIT);   // 로비에서 사람이 누르기까지의 틈(그림 · 소리 적재가 이 틈에 이어진다 — 표의 "눌림 뒤 도착" 칸)
    const en = await page.$('#enter'); if (en) await en.click();
    const inw = await FixClock.waitInWorld(page, { timeoutMs: 240000 });
    const r = inw.ok ? await page.evaluate(() => window.__loadReport().then((x) => x && { verdict: x.verdict, total: x.total, settled: x.settled, stages: x.stages, layers: x.layers, long: x.long, msgs: x.msgs, resources: x.resources, welcome: x.welcome, text: x.text, at: x.at })) : null;
    if (r) {   // [T1131] 눌림 뒤 게임 그림 — 나무 열둘을 기다린다(상한 120초 · 판정 아님 · 표만)
      await page.waitForFunction(() => window.__t1131Trees != null, null, { timeout: 120000 }).catch(() => {});
      r.img = await page.evaluate((src) => {
        const re = new RegExp(src), c = (window.__loadReportResult && window.__loadReportResult.at && window.__loadReportResult.at.click) || null;
        const g = performance.getEntriesByType('resource').filter((e) => re.test(e.name));
        const after = g.filter((e) => c != null && e.responseEnd > c);
        const last = g.reduce((a, e) => Math.max(a, e.responseEnd), 0);
        return { click: c == null ? null : Math.round(c), n: g.length, pendingAtClick: after.length, kbAfter: Math.round(after.reduce((a, e) => a + (e.transferSize || 0), 0) / 1024),
          lastAfterClick: c == null ? null : Math.round(last - c), treesAfterClick: (c == null || window.__t1131Trees == null) ? null : Math.round(window.__t1131Trees - c),
          png: g.filter((e) => /\.png(\?|$)/.test(e.name)).length, webp: g.filter((e) => /\.webp(\?|$)/.test(e.name)).length, gimg: window.__gimg ? window.__gimg() : null };
      }, GAME.source).catch(() => null);
    }
    console.log(`\n--- ${i + 1} ---\n${r ? r.text : '(입장 실패)'}${r && r.img ? `\n[T1131 눌림 뒤 게임 그림] 눌림 @${r.img.click} · 그때 아직 안 온 것 ${r.img.pendingAtClick}/${r.img.n} · 눌림 뒤 받은 ${r.img.kbAfter} KB · 마지막 그림 도착 +${r.img.lastAfterClick}ms · 나무 열둘 다 뜸 +${r.img.treesAfterClick}ms · png ${r.img.png} · webp ${r.img.webp}` : ''}`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t920-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs }, null, 1));
    await ctx.close(); await sleep(2000);
  }
  fs.writeFileSync(path.join(OUT, `t920-${TAG}.txt`), runs.map((r, i) => `--- ${i + 1} ---\n${r ? r.text : '(실패)'}`).join('\n\n') + '\n');
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
