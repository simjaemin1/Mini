'use strict';
const fs=require('fs'),crypto=require('crypto'),Module=require('module'),compile=Module.prototype._compile;
const changes=[
 ['/sim/economy-sim.js',"(T1243_FARM_ON ? totalFoodEquivalent(v) : (v.storage.food || 0)) < N * 8","(v.storage.food || 0) < N * 8"],
 ['/server/villages.js',"if ((_t1243On() ? _lifeEcon().totalFoodEquivalent(e) : ((e.storage && e.storage.food) || 0)) > e.npcs.length * 120) return false;","if (((e.storage && e.storage.food) || 0) > e.npcs.length * 120) return false;"],
 ['/server/villages.js',"const food = _t1243On() ? _lifeEcon().totalFoodEquivalent(vil.econ) : ((vil.econ.storage && vil.econ.storage.food) || 0);","const food = (vil.econ.storage && vil.econ.storage.food) || 0;"]
];const records=[];const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
Module.prototype._compile=function(source,file){let next=source;for(const [suffix,from,to]of changes)if(file.endsWith(suffix)){if(next.split(from).length!==2)throw Error('anchor '+from);next=next.replace(from,to);}if(next!==source)records.push({file,originalSHA256:sha(source),memorySHA256:sha(next)});return compile.call(this,next,file);};
process.on('exit',()=>fs.writeFileSync(process.env.T1255_PATCH_AUDIT,JSON.stringify({changedSites:3,files:records})));
