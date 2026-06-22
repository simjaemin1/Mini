#!/usr/bin/env node
// === scripts/export-world-for-editor.js — v2 빌드출력 한반도 + region design 이웃 → editor-world.json ===
//
// hanbando = hanbando_terrain_v2.json(빌드 출력, 부드러운 사행)
// 이웃(중원북·닛폰·베링·시바라·중원남) = design-region.js가 만든 editor-world-region.json에서 가져옴
// 나머지 존 = 빈 공간(에디터 프레임)
//
// ※ 이웃을 포함하려면 먼저 design-region.js를 한 번 실행해 editor-world-region.json을 만들어 두세요.
// 출력: ../editor-world.json
// 사용: node scripts/export-world-for-editor.js

'use strict';
const fs = require('fs');
const path = require('path');

const BUILT = path.join(__dirname, '..', '..', 'hanbando_terrain_v2.json');
const REGION = path.join(__dirname, '..', '..', 'editor-world-region.json');
const OUT = path.join(__dirname, '..', '..', 'editor-world.json');
const R = v => Math.round(v);
const lakeR = l => Math.round(l.radius || (l.shape === 'ellipse' ? Math.max(l.a || 0, l.b || 0) : 0) || l.a || 600);

// 1) 한반도: 빌드 출력
const d = JSON.parse(fs.readFileSync(BUILT, 'utf8')).hanbando;
const hb = {
  zone: 'hanbando', size: [70016, 130016],
  rivers:  (d.rivers || []).filter(r => !r._mirroredFrom).map(r => ({ name: r.name, path: r.path.map(p => ({ pos: [R(p.pos[0]), R(p.pos[1])], width: R(p.width || 300) })) })),
  ridges:  (d.ridges || []).filter(r => !r._mirroredFrom).map(r => ({ name: r.name, path: r.path.map(p => ({ pos: [R(p.pos[0]), R(p.pos[1])], width: R(p.width || 300) })) })),
  forests: (d.forests || []).map(f => ({ name: f.name, center: [R(f.center[0]), R(f.center[1])], rx: R(f.rx), ry: R(f.ry), densityMult: f.densityMult || 1.5 })),
  lakes:   (d.lakes || []).filter(l => !l._mirroredFrom && l.center).map(l => ({ name: l.name, center: [R(l.center[0]), R(l.center[1])], radius: lakeR(l) })),
  passes:  (d.passes || []).filter(p => !p.auto && !p._mirroredFrom && p.pos).map(p => ({ name: p.name, pos: [R(p.pos[0]), R(p.pos[1])], radius: R(p.radius) })),
};

const zones = { hanbando: hb };

// 2) 이웃: region design (editor-world-region.json)에서
let neighbors = [];
try {
  const region = JSON.parse(fs.readFileSync(REGION, 'utf8'));
  for (const z of ['jungwon_n', 'nippon', 'bering', 'sibara', 'jungwon_s']) {
    if (region.zones && region.zones[z]) { zones[z] = region.zones[z]; neighbors.push(z); }
  }
} catch (e) {
  console.log('  ⚠ editor-world-region.json 없음 — design-region.js 먼저 실행하면 이웃이 포함됩니다.');
}

fs.writeFileSync(OUT, JSON.stringify({ multi: true, zones }));
console.log('editor-world.json 생성:');
console.log(`  hanbando(빌드출력) — rivers ${hb.rivers.length}, ridges ${hb.ridges.length}, forests ${hb.forests.length}, lakes ${hb.lakes.length}, passes ${hb.passes.length}`);
console.log('  이웃(region design):', neighbors.join(', ') || '(없음)');
console.log('  나머지 존 = 빈 공간.');
