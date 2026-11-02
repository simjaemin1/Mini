#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1065-tool-gate.js — T1065: 맨손으로 벌목 · 채석 · 공격 · 낚시 · 활이 안 된다(`T1065_TOOL_GATE`) ==========
//
// ★[T1065 · ★재민 11-01] "낚시나 공격이 시작하자마자 가능한데 불가능해야 한다. 벌목 · 낚시 · 공격은 전부 도구나 무기가 있어야 하고,
//   그 도구를 만들 수 있는 시기를 훨씬 앞당겨야 한다 — 나뭇가지만 주워도 만들 수 있는 급조 무기 같은 것."
//   ⇒ 이 하네스는 **진짜 서버 함수**(`gatherResource` · `tryGather` · `tryAttack` · `tryRangedAttack` · `tryFishCast` · `doCraft` · `doEquip`)를
//     가짜 소켓 사람으로 부른다(결과를 지어내지 않는다 · 서버가 보낸 글자 · 자원 hp · 몹 hp 를 읽는다).
//   켬 · 끔 두 판을 **새 프로세스**로 띄운다(손잡이는 모듈 머리에서 읽힌다).
//   ① 글자 — 손잡이 · 다섯 문 · NPC 길 무접촉.
//   ② 켬 — 맨손 거부 + 이유 한 줄(하십시오체 · 만드는 법) · 급조 도구로 된다(배수 · 내구 그대로) · 가졌는데 안 들면 "손에 들어야".
//          맨손 줍기 · 덤불은 된다 · 숲에서 맨손 E = 나무가 아니라 잔가지 줍기 · NPC 는 문 밖.
//   ③ 끔 — 맨손으로 다 된다(종전 · 자명 통과 금지 대조) · 낚싯대 레시피 없음.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ─────────────────────────────── 아이 — 한 판 재고 JSON 한 줄 ───────────────────────────────
if (process.env.T1065_CHILD === '1') {
  const TMP = `/tmp/test-t1065-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(41000 + (process.pid % 900));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.LATENCY_MS = '0';
  process.env.FISH_TICK_MS = '999000';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const out = { knob: H.T1065_TOOL_GATE, rod: !!H.RECIPES.crude_rod, rodCost: H.RECIPES.crude_rod ? H.RECIPES.crude_rod.cost : null,
    rodDura: H.TOOL_MAX_DURABILITY.crude_rod || null, axeDura: H.TOOL_MAX_DURABILITY.crude_axe };
  let _pid = 0, _mid = 0;
  const mkPlayer = (x, y) => {
    const notices = [], msgs = [];
    const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); msgs.push(o); if (o.type === 'notice') notices.push(o); } catch (e) {} } };
    return { pid: `t1065p${++_pid}`, playerId: `t1065_${_pid}`, name: '빈손', ws, x, y, floor: 0, inventory: {}, toolItems: [], equipment: [], equipSlots: {},
      equipped: null, hotkey1: null, tribeId: null, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, craftSkill: {}, lastAttackAt: 0, lastRangedAt: 0,
      vp: 0, isDown: false, persistent: false, notices, msgs };
  };
  const last = (p) => (p.notices.length ? p.notices[p.notices.length - 1] : null);
  const give = (p, inv) => { for (const [k, v] of Object.entries(inv)) p.inventory[k] = (p.inventory[k] || 0) + v; };
  const craftEquip = (p, name) => {   // 정본 길 — 재료를 쥐여 주고 `doCraft` · `doEquip`(사람이 누르는 그 두 문)
    const r = H.RECIPES[name]; if (!r) return null;
    give(p, r.cost);
    H.doCraft(p, name);
    const inst = p.toolItems.find((t) => t.type === name);
    if (inst) H.doEquip(p, inst.id);
    return inst || null;
  };
  // 자연물 — 청크 정본(`generateChunkResources` — 존이 청크를 올릴 때 쓰는 그 표)에서 진짜 개체를 꺼내 존 맵에 세운다(사람이 다가가면 서는 그 몸 · 모양 그대로)
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const ZB = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando.biome;
  const pool = [];
  for (let k = 0; k < 60; k++) for (const r of (CH.generateChunkResources('hanbando', ZB, k, k, CH.CHUNK_SIZE, new Set(), 0) || [])) pool.push(r);
  const put = (r) => { if (!H.resources.has(r.id)) H.resources.set(r.id, r); return r; };
  const resOf = (type) => pool.filter((r) => r.type === type && r.hp > 0);
  // ── 자연물 하나씩 — 맨손 · 도구 ──
  const res = {};
  for (const [kind, type, tool] of [['chop', 'tree', 'crude_axe'], ['quarry', 'rock', 'crude_pick'], ['bush', 'berry_bush', null]]) {
    const r0 = resOf(type)[0];
    if (!r0) { res[kind] = { none: true }; continue; }
    const r = put(r0);
    const p = mkPlayer(r.x + 10, r.y);
    const hp0 = r.hp; H.gatherResource(p, r);
    const hpBare = H.resources.has(r.id) ? r.hp : 'gone';
    const o = { type, hp0, hpBare, bareText: (last(p) || {}).text || null, bareStop: (last(p) || {}).stop || null, bareInv: Object.keys(p.inventory).length };
    if (tool) {
      // 가졌는데 안 들었다
      give(p, H.RECIPES[tool].cost); H.doCraft(p, tool);
      const inst = p.toolItems.find((t) => t.type === tool);
      p.notices.length = 0; H.gatherResource(p, r);
      o.ownText = (last(p) || {}).text || null; o.hpOwn = r.hp;
      if (inst) H.doEquip(p, inst.id);
      const d0 = inst ? inst.d : null;
      p.notices.length = 0; H.gatherResource(p, r);
      o.hpTool = H.resources.has(r.id) ? r.hp : 'gone'; o.toolText = (last(p) || {}).text || null; o.mult = H.TOOL_EFFECTS[tool][kind === 'chop' ? 'gatherWoodMult' : 'gatherStoneMult'];
      o.dura = inst ? [d0, inst.d, inst.max] : null;
    }
    res[kind] = o;
  }
  out.res = res;
  // ── 숲에서 맨손 E(최근접) — 나무가 곁에 있어도 잔가지를 줍는다(줍기가 되는 자리면) ──
  {
    const ctx = H._forageCtx(mkPlayer(0, 0));
    let spot = null;
    for (const r of resOf('tree')) {
      for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20], [30, 10]]) {
        const x = r.x + dx, y = r.y + dy;
        const src = H.Forage.sourceAt(x, y, ctx);
        if (src && src.kind === 'twig' && H.Forage.left(src.key, Date.now()) >= 1) { spot = { x, y, tree: r }; break; }
      }
      if (spot) break;
    }
    if (spot) {
      put(spot.tree);
      const p = mkPlayer(spot.x, spot.y);
      const hp0 = spot.tree.hp;
      H.tryGather(p);
      out.forest = { found: true, inv: Object.assign({}, p.inventory), text: (last(p) || {}).text || null, treeHp: [hp0, spot.tree.hp] };
    } else out.forest = { found: false };
  }
  // ── 바위 곁 맨손 E — 지형만으론 주울 게 없는 자리(③′ 바위 개체 둘레 자갈 · 켬만) ──
  {
    const ctx0 = H._forageCtx(mkPlayer(0, 0)); const bare = Object.assign({}, ctx0, { rockNear: undefined });
    let spot = null;
    for (const r of resOf('rock')) {
      const x = r.x + 20, y = r.y;
      if (!H.Forage.sourceAt(x, y, bare) && !ctx0.isWater(x, y) && !ctx0.isRock(x, y)) {
        const others = pool.filter((e) => e !== r && e.type !== 'rock' && Math.hypot(e.x - x, e.y - y) < 60);
        if (!others.length) { spot = { x, y, rock: r }; break; }
      }
    }
    if (spot) {
      put(spot.rock);
      const p = mkPlayer(spot.x, spot.y);
      const hp0 = spot.rock.hp;
      H.tryGather(p);
      out.rockSide = { found: true, inv: Object.assign({}, p.inventory), text: (last(p) || {}).text || null, rockHp: [hp0, H.resources.has(spot.rock.id) ? spot.rock.hp : 'gone'] };
    } else out.rockSide = { found: false };
  }
  // ── 공격 — 맨손 · 조잡한 돌칼 · 무기 장비 ──
  {
    H.mobs.clear();
    const type = Object.keys(H.MOB_DEFS).find((k) => !H.MOB_DEFS[k].tameFood && H.MOB_DEFS[k].maxHp >= 40) || 'deer';
    const p = mkPlayer(5000, 5000);
    const m = { mid: `t1065m${++_mid}`, type, x: p.x + 20, y: p.y, z: 0, floor: 0, hp: 40, maxHp: H.MOB_DEFS[type].maxHp,
      tameOwner: null, tameOwnerName: null, tameProgress: 0, aggroTarget: null, dirty: false };
    H.mobs.set(m.mid, m);
    p.lastAttackAt = 0; H.tryAttack(p);
    const bare = { hp: m.hp, text: (last(p) || {}).text || null };
    const inst = craftEquip(p, 'crude_blade');
    p.notices.length = 0; p.lastAttackAt = 0; H.tryAttack(p);
    out.attack = { type, bare, blade: { hp: m.hp, made: !!inst, text: (last(p) || {}).text || null, mult: H.TOOL_EFFECTS.crude_blade.attackMult, base: H.PLAYER_ATTACK_DAMAGE } };
    // 화살 — 활 아이템 없음
    const q = mkPlayer(5000, 5000); const n0 = H.arrows ? H.arrows.size : null;
    H.tryRangedAttack(q, q.x + 100, q.y);
    out.ranged = { text: (last(q) || {}).text || null, arrows: H.arrows ? [n0, H.arrows.size] : null };
    // 칼을 들고도 활은 아니다
    p.notices.length = 0; p.lastRangedAt = 0; H.tryRangedAttack(p, p.x + 100, p.y);
    out.ranged.withBlade = (last(p) || {}).text || null;
    H.mobs.clear();
  }
  // ── 낚시 — 물가 자리를 찾아 맨손 · 막대 낚싯대 ──
  {
    let p = null, tgt = null;
    for (let i = 0; i < 4000 && !tgt; i++) {
      const x = 1000 + (i * 977) % 60000, y = 1000 + (i * 1361) % 60000;
      const c = mkPlayer(x, y);
      if (H._castTargetFor(c)) { p = c; tgt = true; }
    }
    if (p) {
      H.tryFishCast(p);
      const bare = { fish: !!p._fish, text: (last(p) || {}).text || null };
      const inst = craftEquip(p, 'crude_rod');
      p.notices.length = 0; p._fish = null;
      const d0 = inst ? inst.d : null;
      H.tryFishCast(p);
      out.fish = { found: true, bare, rod: { made: !!inst, fish: !!(p._fish && p._fish.state === 'wait'), text: (last(p) || {}).text || null, dura: inst ? [d0, inst.d] : null } };
    } else out.fish = { found: false };
  }
  // ── NPC 는 문 밖 ──
  { const n = mkPlayer(0, 0); n.isNpc = true; out.npc = ['chop', 'quarry', 'attack', 'fish', 'ranged'].map((k) => H._t1065Gate(n, k)); }
  out.stat = H.t1065Stat;
  console.log = _l; console.warn = _w; console.error = _e;
  process.stdout.write('@@T1065 ' + JSON.stringify(out) + '\n');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ─────────────────────────────── 부모 — 글자 · 두 판 · 단언 ───────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const run = (gate) => {
  const env = Object.assign({}, process.env, { T1065_CHILD: '1', T1065_TOOL_GATE: gate });
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env, encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1065 '));
  if (!line) { console.log(`  (아이 ${gate} 끝 코드 ${r.status} · ${(r.stderr || '').slice(-400)})`); return null; }
  return JSON.parse(line.slice(8));
};
console.log('\n=== T1065 맨손 벌목 · 채석 · 공격 · 낚시 · 활 — 도구가 있어야(`T1065_TOOL_GATE`) ===');

console.log('\n① 글자');
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok(/const T1065_TOOL_GATE = process\.env\.T1065_TOOL_GATE !== '0';/.test(Z), '손잡이 — 켬 기본 · `=0` 만 끔');
const fnBody = (name) => { const i = Z.indexOf(`function ${name}(`); if (i < 0) return ''; const j = Z.indexOf('\nfunction ', i + 10); const k = Z.indexOf('\nasync function ', i + 10); return Z.slice(i, Math.min(j < 0 ? Z.length : j, k < 0 ? Z.length : k)); };
ok(/_t1065ResGate\(player, best\)/.test(fnBody('gatherResource')), '문 하나 — 자연물 캐기(`gatherResource` — 지목 · 최근접 두 길이 다 지난다)');
ok(/_t1065Gate\(player, 'attack'\)/.test(fnBody('tryAttack')), '문 둘 — 사람 공격(`tryAttack`)');
ok(/_t1065Gate\(player, 'ranged'\)/.test(fnBody('tryRangedAttack')), '문 셋 — 화살(`tryRangedAttack`)');
ok(/_t1065Gate\(player, 'fish'\)/.test(fnBody('tryFishCast')), '문 넷 — 낚시 던지기(`tryFishCast` · 챔질 · 끌어올리기는 이미 던진 줄)');
ok(/_t1065ResGate\(player, r, true\)/.test(fnBody('tryGather')), '최근접 고르기 — 손에 맞는 것을 고르고 · 없으면 줍기 · 그것도 없으면 건너뛴 것의 이유');
ok(!/_t1065/.test(fnBody('npcStep')) && !/_t1065/.test(fnBody('_t325CutTreeAt')), 'NPC 길 무접촉(`npcStep` · `_t325CutTreeAt` — 주민은 직업 도구를 쥔 꼴)');
const SU = require(path.join(ROOT, 'server', 'stone-uses.js'));
ok(!SU.CRUDE_TOOLS.crude_rod, '막대 낚싯대는 econ 막석기 표(`StoneUses.CRUDE_TOOLS`) 밖 — econ 단가 무변');

const ON = run(''), OFF = run('0');
ok(!!ON && !!OFF, '[상황] 켬 · 끔 두 판이 떴다', `${!!ON} · ${!!OFF}`);
if (ON && OFF) {
  const R = ON.res, Q = OFF.res;
  console.log('\n② 켬 — 맨손 거부 + 이유 · 급조 도구로 된다');
  ok(ON.knob === true && OFF.knob === false, '[상황] 손잡이가 env 대로 섰다(없음 = 켬 · `=0` = 끔)', `${ON.knob} · ${OFF.knob}`);
  ok(!R.chop.none && !R.quarry.none && !R.bush.none, '[상황] 나무 · 바위 · 덤불이 세계에 있다', `${R.chop.type} hp${R.chop.hp0} · ${R.quarry.type} hp${R.quarry.hp0} · ${R.bush.type} hp${R.bush.hp0}`);
  ok(R.chop.hpBare === R.chop.hp0 && R.chop.bareInv === 0, '★★맨손 벌목 — 나무 hp 그대로 · 얻은 것 0', `hp ${R.chop.hp0} → ${R.chop.hpBare}`);
  ok(/조잡한 돌도끼가 있어야 나무를 벨 수 있습니다\. .*자갈 2개.*잔가지 1개.*풀 2개.*만들 수 있습니다\./.test(R.chop.bareText || ''), '★★맨손 벌목 — 이유 한 줄 + 만드는 법(레시피 표의 재료 그대로 · 하십시오체)', R.chop.bareText);
  ok(R.chop.bareStop === 'gather', '★거절 알림이 채집 반복을 멈추라고 한다(`stop: gather` — 될 수 없는 일을 1초마다 다시 보내지 않게)', R.chop.bareStop);
  ok(/조잡한 돌도끼를 손에 들어야 나무를 벨 수 있습니다/.test(R.chop.ownText || '') && R.chop.hpOwn === R.chop.hp0, '★가졌는데 안 들었다 — "손에 들어야" · hp 그대로', R.chop.ownText);
  ok(R.chop.hpTool === R.chop.hp0 - R.chop.mult || (R.chop.hpTool === 'gone' && R.chop.hp0 <= R.chop.mult), '★★조잡한 돌도끼를 들면 벤다 — 배수 그대로(`TOOL_EFFECTS.crude_axe`)', `hp ${R.chop.hp0} → ${R.chop.hpTool} · 배수 ${R.chop.mult}`);
  ok(R.chop.dura && R.chop.dura[1] === R.chop.dura[0] - 1, '조잡한 돌도끼 내구 1 닳음(종전 문법)', JSON.stringify(R.chop.dura));
  ok(R.quarry.hpBare === R.quarry.hp0 && /조잡한 돌괭이가 있어야 돌을 캘 수 있습니다/.test(R.quarry.bareText || ''), '★★맨손 채석 — hp 그대로 · 이유 한 줄', R.quarry.bareText);
  ok(R.quarry.hpTool === R.quarry.hp0 - R.quarry.mult || (R.quarry.hpTool === 'gone' && R.quarry.hp0 <= R.quarry.mult), '★조잡한 돌괭이를 들면 캔다 — 배수 그대로', `hp ${R.quarry.hp0} → ${R.quarry.hpTool}`);
  ok(R.bush.hpBare !== R.bush.hp0, '★맨손 덤불 — 된다(맨손 = 줍기 · 따기 · 덤불)', `hp ${R.bush.hp0} → ${R.bush.hpBare}`);
  ok(ON.forest.found, '[상황] 나무 곁 잔가지 줍는 자리가 있다');
  if (ON.forest.found) ok((ON.forest.inv.twig || 0) === 1 && ON.forest.treeHp[0] === ON.forest.treeHp[1], '★★숲에서 맨손 E — 나무가 아니라 잔가지를 줍는다(나무 hp 그대로)', `${JSON.stringify(ON.forest.inv)} · 나무 ${ON.forest.treeHp.join('→')}`);
  ok(ON.rockSide.found, '[상황] 지형만으론 주울 게 없는 바위 곁 자리가 있다(덤불 · 나무 60px 밖)');
  if (ON.rockSide.found) ok((ON.rockSide.inv.pebble || 0) === 1 && ON.rockSide.rockHp[0] === ON.rockSide.rockHp[1], '★★바위 곁 맨손 E — 바위는 그대로 · 그 곁 자갈 하나를 줍는다(줍기 ③′ · 첫 급조 도구 재료가 끊기지 않는다)', `${JSON.stringify(ON.rockSide.inv)} · 바위 ${ON.rockSide.rockHp.join('→')} · ${ON.rockSide.text}`);
  const A = ON.attack;
  ok(A.bare.hp === 40 && /조잡한 돌칼이 있어야 싸울 수 있습니다/.test(A.bare.text || ''), '★★맨손 공격 — 짐승 hp 그대로 · 이유 한 줄', `${A.type} 40 → ${A.bare.hp} · ${A.bare.text}`);
  ok(A.blade.made && A.blade.hp === 40 - Math.round(A.blade.base * A.blade.mult), '★★조잡한 돌칼을 들면 친다 — 피해 = 맨손 × 배수(그대로)', `40 → ${A.blade.hp} · ${A.blade.base} × ${A.blade.mult}`);
  ok(/활이 있어야 활을 쏠 수 있습니다\. 활은 아직 만들 수 없습니다\./.test(ON.ranged.text || '') && (!ON.ranged.arrows || ON.ranged.arrows[0] === ON.ranged.arrows[1]), '★★빈손 화살 — 안 나간다 · 활이 아직 없다고 말한다(회부)', `${ON.ranged.text} · 화살 ${JSON.stringify(ON.ranged.arrows)}`);
  ok(/활이 있어야/.test(ON.ranged.withBlade || ''), '칼을 들어도 활은 아니다', ON.ranged.withBlade);
  ok(ON.fish.found, '[상황] 던질 수 있는 물가 자리가 있다');
  if (ON.fish.found) {
    ok(!ON.fish.bare.fish && /막대 낚싯대가 있어야 낚시를 할 수 있습니다\. 잔가지 1개, 풀 2개로/.test(ON.fish.bare.text || ''), '★★맨손 낚시 — 안 던진다 · 이유 한 줄 + 만드는 법', ON.fish.bare.text);
    ok(ON.fish.rod.made && ON.fish.rod.fish, '★★막대 낚싯대를 들면 던진다(입질 대기)', ON.fish.rod.text);
    ok(ON.fish.rod.dura && ON.fish.rod.dura[1] === ON.fish.rod.dura[0] - 1, '막대 낚싯대 내구 — 던질 때 1', JSON.stringify(ON.fish.rod.dura));
  }
  ok(ON.rod && JSON.stringify(ON.rodCost) === JSON.stringify({ twig: SU.CRUDE_TOOLS.crude_axe.cost.twig, fiber: SU.CRUDE_TOOLS.crude_axe.cost.fiber }) && ON.rodDura === ON.axeDura,
    '★막대 낚싯대 = 조잡한 돌도끼에서 돌 날을 뺀 몫 · 내구 = 돌도끼(표에서 유도 · 새 수 0)', `${JSON.stringify(ON.rodCost)} · 내구 ${ON.rodDura}`);
  ok(ON.npc.every((v) => v === null), '★NPC 는 문 밖(다섯 동사 모두 null)', JSON.stringify(ON.npc));

  console.log('\n③ 끔 — 종전(맨손으로 다 된다 · 자명 통과 금지 대조)');
  ok(Q.chop.hpBare !== Q.chop.hp0 && !Q.chop.bareText, '★★[자명 통과 금지] 끔 — 맨손 벌목이 된다(종전)', `hp ${Q.chop.hp0} → ${Q.chop.hpBare}`);
  ok(Q.quarry.hpBare !== Q.quarry.hp0, '끔 — 맨손 채석이 된다(종전)', `hp ${Q.quarry.hp0} → ${Q.quarry.hpBare}`);
  ok(OFF.attack.bare.hp === 40 - OFF.attack.blade.base, '★★[자명 통과 금지] 끔 — 맨손 공격이 맨손 피해로 친다(종전)', `40 → ${OFF.attack.bare.hp}`);
  ok(!/활이 있어야/.test(OFF.ranged.text || '') && (!OFF.ranged.arrows || OFF.ranged.arrows[1] === OFF.ranged.arrows[0] + 1), '끔 — 빈손 화살이 나간다(종전 · 관대하게 허용)', JSON.stringify(OFF.ranged.arrows));
  if (OFF.fish.found) ok(OFF.fish.bare.fish === true, '★[자명 통과 금지] 끔 — 맨손 낚시가 던져진다(종전)', OFF.fish.bare.text);
  if (OFF.forest.found) ok(OFF.forest.treeHp[1] < OFF.forest.treeHp[0] && !(OFF.forest.inv.twig > 0 && !OFF.forest.inv.wood),
    '★★[자명 통과 금지] 끔 — 같은 자리 맨손 E 는 그 나무를 벤다(나무가 손 닿는 곳에 있다 — 켬의 잔가지 줍기가 건너뛴 결과다)', `나무 ${OFF.forest.treeHp.join('→')} · ${JSON.stringify(OFF.forest.inv)}`);
  if (OFF.rockSide.found) ok(OFF.rockSide.rockHp[1] !== OFF.rockSide.rockHp[0] && !(OFF.rockSide.inv.pebble > 0),
    '★★[자명 통과 금지] 끔 — 같은 자리 맨손 E 는 바위를 캔다(자갈 줍기 ③′ 는 켬 판에만)', `바위 ${OFF.rockSide.rockHp.join('→')} · ${JSON.stringify(OFF.rockSide.inv)}`);
  ok(!OFF.rod, '끔 — 막대 낚싯대 레시피가 없다(제작 목록 종전 그대로)');
}
console.log(`\n=== T1065: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
