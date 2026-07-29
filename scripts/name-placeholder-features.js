#!/usr/bin/env node
// === scripts/name-placeholder-features.js — 자리표 이름(경계~)을 실제 지명으로 ===
//
// ★재민 지적: "이름이 경계~로 되어 있는 것도 전부 이름 제대로 지어."
//   '경계강·경계산맥·경계고개'는 존 경계를 넘는 피처에 생성기가 임시로 붙인 자리표다.
//   지도에 그대로 노출되면 세계가 미완성으로 읽힌다.
//
// 현재 게임 지형(4af1c69)에 남은 자리표는 **한반도 고개 4개**뿐이다(강·산맥은 이미 실제 지명).
// 지리 위치(남북·동서 + 어느 산맥 위인가)에 맞는 **실재 고개 이름**을 붙인다 — 이미 쓰인 이름
// (철령·대관령·죽령·문경새재·추풍령·북계곡)과 겹치지 않게 고른다.
//
// 실행: node scripts/name-placeholder-features.js [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));

// 좌표 → 이름. 위치를 보고 고른 실재 고개다:
//   황초령·부전령 = 함경도 북부 고개(개마고원 언저리)   갈재 = 전라 노령산맥   팔량치 = 경남-전북 소백
const PASS_NAMES = [
  { at: [50465, 5599], name: '황초령', why: '북부 동측 — 함경 고원 관문' },
  { at: [46226, 5443], name: '부전령', why: '북부 동측 — 황초령 서쪽 짝' },
  { at: [6964, 97125], name: '갈재', why: '남부 서측 · 노령산맥 계열' },
  { at: [64484, 100405], name: '팔량치', why: '남부 동측 · 소백 계열' },
];

let n = 0, left = [];
for (const zid of Object.keys(world)) {
  if (zid[0] === '_') continue;
  const d = world[zid];
  for (const kind of ['rivers', 'ridges', 'lakes', 'passes', 'forests']) {
    for (const f of (d[kind] || [])) {
      if (!/^경계/.test(f.name || '')) continue;
      let hit = null;
      if (kind === 'passes' && f.pos) {
        hit = PASS_NAMES.find((p) => Math.hypot(p.at[0] - f.pos[0], p.at[1] - f.pos[1]) < 400);
      }
      if (!hit) { left.push(zid + '/' + kind + '/' + f.name); continue; }
      console.log('  ' + zid + '/' + kind + '  「' + f.name + '」 → 「' + hit.name + '」  (' + hit.why + ')');
      if (APPLY) { f.placeholderName = f.name; f.name = hit.name; }
      n++;
    }
  }
}
console.log('\n자리표 개명 ' + n + '건' + (left.length ? ' · ★대응 이름 없음 ' + left.length + '건: ' + left.join(', ') : ''));

// 참고 — 자동 중복 회피로 붙은 _2/_3 꼬리표도 지도에 그대로 보인다(별개 사안, 여기선 세기만)
const tails = [];
for (const zid of Object.keys(world)) {
  if (zid[0] === '_') continue;
  for (const kind of ['rivers', 'ridges', 'lakes', 'passes', 'forests'])
    for (const f of (world[zid][kind] || [])) if (/_\d+$/.test(f.name || '')) tails.push(zid + '/' + f.name);
}
console.log('참고: 이름 끝에 _숫자 꼬리표가 붙은 피처 ' + tails.length + '건(중복 회피 산물 — 재민 판단 대기)');

if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('\n★기록: ' + GAME + ' (백업 .bak)');
} else console.log('\n계산만 — 기록하려면 --apply');
