#!/usr/bin/env node
// @regress
// @bait 3
// T1358: real village task -> clearing/build-haul -> territory and granary assertions.
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const child = process.argv.includes('--child');
if (child) {
  process.env.ENABLE_VILLAGES = '0';
  process.env.DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 't1358-db-')), 'w.db');
  const bait = process.env.T1358_BAIT || '';
  let changes = 0;
  if (bait) {
    const Module = require('module'), original = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      const village = f === path.join(ROOT, 'server/villages.js');
      const econ = f === path.join(ROOT, 'sim/economy-sim.js');
      if (!(village || econ)) return original(m, f);
      let s = fs.readFileSync(f, 'utf8'), from, to;
      if (village && bait === 'quote') {
        from = 'j.wood = +_t1207CellCost(vil, j.cx, j.cy).wood.toFixed(6);';
        to = 'j.wood = j.wood;';
      }
      if (village && bait === 'priority') {
        from = "t.kind==='bridge'?E.woodSpareAfterLand(vil.econ):E.woodSpare(vil.econ)";
        to = "E.woodSpareAfterLand(vil.econ)";
      }
      if (econ && bait === 'demand') {
        from = '+ ((v && v._t1207Need) || 0); }';
        to = '+ 0; }';
      }
      if (from) {
        const n = s.split(from).length - 1;
        assert.strictEqual(n, 1, 'one mutation site');
        changes += n; s = s.replace(from, to);
      }
      m._compile(s, f);
    };
  }
  const V = require('../server/villages'), E = require('../sim/economy-sim');
  const P = V.__labProbe, S = V.__p3Bind({}).state;
  function fixture() {
    P._t1238Probe.clearLand();
    const players = new Map();
    const ta = { isBlocked: () => false, isRock: () => false, isWater: () => false, fert: () => 0.5, forestMult: () => 1 };
    const own = new Set();
    for (let x = 997; x <= 1003; x++) for (let y = 997; y <= 1003; y++) own.add(x + ',' + y);
    const e = E.createVillage({ name: 'stake', initialPop: 40, fertility: 0.6, water: 0.5, wood: 0.6, stone: 0.4, game: 0.4, ore: 0, size: 100 });
    const v = { dbId: 1, name: 'stake', ccx: 1000, ccy: 1000, _terrSet: own, _potSet: new Set(), _farmSet: new Set(), _drySet: new Set(),
      _houseCells: [], _granList: [], _ditch: [], _shelter: null, _site: null, _psite: null, npcPids: [], _crop: new Map(), econ: e };
    const p = { pid: 'crew', isNpc: true, hp: 100, maxHp: 100, inventory: {}, x: 32016, y: 32016, simVillageId: 1, simJob: 'farmer' };
    players.set(p.pid, p); v.npcPids = [p.pid];
    const deps = { players, dayPhaseRatio: 0.7, moveSpeed: 64, anyViewerNear: () => false, broadcast: () => {},
      t325TreesAtCell: () => [], clearTreesInCells: () => 0 };
    P._t569Probe.setup({ ta, villages: [v], db: null });
    P._t400Probe.setup({ deps, dayMs: 1440000, world: { day: 23, villages: [e] } });
    P._t1238Probe.setup({ villages: [v], day: 23 });
    E.bindProductionActs(S.world); e._world = S.world;
    e.storage.wood = 400;
    V._t1207Queue(v, ['1004,1000']);
    return { v, p, e, own, j: v._t1207Pend[0] };
  }
  function walk(F, ticks = 1200) {
    for (let i = 1; i <= ticks; i++) {
      P._t1181Probe.step(F.v, F.p, i * 100, true);
      if (Number.isFinite(F.p.targetX)) { F.p.x = F.p.targetX; F.p.y = F.p.targetY; }
      if (!F.v._t1207Pend.length) break;
    }
  }
  const free = fixture(), queued = free.j.wood;
  assert(queued > 0);
  // Two neighbours finish while this cell is being cleared: its present boundary growth is zero.
  free.own.add('1004,999'); free.own.add('1004,1001'); free.e.storage.wood = 0;
  free.j.workMs = free.j.laborMin * 1000;
  const expected = V._t1207CellCost(free.v, 1004, 1000).wood;
  assert.strictEqual(expected, 0);
  walk(free);
  assert(free.own.has('1004,1000'), 'REQUOTE_FREE_COMPLETES');
  assert.strictEqual(free.v._t1207.body, 1, 'one body completion');
  assert.strictEqual(free.e.storage.wood, 0, 'free cell takes no wood');
  assert.strictEqual(free.v._t1207.wood, 0, 'free cell consumes no wood');

  const paid = fixture();
  paid.e._t1207Need = 1000;
  paid.j.workMs = paid.j.laborMin * 1000;
  const stock = paid.e.storage.wood;
  walk(paid);
  assert(paid.own.has('1004,1000'), 'STAKE_BEFORE_LAND');
  assert(Math.abs(stock - paid.e.storage.wood - paid.v._t1207.wood) < 1e-6, 'stock decrease equals placed wood');
  assert(paid.v._t1207.wood > 0, 'paid boundary uses real carried stakes');

  const D = fixture();
  D.e._woodOutLast = 7; D.e._t1135Need = 7; D.e._t1207Need = 0;
  const d0 = E.woodShareD(D.e); D.e._t1207Need = 13;
  assert.strictEqual(E.woodShareD(D.e) - d0, 13, 'QUEUE_IN_WOOD_DEMAND');
  D.e._t325InflowToday = d0;
  assert.strictEqual(E.woodDemandLeft(D.e, 0), 13, 'queue reaches logger remaining-demand gate');

  // Queue quote survives the existing checkpoint sidecar; workers are assigned again.
  const R = fixture(); R.j.workMs = R.j.laborMin * 500;
  const before = JSON.stringify(R.v._t1207Pend.map(j => [j.key, j.workMs, j.mat, j.wood]));
  const side = P._t740Probe.pack(R.v);
  R.v._t1207Pend = undefined; R.e._t740Side = JSON.parse(JSON.stringify(side)); P._t740Probe.restore();
  assert.strictEqual(JSON.stringify(R.v._t1207Pend.map(j => [j.key, j.workMs, j.mat, j.wood])), before, 'checkpoint keeps progress/materials/quote');
  if (bait) assert.strictEqual(changes, 1);
  console.log('PASS T1358 product assertions');
  process.exit(0);
}
function run(bait, enabled = true) {
  const env = { ...process.env, T325_WOOD_ACT: '1', T1207_TERR_REAL: '1', T1238_TERR_V2: '1', T1302_TERR_BODY: '1', T1329_TERR_CREW: '1',
    T1358_STAKE_REQUOTE: enabled ? '1' : '0', T1358_BAIT: bait, T400_BUILD_ACT: '0' };
  return spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env, encoding: 'utf8', timeout: 60000 });
}
let pass = 0, fail = 0;
function ok(cond, message, extra) { console.log((cond ? '  ✓ ' : '  ✗ ') + message + (extra ? ': ' + extra : '')); cond ? pass++ : fail++; }
const good = run('');
ok(good.status === 0, '제품: 재계산·몸 완공·실제 말뚝 인출·수요 문·체크포인트', good.status ? good.stderr : '');
const off = run('', false);
ok(off.status !== 0 && off.stderr.includes('REQUOTE_FREE_COMPLETES'), '끔 대조: 종전 고정 값에서 완공 검사가 빨강');
const a = run('quote');
ok(a.status !== 0 && a.stderr.includes('REQUOTE_FREE_COMPLETES') && !a.stderr.includes('one mutation site'), '미끼 ⓐ 바꾼 자리 1곳: 재계산 제거 → REQUOTE_FREE_COMPLETES 빨강');
const b = run('priority');
ok(b.status !== 0 && b.stderr.includes('STAKE_BEFORE_LAND') && !b.stderr.includes('one mutation site'), '미끼 ⓑ 바꾼 자리 1곳: 땅 몫을 먼저 뺌 → STAKE_BEFORE_LAND 빨강');
const c = run('demand');
ok(c.status !== 0 && c.stderr.includes('QUEUE_IN_WOOD_DEMAND') && !c.stderr.includes('one mutation site'), '미끼 ⓒ 바꾼 자리 1곳: 나무꾼 수요에서 말뚝 제거 → QUEUE_IN_WOOD_DEMAND 빨강');
console.log(`결과 ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
