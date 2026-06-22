#!/usr/bin/env node
// === scripts/refine-world.js — map-editor 작업저장(editorWork) 다듬기 ===
// 강/산맥/호수 이름을 존(나라)별 문화 분위기 가공 이름으로 정리.
//  - 실제 지명(함경/묘향/멸악/차령/노령산맥, 청계천, 금강, 백두대간, 천지, 위수/락수/회수/황하 등) → 가공 이름 교체
//  - 자동이름(강1·산맥2…)·"경계X" 자리표시 → 가공 이름
//  - 문화에 안 맞는 접미(닛폰의 '~천' 등) → 해당 문화 접미로 재명명 (닛폰=~가와, 중원=~하/수 …)
//  - 지역 정체성 이름(닛폰*·중원*·베링*·시바라*)과 사용자가 아끼는 '낙만강'은 유지
// 강 폭: 하류(바다 쪽)로 갈수록 + 길수록 넓게.  산맥 폭: 길수록 굵고 양 끝은 가늘게.
// 강/산맥 경로는 Chaikin 1회로 가볍게 매끈하게.
// 사용: node scripts/refine-world.js [입력.json] [출력.json]  (기본 ../../world v3.json → ../../world v3 refined.json)
'use strict';
const fs = require('fs');
const path = require('path');

const IN  = path.join(__dirname, '..', '..', process.argv[2] || 'world v3.json');
const OUT = path.join(__dirname, '..', '..', process.argv[3] || 'world v3 refined.json');

// --- WZONES (map-editor.html에서 추출) ---
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'map-editor.html'), 'utf8');
const blk = html.match(/const WZONES = \{([\s\S]*?)\};/)[1];
const Z = {}; const re = /(\w+):\{off:\[(\d+),(\d+)\],size:\[(\d+),(\d+)\]/g; let m;
while ((m = re.exec(blk))) Z[m[1]] = { off: [+m[2], +m[3]], size: [+m[4], +m[5]] };
const SEA = ['atlantic','pacific','pacific_arctic','nambingyang','japan_pacific','indoyang','east_sea_s','oseania','nanyang'];

function zoneAt(x, y){ for (const z in Z){ const o=Z[z].off,s=Z[z].size; if(x>=o[0]&&x<o[0]+s[0]&&y>=o[1]&&y<o[1]+s[1]) return z; } return null; }
function rectDist(x,y,o,s){ const dx=Math.max(o[0]-x,0,x-(o[0]+s[0])), dy=Math.max(o[1]-y,0,y-(o[1]+s[1])); return Math.hypot(dx,dy); }
function seaDist(x,y){ let d=1e15; for(const z of SEA){ if(Z[z]) d=Math.min(d, rectDist(x,y,Z[z].off,Z[z].size)); } return d; }
function plen(p){ let L=0; for(let i=1;i<p.length;i++) L+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y); return L; }
function chaikin(p, n){ if(p.length<3) return p.map(q=>({x:q.x,y:q.y})); let c=p.map(q=>({x:q.x,y:q.y}));
  for(let r=0;r<n;r++){ const o=[c[0]]; for(let i=0;i<c.length-1;i++){ const a=c[i],b=c[i+1]; o.push({x:a.x*.75+b.x*.25,y:a.y*.75+b.y*.25}); o.push({x:a.x*.25+b.x*.75,y:a.y*.25+b.y*.75}); } o.push(c[c.length-1]); c=o; } return c; }

// --- 존별 이름 풀 (실제 유명 하천명 형성 음절 제외) ---
const JW = { stems:['적','창','운','청','화','양','려','무','천','태','형','진','초','조','촉','월','상','민','연','벽','단','강','소','명','옥','녹','람','서','홍','자','준','광'], rB:'하', rS:'수', rg:'산맥', rgS:'령', lk:'호' };
const POOL = {
  hanbando:{ stems:['청','운','은','벽','송','죽','매','연','학','단','옥','화','명','도','율','미','선','소','자','노','양','봉','달','솔','미르','새별','구름','너른','버들','가람','수','진','보라'], rB:'강', rS:'천', rg:'산맥', rgS:'령', lk:'호' },
  jungwon_n: JW, jungwon_s: JW,
  nippon:{ stems:['아카','시로','쿠로','아오','미도리','하야','토오','사키','후카','아라','키요','나가','히로','오오','코가','유키','츠키','모리','카제','우미','호시','이즈','타카','노노','후유','하루','아키','소라','마츠','스미'], rB:'가와', rS:'가와', rg:'야마', rgS:'산맥', lk:'호' },
  bering:{ stems:['빙','설','북','동','은','백','서리','노바','토르','얼음','눈','한설','극','상고','동토','삭풍'], rB:'강', rS:'천', rg:'산맥', rgS:'령', lk:'호' },
  sibara:{ stems:['토브','노바','카르','옴스','이르','베르','토르','시브','노르','자임','코름','민스','오비','예니','앙가','우랄리','토믹','솔카'], rB:'강', rS:'류', rg:'산맥', rgS:'스크령', lk:'호' },
};
const LBL = { hanbando:'한반도', nippon:'닛폰', jungwon_n:'중원', jungwon_s:'중원', bering:'베링', sibara:'시바라' };
const FIT = {
  hanbando:{ river:['강','천'], ridge:['산맥','령','대간','정맥'], lake:['호','못','지'] },
  jungwon_n:{ river:['하','수'], ridge:['산','령','산맥'], lake:['호','택','담'] },
  jungwon_s:{ river:['하','수'], ridge:['산','령','산맥'], lake:['호','택','담'] },
  nippon:{ river:['가와'], ridge:['야마','산맥','다케','령'], lake:['호','코'] },
  bering:{ river:['강','천'], ridge:['산맥','령'], lake:['호'] },
  sibara:{ river:['강','류'], ridge:['산맥','령','스크령'], lake:['호'] },
};
// 실제 유명 지명 — 부분일치(길어서 안전한 것)
const REAL_SUB = ['함경','낭림','묘향','멸악','차령','노령','태백','소백','백두','마식령','지리산','설악','한라','속리',
  '청계천','금강','한강','낙동','대동강','압록','두만','섬진','영산강','청천강','예성','임진',
  '황하','황수','장강','양자','위수','락수','낙수','회수','회하','한수',
  '천지','백록담','소양','경포','청초','영랑','파로','의암'];
// 실제 유명 지명 — 완전일치(짧아서 부분일치 시 오탐 위험: 중국 명산 등)
const REAL_EXACT = new Set(['태산','화산','형산','항산','숭산','려산','여산','아미산','무당산','곤륜산','천산','곤산','오악','청성산']);
const REAL = REAL_SUB; // 호환

const isGeneric = n => !n || /^(강|산맥|능선|호수|호|숲|고개|river|ridge|lake|forest|pass)\s*\d*$/i.test(String(n).trim());
const isReal = n => REAL_EXACT.has(String(n)) || REAL_SUB.some(s => String(n).includes(s));
const wl = (n,z) => n==='낙만강' || (LBL[z] && String(n).startsWith(LBL[z]));
const fits = (n,z,t) => ((FIT[z]||FIT.hanbando)[t]||[]).some(s => String(n).endsWith(s));
function needRename(n,z,t){
  if (isGeneric(n) || /^경계/.test(String(n))) return true;
  if (isReal(n)) return true;
  if (wl(n,z)) return false;
  if (!fits(n,z,t)) return true;
  return false;
}

const used = {}; const idx = {};
function uniqueName(zone, suffix){
  const pool = POOL[zone] || POOL.hanbando;
  used[zone] = used[zone] || new Set(); idx[zone] = idx[zone] || 0;
  for (let tries=0; tries<pool.stems.length*4; tries++){
    const stem = pool.stems[idx[zone] % pool.stems.length]; idx[zone]++;
    const round = Math.floor((idx[zone]-1) / pool.stems.length);
    const nm = stem + suffix + (round>0 ? '_'+(round+1) : '');
    if (!used[zone].has(nm)){ used[zone].add(nm); return nm; }
  }
  const nm = (pool.stems[0]||'무명') + suffix + Math.floor(Math.random()*9999);
  used[zone].add(nm); return nm;
}

// --- 로드 ---
const j = JSON.parse(fs.readFileSync(IN, 'utf8'));
const F = (j.mf && j.mf.length) ? j.mf : (j.features || []);
const centroid = f => f.center ? [f.center.x,f.center.y] : (()=>{ const p=f.path[Math.floor(f.path.length/2)]; return [p.x,p.y]; })();

// pass1: 명명 플래그 결정 + 유지 이름 등록
for (const f of F){
  if (!['river','ridge','lake'].includes(f.type)) continue;
  const [x,y]=centroid(f); const z=zoneAt(x,y)||'hanbando';
  if (f.type==='ridge' && String(f.name||'').includes('백두')) { f._spine=true; f._ren=true; continue; }
  f._ren = needRename(f.name, z, f.type);
  if (!f._ren) { used[z]=used[z]||new Set(); used[z].add(f.name); }
}

// pass2: 폭 재프로파일 + 이름 부여
let named=0, profiledR=0, profiledM=0;
const changes=[];
for (const f of F){
  const [cx,cy] = centroid(f); const z = zoneAt(cx,cy) || 'hanbando'; const pool = POOL[z] || POOL.hanbando;
  if (f.type==='river'){
    let pts = chaikin(f.path, 1); const L = plen(pts);
    const dA = seaDist(pts[0].x,pts[0].y), dB = seaDist(pts[pts.length-1].x,pts[pts.length-1].y);
    const mouthAtEnd = dB <= dA;
    const mouthW = Math.max(240, Math.min(2400, Math.round(220 + L*0.010)));
    const srcW = Math.max(120, Math.round(mouthW*0.28));
    let cum=[0]; for(let i=1;i<pts.length;i++) cum[i]=cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    f.path = pts.map((p,i)=>{ let t=(L?cum[i]/L:0); if(!mouthAtEnd)t=1-t; return { x:Math.round(p.x), y:Math.round(p.y), w:Math.round(srcW+(mouthW-srcW)*t) }; });
    profiledR++;
    if (f._ren){ const old=f.name; f.name=uniqueName(z, L>34000?pool.rB:pool.rS); named++; if(old&&!isGeneric(old))changes.push(`${old}→${f.name}`); }
  } else if (f.type==='ridge'){
    let pts = chaikin(f.path, 1); const L = plen(pts);
    const maxW = Math.max(800, Math.min(2800, Math.round(700 + L*0.018)));
    let cum=[0]; for(let i=1;i<pts.length;i++) cum[i]=cum[i-1]+Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y);
    f.path = pts.map((p,i)=>{ const t=L?cum[i]/L:.5; const edge=Math.min(t,1-t); const tf=0.42+0.58*Math.min(1,edge/0.18); return { x:Math.round(p.x), y:Math.round(p.y), w:Math.round(maxW*tf) }; });
    profiledM++;
    if (f._spine){ const old=f.name; f.name='한밝대간'; used[z]=used[z]||new Set(); used[z].add(f.name); named++; changes.push(`${old}→${f.name}`); }
    else if (f._ren){ const old=f.name; f.name=uniqueName(z, pool.rg); named++; if(old&&!isGeneric(old))changes.push(`${old}→${f.name}`); }
  } else if (f.type==='lake'){
    if (f._ren){ const old=f.name; f.name=uniqueName(z, pool.lk); named++; if(old&&!isGeneric(old))changes.push(`${old}→${f.name}`); }
  }
  delete f._ren; delete f._spine;
}

fs.writeFileSync(OUT, JSON.stringify(j));
console.log('다듬기 완료 →', OUT);
console.log(`  이름 부여/교체: ${named} | 강 폭 ${profiledR} | 산맥 폭 ${profiledM}`);
console.log('  실제지명·문화불일치 교체 예:', changes.slice(0,16).join(', '));
