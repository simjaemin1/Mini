#!/usr/bin/env node
// 흐름 텍스처 굽기 비용 **분해** 진단기 (물가 렉 원인 추적용 · 일회성 계측)
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 600) { for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zone-wrap-wc.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zone-wrap-wc.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/wc.db', CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0' });
  console.log('zone:', await waitHttp(`http://localhost:${ZPORT}/health`));
  await sleep(4000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(20000);
  for (const [lbl, k] of [['대조(slowFlow)', { slowFlow: true }], ['수리본', { slowFlow: false }]]) {
    await page.evaluate((kk) => Object.assign(window.__terrain19, kk), k);
    await page.evaluate(() => window.__wfReset && window.__wfReset());
    await sleep(500);
    const r = await page.evaluate(() => window.__wfProbe(6, 16));
    console.log(`\n${lbl}  (step 16셀 = 실제 주행 한 칸)`);
    for (const v of r) console.log(`   총 ${String(v.ms).padStart(6)}ms | 물판정 ${String(v.wet).padStart(6)}ms(재사용 ${v.reuse}·새질문 ${v.asked}·미결 ${v.pend}) | 흐름 ${String(v.flow).padStart(6)}ms(${v.flowN})`);
  }
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
