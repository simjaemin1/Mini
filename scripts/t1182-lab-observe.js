'use strict';
// 헤드리스 랩 관측만: 같은 정본 틱의 소요와 기아 장부를 읽는다.
const fs=require('fs'), E=require('../sim/economy-sim-v2'), tick=E.tickWorldV2;
let world=null,n=0,ns=0;
E.tickWorldV2=function(w,...a){const t=process.hrtime.bigint();try{return tick.call(this,w,...a)}finally{world=w;n++;ns+=Number(process.hrtime.bigint()-t);}};
process.on('exit',()=>{if(!world || !process.env.T17_JSON)return;fs.writeFileSync(process.env.T17_JSON+'.t1182.json',JSON.stringify({days:world.day,tickN:n,tickUs:n?ns/n/1000:0,pop:world.villages.reduce((a,v)=>a+v.npcs.length,0),empty:world.villages.filter(v=>!v.npcs.length).length,starved:world.villages.reduce((a,v)=>a+(v._deadTot||0),0),dissolved:world.villages.filter(v=>v._banditized).length,trades:world.tradeLog.length}));});
