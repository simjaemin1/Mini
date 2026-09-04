#!/usr/bin/env node
// 흐림 경계 명세 변경 A/B — `__mtFadeZOff`(발치 기준 오프셋) · `__mtFadeZSoft`(그라데이션 폭)
//   SCENE=corridor|behind · ZOFFS=500,0,32,64 · ZSOFTS=0,48
//   ★ZOFF 500 = **옛 명세**(문턱이 내 z + MT_OCC_ZB 500 이었다) — 그대로 재현된다.
'use strict';
const path=require('path'), fs=require('fs');
const { spawn }=require('child_process');
const ROOT=path.join(__dirname,'..'), CPORT=3010, ZPORT=3020;
const SCENE=process.env.SCENE||'corridor';
const OUT=process.env.OUTDIR||('/tmp/fz-'+SCENE); fs.mkdirSync(OUT,{recursive:true});
const sleep=(m)=>new Promise(r=>setTimeout(r,m)); const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
const die=(c)=>{for(const p of procs){try{p.kill();}catch(e){}}process.exit(c);};
const T=require(path.join(ROOT,'server','terrain.js'));
const rock=(i,j)=>T.isRockCellLocal('hanbando',i*32+16,j*32+16);
const water=(i,j)=>T.isWaterCellLocal('hanbando',i*32+16,j*32+16);
function deepSite(){const I0=1740,J0=0,W=520,H=720,R=new Uint8Array(W*H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++)R[j*W+i]=rock(I0+i,J0+j)?1:0;
  const d=new Float32Array(W*H);for(let k=0;k<W*H;k++)d[k]=R[k]?1e6:0;
  const at=(i,j)=>(i<0||j<0||i>=W||j>=H)?0:d[j*W+i];
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=j*W+i;if(!d[k])continue;
    d[k]=Math.min(d[k],at(i-1,j)+1,at(i,j-1)+1,at(i-1,j-1)+1.414,at(i+1,j-1)+1.414);}
  for(let j=H-1;j>=0;j--)for(let i=W-1;i>=0;i--){const k=j*W+i;if(!d[k])continue;
    d[k]=Math.min(d[k],at(i+1,j)+1,at(i,j+1)+1,at(i+1,j+1)+1.414,at(i-1,j+1)+1.414);}
  let b=0,bi=0,bj=0;for(let j=60;j<H-60;j++)for(let i=60;i<W-60;i++){const v=d[j*W+i];if(v<1e5&&v>b){b=v;bi=I0+i;bj=J0+j;}}
  let wd=0;while(wd<120&&rock(bi-wd-1,bj))wd++;
  return {i:bi,j:bj,wd,dE:+b.toFixed(1)};}
// 산 **뒤**(북서) 평지 — 산이 나를 가리는 쪽
function behindSite(){const c=deepSite();
  for(let s=1;s<200;s++){const i=c.i-s,j=c.j-s;
    if(rock(i,j)||water(i,j))continue;
    const i2=i-6,j2=j-6; if(rock(i2,j2)||water(i2,j2))continue;
    return {i:i2,j:j2};}
  return null;}
(async()=>{
  let site, dig=[];
  if(SCENE==='corridor'){const s0=deepSite();site={i:s0.i,j:s0.j};
    for(let k=s0.wd;k>=0;k--)dig.push([s0.i-k,s0.j]);
    console.log(`장면 corridor — 셀 (${site.i},${site.j}) dE ${s0.dE} · 삽질 ${dig.length}`);}
  else {const p2=behindSite(); if(!p2)die(1); site=p2;
    console.log(`장면 behind — 산 뒤 평지 셀 (${site.i},${site.j})`);}
  fs.writeFileSync('/tmp/zw-fz.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-fz.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/fz.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:site.i*32+16,y:site.j*32+16,name:SCENE}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');
  const br=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for(const s2 of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(s2);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windOff=true;});
  await sleep(2000);
  const settle=async(max=150000)=>{let last='',same=0,t=0;
    while(t<max){await sleep(2000);t+=2000;
      const d=await pg.evaluate(()=>{const q=window.__mtDbg;return [q.mt3chunks,q.segs].join(',');});
      if(d===last&&!d.endsWith(',0')){if(++same>=3)return t;}else{same=0;last=d;}}return t;};
  if(dig.length){const r=await pg.evaluate((cs)=>{let dug=0,bad=0;
    for(const [i,j] of cs){const isR=window.__mtIsRock(i,j);
      const edge=[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>window.__mtIsRock(i+a,j+b)===false);
      if(!isR||!edge){bad++;continue;} window.__mtDestroy([[i,j]]); dug++;}
    return {dug,bad};},dig);
    console.log(`  삽질 ${r.dug} · 위반 ${r.bad}`);}
  await settle();
  const rows=[];
  for(const clip of (process.env.CLIPS||'1').split(',').map(Number))
  for(const zoff of (process.env.ZOFFS||'500,0,32,64').split(',').map(Number)){
    for(const zsoft of (process.env.ZSOFTS||'0').split(',').map(Number)){
      await pg.evaluate((a)=>{window.__mtFadeZOff(a[0]);window.__mtFadeZSoft(a[1]);window.__mtFadeClip(a[2]);},[zoff,zsoft,clip]);
      await sleep(3000);
      const d=await pg.evaluate(()=>window.__mtOccDbg);
      const r=await pg.evaluate(()=>{window.__mt3Rects(true);return 1;}); await sleep(900);
      const rc=await pg.evaluate(()=>{const q=window.__mt3RectsGet()||[];
        const fz=window.__mtOccDbg.fz;
        const f=q.filter(a=>a.z>fz), b=q.filter(a=>a.z<=fz);
        return {front:f.length, frontFaded:f.filter(a=>a.faded).length, back:b.length, backFaded:b.filter(a=>a.faded).length};});
      await pg.evaluate(()=>window.__mt3Rects(false));
      await pg.screenshot({path:path.join(OUT,`Z_${zoff}_s${zsoft}_c${clip}.png`)});
      rows.push({clip,zoff,zsoft,n:d.n,fade:d.fade,line:d.lineY,...rc});
      console.log(`  가로줄 ${clip} · 오프셋 ${String(zoff).padStart(3)} · 줄 y=${d.lineY} → 가림 ${d.n} · 알파 ${d.fade} · 앞 ${rc.front}(흐림 ${rc.frontFaded}) · 뒤 ${rc.back}(흐림 ${rc.backFaded})`);
    }
  }
  // 성능 짝 — 옛 명세(500)와 채택값(32)을 번갈아 5회. 흐림 대상이 늘면 느려질 수 있다.
  if(process.env.PERF){
    const MED=`(ms)=>new Promise(res=>{const a=[];let l=performance.now();const t0=l;
      const st=()=>{const n=performance.now();a.push(n-l);l=n;
        if(n-t0<ms)requestAnimationFrame(st);else{const s2=a.slice().sort((x,y)=>x-y);res(+s2[s2.length>>1].toFixed(2));}};requestAnimationFrame(st);})`;
    const prof={500:[],32:[]};
    for(let k=0;k<5;k++)for(const z of [500,32]){
      await pg.evaluate(v=>window.__mtFadeZOff(v),z); await sleep(1500);
      prof[z].push(await pg.evaluate('('+MED+')(2200)'));
    }
    const st2=(a)=>{const n=a.length,m=a.reduce((x,y)=>x+y,0)/n;
      const sd=Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/Math.max(1,n-1));return {m,sd,se:sd/Math.sqrt(n),n};};
    const A=st2(prof[500]),B=st2(prof[32]),dse=Math.hypot(A.se,B.se),diff=B.m-A.m;
    console.log(`  성능 짝 — 옛(500) ${A.m.toFixed(2)}±${A.sd.toFixed(2)} (SE ${A.se.toFixed(2)}) · 새(32) ${B.m.toFixed(2)}±${B.sd.toFixed(2)}ms (SE ${B.se.toFixed(2)})`);
    console.log(`            차 ${diff>=0?'+':''}${diff.toFixed(2)}ms · 2σ ${(2*dse).toFixed(2)} → ${Math.abs(diff)>2*dse?'유의':'잡음'}`);
  }
  await pg.evaluate(()=>{window.__mtFadeZOff(32);window.__mtFadeZSoft(0);});
  fs.writeFileSync(path.join(OUT,'rows.json'),JSON.stringify({scene:SCENE,site,rows},null,1));
  console.log('저장:',OUT);
  await br.close(); die(0);
})().catch(e=>{console.error(e);die(1);});
