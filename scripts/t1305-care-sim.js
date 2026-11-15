#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1305 판 · 세계 안 만짐 · 판정 0 — 속도 값은 재민이 고른다)
// === scripts/t1305-care-sim.js — 사유지 돌봄의 실질 상한: "늘리기 = 풀리기" 가 되는 넓이 ===========================
//
// ★무엇: 몸 봇 하나가 접속한 날마다 정해진 시간(30분 · 1시간 · 3시간)만 움직인다 — 풀리기 직전 칸부터 손보고(걸어서 그 칸 또는 맞닿은 칸까지 ·
//   `CARE_MS` 동안 서 있기), 남는 시간에 땅 가장자리에 새 칸을 붙인다(변 맞댐 · 집에서 가까운 칸부터 — 둥근 땅). 날이 갈수록 손볼 칸이 늘어
//   새로 붙일 시간이 0 이 되는 넓이가 그 사람의 실질 상한이다.
// ★사본 0: 낡음 · 단계 · 손보기는 `server/deeds.js` 정본 함수(`rewear` · `stageOf` · `careDone`)를 그대로 부른다. 걷는 속도(`MOVE_SPEED`) ·
//   칸 크기(`BUILDING_SIZE`)는 `server/zone.js` 소스에서 읽는다. 속도 값 셋(흐림 · 풀림 날 · 손보는 초)은 아래 조합 표(제안 — 재민이 고른다).
// ★가정(새 수 아님 · 판의 조건): 재료(나무 3 · 돌 2)는 손에 있다(`--gather <초>` 로 칸마다 모으는 시간을 더할 수 있다 — 상한은 안 바뀌고
//   닿는 날만 늦어진다) · 접속은 날마다 · 집 = 땅 한가운데(날마다 거기서 시작) · 손보기는 풀리기 하루 전 칸만(가장 아끼는 차례).
//
//   node scripts/t1305-care-sim.js [--days 240] [--gather 0] [--json <파일>]
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

const COMBOS = [   // [이름, 흐림 날, 풀림 날, 손보는 초] — 제안 셋(가운데 = deeds.js 기본)
  ['A 빠름', 2, 3, 30],
  ['B 가운데(기본)', 3, 7, 20],
  ['C 느림', 7, 14, 10],
];
const DAILY = [['30분', 30 * 60], ['1시간', 3600], ['3시간', 3 * 3600]];

const K = (x, y) => x + ',' + y;
function run(combo, daily) {
  const [, fade, free, careS] = combo;
  Object.assign(Deeds.CFG, { FADE_D: fade, FREE_D: free, CARE_MS: careS * 1000 });
  const cells = new Map();   // 키 → 칸 { x, y, careN, careW }
  const front = new Map();   // 가장자리 후보(키 → [x, y]) — 붙일 때 · 풀릴 때 고친다(낡은 줄은 고를 때 거른다)
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const touch = (x, y) => N4.some(([dx, dy]) => cells.has(K(x + dx, y + dy)));
  let n = 0, released = 0, claimed = 0, reach = null;
  const hist = [];
  const dist = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);
  for (let d = 1; d <= DAYS; d++) {
    n++;   // 접속한 날
    // 하루 머리 — 낡음 다시 재기 · 풀림(정본 `rewear` · `stageOf`)
    let fadeN = 0;
    for (const [k, c] of cells) { const r = Deeds.rewear(c, n); if (r.stage === 'free') { cells.delete(k); released++; front.set(k, [c.x, c.y]); } else if (r.stage === 'fade') fadeN++; }
    let t = daily, px = 0, py = 0;
    // ⓐ 손보기 — 내일이면 풀릴 칸(w = 풀림 − 1)부터 · 가까운 차례(맞닿은 칸에서도 손본다)
    const due = [...cells.values()].filter((c) => (n - c.careN) >= free - 1);
    while (due.length && t > 0) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < due.length; i++) { const q = dist(px, py, due[i].x, due[i].y); if (q < bd) { bd = q; bi = i; } }
      const c = due[bi], walk = Math.max(0, bd - 1) * STEP_S, need = walk + careS;
      if (need > t) break;
      t -= need;
      if (bd > 1) { px = c.x; py = c.y; }   // 맞닿은 칸에 섰다 — 자리는 그 칸으로 친다(한 칸 차 · 다음 걸음 셈이 많아야 한 칸 길어진다 = 상한을 낮게 잡는 쪽)
      Deeds.careDone(c, n);
      due.splice(bi, 1);
    }
    // ⓑ 넓히기 — 남는 시간에 가장자리 칸(변 맞댐 · 집에서 가까운 칸 먼저)
    let grew = 0;
    for (;;) {
      let best = null, bh = Infinity;
      if (!cells.size) best = { x: 0, y: 0 };
      else {
        for (const [fk, [x, y]] of front) {
          if (cells.has(fk) || !touch(x, y)) { front.delete(fk); continue; }
          const h = dist(0, 0, x, y) * 1000 + dist(px, py, x, y); if (h < bh) { bh = h; best = { x, y }; }
        }
        if (!best) break;
      }
      const walk = dist(px, py, best.x, best.y) * STEP_S, need = walk + GATHER;
      if (need > t) break;
      t -= need; px = best.x; py = best.y;
      const c = { x: best.x, y: best.y, careN: null, careW: null }; Deeds.careDone(c, n);
      cells.set(K(c.x, c.y), c); claimed++; grew++;
      front.delete(K(c.x, c.y)); for (const [dx, dy] of N4) { const q = K(c.x + dx, c.y + dy); if (!cells.has(q)) front.set(q, [c.x + dx, c.y + dy]); }
    }
    hist.push({ d, n: cells.size, grew, fade: fadeN, left: Math.round(t) });
    if (reach == null && d > free * 2 && hist.slice(-free).every((h) => h.grew === 0)) reach = d - free + 1;
  }
  const tail = hist.slice(-Math.max(free * 2, 20));
  const avg = Math.round(tail.reduce((a, h) => a + h.n, 0) / tail.length);
  const theory = Math.floor(daily * (free - 1) / careS);   // 걷기 0 일 때의 위 한계(점검용) — 풀리기 하루 전에 손봐야 하므로 손보는 간격 = 풀림 − 1 날
  return { cap: avg, max: Math.max(...hist.map((h) => h.n)), reach, released, claimed, theory };
}

const out = { moveSpeed: MOVE_SPEED, cellPx: SZ, stepS: STEP_S, days: DAYS, gatherS: GATHER, rows: [] };
console.log(`=== T1305 돌봄 판 — 몸 봇 · ${DAYS} 접속일 · 걷기 한 칸 ${STEP_S}초(MOVE_SPEED ${MOVE_SPEED}px/s · 칸 ${SZ}px) · 칸마다 모으기 ${GATHER}초 ===`);
console.log('| 조합 | 흐림 · 풀림(접속한 날) | 손보기 | ' + DAILY.map(([k]) => `하루 ${k}`).join(' | ') + ' | 안전판(24h) |');
console.log('|---|---|---|' + DAILY.map(() => '---:').join('|') + '|---:|');
for (const cb of COMBOS) {
  const cols = [];
  for (const [k, sec] of DAILY) { const r = run(cb, sec); cols.push(r); out.rows.push(Object.assign({ combo: cb[0], fade: cb[1], free: cb[2], careS: cb[3], daily: k }, r)); }
  const safety = Math.ceil(24 * 3600 * cb[2] / cb[3]);
  console.log(`| ${cb[0]} | ${cb[1]} · ${cb[2]} | ${cb[3]}초 | ` + cols.map((r) => `**${r.cap}**칸 (닿는 날 ${r.reach ?? '—'})`).join(' | ') + ` | ${safety} |`);
}
console.log('\n점검(걷기 0 위 한계 = 하루 초 × (풀림 날 − 1) ÷ 손보는 초): ' + out.rows.map((r) => `${r.combo.split(' ')[0]}·${r.daily} ${r.theory}`).join(' · '));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
