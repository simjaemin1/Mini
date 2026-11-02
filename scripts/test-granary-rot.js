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
    const c = mkP(); c.inventory.food = 40;
    const _uo = H._unitsOfFor(c);
    //   시세표 · 견적 — 마을의 그 두 문(`villageTradeBoard` · `villageTradeQuote`)이 여는 그 눈(`_t789View` = `GL.viewBegin`)으로 정본 두 함수를 부른다
    //   (랩 프로브는 econ 모듈 칸을 안 세워 마을 문은 시세에서 던진다 — T732 §7 ⑥ · 마을 배선은 ⑤ 글자가 본다)
    //   ★[T817] 낼 곡식 = 견적이 **낱개 하나 이상을 받고 상한에 안 걸리는** 가장 작은 수(2 부터 · 든 40 까지) — 상황이다.
    //     종전 "곡식 2" 는 그 세계의 값에 맞춰져 있었다(켬 기본 세계 · 고기 한 낱개 = 곡식 34 어치 — 2 로는 0개 · 견적 · 실행 둘 다 0).
    //     단언(받은 것은 성한 것 · 견적 = 실행)은 그대로다.
    let nGive = 2, uGive = Number(_uo('food', 2)) || 2, qv = null;
    GL.viewBegin();
    for (let n = 2; n <= 40; n++) {
      const u = Number(_uo('food', n)) || n;
      const q = Trade.quote(Lg, econV2, VIL, VID, 'food', RES, u, { want: 0, perItem: u / n, takeKcal: H.Kcal });
      nGive = n; uGive = u; qv = q;
      if (q && q.ok && q.take >= 1 && !q.capped) break;
    }
    const brd = Trade.board(Lg, econV2, VIL, VID, c.inventory, null, H.Kcal);
    GL.viewEnd();
    const row = brd && brd.rows && brd.rows.find((x) => x.res === RES);
    out.Cboard = row ? { stock: row.stock, sell: row.sell } : null;
    out.Cquote = qv && { ok: qv.ok, err: qv.err, take: qv.take, stock: qv.stock, capped: qv.capped, give: nGive };
    const ctx = H._t732DoorBegin(c, null);
    const r = Trade.exchange({ ledger: Lg, econV2, vil: VIL, vid: VID, inventory: c.inventory, giveRes: 'food', takeRes: RES, giveQty: nGive, want: 0, unitsOf: _uo, deposit: V.playerVillageDeposit, takeKcal: H.Kcal });
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
  ok(z.B && z.B.inv === 0 && near(z.B.du, 0) && /그만큼 없습니다/.test(z.B.note), '★★③ 남은 성한 몫(≈1)을 넘게(3) 청하면 거절 — 상한 것을 안 내준다(정본 문의 그 거절 · 곳간 그대로)', J({ du: z.B && z.B.du, note: z.B && z.B.note }));
  ok(z.Cboard && near(z.Cboard.stock, 10, 1e-2) && z.Cquote && near(z.Cquote.stock, 10, 1e-2), '★③ 시세표 · 견적(사람의 눈) — 그 칸 재고가 성한 10 으로 보인다(상한 3 빼고)', J({ board: z.Cboard, quote: z.Cquote }));
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
  ok(/G\.tickBegin\(state\.world && state\.world\.villages[,)]/.test(VS), '⑤ 마을 하루 마감 머리가 econ 마을 목록을 넘긴다(그 순간 버린다 · ★[T803] 뒤에 여는 econ 날이 붙는다)');
  ok(/return _t789View\(\(\) => Object\.assign\(\{ ok: true \}, _T732_ON \? Trade\.board\(/.test(VS) && /const q = _t789View\(\(\) => Trade\.quote\(/.test(VS),
    '⑤ 시세표 · 견적이 사람의 문과 같은 눈(견적 = 실행)');
  ok(/function doorOpen\(v\) \{ return !!\(ON && LED\.has\(v\) && doorBegin\(true\)\); \}/.test(G) && /if \(T789 && !hands && _viewOpen\(\)\) _door\.view = true;/.test(G), '⑤ 몸 손 문은 눈을 안 연다 · 사람의 문만');
  ok(/Spoil\.isSpoiled\(r\.it != null \? r\.it : res, Spoil\.exposureAt\(r, nf, e \|\| 0\)\)/.test(G), '⑤ 상한 판정 = spoil 정본 하나(`isSpoiled` · 품목 = 레코드의 품목 · 노출 = 그 순간까지 · 새 수 0 · ★[T856] 고도 = 그 곳간 · 끔 0)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
