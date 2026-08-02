#!/usr/bin/env node
// === scripts/pace-metallurgy.js — 야금 사슬 **실시간 페이싱** 계측 =============
//
// ★왜 이 하네스인가 [2026-08-02f ② · 미해결 ⑯]
//   `test-furnace.js` 85/0 은 장입→시간→출탕 **계약**이 지켜지는지를 본다. 통과한다.
//   그런데 "그 시간이 플레이로서 옳은가"는 아무도 안 쟀다. 상수(180초·240초)는 배치 6 에서
//   처음 정한 값이고 근거는 노 온도뿐이다 — **체감은 미측정**이었다.
//
// ★무엇을 어떻게 재는가
//   · 노·숯가마 대기는 **벽시계 그대로** 기다린다(`job.until` 을 당기지 않는다). 느린 게 계측값이다.
//   · 채광은 `MINE_SWING_MS`(1초/타) **순수 대기**라, 60타를 실제로 기다려 그 등가를 실증한 뒤
//     나머지 타수는 쿨다운을 우회해 세고 `타수 × 1초`로 환산한다. 10분을 통째로 자도 같은 값을
//     더 느리게 얻을 뿐이다 — 대신 **등가 자체를 assert 로 건다**(우회가 거짓말이 되지 않게).
//   · 사슬은 **둘**이다. 청동은 선광에서 금속이 바로 나오고(간이 제련 추상), 철만 노를 탄다.
//     한 줄로 뭉치면 "노가 사슬의 몇 %"라는 숫자가 거짓말이 된다.
//
// ★판정 기준(배치 지시 그대로)
//   · 대기는 "자리를 지키는 벌"이 아니라 "다녀올 일을 만드는 리듬" — 대기 중 채광 한 덩이가 들어가는가?
//   · 전 사슬 1회 15분 초과 → 상수 축소. 3분 미만 → 즉시성과 다를 게 없으니 검토.
//
// 실행: node scripts/pace-metallurgy.js      (임시 DB·임시 포트 — 라이브 무접촉. ~8분)
//       PACE_FAST=1 → 대기 건너뜀(배선 점검용. 계측값 무효)
'use strict';
const path = require('path');
const fs = require('fs');

const TMP = `/tmp/pace-metallurgy-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = process.env.PORT || String(38000 + (process.pid % 900));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '0';
process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0';
process.env.ENABLE_ROADS = '0';

const _log = console.log;
let quiet = true;
console.log = (...a) => { if (!quiet) _log(...a); };
console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(__dirname, '..', 'server', 'zone.js'));
const Era = require(path.join(__dirname, '..', 'server', 'era.js'));
const Specialty = require(path.join(__dirname, '..', 'server', 'specialty.js'));
const T = require(path.join(__dirname, '..', 'server', 'terrain.js'));
quiet = false; console.log = _log;

const H = Zone.__testBind();
const SZ = H.BUILDING_SIZE;
const FAST = process.env.PACE_FAST === '1';
const say = (...a) => _log(...a);
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; say((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SWING = Specialty.MINE_SWING_MS;

let _pid = 0;
function mkPlayer(name, opts = {}) {
  const notices = [];
  const ws = { readyState: 1, send: (str) => { try { const o = JSON.parse(str); if (o.type === 'notice') notices.push(o.text); } catch (e) {} } };
  return {
    playerId: `anon_pace${++_pid}`, name, ws, x: 0, y: 0, floor: 0,
    inventory: Object.assign({}, opts.inv || {}),
    toolItems: (opts.tools || []).map((t, i) => ({ id: `t${_pid}_${i}`, type: t, d: 1e9, max: 1e9 })),
    equipped: null, hotkey1: null, tribeId: null, tribeName: null,
    craftSkill: {}, hunger: 100, thirst: 100, oreCarry: {}, oreLedger: {}, notices,
  };
}
const lastNotice = (p) => p.notices[p.notices.length - 1] || '';
const findBuilding = (t) => [...H.buildings.values()].filter((b) => b.type === t);
const at = (p, cx, cy) => { p.x = (cx + 1) * SZ; p.y = (cy + 1) * SZ; };

function findClearSpot(fromCy) {
  for (let cy = fromCy || 200; cy < 900; cy += 3) for (let cx = 200; cx < 900; cx += 3) {
    let clear = true;
    for (let x = cx - 1; x <= cx + 2 && clear; x++) for (let y = cy - 1; y <= cy + 2 && clear; y++)
      if (H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) clear = false;
    if (clear) return { cx, cy };
  }
  return null;
}
function layClaims(cx, cy, p) {
  for (let x = cx; x <= cx + 1; x++) for (let y = cy; y <= cy + 1; y++) {
    const id = H.newClaimId();
    H.claims.set(id, { id, ownerPid: p.playerId, ownerName: p.name, x: x * SZ, y: y * SZ, w: SZ, h: SZ, kind: 'personal', guildTribeId: null, createdAt: 0 });
  }
}
const raw = require(path.join(__dirname, '..', 'server', 'hanbando-terrain.json')).hanbando;
function pickVein(want) {
  for (const o of (raw.ores || []).filter((o) => o.minerals && (o.minerals[want] || 0) >= 0.5).sort((a, b) => (b.pk || 0) - (a.pk || 0))) {
    const R = Math.max(4, Math.ceil(o.radius / 32));
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(o.center[0] / 32) + dx, y = Math.floor(o.center[1] / 32) + dy;
      const px = x * 32 + 16, py = y * 32 + 16;
      if (T.isWaterCellLocal('hanbando', px, py)) continue;
      if (T.isRockCellLocal && T.isRockCellLocal('hanbando', px, py)) continue;
      if (T.oreCandidatesAt('hanbando', px, py).length !== 1) continue;
      if (!(T.oreProbAt('hanbando', px, py) > 0.5)) continue;
      return { o, cx: x, cy: y };
    }
  }
  return null;
}

const ROWS = [];
const row = (chain, step, sec, note) => { ROWS.push({ chain, step, sec, note }); say(`    ⏱ ${step}: ${sec.toFixed(1)}초  ${note || ''}`); };

(async () => {
  say('=== 야금 사슬 실시간 페이싱 계측 ===');
  say(`  zone=${process.env.ZONE_ID} port=${process.env.PORT} 시대=${Era.currentEra()}${FAST ? '  ⚠PACE_FAST — 계측값 무효' : ''}`);
  say(`  상수: 노 기준 ${H.SMELT_BASE_MS / 1000}초(하한 ${H.SMELT_MIN_MS / 1000}초) · 숯가마 ${H.KILN_BURN_MS / 1000}초(+배치당 ${H.KILN_BATCH_MS_PER / 1000}초) · 채광 ${SWING / 1000}초/타`);

  // ══ ⓪ 지도 전수 — 노에 넣을 것이 이 세계에 있는가 ═════════════════════════
  say('\n[⓪ 지도 전수 — 노의 입력이 실제로 존재하는가]');
  const ores = raw.ores || [];
  const kinds = new Set(); for (const o of ores) for (const k in (o.minerals || {})) kinds.add(k);
  say(`    광맥 ${ores.length}개(주요 ${ores.filter(o => !o.minor).length} · 자잘 ${ores.filter(o => o.minor).length}) · 광종 {${[...kinds].join(', ')}}`);
  const ironVeins = ores.filter(o => (o.minerals || {}).iron > 0).length;
  const IRON_REACHABLE = ironVeins > 0;
  if (!IRON_REACHABLE) say(`    ⚠ 철이 든 광맥 = **0개**. 노의 유일한 입력(철 정광)을 채광으로 얻을 수 없다 — 아래 철 사슬은 정광을 주입해 **계약 시간만** 잰다`);

  // ══ 준비 ═══════════════════════════════════════════════════════════════════
  const spot = findClearSpot();
  const P = mkPlayer('계측공', { inv: { stone: 60, wood: 40, hide: 20 }, tools: ['pickaxe'] });
  P.equipped = P.toolItems[0].id; P.hotkey1 = P.toolItems[0].id;
  at(P, spot.cx, spot.cy); layClaims(spot.cx, spot.cy, P);
  H.tryFurnaceStart(P, spot.cx * SZ + 1, spot.cy * SZ + 1, 'crucible');
  for (let i = 0; i < 3; i++) { const s = findBuilding('furnace_site'); if (s.length) H.tryFurnaceAdvance(P, s[0].id); }
  const furn = findBuilding('furnace')[0];
  const spot2 = findClearSpot(spot.cy + 6);
  at(P, spot2.cx, spot2.cy); layClaims(spot2.cx, spot2.cy, P);
  H.tryKilnStart(P, spot2.cx * SZ + 1, spot2.cy * SZ + 1);
  for (let i = 0; i < 3; i++) { const s = findBuilding('kiln_site'); if (s.length) H.tryKilnAdvance(P, s[0].id); }
  const kiln = findBuilding('charcoal_kiln')[0];
  ok(!!furn && !!kiln, '노·숯가마 완공(건설은 계측 대상 아님 — 사슬은 조업이다)');
  if (!furn || !kiln) process.exit(1);

  // ══ A. 청동 사슬 — 채광 → 선광 → 단조 (노를 타지 않는다) ══════════════════
  say('\n[A. 청동 사슬 — 채광 → 선광 → 단조]');
  const cu = pickVein('copper');
  ok(!!cu, `구리 광맥 확보${cu ? ` — "${cu.o.name}" p=${T.oreProbAt('hanbando', cu.cx * 32 + 16, cu.cy * 32 + 16).toFixed(2)}` : ''}`);
  if (!cu) process.exit(1);
  P.x = cu.cx * 32 + 16; P.y = cu.cy * 32 + 16;
  P.inventory = {}; P.oreLedger = {}; P.oreCarry = {};

  const wallStart = Date.now();
  const WALL_N = FAST ? 3 : 60;
  let swings = 0;
  while (swings < WALL_N) { H.mineOreCell(P); swings++; if (swings < WALL_N) await sleep(SWING); }
  const wallMs = Date.now() - wallStart;
  ok(FAST || wallMs >= (WALL_N - 1) * SWING * 0.95, `★1타 = ${SWING / 1000}초를 벽시계로 실증 — ${WALL_N}타에 ${(wallMs / 1000).toFixed(1)}초 (이 등가가 아래 환산의 근거다)`);

  const need = H.EQUIPMENT_RECIPES.weapon.qty;
  let chunks = 0, guard = 0;
  while ((P.inventory.copper || 0) < need && guard++ < 8000) {
    P._mineT = 0;
    const before = P.inventory.ore_chunk || 0;
    if (!H.mineOreCell(P)) break;
    swings++;
    if ((P.inventory.ore_chunk || 0) > before) chunks++;
    if (Specialty.inventoryWeight(P.inventory || {}) > 20) H.trySortOre(P);
  }
  H.trySortOre(P);
  const mineSec = swings * SWING / 1000;
  row('청동', `채광(구리 ${need}개분)`, mineSec, `${swings}타 · 덩이 ${chunks} · 산출 ${JSON.stringify(Object.fromEntries(Object.entries(P.inventory).filter(([k, v]) => v > 0 && k !== 'ore_chunk')))}`);
  const t0 = Date.now(); H.trySortOre(P); row('청동', '선광', (Date.now() - t0) / 1000, '강제 대기 없음 — 채광이 이미 시간을 냈다');
  const t1 = Date.now();
  if ((P.inventory.copper || 0) < need) P.inventory.copper = need;
  H.doCraftEquipment(P, 'weapon', 'copper', null);
  row('청동', '단조', (Date.now() - t1) / 1000, `"${lastNotice(P)}"`);

  // ══ B. 철 사슬 — 숯가마 → 노 (벽시계 실측) ════════════════════════════════
  say('\n[B. 철 사슬 — 숯가마·노 대기를 벽시계로 실측]');
  P.inventory.wood = 3;   // ★1회 조업분만. '가득 채우기'는 아래에서 따로 잰다
  at(P, spot2.cx, spot2.cy);
  const kStart = Date.now();
  H.tryKilnBurn(P, kiln.id);
  ok(!!(kiln.data && kiln.data.job), `숯가마 장입 — "${lastNotice(P)}"`);
  let kSpan = 0;
  if (kiln.data && kiln.data.job) {
    kSpan = kiln.data.job.until - kiln.data.job.startedAt;
    if (FAST) kiln.data.job.until = Date.now() - 1;
    while (Date.now() < (kiln.data.job.until || 0)) await sleep(2000);
  }
  H.tryKilnBurn(P, kiln.id);
  const kSec = (Date.now() - kStart) / 1000;
  row('철', '숯가마(1회분 장입→수거)', kSec, `계약 ${(kSpan / 1000).toFixed(0)}초 · 숯 ${P.inventory.charcoal || 0}개 · "${lastNotice(P)}"`);
  ok((P.inventory.charcoal || 0) > 0, '★대기 후 클릭 한 번으로 숯을 거뒀다');

  at(P, spot.cx, spot.cy);
  P.inventory.iron_ore = 1;   // ⓪대로 채광으론 못 얻는다 — 계약 시간을 재기 위한 주입
  const fStart = Date.now();
  H.tryFurnaceSmelt(P, furn.id);
  ok(!!(furn.data && furn.data.job), `노 장입 — "${lastNotice(P)}"`);
  let fSpan = 0, fYield = 0;
  if (furn.data && furn.data.job) {
    fSpan = furn.data.job.until - furn.data.job.startedAt; fYield = furn.data.job.yield;
    if (FAST) furn.data.job.until = Date.now() - 1;
    while (Date.now() < (furn.data.job.until || 0)) await sleep(2000);
  }
  H.tryFurnaceSmelt(P, furn.id);
  const fSec = (Date.now() - fStart) / 1000;
  row('철', '노(1장입→출탕)', fSec, `계약 ${(fSpan / 1000).toFixed(0)}초 · 수율 ${(fYield * 100).toFixed(1)}% · "${lastNotice(P)}"`);

  // 철 1덩이까지 몇 장입인가 — 시대·노 종류별
  const chOf = (y) => (y > 0 ? Math.ceil(1 / y) : Infinity);
  const yIron = Era.smeltYield('iron', { furnace: 'crucible', fuel: 'charcoal', bellows: true }, 'early_iron');
  const yBloom = Era.smeltYield('iron', { furnace: 'bloomery', fuel: 'charcoal', bellows: true }, 'early_iron');
  const cb = chOf(fYield), ci = chOf(yIron), cbl = chOf(yBloom);
  say(`\n    ★철 1덩이(${Specialty.CHUNK_KG}kg)까지 필요한 장입 수 — 같은 노, 시대만 다르다`);
  say(`      청동기 도가니로  수율 ${(fYield * 100).toFixed(1)}%  →  ${cb}장입 = ${(cb * fSpan / 60000).toFixed(0)}분`);
  say(`      철기   도가니로  수율 ${(yIron * 100).toFixed(1)}%  →  ${ci}장입 = ${(ci * fSpan / 60000).toFixed(1)}분`);
  say(`      철기   괴련로    수율 ${(yBloom * 100).toFixed(1)}%  →  ${cbl}장입 (노가 더 뜨거워 1장입 시간도 짧다)`);

  P.inventory.wood = 40;
  at(P, spot2.cx, spot2.cy);   // ★가마 앞으로 돌아간다(노 앞에서 클릭하면 거리 게이트에 막힌다)
  H.tryKilnBurn(P, kiln.id);
  const bigSpan = kiln.data && kiln.data.job ? (kiln.data.job.until - kiln.data.job.startedAt) : 0;
  const bigN = kiln.data && kiln.data.job ? Math.round((bigSpan - H.KILN_BURN_MS) / H.KILN_BATCH_MS_PER) + 1 : 0;
  say(`    '가득 채우기' — 통나무 40 → ${bigN}회분을 한 번에 ${(bigSpan / 1000).toFixed(0)}초 (회분당 ${(bigSpan / 1000 / Math.max(1, bigN)).toFixed(0)}초 — 1회분 ${H.KILN_BURN_MS / 1000}초보다 싸다)`);
  if (kiln.data) delete kiln.data.job;

  // ══ 표 + 판정 ══════════════════════════════════════════════════════════════
  say('\n=== 사슬별 실시간 ===');
  const pad = (s, w) => String(s).padEnd(w);
  const bTot = ROWS.filter(r => r.chain === '청동').reduce((a, r) => a + r.sec, 0);
  say(`${pad('사슬', 7)}${pad('단계', 26)}${pad('실시간', 12)}비고`);
  for (const r of ROWS) say(`${pad(r.chain, 7)}${pad(r.step, 26)}${pad(r.sec.toFixed(1) + '초', 12)}${r.note || ''}`);
  say(`\n  청동 사슬 1자루: **${(bTot / 60).toFixed(1)}분** — ${(100 * mineSec / bTot).toFixed(0)}% 가 채광. 노·숯가마를 안 탄다.`);
  say(`  철 사슬 1장입 왕복: **${((kSec + fSec) / 60).toFixed(1)}분** (숯가마 ${(kSec / 60).toFixed(1)}분 + 노 ${(fSec / 60).toFixed(1)}분)`);

  say('\n=== 판정 ===');
  const oneChunkSec = 60 * SWING / 1000;   // 표층 한 덩이 = 60타
  ok(bTot / 60 <= 15, `청동 사슬 ${(bTot / 60).toFixed(1)}분 ≤ 15분 (넘으면 상수 축소)`);
  ok(bTot / 60 >= 3, `청동 사슬 ${(bTot / 60).toFixed(1)}분 ≥ 3분 (미만이면 즉시성과 다를 게 없다)`);
  if (!FAST) {
    ok(kSec >= oneChunkSec, `숯가마 대기 ${kSec.toFixed(0)}초 ≥ 채광 한 덩이 ${oneChunkSec}초 — **다녀올 일**이 된다`);
    ok(fSec >= oneChunkSec, `노 대기 ${fSec.toFixed(0)}초 ≥ 채광 한 덩이 ${oneChunkSec}초 — **다녀올 일**이 된다`);
    ok((kSec + fSec) / 60 <= 15, `숯가마+노 대기 합 ${((kSec + fSec) / 60).toFixed(1)}분 ≤ 15분`);
  }
  ok(IRON_REACHABLE, `★노의 입력(철 정광)을 채광으로 얻을 수 있는가 — 철이 든 광맥 ${ironVeins}개`);
  ok(ci <= 3, `★철기 시대엔 ${ci}장입이면 철 1덩이 — 사슬이 성립한다(청동기 ${cb}장입은 고증대로 사실상 불가)`);

  say(`\n=== 페이싱 계측: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.exit(0);   // ★이 하네스는 **계측기**다 — 판정 결과는 위 줄이 말하고, 종료코드로 게이트하지 않는다
})();
