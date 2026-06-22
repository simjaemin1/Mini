#!/usr/bin/env node
// === scripts/import-design.js — map-editor.html Export JSON → 빌드 입력 ===
//
// map-editor.html의 Export JSON을 빌드 파이프라인 입력에 꽂는다:
//   - ridges/passes/forests/lakes → scripts/terrain-data-<zone>.js (hanbando는 terrain-data-hanbando-v2.js)
//   - rivers (+lakes)             → server/hanbando-terrain.src.json 의 해당 zone
// 그다음 빌드:  OPEN_BORDERS=1 node scripts/build-terrain-v3.js
//
// 단일존 Export {zone, rivers, ridges, ...}  와  멀티존 Export {multi:true, zones:{...}} 둘 다 지원.
// 기본(REPLACE): Export에 "있는" 카테고리만 교체, 없으면 기존 유지(파괴 방지).  --merge: 이어붙임.
// 모든 수정 파일은 .bak 백업.
//
// 사용:  node scripts/import-design.js <export.json> [--merge]

'use strict';
const fs = require('fs');
const path = require('path');

const arg = process.argv[2];
const MERGE = process.argv.includes('--merge');
if (!arg) { console.error('사용: node scripts/import-design.js <export.json> [--merge]'); process.exit(1); }

const exp = JSON.parse(fs.readFileSync(arg, 'utf8'));
const SRC = path.join(__dirname, '..', 'server', 'hanbando-terrain.src.json');
function backup(p) { if (fs.existsSync(p)) fs.copyFileSync(p, p + '.bak'); }

// 단일/멀티 → zones 맵으로 정규화
const zones = (exp.multi && exp.zones) ? exp.zones : { [exp.zone || 'hanbando']: exp };

backup(SRC);
const src = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const log = [];

function ridgeStr(r) {
  const flags = ['pinStart', 'noFit', 'noValley', 'noTaper'].filter(k => r[k]).map(k => k + ': true');
  const head = `    { name: ${JSON.stringify(r.name)}${flags.length ? ', ' + flags.join(', ') : ''},`;
  const pts = r.path.map(p => `        [${p[0]}, ${p[1]}, ${p[2]}],`).join('\n');
  return head + '\n      path: [\n' + pts + '\n      ],\n    },';
}

for (const Z of Object.keys(zones)) {
  const zd = zones[Z];
  const MODFILE = (Z === 'hanbando') ? 'terrain-data-hanbando-v2.js' : ('terrain-data-' + Z + '.js');
  const MODPATH = path.join(__dirname, MODFILE);

  const ridges = (zd.ridges || []).map(r => {
    const o = { name: r.name, path: r.path.map(p => [p.pos[0], p.pos[1], p.width]) };
    if (r.pinStart) o.pinStart = true; if (r.noFit) o.noFit = true;
    if (r.noValley) o.noValley = true; if (r.noTaper) o.noTaper = true;
    return o;
  });
  const passes  = (zd.passes  || []).map(p => ({ name: p.name, pos: p.pos, radius: p.radius }));
  const forests = (zd.forests || []).map(f => ({ name: f.name, center: f.center, rx: f.rx, ry: f.ry, densityMult: f.densityMult }));
  const mlakes  = (zd.lakes   || []).map(l => ({ name: l.name, center: l.center, radius: l.radius }));
  const rivers  = (zd.rivers  || []).map(r => ({ name: r.name, path: r.path.map(p => ({ pos: p.pos, width: p.width })) }));

  // 기존 모듈 로드(유지/병합)
  let base = { ridges: [], passes: [], forests: [], lakes: [] };
  if (fs.existsSync(MODPATH)) { try { delete require.cache[require.resolve(MODPATH)]; base = require(MODPATH); } catch (e) {} }
  const pick = (cat, fresh) => MERGE ? (base[cat] || []).concat(fresh) : (fresh.length ? fresh : (base[cat] || []));
  const mod = { zone: Z, ridges: pick('ridges', ridges), passes: pick('passes', passes), forests: pick('forests', forests), lakes: pick('lakes', mlakes) };

  const sz = zd.size ? `0~${zd.size[0]} × 0~${zd.size[1]}` : '?';
  const js = `// === scripts/${MODFILE} — map-editor.html에서 생성 (import-design.js) ===
// 좌표: ${Z} local px (${sz}). y는 북→남. 자동 생성물이지만 손으로 더 다듬어도 됨.
'use strict';
module.exports = {
  zone: ${JSON.stringify(Z)},
  ridges: [
${mod.ridges.map(ridgeStr).join('\n')}
  ],
  passes: ${JSON.stringify(mod.passes)},
  lakes: ${JSON.stringify(mod.lakes)},
  forests: ${JSON.stringify(mod.forests)},
};
`;
  backup(MODPATH);
  fs.writeFileSync(MODPATH, js);

  // src.json rivers(+lakes)
  if (!src[Z]) src[Z] = {};
  if (MERGE) src[Z].rivers = (src[Z].rivers || []).filter(r => !r._mirroredFrom).concat(rivers);
  else if (rivers.length) src[Z].rivers = rivers;
  src[Z].rivers = src[Z].rivers || [];
  if (mlakes.length) src[Z].lakes = MERGE ? (src[Z].lakes || []).filter(l => !l._mirroredFrom).concat(mlakes) : mlakes;

  log.push(`  [${Z}] → ${MODFILE}: ridges ${mod.ridges.length}, passes ${mod.passes.length}, forests ${mod.forests.length}, lakes ${mod.lakes.length} | src rivers ${src[Z].rivers.length}` + (Z !== 'hanbando' ? '  ⚠빌드 DATA_MODULES/ZONES 등록 필요' : ''));
}

fs.writeFileSync(SRC, JSON.stringify(src));

console.log(`[import-design] ${exp.multi ? '멀티존' : '단일존'} ${MERGE ? '(merge)' : '(replace)'} — ${Object.keys(zones).length}개 존`);
log.forEach(l => console.log(l));
console.log('  백업: 수정된 각 파일 .bak');
console.log('  다음: OPEN_BORDERS=1 node scripts/build-terrain-v3.js');
