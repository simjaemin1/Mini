#!/usr/bin/env node
// === scripts/t912-shots.js — 같은 자리 켬 · 끔 스크린샷(T912 · `T891_WATER_HALF` · `T898_MT_READPX` 켬 기본) — 계측 자 · 러너 밖 ==========
//
//   `E2E_BROWSER`(scripts/e2e-browser.js — 기본 chromium · `webkit`)로 실클라 하나를 띄워 네 자리(물가 마을 둘 = 어촌1 · 어촌2 물가 · 산 둘 = 산 하네스 자리)에 차례로 서서
//   두 손잡이 칸(`uiCfg.waterHalf` · `uiCfg.mtReadPx`)을 **같이** 끔 → 켬 → 끔(둘째)으로 바꾸며 한 장씩 찍는다.
//     · 바꿀 때마다 산 청크 캐시를 비우고(이미 있는 손잡이 `__mt3gl(1)` = 비우기만) 다 구울 때까지(굽는 중 0 · 구운 수 5초 그대로) 기다린다.
//     · 결정론 — 물 · 바람 시각 고정(`__terrain19.freezeT` · `windOff`) · 비 0(`__rainForce`) · 찍기 직전 해 몫을 한낮에 세운다
//       (e2e-char3d `setDayU` 와 같은 식 — 클라 시계의 기준점만 옮긴다).
//   남기는 것: `<브라우저>-<자리>-<off|on|off2>.png`(본 캔버스 화소 그대로 — HUD 없음) · 자리마다 물 상자(`_wfCache.rect`) · 물 GL 캔버스 크기 · 산 청크마다 세그먼트 화소 해시 ·
//     산 옮기기 계량(`_mt898`) · 화면 차(끔↔켬 · 끔↔끔둘째 = 바닥 · 전체 · 물 칸 가리개 안) → `<브라우저>-res.json`. 나란히 한 장은 `scripts/t912-sheet.py`.
//   존은 기본 env 로 띄운다(★T912 켬 기본 — welcome 두 칸 true). 페이지에서 칸을 바꿔 재므로 서버 env 와 무관하다.
// 실행: [E2E_BROWSER=webkit] node scripts/t912-shots.js [--out /tmp/t912/shots] [--spots 어촌1,어촌2,산1@1750:74,산2@2150:1959]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t912/shots'); fs.mkdirSync(OUT, { recursive: true });
// 자리 = 마을 이름(마을 가운데에서 시작) 또는 `이름@cx:cy`(존 칸 좌표 — 산 둘은 산 하네스의 자리 그대로:
//   `e2e-mountain` SITE(1750,74 · 한울대간 · 산까지 1셀) · `e2e-mtcut`/`e2e-mtocc` SITE(2150,1959))
const SPOTS = arg('--spots', '어촌1,어촌2,산1@1750:74,산2@2150:1959').split(',');
const WATER = (nm) => /^어촌/.test(nm);   // 물가 자리 = 어촌(물가에 선다) · 그 밖 = 마을 가운데
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t912s-c-${process.pid}.db`, ZDB = `/tmp/t912s-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const { PNG } = require('pngjs');
const readPng = (f) => PNG.sync.read(fs.readFileSync(f));
// 화면 차 — 상자 안(없으면 화면 전체) · 가리개(물 칸 사각형 [x, y, 변])가 있으면 그 안만 — 화소마다 RGB 절대차 평균 · 24 넘는 화소 몫
function pdiff(fa, fb, box, wm) {
  const a = readPng(fa), b = readPng(fb);
  if (a.width !== b.width || a.height !== b.height) return { err: `크기 다름 ${a.width}x${a.height} · ${b.width}x${b.height}` };
  const [x0, y0, w, h] = box || [0, 0, a.width, a.height];
  let M = null;
  if (wm && wm.quads) { M = new Uint8Array(a.width * a.height);
    for (const q of wm.quads) {   // 볼록 사각형 — 네 변 모두 같은 쪽에 있는 화소
      const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
      for (let y = Math.max(0, Math.min(...ys)); y <= Math.min(a.height - 1, Math.max(...ys)); y++) for (let x = Math.max(0, Math.min(...xs)); x <= Math.min(a.width - 1, Math.max(...xs)); x++) {
        let pos = 0, neg = 0; for (let k = 0; k < 4; k++) { const p = q[k], r2 = q[(k + 1) % 4]; const c = (r2[0] - p[0]) * (y + 0.5 - p[1]) - (r2[1] - p[1]) * (x + 0.5 - p[0]); if (c > 0) pos++; else if (c < 0) neg++; }
        if (!pos || !neg) M[y * a.width + x] = 1; } } }
  let sum = 0, big = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x0 + w); x++) {
    if (M && !M[y * a.width + x]) continue;
    const i = (y * a.width + x) * 4; const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3;
    sum += d; if (d > 24) big++; n++;
  }
  return { meanAbs: +(sum / Math.max(1, n)).toFixed(2), bigPct: +(100 * big / Math.max(1, n)).toFixed(2), px: n, pxPct: +(100 * n / (a.width * a.height)).toFixed(1) };
}

(async () => {
  console.log(`\n=== T912 같은 자리 켬 · 끔 스크린샷 — 브라우저 ${BR} · 자리 ${SPOTS.join(' · ')} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`console.${m.type()}: ` + m.text().slice(0, 200)); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(3000);
  const welcome = await page.evaluate(() => ({ waterHalf: 'waterHalf' in uiCfg ? uiCfg.waterHalf : '(칸 없음)', mtReadPx: 'mtReadPx' in uiCfg ? uiCfg.mtReadPx : '(칸 없음)',
    mtBand: 'mtBand' in uiCfg ? uiCfg.mtBand : '(칸 없음)', ua: navigator.userAgent }));
  console.log(`  · welcome ${JSON.stringify(welcome)}`);
  // 결정론 고정 — 물 · 바람 시각 · 바람 · 비
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; if (window.__rainForce) window.__rainForce({ precip: 0 }); return true; });
  // 해 몫을 낮 안의 자리 u 에 세운다(e2e-char3d `setDayU` 와 같은 식 · 0.5 = 한낮)
  const setDayU = (u) => page.evaluate((uu) => { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs;
    const p = (((uu * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; return +(worldPhase() / dr).toFixed(4); }, u);
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB);
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); if (!rows.length) await sleep(1000); }
  db.close();
  const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
  const snap = () => page.evaluate(() => ({ n: _mt3BakeN, ms: _mt3BakeMs, jobs: _mt3Jobs.size, ok: _mgl.ok, cv: _mgl.cv ? [_mgl.cv.width, _mgl.cv.height] : null,
    x: (typeof _mt898 !== 'undefined') ? Object.assign({}, _mt898) : null }));
  // 다 구움 = 굽는 중 0 · 구운 수가 5초(1초 × 5) 그대로 — 바꾼 뒤 3초는 먼저 잔다(첫 판이 굽기를 시작할 틈)
  const settle = async () => { const t0 = Date.now(); await sleep(3000); let last = await snap(), same = 0;
    while (Date.now() - t0 < 600000) { await sleep(1000); const s = await snap(); if (s.jobs === 0 && s.n === last.n) same++; else same = 0; last = s; if (same >= 5) return Date.now() - t0; } return -1; };
  // 산 청크마다 세그먼트 캔버스 화소 해시(FNV · 7 바이트 걸러) — 청크 열쇠 → 해시
  const hashChunks = () => page.evaluate(() => { const o = {}; let segs = 0;
    for (const [k, sg] of _mt3Chunk) { let h = 0x811c9dc5; for (const s of sg || []) { segs++; const cv = s.img; if (!cv || !cv.width) { h ^= 0x55; h = Math.imul(h, 16777619) >>> 0; continue; }
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 0; i < d.length; i += 7) { h ^= d[i]; h = Math.imul(h, 16777619) >>> 0; } }
      o[k] = (sg ? sg.length : -1) + ':' + h.toString(16); }
    return { segs, chunks: o }; });
  const res = { browser: BR, welcome, spots: [] };
  for (let nm of SPOTS) {
    const at0 = nm.includes('@') ? nm.split('@')[1].split(':').map(Number) : null;
    const v = at0 ? { cx: at0[0], cy: at0[1] } : rows.find((r) => r.name === nm);
    nm = nm.split('@')[0];
    if (!v) { console.log(`  · ${nm}: 마을 없음`); res.spots.push({ nm, miss: true }); continue; }
    // 텔레포트 — 서버는 막힌 칸(바위 · 도랑 · 다리 없는 물 — `isTerrainBlockedLocal`)이면 거절한다(`teleport_debug`). 자리에 닿았는지(서버 권위 위치가 64px 안) 보고,
    //   못 닿았으면 그 칸 둘레를 가까운 칸부터(반경 8칸 안) 차례로 다시 보낸다.
    const tpTo = async (cx, cy) => {
      const ring = [[0, 0]]; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      for (const [dx, dy] of ring) {
        const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16;
        await tp(x, y);
        for (let i = 0; i < 8; i++) { await sleep(700);
          const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
            return a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9; }, [x, y]);
          if (d <= 64) return [cx + dx, cy + dy]; }
      }
      return null;
    };
    const got = await tpTo(v.cx, v.cy); await sleep(8000);
    if (!got) { console.log(`  · ${nm}: 텔레포트 못 닿음`); res.spots.push({ nm, miss: true }); continue; }
    let shore = null;
    if (WATER(nm)) {
      // 물가 자리 — 마을 가운데에서 40칸 안의 **물에 붙은 뭍 칸** 가운데, 그 칸에 섰을 때 화면에 드는 칸(카메라 사상 `__w2s` 의 칸 하나 걸음으로 잰
      //   화면 안 칸들)의 물 몫이 ½ 에 가장 가까운 칸(같으면 마을에 가까운 칸) — 물가가 화면 가운데를 가로지르는 자리.
      shore = await page.evaluate(() => {
        const a = window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs(); const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
        const cv = document.getElementById('canvas'); const CW = cv ? cv.width : 1100, CH = cv ? cv.height : 720;
        const o = window.__w2s(a.x, a.y), ex = window.__w2s(a.x + 32, a.y), ey = window.__w2s(a.x, a.y + 32);
        const ux = [ex.px - o.px, ex.py - o.py], uy = [ey.px - o.px, ey.py - o.py];
        const D = [];   // 화면 안에 드는 칸 걸음(둘에 하나 · 가운데 기준)
        for (let dy = -60; dy <= 60; dy += 2) for (let dx = -60; dx <= 60; dx += 2) { const sx = CW / 2 + dx * ux[0] + dy * uy[0], sy = CH / 2 + dx * ux[1] + dy * uy[1]; if (sx >= 0 && sx < CW && sy >= 0 && sy < CH) D.push([dx, dy]); }
        const W = (tx, ty) => isWaterAtAbs(tx * 32 + 16, ty * 32 + 16);
        const c0 = [Math.floor(a.x / 32), Math.floor(a.y / 32)]; let best = null;
        for (let r = 1; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const tx = c0[0] + dx, ty = c0[1] + dy;
          if (W(tx, ty) || !(W(tx + 1, ty) || W(tx - 1, ty) || W(tx, ty + 1) || W(tx, ty - 1))) continue;
          let nw = 0; for (const [ddx, ddy] of D) if (W(tx + ddx, ty + ddy)) nw++;
          const f = nw / Math.max(1, D.length), sc = Math.abs(f - 0.5);
          if (!best || sc < best.sc) best = { tx, ty, f: +f.toFixed(3), sc, r };
        }
        return best ? [best.tx * 32 + 16 - (z2.worldOffsetX || 0), best.ty * 32 + 16 - (z2.worldOffsetY || 0), best.f, best.r, D.length] : null;
      });
      if (shore) await tpTo(Math.floor(shore[0] / 32), Math.floor(shore[1] / 32));
      await sleep(10000);
    }
    const at = await page.evaluate(() => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; return a ? { x: Math.round(a.x), y: Math.round(a.y) } : null; });
    const S = { nm, water: WATER(nm), cell: got, at, shore, shots: [] };
    for (const tag of ['off', 'on', 'off2']) {
      const on = tag === 'on';
      const a = await snap();
      await page.evaluate((o) => { uiCfg.waterHalf = o; uiCfg.mtReadPx = o; window.__mt3gl(1); needsRedraw = true; return true; }, on);
      const settleMs = await settle();
      const b = await snap(); const H = await hashChunks();
      const u = await setDayU(0.5); await sleep(1500);
      const st = await page.evaluate(() => ({ water: window.__waterDbg ? { on: window.__waterDbg.on, webgl: window.__waterDbg.webgl } : null,
        wcv: (typeof _wgl !== 'undefined' && _wgl.cv) ? [_wgl.cv.width, _wgl.cv.height] : null, rect: (typeof _wfCache !== 'undefined' && _wfCache.rect) ? _wfCache.rect.slice() : null,
        knob: { waterHalf: uiCfg.waterHalf, mtReadPx: uiCfg.mtReadPx }, pos: window.__getSrvAbs ? (({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }))(window.__getSrvAbs()) : null }));
      // 화면 안 물 칸 — 칸 가운데가 물(`isWaterAtAbs` · 클라 정본 판정)인 32px 칸의 캔버스 위 네 꼭짓점(`__w2s`) — 물만 견줄 가리개(캔버스 화소)
      const wm = await page.evaluate(() => { const a = window.__getSrvAbs ? window.__getSrvAbs() : window.__getMyAbs(); const cv = document.getElementById('canvas');
        const CW = cv ? cv.width : 1100, CH = cv ? cv.height : 720; const c0 = [Math.floor(a.x / 32), Math.floor(a.y / 32)]; const out = [];
        for (let dy = -60; dy <= 60; dy++) for (let dx = -60; dx <= 60; dx++) { const wx = (c0[0] + dx) * 32, wy = (c0[1] + dy) * 32;
          const q = [window.__w2s(wx, wy), window.__w2s(wx + 32, wy), window.__w2s(wx + 32, wy + 32), window.__w2s(wx, wy + 32)].map((p) => [Math.round(p.px), Math.round(p.py)]);
          if (q.every((p) => p[0] < 0) || q.every((p) => p[0] >= CW) || q.every((p) => p[1] < 0) || q.every((p) => p[1] >= CH)) continue;
          if (!isWaterAtAbs(wx + 16, wy + 16)) continue; out.push(q); }
        return { cw: CW, ch: CH, quads: out }; });
      // 캔버스 화소 그대로(HUD · DOM 겹침 없이) — 2D 본 캔버스가 물 GL · 산 GL 을 다 받아 그린 판
      const f = path.join(OUT, `${BR}-${nm}-${tag}.png`);
      const durl = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png'));
      fs.writeFileSync(f, Buffer.from(String(durl).split(',')[1], 'base64'));
      const r = { tag, on, settleMs, dayU: u, st, wm, gl: b.ok, mcv: b.cv, baked: b.n - a.n, perChunk: b.n > a.n ? +((b.ms - a.ms) / (b.n - a.n)).toFixed(0) : null,
        moveOn: b.x && a.x ? b.x.n - a.x.n : null, moveOff: b.x && a.x ? b.x.nOff - a.x.nOff : null, segs: H.segs, chunks: H.chunks, shot: f };
      S.shots.push(r);
      console.log(`  · ${nm} ${tag}: 다 구움 ${settleMs}ms · 구운 청크 ${r.baked} · 옮기기 켬 ${r.moveOn} · 끔 ${r.moveOff} · 물 ${JSON.stringify(st.water)} GL ${JSON.stringify(st.wcv)} · 상자 ${JSON.stringify(st.rect)} · 세그먼트 ${H.segs} · 자리 ${JSON.stringify(st.pos)} · 해 ${u}`);
    }
    // 견줌 — 산 청크 해시(끔 ↔ 켬 · 끔 ↔ 끔둘째) · 화면 차(전체 · 물 상자)
    const [s0, s1, s2] = S.shots;
    const chunkCmp = (A, B) => { const ka = Object.keys(A), kb = new Set(Object.keys(B)); let same = 0, diff = 0, only = 0; const dl = [];
      for (const k of ka) { if (!kb.has(k)) { only++; continue; } if (A[k] === B[k]) same++; else { diff++; if (dl.length < 5) dl.push(k); } }
      for (const k of kb) if (!(k in A)) only++; return { common: same + diff, same, diff, only, diffKeys: dl }; };
    S.cmp = { mtOffOn: chunkCmp(s0.chunks, s1.chunks), mtOffOff2: chunkCmp(s0.chunks, s2.chunks),
      scrOffOn: pdiff(s0.shot, s1.shot), scrOffOff2: pdiff(s0.shot, s2.shot) };
    // 물 — 끔 첫 장의 물 칸 가리개 안만(세 장 모두 같은 자리 · 같은 카메라 — 가리개 칸 수가 갈리면 그대로 적는다)
    if (s0.wm && s0.wm.quads.length) { S.cmp.waterOffOn = pdiff(s0.shot, s1.shot, null, s0.wm); S.cmp.waterOffOff2 = pdiff(s0.shot, s2.shot, null, s0.wm);
      S.cmp.waterTiles = S.shots.map((q) => (q.wm ? q.wm.quads.length : null)); }
    for (const sh of S.shots) { delete sh.chunks; if (sh.wm) sh.wm = { cw: sh.wm.cw, ch: sh.wm.ch, n: sh.wm.quads.length }; }   // 청크 해시 · 가리개는 견줌 값만 남긴다
    res.spots.push(S);
    console.log(`  · ${nm} 견줌: ${JSON.stringify(S.cmp)}`);
  }
  res.errs = errs;
  console.log(`  · 오류 ${errs.length}: ${JSON.stringify(errs.slice(0, 10))}`);
  fs.writeFileSync(path.join(OUT, `${BR}-res.json`), JSON.stringify(res, null, 1));
  console.log(`  → ${path.join(OUT, `${BR}-res.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
