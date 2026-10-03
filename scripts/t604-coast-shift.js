#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T604 추신2 ② 표 기계 · 관측 전용 · 세계 무변 · 판정 0)
// =============================================================================
// **해안 평행이동 표** — 존마다 `coastShift`(셀)를 이 자 안에서만 걸고(zone-config 정본 무변) 정본 띠
//   `chunk.generateCoastlineWaterTiles`(env `T588_COAST` = 안 · 사본 0)를 구워, 띠 위에 놓인 **정본 지형**을 센다.
//   ⓐ 띠 깊이 — 바다 변마다 열(남·북변)·줄(동·서변)을 따라 변에서 첫 뭍까지 이어진 바다 칸 수(셀) · 최소/중앙/최대
//      (꼭짓점으로만 닿는 존은 꼭짓점에서 가장 먼 띠 칸까지 = 반지름)
//   ⓑ 띠 몫 % · 늘어난 뭍(같은 안 이동 0 대비 뭍이 된 칸)
//   ⓒ 바다 위 정본 — 강 길 점(줄) · 마을 후보 · 광맥 중심 · 숲 중심(`terrain` 정본 json · 존 local px → 칸) · 바닷가 후보(960px — `land.coastal` 뜻)
// 쓰는 법: node scripts/t604-coast-shift.js <out.json> [안…=off,b] [이동…=0,30,60,90] [존…=hanbando,nippon,jungwon_n]
//   (안 `off` = 손잡이 끔 · `a`/`b` = `T588_COAST` 값) — 표(마크다운)는 stdout
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const OUT = process.argv[2] || '/tmp/t604-shift.json';
const ARMS = String(process.argv[3] || 'off,b').split(',').filter(Boolean);
const SHIFTS = String(process.argv[4] || '0,30,60,90').split(',').map(Number);
const ZS = String(process.argv[5] || 'hanbando,nippon,jungwon_n').split(',').filter(Boolean);
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const chunk = R('server/chunk');
const SZ = 32;
const COAST_PX = (() => { const v = parseFloat(process.env.T17_COAST_PX || ''); return (isFinite(v) && v > 0) ? v : 960; })();   // villages.js 와 같은 뜻
const OCEAN = Object.entries(ZONES).filter(([, z]) => z.isOcean).map(([id, z]) => ({ id, x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const OR = OCEAN.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));
function band(Z, arm, shift) {
  const prevK = process.env.T588_COAST, prevS = ZONES[Z].coastShift;
  if (arm && arm !== 'off') process.env.T588_COAST = arm; else delete process.env.T588_COAST;
  if (shift > 0) ZONES[Z].coastShift = shift; else delete ZONES[Z].coastShift;
  try {
    const ZONE = { ...ZONES[Z], id: Z }, NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ);
    const s = chunk.generateCoastlineWaterTiles(ZONE, SZ, findZoneAt, OR);
    const M = new Uint8Array(NX * NY);
    for (const k of s) { const u = k.indexOf('_'); M[+k.slice(u + 1) * NX + +k.slice(0, u)] = 1; }
    return { M, NX, NY, n: s.size };
  } finally {
    if (prevK === undefined) delete process.env.T588_COAST; else process.env.T588_COAST = prevK;
    if (prevS === undefined) delete ZONES[Z].coastShift; else ZONES[Z].coastShift = prevS;
  }
}
// 바다 변(셀 범위) · 꼭짓점 — t588-coast-mask.js 와 같은 가르기
function sidesOf(Z) {
  const z = ZONES[Z], zx0 = z.worldOffsetX, zy0 = z.worldOffsetY, zx1 = zx0 + z.zoneWidth, zy1 = zy0 + z.zoneHeight, out = [];
  for (const O of OCEAN) {
    const ox = [Math.max(zx0, O.x0), Math.min(zx1, O.x1)], oy = [Math.max(zy0, O.y0), Math.min(zy1, O.y1)];
    if (O.y1 === zy0 && ox[0] < ox[1]) out.push({ side: 'N', ocean: O.id, a: Math.floor((ox[0] - zx0) / SZ), b: Math.ceil((ox[1] - zx0) / SZ) });
    if (O.y0 === zy1 && ox[0] < ox[1]) out.push({ side: 'S', ocean: O.id, a: Math.floor((ox[0] - zx0) / SZ), b: Math.ceil((ox[1] - zx0) / SZ) });
    if (O.x1 === zx0 && oy[0] < oy[1]) out.push({ side: 'W', ocean: O.id, a: Math.floor((oy[0] - zy0) / SZ), b: Math.ceil((oy[1] - zy0) / SZ) });
    if (O.x0 === zx1 && oy[0] < oy[1]) out.push({ side: 'E', ocean: O.id, a: Math.floor((oy[0] - zy0) / SZ), b: Math.ceil((oy[1] - zy0) / SZ) });
  }
  if (!out.length) {   // 꼭짓점으로만 닿는 바다
    for (const O of OCEAN) for (const [cx, cy, nm] of [[zx0, zy0, 'NW'], [zx1, zy0, 'NE'], [zx0, zy1, 'SW'], [zx1, zy1, 'SE']]) {
      if ((cx === O.x0 || cx === O.x1) && (cy === O.y0 || cy === O.y1)) out.push({ side: 'corner', corner: nm, ocean: O.id, cx: (cx - zx0) / SZ, cy: (cy - zy0) / SZ });
    }
  }
  return out;
}
// 띠가 닿을 수 있는 가장 깊은 곳(셀) — 수직인 다른 바다 변의 띠와 겹치는 모서리 열·줄은 그 변 몫이라 뺀다
const REACH = Math.ceil(Math.max(6000 + 5000, ...Object.values(R('public/coast-shape.js').AMP_B).map((a) => 6000 + a)) / SZ) + 2;
function depthStats(B, sd, sides) {
  const { M, NX, NY } = B, v = [];
  const has = (k) => sides.some((q) => q.side === k);
  let lo = sd.a, hi = sd.b;
  if (sd.side === 'S' || sd.side === 'N') { if (has('W')) lo = Math.max(lo, REACH); if (has('E')) hi = Math.min(hi, NX - REACH); }
  else if (sd.side === 'E' || sd.side === 'W') { if (has('N')) lo = Math.max(lo, REACH); if (has('S')) hi = Math.min(hi, NY - REACH); }
  sd = Object.assign({}, sd, { a: lo, b: hi });
  if (sd.side === 'corner') {   // 꼭짓점에서 가장 먼 띠 칸(셀 중심 · 반지름)
    let mx = 0; for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if (M[y * NX + x]) { const d = Math.hypot(x + 0.5 - sd.cx, y + 0.5 - sd.cy); if (d > mx) mx = d; }
    return { radius: Math.round(mx) };
  }
  for (let t = sd.a; t < sd.b; t++) {
    let d = 0;
    if (sd.side === 'S') { let y = NY - 1; while (y >= 0 && M[y * NX + t]) { d++; y--; } }
    else if (sd.side === 'N') { let y = 0; while (y < NY && M[y * NX + t]) { d++; y++; } }
    else if (sd.side === 'E') { let x = NX - 1; while (x >= 0 && M[t * NX + x]) { d++; x--; } }
    else { let x = 0; while (x < NX && M[t * NX + x]) { d++; x++; } }
    v.push(d);
  }
  v.sort((p, q) => p - q);
  return { min: v[0], med: v[Math.floor(v.length / 2)], max: v[v.length - 1], n: v.length };
}
const cellOf = (x, y) => [Math.floor(x / SZ), Math.floor(y / SZ)];
const seaAt = (B, x, y) => { const [cx, cy] = cellOf(x, y); return cx >= 0 && cy >= 0 && cx < B.NX && cy < B.NY && B.M[cy * B.NX + cx] === 1; };
function seaDist(B, x, y, Rc) {
  const [cx, cy] = cellOf(x, y); let best = Infinity;
  for (let dy = -Rc; dy <= Rc; dy++) { const yy = cy + dy; if (yy < 0 || yy >= B.NY) continue;
    for (let dx = -Rc; dx <= Rc; dx++) { const xx = cx + dx; if (xx < 0 || xx >= B.NX) continue; if (B.M[yy * B.NX + xx] === 1) { const d = dx * dx + dy * dy; if (d < best) best = d; } } }
  return best === Infinity ? Infinity : Math.sqrt(best) * SZ;
}
function canon(Z, B) {
  const TT = T.ZONE_TERRAIN[Z] || {};
  const rivers = (TT.rivers || []).filter((rv) => rv.path && rv.path.length).map((rv) => {
    const P = rv.path.map((p) => (p.pos ? p.pos : p));
    let n = 0; const idx = []; P.forEach((p, i) => { if (seaAt(B, p[0], p[1])) { n++; idx.push(i); } });
    return { name: rv.name, pts: P.length, onSea: n, idx };
  });
  const rvSea = rivers.filter((r) => r.onSea > 0);
  const vills = (T.getZoneVillages(Z) || TT.villages || []);
  const vSea = vills.filter((v) => seaAt(B, v.x, v.y)).map((v) => v.name);
  const vCoast = vills.filter((v) => seaDist(B, v.x, v.y, Math.ceil(COAST_PX / SZ) + 1) <= COAST_PX).map((v) => v.name);
  const oSea = (TT.ores || []).filter((o) => o.center && seaAt(B, o.center[0], o.center[1])).map((o) => o.name);
  const fSea = (TT.forests || []).filter((f) => f.center && seaAt(B, f.center[0], f.center[1])).map((f) => f.name);
  return { riverPts: rvSea.reduce((a, r) => a + r.onSea, 0), riverLines: rvSea.length, rivers: rvSea.map((r) => ({ name: r.name, onSea: r.onSea, pts: r.pts })),
    villSea: vSea, villCoastal: vCoast, oreSea: oSea.length, oreSeaNames: oSea, forestSea: fSea };
}
const out = { arms: ARMS, shifts: SHIFTS, zones: {} };
for (const Z of ZS) {
  const sides = sidesOf(Z); out.zones[Z] = { sides, rows: [] };
  { // 그림용 정본 자리(존 local px) — 강 길 · 마을 후보 · 광맥 중심 · 숲 중심(그림이 같은 자리를 칠한다 · 사본 0)
    const TT = T.ZONE_TERRAIN[Z] || {};
    out.zones[Z].canonPos = {
      rivers: (TT.rivers || []).filter((rv) => rv.path && rv.path.length).map((rv) => ({ name: rv.name, path: rv.path.map((p) => (p.pos ? p.pos : p)), w: rv.path.map((p) => (p.width != null ? p.width : (rv.width || 0))) })),
      villages: (T.getZoneVillages(Z) || TT.villages || []).map((v) => ({ name: v.name, x: v.x, y: v.y })),
      ores: (TT.ores || []).filter((o) => o.center).map((o) => ({ name: o.name, x: o.center[0], y: o.center[1] })),
      forests: (TT.forests || []).filter((f) => f.center).map((f) => ({ name: f.name, x: f.center[0], y: f.center[1] })) };
  }
  for (const arm of ARMS) {
    let B0 = null;
    for (const sh of SHIFTS) {
      const t0 = Date.now(), B = band(Z, arm, sh); if (sh === SHIFTS[0]) B0 = B;
      let gained = 0; if (B0 && B !== B0) for (let i = 0; i < B.M.length; i++) if (B0.M[i] && !B.M[i]) gained++;
      const row = { arm, shift: sh, band: B.n, bandPct: +(100 * B.n / (B.NX * B.NY)).toFixed(3), gained,
        depth: sides.map((sd) => Object.assign({ side: sd.side === 'corner' ? 'corner:' + sd.corner : sd.side }, depthStats(B, sd, sides))), canon: canon(Z, B), ms: Date.now() - t0 };
      out.zones[Z].rows.push(row);
      console.error(`[${Z}] ${arm} ${sh}셀 · 띠 ${row.bandPct}% · 깊이 ${row.depth.map((d) => d.side + ' ' + (d.radius != null ? 'r' + d.radius : d.min + '/' + d.med + '/' + d.max)).join(' ')} · 강 점 ${row.canon.riverPts}(${row.canon.riverLines}) · 마을 ${row.canon.villSea.length} · 광맥 ${row.canon.oreSea} · 숲 ${row.canon.forestSea.length} · 바닷가 ${row.canon.villCoastal.length} · 늘어난 뭍 ${gained} · ${row.ms}ms`);
    }
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
// 표(마크다운)
const KO = { hanbando: '한반도', nippon: '닛폰', jungwon_n: '중원북' };
const L = ['| 존 · 안 | 이동(셀) | 띠 깊이 최소/중앙/최대(셀) | 띠 몫 % | 바다 위 강 점(줄) | 마을 | 광맥 | 숲 | 바닷가 후보(960px) | 늘어난 뭍(칸) |', '|---|---:|---|---:|---|---:|---:|---:|---|---:|'];
for (const Z of ZS) for (const r of out.zones[Z].rows) {
  const dp = r.depth.map((d) => (r.depth.length > 1 ? d.side + ' ' : '') + (d.radius != null ? '반지름 ' + d.radius : `${d.min}/${d.med}/${d.max}`)).join(' · ');
  L.push(`| ${KO[Z] || Z} · ${r.arm === 'off' ? '끔' : r.arm} | ${r.shift} | ${dp} | ${r.bandPct.toFixed(2)} | ${r.canon.riverPts}(${r.canon.riverLines}) | ${r.canon.villSea.length}${r.canon.villSea.length ? '(' + r.canon.villSea.join('·') + ')' : ''} | ${r.canon.oreSea} | ${r.canon.forestSea.length} | ${r.canon.villCoastal.length}${r.canon.villCoastal.length ? '(' + r.canon.villCoastal.join('·') + ')' : ''} | ${r.gained.toLocaleString()} |`);
}
console.log(L.join('\n'));
