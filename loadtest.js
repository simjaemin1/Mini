// === 부하 테스트 =============================================================
// 사용법:
//   HOST=localhost PORT=3020 CLIENTS=50 DURATION=60 SCENARIO=A node loadtest.js
//
// 각 클라이언트는 게스트로 접속해 INPUT_HZ 로 입력을 보내고, 서버 tick 수신 간격을 잰다.
// 이상적 간격 = 1000/TICK_HZ = 33.3ms (server/zone.js:471 TICK_HZ=30 · :8079 TICK_MS).
//
// ★★[2026-09-01 재민 지시 · 부하 실측] 이 판에서 고친 것과 그 이유
//   ⓐ **백분위수를 히스토그램으로 낸다.** 종전엔 모든 간격을 배열에 쌓고 5만 개를 넘으면
//      `splice(0, 10000)` 로 앞을 잘랐다. 그런데 클라 400 × 30Hz × 60초 = **72만 샘플**이라
//      배열이 계속 잘려 나가, p95 가 "전 구간"이 아니라 **최근 구간**의 값이 된다 —
//      그것도 몇 명이냐에 따라 잘리는 정도가 달라져 **단계끼리 비교가 안 된다.**
//      ⇒ 1ms 폭 고정 빈 히스토그램(0~2000ms + 넘침). 메모리 O(1), 전 구간 정확.
//   ⓑ **워밍업 구간을 버린다**(WARMUP_S, 기본 10초). 접속 램프·GC 예열이 p99 를 오염시킨다.
//   ⓒ **초과 비율**을 낸다(OVER_MS, 기본 60ms). 평균은 끊김을 못 잡는다 — 종전 판정이
//      `avg < 50` 이었는데, 평균 40ms 이면서 5%가 200ms 인 서버는 **끊긴 서버**다.
//   ⓓ ★**부하생성기 자기 비용을 같이 잰다**(`process.cpuUsage`). 생성기가 서버와 같은 머신에
//      살면, 어느 지점부터는 서버가 아니라 **생성기**를 재게 된다. 그 선을 숫자로 긋지 않으면
//      "존당 수용 인원"이 거짓말이 된다. gen_cpu_pct 가 코어 1개(100%)에 붙으면 그 단계부터
//      의심해야 한다 — 이 파일은 그 판단 근거만 남기고, 판단은 사람이 한다.
//   ⓔ 결과를 **JSON 으로도** 남긴다(bench/결과_<시나리오>_<타임스탬프>.json).
//
// 환경변수: HOST PORT CLIENTS DURATION WARMUP_S RAMP_MS INPUT_HZ OVER_MS TICK_HZ
//           SCENARIO(파일 이름·기록용) NOTE(자유 기록) OUT_DIR METRICS_URL
'use strict';
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const HOST = process.env.HOST || 'localhost';
const PORT = parseInt(process.env.PORT || '3020', 10);
const CLIENTS = parseInt(process.env.CLIENTS || '50', 10);
const DURATION_S = parseInt(process.env.DURATION || '60', 10);
const WARMUP_S = parseInt(process.env.WARMUP_S || '10', 10);
const RAMP_MS = parseInt(process.env.RAMP_MS || '20', 10);
const INPUT_HZ = parseInt(process.env.INPUT_HZ || '30', 10);
const TICK_HZ = parseInt(process.env.TICK_HZ || '30', 10);
const IDEAL_MS = 1000 / TICK_HZ;
const OVER_MS = parseInt(process.env.OVER_MS || '60', 10);
const SCENARIO = process.env.SCENARIO || 'adhoc';
const NOTE = process.env.NOTE || '';
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, 'bench');
const METRICS_URL = process.env.METRICS_URL || `http://${HOST}:${PORT}/metrics`;

// ── 히스토그램 — bench/hist.js 가 정본(하네스가 그 파일을 직접 시험한다) ──────
const { newHist, hAdd, hPct, hOverRatio } = require('./bench/hist.js');

const stats = {
  connected: 0, failed: 0, closed: 0, everConnected: 0,
  ticksReceived: 0, welcomesReceived: 0, inputsSent: 0,
  hist: newHist(),          // 워밍업 이후만
  histWarm: newHist(),      // 워밍업 구간(참고용 — 버렸다는 걸 보이기 위해 센다)
};
let measureFrom = 0;        // 이 시각 이후의 간격만 센다
const clients = [];

function connectClient(id) {
  const url = `ws://${HOST}:${PORT}/?username=&name=bot${id}&color=%23a0a0a0`;
  const ws = new WebSocket(url);
  const cli = { id, ws, lastTickAt: 0, ticks: 0, alive: true, opened: false };
  clients.push(cli);

  ws.on('open', () => {
    stats.connected++; stats.everConnected++; cli.opened = true;
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
    let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'welcome') { stats.welcomesReceived++; return; }
    if (msg.type !== 'tick') return;
    stats.ticksReceived++; cli.ticks++;
    const now = Date.now();
    if (cli.lastTickAt) {
      const d = now - cli.lastTickAt;
      if (now >= measureFrom) hAdd(stats.hist, d); else hAdd(stats.histWarm, d);
    }
    cli.lastTickAt = now;
  });

  ws.on('error', () => { stats.failed++; });
  ws.on('close', () => {
    stats.closed++; cli.alive = false;
    if (cli.inputTimer) clearInterval(cli.inputTimer);
  });
}

function scrape(url) {                       // /metrics 한 번 긁기(실패해도 진행)
  return new Promise((res) => {
    const r = http.get(url, { timeout: 3000 }, (m) => {
      let b = ''; m.on('data', (c) => b += c);
      m.on('end', () => {
        const o = {};
        for (const ln of b.split('\n')) { const mm = ln.match(/^(durango_\S+)\s+(\S+)$/); if (mm) o[mm[1]] = Number(mm[2]); }
        res(o);
      });
    });
    r.on('error', () => res(null)); r.on('timeout', () => { r.destroy(); res(null); });
  });
}

(async () => {
  const rampS = CLIENTS * RAMP_MS / 1000;
  const startedAt = new Date();
  console.log('=== 부하 테스트 ===');
  console.log(`시나리오 ${SCENARIO}${NOTE ? ' · ' + NOTE : ''}`);
  console.log(`서버 ws://${HOST}:${PORT} · 클라 ${CLIENTS} (ramp ${RAMP_MS}ms/개 = ${rampS.toFixed(1)}초)`);
  console.log(`측정 ${DURATION_S}초 (앞 ${WARMUP_S}초 워밍업 버림) · input ${INPUT_HZ}Hz · 이상 tick ${IDEAL_MS.toFixed(1)}ms`);
  console.log(`시작 ${startedAt.toISOString()}`);
  console.log('');

  const metricsBefore = await scrape(METRICS_URL);
  const cpu0 = process.cpuUsage(); const t0 = Date.now();

  for (let i = 0; i < CLIENTS; i++) setTimeout(() => connectClient(i), i * RAMP_MS);
  measureFrom = Date.now() + rampS * 1000 + WARMUP_S * 1000;

  const reportTimer = setInterval(() => {
    const h = Date.now() >= measureFrom ? stats.hist : stats.histWarm;
    const phase = Date.now() >= measureFrom ? '측정' : '워밍업';
    console.log(`[${phase} t=${Math.floor(process.uptime())}s] 접속 ${stats.connected}/${CLIENTS}(실패 ${stats.failed} 종료 ${stats.closed}) · tick ${stats.ticksReceived} · p95 ${hPct(h, 0.95)}ms max ${h.max}ms`);
  }, 5000);

  await new Promise((r) => setTimeout(r, (rampS + WARMUP_S + DURATION_S) * 1000));
  clearInterval(reportTimer);

  const cpu = process.cpuUsage(cpu0); const wallMs = Date.now() - t0;
  const genCpuPct = 100 * (cpu.user + cpu.system) / 1000 / wallMs;
  const metricsAfter = await scrape(METRICS_URL);
  const endedAt = new Date();
  const h = stats.hist;
  const R = {
    scenario: SCENARIO, note: NOTE,
    startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
    config: { host: HOST, port: PORT, clients: CLIENTS, durationS: DURATION_S, warmupS: WARMUP_S,
              rampMs: RAMP_MS, inputHz: INPUT_HZ, tickHz: TICK_HZ, idealMs: IDEAL_MS, overMs: OVER_MS },
    env: { node: process.version, platform: `${os.type()} ${os.release()}`, cpus: os.cpus().length,
           totalMemGB: +(os.totalmem() / 1073741824).toFixed(1), loadavg: os.loadavg() },
    connections: { requested: CLIENTS, everConnected: stats.everConnected, connectedAtEnd: stats.connected - stats.closed,
                   failed: stats.failed, closedMidRun: stats.closed, welcomes: stats.welcomesReceived },
    traffic: { ticksReceived: stats.ticksReceived, inputsSent: stats.inputsSent },
    tickInterval: { samples: h.n, mean: h.n ? +(h.sum / h.n).toFixed(2) : null,
                    p50: hPct(h, 0.5), p95: hPct(h, 0.95), p99: hPct(h, 0.99), max: h.max,
                    overMs: OVER_MS, overRatioPct: h.n ? +(100 * hOverRatio(h, OVER_MS)).toFixed(2) : null,
                    warmupDiscardedSamples: stats.histWarm.n },
    generator: { cpuPctOfOneCore: +genCpuPct.toFixed(1),
                 caution: '이 값이 100 에 가까우면 부하생성기가 코어 1개를 다 쓴 것이다 — 그 단계의 tick 지표는 서버 한계가 아니라 생성기 한계일 수 있다.' },
    zoneMetrics: { before: metricsBefore, after: metricsAfter },
  };

  console.log('\n=== 결과 ===');
  console.log(`구간            ${R.startedAt}  →  ${R.endedAt}`);
  console.log(`접속            요청 ${CLIENTS} · 성공 ${R.connections.everConnected} · 실패 ${R.connections.failed} · 중도이탈 ${R.connections.closedMidRun} · 끝까지 ${R.connections.connectedAtEnd}`);
  console.log(`tick 간격       표본 ${h.n.toLocaleString()} (워밍업 ${stats.histWarm.n.toLocaleString()} 버림)`);
  console.log(`  이상 ${IDEAL_MS.toFixed(1)}ms   평균 ${R.tickInterval.mean}ms · p50 ${R.tickInterval.p50}ms · p95 ${R.tickInterval.p95}ms · p99 ${R.tickInterval.p99}ms · max ${h.max}ms`);
  console.log(`  ${OVER_MS}ms 초과      ${R.tickInterval.overRatioPct}%`);
  console.log(`부하생성기 CPU  코어 1개 대비 ${R.generator.cpuPctOfOneCore}%  ${genCpuPct > 80 ? '⚠ 생성기가 병목일 수 있다' : ''}`);
  console.log(`load average    ${R.env.loadavg.map((v) => v.toFixed(2)).join(' · ')}  (코어 ${R.env.cpus})`);

  try {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ts = startedAt.toISOString().replace(/[:.]/g, '-');
    const f = path.join(OUT_DIR, `결과_${SCENARIO}_${CLIENTS}명_${ts}.json`);
    fs.writeFileSync(f, JSON.stringify(R, null, 2));
    console.log(`\nJSON 저장: ${f}`);
  } catch (e) { console.log('JSON 저장 실패: ' + e.message); }

  for (const c of clients) { try { c.ws.close(); } catch (e) {} }
  setTimeout(() => process.exit(0), 500);
})();
