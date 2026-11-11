'use strict';
// Measurement only. Transform an immutable V4 source in memory; never write product files.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1]||'')) return;
const root=process.env.T1248_ROOT,out=process.env.T1262_OUT;
const A=require(path.join(process.env.T1262_DEPS,'acorn'));
const read=()=>{const c=process.threadCpuUsage();return c.user+c.system;};
const real=process.hrtime.bigint,wall0=real();
let last=0,current='startup',boot=true,finished=false,frames=0,pending=null,bodySnapshot=()=>null;
const buckets={},calls={},rows=[],patches=[];
function settle(t){buckets[current]=(buckets[current]||0)+t-last;last=t;}
function enter(cat,id){const t=read();settle(t);const effective=boot?'startup':cat;const token={prev:current,t,id,cat:effective,base:buckets[effective]||0};current=effective;return token;}
function leave(tok){const t=read();settle(t);current=tok.prev;if(tok.id){const c=calls[tok.id]||(calls[tok.id]={n:0,inclusiveUs:0,categoryUs:0});c.n++;c.inclusiveUs+=t-tok.t;c.categoryUs+=(buckets[tok.cat]||0)-tok.base;}}
function wrap(fn,cat,id){return function(){const tok=enter(cat,id);try{return fn.apply(this,arguments);}finally{leave(tok);}};}
const jobCat=n=>n==='econ'?'econ':n==='save'?'storage':/dist|route/.test(n)?'trade_routes':'life_daily';
function job(j){const tok=enter(jobCat(j.n),'job:'+j.n+':'+(j.s||''));try{return j.f();}finally{leave(tok);}}
function ledger(cat,outer=false){const E=require(path.join(root,'server/events')),make=E.createLedger;
 E.createLedger=function(){const L=make.apply(this,arguments),fn=L.scanDay;L.scanDay=function(world,day){if(outer)pending={world,day};const tok=enter(cat,'ledger:'+cat);let r;try{r=fn.apply(this,arguments);}finally{leave(tok);}if(r&&typeof r.next==='function'){r.next=wrap(r.next.bind(r),cat,'ledger:next');}if(outer)cut(world,day);return r;};return L;};}
let previousCPU=0,previousBuckets={};
function cut(world,day){if(rows.some(r=>r.day===day))return;const tok=enter('observers','profile:cut');const c=process.cpuUsage();settle(read());const processUs=c.user+c.system;
 const delta={};for(const[k,v]of Object.entries(buckets))delta[k]=v-(previousBuckets[k]||0);
 const row={day,population:(world.villages||[]).reduce((s,v)=>s+(v.npcs||[]).length,0),bodies:bodySnapshot(),frames,processUs,cpuUs:processUs-previousCPU,mainThreadUs:last,bucketsUs:{...buckets},deltaUs:delta,wallSeconds:Number(real()-wall0)/1e9};
 rows.push(row);previousCPU=processUs;previousBuckets={...buckets};fs.appendFileSync(path.join(out,'profile-days.jsonl'),JSON.stringify(row)+'\n');leave(tok);}
function finish(code){if(finished)return;finished=true;if(pending)cut(pending.world,pending.day);settle(read());const c=process.cpuUsage(),total=c.user+c.system;const main=Object.values(buckets).reduce((a,b)=>a+b,0);
 fs.writeFileSync(path.join(out,'profile.json'),JSON.stringify({code,method:'exclusive main-thread CPU microseconds; process minus main-thread CPU is other-thread',processUs:total,mainThreadUs:main,otherThreadUs:total-main,bucketsUs:buckets,calls,frames,patches,days:rows.map(r=>r.day),wallSeconds:Number(real()-wall0)/1e9},null,2));}
const P=global.__t1262={enter,leave,wrap,job,ledger,frame(){if(boot){settle(read());boot=false;current='other';}frames++;},snapshot(fn){bodySnapshot=fn;},finish};
// Native SQLite execution + prepare. Statement methods are patched once on their shared prototype.
const {DatabaseSync}=require('node:sqlite');
for(const name of ['exec','prepare','close']){const fn=DatabaseSync.prototype[name];if(typeof fn==='function')DatabaseSync.prototype[name]=wrap(fn,'storage','sqlite:'+name);}
const probe=new DatabaseSync(':memory:'),stmt=probe.prepare('select 1'),proto=Object.getPrototypeOf(stmt);
for(const name of ['run','get','all','iterate']){const fn=proto[name];if(typeof fn==='function')proto[name]=wrap(fn,'storage','sqlite:'+name);}probe.close();
function walk(n,f){if(!n||typeof n!=='object')return;f(n);for(const[k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(x=>walk(x,f));else if(v&&typeof v==='object')walk(v,f);}}
const compile=Module.prototype._compile;
Module.prototype._compile=function(src,file){let suffix='',edits=[];const rel=path.relative(root,file).replaceAll('\\','/');
 if(rel==='server/events.js')suffix+='\nglobal.__t1262.ledger("econ");';
 if(['scripts/t1241-hook.js','scripts/t1248-hook.js','scripts/t577-server-hook.js'].includes(rel))suffix+='\nglobal.__t1262.ledger("observers",'+(rel==='scripts/t577-server-hook.js')+');';
 if(rel==='sim/path-core.js')suffix+='\nfor(const n of ["localPath","localPathBegin","routePath","routePathBegin","pathStep","smoothPath"]) module.exports[n]=global.__t1262.wrap(module.exports[n],"pathfinding","path:"+n);';
 if(rel==='sim/economy-sim-v2.js')suffix+='\nconst __t1262Parts=module.exports.tickWorldV2Parts; module.exports.tickWorldV2Parts=function(){const p=__t1262Parts.apply(this,arguments);for(const n of ["head","village","trade","caravans","tail"])if(typeof p[n]==="function")p[n]=global.__t1262.wrap(p[n],"econ","econ:"+n);return p;};';
 if(rel==='server/villages.js'){
  const anchor='const rv = j.f();';if(src.split(anchor).length!==2)throw Error('job anchor');src=src.replace(anchor,'const rv = global.__t1262.job(j);');
  suffix+='\nfor(const n of ["onGameTick","deferLate"])if(typeof module.exports[n]==="function")module.exports[n]=global.__t1262.wrap(module.exports[n],"other","villages:"+n);';
  for(const n of ['_routeWarmStep','_routeRedigStep','_t968DistBg','_t996Step'])suffix+=`\n${n}=global.__t1262.wrap(${n},"trade_routes","route:${n}");`;
 }
 if(rel==='server/zone.js'){
  const ast=A.parse(src,{ecmaVersion:'latest'});let tick;walk(ast,n=>{if(n.type==='CallExpression'&&n.callee.name==='setInterval'&&n.arguments[1]?.name==='TICK_MS')tick=n.arguments[0];});if(!tick)throw Error('tick missing');
  edits.push([tick.body.start+1,tick.body.start+1,'\nglobal.__t1262.frame();\n']);
  for(const n of tick.body.body){const text=src.slice(n.start,n.end);let cat,id;
   if(n.type==='IfStatement'&&/^if \(T689_GC\)/.test(text)&&text.includes('_decOne(')){cat='body_tick';id='body:decision';}
   if(n.type==='IfStatement'&&/^if \(T689_GC\)/.test(text)&&text.includes('_moveOne')){cat='body_tick';id='body:movement';}
   if(n.type==='ExpressionStatement'&&/^sepNpcs\(/.test(text)){cat='body_tick';id='body:separation';}
   if(n.type==='IfStatement'&&text.includes('global.__t1241Probe')){cat='observers';id='observer:body';}
   if(cat){edits.push([n.start,n.start,`{ const __t1262Token=global.__t1262.enter("${cat}","${id}");try{`],[n.end,n.end,'}finally{global.__t1262.leave(__t1262Token);}}']);patches.push(id);}
  }
  for(const id of ['body:decision','body:movement','body:separation','observer:body'])if(!patches.includes(id))throw Error('missing '+id);
  suffix+='\n_periodicSave=global.__t1262.wrap(_periodicSave,"storage","save:periodic");\n_desPulse=global.__t1262.wrap(_desPulse,"body_tick","body:events");';
  suffix+='\nglobal.__t1262.snapshot(()=>({players:players.size,npcs:npcs.size,held:_desQ?_desQ.owned.size:0}));\nprocess.on("exit",global.__t1262.finish);';
 }
 for(const[start,end,value]of edits.sort((a,b)=>b[0]-a[0]))src=src.slice(0,start)+value+src.slice(end);
 return compile.call(this,src+suffix,file);
};
