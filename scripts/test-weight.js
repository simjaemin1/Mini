#!/usr/bin/env node
// === scripts/test-weight.js — 플레이어 무게 모델 서버 E2E ========================
//
// ★[재민 확정 2026-08-27] *"모든 아이템은 좀보이드처럼 무게를 가져야 해."*
//   그리고 인벤 3층: **개체**(하나하나 kg 가 다름) · **로트**(취득일이 다르면 다른 로트) · **무기한 벌크**(수량만).
//
// ★★제1 판정: **무게 표가 두 벌이 아닌가.** specialty 재화의 kg 는 `specialty.js` 가 정본이고
//   `weights.js` 는 그걸 **읽기만** 한다. 그래서 ①은 값을 손으로 다시 적지 않고 **구조로** 잡는다:
//     ⓐ 카탈로그 전수(242종)에 kg>0 — 빠진 품목 0건
//     ⓑ specialty 가 가진 값과 카탈로그 값이 **같다**(사본이면 갈린다)
//     ⓒ `weights.js` 소스에 specialty 키의 숫자가 옮겨 적혀 있지 않다
//
// ★★족보 ㊻·(56)·(57) 준수:
//   · 픽스처는 정본 경로(`Carry`/`Lots`/`doEat`/거래소)로만 상태를 움직인다.
//   · "변하는가"를 재는 절(③④⑧)은 **변할 수 있는 상황인지 먼저 assert** 한다.
//   · 거래 절은 **성사 여부를 재고 변화로** 확인한 뒤에야 값을 견준다.
//
// 실행: node scripts/test-weight.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined ? `  ${extra}` : '')); };
const say = (m) => console.log(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

const TMP = `/tmp/test-weight-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36800 + (process.pid % 190));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '1';
process.env.VILLAGE_MAX = process.env.VILLAGE_MAX || '2';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const W = H.Weights, C = H.Carry, L = H.Lots, V = H.SimVillages;
const Specialty = require(path.join(ROOT, 'server', 'specialty.js'));

function mkPlayer(name) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'test_' + name, name, persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {},
    oreLedger: {}, oreCarry: {}, ws, isNpc: false, isDown: false, vx: 0, vy: 0 };
  p.__notices = () => msgs.filter((m) => m.type === 'notice').map((m) => m.text);
  return p;
}

(async () => {
  say('\n=== 플레이어 무게 모델 (서버 정본 E2E) ===');

  // ═══ ① 카탈로그 전수 — 빠진 품목 0건 ══════════════════════════════════════
  say('\n① 카탈로그 — 전 품목에 kg 이 있는가(전수 스윕)');
  {
    const ids = W.allIds();
    const missing = ids.filter((i) => !(W.kgOf(i) > 0));
    ok(ids.length > 200, '★전제 — 카탈로그가 실제로 크다(자명 통과 방지)', `${ids.length}종`);
    ok(missing.length === 0, '★★① **kg 이 빠진 품목 0건**', missing.length ? missing.slice(0, 10).join(' ') : `${ids.length}종 전부`);
    // 게임이 실제로 쓰는 아이디도 전수로 — 카탈로그에 있어도 게임 아이디가 빠지면 소용없다
    const gameIds = new Set(['wood', 'stone', 'berry', 'fiber', 'seed_berry', 'meat_raw', 'meat_cooked', 'hide', 'herb',
      'ore', 'iron_ore', 'meteoric_iron', 'charcoal', 'plank', 'pillar', 'rafter', 'thatch', 'water_bottle',
      'fish', 'fish_cooked', 'berry_jam', 'food', 'food_cooked', 'axe', 'pickaxe', 'sword', 'saw', 'hammer',
      'item_wall', 'item_floor', 'item_door', 'item_fence', 'item_stair', 'item_chest', 'item_campfire', 'item_farmland']);
    for (const r of Object.values(H.RECIPES || {})) void r;
    const gm = [...gameIds].filter((i) => !(W.kgOf(i) > 0));
    ok(gm.length === 0, '★★① 게임이 실제로 쓰는 아이디도 전부 kg 이 있다', gm.length ? gm.join(' ') : `${gameIds.size}종`);
    // ⓑ 사본이 아니다 — specialty 값과 **정확히** 같다
    const bad = Object.keys(Specialty.RESOURCES).filter((k) => W.kgOf(k) !== Specialty.RESOURCES[k].weight);
    ok(bad.length === 0, '★★① specialty 값과 **한 자리도 안 다르다**(옮겨 적었으면 갈린다)', bad.slice(0, 6).join(' ') || '197종 일치');
    // ⓒ 소스에 옮겨 적은 표가 없다
    const wsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'weights.js'), 'utf8'));
    const spKeysInSrc = Object.keys(Specialty.RESOURCES).filter((k) => new RegExp('\\b' + k + '\\s*:\\s*[0-9]').test(wsrc));
    ok(spKeysInSrc.length === 0, '★★① `weights.js` 안에 specialty 값을 **옮겨 적은 줄이 없다**(사본 금지)',
      spKeysInSrc.slice(0, 6).join(' ') || '0건');
    say(`    앵커 확인: 곡물 food=${W.kgOf('food')}kg (고증표 앵커 0.70) · 생가죽 hide=${W.kgOf('hide')} · 사프란=${W.kgOf('saffron')}`);
    ok(W.kgOf('food') === 0.70, '★① **앵커가 표 그대로**다 — 주식 곡물 0.70kg/단위');
  }

  // ═══ ② 소지 무게 합산 ═════════════════════════════════════════════════════
  say('\n② 소지 무게 — 벌크 + 개체 + 도구');
  {
    const p = mkPlayer('w2');
    p.inventory = { wood: 4, stone: 2, fish: 3 };
    p.toolItems = [{ id: 't1', type: 'axe', d: 100, max: 100 }];
    const expectBulk = 4 * W.kgOf('wood') + 2 * W.kgOf('stone') + 3 * W.kgOf('fish') + W.kgOf('axe');
    ok(Math.abs(C.totalKg(p) - expectBulk) < 1e-6, '★② 벌크+도구 합산이 정확하다', `${C.totalKg(p)} = ${expectBulk.toFixed(3)}`);
    // 개체 kg — 표준(0.9) 물고기 세 마리를 1.7/0.4/2.0 으로 바꾼다
    C.noteInstance(p, 'fish', 1.7); C.noteInstance(p, 'fish', 0.4); C.noteInstance(p, 'fish', 2.0);
    const expectInst = 4 * W.kgOf('wood') + 2 * W.kgOf('stone') + (1.7 + 0.4 + 2.0) + W.kgOf('axe');
    ok(Math.abs(C.totalKg(p) - expectInst) < 1e-6, '★★② **개체 kg 이 표준값을 대신한다**(1.7kg 물고기는 1.7kg 이다)',
      `${C.totalKg(p)} = ${expectInst.toFixed(3)}`);
    // 장부가 개수보다 짧으면 남는 건 표준 무게
    p.inventory.fish = 5;
    const expectMix = 4 * W.kgOf('wood') + 2 * W.kgOf('stone') + (1.7 + 0.4 + 2.0) + 2 * W.kgOf('fish') + W.kgOf('axe');
    ok(Math.abs(C.totalKg(p) - expectMix) < 1e-6, '★② 장부에 없는 몫은 **표준 무게**로 친다(옛 저장 호환)', `${C.totalKg(p)}`);
  }

  // ═══ ③ 초과 곡선 — 절벽 없음 · 바닥 · 합산 클램프 ═════════════════════════
  say('\n③ 과적 곡선 — 연속인가, 바닥이 있는가');
  {
    const p = mkPlayer('w3');
    const cap = C.CFG.CAP_KG;
    const pts = [];
    for (let r = 0; r <= 3.2; r += 0.02) {
      p.inventory = {}; p.kgLedger = { stone: [r * cap] }; p.inventory.stone = 1;
      pts.push([r, C.effects(p).moveMult]);
    }
    let maxJump = 0, at = 0;
    for (let i = 1; i < pts.length; i++) { const j = Math.abs(pts[i][1] - pts[i - 1][1]); if (j > maxJump) { maxJump = j; at = pts[i][0]; } }
    ok(maxJump < 0.02, '★★③ **절벽이 없다** — 인접 표본 최대 낙차', `${maxJump.toFixed(4)} @ r=${at.toFixed(2)}`);
    const under = pts.filter(([r]) => r <= 1).every(([, m]) => m === 1);
    ok(under, '★③ 용량 안에선 **벌이 없다**(1.0)');
    const worst = pts[pts.length - 1][1];
    ok(Math.abs(worst - C.CFG.MOVE_FLOOR) < 1e-6, '★③ 최악에서 **과적 바닥**에 닿는다', `${worst} = ${C.CFG.MOVE_FLOOR}`);
    // ★자명 통과 금지 — 실제로 단조 감소해야 한다(전부 1.0 이면 위 셋이 공짜다)
    const mono = pts.every((q, i) => i === 0 || q[1] <= pts[i - 1][1] + 1e-9);
    ok(mono && pts[0][1] > worst, '★★③ 자명 통과 금지 — 곡선이 **실제로 내려간다**', `1.0 → ${worst}`);
    // 합산 클램프
    ok(C.combinedMove(0.6, 0.4) === C.CFG.COMBINED_FLOOR, '★★③ 신체×과적 **합산 바닥 0.35**', `0.6×0.4=0.24 → ${C.combinedMove(0.6, 0.4)}`);
    ok(C.combinedMove(1, 1) === 1, '★③ 성한 몸·가벼운 짐이면 배율 1(클램프가 늘 걸리진 않는다)');
    ok(Math.abs(C.combinedMove(0.9, 0.8) - 0.72) < 1e-9, '★③ 바닥 위에선 그냥 곱이다', `${C.combinedMove(0.9, 0.8)}`);
    // 단계 경계가 곡선에서 유도됐는가(상수 박기 금지)
    const csrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'carry.js'), 'utf8'));
    ok(/xWhereBelow\(MOVE_CURVE/.test(csrc), '★★③ 1단계 경계를 **곡선에서 유도**한다(상수로 안 박았다)', `r₁=${C.R1.toFixed(3)}`);
  }

  // ═══ ④ 과적이어도 줍는다 + 실제로 느려진다 ════════════════════════════════
  say('\n④ 과적 — 막지 않는다, 대신 느려진다');
  {
    const p = mkPlayer('w4');
    // ★★[족보 (56)] **변할 수 있는 자리**를 고른다. 1차 실행은 80kg(=r 3.2)에서 쟀는데
    //   거긴 이미 **과적 바닥**이라 더 실어도 ×0.4 그대로였다 — 곡선이 아니라 바닥을 재고 있었다.
    //   그래서 바닥에 안 붙은 중간 과적(r≈1.2)에서 잰다. 바닥 자체는 위 ③이 따로 확인한다.
    p.inventory = { stone: 8 };                       // 32kg (r=1.28)
    const before = C.effects(p);
    ok(before.over, '★전제 — 용량을 넘겼다', `${before.kg}kg / ${before.cap}kg (r=${before.ratio})`);
    ok(!before.floored, '★전제 — **바닥에 안 붙었다**(여기서 값이 움직일 수 있다)', `×${before.moveMult}`);
    p.inventory.stone += 2;                           // 줍기(하드 컷이 없으니 그냥 는다)
    const after = C.effects(p);
    ok(after.kg > before.kg, '★★④ 과적 상태에서도 **더 주울 수 있다**(하드 컷 없음)', `${before.kg} → ${after.kg}kg`);
    ok(after.moveMult < before.moveMult, '★★④ 그리고 **실제로 더 느려진다**', `×${before.moveMult} → ×${after.moveMult}`);
    ok(after.fatigueMult > 1, '★④ 피로도 빨리 찬다', `×${after.fatigueMult}`);
    const m = C.moodle(p);
    ok(m && m.stage >= 1, '★④ 무들 "무거움"이 뜬다', m ? `${m.ko} ${m.stage}단계` : '없음');
    // ★이동 배율의 정본이 하나인가 — 서버가 걸음에 쓰는 그 함수
    ok(typeof H.moveMultOf === 'function' && H.moveMultOf(p) === C.combinedMove(H.Body.effects(p).moveMult, after.moveMult),
      '★★④ 걸음 배율의 **정본이 하나**다(`moveMultOf`)', `${H.moveMultOf(p)}`);
  }

  // ═══ ⑤ 곡물 — 먹기·거래·게시판 편입 ═══════════════════════════════════════
  say('\n⑤ 곡물(food) — 플레이어 품목이 됐는가');
  {
    ok(W.kgOf('food') > 0, '★⑤ 곡물에 무게가 있다', `${W.kgOf('food')}kg`);
    ok(!!H.FOOD_EFFECTS.food, '★⑤ 먹을 수 있다', JSON.stringify(H.FOOD_EFFECTS.food));
    ok(H.FOOD_EFFECTS.food_cooked.hunger > H.FOOD_EFFECTS.food.hunger * 3,
      '★★⑤ **생곡은 비효율, 조리는 제값** — 화덕 수요의 실체',
      `생 ${H.FOOD_EFFECTS.food.hunger} vs 익힌 ${H.FOOD_EFFECTS.food_cooked.hunger}`);
    ok(!!H.COOK_RECIPES.food_cooked, '★⑤ 조리 레시피가 있다', JSON.stringify(H.COOK_RECIPES.food_cooked.cost));
    // 곳간이 받는가(= 게시판 보상·거래소 품목으로 자연 편입되는가)
    const dmap = V.playerVillageDepositMap ? V.playerVillageDepositMap() : {};
    ok(dmap.food === 'food', '★★⑤ 곳간 대응표에 곡물이 들어갔다 — **특별 취급 코드 없이** 게시판·거래소에 편입된다',
      `food → ${dmap.food}`);
    // 실제로 먹어 본다 — 부분 소비까지
    const p = mkPlayer('w5');
    p.inventory = { food: 4 };
    p.hunger = 50;
    H.doEat(p, 'food', 0.25);
    const gained = p.hunger - 50;
    ok(Math.abs(gained - H.FOOD_EFFECTS.food.hunger * 0.25) < 1e-6,
      '★★⑤ **부분 소비 — 회복량이 정확히 비례**한다(한 입 0.25단위)', `+${gained.toFixed(3)}`);
    ok(Math.abs(L.sum(p, 'food') - 3.75) < 1e-6, '★⑤ 남은 양도 0.25 만 줄었다', `${L.sum(p, 'food')}`);
    ok(p.inventory.food === 3, '★⑤ 인벤 정수는 `floor(Σ)` — 0.75 는 아직 못 판다(oreCarry 규약)', `${p.inventory.food}`);
    const wKg = C.totalKg(p);
    ok(Math.abs(wKg - 3.75 * W.kgOf('food')) < 1e-6, '★★⑤ **무게도 정확히 비례**해 줄었다', `${wKg}kg = 3.75×${W.kgOf('food')}`);
  }

  // ═══ ⑥ T/Y 제거 ══════════════════════════════════════════════════════════
  say('\n⑥ T/Y 물물교환 — 제거됐는가');
  {
    const zsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
    const csrc = codeOnly(fs.readFileSync(path.join(ROOT, 'public', 'client.js'), 'utf8'));
    const hsrc = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    ok(!/function tryTrade/.test(zsrc), '★★⑥ 서버에 `tryTrade` 가 **없다**');
    ok(!/trade_offer/.test(zsrc), '★★⑥ 서버가 `trade_offer` 를 **안 받는다**(핸들러 없음)');
    ok(!/trade_offer/.test(csrc), '★⑥ 클라가 `trade_offer` 를 **안 보낸다**(키·액션 둘 다)');
    ok(!/trade_wood|trade_stone/.test(hsrc), '★⑥ 화면에 그 버튼이 **없다**');
    const rsrc = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
    ok(!/\*\*T\*\* — 거래/.test(rsrc), '★⑥ README 조작 설명도 갱신됐다');
    // ★자명 통과 금지 — 대신 들어선 것(거래소)은 살아 있어야 한다
    ok(/village_trade_exec/.test(zsrc), '★★⑥ 자명 통과 금지 — 대체 경로(마을 거래소)는 **살아 있다**');
  }

  // ═══ ⑦ 로트 ═══════════════════════════════════════════════════════════════
  say('\n⑦ 로트 — 취득일이 다르면 다른 로트');
  {
    const p = mkPlayer('w7');
    const inv = p.inventory;
    L.note(p, 'food', 3, 10); L.note(p, 'food', 2, 12); L.note(p, 'food', 1, 10);
    inv.food = Math.floor(L.sum(p, 'food'));
    const lots = L.of(p, 'food');
    ok(lots.length === 2, '★★⑦ 다른 날 취득 → **로트가 갈린다**(같은 날은 합쳐진다)', JSON.stringify(lots));
    ok(lots[0].d === 10 && lots[0].n === 4, '★⑦ 같은 날 것은 동질 — 10일차 4', JSON.stringify(lots[0]));
    // 병합 금지 — 서로 다른 날짜가 하나로 안 뭉친다
    ok(lots.every((l) => !l.coalesced), '★★⑦ **병합이 안 일어났다**(나이를 안 섞는다)');
    // 오래된 것부터
    const r = L.consume(p, 'food', 4.5, inv, 13);
    ok(r.ages[0].d === 10 && r.ages[0].n === 4, '★★⑦ 소비는 **오래된 로트부터**', JSON.stringify(r.ages));
    // 로트 수 상한
    const p2 = mkPlayer('w7b');
    for (let d = 0; d < L.CFG.MAX_LOTS + 6; d++) L.note(p2, 'food', 1, d);
    ok(L.of(p2, 'food').length <= L.CFG.MAX_LOTS, '★⑦ 품목당 **로트 수 상한**을 지킨다',
      `${L.of(p2, 'food').length} ≤ ${L.CFG.MAX_LOTS}`);
    ok(Math.abs(L.sum(p2, 'food') - (L.CFG.MAX_LOTS + 6)) < 1e-6, '★★⑦ 상한에 닿아도 **수량은 안 잃는다**', `${L.sum(p2, 'food')}`);
    ok(L.of(p2, 'food')[0].d === 0, '★★⑦ 뭉칠 땐 **더 오래된 날짜**를 준다(음식이 실제보다 싱싱해 보이는 일 없음)');
    // 재접속(저장→복원) 보존
    const saved = JSON.parse(JSON.stringify({ lots: L.toSave(p), kg: C.toSave(p) }));
    const p3 = mkPlayer('w7c');
    L.fromSave(p3, saved.lots); C.fromSave(p3, saved.kg);
    ok(JSON.stringify(L.of(p3, 'food')) === JSON.stringify(L.of(p, 'food')),
      '★★⑦ **재접속을 넘어 로트·취득일이 살아남는다**', JSON.stringify(L.of(p3, 'food')));
    // reconcile — 로트를 안 거친 경로가 인벤을 늘려도 수량이 안 틀린다
    const p4 = mkPlayer('w7d');
    p4.inventory.food = 5;                       // 로트 없이 인벤만 늘어난 상황(채집·보상 경로)
    L.reconcile(p4, 'food', p4.inventory, 20);
    ok(Math.abs(L.sum(p4, 'food') - 5) < 1e-6 && L.of(p4, 'food')[0].d === 20,
      '★★⑦ 로트를 안 거친 취득도 **수량이 안 틀린다**(오늘 것으로 잡힌다)', JSON.stringify(L.of(p4, 'food')));
    ok(!L.isLot('wood') && !L.isLot('stone') && L.isLot('carp'),
      '★⑦ 무기한 벌크(돌·장작)엔 로트가 없다 — 나이가 뜻이 없다');
  }

  // ═══ ⑧ 개체 환산 — 큰 물고기가 더 비싸게 팔린다 ═══════════════════════════
  say('\n⑧ 개체 환산 — 2kg 물고기는 표준 2.2단위어치인가');
  {
    let list = [];
    for (let i = 0; i < 150; i++) { list = V.clientVillages ? V.clientVillages() : []; if (list && list.length) break; await sleep(1000); }
    ok(list.length > 0, '★전제 — 마을 시딩을 기다렸다', `${list.length}곳`);
    const CV = list[0], PX = CV.cx * 32 + 16, PY = CV.cy * 32 + 16;
    const board = V.villageTradeBoard(CV.id, PX, PY, {});
    ok(!board.err, '★전제 — 그 마을 시세표가 선다', board.err || `${board.rows.length}품목`);
    // ★★[족보 (57)] 짝을 고르기 전에 **마을이 값을 치를 수 있는지** 본다.
    //   1차 실행은 생선↔돌로 고정했다가 "생선 한 개가 마을 돌 전량보다 비싸다"로 두 판 다 거절당했고,
    //   그걸 "환산이 안 통한다"로 읽을 뻔했다 — 거절과 무변화는 겉이 똑같다.
    const rows = board.rows || [];
    const payPower = (t) => t.sell * t.num;
    //   조건 셋을 다 만족해야 **비례가 정수에서 보인다**:
    //     ⓐ 마을이 값을 치를 수 있다(상한 × 시세 > 낼 것 값 × 3)
    //     ⓑ 한 개를 내면 **여러 개**를 받는다(g.num ≥ t.num × 4) — 안 그러면 0개/0개로 비교가 없다
    //     ⓒ 받는 수가 클수록 정수 절삭 잡음이 작다 → 그중 가장 큰 것을 고른다
    let pick = null, best = 0;
    for (const g of rows.filter((r) => r.canGive && r.num > 0 && (r.give || []).length)) {
      for (const t of rows.filter((r) => r.canTake && r.sell > 0 && r.num > 0 && r.res !== g.res)) {
        if (!(payPower(t) > g.num * 3)) continue;         // ⓐ
        const expect = g.num / t.num;
        if (!(expect >= 4)) continue;                      // ⓑ
        const score = Math.min(expect, t.sell);            // ⓒ
        if (score > best) { best = score; pick = { g, t, expect }; }
      }
    }
    ok(!!pick, '★전제 — 마을이 값을 치를 수 있는 짝이 있다',
      pick ? `📤 ${pick.g.ko}(${pick.g.num}) → 📥 ${pick.t.ko}(재고상한 ${pick.t.sell}×${pick.t.num}) · 한 개당 ~${pick.expect.toFixed(1)}개` : '없음');
    if (pick) {
      const GI = pick.g.give[0], std = W.kgOf(GI);
      const mk = (kg) => { const p = mkPlayer('w8_' + kg); p.inventory = { [GI]: 1 }; C.noteInstance(p, GI, kg); return p; };
      const pA = mk(std), pB = mk(std * 2.2);
      const uA = H._unitsOfFor(pA)(GI, 1), uB = H._unitsOfFor(pB)(GI, 1);
      ok(Math.abs(uA - 1) < 1e-3, '★⑧ 표준 무게 개체 = 1단위', `${GI} ${std}kg → ${uA}`);
      ok(Math.abs(uB - 2.2) < 1e-2, '★★⑧ **2.2배 무거운 개체 = 2.2단위**', `${(std * 2.2).toFixed(2)}kg → ${uB}`);
      const rA = V.villageTradeExec(CV.id, PX, PY, pA.inventory, pick.g.res, pick.t.res, 1, H._unitsOfFor(pA));
      const rB = V.villageTradeExec(CV.id, PX, PY, pB.inventory, pick.g.res, pick.t.res, 1, H._unitsOfFor(pB));
      say(`    표준(${std}kg) → ${rA.err || rA.take + '개'} · 큰놈(${(std * 2.2).toFixed(2)}kg) → ${rB.err || rB.take + '개'}`);
      ok(!rA.err && !rB.err, '★★전제 — 두 거래가 **실제로 성사됐다**(족보 (57))', `${rA.err || ''} ${rB.err || ''}`);
      if (!rA.err && !rB.err) {
        const ratio = rB.take / Math.max(1e-9, rA.take);
        ok(rB.take > rA.take, '★★⑧ **무거운 개체가 더 비싸게 팔린다**', `${rA.take} → ${rB.take} (×${ratio.toFixed(2)})`);
        ok(Math.abs(ratio - 2.2) < 0.45, '★★⑧ 그 배수가 **무게 비율에 비례**한다(±0.45 — 곡선 적분·정수 절삭 여유)',
          `실측 ×${ratio.toFixed(2)} vs 무게비 ×2.20`);
      }
    }
  }

  say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
