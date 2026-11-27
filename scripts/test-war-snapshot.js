#!/usr/bin/env node
// @bait 1
// @regress unit (native war host + separate-process resume; no browser)
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
function semantic(snapshot) {
  if (!snapshot) return null;
  const G = require('../server/war-snapshot'), refs = new Map();
  const ref = (key) => { if (!refs.has(key)) refs.set(key, { external: key }); return refs.get(key); };
  const data = G.unpack(snapshot, { types: ['fight', 'context', 'path', 'detour'], resolve: ref, pid: (key) => key, time: (t) => t });
  const seen = new Map();
  function walk(x) {
    if (x === undefined) return ['undefined']; if (typeof x === 'number' && (!Number.isFinite(x) || Object.is(x, -0))) return [String(x), Object.is(x, -0)];
    if (!x || typeof x !== 'object') return x;
    if (seen.has(x)) return ['ref', seen.get(x)]; seen.set(x, seen.size);
    if (x instanceof ArrayBuffer) return ['buffer', Buffer.from(x).toString('base64')];
    if (ArrayBuffer.isView(x)) return [x.constructor.name, x.byteOffset, x.length, walk(x.buffer)];
    if (x instanceof Map) return ['map', [...x].map(([k,v])=>[walk(k),walk(v)])];
    if (x instanceof Set) return ['set', [...x].map(walk)];
    if (Array.isArray(x)) return x.map(walk);
    return Object.fromEntries(Object.keys(x).filter(k=>k!=='_stepMs'&&k!=='at'&&k!=='nextPid'&&k!=='bodyIds').sort().map(k=>[k,walk(x[k])]));
  }
  return walk(data);
}
function fingerprint(f) {
  return f.at(() => semantic(f.H._warSnapPack()) || { wars: f.war.WARS.length, bodies: f.H.state.warBodies.size, stats: f.world._warStats,
    people: f.villages.map(v=>v.econ.npcs.map(n=>[n.id,n.currentJob,n._warDraft])), players: f.villages.flatMap(v=>v.npcPids.map((pid,i)=>{const p=f.deps.players.get(pid);return [v.dbId,i,p&&p.x,p&&p.y,p&&p.hp,p&&p._muster,p&&p.simCaptive];})) });
}
if (process.argv[2] === '--child') {
  const [mode, stage, seedText, file] = process.argv.slice(3), seed = +seedText;
  const F = require('./lib-war-snap-fixture'); let saved = mode === 'resume' ? JSON.parse(fs.readFileSync(file)) : null;
  const f = F.create(seed, { saved, hold: stage === 'siege' || stage === 'capture' || stage === 'return', next: mode === 'resume' ? 300 : 1 });
  const gates={};f.H._warSnapObserve((kind)=>{gates[kind]=(gates[kind]||0)+1;});
  const BC=require('../sim/battle-core'),battleStep=BC._stepBattle;let battleSteps=0,dtSum=0,shots=0,temporaryRanged=0;
  BC._stepBattle=function(ctx,dt){battleSteps++;dtSum+=dt;const before=(ctx.sides.A.arrows||0)+(ctx.sides.B.arrows||0);for(const u of ctx.units)if(u.hp>0&&BC.UNITS[u.type].ranged>0&&!u.ctl)temporaryRanged++;const r=battleStep.apply(this,arguments);shots+=Math.max(0,before-(ctx.sides.A.arrows||0)-(ctx.sides.B.arrows||0));return r;};
  const logs = []; const log = console.log; console.log = (...a)=>logs.push(a.join(' '));
  if (mode === 'resume') { f.at(()=>f.H._warSnapRestore(saved.snapshot)); }
  else {
    const w = f.mobilize(stage === 'siege' || stage === 'capture' || stage === 'return' ? 'siege' : 'assault');
    let found = stage === 'muster';
    if (stage === 'march') { f.tick(); found = true; }
    for (let d=0; !found && d<30; d++) {
      for (let t=0;t<900&&!found;t++) {
        f.tick();const b=f.H.state.warBodies.get(w.id), fight=b&&b.fight;
        if (stage==='fight' && fight && fight.ctx.arrows.length>0) found=true;
        if (stage==='siege' && w.op==='siege' && b && b.pids.length) found=true;
        if (stage==='return' && b && b.phase==='return') found=true;
        if (stage==='capture' && f.war.stats().surrender>0 && b) found=true;
      }
      if (!found) {
        // Fixture inputs change through native logistics/policy before the native daily decision.
        if (stage==='capture' && d>=2) {
          const e=f.villages[1].econ;
          for(const k of Object.keys(e.storage)) if(/food|rice|fish|meat|barley|millet|wheat|vegetable|fruit|weapon|armor/.test(k)) e.storage[k]=0;
          e.counts={farmer:e.npcs.length}; for(const n of e.npcs)n.currentJob='farmer';
        }
        f.day();
      }
    }
    assert(found,'native phase not exposed: '+stage+' '+JSON.stringify({phase:w.phase,op:w.op,stats:f.war.stats()}));
    saved={day:f.world.day,now:f.now(),snapshot:f.at(()=>f.H._warSnapPack()), econs:f.villages.map(v=>f.H.serializeEcon(v.econ))};
    assert(saved.snapshot,'checkpoint requires a real active war/body');
    saved.exposure={nativeWarPhase:w.phase,nativeOp:w.op,bodies:f.H.state.warBodies.size,groups:[...f.H.state.warBodies.values()].map(b=>[b.atkGroup?.units.length||0,b.defGroup?.units.length||0,b.retGroup?.units.length||0]),contexts:[...f.H.state.warBodies.values()].map(b=>b.fight?{units:b.fight.ctx.units.length,arrows:b.fight.ctx.arrows.length,state:b.fight.state,physical:b.fight.physical}:null)};
    saved.immediate=fingerprint(f); fs.writeFileSync(file,JSON.stringify(saved));
  }
  assert.deepStrictEqual(fingerprint(f),saved.immediate,'immediate whole-state fingerprint');
  const days=[];
  for(let d=0;d<10;d++){for(let i=0;i<900;i++)f.tick(); f.day();days.push(fingerprint(f));}
  fs.writeFileSync(file+'.'+mode+'.json',JSON.stringify({days,protocol:{hostTicksAfterCheckpoint:9000,hostDtMs:1000/30,gameDays:10,dayMs:30000,dailyOrder:'_t681Flush -> world.day++ -> war.daily -> _warAfterDaily -> _t681Day',battleSteps,dtSum,shots,temporaryRanged,gates,exposure:saved.exposure}, events:f.events.filter(e=>e.type==='arrow_spawn').length, logs:logs.slice(-3)}));
  console.log=log;console.log(JSON.stringify({mode,stage,seed,day:saved.day,complete:true}));
  process.exit(0);
}
function run() {
  process.env.T1497_WAR_SNAP='1';
  try{assert.strictEqual(typeof require('../server/villages').__p3Bind({})._warSnapPack,'function','complete snapshot product API');}catch(e){console.error('✗ complete snapshot product API absent');throw e;}
  process.env.T1497_WAR_SNAP='1';
  const dir=process.env.WAR_SNAP_TEST_OUT || require('./lib-tmp').dir('war_snapshot');fs.mkdirSync(dir,{recursive:true});
  const results=[];
  for(const bound of ['1','0'])for(const seed of [7,42])for(const stage of ['muster','march','siege','fight','return','capture']){
    const file=path.join(dir,`${bound}-${seed}-${stage}.json`),env={...process.env,T1445_BOOT_BOUND:bound};
    for(const mode of ['continuous','resume']){
      const r=cp.spawnSync(process.execPath,[__filename,'--child',mode,stage,String(seed),file],{cwd:ROOT,env,encoding:'utf8',timeout:120000,maxBuffer:2e6});
      fs.writeFileSync(file+'.'+mode+'.log',r.stdout+r.stderr);
      assert.strictEqual(r.status,0,`${bound}/${seed}/${stage}/${mode}: ${String(r.stderr).slice(-1200)}`);
    }
    const a=JSON.parse(fs.readFileSync(file+'.continuous.json')),b=JSON.parse(fs.readFileSync(file+'.resume.json'));
    assert.deepStrictEqual(b.days,a.days,`10-day future ${bound}/${seed}/${stage}`);
    results.push({bound,seed,stage,immediate:true,days:10});
  }
  const mutants=[];
  for(const name of ['defender','formations-only','teleport','cd','rng','ignore-corruption']){
    const r=cp.spawnSync(process.execPath,[path.join(__dirname,'war-snapshot-mutation-child.js'),name],{cwd:ROOT,env:{...process.env,T1497_WAR_SNAP:'1'},encoding:'utf8',timeout:30000,maxBuffer:1e6});
    const red=r.status===1&&/AssertionError \[ERR_ASSERTION\]/.test(r.stderr)&&!/(TypeError:|ReferenceError:|RangeError:|FATAL ERROR)/.test(r.stderr);
    fs.writeFileSync(path.join(dir,'mutant-'+name+'.log'),r.stdout+r.stderr);mutants.push({name,assertRed:red,crash:!red,status:r.status});
    assert(red,'미끼 · 바꾼 자리: '+name+' must fail the independent native-state assertion');
  }
  fs.writeFileSync(path.join(dir,'mutants.json'),JSON.stringify(mutants,null,2));
  fs.writeFileSync(path.join(dir,'matrix.json'),JSON.stringify(results,null,2));
  console.log(`✓ WAR_SNAP native phase matrix ${results.length}/24; immediate and 10 daily fingerprints equal. ${dir}`);
}
if(require.main===module)run();module.exports={semantic,fingerprint};
