#!/usr/bin/env node
// mock-terrain.js — 배치 19 v2 시안: 절차형 '파생' 입체 지형 목업 (데이터 무접촉)
//   실제 hanbando 지형 판정(terrain.js 정본)에서 셀 그리드를 뽑아, 실제 게임 투영(w2i)으로
//   3안을 렌더한다: A 현행(민무늬) · B 입체-부드러운 산릉(높이 메시) · C 입체-단구(계단) 산릉.
//   산 높이·수심은 전부 기존 데이터에서 거리장으로 파생 — 새 지형 데이터 0바이트.
//   v2: 셀 프리즘 → **꼭짓점 보간 높이 메시**(서향 사면 기왓장 겹침 제거) + 물 팔레트 정정.
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');

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

// 장면 1: 한여울강 굽이(1280,1195 부근) — 강폭 ~13셀 + 지류 합수
const sceneRiver = grid(1279, 1194, 48, 26);
// 장면 2: 한울대간 남서 자락 — 산이 화면 앞(남서)으로 내려오는 면이 보이게
const sceneRidge = grid(1720, 118, 52, 30);

function b64(p) { return 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'public', 'assets', p)).toString('base64'); }
const SPRITES = {
  tree1: b64('trees/tree03.png'), tree2: b64('trees/tree07.png'), tree3: b64('trees/tree11.png'),
  rock1: b64('nature/rock02.png'), bush1: b64('nature/bush03.png'),
};

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{background:#0a0d10;margin:0;font:13px sans-serif;color:#dcd6c8}
canvas{display:block}
</style></head><body>
<script>
const SCENES = { river: ${JSON.stringify(sceneRiver)}, ridge: ${JSON.stringify(sceneRidge)} };
const SPR = ${JSON.stringify(SPRITES)};
const CELL = 32, HALF = 16;
const w2i = (wx, wy, wz=0) => ({ x: wx - wy, y: (wx + wy) / 2 - wz });   // 게임 정본 투영
const hash=(x,y,s)=>{let n=(Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(s,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;}

function fields(S){
  const {w,h,cells} = S;
  const get=(x,y)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));return cells[y][x];};
  function dist(isSeed){
    const d = Array.from({length:h},()=>new Array(w).fill(255));
    const q=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){ if(isSeed(cells[y][x])){d[y][x]=0;q.push([x,y]);} }
    for(let i=0;i<q.length;i++){ const [x,y]=q[i];
      for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        if(d[ny][nx]>d[y][x]+1){ d[ny][nx]=d[y][x]+1; q.push([nx,ny]); }
      }}
    return d;
  }
  return { get, dLand: dist(v=>v!==1), dOpen: dist(v=>v!==2) };
}

const GROUND='#5a7c4a', WATER='#2a5a8a', ROCK='#6e6356';
function shade(hex,f){const n=parseInt(hex.slice(1),16);return 'rgb('+[(n>>16)*f,((n>>8)&255)*f,(n&255)*f].map(v=>Math.min(255,v)|0).join(',')+')';}
function mix(a,b,t){const P=c=>c[0]==='#'?[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]:c.match(/\\d+/g).map(Number);
  const A=P(a),B=P(b);return 'rgb('+A.map((v,i)=>(v*(1-t)+B[i]*t)|0).join(',')+')';}

function render(S, style, scale, sprites){
  const {w,h,cells}=S; const F=fields(S);
  const cv=document.createElement('canvas');
  const isoW=(w+h)*HALF*2+120, isoH=(w+h)*HALF+320;
  cv.width=isoW*scale; cv.height=isoH*scale;
  const g=cv.getContext('2d'); g.scale(scale,scale); g.translate(h*CELL+60, 190);
  g.fillStyle='#0a0d10'; g.fillRect(-h*CELL-60,-190,isoW,isoH);

  const HPX=26, DEPTH=16;
  // 셀 높이(셀 단위) — 바위 안쪽 거리로 파생. C안은 단구(1단씩 계단).
  const hC=(x,y)=>{ if(F.get(x,y)!==2) return 0;
    const d=(F.dOpen[Math.max(0,Math.min(h-1,y))]||[])[Math.max(0,Math.min(w-1,x))]||0;
    let hh=Math.min(8, d*0.95);
    if(d>2) hh += (hash(x,y,41)-0.5)*1.4;                       // 내부 요철 — 고원 평판 방지(결정론)
    return style==='C' ? Math.round(hh) : hh; };
  // 꼭짓점 높이 = 인접 4셀 평균 — 연속 사면(기왓장 겹침 없음)
  const hV=(vx,vy)=>{ return (hC(vx-1,vy-1)+hC(vx,vy-1)+hC(vx-1,vy)+hC(vx,vy))/4; };

  if(style==='A'){
    for(let s=0;s<w+h-1;s++) for(let x=Math.max(0,s-h+1); x<=Math.min(w-1,s); x++){
      const y=s-x, v=cells[y][x], iso=w2i(x*CELL,y*CELL);
      g.beginPath(); g.moveTo(iso.x,iso.y); g.lineTo(iso.x+CELL,iso.y+HALF); g.lineTo(iso.x,iso.y+CELL); g.lineTo(iso.x-CELL,iso.y+HALF); g.closePath();
      g.fillStyle = v===1?WATER : v===2?ROCK : GROUND; g.fill();
    }
    return cv;
  }

  for(let s=0;s<w+h-1;s++) for(let x=Math.max(0,s-h+1); x<=Math.min(w-1,s); x++){
    const y=s-x, v=cells[y][x];
    const iso=w2i(x*CELL,y*CELL);   // NW 꼭짓점 기준
    if(v===1){ // ── 강: 파인 수면 + 수심 + 둑면 + 반짝임 ──
      const d=(F.dLand[y]||[])[x]||1, deep=Math.min(1,d/6);
      const sx=iso.x, sy=iso.y;
      g.beginPath(); g.moveTo(sx,sy+DEPTH); g.lineTo(sx+CELL,sy+HALF+DEPTH); g.lineTo(sx,sy+CELL+DEPTH); g.lineTo(sx-CELL,sy+HALF+DEPTH); g.closePath();
      g.fillStyle=mix(mix('#6fb3c9',WATER,0.45+deep*0.35),'#1d426e',deep*0.45); g.fill();
      g.strokeStyle=g.fillStyle; g.lineWidth=1; g.stroke();   // 타일 이음새 제거
      if(hash(x,y,3)>0.66){ const px=sx+(hash(x,y,4)-0.5)*40, py=sy+HALF+DEPTH+(hash(x,y,5)-0.5)*16;
        g.fillStyle='rgba(235,248,255,'+(0.22+0.3*hash(x,y,6)*(1-deep*0.4))+')';
        g.fillRect(px,py-1.6,6+hash(x,y,8)*10,2.0); }
      // 둑면 — 뭍 이웃이 N(상우변)·W(상좌변) 쪽일 때 흙 단면 + 풀 넘김
      if(F.get(x,y-1)!==1){ g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+CELL,sy+HALF); g.lineTo(sx+CELL,sy+HALF+DEPTH); g.lineTo(sx,sy+DEPTH); g.closePath();
        g.fillStyle=mix('#6b563c','#4e3f2b',hash(x,y,11)*0.5); g.fill();
        g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+CELL,sy+HALF); g.lineTo(sx+CELL,sy+HALF+3.5); g.lineTo(sx,sy+3.5); g.closePath(); g.fillStyle='#4e6b40'; g.fill(); }
      if(F.get(x-1,y)!==1){ g.beginPath(); g.moveTo(sx-CELL,sy+HALF); g.lineTo(sx,sy); g.lineTo(sx,sy+DEPTH); g.lineTo(sx-CELL,sy+HALF+DEPTH); g.closePath();
        g.fillStyle=mix('#5d4a33','#443521',hash(x,y,12)*0.5); g.fill();
        g.beginPath(); g.moveTo(sx-CELL,sy+HALF); g.lineTo(sx,sy); g.lineTo(sx,sy+3.5); g.lineTo(sx-CELL,sy+HALF+3.5); g.closePath(); g.fillStyle='#465f39'; g.fill(); }
      continue;
    }
    // ── 뭍·산: 꼭짓점 높이 메시 ──
    const hNW=hV(x,y), hNE=hV(x+1,y), hSE=hV(x+1,y+1), hSW=hV(x,y+1);
    const pNW=w2i(x*CELL,y*CELL,hNW*HPX), pNE=w2i((x+1)*CELL,y*CELL,hNE*HPX),
          pSE=w2i((x+1)*CELL,(y+1)*CELL,hSE*HPX), pSW=w2i(x*CELL,(y+1)*CELL,hSW*HPX);
    g.beginPath(); g.moveTo(pNW.x,pNW.y); g.lineTo(pNE.x,pNE.y); g.lineTo(pSE.x,pSE.y); g.lineTo(pSW.x,pSW.y); g.closePath();
    let col;
    if(v===2){
      const hh=hC(x,y);
      // 높을수록 밝은 화강암 + 관목 얼룩(결정론). 산자락(h≈0 경계)은 풀과 섞는다.
      const t=Math.min(1,hh/8);
      // 한국 산 문법: 산체는 임상(숲), 화강암은 위로 갈수록 잦아지는 '노두 뙈기'로만
      const outcrop = 0.8*hash(x>>2,y>>2,51)+0.2*hash(x,y,52);   // 굵은 뙈기
      if(outcrop > 0.88 - t*0.24 && hh>2.2){
        col = mix('#6d6a60','#96938b', t);                               // 화강암 노두
        col = mix(col, '#5a564d', (hash(x,y,7)<0.35?hash(x,y,9)*0.5:0));
      } else {
        col = mix('#47603c','#37492f', t*0.8);                           // 임상 — 위로 갈수록 짙푸르게
        col = mix(col, '#2c3d26', (hash(x,y,7)<0.5?hash(x,y,9)*0.6:0));  // 수관 얼룩
      }
      if(hh<0.8) col = mix(col, GROUND, 0.5);
      if(style==='C' && hh>0.4){ // 단구 띠 — 등고 밴드
        col = mix(col, '#b7a98a', (Math.round(hh)%2===0)?0.10:0);
      }
    } else {
      const nearWater=(F.get(x+1,y)===1||F.get(x-1,y)===1||F.get(x,y+1)===1||F.get(x,y-1)===1);
      const r=0.72*hash(x>>3,y>>3,1)+0.28*hash(x,y,2);   // 저주파 뙈기 + 미세 변주
      col = r<0.25?'#547546': r<0.5?'#5a7c4a': r<0.75?'#61814f':'#587a4d';
      if(nearWater) col=mix(col,'#9a8a5e',0.45);
    }
    // 사면 명암 — 북서광(태양 52°/35° 와 일관): NW 높고 SE 낮으면 볕, 반대면 그늘
    const slope=(hNW-hSE)*0.5+(hNE-hSW)*0.25;
    const b=Math.max(0.55,Math.min(1.35,1+slope*0.35));
    g.fillStyle=shade('#'+mix(col,col,0).match(/\\d+/g).map(v=>(+v).toString(16).padStart(2,'0')).join(''), b);
    g.fill(); g.strokeStyle=g.fillStyle; g.lineWidth=1; g.stroke();
    // C안: 계단 수직면이 급한 곳(남·동으로 뚝 떨어지는 변)에 절벽 명암
    if(style==='C' && v===2){
      const dropS=hSW+hSE-hV(x,y+2)-hV(x+1,y+2);
      if(hC(x,y)-hC(x,y+1)>=1){ g.beginPath(); g.moveTo(pSW.x,pSW.y); g.lineTo(pSE.x,pSE.y);
        const q1=w2i((x+1)*CELL,(y+1)*CELL,hC(x,y+1)*HPX), q2=w2i(x*CELL,(y+1)*CELL,hC(x,y+1)*HPX);
        g.lineTo(q1.x,q1.y); g.lineTo(q2.x,q2.y); g.closePath(); g.fillStyle=shade(ROCK,0.5); g.fill(); }
      if(hC(x,y)-hC(x+1,y)>=1){ g.beginPath(); g.moveTo(pNE.x,pNE.y); g.lineTo(pSE.x,pSE.y);
        const q1=w2i((x+1)*CELL,(y+1)*CELL,hC(x+1,y)*HPX), q2=w2i((x+1)*CELL,y*CELL,hC(x+1,y)*HPX);
        g.lineTo(q1.x,q1.y); g.lineTo(q2.x,q2.y); g.closePath(); g.fillStyle=shade(ROCK,0.72); g.fill(); }
    }
    // 소품 — 실제 게임 스프라이트 (결 비교용). 뭍에 나무·수풀, 산자락에 바위.
    if(v===0){
      const r=hash(x,y,21);
      if(r>0.982){ const im=sprites[['tree1','tree2','tree3'][(hash(x,y,22)*3)|0]];
        const c=w2i(x*CELL+HALF,y*CELL+HALF); const sc=104/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc); }
      else if(r>0.958){ const im=sprites.bush1; const c=w2i(x*CELL+HALF,y*CELL+HALF); const sc=34/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc); }
    } else if(v===2 && hC(x,y)>=1.2 && hash(x,y,33)>0.955){
      const outc = 0.8*hash(x>>2,y>>2,51)+0.2*hash(x,y,52);
      if(outc <= 0.88 - Math.min(1,hC(x,y)/8)*0.24){   // 노두가 아닌 임상 위에만
        const im=sprites[['tree1','tree2','tree3'][(hash(x,y,34)*3)|0]];
        const c=w2i(x*CELL+HALF,y*CELL+HALF,hC(x,y)*HPX); const sc=72/im.height;
        g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc);
      }
    } else if(v===2 && hC(x,y)<1.2 && hash(x,y,31)>0.88){
      const im=sprites.rock1; const c=w2i(x*CELL+HALF,y*CELL+HALF,hC(x,y)*HPX); const sc=40/im.height;
      g.drawImage(im,c.x-im.width*sc/2,c.y+HALF-im.height*sc,im.width*sc,im.height*sc);
    }
  }
  return cv;
}

const loaded={}; let pend=0;
for(const k in SPR){ pend++; const im=new Image(); im.onload=()=>{loaded[k]=im; if(--pend===0) go();}; im.src=SPR[k]; }
function go(){
  for(const [sk,S] of Object.entries(SCENES)){
    for(const st of ['A','B','C']){
      const cv=render(S,st,0.6,loaded); cv.id='cv-'+sk+'-'+st; document.body.appendChild(cv);
    }
  }
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mock-terrain.html', html);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 2400, height: 1600 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0, 300)));
  await page.goto('file:///tmp/mock-terrain.html');
  await page.waitForFunction(() => document.title === 'READY', { timeout: 20000 });
  fs.mkdirSync('/tmp/terrain-mock', { recursive: true });
  for (const sk of ['river', 'ridge']) for (const st of ['A', 'B', 'C']) {
    const el = await page.$('#cv-' + sk + '-' + st);
    await el.screenshot({ path: `/tmp/terrain-mock/${sk}-${st}.png` });
  }
  console.log('screenshots: /tmp/terrain-mock/');
  await browser.close();
})();
