#!/usr/bin/env node
// mock-terrain-v4.js — 사실주의 개정판 [재민 지적 4건 반영]
//   ① 수면 = 뭍과 같은 높이 (파인 물·둑 절벽 삭제 — 블록 느낌 제거)
//   ② 물가 = 셀 각이 아니라 부드러운 곡선 (서브셀 이중선형 마스크 + 포말 + 젖은 띠)
//   ③ 물 = '셰이더 물' 픽셀 계산 (흐름 방향 파동 + 노멀 + 태양 반사 — M&B 문법.
//      실구현은 WebGL 프래그먼트 셰이더로 60fps — 여기선 오프라인 30fps GIF)
//   ④ 풀 = 게임 카메라 각도(방위45·고도30)에서 구운 grass_angled 를 '화면 공간' 타일링
//      (탑다운 눌러붙임이 '풀 얼룩'의 원인이었다)
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

const RIVERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando.rivers;
function flowField(S) {
  const x0 = S.cx0 * 32, y0 = S.cy0 * 32, x1 = (S.cx0 + S.w) * 32, y1 = (S.cy0 + S.h) * 32;
  const segs = [];
  for (const r of RIVERS) for (let i = 0; i + 1 < r.path.length; i++) {
    const a = r.path[i].pos, b = r.path[i + 1].pos, pad = Math.max(r.path[i].width, 600);
    if (Math.max(a[0], b[0]) < x0 - pad || Math.min(a[0], b[0]) > x1 + pad ||
        Math.max(a[1], b[1]) < y0 - pad || Math.min(a[1], b[1]) > y1 + pad) continue;
    segs.push([a[0], a[1], b[0], b[1]]);
  }
  const ang = [];
  for (let cy = 0; cy < S.h; cy++) {
    const row = [];
    for (let cx = 0; cx < S.w; cx++) {
      if (S.cells[cy][cx] !== 1) { row.push(0); continue; }
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
  grassA: b64(path.join(TEX, 'grass_angled.png')),
  canopy: b64(path.join(TEX, 'canopy.png')), rock: b64(path.join(TEX, 'rock.png')),
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
// 화면→월드 역변환 (z=0 지면): wx=(2y+x)/2, wy=(2y-x)/2
const i2w=(ix,iy)=>({wx:(2*iy+ix)/2, wy:(2*iy-ix)/2});
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};

// ── 타일 가능 값 노이즈 (64격자 주기 — GIF 루프용) ──
const NG=64, noiseLat=new Float32Array(NG*NG);
for(let j=0;j<NG;j++)for(let i=0;i<NG;i++) noiseLat[j*NG+i]=hash(i,j,777);
function vnoise(u,v){ // u,v: 월드px/8 스케일 권장
  u=((u%NG)+NG)%NG; v=((v%NG)+NG)%NG;
  const i0=u|0,j0=v|0,i1=(i0+1)%NG,j1=(j0+1)%NG,fu=u-i0,fv=v-j0;
  const su=fu*fu*(3-2*fu),sv=fv*fv*(3-2*fv);
  const a=noiseLat[j0*NG+i0],b=noiseLat[j0*NG+i1],c=noiseLat[j1*NG+i0],d=noiseLat[j1*NG+i1];
  return a+(b-a)*su+(c-a)*sv+(a-b-c+d)*su*sv;
}

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
// 셀 값 이중선형 (셀 중심 기준) — 서브셀 물 마스크·수심·흐름
function bilin(S,arr,wxp,wyp,fallback){ // wxp,wyp: 존-로컬 px
  const fx=wxp/CELL-0.5, fy=wyp/CELL-0.5;   // ★장면-로컬 셀계 (cx0 재감산 금지 — v4 첫 렌더 전면 침수의 원인)
  const x0=Math.floor(fx),y0=Math.floor(fy),tx=fx-x0,ty=fy-y0;
  const at=(x,y)=>{x=Math.max(0,Math.min(S.w-1,x));y=Math.max(0,Math.min(S.h-1,y));
    const v=arr[y][x]; return v==null?fallback:v;};
  const a=at(x0,y0),b=at(x0+1,y0),c=at(x0,y0+1),d=at(x0+1,y0+1);
  return a+(b-a)*tx+(c-a)*ty+(a-b-c+d)*tx*ty;
}

function render(S,flow,scale,imgs,phase,view,waterOn,sharp,mode){
  const {w,h,cells}=S; const F=fields(S);
  const wMask=cells.map(r=>r.map(v=>v===1?1:0));
  const wDeep=F.dLand.map((r,y)=>r.map((d,x)=>cells[y][x]===1?Math.min(1,d/6):0));
  const cosF=flow?flow.map(r=>r.map(a=>Math.cos(a))):null;
  const sinF=flow?flow.map(r=>r.map(a=>Math.sin(a))):null;

  const cv=document.createElement('canvas');
  const isoW=view?view.w:((w+h)*HALF*2+120), isoH=view?view.h:((w+h)*HALF+320);
  cv.width=Math.round(isoW*scale); cv.height=Math.round(isoH*scale);
  const g=cv.getContext('2d');
  const TX=view?view.tx:(h*CELL+60), TY=view?view.ty:190;
  g.scale(scale,scale); g.translate(TX,TY);
  g.fillStyle='#0a0d10'; g.fillRect(-TX,-TY,isoW,isoH);

  const HPX=26;
  const hC=(x,y)=>{ if(F.get(x,y)!==2)return 0;
    const d=(F.dOpen[Math.max(0,Math.min(h-1,y))]||[])[Math.max(0,Math.min(w-1,x))]||0;
    let hh=Math.min(8,d*0.95); if(d>2)hh+=(hash(x,y,41)-0.5)*1.4; return hh; };
  const hV=(vx,vy)=>(hC(vx-1,vy-1)+hC(vx,vy-1)+hC(vx-1,vy)+hC(vx,vy))/4;

  // ── 1) 지면: 화면 공간 풀 타일링 (각도 베이크 — 눌러붙임 없음) ──
  const pat=g.createPattern(imgs.grassA,'repeat');
  const pm=new DOMMatrix(); pm.a=0.295; pm.d=0.295;  // ★1셀=1m 정합: 베이크 153.6px/m ÷ 화면 45.25px/m (0.55는 풀이 1.86배 컸다 — 재민 지적)
  pat.setTransform(pm);
  g.save(); g.fillStyle=pat;
  g.fillRect(-TX,-TY,isoW,isoH); g.restore();

  // ── 2) 산: 높이 메시 + 화면 공간 수관/화강암 (조각보 없는 연속 질감) ──
  function texTriS(img,P3,uvScale,dark){ // 화면 공간 UV
    g.save(); g.beginPath();
    const gx=(P3[0].x+P3[1].x+P3[2].x)/3, gy=(P3[0].y+P3[1].y+P3[2].y)/3;
    const ex=(p)=>{const dx=p.x-gx,dy=p.y-gy,L=Math.hypot(dx,dy)||1;return {x:p.x+dx/L*0.8,y:p.y+dy/L*0.8};};
    const q=P3.map(ex);
    g.moveTo(q[0].x,q[0].y);g.lineTo(q[1].x,q[1].y);g.lineTo(q[2].x,q[2].y);g.closePath();g.clip();
    const p2=g.createPattern(img,'repeat'); const m=new DOMMatrix(); m.a=uvScale; m.d=uvScale;
    p2.setTransform(m); g.fillStyle=p2; g.fill();
    if(dark){ g.fillStyle=dark; g.fill(); }
    g.restore();
  }
  for(let s=0;s<w+h-1;s++) for(let x=Math.max(0,s-h+1);x<=Math.min(w-1,s);x++){
    const y=s-x; if(cells[y][x]!==2) continue;
    const hNW=hV(x,y),hNE=hV(x+1,y),hSE=hV(x+1,y+1),hSW=hV(x,y+1);
    const P=[w2i(x*CELL,y*CELL,hNW*HPX),w2i((x+1)*CELL,y*CELL,hNE*HPX),
             w2i((x+1)*CELL,(y+1)*CELL,hSE*HPX),w2i(x*CELL,(y+1)*CELL,hSW*HPX)];
    const hh=hC(x,y),t=Math.min(1,hh/8);
    const outcrop=0.8*hash(x>>2,y>>2,51)+0.2*hash(x,y,52);
    const slope=(hNW-hSE)*0.5+(hNE-hSW)*0.25;
    let shadeCol=null;
    if(slope>0) shadeCol='rgba(255,246,225,'+Math.min(0.20,slope*0.09)+')';
    else if(slope<0) shadeCol='rgba(8,12,20,'+Math.min(0.40,-slope*0.17)+')';
    const isRock=(outcrop>0.88-t*0.24&&hh>2.2);
    const base=isRock?'rgba(70,66,60,0.28)':'rgba(10,22,8,'+(0.10+0.26*t)+')';
    texTriS(isRock?imgs.rock:imgs.canopy,[P[0],P[1],P[2]],isRock?0.5:0.7,base);
    texTriS(isRock?imgs.rock:imgs.canopy,[P[0],P[2],P[3]],isRock?0.5:0.7,base);
    if(shadeCol){ g.beginPath();g.moveTo(P[0].x,P[0].y);for(let i=1;i<4;i++)g.lineTo(P[i].x,P[i].y);g.closePath();g.fillStyle=shadeCol;g.fill(); }
  }

  // ── 3) 물: 픽셀 셰이더 (수면=지면 높이·부드러운 물가·흐름 파동·태양 반사) ──
  if(waterOn){
    const W=cv.width,H=cv.height;
    const id=g.getImageData(0,0,W,H); const px=id.data;
    // 조명 (Blender 정본 태양과 일관: 북서상공)
    const L=[-0.42,-0.58,0.70]; const Ln=Math.hypot(L[0],L[1],L[2]); L[0]/=Ln;L[1]/=Ln;L[2]/=Ln;
    const V=[0.5,-0.5,0.707];   // 카메라(방위45 고도30→45)
    const Hx=L[0]+V[0],Hy=L[1]+V[1],Hz=L[2]+V[2]; const Hn=Math.hypot(Hx,Hy,Hz);
    const HV=[Hx/Hn,Hy/Hn,Hz/Hn];
    const tt=phase;   // 0..1 루프
    const ADV=64;     // 루프당 흘림(월드px) — 노이즈 64주기와 정합(이음 없는 루프)
    for(let py=0;py<H;py++){
      for(let pxi=0;pxi<W;pxi++){
        const ix=pxi/scale-TX, iy=py/scale-TY;
        const wpt=i2w(ix,iy);
        const wxp=wpt.wx+S.cx0*CELL*0, wyp=wpt.wy;   // 이미 존-로컬 iso 기준(장면 원점 0)
        // 장면 로컬 px → 셀계
        let m, edgeDist=99;
        const DROP=(mode==='block')?11:(mode==='blockcell'?10:5);
        if(sharp){ const cx=Math.max(0,Math.min(S.w-1,Math.floor(wpt.wx/CELL))), cy=Math.max(0,Math.min(S.h-1,Math.floor(wpt.wy/CELL)));
          if(!wMask[cy][cx]) continue;
          m=1;
          // ★포말은 '뭍과 맞닿은 변'에서 7px 이내만 — 셀 전체에 뿌리면 이상한 문양이 된다(재민 지적)
          const lx=wpt.wx-cx*CELL, ly=wpt.wy-cy*CELL;
          // ★아래쪽 경계(남 y+1·동 x+1 변 — 화면 하단) 포말 제거, 위쪽(북·서 변)만 [재민]
          if(cy>0        &&!wMask[cy-1][cx]) edgeDist=Math.min(edgeDist,ly);
          if(cx>0        &&!wMask[cy][cx-1]) edgeDist=Math.min(edgeDist,lx);
        } else {
          m=bilin(S,wMask,wpt.wx,wpt.wy,0);
          if(m<0.42) continue;                          // 뭍
        }
        // ★★절충 [재민 확정: "갈색으로 뭍이 드러나는 게 좋아" + 곶 끝 떠 있는 판은 싫다]
        //   두 평면 + 경사 단면은 유지하되, 단면은 '뒤의 뭍이 두꺼울 때만' 그린다.
        //   얇은 혀(곶 끝 폭 <10px)에서는 단면을 생략하고 물이 지면 높이에서 그냥 만난다 —
        //   떠 있는 판으로 읽힐 수 있는 자리에서만 밑면이 사라진다.
        const uPt=i2w(ix,iy-DROP);
        const mAt=(q)=>sharp?(wMask[Math.max(0,Math.min(S.h-1,Math.floor(q.wy/CELL)))][Math.max(0,Math.min(S.w-1,Math.floor(q.wx/CELL)))]?1:0)
                            :bilin(S,wMask,q.wx,q.wy,0);
        const thr=sharp?1:0.42;
        if(mode==='blockcell'){
          // ★블록 문법 [재민: "그냥 블록으로 만들면 되는 거 아냐? 평면 말고"] — 뭍 셀 = 프리즘.
          //   수면은 -DROP 평면(uPt 표본). 단면은 픽셀이 아니라 '벡터 프리즘 면'이 나중에 덮는다.
          if(mAt(uPt)<thr) continue;   // 면이 덮을 자리 — 물 그리지 않음
          wpt.wx=uPt.wx; wpt.wy=uPt.wy;
        } else if(mAt(uPt)<thr){   // (구 절충 로직 — blockcell 외 모드용)
          const back=mAt(i2w(ix,iy-DROP-10));
          if(back<thr){
            let vpos=1;
            for(let k=1;k<=DROP;k++){ if(mAt(i2w(ix,iy-DROP+k))>=thr){ vpos=k/DROP; break; } }
            const nz=vnoise(uPt.wx/3.1+55,uPt.wy/3.1+77);
            const o2=(py*W+pxi)*4, t2=1-vpos;
            px[o2]  =(52+26*nz)*(0.7+0.5*t2);
            px[o2+1]=(48+22*nz)*(0.75+0.5*t2);
            px[o2+2]=(34+16*nz)*(0.8+0.45*t2);
            continue;
          }
        } else { wpt.wx=uPt.wx; wpt.wy=uPt.wy; }
        const deep=bilin(S,wDeep,wpt.wx,wpt.wy,0);
        const fx=bilin(S,cosF,wpt.wx,wpt.wy,1), fy=bilin(S,sinF,wpt.wx,wpt.wy,0);
        const fL=Math.hypot(fx,fy)||1, dx=fx/fL, dy=fy/fL;
        // 흐름 좌표계 (along, cross)
        const al=wpt.wx*dx+wpt.wy*dy - ADV*tt;        // 하류로 흘러감
        const cr=-wpt.wx*dy+wpt.wy*dx;
        // 파동: 흐름 방향 2파 + 타일 노이즈 잔물결 (전부 루프 주기 정합)
        const ampMod=0.45+0.9*vnoise(wpt.wx/23+31,wpt.wy/23);   // 진폭 얼룩 — 골판지 제거
        const A1=0.85*ampMod,A2=0.55*ampMod;
        const p1=al*(2*Math.PI/64)+cr*0.02, p2=al*(2*Math.PI/32)+cr*0.07;
        // ★루프 정합 크로스페이드: 노이즈 advection 은 한 주기가 안 맞아 루프점에서 되감긴다(재민: "순간이동")
        //   t 와 t-1 두 표본을 tt 로 섞으면 루프가 이음새 없이 돈다. 실게임(연속 시간 셰이더)엔 불필요.
        const nAt=(sc,ox,oy,ph)=>vnoise((wpt.wx-ADV*ph*dx)/sc+ox,(wpt.wy-ADV*ph*dy)/sc+oy);
        const n1=((1-tt)*nAt(8,0,0,tt)+tt*nAt(8,0,0,tt-1))-0.5;
        const n2=((1-tt)*nAt(3.2,17,9,tt)+tt*nAt(3.2,17,9,tt-1))-0.5;   // 잔주름 옥타브
        // 경사(노멀) — 해석 미분
        const s1=A1*Math.cos(p1)*(2*Math.PI/64), s2=A2*Math.cos(p2)*(2*Math.PI/32);
        const sn=n1*0.55+n2*0.38;
        let nx=-(s1+s2)*dx - sn*dx, ny=-(s1+s2)*dy - sn*dy, nz=1;
        const nL=Math.hypot(nx,ny,nz); nx/=nL;ny/=nL;nz/=nL;
        const diff=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]);
        let spec=Math.max(0,nx*HV[0]+ny*HV[1]+nz*HV[2]); spec=Math.pow(spec,90)*(0.55+0.45*deep);
        // 수색: 얕은 옥빛 → 깊은 남빛 + 하늘 반사
        let r=26+ (95-26)*(1-deep)*0.8, gg=64+(150-64)*(1-deep)*0.8, b=96+(150-96)*(1-deep)*0.55;
        r=r*(0.55+0.5*diff)+118*0.16; gg=gg*(0.55+0.5*diff)+140*0.16; b=b*(0.6+0.45*diff)+160*0.20;
        r+=spec*230; gg+=spec*240; b+=spec*245;
        // 물가 포말 + 얕은물 바닥 비침
        const shore=sharp?Math.min(1,edgeDist/7):Math.min(1,Math.max(0,(m-0.42)/0.16));   // 0=뭍 경계,1=완전 물
        let foamOK=true;
        if(!sharp&&shore<1){ // ★뭍이 남동(화면 아래)쪽이면 포말 생략 — 기울기로 뭍 방향 판정 [재민]
          const gx=bilin(S,wMask,wpt.wx+6,wpt.wy,0)-bilin(S,wMask,wpt.wx-6,wpt.wy,0);
          const gy=bilin(S,wMask,wpt.wx,wpt.wy+6,0)-bilin(S,wMask,wpt.wx,wpt.wy-6,0);
          if(gx+gy<0.05) foamOK=false;   // 방향: 뭍이 북서일 때만
          if(Math.hypot(gx,gy)<0.14) foamOK=false;   // ★크기: 곶 끝(기울기 뭉개짐)의 포말 흰 덩어리 제거[재민]
        }
        if(foamOK&&shore<1){
          const fo=vnoise(wpt.wx/4.2+99,wpt.wy/4.2);   // ★시간 고정 — 흐르는 포말이 꼭짓점 판정 경계에서 깜빡였다(재민 버그 보고)
          const foam=Math.max(0,(1-shore)*1.25*(fo-0.28))*1.5;   // 노이즈 문턱 — 띠가 아니라 얼룩
          if(foam>0){ const ff=Math.min(0.85,foam);
            r=r*(1-ff)+232*ff; gg=gg*(1-ff)+238*ff; b=b*(1-ff)+240*ff; }
        }
        const o=(py*W+pxi)*4;
        const aBlend=sharp?1:Math.min(1,(m-0.42)/0.08);   // 물가 페더(곡선판) / 경계 그대로(각진판)
        px[o]  =px[o]  *(1-aBlend)+r *aBlend;
        px[o+1]=px[o+1]*(1-aBlend)+gg*aBlend;
        px[o+2]=px[o+2]*(1-aBlend)+b *aBlend;
      }
    }
    g.setTransform(1,0,0,1,0,0);
    g.putImageData(id,0,0);
    g.setTransform(scale,0,0,scale,TX*scale,TY*scale);
    // 젖은 띠(뭍 쪽) — 물가 바로 바깥 어둡고 차게
    // (픽셀 패스에서 m 0.30~0.42 대역을 살짝 어둡게 — 두 번째 미니 패스)
    const id2=g.getImageData(0,0,W,H); const p2=id2.data;
    if(!sharp)
    for(let py=0;py<H;py++)for(let pxi=0;pxi<W;pxi++){
      const ix=pxi/scale-TX, iy=py/scale-TY; const wpt=i2w(ix,iy);
      const m=bilin(S,wMask,wpt.wx,wpt.wy,0);
      if(m>=0.42||m<0.16) continue;
      const wet=(m-0.16)/(0.42-0.16);
      const o=(py*W+pxi)*4, dk=1-0.28*wet;
      p2[o]*=dk; p2[o+1]*=dk*0.98; p2[o+2]*=dk*1.02;
    }
    g.setTransform(1,0,0,1,0,0); g.putImageData(id2,0,0);
    g.setTransform(scale,0,0,scale,TX*scale,TY*scale);
  }

  // ── 3.5) 블록 프리즘 면 (blockcell): 물에 접한 뭍 셀의 남·동 변에서 수직면 ──
  if(waterOn&&mode==='blockcell'){
    const DROPB=10;
    const dirtPat=g.createPattern(imgs.grassA,'repeat');   // 흙 대신 어두운 톤 오버레이로 — 질감은 단색+노이즈면 충분
    for(let s2=0;s2<w+h-1;s2++) for(let x=Math.max(0,s2-h+1);x<=Math.min(w-1,s2);x++){
      const y=s2-x; if(cells[y][x]===1) continue;   // 뭍 셀만
      const isW=(xx,yy)=>{xx=Math.max(0,Math.min(w-1,xx));yy=Math.max(0,Math.min(h-1,yy));return cells[yy][xx]===1;};
      // 남면 (물이 y+1) — 어둡게 0.58
      if(isW(x,y+1)){
        const a=w2i(x*CELL,(y+1)*CELL), b=w2i((x+1)*CELL,(y+1)*CELL);
        g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(b.x,b.y+DROPB); g.lineTo(a.x,a.y+DROPB); g.closePath();
        g.fillStyle='#4a3a26'; g.fill();
        g.beginPath(); g.moveTo(a.x,a.y+DROPB-2); g.lineTo(b.x,b.y+DROPB-2); g.lineTo(b.x,b.y+DROPB); g.lineTo(a.x,a.y+DROPB); g.closePath();
        g.fillStyle='rgba(15,25,35,0.55)'; g.fill();   // 물 접촉선
        g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(b.x,b.y+2.2); g.lineTo(a.x,a.y+2.2); g.closePath();
        g.fillStyle='#4e6b40'; g.fill();               // 풀 넘김
      }
      // 동면 (물이 x+1) — 밝게 0.74
      if(isW(x+1,y)){
        const a=w2i((x+1)*CELL,y*CELL), b=w2i((x+1)*CELL,(y+1)*CELL);
        g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(b.x,b.y+DROPB); g.lineTo(a.x,a.y+DROPB); g.closePath();
        g.fillStyle='#61492f'; g.fill();
        g.beginPath(); g.moveTo(a.x,a.y+DROPB-2); g.lineTo(b.x,b.y+DROPB-2); g.lineTo(b.x,b.y+DROPB); g.lineTo(a.x,a.y+DROPB); g.closePath();
        g.fillStyle='rgba(15,25,35,0.5)'; g.fill();
        g.beginPath(); g.moveTo(a.x,a.y); g.lineTo(b.x,b.y); g.lineTo(b.x,b.y+2.2); g.lineTo(a.x,a.y+2.2); g.closePath();
        g.fillStyle='#526e44'; g.fill();
      }
    }
  }

  // ── 4) 소품 (실제 게임 스프라이트) ──
  for(let s=0;s<w+h-1;s++) for(let x=Math.max(0,s-h+1);x<=Math.min(w-1,s);x++){
    const y=s-x,v=cells[y][x];
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
  const c1=render(SCENES.river,FLOW.river,0.62,imgs,0,null,true,false,'ramp'); c1.id='cv-river'; document.body.appendChild(c1);
  const c3=render(SCENES.river,FLOW.river,1.0,imgs,0,{w:1000,h:640,tx:-300,ty:-140},true,false,'ramp'); c3.id='cv-close'; document.body.appendChild(c3);
  const c4=render(SCENES.river,FLOW.river,1.0,imgs,0,{w:1000,h:640,tx:-300,ty:-140},true,true,'blockcell'); c4.id='cv-sharp'; document.body.appendChild(c4);
  window._gif=[]; window._gifSharp=[];
  for(let f=0;f<24;f++){
    window._gif.push(render(SCENES.river,FLOW.river,1.0,imgs,f/24,{w:1000,h:640,tx:-300,ty:-140},true,false,'ramp').toDataURL('image/png'));
    window._gifSharp.push(render(SCENES.river,FLOW.river,1.0,imgs,f/24,{w:1000,h:640,tx:-300,ty:-140},true,true,'blockcell').toDataURL('image/png'));
  }
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mock-terrain-v4.html', html);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 2400, height: 1600 } })).newPage();
  page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0, 300)));
  await page.goto('file:///tmp/mock-terrain-v4.html');
  await page.waitForFunction(() => document.title === 'READY', { timeout: 180000 });
  fs.mkdirSync('/tmp/terrain-mock-v4', { recursive: true });
  for (const id of ['cv-river', 'cv-close', 'cv-sharp']) {
    const el = await page.$('#' + id);
    await el.screenshot({ path: `/tmp/terrain-mock-v4/${id.replace('cv-', '')}.png` });
  }
  const frames = await page.evaluate(() => window._gif);
  frames.forEach((d, i) => fs.writeFileSync(`/tmp/terrain-mock-v4/gif_${String(i).padStart(2, '0')}.png`,
    Buffer.from(d.split(',')[1], 'base64')));
  const framesS = await page.evaluate(() => window._gifSharp);
  framesS.forEach((d, i) => fs.writeFileSync(`/tmp/terrain-mock-v4/gifs_${String(i).padStart(2, '0')}.png`,
    Buffer.from(d.split(',')[1], 'base64')));
  console.log('done:', frames.length, 'frames + 3 stills');
  await browser.close();
})();
