#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1402 덧붙임 둘 판 · 판정 0 — 보관함 일을 다시 볼지(판정 27 "나중에 정 관리비 유지가 힘들면")의 재료)
// === scripts/t1402-work-day.js — 보관함 없이 사는 사람의 하루 점수: 농사(심기 · 김매기 · 물대기 · 병든 잎 · 거두기) · 수리 · 짓기 ==========
//
// ★무엇: 밭 한 두렁이 현실 하루에 내주는 "일"의 수를 작물 정본(`crops.js` 생장일 · `villages.js` 김매기 차례 L_WEEDS · 물대기 주기 L_WATERGAP)으로 센다.
//   일 한 번 = 일한 뒤 머묾 20초 × 초당 1점 = 20점(점수 꼴 'b' · `deeds.CFG` 정본 — 일과 일 사이가 20초 넘게 떨어져 있을 때 · 붙어 있으면 덜 든다).
//   게임 하루 = 세계 정본 `zone-config WORLD.dayLengthMs`(24분) → 현실 하루 = 게임 60날. 겨울 휴면(T99)은 빼지 않았다(빼면 겨울엔 김매기 · 물대기가 멎는다 — 아래 줄).
//   병든 잎(무작위 · 날마다 0.8%)은 기대값으로. 수리: 건물은 시간으로 안 낡는다(낡음 정본 없음 — 부서지는 것은 공격 · 갇힘 풀이뿐) → 0.
//   짓기: 간이 움집 한 채 = 공정 넷(터파기 · 기둥 · 뼈대 · 이엉) = 일 넷(한 번뿐).
//   node scripts/t1402-work-day.js [--json <파일>]
if (require.main === module) require('./lib-port').noCentral();
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.T1305_DEEDS = '1';
const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const D = require(path.join(ROOT, 'server', 'deeds.js'));
const W = require(path.join(ROOT, 'server', 'zone-config.js')).WORLD;
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const L_WATERGAP = +/L_WATERGAP = (\d+)/.exec(VS)[1], L_WEEDS = JSON.parse(/L_WEEDS = (\[[^\]]*\])/.exec(VS)[1]), L_PESTP = +/L_PESTP = ([\d.]+)/.exec(VS)[1];
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const GAME_PER_REAL = 86400000 / W.dayLengthMs, PT = D.CFG.Q_WORK * D.CFG.DWELL_MS / 1000;
const need = Object.fromEntries([9, 24, 40, 70, 100].map((n) => [n, D.dailyNeed(n)]));
const rows = [];
for (const c of Crops.list()) {
  const g = Crops.growDaysOf(c.id); if (!(g > 0)) continue;
  const paddy = false;   // 물대기는 그 칸 물(`supply`)이 작물 물보다 모자랄 때만 선다 — 표는 물이 넉넉한 밭(물대기 0 · 일이 가장 적은 쪽)으로 센다
  const tasks = 1 + L_WEEDS.length + L_PESTP * g + 1;   // 심기 · 김매기 · 병든 잎(기대) · 거두기(물대기는 뺐다 — 물이 모자란 밭이면 게임 ${L_WATERGAP}날마다 하나씩 더)
  const perReal = tasks * GAME_PER_REAL / g, pts = perReal * PT;
  rows.push({ id: c.id, g, paddy, tasks: +tasks.toFixed(2), perReal: +perReal.toFixed(1), pts: +pts.toFixed(0) });
}
rows.sort((a, b) => a.g - b.g);
const med = rows[Math.floor(rows.length / 2)];
const plots = (n, r) => Math.ceil(need[n] / r.pts);
console.log(`=== T1402 보관함 없이 사는 하루 — 일 한 번 ${PT}점(일한 뒤 ${D.CFG.DWELL_MS / 1000}초 × 초당 ${D.CFG.Q_WORK}) · 게임 하루 ${W.dayLengthMs / 60000}분(현실 하루 = 게임 ${GAME_PER_REAL}날) ===`);
console.log(`하루 몫: ${Object.entries(need).map(([n, v]) => `${n}칸 ${v.toFixed(1)}점`).join(' · ')}`);
console.log('| 작물 | 생장(게임 날) | 한 철의 일(심기 · 김 6벌 · 병 · 거두기) | 현실 하루 일 | 현실 하루 점수(한 두렁) | 9칸 | 24칸 | 40칸 | 70칸 | 100칸 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
const show = [rows[0], rows[1], med, rows[rows.length - 2], rows[rows.length - 1]];
for (const r of show) console.log(`| ${r.id}${r.paddy ? '(논)' : ''} | ${r.g} | ${r.tasks} | ${r.perReal} | ${r.pts} | ${plots(9, r)}두렁 | ${plots(24, r)}두렁 | ${plots(40, r)}두렁 | ${plots(70, r)}두렁 | ${plots(100, r)}두렁 |`);
console.log(`  물이 모자란 밭은 게임 ${L_WATERGAP}날마다 물대기 하나(현실 하루 ${Math.floor(GAME_PER_REAL / L_WATERGAP)}번 · ${Math.floor(GAME_PER_REAL / L_WATERGAP) * PT}점)가 더 든다.`);
console.log(`  수리 = 0(시간으로 안 낡는다) · 짓기 = 간이 움집 한 채 일 넷(${4 * PT}점 · 한 번뿐) · 보관함 = 0(판정 27)`);
console.log(`  읽기: 두렁 하나를 철마다 다시 심고 돌보는 사람은 그 두렁만으로 하루 ${med.pts}점 언저리(가운데 작물 ${med.id}) — 9 · 24칸은 한 두렁 · 40칸 ${plots(40, med)}두렁 · 70칸 ${plots(70, med)}두렁.`);
console.log('  ⚠ 겨울(작물마다 휴면)에는 김매기 · 물대기가 멎는다 — 그 철엔 거두기(월동 작물) · 짓기 · 만들기 몫만 남는다(이 표는 철을 고르게 본 기대값).');
const J = arg('--json', null); if (J) fs.writeFileSync(J, JSON.stringify({ PT, GAME_PER_REAL, need, rows }, null, 1));
