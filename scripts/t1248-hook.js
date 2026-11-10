'use strict';
const path = require('path'), fs = require('fs');
const root = process.env.T1248_ROOT || path.resolve(__dirname, '..');
require(path.join(root, 'scripts/t1241-hook'));
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1] || '')) return;
const realTime = process.hrtime.bigint, started = realTime(), cpu = process.cpuUsage();
const tickBench = process.env.T1248_TICK_BENCH === '1';
const tickWall = [], tickCpu = []; let tickCalls = 0, framePlayers = null;
const tickLimit=Number(process.env.T1248_BENCH_TICKS||0),warmup=Number(process.env.T1248_BENCH_WARMUP||300);
let eligibleTicks=0,measuredTicks=0,fixtureStop=false;
if (tickBench) {
  const Module = require('module'), compile = Module.prototype._compile;
  const probe = global.__t1241Probe;
  global.__t1241Probe = (now, players) => { framePlayers = players; if (probe) probe(now, players); };
  global.__t1248TickWrap = fn => function () {
    const sample = (++tickCalls % 256) === 0 || tickLimit > 0, cpu0 = sample ? process.cpuUsage() : null, t0 = realTime();
    try { return fn.apply(this, arguments); }
    finally {
      const wallMs = Number(realTime() - t0) / 1e6, n = framePlayers ? framePlayers.size : 0;
      const eligible=n>=Number(process.env.T1248_EXPECT_N||0)*.9;
      if(eligible)eligibleTicks++;
      const keep=!fixtureStop&&(!tickLimit||(eligible&&eligibleTicks>warmup));
      if(keep)tickWall.push([n, wallMs]);
      if (sample && keep) { const c = process.cpuUsage(cpu0); let owned = 0; if (framePlayers) for (const b of framePlayers.values()) if (b._des) owned++;
        tickCpu.push({ bodies:n, owned, cpuMs:(c.user+c.system)/1000, wallMs }); }
      if(keep&&tickLimit&&++measuredTicks>=tickLimit){fixtureStop=true;process.kill(process.pid,'SIGTERM');}
    }
  };
  Module.prototype._compile = function (text, filename) {
    if (filename === path.join(root,'server/zone.js')) {
      const at = text.indexOf('const TICK_MS = 1000 / TICK_HZ;'), start = text.indexOf('setInterval(() => {',at), end = text.indexOf('}, TICK_MS);',start);
      if (at < 0 || start < 0 || end < 0) throw Error('T1248 full tick observation anchor missing');
      const part = text.slice(start,end+'}, TICK_MS);'.length).replace('setInterval(() => {','setInterval(global.__t1248TickWrap(() => {').replace('}, TICK_MS);','}), TICK_MS);');
      text = text.slice(0,start)+part+text.slice(end+'}, TICK_MS);'.length);
    }
    return compile.call(this,text,filename);
  };
}
function benchSummary() {
  if (!tickBench) return null;
  const expected = Number(process.env.T1248_EXPECT_N || 0), minimum = expected * .9;
  const cpu = tickCpu.filter(x=>x.bodies>=minimum), wall = tickWall.filter(x=>x[0]>=minimum);
  const summarize = values => { values.sort((a,b)=>a-b);return values.length?{samples:values.length,medianMs:values[values.length>>1],p95Ms:values[Math.floor(values.length*.95)],maxMs:values.at(-1),meanMs:values.reduce((a,b)=>a+b,0)/values.length}:null; };
  return { expected, fixtureStop,window:tickLimit?{warmup,requestedTicks:tickLimit,measuredTicks}:null, actualBodies:cpu.length?{min:Math.min(...cpu.map(x=>x.bodies)),max:Math.max(...cpu.map(x=>x.bodies))}:null, cpu:summarize(cpu.map(x=>x.cpuMs)),wall:summarize(wall.map(x=>x[1])),rawCpuSamples:cpu };
}
const output = process.env.T1248_TRACE;
if (!output) throw Error('T1248_TRACE required');
let profile = null;
if (process.env.T1248_CPU_PROFILE) {
  const { Session } = require('node:inspector'); profile = new Session(); profile.connect();
  profile.post('Profiler.enable',()=>profile.post('Profiler.start'));
}
fs.writeFileSync(output, '');
const R6 = v => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v;
const stor = st => Object.fromEntries(Object.keys(st || {}).sort().map(k => [k,R6(st[k])]));
const Ev = require(path.join(root,'server/events')), make = Ev.createLedger;
let last = -1;
Ev.createLedger = function () {
  const ledger = make.apply(this,arguments), scan = ledger.scanDay;
  ledger.scanDay = function (world,day) {
    if (profile && day >= 3) { const session=profile;profile=null;
      session.post('Profiler.stop',(error,result)=>{if(error)throw error;fs.writeFileSync(process.env.T1248_CPU_PROFILE,JSON.stringify(result.profile));session.disconnect();});
    }
    if ((day|0) !== last) { last = day|0;
    const villages = (world.villages || []).map(v => ({ name:v.name, parts:[stor(v.storage),[(v.npcs||[]).length,(v.npcs||[]).map(n=>n&&typeof n==='object'?[n.id!=null?n.id:n.pid,R6(n.age),n.currentJob||null,R6(n.hunger),R6(n.hp)]:n)],[R6(v.housing),v.expansions||0,v._banditized?1:0],v.treasury&&typeof v.treasury==='object'?stor(v.treasury):R6(v.treasury)] }));
    fs.appendFileSync(output,JSON.stringify({day:day|0,villages})+'\n');
    }
    return scan.apply(this,arguments);
  };
  return ledger;
};
process.on('exit',code=>{
  const used=process.cpuUsage(cpu);
  fs.writeFileSync(output+'.meta.json',JSON.stringify({code,cpuSeconds:(used.user+used.system)/1e6,wallSeconds:Number(realTime()-started)/1e9,stats:global.__t1241Stat||{},tickBenchmark:benchSummary(),clock:global.__t745?global.__t745():null},null,2));
});
