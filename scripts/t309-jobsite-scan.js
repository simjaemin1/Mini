#!/usr/bin/env node
// === scripts/t309-jobsite-scan.js — 51마을 나무·광맥 현장 후보 (계측 · 러너 밖 · 제품 0) ===
//
// ★왜 [지시 T309 ③ · `설계/설계_생산_실체.md` ⓑ]
//   관측자 없는 마을이 **실걸음**이 되면 나무꾼·광부는 **실제 나무·광맥**에 가야 한다.
//   그 자리가 있는지는 여태 물어본 적이 없다 — 지금 수식은 현장이 없어도 곳간을 채운다.
//   T301 의 `resourceAt` 이 섰으므로 이제 **청크 없이** 물을 수 있다.
//
// ★자가 짓는 값 0 — 마을 중심은 제품 시딩 줄(`findOpenCenter`)이 내고, 자원은 `resourcesAtCell` 이 낸다.
'use strict';
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.ENABLE_VILLAGES = '1';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const CH = R('server/chunk');
const { ZONES } = R('server/zone-config');
const T = R('server/terrain');
const Z = 'hanbando', ZONE = ZONES[Z], SZ = 32, CS = CH.CHUNK_SIZE;
// ★중심은 **지형 정본이 적어 둔 마을 좌표**를 그대로 쓴다(`terrain.getZoneVillages`).
//   ⚠제품이 실제로 세우는 중심은 `findOpenCenter` 가 몇 셀 옮긴다(`villages.js:1143`). 그러려면
//     지형 어댑터가 필요하고, 그 술어 한 벌(`scripts/zone-preds.js`)은 **아직 main 에 없다**
//     (T259 가지에 있고 PM 미착지). 여기서 다시 적으면 그게 사본이라 — **안 적는다.**
//     이 표는 그래서 **후보 표**다: 중심이 몇 셀 옮겨도 반경 16셀 안의 그림은 거의 같다.

const RAD = parseInt(process.env.T309_R || '16', 10);   // 마을 반경(셀) — 카드가 정한 16
const _log = console.log; console.log = () => {}; console.warn = () => {};
const picked = T.getZoneVillages(Z) || [];
console.log = _log;

const opt = { biome: ZONE.biome, chunkSize: CS };
const rows = [];
const t0 = Date.now();
for (const hv of picked) {
  const c = { ccx: Math.round(hv.x / SZ), ccy: Math.round(hv.y / SZ) };
  let tree = 0, ore = 0, rock = 0, bush = 0, maj = 0, dTree = null, dOre = null, dMaj = null;
  for (let dy = -RAD; dy <= RAD; dy++) for (let dx = -RAD; dx <= RAD; dx++) {
    // ★NPC 광부가 실제로 보는 광맥은 **씨 자원 `ore` 가 아니라 광맥 층**이다
    //   (`land.ore`·`oreProbMajorAt` 이 `isMajorOreAt` 과 짝 — `villages.js` 어댑터 `isOre`).
    //   그래서 두 열을 따로 센다: `ore`(씨 개체) · `maj`(광맥 층).
    {
      const px = (c.ccx + dx) * 32 + 16, py = (c.ccy + dy) * 32 + 16;
      let m = false; try { m = !!(T.isMajorOreAt && T.isMajorOreAt(Z, px, py)); } catch (e) { m = false; }
      if (m) { maj++; const dd = Math.round(Math.hypot(dx, dy)); if (dMaj === null || dd < dMaj) dMaj = dd; }
    }
    const a = CH.resourcesAtCell(Z, c.ccx + dx, c.ccy + dy, opt);
    if (!a.length) continue;
    const d = Math.round(Math.hypot(dx, dy));
    for (const e of a) {
      if (e.type === 'tree') { tree++; if (dTree === null || d < dTree) dTree = d; }
      else if (e.type === 'ore') { ore++; if (dOre === null || d < dOre) dOre = d; }
      else if (e.type === 'rock') rock++;
      else if (e.type === 'berry_bush') bush++;
    }
  }
  rows.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, tree, ore, maj, rock, bush, dTree, dOre, dMaj });
}
const ms = Date.now() - t0;

const f = (v) => (v === null || v === undefined ? '—' : String(v));
console.log(`\n=== T309 ⓒ 51마을 현장 후보 — 반경 ${RAD}셀(${(2 * RAD + 1) ** 2}칸) · 벽시계 ${ms}ms (마을당 ${(ms / rows.length).toFixed(0)}ms) ===`);
console.log(`\n| # | 마을 | 중심(셀) | 나무 | 광맥층 | 씨광맥 | 바위 | 덤불 | 최근접 나무 | 최근접 광맥층 |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|`);
rows.forEach((r, i) => {
  if (r.skip) { console.log(`| ${i + 1} | ${r.name} | **중심 없음** | — | — | — | — | — | — |`); return; }
  console.log(`| ${i + 1} | ${r.name} | ${r.ccx},${r.ccy} | ${r.tree} | ${r.maj} | ${r.ore} | ${r.rock} | ${r.bush} | ${f(r.dTree)} | ${f(r.dMaj)} |`);
});
const live = rows.filter((r) => !r.skip);
const noTree = live.filter((r) => r.tree === 0), noOre = live.filter((r) => r.maj === 0), noSeedOre = live.filter((r) => r.ore === 0);
const md = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
console.log(`\n  마을 ${live.length}곳 (중심 없음 ${rows.length - live.length})`);
console.log(`  나무 — 중앙 ${md(live.map((r) => r.tree))} · **0인 마을 ${noTree.length}곳**${noTree.length ? ': ' + noTree.map((r) => r.name).join(', ') : ''}`);
console.log(`  광맥층(NPC 광부가 보는 것) — 중앙 ${md(live.map((r) => r.maj))} · **0인 마을 ${noOre.length}곳**${noOre.length ? ': ' + noOre.map((r) => r.name).join(', ') : ''}`);
console.log(`  씨 광맥 개체 — 중앙 ${md(live.map((r) => r.ore))} · 0인 마을 ${noSeedOre.length}곳`);
console.log(`  바위 — 중앙 ${md(live.map((r) => r.rock))} · 덤불 중앙 ${md(live.map((r) => r.bush))}`);
if (process.env.T309_JSON) require('fs').writeFileSync(process.env.T309_JSON, JSON.stringify(rows, null, 1));
console.log('');
