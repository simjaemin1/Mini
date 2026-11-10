'use strict';
// Read-only T1248 observer. Load before t745-vclock; never changes game inputs.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const root=path.join(__dirname,'..'),out=process.env.T577_OUT+'.t1248.jsonl',hr=process.hrtime.bigint;
const hash=s=>crypto.createHash('sha1').update(s).digest('hex').slice(0,12);
const r6=v=>typeof v==='number'?Math.round(v*1e6)/1e6:v;
const storage=s=>{const o={};for(const k of Object.keys(s||{}).sort())o[k]=r6(s[k]);return o;};
const write=o=>fs.appendFileSync(out,JSON.stringify(o)+'\n');
let V=null,last=-1,cpu0=process.cpuUsage();
const Ev=require(path.join(root,'server/events')),make=Ev.createLedger;
Ev.createLedger=function(){const l=make.apply(this,arguments),scan=l.scanDay;l.scanDay=function(world,day){if(day!==last){last=day;const all=[],villages=[];
for(const v of world.villages||[]){const parts=[JSON.stringify(storage(v.storage)),JSON.stringify([(v.npcs||[]).length,(v.npcs||[]).map(n=>n&&typeof n==='object'?[n.id!=null?n.id:n.pid,r6(n.age),n.currentJob||null,r6(n.hunger),r6(n.hp)]:n)]),JSON.stringify([r6(v.housing),v.expansions||0,v._banditized?1:0]),JSON.stringify(v.treasury&&typeof v.treasury==='object'?storage(v.treasury):r6(v.treasury))];all.push(v.name,...parts);villages.push({name:v.name,fields:parts.map(hash),raw:(day<5||day===+process.env.T1248_DUMP_DAY)?parts:undefined});}
const cpu=process.cpuUsage(cpu0);cpu0=process.cpuUsage();write({day,worldDay:world.day,hash:hash(all.join('\n')),villages,cpuSec:(cpu.user+cpu.system)/1e6,stats:global.__t1241Stat||null,runtime:global.__t1248Runtime?.stats()||null});}return scan.apply(this,arguments);};return l;};
// Preserve the existing position checkpoints and clock calibration.
require('./t1241-hook');const probe=global.__t1241Probe;let next=0,done=new Set();
global.__t1241Probe=function(now,players){if(probe)probe(now,players);if(now<next)return;next=now+1000;if(!V)V=require(path.join(root,'server/villages'));const day=V.econDay();if(day==null||day%10||done.has(day))return;const z=require(path.join(root,'server/zone-config'));const vs=V.__labProbe._t740Probe.setup()?.villages||[];if(!vs.length)return;const fv=z.phaseAdd(z.worldPhase(now),vs[0]._lonOff||0);if(fv<.35||fv>=.5)return;done.add(day);const bodies=[];for(const p of players.values())if(p.isNpc&&p.simVillageId){const s=p._des,r=s&&s.r,q=r?r.posAt(now,{}):p;bodies.push([String(p._sh??p.pid),q.x,q.y,p.simJob||'']);}bodies.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);write({checkpoint:day,now,fv,bodies});};
process.on('exit',()=>write({exit:true,clock:'real process.hrtime.bigint retained before vclock',at:Date.now()}));
// The same tick body, with two retained real-clock reads and no state writes.
// Count actual NPCs periodically; never multiply a per-body cost by a target N.
const Module=require('module'),compile=Module.prototype._compile,ticks={n:0,sumMs:0,maxMs:0,samples:[],population:{}};
let bodyCount=0;
global.__t1248TickStart=()=>hr();
global.__t1248TickEnd=(start,npcs)=>{const ms=Number(hr()-start)/1e6;ticks.n++;ticks.sumMs+=ms;ticks.maxMs=Math.max(ticks.maxMs,ms);if(ticks.n%300===1)bodyCount=npcs.size;const key=String(bodyCount),b=ticks.population[key]||(ticks.population[key]={n:0,sumMs:0});b.n++;b.sumMs+=ms;if(ticks.n%100===1)ticks.samples.push(ms);};
Module.prototype._compile=function(source,filename){if(filename===path.join(root,'server/zone.js')){const a='  const _tickHr0 = process.hrtime();',b='  { const _h = process.hrtime(_tickHr0);';if(!source.includes(a)||!source.includes(b))throw Error('T1248 tick observation anchor missing');source=source.replace(a,'  const _t1248RealTickStart=global.__t1248TickStart();\n'+a).replace(b,'  global.__t1248TickEnd(_t1248RealTickStart,npcs);\n'+b);}return compile.call(this,source,filename);};
process.on('exit',()=>write({tickTiming:ticks,units:'ms',sampleEvery:100,actualNPCCounts:true}));
