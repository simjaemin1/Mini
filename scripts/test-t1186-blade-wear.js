#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1186-blade-wear.js — T1186: 돌 규칙(T1146) 켬 위의 두 정본 — 레시피 돌 = 날 실제 무게 · 내구 = 깎은 · 벤 kg ==========
//
// ★왜 [카드 T1186 · ★재민 11-05 "조사하는 건 좋은 거 같아. 그리고 내구도도 좀 천천히 닳게 하면 되지 않을까"]
//   돌 규칙 켬(T1146)이 첫 움집을 막은 두 정본: ㉡ 레시피 돌이 4 kg 덩이 수(곡괭이 돌 5 = 20 kg · 도끼 돌 2 = 8 kg — 날 실제 무게 아님)
//   ㉠ 내구가 친 횟수(조잡한 돌괭이 25타 · 곡괭이 100타 — 한 타 113 g 이면 25타 = 2.8 kg, 돌 한 덩이 4 kg 도 못 떼고 깨졌다).
//   고침(손잡이 하나 `T1146_STONE_RULE` · 끔 = 종전 바이트):
//     ㉡ 곡괭이 · 도끼 레시피의 돌 = 날 출토 실측 kg(`StoneRule.BLADE_SRC` 평균) ÷ 덩이 4 kg = 덩이 몫(0.168 · 0.188) — 날 kg 만 쓰고 나머지는 돌로 남는다(무게 보존)
//     ㉠ 곡괭이 · 도끼(정품 · 조잡)는 깎은 · 벤 kg 으로 닳는다 — 한 kg 닳기 = 정품 최대 내구 ÷ (출처 수명 kg × 게임 허용 배수)
//
// ★이 하네스가 재는 것(진짜 서버 함수):
//   ① 글자 — 손잡이 하나(존에 선언 하나 · 레시피 표 곁) · 정본 모듈 · 새 수 0 · 사람 문 · 땅 채굴 문 · 제작 문 · 끔 갈래 = 종전 줄
//   ② 출처 표 — 날 무게(도끼 11점 · 곡괭이 3점) · 평균 · 수명(바위 1.5 t · 원래 날 100그루) · 배수 1
//   ③ 켬 · 제작 — 돌 한 덩이로 곡괭이(돌 0.168 = 날 0.672 kg) → 도끼(0.188 = 0.752 kg) → 남은 돌 0.644 덩이(2.576 kg) · 검은 종전(돌 8)
//   ④ 켬 · 바위 — 곡괭이 30타: 돌 1(24타) · 닳기 = 깎은 kg × 100/1500 · 조잡한 돌괭이 40타: 첫 돌 36타 · 안 깨짐 · 한 벌이 깨질 때까지 = 375 kg
//   ⑤ 켬 · 나무 — 도끼 한 타에 한 그루(그 나무 통나무 kg 만큼) · 조잡한 돌도끼 두 타(2/3 · 1/3)
//   ⑥ 켬 · 땅 — 곡괭이 한 덩이(문턱 타수) = 덩이 kg 만큼 닳는다
//   ⑦ 도구와 일이 안 맞으면(문 끔 · 검으로 바위) 종전 한 타 1
//   ⑧ 끔 — 레시피 돌 5 · 2 · 알림 꼬리 0 · 한 타 1 · 땅 = 솜씨 몫(종전)
//
// 실행: node scripts/test-t1186-blade-wear.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─────────────────────────────── 아이 — 한 판(진짜 존) JSON 한 줄 ───────────────────────────────
if (process.env.T1186_CHILD === '1') {
  const TMP = `/tmp/test-t1186-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(require('./lib-port').port(46000));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.LATENCY_MS = '0';
  process.env.FISH_TICK_MS = '999000';
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const CH = require(path.join(ROOT, 'server', 'chunk.js'));
  const ZB = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando.biome;
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  const pool = [];
  for (let k = 0; k < 60; k++) for (const r of (CH.generateChunkResources('hanbando', ZB, k, k, CH.CHUNK_SIZE, new Set(), 0) || [])) pool.push(r);
  const rocks = pool.filter((r) => r.type === 'rock' && r.hp > 0), trees = pool.filter((r) => r.type === 'tree' && r.hp > 0);
  let ri = 0, ti = 0;
  const nextRock = () => { const r = rocks[ri++]; if (r && !H.resources.has(r.id)) H.resources.set(r.id, r); return r; };
  const nextTree = () => { const r = trees[ti++]; if (r && !H.resources.has(r.id)) H.resources.set(r.id, r); return r; };
  let _pid = 0;
  const mkPlayer = (x, y) => {
    const msgs = [];
    const ws = { readyState: 1, send: (s) => { try { msgs.push(JSON.parse(s)); } catch (e) {} } };
    const p = { pid: `t1186p${++_pid}`, playerId: `anon_t1186_${_pid}`, name: '깨는 손', ws, x, y, floor: 0, inventory: {}, toolItems: [], equipment: [], equipSlots: {},
      equipped: null, hotkey1: null, tribeId: null, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, craftSkill: {}, lastAttackAt: 0, lastRangedAt: 0,
      vp: 0, isDown: false, persistent: false, msgs };
    H.players.set(p.pid, p);
    return p;
  };
  const give = (p, inv) => { for (const [k, v] of Object.entries(inv)) p.inventory[k] = (p.inventory[k] || 0) + v; };
  const notes = (m) => m.filter((x) => x.type === 'notice').map((x) => x.text);
  const make = (p, name) => { give(p, H.RECIPES[name].cost); p.msgs.length = 0; H.doCraft(p, name); const t = p.toolItems.filter((x) => x.type === name && x.d > 0).pop() || null; if (t) H.doEquip(p, t.id); return t; };
  const out = { on: H.T1146_STONE_RULE, rock: H.T1146_ROCK, gate: H.T1065_TOOL_GATE, kgS: W.kgOf('stone'), kgP: W.kgOf('pebble'), kgW: W.kgOf('wood'),
    rc: { pickaxe: H.RECIPES.pickaxe, axe: H.RECIPES.axe, sword: H.RECIPES.sword, saw: H.RECIPES.saw, hammer: H.RECIPES.hammer, crude_pick: H.RECIPES.crude_pick, crude_axe: H.RECIPES.crude_axe },
    dura: Object.assign({}, H.TOOL_MAX_DURABILITY), treeKg: H._t1186TreeKg(), per: { pickaxe: H._t1186PerKg('pickaxe'), crude_pick: H._t1186PerKg('crude_pick'), axe: H._t1186PerKg('axe'), crude_axe: H._t1186PerKg('crude_axe'), sword: H._t1186PerKg('sword') },
    kBed: H.T1146_K_BED };
  // ③ 제작 — 곡괭이 · 도끼(레시피 그대로 주고 만든다)
  {
    const p = mkPlayer(0, 0);
    const st0 = H.t1186Stat();
    give(p, { wood: 8, stone: 1 }); p.msgs.length = 0; H.doCraft(p, 'pickaxe');   // 첫 움집 길 그대로 — 바위에서 뗀 돌 한 덩이로 곡괭이 · 도끼
    const invMsg = (m) => { const x = m.filter((q) => q.type === 'inventory').pop(); return x ? x.inventory : null; };
    out.craftPick = { inv: Object.assign({}, p.inventory), say: notes(p.msgs), tool: p.toolItems.map((t) => [t.type, t.d, t.max]), sent: invMsg(p.msgs) };
    p.msgs.length = 0; H.doCraft(p, 'axe');
    out.craftAxe = { inv: Object.assign({}, p.inventory), say: notes(p.msgs), sent: invMsg(p.msgs) };
    p.msgs.length = 0; H.doCraft(p, 'axe');   // 남은 돌로 한 자루 더(0.644 → 0.456)
    out.craftAxe2 = { inv: Object.assign({}, p.inventory), say: notes(p.msgs), tools: p.toolItems.length };
    p.inventory = {}; give(p, H.RECIPES.sword.cost); p.msgs.length = 0; H.doCraft(p, 'sword');
    out.craftSword = { inv: Object.assign({}, p.inventory), say: notes(p.msgs) };
    p.inventory = { wood: 3, stone: 0.1 }; p.msgs.length = 0; H.doCraft(p, 'pickaxe');   // 덩이 몫이 모자라면 종전 거절 문장
    out.payload = H.invPayload ? H.invPayload({ stone: 2.6444, wood: 3.7, pebble: 0.5 }) : null;   // 짐 전문 — 켬: 돌만 덩이 몫 · 끔: 종전 정수
    out.craftShort = { inv: Object.assign({}, p.inventory), say: notes(p.msgs) };
    const st1 = H.t1186Stat();
    out.craftStat = { blade: +(st1.bladeKg - st0.bladeKg).toFixed(6), blades: st1.blades - st0.blades };
    H.players.delete(p.pid);
  }
  const hit = (p, r) => { const s0 = p.inventory.stone || 0, t = H.getEquippedTool(p), d0 = t ? t.d : null; p.msgs.length = 0; H.gatherResource(p, r); const t1 = H.getEquippedTool(p);
    return { ds: (p.inventory.stone || 0) - s0, d0, d1: t1 ? t1.d : null, gone: !H.resources.has(r.id), broke: notes(p.msgs).some((x) => /깨졌습니다/.test(x)) }; };
  // ④-ⓐ 곡괭이 30타
  {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'pickaxe'); p.inventory.stone = 0; p.inventory.pebble = 0;
    const hs = []; for (let i = 0; i < 30; i++) hs.push(hit(p, r));
    out.pick = { hs, stone: p.inventory.stone || 0, d: H.getEquippedTool(p).d, chip: H.t1146Chip(r.id) };
    H.players.delete(p.pid);
  }
  // ④-ⓑ 조잡한 돌괭이 40타 → 그리고 깨질 때까지(바위 하나 · 무게 장부)
  {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'crude_pick');
    const hs = []; for (let i = 0; i < 40; i++) hs.push(hit(p, r));
    out.crude = { hs: hs.map((h) => h.ds), first: hs.findIndex((h) => h.ds > 0) + 1, stone: p.inventory.stone || 0, d: H.getEquippedTool(p) ? H.getEquippedTool(p).d : null };
    const st0 = H.t1186Stat();
    let n = 40, broke = false;
    for (let i = 0; i < 6000 && H.getEquippedTool(p) && H.resources.has(r.id); i++) { const h = hit(p, r); n++; if (h.broke) { broke = true; break; } }
    const st1 = H.t1186Stat();
    out.crudeLife = { n, broke, stone: p.inventory.stone || 0, kg: +(((st1.kg.crude_pick || 0)) ).toFixed(3), gone: !H.resources.has(r.id), kg40: +((st0.kg.crude_pick || 0)).toFixed(6) };
    H.players.delete(p.pid);
  }
  // ⑤ 나무 — 도끼 한 타 · 조잡한 돌도끼 두 타
  {
    const r = nextTree(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'axe');
    const l = H.lootOfResource(r) || {}, kg = (l.wood || 0) * W.kgOf('wood');
    const h = hit(p, r);
    out.axe = { r: r.r, hp: r.maxHp, wood: l.wood, kg, d0: h.d0, d1: h.d1, gone: h.gone, wood1: p.inventory.wood || 0 };
    H.players.delete(p.pid);
  }
  {
    const r = nextTree(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'crude_axe');
    const l = H.lootOfResource(r) || {}, kg = (l.wood || 0) * W.kgOf('wood');
    const a = hit(p, r), b = hit(p, r);
    out.crudeAxe = { r: r.r, hp: r.maxHp, kg, a: [a.d0, a.d1, a.gone], b: [b.d0, b.d1, b.gone] };
    H.players.delete(p.pid);
  }
  // ⑥ 땅 — 광맥 밖 땅 칸을 곡괭이로 한 덩이
  {
    const T = H.terrain; let cell = null; const r0 = rocks[0];
    for (let d = 2; d < 60 && !cell; d++) for (let dx = -d; dx <= d && !cell; dx++) for (const dy of [-d, d]) {
      const cx = Math.floor(r0.x / 32) + dx, cy = Math.floor(r0.y / 32) + dy, px = cx * 32 + 16, py = cy * 32 + 16;
      if (H.isWaterTileLocal(px, py) || H.isTerrainBlockedLocal(px, py)) continue;
      if ((T.oreProbAt ? T.oreProbAt('hanbando', px, py) : 0) > 0) continue;
      cell = { px, py }; break;
    }
    if (cell) {
      const p = mkPlayer(cell.px, cell.py);
      make(p, 'pickaxe'); p.inventory = {}; p.craftSkill = { mining: 0 };
      const t = H.getEquippedTool(p), d0 = t.d; let sw = 0, ch = 0;
      for (let i = 0; i < 200 && ch < 1; i++) { p._mineT = 0; const b = p.inventory.ore_chunk || 0; if (!H.mineOreCell(p)) break; sw++; if ((p.inventory.ore_chunk || 0) > b) ch++; }
      out.ground = { sw, ch, d0, d1: H.getEquippedTool(p) ? H.getEquippedTool(p).d : null, chunkKg: H.Specialty.mineChunkKg(0), wear0: H.Specialty.mineToolWear(0) };
      H.players.delete(p.pid);
    } else out.ground = null;
  }
  // ⑦ 도구와 일이 안 맞으면 — 검으로 바위(도구 문 끔 판에서만 친다)
  {
    const r = nextRock(), p = mkPlayer(r.x + 20, r.y);
    make(p, 'sword');
    const h = hit(p, r);
    out.sword = { d0: h.d0, d1: h.d1, refused: h.d0 === h.d1 };
    H.players.delete(p.pid);
  }
  console.log = _l; console.warn = _w; console.error = _e;
  process.stdout.write('@@T1186 ' + JSON.stringify(out) + '\n');
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);
}

// ─────────────────────────────── 부모 — 글자 · 출처 · 판 ───────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sec = (t) => console.log('\n' + t);
const run = (env) => {
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T1186_CHILD: '1' }, env), encoding: 'utf8', timeout: 600000, maxBuffer: 64 << 20 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@T1186 '));
  if (!line) { console.log(`  (아이 ${JSON.stringify(env)} 끝 코드 ${r.status} · ${(r.stderr || '').slice(-600)})`); return null; }
  return JSON.parse(line.slice(8));
};
function fnBody(src, name) {
  const i = src.search(new RegExp(`function ${name}\\(`)); if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
const nums = (body) => [...new Set((body.replace(/\/\/[^\n]*/g, '').replace(/'[^']*'|`[^`]*`/g, '').match(/(?<![\w.$])\d+(?:\.\d+)?(?:e-?\d+)?(?![\w])/g) || []))].sort();
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-6);
console.log('\n=== T1186 돌 규칙 켬 위 — 레시피 돌 = 날 실제 무게 · 내구 = 깎은 · 벤 kg(`T1146_STONE_RULE`) ===');
const Z = rd('server/zone.js');
const SRS = rd('server/stone-rule.js');
const SR = require(path.join(ROOT, 'server', 'stone-rule.js'));

sec('① 글자 — 손잡이 하나 · 정본 모듈 · 새 수 0 · 세 문 · 끔 = 종전 줄');
ok((Z.match(/const T1146_STONE_RULE = process\.env\.T1146_STONE_RULE/g) || []).length === 1 && (Z.match(/const StoneRule = require\('\.\/stone-rule'\);/g) || []).length === 1 && !/T1186_[A-Z_]+ = process\.env/.test(Z),
  '★손잡이 하나 — 존에 선언 하나(T1146 그대로 · T1186 손잡이 0) · 정본 모듈 선언 하나');
ok(Z.indexOf('const T1146_STONE_RULE = ') < Z.indexOf('if (T1146_STONE_RULE) {\n  const _kgS') && Z.indexOf('const RECIPES = {') < Z.indexOf('const T1146_STONE_RULE = '), '선언은 레시피 표 바로 뒤 — 레시피 돌 고침이 읽을 때 이미 서 있다');
const fGR = fnBody(Z, 'gatherResource'), fMine = fnBody(Z, 'mineOreCell'), fCraft = fnBody(Z, 'doCraft');
ok(/if \(eqInst\) \{ if \(T1146_STONE_RULE\) _t1186WearHit\(player, eqInst, best, _hp0\); else consumeEquippedDurability\(player, 1\); \}/.test(fGR), '★사람 문 — 켬 = 깎은 · 벤 kg 닳기 · 끔 = 종전 줄(한 타 1)');
ok(/if \(T1146_STONE_RULE\) _t1186Wear\(player, getEquippedTool\(player\), 'rock', Specialty\.mineChunkKg\(lvlF\) \/ need, Specialty\.mineToolWear\(lvlF\)\);[^\n]*\n\s*else consumeEquippedDurability\(player, Specialty\.mineToolWear\(lvlF\)\);/.test(fMine),
  '★땅 채굴 문 — 켬 = 이 타가 판 kg(덩이 kg ÷ 문턱 타수) × 솜씨 몫 · 끔 = 종전 줄');
ok(/const _t1186Txt = \(T1146_STONE_RULE && recipe\.bladeKg > 0\) \? _t1186Blade\(player, recipe\) : '';/.test(fCraft) && /을\(를\) 만들어 가방에 넣었습니다\.\$\{_t1186Txt\}/.test(fCraft), '★제작 문 — 날 kg 이 있는 레시피만 꼬리(날 kg · 남은 돌 덩이) · 끔 = 빈 꼬리(종전 글자)');
const fW = fnBody(Z, '_t1186Wear'), fWH = fnBody(Z, '_t1186WearHit'), fPK = fnBody(Z, '_t1186PerKg'), fTK = fnBody(Z, '_t1186TreeKg'), fRest = fnBody(Z, '_t1186Blade');
const allN = [fW, fWH, fPK, fTK, fRest].map(nums);
ok(allN.every((a) => a.every((n) => ['0', '1', '2', '6'].includes(n))), '★새 수 0 — 다섯 함수에 0 · 1(한 번 몫) · 소수 자리(2 · 6)만', allN.map((a) => a.join()).join(' | '));
ok(/StoneRule\.lifeKg\(job, _t1186TreeKg\(\)\) \* StoneRule\.WEAR_ALLOW/.test(fPK) && /TOOL_MAX_DURABILITY\[gen\] \/ L/.test(fPK) && /lootOfResource\(\{ type: 'tree', x: 0, y: 0 \}\)/.test(fTK) && /Weights\.kgOf\('wood'\)/.test(fTK),
  '한 kg 닳기 = 정품 최대 내구(종전 표) ÷ (출처 수명 × 배수) · 나무 한 그루 = 전리품 정본의 기본 나무 × `weights`');
ok(/player\.inventory\.stone = \+Math\.max\(0, player\.inventory\.stone \|\| 0\)\.toFixed\(6\);/.test(fRest) && /Weights\.kgOf\('stone'\)/.test(fRest) && /const n = \+\(bk \/ _kgS\)\.toFixed\(3\);/.test(Z) && /R\.bladeKg = \+\(n \* _kgS\)\.toFixed\(6\);/.test(Z),
  '레시피 돌 = 날 kg ÷ 덩이 kg(천분의 일 덩이 = 4 g 에서 반올림) · 날 kg = 그 몫 × 덩이 kg(뺀 만큼) · 남은 돌은 백만분의 일에서 끊는다');
ok(/_t1146Last = Math\.min\(kg, \+\(r\.hp \* kgS - \(_t1146Chip\.get\(r\.id\) \|\| 0\)\)\.toFixed\(6\)\);/.test(fnBody(Z, '_t1146Cut')), '바위 한 타 kg 은 T1146 장부 함수가 그 자리에서 적는다(남은 바위 무게 위로는 못 깎는다)');

sec('② 출처 표 — 날 무게 · 수명 · 게임 허용 배수');
{
  const ax = SR.BLADE_SRC.axe.kg, pk = SR.BLADE_SRC.pickaxe.kg;
  ok(JSON.stringify(ax) === JSON.stringify([0.386, 1.1, 0.73, 0.867, 0.412, 0.8, 1.11, 0.698, 1.04, 0.425, 0.719]), '도끼 날 — 吉朝 2022 飛驒 太型蛤刃石斧 第1表 무게 있는 완형 11점 그대로(g → kg)');
  ok(JSON.stringify(pk) === JSON.stringify([1.0046, 0.4381, 0.5715]), '곡괭이 날 — 立野遺跡 대형 打製石斧(土掘具) 3점 그대로');
  ok(near(SR.bladeKg('axe'), 8.287 / 11, 1e-12) && near(SR.bladeKg('pickaxe'), 2.0142 / 3, 1e-12) && SR.bladeKg('sword') === 0,
    `★날 한 자루 = 평균 — 도끼 ${(SR.bladeKg('axe') * 1000).toFixed(1)} g · 곡괭이 ${(SR.bladeKg('pickaxe') * 1000).toFixed(1)} g · 검 미확인 0`);
  ok(SR.LIFE_SRC.rock.kg === 1500 && SR.LIFE_SRC.wood.trees === 100 && SR.lifeKg('rock', 15) === 1500 && SR.lifeKg('wood', 15) === 1500 && SR.lifeKg('wood', 0) === 0 && SR.lifeKg('fish', 15) === 0,
    '수명 — 바위 1.5 t(Timberlake & Craddock 2013) · 원래 날 100그루(드라베드) × 한 그루 kg · 모르는 일 0');
  ok(SR.WEAR_ALLOW === 1 && /const WEAR_ALLOW = 1;/.test(SRS), '★게임 허용 배수 1 — 한 자리 · 이름 · 유도 주석(첫 움집 길의 하한이 1 보다 작다)');
  const body = SRS.replace(/const BLADE_SRC = \{[\s\S]*?\n\};/, '').replace(/const LIFE_SRC = \{[\s\S]*?\n\};/, '');
  const m = (body.match(/const bladeKg = [^\n]*/) || [''])[0] + (body.match(/const lifeKg = [^\n]*/) || [''])[0];
  ok(nums(m).join() === '0', '★새 수 0 — 모듈 식에 0 만(수는 출처 표에만)', nums(m).join());
}

const ON = run({ T1146_STONE_RULE: '1' }), OFF = run({ T1146_STONE_RULE: '0' }), NOGATE = run({ T1146_STONE_RULE: '1', T1065_TOOL_GATE: '0' });
const kPick = ON ? 3 * ON.kBed * SR.CRACK_X : 0, kCrude = ON ? 2 * ON.kBed * SR.CRACK_X : 0;

sec('③ 켬 · 제작 — 덩이에서 날 kg 만 깨 낸다');
if (!ON) ok(false, '켬 판이 안 돌았다');
else {
  ok(ON.on === true && ON.rock === true && ON.kgS === 4 && ON.kgP === 0.6 && ON.kgW === 3 && ON.treeKg === 15, `전제 — 손잡이 켬 · 돌 4 kg · 자갈 0.6 kg · 통나무 3 kg · 기본 나무 한 그루 ${ON.treeKg} kg`);
  const P = ON.rc.pickaxe, A = ON.rc.axe;
  ok(P.cost.wood === 3 && P.cost.stone === 0.168 && P.stone === 0.168 && near(P.bladeKg, 0.672) && A.cost.wood === 5 && A.cost.stone === 0.188 && near(A.bladeKg, 0.752),
    '★★레시피 — 곡괭이 = 나무 3 · 돌 0.168 덩이(날 0.672 kg) · 도끼 = 나무 5 · 돌 0.188 덩이(0.752 kg) — 종전 돌 5 · 2(20 kg · 8 kg)', JSON.stringify([P.cost, A.cost]));
  ok(ON.rc.sword.cost.stone === 8 && ON.rc.saw.cost.stone === 4 && ON.rc.hammer.cost.stone === 3 && !ON.rc.sword.bladeKg && JSON.stringify(ON.rc.crude_pick.cost) === JSON.stringify({ pebble: 3, twig: 1, fiber: 2 }),
    '검 · 톱 · 망치(날 무게 미확인) · 조잡한 석기(주운 자갈) — 종전 그대로');
  const C = ON.craftPick, X = ON.craftAxe, X2 = ON.craftAxe2;
  ok(C.inv.wood === 5 && C.inv.stone === 0.832 && !C.inv.pebble && C.tool.length === 1 && C.tool[0][1] === 100 && /^곡괭이을\(를\) 만들어 가방에 넣었습니다\. 날에 돌 0\.168덩이\(0\.67kg\)를 썼습니다\. 남은 돌은 0\.832덩이\(3\.33kg\)입니다\.$/.test(C.say[C.say.length - 1] || ''),
    '★곡괭이 — 돌 한 덩이(4 kg)에서 날 0.672 kg · 남은 돌 0.832 덩이(3.33 kg) · 내구 100(종전 칸)', C.say[C.say.length - 1]);
  ok(X.inv.wood === 0 && X.inv.stone === 0.644 && /^도끼을\(를\) 만들어 가방에 넣었습니다\. 날에 돌 0\.188덩이\(0\.75kg\)를 썼습니다\. 남은 돌은 0\.644덩이\(2\.58kg\)입니다\.$/.test(X.say[X.say.length - 1] || ''),
    '★★도끼 — 같은 덩이의 나머지에서(바위를 다시 안 친다) · 남은 돌 0.644 덩이(2.58 kg)', X.say[X.say.length - 1]);
  ok(/만들려면/.test(X2.say[X2.say.length - 1] || '') && X2.inv.stone === 0.644 && X2.tools === 2, '나무가 없으면 종전 거절(돌은 그대로)', X2.say[X2.say.length - 1]);
  ok(C.sent && C.sent.stone === 0.832 && X.sent && X.sent.stone === 0.644 && C.sent.wood === 5, '★짐 전문(`inventory`)이 덩이 몫을 싣는다 — 클라 짐 · 제작 창이 남은 돌 0.832 · 0.644 를 본다(그 밖 품목은 종전 정수)', JSON.stringify([C.sent, X.sent]));
  ok(!ON.craftSword.inv.pebble && /^검을\(를\) 만들어 가방에 넣었습니다\.$/.test(ON.craftSword.say[ON.craftSword.say.length - 1] || ''), '검 — 날 무게가 없으면 꼬리 0(종전 글자)');
  ok(ON.craftShort.inv.stone === 0.1 && /^곡괭이을\(를\) 만들려면 나무 3, 돌 0\.168이\(가\) 있어야 합니다\.$/.test(ON.craftShort.say[ON.craftShort.say.length - 1] || ''), '덩이 몫이 모자라면(돌 0.1) — 종전 거절 문장(재료 칸 그대로)', ON.craftShort.say[ON.craftShort.say.length - 1]);
  const S = ON.craftStat;
  ok(S.blades === 2 && near(S.blade, 0.672 + 0.752) && near(4 - S.blade, 0.644 * 4), `★무게 보존 — 한 덩이 4 kg = 날 ${S.blade.toFixed(3)} kg + 남은 돌 ${(0.644 * 4).toFixed(3)} kg`);
}

sec('④ 켬 · 바위 — 깎은 kg 만큼 닳는다');
if (ON) {
  ok(near(ON.per.pickaxe, 100 / 1500, 1e-12) && near(ON.per.crude_pick, 100 / 1500, 1e-12) && near(ON.per.axe, 100 / 1500, 1e-12) && near(ON.per.crude_axe, 100 / 1500, 1e-12) && ON.per.sword === 0 && ON.dura.pickaxe === 100 && ON.dura.crude_pick === 25,
    '한 kg 닳기 = 100 ÷ 1500(곡괭이 · 조잡한 돌괭이 · 도끼 · 조잡한 돌도끼 같은 몫) · 검 0(kg 으로 안 닳는다) · 최대 내구 표 그대로(100 · 25)');
  const P = ON.pick, first = P.hs.findIndex((h) => h.ds > 0) + 1, want = 100 - 30 * kPick * 100 / 1500;
  ok(P.stone === 1 && first === Math.ceil(4 / kPick - 1e-9) && near(P.d, want, 1e-4) && P.hs.every((h) => !h.broke),   // 한 타마다 백만분의 일 자리에서 끊는다(30타 ≤ 3e-5)
    `★★곡괭이 30타 — 돌 ${P.stone}(${first}타째) · 내구 100 → ${P.d}(= 100 − 30 × ${(kPick * 1000).toFixed(1)} g × 100/1500 · 종전이면 70)`);
  ok(P.hs.every((h, i) => near(h.d0 - h.d1, kPick * 100 / 1500, 1e-5)), `한 타 닳기 = 그 타 kg × 100/1500 = ${(kPick * 100 / 1500).toFixed(5)}(30타 모두)`);
  const C = ON.crude;
  ok(C.first === Math.ceil(4 / kCrude - 1e-9) && C.stone === 1 && near(C.d, 25 - 40 * kCrude * 100 / 1500, 1e-4),
    `★★조잡한 돌괭이 40타 — ${C.first}타째 첫 돌(종전: 25타에 깨져 돌 0) · 내구 25 → ${C.d}`);
  const L = ON.crudeLife;
  ok(L.broke && near(L.kg, 375, 0.2) && L.stone >= 93, `★조잡한 돌괭이 한 벌 = 바위 ${L.kg} kg(= 1.5 t × 25/100 · ${L.n}타 · 돌 ${L.stone}) 깎고 깨진다`);
}

sec('⑤ 켬 · 나무 — 벤 kg 만큼');
if (ON) {
  const A = ON.axe;
  ok(A.gone && near(A.d0 - A.d1, A.kg * 100 / 1500, 1e-6) && A.wood1 === A.wood, `★도끼 한 타에 한 그루(반경 ${(+A.r).toFixed(1)} · 통나무 ${A.wood} = ${A.kg} kg) — 닳기 ${(A.d0 - A.d1).toFixed(4)} = ${A.kg} × 100/1500(종전 1)`);
  const C = ON.crudeAxe;
  ok(!C.a[2] && C.b[2] && near(C.a[0] - C.a[1], C.kg * (2 / 3) * 100 / 1500, 1e-6) && near(C.b[0] - C.b[1], C.kg * (1 / 3) * 100 / 1500, 1e-6),
    `조잡한 돌도끼 두 타 — 첫 타 hp 2/3 · 둘째 타 남은 1/3(넘친 배수는 안 친다) · 합 = 그 나무 ${C.kg} kg`);
}

sec('⑥ 켬 · 땅 — 덩이 kg 만큼');
if (ON) {
  const G = ON.ground;
  if (!G) ok(false, '광맥 밖 땅 칸을 못 찾았다');
  else ok(G.ch === 1 && near(G.d0 - G.d1, G.chunkKg * 100 / 1500 * G.wear0, 1e-4), `★곡괭이로 땅 한 덩이(${G.sw}타) — 닳기 ${(G.d0 - G.d1).toFixed(4)} = 덩이 ${G.chunkKg} kg × 100/1500 × 솜씨 몫 ${G.wear0}(종전 ${G.sw})`);
}

sec('⑦ 도구와 일이 안 맞으면 — 종전 한 타 1');
if (ON) ok(ON.sword.refused, '도구 문 켬 — 검으로 바위는 거절(닳기 0)', JSON.stringify(ON.sword));
if (NOGATE) ok(NOGATE.sword && near(NOGATE.sword.d0 - NOGATE.sword.d1, 1), '도구 문 끔 — 검으로 바위 한 타 = 종전 1(검은 kg 수명 출처가 없다)', JSON.stringify(NOGATE && NOGATE.sword));

sec('⑧ 끔 — 종전 바이트');
if (!OFF) ok(false, '끔 판이 안 돌았다');
else {
  ok(JSON.stringify(OFF.payload) === JSON.stringify({ stone: 2, wood: 3 }) && JSON.stringify(ON.payload) === JSON.stringify({ stone: 2.644, wood: 3 }), '짐 전문 — 끔 = 종전 정수(돌 2 · 통나무 3 · 자갈 0.5 는 안 간다) · 켬 = 돌만 덩이 몫(2.644)', JSON.stringify([OFF.payload, ON && ON.payload]));
  ok(OFF.on === false && JSON.stringify(OFF.rc.pickaxe.cost) === JSON.stringify({ wood: 3, stone: 5 }) && JSON.stringify(OFF.rc.axe.cost) === JSON.stringify({ wood: 5, stone: 2 }) && OFF.rc.pickaxe.bladeKg === undefined,
    '레시피 — 곡괭이 나무 3 · 돌 5 · 도끼 나무 5 · 돌 2(종전)');
  ok(OFF.craftPick.inv.stone === 1 && /^곡괭이을\(를\) 만들려면 나무 3, 돌 5이\(가\) 있어야 합니다\.$/.test(OFF.craftPick.say[OFF.craftPick.say.length - 1] || '') && /^검을\(를\) 만들어 가방에 넣었습니다\.$/.test(OFF.craftSword.say[OFF.craftSword.say.length - 1] || ''),
    '제작 — 돌 한 덩이로는 곡괭이 못 만든다(돌 5) · 알림 꼬리 0(종전 글자)', OFF.craftPick.say[OFF.craftPick.say.length - 1]);
  ok(OFF.pick.hs.every((h) => h.gone || near(h.d0 - h.d1, 1)) && near(OFF.axe.d0 - OFF.axe.d1, 1) && OFF.ground && near(OFF.ground.d0 - OFF.ground.d1, OFF.ground.sw * OFF.ground.wear0),
    '한 타 1(바위 · 나무) · 땅 = 한 타 솜씨 몫(종전)', JSON.stringify([OFF.pick.hs[0], OFF.axe.d0 - OFF.axe.d1, OFF.ground && OFF.ground.sw]));
}

sec('⑨ 짐 무게 — 덩이 몫도 손에 든 돌이다(`carry.js totalKg`)');
{
  const Carry = require(path.join(ROOT, 'server', 'carry.js'));
  const mk = (inv) => ({ inventory: inv, toolItems: [], equipment: [], dishes: [] });
  const a = Carry.totalKg(mk({ stone: 0.644 })), b = Carry.totalKg(mk({ stone: 1.644 })), c = Carry.totalKg(mk({ stone: 2, wood: 1 }));
  ok(near(a, 2.576) && near(b, 6.576) && near(c, 11), `★돌 0.644 덩이 = ${a} kg · 1.644 덩이 = ${b} kg(정수 밑 몫도 센다) · 정수(돌 2 · 통나무 1 = ${c} kg)는 종전 그대로`);
}

console.log(`\n=== T1186: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
