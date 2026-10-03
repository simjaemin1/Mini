#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T588 ② 자 · 판정 0 · 표만)
// =============================================================================
// **진폭 ↔ D 자** — 구간 성격(H = 2 − D · 옥타브 범위)이 같은 **긴 곧은 시험 해안**(가짜 존 하나 + 그 아래 바다 존 하나 ·
//   정본 생성기 `public/coast-shape.js generate` 그대로)을 진폭 A 몇 벌로 깎아 u8 마스크로 떨군다 → `t549-coast-shape.py`(T549 자)로 D 를 잰다.
//   ⇒ "고증 D 를 게임 자(상자 16~128셀)로 내려면 진폭이 얼마여야 하나"를 **한 구간 길이보다 훨씬 긴 해안**에서 잰다
//     (구간 몸통 540셀은 상자 128셀이 네 개뿐이라 D 가 판마다 크게 흔들린다 — 같은 지금 식이 서 1.37 · 남 1.03 으로 갈렸다).
// 쓰는 법: node scripts/t588-coast-fit.js <D> <λ_max px> <A px,…|old> <outDir> [λ_min px = FINE_PX] [--match-old-sd]
//   → outDir/A<A>.u8 · outDir/fit.json(띠 칸 · 해안선 깊이 평균·표준편차 · 바닥 근처 몫)
//   --match-old-sd: 지금 식(끔)의 해안선 표준편차를 같은 시험 해안에서 재고, 같은 표준편차가 나오는 A 를 찾는다(참고 안 · 유도값)
//   --match-d     : 그 성격으로 깎은 시험 해안을 T549 자(상자 2~128셀)로 잰 D 가 고증 D 가 되는 A 를 찾는다(안 ⓑ 의 진폭 · 유도값)
//                   ⚠할선법의 첫 두 점(5,000 · 그 두 배/반)과 상·하한(500~80,000px)은 찾는 길일 뿐 — 답은 D 가 정한다
//   --k <K>       : ★[T588 추신2] T591 띠 배수 K 를 시험 해안에 건다(존 `coastBandK` = K · 배수 함수 = K 고르게 — 닛폰 몸통 자리 ·
//                   뭍 이웃 변 비탈은 몸통 밖이라 뺀다) — 배수 위 같은 성격이 같은 자로 몇 D 인지 · 바닥에 얼마나 닿는지
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const CS = require(path.join(__dirname, '..', 'public', 'coast-shape.js'));
const D = +process.argv[2], LMAX = +process.argv[3], AS = String(process.argv[4] || '5000').split(',').map((v) => (v === 'old' ? 'old' : +v)), OUT = process.argv[5] || '/tmp/t588-fit';
const LMIN = process.argv[6] ? +process.argv[6] : null;
fs.mkdirSync(OUT, { recursive: true });
const BASE = 6000, NOISE = 5000;   // chunk.js COASTLINE_BASE · COASTLINE_NOISE(같은 수 · 대조는 t588-coast-mask.js 가 한다)
const NX = 8192, NY = 1200, X0 = 4000000, Y0 = 4000000;
const KARG = (() => { const i = process.argv.indexOf('--k'); return i > 0 ? +process.argv[i + 1] : 1; })();   // 세계 밖 빈 자리(실존 존과 안 겹친다 — 잡음은 세계 좌표 함수라 자리만 다른 같은 성격)
const zones = { land: Object.assign({ worldOffsetX: X0, worldOffsetY: Y0, zoneWidth: NX * 32, zoneHeight: NY * 32 }, KARG !== 1 ? { coastBandK: KARG } : {}),
  sea: { worldOffsetX: X0, worldOffsetY: Y0 + NY * 32, zoneWidth: NX * 32, zoneHeight: 4000 * 32, isOcean: true } };
const ocean = [{ x0: X0, y0: Y0 + NY * 32, x1: X0 + NX * 32, y1: Y0 + (NY + 4000) * 32 }];
const pxPerKm = (1000 / CS.SCALE.mPerCell) * 32;
const out = { D, lmax: LMAX, lmin: LMIN || CS.FINE_PX, NX, NY, k: KARG, runs: [] };
// 해안선 깊이(열마다 가장 남쪽 뭍 셀 → 바다 존까지) — 평균 · 표준편차 · 바닥(2m = 2,000px) 안 몫
function stats(set) {
  const M = new Uint8Array(NX * NY);
  for (const k of set) { const u = k.indexOf('_'); M[+k.slice(u + 1) * NX + +k.slice(0, u)] = 1; }
  let s1 = 0, s2 = 0, nf = 0;
  for (let x = 0; x < NX; x++) { let y = NY - 1; while (y >= 0 && M[y * NX + x]) y--; const d = (NY - 1 - y) * 32; s1 += d; s2 += d * d; if (d <= 2 * (BASE - NOISE) * KARG) nf++; }
  const mean = s1 / NX, sd = Math.sqrt(Math.max(0, s2 / NX - mean * mean));
  return { M, mean, sd, nf };
}
function run(A) {
  const t0 = Date.now();
  let set;
  if (A === 'old') {   // 지금 식 — 정본 `chunk.generateCoastlineWaterTiles`(끔) 를 같은 시험 해안에 그대로
    delete process.env.T588_COAST;
    set = require(path.join(__dirname, '..', 'server', 'chunk')).generateCoastlineWaterTiles(Object.assign({ id: 'land' }, zones.land), 32, null, ocean);
  } else {
    const opts = { sections: [{ id: 't', ko: '시험', zone: 'land', side: 'S', from: 0, to: 1 }],
      chars: { t: { D, rulerKm: [(LMIN || CS.FINE_PX) / pxPerKm, LMAX / pxPerKm], ampKm: A / pxPerKm } }, fine: LMIN || undefined };
    if (KARG !== 1) opts.bandK = () => KARG;
    set = CS.generate(Object.assign({ id: 'land' }, zones.land), 32, ocean, zones, BASE, NOISE, () => BASE, opts);
  }
  const st = stats(set);
  fs.writeFileSync(path.join(OUT, `A${A}.u8`), Buffer.from(st.M.buffer));
  const r = { A, band: set.size, meanDepthPx: Math.round(st.mean), sdPx: Math.round(st.sd), sdExact: st.sd, nearFloorPct: +(100 * st.nf / NX).toFixed(2), ms: Date.now() - t0 };
  out.runs.push(r); console.error(JSON.stringify(r)); return r;
}
// T549 모양 자로 D 를 잰다(부르기 · 사본 0) — 상자 2~128셀 맞춤 기울기(T549 'D')
function measureD(A) {
  const SHAPE = process.env.T549_SHAPE || path.join(__dirname, 't549-coast-shape.py');
  const r = require('child_process').spawnSync('python3', [SHAPE, String(NX), String(NY), `x=${path.join(OUT, `A${A}.u8`)}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) { console.error(r.stderr); process.exit(3); }
  return JSON.parse(r.stdout).x;
}
if (process.argv.indexOf('--match-d') > 0) {
  // ⓑ "D 맞춤": 이 구간 성격(H · 옥타브 범위)으로 깎은 긴 시험 해안을 T549 자(상자 2~128셀)로 쟀을 때 D 가 **고증 D** 가 되는 진폭 A — 할선법(log A 위)
  // 맞추는 D = **큰 상자 D(16~128셀 · T549 'Dlarge')** — 이 생성기는 잔 옥타브(FINE_PX = 10셀) 밑으로 굴곡이 없게 깎으니(셀 톱니 0)
  //   상자 2~16셀 몫은 래스터 계단(D≈1)이라 2~128 맞춤 기울기를 끌어내린다. 큰 상자 16~128셀(= 512~4,096px ≈ 2.2~17.5km @137m/셀)이
  //   생성기 옥타브 범위(320~3,200px)와 겹치는 자다. ⚠T589 의 자 범위(km)는 미확인 — 어느 자인지는 보고에 둘 다 적는다(`--d-key D` 로 2~128).
  const KEY = (() => { const i = process.argv.indexOf('--d-key'); return i > 0 ? process.argv[i + 1] : 'Dlarge'; })();
  const target = D; const pts = [];
  const tryA = (A) => { A = Math.round(A); const r = run(A), m = measureD(A); r.D = m.D; r.Dsmall = m.Dsmall; r.Dlarge = m.Dlarge; r.spikePer1k = m.spikePer1k; pts.push([A, m[KEY]]); console.error(JSON.stringify({ A, D: m.D, Dlarge: m.Dlarge })); return m[KEY]; };
  let a0 = NOISE, d0 = tryA(a0), a1 = d0 < target ? NOISE * 2 : NOISE / 2, d1 = tryA(a1);
  for (let i = 0; i < 6 && Math.abs(d1 - target) > 0.004; i++) {
    const l0 = Math.log(a0), l1 = Math.log(a1); let l2 = l1 + (target - d1) * (l1 - l0) / ((d1 - d0) || 1e-9);
    l2 = Math.max(Math.log(500), Math.min(Math.log(80000), l2));
    a0 = a1; d0 = d1; a1 = Math.exp(l2); d1 = tryA(a1);
  }
  out.matchD = { key: KEY, target, A: Math.round(a1), D: d1, pts };
  console.error(JSON.stringify({ matchD: out.matchD }));
} else if (process.argv.indexOf('--match-old-sd') > 0) {
  // ⓑ "들고남 맞춤": 지금 식의 해안선 표준편차를 같은 시험 해안에서 재고, 그 표준편차가 나오는 진폭 A 를 할선법으로(5 번)
  const old = run('old'); const target = old.sdExact;
  let a0 = NOISE, r0 = run(a0).sdExact, a1 = NOISE * target / Math.max(1, r0), r1 = run(a1).sdExact;
  for (let i = 0; i < 4 && Math.abs(r1 - target) > 1; i++) { const a2 = a1 + (target - r1) * (a1 - a0) / ((r1 - r0) || 1); a0 = a1; r0 = r1; a1 = Math.max(1000, a2); r1 = run(a1).sdExact; }
  out.match = { oldSd: target, A: Math.round(a1), sd: r1 };
  console.error(JSON.stringify({ match: out.match }));
} else for (const A of AS) run(A === 'old' ? 'old' : +A);
fs.writeFileSync(path.join(OUT, 'fit.json'), JSON.stringify(out));
