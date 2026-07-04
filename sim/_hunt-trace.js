// sim/_hunt-trace.js — 사냥실험실 행동 트레이스 분석기: 시뮬을 직접 돌리고 로그로 병리 검출
// 사용: node sim/_hunt-trace.js [종이모지] [일수]   (기본 🦌 10일)
const fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','..','사냥실험실.html'),'utf8');
let js=/<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';","");
const els={};
global.document={getElementById:id=>els[id]||(els[id]={value:{nh:'3',cap:'24',spd:'18'}[id]||'0',textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.performance={now:()=>0};global.requestAnimationFrame=()=>{};global.window=global;
js=js.replace("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
"const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});global.addEventListener=()=>{};");
js=js.replace('window.addEventListener','global.addEventListener').replace('bakeBG();resetAll();requestAnimationFrame(loop);','resetAll();');
js+=`
global.__run=function(sp,days){
  HUNT_SPECIES=sp;resetAll();lifeGM=216;_t0GM=lifeGM;
  const rows=[],kills=[];let prevK=0;
  for(let t=0;t<days*1440;t++){lifeGM+=0.5;s.day=Math.floor(lifeGM/720);driveHunters(0.5);updateMobs(s,0.5);
    if((s._mobKills||0)>prevK){kills.push(t);prevK=s._mobKills;}
    for(let hi=0;hi<s.agents.length;hi++){const a=s.agents[hi];if(a._dead)continue;
      let tg=a._tgt&&a._tgt.hp>0?a._tgt:null,dn=1e9,nm=null;
      for(const m of s.mobs){if(m.hp<=0||m.st==='dead')continue;const d=Math.hypot(m.px-a.px,m.py-a.py);if(d<dn){dn=d;nm=m;}}
      const ref=tg||nm,dr=ref?Math.hypot(ref.px-a.px,ref.py-a.py):-1;
      rows.push([t,hi,a.action||'-',a.sneak?1:0,+dr.toFixed(1),ref?(ref.st==='flee'||ref.fcd>0?2:(ref.st==='alert'?1:0)):3,ref?+(ref._spd||0).toFixed(1):-1,+a.px.toFixed(1),+a.py.toFixed(1)]);}}
  return {rows,shots:s._shots||0,hits:s._hitsN||0,dodge:s._dodgeN||0,kills:s._mobKills||0,lost:s._lostK||0,inj:s._inj||0,hdead:s._hDeadN||0,killT:kills,yld:s._mobYield||0,trail:s._trailN||0,kAll:s._kAll||0,kA:s._kA||0,kM:s._kM||0,sLv:s._sLv||{},hLv:s._hLv||{},kLv:s._kLv||{},yLv:s._yLv||{}};
};`;
eval(js);
const sp=process.argv[2]||'🦌',days=+(process.argv[3]||10);
const r=global.__run(sp,days);
// ── 분석 ──
const AL={'🦌':110,'🐇':20,'🐗':45,'🐺':120,'🐯':120}[sp]||110,SNK=Math.min(55,AL*1.2)+30,LC=Math.min(50,AL*1.08);   // ★종별 문턱: 잠행-원거리=개시+30, 도주링=경계×1.08
const share={},vio={sneakFar:0,loudClose:0,fireMoving:0},ep={sneakFar:0},prevAct={},prevPos={};
let sfRun=0,sfMax=0;
const stuck={};let stuckEp=0,stuckMax=0,flip=0,flipMax=0;const flipW={};   // ★라벨 진동: 추적↔조준 왕복(30분 창 내 재왕복만 카운트)
for(const q of r.rows){const[t,hi,act,sn,dr,st,tspd,x,y]=q;
  share[act]=(share[act]||0)+1;
  if(sn===1&&dr>SNK){vio.sneakFar++;sfRun++;sfMax=Math.max(sfMax,sfRun);}else{if(sfRun>=4)ep.sneakFar++;sfRun=0;}
  if(sn===0&&dr>0&&dr<LC&&st===0&&act==='접근')vio.loudClose++;   // 추적 제외: 부상 전담 32m 달려붙기는 설계(속도>은신)
  if(act==='저격'&&prevAct[hi]!=='저격'){if(tspd>=14)vio.fireMoving++;const pp=prevPos[hi];if(pp&&Math.hypot(x-pp[0],y-pp[1])>0.05)vio.fireWalking=(vio.fireWalking||0)+1;}if((prevAct[hi]==='추적'&&act==='조준')||(prevAct[hi]==='조준'&&act==='추적')){const w=flipW[hi]||[];w.push(t);while(w.length&&t-w[0]>60)w.shift();flipW[hi]=w;if(w.length>=4){flip++;flipMax=Math.max(flipMax,w.length);}}prevAct[hi]=act;prevPos[hi]=[x,y];
  const key=hi+':'+act+':'+Math.round(x/3)+':'+Math.round(y/3);
  if(['추적','접근','회수'].includes(act)){stuck[key]=(stuck[key]||0)+1;if(stuck[key]===60)stuckEp++;stuckMax=Math.max(stuckMax,stuck[key]);}
}
const tot=r.rows.length;
console.log('═══ '+sp+' '+days+'일 트레이스('+tot+'행) ═══');
console.log('행동 점유율:',Object.entries(share).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+(100*v/tot).toFixed(1)+'%').join(' · '));
console.log('위반 — 잠행-원거리(>85m):',vio.sneakFar+'틱 / 에피소드(≥2분)',ep.sneakFar,'/ 최장',(sfMax/2).toFixed(1)+'분',
  '· 도주링 평보침입(<50m·방심표적):',vio.loudClose+'틱','· 이동표적 사격:',vio.fireMoving,'· 이동 중 발사(사수):',vio.fireWalking||0);
console.log('추적↔조준 진동(30분 내 4회+ 전환):',flip+'틱 · 최다 밀도',flipMax);
console.log('멈춤(이동 행동인데 3m 격자 제자리 ≥30분): 에피소드',stuckEp,'· 최장',(stuckMax/2).toFixed(0)+'분');
const iv=[];for(let i=1;i<r.killT.length;i++)iv.push((r.killT[i]-r.killT[i-1])/2);
iv.sort((a,b)=>a-b);
console.log('파이프라인: 발사',r.shots,'→선판정명중',r.hits,'('+(r.shots?Math.round(100*r.hits/r.shots):0)+'%)','→회피',r.dodge,'→수확',r.kills,'· 손실',r.lost,'· 부상',r.inj,'· 사망',r.hdead);
console.log('레벨별 — '+Object.keys(r.sLv).sort((a,b)=>a-b).map(L=>'Lv'+L+': 발사'+r.sLv[L]+' 명중'+(r.hLv[L]||0)+'('+Math.round(100*(r.hLv[L]||0)/r.sLv[L])+'%) 수확'+(r.kLv[L]||0)+' 수율'+((r.yLv[L]||0).toFixed(1))).join(' · ')+' — 총수율 '+r.yld.toFixed(1));
console.log('킬 소스 — 총사망',r.kAll,'· 화살',r.kA,'· 근접',r.kM,'· (도살수확',r.kills+')');
console.log('포획 간격: 중앙값',iv.length?iv[(iv.length/2)|0].toFixed(0):'-','분 · 포획/일',(r.kills/days).toFixed(1),'· 화살/수확',r.kills?(r.shots/r.kills).toFixed(1):'-','· 핏자국추적틱',r.trail);
