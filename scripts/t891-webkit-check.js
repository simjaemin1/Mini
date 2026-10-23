#!/usr/bin/env node
// === scripts/t891-webkit-check.js — WebKit(Safari 엔진)에서 물 층 ½ 해상도를 켜도 물이 그려지나 (T891 ③ · 러너 밖 계측 자) ==========
//
//   이 상자엔 Playwright WebKit 이 없다(`playwright install` 금지). 대신 WebKitGTK 의 WebDriver(`WebKitWebDriver` · MiniBrowser)를
//   W3C WebDriver 로 직접 몬다 — 같은 WebKit 엔진(JavaScriptCore · WebGL)이다(Safari 그 자체는 아니다 · 보고 §3).
//   존은 `T891_WATER_HALF=1` 로 띄운다. 입장 → 물 있는 마을 물가로 텔레포트 → 물 층 상태(`__waterDbg` · GL 캔버스 크기 · 물 상자)를 읽고
//   켬 · 끔(페이지에서 `uiCfg.waterHalf` 를 바꿈) 스크린샷을 남긴다.
// 준비(한 번): apt-get install -y webkit2gtk-driver xvfb
// 실행: node scripts/t891-webkit-check.js [--out /tmp/t891/wk]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t891/wk'); fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020, WD = 4444, DISP = ':99';
const CDB = `/tmp/t891wk-c-${process.pid}.db`, ZDB = `/tmp/t891wk-z-${process.pid}.db`;
const MB = '/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const run = (cmd, args, env) => { const p = spawn(cmd, args, { cwd: ROOT, env: Object.assign({}, process.env, env || {}), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; };
const shutdown = () => { for (const p of procs.reverse()) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', shutdown);
let SID = null;
async function wd(method, p, body) {
  const r = await fetch(`http://localhost:${WD}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000) });
  const j = await r.json(); if (j && j.value && j.value.error) throw new Error(`${p} ${j.value.error}: ${j.value.message}`); return j.value;
}
const js = (fn, args) => wd('POST', `/session/${SID}/execute/sync`, { script: `return (${fn}).apply(null, arguments)`, args: args || [] });

(async () => {
  console.log('\n=== T891 ③ WebKit(WebKitGTK MiniBrowser) — 물 층 ½ 해상도 ===');
  const c = run(process.execPath, [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = run(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T891_WATER_HALF: '1' });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  run('Xvfb', [DISP, '-screen', '0', '1280x800x24']);
  await sleep(1500);
  run('WebKitWebDriver', [`--port=${WD}`], { DISPLAY: DISP });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  await sleep(3000);
  const s = await wd('POST', '/session', { capabilities: { alwaysMatch: { 'webkitgtk:browserOptions': { binary: MB, args: ['--automation'] } } } });
  SID = s.sessionId;
  console.log(`  · 브라우저 ${s.capabilities.browserName} ${s.capabilities.browserVersion}`);
  await wd('POST', `/session/${SID}/window/rect`, { width: 1100, height: 720 }).catch(() => {});
  await wd('POST', `/session/${SID}/url`, { url: `http://localhost:${CPORT}/` });
  for (let i = 0; i < 60; i++) { if (await js(() => { const s2 = document.getElementById('startZone'); return s2 ? s2.options.length : 0; })) break; await sleep(500); }
  await js(() => { const b = document.getElementById('enter'); if (b) b.click(); return true; });
  let inw = false;
  for (let i = 0; i < 180 && !inw; i++) { inw = await js(() => !!(window.__getMyAbs && window.__getMyAbs() && typeof myPid !== 'undefined' && myPid)); if (!inw) await sleep(1000); }
  console.log(`  · 입장 ${inw}`);
  if (!inw) process.exit(1);
  await sleep(3000);
  const ui = await js(() => !!(uiCfg && uiCfg.waterHalf));
  console.log(`  · welcome uiCfg.waterHalf = ${ui}`);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  const v = rows.find((r) => r.name === '어촌1') || rows[0];
  await js((x, y) => { window.__sendPrimary({ type: 'teleport_debug', x, y }); return true; }, [v.cx * 32 + 16, v.cy * 32 + 16]);
  await sleep(6000);
  const shore = await js(() => {
    const a = window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs(); const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
    const c0 = [Math.floor(a.x / 32), Math.floor(a.y / 32)];
    for (let r = 1; r < 90; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const wx = (c0[0] + dx) * 32 + 16, wy = (c0[1] + dy) * 32 + 16;
      if (!isWaterAtAbs(wx, wy)) continue;
      const L = Math.hypot(dx, dy); let lx = wx, ly = wy;
      for (let k = 1; k < 12; k++) { const tx = wx - Math.round(dx / L * k) * 32, ty = wy - Math.round(dy / L * k) * 32; if (!isWaterAtAbs(tx, ty)) { lx = tx - Math.round(dx / L * 2) * 32; ly = ty - Math.round(dy / L * 2) * 32; break; } }
      return { local: [lx - (z2.worldOffsetX || 0), ly - (z2.worldOffsetY || 0)] };
    }
    return null;
  });
  if (shore) await js((x, y) => { window.__sendPrimary({ type: 'teleport_debug', x, y }); return true; }, shore.local);
  await sleep(10000);
  const st = async () => js(() => ({ dbg: window.__waterDbg ? { on: window.__waterDbg.on, webgl: window.__waterDbg.webgl } : null, half: !!(uiCfg && uiCfg.waterHalf),
    cv: (typeof _wgl !== 'undefined' && _wgl.cv) ? [_wgl.cv.width, _wgl.cv.height] : null, rect: (typeof _wfCache !== 'undefined' && _wfCache.rect) || null,
    canvas: (() => { const c2 = document.getElementById('canvas'); return c2 ? [c2.width, c2.height] : null; })() }));
  const shot = async (tag) => { const b64 = await wd('GET', `/session/${SID}/screenshot`); const f = path.join(OUT, `wk-${tag}.png`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
  const on = await st(); const fOn = await shot('on');
  await js(() => { uiCfg.waterHalf = false; return true; }); await sleep(3000);
  const off = await st(); const fOff = await shot('off');
  const res = { browser: `${s.capabilities.browserName} ${s.capabilities.browserVersion}`, welcomeHalf: ui, village: v.name, shore: !!shore, on, off, shots: [fOn, fOff] };
  fs.writeFileSync(path.join(OUT, 'wk-res.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  try { await wd('DELETE', `/session/${SID}`); } catch (e) {}
  shutdown(); process.exit(0);
})().catch((e) => { console.log('WebKit 확인 실패:', e && e.message); shutdown(); process.exit(1); });
