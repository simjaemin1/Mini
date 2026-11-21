#!/usr/bin/env node
'use strict';
// T1409 실제 HTML 100날 자. 게임 값을 주입하지 않고 seed/마을수/카드 손잡이만 지정한다.
const fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),{chromium}=require('playwright');
const root=path.join(__dirname,'..'),lab=process.argv[2]||'war',arm=process.argv[3]||'off',days=+(process.argv[4]||100),dest=process.argv[5];if(!dest)throw Error('output JSON 필요');
const rel=lab==='war'?'lab/전쟁실험실.html':'lab/마을실험실.html';let file=path.join(root,rel),tmp;
const source=arm==='before'?cp.execFileSync('git',['show','1aa63e63:'+rel],{cwd:root,encoding:'utf8',maxBuffer:8<<20}):fs.readFileSync(file,'utf8');
if(arm==='before'){tmp=path.join(root,'lab','.t1409-before-'+lab+'.html');fs.writeFileSync(tmp,source);file=tmp;}
(async()=>{const browser=await chromium.launch({args:['--no-sandbox']});try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.addInitScript(()=>{let seed=1020|0;Math.random=()=>{seed=(seed+0x6D2B79F5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};window.requestAnimationFrame=()=>0;});
 await page.goto('file://'+file+(['on','water','raid','march'].includes(arm)?'?'+({on:'T1409_WATER_RULE',water:'T1409_WATER_RULE',raid:'T1409_VIL_RAID_MIN',march:'T1409_VIL_MARCH'}[arm])+'=1':''),{waitUntil:'load',timeout:180000});
 const result=await page.evaluate(({days,arm})=>{document.getElementById('seed').value='1020';document.getElementById('nvil').value='8';reseed();lifeInit();
 function snapshot(){return VILS.map(v=>({name:v.name,pop:v.econ.npcs.length,storage:v.econ.storage,land:v.econ.land,housing:v.econ.housing,npcs:v.econ.npcs.map(n=>({id:n.id,age:n.age,job:n.currentJob,hunger:n.hunger,hp:n.hp,skills:n.skills})),territory:v.V.territory,houses:v.houses}));}
 const initial=JSON.parse(JSON.stringify(snapshot())),series=[];for(let d=0;d<days;d++){lifeDayAll(arm!=='slow');series.push(JSON.stringify(snapshot()));}
 const fixtures=[];if(typeof conscript==='function'){for(const opts of [{},{defense:true},{forceCount:3},{mobFrac:0.5}]){const e={name:'같은 입력',npcs:Array.from({length:8},(_,i)=>({id:i,age:20,currentJob:['warrior','warrior','hunter','farmer','miner','lumberjack','fisher','forager'][i],skills:{combat:1,archery:1},_wsSword:1,_wsBow:1,_wsSpear:1})),counts:{warrior:2,hunter:1,farmer:1,miner:1,lumberjack:1,fisher:1,forager:1},storage:{weapon:30,armor:3,stone:20,copper:3,tin:2},land:{tin:1},_weapQ:0.3,_swordFrac:0.5};const input=JSON.parse(JSON.stringify(e));const value=conscript({econ:e},'raid',opts);fixtures.push({input,mode:'raid',opts,value:JSON.parse(JSON.stringify(value))});}}
 const parameters={WAR_RAID_MIN:typeof WAR_RAID_MIN==='undefined'?null:WAR_RAID_MIN,WAR_MARCH:typeof WAR_MARCH==='undefined'?null:WAR_MARCH};
 const waterSamples=[];if(typeof villageFertWater==='function'){const c=VILS[0].center,i=idx(c.cx,c.cy),old=TR.dist[i];for(const d of [0,10,50,200]){TR.dist[i]=d;waterSamples.push({d,value:villageFertWater(c.cx,c.cy).water});}TR.dist[i]=old;}
 const oreSamples=typeof oreRegen==='function'?[0,0.5,250,1000].flatMap(R0=>[0,1,10].map(days=>({R0,days,value:oreRegen(R0,days)}))):[];
 return {initial,series,parameters,waterSamples,oreSamples,final:VILS.map(v=>({name:v.name,pop:v.econ.npcs.length,food:typeof warFE==='function'?warFE(v.econ):EconEngine.storageFoodEquiv(v.econ),empty:v.econ.npcs.length===0})),fixtures,knob:window.LAB_ENV?.T1409_WATER_RULE||'0'};
 },{days,arm});
 if(errors.length)throw Error(errors.join('\n'));result.series=result.series.map(v=>crypto.createHash('sha256').update(v).digest('hex'));result.meta={lab,arm,days,seed:1020,sourceSha256:crypto.createHash('sha256').update(source).digest('hex')};fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');console.log(lab,arm,days,'pop',result.final.reduce((n,v)=>n+v.pop,0));
 }finally{await browser.close();if(tmp)fs.rmSync(tmp,{force:true});}})().catch(e=>{console.error(e);if(tmp)fs.rmSync(tmp,{force:true});process.exitCode=1;});
