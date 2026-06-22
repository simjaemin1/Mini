#!/usr/bin/env node
// world v4.json 분포 보정 → world v5.json
//  sahar(desert): 강 2개만, 호수 1개(오아시스)만, 산맥 3개 추가, 오아시스 숲 1개 추가
//  centaria(plains): 산맥 2개(가장 긴 것)만 남김
//  jungwon_n(plains): 산맥 3개(경계에 가까운 것)만 남김
//  nippon(mountain): 산맥 2개 추가 (4→6)
'use strict';
const fs = require('fs'), path = require('path');
const IN = path.join(__dirname,'..','..','world v4.json');
const OUT = path.join(__dirname,'..','..','world v5.json');

const html = fs.readFileSync(path.join(__dirname,'..','..','map-editor.html'),'utf8');
const blk = html.match(/const WZONES = \{([\s\S]*?)\};/)[1];
const Z={}; let m; const re=/(\w+):\{off:\[(\d+),(\d+)\],size:\[(\d+),(\d+)\]/g;
while((m=re.exec(blk))) Z[m[1]]={off:[+m[2],+m[3]],size:[+m[4],+m[5]]};
const zoneAt=(x,y)=>{for(const z in Z){const o=Z[z].off,s=Z[z].size;if(x>=o[0]&&x<o[0]+s[0]&&y>=o[1]&&y<o[1]+s[1])return z;}return null;};
const plen=p=>{let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return L;};
const cen=f=>f.center?[f.center.x,f.center.y]:[f.path[Math.floor(f.path.length/2)].x,f.path[Math.floor(f.path.length/2)].y];
function chaikin(p,n){let c=p.map(q=>({x:q.x,y:q.y}));for(let r=0;r<n;r++){const o=[c[0]];for(let i=0;i<c.length-1;i++){const a=c[i],b=c[i+1];o.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25});o.push({x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75});}o.push(c[c.length-1]);c=o;}return c;}

const j = JSON.parse(fs.readFileSync(IN,'utf8'));
let F = j.mf;
let nextId = Math.max(...F.map(f=>+f.id||0)) + 1;

// 산맥 생성기 — 존-로컬 분수 좌표 waypoints → 사행 + 폭 프로파일
function makeRidge(zone, fracPts, name){
  const o=Z[zone].off, s=Z[zone].size;
  let pts = fracPts.map(([fx,fy])=>({x:o[0]+fx*s[0], y:o[1]+fy*s[1]}));
  pts = chaikin(pts, 2);
  const L = plen(pts);
  const maxW = Math.max(800, Math.min(2800, Math.round(700 + L*0.018)));
  let cum=[0]; for(let i=1;i<pts.length;i++) cum[i]=cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
  const pathArr = pts.map((p,i)=>{const t=L?cum[i]/L:.5;const e=Math.min(t,1-t);const tf=0.42+0.58*Math.min(1,e/0.18);return {x:Math.round(p.x),y:Math.round(p.y),w:Math.round(maxW*tf)};});
  return {id:nextId++, type:'ridge', name, flags:{noFit:false,noValley:false,pinStart:false}, path:pathArr};
}
function makeForest(zone, fx, fy, rx, ry, name){
  const o=Z[zone].off, s=Z[zone].size;
  return {id:nextId++, type:'forest', name, center:{x:Math.round(o[0]+fx*s[0]), y:Math.round(o[1]+fy*s[1])}, rx, ry, density:1.5};
}

// 존별 feature 모으기
const byZone={};
for(const f of F){const z=zoneAt(...cen(f)); if(!z)continue; (byZone[z]=byZone[z]||[]).push(f);}
const remove = new Set();
const edgeDist=(f,z)=>{const o=Z[z].off,s=Z[z].size;const[cx,cy]=cen(f);return Math.min(cx-o[0],o[0]+s[0]-cx,cy-o[1],o[1]+s[1]-cy);};

// --- sahar: 강 2, 호수 1 ---
{const z='sahar';const fs_=byZone[z]||[];
 const rivers=fs_.filter(f=>f.type==='river').sort((a,b)=>plen(b.path)-plen(a.path));
 rivers.slice(2).forEach(f=>remove.add(f.id));
 const lakes=fs_.filter(f=>f.type==='lake').sort((a,b)=>(b.radius||0)-(a.radius||0));
 lakes.slice(1).forEach(f=>remove.add(f.id));
}
// --- centaria: 산맥 2(최장) ---
{const z='centaria';const rg=(byZone[z]||[]).filter(f=>f.type==='ridge').sort((a,b)=>plen(b.path)-plen(a.path));
 rg.slice(2).forEach(f=>remove.add(f.id));}
// --- jungwon_n: 산맥 3(경계 근접) ---
{const z='jungwon_n';const rg=(byZone[z]||[]).filter(f=>f.type==='ridge').sort((a,b)=>edgeDist(a,z)-edgeDist(b,z));
 rg.slice(3).forEach(f=>remove.add(f.id));}

F = F.filter(f=>!remove.has(f.id));

// --- 추가: sahar 산맥 3 + 오아시스 숲 1, nippon 산맥 2 ---
const added=[
 makeRidge('sahar',[[0.12,0.30],[0.28,0.40],[0.46,0.33],[0.62,0.46]],'아하르 산맥'),
 makeRidge('sahar',[[0.55,0.17],[0.69,0.29],[0.85,0.24]],'와르잔 산맥'),
 makeRidge('sahar',[[0.24,0.63],[0.40,0.73],[0.58,0.67]],'카탐 고원'),
 makeForest('sahar',0.5,0.5,6500,4200,'와하 야자림'),
 makeRidge('nippon',[[0.44,0.12],[0.56,0.25],[0.47,0.38],[0.58,0.50]],'유키야마'),
 makeRidge('nippon',[[0.50,0.55],[0.41,0.68],[0.53,0.80],[0.45,0.90]],'츠키야마'),
];
F = F.concat(added);
j.mf = F;
fs.writeFileSync(OUT, JSON.stringify(j));
console.log('제거:', remove.size, '| 추가:', added.length, '| 최종 mf:', F.length);
console.log('→', OUT);
