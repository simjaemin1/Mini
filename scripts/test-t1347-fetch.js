#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 10   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1347-fetch.js — 받아 올 짐(`T1347_FETCH`) · 섞어 싣기 목적지 발주만(`T1347_MIX_DEST`) — 끔 기본 둘(T1347 · T1344 회부 2 · 3) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · 정본 틱 조각(`tickWorldV2Parts`)을 그대로 부른다 · 날짜 · 벽시계 0 — 판 날만 센다):
//   ① 손잡이 — `'1'` 만 켬(없음 · '0' · 'true' = 끔)
//   ② 발주 = 파생수요 정본(`derivedInputTarget` > 곳간) — 청동 조리법(구리 있고 주석 없으면 주석 · 거꾸로 구리) · 둘 다 없거나 넉넉하면 0 ·
//      숯(캐는 마을 — 합금 발주 손잡이와 무관 · 품목 특례 0) · 합금 발주 끔이면 구리 · 주석 0(T1347 은 품목을 보태지 않는다) ·
//      발주 열 = 정본 함수로 센 모자람 열(사본 0) · 마을-날 한 번(같은 날 곳간이 바뀌어도 그날 열 · 다음 날 다시 센다) · 이웃 존 스텁 · 곳간 없음 = 0
//   ③ 파는 쪽 문(`_t1347Sells`) — 실물 > 1 · 제가 발주한 품목은 안 판다 · 스텁은 안 판다 /
//      다리 문(`_t1347Buys`) — 집 발주 가운데 그곳이 파는 것(판 짐 · 집 글럿 빼고) · 금속 아닌 품목도 같은 문
//   ④ 섞어 싣기 목적지 발주(`_t1344MixPick` 정본 함수) — 켬 = 목적지 발주 품목만(그 안에선 T1344 규칙 그대로) · 발주 0 = 안 얹는다 · 끔 = T1344 그대로
//   ⑤ 판 끔(마을 여섯 · 날 60 · 정본 틱 조각) — 훅 0 · 마을에 새 칸(`_t1347O`) 0 · 목적지 발주 손잡이만 켠 판 = 끔 판(섞어 싣기 없이는 무동작)
//   ⑥ 판 받아 올 짐 — 받아 올 짐이 실제로 바뀐다 · 바뀐 짐은 다 그날 집 발주 · 그곳이 판다 · 판 짐 아님 · 집 글럿 아님 ·
//      값 비 최대(종전 받아 올 짐의 자 — 떠날 때 정산에 찍힌 값) · 발주 금속(구리 · 주석)을 받아 온 줄이 끔 판보다 많다 ·
//      다리를 실제로 갈아 탄다 · 갈아 탄 다리는 이익 ≥ 종전 × `FOOD_PULL_TOL`(P2 와 같은 수 — 소스에서 읽는다) · 그곳이 집 발주를 판다
//   ⑦ 판 굶는 마을 · 아무 품목(픽스처 — 두 마을에 발주 열을 꽂는다(삼 · 약초 · 옷 — 금속 아님) · 그 가운데 한 마을은 날마다 식량 EMA 를 음으로):
//      굶는 마을은 받아 올 짐 다리 · 받아 올 짐 0(P2 · P1b 가 먼저 — 생존 우선 · 그 마을 캐러밴은 떠난다) ·
//      꽂은 품목도 같은 규칙으로 받아 온다 · 고를 품목이 둘 이상인 날이 있다(값 비 최대가 물 자리) ·
//      섞어 싣기 둘째 화물은 다 그날 목적지 발주 · 둘째 화물이 선다
//   ⑧ 글자 — 발주 함수 하나 · 부르는 자리 셋 · 파생수요 비교 한 줄(사본 0) · 다리 문 부르는 자리 하나 · P2 줄 그대로 · 관용 수 하나(새 수 0) ·
//      받아 올 짐 블록은 P1b · 돌 pull 뒤 · 위기 계측 앞 · 섞어 싣기 거르개 한 줄(`_t1344MixPick` 안 · 무게 줄 앞) · 손잡이는 `'1'` 비교 한 줄씩
//   ⑨ 미끼(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 어느 단언이 빨강이 되는지 단언한다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 싣는다):
//      notol(관용 없이 갈아 탄다 → L2) · legany(발주를 안 파는 다리도 → L2) · crisisleg(굶는 마을도 다리 → C1) · crisisret(굶는 마을도 받아 올 짐 → C1) ·
//      nosells(그곳이 안 파는 발주 → R2) · minratio(값 비 최대 대신 첫째 → R3) · ownorder(제 발주도 판다 → S1) · ordge(모자람을 ≥ 로 — 목표 0 · 곳간 0 도 발주 → O2) ·
//      nocache(마을-날 한 번이 아니다 → O6) · mixany(섞어 싣기 거르개를 뺀다 → M1)
//
// 실행: node scripts/test-t1347-fetch.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1347_HARNESS_ARM || '', MUT = process.env.T1347_MUTANT || '';
const V2F = 'sim/economy-sim-v2.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔 · 빨강이 되어야 할 단언]
const BAITS = {
  notol: [V2F, 'bestO.profit >= best.profit * FOOD_PULL_TOL) {', 'bestO.profit >= 0) {', ['f'], ['L2']],
  legany: [V2F, '(!bestO || totalProfit > bestO.profit) && _t1347Buys(a.v, b.v, cand.res, day)) {', '(!bestO || totalProfit > bestO.profit)) {', ['f'], ['L2']],
  crisisleg: [V2F, 'if (T1347_FETCH && !_crisisA && (!bestO', 'if (T1347_FETCH && (!bestO', ['fx'], ['C1']],
  crisisret: [V2F, 'if (T1347_FETCH && !(c.from.surplusEMA && c.from.surplusEMA.food < 0)) {', 'if (T1347_FETCH) {', ['fx'], ['C1']],
  nosells: [V2F, 'if (r === c.giveRes || !_t1347Sells(c.to, r, day) || _returnGlutted(r)) continue;', 'if (r === c.giveRes || _returnGlutted(r)) continue;', ['f'], ['R2']],
  minratio: [V2F, 'if (ratio > _fRatio) { _fRatio = ratio; _fR = r; }', 'if (!_fR) { _fRatio = ratio; _fR = r; }', ['fx'], ['R3']],
  ownorder: [V2F, 'v1.seedReserveAvail(v, r) > 1 && !_t1347Ordered(v, r, day);', 'v1.seedReserveAvail(v, r) > 1;', ['u1'], ['S1']],
  ordge: [V2F, 'if (v1.derivedInputTarget(v, r) > (v.storage[r] || 0)) list.push(r);', 'if (v1.derivedInputTarget(v, r) >= (v.storage[r] || 0)) list.push(r);', ['u1'], ['O2']],
  nocache: [V2F, '  if (c && c.day === day) return c.list;\n', '', ['u1'], ['O6']],
  mixany: [V2F, '    if (T1347_MIX_DEST && !_t1347Ordered(b.v, c2.res, day)) continue;', '', ['u1'], ['M1']],
};
const WORLD_DAYS = 60;   // 판 날(마을 여섯) — 받아 올 짐 · 다리 갈아 타기가 둘 다 서는 길이(날 8 ~ 58)

// ── 아이 판 ──────────────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of ['T1347_FETCH', 'T1347_MIX_DEST', 'T1333_ALLOY_ORDER', 'T1344_MIX_LOAD', 'T1344_BRONZE_STOCK', 'T1333_EXPORT_CAST', 'T1333_WS_INPUT', 'COPPER_DERIV', 'L_CARGO_TWO', 'T1136_BASKET']) delete process.env[k];
  const on = (k) => { process.env[k] = '1'; };
  if (ARM === 'k0') { process.env.T1347_FETCH = '0'; process.env.T1347_MIX_DEST = '0'; }
  if (ARM === 'kt') { process.env.T1347_FETCH = 'true'; process.env.T1347_MIX_DEST = 'true'; }
  if (['u1', 'off', 'd', 'f', 'fx'].includes(ARM)) on('T1333_ALLOY_ORDER');   // 합금 발주 — 구리 · 주석 발주가 서는 자리(끔이면 숯 · 돌 · 말뚝만)
  if (['u1', 'f', 'fx'].includes(ARM)) on('T1347_FETCH');
  if (['u1', 'd', 'fx'].includes(ARM)) on('T1347_MIX_DEST');
  if (ARM === 'fx') on('T1344_MIX_LOAD');
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knobs: null, U: null, W: null };
  if (MUT) {   // 미끼 — 정본 파일을 읽어 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
    const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
    if (!B) out.loadErr = 'bait unknown ' + MUT;
    else M._extensions['.js'] = function (m, f) {
      if (f !== path.join(ROOT, B[0])) return old(m, f);
      const x = fs.readFileSync(f, 'utf8');
      if (x.split(B[1]).length !== 2) throw new Error('bait site count ' + MUT);
      m._compile(x.replace(B[1], B[2]), f);
    };
  }
  let E = null, V2 = null;
  const _l0 = console.log; console.log = () => {};
  try { E = require(path.join(ROOT, 'sim', 'economy-sim.js')); V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js')); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  console.log = _l0;
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const er = (e) => ({ err: String((e && e.message) || e).slice(0, 200) });
  if (V2) out.knobs = { fetch: V2.T1347_FETCH, dest: V2.T1347_MIX_DEST };
  // ② ③ ④ 한 마을 · 가짜 다리 — test-t1344-bronze-mix 의 픽스처 땅(구리 땅 · 사람 10)
  const LP = { fertility: 0.32, arable: 1, water: 0.08, wood: 0.67, game: 0.74, stone: 2.13, ore: 0.24, size: 138, baseSize: 138, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, oreMix: { copper: 0.9, gold: 0.05, silver: 0.05 }, oreGrade: 0.5153, oreP: 0.0909, oreDist: 0.4, coastal: false };
  const mkV = (o) => {
    if (E.setSeed) E.setSeed(1);
    const v = E.createVillage({ ...LP, name: 'T1347V', initialPop: 10 });
    if (o.job) { const sm = v.npcs[0]; v.counts[sm.currentJob] = (v.counts[sm.currentJob] || 0) - 1; sm.currentJob = o.job; v.counts[o.job] = (v.counts[o.job] || 0) + 1; }
    v.storage.ore = 0; for (const k of ['copper', 'tin', 'lead', 'silver', 'gold', 'iron', 'arsenic', ...((E.OreGoods && E.OreGoods.ids) || [])]) v.storage[k] = 0;
    Object.assign(v.storage, o.st || {});
    return v;
  };
  if (V2 && (ARM === 'u0' || ARM === 'u1')) {
    const U = out.U = {};
    const T = (k, f) => { try { U[k] = quiet(f); } catch (e) { U[k] = er(e); } };
    const TR = Object.keys(V2.ELASTICITY || {});
    const deficit = (v) => TR.filter((r) => E.derivedInputTarget(v, r) > (v.storage[r] || 0));   // 정본 함수로 센 모자람(엔진 발주 열과 견줄 자)
    const ORD = {
      cu5sn0: { job: 'smith', st: { copper: 5, tin: 0 } },     // 구리 있고 주석 없음 — 청동 조리법이 주석을 부른다
      cu0sn5: { job: 'smith', st: { copper: 0, tin: 5 } },     // 거꾸로 — 구리
      cu0sn0: { job: 'smith', st: { copper: 0, tin: 0 } },     // 둘 다 없음 — 청동을 짤 수 없다(발주 0)
      cu1sn1: { job: 'smith', st: { copper: 1, tin: 1 } },     // 둘 다 조금 — 모자란 쪽만
      cu50sn50: { job: 'smith', st: { copper: 50, tin: 50 } }, // 넉넉 — 발주 0
      char: { job: 'miner', st: { ore: 5, charcoal: 0 } },     // 캐는 마을 · 숯 0 — 숯(금속 아님 · 합금 발주와 무관)
    };
    T('ord', () => { const r = {}; for (const [k, o] of Object.entries(ORD)) { const v = mkV(o); r[k] = { L: V2._t1347Orders(v, 3).slice(), D: deficit(v) }; } return r; });
    T('cache', () => { const v = mkV(ORD.cu5sn0); const a = V2._t1347Orders(v, 5).slice(); v.storage.tin = 100; const b = V2._t1347Orders(v, 5).slice(); const c = V2._t1347Orders(v, 6).slice(); return { a, b, c, day: v._t1347O ? v._t1347O.day : null }; });
    T('stub', () => ({ xz: V2._t1347Orders({ _xz: true, storage: { tin: 0 }, npcs: [] }, 1), nost: V2._t1347Orders({ name: 'x' }, 1), nul: V2._t1347Orders(null, 1), sxz: V2._t1347Sells({ _xz: true, storage: { tin: 50 } }, 'tin', 1) }));
    T('sells', () => {
      const s = mkV({ st: { tin: 10 } });
      const r = { own0: V2._t1347Orders(s, 7).slice(), t10: V2._t1347Sells(s, 'tin', 7) };
      s.storage.tin = 0.5; r.t05 = V2._t1347Sells(s, 'tin', 7);
      s.storage.tin = 10; s._t1347O = { day: 8, list: ['tin'] }; r.own = V2._t1347Sells(s, 'tin', 8);   // 그 마을이 제가 발주한 품목(발주 열을 꽂는다 — 정본 칸 문법)
      return r;
    });
    T('buys', () => {
      const a = mkV({}), b = mkV({ st: { tin: 10, barley: 50 } }), b2 = mkV({ st: { tin: 10, barley: 0 } }), b3 = mkV({ st: { tin: 0.5, barley: 0 } });
      a._t1347O = { day: 9, list: ['tin', 'barley'] };
      const r = { sold: V2._t1347Buys(a, b, 'rice', 9), giveTin: V2._t1347Buys(a, b2, 'tin', 9), noStock: V2._t1347Buys(a, b3, 'rice', 9) };
      const g = mkV({ st: { tin: 1e6 } }); g._t1347O = { day: 9, list: ['tin'] }; r.glut = V2._t1347Buys(g, b, 'rice', 9);   // 집이 이미 글럿(받아 올 짐 문과 같은 닫개)
      const f = mkV({}); f._t1347O = { day: 9, list: ['barley'] }; r.anyItem = V2._t1347Buys(f, b, 'rice', 9);   // 금속 아닌 발주도 같은 문
      return r;
    });
    T('mix', () => {   // 섞어 싣기 — 정본 함수(`_t1344MixPick`) · 가짜 다리(test-t1344-bronze-mix ⑥ 픽스처) · 목적지 발주 열을 꽂는다(날 50)
      const leg = (o) => {
        const av = { name: 'A', storage: { rice: 300, copper: 30, fish: 60, wheat: 60 }, counts: { warrior: 0 }, _banditRisk: 0 };
        const bv = { name: 'B', land: {}, storage: {} };
        if (o.ord) bv._t1347O = { day: 50, list: o.ord };
        const a = { v: av, prices: { rice: 1, copper: 0.3, fish: 0.05, wheat: 0.5 } };
        const b = { v: bv, prices: { rice: 2, copper: 30, fish: 10, wheat: 8 } };   // 밀 · 물고기도 남는다(낱개 몫 > 0) — 짐 몫은 구리 > 밀 > 물고기
        const best = { b, N_units: 20, cand: { res: 'rice' }, dist: 1692, transportCostPerUnit: 3.384, expectedLossRatio: 0.25 };
        const cands = o.cands || [{ res: 'rice', surplus: 150 }, { res: 'copper', surplus: 20 }, { res: 'fish', surplus: 40 }, { res: 'wheat', surplus: 40 }];
        const p = V2._t1344MixPick({}, a, best, cands, { mv: 1 }, 50, 0.95);
        return p ? { res: p.res, q: p.q, tot: +(+p.tot).toFixed(6), kg: +(+p.kg).toFixed(6) } : null;
      };
      const ALL = ['rice', 'copper', 'fish', 'wheat'];
      return { all: leg({}), wheat: leg({ ord: ['wheat'] }), cu: leg({ ord: ['copper'] }), none: leg({ ord: [] }), every: leg({ ord: ALL }), fw: leg({ ord: ['fish', 'wheat'] }),
        fwRef: leg({ ord: ALL, cands: [{ res: 'rice', surplus: 150 }, { res: 'fish', surplus: 40 }, { res: 'wheat', surplus: 40 }] }) };   // 다 발주 + 후보를 물고기 · 밀로 줄인 판 = T1344 고르기
    });
  }
  // ⑤ ⑥ ⑦ 판 — 마을 여섯(구리 · 주석 · 들 × 2 · test-lab-stone ⑨ 세계 꼴) · 정본 틱 조각
  if (V2 && ['off', 'd', 'f', 'fx'].includes(ARM)) {
    const W = out.W = { err: null };
    try {
      quiet(() => {
        const w = V2.createWorldV2({ seed: 908, villageCount: 0, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
        w.villages = []; w.events = []; w.caravans = [];
        const KIND = [
          { ore: 0.6, oreMix: { copper: 0.9, gold: 0.05, silver: 0.05 }, stone: 2.0 },   // 구리 땅
          { ore: 0.6, oreMix: { tin: 0.9, lead: 0.1 }, stone: 1.5 },                    // 주석 땅
          { ore: 0.0, stone: 1.0 },                                                      // 들
        ];
        for (let i = 0; i < 6; i++) {
          const b = KIND[i % 3];
          const o = { fertility: 1.2, water: 0.9, stone: b.stone, ore: b.ore, wood: 1.2, game: 0.7, arable: 1, size: 70, initialPop: 40, name: 'T1347W' + i };
          if (b.oreMix) o.oreMix = b.oreMix;
          const v = E.createVillage(o);
          v._world = w; v.coord = { x: (i % 3) * 120, y: Math.floor(i / 3) * 120 };
          w.villages.push(v);
        }
        w.day = 0;
        const X = w.villages[2], Y = w.villages[5], FX = ARM === 'fx';
        const GEN = ['hemp', 'herb', 'clothes'];   // ⑦ 꽂는 발주(금속 아님 — 같은 규칙이 아무 품목에 선다)
        W.xName = X.name; W.yName = Y.name; W.gen = GEN;
        const PR = V2._t1188Probe || {};
        const isOre = (r) => !!(E.T1188_ORE_SPLIT && E.OreGoods && E.OreGoods.isOre && E.OreGoods.isOre(r));
        const stamp = new Map();   // 떠날 때 정산에 쓰는 찍힌 장(값표) — 정산이 지우기 전에 잡아 둔다
        const leg = [], ret = [];
        w.onT1347 = (k, day, x, o, n) => {
          try {
            if (k === 'leg') {
              leg.push({ day, home: x.name, real: o.b !== n.b || o.cand.res !== n.cand.res, p0: o.profit, p1: n.profit,
                buys: V2._t1347Buys(x, n.b.v, n.cand.res, day), crisis: !!(x.surplusEMA && x.surplusEMA.food < 0) });
            } else {
              const c = x, P = stamp.get(c.id), home = c.from, at = c.to;
              const ords = V2._t1347Orders(home, day);
              const elig = [];
              for (const r of ords) {
                if (r === c.giveRes || !V2._t1347Sells(at, r, day) || (PR.returnGlutted && PR.returnGlutted(home, r))) continue;
                if (isOre(r) && (!P || !(P.pricesFrom[r] > 0) || !(P.pricesTo[r] > 0))) continue;
                elig.push([r, P ? PR.quote(P.pricesFrom, r) / PR.quote(P.pricesTo, r) : NaN]);
              }
              let am = null, amq = 0;
              for (const [r, q] of elig) if (q > amq) { amq = q; am = r; }
              ret.push({ day, home: home.name, at: at.name, r0: o, r1: n, real: o !== n, inOrd: ords.includes(n), sells: V2._t1347Sells(at, n, day),
                give: n === c.giveRes, glut: !!(PR.returnGlutted && PR.returnGlutted(home, n)), nElig: elig.length, argmax: am, stamp: !!P,
                crisis: !!(home.surplusEMA && home.surplusEMA.food < 0) });
            }
          } catch (e) { W.err = W.err || ('hook ' + String((e && e.message) || e).slice(0, 200)); }
        };
        let s2n = 0, s2in = 0, yDeps = 0; const s2bad = [];
        for (let d = 0; d < WORLD_DAYS; d++) {
          stamp.clear();
          for (const c of (w.caravans || [])) if (c._t707) stamp.set(c.id, c._t707);
          if (FX) for (const v of [X, Y]) v._t1347O = { day: w.day + 1, list: GEN.slice() };   // 오늘(머리가 날을 올린 뒤) 발주 열 — 정산 · 교역이 같은 열을 본다
          const P = V2.tickWorldV2Parts(w);
          P.head();
          for (const v of w.villages) P.village(v);
          if (FX && Y.surplusEMA) Y.surplusEMA.food = -1;   // 굶는 마을 — 교역 · 다음 날 머리 정산이 이 값을 본다(마을 틱이 다시 세우면 또 덮는다)
          const before = new Set((w.caravans || []).map((c) => c.id));
          P.trade();
          for (const c of (w.caravans || [])) {
            if (before.has(c.id)) continue;
            if (c.from === Y) yDeps++;
            if (c.giveRes2) {
              s2n++;
              const o = c.to._t1347O, inD = !!(o && o.day === w.day && o.list.includes(c.giveRes2));
              if (inD) s2in++; else if (s2bad.length < 4) s2bad.push([w.day, c.from.name, c.to.name, c.giveRes2]);
            }
          }
          P.caravans(); P.tail();
        }
        const TOLm = fs.readFileSync(path.join(ROOT, V2F), 'utf8').match(/const FOOD_PULL_TOL = ([\d.]+);/);   // P2 관용 수 — 엔진 소스에서 읽는다(하네스에 사본 0)
        const TOL = TOLm ? +TOLm[1] : NaN;
        const metal = (w.tradeLog || []).filter((r) => r && r.bought && (r.bought.res === 'copper' || r.bought.res === 'tin'));
        W.tol = TOL;
        W.nLeg = leg.length; W.legReal = leg.filter((l) => l.real).length;
        const legBad = leg.filter((l) => !(l.p1 >= l.p0 * TOL - 1e-9) || !l.buys);
        W.legBadN = legBad.length; W.legBad = legBad.slice(0, 3);
        W.legMinRatio = leg.length ? +Math.min(...leg.map((l) => (l.p0 > 0 ? l.p1 / l.p0 : 1))).toFixed(4) : null;
        W.nRet = ret.length; W.retReal = ret.filter((r) => r.real).length;
        const retBad = ret.filter((r) => !r.inOrd || !r.sells || r.give || r.glut);
        W.retBadN = retBad.length; W.retBad = retBad.slice(0, 3);
        const argBad = ret.filter((r) => !r.stamp || r.argmax !== r.r1);
        W.retArgBadN = argBad.length; W.retArgBad = argBad.slice(0, 3);
        W.retMulti = ret.filter((r) => r.nElig > 1).length;
        W.yEv = leg.filter((l) => l.home === Y.name).length + ret.filter((r) => r.home === Y.name).length;
        W.crisisEv = leg.filter((l) => l.crisis).length + ret.filter((r) => r.crisis).length;
        W.yDeps = yDeps;
        W.xRetGen = ret.filter((r) => r.home === X.name && r.real && GEN.includes(r.r1)).length;
        W.retItems = [...new Set(ret.filter((r) => r.real).map((r) => r.r1))].sort();
        W.oFields = w.villages.filter((v) => v._t1347O !== undefined).length;
        W.metalN = metal.length; W.metalAmt = +metal.reduce((s, r) => s + (+r.bought.amt || 0), 0).toFixed(2);
        W.trade = (w.tradeLog || []).length;
        W.s2 = { n: s2n, inDest: s2in, bad: s2bad };
        W.digest = crypto.createHash('md5').update(JSON.stringify({ tl: w.tradeLog || [], st: w.villages.map((v) => [v.npcs.length, Object.keys(v.storage).sort().map((k) => [k, +(+v.storage[k] || 0).toFixed(9)])]) })).digest('hex');
      });
    } catch (e) { W.err = W.err || String((e && e.message) || e).slice(0, 300); }
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 어미 판 ──────────────────────────────────────────────────────────────────────────────
function child(arm, mut) {
  const env = Object.assign({}, process.env, { T1347_HARNESS_ARM: arm, T1347_MUTANT: mut || '' });
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = String(r.stdout || '').trim().split('\n').filter((l) => l.startsWith('{')).pop();
  if (r.status !== 0 || !line) return { arm, crash: (String(r.stderr || '') + String(r.stdout || '')).slice(-400) };
  try { return JSON.parse(line); } catch (e) { return { arm, crash: 'json ' + e.message }; }
}
const J = (x) => JSON.stringify(x);
const eq = (a, b) => J(a) === J(b);
const u = (P, a) => (P[a] && P[a].U) || {};
const wd = (P, a) => (P[a] && P[a].W) || {};
// 단언 — [이름 · 필요한 팔(‘a|b’ = 있는 쪽 모두에) · 판정 → [조건 · 글 · 덧붙임]]
const CHECKS = [
  ['K1', ['none', 'k0', 'kt'], (P) => [['none', 'k0', 'kt'].every((a) => P[a].knobs && P[a].knobs.fetch === false && P[a].knobs.dest === false),
    "★손잡이 둘 — 끔 기본 · '0' · 'true' = 끔", ['none', 'k0', 'kt'].map((a) => P[a].knobs)]],
  ['K2', ['f', 'd', 'fx', 'u1'], (P) => [eq(P.f.knobs, { fetch: true, dest: false }) && eq(P.d.knobs, { fetch: false, dest: true }) && eq(P.fx.knobs, { fetch: true, dest: true }) && eq(P.u1.knobs, { fetch: true, dest: true }),
    "'1' 이면 제 손잡이만 켬", [P.f.knobs, P.d.knobs, P.fx.knobs]]],
  ['O1', ['u1'], (P) => { const o = u(P, 'u1').ord || {}; return [o.cu5sn0 && eq(o.cu5sn0.L, ['tin']) && o.cu0sn5 && eq(o.cu0sn5.L, ['copper']) && o.cu1sn1 && eq(o.cu1sn1.L, ['copper']),
    '★발주 = 청동 조리법의 모자란 재료 — 구리 있고 주석 없으면 주석 · 거꾸로 구리 · 둘 다 조금이면 목표에 모자란 쪽(구리)만', o.cu5sn0 && [o.cu5sn0.L, o.cu0sn5.L, o.cu1sn1.L]]; }],
  ['O2', ['u1'], (P) => { const o = u(P, 'u1').ord || {}; return [o.cu0sn0 && eq(o.cu0sn0.L, []) && o.cu50sn50 && eq(o.cu50sn50.L, []),
    '★둘 다 없으면(청동을 짤 수 없다) · 둘 다 넉넉하면 발주 0 — 목표 0 · 곳간 0 인 품목은 발주가 아니다', o.cu0sn0 && [o.cu0sn0.L, o.cu50sn50.L]]; }],
  ['O3', ['u0', 'u1'], (P) => { const a = (u(P, 'u0').ord || {}).char, b = (u(P, 'u1').ord || {}).char; return [a && b && eq(a.L, ['charcoal']) && eq(b.L, ['charcoal']),
    '★숯 — 캐는 마을 · 숯 0 이면 발주(금속 아님 · 합금 발주 손잡이와 무관 — 품목 특례 0)', a && b && [a.L, b.L]]; }],
  ['O4', ['u0'], (P) => { const o = u(P, 'u0').ord || {}; const ks = Object.keys(o); return [ks.length === 6 && ks.every((k) => o[k].L && !o[k].L.includes('copper') && !o[k].L.includes('tin')),
    '합금 발주 끔 — 구리 · 주석 발주 0(T1347 은 품목을 보태지 않는다 · 무엇이 발주인지는 파생수요 정본이 정한다)', ks.map((k) => o[k].L)]; }],
  ['O5', ['u0', 'u1'], (P) => { const all = [u(P, 'u0').ord || {}, u(P, 'u1').ord || {}]; const n = all.reduce((s, o) => s + Object.keys(o).length, 0);
    return [n === 12 && all.every((o) => Object.values(o).every((x) => x.L && eq(x.L, x.D))), '★발주 열 = 정본 함수(`derivedInputTarget`)로 센 모자람 열 — 열두 마을-판 다(사본 0)', all.map((o) => Object.keys(o).filter((k) => !eq(o[k].L, o[k].D)))]; }],
  ['O6', ['u1'], (P) => { const c = u(P, 'u1').cache || {}; return [eq(c.a, ['tin']) && eq(c.b, ['tin']) && eq(c.c, []) && c.day === 6,
    '★마을-날 한 번 — 같은 날엔 곳간이 바뀌어도(주석 0 → 100) 그날 열 · 다음 날 다시 센다(발주 0)', c]; }],
  ['O7', ['u1'], (P) => { const s = u(P, 'u1').stub || {}; return [eq(s.xz, []) && eq(s.nost, []) && eq(s.nul, []) && s.sxz === false,
    '이웃 존 스텁 · 곳간 없는 마을 · 빈 값 — 발주 0 · 스텁은 안 판다', s]; }],
  ['S1', ['u1'], (P) => { const s = u(P, 'u1').sells || {}; return [s.t10 === true && s.t05 === false && s.own === false,
    '★파는 쪽 문 — 주석 10 이면 판다 · 0.5(실물 ≤ 1)면 안 판다 · 제가 발주한 품목은 안 판다', s]; }],
  ['B1', ['u1'], (P) => { const b = u(P, 'u1').buys || {}; return [b.sold === true && b.giveTin === false && b.noStock === false && b.glut === false && b.anyItem === true,
    '★다리 문 — 집 발주(주석 · 보리)를 그곳이 팔면 참 · 파는 것이 판 짐뿐이면 · 실물이 없으면 · 집이 글럿이면 거짓 · 보리 발주도 같은 문', b]; }],
  ['M1', ['u1'], (P) => { const a = u(P, 'u1').mix || {}; return [!!a.wheat && a.wheat.res === 'wheat' && !!a.every && a.every.res === 'copper',
    '★섞어 싣기 목적지 발주 — 목적지가 밀만 발주하면 밀 · 넷 다 발주하면 T1344 고르기(짐 몫 최대 — 구리)', [a.wheat, a.every]]; }],
  ['M2', ['u1'], (P) => { const a = u(P, 'u1').mix || {}; return [a.none === null && a.all === null && a.cu && a.cu.res === 'copper',
    '목적지 발주 0 이면 안 얹는다 · 구리 발주면 구리', [a.none, a.all, a.cu]]; }],
  ['M3', ['u1'], (P) => { const a = u(P, 'u1').mix || {}; return [!!a.fw && a.fw.res === 'wheat' && eq(a.fw, a.fwRef),
    '★발주 열 안에서는 T1344 규칙 그대로 — 물고기 · 밀 발주 = 후보를 물고기 · 밀로 줄인 T1344 고르기(밀 · 양 · 짐 몫 · 무게 같다)', [a.fw, a.fwRef]]; }],
  ['M4', ['u0'], (P) => { const z = u(P, 'u0').mix || {}; return [!!z.all && z.all.res === 'copper' && eq(z.wheat, z.all) && eq(z.none, z.all) && eq(z.every, z.all),
    '손잡이 끔 — 목적지 발주를 안 본다(T1344 그대로 — 구리)', [z.all, z.wheat, z.none]]; }],
  ['W1', ['off', 'd'], (P) => { const o = wd(P, 'off'), d = wd(P, 'd'); return [!o.err && !d.err && o.trade > 0 && o.nLeg === 0 && o.nRet === 0 && o.oFields === 0 && d.nLeg === 0 && d.nRet === 0 && d.oFields === 0 && o.digest === d.digest,
    `★끔 판 — 훅 0 · 마을에 새 칸 0 · 목적지 발주 손잡이만 켠 판 = 끔 판(장부 ${o.trade}줄 · 곳간 md5 같다 — 섞어 싣기 없이는 무동작)`, [o.err || d.err, o.digest, d.digest, o.oFields, d.oFields]]; }],
  ['R1', ['f'], (P) => { const f = wd(P, 'f'); return [!f.err && f.retReal > 0,
    `★받아 올 짐이 실제로 바뀐다 — ${f.retReal}/${f.nRet} 도착(품목 ${J(f.retItems)})`, f.err]; }],
  ['R2', ['f|fx'], (P, A) => [A.every((a) => !wd(P, a).err && wd(P, a).nRet > 0 && wd(P, a).retBadN === 0),
    '★바꾼 받아 올 짐은 다 그날 집 발주 · 그곳이 판다 · 판 짐 아님 · 집 글럿 아님', A.map((a) => [a, wd(P, a).nRet, wd(P, a).retBadN, wd(P, a).retBad, wd(P, a).err])]],
  ['R3', ['f|fx'], (P, A) => [A.every((a) => !wd(P, a).err && wd(P, a).nRet > 0 && wd(P, a).retArgBadN === 0),
    '★여럿이면 값 비 최대(종전 받아 올 짐의 자 — 떠날 때 정산에 찍힌 값으로 다시 셈)', A.map((a) => [a, wd(P, a).retMulti, wd(P, a).retArgBadN, wd(P, a).retArgBad])]],
  ['R4', ['off', 'f'], (P) => { const o = wd(P, 'off'), f = wd(P, 'f'); return [!o.err && !f.err && f.metalN > o.metalN && f.metalAmt > o.metalAmt,
    `★발주 금속(구리 · 주석)을 받아 온 줄 — 끔 ${o.metalN}줄 ${o.metalAmt} → 켬 ${f.metalN}줄 ${f.metalAmt}`, [o.err, f.err]]; }],
  ['L1', ['f'], (P) => { const f = wd(P, 'f'); return [!f.err && f.legReal > 0, `★다리를 실제로 갈아 탄다 — ${f.legReal}/${f.nLeg}`, f.err]; }],
  ['L2', ['f|fx'], (P, A) => [A.every((a) => !wd(P, a).err && wd(P, a).nLeg > 0 && wd(P, a).legBadN === 0 && wd(P, a).tol > 0 && wd(P, a).tol < 1),
    '★갈아 탄 다리는 이익 ≥ 종전 × FOOD_PULL_TOL(P2 와 같은 수) · 그곳이 집 발주를 판다', A.map((a) => [a, wd(P, a).tol, wd(P, a).legMinRatio, wd(P, a).legBadN, wd(P, a).legBad])]],
  ['C1', ['fx'], (P) => { const x = wd(P, 'fx'); return [!x.err && x.yEv === 0 && x.crisisEv === 0 && x.yDeps > 0,
    `★굶는 마을(발주 열 꽂음 · 식량 EMA < 0) — 받아 올 짐 다리 · 받아 올 짐 0(P2 · P1b 가 먼저) · 그 마을 캐러밴은 떠났다(${x.yDeps})`, [x.yEv, x.crisisEv, x.err]]; }],
  ['X1', ['fx'], (P) => { const x = wd(P, 'fx'); return [!x.err && x.xRetGen > 0 && x.retMulti > 0,
    `★꽂은 발주(삼 · 약초 · 옷 — 금속 아님)도 같은 규칙으로 받아 온다(${x.xRetGen}) · 고를 품목이 둘 이상인 도착 ${x.retMulti}`, x.err]; }],
  ['M5', ['fx'], (P) => { const x = wd(P, 'fx'); return [!x.err && x.s2 && x.s2.n > 0 && x.s2.inDest === x.s2.n,
    `★섞어 싣기 둘째 화물은 다 그날 목적지 발주(${x.s2 && x.s2.inDest}/${x.s2 && x.s2.n})`, x.s2 && x.s2.bad]; }],
];
function runChecks(P, out) {
  const res = { pass: 0, fail: 0, failed: [], ran: 0 };
  for (const [id, need, fn] of CHECKS) {
    const many = need.length === 1 && need[0].includes('|');
    const A = many ? need[0].split('|').filter((a) => P[a]) : need;
    if (many ? A.length === 0 : !need.every((a) => P[a])) continue;
    res.ran++;
    let c = false, m = id, x;
    const bad = A.find((a) => P[a].crash || P[a].loadErr);
    if (bad) { m = id + ' — 아이 판 ' + bad + ' 죽음'; x = (P[bad].crash || P[bad].loadErr).slice(0, 200); }
    else { try { [c, m, x] = fn(P, A); c = !!c; } catch (e) { c = false; x = 'check ' + e.message; } }
    if (c) res.pass++; else { res.fail++; res.failed.push(id); }
    if (out) console.log((c ? '  ✓ ' : '  ✗ ') + id + ' ' + m + (x !== undefined && !c ? '  ' + (typeof x === 'string' ? x : J(x)).slice(0, 400) : ''));
  }
  return res;
}

console.log('=== test-t1347-fetch — 받아 올 짐 · 섞어 싣기 목적지 발주(끔 기본 둘) ===');
const ARMS = ['none', 'k0', 'kt', 'u0', 'u1', 'off', 'd', 'f', 'fx'];
const P = {};
for (const a of ARMS) P[a] = child(a);
console.log('\n① ~ ⑦ 손잡이 · 발주 · 문 · 섞어 싣기 · 판');
const R = runChecks(P, true);

console.log('\n⑧ 글자 — 함수 하나 · 부르는 자리 · 관용 수 하나 · 블록 차례');
let gp = 0, gf = 0;
const gok = (c, m, x) => { if (c) gp++; else gf++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + (typeof x === 'string' ? x : J(x)) : '')); };
{
  const codeOnly = require('./code-only.js');
  const SRC = fs.readFileSync(path.join(ROOT, V2F), 'utf8'), C = codeOnly(SRC);
  const n = (s) => C.split(s).length - 1;
  gok(n('function _t1347Orders(') === 1 && n('_t1347Orders(') === 4 && n('v1.derivedInputTarget(v, r) >') === 1,
    'G1 ★발주 함수 하나 · 부르는 자리 셋(제 발주 · 다리 문 · 받아 올 짐) · 파생수요 비교 한 줄(사본 0)', [n('function _t1347Orders('), n('_t1347Orders('), n('v1.derivedInputTarget(v, r) >')]);
  gok(n('_t1347Buys(a.v, b.v, cand.res, day)') === 1 && n('if (_crisisA && bestF && bestF !== best && bestF.profit >= best.profit * FOOD_PULL_TOL) best = bestF;') === 1 &&
    n('FOOD_PULL_TOL') === 3 && /const FOOD_PULL_TOL = [\d.]+;/.test(C),
    'G2 ★다리 문 부르는 자리 하나 · P2 줄 그대로 · 관용 수 하나(정의 · P2 · 받아 올 짐 다리 — 새 수 0)', [n('_t1347Buys(a.v, b.v, cand.res, day)'), n('FOOD_PULL_TOL')]);
  const iP1b = C.indexOf('if (c.from.surplusEMA && c.from.surplusEMA.food < 0 && !(returnRes && FOOD_CLASSES[returnRes])) {');
  const iRp = C.indexOf("const _rpFn = (world && typeof world.returnPullFn === 'function') ? world.returnPullFn : null;");
  const iF = C.indexOf('if (T1347_FETCH && !(c.from.surplusEMA && c.from.surplusEMA.food < 0)) {');
  const iPs = C.indexOf('const _ps = world._pullStats || (world._pullStats = { crisisReturns: 0, crisisFoodReturns: 0 });');
  gok(iP1b > 0 && iRp > iP1b && iF > iRp && iPs > iF && n('if (T1347_FETCH && !(c.from.surplusEMA && c.from.surplusEMA.food < 0)) {') === 1,
    'G3 ★받아 올 짐 블록은 P1b(식량) · 돌 pull 뒤 · 위기 계측 앞 하나(굶는 마을 대금은 식량 그대로 · 계측이 받아 올 짐을 센다)', [iP1b, iRp, iF, iPs]);
  const iMx = C.indexOf('function _t1344MixPick('), iMxEnd = C.indexOf('\nfunction ', iMx + 10);
  const iDest = C.indexOf('if (T1347_MIX_DEST && !_t1347Ordered(b.v, c2.res, day)) continue;'), iKg = C.indexOf('const kg = _t1136Kg(c2.res);', iMx);
  gok(n('if (T1347_MIX_DEST && !_t1347Ordered(b.v, c2.res, day)) continue;') === 1 && iDest > iMx && iDest < iMxEnd && iDest < iKg,
    'G4 섞어 싣기 거르개 한 줄 — `_t1344MixPick` 안 · 무게 줄 앞(나머지 T1344 글자 그대로)', [iMx, iDest, iKg, iMxEnd]);
  gok(n("process.env.T1347_FETCH === '1'") === 1 && n("process.env.T1347_MIX_DEST === '1'") === 1 && n('T1347_FETCH') >= 4 && n('world.onT1347') === 4,
    "G5 손잡이는 `'1'` 비교 한 줄씩 · 훅은 관찰만(두 자리 · 있을 때만 부른다)", [n('T1347_FETCH'), n('world.onT1347')]);
}

console.log('\n⑨ 미끼 — 한 자리 바꾼 사본은 정한 단언이 빨강이어야 한다(미끼 하나에 판정 줄 하나 — `@bait 10`)');
let bait = 0, baitSeen = 0;
const SRCS = {};
// 미끼 판 — 바꿀 자리를 세고(정확히 1곳일 때만 돈다) · 정한 팔을 사본으로 돌려 · 단언 판정을 다시 센다
function baitRun(name) {
  const [file, from, , arms, expect] = BAITS[name];
  const S = SRCS[file] || (SRCS[file] = fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const sites = S.split(from).length - 1;
  if (sites !== 1) return { sites, good: false, why: `바꿀 자리가 정확히 1곳이 아니다 — 미끼를 안 돌림 · 팔 ${arms.join('+')} · 정한 빨강 ${J(expect)}` };
  const Q = {}; for (const a of arms) Q[a] = child(a, name);
  const dead = arms.filter((a) => Q[a].crash || Q[a].loadErr);
  const r = runChecks(Q, false);
  const hit = expect.every((id) => r.failed.includes(id));
  return { sites, good: dead.length === 0 && hit,
    why: `팔 ${arms.join('+')} · 단언 ${r.ran} 가운데 빨강 ${J(r.failed)} · 정한 빨강 ${J(expect)}` + (dead.length ? ` · 아이 판 죽음 ${dead.join(',')} ${(Q[dead[0]].crash || Q[dead[0]].loadErr).slice(0, 160)}` : '') };
}
// 미끼 판정 — 바꾼 자리 1곳 · 정한 단언이 빨강(아이 판 죽음 0)이면 초록
function ok(c, m, x) { baitSeen++; if (c) bait++; console.log((c ? '  ✓ ' : '  ✗ ') + m + '  ' + x); }
let b;
b = baitRun('notol');     ok(b.sites === 1 && b.good, '미끼 notol — 다리 관용(× FOOD_PULL_TOL)을 뺀 사본 → L2 빨강(관용 밖 다리로 갈아 탄다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('legany');    ok(b.sites === 1 && b.good, '미끼 legany — 다리 문(`_t1347Buys`)을 뺀 사본 → L2 빨강(집 발주를 안 파는 다리로도 갈아 탄다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('crisisleg'); ok(b.sites === 1 && b.good, '미끼 crisisleg — 다리에서 굶는 마을 거름(`!_crisisA`)을 뺀 사본 → C1 빨강(굶는 마을도 발주 다리)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('crisisret'); ok(b.sites === 1 && b.good, '미끼 crisisret — 받아 올 짐에서 굶는 마을 거름(식량 EMA < 0)을 뺀 사본 → C1 빨강(굶는 마을 대금도 발주 품목)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nosells');   ok(b.sites === 1 && b.good, '미끼 nosells — 파는 쪽 문(`_t1347Sells`)을 뺀 사본 → R2 빨강(그곳이 안 파는 발주를 받아 온다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('minratio');  ok(b.sites === 1 && b.good, '미끼 minratio — 값 비 최대 대신 첫째 품목을 고르는 사본 → R3 빨강', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('ownorder');  ok(b.sites === 1 && b.good, '미끼 ownorder — 파는 마을 제 발주 거름을 뺀 사본 → S1 빨강(제가 발주한 품목도 판다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('ordge');     ok(b.sites === 1 && b.good, '미끼 ordge — 모자람 비교를 ≥ 로 바꾼 사본 → O2 빨강(목표 0 · 곳간 0 도 발주)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('nocache');   ok(b.sites === 1 && b.good, '미끼 nocache — 마을-날 한 번 셈(칸 `_t1347O`)을 뺀 사본 → O6 빨강(같은 날 곳간이 바뀌면 열이 바뀐다)', `바꾼 자리 ${b.sites} · ${b.why}`);
b = baitRun('mixany');    ok(b.sites === 1 && b.good, '미끼 mixany — 섞어 싣기 목적지 발주 거르개를 뺀 사본 → M1 빨강(목적지가 발주 안 한 품목도 얹는다)', `바꾼 자리 ${b.sites} · ${b.why}`);
const NB = Object.keys(BAITS).length;
if (baitSeen !== NB) { console.log(`  ✗ 미끼 표(${NB})와 판정 줄(${baitSeen}) 수가 다르다 — 표에 더한 미끼는 판정 줄도 더한다`); bait = -1; }
const total = R.pass + R.fail + gp + gf;
console.log(`\n=== ${R.pass + gp}/${total} ${R.fail + gf ? '✗' : '✓'} (미끼 ${bait}/${NB}) ===`);
process.exitCode = (R.fail || gf || bait < NB) ? 1 : 0;
