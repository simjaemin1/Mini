#!/usr/bin/env node
// =============================================================================
// sweep-mtzocc — 가림 판정 z 편향(MT_OCC_ZB) 재스윙. **결정 자료**(기본값 변경 없음).
//   SCENE=corridor|north|south · ZBS=500,96,48,0
//   장면 셋: ⓐ 깊은 통로 안 정면 · ⓑ 산 북서쪽 평지(산이 나를 가림) · ⓒ 산 남동쪽 평지(대조군)
//   값마다: 그림 + 확대 · __mtOccDbg · 주변 발동률 · 채터(정지/왕복) · (통로에서만) 성능 짝
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const SCENE = process.env.SCENE || 'corridor';
const OUT = process.env.OUTDIR || ('/tmp/zb-' + SCENE); fs.mkdirSync(OUT, { recursive: true });
const ZBS = (process.env.ZBS || '500,96,48,0').split(',').map(Number);
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZID = 'hanbando';
const rock = (i, j) => T.isRockCellLocal(ZID, i * 32 + 16, j * 32 + 16);
const water = (i, j) => T.isWaterCellLocal(ZID, i * 32 + 16, j * 32 + 16);

// ── 자리 고르기 ──────────────────────────────────────────────────────────────
function deepSite() {   // 가장자리에서 가장 먼 바위 셀(창 잘림 보정 — 창 밖은 땅으로 본다)
  const I0 = 1740, J0 = 0, W = 520, H = 720;
  const R = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) R[j * W + i] = rock(I0 + i, J0 + j) ? 1 : 0;
  const INF = 1e6, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = R[k] ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : d[j * W + i];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i-1,j)+1, at(i,j-1)+1, at(i-1,j-1)+1.414, at(i+1,j-1)+1.414); }
  for (let j = H-1; j >= 0; j--) for (let i = W-1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i+1,j)+1, at(i,j+1)+1, at(i+1,j+1)+1.414, at(i-1,j+1)+1.414); }
  let best = 0, bi = 0, bj = 0; const MG = 60;
  for (let j = MG; j < H - MG; j++) for (let i = MG; i < W - MG; i++) {
    const v = d[j * W + i]; if (v < 1e5 && v > best) { best = v; bi = I0 + i; bj = J0 + j; }
  }
  let wd = 0; while (wd < 120 && rock(bi - wd - 1, bj)) wd++;
  return { i: bi, j: bj, wd, dE: +best.toFixed(1) };
}
// 산에서 K칸 떨어진 뭍 — dir=-1 이면 북서(작은 i+j), +1 이면 남동
function plainSite(dir, K) {
  const core = deepSite();
  for (let s = 1; s < 200; s++) {
    const i = core.i + dir * s, j = core.j + dir * s;
    if (rock(i, j) || water(i, j)) continue;
    const i2 = i + dir * K, j2 = j + dir * K;
    if (rock(i2, j2) || water(i2, j2)) continue;
    return { i: i2, j: j2, core };
  }
  return null;
}

(async () => {
  let site, digCells = [], label;
  if (SCENE === 'corridor') {
    const s0 = deepSite(); site = { i: s0.i, j: s0.j }; label = `통로 안(dE ${s0.dE})`;
    for (let k = s0.wd; k >= 0; k--) digCells.push([s0.i - k, s0.j]);
  } else if (SCENE === 'north') {
    const p = plainSite(-1, 10); if (!p) die(1); site = { i: p.i, j: p.j }; label = '산 북서쪽 평지(산이 나를 가림)';
  } else {
    const p = plainSite(+1, 10); if (!p) die(1); site = { i: p.i, j: p.j }; label = '산 남동쪽 평지(대조군)';
  }
  console.log(`장면 [${SCENE}] ${label} · 셀 (${site.i},${site.j}) · 삽질 ${digCells.length}칸`);

  fs.writeFileSync('/tmp/zw-zb.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-zb.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/zb.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.i * 32 + 16, y: site.j * 32 + 16, name: SCENE } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);

  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('  [err] ' + String(e.message).slice(0, 140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; });
  await sleep(2000);

  const settle = async (maxMs = 120000) => {
    let last = '', same = 0, t = 0;
    while (t < maxMs) { await sleep(2000); t += 2000;
      const d = await pg.evaluate(() => { const q = window.__mtDbg; return [q.mt3chunks, q.segs].join(','); });
      if (d === last && !d.startsWith('0,') && !d.endsWith(',0')) { if (++same >= 3) return t; } else { same = 0; last = d; }
    }
    return t;
  };
  if (digCells.length) {
    const dig = await pg.evaluate((cs) => { let dug = 0, bad = 0;
      for (const [i, j] of cs) {
        const isR = window.__mtIsRock(i, j);
        const edge = [[1,0],[-1,0],[0,1],[0,-1]].some(([a,b]) => window.__mtIsRock(i+a, j+b) === false);
        if (!isR || !edge) { bad++; continue; }
        window.__mtDestroy([[i, j]]); dug++;
      } return { dug, bad }; }, digCells);
    console.log(`  삽질 ${dig.dug}칸 · 위반 ${dig.bad}칸`);
  }
  await settle();
  const wall = await pg.evaluate((s) => [window.__mtHeightAt(s.i, s.j - 1), window.__mtHeightAt(s.i, s.j + 1)], site);
  console.log(`  옆벽/주변 높이 ${JSON.stringify(wall.map((v) => +v.toFixed(2)))}`);

  const MED = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
    const step=()=>{const n=performance.now();t.push(n-last);last=n;
      if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);
        res(+s[s.length>>1].toFixed(2));}};requestAnimationFrame(step);})`;

  const rows = [];
  for (const zb of ZBS) {
    await pg.evaluate((v) => window.__mtZOcc(v), zb);
    await sleep(2500);
    const dbg = await pg.evaluate(() => window.__mtOccDbg);
    const rate = await pg.evaluate(() => { const me = window.__getMyAbs(); let hit = 0, tot = 0;
      for (let dx = -30; dx <= 30; dx += 2) for (let dy = -30; dy <= 30; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32); if (!r) continue; tot++; if (r.n > 0) hit++; }
      return tot ? +(hit / tot * 100).toFixed(1) : 0; });
    // 정지 채터 — 33프레임 동안 n 이 몇 번 뒤집히나
    const chat = await pg.evaluate(() => new Promise((res) => {
      let prev = null, flip = 0, k = 0;
      const step = () => { const n = window.__mtOccDbg ? window.__mtOccDbg.n : 0;
        if (prev !== null && (n > 0) !== (prev > 0)) flip++;
        prev = n; if (++k < 33) requestAnimationFrame(step); else res(flip); };
      requestAnimationFrame(step); }));
    await pg.screenshot({ path: path.join(OUT, `Z_${zb}.png`) });
    rows.push({ zb, n: dbg.n, fade: dbg.fade, front: dbg.front, faded: dbg.faded, rate, chat });
    console.log(`  편향 ${String(zb).padStart(3)} → 가림 ${dbg.n} · 알파 ${dbg.fade} · 앞 띠 ${dbg.front} · 발동률 ${rate}% · 정지 채터 ${chat}`);
  }
  // 성능 짝 — 500 vs 0 을 5회 교대
  const prof = { 500: [], 0: [] };
  if (!process.env.NOPROF) {
    for (let k = 0; k < 5; k++) for (const zb of [500, 0]) {
      await pg.evaluate((v) => window.__mtZOcc(v), zb); await sleep(1200);
      prof[zb].push(await pg.evaluate('(' + MED + ')(2200)'));
    }
    const st = (a) => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, n - 1));
      return { m, sd, se: sd / Math.sqrt(n), n }; };
    const A = st(prof[500]), B = st(prof[0]);
    const dse = Math.hypot(A.se, B.se), diff = B.m - A.m;
    console.log(`  성능 짝 — 편향 500: ${A.m.toFixed(2)}±${A.sd.toFixed(2)}ms (SE ${A.se.toFixed(2)}) · 편향 0: ${B.m.toFixed(2)}±${B.sd.toFixed(2)}ms (SE ${B.se.toFixed(2)})`);
    console.log(`            차 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}ms · 2σ ${(2 * dse).toFixed(2)} → ${Math.abs(diff) > 2 * dse ? '유의' : '잡음'}`);
    rows.push({ perf: { A, B, diff } });
  }
  await pg.evaluate(() => window.__mtZOcc(500));
  fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify({ scene: SCENE, label, site, wall, rows }, null, 1));
  console.log('저장:', OUT);
  await br.close(); die(0);
})().catch((e) => { console.error(e); die(1); });
