#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T588 ④ 표 기계 · 관측 전용 · 세계 무변 · 판정 0)
// =============================================================================
// T588 ④ — 해안 손잡이를 켜면(**안 a · b**) 바다 띠가 바뀌는 자리에 **무엇이 있었나**를 지금(끔)과 견준다.
//   띠 = 정본 `chunk.generateCoastlineWaterTiles`(env `T588_COAST` 만 다르다 · 사본 0) · 지형 = `terrain.js` 술어(존이 걷기에 쓰는 그것):
//   민물 `isWaterCellLocal` · 바위 `isRockCellLocal` · 숲 `getForestMultiplier > 1.5`(T524 뜻) · 광맥 `isOreClusterAt` · 셀 중심 표본.
//   ⓐ 잃는 뭍 / 얻는 뭍(셀) — 그중 숲 · 광맥 · 바위 · 민물(강·호수)이 바다가 되는 칸
//   ⓑ 마을 후보(정본 `villages` 칸) — 중심 칸이 바다 · **바닷가**(가장 가까운 띠 물칸까지 ≤ `T17_COAST_PX` 960px = `land.coastal` · 소금) 바뀜
//   ⓒ 광맥(정본 `ores`) — 중심이 바다인 광맥 · ⓓ 호수 — 띠 바다와 겹치거나 맞닿는 호수
//   ⓔ 강 — 하구(폭이 넓은 끝 · T549 문법)가 띠 바다에 닿나(반폭 + 2셀 안) · 발원(좁은 끝)이 바다 안인가 · 길 점 중 바다 몫
//   ⓕ 갯벌 칸 — 물때 층(`salt.isTidalFlat`)의 뜻 그대로 센 칸 수(뭍 · 8방에 바다) · 구간별(구간 상자 안)
// 쓰는 법: node scripts/t588-coast-impact.js <zoneId> <out.json> [안…=a,b]   (env 는 이 자가 안마다 바꾼다)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando', OUT = process.argv[3] || '/tmp/t588-impact.json';
const ARMS = String(process.argv[4] || 'a,b').split(',').filter(Boolean);
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const chunk = R('server/chunk');
const SZ = 32, ZONE = { ...ZONES[Z], id: Z }, NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ);
const COAST_PX = (() => { const v = parseFloat(process.env.T17_COAST_PX || ''); return (isFinite(v) && v > 0) ? v : 960; })();   // villages.js SALT_COAST_PX 와 같은 뜻
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
function band(arm) {
  const prev = process.env.T588_COAST;
  if (arm) process.env.T588_COAST = arm; else delete process.env.T588_COAST;
  const s = chunk.generateCoastlineWaterTiles(ZONE, SZ, findZoneAt, OR);
  if (prev === undefined) delete process.env.T588_COAST; else process.env.T588_COAST = prev;
  const M = new Uint8Array(NX * NY);
  for (const k of s) { const u = k.indexOf('_'); M[+k.slice(u + 1) * NX + +k.slice(0, u)] = 1; }
  return M;
}
const arms = [''].concat(ARMS);
const M = {}; for (const a of arms) M[a] = band(a);
// 관심 칸 = 어느 안에서든 바다인 칸 + 바닷가 반경(960px = 30셀) + 강 하구 여유
const PAD = Math.ceil(COAST_PX / SZ) + 4;
const roi = new Uint8Array(NX * NY);
{ const any = new Uint8Array(NX * NY); for (const a of arms) for (let i = 0; i < any.length; i++) any[i] |= M[a][i];
  // 줄마다 바다 칸이 있는 범위를 PAD 만큼 불린다(가로·세로 둘 다)
  for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) if (any[y * NX + x]) {
    for (let yy = Math.max(0, y - PAD); yy <= Math.min(NY - 1, y + PAD); yy += 1) { const r = yy * NX; roi[r + Math.max(0, x - PAD)] = 1; roi[r + Math.min(NX - 1, x + PAD)] = 1; }
  }
  // 행마다 양 끝 표시 사이를 채운다(띠는 변을 따라 이어진다 — 볼록 채우기로 충분)
  for (let y = 0; y < NY; y++) { let a = -1, b = -1; for (let x = 0; x < NX; x++) if (roi[y * NX + x]) { if (a < 0) a = x; b = x; } if (a >= 0) for (let x = a; x <= b; x++) roi[y * NX + x] = 1; }
}
// 지형 술어(관심 칸만) — 1 민물 · 2 바위 · 4 숲 · 8 광맥
const K = new Uint8Array(NX * NY);
let roiN = 0;
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) { const i = y * NX + x; if (!roi[i]) continue; roiN++;
  const cx = x * SZ + SZ / 2, cy = y * SZ + SZ / 2;
  K[i] = (T.isWaterCellLocal(Z, cx, cy) ? 1 : 0) | (T.isRockCellLocal(Z, cx, cy) ? 2 : 0) | (T.getForestMultiplier(Z, cx, cy) > 1.5 ? 4 : 0) | (T.isOreClusterAt(Z, cx, cy) ? 8 : 0); }
const TT = T.ZONE_TERRAIN[Z] || {};
const cellOf = (x, y) => [Math.floor(x / SZ), Math.floor(y / SZ)];
const seaAt = (m, x, y) => { const [cx, cy] = cellOf(x, y); return cx >= 0 && cy >= 0 && cx < NX && cy < NY && m[cy * NX + cx] === 1; };
// 가장 가까운 바다 칸까지(px · 반경 R 칸 안 · 없으면 Infinity) — villages.seaDistPx 와 같은 뜻(셀 중심 거리 × 32)
function seaDist(m, x, y, Rc) {
  const [cx, cy] = cellOf(x, y); let best = Infinity;
  for (let dy = -Rc; dy <= Rc; dy++) { const yy = cy + dy; if (yy < 0 || yy >= NY) continue;
    for (let dx = -Rc; dx <= Rc; dx++) { const xx = cx + dx; if (xx < 0 || xx >= NX) continue; if (m[yy * NX + xx] === 1) { const d = dx * dx + dy * dy; if (d < best) best = d; } } }
  return best === Infinity ? Infinity : Math.sqrt(best) * SZ;
}
function armTable(a) {
  const m = M[a], m0 = M[''], o = { arm: a || '끔', band: 0, lost: 0, gained: 0, lostForest: 0, lostOre: 0, lostRock: 0, lostFresh: 0, gainedForest: 0, gainedOre: 0 };
  for (let i = 0; i < m.length; i++) { o.band += m[i];
    if (m[i] && !m0[i]) { o.lost++; if (K[i] & 4) o.lostForest++; if (K[i] & 8) o.lostOre++; if (K[i] & 2) o.lostRock++; if (K[i] & 1) o.lostFresh++; }
    if (!m[i] && m0[i]) { o.gained++; if (K[i] & 4) o.gainedForest++; if (K[i] & 8) o.gainedOre++; } }
  o.bandPct = +(100 * o.band / (NX * NY)).toFixed(3);
  // ⓕ 갯벌 칸(물때 층 정본 술어 `salt.isTidalFlat` 의 뜻 그대로: 뭍 칸 · 8방 이웃에 **바다** — 바다 = 띠 ∧ ¬민물 · 존 `isSeaTileLocal` 과 같은 차집합)
  //    구간별(남·북변 = 열 범위 · 동·서변 = 행 범위)로도 — 구간 상자(t588-coast-mask 메타와 같은 compile)
  { const sea2 = (i) => m[i] === 1 && !(K[i] & 1);
    let tf = 0; const per = {};
    const CSx = R('public/coast-shape.js'); const Cc = CSx.compile(ZONES, 6000, 5000, a === 'b' ? { variant: 'b' } : {});
    // ★[추신2] 구간 가르기 = 그 칸에서 **구간 무게가 가장 큰 구간**(생성기 `weightsAt` 그대로) — 변이 둘(닛폰 남·동)인 존에서 변 축 범위로만 가르면 겹쳐 센다
    const wv = new Float64Array(Cc.secs.length + 1);
    for (let y = 1; y < NY - 1; y++) for (let x = 1; x < NX - 1; x++) { const i = y * NX + x; if (m[i] || (K[i] & 1) || !roi[i]) continue;
      let t = false; for (let dy = -1; dy <= 1 && !t; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; if (sea2(i + dy * NX + dx)) { t = true; break; } }
      if (!t) continue; tf++;
      const wx = ZONE.worldOffsetX + x * SZ + SZ / 2, wy = ZONE.worldOffsetY + y * SZ + SZ / 2;
      if (CSx.weightsAt(Cc, wx, wy, wv) <= 0) { per['(구간 밖)'] = (per['(구간 밖)'] || 0) + 1; continue; }
      let bi = 0; for (let q = 1; q < Cc.secs.length; q++) if (wv[q] > wv[bi]) bi = q;
      const id = Cc.secs[bi].id; per[id] = (per[id] || 0) + 1; }
    o.tidal = tf; o.tidalBySec = per; }
  // ⓑ 마을 후보
  o.villages = (T.getZoneVillages(Z) || TT.villages || []).map((v) => ({ name: v.name, sea: seaAt(m, v.x, v.y), coastal: seaDist(m, v.x, v.y, Math.ceil(COAST_PX / SZ) + 1) <= COAST_PX }));
  o.vilSea = o.villages.filter((v) => v.sea).map((v) => v.name); o.vilCoastal = o.villages.filter((v) => v.coastal).map((v) => v.name);
  // ⓒ 광맥 중심
  o.oreSea = (TT.ores || []).filter((r) => r.center && seaAt(m, r.center[0], r.center[1])).map((r) => r.name);
  // ⓓ 호수 — 둘레(반경 + 1셀)의 칸 중 바다가 하나라도
  o.lakesTouched = (TT.lakes || []).filter((l) => { if (!l.center || !(l.radius > 0)) return false; const r = l.radius + SZ;
    for (let a2 = 0; a2 < 64; a2++) { const t = a2 / 64 * 2 * Math.PI; if (seaAt(m, l.center[0] + r * Math.cos(t), l.center[1] + r * Math.sin(t))) return true; } return seaAt(m, l.center[0], l.center[1]); }).map((l) => l.name);
  // ⓔ 강
  o.rivers = (TT.rivers || []).filter((rv) => rv.path && rv.path.length >= 2).map((rv) => {
    const P = rv.path.map((p) => ({ x: p.pos ? p.pos[0] : p[0], y: p.pos ? p.pos[1] : p[1], w: p.width != null ? p.width : (rv.width || 200) }));
    const head = P[0], tail = P[P.length - 1], mouth = tail.w >= head.w ? tail : head, src = mouth === tail ? head : tail;
    const reach = Math.ceil((mouth.w / 2) / SZ) + 2;
    const mouthSea = seaDist(m, mouth.x, mouth.y, reach) <= reach * SZ;
    const srcSea = seaAt(m, src.x, src.y);
    let sub = 0; for (const p of P) if (seaAt(m, p.x, p.y)) sub++;
    return { name: rv.name, mouthSea, srcSea, subPct: +(100 * sub / P.length).toFixed(1) };
  });
  o.mouthToSea = o.rivers.filter((r) => r.mouthSea).map((r) => r.name);
  o.srcInSea = o.rivers.filter((r) => r.srcSea).map((r) => r.name);
  o.halfSunk = o.rivers.filter((r) => r.subPct >= 50).map((r) => r.name);
  return o;
}
const out = { zone: Z, NX, NY, coastPx: COAST_PX, roiCells: roiN, arms: {} };
for (const a of arms) out.arms[a || 'off'] = armTable(a);
// 끔 대비 바뀜(이름 목록)
const off = out.arms.off, d = (A, B) => A.filter((x) => !B.includes(x));
for (const a of ARMS) { const t = out.arms[a];
  t.diff = { vilSeaNew: d(t.vilSea, off.vilSea), vilSeaGone: d(off.vilSea, t.vilSea), coastalNew: d(t.vilCoastal, off.vilCoastal), coastalGone: d(off.vilCoastal, t.vilCoastal),
    oreSeaNew: d(t.oreSea, off.oreSea), oreSeaGone: d(off.oreSea, t.oreSea), lakesNew: d(t.lakesTouched, off.lakesTouched), lakesGone: d(off.lakesTouched, t.lakesTouched),
    mouthLost: d(off.mouthToSea, t.mouthToSea), mouthNew: d(t.mouthToSea, off.mouthToSea), srcInSeaNew: d(t.srcInSea, off.srcInSea) }; }
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
for (const k of Object.keys(out.arms)) { const t = out.arms[k];
  console.log(`[${Z}] ${k.padEnd(3)} 띠 ${t.band.toLocaleString()}칸(${t.bandPct}%) · 잃는 뭍 ${t.lost.toLocaleString()}(숲 ${t.lostForest} · 광맥 ${t.lostOre} · 바위 ${t.lostRock} · 민물 ${t.lostFresh}) · 얻는 뭍 ${t.gained.toLocaleString()} · ` +
    `갯벌 칸 ${t.tidal.toLocaleString()} ${JSON.stringify(t.tidalBySec)} · 후보 바다 ${t.vilSea.length} · 바닷가 ${t.vilCoastal.length} · 광맥 중심 바다 ${t.oreSea.length} · 호수 닿음 ${t.lakesTouched.length} · 하구 바다 ${t.mouthToSea.length}/${t.rivers.length} · 발원 바다 ${t.srcInSea.length}` +
    (t.diff ? ` · Δ ${JSON.stringify(t.diff)}` : '')); }
