#!/usr/bin/env node
// === scripts/export-game-terrain-for-editor.js — **게임이 실제로 로드하는 지형** → 에디터 참조 JSON ===
//
// ★왜 이 스크립트가 따로 필요한가(11차 실측으로 드러난 것):
//   export-world-for-editor.js 는 `hanbando_terrain_v2.json`(설계 중간 산출물)에서 뽑는다.
//   그런데 게임 서버가 로드하는 건 `server/hanbando-terrain.json` 이고, 둘은 **다른 세계**다.
//     · 게임  : 강 41개 · 다리#1 자리 한여울강 폭 28셀
//     · v2    : 강 35개 · 같은 자리 폭 23셀
//   에디터는 그 v2를 "인게임 실제 셀"이라고 그려 왔다 — 다리(zone-config = 게임 세계)와 물(v2 = 다른 세계)이
//   한 화면에 겹치니 "다리가 강을 못 건넌다"처럼 보였다. 실제로는 게임 판정상 다리가 물을 정확히 덮는다.
//   ⇒ 다리·통행을 확인할 때 쓰는 참조는 **게임이 로드하는 그 파일**이어야 한다. 이 스크립트가 그걸 뽑는다.
//
// ★스무딩 금지: 게임 terrain.js _isPointInRiver 는 경로를 **그대로** 쓴다(스무딩 없음).
//   그래서 이 산출물에는 smooth:false 를 명시해 에디터가 한 번 더 깎지 않게 한다(이중 스무딩 = 강이 부푼다).
//
// 출력: ../../editor-game-terrain.json   (에디터 「참조 지형 불러오기」로 연다)
// 사용: node scripts/export-game-terrain-for-editor.js [zoneId]

'use strict';
const fs = require('fs');
const path = require('path');

const ZID = process.argv[2] || 'hanbando';
// 정본 v3(hanbando_terrain_v3.json)이 있으면 그것을 쓴다 — 기하는 게임 파일과 완전히 같고 지명만 더 있다.
const V3 = path.join(__dirname, '..', '..', 'hanbando_terrain_v3.json');
const SRC = fs.existsSync(V3) ? V3 : path.join(__dirname, '..', 'server', 'hanbando-terrain.json');
const OUT = path.join(__dirname, '..', '..', 'editor-game-terrain.json');
const R = (v) => Math.round(v);

const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const d = all[ZID];
if (!d) { console.error(`존 ${ZID} 없음 — 있는 존: ${Object.keys(all).join(', ')}`); process.exit(1); }

let ZONES = {};
try { ZONES = require(path.join(__dirname, '..', 'server', 'zone-config')).ZONES; } catch (e) { }
const zc = ZONES[ZID] || {};

const pt = (p) => ({ pos: [R(p.pos ? p.pos[0] : p[0]), R(p.pos ? p.pos[1] : p[1])], width: R((p.width != null) ? p.width : 300) });
const out = {
  zone: ZID,
  size: [zc.zoneWidth || 70016, zc.zoneHeight || 130016],
  // ★게임 판정과 1:1이 되도록 **가공 금지**: 경로·폭을 그대로 옮긴다(반올림만).
  smooth: false,   // 에디터가 이 참조를 래스터화할 때 스무딩하지 말 것(게임은 스무딩 안 함)
  // altName = 정본 v3가 병기한 v2 시절 지명(한울대간 등). 에디터가 있으면 같이 띄운다.
  rivers: (d.rivers || []).map((r) => ({ name: r.name, altName: r.altName, path: (r.path || []).map(pt) })),
  ridges: (d.ridges || []).map((r) => ({ name: r.name, altName: r.altName, path: (r.path || []).map(pt) })),
  forests: (d.forests || []).filter((f) => f.center).map((f) => ({ name: f.name, center: [R(f.center[0]), R(f.center[1])], rx: R(f.rx || 4000), ry: R(f.ry || 3000), densityMult: f.densityMult || 1.5 })),
  lakes: (d.lakes || []).filter((l) => l.center).map((l) => ({ name: l.name, center: [R(l.center[0]), R(l.center[1])], radius: R(l.radius || Math.max(l.rx || 0, l.ry || 0) || 600), rx: l.rx ? R(l.rx) : undefined, ry: l.ry ? R(l.ry) : undefined })),
  passes: (d.passes || []).filter((p) => p.pos).map((p) => ({ name: p.name, pos: [R(p.pos[0]), R(p.pos[1])], radius: R(p.radius || 1500) })),
  villages: (d.villages || []).map((v) => ({ name: v.name, x: R(v.x), y: R(v.y), type: v.type })),
  bridges: zc.bridges || [],   // ★다리 = zone-config 셀 그대로(가공 금지). 이제 물과 같은 세계에서 온다.
};

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`게임 지형 → 에디터 참조: ${OUT}`);
console.log(`  ${ZID} — 강 ${out.rivers.length} · 산맥 ${out.ridges.length} · 숲 ${out.forests.length} · 호수 ${out.lakes.length} · 고개 ${out.passes.length} · 마을 ${out.villages.length} · 다리 ${out.bridges.length / 2}셀`);
console.log(`  smooth:false — 게임 terrain.js가 경로를 그대로 쓰므로 에디터도 깎지 않아야 판정이 일치한다.`);
