#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-granary-rot.js — T789: 곳간은 상한 것을 내주지 않는다 · 상하면 즉시 버린다 (손잡이 `T789_DISCARD` · '1' 만 켬) ===
//
// ★재민 10-12 캐논(족보 631): NPC 는 가장 오래된 음식부터 먹고 **상하면 즉시 폐기**. T732 보고 §7 ⑦: 곳간이 상한 것도 내줬다
//   (켬 거래소에서 받은 날고기 신선도 0.00 · 400일 어촌6 굴 칸 237 레코드가 한 번도 안 줄었다). T778 로 순간 로트가 켬 기본이 됐다.
//   고친 것(`server/granary-lots.js` 한 자리 + 마을 한 줄 · 새 수 0):
//     ① econ 하루 마감 순간(`tickBegin` — econ 이 그날 먹기 전) — 상한 레코드(spoil 정본 `isSpoiled` · 품목 = 레코드의 품목)를 장부에서 빼고
//        econ 칸도 그 단위만큼 뺀다(장부 합 − 빚 = 곳간 값 그대로) · "썩어 없어짐" 사건으로 센다(`t789Rot` · 소멸 아님)
//     ② 사람의 문(꺼내기 · 거래소 받기 · 게시판 보상 · 마을 밥 · 위세품 값)과 사람이 보는 시세 · 견적 — 곳간 칸이 상한 몫을 뺀 값으로 보인다(econ 정본 함수
//        무변 — 그 값으로 몇 개를 정한다) · 줄어든 몫은 성한 레코드에서만(상한 것은 건너뛰고 그 자리에 남아 다음 마감에 버려진다)
//
//  ① 하루 마감 버림 — 상한 레코드만 빠진다(성한 것 · 넣은 품목의 보관일로 성한 것은 남는다) · econ 칸도 그만큼 · 셈 · 불변식 · 그 뒤 econ 은 성한 것부터 먹는다
//  ② 사람의 눈 — 시세 · 견적 · 문 동안 칸 = 상한 몫을 뺀 값 · 문은 성한 레코드만 뗀다 · 몸 손 문(어부 · 채집 · 농부)은 눈이 없다 · 다음 마감에 버려진다
//  ③ 존(진짜 문) — 꺼내기 · 거래소 받기 · 마을 밥 · 시세표 · 하루 마감(곳간 장부의 그 문 그대로)
//  ④ 끔 탐침(손잡이 없음 = main) — 같은 판에서 아무것도 안 버리고 · 문은 오래된 상한 것부터 내준다(종전 그대로 · 구멍이 그대로 있다는 것도 잰다)
//  ⑤ 글자 — 손잡이 한 자리(`=== '1'`) · 마을 하루 마감이 econ 마을 목록을 넘긴다 · 시세 · 견적이 같은 눈 · 몸 손 문은 눈이 없다
//
// 실행: node scripts/test-granary-rot.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);
const R6 = (x) => +(+x).toFixed(6);
const sumU = (a) => (a || []).reduce((s, r) => s + (+r.u || 0), 0);

// ══ 모듈 판(장부 모듈을 하네스 시계로 직접 — 켬은 본 판 · 끔은 아이 판이 같은 길을 돈다) ══════════════════════════════════════
function modRun() {
  const Lots = require(SV('lots.js'));
  const Spoil = require(SV('spoil.js'));
  const GL = require(SV('granary-lots.js'));
  const DAY = 1440000, MIN = DAY / 1440;
  let NOW = 900 * DAY + 180 * MIN;
  Lots.setClock(() => NOW, DAY);
  const out = { T789: GL.T789, on: GL.ON && Lots.momentOn(), stKeys: Object.keys(GL.stats()).filter((k) => /^t789/.test(k)) };
  // 사람의 문 그 길(test-granary-item 꼴) — 넣기(문 동안 늘어난 몫을 레코드로) · 꺼내기(문 동안 줄어든 몫의 레코드를 모은다)
  const doorPut = (v, res, recs) => { GL.doorBegin(); v.storage[res] += sumU(recs); const d = GL.doorEnd(true); GL.doorIn(d, v, res, recs); GL.doorRest(d); };
  const doorTake = (v, res, u) => { GL.doorBegin(); v.storage[res] -= u; const d = GL.doorEnd(true); const M = d && d.cap.get(v); const recs = (M && M[res]) || []; GL.doorRest(d); return recs; };
  // 노출을 정확히 세운 레코드(정산 순간 = 지금 · 그 뒤로 안 늘었다)
  const rec = (backDays, u, e, it) => { const o = { k: NOW - backDays * DAY, u, f0: 1, e, t: NOW / DAY, m: 1, w: 0 }; if (it) o.it = it; return o; };
  const L = (v, res) => (GL.ledger(v, res) || []).map((r) => [r.it || '*', R6(r.u), R6(r.e)]);
  out.shelf = { fish: Spoil.shelfOf('fish'), cod: Spoil.shelfOf('cod'), food: Spoil.shelfOf('food') };

  // ── ① 하루 마감 버림 ───────────────────────────────────────────
  const v = { name: '갑', storage: { fish: 0, food: 0 } };
  GL.attach(v, null, null);
  doorPut(v, 'fish', [rec(9, 3, 3.0)]);            // 상한 생선(노출 3.0 ≥ 생선 보관일 2.5)
  doorPut(v, 'fish', [rec(8, 1, 3.0, 'cod')]);     // 같은 노출이지만 넣은 품목 = 대구(보관일 5) — 성하다
  doorPut(v, 'fish', [rec(1, 2, 0.2)]);            // 갓 든 생선
  doorPut(v, 'food', [rec(200, 1, 200)]);          // 상한 곡식(노출 200 ≥ 180)
  doorPut(v, 'food', [rec(100, 4, 100)]);          // 성한 곡식
  out.pre = { st: { fish: R6(v.storage.fish), food: R6(v.storage.food) }, fish: L(v, 'fish'), food: L(v, 'food') };
  GL.stats(true); GL.rotOf(true);
  GL.tickBegin();                                  // 목록 없이 부르면(종전 호출) 아무것도 안 버린다
  out.noList = { st: { fish: R6(v.storage.fish), food: R6(v.storage.food) }, n: L(v, 'fish').length };
  GL.tickEnd();
  GL.tickBegin([v]);                               // ★하루 마감 머리 — 마을이 econ 마을 목록을 넘긴다
  out.rot = { st: { fish: R6(v.storage.fish), food: R6(v.storage.food) }, fish: L(v, 'fish'), food: L(v, 'food'), stats: GL.stats(), rotOf: GL.rotOf(),
    check: GL.check([v]).bad.length, items: GL.checkItems([v]).bad.length, flow: GL.itemFlow(v) };
  GL.eaten(true);
  v.storage.fish -= 1.5;                           // 같은 마감 안에서 econ 이 먹었다(문 · 싣기 밖) — 오래된 것부터(상한 것은 이미 없다)
  GL.tickEnd();
  out.eat = { fish: L(v, 'fish'), eaten: GL.eaten(), check: GL.check([v]).bad.length };

  // ── ② 사람의 눈 ───────────────────────────────────────────────
  NOW += 30 * MIN;
  const w = { name: '을', storage: { fish: 0 } };
  GL.attach(w, null, null);
  doorPut(w, 'fish', [rec(9, 3, 3.0)]);            // 상한 3
  doorPut(w, 'fish', [rec(1, 2, 0.2)]);            // 성한 2
  out.view = { real0: R6(w.storage.fish) };
  const vb = GL.viewBegin(); out.view.opened = !!vb; out.view.seen = R6(w.storage.fish); GL.viewEnd();
  out.view.after = R6(w.storage.fish);
  const took = doorTake(w, 'fish', 1.5);           // 사람의 문이 1.5 를 뗀다
  out.view.took = took.map((r) => [R6(r.u), R6(r.e)]);
  out.view.led = L(w, 'fish'); out.view.real1 = R6(w.storage.fish); out.view.check = GL.check([w]).bad.length;
  GL.doorBegin(); out.view.inDoor = R6(w.storage.fish); { const d = GL.doorEnd(true); GL.doorRest(d); }
  GL.doorOpen(w); out.view.hands = R6(w.storage.fish); GL.doorShut(w, 'fish', []);   // 몸 손 문 — 눈이 없다(실제 값)
  GL.tickBegin([w]); GL.tickEnd();
  out.view.next = { st: R6(w.storage.fish), led: L(w, 'fish'), check: GL.check([w]).bad.length };
  out.stats = GL.stats();

  // ── ⑥ [T803] 판정 순간 = econ 날의 마감 머리(마을이 존 시계로 옮겨 넘긴 머리 · 마감이 늦게 열린 벽시계 순간은 안 들어온다) ──────────
  NOW = 950 * DAY;                                 // 그 날 머리(950일 0시)에 곳간에 든 생선 — 노출이 보관일 바로 밑
  const xv = { name: '병', storage: { fish: 0 } };
  GL.attach(xv, null, null);
  //   머리 뒤 10시간이면 넘는다(곡선 하한 `Spoil.EXP.R_MIN` 0.05/일 × 곳간 자리 배율 0.70 × 10/24일 ≈ 0.015 > 0.01)
  doorPut(xv, 'fish', [{ k: 940 * DAY, u: 2, f0: 1, e: Spoil.shelfOf('fish') - 0.01, t: 950, m: 1, w: 0 }]);
  NOW = 950 * DAY + 600 * MIN;                     // 그 날 10시에야 마감이 열렸다(밀린 마감 · 틱 늦음)
  out.head = { DAY, pre: L(xv, 'fish') };
  GL.tickBegin([xv], 950 * DAY);                   // ★마을이 그 econ 날의 마감 머리(존 시계 · 950일 0시)를 넘긴다 — 판정 = 그 머리
  out.head.kept = L(xv, 'fish'); out.head.st = R6(xv.storage.fish);
  xv.storage.fish += 1;                            // 마감 동안 econ 이 얻은 것 — 열쇠 = 그 날 머리
  out.head.ks = (GL.ledger(xv, 'fish') || []).map((r) => r.k);
  GL.tickEnd();
  GL.tickBegin([xv]);                              // 날을 안 넘기면(종전 호출 꼴 · 랩 자 — 시계가 이미 econ 날) 판정 = 지금(10시)
  out.head.noDay = { led: L(xv, 'fish'), st: R6(xv.storage.fish), check: GL.check([xv]).bad.length };
  GL.tickEnd();
  //   T731 창 — 머리 조각만 버린다 · 창 가운데 조각(`head === false`)은 열쇠만 그 머리(조각 나눔 = 벽시계 · 판정이 거기 걸리면 판이 갈린다)
  NOW = 960 * DAY + 300 * MIN;
  const xw = { name: '정', storage: { fish: 0 } };
  GL.attach(xw, null, null);
  doorPut(xw, 'fish', [{ k: 950 * DAY, u: 3, f0: 1, e: Spoil.shelfOf('fish') + 1, t: 960, m: 1, w: 0 }]);   // 이미 상한 생선 3
  GL.tickBegin([xw], 960 * DAY, false);            // 창 가운데 조각
  out.chunk = { mid: { st: R6(xw.storage.fish), n: L(xw, 'fish').length } };
  xw.storage.fish += 1;                            // 그 조각 동안 econ 이 얻은 것 — 열쇠 = 머리
  out.chunk.ks = (GL.ledger(xw, 'fish') || []).map((r) => r.k);
  GL.tickEnd();
  GL.tickBegin([xw], 961 * DAY, true);             // 다음 창 머리 조각 — 버린다
  out.chunk.head = { st: R6(xw.storage.fish), led: L(xw, 'fish'), check: GL.check([xw]).bad.length };
  GL.tickEnd();
  //   벽시계 순간 → 존 게임 ms(`GL.msAt` — 존이 꽂은 `zoneGameMsAt` 산수 · 얼었던 날수 3 이면 950일 머리 = 947일 머리) · 안 꽂았으면 null
  GL.setAt((ms) => ms - 3 * DAY);
  out.msAt = { off3: GL.msAt(950 * DAY + 7) };
  GL.setAt(null);
  out.msAt.none = GL.msAt(950 * DAY);

  // ── ⑦ [T803] 부패 한 길 — econ 일일 부패(`tickDecay`)는 장부가 쥔 칸에서 안 돈다(로트 아닌 칸 · 끔은 종전 그대로) ──────────
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const _log = console.log; console.log = () => {};
  const wd = V2.createWorldV2({ seed: 7, villageCount: 3, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  for (let d = 0; d < 30; d++) V2.tickWorldV2(wd);
  console.log = _log;
  const ev = wd.villages[0];
  ev.storage.fish = 100; ev.storage.wood = 100;    // 장부가 쥘 칸(생선 — 로트) · 안 쥘 칸(나무 — 로트 아님)
  GL.attach(ev, null, null);
  V2.setLotHook(GL.hooks);
  const ew = wd.villages[1]; ew.storage.fish = 100; GL.attach(ew, null, null);   // 장부는 붙었지만 마감 목록을 못 받은 마을(버림이 안 닿는다)
  out.decay = { pre: { fish: GL.decayOwned(ev, 'fish') } };
  GL.tickBegin([ev]); GL.tickEnd();               // 마감 머리가 ev 를 넘겨 받았다 — 이제 장부 버림이 ev 에 닿는다
  out.decay.owned = { fish: GL.decayOwned(ev, 'fish'), wood: GL.decayOwned(ev, 'wood'), none: GL.decayOwned(ev, 'nope_res') };
  out.decay.unwired = { owned: GL.decayOwned(ew, 'fish') };
  out.decay.s0 = { fish: R6(ev.storage.fish), wood: R6(ev.storage.wood) };
  V2.tickDecay(ev); V2.tickDecay(ew);
  out.decay.s1 = { fish: R6(ev.storage.fish), wood: R6(ev.storage.wood) };
  out.decay.unwired.fish = R6(ew.storage.fish);
  out.decay.check = GL.check([ev, ew]).bad.length;
  V2.setLotHook(null);
  V2.tickDecay(ev);                                // 훅이 없으면(랩 · CLI) 장부가 붙어 있어도 econ 이 썩힌다(종전 그대로)
  out.decay.s2 = { fish: R6(ev.storage.fish) };
  return out;
}

// ══ 존 판(진짜 문 — test-granary-age 꼴 · 존 하나 + 랩 econ 마을 다섯) ══════════════════════════════════════════════════
function zoneRun() {
  const TMP = `/tmp/t789-granary-rot-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42900 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.MEMBER_WD_MIN = '100000'; process.env.MEMBER_WD_FRAC = '1';   // 한도 손잡이만(곳간 · 환산 · 나이는 그대로)
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const out = { errs: [] };
  try {
    const Zone = require(SV('zone.js'));
    const H = Zone.__testBind();
    const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
    const Events = require(SV('events.js'));
    const Trade = require(SV('trade.js'));
    const V = H.SimVillages, GL = H.GL;
    out.gl = !!GL; out.T789 = !!(GL && GL.T789);
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const Lg = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    Lg.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(Lg, vils);
    const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL), RES = 'meat_game';
    VIL.econ.founder = VIL.econ.founder || 'anon_t789_founder';
    H.__e2eFreezeZoneDay(true);   // 시계를 그 날 0시에 세운다 — 하네스가 도는 몇 초 동안 신선도가 안 움직인다
    for (const v of vils) GL.attach(v.econ, null, null);
    const today = H.zoneGameDay(), DAYMS = H.Lots.dayMs();
    const notes = [];
    let nP = 0;
    const mkP = () => {
      const p = { pid: `p_t789_${++nP}`, playerId: `anon_t789_${nP}`, name: '곳간지기', persistent: false,
        x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0,
        ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
      H.Membership.seatFounder(p, VID);
      return p;
    };
    const fmin = (p, item) => { H.Lots.reconcile(p, item, p.inventory, today); let m = null; for (const l of H.Lots.of(p, item)) { const f = H.Spoil.freshnessOf(item, H.Spoil.exposureOf(l, today)); m = m == null ? f : Math.min(m, f); } return m == null ? null : +m.toFixed(4); };
    const withdraw = (p, q, res) => { const r = res || RES; const s0 = Number(VIL.econ.storage[r]) || 0;
      if (H.T769) VIL.econ.founder = p.playerId;   // ★[T769] 켬 = 꺼내기는 촌장만(test-granary-age 꼴)
      H.tryVillageWithdraw(p, VID, r, q); return R6(s0 - (Number(VIL.econ.storage[r]) || 0)); };
    // 칸을 비우고 상한 몫 · 성한 몫을 세운다 — 상한 몫은 옮김(대기 레코드 → 늘어남)으로 노출째 · 성한 몫은 지금 얻은 것(그 날 0시)
    const fill = (res, badU, badE, goodU) => {
      VIL.econ.storage[res] = 0;
      GL.pushIn(VIL.econ, res, [{ k: (today - 9) * DAYMS, u: badU, f0: 1, e: badE, t: today, m: 1, w: 0 }]);
      VIL.econ.storage[res] = (Number(VIL.econ.storage[res]) || 0) + badU; GL.clearIn(VIL.econ, res);
      if (goodU > 0) VIL.econ.storage[res] = (Number(VIL.econ.storage[res]) || 0) + goodU;
      return (GL.ledger(VIL.econ, res) || []).map((r) => [R6(r.u), R6(r.e)]);
    };
    GL.stats(true); GL.rotOf(true);
    const shelfG = H.Spoil.shelfOf(RES), kG = H.Kcal.kcalOf(RES), DK = H.Kcal.DAY_KCAL;
    out.shelfG = shelfG;

    // ── A. 꺼내기 — 성한 몫 안이면 성한 것만 · 넘으면 거절(상한 것을 안 내준다) ─────────────
    out.Afill = fill(RES, 3, shelfG + 0.5, 2);
    const a = mkP();
    out.A = { du: withdraw(a, 1), f: fmin(a, RES), inv: +a.inventory[RES] || 0 };   // 1 단위 = 낱개 2(열량 짝 · 성한 2 안)
    const b = mkP();
    out.B = { du: withdraw(b, 3), f: fmin(b, RES), inv: +b.inventory[RES] || 0, note: notes[notes.length - 1] || '', led: (GL.ledger(VIL.econ, RES) || []).map((r) => [R6(r.u), R6(r.e)]) };

    // ── C. 시세표 · 거래소 받기(문 감싸개 · 정본 교환) ─────────────
    out.Cfill = fill(RES, 3, shelfG + 0.5, 10);   // 성한 10(마을이 한 번에 내줄 수 있는 몫 = 재고의 일부 — 정본 `payableQty`)
    const c = mkP(); c.inventory.food = 400;
    const _uo = H._unitsOfFor(c);
    //   시세표 · 견적 — 마을의 그 두 문(`villageTradeBoard` · `villageTradeQuote`)이 여는 그 눈(`_t789View` = `GL.viewBegin`)으로 정본 두 함수를 부른다
    //   (랩 프로브는 econ 모듈 칸을 안 세워 마을 문은 시세에서 던진다 — T732 §7 ⑥ · 마을 배선은 ⑤ 글자가 본다)
    //   ★[T803 추신] 줄 곡식은 **그 세계의 값**으로 고른다 — 상한에 안 걸리면서 한 낱개 이상 받는 가장 작은 양(값 사다리 · 견적 그 문).
    //     종전 "곡식 2" 는 그 판 세계 값에 건 수였다: 랩 econ(시드 7 · 200일)의 고기/곡식 값이 T792(현지 시계 — 마을 조각 날씨) 뒤로
    //     ~15배 뛰어 곡식 2 · 20 은 0 낱개 · 30 이면 1 낱개다(실측 사다리 — 보고 T803). 단언(성한 것 · 견적 = 실행 · 상한 안)은 그대로.
    let giveQ = 0, uGive = 0, qv = null;
    for (const q of [2, 5, 10, 20, 30, 40, 60, 80, 100, 150, 200, 300, 400]) {
      const u = Number(_uo('food', q)) || q;
      GL.viewBegin(); const t = Trade.quote(Lg, econV2, VIL, VID, 'food', RES, u, { want: 0, perItem: u / q, takeKcal: H.Kcal }); GL.viewEnd();
      if (t && t.ok && t.take > 0 && !t.capped) { giveQ = q; uGive = u; qv = t; break; }
    }
    out.CgiveQ = giveQ;
    GL.viewBegin();
    const brd = Trade.board(Lg, econV2, VIL, VID, c.inventory, null, H.Kcal);
    GL.viewEnd();
    const row = brd && brd.rows && brd.rows.find((x) => x.res === RES);
    out.Cboard = row ? { stock: row.stock, sell: row.sell } : null;
    out.Cquote = qv && { ok: qv.ok, err: qv.err, take: qv.take, stock: qv.stock, capped: qv.capped };
    const ctx = H._t732DoorBegin(c, null);
    const r = Trade.exchange({ ledger: Lg, econV2, vil: VIL, vid: VID, inventory: c.inventory, giveRes: 'food', takeRes: RES, giveQty: giveQ || 2, want: 0, unitsOf: _uo, deposit: V.playerVillageDeposit, takeKcal: H.Kcal });
    H._t732DoorEnd(ctx, c, !!(r && r.ok), VIL, _uo);
    out.C = { r: r && { ok: r.ok, err: r.err, take: r.take }, f: fmin(c, RES), inv: +c.inventory[RES] || 0 };

    // ── D. 마을 밥 — 곳간 곡식이 다 상했으면 한 끼를 못 준다(켬) ─────────────
    out.Dfill = fill('food', 3, H.Spoil.shelfOf('food') + 1, 0);
    const dP = mkP(); dP.hunger = 0; dP.inventory.food = 0;
    const meal = H._villageMeal(dP, VID);
    out.D = { meal: meal && { fed: !!meal.fed, empty: !!meal.empty, off: !!meal.off }, f: fmin(dP, 'food'), inv: +dP.inventory.food || 0 };

    // ── E. 하루 마감 — 곳간 장부의 마감 문(마을이 econ 마을 목록을 넘긴다) ─────────────
    out.Efill = fill(RES, 3, shelfG + 0.5, 2);
    const s0 = { meat: R6(VIL.econ.storage[RES]), food: R6(VIL.econ.storage.food) };
    GL.tickBegin(vils.map((v) => v.econ));
    out.E = { s0, s1: { meat: R6(VIL.econ.storage[RES]), food: R6(VIL.econ.storage.food) }, led: (GL.ledger(VIL.econ, RES) || []).map((x) => [R6(x.u), R6(x.e)]), rotOf: GL.rotOf() };
    GL.tickEnd();
    out.check = GL.check(vils.map((v) => v.econ));
    out.checkItems = GL.checkItems(vils.map((v) => v.econ));
    out.st = GL.stats();
    out.kG = kG; out.DK = DK;
  } catch (e) { out.err = String(e && e.stack || e); }
  console.log = _log;
  console.log(JSON.stringify(out));
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

if (process.env.T789_SUB === 'mod') { console.log(JSON.stringify(modRun())); process.exit(0); }
if (process.env.T789_SUB === 'zone') zoneRun();

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
const J = (o) => JSON.stringify(o);
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T789_DISCARD; delete e.T789_SUB; delete e.T732_MOMENT_LOT; return e; })();
const sub = (kind, env) => {
  const s = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T789_SUB: kind }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop();
  try { return JSON.parse(s); } catch (e) { return { err: 'JSON: ' + s.slice(0, 300) }; }
};

say('\n=== 곳간은 상한 것을 내주지 않는다 · 상하면 즉시 버린다 (T789 · 손잡이 T789_DISCARD) ===');
const mOn = sub('mod', { T789_DISCARD: '1' }), mOff = sub('mod', {});
const zOn = sub('zone', { T789_DISCARD: '1' }), zOff = sub('zone', {});
pre(!mOn.err && !mOff.err && !zOn.err && !zOff.err, '아이 판 넷이 섰다(모듈 켬 · 끔 · 존 켬 · 끔)', [mOn.err, mOff.err, zOn.err, zOff.err].filter(Boolean).join(' | ').slice(0, 300));
pre(mOn.on && mOn.T789 === true && mOff.T789 === false && zOn.T789 === true && zOff.T789 === false, "손잡이 — '1' 이면 켬 · 없으면 끔(T732 순간 로트는 둘 다 켬 기본)", J({ m: [mOn.T789, mOff.T789], z: [zOn.T789, zOff.T789] }));

say('\n① 하루 마감 버림 — 상한 레코드만 · econ 칸도 그만큼 · 셈 · 불변식');
{
  const p = mOn.pre, r = mOn.rot;
  pre(p && near(p.st.fish, 6) && near(p.st.food, 5) && p.fish.length === 3 && p.food.length === 2, '픽스처 — 생선 칸: 상한 3(노출 3.0 ≥ 2.5) · 대구 1(노출 3.0 < 대구 5) · 갓 든 2 / 곡식 칸: 상한 1 · 성한 4', J(p));
  ok(near(mOn.noList.st.fish, 6) && near(mOn.noList.st.food, 5) && mOn.noList.n === 3, '① 목록 없이 부른 마감 머리(종전 호출 꼴)는 아무것도 안 버린다', J(mOn.noList));
  ok(r && near(r.st.fish, 3) && near(r.st.food, 4), '★★① 마감 순간 — econ 칸이 버린 몫만큼 준다(생선 6 → 3 · 곡식 5 → 4)', J(r && r.st));
  ok(r && J(r.fish) === J([['cod', 1, 3], ['*', 2, 0.2]]) && J(r.food) === J([['*', 4, 100]]), '★★① 상한 레코드만 빠진다 — 넣은 품목이 대구면 대구의 보관일로 판정(같은 노출 3.0 이 남는다)', J(r && { fish: r.fish, food: r.food }));
  ok(r && r.stats.t789Rot === 2 && near(r.stats.t789RotU, 4) && near(r.stats.t789RotItemU, 0) && r.stats.t789RotDays === 1 && J(r.rotOf) === J({ fish: 3, food: 1 }),
    '★① 버린 것은 "썩어 없어짐" 사건으로 센다(`t789Rot` 2 · 단위 4 · 품목별 생선 3 · 곡식 1 — 소멸이 아니다)', J(r && { rot: r.stats.t789Rot, u: r.stats.t789RotU, by: r.rotOf }));
  ok(r && r.check === 0 && r.items === 0 && r.flow && near(r.flow.in.cod, 1) && !(r.flow.out.cod > 0), '★① 불변식 — 장부 합 − 빚 = 곳간 값 · 품목 합 = 든 것 − 난 것(대구는 그대로)', J(r && { check: r.check, items: r.items, flow: r.flow }));
  const e = mOn.eat;
  ok(e && J(e.fish) === J([['*', 1.5, 0.2]]) && near((e.eaten || {}).cod, 1) && e.check === 0, '★① 그 뒤 econ 이 먹으면 가장 오래된 **성한** 것부터(대구 1 → 갓 든 것 0.5 · 상한 것은 이미 없다)', J(e));
}

say('\n② 사람의 눈 — 시세 · 견적 · 문 동안 칸 = 상한 몫을 뺀 값 · 성한 레코드만 뗀다');
{
  const w = mOn.view;
  pre(w && near(w.real0, 5), '픽스처 — 상한 3 + 성한 2 = 5', J(w && w.real0));
  ok(w && w.opened && near(w.seen, 2) && near(w.after, 5), '★★② 시세 · 견적의 눈(`viewBegin`) — 칸이 상한 몫을 뺀 2 로 보이고 · 눈을 닫으면 5', J(w && { seen: w.seen, after: w.after }));
  ok(w && J(w.took) === J([[1.5, 0.2]]) && J(w.led) === J([['*', 3, 3], ['*', 0.5, 0.2]]) && near(w.real1, 3.5) && w.check === 0,
    '★★② 사람의 문이 1.5 를 떼면 성한 레코드에서만(상한 3 은 건너뛰고 그 자리에) · 장부 합 = 곳간', J(w && { took: w.took, led: w.led, real: w.real1 }));
  ok(w && near(w.inDoor, 0.5) && near(w.hands, 3.5), '② 문 안의 칸 = 성한 0.5 · 몸 손 문(`doorOpen` — 어부 · 채집 · 농부)은 눈이 없다(실제 3.5)', J(w && { inDoor: w.inDoor, hands: w.hands }));
  ok(w && w.next && near(w.next.st, 0.5) && J(w.next.led) === J([['*', 0.5, 0.2]]) && w.next.check === 0, '★② 문이 건너뛴 상한 몫은 다음 마감에 버려진다(3.5 → 0.5)', J(w && w.next));
  ok(mOn.stats && mOn.stats.t789Views >= 1 && mOn.stats.t789Hid >= 1 && mOn.stats.t789Skip >= 1, '② 셈 — 눈 · 숨긴 칸 · 건너뛴 레코드', J(mOn.stats && { views: mOn.stats.t789Views, hid: mOn.stats.t789Hid, hidU: R6(mOn.stats.t789HidU), skip: mOn.stats.t789Skip }));
}

say('\n③ 존(진짜 문) — 꺼내기 · 거래소 받기 · 시세표 · 마을 밥 · 하루 마감');
{
  const z = zOn;
  pre(z.gl && z.Afill && z.Afill.length === 2 && z.Afill[0][1] > z.shelfG, '칸 — 상한 3(노출 > 보관일) + 성한 2(그 날 0시에 얻은 것)', J(z.Afill));
  ok(z.A && z.A.inv === 2 && z.A.f != null && z.A.f > 0, '★★③ 꺼내기 — 성한 몫 안이면 성한 것만 나온다(1 단위 = 낱개 2 · 가장 늙은 몫 신선도 > 0)', J(z.A));
  ok(z.B && z.B.inv === 0 && near(z.B.du, 0) && /그만큼 없다/.test(z.B.note), '★★③ 남은 성한 몫(≈1)을 넘게(3) 청하면 거절 — 상한 것을 안 내준다(정본 문의 그 거절 · 곳간 그대로)', J({ du: z.B && z.B.du, note: z.B && z.B.note }));
  ok(z.Cboard && near(z.Cboard.stock, 10, 1e-2) && z.Cquote && near(z.Cquote.stock, 10, 1e-2), '★③ 시세표 · 견적(사람의 눈) — 그 칸 재고가 성한 10 으로 보인다(상한 3 빼고)', J({ board: z.Cboard, quote: z.Cquote }));
  pre(z.CgiveQ > 0, '[T803 추신] 줄 곡식 = 그 세계 값으로 고른 가장 작은 양(상한 안 · 한 낱개 이상 — 값 사다리)', `${z.CgiveQ}`);
  ok(z.C && z.C.r && z.C.r.ok && z.C.inv > 0 && z.C.f != null && z.C.f > 0, '★★③ 거래소 받기 — 받은 것은 성한 것(가장 늙은 몫 신선도 > 0)', J(z.C));
  ok(z.C && z.C.r && z.Cquote && !z.Cquote.capped && z.Cquote.take > 0 && z.C.r.take === z.Cquote.take, '★③ 견적 = 실행 — 같은 눈이라 받을 낱개가 같다(상한에 안 걸리는 양)', J({ quote: z.Cquote && z.Cquote.take, exec: z.C && z.C.r && z.C.r.take }));
  ok(z.D && z.D.meal && !z.D.meal.fed && z.D.inv === 0, '★★③ 마을 밥 — 곳간 곡식이 다 상했으면 한 끼를 못 준다(상한 것을 안 먹인다)', J(z.D));
  ok(z.E && near(z.E.s0.meat - z.E.s1.meat, 3) && J(z.E.led) === J([[2, 0]]) && near(z.E.rotOf.meat_game || 0, 3) && near(z.E.s0.food - z.E.s1.food, 3) && near(z.E.rotOf.food || 0, 3),
    '★★③ 하루 마감 — 상한 고기 3 · 마을 밥이 못 준 상한 곡식 3 이 장부 · 칸에서 같이 빠진다(곳간 장부 마감 문 · 성한 2 는 남는다)', J(z.E));
  ok(z.check && z.check.bad.length === 0 && z.checkItems && z.checkItems.bad.length === 0, '★③ 불변식 — 다섯 마을 장부 합 = 곳간 · 품목 합 = 든 것 − 난 것', J({ cells: z.check && z.check.cells, bad: z.check && z.check.bad.length }));
}

say("\n④ 끔 탐침(손잡이 없음 = main) — 아무것도 안 버리고 · 문은 오래된 상한 것부터 내준다(종전 그대로)");
{
  const r = mOff.rot, w = mOff.view, z = zOff;
  ok(mOff.stKeys.length === 0 && r && near(r.st.fish, 6) && near(r.st.food, 5) && r.fish.length === 3 && J(r.rotOf) === J({}) && r.check === 0,
    '★④ 끔 — 마감에 아무것도 안 버린다 · `stats()` 꼴 그대로(T789 칸 없음)', J(r && { st: r.st, n: r.fish.length, keys: mOff.stKeys }));
  ok(w && !w.opened && near(w.seen, 5) && J(w.took) === J([[1.5, 3]]), '★④ 끔 — 눈이 없다(5) · 문은 오래된 상한 것부터 뗀다(구멍이 그대로 있다)', J(w && { seen: w.seen, took: w.took }));
  ok(z.A && z.A.inv === 2 && z.A.f === 0 && z.B && z.B.inv === 6 && z.B.f === 0 && z.D && z.D.meal && z.D.meal.fed,
    '★④ 끔 존 — 꺼내기 · 마을 밥이 상한 것을 내준다(신선도 0 · 종전 그대로)', J({ A: z.A, B: z.B && { inv: z.B.inv, f: z.B.f }, D: z.D }));
  ok(z.E && near(z.E.s0.meat, z.E.s1.meat) && J(z.E.rotOf) === J({}) && z.Cboard && near(z.Cboard.stock, 13, 1e-2), '④ 끔 존 — 마감이 칸을 안 줄인다 · 시세표는 상한 몫까지 센다(13)', J(z.E && { s0: z.E.s0, s1: z.E.s1, board: z.Cboard }));
}

say('\n⑤ 글자 — 손잡이 한 자리 · 마감이 목록을 넘긴다 · 시세 · 견적이 같은 눈 · 몸 손 문은 눈이 없다');
{
  const G = fs.readFileSync(SV('granary-lots.js'), 'utf8'), VS = fs.readFileSync(SV('villages.js'), 'utf8');
  const all = ['granary-lots.js', 'villages.js', 'zone.js', 'trade.js', 'lots.js', 'spoil.js'].map((f) => fs.readFileSync(SV(f), 'utf8')).join('\n');
  ok((all.match(/process\.env\.T789_DISCARD/g) || []).length === 1 && /const T789 = ON && process\.env\.T789_DISCARD === '1';/.test(G), "⑤ 손잡이는 곳간 장부 한 자리(`=== '1'` · T732 켬 안)");
  ok(/G\.tickBegin\(state\.world && state\.world\.villages, G\.T789 \? _t803HeadK\(G\) : undefined, !T \|\| !!T\.head\)/.test(VS),
    '⑤ 마을 하루 마감 머리가 econ 마을 목록을 넘긴다(그 순간 버린다) · ★[T803] 그 econ 날의 마감 머리(존 시계)와 머리 조각인지도 넘긴다(켬만)');
  ok(/function _t803HeadK\(G\) \{[^\n]*G\.msAt\(econDayToMs\(state\.world\.day\)\)/.test(VS) && /const k0 = G\.T789 \? _t803HeadK\(G\) : null;/.test(VS) && /if \(G\.attach\(v, sv, k0\)\) n\+\+;/.test(VS)
    && /G\.tickBegin\(state\.world && state\.world\.villages, G\.T789 \? _t803HeadK\(G\) : undefined, !T \|\| !!T\.head\)/.test(VS)
    && /if \(GL\) GL\.setAt\(zoneGameMsAt\);/.test(fs.readFileSync(SV('zone.js'), 'utf8')),
    '⑤ ★[T803] 마감 머리 = 마을 시계의 econ 날 앵커(`econDayToMs` — T731 켬 = 창 머리) → 존 시계(`zoneGameMsAt`) · 부팅 씨앗도 그 머리(켬만)');
  ok(/return _t789View\(\(\) => Object\.assign\(\{ ok: true \}, _T732_ON \? Trade\.board\(/.test(VS) && /const q = _t789View\(\(\) => Trade\.quote\(/.test(VS),
    '⑤ 시세표 · 견적이 사람의 문과 같은 눈(견적 = 실행)');
  ok(/function doorOpen\(v\) \{ return !!\(ON && LED\.has\(v\) && doorBegin\(true\)\); \}/.test(G) && /if \(T789 && !hands && _viewOpen\(\)\) _door\.view = true;/.test(G), '⑤ 몸 손 문은 눈을 안 연다 · 사람의 문만');
  ok(/Spoil\.isSpoiled\(r\.it != null \? r\.it : res, Spoil\.exposureAt\(r, nf, 0\)\)/.test(G), '⑤ 상한 판정 = spoil 정본 하나(`isSpoiled` · 품목 = 레코드의 품목 · 노출 = 그 순간까지 · 새 수 0)');
}

say('\n⑥ [T803] 판정 순간 = econ 날의 머리 — 마감이 늦게 열려도 같은 날 같은 레코드를 버린다(재현) · 마감 동안 얻은 것의 열쇠도 그 머리');
{
  const h = mOn.head, ho = mOff.head;
  pre(h && h.pre && h.pre.length === 1 && h.pre[0][1] === 2, '픽스처 — 생선 2(그 날 머리에 노출 = 보관일 − 0.01 · 마감은 그 날 10시에 열렸다)', J(h && h.pre));
  ok(h && near(h.st, 2) && h.kept.length === 1 && h.kept[0][1] === 2, '★★⑥ 날을 넘긴 마감 — 판정 = 그 날 머리(950일 0시) · 그 머리엔 안 상했다 → 안 버린다(10시 벽시계가 안 들어온다)', J(h && { st: h.st, kept: h.kept }));
  ok(h && h.ks && h.ks.includes(940 * h.DAY) && h.ks.includes(950 * h.DAY) && h.ks.length === 2, '★⑥ 마감 동안 econ 이 얻은 것의 열쇠 = 그 날 머리(950일 0시 · 지금 10시가 아니다)', J(h && h.ks.map((k) => k / h.DAY)));
  ok(h && h.noDay && near(h.noDay.st, 1) && h.noDay.led.length === 1 && h.noDay.check === 0, '⑥ 날을 안 넘기면(종전 호출 꼴 · 랩 자) 판정 = 지금 — 같은 레코드가 10시엔 상해 버려진다(그 차이가 실제 시계에서 판이 갈리던 자리)', J(h && h.noDay));
  ok(ho && ho.ks && ho.ks.length === 2 && ho.ks.some((k) => k !== 940 * ho.DAY && k !== 950 * ho.DAY) && near(ho.noDay.st, 3), '★⑥ 끔 — 날은 안 읽힌다(열쇠 = 지금 순간 · 아무것도 안 버린다 · 종전 그대로)', J(ho && { ks: ho.ks.map((k) => +(k / ho.DAY).toFixed(4)), st: ho.noDay && ho.noDay.st }));
  const c = mOn.chunk, co = mOff.chunk;
  ok(c && near(c.mid.st, 3) && c.mid.n === 1 && J(c.ks) === J([950 * h.DAY, 960 * h.DAY]), '★★⑥ T731 창 가운데 조각 — 상한 3 을 안 버린다(버림은 머리 조각에서 한 번) · 그 조각 동안 얻은 것의 열쇠 = 그 머리(960일 0시)', J(c && { mid: c.mid, ks: c.ks.map((k) => k / h.DAY) }));
  ok(c && near(c.head.st, 1) && c.head.led.length === 1 && c.head.check === 0, '★⑥ 다음 창 머리 조각 — 상한 3 을 버린다(남은 1 = 그 조각에 얻은 것) · 불변식', J(c && c.head));
  ok(co && near(co.head.st, 4), '⑥ 끔 — 머리 조각이어도 안 버린다(4 그대로)', J(co && co.head && co.head.st));
  ok(mOn.msAt && mOn.msAt.off3 === 947 * h.DAY + 7 && mOn.msAt.none === null, '★⑥ 벽시계 순간 → 존 게임 ms(`GL.msAt` — 존이 꽂은 `zoneGameMsAt` 산수 · 얼었던 날수 3 → 947일 머리) · 안 꽂았으면 null(종전 갈래)', J(mOn.msAt));
}

say('\n⑦ [T803] 부패는 한 길 — econ 일일 부패(`tickDecay`)는 곳간 장부가 쥔 칸에서 안 돈다(장부 버림이 그 몫)');
{
  const d = mOn.decay, o = mOff.decay;
  pre(d && near(d.s0.fish, 100) && near(d.s0.wood, 100), '픽스처 — 랩 econ 마을(시드 7 · 30일) 곳간 생선 100(로트 · 장부가 쥔다) · 나무 100(로트 아님)', J(d && d.s0));
  ok(d && d.owned.fish === true && d.owned.wood === false && d.owned.none === false, '★⑦ 장부가 쥔 칸 = 감싼 로트 칸만(생선 예 · 나무 아니오 · 없는 칸 아니오)', J(d && d.owned));
  ok(d && d.pre.fish === false && d.unwired && d.unwired.owned === false && d.unwired.fish < 100, '★⑦ 길은 늘 하나 — 장부 버림이 안 닿은 마을(마감 목록을 못 받았다 · 붙기만 한 처음)은 econ 이 종전대로 썩힌다(길 0 인 칸 0)', J(d && { pre: d.pre, unwired: d.unwired }));
  ok(d && near(d.s1.fish, 100) && d.s1.wood < 100 && d.check === 0, '★★⑦ 켬 — econ `tickDecay` 가 생선 칸을 안 썩힌다(100 그대로 · 상한 것은 장부가 마감에 버린다) · 나무는 종전대로 썩는다', J(d && d.s1));
  ok(d && d.s2 && d.s2.fish < 100, '⑦ 훅이 없으면(랩 · CLI) 장부가 붙어 있어도 econ 이 썩힌다(종전 그대로 — 사본 0 · 묻는 문 하나)', J(d && d.s2));
  ok(o && o.owned.fish === false && o.owned.wood === false && o.s1.fish < 100 && o.s1.wood < 100, '★⑦ 끔 — 장부는 아무 칸도 안 쥔다 · econ 이 생선 · 나무를 종전대로 썩힌다', J(o && { owned: o.owned, s1: o.s1 }));
  const E2 = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8'), G2 = fs.readFileSync(SV('granary-lots.js'), 'utf8');
  ok(/if \(s <= 0\) continue;\n(?:\s*\/\/[^\n]*\n)*\s*if \(_LOTH && _LOTH\.decayOwned && _LOTH\.decayOwned\(v, r\)\) continue;/.test(E2) && /decayOwned \};/.test(G2),
    '⑦ 글자 — econ 부패 줄이 훅 하나를 묻는다(`_LOTH.decayOwned` · 곳간 훅 묶음에 실렸다 · 값 식 무변)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
