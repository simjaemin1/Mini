#!/usr/bin/env node
// === scripts/export-world-for-editor.js — **게임이 로드하는 지형** 전 존 → editor-world.json ===
//
// ★11차 재작성 이유(재민 지적: "묘향호에 붙어있는 강도 그대로고, 최북단 경계강도 그대로야")
//   맞는 지적이었는데 원인은 지형이 아니라 **에디터가 옛 파일을 보고 있던 것**이었다.
//   옛 이 스크립트는 존마다 다른 데서 긁어 왔다:
//     · hanbando  ← ../hanbando_terrain_v2.json   (게임의 **조상**. 묘향호·경계강·경계산맥이 여기 있다)
//     · 이웃 5존   ← editor-world-region.json      (design-region.js 산출 = 또 다른 세계)
//     · 나머지     ← 빈 공간
//   그래서 editor-world.json 을 열면 **게임에 없는 호수와 강**이 보였다. 고친 게 안 보이는 게 당연했다.
//   ⇒ 이제 전 존을 **server/hanbando-terrain.json 하나**에서 뽑는다. 참조가 곧 게임이다.
//
// ★스무딩 금지: 게임 terrain.js `_isPointInRiver` 는 경로를 그대로 쓴다 → smooth:false 명시.
//
// 출력: ../editor-world.json   (에디터 「참조 지형 불러오기」 · 전체 월드 모드)
// 사용: node scripts/export-world-for-editor.js
'use strict';
const fs = require('fs');
const path = require('path');

const V3 = path.join(__dirname, '..', '..', 'hanbando_terrain_v3.json');
const GAME = path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const SRC = fs.existsSync(V3) ? V3 : GAME;
const OUT = path.join(__dirname, '..', '..', 'editor-world.json');
const R = (v) => Math.round(v);

const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
let ZONES = {};
try { ZONES = require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES; } catch (e) { }

const pt = (p) => ({ pos: [R(p.pos ? p.pos[0] : p[0]), R(p.pos ? p.pos[1] : p[1])], width: R(p.width != null ? p.width : 300) });
const lakeR = (l) => R(l.radius || Math.max(l.rx || 0, l.ry || 0) || 600);

const zones = {};
const rows = [];
for (const zid of Object.keys(all)) {
  if (zid[0] === '_') continue;                       // _canon 같은 메타
  const d = all[zid], zc = ZONES[zid] || {};
  zones[zid] = {
    zone: zid,
    size: [zc.zoneWidth || 70016, zc.zoneHeight || 130016],
    smooth: false,   // ★게임 판정과 1:1 — 에디터가 한 번 더 깎으면 강이 부푼다
    rivers: (d.rivers || []).filter((r) => !r._mirroredFrom).map((r) => ({ name: r.name, altName: r.altName, path: (r.path || []).map(pt) })),
    ridges: (d.ridges || []).filter((r) => !r._mirroredFrom).map((r) => ({ name: r.name, altName: r.altName, path: (r.path || []).map(pt) })),
    forests: (d.forests || []).filter((f) => f.center).map((f) => ({ name: f.name, center: [R(f.center[0]), R(f.center[1])], rx: R(f.rx || 4000), ry: R(f.ry || 3000), densityMult: f.densityMult || 1.5 })),
    lakes: (d.lakes || []).filter((l) => !l._mirroredFrom && l.center).map((l) => ({ name: l.name, center: [R(l.center[0]), R(l.center[1])], radius: lakeR(l), rx: l.rx ? R(l.rx) : undefined, ry: l.ry ? R(l.ry) : undefined })),
    passes: (d.passes || []).filter((p) => p.pos).map((p) => ({ name: p.name, pos: [R(p.pos[0]), R(p.pos[1])], radius: R(p.radius || 1500) })),
    villages: (d.villages || []).map((v) => ({ name: v.name, x: R(v.x), y: R(v.y), type: v.type })),
    bridges: zc.bridges || [],   // ★셀 좌표 그대로(가공 금지)
  };
  const z = zones[zid];
  rows.push('  ' + zid.padEnd(10) + '강 ' + String(z.rivers.length).padStart(3) + ' · 산맥 ' + String(z.ridges.length).padStart(2)
    + ' · 숲 ' + String(z.forests.length).padStart(2) + ' · 호수 ' + String(z.lakes.length).padStart(2)
    + ' · 고개 ' + String(z.passes.length).padStart(2) + ' · 마을 ' + String(z.villages.length).padStart(2)
    + ' · 다리 ' + (z.bridges.length / 2) + '셀');
}

fs.writeFileSync(OUT, JSON.stringify({ multi: true, zones }));
console.log('editor-world.json ← ' + path.basename(SRC) + ' (게임 로드본)');
rows.forEach((r) => console.log(r));
// 자리표 이름이 남아 있으면 알린다 — '경계~'는 생성기가 임시로 붙인 이름이라 지도에 보이면 안 된다
const bad = [];
for (const zid of Object.keys(zones)) for (const k of ['rivers', 'ridges', 'lakes', 'passes'])
  for (const f of zones[zid][k]) if (/^경계/.test(f.name || '')) bad.push(zid + '/' + k + '/' + f.name);
console.log(bad.length ? '  ★자리표 이름 남음 ' + bad.length + '건: ' + bad.join(', ') : '  자리표(경계~) 이름 없음 ✔');
console.log('  smooth:false — 게임은 스무딩 안 하므로 에디터도 깎지 않아야 판정이 일치한다.');
