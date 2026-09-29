#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-well.js — 우물 (T509) · 실서버 함수 왕복 =======================================
//
// ★이 하네스가 지키는 계약:
//   ① 표 하나 — `server/well-stages.js` · 재료 수는 출토 보고의 수(동천동 1호)에서 **유도**(자갈 40 = ⌈π·94.5 ÷ 15⌉ × 2단)
//   ② 끔(기본) = 착공도 우물가도 안 열린다(자식 프로세스로 잰다 — 손잡이는 모듈 적재 때 읽힌다)
//   ③ 켬 = 노·숯가마와 같은 2×2 사유지 계약 — 사유지 없으면 거부 · 곡괭이 · 자갈 모자라면 거부 · 완공 = `well`
//   ④ 우물가 E — 목마르면 +30(물가 E 와 같은 수 · 같은 갈래) · 목이 차고 병이 있으면 민물 한 되(`fresh_water`)
//   ⑤ 미끼 — 우물에서 먼 자리는 물가가 아니다 · 우물 칸은 바다가 아니다(짠물 갈래로 안 샌다)
// 실행: node scripts/test-well.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OFF = process.argv[2] === '--off';
if (!OFF) process.env.T509_WELL = '1'; else delete process.env.T509_WELL;
const TMP = `/tmp/test-well-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = 'hanbando';
process.env.PORT = String(38400 + (process.pid % 300));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const SZ = H.BUILDING_SIZE;
const WS = require(path.join(ROOT, 'server', 'well-stages.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
let _pid = 0;
function mkPlayer(name, opts = {}) {
  const notices = [];
  const ws = { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notices.push(o.text); } catch (e) {} } };
  return { playerId: `tw_${++_pid}`, pid: `pw_${_pid}`, name, ws, x: 0, y: 0, floor: 0, inventory: Object.assign({}, opts.inv || {}),
    toolItems: (opts.tools || []).map((t, i) => ({ id: `tw${_pid}_${i}`, type: t, d: 100, max: 100 })), equipped: null, tribeId: null,
    hunger: 100, thirst: opts.thirst == null ? 100 : opts.thirst, oreCarry: {}, lots: {}, notices, persistent: false };
}
// 물·바위 없는 6×6(발자국 2×2 + 둘레) — 게다가 둘레 3칸 안에 물이 없어야 미끼가 선다
function findSpot() {
  for (let cy = 300; cy < 1500; cy += 3) for (let cx = 300; cx < 1500; cx += 3) {
    let clear = true;
    for (let x = cx - 4; x <= cx + 5 && clear; x++) for (let y = cy - 4; y <= cy + 5 && clear; y++) {
      if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) || H.isWaterTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear = false;
    }
    if (clear) return { cx, cy };
  }
  return null;
}
function layClaims(cx, cy, p) {
  for (let x = cx; x <= cx + 1; x++) for (let y = cy; y <= cy + 1; y++) {
    const c = { id: H.newClaimId(), ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', guildTribeId: null, createdAt: 0 };
    H.claims.set(c.id, c);
  }
}
const wells = (t) => [...H.buildings.values()].filter((b) => b.type === t);
const spot = findSpot();

if (OFF) {
  const p = mkPlayer('끔', { inv: { pebble: 99 }, tools: ['pickaxe'] });
  layClaims(spot.cx, spot.cy, p); p.x = (spot.cx + 1) * SZ; p.y = (spot.cy + 1) * SZ;
  const r = H.tryWellStart(p, spot.cx * SZ + 1, spot.cy * SZ + 1);
  process.stdout.write(JSON.stringify({ knob: H.T509_WELL, r: r || null, sites: wells('well_site').length, cell: H._wellCellAt(spot.cx * SZ + 5, spot.cy * SZ + 5), tool: p.toolItems[0].d, peb: p.inventory.pebble }) + '\n');
  process.exit(0);
}

console.log('\n=== 우물 (T509) ===');
console.log('\n① 표 하나 — `server/well-stages.js`');
ok(WS.WELL_SRC.mouthCm.join(',') === '110,79' && WS.WELL_SRC.depthCm === 61 && WS.WELL_SRC.tiers === 2 && WS.WELL_SRC.stoneCm.join(',') === '10,20', '① 출토 보고의 수 — 동천동 1호 110×79㎝ · 깊이 61㎝ · 2단 · 자갈돌 10·20㎝');
ok(WS.WELL_PEBBLES === Math.ceil(Math.PI * 94.5 / 15) * 2 && WS.WELL_PEBBLES === 40, '① 자갈 수는 **유도** — ⌈π × 평균지름 94.5 ÷ 돌 15⌉ × 2단 = 40', String(WS.WELL_PEBBLES));
ok(WS.WELL_STAGES.length === 2 && WS.WELL_STAGES[0].tool === 'pickaxe' && JSON.stringify(WS.WELL_COST) === '{"pebble":40}', '① 공정 둘(파기 · 벽) · 재료 = 자갈 40');
const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
ok((zsrc.match(/process\.env\.T509_WELL/g) || []).length === 1 && /stages: WellStages\.WELL_STAGES/.test(zsrc), '① 손잡이 한 자리 · zone 은 표를 읽는다(사본 0)');
const esrc = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
ok(!/T509|well-stages/.test(esrc), '① econ 무접촉');

console.log('\n② 끔(기본) — 착공도 우물가도 안 열린다(자식 프로세스)');
{
  const out = execFileSync(process.execPath, [__filename, '--off'], { env: Object.assign({}, process.env, { T509_WELL: '' }), stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim().split('\n').pop();
  const o = JSON.parse(out);
  ok(o.knob === false && o.sites === 0 && o.cell === false, '② ★끔 — 사유지·곡괭이·자갈이 다 있어도 터가 안 선다 · 우물 칸 술어 거짓', out);
  ok(o.tool === 100 && o.peb === 99, '② 끔 — 도구 내구·재료 무변');
}

console.log('\n③ 켬 — 2×2 사유지 계약 · 곡괭이 · 자갈');
ok(!!spot, '③ [상황] 물·바위 없는 빈 땅', spot ? `${spot.cx},${spot.cy}` : 'null');
const P = mkPlayer('우물꾼', { inv: { pebble: 39 }, tools: ['pickaxe'] });
P.x = (spot.cx + 1) * SZ; P.y = (spot.cy + 1) * SZ;
H.tryWellStart(P, spot.cx * SZ + 1, spot.cy * SZ + 1);
ok(wells('well_site').length === 0 && P.notices.some((t) => /사유지/.test(t)), '③ 사유지 없으면 거부', P.notices[P.notices.length - 1]);
layClaims(spot.cx, spot.cy, P);
const site = H.tryWellStart(P, spot.cx * SZ + 1, spot.cy * SZ + 1);
ok(site && site.type === 'well_site' && P.toolItems[0].d === 97, '③ 착공 — 곡괭이 내구 3 · 터가 선다', P.notices[P.notices.length - 1]);
H.tryWellAdvance(P, site.id);
ok(wells('well').length === 0 && P.notices.some((t) => /재료 부족/.test(t)), '③ 자갈 39 — 모자라면 안 선다');
P.inventory.pebble = 40;
const done = H.tryWellAdvance(P, site.id);
ok(done && done.type === 'well' && (P.inventory.pebble || 0) === 0 && wells('well_site').length === 0, '③ 자갈 40 — 우물 완공(터는 걷힌다)', P.notices[P.notices.length - 1]);

console.log('\n④ 우물가 E — 마시기 · 담기');
const D = mkPlayer('목마른이', { thirst: 50 });
D.x = (spot.cx - 1) * SZ + SZ / 2; D.y = spot.cy * SZ + SZ / 2;   // 발자국 서쪽 한 칸
ok(H._wellCellAt(D.x + SZ, D.y) === true && H.isWaterTileLocal(D.x + SZ, D.y) === false, '④ [상황] 동쪽 이웃이 우물 칸 · 물 타일은 아니다');
H.tryGather(D);
ok(D.thirst === 80, '④ 목마르면 +30(물가 E 와 같은 갈래 · 같은 수)', `50 → ${D.thirst}`);
ok(!D.notices.some((t) => /짠물/.test(t)), '⑤ 우물 칸은 바다가 아니다(짠물 갈래로 안 샌다)');
const B = mkPlayer('물긷는이', { thirst: 100, inv: { water_bottle: 2 } });
B.x = D.x; B.y = D.y;
H.tryGather(B);
ok((B.inventory.fresh_water || 0) === 1 && (B.inventory.water_bottle || 0) === 1, '④ 목이 차고 병이 있으면 민물 한 되(병 하나 → 민물 하나)', JSON.stringify(B.inventory));
const F = mkPlayer('먼곳', { thirst: 50 });
F.x = (spot.cx - 3) * SZ + SZ / 2; F.y = spot.cy * SZ + SZ / 2;
H.tryGather(F);
ok(F.thirst === 50, '⑤ 미끼 — 우물에서 두 칸 떨어지면 물가가 아니다', `50 → ${F.thirst}`);

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(fail ? 1 : 0);
