#!/usr/bin/env node
// === scripts/t392-frame-profile.js — 열린 땅 330~376ms/f 의 주인 (T392 ②) =============
//
// ★계측기다 — 러너 밖 · 제품 무접촉 · **고치지 않는다**(회부 → 세션4 T395 가 클라 프레임 전체를 맡는다).
//
// ★T384 §5-3: 마을·빈 초지에서 세 팔 모두 render 330~376ms/f 였고 "가르지 않았다". 여기서 가른다.
//   자 둘:
//   ⓐ 이미 있는 층 자 — `render()` 한 번(감싸기) · 지면 타일(`_tileAccDbg`) · 자연물(`__natDbg.ms`) ·
//      안개 광선(`__fogSegDbg` 선분·광선·교차 호출) · 게이트(`__fogGateDbg` 총 항목)
//   ⓑ **CPU 프로파일**(CDP `Profiler`) — 함수별 **자기 시간** 상위. JS 가 먹는가, 래스터(프로파일 밖)가 먹는가를
//      가른다: 프로파일 합이 render 에 닿으면 JS 다(GPU 가 있어도 같다) · 안 닿으면 래스터·합성 쪽이다.
//
// 실행: node scripts/t392-frame-profile.js [--secs 4]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const SECS = +((process.argv.includes('--secs') ? process.argv[process.argv.indexOf('--secs') + 1] : '') || 4);
const PLACES = [
  { name: '숲 한복판(임업3)', x: 57382, y: 61114 },
  { name: '마을(농촌2)', x: 19862, y: 110368 },
  { name: '빈 초지(어촌1 동 2,500)', x: 43964, y: 75424 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
const killAll = () => { for (const p of procs) { try { p.kill(); } catch (e) {} } };
const WRAP = '/tmp/zone-wrap-t392p.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);

(async () => {
  console.log(`=== 열린 땅 프레임 — 층 자 + CPU 프로파일 · ${SECS}초 (T392 ②) ===`);
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: '3010', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok) process.exit(1);
  const z = boot(WRAP, { PORT: '3020', ZONE_ID: 'hanbando', DB_PATH: '/tmp/t392-prof.db', CENTRAL_URL: 'http://localhost:3010', ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0' });
  if (!(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) process.exit(1);
  await sleep(20000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  console.log(`브라우저: ${browser.version()} · 헤드리스`);
  const out = [];
  for (const P of PLACES) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('http://localhost:3010/'); await sleep(2500);
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
    try { await (await page.$('#enter')).click(); } catch (e) {}
    await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), { timeout: 90000 });
    await page.evaluate(() => {
      if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 });
      if (window.__terrain19) window.__terrain19.windOff = true;
      // ★`_tileAccDbg` 는 31-m-move 가 30프레임마다 0 으로 비운다 — 누적을 그대로 읽으면 그 창만 잰다.
      //   ⇒ render 한 번 **앞뒤 차**로 내 칸에 쌓는다(자연물 `_natAcc` 도 같은 문법).
      const o = window.render; window.__pMs = []; window.__pTile = 0; window.__pNat = 0;
      window.render = function () {
        const a = window._tileAccDbg || 0, b = window._natAcc || 0, t = performance.now();
        o();
        window.__pMs.push(performance.now() - t);
        window.__pTile += (window._tileAccDbg || 0) - a; window.__pNat += (window._natAcc || 0) - b;
      };
    });
    // 도착(서버 권위)
    let arrived = false;
    for (let k = 0; k < 4 && !arrived; k++) {
      await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [P.x, P.y]);
      arrived = await page.waitForFunction(([x, y]) => { const c = conns.get(window.__getPrimaryZoneId()); const m = window.__getSrvAbs(); return !!(c && c.meta && m) && Math.abs(m.x - c.meta.worldOffsetX - x) < 64 && Math.abs(m.y - (c.meta.worldOffsetY || 0) - y) < 64; }, [P.x, P.y], { timeout: 30000, polling: 250 }).then(() => true).catch(() => false);
    }
    await sleep(8000);
    // 층 자 — 초기화 후 SECS 초
    await page.evaluate(() => { window.__pMs.length = 0; window.__pTile = 0; window.__pNat = 0; });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
    const t0 = Date.now();
    await sleep(SECS * 1000);
    const { profile } = await cdp.send('Profiler.stop');
    const wall = Date.now() - t0;
    const layers = await page.evaluate(() => {
      const ms = window.__pMs.slice(); const s = ms.slice().sort((a, b) => a - b);
      const f = window.__fogSegDbg || {}, g = window.__fogGateDbg || {};
      return { frames: ms.length, sum: ms.reduce((a, b) => a + b, 0), med: s[s.length >> 1] || 0,
               tiles: window.__pTile, natCollect: window.__pNat, natEma: (window.__natDbg || {}).ms,
               segs: f.segs, rays: f.rays, rsi: f.rsi, gateTotal: g.total, gateDrawn: g.drawn, gateSkipped: g.skipped };
    });
    // 프로파일 — 노드별 자기 시간(표본 수 × 간격)
    const byId = new Map(); for (const n of profile.nodes) byId.set(n.id, n);
    const self = new Map();
    const dt = profile.timeDeltas || []; const smp = profile.samples || [];
    for (let i = 0; i < smp.length; i++) {
      const n = byId.get(smp[i]); if (!n) continue;
      const cf = n.callFrame; const file = (cf.url || '').split('/').pop().split('?')[0];
      const key = `${cf.functionName || '(익명)'} · ${file}${cf.lineNumber >= 0 && file ? ':' + (cf.lineNumber + 1) : ''}`;
      self.set(key, (self.get(key) || 0) + (dt[i + 1] || dt[i] || 0) / 1000);
    }
    // ★`drawImage` 는 네이티브라 자기 시간만으로는 **누가 불렀나**를 모른다 — 부모 노드(호출한 JS 줄)로 한 번 더 모은다.
    const parentOf = new Map(); for (const n of profile.nodes) for (const ch of (n.children || [])) parentOf.set(ch, n.id);
    const diCaller = new Map();
    for (let i = 0; i < smp.length; i++) {
      const n = byId.get(smp[i]); if (!n || n.callFrame.functionName !== 'drawImage') continue;
      const pn = byId.get(parentOf.get(n.id)); if (!pn) continue;
      const cf = pn.callFrame; const file = (cf.url || '').split('/').pop().split('?')[0];
      const key = `${cf.functionName || '(익명)'} · ${file}:${cf.lineNumber + 1}`;
      diCaller.set(key, (diCaller.get(key) || 0) + (dt[i + 1] || dt[i] || 0) / 1000);
    }
    const tot = [...self.values()].reduce((a, b) => a + b, 0);
    const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    out.push({ P, arrived, wall, layers, tot, top, di: [...diCaller.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) });
    await ctx.close();
  }
  await browser.close(); killAll();
  const f1 = (v) => (+v || 0).toFixed(1);
  console.log('');
  console.log('| 자리 | 도착 | 프레임/초 | render 중앙값 ms | 지면 타일 ms/f | 자연물 모으기 ms/f | 안개 선분 · 광선 · 교차 | 게이트 항목(그림/안개 뺌) |');
  console.log('|---|---|---:|---:|---:|---:|---|---|');
  for (const o of out) {
    const L = o.layers, F = Math.max(1, L.frames);
    console.log(`| ${o.P.name} | ${o.arrived ? 'O' : '★X'} | ${f1(L.frames / (o.wall / 1000))} | ${f1(L.med)} | ${f1(L.tiles / F)} | ${f1(L.natCollect / F)} | ${L.segs} · ${L.rays} · ${L.rsi} | ${L.gateTotal}(${L.gateDrawn}/${L.gateSkipped}) |`);
  }
  for (const o of out) {
    console.log('');
    console.log(`### ${o.P.name} — CPU 자기 시간 상위(표본 합 ${f1(o.tot)}ms / 벽시계 ${o.wall}ms · render 합 ${f1(o.layers.sum)}ms)`);
    console.log('| 함수 · 자리 | ms | 몫 |');
    console.log('|---|---:|---:|');
    for (const [k, v] of o.top) console.log(`| \`${k}\` | ${f1(v)} | ${f1(100 * v / Math.max(1, o.tot))}% |`);
    if (o.di.length) console.log('  `drawImage` 를 부른 줄: ' + o.di.map(([k, v]) => `\`${k}\` ${f1(v)}ms`).join(' · '));
  }
  process.exit(0);
})().catch((e) => { console.log('★예외 ' + (e && e.stack || e)); killAll(); process.exit(1); });
