#!/usr/bin/env node
'use strict';
// Controlled physical calibration, not a market/equilibrium run. Mine5's canonical
// cells; central test granary, one skill-5 miner, unlimited demand, uniform stock
// reset each morning. Calls production body pick/swing/consume/haul/delivery.
// Terrain A* and the runtime-read canonical followNpcPath drive walking.
// Market-induced rest is excluded to measure physical capacity. The residual bag
// is delivered through the canonical entrance after work; overnight return is not timed.
Object.assign(process.env,{ENABLE_VILLAGES:'0',T1465_ORE_STOCK:'0',T1266_ORE_BODY:'1',T1188_ORE_SPLIT:'1',T724_MINE_ACT:'1',T427_WORK_REACH:'1',T1295_BODY_CLOCK:'0'});
const fs=require('fs'),crypto=require('crypto');
const V=require('../server/villages'),E=require('../sim/economy-sim'),S=require('../server/specialty');
const src=fs.readFileSync(require.resolve('../server/zone'),'utf8');
const speed=Number(src.match(/const MOVE_SPEED = ([\d.]+);/)[1]);
const D=JSON.parse(fs.readFileSync('계측/T1465_2026-11-23/광맥-진단.json'));
const m=D.villages.find(v=>v.name==='광산5');if(!m)throw Error('Mine5 not found');
const H=V.__p3Bind({}),st=H.state,P=V.__labProbe._t1188Probe,DAY=1440000,days=30;
const vm=require('vm'),PF=require('../server/pathfind'),T=require('../server/terrain'),{ZONES}=require('../server/zone-config');T.setZonesMeta(ZONES);
const extract=name=>{const i=src.indexOf('function '+name+'(');return src.slice(i,src.indexOf('\n}',i)+2);};
const lt=src.match(/^function _t671Lt[^\n]+/m)[0];
const follow=vm.runInNewContext(lt+';'+extract('followNpcPath')+';followNpcPath',{MOVE_SPEED:speed,NPC_WALK_MULT:process.env.T888_NPC_WALK==='0'?.6:1,Math});
const R=Number(fs.readFileSync(require.resolve('../server/villages'),'utf8').match(/const ORE_LABOR_R = (\d+);/)[1]);
const blocked=(x,y)=>T.isWaterCellLocal('hanbando',Math.floor(x/32)*32+16,Math.floor(y/32)*32+16)||T.isRockCellLocal('hanbando',x,y);
const paths=new Map();
function route(a,b){const key=a.x+','+a.y+'>'+b.x+','+b.y;if(!paths.has(key))paths.set(key,PF.findPath(a.x,a.y,b.x,b.y,{isWaterFn:blocked,maxCells:(R*2+1)**2,searchRadiusCells:R*2}));return paths.get(key);}
const rows=[];
const fractions=[1,.5,.1,.1*.1,2/S.ORE_K,(1+.1)/S.ORE_K,(1+1/S.MINE_SWINGS_PER)/S.ORE_K,1/S.ORE_K];
for(const depletedPrefix of [0,1-.5,1-.1])for(const fraction of fractions){
 const w={day:1};E.bindProductionActs(w);
 const v={name:m.name,ccx:m.ccx,ccy:m.ccy,_oreCells:m.cells,_granList:[{cx:m.ccx,cy:m.ccy}],npcPids:['miner'],_mineLvl:5,
 econ:{_world:w,storage:{food:1000},treasury:{},land:{ore:1,oreMix:m.land?.oreMix||{tin:1}},counts:{miner:1},npcs:[]}};
 const home={x:m.ccx*32+16,y:(m.ccy+2)*32+16};
 const p={pid:'miner',simVillageId:1,simJob:'miner',...home,npcHomeX:home.x,npcHomeY:home.y,inventory:{}};
 const depleted=new Set(m.cells.slice(0,Math.floor(m.cells.length*depletedPrefix)).map(c=>c.cx+','+c.cy));
 const initial=k=>depleted.has(k)?0:S.ORE_K*fraction;
 let stock=new Map(),cut=0,walkMs=0,pathPx=0,selectedDistance=0,selections=0;
 st.world=w;st.dayMs=DAY;st.epoch=0;st.zoneId='test';st.villages=[v];st.econV2={};
 st.deps={players:new Map([['miner',p]]),oreStockAt:(x,y)=>stock.get(x+','+y)??initial(x+','+y),
 oreConsumeAt:(x,y,n)=>{const k=x+','+y,q=Math.min(n,stock.get(k)??initial(k));stock.set(k,(stock.get(k)??initial(k))-q);cut+=q;return q;},
 oreMixAt:(x,y)=>T.oreMixAt('hanbando',x,y),oreMineralAt:(x,y,rng)=>T.oreMineralAt('hanbando',x,y,rng),moveSpeed:speed,dayPhaseRatio:.7,npcCanReach:(ax,ay,bx,by)=>!!route({x:ax,y:ay},{x:bx,y:by})};
 for(let d=1;d<=days;d++){
  w.day=d;stock=new Map();Object.assign(p,home);p._t724Site=null;p._t724T=0;p._granTask=null;p.path=null;p.pathKey=null;p.vx=p.vy=0;p.targetX=home.x;p.targetY=home.y;
  for(let t=100;t<DAY*.7;t+=100){
   const now=d*DAY+t,old=p._t724Site;
   if(p._granTask)V.__labProbe.oreGranStep(v,p,now);else P.mine(v,p,now,d);
   if(p._t724Site&&p._t724Site!==old&&!p._t724Site.none){selectedDistance+=Math.hypot(p._t724Site.x-home.x,p._t724Site.y-home.y);selections++;}
   if(p.targetX!=null){
    const key=p.targetX+','+p.targetY;
    if(key!==p.pathKey){p.path=route(p,{x:p.targetX,y:p.targetY});p.pathIndex=0;p.pathKey=key;}
    if(p.path){follow(p);const dx=(p.vx||0)*.1,dy=(p.vy||0)*.1,q=Math.hypot(dx,dy);p.x+=dx;p.y+=dy;if(q){walkMs+=1000*q/speed;pathPx+=q;}}
   }
  }
  P.deliver(v,p,(d+1)*DAY-1);
 }
 rows.push({depletedPrefix,fraction,days,chunksPerMinerDay:cut/days,walkFractionOfWork:walkMs/(days*DAY*.7),selectedDistancePx:selections?selectedDistance/selections:0,pathPxPerDay:pathPx/days,selections});
}
for(const r of rows)r.relativeOutput=r.chunksPerMinerDay/rows[0].chunksPerMinerDay;
const files=['server/villages.js','server/specialty.js','server/zone.js'];
const result={method:'controlled physical body calibration; daily uniform-stock reset, central test granary, one skill5 miner, unlimited demand (canonical missing-value fallback), actual terrain A* / canonical followNpcPath, daily uniform-stock reset; controlled physical calibration, NOT market equilibrium',daysPerPoint:days,stepMs:100,depletedPrefixControls:[0,1-.5,1-.1],speedReadFromZone:speed,sourceHashes:Object.fromEntries(files.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),rows};
const i=process.argv.indexOf('--out');if(i>=0)fs.writeFileSync(process.argv[i+1],JSON.stringify(result,null,2));const ci=process.argv.indexOf('--curve-out');if(ci>=0){const profiles=[...new Set(rows.map(r=>r.depletedPrefix))].map(depletedPrefix=>({depletedPrefix,rows:[{fraction:0,relativeOutput:0},...rows.filter(r=>r.depletedPrefix===depletedPrefix).slice().sort((a,b)=>a.fraction-b.fraction).map(({fraction,relativeOutput})=>({fraction,relativeOutput}))]}));fs.writeFileSync(process.argv[ci+1],JSON.stringify({method:result.method,source:'scripts/t1465-body-curve.js',rows:profiles[0].rows,profiles},null,2)+'\n');}console.log(JSON.stringify(result,null,2));
