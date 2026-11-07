// @regress
'use strict';
process.env.T1041_WAR_BODY='1';
const assert=require('assert/strict'),{execFileSync}=require('child_process');
const V=require('../server/villages'),WL=require('../server/war-live').createWarLive({cellPx:32,pxPerM:32,tickHz:30});
let pass=0;const check=(name,fn)=>{fn();pass++;console.log('✓ '+name);};
function fixture(){
 const sup={pid:'sup',simJob:'warrior',hp:100,x:20*32,y:20*32,_bxExit:true,_t1104W:'1:401:1'},home={pid:'home',simJob:'warrior',hp:100,x:10*32,y:10*32};
 const vil={_den:true,npcPids:['sup','home'],econ:{npcs:[{},{}]}},players=new Map([['sup',sup],['home',home]]),npcs=new Set(['home']),bound=[];
 const H=V.__p3Bind({warLive:WL,deps:{players,npcs},war:{warDraftBind:(v,pid)=>{bound.push(pid);return {};}}});return {H,vil,sup,home,bound};
}
check('전쟁 소집은 토벌 원정 몸을 다시 쓰지 않고 집의 몸만 뽑는다',()=>{const f=fixture(),d=f.H._warDraftPids(f.vil,{spear:2},1,1);assert.deepEqual(d.pids,['home']);assert.deepEqual(f.bound,['home']);assert.equal(f.sup._muster,undefined);assert.equal(f.sup._t1104W,'1:401:1');});
check('모두 토벌 원정 중이면 전쟁 소집 몸은0이다',()=>{const f=fixture();f.home._t1104W='other';assert.equal(f.H._warDraftPids(f.vil,{spear:2},1,1),null);assert.equal(f.bound.length,0);});
check('토벌 소집도 이미 전쟁/다른 원정에 있는 몸을 제외한다',()=>{const f=fixture();f.H.state.ready=true;f.home._muster=true;const host=V.banditHost();assert.deepEqual(host.t1104Draft(f.vil,2),[]);f.home._muster=false;assert.deepEqual(host.t1104Draft(f.vil,2).map(p=>p.pid),['home']);});
check('T1041 끔의 옛 전쟁 소집은 그대로 보존한다',()=>{const code=`const V=require('./server/villages'),WL=require('./server/war-live').createWarLive({cellPx:32,pxPerM:32,tickHz:30});const p={pid:'s',simJob:'warrior',hp:100,x:1,y:1,_t1104W:'sup'};const H=V.__p3Bind({warLive:WL,deps:{players:new Map([['s',p]]),npcs:new Set()},war:{warDraftBind:()=>({})}});console.log(JSON.stringify(H._warDraftPids({_den:true,npcPids:['s'],econ:{npcs:[{}]}},{spear:1},1,1).pids));`;assert.equal(execFileSync(process.execPath,['-e',code],{cwd:require('path').join(__dirname,'..'),env:{...process.env,T1041_WAR_BODY:'0'},encoding:'utf8'}).trim(),'["s"]');});
console.log(`결과: ${pass} 통과 / 0 실패`);
