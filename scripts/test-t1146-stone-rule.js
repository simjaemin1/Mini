#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1146-stone-rule.js — T1146: 돌 규칙 하나(맥석 = 돌 · 한 타에 깎이는 kg = 도구 × 돌 종류 · NPC 손의 돌은 곳간으로) ==========
//
// ★왜 [카드 T1146 · ★재민 11-04 "돌 규칙은 네 말 따를게" · 족보 744] 바위(T1126)는 한 타 = 돌 4 kg 이고 땅 · 광맥은 한 타 ≈ 58 g 이라 약 70배 차였다.
//   선광은 맥석을 폐석으로 버렸다(땅을 파면 돌덩이를 지고 와 버리는 꼴).
//   고침(손잡이 `T1146_STONE_RULE` · 켬 기본 후보 · `=0` = 종전 바이트):
//     규칙 — `server/stone-rule.js`: 한 타 kg = 도구 배수(`TOOL_EFFECTS` 그대로) × 돌 종류 배수 × 암반 한 타 kg(채굴 정본 셋에서)
//            금 간 돌 배수 = 같은 사람 · 같은 연장의 실험(Maqueda 외 2024)에서 불로 금 간 돌 한 타 kg ÷ 금 없는 돌 한 타 kg
//     존 — 바위는 깎인 kg 을 바위마다 쌓아(`_t1146Chip`) 돌 한 개 kg 이 찰 때마다 hp 한 점(T1126 hp = 돌 수 그대로) · 사람 · NPC 같은 함수(`_t1146Cut`)
//          선광 맥석 → 돌 · 자갈 · 부스러기(무게 보존 · `_t1146Gangue`)
//     마을 — NPC 손의 돌 · 자갈 → 곳간에 닿는 순간 곳간(`_t1146HandIn` · T733 부산물 문과 같은 몸통 `actToGranary`)
//
// ★이 하네스가 재는 것(진짜 서버 함수 · 진짜 econ 몸통):
//   ① 글자 — 손잡이 셋 자리 · 정본 모듈 하나 · 새 수 0(출처 표 밖 수 0) · 두 문(사람 · NPC)이 같은 함수 · 땅 채굴 글자 무접촉 · 곳간 두 순간
//   ② 유도 — 금 간 돌 배수 = 출처 표의 비 · 암반 한 타 × 곡괭이 배수 × 60타 = 덩이 3.5 kg(땅 채굴 정본 그대로) · 무게 보존(나눔 50판)
//   ③ 켬 · 사람 — 곡괭이 100타(내구 한 벌) = 돌 4 · 첫 돌 24타 · 돌이 안 난 타는 방송 · 저장 0 + 깎인 kg 한 줄 · 조잡한 돌괭이 한 벌(25타) = 돌 0 → 두 벌째 11타에 첫 돌(바위 장부)
//        · 둘이 한 바위 = 장부 하나(넘긴 타의 주인이 돌) · 맨손(도구 문 끔) 71타에 첫 돌 · 다 캔 바위 = 돌 1 + 자갈 2(종전 전리품) · 장부 지움
//   ④ 켬 · NPC — 한 걸음 배수 1 · 71걸음에 첫 돌(사람 맨손과 같은 수)
//   ⑤ 선광 — 맥석 7.3 kg → 돌 1 · 자갈 5 · 부스러기 0.3 kg · 광석 + 맥석 · 자갈 한 알도 안 되는 맥석 · 땅(광맥 밖) 120타 = 덩이 둘 → 돌 · 자갈(무게 보존)
//   ⑥ 끔 — 곡괭이 첫 타 = 돌 3(T1126) · 깎인 kg 말 0 · 맥석 버림(종전 글자)
//   ⑦ 곳간 — NPC 손의 돌 · 자갈 → 곳간 + 국고 = 든 몫 · 손 0 · 해 질 녘 정산 문으로도 · 끔 = 손에 그대로
//   ⑧ 돌연변이 — 사람 문 · 선광 줄을 걷어 낸 글자면 위 판정이 빨갛다
//
// 실행: node scripts/test-t1146-stone-rule.js
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─────────────────────────────── 아이 — 한 판(진짜 존) JSON 한 줄 ───────────────────────────────
if (process.env.T1146_CHILD === '1') {
  const TMP = `/tmp/test-t1146-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(45000));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.LATENCY_MS = '0';
  process.env.FISH_TICK_MS = '999000';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const MUT = process.env.T1146_MUT || '';
  let Zone;
  const fn = path.join(ROOT, 'server', 'zone.js');
  if (MUT) {   // ⑧ 서버 돌연변이 — 줄 하나를 걷은 글자를 같은 파일 이름으로 올린다(상대 require 그대로)
    let src = fs.readFileSync(fn, 'utf8');
    if (MUT === 'player') src = src.replace(/\n  if \(T1146_ROCK && best\.type === 'rock'\) dmg = _t1146Cut\(best, dmg\);[^\n]*/, '');
    if (MUT === 'sort') src = src.replace(/\n    if \(k === 'stone' && T1146_STONE_RULE\) \{ _t1146Kg \+= kg; continue; \}[^\n]*/, '');
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
    const p = { pid: `t1146p${++_pid}`, playerId: `anon_t1146_${_pid}`, name: '캐는 손', ws, x, y, floor: 0, inventory: {}, toolItems: [], equipment: [], equipSlots: {},
      equipped: null, hotkey1: null, tribeId: null, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, craftSkill: {}, lastAttackAt: 0, lastRangedAt: 0,
      vp: 0, isDown: false, persistent: false, msgs };
    H.players.set(p.pid, p);
    return p;
  };
  const give = (p, inv) => { for (const [k, v] of Object.entries(inv)) p.inventory[k] = (p.inventory[k] || 0) + v; };
  const make = (p, name) => { give(p, H.RECIPES[name].cost); H.doCraft(p, name); const t = p.toolItems.filter((x) => x.type === name && x.d > 0).pop() || null; if (t) H.doEquip(p, t.id); return t; };
  const notes = (m) => m.filter((x) => x.type === 'notice').map((x) => x.text);
  // 한 타 — 짐 · hp · 이 사람에게 온 알림 종류 · 깎인 kg 말 · 바위 장부
  const hit = (p, r) => {
    const s0 = p.inventory.stone || 0, b0 = p.inventory.pebble || 0;
    p.msgs.length = 0;
    H.gatherResource(p, r);
    const m = p.msgs.splice(0);
    return { ds: (p.inventory.stone || 0) - s0, db: (p.inventory.pebble || 0) - b0, hp: H.resources.has(r.id) ? r.hp : 'gone',
      m: m.map((x) => x.type).filter((t) => t !== 'tools'), say: notes(m).filter((t) => /^바위 (깎는 중|— 돌)/.test(t)), chip: +H.t1146Chip(r.id).toFixed(4) };
  };
  const out = { on: H.T1146_STONE_RULE, rock: H.T1146_ROCK, kBed: H.T1146_K_BED, N: H._t1126RockStones(), kgS: W.kgOf('stone'), kgP: W.kgOf('pebble'), gate: H.T1065_TOOL_GATE,
    eff: { crude_pick: H.TOOL_EFFECTS.crude_pick.gatherStoneMult, pickaxe: H.TOOL_EFFECTS.pickaxe.gatherStoneMult }, dura: { crude_pick: H.TOOL_MAX_DURABILITY.crude_pick, pickaxe: H.TOOL_MAX_DURABILITY.pickaxe } };
  // ③-ⓐ 곡괭이 한 벌(내구 100)
  {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    give(p, { wood: 3 }); make(p, 'pickaxe'); p.inventory.stone = 0; p.inventory.pebble = 0;   // ★[T1186] 켬이면 제작이 깬 덩이의 나머지(자갈)를 돌려준다 — 캔 몫만 센다
    const hits = [];
    for (let i = 0; i < 100 && H.getEquippedTool(p); i++) hits.push(hit(p, r));
    out.pick = { hp0: r.maxHp, hits, stone: p.inventory.stone || 0, chip: +H.t1146Chip(r.id).toFixed(4), hp: r.hp, left: !!H.getEquippedTool(p), d: H.getEquippedTool(p) ? H.getEquippedTool(p).d : null };
    H.players.delete(p.pid);
  }
  // ③-ⓑ 조잡한 돌괭이 두 벌 — 한 벌(25타)은 돌 0 · 장부는 바위의 몫이라 두 벌째가 잇는다
  if (!MUT) {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'crude_pick');
    const a = [];
    for (let i = 0; i < 40 && H.getEquippedTool(p); i++) a.push(hit(p, r));
    const chipA = +H.t1146Chip(r.id).toFixed(4), stoneA = p.inventory.stone || 0;
    make(p, 'crude_pick');
    const b = [];
    for (let i = 0; i < 20 && H.getEquippedTool(p); i++) { b.push(hit(p, r)); if ((p.inventory.stone || 0) > stoneA) break; }
    out.crude = { a: a.length, chipA, stoneA, firstA: a.findIndex((h) => h.ds > 0) + 1, b: b.length, stoneB: p.inventory.stone || 0, firstB: b.findIndex((h) => h.ds > 0) + 1, hpB: r.hp };
    H.players.delete(p.pid);
  }
  // ③-ⓒ 둘이 한 바위 — 곡괭이 A 12타 · B 12타(넘긴 타의 주인이 돌을 든다)
  if (!MUT) {
    const r = nextRock(), A = mkPlayer(r.x + 20, r.y), B = mkPlayer(r.x - 20, r.y);
    give(A, { wood: 3 }); make(A, 'pickaxe'); give(B, { wood: 3 }); make(B, 'pickaxe');
    for (let i = 0; i < 12; i++) hit(A, r);
    const chipA = +H.t1146Chip(r.id).toFixed(4);
    const bh = []; for (let i = 0; i < 12; i++) bh.push(hit(B, r));
    out.share = { chipA, a: A.inventory.stone || 0, b: B.inventory.stone || 0, bFirst: bh.findIndex((h) => h.ds > 0) + 1, hp: r.hp, max: r.maxHp };
    H.players.delete(A.pid); H.players.delete(B.pid);
  }
  // ③-ⓓ 맨손(도구 문 끔 판만 돈다 — 켬이면 거절 한 타)
  if (!MUT) {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    const hs = []; for (let i = 0; i < 80; i++) { const h = hit(p, r); hs.push(h); if (h.ds > 0) break; }
    out.bare = { n: hs.length, stone: p.inventory.stone || 0, first: hs.findIndex((h) => h.ds > 0) + 1, refused: p.inventory.stone ? null : hs[0] };
    H.players.delete(p.pid);
  }
  // ③-ⓔ 다 캔 바위 — 남은 돌 1 인 바위를 곡괭이로 끝까지
  if (!MUT) {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    give(p, { wood: 3 }); make(p, 'pickaxe'); p.inventory.stone = 0; p.inventory.pebble = 0;   // ★[T1186] 제작이 돌려준 자갈은 이 판의 전리품이 아니다
    r.hp = 1;
    const hs = []; for (let i = 0; i < 60 && H.resources.has(r.id); i++) hs.push(hit(p, r));
    out.brk = { n: hs.length, stone: p.inventory.stone || 0, pebble: p.inventory.pebble || 0, gone: !H.resources.has(r.id), chip: H.t1146Chip(r.id), last: hs[hs.length - 1] };
    H.players.delete(p.pid);
  }
  // ④ NPC — `npcStep` 직접 채집 갈래(도착한 몸 · 결정 0)
  if (!MUT) {
    const r = nextRock();
    const npc = { pid: 't1146_npc', playerId: 'npc_t1146', name: '광부', isNpc: true, x: r.x + 22, y: r.y, vx: 0, vy: 0, floor: 0,
      behavior: 'gather', gatherTarget: r.id, targetX: r.x + 22, targetY: r.y, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100, lastAttackAt: 0 };
    const st0 = H.t1146Stat();
    const steps = [];
    let now = 2e6;
    for (let i = 0; i < 80 && H.resources.has(r.id); i++) {
      npc.behavior = 'gather'; npc.gatherTarget = r.id; npc.nextDecisionAt = Infinity; npc.targetX = npc.x; npc.targetY = npc.y;
      const s0 = npc.inventory.stone || 0;
      now += 100; H.npcStep(npc, 1 / 30, now);
      steps.push((npc.inventory.stone || 0) - s0);
      if (npc.inventory.stone) break;
    }
    const st1 = H.t1146Stat();
    out.npc = { n: steps.length, first: steps.findIndex((d) => d > 0) + 1, stone: npc.inventory.stone || 0, hp: r.hp, max: r.maxHp, nKg: +(st1.nKg - st0.nKg).toFixed(6) };
  }
  // ⑤ 선광 — 장부 그대로 넣고 진짜 `trySortOre`
  const sortCase = (ledger) => {
    const p = mkPlayer(0, 0);
    p.oreLedger = Object.assign({}, ledger); p.inventory.ore_chunk = +Object.values(ledger).reduce((a, b) => a + b, 0).toFixed(3);
    const st0 = H.t1146Stat();
    H.trySortOre(p);
    const st1 = H.t1146Stat();
    const r = { inv: Object.assign({}, p.inventory), carry: Object.assign({}, p.oreCarry), say: notes(p.msgs), crumb: +(st1.crumbKg - st0.crumbKg).toFixed(6) };
    H.players.delete(p.pid);
    return r;
  };
  out.sortA = sortCase({ stone: 7.3 });
  if (MUT) { console.log = _l; process.stdout.write('@@T1146 ' + JSON.stringify(out) + '\n'); }
  if (!MUT) {
    out.sortB = sortCase({ copper: 3.6, stone: 8 });
    out.sortC = sortCase({ stone: 0.4 });
    out.copperKo = H.ITEM_LABEL_SERVER.copper || (H.Specialty.RESOURCES.copper || {}).ko || 'copper';
    // ⑤-ⓓ 땅(광맥 밖) — 곡괭이로 두 덩이(120타) 판 뒤 선광
    const S = H.Specialty, T = H.terrain;
    let cell = null;
    const r0 = rocks[0];
    for (let d = 2; d < 60 && !cell; d++) for (let dx = -d; dx <= d && !cell; dx++) for (const dy of [-d, d]) {
      const cx = Math.floor(r0.x / 32) + dx, cy = Math.floor(r0.y / 32) + dy, px = cx * 32 + 16, py = cy * 32 + 16;
      if (H.isWaterTileLocal(px, py) || H.isTerrainBlockedLocal(px, py)) continue;
      if ((T.oreProbAt ? T.oreProbAt('hanbando', px, py) : 0) > 0) continue;
      cell = { cx, cy, px, py }; break;
    }
    if (cell) {
      const p = mkPlayer(cell.px, cell.py);
      p.toolItems = [{ id: 'g0', type: 'pickaxe', d: 1e9, max: 1e9 }]; p.equipped = 'g0'; p.craftSkill = { mining: 0 };
      let sw = 0, ch = 0;
      for (let i = 0; i < 200 && ch < 2; i++) { p._mineT = 0; const b = p.inventory.ore_chunk || 0; if (!H.mineOreCell(p)) break; sw++; if ((p.inventory.ore_chunk || 0) > b) ch++; }
      const led = Object.assign({}, p.oreLedger), chunkKg = p.inventory.ore_chunk || 0;
      p.msgs.length = 0;
      const st0 = H.t1146Stat();
      H.trySortOre(p);
      const st1 = H.t1146Stat();
      out.ground = { cell, sw, ch, led, chunkKg, stone: p.inventory.stone || 0, pebble: p.inventory.pebble || 0, crumb: +(st1.crumbKg - st0.crumbKg).toFixed(6), say: notes(p.msgs), swingsPer: S.MINE_SWINGS_PER, chunkKgCanon: S.CHUNK_KG };
      H.players.delete(p.pid);
    } else out.ground = null;
    out.stat = H.t1146Stat();
  }
  console.log = _l; console.warn = _w; console.error = _e;
  if (!MUT) process.stdout.write('@@T1146 ' + JSON.stringify(out) + '\n');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ─────────────────────────────── 부모 — 글자 · 유도 · 판 · 곳간 · 돌연변이 ───────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const run = (env) => {
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1146_CHILD: '1' }, env), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1146 '));
  if (!line) { console.log(`  (아이 ${JSON.stringify(env)} 끝 코드 ${r.status} · ${(r.stderr || '').slice(-400)})`); return null; }
  return JSON.parse(line.slice(8));
};
function fnBody(src, name) {
  const i = src.search(new RegExp(`function ${name}\\(`)); if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
const nums = (body) => [...new Set((body.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'|`[^`]*`/g, '').match(/(?<![\w.$])\d+(?:\.\d+)?(?:e-?\d+)?(?![\w])/g) || []))].sort();
console.log('\n=== T1146 돌 규칙 하나 — 맥석 = 돌 · 한 타 kg = 도구 × 돌 종류 · NPC 손의 돌은 곳간으로(`T1146_STONE_RULE`) ===');
const Z = rd('server/zone.js');
const VIL = rd('server/villages.js');
const SRS = rd('server/stone-rule.js');
const SR = require(path.join(ROOT, 'server', 'stone-rule.js'));

sec('① 글자 — 손잡이 · 정본 모듈 하나 · 새 수 0 · 두 문 · 땅 채굴 무접촉 · 곳간 두 순간');
ok(/const T1146_STONE_RULE = process\.env\.T1146_STONE_RULE === '1';/.test(Z) && /const T1146_STONE_RULE = process\.env\.T1146_STONE_RULE === '1';/.test(VIL), '손잡이 — 존 · 마을 둘 다 끔 기본(`=1` 만 켬 · PM land1047 · ★[T1186 11-07] main 07eec54e 위 첫 움집 켬 1/2 — "다 서면 켬 기본" 안 섬)');
ok(/const T1146_ROCK = T1146_STONE_RULE && T1126_ROCK_YIELD;/.test(Z), '바위 규칙은 T1126 위에서만 선다(hp = 돌 수 정본 — T1126 끔이면 hp 4 는 돌 수가 아니다)');
ok(/const StoneRule = require\('\.\/stone-rule'\);/.test(Z) && /const T1146_K_BED = StoneRule\.kIntact\(Specialty\.CHUNK_KG, Specialty\.MINE_SWINGS_PER, TOOL_EFFECTS\.pickaxe\.gatherStoneMult\);/.test(Z),
  '★암반 한 타 kg 은 채굴 정본 셋(덩이 kg · 덩이당 타수 · 곡괭이 배수)에서 — 손으로 적은 수 0');
const fGR = fnBody(Z, 'gatherResource'), fNS = fnBody(Z, '_npcGatherResource'), fCut = fnBody(Z, '_t1146Cut'), fSay = fnBody(Z, '_t1146Say'), fSort = fnBody(Z, 'trySortOre'), fGan = fnBody(Z, '_t1146Gangue'), fMine = fnBody(Z, 'mineOreCell');
ok(/if \(T1146_ROCK && best\.type === 'rock'\) dmg = _t1146Cut\(best, dmg\);[^\n]*\n  best\.hp -= dmg;/.test(fGR), '★사람 문 — 도구 배수(`dmg`)를 그 타에 떨어지는 hp 점으로 바꾼 뒤 종전 줄(`best.hp -= dmg`)이 깎는다');
ok(/_npcGatherResource\(npc,r\)/.test(fnBody(Z, 'npcStep')) && /let _dmg = 1;[^\n]*\n\s*if \(T1146_ROCK && r\.type === 'rock'\) _dmg = _t1146Cut\(r, _dmg, true\);\n\s*r\.hp -= _dmg;/.test(fNS), '★NPC 문 — 배수 1(종전) · 같은 함수 `_t1146Cut`(정본 하나 · 사본 0)');
ok(/StoneRule\.kgPerSwing\(mult, 'cracked', T1146_K_BED\)/.test(fCut) && /StoneRule\.split\(/.test(fCut) && /Weights\.kgOf\('stone'\)/.test(fCut), '바위 한 타 = 정본 모듈의 식(금 간 돌) · 돌 한 개 kg = `weights` 석괴');
ok(nums(fCut).join() === '0,6' && nums(fGan).join() === '0' && nums(fSay).join() === '0,1', '★새 수 0 — 존 세 함수에 0 · 소수 자리 수만', `${nums(fCut).join()} | ${nums(fGan).join()} | ${nums(fSay).join()}`);
ok(/if \(best\.hp !== _hp0\) \{/.test(fGR) && /\} else if \(r\.hp !== _hp0\) \{/.test(fNS), 'hp 가 그대로인 타(깎기만)는 저장 · 방송 0 — 끔이면 늘 참(종전 차례)');
ok(/if \(k === 'stone' && T1146_STONE_RULE\) \{ _t1146Kg \+= kg; continue; \}/.test(fSort) && /const _t1146Txt = T1146_STONE_RULE \? _t1146Gangue\(player, _t1146Kg\) : '';/.test(fSort)
   && /if \(k === 'stone'\) \{ got\.stone_waste = /.test(fSort), '★선광 — 켬이면 맥석 kg 을 모아 돌 · 자갈 · 부스러기로(끔 = 다음 줄 — 종전 폐석 글자 그대로)');
ok(/StoneRule\.split\(kg, Weights\.kgOf\('stone'\), Weights\.kgOf\('pebble'\)\)/.test(fGan) && /Lots\.note\(player, it, n, zoneGameDay\(\)\)/.test(fGan), '맥석 나눔 = 정본 모듈 · 돌 · 자갈 kg = `weights` · 얻은 순간 줄(T732)');
ok(fMine.length > 0 && !/1146/.test(fMine.replace(/\n  if \(T1146_STONE_RULE\) _t1186Wear\([^\n]*/, '')), '★땅 채굴(`mineOreCell`) 글자 무접촉 — 암반은 같은 식의 정본 그 자체(★재민 채굴 속도 고정 · 닳기 한 줄만 T1186 문)');
const fHand = fnBody(VIL, '_t1146HandIn'), fSet = fnBody(VIL, '_t720Settle'), fGran = fnBody(VIL, '_lifeGranStep'), fHeld = fnBody(VIL, '_t720Held');
ok(/_lifeEcon\(\)\.actToGranary\(vil\.econ, k, u, null, null\)/.test(fHand) && /const _T1146_KEYS = \['stone', 'pebble'\];/.test(VIL), '★곳간 입구 — T733 부산물 문과 같은 몸통(`actToGranary` · 오늘치 · 건수 칸 없음) · 돌 · 자갈 두 칸');
const HIN = /if \(npc\.inventory && \(npc\.inventory\.stone > 0 \|\| npc\.inventory\.pebble > 0\) && _stoneHandInOn\(vil\)\) _t1146HandIn\(vil, npc\);/;
ok(HIN.test(fSet) && HIN.test(fGran) && fHeld.includes('_stoneHeld(npc)') && fnBody(VIL, '_stoneHandInOn').includes("productionFormulaOff(vil.econ, 'forager')"),
  '곳간에 닿는 두 순간(해 질 녘 정산 · 곳간② 저장)에서만 — 실물 생산에서 돌만 든 손도 실제 귀환 대상이다');
ok(nums(fHand).every(n => ['0','1e-9','2','44','6'].includes(n)) && nums(fHand).filter(n=>n==='44').length===1, '★새 수 0 — 기존 회관 중심/2·도착 거리44 · 소수 자리 · 0 비교(1e-9)만', nums(fHand).join());

sec('② 유도 — 출처 표의 비 · 땅 채굴 정본 · 무게 보존');
{
  const S = SR.STRIKE_SRC;
  ok(JSON.stringify(S) === JSON.stringify({ tool: { strikes: [468, 521], kg: [10, 12] }, fire: { strikes: [1439, 788, 859], kg: [62, 69, 68] } }), '출처 표 — Maqueda 외 2024 멜 실험(연장 채굴 둘 · 불 지피기 셋)의 수 그대로');
  const want = (199 / 3086) / (22 / 989);
  ok(Math.abs(SR.CRACK_X - want) < 1e-12, `★금 간 돌 배수 = (199 kg ÷ 3086타) ÷ (22 kg ÷ 989타) = ${SR.CRACK_X.toFixed(4)}`);
  const body = SRS.replace(/const STRIKE_SRC = \{[\s\S]*?\n\};/, '');
  ok(nums(fnBody(body, 'kIntact') + fnBody(body, 'kgPerSwing') + fnBody(body, 'split')).join() === '0,1e6', '★새 수 0 — 모듈 함수에 0 · 반올림 자리(1e6)만 · 수는 출처 표에만', nums(fnBody(body, 'kIntact') + fnBody(body, 'kgPerSwing') + fnBody(body, 'split')).join());
  const Sp = require(path.join(ROOT, 'server', 'specialty.js'));
  const kb = SR.kIntact(Sp.CHUNK_KG, Sp.MINE_SWINGS_PER, 3);
  ok(Math.abs(SR.kgPerSwing(3, 'bedrock', kb) * Sp.MINE_SWINGS_PER - Sp.CHUNK_KG) < 1e-12, `★암반 = 땅 채굴 정본 그대로 — 곡괭이(3) 한 타 ${(SR.kgPerSwing(3, 'bedrock', kb) * 1000).toFixed(1)} g × ${Sp.MINE_SWINGS_PER}타 = ${Sp.CHUNK_KG} kg`);
  ok(Math.abs(SR.kgPerSwing(3, 'cracked', kb) - 3 * kb * want) < 1e-12 && Math.abs(SR.kgPerSwing(2, 'cracked', kb) - 2 * kb * want) < 1e-12 && SR.kgPerSwing(0, 'cracked', kb) === 0 && SR.kgPerSwing(3, 'mud', kb) === 0,
    `바위 한 타 = 배수 × 금 간 돌 배수 × 암반 — 곡괭이 ${(SR.kgPerSwing(3, 'cracked', kb) * 1000).toFixed(1)} g · 조잡한 돌괭이 ${(SR.kgPerSwing(2, 'cracked', kb) * 1000).toFixed(1)} g · 맨손 ${(SR.kgPerSwing(1, 'cracked', kb) * 1000).toFixed(1)} g · 모르는 종류 0`);
  let bad = 0, worst = 0;
  for (let i = 1; i <= 50; i++) {
    const kg = +(i * 0.613 + (i % 7) * 0.37).toFixed(3), s = SR.split(kg, 4, 0.6);
    const back = s.stone * 4 + s.pebble * 0.6 + s.crumbKg, e = Math.abs(back - kg);
    if (e > 1e-6 || s.crumbKg < 0 || s.crumbKg >= 0.6 || (kg - s.stone * 4) >= 4) bad++;
    worst = Math.max(worst, e);
  }
  ok(bad === 0, '★무게 보존 — 나눔 50판: 돌 × 4 + 자갈 × 0.6 + 부스러기 = kg · 부스러기 < 자갈 한 알 · 돌을 먼저 채운다', `빨강 ${bad} · 최대 차 ${worst.toExponential(1)}`);
  const a = SR.split(7.3, 4, 0.6), b = SR.split(8, 4, 0.6), c = SR.split(4 - 1e-9, 4, 0.6);
  ok(a.stone === 1 && a.pebble === 5 && Math.abs(a.crumbKg - 0.3) < 1e-9 && b.stone === 2 && b.pebble === 0 && b.crumbKg === 0 && c.stone === 1, '나눔 표본 — 7.3 kg = 돌 1 · 자갈 5 · 0.3 kg · 8 kg = 돌 2 · 끝 자리 소수(4 − 1e-9)는 돌 하나', JSON.stringify([a, b, c]));
}

const ON = run({ T1146_STONE_RULE: '1' }), OFF = run({ T1146_STONE_RULE: '0' }), NOGATE = run({ T1146_STONE_RULE: '1', T1065_TOOL_GATE: '0' });   // 두 판 다 손잡이를 글로 준다(기본값과 무관)
const kb = ON ? ON.kBed : 0, kPick = 3 * kb * SR.CRACK_X, kCrude = 2 * kb * SR.CRACK_X, kBare = kb * SR.CRACK_X;
const firstAt = (k, kg) => Math.ceil(kg / k - 1e-9);

sec('③ 켬 · 사람 — 곡괭이 한 벌 · 조잡한 돌괭이 두 벌 · 둘이 한 바위 · 맨손 · 다 캔 바위');
if (!ON) ok(false, '켬 판이 안 돌았다');
else {
  ok(ON.on === true && ON.rock === true && ON.eff.pickaxe === 3 && ON.eff.crude_pick === 2 && ON.dura.pickaxe === 100 && ON.dura.crude_pick === 25 && ON.kgS === 4 && ON.kgP === 0.6,
    `전제 — 손잡이 켬 · 도구 배수(곡괭이 3 · 조잡한 돌괭이 2) · 내구(100 · 25) · 돌 4 kg · 자갈 0.6 kg · 바위 하나 돌 ${ON.N}`);
  const P = ON.pick, firsts = P.hits.map((h, i) => (h.ds > 0 ? i + 1 : 0)).filter(Boolean);
  const wantF = [1, 2, 3, 4].map((n) => firstAt(kPick, n * 4));
  ok(P.hits.length === 100 && P.left && Math.abs(P.d - (100 - 100 * kPick * 100 / 1500)) < 1e-3 && P.stone === 4 && JSON.stringify(firsts) === JSON.stringify(wantF) && P.hp === P.hp0 - 4,
    `★★곡괭이 100타 = 돌 ${P.stone} — 돌이 난 타 ${firsts.join(' · ')}(한 타 ${(kPick * 1000).toFixed(1)} g · 4 kg 마다) · 남은 돌 ${P.hp}/${P.hp0} · ★[T1186] 깎은 kg 으로 닳아 내구 ${P.d}(종전 100타에 깨짐)`, `기대 ${wantF.join(' · ')}`);
  ok(Math.abs(P.chip - (100 * kPick - 16)) < 1e-3, `바위 장부 — 100타 뒤 깎였지만 돌이 안 된 ${P.chip} kg(= 100 × ${(kPick * 1000).toFixed(1)} g − 16 kg)`);
  const idle = P.hits.filter((h) => h.ds === 0), give = P.hits.filter((h) => h.ds > 0);
  ok(idle.length === 96 && idle.every((h) => !h.m.includes('resource_update') && !h.m.includes('inventory') && h.say.length === 1 && /^바위 깎는 중 \d+\.\d\/4kg · 남은 돌 \d+$/.test(h.say[0]) && h.hp === P.hp0 - P.hits.slice(0, P.hits.indexOf(h)).reduce((a, x) => a + x.ds, 0)),
    '★돌이 안 난 타 96 — 방송 · 짐 알림 · 저장 0 · 깎인 kg 한 줄("바위 깎는 중 x/4kg · 남은 돌 n" · 종류 gather) · hp 그대로', idle[0] && `${idle[0].m.join()} · ${idle[0].say[0]}`);
  ok(give.length === 4 && give.every((h) => h.m.join() === 'resource_update,inventory,notice' && /^바위 — 돌 1개 떼어 냄 · 다음 돌 \d+\.\d\/4kg · 남은 돌 \d+$/.test(h.say[0])),
    '돌이 난 타 4 — 방송 hp · 짐 알림 · 한 줄("바위 — 돌 1개 떼어 냄 · 다음 돌 x/4kg · 남은 돌 n")', give[0] && `${give[0].m.join()} · ${give[0].say[0]}`);
  const C = ON.crude, a1 = firstAt(kCrude, 4);
  ok(C && C.a === 40 && C.stoneA === 1 && C.firstA === a1 && Math.abs(C.chipA - (40 * kCrude - 4)) < 1e-3,
    `★★조잡한 돌괭이 한 벌 40타 = 돌 ${C && C.stoneA}(${C && C.firstA}타째 · 기대 ${a1}) · 장부 ${C && C.chipA} kg — ★[T1186] 깎은 kg 으로 닳아 안 깨진다(종전 25타에 깨져 돌 0)`);
  const Sh = ON.share, bWant = firstAt(kPick, 4) - 12;
  ok(Sh && Sh.a === 0 && Sh.b === 1 && Sh.bFirst === bWant && Math.abs(Sh.chipA - 12 * kPick) < 1e-3, `둘이 한 바위 — 장부 하나(A 12타 ${Sh && Sh.chipA} kg · B ${Sh && Sh.bFirst}타째에 넘겨 돌은 B) · 광맥 셀 타수와 같은 꼴`);
  ok(ON.bare && ON.bare.stone === 0 && ON.bare.n === 80 && ON.bare.refused && ON.bare.refused.say.length === 0, '맨손(도구 문 켬) — 거절(깎인 kg 0 · 돌 0)');
  const Bk = ON.brk;
  ok(Bk && Bk.gone && Bk.n === firstAt(kPick, 4) && Bk.stone === 1 && Bk.pebble === 2 && Bk.chip === 0 && Bk.last.m.includes('resource_removed'),
    `★다 캔 바위(남은 돌 1) — ${Bk && Bk.n}타째 사라진다 · 돌 1 + 자갈 2(종전 전리품 한 번 · 그 자리 돌 0) · 바위 장부 지움`, Bk && JSON.stringify(Bk.last.m));
}
if (NOGATE) ok(NOGATE.bare && NOGATE.bare.first === firstAt(kBare, 4) && NOGATE.bare.stone === 1, `맨손(도구 문 끔) — 배수 1 · ${NOGATE.bare && NOGATE.bare.first}타에 첫 돌(한 타 ${(kBare * 1000).toFixed(1)} g)`);

sec('④ 켬 · NPC — 한 걸음 배수 1(종전) · 같은 함수');
if (ON && ON.npc) ok(ON.npc.first === firstAt(kBare, 4) && ON.npc.stone === 1 && ON.npc.hp === ON.npc.max - 1 && Math.abs(ON.npc.nKg - ON.npc.n * kBare) < 1e-6,
  `★NPC ${ON.npc.first}걸음에 첫 돌(사람 맨손과 같은 수 · 깎인 ${ON.npc.nKg.toFixed(2)} kg) · 바위 hp 한 점`);

sec('⑤ 선광 — 맥석은 돌 · 자갈 · 그 자리 부스러기(무게 보존)');
if (ON) {
  const A = ON.sortA;
  ok(A.inv.stone === 1 && A.inv.pebble === 5 && !A.inv.ore_chunk && Math.abs(A.crumb - 0.3) < 1e-6 && /^흙 7kg을 골라 광석은 나오지 않았습니다\. 맥석 7\.3kg에서 돌 1, 자갈 5을\(를\) 얻었습니다\. 부스러기 0\.3kg은 그 자리에 두었습니다\.$/.test(A.say[0] || ''),
    '★★맥석 7.3 kg → 돌 1 · 자갈 5 · 부스러기 0.3 kg(그 자리) — 버림 0', A.say[0]);
  const B = ON.sortB;
  ok(B.inv.copper === 1 && B.inv.stone === 2 && !B.inv.pebble && Math.abs((B.carry.copper || 0) - 0.1) < 1e-6 && new RegExp(`${ON.copperKo} 1을\\(를\\) 얻었습니다\\. 맥석 8\\.0kg에서 돌 2을\\(를\\) 얻었습니다\\.$`).test(B.say[0] || ''),
    '광맥 = 광석 + 돌 — 구리 3.6 kg + 맥석 8 kg → 구리 1(이월 0.1) · 돌 2', B.say[0]);
  const Cc = ON.sortC;
  ok(!Cc.inv.stone && !Cc.inv.pebble && Math.abs(Cc.crumb - 0.4) < 1e-6 && /맥석 0\.4kg에서 얻은 것이 없습니다\. 부스러기 0\.4kg은 그 자리에 두었습니다\.$/.test(Cc.say[0] || ''), '자갈 한 알도 안 되는 맥석(0.4 kg) — 부스러기로 그 자리에', Cc.say[0]);
  const G = ON.ground;
  if (!G) ok(false, '광맥 밖 땅 칸을 못 찾았다');
  else {
    const kg = G.led.stone || 0, sp = SR.split(kg, 4, 0.6);
    ok(G.sw > 2 * G.swingsPer && G.sw <= 2 * G.swingsPer + 2 && G.ch === 2 && Object.keys(G.led).join() === 'stone' && Math.abs(G.chunkKg - kg) < 0.01, `땅(광맥 밖 · p 0) 곡괭이 ${G.sw}타 = 덩이 2(정본 ${G.swingsPer}타 + 깊이 · ${G.chunkKgCanon} kg — 무접촉) · 장부 = 돌 ${kg} kg`);
    ok(G.stone === sp.stone && G.pebble === sp.pebble && Math.abs(G.crumb - sp.crumbKg) < 1e-6 && Math.abs(G.stone * 4 + G.pebble * 0.6 + G.crumb - kg) < 1e-6,
      `★★땅을 파면 돌이 나온다 — ${kg} kg → 돌 ${G.stone} · 자갈 ${G.pebble} · 부스러기 ${G.crumb} kg(무게 보존)`, G.say[0]);
  }
}

sec('⑥ 끔 — 종전 바이트(T1126 한 타 · 맥석 버림)');
if (!OFF) ok(false, '끔 판이 안 돌았다');
else {
  const h = OFF.pick.hits;
  ok(OFF.on === false && OFF.rock === false && h[0].ds === 3 && h[0].m.join() === 'resource_update,inventory' && h.every((x) => x.say.length === 0) && h.every((x) => x.chip === 0),
    '곡괭이 첫 타 = 돌 3(T1126 — hp 3) · 방송 · 짐 알림 · 깎인 kg 말 0 · 바위 장부 0', h[0].m.join());
  ok(OFF.sortA.inv.stone === undefined && OFF.sortA.inv.pebble === undefined && /^흙 7kg을 골라 광석은 나오지 않았습니다\. 맥석 7\.3kg은 버렸습니다\.$/.test(OFF.sortA.say[0] || ''), '맥석 7.3 kg 버림(종전 글자)', OFF.sortA.say[0]);
  ok(OFF.ground && OFF.ground.stone === 0 && OFF.ground.ch === 2, '땅 두 덩이 · 선광하면 돌 0(종전 — 폐석)');
}

sec('⑦ 곳간 — NPC 손의 돌 · 자갈(진짜 econ 몸통)');
{
  const probe = (env, js) => {
    const r = spawnSync(process.execPath, ['-e', js], { cwd: ROOT, env: Object.assign({}, process.env, env), encoding: 'utf8', timeout: 120000 });
    try { return JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch (e) { return { err: (r.stderr || '').slice(-300) }; }
  };
  const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js')), VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
  const js = `const E=require(${EP}); const V=require(${VP}); const P=V.__labProbe._t1146Probe;
    const ev=E.createVillage({initialPop:0,name:'x',fertility:1});
    const tot=(k)=>(ev.storage[k]||0)+((ev.treasury&&ev.treasury[k])||0); const t0={s:tot('stone'),p:tot('pebble'),w:tot('wood')};
    const vil={econ:ev}; const npc={inventory:{stone:3,pebble:2,wood:1}};
    const g=P.handIn(vil,npc); const a={gs:+(tot('stone')-t0.s).toFixed(6),gp:+(tot('pebble')-t0.p).toFixed(6),gw:+(tot('wood')-t0.w).toFixed(6),gr:vil._t1146Gr?Object.assign({},vil._t1146Gr):null};
    const npc2={inventory:{stone:2,pebble:1}}; const t1={s:tot('stone'),p:tot('pebble')}; P.settle(vil,npc2,Date.now(),{fw:-1});
    console.log(JSON.stringify(Object.assign({on:P.ON,keys:P.keys(),g,inv:npc.inventory},a,{inv2:npc2.inventory,gs2:+(tot('stone')-t1.s).toFixed(6),gp2:+(tot('pebble')-t1.p).toFixed(6)})))`;
  const on = probe({ T1146_STONE_RULE: '1' }, js), off = probe({ T1146_STONE_RULE: '0' }, js);
  ok(on.on === true && on.keys.join() === 'stone,pebble' && on.g === 5 && on.inv.stone === 0 && on.inv.pebble === 0 && on.inv.wood === 1 && on.gs === 3 && on.gp === 2 && on.gw === 0 && on.gr && on.gr.stone === 3 && on.gr.pebble === 2,
    '★★켬 — 손의 돌 3 · 자갈 2 → 곳간 + 국고 = 든 몫(세금은 econ 몸통이 뗀다) · 손 0 · 통나무는 이 문 밖', JSON.stringify(on));
  ok(on.inv2 && on.inv2.stone === 0 && on.inv2.pebble === 0 && on.gs2 === 2 && on.gp2 === 1, '해 질 녘 정산(`_t720Settle`)으로 닿아도 같은 문', JSON.stringify({ inv2: on.inv2, gs2: on.gs2, gp2: on.gp2 }));
  ok(off.on === false && off.g === 0 && off.inv.stone === 3 && off.inv.pebble === 2 && off.gs === 0 && off.gp === 0 && off.gr === null && off.inv2.stone === 2 && off.gs2 === 0,
    '끔 — 손에 그대로(종전)', JSON.stringify(off));
}

sec('⑧ 돌연변이 — 사람 문 · 선광 줄을 걷어 낸 글자');
{
  const mp = (() => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1146_CHILD: '1', T1146_MUT: 'player' }), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
    const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@T1146 ')); return l ? JSON.parse(l.slice(8)) : null; })();
  const ms = (() => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1146_CHILD: '1', T1146_MUT: 'sort' }), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
    const l = (r.stdout || '').split('\n').find((x) => x.startsWith('@@T1146 ')); return l ? JSON.parse(l.slice(8)) : null; })();
  ok(mp && mp.pick.hits[0].ds === 3 && mp.pick.stone > 4, '★사람 문을 걷으면 곡괭이 첫 타 = 돌 3 — ③ 곡괭이 판정(돌 4 · 첫 돌 24타)이 빨갛다', mp && `첫 타 ${mp.pick.hits[0].ds} · 한 벌 ${mp.pick.stone}`);
  ok(ms && /맥석 7\.3kg은 버렸습니다/.test(ms.sortA.say[0] || '') && !ms.sortA.inv.stone, '★선광 줄을 걷으면 맥석이 다시 버려진다 — ⑤ 판정이 빨갛다', ms && ms.sortA.say[0]);
}

console.log(`\n=== T1146: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
