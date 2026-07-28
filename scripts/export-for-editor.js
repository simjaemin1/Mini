#!/usr/bin/env node
// === scripts/export-for-editor.js — 현재 소스 → map-editor.html 편집용 JSON ===
//
// terrain-data-<zone>.js(능선/고개/숲/호수) + hanbando-terrain.src.json(강)을 읽어
// 에디터가 "편집용으로 불러오기"로 열 수 있는 깨끗한 제어점 JSON을 만든다.
// (빌드 산출물 hanbando_terrain_v2.json도 에디터에서 바로 열 수 있지만, 그건 사행이 적용돼
//  점이 빽빽함. 이 스크립트는 소스 제어점이라 편집이 쉬움.)
//
// 사용:  node scripts/export-for-editor.js [zone]      (기본 hanbando)
// 출력:  ../editor-<zone>.json   (~/Mini/editor-<zone>.json)

'use strict';
const fs = require('fs');
const path = require('path');

const Z = process.argv[2] || 'hanbando';
const MODFILE = (Z === 'hanbando') ? 'terrain-data-hanbando-v2.js' : ('terrain-data-' + Z + '.js');
const SIZES = { hanbando:[70016,130016], jungwon_n:[100000,130016], jungwon_s:[100000,60000], nippon:[49984,130016], bering:[160000,49984], sibara:[160000,49984] };

let mod;
try { mod = require(path.join(__dirname, MODFILE)); }
catch (e) { console.error('모듈 로드 실패:', MODFILE, e.message); process.exit(1); }
const src = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.src.json'), 'utf8'));
// ★[다리 오버레이] zone-config의 다리 셀을 **가공 없이** 그대로 싣는다(flat [cx,cy,…] — 셀 좌표가 정본).
//   에디터는 읽기 전용 오버레이로만 쓴다(지형 편집 대상 아님). 없으면 빈 배열.
let BRIDGES = [];
try { BRIDGES = (require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES[Z] || {}).bridges || []; }
catch (e) { console.warn('  ⚠ zone-config 다리 로드 실패:', e.message); }

const ridgePt = p => Array.isArray(p) ? ({ pos:[p[0],p[1]], width:p[2]||300 }) : ({ pos:p.pos, width:p.width||300 });
const out = {
  zone: Z,
  size: SIZES[Z] || [100000,130016],
  rivers:  (((src[Z]||{}).rivers)||[]).filter(r=>!r._mirroredFrom).map(r=>({ name:r.name, path:r.path.map(p=>({pos:p.pos, width:p.width||300})) })),
  ridges:  (mod.ridges||[]).map(r=>{ const o={ name:r.name, path:r.path.map(ridgePt) }; if(r.pinStart)o.pinStart=true; if(r.noFit)o.noFit=true; if(r.noValley)o.noValley=true; if(r.noTaper)o.noTaper=true; return o; }),
  forests: (mod.forests||[]).map(f=>({ name:f.name, center:f.center, rx:f.rx, ry:f.ry, densityMult:f.densityMult })),
  lakes:   (mod.lakes||[]).map(l=>({ name:l.name, center:l.center, radius:l.radius })),
  passes:  (mod.passes||[]).map(p=>({ name:p.name, pos:p.pos, radius:p.radius })),
  bridges: BRIDGES,   // ★읽기 전용 오버레이용(셀 좌표 flat). 편집·재수출로 값이 바뀌지 않는다.
};

const outPath = path.join(__dirname, '..', '..', 'editor-' + Z + '.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('편집용 JSON 생성:', outPath);
console.log(`  rivers ${out.rivers.length}, ridges ${out.ridges.length}, forests ${out.forests.length}, lakes ${out.lakes.length}, passes ${out.passes.length}, bridges ${out.bridges.length / 2}셀`);
console.log('  에디터에서 "✎ 편집용으로 불러오기"로 이 파일을 열어 편집 → Export → import-design.js → build');
