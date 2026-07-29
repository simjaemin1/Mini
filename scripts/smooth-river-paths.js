#!/usr/bin/env node
// === scripts/smooth-river-paths.js — 경로의 불연속 제거: 꺾임 · 점밀도 · 중복점 ===
//
// ★재민 지적: "설천… 그게 경계강이었던 거지? 두 강을 합친 거잖아? 근데 거기가 **미분불가능하게** 생겼어.
//   애초에 서쪽은 강을 잇는 점들이 빽빽한데 동쪽은 왜 느슨해? 이런 불연속 문제 해결하라고."
//
// 실측(수정 전 한반도):
//   설천 406점 — 최대 꺾임 **90.0°** @(26944,9696) · 점간격 서쪽 평균 74px vs 동쪽 **178px**(2.4배) · 최소 간격 0(중복점)
//   선강  36점 — 최대 꺾임 **135.4°** @(0,62840)
// 원인: 획마다 다른 도구로 그려졌고(사행 생성기 vs 손그림 vs 내 이음매 보간), 이어 붙이면서 그 차이가 그대로 남았다.
// 꺾임은 렌더에서 각진 모서리로, 점밀도 차이는 "한쪽만 부드러운 강"으로 보인다.
//
// 처리(순서 중요):
//   ① 중복·초근접 점 제거        — 간격 0 짜리가 각도 계산을 망가뜨린다
//   ② 호길이 균등 재샘플링(STEP)  — 폭도 호길이로 보간. 이걸 먼저 해야 스무딩이 고르게 먹는다
//   ③ 꺾임 완화                  — 회전각이 MAX_TURN 넘는 점만 이웃 중점 쪽으로 당긴다(반복).
//                                 ★양 끝점은 고정 — 다른 강·호수와의 접합이 끊기면 안 된다.
//
// ★이 스크립트는 지도를 바꾼다. 반드시 뒤에 도달성·다리 검증을 돌릴 것(한반도에서 배운 것:
//   지형을 고치면 통행이 끊긴다).
//
// 실행: node scripts/smooth-river-paths.js [--zone hanbando|all] [--apply] [--step 96] [--turn 25]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZARG = val('--zone', 'hanbando');
const APPLY = has('--apply');
const STEP = parseFloat(val('--step', '96'));      // 3셀 — 게임 판정은 셀 단위라 이보다 촘촘할 이유가 없다
const MAX_TURN = parseFloat(val('--turn', '25'));  // 이보다 꺾이면 완화 대상
const ITERS = parseInt(val('--iters', '12'), 10);
const ALPHA = 0.45;
const EPS = parseFloat(val('--eps', '8'));      // 단순화 허용 오차(px) — 셀 32px의 1/4
const MAXSEG = parseFloat(val('--maxseg', '384')); // 한 구간 최대 길이(px) = 12셀

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const P = (q) => q.pos || [q.x, q.y];
const R = Math.round;
const W = (q) => (q.width != null ? q.width : 200);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function turnAt(p, i) {
  const a = P(p[i - 1]), b = P(p[i]), c = P(p[i + 1]);
  const v1 = [b[0] - a[0], b[1] - a[1]], v2 = [c[0] - b[0], c[1] - b[1]];
  const L1 = Math.hypot(...v1) || 1, L2 = Math.hypot(...v2) || 1;
  return Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (L1 * L2)))) * 180 / Math.PI;
}
function stats(p) {
  const ds = [];
  for (let i = 0; i < p.length - 1; i++) ds.push(dist(P(p[i]), P(p[i + 1])));
  const s = [...ds].sort((a, b) => a - b);
  let mx = 0;
  for (let i = 1; i < p.length - 1; i++) mx = Math.max(mx, turnAt(p, i));
  return { n: p.length, min: s[0] || 0, med: s[(s.length / 2) | 0] || 0, max: s[s.length - 1] || 0, turn: mx };
}

function dedupe(p) {
  const out = [p[0]];
  for (let i = 1; i < p.length; i++) if (dist(P(p[i]), P(out[out.length - 1])) > 1) out.push(p[i]);
  if (out.length < 2) return p;
  return out;
}
function resample(p, step) {
  const cum = [0];
  for (let i = 0; i < p.length - 1; i++) cum.push(cum[i] + dist(P(p[i]), P(p[i + 1])));
  const L = cum[cum.length - 1];
  if (!(L > 0)) return p;
  const n = Math.max(2, Math.round(L / step));
  const out = [];
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const t = L * k / n;
    while (j < cum.length - 2 && cum[j + 1] < t) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const f = Math.max(0, Math.min(1, (t - cum[j]) / seg));
    const a = P(p[j]), b = P(p[j + 1]);
    out.push({ pos: [R(a[0] + (b[0] - a[0]) * f), R(a[1] + (b[1] - a[1]) * f)], width: R(W(p[j]) + (W(p[j + 1]) - W(p[j])) * f) });
  }
  return out;
}
// ★균등 재샘플링만 하면 점이 3배로 불어난다(낙만강 460→1348, 백두대간 460→1473).
//   terrain.js `_isPointInRiver` 는 **셀 하나를 물으면 그 강의 전 구간을 순회**한다 — 점이 늘면
//   래스터화도, **게임 서버 런타임도** 그만큼 느려진다. 그래서 직선 구간의 잉여 점은 도로 걷어낸다.
//   허용 오차 EPS는 셀(32px)의 1/4 — 판정이 바뀌지 않는 선.
function simplify(p, eps) {
  if (p.length < 3) return p;
  const keep = new Uint8Array(p.length); keep[0] = keep[p.length - 1] = 1;
  const stack = [[0, p.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    const a = P(p[s]), b = P(p[e]);
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
    let mi = -1, md = 0;
    for (let i = s + 1; i < e; i++) {
      const q = P(p[i]);
      let t = ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(q[0] - (a[0] + vx * t), q[1] - (a[1] + vy * t));
      // 폭이 크게 다른 점도 지운 셈이 되면 안 된다 — 폭 변화를 거리로 환산해 같이 본다
      const dw = Math.abs(W(p[i]) - (W(p[s]) + (W(p[e]) - W(p[s])) * t)) * 0.5;
      const dd = Math.max(d, dw);
      if (dd > md) { md = dd; mi = i; }
    }
    if (mi > 0 && md > eps) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return p.filter((_, i) => keep[i]);
}
// 단순화만 하면 직선 구간이 통째로 한 구간이 되어 간격이 다시 들쭉날쭉해진다(백두대간 최대 6,238px).
// 재민이 본 "서쪽은 빽빽한데 동쪽은 느슨하다"가 바로 그 모양이다. 그래서 **긴 구간은 다시 쪼갠다**.
// 결과적으로 간격이 [STEP, MAXSEG] 안에 갇힌다 — 점 수는 아끼면서 눈에 띄는 불균일은 사라진다.
function capSegments(p, maxSeg) {
  const out = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const a = P(p[i]), b = P(p[i + 1]);
    const d = dist(a, b);
    const n = Math.ceil(d / maxSeg);
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push({ pos: [R(a[0] + (b[0] - a[0]) * f), R(a[1] + (b[1] - a[1]) * f)], width: R(W(p[i]) + (W(p[i + 1]) - W(p[i])) * f) });
    }
  }
  return out;
}
function relaxCorners(p, maxTurn, iters) {
  for (let it = 0; it < iters; it++) {
    let moved = 0;
    const next = p.map((q) => ({ pos: [P(q)[0], P(q)[1]], width: q.width }));
    for (let i = 1; i < p.length - 1; i++) {
      if (turnAt(p, i) <= maxTurn) continue;             // 꺾인 데만 건드린다 — 강 모양을 뭉개지 않는다
      const a = P(p[i - 1]), b = P(p[i]), c = P(p[i + 1]);
      next[i].pos = [b[0] + ((a[0] + c[0]) / 2 - b[0]) * ALPHA, b[1] + ((a[1] + c[1]) / 2 - b[1]) * ALPHA];
      moved++;
    }
    for (let i = 0; i < p.length; i++) p[i] = { pos: [next[i].pos[0], next[i].pos[1]], width: next[i].width };
    if (!moved) break;
  }
  return p.map((q) => ({ pos: [R(P(q)[0]), R(P(q)[1])], width: R(W(q)) }));
}

// ★폭도 불연속일 수 있다 — 이음매 taper 가 남긴 계단(선천 228→127, 1.8배)이 실제로 남았다.
//   이웃 점 배율이 W_JUMP 를 넘으면 **좁은 쪽을 올려** 편다(넓은 쪽을 줄이면 셀보다 가늘어질 위험).
//   수렴할 때까지 반복 — 한 번만 돌리면 계단이 옆으로 밀릴 뿐이다.
function smoothWidths(p, ratio) {
  for (let it = 0; it < 200; it++) {
    let fixed = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const a = W(p[i]), b = W(p[i + 1]);
      if (a <= 0 || b <= 0) continue;
      if (Math.max(a, b) / Math.min(a, b) <= ratio) continue;
      const want = Math.max(a, b) / ratio;
      if (a < b) p[i].width = R(want); else p[i + 1].width = R(want);
      fixed++;
    }
    if (!fixed) break;
  }
  return p;
}

const zoneIds = ZARG === 'all' ? Object.keys(world).filter((z) => z[0] !== '_') : [ZARG];
console.log('════ 경로 불연속 제거 · ' + zoneIds.join(',') + ' · step ' + STEP + 'px · 꺾임 한계 ' + MAX_TURN + '° ' + (APPLY ? '· 기록' : '· 계산만') + ' ════');
let touched = 0, worstBefore = 0, worstAfter = 0;
const rows = [];
for (const zid of zoneIds) {
  const d = world[zid]; if (!d) continue;
  for (const kind of ['rivers', 'ridges']) {
    for (const f of (d[kind] || [])) {
      if (f._mirroredFrom) continue;
      const p0 = f.path || []; if (p0.length < 3) continue;
      const before = stats(p0);
      let p = dedupe(p0.map((q) => ({ pos: [P(q)[0], P(q)[1]], width: W(q) })));
      p = resample(p, STEP);
      p = relaxCorners(p, MAX_TURN, ITERS);
      p = simplify(p, EPS);
      p = capSegments(p, MAXSEG);
      p = smoothWidths(p, 1.55);
      const after = stats(p);
      worstBefore = Math.max(worstBefore, before.turn); worstAfter = Math.max(worstAfter, after.turn);
      if (before.turn > MAX_TURN || before.max > before.med * 2.5 || before.min < 1) {
        rows.push('  ' + (zid + '/' + f.name).padEnd(22) + '점 ' + String(before.n).padStart(4) + '→' + String(after.n).padStart(4)
          + ' · 간격 ' + R(before.min) + '~' + R(before.max) + '(중앙 ' + R(before.med) + ') → ' + R(after.min) + '~' + R(after.max) + '(중앙 ' + R(after.med) + ')'
          + ' · 최대꺾임 ' + before.turn.toFixed(0) + '° → ' + after.turn.toFixed(0) + '°');
      }
      f.path = p; touched++;
    }
  }
}
rows.slice(0, 24).forEach((r) => console.log(r));
if (rows.length > 24) console.log('  … 외 ' + (rows.length - 24) + '건');
console.log('\n손댄 피처 ' + touched + '개 · 전체 최대 꺾임 ' + worstBefore.toFixed(1) + '° → ' + worstAfter.toFixed(1) + '°');

if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('★기록: ' + GAME + ' (백업 .bak)  — ★도달성·다리 검증을 반드시 이어서 돌릴 것');
} else console.log('계산만 — 기록하려면 --apply');
