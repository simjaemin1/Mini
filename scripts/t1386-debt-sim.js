#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1386 판 · 세계 안 만짐 · 판정 0)
// === scripts/t1386-debt-sim.js — 사유지 빚(★T1386 · 재민 11-19 · 족보 879): 넓이 × 안 들어온 날 → 남는 칸 · 접속 꼴 120일 · 속임 · 갈라짐 · 셈 비용 ==========
//
// ★무엇: `server/deeds.js` 정본(`advance` · `addPts` · `forecast` · `pickFar`)을 그대로 부른다(사본 0) · 갈라짐 술어는 `server/claims.js` `components`.
//   ① 진단 — 지금 모양(T1343: 청크가 바닥나면 그 청크의 내 칸이 통째로 풀린다)의 넓이 × 안 들어온 날 표 · 집 청크만 돌본 사람에게 무엇이 먼저 풀리나
//      (지금 모양은 `zeroAt` · `settle` 로 그 차례를 그대로 센다 — T1343 존 `_t1343Advance` 의 옛 글과 같은 차례).
//   ② 고침 — 같은 표를 빚 셈으로(PM 이 재민에게 보인 표와 견준다 · 연속 꼴 1/N² = 1/N₀² + t ÷ 12,000).
//   ③ 접속 꼴 × 120일(ⓑ 일한 시간 초당 1점 — 재민 11-19 확정 · 족보 878) — 넓히는 사람 · 속이는 사람 · 쥔 칸 · 잃은 칸 · 집이 풀린 사람 · 갈라진 땅.
//   ④ 셈 비용 — 155칸 · 한 달을 한 번에 셈(서버가 꺼져 있던 꼴) · 한 번 셈에서 풀린 칸 수 · 걸린 ms · 되풀이 수.
// ★땅 꼴(판의 조건): 집 = (0, 0) · 칸은 집에서 나선으로 붙는다(변으로 이어진 한 덩이) · 청크 4×4 세계 격자(`deeds.chunkOf`).
//   걷기 한 칸 = 존 `BUILDING_SIZE ÷ MOVE_SPEED` 초 · 청크 사이 걷기 = 청크 한 변 · 넓히기 · 돌봄의 판단은 T1343 판(`t1305-care-sim.js`) 그대로.
//
//   node scripts/t1386-debt-sim.js [--days 120] [--json <파일>]
process.env.T1305_DEEDS = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Deeds = require(path.join(ROOT, 'server', 'deeds.js'));
const Claims = require(path.join(ROOT, 'server', 'claims.js'));
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE_SPEED = +(/const MOVE_SPEED = (\d+(?:\.\d+)?);/.exec(Z) || [])[1];
const SZ = +(/const BUILDING_SIZE = (\d+);/.exec(Z) || [])[1];
if (!(MOVE_SPEED > 0 && SZ > 0)) { console.error('zone.js 에서 MOVE_SPEED · BUILDING_SIZE 를 못 읽었다'); process.exit(2); }
const STEP_S = SZ / MOVE_SPEED;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('--days', 120), JOUT = arg('--json', null);
const F = Deeds.CFG, DAY = F.DAY_MS, K = F.CHUNK, CELLS = K * K, PT = F.PT;
const comps = Claims.components;
const out = { cfg: { D0: F.D0, N0: F.N0, PT, CHUNK: K, SCORE: 'b', Q_WORK: F.Q_WORK }, stepS: STEP_S };

// ── 땅 꼴 — 집 (0,0) 에서 나선 ──
function spiral(n) {
  const cells = [], seen = new Set(); let x = 0, y = 0, dx = 1, dy = 0, run = 1, st = 0, tu = 0;
  while (cells.length < n) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); cells.push([x, y]); } x += dx; y += dy; if (++st === run) { st = 0; [dx, dy] = [-dy, dx]; if (++tu % 2 === 0) run++; } }
  return cells;
}
const SP = spiral(4000);
function mkP() { return { chunks: [], cells: [], home: '0,0', debt: 0, t: NaN, others: 0, grown: 0, homeLost: false }; }
function addCell(P, now) {   // 나선 다음 칸 하나(새로 잡은 칸은 +PT — 존 선포와 같은 길: 들어온 점수 = 빚부터)
  const [x, y] = SP[P.grown++], [cx, cy] = Deeds.chunkOf(x, y), key = cx + ',' + cy;
  let ch = P.chunks.find((c) => c.key === key);
  if (!ch) { ch = { key, n: 0, m: 0, t: now }; P.chunks.push(ch); }
  ch.n++; P.cells.push({ id: x + ',' + y, x, y, key });
  Deeds.addPts(P, ch, PT);
}
function fullP(N, now) { const P = mkP(); for (let i = 0; i < N; i++) addCell(P, now); for (const c of P.chunks) { c.m = Deeds.capOf(c.n); c.t = now; } P.t = now; P.debt = 0; return P; }
// 셈 — 갈라짐 · 집 풀림을 지켜본다
let SPLIT = 0;
function adv(P, now) {
  return Deeds.advance(P, now, comps, (cell) => {
    if (cell.id === '0,0') P.homeLost = true;
    const set = new Set(P.cells.map((c) => c.x + ',' + c.y)); if (comps(set) > 1) SPLIT++;   // 이 땅은 처음부터 한 덩이 — 풀린 뒤 둘이면 갈라진 것
  });
}

// ── ① 진단: 지금 모양(T1343 — 청크가 바닥나면 그 청크의 내 칸이 통째로) ──
function oldAfter(N, days, careHome) {
  const P = fullP(N, 0), chs = P.chunks.map((c) => ({ key: c.key, n: c.n, m: c.m, t: c.t })); let t = 0;
  const homeKey = Deeds.chunkOf(0, 0).join(','), order = [];
  const step = (to) => {
    for (;;) {
      const Nn = chs.reduce((a, c) => a + c.n, 0); let fi = -1, fz = Infinity;
      chs.forEach((c, i) => { const z = Deeds.zeroAt(c, c.n, Nn); if (z < fz) { fz = z; fi = i; } });
      if (fi < 0 || fz > to) { chs.forEach((c) => Deeds.settle(c, to, c.n, Nn)); return; }
      chs.forEach((c) => Deeds.settle(c, fz, c.n, Nn)); order.push([chs[fi].key, chs[fi].n, fz / DAY]); chs.splice(fi, 1);
    }
  };
  for (let d = 1; d <= days; d++) { step(d * DAY); if (careHome) { const h = chs.find((c) => c.key === homeKey); if (h) h.m = Deeds.capOf(h.n); } }
  return { left: chs.reduce((a, c) => a + c.n, 0), order };
}
const WIDE = [24, 30, 40, 70, 100, 155], AWAY = [3, 7, 15, 30, 41];
console.log(`=== T1386 사유지 빚 판 — 청크 ${K}×${K} · D(N) = ${F.D0} × (${F.N0} ÷ N)² · 칸 ${PT}점 · 걷기 한 칸 ${STEP_S}초 ===`);
console.log('\n## ① 지금 모양(T1343) — 가득에서 한 번도 안 들어옴 · 남는 칸(청크가 바닥나면 그 청크 칸 전부)');
console.log('| 넓이 | ' + AWAY.map((d) => d + '일').join(' | ') + ' |'); console.log('|---:|' + AWAY.map(() => '---:').join('|') + '|');
out.old = [];
for (const N of WIDE) { const row = AWAY.map((d) => oldAfter(N, d, false).left); out.old.push({ N, row }); console.log(`| ${N} | ${row.join(' | ')} |`); }
console.log('\n## ① 집 청크만 날마다 가득으로 돌본 사람(지금 모양) — 무엇이 먼저 풀리나');
out.oldHome = [];
for (const N of [40, 70, 100]) { const r = oldAfter(N, 30, true); out.oldHome.push({ N, left: r.left, order: r.order }); console.log(`  ${N}칸 · 30일: 남음 ${r.left}칸 · 풀린 차례 ${r.order.map(([k, n, d]) => `청크(${k}) ${n}칸 ${d.toFixed(1)}일`).join(' → ')}`); }

// ── ② 고침: 빚 — 같은 표 ──
const PM = { 100: [82, 46, 30, 20], 70: [70, 51, 31, 21], 40: [40, 40, 40, 23], 24: [24, 24, 24, 24] };
const cont = (N, d) => { const D = Deeds.daysOf(N); if (d <= D) return N; return Math.round(1 / Math.sqrt(1 / (N * N) + (d - D) / 12000)); };
console.log('\n## ② 고침(빚 — 100점마다 집에서 먼 칸 하나) — 같은 표 · (PM 표 · 연속 꼴)');
console.log('| 넓이 | ' + AWAY.map((d) => d + '일').join(' | ') + ' | 첫 칸 | 그 뒤 한 칸 | 바닥 뒤 하루 |'); console.log('|---:|' + AWAY.map(() => '---:').join('|') + '|---:|---:|---:|');
out.debt = [];
for (const N of WIDE) {
  const row = AWAY.map((d) => { const P = fullP(N, 0); adv(P, d * DAY); return P.cells.length; });
  const first = Deeds.daysOf(N) + PT / Deeds.dailyNeed(N), gap = PT / Deeds.dailyNeed(N);
  const fmt = (dd) => (dd < 1 / 24 ? `${(dd * 1440).toFixed(0)}분` : dd < 2 ? `${(dd * 24).toFixed(1)}시간` : `${dd.toFixed(1)}일`);
  const pm = PM[N] ? PM[N] : null, cn = [3, 7, 15, 30].map((d) => cont(N, d));
  out.debt.push({ N, row, first, gap, pm, cont: cn });
  console.log(`| ${N} | ${row.map((v, i) => `${v}${pm && i < 4 ? (pm[i] === v ? '' : `(PM ${pm[i]})`) : ''}`).join(' | ')} | ${fmt(first)} | ${fmt(gap)} | ${Math.round(Deeds.dailyNeed(N) / PT * 10) / 10}칸 |`);
}
console.log('  연속 꼴(3 · 7 · 15 · 30일): ' + out.debt.map((r) => `${r.N} → ${r.cont.join(' · ')}`).join(' / '));
// 처음부터 24칸 vs 처음부터 100칸 — 오래 안 들어오면
const longRun = [30, 60, 90, 120].map((d) => { const a = fullP(24, 0), b = fullP(100, 0); adv(a, d * DAY); adv(b, d * DAY); return [d, a.cells.length, b.cells.length]; });
out.longRun = longRun;
console.log('  처음 24칸 / 처음 100칸 — ' + longRun.map(([d, a, b]) => `${d}일 ${a} / ${b}`).join(' · '));

// ── ③ 접속 꼴 × 120일(ⓑ) ──
const PATTERNS = [
  ['하루 30분', (d) => [1800, 'all']],
  ['하루 1시간', (d) => [3600, 'all']],
  ['하루 3시간', (d) => [3 * 3600, 'all']],
  ['주말만 3시간', (d) => (d % 7 === 5 || d % 7 === 6 ? [3 * 3600, 'all'] : [0])],
  ['하루 1시간 · 60일째 2주 쉼 · 돌아와 집 청크만 하루 10분', (d) => (d < 60 ? [3600, 'all'] : d < 74 ? [0] : [600, 'home'])],
];
const gapAhead = (pat, d) => { let g = 0, last = d; for (let k = d + 1; k <= d + 8; k++) if (pat(k)[0] > 0) { g = Math.max(g, k - last); last = k; } return Math.max(g, 1); };
function runBot(pat, cheat) {
  const r = 1;   // ⓑ 초당 1점 — 정직이든 가장 싼 일 되풀이든 같다(시간이 곧 점수)
  const P = mkP(); P.t = 0; let lost = 0, maxCut = 0, hist = [];
  for (let d = 0; d < DAYS; d++) {
    const [T, how] = pat(d), now = d * DAY;
    const a = adv(P, now); lost += a.freed; maxCut = Math.max(maxCut, a.freed);
    if (!T) { hist.push(P.cells.length); continue; }
    let t = T;
    if (how === 'home') {   // 집 청크만
      const hk = Deeds.chunkOf(0, 0).join(','), h = P.chunks.find((c) => c.key === hk);
      if (h) Deeds.addPts(P, h, t * r); hist.push(P.cells.length); continue;
    }
    // 돌봄 — 빚부터 · 가장 빈 청크부터 가득으로(청크 사이 걷기 K 칸)
    const order = P.chunks.slice().sort((x, y) => x.m / Deeds.capOf(x.n) - y.m / Deeds.capOf(y.n));
    for (const c of order) {
      const short = Deeds.capOf(c.n) - c.m + P.debt; if (short <= 0) continue;
      const s = short / r + K * STEP_S; if (s > t) { Deeds.addPts(P, c, Math.max(0, (t - K * STEP_S) * r)); t = 0; break; }
      t -= s; Deeds.addPts(P, c, short);
    }
    // 넓히기 — T1343 판 그대로(다음 틈보다 버티는 날이 길고 · 그 틈의 돌봄을 그날 시간 90% 안에)
    const span = gapAhead(pat, d);
    for (;;) {
      const N1 = P.cells.length + 1;
      if (!(Deeds.daysOf(N1) > span)) break;
      if (span * Deeds.dailyNeed(N1) / r + Math.ceil(N1 / CELLS) * K * STEP_S > T * 0.9) break;
      if (t < STEP_S) break;
      addCell(P, now); t -= STEP_S;
    }
    hist.push(P.cells.length);
  }
  const a = adv(P, DAYS * DAY); lost += a.freed; maxCut = Math.max(maxCut, a.freed);
  return { cells: P.cells.length, grown: P.grown, lost, homeLost: P.homeLost, maxCut, at60: hist[59], at74: hist[74] };
}
console.log(`\n## ③ 접속 꼴 × ${DAYS}일(ⓑ 일한 시간 초당 1점) — 넓히는 사람 · 속이는 사람(가장 싼 일 되풀이)`);
console.log('| 접속 꼴 | 끝에 쥔 칸 | 잡아 본 칸 | 잃은 칸 | 집 풀림 | 한 번 셈 최대 칸 | 속이는 사람 쥔 칸(이득) |'); console.log('|---|---:|---:|---:|---|---:|---:|');
out.patterns = [];
for (const [name, pat] of PATTERNS) {
  const G = runBot(pat, false), C = runBot(pat, true);
  out.patterns.push({ name, grow: G, cheat: C });
  console.log(`| ${name} | ${G.cells} | ${G.grown} | ${G.lost} | ${G.homeLost ? '✗' : '0'} | ${G.maxCut} | ${C.cells}(${G.cells ? ((C.cells / G.cells - 1) * 100).toFixed(0) : '—'}%) |`);
}
const brk = out.patterns[4].grow;
console.log(`  2주 쉼 꼴: 쉬기 앞(60일) ${brk.at60}칸 → 돌아온 날(74일) ${brk.at74}칸 → 집 청크만 돌본 ${DAYS}일 ${brk.cells}칸 · 집 ${brk.homeLost ? '풀림' : '그대로'}`);
// 넓이별 — 안 들어오고 끝까지(집 풀림 차례 · 갈라짐)
let homeLast = 0, homeTotal = 0;
for (const N of WIDE) { const P = fullP(N, 0); let homeAt = -1, k = 0; Deeds.advance(P, 3000 * DAY, comps, (cell) => { k++; if (cell.id === '0,0') homeAt = k; const set = new Set(P.cells.map((c) => c.x + ',' + c.y)); if (P.cells.length && comps(set) > 1) SPLIT++; }); homeTotal++; if (homeAt === N || homeAt === -1) homeLast++; }
out.homeLast = { homeLast, homeTotal };
console.log(`\n## ③ 끝까지 안 들어온 땅 — 집 칸이 마지막: ${homeLast}/${homeTotal} · 판 전체에서 갈라진 땅: ${SPLIT}`);
out.split = SPLIT;

// ── ④ 셈 비용 — 155칸 · 한 달을 한 번에(서버가 꺼져 있던 꼴) ──
const cost = [];
for (const [N, d] of [[155, 30], [400, 30], [1000, 30]]) {
  const P = fullP(N, 0); const t0 = process.hrtime.bigint(); const r = adv(P, d * DAY); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const P2 = fullP(N, 0); adv(P2, Deeds.daysOf(N) * DAY); const t1 = process.hrtime.bigint(); const f = Deeds.forecast(P2, Deeds.daysOf(N) * DAY, comps); const fms = Number(process.hrtime.bigint() - t1) / 1e6;
  cost.push({ N, days: d, freed: r.freed, iters: r.iters, ms: +ms.toFixed(1), left: P.cells.length, forecastMs: +fms.toFixed(1), forecastPerDay: f.perDay });
  console.log(`  ${N}칸 · ${d}일 한 번에: 풀린 칸 ${r.freed} · 되풀이 ${r.iters} · ${ms.toFixed(1)} ms · 남음 ${P.cells.length}칸 · 내다보기(바닥난 순간) ${fms.toFixed(1)} ms · 하루 ${f.perDay}칸`);
}
out.cost = cost;
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
