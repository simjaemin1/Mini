#!/usr/bin/env node
// === scripts/t565-map-audit.js — 큰 지도 픽셀 ↔ 셀 술어 대조 자 (T565 ① · 재민 실기 09-30) ==========
//
// ★무엇을 재나
//   큰 지도(M)가 **그린 종류**와 존의 **셀 술어가 답한 종류**를, 존 전체를 **지도 해상도로** 표본해 대조한다.
//   · 참(셀 술어) = 존이 걷기에 쓰는 그 술어들을 셀 중심에서 묻는다 —
//       바위 `terrain.isRockCellLocal` · 물 = 해안 띠(`chunk.generateCoastlineWaterTiles` = 존의 `WATER_TILES`) ∪ `terrain.isWaterCellLocal`
//       · 다리 = zone-config `bridges` · 광맥 `isOreClusterAt`(주인이 큰 광맥) · 산 `getStoneMultiplier` · 숲 `getForestMultiplier`
//     종류의 순서는 `server/bigmap-bake.js classAt` 하나(존이 굽는 그 함수 — 이 자는 술어만 Node 에서 이어 붙인다).
//     ⚠이 자의 물 = 존 `isWaterTileLocal` 의 조립(해안 비트 ∪ 강·호수)을 **다시 적은 것**이다(자는 존을 못 띄우고 잰다).
//       그래서 `--mode=baked` 가 존이 구운 PNG 를 이 조립과 대조한다 — 둘이 어긋나면 그 판이 빨갛다(교차 검사).
//   · 지도 — 두 가지
//     ⓥ `--mode=vector` 종전 지도: `80-bigmap.js`(기본 `origin/main` 판)의 `buildZoneCache` 를 **그대로** 헤드리스 Chromium 에서
//        돌려 존 캐시(한 변 1024 상한 = 사용자가 줌할 때 보는 그 캐시)를 받고, 픽셀마다 가장 가까운 팔레트 색으로 종류를 읽는다.
//        그 픽셀 중심의 월드 좌표가 든 셀이 대조할 셀이다. 경계의 섞인 색(앤티앨리어싱)은 따로 센다(불일치에 안 넣는다 — 보수적).
//        같은 판에서 **종전 줌인**(배율 ≥ 1 · `buildVpCache` 의 셀 표본 = 클라 거울 물·바위 + 벡터 숲 사각·산 사각·광맥 원)을
//        표본 셀(4×4 가운데)에서 재현해 같이 잰다.
//     ⓑ `--mode=baked` 새 지도: 존이 구운 `/bigmap.png`(4×4 표본) · `/bigmap.png?tile=` 줌인 조각(1셀 = 1픽셀)을 받아
//        정확한 팔레트 색으로 종류를 읽고 **표본 셀**과 대조한다.
//
// 실행
//   node scripts/t565-map-audit.js --mode=vector [--zones=hanbando,nippon] [--rev=origin/main] [--out=/tmp/t565] [--pic=hanbando]
//   node scripts/t565-map-audit.js --mode=baked --url=hanbando=http://127.0.0.1:3020[,nippon=http://…] [--tiles=N]
//   (둘 다 표를 찍고 `--out` 에 json · 그림을 남긴다)
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const zc = require(path.join(ROOT, 'server', 'zone-config'));
const terrain = require(path.join(ROOT, 'server', 'terrain'));
const chunk = require(path.join(ROOT, 'server', 'chunk'));
const BB = require(path.join(ROOT, 'server', 'bigmap-bake'));

const argv = process.argv.slice(2);
const arg = (k, d) => { const a = argv.find((s) => s.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const has = (k) => argv.includes('--' + k);

const LAND = (zc.ZONE_ORDER || Object.keys(zc.ZONES)).filter((id) => zc.ZONES[id] && !zc.ZONES[id].isOcean);
const K = BB.K, CLS = BB.CLS;
const CELL = 32;

// ── 참: 존 술어를 셀 중심에서 ───────────────────────────────────────────────
const OCEAN_RECTS = Object.values(zc.ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const _truthCache = new Map();
function truth(zid) {
  if (_truthCache.has(zid)) return _truthCache.get(zid);
  const Z = zc.ZONES[zid];
  const W = Math.ceil(Z.zoneWidth / CELL), H = Math.ceil(Z.zoneHeight / CELL);
  const coast = chunk.generateCoastlineWaterTiles({ ...Z, id: zid }, CELL, zc.findZoneAt, OCEAN_RECTS);
  const bits = new Uint8Array(W * H);
  for (const k of coast) { const u = k.indexOf('_'); const tx = +k.slice(0, u), ty = +k.slice(u + 1); if (tx >= 0 && ty >= 0 && tx < W && ty < H) bits[ty * W + tx] = 1; }
  const br = new Set();
  const bl = Z.bridges || [];
  for (let i = 0; i + 1 < bl.length; i += 2) br.add(bl[i] * H + bl[i + 1]);
  const tc = (v) => Math.floor(v / CELL);
  const q = {
    rock: (x, y) => terrain.isRockCellLocal(zid, x, y),
    water: (x, y) => bits[tc(y) * W + tc(x)] === 1 || terrain.isWaterCellLocal(zid, x, y),
    bridge: (x, y) => br.has(tc(x) * H + tc(y)),
    ore: (x, y) => terrain.isOreClusterAt(zid, x, y),
    stone: (x, y) => terrain.getStoneMultiplier(zid, x, y),
    forest: (x, y) => terrain.getForestMultiplier(zid, x, y),
  };
  const cache = new Map();   // 셀 → 종류(한 셀을 두 번 안 묻는다)
  const at = (tx, ty) => { const k = ty * W + tx; let v = cache.get(k); if (v === undefined) { v = BB.classAt(q, tx, ty); cache.set(k, v); } return v; };
  const r = { zid, Z, W, H, q, at, coastN: coast.size, bridgeN: br.size, coastBits: bits };
  _truthCache.set(zid, r);
  return r;
}

// ── 혼동표 ────────────────────────────────────────────────────────────────
function newConf() { return { n: 0, mixed: 0, m: Array.from({ length: CLS.length }, () => new Array(CLS.length).fill(0)) }; }
function addConf(c, mapK, truthK) { c.n++; if (mapK < 0) { c.mixed++; return; } c.m[mapK][truthK]++; }
function sumConf(a, b) { a.n += b.n; a.mixed += b.mixed; for (let i = 0; i < CLS.length; i++) for (let j = 0; j < CLS.length; j++) a.m[i][j] += b.m[i][j]; return a; }
// 한 종류의 두 방향: 지도가 k 인데 참은 아님(그중 뭍) · 참이 k 인데 지도는 아님
const LANDSET = new Set([K.plain, K.forest, K.ore, K.mountain]);   // 걸을 수 있는 뭍(다리는 따로)
function side(c, k) {
  let mapK = 0, mapKnot = 0, mapKland = 0, truK = 0, truKnot = 0, agree = 0, all = 0;
  for (let i = 0; i < CLS.length; i++) for (let j = 0; j < CLS.length; j++) {
    const v = c.m[i][j]; all += v;
    if (i === j) agree += v;
    if (i === k) { mapK += v; if (j !== k) { mapKnot += v; if (LANDSET.has(j)) mapKland += v; } }
    if (j === k) { truK += v; if (i !== k) truKnot += v; }
  }
  return { mapK, mapKnot, mapKland, truK, truKnot, agree, all };
}
const pct = (a, b) => (b > 0 ? (100 * a / b).toFixed(2) + '%' : '—');

// ── ⓥ 종전 지도 — 헤드리스 Chromium 에서 그 코드 그대로 ─────────────────────
async function vectorMode(zones, outDir) {
  const rev = arg('rev', 'origin/main');
  const src0 = execSync(`git -C "${ROOT}" show ${rev}:public/client/80-bigmap.js`, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (src0.indexOf('function getZoneCache(') < 0) throw new Error(`${rev} 의 80-bigmap.js 에 buildZoneCache/getZoneCache 가 없다 — 종전 판이 아니다`);
  // ★훅 한 줄 — 함수 본문은 한 글자도 안 바꾼다(IIFE 안의 이름을 밖으로 건넬 뿐)
  const src = src0.replace('function getZoneCache(', 'window.__t565Build = buildZoneCache;\n  function getZoneCache(');
  const META = zc.publicZoneMap('localhost');
  const HARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  await page.setContent('<!doctype html><html><body><div id="bigMapPanel" class="hidden"><canvas id="bigMapCanvas" width="64" height="64"></canvas></div></body></html>');
  await page.evaluate((meta) => { window.__getZonesMeta = () => meta; window.isTypingTarget = () => false; }, META);
  await page.addScriptTag({ path: path.join(ROOT, 'public', 'terrain-gen.js') });
  await page.addScriptTag({ path: path.join(ROOT, 'public', 'terrain.js') });
  await page.evaluate((all) => { for (const [z, d] of Object.entries(all)) window.Terrain.setHardcoded(z, d); }, HARD);
  await page.addScriptTag({ content: src });
  if (!(await page.evaluate(() => typeof window.__t565Build === 'function'))) throw new Error('훅이 안 걸렸다');
  const { PNG } = require('pngjs');
  const rows = [];
  const total = newConf(), totalZin = newConf();
  let pic = null;
  for (const zid of zones) {
    const T = truth(zid);
    const meta = META[zid];
    const t0 = Date.now();
    const got = await page.evaluate(({ zid, meta }) => {
      const r = window.__t565Build(zid, meta, 1.5);   // 1.5 = 최대 배율 → 한 변 1024 상한(줌해 들어갈 때의 그 캐시)
      return r ? { w: r.cw, h: r.ch, url: r.canvas.toDataURL('image/png') } : null;
    }, { zid, meta });
    if (!got) { rows.push({ zid, err: '캐시 없음' }); continue; }
    const png = PNG.sync.read(Buffer.from(got.url.split(',')[1], 'base64'));
    const pal = [[K.plain, BB.hexRgb(meta.groundColor, '#5a7c4a')], [K.water, BB.hexRgb(BB.COLORS.water)], [K.rock, BB.hexRgb(BB.COLORS.rock)],
      [K.forest, BB.hexRgb(BB.COLORS.forest)], [K.mountain, BB.hexRgb(BB.COLORS.mountain)], [K.ore, BB.hexRgb(BB.COLORS.ore)]];
    const conf = newConf();
    const zw = T.Z.zoneWidth, zh = T.Z.zoneHeight;
    const mapCls = new Int8Array(got.w * got.h), truCls = new Uint8Array(got.w * got.h);
    for (let py = 0; py < got.h; py++) {
      const ty = Math.min(T.H - 1, Math.floor(((py + 0.5) * zh / got.h) / CELL));
      for (let px = 0; px < got.w; px++) {
        const tx = Math.min(T.W - 1, Math.floor(((px + 0.5) * zw / got.w) / CELL));
        const i = (py * got.w + px) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
        let best = -1, bd = 1e9;
        for (const [k, c] of pal) { const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }
        const mk = bd <= 8 * 8 ? best : -1;   // 팔레트 색에서 8 넘게 떨어진 색 = 경계의 섞인 색(앤티앨리어싱 · 두 색의 중간이 제3의 팔레트 색에 가까워지는 일을 막는다 — 뭍+물 반반 ≈ 바위색)
        const tk = T.at(tx, ty);
        mapCls[py * got.w + px] = mk; truCls[py * got.w + px] = tk;
        addConf(conf, mk, tk);
      }
    }
    // 종전 줌인(배율 ≥ 1) — 표본 셀(4×4 가운데)에서 그 코드의 규칙을 재현(클라 거울 술어 + 벡터 사각·원)
    const bw = Math.ceil(T.W / BB.STEP), bh = Math.ceil(T.H / BB.STEP);
    const zin = await page.evaluate(({ zid, W, H, bw, bh, step }) => {
      const Tr = window.Terrain, td = Tr.ZONE_TERRAIN[zid];
      const out = new Uint8Array(bw * bh);
      if (!td) return Array.from(out);
      const hasWater = (td.rivers && td.rivers.length > 0) || (td.lakes && td.lakes.length > 0);
      const hasRock = td.ridges && td.ridges.length > 0;
      const sc = (b, n) => Math.min(n - 1, b * step + (step >> 1));
      for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        const x = sc(bx, W) * 32 + 16, y = sc(by, H) * 32 + 16;
        let k = 0;   // plain
        // 그리는 순서(아래 → 위): 숲 사각 → 산 사각 → 광맥 원(자잘 포함) → 물·바위 셀
        for (const f of (td.forests || [])) { if (!f.rect || (f.densityMult || 0) <= 1.5) continue; const [a, b, c, d] = f.rect; if (x >= a && x <= c && y >= b && y <= d) k = 6; }
        for (const m of (td.mountains || [])) { if (!m.rect || (m.stoneMult || 0) <= 1.5) continue; const [a, b, c, d] = m.rect; if (x >= a && x <= c && y >= b && y <= d) k = 5; }
        for (const o of (td.ores || [])) { if (!o.center) continue; const dx = x - o.center[0], dy = y - o.center[1], r = o.radius || 0; if (dx * dx + dy * dy <= r * r) k = 4; }
        if (hasWater && Tr.isWaterCellLocal(zid, x, y)) k = 1;
        else if (hasRock && Tr.isRockCellLocal && Tr.isRockCellLocal(zid, x, y)) k = 2;
        out[by * bw + bx] = k;
      }
      return Array.from(out);
    }, { zid, W: T.W, H: T.H, bw, bh, step: BB.STEP });
    const confZin = newConf();
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) addConf(confZin, zin[by * bw + bx], T.at(BB.sampleCell(bx, BB.STEP, T.W), BB.sampleCell(by, BB.STEP, T.H)));
    sumConf(total, conf); sumConf(totalZin, confZin);
    rows.push({ zid, w: got.w, h: got.h, conf, confZin, ms: Date.now() - t0, coastN: T.coastN, bridgeN: T.bridgeN });
    if (arg('pic', '') === zid) pic = { zid, w: got.w, h: got.h, mapCls, truCls, rgba: png.data, meta };
    process.stdout.write(`  ${zid} ${got.w}×${got.h} · ${Date.now() - t0}ms\n`);
  }
  await browser.close();
  return { rows, total, totalZin, errs, pic, rev };
}

// ── ⓑ 새 지도 — 존이 구운 PNG · 줌인 조각 ─────────────────────────────────
async function fetchPng(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { status: r.status, text: await r.text().catch(() => '') };
  const buf = Buffer.from(await r.arrayBuffer());
  const { PNG } = require('pngjs');
  return { status: r.status, buf, png: PNG.sync.read(buf), ver: r.headers.get('x-bigmap-ver'), step: +r.headers.get('x-bigmap-step') || 0 };
}
function readBaked(png, pal) {   // 정확한 팔레트 색 → 종류(없으면 -1)
  const m = new Map(pal.map((c, k) => [(c[0] << 16) | (c[1] << 8) | c[2], k]));
  const out = new Int8Array(png.width * png.height);
  for (let i = 0; i < out.length; i++) { const v = m.get((png.data[i * 4] << 16) | (png.data[i * 4 + 1] << 8) | png.data[i * 4 + 2]); out[i] = v === undefined ? -1 : v; }
  return out;
}
async function bakedMode(pairs, nTiles) {
  const rows = [];
  const total = newConf(), totalTile = newConf();
  for (const [zid, base] of pairs) {
    const T = truth(zid);
    const pal = BB.palette(T.Z.groundColor);
    const t0 = Date.now();
    let z = null;
    for (let i = 0; i < 120; i++) {   // 굽는 중이면 503 — 다 구울 때까지 기다린다(상한 120번 × 1초)
      z = await fetchPng(`${base}/bigmap.png`);
      if (z.status === 200) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!z || z.status !== 200) { rows.push({ zid, err: `bigmap.png ${z && z.status}` }); continue; }
    const cls = readBaked(z.png, pal);
    const bw = Math.ceil(T.W / BB.STEP), bh = Math.ceil(T.H / BB.STEP);
    const conf = newConf();
    const sizeOk = z.png.width === bw && z.png.height === bh;
    if (sizeOk) for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) addConf(conf, cls[by * bw + bx], T.at(BB.sampleCell(bx, BB.STEP, T.W), BB.sampleCell(by, BB.STEP, T.H)));
    // 줌인 조각 — 산맥이 있으면 산맥 셀 둘레에서, 없으면 존 가운데에서 nTiles 장
    const confTile = newConf();
    const tiles = [];
    const TS = BB.TILE;
    const tw = Math.ceil(T.W / TS), th = Math.ceil(T.H / TS);
    const pick = [];
    for (let by = 0; by < bh && pick.length < 4000; by += 7) for (let bx = 0; bx < bw; bx += 7) if (cls[by * bw + bx] === K.rock || cls[by * bw + bx] === K.bridge) pick.push([Math.floor(bx * BB.STEP / TS), Math.floor(by * BB.STEP / TS)]);
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const uniq = [...new Map(pick.map((p) => [p[0] + ',' + p[1], p])).values()];
    for (let i = uniq.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [uniq[i], uniq[j]] = [uniq[j], uniq[i]]; }
    const seen = new Set();
    for (const p of uniq) { if (tiles.length >= nTiles) break; seen.add(p[0] + ',' + p[1]); tiles.push(p); }
    for (let a = 0; tiles.length < nTiles && a < nTiles * 20; a++) {   // 산맥이 모자라면 아무 데나(같은 조각 두 번 0)
      const p = [Math.floor(rnd() * tw), Math.floor(rnd() * th)], k = p[0] + ',' + p[1];
      if (!seen.has(k)) { seen.add(k); tiles.push(p); }
    }
    let tileVerOk = 0;
    for (const [TX, TY] of tiles) {
      let r = await fetchPng(`${base}/bigmap.png?tile=${TX},${TY}`);
      for (let k = 0; k < 6 && r.status === 429; k++) { await new Promise((res) => setTimeout(res, 1100)); r = await fetchPng(`${base}/bigmap.png?tile=${TX},${TY}`); }   // 존이 새 조각을 초당 20장까지만 굽는다
      if (r.status !== 200) { confTile.n++; confTile.mixed++; continue; }
      if (r.ver === z.ver) tileVerOk++;
      const tc = readBaked(r.png, pal);
      for (let y = 0; y < r.png.height; y++) for (let x = 0; x < r.png.width; x++) addConf(confTile, tc[y * r.png.width + x], T.at(TX * TS + x, TY * TS + y));
    }
    sumConf(total, conf); sumConf(totalTile, confTile);
    rows.push({ zid, w: z.png.width, h: z.png.height, sizeOk, bytes: z.buf.length, ver: z.ver, step: z.step, conf, confTile, tiles: tiles.length, tileVerOk, ms: Date.now() - t0 });
    process.stdout.write(`  ${zid} ${z.png.width}×${z.png.height} · ${(z.buf.length / 1024).toFixed(1)}KB · 조각 ${tiles.length} · ${Date.now() - t0}ms\n`);
  }
  return { rows, total, totalTile };
}

// ── 존 띄우기(`--boot`) — 기동 표식은 아이의 입(`fixture-boot`) · 포트는 zone-config 의 표 ─────────────
async function bootZones(ids) {
  const { spawn } = require('child_process');
  const FB = require('./fixture-boot');
  const net = require('net');
  const free = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.once('listening', () => s.close(() => res(true))); s.listen(port, '127.0.0.1'); });
  const out = [];
  for (const id of ids) {
    const port = zc.ZONES[id].port;
    if (!(await free(port))) throw new Error(`포트 ${port}(${id}) 를 누가 쥐고 있다 — 남의 존을 재지 않는다`);
    const db = `/tmp/t565a-${id}-${process.pid}.db`;
    for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(db + s); } catch (e) {} }
    const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'zone.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { PORT: String(port), ZONE_ID: id, DB_PATH: db, CENTRAL_HOST: 'localhost', CENTRAL_PORT: '3999', CENTRAL_URL: 'http://localhost:3999',
        ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', ENABLE_VILLAGES: '0' }) });
    out.push({ id, port, proc, db, up: FB.waitUp(proc, /zone server up on/, { name: id }) });
  }
  for (const z of out) { const u = await z.up; if (!u.ok) throw new Error(u.why); }
  process.on('exit', () => { for (const z of out) { try { z.proc.kill('SIGKILL'); } catch (e) {} for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(z.db + s); } catch (e) {} } } });
  return out;
}

// ── 표 ──────────────────────────────────────────────────────────────────
function printSide(label, c) {
  const R = side(c, K.rock), Wt = side(c, K.water), F = side(c, K.forest), O = side(c, K.ore);
  const judged = c.n - c.mixed;
  console.log(`  ${label}  픽셀 ${c.n.toLocaleString()} · 섞인 색 ${c.mixed.toLocaleString()}(${pct(c.mixed, c.n)}) · 종류 일치 ${pct(R.agree, judged)}`);
  console.log(`    바위  지도 바위 ${R.mapK.toLocaleString()} 중 셀은 아님 ${R.mapKnot.toLocaleString()}(${pct(R.mapKnot, R.mapK)}) · 그중 뭍 ${R.mapKland.toLocaleString()}(${pct(R.mapKland, R.mapK)})`
    + ` │ 셀 바위 ${R.truK.toLocaleString()} 중 지도는 아님 ${R.truKnot.toLocaleString()}(${pct(R.truKnot, R.truK)})`);
  console.log(`    물    지도 물 ${Wt.mapK.toLocaleString()} 중 셀은 아님 ${Wt.mapKnot.toLocaleString()}(${pct(Wt.mapKnot, Wt.mapK)}) · 그중 뭍 ${Wt.mapKland.toLocaleString()}(${pct(Wt.mapKland, Wt.mapK)})`
    + ` │ 셀 물 ${Wt.truK.toLocaleString()} 중 지도는 아님 ${Wt.truKnot.toLocaleString()}(${pct(Wt.truKnot, Wt.truK)})`);
  console.log(`    숲    지도 숲 중 셀은 아님 ${pct(F.mapKnot, F.mapK)} │ 셀 숲 중 지도는 아님 ${pct(F.truKnot, F.truK)}   광맥  지도 광맥 중 아님 ${pct(O.mapKnot, O.mapK)} │ 셀 광맥 중 지도 아님 ${pct(O.truKnot, O.truK)}`);
  const B = side(c, K.bridge);
  if (B.truK || B.mapK) console.log(`    다리  셀 다리 ${B.truK.toLocaleString()} 중 지도는 아님 ${B.truKnot.toLocaleString()}(${pct(B.truKnot, B.truK)}) · 지도 다리 중 아님 ${pct(B.mapKnot, B.mapK)}`);
  return { rock: R, water: Wt, forest: F, ore: O, bridge: B, mixed: c.mixed, n: c.n, agreePct: judged ? 100 * R.agree / judged : null, mismatch: judged - R.agree };
}

// ── 그림 — 종전 지도 · 불일치 · 참(셀) 세 장 나란히 ───────────────────────────
function writePic(pic, file) {
  const { PNG } = require('pngjs');
  const { w, h } = pic;
  const gap = 8, W = w * 3 + gap * 2;
  const out = new PNG({ width: W, height: h });
  out.data.fill(0x0a);
  const pal = BB.palette(pic.meta.groundColor);
  const put = (x, y, c) => { const i = (y * W + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255; };
  const C = { mapRockTruLand: [255, 48, 48], truRockMapNot: [255, 64, 255], mapWaterTruNot: [255, 160, 32], truWaterMapNot: [32, 224, 255], other: [240, 240, 64], mixed: [70, 70, 70] };
  const cnt = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, j = i * 4;
    put(x, y, [pic.rgba[j], pic.rgba[j + 1], pic.rgba[j + 2]]);
    const tk = pic.truCls[i], mk = pic.mapCls[i];
    put(x + (w + gap) * 2, y, pal[tk]);
    let c;
    if (mk < 0) c = C.mixed;
    else if (mk === tk) { const p = pal[tk]; c = [p[0] * 0.35 | 0, p[1] * 0.35 | 0, p[2] * 0.35 | 0]; }
    else if (mk === K.rock && tk !== K.rock) c = C.mapRockTruLand;
    else if (tk === K.rock && mk !== K.rock) c = C.truRockMapNot;
    else if (mk === K.water && tk !== K.water) c = C.mapWaterTruNot;
    else if ((tk === K.water || tk === K.bridge) && mk !== K.water) c = C.truWaterMapNot;
    else c = C.other;
    put(x + w + gap, y, c);
    const kk = Object.keys(C).find((n) => C[n] === c) || 'agree';
    cnt[kk] = (cnt[kk] || 0) + 1;
  }
  fs.writeFileSync(file, PNG.sync.write(out));
  return { file, cnt, colors: C };
}

if (require.main === module) (async () => {
  const mode = arg('mode', 'vector');
  const outDir = arg('out', '/tmp/t565');
  fs.mkdirSync(outDir, { recursive: true });
  if (mode === 'vector') {
    const zones = (arg('zones', '') || LAND.join(',')).split(',').filter(Boolean);
    console.log(`\n=== T565 ① 자 — 종전 큰 지도(벡터 · ${arg('rev', 'origin/main')}) ↔ 셀 술어 · ${zones.length}존 ===`);
    const R = await vectorMode(zones, outDir);
    const res = { mode, rev: R.rev, zones: [], errs: R.errs };
    for (const r of R.rows) {
      if (r.err) { console.log(`\n  ${r.zid}: ${r.err}`); continue; }
      console.log(`\n■ ${r.zid} — 존 캐시 ${r.w}×${r.h}(픽셀 하나 ≈ ${(zc.ZONES[r.zid].zoneWidth / r.w / CELL).toFixed(2)}셀) · 해안 띠 ${r.coastN.toLocaleString()}셀 · 다리 ${r.bridgeN}셀`);
      const a = printSide('줌아웃(존 캐시)', r.conf);
      const b = printSide('줌인(표본 셀 · 종전 규칙)', r.confZin);
      res.zones.push({ zid: r.zid, w: r.w, h: r.h, coastN: r.coastN, bridgeN: r.bridgeN, out: a, zin: b, confOut: r.conf.m, confZin: r.confZin.m });
    }
    console.log(`\n■ 합(${zones.length}존)`);
    res.total = printSide('줌아웃(존 캐시)', R.total);
    res.totalZin = printSide('줌인(표본 셀 · 종전 규칙)', R.totalZin);
    res.confTotal = R.total.m; res.confTotalZin = R.totalZin.m;
    if (R.pic) { const p = writePic(R.pic, path.join(outDir, `t565-before-${R.pic.zid}.png`)); res.pic = p; console.log(`\n  그림 → ${p.file}  (왼쪽 종전 지도 · 가운데 불일치: 빨강 = 지도 바위·셀 아님 · 자홍 = 셀 바위·지도 아님 · 주황 = 지도 물·셀 아님 · 하늘 = 셀 물·지도 아님 · 노랑 = 그 밖 · 회색 = 섞인 색 · 오른쪽 셀 술어)`); }
    console.log(`\n  페이지 오류 ${R.errs.length}건${R.errs.length ? ' — ' + R.errs.slice(0, 2).join(' | ') : ''}`);
    fs.writeFileSync(path.join(outDir, 't565-vector.json'), JSON.stringify(res, null, 1));
    console.log(`  json → ${path.join(outDir, 't565-vector.json')}\n`);
  } else if (mode === 'baked') {
    let pairs = arg('url', '').split(',').filter(Boolean).map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).replace(/\/$/, '')]; });
    const nTiles = +arg('tiles', '24');
    const bootIds = arg('boot', '') === 'all' ? LAND : arg('boot', '').split(',').filter(Boolean);
    let R;
    if (bootIds.length) {
      // ★존을 이 자가 직접 띄운다(마을 끔 · 지형만) — 한 번에 `--batch` 개씩(메모리) · 다 재면 내린다
      const batch = +arg('batch', '5');
      console.log(`\n=== T565 ① 자 — 새 큰 지도(존이 구운 PNG) ↔ 셀 술어 · ${bootIds.length}존(직접 띄움 · ${batch}개씩) ===`);
      R = { rows: [], total: newConf(), totalTile: newConf() };
      for (let i = 0; i < bootIds.length; i += batch) {
        const ids = bootIds.slice(i, i + batch);
        const zs = await bootZones(ids);
        try {
          const r = await bakedMode(zs.map((z) => [z.id, `http://localhost:${z.port}`]), nTiles);
          R.rows.push(...r.rows); sumConf(R.total, r.total); sumConf(R.totalTile, r.totalTile);
        } finally { for (const z of zs) { try { z.proc.kill('SIGKILL'); } catch (e) {} } await new Promise((r) => setTimeout(r, 800)); }
      }
    } else {
      console.log(`\n=== T565 ① 자 — 새 큰 지도(존이 구운 PNG) ↔ 셀 술어 · ${pairs.length}존 ===`);
      R = await bakedMode(pairs, nTiles);
    }
    const res = { mode, zones: [] };
    for (const r of R.rows) {
      if (r.err) { console.log(`\n  ${r.zid}: ${r.err}`); res.zones.push({ zid: r.zid, err: r.err }); continue; }
      console.log(`\n■ ${r.zid} — PNG ${r.w}×${r.h}(표본 ${r.step}×${r.step}셀 · 크기 ${r.sizeOk ? '맞음' : '★틀림'}) · ${(r.bytes / 1024).toFixed(1)}KB · 버전 ${r.ver}`);
      const a = printSide('줌아웃(구운 PNG · 표본 셀)', r.conf);
      const b = printSide(`줌인(조각 ${r.tiles}장 · 1셀 = 1픽셀 · 버전 같음 ${r.tileVerOk}/${r.tiles})`, r.confTile);
      res.zones.push({ zid: r.zid, w: r.w, h: r.h, bytes: r.bytes, ver: r.ver, sizeOk: r.sizeOk, out: a, zin: b, tiles: r.tiles, tileVerOk: r.tileVerOk });
    }
    res.total = printSide('\n합 줌아웃', R.total);
    res.totalTile = printSide('합 줌인', R.totalTile);
    fs.writeFileSync(path.join(outDir, 't565-baked.json'), JSON.stringify(res, null, 1));
    console.log(`  json → ${path.join(outDir, 't565-baked.json')}\n`);
  }
})().catch((e) => { console.error('자 예외:', e && e.stack || e); process.exit(1); });

module.exports = { truth, readBaked, side, newConf, addConf };
