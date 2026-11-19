#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1324 자 · 제품 무변 · 정적)
// =============================================================================
// scripts/t1324-band-check.js — 사람 겹침 띠 땅(`T1324_BAND_TERRAIN`) 정적 자: 이음매 줄마다 사람이 곧게 넘을 수 있나(끔 · 켬)
//
//   한반도 ↔ 닛폰 이음매(한반도 동쪽 변 = 닛폰 서쪽 변)의 32px 줄마다, 존 안쪽 64px 에서 띠 끝(변 밖 `HANDOFF_COMMIT` + 32px)까지 곧게 걷는 걸음을
//   두 술어로 짚는다(지형 정본 `terrain.js` — 존 걸음 문과 같은 칸 가운데 · 그 존 다리 칸은 물 예외):
//     끔(종전) — 보내는 존 땅만 본다(띠 = 존 사각 밖 = 막힘 없음) · 켬 — 띠는 이웃 존 땅(`zone.js` `_t1324BandBlk` 와 같은 식)
//   양쪽(동쪽으로 · 서쪽으로) · 줄마다 넘음(끔 · 켬) · 켬에서 막힌 줄의 까닭(띠 안 이웃 바위 · 물) · 넘는 길목(곧게 트인 줄 묶음)을 센다.
//   "걸려서 못 넘는 자리" = 켬에서 이웃 존 쪽 길(받는 존 땅)이 다 트였는데 못 넘는 줄 — 0 이어야 한다(술어가 받는 존 땅과 다르게 읽는 자리).
//   쓰는 법: node scripts/t1324-band-check.js [--json <파일>]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { ZONES, HANDOFF_COMMIT } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain'));
const A = process.argv.slice(2);
const jout = A.includes('--json') ? A[A.indexOf('--json') + 1] : null;
const Wz = 'hanbando', Ez = 'nippon';
const ZW = ZONES[Wz], ZE = ZONES[Ez];
const br = (z) => { const s = new Set(), bl = (ZONES[z] && ZONES[z].bridges) || []; for (let i = 0; i + 1 < bl.length; i += 2) s.add(bl[i] + '_' + bl[i + 1]); return s; };
const BR = { [Wz]: br(Wz), [Ez]: br(Ez) };
const memo = new Map();
const cellBlk = (z, lx, ly) => {   // 그 존 로컬 칸 막힘(바위 · 다리 아닌 물) — 존 걸음 문 술어의 정적 몫(판 중 도랑 · 벽 밖)
  const cx = Math.floor(lx / 32), cy = Math.floor(ly / 32), k = z + ':' + cx + ',' + cy;
  let v = memo.get(k);
  if (v === undefined) { const px = cx * 32 + 16, py = cy * 32 + 16; v = !!(T.isRockCellLocal(z, px, py) || (T.isWaterCellLocal(z, px, py) && !BR[z].has(cx + '_' + cy))); memo.set(k, v); }
  return v;
};
const seamAbs = ZW.worldOffsetX + ZW.zoneWidth;   // 한반도 동쪽 변 = 닛폰 서쪽 변(월드)
if (Math.abs(seamAbs - ZE.worldOffsetX) > 0.5) { console.error('이음매가 안 맞다', seamAbs, ZE.worldOffsetX); process.exit(2); }
const H = Math.min(ZW.zoneHeight, ZE.zoneHeight), STEP = 4, IN = 64, OUT = HANDOFF_COMMIT + 32;
//   걷기: 보내는 존 로컬 x 를 a → b 로 STEP 씩 · 칸 술어 blk(x) — 들어가려는 칸이 막혔고 지금 칸이 안 막혔으면 멈춤(존 걸음 문의 그 꼴)
const walk = (a, b, blk) => { const d = b > a ? STEP : -STEP; let x = a; if (blk(x)) return { ok: false, at: x, start: true }; for (;;) { const nx = x + d; if ((d > 0 && nx > b) || (d < 0 && nx < b)) return { ok: true }; if (blk(nx) && !blk(x)) return { ok: false, at: nx }; x = nx; } };
const rows = [];
let n = 0, landBoth = 0;
const S = { east: { off: 0, on: 0, recvClear: 0, recvClearBlocked: 0, offOnly: 0, why: { rock: 0, water: 0 } }, west: { off: 0, on: 0, recvClear: 0, recvClearBlocked: 0, offOnly: 0, why: { rock: 0, water: 0 } } };
for (let y = 16; y < H; y += 32) {
  n++;
  const yW = y + (ZE.worldOffsetY || 0) - (ZW.worldOffsetY || 0);   // 같은 월드 y(두 존 y 원점 같음 — 다르면 옮긴다)
  const lb = !cellBlk(Wz, ZW.zoneWidth - 16, y) && !cellBlk(Ez, 16, yW);
  if (lb) landBoth++;
  // 동쪽(한반도 → 닛폰): 한반도 로컬 x · 띠(x ≥ W) = 닛폰 땅(x − W)
  const blkE_off = (x) => (x < ZW.zoneWidth ? cellBlk(Wz, x, y) : false);
  const blkE_on = (x) => (x < ZW.zoneWidth ? cellBlk(Wz, x, y) : cellBlk(Ez, x - ZW.zoneWidth, yW));
  const recvE = (() => { for (let x = 0; x <= OUT; x += STEP) if (cellBlk(Ez, x, yW)) return false; return true; })();   // 받는 존(닛폰) 쪽 길이 트였나(띠 + 32)
  const eOff = walk(ZW.zoneWidth - IN, ZW.zoneWidth + OUT, blkE_off), eOn = walk(ZW.zoneWidth - IN, ZW.zoneWidth + OUT, blkE_on);
  // 서쪽(닛폰 → 한반도): 닛폰 로컬 x · 띠(x < 0) = 한반도 땅(W + x)
  const blkW_off = (x) => (x >= 0 ? cellBlk(Ez, x, yW) : false);
  const blkW_on = (x) => (x >= 0 ? cellBlk(Ez, x, yW) : cellBlk(Wz, ZW.zoneWidth + x, y));
  const recvW = (() => { for (let x = 0; x <= OUT; x += STEP) if (cellBlk(Wz, ZW.zoneWidth - 1 - x, y)) return false; return true; })();
  const wOff = walk(IN, -OUT, blkW_off), wOn = walk(IN, -OUT, blkW_on);
  for (const [k, off, on, recv, blkOn, side] of [['east', eOff, eOn, recvE, (x) => [Ez, x - ZW.zoneWidth, yW], 'e'], ['west', wOff, wOn, recvW, (x) => [Wz, ZW.zoneWidth + x, y], 'w']]) {
    const s = S[k];
    if (off.ok) s.off++;
    if (on.ok) s.on++;
    if (recv) { s.recvClear++; if (off.ok && !on.ok) s.recvClearBlocked++; }
    if (off.ok && !on.ok) {
      s.offOnly++;
      const [z, lx, ly] = blkOn(on.at), px = Math.floor(lx / 32) * 32 + 16, py = Math.floor(ly / 32) * 32 + 16;
      if (T.isRockCellLocal(z, px, py)) s.why.rock++; else s.why.water++;
    }
  }
  rows.push([y, lb ? 1 : 0, eOff.ok ? 1 : 0, eOn.ok ? 1 : 0, wOff.ok ? 1 : 0, wOn.ok ? 1 : 0]);
}
//   넘는 길목 — 켬에서 두 쪽 다 넘는 줄의 묶음(32px 이웃)
const lanes = []; let cur = null;
for (const r of rows) { const ok = r[3] && r[5]; if (ok) { if (cur && cur.y1 === r[0] - 32) cur.y1 = r[0]; else { cur = { y0: r[0], y1: r[0] }; lanes.push(cur); } } }
const out = { rows: n, landBoth, east: S.east, west: S.west, lanes: lanes.length, lanesWide: lanes.filter((l) => l.y1 - l.y0 >= 256).length, laneList: lanes.map((l) => [l.y0, l.y1]),
  stuck: S.east.recvClearBlocked + S.west.recvClearBlocked };
console.log(`이음매 줄 ${n} · 두 칸 다 땅 ${landBoth}`);
for (const k of ['east', 'west']) { const s = S[k]; console.log(`${k === 'east' ? '동쪽(한반도 → 닛폰)' : '서쪽(닛폰 → 한반도)'}: 곧게 넘음 끔 ${s.off} · 켬 ${s.on} · 끔에서만(띠 안 이웃 땅 막힘) ${s.offOnly}(바위 ${s.why.rock} · 물 ${s.why.water}) · 받는 존 길 트임 ${s.recvClear} 중 켬에서 못 넘음 ${s.recvClearBlocked}`); }
console.log(`넘는 길목(켬 · 두 쪽) ${lanes.length}(폭 256px 이상 ${out.lanesWide}) · ★걸려서 못 넘는 자리(받는 존 길이 트였는데 켬에서 막힘) ${out.stuck}`);
if (jout) fs.writeFileSync(jout, JSON.stringify(out, null, 1));
process.exit(out.stuck === 0 ? 0 : 1);
