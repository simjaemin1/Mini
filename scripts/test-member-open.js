#!/usr/bin/env node
// @regress
// === scripts/test-member-open.js — 가입 · 탈퇴 언제든 · 다시 들기 1시간 · 인정 구성원 · 영토 안 집터 · 거래소 수수료 (T1137 · ★재민 11-03) ===
//
// ★왜 [★재민 11-03 · 족보 732 · 733] 가입은 문턱 없이 · 탈퇴 · 추방 뒤 다시 들기 1시간(실시간) · 인정 구성원(부탁 12) = 영토 안 집터 · 거래소 할인 ·
//   곳간은 거래로만(꺼내기 = 촌장) · 수수료는 물건으로 그 마을 곳간에. 손잡이 `T1137_MEMBER_OPEN`(켬 기본 후보 · `=0` = 종전 소속 문).
//
// 켬(기본 · 수수료 판 `T1137_FEE=0.1` · `T1137_FEE_MEMBER=0.05` — 이 하네스가 고른 시험 값 · 기본값은 0)
//   ① `/가입` 즉시 — 마을 사람 · 인정 아님 · 촌장 말 · 기여 0 그대로
//   ② 들판 빈터(영토 밖 · 온보딩 빈터 권리)는 그대로 됨 · 영토 안 집터는 거부(말 · 땅 그대로)
//   ③ 부탁 11 = 아직 · 12 = 인정 → 영토 안 집터 됨(넓히기)
//   ④ 수수료 — 비구성원 · 가입만 한 사람 = 기본율 · 인정 구성원 = 할인율 · 견적 = 실행 · 낱개 올림 · 곳간에 들어감(품목 · 양)
//   ⑤ 꺼내기 0 — 비구성원 · 인정 구성원(NPC 마을) · 촌장(사람 마을)만 됨
//   ⑥ `/탈퇴` — 소속 0 · 기여 그대로 · 내 땅 그대로 · 새로 잡기 거부 · 1시간 안 `/가입` 거부(남은 시간 말) · 1시간 뒤 됨 · 곧 인정
//   ⑦ 추방도 다시 들기 1시간(촌장이 내보낸 사람 · `/수락` 문도 같은 술어)
//   ⑧ 몸 — 다시 들기 시각이 `serializeBody` → `parseBody` 왕복(재접속 · 넘기와 같은 함수)에 산다 · 시각이 없으면 칸도 없다(종전 바이트)
//   ⑨ 마을 화면 `me` 칸 — open · recognized · coolMin · fee
// 끔(`T1137_MEMBER_OPEN=0`) — ⑩ `/가입` 은 명령이 아니다 · 기여 없이 영토 안 집터(종전) · 탈퇴 뒤 다시 들기 0 · 수수료 0 · 화면 칸 0
// 수수료 0(손잡이 기본) — ⑪ 견적 · 실행에 수수료 칸 없음(종전 바이트)
//
// 실행: node scripts/test-member-open.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T1137_SUB === 'zone') {
  const TMP = `/tmp/t1137-member-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: '0', DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ONB_ENABLE: '1',
    ONB_VACANT_R: '0.5' });   // 빈터 구역을 한 셀로 — 영토 안 셀이 빈터 권리로 빠지지 않게(영토 안 문만 따로 잰다)
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const done = (o) => { _log(JSON.stringify(o)); try { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) fs.unlinkSync(f); } catch (e) {} process.exit(0); };
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const Onb = require(SV('onboarding.js'));
  const VV = require(SV('village-view.js'));
  const V = H.SimVillages, M = H.Membership;
  const out = { on: M.T1137, errs: [] };
  (async () => {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils, econV2);   // 거래소 견적 · 실행이 econ v2 정본(그림자 가격)을 부른다
    const E1 = require(path.join(ROOT, 'sim', 'economy-sim'));
    V.__labProbe._distProbe.setup(null, null, null, E1);
    const CHIEF = 'anon_t1137_chief';
    vils[0].econ.founder = CHIEF;
    const VK = require(SV('village-kin.js'));
    if (VK.ON) for (const v of vils) VK.attach(v, {}, null);
    const AT = vils.map((v) => P.anchorPx(v));
    for (const v of vils) { v.econ.storage.food = 4000; v.econ.storage.wood = 500; }
    const SZ = H.BUILDING_SIZE;
    // 마을 3(NPC) 영토 — 중심 셀 둘레 |dx|,|dy| ≤ 3 · 빈터(도착 지점)는 그 바로 바깥 셀(dx = 4)
    const C0 = { x: Math.floor(AT[3].x / SZ), y: Math.floor(AT[3].y / SZ) };
    vils[3]._terrSet = new Set(); for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) vils[3]._terrSet.add(`${C0.x + dx},${C0.y + dy}`);
    vils[0]._terrSet = new Set(); { const c = { x: Math.floor(AT[0].x / SZ), y: Math.floor(AT[0].y / SZ) }; for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) vils[0]._terrSet.add(`${c.x + dx},${c.y + dy}`); }
    const cellPx = (dx, dy) => ({ x: (C0.x + dx) * SZ + SZ / 2, y: (C0.y + dy) * SZ + SZ / 2 });
    const LOT = cellPx(4, 0);
    Onb.__probe.setArrivals(new Map([[3, { cx: C0.x + 4, cy: C0.y, x: LOT.x, y: LOT.y, name: '랩마을3' }]]));
    const msgs = new Map();
    const mkP = (playerId, vid) => {
      const p = { pid: `p_${playerId}`, playerId, name: playerId.replace('anon_t1137_', ''), persistent: false,
        x: AT[vid].x, y: AT[vid].y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0, member: null };
      const box = []; msgs.set(playerId, box);
      p.ws = { readyState: 1, send: (s) => { try { box.push(JSON.parse(s)); } catch (e) {} } };
      H.players.set(p.pid, p);
      const s = Onb.stateOf(playerId); s.start_vid = vid; s.arrived = 1; s.contrib = 0; s.lot_ok = 0; Onb.__probe.save(playerId, s);
      return p;
    };
    const notes = (p) => (msgs.get(p.playerId) || []).filter((o) => o.type === 'notice').map((o) => o.text);
    const last = (p) => { const n = notes(p); return n[n.length - 1] || ''; };
    const safe = (tag, fn) => { try { return fn(); } catch (e) { out.errs.push(`${tag}:${String(e && e.stack || e).slice(0, 300)}`); return null; } };
    const say = (p, t) => safe('chat ' + t, () => H.handleChatLine(p, t));
    const myClaims = (p) => [...H.claims.values()].filter((c) => c.ownerPid === p.playerId).length;
    const claimAt = (p, dx, dy) => { const c = cellPx(dx, dy); p.x = c.x; p.y = c.y; p.inventory.wood = 50; p.inventory.stone = 50; const n0 = myClaims(p); safe('claim', () => H.tryClaim(p, 'personal')); return { got: myClaims(p) - n0, note: last(p) }; };
    const deliver = (p, n) => { for (let i = 0; i < n; i++) Onb.onDeliver(p, { ok: true, done: true, req: { item: 'food' } }, 3); };
    const st = (vid, res) => +(Number(vils[vid].econ.storage[res]) || 0).toFixed(4);

    // ① 가입 즉시
    const A = mkP('anon_t1137_a', 3); A._memberNearVid = 3;
    out.join = { r: say(A, '/가입'), member: A.member ? A.member.vid : null, rec: M.isRecognized(A, 3), contrib: M.contribOf(A.playerId), note: last(A) };
    // ② 들판 빈터 · 영토 안
    { const s = Onb.stateOf(A.playerId); s.lot_ok = 1; s.start_vid = 3; Onb.__probe.save(A.playerId, s); }
    out.lot = claimAt(A, 4, 0);
    out.inTerrBefore = claimAt(A, 3, 0);
    // ③ 부탁 11 · 12
    A.x = AT[3].x; A.y = AT[3].y;
    deliver(A, M.CFG.N_MEMBER - 1);
    out.rec11 = { rec: M.isRecognized(A, 3), contrib: M.contribOf(A.playerId) };
    out.inTerr11 = claimAt(A, 3, 0);
    deliver(A, 1);
    out.rec12 = { rec: M.isRecognized(A, 3), contrib: M.contribOf(A.playerId) };
    out.inTerr12 = claimAt(A, 3, 0);
    out.inTerr12b = claimAt(A, 2, 0);   // 넓히기(붙여서)
    out.sayRec = { r: say(A, '/소속'), note: last(A) };
    // ④ 수수료 — 비구성원(Q) · 가입만(B) · 인정(A) · 같은 품목 · 같은 수
    const Q = mkP('anon_t1137_q', 3); Q._memberNearVid = 3;
    const B = mkP('anon_t1137_b', 3); B._memberNearVid = 3; say(B, '/가입');
    const fee = {};
    for (const [k, p] of [['q', Q], ['b', B], ['a', A]]) {
      p.x = AT[3].x; p.y = AT[3].y; p.inventory = { wood: 40 };
      const rate = M.feeRateOf(p, 3);
      const qt = safe('quote', () => V.villageTradeQuote(3, p.x, p.y, 'wood', 'food', 20, H._unitsOfFor(p), { inventory: p.inventory, feeRate: rate }));
      const w0 = st(3, 'wood'), f0 = st(3, 'food'), inv0 = p.inventory.wood;
      safe('exec', () => H.tryVillageTradeExec(p, 3, 'wood', 'food', 20, 0, 'food'));
      fee[k] = { rate, qFee: qt && qt.fee, qTotal: qt && qt.giveTotal, gave: inv0 - (p.inventory.wood || 0), woodUp: +(st(3, 'wood') - w0).toFixed(4), foodDown: +(f0 - st(3, 'food')).toFixed(4),
        food: p.inventory.food || 0, note: last(p) };
    }
    out.fee = fee;
    //   수수료까지 못 내는 판 — 견적이 미리 말하고 실행이 같은 말로 막는다
    { const p = Q; p.inventory = { wood: 20 }; const rate = M.feeRateOf(p, 3);
      const qt = safe('quote2', () => V.villageTradeQuote(3, p.x, p.y, 'wood', 'food', 20, H._unitsOfFor(p), { inventory: p.inventory, feeRate: rate }));
      const w0 = st(3, 'wood'); safe('exec2', () => H.tryVillageTradeExec(p, 3, 'wood', 'food', 20, 0, 'food'));
      out.feeShort = { q: qt && qt.feeShort, woodUp: +(st(3, 'wood') - w0).toFixed(4), left: p.inventory.wood, note: last(p) }; }
    // ⑫ ★[T1151] 끝수 장부 — 1개 거래 · 같은 사람이 되풀이 · 재접속 뒤 유지
    {
      //   한 개를 내도 한 개 이상 받는 짝을 고른다(곳간이 받는 품목 → 곡식 · 나무) — 시세는 세계가 정한다(고른 짝을 그대로 적는다)
      const dep = V.playerVillageDepositMap(); let pick = null;
      const D0 = mkP('anon_t1151_probe', 3); D0.x = AT[3].x; D0.y = AT[3].y;
      for (const [it, res] of Object.entries(dep)) { for (const take of ['food', 'wood']) { if (res === take || pick) continue; D0.inventory = { [it]: 5 };
        const q = safe('pq', () => V.villageTradeQuote(3, D0.x, D0.y, res, take, 1, H._unitsOfFor(D0), { inventory: D0.inventory }));
        if (q && !q.err && q.take >= 1) pick = { it, res, take }; } }
      out.pick = pick;
      if (pick) {
        const D = mkP('anon_t1151_d', 3); D._memberNearVid = 3; D.x = AT[3].x; D.y = AT[3].y; D.inventory = { [pick.it]: 60 };
        const rate = M.feeRateOf(D, 3), seq = [];
        for (let i = 0; i < 21; i++) {
          const before = M.feeOweOf(D, 3);
          const qt = safe('q1', () => V.villageTradeQuote(3, D.x, D.y, pick.res, pick.take, 1, H._unitsOfFor(D), { inventory: D.inventory, feeRate: rate, feeOwe: before }));
          const inv0 = D.inventory[pick.it] || 0, s0 = st(3, pick.res);
          safe('x1', () => H.tryVillageTradeExec(D, 3, pick.res, pick.take, 1, 0, 'food'));
          seq.push({ before, qFee: qt && qt.fee, qOwe: qt && qt.feeOwe, gave: inv0 - (D.inventory[pick.it] || 0), owe: M.feeOweOf(D, 3), up: +(st(3, pick.res) - s0).toFixed(3), note: last(D) });
        }
        out.owe = { rate, seq };
        //   재접속 — 몸 왕복(serializeBody → parseBody · 넘기와 같은 함수)
        const B2 = H.serializeBody(D); const back = H.parseBody(JSON.parse(JSON.stringify(B2)), { vitals: true });
        out.oweBody = { has: 'feeOwe' in B2, v: B2.feeOwe, back: back.feeOwe };
        const D2 = mkP('anon_t1151_d2', 3); D2.feeOwe = back.feeOwe; D2.x = AT[3].x; D2.y = AT[3].y; D2.inventory = { [pick.it]: 5 };
        const q2 = safe('q2', () => V.villageTradeQuote(3, D2.x, D2.y, pick.res, pick.take, 1, H._unitsOfFor(D2), { inventory: D2.inventory, feeRate: M.feeRateOf(D2, 3), feeOwe: M.feeOweOf(D2, 3) }));
        out.oweAfter = { before: q2 && q2.feeOweBefore, owe: q2 && q2.feeOwe, mine: M.feeOweOf(D2, 3) };
        //   1개만 가진 사람 — T1137 올림 판에선 막혔다(낼 1 + 수수료 1 > 1)
        const O = mkP('anon_t1151_one', 3); O.x = AT[3].x; O.y = AT[3].y; O.inventory = { [pick.it]: 1 };
        safe('one', () => H.tryVillageTradeExec(O, 3, pick.res, pick.take, 1, 0, 'food'));
        out.one = { left: O.inventory[pick.it] || 0, got: O.inventory[dep[pick.it] === pick.take ? pick.it : (pick.take === 'food' ? Object.keys(dep).find((k) => dep[k] === 'food') : 'wood')] || 0, owe: M.feeOweOf(O, 3), note: last(O) };
        const B3 = H.serializeBody(Q); out.oweNone = { has: 'feeOwe' in B3 };
      }
    }
    // ⑤ 꺼내기 — 비구성원 · 인정 구성원(NPC 마을) · 촌장(사람 마을)
    const wd = async (p, vid, q) => { const s0 = st(vid, 'food'); const r = safe('wd', () => H.tryVillageWithdraw(p, vid, 'food', q)); if (r && typeof r.then === 'function') await r; return +(s0 - st(vid, 'food')).toFixed(4); };
    out.wdQ = { took: await wd(Q, 3, 2), note: last(Q) };
    out.wdA = { took: await wd(A, 3, 2), note: last(A) };
    const CH = mkP(CHIEF, 0); M.seatFounder(CH, 0);
    out.wdCH = { took: await wd(CH, 0, 2), note: last(CH) };
    // ⑥ 탈퇴
    const nA = myClaims(A);
    const t0 = Date.now();
    out.quit = { r: say(A, '/탈퇴'), member: A.member, contrib: M.contribOf(A.playerId), cool: A.memberCool, coolLeft: M.coolLeft(A), note: last(A) };
    out.quitClaims = { before: nA, after: myClaims(A) };
    out.quitClaim = claimAt(A, 1, 0);
    A.x = AT[3].x; A.y = AT[3].y;
    out.rejoinEarly = { r: say(A, '/가입'), member: A.member ? A.member.vid : null, note: last(A) };
    out.offerEarly = { r: say(A, '/소속'), member: A.member ? A.member.vid : null, note: last(A) };
    const _now = Date.now;
    Date.now = () => _now() + 59 * 60000;
    out.rejoin59 = { r: say(A, '/가입'), member: A.member ? A.member.vid : null, note: last(A) };
    Date.now = () => _now() + 60 * 60000 + 1000;
    out.rejoin61 = { r: say(A, '/가입'), member: A.member ? A.member.vid : null, rec: M.isRecognized(A, 3), note: last(A) };
    Date.now = _now;
    out.t0 = t0;
    // ⑦ 추방 — 촌장(사람 마을 0)이 내보낸 사람 · 부름 문(`/수락`)도 같은 술어
    const E = mkP('anon_t1137_e', 0); E._memberNearVid = 0;
    say(E, '/가입');
    out.expelJoin = { member: E.member ? E.member.vid : null };
    out.expel = { r: say(CH, `/추방 ${E.name}`), member: E.member, cool: M.coolLeft(E) > 0, note: last(CH) };
    out.expelRejoin = { r: say(E, '/가입'), member: E.member ? E.member.vid : null, note: last(E) };
    say(CH, `/초대 ${E.name}`);
    out.inviteRejoin = { r: say(E, '/수락'), member: E.member ? E.member.vid : null, note: last(E) };
    // ⑧ 몸 왕복
    const B1 = H.serializeBody(A); const back = H.parseBody(JSON.parse(JSON.stringify(B1)), { vitals: true });
    out.body = { has: 'memberCool' in B1, eq: back.memberCool === A.memberCool, v: A.memberCool };
    const Bq = H.serializeBody(Q); out.bodyNone = { has: 'memberCool' in Bq };
    //   다시 들기 남은 사람의 몸 — 넘긴 쪽 몸을 그대로 이어받은 새 사람(넘기 · 재접속 길의 `_bodyInto` 와 같은 칸)
    { const E2 = mkP('anon_t1137_e2', 0); E2.memberCool = H.parseBody(JSON.parse(JSON.stringify(H.serializeBody(E))), { vitals: true }).memberCool; E2._memberNearVid = 0;
      out.handoff = { r: say(E2, '/가입'), member: E2.member ? E2.member.vid : null, note: last(E2) }; }
    // ⑨ 마을 화면 `me` 칸
    { const ps = M.publicState(B, vils[3]); out.pub = { open: ps.open, rec: ps.recognized, fee: ps.fee, coolMs: ps.coolMs };
      out.vvE = safe('vv', () => VV.meOf(E, vils[0]));   // 마을 화면 `me` 칸 — 정본 함수 그대로(`build` 의 그 줄 · 랩은 게시판 소식 줄을 못 세운다)
      out.vvA = safe('vv2', () => VV.meOf(A, vils[3])); }
  })().then(() => done(out)).catch((e) => { out.errs.push('top:' + String(e && e.stack || e).slice(0, 400)); done(out); });
  return;
}

// ══ 본 실행 ══════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const BASE_ENV = (() => { const e = Object.assign({}, process.env); for (const k of ['T1137_MEMBER_OPEN', 'T1137_FEE', 'T1137_FEE_MEMBER', 'T1137_SUB']) delete e[k]; return e; })();
const sub = (env) => {
  const txt = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T1137_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim();
  return JSON.parse(txt.split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1137 — 가입 · 탈퇴 언제든 · 다시 들기 1시간 · 인정 구성원 · 거래소 수수료 ===');
const ON = sub({ T1137_FEE: '0.1', T1137_FEE_MEMBER: '0.05' });
const OFF = sub({ T1137_MEMBER_OPEN: '0', T1137_FEE: '0.1', T1137_FEE_MEMBER: '0.05' });
const ZERO = sub({ T1137_FEE: '0' });   // ★[T1151] 기본이 5% · 3% 가 됐다 — 율 0 은 되돌림 판
const DEF = sub({});                   // ★[T1151] 손잡이 없음 = 5% · 인정 3% · 끝수 장부

ok(ON.on === true && OFF.on === false && ZERO.on === true, "손잡이 — 없음 = 켬 · '0' = 끔", `${ON.on} / ${OFF.on} / ${ZERO.on}`);
ok(!ON.errs.length && !OFF.errs.length && !ZERO.errs.length && !DEF.errs.length, '하위 실행 오류 0', JSON.stringify({ on: ON.errs, off: OFF.errs, zero: ZERO.errs, def: DEF.errs }).slice(0, 600));

console.log('\n① `/가입` 즉시');
ok(ON.join.r === true && ON.join.member === 3 && ON.join.rec === false && ON.join.contrib === 0, '★문턱 없이 곧 마을 사람 · 인정은 아직 · 기여 0 그대로(계량기를 지어내지 않는다)', JSON.stringify(ON.join));
ok(/잘 왔네/.test(ON.join.note) && /12건 더 채우면 구성원으로 인정/.test(ON.join.note), '촌장이 반기는 말 · 인정까지 남은 부탁', ON.join.note);

console.log('\n② 들판 빈터 그대로 · 영토 안 집터 거부');
ok(ON.lot.got === 1, '★영토 밖 들판 빈터(온보딩 빈터 권리)는 종전처럼 됨', ON.lot.note);
ok(ON.inTerrBefore.got === 0 && /구성원으로 인정된 사람만/.test(ON.inTerrBefore.note), '★영토 안 집터는 거부 — 가입만으로는 안 된다', ON.inTerrBefore.note);

console.log('\n③ 부탁 11 · 12 → 인정 → 영토 안 집터');
ok(ON.rec11.rec === false && ON.inTerr11.got === 0 && /1건 더/.test(ON.inTerr11.note), '부탁 11 = 아직(문턱 바로 아래 — 자명 통과 금지)', `${JSON.stringify(ON.rec11)} · ${ON.inTerr11.note}`);
ok(ON.rec12.rec === true && ON.rec12.contrib === 12, '★부탁 12 = 인정 구성원(계량기 하나 · `MEMBER_N` 12 그대로)', JSON.stringify(ON.rec12));
ok(ON.inTerr12.got === 1 && ON.inTerr12b.got === 1, '★인정 뒤 영토 안 집터 됨 · 넓히기도 됨', `${ON.inTerr12.note} / ${ON.inTerr12b.note}`);
ok(/인정 구성원입니다/.test(ON.sayRec.note), '`/소속` 이 인정을 말한다', ON.sayRec.note);

console.log('\n④ 거래소 수수료(물건 · 곳간 몫 · 인정 구성원만 할인)');
const F = ON.fee;
ok(F.q.rate === 0.1 && F.b.rate === 0.1 && F.a.rate === 0.05, '★율 — 비구성원 · 가입만 = 기본(0.1) · 인정 구성원 = 할인(0.05) · "들어가 싸게 사고 탈퇴" 막음', `${F.q.rate} / ${F.b.rate} / ${F.a.rate}`);
ok(F.q.qFee === 2 && F.b.qFee === 2 && F.a.qFee === 1 && F.q.qTotal === 22 && F.a.qTotal === 21, '견적 — 낼 20개에 수수료 2 · 2 · 1(올림) · 모두 22 · 22 · 21', `${F.q.qFee}/${F.b.qFee}/${F.a.qFee} · ${F.q.qTotal}/${F.a.qTotal}`);
ok(F.q.gave === 22 && F.b.gave === 22 && F.a.gave === 21, '★실행 = 견적 — 손에서 나간 나무 22 · 22 · 21', `${F.q.gave}/${F.b.gave}/${F.a.gave}`);
ok(F.q.woodUp === 22 && F.a.woodUp === 21 && F.q.food > 0 && F.a.food > 0, '★수수료가 그 마을 곳간에 들어갔다(나무 22 · 21 단위 — 거래 몫 20 + 수수료)', `${F.q.woodUp} / ${F.a.woodUp} · 받은 곡식 ${F.q.food} / ${F.a.food}`);
ok(/수수료로 랩마을3 곳간에/.test(F.q.note) && /2개/.test(F.q.note), '알림이 수수료 낱개 · 곳간을 말한다', F.q.note);
ok(/수수료 .*2개까지 내려면 22개가 있어야/.test(ON.feeShort.q || '') && ON.feeShort.woodUp === 0 && ON.feeShort.left === 20 && /22개가 있어야/.test(ON.feeShort.note),
  '수수료까지 못 내면 — 견적이 미리 말하고 실행이 같은 말로 막는다(곳간 · 손 그대로)', `${ON.feeShort.q} · ${ON.feeShort.note}`);

console.log('\n⑤ 곳간 = 거래로만 · 꺼내기는 촌장');
ok(ON.wdQ.took === 0 && ON.wdA.took === 0 && ON.wdCH.took === 2, '★비구성원 · 인정 구성원 꺼내기 0 · 촌장(사람 마을)만 2', `${ON.wdQ.took} · ${ON.wdA.took} · ${ON.wdCH.took} · ${ON.wdA.note}`);

console.log('\n⑥ 탈퇴 · 다시 들기 1시간');
ok(ON.quit.r === true && ON.quit.member === null && ON.quit.contrib === 12, '★`/탈퇴` — 소속 0 · 기여 12 그대로', JSON.stringify({ m: ON.quit.member, c: ON.quit.contrib }));
ok(Math.abs(ON.quit.cool - ON.t0 - 3600000) < 5000 && ON.quit.coolLeft > 3590000, '다시 들기 시각 = 지금 + 1시간(실시간 · 카드가 준 수)', `${ON.quit.cool - ON.t0}ms`);
ok(/1시간을 기다려야/.test(ON.quit.note) && /내 땅은 그대로/.test(ON.quit.note), '탈퇴 말 — 기다릴 시간 · 내 땅 그대로', ON.quit.note);
ok(ON.quitClaims.after === ON.quitClaims.before && ON.quitClaims.before === 3, '★탈퇴해도 영토 안 내 사유지 그대로(소멸 0)', JSON.stringify(ON.quitClaims));
ok(ON.quitClaim.got === 0, '★탈퇴 뒤 새로 잡기 · 넓히기 거부', ON.quitClaim.note);
ok(ON.rejoinEarly.member === null && /60분|1시간/.test(ON.rejoinEarly.note) && /뒤에 다시 들 수/.test(ON.rejoinEarly.note), '★1시간 안 `/가입` 거부 — 남은 시간 말', ON.rejoinEarly.note);
ok(ON.offerEarly.member === null && /뒤에 다시 들 수/.test(ON.offerEarly.note), '`/소속` 도 같은 술어', ON.offerEarly.note);
ok(ON.rejoin59.member === null && /1분/.test(ON.rejoin59.note), '59분 뒤 — 아직(1분 남음)', ON.rejoin59.note);
ok(ON.rejoin61.member === 3 && ON.rejoin61.rec === true && /이미 인정 구성원/.test(ON.rejoin61.note), '★1시간 뒤 다시 듦 · 기여가 남아 곧 인정', ON.rejoin61.note);

console.log('\n⑦ 추방도 다시 들기 1시간');
ok(ON.expelJoin.member === 0 && ON.expel.member === null && ON.expel.cool === true, '★촌장이 내보냄 → 다시 들기 시각이 선다', JSON.stringify(ON.expel));
ok(ON.expelRejoin.member === null && /뒤에 다시 들 수/.test(ON.expelRejoin.note), '추방 뒤 `/가입` 거부', ON.expelRejoin.note);
ok(ON.inviteRejoin.member === null && /뒤에 다시 들 수/.test(ON.inviteRejoin.note), '부름(`/초대` → `/수락`)도 같은 술어 — 막은 까닭을 그대로', ON.inviteRejoin.note);

console.log('\n⑧ 몸 왕복(재접속 · 넘기)');
ok(ON.body.has && ON.body.eq, '★다시 들기 시각이 `serializeBody` → `parseBody` 왕복에 산다', JSON.stringify(ON.body));
ok(ON.bodyNone.has === false, '시각이 없는 몸엔 칸도 없다(종전 바이트)', JSON.stringify(ON.bodyNone));
ok(ON.handoff.member === null && /뒤에 다시 들 수/.test(ON.handoff.note), '★이어받은 몸(넘기 · 재접속)도 다시 들기를 지킨다', ON.handoff.note);

console.log('\n⑨ 마을 화면 칸');
ok(ON.pub.open === true && ON.pub.rec === false && ON.pub.fee === 0.1, '`publicState` — open · 인정 · 수수료율', JSON.stringify(ON.pub));
const vvE = ON.vvE && typeof ON.vvE === 'object' ? ON.vvE : null, vvA = ON.vvA && typeof ON.vvA === 'object' ? ON.vvA : null;
ok(vvE && vvE.open === true && vvE.member === false && vvE.coolMin >= 59, '★화면 `me` — 추방된 사람: 가입 문 · 다시 들기 남은 분', JSON.stringify(ON.vvE));
ok(vvA && vvA.open === true && vvA.member === true && vvA.recognized === true && vvA.fee === 0.05, '화면 `me` — 인정 구성원 · 할인율', JSON.stringify(ON.vvA));

console.log('\n⑩ 끔 — 종전 소속 문');
ok(OFF.join.r === false && OFF.join.member === null, '★`/가입` 은 명령이 아니다(말로 흘러간다)', JSON.stringify(OFF.join));
ok(OFF.fee.q.rate === 0 && OFF.fee.a.rate === 0 && OFF.fee.q.qFee == null && OFF.fee.q.gave === 20, '수수료 0 — 견적 칸 없음 · 낸 나무 20 그대로', JSON.stringify(OFF.fee.q));
ok(OFF.quit.cool == null && OFF.pub.open == null, '탈퇴 뒤 다시 들기 0 · 화면 칸 0', JSON.stringify({ c: OFF.quit.cool, p: OFF.pub }));

console.log('\n⑪ 수수료 율 0(`T1137_FEE=0` 되돌림) — 종전 바이트');
ok(ZERO.fee.q.rate === 0 && ZERO.fee.a.rate === 0 && ZERO.fee.q.qFee == null && ZERO.fee.q.gave === 20 && ZERO.fee.a.gave === 20 && !/수수료/.test(ZERO.fee.q.note), '★율 0 = 견적 · 실행 · 알림에 수수료 0', ZERO.fee.q.note);
ok(ZERO.join.member === 3 && ZERO.inTerr12.got === 1 && ZERO.inTerrBefore.got === 0, '가입 · 인정 문은 수수료와 무관하게 선다', JSON.stringify({ j: ZERO.join.member, b: ZERO.inTerrBefore.got, a: ZERO.inTerr12.got }));

console.log('\n⑫ ★[T1151] 기본 5% · 인정 3% · 끝수 장부(사람 × 마을)');
const DF = DEF.fee;
ok(DF.q.rate === 0.05 && DF.b.rate === 0.05 && DF.a.rate === 0.03, '★손잡이 없음 = 기본 0.05 · 가입만 0.05 · 인정 구성원 0.03(★재민 "각각 5%, 3%")', `${DF.q.rate} / ${DF.b.rate} / ${DF.a.rate}`);
ok(DF.q.qFee === 1 && DF.q.gave === 21 && DF.a.qFee === 0 && DF.a.gave === 20, '20개 — 비구성원 20 × 0.05 = 1(낼 21) · 인정 20 × 0.03 = 0.6 → 지금 0 · 끝수 0.6(낼 20)', `${DF.q.qFee}/${DF.q.gave} · ${DF.a.qFee}/${DF.a.gave}`);
ok(/쌓인 수수료 0\.6 — 1이 되면 받습니다/.test(DF.a.note), '알림 — 쌓인 수수료 줄', DF.a.note);
const S = (DEF.owe && DEF.owe.seq) || [];
ok(!!DEF.pick && S.length === 21, '[상황] 한 개를 내도 한 개 이상 받는 짝이 있다(자명 통과 금지)', JSON.stringify(DEF.pick));
ok(S.length && S[0].gave === 1 && S[0].qFee === 0 && S[0].owe === 0.05 && S[0].qOwe === 0.05, '★1개 거래가 선다 — 수수료 0 · 끝수 0.05 쌓임(T1137 올림 판에선 2개가 있어야 했다)', JSON.stringify(S[0]));
const g19 = S.slice(0, 19).every((x, i) => x.gave === 1 && x.owe === Math.round((i + 1) * 5) / 100);
ok(g19, '1 ~ 19번째 — 낱개 1 · 끝수 0.05 씩 쌓임(0.95 까지)', S.slice(0, 19).map((x) => x.owe).join(' '));
ok(S[19] && S[19].qFee === 1 && S[19].gave === 2 && S[19].owe === 0 && /1개는 수수료로/.test(S[19].note), '★20번째 — 끝수가 1 이 되어 그 거래에서 1개 받음(낼 2) · 끝수 0', JSON.stringify(S[19]));
ok(S[20] && S[20].gave === 1 && S[20].owe === 0.05, '21번째 — 다시 쌓임', JSON.stringify(S[20]));
ok(S.every((x) => x.qFee === (x.gave - 1)), '★견적 = 실행(21번 모두 — 수수료 낱개)', S.map((x) => `${x.qFee}/${x.gave - 1}`).join(' '));
ok(S.reduce((a, x) => a + (x.gave - 1), 0) === 1 && S[20].owe === 0.05, '긴 눈 — 21거래 × 0.05 = 1.05 = 낸 1 + 끝수 0.05(정확히 5%)');
ok(DEF.oweBody.has && DEF.oweBody.v && DEF.oweBody.v[3] === 0.05 && DEF.oweBody.back && DEF.oweBody.back[3] === 0.05, '★재접속 · 넘기 — 끝수 장부가 몸 왕복(serializeBody → parseBody)에 산다', JSON.stringify(DEF.oweBody));
ok(DEF.oweAfter.before === 0.05 && DEF.oweAfter.owe === 0.1 && DEF.oweAfter.mine === 0.05, '이어받은 몸의 견적이 그 끝수에서 센다(0.05 → 0.1)', JSON.stringify(DEF.oweAfter));
ok(DEF.one.left === 0 && DEF.one.owe === 0.05, '★1개만 가진 사람도 거래한다(T1137 의 78건 막힘이 풀림)', JSON.stringify(DEF.one));
ok(DEF.oweNone.has === false, '끝수가 없는 몸엔 칸도 없다', JSON.stringify(DEF.oweNone));
ok(ON.owe && ON.owe.seq && ON.owe.seq[9] && ON.owe.seq[9].gave === 2 && ON.owe.seq[9].owe === 0, '율 0.1 판 — 10번째에 1개(같은 장부 · 율만 다르다)', ON.owe && JSON.stringify(ON.owe.seq[9]));

console.log(`\n=== ${pass}/${fail} ===`);
process.exit(fail ? 1 : 0);
