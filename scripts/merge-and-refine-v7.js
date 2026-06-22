#!/usr/bin/env node
// world v6.json → world v7.json
//  ① 두 번에 나눠 그린 강(끝점 근접 + 진행방향 연속) 조각들을 단일 강으로 병합
//  ② 병합 후 단일이름화 → 폭 재프로파일 → 존 문화 이름 + 경계 복수이름 재적용
'use strict';
const fs=require('fs'), path=require('path');
const IN=path.join(__dirname,'..','..','world v6.json');
const OUT=path.join(__dirname,'..','..','world v7.json');

const html=fs.readFileSync(path.join(__dirname,'..','..','map-editor.html'),'utf8');
const blk=html.match(/const WZONES = \{([\s\S]*?)\};/)[1];
const Z={}; let m; const re=/(\w+):\{off:\[(\d+),(\d+)\],size:\[(\d+),(\d+)\]/g;
while((m=re.exec(blk))) Z[m[1]]={off:[+m[2],+m[3]],size:[+m[4],+m[5]]};
const SEA=['atlantic','pacific','pacific_arctic','nambingyang','japan_pacific','indoyang','east_sea_s','oseania','nanyang'];
const zoneAt=(x,y)=>{for(const z in Z){const o=Z[z].off,s=Z[z].size;if(x>=o[0]&&x<o[0]+s[0]&&y>=o[1]&&y<o[1]+s[1])return z;}return null;};
const rectDist=(x,y,o,s)=>{const dx=Math.max(o[0]-x,0,x-(o[0]+s[0])),dy=Math.max(o[1]-y,0,y-(o[1]+s[1]));return Math.hypot(dx,dy);};
const seaDist=(x,y)=>{let d=1e15;for(const z of SEA)if(Z[z])d=Math.min(d,rectDist(x,y,Z[z].off,Z[z].size));return d;};
const plen=p=>{let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return L;};
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return[x/d,y/d];};
const ang=(a,b)=>Math.acos(Math.max(-1,Math.min(1,a[0]*b[0]+a[1]*b[1])))*180/Math.PI;

const j=JSON.parse(fs.readFileSync(IN,'utf8'));
let F=j.mf;

// ===== ① 병합 =====
// 끝점 outward(끝에서 바깥) / inward(끝에 도착하는) 방향
function inside(p,which){ return which===0? p[Math.min(3,p.length-1)] : p[Math.max(0,p.length-4)]; }
function endpt(r,which){ return which===0? r.path[0] : r.path[r.path.length-1]; }
function inwardAt(r,which){ const e=endpt(r,which), s=inside(r.path,which); return norm(e.x-s.x,e.y-s.y); } // 도착 방향(끝쪽으로)
const GAP=1000, GAPANG=55; // 보수적: 끝점이 거의 맞닿은 진짜 분할만 병합(과병합 방지)
const FORCE=[]; // 이름 기반 강제병합(이름 모호로 비활성)
const FORCE_PT=[]; // 좌표 기반 강제연결 (V자 병합 취소: 비움)
const SPLIT_REASSIGN=[[398122,176470]]; // 끝점이 다른 강 중간에 닿음 → 그 강을 분할, 연장부를 이 강에 재배치
let rivers=F.filter(f=>f.type==='river');
// === 중복(같은 자리에 두 번 그린) 강 제거 — 경로 85%+ 겹치면 짧은 쪽 제거 ===
(function(){
  const segDist=(px,py,ax,ay,bx,by)=>{const vx=bx-ax,vy=by-ay,wx=px-ax,wy=py-ay;let t=(vx*wx+vy*wy)/((vx*vx+vy*vy)||1);t=t<0?0:t>1?1:t;return Math.hypot(px-(ax+vx*t),py-(ay+vy*t));};
  const minToPath=(p,path)=>{let m=1e15;for(let i=0;i<path.length-1;i++){const d=segDist(p.x,p.y,path[i].x,path[i].y,path[i+1].x,path[i+1].y);if(d<m){m=d;if(m<400)return m;}}return m;};
  const bb=rivers.map(r=>{let x0=1e15,y0=1e15,x1=-1e15,y1=-1e15;for(const p of r.path){if(p.x<x0)x0=p.x;if(p.x>x1)x1=p.x;if(p.y<y0)y0=p.y;if(p.y>y1)y1=p.y;}return[x0,y0,x1,y1];});
  const rm=new Set();
  for(let i=0;i<rivers.length;i++){const A=rivers[i];if(rm.has(A.id))continue;const ba=bb[i];
    for(let j=0;j<rivers.length;j++){if(i===j)continue;const B=rivers[j];if(rm.has(B.id))continue;if(A.path.length>B.path.length)continue;const bj=bb[j];
      if(ba[2]<bj[0]-500||ba[0]>bj[2]+500||ba[3]<bj[1]-500||ba[1]>bj[3]+500)continue;
      let on=0;for(const p of A.path)if(minToPath(p,B.path)<400)on++;
      if(on/A.path.length>0.85){rm.add(A.id);break;}
    }
  }
  if(rm.size){F=F.filter(f=>f.type!=='river'||!rm.has(f.id));rivers=F.filter(f=>f.type==='river');}
  console.log('중복(겹치는) 강 제거:',rm.size,'개');
})();
// union-find
const parent=new Map(); rivers.forEach(r=>parent.set(r.id,r.id));
const find=x=>{while(parent.get(x)!==x){parent.set(x,parent.get(parent.get(x)));x=parent.get(x);}return x;};
const link=new Map(); // "id:which" -> {oid,owhich,gap}
function key(id,w){return id+':'+w;}
const merges=[]; const joinPts=[];
// 전역 후보 수집 → gap 작은 순 정렬 → 끝점 1회씩 잇기 (순서 안정적)
const cands=[];
for(let a=0;a<rivers.length;a++)for(let wa=0;wa<2;wa++){
  const A=rivers[a], Ae=endpt(A,wa), Ain=inwardAt(A,wa);
  for(let b=a+1;b<rivers.length;b++){ const B=rivers[b];
    for(let wb=0;wb<2;wb++){ const Be=endpt(B,wb);
      const gap=Math.hypot(Be.x-Ae.x,Be.y-Ae.y); if(gap>GAP)continue;
      const Bout=(()=>{const e=Be,s=inside(B.path,wb);return norm(e.x-s.x,e.y-s.y);})();
      const Bcontinue=[-Bout[0],-Bout[1]];
      const aJoin=ang(Ain,Bcontinue);
      const g=norm(Be.x-Ae.x,Be.y-Ae.y);
      const aGap=gap<700?0:ang(Ain,g);
      const angLim=gap<1500?50:30;
      if(aJoin<angLim && aGap<GAPANG) cands.push({a,wa,b,wb,gap,sc:aJoin+gap/300});
    }
  }
}
cands.sort((x,y)=>x.sc-y.sc);
for(const c of cands){ const A=rivers[c.a], B=rivers[c.b];
  const kA=key(A.id,c.wa), kB=key(B.id,c.wb);
  if(link.has(kA)||link.has(kB)) continue;
  if(find(A.id)===find(B.id)) continue;
  link.set(kA,{id:B.id,w:c.wb}); link.set(kB,{id:A.id,w:c.wa});
  parent.set(find(A.id),find(B.id));
  const Aep=endpt(A,c.wa),Bep=endpt(B,c.wb);
  merges.push([A.id,B.id,Math.round(c.gap)]);
  joinPts.push([Math.round((Aep.x+Bep.x)/2),Math.round((Aep.y+Bep.y)/2)]);
}
// 강제 병합 (이름 지정) — 가장 가까운 '빈' 끝점 쌍을 잇기
for(const [n1,n2] of FORCE){
  const A=rivers.find(r=>(r.name||'').split(' / ').includes(n1));
  const B=rivers.find(r=>(r.name||'').split(' / ').includes(n2));
  if(!A||!B||find(A.id)===find(B.id))continue;
  let bw=null;
  for(let wa=0;wa<2;wa++)for(let wb=0;wb<2;wb++){
    if(link.has(key(A.id,wa))||link.has(key(B.id,wb)))continue;
    const ae=endpt(A,wa),be=endpt(B,wb);const g=Math.hypot(ae.x-be.x,ae.y-be.y);
    if(!bw||g<bw.g)bw={wa,wb,g};
  }
  if(!bw)continue;
  link.set(key(A.id,bw.wa),{id:B.id,w:bw.wb});link.set(key(B.id,bw.wb),{id:A.id,w:bw.wa});
  parent.set(find(A.id),find(B.id));
  console.log('  강제병합:',n1,'+',n2,'gap',Math.round(bw.g));
}
// 체인 구성: 각 그룹의 강들을 끝점 link로 순서대로 이어붙임
const byId=new Map(rivers.map(r=>[r.id,r]));
const groups=new Map();
for(const r of rivers){const g=find(r.id); if(!groups.has(g))groups.set(g,[]); groups.get(g).push(r);}
const mergedRivers=[]; const removedIds=new Set(); const mergedBaseIds=[];
for(const[g,arr]of groups){
  if(arr.length===1){ mergedRivers.push(arr[0]); continue; }
  // 끝점 그래프에서 degree 1인 곳(체인 시작) 찾기
  const deg=new Map(); arr.forEach(r=>deg.set(r.id,0));
  for(const r of arr)for(const w of[0,1])if(link.has(key(r.id,w)))deg.set(r.id,deg.get(r.id)+1);
  let startId=arr[0].id, startW=0;
  for(const r of arr){ for(const w of[0,1]){ if(!link.has(key(r.id,w))){ startId=r.id; startW=w; } } }
  // 워크
  const orderPath=[]; let curId=startId, curEntryW=startW, guard=0; const visited=new Set();
  // curEntryW = 이 강에 '들어오는' 끝(이 끝부터 반대 끝으로 진행)
  while(curId!=null && !visited.has(curId) && guard++<arr.length+2){
    visited.add(curId); const r=byId.get(curId); const pts=r.path.map(p=>({...p}));
    if(curEntryW===1) pts.reverse(); // 들어오는 끝이 path끝이면 뒤집어 시작이 되게
    if(orderPath.length) orderPath.push(...pts); else orderPath.push(...pts);
    const exitW = curEntryW===0?1:0; // 나가는 끝
    const lk=link.get(key(curId,exitW));
    if(!lk)break; const nextId=lk.id, nextEntryW=lk.w; curId=nextId; curEntryW=nextEntryW;
  }
  const base=byId.get(startId);
  const baseName=(base.name||'').split(' / ')[0];
  mergedRivers.push({ id:base.id, type:'river', name:baseName, flags:base.flags||{noFit:false,noValley:false,pinStart:false}, path:orderPath });
  mergedBaseIds.push(base.id);
  for(const r of arr)if(r.id!==base.id)removedIds.add(r.id);
}
// F 재구성: 병합된 강으로 교체
F=F.filter(f=>f.type!=='river'||!removedIds.has(f.id)).map(f=>{
  if(f.type==='river'){ const mr=mergedRivers.find(x=>x.id===f.id); if(mr)return mr; }
  return f;
});

// ===== 좌표 기반 강제연결 (이름 모호 회피) — 병합 완료된 강 대상 =====
function nearEnd(pt){let best=null;for(const f of F){if(f.type!=='river')continue;for(const w of[0,1]){const e=w?f.path[f.path.length-1]:f.path[0];const d=Math.hypot(e.x-pt[0],e.y-pt[1]);if(!best||d<best.d)best={f,w,d};}}return best;}
for(const [p1,p2] of FORCE_PT){
  const A=nearEnd(p1), B=nearEnd(p2);
  if(!A||!B||A.f===B.f) continue;
  let ap=A.f.path.map(p=>({...p})); if(A.w===0)ap.reverse();   // A의 연결끝이 path 끝으로
  let bp=B.f.path.map(p=>({...p})); if(B.w===1)bp.reverse();   // B의 연결끝이 path 시작으로
  A.f.path=ap.concat(bp); A.f.name=(A.f.name||'').split(' / ')[0]; delete A.f.names;
  F=F.filter(f=>f!==B.f);
  console.log('  좌표연결: ('+p1+')↔('+p2+') 거리 '+Math.round(A.d)+'/'+Math.round(B.d)+' → 1강 ('+A.f.path.length+'pts)');
}

// ===== 끝점이 다른 강 중간에 닿은 경우: 분할 후 연장부 재배치 =====
for(const P of SPLIT_REASSIGN){
  let T=null,Tw=0,Td=1e15;
  for(const f of F){if(f.type!=='river')continue;for(const w of[0,1]){const e=w?f.path[f.path.length-1]:f.path[0];const d=Math.hypot(e.x-P[0],e.y-P[1]);if(d<Td){Td=d;T=f;Tw=w;}}}
  let X=null,Xi=-1,Xd=1e15;
  for(const f of F){if(f.type!=='river'||f===T)continue;for(let i=1;i<f.path.length-1;i++){const d=Math.hypot(f.path[i].x-P[0],f.path[i].y-P[1]);if(d<Xd){Xd=d;X=f;Xi=i;}}}
  if(!T||!X||Td>3000||Xd>3000){console.log('  split-reassign 대상 못찾음 (Td='+Math.round(Td)+' Xd='+Math.round(Xd)+')');continue;}
  const sp=X.path[Xi], partA=X.path.slice(0,Xi+1), partB=X.path.slice(Xi);
  const te=Tw?T.path[T.path.length-1]:T.path[0], tp=Tw?T.path[Math.max(0,T.path.length-4)]:T.path[Math.min(3,T.path.length-1)];
  const tdir=[te.x-tp.x,te.y-tp.y];
  const dot=(u,v)=>(u[0]*v[0]+u[1]*v[1])/((Math.hypot(u[0],u[1])||1)*(Math.hypot(v[0],v[1])||1));
  const aFar=partA[0], bFar=partB[partB.length-1];
  const useA = dot(tdir,[aFar.x-sp.x,aFar.y-sp.y]) > dot(tdir,[bFar.x-sp.x,bFar.y-sp.y]);
  let cont=(useA?partA:partB).map(p=>({...p})), keep=(useA?partB:partA).map(p=>({...p}));
  if(useA) cont.reverse();           // partA: sp가 끝 → 뒤집어 시작으로
  let tpath=T.path.map(p=>({...p})); if(Tw===0) tpath.reverse();
  T.path=tpath.concat(cont); T.name=(T.name||'').split(' / ')[0]; if(T.names)delete T.names;
  X.path=keep;               X.name=(X.name||'').split(' / ')[0]; if(X.names)delete X.names;
  console.log('  split-reassign: 분할강 잔여 '+keep.length+'pts, 연장부 '+cont.length+'pts → 대상강에 부착 (대상 '+T.path.length+'pts)');
}

// ===== 단일이름화 (재명명 위해) =====
for(const f of F){ if(f.names){ f.name=(f.name||'').split(' / ')[0]; delete f.names; } else if(f.name) f.name=(''+f.name).split(' / ')[0]; }

// ===== ②  refine: 폭 + 이름 + 복수이름 (refine-world-v6와 동일 규칙) =====
const JW={stems:['적','창','운','청','화','양','려','무','천','태','형','진','초','조','촉','월','상','민','연','벽','단','강','소','명','옥','녹','람','서','홍','자','준','광'],rB:'하',rS:'수',rg:'산맥',lk:'호',fr:'림'};
const POOLS={
 hanbando:{stems:['청','운','은','벽','송','죽','매','연','학','단','옥','화','명','도','율','미','선','소','자','노','양','봉','달','솔','미르','너른','버들','가람','진','보라'],rB:'강',rS:'천',rg:'산맥',lk:'호',fr:'수해'},
 jungwon:JW,
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
const used=new Set(),idx={}; // used: 전역 고유 이름 집합 (월드 전체에서 중복 금지)
function uniq(zone,suffix){const pk=ZP[zone]||'hanbando',pool=POOLS[pk];idx[zone]=idx[zone]||0;
 for(let t=0;t<pool.stems.length*8;t++){const stem=pool.stems[idx[zone]%pool.stems.length];idx[zone]++;const round=Math.floor((idx[zone]-1)/pool.stems.length);const nm=stem+suffix+(round>0?'_'+(round+1):'');if(!used.has(nm)){used.add(nm);return nm;}}
 const nm=pool.stems[0]+suffix+'_'+Math.floor(Math.random()*99999);used.add(nm);return nm;}
const sufFor=(zone,type,L)=>{const p=POOLS[ZP[zone]||'hanbando'];if(type==='river')return L>34000?p.rB:p.rS;if(type==='ridge')return p.rg;if(type==='lake')return p.lk;return p.fr;};
function zonesFor(f){const w={};
 if(f.path){for(const p of f.path){const z=zoneAt(p.x,p.y);if(z)w[z]=(w[z]||0)+1;}const tot=f.path.length;const arr=Object.entries(w).filter(([z,c])=>c>=Math.max(2,tot*0.08)).sort((a,b)=>b[1]-a[1]);return arr.length?arr.map(e=>e[0]):[zoneAt(f.path[0].x,f.path[0].y)].filter(Boolean);}
 const c=f.center,rx=f.rx||f.radius||0,ry=f.ry||f.radius||0;const pts=[[c.x,c.y],[c.x-rx,c.y],[c.x+rx,c.y],[c.x,c.y-ry],[c.x,c.y+ry]];for(const[x,y]of pts){const z=zoneAt(x,y);if(z)w[z]=(w[z]||0)+1;}return Object.entries(w).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);}
const cen=f=>f.center?[f.center.x,f.center.y]:[f.path[Math.floor(f.path.length/2)].x,f.path[Math.floor(f.path.length/2)].y];

let profR=0,profM=0;
for(const f of F){
 if(f.type==='river'){const p=f.path,L=plen(p);const dA=seaDist(p[0].x,p[0].y),dB=seaDist(p[p.length-1].x,p[p.length-1].y);const mouthEnd=dB<=dA;
  const mouthW=Math.max(240,Math.min(2400,Math.round(220+L*0.010))),srcW=Math.max(120,Math.round(mouthW*0.28));
  let cum=[0];for(let i=1;i<p.length;i++)cum[i]=cum[i-1]+Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
  for(let i=0;i<p.length;i++){let t=L?cum[i]/L:0;if(!mouthEnd)t=1-t;p[i].w=Math.round(srcW+(mouthW-srcW)*t);}profR++;}
 else if(f.type==='ridge'){const p=f.path,L=plen(p);const maxW=Math.max(800,Math.min(2800,Math.round(700+L*0.018)));
  let cum=[0];for(let i=1;i<p.length;i++)cum[i]=cum[i-1]+Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
  for(let i=0;i<p.length;i++){const t=L?cum[i]/L:.5,e=Math.min(t,1-t),tf=0.42+0.58*Math.min(1,e/0.18);p[i].w=Math.round(maxW*tf);}profM++;}
 f._zones=zonesFor(f); f._L=f.path?plen(f.path):0;
 if(['river','ridge','lake','forest'].includes(f.type)){const prim=f._zones[0];
  if(prim&&f.name&&!isGeneric(f.name)&&!isReal(f.name)&&!used.has(f.name)){f._keep=true;used.add(f.name);}}
}
let multi=0;
for(const f of F){if(!['river','ridge','lake','forest'].includes(f.type))continue;let zs=f._zones;if(!zs.length)continue;
 if(f.type==='forest'||f.type==='lake')zs=zs.slice(0,2);
 const names=[],taken=new Set();
 for(let i=0;i<zs.length;i++){const zone=zs[i],suf=sufFor(zone,f.type,f._L);let nm;
  if(i===0&&f._keep)nm=f.name;else nm=uniq(zone,suf);let g=0;while(taken.has(nm)&&g++<25)nm=uniq(zone,suf);taken.add(nm);names.push({zone,name:nm});}
 f.names=names; f.name=names.map(n=>n.name).join(' / '); if(names.length>1)multi++;
 delete f._zones;delete f._L;delete f._keep;}

j.mf=F;
fs.writeFileSync(OUT,JSON.stringify(j));
fs.writeFileSync('/tmp/merge_viz.json',JSON.stringify({joinPts,mergedIds:mergedBaseIds}));
console.log('병합:',merges.length,'쌍 →',mergedRivers.filter((r,i)=>true).length,'개 강 (이전',rivers.length,'개)');
console.log('  병합된 강 수(여러조각→1):',[...groups.values()].filter(a=>a.length>1).length);
console.log('폭 재프로파일 강',profR,'산맥',profM,'| 복수이름',multi);
console.log('→',OUT);
// 병합 상세(이전 이름)
const preName=new Map(rivers.map(r=>[r.id,(r.name||'').split(' / ')[0]]));
let shown=0;for(const[g,arr]of groups){if(arr.length>1&&shown++<12)console.log('   병합:',arr.map(r=>preName.get(r.id)).join(' + '),'→ '+arr.length+'조각');}
