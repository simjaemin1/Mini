'use strict';
// 실제 서버의 중앙 고리 검사. 100틱 뒤 의도적으로 끝나는 fixture이며 하루 완주가 아니다.
if (!process.env.T577_SEED || !/server[\\/]zone\.js$/.test(process.argv[1]||'')) return;
const fs=require('fs'),Module=require('module'),compile=Module.prototype._compile,assert=require('assert/strict');
let held=null,ticks=0;const visits={};
process.on('exit',code=>fs.writeFileSync(process.env.T577_OUT+'.child.json',JSON.stringify({code,clock:global.__t745?global.__t745():null})));
global.__t1248Visit=(name,p)=>{if(p===held&&held._des)visits[name]=(visits[name]||0)+1;};
Module.prototype._compile=function(s,f){
  if(f.endsWith('/server/zone.js')){
    for(const name of ['_inputTOStep','_stairStepP','_fallStepP','_gaugeStep','_hpRegenStep','_gaugeNetStep','_fishPollOne','npcStep']){
      const variable=name==='npcStep'?'npc':'p',re=new RegExp('(function '+name+'\\('+variable+'[,)]'+'[^\\{]*\\{)');
      assert(re.test(s),'instrument '+name);s=s.replace(re,'$1 global.__t1248Visit('+JSON.stringify(name)+','+variable+');');
    }
    const start=s.indexOf('function sepNpcs(dt)'),end=s.indexOf('\n// ★[T316]',start);assert(start>=0&&end>start);
    let part=s.slice(start,end);
    if(process.env.T1248_NOPOLL_BAIT==='1'){
      const needle='(_desQ ? [..._desTickIds].sort((a,b) => _desOrder.get(a)-_desOrder.get(b)) : npcs)';assert(part.includes(needle));part=part.replace(needle,'npcs');
    }
    assert(part.includes('const p = players.get(pid);'));
    part=part.replace('const p = players.get(pid);',"const p = players.get(pid); global.__t1248Visit('sepNPC',p);");
    part=part.replace('// 사람 = 밀리지 않는 고정체 등록(NPC가 비켜감)',"global.__t1248Visit('sepHuman',p); // 사람 = 밀리지 않는 고정체 등록(NPC가 비켜감)");
    s=s.slice(0,start)+part+s.slice(end);
    const snapshot='const allPlayers = Array.from((_desQ ? _desBodies : players).values());';assert(s.includes(snapshot));
    s=s.replace(snapshot,snapshot+" for(const p of allPlayers)global.__t1248Visit('snapshotList',p);");
    s+='\nglobal.__t1248NoPoll={players,npcs,q:_desQ,awake:_desTickIds,movers:_desBodies,hold:_desQueued};\n';
  }
  return compile.call(this,s,f);
};
global.__t1241Probe=function(now,players){
  const F=global.__t1248NoPoll;if(!F)return;
  if(!held){
    const seed=[...players.values()].find(p=>p.isNpc&&p.simVillageId);if(!seed)return;
    held={pid:'__t1248_nopoll',_sh:'t1248_nopoll',isNpc:true,simVillageId:seed.simVillageId,hp:100,maxHp:100,x:seed.x,y:seed.y,vx:0,vy:0,behavior:'wander',handingOff:false};
    F.players.set(held.pid,held);F.npcs.add(held.pid);
    held._des={k:'sleep',t0:now,until:now+60000,r:null,P:null,pi:0,d:require('../server/villages').econDay(),hp:100};F.hold(held);
    F.players.set(held.pid,held); // 같은 몸 재등록도 owned를 이동 Map에 되살리지 않아야 한다.
    assert(!F.awake.has(held.pid)&&!F.movers.has(held.pid));return;
  }
  if(++ticks<100)return;
  const result={ticks,visits,stillOwned:!!held._des,originalMaps:F.players.has(held.pid)&&F.npcs.has(held.pid),heap:F.q.owned.has(held.pid),sameBodyResetExcluded:!F.movers.has(held.pid)};
  result.pass=result.stillOwned&&result.originalMaps&&result.heap&&result.sameBodyResetExcluded&&Object.keys(visits).length===0;
  fs.writeFileSync(process.env.T577_OUT+'.nopoll.json',JSON.stringify(result));process.exit(result.pass?0:1);
};
