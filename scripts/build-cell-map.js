#!/usr/bin/env node
// === scripts/build-cell-map.js — 지형을 **셀 단위로 확정**해 그림 한 장 + 뷰어 HTML로 굽는다 ===
//
// ★[11차 재민 지시] "이걸 셀 단위로 정확하게 변환하고, 그 버전의 맵도 볼 수 있을까? 인게임 미니맵과 같은 거."
//
// ★설계 원칙 — **판정을 두 번 쓰지 않는다.**
//   기존 ~/Mini/cell-viewer.html 은 지형 수식(해안 노이즈·강 폭·호수 wobble)을 HTML 안에 **복제**해
//   두고 그렸다. 그래서 게임이 바뀌면 조용히 어긋난다(실제로 계곡·개명·다리가 전부 빠져 있었다).
//   여기서는 서버의 진짜 술어(terrain.isWaterCellLocal / isRockCellLocal / getForestMultiplier,
//   zone-config.bridges)로 **한 번 래스터화**해 PNG로 굽고, 뷰어는 그 그림을 보여 주기만 한다.
//   뷰어에는 지형 수식이 한 줄도 없다 — 어긋날 수가 없다.
//
// 산출:
//   ../cell-map.png    1픽셀 = 1셀(=1m) 인덱스 PNG
//   ../cell-map.html   그 PNG를 data URL로 품은 자립 뷰어(휠 줌·드래그 이동·커서 셀 판정·이름표)
//
// 실행: node scripts/build-cell-map.js [--zone hanbando]
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const CELL = 32;

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const Z = ZONES[ZID];
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);

// 팔레트 — 인게임 미니맵 색과 같은 계열. 인덱스가 곧 '셀 종류'라 뷰어가 색으로 종류를 되읽는다.
const PAL = [
  [0x4e, 0x74, 0x46, '평지'],
  [0x2e, 0x6f, 0xa8, '물'],
  [0x6e, 0x63, 0x56, '바위'],
  [0x2f, 0x7a, 0x3a, '숲'],
  [0xd2, 0x89, 0x2e, '다리'],
  [0xd9, 0x90, 0x30, '광맥'],
  [0xff, 0x46, 0x46, '마을'],
];

const bridge = new Set();
{ const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) bridge.add(b[i] + ',' + b[i + 1]); }

console.log('=== 셀 지도 굽기 · ' + ZID + ' · ' + W + '×' + H + '셀(' + (W * H).toLocaleString() + ') ===');
const t0 = Date.now();
const idx = new Uint8Array(W * H);
// ★래스터 캐시 — 8.9M셀 판정에 6분 걸린다. 지형 파일과 다리가 그대로면 다시 잴 이유가 없다.
//   키는 지형 JSON + 다리 배열의 해시라, 지형이 한 글자라도 바뀌면 자동으로 무효가 된다.
const crypto = require('crypto');
const stamp = crypto.createHash('sha1')
  .update(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.json')))
  .update(JSON.stringify(Z.bridges || [])).digest('hex').slice(0, 12);
const CACHE = path.join('/tmp', 'cellmap_' + ZID + '_' + stamp + '.u8');
let cached = false;
if (fs.existsSync(CACHE) && fs.statSync(CACHE).size === W * H) {
  idx.set(new Uint8Array(fs.readFileSync(CACHE))); cached = true;
  console.log('  래스터 캐시 사용 (' + stamp + ')');
}
for (let y = 0; !cached && y < H; y++) {
  for (let x = 0; x < W; x++) {
    const px = x * CELL + 16, py = y * CELL + 16;
    let t;
    if (bridge.has(x + ',' + y)) t = 4;
    else if (terrain.isWaterCellLocal(ZID, px, py)) t = 1;
    else if (terrain.isRockCellLocal(ZID, px, py)) t = 2;
    else if (terrain.isOreClusterAt && terrain.isOreClusterAt(ZID, px, py)) t = 5;
    else if (terrain.getForestMultiplier(ZID, px, py) > 1.2) t = 3;
    else t = 0;
    idx[y * W + x] = t;
  }
  if (y % 500 === 0) console.log('  y ' + y + '/' + H + '  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
if (!cached) fs.writeFileSync(CACHE, Buffer.from(idx.buffer, 0, W * H));
// 마을은 위에 점으로
const villages = [];
for (const v of (terrain.getZoneVillages(ZID) || [])) {
  const cx = Math.round(v.x / CELL), cy = Math.round(v.y / CELL);
  villages.push({ n: v.name, x: cx, y: cy });
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const a = cx + dx, b = cy + dy;
    if (a >= 0 && b >= 0 && a < W && b < H && Math.hypot(dx, dy) <= 2.2) idx[b * W + a] = 6;
  }
}
const count = new Array(PAL.length).fill(0);
for (let i = 0; i < idx.length; i++) count[idx[i]]++;   // ★마을 점까지 찍은 뒤에 센다 — 안 그러면 범례에 마을 0%로 뜬다
console.log('셀 집계: ' + PAL.map((p, i) => p[3] + ' ' + count[i].toLocaleString() + '(' + (count[i] / (W * H) * 100).toFixed(1) + '%)').join(' · '));

// ---- 인덱스 PNG (팔레트 방식 — 8.9M셀도 수백 KB) ----
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb = Buffer.from(type), cc = Buffer.alloc(4);
  cc.writeUInt32BE(crc(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, cc]);
};
function mkPng(w, h, pal, data) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;   // 8비트 · 팔레트
  const plte = Buffer.from(pal.flatMap((p) => [p[0], p[1], p[2]]));
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; Buffer.from(data.buffer, y * w, w).copy(raw, y * (w + 1) + 1); }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('PLTE', plte),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const png = mkPng(W, H, PAL, idx);
const OUTPNG = path.join(__dirname, '..', '..', 'cell-map.png');
fs.writeFileSync(OUTPNG, png);
console.log('PNG ' + (png.length / 1024).toFixed(0) + 'KB → ' + OUTPNG);

// ---- 비옥도장 ----
// ★래스터를 이미 구웠으니 지형 술어를 다시 부르지 않는다 — 물/바위/숲 판정은 구운 인덱스가 곧 정답이다.
//   비옥도 수식은 server/fertility.js(정본)를 그대로 부른다. 게임이 쓰는 함수와 **같은 함수**다.
const FERT = require(path.join(__dirname, '..', 'server', 'fertility'));
const VL = require(path.join(__dirname, '..', 'server', 'village-layout'));
// 구운 인덱스에서 되읽는 술어(마을 점은 그 아래 지형을 덮어썼으니 별도 사본에서 읽는다)
const base = new Uint8Array(idx);   // 마을 점을 찍기 전 값이 필요하지만, 마을은 평지 위에만 서므로 평지로 취급
for (let i = 0; i < base.length; i++) if (base[i] === 6) base[i] = 0;
const isW = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? false : base[y * W + x] === 1;
const isR = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? false : base[y * W + x] === 2;
const isF = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? false : base[y * W + x] === 3;
console.log('비옥도장 계산(EDT 2회 · ' + (W * H).toLocaleString() + '셀)…');
const tf = Date.now();
const FF = FERT.buildField({ isWater: isW, isRock: isR, isWoody: isF, maskEDT: VL.maskEDT }, 0, 0, W - 1, H - 1);
console.log('  ' + ((Date.now() - tf) / 1000).toFixed(0) + 's');

// 비옥도 팔레트 — 순차(한 색 · 명도 단조). dataviz 검증기 통과: 어두운 바탕 #0b1016에서
//   명도 단조 ✔ · 인접 ΔL ≥ 0.06 ✔ · 가장 어두운 단 2.36:1 ✔ · 색상 폭 4° ✔
//   낮은 쪽이 바탕으로 물러나고 높은 쪽이 밝다. 경작 불가(물·바위)는 **중립 회색** — 등급 밖이라
//   파란 등급과 절대 헷갈리지 않는다.
// ★칸 경계 — 척도 교정(fertility.js: 감쇠 80 · 바위만점 60) 뒤 분포에 맞춘 균등 0.10 폭.
//   교정 전에는 44%가 0.30±0.02 한 칸에 뭉쳐 지도가 통째로 한 색이었다("색 차이가 없는데..?").
//   지금은 폭을 균등하게 둘 수 있다 — 색이 값에 비례하고(분위 왜곡 없음) 그림도 갈라진다.
const FPAL = [
  [0x2b, 0x2b, 0x28, '바위(경작 불가)'],
  [0x4a, 0x4a, 0x46, '물(경작 불가)'],
  [0x18, 0x4f, 0x95, '0.35 미만 · 산사면·내륙 깊이'],
  [0x25, 0x6a, 0xbf, '0.35~0.45'],
  [0x39, 0x87, 0xe5, '0.45~0.55'],
  [0x6d, 0xa7, 0xec, '0.55~0.65'],
  [0x9e, 0xc5, 0xf4, '0.65~0.80'],
  [0xcd, 0xe2, 0xfb, '0.80 이상 · 충적지'],
];
const FBIN = (f) => f < 0.35 ? 2 : f < 0.45 ? 3 : f < 0.55 ? 4 : f < 0.65 ? 5 : f < 0.80 ? 6 : 7;
const fidx = new Uint8Array(W * H);
const fcount = new Array(FPAL.length).fill(0);
let fsum = 0, fn = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  let t;
  if (base[i] === 2) t = 0;
  else if (base[i] === 1) t = 1;
  else { const f = FF.at(x, y); fsum += f; fn++; t = FBIN(f); }
  fidx[i] = t; fcount[t]++;
}
console.log('비옥도: 경작 가능 ' + fn.toLocaleString() + '셀 평균 ' + (fsum / fn).toFixed(3)
  + ' · ' + FPAL.slice(2).map((p, k) => p[3] + ' ' + (fcount[k + 2] / fn * 100).toFixed(1) + '%').join(' · '));
const fpng = mkPng(W, H, FPAL, fidx);
fs.writeFileSync(path.join(__dirname, '..', '..', 'cell-fert.png'), fpng);
console.log('비옥도 PNG ' + (fpng.length / 1024).toFixed(0) + 'KB');

// ---- 이름표 ----
const gw = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'))[ZID] || {};
const P = (p) => p.pos ? p.pos : [p.x, p.y];
const mid = (f) => { const q = P(f.path[Math.floor(f.path.length / 2)]); return { x: Math.round(q[0] / CELL), y: Math.round(q[1] / CELL) }; };
const labels = [];
for (const r of (gw.rivers || [])) if (!r._mirroredFrom && r.path) labels.push({ k: 'river', n: r.name, ...mid(r) });
for (const r of (gw.ridges || [])) if (!r._mirroredFrom && r.path) labels.push({ k: 'ridge', n: r.name, ...mid(r) });
for (const v of (gw.valleys || [])) labels.push({ k: 'valley', n: v.name, ...mid(v) });
for (const l of (gw.lakes || [])) if (!l._mirroredFrom && l.center) labels.push({ k: 'lake', n: l.name, x: Math.round(l.center[0] / CELL), y: Math.round(l.center[1] / CELL) });
for (const v of villages) labels.push({ k: 'village', n: v.n, x: v.x, y: v.y });

// ---- 뷰어 HTML (자립 · 지형 수식 없음) ----
const b64 = png.toString('base64');
const fb64 = fpng.toString('base64');
const hex2 = (p) => '#' + [p[0], p[1], p[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
const meta = {
  zone: ZID, w: W, h: H, cell: CELL,
  pal: PAL.map((p) => ({ c: hex2(p), n: p[3] })),
  fpal: FPAL.map((p) => ({ c: hex2(p), n: p[3] })),
  count, fcount, favg: +(fsum / fn).toFixed(3), fn, labels,
};
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>셀 지도 — ${ZID}</title>
<style>
html,body{margin:0;height:100%;background:#0b1016;color:#cfe;font-family:ui-sans-serif,system-ui,sans-serif;overflow:hidden}
#cv{display:block;cursor:grab;image-rendering:pixelated}#cv:active{cursor:grabbing}
.panel{position:fixed;background:rgba(10,14,18,.86);border:1px solid #2a3a4a;border-radius:6px;padding:8px 10px;font-size:12px}
#title{left:10px;top:10px}#legend{right:10px;top:10px}#hud{left:10px;bottom:10px;font-variant-numeric:tabular-nums}
#legend div{display:flex;align-items:center;gap:6px;margin:2px 0}
#legend i{width:12px;height:12px;border-radius:2px;display:inline-block}
b{color:#7fd0ff}label{cursor:pointer;user-select:none}
#find{position:fixed;left:10px;top:44px;background:rgba(10,14,18,.86);border:1px solid #2a3a4a;border-radius:6px;padding:6px}
#find input{background:#0e1720;border:1px solid #2a3a4a;color:#cfe;border-radius:4px;padding:3px 6px;width:150px}
#layers{left:10px;top:82px}
button.lyr{background:#16222e;border:1px solid #2a3a4a;color:#9ab;border-radius:5px;padding:5px 14px;margin-right:4px;font-size:13px;cursor:pointer}
button.lyr:hover{background:#1d2c3a;color:#cfe}
button.lyr.on{background:#2a78d6;border-color:#5598e7;color:#fff;font-weight:600}
</style></head><body>
<canvas id="cv"></canvas>
<div class="panel" id="title"><b>셀 지도</b> ${ZID} · ${W}×${H}셀 · 1셀=1m · 휠 줌 · 드래그 이동
&nbsp;<label><input type="checkbox" id="lab" checked> 이름표</label>
&nbsp;<label><input type="checkbox" id="grd" checked> 격자</label>
</div>
<div class="panel" id="layers">
  <div style="color:#8ab;margin-bottom:5px">층 <span style="opacity:.6">(F 키로 전환)</span></div>
  <button class="lyr" data-m="terrain">지형</button><button class="lyr on" data-m="fert">비옥도</button>
</div>
<div class="panel" id="find"><input id="q" placeholder="이름으로 찾기 (예: 광산2, 죽령)"></div>
<div class="panel" id="legend"></div>
<div class="panel" id="hud">—</div>
<script>
const M=${JSON.stringify(meta)};
const IMG=new Image(); IMG.src="data:image/png;base64,${b64}";
const FIMG=new Image(); FIMG.src="data:image/png;base64,${fb64}";
const cv=document.getElementById('cv'),ctx=cv.getContext('2d',{alpha:false});
// 색→종류 되읽기용 오프스크린(지형 수식 복제 금지 — 구운 그림이 곧 정답)
let off=null,od=null;
const L=document.getElementById('legend');
function legend(){
  if(mode==='fert') L.innerHTML='<div style="margin-bottom:4px;color:#9fd">셀 비옥도 · 경작 가능 평균 <b>'+M.favg+'</b></div>'
    +M.fpal.map((p,i)=>'<div><i style="background:'+p.c+'"></i>'+p.n+(i>=2?' '+(M.fcount[i]*100/M.fn).toFixed(1)+'%':'')+'</div>').join('');
  else L.innerHTML=M.pal.map((p,i)=>'<div><i style="background:'+p.c+'"></i>'+p.n+' '+(M.count[i]*100/(M.w*M.h)).toFixed(1)+'%</div>').join('');
}
// ★열 때 층 = 비옥도. 지형은 한 번 눌러 보면 된다. 반대로 두면 "비옥도를 넣었다"는데 화면은
//   초록이라 아무 일도 안 일어난 것처럼 보인다(11차에 두 번 그랬다).
let S={x:M.w/2,y:M.h/2,z:0.35},drag=null,showLab=true,showGrid=true,mode='fert';
function resize(){cv.width=innerWidth;cv.height=innerHeight;draw();}
addEventListener('resize',resize);
const KCOL={river:'#8fd3ff',ridge:'#d9c19a',valley:'#a8f0b0',lake:'#8fd3ff',village:'#ffb0b0'};
function draw(){
  if(!IMG.complete)return;
  ctx.fillStyle='#0b1016';ctx.fillRect(0,0,cv.width,cv.height);
  const z=S.z,ox=cv.width/2-S.x*z,oy=cv.height/2-S.y*z;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(mode==='fert'?FIMG:IMG,ox,oy,M.w*z,M.h*z);
  if(showGrid) drawGrid(ox,oy,z);
  if(showLab&&z>0.08){
    ctx.font=(z>0.5?13:11)+'px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#0b1016';
    for(const l of M.labels){
      if(z<0.25&&l.k==='village')continue;
      if(z<0.16&&l.k!=='ridge')continue;
      const X=ox+l.x*z,Y=oy+l.y*z;
      if(X<-60||Y<-20||X>cv.width+60||Y>cv.height+20)continue;
      ctx.strokeText(l.n,X,Y-4);ctx.fillStyle=KCOL[l.k]||'#cfe';ctx.fillText(l.n,X,Y-4);
    }
  }
}
// ★격자 — 1픽셀이 1셀(=1m)이라 배율에 따라 눈금을 갈아 낀다.
//   촘촘한 격자를 낮은 배율에서 그리면 선이 뭉쳐 화면이 통째로 회색이 된다: 선 간격이 화면에서
//   6px 아래면 그 단계는 아예 안 그린다. 100m 격자만 거의 항상 남아 위치 감각을 준다.
function drawGrid(ox,oy,z){
  const lines=(step,color)=>{
    if(step*z<6)return;
    ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();
    const x0=Math.max(0,Math.floor((-ox/z)/step)*step), x1=Math.min(M.w,(cv.width-ox)/z);
    for(let x=x0;x<=x1;x+=step){const X=Math.round(ox+x*z)+0.5;ctx.moveTo(X,Math.max(0,oy));ctx.lineTo(X,Math.min(cv.height,oy+M.h*z));}
    const y0=Math.max(0,Math.floor((-oy/z)/step)*step), y1=Math.min(M.h,(cv.height-oy)/z);
    for(let y=y0;y<=y1;y+=step){const Y=Math.round(oy+y*z)+0.5;ctx.moveTo(Math.max(0,ox),Y);ctx.lineTo(Math.min(cv.width,ox+M.w*z),Y);}
    ctx.stroke();
  };
  lines(1,'rgba(255,255,255,.055)');       // 1셀 = 1m
  lines(10,'rgba(255,255,255,.10)');       // 10m
  lines(100,'rgba(140,200,255,.22)');      // 100m
  lines(1000,'rgba(140,200,255,.40)');     // 1km
  // 눈금 좌표 — 위·왼쪽 가장자리
  const lstep = (100*z>=44) ? 100 : (1000*z>=44 ? 1000 : 0);
  if(lstep){
    ctx.font='10px ui-monospace,monospace';ctx.fillStyle='rgba(180,220,255,.75)';
    ctx.textAlign='left';ctx.textBaseline='top';
    const x0=Math.max(0,Math.floor((-ox/z)/lstep)*lstep), x1=Math.min(M.w,(cv.width-ox)/z);
    for(let x=x0;x<=x1;x+=lstep) ctx.fillText(x, Math.round(ox+x*z)+2, 2);
    const y0=Math.max(0,Math.floor((-oy/z)/lstep)*lstep), y1=Math.min(M.h,(cv.height-oy)/z);
    for(let y=y0;y<=y1;y+=lstep) ctx.fillText(y, 2, Math.round(oy+y*z)+2);
    ctx.textBaseline='alphabetic';
  }
  // 축척바 — 화면에서 60~200px에 드는 깔끔한 수를 고른다
  let unit=1; while(unit*z<60) unit*=10;
  if(unit*z>200&&unit>=10){ if(unit/2*z>=60)unit/=2; else if(unit/5*z>=60)unit/=5; }
  const bw=unit*z, bx=cv.width-24-bw, by=cv.height-22;
  ctx.strokeStyle='rgba(220,240,255,.9)';ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(bx,by-5);ctx.lineTo(bx,by);ctx.lineTo(bx+bw,by);ctx.lineTo(bx+bw,by-5);ctx.stroke();
  ctx.font='11px ui-sans-serif,system-ui,sans-serif';ctx.fillStyle='rgba(220,240,255,.95)';
  ctx.textAlign='center';ctx.textBaseline='bottom';
  ctx.fillText(unit>=1000?(unit/1000)+'km':unit+'m', bx+bw/2, by-6);
  ctx.textBaseline='alphabetic';
}
// ★커서 아래 판정은 **구운 그림의 색을 되읽어** 답한다(지형 수식 복제 금지).
//   층을 바꿀 때 사본도 같이 바꾼다 — 두 층을 동시에 들고 있으면 34MiB짜리 버퍼가 둘이 된다.
function bakeRead(im){
  off=off||document.createElement('canvas');off.width=M.w;off.height=M.h;
  const oc=off.getContext('2d',{willReadFrequently:true});oc.clearRect(0,0,M.w,M.h);oc.drawImage(im,0,0);
  od=oc.getImageData(0,0,M.w,M.h).data;
}
let ready=0;
const onready=()=>{ if(++ready<2)return; legend(); bakeRead(mode==='fert'?FIMG:IMG); resize(); };
IMG.onload=onready; FIMG.onload=onready;
cv.addEventListener('mousedown',e=>{drag={x:e.clientX,y:e.clientY,sx:S.x,sy:S.y};});
addEventListener('mouseup',()=>drag=null);
addEventListener('mousemove',e=>{
  if(drag){S.x=drag.sx-(e.clientX-drag.x)/S.z;S.y=drag.sy-(e.clientY-drag.y)/S.z;draw();}
  const z=S.z,ox=cv.width/2-S.x*z,oy=cv.height/2-S.y*z;
  const cx=Math.floor((e.clientX-ox)/z),cy=Math.floor((e.clientY-oy)/z);
  const h=document.getElementById('hud');
  if(!od||cx<0||cy<0||cx>=M.w||cy>=M.h){h.textContent='—';return;}
  const i=(cy*M.w+cx)*4,c='#'+[od[i],od[i+1],od[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');
  const p=(mode==='fert'?M.fpal:M.pal).find(q=>q.c===c);
  h.innerHTML='셀 <b>('+cx+', '+cy+')</b> · '+(mode==='fert'?'비옥도 ':'')+(p?p.n:'?')+' · 픽셀 '+(cx*M.cell)+','+(cy*M.cell)+' · 줌 '+z.toFixed(2)+'×';
});
cv.addEventListener('wheel',e=>{e.preventDefault();
  const z0=S.z,z1=Math.max(0.03,Math.min(24,z0*(e.deltaY<0?1.2:1/1.2)));
  const ox=cv.width/2-S.x*z0,oy=cv.height/2-S.y*z0;
  const wx=(e.clientX-ox)/z0,wy=(e.clientY-oy)/z0;
  S.z=z1;S.x=wx-(e.clientX-cv.width/2)/z1;S.y=wy-(e.clientY-cv.height/2)/z1;draw();},{passive:false});
document.getElementById('lab').onchange=e=>{showLab=e.target.checked;draw();};
document.getElementById('grd').onchange=e=>{showGrid=e.target.checked;draw();};
function setMode(m){
  if(m===mode)return;
  mode=m;
  document.querySelectorAll('button.lyr').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  bakeRead(mode==='fert'?FIMG:IMG); legend(); draw();
}
document.querySelectorAll('button.lyr').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT')return;
  if(e.key==='f'||e.key==='F') setMode(mode==='fert'?'terrain':'fert');
});
document.getElementById('q').oninput=e=>{
  const s=e.target.value.trim();if(!s)return;
  const l=M.labels.find(v=>v.n===s)||M.labels.find(v=>v.n.indexOf(s)===0);
  if(l){S.x=l.x;S.y=l.y;S.z=Math.max(S.z,2);draw();}
};
</script></body></html>`;
const OUTH = path.join(__dirname, '..', '..', 'cell-map.html');
fs.writeFileSync(OUTH, html);
console.log('뷰어 ' + (html.length / 1024 / 1024).toFixed(2) + 'MB → ' + OUTH);
console.log('이름표 ' + labels.length + '개 · ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
