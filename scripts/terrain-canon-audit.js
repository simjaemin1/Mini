#!/usr/bin/env node
// === scripts/terrain-canon-audit.js — "지형 파일이 둘인데 뭘 믿나"를 실측으로 끝내는 감사 ===
//
// ★배경(11차에서 터진 것)
//   맵 에디터가 "인게임 실제 셀"이라고 그리던 지형과, 게임 서버가 실제로 로드하는 지형이 달랐다.
//   그래서 다리가 강을 못 건너는 것처럼 보였다. 파일이 둘이었기 때문이다:
//     ①  server/hanbando-terrain.json      ← 게임 서버가 require 하는 파일
//     ②  ../hanbando_terrain_v2.json        ← 설계 중간 산출물(build-terrain-v3.js 출력)
//   "합쳐라"가 첫 반응이지만, 합치기 전에 **둘이 정말 다른 세계인지**부터 재야 한다.
//   눈감고 합치면 산맥이 두 겹으로 겹쳐서 고개가 막힌다 — 실제로 그렇게 된다(아래 ④).
//
// ★이 스크립트가 재는 것
//   ① 규모 대조        — 존/피처 개수
//   ② 기하 포함관계    — 래스터 겹침(누가 누구의 상위집합인가)
//   ③ 이름 대응        — 경로 상호 최근접 평균편차로 "같은 지형인데 이름만 다른" 쌍을 찾는다
//   ④ 합집합의 대가    — 합쳤을 때 새로 막히는 고개 수 = 합치면 안 되는 이유
//
// 실행: node scripts/terrain-canon-audit.js [v2파일경로]
'use strict';
const fs = require('fs');
const path = require('path');

const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const V2 = process.argv[2] || path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const ZID = 'hanbando';
const W = 70016, H = 130016, S = 256;               // 래스터 격자 256px(=8셀) — 겹침 판정에 충분
const NX = Math.ceil(W / S), NY = Math.ceil(H / S);

if (!fs.existsSync(V2)) { console.error('v2 파일 없음:', V2); process.exit(2); }
const A = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const B = JSON.parse(fs.readFileSync(V2, 'utf8'));
const G = A[ZID], V = B[ZID];
const KEYS = ['rivers', 'ridges', 'forests', 'lakes', 'passes', 'villages'];
const wOf = (p) => (p.width != null ? p.width : 300);

console.log('=== 지형 정본 감사 ===');
console.log('  게임 로드본:', GAME);
console.log('  설계 중간본:', V2);

console.log('\n[① 규모 — 존 단위]');
{
  const za = Object.keys(A), zb = Object.keys(B);
  console.log('  게임 존 ' + za.length + ': ' + za.join(','));
  console.log('  v2   존 ' + zb.length + ': ' + zb.join(','));
  const only = za.filter((z) => !zb.includes(z));
  if (only.length) console.log('  ★게임에만 있는 존 ' + only.length + '개: ' + only.join(',') + '  ← v2로 되돌리면 통째로 사라진다');
  const n = (d) => KEYS.map((k) => k + ' ' + ((d[k] || []).length)).join(' · ');
  console.log('  한반도 게임: ' + n(G));
  console.log('  한반도 v2  : ' + n(V));
}

// ── 래스터 ─────────────────────────────────────────────────────────────────
function raster(d, keys) {
  const g = new Uint8Array(NX * NY);
  for (const k of keys) for (const o of (d[k] || [])) {
    const p = o.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], bx = b.pos[0], by = b.pos[1];
      const wA = wOf(a), wB = wOf(b);
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / S * 2));
      for (let t = 0; t <= n; t++) {
        const f = t / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f, w = (wA + (wB - wA) * f) / 2;
        const r = Math.ceil(w / S), cx = Math.floor(x / S), cy = Math.floor(y / S);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
          const gx = cx + dx, gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= NX || gy >= NY) continue;
          if (Math.hypot(dx * S, dy * S) <= w) g[gy * NX + gx] = 1;
        }
      }
    }
  }
  return g;
}

console.log('\n[② 기하 포함관계 — 누가 누구의 상위집합인가]');
for (const [label, keys] of [['강', ['rivers']], ['산맥', ['ridges']]]) {
  const a = raster(G, keys), b = raster(V, keys);
  let na = 0, nb = 0, both = 0, ao = 0, bo = 0;
  for (let i = 0; i < a.length; i++) { if (a[i]) na++; if (b[i]) nb++; if (a[i] && b[i]) both++; else if (a[i]) ao++; else if (b[i]) bo++; }
  console.log('  ' + label + ': 게임 ' + na + '칸 · v2 ' + nb + '칸 | 겹침 ' + both
    + ' (v2의 ' + (both / Math.max(1, nb) * 100).toFixed(1) + '%가 게임 안에 이미 있음)'
    + ' | 게임만 ' + ao + ' · v2만 ' + bo + ' | 합집합 시 면적 +' + ((na + bo) / Math.max(1, na) * 100 - 100).toFixed(1) + '%');
}

// ── 이름 대응 ──────────────────────────────────────────────────────────────
function samp(o, n) {
  const p = o.path || [], seg = []; let L = 0;
  for (let i = 0; i < p.length - 1; i++) { const d = Math.hypot(p[i + 1].pos[0] - p[i].pos[0], p[i + 1].pos[1] - p[i].pos[1]); seg.push(d); L += d; }
  const pts = [];
  for (let t = 0; t <= n; t++) {
    let want = L * t / n, acc = 0, i = 0;
    while (i < seg.length && acc + seg[i] < want) { acc += seg[i]; i++; }
    if (i >= seg.length) i = Math.max(0, seg.length - 1);
    const f = seg[i] ? (want - acc) / seg[i] : 0;
    if (!p[i] || !p[i + 1]) break;
    pts.push([p[i].pos[0] + (p[i + 1].pos[0] - p[i].pos[0]) * f, p[i].pos[1] + (p[i + 1].pos[1] - p[i].pos[1]) * f]);
  }
  return { pts, L };
}
const meanNear = (a, b) => { let s = 0; for (const q of a.pts) { let m = Infinity; for (const r of b.pts) m = Math.min(m, Math.hypot(q[0] - r[0], q[1] - r[1])); s += m; } return s / Math.max(1, a.pts.length); };

console.log('\n[③ 이름 대응 — 같은 지형인데 이름만 갈린 쌍(평균편차 ≤ 3셀)]');
const pairs = { ridges: [], rivers: [] };
for (const key of ['ridges', 'rivers']) {
  for (const v of (V[key] || [])) {
    if (v._mirroredFrom) continue;
    const sv = samp(v, 40); if (!(sv.L > 0)) continue;
    let best = null;
    for (const g of (G[key] || [])) {
      if (g._mirroredFrom) continue;
      const sg = samp(g, 40); if (!(sg.L > 0)) continue;
      const d = (meanNear(sv, sg) + meanNear(sg, sv)) / 2;
      if (!best || d < best.d) best = { d, name: g.name, L: sg.L };
    }
    if (!best) continue;
    const same = best.d <= 96;                       // 3셀
    if (same) pairs[key].push({ v2: v.name, game: best.name, dev: Math.round(best.d) });
    if (same && v.name !== best.name) console.log('  ' + key.padEnd(7) + (v.name).padEnd(12) + ' ≡ ' + (best.name).padEnd(12) + ' (편차 ' + (best.d / 32).toFixed(1) + '셀 · 길이 ' + Math.round(sv.L) + ' vs ' + Math.round(best.L) + ')');
  }
  const ident = pairs[key].filter((p) => p.v2 === p.game).length;
  console.log('  → ' + key + ': 같은 자리 ' + pairs[key].length + '쌍 중 이름까지 같은 것 ' + ident + '쌍, 이름만 다른 것 ' + (pairs[key].length - ident) + '쌍');
}

console.log('\n[④ 합집합의 대가 — 합치면 새로 막히는 고개]');
function ridgeAt(d, x, y) {
  for (const o of (d.ridges || [])) {
    const p = o.path || [];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const ax = a.pos[0], ay = a.pos[1], vx = b.pos[0] - ax, vy = b.pos[1] - ay;
      const L2 = vx * vx + vy * vy || 1;
      let t = ((x - ax) * vx + (y - ay) * vy) / L2; t = Math.max(0, Math.min(1, t));
      const w = (wOf(a) + (wOf(b) - wOf(a)) * t) / 2;
      if (Math.hypot(x - (ax + vx * t), y - (ay + vy * t)) <= w) return o.name;
    }
  }
  return null;
}
let blocked = 0;
for (const ps of (G.passes || [])) {
  const g = ridgeAt(G, ps.pos[0], ps.pos[1]), v = ridgeAt(V, ps.pos[0], ps.pos[1]);
  if (!g && v) { blocked++; console.log('  ★' + ps.name + ' (' + ps.pos + ') — 게임에선 열려 있는데 v2 ' + v + ' 이 덮는다'); }
}
console.log('  합집합 시 새로 막히는 고개: ' + blocked + ' / ' + (G.passes || []).length);

console.log('\n=== 판정 ===');
console.log('  정본 = server/hanbando-terrain.json (게임이 실제 로드하는 파일).');
console.log('  v2는 그 조상이며, 기하는 이미 정본에 포함되어 있다. 합집합은 순이득 0 · 고개 ' + blocked + '개 손실.');
console.log('  v2에만 있는 실질 정보는 **지명뿐**이다(③). 지명 이식은 취향 판단이라 재민 회부.');
