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

// ── ④ 단조 폭 — 상류에서 하구로 갈수록 굵어져야 한다 ──────────────────────
// ★재민 지적: "선천 다시 엄밀하게 봐. 어디가 상류야? 상류→하류 굵어져야 해."
//   실측: 선천은 양 끝이 133(상류) / 371(하구)로 맞는데 **중간이 475로 불룩**했다(감소 구간 8개).
//   병합 이음매 taper 가 접합부를 두 획 중 넓은 쪽에 맞추면서 강 한복판에 봉우리를 만든 것이다.
//   ⇒ 하구 방향으로 **단조 비감소**가 되도록 폭을 고친다. 최소제곱 의미로 원본에 가장 가까운
//     단조 수열을 구하는 방법이 PAVA(pool-adjacent-violators)다 — 임의로 깎지 않고 봉우리만 눌린다.
function pava(vals) {                      // 비감소 등장회귀
  const v = vals.slice(), wgt = vals.map(() => 1);
  const stackV = [], stackW = [];
  for (let i = 0; i < v.length; i++) {
    let cv = v[i], cw = wgt[i];
    while (stackV.length && stackV[stackV.length - 1] > cv) {
      const pv = stackV.pop(), pw = stackW.pop();
      cv = (pv * pw + cv * cw) / (pw + cw); cw += pw;
    }
    stackV.push(cv); stackW.push(cw);
  }
  const out = [];
  for (let i = 0; i < stackV.length; i++) for (let k = 0; k < stackW[i]; k++) out.push(stackV[i]);
  return out;
}
console.log('\n[4/5] 단조 폭 — 상류→하구로 갈수록 굵어지게(PAVA 등장회귀)');
let monoFixed = 0;
for (const rv of rivers()) {
  const p = rv.path;
  const s = endInfo(rv, 0), e = endInfo(rv, 1);
  const wetS = s.edge || s.surf <= WET * CELL, wetE = e.edge || e.surf <= WET * CELL;
  let mouthEnd;                                   // 1 = 끝이 하구, 0 = 시작이 하구
  if (wetS && !wetE) mouthEnd = 0;
  else if (wetE && !wetS) mouthEnd = 1;
  else if (wetS && wetE) {
    // ★양끝이 다 물에 닿으면 그건 두 물줄기를 잇는 **분류(分流)**다 — 흐름 방향이 하나로 정해지지 않는다.
    //   여기에 단조를 강요하면 강이 통째로 눌린다(옥계천: 양끝 120인데 중간 봉우리를 다 깎아 평평해졌다).
    //   폭 차이가 뚜렷할 때(1.3배 초과)만 넓은 쪽을 하구로 보고, 아니면 손대지 않는다.
    const hi = Math.max(s.w, e.w), lo = Math.min(s.w, e.w);
    if (!(lo > 0 && hi / lo > 1.3)) continue;
    mouthEnd = (e.w >= s.w) ? 1 : 0;
  }
  else continue;                                            // 양끝 고립 — 방향을 못 정한다
  const ws = p.map((q) => wOf(q, rv));
  const seq = mouthEnd ? ws : ws.slice().reverse();          // 상류 → 하구 순서
  let dec = 0; for (let i = 0; i < seq.length - 1; i++) if (seq[i + 1] < seq[i] - 0.5) dec++;
  if (!dec) continue;
  const fixedSeq = pava(seq);
  const back = mouthEnd ? fixedSeq : fixedSeq.slice().reverse();
  let maxDelta = 0;
  for (let i = 0; i < p.length; i++) { maxDelta = Math.max(maxDelta, Math.abs(back[i] - ws[i])); p[i].width = R(back[i]); }
  monoFixed++;
  console.log('  ↗ ' + rv.name.padEnd(8) + ' 하구=' + (mouthEnd ? '끝' : '시작')
    + ' · 감소 구간 ' + dec + '개 · 최대 보정 ' + R(maxDelta) + 'px'
    + '  (상류 w' + R(seq[0]) + ' → 하구 w' + R(seq[seq.length - 1]) + ')');
}
console.log('  단조화한 강 ' + monoFixed + '개');

// ── ⑤ 합류부 — 지류 하구는 본류보다 좁아야 한다(단조 유지) ─────────────────
// ★순서를 ④ 뒤로 옮겼다. 앞에 두면 ④ 단조화가 하구를 도로 올려 [B] 합류 폭 역전이 되살아난다
//   (실측: 3건 → 7건). 그리고 국소 blend 로 하구만 눌러도 단조가 깨진다.
//   ⇒ 발원지 폭을 고정한 채 **프로파일 전체를 아핀 스케일**한다 — 단조는 그대로 보존되고 하구만 맞는다.
//   연쇄 축소를 막으려고 **본류가 굵은 순서로 한 번만** 돈다.
console.log('\n[5/5] 합류부 — 지류 하구를 본류 폭 ' + (CLAMP * 100) + '% 이하로(단조 보존 아핀 스케일)');
let smoothed = 0;
{
  const jobs = [];
  for (const rv of rivers()) for (const which of [0, 1]) {
    const e = endInfo(rv, which);
    if (e.edge || !e.near || e.near.surf > WET * CELL || !e.near.rv) continue;
    if (!(e.w > e.near.w * CLAMP)) continue;
    jobs.push({ rv, which, hostW: e.near.w, host: e.near.rv.name, w: e.w });
  }
  jobs.sort((x, y) => y.hostW - x.hostW);
  for (const j of jobs) {
    const p = j.rv.path, iH = j.which ? 0 : p.length - 1;
    const wHead = wOf(p[iH], j.rv), wMouth = wOf(p[j.which ? p.length - 1 : 0], j.rv);
    const target = Math.max(j.hostW * CLAMP, wHead);
    if (Math.abs(wMouth - target) <= Math.max(4, target * 0.02)) continue;
    const den = wMouth - wHead;
    if (Math.abs(den) < 1e-6) continue;
    const k = (target - wHead) / den;
    if (!(k > 0)) continue;
    for (let i = 0; i < p.length; i++) p[i].width = R(Math.max(CELL, wHead + (wOf(p[i], j.rv) - wHead) * k));
    smoothed++;
    console.log('  ~ ' + j.rv.name.padEnd(8) + '[' + (j.which ? '끝' : '시작') + '] 하구 w' + R(wMouth) + ' → ' + R(target)
      + '  (본류 ' + j.host + ' w' + R(j.hostW) + ') · 프로파일 x' + k.toFixed(2));
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
