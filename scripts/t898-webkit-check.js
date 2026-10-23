#!/usr/bin/env node
// === scripts/t898-webkit-check.js — WebKit(Safari 엔진)에서 산 띠 readPixels 옮기기(T898)를 켜도 산이 같게 그려지나 · 러너 밖 계측 자 ==========
//
//   이 상자엔 Playwright WebKit 이 없다(`playwright install` 금지). WebKitGTK 의 WebDriver(`WebKitWebDriver` · MiniBrowser)를
//   W3C WebDriver 로 직접 몬다 — 같은 WebKit 엔진(JavaScriptCore · WebGL)이다(Safari 그 자체는 아니다 · 보고 §2).
//   존은 `T898_MT_READPX=1` 로 띄운다. 입장 → 광산1 → 다 구운 뒤 켬 · 끔 · 켬(페이지에서 `uiCfg.mtReadPx` + 산 청크 캐시 비우기)마다
//   다 굽기를 기다려 세그먼트 화소 해시 · 스크린샷 · 옮기기 계량(`_mt898`)을 남긴다.
// 준비(한 번): apt-get install -y webkit2gtk-driver xvfb
// 실행: node scripts/t898-webkit-check.js [--out /tmp/t898/wk]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t898/wk'); fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020, WD = 4444, DISP = ':99';
const CDB = `/tmp/t898wk-c-${process.pid}.db`, ZDB = `/tmp/t898wk-z-${process.pid}.db`;
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
  console.log('\n=== T898 ② WebKit(WebKitGTK MiniBrowser) — 산 띠 readPixels 옮기기 ===');
  const c = run(process.execPath, [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = run(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T898_MT_READPX: '1' });
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
  const ui = await js(() => !!(uiCfg && uiCfg.mtReadPx));
  console.log(`  · welcome uiCfg.mtReadPx = ${ui}`);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  const v = rows.find((r) => r.name === '광산1') || rows[0];
  await js((x, y) => { window.__sendPrimary({ type: 'teleport_debug', x, y }); return true; }, [v.cx * 32 + 16, v.cy * 32 + 16]);
  const snap = () => js(() => ({ ms: _mt3BakeMs, n: _mt3BakeN, jobs: _mt3Jobs.size, chunks: _mt3Chunk.size, x: Object.assign({}, _mt898), gl: _mgl.ok,
    cv: _mgl.cv ? [_mgl.cv.width, _mgl.cv.height] : null, on: !!(uiCfg && uiCfg.mtReadPx) }));
  const settle = async (capMs) => { const t0 = Date.now(); let last = await snap(), same = 0;
    while (Date.now() - t0 < capMs) { await sleep(1000); const s2 = await snap(); if (s2.jobs === 0 && s2.n === last.n && s2.n > 0) same++; else same = 0; last = s2; if (same >= 5) return true; }
    return false; };
  const hashAll = () => js(() => { const out = {};
    for (const [key, segs] of _mt3Chunk) { const parts = [];
      for (const s2 of segs || []) { const cv = s2.img; let h = 0x811c9dc5;
        if (cv && cv.width && cv.height) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } }
        parts.push([h.toString(16), cv ? cv.width : 0, cv ? cv.height : 0, s2.x, s2.y, s2.merged].join('|')); }
      out[key] = { n: (segs || []).length, merged: (segs || []).some((q) => q.merged), sig: parts.join(';') }; }
    return out; });
  const shot = async (tag) => { const b64 = await wd('GET', `/session/${SID}/screenshot`); const f = path.join(OUT, `wk-${tag}.png`); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
  const arm = async (on, tag) => {
    const a = await snap();
    await js((o) => { uiCfg.mtReadPx = o; window.__mt3gl(1); needsRedraw = true; return true; }, [on]);
    await sleep(8000);   // 비운 뒤 첫 굽기가 시작되기 전 몇 초를 '다 구웠다'로 읽지 않게
    const ok = await settle(600000); const b = await snap(); const H = await hashAll(); const f = await shot(tag);
    console.log(`  · ${tag}: 다 굽기 ${ok} · 청크 ${b.n - a.n} · 청크당 ${b.n > a.n ? ((b.ms - a.ms) / (b.n - a.n)).toFixed(0) : '-'}ms · 옮기기 켬 ${(b.x.ms - a.x.ms).toFixed(0)}ms/${b.x.n - a.x.n} · 끔 ${(b.x.msOff - a.x.msOff).toFixed(0)}ms/${b.x.nOff - a.x.nOff} · GL ${b.gl} ${JSON.stringify(b.cv)}`);
    return { on, ok, n: b.n - a.n, ms: b.ms - a.ms, moveOn: [b.x.ms - a.x.ms, b.x.n - a.x.n], moveOff: [b.x.msOff - a.x.msOff, b.x.nOff - a.x.nOff], gl: b.gl, H, shot: f };
  };
  await settle(600000);
  const A = await arm(true, 'on'), B = await arm(false, 'off'), C = await arm(true, 'on2');
  const cmp = (P, Q) => { const ks = Object.keys(P).filter((k) => k in Q); return { common: ks.length, segs: ks.reduce((s2, k) => s2 + P[k].n, 0), merged: ks.filter((k) => P[k].merged).length, diff: ks.filter((k) => P[k].sig !== Q[k].sig).length }; };
  const res = { browser: `${s.capabilities.browserName} ${s.capabilities.browserVersion}`, welcome: ui, village: v.name,
    arms: [A, B, C].map((q) => ({ on: q.on, ok: q.ok, n: q.n, ms: q.ms, moveOn: q.moveOn, moveOff: q.moveOff, gl: q.gl, shot: q.shot })),
    pix: { on_off: cmp(A.H, B.H), on_on2: cmp(A.H, C.H), off_on2: cmp(B.H, C.H) } };
  fs.writeFileSync(path.join(OUT, 'wk-res.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res.pix));
  try { await wd('DELETE', `/session/${SID}`); } catch (e) {}
  shutdown(); process.exit(0);
})().catch((e) => { console.log('WebKit 확인 실패:', e && e.message); shutdown(); process.exit(1); });
