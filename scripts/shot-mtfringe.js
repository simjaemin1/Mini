#!/usr/bin/env node
// ⑤ 자락 톱니 시안 2종 — __mt3fringe 0(현행)/1(경계선 잡음)/2(알파 페더). 기본 0.
//   같은 카메라 3판 + 확대 · judge-grid 전 대역 · 성능 짝
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/fringe'; fs.mkdirSync(OUT, { recursive: true });
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const rock = (i, j) => T.isRockCellLocal('hanbando', i * 32 + 16, j * 32 + 16);
const water = (i, j) => T.isWaterCellLocal('hanbando', i * 32 + 16, j * 32 + 16);
// 산자락이 화면 가운데 오도록 — 바위 경계에서 남동으로 8칸 떨어진 뭍
function site() {
  for (let j = 200; j < 900; j += 2) for (let i = 1780; i < 2260; i += 2) {
    if (rock(i, j) || water(i, j)) continue;
    if (!rock(i - 8, j - 8)) continue;                 // 북서쪽 8칸에 산
    let deep = true; for (let k = 8; k < 20; k++) if (!rock(i - k, j - k)) { deep = false; break; }
    if (deep) return { i, j };
  }
  return null;
}
(async () => {
  const st = site(); if (!st) die(1);
  console.log(`자리 (${st.i},${st.j}) — 북서쪽에 산자락`);
  fs.writeFileSync('/tmp/zw-fr.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'), { PORT:''+CPORT, PUBLIC_HOST:'localhost', ENABLED_ZONES:'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-fr.js', { PORT:''+ZPORT, ZONE_ID:'hanbando', DB_PATH:'/tmp/fr.db', CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0', ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: st.i*32+16, y: st.j*32+16, name: '자락' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport:{width:1400,height:900} })).newPage();
  pg.on('pageerror', (e) => console.log('  [err]', String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true;
                            window.__terrain19.natOff = true; window.__terrain19.occOff = true; });
  await sleep(2000);
  const settle = async (max=120000) => { let last='',same=0,t=0;
    while (t<max) { await sleep(2000); t+=2000;
      const d = await pg.evaluate(() => { const q=window.__mtDbg; return [q.mt3chunks,q.segs].join(','); });
      if (d===last && !d.endsWith(',0')) { if (++same>=3) return t; } else { same=0; last=d; } }
    return t; };
  const MED = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
    const step=()=>{const n=performance.now();t.push(n-last);last=n;
      if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);res(+s[s.length>>1].toFixed(2));}};requestAnimationFrame(step);})`;
  for (const v of [0, 1, 2]) {
    await pg.evaluate((x) => window.__mt3fringe(x), v);
    await settle();
    await pg.screenshot({ path: path.join(OUT, `F_${v}.png`) });
    console.log(`  시안 ${v} 촬영`);
  }
  // 성능 짝 — 0 기준으로 1·2 를 교대
  const st2 = (a) => { const n=a.length,m=a.reduce((x,y)=>x+y,0)/n;
    const sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,n-1)); return {m,sd,se:sd/Math.sqrt(n),n}; };
  for (const cand of [1, 2]) {
    const prof = { 0: [], [cand]: [] };
    for (let k = 0; k < 5; k++) for (const v of [0, cand]) {
      await pg.evaluate((x) => window.__mt3fringe(x), v); await settle();
      prof[v].push(await pg.evaluate('(' + MED + ')(2200)'));
    }
    const A = st2(prof[0]), B = st2(prof[cand]), dse = Math.hypot(A.se,B.se), diff = B.m - A.m;
    console.log(`  성능 짝 — 현행 ${A.m.toFixed(2)}±${A.sd.toFixed(2)} vs 시안${cand} ${B.m.toFixed(2)}±${B.sd.toFixed(2)}ms · 차 ${diff>=0?'+':''}${diff.toFixed(2)} · 2σ ${(2*dse).toFixed(2)} → ${Math.abs(diff)>2*dse?'유의':'잡음'}`);
  }
  await pg.evaluate(() => window.__mt3fringe(0));
  console.log('저장:', OUT);
  await br.close(); die(0);
})().catch((e) => { console.error(e); die(1); });
