#!/usr/bin/env node
// =============================================================================
// 시안 — 산 덮개 [재민 2026-08-07: "갈색 타일이 보이면 안 될 정도로 산이 덮어야지"]
//
// ★★**1:1(게임 배율)로만 그린다.** 옛 `mock-mountain.js` 는 `scale=0.22` 로 장면을 4.5배
//   축소해 보여줬다. 시안 왕복 12차가 전부 게임이 쓰지 않는 배율에서 판정됐다.
//   여기서는 1 iso px = 1 화면 px — 게임과 같다.
//
// ★★장면을 **둘** 쓴다. 빽빽한 능선에서만 되는 덮개는 고친 게 아니다.
//     ① 굽이   — 한울대간 최대 곡률(바위 99%)
//     ② 마을옆 — 라이브 실측 자리(1750,74). 여기서 맨 바위 70.9% 가 나왔다.
//
// 후보
//   A 현행 : 능선 중심선을 걷고 **밴드 폭만큼 한 장을 확대**(배율 중앙값 5.8)
//   C 계층 : 크기를 밴드 폭이 아니라 **바위 덩어리 가장자리까지의 거리**로 정하고
//            큰 봉우리(안쪽)·중간(어깨)·잔 봉우리(자락)를 겹쳐 덮는다. 남은 틈은 알파로 찾아 메운다.
//
// ★시안이 제 숫자를 들고 나온다 — 산 레이어만 투명 캔버스에 그려 바위 셀마다 알파를 찍어
//   **맨 바위 %** 를 직접 센다. 눈이 아니라 수다. 덧붙여 화면 내 장수와 덮어쓰기 MP(출하 가능성)도 잰다.
//
// 환경변수
//   MT_ASSETS   스프라이트 디렉토리 (기본 scripts/mountain_renders)
//   MT_SCALE    C 후보 배율 배수 (기본 1.0). 여러 값을 쉼표로 주면 각각 뽑는다.
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../server/terrain.js');
const ROOT = path.join(__dirname, '..');
const MT = process.env.MT_ASSETS || path.join(__dirname, 'mountain_renders');
const SCALES = (process.env.MT_SCALE || '1.0').split(',').map(Number);
const HARD = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const RIDGES = HARD.ridges;

// ── 장면 둘 ──────────────────────────────────────────────────────────────────
const main = RIDGES[0].path;
let bestI = 60, bestTurn = 0;
for (let i = 30; i < Math.min(main.length - 30, 400); i += 5) {
  const a = main[i - 25].pos, b = main[i].pos, c = main[i + 25].pos;
  const v1 = Math.atan2(b[1] - a[1], b[0] - a[0]), v2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
  let d = Math.abs(v2 - v1); if (d > Math.PI) d = 2 * Math.PI - d;
  if (d > bestTurn) { bestTurn = d; bestI = i; }
}
const SC_W = 80, SC_H = 56;
function mkScene(name, ccx, ccy) {
  const s = { name, cx0: ccx - SC_W / 2 | 0, cy0: ccy - SC_H / 2 | 0, w: SC_W, h: SC_H, cells: [] };
  let nRock = 0;
  for (let cy = 0; cy < SC_H; cy++) {
    const row = [];
    for (let cx = 0; cx < SC_W; cx++) {
      const x = (s.cx0 + cx) * 32 + 16, y = (s.cy0 + cy) * 32 + 16;
      const v = T.isWaterCellLocal('hanbando', x, y) ? 1 : (T.isRockCellLocal('hanbando', x, y) ? 2 : 0);
      row.push(v); if (v === 2) nRock++;
    }
    s.cells.push(row);
  }
  s.nRock = nRock;
  // 장면 안 능선 경로(장면 로컬 좌표)
  const x0 = s.cx0 * 32, y0 = s.cy0 * 32, x1 = x0 + s.w * 32, y1 = y0 + s.h * 32;
  s.paths = [];
  for (const r of RIDGES) {
    let cur = null;
    for (const pt of r.path) {
      const inBox = pt.pos[0] > x0 - 2200 && pt.pos[0] < x1 + 2200 && pt.pos[1] > y0 - 2200 && pt.pos[1] < y1 + 2200;
      if (inBox) { if (!cur) { cur = { name: r.name, pts: [] }; s.paths.push(cur); } cur.pts.push({ x: pt.pos[0] - x0, y: pt.pos[1] - y0, w: pt.width }); }
      else cur = null;
    }
  }
  s.paths = s.paths.filter((p) => p.pts.length >= 2);
  return s;
}
// ★MT_SWEEP=N — 능선을 따라 N 자리를 표본으로 훑는다. 두 장면만 보고 "고쳤다"고 하면
//   빽빽한 능선에서만 되는 덮개를 못 걸러낸다(마을옆 장면이 정확히 그 반례였다).
const SWEEP = parseInt(process.env.MT_SWEEP || '0', 10);
let SCENES;
if (SWEEP > 0) {
  SCENES = [];
  const cand = [];
  for (const r of RIDGES) for (let i = 6; i < r.path.length - 6; i += 3) cand.push([r.name, r.path[i].pos]);
  const stride = Math.max(1, Math.floor(cand.length / SWEEP));
  for (let i = 0, k = 0; i < cand.length && SCENES.length < SWEEP; i += stride, k++) {
    const [nm, pos] = cand[i];
    const sc = mkScene(nm + '#' + k, Math.floor(pos[0] / 32), Math.floor(pos[1] / 32));
    if (sc.nRock > 200) SCENES.push(sc);      // 바위가 거의 없는 자리는 덮개를 말할 게 없다
  }
} else {
  SCENES = [
    mkScene('굽이', Math.floor(main[bestI].pos[0] / 32), Math.floor(main[bestI].pos[1] / 32)),
    mkScene('마을옆', 1750, 74),
  ];
}
if (SWEEP > 0) console.log(`표본 ${SCENES.length}장면 (바위 200셀 이상)`);
else for (const s of SCENES) console.log(`장면 [${s.name}] ${SC_W}×${SC_H}셀 · 바위 ${s.nRock} (${(s.nRock / (SC_W * SC_H) * 100).toFixed(1)}%) · 능선 ${s.paths.map((p) => p.name).join(',') || '없음'}`);

const AN = JSON.parse(fs.readFileSync(path.join(MT, 'mountain_anchors.json'), 'utf8'));
function b64(p) {
  const ext = path.extname(p).slice(1);
  return `data:image/${ext === 'webp' ? 'webp' : 'png'};base64,` + fs.readFileSync(p).toString('base64');
}
const IMGF = fs.existsSync(path.join(MT, Object.keys(AN)[0] + '.webp')) ? '.webp' : '.png';
const A = { grassA: b64(path.join(ROOT, 'public/assets/terrain/grass_angled.png')) };
for (const k of Object.keys(AN)) A[k] = b64(path.join(MT, k + IMGF));
console.log(`스프라이트 ${MT} (${IMGF}) · ppu ${Math.min(...Object.values(AN).map((v) => v.ppu)).toFixed(1)}~${Math.max(...Object.values(AN).map((v) => v.ppu)).toFixed(1)}`);

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0a0d10;margin:0}canvas{display:block}</style></head><body><script>
const SWEEP=${SWEEP}; const SCENES=${JSON.stringify(SCENES)}, AN=${JSON.stringify(AN)}, A=${JSON.stringify(A)}, SCALES=${JSON.stringify(SCALES)};
const CELL=32,HALF=16,PPU_SCR=64/Math.SQRT2, CROSS_U=10.1, ALONG_U=4.8;
const ROCKR=new Set(['한울대간','눈메']);
const hash=(x,y,s)=>{let n=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1274126177))|0;n=Math.imul(n^(n>>>13),1103515245);n^=n>>>16;return (n>>>0)/4294967296;};
const w2i=(wx,wy)=>({x:wx-wy,y:(wx+wy)/2});
let S=null;                                   // 현재 장면
const isRock=(cx,cy)=> cx>=0&&cy>=0&&cx<S.w&&cy<S.h&&S.cells[cy][cx]===2;

function nearestRidge(wx,wy){
  let best=1e18,ang=0,name=S.paths[0]?S.paths[0].name:'한울대간';
  for(const P of S.paths){const pts=P.pts;
    for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];
      const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1;
      let t=((wx-a.x)*dx+(wy-a.y)*dy)/L2;t=t<0?0:(t>1?1:t);
      const qx=a.x+t*dx-wx,qy=a.y+t*dy-wy,d=qx*qx+qy*qy;
      if(d<best){best=d;ang=Math.atan2(dy,dx);name=P.name;}}}
  return {ang,name,d:Math.sqrt(best)};
}

// ── A: 현행 — 능선 중심선 보행 + 밴드 폭만큼 한 장 확대 ─────────────────────
function placeA(){
  const segs=[];
  for(const P of S.paths){
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
    for(const p of placed){if(p.dead)continue;
      let deg=(p.ang*180/Math.PI)%180;if(deg<0)deg+=180;const oct=Math.round(deg/22.5)%8;
      const rx=Math.round(p.x),ry=Math.round(p.y);
      const v=isF?((hash(rx,ry,77)*2)|0):((hash(rx,ry,77)*3)|0);
      segs.push({x:p.x,y:p.y,name:(isF?'mt_F':'mt_G')+oct+'v'+v,sc:p.sc,vy:0.86+0.28*hash(rx,ry,78),tier:'A'});}
  }
  return segs;
}

// ── C: 가장자리 거리 계층 ────────────────────────────────────────────────────
//   ★크기를 능선 밴드 폭이 아니라 **바위 덩어리 가장자리까지의 거리**로 정한다.
//     A 는 밴드 폭 하나를 한 장으로 받아 5~9배 확대(=뭉갬)를 만들었다. 여기선 나눠 덮는다.
//     ⇒ 실루엣이 저절로 "높은 등성이 · 낮아지는 어깨 · 잔 자락"이 된다.
//     ⇒ 높이 배율 vy 도 가장자리 거리에 태운다 — 안쪽일수록 높다(스카이라인이 산맥이 된다).
let DE=null, DO=null;      // DE: 바위 **안쪽** 가장자리 거리 · DO: 바위 **바깥** 거리(기슭용)
function buildDE(){
  const INF=1e6,d=new Float32Array(S.w*S.h);
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++)d[y*S.w+x]=(S.cells[y][x]===2)?INF:0;
  const at=(x,y)=>(x<0||y<0||x>=S.w||y>=S.h)?INF:d[y*S.w+x];  // ★장면 밖은 가장자리가 아니다
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){const i=y*S.w+x;if(d[i]===0)continue;
    d[i]=Math.min(d[i],at(x-1,y)+1,at(x,y-1)+1,at(x-1,y-1)+1.414,at(x+1,y-1)+1.414);}
  for(let y=S.h-1;y>=0;y--)for(let x=S.w-1;x>=0;x--){const i=y*S.w+x;if(d[i]===0)continue;
    d[i]=Math.min(d[i],at(x+1,y)+1,at(x,y+1)+1,at(x+1,y+1)+1.414,at(x-1,y+1)+1.414);}
  DE=d;
  // ★바깥 거리 — 바위에서 몇 셀 떨어진 풀밭인가. 기슭이 여기에 선다.
  const o=new Float32Array(S.w*S.h);
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++)o[y*S.w+x]=(S.cells[y][x]===2)?0:INF;
  const ao=(x,y)=>(x<0||y<0||x>=S.w||y>=S.h)?INF:o[y*S.w+x];
  for(let y=0;y<S.h;y++)for(let x=0;x<S.w;x++){const i=y*S.w+x;if(o[i]===0)continue;
    o[i]=Math.min(o[i],ao(x-1,y)+1,ao(x,y-1)+1,ao(x-1,y-1)+1.414,ao(x+1,y-1)+1.414);}
  for(let y=S.h-1;y>=0;y--)for(let x=S.w-1;x>=0;x--){const i=y*S.w+x;if(o[i]===0)continue;
    o[i]=Math.min(o[i],ao(x+1,y)+1,ao(x,y+1)+1,ao(x+1,y+1)+1.414,ao(x-1,y+1)+1.414);}
  DO=o;
}
const edgeD=(cx,cy)=>(cx<0||cy<0||cx>=S.w||cy>=S.h)?0:DE[cy*S.w+cx];
const TIERS=[
  {k:'L',minD: 9.0,step:13.0,s0:1.85,s1:2.50,solo:['mt_L1'],         sp:0.34,seed:411},
  {k:'M',minD: 3.5,step: 7.5,s0:1.18,s1:1.68,solo:['mt_M1','mt_M2'], sp:0.32,seed:412},
  {k:'S',minD:-1.0,step: 4.2,s0:0.70,s1:1.00,solo:['mt_S1','mt_S2'], sp:0.30,seed:413,maxD:5.0},
];
// ★둥근/뾰족 혼합 [재민 2026-08-07: "여러 개 혼합해서 쓰자. 물론 한반도 지역은 둥근 거 위주로"]
//   비율은 **배치 손잡이**다 — 굽기는 재료만 댄다. 0 = 전부 뾰족 · 1 = 전부 둥근.
let ROUND_MIX=0;
function pickName(cx,cy,ang,T){
  const rnd = hash(cx,cy,T.seed+21) < ROUND_MIX && !!AN['mt_RG0v0'];
  if(hash(cx,cy,T.seed+7)<T.sp) return T.solo[(hash(cx,cy,T.seed+8)*T.solo.length)|0];
  // ★능선 각도에 ±14° 해시 흔들림 — 직선 능선에서 같은 옥탄트가 줄서는 걸 끊는다
  const jit=(hash(cx,cy,T.seed+9)-0.5)*28*Math.PI/180;
  let deg=((ang+jit)*180/Math.PI)%180; if(deg<0)deg+=180;
  const oct=Math.round(deg/22.5)%8;
  const isF=!ROCKR.has(nearestRidge(cx*CELL+HALF,cy*CELL+HALF).name);
  const v=isF?((hash(cx,cy,77)*2)|0):((hash(cx,cy,77)*3)|0);
  return (rnd?'mt_R':'mt_')+(isF?'F':'G')+oct+'v'+v;
}
function hgt(dE,cx,cy,seed){ // 높이 = 가장자리 거리 램프 + 자리 지터
  // ★바닥을 0.74 → 0.58 로 내렸다. 자락이 낮아야 기슭(0.26~0.58)으로 **끊김 없이** 이어진다.
  const t=Math.max(0,Math.min(1,dE/14));
  return 0.58+0.60*t+0.16*(hash(cx,cy,seed)-0.5);
}
function placeC(mul,TT){
  const segs=[];
  for(const T of (TT||TIERS)){
    for(let gy=0;gy<S.h;gy+=T.step) for(let gx=0;gx<S.w;gx+=T.step){
      const j1=hash(Math.round(gx*13),Math.round(gy*13),T.seed), j2=hash(Math.round(gx*13),Math.round(gy*13),T.seed+1);
      const cx=Math.round(gx+(j1-0.5)*T.step*0.9), cy=Math.round(gy+(j2-0.5)*T.step*0.9);
      if(!isRock(cx,cy)) continue;
      const dE=edgeD(cx,cy);
      if(dE<T.minD) continue;
      if(T.maxD!=null&&dE>T.maxD) continue;
      const nr=nearestRidge(cx*CELL+HALF,cy*CELL+HALF);
      segs.push({x:cx*CELL+HALF,y:cy*CELL+HALF,name:pickName(cx,cy,nr.ang,T),
                 sc:(T.s0+(T.s1-T.s0)*hash(cx,cy,T.seed+2))*mul,
                 vy:hgt(dE,cx,cy,T.seed+3),tier:T.k});
    }
  }
  return segs;
}
// ── 기슭 [재민 3: "산과 풀의 경계가 뚝 끊긴다"] ─────────────────────────────
//   ★기슭은 **작은 산이 아니라 납작한 산**이다. 크기만 줄이면 자갈로 읽히고,
//     세로만 눌러야 '낮은 둔덕'으로 읽힌다. 그래서 sc 는 조금만 줄이고 vy 를 크게 눌렀다.
//   ★균일 산포 금지(배치 21 재민 지적 "일부러 심은 느낌") — 밀도도 거리에 따라 준다.
//   ★지형 데이터는 안 건드린다 — 순수 렌더다. 콜라이더·통행·자원 전부 그대로.
const FOOT={step:3.0,dMax:5.2,s0:0.46,s1:0.95,vy0:0.26,vy1:0.58};
function placeFoot(mul){
  const segs=[];
  for(let gy=0;gy<S.h;gy+=FOOT.step) for(let gx=0;gx<S.w;gx+=FOOT.step){
    const j1=hash(Math.round(gx*17),Math.round(gy*17),811), j2=hash(Math.round(gx*17),Math.round(gy*17),812);
    const cx=Math.round(gx+(j1-0.5)*FOOT.step*1.0), cy=Math.round(gy+(j2-0.5)*FOOT.step*1.0);
    if(cx<0||cy<0||cx>=S.w||cy>=S.h) continue;
    if(S.cells[cy][cx]!==0) continue;                 // 풀만 — 물·바위 제외
    const dO=DO[cy*S.w+cx]; if(dO>FOOT.dMax||dO<=0) continue;
    const t=1-dO/FOOT.dMax;                            // 1 = 바위 코앞
    if(hash(cx,cy,631) > 0.18+0.72*t) continue;        // 밀도도 거리에 따라
    const nr=nearestRidge(cx*CELL+HALF,cy*CELL+HALF);
    segs.push({x:cx*CELL+HALF,y:cy*CELL+HALF,name:pickName(cx,cy,nr.ang,TIERS[2]),
      sc:(FOOT.s0+(FOOT.s1-FOOT.s0)*t*(0.55+0.45*hash(cx,cy,813)))*mul,
      vy:FOOT.vy0+(FOOT.vy1-FOOT.vy0)*t+0.10*(hash(cx,cy,814)-0.5),tier:'기슭'});
  }
  return segs;
}
// ── 주봉 [재민 2: "큰 봉우리가 잘 안 선다"] ──────────────────────────────────
//   ★덩어리 **가장 깊은 안쪽**에만, 아주 성기게, 아주 크게. 한 화면에 한둘만 서야 '주봉'이다.
//   ★배율 3 이상은 2048 판으로 못 버틴다(확대 한계 1.96) → 전용 mt_X 를 4096 으로 따로 굽는다.
// ★두 번 헛다리를 짚었다. 기록해 둔다.
//   1차 sc 2.9~3.9 → **화면을 통째로 먹었다.** 1:1 화면은 가로 22셀뿐이고 L 이 이미 17셀이다.
//   2차 "이웃을 낮춰 대비를 벌리자" → 대비는 벌어졌지만 주봉은 여전히 **벽**이었다.
//   ⇒ 진짜 이유: **땅에서 올려다보는 시점에서 '넓은 산'은 봉우리가 아니라 벽이다.**
//     주봉이 선다는 건 **스카이라인 위로 솟는다**는 뜻이고, 그건 폭이 아니라 **높이**다.
//   ⇒ 그래서 폭은 L 과 비슷하게 두고 **키가 큰 메시**(mt_X: 높이 11~12.6 = L1 의 1.9배)를 쓴다.
//     발치 고정 세로 배율(vy)은 이미 렌더가 지원한다 — 새 기구가 필요 없다.
const PEAK={minD:11,step:26,s0:1.90,s1:2.40};
// 대비를 벌린 계층(주봉을 쓸 때만) — 이웃이 물러나야 주봉이 선다
const TIERS_LOW=[
  {k:'L',minD: 9.0,step:11.5,s0:1.45,s1:1.90,solo:['mt_L1'],         sp:0.34,seed:411},
  {k:'M',minD: 3.5,step: 6.4,s0:0.95,s1:1.30,solo:['mt_M1','mt_M2'], sp:0.32,seed:412},
  {k:'S',minD:-1.0,step: 3.6,s0:0.62,s1:0.88,solo:['mt_S1','mt_S2'], sp:0.30,seed:413,maxD:5.0},
];
function placePeak(mul,names){
  const segs=[];
  for(let lj=Math.floor(-1);lj<=Math.ceil(S.h/PEAK.step)+1;lj++)
  for(let li=Math.floor(-1);li<=Math.ceil(S.w/PEAK.step)+1;li++){
    const cx=Math.round(li*PEAK.step+(hash(li,lj,901)-0.5)*PEAK.step*0.8);
    const cy=Math.round(lj*PEAK.step+(hash(li,lj,902)-0.5)*PEAK.step*0.8);
    if(!isRock(cx,cy)) continue;
    if(DE[cy*S.w+cx]<PEAK.minD) continue;
    const nm=names[(hash(cx,cy,903)*names.length)|0];
    if(!AN[nm]) continue;
    segs.push({x:cx*CELL+HALF,y:cy*CELL+HALF,name:nm,
      sc:(PEAK.s0+(PEAK.s1-PEAK.s0)*hash(cx,cy,904))*mul,
      vy:1.02+0.16*(hash(cx,cy,905)-0.5),tier:'주봉'});
  }
  return segs;
}

// ★틈 메우기 — 눈이 아니라 알파로 찾는다. 남은 맨 바위 셀에 잔봉우리를 얹는다.
function gapFill(segs,mul,rounds){
  let cur=segs.slice();
  for(let r=0;r<(rounds||2);r++){
    const bare=bareCells(cur); if(!bare.length) break;
    const seen=new Set(),add=[];
    for(const b of bare){
      const k=((b[0]/3)|0)+'_'+((b[1]/3)|0); if(seen.has(k))continue; seen.add(k);
      const nr=nearestRidge(b[0]*CELL+HALF,b[1]*CELL+HALF);
      add.push({x:b[0]*CELL+HALF,y:b[1]*CELL+HALF,name:pickName(b[0],b[1],nr.ang,TIERS[2]),
        sc:(0.78+0.30*hash(b[0],b[1],515))*mul,vy:hgt(edgeD(b[0],b[1]),b[0],b[1],516),tier:'틈'});
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
    const an=AN[s.name];if(!an)return;const im=tinted(s.name,(hash(Math.round(s.x),Math.round(s.y),91)<0.5)?0:1);
    const sc=PPU_SCR/an.ppu*s.sc, vy=s.vy||1, c=w2i(s.x,s.y);
    g.drawImage(im,c.x-an.ox*sc,c.y-an.oy*sc*vy,im.width*sc,im.height*sc*vy);
  });
}
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
// ★출하 가능성 — 화면 1400×900 에 실제로 그려지는 장수와 덮어쓰기 화소
function cost(segs){
  const ctr=w2i((S.w/2)*CELL,(S.h/2)*CELL);
  let n=0,px=0;
  for(const s of segs){const an=AN[s.name];if(!an)continue;
    const im=imgs[s.name];const sc=PPU_SCR/an.ppu*s.sc,vy=s.vy||1,c=w2i(s.x,s.y);
    const W=im.width*sc,H=im.height*sc*vy, x0=c.x-an.ox*sc-(ctr.x-700), y0=c.y-an.oy*sc*vy-(ctr.y-450);
    if(x0>1400||y0>900||x0+W<0||y0+H<0)continue;
    n++;px+=W*H;}
  return {n,mp:px/1e6};
}
function render(segs,label){
  const cv=document.createElement('canvas');cv.width=1400;cv.height=900;
  const g=cv.getContext('2d');
  const ctr=w2i((S.w/2)*CELL,(S.h/2)*CELL);
  g.fillStyle='#0a0d10';g.fillRect(0,0,1400,900);
  g.save();g.translate(700-ctr.x,450-ctr.y);
  const pat=g.createPattern(imgs.grassA,'repeat');const pm=new DOMMatrix();pm.a=0.295;pm.d=0.295;pat.setTransform(pm);
  g.fillStyle=pat;g.fillRect(ctr.x-700,ctr.y-450,1400,900);
  g.fillStyle='#69605a';                       // 바위 셀 지면(라이브와 같은 갈색) — 덮개가 모자라면 이게 보인다
  for(let cy=0;cy<S.h;cy++)for(let cx=0;cx<S.w;cx++){
    if(S.cells[cy][cx]!==2)continue;
    const c=w2i(cx*CELL,cy*CELL);
    g.beginPath();g.moveTo(c.x,c.y);g.lineTo(c.x+CELL,c.y+HALF);g.lineTo(c.x,c.y+CELL);g.lineTo(c.x-CELL,c.y+HALF);g.closePath();g.fill();
  }
  drawSegs(g,segs);
  g.restore();
  g.fillStyle='rgba(0,0,0,0.62)';g.fillRect(0,0,1400,26);
  g.fillStyle='#e6dfd0';g.font='15px sans-serif';g.fillText(label,10,18);
  return cv;
}

const RESULT=[];
function go(){
  for(const sc of SCENES){
    S=sc; buildDE();
    const XN=['mt_X1','mt_X2','mt_X3'].filter((n)=>AN[n]);
    const PK=XN.length?XN:['mt_L1'];
    const mk=(o)=>{ let g=placeC(1,o.low?TIERS_LOW:null);
      if(o.peak) g=placePeak(1,PK).concat(g);
      g=gapFill(g,1,2);
      if(o.foot) g=g.concat(placeFoot(1));
      return g; };
    const mkR=(o,r)=>{ ROUND_MIX=r; const g=mk(o); ROUND_MIX=0; return g; };
    // ★대안 — **새 스프라이트 없이** L 계층의 높이 변주만 넓힌다.
    //   이 카메라(가로 22셀)에선 큰 산을 통째로 볼 수 없다. '주봉이 선다'가 눈에 들어오는 건
    //   봉우리 하나를 알아보는 게 아니라 **스카이라인이 출렁이는** 것이다.
    const skyline=(g)=>g.map((x)=>x.tier==='L'
      ? Object.assign({},x,{vy:0.85+1.10*hash(Math.round(x.x),Math.round(x.y),977)}) : x);
    const cands=[['① 지금 라이브 (뾰족 100%)',mkR({},0)],
                 ['② +기슭',mkR({foot:1},0)],
                 ['③ +기슭 +주봉',mkR({foot:1,peak:1,low:1},0)],
                 ['③b +기슭 +스카이라인 변주(새 스프라이트 0)',skyline(mkR({foot:1},0))],
                 ['④ ★+둥근 75% (한반도안)',mkR({foot:1,peak:1,low:1},0.75)],
                 ['⑤ 둥근 100% (대조)',mkR({foot:1,peak:1,low:1},1.0)]];
    for(const [nm,segs] of cands){
      const b=bareCells(segs), z=cost(segs);
      const t={};for(const g of segs)t[g.tier]=(t[g.tier]||0)+1;
      const line=sc.name+' | '+nm+' | 총 '+segs.length+' '+JSON.stringify(t)
        +' | 맨 바위 '+b.length+'/'+b.tot+' = '+(b.tot?b.length/b.tot*100:0).toFixed(1)+'%'
        +' | 화면 '+z.n+'장 '+z.mp.toFixed(0)+'MP';
      console.log('[COVER] '+line);
      if(!SWEEP){const id='cv-'+RESULT.length; RESULT.push(id);
        const cv=render(segs,line);cv.id=id;document.body.appendChild(cv);}
    }
  }
  window.__ids=RESULT;
  document.title='READY';
}
</script></body></html>`;
fs.writeFileSync('/tmp/mtcover.html', html);
(async () => {
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1500, height: 1000 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 300)));
  pg.on('console', (m) => { const t = m.text(); if (t.includes('[COVER]')) console.log('  ' + t.replace('[COVER] ', '')); });
  await pg.goto('file:///tmp/mtcover.html');
  await pg.waitForFunction(() => document.title === 'READY', { timeout: 300000 });
  const ids = await pg.evaluate(() => window.__ids);
  const outs = [];
  for (const id of ids) {
    const el = await pg.$('#' + id);
    if (el) { const p = `/tmp/mtcover-${id.replace('cv-', '')}.png`; await el.screenshot({ path: p }); outs.push(p); }
  }
  console.log('\n산출: ' + outs.join(' · '));
  await br.close();
})();
