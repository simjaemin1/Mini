'use strict';
// Legacy flow helper: _deadTot is econ deaths, NOT the food-debt-only counter.
// Prefer t115x-observe.js for verified hunger and death metrics.
// Read the same executed trade rows as the T1152 laboratory observer.
// Purchases include all food-convertible items, with the existing food/weight canon.
const fs=require('fs'),E=require('../sim/economy-sim-v2'),V=require('../sim/economy-sim');
const tick=E.tickWorldV2,seen=new WeakSet(),flow=new Map();let last;
const rowFor=v=>{let r=flow.get(v);if(!r){r={exports:{},imports:{},exportKg:0,foodPurchasedEquivalent:0};flow.set(v,r);}return r;};
function leg(from,to,items){if(!from||!to)return;for(const it of items||[]){if(!it||!(it.amt>0))continue;const a=rowFor(from),b=rowFor(to);a.exports[it.res]=(a.exports[it.res]||0)+it.amt;b.imports[it.res]=(b.imports[it.res]||0)+it.amt;a.exportKg+=it.amt*E._t1136Probe.kg(it.res);b.foodPurchasedEquivalent+=it.amt*E._t1152Probe.foodPer(to,it.res);}}
E.tickWorldV2=function(w,...args){try{return tick.call(this,w,...args);}finally{last=w;const byName=new Map(w.villages.map(v=>[v.name,v]));for(let i=w.tradeLog.length-1;i>=0&&!seen.has(w.tradeLog[i]);i--){const t=w.tradeLog[i];seen.add(t);if(t.rerouted||t.abandoned)continue;const a=byName.get(t.from),b=byName.get(t.to);leg(a,b,t.basket||(!t.abandoned&&t.sent?[t.sent]:[]));leg(b,a,t.retBasket||(t.bought?[t.bought]:[]));}}};
process.on('exit',()=>{if(!last||!process.env.T17_JSON)return;fs.writeFileSync(process.env.T17_JSON+'.flow.json',JSON.stringify({day:last.day,definition:'executed trade purchases at market time, all food-equivalent items; return cargo may still be travelling; canonical T1152 row interpretation',villages:last.villages.map(v=>({name:v.name,pop:v.npcs.length,counts:v.counts,econDeaths:v._deadTot||0,foodDebtDeaths:v._fdDeadTot||0,...rowFor(v)}))}));});
