#!/usr/bin/env node
// 3D 산 라이브 스모크 — 진짜 게임을 띄워 "3D 로 그려지고 있나"를 정본 훅으로 확인한다.
//   ★자명 통과 금지: mt3dOff 로 끈 판과 **픽셀 차이**가 나야 한다. 안 나면 안 켜진 것이다.
const path=require('path'),fs=require('fs');const {spawn}=require('child_process');const {PNG}=require('pngjs');
const ROOT=path.join(__dirname,'..'),CPORT=3010,ZPORT=3020;
const SITE={cx:+process.env.CX||1914,cy:+process.env.CY||202};
const sleep=(m)=>new Promise(r=>setTimeout(r,m));const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
fs.writeFileSync('/tmp/zw-s3.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
(async()=>{
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2500);
  boot('/tmp/zw-s3.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/s3.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'1',ENABLE_BANDITS:'0',WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:SITE.cx*32+16,y:SITE.cy*32+16,name:'산'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(4000);
  const {chromium}=require('playwright');const br=await chromium.launch({headless:true});
  const pg=await(await br.newContext({viewport:{width:1400,height:900}})).newPage();
  const errs=[]; pg.on('pageerror',(e)=>errs.push(String(e.message).slice(0,200)));
  pg.on('console',(m)=>{const t=m.text(); if(/mt3d|\[mt\]/.test(t)) console.log('  '+t.slice(0,160));});
  await pg.goto(`http://localhost:${CPORT}/`);await sleep(2500);
  for(const sel of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(26000);
  const d=await pg.evaluate(()=>window.__mtDbg);
  console.log('\n__mtDbg =', JSON.stringify(d));
  await pg.screenshot({path:'/tmp/smoke_on.png'});
  await pg.evaluate(()=>{window.__terrain19.mt3dOff=true;});await sleep(2500);
  await pg.screenshot({path:'/tmp/smoke_off.png'});
  const A=PNG.sync.read(fs.readFileSync('/tmp/smoke_on.png')),B=PNG.sync.read(fs.readFileSync('/tmp/smoke_off.png'));
  let diff=0,tot=0;
  for(let y=0;y<A.height;y+=2)for(let x=0;x<A.width;x+=2){const i=(y*A.width+x)*4;tot++;
    if((Math.abs(A.data[i]-B.data[i])+Math.abs(A.data[i+1]-B.data[i+1])+Math.abs(A.data[i+2]-B.data[i+2]))/3>8)diff++;}
  let fail=0;
  const J=(ok,m)=>{if(!ok)fail++;console.log((ok?'✓ ':'✗ ')+m);};
  console.log('');
  J(!!d&&d.mt3d===true,`3D 가 켜져 있다 (mt3d=${d&&d.mt3d})`);
  J(!!d&&!d.mt3fail,`되돌아가기(폴백)가 발동하지 않았다 (mt3fail=${d&&d.mt3fail})`);
  J(!!d&&d.mt3chunks>0,`3D 청크가 구워졌다 (${d&&d.mt3chunks}개)`);
  J(!!d&&d.segs>0,`세그먼트가 실제로 그려졌다 (${d&&d.segs})`);
  J(diff/tot*100>3,`3D 를 끄면 화면이 바뀐다 — 차이 ${(diff/tot*100).toFixed(1)}% > 3% (자명 통과 방지)`);
  J(errs.length===0,`페이지 오류 없음 ${errs.length?JSON.stringify(errs.slice(0,2)):''}`);
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}
  console.log(fail?`\n✗ 실패 ${fail}건`:'\n전부 통과');
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
