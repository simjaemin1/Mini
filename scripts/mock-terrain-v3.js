#!/usr/bin/env node
// mock-terrain-v3.js — 질감판 시안: Blender 베이크 텍스처(grass/water×6/dirt/rock/canopy)를
//   입체 밑판(꼭짓점 높이 메시·파인 강) 위에 어파인 매핑. 물은 강 폴리라인에서 파생한
//   흐름 벡터로 UV 를 흘려 6프레임 루프 → 스틸 + 흐름 GIF.
//   데이터 무접촉 — 전부 기존 terrain.js 판정·기존 rivers path 에서 파생.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const TEX = path.join(__dirname, 'terrain_tex');

function grid(cx0, cy0, w, h) {
  const cells = [];
  for (let cy = 0; cy < h; cy++) {
    const row = [];
    for (let cx = 0; cx < w; cx++) {
      const x = (cx0 + cx) * 32 + 16, y = (cy0 + cy) * 32 + 16;
      row.push(T.isWaterCellLocal('hanbando', x, y) ? 1 : (T.isRockCellLocal('hanbando', x, y) ? 2 : 0));
    }
    cells.push(row);
  }
  return { cx0, cy0, w, h, cells };
}
const sceneRiver = grid(1279, 1194, 48, 26);
const sceneRidge = grid(1720, 118, 52, 30);

// ── 흐름장: 강 폴리라인에서 셀별 흐름 각 파생 (데이터에 이미 있는 path 방향) ──
const RIVERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando.rivers;
function flowField(S) {
  const x0 = S.cx0 * 32, y0 = S.cy0 * 32, x1 = (S.cx0 + S.w) * 32, y1 = (S.cy0 + S.h) * 32;
  const segs = [];
  for (const r of RIVERS) {
    const p = r.path;
    for (let i = 0; i + 1 < p.length; i++) {
      const a = p[i].pos, b = p[i + 1].pos;
      const pad = Math.max(p[i].width, 600);
      if (Math.max(a[0], b[0]) < x0 - pad || Math.min(a[0], b[0]) > x1 + pad ||
          Math.max(a[1], b[1]) < y0 - pad || Math.min(a[1], b[1]) > y1 + pad) continue;
      segs.push([a[0], a[1], b[0], b[1]]);
    }
  }
  const ang = [];
  for (let cy = 0; cy < S.h; cy++) {
    const row = [];
    for (let cx = 0; cx < S.w; cx++) {
      if (S.cells[cy][cx] !== 1) { row.push(null); continue; }
      const px = (S.cx0 + cx) * 32 + 16, py = (S.cy0 + cy) * 32 + 16;
      let best = Infinity, ba = 0;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
        let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t));
        const qx = ax + t * dx - px, qy = ay + t * dy - py, d = qx * qx + qy * qy;
        if (d < best) { best = d; ba = Math.atan2(dy, dx); }
      }
      row.push(ba);
    }
    ang.push(row);
  }
  return ang;
}
const flowRiver = flowField(sceneRiver);

function b64(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
const ASSETS = {
  grass: b64(path.join(TEX, 'grass.png')), dirt: b64(path.join(TEX, 'dirt.png')),
  rock: b64(path.join(TEX, 'rock.png')), canopy: b64(path.join(TEX, 'canopy.png')),
  w0: b64(path.join(TEX, 'water_0.png')), w1: b64(path.join(TEX, 'water_1.png')),
  w2: b64(path.join(TEX, 'water_2.png')), w3: b64(path.join(TEX, 'water_3.png')),
  w4: b64(path.join(TEX, 'water_4.png')), w5: b64(path.join(TEX, 'water_5.png')),
  tree1: b64(path.join(ROOT, 'public/assets/trees/tree03.png')),
  tree2: b64(path.join(ROOT, 'public/assets/trees/tree07.png')),
  tree3: b64(path.join(ROOT, 'public/assets/trees/tree11.png')),
  rockSpr: b64(path.join(ROOT, 'public/assets/nature/rock02.png')),
  bush1: b64(path.join(ROOT, 'public/assets/nature/bush03.png')),
};

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0a0d10;margin:0} canvas{display:block}
</style></head><body><script>
const SCENES={river:${JSON.stringify(sceneRiver)},ridge:${JSON.stringify(sceneRidge)}};
const FLOW={river:${JSON.stringify(flowRiver)},ridge:null};
const A=${JSON.stringify(ASSETS)};
const CELL=32,HALF=16;
const w2i=(wx,wy,wz=0)=>({x:wx-wy,y:(wx+wy)/2-wz});
const pingpong=(v,m)=>{v=((v%(2*m))+2*m)%(2*m);return v<m?v:2*m-v;};
const hash=(x,y,s)=>{let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};

function fields(S){
  const {w,h,cells}=S;
  const get=(x,y)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));return cells[y][x];};
  function dist(isSeed){
    const d=Array.from({length:h},()=>new Array(w).fill(255)); const q=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){if(isSeed(cells[y][x])){d[y][x]=0;q.push([x,y]);}}
    for(let i=0;i<q.length;i++){const[x,y]=q[i];
      for(const[nx,ny]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        if(nx<0||ny<0||nx>=w||ny>=h)continue;
        if(d[ny][nx]>d[y][x]+1){d[ny][nx]=d[y][x]+1;q.push([nx,ny]);}}}
    return d;
  }
  return {get,dLand:dist(v=>v!==1),dOpen:dist(v=>v!==2)};
}

// 삼각형 텍스처 매핑 (표준 어파인)
function texTri(g,img,x0,y0,x1,y1,x2,y2,u0,v0,u1,v1,u2,v2){
  // 클립 삼각형을 무게중심 기준 0.8px 팽창 — 이웃 삼각형과 겹쳐 실금(안티앨리어싱 틈)을 없앤다
  const gx=(x0+x1+x2)/3, gy=(y0+y1+y2)/3, EPS=0.8;
  const ex=(px,py)=>{const dx=px-gx,dy=py-gy,L=Math.hypot(dx,dy)||1;return [px+dx/L*EPS,py+dy/L*EPS];};
  const [ax0,ay0]=ex(x0,y0),[ax1,ay1]=ex(x1,y1),[ax2,ay2]=ex(x2,y2);
  g.save();g.beginPath();g.moveTo(ax0,ay0);g.lineTo(ax1,ay1);g.lineTo(ax2,ay2);g.closePath();g.clip();
  const du1=u1-u0,dv1=v1-v0,du2=u2-u0,dv2=v2-v0;
  const dx1=x1-x0,dy1=y1-y0,dx2=x2-x0,dy2=y2-y0;
  const det=du1*dv2-dv1*du2; if(!det){g.restore();return;}
  const a=(dx1*dv2-dx2*dv1)/det, b=(dy1*dv2-dy2*dv1)/det,
        c=(dx2*du1-dx1*du2)/det, d=(dy2*du1-dy1*du2)/det,
        e=x0-a*u0-c*v0, f=y0-b*u0-d*v0;
  g.transform(a,b,c,d,e,f);   // ★합성(transform) — setTransform 은 바깥 scale/translate 를 갈아엎는다(v3 첫 렌더의 암흑 화면이 그 실증)
  g.drawImage(img,0,0);
  g.restore();
}
function texQuad(g,img,P,UV){ // P=[p0..p3] 화면, UV=[u0..u3] — 두 삼각형
  texTri(g,img,P[0].x,P[0].y,P[1].x,P[1].y,P[2].x,P[2].y,UV[0][0],UV[0][1],UV[1][0],UV[1][1],UV[2][0],UV[2][1]);
  texTri(g,img,P[0].x,P[0].y,P[2].x,P[2].y,P[3].x,P[3].y,UV[0][0],UV[0][1],UV[2][0],UV[2][1],UV[3][0],UV[3][1]);
}
function shadeQuad(g,P,style){ g.beginPath();g.moveTo(P[0].x,P[0].y);for(let i=1;i<4;i++)g.lineTo(P[i].x,P[i].y);g.closePath();g.fillStyle=style;g.fill(); }

function render(S,flow,scale,imgs,phase,view){
  const {w,h,cells}=S; const F=fields(S);
  const cv=document.createElement('canvas');
  const isoW=view?view.w:((w+h)*HALF*2+120), isoH=view?view.h:((w+h)*HALF+320);
  cv.width=isoW*scale; cv.height=isoH*scale;
  const g=cv.getContext('2d'); g.scale(scale,scale);
  g.translate(view?view.tx:(h*CELL+60), view?view.ty:190);
  g.fillStyle='#0a0d10'; g.fillRect(-(view?view.tx:(h*CELL+60)),-(view?view.ty:190),isoW,isoH);

  const HPX=26, DEPTH=16;
  const hC=(x,y)=>{ if(F.get(x,y)!==2)return 0;
    const d=(F.dOpen[Math.max(0,Math.min(h-1,y))]||[])[Math.max(0,Math.min(w-1,x))]||0;
    let hh=Math.min(8,d*0.95); if(d>2)hh+=(hash(x,y,41)-0.5)*1.4; return hh; };
  const hV=(vx,vy)=>(hC(vx-1,vy-1)+hC(vx,vy-1)+hC(vx-1,vy)+hC(vx,vy))/4;

  for(let s=0;s<w+h-1;s++) for(let x=Math.max(0,s-h+1);x<=Math.min(w-1,s);x++){
    const y=s-x,v=cells[y][x];
    const iso=w2i(x*CELL,y*CELL);
    if(v===1){ // ── 물: 텍스처 + 흐름 UV + 수심 보정 ──
      // 수심을 3×3 평균으로 부드럽게 — 셀 단위 계단(체커 무늬) 제거
      let dsum=0,dn=0;
      for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++){
        const yy=Math.max(0,Math.min(h-1,y+oy)),xx=Math.max(0,Math.min(w-1,x+ox));
        if(cells[yy][xx]===1){dsum+=(F.dLand[yy]||[])[xx]||0;dn++;}}
      const deep=Math.min(1,(dn?dsum/dn:1)/6);
      const sx=iso.x,sy=iso.y;
      const P=[{x:sx,y:sy+DEPTH},{x:sx+CELL,y:sy+HALF+DEPTH},{x:sx,y:sy+CELL+DEPTH},{x:sx-CELL,y:sy+HALF+DEPTH}];
      // 흐름: 512px 텍스처에서 88px 창을 흐름 방향으로 흘린다 (프레임당 위상 phase 0..1)
      const ang=(flow&&flow[y]&&flow[y][x]!=null)?flow[y][x]:0;
      const spd=46; // px/루프
      const u0=pingpong(x*88+Math.cos(ang)*spd*phase,512-88),
            v0=pingpong(y*88+Math.sin(ang)*spd*phase,512-88);
      const wi=imgs['w'+(Math.floor(phase*6)%6)];
      texQuad(g,wi,P,[[u0,v0],[u0+88,v0],[u0+88,v0+88],[u0,v0+88]]);
      // 수심 보정: 얕은 곳 옥빛 밝힘 + 깊은 곳 남색 곱
      shadeQuad(g,P,'rgba(125,208,215,'+(0.17*(1-deep))+')');
      shadeQuad(g,P,'rgba(8,22,52,'+(0.55*deep)+')');
      if(hash(x,y,3)>0.7){ const px=sx+(hash(x,y,4)-0.5)*40,py=sy+HALF+DEPTH+(hash(x,y,5)-0.5)*14;
        const tw=(hash(x,y,6)+phase)%1;   // 반짝임도 위상 순환
        g.fillStyle='rgba(240,250,255,'+(0.28*Math.sin(tw*3.14159)*(1-deep*0.4))+')';
        g.fillRect(px+Math.cos(ang)*spd*phase*0.6,py-1.4,6+hash(x,y,8)*9,1.8); }
      // 둑면: 흙 텍스처
      if(F.get(x,y-1)!==1){ const Q=[{x:sx,y:sy},{x:sx+CELL,y:sy+HALF},{x:sx+CELL,y:sy+HALF+DEPTH},{x:sx,y:sy+DEPTH}];
        const du=(x*97)%400; texQuad(g,imgs.dirt,Q,[[du,60],[du+90,60],[du+90,110],[du,110]]);
        shadeQuad(g,Q,'rgba(0,0,0,0.18)');
        g.beginPath();g.moveTo(sx,sy);g.lineTo(sx+CELL,sy+HALF);g.lineTo(sx+CELL,sy+HALF+3);g.lineTo(sx,sy+3);g.closePath();g.fillStyle='#48653c';g.fill(); }
      if(F.get(x-1,y)!==1){ const Q=[{x:sx-CELL,y:sy+HALF},{x:sx,y:sy},{x:sx,y:sy+DEPTH},{x:sx-CELL,y:sy+HALF+DEPTH}];
        const du=(y*89)%400; texQuad(g,imgs.dirt,Q,[[du,200],[du+90,200],[du+90,250],[du,250]]);
        shadeQuad(g,Q,'rgba(0,0,0,0.30)');
        g.beginPath();g.moveTo(sx-CELL,sy+HALF);g.lineTo(sx,sy);g.lineTo(sx,sy+3);g.lineTo(sx-CELL,sy+HALF+3);g.closePath();g.fillStyle='#41583a';g.fill(); }
      continue;
    }
    // ── 뭍·산: 높이 메시 + 텍스처 ──
    const hNW=hV(x,y),hNE=hV(x+1,y),hSE=hV(x+1,y+1),hSW=hV(x,y+1);
    const P=[w2i(x*CELL,y*CELL,hNW*HPX),w2i((x+1)*CELL,y*CELL,hNE*HPX),
             w2i((x+1)*CELL,(y+1)*CELL,hSE*HPX),w2i(x*CELL,(y+1)*CELL,hSW*HPX)];
    let img,uw;
    if(v===2){
      const hh=hC(x,y),t=Math.min(1,hh/8);
      const outcrop=0.8*hash(x>>2,y>>2,51)+0.2*hash(x,y,52);
      if(outcrop>0.88-t*0.24&&hh>2.2){ img=imgs.rock; uw=120; }
      else { img=imgs.canopy; uw=150; }
    } else { img=imgs.grass; uw=170; }
    const u0=pingpong(x*uw,img.width-uw-2), v0=pingpong(y*uw,img.height-uw-2);
    texQuad(g,img,P,[[u0,v0],[u0+uw,v0],[u0+uw,v0+uw],[u0,v0+uw]]);
    // 사면 명암(북서광) + 바위 톤 보정 + 물가 모래톤
    const slope=(hNW-hSE)*0.5+(hNE-hSW)*0.25;
    if(slope>0) shadeQuad(g,P,'rgba(255,246,225,'+Math.min(0.22,slope*0.10)+')');
    else if(slope<0) shadeQuad(g,P,'rgba(8,12,20,'+Math.min(0.38,-slope*0.16)+')');
    if(v===2&&img===imgs.rock) shadeQuad(g,P,'rgba(70,66,60,0.30)');
    if(v===2&&img===imgs.canopy) shadeQuad(g,P,'rgba(10,22,8,'+(0.10+0.25*Math.min(1,hC(x,y)/8))+')');
    if(v===0){
      const nearWater=(F.get(x+1,y)===1||F.get(x-1,y)===1||F.get(x,y+1)===1||F.get(x,y-1)===1);
      if(nearWater) shadeQuad(g,P,'rgba(168,148,92,0.42)');
      const patch=0.72*hash(x>>3,y>>3,1)+0.28*hash(x,y,2);   // 뙈기 변주
      if(patch<0.3) shadeQuad(g,P,'rgba(20,40,12,0.10)');
      else if(patch>0.75) shadeQuad(g,P,'rgba(200,210,120,0.07)');
    }
    // 소품(실제 게임 스프라이트)
    if(v===0){ const r=hash(x,y,21);
      if(r>0.982){ const im=imgs['tree'+(1+((hash(x,y,22)*3)|0))]; const c=w2i(x*CELL+HALF,y*CELL+HALF); const sc=104/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc); }
      else if(r>0.958){ const im=imgs.bush1; const c=w2i(x*CELL+HALF,y*CELL+HALF); const sc=34/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc); }
    } else if(v===2&&hC(x,y)>=1.2&&hash(x,y,33)>0.94){
      const outc=0.8*hash(x>>2,y>>2,51)+0.2*hash(x,y,52);
      if(outc<=0.88-Math.min(1,hC(x,y)/8)*0.24){ const im=imgs['tree'+(1+((hash(x,y,34)*3)|0))];
        const c=w2i(x*CELL+HALF,y*CELL+HALF,hC(x,y)*HPX); const sc=72/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc); }
    } else if(v===2&&hC(x,y)<1.2&&hash(x,y,31)>0.9){
      const im=imgs.rockSpr; const c=w2i(x*CELL+HALF,y*CELL+HALF,hC(x,y)*HPX); const sc=40/im.height;
      g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc);
    }
  }
  return cv;
}

const imgs={}; let pend=0;
for(const k in A){ pend++; const im=new Image(); im.onload=()=>{imgs[k]=im; if(--pend===0)go();}; im.src=A[k]; }
function go(){
  // 스틸 2장
  const c1=render(SCENES.river,FLOW.river,0.62,imgs,0,null); c1.id='cv-river'; document.body.appendChild(c1);
  const c2=render(SCENES.ridge,null,0.62,imgs,0,null); c2.id='cv-ridge'; document.body.appendChild(c2);
  // 근접 스틸(강 클로즈업 — 실배율)
  const c3=render(SCENES.river,FLOW.river,1.0,imgs,0,{w:1100,h:700,tx:-260,ty:-120}); c3.id='cv-close'; document.body.appendChild(c3);
  // GIF 프레임 12장 (근접 뷰)
  window._gif=[];
  for(let f=0;f<12;f++){
    const c=render(SCENES.river,FLOW.river,1.0,imgs,f/12,{w:1100,h:700,tx:-260,ty:-120});
    window._gif.push(c.toDataURL('image/png'));
  }
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mock-terrain-v3.html', html);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 2400, height: 1600 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0, 300)));
  await page.goto('file:///tmp/mock-terrain-v3.html');
  await page.waitForFunction(() => document.title === 'READY', { timeout: 60000 });
  fs.mkdirSync('/tmp/terrain-mock-v3', { recursive: true });
  for (const id of ['cv-river', 'cv-ridge', 'cv-close']) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: `/tmp/terrain-mock-v3/${id.replace('cv-', '')}.png` });
  }
  const frames = await page.evaluate(() => window._gif);
  frames.forEach((d, i) => fs.writeFileSync(`/tmp/terrain-mock-v3/gif_${String(i).padStart(2, '0')}.png`,
    Buffer.from(d.split(',')[1], 'base64')));
  console.log('done:', frames.length, 'gif frames + 3 stills → /tmp/terrain-mock-v3/');
  await browser.close();
})();
