#!/usr/bin/env node
// === scripts/t920-nat-pix.js — 자연물 청크 예산(T920 · `T920_NAT_BUDGET`) 그림 같음 · 러너 밖 계측 자 ===================================
//
//   실클라 하나(`E2E_BROWSER` — 기본 chromium)로 들어가 같은 자리에서 끔 → 켬 → 끔:
//     갈래마다 자연물 청크 캐시를 비우고(`_natChunk.clear()`) 손잡이 칸(`uiCfg.natBudget`)을 바꾼 뒤 **다 지을 때까지**(`__natDbg.pending` 0 ·
//     청크 수가 3초 그대로) 기다려, 그 자리에서 `_natCollect` 가 내는 목록(z · 자리 · 이름 · 크기 · 위상)의 해시 · 개수와
//     바람 · 물 시각을 멈춘(`__terrain19.freezeT`) 스크린샷을 남긴다. 켬 갈래는 다 짓기까지 걸린 판 수 · ms 도 적는다.
// 실행: [E2E_BROWSER=webkit] node scripts/t920-nat-pix.js [--out /tmp/t920/pix]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t920/pix'); fs.mkdirSync(OUT, { recursive: true });
const VIL = arg('--village', '');   // 비우면 들어간 자리(스폰) · 이름이면 그 마을 한복판으로 텔레포트(예: 어촌1 — 물가 술이 있는 자리)
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t920p-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });

(async () => {
  console.log(`\n=== T920 자연물 청크 예산 — 그림 같음 · ${BR} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t920p-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  if (VIL) {
    const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync(ZDB); let rows = [];
    for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
    const v = rows.find((r) => r.name === VIL); if (v) await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [v.cx * 32 + 16, v.cy * 32 + 16]);
  }
  await sleep(15000);
  await page.evaluate(() => { window.__terrain19.freezeT = 12.25; });
  const { PNG } = require('pngjs');
  const arm = async (on, tag) => {
    const t0 = Date.now();
    await page.evaluate((o) => { uiCfg.natBudget = o; _natChunk.clear(); window.__t920f = 0; const f = () => { window.__t920f++; if (window.__t920run) requestAnimationFrame(f); }; window.__t920run = true; requestAnimationFrame(f); }, on);
    let last = -1, same = 0, frames = null, ms = null;
    for (let i = 0; i < 600; i++) {
      await sleep(500);
      const d = await page.evaluate(() => ({ p: (window.__natDbg && window.__natDbg.pending) || 0, n: _natChunk.size, f: window.__t920f }));
      if (d.p === 0 && frames == null && d.n > 0) { frames = d.f; ms = Date.now() - t0; }
      if (d.p === 0 && d.n === last) same++; else same = 0;
      last = d.n; if (same >= 6) break;
    }
    await page.evaluate(() => { window.__t920run = false; });
    const H = await page.evaluate(() => {
      const out = []; _natCollect(out, _natLastC[0], _natLastC[1]); out.sort((a, b) => a.z - b.z);
      let h = 0x811c9dc5; const add = (x) => { const t = String(x); for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
      for (const it of out) { const s = it.s; add(it.z); add(s.x); add(s.y); add(s.nm); add(s.sc); add(s.vy); add(s.ph); }
      let hc = 0x811c9dc5; const addc = (x) => { const t = String(x); for (let i = 0; i < t.length; i++) { hc ^= t.charCodeAt(i); hc = Math.imul(hc, 16777619) >>> 0; } };
      for (const k of [..._natChunk.keys()].sort()) { const v = _natChunk.get(k); addc(k); for (const q of v.fr.concat(v.pr)) { addc(q.x); addc(q.y); addc(q.nm); addc(q.sc); addc(q.ph); } }   // 청크 속(물가 술 포함 — 꺼져 있어 안 그려도 지은 것은 같아야 한다)
      return { n: out.length, h: h.toString(16), hc: hc.toString(16), chunks: _natChunk.size, dbg: Object.assign({}, window.__natDbg, { treeDraw: undefined }) };
    });
    await sleep(800);
    const f = path.join(OUT, `${BR}${VIL ? '-' + VIL : ''}-${tag}.png`); await page.screenshot({ path: f });
    const r = { tag, on, items: H.n, hash: H.h, chunkHash: H.hc, chunks: H.chunks, fringe: H.dbg.fringe, props: H.dbg.props, allBuiltFrames: frames, allBuiltMs: ms, shot: f };
    console.log(`  · ${tag}: ${JSON.stringify(r)}`); return r;
  };
  const A = await arm(false, 'off-a'), B = await arm(true, 'on'), C = await arm(false, 'off-b');
  const rd = (f) => PNG.sync.read(fs.readFileSync(f));
  const diff = (p, q) => { const a = rd(p), b = rd(q); let s = 0, big = 0; const n = Math.min(a.data.length, b.data.length);
    for (let i = 0; i < n; i += 4) { const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; s += d; if (d > 24) big++; }
    return { meanAbs: +(s / (n / 4)).toFixed(2), bigPct: +(100 * big / (n / 4)).toFixed(2) }; };
  const res = { browser: BR, village: VIL || '(스폰)', arms: [A, B, C], sameList: A.hash === B.hash && B.hash === C.hash, sameChunks: A.chunkHash === B.chunkHash && B.chunkHash === C.chunkHash, pix: { offA_offB: diff(A.shot, C.shot), offA_on: diff(A.shot, B.shot) } };
  console.log(`  · 목록 해시 같음 ${res.sameList} · 청크 속 해시 같음 ${res.sameChunks} · 화소 ${JSON.stringify(res.pix)}`);
  fs.writeFileSync(path.join(OUT, `${BR}${VIL ? '-' + VIL : ''}-res.json`), JSON.stringify(res, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
