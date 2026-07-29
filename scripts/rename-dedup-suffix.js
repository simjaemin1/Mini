#!/usr/bin/env node
// === scripts/rename-dedup-suffix.js — 이름 끝 _2/_3 꼬리표를 제 이름으로 ===
//
// ★재민 지적: "매수해2는 뭐야? 왜 2가 달렸어? 이거 정정하고"
//   절차 명명기가 같은 이름을 두 번 뽑았을 때 붙인 **중복 회피 꼬리표**다. 지도에 그대로 노출된다.
//   위치가 전혀 다른 별개의 지형인데(매수해 북서 y1001 ↔ 매수해_2 중중 y67483) 이름만 파생처럼 보인다.
//   ⇒ 각자 제 자리에 맞는 이름을 준다. 원래 이름은 dedupName 으로 보존(가역).
//
// 실행: node scripts/rename-dedup-suffix.js [--apply]
'use strict';
const fs = require('fs');
const path = require('path');
const APPLY = process.argv.includes('--apply');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const world = JSON.parse(fs.readFileSync(GAME, 'utf8'));

// 자리(방위)와 지형에 맞춘 새 이름 — 기존 이름과 겹치지 않는 것으로 고름
const MAP = {
  hanbando: {
    forests: {
      '청수해_2': '설매수해',   // 북중 (32235,31974)
      '운수해_2': '이깔수해',   // 북서 (12602,13286) — 이깔나무(잎갈나무) 북방 침엽
      '은수해_2': '동백수해',   // 북동 (64738,30519) 세로로 긴 해안림
      '송수해_2': '너삼수해',   // 북서 (10421,41717) 가장 넓은 숲
      '매수해_2': '들메수해',   // 중중 (35322,67483) 작고 납작한 숲
    },
    lakes: { '죽호_2': '가림호' },      // 중동 (42754,66715)
    rivers: { '학천_2': '두무천' },     // 남서 하구 (176,117949)
  },
};

let n = 0;
for (const zid of Object.keys(MAP)) {
  const d = world[zid]; if (!d) continue;
  for (const kind of Object.keys(MAP[zid])) {
    for (const f of (d[kind] || [])) {
      const to = MAP[zid][kind][f.name];
      if (!to) continue;
      console.log('  ' + zid + '/' + kind + '  「' + f.name + '」 → 「' + to + '」');
      if (APPLY) { f.dedupName = f.name; f.name = to; }
      n++;
    }
  }
  // 이웃 존 미러 사본도 같은 이름으로
  for (const z2 of Object.keys(world)) {
    if (z2[0] === '_' || z2 === zid) continue;
    for (const kind of Object.keys(MAP[zid])) {
      for (const f of (world[z2][kind] || [])) {
        const to = MAP[zid][kind][f.name];
        if (to && APPLY) { f.dedupName = f.name; f.name = to; }
      }
    }
  }
}
// 남은 꼬리표 점검
const left = [];
for (const z of Object.keys(world)) {
  if (z[0] === '_') continue;
  for (const k of ['forests', 'lakes', 'rivers', 'ridges', 'passes'])
    for (const f of (world[z][k] || [])) if (/_\d+$/.test(f.name || '')) left.push(z + '/' + f.name);
}
console.log('\n개명 ' + n + '건 · 전 존 잔존 꼬리표 ' + left.length + '건' + (left.length ? ' (' + [...new Set(left)].slice(0, 12).join(', ') + (left.length > 12 ? ' …' : '') + ')' : ' ✔'));
if (APPLY) {
  fs.copyFileSync(GAME, GAME + '.bak');
  fs.writeFileSync(GAME, JSON.stringify(world));
  console.log('★기록 (백업 .bak)');
} else console.log('계산만 — 기록하려면 --apply');
