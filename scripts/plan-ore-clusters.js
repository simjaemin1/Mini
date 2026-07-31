#!/usr/bin/env node
// === scripts/plan-ore-clusters.js — 광맥 대·중·소 50개 + 자잘 배치 계획 ===
//
// ★[11차 재민 확정] 광맥 배분:
//     대형 3(r130) · 중형 12(r70) · 소형 35(r32)  = **대중소 50개**
//     자잘 수백 개(r4~10) — ★단 자잘은 **소외 구역 처리 순서의 마지막**이다:
//        ①지류를 소외구역에 더 추가 → ②자잘한 숲 구역 추가 → ③그러고도 남는 소외구역에 자잘 광맥
//     그래서 이 스크립트는 기본적으로 **대중소 50개만** 계획한다(--minor 로 자잘도 계획).
//
// 배치 원칙 (실측으로 정한 것들):
//   · **산 기슭 편중** — 점수 = (0.20 + 바위비율×2.5) × (땅비율)^1.5.
//     랩에서 바위 편중을 ×4로 두었더니 클러스터가 산 *한복판*에 앉아 r7짜리가 전부
//     땅 0셀로 전멸했다(지도 광맥이 목표 5.6%가 아니라 1.23%). 기슭이 최고점이 되게 고쳤다.
//   · 중심은 반드시 땅(물·바위 아님) · 원판의 35% 이상이 팔 수 있는 땅
//   · 서로 (r_i + r_j)×0.55 이상 떨어뜨린다 — 완전 분리가 아니라 살짝 겹치는 건 허용(실제 광상도 그렇다)
//   · p_peak 은 클러스터마다 흩뿌린다(기준 × 0.4~1.6) — "넓지만 가난한 광맥"이 생긴다
//   · 광물 종류: 기존 9개는 보존, 새 클러스터만 pickMineral(존 biome + 위치 해시)
//     ★기존 광맥의 mineral 을 재배정하면 광산5의 주석 자급이 깨진다 — 절대 건드리지 않는다
//
// 실행:
//   node scripts/plan-ore-clusters.js [--zone hanbando] [--minor] [--apply] [--out /tmp/ore-plan.json]
//   기본은 **계산만**. --apply 를 줘야 server/<zone>-terrain.json 에 쓴다.
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const APPLY = has('--apply');
const MINOR = has('--minor') || has('--minor-only') || has('--neg-big');
const MINOR_ONLY = has('--minor-only');   // ★대·중·소 50개는 이미 적용됐다 — 자잘만 돈다(중복 방지)
const OUT = val('--out', '/tmp/ore-plan.json');

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const Specialty = require(path.join(__dirname, '..', 'server', 'specialty'));
const GAME = path.join(__dirname, '..', 'server', ZID + '-terrain.json');
const doc = require(GAME);
const d = doc[ZID];
const Z = ZONES[ZID];
const CELL = 32;
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);

// 대중소 50 + (옵션) 자잘. [개수, 반경(셀), p_peak 기준]
const TIERS = [[3, 130, 0.45], [12, 70, 0.38], [35, 32, 0.30]];
const MINOR_TIER = [400, 7, 0.22];
// ★소외 최대 덩이에 놓는 **비교적 큰 광맥**(재민). --neg-big 으로 이것만 따로 돌린다.
const NEG_BIG_TIER = [2, 70, 0.38];
// ★[재민 확정 순서 3단계] 자잘 광맥은 **남은 소외 구역 편중**으로 뿌린다.
//   ①지류(3개) → ②자잘한 숲(17개)으로 소외가 2.9% → 0.2%까지 내려갔다. 그러고도 남은 자리가
//   자잘 광맥의 1순위다 — 물도 숲도 없는 내륙 깊은 곳이라 광맥 고증에도 맞고,
//   그 땅이 유일하게 아무것도 안 되는 곳이기 때문이다.
// ★[재민 정정] "자잘한 광맥은 맵 곳곳에 골고루 퍼져야지.. 소외지역에 넣어달라고 한 건
//   **비교적 큰 광맥**을 넣고, 자잘광맥도 비교적 **많이** 배치되게 해달란 거였어."
//   부스트 6으로 전량을 소외에 몰아넣었더니 6×10 구역 중 **48개가 비고 한 구역에 56개**가 몰렸다
//   — 큰 광맥 하나 넣은 것과 다를 게 없었다(실측). 그래서 둘로 나눈다:
//     · 자잘은 존을 격자로 나눠 **구역마다 할당량**을 준다(균등 보장). 소외 구역만 할당을 늘린다.
//     · 소외 최대 덩이에는 별도로 **중형(r70)** 을 하나 놓는다 — "비교적 큰 광맥"이 그 뜻이다.
const MINOR_NEG_BOOST = 1.6;   // 소외 격자 위 후보의 점수 배수(같은 구역 안에서만 작동)
const MINOR_GX = 8, MINOR_GY = 15;   // 자잘 배치 구역 격자 — 존을 이만큼 나눠 할당
const MINOR_NEG_QUOTA = 2.5;         // 소외를 품은 구역의 할당 배수

console.log('=== 광맥 배치 계획 · ' + ZID + ' · ' + W + '×' + H + '셀 ===');
console.log('기존 광맥 ' + d.ores.length + '개 — ' + d.ores.map((o) => o.name + '(' + (o.mineral || '?') + ' r' + Math.round(o.radius / CELL) + ')').join(', '));
console.log('★기존 클러스터는 좌표·반경·광물 전부 보존한다(광산5 주석 자급이 여기 걸려 있다)');

// ── 지형 표본(4셀 격자) — 바위/물/땅 비율을 O(1)로 재기 위한 적분영상 ──
const S = 4, gw = Math.ceil(W / S), gh = Math.ceil(H / S);
console.log('\n지형 표본 ' + gw + '×' + gh + '(' + S + '셀)…');
const t0 = Date.now();
const rock = new Uint8Array(gw * gh), water = new Uint8Array(gw * gh);
for (let gy = 0; gy < gh; gy++) {
  for (let gx = 0; gx < gw; gx++) {
    const px = (gx * S + (S >> 1)) * CELL + 16, py = (gy * S + (S >> 1)) * CELL + 16;
    const i = gy * gw + gx;
    if (terrain.isWaterCellLocal(ZID, px, py)) water[i] = 1;
    else if (terrain.isRockCellLocal(ZID, px, py)) rock[i] = 1;
  }
  if (gy % 200 === 0) process.stdout.write('  y ' + gy + '/' + gh + '\r');
}
console.log('  ' + ((Date.now() - t0) / 1000).toFixed(0) + 's                    ');

// ── 소외 필드(--minor 전용) — audit-neglect 와 같은 기준: 물 ≥180 & 숲 ≥180 ──
let NEG = null;
if (MINOR) {
  console.log('소외 필드 계산(물 ≥180 & 숲 ≥180)…');
  const kind = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = gx * S + (S >> 1), y = gy * S + (S >> 1), px = x * CELL + 16, py = y * CELL + 16;
    kind[gy * gw + gx] = terrain.isWaterCellLocal(ZID, px, py) ? 1
      : (terrain.isRockCellLocal(ZID, px, py) ? 2 : (terrain.getForestMultiplier(ZID, px, py) > 1.2 ? 3 : 0));
  }
  const cham = (pred) => {
    const INF = 1 << 28, a = new Int32Array(gw * gh);
    for (let i = 0; i < a.length; i++) a[i] = pred(i) ? 0 : INF;
    const up = (i, j, c) => { if (a[j] + c < a[i]) a[i] = a[j] + c; };
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const i = y * gw + x; if (!a[i]) continue; if (x > 0) up(i, i - 1, 5); if (y > 0) up(i, i - gw, 5); if (x > 0 && y > 0) up(i, i - gw - 1, 7); if (x < gw - 1 && y > 0) up(i, i - gw + 1, 7); }
    for (let y = gh - 1; y >= 0; y--) for (let x = gw - 1; x >= 0; x--) { const i = y * gw + x; if (!a[i]) continue; if (x < gw - 1) up(i, i + 1, 5); if (y < gh - 1) up(i, i + gw, 5); if (x < gw - 1 && y < gh - 1) up(i, i + gw + 1, 7); if (x > 0 && y < gh - 1) up(i, i + gw - 1, 7); }
    return a;
  };
  const dW = cham((i) => kind[i] === 1), dF = cham((i) => kind[i] === 3), cd = (a, i) => a[i] / 5 * S;
  NEG = new Uint8Array(gw * gh);
  let n = 0;
  for (let i = 0; i < kind.length; i++) { if (kind[i] === 1 || kind[i] === 2) continue; if (cd(dW, i) >= 180 && cd(dF, i) >= 180) { NEG[i] = 1; n++; } }
  console.log('  소외 격자 ' + n.toLocaleString() + '개 — 자잘 광맥을 여기 편중 배치한다');
}
const mkII = (src) => { const A = new Int32Array((gw + 1) * (gh + 1)); for (let y = 0; y < gh; y++) { let row = 0; for (let x = 0; x < gw; x++) { row += src(y * gw + x); A[(y + 1) * (gw + 1) + x + 1] = A[y * (gw + 1) + x + 1] + row; } } return A; };
const RI = mkII((i) => rock[i]), LI = mkII((i) => (rock[i] || water[i]) ? 0 : 1);
const boxAvg = (A, x0, y0, x1, y1) => {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(gw - 1, x1); y1 = Math.min(gh - 1, y1);
  if (x1 < x0 || y1 < y0) return 0;
  const sm = A[(y1 + 1) * (gw + 1) + x1 + 1] - A[y0 * (gw + 1) + x1 + 1] - A[(y1 + 1) * (gw + 1) + x0] + A[y0 * (gw + 1) + x0];
  return sm / ((x1 - x0 + 1) * (y1 - y0 + 1));
};
const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

// 기존 클러스터를 placed 로 선점 — 새 것이 위를 덮지 않게
const placed = d.ores.map((o) => ({ cx: Math.round(o.center[0] / CELL), cy: Math.round(o.center[1] / CELL), r: Math.round(o.radius / CELL), existing: true, name: o.name }));
const added = [];
let nextIdx = d.ores.length + 1;

const NEG_BIG = has('--neg-big');   // 소외 최대 덩이에 중형 광맥만 놓는다
const tiers = NEG_BIG ? [NEG_BIG_TIER] : (MINOR_ONLY ? [MINOR_TIER] : (MINOR ? TIERS.concat([MINOR_TIER]) : TIERS));
// ── 자잘 배치용 구역 할당표 ─────────────────────────────────────────────
//   존을 MINOR_GX×MINOR_GY 로 나누고, 뭍이 있는 구역에 균등 할당(소외 품은 구역은 ×2.5).
//   그리고 클러스터를 **구역 순서대로 돌아가며** 놓는다 ⇒ 한 곳에 몰릴 수가 없다.
let MINOR_ZONE = null, MINOR_ORDER = null;
{
  const bw = Math.ceil(gw / MINOR_GX), bh = Math.ceil(gh / MINOR_GY);
  const cells = [], negIn = new Array(MINOR_GX * MINOR_GY).fill(0), landIn = new Array(MINOR_GX * MINOR_GY).fill(0);
  for (let gy = 2; gy < gh - 2; gy++) for (let gx = 2; gx < gw - 2; gx++) {
    const i = gy * gw + gx; if (water[i] || rock[i]) continue;
    const b = Math.min(MINOR_GY - 1, (gy / bh) | 0) * MINOR_GX + Math.min(MINOR_GX - 1, (gx / bw) | 0);
    landIn[b]++; if (NEG && NEG[i]) negIn[b]++;
    cells.push(i);
  }
  const w = landIn.map((n, b) => n < 200 ? 0 : (1 + (negIn[b] > 0 ? MINOR_NEG_QUOTA - 1 : 0)));
  MINOR_ZONE = { bw, bh, cells, w, landIn, negIn };
  const order = [];
  for (let b = 0; b < w.length; b++) if (w[b] > 0) order.push(b);
  MINOR_ORDER = order;
  console.log('자잘 배치 구역 ' + MINOR_GX + '×' + MINOR_GY + ' — 뭍 있는 구역 ' + order.length + '개 · 소외 품은 구역 ' + negIn.filter((n) => n > 0).length + '개');
}
// 구역별 셀 목록(자잘 배치 때 그 구역 안에서만 최적점을 고른다)
const MINOR_BCELL = new Map();
if (MINOR_ZONE) for (const i of MINOR_ZONE.cells) {
  const gx = i % gw, gy = (i / gw) | 0;
  const b = Math.min(MINOR_GY - 1, (gy / MINOR_ZONE.bh) | 0) * MINOR_GX + Math.min(MINOR_GX - 1, (gx / MINOR_ZONE.bw) | 0);
  let a = MINOR_BCELL.get(b); if (!a) MINOR_BCELL.set(b, a = []); a.push(i);
}

let _scanCache = null, _scanFor = -1, _minorTurn = 0;
for (const [cnt, R0, pk0] of tiers) {
  let made = 0; _scanCache = null; _scanFor = -1;
  for (let k = 0; k < cnt; k++) {
    const gR = Math.max(1, Math.round(R0 / S));
    let best = null, bs = -1;
    // ★자잘(R0 ≤ 12셀)은 **구역 할당**으로 균등 배치한다 — 전 지도 스캔은 250억 연산이라
    //   끝나지 않고(실측), 소외만 훑으면 한 덩이에 몰린다(실측 48/60 구역 공백). 구역이 답이다.
    const step = Math.max(2, Math.min(8, gR));
    let scan = _scanCache;
    if (!scan || _scanFor !== R0) {
      scan = [];
      if (NEG_BIG && NEG) { for (let i = 0; i < NEG.length; i++) if (NEG[i]) { const gx = i % gw, gy = (i / gw) | 0; if (gx >= gR && gy >= gR && gx < gw - gR && gy < gh - gR) scan.push(i); } }
      else if (MINOR_ZONE && R0 <= 12) { scan = MINOR_ZONE.cells; }
      else { for (let gy = gR; gy < gh - gR; gy += step) for (let gx = gR; gx < gw - gR; gx += step) scan.push(gy * gw + gx); }
      _scanCache = scan; _scanFor = R0;
    }
    if (R0 <= 12 && MINOR_ORDER && MINOR_ORDER.length) {
      // ★구역 순환 — 가중치가 큰(소외 품은) 구역은 여러 번 차례가 온다
      const wsum = [];
      let acc = 0; for (const b of MINOR_ORDER) { acc += MINOR_ZONE.w[b]; wsum.push(acc); }
      const t = ((_minorTurn++) * 0.6180339887 % 1) * acc;   // 황금비 순환 = 결정론 + 고른 분산
      let bi = 0; while (bi < wsum.length - 1 && wsum[bi] < t) bi++;
      scan = MINOR_BCELL.get(MINOR_ORDER[bi]) || scan;
    }
    for (const _i of scan) {
      { const gy = (_i / gw) | 0, gx = _i % gw;
        const i = gy * gw + gx;
        if (water[i] || rock[i]) continue;                    // 중심은 반드시 땅
        const cx = gx * S, cy = gy * S;
        let free = true;
        for (const o of placed) { const dd = Math.hypot(o.cx - cx, o.cy - cy); if (dd < (o.r + R0) * 0.55) { free = false; break; } }
        if (!free) continue;
        const lf = boxAvg(LI, gx - gR, gy - gR, gx + gR, gy + gR);
        if (lf < 0.35) continue;                              // 원판의 1/3 이상이 팔 수 있는 땅
        const rf = boxAvg(RI, gx - gR - 3, gy - gR - 3, gx + gR + 3, gy + gR + 3);   // 기슭을 잡으려 원판을 넓혀 잰다
        const negB = (NEG && NEG[gy * gw + gx]) ? MINOR_NEG_BOOST : 1;   // ★소외 격자 우선(재민 순서 3단계)
        const sc = (0.20 + rf * 2.5) * Math.pow(lf, 1.5) * (0.6 + hash2(gx, gy, 400 + k) * 0.8) * negB;
        if (sc > bs) { bs = sc; best = { cx, cy, lf, rf }; }
      }
    }
    if (!best) { console.log('  ⚠ r' + R0 + ' #' + (k + 1) + ' — 자리 없음(중단)'); break; }
    const center = [best.cx * CELL + 16, best.cy * CELL + 16];
    const mineral = Specialty.pickMineral(Z.biome, Math.round(center[0] * 0.131 + center[1] * 0.237));
    // ★[재민 확정] 금광 같은 건 **종류를 빼는 게 아니라 p로 누른다** — 금맥은 있되 한 삽에 금이 나올 확률이 낮다.
    //   p_peak = 등급기준 × 위치지터(0.4~1.6) × oreValueScale(가치) — 철 1.00 · 텅스텐 0.16 · 금 0.09 · 다이아 0.014
    const pk = Specialty.orePeakFor(mineral, pk0, hash2(best.cx, best.cy, 500));
    const o = { name: '광맥' + (nextIdx++), center, radius: R0 * CELL, mineral, pk };
    placed.push({ cx: best.cx, cy: best.cy, r: R0 });
    added.push(Object.assign({}, o, { _lf: +best.lf.toFixed(3), _rf: +best.rf.toFixed(3) }));
    made++;
  }
  console.log('  반경 ' + String(R0).padStart(3) + '셀 × ' + String(cnt).padStart(3) + ' 요청 → ' + made + '개 배치');
}

// ── 요약 ──
const area = (r) => Math.PI * r * r;
let cells = 0;
for (const o of d.ores) cells += area(o.radius / CELL);
for (const o of added) cells += area(o.radius / CELL);
const ZC = W * H;
console.log('\n총 광맥 ' + (d.ores.length + added.length) + '개 (기존 ' + d.ores.length + ' + 신규 ' + added.length + ')');
console.log('  원판 면적 합 ' + Math.round(cells).toLocaleString() + '셀 = 존의 ' + (cells / ZC * 100).toFixed(2) + '%');
const byR = {};
for (const o of added) { const r = Math.round(o.radius / CELL); const e = byR[r] = byR[r] || { n: 0, pk: 0, m: {} }; e.n++; e.pk += o.pk; e.m[o.mineral] = (e.m[o.mineral] || 0) + 1; }
console.log('\n신규 등급별:');
for (const r of Object.keys(byR).map(Number).sort((a, b) => b - a)) {
  const e = byR[r];
  console.log('  r' + String(r).padStart(3) + '셀 ×' + String(e.n).padStart(3) + ' · 평균 p_peak ' + (e.pk / e.n).toFixed(3) +
    ' · 광물 ' + Object.entries(e.m).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + '×' + v).join(' '));
}
console.log('\n지속 광부(광맥 하나, 만땅 0.01 / 완전고갈 0.02 · 광부 ' + Specialty.NPC_MINE_PER_DAY + '/게임일):');
for (const [, r] of [[0, 130], [0, 70], [0, 32], [0, 7]]) {
  const c = area(r);
  console.log('  r' + String(r).padStart(3) + ' → ' + Math.round(c).toLocaleString().padStart(7) + '셀 · 만땅 ' +
    (c * 0.01 / Specialty.NPC_MINE_PER_DAY).toFixed(1) + '명 · 완전고갈 ' + (c * 0.02 / Specialty.NPC_MINE_PER_DAY).toFixed(1) + '명 · 총재고 ' + Math.round(c * Specialty.ORE_K).toLocaleString());
}

fs.writeFileSync(OUT, JSON.stringify({ zone: ZID, existing: d.ores.length, added }, null, 1));
console.log('\n계획 → ' + OUT);

// 기존 9개에도 p_peak 을 매긴다 — 좌표·반경·광물은 **절대 안 건드린다**(광산5 주석 자급이 걸려 있다).
//   pk 가 없으면 terrain 이 기본 0.33을 쓰는데, 그러면 광맥8(옥)이 광맥1(철)과 같은 품위가 된다.
const EXIST_TIER_BASE = 0.30;   // 기존은 전부 r22 = 소형 등급
console.log('\n기존 9개 p_peak 부여(좌표·반경·광물 불변):');
for (const o of d.ores) {
  // ★기존 광맥은 JSON에 mineral 이 없다 — zone.js 가 **부팅 때** pickMineral(biome, 위치해시)로 정한다(3486행).
  //   여기서 같은 식을 재현해 JSON에 못 박는다(값은 동일 = 무변경). 안 그러면 전부 'iron' 폴백으로 잘못 매긴다.
  if (!o.mineral) o.mineral = Specialty.pickMineral(Z.biome, Math.round(o.center[0] * 0.131 + o.center[1] * 0.237));
  const m = o.mineral;
  o.pk = Specialty.orePeakFor(m, EXIST_TIER_BASE, hash2(Math.round(o.center[0] / CELL), Math.round(o.center[1] / CELL), 500));
  const v = (Specialty.RESOURCES[m] || {}).baseValue || 5;
  console.log('  ' + o.name.padEnd(5) + ' ' + m.padEnd(10) + ' 가치 ' + String(v).padStart(4) + ' → p_peak ' + o.pk);
}

if (!APPLY) { console.log('\n★계산만 — 쓰려면 --apply'); process.exit(0); }
for (const o of added) d.ores.push({ name: o.name, center: o.center, radius: o.radius, mineral: o.mineral, pk: o.pk });
fs.writeFileSync(GAME, JSON.stringify(doc, null, 1));
console.log('★적용됨 → ' + GAME + ' (광맥 ' + d.ores.length + '개)');
console.log('  다음: node scripts/audit-terrain-quality.js ' + ZID + ' · build-cell-map · export-editor-work');
