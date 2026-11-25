'use strict';
// Executable diagnosis, not the future T1482 product harness.
// Two real fights save identical product war+body bytes and diverge on the next step.
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process'), { createHash } = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
if (process.argv[2] === 'child') {
  console.log = () => {};
  Date.now = () => 1767225817471;
  const V = require(path.join(ROOT,'server/villages'));
  const WL = require(path.join(ROOT,'server/war-live')).createWarLive({ tickHz:30, cellPx:32, pxPerM:32 });
  const players = new Map(), villages = [1,2].map(i=>({
    name:'v'+i, dbId:i, npcPids:['p'+i], ccx:(i-1)*20, ccy:0,
    econ:{ name:'v'+i, npcs:[{id:'n'+i}], storage:{} }
  }));
  for (let i=1;i<=2;i++) players.set('p'+i, {pid:'p'+i,x:(i-1)*20*32,y:0,isNpc:true,hp:100,maxHp:100,_muster:true,simWar:true,simVillageId:i});
  const w = { id:44,born:428,phase:'battle',op:'assault',atk:villages[0],def:villages[1],composition:{archer:1},arrows:20 };
  const f = WL.makeFight(w);
  const ga = {pid:'p1',type:'archer'}, gb = {pid:'p2',type:'dagger'};
  WL.bindGroupUnit(ga,players.get('p1')); WL.bindGroupUnit(gb,players.get('p2'));
  const ua = WL.enlist(f,'A',ga,players.get('p1')), ub = WL.enlist(f,'B',gb,players.get('p2'));
  ua.ctl=false; ub.ctl=false; ua.mrl=1; ub.mrl=1;
  ua.cd=Number(process.argv[3]); ub.cd=100;
  f.state='engaged';f.physical=true;
  f.ctx.sides.A.arrows=20;
  const body={w,phase:'march',pids:['p1'],defPids:['p2'],atkGroup:{units:[ga]},defGroup:{units:[gb]},fight:f};
  const H=V.__p3Bind({deps:{players,npcs:new Set()},villages,world:{day:870,villages:villages.map(v=>v.econ)},
    war:{WARS:[w]},warBodies:new Map([[44,body]]),warLive:WL});
  H.state._t1340Shut=true;
  const bodyRows=villages.map(v=>H._t747Pack(v));
  assert(bodyRows.every(b=>b.rows[0].$all._muster===true),'T1340 whole body fields must actually be included');
  const saved=JSON.stringify({war:H._t1167Pack(),bodies:bodyRows});
  const before=ua.cd;
  const ev=WL.stepFight(f);
  process.stdout.write(JSON.stringify({saved,sha256:createHash('sha256').update(saved).digest('hex'),bytes:Buffer.byteLength(saved),beforeCd:before,
    after:{state:ua.st,cd:ua.cd,arrows:f.ctx.arrows.length,ammo:f.ctx.sides.A.arrows,x:players.get('p1').x,event:ev}})+'\n');
  process.exit(0);
}
const run = cd => JSON.parse(execFileSync(process.execPath,[__filename,'child',String(cd)],{cwd:ROOT,env:process.env,stdio:'pipe'}).toString());
const a=run(-1), b=run(4); // 4 seconds is inside the canonical archer cooldown (8s).
assert.equal(a.saved,b.saved,'actual stored text must be byte-identical');
delete a.saved; delete b.saved;
assert.equal(a.sha256,b.sha256,'real product save must collide');
assert.notDeepEqual(a.after,b.after,'next canonical fight step must differ');
assert.equal(a.after.arrows,1);assert.equal(b.after.arrows,0);
const result={kind:'synthetic information-loss witness; actual T1167 + T747/T1340 product serializers and war-live step',
  cases:[a,b],sameStoredBytes:true,differentNextStep:true,conclusion:'a restorer receiving only these bytes cannot recover both original fights'};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log('collision witness PASS: same product save hash, next-step flying arrows 1 / 0');
