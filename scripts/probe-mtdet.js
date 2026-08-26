#!/usr/bin/env node
// 결정론 진단 — 절단을 켠 채 **가만히 서서** 연속 프레임이 왜 달라지는지 가른다.
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const SITE = { cx: 2150, cy: 1959 };
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };
(async () => {
  fs.writeFileSync('/tmp/zw-det.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'), { PORT:''+CPORT, PUBLIC_HOST:'localhost', ENABLED_ZONES:'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-det.js', { PORT:''+ZPORT, ZONE_ID:'hanbando', DB_PATH:'/tmp/det.db', CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0', ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare:{ x:SITE.cx*32+16, y:SITE.cy*32+16, name:'결정론' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless:true, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const pg = await (await br.newContext({ viewport:{width:1400,height:900} })).newPage();
  pg.on('pageerror', e => console.log('[err]', String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const s2 of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']) {
    try { const b = await pg.$(s2); if (b) { await b.click(); break; } } catch(e){} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.windOff = true; window.__terrain19.freezeT = 0.30; });
  const settle = async (max=90000) => { let last='', same=0, t=0;
    while (t<max) { await sleep(1800); t+=1800;
      const d = await pg.evaluate(() => { const q=window.__mtDbg; return [q.mt3chunks,q.segs].join(','); });
      if (d===last && !d.endsWith(',0')) { if (++same>=3) return t; } else { same=0; last=d; } }
    return t; };
  await settle();
  for (let t=0;t<10;t++) {
    const st = await pg.evaluate(() => ({ n: window.__mtOccDbg.n, split: window.__mtCutN().split }));
    if (st.n>0 && st.split>0) break;
    const k='wasd'[t%4];
    await pg.keyboard.down(k); await sleep(650); await pg.keyboard.up(k); await sleep(600); await settle(18000);
  }
  const shot = async (n) => { const f=`/tmp/det-${n}.png`; await pg.screenshot({path:f}); return PNG.sync.read(fs.readFileSync(f)); };
  const box=[0,260,1400,860];
  const diff=(a,b)=>{let s2=0,t=0;for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++){const i=(y*a.width+x)*4;t++;
    s2+=(Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]))/3;}return t?s2/t:0;};
  for (let k=0;k<4;k++) {
    const c1 = await pg.evaluate(() => window.__mtCutN()); const A = await shot('a'+k);
    await sleep(900);
    const c2 = await pg.evaluate(() => window.__mtCutN()); const B = await shot('b'+k);
    const d = diff(A,B);
    // 다른 화소가 어디에 몰려 있나
    let n=0,x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++){const i=(y*A.width+x)*4;
      if(Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2])>18){
        n++; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }}
    console.log(`${k}: |Δ| ${d.toFixed(3)} · 다른 화소 ${n} · 상자 ${n?`x${x0}..${x1} y${y0}..${y1}`:'-'}`);
    console.log(`   프레임1 ${JSON.stringify(c1)}\n   프레임2 ${JSON.stringify(c2)}`);
  }
  await br.close(); die(0);
})().catch(e => { console.error(e); die(1); });
