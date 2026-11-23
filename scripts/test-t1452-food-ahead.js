#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 7   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1452-food-ahead.js — 여유분과 비상을 앞날 장부로(`T1419_FOOD_NEED=ahead` · 끔 기본 · 재민 11-22) ===
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · 작은 세계(8마을 · 40날 · 정본 `tickWorldV2`) · 꾸민 마을(사람 30 · 800날) · 판 날만 센다):
//   ① 손잡이 — `'ahead'` 가 켬(`T1452_AHEAD`) · 없음 · `'AHEAD'` · `'1'` = 끔 · `harv` · `seen` = 장부 0 · 재는 팔(`T1452_AT` · `T1452_READS` · `T1452_YEAR`)은 손잡이 끔이면 안 선다
//   ② 끔 = 종전 — 작은 세계 40날에 장부 칸(`_t1452`) 0 · 장부 셈 0(`t1452Stat`) · (가) 판도 장부 0
//   ③ 장부 — 꾸민 마을 800날(지난해와 같은 철 흐름 · 거둠 두 번 · 썩음 율 · 끼니): 고리 `hI` = 그날 실제 자라는 시간 없는 흐름(거둠 · 먹은 것 · 썩은 것 빼고 — 이 파일이 따로 적은 값) ·
//      예상 곳간(이 파일이 같은 식을 따로 걷는다 — 밭 칸 · 지난해 흐름 · 길 위 짐 · 썩음 율 × 곳간 · 지금 사람 × 하루치)의 골 · 골까지 날 · 30 / 90 / 180날 = 장부
//   ④ 여유분 — 예상대로 간 한 해(거둠 뒤 줄어듦 = 계획한 감소)는 0 · 뜻밖에 잃은 20날치는 20 · 한 해 전 = 가뭄 날
//   ⑤ 비상 — 0 밑 첫날이 지금 심어 거둘 날 앞이면 켬 · 뒤면 끔 · 심을 철이 아니면 켬 · 랩(밭 세계 아님)은 끔 · 기근 블록이 비상이면 밭 일을 뺀다(글자)
//   ⑥ 하루 한 칸 — 날마다 고리에 쓰는 칸 = 2(어제 `hI` · `hX`) · 365칸을 다시 그리지 않는다 · 같은 날 두 번 = 무동작
//   ⑦ 저장 · 되살림 — 서버 저장 줄(`serializeEcon` → `restoreEcon`) · v8 통째: 되살린 장부의 답 = 저장 앞 · 열 날 더 걸은 답이 같다
//   ⑧ 길 위의 짐 · 재는 팔 — 캐러밴 식량이 도착 날에 든다 · `T1452_AT=ref`(값의 기준만 장부 · 문은 (가)) · 집 짓기 여유(창 안 골 · 연속) · 광부 길 · 한 해 율(`T1452_YEAR`)
//   ⑨ 작은 세계 켬 40날 — 산 마을마다 장부 · 고리 39칸 · 버틸 날 유한 · 셈(µs) 잼
//   ⑩ 글자 — 부르는 자리(틱 머리 · 끼니 줄 둘 · v2 썩음 줄 둘 · 가뭄 줄 · 기근 블록 · 생활층 밭 칸 · 심을 날)가 한 곳씩 · (가) 몸통 줄이 한 함수(`_t1419FlowAt`)를 읽는다
//   ⑪ 미끼 일곱(이 파일 안 · 바꾼 자리가 정확히 1곳인지 센다 · 정본 파일 무변 — 한 줄만 바꾼 사본을 아이에 싣는다):
//      nofarm(자라는 밭을 안 셈 → ③ 빨강) · double(거둔 것을 흐름 이력에도 셈 → ③ 빨강) · seen(계획한 감소를 여유분으로 → ④ 빨강) ·
//      farmcall(골 앞에 못 거두는데 비상 아님 → ⑤ 빨강) · redraw(날마다 365칸을 다시 씀 → ⑥ 빨강) · nosave(저장 줄이 장부를 건너뜀 → ⑦ 빨강) · growth(사람이 느는 것을 예상에 → ③ 빨강)
//
// 실행: node scripts/test-t1452-food-ahead.js
'use strict';
const path = require('path');
const fs = require('fs');
const v8 = require('v8');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ARM = process.env.T1452_HARNESS_ARM || '', MUT = process.env.T1452_MUTANT || '';
const V1F = 'sim/economy-sim.js', V2F = 'sim/economy-sim-v2.js', VSF = 'server/villages.js';
// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자 · 돌릴 팔]
const BAITS = {
  nofarm: [V1F, '  return (fm && fm[d] ? fm[d] : 0) + _t1452Nf(R, d, d0, Y, F, s) + (cv[d] || 0);', '  return 0 + _t1452Nf(R, d, d0, Y, F, s) + (cv[d] || 0);', 'ahead'],
  double: [V1F, '    const nf = (S1 - R.S) - farm + R.eat + R.rot;', '    const nf = (S1 - R.S) + R.eat + R.rot;', 'ahead'],
  seen: [V1F, 'R.hX[_t1452Ix(d)] = Math.round(R.x * 1000) / 1000;', 'R.hX[_t1452Ix(d)] = Math.round(S1 / R.pC * 1000) / 1000;', 'ahead'],
  farmcall: [V1F, '  const emerg = !!(T1243_FARM_ON && k0 > 0 && (sow == null || d0 + k0 < sow));', '  const emerg = !!(T1243_FARM_ON && k0 > 0 && (sow == null || d0 + k0 > sow));', 'aheadFarm'],
  redraw: [V1F, '    const m = Math.min(g, _T1452_CAP);', '    const m = _T1452_CAP;', 'ahead'],
  nosave: [VSF, "  '_forageActItems',   // ★[T475]", "  '_forageActItems', '_t1452',   // ★[T475]", 'ahead'],
  growth: [V1F, '      x = x - rot + inK - C; sIn += inK; sRot += rot;', '      x = x - rot + inK - C * (1 + k / Y); sIn += inK; sRot += rot;', 'ahead'],
};
const KNOBS = ['T1419_FOOD_NEED', 'T1437_READS', 'T1437_BUF_AT', 'T1437_RULER', 'T1452_AT', 'T1452_READS', 'T1452_YEAR', 'T1452_SHADOW', 'T1297_BIRTH_FOOD', 'T1306_BIRTH_GRADE', 'T1306_MIGRATE_FOOD', 'T1319_AUTUMN_LOOK', 'T1346_BIRTH_FLOW', 'T1243_FARM_ON', 'T1374_BIRTH_HARV', 'T1374_FAMINE_HARV', 'T1276_FARM_K', 'T1421_BIRTH_YEAR'];
const DS = 800, N0 = 30;   // 꾸민 마을 날 수 · 사람
// 꾸민 마을의 하루(이 파일이 정한 세계 — 정본 장부 함수만 부른다)
//   자라는 시간 없는 흐름 f(d) = 사람 × 하루치 × (0.6 + 0.4 × 철 물결) — 한 해 주기(지난해와 같다 → 예상대로 간다)
//   거둠 — 날 200 · 565(= 200 + 365) 에 하루치 × 사람 × 150(밭 거둠 — `_t368FoodTot` 에 같이 적는다)
//   썩음 — 아침 곳간의 0.2 % · 끼니 — 사람 × 하루치(모자라면 곳간까지만 · 못 먹은 몫)
const flowAt = (d, C) => C * (0.6 + 0.4 * Math.sin(2 * Math.PI * d / 365));
const HARV = { 200: 150, 565: 150 };
const ROT = 0.002;

// ── 아이 판 ─────────────────────────────────────────────────────────────────────
if (ARM) {
  for (const k of KNOBS) delete process.env[k];
  if (ARM === 'ahead' || ARM === 'harv' || ARM === 'seen') process.env.T1419_FOOD_NEED = ARM;
  else if (ARM.startsWith('k:')) process.env.T1419_FOOD_NEED = ARM.slice(2);
  else if (ARM === 'aheadFarm') { process.env.T1419_FOOD_NEED = 'ahead'; process.env.T1243_FARM_ON = '1'; }
  else if (ARM === 'at') { process.env.T1419_FOOD_NEED = 'ahead'; process.env.T1452_AT = 'ref'; }
  else if (ARM === 'reads') { process.env.T1419_FOOD_NEED = 'ahead'; process.env.T1452_READS = 'house,mine'; process.env.T1452_YEAR = '1'; }
  else if (ARM === 'readsOff') { process.env.T1452_READS = 'house,mine'; process.env.T1452_YEAR = '1'; process.env.T1452_AT = 'ref'; }
  else if (ARM === 'shadow') process.env.T1452_SHADOW = '1';
  process.env.ENABLE_VILLAGES = '0';
  const out = { arm: ARM, mut: MUT || null, loadErr: null, knob: null, on: null, at: null, reads: null, year: null, world: null, syn: null, save: null };
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
  const quiet = (f) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = l; console.warn = w; } };
  try { quiet(() => { E = require(path.join(ROOT, V1F)); V2 = require(path.join(ROOT, V2F)); }); }
  catch (e) { out.loadErr = String((e && e.message) || e).slice(0, 300); }
  const r6 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1e6) / 1e6;
  if (E && V2) { out.knob = E.T1419_FOOD_NEED; out.on = E.T1452_AHEAD; out.at = E.T1452_AT; out.reads = E.T1452_READS; out.year = E.T1452_YEAR; }
  if (E && V2 && !ARM.startsWith('k:') && ARM !== 'readsOff') {
    // 작은 세계 — 8 마을 · 40날(정본 틱 그대로) · 끔 · 재는 판 · (가) · 겪은 낙폭 · 켬만(미끼 · 재는 팔 아이는 꾸민 마을만 — 판 시간)
    if (!MUT && ['off', 'shadow', 'harv', 'seen', 'ahead'].includes(ARM)) try {
      quiet(() => {
        if (E.setSeed) E.setSeed(1);
        const st0 = E.t1452Stat();
        const w = V2.createWorldV2({ seed: 1020, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
        for (let d = 0; d < 40; d++) V2.tickWorldV2(w);
        const live = w.villages.filter((v) => (v.npcs || []).length > 0);
        const st = E.t1452Stat();
        out.world = { live: live.length, pop: live.reduce((a, v) => a + v.npcs.length, 0), keyed: w.villages.filter((v) => '_t1452' in v && v._t1452).length, fp: r6(w.villages.reduce((a, v) => a + E.totalFoodEquivalent(v) * 1.37 + (v.counts && v.counts.farmer || 0) * 7.1, 0)),
          hL: live.map((v) => v._t1452 ? v._t1452.hL : null), need: live.map((v) => { const A = E.t1452Ahead(v, w.day); return A ? r6(A.need) : null; }),
          day: w.day, evals: st.evals - st0.evals, writes: st.writes - st0.writes, days: st.days - st0.days, us: st.evals > st0.evals ? r6((st.us - st0.us) / (st.evals - st0.evals)) : null, maxUs: r6(st.maxUs) };
      });
    } catch (e) { out.world = { err: String((e && e.stack) || e).slice(0, 400) }; }
    if (ARM !== 'harv' && ARM !== 'seen' && ARM !== 'shadow') {
      const S = out.syn = {};
      try {
        quiet(() => {
          const mk = () => {
            if (E.setSeed) E.setSeed(1);
            const v = E.createVillage({ fertility: 1.0, water: 0.5, stone: 0.5, ore: 0, wood: 0.5, game: 0.5, arable: 1, size: 70, initialPop: N0, name: 'T1452S' });
            v.counts = { farmer: 10 }; v.surplusEMA = { food: 0 }; v._importEMA = 0; v._t368FoodTot = 0;
            for (const k of Object.keys(v.storage)) if (typeof v.storage[k] === 'number') v.storage[k] = 0;
            v.storage.food = 60 * N0 * E.DAILY_FOOD_CONSUMPTION;
            v._world = { day: 0, caravans: [] };
            return v;
          };
          const C = N0 * E.DAILY_FOOD_CONSUMPTION;
          const log = { nf: {} };
          const walk = (v, a, b, ev) => {   // 날 a ~ b — 틱 머리 → 흐름 · 거둠 → 썩음 → 끼니(정본 장부 함수 넷만)
            for (let d = a; d <= b; d++) {
              v._world.day = d;
              E.t1452Day(v, d);
              const f = flowAt(d, C); v.storage.food += f; log.nf[d] = f;
              if (HARV[d]) { const h = HARV[d] * C; v.storage.food += h; v._t368FoodTot += h; }
              if (ev && ev[d]) ev[d](v);
              const s0 = v.storage.food, rot = s0 * ROT; v.storage.food -= rot; E.t1452Rot(v, rot, s0);
              const need = C, eat = Math.min(need, v.storage.food); v.storage.food -= eat; E.t1452Eat(v, eat, need - eat);
            }
          };
          // ③ 장부 — 800날 걸은 뒤(지난 한 해가 다 이력 안) · 밭 칸 하나 · 길 위 짐 없음
          const v = mk();
          walk(v, 1, DS - 1);
          E.t1452Day(v, DS); v._world.day = DS;
          const R = v._t1452;
          S.hL = R.hL; S.rho = r6(R.rho);
          let hBad = 0, hMax = 0; for (let d = DS - 365; d <= DS - 1; d++) { const x = R.hI[((d % 366) + 366) % 366], y = log.nf[d]; const e = Math.abs(x - Math.round(y * 1000) / 1000); if (e > 0.002) hBad++; if (e > hMax) hMax = e; }
          S.hBad = hBad; S.hMax = r6(hMax);
          v._t1452Fm = { [DS + 50]: 40 * C };
          const A = E.t1452Ahead(v, DS);
          S.A = { depth: r6(A.depth), toTrough: A.toTrough, buf: r6(A.buf), need: r6(A.need), p30: r6(A.p30), p90: r6(A.p90), p180: r6(A.p180), Y: A.rel, k0: A.k0, rate: r6(A.rate), emerg: A.emerg };
          // 이 파일이 같은 식을 따로 걷는다(지난해 같은 날 흐름 = 이 파일이 넣은 값 · 밭 칸 · 길 위 짐 · 썩음 율 = 장부 칸의 율 · 지금 사람)
          const proj = (R0, fm, cv, CC, Y) => { let x = R0.S, minF = x, kF = 0; const p = {};
            for (let k = 1; k <= Y; k++) { const d = DS + k, b = d - Y; const nf = Math.round(log.nf[b === DS ? DS - 1 : b] * 1000) / 1000; const inK = ((fm && fm[d]) || 0) + nf + ((cv && cv[d]) || 0); const rot = R0.rho * Math.max(0, x); x = x - rot + inK - CC; if (x < minF) { minF = x; kF = k; } if (k === 30 || k === 90 || k === 180) p[k] = x; }
            return { depth: r6(minF / CC), toTrough: kF, p30: r6(p[30]), p90: r6(p[90]), p180: r6(p[180]) }; };
          S.exp = proj(R, v._t1452Fm, null, C, A.rel);
          // 사람이 늘어도(장부 다시 셈) 먹을 것 = 지금 사람 × 하루치(늘 것을 넣지 않는다) — 사람 다섯 더 → 같은 식 다시
          { const keep = v.npcs.slice(); for (let i = 0; i < 5; i++) v.npcs.push(Object.assign({}, keep[0])); R.out = null;
            const B2 = E.t1452Ahead(v, DS), C2 = (N0 + 5) * E.DAILY_FOOD_CONSUMPTION;
            S.grow = { got: r6(B2.depth), exp: proj(R, v._t1452Fm, null, C2, B2.rel).depth }; v.npcs = keep; R.out = null; }
          // ④ 여유분 — 예상대로 간 해(위 v) · 뜻밖에 20날치를 잃은 해
          S.bufPlanned = r6(E.t1452Ahead(v, DS).buf);
          { const u = mk(); walk(u, 1, DS - 1, { 700: (x) => { x.storage.food = Math.max(0, x.storage.food - 20 * C); } }); E.t1452Day(u, DS); u._world.day = DS; S.bufShock = r6(E.t1452Ahead(u, DS).buf); }
          { const n = mk(); walk(n, 1, 100); E.t1452Day(n, 101); n._world.day = 101; S.bufNew = r6(E.t1452Ahead(n, 101).buf); S.drought = E.t1437DroughtDays(); }
          // ⑤ 비상 — 곳간 40날치 · 흐름 0 · 밭 칸 0(0 밑 첫날 ≈ 40) · 심을 날 셋
          { const e = mk(); walk(e, 1, 30); const Re = e._t1452; Re.hI.fill(0); Re.hL = 366; Re.rho = 0; e.storage.food = 40 * C; Re.S = 40 * C; e._t1452Fm = {};
            const at = (sow) => { e._t1452Sow = sow; Re.out = null; const X = E.t1452Ahead(e, 31); return { k0: X.k0, emerg: X.emerg }; };
            S.emerg = { late: at(31 + 100), early: at(31 + 20), none: at(null) }; }
          // ⑥ 하루 한 칸 — 하루 걷기마다 쓰는 칸 · 같은 날 두 번
          { const g = mk(); walk(g, 1, 10); const w0 = g._t1452.w; walk(g, 11, 20); S.w10 = g._t1452.w - w0; const w1 = g._t1452.w, i0 = JSON.stringify(g._t1452.hI); E.t1452Day(g, 20); S.twice = g._t1452.w === w1 && JSON.stringify(g._t1452.hI) === i0; }
          // ⑧ 길 위의 짐 — 날 DS + 10 에 식량 100날치가 온다(v1 짐)
          { const c = mk(); walk(c, 1, DS - 1); E.t1452Day(c, DS); c._world.day = DS; const P0 = E.t1452Ahead(c, DS).p30;
            c._world.caravans = [{ from: {}, to: c, giveRes: 'food', giveAmt: 100 * C, wantRes: 'stone', wantAmt: 1, state: 'outbound', arriveDay: DS + 10, returnArriveDay: DS + 20 }]; c._t1452.out = null;
            const P1 = E.t1452Ahead(c, DS); S.cv = { p0: r6(P0), p1: r6(P1.p30), exp: proj(c._t1452, null, { [DS + 10]: 100 * C }, C, P1.rel).p30, exp0: proj(c._t1452, null, null, C, P1.rel).p30 }; }
          // ⑦ 저장 · 되살림
          if (ARM === 'ahead') {
            const sv = mk(); walk(sv, 1, 380); E.t1452Day(sv, 381); sv._world.day = 381;
            const a0 = E.t1452Ahead(sv, 381); const key0 = J0(a0);
            let VV = null; try { VV = require(path.join(ROOT, VSF)); } catch (err) { S.saveErr = String(err && err.message || err).slice(0, 200); }
            const H = VV && VV.__p3Bind ? VV.__p3Bind({ byEcon: new Map(), byDbId: new Map(), villages: [], zoneId: 't1452' }) : null;
            const json = H ? H.serializeEcon(sv) : null;
            const rs = json ? H.restoreEcon(json, E) : null;
            if (rs) { rs._world = { day: 381, caravans: [] }; if (rs._t1452) rs._t1452.out = null; }
            const ra = rs ? E.t1452Ahead(rs, 381) : null;
            const v8c = v8.deserialize(v8.serialize(Object.assign({}, sv, { _world: null }))); v8c._world = { day: 381, caravans: [] }; if (v8c._t1452) v8c._t1452.out = null;
            const va = E.t1452Ahead(v8c, 381);
            const cont = (x) => { walk(x, 381, 390); E.t1452Day(x, 391); x._world.day = 391; return J0(E.t1452Ahead(x, 391)); };
            sv._t1452.out = null;
            const base = cont(sv);
            out.save = { inJson: !!(json && json.indexOf('"_t1452"') >= 0), restored: ra ? J0(ra) === key0 : false, v8: va ? J0(va) === key0 : false,
              json: rs && rs._t1452 ? cont(rs) === base : false, v8c: v8c._t1452 ? cont(v8c) === base : false };
          }
          // ⑧ 재는 팔 — 값의 기준만 장부 · 집 짓기 여유 · 광부 길 · 한 해 율
          if (ARM === 'at' || ARM === 'reads') {
            const g = mk(); walk(g, 1, 40); E.t1452Day(g, 41); g._world.day = 41;
            const X = E.t1452Ahead(g, 41), ga = E.foodNeedDays(g, 41);
            S.arms = { ref: r6(E.t1419Days(g, 41, 30, 'ref')), famine: r6(E.t1419Days(g, 41, 30, 'famine')), need: r6(X.need), ga: r6(ga), rate: r6(X.rate), year: r6(E.t1421YearFood(g)),
              slackAt: (() => { const r = []; for (const m of [5, 0, -0.5, -1, -2]) { g._t1452.out = Object.assign({}, X, { minW: X.buf + m * Math.max(1, X.buf) }); r.push(r6(E.t1452Slack(g, 9))); } g._t1452.out = null; return r; })() };
          }
        });
      } catch (e) { S.err = String((e && e.stack) || e).slice(0, 500); }
    }
  }
  function J0(a) { return a ? JSON.stringify([a.depth, a.toTrough, a.buf, a.emerg, a.need, a.p30, a.p90, a.p180, a.minW, a.k0, a.rate].map((x) => typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x)) : null; }
  console.log('@@T1452 ' + JSON.stringify(out));
  process.exit(0);
}

// ── 어미 ─────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ← ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const J = (x) => JSON.stringify(x);
const child = (arm, mut) => {
  const env = Object.assign({}, process.env, { T1452_HARNESS_ARM: arm }); if (mut) env.T1452_MUTANT = mut; else delete env.T1452_MUTANT;
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1452 '));
  if (!line) return { loadErr: 'no output rc=' + r.status + ' ' + String(r.stderr || '').slice(-300) };
  return JSON.parse(line.slice(8));
};
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) <= (e || 1e-6);
const SRC = { [V1F]: fs.readFileSync(path.join(ROOT, V1F), 'utf8'), [V2F]: fs.readFileSync(path.join(ROOT, V2F), 'utf8'), [VSF]: fs.readFileSync(path.join(ROOT, VSF), 'utf8') };
const cnt = (f, s) => SRC[f].split(s).length - 1;
const synOk = (S) => !!S && !S.err && S.A && S.exp && near(S.A.depth, S.exp.depth, 1e-3) && S.A.toTrough === S.exp.toTrough && near(S.A.p30, S.exp.p30, 1e-2) && near(S.A.p90, S.exp.p90, 1e-2) && near(S.A.p180, S.exp.p180, 1e-2);

console.log('\n① 손잡이 — `\'ahead\'` 가 켬');
const K = ['k:1', 'k:AHEAD', 'k:true'].map((a) => child(a));
const A = { off: child('off'), shadow: child('shadow'), harv: child('harv'), seen: child('seen'), ahead: child('ahead'), farm: child('aheadFarm'), at: child('at'), reads: child('reads'), readsOff: child('readsOff') };
ok(A.ahead.knob === 'ahead' && A.ahead.on === true && A.off.on === false && A.harv.on === false && A.seen.on === false && K.every((x) => x.knob === '' && x.on === false),
  '① `ahead` 만 켬 · 없음 · `1` · `AHEAD` · `true` = 끔 · `harv` · `seen` = 장부 아님', J([A.off.knob, A.harv.knob, A.seen.knob, A.ahead.knob, ...K.map((x) => x.knob)]));
ok(A.readsOff.at === null && A.readsOff.reads && !A.readsOff.reads.house && !A.readsOff.reads.mine && A.readsOff.year === false && A.reads.reads.house && A.reads.reads.mine && A.reads.year === true && A.at.at && A.at.at.ref === 1,
  '① 재는 팔 `T1452_AT` · `T1452_READS` · `T1452_YEAR` — 손잡이 끔이면 안 선다 · 켬이면 선다', J({ off: [A.readsOff.at, A.readsOff.reads, A.readsOff.year], on: [A.at.at, A.reads.reads, A.reads.year] }));

console.log('\n② 끔 = 종전');
{
  const W = A.off.world || {}, H = A.harv.world || {};
  ok(!A.off.loadErr && W.live >= 6 && W.pop > 100 && !W.err, '② [전제] 끔 작은 세계 40날이 돌았다(산 마을 ≥ 6 — 0 이면 아래가 자명 통과다)', J({ err: A.off.loadErr || W.err, live: W.live, pop: W.pop }));
  ok(W.keyed === 0 && W.evals === 0 && W.writes === 0 && W.days === 0, '★② 끔 — 장부 칸 0 · 장부 셈 0 · 쓴 칸 0', J({ keyed: W.keyed, evals: W.evals, writes: W.writes }));
  ok(H.live >= 6 && H.keyed === 0 && H.evals === 0 && (A.seen.world || {}).keyed === 0, '★② (가)(`harv`) · 겪은 낙폭(`seen`) — 장부 칸 0(T1419 · T1437 그대로)', J({ harv: H.keyed, seen: (A.seen.world || {}).keyed }));
  { const Z = A.shadow.world || {}; ok(Z.keyed === Z.live && Z.live === W.live && Z.pop === W.pop && Z.fp === W.fp, '★② 재는 판 `T1452_SHADOW=1` — 장부는 서고(산 마을마다) 세계는 끈 판 그대로(사람 · 곳간 · 농부 지문 같음)', J({ off: [W.live, W.pop, W.fp], shadow: [Z.live, Z.keyed, Z.pop, Z.fp] })); }
}

console.log('\n③ 장부 — 꾸민 마을 800날(이 파일이 같은 식을 따로 걷는다)');
{
  const S = A.ahead.syn || {};
  ok(!A.ahead.loadErr && !S.err && S.hL === 366 && S.rho > 0, '③ [전제] 꾸민 마을 800날이 돌았다 · 고리 366칸 · 썩음 율 > 0', J({ err: A.ahead.loadErr || S.err, hL: S.hL, rho: S.rho }));
  ok(S.hBad === 0, '★③ 고리 `hI` = 그날 실제 자라는 시간 없는 흐름(거둠 · 먹은 것 · 썩은 것을 걷어 낸 몫 — 이 파일이 넣은 값 · 지난 365날)', J({ bad: S.hBad, max: S.hMax }));
  ok(synOk(S), '★③ 예상 곳간 — 골 깊이 · 골까지 날 · 30 / 90 / 180날 = 이 파일이 따로 걸은 값(밭 칸 · 지난해 같은 날 흐름 · 썩음 율 · 지금 사람 × 하루치)', J({ got: S.A, exp: S.exp }));
  ok(S.grow && near(S.grow.got, S.grow.exp, 1e-3), '★③ 사람이 늘면(다섯 더) 먹을 것 = 그 사람 × 하루치 — 늘 것을 예상에 안 넣는다', J(S.grow));
}

console.log('\n④ 여유분 — 계획한 감소는 빠지고 뜻밖의 몫만');
{
  const S = A.ahead.syn || {};
  ok(S.bufPlanned != null && S.bufPlanned < 0.5, '★④ 예상대로 간 해(거둔 뒤 150날치가 줄어듦 = 계획한 감소) — 여유분 < 0.5날치(썩음 율의 하루 어긋남만)', J({ buf: S.bufPlanned }));
  ok(S.bufShock != null && near(S.bufShock, 20, 0.5), '★④ 뜻밖에 20날치를 잃은 해 — 여유분 = 20(± 0.5)', J({ buf: S.bufShock }));
  ok(S.drought > 0 && S.bufNew === S.drought, '④ 한 해가 안 된 마을 = 날씨 정본의 가장 긴 가뭄', J({ buf: S.bufNew, drought: S.drought }));
}

console.log('\n⑤ 비상 — 지금 심어 골 앞에 못 거두면');
{
  const F = (A.farm.syn || {}).emerg || {}, L = (A.ahead.syn || {}).emerg || {};
  ok(F.late && F.late.k0 > 30 && F.late.k0 < 50 && F.late.emerg === true && F.early && F.early.emerg === false && F.none && F.none.emerg === true,
    '★⑤ 밭 세계 — 0 밑 첫날(≈ 40)이 지금 심어 거둘 날(+100) 앞 = 비상 · 거둘 날(+20)이 앞 = 아님 · 심을 철이 아님 = 비상', J(F));
  ok(L.late && L.late.emerg === false && L.none && L.none.emerg === false, '⑤ 랩(밭 세계 아님 — 밭 일도 자라는 시간 0) = 비상 없음', J(L));
  ok(cnt(V1F, "if (T1452_AHEAD && (!T1452_AT || T1452_AT.famine)) { const _A = t1452Read(v); if (_A && _A.emerg) { const _i = foodOpts.findIndex((o) => o[0] === 'farmer'); if (_i >= 0) foodOpts.splice(_i, 1); } }") === 1,
    '⑤ 기근 블록 — 비상이면 밭 일을 뺀다(한 줄 · 기근 문이 장부를 읽는 판만 — `T1452_AT=ref` 는 (가) 그대로 · 그 밖은 종전 차례)');
}

console.log('\n⑥ 하루 한 칸');
{
  const S = A.ahead.syn || {};
  ok(S.w10 === 20, '★⑥ 열 날 걷기에 고리에 쓴 칸 = 20(날마다 어제 `hI` · `hX` 둘 — 365칸을 다시 그리지 않는다)', J({ w10: S.w10 }));
  ok(S.twice === true, '⑥ 같은 날 두 번 부르면 무동작', J({ twice: S.twice }));
}

console.log('\n⑦ 저장 · 되살림');
{
  const V = A.ahead.save || {};
  ok(V.inJson === true && V.restored === true && V.v8 === true, '★⑦ 서버 저장 줄 · v8 통째 — 되살린 장부의 답 = 저장 앞(같은 날)', J(V));
  ok(V.json === true && V.v8c === true, '⑦ 둘 다 열 날 더 걸은 답 = 저장 안 한 마을', J(V));
}

console.log('\n⑧ 길 위의 짐 · 재는 팔');
{
  const S = A.ahead.syn || {}, R = (A.reads.syn || {}).arms || {}, T = (A.at.syn || {}).arms || {};
  ok(S.cv && near(S.cv.p1, S.cv.exp, 1e-2) && near(S.cv.p0, S.cv.exp0, 1e-2) && S.cv.p1 > S.cv.p0, '⑧ 캐러밴 식량(100날치)이 도착 날에 든다 — 30날 예상 곳간 = 이 파일이 짐을 넣고 따로 걸은 값', J(S.cv));
  ok(near(T.ref, T.need, 1e-6) && near(T.famine, T.ga, 1e-6) && !near(T.need, T.ga, 1e-6), '⑧ `T1452_AT=ref` — 값의 기준만 장부의 버틸 날 · 기근 문은 (가)', J(T));
  ok(Array.isArray(R.slackAt) && R.slackAt[0] === 1 && R.slackAt[1] === 1 && near(R.slackAt[2], 0.5, 1e-6) && near(R.slackAt[3], 0.15, 1e-6) && near(R.slackAt[4], 0.15, 1e-6),
    '⑧ 집 짓기 여유(`T1452_READS=house`) — 창 안 골이 여유분 위 = 1 · 여유분 반만큼 밑 = 0.5 · 그 밑 = 종전 바닥 0.15(연속)', J(R.slackAt));
  ok(near(R.year, R.rate, 1e-9) && R.rate > 0, '⑧ `T1452_YEAR` — 한 해 율 = 같은 장부의 (곳간 + 한 해 들어올 것 − 썩을 것) ÷ 한 해', J({ year: R.year, rate: R.rate }));
  ok(cnt(V1F, '(_A52 ? _A52.minW >= 0 : ') === 1 && cnt(V1F, '(_A52 ? _A52.minW >= _A52.buf : ') === 1, '⑧ 광부 길(`T1452_READS=mine`) — 농사 못 하는 마을 = 창 안 골 ≥ 0 · 풍부광맥 = ≥ 여유분(한 곳씩)');
}

console.log('\n⑨ 작은 세계 켬 40날');
{
  const W = A.ahead.world || {};
  ok(!W.err && W.live >= 6 && W.keyed === W.live && (W.hL || []).every((h) => h >= 38) && (W.need || []).every((x) => x != null && isFinite(x) && x >= 0), '★⑨ 산 마을마다 장부 · 고리 ≥ 38칸 · 버틸 날 유한', J({ err: W.err, live: W.live, keyed: W.keyed, hL: W.hL, need: W.need }));
  ok(W.evals > 0 && W.us != null && W.writes > 0 && W.writes <= 2 * W.days, '⑨ 장부 셈 잼(µs) · 쓴 칸 ≤ 날마다 2', J({ evals: W.evals, us: W.us, maxUs: W.maxUs, writes: W.writes, days: W.days }));
}

console.log('\n⑩ 글자');
ok(cnt(V1F, '  if (T1452_LEDGER) t1452Day(v, day);') === 1 && cnt(V1F, '  const _t52e = T1452_LEDGER ? totalFoodEquivalent(v) : 0;') === 1 && cnt(V1F, '  if (T1452_LEDGER) t1452Eat(v, _t52e - totalFoodEquivalent(v), foodGap);') === 1,
  '⑩ 틱 머리 · 끼니 줄 둘 — 한 곳씩');
ok(cnt(V2F, '  const _t52r = v1.T1452_LEDGER ? v1.totalFoodEquivalent(v) : 0;') === 1 && cnt(V2F, '  if (v1.T1452_LEDGER) v1.t1452Rot(v, _t52r - v1.totalFoodEquivalent(v), _t52r);') === 1 && cnt(V2F, 'if (v1.T1437_SEEN || v1.T1452_LEDGER) v1.t1437Drought(WEATHER_KINDS);') === 1,
  '⑩ v2 썩음 줄 둘 · 가뭄 줄 — 한 곳씩');
ok(cnt(VSF, '  _t1452Sow(vil);') === 1 && cnt(VSF, '  if (_fm) vil.econ._t1452Fm = _fm;') === 1, '⑩ 생활층 — 밭 칸 · 심을 날 한 곳씩');
ok(cnt(V1F, '    const p = _t1419FlowAt(F, s);') === 1 && cnt(V1F, '    S += (C - p) * len; if (S > best) best = S;') === 1, '⑩ (가) 몸통 — 흐름 한 함수(`_t1419FlowAt`)를 읽는다 · 누적 줄 그대로');

console.log('\n⑪ 미끼 — 한 자리만 바꾼 사본은 빨강');
//   미끼마다 판정 줄 하나(⑲b — 줄 글자에 이름 · 바꾼 자리 수)
function baitRun(nm) {
  const B = BAITS[nm], n = cnt(B[0], B[1]);
  if (n !== 1) return { n, red: false, info: `바꿀 자리 ${n}` };
  const M = child(B[3], nm), S = M.syn || {};
  let red;
  if (nm === 'nofarm') red = !synOk(S);
  else if (nm === 'double') red = !(S.hBad === 0) || !synOk(S);
  else if (nm === 'seen') red = !(S.bufPlanned != null && S.bufPlanned < 0.5);
  else if (nm === 'farmcall') { const F = S.emerg || {}; red = !(F.late && F.late.emerg === true && F.early && F.early.emerg === false); }
  else if (nm === 'redraw') red = S.w10 !== 20;
  else if (nm === 'nosave') { const V = M.save || {}; red = !(V.inJson === true && V.restored === true && V.json === true); }
  else if (nm === 'growth') red = !synOk(S) || !(S.grow && near(S.grow.got, S.grow.exp, 1e-3));
  return { n, red, info: red ? undefined : J({ err: M.loadErr || S.err }) };
}
{ const R = baitRun('nofarm'); ok(R.n === 1 && R.red, `★⑪ 미끼 nofarm — 자라는 밭을 안 세는 사본 → ③ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('double'); ok(R.n === 1 && R.red, `★⑪ 미끼 double — 거둘 것을 두 번 세는 사본(밭 + 흐름 이력) → ③ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('seen'); ok(R.n === 1 && R.red, `★⑪ 미끼 seen — 계획한 감소를 여유분으로 세는 사본 → ④ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('farmcall'); ok(R.n === 1 && R.red, `★⑪ 미끼 farmcall — 골 앞에 못 거두는데 밭 일을 부르는 사본 → ⑤ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('redraw'); ok(R.n === 1 && R.red, `★⑪ 미끼 redraw — 날 경계에 365칸을 통째로 다시 그리는 사본 → ⑥ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('nosave'); ok(R.n === 1 && R.red, `★⑪ 미끼 nosave — 저장 → 되살림 뒤 장부가 다른 사본 → ⑦ 빨강(바꾼 자리 ${R.n})`, R.info); }
{ const R = baitRun('growth'); ok(R.n === 1 && R.red, `★⑪ 미끼 growth — 사람이 느는 것을 예상에 넣는 사본 → ③ 빨강(바꾼 자리 ${R.n})`, R.info); }

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
