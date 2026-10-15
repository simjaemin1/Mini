#!/usr/bin/env node
// @regress
// === scripts/test-granary-age.js — 곳간에서 꺼내면 새것이 되던 구멍 · 본 구현 (T732 · 손잡이 T732_MOMENT_LOT=1 · 없음 = 끔 = main 바이트) ===
//
// ★왜 [T716 ① 실측 → T732 본 구현 · 족보 631 ①] econ 곳간(`v.storage[재화]`)은 날짜 없는 총량이었다. 넣은 음식은 단위로 녹고, 꺼내면
//   `_afterWithdraw` 의 `Lots.reconcile(…, 오늘)` 이 **오늘 얻은 것**으로 잡았다 — 시든 고기를 넣었다 꺼내면 갓 잡은 고기가 됐다.
//   T716 ⑤ 는 넣은 몫만 곁 장부(`econ._t716Lots`)에 적는 임시 고침이었다(손잡이 `T716_GRANARY_AGE` · 기본 끔). T732 가 그 자리를 걷고
//   **곳간 칸 전부를 얻은 순간 로트 장부**로 만든다(`granary-lots.js`) — econ 이 만든 것도 그 순간의 로트 · 마을이 먹으면 오래된 것부터 ·
//   사람의 문(회관 · 거래소 · 게시판 · 겨울 몫 · 꺼내기 · 마을 밥 · 위세품 값)은 정본 함수가 정한 개수 · 단위 앞뒤에서 레코드만 옮긴다.
//
//  ① 손잡이 — '1' 하나만 켬 · 끄면 장부가 안 붙고 꺼낸 것은 오늘 것(main 그대로 — 구멍이 그대로 있다는 것도 잰다)
//  ② 켬 — 진짜 회관 문으로 넣기 → 장부 레코드(그 순간 · 단위 무게 · 접힌 신선도 f0) → 진짜 꺼내기 문 → 대표 품목이 **그 나이째**
//         · 접힌 신선도를 편다(낱개 = 문 몫 ÷ f0 — 두 번 깎으면 소멸) · 단위 보존(열량 × 신선도 = 꺼낸 단위)
//  ③ 마을이 먹은 몫 — 오래된 것부터(넣은 시든 고기가 먼저 먹힌다) · 섞인 꺼내기 — 넣은 몫(그 나이) + econ 이 만든 몫(그 순간)
//  ④ 오래된 것부터 — 두 번 넣은 장부에서 먼저 넣은 것이 먼저 나온다
//  ⑤ 거래소 · 마을 밥 — 받는 쪽도 곳간 레코드째 · 낸 쪽은 사람의 순간째
//     · ★[T748] 거래소 받기 = 열량 짝(`takeKcal` — 꺼내기 · 게시판 보상과 같은 `itemsOf`) — 받은 낱개 × 낱개 열량 = 곳간에서 나간 단위 · 로트는 레코드째
//  ⑥ 불변식 — 장부 합 − 빚 = 곳간 · 문이 레코드 없이 넣은 몫 0 · 사람 쪽 근사 0
//  ⑦ 배선 — 문 앞 `_t732DoorBegin` · 문 뒤 `_t732DoorEnd`(회관 · 거래소 · 게시판·겨울 몫 · 위세품 값) · 꺼내기는 membership 감싸개 · 마을 밥 ·
//         T716 임시 고침 자리(손잡이 · 도우미 셋 · 곁 장부)는 걷혔다
//
// 실행: node scripts/test-granary-age.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 — 존 하나(가벼운 판) + 랩 econ 마을 다섯(정본 진입점 · test-hall-units 꼴) ═══════════════════════
if (process.env.T732_SUB === 'zone') {
  const TMP = `/tmp/t732-granary-age-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42600 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.MEMBER_WD_MIN = '100000';   // ★한도 손잡이만 — 꺼내는 양이 하루 몫에 막히지 않게(곳간·환산·나이는 그대로)
  process.env.MEMBER_WD_FRAC = '1';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const V = H.SimVillages;
  const GL = H.GL;
  const out = { knob: process.env.T732_MOMENT_LOT == null ? null : process.env.T732_MOMENT_LOT, on: H.T732_MOMENT, gl: !!GL, errs: [] };
  try {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL), RES = 'meat_game';
    VIL.econ.founder = VIL.econ.founder || 'anon_t732_founder';   // 회관이 찾는 마을 = 플레이어가 세운 마을(`playerVillageAt` 조건 그대로)
    const HALL = 'b_t732_hall';
    H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT.x, y: AT.y, data: { x0: VIL.ccx, y0: VIL.ccy, villageDbId: VID, owner: null } });
    H.__e2eFreezeZoneDay(true);   // ★시계를 그 날 0시에 세운다 — 하네스가 도는 몇 초 동안 신선도가 안 움직인다(정확한 비교)
    if (GL) for (const v of vils) GL.attach(v.econ, null, null);   // 존 부팅(`_t732Boot`)이 하는 그 붙이기(랩 마을이라 손으로)
    out.rate = P.RATE; out.dayKcal = H.Kcal.DAY_KCAL;
    out.toEcon = L.deliverable.toEcon.get(RES);
    out.kcal = { bear: H.Kcal.kcalOf('meat_bear'), game: H.Kcal.kcalOf('meat_game'), fish: H.Kcal.kcalOf('fish') };
    const notes = [];
    let nP = 0;
    const mkP = () => {
      const p = { pid: `p_t732_${++nP}`, playerId: `anon_t732_${nP}`, name: '곳간지기', persistent: false,
        x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0,
        ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
      H.Membership.seatFounder(p, VID);
      return p;
    };
    const today = H.zoneGameDay();
    // 신선도를 **정확히** 세운 로트(노출 = 보관일 × (1 − f) · back 일 전 0시에 얻은 것) — 공개 API `Lots.moveIn`
    const give = (p, item, n, f, back) => {
      const Lf = H.Spoil.shelfOf(item);
      p.inventory[item] = (p.inventory[item] || 0) + n;
      H.Lots.moveIn(p, item, [{ d: today - (back || 1), n, e: Lf * (1 - f), t: today }], today, 0, 'carry');
    };
    const lotsOf = (p, item) => { H.Lots.reconcile(p, item, p.inventory, today); return H.Lots.of(p, item).map((l) => ({ k: l.k == null ? null : l.k, d: l.d, n: +l.n.toFixed(6), f: +H.Spoil.freshnessOf(item, H.Spoil.exposureOf(l, today)).toFixed(4) })); };
    const ledger = (res) => GL ? JSON.parse(JSON.stringify(GL.ledger(VIL.econ, res || RES))) : null;
    const hall = (p, want) => {   // 진짜 회관 문(관리자만 — `_furnaceCanUse` 그대로)
      H.buildings.get(HALL).data.owner = p.playerId;
      const s0 = Number(VIL.econ.storage[RES]) || 0;
      try { H.tryVillageDeposit(p, HALL, want); } catch (e) { out.errs.push('hall:' + String(e && e.message || e)); }   // (랩엔 맨 끝 화면 갱신이 던질 수 있다 — 넣기·장부는 그 앞에서 끝난다)
      return +((Number(VIL.econ.storage[RES]) || 0) - s0).toFixed(6);
    };
    const withdraw = (p, q, res) => { const r = res || RES; const s0 = Number(VIL.econ.storage[r]) || 0; H.tryVillageWithdraw(p, VID, r, q); return +(s0 - (Number(VIL.econ.storage[r]) || 0)).toFixed(6); };
    const a0 = H.Lots.stats().approx;
    if (GL) GL.stats(true);

    // ── A. 넣기 10 곰고기(f 0.5 · 사흘 전) → 꺼내기 3 단위 ────────────────────────────────
    VIL.econ.storage[RES] = 100;               // econ 이 만든 몫(지금 순간 · 접힘 없음)
    const a = mkP();
    give(a, 'meat_bear', 10, 0.5, 3);
    out.A0 = lotsOf(a, 'meat_bear');
    out.Adep = hall(a, { meat_bear: 10 });
    out.Aledger = ledger();
    const ga0 = Math.floor(+a.inventory.meat_game || 0);
    out.Awd = withdraw(a, 3);
    out.A = { inv: Object.assign({}, a.inventory), game: lotsOf(a, 'meat_game'), got: Math.floor(+a.inventory.meat_game || 0) - ga0, ledger: ledger(), note: notes[notes.length - 1] || '' };

    // ── B. 마을이 먹은 몫 — 넣은 뒤 재고를 1.2 로 줄이고(오래된 것부터) 1 단위 꺼낸다 ─────────────────
    VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 50;
    const b = mkP();
    give(b, 'meat_bear', 10, 0.5, 2);
    out.Bdep = hall(b, { meat_bear: 10 });
    out.Bledger0 = ledger();
    VIL.econ.storage[RES] = 1.2;               // NPC 가 먹었다(econ 의 줄이기 — 장부는 오래된 것부터)
    out.Bledger1 = ledger();
    out.Bwd = withdraw(b, 1);
    out.B = { game: lotsOf(b, 'meat_game') };

    // ── C. 섞인 꺼내기 — 작게 넣고(2) 크게 꺼낸다(3 단위) ─────────────────────────
    VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 100;
    const c = mkP();
    give(c, 'meat_bear', 2, 0.5, 2);
    out.Cdep = hall(c, { meat_bear: 2 });
    out.Cwd = withdraw(c, 3);
    out.C = { game: lotsOf(c, 'meat_game'), inv: Math.floor(+c.inventory.meat_game || 0) };

    // ── D. 오래된 것부터 — 두 번 넣는다(먼저 10개 f 0.3 · 나흘 전 / 나중 4개 f 0.8 · 하루 전) → 1 단위 꺼낸다 ─────────────
    VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 100;
    const d1 = mkP(), d2 = mkP(), d3 = mkP();
    give(d1, 'meat_bear', 10, 0.3, 4); out.Ddep1 = hall(d1, { meat_bear: 10 });
    give(d2, 'meat_bear', 4, 0.8, 1); out.Ddep2 = hall(d2, { meat_bear: 4 });
    out.Dledger0 = ledger();
    out.Dwd = withdraw(d3, 1);
    out.D = { game: lotsOf(d3, 'meat_game'), ledger: ledger() };

    // ── E. 거래소 — 곰고기를 내고 곡식을 받는다(받는 곡식 = 곳간에 먼저 든 시든 곡식 · 오래된 것부터 그 나이째) ─────────────
    const e1 = mkP(); give(e1, 'food', 30, 0.7, 2);
    H.buildings.get(HALL).data.owner = e1.playerId;
    try { H.tryVillageDeposit(e1, HALL, { food: 30 }); } catch (e) { out.errs.push('hallE:' + String(e && e.message || e)); }
    const foodBefore = ledger('food');
    const e2 = mkP(); give(e2, 'meat_bear', 30, 0.9, 1);
    //   거래소 정본(`trade.exchange` — `villageTradeExec` 가 근접 문 다음에 부르는 그것)을 존 문 도우미 사이에서 그대로 부른다
    //   (랩 프로브엔 econ 모듈 칸이 안 서서 존의 `tryVillageTradeExec` 는 시세에서 던진다 — 그 함수의 배선은 ⑦ 이 글자로 본다)
    const Trade = require(SV('trade.js'));
    const _uo = H._unitsOfFor(e2);
    const ctx = H._t732DoorBegin(e2, null);
    const r = Trade.exchange({ ledger: L, econV2, vil: VIL, vid: VID, inventory: e2.inventory, giveRes: RES, takeRes: 'food', giveQty: 30, want: 0, unitsOf: _uo, deposit: V.playerVillageDeposit });
    const g = H._t732DoorEnd(ctx, e2, !!(r && r.ok), VIL, _uo);
    out.E = { r: r && { ok: r.ok, err: r.err, give: r.give, take: r.take, took: r.tookItem }, food: lotsOf(e2, 'food'), inv: Object.assign({}, e2.inventory),
      foodBefore, foodAfter: ledger('food'), gameAfter: ledger() };

    // ── E2. [T748] 거래소 받기 = 열량 짝 — 켬의 거래소 문이 넘기는 `takeKcal`(kcal 정본)으로 낱개 열량이 하루치와 다른 곡물(쌀)을 받는다 ─────────────
    //   받는 낱개 = `itemsOf`(꺼내기 · 게시판 보상과 같은 함수) · 곳간에서 나가는 단위 = 그 낱개의 열량 · 사람에게 실리는 로트 = 곳간 레코드째(문)
    {
      const TR = 'rice', TI = L.deliverable.toEcon.get(TR);
      if (!((+VIL.econ.storage[TR] || 0) > 5)) VIL.econ.storage[TR] = 40;   // (랩 세계에 쌀이 모자라면 econ 몫으로 채운다 — 그 순간 레코드)
      const e3 = mkP(); give(e3, 'meat_bear', 20, 0.9, 1);
      const before = ledger(TR), s0 = +VIL.econ.storage[TR] || 0, a3 = H.Lots.stats().approx;
      const _uo3 = H._unitsOfFor(e3);
      const ctx3 = H._t732DoorBegin(e3, null);
      const r3 = Trade.exchange({ ledger: L, econV2, vil: VIL, vid: VID, inventory: e3.inventory, giveRes: RES, takeRes: TR, giveQty: 20, want: 0, unitsOf: _uo3, deposit: V.playerVillageDeposit, takeKcal: H.Kcal });
      H._t732DoorEnd(ctx3, e3, !!(r3 && r3.ok), VIL, _uo3);
      out.E2 = { tr: TR, ti: TI, kcal: H.Kcal.kcalOf(TI), day: H.Kcal.DAY_KCAL, r: r3 && { ok: r3.ok, err: r3.err, take: r3.take, takeUnits: r3.takeUnits, took: r3.tookItem },
        dS: +(s0 - (+VIL.econ.storage[TR] || 0)).toFixed(6), lots: lotsOf(e3, TI), inv: +(e3.inventory[TI] || 0), before, after: ledger(TR), approx: H.Lots.stats().approx - a3 };
    }

    // ── F. 마을 밥 — 구제 때 곳간에서 한 끼(곡식 · 그 나이째) ─────────────
    VIL.econ.storage.food = 0; VIL.econ.storage.food = 60;
    const f1 = mkP();
    const kFood = GL ? GL.ledger(VIL.econ, 'food').map((r) => r.k) : null;
    f1.hunger = 0; f1.inventory.food = 0;
    const aF = H.Lots.stats().approx, uF = GL ? GL.ledger(VIL.econ, 'food').reduce((x, r) => x + r.u, 0) : 0;
    const meal = H._villageMeal(f1, VID);
    out.F = { meal, food: lotsOf(f1, 'food'), kFood, approx: H.Lots.stats().approx - aF, du: GL ? +(uF - GL.ledger(VIL.econ, 'food').reduce((x, r) => x + r.u, 0)).toFixed(6) : null };

    // ── G. 불변식 · 근사 ─────────────
    out.check = GL ? GL.check(vils.map((v) => v.econ)) : null;
    out.glStats = GL ? GL.stats() : null;
    out.approx = H.Lots.stats().approx - a0;
  } catch (e) { out.err = String(e && e.stack || e); }
  console.log = _log;
  console.log(JSON.stringify(out));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T732_MOMENT_LOT; delete e.T732_SUB; delete e.T716_GRANARY_AGE; return e; })();
const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T732_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
const SRC = (f) => fs.readFileSync(SV(f), 'utf8');
const ZSRC = SRC('zone.js'), VSRC = SRC('villages.js'), MSRC = SRC('membership.js');
const code = (s) => s.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // 주석 뺀 코드

say('\n=== 곳간 나이 — 꺼내면 새것이 되던 구멍 · 본 구현 (T732 · 손잡이 T732_MOMENT_LOT=1) ===');
const zOff = sub({});
const zOn = sub({ T732_MOMENT_LOT: '1' });

say('\n① 손잡이 · 끔 = 종전(구멍이 그대로 있다)');
{
  pre(!zOff.err && !zOn.err, '존 두 판이 떴다', zOff.err || zOn.err || '');
  const knob = (v) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, v === undefined ? {} : { T732_MOMENT_LOT: v }, { T732_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());
  const kE = knob(''), k0 = knob('0'), kT = knob('true');
  ok(zOff.on === false && zOn.on === true && zOff.gl === false && zOn.gl === true && [kE, k0, kT].every((k) => k.on === false && k.gl === false),
    "★① 손잡이 — '1' 하나만 켬(없음·빈 값·'0'·'true' = 끔 · 끄면 곳간 장부 모듈을 싣지도 않는다)");
  pre(zOff.toEcon === 'meat_game' && zOff.rate > 0, '곳간 재화 meat_game 의 대표 품목 = 사슴·들짐승고기(대응 정본 · T694 켬)', `${zOff.toEcon} · 환산율 ${zOff.rate}`);
  pre(zOff.A0.length === 1 && near(zOff.A0[0].f, 0.5, 1e-3), '넣을 곰고기 10 — 시든 것(f 0.5)', JSON.stringify(zOff.A0));
  ok(zOff.Aledger === null && zOff.A.ledger === null, '① 끔 — 곳간 장부가 없다(econ 칸 그대로)');
  const g = zOff.A.game;
  ok(zOff.A.got > 0 && g.length >= 1 && g.every((l) => l.f === 1), '★★① 끔 — 꺼낸 것은 **오늘 얻은 것**(f 1) — "꺼내면 새것" 구멍(main 그대로)', `사슴·들짐승고기 ${zOff.A.got} · f ${g.map((l) => l.f).join(',')}`);
}

say('\n② 켬 — 회관 넣기 → 장부 레코드 → 꺼내기: 그 나이째 · 접힌 신선도를 편다 · 단위 보존');
{
  const A = zOn.A, led = zOn.Aledger, D = zOn.dayKcal;
  pre(zOn.Adep > 0, '회관 넣기가 곳간 칸을 올렸다(정본 환산 — 곰고기 열량 × 신선도 · T725 켬 기본)', `+${zOn.Adep} 단위`);
  const bear = (led || []).filter((r) => r.f0 < 1);
  ok(Array.isArray(led) && led.length === 2 && bear.length === 1 && near(bear[0].u, zOn.Adep, 1e-6) && near(bear[0].f0, 0.5, 1e-3) && bear[0].m === 0.7 && bear[0].w === 0.55 && led[0] === led.find((r) => r.f0 < 1) || (led && led[0].f0 < 1),
    '★★② 장부 — 넣은 곰고기 레코드 하나(단위 = 칸의 실제 증가 · 접힌 신선도 f0 0.5 · 곳간 자리) + econ 몫 레코드(f0 1) · 곰고기가 앞(사흘 전 순간)', JSON.stringify(led));
  pre(zOn.Awd > 2 && zOn.Awd < zOn.Adep, '꺼낸 단위 < 넣은 곰고기 단위(곰고기 레코드에서만 나온다)', `${zOn.Awd} < ${zOn.Adep}`);
  ok(A.game.length >= 1 && A.game.every((l) => near(l.f, 0.5, 1e-3)), '★★② 꺼낸 사슴·들짐승고기는 **곰고기의 나이째**(f 0.5 · 오늘 것으로 안 바뀐다)', JSON.stringify(A.game));
  const n = A.game.reduce((s, l) => s + l.n, 0);
  const unitsBack = n * zOn.kcal.game * 0.5 / D;
  ok(near(unitsBack, zOn.Awd, 0.02 * zOn.Awd), '★★② 단위 보존 — 나온 낱개의 열량 × 신선도 = 꺼낸 단위(곳간이 환전소가 아니다 · 두 번 깎지 않는다)', `${n.toFixed(4)} × ${zOn.kcal.game} × 0.5 ÷ ${D} = ${unitsBack.toFixed(4)} ≈ ${zOn.Awd}`);
  ok(A.got >= 2 * Math.floor(zOn.Awd * D / zOn.kcal.game) - 1, '② 접힌 신선도를 편 만큼 낱개가 는다(문 몫 ÷ f0 — 넣은 곰고기 그 몫 그대로)', `받은 낱개 ${A.got}`);
  ok(/곳간 나이째/.test(A.note), '② 화면이 그렇게 말한다(곳간 나이째 · 가장 늙은 몫 신선도)', A.note.slice(0, 120));
}

say('\n③ 마을이 먹은 몫(오래된 것부터) · 섞인 꺼내기');
{
  const L0 = zOn.Bledger0, L1 = zOn.Bledger1;
  pre(Array.isArray(L0) && L0.length === 2 && L0[0].f0 < 1, '넣은 뒤 장부 — 곰고기(이틀 전 순간 · 앞) + econ 몫', JSON.stringify(L0 && L0.map((r) => [r.f0, +r.u.toFixed(3)])));
  ok(Array.isArray(L1) && L1.length === 1 && L1[0].f0 === 1 && near(L1[0].u, 1.2, 1e-6), '★★③ 마을이 먹었다(재고 1.2) — **오래된 것부터**: 넣은 시든 곰고기가 먼저 먹혔다', JSON.stringify(L1));
  ok(zOn.B.game.length >= 1 && zOn.B.game.every((l) => l.f === 1), '③ 그래서 꺼낸 것은 econ 몫(지금 순간 — 이 판의 얼린 시계로 f 1)', JSON.stringify(zOn.B.game));
  const C = zOn.C.game;
  const half = C.filter((l) => near(l.f, 0.5, 1e-3)), one = C.filter((l) => l.f === 1);
  ok(half.length >= 1 && one.length >= 1, '★★③ 섞인 꺼내기 — 넣은 몫(곰고기 나이 f 0.5) + econ 몫(f 1) · 각자 제 나이', JSON.stringify(C));
  const U = (half.reduce((s, l) => s + l.n, 0) * 0.5 + one.reduce((s, l) => s + l.n, 0)) * zOn.kcal.game / zOn.dayKcal;
  ok(near(U, zOn.Cwd, 0.03 * zOn.Cwd), '③ 단위 보존(섞여도)', `${U.toFixed(4)} ≈ ${zOn.Cwd}`);
}

say('\n④ 오래된 것부터');
{
  const L0 = zOn.Dledger0;
  pre(Array.isArray(L0) && L0.length === 3 && L0[0].f0 < L0[1].f0 && L0[0].k < L0[1].k, '장부에 셋 — 먼저(나흘 전 · f 0.3) · 나중(하루 전 · f 0.8) · econ 몫', JSON.stringify(L0 && L0.map((r) => [+r.f0.toFixed(3), +r.u.toFixed(3)])));
  ok(zOn.D.game.length >= 1 && zOn.D.game.every((l) => near(l.f, 0.3, 1e-3)), '★★④ 작게 꺼내면 먼저 넣은 것(f 0.3)만 나온다', JSON.stringify(zOn.D.game));
  const LD = zOn.D.ledger;
  ok(Array.isArray(LD) && LD.length === 3 && near(LD[1].u, L0[1].u, 1e-9) && near(LD[2].u, L0[2].u, 1e-9), '④ 나중 레코드 · econ 몫은 그대로', JSON.stringify(LD && LD.map((r) => +r.u.toFixed(3))));
}

say('\n⑤ 거래소 · 마을 밥');
{
  const E = zOn.E;
  pre(E.r && E.r.ok && E.r.take > 0 && E.r.took === 'food', '거래소 교환이 됐다(곰고기 → 곡식)', JSON.stringify(E.r));
  pre(Array.isArray(E.foodBefore) && E.foodBefore.length >= 2 && near(E.foodBefore[0].f0, 0.7, 1e-3), '곡식 장부 — 먼저 든 시든 곡식(f 0.7 · 이틀 전)이 앞 · econ 몫이 뒤', JSON.stringify((E.foodBefore || []).map((r) => [+r.f0.toFixed(3), +r.u.toFixed(3)])));
  ok(E.food.length >= 1 && near(E.food[0].f, 0.7, 1e-3), '★★⑤ 받은 곡식 = 곳간 장부의 오래된 것부터(먼저 든 시든 곡식 f 0.7 · 그 나이째 — 오늘 것이 아니다)', JSON.stringify(E.food));
  ok((E.gameAfter || []).some((r) => near(r.f0, 0.9, 1e-3)), '★⑤ 낸 곰고기는 곳간 장부에 그 순간 · 접힌 신선도(f0 0.9)째', JSON.stringify((E.gameAfter || []).map((r) => [+r.f0.toFixed(3), +r.u.toFixed(3)])));
  const E2 = zOn.E2 || {};
  pre(E2.r && E2.r.ok && E2.r.take > 0 && E2.r.took === E2.ti && E2.kcal > 0 && Math.abs(E2.kcal - E2.day) > 1, '[T748] 거래소 교환(곰고기 → 쌀 · 열량 짝)이 됐다', JSON.stringify(E2.r));
  const per2 = E2.kcal / E2.day, sumN = (E2.lots || []).reduce((x, l) => x + l.n, 0), kB = new Set((E2.before || []).map((r) => r.k));
  ok(E2.r && near(E2.r.takeUnits, E2.r.take * per2, 1e-3) && near(E2.dS, E2.r.takeUnits, 2e-3),
    '★★⑤ [T748] 거래소 받기 = 열량 짝 — 받은 낱개 × 낱개 열량 = 곳간에서 나간 단위(꺼내기 · 게시판 보상과 같은 `itemsOf`)', `${E2.r && E2.r.take}개 × ${per2.toFixed(4)} = ${E2.r && E2.r.takeUnits} · 곳간 −${E2.dS}`);
  ok(E2.r && near(sumN, E2.inv, 1e-6) && E2.inv === E2.r.take && (E2.lots || []).every((l) => kB.has(l.k)) && E2.approx === 0,
    '★⑤ [T748] 받은 쌀의 로트 = 곳간 레코드째(문) · 낱개 합 = 인벤 = 받은 개수 · 근사 0', JSON.stringify(E2.lots));
  const F = zOn.F;
  pre(F.meal && F.meal.fed === true, '마을 밥 — 곳간에서 한 끼를 먹였다', JSON.stringify(F.meal));
  ok(F.meal && F.meal.fed === true && F.approx === 0 && near(F.du, F.meal.units, 1e-6) && (F.food.length === 0 || F.food.every((l) => F.kFood.includes(l.k))),
    '⑤ 마을 밥도 같은 감싸개 — 곳간 장부에서 그 단위만큼 오래된 것부터 · 사람 쪽 근사 0(먹은 뒤 남은 몫이 있으면 그 순간 그대로)', JSON.stringify({ du: F.du, approx: F.approx, left: F.food }));
}

say('\n⑥ 불변식 · 근사');
{
  ok(zOn.check && zOn.check.bad.length === 0 && zOn.check.cells > 0, '★★⑥ 장부 합 − 빚 = 곳간(감싼 칸 전부)', JSON.stringify(zOn.check && { cells: zOn.check.cells, bad: zOn.check.bad.slice(0, 3) }));
  ok(zOn.glStats && zOn.glStats.doorNoRec === 0, '★⑥ 문이 레코드 없이 넣은 몫 0(넣은 것은 다 사람의 레코드째)', JSON.stringify(zOn.glStats && { doors: zOn.glStats.doors, doorNoRec: zOn.glStats.doorNoRec, moved: zOn.glStats.moved }));
  ok(zOn.approx === 0, '★⑥ 사람 쪽 근사 0 — 꺼낸 것이 맞추기의 "지금 얻은 것"으로 안 잡힌다', `approx ${zOn.approx}`);
  ok(zOn.errs.every((e) => /playerVillageInventory|econ|undefined|null/.test(e)) && zOff.errs.length === zOn.errs.length, '⑥ (랩 마을이라 회관 맨 끝 화면 갱신만 던진다 — 끔 · 켬 같은 수)', `${zOn.errs.length} · ${zOn.errs[0] || ''}`.slice(0, 120));
}

say('\n⑦ 배선 — 문 앞 · 문 뒤 · 전부 손잡이 뒤 · T716 임시 고침은 걷혔다');
{
  const fnOf = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  const doors = [['tryVillageDeposit', /SimVillages\.playerVillageDeposit\(/], ['tryVillageTradeExec', /SimVillages\.villageTradeExec\(/], ['tryVillageDeliver', /SimVillages\.villageDeliver\(/], ['doSellIronRelic', /SimVillages\.lifeSellIronRelic\(/]];
  const bad = doors.filter(([n, re]) => { const f = fnOf(ZSRC, n); const a = f.indexOf('_t732DoorBegin('), b = f.search(re), c = f.indexOf('_t732DoorEnd(', b); return !(a > 0 && b > a && c > b); });
  ok(bad.length === 0, '★⑦ 문 넷(회관 · 거래소 · 게시판·겨울 몫 · 위세품 값) — 정본 함수 **앞**에서 `_t732DoorBegin` · **뒤**에서 `_t732DoorEnd`', bad.map((x) => x[0]).join(',') || '넷 다');
  const mw = fnOf(MSRC, 'withdraw');
  ok(/H\.wrapWithdraw\(player, _wd\)/.test(mw) && /\.\.\.\(process\.env\.T732_MOMENT_LOT === '1' \? \{ wrapWithdraw: \(player, fn\) => _t732Wrap\(player, fn\) \} : \{\}\)/.test(ZSRC),
    '★⑦ 꺼내기 — membership 의 정본 꺼내기가 존의 감싸개 안에서 돈다(UI · 채팅 `/곳간` · `/인출` 다) · 켬일 때만 감싸개를 준다');
  ok(/T732_MOMENT \? _t732Wrap\(p, \(\) => SimVillages\.playerVillageWithdraw\(vil, p\.inventory, 'food', 1\)\)/.test(fnOf(ZSRC, '_villageMeal')), '⑦ 마을 밥(구제 한 끼)도 같은 감싸개');
  ok(/const GL = T732_MOMENT \? require\('\.\/granary-lots'\) : null;/.test(ZSRC) && /function _t732DoorBegin\(player, giveItems\) \{\n  if \(!GL /.test(ZSRC), '⑦ 끄면 곳간 장부 모듈을 안 싣는다 · 문 도우미는 첫 줄에서 돌아간다(main 바이트)');
  const zc = code(ZSRC) + code(VSRC);
  ok(!/T716_GRANARY_AGE|_t716Snap|_t716Put|_t716Take|T716_AGE|_t716Lots\s*\|\|/.test(zc), '★⑦ T716 임시 고침 걷음 — 손잡이 · 도우미 셋 · 곁 장부 쓰기가 코드에 없다(곁 장부가 남은 옛 저장은 켬 부팅이 본 장부로 옮긴다)');
  ok(/v\._t716Lots/.test(SRC('granary-lots.js')) && /T716 걷기/.test(SRC('granary-lots.js')), '⑦ 옛 곁 장부(`econ._t716Lots`)가 있으면 그 레코드를 본 장부로 옮긴다(나이 그대로 · 지우지 않는다)');
  const sv = fnOf(VSRC, 'serializeEcon'), rs = fnOf(VSRC, 'restoreEcon');
  ok(/out\._t732Lots = D/.test(sv) && /_t732Saved\.set\(v, v\._t732Lots\); delete v\._t732Lots;/.test(rs), '⑦ 저장 — 곳간 장부는 곳간 값과 같은 econ 줄에(재기동이 같이 읽는다) · econ 객체엔 칸을 안 남긴다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
