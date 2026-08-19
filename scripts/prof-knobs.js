#!/usr/bin/env node
// 렉 주범 좁히기 — __terrain19 손잡이를 하나씩 끄며 실클라 프레임 p95 를 잰다.
//   ★[타 세션 지적 2026-08-09] "0.47~0.77ms 는 목업 스크립트가 만든 숫자다.
//     실클라 프레임 루프에서 한 번 더 찍지 않으면 같은 계측 경로를 두 번 믿는 셈이다." 맞다.
//   그래서 여기선 **진짜 게임 페이지**의 rAF 간격을 잰다(목업 캔버스가 아니라).
const path=require('path'),fs=require('fs');const {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'),CPORT=3010,ZPORT=3020;
const SITE={cx:+process.env.CX||1914,cy:+process.env.CY||202};
const sleep=(m)=>new Promise(r=>setTimeout(r,m));const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
fs.writeFileSync('/tmp/zw-pf.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
const M=`(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
  const step=()=>{const n=performance.now();t.push(n-last);last=n;
    if(n-t0<ms)requestAnimationFrame(step);else{t.sort((a,b)=>a-b);
      res({n:t.length,med:+t[t.length>>1].toFixed(1),p95:+t[Math.floor(t.length*0.95)].toFixed(1),max:+t[t.length-1].toFixed(1)});}};
  requestAnimationFrame(step);})`;
(async()=>{
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-pf.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/pf.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:SITE.cx*32+16,y:SITE.cy*32+16,name:'산'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');const br=await chromium.launch({headless:true});
  const pg=await(await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',(e)=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto(`http://localhost:${CPORT}/`);await sleep(2000);
  for(const sel of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(18000);
  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(()=>window.__mtDbg)));
  // ★한 번씩 재면 못 믿는다 — 이 장면의 잡음 바닥이 ±12ms 로 컸다(음수 '절감'이 −12.2 까지 나왔다).
  //   그래서 **한 손잡이를 켬/끔으로 번갈아 여러 번** 재서 짝지어 비교한다(단일 변인 + 반복).
  const K = process.env.KNOB || 'windOff', REP = +(process.env.REP || 5);
  const onA = [], offA = [];
  for (let r = 0; r < REP; r++) {
    await pg.evaluate((kk)=>{ window.__terrain19[kk] = false; }, K); await sleep(1200);
    onA.push((await pg.evaluate(`(${M})(2500)`)).med);
    await pg.evaluate((kk)=>{ window.__terrain19[kk] = true; }, K); await sleep(1200);
    offA.push((await pg.evaluate(`(${M})(2500)`)).med);
  }
  const avg=(z)=>z.reduce((x,y)=>x+y,0)/z.length;
  const sd=(z)=>{const m=avg(z);return Math.sqrt(z.reduce((x,y)=>x+(y-m)*(y-m),0)/z.length);};
  console.log(`\n손잡이 ${K} — ${REP}회 교차 측정 (med, ms)`);
  console.log(`  켬 : ${onA.map(v=>v.toFixed(1)).join(', ')}   평균 ${avg(onA).toFixed(1)} ±${sd(onA).toFixed(1)}`);
  console.log(`  끔 : ${offA.map(v=>v.toFixed(1)).join(', ')}   평균 ${avg(offA).toFixed(1)} ±${sd(offA).toFixed(1)}`);
  const d = avg(onA)-avg(offA), pooled = Math.sqrt((sd(onA)**2+sd(offA)**2)/REP);
  console.log(`  ★차이 ${d.toFixed(1)}ms (표준오차 ${pooled.toFixed(1)}) → ${Math.abs(d) > 2*pooled ? '유의하다' : '잡음과 구분 안 된다'}`);
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
