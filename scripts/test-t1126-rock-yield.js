#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1126-rock-yield.js — T1126: 바위 하나에서 돌 여러 개(칠 때마다 · 작아지다 사라진다) ==========
//
// ★왜 [카드 T1126 · ★재민 11-03 판정 ⓐ "바위 = 큰 덩어리"를 몸으로] T1120 실측 첫 움집 0/2 — 바위 하나 = 돌 1(부서질 때 한 번)이라
//   곡괭이 5 + 도끼 2 = 바위 일곱을 찾아 걷는 데 30분이 다 갔다.
//   고침(손잡이 `T1126_ROCK_YIELD` · 켬 기본 후보 · `=0` = 종전 바이트):
//     서버 — 바위 hp 정본(`RESOURCE_HP_TABLE.rock`) = 돌 N개(바위 몸 구 부피 × 돌 밀도 정본 ÷ 돌 한 개 kg) · hp 한 점 = 돌 하나를 친 그 자리에서
//            (`_t1126HitYield` · `_t1126Give` 하나 — 플레이어 `gatherResource` · NPC `npcStep` 직접 채집이 둘 다) · 부서질 때 전리품 그대로(돌 1 · 자갈 2)
//     클라 — welcome `uiCfg.rockYield` 가 있으면 남은 hp 비율로 바위 그림이 작아진다(40-r2 `rockShrinkK` · 단계 셋 · 새 그림 0)
//
// ★이 하네스가 재는 것(진짜 서버 함수 · 제품 클라 글자 그대로):
//   ① 글자 — 손잡이 · 유도 식(밀도 정본 · 돌 kg · 바위 몸 · 새 수 0) · 두 문(사람 · NPC)이 같은 함수 · 전리품 줄 그대로 · welcome · 렌더 줄 · T724 무접촉
//   ② 켬 · 사람 — 조잡한 돌괭이 한 타 = 돌 2(hp 2) · 곡괭이 한 타 = 돌 3 · 맨손(도구 문 끔) 한 타 = 돌 1 · 친 타마다 짐 알림 · 다 캐면 돌 N + 자갈 2 · 사라진다
//   ③ 켬 · NPC — 한 걸음 = 돌 1(hp 1) · 다 캐면 돌 N + 자갈 2(사람과 같은 수) · 맨손 거절(도구 문)은 돌 0
//   ④ 끔 — hp 종전 표 값 · 부서지기 전 돌 0 · 짐 알림 0 · 부서질 때 돌 1 + 자갈 2 · welcome 칸 0 · 그림 크기 그대로
//   ⑤ 그림 — 단계 셋(온전 · ⅔ · ⅓ 부피 → 세제곱근 길이) · 폴백 그림도 같은 배율 · 끔 = 한 크기(종전 66px)
//   ⑥ 칸 — 「지금 할 일」 "바위 채굴"의 "지금 돌 n개"가 친 타마다 는다(진짜 존이 준 짐) · 돌 5 가 찬 타에 "곡괭이 만들기" · 끔은 부서질 때까지 그대로
//   ⑦ 돌연변이 — 사람 문 · NPC 문 · 그림 배율을 걷어 낸 글자면 위 판정이 빨갛다
//
// 실행: node scripts/test-t1126-rock-yield.js
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─────────────────────────────── 아이 — 한 판(진짜 존) JSON 한 줄 ───────────────────────────────
if (process.env.T1126_CHILD === '1') {
  const TMP = `/tmp/test-t1126-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(44000 + (process.pid % 900));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.LATENCY_MS = '0';
  process.env.FISH_TICK_MS = '999000';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const MUT = process.env.T1126_MUT || '';
  let Zone;
  const fn = path.join(ROOT, 'server', 'zone.js');
  if (MUT) {   // ⑦ 서버 돌연변이 — 문 한 줄을 걷은 글자를 같은 파일 이름으로 올린다(상대 require 그대로)
    let src = fs.readFileSync(fn, 'utf8');
    if (MUT === 'npc') src = src.replace('if (_y > 0) _t1126Give(npc, _y); ', '');
    if (MUT === 'player') src = src.replace('  if (_t1126Y > 0) _t1126Give(player, _t1126Y);\n', '\n');
    const mod = new Module(fn, null); mod.filename = fn; mod.paths = Module._nodeModulePaths(path.dirname(fn));
    mod._compile(src, fn);
    Zone = mod.exports;
  } else Zone = require(fn);
  const H = Zone.__testBind();
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const ZB = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando.biome;
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  const pool = [];
  for (let k = 0; k < 60; k++) for (const r of (CH.generateChunkResources('hanbando', ZB, k, k, CH.CHUNK_SIZE, new Set(), 0) || [])) pool.push(r);
  const rocks = pool.filter((r) => r.type === 'rock' && r.hp > 0);
  let ri = 0;
  const nextRock = () => { const r = rocks[ri++]; if (r && !H.resources.has(r.id)) H.resources.set(r.id, r); return r; };
  let _pid = 0;
  const mkPlayer = (x, y) => {
    const msgs = [];
    const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
    const p = { pid: `t1126p${++_pid}`, playerId: `t1126_${_pid}`, name: '캐는 손', ws, x, y, floor: 0, inventory: {}, toolItems: [], equipment: [], equipSlots: {},
      equipped: null, hotkey1: null, tribeId: null, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, craftSkill: {}, lastAttackAt: 0, lastRangedAt: 0,
      vp: 0, isDown: false, persistent: false, msgs };
    return p;
  };
  const give = (p, inv) => { for (const [k, v] of Object.entries(inv)) p.inventory[k] = (p.inventory[k] || 0) + v; };
  const make = (p, name) => { give(p, H.RECIPES[name].cost); H.doCraft(p, name); return p.toolItems.find((t) => t.type === name) || null; };
  // 한 타의 꼴 — 이 사람에게 온 알림 종류 · 짐 알림의 돌 · 방송 hp(도구 id 같은 판마다 다른 글자는 안 싣는다)
  const shape = (m) => {
    if (m.type === 'inventory') return { type: 'inventory', stone: (m.inventory || {}).stone || 0, pebble: (m.inventory || {}).pebble || 0 };
    if (m.type === 'resource_update') return { type: 'resource_update', hp: m.hp };
    if (m.type === 'resource_removed') return { type: 'resource_removed' };
    if (m.type === 'notice') return { type: 'notice', text: m.text };
    return { type: m.type };
  };
  // 사람 한 바위 — 다 캘 때까지(상한 400타)
  const mineBy = (tool, opt) => {
    const r = nextRock(); if (!r) return null;
    const p = mkPlayer(r.x + 20, r.y);
    H.players.set(p.pid, p);
    if (opt && opt.wood) give(p, { wood: opt.wood });
    if (tool) { const inst = make(p, tool); H.doEquip(p, inst.id); }
    p.msgs.length = 0;
    const hp0 = r.hp, hits = [];
    const max = (opt && opt.max) || 400;   // 조잡한 돌괭이는 내구 25 타 — 그 안에서만 잰다(다 캐는 판은 곡괭이 · 맨손)
    for (let i = 0; i < max && H.resources.has(r.id); i++) {
      const s0 = p.inventory.stone || 0, b0 = p.inventory.pebble || 0, h0 = r.hp;
      H.gatherResource(p, r);
      const m = p.msgs.splice(0).map(shape);
      hits.push({ ds: (p.inventory.stone || 0) - s0, db: (p.inventory.pebble || 0) - b0, hp: H.resources.has(r.id) ? r.hp : 'gone', cut: h0 - Math.max(0, r.hp),
        m: m.map((x) => x.type), inv: m.filter((x) => x.type === 'inventory').map((x) => x.stone), bag: { wood: p.inventory.wood || 0, stone: p.inventory.stone || 0 } });
      if (m.some((x) => x.type === 'notice')) { hits[hits.length - 1].notice = m.filter((x) => x.type === 'notice').map((x) => x.text); break; }
    }
    H.players.delete(p.pid);
    return { hp0, maxHp: r.maxHp, hits, stone: p.inventory.stone || 0, pebble: p.inventory.pebble || 0, gone: !H.resources.has(r.id) };
  };
  // NPC 한 바위 — `npcStep` 직접 채집 갈래(도착한 몸 · 결정 0)
  const npcMine = () => {
    const r = nextRock(); if (!r) return null;
    const npc = { pid: 't1126_npc', playerId: 'npc_t1126', name: '광부', isNpc: true, x: r.x + 22, y: r.y, vx: 0, vy: 0, floor: 0,
      behavior: 'gather', gatherTarget: r.id, targetX: r.x + 22, targetY: r.y, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100, lastAttackAt: 0 };
    const hp0 = r.hp, steps = [];
    let now = 2e6;
    for (let i = 0; i < 400 && H.resources.has(r.id); i++) {
      npc.behavior = 'gather'; npc.gatherTarget = r.id; npc.nextDecisionAt = Infinity; npc.targetX = npc.x; npc.targetY = npc.y;
      const s0 = npc.inventory.stone || 0, b0 = npc.inventory.pebble || 0, h0 = r.hp;
      now += 100; H.npcStep(npc, 1 / 30, now);
      steps.push({ ds: (npc.inventory.stone || 0) - s0, db: (npc.inventory.pebble || 0) - b0, cut: h0 - (H.resources.has(r.id) ? r.hp : 0) });
    }
    return { hp0, maxHp: r.maxHp, steps, stone: npc.inventory.stone || 0, pebble: npc.inventory.pebble || 0, gone: !H.resources.has(r.id) };
  };
  const out = {
    knob: H.T1126_ROCK_YIELD, hp0: H.T1126_ROCK_HP0, N: H._t1126RockStones(), rho: H._t1126Rho(), kg: W.kgOf('stone'),
    table: CH.RESOURCE_HP_TABLE.rock, gate: H.T1065_TOOL_GATE, cfg: H.T1120_NEXT_TOOL ? H._t1120Cfg() : null,
    maxHps: [...new Set(rocks.map((r) => r.maxHp))], nRocks: rocks.length,
    eff: { crude_pick: H.TOOL_EFFECTS && H.TOOL_EFFECTS.crude_pick && H.TOOL_EFFECTS.crude_pick.gatherStoneMult, pickaxe: H.TOOL_EFFECTS && H.TOOL_EFFECTS.pickaxe && H.TOOL_EFFECTS.pickaxe.gatherStoneMult },
  };
  out.crude = mineBy('crude_pick', { wood: 3, max: 20 });
  out.pick = mineBy('pickaxe');
  out.bare = mineBy(null);                 // 도구 문 켬 = 거절 한 타 · 끔 = 맨손 1
  out.npc = npcMine();
  out.stat = H.t1126Stat();   // 계측 칸(세계 0) — 위 판들이 친 것
  out.yieldFn = [[4, 3], [4, 0], [4, -2], [1, 0], [3, 3]].map(([a, b]) => H._t1126HitYield({ type: 'rock', hp: b }, a)).concat([H._t1126HitYield({ type: 'ore', hp: 2 }, 4), H._t1126HitYield({ type: 'tree', hp: 1 }, 3)]);
  console.log = _l; console.warn = _w; console.error = _e;
  process.stdout.write('@@T1126 ' + JSON.stringify(out) + '\n');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ─────────────────────────────── 부모 — 글자 · 판 · 그림 · 칸 ───────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
//   ★[T1146] 아이 판은 돌 규칙 하나(`T1146_STONE_RULE`)를 끈 세계에서 잰다 — 이 하네스가 무는 것은 T1126 층(hp 한 점 = 돌 하나 · 한 타 = 도구 배수만큼 점)이고,
//     T1146 은 그 위에서 한 타에 깎이는 점을 kg 규칙으로 바꾼다(그 판정은 `test-t1146-stone-rule` 이 문다 · 두 층을 한 판에 섞지 않는다).
const run = (env) => {
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1126_CHILD: '1', T1146_STONE_RULE: '0' }, env), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1126 '));
  if (!line) { console.log(`  (아이 ${JSON.stringify(env)} 끝 코드 ${r.status} · ${(r.stderr || '').slice(-400)})`); return null; }
  return JSON.parse(line.slice(8));
};
// 함수 몸(글자) — 이름으로 찾아 중괄호 짝까지
function fnBody(src, name) {
  const i = src.search(new RegExp(`function ${name}\\(`)); if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
const nums = (body) => [...new Set((body.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'|`[^`]*`/g, '').match(/(?<![\w.$])\d+(?:\.\d+)?(?![\w])/g) || []))].sort();
console.log('\n=== T1126 바위 하나에서 돌 여러 개 — 칠 때마다 · 작아지다 사라진다(`T1126_ROCK_YIELD`) ===');
const Z = rd('server/zone.js');
const R2 = rd('public/client/40-r2-sprites.js');
const RL = rd('public/client/34-m-renderloop.js');
const VIL = rd('server/villages.js');

sec('① 글자 — 손잡이 · 유도 식 · 두 문 · 전리품 줄 · welcome · 렌더 · T724');
ok(/const T1126_ROCK_YIELD = process\.env\.T1126_ROCK_YIELD !== '0';/.test(Z), '손잡이 — 켬 기본(`=0` 만 끔)');
const fRho = fnBody(Z, '_t1126Rho'), fN = fnBody(Z, '_t1126RockStones'), fY = fnBody(Z, '_t1126HitYield'), fG = fnBody(Z, '_t1126Give');
ok(/HutStages\.HUT_PLINTH_SRC/.test(fRho) && /\.gcm3/.test(fRho), '★밀도 = 돌 밀도 정본 하나(`hut-stages.HUT_PLINTH_SRC.gcm3` — 화강암 2.65~2.75 g/㎤ · 출처 보고/T517)');
ok(/Weights\.kgOf\('stone'\)/.test(fN) && /ROCK_COLLIDER_R \/ BUILDING_SIZE/.test(fN) && /Math\.PI/.test(fN), '★유도 식 — 돌 한 개 kg(`weights`) · 바위 몸 반경(`ROCK_COLLIDER_R` · 1칸 = 1m 캐논) · 구 부피');
ok(nums(fRho).join(',') === '0,1,1000,2' && nums(fN).join(',') === '0,1,3,4' && nums(fY).join(',') === '0,1' && nums(fG).join(',') === '0',
  '★새 수 0 — 몸의 수 글자는 단위(1000) · 가운데(2 · 범위 두 끝 [0] [1]) · 구 부피(4/3) · 0 · 1 뿐', `${nums(fRho)} | ${nums(fN)} | ${nums(fY)} | ${nums(fG)}`);
ok(/RESOURCE_HP_TABLE\.rock = _t1126RockStones\(\)/.test(Z) && /if \(T1126_ROCK_YIELD\) RESOURCE_HP_TABLE\.rock = /.test(Z), '★바위 hp 정본(청크 표)을 N 으로 — 켬일 때만(스폰 · 군락 · 재생이 다 그 표를 읽는다)');
const fGR = fnBody(Z, 'gatherResource'), fNS = fnBody(Z, '_npcGatherResource');
ok(/const _hp0 = best\.hp;/.test(fGR) && /_t1126HitYield\(best, _hp0\)/.test(fGR) && /_t1126Give\(player, _t1126Y\)/.test(fGR), '★사람 문 — `gatherResource` 가 친 앞 hp 로 그 자리 돌을 준다');
ok(/_npcGatherResource\(npc,r\)/.test(fnBody(Z, 'npcStep')) && /const _hp0 = r\.hp;/.test(fNS) && /_t1126HitYield\(r, _hp0\)/.test(fNS) && /_t1126Give\(npc, _y\)/.test(fNS), '★NPC 문 — `npcStep` 직접 채집이 같은 두 함수를 부른다(정본 하나)');
ok((Z.match(/inventory\.stone = \(body\.inventory\.stone \|\| 0\) \+ n/g) || []).length === 1 && (Z.match(/function _t1126Give\(/g) || []).length === 1, '사본 0 — 돌을 손에 넣는 줄은 `_t1126Give` 하나');
ok(Z.includes('const loot = _t495Rest(best, lootOfResource(best, { day: zoneGameDay() }));') && Z.includes('const loot = _t495Rest(r, lootOfResource(r));'), '부서질 때 전리품 두 줄 그대로(`lootOfResource` rock → 돌 1 · 자갈 2)');
ok(/rock: \{ stone: 1, pebble: 2 \}|t === 'rock'[^\n]*stone: 1[^\n]*pebble: 2/.test(Z), '전리품 표 바위 = 돌 1 · 자갈 2 그대로');
ok(/\.\.\.\(T1126_ROCK_YIELD \? \{ rockYield: \{ n: RESOURCE_HP_TABLE\.rock \} \} : \{\}\)/.test(Z), 'welcome `uiCfg.rockYield` — 켬일 때만(끔 = 칸 없음)');
ok(/drawRockIso\(s\.x, s\.y, item\.ax, item\.ay, rockShrinkK\(item\.r\)\)/.test(RL), '렌더 줄 — 바위는 남은 몸 배율을 넘긴다(`rockShrinkK`)');
const f724 = fnBody(VIL, '_t724BodyStep');
ok(!!f724 && /oreConsumeAt/.test(f724) && !/resources\.get|'rock'|_t1126/.test(f724), '★T724 광부 몸은 광맥 셀(`oreConsumeAt`)을 친다 — 바위 개체 문을 안 지난다(카드 ④ · 광맥은 카드 밖)');
ok(/miner:\s*\[\s*'rock',\s*'ore'\s*\]/.test(VIL) && /npc\.behavior = 'gather'; npc\.targetX = best\.x; npc\.targetY = best\.y; npc\.gatherTarget = best\.id;/.test(VIL),
  '★광맥 셀이 없는 마을 광부(종전 현장 갈래 · `JOB_RES.miner` 바위 · 광맥)는 `npcStep` 직접 채집 = 위 NPC 문을 지난다');

const ON = run({}), OFF = run({ T1126_ROCK_YIELD: '0' }), NOGATE = run({ T1065_TOOL_GATE: '0' }), NOGATE0 = run({ T1065_TOOL_GATE: '0', T1126_ROCK_YIELD: '0' });
ok(!!ON && !!OFF && !!NOGATE && !!NOGATE0, '[상황] 켬 · 끔 · 도구 문 끔(켬 · 끔) 네 판이 떴다');
// 판정 술어 — 돌연변이에도 같은 술어를 댄다
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const hitsOk = (hs, mult) => hs.every((h) => h.ds === mult && h.cut === mult && h.db === 0 && h.inv.length === 1 && h.inv[0] === h.bag.stone);   // 부서지기 전 타 — 깎인 hp 만큼 돌 · 짐 알림 하나
const playerYieldOk = (A, N, mult) => !!A && A.maxHp === N && A.gone && A.stone === N && A.pebble === 2
  && hitsOk(A.hits.slice(0, -1), mult) && A.hits[A.hits.length - 1].db === 2;
const crudeOk = (A, N) => !!A && A.maxHp === N && !A.gone && A.hits.length === 20 && hitsOk(A.hits, 2) && A.stone === 40 && A.hits[19].hp === N - 40;
const npcYieldOk = (B, N) => !!B && B.maxHp === N && B.gone && B.stone === N && B.pebble === 2 && B.steps.length === N
  && B.steps.slice(0, -1).every((s) => s.ds === 1 && s.db === 0 && s.cut === 1) && B.steps[B.steps.length - 1].ds === 1 && B.steps[B.steps.length - 1].db === 2;
if (ON && OFF) {
  const N = ON.N;
  sec('② 켬 · 사람 — 친 그 자리에서 돌 · 다 캐면 돌 N + 자갈 2 · 사라진다');
  ok(ON.knob === true && OFF.knob === false && ON.hp0 === 4 && OFF.hp0 === 4, '[상황] 손잡이가 env 대로 섰다 · 종전 바위 hp 4', `${ON.knob} · ${OFF.knob} · hp0 ${ON.hp0}`);
  ok(ON.rho === 2700 && ON.kg === 4, '[상황] 밀도 2700 kg/m³(정본 가운데) · 돌 한 개 4 kg', `${ON.rho} · ${ON.kg}`);
  ok(N === Math.floor(ON.rho * (4 / 3) * Math.PI * Math.pow(14 / 32, 3) / ON.kg) && N === 236, '★★바위 하나 = 돌 236개 — 2700 × 4/3·π·(14/32 m)³ ÷ 4 kg = 947 kg ÷ 4', `N = ${N}`);
  ok(ON.table === N && OFF.table === 4 && ON.maxHps.join() === String(N) && OFF.maxHps.join() === '4' && ON.nRocks > 3, '★청크가 낳는 바위 hp = N(켬) · 4(끔) — 정본 표 하나', `켬 ${ON.maxHps} · 끔 ${OFF.maxHps} · 바위 ${ON.nRocks}`);
  ok(ON.eff.crude_pick === 2 && ON.eff.pickaxe === 3, '[상황] 도구 배수 — 조잡한 돌괭이 2 · 곡괭이 3(`TOOL_EFFECTS` 그대로)', JSON.stringify(ON.eff));
  const A = ON.crude, P = ON.pick;
  ok(A && A.hits[0].ds === 2 && A.hits[0].db === 0 && A.hits[0].hp === N - 2 && A.hits[0].m.join() === 'tools,resource_update,inventory', '★★조잡한 돌괭이 첫 타 — 돌 2(hp 2 깎음) · 도구 내구 · 방송 hp · 짐 알림(그 차례)', A && JSON.stringify(A.hits[0]));
  ok(crudeOk(A, N), '★★조잡한 돌괭이 스무 타(내구 25 안) — 타마다 돌 2 · 짐 알림 한 번 · 돌 40 · 바위 hp N − 40(아직 선다)', A && `${A.hits.length}타 · 돌 ${A.stone} · hp ${A.hits[19] && A.hits[19].hp}`);
  ok(playerYieldOk(P, N, 3) && P.hits[0].ds === 3 && P.hits.length === Math.ceil(N / 3), '★곡괭이 — 한 타 돌 3 · ⌈N/3⌉ 타에 다 캔다 · 돌 합 N + 자갈 2', P && `${P.hits.length}타 · 돌 ${P.stone} · 자갈 ${P.pebble}`);
  ok(sum(P.hits, (h) => h.ds) === N && sum(P.hits, (h) => Math.min(h.cut, 3)) === N && P.hits.every((h, i) => i === P.hits.length - 1 || h.hp === N - 3 * (i + 1)), '깎인 hp 합 = 돌 합 = N(돌이 새지도 덤으로 나지도 않는다 · 마지막 한 점은 전리품 몫)');
  ok(ON.bare && ON.bare.hits.length === 1 && ON.bare.hits[0].ds === 0 && ON.bare.hits[0].hp === N && /조잡한 돌괭이가 있어야 돌을 캘 수 있습니다/.test((ON.bare.hits[0].notice || []).join('')),
    '맨손(도구 문 켬) — 거절 한 줄 · 돌 0 · hp 그대로(T1065 그대로)', ON.bare && JSON.stringify(ON.bare.hits[0]));
  if (NOGATE) ok(playerYieldOk(NOGATE.bare, N, 1) && NOGATE.bare.hits[0].ds === 1 && NOGATE.bare.hits.length === N, '★맨손(도구 문 끔) — 한 타 돌 1 · N 타 · 돌 합 N + 자갈 2', `${NOGATE.bare.hits.length}타 · 돌 ${NOGATE.bare.stone}`);
  ok(JSON.stringify(ON.yieldFn) === '[1,3,3,0,0,0,0]', '`_t1126HitYield` — 깎인 점 수 · 부서진 타는 한 점 뺀다(전리품 몫) · 바위만', JSON.stringify(ON.yieldFn));

  sec('③ 켬 · NPC — 한 걸음 돌 1 · 다 캐면 돌 N + 자갈 2(사람과 같은 수)');
  const B = ON.npc;
  ok(B && B.steps[0].ds === 1 && B.steps[0].cut === 1, '★★NPC 첫 걸음 — hp 1 · 돌 1(손에)', B && JSON.stringify(B.steps[0]));
  ok(npcYieldOk(B, N), '★★NPC 가 다 캔다 — N 걸음 · 돌 N + 자갈 2 · 사라진다(사람 · NPC 같은 문 · 같은 수)', B && `${B.steps.length}걸음 · 돌 ${B.stone} · 자갈 ${B.pebble} · 사라짐 ${B.gone}`);
  const st = ON.stat || {}, s0 = OFF.stat || {};
  ok(st.nHit === N && st.nStone === N - 1 && st.nBreak === 1 && s0.nHit === 4 && s0.nStone === 0 && s0.nBreak === 1,
    '계측 칸(세계 0) — NPC 가 친 타 · 그 자리 돌 · 부서진 바위(켬 N · N−1 · 1 / 끔 4 · 0 · 1) — 바위에서 가져간 돌 = 그 자리 + 부서짐', `켬 ${JSON.stringify(st)} · 끔 ${JSON.stringify(s0)}`);
  ok(st.pHit === 20 + Math.ceil(N / 3) && st.pStone === 40 + N - 1 && st.pBreak === 1 && s0.pHit === 4 && s0.pStone === 0 && s0.pBreak === 2, '계측 칸 — 사람(조잡한 돌괭이 20타 + 곡괭이 다 캠 / 끔 2 + 2타 · 부서짐 2) · 거절 타는 안 센다');

  sec('④ 끔 — 종전 바이트(hp 4 · 부서질 때만 돌 1 + 자갈 2 · 짐 알림 0)');
  const A0 = OFF.crude, P0 = OFF.pick, B0 = OFF.npc;
  ok(A0 && A0.maxHp === 4 && A0.hits.length === 2 && A0.hits[0].ds === 0 && A0.hits[0].m.join() === 'tools,resource_update' && A0.hits[1].ds === 1 && A0.hits[1].db === 2 && A0.hits[1].m.join() === 'tools,inventory,resource_removed',
    '★★끔 · 조잡한 돌괭이 — 첫 타 방송만(짐 알림 0 · 돌 0) · 둘째 타에 부서져 돌 1 · 자갈 2(종전 알림 차례)', A0 && JSON.stringify(A0.hits.map((h) => [h.ds, h.db, h.m.join('+')])));
  ok(P0 && P0.hits.length === 2 && P0.stone === 1 && P0.pebble === 2, '끔 · 곡괭이 — 두 타(hp 4 · 3씩) · 돌 1 · 자갈 2', P0 && P0.hits.length);
  ok(B0 && B0.steps.length === 4 && B0.steps.slice(0, 3).every((s) => s.ds === 0) && B0.stone === 1 && B0.pebble === 2, '★끔 · NPC — 네 걸음 · 부서질 때만 돌 1 · 자갈 2', B0 && JSON.stringify(B0.steps.map((s) => s.ds)));
  if (NOGATE0) ok(NOGATE0.bare && NOGATE0.bare.hits.length === 4 && NOGATE0.bare.stone === 1 && NOGATE0.bare.hits.slice(0, 3).every((h) => h.ds === 0 && h.m.join() === 'resource_update'), '끔 · 맨손(도구 문 끔) — 네 타 · 돌 1(종전)');
  ok(JSON.stringify(OFF.yieldFn) === '[0,0,0,0,0,0,0]', '끔 — 그 자리 돌 0(함수가 0 을 낸다)');

  // ── ⑦ 서버 돌연변이 ──
  sec('⑦ 돌연변이 — 문 한 줄을 걷으면 판정이 빨갛다');
  const MN = run({ T1126_MUT: 'npc' }), MP = run({ T1126_MUT: 'player' });
  ok(!!MN && !npcYieldOk(MN.npc, MN.N) && playerYieldOk(MN.pick, MN.N, 3) && crudeOk(MN.crude, MN.N), '★NPC 문을 걷은 글자 — NPC 판정 빨강(사람은 그대로 초록)', MN && `NPC 첫 걸음 돌 ${MN.npc.steps[0].ds} · 돌 합 ${MN.npc.stone}`);
  ok(!!MP && !playerYieldOk(MP.pick, MP.N, 3) && !crudeOk(MP.crude, MP.N) && npcYieldOk(MP.npc, MP.N), '★사람 문을 걷은 글자 — 사람 판정 빨강(NPC 는 그대로 초록)', MP && `첫 타 돌 ${MP.crude.hits[0].ds} · 곡괭이 돌 합 ${MP.pick.stone}`);
}

// ─────────────────────────────── 그림 — 제품 클라 글자 그대로(vm) ───────────────────────────────
sec('⑤ 그림 — 남은 몸만큼 작아진다(단계 셋 · 세제곱근 · 새 그림 0)');
const fK = fnBody(R2, 'rockShrinkK'), fDN = fnBody(R2, 'drawNatureSprite'), fDR = fnBody(R2, 'drawRockIso');
ok(!!fK && !!fDN && !!fDR, '[상황] 제품 글자에 함수 셋(`rockShrinkK` · `drawNatureSprite` · `drawRockIso`)');
ok(/uiCfg\.rockYield/.test(fK) && /Math\.cbrt\(Math\.ceil\(3 \* r\.hp \/ r\.maxHp\) \/ 3\)/.test(fK), '단계 셋 = 남은 hp 비율 올림 ⅓ · ⅔ · 1 → 세제곱근 길이(켬 = welcome 칸이 있을 때만)');
ok(/const sc = \(scale \|\| 1\.5\) \* \(kf \|\| 1\)/.test(fDN), '배율은 그리기 폭 한 곳에 — 없으면 1(종전 1.5 그대로)');
function drawWorld(K, mut) {   // 가짜 ctx 로 그리고 부른 것을 적는다
  const log = [];
  const rec = (n) => (...a) => log.push(n + '(' + a.map((v) => (typeof v === 'number' ? +v.toFixed(3) : (v && v.tag) || String(v))).join(',') + ')');
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' ? rec(k) : undefined)), set: (t, k, v) => { log.push(`${String(k)}=${v}`); return true; } });
  const im = { tag: 'im', complete: true, naturalHeight: 80, naturalWidth: 100 };
  const c = { Math, ctx, uiCfg: K.cfg, NATURE_SPRITES: { rock: [im] }, _natureLoaded: K.loaded ? 1 : 0, _treeHash: () => 0, NATURE_BASE_W: { rock: 44 } };
  vm.createContext(c);
  vm.runInContext((mut ? fK.replace(/\{[\s\S]*\}$/, '{ return 1; }') : fK) + '\n' + fDN + '\n' + fDR, c);
  const sizes = [];
  for (const hp of K.hps) { log.length = 0; const r = { type: 'rock', hp, maxHp: K.max }; c.drawRockIso(100, 100, 3, 4, c.rockShrinkK(r)); sizes.push(log.slice()); }
  return sizes;
}
const N0 = (ON && ON.N) || 236;
const HPS = [N0, Math.floor(N0 * 2 / 3) + 1, Math.floor(N0 * 2 / 3), Math.floor(N0 / 3) + 1, Math.floor(N0 / 3), 1];   // 단계 문턱 양쪽(⅔ · ⅓)
const wOf = (lg) => { const d = lg.find((s) => s.startsWith('drawImage(')); return d ? +d.split(',')[3] : null; };
const onS = drawWorld({ cfg: { rockYield: { n: N0 } }, loaded: true, hps: HPS, max: N0 }).map(wOf);
const offS = drawWorld({ cfg: {}, loaded: true, hps: HPS, max: N0 }).map(wOf);
const k2 = +(66 * Math.cbrt(2 / 3)).toFixed(3), k1 = +(66 * Math.cbrt(1 / 3)).toFixed(3);
ok(JSON.stringify(onS) === JSON.stringify([66, 66, k2, k2, k1, k1]), '★★켬 — hp 비율 > ⅔ 온전 66px · ≤ ⅔ 57.7px · ≤ ⅓ 45.8px(남은 부피의 세제곱근)', JSON.stringify(onS));
ok(new Set(onS).size === 3, '★크기 단계 셋(카드 "둘 ~ 셋")', [...new Set(onS)].join(' · '));
ok(offS.every((w) => w === 66), '★끔(welcome 칸 없음) — hp 와 무관하게 66px 그대로(종전 그림)', JSON.stringify(offS));
const full = drawWorld({ cfg: { rockYield: { n: N0 } }, loaded: true, hps: [N0], max: N0 })[0], fullOff = drawWorld({ cfg: {}, loaded: true, hps: [N0], max: N0 })[0];
ok(JSON.stringify(full) === JSON.stringify(fullOff) && full.join(' ').includes('ellipse(100,103,27.72,10.56') && full.join(' ').includes('drawImage(im,67,52.2,66,52.8)'),
  '켬이어도 온전한 바위 · 끔은 종전 글자의 그리기 차례 그대로(그림자 타원 · 그림 자리 · 폭 66 = 44 × 1.5)', full.slice(0, 4).join(' '));
const fb = drawWorld({ cfg: { rockYield: { n: N0 } }, loaded: false, hps: [N0, 1], max: N0 }), fbOff = drawWorld({ cfg: {}, loaded: false, hps: [N0, 1], max: N0 });
ok(!fb[0].some((s) => s.startsWith('scale(')) && fb[1].some((s) => s === `scale(${+Math.cbrt(1 / 3).toFixed(3)},${+Math.cbrt(1 / 3).toFixed(3)})`) && fb[1][fb[1].length - 1] === 'restore()',
  '폴백 그림(그림 파일 전) — 남은 몸 배율로 줄이고 되돌린다(바닥 앵커)', fb[1].slice(0, 4).join(' '));
ok(JSON.stringify(fbOff[0]) === JSON.stringify(fbOff[1]) && !fbOff[1].some((s) => /^(save|scale|restore)\(/.test(s)), '끔 · 폴백 — 종전 그리기(배율 0 · save/restore 0)');
const mutS = drawWorld({ cfg: { rockYield: { n: N0 } }, loaded: true, hps: HPS, max: N0 }, true).map(wOf);
ok(new Set(mutS).size !== 3, '★⑦ 그림 돌연변이(`rockShrinkK` 가 늘 1) — 단계 셋 판정이 빨갛다', JSON.stringify(mutS));

// ─────────────────────────────── 칸 — 「지금 할 일」(70-lobby 제품 글자 · vm) ───────────────────────────────
sec('⑥ 칸 — "바위 채굴"의 "지금 돌 n개"가 친 타마다 는다(진짜 존이 준 짐)');
const SRC = rd('public/client/70-lobby.js');
const V52 = rd('public/client/52-v-village-view.js');
const JOSA = (() => { const i = V52.indexOf('function vvJosa('); return i >= 0 ? V52.slice(i, V52.indexOf('\n}\n', i) + 3) : ''; })();
function load(cfg) {
  const ctx = { console, Math, JSON, Map, Set, Array, Object, String, Number, isFinite, uiCfg: cfg || {}, window: {}, document: { getElementById: () => null } };
  vm.createContext(ctx);
  if (JOSA) vm.runInContext(JOSA, ctx);
  vm.runInContext(SRC, ctx, { filename: 'public/client/70-lobby.js' });
  return ctx;
}
const LAB = { wood: '나무', stone: '돌', pebble: '자갈', twig: '잔가지', fiber: '풀', pickaxe: '곡괭이', axe: '도끼', crude_pick: '조잡한 돌괭이', crude_axe: '조잡한 돌도끼', rock: '바위', tree: '나무' };
const REC = { pickaxe: { cost: { wood: 3, stone: 5 }, label: '곡괭이' }, axe: { cost: { wood: 5, stone: 2 }, label: '도끼' },
  crude_axe: { cost: { pebble: 2, twig: 1, fiber: 2 } }, crude_pick: { cost: { pebble: 3, twig: 1, fiber: 2 } } };
const flat = (p) => (p ? p.guide.map((x) => (x && x.k != null) ? `[${x.k}]` : x).join('') : '');
const panelSeq = (S) => {
  if (!S || !S.cfg || !S.crude) return null;
  const C = load({ nextTool: S.cfg });
  const pick = { id: 'p', type: 'crude_pick', d: 10 };
  return S.crude.hits.slice(0, 4).map((h) => { const p = C.onbToolPlan({ toolCfg: S.cfg, recipes: REC, bag: h.bag, tools: [pick], held: 'p', slotted: () => false, resVerb: { rock: '채굴', tree: '벌목' }, itemKo: (k) => LAB[k] || k, need: { tool: 'pickaxe' } });
    return { item: p && p.item, have: (flat(p).match(/지금 나무 (\d+)개, 돌 (\d+)개가 있습니다/) || []).slice(1).map(Number), stone: h.bag.stone }; });
};
const pOn = panelSeq(ON), pOff = panelSeq(OFF);
ok(!!pOn && pOn[0].item === '바위 채굴' && pOn[0].have.join() === '3,2' && pOn[1].item === '바위 채굴' && pOn[1].have.join() === '3,4', '★★켬 — 첫 타 뒤 "지금 나무 3개, 돌 2개" · 둘째 타 뒤 "돌 4개"(친 타마다 · 진짜 존 짐)', pOn && JSON.stringify(pOn.slice(0, 2)));
ok(!!pOn && pOn[2].item === '곡괭이 만들기' && pOn[2].stone === 6, '★★켬 — 돌 5 가 찬 셋째 타에 칸이 "곡괭이 만들기"로(바위 하나에서 곡괭이 돌이 다 나온다)', pOn && JSON.stringify(pOn[2]));
ok(!!pOff && pOff[0].item === '바위 채굴' && pOff[0].have.join() === '3,0' && pOff[1].have.join() === '3,1' && pOff.length === 2, '끔 — 첫 타 뒤 "돌 0개" 그대로 · 부서진 둘째 타에 "돌 1개"(바위 하나 = 돌 1 · 다음 바위를 찾는다)', pOff && JSON.stringify(pOff));
if (NOGATE && NOGATE.cfg) {
  const C = load({ nextTool: NOGATE.cfg });
  const seq = NOGATE.bare.hits.slice(0, 3).map((h) => flat(C.onbToolPlan({ toolCfg: NOGATE.cfg, recipes: REC, bag: Object.assign({ wood: 3 }, h.bag, { wood: 3 }), tools: [], held: null, slotted: () => false, resVerb: { rock: '채굴' }, itemKo: (k) => LAB[k] || k, need: { tool: 'pickaxe' } })));
  ok(seq.map((t) => (t.match(/돌 (\d+)개가 있습니다/) || [])[1]).join() === '1,2,3', '★맨손(도구 문 끔) — 칸의 "돌 n개"가 1개씩 는다(1 · 2 · 3)', seq[0]);
}

console.log(`\n=== T1126: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
