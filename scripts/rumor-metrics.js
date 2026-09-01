#!/usr/bin/env node
// === scripts/rumor-metrics.js — 소문 도달 지연 **대리 지표** ====================
//   ⚠계측기다. 하네스가 아니다 — **러너에 넣지 마라**(`// @regress` 표를 붙이지 않는다).
//
// ★재는 것 [T7 2026-09-01]
//   ① 실지도 51마을의 **도달 지연 분포**(중앙값·최대·도달불능 쌍)
//      — "이웃 마을 소식을 며칠 뒤에 듣는가"가 이 배치의 체감 전부다.
//   ② **다단 전파가 실제로 몇 쌍에서 이기는가**(직행 일수 > 최단 경로 일수)
//      — 이기는 쌍이 0이면 Dijkstra 는 그냥 비싼 직행 조회다. 그 사실을 알고 있어야 한다.
//   ③ **도달표 계산 비용**(마을당 한 번 · 사건 1건당 상각)
//
// ★거리는 실서버를 띄우지 않고 얻는다 — `villages.__labProbe._distProbe` 가
//   본 게임의 `computeAndInjectDistMatrix` **그 함수**를 그대로 내준다(계측기도 사본 금지 · 원칙 ㉒).
//   `scripts/test-distmatrix.js` 가 쓰는 것과 같은 진입점이다.
//
// 실행: node scripts/rumor-metrics.js [마을수]      (기본 = 실지도 시딩 전부)
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));

const _log = console.log;
console.log = () => {}; const _warn = console.warn; console.warn = () => {};
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const Rumor = R('server/rumor');
const P = R('server/villages').__labProbe;
console.log = _log; console.warn = _warn;

const Z = 'hanbando';
const ZONE = ZONES[Z];
const SZ = P.SZ;
P.setZoneId(Z);

const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRock = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isBlocked = (x, y) => { if (!_in(x, y)) return true; return isRock(x, y) || isWater(x, y); };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: isBlocked, isWaterTileLocal: isWater });

const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta);
const N = Math.min(parseInt(process.argv[2] || '0', 10) || picked.length, picked.length);
console.log(`\n=== 소문 도달 지연 대리 지표 (zone=${Z} · 마을 ${N}곳) ===`);
console.log(`  시계: max(${Rumor.CFG.MIN_DAYS}, round(거리 / ${Rumor.CFG.SPEED}))  ← econ 캐러밴 시계 거울`);

// 실지도 시딩과 **같은 환산**(cell × 2.5 = econ 좌표) — test-distmatrix 와 동일
const world = { villages: picked.slice(0, N).map((hv, i) => ({ name: hv.name || ('v' + i), coord: { x: Math.round(hv.x / SZ) * 2.5, y: Math.round(hv.y / SZ) * 2.5 } })) };
P._distProbe.setup(ta, ZONE, world, econ);
const t0 = Date.now();
{ const _l = console.log; console.log = () => {}; P._distProbe.compute('rumor-metrics'); console.log = _l; }
console.log(`  거리행렬 ${N}×${N} — ${((Date.now() - t0) / 1000).toFixed(1)}초`);

const ids = world.villages.map((_, i) => i);
const G = Rumor.createGraph({ vids: () => ids, dist: (a, b) => econ.villageDist(world.villages[a], world.villages[b]) });

// ── ① 도달 지연 분포 ──────────────────────────────────────────────────────────
const all = [], perVillageMax = [];
let unreach = 0, hopWins = 0, hopSaved = 0, pairs = 0;
for (const a of ids) {
  const row = G.rowOf(a);
  let mx = 0;
  for (const b of ids) {
    if (a === b) continue;
    pairs++;
    const d = row[b];
    if (d == null) { unreach++; continue; }
    all.push(d);
    if (d > mx) mx = d;
    const direct = Rumor.travelDaysOf(econ.villageDist(world.villages[a], world.villages[b]));
    if (isFinite(direct) && direct > d) { hopWins++; hopSaved += direct - d; }
  }
  perVillageMax.push(mx);
}
all.sort((x, y) => x - y);
const q = (f) => all[Math.min(all.length - 1, Math.floor(f * (all.length - 1)))];
const mean = all.reduce((x, y) => x + y, 0) / (all.length || 1);
console.log('\n[① 도달 지연 — 마을 쌍 전수(방향 포함)]');
console.log(`  쌍 ${pairs} (도달불능 ${unreach}) · 최소 ${all[0]}일 · p50 ${q(0.5)}일 · p90 ${q(0.9)}일 · 최대 ${all[all.length - 1]}일 · 평균 ${mean.toFixed(2)}일`);
const hist = new Map();
for (const d of all) hist.set(d, (hist.get(d) || 0) + 1);
console.log('  분포: ' + [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => `${d}일 ${n}`).join(' · '));
console.log(`  "내 마을에서 가장 먼 소식" 중앙값 ${perVillageMax.slice().sort((a, b) => a - b)[perVillageMax.length >> 1]}일 · 최대 ${Math.max(...perVillageMax)}일`);

// ── ② 다단 전파가 이기는가 ────────────────────────────────────────────────────
console.log('\n[② 다단 전파(징검다리) vs 직행]');
console.log(`  직행보다 짧은 쌍 ${hopWins}/${all.length} (${(hopWins / Math.max(1, all.length) * 100).toFixed(1)}%) · 아낀 일수 합 ${hopSaved}`);
if (!hopWins) console.log('  ⚠이 배치에선 징검다리가 한 번도 이기지 않는다 — Dijkstra 는 사실상 직행 조회다(사실대로 적는다).');

// ── ③ 도달표 계산 비용 ────────────────────────────────────────────────────────
const S = G.stats;
console.log('\n[③ 도달표 계산 비용]');
console.log(`  그래프 걷기 ${S.walks}회(마을 수 ${N}) · 총 ${S.walkMs.toFixed(1)}ms · 1회 평균 ${(S.walkMs / Math.max(1, S.walks)).toFixed(2)}ms`);
console.log(`  캐시 적중 ${S.hits} / 미스 ${S.misses}`);
// 사건 1건당 상각 — 800일 51마을 실측 사건 수(사건 레이어 배치)를 나눠 본다.
const EV_800 = 18434;   // 시드 1020 · 800일 · 51마을 타입 합계(부족+글럿+급등+급락+계절) — 인계 E 절
console.log(`  사건 1건당 상각(800일 ${EV_800}건 기준): ${(S.walkMs / EV_800 * 1000).toFixed(3)}µs`);
console.log('');
