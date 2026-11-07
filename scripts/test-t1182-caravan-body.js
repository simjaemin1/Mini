'use strict';
// @regress
// 몸을 멈추면 시계만 흘러도 귀환 입금/출고/경계 통과가 없어야 한다.
const assert=require('assert/strict'),path=require('path'),fs=require('fs'),Module=require('module');
const {spawnSync}=require('child_process');
if(process.argv.includes('--mutant')) {
 const file=path.resolve(__dirname,'../sim/economy-sim-v2.js'),old=Module._extensions['.js'];
 Module._extensions['.js']=function(m,f){if(f!==file)return old(m,f);m._compile(fs.readFileSync(f,'utf8').replace("return typeof world.caravanBodyReady !== 'function' || !!world.caravanBodyReady(c, leg);",'return true;'),f);};
}
const V=require('../server/villages'),E=require('../sim/economy-sim-v2'),W=require('../server/zone-config').WORLD;
const P=V.__labProbe._caravanBodyProbe,S=V.__p3Bind({}).state;
let n=0;const ok=(v,msg)=>{assert.ok(v,msg);n++;};
const between=require('./fixture-xzone-counts');ok(between(3,4,4),'송신-수신-ACK 사이 전송 중 한 건을 인과 경계로 센다');ok(!between(3,5,4) && !between(5,4,5),'송신보다 많은 수신·이미 ACK한 수신의 누락은 잡는다');
ok(P.on===true,'몸 정본 기본 켬');ok(E.T1136_ESCORT_CARRY===true,'호위도 운반 기본 켬');ok(E.T1136_BASKET===false,'바구니는 끔');ok(E.T496_CARAVAN_REST===false,'야영 끔');
const browser={console:{log:()=>{},warn:()=>{},error:()=>{}}};require('vm').runInNewContext(fs.readFileSync(path.resolve(__dirname,'../sim/economy-engine.browser.js'),'utf8'),browser);ok(browser.EconEngine.T1136_ESCORT_CARRY===true && browser.EconEngine.T1136_BASKET===false,'브라우저 번들도 호위 켬·바구니 끔 기본');
const w=E.createWorldV2({seed:7,villageCount:2,picker:'rational',infoRange:5000,raidPer100:0});
const [a,b]=w.villages,c={id:1,from:a,to:b,trader:a.npcs[0],state:'inbound',returnArriveDay:10000,_returningRes:'wood',_returningAmt:10,escort:0};
w.caravans=[c];w.day=100;w.caravanBodyReady=P.ready;
const p={pid:'merchant',x:0,y:0,hp:100,hunger:100,thirst:100};
Object.assign(S,{world:w,ready:false,dayMs:W.dayLengthMs,deps:{players:new Map([[p.pid,p]]),npcs:new Map(),moveSpeed:64,isPositionActive:()=>true,isBlockedByWall:()=>false},caravanBodies:new Map(),_carTickAt:1000});
const stock=a.storage.wood;
for(let i=0;i<20;i++)E.tickWorldV2Parts(w).caravans();
ok(a.storage.wood===stock && !c._done,'몸이 없으면 시계가 지나도 입금 0');
const body={c,pid:p.pid,phase:'inbound',toV:b,_t1182:true,_t1182At:1000,escorts:[],pinHunger:100,pinThirst:100,repairFailN:0,lastRepairAt:0,delayedDays:0};P.pts(body,[{x:0,y:0},{x:64,y:0}]);S.caravanBodies.set(c.id,body);
E.tickWorldV2Parts(w).caravans();ok(a.storage.wood===stock,'몸이 서 있어도 입금 0');
const stamped=[];S.roads={stampEntityPx:(who,x,y)=>stamped.push([who.pid,x,y])};
S.deps.isBlockedByWall=()=>true;P.tick(2000);ok(body.prog===0 && stamped.length===0,'벽에 막히면 실제 몸과 답압이 함께 선다');
S.deps.isBlockedByWall=()=>false;P.tick(102000);ok(body.prog>0 && body.prog<body.len,'긴 서버 정지 뒤 한 틱으로 종점에 뛰지 않는다');
E.tickWorldV2Parts(w).caravans();ok(a.storage.wood===stock,'아직 길 위면 입금 0');
const newborn={...body,c:{...c,id:902},pid:'newborn',_t1182At:102000};P.pts(newborn,[{x:0,y:0},{x:64,y:0}]);S.deps.players.set('newborn',{pid:'newborn',x:0,y:0,hp:100});
const liveBodies=S.caravanBodies,liveRoads=S.roads;S.caravanBodies=new Map([[902,newborn]]);S.roads=null;S._carTickAt=1000;P.tick(102001);
ok(newborn.prog<=0.064+1e-9,'새 몸은 태어나기 전 서버 정지 시간을 걸음 예산으로 받지 않는다');S.caravanBodies=liveBodies;S.roads=liveRoads;

P.tick(102500);ok(P.ready(c,'inbound'),'실제 몸이 종점에 닿았다');
ok(stamped.length>0 && stamped.every(q=>q[0]===p.pid && q[1]<=body.prog),'답압은 실제 움직인 몸의 걸은 구간에만 찍힌다');S.roads=null;
const endpointX=p.x;p.x+=10;ok(!P.ready(c,'inbound'),'진행도만 끝이고 실제 좌표가 다르면 입금 불가');p.x=endpointX+100;const displaced=p.x;P.walk(body,p,body.prog,500);ok(Math.abs(p.x-displaced)<=32 && !P.ready(c,'inbound'),'외부 이탈 뒤에도 종점으로 순간이동하지 않고 몸 속도로 복귀');p.x=endpointX;
E.tickWorldV2Parts(w).caravans();ok(c._done && Math.abs(a.storage.wood-stock-9.7)<1e-9,'닿은 뒤에만 정본 귀환 입금(기존 세금 포함)');
// 호위도 순간이동 없이 걷고, 짐 진 호위가 닿기 전에는 상인 혼자 도착해도 정산하지 않는다.
const guard={pid:'guard',x:0,y:0,hp:100};p.x=0;p.y=0;S.deps.players.set(guard.pid,guard);
const convoy={...c,id:3,state:'outbound',_done:false},cb={...body,id:3,c:convoy,phase:'outbound',escorts:[{pid:guard.pid,pinH:100,pinT:100}]};
P.pts(cb,[{x:0,y:0},{x:64,y:0}]);S.caravanBodies=new Map([[3,cb]]);
P.tick(103000);P.tick(103500);
ok(cb.prog===cb.len && !P.ready(convoy,'outbound'),'상인이 닿아도 짐 진 호위가 길 위면 정산 대기');
P.tick(104000);ok(P.ready(convoy,'outbound'),'호위까지 제 발로 닿아야 정산 허용');
const gx=guard.x;cb.phase='inbound';P.pts(cb,[{x:64,y:0},{x:0,y:0}]);P.tick(104500);
ok(Math.abs(guard.x-gx)<=32 && guard.x>0,'돌아서는 호위도 한 틱 걸음 상한 안에서 걷는다');
const saved=P.pack(),x=p.x,g=guard.x,pg=cb.prog;
S._t1034Saved=new Map([[String(cb.id||convoy.id),saved.b[String(cb.id||convoy.id)]]]);
p.x=9999;guard.x=9999;cb.prog=0;P.restore(cb,Date.now()+86400000);
ok(p.x===x && guard.x===g && cb.prog===pg,'상인과 호위는 저장한 실제 위치로 복원, 꺼진 동안 순간이동 0');
cb._xz=true;cb._xzInPts=[{x:1,y:2},{x:64,y:0}];const xzSaved=P.pack();ok(!!xzSaved.b['3'].act && xzSaved.b['3'].act.xzIn[0][0]===1,'경계 캐러밴도 실제 몸과 넘어온 길을 저장한다');
cb.phase='linger';cb.lingerUntil=0;P.pts(cb,[{x:0,y:0},{x:64,y:0}]);p.x=64;guard.x=64;cb.prog=cb.len;
const marketVil={npcPids:[]};S.byEcon=new Map([[convoy.to,marketVil]]);const marketNow=Date.now(),rec=P.openMarket(convoy);
ok(rec.end>=marketNow+S.dayMs*require('../server/village-layout').MKT_LINGER_DAY_FRAC,'실제 도착한 시각부터 장이 열린다(이미 지난 날 머리 파장이 아님)');rec.end=0;
const marketPts=cb.pts;P.linger(cb,convoy,p);
ok(cb.pts===marketPts && P.ready(convoy,'market'),'머묾은 도착한 왕로 끝에서 유지한다(준비한 귀로로 바꾸어 정산이 막히지 않는다)');
p.x+=10;ok(!P.ready(convoy,'market'),'머묾 상태만으로 실제 마당 밖 몸이 정산할 수 없다');p.x=64;
cb.c._t707={give:1};S._t731={};S.econV2={settleMarketsV2:()=>{throw new Error('혼합 마감 중 정산');}};
P.returnLeg(cb,Date.now());ok(cb.phase==='linger' && !!cb.c._t707,'현지 자정 창에서는 몸 틱이 장 정산을 앞당기지 않는다');
S._t731=null;S.tickJobs=[()=>{}];P.returnLeg(cb,Date.now());ok(!!cb.c._t707,'마감 조각 중에도 장 정산 대기');S.tickJobs=null;P.returnLeg(cb,Date.now());ok(!!cb.c._t707,'마감 밖에서도 정산은 실제 몸을 확인하는 기존 하루 머리를 기다린다');S.econV2=E;
cb.phase='inbound';delete cb.c._t707;
const mw={caravans:[{_t707:{give:1}}],caravanBodyReady:()=>false};
ok(E.settleMarketsV2(mw)===0 && mw.caravans[0]._t707,'장이 끝나지 않은 몸의 정산을 머리 틱이 앞지르지 않는다');
const cross={...c,id:2,state:'outbound',_done:false,to:{_xz:true},_xzCross:{day:0},arriveDay:0};w.caravans=[cross];
E.tickWorldV2Parts(w).caravans();ok(cross.state==='outbound' && !cross._done,'존 경계도 몸 없이 통과하지 않는다');
const bw=E.createWorldV2({seed:7,villageCount:8,picker:'rational',infoRange:5000,raidPer100:0});bw.t1136Basket=true;bw.caravanBodyReady=()=>false;
for(let i=0;i<12;i++)E.tickWorldV2(bw);
ok(bw.caravans.some(x=>x.basket),'바구니 시험도 실제 캐러밴이 선다');ok(bw.tradeLog.length===0,'바구니 사건 시계도 몸 없으면 정산하지 않는다');
S.villages=[];S.world.caravans=[];cb.c._xzHandedBack=true;cb.c._done=true;P.sweep({seen:new Set(),spawned:0,arrived:0,removed:0});
ok(S.caravanBodies.has(convoy.id),'경계 귀환 기록을 보낸 뒤에도 인수 확인 전까지 실제 몸을 보존한다');
const transfer={id:901,state:'xzone',from:a,to:b},record={id:901,kind:'arrive',toZone:'nippon',giveRes:'wood',giveAmt:2};
S.world.caravans=[transfer];S.caravanBodies=new Map();S.xzone={track:new Map(),trace:[],st:{sent:0,sentOk:0,crossArrive:0,bodyOut:0}};
S.caravanBodies.set(901,{pid:p.pid,c:transfer,escorts:[]});
let registered=false;S.deps.xzonePost=()=>{registered=S.xzone.track.has(901);return new Promise(()=>{});};P.sendXz(record,1,0,true);ok(registered,'출발 인수응답 전 귀환도 기록할 수 있도록 송신 전에 추적 등록');
const track=S.xzone.track.get(901);track.back={amt:2};const returned={pid:'returned',x:900,y:900,hp:100};S.deps.players.set(returned.pid,returned);S.deps.despawnNpc=pid=>S.deps.players.delete(pid);S.deps.broadcast=()=>{};
const returnedBody={pid:returned.pid,c:{state:'inbound'},escorts:[]};S.caravanBodies.set(901,returnedBody);const sentAt={x:Math.round(p.x),y:Math.round(p.y)};
P.afterSendXz(record,901,true,null,true,0);ok(S.xzone.track.get(901)===track && track.back.amt===2,'늦은 출발 인수응답은 먼저 온 귀환 기록을 덮지 않는다');
ok(S.caravanBodies.get(901)===returnedBody && S.deps.players.has(returned.pid),'늦은 출발 인수응답은 이미 귀환한 다른 몸을 지우지 않는다');
const ackTrace=S.xzone.trace.find(t=>t.k==='out');ok(ackTrace.at.x===sentAt.x && ackTrace.at.y===sentAt.y,'출발 흔적은 응답 순간의 귀환 위치가 아닌 실제 송신 당시 경계 좌표');
if(!process.argv.includes('--mutant')) {
 const m=spawnSync(process.execPath,[__filename,'--mutant'],{encoding:'utf8',env:process.env});
 ok(m.status!==0 && /몸이 없으면 시계가 지나도 입금 0/.test(m.stderr),'몸 가드를 뺀 미끼는 실제 입금 검사에서 실패한다');
}
console.log(`PASS ${n} / FAIL 0`);
