#!/usr/bin/env node
// === scripts/t509-fresh-water.js — 내륙의 식수: 민물까지 몇 걸음인가 (T509 ① · 계측기 · 러너 밖 · 제품 무접촉) ==========
//
// ★무엇을 재나 — 51 마을 × 가장 가까운 **마실 수 있는 자리**(민물 셀에 4방으로 붙은, 설 수 있는 셀)까지의 **실걸음**.
//   · 민물 = `isWaterTileLocal ∧ ¬isSeaTileLocal`(존 정본 두 술어 그대로 · `tryGather` 물가 E 가 묻는 그 둘)
//   · 마시는 자리 = 설 수 있는 셀(`isTerrainBlockedLocal` 거짓 — 다리 통행 · 물·바위·환호 막힘)이면서 4방 이웃에 민물(물가 E 가
//     `[±32,0]·[0,±32]` 로 묻는 그 이웃 — 사본 0)
//   · 걸음 = 4방 너비 우선(`path-core` 걷기 프리셋 `findPath` 가 DIRS4 · 칸 비용 1 — 같은 격자 · 같은 이웃)
//   · 출발 둘: 마을 회관(마을 중심 셀) · 플레이어 도착 자리(공용 쉼터 문 앞 = `shelterOf` — 없으면 `ensureShelter(arrivalOf)` 로 세운 뒤)
//   · 단위: 1셀 = 32px = 1m(`zone.js MOVE_SPEED` 주석) · 걸음 초 = 칸 × 32 ÷ `MOVE_SPEED`(64px/s)
// 쓰는 법: node scripts/t509-fresh-water.js [out.json]      (존 hanbando · 임시 DB · 마을 켬 · 1~3분)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.argv[2] || '/tmp/t509-fresh-water.json';
const TMP = `/tmp/t509-fw-${process.pid}.db`;
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.env.ZONE_ID = process.env.ZONE_ID || 'hanbando';
process.env.PORT = String(38100 + (process.pid % 150));
process.env.DB_PATH = TMP;
process.env.ENABLE_VILLAGES = '1';
process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
process.env.SHELTER_BACKFILL = '0'; process.env.NEWCOMER_ENABLE = '0'; process.env.CLAIM_ABSENCE = '0';
const _l = console.log, _w = console.warn, _e = console.error;
console.log = () => {}; console.warn = () => {}; console.error = () => {};
const t0 = Date.now();
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
console.log = _l; console.warn = _w; console.error = _e;
const H = Zone.__testBind();
const { SimVillages, Onboarding, isTerrainBlockedLocal: blocked, isWaterTileLocal: isWater, isSeaTileLocal: isSea, BUILDING_SIZE: SZ, MOVE_SPEED, ZONE } = H;
const W = Math.ceil(ZONE.zoneWidth / SZ), Hh = Math.ceil(ZONE.zoneHeight / SZ);
const px = (c) => c * SZ + SZ / 2;
const fresh = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < Hh && isWater(px(cx), px(cy)) && !isSea(px(cx), px(cy));
const stand = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < Hh && !blocked(px(cx), px(cy));
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const drinkable = (cx, cy) => { for (const [dx, dy] of N4) if (fresh(cx + dx, cy + dy)) return true; return false; };
const seen = new Uint8Array(W * Hh);
const touched = [];
const MAX_POPS = parseInt(process.env.T509_MAX_POPS || '6000000', 10);
function bfs(sx, sy) {
  for (const i of touched) seen[i] = 0; touched.length = 0;
  // 출발 셀이 막혀 있으면(문 앞이 벽 칸 등) 가장 가까운 설 자리로 — 반경 3 안
  if (!stand(sx, sy)) { let f = null; for (let r = 1; r <= 3 && !f; r++) for (let dx = -r; dx <= r && !f; dx++) for (let dy = -r; dy <= r && !f; dy++) if (stand(sx + dx, sy + dy)) f = [sx + dx, sy + dy]; if (!f) return { found: false, why: 'start-blocked' }; [sx, sy] = f; }
  let q = [[sx, sy]], d = 0, pops = 0;
  seen[sy * W + sx] = 1; touched.push(sy * W + sx);
  while (q.length) {
    const nq = [];
    for (const [cx, cy] of q) {
      pops++;
      if (drinkable(cx, cy)) return { found: true, steps: d, at: [cx, cy], start: [sx, sy], pops };
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
        const k = ny * W + nx; if (seen[k]) continue; seen[k] = 1; touched.push(k);
        if (stand(nx, ny)) nq.push([nx, ny]);
      }
      if (pops > MAX_POPS) return { found: false, why: 'cap', steps: d, pops, start: [sx, sy] };
    }
    q = nq; d++;
  }
  return { found: false, why: 'island', steps: d, pops, start: [sx, sy] };
}
// 직선 거리(가장 가까운 민물 셀 · 막힘 무시) — 걸음과 견줄 칸
function straight(sx, sy, lim) {
  let best = Infinity;   // 체비쇼프 고리 r 을 넓히며 — 유클리드 최소가 확정되는 건 r > best 일 때다(모서리에서 찾은 값보다 다음 고리 축이 가까울 수 있다)
  for (let r = 0; r <= lim && r <= best; r++) {
    for (let dx = -r; dx <= r; dx++) for (const dy of (Math.abs(dx) === r ? rangeArr(-r, r) : [-r, r])) if (fresh(sx + dx, sy + dy)) best = Math.min(best, Math.hypot(dx, dy));
  }
  return best < Infinity ? best : null;
}
function rangeArr(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
const list = SimVillages.clientVillages() || [];
const rows = [];
for (const v of list) {
  const vid = v.id;
  let sh = SimVillages.shelterOf(vid);
  if (!sh) { try { const a = Onboarding.arrivalOf(vid); SimVillages.ensureShelter(vid, a); } catch (e) {} sh = SimVillages.shelterOf(vid); }
  const arr = sh ? { cx: Math.floor(sh.x / SZ), cy: Math.floor(sh.y / SZ), src: 'shelter' } : (() => { const a = Onboarding.arrivalOf(vid); return a ? { cx: Math.floor(a.x / SZ), cy: Math.floor(a.y / SZ), src: 'arrival' } : null; })();
  const hall = { cx: v.cx != null ? v.cx : Math.floor(v.x / SZ), cy: v.cy != null ? v.cy : Math.floor(v.y / SZ) };
  const rh = bfs(hall.cx, hall.cy);
  const ra = arr ? bfs(arr.cx, arr.cy) : { found: false, why: 'no-arrival' };
  rows.push({ vid, name: v.name, hall, arr, hallSteps: rh.found ? rh.steps : null, hallWhy: rh.found ? null : rh.why,
    arrSteps: ra.found ? ra.steps : null, arrWhy: ra.found ? null : ra.why, arrAt: ra.at || null,
    hallStraight: straight(hall.cx, hall.cy, 400), arrStraight: arr ? straight(arr.cx, arr.cy, 400) : null });
}
const secPer = SZ / MOVE_SPEED;
fs.writeFileSync(OUT, JSON.stringify({ zone: process.env.ZONE_ID, cellPx: SZ, moveSpeed: MOVE_SPEED, secPerCell: secPer, n: rows.length, ms: Date.now() - t0, rows }, null, 1));
console.log(`[t509] ${rows.length} 마을 · ${Date.now() - t0}ms → ${OUT}`);
for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
process.exit(0);
