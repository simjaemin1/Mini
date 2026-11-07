'use strict';
// Directive T1157: actual public stock and separate default-OFF branches.
const assert = require('node:assert/strict'), {execFileSync}=require('node:child_process');
if (!process.env.T1157_TEST_CHILD) {
  for (const mode of ['off','settle','eat','release','all']) {
    const env={...process.env,T1157_TEST_CHILD:mode,T1157_SETTLE_VAULT:'0',T1157_EAT_VAULT:'0',T1157_RELEASE_RESERVE:'0'};
    if(mode==='settle'||mode==='all')env.T1157_SETTLE_VAULT='1';
    if(mode==='eat'||mode==='all')env.T1157_EAT_VAULT='1';
    if(mode==='release'||mode==='all')env.T1157_RELEASE_RESERVE='1';
    process.stdout.write(execFileSync(process.execPath,[__filename],{env,encoding:'utf8'}));
  }
} else {
  const E=require('../sim/economy-sim-v2'), V=require('../sim/economy-sim'), P=E._t1157Probe;
  const v=E.createWorldV2({seed:1020,villageCount:7}).villages[0];
  const r='jade', before=v.storage[r]||0; v.treasury[r]=23;
  assert.equal(P.stock(v,r),before+(E.T1157_SETTLE_VAULT?23:0));
  const pub=v.treasury[r], total=before+pub;
  P.fund(v,r,before+7);
  assert.equal(v.treasury[r],pub-(E.T1157_SETTLE_VAULT?7:0));
  assert.equal(v.storage[r]+v.treasury[r],total);
  for(const k in v.storage)v.storage[k]=0;
  for(const k in v.treasury)v.treasury[k]=0;
  v.treasury.food=11; V.t1157Food(v,4);
  assert.equal(v.storage.food,V.T1157_EAT_VAULT?4:0);
  assert.equal(v.treasury.food,V.T1157_EAT_VAULT?7:11);
  v.storage.food=9; V.t1157Food(v,4); assert.equal(v.treasury.food,V.T1157_EAT_VAULT?7:11);
  v.storage.jade=1;v.treasury.jade=0;
  const c=P.cands(v).find(x=>x.res==='jade');
  assert.equal(!!c,E.T1157_RELEASE_RESERVE);
  if(c)assert.equal(c.surplus,1);
  console.log(process.env.T1157_TEST_CHILD+': 8 assertions passed');
}
