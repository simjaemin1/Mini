#!/usr/bin/env node
// @regress
// @bait 2
'use strict';
// Actual daily opening -> body cut/delivery -> closing -> next opening.
// Every worker starts a fresh module cache; baits alter the loaded production file.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.argv.includes('--worker')) {
  const bait = process.env.T1516_BAIT;
  if (bait) {
    const Module = require('module'), original = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, file) {
      if (file !== path.join(ROOT, 'server/villages.js')) return original(m, file);
      let src = fs.readFileSync(file, 'utf8');
      const needle = bait === 'early'
        ? 'if (T1516_BODY_FIRST && _lifeEcon().T325_WOOD_ACT) {'
        : 'return _lifeEcon().woodDemandLeft(vil.econ, _t374Held(vil, _T374_WOOD));';
      assert.strictEqual(src.split(needle).length - 1, 1, 'exactly one bait site');
      src = src.replace(needle, bait === 'early' ? 'if (false) {' : 'return _lifeEcon().woodDemandLeft(vil.econ);');
      process.stderr.write('T1516_BAIT_SITES=1\n');
      m._compile(src, file);
    };
  }
  const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2');
  const V = require('../server/villages'), P = V.__labProbe;
  const scenario = process.env.T1516_CASE || 'flow';
  const on = process.env.T1516_BODY_FIRST === '1' && E.T325_WOOD_ACT;
  const DAY = 1440000, D = 20, now = D * DAY + DAY * 0.35;
  const ccx = 400, ccy = 400, players = new Map(), trees = new Map();
  if (scenario !== 'noTrees') for (let i = 0; i < 12; i++) trees.set((ccx + 6) + ',' + (ccy + i), 3);
  let cut = 0;
  const deps = { players, broadcast() {}, moveSpeed: 64, dayPhaseRatio: 0.7,
    worldPhase: () => 0.35, anyViewerNear: () => false,
    t325TreesAtCell: (cx, cy) => Array.from({ length: trees.get(cx + ',' + cy) || 0 }, (_, i) => ({ seedKey: cx + '_' + cy + '_' + i })),
    t325CutTreeAt: (cx, cy) => { const k = cx + ',' + cy, n = trees.get(k) || 0; if (!n) return null; trees.set(k, n - 1); cut++; return { wood: 6 }; },
    t325LootOf: () => ({ wood: 6 }), t341Unharvest: () => 0 };
  P._t400Probe.setup({ deps, db: { insertVillageBuilding: () => 1 }, dayMs: DAY, epoch: 0,
    zoneId: 't1516', tickCtx: { now } });
  const world = E2.createWorldV2({ seed: 42, villageCount: 1 });
  E.bindProductionActs(world);
  P._t400Probe.setup({ world });
  const econ = world.villages[0];
  econ.storage = { wood: 0 }; econ.treasury = {}; econ.counts = { lumberjack: scenario === 'noWorkers' ? 0 : 3 };
  econ._woodOutLast = scenario === 'noDemand' ? 0 : scenario === 'fractional' ? 7 : 12;
  econ._t325Cells = trees.size; econ._t325InflowToday = 0;
  const vil = { dbId: 7, name: 'wood', ccx, ccy, econ, npcPids: [],
    _terrSet: new Set([ccx + ',' + ccy]), _farmSet: new Set(), _drySet: new Set(), _potSet: new Set(),
    _crop: new Map(), _cropClaim: new Set(), _claim: new Set(), _site: null, _houseCells: [], _granList: [], _maxRPx: 200 };
  const npc = { pid: 1, isNpc: true, simJob: 'lumberjack', simVillageId: 7,
    x: (ccx + 6) * 32 + 16, y: ccy * 32 + 16, hp: 100, maxHp: 100,
    npcHomeX: ccx * 32, npcHomeY: ccy * 32, inventory: {}, simLonOff: 0 };
  if (scenario !== 'noWorkers' && scenario !== 'noBodies') { players.set(1, npc); vil.npcPids.push(1); }
  if (scenario === 'boundary') vil._t731Day = D;
  P._memberProbe.setup({}, [vil]);
  P._t717Probe.daily(vil);
  const openingCuts = cut;
  if (on) assert.strictEqual(openingCuts, 0, 'body gets the first turn before batch cuts');
  if (!on || ['noDemand', 'noTrees', 'noWorkers', 'offAct', 'offLife'].includes(scenario)) {
    if (on) P._t717Probe.handsIn(vil);
    if (scenario === 'noDemand' || scenario === 'noTrees' || scenario === 'noWorkers' || scenario === 'offAct' || scenario === 'offLife') assert.strictEqual(cut, 0);
    console.log(JSON.stringify({ openingCuts, cut, inflow: econ._t325InflowToday }));
    return;
  }
  if (scenario === 'noBodies') {
    P._t717Probe.handsIn(vil);
    assert.strictEqual(cut, 2, 'bodiless crew still fills the shortage at closing');
    assert.strictEqual(econ._t325InflowToday, 12);
    console.log(JSON.stringify({ openingCuts, cut, inflow: econ._t325InflowToday }));
    return;
  }
  if (scenario === 'held' || scenario === 'heldFull') {
    const held = scenario === 'heldFull' ? 18 : 6;
    npc.inventory.wood = held; npc._t717L = held;
    econ._t717Pack = 10;
    P._t717Probe.handsIn(vil);
    assert.strictEqual(econ._t325InflowToday, held > 12 ? 0 : 6, 'batch leaves the carried body share available');
    assert.strictEqual(econ._t717Pack, held > 12 ? 10 : 4, 'stored batch surplus is conserved');
    assert.strictEqual(npc.inventory.wood, held, 'closing never teleports the body cargo');
    assert.strictEqual(cut, 0, 'existing pack fills only the uncovered shortage');
    P._t717Probe.deliver(vil, npc);
    assert.strictEqual(econ._t325InflowToday, 12);
    assert.strictEqual(npc.inventory.wood, held > 12 ? held - 12 : 0);
  } else {
    V.npcLifeTick(npc, now);
    assert.strictEqual(cut, 1, 'a body really cuts a standing tree');
    assert.strictEqual(npc.inventory.wood, 6);
    assert.strictEqual(P._t717Probe.deliver(vil, npc), 6);
    P._t717Probe.handsIn(vil);
    assert.strictEqual(cut, 2, 'batch cuts only the six-unit shortage');
    if (scenario === 'boundary') assert.strictEqual(vil._t325Dbg.N, 35, 'local-day closing rescans after the body cut');
    const demand = scenario === 'fractional' ? 7 : 12;
    assert.strictEqual(econ._t325InflowToday, demand);
    assert.strictEqual((econ.storage.wood || 0) + (econ.treasury.wood || 0), demand);
    assert.strictEqual(econ._t717Pack || 0, 12 - demand, 'whole-tree surplus stays in the pack');
    P._t717Probe.handsIn(vil);
    assert.strictEqual(cut, 2, 'repeated close cannot produce beyond the same demand');
    econ._t325InflowToday = 0;
    P._t717Probe.daily(vil);
    assert.strictEqual(cut, 2, 'next opening again leaves the first turn to bodies');
    assert.strictEqual(P._t374Probe.done(vil, 'lumberjack'), false);
  }
  console.log(JSON.stringify({ openingCuts, cut, inflow: econ._t325InflowToday }));
  return;
}

let pass = 0, fail = 0;
function run(flag, scenario = 'flow', bait, extra = {}) {
  const env = { ...process.env, ENABLE_VILLAGES: '0', VILLAGE_LIFE: scenario === 'offLife' ? '0' : '1', T325_WOOD_ACT: scenario === 'offAct' ? '0' : '1',
    T312_FISH_ACT: '0', T347_FORAGE_ACT: '0', T400_BUILD_ACT: '0', T449_BODY_DAY: '0',
    T491_BATCH_FROM_BODY: '0', T561_ROSTER_BODY: '1', T374_DEMAND_STOP: '1',
    T720_LON_DAY: '1', T1516_CASE: scenario, ...extra };
  delete env.T1516_BODY_FIRST; delete env.T1516_BAIT;
  if (flag !== undefined) env.T1516_BODY_FIRST = flag;
  if (bait) env.T1516_BAIT = bait;
  return spawnSync(process.execPath, [__filename, '--worker'], { cwd: ROOT, env, encoding: 'utf8' });
}
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }
for (const flag of [undefined, '0', '', 'false']) check('default OFF ' + String(flag), () => {
  const r = run(flag); assert.strictEqual(r.status, 0, r.stderr);
  assert(JSON.parse(r.stdout.trim().split('\n').at(-1)).openingCuts > 0, 'legacy opening remains active');
});
for (const scenario of ['flow', 'held', 'heldFull', 'noBodies', 'boundary', 'fractional', 'noDemand', 'noTrees', 'noWorkers', 'offAct', 'offLife']) check('ON ' + scenario, () => {
  const r = run('1', scenario); assert.strictEqual(r.status, 0, r.stderr);
});
check('ON with legacy hand delivery', () => {
  const r = run('1', 'flow', undefined, { T720_LON_DAY: '0' });
  assert.strictEqual(r.status, 0, r.stderr);
});
function assertBait(bait, scenario) {
  const r = run('1', scenario, bait);
  assert.notStrictEqual(r.status, 0);
  assert(r.stderr.includes('T1516_BAIT_SITES=1'), 'bait really changed one production site');
  assert(r.stderr.includes('AssertionError'), r.stderr);
  assert(r.stderr.includes(bait === 'early' ? 'body gets the first turn before batch cuts' : 'batch leaves the carried body share available'), 'intended outcome assertion bites');
}
check('미끼 early — 바꾼 자리 1곳: 일괄을 앞당기면 몸 차례 단언 빨강', () => assertBait('early', 'flow'));
check('미끼 held — 바꾼 자리 1곳: 운반 중인 몫을 빼면 보존 단언 빨강', () => assertBait('held', 'held'));
console.log(`PASS ${pass} FAIL ${fail}`);
process.exitCode = fail ? 1 : 0;
