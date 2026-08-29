#!/usr/bin/env node
// === scripts/emptystart-metrics.js — 빈손 시작 대리 지표 =========================
//
// ★[재민 확정 2026-08-28 · 검증 §] 지시가 요구한 셋을 실측한다:
//   ① **마을 중심 반경 300px 내 채집 가능 개체 수** — 반독점 규약의 밀도 대리 지표.
//      ("한 자리를 훑으면 그 자리만 마른다"가 성립하려면 **옆에 다른 자리가 있어야** 한다.
//       마을 앞 광장이 채집 사막이면 개체별 고갈은 반독점 장치가 아니라 그냥 벽이다.)
//   ② **빈손 → 첫 도끼 소요 실측** — 자리까지 걷는 거리 + 훑는 횟수 × 쿨다운.
//   ③ **자작 vs 구매 비교 표** — 조잡/정품의 순간 산출·평생 산출.
//
// ⚠계측기지 하네스가 아니다 — PASS/FAIL 을 세지 않는다. 러너 목록에 넣지 마라.
// ⚠수를 여기서 다시 정하지 않는다. 지형·채집·도구 계수 전부 **정본이 낸 수**다.
//   (서버를 안 띄운다 — terrain/forage 는 순수 모듈이고, 도구 계수는 `zone.__testBind` 에서 읽는다.)
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
T.setZonesMeta(ZC.ZONES);
const F = require(path.join(ROOT, 'server', 'forage.js'));
const Z = 'hanbando';
const CELL = F.CFG.CELL_PX;
const MOVE_SPEED = 64;   // px/s — zone.js 정본과 같은 수(맨몸 · 짐 0kg 이면 배수 1.0)

const ctx = {
  forestMult: (x, y) => T.getForestMultiplier(Z, x, y),
  isRock: (x, y) => T.isRockCellLocal(Z, x, y),
  isWater: (x, y) => T.isWaterCellLocal(Z, x, y),
};
const pad = (s, n) => String(s).padStart(n);
const padr = (s, n) => String(s).padEnd(n);

console.log('\n=== 빈손 시작 대리 지표 (정본 모듈만 사용) ===');
console.log(`  개체 용량 FORAGE_CAP=${F.CFG.CAP} · 만땅까지 ${F.CFG.REFILL_MIN}분 · 쿨다운 ${F.CFG.COOLDOWN_MS}ms`);

// ── ⓪ **스폰 광장** — 빈손이 실제로 서는 자리 ────────────────────────────────
//   ★지시가 물은 건 "마을 반경 300px"지만, **빈손 시작**의 진짜 표본은 마을 51곳의 평균이 아니라
//     새 사람이 눈 뜨는 **한 자리**다(`ZONE.mainSquare` — 온보딩 캐논의 나루터 광장).
//     여기서 못 주우면 "맨손 동사 보장"은 지도 어딘가에서만 참인 명제가 된다.
//   ★덤불도 센다 — 덤불은 지형이 아니라 **개체**라 `sourceAt` 이 모른다.
//     개체 배치는 정본(`chunk.generateChunkResources`)에게 물어본다(하네스가 시드를 다시 풀지 않는다).
const CH = require(path.join(ROOT, 'server', 'chunk.js'));
const MS = ZC.ZONES[Z].mainSquare || { x: ZC.ZONES[Z].zoneWidth / 2, y: ZC.ZONES[Z].zoneHeight / 2, name: '존 중앙' };
function entsNear(x0, y0, R2) {
  const CS = CH.CHUNK_SIZE;
  const t = {};
  const c0x = Math.floor((x0 - R2) / CS), c1x = Math.floor((x0 + R2) / CS);
  const c0y = Math.floor((y0 - R2) / CS), c1y = Math.floor((y0 + R2) / CS);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    let list = [];
    try { list = CH.generateChunkResources(Z, ZC.ZONES[Z].biome, cx, cy, CS, null) || []; } catch (e) { }
    for (const r of list) if (Math.hypot(r.x - x0, r.y - y0) <= R2) t[r.type] = (t[r.type] || 0) + 1;
  }
  return t;
}
function terrainNear(x0, y0, R2) {
  const cnt = { twig: 0, pebble: 0, fiber: 0 };
  for (let dy = -R2; dy <= R2; dy += CELL) for (let dx = -R2; dx <= R2; dx += CELL) {
    if (Math.hypot(dx, dy) > R2) continue;
    const x = x0 + dx, y = y0 + dy;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
    const s = F.sourceAt(x, y, ctx);
    if (s) cnt[s.kind]++;
  }
  return cnt;
}
console.log(`\n⓪ 스폰 광장 "${MS.name}"(${MS.x},${MS.y}) — 빈손이 눈 뜨는 자리`);
console.log(`  ${padr('반경', 8)} │ ${pad('잔가지', 6)} ${pad('자갈', 5)} ${pad('풀', 5)} (지형 칸) │ ${pad('덤불', 5)} ${pad('나무', 5)} ${pad('바위', 5)} (개체)`);
for (const R2 of [300, 600, 1200, 2400]) {
  const c = terrainNear(MS.x, MS.y, R2);
  const e = entsNear(MS.x, MS.y, R2);
  console.log(`  ${padr(`${R2}px`, 8)} │ ${pad(c.twig, 6)} ${pad(c.pebble, 5)} ${pad(c.fiber, 5)}           │ ${pad(e.berry_bush || 0, 5)} ${pad(e.tree || 0, 5)} ${pad(e.rock || 0, 5)}`);
}
console.log(`  ★덤불 = 잔가지·풀·열매(파괴형) · 나무 = 나무(맨손도 벤다) · 지형 칸 = 비파괴 채집 자리`);

// ── ① 마을 반경 300px 채집 밀도 ─────────────────────────────────────────────
const R = 300;
const villages = T.getZoneVillages(Z) || [];
console.log(`\n① 마을 중심 반경 ${R}px 안의 채집 가능 자리 (마을 ${villages.length}곳)`);
const rows = [];
for (const v of villages) {
  const cnt = { twig: 0, pebble: 0, fiber: 0 };
  let cells = 0;
  for (let dy = -R; dy <= R; dy += CELL) for (let dx = -R; dx <= R; dx += CELL) {
    if (Math.hypot(dx, dy) > R) continue;
    const x = v.x + dx, y = v.y + dy;
    cells++;
    if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;   // 서 있을 수 없는 칸
    const s = F.sourceAt(x, y, ctx);
    if (s) cnt[s.kind]++;
  }
  rows.push({ name: v.name, type: v.type, cells, ...cnt, tot: cnt.twig + cnt.pebble + cnt.fiber });
}
rows.sort((a, b) => a.tot - b.tot);
const show = [...rows.slice(0, 5), null, ...rows.slice(-3)];
console.log(`  ${padr('마을', 10)} ${pad('잔가지', 7)} ${pad('자갈', 6)} ${pad('풀', 5)} ${pad('합', 6)} ${pad('/칸', 6)}`);
for (const r of show) {
  if (!r) { console.log('  …'); continue; }
  console.log(`  ${padr(r.name, 10)} ${pad(r.twig, 7)} ${pad(r.pebble, 6)} ${pad(r.fiber, 5)} ${pad(r.tot, 6)} ${pad(`${r.cells}칸`, 6)}`);
}
const zero = rows.filter((r) => r.tot === 0);
const kindsAt = (r) => ['twig', 'pebble', 'fiber'].filter((k) => r[k] > 0).length;
const oneKind = rows.filter((r) => kindsAt(r) <= 1);
const med = rows[Math.floor(rows.length / 2)];
console.log(`  ── 최소 ${rows[0].tot}(${rows[0].name}) · 중앙 ${med.tot} · 최대 ${rows[rows.length - 1].tot}(${rows[rows.length - 1].name})`);
console.log(`  ── 채집 사막(0자리) 마을: ${zero.length}곳${zero.length ? ' — ' + zero.map((r) => r.name).join(' ') : ''}`);
console.log(`  ── 한 종류 이하만 나는 마을: ${oneKind.length}곳${oneKind.length ? ' — ' + oneKind.map((r) => `${r.name}(${kindsAt(r)}종)`).join(' ') : ''}`);
console.log(`  ★반독점 판정: 개체별 고갈이 통하려면 **옆 자리**가 있어야 한다. 중앙값 ${med.tot}자리면`);
console.log(`     한 사람이 ${F.CFG.CAP}줌씩 훑어도 ${med.tot}자리가 남고, ${F.CFG.REFILL_MIN}분이면 처음 자리가 다시 찬다.`);

// ── ② 빈손 → 첫 도끼 ────────────────────────────────────────────────────────
//   조잡한 돌도끼 = pebble 2 · twig 1 · fiber 2 (정본 RECIPES 에서 읽는다)
//   ⚠`zone.js` 는 require 만으로 마을·교역로·도적을 깨운다(도적 배치 하나가 48초다).
//     `test-emptystart` 가 쓰는 **조용한 적재 규약**을 그대로 따른다 — 하위계를 끄고 로그를 막는다.
process.env.PORT = String(36400 + (process.pid % 150));
process.env.DB_PATH = `/tmp/es-metrics-${process.pid}.db`;
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const B = zone.__testBind ? zone.__testBind() : null;
const COST = (B && B.RECIPES && B.RECIPES.crude_axe && B.RECIPES.crude_axe.cost) || { pebble: 2, twig: 1, fiber: 2 };
console.log(`\n② 빈손 → 첫 조잡한 돌도끼 (필요: ${Object.entries(COST).map(([k, n]) => `${k} ${n}`).join(' · ')})`);
// 마을 중심에서 각 재료의 **가장 가까운 자리**까지 거리 — 밀도 표와 같은 격자에서 잰다.
function nearest(v, kind, maxR = 1600) {
  let best = Infinity;
  for (let r = CELL; r <= maxR; r += CELL) {
    for (let a = 0; a < 24; a++) {
      const th = a * Math.PI / 12;
      const x = v.x + Math.cos(th) * r, y = v.y + Math.sin(th) * r;
      if (ctx.isWater(x, y) || ctx.isRock(x, y)) continue;
      const s = F.sourceAt(x, y, ctx);
      if (s && s.kind === kind) { best = Math.min(best, r); }
    }
    if (best < Infinity) break;
  }
  return best;
}
const need = Object.keys(COST);
const trips = [];
for (const v of villages) {
  const d = {};
  let sum = 0, ok = true;
  for (const k of need) { d[k] = nearest(v, k); if (!Number.isFinite(d[k])) { ok = false; break; } sum += d[k]; }
  if (ok) trips.push({ name: v.name, sum, d });
}
trips.sort((a, b) => a.sum - b.sum);
const _uniq = [];
for (const i of [0, Math.floor(trips.length / 2), trips.length - 1]) if (trips[i] && !_uniq.includes(trips[i])) _uniq.push(trips[i]);
const pick = _uniq;
console.log(`  (${trips.length}/${villages.length}곳에서 세 재료가 ${1600}px 안에 다 있다 — 가까운 곳·중앙·먼 곳)`);
const gathers = Object.values(COST).reduce((n, v2) => n + Math.ceil(v2 / 1), 0);   // 한 번에 1줌
console.log(`  ${padr('마을', 10)} ${pad('잔가지', 7)} ${pad('자갈', 6)} ${pad('풀', 6)} ${pad('왕복 합', 8)} ${pad('걷기', 7)} ${pad('훑기', 7)} ${pad('합계', 7)}`);
for (const t of pick) {
  const walk = t.sum * 2 / MOVE_SPEED;                       // 마을→자리→마을 왕복
  const hand = gathers * (F.CFG.COOLDOWN_MS / 1000);
  console.log(`  ${padr(t.name, 10)} ${pad(Math.round(t.d.twig), 7)} ${pad(Math.round(t.d.pebble), 6)} ${pad(Math.round(t.d.fiber), 6)} ${pad(`${Math.round(t.sum * 2)}px`, 8)} ${pad(`${walk.toFixed(0)}초`, 7)} ${pad(`${hand.toFixed(1)}초`, 7)} ${pad(`${(walk + hand).toFixed(0)}초`, 7)}`);
}
console.log(`  ★ ${gathers}줌 × ${F.CFG.COOLDOWN_MS}ms = ${(gathers * F.CFG.COOLDOWN_MS / 1000).toFixed(1)}초의 손동작 + 걷는 시간.`);
console.log(`     이동은 ${MOVE_SPEED}px/s(맨몸·짐 0kg) 기준 — 지게가 없어도 빈손이라 배수 1.0 이다.`);
console.log(`  ⚠이 수는 **자리를 알고 곧장 갔을 때**다. 처음 오는 사람은 찾는 시간이 더 든다(그게 §9 가 원한 마찰이다).`);

// ── ③ 자작 vs 구매 ──────────────────────────────────────────────────────────
if (B) {
  const TE = B.TOOL_EFFECTS, TD = B.TOOL_MAX_DURABILITY;
  const line = (label, mult, dura) => `  ${padr(label, 14)} 배수 ${pad(mult, 4)} · 내구 ${pad(dura, 4)} · 평생 산출 ${pad(Number.isFinite(mult * dura) ? (mult * dura).toFixed(0) : '∞', 6)}`;
  const bare = 1;
  console.log(`\n③ 자작 vs 구매 (나무 채집 기준 · 정본 계수)`);
  console.log(`  ${padr('맨손', 14)} 배수 ${pad(bare, 4)} · 내구  없음 · 평생 산출     ∞  (느리지만 **막히지 않는다** — 도구는 문이 아니라 능률)`);
  console.log(line('조잡한 돌도끼', TE.crude_axe.gatherWoodMult, TD.crude_axe));
  console.log(line('정품 도끼', TE.axe.gatherWoodMult, TD.axe));
  const ratio = (TE.axe.gatherWoodMult * TD.axe) / (TE.crude_axe.gatherWoodMult * TD.crude_axe);
  console.log(`  ★ 한 자루가 평생 하는 일: 정품이 조잡의 **×${ratio.toFixed(1)}** — 자급으로 버티면 손해다(자급자족 병 방지선).`);
  console.log(`  ★ 손잡이: CRUDE_EFF_FRAC=${B.CRUDE_EFF_FRAC} · CRUDE_DURA_FRAC=${B.CRUDE_DURA_FRAC} (두 번째 마법 상수 표를 만들지 않았다)`);
}
console.log('');
process.exit(0);
