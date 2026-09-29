#!/usr/bin/env node
// === scripts/t498-delay-proxy.js — TCP 지연 중계(존 → central 한 다리만 · T498 ③ · 러너 밖) ===================
//   node scripts/t498-delay-proxy.js <듣는 [호스트:]포트> <보낼 [호스트:]포트> <한 방향 ms>   (호스트 생략 = 127.0.0.1 · ★T512 가 호스트를 붙여 존↔존 다리에도 쓴다)
//   존에 `CENTRAL_PORT=<듣는 포트>` 를 주면 존 → central 요청만 이 다리를 지난다(브라우저 → central 은 제 포트 그대로).
//   조각마다 도착 시각 + ms 에 내보낸다(순서 보존 · 한 방향 지연 = 왕복 2배). 이 상자엔 netem 이 없다(`tc` 커널 모듈 0).
'use strict';
const net = require('net');
const hp = (a) => { const i = String(a).lastIndexOf(':'); return i < 0 ? ['127.0.0.1', +a] : [a.slice(0, i), +a.slice(i + 1)]; };
const [[LH, LP], [TH, TP]] = process.argv.slice(2, 4).map(hp); const MS = +process.argv[4];
function pipe(a, b) {
  const q = []; let t = null;
  const pump = () => { t = null; const now = Date.now(); while (q.length && q[0][0] <= now) b.write(q.shift()[1]); if (q.length) t = setTimeout(pump, q[0][0] - now); };
  a.on('data', (d) => { q.push([Date.now() + MS, d]); if (!t) t = setTimeout(pump, MS); });
  a.on('end', () => setTimeout(() => b.end(), MS + 5));
  a.on('error', () => b.destroy());
}
net.createServer((c) => { const s = net.connect(TP, TH); pipe(c, s); pipe(s, c); s.on('error', () => c.destroy()); }).listen(LP, LH, () => console.log(`delay-proxy ${LH}:${LP} → ${TH}:${TP} · 한 방향 ${MS}ms`));
