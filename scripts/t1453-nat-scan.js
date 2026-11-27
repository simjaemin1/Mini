#!/usr/bin/env node
// === scripts/t1453-nat-scan.js — T1453 자연물 막음 잰값(계측 자 · @regress 없음) ======================================
//   라이브 크기 목록(길 456,479칸 · 건물 5,806 — `t1446-synth.js`)을 welcome 에 실어(T1446 재현 틀과 같은 길 · 마을 끔) 마을 가운데에 서서
//   Chromium · WebKit 각각: 종전 Set 다시 굽기 한 판(`__t1453.natRebuildMs` 다섯 번 중앙) · 켬 칸 셈표 세우기(`ccBuildMs`) ·
//   프레임마다 자연물 모으기 끔 ↔ 켬(`_natCollect` 20 ms 넘게 되풀이 · 중앙) · 한 판에 묻는 칸 · 같음 대조(3,000점) · 그린 소품 끔 ↔ 켬 ·
//   자연물 청크 한 장 굽기(`_natBuildChunk` — 종전 그대로) · 시야 청크 수. 결과 = 브라우저마다 JSON 한 줄.
// 실행: node scripts/t1453-nat-scan.js   (BR=chromium,webkit · VIL=0)
'use strict';
const ROOT = require('path').join(__dirname, '..');
process.chdir(ROOT);
if (require.main === module) require('./lib-port').hold(3010, 3020);
const path = require('path'), fs = require('fs'), { spawn } = require('child_process');
const FB = require('./fixture-boot');
const SY = require('./t1446-synth');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
const V = SY.villageCenters();
const AT = V.vils.find((v) => v.name === '농촌22') || V.vils[0];
const RD = SY.synthRoads({});
const BD = SY.synthBuildings({ at: AT });
function inject(m) { if (typeof m !== 'string' || m.lastIndexOf('{"type":"welcome"', 0) !== 0) return m; const o = JSON.parse(m); o.roads = RD.flat; o.buildings = (o.buildings || []).concat(BD); return JSON.stringify(o); }
(async () => {
  const t0 = Date.now();
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: '3010', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  console.log(await FB.waitUp(c, /central server up on/, { name: 'central' }).then((r) => r.why));
  const db = require('path').join(require('os').tmpdir(), `t1453-nat-scan-${process.pid}.db`); try { fs.unlinkSync(db); } catch (e) {}
  const z = boot(path.join(ROOT, 'server', 'zone.js'), { PORT: '3020', ZONE_ID: 'hanbando', DB_PATH: db, CENTRAL_URL: 'http://localhost:3010', ENABLE_VILLAGES: process.env.VIL || '0', ENABLE_BANDITS: '0' });
  const r = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); console.log(r.why, 'boot', Date.now() - t0, 'ms');
  const PW = require('playwright');
  for (const bn of (process.env.BR || 'chromium,webkit').split(',')) {
    const browser = await PW[bn].launch();
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.routeWebSocket(/:3020/, (ws) => { const s = ws.connectToServer(); ws.onMessage((m) => s.send(m)); s.onMessage((m) => ws.send(inject(m))); });
    await page.goto('http://localhost:3010/' + (process.env.Q || ''));
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, null, { timeout: 45000 }).catch(() => {});
    try { await page.click('#enter'); } catch (e) {}
    const entered = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), null, { timeout: 90000 }).then(() => true).catch(() => false);
    const goal = { x: AT.cx * 32 + 16, y: AT.cy * 32 + 16 };
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [goal.x, goal.y]);
    await sleep(9000);
    const out = await page.evaluate(() => {
      const O = window.__fogOrigin;
      const med = (fn, reps) => { let k = 1; for (;;) { const t = performance.now(); for (let i = 0; i < k; i++) fn(); if (performance.now() - t >= 20 || k >= 4096) break; k *= 2; }
        const a = []; for (let i = 0; i < (reps || 11); i++) { const t = performance.now(); for (let j = 0; j < k; j++) fn(); a.push((performance.now() - t) / k); } a.sort((x, y) => x - y); return +a[a.length >> 1].toFixed(4); };
      const T = window.__t1453;
      const reb = []; for (let i = 0; i < 5; i++) reb.push(T.natRebuildMs()); reb.sort((a, b) => a - b);
      const cc = []; for (let i = 0; i < 3; i++) cc.push(T.ccBuildMs()); cc.sort((a, b) => a - b);
      T.setNat(false); _natBlocked(0, 0);
      const offMs = med(() => { const o = []; _natCollect(o, O.x, O.y); });
      T.setNat(true);
      const n0 = T.stat().asked; const o1 = []; _natCollect(o1, O.x, O.y); const asked = T.stat().asked - n0;
      const onMs = med(() => { const o = []; _natCollect(o, O.x, O.y); });
      const chk = T.natCheck(T.natPts(3000, 1453));
      //   자연물 청크 한 장 굽기(종전 그대로 — 막음은 청크에 안 굽는다) · 시야 청크 수
      const cc0 = Math.floor(O.x / 32 / 8), cr0 = Math.floor(O.y / 32 / 8);
      const chunkMs = med(() => { _natChunk.delete((cc0 + 50) + '_' + cr0 + '_' + (__terrain19.frFloor || 0)); _natBuildChunk(cc0 + 50, cr0); }, 7);
      const viewChunks = (Math.floor((O.x + 1500) / 32 / 8) - Math.floor((O.x - 1500) / 32 / 8) + 1) * (Math.floor((O.y + 1500) / 32 / 8) - Math.floor((O.y - 1500) / 32 / 8) + 1);
      // props drawn off vs on
      T.setNat(false); const a = []; _natCollect(a, O.x, O.y); T.setNat(true); const b = []; _natCollect(b, O.x, O.y);
      const sig = (L) => L.map((x) => x.s.x + ',' + x.s.y + ',' + x.s.nm).join('|');
      return { reb: reb[2], cc: cc[1], offMs, onMs, asked, chk, chunkMs, viewChunks, propsA: a.length, propsB: b.length, same: sig(a) === sig(b), stat: T.stat(), dbg: window.__natDbg && { props: window.__natDbg.props, fringe: window.__natDbg.fringe } };
    });
    console.log(bn, 'entered', entered, JSON.stringify(out), 'errs', errs.slice(0, 3));
    await browser.close();
  }
  for (const p of procs) try { p.kill(); } catch (e) {}
  process.exit(0);
})().catch((e) => { console.log('ERR', e && e.stack); for (const p of procs) try { p.kill(); } catch (x) {} process.exit(1); });
