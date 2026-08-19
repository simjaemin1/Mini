#!/usr/bin/env node
// 같은 자리에서 **현행(캔버스 폴리곤) vs 새판(WebGL 메쉬)** 한 쌍을 찍는다.
//   판정에 쓸 원본이므로 카메라·시계·바람을 모두 고정하고 손잡이 하나만 갈아 끼운다.
const path=require('path'),fs=require('fs');const {spawn}=require('child_process');
const ROOT=path.join(__dirname,'..'),CPORT=3010,ZPORT=3020;
const SITE={cx:+process.env.CX||1914,cy:+process.env.CY||202};
const OUT=process.env.OUTDIR||'/tmp/mtab'; fs.mkdirSync(OUT,{recursive:true});
const sleep=(m)=>new Promise(r=>setTimeout(r,m));const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
fs.writeFileSync('/tmp/zw-ab.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
(async()=>{
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-ab.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/ab.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:SITE.cx*32+16,y:SITE.cy*32+16,name:'산'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');
  const br=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const pg=await(await br.newContext({viewport:{width:1400,height:900}})).newPage();
  const logs=[];
  pg.on('console',(m)=>{const t=m.text(); if(/mt3d|WebGL|webgl|shader|SHADER/.test(t)) logs.push(t.slice(0,300));});
  pg.on('pageerror',(e)=>logs.push('[err] '+String(e.message).slice(0,300)));
  await pg.goto(`http://localhost:${CPORT}/`);await sleep(2000);
  for(const sel of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  // 시계·바람·자연물 고정. 산 표면만 남긴다.
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windForce=0;
    window.__terrain19.natOff=true;window.__terrain19.propOff=true;window.__terrain19.decoOff=true;});
  await sleep(3000);
  const cam=await pg.evaluate(()=>window.__mtDbg||null);
  console.log('__mtDbg =',JSON.stringify(cam));
  for(const [tag,v] of [['A_현행_캔버스',0],['B_새판_webgl',1]]){
    const r=await pg.evaluate((vv)=>window.__mt3gl(vv), v);
    await sleep(6000);                        // 예산 1청크/프레임 — 뷰 전체 다시 굽는 데 충분히
    await pg.screenshot({path:path.join(OUT,tag+'.png')});
    console.log(tag,'knob=',r);
  }
  console.log('--- 콘솔 ---'); for(const l of [...new Set(logs)]) console.log(' ',l);
  console.log('저장:',OUT);
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
