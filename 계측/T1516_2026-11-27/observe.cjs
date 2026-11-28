'use strict';
if (!/server[\\/]zone\.js$/.test(process.argv[1]||'')) return;
const fs=require('fs'), Module=require('module'),original=Module.prototype._compile;
const result={bodyTicks:0,bodyWood:0,woodClosures:0,batchTrees:0,errors:[]};
const snippet=`
;(function(){
 const oldWood=_lifeWoodDay;
 _lifeWoodDay=function(vil){const r=oldWood.apply(this,arguments);global.__T1516Obs.woodClosures++;global.__T1516Obs.batchTrees+=(vil._t325Dbg&&vil._t325Dbg.cut)||0;return r;};
 const oldTick=module.exports.npcLifeTick;
 module.exports.npcLifeTick=function(npc,now){const before=(npc.inventory&&npc.inventory.wood)||0;const r=oldTick.apply(this,arguments);if(npc.simJob==='lumberjack'){global.__T1516Obs.bodyTicks++;const delta=((npc.inventory&&npc.inventory.wood)||0)-before;if(delta>0)global.__T1516Obs.bodyWood+=delta;}return r;};
})();`;
global.__T1516Obs=result;
Module.prototype._compile=function(content,filename){if(filename.endsWith('/server/villages.js'))content+='\n'+snippet;return original.call(this,content,filename);};
process.on('exit',()=>fs.writeFileSync(process.env.T1516_OBS_OUT,JSON.stringify(result)));
