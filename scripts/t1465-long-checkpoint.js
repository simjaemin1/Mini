'use strict';
// Native counters only: no legacy onCast observer, so canonical snapshots retain
// every gameplay callback through lib-eq-lab's existing, validated restore gates.
const fs=require('fs'),path=require('path'),assert=require('assert');
const E=require('../sim/economy-sim'),L=require('./lib-eq-lab'),O=require('./t1465-observe');
const OUT=process.env.T1465_OBS,DIR=process.env.T1465_CHECKPOINT_DIR,EVERY=Number(process.env.T1465_CHECKPOINT_EVERY||365);
assert(OUT&&DIR&&EVERY>0);
const bind=L.bindT17;
L.bindT17=function(){const binding=bind.apply(this,arguments),day=binding.day;
 binding.day=function(){const result=day.apply(this,arguments),w=binding.world;O.flushCompletedDay();
 if(w.day%EVERY===0){
  O.writePartial();if(E.T1465_ORE_STOCK)require('./t1465-empty-watch').flush();
  const dir=path.join(DIR,'day-'+String(w.day).padStart(5,'0'));fs.mkdirSync(dir,{recursive:true});
  L.save(path.join(dir,'world.v8.gz'),w,E,{made:'T1465 completed-day checkpoint',seed:42,zone:'hanbando'});
  fs.copyFileSync(OUT,path.join(dir,'stock.json'));
  if(E.T1465_ORE_STOCK)fs.copyFileSync(OUT+'.empty-events.json',path.join(dir,'empty-events.json'));
  fs.writeFileSync(path.join(dir,'ready.json'),JSON.stringify({day:w.day,node:process.version,stockOn:E.T1465_ORE_STOCK}));
  const dirs=fs.readdirSync(DIR).filter(x=>/^day-\d+$/.test(x)).sort();
  // Keep the last two complete checkpoints and the requested10-year milestone.
  for(const old of dirs.slice(0,-2))if(old!=='day-03650')fs.rmSync(path.join(DIR,old),{recursive:true,force:true});
  console.log('[T1465 checkpoint]',w.day,dir);
 }
 return result;
 };return binding;
};
