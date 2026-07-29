#!/usr/bin/env node
// === scripts/merge-split-rivers.js — 나눠 그은 획을 한 줄기 강으로 잇는다 ===
//
// ★재민 증언(11차): "맵 에디터에서 강 하나를 한붓그리기로 그리기 어려워서 나눠서 그린 건데,
//   이전 세션에서 그걸 별개의 강으로 보고 나누느라 하류·상류가 끊긴 것 같다."
//   → 맞다. 실측으로 확인된 증상은 **폭이 획마다 따로 매겨진 것**이다.
//     빌더가 획 하나하나를 독립된 강으로 보고 각자 '발원지→하구' 폭 램프를 다시 시작했다.
//     그래서 이어 그은 자리에서 120px ↔ 476px 처럼 **3.97배 계단**이 생겼다(audit-terrain-quality [C]).
//   또 하나 방증: design-region.js 는 청류대천에 `_connect: '청계천(N) 연장'` 이라고 적어 뒀다 —
//   애초에 "이어지는 획"이라고 표시돼 있었는데 빌드가 그걸 흘렸다.
//
// ★이음매만 고르는 기준(진짜 지류를 잘못 잇지 않기 위해)
//   지류는 본류의 **경로 중간**에 붙는다. 나눠 그은 획은 **끝점끼리** 붙는다.
//   그래서 "서로 다른 강의 끝점 두 개가 폭 안쪽(또는 SEAM_CELLS 이내)에서 만나는 자리"만 이음매로 본다.
//   한 끝점이 이음매 두 개에 걸리면(=삼거리) 잇지 않는다 — 그건 합류지 이어 그은 획이 아니다.
//
// ★폭 처리 (기본은 보수적)
//   기본: 이음매 양쪽 폭을 **넓은 쪽으로 맞추고** 앞뒤 TAPER 점에 걸쳐 완만히 되돌린다.
//         (좁은 쪽을 넓힌다 — 넓은 쪽을 줄이면 강이 셀보다 가늘어져 래스터에서 끊길 수 있다)
//   --reramp: 이은 전체 경로의 폭을 하구 쪽으로 **단조 증가**하도록 다시 매긴다(지도가 크게 바뀐다).
//
// 실행:
//   node scripts/merge-split-rivers.js                 # 계산만(무엇을 이을지 보고)
//   node scripts/merge-split-rivers.js --apply         # server/hanbando-terrain.json 에 기록(.bak)
//   node scripts/merge-split-rivers.js --rename        # 산맥·강 지명을 v2 실제 지명으로 개명
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'hanbando');
const APPLY = has('--apply');
const RERAMP = has('--reramp');
const RENAME = has('--rename');
const SEAM_CELLS = parseFloat(val('--seam', '20'));
const TAPER = 6;
const CELL = 32;

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const d = world[ZID];
if (!d) { console.error('존 없음: ' + ZID); process.exit(2); }
const ZONES = require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES;
const Z = ZONES[ZID] || {};

const Pt = (p) => p.pos ? p.pos : [p.x, p.y];
const wOf = (p, rv) => (p.width != null) ? p.width : (rv.width || 200);
const R = Math.round;
const setW = (p, w) => { p.width = R(w); };

// ── 이음매 찾기 ────────────────────────────────────────────────────────────
const rivers = (d.rivers || []).filter((r) => !r._mirroredFrom && (r.path || []).length >= 2);
const inZone = (a) => a[0] >= 0 && a[1] >= 0 && (!Z.zoneWidth || a[0] <= Z.zoneWidth) && (!Z.zoneHeight || a[1] <= Z.zoneHeight);
const ends = [];
rivers.forEach((rv, ri) => {
  const p = rv.path;
  ends.push({ ri, rv, end: 0, at: Pt(p[0]), w: wOf(p[0], rv) });
  ends.push({ ri, rv, end: 1, at: Pt(p[p.length - 1]), w: wOf(p[p.length - 1], rv) });
});
const seams = [];
for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
  const a = ends[i], b = ends[j];
  if (a.ri === b.ri) continue;
  const dist = Math.hypot(a.at[0] - b.at[0], a.at[1] - b.at[1]);
  const thr = Math.max(Math.max(a.w, b.w) * 1.2, 0);
  if (dist > Math.max(thr, SEAM_CELLS * CELL)) continue;
  // ★존 밖 이음매는 건너뛴다 — 경계 미러링 산물이라 이어 그은 획이 아니다
  if (!inZone(a.at) || !inZone(b.at)) continue;
  seams.push({ a, b, dist, ratio: Math.max(a.w, b.w) / Math.min(a.w, b.w) });
}
// 한 끝점이 이음매 둘에 걸리면(삼거리) 전부 버린다 — 합류지 이어 그은 획이 아니다
const useCount = new Map();
const key = (e) => e.ri + ':' + e.end;
for (const s of seams) { useCount.set(key(s.a), (useCount.get(key(s.a)) || 0) + 1); useCount.set(key(s.b), (useCount.get(key(s.b)) || 0) + 1); }
// ★고리(loop) 배제 — 실화면 확인으로 드러난 함정.
//   월성천 ↔ 아카가와는 끝점이 3셀로 붙어 있어 "이어 그은 획"처럼 보였지만, 실제로는 **한 점에서 갈라져
//   서로 다른 물길로 돌다가 반대쪽에서 다시 만나는 고리**였다(반대쪽 끝도 34셀 거리). 이걸 이으면
//   강이 스스로를 되짚는 괴물이 된다. 두 획의 **반대쪽 끝끼리도 가까우면** 고리로 보고 버린다.
const LOOP_CELLS = 60;
const farEnd = (e) => {
  const p = e.rv.path;
  return e.end ? Pt(p[0]) : Pt(p[p.length - 1]);
};
const good = seams.filter((s) => {
  if (useCount.get(key(s.a)) !== 1 || useCount.get(key(s.b)) !== 1) { s._why = '삼거리(합류)'; return false; }
  const fa = farEnd(s.a), fb = farEnd(s.b);
  const dFar = Math.hypot(fa[0] - fb[0], fa[1] - fb[1]);
  if (dFar < LOOP_CELLS * CELL) { s._why = '고리 — 반대쪽 끝도 ' + (dFar / CELL).toFixed(0) + '셀'; return false; }
  return true;
});

console.log('=== 나눠 그은 획 잇기 · ' + ZID + ' ===');
console.log('강 ' + rivers.length + '개 · 끝점 접촉 ' + seams.length + '건 → 이음매로 채택 ' + good.length + '건'
  + (seams.length - good.length ? ' (삼거리·존밖 ' + (seams.length - good.length) + '건 제외)' : ''));
for (const s of seams) {
  const ok = good.includes(s);
  console.log('  ' + (ok ? '✔' : '✘') + ' ' + s.a.rv.name + '[' + (s.a.end ? '끝' : '시작') + ' w' + R(s.a.w) + ']'
    + ' ↔ ' + s.b.rv.name + '[' + (s.b.end ? '끝' : '시작') + ' w' + R(s.b.w) + ']'
    + '  간격 ' + (s.dist / CELL).toFixed(1) + '셀 · 폭차 ' + s.ratio.toFixed(2) + '배'
    + (ok ? '' : '  ← ' + (s._why || '존 밖(경계 미러)')));
}
if (!good.length) { console.log('\n이을 것 없음.'); if (!RENAME) process.exit(0); }

// ── 사슬 구성 ──────────────────────────────────────────────────────────────
const adj = new Map();   // ri -> [{other, aEnd, bEnd}]
for (const s of good) {
  if (!adj.has(s.a.ri)) adj.set(s.a.ri, []);
  if (!adj.has(s.b.ri)) adj.set(s.b.ri, []);
  adj.get(s.a.ri).push({ other: s.b.ri, myEnd: s.a.end, itsEnd: s.b.end });
  adj.get(s.b.ri).push({ other: s.a.ri, myEnd: s.b.end, itsEnd: s.a.end });
}
const seenR = new Set(), chains = [];
for (const ri of adj.keys()) {
  if (seenR.has(ri)) continue;
  // 사슬 한쪽 끝(연결 1개)에서 출발
  let start = ri, guard = 0;
  while ((adj.get(start) || []).length > 1 && guard++ < 100) {
    const nx = adj.get(start).find((e) => !seenR.has(e.other));
    if (!nx) break; seenR.add(start); start = nx.other;
  }
  seenR.clear();
  const chain = [], visited = new Set();
  let cur = start, prev = -1;
  while (cur != null && !visited.has(cur)) {
    visited.add(cur); chain.push(cur);
    const nx = (adj.get(cur) || []).find((e) => e.other !== prev && !visited.has(e.other));
    prev = cur; cur = nx ? nx.other : null;
  }
  chain.forEach((c) => seenR.add(c));
  if (chain.length > 1) chains.push(chain);
}

// ── 잇기 ───────────────────────────────────────────────────────────────────
const merged = [];
for (const chain of chains) {
  // 경로를 방향 맞춰 이어 붙인다
  let pathOut = null, names = [], lens = [];
  for (const ri of chain) {
    const rv = rivers[ri];
    let p = rv.path.slice();
    names.push(rv.name);
    let L = 0; for (let i = 0; i < p.length - 1; i++) L += Math.hypot(Pt(p[i + 1])[0] - Pt(p[i])[0], Pt(p[i + 1])[1] - Pt(p[i])[1]);
    lens.push(L);
    if (!pathOut) { pathOut = p; continue; }
    const tail = Pt(pathOut[pathOut.length - 1]);
    const dS = Math.hypot(Pt(p[0])[0] - tail[0], Pt(p[0])[1] - tail[1]);
    const dE = Math.hypot(Pt(p[p.length - 1])[0] - tail[0], Pt(p[p.length - 1])[1] - tail[1]);
    if (dE < dS) p = p.slice().reverse();
    // 이음매의 겹치는 첫 점은 버린다(같은 자리 두 점 = 렌더 이음매 얼룩)
    pathOut = pathOut.concat(p.slice(1));
  }
  // 대표 이름 = 가장 긴 획
  const mainIdx = lens.indexOf(Math.max(...lens));
  merged.push({ chain, name: names[mainIdx], names, path: pathOut, lens });
}

console.log('\n사슬 ' + merged.length + '개');
const seamIdx = [];
for (const m of merged) {
  // 이음매 지점 인덱스 = 각 획의 누적 길이 경계
  let acc = 0; const idxs = [];
  for (let k = 0; k < m.chain.length - 1; k++) { acc += rivers[m.chain[k]].path.length - (k ? 1 : 0); idxs.push(acc - 1); }
  seamIdx.push(idxs);
  console.log('  ' + m.names.join(' + ') + '  →  「' + m.name + '」  점 ' + m.path.length + '개 · 획 ' + m.chain.length + '개');
}

// ── 폭 처리 ────────────────────────────────────────────────────────────────
let widthEdits = 0;
merged.forEach((m, mi) => {
  const p = m.path;
  const fake = { width: 200 };
  if (RERAMP) {
    // 하구(넓은 끝)를 향해 단조 증가하도록 전체 재램프
    const w0 = wOf(p[0], fake), w1 = wOf(p[p.length - 1], fake);
    const lo = Math.min(w0, w1), hi = Math.max(w0, w1), up = (w1 >= w0);
    let L = 0; const cum = [0];
    for (let i = 0; i < p.length - 1; i++) { L += Math.hypot(Pt(p[i + 1])[0] - Pt(p[i])[0], Pt(p[i + 1])[1] - Pt(p[i])[1]); cum.push(L); }
    for (let i = 0; i < p.length; i++) { const f = L ? cum[i] / L : 0; setW(p[i], up ? lo + (hi - lo) * f : hi - (hi - lo) * f); widthEdits++; }
  } else {
    // 이음매만 — 좁은 쪽을 넓은 쪽에 맞추고 앞뒤 TAPER 점에 걸쳐 되돌린다
    for (const si of seamIdx[mi]) {
      const a = p[si], b = p[si + 1]; if (!a || !b) continue;
      const wa = wOf(a, fake), wb = wOf(b, fake), target = Math.max(wa, wb);
      for (let k = 0; k <= TAPER; k++) {
        const f = k / (TAPER + 1);
        const iL = si - k, iR = si + 1 + k;
        if (iL >= 0) { const orig = wOf(p[iL], fake); setW(p[iL], orig + (target - orig) * (1 - f)); widthEdits++; }
        if (iR < p.length) { const orig = wOf(p[iR], fake); setW(p[iR], orig + (target - orig) * (1 - f)); widthEdits++; }
      }
    }
  }
});
console.log('  폭 조정 점 ' + widthEdits + '개' + (RERAMP ? ' (전체 재램프)' : ' (이음매 ±' + TAPER + '점만)'));

// ── 지형 객체 갱신 ─────────────────────────────────────────────────────────
const drop = new Set();
for (const m of merged) for (const ri of m.chain) drop.add(rivers[ri]);
const kept = (d.rivers || []).filter((r) => !drop.has(r));
for (const m of merged) {
  const base = rivers[m.chain[0]];
  kept.push({ name: m.name, path: m.path, mergedFrom: m.names, altName: base.altName });
}
d.rivers = kept;
console.log('  강 ' + (rivers.length) + '(본) → ' + kept.filter((r) => !r._mirroredFrom).length + '(본)');

// ── 개명 ───────────────────────────────────────────────────────────────────
if (RENAME) {
  // v2 실제 지명(altName)이 붙어 있는 것들을 실제 이름으로 승격. 코드 참조 없음은 사전 확인함
  //   (grep: 런타임 코드에 하드코딩 참조 0 — 생성기 스크립트 주석뿐)
  let n = 0;
  for (const zid of Object.keys(world)) {
    for (const kind of ['rivers', 'ridges']) {
      for (const f of (world[zid][kind] || [])) {
        if (!f.altName || f.altName === f.name) continue;
        console.log('  개명 ' + zid + '/' + kind + ' 「' + f.name + '」 → 「' + f.altName + '」');
        f.procName = f.name; f.name = f.altName; delete f.altName; n++;
      }
    }
  }
  console.log('\n개명 ' + n + '건 (원래 절차명은 procName 으로 보존 — 되돌릴 수 있다)');
}

if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('\n★기록: ' + GAME + '  (백업 .bak)');
} else {
  fs.writeFileSync('/tmp/merged-terrain.json', JSON.stringify(world));
  console.log('\n계산만 — /tmp/merged-terrain.json 에 결과만 뒀다. 기록하려면 --apply');
}
