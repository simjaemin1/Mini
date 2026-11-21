#!/usr/bin/env node
'use strict';
// Same-input measurements of actual declarations/functions. Host-only inputs are labeled, never equated to whole-world parity.
const fs=require('fs'),path=require('path'),vm=require('vm'),A=require('acorn'),crypto=require('crypto'),L=require('./lib-lab-diff'),S=require('./lib-t1409-source'),R=require('../sim/shared-lab-rules'),E=require('../sim/economy-sim'),W=require('../sim/war-core'),BC=require('../sim/battle-core');
const out=process.argv[2];if(!out)throw Error('output dir');const read=n=>JSON.parse(fs.readFileSync(path.join(out,n),'utf8')),policy=require('./t1409-closures.json'),rows=new Map();
const V='lab/마을실험실.html',WAR='lab/전쟁실험실.html',H='lab/원본/사냥실험실_0707.html',SV='server/villages.js';
const val=(code,ctx={})=>vm.runInNewContext('('+code+')',ctx),pick=(f,kind,name,contains)=>{const n=S.locate(f,{kind,name,...(contains?{contains}:{})});if(!n)throw Error(f+' '+kind+' '+name);return n;};
const expr=(f,name,ctx={},contains)=>val(pick(f,'decl',name,contains).init,ctx),fn=(f,name,ctx={})=>val(pick(f,'function',name).text,ctx);
const stable=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function add(id,input,lab,server,note='',comparable=true){rows.set(id,{id,input,lab,server,equal:stable(lab)===stable(server),comparable,note});}
const facts=new Map(L.checkDiffs().map(r=>[r.id,r]));for(const r of policy.rows.filter(r=>r.id.startsWith('D'))){const f=facts.get(r.id);if(!f?.found)throw Error(r.id+' no source');add(r.id,{read:'actual parameter getter',unit:'해당 행의 단위'},val(f.lab),/^[-\d.]+$/.test(f.srv)?val(f.srv):f.srv,'같은 입력에서 선택되는 실제 초기 매개변수. 아래 특정 행은 소비 식 결과로 덮어쓴다.');}
// Actual placement score lambdas, holding other coefficients and topology fixed.
const common={layout:'agri',compactW:0.8,distW:0.1,lval:()=>1,nbCount:()=>0,warp:()=>0,ccx:0,ccy:0};
const score=(file,fertW)=>expr(file,'scoreOf',{...common,fertW})({x:1,y:0});
add('D1-FERTW',{c:{x:1,y:0},lval:1,neighbours:0,distance:1},score(WAR,+facts.get('D1-FERTW').lab),score('server/village-layout.js',+facts.get('D1-FERTW').srv),'실제 scoreOf 식. 비옥도 가중치 이외 입력을 고정.');
const farmCtx={fShare:0.6,target:1000,numHousesEst:2};add('D1-FARM_HOUSE_RES',farmCtx,expr(WAR,'farmTarget',farmCtx),expr('server/village-layout.js','farmTarget',farmCtx),'실제 farmTarget 초기식');
const makeTR=d=>({dist:Array(9).fill(d),water:Array(9).fill(0),rock:Array(9).fill(0),fert:Array(9).fill(0.5)});
const labWater=fn(WAR,'villageFertWater',{TR:makeTR(50),N:3,idx:(x,y)=>y*3+x,_t1409Water:(d,legacy)=>legacy});
add('D1-WATER_D',{cx:1,cy:1,nearestWater:50},labWater(1,1).water,+R.waterAccess(50).toFixed(2),'실제 LAB villageFertWater 대 서버 원식, 둘 다 소수 둘째 자리로 표시. 켬은 LAB도 서버 원식을 호출.');
const budgetCtx={target:200,s:{V:{territory:[]}},arguments:{length:1}};
const serverBudget=S.nodes(SV).find(n=>n.kind==='decl'&&n.name==='want'&&n.init.includes('TERR_GROW_MAX_PER_DAY'));
add('D1-TERR_GROW_DAY',{need:200,territory:0,mode:'bulk default call'},expr(WAR,'budget',budgetCtx,'arguments.length>1'),val(serverBudget.init,{target:200,own:{size:0},TERR_GROW_MAX_PER_DAY:expr(SV,'TERR_GROW_MAX_PER_DAY')}),'관찰 모드의 6시간 1칸을 300/일로 오독하지 않는다.');
const life=require('../server/livelihood');for(const [id,rockShare]of [['D3-STONE_FLOOR',0],['D3-STONE_GAIN',0.5]]){
 const n=S.nodes(WAR).find(n=>n.kind==='property'&&n.name==='stone'&&n.init.includes('L_STONE_FLOOR'));
 add(id,{rockShare},val(n.init,{L_STONE_FLOOR:expr(WAR,'L_STONE_FLOOR'),L_STONE_GAIN:expr(WAR,'L_STONE_GAIN'),rockD:rockShare}),life.landOf({forShare:0,huntShare:0,rockShare,oreShare:0}).stone,'실제 LAB 반환식 대 livelihood.landOf');}
const p50=expr(WAR,'WAR_ENGAGE_R'),stand=expr(WAR,'WAR_DEF_STANDOFF',{WAR_ENGAGE_R:p50});
const siegeLab=expr(WAR,'WAR_SIEGE_R',{WAR_DEF_STANDOFF:stand,WAR_ENGAGE_R:p50});const camp=fn(SV,'_warCampBackCells',{state:{warLive:{WAR_DEF_STANDOFF:stand,WAR_ENGAGE_R:p50}}});add('D5-SIEGE_RING_PAD',{engage:50,standoff:45},siegeLab,camp(),'15 대 95를 비교하지 않고 실제 총 반경 110 대 95로 정규화.');
// Live minimum vs preview are distinct entry inputs, not a hidden correction to the initial village count.
const initial=expr(SV,'INITIAL_POP',{process:{env:{T577_CAND_SEEDPOP:'6'}},parseInt});
add('R01',{requestedPop:6},expr(WAR,'p0',{document:{getElementById:()=>({value:'6'})}},"document.getElementById('pop')"),E.createVillage({initialPop:initial}).npcs.length,'LAB 생활 진입 max 식 대 실제 createVillage. UI 프리뷰와 서버 기본8은 다른 문.');
const beforeWar=read('browser-war-before.json'),offWar=read('browser-war-off.json'),beforeVil=read('browser-village-before.json'),offVil=read('browser-village-off.json');
add('R02',{seed:1020},beforeWar.final.length,read('t17-before.json').villages,'같은 seed만으로 지도 입력이 같아지지 않음: HTML 합성 지도8곳 대 실지도51곳. 독립 입력 프로필 대조.',false);
const ta={isRock:()=>false,isOre:()=>false,isBlocked:()=>false,isWater:()=>false,forestMult:()=>1,nearestWaterDist:()=>50,fert:()=>1,fertField:()=>true};
const lp=require('../server/villages').__labProbe.extractLandParamsApprox(ta,200,200,{territory:[[200,200],[200,201],[201,200],[201,201]]});
const fert=S.locate(WAR,{kind:'assignment',name:'_lp.fertility'}),ore=S.locate(WAR,{kind:'assignment',name:'_lp.ore'}),stone=S.locate(WAR,{kind:'assignment',name:'_lp.stone'});
add('R03',{role:'agri',terrainFert:1,waterDistance:50},val(fert.init,{s:{role:'agri'}}),lp.fertility,'실제 역할 덮기 식 대 실제 extractLandParamsApprox');
add('R04',{role:'mining',terrainOre:false,terrainRock:false},{ore:val(ore.init),stone:val(stone.init)},{ore:lp.ore,stone:lp.stone},'실제 디버그 보장값 대 같은 평지의 서버 추출');
if(fs.existsSync(path.join(out,'browser-war-slow.json'))){const slow=read('browser-war-slow.json'),fast=read('browser-war-fast1.json');add('R12',{seed:1020,day:1,initialStateHashEqual:stable(slow.initial)===stable(fast.initial)},fast.series[0],slow.series[0],'LAB의 같은 초깃값 fast/관찰 실행. 서버 스케줄러에는 doBulk 입력이 없어 이 두 모드의 정본 선택은 회부.',false);}else throw Error('slow fixture not complete');
const bundle=fs.readFileSync(path.join(__dirname,'..','sim','economy-engine.browser.js'),'utf8'),ctx={console:{log(){},warn(){},error(){}}};ctx.window=ctx;vm.runInNewContext(bundle,ctx);
function crew(engine){const v={npcs:Array(8).fill({}),storage:{wood:100,stone:100}},site={stage:0,mat:{}},dbg={};engine.houseCrewDay(v,site,[{inventory:{}},{inventory:{}}],2,Infinity,()=>Infinity,0,dbg,()=>{site.stage++;return site.stage<4;});return {storage:v.storage,site,dbg};}
add('R16',{population:8,wood:100,crew:2,labor:2,roundTrip:0},crew(ctx.EconEngine),crew(E),'실제 공용 단계·재료 계산. 몸의 이동 I/O까지 같다는 주장은 아님.');
const viewCtx={N:400,CELL:2,view:{z:2,ox:0,oy:0}};add('R23',{N:400,CELL:2,view:{z:2,ox:0,oy:0}},fn(H,'_mobView',viewCtx)(),fn('server/wildlife.js','_mobView',viewCtx)(),'실제 활성 범위 함수');
const a={path:[{x:9,y:9}]},setPath=val(pick(H,'decl','setPath').init);setPath(a,2,0);const pathCore=require('../sim/path-core');add('R24',{from:[0,0],to:[2,0],blocked:false},a.path,pathCore.localPath(0,0,2,0,{blocked:()=>false,blockedStep:()=>false}),'실제 원본 setPath 대 서버 공용 PathCore 입구. 원본에는 경로 검색/할당 연결이 없다.');
const heal=S.locate(H,{kind:'assignment',name:'a.hp',contains:'a.rest?0.5:0.03'});let serverHeal;
function walk(n,src){if(!n?.type)return;if(n.type==='CallExpression'&&n.callee.name==='_setHp'){const t=src.slice(n.start,n.end);if(t.includes('regenMul'))serverHeal=src.slice(n.arguments[1].start,n.arguments[1].end);}for(const v of Object.values(n)){if(Array.isArray(v))v.forEach(x=>x?.type&&walk(x,src));else if(v?.type)walk(v,src);}}
const regenFn=pick(SV,'function','_lifeDailySteps').text;walk(A.parse(regenFn,{ecmaVersion:'latest'}),regenFn);if(!serverHeal)throw Error('server healing not found');
add('R25',{hp:50,rest:true,elapsedGameMinutes:1440,healthFoodMultiplier:1},val(heal.init,{a:{hp:50,rest:true},dt:1440,NPC_MAXHP:100}),val(serverHeal,{a:{hp:50,_rest:true},mx:100,_lifeEcon:()=>E,_herbMul:1,regenMul:1}),'실제 두 회복식, 서버 하루를 1440게임분으로 정규화');
const oldOre=beforeWar.fixtures.length; // ensure the browser fixture really executed; ore results use the historical source oracle below.
const F=require('./t1409-fixtures.json'),oldRegen=vm.runInNewContext('(()=>{'+F.oreDeclarations.map(s=>'const '+s+';').join('')+'return ('+F.oreFunction+');})()');
add('R28',{ore:250,days:1},oldRegen(250,1),require('../server/specialty').oreRegen(250,1),'같은 원식임을 실제 원본 함수와 비교, 공유 커널로 이동. 0날 guard는 각 호스트 그대로.');
const powA=S.nodes(V).find(n=>n.kind==='decl'&&n.name==='powA'&&n.init.includes('Math.random')),
 powD=S.nodes(V).find(n=>n.kind==='decl'&&n.name==='powD'&&n.init.includes('Math.random'));const M=Object.create(Math);M.random=()=>0.5;
const powCtx={aEff:10,dEff:10,w:{wep:1,arm:0},dWep:1,dArm:0,pal:0,Math:M};const spec={A:{spear:10},B:{spear:10},terrain:'plain'};
add('R29',{A:{warriors:10},B:{warriors:10},weaponCoverage:1,armorCoverage:0,random:0.5},{powA:val(powA.init,powCtx),powD:val(powD.init,powCtx)},W.runBattleHeadless(spec,()=>0.5),'옛 power 값과 전술 사상 결과는 다른 출력 계약. 어느 마을랩 모델을 보존할지 회부.',false);
const bcText=[...fs.readFileSync(path.join(__dirname,'..','lab','전투실험실.html'),'utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script\s*>/g)].map(m=>m[1]).find(s=>s.includes('root.BattleCore=BattleCore'));
const bcCtx={console};bcCtx.window=bcCtx;vm.runInNewContext(bcText,bcCtx);
function battleOne(B){const b=B.createBattle({A:{spear:2},B:{spear:2},terrain:'plain'},{rng:()=>0.5});b.step(0.05);return b.units.map(u=>({type:u.type,side:u.side,x:u.x,y:u.y,hp:u.hp}));}
add('R31',{A:{spear:2},B:{spear:2},terrain:'plain',dt:0.05,random:0.5},battleOne(bcCtx.BattleCore),battleOne(BC),'같은 입력의 실제 두 BattleCore 한 스텝. 존/독립 배치는 다른 입력 프로필.');
const f=beforeWar.fixtures[0];add('R32',{econ:f.input,mode:f.mode,opts:f.opts},f.value,W.conscript({econ:structuredClone(f.input)},f.mode,f.opts),'실제 HTML conscript 대 실제 WarCore.conscript, 반환 객체 전 칸.');
const g={cmd:{x:10,y:20,cx:10,cy:20},heading:0},u={slx:1,sly:2};const clamp=fn(WAR,'_muClampGround',{TR:undefined});
add('R33',{g,u,terrain:'open'},fn(WAR,'_muSlotXY',{_muClampGround:clamp})(g,u),fn('server/war-live.js','_muSlotXY')(g,u),'동일 개활 입력의 실제 슬롯 변환. 차단 지형·actor I/O 및 D5 수치는 이 같음으로 면제하지 않음.');
const forced=fn(WAR,'_lbForcedResolve',{LB_MAX_LOCALT:200,WAR_BATTLE_MAXTICK:4000});const WL=require('../server/war-live').createWarLive({BC});const fight=WL.makeFight({id:1,born:0},null);fight.t=200;fight.state='advance';WL.stepFight(fight);
add('R34',{localSeconds:200,steps:4000,unresolved:true},forced({handle:{tick:200,result:null},_steps:4000}),{continued: fight.t>200,t:fight.t},'실제 LAB 강제종료 술어 대 서버 stepFight 한 스텝. 종료 의미 대응은 회부.',false);
const result=policy.rows.map(r=>{if(!rows.has(r.id))throw Error(r.id+' no runtime case');return {...r,...rows.get(r.id)};});fs.writeFileSync(path.join(out,'같은입력-측정.json'),JSON.stringify(result,null,2)+'\n');console.log('measured',result.length,'equal',result.filter(r=>r.equal).length,'typed-host-boundary',result.filter(r=>!r.comparable).length);
