#!/usr/bin/env node
// @regress
// === scripts/test-npc-label.js — NPC 표지는 데이터 칸, 이름은 이름 (T1164) ============================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (v, m, x = '') => { v ? pass++ : fail++; console.log((v ? '  ✓ ' : '  ✗ ') + m + (x ? `  ${x}` : '')); };

console.log('\n=== [T1164] NPC 표지와 이름 전달 ===');
const Z = read('server/zone.js');
const N = read('public/client/30-n-net.js');
const R = read('public/client/34-m-renderloop.js');
const V = read('public/client/46-h-verbs.js');
const B = read('public/client/80-bigmap.js');
const spawn = Z.slice(Z.indexOf('function spawnNpc('), Z.indexOf('\nfunction ', Z.indexOf('function spawnNpc(') + 10));
const npcFieldAt = Z.indexOf('if (o.isNpc) e.npc = true;');
const packet = Z.slice(npcFieldAt - 600, npcFieldAt + 100);
ok(spawn.length > 0 && /const name = opts\.name \|\| NPC_NAMES\[/.test(spawn) && !/\+\s*['"]🤖/.test(spawn),
  '① NPC 이름 생성에 표지 문자가 붙지 않는다');
ok(/if \(o\.isNpc\) e\.npc = true;/.test(packet), '② 첫 가시분에 boolean `npc: true` 표식이 간다');
ok(/npc: pp\.npc !== undefined \? pp\.npc : prev\?\.npc/.test(N), '③ 클라이언트 네트워크 계층이 NPC 표식을 유지한다');
ok(/npc: o\.npc/.test(R), '④ 월드 이름표 렌더 경로가 NPC 표식 칸을 받는다');
ok(/npc: !!o\.npc/.test(V), '⑤ 상호작용 경로가 NPC 표식 칸으로 대상을 구분한다');
ok(/p\.name/.test(B) && /map_players/.test(B), '⑥ 대지도 표본은 이름을 전달하되 서버의 인간 플레이어 전용 응답을 사용한다');
ok(/e\.npc = true/.test(Z) && /npc: o\.npc/.test(R), '⑦ NPC 표식 소비처가 이름 문자열과 분리되어 있다');

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
