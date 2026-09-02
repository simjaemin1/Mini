#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-salt.js — 자염(煮鹽): 갯벌·물병·소금가마 (서버 직접) ===========
//
// ★[재민 확정 2026-09-01 ①] 소금이 세계에 생긴다. 부패 배치가 절임을 만들다 막힌 그 조달이다.
//
// ★★**픽스처 족보 — 해안 판정을 우회로 박지 않는다.**
//   이 하네스는 `isSea` 를 **한 번도 손으로 만들지 않는다.** 갯벌 자리는 실서버의
//   `zone.isSeaTileLocal`(= 해안선 타일 ∖ 강·호수)로 **찾아서** 쓴다. 만약 여기서
//   `isSea: () => true` 같은 가짜를 넣으면 ①은 "내가 참이라고 한 것이 참이다"가 되어
//   **아무것도 검사하지 않는다**(족보 ㊻ 픽스처가 검사 대상을 오염시키지 않는지 보라).
//
// ★★**검사 상황 선행 assert** — 매 항목마다 "이 검사가 실제로 그 코드를 밟는가"를 먼저 못 박는다:
//   · 채취를 재기 전에 **그 자리가 정말 갯벌인지**(그리고 대조군은 정말 갯벌이 아닌지) 확인한다.
//   · 게이트를 재기 전에 **거절이 그 사유로 났는지** 문구까지 본다(다른 사유로 막히면 가짜 통과다 —
//     보존 배치의 "모닥불에선 못 말린다"가 소유권 거절로 통과할 뻔한 그 족보).
//   · 대기열 진행을 재기 전에 **정말 안 끝났는지** 먼저 확인한다.
//
// 실행: node scripts/test-salt.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(37100 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-salt-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
// ★게임일을 길게 잡는다 — 검사 도중 날이 바뀌면 결정론 검사가 자기 시계 때문에 흔들린다.
process.env.VILLAGE_DAY_MS = process.env.VILLAGE_DAY_MS || String(3600 * 1000);
// ★채수 쿨다운만 0 으로 — **시간 손잡이만** 줄인다(염도·수율·땔감엔 손대지 않는다).
//   ⚠자염 전용 손잡이가 아니라 **채집 쿨다운 그것**이다 — 손잡이를 두 개 만들지 않았다.
process.env.FORAGE_COOLDOWN_MS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Salt = require(path.join(ROOT, 'server', 'salt.js'));
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const Lots = require(path.join(ROOT, 'server', 'lots.js'));
const Weights = require(path.join(ROOT, 'server', 'weights.js'));
const Facility = require(path.join(ROOT, 'server', 'facility.js'));
const Specialty = require(path.join(ROOT, 'server', 'specialty.js'));
const Villages = require(path.join(ROOT, 'server', 'villages.js'));
const Body = require(path.join(ROOT, 'server', 'body.js'));
const Terr = require(path.join(ROOT, 'server', 'terrain.js'));

function mkPlayer(name, inv, x, y) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'ts_' + name, name, persistent: false, ws,
    x: x != null ? x : 5000, y: y != null ? y : 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
    hunger: 50, thirst: 100, inventory: Object.assign({}, inv),
    equipment: [], equipSlots: {}, craftSkill: {}, dishes: [], lots: {} };
  p._msgs = msgs; Body.ensure(p); return p;
}
const notes = (p) => p._msgs.filter((m) => m.type === 'notice').map((m) => m.text);
const last = (p) => notes(p).slice(-1)[0] || '';
// ★소유자는 **playerId** 다(`_facilityMine` 이 그걸 본다) — 이름으로 적으면 늘 "남의 것"이 된다.
function kiln(id, ownerPid, x, y, type) {
  const b = { id, dbId: null, type: type || 'salt_kiln', ownerId: ownerPid, ownerName: ownerPid, x, y, data: {} };
  H.buildings.set(id, b); return b;
}

// ── 진짜 갯벌 자리를 **찾는다**(만들지 않는다) ───────────────────────────────
const SEA_CTX = { isSea: (x, y) => H.isSeaTileLocal(x, y) };
function findTidalFlat() {
  for (let y = 118000; y < 130000; y += 64) for (let x = 20000; x < 60000; x += 64) {
    if (Salt.isTidalFlat(x, y, SEA_CTX) && !H.isTerrainBlockedLocal(x, y)) return [x, y];
  }
  return null;
}
function findRiverBank() {
  for (let y = 60000; y < 85000; y += 64) for (let x = 36000; x < 48000; x += 64) {
    if (H.isWaterTileLocal(x, y)) continue;
    for (const [dx, dy] of [[32, 0], [-32, 0], [0, 32], [0, -32]]) {
      if (H.isWaterTileLocal(x + dx, y + dy) && !H.isSeaTileLocal(x + dx, y + dy)) return [x, y];
    }
  }
  return null;
}

(async function main() {
  console.log('=== 자염(煮鹽) 하네스 ===\n');

  // ══ ① 갯벌은 바다에 접한 뭍에만 있다 ═════════════════════════════════════
  console.log('① 갯벌 판정 — 바다에만, 강·호수엔 없다');
  const FLAT = findTidalFlat();
  const BANK = findRiverBank();
  pre(!!FLAT, '실서버 술어로 **찾은** 갯벌 자리가 있다(픽스처가 아니다)', JSON.stringify(FLAT));
  pre(!!BANK, '실서버 술어로 찾은 **민물** 물가 대조군이 있다', JSON.stringify(BANK));
  if (FLAT && BANK) {
    ok(Salt.isTidalFlat(FLAT[0], FLAT[1], SEA_CTX), '갯벌 자리는 갯벌이다');
    ok(!Salt.isTidalFlat(BANK[0], BANK[1], SEA_CTX), '★강·호수 물가는 갯벌이 아니다 — 민물에선 짠물이 안 나온다');
    pre(H.isWaterTileLocal(BANK[0] + 32, BANK[1]) || H.isWaterTileLocal(BANK[0] - 32, BANK[1])
        || H.isWaterTileLocal(BANK[0], BANK[1] + 32) || H.isWaterTileLocal(BANK[0], BANK[1] - 32),
        '★자명 통과 금지 — 대조군은 **정말 물가다**(물이 아예 없어서 false 인 게 아니다)');
    ok(!Salt.isTidalFlat(FLAT[0], FLAT[1], { isSea: () => true }), '★바다 위(사방이 바다)는 갯벌이 아니다 — 뭍이어야 뜬다');
    // 들판 한복판
    ok(!Salt.isTidalFlat(30848, 59872, SEA_CTX), '시작 광장(내륙)은 갯벌이 아니다');
  }

  // ── ①-b 51마을 전수: 갯벌이 닿는 마을이 몇 곳인가 ────────────────────────
  const vs = (Terr.getZoneVillages && Terr.getZoneVillages('hanbando')) || [];
  pre(vs.length === 51, '지도에 마을 51곳이 있다', `${vs.length}곳`);
  const REACH = 960;   // 배산임수 감사의 "도보 15초 = 30셀"
  let coastal = 0, inland = 0; const coastNames = [];
  for (const v of vs) {
    let hit = false;
    // ★갯벌은 **한 칸(32px)** 이라 성기게 쏘면 있는데도 못 찾는다(첫 판이 그랬다 — 3곳을 2곳으로 셌다).
    //   반경 32px 간격 · 각 링을 둘레에 비례한 수만큼 쏜다.
    for (let r = 0; r <= REACH && !hit; r += 32) {
      const nA = Math.max(8, Math.round(2 * Math.PI * r / 24));
      for (let a = 0; a < nA && !hit; a++) {
        const th = a * 2 * Math.PI / nA;
        const x = v.x + Math.cos(th) * r, y = v.y + Math.sin(th) * r;
        if (Salt.isTidalFlat(x, y, SEA_CTX)) hit = true;
      }
    }
    if (hit) { coastal++; coastNames.push(v.name); } else inland++;
  }
  ok(coastal + inland === vs.length, '전수 판정이 51곳을 다 셌다', `해안 ${coastal} · 내륙 ${inland}`);
  ok(inland > coastal, '★대다수 마을은 갯벌이 없다 — 소금은 어디서나 나는 물건이 아니다',
     `해안 ${coastal}곳: ${coastNames.join(', ') || '없음'}`);
  ok(coastal >= 1, '★그래도 갯벌이 닿는 마을은 있다(0곳이면 이 배치가 잠긴다)', `${coastal}곳`);

  // ══ ② 용기가 없으면 못 뜬다 ══════════════════════════════════════════════
  console.log('\n② 용기 게이트 — 손으로는 물을 못 뜬다');
  if (FLAT) {
    const [fx, fy] = FLAT;
    const noV = mkPlayer('nov', {}, fx, fy);
    H.players.set(noV.pid, noV);
    const srcNo = H.Forage.sourceAt(fx, fy, H._forageCtx(noV));
    pre(!!H._forageCtx(noV).isSea, 'forage ctx 가 바다 술어를 들고 있다');
    pre(H._forageCtx(noV).hasVessel === false, '이 플레이어는 물병이 없다');
    ok(!srcNo || srcNo.kind !== Salt.BRINE, '★물병이 없으면 짠물 갈래가 아예 안 열린다',
       srcNo ? `대신 ${srcNo.kind}` : '(아무것도 없음)');

    const yesV = mkPlayer('yesv', { water_bottle: 3 }, fx, fy);
    H.players.set(yesV.pid, yesV);
    const srcYes = H.Forage.sourceAt(fx, fy, H._forageCtx(yesV));
    pre(H._forageCtx(yesV).hasVessel === true, '이 플레이어는 물병이 있다');
    ok(!!srcYes && srcYes.kind === Salt.BRINE, '물병이 있으면 갯벌이 짠물을 준다', srcYes ? srcYes.kind : 'null');

    // 실제 채수 — 병이 짠물로 바뀐다
    const before = { v: yesV.inventory.water_bottle, b: yesV.inventory.brine || 0, kg: Weights.inventoryWeight ? 0 : 0 };
    H.tryForage(yesV);
    ok((yesV.inventory.brine || 0) === before.b + 1, '한 번 뜨면 짠물 1되',
       `${before.b} → ${yesV.inventory.brine || 0}`);
    ok((yesV.inventory.water_bottle || 0) === before.v - 1, '★물병 하나가 짠물로 **바뀐다**(소모가 아니라 교체)',
       `${before.v} → ${yesV.inventory.water_bottle || 0}`);
    ok(Weights.kgOf('brine') === Weights.kgOf('water_bottle'),
       '★★짠물과 물병의 무게가 같다 — 채수만으로 몸무게가 변하면 안 된다',
       `${Weights.kgOf('brine')}kg = ${Weights.kgOf('water_bottle')}kg`);
    ok(Weights.kgOf('brine') === Salt.CFG.BRINE_KG, '무게표와 자염 정본의 한 되 무게가 같다(사본 아님)',
       `${Weights.kgOf('brine')} / ${Salt.CFG.BRINE_KG}`);

    // 병을 다 쓰면 더 못 뜬다
    let guard = 0;
    while ((yesV.inventory.water_bottle || 0) > 0 && guard++ < 10) H.tryForage(yesV);
    pre((yesV.inventory.water_bottle || 0) === 0, '병을 다 썼다', `짠물 ${yesV.inventory.brine}되`);
    const bAt = yesV.inventory.brine;
    H.tryForage(yesV);
    ok((yesV.inventory.brine || 0) === bAt, '★병이 떨어지면 더 못 뜬다 — 들고 갈 수 있는 짠물의 상한이 곧 병의 수다',
       `짠물 ${bAt}되 그대로`);

    // 내륙 대조군 — 병이 있어도 갯벌이 아니면 안 나온다
    const inl = mkPlayer('inl', { water_bottle: 3 }, 30848, 59872);
    H.players.set(inl.pid, inl);
    const srcI = H.Forage.sourceAt(inl.x, inl.y, H._forageCtx(inl));
    ok(!srcI || srcI.kind !== Salt.BRINE, '★내륙에선 물병이 있어도 짠물이 안 나온다', srcI ? srcI.kind : '(없음)');
  }

  // ══ ③ 가마·땔감 게이트 ═══════════════════════════════════════════════════
  console.log('\n③ 가마 없이·땔감 없이는 자염이 없다');
  const NEED = Salt.brinePerPot();
  pre(NEED > 0 && Number.isInteger(NEED), '한 솥에 드는 짠물 되수가 정수다', `${NEED}되`);
  const WOOD = Salt.CFG.WOOD_PER_POT;
  {
    // ★★자리를 **떼어 놓는다** — 시설 색인이 `buildings.size` 로만 무효화돼서, 하나 지우고 하나 넣으면
    //   지운 것이 색인에 남는다(실제로 이 하네스가 그걸 밟았다). 지우지 말고 **멀리 짓는다**.
    // ⓐ 가마 없음
    const p = mkPlayer('nokiln', { brine: NEED, wood: WOOD }, 9000, 9000);
    H.players.set(p.pid, p);
    pre(!H.facilityFor(p, 'boil'), '★반경 안에 소금가마가 **없는** 자리다(선행 확인)');
    H.doBoilSalt(p, 'boil_salt', 1);
    ok(/소금가마 앞에서만/.test(last(p)), '가마가 없으면 못 한다 — **그 사유로** 거절한다', last(p));
    ok((p.inventory.brine || 0) === NEED, '거절했으면 재료를 삼키지 않는다', `짠물 ${p.inventory.brine}`);

    // ⓑ 남의 가마
    const p2 = mkPlayer('notmine', { brine: NEED, wood: WOOD }, 11000, 9000);
    H.players.set(p2.pid, p2);
    const other = kiln('k_other', 'ts_someone_else', 11020, 9000);
    pre(!!H.facilityFor(p2, 'boil'), '이제 반경 안에 가마가 있다');
    pre(!H._facilityMine(p2, other), '그 가마는 **내 것이 아니다**');
    H.doBoilSalt(p2, 'boil_salt', 1);
    ok(/내 것이 아니다/.test(last(p2)), '남의 가마로는 못 한다', last(p2));

    // ⓒ 모닥불로는 못 한다 — 시설의 창이 갈려 있다
    const p3 = mkPlayer('mine_cf', { brine: NEED, wood: WOOD }, 13000, 9000);
    H.players.set(p3.pid, p3);
    const cf = kiln('k_cf', p3.playerId, 13020, 9000, 'campfire');
    pre(!!H.facilityFor(p3, 'cook'), '★모닥불은 곁에 있다(그래서 "시설이 없다"로 통과하는 가짜가 아니다)');
    pre(H._facilityMine(p3, cf), '★그 모닥불은 내 것이다(소유권 거절로 통과하는 가짜도 아니다)');
    pre(!H.facilityFor(p3, 'boil'), '그러나 boil 창을 여는 시설은 없다');
    H.doBoilSalt(p3, 'boil_salt', 1);
    ok(/소금가마 앞에서만/.test(last(p3)), '★모닥불에선 자염을 못 한다 — 소금가마의 창이다', last(p3));

    // ⓓ 땔감 없음
    const p4 = mkPlayer('owner_d', { brine: NEED, wood: 0 }, 15000, 9000);
    H.players.set(p4.pid, p4);
    const k4 = kiln('k_d', p4.playerId, 15020, 9000);
    pre(H._facilityMine(p4, k4) && !!H.facilityFor(p4, 'boil'), '내 가마가 곁에 있다');
    H.doBoilSalt(p4, 'boil_salt', 1);
    ok(/땔감/.test(last(p4)) && /나무/.test(last(p4)), '땔감이 없으면 못 한다 — **그 사유로** 거절', last(p4));
    ok((p4.inventory.brine || 0) === NEED, '거절했으면 짠물도 안 삼킨다');

    // ⓔ 짠물 부족
    const p5 = mkPlayer('owner_e', { brine: NEED - 1, wood: WOOD }, 17000, 9000);
    H.players.set(p5.pid, p5);
    const k5 = kiln('k_e', p5.playerId, 17020, 9000);
    pre(H._facilityMine(p5, k5) && !!H.facilityFor(p5, 'boil'), '★내 가마가 곁에 있다(시설 부재로 통과하는 가짜가 아니다)');
    H.doBoilSalt(p5, 'boil_salt', 1);
    ok(/짠물/.test(last(p5)) && /갯벌/.test(last(p5)), '짠물이 한 되라도 모자라면 못 한다', last(p5));
    ok((p5.inventory.wood || 0) === WOOD, '거절했으면 땔감도 안 삼킨다');
  }

  // ══ ④ 산출 — econ 소금 그 자체 · 결정론 ═══════════════════════════════════
  console.log('\n④ 산출은 econ 소금 그 자체다 — 새 품목이 아니다');
  ok(Salt.SALT === 'salt', '산출 품목 id 가 econ 재화 id 와 같다', Salt.SALT);
  ok(!!Specialty.RESOURCES.salt, '★그 id 가 econ 정본 `specialty.RESOURCES` 에 실재한다',
     JSON.stringify({ ko: Specialty.RESOURCES.salt.ko, bv: Specialty.RESOURCES.salt.baseValue }));
  ok(Weights.kgOf('salt') === Specialty.RESOURCES.salt.weight,
     '★소금 kg 은 econ 정본에서 온다(무게표에 사본을 안 적었다)',
     `${Weights.kgOf('salt')}kg`);
  ok(Salt.CFG.SALT_KG === Specialty.RESOURCES.salt.weight, '자염 정본의 소금 무게도 econ 값 그대로');
  // 결정론 — 같은 입력이면 200번을 물어도 같은 답
  {
    let same = true; const first = Salt.saltFrom(NEED * 3);
    for (let i = 0; i < 200; i++) if (Salt.saltFrom(NEED * 3) !== first) { same = false; break; }
    ok(same, '★주사위 없음 — 같은 짠물이면 언제나 같은 소금(200회)', `${NEED * 3}되 → ${first}`);
    ok(Salt.saltFrom(NEED - 1) === 0, '한 솥에 모자라면 소금은 0', `${NEED - 1}되 → 0`);
    ok(Salt.saltFrom(NEED) === 1, '한 솥이면 소금 1', `${NEED}되 → 1`);
    ok(Salt.saltFrom(NEED * 2) === 2, '두 솥이면 소금 2');
    // 염도에서 유도됐는지 — 표에 박은 수가 아니다
    ok(NEED === Math.ceil(Salt.CFG.SALT_KG / (Salt.CFG.BRINE_KG * Salt.CFG.BRINE_PCT)),
       '★되수는 **염도에서 유도**된다(표에 박은 수가 아니다)',
       `ceil(${Salt.CFG.SALT_KG}/(${Salt.CFG.BRINE_KG}×${Salt.CFG.BRINE_PCT})) = ${NEED}`);
  }

  // ── ④-b 실제로 걸고 받는다 · 땔감 소모량 정확 · 빈 병 반환 ────────────────
  const P = mkPlayer('boiler', { brine: NEED * 2, wood: WOOD * 2 }, 19000, 9000);
  H.players.set(P.pid, P);
  const kb = kiln('k_boil', P.playerId, 19020, 9000);
  pre(H._facilityMine(P, kb), '내 소금가마가 곁에 있다');
  H.doBoilSalt(P, 'boil_salt', 2);
  ok((P.inventory.brine || 0) === 0, '두 솥이면 짠물을 정확히 두 솥어치 먹는다', `남은 ${P.inventory.brine || 0}`);
  ok((P.inventory.wood || 0) === 0, '★땔감 소모량이 정확하다(솥당 ' + WOOD + ')', `남은 ${P.inventory.wood || 0}`);
  ok((P.inventory.salt || 0) === 0, '아직 소금은 없다 — 가마가 끓는 중이다');
  const q0 = Facility.view(kb, Date.now());
  ok(q0.length === 1 && q0[0].kind === 'boil', '대기열에 자염 한 건이 걸렸다', JSON.stringify(q0.map(j => j.kind)));

  // ══ ⑦ 대기열은 오프라인에도 진행된다(lazy) ════════════════════════════════
  console.log('\n⑦ 가마는 밤새 탄다 — lazy 대기열');
  pre(q0.length === 1 && !q0[0].done, '★지금은 **안 끝났다**(먼저 확인 — 안 그러면 진행 검사가 자명해진다)',
      `${Math.ceil(q0[0].leftMs / 1000)}초 남음`);
  H.doCraftCollect(P, kb.id);
  ok(/아직 만드는 중/.test(last(P)), '안 끝났으면 못 받는다', last(P));
  // ★틱을 한 번도 안 돌린다 — 시각만 앞으로 옮긴다. 그게 "오프라인 진행"의 뜻이다.
  const shift = q0[0].leftMs + 50;
  for (const j of kb.data.queue) { j.startAt -= shift; j.doneAt -= shift; }
  const q1 = Facility.view(kb, Date.now());
  ok(q1[0].done, '★틱을 한 번도 안 돌렸는데 시각이 지나자 다 됐다 = 오프라인 진행');
  H.doCraftCollect(P, kb.id);
  ok((P.inventory.salt || 0) === Salt.potYield('boil_salt') * 2, '두 솥에서 소금 2',
     `소금 ${P.inventory.salt || 0}`);
  ok((P.inventory.water_bottle || 0) === NEED * 2, '★빈 병이 돌아온다 — 병은 소모품이 아니라 그릇이다',
     `물병 ${P.inventory.water_bottle || 0}개`);
  ok(!Lots.isLot('salt') && !Lots.isLot('brine'), '★소금도 짠물도 로트가 아니다 — 안 썩는다(무기한 벌크)');

  // ══ ⑤ 절임이 이 소금을 그대로 받는다 ══════════════════════════════════════
  console.log('\n⑤ 절임 — 부패 배치가 만들어 둔 기계에 소금이 꽂힌다');
  {
    const need = Spoil.PRESERVE.pickle_veg.needs;
    ok(need && need.salt >= 1, '절임 레시피가 요구하는 것이 바로 이 `salt` 다', JSON.stringify(need));
    const PK = mkPlayer('pickler', { salt: 2 }, 21000, 9000);
    H.players.set(PK.pid, PK);
    const wb = kiln('k_wb', PK.playerId, 21020, 9000, 'workbench');
    const today = H.zoneGameDay();
    // ★입력 품목은 정본이 정한다 — 하네스가 고르지 않는다(`PRESERVE.pickle_veg.from`).
    const FROM = Spoil.PRESERVE.pickle_veg.from;
    Lots.note(PK, FROM, 2, today);
    PK.inventory[FROM] = 2;
    pre(Math.floor(Lots.sum(PK, FROM)) >= 1, `절일 것이 있다(${FROM} · 성한 것)`, `${Lots.sum(PK, FROM)}`);
    pre(H._facilityMine(PK, wb) && !!H.facilityFor(PK, 'tool'), '내 작업대가 곁에 있다');
    const saltBefore = PK.inventory.salt;
    H.doPreserve(PK, 'pickle_veg', 1);
    ok((PK.inventory.salt || 0) === saltBefore - 1, '★자염으로 얻은 소금이 절임에 그대로 든다',
       `소금 ${saltBefore} → ${PK.inventory.salt || 0}`);
    const qj = Facility.view(wb, Date.now());
    ok(qj.length === 1, '작업대에 절임이 걸렸다', qj.map(j => j.label).join(''));
    // 소금이 없으면 절임이 안 된다(역방향 — 이 소금이 진짜 게이트인지)
    const PK2 = mkPlayer('nosalt', {}, 23000, 9000);
    H.players.set(PK2.pid, PK2);
    kiln('k_wb2', PK2.playerId, 23020, 9000, 'workbench');
    Lots.note(PK2, FROM, 2, today); PK2.inventory[FROM] = 2;
    pre(Math.floor(Lots.sum(PK2, FROM)) >= 1, '★자명 통과 금지 — 재료는 있다(재료 부족으로 막히는 게 아니다)');
    H.doPreserve(PK2, 'pickle_veg', 1);
    ok(/소금/.test(last(PK2)), '★소금이 없으면 절임이 막힌다 — 게이트가 진짜다', last(PK2));
  }

  // ══ ⑥ 거래소 — 가격 사본이 없다 · 그리고 **이제 소금이 팔린다** ══
  console.log('\n⑥ 거래소 — 사본 0 · 그리고 소금이 표에 들었다');
  {
    const map = Villages.playerVillageDepositMap();
    // ★★[T17 ③ 2026-09-02 · 재민 확정] **이 줄은 뒤집혔다.**
    //   T3(자염) 때 이 자리는 *"소금은 표에 **없다** — 그래서 거래소·게시판이 소금을 못 다룬다"* 였다.
    //   결함을 못 박아 둔 줄이었고, 회부 B 가 그걸 T17 ECON 웨이브로 넘겼다. 그 웨이브가 이 카드다.
    //   ⇒ 이제 반대를 못 박는다: 표에 **있다**. 한 줄이 게시판·곳간·거래소를 한꺼번에 연다
    //     (`events.buildDeliverable` 이 이 표에서 파생되고 `trade.tradableIn/Out` 이 그 파생을 읽는다).
    ok(Object.keys(map).includes('salt'),
       '★[T17 ③] 소금이 `PV_DEPOSIT_MAP` 에 **있다** — 거래소·게시판·곳간이 소금을 다룬다(T3 회부 B 닫음)',
       `표 ${Object.keys(map).length}종`);
    // 이 배치가 econ 을 안 건드렸다는 구조 검사
    // ★**주석을 걷어내고 코드만 본다** — 머리말은 실측 근거로 econ 값을 인용한다(그건 사본이 아니다).
    const raw = require('fs').readFileSync(path.join(ROOT, 'server', 'salt.js'), 'utf8');
    const code = raw.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    pre(code.length > 400, '★자명 통과 금지 — 주석을 걷어내도 코드가 남아 있다', `${code.length}자`);
    ok(!/baseValue|shadowPrice|가격/.test(code), '★자염 정본 **코드**에 가격이 한 글자도 없다(가격 사본 금지)');
    ok(!/require\('\.\/trade'\)|require\("\.\/trade"\)/.test(code), '자염 정본은 `trade.js` 를 부르지 않는다');
    ok(!/require\('\.\.\/sim/.test(code), '자염 정본은 `sim/` 을 부르지 않는다');
    // 소금 값은 econ 정본에만 있다
    ok(Specialty.RESOURCES.salt.baseValue > 0, '소금 값은 econ 정본이 갖고 있다(우리가 안 정했다)',
       `baseValue ${Specialty.RESOURCES.salt.baseValue}`);
  }

  // ══ ⑧ 표 일치 · 건축 ══════════════════════════════════════════════════════
  console.log('\n⑧ 건축 표 — 두 표가 어긋나면 안 된다');
  {
    const c = H.BUILDING_COST.salt_kiln, r = H.BUILDING_RECIPES.item_salt_kiln;
    ok(!!c && !!r, '소금가마가 두 표에 다 있다');
    const rc = {}; for (const [k, v] of Object.entries(r)) if (!k.startsWith('_') && k !== 'label') rc[k] = v;
    ok(JSON.stringify(c) === JSON.stringify(rc), '★건축 비용과 제작 레시피가 **같은 값**이다',
       `${JSON.stringify(c)} / ${JSON.stringify(rc)}`);
    ok(!c._needHammer, '망치를 요구하지 않는다 — 빈손 사다리 위에 있다');
    const kg = Weights.kgOf('item_salt_kiln');
    const matKg = Object.entries(c).reduce((s, [k, n]) => s + Weights.kgOf(k) * n, 0);
    ok(Math.abs(kg - matKg) < 1e-6, '★가마의 무게 = 재료 합(건조대·작업대 선례)', `${kg}kg = ${matKg}kg`);
    ok(!!Facility.FACILITIES.salt_kiln && Facility.FACILITIES.salt_kiln.kind === 'boil',
       '소금가마가 시설 표에 있고 제 창(boil)을 연다');
    ok(!Facility.KIND_TYPES.cook.includes('salt_kiln') && !Facility.KIND_TYPES.smelt.includes('salt_kiln'),
       '★화덕·노의 창에는 안 뜬다 — "제작창 = 시설의 창"');
    // ★★물병은 **가공(`ITEM_RECIPES`)** 이지 요리가 아니다 — 실클라 하네스가 그 함정을 잡았다:
    //   `doCook` 은 `produces` 를 안 보고 **요리 인스턴스**를 낸다(먹는 '물병'이 나온다).
    ok(!!H.ITEM_RECIPES.water_bottle, '★물병이 되살아났다 — 서버 레시피가 생겼다(죽은 품목이었다)',
       JSON.stringify(H.ITEM_RECIPES.water_bottle));
    ok(!H.COOK_RECIPES.water_bottle, '★★물병은 요리가 아니다 — `doCook` 은 요리 인스턴스를 내므로 거기 넣으면 안 된다');
    const wbFrom = Object.keys(H.ITEM_RECIPES.water_bottle.from);
    ok(wbFrom.length === 1 && wbFrom[0] === 'gourd', '★재료는 **박**이다 — 카탈로그가 박을 "표주박(그릇)"이라 적어 뒀다',
       wbFrom.join(','));
    // 조달 가능성 — 소금의 전철(기계는 있는데 재료가 없다)을 밟지 않는지 **구조로** 확인한다
    const gourd = H.Crops.get('gourd');
    ok(!!gourd, '★박이 작물 카탈로그에 있다', gourd ? `${gourd.ko} · 성장 ${gourd.growDays}일 · 수확 ${gourd.yield}` : '없음');
    ok(!!gourd && Array.isArray(gourd.sow) && gourd.sow.length > 0,
       '★★박은 심을 수 있다 — 그래야 이 사슬이 잠기지 않는다(소금의 전철 금지)', gourd ? gourd.sow.join(',') : '');
    ok(!!gourd && gourd.note && /그릇|표주박/.test(gourd.note),
       '★★그릇이라는 근거가 **카탈로그 자신**에 있다(우리가 정한 게 아니다)', gourd ? gourd.note : '');
  }

  // ══ ⑨ 시설의 창 — 소금가마 앞에서만 자염이 보인다 ═════════════════════════
  console.log('\n⑨ 시설의 창 — 새 패널 0');
  {
    const rowsBoil = H._facilityRecipes(P, 'boil');
    ok(rowsBoil.some((r) => r.id === 'boil_salt'), 'boil 창에 자염이 있다');
    const row = rowsBoil.find((r) => r.id === 'boil_salt');
    ok(row && row.cost && row.cost.brine === NEED && row.cost.wood === WOOD,
       '★행의 재료가 정본에서 온다(클라가 표를 다시 안 든다)', JSON.stringify(row && row.cost));
    ok(row && row.preserve === true,
       '★행에 preserve 깃발이 있다 — 클라의 기존 갈래를 타려고(클라 무접촉의 값)');
    for (const k of ['cook', 'tool', 'smelt', 'dry']) {
      const rows = H._facilityRecipes(P, k);
      ok(!rows.some((r) => r.id === 'boil_salt'), `${k} 창에는 자염이 없다`);
    }
    const dryRows = H._facilityRecipes(P, 'dry');
    pre(dryRows.length > 0, '★자명 통과 금지 — dry 창은 **비어 있지 않다**(그래서 "없다"가 공짜가 아니다)',
        `${dryRows.length}줄`);
  }

  // ══ ⑩ 시간 — 게임일로 적고 하루 길이로 환산한다 ═══════════════════════════
  console.log('\n⑩ 시간 — 새 시계 금지');
  {
    const d = Salt.RECIPES.boil_salt.days;
    ok(Salt.boilMs('boil_salt', 1000) === Math.round(d * 1000), '하루가 1초면 자염도 그만큼 짧다');
    ok(Salt.boilMs('boil_salt', 24 * 60 * 1000) === Math.round(d * 24 * 60 * 1000),
       '기본 하루(24분)에서 자염은 ' + (d * 24) + '분', `${Salt.boilMs('boil_salt', 24 * 60 * 1000)}ms`);
    ok(Salt.boilMs('boil_salt', 0) > 0, '하루 길이가 0 이어도 폴백이 있다(0 으로 안 나눈다)');
    ok(Salt.boilMs('nope', 1000) === 0, '없는 레시피는 0');
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
