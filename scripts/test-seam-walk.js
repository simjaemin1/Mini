#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-seam-walk.js — 쇠재 · 한재 골짜기를 몸이 걸어서 넘는다 (T1311 · T1296 회부 3 · 4) ======================
//
// ★왜 [T1311] T1296 이 한반도 ↔ 닛폰 원 고개 둘(지름 115칸)을 폭 320(10칸) 골짜기로 바꿨다. `test-seam` ⑤ 는 땅(틈 · 꿰뚫음 · 거울)을 잰다.
//   이 하네스는 **몸 걸음**을 잰다 — 사람 한 걸음 정본(`sim/path-core.js localPath` · 4방 · 존 술어 = 바위 · 물 막힘 · 칸마다 그 칸의 주인 존)으로
//   골짜기 둘레 창(이음매 ±2,600px · 골짜기 y ±1,500px) 서쪽 끝 → 동쪽 끝, 동 → 서를 걷는다.
//   ① 두 골짜기 · 두 방향 다 길이 있다 · 길이 이음매를 **그 골짜기 안**(중심선 ±폭)에서 넘는다(창 안 다른 틈으로 돌지 않는다)
//   ② N틱 안에 넘는다 — 몸 걸음 `MOVE_SPEED`(zone.js · 64px/s) · `TICK_HZ` 30 으로 길 칸 수를 틱으로 · N = 직선 칸 × 1.25 의 틱
//   ③ 걸은 길의 가장 좁은 단면(길 칸에서 길에 수직인 열린 칸 줄) ≥ 정본 골짜기 폭 칸(한반도 골짜기 24 의 폭 · 10)
//   ④ 왕복 대칭 — 동 → 서 길 = 서 → 동 길의 뒤집기(path-core 정규화 계약 · 같은 복도)
//   ★미끼(자명 통과 금지 · 정본 json 을 고친 **새 술어 판**에서 같은 자를 돈다):
//     ⓐ 닛폰 골짜기 폭을 4칸(128)으로 줄인 사본 → ③ 빨강   ⓑ 한반도 짝 골짜기 끝(갈고리 · 이음매 쪽 마디)을 막은 사본 → ① 빨강
// 실행: node scripts/test-seam-walk.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const PC = require(path.join(ROOT, 'sim', 'path-core.js'));
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE_SPEED = +((ZSRC.match(/^const MOVE_SPEED = (\d+)/m) || [])[1]);
const TICK_HZ = +((ZSRC.match(/^const TICK_HZ = (\d+)/m) || [])[1]);
const CELL = 32, NAMES = ['쇠재', '한재'];
const GAME = path.join(ROOT, 'server', 'hanbando-terrain.json');

// 새 술어 판 — 정본 json 객체에 `mut` 를 건 뒤 terrain.js 를 새로 싣는다(술어가 처음 물을 때 json 을 굳힌다 · 미끼가 본판을 더럽히지 않게 판마다 새로)
function freshTerrain(mut) {
  for (const k of Object.keys(require.cache)) if (/server[\/\\](terrain|terrain-gen|zone-config|hanbando-terrain)/.test(k)) delete require.cache[k];
  const J = require(GAME);
  if (mut) mut(J);
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const T = require(path.join(ROOT, 'server', 'terrain'));
  T.setZonesMeta(ZONES);
  T.isRockCellLocal('nippon', 16, 16);   // 지금 굳힌다
  return { J, T, ZONES };
}

// 한 판 — 골짜기마다 서 → 동 · 동 → 서 몸 걸음
function walkAll(F) {
  const { J, T, ZONES } = F, HB = ZONES.hanbando, NP = ZONES.nippon, SX = NP.worldOffsetX;
  const blockedW = (wx, wy) => {
    const zid = wx < SX ? 'hanbando' : 'nippon', Z = ZONES[zid], lx = wx - Z.worldOffsetX, ly = wy - Z.worldOffsetY;
    if (lx < 0 || ly < 0 || lx >= Z.zoneWidth || ly >= Z.zoneHeight) return true;
    return !!(T.isWaterCellLocal(zid, lx, ly) || T.isRockCellLocal(zid, lx, ly));
  };
  const W0 = Math.max(...(J.hanbando.valleys || []).flatMap((v) => v.path.map((p) => p.width)));   // 정본 골짜기 폭(한반도 · px)
  const out = [];
  for (const nm of NAMES) {
    const v = (J.nippon.valleys || []).find((x) => x.name === nm);
    if (!v) { out.push({ nm, none: true }); continue; }
    // 이음매(닛폰 x 0)에서 골짜기 중심선 y(세계)
    const P = v.path.map((p) => p.pos); let ly = null;
    for (let i = 0; i + 1 < P.length; i++) { const [ax, ay] = P[i], [bx, by] = P[i + 1]; if ((ax <= 0 && bx >= 0) || (bx <= 0 && ax >= 0)) { ly = ay + (by - ay) * (ax === bx ? 0 : (0 - ax) / (bx - ax)); break; } }
    if (ly == null) ly = P[0][1];
    const vy = ly + NP.worldOffsetY, wmax = Math.max(...v.path.map((p) => p.width));
    // 창(칸) — 원점 = 창 왼쪽 위 세계 px
    const x0 = SX - 2600, y0 = Math.round(vy - 1500), NX = Math.ceil(5200 / CELL), NY = Math.ceil(3000 / CELL);
    const B = new Uint8Array(NX * NY); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) B[j * NX + i] = blockedW(x0 + i * CELL + 16, y0 + j * CELL + 16) ? 1 : 0;
    const blk = (i, j) => (i < 0 || j < 0 || i >= NX || j >= NY) ? true : B[j * NX + i] === 1;
    const openNear = (i) => { const jc = Math.round((vy - y0) / CELL); for (let d = 0; d < NY; d++) for (const s of [1, -1]) { const j = jc + s * d; if (!blk(i, j)) return j; } return null; };
    const iW = 1, iE = NX - 2, jW = openNear(iW), jE = openNear(iE);
    const opts = { blockedStep: (fx, fy, tx, ty) => blk(tx, ty), maxNodes: NX * NY + 16 };
    const we = (jW != null && jE != null) ? PC.localPath(iW, jW, iE, jE, opts) : null;
    const ew = (jW != null && jE != null) ? PC.localPath(iE, jE, iW, jW, opts) : null;
    const r = { nm, vy, wmax, W0, start: [iW, jW], goal: [iE, jE], we: !!we, ew: !!ew };
    if (we) {
      // 이음매를 넘는 칸 — 길 칸 중 세계 x 가 이음매를 넘는 첫 마디
      let cross = null; for (let k = 1; k < we.length; k++) { const xa = x0 + we[k - 1].x * CELL + 16, xb = x0 + we[k].x * CELL + 16; if (xa < SX && xb >= SX) { cross = y0 + we[k].y * CELL + 16; break; } }
      r.crossY = cross; r.inValley = cross != null && Math.abs(cross - vy) <= wmax;
      r.cells = we.length - 1; r.straight = iE - iW + Math.abs(jE - jW);
      r.ticks = Math.ceil(r.cells * CELL / (MOVE_SPEED / TICK_HZ)); r.N = Math.ceil(r.straight * 1.25 * CELL / (MOVE_SPEED / TICK_HZ));
      // 가장 좁은 단면 — 길 마디마다 걸음 방향에 수직(가로 걸음이면 세로 · 세로 걸음이면 가로)으로 열린 칸 줄 · 넓은 뭍(창 끝까지 열림 · 40칸 넘음)은 안 센다
      let narrow = Infinity, at = null;
      for (let k = 1; k < we.length; k++) {
        const a = we[k - 1], b = we[k], vert = a.x !== b.x;   // 가로로 걸었으면 세로 단면
        let n = 1;
        if (vert) { for (let j = b.y - 1; !blk(b.x, j) && n <= 40; j--) n++; for (let j = b.y + 1; !blk(b.x, j) && n <= 40; j++) n++; }
        else { for (let i = b.x - 1; !blk(i, b.y) && n <= 40; i--) n++; for (let i = b.x + 1; !blk(i, b.y) && n <= 40; i++) n++; }
        if (n <= 40 && n < narrow) { narrow = n; at = x0 + b.x * CELL + 16 - SX; }
      }
      r.narrow = narrow === Infinity ? null : narrow; r.narrowAt = at;
      r.sym = !!ew && ew.length === we.length && ew.every((p, k) => p.x === we[we.length - 1 - k].x && p.y === we[we.length - 1 - k].y);
    }
    out.push(r);
  }
  return out;
}
const fmt = (r) => r.we ? `이음매 y ${Math.round(r.crossY - 49984)}(한반도 로컬 · 골짜기 ${Math.round(r.vy - 49984)}) · ${r.cells}칸 · ${r.ticks}틱 ≤ ${r.N} · 가장 좁은 단면 ${r.narrow}칸 @이음매 ${r.narrowAt}px` : '길 없음';

console.log('\n=== 쇠재 · 한재 골짜기 몸 걸음 (T1311) ===');
ok(MOVE_SPEED > 0 && TICK_HZ > 0, '전제 — 몸 걸음 · 틱(zone.js 정본 글자)', `MOVE_SPEED ${MOVE_SPEED}px/s · TICK_HZ ${TICK_HZ}`);
const base = walkAll(freshTerrain(null));
for (const r of base) {
  if (r.none) { ok(false, `${r.nm} — 닛폰 골짜기가 있다`); continue; }
  ok(r.we && r.ew, `① ${r.nm} — 서 → 동 · 동 → 서 몸 길이 있다(걸음 정본 · 4방 · 바위 · 물 막힘)`, fmt(r));
  ok(r.we && r.inValley, `① ${r.nm} — 길이 이음매를 그 골짜기 안(중심선 ±${r.wmax}px)에서 넘는다`, r.we ? `넘는 y 차 ${Math.round(Math.abs(r.crossY - r.vy))}px` : '');
  ok(r.we && r.ticks <= r.N, `② ${r.nm} — N틱 안에 넘는다(직선 칸 × 1.25)`, r.we ? `${r.ticks}틱 · N ${r.N}` : '');
  ok(r.we && r.narrow != null && r.narrow >= Math.round(r.W0 / CELL), `③ ${r.nm} — 걸은 길 가장 좁은 단면 ≥ 정본 골짜기 폭(${Math.round(r.W0 / CELL)}칸)`, r.we ? `${r.narrow}칸` : '');
  ok(r.we && r.sym, `④ ${r.nm} — 동 → 서 길 = 서 → 동 길 뒤집기(같은 복도)`, '');
}
// ★미끼 ⓐ — 닛폰 골짜기 둘 폭 128(4칸)
const bA = walkAll(freshTerrain((J) => { for (const v of J.nippon.valleys) if (NAMES.includes(v.name)) for (const p of v.path) p.width = 128; }));
ok(bA.every((r) => r.we && r.narrow != null && r.narrow < Math.round(r.W0 / CELL)), '★미끼 ⓐ 닛폰 골짜기 폭을 4칸으로 줄인 사본 → ③ 빨강(좁은 단면 < 정본 폭)', bA.map((r) => `${r.nm} ${r.we ? r.narrow + '칸' : '길 없음'}`).join(' · '));
// ★미끼 ⓑ — 한반도 짝 골짜기의 이음매 쪽 마디(갈고리 · 끝 둘)를 걷어 그 골짜기가 산 띠 안에서 끝나게
const bB = walkAll(freshTerrain((J) => { for (const v of J.hanbando.valleys) if (NAMES.includes(v.name)) v.path = v.path.slice(0, 2); }));
ok(bB.every((r) => !r.we || !r.inValley), '★미끼 ⓑ 한반도 짝 골짜기 끝(갈고리)을 막은 사본 → ① 빨강(길 없음 또는 다른 틈)', bB.map((r) => `${r.nm} ${r.we ? '다른 틈 y ' + Math.round(r.crossY - 49984) : '길 없음'}`).join(' · '));
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
