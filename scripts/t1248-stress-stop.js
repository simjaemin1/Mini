'use strict';
// Controlled-size real server fixture, uses normal T577_CAND_SEEDPOP spawning.
// No cloned actors and no per-body extrapolation. Must preload after observer.
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const target=+process.env.T1248_STRESS_N;if(!(target>0))return;
const fs=require('fs'),hr=process.hrtime.bigint,old=global.__t1248TickEnd;let n=0,done=false;const samples=[];
global.__t1248TickEnd=function(start,npcs){old(start,npcs);if(done||npcs.size!==target)return;const ms=Number(hr()-start)/1e6;if(++n>300)samples.push(ms);if(samples.length===1000){done=true;samples.sort((a,b)=>a-b);fs.writeFileSync(process.env.T577_OUT+'.stress.json',JSON.stringify({target,actualNPCs:npcs.size,warmupTicks:300,measuredTicks:1000,meanMs:samples.reduce((a,b)=>a+b,0)/samples.length,p50Ms:samples[500],p95Ms:samples[950],maxMs:samples[999],samples}));setImmediate(()=>process.exit(0));}};
