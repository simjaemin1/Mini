#!/usr/bin/env node
// =============================================================================
// 목업 — 산을 **진짜 높이맵 3D** 로 [재민 2026-08-08 "아스트로니어나 피크처럼?"]
//
// ★핵심 발견: 이 게임의 등각 투영에서 **높이 1칸 = 화면 32px** 이 정확히 떨어진다.
//     PPU·cos(30°)·ZSQ = 45.2548 × 0.8660 × 0.8165 = 32.00
//   (Blender 정본이 스프라이트를 셀에 맞추려고 고른 상수들인데, 그 부산물로
//    높이맵도 같은 격자에 딱 맞는다.)
//   ⇒ 그래서 **WebGL 도, 깊이 버퍼도 없이** 캔버스 2D 로 정확히 그릴 수 있다.
//     등각 높이맵은 뒤에서 앞으로(cx+cy 오름차순) 그리면 가림이 저절로 맞는다.
//     목업 단계에서 렌더러를 새로 만들 필요가 없다는 뜻이다.
//
// 높이는 **오늘 만든 가장자리 거리장을 그대로** 쓴다 — 새 지형 데이터가 필요 없다.
//   h(dE) = HMAX·(1 − e^(−dE/LAM)) + 능선 잡음(셀 해시 — Math.random 금지)
//
// 산출: /tmp/mt3d.png (1400×900, 1:1 게임 배율)
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const CX = +(process.env.CX || 1750), CY = +(process.env.CY || 74);
const SC_W = +(process.env.W || 96), SC_H = +(process.env.H || 76);
const HMAX = +(process.env.HMAX || 14), LAM = +(process.env.LAM || 7);
const VIEW = +(process.env.VIEW || 1);   // 1 = 게임 배율(1:1). 그 외는 **지도 보기**용 — 판정은 1:1 로만.

// ── 장면: 실제 바위 마스크 ────────────────────────────────────────────────────
const cx0 = CX - (SC_W >> 1), cy0 = CY - (SC_H >> 1);
const cells = [];
let nRock = 0;
for (let j = 0; j < SC_H; j++) {
  const row = [];
  for (let i = 0; i < SC_W; i++) {
    const x = (cx0 + i) * 32 + 16, y = (cy0 + j) * 32 + 16;
    const v = T.isWaterCellLocal('hanbando', x, y) ? 1 : (T.isRockCellLocal('hanbando', x, y) ? 2 : 0);
    row.push(v); if (v === 2) nRock++;
  }
  cells.push(row);
}
console.log(`장면 ${SC_W}×${SC_H}셀 · 바위 ${nRock} (${(nRock / (SC_W * SC_H) * 100).toFixed(1)}%)`);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0a0d10;margin:0}canvas{display:block}</style></head><body><script>
const W=${SC_W}, H=${SC_H}, CELLS=${JSON.stringify(cells)}, HMAX=${HMAX}, LAM=${LAM}, VIEW=${VIEW};
const CELL=32;
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};
const w2i=(wx,wy)=>({x:wx-wy,y:(wx+wy)/2});
const isRock=(i,j)=> i>=0&&j>=0&&i<W&&j<H&&CELLS[j][i]===2;

// ── 가장자리 거리(오늘 배치가 쓰는 것과 같은 것) ─────────────────────────────
const INF=1e6, d=new Float32Array(W*H);
for(let j=0;j<H;j++)for(let i=0;i<W;i++) d[j*W+i]=isRock(i,j)?INF:0;
const at=(i,j)=>(i<0||j<0||i>=W||j>=H)?INF:d[j*W+i];
for(let j=0;j<H;j++)for(let i=0;i<W;i++){const k=j*W+i;if(d[k]===0)continue;
  d[k]=Math.min(d[k],at(i-1,j)+1,at(i,j-1)+1,at(i-1,j-1)+1.414,at(i+1,j-1)+1.414);}
for(let j=H-1;j>=0;j--)for(let i=W-1;i>=0;i--){const k=j*W+i;if(d[k]===0)continue;
  d[k]=Math.min(d[k],at(i+1,j)+1,at(i,j+1)+1,at(i+1,j+1)+1.414,at(i-1,j+1)+1.414);}

// ── 높이 (셀 단위. 1칸 = 화면 32px) ──────────────────────────────────────────
//   ★셀마다 딱 정해진 값이라 "산 = 바위 셀"이 **구조적으로** 성립한다.
//     스프라이트처럼 발자국이 넘칠 여지가 없다 — ②가 정의상 0이다.
// 값 잡음 — 격자점 해시를 부드럽게 이어 붙인다(저주파). Math.random 금지.
function vn(x,y,s){
  const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi;
  const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash(xi,yi,s), b=hash(xi+1,yi,s), c=hash(xi,yi+1,s), e=hash(xi+1,yi+1,s);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+e*u)*v;
}
const hgt=new Float32Array(W*H);
for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  if(!isRock(i,j)){hgt[j*W+i]=0;continue;}
  const dE=d[j*W+i];
  let h=HMAX*(1-Math.exp(-dE/LAM));
  // ★잡음은 **저주파**여야 한다. 1차 판은 셀마다 ±1.9칸(=±60px)을 흔들어
  //   마인크래프트 자갈밭이 됐다. 산의 결은 셀 단위가 아니라 수십 셀 단위다.
  const t=Math.min(1,dE/3);
  // 결은 세 겹으로 — 큰 능선(파장 14) · 중간 골(6) · 잔 결(2.6)
  h += t*(3.4*(vn(i/14,j/14,29)-0.5)
        + 2.0*(vn(i/6,j/6,31)-0.5)
        + 0.9*(vn(i/2.6,j/2.6,37)-0.5));
  hgt[j*W+i]=Math.max(0.12,h);
}
// ★평활 — 이웃과의 높이차를 줄여 계단을 없앤다. 바위 밖은 0 이라 가장자리가 저절로 내려간다.
for(let pass=0;pass<1;pass++){   // ★평활 1패스 — 3패스는 산을 민둥산으로 만들었다
  const t2=Float32Array.from(hgt);
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    if(!isRock(i,j)) continue;
    let sum=t2[j*W+i]*2, w=2;
    for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){
      const ii=i+a, jj=j+b;
      sum += (ii<0||jj<0||ii>=W||jj>=H)?0:t2[jj*W+ii]; w++;
    }
    hgt[j*W+i]=sum/w;
  }
}
const hAt=(i,j)=> (i<0||j<0||i>=W||j>=H)?0:hgt[j*W+i];
// ★꼭짓점 높이 = 그 점에 닿는 네 셀의 평균. 셀을 평면으로 그리면 계단이 남는다 —
//   꼭짓점으로 그려야 **면이 이어진** 진짜 메시가 된다(수직 벽이 아예 안 생긴다).
const cor=(i,j)=> (hAt(i-1,j-1)+hAt(i,j-1)+hAt(i-1,j)+hAt(i,j))/4;

// ── 색 ───────────────────────────────────────────────────────────────────────
//   높이로 색이 변한다(아래 이끼 → 위 화강암). 면마다 음영이 다르다.
const lerp=(a,b,t)=>a+(b-a)*t;
function baseCol(h){
  const t=Math.max(0,Math.min(1,h/HMAX));
  const lo=[84,94,66], hi=[178,173,162];   // 이끼낀 아래 → 마른 화강암 위
  return [lerp(lo[0],hi[0],t),lerp(lo[1],hi[1],t),lerp(lo[2],hi[2],t)];
}
const SHADE={top:1.0, right:0.74, left:0.53};   // 태양 52°/−35° 를 면별 상수로
function css(c,k,n){
  const j=1+0.06*(n-0.5);   // 셀별 미세 얼룩
  return 'rgb('+Math.round(c[0]*k*j)+','+Math.round(c[1]*k*j)+','+Math.round(c[2]*k*j)+')';
}

const cv=document.createElement('canvas');cv.width=1400;cv.height=900;
const g=cv.getContext('2d');
g.fillStyle='#0a0d10';g.fillRect(0,0,1400,900);
const ctr=w2i((W/2)*CELL,(H/2)*CELL);
g.save();g.translate(700,500);g.scale(VIEW,VIEW);g.translate(-ctr.x,-ctr.y);

// ★높이맵 — 뒤에서 앞으로(i+j 오름차순). 등각 높이맵은 이 순서면 가림이 저절로 맞는다.
//   ★풀·물 셀도 **같은 메시에** 넣는다(높이 0). 바위만 그렸더니 덩어리 앞면이 뚫려
//   배경(검정)이 삼각형으로 새어 나왔다 — 지면과 산은 하나의 이어진 면이어야 한다.
const order=[];
for(let j=0;j<H;j++)for(let i=0;i<W;i++) order.push([i,j]);
order.sort((a,b)=>(a[0]+a[1])-(b[0]+b[1]));
// ★빛 — Blender 정본 태양(52°/−35°)에서 유도한 방향
const L=[-0.452,-0.6455,0.6157];
for(const [i,j] of order){
  // 네 꼭짓점 높이 (칸 단위)
  const hNW=cor(i,j), hNE=cor(i+1,j), hSE=cor(i+1,j+1), hSW=cor(i,j+1);
  const p=(gi,gj,hh)=>{const c=w2i(gi*CELL,gj*CELL);return [c.x, c.y-hh*CELL];};
  const A=p(i,j,hNW), B=p(i+1,j,hNE), C=p(i+1,j+1,hSE), D=p(i,j+1,hSW);
  // 법선 — 월드(x,y,z=위)에서 대각 두 벡터의 외적
  const u=[CELL,CELL,(hSE-hNW)*CELL], v=[CELL,-CELL,(hNE-hSW)*CELL];
  let nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
  const ln=Math.hypot(nx,ny,nz)||1; nx/=ln;ny/=ln;nz/=ln;
  if(nz<0){nx=-nx;ny=-ny;nz=-nz;}
  const lam=Math.max(0.16, nx*L[0]+ny*L[1]+nz*L[2]);
  const hAvg=(hNW+hNE+hSE+hSW)/4;
  const c0 = CELLS[j][i]===1 ? [60,85,112]
           : (isRock(i,j) || hAvg>0.05) ? baseCol(hAvg)
           : (hash(i,j,5)<0.5?[93,116,68]:[99,121,74]);
  const k=0.42+0.92*lam;                      // 환경광 + 직사광
  g.fillStyle=css(c0,k,hash(i,j,91));
  g.beginPath();g.moveTo(A[0],A[1]);g.lineTo(B[0],B[1]);g.lineTo(C[0],C[1]);g.lineTo(D[0],D[1]);g.closePath();
  g.fill();
  // 인접 사각형 사이 실틈 방지
  g.strokeStyle=g.fillStyle;g.lineWidth=1;g.stroke();
}
g.restore();
g.fillStyle='rgba(0,0,0,0.62)';g.fillRect(0,0,1400,26);
g.fillStyle='#e6dfd0';g.font='15px sans-serif';
g.fillText(VIEW===1
  ? '높이맵 3D 목업 — 1:1 게임 배율 · 높이 1칸=32px · HMAX '+HMAX+' LAM '+LAM+' · 바위셀=산(②=0 구조적)'
  : '★지도 보기 '+VIEW+'배 — 게임은 이 배율을 안 쓴다. 지형 생성 결만 보는 용도(판정은 1:1 로)',10,18);
cv.id='cv';document.body.appendChild(cv);
document.title='READY';
</script></body></html>`;
fs.writeFileSync('/tmp/mt3d.html', html);
(async () => {
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 300)));
  await pg.goto('file:///tmp/mt3d.html');
  await pg.waitForFunction(() => document.title === 'READY', { timeout: 120000 });
  const el = await pg.$('#cv');
  const out = process.env.OUT || '/tmp/mt3d.png';
  await el.screenshot({ path: out });
  console.log('산출: ' + out);
  await br.close();
})();
