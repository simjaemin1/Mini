#!/usr/bin/env node
// === scripts/fix-river-flow.js — 물길을 물길답게: 끊긴 접합 잇기 · 폭 방향 바로잡기 · 합류부 스무딩 ===
//
// ★재민 지적(11차): "막다른 하구는 오류인 것 같다. 거기가 오히려 **상류**여야 할 것 같다.
//   그리고 여전히 두 강이 만나는데 끊겨 있는 곳이 존재한다. 옥계천이 만나는 곳도 어색하다."
//   → 전수 실측으로 셋 다 확인됐다.
//
// ① 폭 방향이 거꾸로 매겨진 강 — 빌더가 획마다 '발원지→하구' 램프를 임의 방향으로 매겼다.
//    그래서 **아무 데도 닿지 않는 끝이 가장 넓고**(하구인 척), 실제로 큰 강·호수·바다에 닿는 끝이
//    가장 좁았다. 물이 벌판 한복판에서 솟아 큰 강으로 가늘게 흘러드는 그림이다.
//    고침: 경로는 그대로 두고 **폭 수열만 뒤집는다**(가역·기하 무변).
// ② 두 강이 만나야 하는데 수십 셀 벌어져 끊긴 곳 — 실측 2건(청풍천↔옥계천 36셀, 금강천↔청송천 35셀).
//    고침: 막다른 끝에서 상대 강 표면까지 **경로를 연장**해 실제로 닿게 한다.
// ③ 합류부가 계단 — 지류 하구가 본류보다 넓거나 폭이 뚝 끊긴다.
//    고침: 지류 하구를 본류 폭의 CLAMP 이하로 맞추고 TAPER 점에 걸쳐 되돌린다.
//
// 순서가 중요하다: **잇고 → 다시 재고 → 뒤집고 → 스무딩**. 먼저 이어야 "막다른 끝"이 정확히 가려진다.
//
// 실행: node scripts/fix-river-flow.js [--apply] [--join 45] [--zone hanbando]
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const APPLY = has('--apply');
const JOIN_CELLS = parseFloat(val('--join', '45'));
const CELL = 32;
// 표면거리 이 셀 이하면 "닿았다". 호수는 타원 근사라 1.6셀로 "닿음"이라 해도 실셀로는 2칸이 마를 수 있다
// (선천↔율호가 그랬다) — 그래서 기본을 0.4셀로 조인다.
const WET = parseFloat(val('--wet', '0.4'));
const CLAMP = 0.95;   // 지류 하구는 본류 폭의 이 비율까지
const TAPER = 8;

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const d = world[ZID];
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
const Z = ZONES[ZID] || {};
const Pt = (p) => p.pos ? p.pos : [p.x, p.y];
const wOf = (p, rv) => (p.width != null) ? p.width : (rv.width || 200);
const R = Math.round;
const rivers = () => (d.rivers || []).filter((r) => !r._mirroredFrom && (r.path || []).length >= 2);

// 점 → 강 표면 최단(음수=안쪽) + 그 자리 폭 + 붙을 좌표
function nearest(x, y, skip) {
  let best = null;
  for (const rv of rivers()) {
    if (rv === skip) continue;
    const p = rv.path;
    for (let i = 0; i < p.length - 1; i++) {
      const a = Pt(p[i]), b = Pt(p[i + 1]);
      const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy || 1;
      let t = ((x - a[0]) * vx + (y - a[1]) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const w = wOf(p[i], rv) + (wOf(p[i + 1], rv) - wOf(p[i], rv)) * t;
      const px = a[0] + vx * t, py = a[1] + vy * t;
      const surf = Math.hypot(x - px, y - py) - w / 2;
      if (!best || surf < best.surf) best = { surf, w, at: [px, py], rv, i };
    }
  }
  for (const lk of (d.lakes || [])) {
    const c = lk.center; if (!c) continue;
    const rx = lk.rx || lk.radius || 0, ry = lk.ry || lk.radius || 0; if (!rx || !ry) continue;
    const k = Math.hypot((x - c[0]) / rx, (y - c[1]) / ry) || 1;
    const surf = (k - 1) * Math.min(rx, ry);
    if (!best || surf < best.surf) best = { surf, w: 0, at: [c[0] + (x - c[0]) / k, c[1] + (y - c[1]) / k], rv: null, lake: lk };
  }
  return best;
}
// ★'존 경계 = 바다행이니 건드리지 말 것' 여백. 처음엔 2500px(78셀)로 뒀는데 너무 넉넉해서,
//   실제로는 내륙인 끝까지 바다행으로 오인해 건너뛰었다(백림천 끝은 아래 경계에서 2,368px인데 넘어갔다).
const EDGE_PX = parseFloat(val('--edge', '1200'));
const atEdge = (a) => a[0] < EDGE_PX || a[1] < EDGE_PX || a[0] > Z.zoneWidth - EDGE_PX || a[1] > Z.zoneHeight - EDGE_PX;
function endInfo(rv, which) {
  const p = rv.path, i = which ? p.length - 1 : 0;
  const at = Pt(p[i]);
  const n = nearest(at[0], at[1], rv);
  return { at, w: wOf(p[i], rv), edge: atEdge(at), surf: n ? n.surf : Infinity, near: n };
}

console.log('════ 물길 정합 · ' + ZID + (APPLY ? ' · 기록' : ' · 계산만') + ' ════');

// ── ① 끊긴 접합 잇기 ───────────────────────────────────────────────────────
console.log('\n[1/3] 끊긴 접합 잇기 (막다른 끝 ↔ 다른 강 표면 ≤ ' + JOIN_CELLS + '셀)');
let joined = 0;
for (const rv of rivers()) {
  for (const which of [0, 1]) {
    const e = endInfo(rv, which);
    if (e.edge || e.surf <= WET * CELL) continue;            // 바다행이거나 이미 닿음
    if (!e.near || e.near.surf > JOIN_CELLS * CELL) continue; // 너무 멀다 — 이건 다른 문제
    const tgt = e.near.at;
    // 끝점 → 목표 표면까지 몇 점으로 나눠 잇는다(급커브 방지)
    const steps = Math.max(2, Math.round(e.near.surf / (6 * CELL)));
    const add = [];
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      add.push({ pos: [R(e.at[0] + (tgt[0] - e.at[0]) * f), R(e.at[1] + (tgt[1] - e.at[1]) * f)], width: R(e.w) });
    }
    if (which) rv.path = rv.path.concat(add);
    else rv.path = add.reverse().concat(rv.path);
    joined++;
    console.log('  ✔ ' + rv.name + '[' + (which ? '끝' : '시작') + ' w' + R(e.w) + '] → '
      + (e.near.lake ? '호수 ' + e.near.lake.name : e.near.rv.name) + ' 까지 '
      + (e.near.surf / CELL).toFixed(1) + '셀 연장(' + steps + '점)');
  }
}
if (!joined) console.log('  이을 것 없음');

// ── ② 폭 방향 바로잡기 ─────────────────────────────────────────────────────
console.log('\n[2/3] 폭 방향 — 막다른(=상류) 쪽이 넓으면 폭 수열을 뒤집는다');
let flipped = 0, stillIsolated = [];
for (const rv of rivers()) {
  const s = endInfo(rv, 0), e = endInfo(rv, 1);
  const wetS = s.edge || s.surf <= WET * CELL, wetE = e.edge || e.surf <= WET * CELL;
  if (wetS && wetE) continue;                       // 양끝 연결 — 방향을 단정할 수 없다, 손대지 않음
  if (!wetS && !wetE) { stillIsolated.push(rv.name); continue; }
  // 미세한 차이는 건드리지 않는다 — 선강처럼 1804↔1762(2%)는 방향이 아니라 잡음이다
  const dryW = wetE ? s.w : e.w, wetW = wetE ? e.w : s.w;
  if (!(dryW > wetW * 1.2)) continue;
  const ws = rv.path.map((p) => wOf(p, rv)).reverse();
  rv.path.forEach((p, i) => { p.width = R(ws[i]); });
  flipped++;
  console.log('  ⟲ ' + rv.name.padEnd(8) + ' 막다른 쪽 w' + R(wetE ? s.w : e.w) + ' ↔ 연결 쪽 w' + R(wetE ? e.w : s.w) + '  → 뒤집음');
}
console.log('  뒤집은 강 ' + flipped + '개' + (stillIsolated.length ? ' · ★양끝 고립(손 못 댐) ' + stillIsolated.length + '개: ' + stillIsolated.join(', ') : ''));

// ── ③ 합류부 스무딩 ────────────────────────────────────────────────────────
console.log('\n[3/3] 합류부 — 지류 하구를 본류 폭 ' + (CLAMP * 100) + '% 이하로, 경로 25%에 걸쳐 코사인 블렌드');
let smoothed = 0;
// ★두 가지 함정을 피해야 한다
//   ⓐ 짧은 taper(앞 8점만) → 그 뒤에서 원래 폭으로 되튀어 **새 계단**이 생긴다.
//   ⓑ 프로파일 전체 아핀 재조정 → 본류가 먼저 줄면 지류가 그 줄어든 값을 다시 읽어 **연쇄 축소**된다
//      (실측: 학천이 ×0.05까지 쪼그라들어 강이 통째로 실개천이 됐다).
//   ⇒ 하구에서 경로의 25%(최소 TAPER)에 걸쳐 **코사인 블렌드**로 되돌린다. 길게 펴니
//     이웃 점 배율이 1.6을 넘지 않아 [A] 급변이 새로 생기지 않는다(감사로 확인).
for (const rv of rivers()) {
  for (const which of [0, 1]) {
    const p = rv.path, iH = which ? 0 : p.length - 1;
    const e = endInfo(rv, which);
    if (e.edge || !e.near || e.near.surf > WET * CELL || !e.near.rv) continue;  // 합류부만
    const hostW = e.near.w;
    if (!(e.w > hostW * CLAMP)) continue;
    const wHead = wOf(p[iH], rv);
    const target = Math.max(hostW * CLAMP, wHead);        // 발원지보다 좁아지진 않는다
    // ★멱등 보장 — 이미 맞춰진 하구를 또 줄이면, 본류가 줄고 그걸 읽은 지류가 또 줄어
    //   **다시 돌릴 때마다 강이 조금씩 마르는** 연쇄가 생긴다. 2% 안이면 손대지 않는다.
    if (Math.abs(e.w - target) <= Math.max(4, target * 0.02)) continue;
    const span = Math.max(TAPER, Math.floor(p.length * 0.25));
    for (let k = 0; k <= span; k++) {
      const idx = which ? (p.length - 1 - k) : k;
      if (idx < 0 || idx >= p.length) break;
      const f = 0.5 * (1 + Math.cos(Math.PI * k / span));  // k=0 → 1, k=span → 0
      const orig = wOf(p[idx], rv);
      p[idx].width = R(Math.max(CELL, orig + (target - orig) * f));
    }
    smoothed++;
    console.log('  ~ ' + rv.name.padEnd(8) + '[' + (which ? '끝' : '시작') + '] 하구 w' + R(e.w) + ' → ' + R(target)
      + '  (본류 ' + e.near.rv.name + ' w' + R(hostW) + ') · ' + span + '점 코사인 블렌드');
  }
}
console.log('  스무딩 ' + smoothed + '건');

if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('\n★기록: ' + GAME + '  (백업 .bak)');
} else {
  fs.writeFileSync('/tmp/flowfix-terrain.json', JSON.stringify(world));
  console.log('\n계산만 — /tmp/flowfix-terrain.json. 기록하려면 --apply');
}
