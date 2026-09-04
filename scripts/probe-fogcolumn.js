// =============================================================================
// probe-fogcolumn — "지면 타일이 안 그려진 셀 기둥"(재민 ⑦)의 원인 특정 프로브.
//   CX/CY 로 카메라 셀을 주고, 검은 화소가 **캔버스 배경**인지 **미탐사 안개**인지 가른다.
//   ★대조군 둘: ⑴ 검은 셀은 _seenChunks 에 없고, 보이는 셀은 있다  ⑵ 두 칸 걸으면 사라진다.
// 사용: CX=1909 CY=172 node scripts/probe-fogcolumn.js
// =============================================================================
'use strict';
const path=require('path'), fs=require('fs');
const { spawn }=require('child_process');
const path0=require('path');const ROOT=path0.join(__dirname,'..'), CPORT=3010, ZPORT=3020;
const OUT='/tmp/gcol'; fs.mkdirSync(OUT,{recursive:true});
const sleep=(m)=>new Promise(r=>setTimeout(r,m)); const procs=[];
function boot(f,env){const p=spawn('node',[f],{env:{...process.env,...env},stdio:['ignore','pipe','pipe'],cwd:ROOT});procs.push(p);return p;}
async function waitHttp(u,n=600){for(let i=0;i<n;i++){try{const r=await fetch(u);if(r.ok)return true;}catch(e){}await sleep(1000);}return false;}
const die=(c)=>{for(const p of procs){try{p.kill();}catch(e){}}process.exit(c);};
const CX=+(process.env.CX||1909), CY=+(process.env.CY||172);
(async()=>{
  fs.writeFileSync('/tmp/zw-gc.js',`const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT,'server','central.js'),{PORT:''+CPORT,PUBLIC_HOST:'localhost',ENABLED_ZONES:'hanbando'});
  await sleep(2000);
  boot('/tmp/zw-gc.js',{PORT:''+ZPORT,ZONE_ID:'hanbando',DB_PATH:'/tmp/gc.db',CENTRAL_URL:`http://localhost:${CPORT}`,
    ENABLE_VILLAGES:'0',ENABLE_BANDITS:'0',
    WRAP_ZONE_PATCH:JSON.stringify({mainSquare:{x:CX*32+16,y:CY*32+16,name:'기둥'}})});
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const {chromium}=require('playwright');
  const br=await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
  const pg=await (await br.newContext({viewport:{width:1400,height:900}})).newPage();
  pg.on('pageerror',e=>console.log('[err]',String(e.message).slice(0,140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for(const s of ['#enter'] /* ★[T84] 로비 버튼은 **id**로 집는다 — 옛 사다리 네 칸 중 셋은 화면에 없고(#startBtn·"시작"·게스트) "입장"만 물었다 — 그 라벨이 바뀌자 네 칸 전부 죽는다 */){try{const b=await pg.$(s);if(b){await b.click();break;}}catch(e){}}
  await sleep(20000);
  await pg.evaluate(()=>{window.__terrain19.freezeT=0.30;window.__terrain19.windOff=true;});
  await sleep(6000);
  await pg.screenshot({path:path.join(OUT,'A.png')});
  await sleep(8000);
  await pg.screenshot({path:path.join(OUT,'B.png')});
  // 검은 기둥의 셀들이 **'본 셀'로 기록됐나** — 안개 정본 자료(_seenChunks)를 직접 본다
  const probe = await pg.evaluate(()=>{
    const cv=document.querySelector('canvas'), g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data;
    const me=window.__getMyAbs(); const pts=[];
    for(let y=160;y<cv.height-60;y+=3) for(let x=60;x<cv.width-30;x+=3){
      if((x>1000&&y<290)||(y>cv.height-50)) continue;
      const k=(y*cv.width+x)*4;
      if(d[k]<6&&d[k+1]<6&&d[k+2]<6) pts.push([x,y]);
    }
    // 화면점 → h=0 셀 (지면 타일이라 역변환이 정당하다)
    const w2=(a,b)=>({x:a-b,y:(a+b)/2}); const C=w2(me.x,me.y);
    const cellOf=(sx,sy)=>{ const ix=C.x+(sx-cv.width/2), iy=C.y+(sy-cv.height/2);
      const wx=iy+ix/2, wy=iy-ix/2; return [Math.floor(wx/32), Math.floor(wy/32)]; };
    const sc=window._seenChunks; const seenOf=(cx,cy)=>{ if(!sc) return null;
      const s2=sc.get((cx>>4)+'_'+(cy>>4)); return !!(s2&&s2.has(cx*65536+cy)); };
    const samp=[]; const seen0=[];
    for(let i=0;i<pts.length && samp.length<8;i+=Math.max(1,Math.floor(pts.length/8))){
      const [x,y]=pts[i]; const c=cellOf(x,y); samp.push({x,y,c,seen:seenOf(c[0],c[1])}); }
    // 대조군 — 검지 않은(=보이는) 점들은 seen 이어야 한다
    for(let k=0;k<6;k++){ const x=200+k*150, y=700; const c=cellOf(x,y);
      const kk=(y*cv.width+x)*4; seen0.push({x,y,rgb:[d[kk],d[kk+1],d[kk+2]],seen:seenOf(c[0],c[1])}); }
    // 근처 나무
    // 나무 그림자인가 — 나를 원점으로 각도를 재서, 검은 셀 방향에 나무가 끼어 있나 본다
    let trees=[];
    try{ const zid=window.__zoneId||null; }catch(e){}
    const conns=window.__connsDbg||null;
    return { black: pts.length, samp, seen0, me:[Math.floor(me.x/32),Math.floor(me.y/32)], meAbs:[me.x,me.y] };
  });
  console.log('검은 화소', probe.black, '· 나=', probe.me);
  for(const s2 of probe.samp) console.log('  검정 (',s2.x,',',s2.y,') → 셀',s2.c,' 본셀?',s2.seen);
  for(const s2 of probe.seen0) console.log('  대조 (',s2.x,',',s2.y,') rgb',s2.rgb,' 본셀?',s2.seen);
  // ★대조군 — 두 칸 걸어 본다. '미탐사'가 **지면에 붙어 있으면** 화면에서 같이 밀리고,
  //   **나를 원점으로 한 시야 그림자**면 모양이 바뀐다(나무를 중심으로 회전).
  const before = await pg.evaluate(()=>{ const cv=document.querySelector('canvas'), g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data; let n=0;
    for(let y=560;y<820;y+=2) for(let x=620;x<880;x+=2){ const k=(y*cv.width+x)*4;
      if(d[k]<6&&d[k+1]<6&&d[k+2]<6) n++; } return n; });
  for(let s2=0;s2<2;s2++){ await pg.keyboard.down('a'); await sleep(700); await pg.keyboard.up('a'); await sleep(400); }
  await sleep(3000);
  await pg.screenshot({path:path.join(OUT,'C-두칸이동.png')});
  const after = await pg.evaluate(()=>{ const cv=document.querySelector('canvas'), g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data; let n=0;
    for(let y=560;y<820;y+=2) for(let x=620;x<880;x+=2){ const k=(y*cv.width+x)*4;
      if(d[k]<6&&d[k+1]<6&&d[k+2]<6) n++; } return n; });
  console.log('상자 안 검은 화소 — 이동 전', before, '→ 이동 후', after);
  const bg = await pg.evaluate(()=>{ const c=document.querySelector('canvas');
    return { css: getComputedStyle(c).backgroundColor, body: getComputedStyle(document.body).backgroundColor,
             me: window.__getMyAbs(), dbg: window.__mtDbg && window.__mtDbg.chunks }; });
  console.log('배경', JSON.stringify(bg));
  await br.close(); die(0);
})().catch(e=>{console.error(e);die(1);});
