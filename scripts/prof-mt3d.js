#!/usr/bin/env node
// 산 근처 프레임 시간 **실클라 실측** — 3D / 스프라이트 / 산없음 을 같은 자리에서.
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
  for(const sel of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(18000);
  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(()=>window.__mtDbg)));
  const on=await pg.evaluate(`(${M})(5000)`);
  console.log('3D 켬  :', JSON.stringify(on));
  await pg.evaluate(()=>{window.__terrain19.mt3dOff=true;});await sleep(4000);
  console.log('  (전환 후) __mtDbg =', JSON.stringify(await pg.evaluate(()=>window.__mtDbg)));
  const off=await pg.evaluate(`(${M})(5000)`);
  console.log('스프라이트:', JSON.stringify(off));
  await pg.evaluate(()=>{window.__terrain19.mtOff=true;});await sleep(2500);
  const none=await pg.evaluate(`(${M})(4000)`);
  console.log('산 없음  :', JSON.stringify(none));
  console.log(`\n★실클라 프레임 p95 — 3D ${on.p95}ms · 스프라이트 ${off.p95}ms · 산없음 ${none.p95}ms (60fps=16.7ms)`);
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
