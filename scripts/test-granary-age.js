#!/usr/bin/env node
// @regress
// === scripts/test-granary-age.js — T716 ⑤ 임시 고침: 곳간에서 꺼내면 새것이 되던 구멍 (손잡이 T716_GRANARY_AGE=1 · 없음 = 끔 = main 바이트) ===
//
// ★왜 [T716 ① 실측] econ 곳간(`v.storage[재화]`)은 날짜 없는 총량이다. 넣은 음식은 단위로 녹고, 꺼내면 `_afterWithdraw` 의
//   `Lots.reconcile(…, 오늘)` 이 **오늘 얻은 것**으로 잡는다 — 시든 고기를 넣었다 꺼내면 갓 잡은 고기가 된다.
//   ⑤ 는 그 구멍만 같은 자리에서 막는다: 넣을 때 나간 로트 레코드를 마을 econ 옆 장부(`econ._t716Lots`)에 적고,
//   꺼낼 때 오래된 것부터 **넣은 그대로**(같은 물건 · 넣은 개수 · 그 노출) 싣는다. 장부가 못 덮는 몫(econ 이 만든 것)은 종전대로 오늘 것.
//
//  ① 손잡이 — '1' 하나만 켬 · 끔이면 장부 칸이 안 생기고 꺼낸 것은 오늘 것(main 그대로 — 구멍이 그대로 있다는 것도 잰다)
//  ② 켬 — 넣기(정본 `playerVillageDeposit` + 거래소·게시판 환산 `_unitsOfFor`) → 장부 레코드 → 꺼내기(진짜 `tryVillageWithdraw`)
//         → 넣은 물건(곰고기)이 그 노출째 돌아온다 · 대표 품목(사슴·들짐승고기)은 덮은 만큼 빠진다 · 단위가 보존된다
//  ③ 마을이 먹은 몫 — 재고가 장부보다 적으면 오래된 것부터 지운다(설계 ② 순서) · 덮지 못한 몫은 오늘 것
//  ④ 오래된 것부터 — 두 번 넣은 장부에서 먼저 넣은 것이 먼저 나온다
//  ⑤ 배선 — 넣는 문 셋(회관 · 거래소 · 게시판)이 넣기 전 `_t716Snap` · 넣은 뒤 `_t716Put` · 꺼낸 뒤 같은 자리에서 `_t716Take` · 전부 손잡이 뒤
//
// 실행: node scripts/test-granary-age.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 — 존 하나(가벼운 판) + 랩 econ 마을 다섯(정본 진입점 · test-membership 꼴) ═══════════════════════
if (process.env.T716_SUB === 'zone') {
  const TMP = `/tmp/t716-granary-age-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42600 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.MEMBER_WD_MIN = '50';   // ★한도 손잡이만 — 꺼내는 양이 하루 몫에 막히지 않게(곳간·환산·나이는 그대로)
  process.env.MEMBER_WD_FRAC = '1';   //   (재고 비율 한도도 — 재고를 장부보다 작게 둔 ③ 이 0 몫에 막히지 않게)
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const V = H.SimVillages;
  const out = { knob: process.env.T716_GRANARY_AGE == null ? null : process.env.T716_GRANARY_AGE, on: H.T716_AGE };
  try {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    const VID = 0, VIL = vils[VID], AT = P.anchorPx(VIL), RES = 'meat_game';
    out.rate = P.RATE;
    out.toEcon = L.deliverable.toEcon.get(RES);
    const notes = [];
    let nP = 0;
    const mkP = () => {
      const p = { pid: `p_t716_${++nP}`, playerId: `anon_t716_${nP}`, name: '곳간지기', persistent: false,
        x: AT.x, y: AT.y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0,
        ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } };
      H.Membership.seatFounder(p, VID);
      return p;
    };
    const today = H.zoneGameDay();
    // 신선도를 **정확히** 세운 로트(노출 = 보관일 × (1 − f)) — 레코드 꼴 공개 API(`Lots.moveIn`)
    const give = (p, item, n, f, back) => {
      const Lf = H.Spoil.shelfOf(item);
      p.inventory[item] = (p.inventory[item] || 0) + n;
      H.Lots.moveIn(p, item, [{ d: today - (back || 1), n, e: Lf * (1 - f), t: today }], today, 0, 'carry');
    };
    // 읽기는 제품의 읽기와 같이 **맞춘 뒤**(인벤이 정본 · `Lots.view` 가 그렇게 읽는다) — 넣기가 줄인 인벤을 로트가 따라가게
    const lotsOf = (p, item) => { H.Lots.reconcile(p, item, p.inventory, today); return H.Lots.of(p, item).map((l) => ({ d: l.d, n: +l.n.toFixed(6), f: +H.Spoil.freshnessOf(item, H.Spoil.exposureOf(l, today)).toFixed(4) })); };
    const sumOf = (p, item) => { H.Lots.reconcile(p, item, p.inventory, today); return H.Lots.sum(p, item); };
    const ledger = () => JSON.parse(JSON.stringify((VIL.econ._t716Lots && VIL.econ._t716Lots[RES]) || null));
    // 넣기 — 거래소·게시판이 부르는 정본(`playerVillageDeposit` + `_unitsOfFor`)을 `_t716Snap`/`_t716Put` 사이에서 그대로 부른다
    const deposit = (p, item, n) => {
      const s0 = Number(VIL.econ.storage[RES]) || 0;
      const snap = H.T716_AGE ? H._t716Snap(p, VIL) : null;
      const r = V.playerVillageDeposit(VIL, p.inventory, { [item]: n }, H._unitsOfFor(p));
      const put = snap ? H._t716Put(p, snap, false) : 0;
      return { ok: r.ok, du: +((Number(VIL.econ.storage[RES]) || 0) - s0).toFixed(6), put };
    };
    const withdraw = (p, q) => { const s0 = Number(VIL.econ.storage[RES]) || 0; H.tryVillageWithdraw(p, VID, RES, q); return +(s0 - (Number(VIL.econ.storage[RES]) || 0)).toFixed(6); };

    // ── A. 넣기 10 곰고기(f 0.5) → 꺼내기 3 단위 ────────────────────────────────
    VIL.econ.storage[RES] = 100;
    const a = mkP();
    give(a, 'meat_bear', 10, 0.5, 3);
    out.A0 = { inv: Object.assign({}, a.inventory), lots: lotsOf(a, 'meat_bear') };
    out.Adep = deposit(a, 'meat_bear', 10);
    out.Aledger = ledger();
    out.Awd = withdraw(a, 3);
    out.A = { inv: Object.assign({}, a.inventory), bear: lotsOf(a, 'meat_bear'), game: lotsOf(a, 'meat_game'), sumBear: sumOf(a, 'meat_bear'), ledger: ledger(), note: notes[notes.length - 1] || '' };

    // ── B. 마을이 먹은 몫 — 재고를 장부보다 적게(1.2) 두고 1 단위 꺼낸다 ─────────────────
    delete VIL.econ._t716Lots;
    VIL.econ.storage[RES] = 50;
    const b = mkP();
    give(b, 'meat_bear', 10, 0.5, 2);
    out.Bdep = deposit(b, 'meat_bear', 10);
    VIL.econ.storage[RES] = 1.2;               // NPC 가 먹었다(econ 은 가격 가중 · 그림자 규칙은 오래된 것부터)
    out.Bwd = withdraw(b, 1);
    out.B = { inv: Object.assign({}, b.inventory), bear: lotsOf(b, 'meat_bear'), sumBear: sumOf(b, 'meat_bear'), game: lotsOf(b, 'meat_game'), ledger: ledger(), note: notes[notes.length - 1] || '' };

    // ── C. 덮지 못한 몫 — 작게 넣고(2) 크게 꺼낸다(3 단위) ─────────────────────────
    delete VIL.econ._t716Lots;
    VIL.econ.storage[RES] = 100;
    const c = mkP();
    give(c, 'meat_bear', 2, 0.5, 2);
    out.Cdep = deposit(c, 'meat_bear', 2);
    out.Cwd = withdraw(c, 3);
    out.C = { inv: Object.assign({}, c.inventory), bear: lotsOf(c, 'meat_bear'), sumBear: sumOf(c, 'meat_bear'), game: lotsOf(c, 'meat_game'), ledger: ledger() };

    // ── D. 오래된 것부터 — 두 번 넣는다(먼저 10개 f 0.3 · 나중 4개 f 0.8) → 첫 레코드보다 작게(1 단위) 꺼낸다 ─────────────
    delete VIL.econ._t716Lots;
    VIL.econ.storage[RES] = 100;
    const d1 = mkP(), d2 = mkP();
    give(d1, 'meat_bear', 10, 0.3, 4); out.Ddep1 = deposit(d1, 'meat_bear', 10);
    give(d2, 'meat_bear', 4, 0.8, 1); out.Ddep2 = deposit(d2, 'meat_bear', 4);
    out.Dledger0 = ledger();
    const d3 = mkP();
    out.Dwd = withdraw(d3, 1);
    out.D = { bear: lotsOf(d3, 'meat_bear'), ledger: ledger() };
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
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T716_GRANARY_AGE; delete e.T716_SUB; return e; })();
const sub = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T716_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop());
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-6 : e);
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const VSRC = fs.readFileSync(SV('villages.js'), 'utf8');

say('\n=== 곳간 나이 몫 — 꺼내면 새것이 되던 구멍 (T716 ⑤ · 손잡이 T716_GRANARY_AGE=1) ===');
const zOff = sub({});
const zOn = sub({ T716_GRANARY_AGE: '1' });

say('\n① 손잡이 · 끔 = 종전(구멍이 그대로 있다)');
{
  pre(!zOff.err && !zOn.err, '존 두 판이 떴다', zOff.err || zOn.err || '');
  const knob = (v) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, v === undefined ? {} : { T716_GRANARY_AGE: v }, { T716_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim().split('\n').pop()).on;
  ok(zOff.on === false && zOn.on === true && knob('') === false && knob('0') === false && knob('true') === false, "★① 손잡이 — '1' 하나만 켬(없음·빈 값·'0'·'true' = 끔)");
  pre(zOff.toEcon === 'meat_game' && zOff.rate > 0, '곳간 재화 meat_game 의 대표 품목 = 사슴·들짐승고기(대응 정본 · T694 켬)', `${zOff.toEcon} · 환산율 ${zOff.rate}`);
  pre(zOff.A0.lots.length === 1 && near(zOff.A0.lots[0].f, 0.5, 1e-3), '넣을 곰고기 10 — 시든 것(f 0.5)', JSON.stringify(zOff.A0.lots));
  ok(zOff.Aledger === null && zOff.A.ledger === null, '★① 끔 — 마을 econ 옆 장부 칸이 안 생긴다(econ_state 바이트 그대로)');
  const g = zOff.A.game;
  ok(zOff.A.inv.meat_game > 0 && g.length === 1 && g[0].f === 1 && g[0].d === g[0].d && !zOff.A.inv.meat_bear,
    '★★① 끔 — 꺼낸 것은 **오늘 얻은 것**(f 1) · 넣은 곰고기는 안 돌아온다 — "꺼내면 새것" 구멍(main 그대로)', `사슴·들짐승고기 ${zOff.A.inv.meat_game} · f ${g[0] && g[0].f}`);
}

say('\n② 켬 — 넣은 그대로(같은 물건 · 넣은 개수 · 그 노출) · 단위 보존');
{
  const A = zOn.A, led = zOn.Aledger;
  pre(zOn.Adep.ok && zOn.Adep.du > 0, '넣기가 곳간 칸을 올렸다(정본 환산 — 곰고기 열량 × 신선도)', `+${zOn.Adep.du} 단위`);
  ok(Array.isArray(led) && led.length === 1 && led[0].i === 'meat_bear' && led[0].n === 10 && near(led[0].u, zOn.Adep.du, 1e-6) && led[0].m === 0.7 && led[0].w === 0.55,
    '★★② 넣으면 장부에 레코드 하나 — 곰고기 10 · 단위 = 곳간 칸의 실제 증가분 · 자리 = 곳간(밀폐 0.7 · 완충 0.55)', JSON.stringify(led && led[0]));
  pre(zOn.Awd > 0 && A.inv.meat_game === 0 || A.inv.meat_game == null, '꺼내기가 곳간에서 단위를 뺐다', `−${zOn.Awd} 단위`);
  const back = A.sumBear;   // 덮은 단위 = 꺼낸 단위 전부(장부가 넉넉하다)
  pre(zOn.Awd > 2 && zOn.Awd < zOn.Adep.du, '꺼낸 단위가 넣은 단위보다 작다(장부가 다 덮는다)', `${zOn.Awd} < ${zOn.Adep.du}`);
  ok(back > 5 && back < 10 && near(back, 10 * zOn.Awd / zOn.Adep.du, 2e-3),
    '★★② 넣었던 **곰고기**가 돌아온다 — 꺼낸 단위만큼(10 × 꺼낸 단위 ÷ 넣은 단위)', `곰고기 ${back.toFixed(4)} = 10 × ${zOn.Awd} ÷ ${zOn.Adep.du}`);
  ok(A.bear.every((l) => near(l.f, 0.5, 1e-3)), '★★② 그 **노출째** — f 0.5(넣을 때 그대로 · 같은 날이라 곳간 구간 0) · 오늘 것으로 안 바뀐다', JSON.stringify(A.bear));
  ok(!(A.inv.meat_game > 0) && A.game.length === 0, '★② 대표 품목(사슴·들짐승고기)은 덮은 만큼 빠졌다 — 오늘 것이 될 뻔한 몫이 없다', JSON.stringify(A.game));
  const unitsBack = back * 0.5 * 1610 / 2450;   // 곰고기 1kg 1,610 kcal · 하루치 2,450 · 신선도 0.5 (넣을 때 그 환산 그대로)
  ok(near(unitsBack, zOn.Awd, 0.01), '★② 단위 보존 — 돌아온 곰고기의 열량 × 신선도 = 꺼낸 단위(곳간이 환전소가 아니다)', `${unitsBack.toFixed(4)} ≈ ${zOn.Awd}`);
  ok(Array.isArray(A.ledger) && A.ledger.length === 1 && near(A.ledger[0].u, zOn.Adep.du - zOn.Awd, 2e-3) && near(A.ledger[0].n, 10 - back, 1e-4),
    '② 장부엔 덮고 남은 몫이 그대로(단위 · 개수 같은 비율)', JSON.stringify(A.ledger && A.ledger[0]));
  ok(/넣은 그대로/.test(A.note), '② 화면이 그렇게 말한다(넣은 그대로 · 그 나이째)', A.note.slice(0, 80));
}

say('\n③ 마을이 먹은 몫 · 덮지 못한 몫');
{
  const B = zOn.B;
  pre(zOn.Bdep.du > 1.2, '넣은 단위가 남은 재고(1.2)보다 크다 — NPC 가 그 사이 먹었다', `넣음 ${zOn.Bdep.du} · 재고 1.2`);
  pre(zOn.Bwd > 0 && /넣은 그대로/.test(B.note), '꺼내기가 됐다(재고 1.2 에서 1 단위)', `−${zOn.Bwd} 단위`);
  ok(B.sumBear > 0 && B.sumBear < 10 * 1.2 / zOn.Bdep.du + 1e-6,
    '★★③ 장부를 꺼내기 전 재고(1.2)로 깎은 뒤 싣는다 — 먹힌 몫(오래된 것부터)은 안 돌아온다', `곰고기 ${B.sumBear.toFixed(4)} ≤ 10 × 1.2 ÷ ${zOn.Bdep.du}`);
  ok(B.bear.every((l) => near(l.f, 0.5, 1e-3)), '③ 돌아온 몫은 그 노출째', JSON.stringify(B.bear));
  const C = zOn.C;
  pre(zOn.Cwd > zOn.Cdep.du, '꺼낸 단위가 넣은 단위보다 크다(econ 이 만든 몫이 섞인다)', `넣음 ${zOn.Cdep.du} · 꺼냄 ${zOn.Cwd}`);
  ok(C.sumBear > 0 && C.inv.meat_game > 0 && C.game.every((l) => l.f === 1),
    '★★③ 장부가 덮은 몫만 곰고기(그 나이) · 나머지는 대표 품목 **오늘 것**(econ 이 만든 몫 — 나이를 모른다 · 설계 ② 가 메운다)', `곰고기 ${C.sumBear.toFixed(3)} · 사슴·들짐승고기 ${C.inv.meat_game}(f 1)`);
  ok(C.ledger === null || (Array.isArray(C.ledger) && C.ledger.every((x) => x.u < zOn.Cwd / Math.max(1, zOn.C.inv.meat_game + 1))), '③ 덮고 남은 장부는 대표 품목 한 개 몫보다 작다(낱개로만 바꾼다 — 반올림 0)', JSON.stringify(C.ledger));
}

say('\n④ 오래된 것부터');
{
  const L0 = zOn.Dledger0;
  pre(Array.isArray(L0) && L0.length === 2 && L0[0].e > L0[1].e && L0[0].u > zOn.Dwd, '장부에 레코드 둘 — 먼저 넣은 것(10개 · f 0.3)이 앞 · 꺼낼 단위보다 크다', JSON.stringify(L0 && L0.map((x) => ({ n: x.n, u: x.u, e: x.e }))));
  ok(zOn.D.bear.length >= 1 && zOn.D.bear.every((l) => near(l.f, 0.3, 1e-3)), '★★④ 작게 꺼내면 먼저 넣은 것(f 0.3)만 나온다 — 나중 것(f 0.8)은 장부에 남는다', JSON.stringify(zOn.D.bear));
  ok(Array.isArray(zOn.D.ledger) && zOn.D.ledger[zOn.D.ledger.length - 1].n === 4, '④ 나중 레코드는 그대로(4개)', JSON.stringify(zOn.D.ledger && zOn.D.ledger.map((x) => x.n)));
}

say('\n⑤ 배선 — 넣는 문 셋 · 꺼낸 뒤 같은 자리 · 전부 손잡이 뒤');
{
  ok(/const T716_AGE = process\.env\.T716_GRANARY_AGE === '1';/.test(ZSRC), "⑤ 손잡이 한 줄 — '1' 하나만 켬");
  const fnOf = (name) => { const i = ZSRC.indexOf(`function ${name}(`); return i < 0 ? '' : ZSRC.slice(i, ZSRC.indexOf('\n}\n', i)); };
  const doors = ['tryVillageDeposit', 'tryVillageTradeExec', 'tryVillageDeliver'];
  const bad = doors.filter((n) => { const f = fnOf(n); const a = f.indexOf('_t716Snap('), b = f.search(/SimVillages\.(playerVillageDeposit|villageTradeExec|villageDeliver)\(/), c = f.indexOf('_t716Put(');
    return !(a > 0 && b > a && c > b && /T716_AGE \? _t716Snap\(/.test(f)); });
  ok(bad.length === 0, '★⑤ 넣는 문 셋(회관 · 거래소 · 게시판·겨울 몫) — 정본 넣기 **앞**에서 `_t716Snap` · **뒤**에서 `_t716Put` · 손잡이 뒤', bad.join(',') || '셋 다');
  const aw = fnOf('_afterWithdraw');
  ok(aw.indexOf('T716_AGE ? _t716Take(') > 0 && aw.indexOf('_t716Take(') < aw.indexOf('Lots.reconcile(player, r.item'), '★⑤ 꺼낸 뒤 **같은 자리** — `_afterWithdraw` 의 오늘 것 줄 바로 앞(채팅 `/곳간`·`/인출` 도 이 함수를 지난다)');
  ok(/afterWithdraw: \(player, r\) => _afterWithdraw\(player, r\)/.test(ZSRC), '⑤ 채팅 인출도 같은 뒷정리(Membership.init 의 afterWithdraw)');
  const skip = VSRC.slice(VSRC.indexOf('const SERIALIZE_SKIP = new Set(['), VSRC.indexOf(']);', VSRC.indexOf('const SERIALIZE_SKIP = new Set([')));
  ok(!/_t716Lots/.test(skip) && /for \(const k of Object\.keys\(v\)\)/.test(VSRC), '⑤ 장부는 econ_state 에 같이 적힌다(`serializeEcon` 이 키를 다 싣는다 · 건너뛰기 목록 밖 — `_t544Pack` 과 같은 자리)');
  const lines = ZSRC.split('\n').filter((l) => /_t716(Snap|Put|Take)\(/.test(l) && !/^\s*\/\//.test(l) && !/^function /.test(l) && !/__testBind|T716_AGE, _t716Snap/.test(l));
  ok(lines.every((l) => /T716_AGE|_s716|_t716 =/.test(l)), '⑤ 부르는 자리는 전부 손잡이 뒤(끄면 아무것도 안 한다)', `${lines.length}줄`);
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
