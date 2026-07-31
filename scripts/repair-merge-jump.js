#!/usr/bin/env node
// === scripts/repair-merge-jump.js — 내가 만든 결함 수리: 병합이 경로를 **점프**시켰다 ===
//
// ★재민 지적: "명호 옆에 ㅈ같은 직선강 하나는 왜 추가한 거야?"
//   내 잘못이다. merge-split-rivers.js 가 두 획을 이을 때 **들어오는 획만 뒤집어 맞췄고**,
//   이음매가 이미 쌓아 둔 경로(pathOut)의 **머리 쪽**에 있는 경우를 고려하지 않았다.
//   대숲림천은 이음매가 path[0](머리)이었는데 살여울천을 꼬리에 붙여 버려서,
//   (20224,35776) → (21377,21314) 로 **14,508px(453셀)** 을 폭 475px로 가로지르는 직선이 생겼다.
//   명호(21984,23136) 바로 옆을 지나간다. 정확히 그 강이다.
//
//   덤으로 이음매 인덱스도 어긋나서, 폭 taper 가 진짜 이음매가 아니라 대숲림천 **반대쪽 끝**에 걸렸다.
//
// 수리: 대숲림천 구간을 원본(6581c36)에서 되살려 **뒤집어** 붙이고, 이음매를 제자리에서 다시 taper 한다.
// 실행: node scripts/repair-merge-jump.js [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));
const d = world.hanbando;
const P = (q) => q.pos || [q.x, q.y];
const R = Math.round;
const TAPER = 6;

const orig = JSON.parse(execSync('git show 6581c36:server/hanbando-terrain.json', { cwd: path.join(__dirname, '..'), maxBuffer: 1 << 28 }).toString()).hanbando;
const A0 = orig.rivers.find((r) => r.name === '대숲림천' && !r._mirroredFrom);
const rv = d.rivers.find((r) => r.name === '살여울천' && !r._mirroredFrom);
if (!A0 || !rv) { console.error('대상 없음'); process.exit(2); }

// 점프 지점 찾기
const ds = [];
for (let i = 0; i < rv.path.length - 1; i++) { const a = P(rv.path[i]), b = P(rv.path[i + 1]); ds.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
const med = [...ds].sort((a, b) => a - b)[Math.floor(ds.length / 2)] || 1;
const j = ds.findIndex((x) => x > med * 8 && x > 1000);
if (j < 0) { console.log('점프 없음 — 이미 수리됨'); process.exit(0); }
console.log('점프 발견 [' + j + '→' + (j + 1) + '] ' + R(ds[j]) + 'px (' + (ds[j] / 32).toFixed(0) + '셀) = 중앙값 ' + R(med) + 'px 의 ' + (ds[j] / med).toFixed(0) + '배');
console.log('  ' + P(rv.path[j]).map(R) + '  →  ' + P(rv.path[j + 1]).map(R));

const B = rv.path.slice(j + 1);                       // 살여울천 구간(현행 — 율호 연장 포함)
const A = A0.path.slice().reverse().map((q) => ({ pos: [R(P(q)[0]), R(P(q)[1])], width: R(q.width != null ? q.width : 200) }));
console.log('  대숲림천 원본 ' + A0.path.length + '점을 뒤집어 앞에, 살여울천 구간 ' + B.length + '점을 뒤에');

const seamGap = Math.hypot(P(A[A.length - 1])[0] - P(B[0])[0], P(A[A.length - 1])[1] - P(B[0])[1]);
console.log('  새 이음매 간격 ' + R(seamGap) + 'px (' + (seamGap / 32).toFixed(1) + '셀)');
if (seamGap > 800) { console.error('  ★이음매가 여전히 멀다 — 중단'); process.exit(1); }

const p = A.concat(B);
// 이음매 taper — 좁은 쪽을 넓은 쪽에 맞추고 앞뒤 TAPER 점에 걸쳐 되돌린다
const si = A.length - 1;
const wa = p[si].width, wb = p[si + 1].width, target = Math.max(wa, wb);
for (let k = 0; k <= TAPER; k++) {
  const f = k / (TAPER + 1);
  for (const idx of [si - k, si + 1 + k]) {
    if (idx < 0 || idx >= p.length) continue;
    p[idx].width = R(p[idx].width + (target - p[idx].width) * (1 - f));
  }
}
rv.path = p;

const ds2 = [];
for (let i = 0; i < p.length - 1; i++) { const a = P(p[i]), b = P(p[i + 1]); ds2.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
console.log('  수리 후: 점 ' + p.length + ' · 최대 점간거리 ' + R(Math.max(...ds2)) + 'px (' + (Math.max(...ds2) / 32).toFixed(1) + '셀) · 이음매 폭 ' + wa + '/' + wb + ' → ' + target);

if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('\n★기록: ' + GAME + ' (백업 .bak)');
} else console.log('\n계산만 — 기록하려면 --apply');
