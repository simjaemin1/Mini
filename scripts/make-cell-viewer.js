#!/usr/bin/env node
// world_terrain_v7.json + zone-config → cell-viewer.html (자립형 셀 미니맵 뷰어)
// 게임의 셀 판정(물=강·호수·해안선, 바위=산맥, 숲, 평지)을 재현. 줌/팬, 보이는 셀만 계산.
'use strict';
const fs = require('fs'), path = require('path');
const { ZONES } = require('../server/zone-config.js');
const TER = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'world_terrain_v7.json'), 'utf8'));

// 존 메타 (전 26존)
const Z = {};
for (const id in ZONES) { const z = ZONES[id]; Z[id] = { ox:z.worldOffsetX, oy:z.worldOffsetY, w:z.zoneWidth, h:z.zoneHeight, ocean:!!z.isOcean, g:z.groundColor||'#b9a86a' }; }

// 지형 compact: rivers/ridges = [[ [x,y,w],... ]], lakes=[[cx,cy,r]], forests=[[cx,cy,rx,ry]]
const R = {};
for (const id in TER) { const d = TER[id];
  R[id] = {
    rv: (d.rivers ||[]).map(r=>r.path.map(p=>[p.pos[0],p.pos[1],p.width||300])),
    rg: (d.ridges ||[]).map(r=>r.path.map(p=>[p.pos[0],p.pos[1],p.width||800])),
    lk: (d.lakes  ||[]).map(l=> l.shape==='ellipse' ? [l.center[0],l.center[1],l.a,l.b] : [l.center[0],l.center[1],l.radius||600]),
    fo: (d.forests||[]).map(f=>[f.center[0],f.center[1],f.rx||4000,f.ry||3000]),
  };
}

const DATA = JSON.stringify({ Z, R });

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>셀 미니맵 뷰어</title>
<style>
  html,body{margin:0;height:100%;background:#0b1016;color:#cfe;font-family:ui-sans-serif,system-ui,sans-serif;overflow:hidden}
  #cv{display:block;cursor:grab;image-rendering:pixelated}
  #cv:active{cursor:grabbing}
  #hud{position:fixed;left:10px;bottom:10px;background:rgba(10,14,18,.8);border:1px solid #2a3a4a;border-radius:6px;padding:6px 10px;font-size:12px;font-variant-numeric:tabular-nums;pointer-events:none}
  #legend{position:fixed;right:10px;top:10px;background:rgba(10,14,18,.85);border:1px solid #2a3a4a;border-radius:6px;padding:8px 10px;font-size:12px}
  #legend div{display:flex;align-items:center;gap:6px;margin:2px 0}
  #legend i{width:12px;height:12px;border-radius:2px;display:inline-block}
  #title{position:fixed;left:10px;top:10px;background:rgba(10,14,18,.85);border:1px solid #2a3a4a;border-radius:6px;padding:6px 10px;font-size:12px}
  b{color:#7fd0ff}
</style></head><body>
<canvas id="cv"></canvas>
<div id="title">셀 미니맵 — 휠:줌 · 드래그:이동 · 1 cell = 32px</div>
<div id="legend">
  <div><i style="background:#3ca5e0"></i>강·호수(물)</div>
  <div><i style="background:#16384f"></i>바다·해안</div>
  <div><i style="background:#6e6e74"></i>산맥(바위)</div>
  <div><i style="background:#2f7a3a"></i>숲</div>
  <div><i style="background:#b9a86a"></i>평지(존 색)</div>
</div>
<div id="hud"></div>
<script>
window.onerror=function(m,s,l){var t=document.getElementById('title');if(t)t.textContent='에러: '+m+' @line '+l;return false;};
const {Z,R} = ${DATA};
const CELL=32, CBASE=6000, CNOISE=5000;
const COL={water:[60,165,224], sea:[22,56,79], rock:[110,110,116], forest:[47,122,58]}; // 강·호수=밝은 파랑(바다 남색과 구분)
function hex(h){h=h.replace('#','');return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
const GROUND={}; for(const z in Z) GROUND[z]=hex(Z[z].g);

// ---- 해안선 2D 노이즈 (chunk.js와 동일 — 가장 가까운 바다점 월드좌표에서 샘플 → 존경계 솔기 없음) ----
function ch2(ix,iy,oct){let h=5381;h=((h*33)^ix)>>>0;h=((h*33)^iy)>>>0;h=((h*33)^oct)>>>0;return(((h*9301+49297)>>>0)%1000)/1000;}
function vn2(x,y,step,oct){const gx=x/step,gy=y/step,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);const a=ch2(ix,iy,oct)*(1-ux)+ch2(ix+1,iy,oct)*ux,b=ch2(ix,iy+1,oct)*(1-ux)+ch2(ix+1,iy+1,oct)*ux;return a*(1-uy)+b*uy;}
function coastSN2(x,y){return((vn2(x,y,3200,1)*0.5+vn2(x,y,960,2)*0.32+vn2(x,y,320,3)*0.18)-0.5)*2;}
function lakeWob(cx,cy,ang){const s=cx*0.0131+cy*0.0237;return 1+0.13*Math.sin(ang*3+s)+0.08*Math.sin(ang*5-s*1.7)+0.05*Math.sin(ang*7+s*0.6);}

// ---- zoneAt ----
const ZIDS=Object.keys(Z);
function zoneAt(x,y){for(const id of ZIDS){const z=Z[id];if(x>=z.ox&&x<z.ox+z.w&&y>=z.oy&&y<z.oy+z.h)return id;}return null;}
// 바다 존 사각형 목록 + 변별 깊이 룩업(월드 타일좌표) — 거리기반 해안선(변+꼭짓점)
const OCEANS=ZIDS.filter(id=>Z[id].ocean).map(id=>Z[id]);
let WMX=0,WMY=0; for(const id in Z){const z=Z[id];if(z.ox+z.w>WMX)WMX=z.ox+z.w;if(z.oy+z.h>WMY)WMY=z.oy+z.h;}
const NTY=(WMY>>5)+2, NTX=(WMX>>5)+2;
// (변별 깊이 룩업 제거 — 2D 노이즈 coastSN2가 대체)
const MAXD=CBASE+CNOISE, MAXD2=MAXD*MAXD;

// ---- 공간 버킷 (강·산맥 세그먼트 + 호수·숲 영역) ----
const BS=1600;
const BK={}; const bkey=(bx,by)=>bx+'_'+by;
function bbAdd(map,minx,miny,maxx,maxy,it){for(let bx=Math.floor(minx/BS);bx<=Math.floor(maxx/BS);bx++)for(let by=Math.floor(miny/BS);by<=Math.floor(maxy/BS);by++){const k=bkey(bx,by);let a=map.get(k);if(!a){a=[];map.set(k,a);}a.push(it);}}
for(const id in R){ const map=new Map(); BK[id]=map;
  const seg=(p,t)=>{for(let i=0;i<p.length-1;i++){const it={t,ax:p[i][0],ay:p[i][1],bx:p[i+1][0],by:p[i+1][1],hw:(p[i][2]+p[i+1][2])/4};bbAdd(map,Math.min(it.ax,it.bx),Math.min(it.ay,it.by),Math.max(it.ax,it.bx),Math.max(it.ay,it.by),it);}};
  for(const p of R[id].rv) seg(p,1);   // 1=물
  for(const p of R[id].rg) seg(p,2);   // 2=바위
  for(const l of R[id].lk){const ex=l[2],ey=l.length===4?l[3]:l[2];const it={t:3,cx:l[0],cy:l[1],ex,ey};bbAdd(map,l[0]-ex,l[1]-ey,l[0]+ex,l[1]+ey,it);} // 3=호수
  for(const f of R[id].fo){const it={t:4,cx:f[0],cy:f[1],ex:f[2],ey:f[3]};bbAdd(map,f[0]-f[2],f[1]-f[3],f[0]+f[2],f[1]+f[3],it);} // 4=숲
}
function segDist2(px,py,s){const vx=s.bx-s.ax,vy=s.by-s.ay,wx=px-s.ax,wy=py-s.ay;let t=(vx*wx+vy*wy)/((vx*vx+vy*vy)||1);t=t<0?0:t>1?1:t;const dx=px-(s.ax+vx*t),dy=py-(s.ay+vy*t);return dx*dx+dy*dy;}

function cellType(wx,wy){
  const id=zoneAt(wx,wy); if(!id) return ['sea',null];
  const z=Z[id]; if(z.ocean) return ['sea',null];
  const lx=wx-z.ox, ly=wy-z.oy;
  // 해안선 — 가장 가까운 바다까지의 거리 기반 (변+꼭짓점 모두 자연스럽게)
  let bd2=MAXD2,bnx=0,bny=0,hit=false;
  for(const O of OCEANS){const nx=wx<O.ox?O.ox:(wx>O.ox+O.w?O.ox+O.w:wx),ny=wy<O.oy?O.oy:(wy>O.oy+O.h?O.oy+O.h:wy);const dx=wx-nx,dy=wy-ny,d2=dx*dx+dy*dy;if(d2<bd2){bd2=d2;bnx=nx;bny=ny;hit=true;}}
  if(hit){const dist=Math.sqrt(bd2);const depth=CBASE+coastSN2(bnx,bny)*CNOISE; if(dist<depth) return['sea',id];} // 바다점 2D노이즈 → 솔기 없음
  const map=BK[id]; if(!map) return ['plain',id]; // 안 그린 존 = 평지(절차생성 미표시)
  const bx=Math.floor(lx/BS),by=Math.floor(ly/BS); let rock=false,forest=false;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=map.get(bkey(bx+dx,by+dy));if(!a)continue;
    for(const it of a){
      if(it.t<=2){ if(segDist2(lx,ly,it)<it.hw*it.hw){ if(it.t===1) return['water',id]; rock=true; } }
      else { const dx2=lx-it.cx,dy2=ly-it.cy,ux=dx2/it.ex,uy=dy2/it.ey;
        if(it.t===3){ const w=lakeWob(it.cx,it.cy,Math.atan2(dy2,dx2)); if(ux*ux+uy*uy<w*w) return['water',id]; } // 호수 wobble
        else if(ux*ux+uy*uy<=1) forest=true; }
    } }
  if(rock) return['rock',id];
  if(forest) return['forest',id];
  return ['plain',id];
}

// ---- 뷰/렌더 (오프스크린 캐시: 팬/줌은 이미지 변환만, 멈출 때만 셀 재계산) ----
const cv=document.getElementById('cv'),ctx=cv.getContext('2d');
const oc=document.createElement('canvas'),octx=oc.getContext('2d',{willReadFrequently:true});
const HUD=document.getElementById('hud');
let view={scale:0,ox:0,oy:0}, rv={scale:1,ox:0,oy:0}, lastMs='0';
let WX0=1e15,WY0=1e15,WX1=-1e15,WY1=-1e15;
for(const id in R){const z=Z[id];WX0=Math.min(WX0,z.ox);WY0=Math.min(WY0,z.oy);WX1=Math.max(WX1,z.ox+z.w);WY1=Math.max(WY1,z.oy+z.h);}
function resize(){cv.width=Math.max(2,Math.min(window.innerWidth||1200,1600));cv.height=Math.max(2,window.innerHeight||800);}
const sx2wx=px=>(px-view.ox)/view.scale, sy2wy=py=>(py-view.oy)/view.scale;
// 무거운 셀 계산 → 오프스크린 oc (현재 view 기준)
function compute(){ try{
  const w=cv.width,h=cv.height; if(w<2||h<2)return;
  oc.width=w; oc.height=h;
  const t0=performance.now();
  const img=octx.createImageData(w,h),d=img.data;
  const STEP=2; // 2×2 블록 단위 (cellType 호출 1/4)
  for(let py=0;py<h;py+=STEP){const wy=Math.floor(sy2wy(py+0.5)/CELL)*CELL+16; const py2=Math.min(py+STEP,h);
    for(let px=0;px<w;px+=STEP){const wx=Math.floor(sx2wx(px+0.5)/CELL)*CELL+16;
      const r=cellType(wx,wy); const c=r[0]==='plain'?(r[1]?GROUND[r[1]]:[15,25,35]):COL[r[0]]; const r0=c[0],g0=c[1],b0=c[2];
      const px2=Math.min(px+STEP,w);
      for(let yy=py;yy<py2;yy++){let i=(yy*w+px)*4;for(let xx=px;xx<px2;xx++){d[i]=r0;d[i+1]=g0;d[i+2]=b0;d[i+3]=255;i+=4;}}}}
  octx.putImageData(img,0,0);
  rv={scale:view.scale,ox:view.ox,oy:view.oy}; lastMs=(performance.now()-t0).toFixed(0); paint();
 }catch(e){var t=document.getElementById('title');if(t)t.textContent='compute 에러: '+e.message;}}
// 캐시 이미지를 현재 view로 변환해 그리기 + 격자·라벨 (가벼움 → 매 프레임 OK)
function paint(){ try{
  const w=cv.width,h=cv.height; ctx.fillStyle='#0b1016'; ctx.fillRect(0,0,w,h);
  const s=view.scale/rv.scale; ctx.imageSmoothingEnabled=false;
  ctx.drawImage(oc, view.ox-rv.ox*s, view.oy-rv.oy*s, oc.width*s, oc.height*s);
  const cellPx=CELL*view.scale;
  if(cellPx>=7){ctx.strokeStyle='rgba(0,0,0,0.18)';ctx.lineWidth=1;ctx.beginPath();
    const x0=Math.ceil(sx2wx(0)/CELL)*CELL;for(let wx=x0;wx<sx2wx(w);wx+=CELL){const px=wx*view.scale+view.ox;ctx.moveTo(px,0);ctx.lineTo(px,h);}
    const y0=Math.ceil(sy2wy(0)/CELL)*CELL;for(let wy=y0;wy<sy2wy(h);wy+=CELL){const py=wy*view.scale+view.oy;ctx.moveTo(0,py);ctx.lineTo(w,py);}ctx.stroke();}
  ctx.fillStyle='rgba(180,210,255,0.9)';ctx.font='12px sans-serif';ctx.textAlign='center';
  for(const id in R){const z=Z[id];const px=(z.ox+z.w/2)*view.scale+view.ox,py=z.oy*view.scale+view.oy+14;if(px>-60&&px<w+60&&py>0&&py<h)ctx.fillText(id,px,py);}
  HUD.textContent='zoom '+(view.scale*1000).toFixed(2)+'‰  ·  1셀='+cellPx.toFixed(1)+'px  ·  재계산 '+lastMs+'ms';
 }catch(e){var t=document.getElementById('title');if(t)t.textContent='paint 에러: '+e.message;}}
let ctimer=null; function scheduleCompute(){clearTimeout(ctimer);ctimer=setTimeout(compute,130);}
function fit(){try{resize();const Wd=WX1-WX0,Hd=WY1-WY0;const sx=cv.width/Wd,sy=cv.height/Hd;view.scale=Math.min(sx,sy)*0.96;view.ox=(cv.width-Wd*view.scale)/2-WX0*view.scale;view.oy=(cv.height-Hd*view.scale)/2-WY0*view.scale;compute();}catch(e){var t=document.getElementById('title');if(t)t.textContent='fit 에러: '+e.message;}}
cv.addEventListener('wheel',e=>{e.preventDefault();const r=cv.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;const wx=sx2wx(mx),wy=sy2wy(my);const f=e.deltaY<0?1.18:1/1.18;view.scale*=f;view.ox=mx-wx*view.scale;view.oy=my-wy*view.scale;paint();scheduleCompute();},{passive:false});
let drag=null;
cv.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,ox:view.ox,oy:view.oy};});
window.addEventListener('mousemove',e=>{if(!drag)return;view.ox=drag.ox+(e.clientX-drag.x);view.oy=drag.oy+(e.clientY-drag.y);paint();});
window.addEventListener('mouseup',()=>{if(drag){drag=null;compute();}});
window.addEventListener('resize',fit);
window.onerror=function(m,src,ln){var t=document.getElementById('title');if(t)t.textContent='에러: '+m+' @line '+ln;};
window.addEventListener('load',fit); setTimeout(fit,60); setTimeout(fit,400);
fit();
</script></body></html>`;

const out = path.join(__dirname, '..', '..', 'cell-viewer.html');
fs.writeFileSync(out, html);
console.log('생성:', out, '(' + (html.length/1024).toFixed(0) + ' KB)');
console.log('  존', Object.keys(R).length, '| 강·산맥 세그먼트 버킷 포함');
