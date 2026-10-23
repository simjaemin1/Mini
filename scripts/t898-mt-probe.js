#!/usr/bin/env node
// === scripts/t898-mt-probe.js — 산 띠 굽기 옮기기 readPixels(T898 · `T898_MT_READPX`) 계측 자 · 러너 밖 ==========================
//
//   실클라 하나(Chromium · 이 상자 = SwiftShader 소프트웨어 GL)로 산 마을에 차례로 선다.
//   ① 워프 창 — 서버 env 그대로(welcome 칸)로 마을에 워프한 뒤 30초: 구운 청크 수 · 청크당 굽기 ms · 한 판 안 굽기 최대 · 옮기기 ms.
//   ② 같은 자리 ABAB — 페이지에서 `uiCfg.mtReadPx` 를 바꾸고 산 청크 캐시를 비운 뒤(이미 있는 손잡이 `__mt3gl(1)` = 비우기만) 30초씩
//      끔 · 켬 · 끔 · 켬. 같은 자리 · 같은 세계 · 같은 청크라 켬/끔을 바로 견준다.
//   ③ 그림 — 갈래마다 다 구운 뒤(굽는 중 0 · 구운 수 5초 그대로) `_mt3Chunk` 의 세그먼트마다 화소 해시 + 배치 값.
//      공통 청크에서 끔↔끔(재현 바닥) · 끔↔켬 다른 청크 수를 낸다(T870 §2 꼴 · 기대 0).
//   굽기 계량은 이미 있는 `_mt3BakeMs` · `_mt3BakeN`(청크 단위 · 판을 넘은 몫 포함)과 이 카드의 `_mt898`(옮기기) 를 페이지 전역 이름으로 읽는다.
// 실행: node scripts/t898-mt-probe.js [--env 0|1] [--out /tmp/t898] [--spots 광산1,광산4] [--win 30000]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ENV = arg('--env', '0'), OUT = arg('--out', '/tmp/t898'), SPOTS = arg('--spots', '광산1,광산4').split(','), WIN = +arg('--win', '30000');
fs.mkdirSync(OUT, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t898-c-${process.pid}.db`, ZDB = `/tmp/t898-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', shutdown);

(async () => {
  console.log(`\n=== T898 산 띠 옮기기 readPixels 계측 — 서버 env T898_MT_READPX=${ENV} ===`);
  const c = boot('central', 'central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone', 'zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T898_MT_READPX: ENV });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  await sleep(3000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 40; i++) { if (await page.evaluate(() => { const s = document.getElementById('startZone'); return s ? s.options.length : 0; })) break; await sleep(500); }
  const enter = await page.$('#enter'); if (enter) await enter.click();
  const inw = await FixClock.waitInWorld(page, { timeoutMs: 180000 });
  if (!inw.ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(2000);
  const welcome = await page.evaluate(() => !!(uiCfg && uiCfg.mtReadPx));
  console.log(`  · welcome uiCfg.mtReadPx = ${welcome}(서버 env ${ENV})`);
  // 판마다 굽기 증분 — rAF 사이 `_mt3BakeMs` 증분 = 그 판 안 굽기 ms
  await page.evaluate(() => {
    window.__t898 = { f: [] };
    let lb = _mt3BakeMs, lt = performance.now();
    const tick = (t) => { const b = _mt3BakeMs; window.__t898.f.push([t - lt, b - lb]); lb = b; lt = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const snap = () => page.evaluate(() => ({ ms: _mt3BakeMs, n: _mt3BakeN, jobs: _mt3Jobs.size, chunks: _mt3Chunk.size, x: Object.assign({}, _mt898),
    gl: _mgl.ok, cv: _mgl.cv ? [_mgl.cv.width, _mgl.cv.height] : null }));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  // 다 구웠다 = 굽는 중 0 · 구운 수가 5초 그대로 · 그 사이 판이 돌았다(최대 capMs)
  const settle = async (capMs) => {
    const t0 = Date.now(); let last = await snap(), same = 0;
    while (Date.now() - t0 < capMs) {
      await sleep(1000); const s = await snap();
      if (s.jobs === 0 && s.n === last.n) same++; else same = 0;
      last = s; if (same >= 5) return { ok: true, sec: Math.round((Date.now() - t0) / 1000) };
    }
    return { ok: false, sec: Math.round((Date.now() - t0) / 1000) };
  };
  const stat = (a) => { if (!a.length) return { n: 0 }; const s = a.slice().sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: a.length, mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p50: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
  // 30초 창 — 시작 전 표시 · 창 끝 표시의 차
  const windowRun = async (start) => {
    const a = await snap(); await page.evaluate(() => { window.__t898.f = []; });
    await start();
    await sleep(WIN);
    const b = await snap(); const F = await page.evaluate(() => window.__t898.f.slice());
    const bakeFrames = F.map((x) => x[1]).filter((x) => x > 0);
    return { chunks: b.n - a.n, bakeMs: +(b.ms - a.ms).toFixed(0), perChunk: b.n > a.n ? +((b.ms - a.ms) / (b.n - a.n)).toFixed(1) : null,
      frameBakeMax: bakeFrames.length ? +Math.max(...bakeFrames).toFixed(0) : 0, frames: F.length, frameMs: stat(F.map((x) => x[0])),
      moveOn: { ms: +(b.x.ms - a.x.ms).toFixed(0), n: b.x.n - a.x.n, px: b.x.px - a.x.px }, moveOff: { ms: +(b.x.msOff - a.x.msOff).toFixed(0), n: b.x.nOff - a.x.nOff },
      jobsEnd: b.jobs, cv: b.cv };
  };
  // 그림 — 세그먼트마다 화소 해시(FNV-1a) + 배치 값
  const hashAll = () => page.evaluate(() => {
    const out = {};
    for (const [key, segs] of _mt3Chunk) {
      const parts = [];
      for (const s of segs || []) {
        const cv = s.img; let h = 0x811c9dc5, semi = 0;
        if (cv && cv.width && cv.height) {
          const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
          for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; }
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0 && d[i] < 255) semi++;
        }
        parts.push([h.toString(16), cv ? cv.width : 0, cv ? cv.height : 0, s.x, s.y, s.ox, s.oy, s.merged, s.pb ? s.pb.join(',') : '', s.dLo, s.dHi, s.sLo, s.sHi, s.hHi, s.hLo,
          s.colT ? Array.prototype.join.call(s.colT, ',').length : 0, s.rec ? s.rec.bands.length : 0, semi].join('|'));
      }
      out[key] = { n: (segs || []).length, merged: (segs || []).some((s) => s.merged), sig: parts.join(';') };
    }
    return out;
  });
  const cmp = (A, B) => {
    const ks = Object.keys(A).filter((k) => k in B);
    const diff = ks.filter((k) => A[k].sig !== B[k].sig);
    return { common: ks.length, empty: ks.filter((k) => !A[k].n).length, merged: ks.filter((k) => A[k].merged).length,
      segs: ks.reduce((s, k) => s + A[k].n, 0), diff: diff.length, diffKeys: diff.slice(0, 8),
      onlyA: Object.keys(A).filter((k) => !(k in B)).length, onlyB: Object.keys(B).filter((k) => !(k in A)).length };
  };
  const res = { env: ENV, welcome, spots: [] };
  for (const name of SPOTS) {
    const v = rows.find((r) => r.name === name); if (!v) { console.log(`  · ${name} 없음`); continue; }
    const S = { name, v: [v.cx, v.cy] };
    // ① 워프 창(서버 env 그대로)
    S.warp = await windowRun(() => page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [v.cx * 32 + 16, v.cy * 32 + 16]));
    S.warpSettle = await settle(300000);
    console.log(`  · ${name} 워프 창(welcome ${welcome}): ${JSON.stringify(S.warp)} · 다 굽기 +${S.warpSettle.sec}초`);
    // ② · ③ 같은 자리 ABAB
    S.arms = []; const H = [];
    for (const on of [false, true, false, true]) {
      const W = await windowRun(() => page.evaluate((o) => { uiCfg.mtReadPx = o; window.__mt3gl(1); needsRedraw = true; }, on));
      const st = await settle(300000);
      const h = await hashAll(); H.push(h);
      S.arms.push({ on, win: W, settle: st, chunks: Object.keys(h).length });
      console.log(`  · ${name} ${on ? '켬' : '끔'}: 청크 ${W.chunks} · 청크당 ${W.perChunk}ms · 한 판 굽기 최대 ${W.frameBakeMax}ms · 옮기기 켬 ${W.moveOn.ms}ms/${W.moveOn.n} · 끔 ${W.moveOff.ms}ms/${W.moveOff.n} · 다 굽기 +${st.sec}초(${st.ok})`);
    }
    S.pix = { offA_offB: cmp(H[0], H[2]), offA_onA: cmp(H[0], H[1]), offB_onB: cmp(H[2], H[3]), onA_onB: cmp(H[1], H[3]) };
    console.log(`  · ${name} 그림: ${JSON.stringify(S.pix)}`);
    res.spots.push(S);
    fs.writeFileSync(path.join(OUT, `t898-res-env${ENV}.json`), JSON.stringify(res, null, 1));
  }
  await page.screenshot({ path: path.join(OUT, `t898-last-env${ENV}.png`) });
  fs.writeFileSync(path.join(OUT, `t898-res-env${ENV}.json`), JSON.stringify(res, null, 1));
  console.log('끝');
  await browser.close(); shutdown(); process.exit(0);
})().catch((e) => { console.log('계측 실패:', e && e.stack); shutdown(); process.exit(1); });
