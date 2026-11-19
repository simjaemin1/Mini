'use strict';
// (@regress 없음 — 러너 밖 · T1346 ④ 기어감 CPU 프로파일 읽기 · 세계 0)
// === 계측/T1346_2026-11-17/t1346_prof.js — `.cpuprofile`(node --cpu-prof) 하나를 함수별 자기 시간 · 포함 시간으로 줄인다 ===
//   node t1346_prof.js <프로파일.cpuprofile> [--from <ms>] [--top 30]
//     --from = 프로파일 시작부터 그 ms 뒤 표본만(기어간 끝물만 보려면 — 판 로그의 날 줄 시각에서 고른다)
//   자기 시간 = 그 함수가 스택 맨 위였던 표본 · 포함 시간 = 그 함수가 스택 어디에든 있던 표본(되부름은 한 번만)
const fs = require('fs');
const A = process.argv.slice(2), f = A[0];
const from = A.includes('--from') ? +A[A.indexOf('--from') + 1] : 0;
const top = A.includes('--top') ? +A[A.indexOf('--top') + 1] : 30;
const P = JSON.parse(fs.readFileSync(f, 'utf8'));
const byId = new Map(); for (const n of P.nodes) byId.set(n.id, n);
const parent = new Map(); for (const n of P.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url || '').split('/').slice(-2).join('/')}:${n.callFrame.lineNumber + 1}`;
const self = new Map(), incl = new Map(); let t = P.startTime, tot = 0;
for (let i = 0; i < P.samples.length; i++) {
  t += (P.timeDeltas[i] || 0);
  if ((t - P.startTime) / 1000 < from) continue;
  const id = P.samples[i]; let n = byId.get(id); if (!n) continue;
  const dt = (P.timeDeltas[i + 1] || P.timeDeltas[i] || 0) / 1000; tot += dt;
  self.set(key(n), (self.get(key(n)) || 0) + dt);
  const seen = new Set(); let cur = id;
  while (cur != null) { const m = byId.get(cur); const k = key(m); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } cur = parent.get(cur); }
}
const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top).map(([k, v]) => `${(100 * v / tot).toFixed(1).padStart(5)}%  ${(v / 1000).toFixed(1).padStart(8)}s  ${k}`).join('\n');
console.log(`# ${f} · 표본 시간 ${(tot / 1000).toFixed(1)}s(시작 ${from}ms 뒤)`);
console.log('## 자기 시간'); console.log(fmt(self));
console.log('## 포함 시간'); console.log(fmt(incl));
