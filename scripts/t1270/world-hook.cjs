'use strict';
const path=require('node:path'),fs=require('node:fs');const root=process.env.T1270_ROOT;
require(path.join(root,'scripts/t1241-hook.js'));
if(!process.env.T577_SEED||!/zone\.js$/.test(process.argv[1]||''))return;
const RB=process.hrtime.bigint,start=RB(),cpu0=process.cpuUsage(),out=process.env.T1248_TRACE;fs.writeFileSync(out,'');
const R=v=>typeof v==='number'?Math.round(v*1e6)/1e6:v,stor=s=>Object.fromEntries(Object.keys(s||{}).sort().map(k=>[k,R(s[k])]));
const E=require(path.join(root,'server/events')),make=E.createLedger;let last=-1;
E.createLedger=function(){const L=make.apply(this,arguments),scan=L.scanDay;L.scanDay=function(world,day){if(day!==last){last=day;const villages=(world.villages||[]).map(v=>({name:v.name,parts:[stor(v.storage),[(v.npcs||[]).length,(v.npcs||[]).map(n=>n&&typeof n==='object'?[n.id!=null?n.id:n.pid,R(n.age),n.currentJob||null,R(n.hunger),R(n.hp)]:n)],[R(v.housing),v.expansions||0,v._banditized?1:0],v.treasury&&typeof v.treasury==='object'?stor(v.treasury):R(v.treasury)]}));fs.appendFileSync(out,JSON.stringify({day:day|0,villages})+'\n');}return scan.apply(this,arguments);};return L;};
process.on('exit',code=>{const c=process.cpuUsage(cpu0);fs.writeFileSync(out+'.meta.json',JSON.stringify({code,cpuSeconds:(c.user+c.system)/1e6,wallSeconds:Number(RB()-start)/1e9,stats:global.__t1241Stat||{},clock:global.__t745?global.__t745():null},null,2));});
