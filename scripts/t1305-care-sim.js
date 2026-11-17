#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1305 → ★T1332 판 · 세계 안 만짐 · 판정 0 — 모양 · 수는 재민이 고른다)
// === scripts/t1305-care-sim.js — 사유지 돌봄의 실질 상한(★T1332 청크 · 쓰면 저절로 · 초선형) ===========================
//
// ★무엇: 몸 봇이 접속한 날마다 정한 시간(30분 · 1시간 · 3시간)만 움직인다. 낡음 · 단계 · 배수는 `server/deeds.js` 정본 함수
//   (`wear` · `used` · `rate` · `daysToFree` · `chunkOf`)를 그대로 부른다(사본 0). 걷기(`MOVE_SPEED`) · 칸(`BUILDING_SIZE`)은 `server/zone.js` 소스에서 읽는다.
//   봇 셋(카드 T1332 ④):
//     ⓐ 사는 사람 — 제 일(집 · 보관함 · 밭 · 작업장)을 하며 쓰는 청크만 쥔다. 일로 안 닿는 청크(마당 · 쉬는 날의 작업장)만 머묾으로 돌본다.
//        ⇒ "그날 돌봄에만 쓴 시간 몫"을 잰다(숙제 몫). 땅 = 하루 시간에 맞춘 살림(아래 `LIVE`).
//     ⓑ 넓히는 사람 — 남는 시간을 다 돌봄 순회(머묾)와 넓히기에 쓴다. 청크는 꽉 채운다(한 청크 = 한 번 돌봄). 하나 더 늘려도 다음 날부터
//        버틸 수 있을 때만 늘린다(초선형이라 무턱대고 늘리면 모든 청크의 낡음이 빨라져 한꺼번에 풀린다 — 똑똑한 봇).
//     ⓒ 속이는 사람 — ⓑ 와 같되 돌봄을 가장 싼 "쓴 것"으로(머묾 대신 그 청크에 한 발 들여 한 번 만들기 · 넣기 — `CHEAP_S`) · 청크 모서리를 노린다.
//   견줌(카드 ⑤): (가) 울타리만 — 칸마다 손보기(T1305 꼴)인데 테두리 칸만 낡는다 · (나) 하루 한 청크만 돌봄 인정 · T1305 A · B · C(칸마다 · 선형 —
//   `계측/T1305_돌봄판_g0.json` 그대로 읽는다).
// ★가정(판의 조건 · 새 수 아님 — 보고 §4 에 적는다): 접속은 날마다 · 집 = 청크 한가운데 · 재료는 손에 있다(`--gather` 로 칸마다 모으는 초를 더할 수 있다) ·
//   걷기는 맨해튼 칸 · 머묾 = `DWELL_MS`(T1305 손보는 시간 20초 재사용) · 싼 쓰기 `CHEAP_S` = 한 칸 걷는 시간(한 동작 왕복 — 가장 싸게 잡는다).
//
//   node scripts/t1305-care-sim.js [--days 240] [--gather 0] [--json <파일>]
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
process.env.T1305_DEEDS = '1';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Deeds = require(path.join(ROOT, 'server', 'deeds.js'));
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const MOVE_SPEED = +(/const MOVE_SPEED = (\d+(?:\.\d+)?);/.exec(Z) || [])[1];
const SZ = +(/const BUILDING_SIZE = (\d+);/.exec(Z) || [])[1];
if (!(MOVE_SPEED > 0 && SZ > 0)) { console.error('zone.js 에서 MOVE_SPEED · BUILDING_SIZE 를 못 읽었다'); process.exit(2); }
const STEP_S = SZ / MOVE_SPEED;   // 한 칸 걷는 초
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DAYS = +arg('--days', 240), GATHER = +arg('--gather', 0), JOUT = arg('--json', null);
const DWELL_S = Deeds.CFG.DWELL_MS / 1000;
const CHEAP_S = STEP_S;

const SIZES = [4, 8, 16];
const COMBOS = [   // [이름, 흐림, 풀림(기준 날), 기준 청크 수] — 제안 셋(가운데 = deeds.js 기본)
  ['A 빠름', 2, 3, 2],
  ['B 가운데(기본)', 3, 7, 2],
  ['C 느림', 7, 14, 8],
];
const DAILY = [['30분', 30 * 60], ['1시간', 3600], ['3시간', 3 * 3600]];
// ⓐ 사는 사람의 살림(칸) — 하루 시간이 늘면 밭이 는다(밭 칸 = 그날 거두고 심는 칸). 집 3×3 · 작업장 2×2 · 마당 3×3 은 그대로.
//   쓰는 날: 집(보관함) 날마다 · 밭 날마다 · 작업장 이틀에 한 번 · 마당 안 씀(머묾으로만).
const LIVE = { '30분': 16, '1시간': 36, '3시간': 100 };

const setCombo = (cb, K) => Object.assign(Deeds.CFG, { FADE_D: cb[1], FREE_D: cb[2], BASE: cb[3], CHUNK: K });
const ck = (x, y) => x + ',' + y;

// ── ⓑ · ⓒ 넓히는 봇(청크 꽉 채우기 · 버틸 수 있을 때만 늘린다) ───────────────────────────────
function runGrow(K, daily, cheat) {
  const H = Math.floor(K / 2);   // 집 = 청크 (0,0) 한가운데 칸
  const chunks = new Map();      // 청크 키 → { cx, cy, w, n0, cells }
  const CELLS = K * K;
  let n = 0, lost = 0, careSum = 0, careN = 0;
  const hist = [];
  const near = (px, py, c) => {   // 그 청크의 가장 가까운 칸까지 맨해튼 거리 · 그 칸(머묾은 들어선 칸에서 그대로 선다)
    const x0 = c.cx * K, y0 = c.cy * K, qx = Math.min(Math.max(px, x0), x0 + K - 1), qy = Math.min(Math.max(py, y0), y0 + K - 1);
    return [Math.abs(px - qx) + Math.abs(py - qy), qx, qy];
  };
  const visitS = () => (careN ? careSum / careN : K * STEP_S + (cheat ? CHEAP_S : DWELL_S));
  const careTime = (C) => { const I = Deeds.daysToFree(C) - 1; return I < 1 ? Infinity : (C / I) * visitS(); };
  for (let d = 1; d <= DAYS; d++) {
    n++;
    // 하루 머리 — 낡음(정본 `wear` · 지금 청크 수로) · 풀림
    const C0 = chunks.size;
    for (const [k, c] of chunks) { if (Deeds.wear(c, n, C0) === 'free') { chunks.delete(k); lost += c.cells; } }
    let t = daily, px = H, py = H, careT = 0;
    // 돌봄 — 내일 풀릴 청크(w + 배수 ≥ 풀림)부터 · 가까운 차례
    const C1 = chunks.size, r = Deeds.rate(C1);
    const due = [...chunks.values()].filter((c) => c.w + r >= Deeds.CFG.FREE_D);
    while (due.length && t > 0) {
      let bi = 0, bd = Infinity, bq = null;
      for (let i = 0; i < due.length; i++) { const q = near(px, py, due[i]); if (q[0] < bd) { bd = q[0]; bi = i; bq = q; } }
      const need = bd * STEP_S + (cheat ? CHEAP_S : DWELL_S);
      if (need > t) break;
      t -= need; careT += need; careSum += need; careN++;
      px = bq[1]; py = bq[2];
      Deeds.used(due[bi], n); due.splice(bi, 1);
    }
    // 넓히기 — 덜 찬 청크부터 채우고, 다 찼으면 버틸 수 있을 때만 새 청크(집에서 가까운 것)
    for (;;) {
      let tgt = null;
      for (const c of chunks.values()) if (c.cells < CELLS && (!tgt || Math.abs(c.cx) + Math.abs(c.cy) < Math.abs(tgt.cx) + Math.abs(tgt.cy))) tgt = c;
      if (!tgt) {
        const C = chunks.size;
        if (C && careTime(C + 1) > daily) break;   // 하나 더면 다음 날부터 못 버틴다
        let best = null;
        if (!C) best = [0, 0];
        else for (const c of chunks.values()) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = c.cx + dx, y = c.cy + dy; if (chunks.has(ck(x, y))) continue;
          if (!best || Math.abs(x) + Math.abs(y) < Math.abs(best[0]) + Math.abs(best[1])) best = [x, y];
        }
        tgt = { cx: best[0], cy: best[1], w: 0, n0: n, cells: 0 };
        const q = near(px, py, tgt), walk = q[0] * STEP_S;
        if (walk + STEP_S + GATHER > t) break;
        t -= walk; px = q[1]; py = q[2];
        chunks.set(ck(tgt.cx, tgt.cy), tgt);
      }
      const need = STEP_S + GATHER;   // 칸 하나 — 옆 칸으로 한 걸음 + 모으기(재료는 손에)
      const k = Math.min(CELLS - tgt.cells, Math.floor(t / need));
      if (k <= 0) { if (!tgt.cells) chunks.delete(ck(tgt.cx, tgt.cy)); break; }
      t -= k * need; tgt.cells += k; Deeds.used(tgt, n);   // 칸을 붙인 청크 = 쓴 청크(짓기)
    }
    let cells = 0; for (const c of chunks.values()) cells += c.cells;
    hist.push({ d, cells, chunks: chunks.size, care: careT });
  }
  const tail = hist.slice(-60);
  const avg = (f) => tail.reduce((a, h) => a + f(h), 0) / tail.length;
  return { cells: Math.round(avg((h) => h.cells)), chunks: +avg((h) => h.chunks).toFixed(1), careShare: avg((h) => h.care) / daily, lost, cap: Math.ceil(Deeds.CFG.FREE_D * Deeds.CFG.BASE) - 1 };
}

// ── ⓐ 사는 사람 ─────────────────────────────────────────────────────────────────────────────────
function runLive(K, daily, dname) {
  const H = Math.floor(K / 2);
  // 살림 칸 — 집 둘레로 나선(집 → 작업장 → 밭 → 마당). 칸마다 쓰는 일.
  const want = [['home', 9], ['shop', 4], ['field', LIVE[dname]], ['yard', 9]];
  const cells = []; const seen = new Set();
  let x = H, y = H, dx = 1, dy = 0, run = 1, stepIn = 0, turns = 0;
  const all = want.reduce((a, [, k]) => a + k, 0);
  while (cells.length < all) {
    const k = ck(x, y); if (!seen.has(k)) { seen.add(k); cells.push([x, y]); }
    x += dx; y += dy; stepIn++;
    if (stepIn === run) { stepIn = 0; [dx, dy] = [-dy, dx]; turns++; if (turns % 2 === 0) run++; }
  }
  let i = 0; const use = new Map();   // 청크 키 → 쓰는 일 집합
  const chunks = new Map();
  for (const [kind, k] of want) for (let j = 0; j < k; j++, i++) {
    const [cx, cy] = Deeds.chunkOf(cells[i][0], cells[i][1]); const key = ck(cx, cy);
    if (!use.has(key)) { use.set(key, new Set()); chunks.set(key, { cx, cy, w: 0, n0: 0, cells: 0 }); }
    use.get(key).add(kind); chunks.get(key).cells++;
  }
  let n = 0, lostCells = 0, careSum = 0;
  for (let d = 1; d <= DAYS; d++) {
    n++;
    const C0 = chunks.size;
    for (const [k, c] of chunks) { if (Deeds.wear(c, n, C0) === 'free') { chunks.delete(k); lostCells += c.cells; } }
    // 그날 제 일 — 쓰는 청크는 저절로 새것
    for (const [k, c] of chunks) { const u = use.get(k); if (u.has('home') || u.has('field') || (u.has('shop') && d % 2 === 0)) Deeds.used(c, n); }
    // 일로 안 닿은 청크 중 내일 풀릴 것 — 머묾(집에서 걸어가 20초 · 돌아옴)
    const r = Deeds.rate(chunks.size);
    for (const c of chunks.values()) if (c.w + r >= Deeds.CFG.FREE_D) {
      const qx = Math.min(Math.max(H, c.cx * K), c.cx * K + K - 1), qy = Math.min(Math.max(H, c.cy * K), c.cy * K + K - 1);
      careSum += 2 * (Math.abs(qx - H) + Math.abs(qy - H)) * STEP_S + DWELL_S; Deeds.used(c, n);
    }
  }
  let held = 0; for (const c of chunks.values()) held += c.cells;
  return { cells: held, chunks: chunks.size, careShare: careSum / DAYS / daily, lost: lostCells };
}

// ── 견줌 (가) 울타리만 — 테두리 칸만 낡는다(칸마다 손보기 · T1305 B 의 풀림 7 · 손보기 20초) · 정사각 땅 ─────
function runFence(daily) {
  const free = 7, careS = DWELL_S;   // T1305 B 줄
  let s = 1;
  for (;;) { const per = 4 * (s + 1) - 4; const visits = per / (free - 1); if (visits * (careS + STEP_S) > daily) break; s++; }
  return { cells: s * s, edge: Math.max(1, 4 * s - 4) };
}
// ── 견줌 (나) 하루 한 청크만 돌봄 인정(배수 1 · 접속 시간 무관) — 청크는 풀림 − 1 날마다 한 번 ⇒ 청크 ≤ 풀림 − 1 ─────
function runOnePerDay(K) { const free = 7; return { cells: (free - 1) * K * K, chunks: free - 1 }; }

// ── 표 ────────────────────────────────────────────────────────────────────────────────────────
const out = { moveSpeed: MOVE_SPEED, cellPx: SZ, stepS: STEP_S, dwellS: DWELL_S, cheapS: CHEAP_S, days: DAYS, gatherS: GATHER, live: LIVE, rows: [], fence: [], onePerDay: [], t1305: null };
console.log(`=== T1332 돌봄 판 — 청크 · 쓰면 저절로 · 초선형 · ${DAYS} 접속일 · 걷기 한 칸 ${STEP_S}초 · 머묾 ${DWELL_S}초 · 싼 쓰기 ${CHEAP_S}초 · 칸마다 모으기 ${GATHER}초 ===`);
for (const K of SIZES) {
  console.log(`\n## 청크 ${K}×${K}칸 (${K * K}칸)`);
  console.log('| 조합 | 흐림 · 풀림 · 기준 청크 | 못 넘는 청크 | ⓑ 30분 · 1시간 · 3시간 칸 | 3시간 : 30분 | ⓑ 돌봄 몫 | ⓒ 속임 30분 · 1시간 · 3시간 | ⓐ 사는 사람 칸 · 돌봄 몫(30분 · 1시간 · 3시간) |');
  console.log('|---|---|---:|---|---:|---|---|---|');
  for (const cb of COMBOS) {
    setCombo(cb, K);
    const g = DAILY.map(([, s]) => runGrow(K, s, false)), c = DAILY.map(([, s]) => runGrow(K, s, true)), l = DAILY.map(([nm, s]) => runLive(K, s, nm));
    DAILY.forEach(([nm], i) => out.rows.push({ K, combo: cb[0], fade: cb[1], free: cb[2], base: cb[3], daily: nm, grow: g[i], cheat: c[i], live: l[i] }));
    const pc = (v) => (v * 100).toFixed(v < 0.01 ? 2 : 1) + '%';
    console.log(`| ${cb[0]} | ${cb[1]} · ${cb[2]} · ${cb[3]} | ${g[0].cap + 1} | ${g.map((r) => r.cells).join(' · ')} | ${(g[2].cells / Math.max(1, g[0].cells)).toFixed(2)}배 | ${g.map((r) => pc(r.careShare)).join(' · ')} | ${c.map((r) => r.cells).join(' · ')} | ${l.map((r) => `${r.cells}칸 ${pc(r.careShare)}${r.lost ? ' 잃음 ' + r.lost : ''}`).join(' · ')} |`);
  }
}
console.log('\n## 견줌');
const fence = DAILY.map(([nm, s]) => Object.assign({ daily: nm }, runFence(s))); out.fence = fence;
console.log(`(가) 울타리만(테두리 칸만 낡음 · 칸마다 손보기 ${DWELL_S}초 · 풀림 7): ${fence.map((r) => `${r.daily} ${r.cells}칸(테두리 ${r.edge})`).join(' · ')} — 3시간 : 30분 ${(fence[2].cells / fence[0].cells).toFixed(1)}배`);
out.onePerDay = SIZES.map((K) => Object.assign({ K }, runOnePerDay(K)));
console.log(`(나) 하루 한 청크만(배수 1 · 풀림 7): 접속 시간 무관 ${out.onePerDay.map((r) => `${r.K}×${r.K} ${r.cells}칸(${r.chunks}청크)`).join(' · ')} — 3시간 : 30분 1.0배`);
try {
  const T = JSON.parse(fs.readFileSync(path.join(ROOT, '계측', 'T1305_돌봄판_g0.json'), 'utf8'));
  const by = {}; for (const r of T.rows) (by[r.combo] = by[r.combo] || []).push(r.cap);
  out.t1305 = by;
  console.log('T1305(칸마다 · 선형 · 계측/T1305_돌봄판_g0.json): ' + Object.entries(by).map(([k, v]) => `${k.split(' ')[0]} ${v.join(' · ')}(${(v[2] / v[0]).toFixed(1)}배)`).join(' / '));
} catch (e) { console.log('T1305 견줌 파일 없음'); }
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
