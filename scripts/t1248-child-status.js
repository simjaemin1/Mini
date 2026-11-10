'use strict';
// Read-only provenance: t577's generic >=40-village check intentionally fails
// for its one-town fixture. Keep the real zone process exit distinct from that.
const path=require('node:path');
if(path.basename(process.argv[1]||'')==='t577-server-run.js'&&process.env.T1248_CHILD_STATUS){
 const cp=require('node:child_process'),fs=require('node:fs'),spawn=cp.spawn;
 cp.spawn=function(...args){const c=spawn.apply(this,args);if((args[1]||[]).some(x=>/server[\\/]zone\.js$/.test(x)))c.once('exit',(code,signal)=>fs.writeFileSync(process.env.T1248_CHILD_STATUS,JSON.stringify({pid:c.pid,code,signal})));return c;};
}
