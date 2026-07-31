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
const QUOTA_OUT = val('--quota-out', __dirname + '/ore-minor-quota.json');   // 자잘 구역 할당표(감사용 귀무가설)

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
// ★[재민 확정] 등급은 **크기와 무관**하다 — pk0 는 이제 orePeakFor 가 무시한다(ORE_TIER_BASE 고정).
//   숫자는 "이 티어가 몇 개, 반경 몇 셀"만 뜻한다. 세 번째 값은 역사적 잔재로 남겨 둔다.
const TIERS = [[3, 130, 0.30], [12, 70, 0.30], [35, 32, 0.30]];
// ★[재민] "자잘광맥을 더 추가하는 방향으로 해봐.. **훨씬 많아야 해**.. 그래야 탐험하는 재미가 있지"
//   400 → 1600. 반경도 4~10셀로 흩는다(전부 r7이면 지도에서 규칙적으로 보인다).
const MINOR_TIER = [2600, 7, 0.30];   // ★[재민] "훨씬 많아야 해.. 그래야 탐험하는 재미가 있지" — 1600 → 2600
const MINOR_R_JITTER = [4, 10];   // 자잘 반경 범위(셀) — 클러스터마다 다르게
const MINOR_MIN_SEP = 22;         // 자잘끼리 절대 최소 간격(셀) — 뭉침 방지
// ★소외 최대 덩이에 놓는 **비교적 큰 광맥**(재민). --neg-big 으로 이것만 따로 돌린다.
const NEG_BIG_TIER = [2, 70, 0.30];
// ★[재민 "심어"] 특정 광물을 **지정해서** 심는 모드.
//   실측에서 주석(tin)이 광맥9 하나뿐이라 기대 산출이 구리의 1/39 였다 —
//   게다가 NPC 는 자잘을 못 보므로 **마을 경제의 주석 공급원이 문자 그대로 광맥 하나**였다.
//   pickMineral 을 건드리면(ORE_POOLS 에 tin 추가) 풀 길이가 바뀌어 modulo 가 밀려
//   **기존 2661개 전부의 광물이 재배정된다** — 절대 안 된다. 그래서 지정 배치 모드를 둔다.
//     --mineral tin --tier 2,22,0.30 --apart 700
const FORCE_MINERAL = val('--mineral', null);
const FORCE_TIER = (() => { const v = val('--tier', null); if (!v) return null;
  const a = v.split(',').map(Number); return (a.length === 3 && a.every((x) => isFinite(x))) ? a : null; })();
const APART = parseFloat(val('--apart', '0'));   // 같은 광물끼리 최소 거리(셀)
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
// 한반도는 실제 산지 지도를 쓴다(다른 존은 biome 풀 유지)
let HB_MIN = null;
try { if (ZID === 'hanbando') HB_MIN = require(path.join(__dirname, '..', 'server', 'hanbando-minerals')); } catch (e) { }
const hash2 = (ix, iy, s) => { let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };

// 기존 클러스터를 placed 로 선점 — 새 것이 위를 덮지 않게
const placed = d.ores.map((o) => ({ cx: Math.round(o.center[0] / CELL), cy: Math.round(o.center[1] / CELL), r: Math.round(o.radius / CELL), existing: true, name: o.name }));
// ★공간 해시 — placed 선형 검사는 자잘 1600개에서 120억 연산이 된다(실측으로 두 번 당했다).
//   버킷 한 변 = 가장 큰 반경의 2배. 검사할 땐 주변 3×3 버킷만 본다.
const PB = 320;   // 버킷 한 변(셀)
const _pb = new Map();
const _pbKey = (cx, cy) => ((cx / PB) | 0) * 100000 + ((cy / PB) | 0);
function pbAdd(p) { const k = _pbKey(p.cx, p.cy); let a = _pb.get(k); if (!a) _pb.set(k, a = []); a.push(p); }
function pbNear(cx, cy) {
  const bx = (cx / PB) | 0, by = (cy / PB) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const a = _pb.get((bx + dx) * 100000 + (by + dy)); if (a) for (const q of a) out.push(q);
  }
  return out;
}
for (const p of placed) pbAdd(p);
const added = [];
let nextIdx = d.ores.length + 1;

const NEG_BIG = has('--neg-big');   // 소외 최대 덩이에 중형 광맥만 놓는다
const tiers = FORCE_TIER ? [FORCE_TIER] : (NEG_BIG ? [NEG_BIG_TIER] : (MINOR_ONLY ? [MINOR_TIER] : (MINOR ? TIERS.concat([MINOR_TIER]) : TIERS)));
// 같은 광물이 이미 놓인 자리들 — APART 로 밀어낸다(주석이 한 골짜기에 몰리면 인질 문제가 그대로다)
const SAME_MIN = (FORCE_MINERAL && APART > 0)
  ? d.ores.filter((o) => o.mineral === FORCE_MINERAL).map((o) => [Math.round(o.center[0] / CELL), Math.round(o.center[1] / CELL)])
  : [];
if (FORCE_MINERAL) console.log('★광물 지정 배치: ' + FORCE_MINERAL + ' · 기존 동일 광물 ' + SAME_MIN.length + '개에서 ' + APART + '셀 이상 떨어뜨림');
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
  // ★--quota-only : 할당표만 뽑고 끝낸다(배치는 안 한다).
  //   감사가 **설계 의도를 귀무가설로** 쓰려면 이 표가 필요하다. 배치(3분)를 다시 돌리지 않으려고 뺐다.
  if (has('--quota-only')) {
    fs.writeFileSync(QUOTA_OUT, JSON.stringify({ zone: ZID, gx: MINOR_GX, gy: MINOR_GY, negQuota: MINOR_NEG_QUOTA, w }, null, 1));
    console.log('할당표 → ' + QUOTA_OUT);
    process.exit(0);
  }
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
        if (water[i]) continue;                               // 물 위는 안 된다(바위 위는 **된다** — 아래)
        const cx = gx * S, cy = gy * S;
        let free = true;
        // ★자잘은 **절대 최소 간격**을 둔다. 비례 간격(0.55×(7+7)=7.7셀)만으로는 구역 안에서
        //   argmax 주변에 다닥다닥 붙어 뭉침 지수가 1.49까지 올랐다(실측). 40셀을 강제한다.
        const sepMin = R0 <= 12 ? MINOR_MIN_SEP : 0;
        for (const o of pbNear(cx, cy)) { const dd = Math.hypot(o.cx - cx, o.cy - cy); if (dd < Math.max(sepMin, (o.r + R0) * 0.55)) { free = false; break; } }
        if (!free) continue;
        if (SAME_MIN.length) { let near = false;
          for (const q of SAME_MIN) { if (Math.hypot(q[0] - cx, q[1] - cy) < APART) { near = true; break; } }
          if (near) continue; }
        const lf = boxAvg(LI, gx - gR, gy - gR, gx + gR, gy + gR);
        const rf = boxAvg(RI, gx - gR, gy - gR, gx + gR, gy + gR);
        // ★★[11차 재민] "광맥이 산 근처에 퍼져 있는 건 좋은데, 좀 더 **산 안쪽**으로 들어갔으면 좋겠어.
        //   산 타일을 부숴야만 채굴할 수 있도록 말이야."
        //   구 점수 (0.20+rf×2.5)×lf^1.5 는 lf(땅 비율)를 제곱 이상으로 요구해 **산을 밀어냈다**
        //   — 실측: 광맥 중심이 바위 안인 것이 **0%**, 기슭(20셀 이내)에 붙어만 있었다.
        //   이제 등급별로 프로파일을 나눈다:
        //     · 대·중·소 = **산 안쪽**. rock 비율을 강하게 보고 땅 비율은 하한만 본다(접근로 확보용).
        //     · 자잘     = **맵 전체 균등 우선**. 산 편중은 약하게 — 재민: "다른 광맥에 비해서는
        //       맵 전체적으로 골고루 퍼져 있으면 좋겠어".
        const isMinor = R0 <= 12;
        let sc;
        if (isMinor) {
          if (lf < 0.25) continue;                            // 자잘은 캐러 갈 땅이 어느 정도 있어야
          sc = (0.30 + rf * 3.0) * Math.pow(lf, 0.5) * (0.6 + hash2(gx, gy, 400 + k) * 0.8);
        } else {
          if (lf < 0.06) continue;                            // ★하한만 — 원판 대부분이 바위여도 좋다(산 속 광맥)
          sc = (0.10 + rf * 4.0) * Math.pow(lf, 0.25) * (0.6 + hash2(gx, gy, 400 + k) * 0.8);
        }
        const negB = (NEG && NEG[gy * gw + gx]) ? MINOR_NEG_BOOST : 1;
        sc *= negB;
        if (sc > bs) { bs = sc; best = { cx, cy, lf, rf }; }
      }
    }
    if (!best) { console.log('  ⚠ r' + R0 + ' #' + (k + 1) + ' — 자리 없음(중단)'); break; }
    const center = [best.cx * CELL + 16, best.cy * CELL + 16];
    // ★자잘은 반경도 흩는다 — 전부 같은 크기면 지도에서 규칙적으로 보인다
    let Reff = R0;
    if (R0 <= 12) Reff = MINOR_R_JITTER[0] + Math.round(hash2(best.cx, best.cy, 733) * (MINOR_R_JITTER[1] - MINOR_R_JITTER[0]));
        // ★[재민 확정] 광종은 **지역 무관 전역 풀**(hanbando-minerals)에서 뽑는다.
    //   (한때 실제 산지 지도를 입혔다가 기각 — 지형이 가상인데 광물만 실지리를 따르면 어긋난다.)
    //   씨앗 731 은 품위 지터(500)와 **분리**한다 — 광종과 품위가 상관되면 안 된다.
    const mineral = FORCE_MINERAL || (HB_MIN
      ? HB_MIN.mineralAt(0, 0, hash2(best.cx, best.cy, 731))
      : Specialty.pickMineral(Z.biome, Math.round(center[0] * 0.131 + center[1] * 0.237)));
    if (FORCE_MINERAL && APART > 0) SAME_MIN.push([best.cx, best.cy]);   // ★새로 놓은 것도 즉시 밀어내기 대상
    // ★[재민 확정] 금광 같은 건 **종류를 빼는 게 아니라 p로 누른다** — 금맥은 있되 한 삽에 금이 나올 확률이 낮다.
    //   p_peak = 등급기준 × 위치지터(0.4~1.6) × oreValueScale(가치) — 철 1.00 · 텅스텐 0.16 · 금 0.09 · 다이아 0.014
    const pk = Specialty.orePeakFor(mineral, pk0, hash2(best.cx, best.cy, 500));
    // ★[재민 확정] 자잘 광맥은 **플레이어 전용**이다 — minor:1 이 박히면 NPC/econ 은 영영 못 본다
    //   (terrain.isMajorOreAt · villages isOre/oreMinerals · zone _findNearestTerrainCluster/villageProduction · chunk 마을타입)
    const o = { name: '광맥' + (nextIdx++), center, radius: Reff * CELL, mineral, pk };
    if (R0 <= 12) o.minor = 1;
    { const _p = { cx: best.cx, cy: best.cy, r: Reff }; placed.push(_p); pbAdd(_p); }
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

// ★자잘 할당표를 같이 남긴다 — 감사(audit-ore-distribution)가 **설계 의도를 귀무가설로** 쓰기 위함이다.
//   자잘 배치는 "뭍 면적 비례"가 아니라 "구역당 균등(소외 품은 구역은 ×2.5)"이다.
//   면적 비례를 귀무가설로 잡으면 의도한 균등을 뭉침으로 오독한다(실측 1.72 — 전부 이 배수 탓이었다).
const minorQuota = MINOR_ZONE ? { gx: MINOR_GX, gy: MINOR_GY, w: MINOR_ZONE.w, negQuota: MINOR_NEG_QUOTA } : null;
fs.writeFileSync(OUT, JSON.stringify({ zone: ZID, existing: d.ores.length, added, minorQuota }, null, 1));
console.log('\n계획 → ' + OUT);

// 기존 광맥의 **빠진** p_peak 만 채운다 — 좌표·반경·광물은 절대 안 건드린다(광산5 주석 자급이 걸려 있다).
//   pk 가 없으면 terrain 이 기본 0.33을 쓰는데, 그러면 광맥8(옥)이 광맥1(철)과 같은 품위가 된다.
//
// ★★[치명 결함 수정] 이 블록은 광맥이 **9개**이던 시절에 쓰였는데, 조건 없이 pk 를 **덮어썼다**.
//   지금은 2661개를 돌면서 매 --apply 마다 전부 재채점한다 — 실측으로 확인됐다:
//     주석 2개를 심었을 뿐인데 **기존 2598개의 pk 가 바뀌었고**(광맥67 0.129→0.471 등)
//     철 기대산출이 21,636 → 23,744 (+9.7%) 로 튀었다. 심은 것과 무관한 순수 재추첨 잡음이다.
//   게다가 등급 기준을 r22 고정(0.30)으로 썼다 — r130(0.45)은 강등되고 자잘(0.22)은 승격됐다.
//   ⇒ ①이미 pk 가 있으면 **손대지 않는다**(멱등)  ②없을 때만, **반경에 맞는 등급**으로 매긴다.
const EXIST_TIER_BASE = 0.30;
const tierBaseFor = () => 0.30;   // ★크기 무관 — orePeakFor 가 어차피 무시한다(호환용)
let _pkFilled = 0, _pkKept = 0;
for (const o of d.ores) {
  // ★기존 광맥은 JSON에 mineral 이 없다 — zone.js 가 **부팅 때** pickMineral(biome, 위치해시)로 정한다(3486행).
  //   여기서 같은 식을 재현해 JSON에 못 박는다(값은 동일 = 무변경). 안 그러면 전부 'iron' 폴백으로 잘못 매긴다.
  if (!o.mineral) o.mineral = HB_MIN
    ? HB_MIN.mineralAt(0, 0, hash2(Math.floor(o.center[0] / CELL), Math.floor(o.center[1] / CELL), 731))
    : Specialty.pickMineral(Z.biome, Math.round(o.center[0] * 0.131 + o.center[1] * 0.237));
  const m = o.mineral;
  if (typeof o.pk === 'number' && isFinite(o.pk) && o.pk > 0) { _pkKept++; continue; }   // ★멱등 — 절대 덮어쓰지 않는다
  const rc = Math.round(o.radius / CELL);
  o.pk = Specialty.orePeakFor(m, tierBaseFor(rc), hash2(Math.round(o.center[0] / CELL), Math.round(o.center[1] / CELL), 500));
  _pkFilled++;
  const v = (Specialty.RESOURCES[m] || {}).baseValue || 5;
  console.log('  ' + o.name.padEnd(7) + ' ' + m.padEnd(10) + ' r' + String(rc).padStart(3) + ' 가치 ' + String(v).padStart(4) + ' → p_peak ' + o.pk);
}
console.log('기존 p_peak: 유지 ' + _pkKept + '개 · 새로 채움 ' + _pkFilled + '개');

if (!APPLY) { console.log('\n★계산만 — 쓰려면 --apply'); process.exit(0); }
for (const o of added) { const e = { name: o.name, center: o.center, radius: o.radius, mineral: o.mineral, pk: o.pk }; if (o.minor) e.minor = 1; d.ores.push(e); }
fs.writeFileSync(GAME, JSON.stringify(doc, null, 1));
console.log('★적용됨 → ' + GAME + ' (광맥 ' + d.ores.length + '개)');
console.log('  다음: node scripts/audit-terrain-quality.js ' + ZID + ' · build-cell-map · export-editor-work');
