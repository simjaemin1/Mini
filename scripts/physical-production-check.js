#!/usr/bin/env node
'use strict';
// Physical production must get one body day per economy day and every economic body.
// Existing SBC is retained as a historical fingerprint comparison.
const path=require('path'),{spawnSync}=require('child_process');
function physicalEnv(input=process.env){
 const root=path.resolve(__dirname,'..'),day=require('../server/zone-config').WORLD.dayLengthMs;
 const preload=[path.join(root,'scripts/t745-vclock.js'),path.join(root,'scripts/physical-production-observe.js')];
 return {...input,VILLAGE_DAY_MS:String(day),VILLAGE_NPC_CAP:'Infinity',T745_VCLOCK:'1',T696_WAL:'0',T400_BUILD_ACT:input.T400_BUILD_ACT??'1',NODE_OPTIONS:[...preload.map(p=>'--require '+p),input.NODE_OPTIONS||''].join(' ').trim()};
}
module.exports={physicalEnv};
if(require.main===module){
 const days=process.argv[2]||'3',seeds=process.argv[3]||'1020';
 if(!/^\d+$/.test(days)||!(+days>0)||!/^\d+(,\d+)*$/.test(seeds))throw Error('usage: physical-production-check.js DAYS SEED[,SEED]');
 const env=physicalEnv();env.T577_DIR=env.T577_DIR||'/tmp/physical-production-'+Date.now();env.T577_TAG='physical';
 console.log(JSON.stringify({days:+days,seeds,dayMs:+env.VILLAGE_DAY_MS,bodyCap:env.VILLAGE_NPC_CAP,house:env.T400_BUILD_ACT,out:env.T577_DIR}));
 const r=spawnSync(process.execPath,[path.join(__dirname,'t577-server-run.js'),days,seeds],{env,stdio:'inherit'});
 if(r.error)throw r.error;process.exitCode=r.status??1;
}
