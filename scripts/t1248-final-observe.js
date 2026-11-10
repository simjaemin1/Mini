'use strict';
// Read-only terminal counters; daily T1241 rows precede the next day's close.
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const fs=require('fs'),path=require('path'),crypto=require('crypto');
process.on('exit',()=>{
 const sourceModule=require.resolve(path.join(path.dirname(process.argv[1]),'villages')),V=require(sourceModule),B=V.__p3Bind({}),state=B.state;
 const villages=(state.villages||[]).map(v=>({name:v.name,farm:v._farmSet?.size||0,crop:v._crop?.size||0,pop:v.econ?.npcs?.length||0}));
 fs.writeFileSync(process.env.T577_OUT+'.terminal.json',JSON.stringify({sourceModule,day:state.world?.day,now:Date.now(),villages,farm: villages.reduce((a,v)=>a+v.farm,0),stats:global.__t1241Stat||null,observerSHA256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')}));
});
