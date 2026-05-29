// === 부하 테스트 ===
// 사용법:
//   HOST=localhost PORT=3002 CLIENTS=50 DURATION=30 node loadtest.js
//
// 각 클라이언트는 게스트로 접속해 30Hz로 랜덤 워크 input 송신.
// 서버에서 받는 tick 간격을 측정해 서버 처리 한계 추정.
// 이상적 tick interval = 1000/30 = 33ms.
// 60ms 넘게 늘어지면 서버 과부하.

const WebSocket = require('ws');

const HOST = process.env.HOST || 'localhost';
const PORT = parseInt(process.env.PORT || '3002', 10);
const CLIENTS = parseInt(process.env.CLIENTS || '50', 10);
const DURATION_S = parseInt(process.env.DURATION || '30', 10);
const RAMP_MS = parseInt(process.env.RAMP_MS || '20', 10); // 클라당 접속 간격
const INPUT_HZ = parseInt(process.env.INPUT_HZ || '30', 10);

console.log(`=== 부하 테스트 시작 ===`);
console.log(`서버: ws://${HOST}:${PORT}`);
console.log(`클라이언트: ${CLIENTS} (ramp ${RAMP_MS}ms/client)`);
console.log(`지속 시간: ${DURATION_S}초, input rate: ${INPUT_HZ}Hz`);
console.log('');

const clients = [];
const stats = {
  connected: 0, failed: 0, closed: 0,
  ticksReceived: 0, welcomesReceived: 0, inputsSent: 0,
  tickIntervals: [], // ms
};

function connectClient(id) {
  const url = `ws://${HOST}:${PORT}/?username=&name=bot${id}&color=%23a0a0a0`;
  const ws = new WebSocket(url);
  const cli = { id, ws, lastTickAt: 0, ticks: 0, alive: true };
  clients.push(cli);

  ws.on('open', () => {
    stats.connected++;
    cli.inputTimer = setInterval(() => {
      if (!cli.alive) return;
      const ang = Math.random() * Math.PI * 2;
      try {
        ws.send(JSON.stringify({ type: 'input', vx: Math.cos(ang), vy: Math.sin(ang) }));
        stats.inputsSent++;
      } catch (e) {}
    }, 1000 / INPUT_HZ);
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'welcome') {
      stats.welcomesReceived++;
    } else if (msg.type === 'tick') {
      stats.ticksReceived++;
      cli.ticks++;
      const now = Date.now();
      if (cli.lastTickAt) {
        stats.tickIntervals.push(now - cli.lastTickAt);
        // 메모리 보호 — 최근 5만 샘플만
        if (stats.tickIntervals.length > 50000) stats.tickIntervals.splice(0, 10000);
      }
      cli.lastTickAt = now;
    }
  });

  ws.on('error', (e) => { stats.failed++; });
  ws.on('close', () => {
    stats.closed++;
    cli.alive = false;
    if (cli.inputTimer) clearInterval(cli.inputTimer);
  });
}

// 점진적 접속
for (let i = 0; i < CLIENTS; i++) {
  setTimeout(() => connectClient(i), i * RAMP_MS);
}

// 주기 진행 리포트
const reportTimer = setInterval(() => {
  const recent = stats.tickIntervals.slice(-500);
  const avg = recent.length ? (recent.reduce((a,b) => a+b, 0) / recent.length) : 0;
  const max = recent.length ? Math.max(...recent) : 0;
  console.log(`[t=${Math.floor(process.uptime())}s] 접속 ${stats.connected}/${CLIENTS} (실패 ${stats.failed}, 종료 ${stats.closed}) | tick ${stats.ticksReceived} (welcome ${stats.welcomesReceived}) | 최근 tick interval avg=${avg.toFixed(1)}ms max=${max}ms`);
}, 2000);

// 종료 + 요약
setTimeout(() => {
  clearInterval(reportTimer);
  console.log('\n=== 최종 요약 ===');
  console.log(`접속 성공: ${stats.connected}/${CLIENTS}, 실패: ${stats.failed}, 종료: ${stats.closed}`);
  console.log(`welcome 수신: ${stats.welcomesReceived}`);
  console.log(`tick 총 수신: ${stats.ticksReceived}`);
  console.log(`input 총 송신: ${stats.inputsSent}`);
  if (stats.tickIntervals.length) {
    const sorted = [...stats.tickIntervals].sort((a,b) => a-b);
    const n = sorted.length;
    const median = sorted[Math.floor(n*0.5)];
    const p90 = sorted[Math.floor(n*0.9)];
    const p95 = sorted[Math.floor(n*0.95)];
    const p99 = sorted[Math.floor(n*0.99)];
    const avg = sorted.reduce((a,b) => a+b, 0) / n;
    console.log('\ntick interval (이상적 33ms — 서버 broadcast 간격):');
    console.log(`  평균 ${avg.toFixed(1)}ms | 중앙값 ${median}ms | p90 ${p90}ms | p95 ${p95}ms | p99 ${p99}ms`);
    console.log(`  최소 ${sorted[0]}ms | 최대 ${sorted[n-1]}ms`);
    if (avg < 50) console.log('✅ 서버 여유 — 더 많은 클라 가능');
    else if (avg < 80) console.log('⚠️  서버 부하 시작 — 한계 근처');
    else console.log('❌ 서버 과부하 — 한계 초과');
  }
  // 모든 연결 닫기
  for (const cli of clients) {
    try { cli.ws.close(); } catch (e) {}
  }
  setTimeout(() => process.exit(0), 500);
}, (DURATION_S + CLIENTS * RAMP_MS / 1000 + 5) * 1000);
