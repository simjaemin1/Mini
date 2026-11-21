#!/usr/bin/env node
// @regress
// @bait 2
// Real village task/need path: memo reuse, changing geometry, and live crew membership.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
if (process.argv.includes('--child')) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't1411-'));
  require('./lib-tmp').own(dir);
  process.env.DB_PATH = path.join(dir, 'world.db');
  process.env.ENABLE_VILLAGES = '0';
  const bait = process.env.T1411_BAIT;
  if (bait) {
    const Module = require('module'), load = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, file) {
      if (file !== path.join(ROOT, 'server/villages.js')) return load(m, file);
      let src = fs.readFileSync(file, 'utf8');
      const from = bait === 'size' ? 'm.size === own.size' : 'm.nb === nb';
      const count = src.split(from).length - 1;
      assert.strictEqual(count, 1, 'exactly one mutation site');
      src = src.replace(from, 'true');
      console.log('MUTATION_SITES=' + count);
      m._compile(src, file);
    };
  }
  const V = require('../server/villages'), E = require('../sim/economy-sim');
  const C = require('../server/terr-cost'), P = V.__labProbe, S = V.__p3Bind({}).state;
  const cellCost = C.cellCost;
  let calls = 0;
  C.cellCost = function () { calls++; return cellCost.apply(this, arguments); };
  function fixture(extra = false) {
    P._t1238Probe.clearLand();
    const own = new Set();
    for (let x = 997; x <= 1003; x++) for (let y = 997; y <= 1003; y++) own.add(x + ',' + y);
    const e = E.createVillage({ name: 'memo', initialPop: 40, fertility: .6, water: .5, wood: .6, stone: .4, game: .4, ore: 0, size: 100 });
    const v = { dbId: 1, name: 'memo', ccx: 1000, ccy: 1000, _terrSet: own, _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
      _houseCells: [], _granList: [], _ditch: [], _site: null, _psite: null, npcPids: [], _crop: new Map(), econ: e };
    const players = new Map();
    for (const pid of (extra ? ['one', 'two', 'three'] : ['one'])) {
      players.set(pid, { pid, isNpc: true, hp: 100, maxHp: 100, inventory: {}, x: 32016, y: 32016, simVillageId: 1, simJob: 'farmer' });
      v.npcPids.push(pid);
    }
    const ta = { isBlocked: () => false, isRock: () => false, isWater: () => false, fert: () => .5, forestMult: () => 1 };
    const deps = { players, dayPhaseRatio: .7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {}, t325TreesAtCell: () => [], clearTreesInCells: () => 0 };
    P._t569Probe.setup({ ta, villages: [v], db: null });
    P._t400Probe.setup({ deps, dayMs: 1440000, world: { day: 23, villages: [e] } });
    P._t1238Probe.setup({ villages: [v], day: 23 });
    E.bindProductionActs(S.world); e._world = S.world; e.storage.wood = 400;
    V._t1207Queue(v, extra ? ['1004,1000', '1004,1001', '1004,1002'] : ['1004,1000']);
    const j = v._t1207Pend[0]; j.workMs = j.laborMin * 1440000 / 1440;
    calls = 0;
    const task = P._t1181Probe.task(v, players.get('one'));
    assert(task && task.site === j, 'actual territory task is selected');
    return { v, e, own, players, j, task };
  }
  function need(F) { return F.task.need().wood || 0; }
  let F = fixture(), initial = need(F);
  assert(initial > 0, 'positive boundary price witnesses the real cost path');
  for (let i = 0; i < 8; i++) assert.strictEqual(need(F), initial, 'stable quote value');
  if (process.env.T1411_TERR_FAST === '1') assert.strictEqual(calls, 1, 'CACHE_REUSES_REAL_PRICE');
  else assert(calls > 1, 'OFF recomputes the original price');
  F.own.add('990,990');
  assert.notStrictEqual(need(F), initial, 'SIZE_CHANGE_REQUOTES');
  F = fixture(); initial = need(F);
  const size = F.own.size;
  F.own.delete('997,997'); F.own.add('1004,999');
  assert.strictEqual(F.own.size, size, 'same-size topology change');
  assert.strictEqual(need(F), 0, 'NEIGHBOR_CHANGE_REQUOTES');
  F = fixture(); initial = need(F); F.j.cx++;
  assert.notStrictEqual(need(F), initial, 'changed target coordinates');
  F = fixture(); initial = need(F); F.v.ccx--;
  assert.notStrictEqual(need(F), initial, 'changed village centre');
  F = fixture(); initial = need(F);
  const recipes = require('../server/hut-stages').HUT_RECIPES;
  const oldWood = recipes.pillar.from.wood;
  try { recipes.pillar.from.wood *= 2; assert(need(F) > initial, 'recipe input refreshes the quote'); }
  finally { recipes.pillar.from.wood = oldWood; }
  F = fixture(true);
  assert.strictEqual(P._t1181Probe.task(F.v, F.players.get('three')), null, 'third body is outside crew');
  F.players.delete('one');
  assert(P._t1181Probe.task(F.v, F.players.get('three')), 'removed crew body rebuilds the actual crew');
  F = fixture(true); F.players.get('one')._rest = 1; S.world.day++;
  assert(P._t1181Probe.task(F.v, F.players.get('three')), 'new day rechecks fit bodies');
  console.log('T1411_CHILD_PASS');
} else {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^T\d+_/.test(k)) delete clean[k];
  delete clean.NODE_OPTIONS;
  Object.assign(clean, { T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1302_TERR_BODY: '1', T1329_TERR_CREW: '1', T1358_STAKE_REQUOTE: '1', T325_WOOD_ACT: '1' });
  function child(on, bait) {
    const r = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env: { ...clean, T1411_TERR_FAST: on, T1411_BAIT: bait || '' }, encoding: 'utf8', timeout: 90000 });
    return { ...r, text: (r.stdout || '') + (r.stderr || '') };
  }
  let pass = 0;
  function ok(value, label, detail = '') {
    if (!value) { console.error('✗ ' + label + '\n' + detail); process.exit(1); }
    console.log('✓ ' + label); pass++;
  }
  for (const on of ['0', '1']) {
    const r = child(on);
    ok(r.status === 0 && r.text.includes('T1411_CHILD_PASS'), 'actual task, freshness and crew; switch=' + on, r.text);
  }
  function caught(bait, expected) {
    const r = child('1', bait);
    return r.status === 1 && r.text.includes('MUTATION_SITES=1') && r.text.includes('AssertionError') && r.text.includes(expected);
  }
  ok(caught('size', 'SIZE_CHANGE_REQUOTES'), '미끼 ⓐ 바꾼 자리 1곳: 크기 키 제거 → SIZE_CHANGE_REQUOTES 빨강');
  ok(caught('neighbor', 'NEIGHBOR_CHANGE_REQUOTES'), '미끼 ⓑ 바꾼 자리 1곳: 이웃 키 제거 → NEIGHBOR_CHANGE_REQUOTES 빨강');
  console.log(`T1411: ${pass} PASS / 0 FAIL; in-file baits 2/2`);
}
