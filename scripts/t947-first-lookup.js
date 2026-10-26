#!/usr/bin/env node
// === scripts/t947-first-lookup.js — 첫 접속 물 · 바위 칸 **첫 조회** 층 표(T947 ①) · 러너 밖 계측 자 ===========================
//
//   **첫 접속(빈 캐시)** 을 `--n` 판 잰다 — 판마다 새 컨텍스트 페이지의 로비에서 칸 조회 넷을 감싸고(계측 자만 · 제품 0)
//   "들어가기" → 첫 입력 가능(`_ld.at.input` · T920) 뒤 `--tail` 초까지 기다린다.
//     · `isWaterAtAbs` · `isRockAtAbs` — 부른 수 · 첫 조회 수(그 부름에 칸 캐시 크기가 바뀌었다 = 캐시에 없던 칸) · 감싼 시간
//     · `Terrain.isWaterCellLocal` · `Terrain.isRockCellLocal` — 지형을 실제로 묻는 수 · 배타 시간(바위 안 물 묻기는 바위 몫으로 따로)
//     · 때 갈래: 입장 앞(로비 · welcome 처리 전) · **첫 그림**(welcome 처리 끝 → 첫 render 끝) · 첫 그림 → 첫 입력 · 그 뒤 `--tail` 초
//     · `--stack` 이면 첫 조회마다 부른 자리(스택에서 이 자 밖 첫 `client/*.js` 줄 — 함수 이름 · 파일:줄)를 센다
//       (스택 뜨는 값은 지형 시간 밖에서 뜬다 — 그래도 판 시간은 늘어나므로 ms 는 `--stack` 없는 판으로 본다)
//   첫 그림 안 층 몫은 T920 `_ld.fc`(지면 · 물 · 산 · 자연물 · 몸 …)를 그대로 옮긴다.
//   `--pix` 면 가라앉은 뒤 그림 같음 재료를 뜬다(T937 꼴): 서 있는 칸 둘레 120×120 칸 물 · 바위 값 표 해시 · 구운 지면 타일(바탕 · 잎 층) 화소 해시 ·
//   자연물 청크 속(술 · 소품 목록) 해시 · 산 청크 세그먼트 화소 해시 — 판끼리 견준다(손잡이 켬 · 끔 · 두 브라우저).
//   `--spots` 면 그 뒤 자리 셋(산1 · 어촌1 · 광산2 — t926-near-check 의 자리)에 순간이동해 굽기가 가라앉은 뒤 같은 재료를 자리마다 또 뜬다.
//   손잡이 env 는 이 자를 부른 env 를 central · 존이 물려받는다.
// 실행: [E2E_BROWSER=webkit] [손잡이 env] node scripts/t947-first-lookup.js [--n 3] [--tail 3] [--stack] [--pix [--spots]] [--out /tmp/t947] [--tag 이름]
//       견줌: node scripts/t947-first-lookup.js --cmp 가.json 나.json [--cmp-out 견줌.json]   (`--pix` 판 재료끼리 · 아래 견줌 머리말)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t947'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3'), TAIL = +arg('--tail', '3');
const STACK = process.argv.includes('--stack'), PIX = process.argv.includes('--pix');
const SPOTS = process.argv.includes('--spots');   // `--pix` 뒤 자리 셋(산1 · 어촌1 · 광산2 — t926-near-check 와 같은 자리)에 서서 같은 재료를 한 번 더 뜬다
const BR = require('./e2e-browser').which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t947-z-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } };
process.on('exit', killAll);
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { killAll(); process.exit(143); });

// ── 페이지 갈고리(로비에서 건다) ─────────────────────────────────────────────────────────────
const HOOK = (stack) => {
  if (window.__t947) return true;
  const M = window.__t947 = { stack, ph: {}, callers: {}, depth: 0 };
  const phase = () => { const a = (typeof _ld !== 'undefined' && _ld) ? _ld.at : {}; return a.welcomeDone == null ? 'pre' : a.frame1 == null ? 'first' : a.input == null ? 'f1in' : 'after'; };
  const P = (p) => M.ph[p] || (M.ph[p] = { wN: 0, wMiss: 0, wMs: 0, rN: 0, rMiss: 0, rMs: 0, tW: 0, tWms: 0, tR: 0, tRms: 0 });
  const site = () => {   // 이 자 밖 첫 client 줄 — "함수 @파일:줄"
    const L = String(new Error().stack || '').split('\n');
    for (const l of L) {
      const m = l.match(/(?:at\s+(?:new\s+)?([\w$.<>]+)\s+\()?(?:([\w$.<>]*)@)?[^\s(]*\/(client\/[\w.-]+\.js|terrain\.js)(?:\?[^:]*)?:(\d+):\d+/);
      if (m) return `${m[1] || m[2] || '(익명)'} @${m[3]}:${m[4]}`;
    }
    return '?';
  };
  const wrapAbs = (name, k) => {
    const f = window[name]; if (typeof f !== 'function' || f.__t947) return;
    const cache = k === 'w' ? () => _waterCellCache : () => _rockCellCache;
    const w = function () {
      const p = phase(), o = P(p), c = cache(), s0 = c.size;
      let where = null;   // 스택은 첫 조회로 판가름 난 뒤에만 뜬다(아래 · 지형 시간 밖)
      M.depth++;
      const t0 = performance.now();
      let r; try { r = f.apply(this, arguments); } finally { M.depth--; }
      const el = performance.now() - t0;
      const miss = c.size !== s0;
      o[k + 'N']++; o[k + 'Ms'] += el; if (miss) o[k + 'Miss']++;
      if (miss && M.stack && M.depth === 0) { where = site(); const key = p + '|' + k + '|' + where; const a = M.callers[key] || (M.callers[key] = { n: 0, ms: 0 }); a.n++; a.ms += el; }
      return r;
    };
    w.__t947 = true; window[name] = w;
  };
  const wrapTerr = () => {
    const T = window.Terrain; if (!T || T.__t947) return !!(T && T.__t947);
    const oW = T.isWaterCellLocal, oR = T.isRockCellLocal;
    //   바위 셈 안의 물 셈(`isRockCellLocal` 이 모듈 안에서 부르는 `isWaterCellLocal`)은 이 갈고리를 안 거친다 — 바위 시간에 든다
    T.isWaterCellLocal = function () { const t0 = performance.now(); const r = oW.apply(this, arguments); const o = P(phase()); o.tW++; o.tWms += performance.now() - t0; return r; };
    T.isRockCellLocal = function () { const t0 = performance.now(); const r = oR.apply(this, arguments); const o = P(phase()); o.tR++; o.tRms += performance.now() - t0; return r; };
    T.__t947 = true; return true;
  };
  wrapAbs('isWaterAtAbs', 'w'); wrapAbs('isRockAtAbs', 'r');
  if (!wrapTerr()) { const id = setInterval(() => { if (wrapTerr()) clearInterval(id); }, 50); }
  return true;
};
// ── 그림 같음 재료(가라앉은 뒤) ─────────────────────────────────────────────────────────────
const PIXDUMP = () => {
  const fnv = (h, x) => { h ^= x & 0xff; return Math.imul(h, 16777619) >>> 0; };
  const hsCv = (cv) => {   // 2D 캔버스는 그대로 · 아니면(WebGL 캔버스 · ImageBitmap) 2D 캔버스에 옮겨 뜬다
    if (!cv || !cv.width) return null;
    let g = null; try { g = cv.getContext ? cv.getContext('2d') : null; } catch (e) {}
    if (!g) { const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; g = t.getContext('2d'); g.drawImage(cv, 0, 0); }
    const d = g.getImageData(0, 0, cv.width, cv.height).data; let h = 0x811c9dc5; for (let q = 0; q < d.length; q++) { h ^= d[q]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16); };
  const hsStr = (s) => { let h = 0x811c9dc5; for (let q = 0; q < s.length; q++) h = fnv(h, s.charCodeAt(q)) ^ (s.charCodeAt(q) >> 8); return (h >>> 0).toString(16); };
  const a = window.__getSrvAbs(); const c0x = Math.floor(a.x / 32), c0y = Math.floor(a.y / 32); let tb = '';
  for (let dy = -60; dy < 60; dy++) for (let dx = -60; dx < 60; dx++) { const x = (c0x + dx) * 32 + 16, y = (c0y + dy) * 32 + 16; tb += (isWaterAtAbs(x, y) ? 1 : 0) + (isRockAtAbs(x, y) ? 2 : 0); }
  const tiles = {}; for (const [k, e] of _groundTiles) tiles[k] = hsCv(e.cv) + '/' + hsCv(e.bl);
  const nat = {}; for (const [k, ch] of _natChunk) nat[k] = hsStr(JSON.stringify(ch, (kk, v) => (v && typeof v === 'object' && (v instanceof HTMLCanvasElement || v instanceof HTMLImageElement)) ? '[img]' : v));
  const mt = {}; let mtSegs = 0, mtErr = null;   // 산 청크 = 세그먼트 배열(11-r1-mountain `_mt3Chunk.set(key, segs)`) — 세그먼트마다 화소 해시 @ 자리
  try { for (const [k, ch] of _mt3Chunk) { const segs = Array.isArray(ch) ? ch : ((ch && ch.segs) || []); mtSegs += segs.length; mt[k] = segs.length + ':' + segs.map((s) => hsCv(s && (s.img || s.cv)) + '@' + [s.x, s.y, s.ox, s.oy].join(',')).join(';'); } } catch (e) { mtErr = String(e && e.message); }
  return { at: [c0x, c0y], cells: hsStr(tb), water: [...tb].filter((ch) => ch === '1' || ch === '3').length, rock: [...tb].filter((ch) => ch === '2' || ch === '3').length, tiles, nat, mt, mtSegs, mtErr };
};

// ── 견줌(`--cmp 가.json 나.json` — 서버 · 브라우저 0) ───────────────────────────────────────────
//   두 파일의 `--pix` 재료를 판마다 짝지어 견준다: 칸 값 표 해시 · 지면 타일 · 자연물 청크 · 산 청크(두 판에 다 있는 열쇠만 — 같은 수 / 다른 수).
//   바닥 = 같은 파일 안 판끼리(같은 손잡이 두 판의 차) · 가로 = 가 판 × 나 판.
if (process.argv.includes('--cmp')) {
  const i = process.argv.indexOf('--cmp'), fa = process.argv[i + 1], fb = process.argv[i + 2];
  const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
  const cmpMap = (a, b) => { let same = 0, diff = 0; for (const k of Object.keys(a || {})) { if (!(k in (b || {}))) continue; if (a[k] === b[k]) same++; else diff++; } return { same, diff }; };
  const pair = (x, y) => ({ cells: x.cells === y.cells && x.at.join() === y.at.join(), tiles: cmpMap(x.tiles, y.tiles), nat: cmpMap(x.nat, y.nat), mt: cmpMap(x.mt, y.mt) });
  const fmt = (p) => `${p.places ? '자리 ' + p.places + ' · ' : ''}칸 표 ${p.cells ? '같음' : '다름'} · 지면 타일 같음 ${p.tiles.same} 다름 ${p.tiles.diff} · 자연물 청크 같음 ${p.nat.same} 다름 ${p.nat.diff} · 산 청크 같음 ${p.mt.same} 다름 ${p.mt.diff}`;
  const out = { a: fa, b: fb, floorA: [], floorB: [], cross: [] };
  const pa = A.runs.filter((r) => r.pix), pb = B.runs.filter((r) => r.pix);
  //   자리 셋(`--spots`)이 있으면 판의 재료 = 들어선 자리 + 자리마다 — 한 짝의 견줌은 그 합(자리 이름이 같은 것끼리)
  const pairAll = (x, y) => { const L = [pair(x.pix, y.pix)]; for (const nm of Object.keys(x.spots || {})) if (y.spots && y.spots[nm]) L.push(Object.assign(pair(x.spots[nm], y.spots[nm]), { nm })); 
    const sum = (f) => L.reduce((a, p) => ({ same: a.same + p[f].same, diff: a.diff + p[f].diff }), { same: 0, diff: 0 });
    return { cells: L.every((p) => p.cells), tiles: sum('tiles'), nat: sum('nat'), mt: sum('mt'), places: L.length }; };
  console.log(`\n=== T947 그림 같음 견줌 — 가 ${A.tag}(${pa.length}판) · 나 ${B.tag}(${pb.length}판) ===`);
  for (let x = 0; x < pa.length; x++) for (let y = x + 1; y < pa.length; y++) { const p = pairAll(pa[x], pa[y]); out.floorA.push(p); console.log(`  바닥 가${x + 1}·가${y + 1}: ${fmt(p)}`); }
  for (let x = 0; x < pb.length; x++) for (let y = x + 1; y < pb.length; y++) { const p = pairAll(pb[x], pb[y]); out.floorB.push(p); console.log(`  바닥 나${x + 1}·나${y + 1}: ${fmt(p)}`); }
  for (let x = 0; x < pa.length; x++) for (let y = 0; y < pb.length; y++) { const p = pairAll(pa[x], pb[y]); out.cross.push(p); console.log(`  가로 가${x + 1}·나${y + 1}: ${fmt(p)}`); }
  const bad = (L) => L.filter((p) => !p.cells || p.tiles.diff || p.nat.diff || p.mt.diff).length;
  console.log(`  → 다른 짝: 바닥 가 ${bad(out.floorA)}/${out.floorA.length} · 바닥 나 ${bad(out.floorB)}/${out.floorB.length} · 가로 ${bad(out.cross)}/${out.cross.length}`);
  const o = arg('--cmp-out', ''); if (o) fs.writeFileSync(o, JSON.stringify(out, null, 1));
  process.exit(0);
}

(async () => {
  console.log(`\n=== T947 첫 조회 층 표 — ${BR} · ${N}판 · ${TAG}${STACK ? ' · 부른 자리' : ''}${PIX ? ' · 그림 같음 재료' : ''} ===`);
  const knobs = Object.keys(process.env).filter((k) => /^T9\d\d_/.test(k)).map((k) => `${k}=${process.env[k]}`);
  console.log(`  · env 손잡이: ${knobs.length ? knobs.join(' ') : '(없음 — 기본)'}`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t947-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const runs = [];
  const t00 = Date.now(); const step = (m) => { if (process.env.T947_DEBUG) console.log(`    [${((Date.now() - t00) / 1000).toFixed(1)}초] ${m}`); };
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
    await sleep(3000);
    step('로비'); await page.evaluate(HOOK, STACK); step('갈고리');
    const en = await page.$('#enter'); if (en) await en.click(); step('눌림');
    if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
    step('입장');
    for (let k = 0; k < 120 && !(await page.evaluate(() => _ld.at.input != null)); k++) await sleep(500);
    step('첫 입력'); await sleep(TAIL * 1000);
    const r = await page.evaluate(() => {
      const at = _ld.at, M = window.__t947, rd = (x) => +(+x).toFixed(1);
      const ph = {}; for (const [k, o] of Object.entries(M.ph)) { const q = {}; for (const [kk, v] of Object.entries(o)) q[kk] = rd(v); ph[k] = q; }
      const callers = Object.entries(M.callers).map(([k, a]) => { const [p, kind, where] = k.split('|'); return { p, kind, where, n: a.n, ms: rd(a.ms) }; }).sort((a, b) => b.n - a.n);
      return { firstMs: rd(at.frame1 - at.welcomeDone), clickToInput: rd(at.input - at.click), fc: _ld.fc || null, ph, callers, prewarm: _ld.prewarm || null,
        knob: { cellNear: (typeof uiCfg !== 'undefined' && uiCfg && 'cellNear' in uiCfg) ? uiCfg.cellNear : null, natBudget: (typeof uiCfg !== 'undefined' && uiCfg && 'natBudget' in uiCfg) ? uiCfg.natBudget : null,
          cellBox: (typeof uiCfg !== 'undefined' && uiCfg && 'cellBox' in uiCfg) ? uiCfg.cellBox : null,
          cellBoxEnv: (() => { try { const o = {}; for (const [z, e] of _t947Env) o[z] = window.CellEnv.stats(e.env); return o; } catch (e) { return null; } })() },   // ★[T947] 켬이면 지은 존 상자(상자 수 · 격자 칸)
        cache: { water: _waterCellCache.size, rock: _rockCellCache.size }, pos: (() => { const a = window.__getSrvAbs(); return [Math.round(a.x), Math.round(a.y)]; })() };
    });
    if (PIX) {
      await page.evaluate(() => { try { window.__terrain19.freezeT = 12.25; window.__terrain19.windOff = true; } catch (e) {} return true; });
      await sleep(4000);
      r.pix = await page.evaluate(PIXDUMP);
    }
    if (PIX && SPOTS) {   // 자리 셋 — 순간이동(막힌 칸이면 둘레 가까운 칸부터 · t926-near-check 와 같은 식) → 굽기 가라앉음 → 재료
      const { DatabaseSync } = require('node:sqlite');
      let rows = []; for (let k = 0; k < 60 && !rows.length; k++) { try { const db = new DatabaseSync(ZDB); rows = db.prepare('SELECT name, cx, cy FROM villages WHERE zone = ?').all('hanbando'); db.close(); } catch (e) {} if (!rows.length) await sleep(1000); }
      const V = (n) => rows.find((q) => q.name === n);
      const tp = (x, y) => page.evaluate(([a, b]) => { window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }); return true; }, [x, y]);
      const tpTo = async (cx, cy) => {
        const ring = [[0, 0]]; for (let q = 1; q <= 8; q++) for (let dy = -q; dy <= q; dy++) for (let dx = -q; dx <= q; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === q) ring.push([dx, dy]);
        for (const [dx, dy] of ring) {
          const x = (cx + dx) * 32 + 16, y = (cy + dy) * 32 + 16; await tp(x, y);
          for (let k = 0; k < 8; k++) { await sleep(700); const d = await page.evaluate(([lx, ly]) => { const a = window.__getSrvAbs ? window.__getSrvAbs() : null; const z2 = window.__getZonesMeta()[window.__getPrimaryZoneId()] || {};
            return a ? Math.hypot(a.x - (lx + (z2.worldOffsetX || 0)), a.y - (ly + (z2.worldOffsetY || 0))) : 1e9; }, [x, y]); if (d <= 64) return [cx + dx, cy + dy]; }
        }
        return null;
      };
      const settle = async () => { await sleep(3000); let last = -1, same = 0; for (let k = 0; k < 120 && same < 5; k++) { await sleep(1000); const n = await page.evaluate(() => (window.__mtDbg ? window.__mtDbg.mt3bakeN : 0) + ':' + (typeof _mt3Jobs !== 'undefined' ? _mt3Jobs.size : 0) + ':' + (window.__groundDbg ? window.__groundDbg.baked : 0));
        if (n === last && /:0:0$/.test(n)) same++; else same = 0; last = n; } await sleep(1500); };
      r.spots = {};
      for (const [nm, v] of [['산1', { cx: 1750, cy: 74 }], ['어촌1', V('어촌1')], ['광산2', V('광산2')]]) {
        if (!v) continue;
        const at = await tpTo(v.cx, v.cy); await settle();
        r.spots[nm] = Object.assign(await page.evaluate(PIXDUMP), { stood: at });
      }
    }
    const f = r.ph.first || {};
    console.log(`\n--- ${i + 1} --- 첫 그림 ${r.firstMs}ms · 눌림 → 첫 입력 ${r.clickToInput}ms · 층 ${JSON.stringify(r.fc)} · 손잡이 ${JSON.stringify(r.knob)} · 데우기 ${JSON.stringify(r.prewarm)}`);
    for (const p of ['pre', 'first', 'f1in', 'after']) { const o = r.ph[p]; if (!o) continue;
      console.log(`   ${p.padEnd(5)} 물 ${o.wN}회(첫 ${o.wMiss}) ${o.wMs}ms · 바위 ${o.rN}회(첫 ${o.rMiss}) ${o.rMs}ms · 지형 물 ${o.tW}회 ${o.tWms}ms · 지형 바위 ${o.tR}회 ${o.tRms}ms(그 안 물 셈 포함)`); }
    if (STACK) for (const x of r.callers.filter((q) => q.p === 'first').slice(0, 14)) console.log(`   [첫 그림 · ${x.kind === 'w' ? '물' : '바위'}] ${x.where} — 첫 조회 ${x.n}칸 ${x.ms}ms`);
    const pl = (q) => `칸 ${q.cells}(물 ${q.water} · 바위 ${q.rock}) @${q.at} · 지면 타일 ${Object.keys(q.tiles).length} · 자연물 청크 ${Object.keys(q.nat).length} · 산 청크 ${Object.keys(q.mt).length}(세그먼트 ${q.mtSegs}${q.mtErr ? ' · 오류 ' + q.mtErr : ''})`;
    if (PIX) console.log(`   그림 재료: ${pl(r.pix)}`);
    if (r.spots) for (const [nm, q] of Object.entries(r.spots)) console.log(`   그림 재료 ${nm}: ${pl(q)}`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t947-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, knobs, runs }, null, 1));
    await ctx.close(); await sleep(2000);
  }
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
