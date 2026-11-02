#!/usr/bin/env node
// @regress
// === scripts/test-game-meat.js — T694 사냥 고기 마무리: 곰고기 열량 줄 · 날고기 HP 출처 · 굽기·삶기(USDA 수율) · 곳간 넣기 ===
//
// ★왜 [T647 회부 · 재민 칸 ①~④] 도살 드롭 `meat_game` 을 손에서 먹게 됐지만 곰 고기도 사슴 열량을 먹었고(①) · 날고기 HP −3 의
//   근거가 안 적혀 있었고(②) · 불에 익히는 길이 없었고(③) · 곳간 넣기 표에 줄이 없었다(④). 손잡이 하나 `T694_GAME_MEAT=1`(없음 = 끔 = main 바이트).
//   이 하네스가 지키는 것:
//
//  ① 끔 = 종전 — 손잡이 없음·빈 값·'0' 은 같은 표(드롭·열량·무게·보관일·로트·곳간 대응)를 내고, 그 표에 T694 품목이 없다 ·
//     T636 되돌림(`T636_DROP_KG=0`)이면 T694 를 켜도 꺼진다(그 표 위에 선다)
//  ② 수 = 출처 줄 — 곰고기 1,610 = USDA FDC 173845 161 kcal/100g × 10 · 수율 340 g · 277 g = `설계/고증_사냥고기_조리.md` 글자 ·
//     1 lb = 453.59237 g(단위 환산) · 익힌 것 열량 = 재료 × `COOKED_FACTOR`(econ 1.12 — 새 계수 0)
//  ③ 켬 — 곰 드롭 = 곰고기 36(사슴·들짐승고기 칸 없음 · 칸 차례 그대로) · 사슴 33/21 · 꿩 그대로 · 표 밖 종은 카탈로그 그 객체
//  ④ 켬 — 열량·무게·보관일·로트·먹기 표 · 익힌 것 kg = 1 × 수율 · kg 당 열량 = 유도 · 날고기 패널티는 익힌 줄에 없다
//  ⑤ 실기 — 존을 띄워 곰 도살(곰고기 36) → 먹기(HP −3) → 모닥불에 굽기·삶기(품목 · 시설 대기열) → 수령(로트 취득일 = 완성일) →
//     먹기(HP 그대로 · 허기 = 열량 유도) · 불 없으면 재료 그대로 · 끔이면 곰 도살 = meat_game 36 · 굽기 줄 없음(main)
//  ⑥ 곳간 — 넣기(`playerVillageDeposit` + 실 `_unitsOfFor`) 단위 = 열량 ÷ 2,450 · 대표 품목 meat_game · 게시판·거래소(fromEcon)에 meat_game ·
//     cooked_food 대표는 그대로 · 끔 = 표 밖(T647 그대로)
//  ⑦ 날고기 HP −3 — 정본 자리 한 곳(`FOOD_EFFECTS.meat_raw`) · 곰고기는 그 줄 사본 · 익힌 줄엔 hpDelta 가 없다
//
// 실행: node scripts/test-game-meat.js      (⑤ 가 존을 두 번 띄운다 — 가벼운 판이라 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);
const T694_ITEMS = ['meat_bear', 'meat_game_cooked', 'meat_bear_cooked'];

// ══ 하위 실행 A — 모듈 표(손잡이는 모듈이 뜰 때 읽힌다 → 판마다 새 프로세스) ══════════════════════
if (process.env.T694_SUB === 'tables') {
  const A = require(SV('animals.js')), K = require(SV('kcal.js')), W = require(SV('weights.js'));
  const S = require(SV('spoil.js')), L = require(SV('lots.js')), V = require(SV('villages.js')), GM = require(SV('game-meat.js'));
  const drops = {};
  for (const id of Object.keys(A.ANIMALS)) for (const z of ['', 'hanbando', 'nippon']) drops[id + '@' + z] = A.dropsOf(id, z || undefined);
  const same = Object.keys(A.ANIMALS).filter((id) => A.dropsOf(id, 'hanbando') === A.ANIMALS[id].drops);
  const items = ['meat_game', 'meat_raw', 'meat', 'meat_cooked', 'cooked_food'].concat(T694_ITEMS);
  const row = {};
  for (const it of items) row[it] = { kg: W.kgOf(it), kcalPerKg: K.kcalPerKg(it), shelf: S.shelfOf(it), lot: L.isLot(it) };
  console.log(JSON.stringify({ on: GM.on(), drops, same, row, kcal: K.KCAL_PER_KG, alias: W.ITEM_ALIAS, derived: W.DERIVED_KG,
    shelf: S.SHELF_DAYS, map: V.playerVillageDepositMap(), catalogHas: T694_ITEMS.filter((k) => k in W.catalog()) }));
  process.exit(0);
}

// ══ 하위 실행 B — 존 하나를 띄워 도살 → 먹기 → 굽기·삶기 → 수령 → 먹기 → 곳간 ═══════════════════════
if (process.env.T694_SUB === 'zone') {
  const TMP = `/tmp/t694-game-meat-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42100 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.CRAFT_COOK_MS = process.env.CRAFT_COOK_MS || '300';   // 하네스에서만 짧게(test-craft 와 같은 손잡이)
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  // ★[T778] 순간 로트 켬 기본 — 순간 열쇠는 "같은 날 = 나이 0"을 깬다(갓 바른 고기도 지난 몇 분만큼 늙어 허기가 f 0.9999 만큼 준다).
  //   값 단언은 그대로 두고 지난 시간만 뺀다 — 존 날을 얼린다(제품의 테스트 문 · 날 문법(`T732_MOMENT_LOT=0`)엔 같은 날).
  if (process.env.T694_SUB === 'zone') H.__e2eFreezeZoneDay(true);
  const V = require(SV('villages.js'));
  const Ev = require(SV('events.js'));
  const notes = [];
  const mkP = (tag) => ({ pid: `p_${tag}`, playerId: `anon_t694_${tag}`, name: '사냥꾼', persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 20, thirst: 100,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
    isNpc: false, isDown: false, vx: 0, vy: 0,
    ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } });
  const out = { notes };
  (async () => {
    const p = mkP('a');
    for (const type of ['bear', 'deer']) { const c = H.spawnCorpse({ type, x: 5010, y: 5000 }, p.playerId); H.butcherCorpse(p, c.cid); }
    out.inv0 = Object.assign({}, p.inventory);
    // 날것 먹기 — 곰고기(켬) · 사슴·들짐승고기
    const rawBear = H.FOOD_EFFECTS.meat_bear ? 'meat_bear' : 'meat_game';
    const e0 = { h: p.hunger, hp: p.hp }; H.doEat(p, rawBear, 1); out.eatRaw = { item: rawBear, dh: +(p.hunger - e0.h).toFixed(4), dhp: p.hp - e0.hp };
    // 굽기·삶기 — 내 모닥불 앞
    out.recipes = Object.keys(H.COOK_RECIPES);
    out.rows = {}; for (const k of T694_ITEMS.slice(1)) out.rows[k] = H.COOK_RECIPES[k] || null;
    const fire = { id: 'cf694', dbId: null, type: 'campfire', ownerId: p.playerId, ownerName: p.playerId, x: 5020, y: 5000, data: {} };
    H.buildings.set(fire.id, fire);
    out.facilityCook = H._facilityRecipes(p, 'cook').map((r) => r.id);
    const before = Object.assign({}, p.inventory);
    for (const k of ['meat_game_cooked', 'meat_bear_cooked']) if (H.COOK_RECIPES[k]) H.doCook(p, k);
    out.queued = H.Facility.pending(fire); out.dishes0 = p.dishes.length;
    out.spent = { meat_game: (before.meat_game || 0) - (p.inventory.meat_game || 0), meat_bear: (before.meat_bear || 0) - (p.inventory.meat_bear || 0) };
    await new Promise((r) => setTimeout(r, 2 * H.Facility.CRAFT_MS.cook + 300));
    const day = H.zoneGameDay();
    H.doCraftCollect(p, fire.id);
    out.got = { meat_game_cooked: p.inventory.meat_game_cooked || 0, meat_bear_cooked: p.inventory.meat_bear_cooked || 0, dishes: p.dishes.length };
    out.lots = {}; for (const k of ['meat_game_cooked', 'meat_bear_cooked']) out.lots[k] = H.Lots.of(p, k).map((l) => ({ d: l.d, n: l.n }));
    out.day = day;
    // 익힌 것 먹기 — HP 그대로 · 허기 = 열량 유도
    out.eatCooked = {};
    for (const k of ['meat_game_cooked', 'meat_bear_cooked']) {
      if (!p.inventory[k]) continue;
      p.hunger = 20;   // 허기 상한(100)에 안 닿게 — 먹을 때마다 같은 자리에서 잰다
      const h0 = p.hunger, hp0 = p.hp; H.doEat(p, k, 1);
      out.eatCooked[k] = { dh: +(p.hunger - h0).toFixed(4), dhp: p.hp - hp0, eff: H.FOOD_EFFECTS[k] };
    }
    // 불 없이는 — 재료 그대로
    const far = mkP('far'); far.x = 9000; far.y = 9000; far.inventory = { meat_game: 2, meat_bear: 2 };
    for (const k of ['meat_game_cooked', 'meat_bear_cooked']) if (H.COOK_RECIPES[k]) H.doCook(far, k);
    out.farInv = Object.assign({}, far.inventory);
    // 표 · 열량 · 무게
    out.eff = {}; for (const k of ['meat_game', 'meat_bear', 'meat_raw', 'meat_cooked'].concat(T694_ITEMS)) out.eff[k] = H.FOOD_EFFECTS[k] || null;
    out.kcal = {}; for (const k of ['meat_game', 'meat_bear'].concat(T694_ITEMS)) out.kcal[k] = { kcal: H.Kcal.kcalOf(k), kg: H.Weights.kgOf(k), hunger: H.Kcal.hungerOf(k, H._SEASON_DAY_MS) };
    out.label = {}; for (const k of ['meat_game'].concat(T694_ITEMS)) out.label[k] = H.ITEM_LABEL_SERVER[k] || null;
    out.cookedFactor = H.Kcal.COOKED_FACTOR; out.dayKcal = H.Kcal.DAY_KCAL;
    // ⑥ 곳간 — 넣기(실 환산 콜백) · 대표 · 게시판·거래소
    const map = V.playerVillageDepositMap();
    out.map = {}; for (const k of ['meat_game', 'meat_bear', 'meat_game_cooked', 'meat_bear_cooked', 'fish_cooked', 'meat_cooked']) out.map[k] = map[k] || null;
    const q = mkP('q'); q.inventory = { meat_game: 10, meat_bear: 10 };
    H.Lots.reconcile(q, 'meat_game', q.inventory, H.zoneGameDay()); H.Lots.reconcile(q, 'meat_bear', q.inventory, H.zoneGameDay());
    const uf = H._unitsOfFor(q);
    out.units = { meat_game: uf('meat_game', 10), meat_bear: uf('meat_bear', 10), econ_meat_game: H.Kcal.econUnitsOf('meat_game', 10), econ_meat_bear: H.Kcal.econUnitsOf('meat_bear', 10) };
    const vil = { econ: { storage: {} } };
    const dep = V.playerVillageDeposit(vil, q.inventory, { meat_game: 10, meat_bear: 10 }, uf);
    out.dep = { ok: dep.ok, moved: dep.moved, taken: dep.taken, err: dep.err || null, storage: Object.assign({}, vil.econ.storage), invAfter: Object.assign({}, q.inventory) };
    const D = Ev.buildDeliverable(map);
    out.del = { toEconMeatGame: D.toEcon.get('meat_game') || null, itemsMeatGame: D.items.get('meat_game') || null, inFrom: D.fromEcon.has('meat_game'),
      toEconCooked: D.toEcon.get('cooked_food') || null, itemsCooked: D.items.get('cooked_food') || null };
    const back = (out.dep.storage.meat_game || 0) > 0 ? H.Kcal.itemsOf(out.del.toEconMeatGame || 'meat_game', out.dep.storage.meat_game) : null;
    out.back = back;
    console.log = _log;
    console.log(JSON.stringify(out));
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(0);
  })().catch((e) => { console.log = _log; console.log(JSON.stringify({ err: String(e && e.stack || e) })); process.exit(1); });
  return;
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const BASE_ENV = (() => { const e = Object.assign({}, process.env); e.T694_GAME_MEAT = '0'; e.T705_FOOD_SICK = '0'; delete e.T636_DROP_KG;   /* ★[PM 10-13] T694 · T705 켬 기본 — 이 하네스의 '끔' 판은 `=0` · 날고기 −3 절(⑤⑦)은 T705 끔 세계(배탈 세계는 test-food-sick) */ delete e.T694_SUB; return e; })();
const sub = (mode, env) => {
  const o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T694_SUB: mode }), stdio: 'pipe', maxBuffer: 64 << 20 });
  return JSON.parse(o.toString().trim().split('\n').pop());
};
const KSRC = fs.readFileSync(SV('kcal.js'), 'utf8');
const GSRC = fs.readFileSync(SV('game-meat.js'), 'utf8');
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const VSRC = fs.readFileSync(SV('villages.js'), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, '설계', '고증_사냥고기_조리.md'), 'utf8');
const GM = require(SV('game-meat.js'));

say('\n=== 사냥 고기 마무리 — 곰고기 열량 · 날고기 HP · 굽기·삶기 · 곳간 (T694 · 손잡이 T694_GAME_MEAT=1) ===');

// ── ① 끔 = 종전 ─────────────────────────────────────────────────────────────────────────
say('\n① 끔 = 종전 — 손잡이 없음 · 빈 값 · 0 은 같은 표 · T694 품목 0 · T636 되돌림이면 같이 꺼진다');
const tOff = sub('tables', {});
const tOn = sub('tables', { T694_GAME_MEAT: '1' });
{
  const tEmpty = sub('tables', { T694_GAME_MEAT: '' }), tZero = sub('tables', { T694_GAME_MEAT: '0' }), tTrue = sub('tables', { T694_GAME_MEAT: 'true' });
  const strip = (t) => JSON.stringify(Object.assign({}, t, { on: null }));
  ok(tOff.on === false && tEmpty.on === true && tZero.on === false && tTrue.on === true && tOn.on === true, "★① 손잡이 — 켬 기본(PM 10-13) · '0' 하나만 끔");
  ok(strip(tOff) === strip(tZero) && strip(tOn) === strip(tEmpty), '★★① 끔 판(0)은 표가 글자째 같고 · 빈 값은 켬 판과 같다(드롭·열량·무게·보관일·로트·곳간 대응)');
  const leak = [];
  for (const k of T694_ITEMS) {
    if (k in tOff.kcal || k in tOff.derived || k in tOff.alias || k in tOff.shelf || k in tOff.map) leak.push(k);
    if (tOff.row[k].lot || tOff.row[k].kg != null) leak.push(k + '(row)');
  }
  for (const d of Object.values(tOff.drops)) if (d && 'meat_bear' in d) leak.push('drop');
  ok(leak.length === 0 && tOff.catalogHas.length === 0, '★★① 끔 — T694 품목(곰고기·구운 사슴·들짐승고기·삶은 곰고기)이 어느 표에도 없다', leak.join(',') || '0');
  ok(!('meat_game' in tOff.map) && !('meat_game' in tOff.shelf) && tOff.row.meat_game.shelf === 5, '① 끔 — meat_game 은 곳간 대응 밖 · 보관일 기본값 5일(T647 그대로)', `보관 ${tOff.row.meat_game.shelf}일`);
  const tRevert = sub('tables', { T694_GAME_MEAT: '1', T636_DROP_KG: '0' });
  const offRevert = sub('tables', { T636_DROP_KG: '0' });
  ok(tRevert.on === false && strip(tRevert) === strip(offRevert), '★① T636 되돌림(=0)이면 T694 를 켜도 꺼진다 — 표가 되돌림 판과 같다(그 표 위에 선다)');
  ok(tOff.same.length === tOn.same.length + 0 && tOn.same.every((id) => tOff.same.includes(id)), '① 표 밖 종은 켬·끔 모두 카탈로그 그 객체(같은 참조)', `${tOn.same.length}종`);
}

// ── ② 수 = 출처 줄 ──────────────────────────────────────────────────────────────────────
say('\n② 수 = 출처 줄 — 곰 열량 · 조리 수율 · 1 lb · 1.12(새 수 0)');
{
  const m = KSRC.match(/KCAL_PER_KG\.meat_bear = (\d+);\s*\/\/ USDA FDC (\d+) — (\d+) kcal\/100g/);
  ok(!!m && +m[1] === +m[3] * 10 && m[2] === '173845' && /Game meat, bear, raw/.test(KSRC), '★★② 곰고기 열량 = 출처 줄 그대로(USDA FDC 173845 "Game meat, bear, raw" 161 kcal/100g × 10)', m ? `${m[1]} kcal/kg` : '없음');
  const docRow = (re) => DOC.split('\n').find((l) => re.test(l)) || '';
  const cBear = docRow(/^\|\s*C1\s*\|/);
  ok(/173845/.test(cBear) && /\*\*161\*\*/.test(cBear), '★② 고증 문서 C1 줄 = 같은 FDC · 같은 161', cBear.slice(0, 90));
  for (const [raw, id] of [['meat_game', 'Y1'], ['meat_bear', 'Y2']]) {
    const r = GM.RAW[raw], line = docRow(new RegExp('^\\|\\s*' + id + '\\s*\\|'));
    ok(!!r && new RegExp('\\*\\*' + r.cookedG + ' g\\*\\*').test(line) && line.includes(r.src.match(/FDC (\d+)/)[1]) && r.src.includes(r.cookedG + ' g'),
      `★★② ${raw} 수율 = ${r.cookedG} g / 1 lb — 코드 출처 줄 · 고증 문서 ${id} 줄이 같은 g · 같은 FDC`, `${(r.cookedG / GM.LB_G * 100).toFixed(2)}%`);
  }
  ok(GM.LB_G === 453.59237, '② 1 lb = 453.59237 g(국제 파운드 — 단위 환산 · 새 수 아님)');
  ok(/const COOKED_FACTOR = 1\.12;/.test(KSRC) && tOn.on, '② 익힌 것 열량의 계수 = kcal.js 의 econ 거울 1.12 하나(test-kcal 이 econ 소스와 대조) — 이 카드는 계수를 안 짓는다');
  const nums = GSRC.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n').match(/\b\d+(?:\.\d+)?\b/g) || [];
  const allowed = new Set(['340', '277', '453.59237', '0', '1']);
  const extra = [...new Set(nums)].filter((n) => !allowed.has(n) && !/^(17165|175085|17147|173846)$/.test(n));
  ok(extra.length === 0, '★② game-meat.js 코드의 수 = 출처 g 둘 · 1 lb · 0/1 · FDC·NDB 번호뿐(지은 수 0)', extra.join(',') || '0');
}

// ── ③ 켬 — 드롭 ─────────────────────────────────────────────────────────────────────────
say('\n③ 켬 — 곰 드롭 = 곰고기(kg 그대로) · 사슴·꿩 그대로');
{
  const bOff = tOff.drops['bear@hanbando'], bOn = tOn.drops['bear@hanbando'];
  ok(bOn.meat_bear === 36 && !('meat_game' in bOn) && bOff.meat_game === 36 && !('meat_bear' in bOff), '★★③ 곰 도살 고기 칸 — 끔 사슴·들짐승고기 36 → 켬 곰고기 36(같은 kg · 사슴 칸 안 남음)', `${JSON.stringify(bOff)} → ${JSON.stringify(bOn)}`);
  ok(Object.keys(bOn).join() === Object.keys(bOff).join().replace('meat_game', 'meat_bear'), '③ 칸 차례 그대로(고기 칸 자리에서 이름만 바뀐다)', Object.keys(bOn).join(','));
  ok(['bear@', 'bear@nippon'].every((k) => tOn.drops[k].meat_bear === 36), '③ 곰은 존을 안 가른다(존 모름 · 닛폰도 36)');
  const other = Object.keys(tOn.drops).filter((k) => !/^bear@/.test(k) && JSON.stringify(tOn.drops[k]) !== JSON.stringify(tOff.drops[k]));
  ok(other.length === 0, '★③ 곰 밖 모든 종 × 존 셋의 드롭은 켬 = 끔(사슴 33/21/27 · 꿩 1 · 표 밖 종)', other.join(',') || '0');
}

// ── ④ 켬 — 표 ───────────────────────────────────────────────────────────────────────────
say('\n④ 켬 — 열량 · 무게 · 보관일 · 로트');
{
  const r = tOn.row;
  ok(r.meat_bear.kcalPerKg === 1610 && r.meat_game.kcalPerKg === 1200 && r.meat_bear.kg === 1 && tOn.alias.meat_bear === 'meat_game',
    '★★④ 곰고기 1kg 단위(별칭 → 사슴·들짐승고기 1.0kg) · 1,610 kcal/kg · 사슴·들짐승고기 1,200 그대로', `곰 ${r.meat_bear.kg}kg × ${r.meat_bear.kcalPerKg}`);
  ok(Math.abs(r.meat_game_cooked.kg - 340 / 453.59237) < 1e-12 && Math.abs(r.meat_bear_cooked.kg - 277 / 453.59237) < 1e-12,
    '★★④ 익힌 것 1개 kg = 날것 1kg × USDA 수율(구운 사슴·들짐승고기 0.7496 · 삶은 곰고기 0.6107)', `${r.meat_game_cooked.kg.toFixed(4)} · ${r.meat_bear_cooked.kg.toFixed(4)}kg`);
  ok(!('meat_game_cooked' in tOn.kcal) && !('meat_bear_cooked' in tOn.kcal), '④ 익힌 둘은 열량 표에 안 적었다(레시피에서 유도 — 실기 ⑤ 가 값을 잰다)');
  ok(r.meat_game.shelf === 2.5 && r.meat_bear.shelf === 2.5 && r.meat_raw.shelf === 2.5 && r.meat_game_cooked.shelf === 3.5 && r.meat_bear_cooked.shelf === 3.5 && r.meat_cooked.shelf === 3.5,
    '★★④ 보관일 = spoil.js 고기 줄 — 날것 RAW_FLESH 2.5일(meat_game 은 5 → 2.5 · meat_raw 와 같다) · 익힌 것 COOKED 3.5일', `meat_game ${tOff.row.meat_game.shelf} → ${r.meat_game.shelf}`);
  ok(T694_ITEMS.every((k) => r[k].lot) && r.meat_game.lot, '④ 곰고기 · 익힌 둘 · 사슴·들짐승고기 = 로트(상한다)');
  ok(tOn.catalogHas.length === 3, '④ 무게 카탈로그(클라 페이로드)에 셋이 든다', tOn.catalogHas.join(','));
}

// ── ⑤ 실기 ──────────────────────────────────────────────────────────────────────────────
say('\n⑤ 실기 — 존을 띄워 도살 → 먹기 → 굽기·삶기 → 수령 → 먹기');
const zOn = sub('zone', { T694_GAME_MEAT: '1' });
const zOff = sub('zone', {});
const zOnLot0 = sub('zone', { T694_GAME_MEAT: '1', T732_MOMENT_LOT: '0' });   // ★[T778] 끔 탐침 — 순간 로트 끔(날 로트)
{
  pre(!zOn.err && !zOff.err, '존 두 판이 떴다', zOn.err || zOff.err || '');
  ok(zOn.inv0.meat_bear === 36 && zOn.inv0.meat_game === 33 && zOff.inv0.meat_game === 69 && !zOff.inv0.meat_bear,
    '★★⑤ 도살 — 켬: 곰고기 36 + 사슴·들짐승고기 33 · 끔: 사슴·들짐승고기 69(곰 36 이 섞였다 · T647 그대로)', `${JSON.stringify(zOn.inv0)} | ${JSON.stringify(zOff.inv0)}`);
  const k = zOn.kcal, bearH = k.meat_bear.hunger;
  ok(zOn.eatRaw.item === 'meat_bear' && Math.abs(zOn.eatRaw.dh - bearH) < 1e-6 && zOn.eatRaw.dhp === -3 && Math.abs(bearH - 1610 / 2450 * 50) < 0.01,
    '★★⑤ 곰고기 날로 먹기 — 허기 +32.86(1kg × 1,610 ÷ 2,450 × 50) · HP −3(날고기 줄 그대로)', `허기 +${zOn.eatRaw.dh} · HP ${zOn.eatRaw.dhp}`);
  ok(!zOnLot0.err && zOnLot0.eatRaw.item === zOn.eatRaw.item && Math.abs(zOnLot0.eatRaw.dh - zOn.eatRaw.dh) < 1e-9 && zOnLot0.eatRaw.dhp === zOn.eatRaw.dhp && JSON.stringify(zOnLot0.inv0) === JSON.stringify(zOn.inv0),
    '⑤ [T778 끔 탐침] 순간 로트 끔(`T732_MOMENT_LOT=0`)에서도 같은 도살 · 같은 날로 먹기(허기 · HP)', `허기 +${zOnLot0.eatRaw && zOnLot0.eatRaw.dh}`);
  ok(zOff.eatRaw.item === 'meat_game' && Math.abs(zOff.eatRaw.dh - 1200 / 2450 * 50) < 0.01 && zOff.eatRaw.dhp === -3, '⑤ 끔 — 곰 고기도 사슴 열량(+24.49 · T647 회부 ① 그대로)', `+${zOff.eatRaw.dh}`);
  ok(zOn.rows.meat_game_cooked && zOn.rows.meat_game_cooked.item === true && JSON.stringify(zOn.rows.meat_game_cooked.cost) === '{"meat_game":1}'
    && zOn.rows.meat_bear_cooked && JSON.stringify(zOn.rows.meat_bear_cooked.cost) === '{"meat_bear":1}' && zOn.facilityCook.includes('meat_game_cooked') && zOn.facilityCook.includes('meat_bear_cooked'),
  '★⑤ 켬 — 요리 레시피 두 줄(날것 1 → 익힌 것 1 · 품목) · 모닥불 창에 뜬다', zOn.facilityCook.join(','));
  ok(!zOff.recipes.includes('meat_game_cooked') && !zOff.recipes.includes('meat_bear_cooked') && zOff.recipes.join() === 'meat_cooked,berry_jam,food_cooked,fish_cooked,clam_stew,seaweed_soup',
    '★⑤ 끔 — 요리 레시피는 종전 여섯 그대로(main)', zOff.recipes.join(','));
  ok(zOn.queued === 2 && zOn.dishes0 === 0 && zOn.spent.meat_game === 1 && zOn.spent.meat_bear === 1, '★⑤ 굽기·삶기 = 불에 올려 두는 것(대기 2 · 재료 1씩 나갔다 · 요리 인스턴스 0)', `대기 ${zOn.queued}`);
  ok(zOn.got.meat_game_cooked === 1 && zOn.got.meat_bear_cooked === 1 && zOn.got.dishes === 0, '★★⑤ 수령 — 품목으로 손에 든다(구운 사슴·들짐승고기 1 · 삶은 곰고기 1 · 요리 인스턴스 0)', JSON.stringify(zOn.got));
  ok(['meat_game_cooked', 'meat_bear_cooked'].every((x) => zOn.lots[x].length === 1 && zOn.lots[x][0].n === 1 && zOn.lots[x][0].d === zOn.day),
    '⑤ 로트 장부 — 취득일 = 완성일(보존 가공과 같은 수령 길)', JSON.stringify(zOn.lots));
  const f = zOn.cookedFactor;
  ok(Math.abs(k.meat_game_cooked.kcal - 1200 * f) < 1e-9 && Math.abs(k.meat_bear_cooked.kcal - 1610 * f) < 1e-9,
    '★★④⑤ 익힌 것 열량 = 재료 열량 × 1.12(kcal.js §2 · 세계에 조리 이득 하나)', `${k.meat_game_cooked.kcal.toFixed(1)} · ${k.meat_bear_cooked.kcal.toFixed(1)} kcal/개`);
  const per = (x) => k[x].kcal / k[x].kg;
  ok(Math.abs(per('meat_game_cooked') - 1200 * f / (340 / 453.59237)) < 1e-6 && Math.abs(per('meat_bear_cooked') - 1610 * f / (277 / 453.59237)) < 1e-6,
    '★④ kg 당 열량 = 유도(열량 ÷ 수율 무게) — 표에 안 적었다', `${per('meat_game_cooked').toFixed(0)} · ${per('meat_bear_cooked').toFixed(0)} kcal/kg`);
  const eg = zOn.eatCooked.meat_game_cooked, eb = zOn.eatCooked.meat_bear_cooked;
  ok(eg && eb && eg.dhp === 0 && eb.dhp === 0 && !('hpDelta' in eg.eff) && !('hpDelta' in eb.eff), '★★⑤ 익힌 것 먹기 — HP 그대로(날고기 패널티 없음 · meat_cooked 줄 그대로)', `HP ${eg && eg.dhp} · ${eb && eb.dhp}`);
  ok(eg && eb && Math.abs(eg.dh - k.meat_game_cooked.hunger) < 1e-6 && Math.abs(eb.dh - k.meat_bear_cooked.hunger) < 1e-6 && Math.abs(eg.dh - 1200 * f / 2450 * 50) < 0.01,
    '★⑤ 익힌 것 허기 = 열량 유도(구운 사슴·들짐승고기 +27.43 · 삶은 곰고기 +36.80)', `+${eg && eg.dh} · +${eb && eb.dh}`);
  ok(zOn.farInv.meat_game === 2 && zOn.farInv.meat_bear === 2, '⑤ 불 없이는 안 된다(재료 그대로)', JSON.stringify(zOn.farInv));
  ok(zOn.label.meat_bear === '곰고기' && zOn.label.meat_game_cooked === '구운 사슴·들짐승고기' && zOn.label.meat_bear_cooked === '삶은 곰고기' && zOn.label.meat_game === '사슴·들짐승고기',
    '⑤ 이름표 — 서버 표(클라가 받는 그 표)', JSON.stringify(zOn.label));
  ok(T694_ITEMS.every((x) => zOff.eff[x] === null && zOff.label[x] === null), '⑤ 끔 — 먹기 표 · 이름표에 T694 품목 없음(main)');
  ok((zOn.notes || []).some((s) => /곰 도살 \+meat_bear 36/.test(s)), '⑤ 도살 알림이 곰고기를 말한다', (zOn.notes || []).find((s) => /곰 도살/.test(s)) || '');
}

// ── ⑥ 곳간 ──────────────────────────────────────────────────────────────────────────────
say('\n⑥ 곳간 — 넣기 단위 = 열량 · 대표 = 사슴·들짐승고기 · 게시판·거래소');
{
  const m = zOn.map;
  ok(m.meat_game === 'meat_game' && m.meat_bear === 'meat_game' && m.meat_game_cooked === 'cooked_food' && m.meat_bear_cooked === 'cooked_food',
    '★★⑥ 켬 — 곳간 넣기 표 넷(사슴·들짐승고기 항등 · 곰고기 → 사슴·들짐승고기 · 익힌 둘 → cooked_food)', JSON.stringify(m));
  ok(Object.values(zOff.map).filter(Boolean).join() === 'cooked_food,cooked_food' && !zOff.map.meat_game, '⑥ 끔 — meat_game 은 표 밖(T647 그대로 · 익힌 고기·생선 줄만)');
  const u = zOn.units;
  ok(Math.abs(u.meat_game - 10 * 1200 / 2450) < 1e-4 && Math.abs(u.meat_bear - 10 * 1610 / 2450) < 1e-4 && Math.abs(u.meat_game - u.econ_meat_game) < 1e-4,
    '★★⑥ 넣기 단위 = 열량 ÷ 하루치(실 _unitsOfFor — 갓 잡은 것) · 사슴 10kg = 4.898 · 곰 10kg = 6.571 단위', `${u.meat_game} · ${u.meat_bear}`);
  ok(zOn.dep.ok && zOn.dep.taken.meat_game === 10 && zOn.dep.taken.meat_bear === 10 && Math.abs(zOn.dep.storage.meat_game - (u.meat_game + u.meat_bear)) < 2e-3 && !zOn.dep.invAfter.meat_game && !zOn.dep.invAfter.meat_bear,
    '★★⑥ 곳간에 넣었다 — 두 품목이 econ meat_game 한 칸으로(손에서 빠지고 곳간이 는다)', JSON.stringify(zOn.dep.storage));
  ok(!zOff.dep.ok && /넣을 수 있는 물건이 없습니다/.test(zOff.dep.err || ''), '⑥ 끔 — 곳간이 안 받는다(T647 그대로)', zOff.dep.err || '');
  const d = zOn.del;
  ok(d.toEconMeatGame === 'meat_game' && d.itemsMeatGame.join() === 'meat_game,meat_bear' && d.inFrom, '★⑥ 꺼내기·보상 대표 = 사슴·들짐승고기 · 게시판·거래소(fromEcon)에 meat_game', JSON.stringify(d.itemsMeatGame));
  ok(d.toEconCooked === 'fish_cooked' && d.itemsCooked.slice(-2).join() === 'meat_game_cooked,meat_bear_cooked' && zOff.del.toEconCooked === 'fish_cooked',
    '⑥ cooked_food 대표는 종전 그대로(fish_cooked) — 익힌 둘은 뒤에 붙는다', d.itemsCooked.join(','));
  const back = zOn.back;
  ok(back && back.items >= 1 && Math.abs((back.items * 1200 + back.leftUnits * 2450) - (10 * 1200 + 10 * 1610)) < 5,
    '★⑥ 꺼내면 사슴·들짐승고기로 — 열량이 보존된다(곰 10kg + 사슴 10kg = 28,100 kcal → 사슴 23개 + 남는 몫 곳간)', `${back && back.items}개 · 남는 ${back && back.leftUnits}단위`);
  ok(!zOff.del.inFrom && zOff.del.toEconMeatGame === null, '⑥ 끔 — 게시판·거래소가 meat_game 을 모른다(main)');
  ok(/if \(process\.env\.T694_GAME_MEAT !== '0' && require\('\.\/game-meat'\)\.on\(\)\) Object\.assign\(PV_DEPOSIT_MAP, \{/.test(VSRC),
    '⑥ 배선 — villages.js 는 손잡이가 꺼져 있으면 game-meat.js 를 부르지도 않는다(econ 랩 적재 목록 무변)');
}

// ── ⑦ 날고기 HP −3 ──────────────────────────────────────────────────────────────────────
say('\n⑦ 날고기 HP −3 — 정본 자리 한 곳 · 사본 둘(meat_game T647 · meat_bear T694) · 익힌 줄엔 없다');
{
  const src = (ZSRC.match(/hpDelta:\s*-?\d+/g) || []);
  ok(src.length === 1 && /meat_raw:\s*\{ thirst: 0, hpDelta: -3 \}, \/\/ 날고기는 약간 해로움/.test(ZSRC), '★★⑦ HP −3 이 적힌 자리는 zone.js `FOOD_EFFECTS.meat_raw` 한 곳(21be0a28 · 2026-05-29 · 주석 "날고기는 약간 해로움")', src.join(' '));
  const e = zOn.eff;
  ok(e.meat_bear && e.meat_bear.hpDelta === -3 && e.meat_game.hpDelta === -3 && e.meat_raw.hpDelta === -3, '⑦ 켬 — 곰고기·사슴·들짐승고기 = 그 줄 사본(−3)');
  ok(['meat_game_cooked', 'meat_bear_cooked', 'meat_cooked'].every((x) => e[x] && !('hpDelta' in e[x])), '⑦ 익힌 셋엔 hpDelta 가 없다 — 굽기와 짝(익히면 패널티가 사라진다)');
  const dm = ZSRC.match(/if \(eff\.hpDelta < 0\) \{ damagePlayer\(target, -eff\.hpDelta \* ate, `food:\$\{item\}`\); \}/);
  ok(!!dm, '⑦ −3 은 먹은 개수만큼 곱해 정본 피해 경로(damagePlayer)로 간다 — 1개 = 1kg 이라 날고기 n kg = −3n HP(보고 표)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
