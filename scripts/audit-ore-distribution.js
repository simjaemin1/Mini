#!/usr/bin/env node
// === scripts/audit-ore-distribution.js — 광맥 분포 정밀 감사 ===
//
// ★[11차 재민 지시] "분포도 측정 정밀하게 해봐"
//   "눈으로 고르게 보인다"는 믿을 게 못 된다. 네 가지를 수치로 잰다:
//
//   ① **구역 균등도** — 존을 격자로 나눠 개수를 세고 **변동계수(CV = 표준편차/평균)** 로 잰다.
//      완전 균등이면 CV=0. 완전 무작위(포아송)면 CV ≈ 1/√평균. 뭉치면 CV가 그보다 크다.
//      ⇒ CV / (1/√평균) = **뭉침 지수**. 1이면 무작위, 2면 무작위보다 두 배 뭉쳤다는 뜻.
//   ② **최근접 이웃 거리(NND)** — 각 광맥에서 가장 가까운 광맥까지. 뭉치면 짧아진다.
//      기대값(완전 무작위) = 0.5/√밀도. 실측/기대 = **R지수**. <1 뭉침 · =1 무작위 · >1 규칙적.
//   ③ **산까지 거리** — 광맥 셀에서 가장 가까운 바위까지. "산 안쪽"인지 "기슭"인지 가른다.
//      음수(=바위 안)면 산 속이다.
//   ④ **접근성** — 마을에서 가장 가까운 광맥까지(등급별). 탐험 거리의 실측.
//
// 실행: node scripts/audit-ore-distribution.js [--zone hanbando] [--gx 8] [--gy 15]
'use strict';
const path = require('path');
const fs = require('fs');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const GX = parseInt(val('--gx', '8'), 10), GY = parseInt(val('--gy', '15'), 10);
const CELL = 32, S = 4;

const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const d = require(path.join(__dirname, '..', 'server', ZID + '-terrain.json'))[ZID];
const Z = ZONES[ZID];
const W = Math.round(Z.zoneWidth / CELL), H = Math.round(Z.zoneHeight / CELL);

const ores = d.ores || [];
const minor = ores.filter((o) => o.minor);
const major = ores.filter((o) => !o.minor);
console.log('=== 광맥 분포 감사 · ' + ZID + ' · ' + W + '×' + H + '셀 ===');
const byR = {};
for (const o of ores) { const r = Math.round(o.radius / CELL); byR[r] = (byR[r] || 0) + 1; }
console.log('광맥 ' + ores.length + '개 — ' + Object.entries(byR).sort((a, b) => b[0] - a[0]).map(([r, n]) => 'r' + r + '×' + n).join(' · '));
console.log('  대·중·소(NPC 인식) ' + major.length + '개 · 자잘(플레이어 전용) ' + minor.length + '개\n');

// ── 뭍 격자(균등도의 분모는 "놓을 수 있는 땅"이어야 한다) ──
const gw = Math.ceil(W / S), gh = Math.ceil(H / S);
process.stdout.write('지형 표본…\r');
const rock = new Uint8Array(gw * gh), water = new Uint8Array(gw * gh);
for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
  const px = (gx * S + (S >> 1)) * CELL + 16, py = (gy * S + (S >> 1)) * CELL + 16;
  const i = gy * gw + gx;
  if (terrain.isWaterCellLocal(ZID, px, py)) water[i] = 1;
  else if (terrain.isRockCellLocal(ZID, px, py)) rock[i] = 1;
}
console.log('지형 표본 완료          ');

function report(list, label) {
  if (!list.length) return;
  console.log('── ' + label + ' (' + list.length + '개) ──');
  // ① 구역 균등도 (뭍이 있는 구역만 분모)
  const bw = Math.ceil(gw / GX), bh = Math.ceil(gh / GY);
  const landIn = new Array(GX * GY).fill(0), cnt = new Array(GX * GY).fill(0);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const i = gy * gw + gx; if (water[i]) continue;
    landIn[Math.min(GY - 1, (gy / bh) | 0) * GX + Math.min(GX - 1, (gx / bw) | 0)]++;
  }
  for (const o of list) {
    const gx = Math.min(GX - 1, Math.floor(o.center[0] / CELL / W * GX));
    const gy = Math.min(GY - 1, Math.floor(o.center[1] / CELL / H * GY));
    cnt[gy * GX + gx]++;
  }
  const live = [];
  for (let b = 0; b < cnt.length; b++) if (landIn[b] >= 200) live.push(b);
  const vals = live.map((b) => cnt[b]);
  const mean = vals.reduce((a, x) => a + x, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / vals.length);
  const cv = mean > 0 ? sd / mean : 0;
  // ★★[정정] 구 지표는 "모든 구역의 기대 개수가 같다"는 **틀린 귀무가설**을 썼다.
  //   구역마다 뭍 면적이 두 배 넘게 차이 난다(해안 구역은 절반이 물이다). 뭍이 넓은 구역에
  //   광맥이 더 많은 건 뭉친 게 아니라 **옳은** 것이다. 실제로 자잘을 1196 → 2600 으로 늘렸더니
  //   CV 는 0.378 로 그대로인데 1/√평균 만 작아져 지수가 1.21 → 1.76 으로 "악화"됐다 — 지표 탓이다.
  //   ⇒ 비균질 포아송으로 바꾼다: 기대 λ_b = N × (구역 뭍셀 / 전체 뭍셀)
  //     분산지수 D = Σ(n_b − λ_b)²/λ_b ÷ (B−1)  ·  뭉침 지수 = √D  (균질일 때 구 정의와 정확히 일치)
  //   ★★그리고 자잘은 귀무가설이 하나 더 있다. 배치기(plan-ore-clusters)가 쓰는 할당은
  //     "면적 비례"가 아니라 **구역당 균등 + 소외를 품은 구역만 ×2.5**다(재민: 자잘도 소외에 비교적 많이).
  //     그 표를 그대로 귀무가설로 쓴다 — 안 그러면 **의도한 편중을 뭉침으로 오독**한다.
  //     (실측: 면적 비례 기준 1.72 ✗ → 설계 할당 기준으로는 아래 값. 12개 구역이 44~48,
  //      나머지 108개가 14~24로, 딱 2.5배 — 배치가 표를 정확히 따랐다는 뜻이었다.)
  let QW = null;
  try {
    const q = JSON.parse(fs.readFileSync(__dirname + '/ore-minor-quota.json', 'utf8'));
    if (q && q.zone === ZID && q.gx === GX && q.gy === GY && Array.isArray(q.w)) QW = q.w;
  } catch (e) { }
  const useQuota = QW && /자잘/.test(label);
  const landSum = live.reduce((a, b) => a + landIn[b], 0);
  const qSum = QW ? live.reduce((a, b) => a + QW[b], 0) : 0;
  const Ntot = live.reduce((a, b) => a + cnt[b], 0);
  const lamOf = (b) => useQuota ? Ntot * QW[b] / qSum : Ntot * landIn[b] / landSum;
  let chi2 = 0;
  for (const b of live) { const lam = lamOf(b); if (lam > 0) chi2 += (cnt[b] - lam) * (cnt[b] - lam) / lam; }
  const disp = live.length > 1 ? chi2 / (live.length - 1) : 0;
  const clump = Math.sqrt(disp);
  const cvRand = mean > 0 ? 1 / Math.sqrt(mean) : 0;
  const empty = vals.filter((v) => v === 0).length;
  console.log('  ① 구역 균등도 (' + GX + '×' + GY + ' · 뭍 있는 구역 ' + live.length + '개)');
  console.log('     평균 ' + mean.toFixed(1) + '개/구역 · 표준편차 ' + sd.toFixed(1) + ' · 최대 ' + Math.max(...vals) + ' · 빈 구역 ' + empty + '개');
  console.log('     CV ' + cv.toFixed(3) + ' (뭍면적 보정 전 무작위 기대 ' + cvRand.toFixed(3) + ') · 분산지수 ' + disp.toFixed(2) + ' → **뭉침 지수 ' + clump.toFixed(2) + '** [귀무 ' + (useQuota ? '설계 할당표' : '뭍면적 비례') + ']'
    + (clump < 0.7 ? '  (무작위보다 고르다 ✔)' : clump < 1.3 ? '  (무작위 수준)' : '  (뭉쳤다 ✗)'));

  // ② 최근접 이웃 거리
  const nn = [];
  for (let i = 0; i < list.length; i++) {
    let bd = Infinity;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const dx = (list[i].center[0] - list[j].center[0]) / CELL, dy = (list[i].center[1] - list[j].center[1]) / CELL;
      const dd = Math.hypot(dx, dy); if (dd < bd) bd = dd;
    }
    nn.push(bd);
  }
  nn.sort((a, b) => a - b);
  const nnMean = nn.reduce((a, x) => a + x, 0) / nn.length;
  let landCells = 0; for (let i = 0; i < water.length; i++) if (!water[i]) landCells++;
  const areaCells = landCells * S * S;
  const dens = list.length / areaCells;
  const nnExp = 0.5 / Math.sqrt(dens);
  console.log('  ② 최근접 이웃 거리 — 중앙 ' + nn[nn.length >> 1].toFixed(0) + '셀 · 평균 ' + nnMean.toFixed(0) + ' · 최소 ' + nn[0].toFixed(0) + ' · 최대 ' + nn[nn.length - 1].toFixed(0));
  console.log('     무작위 기대 ' + nnExp.toFixed(0) + '셀 → **R지수 ' + (nnMean / nnExp).toFixed(2) + '**'
    + ((nnMean / nnExp) < 0.9 ? '  (뭉침 ✗)' : (nnMean / nnExp) > 1.15 ? '  (규칙적 — 고르다 ✔)' : '  (무작위 수준)'));

  // ③ 산까지 거리 — 광맥 중심이 바위 안이면 음수로 센다
  const dist = [];
  let inRock = 0;
  for (const o of list) {
    const cx = Math.round(o.center[0] / CELL), cy = Math.round(o.center[1] / CELL);
    const gi = Math.min(gh - 1, (cy / S) | 0) * gw + Math.min(gw - 1, (cx / S) | 0);
    if (rock[gi]) { inRock++; dist.push(0); continue; }
    let best = 999;
    for (let r = 1; r <= 200 && best === 999; r += 2) {
      for (let a = 0; a < 360; a += 10) {
        const x = Math.round(cx + Math.cos(a * Math.PI / 180) * r), y = Math.round(cy + Math.sin(a * Math.PI / 180) * r);
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = Math.min(gh - 1, (y / S) | 0) * gw + Math.min(gw - 1, (x / S) | 0);
        if (rock[j]) { best = r; break; }
      }
    }
    dist.push(best);
  }
  const ds = dist.slice().sort((a, b) => a - b);
  const near = dist.filter((x) => x <= 20).length, far = dist.filter((x) => x >= 100).length;
  console.log('  ③ 산까지 거리 — 중심이 **바위 안** ' + inRock + '개(' + (inRock / list.length * 100).toFixed(0) + '%) · 중앙 ' + ds[ds.length >> 1] + '셀');
  console.log('     20셀 이내(기슭) ' + near + '개(' + (near / list.length * 100).toFixed(0) + '%) · 100셀 밖(산과 무관) ' + far + '개(' + (far / list.length * 100).toFixed(0) + '%)');

  // ④ 마을 접근성
  const vs = terrain.getZoneVillages(ZID) || [];
  const va = [];
  for (const v of vs) {
    let bd = Infinity;
    for (const o of list) { const dd = Math.hypot(v.x - o.center[0], v.y - o.center[1]) / CELL - o.radius / CELL; if (dd < bd) bd = dd; }
    va.push(Math.max(0, bd));
  }
  va.sort((a, b) => a - b);
  console.log('  ④ 마을→가장 가까운 광맥 가장자리: 중앙 ' + va[va.length >> 1].toFixed(0) + '셀 · 최소 ' + va[0].toFixed(0) + ' · 최대 ' + va[va.length - 1].toFixed(0)
    + ' · 150셀(노동권) 안 ' + va.filter((x) => x <= 150).length + '/' + vs.length + '곳\n');
}

report(major, '대·중·소 (NPC 인식)');
report(minor, '자잘 (플레이어 전용)');

// ⑤ p 기울기 — 안쪽일수록 큰가
// ★기하 거리 비율로 재면 안 된다. 경계가 warp 로 왜곡돼 있어서 "중심에서 80% 지점"이
//   어느 방향이냐에 따라 광맥 한복판일 수도 밖일 수도 있다(실측에서 95%가 80%보다 높게 나왔다).
//   실제 falloff 인자인 **d_eff** 로 구간을 나눠야 정확하다. p 는 pk×(1−d_eff)^1.2×노이즈 이므로
//   d_eff 를 역산해 재구성한다: 셀을 전수로 훑어 p>0 인 곳의 (p/pk)^(1/1.2) → 1−d_eff.
console.log('── p 기울기 검증 (안쪽일수록 큰가 · d_eff 기준) ──');
{
  const o = major.find((x) => x.radius >= 100 * CELL) || major[0];
  const R = Math.round(o.radius / CELL), pk = (typeof o.pk === 'number') ? o.pk : 0.33;
  console.log('  ' + o.name + ' (r' + R + '셀, p_peak ' + pk + ')');
  const bins = [0, 0.2, 0.4, 0.6, 0.8, 1.0].slice(0, 5).map(() => ({ n: 0, s: 0 }));
  const RE = Math.ceil(R * 1.6);
  for (let cy = -RE; cy <= RE; cy++) for (let cx = -RE; cx <= RE; cx++) {
    const x = o.center[0] + cx * CELL, y = o.center[1] + cy * CELL;
    const owner = terrain.isOreClusterAt(ZID, x, y);
    if (!owner || owner.name !== o.name) continue;
    const p = terrain.oreProbAt(ZID, x, y); if (!(p > 0)) continue;
    // p = pk·(1−d)^1.2·n , n ∈ [0.5,1.5] 평균 1 → (p/pk)^(1/1.2) 가 (1−d)의 잡음 섞인 추정
    const inner = Math.max(0, Math.min(1, Math.pow(p / pk, 1 / 1.2)));
    const d = 1 - inner;                       // 0=중심 1=경계
    const b = Math.min(4, Math.floor(d * 5));
    bins[b].n++; bins[b].s += p;
  }
  const lab = ['중심 0~20%', '20~40%', '40~60%', '60~80%', '80~100%'];
  const avg = bins.map((b) => b.n ? b.s / b.n : 0);
  for (let i = 0; i < 5; i++) console.log('     ' + lab[i].padEnd(12) + ' 평균 p ' + avg[i].toFixed(4) + ' (셀 ' + bins[i].n + ')');
  let mono = true; for (let i = 1; i < 5; i++) if (avg[i] > avg[i - 1] + 1e-6) mono = false;
  console.log('  → ' + (mono ? '✔ 단조 감소 — 안쪽일수록 p가 크다' : '✗ 단조성 위반'));
  // 실측 최대/최소로도 확인
  let mx = 0, mn = 1;
  for (let cy = -RE; cy <= RE; cy++) for (let cx = -RE; cx <= RE; cx++) {
    const x = o.center[0] + cx * CELL, y = o.center[1] + cy * CELL;
    const ow = terrain.isOreClusterAt(ZID, x, y); if (!ow || ow.name !== o.name) continue;
    const p = terrain.oreProbAt(ZID, x, y); if (p > mx) mx = p; if (p > 0 && p < mn) mn = p;
  }
  console.log('     이 광맥 안 p 범위: ' + mn.toFixed(4) + ' ~ ' + mx.toFixed(4) + ' (p_peak ' + pk + ')');
}
