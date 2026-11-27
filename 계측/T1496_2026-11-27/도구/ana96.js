'use strict';
// T1496 진단 표 — node ana96.js <run.json.t1496.json> [<run.json.t1460.json>] → JSON 한 줄(요약)
const fs = require('fs');
const X = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const Y = process.argv[3] && fs.existsSync(process.argv[3]) ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')) : null;
const TOOLS = ['tool', 'iron_tool', 'bronze_tool'], ARMS = ['weapon', 'armor'].concat(TOOLS);
const r1 = (x) => Math.round(x * 10) / 10;
const lootAll = Object.values(X.loot).reduce((a, o) => a + o.n, 0);
const lootTool = TOOLS.reduce((a, k) => a + ((X.loot[k] && X.loot[k].n) || 0), 0);
const lootToolAmt = TOOLS.reduce((a, k) => a + ((X.loot[k] && X.loot[k].amt) || 0), 0);
const lootArms = ARMS.reduce((a, k) => a + ((X.loot[k] && X.loot[k].n) || 0), 0);
const top = Object.entries(X.loot).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([k, o]) => `${k} ${o.n}`).join(' · ');
const gt = Object.entries(X.gangTools);
const gTool = gt.filter(([, r]) => r.max > 0);
const cpu = X.cpu || [];
const seg = (a, b) => { const s = cpu.filter((r) => r[0] >= a && r[0] <= b); return s.length ? r1(s.reduce((q, r) => q + r[1], 0) / s.length * 100) / 100 : null; };
const rssMax = cpu.reduce((m, r) => Math.max(m, r[2]), 0);
const huntTot = (X.hunt || []).reduce((a, r) => a + (r[1] || 0), 0), forTot = (X.hunt || []).reduce((a, r) => a + (r[2] || 0), 0);
const huntDays = (X.hunt || []).filter((r) => r[1] > 0).length;
const mobsMax = (X.mobs || []).reduce((m, s) => Math.max(m, s.all), 0);
const mobsNear = (X.mobs || []).reduce((m, s) => Math.max(m, s.rows.reduce((q, r) => Math.max(q, r.mobs), 0)), 0);
const walks = Object.entries(X.walk || {}).map(([d, s]) => [+d, s.max]);
const wMax = walks.reduce((m, r) => (r[1] > m[1] ? r : m), [null, 0]);
const cen = Object.values(X.census || {}).map((c) => `D${c.day} 마을몸 ${c.vilNpc} · 무기짐 쥔 몸 ${c.withArms} · 도구 ${c.withTool} · 도구품 ${c.toolItems} · 전사 ${c.warrior}(무기 ${c.warriorArms}) · 단몸 ${c.gangBodies} 짐 ${JSON.stringify(c.gangArms)}`);
let band = null;
if (Y) {
  // 단마다 30날 표본 — 둘레 사냥터 장부 짐승(bandAnimals) · 칸(bandCells)
  const s = []; for (const g of Y.gangs || []) for (const t of g.t60 || []) s.push(t.bandAnimals || 0);
  s.sort((a, b) => a - b); band = s.length ? { n: s.length, med: Math.round(s[s.length >> 1]), max: Math.round(s[s.length - 1]) } : null;
}
const out = {
  lastDay: X.lastDay, hostSeen: X.hostSeen || 0,
  join: X.joinSum, joinRows: (X.joins || []).length,
  census: cen,
  npcKeys: X.npcKeys,
  loot: { all: lootAll, tool: lootTool, toolAmt: r1(lootToolAmt), arms: lootArms, perYear: X.lastDay ? r1(lootTool / X.lastDay * 365) : null, top },
  lootByGang: X.lootByGang,
  gangs: gt.length, gangsWithTool: gTool.length, gangToolRows: gTool.map(([id, r]) => ({ id, first: r.first, last: r.last, max: r.max, end: r.end })),
  hunt: { tot: r1(huntTot), forage: r1(forTot), days: huntDays }, band,
  mobs: { worldMax: mobsMax, nearDenMax: mobsNear },
  walk: { maxDay: wMax[0], maxCells: wMax[1], over2880: walks.filter((r) => r[1] > 2880).length, days: walks.length },
  cpu: { d1_100: seg(1, 100), d300_400: seg(300, 400), d400_500: seg(400, 500), d600_730: seg(600, 730), all: seg(1, 9999), rssMaxMB: rssMax },
  prof: X.prof,
};
console.log(JSON.stringify(out, null, 1));
