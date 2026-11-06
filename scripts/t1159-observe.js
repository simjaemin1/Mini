'use strict';
// 읽기 전용 계측. T577 아이 존의 econ 틱 전후 몸 명부와 집 N을 읽는다.
const fs=require('fs'),path=require('path');
if (!process.env.T577_SEED || !/server[\\/]zone\.js$/.test(process.argv[1]||'')) return;
const E=require('../sim/economy-sim'),DD=require('./lib-day-deaths');DD.install(E);
const rec={version:2,seed:+process.env.T577_SEED,on:E.T1159_HOME_N,births:0,deaths:0,starvationDeaths:0,starvingPersonDays:0,awayPersonDays:0,awayVillageDays:0,unknownHomeDays:0,endPop:0,rows:[],errors:[]};
const perDay=new Map(),lastPop=new Map(),tick=E.tickVillage;
let lastWorld=null;
E.tickVillage=function(v,day){
  const before=new Set(v.npcs),total=before.size,fdDead0=v._fdDeadTot||0;
  if(v._world)lastWorld=v._world;
  let home=total;
  try {if(v._world&&typeof v._world.homePopulation==='function')home=v._world.homePopulation(v);else rec.unknownHomeDays++;}
  catch(e){if(rec.errors.length<20)rec.errors.push(String(e));}
  const result=tick.apply(this,arguments);
  try {
    let born=0;for(const n of v.npcs)if(!before.has(n))born++;
    const dead=DD.deathsToday(v),fd=E.foodDebtOf(v),away=Math.max(0,total-home);
    rec.births+=born;rec.deaths+=dead;rec.starvationDeaths+=(v._fdDeadTot||0)-fdDead0;rec.starvingPersonDays+=fd.starving;rec.awayPersonDays+=away;if(away)rec.awayVillageDays++;
    lastPop.set(v.name,v.npcs.length);
    let row=perDay.get(day);if(!row){row={day,births:0,deaths:0,starving:0,away:0,econEndPopulation:0,observedVillages:0,expectedVillages:v._world&&v._world.villages?v._world.villages.length:null};perDay.set(day,row);rec.rows.push(row);}
    row.births+=born;row.deaths+=dead;row.starving+=fd.starving;row.away+=away;row.econEndPopulation+=v.npcs.length;row.observedVillages++;
  }catch(e){if(rec.errors.length<20)rec.errors.push(String(e));}
  return result;
};
process.on('exit',()=>{rec.endPop=lastWorld&&lastWorld.villages?lastWorld.villages.reduce((a,v)=>a+v.npcs.length,0):[...lastPop.values()].reduce((a,b)=>a+b,0);rec.endDay=lastWorld?lastWorld.day:null;rec.lastCompleteEconDay=[...rec.rows].reverse().find(r=>r.expectedVillages!=null&&r.observedVillages===r.expectedVillages)?.day??null;const out=process.env.T577_OUT;if(out)fs.writeFileSync(out.replace(/\.json$/,'.t1159.json'),JSON.stringify(rec));});

// 몸∞ 비교에서는 기존 도적 관찰도 함께 읽는다. 집 N의 두 갈래에 같은 관찰을 적용한다.
if(process.env.T1078_BANDIT_ALL==='1')for(const file of ['t1078-observe','t1079-observe','t1104-observe'])require('./'+file);
