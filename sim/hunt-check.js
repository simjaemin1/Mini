// sim/hunt-check.js — 사냥실험실 자동 체크리스트(12 불변식). 사냥실험실.html 수정 시 매번 실행.
// 사용: node sim/hunt-check.js   (~15초, 🦌 10일 단일 패스에서 전 지표 수집)
const fs=require('fs'),path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','..','사냥실험실.html'),'utf8');
let js=/<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';","");
const els={};
global.document={getElementById:id=>els[id]||(els[id]={value:{nh:'3',cap:'24',spd:'36',terr:(global.__TERR||'초원')}[id]||'0',textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.performance={now:()=>0};global.requestAnimationFrame=()=>{};global.window=global;
js=js.replace("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
"const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});global.addEventListener=()=>{};");
js=js.replace('window.addEventListener','global.addEventListener').replace('bakeBG();resetAll();requestAnimationFrame(loop);','resetAll();');
js+=`
global.__check=function(days){
  HUNT_SPECIES='🦌';resetAll();lifeGM=432;_t0GM=lifeGM;
  const acts={},lockSt={},lock={kill:0,drop:0,sw:0,maxDur:0,durs:[]},TB={주:{k:0,h:0},밤:{k:0,h:0},취:{k:0,h:0}};
  let frames=0,err=null,prevAct={},prevPos={},fireWalk=0,fireMove=0,pk=0;
  const stuck={};let stuckEp=0,stuckMax=0;
  try{
  for(let t=0;t<days*1440;t++){lifeGM+=1;s.day=Math.floor(lifeGM/1440);driveHunters(1);updateMobs(s,1);frames++;
    const f=(lifeGM%1440)/1440,tb=(f>=0.92||f<0.17)?'취':((f>=0.25&&f<0.833)?'주':'밤');
    TB[tb].h+=1/1440*24;const kk=(s._kAll||0);TB[tb].k+=kk-pk;pk=kk;
    for(let hi=0;hi<s.agents.length;hi++){const a=s.agents[hi];if(a.job!=='hunter'||a._dead)continue;
      const act=a.action||'-';acts[act]=(acts[act]||0)+1;
      // 이동 중 발사
      if(act==='저격'&&prevAct[hi]!=='저격'){const pp=prevPos[hi];if(pp&&Math.hypot(a.px-pp[0],a.py-pp[1])>0.05)fireWalk++;
        const tg=a._bm;if(tg&&(tg._spd||0)>=7)fireMove++;}
      prevAct[hi]=act;prevPos[hi]=[a.px,a.py];
      // 멈춤(이동 라벨 제자리)
      const key=hi+':'+act+':'+Math.round(a.px/3)+':'+Math.round(a.py/3);
      if(['추적','접근','회수','집결'].includes(act)){stuck[key]=(stuck[key]||0)+1;if(stuck[key]===120)stuckEp++;stuckMax=Math.max(stuckMax,stuck[key]);}
      // lock 생애
      const cur=a._tgt&&a._tgt.hp>0&&a._tgt.st!=='dead'?a._tgt:null,pr=lockSt[hi];
      if(pr&&pr.m!==cur){const dead=pr.m.hp<=0||pr.m.st==='dead';if(dead)lock.kill++;else if(cur)lock.sw++;else lock.drop++;
        lock.maxDur=Math.max(lock.maxDur,t-pr.t0);lock.durs.push(t-pr.t0);lockSt[hi]=cur?{m:cur,t0:t}:null;}
      else if(!pr&&cur)lockSt[hi]={m:cur,t0:t};}}
  }catch(e){err=String(e&&e.stack||e).split('\\n')[0];}
  return {err,frames,acts,lock,TB,fireWalk,fireMove,stuckEp,stuckMax,
    shots:s._shots||0,kills:s._mobKills||0,kA:s._kA||0,kM:s._kM||0,lost:s._lostK||0,dead:s._hDeadN||0,days};
};`;
(0,eval)(js);
const RESULTS=[];
for(const TERR of ['초원','협곡']){global.__TERR=TERR;els.terr&&(els.terr.value=TERR);const r0=global.__check(TERR==='초원'?10:6);RESULTS.push([TERR,r0]);}
const r=RESULTS[0][1],rC=RESULTS[1][1];
const tot=Object.values(r.acts).reduce((a,b)=>a+b,0)||1;
const pct=k=>100*(r.acts[k]||0)/tot;
const lockN=r.lock.kill+r.lock.drop+r.lock.sw;
const C=[
 ['H1 크래시 없음(10일 완주)', !r.err, r.err||'무사고'],
 ['H2 사냥 성립(포획/일 ≥5)', r.kills/r.days>=5, (r.kills/r.days).toFixed(1)+'/일'],
 ['H3 화살 효율(발사/수확 ≤4)', r.kills>0&&r.shots/r.kills<=4, r.kills?(r.shots/r.kills).toFixed(1)+'발':'-'],
 ['H4 이동 중 발사 0', r.fireWalk===0, r.fireWalk+'건'],
 ['H5 이동표적 사격 ≤2', r.fireMove<=2, r.fireMove+'건'],
 ['H6 무한 추적 없음(최장 ≤250분=포기 타임아웃 상한, 중앙값 ≤100분)', r.lock.maxDur<=250&&med()<=100, '최장'+(r.lock.maxDur/1).toFixed(0)+'·중앙'+med().toFixed(0)+'분'],
 ['H7 갈아타기 0', r.lock.sw===0, r.lock.sw+'건'],
 ['H8 전담 처치율 ≥75%', lockN===0||r.lock.kill/lockN>=0.75, lockN?Math.round(100*r.lock.kill/lockN)+'% ('+lockN+'건)':'0건'],
 ['H9 멈춤 교착(제자리 60분+ ≤3, 최장 ≤240분)', stuckOK(), r.stuckEp+'건·최장'+(r.stuckMax).toFixed(0)+'분'],
 ['H10 활 생존(화살 킬 ≥15%)', (r.kA+r.kM)===0||r.kA/(r.kA+r.kM)>=0.15, r.kA+'/'+(r.kA+r.kM)],
 ['H11 밤 학살 없음(취침창 ≤주간×2.5)', nightOK(), tbStr()],
 ['H12 라벨 위생(조준+대치+재장전+물러남 ≤20%)', pct('조준')+pct('대치')+pct('재장전')+pct('물러남')<=20, (pct('조준')+pct('대치')+pct('재장전')+pct('물러남')).toFixed(1)+'%'],
];
function med(){const d=r.lock.durs.slice().sort((a,b)=>a-b);return d.length?d[(d.length/2)|0]:0;}
function stuckOK(){return r.stuckEp<=3&&r.stuckMax<=240;}
function nightOK(){const d=r.TB.주.k/Math.max(0.1,r.TB.주.h),n=r.TB.취.k/Math.max(0.1,r.TB.취.h);return d<=0?n<=0.5:n<=d*2.5;}
function tbStr(){return '주'+(r.TB.주.k/Math.max(0.1,r.TB.주.h)).toFixed(2)+'/밤'+(r.TB.밤.k/Math.max(0.1,r.TB.밤.h)).toFixed(2)+'/취'+(r.TB.취.k/Math.max(0.1,r.TB.취.h)).toFixed(2);}
C.push(['H13 협곡(미로)에서도 사냥 성립(크래시 0·포획/일 ≥3·교착 최장 ≤240분)',!rC.err&&rC.kills/rC.days>=3&&rC.stuckMax<=480,(rC.err?('크래시:'+rC.err):((rC.kills/rC.days).toFixed(1)+'/일·교착최장'+(rC.stuckMax/2).toFixed(0)+'분'))]);
let pass=0;
console.log('═══ 사냥실험실 체크리스트 (🦌 초원 10일 + 협곡 6일) ═══');
for(const [name,ok,detail] of C){console.log((ok?'  ✅ ':'  ❌ ')+name+' — '+detail);if(ok)pass++;}
console.log('  '+pass+'/'+C.length+(pass===C.length?' 전부 통과 ✅':' — ❌ 실패 있음'));
process.exit(pass===C.length?0:1);
