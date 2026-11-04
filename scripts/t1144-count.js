#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1144 헛물음 셈 곁 자 · 제품 무변)
// === scripts/t1144-count.js — 돌고 있는 존(`T1144_LIFE_EVENT=1 T1144_COUNT=1`)의 헛물음 셈을 창마다 떠 둔다 ==========================
//   존의 `/lifedbg` 가 셈 갈래일 때만 내는 `totals.t1144`(밭 칸 · 던짐 종 · 낱값 누계)를 `--every` 초마다 phase 와 함께 적는다.
//   t646 판(`run inf <tag> --seg` · 존 4011 · 비밀 t646)과 같이 띄우면 그 판의 낮 · 밤 창(phase 0.10 ~ 0.23 · 0.72 ~ 0.85)의 셈을 phase 로 가른다(+ 낮 전체 0 ~ 0.70).
//   표: 창마다 누계 차 — 밭 칸: 물음 · 칸 물음 · 지난 답 그대로(사건 없음) · 다시 잰 칸(그중 같은 답) / 던짐: 던짐 · 지난 종 / 낱값: 부름 · 지난 값.
//   헛물음 몫(끔 = 종전) = (지난 답 그대로 + 다시 잰 칸 중 같은 답) ÷ 칸 물음 · 켬 뒤 남은 헛물음 = 다시 잰 칸 중 같은 답 ÷ 칸 물음.
// 실행: node scripts/t1144-count.js <out.jsonl> [--port 4011] [--secret t646] [--every 15] [--until-s 1500]
//       node scripts/t1144-count.js --table <out.jsonl>
'use strict';
const fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (process.argv[2] === '--table') {
  const L0 = fs.readFileSync(process.argv[3], 'utf8').split('\n').filter(Boolean).map((x) => JSON.parse(x)).filter((x) => x.t1144);
  const i0 = L0.findIndex((x) => x.phase < 0.5), L = i0 < 0 ? [] : L0.slice(i0);   // 첫 새벽 뒤만(t646 판은 하루 경계 150 초 앞에서 뜬다 — 그 앞 밤 꼬리는 뺀다)
  const W = [['day', 0.10, 0.23], ['night', 0.72, 0.85], ['dayAll', 0.0, 0.70]];   // t646 낮 · 밤 창(조각 6 × 30 초 ≈ phase 0.125) · 낮 전체(곁 셈)
  const out = {};
  for (const [w, lo, hi] of W) {
    const xs = L.filter((x) => x.phase >= lo && x.phase <= hi); if (xs.length < 2) { out[w] = null; continue; }
    const a = xs[0].t1144, b = xs[xs.length - 1].t1144, d = (g, k) => (b[g][k] || 0) - (a[g][k] || 0);
    const f = { calls: d('farm', 'calls'), cells: d('farm', 'cells'), reuse: d('farm', 'reuse'), re: d('farm', 're'), reSame: d('farm', 'reSame') };
    const g = { casts: d('fish', 'casts'), reuse: d('fish', 'reuse') }, u = { calls: d('unit', 'calls'), reuse: d('unit', 'reuse') };
    out[w] = { phase: [xs[0].phase, xs[xs.length - 1].phase], secs: Math.round((xs[xs.length - 1].t - xs[0].t) / 1000), farm: f, fish: g, unit: u,
      farmWasteOff: f.cells ? +((f.reuse + f.reSame) / f.cells).toFixed(4) : null, farmWasteOn: f.cells ? +(f.reSame / f.cells).toFixed(4) : null,
      fishWasteOff: g.casts ? +(g.reuse / g.casts).toFixed(4) : null, unitWasteOff: u.calls ? +(u.reuse / u.calls).toFixed(4) : null };
  }
  console.log(JSON.stringify(out, null, 1));
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
  process.exit(0);
}
const OUT = process.argv[2], PORT = +arg('--port', 4011), SECRET = arg('--secret', 't646'), EVERY = +arg('--every', 15), UNTIL = +arg('--until-s', 1500);
(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < UNTIL * 1000) {
    try {
      const r = await fetch(`http://localhost:${PORT}/lifedbg`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) });
      const L = await r.json();
      fs.appendFileSync(OUT, JSON.stringify({ t: Date.now(), phase: L.phase, t1144: (L.totals && L.totals.t1144) || null }) + '\n');
    } catch (e) {}
    await sleep(EVERY * 1000);
  }
})();
