#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T724 계측기 · 제품 무변 · 판정 0)
// === scripts/t724-poll.js — 채굴 행위 층 곁 탐침: 떠 있는 존의 `/perf` 를 1분마다 읽어 `econTick.probe.t724` 를 적는다 ===
//   T686 자(`t686-spike.js run`)와 **같이** 띄운다 — 자는 틱을 재고, 이것은 광부 몸(타수 · 깎은 덩이 · 캔 kg · 곳간 든 때 · 해 질 녘 손)을 잰다.
//   세계에 0(읽기만 · `/perf` 는 안 문 GET).
// 쓰는 법: node scripts/t724-poll.js <out.jsonl> [--port 4111] [--secret t686] [--every 60] [--for <분>]
'use strict';
const fs = require('fs');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = process.argv[2];
if (!OUT) { console.error('쓰는 법: node scripts/t724-poll.js <out.jsonl> [--port 4111] [--secret t686] [--every 60] [--for <분>]'); process.exit(2); }
const PORT = +arg('--port', 4111), SECRET = arg('--secret', 't686'), EVERY = +arg('--every', 60) * 1000, FOR = +arg('--for', 70) * 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const t0 = Date.now();
  let up = false;
  while (Date.now() - t0 < FOR) {
    let p = null;
    try { const r = await fetch(`http://localhost:${PORT}/perf`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); p = await r.json(); } catch (e) { p = null; }
    if (p) {
      up = true;
      const e = p.econTick || {};
      fs.appendFileSync(OUT, JSON.stringify({ at: Date.now(), wall: +((Date.now() - t0) / 60000).toFixed(2), day: e.last ? e.last.day : null, t724: (e.probe && e.probe.t724) || null }) + '\n');
    } else if (up) break;   // 존이 내려갔다 — 끝
    await sleep(EVERY);
  }
})();
