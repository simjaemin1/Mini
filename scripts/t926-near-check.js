#!/usr/bin/env node
// === scripts/t926-near-check.js — `T926_CELL_NEAR` 켬 · 끔 같은 값 · 같은 그림(T926 ②) — 계측 자 · 러너 밖 ======================================
//
//   실클라 하나(`E2E_BROWSER` — 기본 chromium · `webkit`) · 존 기본 env(손잡이 칸 없음)로 띄워 자리 셋(어촌1 물가 · 산 하네스 자리 · 광산2 가운데)마다:
//     갈래마다 두 칸 캐시를 비우고(지형 갱신 때의 그 `clear()`) 손잡이를 세운 뒤 자리에 서서 둘레 칸을 채운다
//     ① 끔 — 그 자리에서 칸 값 표(자리 둘레 120×120 칸의 `isWaterAtAbs` · `isRockAtAbs`)와 본 캔버스 화소를 뜬다
//     ② 켬(페이지에서 `uiCfg.cellNear = true`) — 먼 곳 셋을 돌고 와서(그 사이 자리 둘레 칸이 지워진다 — 돌아오기 앞 캐시에 남은 자리 칸 수를 센다)
//        같은 자리에서 칸 값 표 · 화소를 다시 뜬다
//     ③ 끔 — 같은 걸음(채우기 → 먼 곳 셋 → 자리)을 한 번 더 — 바닥(같은 손잡이 두 장의 차)
//   견줌 = 칸 값 표가 같은가(다른 칸 수) · 화면 |Δ|(① ↔ ② · ① ↔ ③) · 켬에서 두 캐시 크기.
//   결정론 고정 — 물 · 바람 시각(`__terrain19.freezeT` · `windOff`) · 비 0 · 해 몫 한낮(1초마다) · 같은 자리 · 같은 걸음.
// 실행: [E2E_BROWSER=webkit] node scripts/t926-near-check.js [--out /tmp/t926/near]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t926/near'); fs.mkdirSync(OUT, { recursive: true });
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const CDB = `/tmp/t926n-c-${process.pid}.db`, ZDB = `/tmp/t926n-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });
const { PNG } = require('pngjs');
const readPng = (f) => PNG.sync.read(fs.readFileSync(f));
function pdiff(fa, fb) {
  const a = readPng(fa), b = readPng(fb);
  if (a.width !== b.width || a.height !== b.height) return { err: '크기 다름' };
  let sum = 0, big = 0, n = 0;
  for (let i = 0; i < a.data.length; i += 4) { const d = (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3; sum += d; if (d > 24) big++; n++; }
  return { meanAbs: +(sum / n).toFixed(3), bigPct: +(100 * big / n).toFixed(3) };
}

(async () => {
  console.log(`\n=== T926 칸 캐시 손잡이 켬 · 끔 같은 값 · 같은 그림 — 브라우저 ${BR} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(3000);
  const welcome = await page.evaluate(() => ('cellNear' in uiCfg ? uiCfg.cellNear : '(칸 없음)'));
  console.log(`  · welcome cellNear = ${welcome}(존 env ${process.env.T926_CELL_NEAR == null ? '없음' : process.env.T926_CELL_NEAR})`);
  const cellBox = await page.evaluate(() => ('cellBox' in uiCfg ? uiCfg.cellBox : '(칸 없음)'));   // ★[T947] 상자 거름 손잡이 — 켜고 돌리면 아래 견줌이 그 위에서 선다(칸 값 표 해시를 끔 판과 견준다)
  console.log(`  · welcome cellBox = ${cellBox}(존 env ${process.env.T947_CELL_BOX == null ? '없음' : process.env.T947_CELL_BOX})`);
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; if (window.__rainForce) window.__rainForce({ precip: 0 });
    setInterval(() => { try { const dr = worldClock.dayPhaseRatio, L = worldClock.dayLengthMs; const p = (((0.5 * dr) - _lonView) % 1 + 1) % 1; worldClock.epoch = worldNow() - p * L; } catch (e) {} }, 1000);
    return true;
  });
  const { DatabaseSync } = require('node:sqlite');
  let rows = [];
  for (let i = 0; i < 180 && !rows.length; i++) { try { const db = new DatabaseSync(ZDB); rows = db.prepare('SELECT id, name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); db.close(); } catch (e) {} if (!rows.length) await sleep(1000); }
  const V = (n) => rows.find((r) => r.name === n);
  const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
  const tpTo = async (cx, cy) => {   // 서버가 막힌 칸이면 거절한다 — 둘레를 가까운 칸부터(t912-shots 와 같은 식)
    const ring = [[0, 0]]; for (let r = 1; r <= 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
    for (const [dx, dy] of ring) {
      const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16; await tp(x, y);
      for (let i = 0; i < 8; i++) { await sleep(700); const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
        return a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9; }, [x, y]); if (d <= 64) return [cx + dx, cy + dy]; }
    }
    return null;
  };
  // 칸 값 표 — 자리 둘레 120×120 칸(서버 권위 위치 칸 중심 · 물 · 바위 두 비트)
  const cellTable = () => page.evaluate(() => { const a = window.__getSrvAbs(); const c0x = Math.floor(a.x / 32), c0y = Math.floor(a.y / 32); let s = '';
    for (let dy = -60; dy < 60; dy++) for (let dx = -60; dx < 60; dx++) { const x = (c0x + dx) * 32 + 16, y = (c0y + dy) * 32 + 16; s += (isWaterAtAbs(x, y) ? 1 : 0) + (isRockAtAbs(x, y) ? 2 : 0); }
    return s; });
  const grab = async (f) => { const u = await page.evaluate(() => document.getElementById('canvas').toDataURL('image/png')); fs.writeFileSync(f, Buffer.from(String(u).split(',')[1], 'base64')); return f; };
  const sizes = () => page.evaluate(() => ({ water: _waterCellCache.size, rock: _rockCellCache.size, bk: (typeof _cellBk !== 'undefined') ? _cellBk.size : null }));
  const settle = async () => { await sleep(3000); let last = -1, same = 0; for (let i = 0; i < 120 && same < 5; i++) { await sleep(1000); const n = await page.evaluate(() => (window.__mtDbg ? window.__mtDbg.mt3bakeN : 0) + ':' + (typeof _mt3Jobs !== 'undefined' ? _mt3Jobs.size : 0) + ':' + (window.__groundDbg ? window.__groundDbg.baked : 0));
    if (n === last && /:0:0$/.test(n)) same++; else same = 0; last = n; } await sleep(1500); };
  const SPOTS = [['광산2', V('광산2')], ['어촌1', V('어촌1')], ['산1', { cx: 1750, cy: 74 }]].filter(([, v]) => v);
  const FAR = ['광산7', '어촌2', '광산5'].map(V).filter(Boolean);
  const res = { browser: BR, welcome, cellBox, spots: [] };
  const hsT = (t) => { let h = 0x811c9dc5; for (let q = 0; q < t.length; q++) h = Math.imul(h ^ t.charCodeAt(q), 16777619) >>> 0; return h.toString(16); };   // ★[T947] 칸 값 표 해시(판끼리 · 손잡이끼리 견줌)
  for (const [nm, v] of SPOTS) {
    const S = { nm, runs: [] };
    for (const [tag, on] of [['off', false], ['on', true], ['off2', false]]) {
      // 갈래마다 두 캐시를 비우고(이미 있는 무효화 문법 — 지형 갱신 때 하는 그 `clear()`) 손잡이를 세운 뒤 자리에 서서 둘레 칸을 채운다
      await page.evaluate((o) => { uiCfg.cellNear = o; _waterCellCache.clear(); _rockCellCache.clear(); if (typeof _cellBk !== 'undefined') _cellBk.clear(); return true; }, on);
      await tpTo(v.cx, v.cy); await sleep(4000); await cellTable();
      if (tag !== 'off') for (const f of FAR) { await tpTo(f.cx, f.cy); await sleep(6000); }   // 먼 곳 셋을 돌고 온다(켬이면 그 사이 자리 둘레 칸이 지워진다)
      const before = await sizes();
      before.spotCached = await page.evaluate(([cx, cy]) => { const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {}; let n = 0;
        for (let dy = -60; dy < 60; dy++) for (let dx = -60; dx < 60; dx++) { const key = z2.id + '_' + (cx + dx) + '_' + (cy + dy); if (_waterCellCache.has(key)) n++; } return n; }, [v.cx, v.cy]);   // 자리 둘레 칸 가운데 돌아오기 앞에 캐시에 남은 수
      const at = await tpTo(v.cx, v.cy); await settle();
      const tb = await cellTable();
      const f = await grab(path.join(OUT, `${BR}-${nm}-${tag}.png`));
      const after = await sizes();
      S.runs.push({ tag, on, at, sizesBeforeReturn: before, sizesAtShot: after, table: tb, tableHash: hsT(tb), shot: f });
      console.log(`  · ${nm} ${tag}: 자리 ${JSON.stringify(at)} · 돌아오기 앞 캐시 물 ${before.water} 바위 ${before.rock} 자리칸 ${before.bk} · 자리 둘레 120×120 칸 중 캐시에 남은 물 칸 ${before.spotCached} · 찍을 때 물 ${after.water} 바위 ${after.rock} 자리칸 ${after.bk}`);
    }
    const [r0, r1, r2] = S.runs;
    const dcell = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++; return n; };
    S.cmp = { cellsOffOn: dcell(r0.table, r1.table), cellsOffOff2: dcell(r0.table, r2.table), cells: r0.table.length,
      water: [...r0.table].filter((ch) => ch === '1' || ch === '3').length, rock: [...r0.table].filter((ch) => ch === '2' || ch === '3').length,
      scrOffOn: pdiff(r0.shot, r1.shot), scrOffOff2: pdiff(r0.shot, r2.shot) };
    for (const r of S.runs) delete r.table;
    res.spots.push(S);
    console.log(`  · ${nm} 견줌: ${JSON.stringify(S.cmp)} · 칸 값 표 해시 ${S.runs.map((r) => r.tableHash).join(' / ')}`);
  }
  res.errs = errs;
  fs.writeFileSync(path.join(OUT, `${BR}-near.json`), JSON.stringify(res, null, 1));
  console.log(`  · 오류 ${errs.length} · → ${path.join(OUT, `${BR}-near.json`)}`);
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
