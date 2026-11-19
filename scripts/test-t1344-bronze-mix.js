#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-t1344-bronze-mix.js — 청동 몫 곳간 = 청동 근접검(`T1344_BRONZE_STOCK`) · 섞어 싣기(`T1344_MIX_LOAD`) — 끔 기본 둘(T1344 · T1333 회부 3 · 카드 밖 줄) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수를 그대로 부른다 · 아이 판: 끔 · 병기고(b) · 섞어 싣기(m) · 둘 다(bm) · 미끼):
//   ① 손잡이 — `'1'` 만 켬(없음 · '0' · '' · 'true' = 끔)
//   ② 한 마을 하루(test-smelt-return 픽스처 땅 · 사람 10 · 대장장이 첫 차례 · 구리 5 · 주석 5 · 식량 넉넉):
//      석검이 병기고 청동 몫 한도를 넘게 차 있어도(근접검 3.75 ≥ 10 × 0.72 × 0.45 = 3.24) 청동 몫이 비면(몫 0 · 0.5) 붓는다 · 청동 몫이 차면(몫 1) 안 붓는다 ·
//      끔이면 종전대로 안 붓는다 · 취약 마을(식량 0 — 전사 커버리지 갈래)은 켬이어도 종전(근접검 전부) · 주석 없는 구리 마을(청동 아닌 배합)도 종전 곳간
//   ③ 청동 몫 섞음(`_t1344Mix`) — 곳간 가중(어제 근접검 곳간 · 오늘 만든 근접검 · 그 가운데 청동) · 비례 줄어듦은 몫 그대로 · 켜는 날 · 만든 게 없는 날
//   ④ 대장장이 자리(`smithTarget`) — 석검이 병기고를 채운 청동 마을: 끔 0 · 켬이면 청동 몫이 비어 자리가 선다(≥ 1) · 청동 몫이 차면 0
//   ⑤ 석공(청동 우선권 `_bronzeNow`) — 병기고가 모자란 청동 마을: 끔이면 석공이 석검을 채운다(근접검 ≥ 청동 몫 한도라 청동 차례가 없다) · 켬이면 청동 몫이 비어 석공이 비켜 선다
//   ⑥ 섞어 싣기(`_t1344MixPick` 정본 함수) — 남는 무게(몸 짐 25 kg × (상인 + 호위) − 첫째 무게)에만 · 첫째가 이미 넘으면 0 · 낱개 몫 > 0(첫째와 같은 식) ·
//      짐 몫(낱개 몫 × 양) 최대 하나 · 낱개 단위(내림) · 무게 상한 안 · 품목 특례 0(값이 정한다 — 구리든 밀이든)
//   ⑦ 판(마을 여섯 월드 · 날 열 · `tickWorldV2`): 끔이면 둘째 화물 0 · 장부 `sent2` 0 · 켬이면 둘째 화물이 서고 첫째 화물(품목 · 양 · 목적지)은 끔 판 그대로(첫 출발 날)
//   ⑧ 글자 — 청동 근접검 함수 하나 · 부르는 자리 셋(주조 문 · 석공 문 · 대장장이 자리) · 섞어 싣기 부르는 자리 하나(`else if` — T206 둘째 화물이 먼저) · T1333 주조 문 글자 그대로
//   ⑨ 미끼(사본 — 정본 파일 무변 · 한 줄만 바꿔 싣는다) — 각각 빨강:
//      `allstock`(곳간을 근접검 전부로 되돌림) · `emaq`(청동 몫을 만든 몫 EMA 로) · `nosecf`(취약 마을에도 청동 몫) · `anyrecipe`(청동 아닌 배합도 청동 근접검으로) · `overkg`(무게 상한을 넘겨 싣는다) ·
//      `nomain`(첫째 무게를 안 뺀다) · `shrink`(섞어 실으며 첫째 화물을 한 낱개 줄인다)
//
// 실행: node scripts/test-t1344-bronze-mix.js
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1344_HARNESS_ARM || '', MUT = process.env.T1344_MUTANT || '';

// ── 아이 판 ──────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of ['T1344_BRONZE_STOCK', 'T1344_MIX_LOAD', 'T1333_ALLOY_ORDER', 'T1333_EXPORT_CAST', 'T1333_WS_INPUT', 'L_CARGO_TWO', 'T1136_BASKET']) delete process.env[k];
  if (ARM === 'b' || ARM === 'bm') process.env.T1344_BRONZE_STOCK = '1';
  if (ARM === 'm' || ARM === 'bm') process.env.T1344_MIX_LOAD = '1';
  if (ARM === 'k0') process.env.T1344_BRONZE_STOCK = '0';
  if (ARM === 'ktrue') { process.env.T1344_BRONZE_STOCK = 'true'; process.env.T1344_MIX_LOAD = 'true'; }
  process.env.ENABLE_VILLAGES = '0';
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 줄만 바꾼 사본으로 싣는다(파일 무변)
    const M = require('module'), old = M._extensions['.js'];
    const R = {
      allstock: ['sim/economy-sim.js', ' * Math.max(0, Math.min(1, v._t1344Q || 0));\n}', ';\n}'],
      emaq: ['sim/economy-sim.js', '  if (sw > 0) v._t1344Q = ((v._t1344Q || 0) * m0 + bz) / (m0 + sw);', '  if (sw > 0) v._t1344Q = (v._t1344Q || 0) * (1 - SWORD_FRAC_EMA) + (bz / sw) * SWORD_FRAC_EMA;'],
      nosecf: ['sim/economy-sim.js', 'if (T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF && _melt && _melt.bronzeness > 0) _smSwordStock', 'if (T1344_BRONZE_STOCK && _melt && _melt.bronzeness > 0) _smSwordStock'],
      anyrecipe: ['sim/economy-sim.js', 'if (T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF && _melt && _melt.bronzeness > 0) _smSwordStock', 'if (T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF && _melt) _smSwordStock'],   // 청동 아닌 배합도 청동 근접검으로 잰다
      overkg: ['sim/economy-sim-v2.js', 'a.v.storage[c2.res] || 0, room / kg));', 'a.v.storage[c2.res] || 0, Infinity));'],
      nomain: ['sim/economy-sim-v2.js', '  const room = cap - best.N_units * _t1136Kg(best.cand.res);', '  const room = cap;'],
      shrink: ['sim/economy-sim-v2.js', '        giveRes: cand.res, giveAmt: N_units,', '        giveRes: cand.res, giveAmt: (_res2 ? Math.max(0, N_units - 1) : N_units),'],   // 둘째를 실으면 첫째를 한 낱개 덜 싣는다
    }[MUT];
    assert(R, '미끼 모름 ' + MUT);
    M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, R[0])) return old(m, f);
      let x = fs.readFileSync(f, 'utf8');
      for (let i = 1; i < R.length; i += 2) { assert(x.includes(R[i]), '미끼 자리 없음 ' + MUT + ' · ' + R[i].slice(0, 60)); x = x.replace(R[i], R[i + 1]); }
      m._compile(x, f);
    };
  }
  const _l0 = console.log; console.log = () => {};
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js')), V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
  console.log = _l0;
  const r6 = (x) => (x == null ? null : +(+x).toFixed(6));
  const LP = { fertility: 0.32, arable: 1, water: 0.08, wood: 0.67, game: 0.74, stone: 2.13, ore: 0.24, size: 138, baseSize: 138, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, oreMix: { copper: 0.9, gold: 0.05, silver: 0.05 }, oreGrade: 0.5153, oreP: 0.0909, oreDist: 0.4, coastal: false };
  // ② ④ ⑤ 한 마을(가짜 · 존 안 띄움) — job: 첫 차례 직업 · q: 청동 몫 · food: 식량 · wpn: 무기 곳간 · tin: 땅 주석(청동 자격) · stone
  const mkV = (o) => {
    if (E.setSeed) E.setSeed(1);
    const v = E.createVillage({ ...LP, name: '시험병기', initialPop: 10 });
    if (o.job) { const sm = v.npcs[0]; v.counts[sm.currentJob] = (v.counts[sm.currentJob] || 0) - 1; sm.currentJob = o.job; v.counts[o.job] = (v.counts[o.job] || 0) + 1; }
    v.storage.ore = 0; for (const k of ['copper', 'tin', 'lead', 'silver', 'gold', 'iron', 'arsenic', ...((E.OreGoods && E.OreGoods.ids) || [])]) v.storage[k] = 0;   // 녹일 원석 0 — 하루를 주조에
    v.storage.copper = 5; v.storage.tin = 5; v.storage.weapon = o.wpn == null ? 7.5 : o.wpn; v.storage.wood = 1000; v.storage.charcoal = 1000;
    if (o.stone != null) v.storage.stone = o.stone;
    if (o.st) Object.assign(v.storage, o.st);
    if (o.food != null) { for (const k of Object.keys(v.storage)) if (E.storageFoodPer && E.storageFoodPer(v, k) > 0) v.storage[k] = 0; v.storage.food = o.food; }
    if (o.tin != null) v.land.tin = o.tin;
    if (o.q != null) v._t1344Q = o.q;
    if (o.m0 != null) v._t1344M = o.m0;
    return v;
  };
  const day1 = (o) => {
    const _l = console.log; console.log = () => {};
    try {
      const v = mkV(o);
      const b0 = v._bronzeWeaponMade || 0, w0 = v.storage.weapon, st0 = v.storage.stone || 0, secF = E._foodSecF(v), q0 = v._t1344Q;
      E.tickVillage(v, 1);
      return { made: r6((v._bronzeWeaponMade || 0) - b0), cu: r6(5 - v.storage.copper), sn: r6(5 - v.storage.tin), dw: r6(v.storage.weapon - w0), dStone: r6(st0 - (v.storage.stone || 0)),
        secF: r6(secF), q0: q0 == null ? null : r6(q0), q: v._t1344Q == null ? null : r6(v._t1344Q), M: v._t1344M == null ? null : r6(v._t1344M), sf: r6(v._swordFrac) };
    } finally { console.log = _l; }
  };
  const CD = {
    stoneFull: day1({ job: 'smith', food: 2000 }),             // 석검 몫이 한도를 넘게 찬 곳간 · 청동 몫 0(켜는 날)
    half: day1({ job: 'smith', food: 2000, q: 0.5 }),          // 청동 몫 0.5 — 청동 근접검 1.875 < 3.24
    bzFull: day1({ job: 'smith', food: 2000, q: 1 }),          // 청동 몫 1 — 청동 근접검 3.75 ≥ 3.24
    fragile: day1({ job: 'smith', food: 0 }),                  // 취약 — 한도 = 전사 커버리지(2) · 근접검 전부로 센다
    mason: day1({ job: 'mason', food: 2000, tin: 1, stone: 50 }),   // 석공 첫 차례 · 청동 자격(땅 주석) · 병기고 모자람(근접검 3.75 < 7.2 × 0.85) · 대장장이 없음
    cuAg: day1({ job: 'smith', food: 2000, st: { tin: 0, silver: 1 } }),   // 주석 없는 잘 먹는 구리 마을(구리 5 · 은 1) — 오늘 배합은 청동이 아니다
  };
  // ④ 대장장이 자리 — 청동 자격 · 구리 · 주석 · 식량 넉넉 · 원석 0(녹임 자리 0) · 무기 곳간 20(근접검 10 ≥ 병기고 7.2 — 석검으로 찬 병기고)
  const st = (q, wpn) => { const _l = console.log; console.log = () => {}; try { const v = mkV({ food: 2000, tin: 1, q, wpn: wpn == null ? 20 : wpn }); return { t: E.smithTarget(v), smelt: E.smeltTarget ? E.smeltTarget(v) : null, secF: r6(E._foodSecF(v)) }; } finally { console.log = _l; } };
  const ST = { stone0: st(0), bz1: st(1), empty: st(0, 0), noTin: ((q) => { const _l = console.log; console.log = () => {}; try { const v = mkV({ food: 2000, tin: 1, q, wpn: 20 }); v.storage.tin = 0; return { t: E.smithTarget(v) }; } finally { console.log = _l; } })(0) };
  // ③ 섞음 — 가짜 마을 칸만(곳간 · 근접검 비중 · 오늘 칸)
  const mix = (o) => { const v = { storage: { weapon: o.w }, _swordFrac: o.sf, _swordMadeToday: o.sw, _bowMadeToday: 0, _t1344BzT: o.bz, _t1344Q: o.q, _t1344M: o.m0 }; E._t1344Mix(v); return { q: r6(v._t1344Q), M: r6(v._t1344M), bzT: v._t1344BzT, bs: r6(E._t1344BronzeStock(v)) }; };
  const MX = {
    first: mix({ w: 20, sf: 0.5, sw: 1, bz: 1 }),                 // 켜는 날 — 어제 곳간 = 오늘 10 − 오늘 만든 1 = 9 → 1 ÷ 10
    keep: mix({ w: 10, sf: 0.5, sw: 0, bz: 0, q: 0.1, m0: 10 }),  // 곳간이 반으로(내보냄) · 만든 것 0 → 몫 그대로 · 청동 근접검 0.5
    add: mix({ w: 14, sf: 0.5, sw: 2, bz: 2, q: 0.1, m0: 5 }),    // (0.1 × 5 + 2) ÷ (5 + 2)
    stone: mix({ w: 14, sf: 0.5, sw: 2, bz: 0, q: 0.5, m0: 5 }),  // 석검만 2 — (0.5 × 5) ÷ 7
    none: mix({ w: 10, sf: 0.5, sw: 0, bz: 0 }),                  // 만든 것 0 · 몫 없음 → 0
    cap: mix({ w: 10, sf: 0.5, sw: 1, bz: 5, q: 0, m0: 4 }),      // 오늘 청동 > 오늘 근접검(있을 수 없는 입력) — 청동은 근접검을 못 넘는다
  };
  // ⑥ 섞어 싣기 — 정본 함수(`_t1344MixPick`) · 가짜 다리(무게 정본 · 운반비 · 기대 손실은 첫째 다리 값)
  const leg = (o) => {
    const av = { name: 'A', storage: Object.assign({ rice: 300, copper: 30, fish: 60, wheat: 60 }, o.st || {}), counts: { warrior: o.war || 0 }, _banditRisk: 0 };
    const bv = { name: 'B', land: {} };
    const a = { v: av, prices: Object.assign({ rice: 1, copper: 0.3, fish: 0.05, wheat: 0.5 }, o.pa || {}) };
    const b = { v: bv, prices: Object.assign({ rice: 2, copper: 30, fish: 0.5, wheat: 1 }, o.pb || {}) };
    const best = { b, N_units: o.n == null ? 20 : o.n, cand: { res: o.main || 'rice' }, dist: 1692, transportCostPerUnit: 3.384, expectedLossRatio: 0.25 };
    const cands = o.cands || [{ res: 'rice', surplus: 150 }, { res: 'copper', surplus: 20 }, { res: 'fish', surplus: 40 }, { res: 'wheat', surplus: 40 }];
    const r = V2._t1344MixPick({}, a, best, cands, { mv: 1 }, 50, 0.95);
    const kg = (res) => V2._t1136Probe.kg(res);
    return { r: r ? { res: r.res, q: r.q, pu: r6(r.pu), tot: r6(r.tot), kg: r6(r.kg), room: r6(r.room) } : null, mainKg: r6(best.N_units * kg(best.cand.res)), cap: V2._t1136Probe.capKg(), kgCu: kg('copper'), kgRice: kg('rice'), kgFish: kg('fish'), kgWheat: kg('wheat') };
  };
  const MP = {
    base: leg({}),                                            // 쌀 20(15 kg) · 상인 하나 → 남는 10 kg → 구리 2 낱개(7 kg)
    over: leg({ n: 100 }),                                    // 쌀 100(75 kg) > 25 kg → 0
    esc: leg({ war: 3 }),                                     // 호위 1(쌀 20 ÷ 20) → 상한 50 kg → 남는 35 → 구리 10
    cheapCu: leg({ pb: { copper: 0.5, wheat: 9 } }),          // 구리 값 차가 없고 밀이 비싸면 밀(같은 규칙)
    noGain: leg({ pb: { copper: 0.3, fish: 0.05, wheat: 0.5 } }),   // 낱개 몫 ≤ 0 → 0
    fewCu: leg({ cands: [{ res: 'rice', surplus: 150 }, { res: 'copper', surplus: 1.6 }] }),   // 내보낼 몫 1.6 → 1 낱개(내림)
    lowSt: leg({ st: { copper: 0.9 } }),                      // 곳간 0.9 → 0 낱개 → 0
  };
  // ⑦ 판 — 마을 여섯 · 날 열(첫 출발 날의 첫째 화물 · 둘째 화물 · 장부 sent2)
  const run = () => {
    const _l = console.log; console.log = () => {};
    try {
      if (E.setSeed) E.setSeed(7);
      const w = V2.createWorldV2({ seed: 7, villageCount: 6, infoRange: 5000 });
      const deps = [], seen = new Set();
      for (let d = 0; d < 10; d++) {
        V2.tickWorldV2(w);
        for (const c of (w.caravans || [])) if (c && !seen.has(c.id)) { seen.add(c.id); deps.push({ id: c.id, day: c.departDay, from: c.from.name, to: c.to.name, res: c.giveRes, amt: r6(c.giveAmt), res2: c.giveRes2 || null, amt2: r6(c.giveAmt2 || 0) }); }
      }
      const s2 = (w.tradeLog || []).filter((r) => r && r.sent2).map((r) => ({ day: r.day, res: r.sent2.res, amt: r.sent2.amt }));
      return { deps, s2 };
    } finally { console.log = _l; }
  };
  const RUN = run();
  // ⑧ 글자
  const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8'), V2S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  const G = {
    oneFn: (SRC.match(/function _t1344BronzeStock\(v\)/g) || []).length,
    calls: (SRC.match(/_t1344BronzeStock\(v\)/g) || []).length - 1,
    smDef: (SRC.match(/if \(T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF && _melt && _melt\.bronzeness > 0\) _smSwordStock = _t1344BronzeStock\(v\);/g) || []).length,
    mason: (SRC.match(/\(\(T1344_BRONZE_STOCK && _secF > MELEE_ARMORY_SECF\) \? _t1344BronzeStock\(v\) : _swordStock\) < _bronzeArmoryCap/g) || []).length,
    t1333Gate: (SRC.match(/if \(_melt && \(_smSwordStock < _bronzeArmoryCap \|\| \(T1333_EXPORT_CAST && _t1333ExportCast\(v\)\)\)\) \{/g) || []).length,
    mixCall: (V2S.match(/\} else if \(T1344_MIX_LOAD\) \{[^\n]*\n        const _mx = _t1344MixPick\(world, a, best, candidates, lp, day, FORWARD_PRICE_MARGIN\);/g) || []).length,
    mixFn: (V2S.match(/function _t1344MixPick\(/g) || []).length,
  };
  process.stdout.write(JSON.stringify({ knobs: { b: E.T1344_BRONZE_STOCK, m: V2.T1344_MIX_LOAD }, CD, ST, MX, MP, RUN, G }) + '\n');
  process.exit(0);
}

// ── 어미 판 ──────────────────────────────────────────────────────────────────────────────
function child(arm, mut) {
  const env = Object.assign({}, process.env, { T1344_HARNESS_ARM: arm, T1344_MUTANT: mut || '' });
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  assert.strictEqual(r.status, 0, (r.stderr || '') + (r.stdout || ''));
  return JSON.parse(r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop());
}
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
function checks(P, out) {
  let pass = 0, fail = 0; const failed = [];
  const ok = (c, m, x) => { if (c) pass++; else { fail++; failed.push(m); } if (out) console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + (typeof x === 'string' ? x : JSON.stringify(x)) : '')); };
  const { off: O, b: B, m: M, bm: BM, k0: K0, ktrue: KT } = P;
  if (out) console.log('\n① 손잡이 — `\'1\'` 만 켬');
  ok(O.knobs.b === false && O.knobs.m === false && B.knobs.b === true && B.knobs.m === false && M.knobs.m === true && M.knobs.b === false && BM.knobs.b && BM.knobs.m, '★손잡이 둘 — 끔 기본 · 제 팔만 켬', [O.knobs, B.knobs, M.knobs, BM.knobs]);
  ok(K0.knobs.b === false && KT.knobs.b === false && KT.knobs.m === false, "'0' · 'true' = 끔", [K0.knobs, KT.knobs]);

  if (out) console.log('\n② 한 마을 하루 — 석검이 가득해도 청동 몫이 비면 붓는다 · 차면 안 붓는다');
  ok(O.CD.stoneFull.secF > 0.45 && O.CD.stoneFull.made === 0 && O.CD.stoneFull.cu === 0, `★끔 — 근접검 3.75(석검 포함) ≥ 청동 몫 한도 3.24 → 안 붓는다(종전 · 식량 안보 ${O.CD.stoneFull.secF})`, O.CD.stoneFull);
  ok(B.CD.stoneFull.made > 0 && B.CD.stoneFull.cu > 0 && B.CD.stoneFull.sn > 0, `★켬 — 같은 곳간 · 청동 몫 0 → 붓는다(청동 ${B.CD.stoneFull.made} · 구리 ${B.CD.stoneFull.cu} · 주석 ${B.CD.stoneFull.sn})`, B.CD.stoneFull);
  ok(B.CD.half.made > 0 && near(B.CD.half.made, B.CD.stoneFull.made), `켬 · 청동 몫 0.5(청동 근접검 1.875 < 3.24) → 붓는다(같은 양)`, B.CD.half);
  ok(B.CD.bzFull.made === 0 && B.CD.bzFull.cu === 0, '★켬 · 청동 몫 1(청동 근접검 3.75 ≥ 3.24) → 안 붓는다(청동 몫이 찼다)', B.CD.bzFull);
  ok(O.CD.fragile.secF === 0 && O.CD.fragile.made === 0 && B.CD.fragile.made === 0, '★취약 마을(식량 0 — 한도 = 전사 커버리지 2) — 켬이어도 근접검 전부로 센다(안 붓는다 · 종전)', [O.CD.fragile, B.CD.fragile]);
  ok(O.CD.cuAg.made === 0 && O.CD.cuAg.cu === 0 && B.CD.cuAg.made === 0 && B.CD.cuAg.cu === 0, '★주석 없는 잘 먹는 구리 마을(구리 5 · 은 1 — 배합이 청동 아님) — 켬이어도 종전 곳간(근접검 3.75 ≥ 3.24)으로 잰다 → 안 붓는다(청동 몫을 못 채우는 배합이 문을 열지 않는다)', [O.CD.cuAg, B.CD.cuAg]);
  ok(JSON.stringify(M.CD) === JSON.stringify(O.CD), '섞어 싣기만 켠 판의 한 마을 하루 = 끔 판(마을 하루를 안 건드린다)', M.CD.stoneFull);
  ok(O.CD.stoneFull.q === null && O.CD.stoneFull.M === null, '★끔 — 청동 몫 칸이 서지 않는다(마을에 새 칸 0)', O.CD.stoneFull);
  const sw1 = B.CD.stoneFull.made;   // 대장장이 하나가 오늘 부은 청동(= 오늘 근접검 — 석공 · 활 0)
  ok(B.CD.stoneFull.q > 0 && B.CD.stoneFull.M > 0 && near(B.CD.stoneFull.q, sw1 / (Math.max(0, B.CD.stoneFull.M - sw1) + sw1), 1e-4), `켬 — 하루 끝 청동 몫 ${B.CD.stoneFull.q} = 오늘 청동 ÷ (어제 근접검 + 오늘 근접검)(켜는 날 어제 = 오늘 − 오늘 만든 것)`, B.CD.stoneFull);

  if (out) console.log('\n③ 청동 몫 섞음 — 곳간 가중');
  ok(near(B.MX.first.q, 0.1) && near(B.MX.first.M, 10) && B.MX.first.bzT === 0, '켜는 날 — 1 ÷ (9 + 1) = 0.1 · 어제 칸 10 · 오늘 칸 0', B.MX.first);
  ok(near(B.MX.keep.q, 0.1) && near(B.MX.keep.bs, 0.5), '★곳간이 반으로(내보냄 · 부패 — 비례) · 만든 것 0 → 몫 그대로 · 청동 근접검 0.5', B.MX.keep);
  ok(near(B.MX.add.q, 2.5 / 7), '★청동 2 를 만든 날 — (0.1 × 5 + 2) ÷ (5 + 2)', B.MX.add);
  ok(near(B.MX.stone.q, 2.5 / 7), '석검만 2 — (0.5 × 5) ÷ 7(석검이 청동 몫을 묽힌다)', B.MX.stone);
  ok(B.MX.none.q === 0, '만든 것 0 · 몫 없음 → 0', B.MX.none);
  ok(near(B.MX.cap.q, 1 / 5), '청동은 오늘 근접검을 못 넘는다(입력 5 → 1 · (0 × 4 + 1) ÷ 5)', B.MX.cap);

  if (out) console.log('\n④ 대장장이 자리(`smithTarget`) — 청동 몫이 비면 선다');
  ok(O.ST.stone0.t === 0 && O.ST.stone0.secF > 0.45, '★끔 — 석검으로 찬 병기고(근접검 10 ≥ 7.2) · 원석 0 → 자리 0(종전)', O.ST.stone0);
  ok(B.ST.stone0.t >= 1, `★켬 — 같은 마을 · 청동 몫 0 → 자리 ${B.ST.stone0.t}(청동 몫 결손)`, B.ST.stone0);
  ok(B.ST.bz1.t === 0, '켬 · 청동 몫 1(청동 근접검 10 ≥ 3.24) → 자리 0', B.ST.bz1);
  ok(B.ST.empty.t >= O.ST.empty.t && O.ST.empty.t >= 1, '빈 병기고 — 종전 목표(병기고 전체)와 큰 쪽(켬이 끔보다 작지 않다)', [O.ST.empty, B.ST.empty]);
  ok(B.ST.noTin.t === O.ST.noTin.t, '주석 0 마을 — 켬이어도 청동 몫 자리는 안 선다(청동을 부을 주석이 없다 · 끔과 같다)', [O.ST.noTin, B.ST.noTin]);

  if (out) console.log('\n⑤ 석공 — 청동 우선권(`_bronzeNow`)');
  //   (다른 주민의 하루 — 사냥꾼 활 · 석공 도구 돌 0.2 — 는 두 판 같다: 대장장이 판 끔 dw 0.36 · 돌 0.2 가 그 바닥)
  const swStone = +(O.CD.mason.dStone - B.CD.mason.dStone).toFixed(6);
  ok(O.CD.mason.dw > O.CD.stoneFull.dw && O.CD.mason.dStone > O.CD.stoneFull.dStone, `★끔 — 병기고 모자람 · 근접검 3.75 ≥ 청동 몫 한도 → 청동 차례 없음 → 석공이 석검(무기 +${O.CD.mason.dw} · 돌 ${O.CD.mason.dStone} — 바닥 +${O.CD.stoneFull.dw} · ${O.CD.stoneFull.dStone})`, O.CD.mason);
  ok(near(B.CD.mason.dw, O.CD.stoneFull.dw) && near(B.CD.mason.dStone, O.CD.stoneFull.dStone) && near(swStone, 0.5), `★켬 — 청동 몫이 비어 청동 차례(구리 · 주석 있음) → 석공이 비켜 선다(석검 0 — 무기 · 돌이 바닥 그대로 · 끔과 차이 = 석검 한 자루 돌 ${swStone})`, B.CD.mason);

  if (out) console.log('\n⑥ 섞어 싣기 — 남는 무게 · 짐 몫 최대 하나');
  const b0 = M.MP.base;
  ok(b0.r && b0.r.res === 'copper' && b0.r.q === 2 && near(b0.r.room, b0.cap - b0.mainKg) && b0.r.kg <= b0.r.room + 1e-9, `★쌀 20(${b0.mainKg} kg) · 상인 하나(${b0.cap} kg) → 남는 ${b0.r && b0.r.room} kg 에 구리 ${b0.r && b0.r.q} 낱개(${b0.r && b0.r.kg} kg) — 짐 몫 ${b0.r && b0.r.tot}`, b0.r);
  ok(M.MP.over.r === null, '★첫째 화물이 이미 상한을 넘으면(쌀 100 = 75 kg) 안 얹는다', M.MP.over);
  ok(M.MP.esc.r && M.MP.esc.r.res === 'copper' && M.MP.esc.r.q === 10 && near(M.MP.esc.r.room, 2 * M.MP.esc.cap - M.MP.esc.mainKg), `호위 1 → 상한 ${2 * M.MP.esc.cap} kg → 구리 ${M.MP.esc.r && M.MP.esc.r.q}`, M.MP.esc.r);
  ok(M.MP.cheapCu.r && M.MP.cheapCu.r.res === 'wheat', '★품목 특례 0 — 구리 값 차가 없고 밀이 비싸면 밀(같은 규칙 · 값이 정한다)', M.MP.cheapCu.r);
  ok(M.MP.noGain.r === null, '낱개 몫 ≤ 0(첫째와 같은 식)이면 안 얹는다', M.MP.noGain);
  ok(M.MP.fewCu.r && M.MP.fewCu.r.q === 1 && M.MP.lowSt.r === null || (M.MP.lowSt.r && M.MP.lowSt.r.res !== 'copper'), '낱개 단위 — 내보낼 몫 1.6 → 1 · 곳간 0.9 → 구리 0', [M.MP.fewCu.r, M.MP.lowSt.r]);
  ok(['base', 'esc', 'cheapCu', 'fewCu'].every((k) => M.MP[k].r && M.MP[k].r.kg <= M.MP[k].r.room + 1e-9), '★무게 상한 안 — 얹은 kg ≤ 남는 kg(네 판 다)', ['base', 'esc', 'cheapCu', 'fewCu'].map((k) => M.MP[k].r && [M.MP[k].r.kg, M.MP[k].r.room]));

  if (out) console.log('\n⑦ 판 — 마을 여섯 · 날 열');
  const d2 = M.RUN.deps.filter((d) => d.res2), firstDay = O.RUN.deps.length ? O.RUN.deps[0].day : null;
  ok(O.RUN.deps.length > 0 && O.RUN.deps.every((d) => d.res2 === null) && O.RUN.s2.length === 0 && B.RUN.deps.every((d) => d.res2 === null), `★끔(· 병기고만) — 둘째 화물 0 · 장부 sent2 0(출발 ${O.RUN.deps.length})`, O.RUN.s2);
  ok(d2.length > 0 && M.RUN.s2.length > 0, `★켬 — 둘째 화물 ${d2.length} 줄(${[...new Set(d2.map((d) => d.res2))].join(' · ')}) · 장부 sent2 ${M.RUN.s2.length}`, d2.slice(0, 3));
  //   첫 둘째 화물까지(그 출발 포함)는 두 판의 세계가 같다 — 그 앞 출발은 다 같고, 그 출발의 첫째 화물(목적지 · 품목 · 양)도 같아야 한다(섞어 싣기는 첫째를 고른 뒤 남는 무게에만)
  const k1 = M.RUN.deps.findIndex((d) => d.res2), key = (d) => [d.id, d.day, d.from, d.to, d.res, d.amt].join('|');
  const pre = k1 >= 0 ? M.RUN.deps.slice(0, k1 + 1) : [], preO = O.RUN.deps.slice(0, k1 + 1);
  ok(k1 >= 0 && pre.length === preO.length && pre.every((d, i) => key(d) === key(preO[i])) && preO[k1].res2 === null,
    `★첫 둘째 화물(출발 ${k1 + 1}번째 · 날 ${k1 >= 0 ? pre[k1].day : '—'} · ${k1 >= 0 ? pre[k1].from + '→' + pre[k1].to + ' ' + pre[k1].res + '×' + pre[k1].amt + ' + ' + pre[k1].res2 + '×' + pre[k1].amt2 : ''})까지 첫째 화물이 끔 판과 같다 — 섞어 싣기는 첫째를 안 줄인다`, k1 >= 0 ? [preO[k1], pre[k1]] : null);

  if (out) console.log('\n⑧ 글자 — 함수 하나 · 부르는 자리');
  ok(O.G.oneFn === 1 && O.G.calls === 3 && O.G.smDef === 1 && O.G.mason === 1, '★청동 근접검 함수 하나 · 부르는 자리 셋(주조 문 곳간 · 석공 문 · 대장장이 자리) — 사본 0', O.G);
  ok(O.G.t1333Gate === 1, 'T1333 주조 문 글자 그대로(곳간 이름이 켬에서 청동 근접검으로 선다)', O.G.t1333Gate);
  ok(O.G.mixFn === 1 && O.G.mixCall === 1, '섞어 싣기 함수 하나 · 부르는 자리 하나(`else if` — T206 둘째 화물이 먼저)', O.G);
  return { pass, fail, failed };
}

console.log('=== test-t1344-bronze-mix — 청동 몫 곳간 · 섞어 싣기(끔 기본 둘) ===');
const P = { off: child('off'), b: child('b'), m: child('m'), bm: child('bm'), k0: child('k0'), ktrue: child('ktrue') };
const R = checks(P, true);
console.log('\n⑨ 미끼 — 한 줄 바꾼 사본은 빨강이어야 한다');
const BAITS = ['allstock', 'emaq', 'nosecf', 'anyrecipe', 'overkg', 'nomain', 'shrink'];
let bait = 0;
for (const mut of BAITS) {
  const Q = { off: child('off', mut), b: child('b', mut), m: child('m', mut), bm: child('bm', mut), k0: child('k0', mut), ktrue: child('ktrue', mut) };
  const r = checks(Q, false);
  const red = r.fail > 0;
  if (red) bait++;
  console.log(`  ${red ? '✓' : '✗'} 미끼 ${mut} — ${red ? '빨강 ' + r.fail + ': ' + r.failed.slice(0, 2).join(' / ').slice(0, 160) : '초록(자명 통과 — 자가 못 잡는다)'}`);
}
const total = R.pass + R.fail;
console.log(`\n=== ${R.pass}/${total} ${R.fail ? '✗' : '✓'} (미끼 ${bait}/${BAITS.length}) ===`);
process.exitCode = (R.fail || bait < BAITS.length) ? 1 : 0;
