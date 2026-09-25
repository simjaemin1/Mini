#!/usr/bin/env node
// === scripts/t384-two-arms.js — 띠를 메우는 두 길의 프레임 ms (T384 ②) =============
//
// ★계측기다 — 러너 밖(`@regress` 표 없음 · 화소를 안 읽으니 `@pixel` 도 아니다).
//   제품 `VIEW_RADIUS` 는 **무변**이다: 컬링 팔은 이 계측기가 브라우저로 가는 `34-m-renderloop.js` 를
//   `page.route` 로 **그 페이지에만** 고쳐 보낸다(`650 → 1500`). 레포 파일은 한 글자도 안 바뀐다.
//
// ★팔 셋 × 자리 셋 — **같은 서버 · 같은 자리 · 같은 프레임 수**.
//   A0  띠 끔(`__farOff(1)` 대조군)           — 지금 main 전(T380) 화면과 같다
//   A1  띠 켬(T384 기본)                       — 원경 층이 650~1,500 을 **그림만으로** 메운다
//   B   컬링을 1,500 으로(계측 페이지에서만)   — 개체가 650~1,500 을 메운다(클릭·채집이 된다 ·
//       그 비용은 개체 경로가 낸다 · 길·다리·도랑·바닥 아이템도 같이 멀리 그린다)
//   자리: 숲 한복판(임업3) · 마을(농촌2) · 빈 초지(어촌1 동쪽 2,500px)
//
// ★자 — `render()` 한 번의 ms(31-m-move 가 부르는 그 함수를 감싼다 · 틱 간격이 아니다).
//   헤드리스 크로미움 소프트웨어 렌더라 **절대값은 이 상자의 값**이다 — 비교는 같은 상자 안의 팔끼리만.
//   값은 **고르지 않는다**(재민 #67).
//
// 실행: node scripts/t384-two-arms.js [--frames 120]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const FRAMES = +((process.argv.includes('--frames') ? process.argv[process.argv.indexOf('--frames') + 1] : '') || 120);
const PLACES = [
  { name: '숲 한복판(임업3)', x: 57382, y: 61114 },
  { name: '마을(농촌2)', x: 19862, y: 110368 },
  { name: '빈 초지(어촌1 동 2,500)', x: 43964, y: 75424 },
];
if (process.argv.includes('--reverse')) PLACES.reverse();   // 순서 효과를 가르는 대조(같은 자리를 반대 순서로)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 100)); });
  procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill(); } catch (e) {} } };
const WRAP = '/tmp/zone-wrap-t384.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);

async function enter(browser, cullArm) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  if (cullArm) {
    await page.route('**/client/34-m-renderloop.js*', async (route) => {
      const r = await route.fetch(); let body = await r.text();
      const before = body;
      body = body.replace('const VIEW_RADIUS = 650;', 'const VIEW_RADIUS = 1500;');
      if (body === before) throw new Error('VIEW_RADIUS 줄을 못 찾았다 — 계측 팔이 제품과 같아진다');
      await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'application/javascript' } });
    });
  }
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  const ok = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), { timeout: 90000 }).then(() => true).catch(() => false);
  if (ok) await page.evaluate(() => {
    if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 });
    if (window.__terrain19) window.__terrain19.windOff = true;
    // render 한 번을 감싼다 — 31-m-move 는 이름으로 부르므로 전역 바인딩을 바꾸면 그대로 탄다.
    if (!window.__t384Wrapped) {
      const o = window.render; window.__t384Ms = [];
      window.render = function () { const t = performance.now(); o(); window.__t384Ms.push(performance.now() - t); };
      window.__t384Wrapped = true;
    }
  });
  return { page, ok };
}
async function measure(page, n) {
  return page.evaluate(async (n) => {
    const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
    await new Promise((r) => setTimeout(r, 1500));
    window.__t384Ms.length = 0;
    const farMs = [], draws = [];
    let n0 = window.__natDbg ? window.__natDbg.treeDraw.n : 0;
    while (window.__t384Ms.length < n) {
      await new Promise((r) => requestAnimationFrame(r));
      const d = window.__farDbg ? window.__farDbg() : null;
      if (d) { farMs.push(d.lastMs); draws.push(d.drawn); }
    }
    const ms = window.__t384Ms.slice(0, n);
    const d = window.__farDbg ? window.__farDbg() : {};
    const nat = window.__natDbg || {};
    const treeDraws = (nat.treeDraw ? nat.treeDraw.n : 0) - n0;
    return { med: q(ms, 0.5), p90: q(ms, 0.9), n: ms.length,
             farMed: farMs.length ? q(farMs, 0.5) : 0, farEma: d.ms, natEma: nat.ms,
             near: d.near, drawn: d.drawn, nMax: d.nMax, capHits: d.capHits, blocked: d.blocked,
             treePerFrame: treeDraws / Math.max(1, ms.length) };
  }, n);
}

(async () => {
  console.log(`=== 두 팔 — 띠(원경 층) 대 컬링 1,500(개체) · 자리 셋 · ${FRAMES}프레임 (T384 ②) ===`);
  const c = boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) { console.log(cu.why); process.exit(1); }
  const z = boot('zone', WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/t384-arms.db',
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0' });   // 원경 방송 손잡이 끔(기본)
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); if (!zu.ok) { console.log(zu.why); process.exit(1); }
  await sleep(20000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const rows = [];
  for (const P of PLACES) {
    const A = await enter(browser, false);
    if (!A.ok) { console.log('  ★입장 실패(A)'); break; }
    await A.page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [P.x, P.y]);
    await sleep(8000);
    await A.page.evaluate(() => window.__farOff(1));
    const a0 = await measure(A.page, FRAMES);
    await A.page.evaluate(() => window.__farForce(1));
    const a1 = await measure(A.page, FRAMES);
    await A.page.close();
    const B = await enter(browser, true);
    if (!B.ok) { console.log('  ★입장 실패(B)'); break; }
    await B.page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [P.x, P.y]);
    await sleep(8000);
    const b = await measure(B.page, FRAMES);
    await B.page.close();
    rows.push({ P, a0, a1, b });
    console.log(`  · ${P.name}: A0 ${a0.med.toFixed(2)} · A1 ${a1.med.toFixed(2)} · B ${b.med.toFixed(2)} ms (중앙값)`);
  }
  await browser.close(); killAll();
  const f = (v) => (v == null ? '-' : (+v).toFixed(2));
  console.log('');
  console.log('| 자리 | A0 띠 끔 render ms (p90) | A1 띠 켬 render ms (p90) | B 컬링 1,500 render ms (p90) | 띠 층 ms (중앙값 · EMA) | 자연물 층 ms (EMA) | 띠 그린 수 / 모은 수 · 최대 | 나무 그리기 호출/프레임 A0 · A1 · B | 상한 닿은 프레임 |');
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    console.log(`| ${r.P.name} | ${f(r.a0.med)} (${f(r.a0.p90)}) | ${f(r.a1.med)} (${f(r.a1.p90)}) | ${f(r.b.med)} (${f(r.b.p90)}) | ${f(r.a1.farMed)} · ${f(r.a1.farEma)} | ${f(r.a1.natEma)} | ${r.a1.drawn} / ${r.a1.near} · ${r.a1.nMax} | ${f(r.a0.treePerFrame)} · ${f(r.a1.treePerFrame)} · ${f(r.b.treePerFrame)} | ${r.a1.capHits} |`);
  }
  console.log('');
  console.log('  ★B 팔에서 띠 층이 모은 수(0 이어야 두 팔이 겹쳐 세지 않은 것): ' + rows.map((r) => r.b.near).join(' · '));
  process.exit(0);
})().catch((e) => { console.log('★예외 ' + (e && e.stack || e)); killAll(); process.exit(1); });
