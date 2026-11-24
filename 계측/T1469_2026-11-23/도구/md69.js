// md69.js — T1469 보고 표: node md69.js <ana69.json>
'use strict';
const fs = require('fs');
const o = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const f = (x, d = 1) => x == null ? '—' : (typeof x === 'number' ? (Number.isInteger(x) ? x.toLocaleString('en-US') : x.toFixed(d)) : String(x));
const R = (t) => o.runs.find((r) => r.tag === t && !r.missing);
const L = [];
L.push('### 표 1 — 진단(T1469 끔): 처음 소굴 자리 · 해마다 털 것 1위 · 비축 0 열흘 문', '');
L.push('| 시드 | 처음 소굴 셋 — 가장 가까운 마을(날 60 털 것 차례 / 51) | 털 것 1 ~ 3위(날 60) | (날 365) | (날 730) |', '|---|---|---|---|---|');
for (const d of o.diag) L.push(`| ${d.seed} | ${d.dens.map((x) => `#${x.id} ${x.near}(${x.rank60 || '—'}째)`).join(' · ')} | ${(d.top['60'] || []).map((x) => x.join(' ')).join(' · ')} | ${(d.top['365'] || []).map((x) => x.join(' ')).join(' · ') || '—'} | ${(d.top['730'] || []).map((x) => x.join(' ')).join(' · ') || '—'} |`);
L.push('');
L.push('| 판 | 비축 0 열흘 문(㉢ 흩어짐) 횟수 · 날 | 그때 흩어진 사람 |', '|---|---|---|');
for (const t of ['N_1020', 'N_7', 'N_42', 'D_1020', 'D_7', 'D_42']) { const r = R(t); if (r) L.push(`| ${t}(${r.days}날) | ${r.doors} · ${r.doorDays.map((d) => 'D' + d).join(' ') || '—'} | ${r.doorPeople} |`); }
L.push('');
L.push('### 표 2 — 판: 끔(N · D) ↔ 켬(M = 넷 다 + T1469 · MD = + T1460 · MF = + T1460 · `feed`)', '');
const order = ['N_1020', 'M_1020', 'D_1020', 'MD_1020', 'MF_1020', 'N_7', 'M_7', 'D_7', 'MD_7', 'N_42', 'M_42', 'D_42', 'MD_42', 'WN_1020', 'WM_1020'];
const runs = order.map(R).filter(Boolean);
const cols = [['날', (r) => r.days], ['옮긴 횟수(문 · 다시 문 → ㉢)', (r) => r.st9 ? `${r.moves}(${r.st9.door} · ${r.st9.again})` : '—'], ['옮긴 날', (r) => r.moveDays.map((d) => 'D' + d).join(' ') || '—'], ['옮긴 거리 가운데(칸)', (r) => f(r.moveDist)], ['걸린 날 가운데', (r) => f(r.walkDays)],
  ['옮긴 단 약탈(옮기기 전 → 뒤)', (r) => r.moves ? `${r.lootBefore != null ? r.lootBefore : '—'} → ${r.lootAfter}` : '—'], ['옮긴 단 수명 가운데', (r) => f(r.movedLife)], ['본 단 · 수명 가운데', (r) => `${r.gangsSeen} · ${f(r.lifeMed)}`], ['단원 가운데 · 가장 많음 · 가장 큰 무리', (r) => `${r.memMed} · ${r.memMax} · ${r.biggest}`],
  ['흩어진 사람(마을로)', (r) => r.home], ['굶어 죽은 도적', (r) => r.starve], ['한 마을 곁 소굴 가장 많음', (r) => r.crowd], ['약탈 건 · 털린 캐러밴 %', (r) => `${r.loot} · ${f(r.raidPct)}%`], ['행상 죽음', (r) => r.killed], ['교역 식량 수입', (r) => f(r.foodImp, 0)],
  ['인구(끝) · 끔비', (r) => `${f(r.popEnd)}${r.popRatio ? ' · ' + r.popRatio : ''}`], ['빈 마을(끝)', (r) => r.empty], ['털 것 1위 마을(끝) · 인구 · 행복', (r) => r.rich ? `${r.rich.v} · ${r.rich.pop} · ${r.rich.hap == null ? '—' : r.rich.hap}` : '—']];
L.push('| 칸 | ' + runs.map((r) => r.tag).join(' | ') + ' |', '|---|' + runs.map(() => '---').join('|') + '|');
for (const [n, g] of cols) L.push(`| ${n} | ` + runs.map(g).join(' | ') + ' |');
console.log(L.join('\n'));
