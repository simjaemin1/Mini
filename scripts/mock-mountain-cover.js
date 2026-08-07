#!/usr/bin/env node
// =============================================================================
// 시안 — 산 '덮개' 배치 [재민 2026-08-07: "갈색 타일이 보이면 안 될 정도로 산이 덮어야지"]
//
// ★★이 시안은 **1:1(게임 배율)** 로 그린다. 기존 `mock-mountain.js` 는 `scale=0.22` 로
//   장면을 4.5배 축소해 보여줬고, 그래서 5~6배로 부푼 스프라이트가 실물처럼 보였다.
//   시안 왕복 12차가 전부 그 배율에서 이뤄졌다 — 게임이 쓰지 않는 배율로 디자인을 판정한 것이다.
//   여기서는 게임과 같은 1 iso px = 1 화면 px 로만 그린다.
//
// A(현행) : 능선 중심선을 걸으며 밴드 폭만큼 스프라이트 **한 장을 확대**(배율 중앙값 5.8)
// B(덮개) : 바위 **셀 집합을 격자로 덮는다**. 배율 1 근처 × 여러 장. 구조적으로 빈틈이 없다.
//
// ★시안이 제 숫자를 들고 나온다 — 산 레이어만 투명 캔버스에 그린 뒤 바위 셀마다 알파를 찍어
//   **맨 바위 셀 %** 를 직접 센다. 눈이 아니라 수로 비교한다(라이브 실측은 70.9%).
//
// 산출: /tmp/mtcover-A.png · /tmp/mtcover-B.png (각 1400×900 = 게임 뷰포트) · 콘솔에 덮개율
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const MT = path.join(__dirname, 'mountain_renders');
const HARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const RIDGES = HARD.ridges;

// 장면 — 한울대간의 가장 굽은 데(기존 시안과 같은 자리)
const main = RIDGES[0].path;
let bestI = 60, bestTurn = 0;
for (let i = 30; i < Math.min(main.length - 30, 400); i += 5) {
  const a = main[i - 25].pos, b = main[i].pos, c = main[i + 25].pos;
  const v1 = Math.atan2(b[1] - a[1], b[0] - a[0]), v2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(v2 - v1); if (d > Math.PI) d = 2 * Math.PI - d;
  if (d > bestTurn) { bestTurn = d; bestI = i; }
}
const CTR = main[bestI].pos;
const SC_W = 80, SC_H = 56;
const scene = { cx0: Math.floor(CTR[0] / 32) - 40, cy0: Math.floor(CTR[1] / 32) - 28, w: SC_W, h: SC_H };
{
  const cells = [];
  for (let cy = 0; cy < SC_H; cy++) {
    const row = [];
    for (let cx = 0; cx < SC_W; cx++) {
      const x = (scene.cx0 + cx) * 32 + 16, y = (scene.cy0 + cy) * 32 + 16;
      row.push(T.isWaterCellLocal('hanbando', x, y) ? 1 : (T.isRockCellLocal('hanbando', x, y) ? 2 : 0));
    }
    cells.push(row);
  }
  scene.cells = cells;
}
let nRock = 0; for (const r of scene.cells) for (const v of r) if (v === 2) nRock++;
console.log(`장면 ${SC_W}×${SC_H}셀 · 바위 셀 ${nRock} (${(nRock / (SC_W * SC_H) * 100).toFixed(1)}%)`);

function scenePaths() {
  const x0 = scene.cx0 * 32, y0 = scene.cy0 * 32, x1 = x0 + scene.w * 32, y1 = y0 + scene.h * 32;
  const out = [];
  for (const r of RIDGES) {
    let cur = null;
    for (const pt of r.path) {
      const inBox = pt.pos[0] > x0 - 2200 && pt.pos[0] < x1 + 2200 && pt.pos[1] > y0 - 2200 && pt.pos[1] < y1 + 2200;
      if (inBox) { if (!cur) { cur = { name: r.name, pts: [] }; out.push(cur); } cur.pts.push({ x: pt.pos[0] - x0, y: pt.pos[1] - y0, w: pt.width }); }
      else cur = null;
    }
  }
  return out.filter((p) => p.pts.length >= 2);
}
const PATHS = scenePaths();
console.log('장면 내 능선:', PATHS.map((p) => p.name + '(' + p.pts.length + ')').join(' '));

const AN = JSON.parse(fs.readFileSync(path.join(MT, 'mountain_anchors.json'), 'utf8'));
function b64(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
const A = { grassA: b64(path.join(ROOT, 'public/assets/terrain/grass_angled.png')) };
for (const k of Object.keys(AN)) A[k] = b64(path.join(MT, k + '.png'));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0a0d10;margin:0}canvas{display:block}</style></head><body><script>
const S=${JSON.stringify(scene)}, PATHS=${JSON.stringify(PATHS)}, AN=${JSON.stringify(AN)}, A=${JSON.stringify(A)};
const CELL=32,HALF=16,PPU_SCR=64/Math.SQRT2, CROSS_U=10.1, ALONG_U=4.8;
const ROCKR=new Set(['한울대간','눈메']);
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};
const w2i=(wx,wy)=>({x:wx-wy,y:(wx+wy)/2});
const isRock=(cx,cy)=> cx>=0&&cy>=0&&cx<S.w&&cy<S.h&&S.cells[cy][cx]===2;

// ── A: 현행 — 능선 중심선 보행 + 밴드 폭만큼 한 장 확대 ─────────────────────
function placeA(){
  const segs=[];
  for(const P of PATHS){
    const pts=P.pts, cum=[0];
    for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
    const total=cum[cum.length-1];
    const at=(s)=>{let i=1;while(i<cum.length-1&&cum[i]<s)i++;const a=pts[i-1],b=pts[i],L=cum[i]-cum[i-1]||1,t=(s-cum[i-1])/L;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,ang:Math.atan2(b.y-a.y,b.x-a.x)};};
    const band=(px,py,ang)=>{const nx=-Math.sin(ang),ny=Math.cos(ang);
      const R=(wx,wy)=>isRock(Math.floor(wx/CELL),Math.floor(wy/CELL));
      if(!R(px,py))return{n:0,off:0};let a=0,b=0;
      for(let k=1;k<=30;k++){if(R(px+nx*k*CELL,py+ny*k*CELL))a=k;else break;}
      for(let k=1;k<=30;k++){if(R(px-nx*k*CELL,py-ny*k*CELL))b=k;else break;}
      return{n:a+b+1,off:(a-b)/2};};
    const placed=[];
    for(let s=0;s<total;){const p0=at(s);const bc=band(p0.x,p0.y,p0.ang);
      const sc=Math.max(0.6,bc.n/CROSS_U*0.96);
      placed.push({ang:p0.ang,sc,dead:bc.n<2,x:p0.x+bc.off*CELL*-Math.sin(p0.ang),y:p0.y+bc.off*CELL*Math.cos(p0.ang)});
      s+=Math.max(40,ALONG_U*CELL*sc*0.55);}
    const isF=!ROCKR.has(P.name);
    for(let i=0;i<placed.length;i++){const p=placed[i];if(p.dead)continue;
      let deg=(p.ang*180/Math.PI)%180;if(deg<0)deg+=180;const oct=Math.round(deg/22.5)%8;
      const rx=Math.round(p.x),ry=Math.round(p.y);
      const v=isF?((hash(rx,ry,77)*2)|0):((hash(rx,ry,77)*3)|0);
      segs.push({x:p.x,y:p.y,name:(isF?'mt_F':'mt_G')+oct+'v'+v,sc:p.sc,vy:0.86+0.28*hash(rx,ry,78)});}
  }
  return segs;
}

// ── B: 덮개 — 바위 셀 집합을 격자로 덮는다 ──────────────────────────────────
//   ★능선 방향은 가장 가까운 능선 구간에서 가져온다(자리마다 달라야 아코디언이 안 생긴다).
//   ★격자 간격 STEP 은 스프라이트 발자국(≈CROSS_U 셀)보다 작게 — 겹쳐서 빈틈을 없앤다.
const STEP=3.2;
function nearestRidge(wx,wy){
  let best=1e18,ang=0,name=PATHS[0]?PATHS[0].name:'';
  for(const P of PATHS){const pts=P.pts;
    for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1;
      let t=((wx-a.x)*dx+(wy-a.y)*dy)/L2;t=t<0?0:(t>1?1:t);
      const qx=a.x+t*dx-wx,qy=a.y+t*dy-wy,d=qx*qx+qy*qy;
      if(d<best){best=d;ang=Math.atan2(dy,dx);name=P.name;}}}
  return {ang,name};
}
function placeB(){
  const segs=[];
  for(let gy=0;gy<S.h;gy+=STEP) for(let gx=0;gx<S.w;gx+=STEP){
    const j1=hash(Math.round(gx*7),Math.round(gy*7),301), j2=hash(Math.round(gx*7),Math.round(gy*7),302);
    const cx=Math.round(gx+(j1-0.5)*STEP*1.1), cy=Math.round(gy+(j2-0.5)*STEP*1.1);
    if(!isRock(cx,cy)) continue;
    const wx=cx*CELL+HALF, wy=cy*CELL+HALF;
    const nr=nearestRidge(wx,wy);
    let deg=(nr.ang*180/Math.PI)%180; if(deg<0)deg+=180;
    const oct=Math.round(deg/22.5)%8;
    const isF=!ROCKR.has(nr.name);
    const v=isF?((hash(cx,cy,77)*2)|0):((hash(cx,cy,77)*3)|0);
    // ★배율은 1 근처. 자리 해시로 흩어 같은 봉우리가 줄서지 않게.
    const sc=0.82+0.62*hash(cx,cy,311);
    segs.push({x:wx,y:wy,name:(isF?'mt_F':'mt_G')+oct+'v'+v,sc,vy:0.84+0.34*hash(cx,cy,78)});
  }
  return segs;
}

// ── C: 가장자리 거리 계층 ────────────────────────────────────────────────────
//   ★크기를 "능선 밴드 폭"이 아니라 **바위 덩어리 가장자리까지의 거리**로 정한다.
//     A 는 밴드 폭 하나를 스프라이트 한 장으로 받아 5~9배 확대(=뭉갬)를 만들었다.
//     여기선 밴드를 여러 장으로 나눠 덮고, 깊은 안쪽일수록 큰 봉우리를 세운다.
//     → 실루엣이 저절로 "높은 등성이 · 낮아지는 어깨 · 잔 자락"이 된다.
const DE=(function(){
  const INF=1e6,d=new Float32Array(S.w*S.h);
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++)d[y*S.w+x]=(S.cells[y][x]===2)?INF:0;
  const at=(x,y)=>(x<0||y<0||x>=S.w||y>=S.h)?INF:d[y*S.w+x];  // ★장면 밖은 가장자리가 아니다(창 테두리 가짜 자락 방지)
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){const i=y*S.w+x;if(d[i]===0)continue;
    d[i]=Math.min(d[i],at(x-1,y)+1,at(x,y-1)+1,at(x-1,y-1)+1.414,at(x+1,y-1)+1.414);}
  for(let y=S.h-1;y>=0;y--)for(let x=S.w-1;x>=0;x--){const i=y*S.w+x;if(d[i]===0)continue;
    d[i]=Math.min(d[i],at(x+1,y)+1,at(x,y+1)+1,at(x+1,y+1)+1.414,at(x-1,y+1)+1.414);}
  return d;})();
const edgeD=(cx,cy)=>(cx<0||cy<0||cx>=S.w||cy>=S.h)?0:DE[cy*S.w+cx];

// 발자국 ≈ CROSS_U*sc 셀. 격자 간격은 그 0.6배(겹쳐야 틈이 안 생긴다).
const TIERS=[
  {k:'L',minD: 9.0,step:13.0,s0:1.85,s1:2.50,solo:['mt_L1'],          sp:0.34,seed:411},
  {k:'M',minD: 3.5,step: 7.5,s0:1.18,s1:1.68,solo:['mt_M1','mt_M2'],  sp:0.32,seed:412},
  {k:'S',minD:-1.0,step: 4.2,s0:0.70,s1:1.00,solo:['mt_S1','mt_S2'],  sp:0.30,seed:413,maxD:5.0},
];
function pickName(cx,cy,ang,T){
  const h=hash(cx,cy,T.seed+7);
  if(h<T.sp) return T.solo[(hash(cx,cy,T.seed+8)*T.solo.length)|0];
  // ★능선 각도에 ±14° 해시 흔들림 — 직선 능선에서 같은 옥탄트가 줄서는 걸 끊는다
  const jit=(hash(cx,cy,T.seed+9)-0.5)*28*Math.PI/180;
  let deg=((ang+jit)*180/Math.PI)%180; if(deg<0)deg+=180;
  const oct=Math.round(deg/22.5)%8;
  const nr=nearestRidge(cx*CELL+HALF,cy*CELL+HALF);
  const isF=!ROCKR.has(nr.name);
  const v=isF?((hash(cx,cy,77)*2)|0):((hash(cx,cy,77)*3)|0);
  return (isF?'mt_F':'mt_G')+oct+'v'+v;
}
function placeC(){
  const segs=[];
  for(const T of TIERS){
    for(let gy=0;gy<S.h;gy+=T.step) for(let gx=0;gx<S.w;gx+=T.step){
      const j1=hash(Math.round(gx*13),Math.round(gy*13),T.seed), j2=hash(Math.round(gx*13),Math.round(gy*13),T.seed+1);
      const cx=Math.round(gx+(j1-0.5)*T.step*0.9), cy=Math.round(gy+(j2-0.5)*T.step*0.9);
      if(!isRock(cx,cy)) continue;
      const dE=edgeD(cx,cy);
      if(dE<T.minD) continue;
      if(T.maxD!=null&&dE>T.maxD) continue;
      const nr=nearestRidge(cx*CELL+HALF,cy*CELL+HALF);
      const sc=T.s0+(T.s1-T.s0)*hash(cx,cy,T.seed+2);
      segs.push({x:cx*CELL+HALF,y:cy*CELL+HALF,name:pickName(cx,cy,nr.ang,T),sc,
                 vy:0.86+0.30*hash(cx,cy,T.seed+3),tier:T.k});
    }
  }
  return segs;
}
// ★틈 메우기 — 눈이 아니라 알파로 찾는다. 남은 맨 바위 셀에 잔봉우리를 얹는다.
function gapFill(segs,rounds){
  let cur=segs.slice();
  for(let r=0;r<(rounds||2);r++){
    const bare=bareCells(cur);
    if(!bare.length) break;
    const seen=new Set(),add=[];
    for(const b of bare){                       // 3셀 격자로 묶어 한 곳에 한 장만
      const k=((b[0]/3)|0)+'_'+((b[1]/3)|0); if(seen.has(k))continue; seen.add(k);
      const nr=nearestRidge(b[0]*CELL+HALF,b[1]*CELL+HALF);
      add.push({x:b[0]*CELL+HALF,y:b[1]*CELL+HALF,
        name:pickName(b[0],b[1],nr.ang,TIERS[2]),sc:0.78+0.30*hash(b[0],b[1],515),
        vy:0.86+0.28*hash(b[0],b[1],516),tier:'gap'});
    }
    if(!add.length) break;
    cur=cur.concat(add);
  }
  return cur;
}

const imgs={};let pend=0;
for(const k in A){pend++;const im=new Image();im.onload=()=>{imgs[k]=im;if(--pend===0)go();};im.src=A[k];}

const tintCache={};
function tinted(name,v){const key=name+v;if(tintCache[key])return tintCache[key];
  const im=imgs[name];const t=document.createElement('canvas');t.width=im.width;t.height=im.height;
  const tg=t.getContext('2d');tg.drawImage(im,0,0);tg.globalCompositeOperation='source-atop';
  tg.fillStyle=v===0?'rgba(96,82,60,0.12)':'rgba(70,64,48,0.18)';tg.fillRect(0,0,t.width,t.height);
  tintCache[key]=t;return t;}

function drawSegs(g,segs){
  // ★z-정렬 — 뒤쪽(iso y 작은) 것부터. 안 하면 앞산이 뒷산에 가린다.
  segs.slice().sort((a,b)=>w2i(a.x,a.y).y-w2i(b.x,b.y).y).forEach((s)=>{
    const an=AN[s.name];if(!an)return;
    const im=tinted(s.name,(hash(Math.round(s.x),Math.round(s.y),91)<0.5)?0:1);
    const sc=PPU_SCR/an.ppu*s.sc, vy=s.vy||1, c=w2i(s.x,s.y);
    g.drawImage(im,c.x-an.ox*sc,c.y-an.oy*sc*vy,im.width*sc,im.height*sc*vy);
  });
}

// 덮개율 — 산 레이어만 투명 캔버스에 그리고 바위 셀 중심의 알파를 찍는다
function bareCells(segs){
  const isoW=(S.w+S.h)*HALF*2+2400, isoH=(S.w+S.h)*HALF+2400;
  const cv=document.createElement('canvas');cv.width=isoW;cv.height=isoH;
  const g=cv.getContext('2d');g.translate(S.h*CELL+1200,1200);
  drawSegs(g,segs);
  const d=g.getImageData(0,0,isoW,isoH).data;
  const out=[];out.tot=0;
  for(let cy=0;cy<S.h;cy++)for(let cx=0;cx<S.w;cx++){
    if(S.cells[cy][cx]!==2)continue;out.tot++;
    const c=w2i(cx*CELL+HALF,cy*CELL+HALF);
    const px=Math.round(c.x+S.h*CELL+1200), py=Math.round(c.y+1200);
    if(px<0||py<0||px>=isoW||py>=isoH){out.push([cx,cy]);continue;}
    if(d[(py*isoW+px)*4+3]<24)out.push([cx,cy]);
  }
  return out;
}
function coverage(segs){const b=bareCells(segs);return {bare:b.length,tot:b.tot,pct:b.tot?b.length/b.tot*100:0};}
// ★출하 가능성 지표 — 화면 1400×900 안에 실제로 그려지는 장수와 덮어쓰기 화소
function cost(segs){
  const ctr=w2i((S.w/2)*CELL,(S.h/2)*CELL);
  let n=0,px=0;
  for(const s of segs){const an=AN[s.name];if(!an)continue;
    const sc=PPU_SCR/an.ppu*s.sc,vy=s.vy||1,c=w2i(s.x,s.y);
    const W=512*sc,H=512*sc*vy, x0=c.x-an.ox*sc-(ctr.x-700), y0=c.y-an.oy*sc*vy-(ctr.y-450);
    if(x0>1400||y0>900||x0+W<0||y0+H<0)continue;
    n++;px+=W*H;}
  return {n,mp:px/1e6};
}

function render(segs){
  const cv=document.createElement('canvas');cv.width=1400;cv.height=900;
  const g=cv.getContext('2d');
  // 화면 중심 = 장면 한가운데(1:1 — 게임과 같은 배율)
  const ctr=w2i((S.w/2)*CELL,(S.h/2)*CELL);
  g.fillStyle='#0a0d10';g.fillRect(0,0,1400,900);
  g.save();g.translate(700-ctr.x,450-ctr.y);
  const pat=g.createPattern(imgs.grassA,'repeat');const pm=new DOMMatrix();pm.a=0.295;pm.d=0.295;pat.setTransform(pm);
  g.fillStyle=pat;g.fillRect(ctr.x-700,ctr.y-450,1400,900);
  // 바위 셀 지면(라이브와 같은 갈색) — 덮개가 부족하면 이게 보인다
  g.fillStyle='#69605a';
  for(let cy=0;cy<S.h;cy++)for(let cx=0;cx<S.w;cx++){
    if(S.cells[cy][cx]!==2)continue;
    const c=w2i(cx*CELL,cy*CELL);
    g.beginPath();g.moveTo(c.x,c.y);g.lineTo(c.x+CELL,c.y+HALF);g.lineTo(c.x,c.y+CELL);g.lineTo(c.x-CELL,c.y+HALF);g.closePath();g.fill();
  }
  drawSegs(g,segs);
  g.restore();
  return cv;
}

function go(){
  const SETS={A:placeA(),B:placeB(),C:gapFill(placeC(),2)};
  for(const k of ['A','B','C']){
    const s=SETS[k],c=coverage(s),z=cost(s);
    const t={};for(const g of s)t[g.tier||'-']=(t[g.tier||'-']||0)+1;
    console.log('[COVER] '+k+' 총 '+s.length+' '+JSON.stringify(t)
      +' · 맨 바위 '+c.bare+'/'+c.tot+' = '+c.pct.toFixed(1)+'%'
      +' · 화면 내 '+z.n+'장 / 덮어쓰기 '+z.mp.toFixed(1)+'MP');
    const cv=render(s);cv.id='cv-'+k;document.body.appendChild(cv);
  }
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mtcover.html', html);
(async () => {
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1500, height: 2800 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 300)));
  pg.on('console', (m) => { const t = m.text(); if (t.includes('[COVER]')) console.log('  ' + t); });
  await pg.goto('file:///tmp/mtcover.html');
  await pg.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
  for (const id of ['cv-A', 'cv-B', 'cv-C']) {
    const el = await pg.$('#' + id);
    if (el) await el.screenshot({ path: `/tmp/mtcover-${id.replace('cv-', '')}.png` });
  }
  console.log('done → /tmp/mtcover-A.png · /tmp/mtcover-B.png');
  await br.close();
})();
