#!/usr/bin/env node
// 실클라 산 화면 한 장 — 눈으로 보려고 찍는다(추측 금지).
const path=require('path'),fs=require('fs');const {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'),CPORT=3010,ZPORT=3020;
const SITE={cx:+process.env.CX||1914,cy:+process.env.CY||202};
const sleep=(m)=>new Promise(r=>setTimeout(r,m));const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
fs.writeFileSync('/tmp/zw-sh.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
(async()=>{
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-sh.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/sh.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:SITE.cx*32+16,y:SITE.cy*32+16,name:'산'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');const br=await chromium.launch({headless:true});
  const pg=await(await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',(e)=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto(`http://localhost:${CPORT}/`);await sleep(2000);
  for(const sel of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windForce=0;});
  await sleep(2500);
  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(()=>window.__mtDbg)));
  await pg.screenshot({path:'/tmp/mt_live.png'});
  // 자연물·물·소품을 끄고 산만 — 격자 흔적이 산에서 오는지 지면에서 오는지 가른다
  await pg.evaluate(()=>{window.__terrain19.natOff=true;window.__terrain19.propOff=true;window.__terrain19.decoOff=true;});
  await sleep(2500); await pg.screenshot({path:'/tmp/mt_live_bare.png'});
  console.log('저장: /tmp/mt_live.png · /tmp/mt_live_bare.png');
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
