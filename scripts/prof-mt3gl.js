#!/usr/bin/env node
// 산 표면 GPU 판 vs 캔버스 폴리곤 판 — **짝 비교** 프레임 시간.
//   규약: 켬/끔을 5회 교대, 평균±표준오차, 2σ 넘으면 유의. 격리 1회 측정은 못 믿는다.
//   ★손잡이를 돌리면 청크를 다 버리고 다시 굽는다. 그건 **일시 비용**이라
//     굽기가 끝난 뒤(settle) 정상 상태를 재고, 굽기 폭주는 따로 최대 프레임으로 낸다.
const path = require('path'), fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const SITE = { cx: +process.env.CX || 1914, cy: +process.env.CY || 202 };
const REP = +(process.env.REP || 5), SETTLE = +(process.env.SETTLE || 7000);
const sleep = (m) => new Promise(r => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zw-g.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
const M = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
  const step=()=>{const n=performance.now();t.push(n-last);last=n;
    if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);
      res({n:s.length,med:+s[s.length>>1].toFixed(2),p95:+s[Math.floor(s.length*0.95)].toFixed(1),max:+s[s.length-1].toFixed(1)});}};
  requestAnimationFrame(step);})`;
const avg = (z) => z.reduce((x, y) => x + y, 0) / z.length;
const sd = (z) => { const m = avg(z); return Math.sqrt(z.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, z.length - 1)); };
(async () => {
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-g.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/g.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  // NOGLARGS=1 이면 **예전 프로파일러와 같은 기동 인자**(인자 없음)로 띄운다.
  //   28.7ms 기준선이 그 조건에서 나온 숫자라, 절대값을 견주려면 조건을 맞춰야 한다.
  const GLARGS = process.env.NOGLARGS ? [] : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const br = await chromium.launch({ headless: true, args: GLARGS });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(18000);
  console.log('렌더러 =', await pg.evaluate(() => { try { const c = document.createElement('canvas').getContext('webgl');
    const d = c.getExtension('WEBGL_debug_renderer_info'); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown'; } catch (e) { return 'none'; } }));
  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(() => window.__mtDbg)));
  // 시계·바람 고정 — 산 손잡이 하나만 남긴다
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windForce = 0; });
  await sleep(1500);
  const on = [], off = [], burstOn = [], burstOff = [];
  for (let r = 0; r < REP; r++) {
    for (const [v, arr, barr] of [[1, on, burstOn], [0, off, burstOff]]) {
      await pg.evaluate((vv) => window.__mt3gl(vv), v);
      const b = await pg.evaluate(`(${M})(3000)`);          // 굽기 폭주 구간
      barr.push(b.max);
      await sleep(SETTLE);                                   // 남은 청크까지 다 굽힌다
      arr.push((await pg.evaluate(`(${M})(2500)`)).med);     // 정상 상태
    }
  }
  const d = avg(on) - avg(off), se = Math.sqrt((sd(on) ** 2 + sd(off) ** 2) / REP);
  console.log('\n[산 표면 짝 비교 — 정상 상태 프레임 중앙값 ms/f]');
  console.log('  GPU 켬 : ' + on.map(v => v.toFixed(2)).join(' · ') + `   평균 ${avg(on).toFixed(2)} σ ${sd(on).toFixed(2)}`);
  console.log('  GPU 끔 : ' + off.map(v => v.toFixed(2)).join(' · ') + `   평균 ${avg(off).toFixed(2)} σ ${sd(off).toFixed(2)}`);
  console.log(`  ★차이 ${d >= 0 ? '+' : ''}${d.toFixed(2)} ms/f (SE ${se.toFixed(2)}) — ${Math.abs(d) > 2 * se ? '유의' : '잡음'}`);
  console.log('  굽기 폭주 최대 프레임: 켬 ' + avg(burstOn).toFixed(0) + 'ms · 끔 ' + avg(burstOff).toFixed(0) + 'ms');
  await pg.evaluate(() => window.__mt3gl(1)); await sleep(SETTLE);
  const base = await pg.evaluate(`(${M})(3000)`);
  console.log(`  전부 켠 기준선(GPU 판): med ${base.med} p95 ${base.p95} max ${base.max}`);
  // ★"산이 아예 없을 때"의 바닥값 — 절대값 목표(28.7ms)가 어디서 온 숫자인지 가르는 대조군.
  //   산 켬/끔 차이가 크면 목표치는 '산 있는 화면'의 값이 아니었다는 뜻이다.
  const mOn = [], mOff = [];
  for (let r = 0; r < 3; r++) {
    await pg.evaluate(`window.__terrain19.mtOff=false`); await sleep(1200);
    mOn.push((await pg.evaluate(`(${M})(2500)`)).med);
    await pg.evaluate(`window.__terrain19.mtOff=true`); await sleep(1200);
    mOff.push((await pg.evaluate(`(${M})(2500)`)).med);
  }
  const dm = avg(mOn) - avg(mOff), sem = Math.sqrt((sd(mOn) ** 2 + sd(mOff) ** 2) / 3);
  console.log(`\n[대조군 — 산 자체를 끄면] 산 켬 ${avg(mOn).toFixed(2)} · 산 끔 ${avg(mOff).toFixed(2)}` +
    `  ★${dm >= 0 ? '+' : ''}${dm.toFixed(2)}ms (SE ${sem.toFixed(2)}) ${Math.abs(dm) > 2 * sem ? '유의' : '잡음'}`);
  await pg.evaluate(`window.__terrain19.mtOff=false`);
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0);
})().catch(e => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) {} } process.exit(1); });
