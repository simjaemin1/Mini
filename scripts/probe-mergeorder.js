#!/usr/bin/env node
// 병합 켬/끔 차이(슬리버)의 원인 가르기 — **띠 여백(MPAD)** 을 키우면 줄어드나.
//   가설: 띠별 판은 조각의 벌어짐이 **띠 캔버스 가장자리에서 잘린다**. 병합 판은 안 잘린다.
//   그렇다면 여백을 키워 잘림을 없애면 두 판이 같아져야 한다.
'use strict';
const path=require('path'), fs=require('fs');
const { spawn }=require('child_process'); const { PNG }=require('pngjs');
const ROOT=path.join(__dirname,'..'), CPORT=3010, ZPORT=3020;
const sleep=(m)=>new Promise(r=>setTimeout(r,m)); const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
const die=(c)=>{for(const p of procs){try{p.kill();}catch(e){}}process.exit(c);};
const T=require(path.join(ROOT,'server','terrain.js'));
const rock=(i,j)=>T.isRockCellLocal('hanbando',i*32+16,j*32+16);
function deepSite(){const I0=1740,J0=0,W=520,H=720,R=new Uint8Array(W*H);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++)R[j*W+i]=rock(I0+i,J0+j)?1:0;
  const d=new Float32Array(W*H);for(let k=0;k<W*H;k++)d[k]=R[k]?1e6:0;
  const at=(i,j)=>(i<0||j<0||i>=W||j>=H)?0:d[j*W+i];
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=j*W+i;if(!d[k])continue;
    d[k]=Math.min(d[k],at(i-1,j)+1,at(i,j-1)+1,at(i-1,j-1)+1.414,at(i+1,j-1)+1.414);}
  for(let j=H-1;j>=0;j--)for(let i=W-1;i>=0;i--){const k=j*W+i;if(!d[k])continue;
    d[k]=Math.min(d[k],at(i+1,j)+1,at(i,j+1)+1,at(i+1,j+1)+1.414,at(i-1,j+1)+1.414);}
  let b=0,bi=0,bj=0;for(let j=60;j<H-60;j++)for(let i=60;i<W-60;i++){const v=d[j*W+i];if(v<1e5&&v>b){b=v;bi=I0+i;bj=J0+j;}}
  return {i:bi,j:bj};}
const inHUD=(x,y,W,H)=>(y<150&&x<420)||(x>1000&&y<290)||(y>H-40);
const diffN=(a,b)=>{let n=0;for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
  if(inHUD(x,y,a.width,a.height))continue;const k=(y*a.width+x)*4;
  if(Math.abs(a.data[k]-b.data[k])+Math.abs(a.data[k+1]-b.data[k+1])+Math.abs(a.data[k+2]-b.data[k+2])>3)n++;}return n;};
(async()=>{
  const st=deepSite();
  fs.writeFileSync('/tmp/zw-mo.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-mo.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/mo.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:st.i*32+16,y:st.j*32+16,name:'순서'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');
  const br=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for(const s2 of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(s2);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windOff=true;
                        window.__terrain19.natOff=true;window.__terrain19.occOff=true;window.__mt3trees(0);});
  const settle=async(max=180000)=>{let last='',same=0,t=0;
    while(t<max){await sleep(2000);t+=2000;
      const d=await pg.evaluate(()=>{const q=window.__mtDbg;return [q.mt3chunks,q.segs].join(',');});
      if(d===last&&!d.endsWith(',0')){if(++same>=3)return t;}else{same=0;last=d;}}return t;};
  const grab=async(n)=>{const p2='/tmp/mo-'+n+'.png';await pg.screenshot({path:p2});return PNG.sync.read(fs.readFileSync(p2));};
  // 앵커 z 를 뒤집어 본다 — 차이가 **달라지면** 원인은 병합 판의 z 알갱이(순서)다.
  await pg.evaluate(()=>window.__mt3merge(0)); await settle(); const off1=await grab('off');
  await pg.evaluate(()=>window.__mt3merge(0)); await settle(); const off2=await grab('off2');
  console.log(`  재현 바닥 ${diffN(off1,off2)}`);
  for(const mz of [1,0]){
    await pg.evaluate(v=>window.__mt3mergez(v),mz);
    await pg.evaluate(()=>window.__mt3merge(1)); await settle(); const on1=await grab('on'+mz);
    await pg.evaluate(()=>window.__mt3merge(0)); await settle();
    console.log(`  앵커 ${mz?'가장 큰 k':'가장 작은 k'} → 병합 켬/끔 차이 **${diffN(off1,on1)}**`);
  }
  await pg.evaluate(()=>{window.__mt3mergez(1);window.__mt3trees(0.020);});
  await br.close(); die(0);
})().catch(e=>{console.error(e);die(1);});
