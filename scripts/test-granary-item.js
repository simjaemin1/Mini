#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-granary-item.js — T768: 곳간에서 꺼내면 **넣은 물건 그대로** (T732 순간 로트 손잡이 안 · 새 손잡이 0) ===
//
// ★재민 10-15 판정(T732 §8 ① ⓑ): 꺼낼 때 품목은 넣은 물건 그대로. 곳간 재화 하나 = econ 칸 하나라 곰고기를 넣으면 문이 정한 대표 품목
//   (사슴·들짐승고기)이 나왔다(나이는 곰고기 것) — 이름이 바뀌면 소멸 + 생성이고 무게 · 열량 · 맛도 품목마다 다르다.
//   고친 것: 곳간 로트 레코드에 넣은 품목(`it`)을 싣는다(문 `recsFromPlayer` · 손 `handRecs`) · 옮김(`_copy`)이 그대로 따라간다 ·
//   꺼낼 때(`recsToItems`) 그 품목으로(낱개 = 그 품목의 열량 · 나이는 레코드째) · 품목 셈(마을마다 든 · 난 단위)과 불변식(`checkItems`).
//
//  ① 레코드에 품목 — 문(사람이 넣은 것) · 손(어부 · 채집 · 농부가 넣은 것)이 넣은 그 품목을 싣는다 · econ 이 만든 것은 칸 없음(대표 품목)
//  ② 꺼내기(문 감싸개 그 길) — 오래된 것부터 그 차례로 레코드의 품목 그대로 · 낱개는 그 품목의 열량(같은 열량) · 품목이 다 같으면 종전 함수 그대로(바이트)
//  ③ 캐러밴 싣기 — 짐 레코드가 품목째 길을 가고 받는 곳간에서도 그 품목 · 거기서 꺼내도 그 품목
//  ④ NPC 먹기 — econ 이 곳간을 줄이면 오래된 것부터 그 품목 그대로 먹힌다(먹은 품목 셈) · 품목 실은 레코드에 econ 몫을 안 합친다
//  ⑤ 저장 · 재기동 — 품목 칸이 저장 줄에 실려 되돌아온다 · 옛 레코드(칸 없음) = 대표 품목으로 읽는다(지우지 않는다) · 되돌림(교환 실패)은 품목 셈도 그 순간으로
//  ⑥ 랩 econ v2(5마을 · 200일) — 어부 손 대구 레코드를 곳간에 넣고 매일 불변식(장부 합 = 곳간 · 품목 합 = 든 것 − 난 것) · 대구는 대구로만 먹히고 실려 간다
//  ⑦ 존(실제 문) — 거래소 받기 · 게시판 보상(문 감싸개 — 정본 두 줄) · 회관 넣기 → 꺼내기: 곰고기 → 곰고기 · 인벤 = ⌊로트 합⌋ · 근사 0 · 화면 글자
//  ⑧ 끔(`T732_MOMENT_LOT=0` — ★[T778] 켬 기본) — 손잡이를 끄면 곳간 장부 모듈을 안 싣는다(존 · 마을) · 글자(대표 품목 갈래 = 종전 줄 그대로)
//
// 실행: node scripts/test-granary-item.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 아이 존 — 회관 · 꺼내기 · 거래소 · 문 감싸개(test-granary-age 꼴 — 존 하나 + 랩 econ 마을 다섯) ══════════════════════════════
if (process.env.T768_SUB === 'zone') {
  const TMP = `/tmp/t768-granary-item-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42700 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  //   ★[T779] 옛 한도 손잡이(`MEMBER_WD_*`)는 걷었다 — 꺼내기는 촌장 · 한도 없음(꺼내는 사람을 촌장 표지로 앉힌다 — 아래 `asChief`).
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const out = { on: null, errs: [] };
  try {
    const Zone = require(SV('zone.js'));
    const H = Zone.__testBind();
    const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
    const Events = require(SV('events.js'));
    const Trade = require(SV('trade.js'));
    const V = H.SimVillages, GL = H.GL;
    out.on = H.T732_MOMENT; out.gl = !!GL;
    if (GL) {
      const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
      for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
      const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
      L.prime(world);
      const P = V.__labProbe._memberProbe;
      const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
      P.setup(L, vils);
      const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL), RES = 'meat_game';
      VIL.econ.founder = VIL.econ.founder || 'anon_t768_founder';
      const HALL = 'b_t768_hall';
      H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT.x, y: AT.y, data: { x0: VIL.ccx, y0: VIL.ccy, villageDbId: VID, owner: null } });
      H.__e2eFreezeZoneDay(true);
      for (const v of vils) GL.attach(v.econ, null, null);
      out.kcal = { bear: H.Kcal.kcalOf('meat_bear'), game: H.Kcal.kcalOf('meat_game'), food: H.Kcal.kcalOf('food') };
      out.day = H.Kcal.DAY_KCAL;
      const notes = [];
      let nP = 0;
      const mkP = () => {
        const p = { pid: `p_t768_${++nP}`, playerId: `anon_t768_${nP}`, name: '곳간지기', persistent: false,
          x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
          inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
          isNpc: false, isDown: false, vx: 0, vy: 0,
          ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
        H.Membership.seatFounder(p, VID);
        return p;
      };
      const today = H.zoneGameDay();
      const give = (p, item, n, f, back) => {   // 신선도를 정확히 세운 로트(노출 = 보관일 × (1 − f) · back 일 전)
        const Lf = H.Spoil.shelfOf(item);
        p.inventory[item] = (p.inventory[item] || 0) + n;
        H.Lots.moveIn(p, item, [{ d: today - (back || 1), n, e: Lf * (1 - f), t: today }], today, 0, 'carry');
      };
      const R6 = (x) => +(+x).toFixed(6);
      const lotsOf = (p, item) => { H.Lots.reconcile(p, item, p.inventory, today); return H.Lots.of(p, item).map((l) => ({ k: l.k, n: R6(l.n), f: +H.Spoil.freshnessOf(item, H.Spoil.exposureOf(l, today)).toFixed(4) })); };
      const led = (res) => JSON.parse(JSON.stringify(GL.ledger(VIL.econ, res || RES)));
      const hall = (p, want) => { H.buildings.get(HALL).data.owner = p.playerId; const s0 = +VIL.econ.storage[RES] || 0; try { H.tryVillageDeposit(p, HALL, want); } catch (e) { out.errs.push('hall:' + String(e && e.message || e)); } return R6((+VIL.econ.storage[RES] || 0) - s0); };
      const a0 = H.Lots.stats().approx;
      //   ★[T769 · T779] 꺼내기는 촌장만 — 진짜 곳간 문에 꺼내는 사람을 촌장(창설자 표지)으로 앉힌다(회관 `owner` 와 같은 꼴 · test-granary-age 그 줄)
      const asChief = (p) => { VIL.econ.founder = p.playerId; };

      // ── A. 회관 넣기 곰고기 8(f 0.6 · 사흘 전) → 꺼내기(대표 품목 문) — econ 몫(새것)은 뒤에 ─────────────
      VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 40;
      const a = mkP(); give(a, 'meat_bear', 8, 0.6, 3);
      out.Adep = hall(a, { meat_bear: 8 });
      out.Aled = led();
      const g0 = +a.inventory.meat_game || 0, b0 = +a.inventory.meat_bear || 0, s0 = +VIL.econ.storage[RES];
      asChief(a); H.tryVillageWithdraw(a, VID, RES, 2);
      out.A = { wdU: R6(s0 - VIL.econ.storage[RES]), bear: lotsOf(a, 'meat_bear'), game: lotsOf(a, 'meat_game'), invBear: +a.inventory.meat_bear || 0, invGame: +a.inventory.meat_game || 0, g0, b0,
        note: notes[notes.length - 1] || '', ledAfter: led() };

      // ── B. 거래소 받기 — 곡식을 내고 meat_game 칸에서 받는다(그 칸의 앞 = 넣은 곰고기) ─────────────
      VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 30;
      const b1 = mkP(); give(b1, 'meat_bear', 6, 0.8, 2); out.Bdep = hall(b1, { meat_bear: 6 });
      const b = mkP(); give(b, 'food', 40, 1, 1);
      const _uo = H._unitsOfFor(b);
      const ctx = H._t732DoorBegin(b, null);
      const r = Trade.exchange({ ledger: L, econV2, vil: VIL, vid: VID, inventory: b.inventory, giveRes: 'food', takeRes: RES, giveQty: 6, want: 0, unitsOf: _uo, deposit: V.playerVillageDeposit, takeKcal: H.Kcal });
      const gb = H._t732DoorEnd(ctx, b, !!(r && r.ok), VIL, _uo);
      out.B = { r: r && { ok: r.ok, err: r.err, take: r.take, takeUnits: r.takeUnits, took: r.tookItem }, bear: lotsOf(b, 'meat_bear'), game: lotsOf(b, 'meat_game'),
        invBear: +b.inventory.meat_bear || 0, invGame: +b.inventory.meat_game || 0, got: gb && gb.got };

      // ── C. 게시판 보상 — 문 감싸개 그대로(정본 두 줄: 곳간 칸 −u · 인벤 대표 품목 +q) — 보상이 곳간에서 나오는 그 길 ─────────────
      VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 20;
      const c1 = mkP(); give(c1, 'meat_bear', 4, 0.5, 2); out.Cdep = hall(c1, { meat_bear: 4 });
      const c = mkP();
      const ctxC = H._t732DoorBegin(c, null);
      const qC = 2, uC = R6(qC * out.kcal.game / out.day);
      VIL.econ.storage[RES] -= uC; c.inventory[RES] = (c.inventory[RES] || 0) + qC;   // 보상 정본이 하는 그 두 줄(`villageDeliver` 의 보상 몫)
      const gc = H._t732DoorEnd(ctxC, c, true, VIL, null);
      out.C = { uC, bear: lotsOf(c, 'meat_bear'), game: lotsOf(c, 'meat_game'), invBear: +c.inventory.meat_bear || 0, invGame: +c.inventory.meat_game || 0, got: gc && gc.got,
        line: H._t732GotLine ? H._t732GotLine(c, gc) : null };

      // ── D. 섞인 칸 — 곰고기 · 사슴(넣은 meat_game) · econ 몫이 한 칸 · 크게 꺼내면 차례대로 제 품목 ─────────────
      VIL.econ.storage[RES] = 0; VIL.econ.storage[RES] = 10;
      const d1 = mkP(); give(d1, 'meat_bear', 3, 0.9, 4); out.Ddep1 = hall(d1, { meat_bear: 3 });
      const d2 = mkP(); give(d2, 'meat_game', 3, 0.7, 3); out.Ddep2 = hall(d2, { meat_game: 3 });
      out.Dled = led();
      out.E = { dump: GL.dump(VIL.econ) };   // 저장 줄 — 품목 실은 레코드가 있을 때(꺼내기 전)
      const d = mkP(); const sD = +VIL.econ.storage[RES];
      asChief(d); H.tryVillageWithdraw(d, VID, RES, 6);
      out.D = { wdU: R6(sD - VIL.econ.storage[RES]), bear: lotsOf(d, 'meat_bear'), game: lotsOf(d, 'meat_game'), invBear: +d.inventory.meat_bear || 0, invGame: +d.inventory.meat_game || 0, note: notes[notes.length - 1] || '' };

      out.check = GL.check(vils.map((v) => v.econ));
      out.checkItems = GL.checkItems(vils.map((v) => v.econ));
      out.st = GL.stats();
      out.approx = H.Lots.stats().approx - a0;
    }
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
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
const R6 = (x) => +(+x).toFixed(6);
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T732_MOMENT_LOT; delete e.T768_SUB; return e; })();
const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T768_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());

say('\n=== 곳간에서 꺼내면 넣은 물건 그대로 (T768 · T732 손잡이 안) ===');

process.env.T732_MOMENT_LOT = '1';
const Lots = require(SV('lots.js'));
const Spoil = require(SV('spoil.js'));
const K = require(SV('kcal.js'));
const GL = require(SV('granary-lots.js'));
const DAY = 1440000, MIN = DAY / 1440;
let NOW = 900 * DAY + 180 * MIN;
Lots.setClock(() => NOW, DAY);
const today = () => Math.floor(NOW / DAY);
const fOf = (item, l) => Spoil.freshnessOf(item, Spoil.exposureOf(l, today()));
const sumU = (a) => (a || []).reduce((s, r) => s + (+r.u || 0), 0);
const sumN = (a) => (a || []).reduce((s, r) => s + (+r.n || 0), 0);
pre(GL.ON && Lots.momentOn(), '장부 모듈이 켬으로 섰다(T732 · 시계 꽂힘)');

// 사람의 문 그 길 — 넣기(문 동안 늘어난 몫을 사람 레코드로) · 꺼내기(문 동안 줄어든 몫의 레코드를 모은다)
const doorPut = (v, res, recs) => { GL.doorBegin(); v.storage[res] += sumU(recs); const d = GL.doorEnd(true); GL.doorIn(d, v, res, recs); GL.doorRest(d); };
const doorTake = (v, res, u) => { GL.doorBegin(); v.storage[res] -= u; const d = GL.doorEnd(true); const M = d && d.cap.get(v); const recs = (M && M[res]) || []; GL.doorRest(d); return recs; };
// 사람 쪽 레코드(신선도를 정확히 세운 것) → 문이 쓰는 단위(열량 × 신선도) → 곳간 레코드(`recsFromPlayer` — 존 `_t732DoorEnd` ① 그 함수)
const playerRecs = (item, n, f, backDays) => [{ k: NOW - backDays * DAY, d: Math.floor((NOW - backDays * DAY) / DAY), n, e: Spoil.shelfOf(item) * (1 - f), t: NOW / DAY, m: 1, w: 0 }];   // 얻은 순간은 과거 · 노출은 지금까지 정산된 값(t = 지금)

say('\n① 레코드에 품목 — 문 · 손이 넣은 그 품목 · econ 몫은 칸 없음');
{
  const pr = playerRecs('meat_bear', 5, 0.5, 2);
  const U = K.econUnitsOf('meat_bear', 5) * 0.5;
  const recs = GL.recsFromPlayer(pr, 'meat_bear', U, true, today());
  ok(recs.length === 1 && recs[0].it === 'meat_bear' && near(recs[0].u, U) && near(recs[0].f0, 0.5, 1e-6), '★★① 문(`recsFromPlayer`) — 넣은 그 품목을 싣는다(단위 · 접힌 신선도 그대로)', JSON.stringify(recs.map((r) => ({ it: r.it, u: R6(r.u), f0: R6(r.f0) }))));
  const npc = { isNpc: true, inventory: { cod: 3 } };
  Lots.note(npc, 'cod', 3, today(), 'carry', NOW - 30 * MIN);
  const per = K.econUnitsOf('cod', 1);
  const hr = GL.handRecs(npc, 'cod', 3, per);
  ok(hr.length === 1 && hr[0].it === 'cod' && near(hr[0].u, 3 * per) && hr[0].k === NOW - 30 * MIN, '★① 손(`handRecs` — 어부 · 채집 · 농부가 곳간에 넣는 그 길) — 넣은 그 품목 · 얻은 순간째', JSON.stringify(hr.map((r) => ({ it: r.it, u: R6(r.u), k: r.k }))));
  const v = { name: '갑', storage: { meat_game: 0 } };
  GL.attach(v, null, null);
  v.storage.meat_game += 4;
  ok(GL.ledger(v, 'meat_game').length === 1 && GL.ledger(v, 'meat_game')[0].it === undefined, '① econ 이 만든 몫 — 품목 칸 없음(= 문이 정한 대표 품목)', JSON.stringify(GL.ledger(v, 'meat_game')));
  doorPut(v, 'meat_game', recs);
  const Lg = GL.ledger(v, 'meat_game');
  ok(Lg.length === 2 && Lg[0].it === 'meat_bear' && Lg[1].it === undefined && near(Lg[0].u, U), '① 문으로 든 곰고기 레코드(앞 — 이틀 전 순간) · econ 몫(뒤)', JSON.stringify(Lg.map((r) => [r.it || '*', R6(r.u)])));
  // 같은 순간 econ 몫이 품목 레코드에 안 합쳐진다
  const w = { name: '을', storage: { fish: 0 } };
  GL.attach(w, null, null);
  const kNow = NOW;
  GL.tickBegin();
  doorPut(w, 'fish', [{ k: kNow, u: 1, f0: 1, e: 0, t: kNow / DAY, m: 1, w: 0, it: 'cod' }]);
  w.storage.fish += 2;   // 마감 동안 econ 이 얻은 것(같은 순간)
  GL.tickEnd();
  const Lw = GL.ledger(w, 'fish');
  ok(Lw.length === 2 && Lw[0].it === 'cod' && near(Lw[0].u, 1) && Lw[1].it === undefined && near(Lw[1].u, 2), '★④ 같은 순간 · 같은 자리여도 econ 몫은 품목 레코드에 안 합친다(대표 품목 몫이 대구가 되지 않는다)', JSON.stringify(Lw.map((r) => [r.it || '*', R6(r.u)])));
}

say('\n② 꺼내기 — 오래된 것부터 그 차례로 레코드의 품목 그대로 · 낱개 = 그 품목의 열량');
{
  const v = { name: '병', storage: { meat_game: 0 } };
  GL.attach(v, null, null);
  const kB = K.kcalOf('meat_bear'), kG = K.kcalOf('meat_game'), D = K.DAY_KCAL;
  const uB = K.econUnitsOf('meat_bear', 6) * 0.5;   // 곰고기 6(f 0.5)
  doorPut(v, 'meat_game', GL.recsFromPlayer(playerRecs('meat_bear', 6, 0.5, 3), 'meat_bear', uB, true, today()));
  const uG = K.econUnitsOf('meat_game', 4) * 1;     // 사슴 4(f 1 — 넣은 대표 품목)
  doorPut(v, 'meat_game', GL.recsFromPlayer(playerRecs('meat_game', 4, 1, 2), 'meat_game', uG, true, today()));
  v.storage.meat_game += 2;                         // econ 몫(지금)
  // 문이 대표 품목 9개를 꺼낸다(정본 문 = 열량 짝: 단위 = 9 × 사슴 열량 ÷ 하루치)
  const q = 9, u = q * kG / D;
  const recs = doorTake(v, 'meat_game', u);
  const by = GL.recsToItems(recs, q, 'meat_game', K.kcalOf);
  const nB = sumN(by.meat_bear), nG = sumN(by.meat_game);
  ok(Object.keys(by).sort().join(',') === 'meat_bear,meat_game' && near(nB, 6, 1e-4), '★★② 앞의 곰고기 레코드 → **곰고기**(넣은 6 그대로 — 접힌 신선도를 편다) · 나머지 → 대표 품목', `곰고기 ${R6(nB)} · 사슴 ${R6(nG)}`);
  ok(near(nB * kB * 0.5 + nG * kG, u * D, 1e-3), '★★② 열량 짝 — Σ 낱개 × 그 품목 열량 × 접힌 신선도 = 꺼낸 단위 × 하루치(곳간이 환전소가 아니다)', `${R6(nB)}×${kB}×0.5 + ${R6(nG)}×${kG} = ${R6(nB * kB * 0.5 + nG * kG)} ≈ ${R6(u * D)}`);
  ok(by.meat_bear.every((r) => near(fOf('meat_bear', r), 0.5, 1e-3)) && by.meat_game.every((r) => near(fOf('meat_game', r), 1, 1e-6)), '② 나이는 레코드째(곰고기 f 0.5 · 사슴 f 1)', JSON.stringify(Object.fromEntries(Object.entries(by).map(([k, a]) => [k, a.map((r) => +fOf(k, r).toFixed(4))]))));
  // 품목이 다 대표 품목이면 종전 함수와 같은 바이트
  const v2 = { name: '정', storage: { meat_game: 0 } };
  GL.attach(v2, null, null);
  v2.storage.meat_game += 3; NOW += MIN; v2.storage.meat_game += 2;
  const r2 = doorTake(v2, 'meat_game', 4 * kG / D);
  ok(JSON.stringify(GL.recsToItems(r2.map((r) => Object.assign({}, r)), 4, 'meat_game', K.kcalOf)) === JSON.stringify({ meat_game: GL.recsToPlayer(r2.map((r) => Object.assign({}, r)), 4) }),
    '★② 품목이 다 대표 품목(칸 없음)이면 종전 `recsToPlayer` 와 바이트 같다(꺼내기 · 거래소 · 게시판 · 마을 밥 — 대표 품목만 든 곳간은 종전 그대로)');
  // 칸이 대표 품목인 레코드(사슴을 넣은 것)도 종전과 같은 값
  const v3 = { name: '무', storage: { meat_game: 0 } };
  GL.attach(v3, null, null);
  doorPut(v3, 'meat_game', GL.recsFromPlayer(playerRecs('meat_game', 4, 0.8, 1), 'meat_game', K.econUnitsOf('meat_game', 4) * 0.8, true, today()));
  const r3 = doorTake(v3, 'meat_game', 2 * kG / D);
  const by3 = GL.recsToItems(r3.map((r) => Object.assign({}, r)), 2, 'meat_game', K.kcalOf);
  ok(Object.keys(by3).join(',') === 'meat_game' && JSON.stringify(by3.meat_game) === JSON.stringify(GL.recsToPlayer(r3, 2)), '② 넣은 품목 = 대표 품목이면 그 몫도 종전 값 그대로');
}

say('\n③ 캐러밴 싣기 — 짐 레코드가 품목째 길을 가고 받는 곳간에서도 그 품목');
{
  const v = { name: '기', storage: { fish: 0 } }, w = { name: '경', storage: { food: 1 } };
  GL.attach(v, null, null); GL.attach(w, null, null);
  const per = K.econUnitsOf('cod', 1);
  doorPut(v, 'fish', [{ k: NOW - DAY, u: 5 * per, f0: 1, e: 0, t: (NOW - DAY) / DAY, m: 1, w: 0, it: 'cod' }]);
  v.storage.fish += 1;   // econ 몫
  const s0 = GL.stats().itemCargoU;
  GL.capBegin(v, 'fish'); v.storage.fish -= 4 * per; const recs = GL.capEnd(v, 'fish');
  const car = {};
  GL.cargo(car, 'give', recs);
  const dumpC = GL.cargoDump(car);
  ok(recs.length === 1 && recs[0].it === 'cod' && dumpC.give[0].it === 'cod' && near(GL.stats().itemCargoU - s0, 4 * per), '★★③ 싣기 — 곳간에서 뗀 레코드(오래된 것부터)가 품목째 짐에 · 짐 기록(존 경계 · 저장)에도 품목 칸', JSON.stringify(dumpC.give.map((r) => [r.it, R6(r.u)])));
  NOW += 2 * DAY;
  GL.unload(car, 'give', w, 'fish', 4 * per);
  w.storage.fish = (w.storage.fish || 0) + 4 * per;   // 받는 곳간의 새 칸(접근자 없음)
  GL.clearIn(w, 'fish');
  const Lw = GL.ledger(w, 'fish');
  ok(Lw.length === 1 && Lw[0].it === 'cod' && near(Lw[0].u, 4 * per), '★★③ 내리기 — 받는 곳간의 레코드도 대구(새 칸의 첫 몫 = 옮겨 온 레코드)', JSON.stringify(Lw.map((r) => [r.it, R6(r.u)])));
  const back = doorTake(w, 'fish', 2 * K.kcalOf('fish') / K.DAY_KCAL);
  const by = GL.recsToItems(back, 2, 'fish', K.kcalOf);
  ok(Object.keys(by).join(',') === 'cod' && near(sumN(by.cod), 2 * K.kcalOf('fish') / K.kcalOf('cod'), 1e-4), '③ 받은 곳간에서 꺼내도 대구(대표 품목 생선 2개 몫 = 같은 열량의 대구)', `대구 ${R6(sumN(by.cod))}`);
  ok(GL.checkItems([v, w]).bad.length === 0, '③ 두 곳간 품목 불변식(든 것 − 난 것 = 장부)', JSON.stringify(GL.checkItems([v, w])));
}

say('\n④ NPC 먹기 — 오래된 것부터 그 품목 그대로');
{
  const v = { name: '신', storage: { fish: 0 } };
  GL.attach(v, null, null);
  GL.eaten(true);
  const per = K.econUnitsOf('cod', 1);
  doorPut(v, 'fish', [{ k: NOW - 2 * DAY, u: 3 * per, f0: 1, e: 0, t: (NOW - 2 * DAY) / DAY, m: 1, w: 0, it: 'cod' }]);
  v.storage.fish += 2;   // econ 몫(지금)
  const fl0 = GL.itemFlow(v);
  v.storage.fish -= 2 * per;   // 마을이 먹었다(econ 의 줄이기 — 문 · 싣기 밖)
  const ate = GL.eaten(), fl1 = GL.itemFlow(v), Lg = GL.ledger(v, 'fish');
  ok(near(ate.cod || 0, 2 * per) && near((fl1.out.cod || 0) - ((fl0 && fl0.out.cod) || 0), 2 * per), '★★④ 마을이 먹은 것은 앞의 대구 레코드(대구 그대로 — 먹은 품목 셈 · 난 단위)', JSON.stringify({ ate, out: fl1.out }));
  ok(Lg.length === 2 && Lg[0].it === 'cod' && near(Lg[0].u, per) && Lg[1].it === undefined && near(Lg[1].u, 2), '④ 남은 장부 — 대구 1개 몫 · econ 몫 그대로', JSON.stringify(Lg.map((r) => [r.it || '*', R6(r.u)])));
  ok(GL.checkItems([v]).bad.length === 0 && GL.check([v]).bad.length === 0, '④ 장부 합 = 곳간 · 품목 합 = 든 것 − 난 것');
}

say('\n⑤ 저장 · 재기동 · 옛 레코드 · 되돌림');
{
  const v = { name: '임', storage: { meat_game: 0 } };
  GL.attach(v, null, null);
  v.storage.meat_game += 2;   // econ 몫
  doorPut(v, 'meat_game', GL.recsFromPlayer(playerRecs('meat_bear', 4, 0.7, 1), 'meat_bear', K.econUnitsOf('meat_bear', 4) * 0.7, true, today()));
  const D1 = GL.dump(v);
  ok(D1.L.meat_game.some((r) => r.it === 'meat_bear') && D1.L.meat_game.some((r) => r.it === undefined), '★★⑤ 저장 줄(`dump` — econ 줄 `_t732Lots`)에 품목 칸(있는 레코드만 · econ 몫은 칸 없음 = 옛 꼴)', JSON.stringify(D1.L.meat_game.map((r) => [r.it || '*', R6(r.u)])));
  const saved = JSON.parse(JSON.stringify(D1));
  const v2 = { name: '임(재기동)', storage: { meat_game: +v.storage.meat_game } };
  GL.attach(v2, saved, null);
  ok(JSON.stringify(GL.dump(v2)) === JSON.stringify(D1) && GL.checkItems([v2]).bad.length === 0, '★★⑤ 재기동 — 품목 칸이 되돌아온다(저장 → 붙이기 = 같은 줄) · 품목 셈은 붙은 그 순간부터(든 것 = 복원한 것)');
  // 옛 레코드(T768 전 저장 — 칸 없음) = 대표 품목으로 읽는다 · 지우지 않는다
  const old = { L: { meat_game: [{ k: NOW - 3 * DAY, u: 1.5, f0: 0.6, e: 0.4, t: (NOW - 3 * DAY) / DAY, m: 0.7, w: 0.55 }] }, D: {} };
  const v3 = { name: '계', storage: { meat_game: 1.5 } };
  GL.attach(v3, old, null);
  const r3 = doorTake(v3, 'meat_game', 1.5);
  const by3 = GL.recsToItems(r3, 1.5 * K.DAY_KCAL / K.kcalOf('meat_game'), 'meat_game', K.kcalOf);
  ok(Object.keys(by3).join(',') === 'meat_game' && GL.ledger(v3, 'meat_game').length === 0, '★⑤ 옛 레코드(품목 칸 없음) = 대표 품목으로 나온다(지우지 않는다 · 종전 값)', JSON.stringify(by3));
  // 되돌림 — 교환 실패면 장부도 품목 셈도 그 순간으로
  const before = JSON.stringify(GL.ledger(v)), fl = JSON.stringify(GL.itemFlow(v));
  GL.txBegin(v); v.storage.meat_game -= 1; v.storage.meat_game += 0.2; GL.txEnd(v, false);
  ok(JSON.stringify(GL.ledger(v)) === before && JSON.stringify(GL.itemFlow(v)) === fl && GL.checkItems([v]).bad.length === 0, '★⑤ 되돌림(교환 실패) — 장부 · 품목 셈 둘 다 그 순간으로(든 · 난 단위 무변)');
}

say('\n⑥ 랩 econ v2(5마을 · 200일) — 대구는 대구로만 먹히고 실려 간다 · 매일 불변식');
{
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  GL.stats(true); GL.eaten(true);
  NOW = 2000 * DAY;
  for (const v of world.villages) GL.attach(v, null, null);
  econV2.setLotHook(GL.hooks);
  const per = K.econUnitsOf('cod', 1);
  let injected = 0, bad = 0, badI = 0, first = null, firstI = null, foreign = 0;
  const npc = { isNpc: true, inventory: {} };
  try {
    for (let d = 0; d < 200; d++) {
      NOW += DAY;
      if (d % 10 === 0) for (const v of world.villages.slice(0, 2)) {   // 어부가 대구를 넣는다(손 → 곳간 · 문 · T748 그 길)
        npc.inventory.cod = (npc.inventory.cod || 0) + 4; Lots.note(npc, 'cod', 4, today(), 'carry', NOW - 60 * MIN);
        const recs = GL.handRecs(npc, 'cod', 4, per); npc.inventory.cod -= 4;
        if (GL.doorOpen(v)) { v.storage.fish = (+v.storage.fish || 0) + sumU(recs); GL.doorShut(v, 'fish', recs); injected += sumU(recs); }
      }
      GL.tickBegin();
      econV2.tickWorldV2(world);
      GL.sync(world.villages);
      GL.tickEnd();
      const c = GL.check(world.villages, 1e-6), ci = GL.checkItems(world.villages, 1e-6);
      if (c.bad.length) { bad++; if (!first) first = { d, b: c.bad.slice(0, 2) }; }
      if (ci.bad.length) { badI++; if (!firstI) firstI = { d, b: ci.bad.slice(0, 2) }; }
      for (const v of world.villages) for (const recs of Object.values(GL.ledger(v) || {})) for (const r of recs) if (r.it != null && r.it !== 'cod') foreign++;
    }
  } finally { econV2.setLotHook(null); }
  const st = GL.stats(), ate = GL.eaten();
  let inLed = 0, inCar = 0;
  for (const v of world.villages) inLed += (GL.itemSums(v) || {}).cod || 0;
  for (const c of (world.caravans || [])) { const Kc = GL.cargoDump(c); if (Kc) for (const recs of Object.values(Kc)) for (const r of recs) if (r.it === 'cod') inCar += +r.u || 0; }
  ok(bad === 0, '★★⑥ 200일 매일 — 감싼 칸마다 장부 합 − 빚 = 곳간 값', first ? JSON.stringify(first) : `칸 ${GL.check(world.villages).cells}`);
  ok(badI === 0, '★★⑥ 200일 매일 — 마을마다 품목 합 = 든 것 − 난 것', firstI ? JSON.stringify(firstI) : JSON.stringify(GL.checkItems(world.villages)).slice(0, 120));
  ok(foreign === 0, '★⑥ 품목이 바뀐 레코드 0(대구로 든 것은 대구로만 있다)', `${foreign}`);
  ok((ate.cod || 0) > 0 && st.itemEatU > 0, '★★⑥ NPC 가 먹은 것 — 대구 그대로(먹은 품목 셈)', JSON.stringify({ 대구먹음: R6(ate.cod || 0), 넣음: R6(injected) }));
  ok(inLed + inCar + (ate.cod || 0) <= injected + 1e-6, '★⑥ 생성 0 — 장부 + 길 위 짐 + 먹은 것 ≤ 넣은 것(약탈 · 빚 갚기로 빠진 몫만 모자란다)', `${R6(inLed)} + ${R6(inCar)} + ${R6(ate.cod || 0)} ≤ ${R6(injected)}`);
  pre(true, `캐러밴이 실어 간 대구 단위 ${R6(st.itemCargoU)} · 옮겨 받은 넘김 ${st.moved}`);
}

say('\n⑦ 존 — 회관 넣기 · 꺼내기 · 거래소 받기 · 게시판 보상(실제 문)');
const zOn = sub({}), zOff = sub({ T732_MOMENT_LOT: '0' });   // ★[T778] 켬 = 기본(손잡이 없음) · 끔 = 명시 `=0`
{
  pre(!zOn.err && zOn.on === true && zOn.gl === true, '켬 존이 떴다', zOn.err || '');
  const A = zOn.A, kB = zOn.kcal.bear, kG = zOn.kcal.game, D = zOn.day;
  pre(zOn.Adep > 0 && Array.isArray(zOn.Aled) && zOn.Aled[0].it === 'meat_bear', '회관 넣기 — 곳간 장부 앞에 곰고기 레코드(품목 칸)', JSON.stringify(zOn.Aled && zOn.Aled.map((r) => [r.it || '*', R6(r.u), R6(r.f0)])));
  const nA = sumN(A.bear);
  ok(A.bear.length >= 1 && A.game.length === 0 && A.bear.every((l) => near(l.f, 0.6, 1e-3)) && near(nA * kB * 0.6 / D, A.wdU, 1e-3 * Math.max(1, A.wdU)),
    '★★⑦ 꺼내기 — 곰고기 그대로(그 나이 f 0.6 · 낱개 × 곰고기 열량 × 신선도 = 꺼낸 단위) · 사슴·들짐승고기 0', `곰고기 ${R6(nA)} · ${A.wdU} 단위`);
  ok(A.invBear === Math.floor(nA + 1e-6) && A.invGame === A.g0, '★⑦ 인벤 = ⌊로트 합⌋ — 곰고기는 늘고 대표 품목은 문이 더한 몫이 빠졌다(근사 0)', `곰고기 ${A.invBear} · 사슴 ${A.invGame}`);
  ok(/넣은 물건 그대로/.test(A.note) && /곰고기|meat_bear/.test(A.note), '⑦ 화면 — "몫(넣은 물건 그대로)" · 나온 품목 줄', A.note.slice(0, 200));
  const B = zOn.B;
  pre(B.r && B.r.ok && B.r.take > 0, '거래소 교환이 됐다(곡식 → meat_game 칸)', JSON.stringify(B.r));
  ok(B.bear.length >= 1 && B.bear.every((l) => near(l.f, 0.8, 1e-3)) && near(sumN(B.bear), 6, 1e-3) && B.game.length >= 1 && B.game.every((l) => near(l.f, 1, 1e-6)),
    '★★⑦ 거래소 받기 — 곳간 앞의 곰고기 레코드 → **곰고기**(넣은 6 그대로 · 그 나이 f 0.8) · 그 뒤 econ 몫 → 대표 품목(f 1) · 오래된 것부터 그 차례', JSON.stringify({ bear: B.bear, game: B.game }));
  ok(near(sumN(B.bear) * kB * 0.8 + sumN(B.game) * kG, B.r.takeUnits * D, 1e-2 * B.r.takeUnits * D), '⑦ 거래소 받기 열량 짝 — Σ 낱개 × 그 품목 열량 × 신선도 = 받은 단위 × 하루치', `${R6(sumN(B.bear))}×${kB}×0.8 + ${R6(sumN(B.game))}×${kG} ≈ ${R6(B.r.takeUnits * D)}`);
  ok(B.invBear === Math.floor(sumN(B.bear) + 1e-6) && B.invGame === Math.floor(sumN(B.game) + 1e-6), '⑦ 거래소 받기 인벤 = ⌊로트 합⌋(품목마다)', `곰고기 ${B.invBear} · 사슴 ${B.invGame}`);
  const C = zOn.C;
  ok(C.bear.length >= 1 && C.game.length === 0 && C.bear.every((l) => near(l.f, 0.5, 1e-3)) && near(sumN(C.bear) * kB * 0.5, C.uC * D, 1e-2) && C.invGame === 0,
    '★★⑦ 게시판 보상(문 감싸개 — 보상 두 줄) — 곰고기 그대로 · 같은 열량 · 대표 품목 0', JSON.stringify({ bear: C.bear, line: (C.line || '').slice(0, 80) }));
  const Dz = zOn.D;
  ok(Dz.bear.length >= 1 && Dz.game.length >= 1 && Dz.bear.every((l) => near(l.f, 0.9, 1e-3)) && Dz.game.some((l) => near(l.f, 0.7, 1e-3)),
    '★★⑦ 섞인 칸 — 곰고기(먼저 넣은 · f 0.9) · 사슴(넣은 meat_game · f 0.7) · econ 몫(f 1) 차례대로 제 품목', JSON.stringify({ bear: Dz.bear, game: Dz.game }));
  ok(near(sumN(Dz.bear) * kB * 0.9 + Dz.game.reduce((s, l) => s + l.n * l.f, 0) * kG, Dz.wdU * D, 2e-2 * Dz.wdU * D), '⑦ 섞인 칸 열량 짝(품목마다 그 열량 × 접힌 신선도)', `${Dz.wdU} 단위`);
  ok(zOn.E.dump && zOn.E.dump.L.meat_game && zOn.E.dump.L.meat_game.some((r) => r.it === 'meat_bear'), '★⑦ econ 저장 줄에 품목 칸(재기동이 읽는 그 줄)', JSON.stringify((zOn.E.dump.L.meat_game || []).map((r) => r.it || '*')));
  ok(zOn.check.bad.length === 0 && zOn.checkItems.bad.length === 0 && zOn.checkItems.items > 0, '★★⑦ 불변식 — 장부 합 = 곳간 · 품목 합 = 든 것 − 난 것(마을 다섯)', JSON.stringify({ cells: zOn.check.cells, items: zOn.checkItems.items, bad: zOn.checkItems.bad.slice(0, 2) }));
  ok(zOn.approx === 0 && zOn.st.doorNoRec === 0 && zOn.st.itemSwapRecs > 0, '★⑦ 사람 쪽 근사 0 · 문이 레코드 없이 넣은 몫 0 · 다른 품목으로 준 레코드가 있었다', JSON.stringify({ approx: zOn.approx, doorNoRec: zOn.st.doorNoRec, swapRecs: zOn.st.itemSwapRecs, swapU: zOn.st.itemSwapU }));
}

say('\n⑧ 끔 = main · 글자');
{
  ok(zOff.on === false && zOff.gl === false && !zOff.A, '★⑧ 끔 — 곳간 장부 모듈을 안 싣는다(존 문 도우미 · 품목 칸 · 바꿔 주기가 닿을 자리가 없다)');
  const ZS = fs.readFileSync(SV('zone.js'), 'utf8'), GS = fs.readFileSync(SV('granary-lots.js'), 'utf8');
  const fn = (src, name) => { const i = src.indexOf(`function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i)); };
  const de = fn(ZS, '_t732DoorEnd');
  ok(/const by = GL\.recsToItems\(recs, add, it, Kcal\.kcalOf\);/.test(de) && /if \(its\.length === 1 && its\[0\] === it\) \{\n      const pr = by\[it\];\n      Lots\.moveIn\(player, it, pr, today, 0, 'carry'\);\n      const extra = Math\.floor\(Lots\.sum\(player, it\) \+ 1e-6\) - Math\.floor\(\(Number\(inv\[it\]\) \|\| 0\) \+ 1e-6\);\n      if \(extra > 0\) inv\[it\] = \(Number\(inv\[it\]\) \|\| 0\) \+ extra;/.test(de),
    '⑧ 문 뒤 ② — 품목이 다 대표 품목이면 종전 줄 그대로(moveIn · ⌊⌋ 더하기) · 다른 품목 갈래만 새 줄');
  ok(/if \(!other\.length\) \{ const pr = recsToPlayer\(recs, give\);/.test(fn(GS, 'recsToItems')), '⑧ `recsToItems` — 다른 품목이 없으면 종전 `recsToPlayer` 하나를 그대로 부른다');
  ok(/const GL = T732_MOMENT \? require\('\.\/granary-lots'\) : null;/.test(ZS), '⑧ 존은 켬일 때만 장부 모듈을 싣는다(끄면 이 카드의 줄을 아무도 안 부른다)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
