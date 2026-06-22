#!/usr/bin/env node
// world v5.json → world v6.json
//  ① 강 폭: 하류(바다쪽)로+길수록 두껍게 / 산맥 폭: 길수록 두껍고 끝은 가늘게
//  ② 강·호수·산맥·숲 이름 (존 문화별, 새 존 포함)
//  ③ 경계 걸친/넘는 지형은 닿는 지역마다 그 문화 이름을 동시에 (names[] + "A / B" 표시명)
'use strict';
const fs=require('fs'), path=require('path');
const IN=path.join(__dirname,'..','..','world v5.json');
const OUT=path.join(__dirname,'..','..','world v6.json');

const html=fs.readFileSync(path.join(__dirname,'..','..','map-editor.html'),'utf8');
const blk=html.match(/const WZONES = \{([\s\S]*?)\};/)[1];
const Z={}; let m; const re=/(\w+):\{off:\[(\d+),(\d+)\],size:\[(\d+),(\d+)\]/g;
while((m=re.exec(blk))) Z[m[1]]={off:[+m[2],+m[3]],size:[+m[4],+m[5]]};
const SEA=['atlantic','pacific','pacific_arctic','nambingyang','japan_pacific','indoyang','east_sea_s','oseania','nanyang'];
const zoneAt=(x,y)=>{for(const z in Z){const o=Z[z].off,s=Z[z].size;if(x>=o[0]&&x<o[0]+s[0]&&y>=o[1]&&y<o[1]+s[1])return z;}return null;};
const rectDist=(x,y,o,s)=>{const dx=Math.max(o[0]-x,0,x-(o[0]+s[0])),dy=Math.max(o[1]-y,0,y-(o[1]+s[1]));return Math.hypot(dx,dy);};
const seaDist=(x,y)=>{let d=1e15;for(const z of SEA)if(Z[z])d=Math.min(d,rectDist(x,y,Z[z].off,Z[z].size));return d;};
const plen=p=>{let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return L;};

// ── 존 문화 풀 ──
const POOLS={
 hanbando:{stems:['청','운','은','벽','송','죽','매','연','학','단','옥','화','명','도','율','미','선','소','자','노','양','봉','달','솔','미르','너른','버들','가람','진','보라'],rB:'강',rS:'천',rg:'산맥',lk:'호',fr:'수해'},
 jungwon:{stems:['적','창','운','청','화','양','려','무','천','태','형','진','초','조','촉','월','상','민','연','벽','단','강','소','명','옥','녹','람','서','홍','자','준','광'],rB:'하',rS:'수',rg:'산맥',lk:'호',fr:'림'},
 nippon:{stems:['아카','시로','쿠로','아오','미도리','하야','토오','사키','후카','아라','키요','나가','히로','오오','코가','유키','츠키','모리','카제','우미','호시','이즈','노노','후유','하루','아키','소라','마츠','스미'],rB:'가와',rS:'가와',rg:'야마',lk:'호',fr:'모리'},
 bering:{stems:['빙','설','북','동','은','백','서리','노바','토르','얼음','눈','한설','극','상고','동토','삭풍'],rB:'강',rS:'천',rg:'산맥',lk:'호',fr:'설림'},
 sibara:{stems:['토브','노바','카르','옴스','이르','베르','토르','시브','노르','자임','코름','민스','오비','예니','앙가','우랄리','토믹','솔카'],rB:'강',rS:'류',rg:'산맥',lk:'호',fr:'타이가'},
 nordan:{stems:['비요르','스반','노르드','피요','헬가','스카','아른','울브','토르드','군나','시그','베른','외스','빈드','달렌','순드','뇌르','하랄'],rB:'엘브',rS:'오',rg:'피엘',lk:'반',fr:'스코그'},
 europa:{stems:['로엔','발덴','그라우','셀바','몬테','발레','라우','아른','베르덴','펜린','타란','코르','몰덴','그란','벨른','두란','카엘','로덴','에스타','벤드'],rB:'강',rS:'천',rg:'산맥',lk:'호',fr:'발트'},
 sahar:{stems:['시디','엘구','네푸','하마드','마르잔','사빌','우바르','가르단','틴','자그','루브','카르','와르','아하','다흐','샤리'],rB:'와디',rS:'와디',rg:'산맥',lk:'사브카',fr:'야자림'},
 centaria:{stems:['코칸','제티','호젠','카라','알탄','보로','사릭','우준','텡','탈라','사마','부하','코샤','이르킨','오트','켄','쿠샨','테무'],rB:'다리야',rS:'사이',rg:'타우',lk:'쿨',fr:'토가이'},
 hindgang:{stems:['인드라','람','시타','아리야','찬드라','수리야','파드','비마','마하','수라','데비','아그니','바유','소마','라트','자무','케다','프라','바라','찬드'],rB:'나디',rS:'나디',rg:'기리',lk:'사가르',fr:'반'},
};
const ZP={hanbando:'hanbando',nippon:'nippon',jungwon_n:'jungwon',jungwon_s:'jungwon',bering:'bering',sibara:'sibara',nordan:'nordan',europa:'europa',sahar:'sahar',centaria:'centaria',hindgang:'hindgang'};

const REAL_SUB=['함경','낭림','묘향','멸악','차령','노령','태백','소백','백두','마식령','지리산','설악','한라','속리','청계천','금강','한강','낙동','대동강','압록','두만','섬진','영산강','청천강','예성','임진','황하','황수','장강','양자','위수','락수','낙수','회수','회하','한수','천지','백록담','소양','경포','청초','영랑','파로','의암'];
const REAL_EXACT=new Set(['태산','화산','형산','항산','숭산','려산','여산','아미산','무당산','곤륜산','천산','곤산','오악','청성산','닐기리','아무다리야','시르다리야','이식쿨']);
const isGeneric=n=>!n||/^경계/.test(String(n).trim())||/^(강|산맥|능선|호수|호|숲|고개|river|ridge|lake|forest|pass)\s*\d*$/i.test(String(n).trim());
const isReal=n=>REAL_EXACT.has(String(n))||REAL_SUB.some(s=>String(n).includes(s));

const used={}, idx={};
function uniq(zone,suffix){
 const pk=ZP[zone]||'hanbando', pool=POOLS[pk];
 used[zone]=used[zone]||new Set(); idx[zone]=idx[zone]||0;
 for(let t=0;t<pool.stems.length*4;t++){
  const stem=pool.stems[idx[zone]%pool.stems.length]; idx[zone]++;
  const round=Math.floor((idx[zone]-1)/pool.stems.length);
  const nm=stem+suffix+(round>0?'_'+(round+1):'');
  if(!used[zone].has(nm)){used[zone].add(nm);return nm;}
 }
 const nm=pool.stems[0]+suffix+Math.floor(Math.random()*9999); used[zone].add(nm); return nm;
}
function sufFor(zone,type,L){const p=POOLS[ZP[zone]||'hanbando'];
 if(type==='river')return L>34000?p.rB:p.rS; if(type==='ridge')return p.rg; if(type==='lake')return p.lk; return p.fr;}

// 지형이 닿는 존들 (가중치 desc)
function zonesFor(f){
 const w={};
 if(f.path){ for(const p of f.path){const z=zoneAt(p.x,p.y); if(z)w[z]=(w[z]||0)+1;}
  const tot=f.path.length; const arr=Object.entries(w).filter(([z,c])=>c>=Math.max(2,tot*0.08)).sort((a,b)=>b[1]-a[1]);
  return arr.length?arr.map(e=>e[0]):[zoneAt(f.path[0].x,f.path[0].y)].filter(Boolean);
 } else { const c=f.center, rx=f.rx||f.radius||0, ry=f.ry||f.radius||0;
  const pts=[[c.x,c.y],[c.x-rx,c.y],[c.x+rx,c.y],[c.x,c.y-ry],[c.x,c.y+ry]];
  for(const[x,y]of pts){const z=zoneAt(x,y); if(z)w[z]=(w[z]||0)+1;}
  const arr=Object.entries(w).sort((a,b)=>b[1]-a[1]); return arr.map(e=>e[0]);
 }
}

const j=JSON.parse(fs.readFileSync(IN,'utf8'));
const F=j.mf;

// ── pass1: 폭 재프로파일 + primary 이름 보존 등록 ──
let profR=0, profM=0;
for(const f of F){
 if(f.type==='river'){
  const p=f.path, L=plen(p);
  const dA=seaDist(p[0].x,p[0].y), dB=seaDist(p[p.length-1].x,p[p.length-1].y);
  const mouthEnd=dB<=dA;
  const mouthW=Math.max(240,Math.min(2400,Math.round(220+L*0.010)));
  const srcW=Math.max(120,Math.round(mouthW*0.28));
  let cum=[0]; for(let i=1;i<p.length;i++)cum[i]=cum[i-1]+Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
  for(let i=0;i<p.length;i++){let t=L?cum[i]/L:0; if(!mouthEnd)t=1-t; p[i].w=Math.round(srcW+(mouthW-srcW)*t);}
  profR++;
 } else if(f.type==='ridge'){
  const p=f.path, L=plen(p);
  const maxW=Math.max(800,Math.min(2800,Math.round(700+L*0.018)));
  let cum=[0]; for(let i=1;i<p.length;i++)cum[i]=cum[i-1]+Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
  for(let i=0;i<p.length;i++){const t=L?cum[i]/L:.5;const e=Math.min(t,1-t);const tf=0.42+0.58*Math.min(1,e/0.18);p[i].w=Math.round(maxW*tf);}
  profM++;
 }
 f._zones=zonesFor(f);
 f._L=f.path?plen(f.path):0;
 // primary 기존 이름 보존?
 if(['river','ridge','lake','forest'].includes(f.type)){
  const prim=f._zones[0];
  if(prim && f.name && !isGeneric(f.name) && !isReal(f.name) && !String(f.name).includes('/')){
   f._keepPrimary=true; used[prim]=used[prim]||new Set(); used[prim].add(f.name);
  }
 }
}

// ── pass2: 이름 부여 (primary + 경계 복수) ──
let named=0, multi=0;
for(const f of F){
 if(!['river','ridge','lake','forest'].includes(f.type))continue;
 let zs=f._zones; if(!zs.length)continue;
 if(f.type==='forest'||f.type==='lake') zs=zs.slice(0,2); // 면적형은 최대 2지역
 const names=[]; const taken=new Set();
 for(let i=0;i<zs.length;i++){
  const zone=zs[i], suf=sufFor(zone,f.type,f._L); let nm;
  if(i===0 && f._keepPrimary) nm=f.name;
  else nm=uniq(zone, suf);
  let guard=0; while(taken.has(nm) && guard++<25) nm=uniq(zone, suf); // 같은 지형 내 이름 중복 방지
  taken.add(nm);
  names.push({zone,name:nm});
 }
 f.names=names;
 f.name=names.map(n=>n.name).join(' / ');
 if(names.length>1)multi++;
 named++;
 delete f._zones; delete f._L; delete f._keepPrimary;
}

fs.writeFileSync(OUT, JSON.stringify(j));
console.log(`폭 재프로파일: 강 ${profR}, 산맥 ${profM}`);
console.log(`이름 부여: ${named}개 (그 중 경계 복수이름 ${multi}개)`);
console.log('→', OUT);
