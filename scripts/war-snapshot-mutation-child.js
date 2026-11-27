'use strict';
const assert=require('assert'),crypto=require('crypto'),F=require('./lib-war-snap-fixture'),{semantic}=require('./test-war-snapshot');
const f=F.create(42);f.mobilize();f.day();for(let i=0;i<100;i++)f.tick();
assert.strictEqual(typeof f.H._warSnapPack,'function','new snapshot writer is required');
const source=f.at(()=>f.H._warSnapPack());assert(source,'active physical snapshot');
const baseline=semantic(source),s=JSON.parse(JSON.stringify(source)),kind=process.argv[2];
const fields=n=>new Map(Array.isArray(n.v)?n.v:[]),alter=(pred,key,value)=>{const n=s.graph.nodes.find(pred);assert(n,'mutant must hit its intended native object');n.v=n.v.filter(e=>e[0]!==key);if(value!==undefined)n.v.push([key,value]);};
if(kind==='defender')alter(n=>fields(n).has('atk')&&fields(n).has('casus'),'def');
else if(kind==='formations-only')alter(n=>fields(n).has('pids')&&fields(n).has('instantiated'),'fight');
else if(kind==='teleport')alter(n=>fields(n).get('_muster')===true&&fields(n).has('inventory'),'x',999999);
else if(kind==='cd')alter(n=>fields(n).has('side')&&fields(n).has('cd')&&fields(n).has('type'),'cd');
else if(kind==='rng')alter(n=>n.t==='fight','$rng');
else if(kind==='ignore-corruption')s.complete=false;
else assert.fail('unknown mutation');
if(kind!=='ignore-corruption')s.sha256=crypto.createHash('sha256').update(JSON.stringify(s.graph)).digest('hex');
try{f.at(()=>f.H._warSnapRestore(s));}catch(e){if(e.code==='WAR_SNAP_INVALID'||/^WAR_SNAP:/.test(e.message))assert.fail('serialized invariant rejected: '+kind);throw e;}
// A mutant reader that silently ignores an invalid field must still fail this independent contract.
assert(require('util').isDeepStrictEqual(fingerprint(f),baseline),'immediate native state must equal the complete saved state: '+kind);
function fingerprint(f){return f.at(()=>semantic(f.H._warSnapPack()));}
