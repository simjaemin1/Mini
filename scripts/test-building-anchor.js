#!/usr/bin/env node
// === 건물 스프라이트 앵커 대조 하네스 ===
// client.js의 하드코딩 앵커 A표가 building_render.py의 결정적 카메라 수학(및 실제 PNG 치수)과
// 일치하는지 검증한다. ★앵커는 렌더 픽셀이 아니라 (W,D,top)에서 결정적으로 유도되므로
// Blender 없이 재계산 가능 — 재렌더 후 A표 갱신을 잊으면 여기서 잡힌다.
//   (배경: a5a4917의 클라 주석이 "하네스가 대조"라고 썼으나 실제 하네스가 없었다 — 검수 세션에서 신설.)
// 실행: node scripts/test-building-anchor.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// ── building_render.py 동형 수학(THETA 30°·PPU 64/√2·ZSQ·SLOPE 0.6·EAVE 2.0) ──
const th = Math.PI / 6, PPU = 64 / Math.SQRT2, ZSQ = 32 / (PPU * Math.cos(th));
const SLOPE = 0.6, EAVE = 2.0;
function anchor(W, D, top) {
  const DI = W + 1, DJ = D + 1;
  const Wpx = Math.trunc((DI + DJ) * 32) + 8, Hpx = Math.trunc((DI + DJ) * 16 + top * 32) + 12;
  const ctr = [DI / 2, DJ / 2, top * ZSQ / 2], rel = [-ctr[0], -ctr[1], -ctr[2]];
  const R = [1 / Math.SQRT2, -1 / Math.SQRT2, 0];
  const U = [-Math.sin(th) / Math.SQRT2, -Math.sin(th) / Math.SQRT2, Math.cos(th)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return { w: Wpx, h: Hpx, ox: +(Wpx / 2 + dot(rel, R) * PPU).toFixed(1), oy: +(Hpx / 2 - dot(rel, U) * PPU).toFixed(1) };
}
// building_render.py JOBS 동형 발자국·용마루고
const JOBS = {
  hut_roof: anchor(6, 4, EAVE + 2.5 * SLOPE + 0.4),
  hall_roof: anchor(8, 8, EAVE + 4.5 * SLOPE + 0.4),
  granary: anchor(5, 3, 2.0 + 2.0 * SLOPE + 0.4),
  // ★움집 4단계 공정(8차) — 발자국은 완공과 같은 6×4, 높이만 단계별(building_render.py JOBS 동형)
  hut_s1: anchor(6, 4, 0.45),
  hut_s2: anchor(6, 4, EAVE + 0.35),
  hut_s3: anchor(6, 4, EAVE + 2.5 * SLOPE + 0.35),
  // ★노(爐) 3단계 + 완공 · 숯가마 2단계(2026-08-02) — 발자국 2×2, 높이만 단계별
  furn_s1: anchor(2, 2, 0.30),
  furn_s2: anchor(2, 2, 0.95),
  furn_s3: anchor(2, 2, 1.35),
  furnace: anchor(2, 2, 1.55),
  kiln_s1: anchor(2, 2, 0.30),
  charcoal_kiln: anchor(2, 2, 1.25),
};

// ── ① client.js A표 파싱 ──
console.log('[① client.js 앵커 A표 = 결정적 재계산값]');
const cj = require('./client-src.js').readClientSrc();
const m = cj.match(/const A = \{([^}]+)\}/);
ok(!!m, 'client.js에서 A표 발견');
if (m) {
  const A = {};
  for (const mm of m[1].matchAll(/(\w+):\s*\[([\d.]+),\s*([\d.]+)\]/g)) A[mm[1]] = [+mm[2], +mm[3]];
  for (const k in JOBS) {
    ok(A[k] && A[k][0] === JOBS[k].ox && A[k][1] === JOBS[k].oy,
      `${k}: 클라 [${A[k]}] = 계산 [${JOBS[k].ox},${JOBS[k].oy}]`);
  }
}

// ── ② 실제 PNG 치수 = 계산 치수 (IHDR 직접 파싱 — 의존성 0) ──
console.log('\n[② PNG 실치수 = 계산 치수]');
for (const k in JOBS) {
  const buf = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'buildings', k + '.png'));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  ok(w === JOBS[k].w && h === JOBS[k].h, `${k}.png ${w}×${h} = 계산 ${JOBS[k].w}×${JOBS[k].h}`);
}

console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
