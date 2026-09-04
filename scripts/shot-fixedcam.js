#!/usr/bin/env node
// 고정 카메라 한 장 — 기본값 무변경 증명용(트리를 갈아 끼우고 같은 자리를 찍어 화소 비교).
// 사용: CX=2029 CY=571 OUT=/tmp/x.png node scripts/shot-fixedcam.js
'use strict';
const path=require('path'), fs=require('fs');
const { spawn }=require('child_process');
const ROOT=path.join(__dirname,'..'), CPORT=3010, ZPORT=3020;
const CX=+(process.env.CX||2029), CY=+(process.env.CY||571);
const OUTP=process.env.OUT||'/tmp/fixedcam.png';
const sleep=(m)=>new Promise(r=>setTimeout(r,m)); const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
const die=(c)=>{for(const p of procs){try{p.kill();}catch(e){}}process.exit(c);};
(async()=>{
  fs.writeFileSync('/tmp/zw-fc.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-fc.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/fc.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:CX*32+16,y:CY*32+16,name:'고정'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');
  const br=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for(const s of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(s);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windOff=true;window.__terrain19.natOff=true;});
  let last='',same=0,t=0;
  while(t<120000){ await sleep(2000); t+=2000;
    const d=await pg.evaluate(()=>{const q=window.__mtDbg;return [q.mt3chunks,q.segs].join(',');});
    if(d===last&&!d.endsWith(',0')){ if(++same>=3) break; } else { same=0; last=d; } }
  await pg.screenshot({path:OUTP});
  // 성능 — 같은 자리에서 rAF 중앙값 5회(트리 간 비교라 **짝이 아니다**. 보고에 그렇게 쓴다)
  const MED=`(ms)=>new Promise(res=>{const a=[];let l=performance.now();const t0=l;
    const st=()=>{const n=performance.now();a.push(n-l);l=n;
      if(n-t0<ms)requestAnimationFrame(st);else{const s2=a.slice().sort((x,y)=>x-y);res(+s2[s2.length>>1].toFixed(2));}};requestAnimationFrame(st);})`;
  const ms=[]; for(let k=0;k<5;k++) ms.push(await pg.evaluate('('+MED+')(2200)'));
  const m=ms.reduce((x,y)=>x+y,0)/ms.length;
  const sd=Math.sqrt(ms.reduce((x,y)=>x+(y-m)**2,0)/(ms.length-1));
  console.log('찍음', OUTP, '· 안정', t+'ms', '·', last, `· rAF 중앙값 ${m.toFixed(2)}±${sd.toFixed(2)}ms (n=5)`);
  await br.close(); die(0);
})().catch(e=>{console.error(e);die(1);});
