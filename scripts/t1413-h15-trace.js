#!/usr/bin/env node
'use strict';
// Observe the unchanged checklist, including its preceding cases/RNG history.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const zlib=require('zlib');
const readTrace=file=>JSON.parse(file.endsWith('.gz')?zlib.gunzipSync(fs.readFileSync(file)):fs.readFileSync(file,'utf8'));
if(process.argv[2]==='--compare'){
  const a=readTrace(process.argv[3]),b=readTrace(process.argv[4]);
  const signature=r=>r&&[r.scenario,r.tick,r.randomCalls,r.hash];
  const index=Array.from({length:Math.max(a.rows.length,b.rows.length)},(_,i)=>i).find(i=>JSON.stringify(signature(a.rows[i]))!==JSON.stringify(signature(b.rows[i])));
  const firstField=(x,y,p='state')=>{if(Object.is(x,y))return null;if(!x||!y||typeof x!=='object'||typeof y!=='object')return {path:p,left:x,right:y};for(const k of [...new Set([...Object.keys(x),...Object.keys(y)])].sort()){const d=firstField(x[k],y[k],p+'.'+k);if(d)return d;}return null;};
  const result={sameSources:JSON.stringify(a.sourceHashes)===JSON.stringify(b.sourceHashes),nodes:[a.node,b.node],firstDivergentState:index==null?null:{index,left:signature(a.rows[index]),right:signature(b.rows[index]),field:a.rows[index]?.state&&b.rows[index]?.state?firstField(a.rows[index].state,b.rows[index].state):'rerun both traces with --at-index '+index},h15EventsEqual:JSON.stringify(a.events)===JSON.stringify(b.events),differentMathDigests:Object.keys(a.math).filter(k=>a.math[k]!==b.math[k])};
  console.log(JSON.stringify(result,null,2));process.exit(0);
}
const out=process.argv[2];if(!out)throw Error('output JSON required');
const atArg=process.argv.indexOf('--at-index'),dumpIndex=atArg<0?null:Number(process.argv[atArg+1]);
if(atArg>=0&&(!Number.isInteger(dumpIndex)||dumpIndex<0))throw Error('nonnegative trace index required');
let src=fs.readFileSync(path.join(__dirname,'..','sim','hunt-check.js'),'utf8');
const rows=[],events=[],math={},lines=[];let scenario='',tick=-1,randomCalls=0;
function sample(s){const atom=o=>Object.fromEntries(Object.keys(o).sort().filter(k=>o[k]===null||['string','number','boolean','undefined'].includes(typeof o[k])).map(k=>[k,o[k]]));const a={stats:atom(s),agents:s.agents.map(atom),mobs:s.mobs.map(atom)};return {hash:crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex'),state:a};}
const capture=(s,t,sp)=>{scenario=sp||'🦌';tick=t;const a=sample(s);rows.push({scenario,tick,randomCalls,hash:a.hash,...(rows.length===dumpIndex?{state:a.state}:{})});if(scenario==='🐯'&&(t===-1||(s._hDeadN||0)!==(events.at(-1)?.dead||0)))events.push({tick,dead:s._hDeadN||0,randomCalls,...a});};
const replace=(a,b)=>{if(src.split(a).length!==2)throw Error('anchor '+a);src=src.replace(a,b);};
replace('const acts={},lockSt={}',"__trace(s,-1,sp9);const acts={},lockSt={}");
replace('updateMobs(s,1);frames++;','updateMobs(s,1);frames++;__trace(s,t,sp9);');
// Math wrappers only record outputs; no rounding, reseeding, or rule changes.
replace('const RESULTS=[];',`const RESULTS=[];`);
const mathProxy=Object.create(Math);for(const k of Object.getOwnPropertyNames(Math)){if(typeof Math[k]==='function'&&k!=='random')Object.defineProperty(mathProxy,k,{value:(...args)=>{const v=Math[k](...args);const h=math[k]||(math[k]=crypto.createHash('sha256'));h.update(JSON.stringify([args,v]));return v;},writable:true});}
Object.defineProperty(mathProxy,'random',{get(){return this._random||Math.random;},set(fn){this._random=(...args)=>{randomCalls++;return fn(...args);};}});
const C={require,__dirname:path.join(__dirname,'..','sim'),global:null,Math:mathProxy,console:{log:(...a)=>lines.push(a.join(' '))},process:{env:process.env,exit:code=>{C.rc=code;}},__trace:capture};C.global=C;vm.createContext(C);vm.runInContext(src,C);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const result={node:process.version,platform:process.platform,arch:process.arch,mode:process.execArgv,mathProfiling:true,sourceHashes:{checklist:sha(path.join(__dirname,'..','sim','hunt-check.js')),lab:sha(process.env.HUNTLAB_HTML||path.join(__dirname,'..','lab','사냥실험실.html'))},rc:C.rc,rows,events,math:Object.fromEntries(Object.entries(math).map(([k,h])=>[k,h.digest('hex')])),output:lines};fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({node:result.node,platform:result.platform,arch:result.arch,sourceHashes:result.sourceHashes,rows:rows.length,rc:C.rc,h15:events.map(e=>({tick:e.tick,dead:e.dead,randomCalls:e.randomCalls,hash:e.hash,agents:e.state.agents.map(a=>({px:a.px,py:a.py,hp:a.hp}))}))},null,2));
