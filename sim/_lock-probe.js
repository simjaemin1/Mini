const fs=require('fs');
const SRC=fs.readFileSync('/sessions/focused-kind-wozniak/mnt/Mini/사냥실험실.html','utf8');
let js=/<script>([\s\S]*?)<\/script>/.exec(SRC)[1].replace("'use strict';","");
const els={};
global.document={getElementById:id=>els[id]||(els[id]={value:{nh:'3',cap:'24',spd:'18'}[id]||'0',textContent:'',innerHTML:''}),querySelectorAll:()=>[]};
global.performance={now:()=>0};global.requestAnimationFrame=()=>{};global.window=global;
js=js.replace("const cv=document.getElementById('cv'),ctx=cv.getContext('2d');",
"const cv={getContext:()=>null,addEventListener:()=>{},getBoundingClientRect:()=>({left:0,top:0,width:760,height:760})};const ctx=new Proxy({},{get:()=>()=>{},set:()=>true});global.addEventListener=()=>{};");
js=js.replace('window.addEventListener','global.addEventListener').replace('bakeBG();resetAll();requestAnimationFrame(loop);','resetAll();');
js+=`
global.__lock=function(days){
  HUNT_SPECIES='🦌';resetAll();lifeGM=216;_t0GM=lifeGM;
  const st={},out={kill:0,dropAlive:0,switch:0,coldDrop:0},durs=[];
  for(let t=0;t<days*1440;t++){lifeGM+=0.5;s.day=Math.floor(lifeGM/720);driveHunters(0.5);updateMobs(s,0.5);
    for(let hi=0;hi<s.agents.length;hi++){const a=s.agents[hi];if(a.job!=='hunter')continue;
      const cur=a._tgt&&a._tgt.hp>0&&a._tgt.st!=='dead'?a._tgt:null;const pr=st[hi];
      if(pr&&pr.m!==cur){ // lock 종료/변경
        const dead=pr.m.hp<=0||pr.m.st==='dead';
        if(dead)out.kill++;else if(cur)out.switch++;else out.dropAlive++;
        durs.push(t-pr.t0);
        st[hi]=cur?{m:cur,t0:t}:null;}
      else if(!pr&&cur)st[hi]={m:cur,t0:t};}}
  durs.sort((a,b)=>a-b);
  console.log('부상 lock 에피소드:',out.kill+out.switch+out.dropAlive,
    '→ 처치',out.kill,'· 놓침(생존 방기)',out.dropAlive,'· 갈아타기',out.switch);
  console.log('추격 시간(분): 중앙값',durs.length?(durs[(durs.length/2)|0]/2).toFixed(0):'-','· 최장',durs.length?(durs[durs.length-1]/2).toFixed(0):'-');
};`;
(0,eval)(js);
global.__lock(10);
