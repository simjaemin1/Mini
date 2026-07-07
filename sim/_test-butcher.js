// sim/_test-butcher.js — §9 3차 기능 검증(일회용): 공유 몹 블록의 도축 산출(사슴·멧돼지=bone+1, 호랑이=tigerhide+1·herb+12)과
//   화살 데미지 ×_bowQ 배수(econ 주입 시 {2.5,1.25}, 미주입 시 {2,1})를 사냥실험실 사본에서 직접 구동.
const fs=require('fs'),path=require('path');
{let _s0=7*2654435761>>>0;Math.random=function(){_s0=_s0+0x6D2B79F5|0;let t=Math.imul(_s0^_s0>>>15,1|_s0);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const SRC=fs.readFileSync(path.join(__dirname,'..','..','사냥실험실.html'),'utf8');
let js=/<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';","");
const els={};
global.document={getElementById:id=>els[id]||(els[id]={value:{nh:'3',cap:'24',spd:'36',terr:'초원'}[id]||'0',textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.performance={now:()=>0};global.requestAnimationFrame=()=>{};global.window=global;
js=js.replace("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
"const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});global.addEventListener=()=>{};");
js=js.replace('window.addEventListener','global.addEventListener').replace('bakeBG();resetAll();requestAnimationFrame(loop);','resetAll();');
js+=`
global.__test=function(){
  const R=[];const ok=(name,cond,det)=>{R.push([name,!!cond,det]);};
  // ── A. 도축 산출(econ 주입) ──
  resetAll();lifeGM=432;
  s.econ={storage:{herb:0}};
  const mk=(type)=>({type,hp:0,st:'dead',rot:100,px:s.agents[0].px,py:s.agents[0].py,_bp:6+MOB_DEF[type].hp*6-0.5});
  for(const [type,exp] of [['🦌','bone'],['🐗','bone'],['🐯','tigerhide'],['🐇',null]]){
    const a=s.agents[0];a.job='hunter';a.state='work';
    const before={bone:s.econ.storage.bone||0,tigerhide:s.econ.storage.tigerhide||0,herb:s.econ.storage.herb||0};
    a._carc=mk(type);updateMobs(s,1);
    const d={bone:(s.econ.storage.bone||0)-before.bone,tigerhide:(s.econ.storage.tigerhide||0)-before.tigerhide,herb:(s.econ.storage.herb||0)-before.herb};
    if(exp==='bone')ok(type+' 도축→bone+1',d.bone===1&&d.tigerhide===0,JSON.stringify(d));
    else if(exp==='tigerhide')ok('🐯 도축→tigerhide+1·herb+12',d.tigerhide===1&&d.herb===12&&d.bone===0,JSON.stringify(d));
    else ok(type+' 도축→bone 없음',d.bone===0&&d.tigerhide===0,JSON.stringify(d));
    ok(type+' 도축 완료(사체 해제)',!s.agents[0]._carc,'');
  }
  // ── B. 화살 데미지 ×_bowQ ──
  const dmgSet=(econ,days)=>{resetAll();lifeGM=432;if(econ)s.econ=econ;const seen=new Set();
    for(let t=0;t<days*1440;t++){lifeGM+=1;driveHunters(1);updateMobs(s,1);if(s._fx)for(const q of s._fx)seen.add(+q.dmg.toFixed(3));}
    return [...seen].sort((a,b)=>a-b);};
  const d0=dmgSet(null,2), d1=dmgSet({storage:{},_bowQ:1.25},2);
  ok('랩(econ 없음) dmg∈{1,2}',d0.every(x=>x===1||x===2)&&d0.length>=1,JSON.stringify(d0));
  ok('_bowQ=1.25 주입 dmg∈{1.25,2.5}',d1.every(x=>x===1.25||x===2.5)&&d1.length>=1,JSON.stringify(d1));
  // ── C. 자연 사냥(사슴 랩 2일, econ 주입) → bone 자연 유입 ──
  resetAll();lifeGM=432;s.econ={storage:{}};
  for(let t=0;t<2*1440;t++){lifeGM+=1;driveHunters(1);updateMobs(s,1);}
  ok('자연 사냥 bone 유입(2일, 도축='+(s._mobKills||0)+')',(s.econ.storage.bone||0)>0&&(s.econ.storage.bone||0)===(s._mobKills||0),'bone='+(s.econ.storage.bone||0));
  return R;
};`;
(0,eval)(js);
let pass=0;const R=global.__test();
for(const [n,okk,det] of R){console.log((okk?'  ✅ ':'  ❌ ')+n+(det?' — '+det:''));if(okk)pass++;}
console.log(pass+'/'+R.length+(pass===R.length?' 전부 통과':' 실패 있음'));
process.exit(pass===R.length?0:1);
