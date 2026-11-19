#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1338 자 · 제품 무변 · 읽기만)
// === scripts/t1338-fight-bench.js — 맞붙은 교전 틱 자: 운영 함수 그대로(villages `__p3Bind` · `_warWorld` · war-live `makeFight` · `enlist` · `stepFight` · battle-core) ===
//   장면: 열린 들 · 나무(결정적 흩뿌림 · `--trees` 밀도) · 공격 A · 지키는 B 각 N(창 · 궁수 · 단검 · 민병 섞음) — 양쪽 전진 명령 → 맞붙음.
//   잰다: 틱 ms(hrtime) · 상태 · 산 몸 · (선택) 같은 판 두 번의 결과 지문.
//   node scripts/t1338-fight-bench.js [--n 300] [--ticks 300] [--trees 0.08] [--villages <파일>] [--json <파일>]
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('--n', 300), TICKS = +arg('--ticks', 300), TREES = +arg('--trees', 0.08), VFILE = arg('--villages', path.join(ROOT, 'server', 'villages.js')), JOUT = arg('--json', null);
const SZ = 32;

function scene() {
  const _l = console.log; console.log = () => {};
  let V; try { V = require(VFILE); } finally { console.log = _l; }
  const WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js');
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const standSrc = /function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZSRC);
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', standSrc[0] + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  // 나무 — 칸 해시로 결정적(밀도 TREES) · 싸움터 가운데 띠는 비운다(맞붙을 자리)
  const h = (x, y) => { let v = (x * 73856093) ^ (y * 19349663); v = (v ^ (v >>> 13)) * 1274126177; return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const tree = (cx, cy) => Math.abs(cx - 500) > 2 && h(cx, cy) < TREES;
  const players = new Map();
  const deps = { isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, treeCellBlocked: (cx, cy) => tree(cx, cy), standCellNear, anyViewerNear: () => false, players };
  const world = { day: 400 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [], byDbId: new Map(), byEcon: new Map(), world, db: null,
    warBodies: new Map(), _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 } });
  const WL = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: () => {}, blockedCell: (cx, cy) => H._warBlockedCell(cx, cy), arrowOut: () => {}, arrowNear: () => false });
  H.state.warLive = WL;
  H._warBuildRectIndex(true);
  const w = { id: 7, born: 1, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0 };
  const f = WL.makeFight(w, null, { A: { weapQ: 0.5 }, B: null });
  f.ctx.world = H._warWorld(f);
  f.physical = true;
  const MPC = WL.M_PER_CELL, PXM = WL.PX_PER_M;
  f.home = { A: { x: 440 * MPC, y: 500 * MPC }, B: { x: 560 * MPC, y: 500 * MPC } };
  f.objective = f.home.B; f.route = [f.home.A, f.home.B]; f.holder = 'B';
  const types = ['spear', 'spear', 'archer', 'dagger', 'militia'];
  let pid = 0;
  for (const side of ['A', 'B']) {
    f.ctx.sides[side].form = 'line';
    const x0 = side === 'A' ? 488 : 512;
    for (let i = 0; i < N; i++) {
      const cx = x0 + (side === 'A' ? -1 : 1) * Math.floor(i / 30) * 0.6, cy = 485 + (i % 30);
      const p = { pid: 'u' + (++pid), x: (cx + 0.5) * MPC * PXM, y: (cy + 0.5) * MPC * PXM };
      players.set(p.pid, p);
      WL.enlist(f, side, { type: types[i % types.length], pid: p.pid, x: cx, y: cy }, p);
    }
  }
  WL.orderAdvance(f, 'A'); WL.orderAdvance(f, 'B');
  return { f, WL, H, players };
}

const { f, WL, players } = scene();
const ms = [], states = [];
for (let t = 0; t < TICKS; t++) {
  const t0 = process.hrtime.bigint();
  const ev = WL.stepFight(f);
  ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
  states.push(f.state);
  if (ev.rout) break;
}
const alive = WL.aliveCounts(f);
let fp = 0; for (const u of f.ctx.units) { fp = (fp * 31 + Math.round(u.x * 1000) + Math.round(u.y * 1000) * 7 + Math.round(u.hp * 100)) >>> 0; }
const sorted = ms.slice().sort((a, b) => a - b), q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const out = { n: N, ticks: ms.length, trees: TREES, max: Math.max(...ms), p50: q(0.5), p99: q(0.99), sum: ms.reduce((a, b) => a + b, 0), over33: ms.filter((x) => x > 33.3).length, over100: ms.filter((x) => x > 100).length, engaged: states.filter((s) => s === 'engaged').length, alive, dead: { A: f.ctx.sides.A.dead, B: f.ctx.sides.B.dead }, fp };
fs.writeSync(1, '@@T1338 ' + JSON.stringify(out) + '\n');
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(Object.assign({ ms }, out)));
process.exit(0);
