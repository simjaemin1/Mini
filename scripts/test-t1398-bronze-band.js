#!/usr/bin/env node
// @regress
// @bait 6
// T1398: 재고 띠 · 주석 유보 · 무기 되실음 · 인구비례 수출 노동 상한 제거.
// 정본 함수를 아이 프로세스에서 부른다. 미끼는 한 자리만 바꾸고 지정 단언의 빨강을 확인.
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), ES = 'sim/economy-sim.js', V2 = 'sim/economy-sim-v2.js';
const BAITS = {
  band: [ES, 'if (!T1398_BRONZE_BAND) {', 'if (true) {', 'band'],
  tin: [V2, "r === 'tin' && !v1.T1398_BRONZE_BAND", "r === 'tin'", 'tin'],
  back: [V2, "return !(v1.T1398_BRONZE_BAND && r === 'weapon') &&", 'return', 'back'],
  hands: [ES, 'return Math.max(1, Math.ceil(casts / COPPER_DERIV_DAYS));', 'return Math.max(1, Math.floor(v.npcs.length * 0.03));', 'hands'],
  labor: [ES, 'const labor = costs.length ? Math.min(...costs) : 0;', 'const labor = 0;', 'band'],
  dead: [ES, 'const _cuPC =', 'const _tinGlut = 0; const _cuPC =', 'dead'],
};
if (process.env.T1398_CHILD) {
  const [arm, mut] = process.env.T1398_CHILD.split(':');
  for (const k of ['T1385_BRONZE_NOCAP', 'T1398_BRONZE_BAND', 'T1333_EXPORT_CAST']) delete process.env[k];
  if (arm !== 'orphan') process.env.T1385_BRONZE_NOCAP = '1';
  if (arm !== 'off') process.env.T1398_BRONZE_BAND = arm === 'true' ? 'true' : '1';
  process.env.T1333_EXPORT_CAST = '1'; process.env.ENABLE_VILLAGES = '0';
  if (mut) {
    const M = require('module'), old = M._extensions['.js'], [file, before, after] = BAITS[mut];
    M._extensions['.js'] = function(mod, name) {
      if (name === path.join(ROOT, file)) return mod._compile(fs.readFileSync(name, 'utf8').replace(before, after), name);
      return old(mod, name);
    };
  }
  const log = console.log; console.log = () => {};
  const E = require('../sim/economy-sim'), W = require('../sim/economy-sim-v2');
  const mk = (n = 10, stock = 100) => {
    E.setSeed(1);
    const v = E.createVillage({ name: '주조시험', initialPop: n, fertility: 1, stone: 2, wood: 1, ore: 0, size: 100 });
    Object.assign(v.storage, { copper: stock, tin: stock, weapon: 100, stone: 1000, food: 2000, wood: 1000, charcoal: 1000 });
    for (const r of E.OreGoods.ids) v.storage[r] = 0;
    v.storage.ore = 0; v._swordFrac = 1; v._t1344Q = 1; v._t1344M = 100;
    v._world = { netExportFn: (_, r) => r === 'weapon' ? 1000 : 0 };
    return v;
  };
  const v = mk();
  const probe = W._t1188Probe;
  const first = { on: !!E.T1398_BRONZE_BAND, band: E._t1333ExportCast(v),
    tin: probe.exportCandidates({ v }, v.npcs.length).find(x => x.res === 'tin')?.surplus || 0,
    back: probe.returnGlutted(v, 'weapon'), armor: probe.returnGlutted(v, 'armor'),
    hands: E._t1398ExportSmiths ? E._t1398ExportSmiths(v) : null };
  v.storage.weapon = 0; first.low = E._t1333ExportCast(v);
  v._world.netExportFn = () => 0; first.noBuyer = E._t1333ExportCast(v);
  v._world.netExportFn = (_, r) => r === 'weapon' ? 1000 : 0;
  v.storage.copper = 0; first.noCu = E._t1333ExportCast(v);
  const costly = mk(); costly.land.fertility = 1e6;
  costly.npcs.forEach(n => n.currentJob = 'farmer');
  first.costlyHands = E._t1333ExportCast(costly);
  const rich = mk(10, 1000), small = mk(10, 1);
  first.richHands = E._t1398ExportSmiths ? E._t1398ExportSmiths(rich) : null;
  first.smallHands = E._t1398ExportSmiths ? E._t1398ExportSmiths(small) : null;
  first.target = E.smithTarget(rich);
  const cast = mk(); cast.npcs.forEach((p, i) => p.currentJob = i === 0 ? 'smith' : 'farmer');
  for (const k of Object.keys(cast.counts)) cast.counts[k] = 0;
  cast.counts.smith = 1; cast.counts.farmer = cast.npcs.length - 1;
  const made0 = cast._bronzeWeaponMade || 0; E.tickVillage(cast, 1);
  first.made = (cast._bronzeWeaponMade || 0) - made0;
  const armor = mk(); armor.storage.armor = 100; first.armor = probe.returnGlutted(armor, 'armor');
  // 이 상수는 죽지 않았다: 원석 나눔 기본에서도 광부 기회비용이 land.tin을 읽는다.
  const miner = { currentJob: 'miner', skills: {} };
  first.liveFlat = E.opportunityCost(miner, { land: { tin: 1 }, counts: {}, storage: {} }, () => 1);
  let source = fs.readFileSync(path.join(ROOT, ES), 'utf8');
  if (mut && BAITS[mut][0] === ES) source = source.replace(BAITS[mut][1], BAITS[mut][2]);
  first.dead = !/const _tinGlut\s*=|const _tinPC\s*=|const tinAmt = TIN_DEPOSIT_YIELD_FLAT/.test(source);
  console.log = log; process.stdout.write(JSON.stringify(first)); process.exit(0);
}
function child(arm, mut = '') {
  const p = spawnSync(process.execPath, [__filename], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, T1398_CHILD: arm + ':' + mut } });
  if (p.status !== 0) throw Error(p.stderr + p.stdout);
  return JSON.parse(p.stdout);
}
function checks(p) { return { band: p.band && p.low && !p.noBuyer && !p.noCu && p.made > 0 && !p.costlyHands, tin: p.tin > 95,
  back: !p.back && p.armor, hands: p.richHands > p.hands && p.hands > p.smallHands && p.target > 1, dead: p.dead }; }
let pass = 0, fail = 0;
function ok(x, msg, detail) { console.log(`${x ? '✓' : '✗'} ${msg}${detail == null ? '' : ' ' + JSON.stringify(detail)}`); x ? pass++ : fail++; }
try {
  const on = child('on'), off = child('off'), orphan = child('orphan'), truth = child('true');
  ok(on.on && !off.on && !orphan.on && !truth.on, 'knob: 전체 T1385 켬 안에서 1만 켬');
  for (const [k, x] of Object.entries(checks(on))) ok(x, k, on);
  ok(!off.band && off.low && off.back && off.tin < on.tin, 'off: 종전 띠 · 유보 · 되실음', off);
  ok(JSON.stringify(off) === JSON.stringify(orphan) && JSON.stringify(off) === JSON.stringify(truth), 'orphan/true: 기본 동작');
  ok(on.liveFlat > 0, 'liveFlat: 정량 상수는 기본 원석 나눔에서도 살아 있다', on.liveFlat);
  for (const [mut, [file, before, , key]] of Object.entries(BAITS)) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const n = src.split(before).length - 1;
    if (n !== 1) { ok(false, `미끼 ${mut}: 자리 수`, n); continue; }
    const p = child('on', mut);
    ok(checks(p)[key] === false, `미끼 ${mut}: ${key} 빨강`);
  }
} catch (e) { ok(false, '실행 오류', e.stack); }
console.log(`T1398 ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'} · 미끼 6`);
process.exitCode = fail ? 1 : 0;
