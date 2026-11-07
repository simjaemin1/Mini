// @regress
'use strict';
const assert=require('assert/strict'),{execFileSync}=require('child_process');
const E=require('../sim/economy-sim'),WC=require('../sim/war-core'),V=require('../server/villages');
let pass=0;const check=(name,fn)=>{fn();pass++;console.log('✓ '+name);};
function fixture(hook=true){
 const a={name:'공격',dbId:1,econ:E.createVillage({name:'공격',initialPop:10})},d={name:'수비',dbId:2,econ:E.createVillage({name:'수비',initialPop:10})};
 a.econ.storage.food=100;d.econ.storage.food=100;
 const w={id:31,atk:a,def:d},body={w,fight:{ctx:{units:[]}}},world={day:400,seed:7};
 const H=V.__p3Bind({warBodies:new Map([[w.id,body]])});
 const war=WC.createWar({villages:[a,d],world,seed:7,surrenderDeaths:hook?(x=>H._t1183SurrenderDeaths(x)):undefined});
 const na=war.warDraftBind(a,'a-dead','farmer',w.id),nb=war.warDraftBind(a,'a-live','farmer',w.id),nd=war.warDraftBind(d,'d-dead','farmer',w.id);
 body.fight.ctx.units=[{side:'A',agent:'a-dead',hp:0},{side:'A',agent:'a-dead',hp:0},{side:'A',agent:'a-live',hp:100},{side:'B',agent:'d-dead',hp:0},{side:'B',agent:'unknown',hp:0}];
 return {a,d,w,body,H,war,na,nb,nd};
}
check('호스트는 실제 쓰러진 몸 pid만 넘긴다(살아 있는 병사는 제외)',()=>{const f=fixture();assert.deepEqual(f.H._t1183SurrenderDeaths(f.w),{A:['a-dead','a-dead'],B:['d-dead','unknown']});});
check('없는 전쟁·다른 객체의 재사용 id·교전 없는 몸은 정산 근거가 아니다',()=>{const f=fixture();assert.equal(f.H._t1183SurrenderDeaths({id:31}),null);assert.equal(f.H._t1183SurrenderDeaths({id:32}),null);f.body.fight=null;assert.equal(f.H._t1183SurrenderDeaths(f.w),null);});
check('교전 뒤 항복은 실제 결속된 공격/수비 사망을 한 번 반영한다',()=>{const f=fixture(),counts=[{...f.a.econ.counts},{...f.d.econ.counts}];f.war._opDoSurrender(f.a,f.d,400,f.w);assert.equal(f.a.econ.npcs.length,9);assert.equal(f.d.econ.npcs.length,9);assert(!f.a.econ.npcs.includes(f.na));assert(!f.d.econ.npcs.includes(f.nd));assert(f.a.econ.npcs.includes(f.nb));assert.equal(f.war.stats().cas,2);assert.equal(f.war.stats().battle,0);assert.equal(f.war.stats().surrender,1);assert.deepEqual([f.a.econ.counts,f.d.econ.counts],counts);});
check('사상 처리 뒤 몸 해제는 주민을 두 번 제거하지 않는다',()=>{const f=fixture();f.war._opDoSurrender(f.a,f.d,400,f.w);assert.equal(f.war.warDraftReleasePid(f.a,'a-dead'),false);assert.equal(f.a.econ.npcs.length,9);f.war._opDoSurrender(f.a,f.d,401,f.w);assert.equal(f.war.stats().cas,2);assert.equal(f.a.econ.npcs.length,9);});
check('다른 전쟁에 결속된 pid는 죽이지 않는다',()=>{const f=fixture();f.nd._warDraft=32;f.war._opDoSurrender(f.a,f.d,400,f.w);assert(f.d.econ.npcs.includes(f.nd));assert.equal(f.war.stats().cas,1);});
check('이미 사망·포로로 명부에서 빠진 주민은 다시 차감하지 않는다',()=>{const f=fixture();f.a.econ.npcs.splice(f.a.econ.npcs.indexOf(f.na),1);f.war._opDoSurrender(f.a,f.d,400,f.w);assert.equal(f.a.econ.npcs.length,9);assert.equal(f.war.stats().cas,1);});
check('노획 정산은 종전 항복 한 번과 같고 교전 승패·포로를 새로 판정하지 않는다',()=>{const on=fixture();const x=on.war._opDoSurrender(on.a,on.d,400,on.w);const off=fixture(false),y=off.war._opDoSurrender(off.a,off.d,400,off.w);assert.equal(x,y);assert.deepEqual(on.a.econ.storage,off.a.econ.storage);assert.deepEqual(on.d.econ.storage,off.d.econ.storage);assert.equal(on.war.stats().captured,0);assert(on.war.stats().log.some(x=>x.includes('교전 뒤 항복')&&x.includes('사상 2')));});
check('훅 없는 랩·옛 경로는 무혈 항복을 보존한다',()=>{const f=fixture(false);f.war._opDoSurrender(f.a,f.d,400,f.w);assert.equal(f.a.econ.npcs.length,10);assert.equal(f.d.econ.npcs.length,10);assert.equal(f.war.stats().cas,0);assert(f.war.stats().log.some(x=>x.includes('무혈 항복')&&x.includes('사상 0')));});
check('T1041 명시적 끔이면 실제 몸 사망 훅도 닫힌다',()=>{const code=`const V=require('./server/villages');const w={id:31};const H=V.__p3Bind({warBodies:new Map([[31,{w,fight:{ctx:{units:[{side:'A',agent:'a',hp:0}]}}}]])});console.log(JSON.stringify(H._t1183SurrenderDeaths(w)));`;assert.equal(execFileSync(process.execPath,['-e',code],{cwd:require('path').join(__dirname,'..'),env:{...process.env,T1041_WAR_BODY:'0'},encoding:'utf8'}).trim(),'null');});
console.log(`결과: ${pass} 통과 / 0 실패`);
