#!/usr/bin/env node
// 그림/성능 — 같은 자리에서 흐림 방식 세 판 + 성능 짝(PERF=1).
//   ⓐ 띠 z(옛) · ⓑ 화면 가로줄(MT_FADE_CLIP) · ⓒ 픽셀 절단(v4 수직 평면, 채택)
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/cut3'; fs.mkdirSync(OUT, { recursive: true });
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(c); };
const SITE = { cx: 2150, cy: 1959 };
(async () => {
  const site = { i: SITE.cx, j: SITE.cy };
  fs.writeFileSync('/tmp/zw-cut3.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-cut3.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/cut3.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.i * 32 + 16, y: site.j * 32 + 16, name: '절단' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const s2 of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await pg.$(s2); if (b) { await b.click(); break; } } catch (e) { } }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; });
  await sleep(1500);
  const settle = async (max = 120000) => { let last = '', same = 0, t = 0;
    while (t < max) { await sleep(2000); t += 2000;
      const d = await pg.evaluate(() => { const q = window.__mtDbg; return [q.mt3chunks, q.segs].join(','); });
      if (d === last && !d.endsWith(',0')) { if (++same >= 3) return t; } else { same = 0; last = d; } }
    return t; };
  await settle();
  await pg.evaluate(() => window.__mtFadeCut(1));
  for (let t = 0; t < 12; t++) {
    const st = await pg.evaluate(() => ({ n: window.__mtOccDbg.n, split: window.__mtCutN().split }));
    if (st.n > 0 && st.split > 0) { console.log(`  자리 잡음 ${t}걸음 — 가림 ${st.n} · 걸친 띠 ${st.split}`); break; }
    const aim = await pg.evaluate(() => {
      const me = window.__getMyAbs(); let best = null;
      for (let dx = -18; dx <= 18; dx += 2) for (let dy = -18; dy <= 18; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r || !r.n) continue;
        const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { dx, dy, d };
      } return best; });
    const keys = [];
    if (aim) { if (aim.dy < -1) keys.push('w'); if (aim.dy > 1) keys.push('s');
               if (aim.dx < -1) keys.push('a'); if (aim.dx > 1) keys.push('d'); }
    if (!keys.length) keys.push('wasd'[t % 4]);
    for (const k of keys) { await pg.keyboard.down(k); await sleep(650); await pg.keyboard.up(k); }
    await sleep(600); await settle(20000);
  }
  const dbg0 = await pg.evaluate(() => window.__mtOccDbg);
  console.log(`흐림 상태 — 가린 산 ${dbg0.n} · 알파 ${dbg0.fade}`);
  await pg.evaluate(() => { Object.assign(window.__terrain19, { occOff: true }); });
  await sleep(2200); await settle(20000);
  await pg.screenshot({ path: path.join(OUT, 'base.png') });
  const base = PNG.sync.read(fs.readFileSync(path.join(OUT, 'base.png')));
  await pg.evaluate(() => { Object.assign(window.__terrain19, { occOff: false }); });
  await sleep(1500);
  const PANELS = [['a-띠z', { cut: 0, clip: 0 }], ['b-가로줄', { cut: 0, clip: 1 }], ['c-픽셀', { cut: 1, clip: 0 }]];
  const shots = [];
  for (const [tag, kn] of PANELS) {
    await pg.evaluate((k) => { window.__mtFadeCut(k.cut); window.__mtFadeClip(k.clip); }, kn);
    await sleep(2500); await settle(30000);
    const p2 = path.join(OUT, `${tag}.png`);
    await pg.screenshot({ path: p2 });
    const d = await pg.evaluate(() => ({ ...window.__mtOccDbg, cn: window.__mtCutN() }));
    console.log(`  ${tag} → 흐림 ${d.faded}장 · 걸친 띠 ${d.cn.split} · 새로 만든 띠 ${d.cn.built}`);
    shots.push({ tag, png: PNG.sync.read(fs.readFileSync(p2)) });
  }
  await pg.evaluate(() => { window.__mtFadeCut(1); window.__mtFadeClip(0); });
  const CW = 700, CH = 450, SW = CW * 3, SH = CH * 2;
  const sheet = new PNG({ width: SW, height: SH });
  const put = (src, dx, dy, tint) => {
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const u = x * 2, v = y * 2, s2 = (v * src.width + u) * 4, t = ((dy + y) * SW + (dx + x)) * 4;
      let r = src.data[s2], g = src.data[s2+1], b = src.data[s2+2];
      if (tint) { const dd = Math.abs(base.data[s2]-r) + Math.abs(base.data[s2+1]-g) + Math.abs(base.data[s2+2]-b);
        r = base.data[s2]*0.45; g = base.data[s2+1]*0.45; b = base.data[s2+2]*0.45;
        if (dd > 24) { r = 255; g = 60; b = 200; } }
      sheet.data[t] = r; sheet.data[t+1] = g; sheet.data[t+2] = b; sheet.data[t+3] = 255;
    } };
  shots.forEach((s2, k) => { put(s2.png, k * CW, 0, false); put(s2.png, k * CW, CH, true); });
  fs.writeFileSync(path.join(OUT, 'sheet.png'), PNG.sync.write(sheet));
  console.log(`시트 — ${path.join(OUT, 'sheet.png')} · 1행 실제 화면 · 2행 흐려진 자리(자홍)`);
  if (process.env.PERF) {
    const MED = `(ms)=>new Promise(res=>{const a=[];let l=performance.now();const t0=l;
      const st=()=>{const n=performance.now();a.push(n-l);l=n;
        if(n-t0<ms)requestAnimationFrame(st);else{const s2=a.slice().sort((x,y)=>x-y);res(+s2[s2.length>>1].toFixed(2));}};requestAnimationFrame(st);})`;
    const st2 = (a) => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, n - 1));
      return { m, sd, se: sd / Math.sqrt(n) }; };
    const prof = { 0: [], 1: [] };
    for (let k = 0; k < 5; k++) for (const v of [0, 1]) {
      await pg.evaluate((z) => window.__mtFadeCut(z), v); await sleep(1600);
      prof[v].push(await pg.evaluate('(' + MED + ')(2400)'));
    }
    const A = st2(prof[0]), B = st2(prof[1]), dse = Math.hypot(A.se, B.se), diff = B.m - A.m;
    console.log(`성능 짝(정지) — 끔 ${A.m.toFixed(2)}±${A.sd.toFixed(2)} · 켬 ${B.m.toFixed(2)}±${B.sd.toFixed(2)}ms · 차 ${diff >= 0 ? '+' : ''}${diff.toFixed(2)} · 2σ ${(2*dse).toFixed(2)} → ${Math.abs(diff) > 2*dse ? '유의' : '잡음'}`);
    const cq = { 0: [], 8: [], 24: [] };
    for (let k = 0; k < 4; k++) for (const q of [0, 8, 24]) {
      await pg.evaluate((v) => { window.__mtFadeCut(1); window.__mtFadeCQ(v); }, q);
      await sleep(700); await pg.keyboard.down('d');
      cq[q].push(await pg.evaluate('(' + MED + ')(2000)'));
      await pg.keyboard.up('d'); await sleep(350);
    }
    await pg.evaluate(() => window.__mtFadeCQ(8));
    for (const q of [0, 8, 24]) { const S = st2(cq[q]);
      console.log(`  눈금 ${String(q).padStart(2)}px → 이동 중 ${S.m.toFixed(1)}±${S.sd.toFixed(1)}ms (SE ${S.se.toFixed(1)})`); }
  }
  await br.close(); die(0);
})().catch((e) => { console.error(e); die(1); });
