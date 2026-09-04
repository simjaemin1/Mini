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
  for(const sel of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(18000);
  console.log('__mtDbg =', JSON.stringify(await pg.evaluate(()=>window.__mtDbg)));
  const REP = +(process.env.REP || 3);
  const avg=(z)=>z.reduce((x,y)=>x+y,0)/z.length;
  const sd=(z)=>{const m=avg(z);return Math.sqrt(z.reduce((x,y)=>x+(y-m)*(y-m),0)/z.length);};
  const pair = async (label, on1, off1, rep) => {
    const R = rep || REP, on=[],off=[];
    for (let r=0;r<R;r++){
      await pg.evaluate(on1); await sleep(1000); on.push((await pg.evaluate(`(${M})(2000)`)).med);
      await pg.evaluate(off1); await sleep(1000); off.push((await pg.evaluate(`(${M})(2000)`)).med);
    }
    const d=avg(on)-avg(off), se=Math.sqrt((sd(on)**2+sd(off)**2)/R);
    console.log(`${label.padEnd(24)} 켬 ${avg(on).toFixed(1)}  끔 ${avg(off).toFixed(1)}  ★${d.toFixed(1)}ms (SE ${se.toFixed(1)}) ${Math.abs(d)>2*se?'유의':'잡음'}`);
    return {d,se};
  };
  if (!process.env.ONLYKNOBS) {
  // ── 그림 짝 (item 5): 정수 어긋남이 화법을 바꿨나 ─────────────────────────
  await pg.evaluate(()=>{window.__terrain19.windGrassOff=false;window.__terrain19.windForce=1;window.__terrain19.freezeT=0.30;});
  await sleep(1800);
  await pg.evaluate(()=>window.__gtFrac(true));  await sleep(1200); await pg.screenshot({path:'/tmp/sway_frac.png'});
  await pg.evaluate(()=>window.__gtFrac(false)); await sleep(1200); await pg.screenshot({path:'/tmp/sway_int.png'});
  await pg.evaluate(()=>{window.__terrain19.freezeT=null;window.__terrain19.windForce=null;});
  console.log('그림 짝 저장: /tmp/sway_frac.png · /tmp/sway_int.png');

  // ── item 1 판정: 흔들림 비용 ────────────────────────────────────────────
  console.log('\n[흔들림]');
  await pair('정수 어긋남(채택)', ()=>{window.__gtFrac(false);window.__terrain19.windForce=1;},
                                  ()=>{window.__gtFrac(false);window.__terrain19.windForce=0;}, 5);
  await pair('소수 어긋남(옛판)', ()=>{window.__gtFrac(true);window.__terrain19.windForce=1;},
                                  ()=>{window.__gtFrac(true);window.__terrain19.windForce=0;}, 5);
  await pg.evaluate(()=>{window.__gtFrac(false);window.__terrain19.windForce=null;});

  }
  // ── item 3: 남은 바닥값 분해 ────────────────────────────────────────────
  console.log('\n[남은 바닥값 — 손잡이별 짝 비교]');
  const KN = ['mtOff','natOff','waterOff','propOff','prismOff','fringeOff','stateOff','shoreOff','wxOff','decoOff'];
  const tab = [];
  for (const k of KN) {
    // ★함수를 넘기면 클로저 변수(k)가 페이지로 안 간다 — 문자열로 평가한다(실제로 여기서 터졌다).
    const r = await pair(k, `window.__terrain19.${k}=false`, `window.__terrain19.${k}=true`, 3);
    tab.push({k, d:r.d, se:r.se});
    await pg.evaluate(`window.__terrain19.${k}=false`); await sleep(600);
  }
  tab.sort((x,y)=>y.d-x.d);
  console.log('\n★비용 큰 순: ' + tab.map(t=>`${t.k} ${t.d.toFixed(1)}±${t.se.toFixed(1)}`).join(' · '));
  const base = await pg.evaluate(`(${M})(3000)`);
  console.log(`전부 켠 기준선 med ${base.med} p95 ${base.p95} (60fps=16.7ms)`);
  await br.close();for(const p of procs){try{p.kill();}catch(e){}}process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
