#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T604 추신2 ② · 추신3 ③④ 표 기계 · 관측 전용 · 세계 무변 · 판정 0)
// =============================================================================
// **해안 평행이동 표** — 존마다 `coastShift`(셀)를 이 자 안에서만 걸고(zone-config 정본 무변 · `cfg` = 정본 값 그대로) 정본 띠
//   `chunk.generateCoastlineWaterTiles`(env `T588_COAST` = 안 · 사본 0)를 구워, 띠 위에 놓인 **정본 지형**을 센다.
//   ⓐ 띠 깊이 — 바다 변마다 열(남·북변)·줄(동·서변)을 따라 변에서 첫 뭍까지 이어진 바다 칸 수(셀) · 최소/중앙/최대
//      (꼭짓점으로만 닿는 존은 꼭짓점에서 가장 먼 띠 칸까지 = 반지름)
//   ⓑ 띠 몫 % · 늘어난 뭍(같은 안 첫 이동 대비 뭍이 된 칸)
//   ⓒ 바다 위 정본 — 강 길 점(줄) · 마을 후보 · 광맥 중심 · 숲 중심(`terrain` 정본 json · 존 local px → 칸) · 바닷가 후보(960px — `land.coastal` 뜻)
//   ⓓ ★[T604 추신3] 경계 앞 바다 지킴 — 셀 중심이 바다 존 사각에서 `HANDOFF_COMMIT`(zone-config 정본 · 8셀) 안인데 뭍인 칸
//      (= 경계 앞 바다가 8셀보다 얇은 곳) · 변별 이어진 구간으로 · `--noguard` 면 지킴을 뺀 식(max(0, d − s))으로 잰다(지킴이 없으면 어디가 얇아지나)
// 쓰는 법: node scripts/t604-coast-shift.js <out.json> [안…=off,b] [이동…=0,30,60,90] [존…=hanbando,nippon,jungwon_n] [--noguard] [--list]
//   안: `off` = `T588_COAST=0`(지금 식 — ★추신3 이동을 안 먹는다) · `a`/`b` = 그 값 · `def` = 손잡이 없음(★추신3 기본 = b) · 이동: 셀 수 또는 `cfg`(zone-config 정본 값 그대로)
//   표(마크다운)는 stdout · `--list` 면 바다 위 정본 목록(강 점 · 마을 · 광맥 · 숲 — 존 local px · 칸)도 stdout
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const ARGV = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const NOGUARD = process.argv.includes('--noguard'), LIST = process.argv.includes('--list');
const OUT = ARGV[0] || '/tmp/t604-shift.json';
const ARMS = String(ARGV[1] || 'off,b').split(',').filter(Boolean);
const SHIFTS = String(ARGV[2] || '0,30,60,90').split(',').map((v) => (v === 'cfg' ? 'cfg' : Number(v)));
const ZS = String(ARGV[3] || 'hanbando,nippon,jungwon_n').split(',').filter(Boolean);
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const chunk = R('server/chunk');
const CS = R('public/coast-shape.js');
const KEEP = R('server/zone-config').HANDOFF_COMMIT;   // ★추신3 지킴 폭 = 핸드오프 겹침 띠(정본 zone-config)
if (NOGUARD) CS.shiftDepth = (d, s) => (s === 0 ? d : Math.max(0, d - s));   // 지킴 뺀 식(추신2 판) — 이 자 안에서만
const SZ = 32;
const COAST_PX = (() => { const v = parseFloat(process.env.T17_COAST_PX || ''); return (isFinite(v) && v > 0) ? v : 960; })();   // villages.js 와 같은 뜻
const OCEAN = Object.entries(ZONES).filter(([, z]) => z.isOcean).map(([id, z]) => ({ id, x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const OR = OCEAN.map(({ x0, y0, x1, y1 }) => ({ x0, y0, x1, y1 }));
function band(Z, arm, shift) {
  const prevK = process.env.T588_COAST, prevS = ZONES[Z].coastShift;
  if (arm === 'off') process.env.T588_COAST = '0'; else if (arm === 'def') delete process.env.T588_COAST; else process.env.T588_COAST = arm;
  if (shift !== 'cfg') { if (shift > 0) ZONES[Z].coastShift = shift; else delete ZONES[Z].coastShift; }
  try {
    const ZONE = { ...ZONES[Z], id: Z }, NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ);
    const s = chunk.generateCoastlineWaterTiles(ZONE, SZ, findZoneAt, OR);
    const M = new Uint8Array(NX * NY);
    for (const k of s) { const u = k.indexOf('_'); M[+k.slice(u + 1) * NX + +k.slice(0, u)] = 1; }
    return { M, NX, NY, n: s.size, shiftUsed: ZONES[Z].coastShift || 0 };
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
const REACH = Math.ceil(Math.max(6000 + 5000, ...Object.values(CS.AMP_B).map((a) => 6000 + a)) / SZ) + 2;
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
  for (let t = sd.a; t < sd.b; t++) v.push(runDepth(B, sd.side, t));
  v.sort((p, q) => p - q);
  return { min: v[0], med: v[Math.floor(v.length / 2)], max: v[v.length - 1], n: v.length };
}
function runDepth(B, side, t) {   // 변 side 의 t 번째 열(남·북)·줄(동·서)에서 변부터 이어진 바다 칸 수
  const { M, NX, NY } = B; let d = 0;
  if (side === 'S') { let y = NY - 1; while (y >= 0 && M[y * NX + t]) { d++; y--; } }
  else if (side === 'N') { let y = 0; while (y < NY && M[y * NX + t]) { d++; y++; } }
  else if (side === 'E') { let x = NX - 1; while (x >= 0 && M[t * NX + x]) { d++; x--; } }
  else { let x = 0; while (x < NX && M[t * NX + x]) { d++; x++; } }
  return d;
}
// ⓓ 경계 앞 바다 지킴 — 셀 중심에서 가장 가까운 바다 존 사각까지 < KEEP(생성기와 같은 d)인데 뭍인 칸 · 변별 이어진 구간
function keepCheck(Z, B) {
  const z = ZONES[Z], { M, NX, NY } = B, Rc = Math.ceil(KEEP / SZ) + 1, bad = [];
  const consider = (x, y) => {
    const ax = z.worldOffsetX + x * SZ + SZ / 2, ay = z.worldOffsetY + y * SZ + SZ / 2;
    let bd = Infinity, side = '';
    for (const O of OCEAN) {
      const nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax), ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay);
      const d = Math.hypot(ax - nx, ay - ny);
      if (d < bd) { bd = d; side = (ny === O.y0 && ay < O.y0 && nx > O.x0 && nx < O.x1) ? 'S' : (ny === O.y1 && ay > O.y1 && nx > O.x0 && nx < O.x1) ? 'N'
        : (nx === O.x0 && ax < O.x0 && ny > O.y0 && ny < O.y1) ? 'E' : (nx === O.x1 && ax > O.x1 && ny > O.y0 && ny < O.y1) ? 'W' : 'corner'; }
    }
    if (bd < KEEP && !M[y * NX + x]) bad.push({ x, y, side, d: Math.round(bd) });
  };
  const seen = new Uint8Array(NX * NY);
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
    if (Math.min(x, y, NX - 1 - x, NY - 1 - y) >= Rc) { x = NX - 1 - Rc; continue; }   // 테두리 Rc 칸 안만
    if (seen[y * NX + x]) continue; seen[y * NX + x] = 1; consider(x, y);
  }
  // 변별 구간(남·북 = 열 · 동·서 = 줄) — 그 열·줄의 이어진 바다 깊이 최소
  const runs = [];
  for (const sd of ['S', 'N', 'E', 'W', 'corner']) {
    const ts = [...new Set(bad.filter((b) => b.side === sd).map((b) => (sd === 'S' || sd === 'N') ? b.x : (sd === 'corner' ? b.x * 100000 + b.y : b.y)))].sort((p, q) => p - q);
    let i = 0;
    while (i < ts.length) {
      let j = i; while (j + 1 < ts.length && ts[j + 1] === ts[j] + 1) j++;
      let dmin = Infinity; if (sd !== 'corner') for (let t = ts[i]; t <= ts[j]; t++) dmin = Math.min(dmin, runDepth(B, sd, t));
      runs.push({ side: sd, from: ts[i], to: ts[j], n: ts[j] - ts[i] + 1, minDepth: sd === 'corner' ? null : dmin });
      i = j + 1;
    }
  }
  return { cells: bad.length, runs };
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
    return { name: rv.name, pts: P.length, onSea: n, idx, at: idx.map((i) => [Math.round(P[i][0]), Math.round(P[i][1])]) };
  });
  const rvSea = rivers.filter((r) => r.onSea > 0);
  const vills = (T.getZoneVillages(Z) || TT.villages || []);
  const vSeaO = vills.filter((v) => seaAt(B, v.x, v.y));
  const vCoast = vills.filter((v) => seaDist(B, v.x, v.y, Math.ceil(COAST_PX / SZ) + 1) <= COAST_PX).map((v) => v.name);
  const oSeaO = (TT.ores || []).filter((o) => o.center && seaAt(B, o.center[0], o.center[1]));
  const fSeaO = (TT.forests || []).filter((f) => f.center && seaAt(B, f.center[0], f.center[1]));
  return { riverPts: rvSea.reduce((a, r) => a + r.onSea, 0), riverLines: rvSea.length, rivers: rvSea,
    villSea: vSeaO.map((v) => v.name), villCoastal: vCoast, oreSea: oSeaO.length, oreSeaNames: oSeaO.map((o) => o.name), forestSea: fSeaO.map((f) => f.name),
    detail: { villages: vSeaO.map((v) => ({ name: v.name, x: Math.round(v.x), y: Math.round(v.y) })),
      ores: oSeaO.map((o) => ({ name: o.name, x: Math.round(o.center[0]), y: Math.round(o.center[1]), mineral: o.mineral || null, radius: o.radius || null, minor: !!o.minor })),
      forests: fSeaO.map((f) => ({ name: f.name, x: Math.round(f.center[0]), y: Math.round(f.center[1]) })) } };
}
const out = { arms: ARMS, shifts: SHIFTS, noguard: NOGUARD, keepPx: KEEP, zones: {} };
for (const Z of ZS) {
  const sides = sidesOf(Z); out.zones[Z] = { sides, NX: Math.ceil(ZONES[Z].zoneWidth / SZ), NY: Math.ceil(ZONES[Z].zoneHeight / SZ), rows: [] };
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
      const row = { arm, shift: sh, shiftUsed: B.shiftUsed, band: B.n, bandPct: +(100 * B.n / (B.NX * B.NY)).toFixed(3), gained,
        depth: sides.map((sd) => Object.assign({ side: sd.side === 'corner' ? 'corner:' + sd.corner : sd.side }, depthStats(B, sd, sides))), canon: canon(Z, B),
        keep: keepCheck(Z, B), ms: Date.now() - t0 };
      out.zones[Z].rows.push(row);
      console.error(`[${Z}] ${arm} ${sh}${sh === 'cfg' ? '=' + B.shiftUsed : ''}셀${NOGUARD ? ' (지킴 뺌)' : ''} · 띠 ${row.bandPct}% · 깊이 ${row.depth.map((d) => d.side + ' ' + (d.radius != null ? 'r' + d.radius : d.min + '/' + d.med + '/' + d.max)).join(' ')} · 강 점 ${row.canon.riverPts}(${row.canon.riverLines}) · 마을 ${row.canon.villSea.length} · 광맥 ${row.canon.oreSea} · 숲 ${row.canon.forestSea.length} · 바닷가 ${row.canon.villCoastal.length} · 늘어난 뭍 ${gained} · 8셀 못 지킨 칸 ${row.keep.cells}(${row.keep.runs.length}구간) · ${row.ms}ms`);
    }
  }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
// 표(마크다운)
const KO = { hanbando: '한반도', nippon: '닛폰', jungwon_n: '중원북' };
const ARMKO = { off: '끔(지금 식)', def: '기본(b)', a: 'a', b: 'b' };
const L = ['| 존 · 안 | 이동(셀) | 띠 깊이 최소/중앙/최대(셀) | 띠 몫 % | 바다 위 강 점(줄) | 마을 | 광맥 | 숲 | 바닷가 후보(960px) | 늘어난 뭍(칸) | 경계 앞 8셀 못 지킨 칸(구간) |', '|---|---:|---|---:|---|---:|---:|---:|---|---:|---:|'];
for (const Z of ZS) for (const r of out.zones[Z].rows) {
  const dp = r.depth.map((d) => (r.depth.length > 1 ? d.side + ' ' : '') + (d.radius != null ? '반지름 ' + d.radius : `${d.min}/${d.med}/${d.max}`)).join(' · ');
  L.push(`| ${KO[Z] || Z} · ${ARMKO[r.arm] || r.arm} | ${r.shift === 'cfg' ? r.shiftUsed + '(정본)' : r.shift} | ${dp} | ${r.bandPct.toFixed(2)} | ${r.canon.riverPts}(${r.canon.riverLines}) | ${r.canon.villSea.length}${r.canon.villSea.length ? '(' + r.canon.villSea.join('·') + ')' : ''} | ${r.canon.oreSea} | ${r.canon.forestSea.length} | ${r.canon.villCoastal.length}${r.canon.villCoastal.length ? '(' + r.canon.villCoastal.join('·') + ')' : ''} | ${r.gained.toLocaleString()} | ${r.keep.cells.toLocaleString()}(${r.keep.runs.length}) |`);
}
console.log(L.join('\n'));
if (LIST) {   // 바다 위 정본 목록(지우지 않는다 — 재민이 에디터에서 고친다) · 존 local px · 칸 = ⌊px/32⌋
  for (const Z of ZS) for (const r of out.zones[Z].rows) {
    const c = r.canon, cl = (x, y) => `(${x}, ${y}) · 칸 (${Math.floor(x / SZ)}, ${Math.floor(y / SZ)})`;
    console.log(`\n### ${KO[Z] || Z} · ${ARMKO[r.arm] || r.arm} · 이동 ${r.shift === 'cfg' ? r.shiftUsed : r.shift}셀 — 바다 위 강 점 ${c.riverPts}(${c.riverLines}줄) · 마을 ${c.villSea.length} · 광맥 ${c.oreSea} · 숲 ${c.forestSea.length}`);
    for (const rv of c.rivers) {
      const runs = []; let i = 0; while (i < rv.idx.length) { let j = i; while (j + 1 < rv.idx.length && rv.idx[j + 1] === rv.idx[j] + 1) j++; runs.push(i === j ? `${rv.idx[i]}` : `${rv.idx[i]}~${rv.idx[j]}`); i = j + 1; }
      const a = rv.at[0], b = rv.at[rv.at.length - 1];
      console.log(`* 강 **${rv.name}** — 길 점 ${rv.pts}개 중 ${rv.onSea}개 바다 위(점 번호 ${runs.join(' · ')}) · 바다 위 첫 점 ${cl(a[0], a[1])} → 바다 위 끝 점 ${cl(b[0], b[1])}`);
    }
    for (const v of c.detail.villages) console.log(`* 마을 후보 **${v.name}** — ${cl(v.x, v.y)}`);
    for (const o of c.detail.ores) console.log(`* 광맥 **${o.name}**(${o.mineral || '?'}${o.radius ? ' · 반지름 ' + o.radius + 'px' : ''}${o.minor ? ' · minor' : ''}) — 중심 ${cl(o.x, o.y)}`);
    for (const f of c.detail.forests) console.log(`* 숲 **${f.name}** — 중심 ${cl(f.x, f.y)}`);
  }
}
