// @regress
'use strict';
// ★[T1208-K1 2026-11-07] 이 자는 T1159 집 N 문(종전 econ 출생 줄)을 잰다 — land1049 가 켠 `T1198_BIRTH_BODY` 는 출생을 "아이 가질 집 = ⌊주거 상한 ÷ 채당 정원⌋"(정원 6)으로 묶어
//   이 판(주거 5 · 침상 5)엔 집 0 → 출생 0 이라 "출생 한 명만" 이 20 ≠ 21 로 갈렸다(`=0` 이면 초록 · main 초록). T1198 의 출생은 `test-t1198-birth-body` 몫. 부르는 쪽이 값을 주면 그 값이 먼저.
if (process.env.T1198_BIRTH_BODY == null) process.env.T1198_BIRTH_BODY = '0';
const assert = require('assert/strict');
const {execFileSync} = require('child_process');
const {homePopulation,bindWarBody} = require('../server/home-population');
let pass=0;
function check(name, fn) {fn();pass++;console.log('✓ '+name);}
const players = new Map();
const vil={econ:{npcs:Array.from({length:6},()=>({}))},npcPids:[],_terrSet:new Set(['10,10'])};
function body(pid,x,mark) {const p=Object.assign({pid,x:x*32,y:10*32,hp:100},mark);players.set(pid,p);vil.npcPids.push(pid);return p;}
const a=body('a',10,{_muster:1}),b=body('b',20,{_muster:1}),c=body('c',20,{_t1104W:9});
vil.econ.npcs[0]={_warDraft:1,_warPid:'a'};vil.econ.npcs[1]={_warDraft:1,_warPid:'b'};
body('worker',20,{});body('unknown',NaN,{_muster:1});vil.npcPids.push('absent','b');
check('집결 중인 병사·일터 주민·알 수 없는 몸을 빼지 않고 실제 밖의 원정 둘만 뺀다',()=>assert.equal(homePopulation(vil,players,32),4));
check('출정 표지가 남아도 몸이 집에 닿는 날 집 N에 돌아온다',()=>{b.x=10*32;assert.equal(homePopulation(vil,players,32),5);});
check('영토가 없는 판은 종전 인구를 보존한다',()=>assert.equal(homePopulation({...vil,_terrSet:null},players,32),6));
check('죽은 몸과 econ 명부에서 이미 빠진 병사·포로를 이중 차감하지 않는다',()=>{body('dead',20,{_muster:1,hp:0});body('captive',20,{_muster:1,simCaptive:1});vil.econ.npcs[2]={_warDraft:1,_warPid:'dead'};assert.equal(homePopulation(vil,players,32),5);});
check('장부 징발 해제 뒤에도 집 밖의 살아 있는 귀환 몸은 집 N에서 빠진다',()=>{
  const resident=vil.econ.npcs[1];bindWarBody(b,resident);delete resident._warPid;delete resident._warDraft;b.x=20*32;
  assert.equal(homePopulation(vil,players,32),4);
  b.x=10*32;assert.equal(homePopulation(vil,players,32),5);
  b.x=20*32;vil.econ.npcs[1]={};assert.equal(homePopulation(vil,players,32),5);
  bindWarBody(b,null);
});
check('실제 소집 함수가 주민 결속을 넘기고 실제 귀환 해제가 결속을 푼다',()=>{
  const V=require('../server/villages'),WL=require('../server/war-live').createWarLive({cellPx:32,pxPerM:32,tickHz:30});
  const resident={},p={pid:'returner',x:640,y:320,hp:100,maxHp:100,simVillageId:1};
  const village={_den:true,econ:{npcs:[resident,{}]},npcPids:[p.pid],_terrSet:new Set(['10,10'])};
  const map=new Map([[p.pid,p]]),npcs=new Set([p.pid]);
  const H=V.__p3Bind({warLive:WL,deps:{players:map,npcs,setHp:(body,hp)=>{body.hp=hp;}},byDbId:new Map([[1,village]]),war:{warDraftBind:()=>resident}});
  H._warDraftPids(village,{spear:1},1,1);
  assert.equal(homePopulation(village,map,32),1);
  H._warReleasePid(p.pid);assert.equal(homePopulation(village,map,32),2);
});
const code=`const E=require('./sim/economy-sim');const v=E.createVillage({initialPop:20,name:'home'});v._world={homePopulation:()=>5};const values=[E.T1159_HOME_N,E.t1159HomeN(v)];v._world.homePopulation=()=>NaN;values.push(E.t1159HomeN(v));delete v._world;values.push(E.t1159HomeN(v));console.log(JSON.stringify(values));`;
function run(flag){const env={...process.env};if(flag==null)delete env.T1159_HOME_N;else env.T1159_HOME_N=flag;return JSON.parse(execFileSync(process.execPath,['-e',code],{cwd:require('path').join(__dirname,'..'),env,encoding:'utf8'}).trim());}
check('손잡이 미설정 = 명시적 끔, 켬은 몸 정본 5명, 호스트 없는 랩은 원래 N',()=>{assert.deepEqual(run(),run('0'));const on=run('1');assert.deepEqual(on,[true,5,20,20]);assert.deepEqual(run('0'),[false,20,20,20]);});
const tickCode=`const E=require('./sim/economy-sim');const v=E.createVillage({initialPop:20,name:'home',wood:.5});v._world={homePopulation:()=>+process.env.HOME_TEST_N};v.housing=5;v._mapBeds=5;v._dPAccum=3.5;v.storage.food=100000;v.storage.wood=10000;E.tickVillage(v,401);console.log(JSON.stringify({pop:v.npcs.length,debug:v._dpDebug}));`;
function tick(on,n) {return JSON.parse(execFileSync(process.execPath,['-e',tickCode],{cwd:require('path').join(__dirname,'..'),env:{...process.env,T1159_HOME_N:on,HOME_TEST_N:String(n)},encoding:'utf8'}).trim());}
check('실제 인구 틱: 20명 명부·집4명·침상5개면 출생 한 명만, 끔은 집이 찼다고 막는다',()=>{assert.equal(tick('1',4).pop,21);assert.equal(tick('0',4).pop,20);});
check('집에 몸이 0이면 이전 출생 누적분도 출생시키지 않는다',()=>assert.equal(tick('1',0).pop,20));
check('끔은 호스트 위치 콜백을 호출하지 않는다',()=>{const c=`const E=require('./sim/economy-sim');const v=E.createVillage({initialPop:20,name:'off'});v._world={homePopulation:()=>{throw Error('off callback');}};E.tickVillage(v,401);console.log(v.npcs.length);`;execFileSync(process.execPath,['-e',c],{cwd:require('path').join(__dirname,'..'),env:{...process.env,T1159_HOME_N:'0'},encoding:'utf8'});});
console.log(`결과: ${pass} 통과 / 0 실패`);
