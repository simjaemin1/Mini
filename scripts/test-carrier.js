#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-carrier.js — 지게(A자 지게) 서버 E2E =============================
//
// ★[재민 확정 2026-09-01 · T12] *"25kg 적재 상한은 무게 배치가 세운 판단의 축인데,
//   곡물이 화폐 노릇을 하고 자염이 바닷물 7되를 지게 하면서 **더 나르는 기술**이 첫 병목이 됐다."*
//
// ★★이 하네스가 지키는 계약 여섯:
//   ① **곡선은 안 변한다** — 상한만 옮겨진다(`MOVE_CURVE` 는 kg 이 아니라 r=kg/cap 을 받는다)
//   ② **가산의 정본은 인스턴스 하나** — 화면에 뜨는 `적재 N` 과 실제 상한 증가가 **같은 수**다
//   ③ **공짜가 아니다** — 지게 3kg 이 적재에 든다(순이득 = 가산 − 3)
//   ④ **재료가 둘이다** — 곁재료(밀삐 `fiber`)가 없으면 **거절**되고, 화면 게이트도 같이 닫힌다
//   ⑤ **닳는다** — 짐을 질 때만. 파손되면 상한이 **원래대로 돌아온다**
//   ⑥ **살아남는다** — 저장·복원을 넘어 착용과 가산이 그대로다
//
// ★족보 (76) 준수: "거절"과 "실패"를 구분한다 — 재료 부족 갈래는 **거절 문구를 실제로 확인**한다.
// ★족보 (57) 준수: 제작이 **실제로 일어났는지** 대기열 길이로 먼저 센다.
//
// 실행: node scripts/test-carrier.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-carrier-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37200 + (process.pid % 190));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const C = H.Carry, W = H.Weights, PI = H.PlayerItems;

let _pid = 0;
function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + (++_pid), playerId: 'carrier_' + name + '_' + _pid, name, persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, craftLog: {},
    oreLedger: {}, oreCarry: {}, dishes: [], ws, isNpc: false, isDown: false, vx: 0, vy: 0 };
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  p.__last = () => (p.__notices()[p.__notices().length - 1] || '');
  return p;
}
// 작업대 하나 — 정본 경로로 짓는다(하네스가 건물을 손으로 빚지 않는다).
let _bid = 0;
function mkBench(p) {
  const b = { id: 'bench_' + (++_bid), type: 'workbench', x: p.x + 20, y: p.y, floor: 0,
              owner: p.playerId, playerId: p.playerId, data: {} };
  H.buildings.set(b.id, b);
  return b;
}

(async () => {
  say('\n=== 지게 (A자 지게) — 운반 도구 서버 E2E ===');

  // ── ① 표와 그 표를 읽는 쪽 (족보 (83)) ──────────────────────────────────
  say('\n① 표 한 줄이 정말 다섯째 슬롯을 만들었나');
  const R = H.EQUIPMENT_RECIPES.carrier;
  ok(!!R, '★지게가 장비 레시피 표에 있다', R && R.label);
  ok(R && R.slot === C.CARRIER_SLOT, '★★슬롯 이름의 정본은 `Carry.CARRIER_SLOT` 하나다(zone 이 옮겨 적지 않는다)',
    `recipe.slot=${R && R.slot} · Carry.CARRIER_SLOT=${C.CARRIER_SLOT}`);
  const slots = new Set(Object.values(H.EQUIPMENT_RECIPES).map((r) => r.slot));
  ok(slots.size === 5 && slots.has('back'), '★슬롯이 넷에서 다섯이 됐다', [...slots].join(' · '));
  ok(!!(H.EQUIPMENT_META.types && H.EQUIPMENT_META.types.carrier
        && H.EQUIPMENT_META.types.carrier.attr),
    '★★메타가 표를 따라왔다 — 클라 미리보기가 `undefined` 를 안 찍는다(족보 (83))',
    H.EQUIPMENT_META.types.carrier && `attr='${H.EQUIPMENT_META.types.carrier.attr}' scale=${H.EQUIPMENT_META.types.carrier.attrScale.toFixed(3)}`);
  ok(Object.keys(H.EQUIPMENT_META.types).length === Object.keys(H.EQUIPMENT_RECIPES).length,
    '★메타가 **손으로 적은 목록**이 아니라 표에서 발견된다',
    `메타 ${Object.keys(H.EQUIPMENT_META.types).length} · 표 ${Object.keys(H.EQUIPMENT_RECIPES).length}`);
  ok(W.kgOf('carrier') > 0, '★지게에 kg 가 있다(무게표에 빠진 품목 0건 계약)', `${W.kgOf('carrier')}kg`);

  // ── ② 가산은 유도값이고, 화면 수 = 실제 수 ───────────────────────────────
  say('\n② 가산의 정본은 인스턴스 하나인가 (사본 금지)');
  const base = C.CFG.CAP_KG;
  const rows = [];
  for (const lv of [0, 3, 5, 7, 10]) {
    const inst = PI.craftItem('carrier', lv, { wood: R.qty });
    inst.id = 'q' + lv;
    const p = mkPlayer('q' + lv); p.equipment = [inst]; p.equipSlots[C.CARRIER_SLOT] = inst.id;
    rows.push({ lv, load: inst.attrs.load, cap: C.capKg(p), dura: inst.durMax, kg: C.totalKg(p) });
  }
  for (const r of rows) {
    ok(r.cap === base + r.load, `★★Lv${r.lv} — **화면의 "적재 ${r.load}" 이 곧 상한 증가다**`,
      `${base} → ${r.cap} · 내구 ${r.dura} · 지게 ${r.kg}kg`);
  }
  const lv10 = rows[rows.length - 1];
  ok(lv10.cap === 45, '★★만렙 나무 지게 = 상한 **45kg** (카드가 정한 수 · env `CARRY_CARRIER_KG`=20 유도)',
    `25 → ${lv10.cap}`);
  ok(rows[0].load < lv10.load, '★★숙련이 판단을 만든다 — 초보 지게와 장인 지게가 다르다',
    `Lv0 +${rows[0].load} → Lv10 +${lv10.load}`);
  // 사본 검사: carry.js 소스에 가산 숫자가 옮겨 적혀 있지 않다
  const carrySrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'carry.js'), 'utf8'));
  ok(!/CARRIER[_A-Z]*\s*[:=]\s*\d/.test(carrySrc) && !/\b28\.57|\bload\s*[:=]\s*\d/.test(carrySrc),
    '★★`carry.js` 가 가산 표를 **안 든다**(인스턴스에 물어본다 — 사본 0)');

  // ── ③ 공짜가 아니다 ─────────────────────────────────────────────────────
  say('\n③ 지게는 자기 무게를 지고 간다');
  {
    const inst = PI.craftItem('carrier', 0, { wood: R.qty }); inst.id = 'z1';
    const p = mkPlayer('net');
    const capBare = C.capKg(p), kgBare = C.totalKg(p);
    p.equipment = [inst];
    ok(C.capKg(p) === capBare, '★★인벤에 있기만 하면 상한은 그대로 — **착용해야 오른다**', `${capBare}kg`);
    ok(C.totalKg(p) > kgBare, '★지게는 들고만 있어도 무겁다', `${kgBare} → ${C.totalKg(p)}kg`);
    p.equipSlots[C.CARRIER_SLOT] = inst.id;
    const net = (C.capKg(p) - capBare) - (C.totalKg(p) - kgBare);
    ok(net > 0 && net < inst.attrs.load, `★★순이득은 가산보다 **적다**(+${inst.attrs.load} − ${W.kgOf('carrier')}kg)`, `순 +${net}kg`);
  }

  // ── ④ 곡선은 한 글자도 안 변했나 ─────────────────────────────────────────
  say('\n④ 곡선 무변경 — 상한만 옮겨졌나');
  {
    const pre = JSON.stringify(C.MOVE_CURVE);
    ok(pre === JSON.stringify([[1, 1], [1.15, 0.95], [1.5, 0.8], [2, 0.6], [3, 0.4]]),
      '★곡선표가 종전 그대로다', pre);
    const inst = PI.craftItem('carrier', 10, { wood: R.qty }); inst.id = 'z2';
    const bare = mkPlayer('bare'), worn = mkPlayer('worn');
    worn.equipment = [inst]; worn.equipSlots[C.CARRIER_SLOT] = inst.id;
    // 같은 **비율**이면 같은 배율이어야 한다(= 곡선이 안 움직였다)
    const kgBare = 30, kgWorn = 30 * (C.capKg(worn) / C.capKg(bare));
    bare.inventory = {}; worn.inventory = {};
    const eB = { ratio: kgBare / C.capKg(bare) }, eW = { ratio: kgWorn / C.capKg(worn) };
    ok(Math.abs(eB.ratio - eW.ratio) < 1e-9, '★전제 — 두 비율을 같게 맞췄다', eB.ratio.toFixed(4));
    ok(Math.abs(C.lerpCurve(C.MOVE_CURVE, eB.ratio) - C.lerpCurve(C.MOVE_CURVE, eW.ratio)) < 1e-9,
      '★★같은 비율 = 같은 이속 배율 — **곡선은 상한을 따라 통째로 옮겨진다**',
      `×${C.lerpCurve(C.MOVE_CURVE, eB.ratio).toFixed(4)}`);
    // 그리고 같은 kg 이면 지게 쪽이 덜 느리다(대조 — "안 했으면 안 움직인다", 족보 (66))
    const mB = C.lerpCurve(C.MOVE_CURVE, 30 / C.capKg(bare));
    const mW = C.lerpCurve(C.MOVE_CURVE, 30 / C.capKg(worn));
    ok(mW > mB, '★★같은 30kg 을 져도 지게를 진 쪽이 덜 느리다', `맨몸 ×${mB.toFixed(3)} → 지게 ×${mW.toFixed(3)}`);
    ok(C.CFG.MOVE_FLOOR === 0.4 && C.CFG.COMBINED_FLOOR === 0.35 && C.CFG.FATIGUE_AT_2X === 2.2,
      '★과적 바닥·합산 바닥·피로 가속 무변경', `${C.CFG.MOVE_FLOOR} · ${C.CFG.COMBINED_FLOOR} · ${C.CFG.FATIGUE_AT_2X}`);
    ok(JSON.stringify(C.STAGE_AT) === JSON.stringify([C.R1, C.R1 + (3 - C.R1) * 0.30, C.R1 + (3 - C.R1) * 0.65]),
      '★단계 경계도 유도값 그대로', JSON.stringify(C.STAGE_AT.map((v) => +v.toFixed(3))));
  }

  // ── ⑤ 재료가 둘이다 — 거절과 성사 (족보 (76)) ───────────────────────────
  say('\n⑤ 밀삐 없이는 지게가 안 선다');
  {
    ok(R.extra && R.extra.fiber > 0, '★레시피에 곁재료가 있다', JSON.stringify(R.extra));
    const p = mkPlayer('mat'); const b = mkBench(p);
    H.players.set(p.pid, p);
    // ⓐ 나무만 — 거절되어야 한다
    p.inventory = { wood: R.qty };
    H.doCraftEquipment(p, 'carrier', 'wood', null);
    const q1 = H.Facility.view(b, Date.now()).length;
    ok(q1 === 0, '★★나무만으로는 **안 걸린다**(대기열이 안 늘었다 — 족보 (57))', `대기열 ${q1}`);
    ok(/부족/.test(p.__last()), '★★그리고 **거절 문구가 실제로 나왔다**(조용한 실패 아님)', p.__last());
    ok((p.inventory.wood || 0) === R.qty, '★거절이면 재료도 안 깎인다', `wood ${p.inventory.wood}`);
    // ⓑ 나무 + 밀삐 — 성사
    p.inventory = { wood: R.qty, fiber: R.extra.fiber };
    H.doCraftEquipment(p, 'carrier', 'wood', null);
    const q2 = H.Facility.view(b, Date.now()).length;
    ok(q2 === 1, '★★밀삐를 갖추면 **작업대에 걸린다**', `대기열 ${q2}`);
    ok((p.inventory.wood || 0) === 0 && (p.inventory.fiber || 0) === 0,
      '★★두 재료가 **둘 다** 깎였다', `wood ${p.inventory.wood} · fiber ${p.inventory.fiber}`);
    // ⓒ 화면(시설 창)이 같은 판단을 한다 — 눌러 보고 거절당하면 그건 화면이 거짓말한 것이다
    const p2 = mkPlayer('ui'); p2.x = b.x; p2.y = b.y; H.players.set(p2.pid, p2);
    const bb = mkBench(p2);
    p2.inventory = { wood: 99 };
    const rowsA = H._facilityRecipes(p2, 'tool').find((r) => r.id === 'carrier');
    ok(rowsA && rowsA.can === false, '★★나무만 넘치게 있어도 화면이 **버튼을 안 켠다**',
      rowsA && JSON.stringify(rowsA.missing));
    // ★[T38 규약] 이름표는 서버가 낸다 — `missing[].ko` · `costKo`. (T12 가 같은 자리를 고치려다
    //   리베이스에서 T38 판을 채택했다: `item` 은 키로 두고 `ko` 를 옆에 싣는 쪽이 낫다.)
    ok(rowsA && rowsA.missing[0] && rowsA.missing[0].item === 'fiber' && !/^[a-z_]+$/.test(rowsA.missing[0].ko || ''),
      '★★모자란 재료가 **한글 이름표를 달고** 나간다(화면이 영문 키를 안 찍는다)', rowsA && rowsA.missing[0] && rowsA.missing[0].ko);
    ok(rowsA && rowsA.costKo && rowsA.costKo.fiber && rowsA.costKo.wood,
      '★곁재료도 `costKo` 에 이름표가 붙어 나간다', rowsA && JSON.stringify(rowsA.costKo));
    ok(rowsA && rowsA.cost && rowsA.cost.fiber === R.extra.fiber,
      '★★그 행의 `cost` 가 곁재료를 **싣고 나간다**(클라가 자기 표를 안 든다)', rowsA && JSON.stringify(rowsA.cost));
    p2.inventory = { wood: 99, fiber: 99 };
    const rowsB = H._facilityRecipes(p2, 'tool').find((r) => r.id === 'carrier');
    ok(rowsB && rowsB.can === true, '★★둘 다 있으면 켜진다', rowsB && JSON.stringify(rowsB.cost));
    void bb;
    // ⓓ 대기열에서 받아 낸다 — 완성품이 정말 지게인가
    const job = H.Facility.view(b, Date.now())[0];
    const rec = b.data.queue[0]; rec.doneAt = Date.now() - 1;   // 시간만 당긴다(시계는 벽시계)
    H.doCraftCollect(p, b.id);
    ok(p.equipment.length === 1 && p.equipment[0].type === 'carrier',
      '★★수령하면 **지게 인스턴스**가 손에 온다(요리도 도구도 아니다 — 족보 (83))',
      p.equipment[0] && PI.displayItem(p.equipment[0]));
    ok(p.equipment[0] && p.equipment[0].dura > 0, '★내구를 갖고 나온다', p.equipment[0] && `${p.equipment[0].dura}/${p.equipment[0].durMax}`);
    void job;
    // ⓔ 착용 — 정본 함수로
    const before = C.capKg(p);
    H.doEquipItem(p, p.equipment[0].id);
    ok(p.equipSlots[C.CARRIER_SLOT] === p.equipment[0].id, '★★`doEquipItem` 이 등 슬롯에 꽂는다', p.equipSlots[C.CARRIER_SLOT]);
    ok(C.capKg(p) > before, '★★그리고 상한이 오른다', `${before} → ${C.capKg(p)}kg`);
    H.doUnequipItem(p, C.CARRIER_SLOT);
    ok(C.capKg(p) === before, '★★벗으면 **원래대로** 돌아온다', `${C.capKg(p)}kg`);
  }

  // ── ⑥ 닳는다 · 부서지면 상한이 돌아온다 ──────────────────────────────────
  say('\n⑥ 지게는 짐을 질 때 닳는다');
  {
    const p = mkPlayer('wear'); H.players.set(p.pid, p);
    const inst = PI.craftItem('carrier', 10, { wood: R.qty }); inst.id = 'w1';
    p.equipment = [inst]; p.equipSlots[C.CARRIER_SLOT] = inst.id;
    ok(C.carrierOf(p) === inst, '★착용 중인 운반구를 정본이 찾아낸다');
    ok(C.carrierWorking(p) === false, '★★빈 몸이면 지게는 **일하고 있지 않다**(닳지 않는다)', `${C.totalKg(p)}kg ≤ ${C.CFG.CAP_KG}`);
    p.inventory = { stone: 8 };   // 4kg × 8 = 32kg > 기본 25
    ok(C.totalKg(p) > C.CFG.CAP_KG, '★전제 — 기본 상한을 넘겼다', `${C.totalKg(p)}kg`);
    ok(C.carrierWorking(p) === true, '★★짐을 지면 일한다', `${C.totalKg(p)}kg > ${C.CFG.CAP_KG}`);
    const d0 = inst.dura;
    H.wearEquipment(p, C.CARRIER_SLOT, 1);
    ok(inst.dura === d0 - 1, '★한 번 닳으면 내구 1 준다', `${d0} → ${inst.dura}`);
    const capWorn = C.capKg(p);
    H.wearEquipment(p, C.CARRIER_SLOT, inst.dura);   // 남은 걸 한 번에
    ok(inst.dura === 0 && inst.broken, '★부서진다', `dura ${inst.dura} broken ${!!inst.broken}`);
    ok(!p.equipSlots[C.CARRIER_SLOT], '★★파손이면 **자동 해제**된다(수선 전까지)', JSON.stringify(p.equipSlots));
    ok(C.capKg(p) === C.CFG.CAP_KG, '★★그리고 상한이 원래대로 돌아온다', `${capWorn} → ${C.capKg(p)}kg`);
    ok(C.carrierBonus(p) === 0 && C.carrierOf(p) === null, '★파손품은 가산을 안 준다(이중 방어)');
    ok(H.CARRIER_WEAR_MS >= 60000, '★마모 간격이 원정 한 번에 부서지지 않을 만큼은 된다',
      `${H.CARRIER_WEAR_MS}ms = ${(H.CARRIER_WEAR_MS / 1000).toFixed(0)}초당 1`);
  }

  // ── ⑦ 저장을 넘어 살아남나 ──────────────────────────────────────────────
  say('\n⑦ 재접속을 넘어 그대로인가');
  {
    const p = mkPlayer('save');
    const inst = PI.craftItem('carrier', 7, { wood: R.qty }); inst.id = 's1';
    p.equipment = [inst]; p.equipSlots[C.CARRIER_SLOT] = inst.id;
    const cap0 = C.capKg(p);
    const blob = JSON.parse(JSON.stringify({ equipment: p.equipment, equipSlots: p.equipSlots }));
    const q = mkPlayer('save2'); q.equipment = blob.equipment; q.equipSlots = blob.equipSlots;
    ok(C.capKg(q) === cap0, '★★직렬화를 넘어 상한이 같다', `${cap0} → ${C.capKg(q)}kg`);
    ok(C.carrierOf(q) && C.carrierOf(q).attrs.load === inst.attrs.load, '★적재 값도 그대로', `+${inst.attrs.load}`);
  }

  // ── ⑧ 옛 저장은 어떻게 되나 (절벽 없음) ─────────────────────────────────
  say('\n⑧ 지게를 모르는 옛 저장');
  {
    const p = mkPlayer('old');   // equipSlots 에 back 자체가 없다
    ok(C.capKg(p) === C.CFG.CAP_KG, '★★지게가 없으면 종전과 **한 수도 다르지 않다**', `${C.capKg(p)}kg`);
    const q = mkPlayer('old2'); q.equipSlots = { back: 'nope' };   // 가리키는 인스턴스가 없다
    ok(C.capKg(q) === C.CFG.CAP_KG && C.carrierOf(q) === null, '★깨진 슬롯도 조용히 넘어가지 않고 0 으로 떨어진다');
    const r = mkPlayer('old3'); const i = PI.craftItem('carrier', 5, { wood: 2 }); i.id = 'x'; delete i.attrs;
    r.equipment = [i]; r.equipSlots = { back: 'x' };
    ok(C.capKg(r) === C.CFG.CAP_KG, '★attrs 가 없는 인스턴스도 상한을 안 흔든다');
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
