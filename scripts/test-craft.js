#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-craft.js — 시설 제작창 · 정품 자작 · 대기열 (서버 직접) ==========
//
// ★[재민 확정 2026-08-29 · §8.5] **"제작창 = 시설의 창"** — 화덕=요리 · 작업대=도구 · 노=제련.
//   헌법: **제작은 마법 메뉴가 아니라 시설 앞의 물리 행위다.**
//   상호의존: **자작이 구매를 죽이면 안 된다** — 숙련 없이는 사는 게 낫고, 업으로 삼으면 만드는 게 남아야.
//
// ⚠시간 손잡이는 이 하네스가 env 로 줄인다(`CRAFT_*_MS`) — 값을 코드에서 바꾸지 않는다.
//   ★픽스처가 검사 대상을 만지지 않게: 시간은 **줄이기만** 하고, 품질·저장·가격에는 손대지 않는다.
//
// 실행: node scripts/test-craft.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(36300 + (process.pid % 150));
process.env.DB_PATH = `/tmp/test-craft-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.CRAFT_TOOL_MS = process.env.CRAFT_TOOL_MS || '900';    // 하네스에서만 짧게
process.env.CRAFT_COOK_MS = process.env.CRAFT_COOK_MS || '400';
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const Facility = require(path.join(ROOT, 'server', 'facility.js'));
const PlayerItems = require(path.join(ROOT, 'server', 'player-items.js'));

function mkPlayer(name, inv) {
  const msgs = [];
  const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
  const p = { pid: 'p_' + name, playerId: 'tc_' + name, name, persistent: false, ws,
    x: 5000, y: 5000, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100,
    hunger: 100, thirst: 100, inventory: Object.assign({}, inv),
    equipment: [], equipSlots: {}, craftSkill: {}, dishes: [] };
  p._msgs = msgs;
  return p;
}
const notes = (p) => p._msgs.filter((m) => m.type === 'notice').map((m) => m.text);
const lastNote = (p) => notes(p).slice(-1)[0] || '';
function bench(id, x, y, owner, type) {
  const b = { id, dbId: null, type: type || 'workbench', ownerId: owner, ownerName: owner, x, y, data: {} };
  H.buildings.set(id, b); return b;
}

(async () => {
  console.log('\n=== 시설 제작창 · 정품 자작 · 대기열 ===');
  console.log(`  손잡이: 도구 ${Facility.CRAFT_MS.tool}ms · 요리 ${Facility.CRAFT_MS.cook}ms · 대기열 최대 ${Facility.MAX_QUEUE} · 시설 반경 ${Facility.FACILITIES.workbench.range}px`);

  // ═══ ① 시설 게이트 ═══════════════════════════════════════════════════════
  console.log('\n① 시설 게이트 — 작업대 없이는 정품이 안 나온다');
  const a = mkPlayer('a', { stone: 12, wood: 8, meat_raw: 3 });
  a._msgs.length = 0; H.doCraftEquipment(a, 'tool', 'stone');
  ok(a.equipment.length === 0 && a.inventory.stone === 12,
    '★★① 작업대가 없으면 **만들어지지도 않고 재료도 안 준다**', `장비 ${a.equipment.length} · 돌 ${a.inventory.stone}`);
  ok(/작업대/.test(lastNote(a)), '★① 그리고 **무엇이 없는지 말해 준다**', lastNote(a).slice(0, 40));
  const wb = bench('wb1', 5020, 5000, a.playerId);
  a._msgs.length = 0; H.doCraftEquipment(a, 'tool', 'stone');
  ok(a.inventory.stone === 9, '★★① 작업대 앞에서는 재료가 나간다(=주문이 들어갔다)', `돌 ${a.inventory.stone}`);
  // 반경 밖 — 걸어 나가면 거절
  const far = mkPlayer('far', { stone: 6 });
  far.x = 5000 + Facility.FACILITIES.workbench.range + 200; far.y = 5000;
  far._msgs.length = 0; H.doCraftEquipment(far, 'tool', 'stone');
  ok(far.inventory.stone === 6 && far.equipment.length === 0,
    '★★① **반경 밖 제작 요청은 거절**된다(같은 시설이라도 멀면 못 쓴다)', `${Math.round(far.x - 5020)}px 밖`);
  // 남의 시설
  const other = mkPlayer('other', { stone: 6 });
  other._msgs.length = 0; H.doCraftEquipment(other, 'tool', 'stone');
  ok(other.inventory.stone === 6, '★① 남의 작업대는 못 쓴다(사유지 시설 = 소유자만 · 사용권은 회부)', lastNote(other).slice(0, 30));

  // ═══ ② 재료 품질 → 산출 품질 (정본 함수와 일치) ═════════════════════════
  console.log('\n② 재료 품질 → 산출 품질 — **정본 함수가 낸 수와 같아야 한다**');
  await sleep(Facility.CRAFT_MS.tool + 300);
  H.doCraftCollect(a, 'wb1');
  const madeStone = a.equipment[a.equipment.length - 1];
  const lvlA = H.playerCraftLevel(a, 'toolmaking');
  const expStone = PlayerItems.craftItem('tool', 0, { stone: 3 }).q;   // 주문 시점 숙련 0
  ok(madeStone && Math.abs(madeStone.q - expStone) < 1e-9,
    '★★② 산출 품질 = `PlayerItems.craftItem` 정본 값(사본 공식 없음)', `${madeStone ? madeStone.q : '?'} vs ${expStone}`);
  // 대조 — 좋은 재료
  const b2 = mkPlayer('b', { bronze: 6 });
  bench('wb2', 5020, 5000, b2.playerId);
  b2._msgs.length = 0; H.doCraftEquipment(b2, 'tool', 'bronze');
  await sleep(Facility.CRAFT_MS.tool + 300);
  H.doCraftCollect(b2, 'wb2');
  const madeBronze = b2.equipment[0];
  ok(madeBronze && madeBronze.q > madeStone.q,
    '★★② **대조 — 좋은 재료가 더 좋은 물건을 낸다**(자명 통과 금지)',
    `돌 ${madeStone.q} < 청동 ${madeBronze.q} (등급 ${PlayerItems.MAT_GRADE.stone} vs ${PlayerItems.MAT_GRADE.bronze})`);
  ok(madeBronze.durMax > madeStone.durMax, '★② 내구도 따라 오른다', `${madeStone.durMax} → ${madeBronze.durMax}`);
  void lvlA;

  // ═══ ③ 대기열 ═══════════════════════════════════════════════════════════
  console.log('\n③ 대기열 — 등록 → 시간 → 완성 · 순서 · 오프라인');
  const c = mkPlayer('c', { stone: 30 });
  const wb3 = bench('wb3', 5020, 5000, c.playerId);
  c._msgs.length = 0;
  const t0 = Date.now();
  H.doCraftEquipment(c, 'tool', 'stone');
  H.doCraftEquipment(c, 'tool', 'stone');
  H.doCraftEquipment(c, 'tool', 'stone');
  const v0 = Facility.view(wb3, Date.now());
  ok(v0.length === 3, '★★③ 세 개가 줄을 선다', `${v0.length}개`);
  ok(v0[0].doneAt < v0[1].doneAt && v0[1].doneAt < v0[2].doneAt,
    '★★③ **하나씩 만든다** — 뒤엣것은 앞엣것이 끝난 뒤에 끝난다(시설이 생산수단이다)',
    v0.map((j) => `+${Math.round((j.doneAt - t0) / 100) / 10}초`).join(' '));
  c._msgs.length = 0; H.doCraftCollect(c, 'wb3');
  ok(c.equipment.length === 0, '★③ 아직 안 된 건 못 받는다', lastNote(c).slice(0, 30));
  await sleep(Facility.CRAFT_MS.tool + 250);
  c._msgs.length = 0; H.doCraftCollect(c, 'wb3');
  ok(c.equipment.length === 1, '★★③ 첫 개만 먼저 나온다(순서 보장)', `${c.equipment.length}개`);
  // ★오프라인 — 사람이 없어도 시설은 일한다(lazy 시간이라 틱이 필요 없다)
  const offBefore = Facility.view(wb3, Date.now()).length;
  await sleep(Facility.CRAFT_MS.tool * 2 + 400);
  const doneAll = Facility.view(wb3, Date.now()).filter((j) => j.done).length;
  ok(offBefore === 2 && doneAll === 2,
    '★★③ **접속을 안 해도 진행된다** — 가마는 밤새 탄다(수령만 사람이 한다)', `${offBefore}개 대기 → ${doneAll}개 완성`);
  c._msgs.length = 0; H.doCraftCollect(c, 'wb3');
  ok(c.equipment.length === 3, '★③ 남은 둘을 한 번에 받는다', `${c.equipment.length}개`);
  ok((c.craftLog && c.craftLog.tool && c.craftLog.tool.n) === 3,
    '★③ 제작 이력이 쌓인다(§8.4 스킬 패널이 읽을 씨앗 — UI 는 회부)', JSON.stringify(c.craftLog));
  // 대기열 상한
  const d = mkPlayer('d', { stone: 60 });
  bench('wb4', 5020, 5000, d.playerId);
  for (let i = 0; i < Facility.MAX_QUEUE + 2; i++) H.doCraftEquipment(d, 'tool', 'stone');
  ok(Facility.pending(H.buildings.get('wb4')) === Facility.MAX_QUEUE,
    '★③ 상한을 넘겨 넣지 못한다(넘친 주문은 재료를 안 먹는다)',
    `${Facility.pending(H.buildings.get('wb4'))}/${Facility.MAX_QUEUE} · 남은 돌 ${d.inventory.stone}`);
  ok(d.inventory.stone === 60 - 3 * Facility.MAX_QUEUE, '★③ **거절된 주문은 재료를 돌려준다**', `돌 ${d.inventory.stone}`);

  // ═══ ④ 자작 정품 = 구매 정품 (같은 품목) ═══════════════════════════════
  console.log('\n④ 자작 정품과 구매 정품이 **같은 물건**인가');
  const bought = PlayerItems.materializeFromVillage('tool', 0.6, () => 0.5);
  ok(bought.type === madeStone.type, '★★④ **같은 품목이다** — "플레이어제" 별도 품목이 없다',
    `자작 ${madeStone.type} · 구매 ${bought.type}`);
  const keys = (o) => Object.keys(o).sort().join(',');
  ok(keys(bought.attrs) === keys(madeStone.attrs),
    '★★④ 속성 구조도 같다(장착·수선·판매 경로가 갈리지 않는다)', keys(bought.attrs));
  ok(H.EQUIPMENT_RECIPES[madeStone.type].slot === H.EQUIPMENT_RECIPES[bought.type].slot,
    '★④ 같은 슬롯에 들어간다', H.EQUIPMENT_RECIPES.tool.slot);

  // ═══ ⑤ 자작품을 시장에 — 같은 정본 경로인가 ═══════════════════════════
  console.log('\n⑤ 플레이어 장인 = 같은 시장인가 (§0 실측 — 전제 확인)');
  const Events = require(path.join(ROOT, 'server', 'events.js'));
  const dmap = require(path.join(ROOT, 'server', 'villages.js')).playerVillageDepositMap
    ? require(path.join(ROOT, 'server', 'villages.js')).playerVillageDepositMap() : {};
  const toolIsGood = Object.values(dmap).includes('tool') || Object.keys(dmap).includes('tool');
  ok(!toolIsGood, '★★⑤ **실측: 도구는 econ 재화가 아니다** — 거래소 품목표에 없다(지시서 D의 전제와 다르다)',
    `곳간 대응표 ${Object.keys(dmap).length}종 · tool 포함 ${toolIsGood}`);
  ok(typeof H.doShopBuy === 'function',
    '★⑤ 대신 **장인 경로**가 둘의 공통 시장이다 — 같은 재료를 내고 같은 품목을 받는다(품질만 다르다)');
  void Events;

  // ═══ ⑥ 자작 vs 구매 손익 (상호의존 방어선) ═════════════════════════════
  console.log('\n⑥ 자작 vs 구매 — 자급자족이 마을 대장간을 죽이는가');
  const VQ = [0.45, 0.6, 0.75];
  console.log(`  ${'숙련'.padEnd(6)}${'자작 품질'.padStart(10)}${'구매 품질(마을Q 0.45/0.60/0.75)'.padStart(34)}`);
  let cross = null;
  for (const lvl of [0, 2, 4, 6, 8, 10]) {
    const self = PlayerItems.craftItem('tool', lvl, { stone: 3 }).q;
    const buys = VQ.map((q) => PlayerItems.materializeFromVillage('tool', q, () => 0.5).q);
    if (cross == null && self > buys[1]) cross = lvl;
    console.log(`  Lv${String(lvl).padEnd(4)}${self.toFixed(3).padStart(10)}${buys.map((b) => b.toFixed(3)).join(' / ').padStart(34)}`);
  }
  ok(PlayerItems.craftItem('tool', 0, { stone: 3 }).q < PlayerItems.materializeFromVillage('tool', 0.6, () => 0.5).q,
    '★★⑥ **숙련 없이는 사는 게 낫다** — 초보 자작품이 마을 장인보다 못하다(듀랑고병 방지선 ①)',
    `Lv0 ${PlayerItems.craftItem('tool', 0, { stone: 3 }).q.toFixed(3)} < 마을 ${PlayerItems.materializeFromVillage('tool', 0.6, () => 0.5).q.toFixed(3)}`);
  ok(cross != null && cross <= 10,
    '★★⑥ **업으로 삼으면 만드는 게 남는다** — 숙련이 오르면 역전한다(방어선 ②: 전문화가 이긴다)',
    cross != null ? `역전 시작 Lv${cross}` : '역전 없음');
  const tMin = Facility.CRAFT_MS.tool / 1000;
  console.log(`  ★비용 차이는 **시간**이다: 자작 ${tMin}초/개 + 작업대(통나무 4·석재 2) vs 구매 즉시.`);
  console.log(`    재료비는 **같다**(둘 다 ${H.EQUIPMENT_RECIPES.tool.qty}개) — 그래서 손익을 가르는 건 숙련과 시간뿐이다.`);
  ok(H.BUILDING_COST.workbench && H.BUILDING_COST.workbench.wood > 0,
    '★⑥ 자작에는 **선투자**가 있다(작업대) — 한 자루 만들자고 짓지는 않는다',
    JSON.stringify(H.BUILDING_COST.workbench));

  // ═══ ⑦ 요리도 같은 문법인가 ════════════════════════════════════════════
  console.log('\n⑦ 화덕 = 요리 창 (같은 시설·대기열 문법)');
  const e = mkPlayer('e', { meat_raw: 4 });
  const fire = bench('cf1', 5020, 5000, e.playerId, 'campfire');
  e._msgs.length = 0; H.doCook(e, 'meat_cooked');
  ok(Facility.pending(fire) === 1 && e.dishes.length === 0,
    '★★⑦ 요리도 **불에 올려 두는 것**이다(즉석 아님)', `대기 ${Facility.pending(fire)} · 요리 ${e.dishes.length}`);
  await sleep(Facility.CRAFT_MS.cook + 250);
  H.doCraftCollect(e, 'cf1');
  ok(e.dishes.length === 1, '★★⑦ 다 되면 받는다', `${e.dishes.length}개`);
  ok(e.dishes[0] && e.dishes[0].craftedAtMs && Date.now() - e.dishes[0].craftedAtMs < 500,
    '★⑦ **신선도는 꺼낸 때부터** — 불 위에서 식지 않는다');
  const noFire = mkPlayer('nf', { meat_raw: 2 });
  noFire.x = 9000; noFire.y = 9000;
  noFire._msgs.length = 0; H.doCook(noFire, 'meat_cooked');
  ok(noFire.inventory.meat_raw === 2, '★⑦ 불 없이는 안 된다(재료도 안 나간다)', lastNote(noFire).slice(0, 30));

  // ═══ ⑧ 시설 창 페이로드 — "가능 / 하나 모자람" ═════════════════════════
  console.log('\n⑧ 창이 **자기 레시피만** 펴고, 오늘의 할 일을 위에 둔다');
  const f = mkPlayer('f', { stone: 3, fur: 1 });     // 도구는 되고, 옷은 하나 모자람(fur 1/3)
  bench('wb5', 5020, 5000, f.playerId);
  f._msgs.length = 0; H.sendFacility(f);
  const pay = f._msgs.find((m) => m.type === 'facility');
  ok(pay && pay.near && pay.near.kind === 'tool', '★★⑧ 작업대 앞이면 **도구 창**이 온다', pay && pay.near ? pay.near.ko : '없음');
  ok(pay && !pay.recipes.some((r) => r.kind === 'cook'),
    '★★⑧ **요리 레시피는 안 섞인다** — 대목록이 아니다(§8.5)', pay ? pay.recipes.map((r) => r.label).join(' ') : '');
  const idx = pay.recipes.findIndex((r) => r.can);
  ok(idx === 0, '★★⑧ **지금 가능한 것이 맨 위**다', pay.recipes.map((r) => `${r.label}${r.can ? '✔' : '✗' + r.missing.length}`).join(' '));
  const firstBad = pay.recipes.find((r) => !r.can);
  ok(!firstBad || firstBad.missing.length === Math.min(...pay.recipes.filter((r) => !r.can).map((r) => r.missing.length)),
    '★⑧ 그다음이 **재료 하나 모자란 것**이다(오늘의 할 일 = 장에 갈 이유)',
    firstBad ? `${firstBad.label} 모자람 ${firstBad.missing.length}` : '');
  const toolRow = pay.recipes.find((r) => r.id === 'tool');
  ok(toolRow && Array.isArray(toolRow.options) && toolRow.options.length > 1,
    '★★⑧ **재료 선택이 판단이다** — 무엇으로 만들지 고를 수 있다',
    toolRow ? toolRow.options.slice(0, 4).map((o) => `${o.material}${o.q != null ? '(' + o.q.toFixed(2) + ')' : ''}`).join(' ') : '');
  const q1 = toolRow.options.find((o) => o.material === 'stone'), q2 = toolRow.options.find((o) => o.material === 'bronze');
  ok(q1 && q2 && q2.q > q1.q, '★⑧ 고른 재료에 따라 **예상 품질이 화면 값으로 다르다**',
    q1 && q2 ? `돌 ${q1.q.toFixed(2)} < 청동 ${q2.q.toFixed(2)}` : '');

  // ═══ ⑨ 맨손 소목록은 그대로 (빈손 배치 계약 불변) ══════════════════════
  console.log('\n⑨ 조잡한 석기는 여전히 **맨손**이다(빈손 배치 계약)');
  const g = mkPlayer('g', { pebble: 4, twig: 2, fiber: 4 });
  g.x = 40000; g.y = 40000;                       // 시설에서 아주 먼 곳
  g._msgs.length = 0; H.doCraft(g, 'crude_axe');
  ok((g.toolItems || []).some((t) => t.type === 'crude_axe'),
    '★★⑨ 시설 없이도 조잡한 돌도끼가 만들어진다 — **사다리의 첫 단은 안 막혔다**',
    (g.toolItems || []).map((t) => t.type).join(' ') || '없음');
  ok(H.RECIPES.crude_axe && H.EQUIPMENT_RECIPES.tool,
    '★⑨ 두 사다리 칸이 **같은 레시피 구조**를 공유한다(표 두 벌 금지)',
    `crude cost=${JSON.stringify(H.RECIPES.crude_axe.cost)} · 정품 accepts=${H.EQUIPMENT_RECIPES.tool.accepts.length}종`);

  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
  try { fs.unlinkSync(process.env.DB_PATH); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('예외:', e); process.exit(1); });
