#!/usr/bin/env node
// @regress
'use strict';
const assert = require('assert'), fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
if (process.env.T1259_TEST_CHILD === '1') {
  let E;
  if (process.env.T1259_TEST_BAIT === '1') {
    const Module = require('module'), file = path.join(ROOT, 'sim/economy-sim.js');
    const text = fs.readFileSync(file, 'utf8');
    const before = "const standing = T1259_WOOD_CAP && _t1259WoodReader ? _t1259WoodReader(v) : null;";
    assert(text.includes(before));
    const m = new Module(file, module); m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
    m._compile(text.replace(before, 'const standing = null;'), file); E = m.exports;
  } else E = require('../sim/economy-sim');
  const v = { land: { size: 400, baseSize: 400, wood: 1, fertility: 1, water: 1, game: 1, ore: 1 }, npcs: [] };
  if (!E.T1259_WOOD_CAP) {
    E.setT1259WoodReader(() => { throw Error('OFF called spatial reader'); });
    assert.equal(E.jobCapacity(v).lumberjack, 120);
  } else {
    E.setT1259WoodReader(() => 0);
    assert.equal(E.jobCapacity(v).lumberjack, 0, 'tree0 must produce zero lumberjack slots');
    E.setT1259WoodReader(() => 10);
    assert.equal(E.jobCapacity(v).lumberjack, 3);
    assert.equal(E.jobCapacity(v).farmer, 160);
    E.setT1259WoodReader(null);
    assert.equal(E.jobCapacity(v).lumberjack, 120, 'standalone nonspatial lab retains its model');
    const V = require('../server/villages');
    const tree = new Set(['101,100', '102,100']);
    const vil = { name: 'fixture', dbId: 1, ccx: 100, ccy: 100, econ: v, _terrSet: new Set() };
    const deps = { moveSpeed: 64, dayPhaseRatio: 0.7,
      t325TreesAtCell: (x, y) => tree.has(x + ',' + y) ? [{ type: 'tree' }] : [],
      lootOfResource: () => ({ wood: 4 }), npcCanReach: (ax, ay, x) => x < 102 * 32 };
    V.__p3Bind({ villages: [vil], byEcon: new Map([[v, vil]]), deps, dayMs: 1440000, epoch: 0, world: { day: 1 } });
    assert.equal(V._t1259WoodCells(v), 1, 'standing but unreachable tree is excluded');
    E.setT1259WoodReader(V._t1259WoodCells);
    assert.equal(E.jobCapacity(v).lumberjack, 0);
    tree.delete('101,100');
    assert.equal(V._t1259WoodCells(v), 0, 'same-day cut is read from canonical live trees');
    const observed = require('../server/wood-walk-evidence.json');
    assert.equal(V._t1259WoodRadius(), observed.maxFullDayDistancePx / 2);
  }
  process.exit(0);
}
let passed = 0;
for (const mode of [undefined, '0', '1']) {
  const env = { ...process.env, T1259_TEST_CHILD: '1' };
  delete env.T1259_WOOD_CAP; if (mode !== undefined) env.T1259_WOOD_CAP = mode;
  const r = spawnSync(process.execPath, [__filename], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, String(mode) + ': ' + r.stderr); passed++;
}
const bait = spawnSync(process.execPath, [__filename], { env: { ...process.env, T1259_TEST_CHILD: '1', T1259_WOOD_CAP: '1', T1259_TEST_BAIT: '1' }, encoding: 'utf8' });
assert.notEqual(bait.status, 0, 'bait ignoring canonical trees must fail'); passed++;
assert.match(bait.stderr, /tree0 must produce zero lumberjack slots/, 'bait must fail the intended tree0 assertion');
console.log('T1259 child configurations ' + passed + '/0; real tree0 assertion rejects the deliberately broken copy.');
