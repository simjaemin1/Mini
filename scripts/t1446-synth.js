#!/usr/bin/env node
// === scripts/t1446-synth.js — T1446 재현 틀의 목록 짓기(길 · 건물) =========================
// (@regress 없음 — 계측 `t1446-view-repro.js` 와 하네스 `test-t1446-view-index.js` 가 같이 쓰는 한 벌 · 사본 0)
//
// ★무엇을 짓나 — 라이브(11-22 PM 이 손님으로 붙어 잰 welcome) 크기 그대로, 꼴은 실제 꼴로:
//   · 길 456,479칸 = 등급 1 216,419 · 등급 2 240,060(`T1446_LIVE`) — **마을 둘레와 교역로에 몰린다**:
//     마을마다 가운데 고리 셋 · 바큇살(굽은 걸음) · 곁가지 + 마을마다 가까운 셋으로 가는 교역로(목표로 끌리는 굽은 걸음 · 폭 3).
//     넉넉히 지은 뒤 "밟힌 정도"(마을 · 교역로 한가운데일수록 크다) 큰 차례로 정확히 456,479칸을 남기고 큰 240,060칸을 등급 2 로 한다.
//     칸 차례(welcome 차례)는 지은 차례 — 서버 `clientRoads()` 도 칸 Map 의 넣은 차례(처음 밟힌 차례)로 낸다.
//   · 건물 5,806개 — 새 세계 시딩이 낸 마을 한 벌(농촌22 · 724개: 마당 vtile 452 · 큰집 8×8 바닥 64 + 벽 30 · 움집 6×4 둘 바닥 48 + 벽 36 ·
//     곳간 5×3 바닥 15 + 벽 16 · 경작지 63 — 11-22 이 가지에서 `ENABLE_VILLAGES=1` 로 띄워 센 것)과 같은 꼴 · 같은 태그(`data.hut` · `bld` · `gran` · `side`)를
//     재는 마을과 가까운 일곱 마을에 놓고(724 × 8 = 5,792) 아홉째 마을 마당에 14칸을 더한다.
//   · 마을 자리 = 시딩과 같은 정본 함수(`villages.__labProbe.pickSeedVillages` · `findOpenCenter` — T1427 진단 자와 같은 조립).
//   · 결정론 — 같은 씨앗이면 같은 목록(mulberry32).
//
// 실행: node scripts/t1446-synth.js [--seed 1446]   → 크기 · 등급 · 마을 둘레 몫 · 화면 상자(±47칸) 안 칸 수 표
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const T1446_LIVE = { roads: 456479, lv1: 216419, lv2: 240060, buildings: 5806 };
const ZONE_ID = 'hanbando';

function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── 마을 자리 — 시딩과 같은 정본 함수 ───────────────────────────────────────────────
let _vilCache = null;
function villageCenters() {
  if (_vilCache) return _vilCache;
  const { ZONES } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = R('server/villages').__labProbe;
  const ZONE = ZONES[ZONE_ID], SZ = 32;
  P.setZoneId(ZONE_ID);
  const inZ = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const isWater = (x, y) => { if (ZONE.isOcean) return true; if (!inZ(x, y)) return false;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); try { return !!T.isWaterCellLocal(ZONE_ID, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch (e) { return false; } };
  const isRock = (x, y) => { if (!inZ(x, y)) return false; try { return !!T.isRockCellLocal(ZONE_ID, x, y); } catch (e) { return false; } };
  const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => (!inZ(x, y) || isRock(x, y) || isWater(x, y)), isWaterTileLocal: isWater });
  const picked = P.pickSeedVillages(T.getZoneVillages(ZONE_ID) || [], ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const out = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (c) out.push({ name: hv.name, cx: c.ccx, cy: c.ccy });
  }
  _vilCache = { vils: out, W: Math.floor(ZONE.zoneWidth / SZ), H: Math.floor(ZONE.zoneHeight / SZ), ox: ZONE.worldOffsetX, oy: ZONE.worldOffsetY || 0,
    blocked: (x, y) => (!inZ(x, y) || isRock(x, y) || isWater(x, y)) };   // 존 로컬 px — 서버 `teleport_debug` 가 거절하는 자리(물 · 바위 · 존 밖)
  return _vilCache;
}

// ── 길 ───────────────────────────────────────────────────────────────────────────────
function synthRoads(opts) {
  const o = Object.assign({ seed: 1446, total: T1446_LIVE.roads, lv2: T1446_LIVE.lv2 }, opts || {});
  const { vils, W, H } = villageCenters();
  const rnd = rng(o.seed);
  const score = new Map();   // 칸 열쇠(cy·W + cx) → 밟힌 정도(넣은 차례 = Map 차례)
  const paint = (cx, cy, w, s) => {
    const h = (w / 2) | 0;
    for (let dy = -h; dy < w - h; dy++) for (let dx = -h; dx < w - h; dx++) {
      const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = y * W + x, p = score.get(k);
      if (p === undefined || p < s) score.set(k, s);
    }
  };
  const walk = (x, y, ang, len, w, sFn, drift) => {   // 굽은 걸음 — 한 걸음 1칸 · 방향이 조금씩 흐른다
    for (let i = 0; i < len; i++) {
      paint(Math.round(x), Math.round(y), w, sFn(i));
      ang += (rnd() - 0.5) * drift; x += Math.cos(ang); y += Math.sin(ang);
    }
    return [x, y, ang];
  };
  // ① 마을 — 가운데 고리 셋 · 바큇살 16 · 곁가지 60
  for (const v of vils) {
    for (const r of [10, 18, 28]) for (let a = 0; a < 360; a += 1.5) {
      const t = a * Math.PI / 180; paint(Math.round(v.cx + r * Math.cos(t)), Math.round(v.cy + r * Math.sin(t)), 2, 9 - r / 10);
    }
    const tips = [];
    for (let k = 0; k < 16; k++) {
      const len = 100 + Math.floor(rnd() * 120);
      const [x, y, ang] = walk(v.cx, v.cy, (k / 16) * 2 * Math.PI + (rnd() - 0.5) * 0.3, len, 2, (i) => 8 - i / 30, 0.25);
      tips.push([x, y, ang, len]);
    }
    for (let k = 0; k < 60; k++) {
      const a = rnd() * 2 * Math.PI, d = 15 + rnd() * 110;
      walk(v.cx + d * Math.cos(a), v.cy + d * Math.sin(a), a + (rnd() < 0.5 ? 1 : -1) * Math.PI / 2, 20 + Math.floor(rnd() * 40), rnd() < 0.5 ? 1 : 2, () => 6 - d / 40, 0.35);
    }
  }
  // ② 교역로 — 마을마다 가까운 셋(겹친 짝은 한 번) · 목표로 끌리는 굽은 걸음 · 폭 3
  const pairs = new Set();
  for (let i = 0; i < vils.length; i++) {
    const near = vils.map((u, j) => [j, Math.hypot(u.cx - vils[i].cx, u.cy - vils[i].cy)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
    for (const [j] of near) pairs.add(i < j ? i + ',' + j : j + ',' + i);
  }
  for (const p of pairs) {
    const [i, j] = p.split(',').map(Number), A = vils[i], B = vils[j];
    let x = A.cx, y = A.cy;
    for (let step = 0; step < 6000; step++) {
      const dx = B.cx - x, dy = B.cy - y, d = Math.hypot(dx, dy);
      if (d < 2) break;
      const ang = Math.atan2(dy, dx) + (rnd() - 0.5) * 1.2;
      paint(Math.round(x), Math.round(y), 3, 7);
      x += Math.cos(ang); y += Math.sin(ang);
    }
  }
  // ③ 정확히 남기기 — 밟힌 정도 큰 차례로 total 칸 · 그중 큰 lv2 칸을 등급 2(같으면 먼저 지은 칸이 앞)
  const keys = [...score.keys()];
  if (keys.length < o.total) throw new Error(`길을 ${keys.length}칸밖에 못 지었다(필요 ${o.total})`);
  const ord = keys.map((k, i) => [k, score.get(k), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]);
  const keep = new Map();
  for (let i = 0; i < o.total; i++) keep.set(ord[i][0], i < o.lv2 ? 2 : 1);
  const flat = [];
  for (const k of keys) { const lv = keep.get(k); if (lv) flat.push(k % W, (k / W) | 0, lv); }
  return { flat, built: keys.length, W, H };
}

// ── 건물 — 새 세계 시딩의 마을 한 벌과 같은 꼴 · 같은 태그 ─────────────────────────────
function villageBuildings(ccx, ccy, idp, nPlaza) {
  const out = [], occ = new Set(), K = (x, y) => x + ',' + y;
  let n = 0; const id = () => idp + (n++);
  const C = (c) => c * 32 + 16;
  const rect = (x0, y0, x1, y1, tag, door) => {   // 바닥 + 벽(북 · 남 = 'N' 변 · 서 · 동 = 'E' 변 · 남벽 문 두 칸)
    const r = [x0, y0, x1, y1];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { occ.add(K(x, y)); out.push({ id: id(), type: 'floor', x: C(x), y: C(y), data: { floor: 0, [tag]: r }, floor: 0 }); }
    const wall = (x, y, side) => out.push({ id: id(), type: 'wall', x: x * 32, y: y * 32, data: { side, floor: 0, [tag]: r }, floor: 0 });
    for (let x = x0; x <= x1; x++) { wall(x, y0, 'N'); if (!(door && (x === x0 + door || x === x0 + door + 1))) wall(x, y1 + 1, 'N'); }
    for (let y = y0; y <= y1; y++) { wall(x0 - 1, y, 'E'); wall(x1, y, 'E'); }
  };
  rect(ccx - 4, ccy - 4, ccx + 3, ccy + 3, 'bld', 3);          // 큰집 8×8(문 x0+3 · x0+4)
  rect(ccx - 17, ccy + 11, ccx - 12, ccy + 14, 'hut', 2);      // 움집 6×4 둘(문 x0+2 · x0+3)
  rect(ccx + 1, ccy + 11, ccx + 6, ccy + 14, 'hut', 2);
  rect(ccx + 6, ccy + 7, ccx + 10, ccy + 9, 'gran', 0);        // 곳간 5×3(문 없음)
  for (let y = ccy - 14; y < ccy - 7; y++) for (let x = ccx - 18; x < ccx - 9; x++) {   // 경작지 9×7
    occ.add(K(x, y)); out.push({ id: id(), type: 'farmland', x: C(x), y: C(y), data: { sim: 1, dry: 0 }, floor: 0 });
  }
  // 마당(vtile) — 가운데서 가까운 빈 칸부터 nPlaza 칸
  const cand = [];
  for (let dy = -16; dy <= 16; dy++) for (let dx = -16; dx <= 16; dx++) if (!occ.has(K(ccx + dx, ccy + dy))) cand.push([dx * dx + dy * dy, dx, dy]);
  cand.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  for (let i = 0; i < nPlaza && i < cand.length; i++) out.push({ id: 'v' + id(), type: 'vtile', x: C(ccx + cand[i][1]), y: C(ccy + cand[i][2]), data: { sim: 1, kind: 'plaza' }, floor: 0 });
  return out;
}
function synthBuildings(opts) {
  const o = Object.assign({ total: T1446_LIVE.buildings, at: null, nVil: 8, plaza: 452 }, opts || {});
  const { vils } = villageCenters();
  const at = o.at || vils[0];
  const ord = vils.slice().sort((a, b) => Math.hypot(a.cx - at.cx, a.cy - at.cy) - Math.hypot(b.cx - at.cx, b.cy - at.cy));
  const out = [];
  for (let i = 0; i < ord.length && out.length < o.total; i++) {
    const one = villageBuildings(ord[i].cx, ord[i].cy, 't1446b' + i + '_', o.plaza);
    const room = o.total - out.length;
    if (i < o.nVil && one.length <= room) out.push(...one);
    else { const plaza = one.filter((b) => b.type === 'vtile').slice(0, room); out.push(...plaza); }
  }
  return out;
}

module.exports = { T1446_LIVE, villageCenters, synthRoads, synthBuildings, villageBuildings, rng };

if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const t0 = Date.now();
  const V = villageCenters();
  const t1 = Date.now();
  const Rd = synthRoads({ seed: +arg('--seed', 1446) });
  const t2 = Date.now();
  let n1 = 0, n2 = 0; for (let i = 2; i < Rd.flat.length; i += 3) (Rd.flat[i] === 2 ? n2++ : n1++);
  const Bd = synthBuildings({ at: V.vils.find((v) => v.name === '농촌22') });
  const types = {}; for (const b of Bd) types[b.type] = (types[b.type] || 0) + 1;
  // 마을 둘레 몫 · 화면 상자(±47칸 = ±1,500px) 안 칸 수(마을 가운데마다)
  const cells = new Set(); for (let i = 0; i < Rd.flat.length; i += 3) cells.add(Rd.flat[i + 1] * Rd.W + Rd.flat[i]);
  const inBox = (cx, cy, r) => { let n = 0; for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (cells.has(y * Rd.W + x)) n++; return n; };
  const boxes = V.vils.map((v) => [v.name, inBox(v.cx, v.cy, 47)]).sort((a, b) => b[1] - a[1]);
  let near = 0; for (let i = 0; i < Rd.flat.length; i += 3) { const x = Rd.flat[i], y = Rd.flat[i + 1]; if (V.vils.some((v) => Math.abs(v.cx - x) <= 150 && Math.abs(v.cy - y) <= 150)) near++; }
  console.log(`마을 ${V.vils.length}곳(${t1 - t0}ms) · 존 ${V.W}×${V.H}칸 · 길 ${Rd.flat.length / 3}칸(지은 ${Rd.built}) = 등급 1 ${n1} · 등급 2 ${n2}(${t2 - t1}ms) · 마을 ±150칸 안 ${(100 * near / (Rd.flat.length / 3)).toFixed(1)}%`);
  console.log(`화면 상자(±47칸) 안 길 — 마을 가운데마다: 가장 많은 셋 ${boxes.slice(0, 3).map((b) => b.join(' ')).join(' · ')} · 중앙 ${boxes[boxes.length >> 1].join(' ')} · 가장 적은 ${boxes[boxes.length - 1].join(' ')} · 농촌22 ${(boxes.find((b) => b[0] === '농촌22') || []).join(' ')}`);
  console.log(`건물 ${Bd.length}개 ${JSON.stringify(types)} · welcome 글자 길 ${JSON.stringify(Rd.flat).length.toLocaleString()} · 건물 ${JSON.stringify(Bd).length.toLocaleString()}`);
}
