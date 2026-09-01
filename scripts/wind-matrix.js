#!/usr/bin/env node
// === scripts/wind-matrix.js — 바람 노출 대리 지표 (계측기 · 러너 미등록) =========
//
// ★[T4 2026-09-01 재민 확정 ④⑤] 이 배치의 대리 지표를 한 판에 낸다:
//   ① 옷 티어 × 장소(마을/야생 평지/골/능선) × 시기(초겨울/한겨울/동지) **3단계 도달 시간 매트릭스**
//   ② 노출도 X 의 분포 — 51마을 둘레 히스토그램(세계가 실제로 얼마나 노출돼 있나)
//   ③ 노출 계산 비용(새 셀 / 캐시 적중)
//
// ★★한 해만 찍지 마라 — `cold-matrix` 초안이 그렇게 틀렸다(족보 ㊻). 날씨 편차 때문에
//   어떤 해의 한겨울 밤은 안 닿는다. 여기서는 **24년 표본의 도달률과 중앙값**으로 적는다.
//
// ★자리는 **찾는다, 고르지 않는다**(족보 73) — 능선·골 좌표를 손으로 적지 않고
//   산맥 폴리라인 둘레를 훑어 모델 자신에게 묻는다.
//
// 실행: node scripts/wind-matrix.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

const Terr = require(path.join(ROOT, 'server', 'terrain.js'));
const hard = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8')).hanbando;
const W = 70016, H = 130016;
Terr.setZonesMeta({ hanbando: { zoneWidth: W, zoneHeight: H, biome: 'forest', isOcean: false } });
Terr.setHardcoded('hanbando', hard);
const isRockT = (x, y) => (x < 0 || y < 0 || x >= W || y >= H)
  ? false : Terr.isRockCellLocal('hanbando', Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16);
const isWaterT = (x, y) => Terr.isWaterCellLocal('hanbando', Math.floor(x / 32) * 32 + 16, Math.floor(y / 32) * 32 + 16);

const Wind = require(path.join(ROOT, 'server', 'wind.js'));
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const B = require(path.join(ROOT, 'server', 'body.js'));
const PI = require(path.join(ROOT, 'server', 'player-items.js'));
Wind.bindTerrain({ isRock: isRockT, forestMult: (x, y) => Terr.getForestMultiplier('hanbando', x, y) });

const A = Wx.anchors();
const WINTER = Math.round(A.winterMid);
const S3 = B.STAGE_AT.cold[2] + B.CFG.STAGE_HYST;
function clock(ctx) {
  const P = { hunger: 100, thirst: 100 }; B.ensure(P);
  for (let s = 1; s <= 3600; s++) { B.tick(P, 1, ctx); if (B.ensure(P).cold >= S3) return s; }
  return null;
}
function years(ctx, doy, n) {
  let hit = 0; const ts = [];
  for (let k = 0; k < (n || 24); k++) { const t = clock(Object.assign({ day: doy + 365 * k }, ctx)); if (t !== null) { hit++; ts.push(t); } }
  ts.sort((a, b) => a - b);
  return { hit, n: n || 24, med: ts.length ? ts[ts.length >> 1] : null };
}
const fmt = (r) => `${String(r.hit).padStart(2)}/${r.n}${r.med !== null ? ` (${(r.med / 60).toFixed(1)}분)` : ' (—)'}`;

// ── 자리를 찾는다 ─────────────────────────────────────────────────────────────
let RIDGE = null, rX = -1, VALLEY = null, vX = 9;
for (const r of hard.ridges) {
  for (let i = 0; i < r.path.length; i += 3) {
    const [cx, cy] = r.path[i].pos;
    for (let a = 0; a < 16; a++) for (const d of [700, 1100, 1600]) {
      const ang = 2 * Math.PI * a / 16;
      const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d;
      if (x < 200 || y < 200 || isRockT(x, y) || isWaterT(x, y)) continue;
      const e = Wind.explain(x, y, WINTER, 0);
      if (e.X > rX) { rX = e.X; RIDGE = [Math.round(x), Math.round(y)]; }
      if (e.bNW > 0.3 && e.bSE > 0.3 && e.X < vX) { vX = e.X; VALLEY = [Math.round(x), Math.round(y)]; }
    }
  }
}
console.log('\n=== 바람 노출 대리 지표 (T4 · 2026-09-01) ===');
console.log(`  한겨울(최한일) doy ${WINTER} · 탁월풍 세기 ${Wind.seasonWind(WINTER).toFixed(3)}(+1 = 북서풍 최대)`);
console.log(`  능선(풍상 기슭) ${RIDGE} X=${rX}   ·   골(양쪽 다 산) ${VALLEY} X=${vX}`);

// ── ① 매트릭스 ───────────────────────────────────────────────────────────────
const TIERS = [['맨몸', 0], ['조잡 베옷', PI.craftItem('clothes', 0, { hemp: 3 }).attrs.warmth],
  ['장인 베옷', PI.craftItem('clothes', 10, { hemp: 3 }).attrs.warmth],
  ['가죽옷', PI.craftItem('clothes', 5, { leather: 3 }).attrs.warmth],
  ['갖옷', PI.craftItem('clothes', 8, { fur: 3 }).attrs.warmth]];
const PLACES = [['마을', { villageShelter: 1, windExposure: 0 }],
  ['야생 평지', { windExposure: 0 }],
  ['골', { windExposure: vX }],
  ['능선', { windExposure: rX }]];
// 시기 — 초겨울/한겨울/동지. ★날짜 상수를 적지 않는다: 최한일에서 econ 계절 길이만큼 물러선다.
const Events = require(path.join(ROOT, 'server', 'events.js'));
const winterStart = (() => { let d = WINTER; while (Events.seasonOf(((d - 1) % 365 + 365) % 365) === 'winter') d--; return ((d % 365) + 365) % 365; })();
const TIMES = [['초겨울', winterStart + 5], ['한겨울', WINTER], ['동지(최한)', WINTER]];

for (const [tName, doy] of [['초겨울', TIMES[0][1]], ['한겨울', WINTER]]) {
  console.log(`\n  ── ${tName} 자정 · 24년 표본 (도달 횟수 / 중앙 도달 시간) ──`);
  console.log('    ' + '옷\\장소'.padEnd(12) + PLACES.map(([p]) => p.padEnd(16)).join(''));
  for (const [cName, warmth] of TIERS) {
    const row = PLACES.map(([, ctx]) => fmt(years(Object.assign({ night: true, warmth }, ctx), doy)).padEnd(16));
    console.log('    ' + `${cName}(${warmth})`.padEnd(12) + row.join(''));
  }
}

// ── ② X 분포 — 51마을 둘레 ───────────────────────────────────────────────────
console.log('\n  ── 노출도 X 분포 (마을 51곳 둘레 반경 3,000px · 걸을 수 있는 셀) ──');
const hist = new Array(11).fill(0);
let n = 0, sum = 0;
for (const v of hard.villages) {
  const [vx, vy] = v.pos || [v.x, v.y];
  if (!Number.isFinite(vx)) continue;
  for (let a = 0; a < 24; a++) for (const d of [500, 1200, 2000, 3000]) {
    const ang = 2 * Math.PI * a / 24;
    const x = vx + Math.cos(ang) * d, y = vy + Math.sin(ang) * d;
    if (x < 200 || y < 200 || x >= W - 200 || y >= H - 200) continue;
    if (isRockT(x, y) || isWaterT(x, y)) continue;
    const X = Wind.exposureAt(x, y, WINTER, 0);
    hist[Math.min(10, Math.round(X * 10))]++; n++; sum += X;
  }
}
console.log(`    표본 ${n}셀 · 평균 X ${(sum / Math.max(1, n)).toFixed(4)} · X=0 인 셀 ${(hist[0] / Math.max(1, n) * 100).toFixed(1)}%`);
console.log('    ' + hist.map((c, i) => `${(i / 10).toFixed(1)}:${(c / Math.max(1, n) * 100).toFixed(1)}%`).join(' '));

// ── ③ 비용 ──────────────────────────────────────────────────────────────────
Wind._reset();
const t0 = Date.now();
for (let i = 0; i < 500; i++) Wind.exposureAt(RIDGE[0] + i * 32, RIDGE[1] + i * 16, WINTER, 0);
const missMs = Date.now() - t0;
const st = Wind.stats();
const t1 = process.hrtime.bigint();
for (let i = 0; i < 500; i++) Wind.exposureAt(RIDGE[0] + i * 32, RIDGE[1] + i * 16, WINTER, 0);
const hitUs = Number(process.hrtime.bigint() - t1) / 1000 / 500;
console.log(`\n  ── 비용 ──`);
console.log(`    새 셀 ${st.usecPerMiss}µs (500셀 ${missMs}ms · 청크 적재/첫 진입에만)`);
console.log(`    캐시 적중 ${hitUs.toFixed(2)}µs — **틱 비용 사실상 0**`);
console.log(`    걸어서 하루(24분 · 초당 2셀) 새 셀 2,880개 ≈ ${(st.usecPerMiss * 2880 / 1e6).toFixed(2)}초 CPU(그 뒤로는 0)\n`);
