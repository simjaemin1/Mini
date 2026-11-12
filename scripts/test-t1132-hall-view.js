#!/usr/bin/env node
// @regress
// === scripts/test-t1132-hall-view.js — 곳간 재고 보기 문 하나 (T1132 · ★PM 11-03 판정대기 문 12 ㄱ) ==========================
//
// ★왜 — "보기는 가까이 온 누구나 · 꺼내기는 촌장 · 기부는 누구나". 종전엔 같은 곳간 재고를 두 문이 다르게 막았다:
//   마을 화면 「창고」 = 거리 문(`villages._villageNear` 260px · 가입 무관) ↔ 회관 패널 = 회관 200px + 그 마을 사람(`_furnaceCanUse`).
//   켬(`T1132_HALL_VIEW` 기본): 회관 패널 보기 · 기부 = 마을 화면과 같은 술어(`SimVillages.villageNear` — 그 함수 그대로) ·
//   그 마을 사람이 아니면 읽기 전용(`inv.viewOnly` · 이방인 받기 칸 없음 · 기부 칸 있음) · 꺼내기는 서버 문(`Membership.withdrawChief`)이 촌장만.
//
// ★자명 통과 금지 — 끔('0') 판이 같은 사람 · 같은 자리에서 종전처럼 막는 것(비회원 "볼 수 없습니다" · 회관 200px 밖 "너무 멀리")을 먼저 보인다.
// 판: `test-donate` 와 같은 가벼운 판(존 `__testBind` · 랩 econ 마을 다섯 · 정본 진입점 · 포트 0).
// 실행: node scripts/test-t1132-hall-view.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

if (process.env.T1132_SUB === 'zone') {
  const TMP = `/tmp/t1132-hall-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando'; process.env.PORT = '0'; process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.ONB_ENABLE = '1';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const done = (o) => { _log(JSON.stringify(o)); try { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) fs.unlinkSync(f); } catch (e) {} process.exit(0); };
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const econV2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const Events = require(SV('events.js'));
  const Onb = require(SV('onboarding.js'));
  const V = H.SimVillages;
  const out = { knob: process.env.T1132_HALL_VIEW == null ? null : process.env.T1132_HALL_VIEW, on: H.T1132_HALL_VIEW, errs: [] };
  (async () => {
    const world = econV2.createWorldV2({ seed: 7, villageCount: 5, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
    for (let d = 0; d < 200; d++) econV2.tickWorldV2(world);
    const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: V.playerVillageDepositMap() });
    L.prime(world);
    const P = V.__labProbe._memberProbe;
    const vils = world.villages.map((e, i) => ({ name: `랩마을${i}`, ccx: 100 + i * 40, ccy: 100, dbId: i, econ: e }));
    P.setup(L, vils);
    V.__labProbe._distProbe.setup(null, null, null, require(path.join(ROOT, 'sim', 'economy-sim')));
    const CHIEF = 'anon_t1132_chief';
    vils[0].econ.founder = CHIEF;
    const VK = require(SV('village-kin.js'));
    out.kin = VK.ON;
    if (VK.ON) for (const v of vils) VK.attach(v, {}, null);
    const AT = vils.map((v) => P.anchorPx(v));
    for (const v of vils) { v.econ.storage.food = 4000; v.econ.storage.wood = 500; }
    const HALL = 'b_t1132_hall';
    H.buildings.set(HALL, { id: HALL, type: 'village_hall', x: AT[0].x, y: AT[0].y, data: { x0: vils[0].ccx, y0: vils[0].ccy, villageDbId: 0, owner: CHIEF } });
    const msgs = new Map();
    const mkP = (playerId, dx, member) => {
      const p = { pid: `p_${playerId}`, playerId, name: playerId.replace('anon_t1132_', ''), persistent: false,
        x: AT[0].x + dx, y: AT[0].y, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100,
        inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
        isNpc: false, isDown: false, vx: 0, vy: 0, member: member ? { vid: 0 } : null };
      const box = []; msgs.set(playerId, box);
      p.ws = { readyState: 1, send: (s) => { try { box.push(JSON.parse(s)); } catch (e) {} } };
      const s = Onb.stateOf(playerId); s.start_vid = 0; s.arrived = 1; s.contrib = 0; s.lot_ok = 0; Onb.__probe.save(playerId, s);
      return p;
    };
    const safe = (tag, fn) => { try { return fn(); } catch (e) { out.errs.push(`${tag}:${String(e && e.message || e)}`); return null; } };
    const st = (res) => +(Number(vils[0].econ.storage[res || 'food']) || 0).toFixed(4);
    // 열기 한 번 — 받은 것(패널 칸 · 알림 끝 줄)
    const open = (p) => {
      const box = msgs.get(p.playerId); box.length = 0;
      safe('open', () => H.tryVillageInventory(p, HALL));
      const m = box.filter((o) => o.type === 'village_inventory').pop();
      const n = box.filter((o) => o.type === 'notice').map((o) => o.text).pop() || '';
      return m ? { open: true, viewOnly: !!m.inv.viewOnly, welcome: m.inv.welcome != null, donate: !!m.inv.donate, food: m.inv.foodEquiv != null } : { open: false, note: n };
    };
    const note = (p) => (msgs.get(p.playerId) || []).filter((o) => o.type === 'notice').map((o) => o.text).pop() || '';
    const gate = (p) => { const g = V.villageNear ? V.villageNear(0, p.x, p.y) : V.villageWithdrawGate(0, p.x, p.y); return !(g && g.err); };   // 마을 화면 문(같은 함수 · 끔 판엔 이름이 없어 게시판 문)
    //   마을 화면(`village-view.build`)이 지나는 문 = `villageBoard` 머리 두 줄(장부 · `_villageNear`) — 랩 판엔 게시판 몸통이 읽을 세계 날이 없어 같은 두 줄인 `villageWithdrawGate` 로 묻는다
    const view = (p) => { const b = V.villageWithdrawGate(0, p.x, p.y); return !(b && b.err); };
    // 사람 — 촌장(창설자 · 마을 사람) · 마을 사람(촌장 아님) · 남(그 마을 사람 아님) 셋을 거리마다
    const C0 = mkP(CHIEF, 0, true), M0 = mkP('anon_t1132_mem', 0, true);
    const O0 = mkP('anon_t1132_out', 0, false), O230 = mkP('anon_t1132_out230', 230, false), O250 = mkP('anon_t1132_out250', 250, false), O270 = mkP('anon_t1132_out270', 270, false), O400 = mkP('anon_t1132_out400', 400, false);
    out.chief = open(C0); out.member = open(M0);
    out.out0 = open(O0); out.out230 = open(O230); out.out250 = open(O250); out.out270 = open(O270); out.out400 = open(O400);
    out.same = [O0, O230, O250, O270, O400].map((p) => ({ dx: p.x - AT[0].x, hall: open(p).open, near: gate(p), view: view(p) }));
    // 기부 — 남(260px 안 · 회관 200px 밖)
    O230.inventory.wood = 3;
    { const w0 = st('wood'); safe('dep', () => H.tryVillageDeposit(O230, HALL, { wood: 3 })); out.dep230 = { up: +(st('wood') - w0).toFixed(4), left: O230.inventory.wood || 0, note: note(O230) }; }
    O400.inventory.wood = 3;
    { const w0 = st('wood'); safe('dep4', () => H.tryVillageDeposit(O400, HALL, { wood: 3 })); out.dep400 = { up: +(st('wood') - w0).toFixed(4), left: O400.inventory.wood || 0, note: note(O400) }; }
    // 꺼내기 — 서버 문(패널 단추가 없어도 메시지는 올 수 있다) · 남 · 마을 사람 = 거절 · 촌장 = 됨
    const wd = async (p, q) => { const s0 = st(); const r = safe('wd', () => H.tryVillageWithdraw(p, 0, 'food', q)); if (r && typeof r.then === 'function') await r; return { took: +(s0 - st()).toFixed(4), note: note(p) }; };
    out.wdOut = await wd(O0, 2); out.wdMem = await wd(M0, 2); out.wdChief = await wd(C0, 2);
  })().then(() => done(out)).catch((e) => { out.errs.push('top:' + String(e && e.stack || e).slice(0, 400)); done(out); });
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T1132_HALL_VIEW; delete e.T1132_SUB; return e; })();
const sub = (env) => {
  const txt = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T1132_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim();
  return JSON.parse(txt.split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1132 — 곳간 재고 보기 문 하나(보기 = 가까이 온 누구나 · 꺼내기 = 촌장 · 기부 = 누구나) ===');
const ON = sub({}), OFF = sub({ T1132_HALL_VIEW: '0' });
ok(ON.errs.length === 0 && OFF.errs.length === 0, '판 오류 0', JSON.stringify([ON.errs, OFF.errs]));
ok(ON.on === true && OFF.on === false && ON.kin === true, "손잡이 — 없음 = 켬 · '0' = 끔(마을 칸 T785 켬 판)");

console.log('\n⓪ 끔 — 종전 문(자명 통과 막기)');
ok(!OFF.out0.open && /볼 수 없습니다/.test(OFF.out0.note), '⓪ 끔 — 남은 회관 바로 앞에서도 못 본다', OFF.out0.note);
ok(!OFF.out230.open && /너무 멀리/.test(OFF.out230.note), '⓪ 끔 — 회관 200px 밖(230)은 거리로 막힌다', OFF.out230.note);
ok(OFF.chief.open && OFF.chief.welcome && !OFF.chief.viewOnly && OFF.member.open && !OFF.member.viewOnly, '⓪ 끔 — 촌장 · 마을 사람은 패널 그대로(이방인 받기 칸 있음)');

console.log('\n① 켬 — 보기는 가까이 온 누구나(마을 화면과 같은 260px 문)');
ok(ON.out0.open && ON.out0.viewOnly && !ON.out0.welcome && ON.out0.donate && ON.out0.food, '① 남 · 회관 앞 — 패널 열림 · 읽기 전용 · 이방인 받기 칸 없음 · 기부 칸 있음', JSON.stringify(ON.out0));
ok(ON.out230.open && ON.out250.open && ON.out250.viewOnly, '① 남 · 230 · 250px(회관 200px 밖 · 260px 안) — 열림', JSON.stringify([ON.out230, ON.out250]));
ok(!ON.out270.open && !ON.out400.open && /너무 멉니다/.test(ON.out270.note), '① 남 · 270 · 400px(260px 밖) — 안 열림', ON.out270.note);
ok(ON.same.every((r) => r.hall === r.near && r.hall === r.view), '① 같은 술어 — 거리마다 회관 패널 열림 = `villageNear` = 마을 화면 문(`villageBoard` 머리 · `villageWithdrawGate`)', JSON.stringify(ON.same));
ok(ON.chief.open && !ON.chief.viewOnly && ON.chief.welcome && ON.member.open && !ON.member.viewOnly, '① 촌장 · 마을 사람 — 종전 그대로(읽기 전용 아님 · 이방인 받기 칸)', JSON.stringify([ON.chief, ON.member]));

console.log('\n② 기부 = 누구나(같은 문) · 꺼내기 = 촌장(서버 문)');
ok(ON.dep230.up === 3 && ON.dep230.left === 0, '② 남 · 230px — 회관 패널 기부 됨(곳간 +3)', JSON.stringify(ON.dep230));
ok(ON.dep400.up === 0 && ON.dep400.left === 3, '② 남 · 400px — 기부 안 됨(같은 문 밖)', JSON.stringify(ON.dep400));
ok(OFF.dep230.up === 0 && /너무 멀리/.test(OFF.dep230.note), '② 끔 — 230px 기부는 회관 200px 문으로 막힌다(종전)', OFF.dep230.note);
ok(ON.wdOut.took === 0 && ON.wdMem.took === 0 && /촌장/.test(ON.wdOut.note), '② 꺼내기 — 남 · 마을 사람(촌장 아님)은 서버가 거절', JSON.stringify([ON.wdOut, ON.wdMem]));
ok(ON.wdChief.took > 0 && OFF.wdChief.took === ON.wdChief.took && OFF.wdOut.took === 0, '② 꺼내기 — 촌장은 됨 · 켬 · 끔 같다(이 손잡이 밖)', JSON.stringify([ON.wdChief, OFF.wdChief]));

console.log('\n③ 글자');
{
  const Z = fs.readFileSync(SV('zone.js'), 'utf8'), C = fs.readFileSync(path.join(ROOT, 'public', 'client', '51-s-side.js'), 'utf8'), VV = fs.readFileSync(SV('villages.js'), 'utf8');
  ok(/const T1132_HALL_VIEW = process\.env\.T1132_HALL_VIEW !== '0';/.test(Z), '③ 손잡이 글자(켬 기본 · `=0` 끔)');
  ok(/villageNear: _villageNear,/.test(VV) && /SimVillages\.villageNear\(/.test(Z) && !/EV_BRIEF_PX/.test(Z), '③ 문은 villages.js `_villageNear` 그 함수(존이 거리 수를 따로 안 쥔다)');
  ok(/inv\.viewOnly/.test(C) && !/village_withdraw/.test(C), '③ 화면 — 읽기 전용 줄 · 회관 패널엔 꺼내기 단추가 없다');
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
