#!/usr/bin/env node
// === scripts/fish-metrics.js — 낚시 v2 **대리 지표** 실측 ========================
//
// ★[재민 확정 2026-08-26] "재미의 실측은 불가능하니 대리 지표를 보고하라:
//   평균 사이클 길이(대기+챔질) · 놓침율(시작점 20~30%) · 월척(상위 5%) 조우율."
//
// ★이 스크립트가 지어내지 않는 것: 전부 `server/fishing.js` **정본 함수**를 부른다.
//   놓침율만은 사람의 반사신경이 변수라 **반응시간을 축으로** 낸다 —
//   "이 손잡이에서 0.3초 만에 채는 사람은 몇 %를 놓치나"가 재민이 돌릴 값이다.
//
// 실행: node scripts/fish-metrics.js [표본=20000]
'use strict';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
if (T.setZonesMeta) T.setZonesMeta(ZONES);
const F = require(path.join(ROOT, 'server', 'fishing'));
const Z = 'hanbando', ZONE = ZONES[Z];
const N = parseInt(process.argv[2], 10) || 20000;

// ── 실지도에서 자리 네 종류를 고른다 ─────────────────────────────────────────
const pool = [];
for (let y = 0; y < ZONE.zoneHeight; y += 71) {
  for (let x = 0; x < ZONE.zoneWidth; x += 71) {
    if (!T.isWaterCellLocal(Z, x, y)) continue;
    const sp = F.spotAt(T, Z, x, y);
    if (sp.water) pool.push({ x, y, sp });
  }
}
const pick = (f, label) => { const c = pool.filter(f); return c.length ? { label, ...c[Math.floor(c.length / 2)] } : null; };
const SPOTS = [
  pick((p) => p.sp.kind === 'lake' && p.sp.depth01 < 0.3, '호수 물가(얕음)'),
  pick((p) => p.sp.kind === 'lake' && p.sp.depth01 > 0.7, '호수 한복판(깊음)'),
  pick((p) => p.sp.kind === 'river' && p.sp.seam01 > 0.7, '강 흐름 경계'),
  pick((p) => p.sp.kind === 'river' && p.sp.depth01 > 0.85, '강 한복판(깊음)'),
  pick((p) => p.sp.conflu === 1, '합류부/하구 ★명당'),
].filter(Boolean);

const rng = (() => { let s = 20260826 >>> 0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })();
const REACT = [200, 300, 400, 500];   // 사람이 찌를 보고 손이 나가기까지(ms)

console.log(`\n=== 낚시 v2 대리 지표 (표본 ${N}/자리 · 실지도 물 표본 ${pool.length}칸) ===`);
console.log(`손잡이: WAIT_BASE ${F.CFG.WAIT_BASE_MS}ms · WIN_BASE ${F.CFG.WIN_BASE_MS}ms · WIN_MIN ${F.CFG.WIN_MIN_MS}ms`
  + ` · SIZE_MU ${F.CFG.SIZE_MU} · SIZE_SIGMA ${F.CFG.SIZE_SIGMA} · SEAM_W ${F.CFG.SEAM_W} · DEPTH_W ${F.CFG.DEPTH_W}\n`);

const head = '자리'.padEnd(20) + '대기ms'.padStart(8) + '창ms'.padStart(7) + '사이클s'.padStart(9)
  + '중앙kg'.padStart(8) + '상위5%kg'.padStart(9) + '월척율'.padStart(8) + '   놓침율(반응 ' + REACT.join('/') + 'ms)';
console.log(head);
console.log('-'.repeat(head.length + 6));
const rows = [];
for (const S of SPOTS) {
  const kg = [], wait = [], win = [];
  for (let i = 0; i < N; i++) {
    const p = F.plan(S.sp, 1, 0, rng);
    kg.push(p.kg); wait.push(p.waitMs); win.push(p.windowMs);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sorted = kg.slice().sort((a, b) => a - b);
  const q = (f) => sorted[Math.floor(sorted.length * f)];
  const med = q(0.5), p95 = q(0.95);
  const bigRate = kg.filter((k) => k >= F.CFG.BIG_KG).length / N;
  // 사이클 = 대기 + 창(챔질까지) — 한 마리에 드는 실시간
  const cyc = (mean(wait) + mean(win)) / 1000;
  const miss = REACT.map((r) => (win.filter((w) => w + F.CFG.WIN_LAT_MS < r).length / N * 100).toFixed(0) + '%');
  rows.push({ S, med, p95, bigRate, cyc, wait: mean(wait), win: mean(win), miss });
  console.log(S.label.padEnd(18) + String(Math.round(mean(wait))).padStart(8) + String(Math.round(mean(win))).padStart(7)
    + cyc.toFixed(1).padStart(9) + med.toFixed(2).padStart(8) + p95.toFixed(2).padStart(9)
    + (bigRate * 100).toFixed(1).padStart(7) + '%   ' + miss.join(' / '));
}

// ── 자리 수명 — 한 자리가 몇 마리 만에 바닥나나(정본 재고로 실측) ─────────────
console.log('\n자리 수명 — 같은 자리를 계속 긁으면');
for (const S of SPOTS.slice(0, 3)) {
  F.fishCells.clear();
  const cx = Math.floor(S.x / 32), cy = Math.floor(S.y / 32);
  let n = 0, kgSum = 0;
  for (let i = 0; i < 400; i++) {
    const p = F.plan(S.sp, F.stockRatioAt(cx, cy, 0), 0, rng);
    const took = F.drawStock(cx, cy, p.kg / F.CFG.KG_PER_STOCK, 0, null);
    if (took <= 1e-6) break;
    n++; kgSum += took * F.CFG.KG_PER_STOCK;
  }
  const r = F.stockRatioAt(cx, cy, 0);
  console.log(`  ${S.label.padEnd(18)} ${String(n).padStart(3)}마리 · ${kgSum.toFixed(1)}kg 까지 · 남은 재고 ${(r * 100).toFixed(0)}%`
    + ` (반경 ${F.CFG.DRAW_R} = ${F.fishCells.size}셀)`);
}

// ── 회복 — 옆에서 오는 것(확산)과 진짜 재생(로지스틱)을 갈라 본다 ────────────
console.log('\n회복 — 자리는 몇 분이면 돌아오고, 어장 총량은 계절이 걸린다');
{
  F.fishCells.clear();
  const S = SPOTS[SPOTS.length - 1];
  const cx = Math.floor(S.x / 32), cy = Math.floor(S.y / 32);
  for (let i = 0; i < 60; i++) F.drawStock(cx, cy, 1 / F.CFG.KG_PER_STOCK, 0, null);
  const d0 = F.deficitStock();
  const marks = [1, 2, 5, 10, 30];
  const DAY_MIN = 24;   // 게임일 24분(zone-config WORLD)
  let acc = 0;
  for (const m of marks) {
    const step = (m - acc) / DAY_MIN;
    F.diffuse(step, null); acc = m;
    console.log(`  ${String(m).padStart(2)}분 뒤 — 그 자리 재고 ${(F.stockRatioAt(cx, cy, 0) * 100).toFixed(0)}%`
      + ` · 어장 총 결손 ${(F.deficitStock() / d0 * 100).toFixed(1)}% (100%=안 줄었다)`);
  }
  for (let i = 0; i < 60; i++) F.diffuse(1, null);
  console.log(`  60 게임일 뒤 — 어장 총 결손 ${(F.deficitStock() / d0 * 100).toFixed(1)}% (정본 로지스틱 r=0.02/일)`);
}
console.log('');
