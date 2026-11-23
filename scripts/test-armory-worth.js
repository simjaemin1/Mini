#!/usr/bin/env node
// @regress
// @bait 10
// T1449: 청동은 값이 있을 때만 붓는다(★재민 판정 63 · 64 = ㉮ 무기 값만) — 값 함수 · 붓는 문 둘(석공 비켜섬 · 대장장이 주조) · 대장장이 자리 · 사 모으는 문(v2 되실음) ·
//   병기고 크기 팔 · 전쟁 편성(쥘 사람 같은 술어 · 남는 청동은 단검으로 쥔다 — PM 결정).
//   정본 함수를 아이 프로세스에서 부른다(손잡이는 모듈 머리에서 읽히므로 팔마다 아이 하나). 미끼는 한 자리만 바꾼 사본 — 정한 단언이 빨강이어야 한다(바꿀 자리 정확히 1곳).
//   단언(팔 on = 묶음 + `T1449_ARMORY_WORTH=1`):
//     A1 쥘 사람 0(전사 0)이면 청동 값 0 · 재료가 넉넉해도 값 주조 거짓 · 대장장이가 하루 돌아도 안 붓는다
//     A2 쥘 사람이 든 청동보다 많으면 값 = 무기 값 × (청동전사 ÷ 석검 싸움 값 − 1) > 0 · 그날 붓는다
//     A3 전사 수만큼 청동을 이미 쥐었으면 값 0(그 넘는 칼에 정예 값을 안 준다)
//     A4 싸움 값 비 = battle-core 표(hp × atk ÷ cd) 그대로
//     A5 굶는 날 = 식량 일 한 사람의 값으로 잰다(식량 손이 비싸면 안 붓는다 · 손 값만으로는 붓는 판)
//     A6 병기고 몫 상한을 안 읽는다(전사가 병기고 × 0.45 보다 많은 마을 — 청동이 그 몫을 넘어도 쥘 사람이 남으면 값)
//     B2 안 붓는 날 석공이 석검을 간다(무장 0 이 안 된다)
//     B3 주조 한 번 = 재료 한 번(수출 주조와 값 주조가 같은 주석을 두 번 안 쓴다 · 주조 훅이 본 몫 = 곳간에서 빠진 몫)
//     C1 쥘 사람 술어 = war-core `warChampSlots`(값 함수와 편성이 같은 수를 읽는다)
//     C2 편성 — 켬: 전사 수를 넘는 청동검은 칼을 찾는 다른 병사가 단검으로 쥔다 · 끔: 종전(안 쥔다)
//     D1 사 모으는 문(`T1449_ARMORY_BUY` · 묶음 — 값 팔과 따로 선다): 받는 마을 병기고가 차면 무기를 안 싣는다 · 비면 싣는다 · 사 모으는 문 끔(묶음만) = 둘 다 싣는다(종전 묶음)
//     E1 병기고 크기 팔: 사람 × 0.72 → 전사 × 1.2(바닥 2)
//     K  손잡이 — '1' 만 켬('true' · '0' = 끔) · 끔 = 값 함수가 붓는 문에 안 선다(묶음 판 그대로)
'use strict';
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), ES = 'sim/economy-sim.js', V2 = 'sim/economy-sim-v2.js', WC = 'sim/war-core.js';
//   미끼: [파일, 바꿀 글자, 바꾼 글자, 빨강이어야 할 단언]
const BAITS = {
  matonly: [ES, '_smSwordStock = _t1449CastWorth(v) ? -Infinity : Infinity;', '_smSwordStock = -Infinity;', 'A1'],   // 재료만 있으면 붓는 사본(= 지금 코드의 문)
  cap: [ES, 'const holders = t1449ChampSlots(vil), have =', 'const holders = Math.min(t1449ChampSlots(vil), (vil.npcs.length || 0) * MELEE_ARMORY_PC * BRONZE_ARMORY_FRAC), have =', 'A6'],   // 상한(0.45)을 되살린 사본
  noholder: [ES, 'function t1449ChampSlots(vil) { return Math.round((vil && vil.counts && vil.counts.warrior) || 0); }', 'function t1449ChampSlots(vil) { return Math.max(1, Math.round((vil && vil.counts && vil.counts.warrior) || 0)); }', 'A1'],   // 쥘 사람 0 인데 값이 양수인 사본(㉮)
  hungry: [ES, 'return best.score > _t1449Hand(vil, p, true);', 'return best.score > _t1449Hand(vil, p, false);', 'A5'],   // 굶는 날에도 붓는 사본
  twice: [ES, 'if (T1449_ARMORY_WORTH && _melt) _smSwordStock = _t1449CastWorth(v) ? -Infinity : Infinity;', 'if (T1449_ARMORY_WORTH && _melt) { if (_t1449CastWorth(v)) for (const m in _melt.take) v.storage[m] -= _melt.take[m]; _smSwordStock = _t1449CastWorth(v) ? -Infinity : Infinity; }', 'B3'],   // 같은 주석을 두 번 쓰는 사본
  nostone: [ES, '(T1449_ARMORY_WORTH ? _t1449CastWorth(v) :', '(T1449_ARMORY_WORTH ? true :', 'B2'],   // 청동을 안 부은 날 석검도 안 갈아 무장이 0 이 되는 사본
  overchamp: [ES, 'unmet = Math.max(0, holders - have), r = _t1449R();', 'unmet = Math.max(0, holders), r = _t1449R();', 'A3'],   // 전사 수를 넘는 청동검에 정예 값을 주는 사본
  unheld: [WC, "    else if (_T1449_WORTH && bronzeStock > 0) { comp.dagger++; bronzeStock--; _assignWType(s, 'sword'); }", '', 'C2'],   // 남는 청동검을 아무도 안 쥐는 사본(= 지금 코드)
  pred: [ES, 'function t1449ChampSlots(vil) { return Math.round(', 'function t1449ChampSlots(vil) { return Math.floor(', 'C1'],   // 값 함수가 편성과 다른 술어로 쥘 사람을 세는 사본
  nobuy: [V2, "function _t1449NoBuy(av, r) { return r === 'weapon' && v1.T1449_ARMORY_BUY", "function _t1449NoBuy(av, r) { return false && r === 'weapon' && v1.T1449_ARMORY_BUY", 'D1'],   // 사 모으는 문이 값을 안 읽는 사본
};
const KNOBS = ['T1385_BRONZE_NOCAP', 'T1398_BRONZE_BAND', 'T1333_EXPORT_CAST', 'T1449_ARMORY_WORTH', 'T1449_ARMORY_BUY', 'T1449_ARMORY_SIZE', 'T1407_FOOD_FIRST', 'T1344_BRONZE_STOCK'];
if (process.env.T1449_CHILD) {
  const [arm, mut] = process.env.T1449_CHILD.split(':');
  for (const k of KNOBS) delete process.env[k];
  process.env.ENABLE_VILLAGES = '0';
  if (arm !== 'off') { process.env.T1385_BRONZE_NOCAP = '1'; process.env.T1398_BRONZE_BAND = '1'; }
  if (arm === 'on' || arm === 'buy' || arm === 'size') process.env.T1449_ARMORY_WORTH = '1';
  if (arm === 'true') process.env.T1449_ARMORY_WORTH = 'true';
  if (arm === 'zero') process.env.T1449_ARMORY_WORTH = '0';
  if (arm === 'buy' || arm === 'buyonly') process.env.T1449_ARMORY_BUY = '1';
  if (arm === 'size') process.env.T1449_ARMORY_SIZE = '1';
  if (mut) {
    const M = require('module'), old = M._extensions['.js'], [file, before, after] = BAITS[mut];
    M._extensions['.js'] = function (mod, name) {
      if (name === path.join(ROOT, file)) return mod._compile(fs.readFileSync(name, 'utf8').replace(before, after), name);
      return old(mod, name);
    };
  }
  const log = console.log; console.log = () => {};
  const E = require('../sim/economy-sim'), W2 = require('../sim/economy-sim-v2'), WarCore = require('../sim/war-core'), BC = require('../sim/battle-core');
  const out = { knob: { worth: !!E.T1449_ARMORY_WORTH, buy: !!E.T1449_ARMORY_BUY, size: !!E.T1449_ARMORY_SIZE, band: !!E.T1398_BRONZE_BAND } };
  //   마을 틀(T1398 하네스 꼴) — 곳간 넉넉 · 시딩 비축 0 · 이웃이 칼을 사 주는 값(수출 주조 문)은 판마다 준다
  const mk = (n, o = {}) => {
    E.setSeed(1);
    const v = E.createVillage({ name: '값시험', initialPop: n, fertility: 1, stone: 2, wood: 1, ore: 0, size: 100 });
    Object.assign(v.storage, { copper: 100, tin: 100, weapon: 0, stone: 1000, food: 2000, wood: 1000, charcoal: 1000 }, o.storage || {});
    for (const r of E.OreGoods.ids) v.storage[r] = 0;
    v.storage.ore = 0; v._swordFrac = 1; v._t1344Q = o.q != null ? o.q : 0; v._t1344M = v.storage.weapon;
    v._world = { day: 1, netExportFn: (_, r) => (r === 'weapon' ? (o.pw || 0) : 0), priceFn: () => ({ weapon: 1000 }) };   // 제 마을 무기 값(값표) — 주조가 남는 판
    const jobs = o.jobs || {};   // { smith: 1, warrior: 3, mason: 1 } — 나머지는 농부
    let i = 0; for (const n0 of v.npcs) n0.currentJob = 'farmer';
    for (const [j, k] of Object.entries(jobs)) for (let t = 0; t < k; t++) v.npcs[i++].currentJob = j;
    for (const k of Object.keys(v.counts)) v.counts[k] = 0;
    for (const p of v.npcs) v.counts[p.currentJob] = (v.counts[p.currentJob] || 0) + 1;
    return v;
  };
  const sw = (v, k) => { const w = E.t1449SwordWorth ? E.t1449SwordWorth(v, k) : null; return w ? { holders: w.holders, have: +(+w.have).toFixed(4), unmet: +(+w.unmet).toFixed(4), worth: +(+w.worth).toFixed(4) } : null; };
  const cw = (v) => (E._t1449CastWorth ? !!E._t1449CastWorth(v) : null);
  const tick = (v) => {   // 하루 — 주조 훅이 본 몫 · 곳간에서 빠진 주석 · 부은 청동 · 근접검 곳간
    const takes = []; v._world.onCast = (vv, m, amt) => { takes.push([+(m && m.take && m.take.tin || 0), +amt || 0, +(m && m.bronzeness || 0)]); };
    const tin0 = v.storage.tin, made0 = v._bronzeWeaponMade || 0, wp0 = v.storage.weapon || 0;
    E.tickVillage(v, 1);
    return { casts: takes.length, takeTin: +takes.reduce((a, t) => a + t[0], 0).toFixed(6), dTin: +(tin0 - v.storage.tin).toFixed(6), made: +((v._bronzeWeaponMade || 0) - made0).toFixed(6), dWeap: +((v.storage.weapon || 0) - wp0).toFixed(6) };
  };
  // A1 · B1 — 전사 0 · 대장장이 하나 · 재료 넉넉 · 이웃 값 0(수출 주조 문이 안 선다)
  { const v = mk(12, { jobs: { smith: 1 } }); out.A1 = { w: sw(v, 'bronze'), cw: cw(v), t: tick(v) }; }
  // A2 — 전사 넷 · 청동 0 · 대장장이 하나
  { const v = mk(12, { jobs: { smith: 1, warrior: 4 } }); out.A2 = { w: sw(v, 'bronze'), cw: cw(v), t: tick(v) }; }
  // A3 — 전사 넷 · 청동 근접검 넷(이미 쥐었다)
  { const v = mk(12, { jobs: { smith: 1, warrior: 4 }, storage: { weapon: 4 }, q: 1 }); out.A3 = { w: sw(v, 'bronze'), cw: cw(v) }; }
  // A4 — 싸움 값 비
  { const U = BC.UNITS, c = U.champion, d = U.dagger; out.A4 = { r: E._t1449R ? E._t1449R() : null, want: (c.hp * c.atk / c.cd) / (d.hp * d.atk / d.cd) }; }
  // A5 — 굶는 마을(곳간 먹을 것 0) · 땅이 비옥해 식량 일 손이 비싸다 · 다른 손은 전사(값 0 언저리)
  { const v = mk(12, { jobs: { smith: 1, warrior: 11 } }); v.land.fertility = 1e6;
    for (const r of Object.keys(v.storage)) { let f = 0; try { f = +E.storageFoodPer(v, r) || 0; } catch (e) { f = 0; } if (f > 0) v.storage[r] = 0; }   // 곳간 먹을 것 0(굶는 날)
    const p = E._oppPrice(v), food = E._t1449Hand ? E._t1449Hand(v, p, true) : null, plain = E._t1449Hand ? E._t1449Hand(v, p, false) : null;
    out.A5 = { hungry: food != null && food > plain, cw: cw(v), handFood: food, handPlain: plain, w: sw(v, 'bronze') }; }
  // A6 — 열 사람 · 전사 여덟(병기고 7.2 × 0.45 = 3.24 < 8) · 청동 넷(그 몫을 넘었다) — 쥘 사람이 남으니 값
  { const v = mk(10, { jobs: { smith: 1, warrior: 8 }, storage: { weapon: 4 }, q: 1 }); out.A6 = { w: sw(v, 'bronze'), cw: cw(v) }; }
  // B2 — 전사 0 · 대장장이 하나 · 석공 하나 · 근접검 0 — 안 붓는 날 석공이 석검을 간다
  { const v = mk(12, { jobs: { smith: 1, mason: 1 } }); const t = tick(v); out.B2 = { t, weapon: +(v.storage.weapon || 0).toFixed(4) }; }
  // B3 — 전사 넷 · 이웃이 칼을 비싸게 산다(값 주조 · 수출 주조 둘 다 선다) — 주조 한 번 = 재료 한 번
  { const v = mk(12, { jobs: { smith: 1, warrior: 4 }, pw: 1000 }); out.B3 = { cw: cw(v), t: tick(v) }; }
  // C1 — 쥘 사람 술어
  { const C = []; for (const w of [0, 1, 2.4, 2.6, 5, 7.5]) { const e = { counts: { warrior: w }, npcs: [] }; C.push([w, WarCore.warChampSlots ? WarCore.warChampSlots(e) : null, E.t1449ChampSlots ? E.t1449ChampSlots(e) : null]); } out.C1 = C; }
  // C2 — 편성: 전사 하나 · 대장장이 셋(칼을 찾는 병사 넷) · 근접검 다섯(다 청동) · 석검 0 — 지키는 판(모두 나선다)
  { const v = mk(12, { jobs: { warrior: 1, smith: 3 }, storage: { weapon: 5, stone: 0 }, q: 1 });
    const c = WarCore._warConscriptIndividual(v, 'war', { defense: true });
    const K = c && c.composition; out.C2 = K ? { champion: K.champion, dagger: K.dagger, militia: K.militia, slinger: K.slinger } : null; }
  // D1 — 사 모으는 문: 병기고 찬 마을 · 빈 마을
  { const probe = W2._t1188Probe; const full = mk(12, { storage: { weapon: 100 } }), empty = mk(12, { storage: { weapon: 0 } });
    out.D1 = { full: probe.returnGlutted(full, 'weapon'), empty: probe.returnGlutted(empty, 'weapon'), sFull: sw(full, 'sword'), sEmpty: sw(empty, 'sword') }; }
  // E1 — 병기고 크기
  { const v = mk(20, { jobs: { warrior: 3 } }); out.E1 = { t: E.t1449ArmoryTarget ? +E.t1449ArmoryTarget(v).toFixed(4) : null, n: v.npcs.length }; }
  console.log = log; process.stdout.write(JSON.stringify(out)); process.exit(0);
}
function child(arm, mut = '') {
  const p = spawnSync(process.execPath, [__filename], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, T1449_CHILD: arm + ':' + mut } });
  if (p.status !== 0) return { crash: (p.stderr || '') + (p.stdout || '').slice(0, 400) };
  try { return JSON.parse(p.stdout); } catch (e) { return { crash: 'json ' + p.stdout.slice(0, 300) }; }
}
//   켬 팔(on) 단언 — id → 참이어야 한다
function checks(on, off, bundle, buy, buyonly) {
  const R = {};
  const ok = (id, x) => { R[id] = !!x; };
  ok('A1', on.A1 && on.A1.w && on.A1.w.holders === 0 && on.A1.w.worth === 0 && on.A1.cw === false && on.A1.t.casts === 0 && on.A1.t.made === 0);
  ok('A2', on.A2 && on.A2.w && on.A2.w.holders === 4 && on.A2.w.unmet === 4 && on.A2.w.worth > 0 && on.A2.cw === true && on.A2.t.casts >= 1 && on.A2.t.made > 0);
  ok('A3', on.A3 && on.A3.w && on.A3.w.holders === 4 && on.A3.w.have === 4 && on.A3.w.worth === 0 && on.A3.cw === false);
  ok('A4', on.A4 && on.A4.r != null && Math.abs(on.A4.r - on.A4.want) < 1e-12 && on.A4.r > 1);
  ok('A5', on.A5 && on.A5.hungry === true && on.A5.w.worth > 0 && on.A5.handFood > on.A5.handPlain && on.A5.cw === false);
  ok('A6', on.A6 && on.A6.w && on.A6.w.holders === 8 && on.A6.w.unmet === 4 && on.A6.w.worth > 0 && on.A6.cw === true);
  ok('B2', on.B2 && on.B2.t.casts === 0 && on.B2.weapon > 0);
  ok('B3', on.B3 && on.B3.cw === true && on.B3.t.casts >= 1 && Math.abs(on.B3.t.dTin - on.B3.t.takeTin) < 1e-9 && on.B3.t.takeTin > 0);
  ok('C1', on.C1 && on.C1.every(([, a, b]) => a != null && a === b));
  ok('C2', on.C2 && bundle.C2 && on.C2.champion === 1 && bundle.C2.champion === 1 && bundle.C2.dagger === 0 && on.C2.dagger === 4 && on.C2.militia + on.C2.slinger === bundle.C2.militia + bundle.C2.slinger - 4);
  ok('D1', buy.D1 && buy.D1.full === true && buy.D1.empty === false && buyonly.D1 && buyonly.D1.full === true && buyonly.D1.empty === false && bundle.D1 && bundle.D1.full === false && bundle.D1.empty === false);
  return R;
}
let pass = 0, fail = 0;
function ok(x, msg, detail) { console.log(`${x ? '✓' : '✗'} ${msg}${detail == null ? '' : ' ' + JSON.stringify(detail).slice(0, 400)}`); x ? pass++ : fail++; }
try {
  const on = child('on'), off = child('off'), bundle = child('bundle'), buy = child('buy'), buyonly = child('buyonly'), size = child('size'), truth = child('true'), zero = child('zero');
  for (const [k, x] of Object.entries({ on, off, bundle, buy, buyonly, size, truth, zero })) if (x.crash) throw Error(k + ' 아이 판 죽음: ' + x.crash.slice(0, 600));
  ok(on.knob.worth && !off.knob.worth && !bundle.knob.worth && !truth.knob.worth && !zero.knob.worth && buy.knob.buy && !on.knob.buy && size.knob.size && !on.knob.size, "K 손잡이 — '1' 만 켬", { on: on.knob, truth: truth.knob, zero: zero.knob });
  const R = checks(on, off, bundle, buy, buyonly);
  const DESC = { A1: '쥘 사람 0 = 값 0 · 안 붓는다', A2: '쥘 사람이 남으면 값 > 0 · 붓는다', A3: '전사 수만큼 쥐었으면 값 0', A4: '싸움 값 비 = battle-core 표', A5: '굶는 날 = 식량 손으로 잰다',
    A6: '병기고 몫 상한을 안 읽는다', B2: '안 붓는 날 석공이 석검을 간다', B3: '주조 한 번 = 재료 한 번', C1: '쥘 사람 술어 = warChampSlots', C2: '편성 — 남는 청동은 단검(켬) · 끔 = 종전', D1: '사 모으는 문 — 찬 병기고는 안 싣는다' };
  for (const [k, x] of Object.entries(R)) ok(x, `${k} ${DESC[k]}`, x ? undefined : { on: on[k], off: off[k], bundle: bundle[k], buy: buy[k], buyonly: buyonly[k] });
  //   끔 = 값 함수가 붓는 문에 안 선다: 끔 · 'true' · '0' 은 묶음 판과 같은 판(대장장이가 전사 0 마을에서도 재료로 붓는다 = 종전 묶음 줄)
  const strip = (x) => JSON.stringify({ A1: x.A1.t, A2: x.A2.t, B2: x.B2, B3: x.B3.t, C2: x.C2, D1: [x.D1.full, x.D1.empty] });
  ok(strip(truth) === strip(bundle) && strip(zero) === strip(bundle), "K 'true' · '0' = 묶음 판 그대로");
  ok(bundle.A1.t.casts >= 1 && bundle.A1.t.made > 0, '종전 묶음 줄(대조) — 전사 0 마을도 재료로 붓는다(값 문이 고치는 자리)', bundle.A1.t);
  ok(off.E1.t === +(off.E1.n * 0.72).toFixed(4) && size.E1.t === +Math.max(2, 3 * 1.2).toFixed(4), 'E1 병기고 크기 — 끔 = 사람 × 0.72 · 켬 = 전사 × 1.2(바닥 2)', { off: off.E1, size: size.E1 });
  //   글자 — 새 상한 · 새 수 0: T1449 블록 안에 병기고 몫(0.45 · BRONZE_ARMORY_FRAC) · 새 `_PC` 가 없다 · 사 모으는 문 자리 둘
  const SRC = fs.readFileSync(path.join(ROOT, ES), 'utf8'), V2S = fs.readFileSync(path.join(ROOT, V2), 'utf8');
  const i0 = SRC.indexOf('// ★★★[T1449 2026-11-23'), i1 = SRC.indexOf('function _t1398ExportSmiths(v)'), blk = i0 >= 0 && i1 > i0 ? SRC.slice(i0, i1) : '';
  const code = blk.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  ok(blk.length > 0 && !/BRONZE_ARMORY_FRAC|0\.45|MELEE_ARMORY_SECF/.test(code) && !/const [A-Z0-9_]*_PC\s*=/.test(code) && (V2S.match(/_t1449NoBuy\(/g) || []).length === 3,
    'G 새 상한 0 · 새 수 0 — 값 블록에 병기고 몫 · 굶는 몫 문턱 · 새 _PC 가 없다 · 사 모으는 문 = 정의 하나 + 자리 둘', { blk: blk.length, noBuy: (V2S.match(/_t1449NoBuy\(/g) || []).length });
  function bait(mut) {
    const [file, before, , key] = BAITS[mut];
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8'), n = src.split(before).length - 1;
    if (n !== 1) return { good: false, sites: n, why: '바꿀 자리 ' + n };
    const q = { on: child('on', mut), off: child('off', mut), bundle: child('bundle', mut), buy: child('buy', mut), buyonly: child('buyonly', mut) };
    const dead = Object.entries(q).filter(([, x]) => x.crash);
    if (dead.length) return { good: false, sites: n, why: '아이 판 죽음 ' + dead[0][0] + ' ' + dead[0][1].crash.slice(0, 200) };
    const r = checks(q.on, q.off, q.bundle, q.buy, q.buyonly);
    const red = Object.keys(r).filter((k) => !r[k]);
    return { good: r[key] === false, sites: n, why: '빨강 ' + JSON.stringify(red) + ' · 정한 ' + key };
  }
  let nb = 0, b;
  b = bait('matonly'); ok(b.good, '미끼 matonly — 재료만 있으면 붓는 사본(= 지금 코드) → A1 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('cap'); ok(b.good, '미끼 cap — 병기고 몫 상한(0.45)을 되살린 사본 → A6 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('noholder'); ok(b.good, '미끼 noholder — 쥘 사람 0 인데 값이 양수인 사본(㉮) → A1 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('hungry'); ok(b.good, '미끼 hungry — 굶는 날에도 붓는 사본 → A5 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('twice'); ok(b.good, '미끼 twice — 수출 주조와 병기고가 같은 주석을 두 번 쓰는 사본 → B3 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('nostone'); ok(b.good, '미끼 nostone — 청동을 안 부은 날 석검도 안 갈아 무장이 0 이 되는 사본 → B2 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('overchamp'); ok(b.good, '미끼 overchamp — 전사 수를 넘는 청동검에 정예 값을 주는 사본 → A3 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('unheld'); ok(b.good, '미끼 unheld — 남는 청동검을 아무도 안 쥐는 사본(= 지금 편성) → C2 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('pred'); ok(b.good, '미끼 pred — 값 함수가 편성과 다른 술어로 쥘 사람을 세는 사본 → C1 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  b = bait('nobuy'); ok(b.good, '미끼 nobuy — 사 모으는 문이 값을 안 읽는 사본 → D1 빨강 · 바꾼 자리 ' + b.sites, b.why); nb += b.good ? 1 : 0;
  if (nb !== Object.keys(BAITS).length) ok(false, `미끼 표(${Object.keys(BAITS).length})와 빨강이 선 미끼(${nb}) 수가 다르다`);
  console.log(`미끼 ${nb}/${Object.keys(BAITS).length}`);
} catch (e) { ok(false, '실행 오류', String(e && e.stack || e).slice(0, 800)); }
console.log(`T1449 ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'} · 미끼 ${Object.keys(BAITS).length}`);
process.exitCode = fail ? 1 : 0;
