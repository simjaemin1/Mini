#!/usr/bin/env node
// @regress unit
// @bait 1
'use strict';
process.env.T1497_WAR_SNAP='1';
const assert=require('assert'),F=require('./lib-war-snap-fixture'),BC=require('../sim/battle-core'),{semantic}=require('./test-war-snapshot'),u=require('util');
try{assert.strictEqual(typeof require('../server/villages').__p3Bind({})._warSnapPack,'function','complete snapshot product API');}catch(e){console.error('✗ complete snapshot product API absent');throw e;}
let pass=0;function check(name,fn){try{fn();}catch(e){console.error('✗ '+name);throw e;}pass++;console.log('✓ '+name);}
function roundtrip(f){const s=f.at(()=>f.H._warSnapPack()),a=semantic(s);f.at(()=>f.H._warSnapRestore(s));assert(u.isDeepStrictEqual(semantic(f.at(()=>f.H._warSnapPack())),a),'entire native graph after rebind');}
check('wounded soldier and dead commander through native damage door',()=>{
 const f=F.create(42);f.mobilize();f.day();for(let i=0;i<100;i++)f.tick();const b=[...f.H.state.warBodies.values()][0],ctx=b.fight.ctx;
 const leader=b.atkGroup.commander.bu,other=ctx.units.find(x=>x.side==='A'&&x!==leader);assert(leader&&other);
 BC._hurt(ctx,other,10,other.x+1,other.y,'melee',0);assert(other.hp>0&&other.hp<other.maxHp);
 BC._hurt(ctx,leader,1e6,leader.x+1,leader.y,'melee',0);assert(leader.hp<=0);f.tick();roundtrip(f);
});
check('two native mobilizations from one village keep distinct war/unit identities',()=>{
 const f=F.create(7);f.mobilize();f.mobilize();f.tick();assert.strictEqual(f.war.WARS.length,2);assert.strictEqual(f.H.state.warBodies.size,2);roundtrip(f);
 const [a,b]=[...f.H.state.warBodies.values()];assert.notStrictEqual(a.fight,b.fight);assert(!a.pids.some(p=>b.pids.includes(p)));
});
check('detached corpse body is restored with its exit and WeakMap records',()=>{
 const f=F.create(42);f.mobilize();f.tick();const p={pid:'p1000',isNpc:true,x:2200,y:3100,hp:0,maxHp:100,isDown:true,_bxExit:'died',inventory:{},_t1145S:-1};f.deps.players.set(p.pid,p);
 f.H.state.bodyExits.set(p.pid,{pid:p.pid,cat:'died',untilDay:403,t0:f.now()});const s=f.at(()=>f.H._warSnapPack());f.deps.players.delete(p.pid);f.H.state.bodyExits.clear();f.at(()=>f.H._warSnapRestore(s));
 const restored=[...f.H.state.bodyExits.keys()][0];assert(f.deps.players.has(restored));assert.strictEqual(f.deps.players.get(restored).hp,0);assert.strictEqual(f.deps.players.get(restored).x,2200);
});
check('미끼 · 바꾼 자리: unregistered human/den/cross-zone callbacks must be rejected',()=>{
 for(const kind of ['human','den','cross']){const f=F.create(42);f.mobilize();f.tick();const b=[...f.H.state.warBodies.values()][0];
 if(kind==='human'){const p={pid:'human',x:3200,y:3200,hp:100,isNpc:false};f.deps.players.set(p.pid,p);f.live.enlist(b.fight,'A',{pid:p.pid,type:'archer'},p);}else b.w.def[kind==='den'?'_den':'_xz']=true;
 assert.throws(()=>f.at(()=>f.H._warSnapPack()),/unsupported/);
 }
});
console.log(`WAR_SNAP corners ${pass}/4`);
