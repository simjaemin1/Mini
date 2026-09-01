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
// ★[시나리오 C 2026-09-01] 핸드오프 모드 — 봇이 존 경계를 직선 왕복한다.
//   MODE=walk    (기본) 랜덤워크. 종전 동작 그대로.
//   MODE=handoff 경계를 동↔서로 넘나든다. `handoff` 메시지를 받으면 토큰으로 대상 존에 재접속한다.
//   MODE=jitter  경계에 걸친 채 좌우로 미세하게만 움직인다 — HANDOFF_COMMIT 히스테리시스가
//                핑퐁을 막는지 보는 대조군(핸드오프가 **일어나지 않아야** 통과다).
const MODE = process.env.MODE || 'walk';
const CENTRAL_URL = process.env.CENTRAL_URL || `http://${HOST}:3010`;
const START_ZONE = process.env.START_ZONE || 'hanbando';
const EDGE_PAD = parseInt(process.env.EDGE_PAD || '400', 10);   // 경계에서 이만큼 안쪽에 선다
// ★출발 방향을 고정한다. 로컬 2존(hanbando↔nippon)만 띄운 상태에서 서쪽으로 나가면
//   **안 띄운 이웃 존**으로 handoff_prepare 가 날아가 실패로 집계된다 — 측정이 오염된다.
//   그래서 기본은 east 고정. 넘어간 뒤에는 자동으로 반대 방향이 되어 둘 사이만 왕복한다.
const DIR_EAST = (process.env.DIR || 'east') === 'east';
// 핸드오프는 존이 둘이라 /metrics 도 둘을 긁어야 한다(합이 아니라 **존별로** 봐야 손실이 보인다).
const METRICS_URLS = (process.env.METRICS_URLS || METRICS_URL)
  .split(',').map((s) => s.trim()).filter(Boolean);

// ── 히스토그램 — bench/hist.js 가 정본(하네스가 그 파일을 직접 시험한다) ──────
const { newHist, hAdd, hPct, hOverRatio } = require('./bench/hist.js');

let ZONES = null;                 // central /zones 응답(핸드오프 대상 wsUrl·경계 좌표)
const stats = {
  connected: 0, failed: 0, closed: 0, everConnected: 0,
  handoffsSeen: 0, handoffReconnects: 0, handoffFailed: 0,   // MODE=handoff 계수
  tpSent: 0, tpOk: 0, tpBlocked: 0,                          // teleport_debug 요청·성공·거절(강/바다)
  invSamples: 0, invMismatch: 0,                             // 몸 상태 보존 — 표본 수 / 어긋난 수
  givesSent: 0,                                              // __e2e_give 발송(출발 존에서만)
  bandMax: -Infinity,                                        // 관측된 최대 경계 초과량(px)
  stuckRetries: 0,                                           // 막힌 위도라 다시 세운 횟수
  lineCrossings: 0,                                          // 경계선(x=zoneWidth) 통과 횟수 — jitter 시험 강도
  ticksReceived: 0, welcomesReceived: 0, inputsSent: 0,
  hist: newHist(),          // 워밍업 이후만
  histWarm: newHist(),      // 워밍업 구간(참고용 — 버렸다는 걸 보이기 위해 센다)
};
let measureFrom = 0;        // 이 시각 이후의 간격만 센다
const clients = [];

// ── 핸드오프 봇의 진행 방향·자리 잡기 ────────────────────────────────────────
//   존은 넓다(한반도 70,016px). 속도 64px/s 로는 중앙에서 경계까지 9분이 걸린다.
//   ⇒ `teleport_debug` 로 경계 **바로 안쪽**에 세운 뒤 걸어서 넘게 한다(서버가 이미 가진 디버그 경로).
// ── 인벤토리 보존 원장 ───────────────────────────────────────────────────────
//   출발 존(hanbando)만 ZONE_TEST_INV 로 시작 인벤을 얹는다. 도착 존(nippon)은 안 얹는다.
//   ⇒ 도착 존 welcome 의 인벤이 출발 때와 **같으면** 핸드오프가 옮긴 것이고,
//     비면 손실, 늘면 중복이다. 봇은 아무것도 줍거나 쓰지 않으므로 변할 이유가 없다.
//   ⚠ZONE_TEST_INV 로는 안 된다 — central 이 살아 있으면 게스트도 계정 복원 경로를 타서
//     시작 인벤이 계정 값(빈 것)으로 덮인다(zone.js:2898, 실측으로 확인). 그래서 접속 직후
//     `__e2e_give`(E2E_GIVE=1, **출발 존에만** 켬)로 준다.
const GIVE_ON_JOIN = process.env.GIVE_ON_JOIN !== '0';
const invLedger = new Map();          // botId → { first, firstZone, samples: [{zone, key}] }
function invKey(inv) {
  return Object.keys(inv || {}).sort().map((k) => `${k}:${inv[k]}`).join(',') || '(빈)';
}
// 핸드오프가 옮겨야 할 몸 전체를 한 줄로 — 인벤만 보면 도구·장비·숙련이 새는 걸 못 본다.
function stateKey(msg) {
  const inv  = invKey(msg.inventory);
  const tool = (msg.toolItems || []).map((t) => `${t.type}/${t.d}`).sort().join('+') || '-';
  const eq   = (msg.equipment || []).map((e) => e.type || e.id).sort().join('+') || '-';
  const skl  = Object.keys(msg.craftSkill || {}).sort().map((k) => `${k}:${msg.craftSkill[k]}`).join('+') || '-';
  return `inv[${inv}] tool[${tool}] equip[${eq}] skill[${skl}]`;
}
function recordInv(cli, msg) {
  const key = stateKey(msg);
  let L = invLedger.get(cli.id);
  if (!L) { L = { first: key, firstZone: cli.zoneId, samples: [] }; invLedger.set(cli.id, L); }
  L.samples.push({ zone: cli.zoneId, key,
                   hunger: msg.self && msg.self.hunger, thirst: msg.self && msg.self.thirst });
  stats.invSamples++;
  if (key !== L.first) stats.invMismatch++;
}
// 봇마다 **다른 바구니** — 두 봇의 짐이 섞이면(중복·교차) 한눈에 보인다.
function giveBasket(cli) {
  const n = cli.id + 1;
  try {
    cli.ws.send(JSON.stringify({ type: '__e2e_give',
      items: { pillar: n, thatch: 10 + n, stone: 20 + n },
      tools: ['axe', 'pickaxe'],
      quiet: true }));
    stats.givesSent++;
  } catch (e) {}
}

//   경계선은 통째로 육지가 아니다 — 한반도 동쪽 끝(x=69616)을 2048px 간격 63곳 찍어 보니
//   육지 29 · 막힘 34 였다(scripts/probe-edge.js). 그래서 **한 번 찍고 마는 게 아니라**
//   서버가 '🌊'로 거절하면 다른 위도로 다시 찍는다. 봇마다 시작 칸을 달리해 한 줄로 겹치지 않게 한다.
const TP_MAX_TRIES = parseInt(process.env.TP_MAX_TRIES || '40', 10);
const TP_LAT_STEP  = parseInt(process.env.TP_LAT_STEP  || '2048', 10);
// jitter 가 "띠 안"으로 인정하는 문턱. 서버 HANDOFF_COMMIT=256 의 절반 — 넉넉히 안쪽이면서
// 확실히 경계 밖이다(0 < outE ≤ 256 구간 한가운데).
const JITTER_ENTER = parseInt(process.env.JITTER_ENTER || '64', 10);
const JITTER_AMP   = parseInt(process.env.JITTER_AMP   || '100', 10);  // 경계선 ±이 폭 안에서만 진자 운동
const STUCK_MS = parseInt(process.env.STUCK_MS || '25000', 10);   // 이 시간 동안 진전 0이면 다른 위도로
function placeAtEdge(cli, goingEast) {
  const z = ZONES && ZONES[cli.zoneId];
  if (!z || !cli.alive) return;
  const w = z.zoneWidth || 70016, h = z.zoneHeight || 130016;
  const x = goingEast ? (w - EDGE_PAD) : EDGE_PAD;
  const lanes = Math.max(1, Math.floor((h - 2 * TP_LAT_STEP) / TP_LAT_STEP));
  const lane = ((cli.id * 7 + (cli.tpTries || 0)) % lanes);      // 봇마다 다른 시작 칸 · 거절될 때마다 한 칸 이동
  const y = TP_LAT_STEP + lane * TP_LAT_STEP;
  cli.tpPending = { x, y, goingEast };
  try { cli.ws.send(JSON.stringify({ type: 'teleport_debug', x, y })); stats.tpSent++; } catch (e) {}
}

function connectClient(id, transfer) {
  const zoneId = (transfer && transfer.zoneId) || START_ZONE;
  const zm = ZONES && ZONES[zoneId];
  const base = zm && zm.wsUrl ? zm.wsUrl : `ws://${HOST}:${PORT}`;
  const url = transfer && transfer.token
    ? `${base}/?handoff_token=${encodeURIComponent(transfer.token)}`
    : `${base}/?username=&name=bot${id}&color=%23a0a0a0`;
  const ws = new WebSocket(url);
  const cli = { id, ws, lastTickAt: 0, ticks: 0, alive: true, opened: false,
                zoneId, tpTries: 0, tpPending: null, placed: false, gave: false, pendingBaseline: false, state: null,
                myPid: null, x: null, inBand: false, bandMax: -Infinity, placedAt: 0,
                outE: 0, outESign: undefined, crossings: 0, jDir: 1,
                east: transfer && typeof transfer.east === 'boolean' ? transfer.east : DIR_EAST };
  clients.push(cli);

  ws.on('open', () => {
    stats.connected++; stats.everConnected++; cli.opened = true;
    if (MODE !== 'walk' && !transfer) setTimeout(() => placeAtEdge(cli, cli.east), 1500);
    cli.inputTimer = setInterval(() => {
      if (!cli.alive) return;
      // ★막힌 위도 감시 — 텔레포트가 성공해도 그 **동쪽 몇백 px 이 바다**면 영영 못 넘는다.
      //   일정 시간 아무 진전이 없으면(핸드오프도 띠 진입도 없음) 다음 위도로 옮겨 다시 시도한다.
      if (MODE !== 'walk' && cli.placed && !cli.inBand && cli.placedAt &&
          Date.now() - cli.placedAt > STUCK_MS) {
        cli.tpTries = (cli.tpTries || 0) + 1; cli.placedAt = Date.now();
        stats.stuckRetries++;
        placeAtEdge(cli, cli.east);
      }
      let vx, vy;
      if (MODE === 'handoff') {                 // 경계를 향해 직진 — 넘으면 반대로
        vx = cli.east ? 1 : -1; vy = 0;
      } else if (MODE === 'jitter') {
        // ★대조군의 요점: 히스테리시스의 주장은 "경계선을 **여러 번 넘나들어도** 핸드오프가
        //   안 난다"이다. 그러니 존 안쪽에서 흔들면 아무것도 증명 못 한다 —
        //   경계선(x = zoneWidth) 을 **가운데 두고** 진자처럼 왔다갔다 해야 한다.
        //   ① 경계를 처음 넘을 때까지 동쪽으로 민다
        //   ② 그 다음엔 outE 를 ±JITTER_AMP 안에서 되돌린다(진폭 < COMMIT 256 이라 핸드오프는 나면 안 된다)
        //   ③ outE 의 부호가 바뀔 때마다 "경계선 통과 1회"로 센다 — 이 횟수가 곧 시험의 강도다.
        if (!cli.inBand) { vx = 1; vy = 0; }
        else { vx = (cli.outE > JITTER_AMP) ? -1 : (cli.outE < -JITTER_AMP ? 1 : (cli.jDir || 1)); vy = 0; cli.jDir = vx; }
      } else {
        const ang = Math.random() * Math.PI * 2; vx = Math.cos(ang); vy = Math.sin(ang);
      }
      try { ws.send(JSON.stringify({ type: 'input', vx, vy })); stats.inputsSent++; } catch (e) {}
    }, 1000 / INPUT_HZ);
  });

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'welcome') {
      stats.welcomesReceived++;
      cli.myPid = msg.pid;
      if (MODE !== 'walk') {
        cli.state = { inventory: msg.inventory, toolItems: msg.toolItems,
                      equipment: msg.equipment, craftSkill: msg.craftSkill, self: msg.self };
        if (transfer) {
          recordInv(cli, cli.state);            // ★도착 welcome = 핸드오프가 옮겨 온 몸 그대로
        } else if (GIVE_ON_JOIN && !cli.gave) {
          cli.gave = true; cli.pendingBaseline = true;
          giveBasket(cli);                      // 응답은 inventory → tools 두 통. tools 를 받고 기준선을 잡는다.
        } else {
          recordInv(cli, cli.state);
        }
      }
      return;
    }
    if (MODE !== 'walk' && msg.type === 'inventory' && cli.state) {
      cli.state.inventory = msg.inventory; return;
    }
    if (MODE !== 'walk' && msg.type === 'tools' && cli.state) {
      cli.state.toolItems = msg.toolItems;
      if (cli.pendingBaseline) { cli.pendingBaseline = false; recordInv(cli, cli.state); }
      return;
    }
    if (msg.type === 'notice') {                 // teleport_debug 는 notice 로만 답한다
      const t = String(msg.text || '');
      if (t.indexOf('🌀') === 0) { stats.tpOk++; cli.placed = true; cli.placedAt = Date.now(); cli.tpPending = null; }
      else if (t.indexOf('🌊') === 0) {
        stats.tpBlocked++;
        const pend = cli.tpPending; cli.tpPending = null;
        cli.tpTries = (cli.tpTries || 0) + 1;
        if (pend && cli.tpTries < TP_MAX_TRIES) setTimeout(() => placeAtEdge(cli, pend.goingEast), 40);
      }
      return;
    }
    if (msg.type === 'handoff') {
      // ★서버가 발급한 토큰으로 대상 존에 재접속한다(클라 30-n-net.js 와 같은 규약).
      //   이 봇은 관전자 선연결을 안 하므로 항상 "새 ws" 경로다 — 그게 최악 경우라 측정에 맞다.
      stats.handoffsSeen++;
      cli.alive = false;
      if (cli.inputTimer) clearInterval(cli.inputTimer);
      try { ws.close(); } catch (e) {}
      cli.inBand = false;
      const nextEast = !cli.east;               // 넘었으면 반대 방향으로 되돌아온다
      try {
        const nc = connectClient(cli.id, { zoneId: msg.targetZone, token: msg.token, east: nextEast });
        stats.handoffReconnects++;
        // 새 존에서도 경계 옆에 서서 곧장 되넘는다
        setTimeout(() => placeAtEdge(nc, nextEast), 1500);
      } catch (e) { stats.handoffFailed++; }
      return;
    }
    if (msg.type !== 'tick') return;
    stats.ticksReceived++; cli.ticks++;
    if (MODE !== 'walk' && cli.myPid && Array.isArray(msg.players)) {
      for (const o of msg.players) {
        if (o.pid !== cli.myPid) continue;
        cli.x = o.x;
        const z = ZONES && ZONES[cli.zoneId];
        if (z) {
          // 겹침 띠 초과량 — 서버 판정(zone.js:8399)과 **같은 식**으로 센다. 사본이 아니라 같은 산수다.
          const outE = o.x - z.zoneWidth, outW = -o.x;
          const outMax = Math.max(outE, outW);
          if (outMax > (cli.bandMax || -Infinity)) cli.bandMax = outMax;
          if (outMax > stats.bandMax) stats.bandMax = outMax;
          // 띠 진입 = "이 위도는 실제로 경계를 넘을 수 있는 자리다"라는 유일한 증거 —
          // jitter 는 여기서 진동으로 바꾸고, handoff 는 막힌 위도 감시를 끈다. 두 모드가 같이 쓴다.
          if (!cli.inBand && outMax > JITTER_ENTER) cli.inBand = true;
          // 경계선 통과 계수 — outE 의 부호가 바뀐 순간(존 안 ↔ 겹침 띠)
          const prevSign = cli.outESign;
          const sign = outE > 0 ? 1 : (outE < 0 ? -1 : 0);
          if (cli.inBand && sign !== 0 && prevSign !== 0 && prevSign !== undefined && sign !== prevSign) {
            cli.crossings = (cli.crossings || 0) + 1; stats.lineCrossings++;
          }
          if (sign !== 0) cli.outESign = sign;
          cli.outE = outE;
        }
        break;
      }
    }
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
  return cli;
}

// 존이 여럿이면 존별로 긁는다 — 합치면 "어느 쪽에서 샜는지"가 사라진다.
async function scrapeAll(urls) {
  const out = {};
  for (const u of urls) out[u] = await scrape(u);
  return out;
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

  if (MODE !== 'walk') {
    // 핸드오프 대상 존의 wsUrl·크기는 central 이 정본이다(클라도 /zones 에서 받는다 — 사본 금지)
    ZONES = await new Promise((res) => {
      http.get(CENTRAL_URL + '/zones', { timeout: 5000 }, (m) => {
        let b = ''; m.on('data', (c) => b += c);
        m.on('end', () => { try { res(JSON.parse(b).zones || null); } catch (e) { res(null); } });
      }).on('error', () => res(null));
    });
    console.log(ZONES ? `존 메타 ${Object.keys(ZONES).length}개 수신 (MODE=${MODE})` : `⚠존 메타 수신 실패 — ${CENTRAL_URL}/zones`);
  }
  const metricsBefore = await scrapeAll(METRICS_URLS);
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
  const metricsAfter = await scrapeAll(METRICS_URLS);
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
    mode: MODE,
    handoff: { seen: stats.handoffsSeen, reconnects: stats.handoffReconnects, failed: stats.handoffFailed,
               teleport: { sent: stats.tpSent, ok: stats.tpOk, blockedByWater: stats.tpBlocked },
               band: { commitPx: 256, maxOutPx: isFinite(stats.bandMax) ? Math.round(stats.bandMax) : null,
                       inBandBots: clients.filter((c) => c.inBand).length, stuckRetries: stats.stuckRetries,
                       lineCrossings: stats.lineCrossings,
                       note: 'maxOutPx = 관측된 최대 경계 초과량. jitter 에서 이 값이 0~256 이고 핸드오프 0 이면 히스테리시스가 작동한 것이다.' },
               inventory: { samples: stats.invSamples, mismatched: stats.invMismatch,
                            perBot: Array.from(invLedger.entries()).map(([id, L]) => ({
                              bot: id, firstZone: L.firstZone, first: L.first,
                              path: L.samples.map((x) => `${x.zone}=${x.key}`) })) } },
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
  if (MODE !== 'walk') {
    console.log(`핸드오프        받음 ${stats.handoffsSeen} · 재접속 ${stats.handoffReconnects} · 실패 ${stats.handoffFailed}   (MODE=${MODE})`);
    console.log(`텔레포트        요청 ${stats.tpSent} · 성공 ${stats.tpOk} · 물막힘 ${stats.tpBlocked}`);
    console.log(`겹침 띠         최대 초과 ${isFinite(stats.bandMax) ? Math.round(stats.bandMax) : '-'}px (COMMIT 256) · 경계선 통과 ${stats.lineCrossings}회 · 다시세움 ${stats.stuckRetries}`);
    if (MODE === 'jitter') console.log(`히스테리시스    경계선을 ${stats.lineCrossings}회 넘나들며 핸드오프 ${stats.handoffsSeen}회  ${stats.lineCrossings > 0 && stats.handoffsSeen === 0 ? '✅ 핑퐁 없음' : (stats.lineCrossings === 0 ? '— 통과 표본 0(시험 성립 안 함)' : '❌ 핑퐁 발생')}`);
    console.log(`인벤 보존       표본 ${stats.invSamples} · 어긋남 ${stats.invMismatch}  ${stats.invMismatch ? '❌ 손실/중복' : (stats.invSamples ? '✅ 전부 동일' : '— 표본 없음')}`);
    for (const [u, m] of Object.entries(metricsAfter)) {
      const b = metricsBefore[u] || {};
      const d = (k) => (m && m[k] != null ? m[k] - (b[k] || 0) : null);
      console.log(`  ${u.replace(/^http:\/\//, '')}  out ${d('durango_handoffs_out_total')} · ack ${d('durango_handoff_acks_total')} · timeout ${d('durango_handoff_timeouts_total')}`);
    }
  }

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
