#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1235-nearest.js — 전투 가장 가까운 적 찾기 빠른 길(T1235)이 고리 찾기와 같은 답인가 ===
//
// ★무엇을 보나
//   ① 같은 답 — 몸 수 · 흩어짐(가까이 · 멀리 · 고리 80 밖) · 같은 거리(칸 안 · 칸 사이 동률) · 사선 술어(나무가 막음) · 죽은 몸 · 한 편만 남은 판에서
//      `nearestEnemy` 의 답(적 · 거리)이 고리 찾기(이 파일의 대조 오라클 — T1235 앞 글자 그대로)와 모두 같다
//   ② 자명 통과 금지 — 빠른 길이 실제로 탄 부름이 있다(몸 줄로 넘어간 수 > 0) · 고리 찾기로 끝난 부름도 있다
//   ③ 판 — 같은 씨 전투(`buildArmies` · `stepBattle`)를 빠른 길 켬 · 끔(몸 줄을 지운 ctx)으로 돌려 매 걸음 몸 자리 · hp 가 같다
//   ④ 빠르기 — 몸 1,000 · 적이 멀리 있는 판에서 부름 µs(표 · 빠른 길이 고리 찾기보다 느리지 않다)
// 실행: node scripts/test-t1235-nearest.js   (몇 초)
'use strict';
const path = require('path');
const BC = require(path.join(__dirname, '..', 'sim', 'battle-core.js'));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// 대조 오라클 — T1235 앞 `nearestEnemy` 글자 그대로(고리 찾기만)
const BK = 2.5;
function oracle(ctx, u, maxR, los, treeBlocks) {
  const bx = Math.floor(u.x / BK), by = Math.floor(u.y / BK); let best = null, bd = 1e18;
  for (let r = 0; r <= (maxR || 80); r++) {
    for (let ix = bx - r; ix <= bx + r; ix++) for (let iy = by - r; iy <= by + r; iy++) {
      if (r > 0 && ix > bx - r && ix < bx + r && iy > by - r && iy < by + r) continue;
      const c = ctx._grid.get(((ix + 256) * 8192) + (iy + 256)); if (!c) continue;
      for (const e of c) { if (e.side === u.side || e.hp <= 0) continue; const dx = u.x - e.x, dy = u.y - e.y, d = dx * dx + dy * dy; if (d < bd && !(los && ctx.world && treeBlocks(ctx, u.x, u.y, e.x, e.y))) { bd = d; best = e; } }
    }
    if (best) { const rm = r * BK; if (bd <= rm * rm) break; }
  }
  return best ? { e: best, d: Math.sqrt(bd) } : null;
}
let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function mkCtx(n, spread, opt) {
  const ctx = { units: [], _grid: new Map(), _cen: { A: {}, B: {} }, rng: rnd, world: null };
  for (let i = 0; i < n; i++) {
    const side = (opt.oneSide ? 'A' : (i % 2 ? 'A' : 'B'));
    let x = (rnd() - 0.5) * spread, y = (rnd() - 0.5) * spread;
    if (opt.split) x += side === 'A' ? -opt.split : opt.split;
    if (opt.grid) { x = Math.round(x / 2.5) * 2.5 + 0.5; y = Math.round(y / 2.5) * 2.5 + 0.5; }   // 같은 거리 동률이 잦게
    ctx.units.push({ id: i, side, type: 'spear', x, y, hp: (opt.dead && rnd() < 0.2) ? 0 : 10 });
  }
  if (opt.los) ctx.world = { losBlocked: (x1, y1, x2, y2) => (Math.floor((x1 + x2) * 7 + (y1 + y2) * 13) % 5) === 0 };
  BC._buildGrid(ctx);
  return ctx;
}
const treeBlocks = (ctx, x1, y1, x2, y2) => !!(ctx.world && ctx.world.losBlocked(x1, y1, x2, y2));

console.log('\n=== ① 같은 답 · ② 자명 통과 금지 ===');
{
  let calls = 0, same = 0, direct = 0, ring = 0, nul = 0;
  const cases = [
    [40, 30, {}], [200, 60, {}], [600, 120, { split: 150 }], [1000, 40, { split: 250 }], [300, 600, {}],
    [120, 20, { grid: true }], [400, 50, { grid: true, split: 60 }], [250, 80, { los: true }], [500, 80, { los: true, split: 120, dead: true }],
    [200, 50, { oneSide: true }], [30, 700, { dead: true }],
  ];
  for (const [n, spread, opt] of cases) {
    const ctx = mkCtx(n, spread, opt);
    const nG = ctx._gl.length / 3;
    for (const u of ctx.units) for (const maxR of [0, 3, 6, 14, 40, 80]) {
      // 몸이 걸음 사이 움직였을 때도(칸 = 지은 때 · 거리 = 지금) — 반은 조금 옮겨 본다
      const a = BC._nearestEnemy(ctx, u, maxR, !!opt.los), b = oracle(ctx, u, maxR, !!opt.los, treeBlocks);
      calls++;
      if ((a === null && b === null) || (a && b && a.e === b.e && a.d === b.d)) same++;
      if (b === null) nul++;
      let r0 = 0; while ((2 * r0 + 1) * (2 * r0 + 1) <= nG && r0 <= (maxR || 80)) r0++;
      if (r0 <= (maxR || 80)) direct++; else ring++;
    }
    for (const u of ctx.units) { u.x += (rnd() - 0.5) * 3; u.y += (rnd() - 0.5) * 3; }
    for (const u of ctx.units) { const a = BC._nearestEnemy(ctx, u, 80, !!opt.los), b = oracle(ctx, u, 80, !!opt.los, treeBlocks); calls++; if ((a === null && b === null) || (a && b && a.e === b.e && a.d === b.d)) same++; }
  }
  ok(same === calls, '빠른 길 = 고리 찾기(적 · 거리 · 같은 거리 차례 · 사선 · 죽은 몸 · 한 편 · 걸음 뒤 옮김)', `${same}/${calls}`);
  ok(direct > 0 && ring > 0 && nul > 0, '자명 통과 금지 — 몸 줄로 간 부름 · 고리로 끝난 부름 · 적 없음 답이 다 있다', `몸 줄 ${direct} · 고리 ${ring} · 없음 ${nul}`);
}

console.log('\n=== ③ 판 — 같은 씨 전투가 걸음마다 같다 ===');
{
  // 판 단위: 같은 몸 줄을 두 ctx 로 — 하나는 빠른 길(`_gl` 있음) · 하나는 `_gl` 을 매 걸음 지운다(고리만)
  const mk = () => { seed = 777; const c = mkCtx(600, 80, { split: 90 }); for (const u of c.units) { u.type = u.side === 'A' ? 'spear' : 'archer'; } return c; };
  const A = mk(), B = mk();
  let eq = true, steps = 0, moved = 0;
  for (let s = 0; s < 40; s++) {
    BC._buildGrid(A); BC._buildGrid(B); B._gl = null;
    for (let i = 0; i < A.units.length; i++) {
      const ua = A.units[i], ub = B.units[i];
      const ea = BC._nearestEnemy(A, ua, 80, false), eb = BC._nearestEnemy(B, ub, 80, false);
      const ia = ea ? ea.e.id : -1, ib = eb ? eb.e.id : -1;
      if (ia !== ib) eq = false;
      // 그 적 쪽으로 한 걸음(둘 다 같은 식) · 가끔 맞아 죽는다
      for (const [u, e] of [[ua, ea], [ub, eb]]) if (e) { const k = Math.min(1, 1.2 / Math.max(1e-9, e.d)); u.x += (e.e.x - u.x) * k; u.y += (e.e.y - u.y) * k; if (e.d < 1.5) e.e.hp -= 3; }
    }
    steps++; moved += A.units.filter((u) => u.hp > 0).length;
  }
  const same = A.units.every((u, i) => u.x === B.units[i].x && u.y === B.units[i].y && u.hp === B.units[i].hp);
  ok(eq && same, '600몸 40걸음 — 고른 적 · 자리 · hp 가 걸음마다 같다', `${steps}걸음 · 산 몸-걸음 ${moved}`);
}

console.log('\n=== ④ 빠르기 — 몸 1,000 · 적이 멀리 ===');
{
  seed = 4242; const ctx = mkCtx(1000, 60, { split: 400 });
  const t0 = process.hrtime.bigint(); for (const u of ctx.units) BC._nearestEnemy(ctx, u, 80, false); const tf = Number(process.hrtime.bigint() - t0) / 1e3 / ctx.units.length;
  const t1 = process.hrtime.bigint(); for (const u of ctx.units) oracle(ctx, u, 80, false, treeBlocks); const to = Number(process.hrtime.bigint() - t1) / 1e3 / ctx.units.length;
  console.log(`    표: 부름 하나 — 빠른 길 ${tf.toFixed(1)} µs · 고리 찾기 ${to.toFixed(1)} µs(${(to / Math.max(tf, 1e-9)).toFixed(0)}배)`);
  ok(tf < to, '빠른 길이 고리 찾기보다 빠르다');
}
console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);
