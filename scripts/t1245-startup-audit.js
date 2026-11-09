#!/usr/bin/env node
'use strict';
Object.assign(process.env,{ZONE_ID:'hanbando',ENABLE_VILLAGES:'1',ENABLE_WILDLIFE:'0',ENABLE_BANDITS:'0',ENABLE_ROADS:'0',T1243_FARM_ON:'1',T789_DISCARD:'1',T640_BOOT_SLICE:'0',T696_WAL:'0',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'1',CENTRAL_URL:'http://localhost:1',DB_PATH:'/tmp/t1245-startup-'+process.pid+'.db',PORT:String(48200+process.pid%100)});
const fs=require('fs'),G=require('../server/granary-lots'),L=require('../server/lots'),S=require('../server/spoil'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2'),C=require('../server/crops'),rows=[],seen=new WeakSet();
const original=G.attach;
G.attach=function(v,...args){const result=original.call(this,v,...args);if(result&&v._t1243Seed&&!seen.has(v)){seen.add(v);const now=L.nowMs(),t=now/L.dayMs(),h=E.seedFoodDays(0),dump=G.dump(v);for(const c of v._t1243Seed.crops){const r=(dump.L[c]||[])[0];if(!r)continue;rows.push({village:v.name,crop:c,nowMs:now,dayMs:L.dayMs(),initial:{...r},ageDays:t-r.k/L.dayMs(),exposureNow:S.exposureAt(r,t,0),temperatureNowC:E2.temperatureAt(t,undefined,0),firstHarvestElapsed:h,exposureAtHarvest:S.exposureAt(r,t+h,0),spoiledAtHarvest:S.isSpoiled(c,S.exposureAt(r,t+h,0)),shelf:S.shelfOf(c)});}
 const state=require('../server/villages').__p3Bind({}).state;const n=(state.world?.villages||[]).length;
 if(n&&G.stats().attached>=n&&!process._t1245Done){process._t1245Done=true;const out={kind:'actual zone boot with virtual clock; no consumption run',econDay:state.world.day,villages:n,place:S.placeOf('granary'),rows};fs.writeFileSync(process.env.T1245_STARTUP_OUT||'/tmp/t1245/startup.json',JSON.stringify(out,null,2));setImmediate(()=>process.exit(0));}
 }return result;};
require('../server/zone');
setTimeout(()=>{console.error('T1245 startup audit timed out',rows.length);process.exit(1);},300000);
