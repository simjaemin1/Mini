#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1305 → T1332 → ★T1343 판 · 세계 안 만짐 · 판정 0 — 점수 꼴은 재민이 고른다)
// === scripts/t1305-care-sim.js — 사유지 계량기(★T1343 · 실제 날짜 축): 점수 후보 × 접속 꼴 → 쥐는 칸 · 돌봄 몫 · 보름 쉬면 남는 칸 ==========
//
// ★무엇: 몸 봇이 실제 날짜 위에서 접속 꼴대로 들어와 정한 시간만 움직인다. 관리도 · 줄어듦 · 0 시각은 `server/deeds.js` 정본 함수
//   (`daysOf` · `capOf` · `rateOf` · `settle` · `add` · `zeroAt`)를 그대로 부른다(사본 0). 걷기 · 칸은 `server/zone.js` 소스에서 읽는다.
//   봇 셋(카드 T1343 ③):
//     ⓐ 사는 사람 — 40칸 살림(집 3×3 · 작업장 2×2 · 밭 16 · 마당 9 · 길 2). 평소 살림(아래 `LIVE`)이 그 칸이 든 청크를 올린다.
//        모자라는 청크만 마음먹고 돌본다(그 청크에서 일하기) ⇒ "돌봄에만 쓴 시간 몫"(숙제 몫) · 살림만으로 유지되나.
//     ⓑ 넓히는 사람 — 남는 시간을 다 돌봄과 넓히기에(청크는 꽉 채운다) · 다음 접속까지 버틸 수 있을 때만 늘린다.
//     ⓒ 속이는 사람 — ⓑ 와 같되 돌봄을 가장 싼 "쓴 것"으로(보관함 넣기 · 꺼내기 되풀이 — `CHEAP_S`).
//   점수 후보(카드 ②): 'a' 일마다 P_USE 점 · 'b' 그 청크에서 일하는 시간 초당 Q_WORK(서 있기 Q_IDLE) · 'c' 반씩.
// ★가정(판의 조건 — 보고 §4): 정직한 일 한 번 = `ACT_S` 초(거두기 · 심기 · 만들기 — 한 동작) · 가장 싼 쓴 일 = `CHEAP_S` 초(넣기 · 꺼내기) ·
//   'b' 에서 일하는 시간 = 일한 뒤 머묾 초 안이 이어지는 동안(정직하든 속이든 초당 Q_WORK — 속여도 시간이 같다) · 걷기 맨해튼 · 재료는 손에.
//   사는 사람의 땅 위 일 = 접속 시간의 1/6(30분 → 5분 · 1시간 → 10분 · 3시간 → 30분 — 밭 · 보관함 · 작업장 · 요리) — 판의 가정.
//
//   node scripts/t1305-care-sim.js [--days 120] [--json <파일>]
process.env.T1305_DEEDS = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Deeds = require(path.join(ROOT, 'server', 'deeds.js'));
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE_SPEED = +(/const MOVE_SPEED = (\d+(?:\.\d+)?);/.exec(Z) || [])[1];
const SZ = +(/const BUILDING_SIZE = (\d+);/.exec(Z) || [])[1];
if (!(MOVE_SPEED > 0 && SZ > 0)) { console.error('zone.js 에서 MOVE_SPEED · BUILDING_SIZE 를 못 읽었다'); process.exit(2); }
const STEP_S = SZ / MOVE_SPEED;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('--days', 120), JOUT = arg('--json', null);
const F = Deeds.CFG, DAY = F.DAY_MS, K = F.CHUNK, CELLS = K * K;
const ACT_S = 3, CHEAP_S = 1;   // 판의 가정(위 머리)

// 점수 후보 — 초당 점수(정직 · 속임) · 그냥 서 있기
function ratesOf(sc) {
  const p = F.P_USE, q = F.Q_WORK;
  if (sc === 'a') return { honest: p / ACT_S, cheat: p / CHEAP_S, idle: p / (F.DWELL_MS / 1000) };
  if (sc === 'b') return { honest: q, cheat: q, idle: F.Q_IDLE };
  return { honest: p / 2 / ACT_S + q / 2, cheat: p / 2 / CHEAP_S + q / 2, idle: p / 2 / (F.DWELL_MS / 1000) + F.Q_IDLE / 2 };
}
// 접속 꼴 — 날 d(0 부터)에 들어오나 · 몇 초
const PATTERNS = [
  ['날마다 30분', (d) => 1800],
  ['날마다 1시간', (d) => 3600],
  ['날마다 3시간', (d) => 3 * 3600],
  ['이틀에 한 번 1시간', (d) => (d % 2 === 0 ? 3600 : 0)],
  ['주말만 3시간', (d) => (d % 7 === 5 || d % 7 === 6 ? 3 * 3600 : 0)],
  ['날마다 1시간 · 60일째부터 보름 쉼', (d) => (d >= 60 && d < 75 ? 0 : 3600)],
];
// 앞 7일 안 가장 긴 틈(제 접속 꼴은 안다 — 주말만이면 일요일 → 토요일 6일)
const gapAhead = (pat, d) => { let g = 0, last = d; for (let k = d + 1; k <= d + 8; k++) if (pat(k) > 0) { g = Math.max(g, k - last); last = k; if (k > d + 7) break; } return Math.max(g, 1); };
const maxGap = (pat) => { let g = 0, last = -1; for (let d = 0; d < DAYS + 14; d++) if (pat(d) > 0) { if (last >= 0) g = Math.max(g, d - last); last = d; } return g; };

// 한 사람의 청크들 — { n, m, t, use }(use = 살림 몫 무게 · 사는 사람만)
function settleAll(chs, now) {   // 존 `_t1343Advance` 와 같은 차례(가장 이른 0 부터 · N 이 줄면 남은 청크가 느려진다)
  let lost = 0;
  for (;;) {
    const N = chs.reduce((a, c) => a + c.n, 0);
    let fi = -1, fz = Infinity;
    chs.forEach((c, i) => { const z = Deeds.zeroAt(c, c.n, N); if (z < fz) { fz = z; fi = i; } });
    if (fi < 0 || fz > now) { chs.forEach((c) => Deeds.settle(c, now, c.n, N)); return lost; }
    chs.forEach((c) => Deeds.settle(c, fz, c.n, N));
    lost += chs[fi].n; chs.splice(fi, 1);
  }
}
const Nof = (chs) => chs.reduce((a, c) => a + c.n, 0);

// ⓐ 사는 사람(40칸 · 4×4 청크 위 나선 살림)
function liverChunks(t0) {
  const want = [['home', 9], ['shop', 4], ['field', 16], ['yard', 9], ['path', 2]];
  const cells = [], seen = new Set(); let x = 1, y = 1, dx = 1, dy = 0, run = 1, st = 0, tu = 0;   // 집 = 청크 (0,0) 안쪽
  const all = want.reduce((a, [, k]) => a + k, 0);
  while (cells.length < all) { const k = x + ',' + y; if (!seen.has(k)) { seen.add(k); cells.push([x, y]); } x += dx; y += dy; if (++st === run) { st = 0; [dx, dy] = [-dy, dx]; if (++tu % 2 === 0) run++; } }
  const by = new Map(); let i = 0;
  for (const [kind, k] of want) for (let j = 0; j < k; j++, i++) {
    const [cx, cy] = Deeds.chunkOf(cells[i][0], cells[i][1]), key = cx + ',' + cy;
    if (!by.has(key)) by.set(key, { cx, cy, n: 0, use: 0, m: NaN, t: NaN });
    const c = by.get(key); c.n++; c.use += (kind === 'home' || kind === 'field' ? 1 : (kind === 'shop' ? 0.5 : 0));
  }
  const chs = [...by.values()]; chs.forEach((c) => Deeds.init(c, t0, c.n)); return chs;
}
function runLiver(sc, pat) {
  const R = ratesOf(sc), gap = maxGap(pat);
  let chs = liverChunks(0), careS = 0, playS = 0, lost = 0, brk = null;
  for (let d = 0; d < DAYS; d++) {
    const T = pat(d); if (!T) continue;
    const now = d * DAY;
    lost += settleAll(chs, now);
    if (d === 75 && brk == null && !pat(74)) brk = Nof(chs);
    if (!chs.length) break;
    playS += T;
    const N = Nof(chs);
    // 평소 살림 — 땅 위 일 T/6 초를 쓰는 칸 무게대로 그 청크에(정직한 일 초당 점수)
    const W = T / 6, U = chs.reduce((a, c) => a + c.use, 0);
    chs.forEach((c) => { if (c.use > 0) Deeds.add(c, R.honest * W * c.use / U, c.n); });
    // 다음 접속까지 버틸 만큼(다음 틈 날 × 하루 줄어듦 + 하루 여유)이 안 되는 청크만 마음먹고 돌본다(그 청크에서 일하기 · 걸어가기)
    let nd = d + 1; while (nd < d + 30 && !pat(nd)) nd++;
    const need = (c) => Math.min(Deeds.capOf(c.n), (nd - d + 1) * Deeds.rateOf(c.n, N) * DAY);
    for (const c of chs) {
      const short = need(c) - c.m; if (short <= 0) continue;
      const s = short / R.honest + 2 * (Math.abs(c.cx) + Math.abs(c.cy)) * K * STEP_S;
      careS += s; Deeds.add(c, short, c.n);
    }
  }
  const after = chs.length ? Nof(chs) : 0;
  return { cells: after, careShare: playS ? careS / playS : 0, lost, gap, kept: after === 40, afterBreak: brk };
}
// ⓑ · ⓒ 넓히는 사람(청크 꽉 채움 · 버틸 수 있을 때만 늘림)
function runGrow(sc, pat, cheat) {
  const R = ratesOf(sc), r = cheat ? R.cheat : R.honest, gap = maxGap(pat);
  let chs = [], careS = 0, playS = 0, lost = 0, hist = [], brk = null;
  for (let d = 0; d < DAYS; d++) {
    const T = pat(d); if (!T) { continue; }
    const now = d * DAY; lost += settleAll(chs, now); playS += T;
    if (d === 75 && brk == null && !pat(74)) brk = Nof(chs);   // 보름 쉼 꼴 — 돌아온 날 남은 칸
    let t = T;
    const span = gapAhead(pat, d);   // 앞 7일 안 가장 긴 틈(다음 접속까지가 아니라 — 주말만은 6일)
    // 돌봄 — 모든 청크를 가득으로(가장 빈 것부터) · 청크 사이 걷기 K 칸
    const order = chs.slice().sort((x, y) => x.m / Deeds.capOf(x.n) - y.m / Deeds.capOf(y.n));
    for (const c of order) {
      const short = Deeds.capOf(c.n) - c.m; if (short <= 0) continue;
      const s = short / r + K * STEP_S; if (s > t) { const part = Math.max(0, (t - K * STEP_S) * r); Deeds.add(c, part, c.n); careS += t; t = 0; break; }
      t -= s; careS += s; Deeds.add(c, short, c.n);
    }
    // 넓히기 — 한 칸씩 · 붙인 뒤에도 (1) 다음 접속까지 가득에서 안 빈다(D(N') > 틈) (2) 다음 접속의 돌봄(틈 × N'³ ÷ 240 점)을 그날 시간 90% 안에 한다
    for (;;) {
      const N1 = Nof(chs) + 1;
      if (!(Deeds.daysOf(N1) > span)) break;   // 다음 접속까지 가득에서 안 빈다(접속 시각이 날마다 같다고 둔 칼날 — 보고 §4)
      const needS = span * Deeds.dailyNeed(N1) / r + Math.ceil(N1 / CELLS) * K * STEP_S;
      if (needS > T * 0.9) break;
      if (t < STEP_S) break;
      let c = chs.find((q) => q.n < CELLS);
      if (!c) { c = { n: 0, m: 0, t: now }; chs.push(c); }
      Deeds.settle(c, now, c.n, N1 - 1);
      c.n++; Deeds.add(c, F.PT, c.n); t -= STEP_S;   // 새로 잡은 칸은 가득(+PT)
    }
    hist.push(Nof(chs));
  }
  const tail = hist.slice(-10);
  return { cells: Math.round(tail.reduce((a, b) => a + b, 0) / Math.max(1, tail.length)), careShare: playS ? careS / playS : 0, lost, gap, afterBreak: brk };
}
// 보름 쉬면 남는 칸 — 가득으로 두고 15일(실제 날짜) 뒤
function afterBreak(N, days) { const chs = []; let left = N; while (left > 0) { const n = Math.min(CELLS, left); chs.push({ n, m: Deeds.capOf(n), t: 0 }); left -= n; } settleAll(chs, days * DAY); return Nof(chs); }

const SC = ['a', 'b', 'c'];
const out = { stepS: STEP_S, actS: ACT_S, cheapS: CHEAP_S, cfg: { D0: F.D0, N0: F.N0, PT: F.PT, CHUNK: K, P_USE: F.P_USE, Q_WORK: F.Q_WORK, Q_IDLE: F.Q_IDLE, DWELL_S: F.DWELL_MS / 1000 }, days: DAYS, rows: [], need: [], breaks: [] };
console.log(`=== T1343 계량기 판 — 실제 날짜 ${DAYS}일 · 청크 ${K}×${K} · D(N) = ${F.D0} × (${F.N0} ÷ N)² · 칸 ${F.PT}점 · 일 한 번 ${ACT_S}초(속임 ${CHEAP_S}초) · 걷기 한 칸 ${STEP_S}초 ===`);
console.log('\n## 하루 필요 점수 · 정직한 일로 드는 하루 시간(점수 꼴마다)');
console.log('| 내 칸 N | 버티는 날 D(N) | 하루 필요 점수 | ⓐ 일마다 ' + F.P_USE + '점 | ⓑ 초당 ' + F.Q_WORK + '점 | ⓒ 반씩 |');
console.log('|---:|---:|---:|---:|---:|---:|');
for (const N of [24, 40, 70, 100, 155, 200]) {
  const need = Deeds.dailyNeed(N), mins = SC.map((s) => need / ratesOf(s).honest / 60);
  out.need.push({ N, days: Deeds.daysOf(N), need, mins });
  console.log(`| ${N} | ${Deeds.daysOf(N).toFixed(1)}일 | ${Math.round(need).toLocaleString()} | ${mins[0].toFixed(1)}분 | ${mins[1].toFixed(1)}분 | ${mins[2].toFixed(1)}분 |`);
}
console.log('\n## 재민이 고를 표 — 점수 후보 × 접속 꼴');
console.log('| 접속 꼴 | 점수 | ⓐ 사는 사람 40칸 — 끝에 남음 · 돌봄 몫 | ⓑ 넓히는 사람 쥐는 칸 · 돌봄 몫 | ⓒ 속이는 사람 쥐는 칸(이득) | 보름 쉬고 돌아온 날 남은 칸(ⓐ · ⓑ) |');
console.log('|---|---|---|---|---|---|');
for (const [pn, pat] of PATTERNS) for (const sc of SC) {
  const L = runLiver(sc, pat), G = runGrow(sc, pat, false), C = runGrow(sc, pat, true);
  out.rows.push({ pattern: pn, score: sc, liver: L, grow: G, cheat: C });
  const pc = (v) => (v * 100).toFixed(v < 0.01 ? 2 : 1) + '%';
  console.log(`| ${pn} | ${sc} | ${L.cells}칸${L.kept ? '' : ' ✗'} · ${pc(L.careShare)} | ${G.cells}칸 · ${pc(G.careShare)} | ${C.cells}칸(${G.cells ? ((C.cells / G.cells - 1) * 100).toFixed(0) : '—'}%) | ${L.afterBreak == null ? '—' : `${L.afterBreak} · ${G.afterBreak}`} |`);
}
console.log('\n## 보름(15일) 쉬면 남는 칸(가득에서 · 실제 날짜) · 14일이면');
for (const N of [24, 30, 38, 40, 41, 70, 100]) { const a15 = afterBreak(N, 15), a14 = afterBreak(N, 14); out.breaks.push({ N, d15: a15, d14: a14 }); console.log(`  ${N}칸 → 15일 ${a15}칸 · 14일 ${a14}칸 (D = ${Deeds.daysOf(N).toFixed(1)}일)`); }
console.log('\n## 마을 안 — 영토 약 9,200칸(인당 119 · PM 셈) · 편한 땅 40칸씩');
for (const n of [10, 30]) console.log(`  플레이어 ${n}명 × 40칸 = ${n * 40}칸 = 영토의 ${(n * 40 / 9200 * 100).toFixed(1)}%`);
out.village = [10, 30].map((n) => ({ players: n, cells: n * 40, pct: n * 40 / 9200 }));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
