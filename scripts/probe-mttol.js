const path=require('path'),fs=require('fs');const {spawn}=require('child_process');const {PNG}=require('pngjs');
const ROOT=path.join(__dirname,'..'),CPORT=3010,ZPORT=3020;
const SITE={cx:+process.env.CX||1750,cy:+process.env.CY||74};
const sleep=(m)=>new Promise(r=>setTimeout(r,m));const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
fs.writeFileSync('/tmp/zw-tol.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
function changedPct(a,b,box){const[x0,y0,x1,y1]=box;let n=0,t=0;
  for(let y=Math.max(0,y0);y<Math.min(a.height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(a.width,x1);x++){
    const i=(y*a.width+x)*4;t++;const d=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);
    if(d/3>8)n++;}return t?n/t*100:0;}
(async()=>{
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2500);
  boot('/tmp/zw-tol.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/tol.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'1',ENABLE_BANDITS:'0',WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:SITE.cx*32+16,y:SITE.cy*32+16,name:'산'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(4000);
  const {chromium}=require('playwright');const br=await chromium.launch({headless:true});
  const pg=await(await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',(e)=>console.log('[err]',String(e.message).slice(0,200)));
  await pg.goto(`http://localhost:${CPORT}/`);await sleep(2500);
  for(const sel of ['#startBtn','button:has-text("시작")','button:has-text("입장")','text=게스트']){try{const b=await pg.$(sel);if(b){await b.click();break;}}catch(e){}}
  await sleep(24000);
  const shot=async(n)=>{const p2=`/tmp/tol-${n}.png`;await pg.screenshot({path:p2});return PNG.sync.read(fs.readFileSync(p2));};
  await pg.evaluate(async()=>{window.__anForProbe=await (await fetch('/assets/mountains/mountain_anchors.json')).json();});
  const cam=await pg.evaluate(()=>window.__camCellLocal());
  const cells=[];for(let dx=-22;dx<=22;dx++)for(let dy=-22;dy<=22;dy++)cells.push([cam[0]+dx,cam[1]+dy]);
  const info=await pg.evaluate((cs)=>cs.map(([a,b])=>{const k=window.__tileStateAt(a,b);const s=window.__cellScreen(a,b);
    return{a,b,kind:k.kind,x:s.x,y:s.y};}),cells);
  const onScr=(v)=>v.x>90&&v.x<1310&&v.y>290&&v.y<830;
  const rocks=info.filter(v=>v.kind==='rock'&&onScr(v)), land=info.filter(v=>v.kind!=='rock'&&v.kind!=='water'&&onScr(v));
  const boxOf=(r)=>[Math.round(r.x-26),Math.round(r.y-12),Math.round(r.x+26),Math.round(r.y+12)];
  console.log(`\n바위 ${rocks.length}셀 · 뭍 ${land.length}셀\n`);
  // ★[재민 결정 2026-08-08] "가림이 사라진 건 여유 2.0 의 대가가 아니다 → 여유를 재조정".
  //   그래서 이 표에 **가림 발생 자리 수**를 같이 낸다. 침범 ②만 보고 고르면
  //   e2e-mtocc 가 다시 죽는다. 두 곡선을 나란히 놓고 **둘 다 사는 값**을 고른다.
  //   가림 판정은 클라의 `__mtOccAt`(정본 `_mtOccludesMe` 를 그대로 부른다) — 사본 금지.
  console.log('여유  ①갈색   ②침범   가림자리  앞선산  몸통도달  셀당   배율중앙  계층');
  const TOLS=(process.env.TOLS||'2.0,2.4,2.8,3.2,3.6,4.0').split(',').map(Number);
  for(const tol of TOLS){
    await pg.evaluate((v)=>window.__mtSetTol(v),tol); await sleep(1800);
    const on=await shot('on');
    await pg.evaluate(()=>{window.__terrain19.mtOff=true;}); await sleep(1500);
    const off=await shot('off');
    await pg.evaluate(()=>{window.__terrain19.mtOff=false;}); await sleep(1500);
    let bare=0,spill=0;
    for(const r of rocks) if(changedPct(on,off,boxOf(r))<5) bare++;
    for(const r of land) if(changedPct(on,off,boxOf(r))>=25) spill++;
    // 가림 — 화면 안 **뭍** 셀마다 "거기 서면 산이 나를 가리나"를 물어본다.
    const occ=await pg.evaluate((ls)=>{
      let sites=0,best=0,front=0;
      for(const v of ls){const r=window.__mtOccAt(v.a*32+16,v.b*32+16);
        if(!r)continue; if(r.n>0)sites++; if(r.n>best)best=r.n; if(r.front>front)front=r.front;}
      // ★가림이 성립하려면 산 **몸통이 플레이어까지 닿아야** 한다.
      //   플레이어 z 에는 +500 편향이 있다(계단 렌더 때부터). 그래서 나를 덮으려면
      //   산 앵커가 화면에서 **500px 아래**에 있어야 하고, 그 산의 몸통이 그만큼
      //   위로 뻗어야 한다 = an.oy · sc · vy > 500px.  이 수를 같이 낸다.
      //   ※ 이 reach 는 **판정이 아니라 설명**이다. 판정은 위의 sites(정본 `_mtOccludesMe`)다.
      const AN=window.__anForProbe||{};
      let reach=0, n=0;
      for(const sg of (window.__mtProbe()||[])){
        const an=AN[sg.name]; if(!an)continue;
        const sc=(64/Math.SQRT2)/an.ppu*sg.sc, r2=an.oy*sc*(sg.vy||1);
        if(r2>reach)reach=r2; n++;
      }
      return{sites,best,front,reach:Math.round(reach),n};},land);
    const g=await pg.evaluate((c)=>{
      const segs=(window.__mtProbe()||[]).filter(x=>Math.abs(x.lcx-c[0])<=18&&Math.abs(x.lcy-c[1])<=18);
      let rock=0;for(let dx=-18;dx<=18;dx++)for(let dy=-18;dy<=18;dy++)
        if(window.__tileStateAt(c[0]+dx,c[1]+dy).kind==='rock')rock++;
      const sc=segs.map(x=>x.sc).sort((a,b)=>a-b);const t={};for(const x of segs)t[x.ridge]=(t[x.ridge]||0)+1;
      return{n:segs.length,rock,med:sc.length?+sc[sc.length>>1].toFixed(2):0,
        min:sc.filter(v=>v<=0.29).length,t};},cam);
    console.log(`${String(tol).padStart(4)}  ${(bare/rocks.length*100).toFixed(1).padStart(5)}%  ${(spill/land.length*100).toFixed(1).padStart(5)}%  ${String(occ.sites).padStart(7)}  ${String(occ.front).padStart(5)}  ${String(occ.reach+'px').padStart(7)}  ${(g.n/g.rock).toFixed(2).padStart(5)}  ${String(g.med).padStart(6)}  ${String(Math.round(g.min/g.n*100)+'%').padStart(6)}  ${JSON.stringify(g.t)}`);
    fs.copyFileSync('/tmp/tol-on.png',`/tmp/tol-${tol}.png`);
  }
  await br.close(); for(const p of procs){try{p.kill();}catch(e){}} process.exit(0);
})().catch(e=>{console.error(e);for(const p of procs){try{p.kill();}catch(_){}}process.exit(1);});
