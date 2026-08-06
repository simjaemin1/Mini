#!/usr/bin/env node
// mock-mountain.js v3 — 능선 '장벽 산' 시안 [재민: 산맥은 굵고 휜 선 · 파괴 후 자연스러움 · 두께=밴드 폭]
//   8방위 벽 슬라이스(단면이 진행 수직으로 넓음)를 ridges 폴리라인을 따라 이어 붙인다.
//   단면 폭 = 밴드 width 필드(한울대간 37셀) 정합. 파괴 시연: 구멍 세그먼트 제거 → 양끝 캡 + 돌바닥·잔해.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const MT = path.join(__dirname, 'mountain_renders');

const HARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const RIDGES = HARD.ridges;
const main = RIDGES[0].path;
let bestI = 60, bestTurn = 0;
for (let i = 30; i < Math.min(main.length - 30, 400); i += 5) {
  const a = main[i - 25].pos, b = main[i].pos, c = main[i + 25].pos;
  const v1 = Math.atan2(b[1] - a[1], b[0] - a[0]), v2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(v2 - v1); if (d > Math.PI) d = 2 * Math.PI - d;
  if (d > bestTurn) { bestTurn = d; bestI = i; }
}
const CTR = main[bestI].pos;
console.log('커브 중심:', CTR, '회전각', (bestTurn * 180 / Math.PI).toFixed(1) + '°');
const SC_W = 200, SC_H = 110;
const scene = { cx0: Math.floor(CTR[0] / 32) - 95, cy0: Math.floor(CTR[1] / 32) - 52, w: SC_W, h: SC_H };
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

function scenePaths() {
  const x0 = scene.cx0 * 32, y0 = scene.cy0 * 32, x1 = x0 + scene.w * 32, y1 = y0 + scene.h * 32;
  const out = [];
  for (const r of RIDGES) {
    let cur = null;
    for (const pt of r.path) {
      const inBox = pt.pos[0] > x0 - 1400 && pt.pos[0] < x1 + 1400 && pt.pos[1] > y0 - 1400 && pt.pos[1] < y1 + 1400;
      if (inBox) {
        if (!cur) { cur = { name: r.name, pts: [] }; out.push(cur); }
        cur.pts.push({ x: pt.pos[0] - x0, y: pt.pos[1] - y0, w: pt.width });
      } else cur = null;
    }
  }
  return out.filter(p => p.pts.length >= 2);
}
const PATHS = scenePaths();
console.log('장면 내 능선 경로:', PATHS.map(p => p.name + '(' + p.pts.length + ')').join(' '));

const AN = JSON.parse(fs.readFileSync(path.join(MT, 'mountain_anchors.json'), 'utf8'));
function b64(p) { return 'data:image/png;base64,' + fs.readFileSync(p).toString('base64'); }
const ASSETS = {
  grassA: b64(path.join(ROOT, 'public/assets/terrain/grass_angled.png')),
  mud: b64(path.join(ROOT, 'public/assets/terrain/mud_angled.png')),
  tree1: b64(path.join(ROOT, 'public/assets/trees/tree03.png')),
  tree2: b64(path.join(ROOT, 'public/assets/trees/tree07.png')),
  rockSpr: b64(path.join(ROOT, 'public/assets/nature/rock02.png')),
};
for (const k of Object.keys(AN)) ASSETS[k] = b64(path.join(MT, k + '.png'));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0a0d10;margin:0} canvas{display:block;margin-bottom:6px}
</style></head><body><script>
const S=${JSON.stringify({ cx0: scene.cx0, cy0: scene.cy0, w: scene.w, h: scene.h, cells: scene.cells })};
const PATHS=${JSON.stringify(PATHS)};
const AN=${JSON.stringify(AN)};
const A=${JSON.stringify(ASSETS)};
const CELL=32,HALF=16,PPU_SCR=64/Math.SQRT2;
const w2i=(wx,wy,wz=0)=>({x:wx-wy,y:(wx+wy)/2-wz});
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};

function placeAlong(hole){
  const segs=[];
  for(const P of PATHS){
    const pts=P.pts;
    const cum=[0];
    for(let i=1;i<pts.length;i++) cum.push(cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y));
    const total=cum[cum.length-1];
    function at(sArc){
      let i=1; while(i<cum.length-1&&cum[i]<sArc) i++;
      const a=pts[i-1],b=pts[i],L=cum[i]-cum[i-1]||1,t=(sArc-cum[i-1])/L;
      return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,ang:Math.atan2(b.y-a.y,b.x-a.x),w:a.w+(b.w-a.w)*t};
    }
    const CROSS_U=10.1, ALONG_U=4.8;   // 세그먼트 모델 실측 — 단면 늘임 2.1×r2.4(수직), 진행 4.8
    const placed=[];
    let sArc=0;
    while(sArc<total){
      const p0=at(sArc);
      const scW=(p0.w/32)/CROSS_U*0.96;      // ★단면 = 밴드 폭
      const visLen=ALONG_U*32*scW;           // 진행 방향 실길이
      placed.push({...p0, sc:scW});
      sArc+=Math.max(40, visLen*0.55);
    }
    const alive=placed.map(p=> !hole || Math.hypot(p.x-hole.x,p.y-hole.y)>hole.r );
    for(let i=0;i<placed.length;i++){
      if(!alive[i]) continue;
      const p=placed[i];
      let deg=(p.ang*180/Math.PI)%180; if(deg<0)deg+=180;
      const oct=Math.round(deg/22.5)%8;
      let knot=false;
      if(i>0&&i<placed.length-1){
        let d2=Math.abs(placed[i+1].ang-placed[i-1].ang);
        if(d2>Math.PI)d2=2*Math.PI-d2;
        if(d2>0.42) knot=true;
      }
      const cutL=(i>0&&!alive[i-1]), cutR=(i<placed.length-1&&!alive[i+1]);
      if(cutL||cutR){
        segs.push({x:p.x,y:p.y,name:hash(i,oct,9)<0.5?'mt_S1':'mt_S2',sc:p.sc*0.95,cap:true});   // 캡은 벽보다 낮게 — 잘린 끝이 주저앉는 전이
      } else if(knot){
        segs.push({x:p.x,y:p.y,name:hash(i,oct,7)<0.5?'mt_M1':'mt_M2',sc:p.sc*1.25});
      } else {
        segs.push({x:p.x,y:p.y,name:'mt_G'+oct+'v'+((hash(Math.round(p.x),Math.round(p.y),77)*3)|0),sc:p.sc,
          vy:0.86+0.28*hash(Math.round(p.x),Math.round(p.y),78),   // 높이 지터 ±14%
          jx:(hash(Math.round(p.x),Math.round(p.y),11)-0.5)*p.w*0.05,
          jy:(hash(Math.round(p.x),Math.round(p.y),12)-0.5)*p.w*0.05});
      }
    }
  }
  segs.sort((a,b)=>(a.x+a.y)-(b.x+b.y));
  return segs;
}

const imgs={}; let pend=0;
for(const k in A){ pend++; const im=new Image(); im.onload=()=>{imgs[k]=im; if(--pend===0)go();}; im.src=A[k]; }

function render(hole){
  const {w,h,cells}=S;
  const scale=0.22;
  const cv=document.createElement('canvas');
  const isoW=(w+h)*HALF*2+120, isoH=(w+h)*HALF+430;
  cv.width=Math.round(isoW*scale); cv.height=Math.round(isoH*scale);
  const g=cv.getContext('2d'); g.scale(scale,scale); g.translate(h*CELL+60,190);
  g.fillStyle='#0a0d10'; g.fillRect(-h*CELL-60,-190,isoW,isoH);
  const pat=g.createPattern(imgs.grassA,'repeat'); const pm=new DOMMatrix(); pm.a=0.295; pm.d=0.295; pat.setTransform(pm);
  g.fillStyle=pat; g.fillRect(-h*CELL-60,-190,isoW,isoH);
  if(hole){
    const mpat=g.createPattern(imgs.mud,'repeat'); const mm=new DOMMatrix(); mm.a=0.295; mm.d=0.295; mpat.setTransform(mm);
    const c=w2i(hole.x,hole.y);
    g.save(); g.beginPath();
    g.ellipse(c.x,c.y,hole.r*1.35,hole.r*0.7,0,0,6.3); g.clip();
    g.fillStyle=mpat; g.fillRect(c.x-hole.r*1.6,c.y-hole.r,hole.r*3.2,hole.r*2);
    g.fillStyle='rgba(40,38,30,0.35)'; g.fillRect(c.x-hole.r*1.6,c.y-hole.r,hole.r*3.2,hole.r*2);
    g.restore();
    for(let i=0;i<14;i++){
      const a=hash(i,3,41)*6.28, rr=hole.r*(0.2+0.75*hash(i,5,43));
      const im=imgs.rockSpr; const sc2=(26+24*hash(i,7,45))/im.height;
      const q=w2i(hole.x+Math.cos(a)*rr,hole.y+Math.sin(a)*rr*0.8);
      g.drawImage(im,q.x-im.width*sc2/2,q.y-im.height*sc2,im.width*sc2,im.height*sc2);
    }
  }
  const tintCache={};
  function tinted(name,v){
    const key=name+v; if(tintCache[key])return tintCache[key];
    const im=imgs[name];
    const t=document.createElement('canvas'); t.width=im.width; t.height=im.height;
    const tg=t.getContext('2d'); tg.drawImage(im,0,0);
    tg.globalCompositeOperation='source-atop';
    tg.fillStyle=v===0?'rgba(96,82,60,0.12)':'rgba(70,64,48,0.18)';
    tg.fillRect(0,0,t.width,t.height);
    tintCache[key]=t; return t;
  }
  for(const sgm of placeAlong(hole)){
    const an=AN[sgm.name];
    const im=tinted(sgm.name,(hash(Math.round(sgm.x),Math.round(sgm.y),91)<0.5)?0:1);
    const sc=PPU_SCR/an.ppu*sgm.sc, vy=sgm.vy||1;
    const c=w2i(sgm.x+(sgm.jx||0),sgm.y+(sgm.jy||0));
    // 높이 지터: 앵커(발치)는 고정한 채 세로만 배율 — 능선 스카이라인이 출렁이게
    g.drawImage(im, c.x-an.ox*sc, c.y-an.oy*sc*vy - (im.height*sc*vy - im.height*sc)*0, im.width*sc, im.height*sc*vy);
  }
  for(let s2=0;s2<w+h-1;s2++) for(let x=Math.max(0,s2-h+1);x<=Math.min(w-1,s2);x++){
    const y=s2-x;
    if(cells[y][x]===0&&hash(x,y,21)>0.996){
      const im=imgs['tree'+(1+((hash(x,y,22)*2)|0))]; const c=w2i(x*CELL+HALF,y*CELL+HALF); const sc2=104/im.height;
      g.drawImage(im,c.x-im.width*sc2/2,c.y+HALF-im.height*sc2,im.width*sc2,im.height*sc2);
    }
  }
  return cv;
}

function go(){
  const c1=render(null); c1.id='cv-range'; document.body.appendChild(c1);
  const c2=render({x:S.w*CELL/2, y:S.h*CELL/2, r:430}); c2.id='cv-broken'; document.body.appendChild(c2);
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mock-mountain3.html', html);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 2600, height: 1800 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0, 300)));
  await page.goto('file:///tmp/mock-mountain3.html');
  await page.waitForFunction(() => document.title === 'READY', { timeout: 120000 });
  for (const id of ['cv-range', 'cv-broken']) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: `/tmp/mock-mountain3-${id.replace('cv-', '')}.png` });
  }
  console.log('done');
  await browser.close();
})();
