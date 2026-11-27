'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const root='/workspace/Mini-WarSnap-Resume666',out='/workspace/scratch/war-snap-mature-resume666',T=require(root+'/scripts/t577-server-run.js');
(async()=>{const m=JSON.parse(fs.readFileSync('/workspace/scratch/war-snap-mature-early/meta-shutdown.json'));
 const env=T.kidEnv({seed:42,port:await T.freePort(),db:out+'/run/w.db',out:out+'/result.json',days:667});
 Object.assign(env,{T577_RESUMED:'1',T740_FORCE_JUMP:'0',T577_STATE:out+'/run/state.json',T1308_KEEP_IN:out+'/run/keep-870.json',T745_V0:String(m.anchor.at),T745_PHASE_IN:out+'/run/phase-870.json'});
 const pre=['t745-vclock.js','t722-stop-hook.js','t740-side-hook.js','t1308-keep-hook.js'].map(f=>'--require '+root+'/scripts/'+f).join(' ');env.NODE_OPTIONS='--max-old-space-size=6144 '+pre+' --require '+root+'/scripts/war-snapshot-mature-hook.js';
 const log=fs.openSync(out+'/zone.log','w');const c=cp.spawn(process.execPath,['-r',root+'/scripts/t577-server-hook.js',root+'/server/zone.js'],{cwd:root,env,stdio:['ignore',log,log]});fs.writeFileSync(out+'/child.json',JSON.stringify({pid:c.pid,root,from:666,to:667,at:m.anchor.at,flags:Object.fromEntries(Object.entries(env).filter(([k])=>/^(T1497|T1445|T400|T745|T941|T1381|T577|VILLAGE_|WAR_SNAP_MATURE)/.test(k)))},null,2));c.on('exit',(code,signal)=>{fs.closeSync(log);fs.writeFileSync(out+'/child-exit.json',JSON.stringify({code,signal}));process.exit(code===null?1:code);});
})();
