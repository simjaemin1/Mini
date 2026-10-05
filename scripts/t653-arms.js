#!/usr/bin/env node
// (러너 밖 · T653 가르기 팔 — 사본 트리에만 글자를 박는다 · 제품 무접촉 · T356/T605 문법)
// =============================================================================
// `node scripts/t653-arms.js <원본 트리> <사본 트리>` — 원본을 통째로 복사하고 econ 두 파일에 **팔 스위치**를 박는다.
//   스위치는 전부 env 로 켠다(안 켜면 사본도 원본과 같은 바이트로 돈다 — 박힌 줄은 env 를 묻고 그냥 지나간다).
//   앵커는 **한 번만** 나와야 한다(박기 전에 센다 — 0 이나 둘이면 멈춘다: 앵커가 움직였는데 조용히 안 박히면 없는 값을 낸다).
//
//   조개(T635 ①):
//     T653_NOTRADE=<품목,…>   — 그 품목을 교역 짐칸 후보에서 뺀다(가는 짐 · 오는 짐 · 오는 짐 다시 찾기 — 세 고리) = ⓐ "수요만 · 짐칸엔 안 싣게"
//     T653_NODEMAND=1         — T635 위신재 칸(v1 비축·웃돈·포만·봉헌·값 · v2 탄력·효용·위신재 표·부패)을 안 세운다 = ⓑ "짐칸만 · 수요 없음"
//     T653_NODEMAND_V1=1 · T653_NODEMAND_V2=1 — 위 칸을 v1 쪽만 · v2 쪽만 안 세운다(ⓑ 안을 가른다)
//     T653_SHELL_NOLABOR=1    — 조개 부산물을 같은 양으로 곳간에 넣되 노동 장부(잠재·실제 — 여유노동 `_idleFrac` 의 분자·분모)에 안 적는다 = ⓒ "생산 쪽"
//   바다 종(T635 ②):
//     T653_NOTRADE=<종,…>     — 위와 같은 문(짐 무게)
//     T653_SEA_DECAY=1        — 나눠 낸 종의 v2 부패율을 `fish` 의 그 수로(생선 부패)
//     T653_SEA_LABOR=1        — 직업 고르기(실현 2판)의 어부 항에 나눠 낸 종을 같은 kg 로 넣는다(어부 노동 이동)
//     T653_SEA_NOSUBS=1       — v2 자급 인출(`tickSubsistence` — 먹지 않고 지우는 인출)에서 나눠 낸 종을 뺀다
// =============================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [SRC, DST] = process.argv.slice(2);
if (!SRC || !DST) { console.error('쓰는 법: t653-arms.js <원본> <사본>'); process.exit(2); }
fs.rmSync(DST, { recursive: true, force: true });
execFileSync('cp', ['-a', SRC, DST]);
const SEA = "['red_seabream','sea_bass','mullet','black_porgy','rockfish','horse_mackerel','mackerel','herring','sardine','anchovy','shrimp','crab','octopus','squid']";
function patch(rel, edits) {
  const p = path.join(DST, rel); let s = fs.readFileSync(p, 'utf8');
  for (const [find, repl] of edits) {
    const n = s.split(find).length - 1;
    if (n !== 1) { console.error(`앵커 ${n}번(1 이어야): ${rel} :: ${find.slice(0, 80)}`); process.exit(1); }
    s = s.replace(find, typeof repl === 'function' ? repl(find) : repl);
  }
  fs.writeFileSync(p, s);
}
const NT = "((typeof process !== 'undefined' && process.env.T653_NOTRADE || '').split(',').indexOf(r) >= 0)";
patch('sim/economy-sim-v2.js', [
  ["      for (const r of TRADABLE) {\n        if (_oreBanned(r)) continue;   // ★[2026-08-02f ①-3] 원석은 산지에서만 녹인다 — 발주 후보에서 제외",
    (f) => f.replace('for (const r of TRADABLE) {', `for (const r of TRADABLE) { if (${NT}) continue;   // [T653 팔]`)],
  ["      for (const r of TRADABLE) {\n        if (_foodOnly && !FOOD_CLASSES[r]) continue;",
    (f) => f.replace('for (const r of TRADABLE) {', `for (const r of TRADABLE) { if (${NT}) continue;   // [T653 팔]`)],
  ["      for (const r of TRADABLE) {\n        if (r === c.giveRes) continue;\n        if (_oreBanned(r)) continue;",
    (f) => f.replace('for (const r of TRADABLE) {', `for (const r of TRADABLE) { if (${NT}) continue;   // [T653 팔]`)],
  ["process.env.T635_SHELL_ORNAMENT === '1' && SPECIALTY.shell_bangle) {",
    "process.env.T635_SHELL_ORNAMENT === '1' && SPECIALTY.shell_bangle && process.env.T653_NODEMAND !== '1' && process.env.T653_NODEMAND_V2 !== '1') {   // [T653 팔 ⓑ]"],
  ["  console.log(`[econ-sim-v2] specialty.js 통합:",
    (f) => `  if (process.env.T653_SEA_DECAY === '1') for (const _s of ${SEA}) if (_s in DECAY_V2) DECAY_V2[_s] = DECAY_V2.fish;   // [T653 팔]\n` + f],
  ["function tickSubsistence(v, day) {\n  const N = v.npcs.length;\n  for (const [r, perNpc] of Object.entries(SUBSISTENCE_PER_NPC)) {\n    if (r === 'food') continue;",
    (f) => f + `\n    if (process.env.T653_SEA_NOSUBS === '1' && ${SEA}.indexOf(r) >= 0) continue;   // [T653 팔]`],
]);
patch('sim/economy-sim.js', [
  ["  if (!T635_SHELL_ORNAMENT || !_t635ShellItem()) return;",
    "  if (!T635_SHELL_ORNAMENT || !_t635ShellItem() || process.env.T653_NODEMAND === '1' || process.env.T653_NODEMAND_V1 === '1') return;   // [T653 팔 ⓑ]"],
  ["addProduce('shell_bangle', baseAmt * (jdef.byproduct.oyster || 0) * v.land.shellBangle);",
    "{ const _x = baseAmt * (jdef.byproduct.oyster || 0) * v.land.shellBangle; if (process.env.T653_SHELL_NOLABOR === '1') { const _a = _x * _hpm * _hwm * _prodMul * satMul('shell_bangle') * (v._laborMul || 1) * _capM; if (_a > 0) { const _tx = _a * TAX_RATE; v.storage.shell_bangle = (v.storage.shell_bangle || 0) + (_a - _tx); v.treasury.shell_bangle = (v.treasury.shell_bangle || 0) + _tx; dailyProduction.shell_bangle = (dailyProduction.shell_bangle || 0) + _a; } } else addProduce('shell_bangle', _x); }   // [T653 팔 ⓒ]"],
  ["    case 'fisher':     return [[['fish'], () => W('fish')]];",
    "    case 'fisher':     return [[(process.env.T653_SEA_LABOR === '1' ? ['fish'].concat(Object.keys(_t635Sea)) : ['fish']), () => W('fish')]];   // [T653 팔]"],
  ["        for (let k = 0; k < keys.length; k++) q += (e[keys[k]] || 0);",
    "        for (let k = 0; k < keys.length; k++) q += (e[keys[k]] || 0) * (process.env.T653_SEA_LABOR === '1' && _t635Sea[keys[k]] != null ? _t635Sea[keys[k]] : 1);   // [T653 팔]"],
]);
console.log(`[t653-arms] 사본 ${DST} — 팔 스위치 박음(env 로 켬)`);
