#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1066-village-fire.js — 움집 화덕(보이는 불)도 모닥불이다: 요리 · 몸 데우기 [T1066] ==========
//
// ★왜 [★재민 11-01 "마을 집마다 모닥불처럼 생긴 것도 모닥불 판정으로 요리" · PM 판정: 결함] 클라는 움집(바닥 행 `data.hut` 태그)마다
//   마당 화덕 · 실내 화덕을 그린다. 서버의 불 술어(요리 시설 · 몸 데우기)는 `campfire` 건물만 봤다 — 그려진 불이 불이 아니었다.
//   손잡이 `T1066_VILLAGE_FIRE`(켬 기본 후보 · `=0` 종전): 두 화덕 자리를 모닥불 시설 목록에 싣는다(같은 목록 · 같은 술어).
//
// 재는 것(존을 아이 프로세스 안에서 띄운다 · 켬 = env 없음 · 끔 = `=0` · 같은 걸음):
//   ① 술어 — `!== '0'` · env 읽는 자리 하나 · 화덕 자리 표 = 클라 그림 자리(34-m-renderloop 마당 `['yard_hearth', -2, 2]` ·
//      36-r2-building 실내 `_dx === -2 && _dy === -3`(앵커 y1 + 2) → (−2, −1)) — 클라가 옮기면 이 줄이 문다
//   ② 마을 집(주인 `npc_simvil_*`) 마당 화덕 곁: 켬 — 요리가 얹힌다(재료가 나가고 대기열이 캐리어 바닥 행 data 에 선다) · 다 되면 그 화덕 id 로 받는다
//      ★끔(`=0`) — 같은 자리 같은 사람이 "모닥불·화덕 앞에서만" 으로 거절된다(재료 그대로 · 결함이 보인다 · 자명 통과 금지)
//   ③ 몸 데우기 — 켬: 마당 · 실내 화덕 곁이면 `isNearCampfire` 참 · 반경(100px) 밖은 거짓 · 끔: 거짓
//   ④ 누구 불인가 — 마을 집 불 = 이방인도 요리 · 사유 움집(주인 = 플레이어) 불 = 주인만(남은 "내 것이 아니다")
//   ⑤ 창 — 화덕이면 `facility.near.hearth` 가 선다(클라가 창을 저절로 안 연다 · 마을을 지날 때마다 안 뜨게)
//
// 실행: node scripts/test-t1066-village-fire.js   (아이 둘 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.T1066_SUB === '1') {
  (async () => {
    const TMP = `/tmp/test-t1066-${process.pid}.db`;
    const rmTmp = () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } };
    rmTmp(); process.on('exit', rmTmp);
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(38400 + (process.pid % 90)), DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0',
      ENABLE_BANDITS: '0', ENABLE_ROADS: '0', CRAFT_COOK_MS: '300' });
    const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
    const Zone = require(path.join(ROOT, 'server', 'zone.js'));
    const H = Zone.__testBind();
    const HH = require(path.join(ROOT, 'server', 'hut-hearth.js'));
    const SZ = H.BUILDING_SIZE;
    // 움집 둘 — 마을 집(npc_simvil_7) · 사유 움집(주인 tc_own) · 캐리어 바닥 한 칸씩(발자국 남동단 = 태그 (x1, y1))
    const mkHut = (id, x1, y1, owner) => { const hut = [x1 - 5, y1 - 3, x1, y1];
      const b = { id, dbId: null, type: 'floor', ownerId: owner, ownerName: owner, x: x1 * SZ + SZ / 2, y: y1 * SZ + SZ / 2, floor: 0, data: { floor: 0, hut } };
      H.buildings.set(id, b); return b; };
    const vil = mkHut('t1066v', 160, 160, 'npc_simvil_7');
    const own = mkHut('t1066p', 200, 160, 'tc_own');
    const mkP = (name, x, y, inv) => { const msgs = []; return { pid: 'p_' + name, playerId: 'tc_' + name, name, persistent: false,
      ws: { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } }, _msgs: msgs, x, y, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
      hunger: 100, thirst: 100, inventory: Object.assign({}, inv), equipment: [], equipSlots: {}, craftSkill: {}, dishes: [] }; };
    const note = (p) => (p._msgs.filter((m) => m.type === 'notice').map((m) => m.text).slice(-1)[0] || '');
    const [vy, vin] = HH.hearthsOf(vil.data.hut, SZ);
    const [py] = HH.hearthsOf(own.data.hut, SZ);
    const out = { on: H.T1066_VILLAGE_FIRE };
    // ② 마을 집 마당 화덕 곁 요리
    const a = mkP('stranger', vy.x + 10, vy.y, { berry: 3 });
    H.doCook(a, 'berry_jam');
    const fc = H.facilityFor(a, 'cook');
    out.cook = { berry: a.inventory.berry || 0, note: note(a), fc: fc ? { id: fc.b.id, hearth: fc.b.hearth || null, ko: fc.ko } : null,
      q: (((vil.data.t1066 || {}).yard || {}).queue || []).length };
    await sleep(450);
    if (fc) H.doCraftCollect(a, fc.b.id);
    out.collect = { q: (((vil.data.t1066 || {}).yard || {}).queue || []).length, note: note(a), byId: !!(fc && H._facilityById(fc.b.id)) };
    // ③ 몸 데우기
    const w = (x, y) => H.isNearCampfire({ x, y, floor: 0 });
    out.warm = { yard: w(vy.x + 30, vy.y), indoor: w(vin.x, vin.y - 20), far: w(vy.x + 150, vy.y + 150) };
    // ④ 사유 움집 화덕 — 남 · 주인
    const s = mkP('s2', py.x + 10, py.y, { berry: 3 });
    H.doCook(s, 'berry_jam');
    const o = mkP('own', py.x + 10, py.y, { berry: 3 });
    H.doCook(o, 'berry_jam');
    out.priv = { stranger: s.inventory.berry || 0, strangerNote: note(s), owner: o.inventory.berry || 0 };
    // ⑤ 창
    const c = mkP('win', vy.x + 5, vy.y, {});
    H.sendFacility(c);
    const fm = c._msgs.filter((m) => m.type === 'facility').slice(-1)[0];
    out.win = fm && fm.near ? { btype: fm.near.btype, hearth: fm.near.hearth || null, mine: fm.near.mine } : null;
    _l(JSON.stringify(out));
    process.exit(0);
  })().catch((e) => { process.stdout.write(JSON.stringify({ err: String(e && e.stack) }) + '\n'); process.exit(1); });
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const C34 = fs.readFileSync(path.join(ROOT, 'public', 'client', '34-m-renderloop.js'), 'utf8');
const C36 = fs.readFileSync(path.join(ROOT, 'public', 'client', '36-r2-building.js'), 'utf8');
const HH = require(path.join(ROOT, 'server', 'hut-hearth.js'));
console.log('\n=== 움집 화덕(보이는 불)도 모닥불이다 (T1066) ===\n');
console.log('① 술어 · 자리 표');
ok(/const T1066_VILLAGE_FIRE = process\.env\.T1066_VILLAGE_FIRE !== '0';/.test(SRC), '`T1066_VILLAGE_FIRE` 는 `!== \'0\'` — 켬 기본 후보 · 되돌림 `=0`');
ok((SRC.match(/process\.env\.T1066_VILLAGE_FIRE/g) || []).length === 1, 'env 를 읽는 자리 하나');
const Y = HH.HEARTHS.find((e) => e.key === 'yard'), I = HH.HEARTHS.find((e) => e.key === 'in');
const m34 = C34.match(/\['yard_hearth', (-?\d+), (-?\d+)\]/), m36 = C36.match(/_dx === (-?\d+) && _dy === (-?\d+)\)/);
ok(m34 && +m34[1] === Y.dx && +m34[2] === Y.dy, '마당 화덕 = 클라 마당 소품 자리 그대로(캐리어 (x1, y1) + (−2, +2))', m34 && `${m34[1]},${m34[2]} ↔ ${Y.dx},${Y.dy}`);
ok(m36 && +m36[1] === I.dx && +m36[2] + 2 === I.dy, '실내 화덕 = 클라 실내 앵커(x1, y1 + 2) 상대 그 자리 그대로(→ (−2, −1))', m36 && `${m36[1]},${m36[2]}(+2) ↔ ${I.dx},${I.dy}`);
ok(/HutHearth\.isCarrier\(b, BUILDING_SIZE\)/.test(SRC) && /_t1066Hearths\(b\)/.test(SRC), '화덕은 시설 목록(`_facilities`)에 실린다 — 요리 창 · 대기열 · 데우기가 같은 목록(사본 0)');
const sub = (env) => { const E = { ...process.env, T1066_SUB: '1' }; delete E.T1066_VILLAGE_FIRE; Object.assign(E, env);
  const r = spawnSync(process.execPath, [__filename], { env: E, encoding: 'utf8', timeout: 300000 });
  const line = (r.stdout || '').split('\n').filter((l) => l.startsWith('{')).pop(); return line ? JSON.parse(line) : { err: (r.stderr || '').slice(-400) }; };
const on = sub({}), off = sub({ T1066_VILLAGE_FIRE: '0' });
if (on.err || off.err) console.log('  아이 오류:', on.err || off.err);
ok(on.on === true && off.on === false, '아이 판 손잡이 — env 없음 = 켬 · `=0` = 끔', `${on.on} · ${off.on}`);
console.log('② 마을 집 마당 화덕 곁 요리');
ok(on.cook && on.cook.berry === 0 && on.cook.q === 1 && on.cook.fc && on.cook.fc.hearth === 'yard', '★켬 — 요리가 얹힌다(재료가 나가고 대기열이 캐리어 바닥 행 data 에 선다 · 시설 = 마당 화덕)', on.cook && `${on.cook.note}`);
ok(on.collect && on.collect.q === 0 && on.collect.byId, '켬 — 다 되면 그 화덕 id 로 받는다(대기열이 빈다)', on.collect && on.collect.note);
ok(off.cook && off.cook.berry === 3 && off.cook.fc === null && /모닥불·화덕 앞에서만/.test(off.cook.note), '★끔(`=0`) — 같은 자리 같은 사람이 거절된다(재료 그대로 · 종전 — 결함이 보인다)', off.cook && off.cook.note);
console.log('③ 몸 데우기');
ok(on.warm && on.warm.yard && on.warm.indoor && !on.warm.far, '켬 — 마당 · 실내 화덕 곁은 데운다 · 반경 밖은 아니다', on.warm && JSON.stringify(on.warm));
ok(off.warm && !off.warm.yard && !off.warm.indoor, '끔 — 화덕 곁도 안 데운다(종전)', off.warm && JSON.stringify(off.warm));
console.log('④ 누구 불인가');
ok(on.priv && on.priv.stranger === 3 && /내 것이 아니다/.test(on.priv.strangerNote) && on.priv.owner === 0, '켬 — 사유 움집 화덕은 주인만(남은 "내 것이 아니다") · 마을 집 화덕은 이방인도(②)', on.priv && on.priv.strangerNote);
console.log('⑤ 창');
ok(on.win && on.win.btype === 'campfire' && on.win.hearth === 'yard' && on.win.mine === true, '켬 — 창 페이로드에 `hearth` 가 선다(클라가 저절로 안 연다)', on.win && JSON.stringify(on.win));
ok(!off.win, '끔 — 화덕 곁에 창이 없다(종전)');
console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
